'use strict';

// Geometry and navigation integration tests. Rule fixtures may arrange state;
// the separate campaign policy never assigns gameplay state or outcomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const name of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', name), 'utf8'), context, { filename: name });
}
const SW = context.Starward;
const IDS = ['bridge', 'engines', 'medbay', 'oxygen', 'shields', 'weapons'];
const LAYOUTS = ['argo', 'atlas', 'flagship', 'interceptor', 'legacy', 'wraith'];
const copy = value => JSON.parse(JSON.stringify(value));
const ok = value => value === true || !!(value && value.ok);
const close = (a, b, message = 'coordinates match', epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${message}: ${a} vs ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = room => ({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
const room = (ship, id) => ship.rooms.find(item => item.id === id);
const inside = (point, rect, epsilon = 1e-7) => point.x >= rect.x - epsilon && point.x <= rect.x + rect.w + epsilon && point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon;
const boundary = (point, rect) => inside(point, rect) && [Math.abs(point.x - rect.x), Math.abs(point.x - rect.x - rect.w), Math.abs(point.y - rect.y), Math.abs(point.y - rect.y - rect.h)].some(value => value < 1e-7);
const neighbors = (ship, id) => ship.doors.filter(door => door.b && (door.a === id || door.b === id)).map(door => door.a === id ? door.b : door.a);
const connectingDoor = (ship, a, b) => ship.doors.find(door => door.b && ((door.a === a && door.b === b) || (door.a === b && door.b === a)));
function fresh(loadoutId = 'argo', seed = 42) { return new SW.Game(seed, { loadoutId, difficulty: 'standard' }); }
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 30); i += 1) game.tick(1 / 30); }
function quiet(loadoutId = 'argo', enemyLayout = 'interceptor', extra = {}) {
  const game = fresh(loadoutId);
  game.startCombat({ name: 'v5 공간 규칙 표적', layoutId: enemyLayout, hull: 100, reactor: 20,
    shieldLayers: 0, engineLevel: 0, crewCount: 0, weaponDefs: ['burst_laser'], ...extra });
  for (const weapon of game.state.player.weapons) game.setWeaponAuto(weapon.id, false);
  for (const weapon of game.state.enemy.weapons) { weapon.enabled = false; weapon.auto = false; weapon.fireMode = 'manual'; }
  game.state.enemy.aiTimer = 10000;
  game.setPaused(false);
  return game;
}
function place(crew, ship, roomId) {
  Object.assign(crew, center(room(ship, roomId)), { shipId: ship.id, roomId, movePath: [], targetRoomId: null });
}
function atomicFailure(game, change) {
  const before = game.serialize(), candidate = JSON.parse(before);
  change(candidate);
  assert.equal(game.load(JSON.stringify(candidate)), false, change.toString());
  assert.equal(game.serialize(), before, 'failed load preserves complete current state');
}
function subset(actual, old, key = 'state') {
  if (old === null || typeof old !== 'object') { assert.equal(actual, old, key); return; }
  if (Array.isArray(old)) assert.equal(actual.length, old.length, key + ' length');
  for (const [name, value] of Object.entries(old)) {
    if (key === 'state' && name === 'version') continue;
    subset(actual[name], value, key + '.' + name);
  }
}
function assertRoute(game, crew, route) {
  const ship = game.state[crew.shipId];
  assert.ok(route && route.points.length >= 2);
  assert.equal(route.shipId, crew.shipId);
  close(route.points[0].x, crew.x); close(route.points[0].y, crew.y);
  const end = center(room(ship, crew.targetRoomId));
  close(route.points.at(-1).x, end.x); close(route.points.at(-1).y, end.y);
  close(route.distance, route.points.slice(1).reduce((sum, point, index) => sum + distance(route.points[index], point), 0), 'reported polyline distance');
  const rooms = route.roomIds.filter((id, index, list) => index === 0 || id !== list[index - 1]);
  assert.equal(rooms[0], crew.roomId); assert.equal(rooms.at(-1), crew.targetRoomId);
  let pointIndex = 0;
  for (let index = 1; index < rooms.length; index += 1) {
    const door = connectingDoor(ship, rooms[index - 1], rooms[index]);
    assert.ok(door, `route uses a physical door: ${ship.layoutId} ${rooms[index - 1]}→${rooms[index]}`);
    const found = route.points.findIndex((point, at) => at >= pointIndex && distance(point, door) < 1e-7);
    assert.ok(found >= 0, 'each crossed doorway appears in order in the visible route'); pointIndex = found;
  }
  for (let index = 1; index < route.points.length; index += 1) {
    const a = route.points[index - 1], b = route.points[index];
    for (let step = 0; step <= 12; step += 1) {
      const point = { x: a.x + (b.x - a.x) * step / 12, y: a.y + (b.y - a.y) * step / 12 };
      assert.ok(ship.rooms.some(rect => inside(point, rect)), 'route remains inside actual room geometry');
    }
  }
}
function longestOrder(game, crew, ship = game.state.player) {
  let best = null;
  for (const a of ship.rooms) for (const b of ship.rooms) {
    if (a.id === b.id) continue;
    place(crew, ship, a.id); assert.ok(ok(game.moveCrew(crew.id, b.id, ship.id)));
    const route = game.getCrewRoute(crew.id);
    if (!best || route.distance > best.route.distance) best = { from: a.id, to: b.id, route: copy(route) };
  }
  place(crew, ship, best.from); assert.ok(ok(game.moveCrew(crew.id, best.to, ship.id)));
  best.route = copy(game.getCrewRoute(crew.id));
  return best;
}
function pointPolylineDistance(point, points) {
  let closest = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index], dx = b.x - a.x, dy = b.y - a.y;
    const amount = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    closest = Math.min(closest, distance(point, { x: a.x + dx * amount, y: a.y + dy * amount }));
  }
  return closest;
}
function intersects(a, b, rect) {
  // Independent segment/rectangle clipping, used only as a geometry oracle.
  let lower = 0, upper = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, rect.x, rect.x + rect.w], [a.y, b.y - a.y, rect.y, rect.y + rect.h]]) {
    if (Math.abs(delta) < 1e-10) { if (origin < min || origin > max) return false; continue; }
    const one = (min - origin) / delta, two = (max - origin) / delta;
    lower = Math.max(lower, Math.min(one, two)); upper = Math.min(upper, Math.max(one, two));
    if (lower > upper + 1e-10) return false;
  }
  return true;
}
function beamGeometry(ship, from, to, length = 4) {
  const a = center(room(ship, from)), target = center(room(ship, to)), full = distance(a, target);
  const fraction = full > length ? length / full : 1;
  const b = { x: a.x + (target.x - a.x) * fraction, y: a.y + (target.y - a.y) * fraction };
  return { a, b, ids: ship.rooms.filter(rect => intersects(a, b, rect)).map(rect => rect.id) };
}
function pendingBoarder() {
  const game = quiet('wraith', 'interceptor');
  const crew = game.state.player.crew[2];
  game.allocatePower('engines', -1); assert.ok(ok(game.allocatePower('teleporter', 1)));
  assert.ok(ok(game.teleportCrew([crew.id], 'shields')));
  assert.ok(ok(game.moveCrew(crew.id, 'medbay', 'enemy')));
  const route = game.getCrewRoute(crew.id);
  const firstDoor = connectingDoor(game.state.enemy, route.roomIds[0], route.roomIds.find(id => id !== route.roomIds[0]));
  for (let tick = 0; tick < 600 && firstDoor.hp >= firstDoor.maxHp; tick += 1) game.tick(1 / 30);
  assert.ok(firstDoor.hp < firstDoor.maxHp, 'the boarder reaches and attacks a real hostile door');
  return { game, crew, route, firstDoor };
}

