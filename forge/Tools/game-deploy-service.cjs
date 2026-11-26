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

function measureDirBytes(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) total += measureDirBytes(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  } catch {}
  return total;
}

function calcThroughputMBps(bytes, ms) {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(ms) || ms <= 0) return 0;
  return Number(((bytes / (1024 * 1024)) / Math.max(0.001, ms / 1000)).toFixed(2));
}

function calcPercentile(sortedNums, p) {
  if (!sortedNums.length) return 0;
  const idx = Math.min(sortedNums.length - 1, Math.max(0, Math.ceil((p / 100) * sortedNums.length) - 1));
  return sortedNums[idx];
}

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
    uploadReceiveMs = 0,
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
      enqueuedAtMs: Date.now(),
      uploadReceiveMs: Math.max(0, Number(uploadReceiveMs) || 0),
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
      metrics: null,
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
    const execStartMs = Date.now();
    const queueWaitMs = Math.max(0, execStartMs - (job.enqueuedAtMs || execStartMs));
    const cpuStart = process.cpuUsage();
    let peakRssBytes = process.memoryUsage().rss;
    const sampleMem = () => {
      const m = process.memoryUsage();
      if (m.rss > peakRssBytes) peakRssBytes = m.rss;
      return m;
    };

    let extractMs = 0;
    let packageMs = 0;
    let packageStages = null;
    let farmUploadMs = 0;
    let farmTransferBytes = 0;
    let extractedBytes = 0;
    let dedupSavedBytes = 0;
    let expandedBytes = 0;
    let hubServerMs = 0;

    job.status = 'running';
    job.startedAt = new Date(execStartMs).toISOString();
    job.step = '프로젝트 ZIP 검증 및 압축 해제 중…';

    try {
      fs.mkdirSync(jobDir, { recursive: true });
      const tExtract = Date.now();
      const extracted = extractProjectZip(sourceZip, projectDir);
      extractMs = Date.now() - tExtract;
      extractedBytes = extracted.expandedBytes || 0;
      sampleMem();

      job.sourceZipSha256 = extracted.sourceZipSha256;
      job.sourceFileCount = extracted.fileCount;
      if (extracted.metadata?.publishDefaults?.gameMetadata) {
        const gm = extracted.metadata.publishDefaults.gameMetadata;
        if (!job.description && gm.summary?.ko) job.description = gm.summary.ko;
        if (!job.instructions && gm.instructions?.ko) job.instructions = gm.instructions.ko;
      }

      const tPkg = Date.now();
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
          sampleMem();
        },
      });
      packageMs = Date.now() - tPkg;
      packageStages = packaged.metrics?.timings || null;
      dedupSavedBytes = packaged.metrics?.sizes?.dedupSavedBytes || 0;
      expandedBytes = packaged.expandedBytes || 0;
      sampleMem();

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

        farmTransferBytes = packaged.bundleZipBuffer.length;
        const tFarm = Date.now();
        const res = await this.fetchImpl(targetEndpoint, {
          method: 'POST',
          headers,
          body: packaged.bundleZipBuffer,
        });
        farmUploadMs = Date.now() - tFarm;
        sampleMem();

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || data?.error?.code || data?.error || `대상 팜 배포 실패 (HTTP ${res.status})`;
          throw Object.assign(new Error(msg), { status: res.status });
        }
        hubServerMs = Number(data?.metrics?.totalMs) || 0;
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
      const finishedMs = Date.now();
      const totalMs = (job.uploadReceiveMs || 0) + Math.max(0, finishedMs - execStartMs);
      const cpuDelta = process.cpuUsage(cpuStart);
      const memEnd = sampleMem();
      const workspaceDiskBytes = measureDirBytes(jobDir);

      job.finishedAt = new Date(finishedMs).toISOString();
      job.metrics = {
        transfer: {
          uploadBytes: job.sourceZipBytes,
          uploadThroughputMBps: calcThroughputMBps(job.sourceZipBytes, job.uploadReceiveMs),
          extractedBytes,
          sourceFileCount: job.sourceFileCount || 0,
          bundleBytes: job.bundleBytes || 0,
          expandedBytes,
          dedupSavedBytes,
          farmTransferBytes,
          farmThroughputMBps: calcThroughputMBps(farmTransferBytes, farmUploadMs),
          totalTransferBytes: job.sourceZipBytes + farmTransferBytes,
        },
        timing: {
          uploadReceiveMs: job.uploadReceiveMs || 0,
          queueWaitMs,
          extractMs,
          packageMs,
          packageStages,
          farmUploadMs,
          hubServerMs,
          totalMs,
        },
        usage: {
          cpuUserMs: Math.round(cpuDelta.user / 1000),
          cpuSystemMs: Math.round(cpuDelta.system / 1000),
          cpuTotalMs: Math.round((cpuDelta.user + cpuDelta.system) / 1000),
          rssMb: Number((memEnd.rss / (1024 * 1024)).toFixed(2)),
          peakRssMb: Number((peakRssBytes / (1024 * 1024)).toFixed(2)),
          heapUsedMb: Number((memEnd.heapUsed / (1024 * 1024)).toFixed(2)),
          workspaceDiskBytes,
        },
      };

      try {
        fs.mkdirSync(jobDir, { recursive: true });
        fs.writeFileSync(path.join(jobDir, 'result.json'), JSON.stringify(job, null, 2), 'utf8');
        this.appendStatRecord(job);
      } catch {}
    }
  }

  statsFilePath() {
    return path.join(this.directory, 'deploy-stats.jsonl');
  }

  appendStatRecord(job) {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const rec = {
        id: job.id,
        ownerKey: job.ownerKey || null,
        gameSlug: job.gameSlug,
        title: job.title,
        sourceMode: job.sourceMode,
        status: job.status,
        visibility: job.visibility,
        deployMode: job.deployMode,
        targetPlatforms: job.targetPlatforms || [],
        platformSizes: Object.fromEntries(
          Object.entries(job.platforms || {}).map(([k, v]) => [k, Number(v?.pckBytes) || 0])
        ),
        farmId: job.targetFarm?.id || (job.pushToFarm ? 'default' : 'local-only'),
        farmLabel: job.targetFarm?.label || '로컬 패키징 전용',
        farmBaseUrl: job.targetFarm?.baseUrl || '',
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        metrics: job.metrics,
        error: job.error || null,
      };
      fs.appendFileSync(this.statsFilePath(), JSON.stringify(rec) + '\n', 'utf8');
    } catch {}
  }

  readStatRecords(ownerKey = null) {
    const file = this.statsFilePath();
    if (!fs.existsSync(file)) return [];
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
      const out = [];
      for (const line of lines.slice(-500)) {
        try {
          const rec = JSON.parse(line);
          if (!ownerKey || !rec.ownerKey || rec.ownerKey === ownerKey) out.push(rec);
        } catch {}
      }
      return out;
    } catch {
      return [];
    }
  }

  getStats(ownerKey = null) {
    const records = this.readStatRecords(ownerKey);
    const totalDeploys = records.length;
    let succeeded = 0;
    let failed = 0;
    let totalUploadBytes = 0;
    let totalFarmTransferBytes = 0;
    let totalDedupSavedBytes = 0;
    let totalBundleBytes = 0;
    let bundleCount = 0;
    let totalCpuMs = 0;
    let peakRssMb = 0;
    let totalWorkspaceDiskBytes = 0;
    const totalMsList = [];
    const packageMsList = [];
    const farmUploadMsList = [];
    const byPlatform = {};
    const byFarm = {};

    for (const r of records) {
      if (r.status === 'succeeded') succeeded += 1;
      else failed += 1;
      const tr = r.metrics?.transfer || {};
      const tm = r.metrics?.timing || {};
      const us = r.metrics?.usage || {};

      totalUploadBytes += Number(tr.uploadBytes) || 0;
      totalFarmTransferBytes += Number(tr.farmTransferBytes) || 0;
      totalDedupSavedBytes += Number(tr.dedupSavedBytes) || 0;
      if (Number(tr.bundleBytes) > 0) {
        totalBundleBytes += Number(tr.bundleBytes);
        bundleCount += 1;
      }
      if (Number.isFinite(tm.totalMs)) totalMsList.push(Number(tm.totalMs));
      if (Number.isFinite(tm.packageMs) && tm.packageMs > 0) packageMsList.push(Number(tm.packageMs));
      if (Number.isFinite(tm.farmUploadMs) && tm.farmUploadMs > 0) farmUploadMsList.push(Number(tm.farmUploadMs));

      totalCpuMs += Number(us.cpuTotalMs) || 0;
      if (Number(us.peakRssMb) > peakRssMb) peakRssMb = Number(us.peakRssMb);
      totalWorkspaceDiskBytes += Number(us.workspaceDiskBytes) || 0;

      for (const [plat, bytes] of Object.entries(r.platformSizes || {})) {
        const entry = byPlatform[plat] || { count: 0, totalBytes: 0, avgBytes: 0 };
        entry.count += 1;
        entry.totalBytes += Number(bytes) || 0;
        entry.avgBytes = Math.round(entry.totalBytes / entry.count);
        byPlatform[plat] = entry;
      }

      const fid = r.farmId || 'local-only';
      const f = byFarm[fid] || {
        farmId: fid,
        label: r.farmLabel || fid,
        baseUrl: r.farmBaseUrl || '',
        count: 0,
        succeeded: 0,
        failed: 0,
        totalTransferBytes: 0,
        _totalMsSum: 0,
        avgTotalMs: 0,
      };
      f.count += 1;
      if (r.status === 'succeeded') f.succeeded += 1;
      else f.failed += 1;
      f.totalTransferBytes += Number(tr.totalTransferBytes) || 0;
      f._totalMsSum += Number(tm.totalMs) || 0;
      f.avgTotalMs = Math.round(f._totalMsSum / f.count);
      byFarm[fid] = f;
    }

    for (const f of Object.values(byFarm)) delete f._totalMsSum;
    const sortedTotalMs = [...totalMsList].sort((a, b) => a - b);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

    return {
      totalDeploys,
      succeeded,
      failed,
      successRate: totalDeploys ? Number(((succeeded / totalDeploys) * 100).toFixed(1)) : 0,
      transfer: {
        totalUploadBytes,
        totalFarmTransferBytes,
        totalBytes: totalUploadBytes + totalFarmTransferBytes,
        totalDedupSavedBytes,
        avgBundleBytes: bundleCount ? Math.round(totalBundleBytes / bundleCount) : 0,
      },
      timing: {
        avgTotalMs: avg(totalMsList),
        p95TotalMs: calcPercentile(sortedTotalMs, 95),
        maxTotalMs: sortedTotalMs.length ? sortedTotalMs[sortedTotalMs.length - 1] : 0,
        avgPackageMs: avg(packageMsList),
        avgFarmUploadMs: avg(farmUploadMsList),
      },
      usage: {
        totalCpuMs,
        peakRssMb: Number(peakRssMb.toFixed(2)),
        totalWorkspaceDiskBytes,
        avgWorkspaceDiskBytes: totalDeploys ? Math.round(totalWorkspaceDiskBytes / totalDeploys) : 0,
      },
      byPlatform,
      byFarm,
      recent: records.slice(-20).reverse().map((r) => ({
        id: r.id,
        gameSlug: r.gameSlug,
        title: r.title,
        status: r.status,
        farmLabel: r.farmLabel,
        platforms: r.targetPlatforms,
        createdAt: r.createdAt,
        totalMs: r.metrics?.timing?.totalMs || 0,
        uploadBytes: r.metrics?.transfer?.uploadBytes || 0,
        bundleBytes: r.metrics?.transfer?.bundleBytes || 0,
        farmTransferBytes: r.metrics?.transfer?.farmTransferBytes || 0,
        dedupSavedBytes: r.metrics?.transfer?.dedupSavedBytes || 0,
        cpuTotalMs: r.metrics?.usage?.cpuTotalMs || 0,
        peakRssMb: r.metrics?.usage?.peakRssMb || 0,
      })),
    };
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
