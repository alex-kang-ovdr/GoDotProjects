'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const sea=require('node:sea');
const {pathToFileURL}=require('node:url');

const LIMITS=Object.freeze({compressed:32*1024*1024,json:128*1024*1024,total:64*1024*1024,file:16*1024*1024,files:4000});
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ensure(condition,message){if(!condition)throw new Error(message);}
function safeRelative(value){
 ensure(typeof value==='string'&&value.length>0&&Buffer.byteLength(value,'utf8')<=240,'Invalid embedded file path.');
 ensure(!value.includes('\\')&&!value.startsWith('/')&&!/[\x00-\x1f<>:"|?*]/.test(value),'Unsafe embedded file path.');
 const parts=value.split('/');
 ensure(parts.every(segment=>segment&&segment!=='.'&&segment!=='..'&&segment===segment.trimEnd()&&!segment.endsWith('.')&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)),'Unsupported Windows file name in bundle.');
 ensure(value.normalize('NFC')===value,'Embedded paths must use canonical Unicode.');
 ensure(value.toLowerCase()!=='bundle-manifest.json','The extraction manifest name is reserved.');
 return value;
}
function assertNoLinks(filename){
 const absolute=path.resolve(filename),root=path.parse(absolute).root;let cursor=root;
 for(const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,segment);
  try{ensure(!fs.lstatSync(cursor).isSymbolicLink(),'PlayHub storage must not contain symbolic links or junctions.');}
  catch(error){if(error.code==='ENOENT')break;throw error;}
 }
 return absolute;
}
function parseBundle(input){
 const compressed=Buffer.from(input);ensure(compressed.length>0&&compressed.length<=LIMITS.compressed,'Embedded bundle exceeds the supported compressed size.');
 let decoded;
 try{decoded=zlib.gunzipSync(compressed,{maxOutputLength:LIMITS.json});}catch{throw new Error('Embedded bundle could not be decompressed within the size limit.');}
 let envelope;try{envelope=JSON.parse(decoded.toString('utf8'));}catch{throw new Error('Embedded bundle is not valid JSON.');}
 ensure(envelope&&typeof envelope==='object'&&!Array.isArray(envelope)&&envelope.format===1&&typeof envelope.version==='string'&&/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(envelope.version),'Unsupported embedded bundle format.');
 ensure(Object.keys(envelope).every(k=>['format','version','files'].includes(k))&&Array.isArray(envelope.files)&&envelope.files.length>0&&envelope.files.length<=LIMITS.files,'Invalid bundle file inventory.');
 const seen=new Set(),files=[];let total=0;
 for(const item of envelope.files){
  ensure(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===3&&Object.keys(item).every(k=>['path','sha256','data'].includes(k)),'Invalid embedded file record.');
  const relative=safeRelative(item.path),key=relative.toLowerCase();ensure(!seen.has(key),'Duplicate or case-colliding bundle file.');seen.add(key);
  ensure(typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)&&typeof item.data==='string'&&item.data.length<=Math.ceil(LIMITS.file/3)*4,'Invalid embedded file hash or length.');
  ensure(/^[A-Za-z0-9+/]*={0,2}$/.test(item.data),'Invalid embedded base64 data.');
  const bytes=Buffer.from(item.data,'base64');ensure(bytes.length<=LIMITS.file&&bytes.toString('base64')===item.data&&sha256(bytes)===item.sha256,'Embedded file checksum differs.');
  total+=bytes.length;ensure(total<=LIMITS.total,'Embedded files exceed the expansion limit.');files.push({path:relative,sha256:item.sha256,bytes});
 }
 for(const relative of seen){
  const parts=relative.split('/');for(let i=1;i<parts.length;i++)ensure(!seen.has(parts.slice(0,i).join('/')),'A bundle file also acts as a parent directory.');
 }
 ensure(files.some(f=>f.path==='portable/launch.mjs')&&files.some(f=>f.path==='package.json'),'The portable runtime entry or package metadata is missing.');
 return {format:1,version:envelope.version,files,totalBytes:total,sha256:sha256(compressed)};
}
function verifyCache(directory,bundle){
 assertNoLinks(directory);ensure(fs.lstatSync(directory).isDirectory(),'Application cache is not a directory.');
 for(const file of bundle.files){
  const target=assertNoLinks(path.join(directory,...file.path.split('/')));const stat=fs.lstatSync(target);
  ensure(stat.isFile()&&stat.size===file.bytes.length,'Existing application cache contains a missing or changed file.');
  ensure(sha256(fs.readFileSync(target))===file.sha256,'Existing application cache checksum differs. Preserve the data folder and repair this application cache.');
 }
 return directory;
}
function extractBundle(input,instanceRoot){
 const bundle=parseBundle(input),instance=assertNoLinks(instanceRoot);fs.mkdirSync(instance,{recursive:true,mode:0o700});assertNoLinks(instance);
 const parent=assertNoLinks(path.join(instance,'app'));fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const destination=path.join(parent,bundle.sha256);
 if(fs.existsSync(destination)){verifyCache(destination,bundle);return {appRoot:destination,instanceRoot:instance,version:bundle.version,payloadSha256:bundle.sha256,fileCount:bundle.files.length,totalBytes:bundle.totalBytes,reused:true};}
 const staging=path.join(parent,'staging-'+bundle.sha256.slice(0,12)+'-'+crypto.randomUUID());fs.mkdirSync(staging,{mode:0o700});let ownStaging=true;
 try{
  for(const file of bundle.files){
   const target=path.join(staging,...file.path.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   const fd=fs.openSync(target,'wx',0o600);try{fs.writeFileSync(fd,file.bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  fs.writeFileSync(path.join(staging,'bundle-manifest.json'),JSON.stringify({format:1,version:bundle.version,payloadSha256:bundle.sha256,files:bundle.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes.length}))},null,2),{flag:'wx',mode:0o600});
  try{fs.renameSync(staging,destination);ownStaging=false;}
  catch(error){if(!fs.existsSync(destination))throw error;verifyCache(destination,bundle);}
  verifyCache(destination,bundle);
  return {appRoot:destination,instanceRoot:instance,version:bundle.version,payloadSha256:bundle.sha256,fileCount:bundle.files.length,totalBytes:bundle.totalBytes,reused:false};
 }finally{if(ownStaging&&fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true});}
}
function parseBootstrapArgs(argv,{isSea=false}={}){
 const result={args:[],dataDir:null,bundlePath:null,packageCheck:false};
 for(let i=0;i<argv.length;i++){
  let key=argv[i],inline;const equal=key.indexOf('=');if(equal>0){inline=key.slice(equal+1);key=key.slice(0,equal);}
  if(key==='--data-dir'||key==='--bundle'){
   const property=key==='--data-dir'?'dataDir':'bundlePath';ensure(!result[property],'Duplicate launcher storage/bundle argument.');
   ensure(!(isSea&&key==='--bundle'),'An embedded executable cannot replace its bundle from the command line.');
   const value=inline===undefined?argv[++i]:inline;ensure(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'The launcher argument requires a path.');result[property]=path.resolve(value);
  }else if(key==='--package-check'){ensure(inline===undefined&&!result.packageCheck,'Duplicate or invalid package-check flag.');result.packageCheck=true;}
  else result.args.push(argv[i]);
 }
 return result;
}
function defaultInstanceRoot(){
 if(process.platform==='win32')return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'PlayHub');
 return path.join(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share'),'PlayHub');
}
async function runEntry(argv=process.argv.slice(2)){
 const isSea=sea.isSea(),options=parseBootstrapArgs(argv,{isSea});let compressed;
 if(isSea)compressed=Buffer.from(sea.getAsset('playhub.bundle.gz'));
 else{
  ensure(options.bundlePath,'Development launcher usage: node portable/launcher.cjs --bundle <playhub.bundle.gz> [--data-dir <folder>].');
  assertNoLinks(options.bundlePath);const stat=fs.lstatSync(options.bundlePath);ensure(stat.isFile()&&stat.size<=LIMITS.compressed,'Invalid development bundle file.');compressed=fs.readFileSync(options.bundlePath);
 }
 const extracted=extractBundle(compressed,options.dataDir||defaultInstanceRoot());
 const entry=await import(pathToFileURL(path.join(extracted.appRoot,'portable','launch.mjs')).href);
 ensure(typeof entry.run==='function','Portable launch.mjs must export run(context).');
 if(options.packageCheck){
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');let sqlite;
  try{sqlite=db.prepare('SELECT 42 AS value').get().value;}finally{db.close();}
  const report={ok:true,kind:'portable-package-check',version:extracted.version,sea:isSea,platform:process.platform,node:process.version,payloadSha256:extracted.payloadSha256,fileCount:extracted.fileCount,totalBytes:extracted.totalBytes,sqliteResult:sqlite,esmEntryImported:true,applicationStarted:false};console.log(JSON.stringify(report));return report;
 }
 return entry.run({appRoot:extracted.appRoot,instanceRoot:extracted.instanceRoot,args:options.args,executable:process.execPath,sea:isSea,launcherPath:isSea?null:__filename});
}
async function showFatal(error){
 console.error('PlayHub 실행 준비에 실패했습니다: '+error.message);process.exitCode=1;
 // Keep a double-clicked Windows console readable. Piped worker/automation
 // processes never wait for keyboard input or consume their JSON/IPC input.
 if(process.platform==='win32'&&sea.isSea()&&process.stdin.isTTY&&process.stdout.isTTY){
  console.error('오류 내용을 확인한 뒤 Enter 키를 누르면 창이 닫힙니다.');
  await new Promise(resolve=>{const finish=()=>{process.stdin.removeListener('data',finish);process.stdin.removeListener('end',finish);process.stdin.pause();resolve();};process.stdin.once('data',finish);process.stdin.once('end',finish);process.stdin.resume();});
 }
}
module.exports={LIMITS,safeRelative,assertNoLinks,parseBundle,extractBundle,verifyCache,parseBootstrapArgs,defaultInstanceRoot,runEntry};
if(sea.isSea()||require.main===module)runEntry().catch(showFatal);
