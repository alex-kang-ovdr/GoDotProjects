// S2 boundary: inside hub/server only forge-gateway.mjs may load Forge code or name Forge's source tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');
const FORGE_REFERENCE = /\.\.\/\.\.\/forge\/|['"`]forge['"`]\s*,\s*['"`](Templates|Saved|server\.cjs|OfficialGodot|Tools)/;

test('hub/server reaches Forge only through forge-gateway.mjs', () => {
  const offenders = fs.readdirSync(serverDir)
    .filter(name => /\.(mjs|cjs|js)$/.test(name) && name !== 'forge-gateway.mjs')
    .filter(name => FORGE_REFERENCE.test(fs.readFileSync(path.join(serverDir, name), 'utf8')));
  assert.deepEqual(offenders, []);
  assert.match(fs.readFileSync(path.join(serverDir, 'forge-gateway.mjs'), 'utf8'), FORGE_REFERENCE);
});
