import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const directory = path.dirname(fileURLToPath(import.meta.url));
const width = 1280, height = 800;
const groupMs = 1000 / 30;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const useModule = (root, relative) => import(pathToFileURL(path.join(root, relative)).href);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const scenarios = {
  'fortress-blue': {
    name: 'Fortress War',
    task: 'Play the blue tank against the red AI. Land at least one damaging hit on the red tank. Use the on-screen angle, power, terrain, wind and resulting shot feedback to adjust subsequent shots.',
    rules: 'A 2D turn-based artillery game. The blue tank starts at the left, the opponent starts at the right. Only act while it is your turn and wait for projectile resolution or AI play. Aim using the preview and visible target. Space charges from zero, so a very short hold barely fires. Keep Space down across successive decisions to build power, then release it. Alternatively, a quick click on the Fire button fires at the target power shown on the slider. Track the aiming deck at the bottom.',
    controls: ['Left / A and Right / D -> drive and face left or right', 'Up / W and Down / S -> raise or lower the firing angle', 'Space -> hold to charge, release to fire', 'one / two -> select a weapon; Q / E cycle weapons', 'LB -> click the power/angle sliders or the fire button; drag in the arena to aim'],
    hook: 'window.FortApp?.getState()',
    telemetry: `(() => { const s=FortApp.getState(), g=FortApp.getGame(); return {config:s.config, phase:s.phase, paused:s.paused, human:g.isHumanTurn(), activeId:s.activeId, wind:s.wind, round:s.round, turn:s.turnNumber, simTime:s.simTime, timeLeft:s.timeLeft, power:g.state.power, weapon:g.state.weaponIndex, tanks:s.tanks, projectiles:s.projectiles, terrainVersion:s.terrain.version, lastAction:s.lastAction, winner:s.winner, endReason:s.endReason, stats:s.stats}; })()`,
  },
  besiege: {
    name: 'Ironwood: Siege Workshop (Besiege)',
    task: 'Launch the provided Rover in the Outpost mission, drive toward the targets and destroy them by shooting or ramming. Keep the core intact.',
    rules: 'A 3D construction and vehicle physics game. The provided rover is built and ready in the workshop. Press Space once to switch to field driving. The mission target is ahead of the rover; line up its cannon and move close enough to hit it. Watch the on-screen reload and ammo indicators. In field mode, do not press Space again unless you intend to return to the workshop.',
    controls: ['Space -> launch the Rover from the workshop; in play mode returns to the workshop', 'W / S -> drive forward / reverse', 'A / D -> steer left / right', 'B -> brake', 'Q / E -> turn cannon turret left / right', 'I / K -> increase / decrease cannon elevation', 'F -> fire cannon when loaded', 'RB drag -> orbit camera; MB drag -> pan camera; wheel -> zoom'],
    hook: 'window.ironwood?.getState()',
    telemetry: `(() => { const s=ironwood.getState(); return {mode:s.mode, paused:s.paused, mission:s.mission, partCount:s.partCount, ready:s.valid.ready, selected:s.selected, sim:s.sim}; })()`,
  },
};

function parseArgs(args) {
  const options = { games: Object.keys(scenarios), steps: 20, besiegeStart: 'workshop', guardPlayMode: false, controller: 'model', guidance: 'none', groupTicks: 1, stopOnObjective: false, requireObjective: false, runId: new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid, endpoint: process.env.PLAYHUB_MODEL_URL || 'http://127.0.0.1:8765/act', seed: 20261118, timeout: 600000 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') return { help: true };
    const key = args[i], value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('Expected a value for ' + key);
    if (key === '--game') options.games = value === 'all' ? Object.keys(scenarios) : [value];
    else if (key === '--steps') options.steps = Number(value);
    else if (key === '--besiege-start') options.besiegeStart = value;
    else if (key === '--controller') options.controller = value;
    else if (key === '--guidance') options.guidance = value;
    else if (key === '--group-ticks') options.groupTicks = Number(value);
    else if (key === '--stop-on-objective' || key === '--require-objective') {
      if (!['true', 'false'].includes(value)) throw new Error(key + ' must be true or false.');
      options[key === '--stop-on-objective' ? 'stopOnObjective' : 'requireObjective'] = value === 'true';
    }
    else if (key === '--guard-play-mode') {
      if (value !== 'true' && value !== 'false') throw new Error('--guard-play-mode must be true or false.');
      options.guardPlayMode = value === 'true';
    }
    else if (key === '--seed') options.seed = Number(value);
    else if (key === '--timeout-ms') options.timeout = Number(value);
    else if (key === '--run-id') options.runId = value;
    else if (key === '--model-url') options.endpoint = value;
    else throw new Error('Unknown argument: ' + key);
  }
  if (!options.games.every(id => Object.hasOwn(scenarios, id))) throw new Error('Use --game fortress-blue, besiege, or all.');
  if (!['play', 'workshop'].includes(options.besiegeStart)) throw new Error('--besiege-start must be play or workshop.');
  if (!['model', 'guided', 'hybrid'].includes(options.controller)) throw new Error('--controller must be model, guided, or hybrid.');
  if (!['none', 'combat'].includes(options.guidance)) throw new Error('--guidance must be none or combat.');
  if (!Number.isInteger(options.groupTicks) || options.groupTicks < 1 || options.groupTicks > 60) throw new Error('--group-ticks must be 1..60.');
  if (options.guardPlayMode && options.besiegeStart !== 'play') throw new Error('--guard-play-mode true requires --besiege-start play.');
  if (!Number.isInteger(options.steps) || options.steps < 0 || options.steps > 600) throw new Error('--steps must be an integer from 0 to 600.');
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('--seed must be a uint32.');
  if (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 1800000) throw new Error('--timeout-ms must be an integer from 1000 to 1800000.');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(options.runId)) throw new Error('Invalid --run-id.');
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Model endpoint must be loopback HTTP.');
  return options;
}

