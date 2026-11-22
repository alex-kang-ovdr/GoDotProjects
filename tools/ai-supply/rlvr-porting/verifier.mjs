// N1 — Cross-Engine RLVR Reward Verifier & Bounded K-Candidate Repair Harness
// Pure Node 24 ESM (zero external dependencies)
// Formula: R_RLVR = 0.25*R_parse + 0.20*R_transpile + 0.35*R_runtime + 0.20*R_visual

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const RLVR_REWARD_WEIGHTS = Object.freeze({
  parse: 0.25,
  transpile: 0.20,
  runtime: 0.35,
  visual: 0.20,
});

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function safeNonNegative(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

/**
 * Computes the continuous verifiable RLVR reward in [0, 1] with full component diagnostics.
 *
 * R_RLVR = 0.25 * (1 - staticErrors / checkedScripts)
 *        + 0.20 * (1 - todoFallbackLines / totalCodeLines)
 *        + 0.35 * (runtimePassed / runtimeTotal)
 *        + 0.20 * I(pixelGatePass)
 */
export function computeRlvrReward({
  staticErrors = 0,
  checkedScripts = 1,
  todoFallbackLines = 0,
  totalCodeLines = 1,
  runtimePassed = 0,
  runtimeTotal = 0,
  pixelGatePass = false,
} = {}) {
  const sErr = safeNonNegative(staticErrors);
  const sTotal = safeNonNegative(checkedScripts);
  const tTodo = safeNonNegative(todoFallbackLines);
  const tLines = safeNonNegative(totalCodeLines);
  const rPass = safeNonNegative(runtimePassed);
  const rTotal = safeNonNegative(runtimeTotal);
  const visualPass = Boolean(pixelGatePass);

  const rParse = sTotal > 0 ? clamp01(1 - sErr / sTotal) : (sErr === 0 ? 1 : 0);
  const rTranspile = tLines > 0 ? clamp01(1 - tTodo / tLines) : (tTodo === 0 ? 1 : 0);
  const rRuntime = rTotal > 0 ? clamp01(rPass / rTotal) : 0;
  const rVisual = visualPass ? 1 : 0;

  const wParse = RLVR_REWARD_WEIGHTS.parse * rParse;
  const wTranspile = RLVR_REWARD_WEIGHTS.transpile * rTranspile;
  const wRuntime = RLVR_REWARD_WEIGHTS.runtime * rRuntime;
  const wVisual = RLVR_REWARD_WEIGHTS.visual * rVisual;

  const reward = clamp01(wParse + wTranspile + wRuntime + wVisual);

  const failedGates = [];
  if (rParse < 1) failedGates.push('parse');
  if (rTranspile < 1) failedGates.push('transpile');
  if (rRuntime < 1) failedGates.push('runtime');
  if (rVisual < 1) failedGates.push('visual');

  return {
    reward: Number(reward.toFixed(6)),
    components: {
      rParse: Number(rParse.toFixed(6)),
      rTranspile: Number(rTranspile.toFixed(6)),
      rRuntime: Number(rRuntime.toFixed(6)),
      rVisual,
    },
    weighted: {
      parse: Number(wParse.toFixed(6)),
      transpile: Number(wTranspile.toFixed(6)),
      runtime: Number(wRuntime.toFixed(6)),
      visual: Number(wVisual.toFixed(6)),
    },
    diagnostics: {
      staticErrors: sErr,
      checkedScripts: sTotal,
      todoFallbackLines: tTodo,
      totalCodeLines: tLines,
      runtimePassed: rPass,
      runtimeTotal: rTotal,
      pixelGatePass: visualPass,
      failedGates,
      passedAllGates: failedGates.length === 0,
    },
  };
}

/**
 * Stage A deterministic GDScript repair rules (0ms, $0) aligned with UnityConverter & RobloxConverter.
 */
export function applyDeterministicGdscriptRepairs(code) {
  let next = String(code ?? '');
  const appliedRules = [];

  // Rule 1: FIX_GDSCRIPT_TYPE_INFERENCE — replace ambiguous `:=` on Variant-returning calls with `=`
  const inferRe = /^(\s*var\s+[A-Za-z_]\w*)\s*:=\s*(.+\.(?:get_node|get|duplicate|instantiate|call|get_meta|get_async)\s*\()/gm;
  if (inferRe.test(next)) {
    next = next.replace(inferRe, '$1 = $2');
    appliedRules.push('FIX_GDSCRIPT_TYPE_INFERENCE');
  }

  // Rule 2: FIX_EMISSION_OP_MULTIPLY — Godot 4 StandardMaterial3D emission energy separation
  const emissionRe = /(\b\w+\.emission)\s*=\s*([^*\r\n]+)\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g;
  if (emissionRe.test(next)) {
    next = next.replace(emissionRe, (_m, target, colorExpr, energy) => {
      const obj = target.slice(0, -'.emission'.length);
      return `${obj}.emission = ${colorExpr.trim()}\n${obj}.emission_energy_multiplier = ${energy}`;
    });
    appliedRules.push('FIX_EMISSION_OP_MULTIPLY');
  }

  // Rule 3: FIX_LUAU_NOT_EQUAL — leftover Luau `~=` operator
  if (next.includes('~=')) {
    next = next.replace(/~=/g, '!=');
    appliedRules.push('FIX_LUAU_NOT_EQUAL');
  }

  return {
    code: next,
    changed: next !== String(code ?? ''),
    appliedRules,
  };
}

function normalizeOracleEvaluation(raw) {
  if (raw && typeof raw === 'object' && typeof raw.reward === 'number') {
    return {
      reward: clamp01(raw.reward),
      diagnostics: raw.diagnostics ?? {},
      components: raw.components ?? null,
    };
  }
  if (raw && typeof raw === 'object' && (
    'staticErrors' in raw ||
    'runtimePassed' in raw ||
    'pixelGatePass' in raw ||
    'todoFallbackLines' in raw
  )) {
    const computed = computeRlvrReward(raw);
    return {
      reward: computed.reward,
      diagnostics: computed.diagnostics,
      components: computed.components,
    };
  }
  throw new Error('evaluateOracle must return either { reward, diagnostics } or computeRlvrReward metrics');
}

function computeGrpoAdvantages(rewards) {
  if (!rewards.length) return [];
  const mean = rewards.reduce((acc, v) => acc + v, 0) / rewards.length;
  const variance = rewards.reduce((acc, v) => acc + (v - mean) ** 2, 0) / rewards.length;
  const std = Math.sqrt(variance);
  return rewards.map((r) => (std > 1e-8 ? Number(((r - mean) / std).toFixed(6)) : 0));
}

function appendTrajectoryLine(logPath, record) {
  if (!logPath) return;
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Runs a 2-stage bounded RLVR repair loop:
 *   Stage A: Deterministic repair pass (optional or default GDScript rules)
 *   Stage B: K-candidate verifier-guided sampling up to maxIterations
 * Records structured RLVR/GRPO trajectories to JSONL when trajectoryLogPath is given.
 */
export async function runBoundedRepairLoop({
  initialCandidate,
  evaluateOracle,
  proposeCandidates,
  applyDeterministicRepair = null,
  promptContext = {},
  maxIterations = 3,
  kCandidates = 4,
  targetReward = 0.99,
  trajectoryLogPath = null,
} = {}) {
  if (typeof evaluateOracle !== 'function') {
    throw new TypeError('runBoundedRepairLoop requires an evaluateOracle function');
  }
  if (typeof proposeCandidates !== 'function') {
    throw new TypeError('runBoundedRepairLoop requires a proposeCandidates function');
  }

  const boundedMaxIter = Math.max(1, Math.floor(maxIterations));
  const boundedK = Math.max(1, Math.floor(kCandidates));
  const goalReward = clamp01(targetReward);

  const initialEval = normalizeOracleEvaluation(await evaluateOracle(initialCandidate, { iteration: 0, stage: 'initial' }));
  let best = {
    code: initialCandidate,
    reward: initialEval.reward,
    diagnostics: initialEval.diagnostics,
    components: initialEval.components,
  };
  const initialReward = initialEval.reward;
  let stageARules = [];
  let stageAImproved = false;

  // Stage A: Deterministic repair (0ms, $0) before spending LLM candidate budget
  if (best.reward < goalReward && typeof applyDeterministicRepair === 'function') {
    const repaired = await applyDeterministicRepair(best.code, best.diagnostics);
    const repairedCode = typeof repaired === 'string' ? repaired : repaired?.code;
    const rules = Array.isArray(repaired?.appliedRules) ? repaired.appliedRules : [];
    if (typeof repairedCode === 'string' && repairedCode !== best.code) {
      const detEval = normalizeOracleEvaluation(await evaluateOracle(repairedCode, { iteration: 0, stage: 'deterministic' }));
      if (detEval.reward > best.reward) {
        stageARules = rules;
        stageAImproved = true;
        best = {
          code: repairedCode,
          reward: detEval.reward,
          diagnostics: detEval.diagnostics,
          components: detEval.components,
        };
      }
    }
  }

  const trajectory = [];
  let iterationsRun = 0;

  // Stage B: Bounded K-candidate verifier-guided repair loop
  for (let iteration = 1; iteration <= boundedMaxIter && best.reward < goalReward; iteration++) {
    iterationsRun = iteration;
    const previousReward = best.reward;
    const rawCandidates = await proposeCandidates({
      iteration,
      kCandidates: boundedK,
      currentCode: best.code,
      currentReward: best.reward,
      diagnostics: best.diagnostics,
      promptContext,
      history: trajectory,
    });

    const candidateList = (Array.isArray(rawCandidates) ? rawCandidates : [])
      .slice(0, boundedK)
      .map((entry) => (typeof entry === 'string' ? { code: entry } : entry))
      .filter((entry) => entry && typeof entry.code === 'string');

    if (candidateList.length === 0) {
      break;
    }

    const evaluated = [];
    for (let idx = 0; idx < candidateList.length; idx++) {
      const cand = candidateList[idx];
      const evalRes = normalizeOracleEvaluation(
        await evaluateOracle(cand.code, { iteration, candidateIndex: idx, stage: 'verifier_guided' })
      );
      evaluated.push({
        code: cand.code,
        reward: evalRes.reward,
        diagnostics: evalRes.diagnostics,
        ...(cand.metadata ? { metadata: cand.metadata } : {}),
      });
    }

    const advantages = computeGrpoAdvantages(evaluated.map((c) => c.reward));
    let bestIndex = 0;
    for (let i = 0; i < evaluated.length; i++) {
      evaluated[i].advantage = advantages[i];
      if (evaluated[i].reward > evaluated[bestIndex].reward) {
        bestIndex = i;
      }
    }

    const winning = evaluated[bestIndex];
    const improved = winning.reward > best.reward;

    const record = {
      iteration,
      timestamp: new Date().toISOString(),
      promptContext,
      previousReward,
      candidates: evaluated,
      bestIndex,
      bestReward: winning.reward,
      improved,
    };

    trajectory.push(record);
    appendTrajectoryLine(trajectoryLogPath, record);

    if (improved) {
      best = {
        code: winning.code,
        reward: winning.reward,
        diagnostics: winning.diagnostics,
        components: null,
      };
    }
  }

  return {
    converged: best.reward >= goalReward,
    targetReward: goalReward,
    iterationsRun,
    stageAImproved,
    stageARules,
    initialReward,
    bestCode: best.code,
    bestReward: best.reward,
    bestDiagnostics: best.diagnostics,
    trajectory,
  };
}
