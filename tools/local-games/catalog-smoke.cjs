'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createApp, inventory, listen } = require('./server.cjs');

const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'forge/node_modules/@playwright/test'));
const frameHost = 'http://127.0.0.1';
const viewport = { width: 1280, height: 900 };
const sampleScreenshots = new Set(['hades', 'brick-breaker', 'project-idol']);
const actions = {
  besiege: ['#campaign-btn'],
  'brawl-stars': ['#startBtn'],
  'clash-of-clans': ['#collect'],
  'clash-royale': ['#developer-start'],
  cosmoteer: ['#launch-button'],
  'dark-and-darker': ['#start'],
  'diablo-2': ['#offlineNew'],
  'dont-starve': ['#action'],
  'duck-extraction': ['#start'],
  'dungeons-and-dragons': ['#pause'],
  'first-queen-iv': ['#trainingBtn'],
  'fortress-blue': ['#start-button'],
  ftl: ['#launch-btn'],
  hades: [/탈출 시도 시작/, /지하의 검/],
  'harbor-run': ['#startMission'],
  'into-the-breach': [/^새 작전$/],
  'kerbal-space-program': ['#assistAscent'],
  'kingdom-rush': [/전투 시작/],
  'league-of-legends': [/기동 마법사 아리/],
  'oxygen-not-included': ['#help-button'],
  'princess-maker-2': [/일정/],
  rimworld: ['#zoom-in'],
  'samgukji-11': [/깃발을 올리다/],
  'settlers-7': ['#startGame'],
  'survivor-io': ['#start'],
  'this-war-of-mine': [/첫 아침 시작하기/],
  'world-of-tanks': ['#start-button'],
  'world-of-warships': ['#trainingButton']
};

function record(list, item) {
  if (list.length < 25 && !list.some(entry => JSON.stringify(entry) === JSON.stringify(item))) list.push(item);
}

function requestUrl(raw) {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : url.protocol;
  } catch {
    return String(raw || '').slice(0, 180);
  }
}

async function surface(frame) {
  return frame.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const canvases = [...document.querySelectorAll('canvas')].slice(0, 25).map(canvas => {
      const rect = canvas.getBoundingClientRect();
      return { id: canvas.id || null, width: canvas.width, height: canvas.height,
        clientWidth: Math.round(rect.width), clientHeight: Math.round(rect.height), visible: visible(canvas) };
    });
    const controls = [...document.querySelectorAll('button, input, select, [role="button"], a[href]')]
      .filter(visible).slice(0, 30).map(control => ({
        id: control.id || null,
        label: (control.getAttribute('aria-label') || control.innerText || control.getAttribute('title') || '').trim().slice(0, 120),
        disabled: control.disabled === true || control.getAttribute('aria-disabled') === 'true'
      }));
    return {
      title: document.title,
      text: (document.body?.innerText || '').trim().slice(0, 240),
      booting: Boolean(document.querySelector('.boot-message')),
      controls,
      canvases
    };
  });
}

async function tryControls(frame, row, entry) {
  const candidates = actions[row.id] || (row.integration === 'native-sdk' ? ['#primary'] : []);
  for (const candidate of candidates) {
    const locator = typeof candidate === 'string'
      ? frame.locator(candidate).filter({ visible: true }).first()
      : frame.getByRole('button', { name: candidate }).filter({ visible: true }).first();
    const attempt = { candidate: String(candidate), action: 'not-visible' };
    entry.inputs.push(attempt);
    if (!(await locator.count())) continue;
    attempt.label = (await locator.innerText()).trim().slice(0, 120);
    if (!(await locator.isEnabled())) {
      attempt.action = 'disabled';
      continue;
    }
    try {
      await locator.click({ timeout: 4000 });
      attempt.action = 'clicked';
    } catch (error) {
      attempt.action = 'click-failed';
      attempt.error = error.message.slice(0, 400);
    }
  }
}