test('all canonical layouts have six non-overlapping connected rooms and doors on real walls', () => {
  assert.deepEqual(Object.keys(SW.DATA.layouts).sort(), LAYOUTS);
  for (const layout of Object.values(SW.DATA.layouts)) {
    assert.deepEqual(copy(layout.rooms.map(item => item.id)).sort(), IDS);
    assert.ok(layout.width <= 10 && layout.height <= 6);
    const ids = new Set(layout.doors.map(door => door.id)); assert.equal(ids.size, layout.doors.length);
    for (const rect of layout.rooms) {
      assert.ok(rect.w > 0 && rect.h > 0 && rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.x + rect.w <= layout.width && rect.y + rect.h <= layout.height);
      for (const other of layout.rooms) if (other !== rect) {
        const overlap = Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x);
        const vertical = Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y);
        assert.ok(overlap <= 0 || vertical <= 0, layout.id + ': room interiors cannot overlap');
      }
    }
    for (const door of layout.doors) {
      const a = room(layout, door.a); assert.ok(a && boundary(door, a), layout.id + ': door lies on source wall');
      assert.ok(['vertical', 'horizontal'].includes(door.orientation));
      if (door.airlock) {
        assert.equal(door.b, null);
        assert.ok(!layout.rooms.some(other => other.id !== a.id && inside(door, other)), 'airlock faces exposed space');
      } else {
        const b = room(layout, door.b); assert.ok(b && boundary(door, b), 'interior door joins both walls');
        const vertical = Math.abs(a.x + a.w - b.x) < 1e-7 || Math.abs(b.x + b.w - a.x) < 1e-7;
        assert.equal(door.orientation, vertical ? 'vertical' : 'horizontal');
      }
    }
    const visited = new Set([layout.rooms[0].id]), queue = [...visited];
    for (let index = 0; index < queue.length; index += 1) for (const id of neighbors(layout, queue[index])) {
      if (!visited.has(id)) { visited.add(id); queue.push(id); }
    }
    assert.equal(visited.size, 6, layout.id + ': every room is reachable');
  }
  assert.deepEqual(copy(SW.DATA.layouts.legacy.rooms), copy(SW.DATA.rooms));
  assert.deepEqual(copy(SW.DATA.layouts.legacy.doors), copy(SW.DATA.doors));
});

