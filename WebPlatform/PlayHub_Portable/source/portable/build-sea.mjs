import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {gameLockPath,readGameLock} from './game-workspace.mjs';

export const PIN=Object.freeze({nodeVersion:'v24.22.1',nodeZipUrl:'https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip',nodeZipSha256:'d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5',nodeExeSha256:'d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',nodeLicenseSha256:'ed34dd8e3f0a78dbaf00d0444ce8e285b015b765379c2e17880455f70370f8e9',postjectVersion:'1.0.0-alpha.6',postjectUrl:'https://registry.npmjs.org/postject/-/postject-1.0.0-alpha.6.tgz',postjectTarSha256:'d1447b53e87d49ddaf7fb3350c870afafa72760eca47f6d5cce4cefd537e7d92',postjectApiSha256:'88931f26b4d3e99e08dc8219a45f576986952fad4d0c78444d27048232b2881b'});
export const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),bootstrap=require('./launcher.cjs');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const TOOLS=['build.mjs','setup.mjs','backup.mjs','restore-data.mjs','dev.mjs','smoke.mjs','check-stack.mjs','preview-ports.ps1'];
const FUSE='NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const forbiddenContent=/\.(?:exe|dll|sqlite(?:3)?(?:-wal|-shm)?|db(?:-wal|-shm)?|pem|key|pfx|p12|ps1|cmd|bat)$/i;
function readRegular(filename){bootstrap.assertNoLinks(filename);const stat=fs.lstatSync(filename);ensure(stat.isFile(),'Build input must be a regular file.');return fs.readFileSync(filename);}
export function createBundle({root=DEFAULT_ROOT,nodeLicenseText}={}){
 root=path.resolve(root);ensure(typeof nodeLicenseText==='string'&&nodeLicenseText.length>0,'The complete Node license must be supplied.');
 const pkg=JSON.parse(readRegular(path.join(root,'package.json')));ensure(pkg.version==='0.3.0','This portable release expects package version 0.3.0.');
 for(const key of ['dependencies','optionalDependencies','peerDependencies'])ensure(!pkg[key]||Object.keys(pkg[key]).length===0,'The portable runtime must not require external npm packages.');
 const items=[];
 const append=(relative,bytes)=>{bootstrap.safeRelative(relative);ensure(bytes.length<=bootstrap.LIMITS.file,'A runtime file exceeds the per-file size limit.');items.push({path:relative,sha256:sha256(bytes),data:bytes.toString('base64')});};
 const walk=relative=>{
  const absolute=path.join(root,...relative.split('/'));bootstrap.assertNoLinks(absolute);const stat=fs.lstatSync(absolute);
  ensure(!stat.isSymbolicLink(),'Symbolic links/junctions cannot be packaged.');
  if(stat.isDirectory())for(const name of fs.readdirSync(absolute).sort()){
   if(name.startsWith('.')||['node_modules','reports','tests','data','runtime','build-cache','build-tools'].includes(name))continue;walk(relative+'/'+name);
  }
  else{
   ensure(stat.isFile(),'Special files cannot be packaged.');
   ensure(!forbiddenContent.test(relative),'Executable, database, secret, or shell files are not permitted in a runtime content tree.');
   append(relative,readRegular(absolute));
  }
 };
 append('package.json',readRegular(path.join(root,'package.json')));
 for(const directory of ['server','web','shared'])walk(directory);
 const gameLock=readGameLock(root);
 if(gameLock){
  for(const [relative,expected] of gameLock){
   ensure(!forbiddenContent.test(relative),'Executable, database, secret, or shell files are not permitted in a game tree.');
   const bytes=readRegular(path.join(root,...relative.split('/')));
   ensure(sha256(bytes)===expected,'Generated WebGames file differs from its inventory: '+relative);
   append(relative,bytes);
  }
  walk(gameLockPath);
 }else for(const directory of ['games','catalog'])walk(directory);
 for(const tool of TOOLS)append('tools/'+tool,readRegular(path.join(root,'tools',tool)));
 append('config/example.json',readRegular(path.join(root,'config','example.json')));
 const portable=path.join(root,'portable');
 for(const name of fs.readdirSync(portable).sort()){
  if(!/\.(?:mjs|ps1)$/.test(name)||name==='build-sea.mjs')continue;
  append('portable/'+name,readRegular(path.join(portable,name)));
 }
 append('licenses/Node-LICENSE.txt',Buffer.from(nodeLicenseText));
 append('licenses/PORTABLE-NOTICES.txt',Buffer.from('PlayHub 0.3.0 includes the Node.js runtime. The complete Node.js and bundled third-party notices are in Node-LICENSE.txt.\nThis executable is a modified Node.js single executable application; it is not signed by the Node.js distributors.\nRebex Tiny Web Server is not included. The launcher uses a copy already supplied by the user.\n'));
 items.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const required=['portable/launch.mjs','server/app.mjs','server/db.mjs','web/user/index.html','web/admin/index.html','catalog/games.json'];
 for(const name of required)ensure(items.some(f=>f.path===name),'Required portable runtime file is missing: '+name);
 const envelope={format:1,version:pkg.version,files:items},buffer=gzipSync(Buffer.from(JSON.stringify(envelope)),{level:9});
 const parsed=bootstrap.parseBundle(buffer);
 return {buffer,manifest:{format:1,version:pkg.version,payloadSha256:parsed.sha256,fileCount:items.length,compressedBytes:buffer.length,expandedFileBytes:parsed.totalBytes,files:items.map(f=>({path:f.path,sha256:f.sha256,bytes:Buffer.from(f.data,'base64').length}))}};
}
export function stripPeSignature(filename){
 let bytes=readRegular(filename);ensure(bytes.length>=64&&bytes.toString('ascii',0,2)==='MZ','Not a PE image.');
 const pe=bytes.readUInt32LE(0x3c);ensure(pe+24<=bytes.length&&bytes.toString('binary',pe,pe+4)==='PE\0\0','Invalid PE header.');
 const optional=pe+24,sizeOptional=bytes.readUInt16LE(pe+20),magic=bytes.readUInt16LE(optional),directories=optional+(magic===0x20b?112:magic===0x10b?96:NaN);
 ensure(Number.isInteger(directories)&&optional+sizeOptional<=bytes.length&&bytes.readUInt32LE(directories-4)>=5&&directories+40<=optional+sizeOptional,'Unsupported PE optional header.');
 const entry=directories+32,offset=bytes.readUInt32LE(entry),size=bytes.readUInt32LE(entry+4),count=bytes.readUInt16LE(pe+6),table=optional+sizeOptional;let rawEnd=0;
 ensure(table+count*40<=bytes.length,'Invalid PE section table.');
 for(let i=0;i<count;i++){const s=table+i*40;rawEnd=Math.max(rawEnd,bytes.readUInt32LE(s+20)+bytes.readUInt32LE(s+16));}
 ensure((offset===0)===(size===0)&&offset+size<=bytes.length&&(!size||offset>=rawEnd),'Certificate table overlaps the mapped image or is invalid.');
 bytes.writeUInt32LE(0,entry);bytes.writeUInt32LE(0,entry+4);bytes.writeUInt32LE(0,optional+64);
 const truncated=size>0&&offset+size===bytes.length;if(truncated)bytes=bytes.subarray(0,offset);fs.writeFileSync(filename,bytes);
 return {originalCertificatePresent:size>0,certificateDirectoryCleared:true,removedTrailingBytes:truncated?size:0};
}
export function inspectPeSea(filename,expectedBlob){
 const data=readRegular(filename),u16=o=>data.readUInt16LE(o),u32=o=>data.readUInt32LE(o);ensure(data.toString('ascii',0,2)==='MZ','Expected Windows PE output.');
 const pe=u32(0x3c);ensure(data.toString('binary',pe,pe+4)==='PE\0\0'&&u16(pe+4)===0x8664,'Expected Windows x64 PE.');
 const optional=pe+24;ensure(u16(optional)===0x20b,'Expected PE32+.');const table=optional+u16(pe+20),sections=[];
 for(let i=0;i<u16(pe+6);i++){const s=table+i*40;sections.push({rva:u32(s+12),virtual:u32(s+8),size:u32(s+16),offset:u32(s+20)});}
 const fromRva=rva=>{const s=sections.find(s=>s.rva<=rva&&rva<s.rva+Math.max(s.virtual,s.size));ensure(s,'PE resource RVA is outside mapped sections.');return s.offset+rva-s.rva;};
 const base=fromRva(u32(optional+112+16)),resources=[];let visited=0;
 function walk(relative,names){
  ensure(++visited<=4096&&names.length<4,'Invalid PE resource tree.');const start=base+relative,count=u16(start+12)+u16(start+14);ensure(count<=4096,'Invalid PE resource entry count.');
  for(let i=0;i<count;i++){
   const e=start+16+i*8,n=u32(e),target=u32(e+4);let label=n;
   if(n&0x80000000){const at=base+(n&0x7fffffff),length=u16(at);ensure(length<=512,'Invalid PE resource name.');label=data.toString('utf16le',at+2,at+2+length*2);}
   const full=[...names,label];
   if(target&0x80000000)walk(target&0x7fffffff,full);
   else if(full.includes('NODE_SEA_BLOB')){const at=base+target,size=u32(at+4),offset=fromRva(u32(at));ensure(offset+size<=data.length,'SEA resource exceeds the image.');const bytes=data.subarray(offset,offset+size);resources.push({path:full,bytes:size,sha256:sha256(bytes),matches:bytes.equals(expectedBlob)});}
  }
 }
 walk(0,[]);ensure(resources.length===1&&resources[0].matches&&resources[0].path[0]===10,'The PE resource does not match the prepared SEA blob.');
 ensure(data.includes(Buffer.from(FUSE+':1')),'SEA sentinel fuse was not enabled.');
 ensure(u32(optional+112+32)===0&&u32(optional+112+36)===0,'A stale Authenticode certificate remains in the modified image.');
 return {format:'PE32+',architecture:'x64',subsystem:u16(optional+68),seaResource:resources[0],fuseEnabled:true,authenticode:'unsigned',windowsExecuted:false};
}
function runNode(args,options={}){const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:60000,maxBuffer:1024*1024,...options});ensure(result.status===0,'Node build step failed: '+(result.stderr||result.stdout||result.error?.message||'unknown failure').slice(0,1000));return result;}
export async function buildSea({root=DEFAULT_ROOT,target='win-x64',nodeExe,nodeLicense,postjectApi,output,reportPath,webgames}={}){
 root=path.resolve(root);ensure(process.version===PIN.nodeVersion,'Build with '+PIN.nodeVersion+' to match the pinned Windows runtime.');
 ensure(['win-x64','linux-x64'].includes(target),'Supported SEA targets: win-x64 or linux-x64.');ensure(target!=='linux-x64'||(process.platform==='linux'&&process.arch==='x64'),'Linux proof requires a Linux x64 builder.');
 ensure(nodeLicense&&postjectApi,'Provide --node-license and --postject-api build inputs.');
 const license=readRegular(path.resolve(nodeLicense));ensure(sha256(license)===PIN.nodeLicenseSha256,'Node LICENSE differs from the verified official archive.');
 const injectorFile=path.resolve(postjectApi),injectorBytes=readRegular(injectorFile);ensure(sha256(injectorBytes)===PIN.postjectApiSha256,'postject API differs from the pinned verified build tool.');
 const base=target==='win-x64'?path.resolve(nodeExe||''):process.execPath;
 if(target==='win-x64'){ensure(nodeExe,'Provide the verified Windows node.exe.');ensure(sha256(readRegular(base))===PIN.nodeExeSha256,'Windows node.exe differs from the official checksum.');}
 const buildModule=await import(pathToFileURL(path.join(root,'tools/build.mjs')).href);ensure(typeof buildModule.readCatalog==='function','Catalog build module is missing.');
 if(buildModule.syncCheckoutGames)await buildModule.syncCheckoutGames({root,webgames});
 buildModule.readCatalog(root);
 const bundle=createBundle({root,nodeLicenseText:license.toString('utf8')});
 const destination=path.resolve(output||path.join(root,'..','PlayHub_Portable',target==='win-x64'?'PlayHub.exe':'PlayHub-linux'));bootstrap.assertNoLinks(destination);
 ensure(target!=='win-x64'||/\.exe$/i.test(destination),'Windows SEA output must have the .exe extension.');
 const manifestFile=destination+'.bundle.json',compressedFile=destination+'.bundle.gz',reportFile=path.resolve(reportPath||destination+'.build.json');
 const artifactPaths=[destination,manifestFile,compressedFile,reportFile];
 const comparison=p=>process.platform==='win32'?p.toLowerCase():p;
 ensure(new Set(artifactPaths.map(comparison)).size===artifactPaths.length,'Build output, report, and bundle paths must differ.');
 const protectedFiles=[path.resolve(nodeLicense),injectorFile,path.resolve(base),path.join(root,'portable/launcher.cjs'),path.join(root,'portable/build-sea.mjs'),...bundle.manifest.files.map(f=>path.join(root,...f.path.split('/')))];
 for(const artifact of artifactPaths){bootstrap.assertNoLinks(artifact);ensure(!protectedFiles.some(p=>comparison(p)===comparison(artifact)),'A build artifact cannot overwrite a source or verified build input.');}
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-sea-build-'));let candidate;
 try{
  const bundleFile=path.join(temporary,'playhub.bundle.gz');fs.writeFileSync(bundleFile,bundle.buffer);
  const blobFile=path.join(temporary,'playhub.blob'),configuration=path.join(temporary,'sea-config.json');
  fs.writeFileSync(configuration,JSON.stringify({main:path.join(root,'portable/launcher.cjs'),output:blobFile,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false,execArgvExtension:'none',assets:{'playhub.bundle.gz':bundleFile}}));
  runNode(['--check',path.join(root,'portable/launcher.cjs')]);runNode(['--experimental-sea-config',configuration]);
  const blob=fs.readFileSync(blobFile);candidate=path.join(path.dirname(destination),'.playhub-build-'+randomUUID()+(target==='win-x64'?'.exe':''));fs.copyFileSync(base,candidate);
  let signatureRemoval=null;if(target==='win-x64')signatureRemoval=stripPeSignature(candidate);else fs.chmodSync(candidate,0o700);
  const {inject}=require(injectorFile);await inject(candidate,'NODE_SEA_BLOB',blob,{sentinelFuse:FUSE});
  let binaryInspection,packageCheck=null;
  if(target==='win-x64')binaryInspection=inspectPeSea(candidate,blob);
  else{
   ensure(fs.readFileSync(candidate).includes(Buffer.from(FUSE+':1')),'Linux SEA fuse was not enabled.');
   const probeRoot=path.join(temporary,'package-check');const probe=spawnSync(candidate,['--package-check','--data-dir',probeRoot],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
   ensure(probe.status===0,'Linux SEA package check failed: '+(probe.stderr||probe.stdout||'unknown failure').slice(0,1000));
   try{packageCheck=JSON.parse(probe.stdout.trim());}catch{throw new Error('Linux SEA package check did not return JSON.');}
   ensure(packageCheck.ok&&packageCheck.sea&&packageCheck.esmEntryImported&&packageCheck.sqliteResult===42&&packageCheck.payloadSha256===bundle.manifest.payloadSha256&&packageCheck.fileCount===bundle.manifest.fileCount,'Linux SEA did not confirm the expected embedded ESM/SQLite payload.');
   binaryInspection={format:'ELF',architecture:'x64',fuseEnabled:true,linuxExecuted:true};
  }
  const executableSha256=sha256(fs.readFileSync(candidate)),bytes=fs.statSync(candidate).size;
  fs.renameSync(candidate,destination);candidate=null;
  fs.writeFileSync(manifestFile,JSON.stringify(bundle.manifest,null,2)+'\n');
  fs.writeFileSync(compressedFile,bundle.buffer);
  const report={schemaVersion:1,kind:'playhub-sea-build',generatedAt:new Date().toISOString(),ok:true,version:'0.3.0',target,builder:{platform:process.platform,node:process.version},executable:{path:destination,bytes,sha256:executableSha256},bundle:{...bundle.manifest,manifestFile,compressedFile},baseRuntime:{version:PIN.nodeVersion,source:target==='win-x64'?PIN.nodeZipUrl:'Current trusted Linux builder runtime',originalSha256:target==='win-x64'?PIN.nodeExeSha256:sha256(readRegular(process.execPath)),licenseIncluded:'licenses/Node-LICENSE.txt'},buildTool:{name:'postject',version:PIN.postjectVersion,source:PIN.postjectUrl,apiSha256:PIN.postjectApiSha256,runtimeDependency:false},sea:{useCodeCache:false,useSnapshot:false,execArgvExtension:'none',blobBytes:blob.length,blobSha256:sha256(blob),launcherSha256:sha256(readRegular(path.join(root,'portable/launcher.cjs')))},signatureRemoval,binaryInspection,packageCheck,execution:{windowsExecuted:false,linuxPackageCheckExecuted:target==='linux-x64',rebexExecuted:false,realBrowserExecuted:false}};
  fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');return report;
 }finally{if(candidate&&fs.existsSync(candidate))fs.unlinkSync(candidate);fs.rmSync(temporary,{recursive:true,force:true});}
}
function parseArgs(args){const options={};for(let i=0;i<args.length;i++){const key={'--root':'root','--target':'target','--node-exe':'nodeExe','--node-license':'nodeLicense','--postject-api':'postjectApi','--output':'output','--report':'reportPath','--webgames':'webgames'}[args[i]];ensure(key&&!options[key]&&args[i+1]&&!args[i+1].startsWith('--'),'Usage: node portable/build-sea.mjs --target win-x64 --node-exe <official node.exe> --node-license <LICENSE> --postject-api <dist/api.js> --output <PlayHub.exe> [--webgames <WebGames directory>]');options[key]=args[++i];}return options;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await buildSea(parseArgs(process.argv.slice(2)));console.log(JSON.stringify({ok:report.ok,target:report.target,executable:report.executable,fileCount:report.bundle.fileCount,payloadSha256:report.bundle.payloadSha256,execution:report.execution},null,2));}
 catch(error){console.error('Portable build failed: '+error.message);process.exitCode=1;}
}
