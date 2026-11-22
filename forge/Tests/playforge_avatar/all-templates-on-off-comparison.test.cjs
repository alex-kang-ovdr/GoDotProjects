'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const { createServer } = require('../../server.cjs');
const { NativeRuntime } = require('../../Tools/native-runtime.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const officialGodot = NativeRuntime.availability(forgeRoot);
const evidenceDir = path.join(forgeRoot, 'Saved', 'Tests', 'avatar-on-off-comparison');

const TEMPLATE_GROUPS = [
  {
    sheetFile: 'comparison-sheet-1-3d-and-roblox.png',
    sheetTitle: 'Sheet 1/3 · 3D World & Roblox 3D+Portrait Hybrid (6 Templates) — ON (배포용) vs OFF (미배포용 · 표준 Godot)',
    templates: [
      { id: 'blank3d', label: 'blank3d', modeText: 'WORLD_3D (standalone)', viewport: { width: 1280, height: 720 } },
      { id: 'playground3d', label: 'playground3d', modeText: 'WORLD_3D (standalone)', viewport: { width: 1280, height: 720 } },
      { id: 'roblox-chaos-obby', label: 'roblox-chaos-obby', modeText: 'HYBRID 3D+PORTRAIT · BL 144×144', viewport: { width: 1280, height: 720 } },
      { id: 'roblox-lantai-runtuh', label: 'roblox-lantai-runtuh', modeText: 'HYBRID 3D+PORTRAIT · BL 144×144', viewport: { width: 1280, height: 720 } },
      { id: 'roblox-power-punch-sim', label: 'roblox-power-punch-sim', modeText: 'HYBRID 3D+PORTRAIT · BR 156×156', viewport: { width: 1280, height: 720 } },
      { id: 'roblox-war-tycoon', label: 'roblox-war-tycoon', modeText: 'HYBRID 3D+PORTRAIT · BR 156×156', viewport: { width: 1280, height: 720 } },
    ],
  },
  {
    sheetFile: 'comparison-sheet-2-fullbody-and-3d-portrait.png',
    sheetTitle: 'Sheet 2/3 · Full-Body & 3D/Action Portrait (6 Templates) — ON (배포용) vs OFF (미배포용 · 표준 Godot)',
    templates: [
      { id: 'iron-wood', label: 'iron-wood', modeText: 'PORTRAIT_FULL_BODY · BR 168×252', viewport: { width: 1280, height: 720 } },
      { id: 'fortress-war', label: 'fortress-war', modeText: 'PORTRAIT_FULL_BODY · CUSTOM(1104,84) 160×240', viewport: { width: 1280, height: 900 } },
      { id: 'brawllabs', label: 'brawllabs', modeText: 'PORTRAIT_UPPER_BODY · CUSTOM(1116,592) 148×148', viewport: { width: 1280, height: 800 } },
      { id: 'voxel-frontier', label: 'voxel-frontier', modeText: 'PORTRAIT_UPPER_BODY · BR 160×160', viewport: { width: 1280, height: 720 } },
      { id: 'unity-roll-a-ball', label: 'unity-roll-a-ball', modeText: 'PORTRAIT_UPPER_BODY · TR 140×140', viewport: { width: 1280, height: 720 } },
      { id: 'unity-tanks-3d', label: 'unity-tanks-3d', modeText: 'PORTRAIT_UPPER_BODY · TR 160×160', viewport: { width: 1280, height: 720 } },
    ],
  },
  {
    sheetFile: 'comparison-sheet-3-2d-arcade-portrait.png',
    sheetTitle: 'Sheet 3/3 · 2D Arcade / Action / Roguelike Portrait (6 Templates) — ON (배포용) vs OFF (미배포용 · 표준 Godot)',
    templates: [
      { id: 'unity-2d-roguelike', label: 'unity-2d-roguelike', modeText: 'PORTRAIT_UPPER_BODY · TR 128×128', viewport: { width: 1280, height: 720 } },
      { id: 'unity-space-shooter', label: 'unity-space-shooter', modeText: 'PORTRAIT_UPPER_BODY · BL 144×144', viewport: { width: 1280, height: 720 } },
      { id: 'survivor-io', label: 'survivor-io', modeText: 'PORTRAIT_UPPER_BODY · BL 128×128', viewport: { width: 1280, height: 720 } },
      { id: 'tappy-chicken', label: 'tappy-chicken', modeText: 'PORTRAIT_UPPER_BODY · BL 128×128', viewport: { width: 1280, height: 720 } },
      { id: 'tappy-chicken-mmo', label: 'tappy-chicken-mmo', modeText: 'PORTRAIT_UPPER_BODY · BL 128×128', viewport: { width: 1280, height: 720 } },
      { id: 'unity-flappy-bird', label: 'unity-flappy-bird', modeText: 'PORTRAIT_UPPER_BODY · BR 128×128', viewport: { width: 1280, height: 720 } },
    ],
  },
];

function listPckPaths(pckBuffer) {
  const magic = pckBuffer.readUInt32LE(0);
  assert.equal(magic, 0x43504447, 'Not a valid GDPC .pck file');
  const version = pckBuffer.readUInt32LE(4);
  let pos = version >= 3 ? Number(pckBuffer.readBigUInt64LE(32)) : 96;
  const count = pckBuffer.readUInt32LE(pos);
  pos += 4;
  const paths = [];
  for (let i = 0; i < count; i++) {
    const pathLen = pckBuffer.readUInt32LE(pos);
    pos += 4;
    const raw = pckBuffer.subarray(pos, pos + pathLen).toString('utf8').replace(/\0+$/, '');
    paths.push(raw);
    pos += pathLen + 8 + 8 + 16 + 4;
  }
  return paths;
}

async function waitForBuild(base, buildId, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/builds/${buildId}`);
    const data = await res.json();
    if (data.build && ['succeeded', 'failed'].includes(data.build.status)) return data.build;
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Build ${buildId} timed out`);
}

