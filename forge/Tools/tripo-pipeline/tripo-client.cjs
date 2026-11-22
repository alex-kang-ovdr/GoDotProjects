'use strict';

/**
 * Tripo3D OpenAPI v3 Client (Zero external dependencies, Node 24 native fetch/FormData/Blob)
 *
 * Official V3 Base URLs:
 *  - Global:         https://openapi.tripo3d.ai/v3
 *  - China Mainland: https://openapi.tripo3d.com/v3
 *
 * Legacy V2 note: api.tripo3d.ai/v2/openapi is deprecated/retired in favor of V3,
 * but this client can still parse both V3 and V2 output field conventions gracefully.
 */

const net = require('node:net');

const TRIPO_REGIONS = Object.freeze({
  global: 'https://openapi.tripo3d.ai/v3',
  cn: 'https://openapi.tripo3d.com/v3',
});

const TRIPO_MODELS = Object.freeze([
  {
    id: 'v3.1-20260211',
    label: 'Tripo H3.1 (Flagship HD PBR)',
    tier: 'flagship',
    description: '최고 해상도 지오메트리·선명한 엣지·고품질 PBR 머티리얼 (기본 권장)',
    estimatedCredits: { text_to_model: 20, image_to_model: 25, multiview_to_model: 35 },
  },
  {
    id: 'v3.0-20250812',
    label: 'Tripo H3.0 (Stable HD)',
    tier: 'stable',
    description: '안정적인 고디테일 3D 생성 모델',
    estimatedCredits: { text_to_model: 20, image_to_model: 25, multiview_to_model: 35 },
  },
  {
    id: 'P1-20260311',
    label: 'Tripo P1 (Smart Mesh · Clean Quad)',
    tier: 'game-ready',
    description: '게임 엔진 친화적 클린 토폴로지(Quad/Low-Poly) 및 고속 생성',
    estimatedCredits: { text_to_model: 15, image_to_model: 20, multiview_to_model: 30 },
  },
  {
    id: 'v2.5-20250123',
    label: 'Tripo v2.5 (Balanced Legacy)',
    tier: 'legacy',
    description: '균형형 이전 세대 프로덕션 모델',
    estimatedCredits: { text_to_model: 15, image_to_model: 20, multiview_to_model: 30 },
  },
]);

const DEFAULT_MODEL_VERSION = 'v3.1-20260211';

function maskApiKey(apiKey) {
  const raw = String(apiKey || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return '••••';
  return `${raw.slice(0, 6)}••••${raw.slice(-4)}`;
}

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local / cloud metadata
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
    return false;
  }
  if (ipVersion === 6) {
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
    if (host.startsWith('::ffff:')) {
      return isPrivateOrLoopbackHost(host.slice(7));
    }
    return false;
  }
  return false;
}

