import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {syncLocales} from '../tools/sync-locales.mjs';

test('manual locale preparation includes per-game dictionaries and preserves unrelated game dictionaries',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-locales-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'hub'),webgames=path.join(directory,'games');
  const put=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
  put(path.join(root,'shared/locale.js'),'/* locale-runtime */');
  put(path.join(root,'shared/locales/platform.js'),'/* platform-dictionary */');
  put(path.join(root,'shared/locales/games.js'),'/* common-dictionary */');
  put(path.join(root,'shared/locales/demo.js'),'/* dedicated-demo */');
  for(const surface of ['user','admin'])put(path.join(root,'web',surface,'index.html'),'<html><head></head><body></body></html>');
  put(path.join(root,'web/admin/index.html'),'<html><head><script src="/local-login-bootstrap.js"></script></head><body></body></html>');
  const entries=['demo','other'].map(id=>({id,path:id,enabled:true}));
  put(path.join(webgames,'catalog.json'),JSON.stringify({schemaVersion:1,entries}));
  for(const {id} of entries){
    put(path.join(webgames,id,'game.manifest.json'),JSON.stringify({title:{ko:id,en:id+' EN'}}));
    put(path.join(webgames,id,'Web/index.html'),'<html><head></head><body>original-content</body></html>');
  }
  syncLocales({root,webgames});
  const read=(id,name)=>fs.readFileSync(path.join(webgames,id,'Web',name),'utf8');
  assert.match(read('demo','vendor/playhub-dictionary.js'),/common-dictionary[\s\S]*dedicated-demo/);
  assert.doesNotMatch(read('other','vendor/playhub-dictionary.js'),/dedicated-demo/);
  assert.match(read('demo','index.html'),/original-content/);
  const before=read('demo','vendor/playhub-dictionary.js');
  syncLocales({root,webgames});
  assert.equal(read('demo','vendor/playhub-dictionary.js'),before);
  assert.equal((read('demo','index.html').match(/playhub-language:start/g)||[]).length,1);
  const admin=fs.readFileSync(path.join(root,'web/admin/index.html'),'utf8');
  assert.ok(admin.indexOf('local-login-bootstrap.js')<admin.indexOf('/locale.js'));
  assert.equal((admin.match(/local-login-bootstrap\.js/g)||[]).length,1);
});

test('syncLocales deploys Wave 2 catalog metadata and dedicated dictionaries to hub surfaces and games',t=>{
  const hubRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1')),'..');
  const repoRoot=path.resolve(hubRoot,'..');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-wave2-locales-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'hub'),webgames=path.join(directory,'games');
  fs.cpSync(path.join(hubRoot,'shared'),path.join(root,'shared'),{recursive:true});
  for(const surface of ['user','admin']){
    fs.mkdirSync(path.join(root,'web',surface),{recursive:true});
    fs.copyFileSync(path.join(hubRoot,'web',surface,'index.html'),path.join(root,'web',surface,'index.html'));
  }
  const catalog=JSON.parse(fs.readFileSync(path.join(repoRoot,'games/catalog.json'),'utf8'));
  fs.mkdirSync(webgames,{recursive:true});
  fs.copyFileSync(path.join(repoRoot,'games/catalog.json'),path.join(webgames,'catalog.json'));
  for(const entry of catalog.entries){
    fs.mkdirSync(path.join(webgames,entry.id,'Web'),{recursive:true});
    fs.copyFileSync(path.join(repoRoot,'games',entry.id,'game.manifest.json'),path.join(webgames,entry.id,'game.manifest.json'));
    fs.copyFileSync(path.join(repoRoot,'games',entry.id,'Web/index.html'),path.join(webgames,entry.id,'Web/index.html'));
  }
  syncLocales({root,webgames});

  const userDict=fs.readFileSync(path.join(root,'web/user/locale-data.js'),'utf8');
  const adminDict=fs.readFileSync(path.join(root,'web/admin/locale-data.js'),'utf8');
  assert.equal(userDict,adminDict);
  const sharedCore=fs.readFileSync(path.join(hubRoot,'shared/locale.js'),'utf8');
  for(const id of ['crazy-arcade','poly-bridge-2','project-zomboid','survivor-arena-g2','kingdom-rush']){
    const manifest=JSON.parse(fs.readFileSync(path.join(repoRoot,'games',id,'game.manifest.json'),'utf8'));
    assert.ok(userDict.includes(JSON.stringify(manifest.title.ko)),`user locale-data missing ${id} title`);
    assert.ok(userDict.includes(JSON.stringify(manifest.summary.ko)),`user locale-data missing ${id} summary`);
    assert.equal(fs.readFileSync(path.join(webgames,id,'Web/vendor/playhub-locale.js'),'utf8'),sharedCore);
    const gameDict=fs.readFileSync(path.join(webgames,id,'Web/vendor/playhub-dictionary.js'),'utf8');
    assert.ok(gameDict.includes(JSON.stringify(manifest.title.ko)),`game dictionary missing ${id} title`);
  }
  assert.match(fs.readFileSync(path.join(webgames,'crazy-arcade/Web/vendor/playhub-dictionary.js'),'utf8'),/Water-balloon|Trap opponents/i);
  assert.match(fs.readFileSync(path.join(webgames,'kingdom-rush/Web/vendor/playhub-dictionary.js'),'utf8'),/Kingdom Rush · 非公式タワーディフェンス/);
});
