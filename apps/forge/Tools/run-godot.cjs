'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { findGodot } = require('./native-runtime.cjs');
const root = path.resolve(__dirname, '..');
try {
  const args = ['--path', path.join(root, 'Godot'), ...process.argv.slice(2)];
  const child = spawn(findGodot(root), args, { windowsHide: true, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  process.on('SIGINT', () => child.kill());
  process.on('SIGTERM', () => child.kill());
} catch (error) { console.error(error.message); process.exitCode = 1; }