test('new player ships use their chosen canonical geometry without sharing mutable room or door state', () => {
  const geometries = [];
  for (const id of ['argo', 'atlas', 'wraith']) {
    const game = fresh(id), ship = game.state.player, before = game.serialize(), layout = game.getLayout();
    assert.equal(game.state.version, 5); assert.equal(ship.layoutId, id); assert.equal(layout.id, id);
    assert.equal(game.serialize(), before, 'layout lookup is read-only');
    for (const rect of layout.rooms) for (const key of ['id', 'name', 'x', 'y', 'w', 'h']) assert.equal(room(ship, rect.id)[key], rect[key]);
    assert.equal(ship.doors.length, layout.doors.length);
    geometries.push(JSON.stringify(ship.rooms.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))));
    ship.rooms[0].fire = 1; ship.doors[0].open = true;
    assert.equal(layout.rooms[0].fire, undefined); assert.equal(layout.doors[0].open, undefined);
    assert.ok(fresh(id).state.player.rooms.every(rect => rect.fire === 0));
  }
  assert.equal(new Set(geometries).size, 3, 'all three actual layouts differ');
});

test('campaign creates real enemy layouts and keeps the flagship layout through three phases', () => {
  const game = fresh(); game.startRun(); assert.equal(game.state.enemy.layoutId, 'interceptor');
  const phases = [];
  for (let guard = 0; guard < 100 && game.state.mode !== 'victory'; guard += 1) {
    const state = game.state;
    if (state.mode === 'combat') {
      if (state.bossPhase) { assert.equal(state.enemy.layoutId, 'flagship'); phases.push(state.bossPhase); }
      else assert.ok(['interceptor', 'flagship'].includes(state.enemy.layoutId));
      state.enemy.hull = 0; game.setPaused(false); advance(game, 0.1);
    } else if (state.mode === 'reward') {
      if (state.reward.salvage?.status === 'pending') assert.ok(ok(game.resolveSalvage('scrap')));
      assert.ok(ok(game.continueReward()));
    } else if (state.mode === 'map') {
      const current = state.nodes.find(node => node.id === state.currentNodeId);
      const options = current.links.map(id => state.nodes.find(node => node.id === id));
      assert.ok(ok(game.jump((options.find(node => node.type === 'combat') || options[0]).id)));
    } else if (state.mode === 'shop') game.leaveShop();
    else if (state.mode === 'event') game.chooseEvent(state.event.choices.find(choice => !choice.disabled).id);
    else assert.fail('unexpected mode: ' + state.mode);
  }
  assert.equal(game.state.mode, 'victory'); assert.deepEqual(phases, [1, 2, 3]);
});

