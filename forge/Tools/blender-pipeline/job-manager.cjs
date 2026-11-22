'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { MeshEngineRegistry, POLICY_REQUIREMENTS } = require('./engine-adapter.cjs');
const { createBlenderCliAdapter } = require('./blender-cli-adapter.cjs');
const { createThreeJsCliAdapter } = require('./threejs-cli-adapter.cjs');
const { planFromPrompt } = require('./prompt-planner.cjs');
const { listAiModels, connectAiProvider, planWithAi } = require('./llm-planner.cjs');
const { generateConcept, generateModelingPrompt } = require('./concept-generator.cjs');

const MAX_BODY_BYTES = 512 * 1024;
const MAX_CONCURRENCY = 2;
const MAX_JOBS_RETAINED = 100;
const MAX_JOB_DIRS_RETAINED = 24;

function isValidId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{6,64}$/i.test(value);
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
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
      } else {
        chunks.push(chunk);
      }
    });
    req.once('end', () => {
      if (failed) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
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

class BlenderJobManager {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.storageDir = path.resolve(options.storageDir || path.join(this.root, 'Saved', 'Blender'));
    this.jobsDir = path.join(this.storageDir, 'jobs');
    this.assetsDir = path.join(this.storageDir, 'assets');
    this.conceptsDir = path.join(this.storageDir, 'concepts');
    fs.mkdirSync(this.jobsDir, { recursive: true });
    fs.mkdirSync(this.assetsDir, { recursive: true });
    fs.mkdirSync(this.conceptsDir, { recursive: true });

    this.maxConcurrency = Math.max(1, Number(options.maxConcurrency) || MAX_CONCURRENCY);
    this.agentChatProvider = options.agentChatProvider || null;
    this.registry = options.registry || new MeshEngineRegistry()
      .register(
        createBlenderCliAdapter({
          env: options.env,
          binaryPath: options.binaryPath,
          timeoutMs: options.timeoutMs,
        }),
        { isDefault: true }
      )
      .register(
        createThreeJsCliAdapter({
          timeoutMs: options.timeoutMs,
        })
      );

    this.jobs = new Map();
    this.queue = [];
    this.activeCount = 0;
    this.closed = false;
  }

  async getStatus() {
    const engines = await this.registry.probeAll();
    const active = engines.find(e => e.isDefault) || engines[0] || null;
    return {
      ok: true,
      available: Boolean(active?.available),
      defaultEngineId: this.registry.defaultEngineId,
      policy: POLICY_REQUIREMENTS,
      engines,
      queue: {
        active: this.activeCount,
        queued: this.queue.length,
        maxConcurrency: this.maxConcurrency,
        retainedJobs: this.jobs.size,
      },
      assetsCount: this.listAssets().length,
    };
  }

  async getModels() {
    return listAiModels(this.agentChatProvider);
  }

  async connectModelProvider(body) {
    return connectAiProvider(body, { agentChatProvider: this.agentChatProvider });
  }

  async createConcept(input) {
    return generateConcept(input, {
      conceptsDir: this.conceptsDir,
      agentChatProvider: this.agentChatProvider,
    });
  }

  listConcepts() {
    let dirs = [];
    try {
      dirs = fs.readdirSync(this.conceptsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && isValidId(e.name));
    } catch {
      return [];
    }
    const items = [];
    for (const entry of dirs) {
      const jsonPath = path.join(this.conceptsDir, entry.name, 'concept.json');
      try {
        items.push(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
      } catch { /* ignore */ }
    }
    return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  getConcept(conceptId) {
    if (!isValidId(conceptId)) return null;
    const jsonPath = path.join(this.conceptsDir, conceptId, 'concept.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      return null;
    }
  }

  getConceptImagePath(conceptId) {
    if (!isValidId(conceptId)) return null;
    const svgPath = path.join(this.conceptsDir, conceptId, 'concept.svg');
    return fs.existsSync(svgPath) ? svgPath : null;
  }

  async createModelingPrompt(input) {
    const concept = input?.conceptId ? this.getConcept(input.conceptId) : (input?.concept || null);
    return generateModelingPrompt(input, {
      concept,
      agentChatProvider: this.agentChatProvider,
    });
  }

  async plan(input) {
    const planned = await planWithAi(input, { agentChatProvider: this.agentChatProvider });
    return {
      ok: true,
      engineId: input?.engineId || this.registry.defaultEngineId,
      policy: POLICY_REQUIREMENTS,
      ...planned,
    };
  }

  submitJob(input = {}) {
    if (this.closed) {
      const err = new Error('Blender pipeline is shutting down');
      err.status = 503;
      throw err;
    }
    const rawPrompt = String(input.prompt || '').trim();
    if (!rawPrompt && !input.recipe) {
      const err = new Error('자연어 프롬프트(prompt) 또는 MeshRecipe(recipe)가 필요합니다.');
      err.status = 400;
      throw err;
    }

    const engineId = input.engineId || this.registry.defaultEngineId;
    const adapter = this.registry.get(engineId);
    const aiProvider = String(input.aiProvider || 'auto').trim();
    const aiModel = String(input.aiModel || '').trim();

    // If structured recipe or offline heuristic is requested, plan synchronously;
    // otherwise plan asynchronously via the selected LLM in Phase A ('planning').
    const syncPlan = (input.recipe || aiProvider === 'heuristic' || !this.agentChatProvider)
      ? planFromPrompt(input)
      : null;

    const jobId = 'job_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const projectId = typeof input.projectId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input.projectId)
      ? input.projectId
      : null;

    const conceptId = typeof input.conceptId === 'string' && isValidId(input.conceptId) ? input.conceptId : null;
    const conceptImageUrl = conceptId ? `/api/blender/concepts/${conceptId}/image.svg` : null;

    const job = {
      id: jobId,
      status: syncPlan ? 'queued' : 'planning',
      projectId,
      conceptId,
      conceptImageUrl,
      engineId: adapter.id,
      policy: { ...adapter.policy },
      prompt: rawPrompt || `Custom ${input.recipe?.archetype || 'prop'}`,
      ai: input.ai && typeof input.ai === 'object'
        ? input.ai
        : {
            provider: syncPlan ? (input.recipe ? 'direct-recipe' : 'heuristic') : aiProvider,
            model: syncPlan ? (input.recipe ? 'structured' : 'offline-v1') : (aiModel || 'default'),
            usedLlm: false,
          },
      plan: syncPlan?.plan || null,
      recipe: syncPlan?.recipe || null,
      placement: syncPlan?.placement || null,
      autoImport: input.autoImport !== false,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      asset: null,
      metrics: null,
      ipc: null,
      warnings: [],
      error: null,
      logs: null,
    };

    this.jobs.set(jobId, job);
    while (this.jobs.size > MAX_JOBS_RETAINED) {
      const oldestKey = this.jobs.keys().next().value;
      if (oldestKey === jobId) break;
      this.jobs.delete(oldestKey);
    }

    let resolveDone;
    const donePromise = new Promise(resolve => { resolveDone = resolve; });
    this.queue.push({ job, adapter, input, needsAiPlan: !syncPlan, resolveDone });
    this._pump();

    return { job: this._publicJob(job), donePromise };
  }

  _pump() {
    while (!this.closed && this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.activeCount += 1;
      this._runItem(item).finally(() => {
        this.activeCount -= 1;
        this._pump();
      });
    }
  }

  async _runItem({ job, adapter, input, needsAiPlan, resolveDone }) {
    const jobDir = path.join(this.jobsDir, job.id);
    job.startedAt = new Date().toISOString();
    try {
      if (needsAiPlan) {
        job.status = 'planning';
        const planned = await planWithAi(input, { agentChatProvider: this.agentChatProvider });
        job.plan = planned.plan;
        job.recipe = planned.recipe;
        job.placement = planned.placement;
        job.ai = planned.ai || job.ai;
        if (planned.ai?.warning) {
          job.warnings.push(planned.ai.warning);
        }
      }

      job.status = 'running';
      await fs.promises.mkdir(jobDir, { recursive: true });
      const result = await adapter.execute({
        jobId: job.id,
        jobDir,
        recipe: job.recipe,
        operation: 'generate_prop',
      });

      const assetId = 'ast_' + crypto.randomBytes(8).toString('hex');
      const assetDir = path.join(this.assetsDir, assetId);
      await fs.promises.mkdir(assetDir, { recursive: true });

      const glbTarget = path.join(assetDir, 'model.glb');
      await fs.promises.writeFile(glbTarget, result.glbBuffer);

      const fileSlug = `${job.recipe.name.toLowerCase()}_${assetId.slice(4, 10)}`;
      const manifest = {
        schemaVersion: 1,
        assetId,
        jobId: job.id,
        projectId: job.projectId,
        conceptId: job.conceptId || null,
        conceptImageUrl: job.conceptImageUrl || null,
        name: job.recipe.name,
        slug: fileSlug,
        prompt: job.prompt,
        ai: job.ai,
        engine: result.engine,
        policy: { ...adapter.policy },
        recipe: job.recipe,
        placement: job.placement,
        artifact: {
          format: 'GLB',
          bytes: result.glbValidation.bytes,
          sha256: result.glbValidation.sha256,
          gltfVersion: result.glbValidation.gltfVersion,
          generator: result.glbValidation.generator,
          meshCount: result.glbValidation.meshCount,
          nodeCount: result.glbValidation.nodeCount,
          materialCount: result.glbValidation.materialCount,
          url: `/api/blender/assets/${assetId}/model.glb`,
          manifestUrl: `/api/blender/assets/${assetId}/manifest.json`,
          suggestedResPath: `res://assets/blender/${fileSlug}.glb`,
        },
        metrics: result.metrics,
        createdAt: new Date().toISOString(),
      };
      await fs.promises.writeFile(path.join(assetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      job.status = 'succeeded';
      job.finishedAt = new Date().toISOString();
      job.asset = manifest;
      job.metrics = result.metrics;
      job.warnings = result.warnings || [];
      job.ipc = result.ipc || null;
      job.logs = {
        exitCode: result.logs?.exitCode ?? 0,
        stdoutTail: String(result.logs?.stdout || '').slice(-2000),
        stderrTail: String(result.logs?.stderr || '').slice(-2000),
      };
      this._pruneOldJobDirs();
    } catch (err) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.error = err.message || '3D generation job failed';
      job.logs = err.logs ? {
        stdoutTail: String(err.logs.stdout || '').slice(-2000),
        stderrTail: String(err.logs.stderr || '').slice(-2000),
      } : null;
    } finally {
      resolveDone(this._publicJob(job));
    }
  }

  _pruneOldJobDirs() {
    try {
      const entries = fs.readdirSync(this.jobsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
          const full = path.join(this.jobsDir, e.name);
          const stat = fs.statSync(full);
          return { full, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const stale of entries.slice(MAX_JOB_DIRS_RETAINED)) {
        fs.rmSync(stale.full, { recursive: true, force: true });
      }
    } catch {
      // Non-fatal cleanup error
    }
  }

  _publicJob(job) {
    return JSON.parse(JSON.stringify(job));
  }

  getJob(jobId) {
    if (!isValidId(jobId)) return null;
    const job = this.jobs.get(jobId);
    return job ? this._publicJob(job) : null;
  }

  listJobs(projectId = null) {
    const items = [...this.jobs.values()]
      .filter(job => !projectId || job.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(job => this._publicJob(job));
    return items;
  }

  listAssets(projectId = null) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(this.assetsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && isValidId(e.name));
    } catch {
      return [];
    }
    const assets = [];
    for (const entry of dirs) {
      const manifestPath = path.join(this.assetsDir, entry.name, 'manifest.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!projectId || manifest.projectId === projectId) {
          assets.push(manifest);
        }
      } catch {
        // Ignore corrupt or partial entry
      }
    }
    return assets.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  getAssetManifest(assetId) {
    if (!isValidId(assetId)) return null;
    const manifestPath = path.join(this.assetsDir, assetId, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }

  getAssetGlbPath(assetId) {
    if (!isValidId(assetId)) return null;
    const glbPath = path.join(this.assetsDir, assetId, 'model.glb');
    return fs.existsSync(glbPath) ? glbPath : null;
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
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.job.status = 'failed';
      item.job.error = 'Server shutting down';
      item.resolveDone(this._publicJob(item.job));
    }
  }
}

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function createBlenderPipelineHandler(root, options = {}) {
  const manager = new BlenderJobManager(root, options);

  async function handle(req, res, parsedUrl) {
    const pathname = parsedUrl?.pathname || new URL(req.url || '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/blender')) return false;
    const method = req.method || 'GET';

    try {
      if (pathname === '/api/blender/status' && method === 'GET') {
        sendJson(res, 200, await manager.getStatus());
        return true;
      }

      if (pathname === '/api/blender/models' && method === 'GET') {
        sendJson(res, 200, await manager.getModels());
        return true;
      }

      if (pathname === '/api/blender/models/connect' && method === 'POST') {
        const remote = req.socket?.remoteAddress || '';
        const hasProxy = ['x-forwarded-for', 'cf-connecting-ip', 'forwarded'].some(h => req.headers[h] != null);
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || hasProxy) {
          sendJson(res, 403, { ok: false, error: 'AI 공급자 OAuth/API 키 연결은 보안상 로컬 호스트(127.0.0.1)에서만 허용됩니다.' });
          return true;
        }
        const body = await readJsonBody(req);
        sendJson(res, 200, await manager.connectModelProvider(body));
        return true;
      }

      if (pathname === '/api/blender/concept' && method === 'POST') {
        const body = await readJsonBody(req);
        sendJson(res, 201, await manager.createConcept(body));
        return true;
      }

      if (pathname === '/api/blender/concepts' && method === 'GET') {
        sendJson(res, 200, { ok: true, concepts: manager.listConcepts() });
        return true;
      }

      const conceptImgRoute = pathname.match(/^\/api\/blender\/concepts\/([a-z0-9_-]{6,64})\/image\.svg$/i);
      if (conceptImgRoute && method === 'GET') {
        const svgPath = manager.getConceptImagePath(conceptImgRoute[1]);
        if (!svgPath) {
          sendJson(res, 404, { ok: false, error: 'Concept image not found' });
          return true;
        }
        const bytes = await fs.promises.readFile(svgPath);
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Length': bytes.length,
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(bytes);
        return true;
      }

      if (pathname === '/api/blender/prompt' && method === 'POST') {
        const body = await readJsonBody(req);
        sendJson(res, 200, await manager.createModelingPrompt(body));
        return true;
      }

      if (pathname === '/api/blender/plan' && method === 'POST') {
        const body = await readJsonBody(req);
        sendJson(res, 200, await manager.plan(body));
        return true;
      }

      if (pathname === '/api/blender/jobs' && method === 'GET') {
        const projectId = parsedUrl?.searchParams?.get('projectId') || null;
        sendJson(res, 200, { ok: true, jobs: manager.listJobs(projectId) });
        return true;
      }

      if (pathname === '/api/blender/jobs' && method === 'POST') {
        const body = await readJsonBody(req);
        const { job, donePromise } = manager.submitJob(body);
        if (body.sync === true || parsedUrl?.searchParams?.get('sync') === '1') {
          const completed = await donePromise;
          sendJson(res, completed.status === 'succeeded' ? 201 : 500, {
            ok: completed.status === 'succeeded',
            job: completed,
          });
        } else {
          sendJson(res, 202, { ok: true, job });
        }
        return true;
      }

      const jobRoute = pathname.match(/^\/api\/blender\/jobs\/([a-z0-9_-]{6,64})$/i);
      if (jobRoute && method === 'GET') {
        const job = manager.getJob(jobRoute[1]);
        if (!job) {
          sendJson(res, 404, { ok: false, error: 'Blender job not found' });
          return true;
        }
        sendJson(res, 200, { ok: true, job });
        return true;
      }

      if (pathname === '/api/blender/assets' && method === 'GET') {
        const projectId = parsedUrl?.searchParams?.get('projectId') || null;
        sendJson(res, 200, { ok: true, assets: manager.listAssets(projectId) });
        return true;
      }

      const assetGlbRoute = pathname.match(/^\/api\/blender\/assets\/([a-z0-9_-]{6,64})\/model\.glb$/i);
      if (assetGlbRoute && method === 'GET') {
        const glbPath = manager.getAssetGlbPath(assetGlbRoute[1]);
        if (!glbPath) {
          sendJson(res, 404, { ok: false, error: 'Blender GLB asset not found' });
          return true;
        }
        const bytes = await fs.promises.readFile(glbPath);
        res.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': bytes.length,
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(bytes);
        return true;
      }

      const assetManifestRoute = pathname.match(/^\/api\/blender\/assets\/([a-z0-9_-]{6,64})\/manifest\.json$/i);
      if (assetManifestRoute && method === 'GET') {
        const manifest = manager.getAssetManifest(assetManifestRoute[1]);
        if (!manifest) {
          sendJson(res, 404, { ok: false, error: 'Blender asset manifest not found' });
          return true;
        }
        sendJson(res, 200, { ok: true, asset: manifest });
        return true;
      }

      const assetDeleteRoute = pathname.match(/^\/api\/blender\/assets\/([a-z0-9_-]{6,64})$/i);
      if (assetDeleteRoute && method === 'DELETE') {
        const deleted = manager.deleteAsset(assetDeleteRoute[1]);
        sendJson(res, deleted ? 200 : 404, deleted
          ? { ok: true, deleted: true, assetId: assetDeleteRoute[1] }
          : { ok: false, error: 'Blender asset not found' });
        return true;
      }

      sendJson(res, 404, { ok: false, error: 'Unknown Blender pipeline endpoint' });
      return true;
    } catch (err) {
      sendJson(res, err.status || 400, { ok: false, error: err.message || 'Blender pipeline request failed' });
      return true;
    }
  }

  handle.manager = manager;
  handle.close = () => manager.close();
  return handle;
}

module.exports = {
  BlenderJobManager,
  createBlenderPipelineHandler,
};
