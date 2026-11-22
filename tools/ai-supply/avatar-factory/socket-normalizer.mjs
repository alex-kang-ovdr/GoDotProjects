// N2 — Rig Socket Scale Normalizer (kaykit_v1 vs robot_expressive_v1) & VLM Critique Rubric
// Pure Node 24 ESM (zero external dependencies)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_AVATAR_CATALOG_PATH = resolve(
  __dirname,
  '../../../forge/Godot/addons/playforge_avatar/catalog.json'
);

export const CANONICAL_SLOTS = Object.freeze(['head', 'back', 'hand_r', 'hand_l']);

export const SLOT_CANONICAL_RULES = Object.freeze({
  head: Object.freeze({
    pivotConvention: 'bottom_center',
    description: 'Headwear sits on top of head socket with bottom-center pivot near Y=0 and X/Z width ~0.25-0.35m (hard max 1.2m).',
    idealWidthRangeMeters: [0.18, 0.58],
    maxExtentMeters: 1.2,
    maxCenterDriftX: 0.15,
    minBottomY: -0.15,
  }),
  back: Object.freeze({
    pivotConvention: 'front_face_z0',
    description: 'Back attachment rests against torso with front face near Z=0, centered on X.',
    maxExtentMeters: 1.2,
    maxCenterDriftX: 0.15,
    zPlaneTolerance: 0.25,
  }),
  hand_r: Object.freeze({
    pivotConvention: 'handle_origin_plus_y',
    description: 'Right-hand prop handle at origin [0,0,0] extending along +Y axis.',
    maxExtentMeters: 1.2,
    minPositiveYExtent: 0.05,
    handleOriginTolerance: 0.35,
  }),
  hand_l: Object.freeze({
    pivotConvention: 'handle_origin_plus_y',
    description: 'Left-hand prop handle at origin [0,0,0] extending along +Y axis.',
    maxExtentMeters: 1.2,
    minPositiveYExtent: 0.05,
    handleOriginTolerance: 0.35,
  }),
});

export function loadAvatarRigProfiles(catalogPath = DEFAULT_AVATAR_CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (!catalog?.rigProfiles || typeof catalog.rigProfiles !== 'object') {
    throw new Error(`Invalid avatar catalog at ${catalogPath}: missing rigProfiles`);
  }
  return {
    catalogVersion: catalog.catalogVersion || null,
    attachmentSlots: catalog.attachmentSlots || [],
    rigProfiles: catalog.rigProfiles,
  };
}

/**
 * Verifies the ~100x bone-space scale compensation math between kaykit_v1 (meter bones,
 * socket scales 0.85..1.95) and robot_expressive_v1 (centimeter bone space 0.01x,
 * socket scales 0.016..0.025) across all 4 canonical slots: head, back, hand_r, hand_l.
 */
export function verifyRigSocketScaleCompensation(rigProfiles, options = {}) {
  const {
    meterRigId = 'kaykit_v1',
    centimeterRigId = 'robot_expressive_v1',
    boneSpaceUnitFactor = 100, // robot_expressive_v1 bones are authored at 100x cm scale
    minRawRatio = 40,
    maxRawRatio = 100,
    maxWorldScaleDivergence = 2.0,
  } = options;

  const meterRig = rigProfiles?.[meterRigId];
  const cmRig = rigProfiles?.[centimeterRigId];
  if (!meterRig || !cmRig) {
    throw new Error(`Missing required rig profiles: ${meterRigId}, ${centimeterRigId}`);
  }

  const slotReports = {};
  const violations = [];

  for (const slot of CANONICAL_SLOTS) {
    const mSock = meterRig.sockets?.[slot];
    const cSock = cmRig.sockets?.[slot];
    if (!mSock || !cSock) {
      violations.push({ code: 'SOCKET_MISSING', slot, message: `Slot "${slot}" missing on one of the rig profiles` });
      continue;
    }

    const mScale = Number(mSock.scale?.[0] ?? 0);
    const cScale = Number(cSock.scale?.[0] ?? 0);
    const rawRatio = cScale > 0 ? mScale / cScale : Infinity;

    const meterWorldScale = Number((meterRig.modelScale * mScale).toFixed(4));
    const cmWorldScale = Number((cmRig.modelScale * boneSpaceUnitFactor * cScale).toFixed(4));
    const worldScaleRatio = cmWorldScale > 0 ? Number((meterWorldScale / cmWorldScale).toFixed(4)) : Infinity;

    const uniformMeter = mSock.scale.every((v) => Math.abs(v - mScale) < 1e-6);
    const uniformCm = cSock.scale.every((v) => Math.abs(v - cScale) < 1e-6);

    const slotOk =
      uniformMeter &&
      uniformCm &&
      rawRatio >= minRawRatio &&
      rawRatio <= maxRawRatio &&
      worldScaleRatio >= 1 / maxWorldScaleDivergence &&
      worldScaleRatio <= maxWorldScaleDivergence;

    if (!slotOk) {
      violations.push({
        code: 'SCALE_COMPENSATION_OUT_OF_RANGE',
        slot,
        rawRatio: Number(rawRatio.toFixed(3)),
        worldScaleRatio,
        message: `Slot "${slot}" scale compensation outside expected bounds`,
      });
    }

    slotReports[slot] = {
      slot,
      meterRigBone: mSock.bone,
      cmRigBone: cSock.bone,
      meterSocketScale: mScale,
      cmSocketScale: cScale,
      rawSocketScaleRatio: Number(rawRatio.toFixed(3)),
      meterWorldScale,
      cmWorldScale,
      worldScaleRatio,
      uniformScale: uniformMeter && uniformCm,
      ok: slotOk,
    };
  }

  return {
    ok: violations.length === 0 && Object.keys(slotReports).length === CANONICAL_SLOTS.length,
    meterRigId,
    centimeterRigId,
    boneSpaceUnitFactor,
    slots: slotReports,
    violations,
  };
}

