import { Game, CARDS } from './engine.js';

export const FIXED_STEP = 1 / 60;
const MAX_TICKS = 18010;
const clone = value => JSON.parse(JSON.stringify(value));

/** A replay consumes accepted inputs; the opponent AI is never run a second time. */
export class ReplayPlayer {
  constructor(record) {
    if (record?.config?.developerMode === true || record?.developer !== undefined) {
      throw new Error('개발자 테스트는 리플레이로 재생할 수 없습니다. 저장한 테스트 이어하기를 사용하세요.');
    }
    if (!record || record.version !== 2 || !Number.isFinite(record.step) || Math.abs(record.step - FIXED_STEP) > 1e-10 ||
        !record.config || typeof record.config !== 'object' || !Object.hasOwn(record.config, 'seed') ||
        !Number.isInteger(record.finalTick) || record.finalTick < 0 || record.finalTick > MAX_TICKS ||
        ![null, 'player', 'enemy', 'draw'].includes(record.winner) ||
        !Array.isArray(record.commands) || record.commands.length > 2000) {
      throw new Error('지원하지 않는 리플레이입니다.');
    }
    if (record.endAction !== undefined) {
      const action = record.endAction;
      if (!action || action.type !== 'concede' || !['player', 'enemy'].includes(action.team) ||
          !Number.isInteger(action.tick) || action.tick !== record.finalTick ||
          record.winner !== (action.team === 'player' ? 'enemy' : 'player')) {
        throw new Error('리플레이 항복 기록이 올바르지 않습니다.');
      }
    }
    let previous = -1;
    const squads = new Map();
    for (const command of record.commands) {
      if (!command || !Number.isInteger(command.tick) || command.tick < 0 || command.tick < previous || command.tick > record.finalTick ||
          (command.tick === record.finalTick && record.winner !== null && record.endAction === undefined) ||
          !['player', 'enemy'].includes(command.team)) {
        throw new Error('리플레이 입력 데이터가 올바르지 않습니다.');
      }
      if (command.type === 'ability') {
        if (![3, 4].includes(record.config.rulesVersion) || command.cardId !== 'phalanx' || command.abilityId !== 'shield_charge' ||
          squads.get(command.groupId) !== command.team) throw new Error('리플레이 스킬 입력이 올바르지 않습니다.');
      } else if (command.type !== undefined || !Number.isInteger(command.handIndex) || command.handIndex < 0 || command.handIndex > 3 ||
        typeof command.cardId !== 'string' || !Object.hasOwn(CARDS, command.cardId) || !Number.isFinite(command.x) || !Number.isFinite(command.y) ||
        command.x < 0 || command.x > 480 || command.y < 0 || command.y > 640) throw new Error('리플레이 카드 입력이 올바르지 않습니다.');
      if (command.type !== 'ability' && command.cardId === 'phalanx') {
        if (![3, 4].includes(record.config.rulesVersion) || typeof command.groupId !== 'string' || !/^g\d{1,9}$/.test(command.groupId) ||
            squads.has(command.groupId)) throw new Error('리플레이 분대 소환 입력이 올바르지 않습니다.');
        squads.set(command.groupId, command.team);
      }
      previous = command.tick;
    }
    if (record.result !== undefined) {
      const r = record.result;
      const bounded = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
      const ids = ['enemy-left', 'enemy-right', 'enemy-king', 'player-left', 'player-right', 'player-king'];
      if (!r || r.winner !== record.winner || typeof r.reason !== 'string' || r.reason.length > 80 ||
          (record.endAction !== undefined ? r.reason !== 'concede' : r.reason === 'concede') ||
          !r.crowns || ['player', 'enemy'].some(t => !Number.isInteger(r.crowns[t]) || !bounded(r.crowns[t], 3)) ||
          !Array.isArray(r.towerHp) || r.towerHp.length !== 6 || new Set(r.towerHp.map(t => t?.id)).size !== 6 ||
          r.towerHp.some(t => !t || !ids.includes(t.id) || !bounded(t.hp, 100000)) ||
          !r.damageDealt || ['player', 'enemy'].some(t => !bounded(r.damageDealt[t], 1e9))) {
        throw new Error('리플레이 결과 데이터가 올바르지 않습니다.');
      }
    }
    this.record = clone(record);
    this.reset();
  }

