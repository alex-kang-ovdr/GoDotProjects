'use strict';

// Fires, damaged HP, depleted material and generous upgrade budgets are explicit
// boundary fixtures. Work, routing, delivery, spending and saving use public API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, PARTS } = require('../dist/sim.js');
const legacyV2 = require('./fixtures/legacy-v2.cjs');
const DT = 1 / 60, EPS = 1e-7;

function ok(result, context) {
  assert.equal(result?.ok, true, context + ': ' + (result?.message || 'no result'));
  assert.ok(result.message, context + ' gives feedback');
}
function rejected(result, context) {
  assert.equal(result?.ok, false, context + ' must be rejected');
  assert.ok(result.message, context + ' explains why');
}
const snapshot = game => structuredClone(game.exportSave());
function gameplay(game) {
  const data = snapshot(game);
  delete data.log;
  return data;
}
function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) game.update(DT);
}
function until(game, predicate, seconds = 20) {
  for (let i = 0; i < Math.ceil(seconds / DT) && !predicate(game); i++) game.update(DT);
  assert.ok(predicate(game), 'condition reached within ' + seconds + ' simulated seconds');
}
function ammo(ship) {
  return ship.parts.reduce((n, p) => n + p.ammo, 0)
    + ship.crew.reduce((n, c) => n + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
}
function serviceFixture(kind, policy = 'survival') {
  const game = new Game();
  const target = game.player.parts.find(p => p.type === 'armor');
  // This bow armor has an accessible adjacent work site, several walking
  // steps away from the initial crew quarters.
  target.hp = target.maxHp * 0.55;
  target.fire = kind === 'extinguish' ? 0.6 : 0;
  ok(game.setRepairPolicy(policy), 'select maintenance policy');
  ok(game.setServiceTarget(target.id), 'designate a real reachable work site');
  return { game, target };
}
function serviceCrew(game, kind) {
  return game.player.crew.filter(c => c.job?.phase === 'service' && (!kind || c.job.kind === kind));
}

for (const [label, fixture] of Object.entries(legacyV2)) {
  test('released v2 ' + label + ' save migrates without losing its paid progress or combat state', () => {
    const game = new Game();
    ok(game.importSave(structuredClone(fixture)), 'load frozen released v2 state');
    assert.equal(game.mode, fixture.mode);
    assert.equal(game.sector, fixture.sector);
    assert.equal(game.credits, fixture.credits);
    assert.equal(game.contractId, fixture.contractId);
    assert.equal(game.tactic, fixture.tactic);
    assert.equal(game.targetPriority, fixture.targetPriority);
    assert.deepEqual(
      game.player.parts.map(p => [p.id, p.type, p.x, p.y, p.rot, p.hp, p.power, p.ammo]),
      fixture.player.parts.map(p => [p.id, p.type, p.x, p.y, p.rot, p.hp, p.power, p.ammo])
    );
    assert.equal(ammo(game.player), ammo(fixture.player));
    assert.equal(game.player.crew.length, fixture.player.crew.length);
    assert.deepEqual(game.projectiles, fixture.projectiles);
    assert.deepEqual(game.upgrades, { reactor: 0, logistics: 0, drive: 0 });
    assert.equal(game.repairPolicy, 'balanced');
    assert.equal(game.player.repairStock, 80);
    assert.ok(game.player.parts.every(p => p.fire === 0), 'migration does not invent old fires');
    if (label === 'claimedVictory') {
      rejected(game.salvage(), 'old claimed reward cannot be granted again');
      assert.equal(game.credits, fixture.credits);
      ok(game.returnToDock(), 'continue the old victorious campaign');
      assert.equal(game.sector, fixture.sector + 1);
    } else {
      if (game.mode === 'dock') ok(game.launch(), 'launch the paid refitted v2 ship');
      advance(game, 1);
      assert.ok(game.time > fixture.time);
    }
    const second = new Game();
    ok(second.importSave(game.exportSave()), 'save the migrated game as v3 and reload it');
    assert.equal(second.credits, game.credits);
    assert.equal(second.sector, game.sector);
  });
}

test('an unattended fire deals lasting damage and can spread to an adjacent module', () => {
  const game = new Game();
  for (const bunk of [...game.player.parts.filter(p => p.type === 'bunk')]) ok(game.erase(bunk.x, bunk.y), 'remove firefighters for the unattended control');
  assert.equal(game.player.crew.length, 0);
  const source = game.player.parts.find(p => p.type === 'armor');
  source.fire = 0.9;
  const hp = source.hp;
  const neighbors = game.player.parts.filter(p => Math.abs(p.x - source.x) + Math.abs(p.y - source.y) === 1);
  assert.ok(neighbors.length > 0);
  advance(game, 1);
  assert.ok(source.hp < hp, 'fire causes HP loss without another incoming hit');
  const afterFirstSecond = source.hp;
  until(game, () => neighbors.some(p => p.fire > 0), 45);
  assert.ok(source.hp < afterFirstSecond, 'damage persists while the original fire remains active');
  assert.ok(game.player.parts.every(p => Number.isFinite(p.fire) && p.fire >= 0 && p.fire <= 1));
});

test('a firefighter walks to the work site and extinguishes a fire without spending repair stock', () => {
  const { game, target } = serviceFixture('extinguish', 'supply');
  const stock = game.player.repairStock, initialFire = target.fire;
  advance(game, 0.1);
  assert.ok(target.fire >= initialFire, 'the remote fire is not extinguished before anyone arrives');
  assert.equal(game.player.repairStock, stock);
  until(game, () => serviceCrew(game, 'extinguish').some(c => c.job.targetId === target.id && c.job.effectAmount > 0), 10);
  const worker = serviceCrew(game, 'extinguish').find(c => c.job.targetId === target.id && c.job.effectAmount > 0);
  assert.ok(Math.hypot(worker.x - worker.job.site.x, worker.y - worker.job.site.y) < 0.001, 'the worker is physically at the work site');
  assert.ok(Math.abs(worker.job.site.x - target.x) + Math.abs(worker.job.site.y - target.y) <= 1);
  until(game, () => target.fire === 0, 15);
  assert.equal(game.player.repairStock, stock, 'firefighting itself is material-free');
  assert.equal(game.metrics.hullRepaired, 0, 'manual priority does not override supply policy disabling repair');
  assert.ok(game.metrics.firesExtinguished >= 1);
});

test('field repair heals only after arrival and charges the shared material stock for actual recovered HP', () => {
  const { game, target } = serviceFixture('repair');
  const hp = target.hp, stock = game.player.repairStock;
  advance(game, 0.1);
  assert.equal(target.hp, hp, 'selecting a distant module is not instant healing');
  assert.equal(game.player.repairStock, stock);
  until(game, () => target.hp > hp, 10);
  const worker = serviceCrew(game, 'repair').find(c => c.job.targetId === target.id);
  assert.ok(worker, 'an actual crew member performs the repair');
  assert.ok(Math.hypot(worker.x - worker.job.site.x, worker.y - worker.job.site.y) < 0.001);
  assert.ok(Math.abs((stock - game.player.repairStock) * 4 - (target.hp - hp)) < EPS);
  advance(game, 4);
  assert.ok(target.hp <= target.maxHp && game.player.repairStock >= 0);
  assert.ok(Math.abs((stock - game.player.repairStock) * 4 - game.metrics.hullRepaired) < EPS);
  assert.ok(Math.abs(game.metrics.repairStockUsed - (stock - game.player.repairStock)) < EPS);
});

test('structural attachment through armor is insufficient for a crew repair path', () => {
  const game = new Game();
  ok(game.place('armor', -4, -3), 'build an exterior armor bridge');
  ok(game.place('reactor', -5, -3), 'attach an isolated walkable module beyond it');
  const target = game.player.parts.find(p => p.x === -5 && p.y === -3);
  assert.equal(target.connected, true, 'the target is structurally attached');
  target.hp *= 0.55;
  const before = snapshot(game);
  rejected(game.setServiceTarget(target.id), 'a worker cannot reach the target or an adjacent work site');
  assert.deepEqual(snapshot(game), before, 'failed targeting leaves the current task state alone');
  advance(game, 15);
  assert.equal(target.hp, before.player.parts.find(p => p.id === target.id).hp, 'automatic repair does not cross the armor wall either');
  assert.equal(game.player.repairStock, before.player.repairStock);
  assert.equal(game.player.crew.some(c => c.job?.targetId === target.id), false);
});

test('finite materials bound healing and field repair never reconstructs a destroyed module', () => {
  const { game, target } = serviceFixture('repair');
  game.player.repairStock = 0.75;
  const hp = target.hp;
  until(game, () => game.player.repairStock <= EPS, 10);
  assert.ok(game.player.repairStock >= 0);
  assert.ok(target.hp > hp && target.hp <= hp + 3 + EPS, 'three HP is the most the available material can restore');
  const stopped = target.hp;
  advance(game, 3);
  assert.equal(target.hp, stopped, 'zero material stops further repair');
  const data = game.exportSave();
  const wreck = data.player.parts.find(p => p.type === 'armor' && p.id !== target.id);
  wreck.hp = 0;
  wreck.fire = 0;
  ok(game.importSave(data), 'prepare an already-destroyed armor module');
  game.player.repairStock = 80;
  rejected(game.setServiceTarget(wreck.id), 'destroyed modules require dock reconstruction');
  advance(game, 4);
  assert.equal(game.player.parts.find(p => p.id === wreck.id)?.hp || 0, 0);
});

test('maintenance policies change the actual competition between repairs and delivery crew', () => {
  const games = Object.fromEntries(['balanced', 'survival', 'supply'].map(policy => {
    const game = new Game();
    for (const target of game.player.parts.filter(p => p.type === 'armor').slice(0, 8)) target.hp *= 0.5;
    // Persistent real demand makes the cost of assigning repair crew visible.
    for (const p of game.player.parts) if (PARTS[p.type].powerCapacity && p.type !== 'reactor') p.power = 0;
    ok(game.setRepairPolicy(policy), 'select ' + policy);
    advance(game, 5);
    return [policy, game];
  }));
  assert.ok(games.survival.metrics.hullRepaired > games.balanced.metrics.hullRepaired, 'survival uses more workers for actual healing');
  assert.ok(games.balanced.metrics.hullRepaired > 0);
  assert.equal(games.supply.metrics.hullRepaired, 0);
  assert.equal(serviceCrew(games.supply, 'repair').length, 0);
  assert.ok(games.supply.metrics.powerDelivered > games.survival.metrics.powerDelivered, 'preserving supply crew produces more deliveries');
  const before = snapshot(games.supply);
  rejected(games.supply.setRepairPolicy('unknown'), 'invalid maintenance policy');
  assert.deepEqual(snapshot(games.supply), before);
});

test('material purchases match their quote, accept a partial final bundle and reject unpaid or in-flight changes', () => {
  const game = new Game();
  const quoted = game.getStats(), credits = game.credits, initial = game.player.repairStock;
  ok(game.buyRepairSupplies(), 'buy a standard material bundle');
  assert.equal(game.credits, credits - quoted.repairSupplyCost);
  assert.equal(game.player.repairStock, initial + quoted.repairSupplyAmount);
  game.player.repairStock = 237.25; // Reached naturally by fractional HP repairs.
  const partial = game.getStats(), beforePartial = game.credits;
  assert.equal(partial.repairSupplyAmount, 2.75);
  ok(game.buyRepairSupplies(), 'buy only the remaining capacity');
  assert.equal(game.player.repairStock, partial.repairStockMax);
  assert.equal(game.credits, beforePartial - Math.ceil(partial.repairSupplyAmount * 2));
  const full = snapshot(game);
  rejected(game.buyRepairSupplies(), 'buy beyond full material storage');
  assert.deepEqual(snapshot(game), full);
  game.player.repairStock = 0;
  game.credits = 0;
  const empty = snapshot(game);
  rejected(game.buyRepairSupplies(), 'buy without funds');
  assert.deepEqual(snapshot(game), empty);
  ok(game.launch(), 'launch with no repair supplies');
  const battle = snapshot(game);
  rejected(game.buyRepairSupplies(), 'buy material during battle');
  assert.deepEqual(snapshot(game), battle);
});

test('v3 saves preserve service jobs both while travelling and during real repair or firefighting', () => {
  for (const kind of ['repair', 'extinguish']) {
    const { game } = serviceFixture(kind, kind === 'repair' ? 'survival' : 'supply');
    until(game, () => serviceCrew(game, kind).some(c => c.job.pathIndex < c.job.path.length), 10);
    for (const phase of ['travelling', 'working']) {
      if (phase === 'working') until(game, () => serviceCrew(game, kind).some(c => c.job.effectAmount > 0), 10);
      const restored = new Game();
      ok(restored.importSave(game.exportSave()), 'load ' + kind + ' while ' + phase);
      assert.deepEqual(gameplay(restored), gameplay(game), 'service progress, path, target, stock and policy survive');
      advance(restored, 1);
      advance(game, 1);
      assert.deepEqual(gameplay(restored), gameplay(game), 'loading does not change the next second of work');
    }
  }
});

test('malformed v3 fire, material, upgrade and service-job data are rejected without partial mutation', () => {
  const { game } = serviceFixture('repair');
  until(game, () => serviceCrew(game, 'repair').some(c => c.job.effectAmount > 0), 10);
  const valid = snapshot(game);
  const worker = data => data.player.crew.find(c => c.job?.kind === 'repair');
  const cases = [
    ['negative fire', d => { d.player.parts[0].fire = -0.1; }],
    ['over-capacity fire', d => { d.player.parts[0].fire = 1.1; }],
    ['non-finite fire', d => { d.player.parts[0].fire = Infinity; }],
    ['negative material', d => { d.player.repairStock = -1; }],
    ['over-capacity material', d => { d.player.repairStock = 241; }],
    ['unknown repair policy', d => { d.repairPolicy = 'unknown'; }],
    ['excess upgrade level', d => { d.upgrades.drive = 4; }],
    ['fractional upgrade level', d => { d.upgrades.logistics = 1.5; }],
    ['missing priority target', d => { d.serviceTargetId = 'part_99999999'; }],
    ['remote work site', d => { worker(d).job.site = { x: 10, y: 10 }; }],
    ['service transporting cargo', d => { worker(d).cargo = 'ammo'; worker(d).cargoAmount = 4; }],
    ['service source', d => { worker(d).job.sourceId = d.player.parts[0].id; }],
    ['service resource amount', d => { worker(d).job.amount = 6; }],
    ['invalid work progress', d => { worker(d).job.work = 2; }]
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(valid), before = snapshot(game);
    mutate(invalid);
    rejected(game.importSave(invalid), label);
    assert.deepEqual(snapshot(game), before, label + ' leaves every exported field unchanged');
  }
});

test('technology purchases charge each displayed level once, cap at three, and require dock access and funds', () => {
  const game = new Game();
  game.credits = 10000; // Budget boundary fixture, not the campaign completion path.
  const ids = game.getUpgrades().map(u => u.id).sort();
  assert.deepEqual(ids, ['drive', 'logistics', 'reactor']);
  for (const id of ids) {
    for (let level = 1; level <= 3; level++) {
      const quote = game.getUpgrades().find(u => u.id === id), credits = game.credits;
      ok(game.purchaseUpgrade(id), 'buy ' + id + ' level ' + level);
      assert.equal(game.upgrades[id], level);
      assert.equal(game.credits, credits - quote.cost);
    }
    const capped = snapshot(game);
    rejected(game.purchaseUpgrade(id), 'purchase beyond maximum level');
    assert.deepEqual(snapshot(game), capped);
  }
  const restored = new Game();
  ok(restored.importSave(game.exportSave()), 'load purchased technology');
  assert.deepEqual(restored.upgrades, game.upgrades);
  const poor = new Game();
  poor.credits = 0;
  const noMoney = snapshot(poor);
  rejected(poor.purchaseUpgrade('reactor'), 'purchase with no money');
  rejected(poor.purchaseUpgrade('unknown'), 'purchase an unknown technology');
  assert.deepEqual(snapshot(poor), noMoney);
  ok(poor.launch(), 'launch before attempting an in-flight purchase');
  const battle = snapshot(poor);
  rejected(poor.purchaseUpgrade('drive'), 'purchase during battle');
  assert.deepEqual(snapshot(poor), battle);
  ok(restored.reset(), 'start a new expedition');
  assert.deepEqual(restored.upgrades, { reactor: 0, logistics: 0, drive: 0 });
});

test('reactor technology increases actual generated energy rather than only its displayed percentage', () => {
  const base = new Game(), upgraded = new Game();
  ok(upgraded.purchaseUpgrade('reactor'), 'improve reactor generation');
  for (const game of [base, upgraded]) {
    for (const bunk of [...game.player.parts.filter(p => p.type === 'bunk')]) ok(game.erase(bunk.x, bunk.y), 'isolate production from delivery consumption');
    for (const p of game.player.parts.filter(p => p.type === 'reactor')) p.power = 0;
    advance(game, 2);
  }
  const stored = game => game.player.parts.filter(p => p.type === 'reactor').reduce((n, p) => n + p.power, 0);
  assert.ok(stored(upgraded) > stored(base), 'the same elapsed time produces more usable energy');
});

test('logistics technology shortens the first real crew delivery on the same ship', () => {
  const base = new Game(), upgraded = new Game();
  ok(upgraded.purchaseUpgrade('logistics'), 'improve crew movement');
  for (const game of [base, upgraded]) until(game, g => g.metrics.powerDelivered > 0, 20);
  assert.ok(upgraded.time < base.time, 'a delivery finishes earlier through actual walking');
});

test('drive technology increases actual acceleration with the same engines and movement order', () => {
  const base = new Game(), upgraded = new Game();
  ok(upgraded.purchaseUpgrade('drive'), 'improve installed engines');
  for (const game of [base, upgraded]) {
    ok(game.launch(), 'launch identical drive fixture');
    // An opponent far ahead keeps gunfire out of this short thrust comparison.
    game.enemy.x = 0; game.enemy.y = -1400;
    ok(game.setMoveTarget(0, -1000), 'issue the same forward movement order');
    advance(game, 1);
  }
  assert.ok(upgraded.player.y < base.player.y, 'the upgraded hull actually travels farther');
  assert.ok(upgraded.player.vy < base.player.vy, 'forward velocity reflects the stronger engine output');
  assert.ok(upgraded.getStats().forwardThrust > base.getStats().forwardThrust);
});
