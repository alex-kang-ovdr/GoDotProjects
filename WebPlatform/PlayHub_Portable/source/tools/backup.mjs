import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';

export const TOOL_VERSION='0.2.0';

/** Reject links/junctions in all existing components, including output parents. */
export function assertNoLinks(filename){
  const absolute=path.resolve(filename),parsed=path.parse(absolute);
  let cursor=parsed.root;
  for(const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,segment);
    try{if(fs.lstatSync(cursor).isSymbolicLink())throw new Error('Symbolic links or junctions are not accepted for database operations.');}
    catch(error){if(error.code==='ENOENT')break;throw error;}
  }
  return absolute;
}
export function regularFile(filename,label='File'){
  const absolute=assertNoLinks(filename),stat=fs.lstatSync(absolute);
  if(!stat.isFile())throw new Error(`${label} must be a regular file.`);
  return stat;
}
export function readConfig(configPath){
  const filename=path.resolve(configPath);const stat=regularFile(filename,'Configuration');
  if(stat.size>1024*1024)throw new Error('Configuration is larger than the supported limit.');
  let config;try{config=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('Configuration is not valid JSON.');}
  if(!config||typeof config!=='object'||Array.isArray(config)||typeof config.dataDir!=='string'||!path.isAbsolute(config.dataDir))throw new Error('Configuration dataDir must be an absolute path.');
  assertNoLinks(config.dataDir);return config;
}
export async function hashFile(filename){
  const hash=createHash('sha256');
  for await(const chunk of fs.createReadStream(filename))hash.update(chunk);
  return hash.digest('hex');
}
export function writeJsonAtomic(filename,value){
  const target=assertNoLinks(filename);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  if(fs.existsSync(target))regularFile(target);
  const temporary=`${target}.${randomUUID()}.new`;
  let fd;
  try{
    fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temporary,target);
  }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

/** Online SQLite snapshot; the source can remain open in WAL mode. */
export async function createBackup({configPath='config/local.json',out}={}){
  const config=readConfig(configPath),source=path.join(config.dataDir,'platform.sqlite');
  regularFile(source,'Platform database');
  if(fs.existsSync(path.join(config.dataDir,'maintenance.lock')))throw new Error('Database maintenance is active or requires recovery. Backup was not started.');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=assertNoLinks(out||path.join(path.dirname(config.dataDir),'backups',`platform-${stamp}.sqlite`));
  const metadata=target+'.json';
  if(source===target||['','-wal','-shm','-journal','.json'].some(suffix=>fs.existsSync(target+suffix)))throw new Error('Choose a new backup path; existing files will not be overwritten.');
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  let ownsTarget=false,ownsMetadata=false,metadataFd;
  try{
    const targetFd=fs.openSync(target,'wx',0o600);ownsTarget=true;fs.closeSync(targetFd);
    metadataFd=fs.openSync(metadata,'wx',0o600);ownsMetadata=true;
    const db=new DatabaseSync(source,{readOnly:true,timeout:5000});
    try{await backup(db,target);}finally{db.close();}
    if(process.platform!=='win32')fs.chmodSync(target,0o600);
    // A self-contained DELETE-journal snapshot avoids unhashed WAL sidecars.
    const verification=new DatabaseSync(target,{timeout:5000});let version;
    try{
      verification.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE');
      if(Object.values(verification.prepare('PRAGMA integrity_check(1)').get())[0]!=='ok')throw new Error('Backup integrity check failed.');
      if(verification.prepare('PRAGMA foreign_key_check').get())throw new Error('Backup foreign-key check failed.');
      version=verification.prepare('PRAGMA user_version').get().user_version;
    }finally{verification.close();}
    const report={schemaVersion:1,appVersion:TOOL_VERSION,ok:true,createdAt:new Date().toISOString(),path:target,bytes:fs.statSync(target).size,sha256:await hashFile(target),integrity:'ok',foreignKeys:'ok',databaseUserVersion:version,snapshotType:'sqlite-online-backup'};
    fs.writeFileSync(metadataFd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(metadataFd);fs.closeSync(metadataFd);metadataFd=undefined;
    return report;
  }catch(error){
    if(metadataFd!==undefined)try{fs.closeSync(metadataFd);}catch{}
    if(ownsMetadata)try{fs.unlinkSync(metadata);}catch{}
    if(ownsTarget)for(const suffix of ['','-wal','-shm','-journal'])try{fs.unlinkSync(target+suffix);}catch{}
    throw error;
  }
}
function parseArgs(args){
  const result={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--help')return {help:true};
    const key={'--config':'configPath','--out':'out'}[args[i]];
    if(!key||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node tools/backup.mjs --config <private.json> [--out <new.sqlite>]');
    if(result[key])throw new Error('Duplicate backup argument.');result[key]=args[++i];
  }return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=parseArgs(process.argv.slice(2));if(args.help)console.log('node tools/backup.mjs --config <private.json> [--out <new.sqlite>]\nCreates a new SQLite snapshot and SHA-256 metadata. Existing paths are never overwritten.');else console.log(JSON.stringify(await createBackup(args)));}
  catch(error){console.error('Backup failed: '+error.message);process.exitCode=1;}
}
