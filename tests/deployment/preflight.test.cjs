"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { check, ROOT } = require('../../tools/preflight.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function file(root, name, content = '') {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

test('Node 22 cannot launch Hub and absent engine cannot report success', t => {
  const root = fixture(t);
  assert.ok(check('hub', { root, env: {}, nodeVersion: '22.16.0' }).issues.some(issue => issue.includes('Node 24')));
  assert.equal(check('engine', { root, env: {}, nodeVersion: '24.0.0' }).ok, false);
});

test('Hub requires deployed output and checks config and API/UI ports without build dependencies', t => {
  const root = fixture(t);
  file(root, 'hub/server/index.mjs');
  file(root, 'hub/tools/dev.mjs');
  file(root, 'hub/package.json', '{"devDependencies":{"missing-build-only-parser":"1"}}');
  const config = path.join(root, 'operator.json');
  const env = { PLAYHUB_CONFIG: config };
  const options = { root, env, nodeVersion: '24.0.0' };
  assert.equal(check('hub', options).ok, false);
  const value = {
    publicHost: '0.0.0.0', adminHost: '127.0.0.1', publicPort: 8090, adminPort: 8091,
    userPort: 8080, adminUiPort: 8081, dataDir: path.join(root, 'private'),
  };
  fs.writeFileSync(config, JSON.stringify(value));
  assert.equal(check('hub', options).ok, false);
  value.publicHost = '127.0.0.1';
  value.userPort = value.publicPort;
  fs.writeFileSync(config, JSON.stringify(value));
  assert.equal(check('hub', options).ok, false);
  value.userPort = 8080;
  fs.writeFileSync(config, JSON.stringify(value));
  assert.ok(check('hub', options).issues.some(issue => issue.includes('Missing deployed Hub output')));
  for (const relative of require('../../hub/tools/runtime-output.cjs').requiredOutput) file(root, 'hub/dist/' + relative);
  file(root, 'hub/dist/user/catalog/games.json', '{"schemaVersion":1,"entries":[]}');
  file(root, 'hub/dist/user/config.js', 'window.PLAYHUB_CONFIG={"apiPort":8090,"apiBaseUrl":""};');
  file(root, 'hub/dist/admin/config.js', 'window.PLAYHUB_ADMIN_CONFIG={"apiPort":8091,"apiBaseUrl":""};');
  const report = check('hub', options);
  assert.equal(report.ok, true);
  assert.deepEqual(report.command.args, ['tools/dev.mjs', '--config', config]);
  assert.equal(report.command.userPort, 8080);
});

test('game launchers resolve the same repository registry and isolated runtime', t => {
  const root = fixture(t);
  const options = { root, nodeVersion: '24.0.0' };
  assert.equal(check('game', { ...options, env: { PLAYHUB_GAME_DIR: '../private' } }).ok, false);
  assert.equal(check('game', { ...options, env: {} }).ok, false);
  for(const name of ['tools/local-games/server.cjs','tools/local-games/registry.cjs','tools/local-games/sdk-host.js','tools/local-games/player-locale.js','hub/shared/game-logic.js'])file(root,name,'fixture');
  file(root, 'games/catalog.json', JSON.stringify({schemaVersion:1,entries:[{id:'demo',path:'demo',enabled:false}]}));
  file(root, 'games/demo/game.manifest.json', JSON.stringify({id:'demo',entry:'index.html',integration:'native-sdk'}));
  file(root, 'games/demo/Web/index.html', 'game');
  const catalog = check('game', { ...options, env: {} });
  assert.equal(catalog.ok, true);
  assert.equal(catalog.command.cwd, root);
  assert.equal(catalog.command.port, 22999);
  assert.deepEqual(catalog.command.args,['tools/local-games/server.cjs']);
  assert.equal(check('game', { ...options, env: { PLAYHUB_GAME_DIR: 'demo' } }).ok, false);
  assert.equal(check('game', { ...options, env: { PLAYHUB_GAME_PORT: '4186' } }).ok, false);
  fs.unlinkSync(path.join(root,'games/demo/Web/index.html'));
  assert.equal(check('game', { ...options, env: {} }).ok, false);
});

test('BAT entrypoints pass options through and preserve existing processes and firewall', () => {
  const tools = path.join(ROOT, 'tools');
  const launchers = [
    ['Run_Hub.bat', /launch\.cjs" hub %\*/],
    ['Run_Forge.bat', /launch\.cjs" forge %\*/],
    ['Run_Engine.bat', /launch\.cjs" engine %\*/],
    ['Run_Games.bat', /local-games\\server\.cjs" %\*/]
  ];
  for (const [name, command] of launchers) {
    const text = fs.readFileSync(path.join(tools, name), 'utf8');
    assert.match(text, command);
    assert.doesNotMatch(text, /taskkill|Stop-Process|netsh|ExecutionPolicy/i);
  }
  for (const removed of ['Run_Game.bat', 'Run_Local_Games.bat']) {
    assert.equal(fs.existsSync(path.join(tools, removed)), false);
  }
});

test('engine must be a provisioned binary and invalid explicit override fails', t => {
  const root = fixture(t);
  const settings = { root, nodeVersion: '24.0.0' };
  assert.equal(ROOT, path.resolve(__dirname, '../..'));
  const source = path.join(root, 'godot-engine');
  fs.mkdirSync(source);
  assert.equal(check('engine', { ...settings, env: { GODOT_BIN: source } }).ok, false);
  assert.equal(check('engine', { ...settings, env: {} }).ok, false);
  const exe = file(root, 'artifacts/local-runtime/godot/Godot_v4.7.2-stable_win64.exe');
  assert.equal(check('engine', { ...settings, env: {} }).command.executable, exe);
  assert.equal(check('engine', { ...settings, env: { GODOT_BIN: source } }).ok, false);
  const selected = file(root, 'Godot.exe');
  const report = check('engine', { ...settings, env: { GODOT_BIN: selected } });
  assert.equal(report.ok, true);
  assert.equal(report.command.executable, selected);
  assert.deepEqual(report.command.args, ['--project-manager']);
});
