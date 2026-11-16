import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertAdminRoot,adminContentSecurityPolicy} from './static-server.mjs';
import {previousBundledGames,readGameLock,refreshGameWorkspace} from './game-workspace.mjs';

const within = (root, filename) => filename === root || filename.startsWith(root + path.sep);
const escapeAttribute = value => String(value).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));

function noLinks(filename) {
  const absolute = path.resolve(filename), parsed = path.parse(absolute); let cursor = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Portable paths cannot contain links or junctions.'); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  return absolute;
}

export function instanceLayout({appRoot,instanceRoot} = {}) {
  if (typeof appRoot !== 'string' || typeof instanceRoot !== 'string' || !path.isAbsolute(appRoot) || !path.isAbsolute(instanceRoot)) throw new Error('Absolute appRoot and instanceRoot are required.');
  appRoot = noLinks(appRoot); instanceRoot = noLinks(instanceRoot);
  const workspaceRoot = path.join(instanceRoot,'workspace'), sitesRoot = path.join(instanceRoot,'sites'), privateRoot = path.join(instanceRoot,'private');
  const userRoot = path.join(sitesRoot,'user'), adminRoot = path.join(sitesRoot,'admin'), configPath = path.join(privateRoot,'config','local.json'), dataDir = path.join(privateRoot,'data');
  if (appRoot === instanceRoot || within(workspaceRoot,appRoot) || within(sitesRoot,appRoot) || within(privateRoot,appRoot)) throw new Error('Bundled application files must be separate from instance workspace, sites and private data.');
  for (const candidate of [workspaceRoot,sitesRoot,privateRoot,userRoot,adminRoot,configPath,dataDir]) noLinks(candidate);
  if (within(userRoot,adminRoot) || within(adminRoot,userRoot) || [configPath,dataDir,workspaceRoot].some(p=>within(userRoot,p)||within(adminRoot,p))) throw new Error('User and administrator roots must be physically separate from each other and from private data.');
  return {appRoot,instanceRoot,workspaceRoot,sitesRoot,userRoot,adminRoot,sites:{user:userRoot,admin:adminRoot},privateRoot,configPath,dataDir};
}

function readJson(filename) { const stat=fs.lstatSync(noLinks(filename)); if(!stat.isFile()||stat.size>1024*1024)throw new Error('Portable configuration must be a regular JSON file under 1 MiB.'); return JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,'')); }
function writeJson(filename,value) { fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700}); const temporary=filename+'.'+randomUUID()+'.new'; try {fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temporary,filename);} finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);} }

function copyTree(source,destination) {
  noLinks(source); noLinks(destination);
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) { fs.mkdirSync(destination,{recursive:true}); for (const name of fs.readdirSync(source)) copyTree(path.join(source,name),path.join(destination,name)); }
  else if (stat.isFile()) fs.copyFileSync(source,destination);
  else throw new Error('Portable application source contains an unsupported filesystem item.');
}

function replaceTree(source,destination) {
  const stage=destination+'.new-'+randomUUID(), previous=destination+'.previous-'+randomUUID();
  try { copyTree(source,stage); if(fs.existsSync(destination))fs.renameSync(destination,previous); try {fs.renameSync(stage,destination);} catch(error){if(fs.existsSync(previous))fs.renameSync(previous,destination);throw error;} if(fs.existsSync(previous))fs.rmSync(previous,{recursive:true}); }
  finally { if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true}); }
}

function networkHosts() {
  const hosts = new Set(['localhost','127.0.0.1']);
  const hostname=os.hostname(); if(/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(hostname)&&!hostname.includes('..'))hosts.add(hostname.toLowerCase());
  let interfaces;
  try{interfaces=os.networkInterfaces();}catch{return {hosts:[...hosts],networkDiscovery:{status:'unavailable',code:'INTERFACES_UNAVAILABLE'}};}
  for(const addresses of Object.values(interfaces))for(const info of addresses||[])if((info.family==='IPv4'||info.family===4)&&!info.internal&&net.isIPv4(info.address))hosts.add(info.address);
  return {hosts:[...hosts],networkDiscovery:{status:'available'}};
}

async function listenProbe(port,host,ipv6Only=false) {
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({port,host,ipv6Only},()=>{server.off('error',reject);resolve();});});
  return server;
}
async function choosePorts() {
  for(const base of [0,10000,20000]) {
    const ports={user:8080+base,admin:8081+base,publicApi:8090+base,adminApi:8091+base},probes=[];let available=true;
    try {for(const port of Object.values(ports)){probes.push(await listenProbe(port,'0.0.0.0'));try{probes.push(await listenProbe(port,'::',true));}catch(error){if(!['EAFNOSUPPORT','EADDRNOTAVAIL','EPROTONOSUPPORT'].includes(error.code))throw error;}}}
    catch(error) {if(['EADDRINUSE','EACCES'].includes(error.code))available=false;else throw error;}
    finally {await Promise.all(probes.map(server=>new Promise(resolve=>server.close(resolve))));}
    if(available)return ports;
  }
  throw new Error('All three portable port sets are occupied. Stop the conflicting service and run PlayHub again.');
}