async function captureBuildShot(browser, url, viewport, outPath) {
  const page = await browser.newPage({ viewport });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    if (/SCRIPT ERROR:|Parse Error:|Failed loading resource|Failed to load script/i.test(text)) {
      errs.push(`console: ${text}`);
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3400));
  const box = await canvas.boundingBox();
  const pngBuf = await page.screenshot({ path: outPath });
  await page.close();
  return { errs, box, pngBuf };
}

async function analyzePairInBrowser(analyzerPage, onBuf, offBuf, canvasBox) {
  const onDataUrl = `data:image/png;base64,${onBuf.toString('base64')}`;
  const offDataUrl = `data:image/png;base64,${offBuf.toString('base64')}`;
  return analyzerPage.evaluate(async ({ onDataUrl, offDataUrl, box }) => {
    const loadImg = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const [imgOn, imgOff] = await Promise.all([loadImg(onDataUrl), loadImg(offDataUrl)]);
    const w = imgOn.width;
    const h = imgOn.height;
    const c1 = document.createElement('canvas');
    c1.width = w;
    c1.height = h;
    const ctx1 = c1.getContext('2d', { willReadFrequently: true });
    ctx1.drawImage(imgOn, 0, 0);
    const d1 = ctx1.getImageData(0, 0, w, h).data;

    const c2 = document.createElement('canvas');
    c2.width = w;
    c2.height = h;
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.drawImage(imgOff, 0, 0);
    const d2 = ctx2.getImageData(0, 0, w, h).data;

    // Overall pixel diff (step by 2px for speed)
    let totalCount = 0;
    let totalDiff = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const delta = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        totalCount++;
        if (delta > 30) totalDiff++;
      }
    }

    // Adaptive Top-Left Hub HUD bar detector (works for both 16:9 widescreen and centered vertical 2D viewports!)
    const isPlayHubLime = (r, g, b) => (r >= 180 && r <= 248 && g >= 195 && g <= 252 && b >= 120 && b <= 200 && g > b + 20);
    let minLx = w, maxLx = -1, minLy = h, maxLy = -1;
    let hudLimeOn = 0;
    let hudLimeOff = 0;
    for (let y = 0; y < Math.min(h, 96); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r1 = d1[i], g1 = d1[i + 1], b1 = d1[i + 2];
        const r2 = d2[i], g2 = d2[i + 1], b2 = d2[i + 2];
        const delta = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        const lime1 = isPlayHubLime(r1, g1, b1);
        const lime2 = isPlayHubLime(r2, g2, b2);
        if (lime1 && !lime2 && delta > 30) {
          hudLimeOn++;
          if (x < minLx) minLx = x;
          if (x > maxLx) maxLx = x;
          if (y < minLy) minLy = y;
          if (y > maxLy) maxLy = y;
        }
        if (lime2 && !lime1 && delta > 30) hudLimeOff++;
      }
    }

    const rx0 = maxLx >= 0 ? Math.max(0, minLx - 16) : 0;
    const ry0 = maxLy >= 0 ? Math.max(0, minLy - 12) : 0;
    const rx1 = maxLx >= 0 ? Math.min(w, maxLx + 120) : Math.min(w, 260);
    const ry1 = maxLy >= 0 ? Math.min(h, maxLy + 18) : Math.min(h, 68);
    let hudCount = 0;
    let hudDiff = 0;
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const i = (y * w + x) * 4;
        hudCount++;
        if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 30) hudDiff++;
      }
    }

    // Non-HUD diff (excluding the detected top-left HUD bar rect -> isolates Avatar / Portrait visual presence)
    let bodyCount = 0;
    let bodyDiff = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (x >= rx0 && x < rx1 && y >= ry0 && y < ry1) continue;
        const i = (y * w + x) * 4;
        const delta = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        bodyCount++;
        if (delta > 30) bodyDiff++;
      }
    }

    return {
      overallDiffPct: Number(((totalDiff / Math.max(1, totalCount)) * 100).toFixed(2)),
      hudDiffPct: Number(((hudDiff / Math.max(1, hudCount)) * 100).toFixed(2)),
      bodyDiffPct: Number(((bodyDiff / Math.max(1, bodyCount)) * 100).toFixed(2)),
      hudLimeOn,
      hudLimeOff,
      hudBarBounds: maxLx >= 0 ? [minLx, minLy, maxLx, maxLy] : null,
    };
  }, { onDataUrl, offDataUrl, box: canvasBox });
}

