/**
 * AI Diagnosis & Repair Proposal Engine (Spec §7)
 * Inspects conversion diagnostics and trace comparison failures, proposes deterministic
 * GDScript/parameter patches, and gates adoption on regression test pass.
 */

export function diagnoseAndProposeRepairs({ diagnostics = [], traceComparison = null }) {
  const proposals = [];

  for (const diag of diagnostics) {
    if (diag.code === "UNSUPPORTED_BP_NODE") {
      if (diag.node_class === "K2Node_CallFunction_SpawnNiagaraSystemAtLocation") {
        proposals.push({
          id: `repair_${diag.source_ref.replace(/[^a-zA-Z0-9_]/g, "_")}`,
          target_type: "blueprint_node",
          target_ref: diag.source_ref,
          node_class: diag.node_class,
          diagnosis: `Unsupported Niagara VFX node (${diag.source_ref}) was stubbed.`,
          patch: {
            override_key: diag.node_class,
            reason: "Replaced UE SpawnNiagaraSystemAtLocation with lightweight Godot GPUParticles3D-compatible spawn marker",
            gd_snippet: 'UnrealCompat.record_event("VFXFallbackBurst", {"source": "NiagaraFallback"})'
          }
        });
      }
    }
  }

  if (traceComparison && !traceComparison.passed) {
    for (const check of traceComparison.checks || []) {
      if (!check.passed && check.metric === "jump_apex_pct" && check.reference_m > 0 && check.actual_m > 0) {
        const ratio = Math.sqrt(check.reference_m / check.actual_m);
        proposals.push({
          id: "repair_jump_velocity_scale",
          target_type: "movement_param",
          target_ref: "UCharacterMovementComponent.jump_z_velocity_cm",
          diagnosis: `Jump apex differed by ${check.measured}% (ref=${check.reference_m}m, actual=${check.actual_m}m).`,
          patch: {
            param: "jump_z_velocity_cm",
            multiplier: Number(ratio.toFixed(4))
          }
        });
      }
    }
  }

  return {
    proposal_count: proposals.length,
    proposals
  };
}

/**
 * Evaluate proposed patches using a caller-supplied regression verification callback.
 * Only adopts patches if the regression verifier returns { passed: true }.
 */
export function runRepairLoop({ diagnostics, traceComparison, verifyWithOverrides }) {
  const plan = diagnoseAndProposeRepairs({ diagnostics, traceComparison });
  if (plan.proposal_count === 0) {
    return {
      applied: false,
      adopted_patches: [],
      rejected_patches: [],
      reason: "No repair proposals needed"
    };
  }

  const repairOverrides = {};
  for (const prop of plan.proposals) {
    if (prop.target_type === "blueprint_node" && prop.patch?.override_key) {
      repairOverrides[prop.patch.override_key] = prop.patch;
    }
  }

  const verification = verifyWithOverrides(repairOverrides);
  if (verification && verification.passed) {
    return {
      applied: true,
      adopted_patches: plan.proposals,
      rejected_patches: [],
      verification
    };
  }

  return {
    applied: false,
    adopted_patches: [],
    rejected_patches: plan.proposals,
    verification,
    reason: "Regression tests failed; AI patches rejected"
  };
}