function validateConfig(config,layout) {
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Portable configuration is invalid.');
  const values=['userPort','adminUiPort','publicPort','adminPort'].map(key=>config[key]);
  if(values.some(p=>!Number.isInteger(p)||p<1024||p>65535)||new Set(values).size!==4)throw new Error('Portable configuration requires four distinct ports between 1024 and 65535.');
  if(config.publicHost!=='0.0.0.0'||config.adminHost!=='127.0.0.1')throw new Error('Portable public/admin API bindings must remain 0.0.0.0 and 127.0.0.1.');
  if(config.secureCookies||['userBaseUrl','publicBaseUrl','adminBaseUrl'].some(k=>{try{return new URL(config[k]).protocol!=='http:';}catch{return true;}}))throw new Error('This portable profile uses HTTP. An HTTPS deployment must be configured separately.');
  if(!/^[a-f0-9]{128}$/i.test(config.admin?.passwordHash||'')||!/^[a-f0-9]{32}$/i.test(config.admin?.salt||''))throw new Error('Portable administrator credentials are missing or invalid.');
  // A copied instance carries its own database. Never follow an obsolete absolute path outside it.
  if(path.resolve(config.dataDir||'')!==layout.dataDir)throw new Error('Portable dataDir must point to this instance private/data directory. Move data explicitly before changing this path.');
  for(const key of ['userOrigins','adminOrigins'])if(!Array.isArray(config[key])||!config[key].length||config[key].some(origin=>{try{return new URL(origin).origin!==origin||new URL(origin).protocol!=='http:';}catch{return true;}}))throw new Error('Portable origins must be explicit HTTP origins.');
  const adminAllowed=new Set(['localhost','127.0.0.1'].map(h=>`http://${h}:${config.adminUiPort}`));
  if(config.adminOrigins.some(origin=>!adminAllowed.has(origin)))throw new Error('Administrator origins must remain loopback-only.');
  if(!config.userOrigins.includes(new URL(config.userBaseUrl).origin))throw new Error('User base URL must be an allowed origin.');
  if(fs.existsSync(path.join(layout.dataDir,'maintenance.lock')))throw new Error('Database maintenance requires explicit recovery before startup.');
}

export function readInstanceConfig(options) {
  const layout=instanceLayout(options),config=readJson(layout.configPath);validateConfig(config,layout);return {layout,config};
}

function urlsAndPorts(config,hosts) {
  const ports={user:config.userPort,admin:config.adminUiPort,publicApi:config.publicPort,adminApi:config.adminPort};
  const urls={user:`http://localhost:${ports.user}/`,admin:`http://127.0.0.1:${ports.admin}/`,publicApi:`http://localhost:${ports.publicApi}`,adminApi:`http://127.0.0.1:${ports.adminApi}`,lanUsers:hosts.filter(h=>!['localhost','127.0.0.1'].includes(h)).map(h=>`http://${h}:${ports.user}/`)};
  return {ports,urls};
}

function injectMeta(html,policy) {
  html=html.replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi,'').replace(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi,'');
  const additions=`<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">`;
  if(!/<head\b[^>]*>/i.test(html))throw new Error('Portable HTML requires a head element.');
  // Keep the charset near the beginning even when several LAN origins make the policy long.
  const charset=/<meta\b[^>]*\bcharset\s*=\s*["']?utf-8["']?[^>]*>/i;
  return charset.test(html)?html.replace(charset,match=>match+additions):html.replace(/<head\b[^>]*>/i,match=>match+'<meta charset="utf-8">'+additions);
}

