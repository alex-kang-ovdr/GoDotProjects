'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocket } = require('ws');
const { createServer } = require('../server.cjs');
const { createOriginPolicy } = require('../Tools/origin-policy.cjs');

test('external HTTPS origin works for HTTP and WebSocket behind a proxy; foreign origins fail', async t => {
  const folder = path.resolve(__dirname, '../Saved/Tests/cloud-origin', String(Date.now()));
  fs.mkdirSync(folder, { recursive: true });
  const server = createServer({ workspace: folder, publicOrigin: 'https://cloud.playforge.test' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.shutdown());
  const base = 'http://127.0.0.1:' + server.address().port;
  const allowed = await fetch(base + '/api/project', { headers: { Origin: 'https://cloud.playforge.test' } });
  assert.equal(allowed.status, 200);
  const foreign = await fetch(base + '/api/project', { headers: { Origin: 'https://foreign.test', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'foreign.test' } });
  assert.equal(foreign.status, 403);
  // Multiplayer WebSockets share the same origin policy as HTTP.
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/brawllabs', { origin: 'https://cloud.playforge.test' });
  t.after(() => socket.terminate());
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const rejected = new WebSocket(base.replace('http:', 'ws:') + '/brawllabs', { origin: 'https://foreign.test' });
  t.after(() => rejected.terminate());
  await new Promise((resolve, reject) => { rejected.once('error', resolve); rejected.once('open', () => reject(new Error('Foreign WebSocket origin accepted'))); });
});

test('proxy origin configuration fails closed and does not trust forwarded headers', () => {
  for (const invalid of ['file:///tmp', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=x']) {
    assert.throws(() => createOriginPolicy(invalid));
  }
  assert.equal(createOriginPolicy()({ headers: { host: '127.0.0.1:4173', origin: 'https://foreign.test', 'x-forwarded-host': 'foreign.test' } }), false);
});

test('direct Wi-Fi HTTPS requests require an HTTPS origin for their own host', () => {
  const policy = createOriginPolicy();
  const request = { socket: { encrypted: true }, headers: { host: '100.71.34.31:4173' } };
  assert.equal(policy({ ...request, headers: { ...request.headers, origin: 'https://100.71.34.31:4173' } }), true);
  assert.equal(policy({ ...request, headers: { ...request.headers, origin: 'http://100.71.34.31:4173' } }), false);
  assert.equal(policy({ ...request, headers: { ...request.headers, origin: 'https://foreign.test' } }), false);
});
