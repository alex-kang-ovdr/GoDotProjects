'use strict';

/**
 * Tripo3D API v3 Faithful Simulator + Optional Real HTTP Mock Server
 *
 * Used for:
 *  1) Zero-credit PoC experiments in PlayForge Tripo Studio when TRIPO_API_KEY is unset
 *  2) Deterministic Tier 1 HTTP integration tests exercising TripoV3Client over real sockets
 */

const crypto = require('node:crypto');
const http = require('node:http');
const { buildSimulationGlb, buildPreviewPng } = require('./glb-validator.cjs');
const { DEFAULT_MODEL_VERSION } = require('./tripo-client.cjs');

const CREDIT_COSTS = Object.freeze({
  text_to_model: 20,
  image_to_model: 25,
  multiview_to_model: 35,
  animate_rig: 25,
  animate_retarget: 10,
  convert_model: 10,
});

class TripoV3Simulator {
  constructor(options = {}) {
    this.balance = Number.isFinite(Number(options.initialBalance)) ? Number(options.initialBalance) : 500;
    this.frozen = 0;
    this.pollsToFinish = Math.max(1, Number(options.pollsToFinish) || 3);
    this.onTrace = typeof options.onTrace === 'function' ? options.onTrace : null;
    this.files = new Map(); // fileToken -> { filename, mimeType, bytes, hintPrompt }
    this.tasks = new Map(); // taskId -> taskRecord
  }

  _trace(method, endpoint, request, responseSummary, status = 200) {
    this.onTrace?.({
      at: new Date().toISOString(),
      mode: 'simulation',
      method,
      endpoint,
      status,
      elapsedMs: 12 + Math.floor(Math.random() * 18),
      request,
      responseSummary,
    });
  }

  async getBalance() {
    const res = {
      balance: this.balance,
      frozen: this.frozen,
      currency: 'credits',
      source: 'tripo-v3-simulation',
    };
    this._trace('GET', '/account/balance', null, { balance: res.balance, frozen: res.frozen });
    return res;
  }

  async uploadFile(buffer, filename = 'reference.png', mimeType = 'image/png') {
    const fileToken = `sim_tok_${crypto.randomBytes(8).toString('hex')}`;
    this.files.set(fileToken, {
      fileToken,
      filename,
      mimeType,
      bytes: buffer.length,
      uploadedAt: new Date().toISOString(),
    });
    this._trace('POST', '/files', { filename, mimeType, bytes: buffer.length }, { code: 0, file_token: fileToken });
    return { fileToken, filename, mimeType, bytes: buffer.length };
  }

  _createSimulatedTask(type, endpoint, payload, glbOptions) {
    const cost = CREDIT_COSTS[type] || 15;
    if (this.balance < cost) {
      const err = new Error(`시뮬레이션 크레딧 부족 (필요: ${cost}, 잔액: ${this.balance})`);
      err.status = 402;
      throw err;
    }
    this.balance -= cost;
    this.frozen += cost;

    const taskId = `sim_${crypto.randomUUID()}`;
    const glbBuffer = buildSimulationGlb(glbOptions);
    const previewBuffer = buildPreviewPng(glbOptions.prompt || '');

    this.tasks.set(taskId, {
      taskId,
      type,
      cost,
      payload,
      glbOptions,
      glbBuffer,
      previewBuffer,
      pollCount: 0,
      status: 'queued',
      progress: 5,
      createdAt: new Date().toISOString(),
      settled: false,
    });

    this._trace('POST', endpoint, payload, { code: 0, task_id: taskId, cost });
    return { taskId, endpoint, payload };
  }

