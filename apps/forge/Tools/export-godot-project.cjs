'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Small dependency-free ZIP writer (stored entries, UTF-8 names). Only the
// explicitly listed project files are exported; no workspace/log credentials.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFiles(entries) {
  // Godot's project installer expects explicit parent directory entries.
  const expanded = new Map();
  for (const [filename, value] of entries) {
    const parts = filename.split('/');
    for (let i = 1; i < parts.length; i++) expanded.set(parts.slice(0, i).join('/') + '/', '');
    expanded.set(filename, value);
  }
  entries = [...expanded];
  const local = [], central = []; let offset = 0;
  for (const [filename, value] of entries) {
    const name = Buffer.from(filename), bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const crc = crc32(bytes);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(33, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(bytes.length, 18); head.writeUInt32LE(bytes.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    if (filename.endsWith('/')) record.writeUInt32LE(16, 38);
    central.push(record, name); offset += head.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function projectEntries(root, snapshot, serviceOrigin = '') {
  const entries = [];
  for (const file of ['project.godot', 'scenes/main.tscn', 'scripts/runtime_host.gd', 'scripts/tappy_view.gd']) {
    let contents = fs.readFileSync(path.join(root, 'Godot', file));
    if (file === 'project.godot' && serviceOrigin) contents = Buffer.from(contents.toString() + '\n[editor_plugins]\nenabled=PackedStringArray("res://addons/playforge_service/plugin.cfg")\n');
    entries.push([file, contents]);
  }
  const base = 'Projects/TappyChicken/';
  for (const file of ['project.json', 'settings.schema.json', 'Scenes/Main.scene.json', 'Assets/chicken.svg', 'Assets/pipe.svg', 'Assets/ground.svg']) {
    entries.push([base + file, fs.readFileSync(path.join(root, base, file))]);
  }
  entries.push([base + 'Scripts/Game.gd', snapshot.source]);
  entries.push([base + 'Gameplay.settings.json', JSON.stringify(snapshot.settings, null, 2)]);
  entries.push(['README.txt', 'PlayForge Godot source snapshot\nSaved workspace revision: ' + snapshot.revision + '\nImport this ZIP using the official Godot Web Editor Preload project ZIP control.\nThis is a separate project copy; it does not synchronize with PlayForge collaboration.\n']);
  if (serviceOrigin) {
    const addon = 'addons/playforge_service/';
    for (const file of ['plugin.cfg', 'plugin.gd']) entries.push([addon + file, fs.readFileSync(path.join(root, 'Godot', addon, file))]);
    entries.push(['service.json', JSON.stringify({ origin: serviceOrigin, revision: snapshot.revision, source_path: 'res://Projects/TappyChicken/Scripts/Game.gd' }, null, 2)]);
  }
  return entries;
}
function exportGodotProject(root, snapshot, serviceOrigin = '') { return zipFiles(projectEntries(root, snapshot, serviceOrigin)); }
module.exports = { exportGodotProject, projectEntries, zipFiles };

if (require.main === module) {
  const { ProjectStore } = require('./project-store.cjs');
  const root = path.resolve(__dirname, '..');
  const document = new ProjectStore(root).snapshot();
  const destination = path.join(root, 'Launch/PlayForge-Godot-Project.zip');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, exportGodotProject(root, document, process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4173'));
  console.log('Saved workspace revision ' + document.revision + ': ' + destination);
}
