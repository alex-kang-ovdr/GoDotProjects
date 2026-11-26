'use strict';

/**
 * PlayForge Game-Only Deploy Service
 *
 * Orchestrates the end-to-end game-only deploy flow from Web Forge:
 *   1. Receives either an uploaded Godot Project .zip OR packs a Forge project snapshot into a .zip.
 *   2. Extracts & validates the project .zip and runs server-side per-platform packaging
 *      (web, android, desktop, ios) via project-zip-packager.cjs.
 *   3. In Dev/Debug/Test stages, resolves the user-selected Target Farm (fail-closed locked in Live).
 *   4. Uploads ONLY the packaged game bundle to `<targetFarm>/api/creator/publications/deploy-game`
 *      so only that game is deployed without redeploying Hub/Forge/Store platform servers.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipFiles } = require('./export-godot-project.cjs');
const {
  SUPPORTED_PLATFORMS,
  DEFAULT_PLATFORMS,
  MAX_PROJECT_ZIP_BYTES,
  normalizePlatforms,
  extractProjectZip,
  packageProjectForPlatforms,
} = require('./project-zip-packager.cjs');
const {
  normalizeStage,
  isFarmSelectorAllowed,
  buildSelectableFarms,
  resolveTargetFarm,
  probeFarmHealth,
} = require('./farm-targets.cjs');

const MAX_JOBS_RETAINED = 30;
const MAX_PENDING_JOBS = 4;

function slugifyGame(raw, fallback = 'forge-game') {
  const clean = String(raw || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
  if (!clean || !/^[a-z]/.test(clean)) return fallback;
  return clean;
}

function buildSnapshotProjectZip(project) {
  if (!project || !project.files || typeof project.files !== 'object') {
    throw Object.assign(new Error('유효한 Forge 프로젝트 스냅샷이 필요합니다.'), { code: 'INVALID_PROJECT_SNAPSHOT', status: 400 });
  }
  const entries = [];
  for (const [relPath, content] of Object.entries(project.files)) {
    if (!relPath || typeof relPath !== 'string') continue;
    entries.push([relPath, Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8')]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b, 'en'));
  return zipFiles(entries);
}

class GameDeployService {
  constructor({
    forgeRoot,
    directory,
    buildMode = 'dev',
    defaultFarmUrl = '',
    extraFarms = [],
    devDeployToken = '',
    exporter = null,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.forgeRoot = forgeRoot;
    this.directory = directory || path.join(forgeRoot, 'Saved', 'GameDeploys');
    this.buildMode = normalizeStage(buildMode);
    this.defaultFarmUrl = String(defaultFarmUrl || '').trim().replace(/\/+$/, '');
    this.extraFarms = Array.isArray(extraFarms) ? extraFarms : [];
    this.devDeployToken = String(devDeployToken || '').trim();
    this.exporter = exporter;
    this.fetchImpl = fetchImpl;

    this.jobs = new Map();
    this.pending = [];
    this.running = false;
    this.closed = false;
  }

  getConfig(requestOrigin = '') {
    const defaultUrl = this.defaultFarmUrl || String(requestOrigin || '').trim().replace(/\/+$/, '');
    return {
      ok: true,
      buildMode: this.buildMode,
      farmSelectorAllowed: isFarmSelectorAllowed(this.buildMode),
      defaultFarmUrl: defaultUrl,
      presetFarms: buildSelectableFarms({
        buildStage: this.buildMode,
        defaultBaseUrl: defaultUrl,
        extraFarms: this.extraFarms,
      }),
      supportedPlatforms: [...SUPPORTED_PLATFORMS],
      defaultPlatforms: [...DEFAULT_PLATFORMS],
      maxZipBytes: MAX_PROJECT_ZIP_BYTES,
    };
  }

  async probeFarm({ farmId = '', customUrl = '', requestOrigin = '' } = {}) {
    if (!isFarmSelectorAllowed(this.buildMode)) {
      throw Object.assign(new Error('Live 환경에서는 대상 팜 조회가 비활성화됩니다.'), {
        code: 'FARM_SELECTOR_LOCKED',
        status: 403,
      });
    }
    const target = resolveTargetFarm({
      buildStage: this.buildMode,
      defaultBaseUrl: this.defaultFarmUrl || requestOrigin,
      farmId,
      customUrl,
    });
    const health = await probeFarmHealth(target.baseUrl, { fetchImpl: this.fetchImpl });
    return { ok: true, farm: target, health };
  }

  enqueue({
    ownerKey = null,
    projectId = null,
    projectSnapshot = null,
    zipBuffer = null,
    uploadFilename = '',
    platforms = DEFAULT_PLATFORMS,
    targetFarmId = 'default',
    customFarmUrl = '',
    requestOrigin = '',
    pushToFarm = true,
    forwardHeaders = {},
    gameSlug = '',
    title = '',
    titleEn = '',
    description = '',
    instructions = '',
    visibility = 'public',
    deployMode = 'singleplay',
    tags = ['arcade'],
    controls = ['keyboard', 'mouse', 'touch'],
    orientation = 'landscape',
    gameMetadata = null,
  } = {}) {
    if (this.closed) throw Object.assign(new Error('Deploy service is closed'), { status: 503 });
    if (this.pending.length >= MAX_PENDING_JOBS) {
      throw Object.assign(new Error('게임 배포 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.'), { status: 429 });
    }

    const sourceZip = Buffer.isBuffer(zipBuffer) && zipBuffer.length > 0
      ? zipBuffer
      : buildSnapshotProjectZip(projectSnapshot);
    if (sourceZip.length > MAX_PROJECT_ZIP_BYTES) {
      throw Object.assign(new Error('프로젝트 ZIP 용량이 제한(64MB)을 초과했습니다.'), { code: 'PROJECT_ZIP_TOO_LARGE', status: 413 });
    }

    const targetFarm = pushToFarm
      ? resolveTargetFarm({
          buildStage: this.buildMode,
          defaultBaseUrl: this.defaultFarmUrl || requestOrigin,
          farmId: targetFarmId,
          customUrl: customFarmUrl,
        })
      : null;

    const cleanPlatforms = normalizePlatforms(platforms);
    const id = crypto.randomBytes(8).toString('hex');
    const releaseId = crypto.randomBytes(12).toString('hex');
    const normalizedSlug = slugifyGame(
      gameSlug || gameMetadata?.slug || projectSnapshot?.name || uploadFilename.replace(/\.zip$/i, ''),
      `game-${id.slice(0, 8)}`
    );

    if (this.jobs.size >= MAX_JOBS_RETAINED) {
      for (const [k, v] of this.jobs) {
        if (['succeeded', 'failed'].includes(v.status)) {
          this.jobs.delete(k);
          break;
        }
      }
    }

    const job = {
      id,
      releaseId,
      ownerKey,
      projectId: projectId || projectSnapshot?.id || null,
      sourceMode: Buffer.isBuffer(zipBuffer) && zipBuffer.length > 0 ? 'zip-upload' : 'forge-project-zip',
      uploadFilename: uploadFilename || (projectSnapshot?.name ? `${projectSnapshot.name}.zip` : 'project.zip'),
      sourceZipBytes: sourceZip.length,
      gameSlug: normalizedSlug,
      title: String(title || gameMetadata?.title?.ko || projectSnapshot?.name || normalizedSlug).trim(),
      titleEn: String(titleEn || gameMetadata?.title?.en || title || normalizedSlug).trim(),
      description: String(description || gameMetadata?.summary?.ko || '').trim(),
      instructions: String(instructions || gameMetadata?.instructions?.ko || '').trim(),
      visibility: ['public', 'unlisted', 'private'].includes(visibility) ? visibility : 'public',
      deployMode: ['singleplay', 'mo', 'mmo'].includes(deployMode) ? deployMode : 'singleplay',
      tags: Array.isArray(tags) && tags.length ? tags : ['arcade'],
      controls: Array.isArray(controls) && controls.length ? controls : ['keyboard', 'mouse', 'touch'],
      orientation: ['landscape', 'portrait', 'any'].includes(orientation) ? orientation : 'landscape',
      targetPlatforms: cleanPlatforms,
      targetFarm,
      pushToFarm: Boolean(pushToFarm && targetFarm?.baseUrl),
      status: 'queued',
      step: '대기 중',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      platforms: {},
      platformManifest: null,
      bundleSha256: null,
      bundleBytes: 0,
      deployResult: null,
      files: [],
      log: '',
      error: null,
    };

    this.jobs.set(id, job);
    this.pending.push({
      job,
      sourceZip,
      gameMetadata,
      forwardHeaders: {
        cookie: typeof forwardHeaders.cookie === 'string' ? forwardHeaders.cookie : '',
        csrfToken: typeof forwardHeaders.csrfToken === 'string' ? forwardHeaders.csrfToken : '',
        devDeployToken: typeof forwardHeaders.devDeployToken === 'string' && forwardHeaders.devDeployToken
          ? forwardHeaders.devDeployToken
          : this.devDeployToken,
      },
    });
    setImmediate(() => this.pump());
    return this.snapshot(job);
  }

  snapshot(job) {
    if (!job) return null;
    const copy = structuredClone(job);
    delete copy.ownerKey;
    return copy;
  }

  get(id, ownerKey = null) {
    if (!/^[a-f0-9]{16}$/.test(String(id || ''))) return null;
    let job = this.jobs.get(id);
    if (!job) {
      try {
        job = JSON.parse(fs.readFileSync(path.join(this.directory, id, 'result.json'), 'utf8'));
      } catch {
        return null;
      }
    }
    if (ownerKey && job.ownerKey && job.ownerKey !== ownerKey) return null;
    return this.snapshot(job);
  }

  list(ownerKey = null) {
    return [...this.jobs.values()]
      .filter((j) => !ownerKey || !j.ownerKey || j.ownerKey === ownerKey)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 15)
      .map((j) => this.snapshot(j));
  }

  resolveFile(id, rawRelPath, ownerKey = null) {
    const job = this.get(id, ownerKey);
    if (!job || job.status !== 'succeeded') return null;
    const cleaned = String(rawRelPath || '').replace(/^\/+/, '');
    if (!cleaned || cleaned.includes('..') || /[\\:\x00-\x1f]/.test(cleaned)) return null;
    const outRoot = path.resolve(this.directory, id, 'output');
    const candidate = path.resolve(outRoot, cleaned);
    if (!candidate.startsWith(outRoot + path.sep)) return null;
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
    return candidate;
  }

  async pump() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (this.pending.length && !this.closed) {
        const task = this.pending.shift();
        await this.executeTask(task);
      }
    } finally {
      this.running = false;
    }
  }

  async executeTask({ job, sourceZip, gameMetadata, forwardHeaders }) {
    const jobDir = path.join(this.directory, job.id);
    const projectDir = path.join(jobDir, 'project');
    const outputDir = path.join(jobDir, 'output');
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.step = '프로젝트 ZIP 검증 및 압축 해제 중…';

    try {
      fs.mkdirSync(jobDir, { recursive: true });
      const extracted = extractProjectZip(sourceZip, projectDir);
      job.sourceZipSha256 = extracted.sourceZipSha256;
      job.sourceFileCount = extracted.fileCount;
      if (extracted.metadata?.publishDefaults?.gameMetadata) {
        const gm = extracted.metadata.publishDefaults.gameMetadata;
        if (!job.description && gm.summary?.ko) job.description = gm.summary.ko;
        if (!job.instructions && gm.instructions?.ko) job.instructions = gm.instructions.ko;
      }

      const packaged = await packageProjectForPlatforms({
        forgeRoot: this.forgeRoot,
        projectDir,
        outputDir,
        platforms: job.targetPlatforms,
        sourceZipSha256: extracted.sourceZipSha256,
        controls: job.controls,
        exporter: this.exporter,
        onProgress: (_stage, msg) => {
          job.step = msg;
        },
      });

      job.platforms = packaged.platforms;
      job.platformManifest = packaged.platformManifest;
      job.bundleSha256 = packaged.bundleSha256;
      job.bundleBytes = packaged.bundleBytes;
      job.log = packaged.log || '';
      job.files = [
        'PlayHub-GameDeploy.zip',
        'platform-packages.json',
        'index.html',
        'index.pck',
        ...Object.values(packaged.platforms)
          .map((p) => p.pckFile)
          .filter((f) => f && f !== 'index.pck'),
      ];

      if (job.pushToFarm && job.targetFarm?.baseUrl) {
        job.step = `대상 팜(${job.targetFarm.label})으로 게임 단독 배포 중…`;
        const deployPayloadMeta = {
          projectId: job.projectId || crypto.createHash('sha256').update(`zip:${job.gameSlug}`).digest('hex').slice(0, 24),
          releaseId: job.releaseId,
          gameSlug: job.gameSlug,
          title: job.title,
          description: job.description || `${job.title} — PlayForge 게임 단독 배포`,
          visibility: job.visibility,
          deployMode: job.deployMode,
          bundleSha256: packaged.bundleSha256,
          platforms: job.targetPlatforms,
          gameMetadata: gameMetadata || {
            slug: job.gameSlug,
            title: { ko: job.title, en: job.titleEn || job.title },
            summary: { ko: job.description || `${job.title} — PlayForge 웹 게임`, en: job.description || `${job.title}` },
            instructions: { ko: job.instructions || '키보드·마우스 또는 터치로 플레이하세요.', en: job.instructions || 'Play with keyboard, mouse, or touch.' },
            tags: job.tags,
            controls: job.controls,
            viewport: { width: 1280, height: 720, orientation: job.orientation, resize: 'fit' },
          },
        };

        const targetEndpoint = `${job.targetFarm.baseUrl.replace(/\/+$/, '')}/api/creator/publications/deploy-game`;
        const targetOrigin = new URL(targetEndpoint).origin;
        const headers = {
          Origin: targetOrigin,
          'Content-Type': 'application/zip',
          'X-PlayHub-Deploy-Meta': Buffer.from(JSON.stringify(deployPayloadMeta), 'utf8').toString('base64'),
          'X-PlayHub-Bundle-Sha256': packaged.bundleSha256,
        };
        if (forwardHeaders.cookie) headers.Cookie = forwardHeaders.cookie;
        if (forwardHeaders.csrfToken) headers['X-CSRF-Token'] = forwardHeaders.csrfToken;
        if (forwardHeaders.devDeployToken) headers['X-PlayHub-Dev-Deploy-Token'] = forwardHeaders.devDeployToken;

        const res = await this.fetchImpl(targetEndpoint, {
          method: 'POST',
          headers,
          body: packaged.bundleZipBuffer,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || data?.error?.code || data?.error || `대상 팜 배포 실패 (HTTP ${res.status})`;
          throw Object.assign(new Error(msg), { status: res.status });
        }
        job.deployResult = {
          ...data,
          farmBaseUrl: job.targetFarm.baseUrl,
          farmLabel: job.targetFarm.label,
          fullPlayUrl: data.entryUrl && data.entryUrl.startsWith('/')
            ? `${job.targetFarm.baseUrl.replace(/\/+$/, '')}${data.entryUrl}`
            : (data.entryUrl || null),
        };
        job.step = `게임 단독 배포 완료 (${job.targetFarm.label})`;
      } else {
        job.step = '플랫폼별 패키징 완료 (로컬 산출물 준비됨)';
      }

      job.status = 'succeeded';
    } catch (err) {
      job.status = 'failed';
      job.error = err?.message || '게임 배포 처리에 실패했습니다.';
      if (err?.log) job.log = (job.log ? `${job.log}\n` : '') + err.log;
      job.step = '배포 실패';
    } finally {
      job.finishedAt = new Date().toISOString();
      try {
        fs.mkdirSync(jobDir, { recursive: true });
        fs.writeFileSync(path.join(jobDir, 'result.json'), JSON.stringify(job, null, 2), 'utf8');
      } catch {}
    }
  }

  close() {
    this.closed = true;
    this.pending = [];
  }
}

module.exports = {
  GameDeployService,
  buildSnapshotProjectZip,
  slugifyGame,
};
