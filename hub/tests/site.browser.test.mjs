import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// These fixtures test browser behavior; real session/ownership boundaries have HTTP tests.
test('site navigation, filters, OAuth return, creator access and mobile layout', { skip: !fs.existsSync(chromePath), timeout: 60000 }, async () => {
  let registered = false;
  let hasProject = false, submission = null;
  const projectId = 'a'.repeat(24), releaseId = 'b'.repeat(24);
  const calls = [], exceptions = [];
  const games = [
    { id: 'touch-puzzle', title: 'Touch Puzzle', tags: ['puzzle'], controls: ['touch'], description: '터치 퍼즐', instructions: '화면을 터치하세요.', enabled: true },
    { id: 'keyboard-action', title: 'Keyboard Action', tags: ['action'], controls: ['keyboard'], description: '키보드 액션', instructions: '방향키로 이동하세요.', enabled: true },
  ];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/api/')) {
      let body;
      if (req.method !== 'GET') { const chunks = []; for await (const chunk of req) chunks.push(chunk); try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {} }
      calls.push({ path: url.pathname, method: req.method, url: url.href, body, csrf: req.headers['x-csrf-token'] });
      if (url.pathname === '/api/session') return json({ kind: registered ? 'registered' : 'guest', displayName: registered ? 'Test Creator' : null, csrfToken: 'browser-fixture', googleEnabled: true });
      if (url.pathname === '/api/games') return json({ games });
      if (url.pathname === '/api/wishlist') return json({ items: [{ gameId: 'touch-puzzle', available: true }], kind: registered ? 'registered' : 'guest' });
      if (url.pathname === '/api/preferences') return json({ locale: 'ko' });
      if (url.pathname === '/api/platform/projects') return json({ projects: hasProject ? [{ id: projectId, name: 'Owned Project', revision: 1 }] : [] });
      if (url.pathname === `/api/platform/projects/${projectId}/releases`) return json({ releases: [{ id: releaseId, label: 'Release One', revision: 1 }] });
      if (url.pathname.startsWith(`/api/platform/projects/${projectId}/`)) return json({ artifactType: url.pathname.includes('/deployments/') ? 'deployment-zip' : 'release-source', state: 'not-recorded', localRecorded: false, cloudVerified: false });
      if (url.pathname === '/api/creator/submissions') {
        if (req.method === 'POST') {
          submission = { ...body, id: 'a1234567-1234-4234-8234-123456789012', status: 'draft', revision: 1, releaseRevision: 1, releaseLabel: 'Release One', updatedAt: new Date().toISOString(), publicationStatus: 'unpublished', packageValidation: 'not_verified' };
          return json({ submission });
        }
        return json({ submissions: submission ? [submission] : [], hasMore: false });
      }
      if (url.pathname === '/api/creator/submissions/' + submission?.id + '/submit') { submission = { ...submission, status: 'in_review', revision: 2 }; return json({ submission }); }
      if (url.pathname === '/api/auth/google/start') {
        const back = new URL(url.searchParams.get('returnTo')); back.searchParams.set('authError', 'GOOGLE_CANCELLED');
        res.writeHead(302, { Location: back.href }); return res.end();
      }
      if (url.pathname === '/api/me/history') return json({ games: [], history: [] });
      if (url.pathname.endsWith('/community')) return json({ items: [], total: 0 });
      return json({ accepted: [], items: [], history: [], games: [] });
    }
    if (url.pathname === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.PLAYHUB_CONFIG={apiBaseUrl:location.origin};'); }
    if (url.pathname === '/catalog/games.json') return json({ schemaVersion: 1, entries: games.map(g => ({ id: g.id, path: 'games/' + g.id, enabled: true })) });
    const manifest = games.find(g => url.pathname === '/games/' + g.id + '/game.manifest.json');
    if (manifest) return json({ ...manifest, entry: 'index.html', summary: { ko: manifest.description }, media: { cover: 'assets/cover.svg' }, save: { schemaVersion: 1 } });
    if (url.pathname.endsWith('/cover.svg')) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160"><rect width="300" height="160" fill="#315347"/></svg>'); }
    const filename = path.join(root, 'web/user', url.pathname === '/' || url.pathname.startsWith('/play/') ? 'index.html' : url.pathname.slice(1));
    if (!filename.startsWith(path.join(root, 'web/user') + path.sep) || !fs.existsSync(filename)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(filename)] || 'text/plain' });
    res.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-site-browser-'));
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i++) {
      try {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0 && value <= 65535) { port = value; break; }
      } catch (error) {
        if (!['ENOENT', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      }
      await delay(100);
    }
    assert.ok(port, 'Chrome did not publish a readable debugging port within 10 seconds');
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let serial = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
      if (pending.has(m.id)) { const [resolve, reject] = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, [resolve, reject]); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
    const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } throw new Error('Browser condition timed out: ' + expression); };
    const navigate = async route => { await send('Page.navigate', { url: base + route }); await until("document.readyState==='complete' && document.querySelector('#identity')?.textContent.length>0"); };
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('/?view=browse');
    await until("!!document.querySelector('#browse-filters')");
    assert.equal(await evaluate("document.querySelectorAll('.game-card').length"), 2);
    assert.equal(await evaluate("!!document.querySelector('#browse-filters button[type=submit]')"), false, 'browse filters should apply immediately without a submit button');
    await evaluate("document.querySelector('[data-genre-filter=\"action\"]').click()");
    await until("document.querySelectorAll('.game-card').length===1");
    assert.match(await evaluate("document.querySelector('.game-card').textContent"), /Keyboard Action/);
    await evaluate("document.querySelector('[data-genre-filter=\"all\"]').click()");
    await until("document.querySelectorAll('.game-card').length===2");
    await evaluate("const control=document.querySelector('#browse-filters [name=control]'); control.value='touch'; control.dispatchEvent(new Event('change', { bubbles: true }));");
    await until("document.querySelectorAll('.game-card').length===1");
    assert.match(await evaluate("document.querySelector('.game-card').textContent"), /Touch Puzzle/);
    await navigate('/?view=wishlist');
    await until("document.querySelector('#app').textContent.includes('Touch Puzzle')");
    await navigate('/?view=create');
    await until("!!document.querySelector('[data-google-login]')");
    assert.equal(calls.some(call => call.path === '/api/platform/projects'), false, 'guest must not request private projects');
    await navigate('/play/keyboard-action/?lang=ko#controls');
    await until("document.querySelector('#app').textContent.includes('Keyboard Action')");
    await evaluate("document.querySelector('#google-login').click()");
    await until("location.pathname==='/play/keyboard-action/' && !!document.querySelector('#app') && document.querySelector('#app').textContent.includes('Keyboard Action')");
    for (let i = 0; i < 100 && !calls.some(c => c.path === '/api/auth/google/start'); i++) await delay(50);
    const login = calls.find(c => c.path === '/api/auth/google/start');
    assert.ok(login, 'Google login button starts the authorization flow');
    const returnTo = new URL(new URL(login.url).searchParams.get('returnTo'));
    assert.equal(returnTo.pathname, '/play/keyboard-action/'); assert.equal(returnTo.hash, '#controls'); assert.equal(returnTo.searchParams.get('lang'), 'ko');
    await until("document.querySelector('#account-notice')?.textContent.includes('취소했습니다') && !location.search.includes('authError')");
    registered = true;
    await navigate('/?view=create');
    await until("!!document.querySelector('#creator') && document.querySelector('#identity').textContent==='Test Creator'");
    for (let i = 0; i < 100 && !calls.some(c => c.path === '/api/creator/submissions'); i++) await delay(50);
    assert.ok(calls.some(c => c.path === '/api/platform/projects'));
    assert.ok(calls.some(c => c.path === '/api/creator/submissions'));
    assert.ok(!await evaluate("!!document.querySelector('[data-submit-review]:not(:disabled)')"), 'empty account cannot submit an unowned release');
    hasProject = true;
    await evaluate("document.querySelector('[data-refresh-projects]').click()");
    await until("document.querySelector('[name=projectId]').options.length===2");
    await evaluate(`document.querySelector('[name=projectId]').value='${projectId}'; document.querySelector('[name=projectId]').dispatchEvent(new Event('change'))`);
    await until("document.querySelector('[name=releaseId]').options.length===2");
    await evaluate(`document.querySelector('[name=releaseId]').value='${releaseId}'; document.querySelector('[name=releaseId]').dispatchEvent(new Event('change')); document.querySelector('#submission-form [name=title]').value='My Game'; document.querySelector('#submission-form [name=description]').value='A test release'; document.querySelector('#submission-form').requestSubmit()`);
    await until("!!document.querySelector('[data-submit-review]')");
    const draft = calls.find(c => c.path === '/api/creator/submissions' && c.method === 'POST');
    assert.deepEqual(draft.body, { projectId, releaseId, title: 'My Game', description: 'A test release' });
    assert.equal(draft.csrf, 'browser-fixture');
    await evaluate("document.querySelector('[data-submit-review]').click()");
    await until("document.querySelector('#creator-submissions').textContent.includes('심사 중') && !document.querySelector('[data-submit-review]')");
    const review = calls.find(c => c.path.endsWith('/submit') && c.method === 'POST');
    assert.deepEqual(review.body, { revision: 1 });
    assert.match(await evaluate("document.querySelector('#creator-submissions').textContent"), /미공개/);
    const reports = path.join(root, 'reports'); fs.mkdirSync(reports, { recursive: true });
    fs.writeFileSync(path.join(reports, 'local-site-desktop.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate('/?view=browse'); await until("!!document.querySelector('#browse-filters')");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile page should fit the viewport');
    fs.writeFileSync(path.join(reports, 'local-site-mobile.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => { chrome.once('exit', resolve); if (chrome.exitCode !== null || !chrome.kill()) resolve(); });
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  }
});
