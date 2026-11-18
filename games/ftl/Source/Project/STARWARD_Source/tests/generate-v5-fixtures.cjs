'use strict';

// Reproduce genuine v5 saves using an independently preserved v5 source tree.
// Usage: node tests/generate-v5-fixtures.cjs /path/to/v5/modules [output-folder]
// No current-engine version rewriting and no assignment to gameplay state.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = path.resolve(process.argv[2] || '');
const output = path.resolve(process.argv[3] || path.join(__dirname, 'fixtures'));
assert.ok(process.argv[2], 'Supply the preserved v5 modules directory.');
const expected = {
  'data.js': '514af7b45235474a4c70ea53e6c57a1463c3e837b4463eb427612ca972edf28d',
  'engine.js': '22cca7fcfc290c66f1136d1e9974ef6ae4fa0aceca40ce5e91fbb1f3178fb062',
  'campaign.js': 'ac14ca6714ea5ac55d8d621f9aa863b005475b62f5f8dbc9478517563f58057f'
};
const context = vm.createContext({ console });
for (const [name, digest] of Object.entries(expected)) {
  const bytes = fs.readFileSync(path.join(source, name));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), digest, name + ': baseline SHA-256');
  vm.runInContext(bytes.toString('utf8'), context, { filename: name });
}
const Game = context.Starward.Game;
const ok = value => value === true || value?.ok === true;
function save(name, game) {
  const value = game.serialize();
  assert.equal(JSON.parse(value).version, 5);
  const restored = new Game(123);
  assert.equal(restored.load(value), true, name + ': original v5 loader');
  assert.equal(restored.serialize(), value, name + ': original roundtrip');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, name), JSON.stringify(JSON.parse(value), null, 2) + '\n');
  console.log(JSON.stringify({ name, mode: game.state.mode, time: game.state.time,
    hull: game.state.player.hull, resources: game.state.resources,
    cargo: game.state.cargo.map(item => item.defId), version: game.state.version }));
}
function advance(game, seconds) {
  for (let index = 0; index < Math.ceil(seconds * 30); index += 1) game.tick(1 / 30);
}
function finishReward(game) {
  if (game.state.reward?.salvage?.status === 'pending') assert.ok(ok(game.resolveSalvage('scrap')));
  assert.ok(ok(game.continueReward()));
}

const game = new Game(42, { loadoutId: 'wraith', difficulty: 'standard' });
assert.equal(game.state.version, 5);
assert.ok(ok(game.startRun()));
for (const weapon of game.state.player.weapons) {
  if (weapon.type === 'beam') assert.ok(ok(game.targetBeam(weapon.id, 'engines', 'weapons')));
  else assert.ok(ok(game.targetWeapon(weapon.id, 'weapons')));
}
game.setPaused(false);
for (let index = 0; game.state.mode === 'combat' && index < 5000; index += 1) game.tick(0.25);
assert.equal(game.state.mode, 'reward');
assert.equal(game.state.reward.salvage.status, 'pending');
save('v5-pending-salvage.json', game);
const rewardSave = game.serialize();

const ionId = game.state.reward.salvage.item.id;
const originalLaser = game.state.player.weapons.find(weapon => weapon.type === 'laser');
assert.ok(ok(game.resolveSalvage('claim')));
assert.ok(ok(game.installEquipment(ionId, originalLaser.id)));
assert.ok(ok(game.continueReward()));
const hazard = game.state.nodes.find(node => node.environment === 'asteroids');
assert.ok(ok(game.jump(hazard.id)));
for (const weapon of game.state.player.weapons) {
  assert.ok(ok(game.setWeaponAuto(weapon.id, false)));
  if (weapon.type === 'beam') assert.ok(ok(game.targetBeam(weapon.id, 'engines', 'weapons')));
  else assert.ok(ok(game.targetWeapon(weapon.id, 'weapons')));
}
game.setPaused(false);
advance(game, 14);
assert.equal(game.state.mode, 'combat');
assert.ok(ok(game.saveStations()));
assert.ok(ok(game.allocatePower('engines', -1)));
assert.ok(ok(game.allocatePower('teleporter', 1)));
const boarder = game.state.player.crew.find(crew => crew.homeRoomId === 'engines');
assert.ok(ok(game.teleportCrew([boarder.id], 'oxygen')));
assert.ok(ok(game.moveCrew(boarder.id, 'bridge', 'enemy')));
const engineer = game.state.player.crew.find(crew => crew.species === 'engi');
assert.ok(ok(game.moveCrew(engineer.id, 'medbay')));
advance(game, 0.25);
assert.ok(ok(game.activateCloak()));
game.setPaused(true);
const beam = game.state.player.weapons.find(weapon => weapon.type === 'beam');
const ion = game.state.player.weapons.find(weapon => weapon.id === ionId);
assert.ok(ok(game.fireWeapon(ionId)), 'fully charged paused ion is queued by the real v5 API');
assert.ok(boarder.movePath.length && engineer.movePath.length);
assert.equal(beam.targetRooms.length, 4);
assert.equal(ion.manualQueued, true);
save('v5-midcombat-boarding.json', game);

const shop = new Game(42);
assert.equal(shop.load(rewardSave), true);
assert.ok(ok(shop.resolveSalvage('claim')));
assert.ok(ok(shop.continueReward()));
assert.ok(ok(shop.jump('s1-1-2')));
while (shop.state.mode === 'event' || shop.state.mode === 'reward') {
  if (shop.state.mode === 'reward') finishReward(shop);
  else assert.ok(ok(shop.chooseEvent(shop.state.event.choices.find(choice => !choice.disabled).id)));
}
assert.equal(shop.state.mode, 'map');
assert.ok(ok(shop.jump('s1-2-2')));
assert.equal(shop.state.mode, 'shop');
const cargoIon = shop.state.cargo.find(item => item.defId === 'ion');
assert.ok(ok(shop.sellEquipment('cargo', cargoIon.id)));
assert.ok(ok(shop.buy('cloaking')));
assert.ok(ok(shop.buy('fuel')));
save('v5-shop.json', shop);
