import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validGameUpdateDate} from '../server/catalog.mjs';

export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const escaped=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const identifier=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const staticExtensions=new Set(['.html','.js','.mjs','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff2','.ogg','.mp3','.wav','.txt']);

export function renameOutput(from,to){
  // Windows scanners can briefly retain a directory handle after a build closes its files.
  for(let attempt=0;;attempt++){
    try{fs.renameSync(from,to);return;}
    catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=10)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}
  }
}

function copyStatic(source,destination,selected){
  const st=fs.lstatSync(source);
  if(st.isSymbolicLink())throw new Error('Symbolic links are not allowed in web output: '+source);
  if(st.isDirectory()){
    if(destination)fs.mkdirSync(destination,{recursive:true});
    for(const name of fs.readdirSync(source)){
      if(name.startsWith('.')||name==='node_modules')continue;
      const target=destination&&(!selected||selected.has(name))?path.join(destination,name):null;
      copyStatic(path.join(source,name),target);
    }
  } else if(destination&&st.isFile()&&staticExtensions.has(path.extname(source).toLowerCase()))fs.copyFileSync(source,destination);
}

export async function syncCheckoutGames({root=projectRoot,webgames}={}){
  const candidate=webgames||path.resolve(root,'../../../WebGames');
  if(!webgames&&!fs.existsSync(path.join(candidate,'catalog.json')))return null;
  const {syncWebGames}=await import('./sync-webgames.mjs');
  return syncWebGames({root,webgames:candidate});
}

export function readCatalog(root=projectRoot){
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog/games.json'),'utf8'));
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries)||!catalog.entries.length||catalog.entries.length>1000)throw new Error('Invalid catalog envelope.');
  const seen=new Set();
  const games=[];
  for(const entry of catalog.entries){
    if(!identifier.test(entry.id)||seen.has(entry.id)||entry.path!==`games/${entry.id}`||typeof entry.enabled!=='boolean')throw new Error('Invalid or duplicate catalog entry: '+entry.id);
    seen.add(entry.id);
    const dir=path.join(root,entry.path);
    if(fs.lstatSync(dir).isSymbolicLink())throw new Error('Game directory must not be a symbolic link.');
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'game.manifest.json'),'utf8'));
    if(manifest.id!==entry.id||manifest.slug!==entry.id||manifest.entry!=='index.html')throw new Error('Manifest identity mismatch: '+entry.id);
    if(manifest.updatedOn!==undefined&&!validGameUpdateDate(manifest.updatedOn))throw new Error('Invalid updatedOn date: '+entry.id);
    for(const locale of ['ko','en'])for(const field of ['title','summary','instructions'])if(typeof manifest[field]?.[locale]!=='string'||!manifest[field][locale].trim())throw new Error(`Missing ${field}.${locale}: ${entry.id}`);
    if(manifest.capabilities?.workers!==false||manifest.capabilities?.externalNetwork?.length!==0)throw new Error('Unsupported PoC game capabilities: '+entry.id);
    const cover=manifest.media?.cover;
    if(typeof cover!=='string'||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(cover)||cover.split('/').some(s=>s==='.'||s==='..'))throw new Error('Unsafe cover path: '+entry.id);
    for(const item of ['index.html',cover,...(manifest.media.screenshots||[])]){
      const resolved=path.resolve(dir,item);
      if(!resolved.startsWith(dir+path.sep)||!fs.existsSync(resolved)||fs.lstatSync(resolved).isSymbolicLink())throw new Error(`Missing or unsafe game file: ${entry.id}/${item}`);
    }
    games.push({...entry,manifest});
  }
  return {catalog,games};
}

