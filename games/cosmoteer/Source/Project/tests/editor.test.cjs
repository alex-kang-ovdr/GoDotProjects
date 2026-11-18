'use strict';

// User-visible construction transactions. No private Shipyard helpers are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, PARTS } = require('../dist/sim.js');
const { Shipyard } = require('../dist/editor.js');

const state = game => structuredClone(game.exportSave());
const ok = (r, label) => assert.equal(r?.ok, true, label + ': ' + r?.message);
const no = (r, label) => {
  assert.equal(r?.ok, false, label + ' must fail');
  assert.ok(r.message, label + ' explains the failure');
};
const ammunition = game => game.player.parts.reduce((n, p) => n + p.ammo, 0)
  + game.player.crew.reduce((n, c) => n + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
const integrity = game => game.player.parts.map(p => [p.type, p.hp, p.maxHp].join(':')).sort();

function fullStoreWithCarriedAmmo() {
  const game = new Game(), yard = new Shipyard(game);
  // Stop at the actual pickup rather than a scheduler-specific frame count.
  // Restocking fills the space the carrier's cargo would normally return to.
  for (let i = 0; i < 20 * 60 && !game.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0); i++) game.update(1 / 60);
  const carried = game.player.crew.reduce((n, c) => n + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
  assert.ok(carried > 0, 'a real delivery has picked up ammunition');
  game.paused = true;
  ok(game.restock(), 'fill the source store while ammunition is in transit');
  const cannon = game.player.parts.find(p => p.type === 'cannon');
  ok(yard.erase(cannon.x, cannon.y), 'remove the delivery destination');
  const capacity = game.player.parts.reduce((n, p) => n + (PARTS[p.type].ammoCapacity || 0), 0);
  assert.equal(ammunition(game), capacity + carried, 'fixture retains cargo beyond the full stores: currently 244 total');
  assert.ok(game.player.crew.some(c => c.cargo === 'ammo'), 'cargo has no free store or cannon to return to');
  return { game, yard, carried };
}

function freeCell(game, symmetric = false, onAxis = false) {
  const occupied = new Set(game.player.parts.filter(p => p.hp > 0).map(p => p.x + ',' + p.y));
  const adjacent = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => occupied.has((x + dx) + ',' + (y + dy)));
  for (let y = -10; y <= 10; y++) {
    for (let x = onAxis ? 0 : 1; x <= (onAxis ? 0 : 10); x++) {
      if (occupied.has(x + ',' + y) || !adjacent(x, y)) continue;
      if (symmetric && (occupied.has(-x + ',' + y) || !adjacent(-x, y))) continue;
      return { x, y };
    }
  }
  throw new Error('No suitable adjacent placement cell');
}

test('preview is read only and mirrored placement reflects the two module directions', () => {
  const game = new Game(), yard = new Shipyard(game), cell = freeCell(game, true);
  const before = state(game), preview = yard.preview('corridor', cell.x, cell.y, 1, true);
  ok(preview, 'mirror preview');
  assert.equal(preview.cost, 2 * PARTS.corridor.cost);
  assert.equal(preview.cells.length, 2);
  assert.deepEqual(state(game), before, 'preview does not buy parts or advance the game');
  ok(yard.place('corridor', cell.x, cell.y, 1, true), 'mirrored placement');
  assert.equal(game.credits, before.credits - preview.cost);
  assert.equal(game.player.parts.length, before.player.parts.length + 2);
  assert.equal(game.player.parts.find(p => p.x === cell.x && p.y === cell.y).rot, 1);
  assert.equal(game.player.parts.find(p => p.x === -cell.x && p.y === cell.y).rot, 3);
  assert.equal(yard.canUndo, true, 'the pair is one reversible construction action');
});

test('a mirrored placement on the centerline creates and charges for only one module', () => {
  const game = new Game(), yard = new Shipyard(game), cell = freeCell(game, false, true);
  const before = state(game), preview = yard.preview('corridor', 0, cell.y, 0, true);
  ok(preview, 'centerline preview');
  assert.equal(preview.cells.length, 1);
  assert.equal(preview.cost, PARTS.corridor.cost);
  ok(yard.place('corridor', 0, cell.y, 0, true), 'centerline placement');
  assert.equal(game.credits, before.credits - PARTS.corridor.cost);
  assert.equal(game.player.parts.length, before.player.parts.length + 1);
});