function systemPrompt(scenario) {
  const readme = fs.readFileSync(path.join(directory, 'upstream/readme.md'), 'utf8').replace(/\r/g, '');
  const template = readme.match(/```text\n(You are a gaming expert,[\s\S]*?)\n```/)?.[1];
  if (!template) throw new Error('Could not find the upstream Gamer system prompt.');
  const rules = `${scenario.rules}\n\nObjective: ${scenario.task}\nThe small yellow crosshair is your current mouse pointer in the screenshot. Mouse X/Y use relative thousandths of the displayed game width/height; movement occurs before the key groups. Keys stay held when repeated in consecutive groups, including across decisions. Use six empty groups to wait.`;
  return template.replaceAll('{GAME_NAME}', scenario.name).replace('{GAME_RULES}', rules).replace('{KEY_BINDINGS}', ['- Mouse X Y -> move the pointer (X>0 right, Y>0 down)', ...scenario.controls.map(x => '- ' + x)].join('\n'));
}

export function actionHistory(action) {
  return `<|action_start|>${action.mouse.join(' ')} ; ${action.steps.map(group => group.join(' ')).join(' ; ')}<|action_end|>`;
}

export function combatInstruction(id, observation, groupTicks) {
  const timing = `Each of your six key groups lasts ${(groupMs * groupTicks / 1000).toFixed(3)} seconds.`;
  if (id === 'besiege') return `${timing} You are already in combat. Do NOT press Space. The loaded cannon initially faces the outpost. Fire the cannon now using F. Release and press F again after reload. Do not reverse away from targets. Your task is shooting and destroying targets, not opening menus.`;
  if (!observation.human || observation.phase !== 'aim') return `${timing} A shot or opponent turn is in progress. Release all keys and wait. Do not move the mouse or click menus.`;
  return `${timing} It is your blue tank's turn. Aim at the red tank on the right. A very brief Space tap makes a weak shot. Hold Space long enough to build useful power, then release to fire. Alternatively click the Fire button using the displayed target power. Do not leave battle.`;
}

function treeDigest(root) {
  const files = [];
  const visit = (dir, prefix = '') => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + item.name;
      if (item.isDirectory()) visit(path.join(dir, item.name), relative + '/');
      else if (item.isFile()) files.push([relative, hash(fs.readFileSync(path.join(dir, item.name)))]);
      else throw new Error('Unexpected non-regular file in ' + dir + ': ' + item.name);
    }
  };
  visit(root);
  return { sha256: hash(JSON.stringify(files)), count: files.length };
}

async function makeFixture(temp, projectRoot, games) {
  const hub = path.join(projectRoot, 'hub'), canon = path.join(projectRoot, 'games');
  const fixture = path.join(temp, 'hub'), source = path.join(temp, 'webgames');
  fs.mkdirSync(fixture); fs.mkdirSync(source);
  for (const name of ['web', 'shared']) fs.cpSync(path.join(hub, name), path.join(fixture, name), { recursive: true });
  const catalog = json(path.join(canon, 'catalog.json'));
  catalog.entries = catalog.entries.filter(e => e.enabled && games.includes(e.id));
  if (catalog.entries.length !== games.length) throw new Error('Requested games were not enabled in the canonical PlayHub catalog.');
  writeJson(path.join(source, 'catalog.json'), catalog);
  const fingerprints = {};
  for (const id of games) {
    const canonical = path.join(canon, id), dest = path.join(source, id);
    fs.mkdirSync(dest);
    const manifest = path.join(canonical, 'game.manifest.json');
    fingerprints[id] = { source: path.join(canonical, 'Web'), manifestVersion: json(manifest).version, manifestSha256: hash(fs.readFileSync(manifest)), canonical: treeDigest(path.join(canonical, 'Web')) };
    fs.copyFileSync(manifest, path.join(dest, 'game.manifest.json'));
    fs.cpSync(path.join(canonical, 'Web'), path.join(dest, 'Web'), { recursive: true });
  }
  const [{ syncWebGames }, { build }, { createApp }, { createStaticServer }] = await Promise.all([
    useModule(hub, 'tools/sync-webgames.mjs'), useModule(hub, 'tools/build.mjs'), useModule(hub, 'server/app.mjs'), useModule(hub, 'tools/dev.mjs'),
  ]);
  syncWebGames({ root: fixture, webgames: source });
  build({ root: fixture });
  const frontend = path.join(fixture, 'dist/user');
  for (const id of games) fingerprints[id].served = treeDigest(path.join(frontend, 'games', id));
  return { frontend, fixture, fingerprints, createApp, createStaticServer };
}

