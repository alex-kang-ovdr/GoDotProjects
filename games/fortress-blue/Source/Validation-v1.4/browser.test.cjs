'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../../../..');
const web = path.resolve(__dirname, '../../Web');
const { chromium } = require(path.join(root, 'forge/node_modules/playwright'));
const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const locales = {
  ko: ['전투 시작', 'BLUE SQUAD', '바위탄'],
  en: ['Start battle', 'Blue team', 'Boulder'],
  ja: ['戦闘開始', '青チーム', '岩弾'],
  'zh-CN': ['开始战斗', '蓝队', '石弹'],
  fr: ['Lancer le combat', 'Équipe bleue', 'Rocher'],
  es: ['Iniciar combate', 'Equipo azul', 'Roca'],
  'pt-BR': ['Iniciar batalha', 'Equipe azul', 'Rocha'],
  hi: ['युद्ध शुरू करें', 'नीली टीम', 'पत्थर का गोला']
};

async function sandboxServer(t) {
  const nonce = 'a'.repeat(32);
  const server = http.createServer((req, res) => {
    const target = new URL(req.url, 'http://localhost');
    if (target.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<iframe title="Fortress War" sandbox="allow-scripts" src="/game/index.html?lang=en#nonce=${nonce}" style="width:1200px;height:780px"></iframe>`);
    }
    if (!target.pathname.startsWith('/game/')) return res.writeHead(404).end();
    const file = path.resolve(web, target.pathname.slice('/game/'.length));
    if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}/`, nonce };
}

test('Fortress War supports eight languages in a Hub-style sandbox without resetting the match', { timeout: 40_000 }, async t => {
  const { url, nonce } = await sandboxServer(t);
  const browser = await chromium.launch({ executablePath: chromePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.frameLocator('iframe').locator('#start-button').waitFor();
  const game = page.frames()[1];
  await game.waitForFunction(() => window.FortApp?.version === '1.4.0');
  assert.equal(await game.title(), 'Fortress War');
  assert.equal(await game.locator('#fortress-language').isVisible(), false);
  assert.equal(await game.locator('#offline-download').isVisible(), false);
  const sendLocale = locale => page.locator('iframe').evaluate((frame, data) => {
    frame.contentWindow.postMessage({ type: 'playhub:locale', ...data }, '*');
  }, { locale, nonce });

  for (const [locale, [start]] of Object.entries(locales)) {
    await sendLocale(locale);
    await game.waitForFunction(([lang, button]) => document.documentElement.lang === lang
      && document.querySelector('#start-button span').textContent === button, [locale, start]);
  }
  await sendLocale('en');
  await game.locator('#start-button').click();
  await game.waitForFunction(() => document.querySelector('#phase-label').textContent.includes('Catapult’s turn'));
  const originalMap = await game.evaluate(() => FortApp.getState().terrain.mapId);
  const angle = await game.evaluate(() => FortApp.getState().tanks[0].angle);
  await page.keyboard.down('ArrowUp');
  await game.waitForFunction(previous => FortApp.getState().tanks[0].angle > previous, angle);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space');
  await game.waitForFunction(() => document.querySelector('#fire-button').classList.contains('charging'));
  await page.keyboard.up('Space');
  await game.waitForFunction(() => FortApp.getState().stats.shots === 1);
  assert.equal(await game.evaluate(() => FortApp.getState().terrain.mapId), originalMap);
  await game.locator('#pause-button').click();
  assert.equal(await game.evaluate(() => FortApp.getState().paused), true);
  const paused = await game.evaluate(() => FortApp.getState());

  for (const [locale, [, team, weapon]] of Object.entries(locales)) {
    await sendLocale(locale);
    await game.waitForFunction(([lang, expectedTeam, expectedWeapon]) => document.documentElement.lang === lang
      && document.querySelector('#active-team').textContent === expectedTeam
      && document.querySelector('#weapon-bar button b').textContent === expectedWeapon, [locale, team, weapon]);
    assert.deepEqual(await game.evaluate(() => FortApp.getState()), paused);
  }
  assert.deepEqual(errors, []);
});

test('standalone file reads existing preferences and history and switches languages on a small screen', { timeout: 30_000 }, async t => {
  const browser = await chromium.launch({ executablePath: chromePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = pathToFileURL(path.join(web, 'index.html')).href;
  await page.goto(url);
  await page.waitForFunction(() => !!window.FortApp);
  await page.evaluate(() => {
    localStorage.setItem('fortress-blue-prefs-v1', JSON.stringify({ profile: 'classic', playerTank: 'cannon', map: 'foundry' }));
    localStorage.setItem('fortress-blue-history-v1', JSON.stringify([{ date: '2026-11-18T12:00:00Z', profile: 'classic', tank: 'cannon', map: 'foundry', winner: 0, damage: 123, turns: 4 }]));
  });
  await page.reload();
  await page.waitForFunction(() => FortApp.getPreferences().map === 'foundry');
  await page.locator('#fortress-language').selectOption('fr');
  await page.waitForFunction(() => document.querySelector('#picked-name').textContent === 'Canon');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#start-button').click();
  assert.equal(await page.evaluate(() => FortApp.getState().terrain.mapId), 'foundry');
  await page.locator('#data-button').click();
  await page.locator('[data-tab="history"]').click();
  await page.waitForFunction(() => document.querySelector('.history-card')?.textContent.includes('Victoire bleue'));
  assert.match(await page.locator('.history-card').textContent(), /123/u);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fortress-blue-history-v1')).length), 1);
  assert.deepEqual(errors, []);
});