async function verifyProjectIdol(frame, entry) {
  const click = async (locator, label) => {
    await locator.click({ timeout: 4000 });
    entry.inputs.push({ candidate: label, action: 'clicked' });
  };
  const saveState = () => frame.evaluate(() => JSON.parse(localStorage.getItem('idol_save_v1')));
  await frame.getByRole('heading', { name: '이번 달 운영', exact: true }).waitFor({ timeout: 4000 });
  // Choose the first eligible scripted event without relying on the random roll.
  await frame.evaluate(() => { Math.random = () => 0; });
  await click(frame.getByRole('button', { name: /다음 달 진행/ }), '다음 달 진행');
  const pending = await saveState();
  assert.equal(pending.month, 2);
  assert.equal(pending.pending, 'evt_001');
  const storyTab = frame.getByRole('button', { name: '스토리', exact: true });
  await click(storyTab, '스토리');
  await frame.getByRole('heading', { name: /이벤트 · 첫 평가 1/ }).waitFor({ timeout: 4000 });
  await click(frame.locator('.choices button').first(), '이벤트 첫 번째 선택');
  await click(frame.getByRole('button', { name: '저장', exact: true }), '저장');
  const saved = await saveState();
  assert.equal(saved.pending, null);
  assert.ok(saved.eventsSeen.includes('evt_001'));
  assert.ok(saved.flags.includes('training_1_0'));
  await frame.goto(frame.url(), { waitUntil: 'load', timeout: 6000 });
  await click(storyTab, '재로딩 후 스토리');
  await frame.getByText('첫 평가 1', { exact: true }).waitFor({ timeout: 4000 });
  assert.deepEqual(await saveState(), saved);
  entry.storyChoicePersisted = true;
}

async function testGame(context, base, directory, row) {
  const started = Date.now();
  const entry = { id: row.id, integration: row.integration, port: row.port, status: 'pending', inputs: [],
    pageErrors: [], consoleErrors: [], responseErrors: [], requestFailures: [], blockedRequests: [], csp: [], problems: [] };
  if (row.blocked) {
    entry.status = 'blocked';
    entry.problems.push(row.blocked);
    return entry;
  }
  const page = await context.newPage();
  const origin = frameHost + ':' + row.port;
  await page.route('**/*', route => {
    const raw = route.request().url();
    const target = new URL(raw);
    if (target.origin === base || target.origin === origin) return route.continue();
    record(entry.blockedRequests, { url: requestUrl(raw), resource: route.request().resourceType() });
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    window.__localCatalogCsp = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (window.__localCatalogCsp.length < 25) {
        window.__localCatalogCsp.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      }
    });
  });
  page.on('pageerror', error => record(entry.pageErrors, {
    message: error.message.slice(0, 400),
    stack: error.stack?.split('\n').slice(0, 5).join('\n').slice(0, 1000)
  }));
  page.on('console', message => {
    if (message.type() === 'error') record(entry.consoleErrors, {
      text: message.text().slice(0, 600),
      url: requestUrl(message.location().url),
      line: message.location().lineNumber + 1
    });
  });
  page.on('response', response => {
    if (response.status() >= 400) record(entry.responseErrors, { status: response.status(), url: requestUrl(response.url()),
      resource: response.request().resourceType() });
  });
  page.on('requestfailed', request => {
    const error = request.failure()?.errorText || 'unknown';
    if (error !== 'net::ERR_ABORTED') record(entry.requestFailures, { url: requestUrl(request.url()), error });
  });
  try {
    const response = await page.goto(base + '/play/' + row.id + '?mode=local', { waitUntil: 'load', timeout: 12000 });
    entry.statusCode = response?.status() || null;
    if (entry.statusCode !== 200) throw new Error((await page.locator('body').innerText()).trim().slice(0, 240));
    const frame = page.frames().find(candidate => candidate.url().startsWith(origin + '/'));
    if (!frame) throw new Error('Game frame did not navigate to its fixed origin');
    entry.frame = requestUrl(frame.url());
    const runtime = page.locator('#runtime-status');
    if (row.integration === 'native-sdk') {
      await page.locator('#runtime-status:is([data-state="ready"],[data-state="saved"])').waitFor({ timeout: 12500 });
    }
    await frame.waitForFunction(() => !document.querySelector('.boot-message') && Boolean(document.body?.childElementCount),
      null, { timeout: 6500 }).catch(() => {});
    entry.initial = await surface(frame);
    if (row.id === 'project-idol') await verifyProjectIdol(frame, entry);
    else await tryControls(frame, row, entry);
    // Allow a few animation turns and initial transient fetches to settle after input.
    await new Promise(resolve => setTimeout(resolve, 400));
    entry.final = await surface(frame);
    if (row.integration === 'native-sdk') {
      entry.sdkStatus = await runtime.getAttribute('data-state');
      if (!['ready', 'saved'].includes(entry.sdkStatus)) entry.problems.push('SDK host is no longer ready');
    }
    entry.csp = (await frame.evaluate(() => window.__localCatalogCsp || []))
      .map(item => ({ directive: item.directive, blocked: requestUrl(item.blocked) }));
    if (entry.final.booting) entry.problems.push('SDK boot marker remained visible');
    if (!entry.final.text && !entry.final.canvases.some(canvas => canvas.visible) && !entry.final.controls.length) {
      entry.problems.push('No text, visible canvas or controls in the game frame');
    }
    const visibleCanvases = entry.final.canvases.filter(canvas => canvas.visible);
    if (visibleCanvases.some(canvas => canvas.width < 1 || canvas.height < 1)) entry.problems.push('Zero-size visible canvas backing buffer');
    if (entry.inputs.some(input => input.action === 'click-failed')) entry.problems.push('Expected game control did not accept input');
    if (!entry.inputs.some(input => input.action === 'clicked')) entry.problems.push('No expected game control accepted input');
  } catch (error) {
    entry.problems.push(error.message.slice(0, 600));
  }
  const errors = ['pageErrors', 'consoleErrors', 'responseErrors', 'requestFailures', 'blockedRequests', 'csp', 'problems'];
  entry.status = errors.some(key => entry[key].length) ? 'findings' : 'loaded';
  entry.durationMs = Date.now() - started;
  if (entry.status === 'findings' || sampleScreenshots.has(row.id)) {
    try {
      const filename = row.id + '.png';
      await page.screenshot({ path: path.join(directory, filename), timeout: 4000 });
      entry.screenshot = filename;
    } catch (error) {
      entry.screenshotError = error.message.slice(0, 300);
    }
  }
  await page.close();
  return entry;
}

