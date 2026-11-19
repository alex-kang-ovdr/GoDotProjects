'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { createServer } = require('../../server.cjs');

const run = promisify(execFile);
const forgeRoot = path.resolve(__dirname, '../..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

async function withServer(options, fn) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const workspace = fs.mkdtempSync(path.join(tempRoot, 'playforge-rc-srv-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(workspace, 'studio'),
    platformWorkspace: path.join(workspace, 'platform'),
    buildDirectory: path.join(workspace, 'builds'),
    ...options,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test('/api/platform-addon/remote-control serves standalone addon in debug/test mode and blocks live mode with 403', async () => {
  for (const mode of ['debug', 'test']) {
    await withServer({ buildMode: mode }, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/platform-addon/remote-control`);
      assert.equal(response.status, 200, `expected 200 in ${mode} mode`);
      const data = await response.json();
      assert.equal(data.ok, true);
      assert.ok(data.files['plugin.cfg'].includes('PlayForge Remote Control'));
      assert.ok(data.files['plugin.gd'].includes('playforge_remote_control'));
    });
  }
  for (const mode of ['live', 'release', 'production']) {
    await withServer({ buildMode: mode }, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/platform-addon/remote-control`);
      assert.equal(response.status, 403, `expected 403 in ${mode} mode`);
      const data = await response.json();
      assert.equal(data.ok, false);
    });
  }
});

test('playforge_remote_control runs standalone without other PlayForge addons and disables itself in live mode', {
  skip: process.platform !== 'win32' || !fs.existsSync(godot) ? 'Windows Godot unavailable' : false,
  timeout: 120000,
}, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'playforge-rc-godot-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

  const projectDir = path.join(temporary, 'project');
  fs.mkdirSync(path.join(projectDir, 'scenes'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'addons', 'playforge_remote_control'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'addons', 'probe'), { recursive: true });

  fs.writeFileSync(path.join(projectDir, 'project.godot'), [
    '; Engine configuration file.',
    'config_version=5',
    '',
    '[application]',
    'config/name="RemoteControlStandaloneTest"',
    'run/main_scene="res://scenes/main.tscn"',
    'config/features=PackedStringArray("4.7", "GL Compatibility")',
    '',
    '[editor_plugins]',
    'enabled=PackedStringArray("res://addons/playforge_remote_control/plugin.cfg", "res://addons/probe/plugin.cfg")',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(projectDir, 'scenes', 'main.tscn'), [
    '[gd_scene format=3]',
    '',
    '[node name="Main" type="Node2D"]',
    '',
    '[node name="Marker" type="Node2D" parent="."]',
    '',
  ].join('\n'), 'utf8');

  for (const name of ['plugin.cfg', 'plugin.gd', 'remote_workspace.gd']) {
    fs.copyFileSync(
      path.join(forgeRoot, 'Godot', 'addons', 'playforge_remote_control', name),
      path.join(projectDir, 'addons', 'playforge_remote_control', name),
    );
  }
  fs.writeFileSync(path.join(projectDir, 'addons', 'probe', 'plugin.cfg'), [
    '[plugin]',
    'name="RemoteControlProbe"',
    'description="Probe for playforge_remote_control"',
    'author="PlayForge"',
    'version="0.1.0"',
    'script="plugin.gd"',
    '',
  ].join('\n'), 'utf8');
  fs.copyFileSync(
    path.join(__dirname, 'fixtures', 'remote-control-probe.gd'),
    path.join(projectDir, 'addons', 'probe', 'plugin.gd'),
  );

  async function runProbe(buildMode) {
    const outPath = path.join(temporary, `probe-${buildMode}.json`);
    await run(godot, ['--headless', '--editor', '--path', projectDir, 'res://scenes/main.tscn'], {
      env: { ...process.env, PLAYFORGE_BUILD_MODE: buildMode, PLAYFORGE_RC_PROBE_OUT: outPath },
      timeout: 45000,
    });
    assert.ok(fs.existsSync(outPath), `probe output missing for ${buildMode}`);
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  }

  const debugResult = await runProbe('debug');
  assert.equal(debugResult.ok, true);
  assert.equal(debugResult.enabled, true);
  assert.equal(debugResult.capsCmd.jsonrpc, '2.0');
  assert.equal(debugResult.capsCmd.ok, true);
  assert.ok(debugResult.capsCmd.data.commands.some(c => c.name === 'workspace.apply'));
  assert.equal(debugResult.toolsCmd.ok, true);
  assert.ok(debugResult.toolsCmd.data.tools.some(tool => tool.name === 'pf_workspace_apply'));
  assert.equal(debugResult.openCmd.ok, true);
  assert.equal(debugResult.applyCmd.ok, true, debugResult.applyCmd.message);
  assert.equal(debugResult.applyCmd.jsonrpc, '2.0');
  assert.equal(debugResult.stateCmd.ok, true);
  assert.equal(debugResult.stateCmd.data.rootName, 'Main');
  assert.ok(debugResult.stateCmd.data.nodes.some(n => n.path === 'Bird' && n.type === 'Sprite2D'));
  assert.equal(debugResult.stateCmd.data.history.hasUndo, true);
  assert.equal(debugResult.undoCmd.ok, true);
  assert.equal(debugResult.redoCmd.ok, true);
  assert.equal(debugResult.saveCmd.ok, true);

  // Verify the standalone RemoteControl-authored project runs cleanly in Godot with 0 stderr errors.
  const runtimeRun = await run(godot, ['--headless', '--path', projectDir, '--quit-after', '5'], { timeout: 25000 });
  assert.ok(runtimeRun.stdout.includes('RC_TAPPY_READY'));
  assert.equal(runtimeRun.stderr.trim(), '');

  const liveResult = await runProbe('live');
  assert.equal(liveResult.ok, true);
  assert.equal(liveResult.enabled, false);
  assert.equal(liveResult.openCmd.ok, false);
  assert.equal(liveResult.applyCmd.ok, false);
  assert.equal(liveResult.stateCmd.ok, false);
  assert.ok(liveResult.stateCmd.message.includes('Live'));
});