test('a blocked mirror or insufficient total funds leaves both sides and credits unchanged', () => {
  for (const failure of ['funds', 'occupied mirror']) {
    const game = new Game(), cell = freeCell(game, true);
    if (failure === 'funds') game.credits = 2 * PARTS.corridor.cost - 1;
    else ok(game.place('corridor', -cell.x, cell.y), 'occupy only the reflected cell');
    const yard = new Shipyard(game), before = state(game);
    no(yard.preview('corridor', cell.x, cell.y, 0, true), failure + ' preview');
    assert.deepEqual(state(game), before);
    no(yard.place('corridor', cell.x, cell.y, 0, true), failure + ' placement');
    assert.deepEqual(state(game), before, 'failed second half cannot leave the first half paid or installed');
    assert.equal(yard.canUndo, false, 'failed transactions do not create history entries');
  }
});

test('undo and redo restore refunds and inventories, while a new edit replaces the redo branch', () => {
  const game = new Game(), yard = new Shipyard(game);
  const store = game.player.parts.find(p => p.type === 'storage');
  const before = state(game);
  ok(yard.erase(store.x, store.y), 'remove an inventory-bearing module');
  const after = state(game);
  assert.ok(after.credits > before.credits);
  ok(yard.undo(), 'undo removal');
  assert.deepEqual(state(game), before, 'undo restores the original store, ammunition and credits');
  ok(yard.redo(), 'redo removal');
  assert.deepEqual(state(game), after, 'redo cannot duplicate the store or its refund');
  ok(yard.undo(), 'return to editable branch point');
  const cell = freeCell(game);
  ok(yard.place('corridor', cell.x, cell.y), 'create a different edit');
  const branch = state(game);
  assert.equal(yard.canRedo, false);
  no(yard.redo(), 'old branch redo');
  assert.deepEqual(state(game), branch);
});

test('rotating installed mirrored weapons preserves their damage, ammunition and price', () => {
  const game = new Game(), yard = new Shipyard(game);
  const first = game.player.parts.find(p => p.type === 'laser' && p.x > 0);
  assert.ok(first, 'starter contains a mirrored weapon pair');
  const second = game.player.parts.find(p => p.x === -first.x && p.y === first.y);
  const before = state(game), expected = (first.rot + 1) % 4;
  ok(yard.rotate(first.x, first.y, 1, true), 'rotate pair');
  const left = game.player.parts.find(p => p.id === first.id), right = game.player.parts.find(p => p.id === second.id);
  assert.equal(left.rot, expected);
  assert.equal(right.rot, (4 - expected) % 4);
  assert.equal(game.credits, before.credits);
  assert.deepEqual(integrity(game), before.player.parts.map(p => [p.type, p.hp, p.maxHp].join(':')).sort());
  assert.equal(ammunition(game), before.player.parts.reduce((n, p) => n + p.ammo, 0));
  ok(yard.undo(), 'undo rotation');
  assert.deepEqual(state(game), before);
});

test('reusing the current blueprint neither heals modules nor consumes carried ammunition', () => {
  const game = new Game(), yard = new Shipyard(game);
  for (let i = 0; i < 20 * 60 && !game.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0); i++) game.update(1 / 60);
  assert.ok(game.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0), 'fixture includes an active delivery');
  game.player.parts.find(p => p.type === 'armor').hp /= 2;
  const credits = game.credits, health = integrity(game), ammo = ammunition(game);
  const design = yard.capture('재사용 검증');
  const quote = yard.quote(design);
  ok(quote, 'quote reusable blueprint');
  assert.equal(quote.netCost, 0);
  assert.equal(quote.cost, 0);
  assert.equal(quote.refund, 0);
  for (let i = 0; i < 2; i++) {
    ok(yard.apply(design), 'apply the same reusable blueprint');
    assert.equal(game.credits, credits, 'reapplying is not a credit source');
    assert.deepEqual(integrity(game), health, 'refitting does not repair the damaged armor for free');
    assert.equal(ammunition(game), ammo, 'inventory survives module reassignment');
  }
  design.parts[0].x = 999;
  assert.ok(game.player.parts.every(p => Math.abs(p.x) <= 10), 'captured designs do not alias live modules');
});

