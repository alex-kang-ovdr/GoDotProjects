import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadLabContext() {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, { id, value: '', textContent: '', files: [], onclick: null, onchange: null });
    }
    return elements.get(id);
  };
  getEl('mode').value = 'luau';
  getEl('sample').value = 'move';

  const context = {
    document: { getElementById: getEl },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: class MockBlob { constructor(parts) { this.parts = parts; } },
    DOMParser: class MockDOMParser { parseFromString() { return { documentElement: { tagName: 'roblox' }, querySelector: () => null, getElementsByTagName: () => [] }; } },
    setTimeout: () => 0,
    Set,
    JSON
  };
  const code = fs.readFileSync(path.join(root, 'lab', 'converter.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'lab/converter.js' });
  return { context, elements };
}

test('Converter Lab v0.1 files exist and converter.js executes cleanly', () => {
  for (const name of ['index.html', 'converter.js', 'README.md']) {
    const file = path.join(root, 'lab', name);
    assert.ok(fs.existsSync(file), `missing lab/${name}`);
    assert.ok(fs.statSync(file).size > 0, `empty lab/${name}`);
  }
  const { context, elements } = loadLabContext();
  assert.match(elements.get('output').value, /extends Node3D/);
  assert.match(elements.get('output').value, /Vector3\(/);

  const unsupported = context.convertLuau('local ds = game:GetService("DataStoreService")\nlocal s = ds:GetDataStore("Save")');
  assert.ok(
    unsupported.diagnostics.some((d) => d.message.includes('DataStoreService')),
    'DataStoreService must produce an explicit unsupported diagnostic'
  );
});

test('core-api.v0.json contains required metadata, D/A/R/X/V grades, and capability fields', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'mappings', 'core-api.v0.json'), 'utf8'));
  assert.equal(registry.source_version, 'roblox-studio-luau-2026-11');
  assert.equal(registry.target_version, '4.7.2');
  assert.equal(registry.mapping_version, '0.1.0');
  assert.ok(Array.isArray(registry.entries) && registry.entries.length >= 10);

  const grades = new Set();
  for (const entry of registry.entries) {
    assert.ok(['D', 'A', 'R', 'X', 'V'].includes(entry.grade), `invalid grade on ${entry.id}`);
    grades.add(entry.grade);
    for (const key of ['source', 'context', 'target', 'transforms', 'validation', 'fallback']) {
      assert.ok(entry[key] !== undefined, `${entry.id} missing ${key}`);
    }
    assert.ok(entry.source.class && entry.source.member && entry.source.kind);
    assert.ok(entry.target.strategy);
  }
  assert.deepEqual([...grades].sort(), ['A', 'D', 'R', 'V', 'X']);
});
