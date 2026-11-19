'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { capture, observeLines } = require('../../Tools/record-agent-mcp.cjs');

function call(id, extra = {}) {
  const operations = [{ kind: 'property.set', objectId: 'Hud', propertyId: 'text', value: '안녕', role: 'gui' }];
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'pf_workspace_apply', arguments: { operations, ...extra } } };
}
test('record only successful apply batches in acknowledged order, once per idempotency key', () => {
  const records = [];
  const tap = capture(item => records.push(item));
  for (const packet of [call(1), call(2), call(3), call(4, { dryRun: true }), call(5, { idempotencyKey: 'repeat' }), call(6, { idempotencyKey: 'repeat' })]) tap.request(packet);
  for (const id of [2, 4, 1, 5, 6]) tap.response({ id, result: { content: [] } });
  tap.response({ id: 3, result: { isError: true } });
  assert.deepEqual(records.map(item => item.id), [2, 1, 5]);
  assert.deepEqual(records[0].params, call(2).params);
});
test('UTF-8 messages can span stdio chunks', () => {
  const output = [];
  const observe = observeLines(msg => output.push(msg));
  for (const byte of Buffer.from(JSON.stringify(call(1)) + '\n')) observe(Buffer.from([byte]));
  assert.deepEqual(output, [call(1)]);
});
test('project-wide asset pack operations stay out of scratch scene recordings', () => {
  const records = [];
  const tap = capture(item => records.push(item));
  const operations = [
    ['pf_asset_pack_import', { packId: 'demo', operationId: 'dry', dryRun: true }, 'preview'],
    ['pf_asset_pack_import', { packId: 'missing', operationId: 'error' }, 'error'],
    ['pf_asset_pack_import', { packId: 'demo', operationId: 'real' }, 'queued'],
    ['pf_asset_pack_status', { operationId: 'real' }, 'done'],
  ];
  for (const [id, [name, args, state]] of operations.entries()) {
    tap.request({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    tap.response({ id, result: { content: [], isError: state === 'error', structuredContent: { state } } });
  }
  tap.request(call(5));
  tap.response({ id: 5, result: { content: [] } });
  assert.deepEqual(records, [call(5)]);
});
test('concurrent replies keep authoritative revisions for replay ordering', () => {
  const records = [];
  const tap = capture(item => records.push(item));
  for (const id of [1, 2]) tap.request(call(id));
  for (const [id, revision] of [[2, 12], [1, 11]]) {
    tap.response({ id, result: { content: [], structuredContent: { revision } } });
  }
  assert.deepEqual(records.map(item => item.params._meta['playforge/revision']), [12, 11]);
});
test('proxy preserves the MCP response and creates an editor-importable JSONL file', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-mcp-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'captured.jsonl');
  const response = { jsonrpc: '2.0', id: 4, result: { content: [], isError: false } };
  const echo = "require('node:readline').createInterface({input:process.stdin}).on('line',()=>console.log(" + JSON.stringify(JSON.stringify(response)) + "));";
  const run = spawnSync(process.execPath, [require.resolve('../../Tools/record-agent-mcp.cjs'), output, '--', process.execPath, '-e', echo],
    { input: JSON.stringify(call(4)) + '\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), response);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), call(4));
});
