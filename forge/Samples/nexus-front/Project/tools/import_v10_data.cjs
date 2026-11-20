#!/usr/bin/env node
// Reproducible optional importer. Runtime Godot needs no Node or JavaScript.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(root, '..', 'nexus_front'));
const runtimePath = path.join(source, 'dist', 'restored-data.js');
const data = require(runtimePath);
const {MAP} = require(path.join(source, 'dist', 'game.js'));
if (data.version !== '16.22.1' || data.playableHeroes.length !== 10 || data.shopItems.length !== 25) {
  throw new Error('Expected the preserved v10 / Data Dragon 16.22.1 snapshot');
}
fs.mkdirSync(path.join(root, 'data'), {recursive:true});
fs.writeFileSync(path.join(root, 'data', 'restored_data.json'), JSON.stringify(data));
fs.writeFileSync(path.join(root, 'data', 'map.json'), JSON.stringify(MAP, null, 2));
for (const dir of ['champions', 'items']) {
  fs.cpSync(path.join(source, 'dist', 'assets', dir), path.join(root, 'assets', dir), {recursive:true});
}
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const images = data.playableHeroes.concat(data.shopItems).map(e=> ({path:e.portrait,sha256:sha(path.join(root,e.portrait))}));
const manifest = {
  port:'Nexus Front Godot v11', sourceVersion:'Nexus Front web v10',
  sourceCommit:'d53d9e1df6525719f0d791010235090119451d45', dataset:data.version,
  originalRuntimeSHA256:sha(runtimePath), exportedJSONSHA256:sha(path.join(root,'data','restored_data.json')),
  originalInputSHA256:sha(path.join(source,'data','restored-input.json')),
  champions:data.champions.length, spells:data.champions.reduce((n,c)=>n+c.spells.length,0),
  items:data.items.length, playable:data.playableHeroes.length, shop:data.shopItems.length,
  images, dataIdentity:'All exported fields preserve original JSON values; all 35 PNG files copied byte for byte.',
  runtime:'Native GDScript; no JavaScript engine, browser, WebView, Node or external network is used to play.'
};
fs.writeFileSync(path.join(root,'data','provenance.json'), JSON.stringify(manifest,null,2));
console.log(JSON.stringify({champions:manifest.champions,spells:manifest.spells,items:manifest.items,playable:manifest.playable,shop:manifest.shop,images:images.length,jsonSHA256:manifest.exportedJSONSHA256}, null, 2));