test('route lookup is pure and every canonical room pair travels through its own doorway coordinates', () => {
  for (const id of LAYOUTS) {
    const game = fresh(); game.state.player = game.makeShip({ layoutId: id });
    const crew = game.state.player.crew[0], ship = game.state.player;
    assert.equal(game.getCrewRoute('missing'), null);
    assert.equal(game.getCrewRoute(crew.id), null);
    for (const from of ship.rooms) for (const to of ship.rooms) {
      if (from.id === to.id) continue;
      place(crew, ship, from.id); assert.ok(ok(game.moveCrew(crew.id, to.id)));
      const before = game.serialize(), route = game.getCrewRoute(crew.id);
      assertRoute(game, crew, route); assert.deepEqual(copy(game.getCrewRoute(crew.id)), copy(route));
      assert.equal(game.serialize(), before, 'route queries do not consume state, RNG, IDs or logs');
    }
  }
});

test('actual travel follows doorway polylines without cutting walls or teleporting on any player layout', () => {
  for (const id of ['argo', 'atlas', 'wraith']) {
    const game = quiet(id), crew = game.state.player.crew[0];
    const order = longestOrder(game, crew);
    assertRoute(game, crew, order.route);
    assert.ok(order.route.points.length >= 4);
    let previous = { x: crew.x, y: crew.y };
    const maxStep = SW.DATA.crewTypes[crew.species].moveSpeed / 30 + 1e-6;
    for (let count = 0; count < 1800 && crew.movePath.length; count += 1) {
      game.tick(1 / 30);
      assert.ok(distance(previous, crew) <= maxStep, id + ': movement stays within its speed');
      assert.ok(pointPolylineDistance(crew, order.route.points) < 1e-6, id + ': position lies on the promised real route');
      assert.ok(inside(crew, room(game.state.player, crew.roomId)), id + ': physical room tracks the crossed doorway');
      previous = { x: crew.x, y: crew.y };
    }
    assert.equal(crew.roomId, order.to); assert.equal(crew.movePath.length, 0);
    close(distance(crew, center(room(game.state.player, order.to))), 0);
    assert.equal(game.getCrewRoute(crew.id), null);
  }
});

test('paused retargeting begins at the current point and does not move crew back to a room center', () => {
  const game = quiet('wraith'), crew = game.state.player.crew[0]; longestOrder(game, crew);
  advance(game, 0.4); game.setPaused(true);
  const current = { x: crew.x, y: crew.y, roomId: crew.roomId }, target = game.state.player.rooms.find(rect => rect.id !== crew.roomId && rect.id !== crew.targetRoomId);
  assert.ok(ok(game.moveCrew(crew.id, target.id)));
  assert.deepEqual({ x: crew.x, y: crew.y, roomId: crew.roomId }, current);
  assertRoute(game, crew, game.getCrewRoute(crew.id));
  const before = game.serialize(); advance(game, 1); assert.equal(game.serialize(), before);
});

test('friendly doors open at actual contact and preserve explicit manual opening on a new layout', () => {
  const game = quiet('wraith'), ship = game.state.player, crew = ship.crew[0];
  const door = ship.doors.find(item => item.b); place(crew, ship, door.a);
  assert.ok(ok(game.moveCrew(crew.id, door.b)));
  for (let count = 0; count < 300 && !door.open; count += 1) game.tick(1 / 30);
  assert.equal(door.open, true);
  assert.ok(distance(crew, door) <= SW.DATA.crewTypes[crew.species].moveSpeed / 30 + 1e-6, 'automatic opening happens at the doorway');
  for (let count = 0; count < 300 && crew.movePath.length; count += 1) game.tick(1 / 30);
  advance(game, 1.2); assert.equal(door.open, false);
  game.toggleDoor(door.id); assert.equal(door.manualOpen, true);
  game.moveCrew(crew.id, door.a); advance(game, 8); assert.equal(door.open, true); assert.equal(door.manualOpen, true);
});

test('a friendly boarder uses the enemy graph and must reach the enemy doorway before breaking it', () => {
  const { game, crew, route, firstDoor } = pendingBoarder();
  assert.equal(crew.shipId, 'enemy'); assert.ok(game.state.player.crew.includes(crew));
  assert.ok(!neighbors(game.state.enemy, 'shields').includes('medbay'), 'interceptor has no legacy shortcut');
  assert.ok(neighbors(game.state.player, 'shields').includes('medbay'), 'the owner has a different shortcut');
  assert.equal(route.shipId, 'enemy'); assert.ok(route.roomIds.length >= 3);
  assert.ok(distance(crew, firstDoor) < 1e-6, 'hostile-door work cannot be performed from the room center');
  game.setPaused(true); const before = game.serialize(); advance(game, 2); assert.equal(game.serialize(), before);
  game.setPaused(false);
  for (let count = 0; count < 1800 && crew.movePath.length; count += 1) game.tick(1 / 30);
  assert.equal(crew.roomId, 'medbay'); assert.equal(crew.movePath.length, 0);
  close(distance(crew, center(room(game.state.enemy, 'medbay'))), 0);
});

