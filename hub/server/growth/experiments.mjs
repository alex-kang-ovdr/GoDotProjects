/**
 * Growth Experimentation Engine (Pure Node 24 ESM, zero external deps):
 * - Deterministic SHA-256 hash bucketing (0..9999) + sticky assignments
 * - Pearson Chi-Square SRM (Sample Ratio Mismatch) detector with exact gamma tail p-value
 * - CUPED (Controlled-experiment Using Pre-Experiment Data) variance-reduced lift estimator
 */
import { createHash } from 'node:crypto';
import { ApiError, safeString, uid } from '../security.mjs';
import { ensureGrowthSchema } from './schema.mjs';

const VALID_STATUSES = new Set(['draft', 'running', 'paused', 'completed', 'rolled_back']);

export function computeBucket(experimentId, subjectId) {
  const hash = createHash('sha256')
    .update(`${String(experimentId)}:${String(subjectId)}`)
    .digest();
  return hash.readUInt32BE(0) % 10000;
}

function logGamma(z) {
  // Lanczos approximation (g = 7, n = 9), accurate to ~1e-13
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zm1 = z - 1;
  let x = p[0];
  for (let i = 1; i < p.length; i++) {
    x += p[i] / (zm1 + i);
  }
  const t = zm1 + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm1 + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 - P(a, x). */
function gammaUpperQ(a, x) {
  if (x <= 0) return 1;
  if (a <= 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    // Series representation for P(a, x)
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const p = sum * Math.exp(-x + a * Math.log(x) - gln);
    return Math.max(0, Math.min(1, 1 - p));
  }
  // Lentz's continued fraction for Q(a, x)
  const FPMIN = 1e-30;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - gln) * h));
}

function erfcApprox(x) {
  // Abramowitz & Stegun 7.1.26, max error ~1.5e-7
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const r = poly * Math.exp(-z * z);
  return x >= 0 ? r : 2 - r;
}

function normalTwoTailedPValue(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.max(0, Math.min(1, erfcApprox(Math.abs(z) / Math.SQRT2)));
}

/**
 * Pearson Chi-Square Sample Ratio Mismatch (SRM) detector.
 * Accepts parallel arrays (e.g. [500, 500], [50, 50]) or keyed objects ({ control: 500, treatment: 500 }).
 */
export function checkSrm(observedCounts, expectedWeights, { alpha = 0.001 } = {}) {
  let observed;
  let weights;
  let keys = null;

  if (Array.isArray(observedCounts) && Array.isArray(expectedWeights)) {
    observed = observedCounts.map(Number);
    weights = expectedWeights.map(Number);
  } else if (observedCounts && typeof observedCounts === 'object' && expectedWeights && typeof expectedWeights === 'object') {
    keys = Object.keys(expectedWeights);
    observed = keys.map(k => Number(observedCounts[k] ?? 0));
    weights = keys.map(k => Number(expectedWeights[k]));
  } else {
    throw new ApiError(422, 'SRM_INPUT_INVALID', 'observedCounts and expectedWeights must both be arrays or objects.');
  }

  if (observed.length < 2 || observed.length !== weights.length) {
    throw new ApiError(422, 'SRM_INPUT_INVALID', 'At least 2 variants with matching weights are required.');
  }
  if (observed.some(v => !Number.isFinite(v) || v < 0) || weights.some(w => !Number.isFinite(w) || w <= 0)) {
    throw new ApiError(422, 'SRM_INPUT_INVALID', 'Observed counts must be >= 0 and weights must be > 0.');
  }

  const totalObserved = observed.reduce((a, b) => a + b, 0);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const df = observed.length - 1;

  if (totalObserved === 0) {
    return {
      srmDetected: false,
      insufficientData: true,
      chiSquare: 0,
      pValue: 1,
      degreesOfFreedom: df,
      alpha,
      totalObserved: 0,
      observed,
      expected: weights.map(() => 0),
      ...(keys ? { variants: keys } : {})
    };
  }

  const expected = weights.map(w => (totalObserved * w) / weightSum);
  let chiSquare = 0;
  for (let i = 0; i < observed.length; i++) {
    const diff = observed[i] - expected[i];
    chiSquare += (diff * diff) / expected[i];
  }
  const pValue = gammaUpperQ(df / 2, chiSquare / 2);

  return {
    srmDetected: pValue < alpha,
    insufficientData: false,
    chiSquare: Number(chiSquare.toFixed(6)),
    pValue: Number(pValue.toPrecision(8)),
    degreesOfFreedom: df,
    alpha,
    totalObserved,
    observed,
    expected: expected.map(v => Number(v.toFixed(4))),
    ...(keys ? { variants: keys } : {})
  };
}

