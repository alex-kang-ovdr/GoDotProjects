/** Optional zero-dependency local static server. No external connections. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535){console.error('PORT must be 1–65535.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml','.zip':'application/zip'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 let requestPath;try{requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Invalid URL');return;}
 if(requestPath.includes('\0')||requestPath.includes('\\')){res.writeHead(400);res.end('Invalid path');return;}
 const target=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
 fs.stat(target,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  const headers={'Content-Type':mime[path.extname(target).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};
  res.writeHead(200,headers);if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(target);stream.on('error',()=>res.destroy());stream.pipe(res);
 });
});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`Port ${port} is busy. Set PORT to another number.`:err.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
 const url=`http://127.0.0.1:${port}`;
 console.log(`RTK11 Web: ${url}\nCtrl+C to stop. The server is local-only.`);
 if(process.argv.includes('--open')){
  const {spawn}=require('node:child_process');
  const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',url]:[url];
  const child=spawn(command,args,{stdio:'ignore',detached:true});
  child.on('error',()=>console.log(`Open this address manually: ${url}`));child.unref();
 }
});
