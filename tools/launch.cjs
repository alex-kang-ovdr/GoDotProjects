"use strict";

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
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
        body: JSON.stringify({ name: 'Tappy Chicken', template: TAPPY, mode: 'ready' }),
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
async function main(args) {
  const [component, ...options] = args;
  if (options.some(option => option !== 'showcase' && option !== '--check')) {
    throw new Error('Usage: Run_' + component + '.bat [showcase] [--check]');
  }
  if (useSelectedNode(args, component)) return;
  const showcase = options.includes('showcase');
  const report = check(component, { showcase });
  if (!report.ok) throw new Error(report.issues.join('\n'));
  if (options.includes('--check')) {
    console.log(component + ' prerequisites ready (Node ' + process.versions.node + ').');
    return;
  }
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
