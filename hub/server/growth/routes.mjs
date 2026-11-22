/**
 * Flywheel 1 Growth Engine HTTP Routes (Admin & Public Read-Only Assignment).
 * - Public: GET /api/experiments/assign?experimentId=...
 * - Admin:
 *   - GET  /api/admin/growth/experiments
 *   - POST /api/admin/growth/experiments
 *   - POST /api/admin/growth/analyze-l0
 *   - GET  /api/admin/growth/runs
 */
import { ApiError, json, readJson, safeString } from '../security.mjs';
import { readCatalog } from '../catalog.mjs';
import { liveMetrics } from '../metrics.mjs';
import { ensureGrowthSchema } from './schema.mjs';
import { createExperiment, listExperiments, assignVariant } from './experiments.mjs';
import { runGrowthAnalystL0, listGrowthRuns } from './analyst-l0.mjs';

export function createGrowth({ db, rootDir, catalogOptions = {}, now = Date.now, audit = () => {}, rate = () => {}, sessionFor, adgame = null }) {
  ensureGrowthSchema(db);

  async function publicRoute(req, res, url) {
    const pathname = url.pathname;
    if (pathname === '/api/experiments/assign' && req.method === 'GET') {
      const experimentId = url.searchParams.get('experimentId') || '';
      if (!safeString(experimentId, 80)) throw new ApiError(400, 'EXPERIMENT_ID_REQUIRED');

      const session = sessionFor ? sessionFor(req, 'public') : null;
      const subjectId = session?.analytics_subject || url.searchParams.get('subjectId') || '';
      if (!safeString(subjectId, 160)) throw new ApiError(400, 'SUBJECT_ID_REQUIRED');

      const contextHash = url.searchParams.get('contextHash') || '';
      rate(`exp-assign:${subjectId}`, 300, 60000);

      const assignment = assignVariant(db, { experimentId, subjectId, contextHash, now });
      json(res, 200, assignment);
      return true;
    }
    return false;
  }

  async function adminRoute(req, res, url, s) {
    const pathname = url.pathname;

    if (pathname === '/api/admin/growth/experiments' && req.method === 'GET') {
      const status = url.searchParams.get('status') || null;
      const placementId = url.searchParams.get('placementId') || null;
      const experiments = listExperiments(db, { status, placementId });
      json(res, 200, { experiments });
      return true;
    }

    if (pathname === '/api/admin/growth/experiments' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const experiment = createExperiment(db, body, {
        createdBy: s?.admin_username || 'admin',
        now
      });
      audit('growth_experiment_created', experiment.id, {
        name: experiment.name,
        placementId: experiment.placementId,
        status: experiment.status
      });
      json(res, 201, { experiment });
      return true;
    }

    if (pathname === '/api/admin/growth/analyze-l0' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const games = readCatalog(rootDir, db, catalogOptions);
      const dataset = body.dataset === 'qa' ? 'qa' : 'live';
      const metrics = liveMetrics(db, games, now(), {
        dataset,
        from: body.from || null,
        to: body.to || null,
        gameId: body.gameId || null
      });
      let adgameFunnel = null;
      try {
        if (adgame?.service && typeof adgame.service.getFunnelSummary === 'function') {
          adgameFunnel = adgame.service.getFunnelSummary();
        }
      } catch {}

      const run = runGrowthAnalystL0(db, {
        metrics,
        adgameFunnel,
        triggerSource: safeString(body.triggerSource, 64) ? body.triggerSource : 'admin_api',
        createdBy: s?.admin_username || 'admin',
        now
      });
      audit('growth_analyst_l0_run', run.id, {
        hypothesesCount: run.hypotheses.length,
        topIceScore: run.summary.topIceScore
      });
      json(res, 201, { run });
      return true;
    }

    if (pathname === '/api/admin/growth/runs' && req.method === 'GET') {
      const level = url.searchParams.get('level') || null;
      const rawLimit = Number(url.searchParams.get('limit'));
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 25;
      const runs = listGrowthRuns(db, { level, limit });
      json(res, 200, { runs });
      return true;
    }

    return false;
  }

  return { publicRoute, adminRoute };
}
