'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const realEditor = process.env.PLAYFORGE_REAL_EDITOR === '1';

test(`guided walkthrough persists the prepared template and supports speed, pause, resume, and collaboration overlay (${realEditor ? 'real Godot editor' : 'iframe stub'})`, { timeout: realEditor ? 240000 : 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-guided-'));
  const server = createServer({
    workspace: path.join(temporary, 'workspace'),
    platformWorkspace: path.join(temporary, 'platform'),
    buildDirectory: path.join(temporary, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, ...(realEditor ? { args: ['--enable-unsafe-swiftshader'] } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const pageErrors = [];
    const routeHits = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') pageErrors.push(`requestfailed ${request.url()}: ${failure}`);
    });
    await page.addInitScript(() => {
      window.prompt = () => 'Guided Example';
      window.addEventListener('message', event => {
        if (event.data?.source === 'playforge-godot-editor' && event.data.type === 'pluginready') window.__playforgePluginReady = event.data;
      });
    });
    if (!realEditor) await page.route(/\/OfficialGodot\/editor\.html(?:\?|$)/, route => { routeHits.push(route.request().url()); return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: `<!doctype html><html><body style="margin:0"><canvas id="editor" tabindex="0" style="width:100%;height:100vh"></canvas><script>
        const canvas=document.getElementById('editor');canvas.width=1200;canvas.height=800;
        const send=(kind,extra)=>parent.postMessage({source:'playforge-godot-editor',type:'activity',kind,...extra},location.origin);
        canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();send('cursor',{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});});
        canvas.addEventListener('keydown',e=>send('typing',{text:e.key,x:.5,y:.5}));
        const id=new URLSearchParams(location.search).get('project');fetch('/api/platform/projects/'+id).then(r=>r.json()).then(d=>parent.postMessage({source:'playforge-godot-editor',type:'pluginready',projectId:id,revision:d.revision},location.origin));
      </script></body></html>`,
    }); });

    await page.goto(origin + '/OfficialGodot/', { waitUntil: 'domcontentloaded' });
    await page.locator('#workspace').waitFor({ state: 'visible' });
    let listing = await fetch(origin + '/api/platform/projects').then(response => response.json());
    assert.equal(listing.projects.length, 1, 'empty library should create its starter project');
    assert.equal(listing.projects[0].template, 'blank3d');

    await page.locator('#home').click();
    await page.getByRole('button', { name: /3D Playground/ }).click();
    await page.locator('.start-dialog').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '완성된 템플릿 열기' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '만드는 과정 보기' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '만드는 과정 보기' }).click();
    await page.locator('#guideStep').waitFor({ state: 'visible' });
    await page.locator('#guideSpeed').selectOption('4');
    const editorCanvasSelector = realEditor ? '#editor-canvas' : '#editor';
    try { await page.frameLocator('#editor').locator(editorCanvasSelector).waitFor({ state: 'visible', timeout: realEditor ? 190000 : 5000 }); }
    catch (error) { throw new Error(`${error.message}\nframes=${JSON.stringify(page.frames().map(frame => frame.url()))}\nroutes=${JSON.stringify(routeHits)}\nerrors=${JSON.stringify(pageErrors)}`); }
    if (realEditor) {
      await page.waitForFunction(() => document.querySelector('#editor')?.dataset.ready === 'true', null, { timeout: 190000 });
      const ready = await page.evaluate(() => window.__playforgePluginReady);
      assert.equal(ready?.projectId, new URL(page.url()).searchParams.get('project'), 'real plugin must report readiness for the selected project');
    }

    const editorCanvas = page.frameLocator('#editor').locator(editorCanvasSelector);
    await editorCanvas.hover({ position: { x: 420, y: 260 } });
    await editorCanvas.click();
    await page.keyboard.type('K');
    await page.locator('.peer-cursor small', { hasText: '공동 작업자' }).waitFor({ state: 'visible' });
    await page.locator('.peer-cursor em', { hasText: '⌨ K' }).waitFor({ state: 'visible' });
    const mode = realEditor ? 'real' : 'stub';
    const artifactDirectory = path.join(root, 'Saved', 'Tests', 'platform');
    const typingScreenshot = path.join(artifactDirectory, `guided-${mode}-typing.png`);
    const completedScreenshot = path.join(artifactDirectory, `guided-${mode}-completed.png`);
    const resultFile = path.join(artifactDirectory, `guided-${mode}.json`);
    fs.mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({ path: typingScreenshot, fullPage: false });

    const projectId = new URL(page.url()).searchParams.get('project');
    assert.ok(projectId, 'guided project should be selected in the platform UI');
    const getProject = async () => fetch(`${origin}/api/platform/projects/${projectId}`).then(response => response.json());
    let snapshot;
    const firstSaveDeadline = Date.now() + 10000;
    do {
      snapshot = await getProject();
      if (snapshot.revision >= 2) break;
      await sleep(40);
    } while (Date.now() < firstSaveDeadline);
    assert.ok(snapshot.revision >= 2, 'guided steps should save actual files as they are written');

    await page.locator('#guidePause').click();
    await page.getByRole('button', { name: '계속' }).waitFor({ state: 'visible' });
    const pausedRevision = (await getProject()).revision;
    await sleep(500);
    assert.equal((await getProject()).revision, pausedRevision, 'revision should stop changing while paused');

    await page.getByRole('button', { name: '계속' }).click();
    try {
      await page.waitForFunction(() => document.getElementById('guideStep')?.textContent.includes('완료'), null, { timeout: realEditor ? 60000 : 30000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        step: document.getElementById('guideStep')?.textContent,
        speed: document.getElementById('guideSpeed')?.value,
        pause: document.getElementById('guidePause')?.textContent,
        status: document.getElementById('status')?.textContent,
        editorReady: document.getElementById('editor')?.dataset.ready,
      }));
      throw new Error(`${error.message}\nGuided diagnostics: ${JSON.stringify(diagnostics)}\nFinal snapshot: ${JSON.stringify(await getProject())}`);
    }
    const [finalProject, prepared] = await Promise.all([
      getProject(),
      fetch(`${origin}/api/platform/templates/playground3d`).then(response => response.json()),
    ]);
    const sortFiles = files => files.map(({ path: filePath, content }) => ({ path: filePath, content })).sort((a, b) => a.path.localeCompare(b.path));
    const finalFiles = sortFiles(finalProject.files);
    const preparedFiles = sortFiles(prepared.files);
    const finalConfigFile = finalFiles.find(file => file.path === 'project.godot');
    const preparedConfigFile = preparedFiles.find(file => file.path === 'project.godot');
    assert.deepEqual(finalFiles.filter(file => file.path !== 'project.godot'), preparedFiles.filter(file => file.path !== 'project.godot'), 'guided scenes and scripts must match the prepared template exactly');
    assert.ok(finalConfigFile && preparedConfigFile);
    // Godot's Web editor may serialize one extra trailing blank line; permit that formatting-only delta, and nothing else.
    assert.ok(finalConfigFile.content === preparedConfigFile.content || finalConfigFile.content === preparedConfigFile.content + '\n',
      `project.godot differs beyond a single trailing blank line: ${JSON.stringify(finalConfigFile.content.slice(-80))}`);
    const projectConfig = finalConfigFile.content;
    assert.match(projectConfig, /config\/name="3D Playground"/, 'the final project setting should use the prepared template name');
    assert.ok(fs.statSync(typingScreenshot).size > 10000, 'guided cursor and typing overlay screenshot should be captured');
    let settledRevision = finalProject.revision;
    if (realEditor) {
      const completedRevision = finalProject.revision;
      await sleep(5000);
      const settledProject = await getProject();
      assert.equal(settledProject.revision, completedRevision, 'the real editor sync revision should remain stable for 5 seconds after guided completion');
      settledRevision = settledProject.revision;
      console.log(`Real Godot guided revision: completed=${completedRevision}, settled=${settledProject.revision}`);
    }
    await page.screenshot({ path: completedScreenshot, fullPage: false });
    fs.writeFileSync(resultFile, JSON.stringify({
      mode,
      passed: true,
      engine: realEditor ? 'Godot Web 4.7.2' : 'iframe stub',
      projectId,
      completedRevision: finalProject.revision,
      settledRevision,
      projectConfigMatchesTemplate: finalConfigFile.content === preparedConfigFile.content,
      projectConfigTrailingBlankLineOnly: finalConfigFile.content === preparedConfigFile.content + '\n',
      screenshots: { typing: path.basename(typingScreenshot), completed: path.basename(completedScreenshot) },
    }, null, 2) + '\n');
    assert.deepEqual(pageErrors, [], 'the guided browser flow should not report JavaScript errors');
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => { if (!server.listening) return resolve(); server.once('close', resolve); server.shutdown(); });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