  reset() {
    this.game = new Game({ ...this.record.config, rulesVersion: this.record.config.rulesVersion ?? 2 });
    this.game._replaying = true;
    this.game.start();
    this.cursor = 0;
    this.done = false;
    if (this.record.finalTick === 0) this._complete();
  }

  step() {
    if (this.done) return false;
    this._applyCommandsAtCurrentTick();
    this.game.update(FIXED_STEP);
    if (this.game.state.tick >= this.record.finalTick || this.game.state.phase === 'finished') this._complete();
    return !this.done;
  }

  _applyCommandsAtCurrentTick() {
    const tick = this.game.state.tick;
    while (this.cursor < this.record.commands.length && this.record.commands[this.cursor].tick === tick) {
      const c = this.record.commands[this.cursor++];
      if (c.type === 'ability') {
        if (!this.game._activateAbility(c.team, c.groupId, true).ok) throw new Error('리플레이 스킬 사용이 원본 경기와 일치하지 않습니다.');
        continue;
      }
      if (this.game.state.hands[c.team][c.handIndex] !== c.cardId) throw new Error('리플레이 카드 순서가 일치하지 않습니다.');
      const result = this.game.playCard(c.team, c.handIndex, c.x, c.y);
      if (!result.ok) throw new Error('리플레이 배치가 원본 경기와 일치하지 않습니다.');
      if (c.cardId === 'phalanx' && result.groupId !== c.groupId) throw new Error('리플레이의 소환 분대가 원본 경기와 일치하지 않습니다.');
    }
  }

  _complete() {
    if (this.game.state.tick !== this.record.finalTick) {
      throw new Error('리플레이의 종료 시각 또는 승패가 원본과 일치하지 않습니다.');
    }
    // Inputs accepted at the final boundary have not consumed a simulation tick
    // yet. Reproduce them before a concession or an unfinished record's end.
    this._applyCommandsAtCurrentTick();
    if (this.record.endAction) {
      const result = this.game.concede(this.record.endAction.team);
      if (!result.ok) throw new Error('리플레이의 항복 시점이 원본 경기와 일치하지 않습니다.');
    }
    this._verifyEnd();
    this.done = true;
  }

  _verifyEnd() {
    const s = this.game.state, r = this.record.result;
    if (s.tick !== this.record.finalTick || this.cursor !== this.record.commands.length || s.winner !== this.record.winner) {
      throw new Error('리플레이의 종료 시각 또는 승패가 원본과 일치하지 않습니다.');
    }
    if (r && (s.reason !== r.reason || ['player', 'enemy'].some(t => s.crowns[t] !== r.crowns[t] ||
      Math.abs(s.stats[t].damageDealt - r.damageDealt[t]) > 1e-7) ||
      r.towerHp.some(t => Math.abs(s.towers.find(v => v.id === t.id).hp - t.hp) > 1e-7))) {
      throw new Error('리플레이의 타워 체력 또는 피해 결과가 원본과 일치하지 않습니다.');
    }
  }

  seek(seconds) {
    const time = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
    const target = Math.max(0, Math.min(this.record.finalTick, Math.round(time / FIXED_STEP)));
    if (target < this.game.state.tick || this.done) this.reset();
    while (!this.done && this.game.state.tick < target) this.step();
    return this.game;
  }

  get duration() { return this.record.finalTick * FIXED_STEP; }
}

