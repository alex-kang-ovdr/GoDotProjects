"use strict";
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FORGE_PORT = 4177;
const { inventory, MAIN_PORT: GAME_PORT } = require('./local-games/registry.cjs');
const { assertRuntimeOutput } = require('../hub/tools/runtime-output.cjs');
const HUB_USER_PORT = 8080;
const HUB_ADMIN_UI_PORT = 8081;
const COMPONENTS = ['hub', 'forge', 'game', 'engine'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const GODOT_EXE = 'Godot_v4.7.2-stable_win64.exe';
const GODOT_WEB_FILES = ['godot.editor.js', 'godot.editor.wasm',
  'godot.editor.audio.worklet.js', 'godot.editor.audio.position.worklet.js'];

function isFile(file) {
  try { return path.isAbsolute(file) && fs.statSync(file).isFile(); }
  catch { return false; }
}

function contains(directory, entry) {
  const relative = path.relative(directory, entry);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function godotExecutable(root, env) {
  if (env.GODOT_BIN) return isFile(env.GODOT_BIN) ? env.GODOT_BIN : null;
  return [
    path.join(root, 'artifacts', 'local-runtime', 'godot', GODOT_EXE),
    path.resolve(root, '..', '..', 'GoDotProjects', GODOT_EXE),
  ].find(isFile);
}

function dependencies(app, issues, includeDev = false) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
    const required = { ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) };
    for (const dependency of Object.keys(required)) {
      try { require.resolve(dependency, { paths: [app] }); }
      catch { issues.push('Missing dependency in ' + path.basename(app) + ': ' + dependency); }
    }
  } catch {
    issues.push('Unreadable package.json in ' + path.basename(app));
  }
}

function hubCommand(root, env, present, issues) {
  const cwd = path.join(root, 'hub');
  present(path.join(cwd, 'server', 'index.mjs'));
  present(path.join(cwd, 'tools', 'dev.mjs'));
  dependencies(cwd, issues);
  const configPath = env.PLAYHUB_CONFIG
    ? path.resolve(env.PLAYHUB_CONFIG)
    : path.join(cwd, 'config', 'local.json');
  const command = { cwd, args: ['tools/dev.mjs', '--config', configPath] };
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')); }
  catch {
    issues.push('Provide a valid hub/config/local.json or set PLAYHUB_CONFIG.');
    return command;
  }
  try { assertRuntimeOutput(cwd, config); } catch (error) { issues.push(error.message); }
  if (!LOOPBACK.has(config?.publicHost) || !LOOPBACK.has(config?.adminHost)) {
    issues.push('Hub publicHost and adminHost must explicitly be loopback.');
  }
  const ports = [
    ['publicPort', config?.publicPort],
    ['adminPort', config?.adminPort],
    ['userPort', config?.userPort ?? HUB_USER_PORT],
    ['adminUiPort', config?.adminUiPort ?? HUB_ADMIN_UI_PORT],
  ];
  for (const [name, port] of ports) {
    if (!validPort(port)) issues.push('Hub ' + name + ' must be 1..65535.');
  }
  if (new Set(ports.map(([, port]) => port)).size !== ports.length) {
    issues.push('Hub API and UI ports must all differ.');
  }
  if (typeof config?.dataDir !== 'string' || !path.isAbsolute(config.dataDir)) {
    issues.push('Hub dataDir must be an explicit absolute private path.');
  }
  command.host = config?.publicHost;
  command.userPort = config?.userPort ?? HUB_USER_PORT;
  command.adminUiPort = config?.adminUiPort ?? HUB_ADMIN_UI_PORT;
  return command;
}

function gameCommand(root, env, present, issues) {
  for (const entry of ['tools/local-games/server.cjs','tools/local-games/registry.cjs',
    'tools/local-games/sdk-host.js','tools/local-games/player-locale.js','hub/shared/game-logic.js','games/catalog.json']) present(path.join(root,entry));
  if (env.PLAYHUB_GAME_DIR || env.PLAYHUB_GAME_PORT) {
    issues.push('Select the game in Run_Games.bat; legacy direct-directory and port overrides are no longer supported.');
  }
  try {
    const data=inventory(root);
    issues.push(...data.warnings);
    if (!data.rows.length) issues.push('No game runtime is present in the repository.');
    for (const row of data.rows) if(row.blocked) issues.push(row.id+': '+row.blocked);
  } catch { issues.push('The repository game registry could not be read.'); }
  return { cwd:root, args:['tools/local-games/server.cjs'], host:'127.0.0.1', port:GAME_PORT };
}
function check(component, { root = ROOT, env = process.env, nodeVersion = process.versions.node, showcase = false } = {}) {
  if (!COMPONENTS.includes(component)) return { component, ok: false, issues: ['Unknown component'] };
  const issues = [];
  const major = Number(nodeVersion.split('.')[0]);
  const minimum = component === 'hub' ? 24 : 22;
  if (!Number.isInteger(major) || major < minimum) {
    issues.push('Node ' + minimum + '+ required (current ' + nodeVersion + ').');
  }
  function present(file) {
    if (!isFile(file)) issues.push('Missing required file: ' + path.relative(root, file));
  }
  if (showcase && !['engine', 'forge'].includes(component)) {
    issues.push('The showcase option requires Run_Engine.bat or Run_Forge.bat.');
  }
  let command;
  if (component === 'hub') command = hubCommand(root, env, present, issues);
  if (component === 'game') command = gameCommand(root, env, present, issues);
  if (component === 'forge' || component === 'engine') {
    const engine = godotExecutable(root, env);
    if (!engine) {
      issues.push('Set GODOT_BIN to an absolute Godot executable file. godot-engine contains source.');
    }
    const forge = path.join(root, 'forge');
    if (showcase) {
      present(path.join(forge, 'Templates', 'tappy-chicken', 'showcase.json'));
      present(path.join(forge, 'Godot', 'addons', 'playforge_showcase', 'plugin.cfg'));
    }
    if (component === 'forge') {
      present(path.join(forge, 'server.cjs'));
      dependencies(forge, issues);
      for (const file of GODOT_WEB_FILES) present(path.join(forge, 'OfficialGodot', 'vendor', file));
      const host = env.HOST || '127.0.0.1';
      const port = Number(env.PORT || FORGE_PORT);
      if (!LOOPBACK.has(host)) issues.push('Forge HOST must be loopback.');
      if (!validPort(port)) issues.push('Forge PORT must be 1..65535.');
      command = { cwd: forge, engine, host, port };
    } else {
      const directory = path.join(forge, 'Saved', 'Demos', 'TappyChickenShowcase');
      const project = path.join(directory, 'project.godot');
      if (showcase && fs.existsSync(directory)) {
        present(project);
        present(path.join(directory, '.playforge-showcase.json'));
        present(path.join(directory, 'addons', 'playforge_showcase', 'plugin.cfg'));
      }
      if (showcase && !fs.existsSync(directory)) present(path.join(forge, 'Tools', 'prepare-template-showcase.cjs'));
      command = { cwd: root, executable: engine, args: showcase ? ['--editor', '--path', directory] : ['--project-manager'], project };
    }
  }
  return { component, ok: issues.length === 0, issues, command };
}

if (require.main === module) {
  const component = process.argv[2] || 'all';
  const reports = (component === 'all' ? COMPONENTS : [component]).map(name => check(name));
  for (const { component, ok, issues } of reports) console.log(JSON.stringify({ component, ok, issues }));
  process.exitCode = reports.every(report => report.ok) ? 0 : 1;
}

module.exports = { check, contains, ROOT };