test('refitting keeps carried ammunition when a full store cannot accept it after the cannon is removed', () => {
  const { game, yard } = fullStoreWithCarriedAmmo();
  const before = ammunition(game);
  const design = yard.capture('운반 중 탄약 보존');
  ok(yard.apply(design), 'reapply the unchanged design');
  assert.equal(ammunition(game), before, 'refit cannot discard cargo merely because stores are full');
  assert.ok(game.player.parts.every(p => p.ammo <= (PARTS[p.type].ammoCapacity || 0)), 'cargo is not hidden by overfilling a store');
  const restored = new Game();
  ok(restored.importSave(game.exportSave()), 'load the refit with undelivered cargo');
  assert.equal(ammunition(restored), before, 'saving the refit preserves that cargo as well');
});

test('a refit quote includes cargo returned into a removed store and exactly matches its payment', () => {
  const game = new Game(), yard = new Shipyard(game);
  const store = game.player.parts.find(p => p.type === 'storage');
  const cannon = game.player.parts.find(p => p.type === 'cannon');
  cannon.ammo = PARTS.cannon.ammoCapacity;
  store.ammo = 1; store.sulfur = 0;
  Object.assign(game.player.crew[0], { cargo: 'ammo', cargoAmount: 8, cargoSourceId: store.id, job: null });
  const design = yard.capture('운반 화물 정산');
  design.parts.find(p => p.x === store.x && p.y === store.y).type = 'corridor';
  const before = state(game), beforeAmmo = ammunition(game), credits = game.credits;
  const quote = yard.quote(design);
  ok(quote, 'quote the storage removal with cargo returning to it');
  assert.equal(quote.sold.ammo, 9, 'one stored round and eight carried rounds enter the same sale');
  assert.equal(quote.inventoryRefund, 2);
  assert.deepEqual(state(game), before, 'quoting does not settle cargo or sell anything on the live game');
  assert.deepEqual(yard.quote(design), quote, 'repeated read-only quotes are identical');
  assert.deepEqual(state(game), before, 'repeated quoting cannot create credits or consume inventory');
  const applied = yard.apply(design);
  ok(applied, 'apply the exact quoted refit');
  assert.equal(game.credits, credits - quote.netCost, 'the committed payment equals the displayed quote');
  assert.equal(applied.inventoryRefund, quote.inventoryRefund);
  assert.deepEqual(applied.sold, quote.sold);
  assert.deepEqual(applied.transferred, quote.transferred);
  assert.equal(ammunition(game) + applied.sold.ammo, beforeAmmo, 'every removed round is retained or explicitly sold');
  assert.equal(game.metrics.inventorySoldAmmo - before.metrics.inventorySoldAmmo, quote.sold.ammo);
  assert.equal(game.metrics.inventoryRefund - before.metrics.inventoryRefund, quote.inventoryRefund);
  const paidCredits = game.credits, retainedAmmo = ammunition(game);
  ok(yard.apply(design), 'apply the already installed design again');
  assert.equal(game.credits, paidCredits, 'the same inventory cannot be sold a second time');
  assert.equal(ammunition(game), retainedAmmo);
});

test('removing quarters keeps occupied carriers and rejects removing their last berth without changing the game', () => {
  for (const api of ['game', 'shipyard']) {
    const { game, yard } = fullStoreWithCarriedAmmo();
    const erase = (x, y) => api === 'game' ? game.erase(x, y) : yard.erase(x, y);
    const beforeAmmo = ammunition(game), initialCrew = game.player.crew.length;
    const first = game.player.parts.find(p => p.type === 'bunk');
    ok(erase(first.x, first.y), api + ' removes one crew room');
    assert.equal(game.player.crew.length, initialCrew - PARTS.bunk.crewCapacity);
    assert.equal(ammunition(game), beforeAmmo, api + ' keeps the carrier instead of deleting its four rounds');
    assert.ok(game.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0));
    const restored = new Game();
    ok(restored.importSave(game.exportSave()), api + ' saves the reduced crew and its undelivered cargo');
    assert.equal(ammunition(restored), beforeAmmo);
    const last = game.player.parts.find(p => p.type === 'bunk');
    const beforeRemoval = state(game);
    no(erase(last.x, last.y), api + ' cannot remove the last carrier without storage space');
    assert.deepEqual(state(game), beforeRemoval, api + ' rejection preserves the hull, crew, cargo, money and saved state');
  }
});

