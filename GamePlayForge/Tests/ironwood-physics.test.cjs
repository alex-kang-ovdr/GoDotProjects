'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const project = path.join(root, 'Templates', 'iron-wood');
const executable = process.env.GODOT_BIN || path.join(path.resolve(root, '../../../GoDotProjects'), 'Godot_v4.7.2-stable_win64.exe');
const evidenceDirectory = path.join(root, 'Saved', 'Tests', 'ironwood-physics');
const skipReason = fs.existsSync(executable) ? false : `Godot executable not found: ${executable}`;

test('Iron Wood cart settles on the floor and keyboard input drives, steers, and brakes through physics', { timeout: 30000, skip: skipReason }, async () => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--headless', '--path', project, '--scene', 'res://tests/physics.tscn'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Godot physics test timed out. Output:\n${logs}`));
    }, 25000);
    child.stdout.on('data', chunk => { logs += chunk.toString(); });
    child.stderr.on('data', chunk => { logs += chunk.toString(); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => {
      clearTimeout(timeout);
      fs.mkdirSync(evidenceDirectory, { recursive: true });
      fs.writeFileSync(path.join(evidenceDirectory, 'last-run.log'), logs);
      if (code !== 0 || /SCRIPT ERROR:|ERROR:|Assertion failed/i.test(logs)) reject(new Error(`Godot physics test failed (exit ${code}). Output:\n${logs}`));
      else resolve(logs);
    });
  });
  assert.match(output, /Iron Wood physics passed:/, `Godot did not report a passing physics run:\n${output}`);
});