async function startServer(temp, fixture) {
  const staticServer = fixture.createStaticServer(fixture.frontend);
  let app;
  const stopStatic = async () => {
    staticServer.closeAllConnections();
    if (staticServer.listening) await new Promise(resolve => staticServer.close(resolve));
  };
  try {
    await new Promise((resolve, reject) => { staticServer.once('error', reject); staticServer.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${staticServer.address().port}`;
    const salt = 'a'.repeat(32);
    app = fixture.createApp({ publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0, userOrigins: [base], adminOrigins: [base], userBaseUrl: base, publicBaseUrl: base, adminBaseUrl: base, secureCookies: false, dataDir: path.join(temp, 'data'), admin: { username: 'isolated-test', salt, passwordHash: scryptSync('isolated-local-test-only', salt, 64).toString('hex') } }, { rootDir: fixture.fixture });
    const ports = await app.listen();
    fs.writeFileSync(path.join(fixture.frontend, 'config.js'), `window.PLAYHUB_CONFIG=${JSON.stringify({ apiPort: ports.public.port })};`);
    return { base, app, close: async () => { await stopStatic(); await app.close(); } };
  } catch (error) { await stopStatic(); await app?.close(); throw error; }
}

const frameClock = (seed => {
  if (!/^\/games\/(fortress-blue|besiege)\/index\.html$/.test(location.pathname)) return;
  let rng = seed >>> 0;
  Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const native = window.requestAnimationFrame.bind(window);
  let running = true, scheduled = false, timestamp = performance.now(), next = 0;
  const queued = new Map();
  function dispatch(time) {
    timestamp = time;
    const ids = [...queued.keys()];
    for (const id of ids) {
      const callback = queued.get(id);
      if (!callback) continue;
      queued.delete(id);
      try { callback(time); } catch (error) { setTimeout(() => { throw error; }, 0); }
    }
  }
  function schedule() {
    if (!running || scheduled || !queued.size) return;
    scheduled = true;
    native(time => { scheduled = false; if (running) dispatch(time); schedule(); });
  }
  window.requestAnimationFrame = callback => { const id = ++next; queued.set(id, callback); schedule(); return id; };
  window.cancelAnimationFrame = id => queued.delete(id);
  window.__gamerQaClock = {
    hold() { running = false; return { timestamp, queued: queued.size }; },
    reseed(value) { rng = value >>> 0; },
    step() {
      if (running) throw new Error('QA clock has not been held');
      dispatch(timestamp + 1000 / 60);
      dispatch(timestamp + 1000 / 60);
      return { timestamp, queued: queued.size };
    },
  };
}).toString();

async function until(check, name, timeout = 30000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await check();
    if (value) return value;
    await delay(120);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + name);
}

async function startChrome(temp) {
  const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = path.join(temp, 'chrome');
  let launchError;
  const child = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--no-proxy-server', '--mute-audio', '--disable-site-isolation-trials', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => { launchError = error; });
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await Promise.race([exited, delay(3000)]);
  };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await until(() => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error('Chrome exited with code ' + child.exitCode);
      return fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 15000);
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Chrome target creation HTTP ' + response.status);
    return { ...(await response.json()), close, chromePath };
  } catch (error) { await close(); throw error; }
}

async function connect(url, seed, recordError) {
  const socket = new WebSocket(url);
  const hello = Promise.withResolvers();
  socket.addEventListener('open', () => hello.resolve(), { once: true });
  socket.addEventListener('error', () => hello.reject(new Error('DevTools WebSocket failed to open')), { once: true });
  try { await Promise.race([hello.promise, delay(10000, null, { ref: false }).then(() => { throw new Error('DevTools handshake timed out'); })]); }
  catch (error) { socket.close(); throw error; }
  const jobs = new Map(), contexts = new Map();
  const inject = { source: `(${frameClock})(${seed});` };
  let next = 0;
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) return reject(new Error('DevTools connection is closed'));
    const id = ++next;
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error('DevTools timeout: ' + method)); }, 20000);
    jobs.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('close', () => {
    for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error('DevTools connection closed')); }
    jobs.clear();
  });
  socket.addEventListener('message', ({ data }) => {
    const { id, error, result, method, params, sessionId } = JSON.parse(data);
    const key = n => `${sessionId || ''}:${n}`;
    if (jobs.has(id)) {
      const job = jobs.get(id); jobs.delete(id); clearTimeout(job.timer);
      if (error) job.reject(new Error(error.message)); else job.resolve(result);
    }
    if (method === 'Runtime.executionContextCreated') contexts.set(key(params.context.id), { ...params.context, sessionId });
    if (method === 'Runtime.executionContextDestroyed') contexts.delete(key(params.executionContextId));
    if (method === 'Runtime.executionContextsCleared' || method === 'Target.detachedFromTarget') {
      for (const [k, c] of contexts) if (c.sessionId === (method === 'Target.detachedFromTarget' ? params.sessionId : sessionId)) contexts.delete(k);
    }
    if (method === 'Target.attachedToTarget') {
      const sid = params.sessionId;
      void (async () => {
        try {
          if (params.targetInfo.type === 'iframe') await Promise.all([send('Runtime.enable', {}, sid), send('Page.enable', {}, sid), send('Page.addScriptToEvaluateOnNewDocument', inject, sid), send('Log.enable', {}, sid)]);
        } catch (e) { recordError('iframe-cdp', e.message); }
        finally { await send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {}); }
      })();
    }
    if (method === 'Runtime.exceptionThrown') recordError('exception', params.exceptionDetails.exception?.description || params.exceptionDetails.text);
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') recordError('console', params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    if (method === 'Log.entryAdded' && params.entry.level === 'error') recordError('browser', params.entry.text, params.entry.url);
  });
  const evaluate = async (expression, context) => {
    const result = await send('Runtime.evaluate', { expression, contextId: context?.id, returnByValue: true, awaitPromise: true }, context?.sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  try {
    await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable'), send('Page.addScriptToEvaluateOnNewDocument', inject), send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }), send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }), send('Emulation.setFocusEmulationEnabled', { enabled: true })]);
  } catch (error) { socket.close(); throw error; }
  return { send, evaluate, contexts, close: () => socket.close() };
}

const numberNames = 'zero one two three four five six seven eight nine'.split(' ');
const functionNames = 'One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve'.split(' ');
const keyMappings = {
  Up: ['ArrowUp', 'ArrowUp', 38], Down: ['ArrowDown', 'ArrowDown', 40], Left: ['ArrowLeft', 'ArrowLeft', 37], Right: ['ArrowRight', 'ArrowRight', 39],
  Shift: ['ShiftLeft', 'Shift', 16, 8], Ctrl: ['ControlLeft', 'Control', 17, 2], Alt: ['AltLeft', 'Alt', 18, 1],
  Tab: ['Tab', 'Tab', 9], Caps: ['CapsLock', 'CapsLock', 20], Esc: ['Escape', 'Escape', 27], Space: ['Space', ' ', 32], Enter: ['Enter', 'Enter', 13],
  Back: ['Backspace', 'Backspace', 8], Delete: ['Delete', 'Delete', 46], Insert: ['Insert', 'Insert', 45], Home: ['Home', 'Home', 36], End: ['End', 'End', 35], Pause: ['Pause', 'Pause', 19],
  Equal: ['Equal', '=', 187, 0, '+'], Minus: ['Minus', '-', 189, 0, '_'], Period: ['Period', '.', 190, 0, '>'], Slash: ['Slash', '/', 191, 0, '?'], Quote: ['Quote', "'", 222, 0, '"'],
};
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') keyMappings[c] = [`Key${c}`, c.toLowerCase(), c.charCodeAt(0), 0, c];
numberNames.forEach((token, n) => { keyMappings[token] = [`Digit${n}`, String(n), 48 + n, 0, ')!@#$%^&*('[n]]; });
functionNames.forEach((token, n) => { keyMappings[token] = [`F${n + 1}`, `F${n + 1}`, 112 + n]; });
const mouseButtons = { LB: ['left', 1], RB: ['right', 2], MB: ['middle', 4] };

export function validateDecision(reply) {
  const idle = { mouse: [0, 0, 0], steps: Array.from({ length: 6 }, () => []) };
  const a = reply?.action;
  if (typeof reply?.text !== 'string' || !a || a.parsed !== true || a.truncated || reply.finish_reason === 'length') return { ...idle, invalid: a?.truncated || reply?.finish_reason === 'length' ? 'truncated' : 'unparsed' };
  if (!Array.isArray(a.mouse) || a.mouse.length !== 3 || !a.mouse.every(Number.isFinite) || !Array.isArray(a.steps) || a.steps.length !== 6 || a.steps.some(group => !Array.isArray(group) || group.length > 4 || group.some(k => !Object.hasOwn(keyMappings, k) && !Object.hasOwn(mouseButtons, k)))) return { ...idle, invalid: 'invalid-action-shape' };
  return { mouse: a.mouse.map((n, i) => clamp(n, -[1000, 1000, 5][i], [1000, 1000, 5][i])), steps: a.steps.map(group => [...new Set(group)]), invalid: null };
}

export function applyPlayModeGuard(game, enabled, validated) {
  const guard = { enabled: enabled && game === 'besiege', removedKeyGroups: 0, events: [] };
  if (!guard.enabled) return { executed: validated, guard };

  const groups = [];
  const steps = validated.steps.map((group, index) => {
    if (!group.includes('Space')) return group;
    groups.push(index + 1);
    return group.filter(key => key !== 'Space');
  });
  if (!groups.length) return { executed: validated, guard };
  guard.removedKeyGroups = groups.length;
  guard.events.push({ key: 'Space', groups, reason: 'Besiege play-start scenario reserves the workshop toggle to the harness setup.' });
  return { executed: { ...validated, steps }, guard };
}

export class InputDriver {
  held = new Set();
  x = width / 2;
  y = height / 2;
  modifiers = 0;
  buttons = 0;

  constructor(send, draw) { this.send = send; this.draw = draw; }

  async key(token, down) {
    if (Object.hasOwn(mouseButtons, token)) {
      const [button, flag] = mouseButtons[token];
      this.buttons = down ? this.buttons | flag : this.buttons & ~flag;
      await this.send('Input.dispatchMouseEvent', { type: down ? 'mousePressed' : 'mouseReleased', x: this.x, y: this.y, button, buttons: this.buttons, modifiers: this.modifiers, clickCount: 1 });
    } else {
      const [code, baseKey, windowsVirtualKeyCode, flag = 0, upperKey] = keyMappings[token];
      if (flag) this.modifiers = down ? this.modifiers | flag : this.modifiers & ~flag;
      const key = this.modifiers & 8 && upperKey ? upperKey : baseKey;
      const text = down && key.length === 1 && !(this.modifiers & 3) ? key : undefined;
      await this.send('Input.dispatchKeyEvent', { type: down ? text ? 'keyDown' : 'rawKeyDown' : 'keyUp', code, key, text, unmodifiedText: text ? baseKey : undefined, windowsVirtualKeyCode, modifiers: this.modifiers });
    }
    if (down) this.held.add(token); else this.held.delete(token);
  }

  async move(dx = 0, dy = 0, wheel = 0, force = false) {
    if (dx || dy || force) {
      this.x = clamp(this.x + dx * width / 1000, 1, width - 2);
      this.y = clamp(this.y + dy * height / 1000, 1, height - 2);
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: this.x, y: this.y, buttons: this.buttons, modifiers: this.modifiers });
      await this.draw(this.x, this.y);
    }
    if (wheel) await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: this.x, y: this.y, deltaX: 0, deltaY: -wheel * 100, buttons: this.buttons, modifiers: this.modifiers });
  }

  async apply(action, tick) {
    await this.move(...action.mouse);
    const priority = token => keyMappings[token]?.[3] ? 0 : token === 'Space' ? 1 : Object.hasOwn(mouseButtons, token) ? 3 : 2;
    for (const group of action.steps) {
      const wanted = new Set(group);
      for (const key of [...this.held].filter(key => !wanted.has(key)).sort((a, b) => priority(b) - priority(a))) await this.key(key, false);
      for (const key of [...wanted].sort((a, b) => priority(a) - priority(b))) if (!this.held.has(key)) await this.key(key, true);
      await tick();
    }
  }

  async release() {
    for (const key of [...this.held].reverse()) await this.key(key, false).catch(() => {});
  }

  state() { return { x: this.x, y: this.y, held: [...this.held] }; }
}

const fitFrame = `(() => {
  let node = document.querySelector('iframe[data-testid=game-frame]');
  for (let el = node.parentElement; el; el = el.parentElement) {
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('contain', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
  }
  node.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;border:0!important;z-index:2147483646!important;background:#10161f!important';
  document.scrollingElement.style.setProperty('overflow', 'hidden', 'important');
  document.scrollingElement.style.setProperty('scroll-behavior', 'auto', 'important');
  window.scrollTo({left:0,top:0,behavior:'instant'});
  const cursor = document.createElement('div'); cursor.id='gamer-qa-pointer'; cursor.setAttribute('aria-hidden','true');
  cursor.style.cssText='position:fixed;left:50%;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;display:grid;place-items:center;color:#ffec00;-webkit-text-stroke:1px #000;font:700 25px/20px monospace';
  cursor.textContent='+'; document.body.append(cursor);
  const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,sandbox:node.getAttribute('sandbox')};
})()`;

async function setupGame({ browser: { send, evaluate, contexts }, server, id, scenario, seed, besiegeStart, append }) {
  const navigate = await send('Page.navigate', { url: `${server.base}/play/${id}/?lang=en` });
  if (navigate.errorText) throw new Error(navigate.errorText);
  await until(() => evaluate(`location.pathname===${JSON.stringify('/play/' + id + '/')} && document.querySelector('#play-button') && !document.querySelector('#play-button').disabled`), 'PlayHub play button');
  await evaluate("document.querySelector('#play-button').click()");
  append({ event: 'setup', phase: 'portal', control: '#play-button' });
  await until(() => server.app.db.prepare('SELECT 1 FROM play_sessions WHERE game_id=? AND ready_at IS NOT NULL').get(id), 'PlayHub SDK ready handshake', 45000);
  const layout = await evaluate(fitFrame);
  if (layout.x !== 0 || layout.y !== 0 || layout.width !== width || layout.height !== height) throw new Error('Game viewport does not match screenshot: ' + JSON.stringify(layout));
  const context = await until(async () => {
    const { frameTree } = await send('Page.getFrameTree');
    const ids = frameTree.childFrames?.map(entry => entry.frame.id) || [];
    const expected = '/games/' + id + '/index.html';
    for (const entry of contexts.values()) {
      if (!entry.auxData?.isDefault || !(ids.includes(entry.auxData.frameId) || entry.sessionId)) continue;
      const inspection = await evaluate(`location.pathname===${JSON.stringify(expected)} && Boolean(${scenario.hook})`, entry).catch(() => false);
      if (inspection) return entry;
    }
    return null;
  }, 'game diagnostics hook');
  const ev = expression => evaluate(expression, context);
  const lang = await ev('document.documentElement.lang');
  if (lang !== 'en') throw new Error('Game locale was not en: ' + lang);
  if (!await ev('Boolean(window.__gamerQaClock)')) throw new Error('Game frame clock was not installed');
  if (id === 'besiege') {
    await until(() => ev("document.querySelector('#loading').hidden && ironwood.getState().valid.ready"), 'Besiege workshop');
    const low = await ev(`(() => { const b = document.querySelector('#quality-btn'); if (b.getAttribute('aria-pressed')==='false') b.click(); document.querySelector('#viewport canvas').focus({preventScroll:true}); return b.textContent; })()`);
    append({ event: 'setup', phase: 'game', control: '#quality-btn', value: low, preset: 'default Rover', mission: 'outpost', mode: 'build (model must launch)' });
    await until(() => ev("!document.querySelector('#toast').classList.contains('show')"), 'initial quality toast dismissal', 8000);
    await ev('window.__gamerQaClock.hold()');
    if (besiegeStart === 'play') {
      await ev(`(() => { document.querySelector('#run-btn').click(); document.querySelector('#viewport canvas').focus({preventScroll:true}); window.__gamerQaClock.step(); })()`);
      append({ event: 'setup', phase: 'game', control: '#run-btn', mode: 'play', launchBy: 'harness setup, before model input' });
    }
  } else {
    const seedState = await ev(`(() => {
      const set = (id,value) => { const el=document.getElementById(id); el.value=value; if (el.value !== value) throw new Error('Missing option '+id+'='+value); el.dispatchEvent(new Event('change',{bubbles:true})); };
      document.querySelector('[data-profile="classic"]').click(); document.querySelector('[data-tank="catapult"]').click();
      set('map-select','highlands'); set('control-select','ai'); set('team-size-select','1'); set('difficulty-select','easy'); set('opponent-select','cannon'); set('turn-time-select','60');
      window.__gamerQaClock.hold(); window.__gamerQaClock.reseed(${seed});
      document.querySelector('#start-button').click(); window.__gamerQaClock.step();
      const s=FortApp.getState(); return {seed:s.config.seed,config:s.config,phase:s.phase,human:FortApp.getGame().isHumanTurn(),overlay:!document.querySelector('#lobby-overlay').hidden};
    })()`);
    if (seedState.phase !== 'aim' || !seedState.human || seedState.overlay) throw new Error('Fortress did not start in a human aiming turn: ' + JSON.stringify(seedState));
    append({ event: 'setup', phase: 'game', control: 'classic menu + #start-button', seed: seedState.seed, config: seedState.config });
  }
  append({ event: 'ready', lang, layout, clock: 'virtual-raf-60hz', groupMs, bootstrapControlsComplete: true });
  return ev;
}

export function summarizeGameplay(id, baseline, observations, inputs) {
  const final = observations.at(-1) ?? baseline;
  if (!baseline || !final) return { meaningfulGameplay: false, objectiveMet: false };
  if (id === 'fortress-blue') {
    const initialHp = baseline.tanks.filter(t => t.team === 1).reduce((sum, t) => sum + t.hp, 0);
    const finalHp = final.tanks.filter(t => t.team === 1).reduce((sum, t) => sum + t.hp, 0);
    const shotsTotalDelta = Math.max(0, (final.stats?.shots ?? 0) - (baseline.stats?.shots ?? 0));
    const blueVolleys = new Map();
    for (const s of observations) {
      const a = s.lastAction;
      if (a?.volleyId && a.volleyId !== baseline.lastAction?.volleyId && (a.team === 0 || a.sourceTeam === 0 || baseline.tanks.some(t => t.team === 0 && t.uid === a.ownerId))) blueVolleys.set(a.volleyId, a);
    }
    const blueProjectile = observations.some(s => s.projectiles.some(p => baseline.tanks.some(t => t.team === 0 && t.uid === p.ownerId)));
    const enemyDamage = [...blueVolleys.values()].reduce((total, action) => total + (action.damageToEnemy || 0), 0);
    return { meaningfulGameplay: Boolean(blueProjectile || blueVolleys.size), objectiveMet: enemyDamage > 0, enemyDamage, redHpLoss: Math.max(0, initialHp - finalHp), shotsTotalDelta, completedBlueVolleys: blueVolleys.size, blueProjectile, terrainRemoved: (final.stats?.terrainRemoved ?? 0) - (baseline.stats?.terrainRemoved ?? 0), turnsAdvanced: final.turn - baseline.turn, winner: final.winner, simSeconds: final.simTime - baseline.simTime };
  }
  const sims = observations.map(s => s.sim).filter(Boolean);
  const origin = baseline.sim?.core || sims[0]?.core;
  const maxHorizontalDistance = origin ? Math.max(...sims.map(s => Math.hypot(s.core.x - origin.x, s.core.z - origin.z))) : 0;
  const maxSpeed = Math.max(0, ...sims.map(s => s.speed || 0));
  const shots = Math.max(0, ...sims.map(s => s.shots || 0));
  const destroyed = Math.max(0, ...sims.map(s => s.destroyed || 0));
  const driveInput = inputs.some(a => a.steps.some(g => g.some(k => ['W', 'A', 'S', 'D', 'Up', 'Down', 'Left', 'Right'].includes(k))));
  const won = sims.some(s => s.won);
  return { meaningfulGameplay: Boolean(shots || destroyed || (driveInput && maxHorizontalDistance > 0.15)), objectiveMet: won, initialMode: baseline.mode, launched: Boolean(baseline.sim || sims.length), launchedByModel: !baseline.sim && sims.length > 0, driveInput, maxHorizontalDistance: Math.max(0, maxHorizontalDistance), maxSpeed, shots, destroyed, won, simSeconds: Math.max(0, ...sims.map(s => s.elapsed || 0)) - (sims.length ? baseline.sim?.elapsed ?? 0 : 0), outcome: sims.at(-1)?.outcome ?? null };
}

async function act(options, payload) {
  const response = await fetch(options.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(options.timeout), redirect: 'error' });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Model HTTP ${response.status}: ${raw.slice(0, 1800)}`);
  try { return JSON.parse(raw); } catch { throw new Error('Model returned invalid JSON: ' + raw.slice(0, 1800)); }
}

async function modelHealth(endpoint) {
  const url = new URL('/health', endpoint);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`Model health endpoint HTTP ${response.status}: ${url}`);
  return response.json();
}

async function runGame({ id, options, browser, server, runDir, errors }) {
  let scenario = scenarios[id];
  if (id === 'besiege' && options.besiegeStart === 'play') {
    scenario = { ...scenario, task: 'Drive the already launched Rover toward the Outpost and destroy its nine targets by shooting or ramming. Keep the core intact.', rules: 'A 3D vehicle physics game. The Rover is already launched and ready to drive. Use W to move forward, A and D to steer, and F to shoot. Line up the cannon toward the stone towers and central turret. Pressing Space returns to the workshop, which is not part of this objective. Watch the on-screen ammo and reload indicators.' };
  }
  const gameDir = path.join(runDir, id);
  fs.mkdirSync(gameDir);
  const log = path.join(gameDir, 'steps.jsonl');
  const append = row => fs.appendFileSync(log, JSON.stringify({ timestamp: new Date().toISOString(), game: id, ...row }) + '\n');
  const initialErrors = errors.length;
  const capture = async name => {
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const png = Buffer.from(data, 'base64');
    if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error('Screenshot dimensions do not match input viewport');
    fs.writeFileSync(path.join(gameDir, name), png);
    return data;
  };
  const input = new InputDriver(browser.send, (x, y) => browser.evaluate(`(() => { const s=document.querySelector('#gamer-qa-pointer')?.style; if (s) {s.left='${x}px';s.top='${y}px';} })()`));
  let initial, ev, failure, stopReason = options.steps === 0 ? 'setup-only' : 'step-limit';
  const observations = [], inputs = [];
  let countDecisions = 0, invalid = 0, apiFailures = 0;
  const modeGuard = { enabled: id === 'besiege' && options.guardPlayMode, modifiedDecisions: 0, removedKeyGroups: 0 };
  try {
    const prompt = systemPrompt(scenario);
    fs.writeFileSync(path.join(gameDir, 'system-prompt.txt'), prompt);
    ev = await setupGame({ browser, server, id, scenario, seed: options.seed, besiegeStart: options.besiegeStart, append });
    await input.move(0, 0, 0, true);
    initial = await ev(scenario.telemetry);
    if (id === 'besiege' && (initial.mode !== (options.besiegeStart === 'play' ? 'play' : 'build') || initial.mission !== 'outpost' || !initial.ready || (options.besiegeStart === 'play' && !initial.sim))) throw new Error('Unexpected Besiege initial state: ' + JSON.stringify(initial));
    let image = await capture('000-bootstrap.png');
    let previousAction, current = initial;
    const planner = options.controller !== 'model' ? await (await import(id === 'fortress-blue' ? './fortress_planner.mjs' : './besiege_planner.mjs'))[id === 'fortress-blue' ? 'createFortressPlanner' : 'createBesiegePlanner']({ projectRoot: json(path.join(directory, 'playhub-target.json')).projectRoot, initial }) : null;
    append({ event: 'bootstrap', image: '000-bootstrap.png', telemetry: initial, input: input.state(), focusInGame: await ev('document.hasFocus()'), modeGuard: { enabled: modeGuard.enabled, source: 'QA action filter', blockedKey: modeGuard.enabled ? 'Space' : null }, errors: errors.slice(initialErrors) });
    for (let step = 1; step <= options.steps; step++) {
      const started = performance.now();
      let reply;
      const plan = planner ? await planner.next(current, input.state()) : null;
      const instruction = options.controller === 'guided' ? `Execute this QA plan through your next action chunk. ${plan.reason} Each group lasts ${(groupMs * plan.groupTicks / 1000).toFixed(3)} seconds. Mouse: ${plan.action.mouse.join(' ')}. Required six key groups in order: ${plan.action.steps.map((group, index) => `${index + 1}=[${group.join(' ') || 'release all keys'}]`).join(', ')}. Preserve this order exactly; do not add movement, clicks or other keys.` : options.guidance === 'combat' ? combatInstruction(id, current, options.groupTicks) : '';
      try { reply = await act(options, { game: id, image, system_prompt: prompt, task: scenario.task, reset: step === 1, instruction, ...(previousAction ? { previous_action: previousAction } : {}) }); }
      catch (error) { apiFailures++; append({ event: 'inference-error', step, error: error.message }); throw error; }
      countDecisions++;
      const validated = validateDecision(reply);
      const { executed: guarded, guard } = applyPlayModeGuard(id, options.guardPlayMode, validated);
      const decision = options.controller === 'hybrid' ? validateDecision({ text: actionHistory(plan.action), action: { ...plan.action, parsed: true, truncated: false } }) : guarded;
      if (decision.invalid && plan) throw new Error('Planner returned invalid action: ' + decision.invalid);
      const groupTicks = plan?.groupTicks ?? options.groupTicks;
      if (!Number.isInteger(groupTicks) || groupTicks < 1 || groupTicks > 60) throw new Error('Invalid action duration');
      const assistance = { controller: options.controller, applied: Boolean(plan), actionOverridden: options.controller === 'hybrid', changed: Boolean(plan && JSON.stringify(decision) !== JSON.stringify(guarded)), plannedAction: plan?.action ?? null, reason: plan?.reason ?? null, diagnostics: plan?.diagnostics ?? null };
      if (validated.invalid) invalid++;
      if (guard.removedKeyGroups) {
        modeGuard.modifiedDecisions++;
        modeGuard.removedKeyGroups += guard.removedKeyGroups;
      }
      const name = String(step).padStart(3, '0') + '-after.png';
      const imageBefore = step === 1 ? '000-bootstrap.png' : String(step - 1).padStart(3, '0') + '-after.png';
      append({ event: 'decision', step, image: imageBefore, wallInferenceMs: Math.round(performance.now() - started), response: reply, validated, guarded, executed: decision, guard, assistance, instruction, previousAction, groupTicks, simulatedActionSeconds: groupMs * groupTicks * 6 / 1000, inputBefore: input.state() });
      const mark = errors.length;
      await input.apply(decision, async () => {
        const clock = await ev(`(() => { let clock; for (let i=0;i<${groupTicks};i++) clock=window.__gamerQaClock.step(); return clock; })()`);
        if (!clock.queued) throw new Error('Game stopped queuing animation frames.');
      });
      inputs.push(decision);
      const telemetry = await ev(scenario.telemetry);
      current = telemetry;
      previousAction = actionHistory(decision);
      observations.push(telemetry);
      image = await capture(name);
      append({ event: 'observation', step, image: name, inputAfter: input.state(), telemetry, errors: errors.slice(mark) });
      process.stdout.write(`${id} ${step}/${options.steps} ${decision.invalid || JSON.stringify(decision.steps)} (${reply.latency_ms ?? '?'} ms)\n`);
      if (options.stopOnObjective && summarizeGameplay(id, initial, observations, inputs).objectiveMet) { stopReason = 'objective-met'; break; }
      if (id === 'fortress-blue' ? telemetry.phase === 'gameover' : telemetry.sim?.won || telemetry.sim?.failed) { stopReason = 'game-ended'; break; }
    }
    fs.writeFileSync(path.join(gameDir, 'final.png'), Buffer.from(image, 'base64'));
  } catch (error) {
    failure = error.message; stopReason = 'error';
    append({ event: 'failure', error: error.stack });
    await capture('failure.png').catch(e => append({ event: 'capture-error', error: e.message }));
  } finally {
    const before = input.state();
    await input.release();
    append({ event: 'cleanup-input', before, after: input.state(), telemetryAfterRelease: ev ? await ev(scenario.telemetry).catch(() => null) : null });
  }
  const result = { game: id, controller: options.controller, guidance: options.guidance, setupOnly: options.steps === 0, stopReason, countDecisions, invalid, apiFailures, candidateActions: inputs.length, modeGuard, ...summarizeGameplay(id, initial, observations, inputs), errors: errors.slice(initialErrors), ...(failure ? { failure } : {}) };
  writeJson(path.join(gameDir, 'summary.json'), result);
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log('Usage: node playhub_model_qa.mjs [--game all|fortress-blue|besiege] [--steps 0..600] [--besiege-start workshop|play] [--guard-play-mode true|false] [--controller model|guided|hybrid] [--guidance none|combat] [--group-ticks 1..60] [--stop-on-objective true|false] [--require-objective true|false] [--seed uint32] [--run-id name] [--model-url http://127.0.0.1:8765/act] [--timeout-ms 600000]'); return; }
  const target = json(path.join(directory, 'playhub-target.json'));
  const resultsDir = path.join(directory, 'TestResults');
  fs.mkdirSync(resultsDir, { recursive: true });
  const runDir = path.join(resultsDir, options.runId);
  fs.mkdirSync(runDir); // Prevent accidentally overwriting earlier run evidence.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gamer-playhub-qa-'));
  const errors = [], notices = [], results = [];
  let server, chrome, browser, failure;
  const manifest = { at: new Date().toISOString(), options, runDir, projectRoot: target.projectRoot, viewport: { width, height }, protocol: 'time-paused fixed 60 Hz game RAF; 6 groups × 33.333 ms × logged groupTicks; UI timers remain wall-clock; non-real-time', inputSource: options.steps === 0 ? 'setup only; no inference' : options.controller === 'hybrid' ? 'live model proposal plus telemetry-based planner; all executed actions are logged separately' : options.controller === 'guided' ? 'live model receives screenshot and physics-planner instruction; model action is executed without planner substitution' : 'live local HTTP model, screenshot and logged scenario instruction; optional explicit key guard', harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))), node: process.version };
  const recordError = (kind, message, url) => {
    const error = { at: new Date().toISOString(), kind, message, ...(url ? { url } : {}) };
    if (message.includes('404') && url && (url.endsWith('/favicon.ico') || /\/api\/saves\/(?:besiege|fortress-blue)\?slot=main$/.test(url))) {
      notices.push(error); return;
    }
    errors.push(error);
    fs.appendFileSync(path.join(runDir, 'browser-errors.jsonl'), JSON.stringify(error) + '\n');
  };
  fs.writeFileSync(path.join(runDir, 'browser-errors.jsonl'), '');
  try {
    if (options.steps > 0) manifest.modelHealth = await modelHealth(options.endpoint);
    const fixture = await makeFixture(temp, target.projectRoot, options.games);
    manifest.fingerprints = fixture.fingerprints;
    server = await startServer(temp, fixture);
    manifest.playHub = server.base;
    chrome = await startChrome(temp);
    manifest.chromePath = chrome.chromePath;
    browser = await connect(chrome.webSocketDebuggerUrl, options.seed, recordError);
    manifest.browser = await browser.send('Browser.getVersion');
    writeJson(path.join(runDir, 'run.json'), manifest);
    for (const id of options.games) {
      const result = await runGame({ id, options, browser, server, runDir, errors });
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } catch (error) { failure = error.stack; console.error(failure); }
  finally {
    browser?.close();
    try { await chrome?.close(); } catch (error) { recordError('chrome-cleanup', error.message); }
    try { await server?.close(); } catch (error) { recordError('server-cleanup', error.message); }
    try {
      const resolved = fs.realpathSync(temp);
      if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('gamer-playhub-qa-')) throw new Error('Refusing to remove unexpected temp path: ' + resolved);
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch (error) { recordError('temp-cleanup', error.message); }
    writeJson(path.join(runDir, 'summary.json'), { ...manifest, results, errors, expectedHttp404s: notices, ...(failure ? { failure } : {}) });
    console.log(`Artifacts: ${runDir}`);
    if (failure || errors.length || results.some(r => r.failure || (!r.setupOnly && (!r.meaningfulGameplay || (options.requireObjective && !r.objectiveMet))))) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