/**
 * Checks whether an attachment bounding box obeys canonical meter-unit & pivot conventions
 * for a given slot (`head`, `back`, `hand_r`, `hand_l`) so it fits both kaykit_v1 and
 * robot_expressive_v1 without clipping or 100x scale drift.
 */
export function computeCanonicalAttachmentChecks(bbox, slot) {
  const rule = SLOT_CANONICAL_RULES[slot];
  if (!rule) {
    throw new Error(`Unknown attachment slot "${slot}". Expected one of: ${CANONICAL_SLOTS.join(', ')}`);
  }
  if (!bbox || !Array.isArray(bbox.min) || !Array.isArray(bbox.max)) {
    return {
      ok: false,
      slot,
      canonicalPivotRule: rule.pivotConvention,
      checks: {},
      violations: [{ code: 'BBOX_MISSING', message: 'Bounding box is required' }],
      recommendedOffset: [0, 0, 0],
      recommendedScale: 1,
    };
  }

  const min = bbox.min;
  const max = bbox.max;
  const size = bbox.size || [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center = bbox.center || [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const maxExtent = bbox.maxExtent ?? Math.max(size[0], size[1], size[2]);

  const violations = [];
  const checks = {
    withinMaxExtent: maxExtent > 0 && maxExtent <= rule.maxExtentMeters,
  };

  if (!checks.withinMaxExtent) {
    violations.push({
      code: 'EXTENT_OUT_OF_RANGE',
      message: `Attachment maxExtent=${maxExtent.toFixed(3)}m exceeds ${rule.maxExtentMeters}m`,
    });
  }

  let recommendedOffset = [0, 0, 0];
  let recommendedScale = maxExtent > rule.maxExtentMeters ? Number((rule.maxExtentMeters / maxExtent).toFixed(4)) : 1;

  if (slot === 'head') {
    const width = Math.max(size[0], size[2]);
    checks.centeredOnX = Math.abs(center[0]) <= rule.maxCenterDriftX;
    checks.bottomNearPivot = min[1] >= rule.minBottomY;
    checks.headWidthPlausible = width >= rule.idealWidthRangeMeters[0] && width <= rule.idealWidthRangeMeters[1];

    if (!checks.centeredOnX) {
      violations.push({ code: 'HEAD_OFF_CENTER_X', message: `Head attachment center.x=${center[0].toFixed(3)}m drifts > ${rule.maxCenterDriftX}m` });
    }
    if (!checks.bottomNearPivot) {
      violations.push({ code: 'HEAD_PIVOT_BELOW_BOTTOM', message: `Head attachment min.y=${min[1].toFixed(3)}m is below ${rule.minBottomY}m` });
    }
    recommendedOffset = [Number((-center[0]).toFixed(4)), Number((-min[1]).toFixed(4)), Number((-center[2]).toFixed(4))];
  } else if (slot === 'back') {
    checks.centeredOnX = Math.abs(center[0]) <= rule.maxCenterDriftX;
    checks.frontFaceNearZ0 = min[2] <= rule.zPlaneTolerance && max[2] >= -rule.zPlaneTolerance;

    if (!checks.centeredOnX) {
      violations.push({ code: 'BACK_OFF_CENTER_X', message: `Back attachment center.x=${center[0].toFixed(3)}m drifts > ${rule.maxCenterDriftX}m` });
    }
    if (!checks.frontFaceNearZ0) {
      violations.push({ code: 'BACK_Z_PLANE_DETACHED', message: `Back attachment Z range [${min[2].toFixed(3)}, ${max[2].toFixed(3)}] misses Z=0 plane` });
    }
    recommendedOffset = [Number((-center[0]).toFixed(4)), Number((-center[1]).toFixed(4)), Number((-max[2]).toFixed(4))];
  } else if (slot === 'hand_r' || slot === 'hand_l') {
    checks.extendsAlongPlusY = max[1] >= rule.minPositiveYExtent;
    checks.handleNearOrigin =
      Math.abs(center[0]) <= rule.handleOriginTolerance &&
      Math.abs(center[2]) <= rule.handleOriginTolerance &&
      min[1] <= rule.handleOriginTolerance;

    if (!checks.extendsAlongPlusY) {
      violations.push({ code: 'HAND_NOT_ALIGNED_PLUS_Y', message: `Hand prop max.y=${max[1].toFixed(3)}m does not extend along +Y` });
    }
    if (!checks.handleNearOrigin) {
      violations.push({ code: 'HAND_HANDLE_OFF_ORIGIN', message: `Hand prop pivot is too far from handle origin [0,0,0]` });
    }
    recommendedOffset = [Number((-center[0]).toFixed(4)), 0, Number((-center[2]).toFixed(4))];
  }

  return {
    ok: violations.length === 0,
    slot,
    canonicalPivotRule: rule.pivotConvention,
    maxExtent: Number(maxExtent.toFixed(6)),
    checks,
    violations,
    recommendedOffset,
    recommendedScale,
  };
}

// VLM Multi-View Self-Critique Rubric (0..10 per axis, pass threshold >= 8.0)
export const VLM_CRITIQUE_RUBRIC = Object.freeze({
  version: 1,
  scale: Object.freeze({ min: 0, max: 10 }),
  passThreshold: 8.0,
  maxRefineIterations: 3,
  views: Object.freeze(['front_-Y', 'side_+X', 'back_+Y', 'iso_3_4']),
  criteria: Object.freeze({
    silhouetteMatch: Object.freeze({
      weight: 0.35,
      minHardFloor: 5.5,
      description: 'Prompt silhouette recognition across all 4 turntable views',
    }),
    noFloatingParts: Object.freeze({
      weight: 0.30,
      minHardFloor: 6.0,
      description: 'Absence of disconnected/floating mesh islands or detached accessories',
    }),
    proportionBalance: Object.freeze({
      weight: 0.20,
      minHardFloor: 5.0,
      description: 'Canonical meter-unit proportions & socket fit without clipping',
    }),
    colorMaterialHarmony: Object.freeze({
      weight: 0.15,
      minHardFloor: 4.5,
      description: 'Coherent PBR palette, roughness contrast, and material readability',
    }),
  }),
});

function clampScore(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(10, num));
}

/**
 * Evaluates a VLM 4-view critique report against VLM_CRITIQUE_RUBRIC and decides
 * whether to `pass`, `refine` (patch MeshRecipe v1), or `reject` (max iterations reached).
 */
export function scoreVlmCritique(report = {}) {
  const iteration = Math.max(1, Math.floor(Number(report.iteration || 1)));
  const maxIterations = Math.max(1, Math.floor(Number(report.maxIterations || VLM_CRITIQUE_RUBRIC.maxRefineIterations)));

  const scores = {
    silhouetteMatch: clampScore(report.silhouetteMatch ?? report.scores?.silhouetteMatch),
    noFloatingParts: clampScore(report.noFloatingParts ?? report.scores?.noFloatingParts),
    proportionBalance: clampScore(report.proportionBalance ?? report.scores?.proportionBalance),
    colorMaterialHarmony: clampScore(report.colorMaterialHarmony ?? report.scores?.colorMaterialHarmony),
  };

  let weightedScore = 0;
  const hardFailures = [];

  for (const [key, spec] of Object.entries(VLM_CRITIQUE_RUBRIC.criteria)) {
    weightedScore += scores[key] * spec.weight;
    if (scores[key] < spec.minHardFloor) {
      hardFailures.push({
        criterion: key,
        score: scores[key],
        minHardFloor: spec.minHardFloor,
        reason: `${key} score ${scores[key]} fell below hard floor ${spec.minHardFloor}`,
      });
    }
  }

  if (report.floatingPartsDetected === true) {
    hardFailures.push({
      criterion: 'noFloatingParts',
      score: scores.noFloatingParts,
      minHardFloor: VLM_CRITIQUE_RUBRIC.criteria.noFloatingParts.minHardFloor,
      reason: 'Disconnected floating mesh island explicitly flagged by multi-view critic',
    });
  }

  if (report.budgetGatePassed === false) {
    hardFailures.push({
      criterion: 'budgetGate',
      score: 0,
      minHardFloor: 1,
      reason: 'Binary GLB hard budget gate failed',
    });
  }

  const roundedScore = Number(weightedScore.toFixed(4));
  const pass = roundedScore >= VLM_CRITIQUE_RUBRIC.passThreshold && hardFailures.length === 0;

  let decision = 'pass';
  let nextAction = 'publish_to_ugc_catalog';
  if (!pass) {
    if (iteration >= maxIterations) {
      decision = 'reject';
      nextAction = 'halt_and_report_critique';
    } else {
      decision = 'refine';
      nextAction = 'patch_mesh_recipe_v1';
    }
  }

  return {
    rubricVersion: VLM_CRITIQUE_RUBRIC.version,
    iteration,
    maxIterations,
    passThreshold: VLM_CRITIQUE_RUBRIC.passThreshold,
    weightedScore: roundedScore,
    pass,
    decision,
    nextAction,
    criterionScores: scores,
    hardFailures,
    patchDirectives: Array.isArray(report.patchDirectives) ? report.patchDirectives : [],
  };
}
