import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const runtime = fs.readFileSync(new URL('../shared/locale.js', import.meta.url), 'utf8');
const locales = ['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];
const labels = ['시작', 'Start', '開始', '开始', 'Démarrer', 'Empezar', 'Iniciar', 'शुरू करें'];

test('eight offline locales update a sandboxed running game without reloading or changing state', { skip: !fs.existsSync(chromePath), timeout: 45000 }, async () => {
  const nonce = 'a'.repeat(32);
  const data = { '시작': Object.fromEntries(locales.map((l, i) => [l, labels[i]])), '점수 {0}': Object.fromEntries(locales.map(l => [l, l + ' {0}'])) };
  data['목재 40'] = Object.fromEntries(locales.map(l => [l, l + ' wood 40']));
  const frame = `<!doctype html><html><head><meta charset="utf-8"><script>${runtime}</script><script>PlayHubLocale.register(${JSON.stringify(data)});</script></head><body><button title="시작">시작</button><p id="score">점수 42</p><script>
    const instance=crypto.randomUUID(); let moves=7; let canvasText='';
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    function report(){parent.postMessage({type:'probe',instance,moves,lang:document.documentElement.lang,label:document.querySelector('button').textContent,title:document.querySelector('button').title,score:document.querySelector('#score').textContent,width:ctx.measureText('시작').width,expectedWidth:ctx.measureText(${JSON.stringify(labels)}[${JSON.stringify(locales)}.indexOf(PlayHubLocale.locale)]).width},'*');}
    addEventListener('message',e=>{if(e.data?.type==='probe-request')setTimeout(report,0);if(e.data?.type==='advance'){moves++;document.querySelector('#score').textContent='점수 43';}});
    setTimeout(report,0);
  </script></body></html>`;
  const home = `<!doctype html><script>window.reports=[];addEventListener('message',e=>{if(e.data?.type==='probe')reports.push(e.data);});</script><iframe sandbox="allow-scripts" src="/game?lang=en#nonce=${nonce}"></iframe>`;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); res.end(req.url.startsWith('/game') ? frame : home); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-locale-browser-'));
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let serial = 0; const pending = new Map();
    socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (pending.has(m.id)) { const [resolve, reject] = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, [resolve, reject]); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100 && !(await evaluate('window.reports?.length')); i++) await delay(50);
    const first = await evaluate('reports.at(-1)');
    assert.equal(first.lang, 'en'); assert.equal(first.label, 'Start');
    for (const [i, locale] of locales.entries()) {
      const report = await evaluate(`new Promise(resolve=>{const frame=document.querySelector('iframe');function got(e){if(e.data?.type==='probe'){removeEventListener('message',got);resolve(e.data);}}addEventListener('message',got);frame.contentWindow.postMessage({type:'playhub:locale',nonce:'${nonce}',locale:${JSON.stringify(locale)}},'*');frame.contentWindow.postMessage({type:'probe-request'},'*');})`);
      assert.equal(report.lang, locale); assert.equal(report.label, labels[i]); assert.equal(report.title, labels[i]);
      assert.equal(report.score, locale + ' 42'); assert.equal(report.instance, first.instance); assert.equal(report.moves, 7);
      assert.equal(report.width, report.expectedWidth);
    }
    await evaluate(`document.querySelector('iframe').contentWindow.postMessage({type:'playhub:locale',nonce:'wrong',locale:'en'},'*');document.querySelector('iframe').contentWindow.postMessage({type:'advance'},'*');document.querySelector('iframe').contentWindow.postMessage({type:'probe-request'},'*');`);
    await delay(100);
    const final = await evaluate('reports.at(-1)'); assert.equal(final.lang, 'hi'); assert.equal(final.score, 'hi 43'); assert.equal(final.moves, 8); assert.equal(final.instance, first.instance);
    // A top-level page accepts a regional locale alias without needing storage or a server.
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/game?lang=hi-IN` }); await delay(100);
    assert.equal(await evaluate('PlayHubLocale.locale'), 'hi');
    assert.equal(await evaluate("PlayHubLocale.translate('목재 257')"), 'hi wood 257');
    assert.equal(await evaluate("PlayHubLocale.translate('목재 player')"), '목재 player');
  } finally {
    socket?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => { chrome.once('exit', resolve); if (chrome.exitCode !== null || !chrome.kill()) resolve(); });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});
