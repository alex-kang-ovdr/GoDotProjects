import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ApiError, uid } from './security.mjs';

const require = createRequire(import.meta.url);
const KST_OFFSET = 9 * 3600000;
const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

const WEB_EXPORT_PRESET = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt"
exclude_filter="addons/*,.playforge_backups/*,tests/*,saved/*"
export_path=""
script_export_mode=0
[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
progressive_web_app/enabled=false
`;

const LOCALES = ['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];

const TEMPLATE_PRESETS = Object.freeze({
  'brawllabs': {
    koName: '브롤랩스 (Forge)',
    koSummary: '탑다운 아레나에서 봇과 전투하고 젬을 모아 중앙을 점령하는 Godot 2D 스타터 게임입니다.',
    tags: ['action', 'arcade', 'shooter']
  },
  'fortress-war': {
    koName: '포트리스 워 (Forge)',
    koSummary: '바람과 각도를 계산해 포탄을 발사하는 Godot 2D 턴제 포격 스타터 게임입니다.',
    tags: ['strategy', 'action']
  },
  'iron-wood': {
    koName: '아이언 우드 (Forge)',
    koSummary: 'Godot 3D 기반 탐험·액션 스타터 템플릿 게임입니다.',
    tags: ['action', 'adventure']
  },
  'survivor-io': {
    koName: '서바이버 템플릿 (Forge)',
    koSummary: '몰려오는 적을 피하며 성장하는 Godot 2D 서바이벌 스타터 게임입니다.',
    tags: ['action', 'survival', 'roguelike']
  },
  'tappy-chicken': {
    koName: '태피 치킨 (Forge)',
    koSummary: '원버튼 탭으로 장애물을 통과하는 Godot 2D 아케이드 스타터 게임입니다.',
    tags: ['arcade', 'casual']
  },
  'tappy-chicken-mmo': {
    koName: '태피 치킨 MMO (Forge)',
    koSummary: '멀티플레이 로비와 함께 즐기는 Godot 2D 원버튼 비행 아케이드 스타터 게임입니다.',
    tags: ['arcade', 'casual']
  }
});

function kstToday(now) {
  return new Date(Number(now()) + KST_OFFSET).toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function copyTemplateSource(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /^(tests?|saved|node_modules)$/i.test(entry.name)) continue;
    if (['metadata.json', 'showcase.json'].includes(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copyTemplateSource(srcPath, dstPath);
    else if (entry.isFile()) fs.copyFileSync(srcPath, dstPath);
  }
}

function spawnAsync(command, args, { cwd, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const collect = chunk => { output = (output + chunk.toString()).slice(-120000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Process timed out after ${Math.round(timeoutMs / 1000)}s`));
      else if (code !== 0) reject(new Error(`Exit code ${code}: ${output.trim().slice(-400)}`));
      else resolve(output);
    });
  });
}