  async createTextToModel(params = {}) {
    const payload = {
      prompt: String(params.prompt || '').trim(),
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
      ...(params.negativePrompt ? { negative_prompt: String(params.negativePrompt).slice(0, 255) } : {}),
      ...(params.textureQuality ? { texture_quality: String(params.textureQuality) } : {}),
      ...(typeof params.quad === 'boolean' ? { quad: params.quad } : {}),
      ...(Number.isInteger(params.faceLimit) ? { face_limit: params.faceLimit } : {}),
      ...(Number.isInteger(params.modelSeed) ? { model_seed: params.modelSeed } : {}),
    };
    return this._createSimulatedTask('text_to_model', '/generation/text-to-model', payload, {
      prompt: payload.prompt,
      seed: payload.model_seed ?? 42,
      texture: payload.texture,
      pbr: payload.pbr,
      faceLimit: payload.face_limit || 0,
    });
  }

  async createImageToModel(params = {}) {
    const fileMeta = params.fileToken ? this.files.get(params.fileToken) : null;
    const hint = params.promptHint || fileMeta?.filename || 'Stylized 3D Asset from Image';
    const payload = {
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
      input: params.fileToken || params.imageUrl || 'uploaded_image',
      ...(params.textureQuality ? { texture_quality: String(params.textureQuality) } : {}),
      ...(typeof params.quad === 'boolean' ? { quad: params.quad } : {}),
      ...(Number.isInteger(params.faceLimit) ? { face_limit: params.faceLimit } : {}),
    };
    return this._createSimulatedTask('image_to_model', '/generation/image-to-model', payload, {
      prompt: hint,
      seed: 108,
      texture: payload.texture,
      pbr: payload.pbr,
      faceLimit: payload.face_limit || 0,
    });
  }

  async createMultiviewToModel(params = {}) {
    const tokens = Array.isArray(params.fileTokens) ? params.fileTokens : [];
    const hint = params.promptHint || 'Multiview 3D Hero Character';
    const payload = {
      files: tokens.map(t => ({ type: 'file_token', file_token: String(t) })),
      model: String(params.model || DEFAULT_MODEL_VERSION),
      texture: params.texture !== false,
      pbr: params.pbr !== false,
      ...(params.textureQuality ? { texture_quality: String(params.textureQuality) } : {}),
      ...(typeof params.quad === 'boolean' ? { quad: params.quad } : {}),
      ...(Number.isInteger(params.faceLimit) ? { face_limit: params.faceLimit } : {}),
    };
    return this._createSimulatedTask('multiview_to_model', '/generation/multiview-to-model', payload, {
      prompt: hint,
      seed: 256,
      texture: payload.texture,
      pbr: payload.pbr,
      faceLimit: payload.face_limit || 0,
    });
  }

  async rigCheck(originalTaskId) {
    const original = this.tasks.get(String(originalTaskId));
    const res = {
      taskId: `sim_rc_${crypto.randomBytes(6).toString('hex')}`,
      riggable: true,
      rigType: 'biped',
      sourceFound: Boolean(original),
    };
    this._trace('POST', '/animations/rig-check', { original_model_task_id: originalTaskId }, { riggable: true, rig_type: 'biped' });
    return res;
  }

