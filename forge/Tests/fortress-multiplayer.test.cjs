'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const { createServer } = require('../server.cjs');
const { FortressRoom } = require('../Tools/fortress-multiplayer.cjs');

const root = path.resolve(__dirname, '..');

test('packaged authoritative solver matches the original Fortress War source', () => {
  const original = path.join(root, '..', 'games', 'fortress-blue', 'Web', 'engine.js');
  const packaged = path.join(root, 'Tools', 'fortress-engine.cjs');
  const normalized = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  assert.equal(normalized(packaged), normalized(original));
});

test('only the lobby host can change validated configuration and only ready opposing teams can start', () => {
  let now = 2000;
  const room = new FortressRoom('test', 'a'.repeat(24), {}, undefined, () => now);
  const host = room.join({ name: 'Host', team: 0 });
  const guest = room.join({ name: 'Guest', team: 1 });
  const watcher = room.join({ name: 'Watcher', team: 0 });
  assert.equal(watcher.spectator, true);
  assert.equal(watcher.team, null);
  assert.throws(() => room.command(watcher, { type: 'ready', ready: true }), { code: 'invalid_ready' });
  assert.throws(() => room.command(watcher, { type: 'team', team: 0 }), { code: 'team_taken' });
  assert.throws(() => room.command(guest, { type: 'config', options: { map: 'foundry' } }), { code: 'host_required' });
  assert.throws(() => room.command(host, { type: 'config', options: { tuning: { gravity: 1 } } }), { code: 'invalid_config' });
  assert.throws(() => room.command(host, { type: 'config', options: { profile: ['classic'] } }), { code: 'invalid_config' });
  assert.throws(() => room.command(host, { type: 'config', options: { playerTank: 'other' } }), { code: 'invalid_config' });

  room.command(host, { type: 'ready', ready: true });
  assert.equal(room.phase, 'lobby');
  room.command(guest, { type: 'ready', ready: true });
  assert.equal(room.phase, 'countdown');
  room.command(host, { type: 'config', options: { profile: 'blue3', map: 'foundry' } });
  assert.equal(room.phase, 'lobby');
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.config.teamSize, 4);

  room.command(host, { type: 'ready', ready: true });
  room.command(guest, { type: 'ready', ready: true });
  now += 4999;
  room.tick();
  assert.equal(room.engine, null);
  now++;
  room.tick();
  const game = room.snapshot().game;
  assert.equal(game.tanks.length, 8);
  assert.ok(game.tanks.every(tank => tank.typeId && !Object.hasOwn(tank, 'def')));
  assert.equal(game.aiming.face, game.tanks.find(tank => tank.uid === game.activeId).face);

  const active = game.tanks.find(tank => tank.uid === game.activeId);
  const controller = [host, guest][active.team];
  const send = (seq, action, fields) => room.command(controller, { type: 'action', turnNumber: game.turnNumber, seq, action, ...fields });
  assert.throws(() => send(1, 'move', { direction: 1, dt: 0.2 }), { code: 'invalid_action' });
  assert.throws(() => send(1, 'fire', { weaponIndex: 10, power: 700 }), { code: 'invalid_action' });
  const direction = active.team === 0 ? 1 : -1;
  send(1, 'move', { direction, dt: 0.1 });
  const moved = room.engine.active.x;
  assert.ok(Math.abs(moved - active.x) <= room.engine.tuning.moveSpeed / 60 + 1e-6);
  for (let seq = 2; seq < 20; seq++) send(seq, 'move', { direction, dt: 0.1 });
  assert.equal(room.engine.active.x, moved, 'rapid movement packets cannot create elapsed time');
  assert.throws(() => send(30, 'item', { itemId: 'repair' }), { code: 'action_unavailable' });
  send(30, 'skip');
  assert.equal(room.engine.state.phase, 'transition');
});

function connectPeer(url, sockets, options) {
  const socket = new WebSocket(url, options);
  const messages = [];
  const waiters = new Set();
  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    messages.push(message);
    for (const waiter of waiters) waiter(message);
  });
  socket.on('error', () => {});
  sockets.add(socket);
  return {
    socket,
    open: once(socket, 'open'),
    send: message => socket.send(JSON.stringify(message)),
    wait(predicate, label) {
      const buffered = messages.find(predicate);
      if (buffered) return Promise.resolve(buffered);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('No Fortress War message received: ' + label));
        }, 8500);
        const waiter = message => {
          if (!predicate(message)) return;
          waiters.delete(waiter);
          clearTimeout(timer);
          resolve(message);
        };
        waiters.add(waiter);
      });
    },
  };
}