async function main() {
  const filters = process.argv.slice(2);
  const data = inventory(root);
  const games = data.rows.filter(row => !row.pending);
  const select = filters.filter(arg => !arg.startsWith('--'));
  if (filters.some(arg => arg.startsWith('--') && !['--legacy', '--native'].includes(arg)) ||
      (filters.includes('--legacy') && filters.includes('--native')) || select.some(id => !games.some(game => game.id === id))) {
    throw new Error('Usage: node tools/local-games/catalog-smoke.cjs [--legacy | --native] [game-id ...]');
  }
  const rows = games.filter(row => (!select.length || select.includes(row.id)) &&
    (!filters.includes('--legacy') || row.integration === 'legacy-localstorage') &&
    (!filters.includes('--native') || row.integration === 'native-sdk'));
  if (!rows.length) throw new Error('No matching games in the current inventory');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(root, 'hub/reports', 'local-runtime-' + stamp);
  fs.mkdirSync(directory, { recursive: true });
  const app = createApp(root, { port: 0, env: {} });
  let browser;
  const results = [];
  try {
    await listen(app.server, 0);
    const base = frameHost + ':' + app.server.address().port;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport, locale: 'ko-KR', serviceWorkers: 'block' });
    for (const row of rows) {
      const result = await testGame(context, base, directory, row);
      results.push(result);
      console.log(result.id + ' ' + result.status + (result.problems.length ? ' ' + result.problems[0] : ''));
    }
  } finally {
    await browser?.close();
    await app.close();
    const summary = {
      loaded: results.filter(result => result.status === 'loaded').length,
      findings: results.filter(result => result.status === 'findings').length,
      blocked: results.filter(result => result.status === 'blocked').length,
      checked: results.length,
      notChecked: games.length - results.length,
      excludedPending: (data.unavailable || data.rows.filter(row => row.pending)).map(row => row.id)
    };
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({
      scope: 'Initial local browser surface, requests, runtime errors and selected start controls',
      viewport, summary, inventoryWarnings: data.warnings, results
    }, null, 2) + '\n');
    console.log(JSON.stringify({ ...summary, report: path.join(directory, 'report.json') }));
    if (summary.findings || summary.blocked) process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