  async createRigTask(params = {}) {
    const original = this.tasks.get(String(params.originalTaskId));
    const baseOpts = original?.glbOptions || { prompt: params.promptHint || 'Stylized Knight Character', texture: true, pbr: true };
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      rig_type: String(params.rigType || 'biped'),
      out_format: 'glb',
      spec: String(params.spec || 'mixamo'),
    };
    return this._createSimulatedTask('animate_rig', '/animations/rig', payload, {
      ...baseOpts,
      rigged: true,
      animationPreset: null,
    });
  }

  async createRetargetTask(params = {}) {
    const original = this.tasks.get(String(params.originalTaskId));
    const baseOpts = original?.glbOptions || { prompt: params.promptHint || 'Stylized Knight Character', texture: true, pbr: true };
    const animation = String(params.animation || 'preset:walk');
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      animation,
      out_format: 'glb',
      bake_animation: params.bakeAnimation !== false,
    };
    return this._createSimulatedTask('animate_retarget', '/animations/retarget', payload, {
      ...baseOpts,
      rigged: true,
      animationPreset: animation,
    });
  }

  async createConvertTask(params = {}) {
    const original = this.tasks.get(String(params.originalTaskId));
    const baseOpts = original?.glbOptions || { prompt: params.promptHint || 'Optimized Game Prop', texture: true, pbr: true };
    const faceLimit = Number.isInteger(params.faceLimit) ? params.faceLimit : 5000;
    const payload = {
      original_model_task_id: String(params.originalTaskId),
      format: String(params.format || 'GLTF').toUpperCase(),
      quad: Boolean(params.quad),
      face_limit: faceLimit,
      flatten_bottom: params.flattenBottom !== false,
    };
    return this._createSimulatedTask('convert_model', '/models/convert', payload, {
      ...baseOpts,
      faceLimit,
    });
  }

  async getTask(taskId, urlBase = 'sim://tripo3d') {
    const rec = this.tasks.get(String(taskId));
    if (!rec) {
      const err = new Error(`Simulated task not found: ${taskId}`);
      err.status = 404;
      throw err;
    }
    rec.pollCount += 1;
    if (rec.pollCount >= this.pollsToFinish) {
      rec.status = 'success';
      rec.progress = 100;
      if (!rec.settled) {
        rec.settled = true;
        this.frozen = Math.max(0, this.frozen - rec.cost);
      }
    } else {
      rec.status = 'running';
      rec.progress = Math.min(92, Math.round((rec.pollCount / this.pollsToFinish) * 90));
    }

    const modelUrl = rec.status === 'success' ? `${urlBase}/files/download/${encodeURIComponent(rec.taskId)}/model.glb` : null;
    const renderedImageUrl = rec.status === 'success' ? `${urlBase}/files/download/${encodeURIComponent(rec.taskId)}/preview.png` : null;

    this._trace('GET', `/tasks/${rec.taskId}`, null, { status: rec.status, progress: rec.progress });

    return {
      taskId: rec.taskId,
      type: rec.type,
      status: rec.status,
      progress: rec.progress,
      output: {
        modelUrl,
        renderedImageUrl,
        contentType: 'model/gltf-binary',
        fileName: 'model.glb',
      },
      error: null,
    };
  }

  async downloadAsset(assetUrl) {
    const m = String(assetUrl || '').match(/\/files\/download\/([^/]+)\/(model\.glb|preview\.png)$/);
    if (!m) {
      throw new Error(`Invalid simulated asset URL: ${assetUrl}`);
    }
    const taskId = decodeURIComponent(m[1]);
    const fileKind = m[2];
    const rec = this.tasks.get(taskId);
    if (!rec) {
      throw new Error(`Simulated asset not found for task ${taskId}`);
    }
    return fileKind === 'model.glb' ? Buffer.from(rec.glbBuffer) : Buffer.from(rec.previewBuffer);
  }
}

/**
 * Spins up an actual HTTP mock server implementing Tripo API v3 routes.
 * Used by automated tests to verify TripoV3Client over real TCP/HTTP sockets.
 */