test('two live clients share authoritative action, terrain and forfeit state on one pinned build', { timeout: 24000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-fortress-rooms-'));
  const builds = path.join(directory, 'builds');
  const sockets = new Set();
  const server = createServer({
    publicOrigin: '',
    workspace: path.join(directory, 'workspace'),
    platformWorkspace: path.join(directory, 'platform'),
    buildDirectory: builds,
  });
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    if (server.listening) {
      const closed = once(server, 'close');
      server.shutdown();
      await closed;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const http = 'http://127.0.0.1:' + server.address().port;
  const wsUrl = http.replace('http:', 'ws:') + '/fortress-war';
  const createProject = async template => {
    const result = await fetch(http + '/api/platform/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Fortress Multiplayer QA', template }),
    });
    assert.equal(result.status, 201);
    return (await result.json()).project.id;
  };

  async function recordBuild(id, projectId, status) {
    const previewUrl = '/api/builds/' + id + '/files/index.html';
    const dest = path.join(builds, id);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify({ id, projectId, revision: 19, status, previewUrl }));
    return previewUrl;
  }

  const projectId = await createProject('fortress-war');
  const otherProject = await createProject('brawllabs');
  const buildId = 'a'.repeat(16);
  const failedBuild = 'b'.repeat(16);
  const otherBuild = 'c'.repeat(16);
  const previewUrl = await recordBuild(buildId, projectId, 'succeeded');
  await recordBuild(failedBuild, projectId, 'failed');
  await recordBuild(otherBuild, otherProject, 'succeeded');
  assert.equal((await (await fetch(http + '/api/health')).json()).fortressWarMultiplayer, true);

  const foreign = connectPeer(wsUrl, sockets, { origin: 'https://foreign.invalid' });
  await assert.rejects(foreign.open);
  const host = connectPeer(wsUrl, sockets, { origin: http });
  const guest = connectPeer(wsUrl, sockets);
  await Promise.all([host.open, guest.open]);
  host.send({ type: 'join', projectId, buildId: failedBuild, name: 'Bad build', seq: 100 });
  assert.equal((await host.wait(m => m.type === 'error' && m.seq === 100, 'failed build rejection')).code, 'invalid_build');
  host.send({ type: 'join', projectId: otherProject, buildId: otherBuild, name: 'Wrong template', seq: 101 });
  assert.equal((await host.wait(m => m.type === 'error' && m.seq === 101, 'wrong template rejection')).code, 'invalid_build');
  host.send({ type: 'join', projectId, buildId, name: 'Blue', team: 0, options: { teamSize: 1 } });
  const welcome = await host.wait(m => m.type === 'welcome', 'host welcome');
  const { roomId } = welcome;
  assert.match(roomId, /^[a-f0-9]{12}$/);
  assert.equal(welcome.buildId, buildId);
  assert.equal(welcome.revision, 19);
  assert.equal(welcome.previewUrl, previewUrl);
  const roomRoute = '/api/fortress-war/rooms/' + roomId;
  const metadata = await fetch(http + roomRoute);
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).room, { roomId, projectId, buildId, revision: 19, previewUrl, phase: 'lobby', players: 1 });
  assert.equal((await fetch(http + roomRoute, { headers: { origin: 'https://foreign.invalid' } })).status, 403);

  guest.send({ type: 'join', projectId, buildId: otherBuild, roomId, name: 'Red', seq: 102 });
  assert.equal((await guest.wait(m => m.type === 'error' && m.seq === 102, 'mismatched build rejection')).code, 'build_mismatch');
  guest.send({ type: 'join', projectId, buildId, roomId, name: 'Red', team: 1, options: { map: 'foundry' } });
  const guestWelcome = await guest.wait(m => m.type === 'welcome', 'guest welcome');
  assert.equal(guestWelcome.previewUrl, welcome.previewUrl);
  host.send({ type: 'ready', ready: true });
  guest.send({ type: 'ready', ready: true });

  const initial = m => m.type === 'state' && m.phase === 'playing' && m.terrain?.version === 1;
  const [blueState, redState] = await Promise.all([host.wait(initial, 'blue terrain'), guest.wait(initial, 'red terrain')]);
  assert.deepEqual(blueState.terrain, redState.terrain);
  const terrain = blueState.terrain;
  assert.equal(terrain.width, 1800);
  assert.equal(terrain.height, 820);
  let end = 0;
  for (const [start, length] of terrain.runs) {
    assert.ok(Number.isInteger(start) && start >= end && Number.isInteger(length) && length > 0);
    end = start + length;
    assert.ok(end <= terrain.width * terrain.height);
  }
  assert.ok(terrain.runs.length > 0);
  assert.equal(blueState.hostId, welcome.playerId);
  assert.equal(blueState.config.map, 'highlands');
  assert.equal(blueState.game.tanks.length, 2);
  assert.equal(blueState.game.tanks.find(tank => tank.uid === blueState.game.activeId).team, 0);
  await host.wait(m => m.type === 'state' && m.phase === 'playing' && m.game.simTime > 0 && !m.terrain, 'unchanged terrain omitted');

  const late = connectPeer(wsUrl, sockets);
  await late.open;
  late.send({ type: 'join', projectId, buildId, roomId, name: 'Viewer', team: 0 });
  const lateWelcome = await late.wait(m => m.type === 'welcome', 'spectator welcome');
  const lateState = await late.wait(initial, 'initial late spectator terrain');
  assert.deepEqual(lateState.terrain, terrain);
  assert.ok(lateState.players.find(player => player.id === lateWelcome.playerId).spectator);

  const turnNumber = blueState.game.turnNumber;
  function action(peer, seq, verb, fields = {}) {
    peer.send({ type: 'action', seq, turnNumber, action: verb, ...fields });
  }
  function rejection(peer, seq) {
    return peer.wait(m => m.type === 'error' && m.seq === seq, 'action rejection ' + seq);
  }

  action(guest, 1, 'fire', { power: 100 });
  assert.equal((await rejection(guest, 1)).code, 'not_active_team');
  action(late, 1, 'fire', { power: 100 });
  assert.equal((await rejection(late, 1)).code, 'not_active_team');
  action(host, 1, 'aim', { turnNumber: turnNumber + 1, power: 100 });
  assert.equal((await rejection(host, 1)).code, 'stale_turn');
  action(host, 2, 'aim', { power: 9999 });
  assert.equal((await rejection(host, 2)).code, 'invalid_action');
  action(host, 3, 'aim', { angle: 5, power: 25 });
  await guest.wait(m => m.type === 'state' && m.game?.turnNumber === turnNumber &&
    m.game.aiming.localAngle === 5 && m.game.power === 25, 'active aim visible to other client');
  action(host, 3, 'fire');
  assert.equal((await rejection(host, 3)).code, 'stale_sequence');
  action(host, 4, 'fire');

  const crater = m => m.type === 'state' && m.terrain?.version > terrain.version;
  const [blueCrater, redCrater] = await Promise.all([host.wait(crater, 'blue crater'), guest.wait(crater, 'red crater')]);
  assert.deepEqual(blueCrater.terrain, redCrater.terrain);
  const count = value => value.runs.reduce((sum, [, length]) => sum + length, 0);
  assert.ok(count(blueCrater.terrain) < count(terrain));
  assert.ok(blueCrater.logs.some(log => log.event === 'explosion' && Number.isFinite(log.x) && Number.isFinite(log.radius)));

  const disconnected = once(guest.socket, 'close');
  guest.socket.close();
  await disconnected;
  const finished = m => m.type === 'state' && m.phase === 'finished';
  const [blueFinish, lateFinish] = await Promise.all([host.wait(finished, 'blue forfeit'), late.wait(finished, 'spectator forfeit')]);
  assert.equal(blueFinish.game.phase, 'gameover');
  assert.equal(blueFinish.game.winner, 0);
  assert.equal(blueFinish.game.endReason, 'forfeit');
  assert.equal(lateFinish.game.winner, blueFinish.game.winner);
  assert.equal(lateFinish.game.endReason, 'forfeit');
});
