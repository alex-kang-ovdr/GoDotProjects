import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync} from 'node:crypto';
import {assertNoLinks,regularFile,writeJsonAtomic} from './backup.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowedSettings=new Set(['userPort','adminUiPort','publicPort','adminPort','shareHost','localOnly','dataDir','adminUsername','adminPassword','secureCookies','searchIndexingEnabled']);
const within=(root,p)=>p===root||p.startsWith(root+path.sep);
const port=(value,fallback)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<1024||n>65535)throw new Error('Ports must be integers between 1024 and 65535.');return n;};

/** Idempotent configuration update. Unspecified existing network/auth settings survive. */
export function setupConfig({configPath=path.join(projectRoot,'config/local.json'),settings={}}={}){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(k=>!allowedSettings.has(k)))throw new Error('Setup JSON contains unsupported settings.');
  for(const key of ['localOnly','secureCookies','searchIndexingEnabled'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw new Error(`${key} must be a boolean.`);
  const target=assertNoLinks(configPath);
  for(const directory of ['web','dist','games','shared','catalog'])if(within(path.join(projectRoot,directory),target))throw new Error('Private configuration must be outside public source and web roots.');
  let previous={};
  if(fs.existsSync(target)){
    const stat=regularFile(target,'Configuration');if(stat.size>1024*1024)throw new Error('Configuration is larger than the supported limit.');
    try{previous=JSON.parse(fs.readFileSync(target,'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('The existing configuration is invalid JSON and was not changed.');}
    if(!previous||typeof previous!=='object'||Array.isArray(previous))throw new Error('The existing configuration is invalid and was not changed.');
  }
  const base=JSON.parse(fs.readFileSync(path.join(projectRoot,'config/example.json'),'utf8'));
  const userPort=port(settings.userPort,previous.userPort||8080),adminUiPort=port(settings.adminUiPort,previous.adminUiPort||8081);
  const publicPort=port(settings.publicPort,previous.publicPort||8090),adminPort=port(settings.adminPort,previous.adminPort||8091);
  if(new Set([userPort,adminUiPort,publicPort,adminPort]).size!==4)throw new Error('All four ports must be distinct.');
  let previousHost='localhost';try{previousHost=new URL(previous.userBaseUrl).hostname;}catch{}
  const localOnly=settings.localOnly??(previous.publicHost?previous.publicHost!=='0.0.0.0':true);
  const shareHost=String(settings.shareHost??previousHost);
  if(!/^[A-Za-z0-9.-]+$/.test(shareHost)||shareHost.includes('..'))throw new Error('shareHost must be a hostname or IPv4 address, without scheme, path, or port.');
  const origin=(hostname,p)=>`http://${hostname}:${p}`;
  const networkChanged=!previous.userBaseUrl||shareHost!==previousHost||userPort!==previous.userPort||adminUiPort!==previous.adminUiPort||publicPort!==previous.publicPort||adminPort!==previous.adminPort||(localOnly?'127.0.0.1':'0.0.0.0')!==previous.publicHost;
  if(previous.userBaseUrl&&networkChanged&&(previous.secureCookies||/^https:/i.test(previous.userBaseUrl)||/^https:/i.test(previous.publicBaseUrl)))throw new Error('Changing an existing HTTPS/proxy network profile requires its deployment procedure. Existing settings were not changed.');
  const username=String(settings.adminUsername??previous.admin?.username??'admin');
  if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))throw new Error('Administrator name must contain 3–40 letters, digits, dot, underscore or hyphen.');
  let admin=previous.admin?{...previous.admin,username}:undefined;
  if(settings.adminPassword!==undefined){
    const password=settings.adminPassword;
    if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Administrator password must contain 12–256 characters.');
    const salt=randomBytes(16).toString('hex');admin={username,salt,passwordHash:scryptSync(password,salt,64).toString('hex')};
  }
  if(!/^[a-f0-9]{128}$/i.test(admin?.passwordHash||'')||!/^[a-f0-9]{32}$/i.test(admin?.salt||''))throw new Error('An administrator password of at least 12 characters is required on first setup.');
  const config={...base,...previous,publicPort,adminPort,userPort,adminUiPort,publicHost:localOnly?'127.0.0.1':'0.0.0.0',adminHost:'127.0.0.1',
    userOrigins:networkChanged?[...new Set(['localhost','127.0.0.1',shareHost].map(h=>origin(h,userPort)))]:previous.userOrigins,
    adminOrigins:networkChanged?['localhost','127.0.0.1'].map(h=>origin(h,adminUiPort)):previous.adminOrigins,
    publicBaseUrl:networkChanged?origin(shareHost,publicPort):previous.publicBaseUrl,
    userBaseUrl:networkChanged?origin(shareHost,userPort):previous.userBaseUrl,
    adminBaseUrl:networkChanged?origin('localhost',adminUiPort):previous.adminBaseUrl,
    dataDir:path.resolve(settings.dataDir||previous.dataDir||path.join(projectRoot,'data')),
    secureCookies:settings.secureCookies??previous.secureCookies??false,
    searchIndexingEnabled:settings.searchIndexingEnabled??previous.searchIndexingEnabled??false,
    google:{...base.google,...previous.google},admin};
  if(config.secureCookies&&(!config.publicBaseUrl.startsWith('https://')||!config.userBaseUrl.startsWith('https://')))throw new Error('secureCookies requires an existing HTTPS user/API profile.');
  if(!config.google.clientId&&!config.google.clientSecret)config.google.redirectUri=origin('localhost',publicPort)+'/api/auth/google/callback';
  assertNoLinks(config.dataDir);
  for(const directory of ['web','dist','games','shared','catalog'])if(within(path.join(projectRoot,directory),config.dataDir))throw new Error('Database dataDir must be outside public source and web roots.');
  if(fs.existsSync(path.join(config.dataDir,'maintenance.lock')))throw new Error('Database maintenance requires recovery before reconfiguration.');
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});writeJsonAtomic(target,config);
  return {ok:true,config:target,userUrl:config.userBaseUrl,adminUrl:config.adminBaseUrl,localOnly,googleConfigured:Boolean(config.google.clientId&&config.google.clientSecret),passwordStoredAs:'scrypt hash',updatedExisting:Boolean(previous.admin),dataMigrated:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length&&!(args.length===2&&args[0]==='--config'&&args[1]&&!args[1].startsWith('--')))throw new Error('Usage: supply setup JSON on stdin to node tools/setup.mjs [--config <private.json>].');
    let settings;try{settings=JSON.parse(fs.readFileSync(0,'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('Supply setup settings as JSON on stdin; passwords must not be command-line arguments.');}
    console.log(JSON.stringify(setupConfig({configPath:args[1],settings})));
  }catch(error){console.error('Setup failed: '+error.message);process.exitCode=1;}
}