function normalizePair(pair) {
  if (Array.isArray(pair) && pair.length >= 2) {
    const pre = Number(pair[0]);
    const post = Number(pair[1]);
    if (Number.isFinite(pre) && Number.isFinite(post)) return { pre, post };
  } else if (pair && typeof pair === 'object') {
    const pre = Number(pair.pre);
    const post = Number(pair.post);
    if (Number.isFinite(pre) && Number.isFinite(post)) return { pre, post };
  }
  throw new ApiError(422, 'CUPED_PAIR_INVALID', 'Each observation must be [pre, post] or { pre, post } with finite numbers.');
}

function meanAndSampleVar(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let sumSq = 0;
  for (const v of values) {
    const d = v - mean;
    sumSq += d * d;
  }
  const variance = n > 1 ? sumSq / (n - 1) : 0;
  return { mean, variance };
}

/**
 * CUPED (Controlled-experiment Using Pre-Experiment Data) variance-reduced uplift estimator.
 * Takes (pre, post) pairs for control and treatment and returns raw vs CUPED variance reduction % and z-score.
 */
export function computeCupedLift(controlPairs, treatmentPairs, { alpha = 0.05 } = {}) {
  if (!Array.isArray(controlPairs) || !Array.isArray(treatmentPairs) || controlPairs.length < 2 || treatmentPairs.length < 2) {
    throw new ApiError(422, 'CUPED_SAMPLE_TOO_SMALL', 'Both controlPairs and treatmentPairs require at least 2 observations.');
  }

  const ctrl = controlPairs.map(normalizePair);
  const trt = treatmentPairs.map(normalizePair);
  const all = [...ctrl, ...trt];
  const nAll = all.length;

  const meanX = all.reduce((s, r) => s + r.pre, 0) / nAll;
  const meanY = all.reduce((s, r) => s + r.post, 0) / nAll;

  let covXY = 0;
  let varX = 0;
  let varY = 0;
  for (const r of all) {
    const dx = r.pre - meanX;
    const dy = r.post - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const theta = varX > 0 ? covXY / varX : 0;
  const correlation = varX > 0 && varY > 0 ? covXY / Math.sqrt(varX * varY) : 0;

  const ctrlRawY = ctrl.map(r => r.post);
  const trtRawY = trt.map(r => r.post);
  const ctrlCupedY = ctrl.map(r => r.post - theta * (r.pre - meanX));
  const trtCupedY = trt.map(r => r.post - theta * (r.pre - meanX));

  const ctrlRawStats = meanAndSampleVar(ctrlRawY);
  const trtRawStats = meanAndSampleVar(trtRawY);
  const rawLift = trtRawStats.mean - ctrlRawStats.mean;
  const rawSe = Math.sqrt(ctrlRawStats.variance / ctrl.length + trtRawStats.variance / trt.length);
  const rawZScore = rawSe > 0 ? rawLift / rawSe : 0;
  const rawPValue = normalTwoTailedPValue(rawZScore);

  const ctrlCupedStats = meanAndSampleVar(ctrlCupedY);
  const trtCupedStats = meanAndSampleVar(trtCupedY);
  const cupedLift = trtCupedStats.mean - ctrlCupedStats.mean;
  const cupedSe = Math.sqrt(ctrlCupedStats.variance / ctrl.length + trtCupedStats.variance / trt.length);
  const cupedZScore = cupedSe > 0 ? cupedLift / cupedSe : 0;
  const cupedPValue = normalTwoTailedPValue(cupedZScore);

  const rawPooledVar = (ctrlRawStats.variance + trtRawStats.variance) / 2;
  const cupedPooledVar = (ctrlCupedStats.variance + trtCupedStats.variance) / 2;
  const varianceReductionPct = rawPooledVar > 0
    ? Number((Math.max(0, 1 - cupedPooledVar / rawPooledVar) * 100).toFixed(2))
    : 0;

  return {
    nControl: ctrl.length,
    nTreatment: trt.length,
    theta: Number(theta.toFixed(6)),
    correlation: Number(correlation.toFixed(6)),
    varianceReductionPct,
    raw: {
      controlMean: Number(ctrlRawStats.mean.toFixed(6)),
      treatmentMean: Number(trtRawStats.mean.toFixed(6)),
      controlVariance: Number(ctrlRawStats.variance.toFixed(6)),
      treatmentVariance: Number(trtRawStats.variance.toFixed(6)),
      lift: Number(rawLift.toFixed(6)),
      relativeLift: ctrlRawStats.mean !== 0 ? Number((rawLift / Math.abs(ctrlRawStats.mean)).toFixed(6)) : null,
      se: Number(rawSe.toFixed(6)),
      zScore: Number(rawZScore.toFixed(6)),
      pValue: Number(rawPValue.toPrecision(6)),
      significant: rawPValue < alpha
    },
    cuped: {
      controlMean: Number(ctrlCupedStats.mean.toFixed(6)),
      treatmentMean: Number(trtCupedStats.mean.toFixed(6)),
      controlVariance: Number(ctrlCupedStats.variance.toFixed(6)),
      treatmentVariance: Number(trtCupedStats.variance.toFixed(6)),
      lift: Number(cupedLift.toFixed(6)),
      relativeLift: ctrlCupedStats.mean !== 0 ? Number((cupedLift / Math.abs(ctrlCupedStats.mean)).toFixed(6)) : null,
      se: Number(cupedSe.toFixed(6)),
      zScore: Number(cupedZScore.toFixed(6)),
      pValue: Number(cupedPValue.toPrecision(6)),
      significant: cupedPValue < alpha
    }
  };
}

function hydrateExperiment(db, row) {
  if (!row) return null;
  const variants = JSON.parse(row.variants_json);
  const weights = JSON.parse(row.weights_json);
  const guardrails = JSON.parse(row.guardrails_json || '{}');
  const countRows = db.prepare(
    'SELECT variant_id, COUNT(*) AS cnt FROM growth_experiment_assignments WHERE experiment_id=? GROUP BY variant_id'
  ).all(row.id);
  const countMap = new Map(countRows.map(r => [r.variant_id, Number(r.cnt || 0)]));
  const observedCounts = variants.map(v => countMap.get(v.id) || 0);
  const srm = checkSrm(observedCounts, weights);

  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis,
    placementId: row.placement_id,
    status: row.status,
    variants,
    weights,
    metricPrimary: row.metric_primary,
    guardrails,
    createdBy: row.created_by || null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    assignments: Object.fromEntries(variants.map((v, i) => [v.id, observedCounts[i]])),
    totalAssignments: observedCounts.reduce((a, b) => a + b, 0),
    srm
  };
}

