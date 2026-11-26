'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const godot = process.env.GODOT_BIN || 'D:/Github/GoDotProjects/Godot_v4.7.2-stable_win64.exe';
test('BrawlLabs input, projectile physics, pause, respawn and gem objective', { skip: fs.existsSync(godot) ? false : 'Godot editor is not installed', timeout: 120000 }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-brawllabs-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const projectDir = path.join(temp, 'project');
  const profileDir = path.join(temp, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.cpSync(path.join(root, 'Templates/brawllabs'), projectDir, {
    recursive: true,
    filter: file => path.basename(file) !== '.godot',
  });
  const env = { ...process.env, APPDATA: profileDir, LOCALAPPDATA: profileDir, HOME: profileDir, XDG_DATA_HOME: profileDir, XDG_CONFIG_HOME: profileDir, XDG_CACHE_HOME: profileDir };
  const imp = spawnSync(godot, ['--headless', '--path', projectDir, '--editor', '--import', '--quit'], { encoding: 'utf8', env, timeout: 60000, windowsHide: true });
  const result = spawnSync(godot, ['--headless', '--path', projectDir, '--script', 'res://tests/brawllabs_smoke.gd'], { encoding: 'utf8', env, timeout: 75000, windowsHide: true });
  const output = (imp.stdout || '') + (imp.stderr || '') + '\n' + (result.stdout || '') + (result.stderr || '');
  const evidence = path.join(root, 'Saved/Tests/brawllabs');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'smoke.log'), output);
  assert.equal(imp.error, undefined, imp.error?.message);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /ERROR:|Assertion failed/);
  assert.match(output, /BRAWLLABS_SMOKE_OK/);
  assert.match(output, /BRAWLLABS_LIFECYCLE_OK/);
});
