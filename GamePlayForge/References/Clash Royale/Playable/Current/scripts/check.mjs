import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
for (const file of readdirSync(resolve(root, 'dist/js')).filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, `dist/js/${file}`)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const app = ['app.js', 'devtools.js'].map(file => readFileSync(resolve(root, `dist/js/${file}`), 'utf8')).join('\n');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML element IDs must be unique.');
for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(match[1]), `Missing element: ${match[1]}`);
for (const file of ['styles.css', 'workspace.css', 'icon.svg', 'js/app.js', 'js/debug.js', 'js/balance.js', 'js/devtools.js', 'js/renderer3d.js', 'js/view.js', 'crownfall-offline.html', 'source.zip']) assert(existsSync(resolve(root, 'dist', file)), `Missing asset: ${file}`);
assert(!/https?:\/\//.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'Main page should not depend on third-party networks.');
console.log('All JavaScript parses; DOM bindings, unique IDs and deliverable assets verified.');
