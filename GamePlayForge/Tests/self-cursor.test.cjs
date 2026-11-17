'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('project participants see each other activity but not their own echo; guided cursors remain visible', { timeout: 90000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-self-cursor-'));
  const server = createServer({
    workspace: path.join(temporary, 'workspace'),
    platformWorkspace: path.join(temporary, 'platform'),
    buildDirectory: path.join(temporary, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const pages = [await context.newPage(), await context.newPage()];
  const errors = [];
  const editorStub = `<!doctype html><html><body style="margin:0"><canvas id="editor" tabindex="0" style="width:100%;height:100vh"></canvas><script>
    const canvas=document.getElementById('editor');canvas.width=1200;canvas.height=800;
    const send=(kind,extra)=>parent.postMessage({source:'playforge-godot-editor',type:'activity',kind,...extra},location.origin);
    canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();send('cursor',{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});});
    canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();send('step',{text:'click',x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});});
    canvas.addEventListener('keydown',e=>send('typing',{text:e.key,x:.5,y:.5}));
    const id=new URLSearchParams(location.search).get('project');fetch('/api/platform/projects/'+id).then(r=>r.json()).then(d=>parent.postMessage({source:'playforge-godot-editor',type:'pluginready',projectId:id,revision:d.revision},location.origin));
  </script></body></html>`;
  for (const page of pages) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') errors.push(`requestfailed ${request.url()}: ${failure}`);
    });
    await page.route(/\/OfficialGodot\/editor\.html(?:\?|$)/, route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: editorStub,
    }));
  }
  await pages[0].goto(origin + '/OfficialGodot/', { waitUntil: 'domcontentloaded' });
  await pages[0].locator('#workspace').waitFor({ state: 'visible' });
  await pages[0].frameLocator('#editor').locator('#editor').waitFor({ state: 'visible' });
  await pages[0].waitForFunction(() => document.querySelector('#editor')?.dataset.ready === 'true');
  const projectId = new URL(pages[0].url()).searchParams.get('project');
  assert.ok(projectId, 'first browser page should open the starter project');
  await pages[1].goto(`${origin}/OfficialGodot/?project=${encodeURIComponent(projectId)}`, { waitUntil: 'domcontentloaded' });
  await pages[1].locator('#workspace').waitFor({ state: 'visible' });
  await pages[1].frameLocator('#editor').locator('#editor').waitFor({ state: 'visible' });
  await pages[1].waitForFunction(() => document.querySelector('#editor')?.dataset.ready === 'true');
  const [alice, bob] = pages;
  const canvasA = alice.frameLocator('#editor').locator('#editor');
  const canvasB = bob.frameLocator('#editor').locator('#editor');

  await canvasA.hover({ position: { x: 320, y: 220 } });
  await canvasA.click({ position: { x: 320, y: 220 } });
  await bob.locator('.peer-cursor small', { hasText: '공동 작업자' }).waitFor({ state: 'visible' });
  await bob.locator('.peer-cursor.click').waitFor({ state: 'visible' });
  await alice.keyboard.type('A');
  await bob.locator('.peer-cursor em', { hasText: '⌨ A' }).waitFor({ state: 'visible' });
  await sleep(150);
  assert.equal(await alice.locator('.peer-cursor').count(), 0, 'Alice must not render her own SSE cursor echo');
  assert.equal(await bob.locator('.peer-cursor small').filter({ hasText: '공동 작업자' }).count(), 1, 'Bob should render Alice as a collaborator');

  await canvasB.hover({ position: { x: 520, y: 360 } });
  await canvasB.click({ position: { x: 520, y: 360 } });
  await alice.locator('.peer-cursor small', { hasText: '공동 작업자' }).waitFor({ state: 'visible' });
  await alice.locator('.peer-cursor.click').waitFor({ state: 'visible' });
  await bob.keyboard.type('B');
  await alice.locator('.peer-cursor em', { hasText: '⌨ B' }).waitFor({ state: 'visible' });
  await sleep(150);
  assert.equal(await bob.locator('.peer-cursor').count(), 1, 'Bob should keep Alice visible without adding his own SSE cursor echo');
  assert.equal(await alice.locator('.peer-cursor small').filter({ hasText: '공동 작업자' }).count(), 1, 'Alice should render Bob as a collaborator');

  await alice.evaluate(() => PlayForgeGuided.activity({ kind: 'typing', x: 0.45, y: 0.4, text: 'guide' }, true));
  for (const page of pages) {
    await page.locator('.peer-cursor small', { hasText: '템플릿 가이드' }).waitFor({ state: 'visible' });
    await page.locator('.peer-cursor em', { hasText: '⌨ guide' }).waitFor({ state: 'visible' });
  }
  assert.equal(await alice.locator('.peer-cursor small', { hasText: '템플릿 가이드' }).count(), 1, 'guided cursor should remain visible to its author');
  assert.equal(await bob.locator('.peer-cursor small', { hasText: '템플릿 가이드' }).count(), 1, 'guided cursor should be broadcast to the peer');
  assert.deepEqual(errors, [], 'both browser pages should remain free of JavaScript and request errors');
  await context.close();
});
