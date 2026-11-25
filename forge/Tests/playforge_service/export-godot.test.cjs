'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { exportGodotProject, projectEntries } = require('../../Tools/export-godot-project.cjs');

test('service project enables its plugin and supplies the root config it reads', () => {
  const files = new Map(projectEntries(path.resolve(__dirname, '../..'), { source: 'extends RefCounted', settings: {}, revision: 9 }, 'https://playforge.example'));
  const config = JSON.parse(files.get('service.json'));
  assert.equal(config.revision, 9);
  assert.equal(config.origin, 'https://playforge.example');
  assert.ok(files.has(config.source_path.replace('res://', '')));
  assert.match(files.get('project.godot').toString(), /enabled=PackedStringArray\("res:\/\/addons\/playforge_service\/plugin.cfg"\)/);
  assert.match(files.get('addons/playforge_service/plugin.gd').toString(), /CONFIG_PATH := "res:\/\/service.json"/);
});

test('official-editor ZIP contains current shared source/settings and self-contained resources only', () => {
  const source = 'extends RefCounted\n# shared workspace revision test\n';
  const zip = exportGodotProject(path.resolve(__dirname, '../..'), { source, settings: { gravity: 777 }, revision: 123 });
  const entries = new Map(); let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString('utf8');
    const start = offset + 30 + nameSize;
    entries.set(name, zip.subarray(start, start + size).toString('utf8')); offset = start + size;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal([...entries.keys()].filter(name => !name.endsWith('/')).length, 13);
  assert.ok(entries.has('Projects/TappyChicken/Scripts/'));
  for (const name of entries.keys()) {
    const parent = name.replace(/\/$/, '').split('/').slice(0, -1).join('/');
    if (parent) assert.ok(entries.has(parent + '/'), 'ZIP parent directory missing: ' + name);
  }
  assert.equal(entries.get('Projects/TappyChicken/Scripts/Game.gd'), source);
  assert.deepEqual(JSON.parse(entries.get('Projects/TappyChicken/Gameplay.settings.json')), { gravity: 777 });
  assert.match(entries.get('README.txt'), /revision: 123/);
  assert.match(entries.get('project.godot'), /res:\/\/scenes\/main.tscn/);
  assert.match(entries.get('scripts/runtime_host.gd'), /res:\/\/Projects\/TappyChicken\/project.json/);
  assert.ok([...entries.keys()].every(name => !name.includes('..') && !/Saved|Workspace|node_modules/.test(name)));
});
