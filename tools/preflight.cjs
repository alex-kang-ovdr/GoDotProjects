"use strict";
const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const isFile=p=>{try{return typeof p==='string'&&path.isAbsolute(p)&&fs.statSync(p).isFile();}catch{return false;}};
const loopback=new Set(['127.0.0.1','localhost','::1']);
function check(component,{root=ROOT,env=process.env,nodeVersion=process.versions.node}={}){
 const issues=[];const major=Number(nodeVersion.split('.')[0]);const minimum=component==='hub'?24:22;
 if(!['hub','forge','game','engine'].includes(component))return {component,ok:false,issues:['Unknown component']};
 if(!Number.isInteger(major)||major<minimum)issues.push(`Node ${minimum}+ required (current ${nodeVersion})`);
 const present=p=>{if(!fs.existsSync(p))issues.push('Missing required file: '+path.relative(root,p));};
 let command={executable:process.execPath,args:[],cwd:root};
 if(component==='hub'){
  const app=path.join(root,'hub');present(path.join(app,'server/index.mjs'));present(path.join(app,'package.json'));
  const config=env.PLAYHUB_CONFIG?path.resolve(env.PLAYHUB_CONFIG):path.join(app,'config/local.json');
  try{
   const value=JSON.parse(fs.readFileSync(config,'utf8').replace(/^\uFEFF/,''));
   if(!loopback.has(value.publicHost)||!loopback.has(value.adminHost))issues.push('Hub publicHost and adminHost must explicitly be loopback; example config is not launchable');
   for(const k of ['publicPort','adminPort'])if(!Number.isInteger(value[k])||value[k]<1||value[k]>65535)issues.push('Hub '+k+' must be 1..65535');
   if(value.publicPort===value.adminPort)issues.push('Hub public/admin ports must differ');
   if(typeof value.dataDir!=='string'||!path.isAbsolute(value.dataDir))issues.push('Hub dataDir must be an explicit absolute private path');
  }catch{issues.push('A valid operator-supplied PLAYHUB_CONFIG/config/local.json is required; no config or credentials are generated');}
  command={executable:process.execPath,args:['server/index.mjs','--config',config],cwd:app};
 }
 if(component==='forge'){
  const app=path.join(root,'forge');present(path.join(app,'server.cjs'));present(path.join(app,'package.json'));
  if(env.HOST&&!loopback.has(env.HOST))issues.push('Forge HOST must be loopback');
  const port=Number(env.PORT||4173);if(!Number.isInteger(port)||port<1||port>65535)issues.push('Forge PORT must be 1..65535');
  try{const pkg=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));for(const dependency of Object.keys(pkg.dependencies||{})){
    try{require.resolve(dependency,{paths:[app]});}catch{issues.push('Missing Forge dependency: '+dependency+' (install explicitly; launcher never installs)');}
  }}catch{issues.push('Forge package.json is unreadable');}
  const engine=env.GODOT_BIN;if(!isFile(engine))issues.push('Explicit GODOT_BIN is required; source archive contains no native engine');
  if(!fs.existsSync(path.join(app,'OfficialGodot/vendor/godot.editor.js')))issues.push('Official Godot browser editor engine is absent; provision a separately verified engine package');
  command={executable:process.execPath,args:['server.cjs'],cwd:app};
 }
 if(component==='engine'){
  const exe=env.GODOT_BIN;
  if(!isFile(exe))issues.push('Explicit GODOT_BIN executable file required; godot-engine is source only and is never auto-launched');
  command={executable:exe,args:['--project-manager'],cwd:root};
 }
 if(component==='game'){
  const games=path.resolve(root,'games');const game=env.PLAYHUB_GAME_DIR?path.resolve(games,env.PLAYHUB_GAME_DIR):games;
  const relative=path.relative(games,game);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))issues.push('PLAYHUB_GAME_DIR must stay within games');
  present(path.join(game,'index.html'));command={cwd:game,port:Number(env.PLAYHUB_GAME_PORT||4180)};
  if(!Number.isInteger(command.port)||command.port<1||command.port>65535)issues.push('PLAYHUB_GAME_PORT must be 1..65535');
 }
 return {component,ok:issues.length===0,issues,command};
}
if(require.main===module){const component=process.argv[2]||'all';const reports=(component==='all'?['hub','forge','game','engine']:[component]).map(c=>check(c));
 for(const r of reports)console.log(JSON.stringify({component:r.component,ok:r.ok,issues:r.issues}));process.exitCode=reports.every(r=>r.ok)?0:1;}
module.exports={check,ROOT};
