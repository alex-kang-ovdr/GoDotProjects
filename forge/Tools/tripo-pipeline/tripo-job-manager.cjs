'use strict';

/**
 * PlayForge Tripo3D Pipeline Orchestrator & REST Handler (/api/tripo/*)
 *
 * Experimental PoC (`Forge-Tripo` branch):
 *  - Supports Live Tripo3D API v3 (https://openapi.tripo3d.ai/v3) AND Zero-Credit Simulation Mode
 *  - Text-to-3D, Image-to-3D, Multiview-to-3D, Auto-Rig, Animation Retarget, Game Optimize/Convert
 *  - Immediately caches expiring Tripo signed .glb + preview URLs locally with full glTF 2.0 validation
 *  - Keeps API keys strictly server-side (localhost-only config mutation, masked in all responses)
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateGlbBuffer } = require('./glb-validator.cjs');
const {
  TRIPO_REGIONS,
  TRIPO_MODELS,
  DEFAULT_MODEL_VERSION,
  maskApiKey,
  validateRemoteUrl,
  TripoV3Client,
} = require('./tripo-client.cjs');
const { TripoV3Simulator } = require('./tripo-simulator.cjs');

const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024; // Allow base64 image uploads up to ~10MB raw
const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_JOBS_RETAINED = 80;
const MAX_WIRE_TRACES = 60;
const DEFAULT_POLL_INTERVAL_LIVE_MS = 2200;
const DEFAULT_POLL_INTERVAL_SIM_MS = 380;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const SUPPORTED_TEXTURE_QUALITIES = Object.freeze(['fast', 'standard', 'detailed', 'extreme']);
const SUPPORTED_RIG_TYPES = Object.freeze(['biped', 'quadruped', 'hexapod', 'avian', 'serpentine']);
const SUPPORTED_ANIMATION_PRESETS = Object.freeze([
  { id: 'preset:idle', label: '대기 (Idle)' },
  { id: 'preset:walk', label: '걷기 (Walk)' },
  { id: 'preset:run', label: '달리기 (Run)' },
  { id: 'preset:jump', label: '점프 (Jump)' },
  { id: 'preset:slash', label: '검 베기 (Slash)' },
  { id: 'preset:dance', label: '승리 춤 (Dance)' },
]);
const SUPPORTED_CONVERT_FORMATS = Object.freeze(['GLTF', 'FBX', 'OBJ', 'STL', 'USDZ']);

const PROMPT_PRESETS = Object.freeze([
  {
    id: 'knight',
    label: '판타지 기사',
    prompt: 'Stylized fantasy paladin knight in blue and gold armor with glowing crest, game-ready character, clean T-pose, PBR textures',
    negativePrompt: 'blurry, floating parts, broken limbs, low contrast',
  },
  {
    id: 'mech',
    label: '사이버 메카',
    prompt: 'Sci-fi tactical combat mech robot with crimson armor plates, glowing cyan arc core, hard surface PBR details',
    negativePrompt: 'organic, melting, blurry, asymmetrical noise',
  },
  {
    id: 'chest',
    label: '황금 보물상자',
    prompt: 'Medieval wooden treasure chest reinforced with gilded iron bands and glowing sapphire lock, stylized RPG prop, PBR',
    negativePrompt: 'flat shading, missing bottom, broken geometry',
  },
  {
    id: 'sword',
    label: '크리스탈 대검',
    prompt: 'Arcane glowing crystal greatsword with ornate golden crossguard and leather grip, stylized fantasy weapon, game asset',
    negativePrompt: 'bent blade, low quality, duplicate hilts',
  },
  {
    id: 'vehicle',
    label: 'SF 레이싱 카',
    prompt: 'Futuristic cyberpunk hover racing car with sleek matte dark chassis and neon magenta trim, stylized game vehicle',
    negativePrompt: 'deformed wheels, asymmetric body, messy polygons',
  },
  {
    id: 'tower',
    label: '중세 감시탑',
    prompt: 'Stylized stone medieval watchtower with pointed timber roof, wooden door, and glowing lantern window, modular game environment prop',
    negativePrompt: 'floating stones, blurry roof, collapsed walls',
  },
]);

function isValidId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{6,64}$/i.test(value);
}

function sanitizeSlug(value, fallback = 'tripo_asset') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 52);
  return cleaned || fallback;
}

function isLoopbackRequest(req) {
  if (!req) return false;
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) {
    return false;
  }
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: '.png' };
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  // WebP
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return Promise.reject(Object.assign(new Error('Content-Type: application/json is required'), { status: 415 }));
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.reject(Object.assign(new Error('Request payload too large'), { status: 413 }));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      total += chunk.length;
      if (total > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Request payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.once('end', () => {
      if (failed) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        const parsed = text ? JSON.parse(text) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('JSON body must be an object'), { status: 400 }));
        } else {
          resolve(parsed);
        }
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.once('error', reject);
  });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Job cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    timer.unref();
    function onAbort() {
      clearTimeout(timer);
      reject(new Error('Job cancelled'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class TripoJobManager {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.env = options.env || process.env;
    this.storageDir = path.resolve(options.storageDir || path.join(this.root, 'Saved', 'Tripo'));
    this.assetsDir = path.join(this.storageDir, 'assets');
    this.uploadsDir = path.join(this.storageDir, 'uploads');
    this.credentialsPath = path.join(this.storageDir, '.credentials.json');
    fs.mkdirSync(this.assetsDir, { recursive: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });

    this.pollIntervalLiveMs = Math.max(50, Number(options.pollIntervalLiveMs) || DEFAULT_POLL_INTERVAL_LIVE_MS);
    this.pollIntervalSimMs = Math.max(10, Number(options.pollIntervalSimMs) || DEFAULT_POLL_INTERVAL_SIM_MS);
    this.jobTimeoutMs = Math.max(5000, Number(options.jobTimeoutMs) || DEFAULT_JOB_TIMEOUT_MS);
    this.allowLoopbackMock = Boolean(options.allowLoopbackMock);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;

    this.wireTraces = [];
    this.jobs = new Map();
    this.activeControllers = new Map();
    this.uploadsIndex = new Map();
    this.closed = false;

    const savedCreds = this._loadLocalCredentials();
    const envApiKey = String(options.apiKey ?? this.env.PLAYFORGE_TRIPO_API_KEY ?? this.env.TRIPO_API_KEY ?? '').trim();
    this.apiKey = envApiKey || savedCreds.apiKey || '';
    this.region = options.region || this.env.PLAYFORGE_TRIPO_REGION || savedCreds.region || 'global';
    this.customBaseUrl = String(options.baseUrl ?? this.env.PLAYFORGE_TRIPO_BASE_URL ?? savedCreds.baseUrl ?? '').trim();
    this.mode = options.mode || (this.apiKey ? 'live' : 'simulation');

    this.simulator = options.simulator || new TripoV3Simulator({
      initialBalance: 500,
      pollsToFinish: options.simPollsToFinish || 3,
      onTrace: trace => this._recordTrace(trace),
    });

    this._loadExistingUploads();
  }

  _loadLocalCredentials() {
    try {
      if (!fs.existsSync(this.credentialsPath)) return {};
      const parsed = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  _saveLocalCredentials() {
    try {
      const payload = {
        apiKey: this.apiKey,
        region: this.region,
        baseUrl: this.customBaseUrl,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.credentialsPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Ignore write failures in read-only environments
    }
  }

  _loadExistingUploads() {
    try {
      const entries = fs.readdirSync(this.uploadsDir);
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(this.uploadsDir, name), 'utf8'));
          if (meta?.uploadId && fs.existsSync(path.join(this.uploadsDir, meta.fileName))) {
            this.uploadsIndex.set(meta.uploadId, meta);
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  _recordTrace(trace) {
    this.wireTraces.unshift(trace);
    if (this.wireTraces.length > MAX_WIRE_TRACES) {
      this.wireTraces.length = MAX_WIRE_TRACES;
    }
  }

  _getEffectiveBaseUrl() {
    if (this.customBaseUrl) return this.customBaseUrl;
    return TRIPO_REGIONS[this.region] || TRIPO_REGIONS.global;
  }

  _getLiveClient() {
    return new TripoV3Client({
      apiKey: this.apiKey,
      region: this.region,
      baseUrl: this._getEffectiveBaseUrl(),
      allowLoopbackMock: this.allowLoopbackMock,
      fetchImpl: this.fetchImpl,
      onTrace: trace => this._recordTrace({ mode: 'live', ...trace }),
    });
  }

  _getActiveBackend(requestedMode = null) {
    const mode = requestedMode === 'live' || requestedMode === 'simulation' ? requestedMode : this.mode;
    if (mode === 'live') {
      return { mode: 'live', client: this._getLiveClient() };
    }
    return { mode: 'simulation', client: this.simulator };
  }

  getConfigSummary() {
    return {
      mode: this.mode,
      hasApiKey: Boolean(this.apiKey),
      apiKeyMasked: maskApiKey(this.apiKey),
      region: this.region,
      baseUrl: this._getEffectiveBaseUrl(),
      isCustomBaseUrl: Boolean(this.customBaseUrl),
      apiVersion: 'v3',
    };
  }

  updateConfig(input = {}) {
    if (typeof input.apiKey === 'string') {
      const trimmed = input.apiKey.trim();
      if (trimmed.length > 256) {
        throw Object.assign(new Error('API 키 길이가 너무 깁니다.'), { status: 400 });
      }
      this.apiKey = trimmed;
    }
    if (input.clearApiKey === true) {
      this.apiKey = '';
      this.mode = 'simulation';
    }
    if (input.region === 'global' || input.region === 'cn') {
      this.region = input.region;
    }
    if (typeof input.baseUrl === 'string') {
      const nextUrl = input.baseUrl.trim().replace(/\/+$/, '');
      if (nextUrl) {
        validateRemoteUrl(nextUrl, {
          allowLoopbackMock: this.allowLoopbackMock,
          allowedOrigin: (() => { try { return new URL(nextUrl).origin; } catch { return null; } })(),
        });
      }
      this.customBaseUrl = nextUrl;
    }
    if (input.mode === 'live' || input.mode === 'simulation') {
      if (input.mode === 'live' && !this.apiKey) {
        throw Object.assign(new Error('Live 모드로 전환하려면 먼저 Tripo API 키(tsk_...)를 설정하세요.'), { status: 400 });
      }
      this.mode = input.mode;
    } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      this.mode = 'live';
    }
    this._saveLocalCredentials();
    return this.getConfigSummary();
  }

  async getBalance(requestedMode = null) {
    const { mode, client } = this._getActiveBackend(requestedMode);
    if (mode === 'live' && !this.apiKey) {
      return {
        ok: false,
        mode: 'live',
        error: 'TRIPO_API_KEY가 설정되지 않았습니다.',
        balance: null,
        frozen: null,
      };
    }
    const bal = await client.getBalance();
    return { ok: true, mode, ...bal };
  }

  async getStatus() {
    let balance = null;
    try {
      if (this.mode === 'simulation') {
        balance = await this.simulator.getBalance();
      } else if (this.apiKey) {
        balance = await this._getLiveClient().getBalance();
      }
    } catch (err) {
      balance = { error: err.message, balance: null, frozen: null };
    }

    const activeJobs = [...this.jobs.values()].filter(j => j.status === 'queued' || j.status === 'running').length;
    return {
      ok: true,
      experimental: true,
      branch: 'Forge-Tripo',
      ...this.getConfigSummary(),
      balance,
      models: TRIPO_MODELS,
      defaultModel: DEFAULT_MODEL_VERSION,
      textureQualities: SUPPORTED_TEXTURE_QUALITIES,
      rigTypes: SUPPORTED_RIG_TYPES,
      animationPresets: SUPPORTED_ANIMATION_PRESETS,
      convertFormats: SUPPORTED_CONVERT_FORMATS,
      promptPresets: PROMPT_PRESETS,
      queue: {
        active: activeJobs,
        retainedJobs: this.jobs.size,
      },
      assetsCount: this.listAssets().length,
      recentTraces: this.wireTraces.slice(0, 20),
    };
  }

  async saveUploadedImage({ dataUrl, filename = 'reference.png', mode: requestedMode } = {}) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw Object.assign(new Error('유효한 이미지 Data URL(PNG/JPEG/WebP)이 필요합니다.'), { status: 400 });
    }
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) {
      throw Object.assign(new Error('잘못된 Data URL 형식입니다.'), { status: 400 });
    }
    const header = dataUrl.slice(0, commaIdx);
    if (!header.includes(';base64')) {
      throw Object.assign(new Error('base64 인코딩된 이미지 Data URL만 지원합니다.'), { status: 400 });
    }
    const b64 = dataUrl.slice(commaIdx + 1);
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
      throw Object.assign(new Error(`이미지 크기는 1바이트 ~ ${MAX_UPLOAD_IMAGE_BYTES / (1024 * 1024)}MB 범위여야 합니다.`), { status: 413 });
    }
    const detected = detectImageMime(buffer);
    if (!detected) {
      throw Object.assign(new Error('PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.'), { status: 400 });
    }

    const uploadId = `up_${crypto.randomBytes(8).toString('hex')}`;
    const safeBase = sanitizeSlug(path.basename(filename, path.extname(filename)), 'ref_image');
    const fileName = `${uploadId}_${safeBase}${detected.ext}`;
    const filePath = path.join(this.uploadsDir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    const { mode, client } = this._getActiveBackend(requestedMode);
    let remoteFileToken = null;
    if (mode === 'live' && this.apiKey) {
      const up = await client.uploadFile(buffer, fileName, detected.mime);
      remoteFileToken = up.fileToken;
    } else {
      const up = await this.simulator.uploadFile(buffer, fileName, detected.mime);
      remoteFileToken = up.fileToken;
    }

    const meta = {
      uploadId,
      fileName,
      originalName: String(filename || fileName).slice(0, 120),
      mimeType: detected.mime,
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      mode,
      tripoFileToken: remoteFileToken,
      url: `/api/tripo/uploads/${uploadId}`,
      createdAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(path.join(this.uploadsDir, `${uploadId}.json`), JSON.stringify(meta, null, 2), 'utf8');
    this.uploadsIndex.set(uploadId, meta);
    return meta;
  }

  getUploadFile(uploadId) {
    if (!isValidId(uploadId)) return null;
    const meta = this.uploadsIndex.get(uploadId);
    if (!meta) return null;
    const filePath = path.join(this.uploadsDir, meta.fileName);
    if (!fs.existsSync(filePath)) return null;
    return { filePath, meta };
  }

  async _ensureTripoFileTokenForUpload(uploadId, mode, client) {
    const found = this.getUploadFile(uploadId);
    if (!found) {
      throw Object.assign(new Error(`업로드된 이미지(${uploadId})를 찾을 수 없습니다.`), { status: 404 });
    }
    if (found.meta.mode === mode && found.meta.tripoFileToken) {
      return { token: found.meta.tripoFileToken, meta: found.meta };
    }
    const buf = await fs.promises.readFile(found.filePath);
    const uploaded = await client.uploadFile(buf, found.meta.fileName, found.meta.mimeType);
    found.meta.mode = mode;
    found.meta.tripoFileToken = uploaded.fileToken;
    await fs.promises.writeFile(path.join(this.uploadsDir, `${uploadId}.json`), JSON.stringify(found.meta, null, 2), 'utf8');
    return { token: uploaded.fileToken, meta: found.meta };
  }

  _validateGenerationInput(input = {}) {
    const taskType = String(input.taskType || input.type || 'text_to_model').trim().toLowerCase();
    const allowedTypes = ['text_to_model', 'image_to_model', 'multiview_to_model'];
    if (!allowedTypes.includes(taskType)) {
      throw Object.assign(new Error(`지원하지 않는 작업 유형입니다: ${taskType}`), { status: 400 });
    }

    const prompt = String(input.prompt || '').trim();
    if (taskType === 'text_to_model' && !prompt) {
      throw Object.assign(new Error('Text-to-3D 생성에는 프롬프트(prompt)가 필요합니다.'), { status: 400 });
    }
    if (prompt.length > 1024) {
      throw Object.assign(new Error('프롬프트는 최대 1024자까지 입력할 수 있습니다.'), { status: 400 });
    }

    const negativePrompt = String(input.negativePrompt || '').trim().slice(0, 255);
    const modelIds = TRIPO_MODELS.map(m => m.id);
    const model = modelIds.includes(String(input.model || '')) ? String(input.model) : DEFAULT_MODEL_VERSION;
    const texture = input.texture !== false;
    const pbr = input.pbr !== false;
    const textureQuality = SUPPORTED_TEXTURE_QUALITIES.includes(String(input.textureQuality || '').toLowerCase())
      ? String(input.textureQuality).toLowerCase()
      : 'standard';
    const quad = Boolean(input.quad);
    const faceLimitRaw = Number(input.faceLimit);
    const faceLimit = Number.isInteger(faceLimitRaw) && faceLimitRaw >= 500 && faceLimitRaw <= 200000 ? faceLimitRaw : undefined;
    const modelSeedRaw = Number(input.modelSeed);
    const modelSeed = Number.isInteger(modelSeedRaw) && modelSeedRaw >= 0 && modelSeedRaw <= 9999999 ? modelSeedRaw : undefined;
    const name = sanitizeSlug(input.name || prompt.slice(0, 32) || taskType, 'TripoModel');

    return {
      taskType,
      prompt,
      negativePrompt,
      model,
      texture,
      pbr,
      textureQuality,
      quad,
      faceLimit,
      modelSeed,
      name,
      uploadId: input.uploadId ? String(input.uploadId) : null,
      imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
      multiviewUploadIds: Array.isArray(input.multiviewUploadIds) ? input.multiviewUploadIds.map(String) : [],
      projectId: typeof input.projectId === 'string' ? input.projectId.slice(0, 64) : '',
      mode: input.mode === 'live' || input.mode === 'simulation' ? input.mode : this.mode,
    };
  }

  submitGenerationJob(rawInput = {}) {
    if (this.closed) {
      throw Object.assign(new Error('Tripo pipeline is shutting down'), { status: 503 });
    }
    const spec = this._validateGenerationInput(rawInput);
    if (spec.mode === 'live' && !this.apiKey) {
      throw Object.assign(new Error('Live 모드 실행을 위해 Tripo API 키(tsk_...)를 설정하거나 시뮬레이션 모드를 선택하세요.'), { status: 400 });
    }
    return this._enqueueJob({
      kind: spec.taskType,
      mode: spec.mode,
      name: spec.name,
      prompt: spec.prompt,
      projectId: spec.projectId,
      params: spec,
    });
  }

  submitPostProcessJob(assetId, action, rawInput = {}) {
    if (this.closed) {
      throw Object.assign(new Error('Tripo pipeline is shutting down'), { status: 503 });
    }
    const sourceAsset = this.getAsset(assetId);
    if (!sourceAsset) {
      throw Object.assign(new Error(`에셋(${assetId})을 찾을 수 없습니다.`), { status: 404 });
    }
    const mode = rawInput.mode === 'live' || rawInput.mode === 'simulation'
      ? rawInput.mode
      : (sourceAsset.tripo?.mode || this.mode);
    if (mode === 'live' && !this.apiKey) {
      throw Object.assign(new Error('Live 후처리에는 Tripo API 키가 필요합니다.'), { status: 400 });
    }

    if (action === 'rig') {
      const rigType = SUPPORTED_RIG_TYPES.includes(String(rawInput.rigType || '').toLowerCase())
        ? String(rawInput.rigType).toLowerCase()
        : 'biped';
      return this._enqueueJob({
        kind: 'animate_rig',
        mode,
        name: sanitizeSlug(`${sourceAsset.slug}_rigged`, 'TripoRigged'),
        prompt: sourceAsset.prompt || sourceAsset.name,
        projectId: sourceAsset.projectId || '',
        parentAssetId: sourceAsset.assetId,
        params: {
          originalTaskId: sourceAsset.tripo?.taskId,
          rigType,
          spec: String(rawInput.spec || 'mixamo'),
          promptHint: sourceAsset.prompt || sourceAsset.name,
        },
      });
    }

    if (action === 'retarget') {
      const animation = String(rawInput.animation || 'preset:walk').trim();
      const allowedAnims = SUPPORTED_ANIMATION_PRESETS.map(p => p.id);
      if (!allowedAnims.includes(animation)) {
        throw Object.assign(new Error(`지원하지 않는 애니메이션 프리셋: ${animation}`), { status: 400 });
      }
      const animShort = animation.replace(/^preset:/, '');
      return this._enqueueJob({
        kind: 'animate_retarget',
        mode,
        name: sanitizeSlug(`${sourceAsset.slug}_${animShort}`, 'TripoAnimated'),
        prompt: sourceAsset.prompt || sourceAsset.name,
        projectId: sourceAsset.projectId || '',
        parentAssetId: sourceAsset.assetId,
        params: {
          originalTaskId: sourceAsset.tripo?.taskId,
          animation,
          bakeAnimation: rawInput.bakeAnimation !== false,
          promptHint: sourceAsset.prompt || sourceAsset.name,
        },
      });
    }

    if (action === 'convert') {
      const format = SUPPORTED_CONVERT_FORMATS.includes(String(rawInput.format || 'GLTF').toUpperCase())
        ? String(rawInput.format || 'GLTF').toUpperCase()
        : 'GLTF';
      const faceLimitRaw = Number(rawInput.faceLimit);
      const faceLimit = Number.isInteger(faceLimitRaw) && faceLimitRaw >= 500 && faceLimitRaw <= 100000 ? faceLimitRaw : 10000;
      const quad = Boolean(rawInput.quad);
      return this._enqueueJob({
        kind: 'convert_model',
        mode,
        name: sanitizeSlug(`${sourceAsset.slug}_opt${Math.round(faceLimit / 1000)}k`, 'TripoOptimized'),
        prompt: sourceAsset.prompt || sourceAsset.name,
        projectId: sourceAsset.projectId || '',
        parentAssetId: sourceAsset.assetId,
        params: {
          originalTaskId: sourceAsset.tripo?.taskId,
          format,
          quad,
          faceLimit,
          flattenBottom: rawInput.flattenBottom !== false,
          promptHint: sourceAsset.prompt || sourceAsset.name,
        },
      });
    }

    throw Object.assign(new Error(`알 수 없는 후처리 작업: ${action}`), { status: 400 });
  }

  _enqueueJob(meta) {
    const jobId = `tjob_${crypto.randomBytes(6).toString('hex')}`;
    const job = {
      jobId,
      kind: meta.kind,
      mode: meta.mode,
      name: meta.name,
      prompt: meta.prompt || '',
      projectId: meta.projectId || '',
      parentAssetId: meta.parentAssetId || null,
      status: 'queued',
      stage: 'submitting',
      progress: 0,
      tripoTaskId: null,
      params: meta.params,
      asset: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    };
    this.jobs.set(jobId, job);
    this._pruneOldJobs();

    const controller = new AbortController();
    this.activeControllers.set(jobId, controller);

    const donePromise = this._executeJob(job, controller.signal)
      .catch(err => {
        if (job.status !== 'cancelled') {
          job.status = 'failed';
          job.stage = 'failed';
          job.error = err.message || String(err);
          job.finishedAt = new Date().toISOString();
          job.durationMs = job.startedAt ? Date.now() - Date.parse(job.startedAt) : 0;
        }
        return job;
      })
      .finally(() => {
        this.activeControllers.delete(jobId);
      });

    return { job, donePromise };
  }

  async _executeJob(job, signal) {
    job.startedAt = new Date().toISOString();
    job.status = 'running';
    job.stage = 'creating_task';
    job.progress = 5;

    const { mode, client } = this._getActiveBackend(job.mode);
    const params = job.params || {};

    let submitted;
    if (job.kind === 'text_to_model') {
      submitted = await client.createTextToModel(params);
    } else if (job.kind === 'image_to_model') {
      let fileToken = null;
      let promptHint = params.prompt || '';
      if (params.uploadId) {
        const ensured = await this._ensureTripoFileTokenForUpload(params.uploadId, mode, client);
        fileToken = ensured.token;
        promptHint = promptHint || ensured.meta.originalName;
      }
      submitted = await client.createImageToModel({
        ...params,
        fileToken,
        promptHint,
      });
    } else if (job.kind === 'multiview_to_model') {
      const tokens = [];
      for (const upId of params.multiviewUploadIds || []) {
        if (!upId) continue;
        const ensured = await this._ensureTripoFileTokenForUpload(upId, mode, client);
        tokens.push(ensured.token);
      }
      if (tokens.length < 2) {
        throw Object.assign(new Error('Multiview 생성에는 최소 2장 이상의 업로드 이미지가 필요합니다.'), { status: 400 });
      }
      submitted = await client.createMultiviewToModel({
        ...params,
        fileTokens: tokens,
        promptHint: params.prompt || 'Multiview 3D Model',
      });
    } else if (job.kind === 'animate_rig') {
      job.stage = 'rig_check';
      const check = await client.rigCheck(params.originalTaskId);
      if (check.riggable === false) {
        throw Object.assign(new Error('Tripo Rig-Check 결과 이 모델은 자동 리깅 대상이 아닙니다.'), { status: 422 });
      }
      submitted = await client.createRigTask({
        ...params,
        rigType: params.rigType || check.rigType || 'biped',
      });
    } else if (job.kind === 'animate_retarget') {
      submitted = await client.createRetargetTask(params);
    } else if (job.kind === 'convert_model') {
      submitted = await client.createConvertTask(params);
    } else {
      throw new Error(`Unsupported job kind: ${job.kind}`);
    }

    job.tripoTaskId = submitted.taskId;
    job.stage = 'polling_tripo';
    job.progress = 12;

    const pollInterval = mode === 'live' ? this.pollIntervalLiveMs : this.pollIntervalSimMs;
    const deadline = Date.now() + this.jobTimeoutMs;
    let finalTask = null;

    while (Date.now() < deadline) {
      if (signal.aborted) {
        throw new Error('Job cancelled');
      }
      await sleep(pollInterval, signal);
      const polled = await client.getTask(job.tripoTaskId);
      job.progress = Math.max(job.progress, Math.min(90, polled.progress || job.progress));

      if (polled.status === 'success') {
        finalTask = polled;
        break;
      }
      if (polled.status === 'failed' || polled.status === 'cancelled' || polled.status === 'expired') {
        throw new Error(`Tripo 작업 실패 (${polled.status}): ${polled.error || '원인 미상'}`);
      }
    }

    if (!finalTask) {
      throw new Error(`Tripo 작업 폴링 시간 초과 (${Math.round(this.jobTimeoutMs / 1000)}초)`);
    }

    const modelUrl = finalTask.output?.modelUrl;
    if (!modelUrl) {
      throw new Error('Tripo 작업은 완료되었으나 다운로드 가능한 GLB URL(model_url)이 응답에 없습니다.');
    }

    // Download & cache immediately (Tripo v3 signed URLs expire in ~5 minutes!)
    job.stage = 'downloading_glb';
    job.progress = 92;
    const glbBuffer = await client.downloadAsset(modelUrl);

    job.stage = 'validating_glb';
    job.progress = 96;
    const glbInfo = validateGlbBuffer(glbBuffer);

    let previewBuffer = null;
    if (finalTask.output?.renderedImageUrl) {
      try {
        previewBuffer = await client.downloadAsset(finalTask.output.renderedImageUrl, { maxBytes: 8 * 1024 * 1024 });
      } catch {
        previewBuffer = null;
      }
    }

    const assetId = `tasset_${crypto.randomBytes(6).toString('hex')}`;
    const assetDir = path.join(this.assetsDir, assetId);
    await fs.promises.mkdir(assetDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetDir, 'model.glb'), glbBuffer);
    if (previewBuffer) {
      await fs.promises.writeFile(path.join(assetDir, 'preview.png'), previewBuffer);
    }

    const slug = sanitizeSlug(`${job.name}_${assetId.slice(-4)}`, assetId);
    const manifest = {
      schemaVersion: 1,
      assetId,
      jobId: job.jobId,
      parentAssetId: job.parentAssetId,
      name: job.name,
      slug,
      prompt: job.prompt,
      projectId: job.projectId,
      createdAt: new Date().toISOString(),
      tripo: {
        mode,
        apiVersion: 'v3',
        taskId: job.tripoTaskId,
        taskType: job.kind,
        modelVersion: params.model || DEFAULT_MODEL_VERSION,
        endpoint: submitted.endpoint,
        rigType: job.kind === 'animate_rig' ? params.rigType : (glbInfo.skinCount > 0 ? 'biped' : null),
        animationPreset: job.kind === 'animate_retarget' ? params.animation : null,
        convertFormat: job.kind === 'convert_model' ? params.format : null,
        faceLimit: params.faceLimit || null,
        quad: Boolean(params.quad),
        pbr: params.pbr !== false,
        texture: params.texture !== false,
      },
      artifact: {
        format: 'GLB',
        bytes: glbInfo.bytes,
        sha256: glbInfo.sha256,
        glbUrl: `/api/tripo/assets/${assetId}/model.glb`,
        previewUrl: previewBuffer ? `/api/tripo/assets/${assetId}/preview.png` : null,
        manifestUrl: `/api/tripo/assets/${assetId}/manifest.json`,
        suggestedResPath: `res://assets/tripo/${slug}.glb`,
      },
      metrics: {
        gltfVersion: glbInfo.gltfVersion,
        generator: glbInfo.generator,
        meshCount: glbInfo.meshCount,
        primitiveCount: glbInfo.primitiveCount,
        nodeCount: glbInfo.nodeCount,
        vertexCount: glbInfo.vertexCount,
        triangleCount: glbInfo.triangleCount,
        materialCount: glbInfo.materialCount,
        textureCount: glbInfo.textureCount,
        imageCount: glbInfo.imageCount,
        skinCount: glbInfo.skinCount,
        boneCount: glbInfo.boneCount,
        animationCount: glbInfo.animationCount,
        animationNames: glbInfo.animationNames,
        boundingBox: glbInfo.boundingBox,
        gameReadiness: glbInfo.gameReadiness,
      },
    };

    await fs.promises.writeFile(path.join(assetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    job.status = 'succeeded';
    job.stage = 'completed';
    job.progress = 100;
    job.asset = manifest;
    job.finishedAt = new Date().toISOString();
    job.durationMs = Date.now() - Date.parse(job.startedAt);
    return job;
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const controller = this.activeControllers.get(jobId);
    if (controller) {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.finishedAt = new Date().toISOString();
      controller.abort();
    }
    return job;
  }

  _pruneOldJobs() {
    if (this.jobs.size <= MAX_JOBS_RETAINED) return;
    const keys = [...this.jobs.keys()];
    while (this.jobs.size > MAX_JOBS_RETAINED && keys.length > 0) {
      const oldest = keys.shift();
      if (!this.activeControllers.has(oldest)) {
        this.jobs.delete(oldest);
      }
    }
  }

  listJobs(projectId = '') {
    const all = [...this.jobs.values()];
    const filtered = projectId ? all.filter(j => !j.projectId || j.projectId === projectId) : all;
    return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  getJob(jobId) {
    if (!isValidId(jobId)) return null;
    return this.jobs.get(jobId) || null;
  }

  listAssets(projectId = '') {
    let dirs = [];
    try {
      dirs = fs.readdirSync(this.assetsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && isValidId(e.name));
    } catch {
      return [];
    }
    const items = [];
    for (const entry of dirs) {
      const manifestPath = path.join(this.assetsDir, entry.name, 'manifest.json');
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!projectId || !parsed.projectId || parsed.projectId === projectId) {
          items.push(parsed);
        }
      } catch { /* ignore */ }
    }
    return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  getAsset(assetId) {
    if (!isValidId(assetId)) return null;
    const manifestPath = path.join(this.assetsDir, assetId, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }

  getAssetFilePath(assetId, filename) {
    if (!isValidId(assetId)) return null;
    if (!['model.glb', 'preview.png', 'manifest.json'].includes(filename)) return null;
    const target = path.join(this.assetsDir, assetId, filename);
    return fs.existsSync(target) ? target : null;
  }

  deleteAsset(assetId) {
    if (!isValidId(assetId)) return false;
    const assetDir = path.join(this.assetsDir, assetId);
    if (!fs.existsSync(assetDir)) return false;
    fs.rmSync(assetDir, { recursive: true, force: true });
    return true;
  }

  close() {
    this.closed = true;
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
}

function createTripoPipelineHandler(root, options = {}) {
  const manager = options.manager || new TripoJobManager(root, options);

  async function handler(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    if (pathname !== '/api/tripo' && !pathname.startsWith('/api/tripo/')) {
      return false;
    }

    try {
      // GET /api/tripo/status
      if (pathname === '/api/tripo/status' && req.method === 'GET') {
        const status = await manager.getStatus();
        sendJson(res, 200, status);
        return true;
      }

      // GET /api/tripo/balance
      if (pathname === '/api/tripo/balance' && req.method === 'GET') {
        const mode = parsedUrl.searchParams.get('mode') || null;
        const bal = await manager.getBalance(mode);
        sendJson(res, bal.ok ? 200 : 400, bal);
        return true;
      }

      // POST /api/tripo/config (localhost-only!)
      if (pathname === '/api/tripo/config' && req.method === 'POST') {
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, { ok: false, error: '보안 정책상 Tripo API 키 및 엔드포인트 설정은 로컬 호스트(127.0.0.1)에서만 변경할 수 있습니다.' });
          return true;
        }
        const body = await readJsonBody(req, 64 * 1024);
        const config = manager.updateConfig(body);
        let balance = null;
        if (body.testConnection && config.mode === 'live') {
          balance = await manager.getBalance('live');
        }
        sendJson(res, 200, { ok: true, config, balance });
        return true;
      }

      // POST /api/tripo/uploads
      if (pathname === '/api/tripo/uploads' && req.method === 'POST') {
        const body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
        const saved = await manager.saveUploadedImage(body);
        sendJson(res, 201, { ok: true, upload: saved });
        return true;
      }

      // GET /api/tripo/uploads/:uploadId
      const uploadMatch = pathname.match(/^\/api\/tripo\/uploads\/([a-z0-9_-]{6,64})$/i);
      if (uploadMatch && req.method === 'GET') {
        const found = manager.getUploadFile(uploadMatch[1]);
        if (!found) {
          sendJson(res, 404, { ok: false, error: 'Uploaded image not found' });
          return true;
        }
        const buf = await fs.promises.readFile(found.filePath);
        res.writeHead(200, {
          'Content-Type': found.meta.mimeType,
          'Content-Length': buf.length,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(buf);
        return true;
      }

      // GET /api/tripo/jobs
      if (pathname === '/api/tripo/jobs' && req.method === 'GET') {
        const projectId = parsedUrl.searchParams.get('projectId') || '';
        sendJson(res, 200, { ok: true, jobs: manager.listJobs(projectId), traces: manager.wireTraces.slice(0, 30) });
        return true;
      }

      // POST /api/tripo/jobs
      if (pathname === '/api/tripo/jobs' && req.method === 'POST') {
        const body = await readJsonBody(req, 512 * 1024);
        const { job, donePromise } = manager.submitGenerationJob(body);
        const sync = parsedUrl.searchParams.get('sync') === '1' || body.sync === true;
        if (sync) {
          const completed = await donePromise;
          sendJson(res, completed.status === 'succeeded' ? 200 : 500, {
            ok: completed.status === 'succeeded',
            job: completed,
            asset: completed.asset,
            error: completed.error,
          });
        } else {
          sendJson(res, 202, { ok: true, job });
        }
        return true;
      }

      // GET /api/tripo/jobs/:jobId
      const jobMatch = pathname.match(/^\/api\/tripo\/jobs\/([a-z0-9_-]{6,64})$/i);
      if (jobMatch && req.method === 'GET') {
        const job = manager.getJob(jobMatch[1]);
        if (!job) {
          sendJson(res, 404, { ok: false, error: 'Tripo job not found' });
          return true;
        }
        sendJson(res, 200, { ok: true, job, traces: manager.wireTraces.slice(0, 20) });
        return true;
      }

      // POST /api/tripo/jobs/:jobId/cancel
      const cancelMatch = pathname.match(/^\/api\/tripo\/jobs\/([a-z0-9_-]{6,64})\/cancel$/i);
      if (cancelMatch && req.method === 'POST') {
        const job = manager.cancelJob(cancelMatch[1]);
        if (!job) {
          sendJson(res, 404, { ok: false, error: 'Tripo job not found' });
          return true;
        }
        sendJson(res, 200, { ok: true, job });
        return true;
      }

      // GET /api/tripo/assets
      if (pathname === '/api/tripo/assets' && req.method === 'GET') {
        const projectId = parsedUrl.searchParams.get('projectId') || '';
        sendJson(res, 200, { ok: true, assets: manager.listAssets(projectId) });
        return true;
      }

      // POST /api/tripo/assets/:assetId/(rig|retarget|convert)
      const postMatch = pathname.match(/^\/api\/tripo\/assets\/([a-z0-9_-]{6,64})\/(rig|retarget|convert)$/i);
      if (postMatch && req.method === 'POST') {
        const body = await readJsonBody(req, 128 * 1024);
        const { job, donePromise } = manager.submitPostProcessJob(postMatch[1], postMatch[2].toLowerCase(), body);
        const sync = parsedUrl.searchParams.get('sync') === '1' || body.sync === true;
        if (sync) {
          const completed = await donePromise;
          sendJson(res, completed.status === 'succeeded' ? 200 : 500, {
            ok: completed.status === 'succeeded',
            job: completed,
            asset: completed.asset,
            error: completed.error,
          });
        } else {
          sendJson(res, 202, { ok: true, job });
        }
        return true;
      }

      // GET /api/tripo/assets/:assetId/model.glb
      const glbMatch = pathname.match(/^\/api\/tripo\/assets\/([a-z0-9_-]{6,64})\/model\.glb$/i);
      if (glbMatch && (req.method === 'GET' || req.method === 'HEAD')) {
        const glbPath = manager.getAssetFilePath(glbMatch[1], 'model.glb');
        if (!glbPath) {
          sendJson(res, 404, { ok: false, error: 'Tripo GLB asset not found' });
          return true;
        }
        const stat = await fs.promises.stat(glbPath);
        res.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': stat.size,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          fs.createReadStream(glbPath).pipe(res);
        }
        return true;
      }

      // GET /api/tripo/assets/:assetId/preview.png
      const prevMatch = pathname.match(/^\/api\/tripo\/assets\/([a-z0-9_-]{6,64})\/preview\.png$/i);
      if (prevMatch && req.method === 'GET') {
        const prevPath = manager.getAssetFilePath(prevMatch[1], 'preview.png');
        if (!prevPath) {
          sendJson(res, 404, { ok: false, error: 'Preview image not found' });
          return true;
        }
        const buf = await fs.promises.readFile(prevPath);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buf.length,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(buf);
        return true;
      }

      // GET /api/tripo/assets/:assetId/manifest.json
      const manifestMatch = pathname.match(/^\/api\/tripo\/assets\/([a-z0-9_-]{6,64})\/manifest\.json$/i);
      if (manifestMatch && req.method === 'GET') {
        const manifest = manager.getAsset(manifestMatch[1]);
        if (!manifest) {
          sendJson(res, 404, { ok: false, error: 'Tripo asset manifest not found' });
          return true;
        }
        sendJson(res, 200, manifest);
        return true;
      }

      // DELETE /api/tripo/assets/:assetId
      const delMatch = pathname.match(/^\/api\/tripo\/assets\/([a-z0-9_-]{6,64})$/i);
      if (delMatch && req.method === 'DELETE') {
        const removed = manager.deleteAsset(delMatch[1]);
        if (!removed) {
          sendJson(res, 404, { ok: false, error: 'Tripo asset not found' });
          return true;
        }
        sendJson(res, 200, { ok: true, deleted: delMatch[1] });
        return true;
      }

      sendJson(res, 404, { ok: false, error: `Unknown Tripo API route: ${req.method} ${pathname}` });
      return true;
    } catch (err) {
      sendJson(res, err.status || 500, { ok: false, error: err.message || 'Tripo pipeline error' });
      return true;
    }
  }

  handler.manager = manager;
  handler.close = () => manager.close();
  return handler;
}

module.exports = {
  TripoJobManager,
  createTripoPipelineHandler,
  SUPPORTED_TEXTURE_QUALITIES,
  SUPPORTED_RIG_TYPES,
  SUPPORTED_ANIMATION_PRESETS,
  SUPPORTED_CONVERT_FORMATS,
  PROMPT_PRESETS,
};
