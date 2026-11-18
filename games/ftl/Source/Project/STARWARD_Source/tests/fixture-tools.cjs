'use strict';

// Isolated regression scenarios may arrange state. Keep their old room-level
// intentions valid under v7's explicit tile, transit, and installation schema.
// The campaign policy does not import this helper or assign gameplay state.
const assert = require('node:assert/strict');
const placed = new WeakMap();

function placeFixture(crew, ship, roomId, preferred = null) {
  const room = ship.rooms.find(item => item.id === roomId);
  assert.ok(room, 'fixture room exists: ' + roomId);
  const known = placed.get(ship) || new Set();
  known.add(crew); placed.set(ship, known);
  const others = [...new Set([...ship.crew, ...known])].filter(item =>
    item !== crew && item.hp > 0 && item.shipId === ship.id);
  const tiles = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
    if (!others.some(item => item.tileX === x && item.tileY === y ||
      item.tileTransit?.toX === x && item.tileTransit?.toY === y ||
      item.targetTile?.x === x && item.targetTile?.y === y)) tiles.push({ x, y });
  }
  tiles.sort((a, b) => {
    const origin = preferred || { x: room.x + (room.w - 1) / 2, y: room.y + (room.h - 1) / 2 };
    return Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.y - b.y || a.x - b.x;
  });
  const tile = tiles[0];
  assert.ok(tile, 'fixture has a free tile in ' + roomId);
  Object.assign(crew, { shipId: ship.id, roomId, x: tile.x + 0.5, y: tile.y + 0.5,
    tileX: tile.x, tileY: tile.y, tilePath: [], targetTile: null, tileTransit: null,
    legacyTileTransition: null, movePath: [], targetRoomId: null,
    attackTargetId: null, attackCooldown: 0, attackFlash: 0 });
  return crew;
}

function mountFixture(game, systemId) {
  const ship = game.state.player, system = ship.aux[systemId];
  if (!system || system.roomId) return system;
  const slots = game.getSystemSlots();
  if (slots.length) {
    const slot = slots.find(item => item.unlocked && !item.systemId) || slots.find(item => !item.systemId);
    assert.ok(slot, 'isolated equipment fixture fits a physical bay');
    ship.systemSlots.find(item => item.id === slot.id).unlocked = true;
    system.roomId = slot.roomId;
  } else {
    system.roomId = { drones: 'weapons', teleporter: 'medbay', cloaking: 'engines',
      hacking: 'weapons', mind: 'bridge', battery: 'engines' }[systemId];
  }
  if (systemId === 'teleporter') ship.teleportRoomId = system.roomId;
  return system;
}

module.exports = { placeFixture, mountFixture };
