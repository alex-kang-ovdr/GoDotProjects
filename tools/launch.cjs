"use strict";

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { check, ROOT } = require('./preflight.cjs');

const TAPPY = 'tappy-chicken';
function localUrl(host, port, pathname = '/') {
  return 'http://' + (host === '::1' ? '[::1]' : host) + ':' + port + pathname;
}

function openBrowser(url) {
  if (process.env.PLAYHUB_NO_BROWSER === '1') return;
  const command = {
    win32: ['rundll32.exe', ['url.dll,FileProtocolHandler', url]],
    darwin: ['open', [url]],
  }[process.platform] || ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.error('Open this address in your browser: ' + url));
  child.unref();
}

function track(child) {
  child.on('error', error => {
    console.error('Could not start the program: ' + error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
  return child;
}

function explicitOrBundledNode(component) {
  if (process.env.PLAYHUB_NODE_BIN) return process.env.PLAYHUB_NODE_BIN;
  if (component !== 'hub' || Number(process.versions.node.split('.')[0]) >= 24) return null;
  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  const bundled = path.join(ROOT, 'artifacts', 'local-runtime', 'node24', executableName);
  return fs.existsSync(bundled) ? bundled : null;
}

function useSelectedNode(args, component) {
  const executable = explicitOrBundledNode(component);
  if (!executable) return false;
  if (!path.isAbsolute(executable)) throw new Error('PLAYHUB_NODE_BIN must be an absolute file path.');
  if (fs.realpathSync(executable) === fs.realpathSync(process.execPath)) return false;
  track(spawn(executable, [__filename, ...args], { cwd: ROOT, stdio: 'inherit' }));
  return true;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    function onError(error) { reject(error); }
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function stopOnSignal(stop) {
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

function launchEngine({ project, executable, args, cwd }, showcase) {
  if (showcase && !fs.existsSync(project)) {
    const { prepareTemplateShowcase } = require('../forge/Tools/prepare-template-showcase.cjs');
    fs.mkdirSync(path.dirname(path.dirname(project)), { recursive: true });
    prepareTemplateShowcase(TAPPY, path.dirname(project));
  }
  if (showcase) console.log('Tappy Chicken showcase: ' + project);
  track(spawn(executable, args, { cwd, stdio: 'inherit' }));
}

function launchHub({ cwd, args, host, userPort, adminUiPort }) {
  let ready = false;
  const child = track(spawn(process.execPath, args, { cwd, stdio: ['inherit', 'pipe', 'inherit'] }));
  child.stdout.pipe(process.stdout, { end: false });
  const output = readline.createInterface({ input: child.stdout });
  output.on('line', line => {
    if (ready || !line.startsWith('READY - ')) return;
    ready = true;
    const user = localUrl(host, userPort);
    console.log('PlayHub: ' + user);
    console.log('PlayHub admin: ' + localUrl('127.0.0.1', adminUiPort));
    openBrowser(user);
  });
}

async function launchForge({ cwd, engine, host, port }, showcase) {
  const base = localUrl(host, port);
  let options = {
    publicOrigin: process.env.PUBLIC_ORIGIN || new URL(base).origin,
    basePath: process.env.PLAYFORGE_BASE_PATH || '',
  };
  if (showcase) {
    const demos = path.join(cwd, 'Saved', 'Demos');
    fs.mkdirSync(demos, { recursive: true });
    const directory = fs.mkdtempSync(path.join(demos, 'TappyChickenWeb-'));
    options = {
      ...options,
      hubAuth: false,
      workspace: path.join(directory, 'Workspace'),
      platformWorkspace: path.join(directory, 'Platform'),
      buildDirectory: path.join(directory, 'Builds'),
    };
  }
  process.env.GODOT_BIN = engine;
  process.env.PLAYFORGE_HEADLESS ??= '1';
  const { createServer } = require('../forge/server.cjs');
  const server = createServer(options);
  let url = base + 'OfficialGodot/';
  try {
    await listen(server, port, host);
    if (showcase) {
      const response = await fetch(base + 'api/platform/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tappy Chicken', template: TAPPY, mode: 'showcase' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Tappy Chicken could not be created (HTTP ' + response.status + ').');
      const { project } = await response.json();
      if (!/^[a-f0-9]{24}$/.test(project?.id)) throw new Error('Missing Tappy Chicken project ID.');
      url += '?project=' + project.id + '&showcase=1';
    }
  } catch (error) {
    server.shutdown();
    if (error.code === 'EADDRINUSE') throw new Error('Forge port ' + port + ' is in use. Choose another PORT.');
    throw error;
  }
  stopOnSignal(() => server.shutdown());
  console.log('PlayForge: ' + url);
  openBrowser(url);
}

function launchGame({ cwd, args }) {
  // Every game entry point uses the same isolated runtime and repository registry.
  const child = track(spawn(process.execPath, args, { cwd, stdio: 'inherit' }));
  stopOnSignal(() => child.kill('SIGTERM'));
}
function launchEngineReplay(report, option, template) {
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
    return;
  }
  console.log('Importing replay project assets...');
  const imported = spawnSync(report.command.executable, ['--headless', '--path', folder, '--import'],
    { cwd: folder, stdio: 'inherit', windowsHide: true });
  if (imported.error) throw imported.error;
  if (imported.status !== 0) throw new Error('Godot could not import the replay project.');
  const args = ['--editor', '--path', folder, 'res://scenes/main.tscn'];
  console.log('PlayForge project: ' + folder);

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
    const base = 'http://127.0.0.1:' + library.address().port;
    const url = base + '/api/asset-library';
    console.log('Godot Asset Store - PlayForge Local: ' + url);
    if (option === 'showcase') console.log('Start the showcase: Project > Tools > PlayForge Showcase');
    const child = spawn(report.command.executable, args, {
      cwd: report.command.cwd, stdio: 'inherit',
      env: { ...process.env, PLAYFORGE_ASSET_LIBRARY_URL: url, PLAYFORGE_AGENT_CHAT_URL: base + '/api/agent-chat' },
    });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.once('close', code => { handleAgentChat.close(); library.close(); process.exitCode = code === 0 ? 0 : 1; });
  });
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
  const server = createServer({ publicOrigin: '', hubAuth: false, agentChatEnv });
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
    openBrowser(agentUrl);
    if (!standalone) openBrowser(editorUrl);
  });
  stopOnSignal(() => server.shutdown());
}

async function main(args) {
  const [component, ...options] = args;
  const checkOnly = options.includes('--check');
  const rest = options.filter(option => option !== '--check');
  const [mode, template] = rest;
  const usage = 'Usage: Run_' + component + '.bat [showcase] [--check]  |  Run_Forge.bat agent|open-editor  |  '
    + 'Run_Engine.bat showcase|ready <template> or compare godot-ai|gdmcp|assistant-hub';
  const webMode = component === 'forge' && ['agent', 'open-editor'].includes(mode) && rest.length === 1;
  const replayMode = component === 'engine' && ['showcase', 'ready', 'compare'].includes(mode)
    && (template !== undefined || mode !== 'showcase') && rest.length <= 2
    && /^[a-z0-9-]+$/.test(template ?? 'tappy-chicken');
  const plainShowcase = rest.length === 1 && mode === 'showcase';
  if (rest.length && !webMode && !replayMode && !plainShowcase) throw new Error(usage);
  if (useSelectedNode(args, component)) return;
  const showcase = plainShowcase;
  const report = check(webMode && mode === 'agent' ? 'agent' : component, { showcase });
  if (!report.ok) throw new Error(report.issues.join('\n'));
  if (checkOnly) {
    console.log(component + ' prerequisites ready (Node ' + process.versions.node + ').');
    return;
  }
  if (webMode) return launchWebWorkspace(mode === 'agent');
  if (replayMode) return launchEngineReplay(report, mode, template ?? 'tappy-chicken');
  switch (component) {
    case 'engine': return launchEngine(report.command, showcase);
    case 'forge': return launchForge(report.command, showcase);
    case 'game': return launchGame(report.command);
    case 'hub': return launchHub(report.command);
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