test('saving from a moving point resumes the same route, doors and simulation without a position jump', () => {
  const game = quiet('atlas'), crew = game.state.player.crew[0]; longestOrder(game, crew); advance(game, 0.7);
  assert.ok(crew.movePath.length); assert.ok(distance(crew, center(room(game.state.player, crew.roomId))) > 0.1);
  const restored = fresh('wraith', 999); assert.equal(restored.load(game.serialize()), true);
  assert.deepEqual(copy(restored.state), copy(game.state));
  assert.deepEqual(copy(restored.getCrewRoute(crew.id)), copy(game.getCrewRoute(crew.id)));
  for (const instance of [game, restored]) advance(instance, 4);
  assert.deepEqual(copy(restored.state), copy(game.state));
});

test('saving while an owned boarder breaks an enemy door validates the physical ship and resumes the same work', () => {
  const { game, crew, firstDoor } = pendingBoarder();
  game.setPaused(true); const restored = fresh('atlas'); assert.equal(restored.load(game.serialize()), true);
  assert.deepEqual(copy(restored.state), copy(game.state));
  for (const instance of [game, restored]) { instance.setPaused(false); advance(instance, 2); }
  assert.deepEqual(copy(restored.state), copy(game.state));
  assert.ok(game.state.enemy.doors.find(item => item.id === firstDoor.id).hp < firstDoor.maxHp);
  assert.equal(restored.state.player.crew.find(item => item.id === crew.id).shipId, 'enemy');
});

test('beam endpoints and intersected rooms follow each target layout rather than the firing ship', () => {
  const signatures = new Set();
  for (const layoutId of ['legacy', 'interceptor', 'flagship']) {
    const game = quiet('wraith', layoutId), weapon = game.state.player.weapons.find(item => item.type === 'beam');
    const geometry = [];
    for (const [a, b] of [['engines', 'weapons'], ['shields', 'medbay'], ['bridge', 'oxygen'], ['engines', 'bridge']]) {
      assert.ok(ok(game.targetBeam(weapon.id, a, b)));
      const expected = beamGeometry(game.state.enemy, a, b, weapon.beamLength);
      close(distance(weapon.beamStart, expected.a), 0); close(distance(weapon.beamEnd, expected.b), 0);
      assert.ok(distance(weapon.beamStart, weapon.beamEnd) <= 4 + 1e-7);
      assert.deepEqual([...weapon.targetRooms].sort(), copy(expected.ids).sort());
      assert.equal(new Set(weapon.targetRooms).size, weapon.targetRooms.length);
      geometry.push(copy({ start: weapon.beamStart, end: weapon.beamEnd, ids: weapon.targetRooms }));
    }
    signatures.add(JSON.stringify(geometry));
  }
  assert.equal(signatures.size, 3, 'different enemy geometry actually changes beam targeting');
});

test('a fired beam applies one room hit per actual new-layout intersection', () => {
  const game = quiet('wraith', 'flagship'), weapon = game.state.player.weapons.find(item => item.type === 'beam');
  game.targetBeam(weapon.id, 'engines', 'weapons');
  const expected = beamGeometry(game.state.enemy, 'engines', 'weapons', weapon.beamLength);
  const hull = game.state.enemy.hull; weapon.charge = weapon.cooldown;
  assert.ok(ok(game.fireWeapon(weapon.id))); advance(game, 0.5);
  assert.equal(hull - game.state.enemy.hull, expected.ids.length * weapon.damage);
});

test('new-layout airlocks depressurize only their room and actually connected open neighbors', () => {
  for (const id of ['atlas', 'wraith']) {
    const game = quiet(id), ship = game.state.player, airlock = ship.doors.find(door => door.airlock);
    const origin = room(ship, airlock.a), adjacentId = neighbors(ship, origin.id)[0];
    assert.ok(adjacentId); game.toggleDoor(airlock.id); advance(game, 1.5);
    assert.ok(origin.oxygen < 95);
    for (const rect of ship.rooms) if (rect.id !== origin.id) close(rect.oxygen, 100, id + ': closed walls isolate air');
    game.toggleDoor(connectingDoor(ship, origin.id, adjacentId).id); advance(game, 1.5);
    assert.ok(room(ship, adjacentId).oxygen < 99);
    for (const rect of ship.rooms) if (![origin.id, adjacentId].includes(rect.id)) close(rect.oxygen, 100, id + ': unrelated rooms remain sealed');
  }
});

