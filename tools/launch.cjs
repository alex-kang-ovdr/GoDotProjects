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
  if (!['showcase', 'ready', 'compare'].includes(option) || extra.length || !/^[a-z0-9-]+$/.test(template)) {
    console.error('Usage: Run_Engine.bat showcase|ready <template> or compare godot-ai|gdmcp|assistant-hub');
    process.exit(1);
  }
  try {
    const { prepareTemplateShowcase } = require('../forge/Tools/prepare-template-showcase.cjs');
    const demos = path.join(ROOT, 'forge', 'Saved', 'Demos');
    fs.mkdirSync(demos, { recursive: true });
    let folder;
    if (option === 'compare') {
      const installer = path.join(ROOT, 'forge/Tools/prepare-ai-comparison.cjs');
      const prepared = spawnSync(process.execPath, [installer, template],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
      if (prepared.error || prepared.status !== 0) throw new Error('Could not prepare the comparison project.');
      folder = prepared.stdout.trim();
      if (template === 'godot-ai') {
        process.env.GODOT_AI_DISABLE_TELEMETRY = 'true';
        const localUv = path.join(ROOT, 'forge', 'Saved', 'Tools', 'uv', process.arch);
        if (fs.existsSync(path.join(localUv, 'uvx.exe'))) process.env.PATH = localUv + path.delimiter + process.env.PATH;
      }
    } else {
      const parent = fs.mkdtempSync(path.join(demos, 'Replay-'));
      folder = path.join(parent, template);
      prepareTemplateShowcase(template, folder, option);
    }
    if (option === 'compare' && template === 'assistant-hub' &&
        require('./open-godot-project.cjs').isGodotProjectOpen(report.command.executable, folder)) {
      console.log('AI Assistant Hub is already open: ' + folder);
      process.exit(0);
    }
    console.log('Importing replay project assets...');
    const imported = spawnSync(report.command.executable, ['--headless', '--path', folder, '--import'],
      { cwd: folder, stdio: 'inherit', windowsHide: true });
    if (imported.error) throw imported.error;
    if (imported.status !== 0) throw new Error('Godot could not import the replay project.');
    report.command.args = ['--editor', '--path', folder, 'res://scenes/main.tscn'];
    console.log('PlayForge project: ' + folder);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
if (report.component === 'engine' && process.argv.length > 3) {
  const { createAssetLibraryHandler } = require('../forge/Tools/asset-library.cjs');
  const handle = createAssetLibraryHandler(path.join(ROOT, 'forge'));
  const { handleAgentChat, isAgentChatRoute } = require('../forge/Tools/agent-chat-provider.cjs');
  const library = http.createServer((req, res) => {
    if (isAgentChatRoute(req.url)) {
      return handleAgentChat(req, res, (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      });
    }
    if (!handle(req, res)) res.writeHead(404).end();
  });
  library.once('error', error => { console.error(error.message); process.exitCode = 1; });
  library.listen(0, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + library.address().port + '/api/asset-library';
    console.log('Godot Asset Store - PlayForge Local: ' + url);
    if (process.argv[3] === 'showcase') console.log('Start the showcase: Project > Tools > PlayForge Showcase');
    const child = spawn(report.command.executable, report.command.args, {
      cwd: report.command.cwd, stdio: 'inherit',
      env: { ...process.env, PLAYFORGE_ASSET_LIBRARY_URL: url,
        PLAYFORGE_AGENT_CHAT_URL: 'http://127.0.0.1:' + library.address().port + '/api/agent-chat' },
    });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.once('close', code => { handleAgentChat.close(); library.close(); process.exitCode = code === 0 ? 0 : 1; });
  });
} else if (report.component === 'agent' || (report.component === 'forge' && process.argv[3] === 'open-editor')) {
  launchWebWorkspace(report.component === 'agent').catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
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

async function launchWebWorkspace(standalone) {
  const { createServer } = require('../forge/server.cjs');
  const { ensureLocalOllama } = require('../forge/Tools/local-ollama.cjs');
  const { startLanEditor } = require('./lan-editor.cjs');
  const agentChatEnv = { ...process.env };
  if (!agentChatEnv.PLAYFORGE_OLLAMA_URL && !agentChatEnv.PLAYFORGE_AGENT_MODEL) {
    try {
      const { model } = await ensureLocalOllama();
      if (model) agentChatEnv.PLAYFORGE_AGENT_MODEL = model;
    } catch (error) {
      console.error('Could not detect the local Ollama service: ' + error.message);
    }
  }
  const server = createServer({ publicOrigin: '', agentChatEnv });
  server.once('error', error => {
    console.error(error.message);
    server.shutdown();
    process.exitCode = 1;
  });
  server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
    const port = server.address().port;
    const editorUrl = 'http://127.0.0.1:' + port + '/OfficialGodot/';
    const agentUrl = editorUrl + 'agent.html';
    if (!standalone) console.log('PlayForge Agent Replay: ' + editorUrl);
    console.log('PlayForge AI Agent: ' + agentUrl);
    if (!standalone) {
      startLanEditor(server, port);
      const hub = spawn(process.execPath, [__filename, 'engine', 'compare', 'assistant-hub'], {
        cwd: ROOT, env: agentChatEnv, detached: true, stdio: 'inherit', windowsHide: true,
      });
      hub.once('error', error => console.error('AI Assistant Hub could not start: ' + error.message));
      hub.once('exit', code => {
        if (code !== 0) console.error('AI Assistant Hub launcher exited with code ' + code + '.');
      });
      hub.unref();
    }
    console.log('Keep this window open. Press Ctrl+C to stop the web server.');
    if (process.env.PLAYHUB_NO_BROWSER !== '1') {
      openBrowser(agentUrl);
      if (!standalone) openBrowser(editorUrl);
    }
  });
  process.once('SIGINT', () => server.shutdown());
  process.once('SIGTERM', () => server.shutdown());
}

function openBrowser(url) {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  browser.once('error', () => console.error('Open this address in your browser: ' + url));
  browser.unref();
}