export function createExperiment(db, input = {}, { createdBy = 'admin', now = Date.now } = {}) {
  ensureGrowthSchema(db);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 160) throw new ApiError(422, 'EXPERIMENT_NAME_INVALID');

  const id = safeString(input.id, 80) && /^[a-zA-Z0-9_-]{2,80}$/.test(input.id)
    ? input.id
    : `exp_${uid().replace(/-/g, '').slice(0, 12)}`;

  const rawVariants = Array.isArray(input.variants) && input.variants.length >= 2
    ? input.variants
    : [{ id: 'control', label: 'Control' }, { id: 'treatment', label: 'Treatment' }];

  const seenIds = new Set();
  const variants = rawVariants.map((v, idx) => {
    const vid = typeof v === 'string' ? v.trim() : String(v?.id || '').trim();
    if (!vid || !/^[a-zA-Z0-9_-]{1,64}$/.test(vid) || seenIds.has(vid)) {
      throw new ApiError(422, 'EXPERIMENT_VARIANTS_INVALID');
    }
    seenIds.add(vid);
    return typeof v === 'string'
      ? { id: vid, label: vid, config: {} }
      : { id: vid, label: String(v.label || vid).slice(0, 120), config: v.config && typeof v.config === 'object' ? v.config : {} };
  });

  const weights = Array.isArray(input.weights)
    ? input.weights.map(Number)
    : variants.map(() => Math.round(100 / variants.length));
  if (weights.length !== variants.length || weights.some(w => !Number.isFinite(w) || w <= 0)) {
    throw new ApiError(422, 'EXPERIMENT_WEIGHTS_INVALID');
  }

  const status = input.status ? String(input.status) : 'running';
  if (!VALID_STATUSES.has(status)) throw new ApiError(422, 'EXPERIMENT_STATUS_INVALID');

  const placementId = safeString(input.placementId || input.placement_id, 64)
    ? String(input.placementId || input.placement_id).trim()
    : 'home_grid';
  const hypothesis = typeof input.hypothesis === 'string' ? input.hypothesis.trim().slice(0, 1000) : '';
  const metricPrimary = safeString(input.metricPrimary || input.metric_primary, 64)
    ? String(input.metricPrimary || input.metric_primary).trim()
    : 'active_play_60s_rate';
  const guardrails = input.guardrails && typeof input.guardrails === 'object' && !Array.isArray(input.guardrails)
    ? input.guardrails
    : { maxErrorRateDelta: 0.005, maxLoadP90DeltaMs: 300 };

  const stamp = now();
  const existing = db.prepare('SELECT id FROM growth_experiments WHERE id=?').get(id);
  if (existing) throw new ApiError(409, 'EXPERIMENT_ALREADY_EXISTS');

  db.prepare(`
    INSERT INTO growth_experiments(
      id, name, hypothesis, placement_id, status,
      variants_json, weights_json, metric_primary, guardrails_json,
      created_by, started_at, ended_at, created_at, updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, name, hypothesis, placementId, status,
    JSON.stringify(variants), JSON.stringify(weights), metricPrimary, JSON.stringify(guardrails),
    createdBy || null, status === 'running' ? stamp : null, null, stamp, stamp
  );

  return getExperiment(db, id);
}

export function getExperiment(db, experimentId) {
  ensureGrowthSchema(db);
  const row = db.prepare('SELECT * FROM growth_experiments WHERE id=?').get(experimentId);
  return hydrateExperiment(db, row);
}

export function listExperiments(db, { status = null, placementId = null } = {}) {
  ensureGrowthSchema(db);
  const where = [];
  const args = [];
  if (status) { where.push('status=?'); args.push(status); }
  if (placementId) { where.push('placement_id=?'); args.push(placementId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM growth_experiments ${clause} ORDER BY updated_at DESC, id ASC`).all(...args);
  return rows.map(row => hydrateExperiment(db, row));
}

