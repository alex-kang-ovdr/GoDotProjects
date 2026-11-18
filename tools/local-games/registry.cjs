'use strict';
// One repository-backed registry for both local and deployed execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),MAIN_PORT=22999,HOST='127.0.0.1';
const ID=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.bin':'application/octet-stream'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const dayMs=86400000,seoulOffsetMs=9*3600000;
function releaseDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:undefined;
}
function releaseBadge({publishedOn,updatedOn},now=Date.now()){
 const today=Math.floor((now+seoulOffsetMs)/dayMs)*dayMs;
 const recent=date=>{
  const age=today-Date.parse(date+'T00:00:00Z');
  return age>=0&&age<14*dayMs;
 };
 if(publishedOn&&recent(publishedOn))return {kind:'new',label:'New',date:publishedOn};
 if(updatedOn&&(!publishedOn||updatedOn>publishedOn)&&recent(updatedOn))return {kind:'update',label:'Updated',date:updatedOn};
 return null;
}
function portFor(id){return 24000+crypto.createHash('sha256').update('playhub-local-v1:'+id).digest().readUInt32BE(0)%30000;}
function safeFile(base,relative){
 if(!relative||/[:%\x00-\x1f\x7f]/.test(relative)||relative.includes('\\')||relative.includes('\0')||relative.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.')))throw Error('Invalid path');
 let current=base;if(fs.lstatSync(base).isSymbolicLink())throw Error('Links forbidden');
 for(const part of relative.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Links forbidden');}
 const root=fs.realpathSync(base),real=fs.realpathSync(current);if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw Error('Outside runtime');return real;
}
function inventory(root=ROOT){
 const games=path.join(root,'games'),entries=new Map(),warnings=[];
 try{for(const e of json(path.join(games,'catalog.json')).entries||[]){if(!ID.test(e.id)||e.path!==e.id){warnings.push('Invalid catalog entry: '+String(e.id));continue;}if(entries.has(e.id))warnings.push('Duplicate catalog ID: '+e.id);entries.set(e.id,e);}}catch(e){warnings.push('Catalog unreadable: '+e.message);}
 for(const d of fs.readdirSync(games,{withFileTypes:true}))if(d.isDirectory()&&ID.test(d.name)&&!entries.has(d.name))entries.set(d.name,{id:d.name,path:d.name,unregistered:true});
 const rows=[];
 for(const e of entries.values()){
  const row={id:e.id,title:e.displayName||e.id,enabled:e.enabled===true,unregistered:!!e.unregistered,port:portFor(e.id),warnings:['원본 로컬 실행 · 전체 플레이 미검증','계정·서버 저장 및 이용 통계 없음'],blocked:null};
  try{const dir=path.join(games,e.id);if(fs.lstatSync(dir).isSymbolicLink())throw Error('Game directory link blocked');const m=json(safeFile(dir,'game.manifest.json'));if(m.id!==e.id||m.entry!=='index.html')throw Error('Manifest ID/entry mismatch');row.title=m.title?.ko||m.title?.en||row.title;row.version=m.version;row.locales=m.supportedLocales||[];row.integration=m.integration;row.manifestValid=true;safeFile(dir,'Web/index.html');
   row.publishedOn=releaseDay(m.publishedOn);row.updatedOn=releaseDay(m.updatedOn);
   if(!['legacy-localstorage','native-sdk'].includes(m.integration))row.blocked='지원되지 않는 게임 실행 계약입니다. manifest의 integration을 확인하세요.';
   if(m.capabilities?.externalNetwork?.length)row.warnings.push('외부 네트워크 기능은 로컬 실행 정책으로 차단됨');
   if(e.id==='duck-extraction')row.warnings.push('손상된 JSON 저장 또는 저장소 차단 시 초기화 실패. 저장 자동 삭제/복구 없음. 보관함 강화 효과 미구현.');
  }catch(error){row.blocked='실행 파일/manifest 검증 실패: '+error.message;}
  rows.push(row);
 }
 const ports=new Map();for(const r of rows){if(ports.has(r.port)){r.blocked='게임 포트 충돌: '+ports.get(r.port).id;ports.get(r.port).blocked='게임 포트 충돌: '+r.id;}else ports.set(r.port,r);}
 try{for(const e of json(path.join(__dirname,'pending-sources.json')))if(!entries.has(e.id))rows.push({...e,blocked:e.reason,pending:true,warnings:[e.kind==='documentation'?'문서 자료만 존재 · 실행 게임 수에 포함하지 않음':'실행 산출물 미확보 · 실행 가능 게임 수에 포함하지 않음']});}catch(e){warnings.push('Pending source list unavailable');}
 return {rows:rows.filter(row=>!row.pending).sort((a,b)=>a.id.localeCompare(b.id)),unavailable:rows.filter(row=>row.pending),warnings};
}
function deployment(root=ROOT,env=process.env){
 const configPath=path.resolve(root,env.PLAYHUB_DEPLOY_CONFIG||env.PLAYHUB_CONFIG||'hub/config/local.json');
 try{
  if(fs.statSync(configPath).size>1024*1024)throw Error();
  const value=json(configPath).userBaseUrl;
  if(typeof value!=='string'||!value.trim())throw Error();
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();
  url.pathname=url.pathname.replace(/\/+$/,'')+'/';
  return {baseUrl:url.href,configPath,error:null};
 }catch{return {baseUrl:null,configPath,error:'배포 서버 주소를 읽을 수 없습니다. 저장소의 Hub 설정에서 userBaseUrl을 확인하세요.'};}
}
function deployedBlock(row){
 if(row.pending)return row.blocked;
 if(row.unregistered||!row.enabled)return '저장소 공개 목록에 포함되지 않은 게임입니다.';
 if(!row.manifestValid)return row.blocked||'게임 manifest를 확인할 수 없습니다.';
 return null;
}

module.exports={ROOT,MAIN_PORT,HOST,MIME,esc,inventory,portFor,safeFile,deployment,deployedBlock,releaseBadge};
