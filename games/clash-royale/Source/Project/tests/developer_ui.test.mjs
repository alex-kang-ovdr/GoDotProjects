import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game, CARDS } from '../dist/js/engine.js';
import { DeveloperPanel } from '../dist/js/devtools.js';

// Run the actual app control functions against a live Game. This checks action
// routing and displayed values; it deliberately does not claim browser layout QA.
const app = readFileSync(new URL('../dist/js/app.js', import.meta.url), 'utf8');
const names = ['isDeveloperGame', 'getControlTeam', 'currentCard', 'setControlTeam',
  'cancelSelection', 'selectCard', 'getSelectedCard', 'deploy', 'updateHand',
  'renderAbilities', 'activateSquadAbility', 'canUseCheats', 'renderWorkspace', 'renderHUD', 'formatTime', 'updateIntel'];
const functions = names.map(name => {
  const start = app.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const next = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, next < 0 ? undefined : next);
}).join('\n');

function node() {
  const classes = new Set(), children = new Map();
  return {
    textContent: '', innerHTML: '', hidden: false, disabled: false, dataset: {}, value: '',
    classList: { toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }, add(key) { classes.add(key); }, remove(key) { classes.delete(key); } },
    style: { setProperty() {} }, attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
    querySelectorAll() { return []; }, replaceChildren(...items) { this.children = items; }, append() {},
  };
}

function harness(game) {
  const nodes = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const state = {
    Game, CARDS, game, $, document: { body: node(), activeElement: null, createElement: node, querySelector: $ },
    controlTeam: 'player', selectedDeveloperCard: null, selectedIndex: null, pointer: null, drag: null, intelCardId: 'knight',
    abilityGroupId: null, abilitySignature: '', handSignature: '', selectedEntityId: null, selectedEntityGame: null,
    hoveredEntityId: null, inspectorMessage: '', started: true, resultShown: false, training: null, replay: null,
    practice: game.practice, practiceAI: false, practiceSpeed: 1, countdownRemaining: 0, countingDown: false,
    desktopTools: { matches: true }, lastRate: 1, lastCrowns: 0, lastPhase: 'regulation', lastLogSignature: '',
    updateIntel() {}, updateReplayUI() {}, updateTrainingUI() {}, tone() {}, announce() {}, toast() {},
    saveMatch() {}, setInspectMode() {}, resetInspection() {}, inspectTarget() { return null; },
    cardIcon: id => `<svg data-card="${id}"></svg>`, developerPanel: { render() {} },
  };
  const context = vm.createContext(state);
  vm.runInContext(functions, context);
  return { context, $ };
}

const devGame = () => new Game({ practice: true, developerMode: true, seed: 4401 });
const run = (context, source) => vm.runInContext(source, context);

test('developer team switching routes the actual HUD and hand costs while inspector columns stay player/enemy', () => {
  const game = devGame(); game.start(); game.state.elixir.player = 2; game.state.elixir.enemy = 7;
  const enemyCard = game.state.hands.enemy[0];
  assert.equal(game.setCardBalance(enemyCard, { cost: 1 }, { team: 'enemy', applyExisting: true }).ok, true);
  assert.equal(game.setCardBalance('knight', { hp: 5000 }, { team: 'player', applyExisting: true }).ok, true);
  const { context, $ } = harness(game);
  run(context, "updateIntel('knight')"); assert.match($('intel-stats').innerHTML, /5000/);
  run(context, "setControlTeam('enemy')");
  assert.match($('intel-stats').innerHTML, /1000/); assert.doesNotMatch($('intel-stats').innerHTML, /5000/);
  assert.equal($('elixir-value').textContent, 7);
  assert.equal($('mobile-game').dataset.controlTeam, 'enemy');
  assert.match($('phase-label').textContent, /적군/);
  assert.match($('hand').innerHTML, new RegExp(`적군 1번 ${CARDS[enemyCard].name}, 엘릭서 1`));
  assert.match($('live-stats-body').innerHTML, /<th scope="row">엘릭서<\/th><td>2\.0<\/td><td>7\.0<\/td>/);
  game.setDeveloperCheats({ infiniteElixir: { enemy: true } });
  run(context, 'renderHUD()'); assert.equal($('elixir-value').textContent, '∞');
  run(context, "setControlTeam('player')"); assert.equal($('elixir-value').textContent, 2);
});