/** Small battle report derived from the recorded inputs, not from guessed player skill. */
export function summarizeBattle(game) {
  const s = game.state;
  const commands = game.commands || [];
  const own = commands.filter(c => c.team === 'player' && c.type !== 'ability');
  const abilities = commands.filter(c => c.team === 'player' && c.type === 'ability');
  const recordedCost = (command, ability = false) => game.initialConfig?.developerMode && Number.isFinite(command.cost)
    ? command.cost : (ability ? CARDS[command.cardId]?.abilityCost : CARDS[command.cardId]?.cost) || 0;
  const abilityElixirSpent = abilities.reduce((total, c) => total + recordedCost(c, true), 0);
  const counts = {};
  for (const c of own) counts[c.cardId] = (counts[c.cardId] || 0) + 1;
  const mostPlayed = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const left = own.filter(c => CARDS[c.cardId]?.type !== 'spell' && c.x < 240).length;
  const right = own.filter(c => CARDS[c.cardId]?.type !== 'spell' && c.x >= 240).length;
  const spells = own.filter(c => CARDS[c.cardId]?.type === 'spell').length;
  const byCard = Object.entries(counts).map(([id, count]) => ({ id, count,
    spent: own.filter(command => command.cardId === id).reduce((total, command) => total + recordedCost(command), 0) }))
    .sort((a, b) => b.spent - a.spent || b.count - a.count || a.id.localeCompare(b.id));
  const elixirSpent = s.stats.player.elixirSpent;
  const generated = (Math.min(s.time, 120) + Math.max(0, Math.min(s.time, 240) - 120) * 2 + Math.max(0, s.time - 240) * 3) / 2.8;
  const elixirLeak = game.practice ? null : Math.max(0, Math.round((5 + generated - elixirSpent - s.elixir.player) * 10) / 10);
  let tip = '리플레이에서 공격 직전의 손패와 수비에 남긴 엘릭서를 확인해 보세요.';
  if (!own.length) tip = '카드를 선택하고 아군 진영을 눌러 배치하세요. 연습 모드에서 조작부터 익힐 수 있습니다.';
  else if (elixirLeak > 15) tip = `엘릭서 상한 때문에 약 ${elixirLeak.toFixed(1)}의 자원을 더 얻지 못했습니다. 수비 자원을 남기되, 10이 되기 전에 후방 배치를 검토해 보세요.`;
  else if (s.winner === 'player') tip = '이긴 레인의 지원 병력 배치 순서를 리플레이에서 다시 확인해 보세요.';
  else if (spells > own.length * .5) tip = '이번에는 주문 비중이 높았습니다. 건물을 공격할 병력을 먼저 전진시킨 뒤 주문을 지원해 보세요.';
  else if (left === 0 || right === 0) tip = '병력이 한 레인에 집중됐습니다. 상대가 크게 투자한 반대쪽 레인도 공격 후보로 확인해 보세요.';
  return { mostPlayed: mostPlayed ? { id: mostPlayed[0], count: mostPlayed[1] } : null,
    left, right, spells, cards: own.length, tip, byCard, elixirSpent, elixirLeak,
    abilities: abilities.length, abilityElixirSpent, averageCost: own.length ? (elixirSpent - abilityElixirSpent) / own.length : 0 };
}

function replayDisplayMetadata(record) {
  return {
    ...(['grove', 'dusk', 'frost'].includes(record.arenaTheme) ? { arenaTheme: record.arenaTheme } : {}),
    ...(typeof record.stageId === 'string' && /^stage-[1-6]$/.test(record.stageId) ? { stageId: record.stageId } : {}),
  };
}

/** Portable records retain bounded display context without importing arbitrary metadata. */
export function serializeReplayFile(record) {
  new ReplayPlayer(record?.replay);
  return JSON.stringify({ format: 'crownfall-replay', version: 1, replay: record.replay,
    opponentId: ['bran', 'luna', 'sera'].includes(record.opponentId) ? record.opponentId : 'bran',
    ...replayDisplayMetadata(record) }, null, 2);
}

export function parseReplayFile(text) {
  if (typeof text !== 'string' || text.length > 1000000) throw new Error('리플레이 파일은 1MB 이하여야 합니다.');
  let record;
  try { record = JSON.parse(text); } catch { throw new Error('올바른 JSON 리플레이 파일이 아닙니다.'); }
  if (!record || record.format !== 'crownfall-replay' || record.version !== 1) throw new Error('Crownfall 리플레이 파일을 선택해 주세요.');
  new ReplayPlayer(record.replay);
  return { replay: record.replay, opponentId: ['bran', 'luna', 'sera'].includes(record.opponentId) ? record.opponentId : 'bran',
    ...replayDisplayMetadata(record) };
}