test('malformed or unaffordable blueprints fail atomically with useful feedback', () => {
  const game = new Game(), yard = new Shipyard(game);
  const base = yard.capture('test'), malformed = [null, { parts: [] }];
  const overlap = structuredClone(base); overlap.parts.push({ ...overlap.parts[0] }); malformed.push(overlap);
  const unknown = structuredClone(base); unknown.parts[0].type = 'unknown'; malformed.push(unknown);
  const disconnected = structuredClone(base); disconnected.parts[0].x = 10; disconnected.parts[0].y = 10; malformed.push(disconnected);
  for (const design of malformed) {
    const before = state(game);
    no(yard.quote(design), 'invalid blueprint quote');
    no(yard.apply(design), 'invalid blueprint application');
    assert.deepEqual(state(game), before);
  }
  game.credits = 0;
  const expensive = yard.getPresets().find(p => p.id === 'gunship');
  const before = state(game);
  no(yard.apply(expensive), 'unaffordable design');
  assert.deepEqual(state(game), before);
});

test('each built-in blueprint can be afforded from the starter and passes launch checks', () => {
  const presets = new Shipyard(new Game()).getPresets();
  assert.equal(presets.length, 4);
  assert.equal(new Set(presets.map(p => p.id)).size, 4);
  for (const preset of presets) {
    const game = new Game(), yard = new Shipyard(game), credits = game.credits;
    const quote = yard.quote(preset);
    ok(quote, 'quote ' + preset.id);
    ok(yard.apply(preset), 'apply ' + preset.id);
    assert.equal(game.credits, credits - quote.netCost, 'payment matches the displayed refit quote');
    ok(game.launch(), 'launch ' + preset.id);
    assert.equal(game.mode, 'battle');
  }
});

test('construction history cannot roll a launched battle back into a cheaper dock state', () => {
  const game = new Game(), yard = new Shipyard(game), cell = freeCell(game);
  ok(yard.place('corridor', cell.x, cell.y), 'record a dock edit');
  assert.equal(yard.canUndo, true);
  ok(game.launch(), 'launch');
  const before = state(game);
  no(yard.undo(), 'undo during battle');
  no(yard.redo(), 'redo during battle');
  no(yard.apply(yard.getPresets()[0]), 'refit during battle');
  assert.deepEqual(state(game), before);
  assert.equal(yard.canUndo, false);
});

test('construction undo cannot roll back a fire that crew have already extinguished', () => {
  const game = new Game(), yard = new Shipyard(game);
  const laser = game.player.parts.find(p => p.type === 'laser');
  laser.fire = 0.7; // An existing dock fire, before the construction action.
  ok(game.setRepairPolicy('supply'), 'allow firefighting while disabling repair');
  ok(yard.place('corridor', 0, 5), 'record a normal construction edit');
  assert.equal(yard.canUndo, true, 'ordinary undo remains available before the fire progresses');
  const stock = game.player.repairStock;
  for (let i = 0; i < 8 * 60; i++) game.update(1 / 60);
  const current = game.player.parts.find(p => p.id === laser.id);
  assert.equal(current.fire, 0, 'crew have actually put out the fire');
  assert.ok(current.hp < current.maxHp, 'the fire has caused lasting damage');
  assert.ok(game.metrics.firesExtinguished > 0);
  assert.equal(game.player.repairStock, stock, 'a material-only history stamp would miss this change');
  const beforeUndo = state(game);
  assert.equal(yard.canUndo, false, 'fire and HP progression invalidate the old full-state snapshot');
  no(yard.undo(), 'undo after autonomous damage and firefighting');
  assert.deepEqual(state(game), beforeUndo, 'undo cannot resurrect the fire or reset elapsed time and service metrics');
  assert.equal(yard.canRedo, false);
});