test('direct placement can repeatedly spawn either team and ordinary hand selection clears the direct tool', () => {
  const game = devGame(); game.start(); game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } });
  const { context } = harness(game);
  const hands = JSON.stringify(game.state.hands);
  context.controlTeam = 'enemy'; context.selectedDeveloperCard = 'knight';
  run(context, 'deploy(360, 210)');
  assert.equal(game.state.units.filter(unit => unit.team === 'enemy' && unit.cardId === 'knight').length, 1);
  assert.equal(context.selectedDeveloperCard, 'knight', 'direct tool stays selected for repeated placement');
  run(context, 'deploy(280, 210)');
  assert.equal(game.state.units.filter(unit => unit.team === 'enemy' && unit.cardId === 'knight').length, 2);
  assert.equal(JSON.stringify(game.state.hands), hands);
  run(context, "setControlTeam('player'); selectCard(0)");
  assert.equal(context.selectedDeveloperCard, null);
  assert.equal(run(context, 'getSelectedCard().id'), game.state.hands.player[0]);
  const before = game.commands.length;
  run(context, 'deploy(120, 430)');
  assert.equal(game.commands.length, before + 1);
  assert.equal(game.commands.at(-1).team, 'player');
  assert.equal(game.commands.at(-1).type, undefined);
  assert.equal(context.selectedIndex, null);
});

test('ability input follows the selected enemy squad instead of a remembered player squad', () => {
  const game = devGame(); game.start(); game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } });
  const player = game.spawnDeveloperCard('player', 'phalanx', 120, 430);
  const enemy = game.spawnDeveloperCard('enemy', 'phalanx', 360, 210);
  assert.equal(player.ok, true); assert.equal(enemy.ok, true);
  for (let i = 0; i < 80; i++) game.update(1 / 60);
  const { context } = harness(game);
  context.controlTeam = 'enemy'; context.abilityGroupId = player.groupId;
  context.selectedEntityId = game.getAbilities('enemy')[0].memberIds[0];
  run(context, 'activateSquadAbility()');
  assert.equal(game.getAbilities('enemy')[0].mode, 'charge');
  assert.notEqual(game.getAbilities('player')[0].mode, 'charge');
  assert.equal(game.commands.at(-1).groupId, enemy.groupId);
});

test('a normal battle keeps player control and hides all ability to enter enemy direct control', () => {
  const game = new Game({ seed: 18 }); game.start();
  const { context } = harness(game); context.controlTeam = 'enemy';
  assert.equal(run(context, 'getControlTeam()'), 'player');
  run(context, "setControlTeam('enemy'); selectCard(0)");
  assert.equal(run(context, 'getSelectedCard().id'), game.state.hands.player[0]);
});

test('live percentage input uses the selected team, keeps invalid edits atomic, and leaves the other team unchanged', () => {
  const game = devGame(); game.start();
  const panel = Object.create(DeveloperPanel.prototype);
  Object.assign(panel, { cards: CARDS, fields: game.getBalanceFields('phalanx'), cardId: 'phalanx', scope: 'enemy',
    getGame: () => game, syncFields() {}, onChange() {}, render() {}, message() {} });
  const input = value => ({ matches: () => true, dataset: { balanceKey: 'damageReduction' }, value, validity: { valid: true } });
  panel.applyInput(input('80'));
  assert.equal(game.getCard('phalanx', 'enemy').damageReduction, .8);
  assert.equal(game.getCard('phalanx', 'player').damageReduction, .7);
  const snapshot = game.exportSnapshot();
  panel.applyInput(input('101')); panel.applyInput(input('')); panel.applyInput(input('NaN'));
  assert.deepEqual(game.exportSnapshot(), snapshot);
});