function buildCoverSvg(template, gameId) {
  const title = escapeXml(template.name || template.id);
  const dim = escapeXml((template.dimension || '2d').toUpperCase());
  const subtitle = escapeXml(gameId);
  const palettes = [
    ['#102a24', '#1f5747', '#d8f08a'],
    ['#1d2438', '#2d4473', '#8ce0ff'],
    ['#2a1c2e', '#593266', '#f4b5ff'],
    ['#2b2114', '#694a1f', '#ffd37a']
  ];
  let hash = 0;
  for (const ch of String(template.id || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [c1, c2, accent] = palettes[hash % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/>
  <circle cx="520" cy="96" r="120" fill="${accent}" fill-opacity="0.12"/>
  <circle cx="110" cy="340" r="140" fill="${accent}" fill-opacity="0.08"/>
  <rect x="44" y="42" width="168" height="32" rx="16" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.45"/>
  <text x="128" y="63" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${accent}">PLAYFORGE · ${dim}</text>
  <text x="44" y="218" font-family="system-ui,sans-serif" font-size="44" font-weight="800" fill="#ffffff">${title}</text>
  <text x="44" y="262" font-family="system-ui,sans-serif" font-size="18" fill="#d9e7e1" fill-opacity="0.9">Godot Web Template Game</text>
  <text x="44" y="346" font-family="ui-monospace,monospace" font-size="15" fill="${accent}" fill-opacity="0.85">${subtitle}</text>
</svg>\n`;
}

function buildManifest(template, gameId, today) {
  const preset = TEMPLATE_PRESETS[template.id] || {};
  const koTitle = preset.koName || `${template.name} (Forge)`;
  const enTitle = `${template.name} (Forge)`;
  const koSummary = preset.koSummary || template.description || `${template.name} PlayForge 스타터 템플릿 게임입니다.`;
  const enSummary = template.description || `${template.name} PlayForge starter template game.`;
  const fillLocales = (ko, en) => Object.fromEntries(LOCALES.map(loc => [loc, loc === 'ko' ? ko : en]));
  const tags = [...new Set(['forge', ...(preset.tags || [template.dimension === '3d' ? 'action' : 'arcade'])])];
  return {
    schemaVersion: 1,
    id: gameId,
    slug: gameId,
    title: fillLocales(koTitle, enTitle),
    summary: fillLocales(koSummary, enSummary),
    instructions: fillLocales(
      '게임 화면의 조작 안내를 확인한 뒤 키보드·마우스 또는 터치로 플레이하세요.',
      'Check the on-screen controls and play with keyboard, mouse, or touch.'
    ),
    rules: fillLocales(koSummary, enSummary),
    entry: 'index.html',
    version: '1.0.0',
    publishedOn: today,
    updatedOn: today,
    tags,
    controls: ['keyboard', 'mouse', 'touch'],
    viewport: { width: 1280, height: 720, orientation: 'landscape', resize: 'responsive' },
    capabilities: { webgl: true, wasm: true, workers: false, fullscreen: true, pointerLock: false, externalNetwork: [] },
    save: { enabled: true, schemaVersion: 1, maxSlots: 1 },
    media: { cover: 'assets/cover.svg', screenshots: [] },
    integration: 'native-sdk',
    referenceGame: `PlayForge Template (${template.id})`,
    supportedLocales: LOCALES
  };
}

function upsertCatalogEntry(gamesRoot, entry) {
  const catalogFile = path.join(gamesRoot, 'catalog.json');
  const catalog = fs.existsSync(catalogFile)
    ? JSON.parse(fs.readFileSync(catalogFile, 'utf8').replace(/^\uFEFF/, ''))
    : { schemaVersion: 1, defaultLocale: 'ko', supportedLocales: LOCALES, entries: [] };
  const idx = catalog.entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) {
    catalog.entries[idx] = { ...catalog.entries[idx], ...entry };
  } else {
    catalog.entries.push(entry);
  }
  const tmp = `${catalogFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, catalogFile);
}

export function createForgeTemplatePublisher({
  platformRoot,
  rootDir,
  config = {},
  now = Date.now,
  audit = () => {},
  exportTemplate,
  syncAndBuild
} = {}) {
  const forgeRoot = path.join(platformRoot, 'forge');
  const gamesRoot = path.join(platformRoot, 'games');
  const hubRoot = path.join(platformRoot, 'hub');
  const jobs = new Map();
  let activeJobId = null;

  function loadTemplatesMap() {
    const catalogMod = path.join(forgeRoot, 'Tools', 'template-catalog.cjs');
    if (!fs.existsSync(catalogMod)) return {};
    const { loadGameTemplates } = require(catalogMod);
    return loadGameTemplates(forgeRoot);
  }

  function godotStatus() {
    if (exportTemplate) return { available: true, path: 'injected-exporter' };
    try {
      const runtimeMod = path.join(forgeRoot, 'Tools', 'native-runtime.cjs');
      if (!fs.existsSync(runtimeMod)) return { available: false, path: null, error: 'native-runtime.cjs not found' };
      const { findGodot } = require(runtimeMod);
      const bin = findGodot(forgeRoot);
      return { available: Boolean(bin && fs.existsSync(bin)), path: bin || null };
    } catch (error) {
      return { available: false, path: null, error: error.message };
    }
  }

  function gameIdFor(templateId) {
    return `forge-${templateId}`;
  }

  function readGamesCatalogMap() {
    const catalogFile = path.join(gamesRoot, 'catalog.json');
    if (!fs.existsSync(catalogFile)) return new Map();
    try {
      const doc = JSON.parse(fs.readFileSync(catalogFile, 'utf8').replace(/^\uFEFF/, ''));
      return new Map((doc.entries || []).map(e => [e.id, e]));
    } catch {
      return new Map();
    }
  }

  function listTemplates() {
    const templatesMap = loadTemplatesMap();
    const catalogMap = readGamesCatalogMap();
    return Object.values(templatesMap)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(t => {
        const gameId = gameIdFor(t.id);
        const manifestFile = path.join(gamesRoot, gameId, 'game.manifest.json');
        const webIndex = path.join(gamesRoot, gameId, 'Web', 'index.html');
        const distIndex = path.join(hubRoot, 'dist', 'user', 'games', gameId, 'index.html');
        const rootIndex = rootDir ? path.join(rootDir, 'games', gameId, 'index.html') : distIndex;
        const catalogEntry = catalogMap.get(gameId) || null;
        let updatedOn = null;
        if (fs.existsSync(manifestFile)) {
          try { updatedOn = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).updatedOn || null; } catch {}
        }
        const filesReady = fs.existsSync(manifestFile) && fs.existsSync(webIndex);
        return {
          id: t.id,
          gameId,
          name: t.name,
          dimension: t.dimension,
          description: t.description || '',
          assetCount: Array.isArray(t.assetPaths) ? t.assetPaths.length : 0,
          hasShowcase: Boolean(t.showcase),
          filesReady,
          catalogEnabled: catalogEntry ? catalogEntry.enabled === true : null,
          published: Boolean(filesReady && catalogEntry?.enabled === true),
          inHubDist: fs.existsSync(distIndex) || fs.existsSync(rootIndex),
          updatedOn,
          playUrl: `/play/${gameId}/`
        };
      });
  }

  async function defaultExportTemplate(template, outputDir) {
    const { findGodot } = require(path.join(forgeRoot, 'Tools', 'native-runtime.cjs'));
    const { injectPlayHubShell } = require(path.join(forgeRoot, 'Tools', 'build-queue.cjs'));
    const godotBin = findGodot(forgeRoot);
    if (!godotBin || !fs.existsSync(godotBin)) throw new Error('Godot 실행 파일을 찾을 수 없습니다.');
    const srcDir = path.join(forgeRoot, 'Templates', template.id);
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), `playhub-forge-pub-${template.id}-`));
    try {
      copyTemplateSource(srcDir, tmpProject);
      fs.writeFileSync(path.join(tmpProject, 'export_presets.cfg'), WEB_EXPORT_PRESET, 'utf8');
      fs.mkdirSync(outputDir, { recursive: true });
      await spawnAsync(godotBin, ['--headless', '--path', tmpProject, '--editor', '--import', '--quit'], { timeoutMs: 120000 });
      await spawnAsync(godotBin, ['--headless', '--path', tmpProject, '--export-release', 'Web', path.join(outputDir, 'index.html')], { timeoutMs: 180000 });
      for (const reqFile of ['index.html', 'index.wasm', 'index.pck']) {
        if (!fs.existsSync(path.join(outputDir, reqFile))) {
          throw new Error(`Godot Web export missing ${reqFile}`);
        }
      }
      injectPlayHubShell(outputDir);
    } finally {
      fs.rmSync(tmpProject, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    }
  }

  async function defaultSyncAndBuild() {
    const buildScript = path.join(hubRoot, 'tools', 'build.mjs');
    const configPath = path.join(hubRoot, 'config', 'local.json');
    const args = [buildScript, '--webgames', gamesRoot];
    if (fs.existsSync(configPath)) args.push('--config', configPath);
    await spawnAsync(process.execPath, args, { cwd: hubRoot, timeoutMs: 180000 });
  }

  function snapshotJob(job) {
    return job ? structuredClone(job) : null;
  }

  async function runJob(job, templatesToRun, { enableInCatalog, rebuildDist }) {
    const exporter = exportTemplate || defaultExportTemplate;
    const builder = syncAndBuild || defaultSyncAndBuild;
    const today = kstToday(now);
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < templatesToRun.length; i++) {
      const tpl = templatesToRun[i];
      const item = job.items[i];
      const itemStart = now();
      const gameDir = path.join(gamesRoot, item.gameId);
      const stageWeb = path.join(gameDir, `.Web-stage-${process.pid}-${Date.now()}`);
      const targetWeb = path.join(gameDir, 'Web');
      const backupWeb = path.join(gameDir, `.Web-old-${process.pid}-${Date.now()}`);
      try {
        item.status = 'exporting';
        item.step = 'Godot Web 내보내기 중';
        fs.mkdirSync(stageWeb, { recursive: true });
        await exporter(tpl, stageWeb);

        item.status = 'packaging';
        item.step = 'PlayHub 게임 패키지 및 카탈로그 등록 중';
        const assetsDir = path.join(stageWeb, 'assets');
        fs.mkdirSync(assetsDir, { recursive: true });
        if (!fs.existsSync(path.join(assetsDir, 'cover.svg'))) {
          fs.writeFileSync(path.join(assetsDir, 'cover.svg'), buildCoverSvg(tpl, item.gameId), 'utf8');
        }
        if (fs.existsSync(targetWeb)) fs.renameSync(targetWeb, backupWeb);
        try {
          fs.renameSync(stageWeb, targetWeb);
        } catch (err) {
          if (fs.existsSync(backupWeb)) fs.renameSync(backupWeb, targetWeb);
          throw err;
        }
        if (fs.existsSync(backupWeb)) fs.rmSync(backupWeb, { recursive: true, force: true });

        const manifest = buildManifest(tpl, item.gameId, today);
        fs.writeFileSync(path.join(gameDir, 'game.manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        upsertCatalogEntry(gamesRoot, {
          id: item.gameId,
          path: item.gameId,
          enabled: enableInCatalog,
          priority: 70,
          kind: 'imported',
          displayName: `${tpl.name} (Forge)`
        });

        item.status = 'published';
        item.step = '패키지 등록 완료';
        item.durationMs = now() - itemStart;
        succeeded++;
      } catch (error) {
        if (fs.existsSync(stageWeb)) fs.rmSync(stageWeb, { recursive: true, force: true });
        item.status = 'failed';
        item.step = '실패';
        item.error = error?.message || '알 수 없는 오류';
        item.durationMs = now() - itemStart;
        failed++;
      }
      job.summary = { total: templatesToRun.length, succeeded, failed, pending: templatesToRun.length - succeeded - failed };
    }

    if (succeeded > 0 && rebuildDist) {
      job.buildStatus = 'running';
      try {
        await builder({ gamesRoot, hubRoot, config });
        job.buildStatus = 'succeeded';
      } catch (error) {
        job.buildStatus = 'failed';
        job.buildError = error?.message || 'Hub dist 빌드 실패';
      }
    } else {
      job.buildStatus = succeeded > 0 ? 'skipped' : 'not_run';
    }

    job.finishedAt = new Date(now()).toISOString();
    if (job.buildStatus === 'failed') job.status = 'failed';
    else if (failed === 0 && succeeded > 0) job.status = 'completed';
    else if (succeeded > 0 && failed > 0) job.status = 'partial';
    else job.status = 'failed';

    if (activeJobId === job.id) activeJobId = null;
    try {
      audit('forge_templates_batch_publish', job.id, {
        requested: templatesToRun.map(t => t.id),
        succeeded,
        failed,
        buildStatus: job.buildStatus,
        enableInCatalog
      });
    } catch {}
  }

  function startBatchPublish({ templateIds, enableInCatalog = true, rebuildDist = true } = {}) {
    if (activeJobId && jobs.get(activeJobId)?.status === 'running') {
      throw new ApiError(409, 'PUBLISH_JOB_IN_PROGRESS', '이미 진행 중인 Forge 템플릿 일괄 퍼블리시 작업이 있습니다.');
    }
    const templatesMap = loadTemplatesMap();
    const allIds = Object.keys(templatesMap).sort();
    if (!allIds.length) {
      throw new ApiError(404, 'NO_FORGE_TEMPLATES', '등록된 Forge 템플릿이 없습니다.');
    }
    let selectedIds;
    if (templateIds === 'all') {
      selectedIds = allIds;
    } else if (Array.isArray(templateIds) && templateIds.length > 0) {
      selectedIds = [...new Set(templateIds.map(id => String(id || '').trim()))];
      for (const id of selectedIds) {
        if (!TEMPLATE_ID_RE.test(id) || !Object.hasOwn(templatesMap, id)) {
          throw new ApiError(422, 'TEMPLATE_ID_INVALID', `유효하지 않은 템플릿 ID입니다: ${id}`);
        }
      }
    } else {
      throw new ApiError(422, 'TEMPLATE_IDS_REQUIRED', '퍼블리시할 템플릿을 1개 이상 선택해 주세요.');
    }

    const gStatus = godotStatus();
    if (!gStatus.available) {
      throw new ApiError(503, 'GODOT_UNAVAILABLE', 'Godot 실행 파일을 찾을 수 없어 템플릿 Web 빌드를 수행할 수 없습니다.');
    }

    const templatesToRun = selectedIds.map(id => templatesMap[id]);
    const job = {
      id: uid(),
      status: 'running',
      enableInCatalog: enableInCatalog !== false,
      rebuildDist: rebuildDist !== false,
      buildStatus: 'pending',
      buildError: null,
      startedAt: new Date(now()).toISOString(),
      finishedAt: null,
      summary: { total: templatesToRun.length, succeeded: 0, failed: 0, pending: templatesToRun.length },
      items: templatesToRun.map(t => ({
        templateId: t.id,
        gameId: gameIdFor(t.id),
        name: t.name,
        dimension: t.dimension,
        status: 'queued',
        step: '대기 중',
        durationMs: null,
        error: null,
        playUrl: `/play/${gameIdFor(t.id)}/`
      }))
    };

    if (jobs.size >= 20) {
      const oldestKey = jobs.keys().next().value;
      if (oldestKey && oldestKey !== activeJobId) jobs.delete(oldestKey);
    }
    jobs.set(job.id, job);
    activeJobId = job.id;

    setImmediate(() => {
      void runJob(job, templatesToRun, {
        enableInCatalog: job.enableInCatalog,
        rebuildDist: job.rebuildDist
      });
    });

    return snapshotJob(job);
  }

  function getJob(jobId) {
    const job = jobs.get(String(jobId || ''));
    if (!job) throw new ApiError(404, 'PUBLISH_JOB_NOT_FOUND', '해당 퍼블리시 작업을 찾을 수 없습니다.');
    return snapshotJob(job);
  }

  function statusSummary() {
    const recentJobs = [...jobs.values()].reverse().slice(0, 10).map(snapshotJob);
    return {
      godot: godotStatus(),
      templates: listTemplates(),
      activeJob: activeJobId ? snapshotJob(jobs.get(activeJobId)) : null,
      recentJobs
    };
  }

  return {
    listTemplates,
    godotStatus,
    startBatchPublish,
    getJob,
    statusSummary
  };
}
