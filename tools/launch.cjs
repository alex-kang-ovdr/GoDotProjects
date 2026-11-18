"use strict";
const {check, ROOT}=require('./preflight.cjs');const {spawn, spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
if (['forge', 'engine'].includes(process.argv[2]) && !process.env.GODOT_BIN) {
  const installed = path.resolve(ROOT, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64.exe');
  if (fs.existsSync(installed)) process.env.GODOT_BIN = installed;
}
const report=check(process.argv[2]);
if(!report.ok){for(const issue of report.issues)console.error(issue);console.error('Not started. No processes were stopped and no security settings changed.');process.exit(1);}
if (report.component === 'engine' && process.argv.length > 3) {
  const [, , , option, template = 'tappy-chicken', ...extra] = process.argv;
  if (option !== 'showcase' || extra.length || !/^[a-z0-9-]+$/.test(template)) {
    console.error('Usage: Run_Engine.bat [showcase [template-id]]');
    process.exit(1);
  }
  try {
    const { prepareTemplateShowcase } = require('../forge/Tools/prepare-template-showcase.cjs');
    const demos = path.join(ROOT, 'forge', 'Saved', 'Demos');
    fs.mkdirSync(demos, { recursive: true });
    const parent = fs.mkdtempSync(path.join(demos, 'Replay-'));
    const folder = path.join(parent, template);
    prepareTemplateShowcase(template, folder);
    console.log('Importing replay project assets...');
    const imported = spawnSync(report.command.executable, ['--headless', '--path', folder, '--import'],
      { cwd: folder, stdio: 'inherit', windowsHide: true });
    if (imported.error) throw imported.error;
    if (imported.status !== 0) throw new Error('Godot could not import the replay project.');
    report.command.args = ['--editor', '--path', folder, 'res://scenes/main.tscn'];
    console.log('PlayForge Showcase: ' + folder);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
if (report.component === 'forge' && process.argv[3] === 'open-editor') {
  const {createServer} = require('../forge/server.cjs');
  const server = createServer();
  server.once('error', error => {
    console.error(error.message);
    server.shutdown();
    process.exitCode = 1;
  });
  server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + server.address().port + '/OfficialGodot/';
    console.log('PlayForge Agent Replay: ' + url);
    console.log('Keep this window open. Press Ctrl+C to stop.');
    if (process.env.PLAYHUB_NO_BROWSER !== '1') {
      const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url],
        { detached: true, stdio: 'ignore', windowsHide: true });
      browser.on('error', () => console.error('Open the address above in your browser.'));
      browser.unref();
    }
  });
  process.once('SIGINT', () => server.shutdown());
  process.once('SIGTERM', () => server.shutdown());
} else if(report.component!=='game'){
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
