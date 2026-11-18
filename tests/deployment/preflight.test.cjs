"use strict";
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {check}=require('../../tools/preflight.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('Node22 cannot launch Hub and empty engine cannot report success',t=>{const root=fixture(t);assert.ok(check('hub',{root,env:{},nodeVersion:'22.16.0'}).issues.some(x=>x.includes('Node 24')));assert.equal(check('engine',{root,env:{},nodeVersion:'24.0.0'}).ok,false);});
test('Hub rejects public bind and absent private config, accepts explicit loopback prerequisites',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'hub/server'),{recursive:true});fs.writeFileSync(path.join(root,'hub/server/index.mjs'),'');fs.writeFileSync(path.join(root,'hub/package.json'),'{}');
 const config=path.join(root,'operator.json');const value={publicHost:'0.0.0.0',adminHost:'127.0.0.1',publicPort:8090,adminPort:8091,dataDir:path.join(root,'private')};fs.writeFileSync(config,JSON.stringify(value));
 assert.equal(check('hub',{root,env:{PLAYHUB_CONFIG:config},nodeVersion:'24.0.0'}).ok,false);value.publicHost='127.0.0.1';fs.writeFileSync(config,JSON.stringify(value));assert.equal(check('hub',{root,env:{PLAYHUB_CONFIG:config},nodeVersion:'24.0.0'}).ok,true);
});
test('game launcher confines path and requires index',t=>{const root=fixture(t);assert.equal(check('game',{root,env:{PLAYHUB_GAME_DIR:'../private'},nodeVersion:'24.0.0'}).ok,false);fs.mkdirSync(path.join(root,'games/demo'),{recursive:true});fs.writeFileSync(path.join(root,'games/demo/index.html'),'ok');assert.equal(check('game',{root,env:{PLAYHUB_GAME_DIR:'demo'},nodeVersion:'24.0.0'}).ok,true);});
test('BAT entrypoints call launcher and never stop processes or change firewall',()=>{for(const name of ['Hub','Forge','Game','Engine']){const text=fs.readFileSync(path.join(__dirname,'../../tools/Run_'+name+'.bat'),'utf8');assert.match(text,/launch\.cjs/);assert.doesNotMatch(text,/taskkill|Stop-Process|netsh|ExecutionPolicy/i);}});

test('flat tools root and source-only Godot never act as executable',t=>{const {ROOT}=require('../../tools/preflight.cjs');assert.equal(ROOT,path.resolve(__dirname,'../..'));const root=fixture(t);const source=path.join(root,'godot-engine');fs.mkdirSync(source);assert.equal(check('engine',{root,env:{GODOT_BIN:source},nodeVersion:'24.0.0'}).ok,false);assert.equal(check('engine',{root,env:{},nodeVersion:'24.0.0'}).ok,false);const exe=path.join(root,'Godot.exe');fs.writeFileSync(exe,'fixture only, never executed');assert.equal(check('engine',{root,env:{GODOT_BIN:exe},nodeVersion:'24.0.0'}).ok,true);});
