/**
 * Trace Comparator (Spec §7)
 * Compares Unreal Engine reference trace against Godot 4.x runtime trace
 * using PoC tolerances:
 *   - Position: <= 0.1 m
 *   - Rotation: <= 3.0 deg
 *   - Jump apex height: <= 5%
 *   - Animation state transition timing: <= 100 ms
 *   - Gameplay event sequence & count: exact match
 */

export const DEFAULT_POC_TOLERANCES = {
  position_m: 0.1,
  rotation_deg: 3.0,
  jump_apex_pct: 5.0,
  anim_transition_ms: 100.0
};

function vec3Dist(a = [0, 0, 0], b = [0, 0, 0]) {
  const dx = (a[0] || 0) - (b[0] || 0);
  const dy = (a[1] || 0) - (b[1] || 0);
  const dz = (a[2] || 0) - (b[2] || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angleDiffDeg(a, b) {
  let d = ((a - b + 180) % 360 + 360) % 360 - 180;
  return Math.abs(d);
}

export function compareTraces(referenceTrace, actualTrace, tolerances = DEFAULT_POC_TOLERANCES) {
  const checks = [];
  let maxPositionErrorM = 0;
  let maxRotationErrorDeg = 0;

  const refSamples = referenceTrace.samples || [];
  const actSamples = actualTrace.samples || [];
  const sampleCount = Math.min(refSamples.length, actSamples.length);

  for (let i = 0; i < sampleCount; i++) {
    const r = refSamples[i];
    const a = actSamples[i];
    const posErr = vec3Dist(r.position_m, a.position_m);
    const rotErr = angleDiffDeg(r.yaw_deg || 0, a.yaw_deg || 0);
    if (posErr > maxPositionErrorM) maxPositionErrorM = posErr;
    if (rotErr > maxRotationErrorDeg) maxRotationErrorDeg = rotErr;
  }

  checks.push({
    metric: "position_m",
    measured: Number(maxPositionErrorM.toFixed(4)),
    tolerance: tolerances.position_m,
    passed: sampleCount > 0 && maxPositionErrorM <= tolerances.position_m
  });

  checks.push({
    metric: "rotation_deg",
    measured: Number(maxRotationErrorDeg.toFixed(4)),
    tolerance: tolerances.rotation_deg,
    passed: sampleCount > 0 && maxRotationErrorDeg <= tolerances.rotation_deg
  });

  // Jump apex comparison
  const refApex = Number(referenceTrace.jump_apex_m || 0);
  const actApex = Number(actualTrace.jump_apex_m || 0);
  const apexPctDiff = refApex > 0 ? (Math.abs(actApex - refApex) / refApex) * 100.0 : 0;
  checks.push({
    metric: "jump_apex_pct",
    measured: Number(apexPctDiff.toFixed(2)),
    reference_m: refApex,
    actual_m: actApex,
    tolerance: tolerances.jump_apex_pct,
    passed: refApex > 0 && apexPctDiff <= tolerances.jump_apex_pct
  });

  // Animation state transitions timing
  const refAnims = referenceTrace.anim_transitions || [];
  const actAnims = actualTrace.anim_transitions || [];
  let maxAnimDeltaMs = 0;
  let animSequenceMatch = refAnims.length === actAnims.length;
  const animCount = Math.min(refAnims.length, actAnims.length);
  for (let i = 0; i < animCount; i++) {
    if (refAnims[i].from !== actAnims[i].from || refAnims[i].to !== actAnims[i].to) {
      animSequenceMatch = false;
    }
    const dt = Math.abs((refAnims[i].time_ms || 0) - (actAnims[i].time_ms || 0));
    if (dt > maxAnimDeltaMs) maxAnimDeltaMs = dt;
  }
  checks.push({
    metric: "anim_transition_ms",
    measured: Number(maxAnimDeltaMs.toFixed(2)),
    sequence_match: animSequenceMatch,
    tolerance: tolerances.anim_transition_ms,
    passed: animSequenceMatch && maxAnimDeltaMs <= tolerances.anim_transition_ms
  });

  // Gameplay event sequence & count (excluding diagnostic/repair markers)
  const filterEvents = (evts) =>
    (evts || [])
      .map((e) => e.event)
      .filter((name) => name !== "UnsupportedNodeStub" && name !== "VFXFallbackBurst");
  const refEvents = filterEvents(referenceTrace.gameplay_events);
  const actEvents = filterEvents(actualTrace.gameplay_events);
  const eventsExactMatch =
    refEvents.length === actEvents.length &&
    refEvents.every((ev, idx) => ev === actEvents[idx]);

  checks.push({
    metric: "gameplay_events",
    reference_count: refEvents.length,
    actual_count: actEvents.length,
    sequence_match: eventsExactMatch,
    passed: eventsExactMatch
  });

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    sample_count: sampleCount,
    checks
  };
}