async function renderContactSheet(browser, sheetTitle, rows, outPath) {
  const page = await browser.newPage({ viewport: { width: 1620, height: 1000 } });
  const rowHtml = rows.map((r) => {
    const onSrc = `data:image/png;base64,${r.onBuf.toString('base64')}`;
    const offSrc = `data:image/png;base64,${r.offBuf.toString('base64')}`;
    return `
      <div class="row">
        <div class="row-head">
          <div class="tpl-name">${r.id}</div>
          <div class="tpl-mode">${r.modeText}</div>
          <div class="tpl-stats">
            <span class="chip ok">HUD Diff ${r.metrics.hudDiffPct}% (Lime px: ${r.metrics.hudLimeOn} vs ${r.metrics.hudLimeOff})</span>
            <span class="chip ok">Avatar/Scene Diff ${r.metrics.bodyDiffPct}%</span>
            <span class="chip ok">ON PCK: OK · OFF PCK: 0</span>
          </div>
        </div>
        <div class="pair">
          <div class="shot">
            <div class="badge on">ON · 배포용 (PlayHub Publish: 아바타 + 좌상단 허브 HUD 적용)</div>
            <img src="${onSrc}" />
          </div>
          <div class="shot">
            <div class="badge off">OFF · 미배포용 (Standard Godot: 아바타·허브 HUD 미적용)</div>
            <img src="${offSrc}" />
          </div>
        </div>
      </div>`;
  }).join('\n');

  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0b1116; color: #eef3f0; font-family: 'Segoe UI', 'Malgun Gothic', sans-serif; padding: 20px; width: 1620px; }
    h1 { font-size: 20px; font-weight: 700; color: #deeca6; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #233330; }
    .row { background: #121c22; border: 1px solid #24363c; border-radius: 12px; padding: 12px; margin-bottom: 14px; }
    .row-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    .tpl-name { font-size: 16px; font-weight: 800; color: #ffffff; }
    .tpl-mode { font-size: 12px; font-weight: 600; color: #a8c7be; background: #1a2d29; padding: 3px 8px; border-radius: 6px; border: 1px solid #2c4a43; }
    .tpl-stats { margin-left: auto; display: flex; gap: 6px; }
    .chip { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
    .chip.ok { background: #143228; color: #deeca6; border: 1px solid #2d5d4a; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .shot { background: #070b0e; border: 1px solid #223039; border-radius: 8px; overflow: hidden; }
    .badge { font-size: 12px; font-weight: 700; padding: 5px 10px; }
    .badge.on { background: #15352b; color: #deeca6; border-bottom: 1px solid #295948; }
    .badge.off { background: #262b30; color: #cfd8dc; border-bottom: 1px solid #3a424a; }
    .shot img { display: block; width: 100%; height: 420px; object-fit: contain; background: #05080b; }
  </style></head><body>
    <h1>${sheetTitle}</h1>
    ${rowHtml}
  </body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}

test('All 18 default templates ON (배포용: Avatar + Top-Left Hub HUD) vs OFF (미배포용: Standard Godot) comparison + Editor PIE toggle', {
  skip: officialGodot.available ? false : officialGodot.error || 'Official Godot unavailable',
  timeout: 900000,
}, async (t) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-all18-onoff-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(tmp, 'studio'),
    platformWorkspace: path.join(tmp, 'platform'),
    buildDirectory: path.join(tmp, 'builds'),
  });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const analyzerPage = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const allTemplates = TEMPLATE_GROUPS.flatMap((g) => g.templates);
  const summary = [];
  const resultsById = new Map();

  let firstProjectId = null;

  for (const tpl of allTemplates) {
    const created = await fetch(`${base}/api/platform/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `OnOff ${tpl.id}`, template: tpl.id }),
    }).then((r) => r.json());
    assert.ok(created?.project?.id, `Failed to create template project ${tpl.id}`);
    const pid = created.project.id;
    if (!firstProjectId) firstProjectId = pid;

    // 1. Build ON (playhub-publish) and OFF (standard-godot)
    const onEnq = await fetch(`${base}/api/platform-builds/${pid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: created.revision, buildProfile: 'playhub-publish' }),
    });
    assert.equal(onEnq.status, 202, `${tpl.id} ON enqueue failed`);
    const onJob = await waitForBuild(base, (await onEnq.json()).build.id);
    assert.equal(onJob.status, 'succeeded', `${tpl.id} ON build failed: ${onJob.error}\n${onJob.log}`);
    assert.equal(onJob.buildProfile, 'playhub-publish');
    assert.equal(onJob.avatarIncluded, true);
    assert.ok(onJob.files.includes('playhub-godot-shell.js'), `${tpl.id} ON missing playhub-godot-shell.js`);

    const offEnq = await fetch(`${base}/api/platform-builds/${pid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: created.revision, buildProfile: 'standard-godot' }),
    });
    assert.equal(offEnq.status, 202, `${tpl.id} OFF enqueue failed`);
    const offJob = await waitForBuild(base, (await offEnq.json()).build.id);
    assert.equal(offJob.status, 'succeeded', `${tpl.id} OFF build failed: ${offJob.error}\n${offJob.log}`);
    assert.equal(offJob.buildProfile, 'standard-godot');
    assert.equal(offJob.avatarIncluded, false);
    assert.ok(!offJob.files.includes('playhub-godot-shell.js'), `${tpl.id} OFF leaked playhub-godot-shell.js`);

    // 2. Verify PCK contents (ON includes sealed avatar+HUD; OFF excludes 100%)
    const onPckPaths = listPckPaths(Buffer.from(await (await fetch(`${base}/api/builds/${onJob.id}/files/index.pck`)).arrayBuffer()));
    const offPckPaths = listPckPaths(Buffer.from(await (await fetch(`${base}/api/builds/${offJob.id}/files/index.pck`)).arrayBuffer()));
    assert.ok(onPckPaths.some((p) => p.includes('addons/playforge_avatar/avatar_bootstrap.gd')), `${tpl.id} ON PCK missing avatar_bootstrap.gd`);
    assert.ok(onPckPaths.some((p) => p.includes('addons/playforge_avatar/assets/skins/Knight.glb')), `${tpl.id} ON PCK missing Knight.glb`);
    assert.ok(offPckPaths.every((p) => !p.includes('playforge_avatar')), `${tpl.id} OFF PCK leaked playforge_avatar`);
    assert.ok(offPckPaths.every((p) => !p.includes('Knight.glb')), `${tpl.id} OFF PCK leaked Knight.glb`);

    // 3. Capture ON & OFF screenshots in real headless Chrome WebGL
    const onPath = path.join(evidenceDir, `${tpl.id}-ON.png`);
    const offPath = path.join(evidenceDir, `${tpl.id}-OFF.png`);
    const onShot = await captureBuildShot(browser, `${base}${onJob.previewUrl}`, tpl.viewport, onPath);
    const offShot = await captureBuildShot(browser, `${base}${offJob.previewUrl}`, tpl.viewport, offPath);
    assert.deepEqual(onShot.errs, [], `${tpl.id} ON runtime errors:\n${onShot.errs.join('\n')}`);
    assert.deepEqual(offShot.errs, [], `${tpl.id} OFF runtime errors:\n${offShot.errs.join('\n')}`);

    // 4. Measure pixel difference in Top-Left Hub HUD region AND Avatar/Scene region
    const metrics = await analyzePairInBrowser(analyzerPage, onShot.pngBuf, offShot.pngBuf, onShot.box);
    console.log(`[ON/OFF] ${tpl.id.padEnd(24)} | HUD diff=${String(metrics.hudDiffPct).padStart(5)}% (lime ${metrics.hudLimeOn} vs ${metrics.hudLimeOff}) | Body diff=${String(metrics.bodyDiffPct).padStart(5)}% | Total diff=${metrics.overallDiffPct}%`);

    assert.ok(metrics.hudDiffPct >= 1.0, `${tpl.id}: Top-Left Hub HUD diff too small (${metrics.hudDiffPct}%)`);
    assert.ok(metrics.hudLimeOn >= 40, `${tpl.id}: ON missing Top-Left PLAY HUB lime pill pixels (${metrics.hudLimeOn})`);
    assert.ok(metrics.hudLimeOn > metrics.hudLimeOff + 25, `${tpl.id}: ON/OFF Top-Left PLAY HUB lime pixel delta too small (${metrics.hudLimeOn} vs ${metrics.hudLimeOff})`);
    assert.ok(metrics.bodyDiffPct >= 0.2, `${tpl.id}: Avatar/Portrait body diff outside HUD too small (${metrics.bodyDiffPct}%)`);
    assert.ok(metrics.overallDiffPct >= 0.4, `${tpl.id}: Overall ON vs OFF visual diff too small (${metrics.overallDiffPct}%)`);

    const rowData = {
      id: tpl.id,
      modeText: tpl.modeText,
      metrics,
      onBuf: onShot.pngBuf,
      offBuf: offShot.pngBuf,
    };
    resultsById.set(tpl.id, rowData);
    summary.push({
      id: tpl.id,
      modeText: tpl.modeText,
      onBuildProfile: onJob.buildProfile,
      offBuildProfile: offJob.buildProfile,
      onAvatarIncluded: onJob.avatarIncluded,
      offAvatarIncluded: offJob.avatarIncluded,
      onErrors: onShot.errs.length,
      offErrors: offShot.errs.length,
      metrics,
    });
  }

  await analyzerPage.close();

  // 5. Render 3 crisp side-by-side comparison contact sheets (6 templates per sheet)
  for (const group of TEMPLATE_GROUPS) {
    const rows = group.templates.map((tpl) => resultsById.get(tpl.id));
    await renderContactSheet(browser, group.sheetTitle, rows, path.join(evidenceDir, group.sheetFile));
  }

  // 6. Verify PlayForge Web Editor PIE ON/OFF Toggle UI (#pie-avatar-toggle)
  const editorPage = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const editorErrs = [];
  editorPage.on('pageerror', (e) => editorErrs.push(e.message));
  await editorPage.goto(`${base}/OfficialGodot/editor.html?project=${firstProjectId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const toggleBtn = editorPage.locator('#pie-avatar-toggle');
  await toggleBtn.waitFor({ state: 'visible', timeout: 30000 });
  const initAttr = await toggleBtn.getAttribute('data-pie-avatar');
  const initFn = await editorPage.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled());
  assert.equal(initAttr, 'on', 'PIE toggle must default to ON');
  assert.equal(initFn, true, '__playforgeGetPieAvatarEnabled must default to true');
  await editorPage.screenshot({ path: path.join(evidenceDir, 'editor-pie-toggle-ON.png'), clip: { x: 0, y: 0, width: 1280, height: 110 } });

  await toggleBtn.click();
  await new Promise((r) => setTimeout(r, 300));
  const offAttr = await toggleBtn.getAttribute('data-pie-avatar');
  const offFn = await editorPage.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled());
  assert.equal(offAttr, 'off', 'Clicking PIE toggle must switch to OFF');
  assert.equal(offFn, false, '__playforgeGetPieAvatarEnabled must be false after toggle');
  await editorPage.screenshot({ path: path.join(evidenceDir, 'editor-pie-toggle-OFF.png'), clip: { x: 0, y: 0, width: 1280, height: 110 } });

  await toggleBtn.click();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await toggleBtn.getAttribute('data-pie-avatar'), 'on', 'Clicking PIE toggle again must return to ON');
  assert.deepEqual(editorErrs, [], `Editor PIE toggle errors: ${editorErrs.join('\n')}`);
  await editorPage.close();

  fs.writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  assert.equal(summary.length, 18, 'Expected all 18 templates verified');
});
