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
