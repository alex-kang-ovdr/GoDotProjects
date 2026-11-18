"use strict";
const {check}=require('./preflight.cjs');const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const report=check(process.argv[2]);
if(!report.ok){for(const issue of report.issues)console.error(issue);console.error('Not started. No processes were stopped and no security settings changed.');process.exit(1);}
if(report.component!=='game'){
 const child=spawn(report.command.executable,report.command.args,{cwd:report.command.cwd,stdio:'inherit',shell:false,
  env:{...process.env,...(report.component==='forge'?{HOST:'127.0.0.1'}:{})}});
 child.on('error',()=>{console.error('Component process could not start.');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code===0?0:1;});
}else{
 const root=fs.realpathSync(report.command.cwd);const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
 const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const parts=name.split('/');
   if(parts.some(x=>x==='..'||x.startsWith('.'))||name.includes('\\')){res.writeHead(404).end();return;}
   let file=path.resolve(root,'.'+name);if(name.endsWith('/'))file=path.join(file,'index.html');file=fs.realpathSync(file);
   const relative=path.relative(root,file);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':fs.statSync(file).size,'X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end();}
 });
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Game port already in use; existing process was not stopped.':'Game preview failed to start.');process.exitCode=1;});
 server.listen(report.command.port,'127.0.0.1',()=>console.log('Local game preview: http://127.0.0.1:'+report.command.port+'/'));
}
