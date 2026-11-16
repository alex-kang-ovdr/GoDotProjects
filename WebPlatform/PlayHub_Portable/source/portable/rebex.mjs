import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function rebexConfiguration(webRoot,port){
  if(!path.isAbsolute(webRoot)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('REBEX_CONFIG_INVALID');
  return '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <appSettings>\n'+Object.entries({httpPort:port,httpsPort:'',webRootDir:webRoot,defaultFile:'index.html',autoStart:'true',minimizeOnStart:'true',minimizeToTray:'false',decodeUri:'true',logLevel:'Off'}).map(([key,value])=>`    <add key="${key}" value="${xml(value)}" />`).join('\n')+'\n  </appSettings>\n  <startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6" /></startup>\n</configuration>\n';
}
function noLink(filename){
  const full=path.resolve(filename),parsed=path.parse(full);let current=parsed.root;
  for(const part of full.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('REBEX_PATH_LINK_REJECTED');}
  return full;
}
export function inspectRebexFile(filename){
  const file=noLink(filename),stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<1024||stat.size>32*1024*1024||path.basename(file).toLowerCase()!=='rebextinywebserver.exe')throw new Error('REBEX_EXECUTABLE_REQUIRED');
  const data=fs.readFileSync(file),pe=data.length>=64?data.readUInt32LE(0x3c):0;
  if(data.toString('ascii',0,2)!=='MZ'||pe<64||pe+24>data.length||data.toString('ascii',pe,pe+4)!=='PE\0\0')throw new Error('REBEX_PE_INVALID');
  return {path:file,bytes:stat.size,sha256:createHash('sha256').update(data).digest('hex')};
}
function powershell(){return path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');}
async function filePicker(appRoot){
  const result=await execute(powershell(),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(appRoot,'portable/select-rebex.ps1')],{encoding:'utf8',windowsHide:true,maxBuffer:65536});
  const selected=result.stdout.replace(/^\uFEFF/,'').trim();
  if(!selected)throw new Error('REBEX_SELECTION_CANCELLED');
  return selected;
}
export async function prepareRebex({appRoot,instanceRoot,executable,rebexPath,interactive=true}){
  if(process.platform!=='win32')throw new Error('REBEX_REQUIRES_WINDOWS');
  const settings=path.join(instanceRoot,'private/rebex-source.json');let recorded;
  if(fs.existsSync(settings)){try{recorded=JSON.parse(fs.readFileSync(noLink(settings),'utf8'));}catch{throw new Error('REBEX_SOURCE_CONFIG_INVALID');}}
  const beside=path.join(path.dirname(executable),'RebexTinyWebServer.exe');
  let selected=rebexPath||([beside,recorded?.originalPath].filter(Boolean).find(file=>fs.existsSync(file)));
  if(!selected&&interactive)selected=await filePicker(appRoot);
  if(!selected)throw new Error('REBEX_NOT_FOUND');
  const metadata=inspectRebexFile(selected),directory=noLink(path.join(instanceRoot,'servers/user')),target=path.join(directory,'RebexTinyWebServer.exe');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(path.resolve(metadata.path)!==path.resolve(target)){
    const temporary=target+'.new';fs.copyFileSync(metadata.path,temporary);fs.renameSync(temporary,target);
  }
  let version='unknown';
  try{const result=await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(appRoot,'portable/rebex-version.ps1'),'-ExecutablePath',metadata.path],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:8192});const value=result.stdout.trim();if(/^\d+(?:\.\d+){1,3}$/.test(value))version=value;}catch{}
  fs.mkdirSync(path.dirname(settings),{recursive:true,mode:0o700});
  fs.writeFileSync(settings,JSON.stringify({originalPath:metadata.path,sha256:metadata.sha256,version},null,2)+'\n',{mode:0o600});
  return {directory,executable:target,source:metadata.path,sha256:metadata.sha256,bytes:metadata.bytes,version,redistributed:false};
}
export function launchRebex({appRoot,rebex,userRoot,userPort}){
  const configPath=path.join(rebex.directory,'RebexTinyWebServer.exe.config');
  fs.writeFileSync(configPath,rebexConfiguration(userRoot,userPort));
  const child=spawn(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(appRoot,'portable/rebex-guard.ps1'),'-ExecutablePath',rebex.executable],{cwd:rebex.directory,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const started=new Promise((resolve,reject)=>{
    let output='',finished=false;
    const fail=()=>{if(!finished){finished=true;reject(new Error('REBEX_PROCESS_START_FAILED'));}};
    const timer=setTimeout(()=>{fail();child.stdin.end();},20000);
    child.once('error',fail);child.once('exit',()=>{clearTimeout(timer);fail();});
    child.stdout.on('data',chunk=>{
      output=(output+chunk.toString('utf8')).slice(-65536);
      for(;;){const end=output.indexOf('\n');if(end<0)break;const line=output.slice(0,end).trim();output=output.slice(end+1);try{const row=JSON.parse(line);if(!finished&&row.type==='rebex-process'&&Number.isInteger(row.pid)){finished=true;clearTimeout(timer);resolve({pid:row.pid,supervisorPid:child.pid});}}catch{}}
    });
    child.stderr.resume();
  });
  return {child,started,async stop(){if(child.exitCode!==null)return;try{child.stdin.end('stop\n');}catch{}await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4000))]);if(child.exitCode===null)child.kill();}};
}
export async function protectInstance(instanceRoot){
  const root=noLink(instanceRoot);
  if(!fs.statSync(root).isDirectory()||root===path.parse(root).root)throw new Error('INSTANCE_DIRECTORY_REQUIRED');
  if(process.platform!=='win32'){
    fs.chmodSync(root,0o700);
    if((fs.statSync(root).mode&0o777)!==0o700)throw new Error('INSTANCE_MODE_NOT_VERIFIED');
    return {method:'unix-mode',scope:'instance-root',verified:true,childAclVerified:false};
  }
  const {fileURLToPath}=await import('node:url');
  const script=fileURLToPath(new URL('./protect-instance.ps1',import.meta.url));
  let observed;
  try{
    const result=await execute(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InstanceRoot',root],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:16384});
    observed=JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
  }catch{throw new Error('INSTANCE_ACL_PROTECTION_FAILED');}
  if(observed?.method!=='windows-dacl'||observed.scope!=='instance-root'||observed.verified!==true||observed.inheritanceProtected!==true||observed.childAclVerified!==false)throw new Error('INSTANCE_ACL_NOT_VERIFIED');
  return {method:'windows-dacl',scope:'instance-root',verified:true,inheritanceProtected:true,childAclVerified:false,allowedPrincipals:['current-user','SYSTEM','Administrators']};
}
