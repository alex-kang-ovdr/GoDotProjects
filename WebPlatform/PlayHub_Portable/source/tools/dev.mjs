import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createApp} from '../server/app.mjs';
import {build,projectRoot,syncCheckoutGames} from './build.mjs';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
export function createStaticServer(directory){
  const root=fs.realpathSync(directory);
  return http.createServer((request,response)=>{
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
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--config');const configPath=path.resolve(i>=0?process.argv[i+1]:path.join(projectRoot,'config/local.json'));
  if(!fs.existsSync(configPath))throw new Error('Create config/local.json with tools/setup.mjs first. See README.');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
  console.log('Preparing PlayHub: synchronizing WebGames...');
  await syncCheckoutGames();
  console.log('Preparing PlayHub: building user and administrator pages...');
  build({config});
  const app=createApp(config),user=createStaticServer(path.join(projectRoot,'dist/user')),admin=createStaticServer(path.join(projectRoot,'dist/admin'));
  const listen=(server,port,host='127.0.0.1')=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  try{
    await app.listen();await listen(user,config.userPort||8080,config.publicHost||'127.0.0.1');await listen(admin,config.adminUiPort||8081);
    console.log('READY - keep this window open; press Ctrl+C to stop.');
    if(process.argv.includes('--open')&&process.platform==='win32'){
      const links=path.join(projectRoot,'reports/local-connect.html');
      const target=fs.existsSync(links)?pathToFileURL(links).href:`http://localhost:${config.userPort||8080}/`;
      const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',target],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();
    }
    console.log(JSON.stringify({mode:'development-static-server-not-IIS',user:`http://localhost:${config.userPort||8080}`,admin:`http://localhost:${config.adminUiPort||8081}`}));
  }catch(error){await app.close();user.close();admin.close();throw error;}
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;for(const server of [user,admin]){server.closeAllConnections();server.close();}await app.close();};
  process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
}