export function build({root=projectRoot,config={}}={}){
  const {catalog,games}=readCatalog(root);
  const output=path.join(root,'dist'),temporary=path.join(root,`.dist-${process.pid}`),backup=output+'.previous';
  if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true});
  fs.mkdirSync(temporary,{recursive:true});
  try{
    const user=path.join(temporary,'user'),admin=path.join(temporary,'admin');
    copyStatic(path.join(root,'web/user'),user);copyStatic(path.join(root,'web/admin'),admin);
    copyStatic(path.join(root,'games'),path.join(user,'games'),new Set(games.map(game=>game.id)));
    if(fs.existsSync(path.join(root,'shared')))copyStatic(path.join(root,'shared'),path.join(user,'shared'));
    fs.mkdirSync(path.join(user,'catalog'),{recursive:true});
    copyStatic(path.join(root,'catalog/games.json'),path.join(user,'catalog/games.json'));
    for(const game of games){
      const destination=path.join(user,'games',game.id);
      const entryFile=path.join(destination,'index.html');
      let html=fs.readFileSync(entryFile,'utf8');
      if(/(?:src|href)\s*=\s*["']\/shared\//i.test(html)){
        copyStatic(path.join(root,'shared'),path.join(destination,'vendor'));
        html=html.replace(/((?:src|href)\s*=\s*["'])\/shared\//gi,'$1vendor/');
        fs.writeFileSync(entryFile,html);
      }
    }
    const publicConfig={apiPort:config.publicPort||8090,apiBaseUrl:'',mode:'local-iis-poc'};
    const adminConfig={apiPort:config.adminPort||8091,apiBaseUrl:'',mode:'local-iis-poc'};
    fs.writeFileSync(path.join(user,'config.js'),'window.PLAYHUB_CONFIG='+JSON.stringify(publicConfig)+';\n');
    fs.writeFileSync(path.join(admin,'config.js'),'window.PLAYHUB_ADMIN_CONFIG='+JSON.stringify(adminConfig)+';\n');
    const userBase=(config.userBaseUrl||'http://localhost:8080').replace(/\/$/,'');
    const shell=fs.readFileSync(path.join(user,'index.html'),'utf8');
    const homeContent='<article id="catalog-seo"><h2>로그인 없이 즐기는 기본 게임</h2><ul>'+games.filter(g=>g.enabled).map(g=>`<li><a href="/play/${g.id}/">${escaped(g.manifest.title.ko)}</a> — ${escaped(g.manifest.summary.ko)}</li>`).join('')+'</ul></article>';
    fs.writeFileSync(path.join(user,'index.html'),shell.replace('<!-- SEO_CONTENT -->',homeContent).replace('</head>',`<link rel="canonical" href="${escaped(userBase+'/')}"></head>`));
    const routes=[];
    for(const {id,enabled,manifest:m} of games){
      if(!enabled)continue;
      const canonical=`${userBase}/play/${id}/`;
      const pageTitle=m.seo.title.ko,description=m.seo.description.ko;
      let html=shell.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escaped(pageTitle)} | PlayHub</title>`);
      html=html.replace(/<meta\s+name=["']description["'][^>]*>/gi,'');
      const head=`<meta name="description" content="${escaped(description)}"><link rel="canonical" href="${escaped(canonical)}"><meta property="og:title" content="${escaped(pageTitle)}"><meta property="og:description" content="${escaped(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escaped(canonical)}"><meta property="og:image" content="${escaped(userBase+'/games/'+id+'/'+m.media.cover)}">`;
      html=html.replace(/<\/head>/i,head+'</head>');
      const content=`<article class="seo-copy" id="game-seo-article"><h1>${escaped(m.title.ko)}</h1><p>${escaped(m.summary.ko)}</p><h2>게임 방법</h2><p>${escaped(m.instructions.ko)}</p>${m.rules?.ko?`<h2>규칙</h2><p>${escaped(m.rules.ko)}</p>`:''}<p><a href="/">전체 게임 보기</a></p></article>`;
      html=html.includes('<!-- SEO_CONTENT -->')?html.replace('<!-- SEO_CONTENT -->',content):html.replace('</body>',content+'</body>');
      const dir=path.join(user,'play',id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),html);
      if(m.seo.indexable)routes.push(canonical);
    }
    const indexing=config.searchIndexingEnabled===true;
    fs.writeFileSync(path.join(user,'robots.txt'),`User-agent: *\n${indexing?'Disallow: /games/\nDisallow: /shared/\nDisallow: /catalog/':'Disallow: /'}\nSitemap: ${userBase}/sitemap.xml\n`);
    fs.writeFileSync(path.join(user,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[userBase+'/',...routes].map(u=>`<url><loc>${escaped(u)}</loc></url>`).join('')+'</urlset>');
    fs.writeFileSync(path.join(admin,'robots.txt'),'User-agent: *\nDisallow: /\n');
    const iisConfig=noindex=>`<?xml version="1.0" encoding="utf-8"?>\n<configuration><system.webServer><defaultDocument><files><clear/><add value="index.html"/></files></defaultDocument><directoryBrowse enabled="false"/><staticContent><remove fileExtension=".json"/><mimeMap fileExtension=".json" mimeType="application/json"/><remove fileExtension=".svg"/><mimeMap fileExtension=".svg" mimeType="image/svg+xml"/><remove fileExtension=".mjs"/><mimeMap fileExtension=".mjs" mimeType="text/javascript"/></staticContent><httpProtocol><customHeaders><remove name="X-Powered-By"/><remove name="X-Content-Type-Options"/><add name="X-Content-Type-Options" value="nosniff"/><remove name="Referrer-Policy"/><add name="Referrer-Policy" value="strict-origin-when-cross-origin"/>${noindex?'<remove name="X-Robots-Tag"/><add name="X-Robots-Tag" value="noindex, nofollow"/>':''}</customHeaders></httpProtocol><security><requestFiltering><fileExtensions><remove fileExtension=".sqlite"/><add fileExtension=".sqlite" allowed="false"/><remove fileExtension=".db"/><add fileExtension=".db" allowed="false"/><remove fileExtension=".ps1"/><add fileExtension=".ps1" allowed="false"/><remove fileExtension=".cmd"/><add fileExtension=".cmd" allowed="false"/></fileExtensions></requestFiltering></security></system.webServer></configuration>`;
    fs.writeFileSync(path.join(user,'web.config'),iisConfig(!indexing));fs.writeFileSync(path.join(admin,'web.config'),iisConfig(true));
    if(fs.existsSync(backup))fs.rmSync(backup,{recursive:true});
    if(fs.existsSync(output))renameOutput(output,backup);
    try{renameOutput(temporary,output);}catch(error){if(fs.existsSync(backup))renameOutput(backup,output);throw error;}
    if(fs.existsSync(backup))fs.rmSync(backup,{recursive:true});
    const report={ok:true,generatedAt:new Date().toISOString(),games:games.length,activeGames:games.filter(g=>g.enabled).length,routes:routes.length,output,searchIndexingEnabled:indexing,catalogSha256:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')};
    fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/build.json'),JSON.stringify(report,null,2));
    return report;
  }catch(error){if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--config');const p=i>=0?process.argv[i+1]:path.join(projectRoot,'config/local.json');
  const config=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')):{};
  const j=process.argv.indexOf('--webgames');
  try{
    if(j>=0&&(!process.argv[j+1]||process.argv[j+1].startsWith('--')))throw new Error('--webgames requires a path.');
    await syncCheckoutGames({webgames:j>=0?process.argv[j+1]:undefined});
    console.log(JSON.stringify(build({config}),null,2));
  }catch(error){console.error('Build failed: '+error.message);process.exitCode=1;}
}