test('saved stations use the actual new-layout room center and return through its doors', () => {
  const game = quiet('atlas'), ship = game.state.player, crew = ship.crew[0];
  place(crew, ship, 'oxygen'); assert.ok(ok(game.saveStations()));
  assert.equal(crew.homeRoomId, 'oxygen'); place(crew, ship, 'bridge'); game.setPaused(true);
  assert.ok(ok(game.returnStations())); assertRoute(game, crew, game.getCrewRoute(crew.id));
  game.setPaused(false); advance(game, 15);
  assert.equal(crew.roomId, 'oxygen'); close(distance(crew, center(room(ship, 'oxygen'))), 0);
  assert.equal(fresh().load(game.serialize()), true);
});

test('genuine v4 inventory, stations, intent, ion flight, cloak and hazard gain legacy layout without resetting old keys', () => {
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v4-inventory-stations-combat.json'), 'utf8'));
  assert.equal(old.version, 4); assert.ok(old.cargo.length && old.projectiles.length); assert.equal(old.player.crew[2].homeRoomId, 'oxygen');
  const game = fresh('atlas'); assert.equal(game.load(JSON.stringify(old)), true);
  assert.equal(game.state.version, 5); assert.equal(game.state.player.layoutId, 'legacy'); assert.equal(game.state.enemy.layoutId, 'legacy');
  subset(game.state, old); assert.equal(game.state.loadoutId, 'wraith', 'legacy layout does not turn the chosen ship into Argo');
  const restored = fresh(); assert.equal(restored.load(game.serialize()), true);
  assert.deepEqual(copy(restored.state), copy(game.state));
  for (const instance of [game, restored]) { instance.setPaused(false); advance(instance, 0.5); }
  assert.deepEqual(copy(restored.state), copy(game.state));
});

test('genuine pending v4 salvage keeps its instance and still requires exactly one decision after migration', () => {
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v4-pending-salvage.json'), 'utf8'));
  const game = fresh(); assert.equal(game.load(JSON.stringify(old)), true); subset(game.state, old);
  assert.equal(game.state.player.layoutId, 'legacy'); assert.equal(game.state.enemy, null);
  const pending = game.serialize(); assert.equal(ok(game.continueReward()), false); assert.equal(game.serialize(), pending);
  assert.ok(ok(game.resolveSalvage('claim')));
  assert.equal(game.state.cargo.at(-1).id, old.reward.salvage.item.id);
  assert.equal(game.state.stats.salvaged, old.stats.salvaged + 1);
  assert.equal(fresh().load(game.serialize()), true);
});

test('a genuine v4 center-line boundary save is preserved on load and resumes without teleporting backwards', () => {
  for (const name of ['v4-midlegacy-route.json', 'v4-retarget-oxygen.json', 'v4-retarget-shields.json']) {
    const old = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
    const game = fresh(); assert.equal(game.load(JSON.stringify(old)), true, name); subset(game.state, old);
    const crew = game.state.player.crew[2], previous = { x: crew.x, y: crew.y }, target = crew.targetRoomId;
    assert.equal(crew.roomId, 'oxygen'); assert.ok(inside(crew, room(game.state.player, 'medbay')));
    const unchanged = game.serialize(); game.getCrewRoute(crew.id); assert.equal(game.serialize(), unchanged);
    game.setPaused(false); game.tick(1 / 30);
    assert.ok(inside(crew, room(game.state.player, crew.roomId)), 'physical room is corrected before moving');
    assert.ok(distance(previous, crew) <= SW.DATA.crewTypes[crew.species].moveSpeed / 30 + 1e-6, name + ': no position jump');
    assert.equal(fresh().load(game.serialize()), true, name + ': current-version resave');
    advance(game, 12); assert.equal(crew.roomId, target); assert.equal(crew.movePath.length, 0);
  }
});

