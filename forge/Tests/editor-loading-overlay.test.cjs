'use strict';
// Regression: on a cold (uncached) load the web editor started behind a loading overlay stuck at
// "Godot 웹 에디터 다운로드 중… 54.3 MB / 54.3 MB (100%)". Godot's preloader emits its final
// progress on requestAnimationFrame; startup work starves that frame until after engine.start()
// resolved and hideLoading() ran, so the late callback re-showed the overlay.
// This test executes the real onProgress handler from editor-bridge.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'OfficialGodot', 'editor-bridge.js'), 'utf8').replace(/\r\n/g, '\n');

function loadOnProgress() {
  const m = /onProgress: (\(current, total\) => \{[\s\S]*?\n {8}\}),\n {8}onPrint:/.exec(source);
  assert.ok(m, 'onProgress handler not found in editor-bridge.js');
  const calls = [];
  const state = { started: false };
  const status = { textContent: '' };
  // Same free variables the handler closes over inside start().
  const factory = new Function('state', 'status', 'setLoading', 'knownWasmBytes',
    `return (current, total) => { const started = state.started; return (${m[1]})(current, total); };`);
  const handler = factory(state, status, (...args) => calls.push(args), 56956436);
  return { handler, calls, state, status };
}

test('progress updates drive the overlay while the editor is still downloading', () => {
  const { handler, calls } = loadOnProgress();
  handler(10 * 1024 * 1024, 56956436);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'Godot 웹 에디터 다운로드 중…');
});

test('a late preloader progress callback after startup does not re-show the overlay', () => {
  const { handler, calls, state, status } = loadOnProgress();
  state.started = true;
  status.textContent = '';
  handler(56956436, 56956436);
  assert.equal(calls.length, 0, 'setLoading must not run once the editor has started');
  assert.equal(status.textContent, '');
});