function createMockTripoV3HttpServer(options = {}) {
  const expectedKey = String(options.expectedApiKey || 'tsk_test_mock_key_123456');
  const sim = new TripoV3Simulator({
    initialBalance: options.initialBalance ?? 500,
    pollsToFinish: options.pollsToFinish ?? 2,
  });

  function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.once('end', () => resolve(Buffer.concat(chunks)));
      req.once('error', reject);
    });
  }

  let baseUrl = '';
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname;

      // Signed download route
      const dlMatch = pathname.match(/^\/v3\/files\/download\/([^/]+)\/(model\.glb|preview\.png)$/);
      if (dlMatch && req.method === 'GET') {
        const buf = await sim.downloadAsset(pathname);
        res.writeHead(200, {
          'Content-Type': dlMatch[2] === 'model.glb' ? 'model/gltf-binary' : 'image/png',
          'Content-Length': buf.length,
        });
        res.end(buf);
        return;
      }

      // Check Bearer token on all API routes
      const auth = String(req.headers.authorization || '');
      if (auth !== `Bearer ${expectedKey}`) {
        return sendJson(res, 401, { code: 2001, message: 'Invalid Authorization Bearer key' });
      }

      if (pathname === '/v3/account/balance' && req.method === 'GET') {
        const bal = await sim.getBalance();
        return sendJson(res, 200, { code: 0, data: { balance: bal.balance, frozen: bal.frozen } });
      }

      if (pathname === '/v3/files' && req.method === 'POST') {
        const buf = await readBody(req);
        const up = await sim.uploadFile(buf, 'upload.png', 'image/png');
        return sendJson(res, 200, { code: 0, data: { file_token: up.fileToken } });
      }

      if (pathname === '/v3/generation/text-to-model' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const created = await sim.createTextToModel({
          prompt: json.prompt,
          model: json.model,
          negativePrompt: json.negative_prompt,
          texture: json.texture,
          pbr: json.pbr,
          textureQuality: json.texture_quality,
          quad: json.quad,
          faceLimit: json.face_limit,
          modelSeed: json.model_seed,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      if (pathname === '/v3/generation/image-to-model' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const created = await sim.createImageToModel({
          fileToken: json.file?.file_token || json.input,
          imageUrl: json.file?.url,
          model: json.model,
          texture: json.texture,
          pbr: json.pbr,
          faceLimit: json.face_limit,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      if (pathname === '/v3/generation/multiview-to-model' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const tokens = (json.files || []).map(f => f.file_token).filter(Boolean);
        const created = await sim.createMultiviewToModel({
          fileTokens: tokens,
          model: json.model,
          texture: json.texture,
          pbr: json.pbr,
          faceLimit: json.face_limit,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      if (pathname === '/v3/animations/rig-check' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const rc = await sim.rigCheck(json.original_model_task_id);
        return sendJson(res, 200, { code: 0, data: { task_id: rc.taskId, riggable: rc.riggable, rig_type: rc.rigType } });
      }

      if (pathname === '/v3/animations/rig' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const created = await sim.createRigTask({
          originalTaskId: json.original_model_task_id,
          rigType: json.rig_type,
          spec: json.spec,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      if (pathname === '/v3/animations/retarget' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const created = await sim.createRetargetTask({
          originalTaskId: json.original_model_task_id,
          animation: json.animation,
          bakeAnimation: json.bake_animation,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      if (pathname === '/v3/models/convert' && req.method === 'POST') {
        const json = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const created = await sim.createConvertTask({
          originalTaskId: json.original_model_task_id,
          format: json.format,
          quad: json.quad,
          faceLimit: json.face_limit,
          flattenBottom: json.flatten_bottom,
        });
        return sendJson(res, 200, { code: 0, data: { task_id: created.taskId } });
      }

      const taskMatch = pathname.match(/^\/v3\/tasks\/([^/]+)$/);
      if (taskMatch && req.method === 'GET') {
        const taskId = decodeURIComponent(taskMatch[1]);
        const task = await sim.getTask(taskId, baseUrl);
        return sendJson(res, 200, {
          code: 0,
          data: {
            task_id: task.taskId,
            type: task.type,
            status: task.status,
            progress: task.progress,
            output: task.status === 'success'
              ? {
                model_url: task.output.modelUrl,
                rendered_image_url: task.output.renderedImageUrl,
                model_mesh: {
                  url: task.output.modelUrl,
                  content_type: 'model/gltf-binary',
                  file_name: 'model.glb',
                },
              }
              : {},
          },
        });
      }

      return sendJson(res, 404, { code: 404, message: `Unknown mock Tripo v3 route: ${req.method} ${pathname}` });
    } catch (err) {
      return sendJson(res, err.status || 500, { code: err.status || 500, message: err.message });
    }
  });

  return {
    simulator: sim,
    async listen() {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}/v3`;
      return { port, baseUrl };
    },
    async close() {
      await new Promise(resolve => server.close(resolve));
    },
  };
}

module.exports = {
  CREDIT_COSTS,
  TripoV3Simulator,
  createMockTripoV3HttpServer,
};