function transformSites(userRoot,adminRoot,config) {
  const userOrigins=config.userOrigins.join(' '),apiOrigins=config.userOrigins.map(origin=>{const u=new URL(origin);u.port=String(config.publicPort);return u.origin;}).join(' ');
  const userPolicy=`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${apiOrigins}; frame-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; worker-src 'none'`;
  // Explicit origins also cover classic scripts inside opaque sandboxed game frames.
  const gamePolicy=`default-src 'none'; script-src 'self' ${userOrigins}; style-src 'self' 'unsafe-inline' ${userOrigins}; img-src 'self' data: blob: ${userOrigins}; font-src 'self' ${userOrigins}; media-src 'self' ${userOrigins}; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; worker-src 'none'`;
  const adminPolicy=adminContentSecurityPolicy(config.adminPort).replace(/; frame-ancestors 'none'/,'');
  for(const [root,kind] of [[userRoot,'user'],[adminRoot,'admin']]) {
    function visit(directory) {for(const name of fs.readdirSync(directory)){const filename=path.join(directory,name),stat=fs.lstatSync(filename);if(stat.isSymbolicLink())throw new Error('Generated sites cannot contain links.');if(stat.isDirectory())visit(filename);else if(name.toLowerCase()==='web.config')fs.unlinkSync(filename);else if(path.extname(name).toLowerCase()==='.html'){const isGame=kind==='user'&&within(path.join(root,'games'),filename);fs.writeFileSync(filename,injectMeta(fs.readFileSync(filename,'utf8'),kind==='admin'?adminPolicy:isGame?gamePolicy:userPolicy));}}}
    visit(root);
    fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nDisallow: /\n');
  }
  fs.writeFileSync(path.join(userRoot,'config.js'),'window.PLAYHUB_CONFIG='+JSON.stringify({apiPort:config.publicPort,apiBaseUrl:'',mode:'portable-rebex'})+';\n');
  fs.writeFileSync(path.join(adminRoot,'config.js'),'window.PLAYHUB_ADMIN_CONFIG='+JSON.stringify({apiPort:config.adminPort,apiBaseUrl:'',mode:'portable-rebex'})+';\n');
}

/** Prepare editable content and physically separate public roots. No plaintext password is written. */
export async function prepareInstance(options) {
  const layout=instanceLayout(options),{hosts,networkDiscovery}=networkHosts();
  fs.mkdirSync(layout.instanceRoot,{recursive:true,mode:0o700});
  for(const directory of [layout.workspaceRoot,layout.privateRoot,path.dirname(layout.configPath),layout.dataDir])fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.existsSync(path.join(layout.dataDir,'maintenance.lock')))throw new Error('Database maintenance requires explicit recovery before preparation.');
  const existing=fs.existsSync(layout.configPath);let config,initialPassword,stagedConfig;
  try {
    if(existing){config=readJson(layout.configPath);validateConfig(config,layout);}
    else {
      const ports=await choosePorts();initialPassword=randomBytes(24).toString('base64url');stagedConfig=path.join(path.dirname(layout.configPath),'.bootstrap-'+randomUUID()+'.json');
      const {setupConfig}=await import(pathToFileURL(path.join(layout.appRoot,'tools/setup.mjs')).href);
      setupConfig({configPath:stagedConfig,settings:{userPort:ports.user,adminUiPort:ports.admin,publicPort:ports.publicApi,adminPort:ports.adminApi,shareHost:'localhost',localOnly:false,dataDir:layout.dataDir,adminUsername:'admin',adminPassword:initialPassword,secureCookies:false,searchIndexingEnabled:false}});
      config=readJson(stagedConfig);
    }
    config={...config,userOrigins:[...new Set([...config.userOrigins,...hosts.map(h=>`http://${h}:${config.userPort}`)])],searchIndexingEnabled:false};
    validateConfig(config,layout);
    for(const name of ['web','shared'])replaceTree(path.join(layout.appRoot,name),path.join(layout.workspaceRoot,name));
    if(readGameLock(layout.appRoot)){
      const previous=readGameLock(layout.workspaceRoot)?null:previousBundledGames(layout.instanceRoot,layout.workspaceRoot,layout.appRoot);
      refreshGameWorkspace(layout.appRoot,layout.workspaceRoot,{previous,preserveEdits:true});
    }else{
      for(const name of ['games','catalog'])if(!fs.existsSync(path.join(layout.workspaceRoot,name)))copyTree(path.join(layout.appRoot,name),path.join(layout.workspaceRoot,name));
    }
    const {build}=await import(pathToFileURL(path.join(layout.appRoot,'tools/build.mjs')).href);
    const buildResult=build({root:layout.workspaceRoot,config}),builtUser=path.join(buildResult.output,'user'),builtAdmin=path.join(buildResult.output,'admin');
    transformSites(builtUser,builtAdmin,config);assertAdminRoot(builtAdmin);
    replaceTree(buildResult.output,layout.sitesRoot);
    // Config is committed only after usable sites exist. A failed first run cannot strand an unseen password.
    writeJson(layout.configPath,config);
    return {...layout,...urlsAndPorts(config,hosts),networkDiscovery,games:buildResult.games,activeGames:buildResult.activeGames,initialPassword};
  } finally {if(stagedConfig&&fs.existsSync(stagedConfig))fs.unlinkSync(stagedConfig);}
}