function validateRemoteUrl(rawUrl, options = {}) {
  const allowLoopbackMock = Boolean(options.allowLoopbackMock);
  const allowedOrigin = options.allowedOrigin || null;
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    throw new Error('Invalid URL format');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credentials in URL are not allowed');
  }
  const isAllowedCustomOrigin = Boolean(allowedOrigin && parsed.origin === allowedOrigin);
  if (parsed.protocol !== 'https:') {
    if (!(allowLoopbackMock && parsed.protocol === 'http:' && isAllowedCustomOrigin)) {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol} (HTTPS required)`);
    }
  }
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    if (!(allowLoopbackMock && isAllowedCustomOrigin)) {
      throw new Error(`Blocked private or loopback host: ${parsed.hostname}`);
    }
  }
  return parsed;
}

function normalizeTaskStatus(rawStatus) {
  const s = String(rawStatus || '').trim().toLowerCase();
  if (s === 'completed' || s === 'succeeded' || s === 'success') return 'success';
  if (s === 'queued' || s === 'pending' || s === 'submitted') return 'queued';
  if (s === 'running' || s === 'processing' || s === 'in_progress') return 'running';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'expired' || s === 'timeout') return 'expired';
  if (s === 'failed' || s === 'error' || s === 'banned') return 'failed';
  return s || 'unknown';
}

function extractTaskOutput(rawData) {
  const data = rawData && typeof rawData === 'object' ? rawData : {};
  const output = data.output && typeof data.output === 'object' ? data.output : {};
  const result = data.result && typeof data.result === 'object' ? data.result : {};

  const modelUrl =
    output.model_url ||
    output.model_mesh?.url ||
    output.pbr_model ||
    output.model ||
    output.base_model ||
    result.pbr_model?.url ||
    result.model?.url ||
    null;

  const renderedImageUrl =
    output.rendered_image_url ||
    output.rendered_image ||
    output.generated_image_url ||
    result.rendered_image?.url ||
    null;

  return {
    modelUrl: typeof modelUrl === 'string' && modelUrl.trim() ? modelUrl.trim() : null,
    renderedImageUrl: typeof renderedImageUrl === 'string' && renderedImageUrl.trim() ? renderedImageUrl.trim() : null,
    contentType: output.model_mesh?.content_type || 'model/gltf-binary',
    fileName: output.model_mesh?.file_name || 'model.glb',
    raw: output,
  };
}

function sanitizeTracePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (/authorization|api[_-]?key|token|secret/i.test(key) && key !== 'file_token' && key !== 'image_token') {
      clone[key] = '***REDACTED***';
    }
  }
  return clone;
}

class TripoV3Client {
  constructor(options = {}) {
    this.apiKey = String(options.apiKey || '').trim();
    this.region = options.region === 'cn' ? 'cn' : 'global';
    const rawBase = options.baseUrl ? String(options.baseUrl).trim().replace(/\/+$/, '') : TRIPO_REGIONS[this.region];
    this.baseUrl = rawBase;
    this.allowLoopbackMock = Boolean(options.allowLoopbackMock);
    this.timeoutMs = Math.max(2000, Number(options.timeoutMs) || 30000);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.onTrace = typeof options.onTrace === 'function' ? options.onTrace : null;
  }

  getAllowedOrigin() {
    try {
      return new URL(this.baseUrl).origin;
    } catch {
      return null;
    }
  }

  _requireKey() {
    if (!this.apiKey) {
      const err = new Error('Tripo API 키(TRIPO_API_KEY, tsk_...)가 설정되지 않았습니다.');
      err.status = 401;
      err.code = 'TRIPO_API_KEY_MISSING';
      throw err;
    }
  }

  async _requestJson(method, endpointPath, body = null) {
    this._requireKey();
    const url = `${this.baseUrl}${endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath}`;
    validateRemoteUrl(url, {
      allowLoopbackMock: this.allowLoopbackMock,
      allowedOrigin: this.getAllowedOrigin(),
    });

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    let reqBody = undefined;
    if (body !== null && body !== undefined) {
      headers['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
    }

    const startedAt = Date.now();
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: reqBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      this.onTrace?.({
        at: new Date().toISOString(),
        method,
        endpoint: endpointPath,
        status: 0,
        elapsedMs,
        request: sanitizeTracePayload(body),
        error: err.message,
      });
      const netErr = new Error(`Tripo API 연결 실패 (${method} ${endpointPath}): ${err.message}`);
      netErr.status = 502;
      throw netErr;
    }

    const elapsedMs = Date.now() - startedAt;
    const rawText = await res.text();
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { rawText: rawText.slice(0, 400) };
    }

    this.onTrace?.({
      at: new Date().toISOString(),
      method,
      endpoint: endpointPath,
      status: res.status,
      elapsedMs,
      request: sanitizeTracePayload(body),
      responseSummary: {
        code: parsed?.code,
        task_id: parsed?.data?.task_id,
        status: parsed?.data?.status,
        progress: parsed?.data?.progress,
        balance: parsed?.data?.balance,
        message: parsed?.message,
      },
    });

    if (!res.ok || (typeof parsed?.code === 'number' && parsed.code !== 0)) {
      const detail = parsed?.message || parsed?.error || `HTTP ${res.status}`;
      const apiErr = new Error(`Tripo API 오류 (${res.status}${parsed?.code ? ` / code=${parsed.code}` : ''}): ${detail}`);
      apiErr.status = res.status >= 400 && res.status < 600 ? res.status : 502;
      apiErr.tripoCode = parsed?.code;
      apiErr.tripoPayload = parsed;
      throw apiErr;
    }

    return parsed?.data ?? parsed;
  }

  async getBalance() {
    const data = await this._requestJson('GET', '/account/balance');
    return {
      balance: Number(data?.balance ?? 0),
      frozen: Number(data?.frozen ?? 0),
      currency: 'credits',
      source: 'tripo-v3-live',
    };
  }

  async uploadFile(buffer, filename = 'reference.png', mimeType = 'image/png') {
    this._requireKey();
    const endpointPath = '/files';
    const url = `${this.baseUrl}${endpointPath}`;
    validateRemoteUrl(url, {
      allowLoopbackMock: this.allowLoopbackMock,
      allowedOrigin: this.getAllowedOrigin(),
    });

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append('file', blob, filename);

    const startedAt = Date.now();
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const elapsedMs = Date.now() - startedAt;
    const rawText = await res.text();
    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { rawText: rawText.slice(0, 300) };
    }

    const token = parsed?.data?.file_token || parsed?.data?.image_token || parsed?.file_token || null;
    this.onTrace?.({
      at: new Date().toISOString(),
      method: 'POST',
      endpoint: endpointPath,
      status: res.status,
      elapsedMs,
      request: { filename, mimeType, bytes: buffer.length },
      responseSummary: { code: parsed?.code, hasToken: Boolean(token) },
    });

    if (!res.ok || (typeof parsed?.code === 'number' && parsed.code !== 0) || !token) {
      const err = new Error(`Tripo 파일 업로드 실패: ${parsed?.message || `HTTP ${res.status}`}`);
      err.status = res.status >= 400 ? res.status : 502;
      throw err;
    }

    return {
      fileToken: String(token),
      filename,
      mimeType,
      bytes: buffer.length,
    };
  }

  async createTextToModel(params = {}) {
    const payload = {
      prompt: String(params.prompt || '').trim(),
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
    };
    if (params.negativePrompt) payload.negative_prompt = String(params.negativePrompt).trim().slice(0, 255);
    if (params.textureQuality) payload.texture_quality = String(params.textureQuality);
    if (typeof params.quad === 'boolean') payload.quad = params.quad;
    if (Number.isInteger(params.faceLimit) && params.faceLimit >= 48) payload.face_limit = params.faceLimit;
    if (Number.isInteger(params.modelSeed) && params.modelSeed >= 0) payload.model_seed = params.modelSeed;

    const data = await this._requestJson('POST', '/generation/text-to-model', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo text-to-model response missing task_id');
    return { taskId: String(taskId), endpoint: '/generation/text-to-model', payload };
  }

  async createImageToModel(params = {}) {
    const payload = {
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
    };
    if (params.fileToken) {
      payload.file = { type: 'file_token', file_token: String(params.fileToken) };
      payload.input = String(params.fileToken);
    } else if (params.imageUrl) {
      validateRemoteUrl(params.imageUrl, {
        allowLoopbackMock: this.allowLoopbackMock,
        allowedOrigin: this.getAllowedOrigin(),
      });
      payload.file = { type: 'url', url: String(params.imageUrl) };
      payload.input = String(params.imageUrl);
    } else {
      throw new Error('image-to-model requires fileToken or imageUrl');
    }
    if (params.textureQuality) payload.texture_quality = String(params.textureQuality);
    if (typeof params.quad === 'boolean') payload.quad = params.quad;
    if (Number.isInteger(params.faceLimit) && params.faceLimit >= 48) payload.face_limit = params.faceLimit;

    const data = await this._requestJson('POST', '/generation/image-to-model', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo image-to-model response missing task_id');
    return { taskId: String(taskId), endpoint: '/generation/image-to-model', payload };
  }

  async createMultiviewToModel(params = {}) {
    const tokens = Array.isArray(params.fileTokens) ? params.fileTokens : [];
    if (tokens.length < 2) {
      throw new Error('multiview-to-model requires at least 2 view file tokens');
    }
    const payload = {
      files: tokens.map(t => (t ? { type: 'file_token', file_token: String(t) } : {})),
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
    };
    if (params.textureQuality) payload.texture_quality = String(params.textureQuality);
    if (typeof params.quad === 'boolean') payload.quad = params.quad;
    if (Number.isInteger(params.faceLimit) && params.faceLimit >= 48) payload.face_limit = params.faceLimit;

    const data = await this._requestJson('POST', '/generation/multiview-to-model', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo multiview-to-model response missing task_id');
    return { taskId: String(taskId), endpoint: '/generation/multiview-to-model', payload };
  }

  async getTask(taskId) {
    const cleanId = encodeURIComponent(String(taskId || '').trim());
    const data = await this._requestJson('GET', `/tasks/${cleanId}`);
    const status = normalizeTaskStatus(data?.status);
    const progress = Number.isFinite(Number(data?.progress))
      ? Math.max(0, Math.min(100, Number(data.progress)))
      : (status === 'success' ? 100 : (status === 'queued' ? 5 : 50));
    return {
      taskId: String(data?.task_id || taskId),
      type: String(data?.type || ''),
      status,
      progress,
      output: extractTaskOutput(data),
      error: data?.error || data?.message || null,
      raw: data,
    };
  }

  async rigCheck(originalTaskId) {
    const payload = { original_model_task_id: String(originalTaskId) };
    const data = await this._requestJson('POST', '/animations/rig-check', payload);
    return {
      taskId: data?.task_id ? String(data.task_id) : null,
      riggable: data?.riggable !== false,
      rigType: String(data?.rig_type || 'biped'),
      raw: data,
    };
  }

  async createRigTask(params = {}) {
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      rig_type: String(params.rigType || 'biped'),
      out_format: 'glb',
      spec: String(params.spec || 'mixamo'),
    };
    const data = await this._requestJson('POST', '/animations/rig', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo animations/rig response missing task_id');
    return { taskId: String(taskId), endpoint: '/animations/rig', payload };
  }

  async createRetargetTask(params = {}) {
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      animation: String(params.animation || 'preset:walk'),
      out_format: 'glb',
      bake_animation: params.bakeAnimation !== false,
    };
    const data = await this._requestJson('POST', '/animations/retarget', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo animations/retarget response missing task_id');
    return { taskId: String(taskId), endpoint: '/animations/retarget', payload };
  }

  async createConvertTask(params = {}) {
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      format: String(params.format || 'GLTF').toUpperCase(),
      quad: Boolean(params.quad),
      face_limit: Number.isInteger(params.faceLimit) ? params.faceLimit : 10000,
      flatten_bottom: params.flattenBottom !== false,
    };
    if (Number.isInteger(params.textureSize) && params.textureSize >= 256) {
      payload.texture_size = params.textureSize;
    }
    const data = await this._requestJson('POST', '/models/convert', payload);
    const taskId = data?.task_id || data?.taskId;
    if (!taskId) throw new Error('Tripo models/convert response missing task_id');
    return { taskId: String(taskId), endpoint: '/models/convert', payload };
  }

  async downloadAsset(assetUrl, { maxBytes = 64 * 1024 * 1024 } = {}) {
    const parsed = validateRemoteUrl(assetUrl, {
      allowLoopbackMock: this.allowLoopbackMock,
      allowedOrigin: this.getAllowedOrigin(),
    });
    const headers = {};
    if (this.apiKey && parsed.origin === this.getAllowedOrigin()) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const startedAt = Date.now();
    const res = await this.fetchImpl(parsed.href, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(this.timeoutMs, 60000)),
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const nextUrl = new URL(res.headers.get('location'), parsed.href).href;
      validateRemoteUrl(nextUrl, {
        allowLoopbackMock: this.allowLoopbackMock,
        allowedOrigin: this.getAllowedOrigin(),
      });
      const redirected = await this.fetchImpl(nextUrl, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(Math.max(this.timeoutMs, 60000)),
      });
      if (!redirected.ok) {
        throw new Error(`Tripo 아티팩트 다운로드 실패 (redirect HTTP ${redirected.status})`);
      }
      const arrBuf = await redirected.arrayBuffer();
      if (arrBuf.byteLength > maxBytes) {
        throw new Error(`Downloaded artifact exceeds ${maxBytes} bytes`);
      }
      return Buffer.from(arrBuf);
    }

    if (!res.ok) {
      throw new Error(`Tripo 아티팩트 다운로드 실패 (HTTP ${res.status})`);
    }
    const arrBuf = await res.arrayBuffer();
    if (arrBuf.byteLength > maxBytes) {
      throw new Error(`Downloaded artifact exceeds ${maxBytes} bytes`);
    }
    this.onTrace?.({
      at: new Date().toISOString(),
      method: 'GET',
      endpoint: parsed.pathname,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      responseSummary: { downloadedBytes: arrBuf.byteLength },
    });
    return Buffer.from(arrBuf);
  }
}

module.exports = {
  TRIPO_REGIONS,
  TRIPO_MODELS,
  DEFAULT_MODEL_VERSION,
  maskApiKey,
  isPrivateOrLoopbackHost,
  validateRemoteUrl,
  normalizeTaskStatus,
  extractTaskOutput,
  TripoV3Client,
};
