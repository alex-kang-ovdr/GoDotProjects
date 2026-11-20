import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createApp} from '../server/app.mjs';
import {createForgeProxy} from './forge-proxy.mjs';
import {assertRuntimeOutput} from './runtime-output.cjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
function openInBrowser(url){
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true});
  child.on('error',()=>{});child.unref();
}

export function createStaticServer(directory,{forgeProxy,apiPort,userOrigin}={}){
  const root=fs.realpathSync(directory);
  const server=http.createServer((request,response)=>{
    const queryAt=request.url.indexOf('?');
    const rawPath=queryAt>=0?request.url.slice(0,queryAt):request.url;
    if(apiPort&&rawPath.startsWith('/api/')&&!rawPath.startsWith('/api/admin')){
      const headers={...request.headers,host:`127.0.0.1:${apiPort}`};
      if(headers.origin&&userOrigin)headers.origin=userOrigin;
      const proxyReq=http.request({hostname:'127.0.0.1',port:apiPort,method:request.method,path:request.url,headers},proxyRes=>{
        const resHeaders={...proxyRes.headers};
        if(request.headers.origin&&resHeaders['access-control-allow-origin'])resHeaders['access-control-allow-origin']=request.headers.origin;
        response.writeHead(proxyRes.statusCode||502,resHeaders);
        proxyRes.pipe(response);
      });
      proxyReq.on('error',()=>{if(!response.headersSent){response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'API_UNAVAILABLE'}}));}});
      request.pipe(proxyReq);
      return;
    }
    if(forgeProxy){
      if(forgeProxy.matches(rawPath)){forgeProxy.handle(request,response);return;}
    }
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
    try{
      const parsed=new URL(request.url,'http://localhost');const pathname=decodeURIComponent(parsed.pathname);
      if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(s=>s==='..'||s.startsWith('.'))){response.writeHead(400);response.end();return;}
      let target=path.resolve(root,'.'+pathname);
      if(target!==root&&!target.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
      if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
      if(!fs.existsSync(target)||!fs.statSync(target).isFile()){response.writeHead(404);response.end('Not found');return;}
      const real=fs.realpathSync(target);if(!real.startsWith(root+path.sep)||!types[path.extname(real).toLowerCase()]){response.writeHead(404);response.end();return;}
      response.setHeader('Content-Type',types[path.extname(real).toLowerCase()]);response.setHeader('Cache-Control','no-cache');
      response.setHeader('Content-Length',fs.statSync(real).size);response.writeHead(200);
      if(request.method==='HEAD')response.end();else fs.createReadStream(real).pipe(response);
    }catch{response.writeHead(400);response.end('Invalid request');}
  });
  if(forgeProxy){
    server.on('upgrade',(request,socket,head)=>{
      const queryAt=(request.url||'').indexOf('?');
      const rawPath=queryAt>=0?request.url.slice(0,queryAt):(request.url||'');
      if(forgeProxy.matches(rawPath))forgeProxy.upgrade(request,socket,head);
      else socket.destroy();
    });
    server.on('close',()=>forgeProxy.close?.());
  }
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--config');const configPath=path.resolve(i>=0?process.argv[i+1]:path.join(projectRoot,'config/local.json'));
  if(!fs.existsSync(configPath))throw new Error('Create config/local.json with tools/setup.mjs first. See README.');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
  const output=assertRuntimeOutput(projectRoot,config);
  const forgeUpstream=process.env.PLAYHUB_FORGE_UPSTREAM||config.forgeUpstream||'';
  const forgeProxy=forgeUpstream?createForgeProxy({upstream:forgeUpstream}):null;
  const app=createApp(config,{rootDir:output.user,platformRoot:path.resolve(projectRoot,'..')}),user=createStaticServer(output.user,{forgeProxy,apiPort:config.publicPort||8090,userOrigin:config.userBaseUrl||`http://127.0.0.1:${config.userPort||8080}`}),admin=createStaticServer(output.admin);
  const listen=(server,port,host='127.0.0.1')=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  try{
    await app.listen();await listen(user,config.userPort||8080,config.publicHost||'127.0.0.1');
    await listen(admin,config.adminUiPort||8081,config.admin?.localAutoLogin===true?config.adminHost:undefined);
    console.log('READY - keep this window open; press Ctrl+C to stop.');
    if(process.platform==='win32'&&process.env.PLAYHUB_NO_BROWSER!=='1'){
      if(process.argv.includes('--open')){
        const links=path.join(projectRoot,'reports/local-connect.html');
        openInBrowser(fs.existsSync(links)?pathToFileURL(links).href:`http://localhost:${config.userPort||8080}/`);
      }
      const adminLoginUrl=app.issueLocalAdminLoginUrl();
      if(adminLoginUrl)openInBrowser(adminLoginUrl);
    }
    console.log(JSON.stringify({mode:'development-static-server-not-IIS',user:`http://localhost:${config.userPort||8080}`,admin:`http://localhost:${config.adminUiPort||8081}`}));
  }catch(error){await app.close();user.close();admin.close();throw error;}
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;for(const server of [user,admin]){server.closeAllConnections();server.close();}await app.close();};
  process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
}
