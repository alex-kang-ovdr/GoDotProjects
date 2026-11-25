"use strict";
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const MAX_ZIP_BYTES=64*1024*1024,MAX_EXPANDED=128*1024*1024;
const bad=()=>Object.assign(new Error('unsafe_deployment_zip'),{code:'unsafe_deployment_zip',status:400});
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let n=0xffffffff;for(const x of b)n=table[(n^x)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const ext=/\.(html|js|mjs|css|json|wasm|pck|bin|png|jpg|jpeg|webp|gif|svg|ico|ogg|wav|mp3|mp4|webm|ttf|woff|woff2|glb|gltf|txt)$/i;
function parseAndValidateDeploymentZip(buffer,collectContents=false){
 try{
  if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>MAX_ZIP_BYTES)throw bad();
  const end=buffer.length-22;
  // Deliberately restricted ZIP profile: no comments, ZIP64, encryption, descriptors or extras.
  if(buffer.readUInt32LE(end)!==0x06054b50||buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||buffer.readUInt16LE(end+20))throw bad();
  const count=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16),size=buffer.readUInt32LE(end+12);
  if(!count||count>2048||count!==buffer.readUInt16LE(end+8)||offset+size!==end)throw bad();
  let pos=offset,expanded=0;const names=new Set(),ranges=[],entries=[],files=collectContents?[]:null;
  for(let i=0;i<count;i++){
   if(pos+46>end||buffer.readUInt32LE(pos)!==0x02014b50)throw bad();
   const flags=buffer.readUInt16LE(pos+8),method=buffer.readUInt16LE(pos+10),crc=buffer.readUInt32LE(pos+16),compressed=buffer.readUInt32LE(pos+20),length=buffer.readUInt32LE(pos+24),nl=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32),local=buffer.readUInt32LE(pos+42),mode=(buffer.readUInt32LE(pos+38)>>>16)&0xf000;
   if(flags&~0x800||![0,8].includes(method)||extra||comment||buffer.readUInt16LE(pos+34)||![0,0x8000,0x4000].includes(mode)||pos+46+nl>end)throw bad();
   const raw=buffer.subarray(pos+46,pos+46+nl),name=new TextDecoder('utf-8',{fatal:true}).decode(raw),dir=name.endsWith('/');
   const parts=(dir?name.slice(0,-1):name).split('/');
   if(!nl||name.length>240||/[\\:\x00-\x1f\x7f%?#]/.test(name)||parts.some(x=>!x||x.startsWith('.')||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))throw bad();
   const normalized=name.normalize('NFC').toLowerCase().replace(/\/$/,'');if(names.has(normalized))throw bad();names.add(normalized);
   if(!dir&&!ext.test(name)||mode===0x4000&&!dir)throw bad();
   expanded+=length;if(expanded>MAX_EXPANDED||length>MAX_ZIP_BYTES||length>Math.max(compressed*200,1024*1024))throw bad();
   if(local+30>offset||buffer.readUInt32LE(local)!==0x04034b50||buffer.readUInt16LE(local+6)!==flags||buffer.readUInt16LE(local+8)!==method||buffer.readUInt32LE(local+14)!==crc||buffer.readUInt32LE(local+18)!==compressed||buffer.readUInt32LE(local+22)!==length||buffer.readUInt16LE(local+26)!==nl||buffer.readUInt16LE(local+28)!==0)throw bad();
   const start=local+30+nl,stop=start+compressed;if(stop>offset||!buffer.subarray(local+30,start).equals(raw))throw bad();
   const packed=buffer.subarray(start,stop);const content=method===0?packed:zlib.inflateRawSync(packed,{maxOutputLength:Math.max(length,1)});
   if(content.length!==length||crc32(content)!==crc||dir&&length!==0)throw bad();
   ranges.push([local,stop]);entries.push(name);if(files&&!dir)files.push([name,content]);pos+=46+nl;
  }
  ranges.sort((a,b)=>a[0]-b[0]);let cursor=0;for(const [start,stop]of ranges){if(start!==cursor)throw bad();cursor=stop;}
  if(cursor!==offset||pos!==end||!entries.includes('index.html'))throw bad();
  // Reject a file used as a parent directory, case-insensitively.
  const fileNames=new Set(entries.filter(n=>!n.endsWith('/')).map(n=>n.normalize('NFC').toLowerCase()));
  for(const n of entries){const parts=n.toLowerCase().split('/');for(let i=1;i<parts.length;i++)if(fileNames.has(parts.slice(0,i).join('/')))throw bad();}
  return {sha256:crypto.createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length,entries:entries.length,expandedBytes:expanded,entryPoint:'index.html',runnableVerified:false,...(files?{files}:{})};
 }catch{throw bad();}
}
function validateDeploymentZip(buffer){
 return parseAndValidateDeploymentZip(buffer,false);
}
function extractValidatedDeploymentZip(buffer,outputDir){
 const parsed=parseAndValidateDeploymentZip(buffer,true);
 const root=path.resolve(outputDir);
 fs.mkdirSync(root,{recursive:true});
 const extractedFiles=[];
 for(const [name,content]of parsed.files){
  const dest=path.resolve(root,name);
  if(dest!==root&&!dest.startsWith(root+path.sep))throw bad();
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,content);
  extractedFiles.push(name);
 }
 const {files:_drop,...summary}=parsed;
 return {...summary,extractedFiles:extractedFiles.sort()};
}
module.exports={validateDeploymentZip,extractValidatedDeploymentZip,MAX_ZIP_BYTES,crc32};
