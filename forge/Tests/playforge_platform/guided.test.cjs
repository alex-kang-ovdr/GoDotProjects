'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { createServer } = require('../../server.cjs');

const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const realEditor = process.env.PLAYFORGE_REAL_EDITOR === '1';
const templateId = process.env.PLAYFORGE_GUIDE_TEMPLATE || 'playground3d';
const templateNames = { playground3d: '3D Playground', 'iron-wood': 'Iron Wood', brawllabs: 'BrawlLabs' };
const templateName = templateNames[templateId];
if (templateId === 'tappy-chicken') throw new Error('Run npm run test:template-showcase for Tappy Chicken.');
if (!templateName) throw new Error(`Unsupported PLAYFORGE_GUIDE_TEMPLATE: ${templateId}`);

test(`guided walkthrough persists the prepared template and supports speed, pause, resume, and collaboration overlay (${realEditor ? 'real Godot editor' : 'iframe stub'})`, { timeout: realEditor ? 360000 : 90000 }, async () => {
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
    const activityPosts = [];
    const guideSaves = [];
    const engineErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (/SCRIPT ERROR|Parse Error|Invalid access|Invalid call/.test(message.text())) engineErrors.push(message.text());
    });
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/platform\/projects\/[^/]+\/activity$/.test(new URL(request.url()).pathname)) {
        try { activityPosts.push(JSON.parse(request.postData() || '{}')); } catch {}
      }
      if (request.method() === 'PUT' && /\/api\/platform\/projects\/[^/]+$/.test(new URL(request.url()).pathname)) {
        const body = request.postDataJSON();
        if (body.clientId?.endsWith('-guide')) guideSaves.push(body);
      }
    });
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
        window.addEventListener('message',event=>{
          const data=event.data;
          if(data?.source==='playforge-platform-guide'&&data.type==='reveal'){
            parent.postMessage({source:'playforge-godot-editor',type:'guide-result',requestId:data.requestId,ok:true},location.origin);
          }
        });
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

    await page.frameLocator('#editor').locator('body').evaluate(() => parent.postMessage({source:'playforge-godot-editor',type:'platform-action',action:'home'}, location.origin));
    await page.locator('#library').waitFor({state:'visible'});
    await page.getByRole('button', { name: new RegExp(templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
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
    assert.equal(await page.locator('.peer-cursor small', {hasText:'공동 작업자'}).count(),0,'own cursor must not appear as a collaborator');
    const activeId = new URL(page.url()).searchParams.get('project');
    await fetch(origin+'/api/platform/projects/'+activeId+'/activity', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'test-peer',label:'다른 작업자',kind:'typing',x:.5,y:.5,text:'K'})});
    await page.locator('.peer-cursor small', { hasText: '다른 작업자' }).waitFor({ state: 'visible' });
    await page.locator('.peer-cursor em', { hasText: '⌨ K' }).waitFor({ state: 'visible' });
    const mode = realEditor ? 'real' : 'stub';
    const artifactDirectory = path.join(root, 'Saved', 'Tests', 'platform');
    const artifactSuffix = templateId === 'playground3d' ? '' : `-${templateId}`;
    const typingScreenshot = path.join(artifactDirectory, `guided-${mode}${artifactSuffix}-typing.png`);
    const completedScreenshot = path.join(artifactDirectory, `guided-${mode}${artifactSuffix}-completed.png`);
    const resultFile = path.join(artifactDirectory, `guided-${mode}${artifactSuffix}.json`);
    fs.mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({ path: typingScreenshot, fullPage: false });

    const projectId = new URL(page.url()).searchParams.get('project');
    assert.ok(projectId, 'guided project should be selected in the platform UI');
    const getProject = async () => fetch(`${origin}/api/platform/projects/${projectId}`).then(response => response.json());
    let snapshot;
    const firstSaveDeadline = Date.now() + 10000;
    do {
      snapshot = await getProject();
      if (guideSaves.length && snapshot.revision > guideSaves[0].baseRevision) break;
      await sleep(40);
    } while (Date.now() < firstSaveDeadline);
    assert.ok(guideSaves.length && snapshot.revision > guideSaves[0].baseRevision, 'guided steps should persist the prepared files');
    const joiningSnapshot = await getProject();
    const joinUpdate = await fetch(`${origin}/api/platform/projects/${projectId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: joiningSnapshot.revision,
        files: [...joiningSnapshot.files, { path: 'notes/collaborator.txt', content: 'saved while joining' }],
        clientId: 'guest_join_client',
      }),
    });
    assert.equal(joinUpdate.status, 200, 'a collaborator joining during the guide should be able to save an unrelated file');
    const preparedEarly = await fetch(`${origin}/api/platform/templates/${templateId}`).then(response => response.json());
    const earlyScriptFiles = guideSaves[0].files.filter(file => /\.gd$/i.test(file.path)).sort((a, b) => a.path.localeCompare(b.path));
    const preparedScriptFiles = preparedEarly.files.filter(file => /\.gd$/i.test(file.path)).sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(earlyScriptFiles, preparedScriptFiles, 'the first guided save should contain complete scripts, never partial typing');
    const automatedActivity = activityPosts.filter(payload => typeof payload.clientId === 'string' && payload.clientId.endsWith('-guide'));
    assert.ok(automatedActivity.length > 0, 'the guide should report its cursor activity');
    assert.equal(automatedActivity.some(payload => payload.kind === 'typing'), false, 'the automated guide should not simulate source typing');
    assert.ok(automatedActivity.filter(payload => payload.kind === 'cursor' || payload.kind === 'step').every(payload => typeof payload.text !== 'string' || !/extends\s+|func\s+|var\s+|class_name\s+|\.gd\b/.test(payload.text)), 'activity narration should not expose source code');
    const guideCodeVisible = await page.locator('#guideCode').isVisible().catch(() => false);
    assert.equal(guideCodeVisible, false, 'source preview should be absent or hidden');
    assert.ok(automatedActivity.some(payload => payload.kind === 'step' && typeof payload.text === 'string' && /[가-힣]/.test(payload.text)), 'cursor steps should use Korean narration');
    const guideCursor = page.locator('.peer-cursor').filter({ hasText: '템플릿 가이드' });
    await guideCursor.waitFor({ state: 'visible' });
    assert.equal((await guideCursor.locator('em').textContent()).trim(), '', 'guide narration should stay in the progress panel, with no caption under its cursor');

    await page.locator('#guidePause').click();
    await page.getByRole('button', { name: '계속' }).waitFor({ state: 'visible' });
    const pausedRevision = (await getProject()).revision;
    await sleep(500);
    assert.equal((await getProject()).revision, pausedRevision, 'revision should stop changing while paused');

    await page.getByRole('button', { name: '계속' }).click();
    try {
      await page.waitForFunction(() => document.getElementById('guideStep')?.textContent.includes('완료'), null, { timeout: realEditor ? 150000 : 60000 });
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
      fetch(`${origin}/api/platform/templates/${templateId}`).then(response => response.json()),
    ]);
    const sortFiles = files => files.map(({ path: filePath, content }) => ({ path: filePath, content })).sort((a, b) => a.path.localeCompare(b.path));
    const finalFiles = sortFiles(finalProject.files);
    const preparedFiles = sortFiles(prepared.files);
    const finalConfigFile = finalFiles.find(file => file.path === 'project.godot');
    const preparedConfigFile = preparedFiles.find(file => file.path === 'project.godot');
    assert.deepEqual(finalFiles.filter(file => file.path !== 'project.godot' && file.path !== 'notes/collaborator.txt'), preparedFiles.filter(file => file.path !== 'project.godot'), 'guided scenes and scripts must match the prepared template exactly');
    assert.equal(finalFiles.find(file => file.path === 'notes/collaborator.txt')?.content, 'saved while joining', 'the guide must preserve unrelated files added by a joining collaborator');
    assert.ok(finalConfigFile && preparedConfigFile);
    // Godot's Web editor may serialize one extra trailing blank line; permit that formatting-only delta, and nothing else.
    assert.ok(finalConfigFile.content === preparedConfigFile.content || finalConfigFile.content === preparedConfigFile.content + '\n',
      `project.godot differs beyond a single trailing blank line: ${JSON.stringify(finalConfigFile.content.slice(-80))}`);
    const projectConfig = finalConfigFile.content;
    assert.ok(projectConfig.includes(`config/name="${templateName}"`), `the final project setting should use the ${templateName} template name`);
    const allGuideActivity = activityPosts.filter(payload => typeof payload.clientId === 'string' && payload.clientId.endsWith('-guide'));
    assert.ok(allGuideActivity.length > 0, 'the completed guide should have recorded activity');
    assert.equal(allGuideActivity.some(payload => payload.kind === 'typing'), false, 'the complete automated guide should not simulate source typing');
    assert.ok(allGuideActivity.every(payload => typeof payload.text !== 'string' || !/extends\s+|func\s+|var\s+|class_name\s+|\.gd\b/.test(payload.text)), 'the complete guide activity should not expose source code');
    assert.ok(allGuideActivity.some(payload => payload.kind === 'step' && typeof payload.text === 'string' && /[가-힣]/.test(payload.text)), 'completed cursor steps should use Korean narration');
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
    if (!realEditor) {
      const preservedRevision = finalProject.revision;
      await page.getByRole('button', { name: '처음부터 다시' }).click();
      await page.waitForFunction(previousId => new URL(location.href).searchParams.get('project') !== previousId, projectId);
      const restartedId = new URL(page.url()).searchParams.get('project');
      assert.notEqual(restartedId, projectId, 'restart should create a clean project while preserving the completed project');
      await page.waitForFunction(() => document.getElementById('guideStep')?.textContent.includes('에디터를 준비하고 있습니다'));
      assert.equal((await getProject()).revision, preservedRevision, 'the completed project remains untouched after restarting');
    }
    assert.deepEqual(pageErrors, [], 'the guided browser flow should not report JavaScript errors');
    assert.deepEqual(engineErrors, [], 'the guided editor should not report GDScript errors');
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => { if (!server.listening) return resolve(); server.once('close', resolve); server.shutdown(); });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