test('forged or missing layouts, changed room rectangles and invented doorway geometry reject atomically', () => {
  const game = quiet('atlas', 'flagship'); game.setPaused(true);
  const mutations = [
    state => { delete state.player.layoutId; }, state => { state.enemy.layoutId = 'missing'; },
    state => { state.player.layoutId = 'wraith'; },
    state => { state.player.rooms[0].x += 0.125; }, state => { state.enemy.rooms[1].w += 0.25; },
    state => { state.player.rooms.push(copy(state.player.rooms[0])); },
    state => { state.player.doors[0].x += 0.2; }, state => { state.enemy.doors[0].a = 'bridge'; },
    state => { state.player.doors[0].orientation = state.player.doors[0].orientation === 'vertical' ? 'horizontal' : 'vertical'; },
    state => { state.player.doors.push({ ...copy(state.player.doors[0]), id: 'invented-door' }); },
    state => { state.player.doors.pop(); },
    state => { state.player.adjacency = { engines: ['bridge'] }; },
    state => { state.player.doors.find(door => door.airlock).b = 'weapons'; }
  ];
  for (const mutate of mutations) atomicFailure(game, mutate);
});

test('forged movement shortcuts and mismatched destinations use the physical ship graph in validation', () => {
  const { game, crew } = pendingBoarder(); game.setPaused(true);
  atomicFailure(game, state => {
    const unit = state.player.crew.find(item => item.id === crew.id), rect = room(state.enemy, 'shields');
    Object.assign(unit, center(rect), { roomId: 'shields', targetRoomId: 'medbay', movePath: ['medbay'] });
  });
  atomicFailure(game, state => {
    const unit = state.player.crew[0], from = 'bridge', to = neighbors(state.player, from)[0];
    Object.assign(unit, center(room(state.player, from)), { roomId: from, targetRoomId: from, movePath: [to] });
  });
  atomicFailure(game, state => { state.player.crew[0].movePath = ['missing']; state.player.crew[0].targetRoomId = 'missing'; });
});

test('v5 coordinates and saved stations are validated against the correct owner and physical layout', () => {
  const { game, crew } = pendingBoarder(); game.setPaused(true);
  atomicFailure(game, state => { state.player.crew[0].x = -0.5; });
  atomicFailure(game, state => { state.player.crew[0].homeRoomId = 'missing'; });
  atomicFailure(game, state => {
    const unit = state.player.crew.find(item => item.id === crew.id);
    Object.assign(unit, center(room(state.player, 'engines')), { roomId: 'engines', movePath: [], targetRoomId: null });
    assert.ok(!inside(unit, room(state.enemy, 'engines')), 'fixture is valid in owner geometry but outside physical room');
  });
});

test('beam saves reject endpoints outside the target geometry or beyond the real maximum length', () => {
  const game = quiet('wraith', 'flagship'), beam = game.state.player.weapons.find(item => item.type === 'beam');
  game.targetBeam(beam.id, 'engines', 'bridge'); game.setPaused(true);
  assert.equal(fresh().load(game.serialize()), true);
  atomicFailure(game, state => { state.player.weapons.find(item => item.id === beam.id).beamStart = { x: -1, y: -1 }; });
  atomicFailure(game, state => { state.player.weapons.find(item => item.id === beam.id).beamEnd = { x: 100, y: 100 }; });
  atomicFailure(game, state => { state.player.weapons.find(item => item.id === beam.id).beamEnd = center(room(state.enemy, 'bridge')); });
  atomicFailure(game, state => { state.player.weapons.find(item => item.id === beam.id).targetRooms = ['missing']; });
  beam.charge = beam.cooldown; game.setPaused(false); assert.ok(ok(game.fireWeapon(beam.id)));
  game.setPaused(true); assert.ok(game.state.projectiles.length);
  atomicFailure(game, state => { state.projectiles[0].beamEnd = { x: 100, y: 100 }; });
});

test('new combat cleanup removes stale geometry-specific aims while reward saves remain valid', () => {
  const game = quiet('wraith', 'flagship'), beam = game.state.player.weapons.find(item => item.type === 'beam');
  game.targetBeam(beam.id, 'engines', 'weapons'); assert.ok(beam.beamStart);
  game.state.enemy.hull = 0; advance(game, 0.1);
  assert.equal(game.state.mode, 'reward'); assert.equal(game.state.enemy, null);
  assert.equal(beam.target, null); assert.deepEqual(copy(beam.targetRooms), []);
  for (const key of ['beamFrom', 'beamTo', 'beamStart', 'beamEnd']) assert.equal(beam[key], null);
  assert.equal(fresh().load(game.serialize()), true);
});
