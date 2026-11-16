import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setupConfig} from '../tools/setup.mjs';
import {build,readCatalog} from '../tools/build.mjs';
import {createApp} from '../server/app.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function temporary(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-operation-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('setup rerun preserves custom ports, share mode, OAuth, indexing and administrator hash',t=>{
  const root=temporary(t),configPath=path.join(root,'private.json'),dataDir=path.join(root,'data');
  setupConfig({configPath,settings:{adminPassword:'Test-only-password-42',adminUsername:'operator',dataDir,userPort:9180,adminUiPort:9181,publicPort:9190,adminPort:9191,shareHost:'192.0.2.10',localOnly:false}});
  let saved=JSON.parse(fs.readFileSync(configPath,'utf8'));saved.google={clientId:'test-client',clientSecret:'test-secret-never-output',redirectUri:'http://localhost:9190/api/auth/google/callback'};saved.searchIndexingEnabled=true;fs.writeFileSync(configPath,JSON.stringify(saved));
  const result=setupConfig({configPath,settings:{}}),again=JSON.parse(fs.readFileSync(configPath,'utf8'));
  assert.deepEqual(again,saved);assert.equal(result.updatedExisting,true);assert.equal(result.localOnly,false);
  assert.equal(JSON.stringify(result).includes('test-secret-never-output'),false);assert.equal(JSON.stringify(result).includes(saved.admin.passwordHash),false);
});

test('setup preserves existing HTTPS profile and explicitly rejects accidental HTTP network rewrite',t=>{
  const root=temporary(t),configPath=path.join(root,'private.json');
  setupConfig({configPath,settings:{adminPassword:'Test-only-password-42',dataDir:path.join(root,'data')}});
  const saved=JSON.parse(fs.readFileSync(configPath,'utf8'));saved.secureCookies=true;saved.userBaseUrl='https://play.example';saved.publicBaseUrl='https://api.example';saved.userOrigins=['https://play.example'];fs.writeFileSync(configPath,JSON.stringify(saved));
  setupConfig({configPath,settings:{adminUsername:'operator'}});const updated=JSON.parse(fs.readFileSync(configPath,'utf8'));assert.equal(updated.userBaseUrl,saved.userBaseUrl);assert.equal(updated.secureCookies,true);assert.equal(updated.admin.passwordHash,saved.admin.passwordHash);
  const before=fs.readFileSync(configPath,'utf8');assert.throws(()=>setupConfig({configPath,settings:{shareHost:'localhost'}}),/HTTPS/);assert.equal(fs.readFileSync(configPath,'utf8'),before);
});

test('first setup defaults to loopback, custom OAuth port, and refuses invalid config without overwriting',t=>{
  const root=temporary(t),configPath=path.join(root,'private.json');
  setupConfig({configPath,settings:{adminPassword:'Test-only-password-42',dataDir:path.join(root,'data'),publicPort:9290}});
  const saved=JSON.parse(fs.readFileSync(configPath,'utf8'));assert.equal(saved.publicHost,'127.0.0.1');assert.equal(saved.google.redirectUri,'http://localhost:9290/api/auth/google/callback');
  const before=fs.readFileSync(configPath,'utf8');assert.throws(()=>setupConfig({configPath,settings:{publicPort:8080}}),/distinct/);assert.throws(()=>setupConfig({configPath,settings:{unknownSetting:true}}),/unsupported/);assert.equal(fs.readFileSync(configPath,'utf8'),before);
  fs.writeFileSync(path.join(saved.dataDir,'maintenance.lock'),'test-owner');assert.throws(()=>setupConfig({configPath,settings:{}}),/maintenance/);assert.equal(fs.readFileSync(configPath,'utf8'),before);
});

function sourceFixture(t){
  const root=temporary(t);for(const name of ['web','games','shared','catalog'])fs.cpSync(path.join(project,name),path.join(root,name),{recursive:true});return root;
}
function addFixtureGame(root){
  const id='test-ninth-puzzle',dir=path.join(root,'games',id);fs.cpSync(path.join(root,'games','slide-puzzle'),dir,{recursive:true});
  const filename=path.join(dir,'game.manifest.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8'));manifest.id=id;manifest.slug=id;manifest.title.ko='테스트용 아홉 번째 퍼즐';manifest.title.en='Ninth Puzzle Test Fixture';manifest.seo.title.ko='등록 자동화 검증용 퍼즐';fs.writeFileSync(filename,JSON.stringify(manifest));
  const catalogFile=path.join(root,'catalog','games.json'),catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));catalog.entries.push({id,path:'games/'+id,enabled:true});fs.writeFileSync(catalogFile,JSON.stringify(catalog));return {id,catalog,catalogFile,manifestFile:filename};
}

test('a ninth fixture game is registered through folder and catalog, producing API/SEO/routes without UI edits',async t=>{
  const root=sourceFixture(t),before=fs.readFileSync(path.join(root,'web/user/app.js'),'utf8'),game=addFixtureGame(root);
  const report=build({root,config:{userBaseUrl:'http://localhost:8080'}});assert.equal(report.games,9);assert.equal(report.activeGames,9);assert.equal(fs.readFileSync(path.join(root,'web/user/app.js'),'utf8'),before);
  const html=fs.readFileSync(path.join(root,'dist/user/play',game.id,'index.html'),'utf8');assert.ok(html.includes('테스트용 아홉 번째 퍼즐'));assert.ok(html.includes('game-seo-article'));assert.ok(html.includes('/play/'+game.id+'/'));
  assert.ok(fs.readFileSync(path.join(root,'dist/user/sitemap.xml'),'utf8').includes('/play/'+game.id+'/'));assert.ok(fs.existsSync(path.join(root,'dist/user/games',game.id,'vendor/sdk.js')));
  const app=createApp({dataDir:path.join(root,'data'),publicHost:'127.0.0.1',adminHost:'127.0.0.1',publicPort:0,adminPort:0,userOrigins:['http://localhost:8080'],adminOrigins:['http://localhost:8081'],userBaseUrl:'http://localhost:8080',google:{}},{rootDir:root});
  const addresses=await app.listen();t.after(()=>app.close());const response=await fetch(`http://127.0.0.1:${addresses.public.port}/api/games`);assert.equal(response.status,200);const data=await response.json();assert.equal(data.games.length,9);assert.ok(data.games.some(g=>g.id===game.id));
});

test('disabled additions have no static detail route, and invalid catalog does not replace prior dist',t=>{
  const root=sourceFixture(t);build({root});const original=fs.readFileSync(path.join(root,'dist/user/catalog/games.json'),'utf8');
  const game=addFixtureGame(root);game.catalog.entries.at(-1).enabled=false;fs.writeFileSync(game.catalogFile,JSON.stringify(game.catalog));const disabled=build({root});assert.equal(disabled.games,9);assert.equal(disabled.activeGames,8);assert.equal(fs.existsSync(path.join(root,'dist/user/play',game.id)),false);
  const valid=fs.readFileSync(path.join(root,'dist/user/catalog/games.json'),'utf8');game.catalog.entries.push(game.catalog.entries[0]);fs.writeFileSync(game.catalogFile,JSON.stringify(game.catalog));assert.throws(()=>build({root}),/duplicate/);assert.equal(fs.readFileSync(path.join(root,'dist/user/catalog/games.json'),'utf8'),valid);assert.notEqual(original,valid);
});
