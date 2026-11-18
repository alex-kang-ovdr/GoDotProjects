const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const r=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(r,'game.manifest.json'),'utf8'));
assert.equal(m.id,'kingdom-rush');assert.equal(m.version,'15.1.0');assert.deepEqual(m.supportedLocales,['ko']);
assert.deepEqual(fs.readFileSync(path.join(r,'Web/index.html')),fs.readFileSync(path.join(r,'Source/Project/dist/index.html')));
assert.ok(fs.existsSync(path.join(r,'Web',m.media.cover)));
assert.match(fs.readFileSync(path.join(r,'Web/index.html'),'utf8'),/kr_frontier_v15_progress/);
assert.ok(fs.existsSync(path.join(r,'Archive/Releases/kingdom-rush-v15.1.0.zip')));
console.log('Kingdom Rush integration checks passed');