export function assignVariant(db, { experimentId, subjectId, contextHash = '', now = Date.now }) {
  ensureGrowthSchema(db);
  if (!safeString(experimentId, 80)) throw new ApiError(400, 'EXPERIMENT_ID_REQUIRED');
  if (!safeString(subjectId, 160)) throw new ApiError(400, 'SUBJECT_ID_REQUIRED');

  const expRow = db.prepare('SELECT * FROM growth_experiments WHERE id=?').get(experimentId);
  if (!expRow) throw new ApiError(404, 'EXPERIMENT_NOT_FOUND');

  const variants = JSON.parse(expRow.variants_json);
  const weights = JSON.parse(expRow.weights_json);

  // Sticky check first
  const existing = db.prepare(
    'SELECT * FROM growth_experiment_assignments WHERE experiment_id=? AND subject_id=?'
  ).get(experimentId, subjectId);
  if (existing) {
    const variantObj = variants.find(v => v.id === existing.variant_id) || variants[0];
    return {
      experimentId,
      subjectId,
      variantId: existing.variant_id,
      variant: variantObj,
      bucket: existing.bucket,
      contextHash: existing.context_hash,
      sticky: true,
      active: expRow.status === 'running',
      status: expRow.status,
      assignedAt: new Date(existing.assigned_at).toISOString()
    };
  }

  const bucket = computeBucket(experimentId, subjectId);

  // Non-running experiments fall back safely to control without polluting assignment counts
  if (expRow.status !== 'running') {
    const control = variants[0];
    return {
      experimentId,
      subjectId,
      variantId: control.id,
      variant: control,
      bucket,
      contextHash: String(contextHash || ''),
      sticky: false,
      active: false,
      status: expRow.status,
      assignedAt: null
    };
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  let chosen = variants[variants.length - 1];
  for (let i = 0; i < variants.length; i++) {
    cumulative += (weights[i] / totalWeight) * 10000;
    if (bucket < cumulative) {
      chosen = variants[i];
      break;
    }
  }

  const stamp = now();
  const safeCtx = String(contextHash || '').slice(0, 128);
  db.prepare(`
    INSERT OR IGNORE INTO growth_experiment_assignments(
      experiment_id, subject_id, variant_id, bucket, context_hash, assigned_at
    ) VALUES(?,?,?,?,?,?)
  `).run(experimentId, subjectId, chosen.id, bucket, safeCtx, stamp);

  return {
    experimentId,
    subjectId,
    variantId: chosen.id,
    variant: chosen,
    bucket,
    contextHash: safeCtx,
    sticky: false,
    active: true,
    status: expRow.status,
    assignedAt: new Date(stamp).toISOString()
  };
}
