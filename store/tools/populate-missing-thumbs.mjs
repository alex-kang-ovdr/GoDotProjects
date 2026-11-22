#!/usr/bin/env node
/**
 * Populate real preview thumbnails for all Store catalog entries missing thumbnail_url:
 * 1) Real 3D WebGL PNG studio renders from local CC0 .glb files via PlayHubAvatarGlbViewer + Chrome CDP
 * 2) Official preview / og:image / GitHub Preview.png / Godot AssetLib thumbnails (HTTP 200 image/* verified)
 * 3) Bespoke art-directed visual preview SVGs for PlayForge sample kits & audio/font/shader packs without photos
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(STORE_ROOT, '..');
const CATALOG_PATH = path.join(STORE_ROOT, 'data', 'collected-catalog.json');
const THUMBS_DIR = path.join(STORE_ROOT, 'web', 'thumbs');
const AVATAR_ASSETS_DIR = path.join(REPO_ROOT, 'forge', 'Godot', 'addons', 'playforge_avatar', 'assets');
const GLB_VIEWER_JS = path.join(REPO_ROOT, 'hub', 'web', 'user', 'avatar-glb-viewer.js');

fs.mkdirSync(THUMBS_DIR, { recursive: true });

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function findChrome() {
  for (const c of [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean)) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Render REAL 3D GLB studio PNGs for the 5 local CC0 GLB packs
// ---------------------------------------------------------------------------
const LOCAL_GLB_RENDERS = [
  {
    asset_id: 'kaykit-adventurers-cc0',
    skin: 'skins/Knight.glb',
    attachments: [
      { slot: 'hand_r', file: 'accessories/sword_1handed.glb' },
      { slot: 'hand_l', file: 'accessories/shield_round.glb' }
    ],
    bg: 'radial-gradient(circle at 50% 35%, #2D4A8A 0%, #141E38 100%)',
    cam: 'TPS'
  },
  {
    asset_id: 'kaykit-skeletons-cc0',
    skin: 'skins/Skeleton_Warrior.glb',
    attachments: [
      { slot: 'hand_r', file: 'accessories/axe_1handed.glb' },
      { slot: 'hand_l', file: 'accessories/shield_spikes.glb' }
    ],
    bg: 'radial-gradient(circle at 50% 35%, #1E5641 0%, #0F231C 100%)',
    cam: 'TPS'
  },
  {
    asset_id: 'kaykit-rpg-weapons-cc0',
    skin: 'skins/Barbarian.glb',
    attachments: [
      { slot: 'hand_r', file: 'accessories/axe_2handed.glb' },
      { slot: 'hand_l', file: 'accessories/shield_square.glb' },
      { slot: 'back', file: 'accessories/quiver.glb' }
    ],
    bg: 'radial-gradient(circle at 50% 35%, #5B3587 0%, #1D1230 100%)',
    cam: 'TPS'
  },
  {
    asset_id: 'quaternius-robot-cc0',
    skin: 'skins/RobotExpressive.glb',
    attachments: [],
    rigProfile: { modelScale: 0.36 },
    bg: 'radial-gradient(circle at 50% 35%, #8A441E 0%, #24150D 100%)',
    cam: 'TPS'
  },
  {
    asset_id: 'playforge-starter-headgear-cc0',
    skin: 'skins/Mage.glb',
    attachments: [
      { slot: 'head', file: 'accessories/crown_gold.glb' },
      { slot: 'hand_r', file: 'accessories/staff.glb' }
    ],
    bg: 'radial-gradient(circle at 50% 35%, #244F8C 0%, #121B2E 100%)',
    cam: 'PortraitUpper'
  }
];

async function renderLocalGlbThumbs() {
  const chrome = findChrome();
  if (!chrome || !fs.existsSync(GLB_VIEWER_JS)) {
    console.warn('Chrome or avatar-glb-viewer.js not available; skipping 3D GLB renders');
    return {};
  }

  const viewerCode = fs.readFileSync(GLB_VIEWER_JS, 'utf8');
  const srv = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/' || urlPath === '/render.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:640px;height:360px;overflow:hidden;background:#141E38}
        #stage{width:640px;height:360px;position:relative;display:flex;align-items:center;justify-content:center}
        canvas{width:640px;height:360px;display:block}
      </style><script src="/viewer.js"></script></head><body><div id="stage"><canvas id="c" width="640" height="360"></canvas></div></body></html>`);
    }
    if (urlPath === '/viewer.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(viewerCode);
    }
    if (urlPath.startsWith('/assets/')) {
      const rel = urlPath.slice('/assets/'.length);
      const file = path.resolve(AVATAR_ASSETS_DIR, rel);
      if (file.startsWith(AVATAR_ASSETS_DIR) && fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
        return res.end(fs.readFileSync(file));
      }
    }
    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-thumbs-'));
  const proc = spawn(chrome, [
    '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, `http://127.0.0.1:${port}/render.html`
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
  const results = {};

  try {
    let wsUrl = '';
    for (let i = 0; i < 60; i++) {
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { wsUrl = m[1]; break; }
      await delay(100);
    }
    if (!wsUrl) throw new Error('Chrome CDP failed to start');
    const debugOrigin = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
    let target = null;
    for (let i = 0; i < 40; i++) {
      const list = await (await fetch(`${debugOrigin}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
      await delay(100);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 1;
    const pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    });
    const send = (method, params = {}) => new Promise((r) => {
      const mid = id++;
      pending.set(mid, r);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/render.html` });
    await delay(800);

    await send('Runtime.evaluate', {
      expression: `window.__viewer = window.PlayHubAvatarGlbViewer.create(document.getElementById('c')); true;`,
      returnByValue: true
    });

    for (const spec of LOCAL_GLB_RENDERS) {
      const skinPath = path.join(AVATAR_ASSETS_DIR, spec.skin);
      if (!fs.existsSync(skinPath)) continue;
      const atts = spec.attachments
        .filter((a) => fs.existsSync(path.join(AVATAR_ASSETS_DIR, a.file)))
        .map((a) => ({ slot: a.slot, url: `/assets/${a.file}` }));
      await send('Runtime.evaluate', {
        expression: `(async () => {
          document.getElementById('stage').style.background = ${JSON.stringify(spec.bg)};
          window.__viewer.setCameraPreset(${JSON.stringify(spec.cam)});
          await window.__viewer.setLoadout({
            skinUrl: ${JSON.stringify(`/assets/${spec.skin}`)},
            rigProfile: ${JSON.stringify(spec.rigProfile || { modelScale: 0.88 })},
            attachments: ${JSON.stringify(atts)}
          });
          await new Promise(r => setTimeout(r, 450));
          return window.__viewer.getDiagnostics();
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const fileName = `${spec.asset_id}.png`;
      fs.writeFileSync(path.join(THUMBS_DIR, fileName), Buffer.from(shot.data, 'base64'));
      results[spec.asset_id] = `./thumbs/${fileName}`;
      console.log(`  [3D GLB PNG] ${spec.asset_id} -> ./thumbs/${fileName}`);
    }
    ws.close();
  } finally {
    try { proc.stderr.destroy(); proc.kill(); proc.unref(); } catch {}
    await new Promise((r) => { srv.close(r); srv.closeAllConnections?.(); });
    await delay(150);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Fetch real official preview images from OpenGameArt, GitHub, itch.io, Godot AssetLib
// ---------------------------------------------------------------------------
async function verifyImageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'PlayHubAssetStore/1.0 (+https://playhub.local)' }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    // Abort body stream right after headers check
    try { await res.body?.cancel(); } catch {}
    if (ct.startsWith('image/') && !ct.includes('icon')) return res.url || url;
    return null;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PlayHubAssetStore/1.0)' }
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

function extractMetaImage(html, baseUrl) {
  const candidates = [];
  // Prefer OpenGameArt main preview image
  const ogaMatches = [...html.matchAll(/https:\/\/opengameart\.org\/sites\/default\/files\/(?:styles\/medium\/public\/)?[^"'<> ]+\.(?:png|jpg|jpeg|webp)/gi)];
  for (const m of ogaMatches) {
    if (!/logo|avatar|icon|badge/i.test(m[0])) candidates.push(m[0]);
  }
  // Prefer itch.io cover/screenshot
  const itchMeta = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (itchMeta?.[1]) {
    try {
      const resolved = new URL(itchMeta[1].replace(/&amp;/g, '&'), baseUrl).href;
      candidates.push(resolved);
    } catch {}
  }
  return [...new Set(candidates)];
}

async function resolveExternalPreview(item) {
  const src = String(item.source_url || '').trim();
  if (!src || !/^https?:\/\//i.test(src)) return null;

  // 1) Godot Asset Library official API
  const gdMatch = src.match(/godotengine\.org\/asset-library\/asset\/(\d+)/i);
  if (gdMatch) {
    try {
      const r = await fetch(`https://godotengine.org/asset-library/api/asset/${gdMatch[1]}`);
      if (r.ok) {
        const d = await r.json();
        const cand = d.previews?.[0]?.thumbnail || d.previews?.[0]?.link || d.icon_url;
        const ok = await verifyImageUrl(cand);
        if (ok) return ok;
      }
    } catch {}
  }

  // 2) GitHub KayKit / repository preview image
  const ghMatch = src.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (ghMatch) {
    const [, owner, repo] = ghMatch;
    // Try common preview files on main/master branch first
    for (const branch of ['main', 'master']) {
      for (const file of ['Preview.png', 'preview.png', 'Sample.png', 'sample.png', 'banner.png', 'cover.png']) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`;
        const ok = await verifyImageUrl(rawUrl);
        if (ok) return ok;
      }
    }
    // Check GitHub API tree root for any png/jpg preview
    try {
      const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: { 'User-Agent': 'PlayHubAssetStore/1.0', Accept: 'application/vnd.github+json' }
      });
      if (apiRes.ok) {
        const files = await apiRes.json();
        if (Array.isArray(files)) {
          const img = files.find((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.name || '') && f.download_url);
          if (img?.download_url) {
            const ok = await verifyImageUrl(img.download_url);
            if (ok) return ok;
          }
        }
      }
    } catch {}
  }

  // 3) Fetch HTML and inspect OpenGameArt previews or og:image
  const html = await fetchHtml(src);
  if (html) {
    const candidates = extractMetaImage(html, src);
    for (const c of candidates) {
      // Skip generic GitHub default opengraph cards unless it's a custom social preview
      if (/opengraph\.githubassets\.com/i.test(c)) continue;
      if (/fonts\.gstatic\.com\/s\/i\/productlogos/i.test(c)) continue;
      const ok = await verifyImageUrl(c);
      if (ok) return ok;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Bespoke Art-Directed Visual Preview SVGs for remaining items + 4 Sample kits
// ---------------------------------------------------------------------------
function generateBespokeSvg(item) {
  const id = item.asset_id;
  const cat = String(item.category || '');
  const title = String(item.title || id).slice(0, 34);
  const subtitle = String(item.source_provider || item.publisher_id || 'PlayForge').slice(0, 30);

  // Audio / SFX / BGM visualizer
  if (/오디오|효과음|audio|sfx|music|sound|voice/i.test(cat + ' ' + title + ' ' + id)) {
    const bars = [22, 48, 84, 62, 118, 94, 46, 134, 152, 88, 124, 70, 142, 98, 54, 112, 76, 40, 86, 58, 30];
    const barRects = bars.map((h, i) => {
      const x = 66 + i * 24;
      const y = 175 - h / 2;
      return `<rect x="${x}" y="${y}" width="14" height="${h}" rx="7" fill="url(#wave)" opacity="${(0.55 + (i % 3) * 0.15).toFixed(2)}"/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1A1633"/><stop offset="100%" stop-color="#0F172A"/></linearGradient>
        <linearGradient id="wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60A5FA"/><stop offset="55%" stop-color="#818CF8"/><stop offset="100%" stop-color="#C084FC"/></linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <line x1="40" y1="175" x2="600" y2="175" stroke="#334155" stroke-dasharray="4 6"/>
      ${barRects}
      <circle cx="548" cy="76" r="28" fill="#2563EB"/><polygon points="541,64 562,76 541,88" fill="#FFFFFF"/>
      <text x="42" y="54" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="14" font-weight="700" fill="#93C5FD">${esc(subtitle)}</text>
      <text x="42" y="314" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="22" font-weight="800" fill="#F8FAFC">${esc(title)}</text>
    </svg>`;
  }

  // Font specimen card
  if (/폰트|font|타이포/i.test(cat + ' ' + id)) {
    const serif = /serif|명조/i.test(title + ' ' + id);
    const ff = serif ? 'Georgia, Batang, serif' : 'Segoe UI, Malgun Gothic, sans-serif';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F8FAFC"/><stop offset="100%" stop-color="#E2E8F0"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect x="28" y="28" width="584" height="304" rx="20" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
      <text x="58" y="138" font-family="${ff}" font-size="76" font-weight="800" fill="#0F172A">가나 Aa</text>
      <text x="58" y="206" font-family="${ff}" font-size="28" font-weight="600" fill="#475569">다람쥐 헌 쳇바퀴에 타고파 · 0123456789</text>
      <rect x="58" y="236" width="128" height="30" rx="15" fill="#FEF3C7"/><text x="76" y="256" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#92400E">SIL OFL 1.1</text>
      <text x="58" y="304" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="18" font-weight="800" fill="#004AC6">${esc(title)}</text>
    </svg>`;
  }

  // UI / HUD Kit mockup
  if (/\bui\b|\bhud\b|테마/i.test(cat + ' ' + id)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0F172A"/><stop offset="100%" stop-color="#1E293B"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <!-- Top-left HP/MP HUD -->
      <rect x="36" y="34" width="230" height="72" rx="14" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
      <circle cx="72" cy="70" r="22" fill="#2563EB"/><text x="64" y="76" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#FFF">LV9</text>
      <rect x="106" y="52" width="140" height="12" rx="6" fill="#334155"/><rect x="106" y="52" width="112" height="12" rx="6" fill="#22C55E"/>
      <rect x="106" y="72" width="140" height="10" rx="5" fill="#334155"/><rect x="106" y="72" width="88" height="10" rx="5" fill="#38BDF8"/>
      <!-- Top-right Radar Minimap -->
      <rect x="466" y="34" width="138" height="138" rx="18" fill="#0B1324" stroke="#475569" stroke-width="2"/>
      <circle cx="535" cy="103" r="46" fill="none" stroke="#1E3A8A" stroke-width="2"/>
      <circle cx="535" cy="103" r="24" fill="none" stroke="#1E3A8A" stroke-width="1.5"/>
      <circle cx="535" cy="103" r="5" fill="#38BDF8"/><circle cx="556" cy="84" r="4" fill="#F97316"/><circle cx="512" cy="122" r="4" fill="#22C55E"/>
      <!-- Bottom Hotbar -->
      <rect x="150" y="218" width="340" height="58" rx="14" fill="#1E293B" stroke="#475569" stroke-width="2"/>
      <rect x="166" y="230" width="46" height="34" rx="8" fill="#2563EB"/><rect x="222" y="230" width="46" height="34" rx="8" fill="#334155"/>
      <rect x="278" y="230" width="46" height="34" rx="8" fill="#334155"/><rect x="334" y="230" width="46" height="34" rx="8" fill="#334155"/>
      <rect x="390" y="230" width="46" height="34" rx="8" fill="#EA580C"/><rect x="446" y="230" width="30" height="34" rx="8" fill="#15803D"/>
      <text x="36" y="322" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="22" font-weight="800" fill="#F8FAFC">${esc(title)}</text>
    </svg>`;
  }

  // Guide / Editorial workflow diagram
  if (/가이드|guide|dock/i.test(cat + ' ' + id)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#EEF2FF"/><stop offset="100%" stop-color="#E0E7FF"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect x="48" y="102" width="152" height="106" rx="16" fill="#FFFFFF" stroke="#004AC6" stroke-width="2"/>
      <text x="78" y="148" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#004AC6">1. 스토어</text>
      <text x="72" y="176" font-family="Segoe UI, sans-serif" font-size="13" fill="#475569">에셋 탐색·저장</text>
      <path d="M210 155 L238 155" stroke="#004AC6" stroke-width="3" stroke-linecap="round"/>
      <rect x="244" y="102" width="152" height="106" rx="16" fill="#FFFFFF" stroke="#15803D" stroke-width="2"/>
      <text x="268" y="148" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#15803D">2. 라이브러리</text>
      <text x="270" y="176" font-family="Segoe UI, sans-serif" font-size="13" fill="#475569">무결성 검증</text>
      <path d="M406 155 L434 155" stroke="#15803D" stroke-width="3" stroke-linecap="round"/>
      <rect x="440" y="102" width="152" height="106" rx="16" fill="#004AC6"/>
      <text x="466" y="148" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#FFFFFF">3. PlayForge</text>
      <text x="468" y="176" font-family="Segoe UI, sans-serif" font-size="13" fill="#DBEAFE">Godot 4.7 적용</text>
      <text x="48" y="310" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="22" font-weight="800" fill="#1E293B">${esc(title)}</text>
    </svg>`;
  }

  // Shader / VFX glow sphere
  if (/셰이더|shader|vfx|particle/i.test(cat + ' ' + id)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0B1020"/><stop offset="100%" stop-color="#1E1B4B"/></linearGradient>
        <radialGradient id="orb" cx="38%" cy="35%" r="60%"><stop offset="0%" stop-color="#67E8F9"/><stop offset="50%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#6D28D9"/></radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <circle cx="320" cy="158" r="96" fill="url(#orb)"/>
      <ellipse cx="320" cy="158" rx="148" ry="34" fill="none" stroke="#93C5FD" stroke-width="3" opacity="0.65" transform="rotate(-14 320 158)"/>
      <circle cx="436" cy="96" r="8" fill="#FDE047"/><circle cx="198" cy="204" r="6" fill="#67E8F9"/>
      <text x="38" y="320" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="22" font-weight="800" fill="#F8FAFC">${esc(title)}</text>
    </svg>`;
  }

  // Default 3D Lowpoly Isometric Fortress / Kit preview
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#14532D"/><stop offset="100%" stop-color="#1E3A8A"/></linearGradient></defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <!-- Isometric Lowpoly Castle / Block Diorama -->
    <polygon points="320,254 170,186 320,122 470,186" fill="#22C55E" opacity="0.9"/>
    <polygon points="170,186 320,254 320,278 170,210" fill="#15803D"/>
    <polygon points="470,186 320,254 320,278 470,210" fill="#166534"/>
    <!-- Left Tower -->
    <polygon points="246,110 286,92 326,110 286,128" fill="#E2E8F0"/>
    <polygon points="246,110 286,128 286,196 246,178" fill="#CBD5E1"/>
    <polygon points="326,110 286,128 286,196 326,178" fill="#94A3B8"/>
    <polygon points="286,58 242,108 330,108" fill="#2563EB"/>
    <!-- Right Keep -->
    <polygon points="338,128 386,106 434,128 386,150" fill="#F8FAFC"/>
    <polygon points="338,128 386,150 386,208 338,186" fill="#CBD5E1"/>
    <polygon points="434,128 386,150 386,208 434,186" fill="#64748B"/>
    <rect x="372" y="78" width="28" height="38" fill="#F59E0B" rx="3"/>
    <text x="36" y="48" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="13" font-weight="700" fill="#BBF7D0">${esc(subtitle)}</text>
    <text x="36" y="324" font-family="Segoe UI, Noto Sans KR, sans-serif" font-size="22" font-weight="800" fill="#FFFFFF">${esc(title)}</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const items = raw.items || [];

  console.log('1) Rendering real 3D WebGL PNG thumbnails for 5 local CC0 GLB packs...');
  const glbThumbs = await renderLocalGlbThumbs();

  console.log('2) Fetching real official preview images for curated external & Godot AssetLib packs...');
  const missingExternal = items.filter((it) => !it.thumbnail_url && !glbThumbs[it.asset_id]);
  let fetchedCount = 0;
  let bespokeCount = 0;

  // Concurrency 6 for polite fast fetching
  const queue = [...missingExternal];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const found = await resolveExternalPreview(item);
      if (found) {
        item.thumbnail_url = found;
        fetchedCount += 1;
        console.log(`  [OFFICIAL IMG] ${item.asset_id} -> ${found.slice(0, 90)}`);
      } else {
        const svg = generateBespokeSvg(item);
        const fileName = `${item.asset_id}.svg`;
        fs.writeFileSync(path.join(THUMBS_DIR, fileName), svg, 'utf8');
        item.thumbnail_url = `./thumbs/${fileName}`;
        bespokeCount += 1;
        console.log(`  [BESPOKE SVG]  ${item.asset_id} -> ./thumbs/${fileName}`);
      }
    }
  });
  await Promise.all(workers);

  // Apply 3D GLB renders to catalog items
  let glbCount = 0;
  for (const item of items) {
    if (glbThumbs[item.asset_id]) {
      item.thumbnail_url = glbThumbs[item.asset_id];
      glbCount += 1;
    }
  }

  // Generate bespoke SVG previews for the 4 built-in PlayForge SAMPLE_CATALOG items
  const sampleSpecs = [
    { asset_id: 'lowpoly-fortress-pack', title: 'Lowpoly Fortress Siege Kit', category: '3D 환경 · 요새', publisher_id: 'PlayForge Core' },
    { asset_id: 'ui-tactical-hud-kit', title: 'Tactical Strategy HUD & Minimap', category: 'UI · 테마 · Addon', publisher_id: 'Studio Nord' },
    { asset_id: 'sfx-siege-audio-pack', title: 'Siege Artillery & UI SFX Pack', category: '오디오 · 효과음', publisher_id: 'Audio Atelier' },
    { asset_id: 'godot-47-dock-guide', title: 'Godot 4.7 Store 설치 가이드', category: '가이드 · 일반 콘텐츠', publisher_id: 'PlayForge Docs' }
  ];
  for (const s of sampleSpecs) {
    fs.writeFileSync(path.join(THUMBS_DIR, `${s.asset_id}.svg`), generateBespokeSvg(s), 'utf8');
    console.log(`  [SAMPLE SVG]   ${s.asset_id} -> ./thumbs/${s.asset_id}.svg`);
  }

  raw.generated_at = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(raw)}\n`, 'utf8');

  const remainingMissing = items.filter((x) => !x.thumbnail_url).length;
  console.log('\n=== THUMBNAIL POPULATION SUMMARY ===');
  console.log(JSON.stringify({
    catalogItems: items.length,
    glbRenderedPngs: glbCount,
    officialExternalFetched: fetchedCount,
    bespokeSvgsGenerated: bespokeCount,
    sampleSvgsGenerated: sampleSpecs.length,
    remainingMissing
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
