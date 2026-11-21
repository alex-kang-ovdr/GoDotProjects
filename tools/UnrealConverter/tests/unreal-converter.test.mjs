import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ueCmToGodotM,
  godotMToUeCm,
  uePositionToGodot,
  godotPositionToUe,
  ueRotatorToGodotDeg,
  godotDegToUeRotator
} from "../src/coordinate-transform.mjs";
import { extractUnrealProjectToIR } from "../src/ue-extractor.mjs";
import { validateUnifiedIR } from "../common-ir/validators/validate-ir.mjs";
import { compileBlueprintToGDScript } from "../src/blueprint-compiler.mjs";
import { generateGodotProjectFromIR } from "../src/godot-generator.mjs";
import { compareTraces } from "../src/trace-comparator.mjs";
import { diagnoseAndProposeRepairs, runRepairLoop } from "../src/ai-repair.mjs";
import { runFullUnrealPortPipeline } from "../src/port-cli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, "..");
const FIXTURE_DIR = path.join(CONVERTER_ROOT, "fixtures/third-person-template");
const GODOT_BIN = process.env.GODOT_BIN || "D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe";

test("1. Coordinate transform: UE (cm, LH Z-up) <-> Godot (m, RH Y-up) round-trip", () => {
  assert.equal(ueCmToGodotM(500), 5);
  assert.equal(godotMToUeCm(1.8), 180);

  // UE forward (+X=100cm) -> Godot -Z (-1m)
  // UE right (+Y=200cm) -> Godot +X (+2m)
  // UE up (+Z=300cm) -> Godot +Y (+3m)
  const gPos = uePositionToGodot([100, 200, 300]);
  assert.deepEqual(gPos, [2, 3, -1]);
  assert.deepEqual(godotPositionToUe(gPos), [100, 200, 300]);

  const gRot = ueRotatorToGodotDeg({ pitch: 15, yaw: 90, roll: -10 });
  assert.deepEqual(gRot, [15, -90, 10]);
  assert.deepEqual(godotDegToUeRotator(gRot), { pitch: 15, yaw: 90, roll: -10 });
});

test("2. UE Extractor produces valid Unified Game IR v0.1 and enforces license exclusion", () => {
  const ir = extractUnrealProjectToIR(FIXTURE_DIR);
  const validation = validateUnifiedIR(ir);

  assert.equal(validation.valid, true, `IR errors: ${validation.errors.join(", ")}`);
  assert.equal(ir.source.engine, "unreal");
  assert.equal(ir.units.distance, "meter");
  assert.equal(ir.units.coordinate_system, "godot_3d");
  assert.equal(ir.scenes.length, 1);
  assert.equal(ir.entities.length, 7);
  assert.equal(ir.logic.length, 1);

  // Verify blocked UE EULA asset is excluded and diagnosed (§11)
  const blockedAsset = ir.assets.find((a) => a.id === "asset_epic_mannequin_blocked");
  assert.ok(blockedAsset);
  assert.equal(blockedAsset.redistributable, false);
  assert.equal(blockedAsset.godot_path, null);
  assert.ok(ir.diagnostics.some((d) => d.code === "LICENSE_ASSET_EXCLUDED"));
});

test("3. Blueprint Compiler emits typed GDScript, Source Map, and unsupported-node diagnostics", () => {
  const ir = extractUnrealProjectToIR(FIXTURE_DIR);
  const compiled = compileBlueprintToGDScript(ir.logic[0]);

  assert.equal(compiled.scriptName, "bp_third_person_character.gd");
  assert.ok(compiled.code.includes('extends "res://addons/playforge_unreal_compat/ue_character_movement.gd"'));
  assert.ok(compiled.code.includes("func _on_ia_move("));
  assert.ok(compiled.code.includes("func _on_ia_look("));
  assert.ok(compiled.code.includes("func _on_ia_jump_started("));
  assert.ok(compiled.sourceMap.length >= 10);

  const unsupported = compiled.diagnostics.find((d) => d.code === "UNSUPPORTED_BP_NODE");
  assert.ok(unsupported);
  assert.equal(unsupported.node_class, "K2Node_CallFunction_SpawnNiagaraSystemAtLocation");
});

test("4. AI Repair Loop proposes patch for unsupported Niagara node and rejects failing regressions", () => {
  const ir = extractUnrealProjectToIR(FIXTURE_DIR);
  const compiled = compileBlueprintToGDScript(ir.logic[0]);
  const plan = diagnoseAndProposeRepairs({ diagnostics: compiled.diagnostics });
  assert.equal(plan.proposal_count, 1);

  // Reject if regression verifier fails
  const rejected = runRepairLoop({
    diagnostics: compiled.diagnostics,
    traceComparison: null,
    verifyWithOverrides: () => ({ passed: false })
  });
  assert.equal(rejected.applied, false);
  assert.equal(rejected.rejected_patches.length, 1);

  // Adopt if regression verifier passes
  const adopted = runRepairLoop({
    diagnostics: compiled.diagnostics,
    traceComparison: null,
    verifyWithOverrides: () => ({ passed: true })
  });
  assert.equal(adopted.applied, true);
  assert.equal(adopted.adopted_patches.length, 1);
});

test("5. Full Pipeline + Godot 4.7.2 Headless Runtime + Trace Comparison + Template Export", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "playforge-unreal-port-"));
  const portedDir = path.join(tmpDir, "ported");
  const reportDir = path.join(tmpDir, "reports");
  const templateDir = path.join(tmpDir, "template");

  try {
    const report = runFullUnrealPortPipeline({
      fixtureDir: FIXTURE_DIR,
      portedDir,
      reportDir,
      templateDir,
      godotBin: GODOT_BIN,
      exportTemplate: true
    });

    assert.equal(report.ir_validation.valid, true);
    assert.ok(report.generated_file_count >= 10);
    assert.ok(report.template_export);
    assert.ok(fs.existsSync(path.join(templateDir, "metadata.json")));
    assert.ok(fs.existsSync(path.join(templateDir, "scenes/main.tscn")));
    assert.ok(fs.existsSync(path.join(reportDir, "conversion-report.md")));

    if (fs.existsSync(GODOT_BIN)) {
      assert.equal(report.godot_verify.passed, true, "Godot 4.7.2 headless verification must pass");
      assert.ok(report.trace_comparison, "Trace comparison must be produced");
      assert.equal(
        report.trace_comparison.passed,
        true,
        `Trace comparison failed: ${JSON.stringify(report.trace_comparison.checks)}`
      );
      assert.equal(report.ai_repair.applied, true);
    } else {
      t.diagnostic("Godot 4.7.2 binary not present in environment; skipped live headless check.");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("6. Trace Comparator detects out-of-tolerance position & jump apex regressions", () => {
  const refTrace = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "reference_trace.json"), "utf8"));
  const badTrace = structuredClone(refTrace);
  badTrace.samples[5].position_m[2] -= 0.5; // 0.5m > 0.1m tolerance
  badTrace.jump_apex_m = 2.0; // > 5% tolerance

  const cmp = compareTraces(refTrace, badTrace);
  assert.equal(cmp.passed, false);
  assert.equal(cmp.checks.find((c) => c.metric === "position_m").passed, false);
  assert.equal(cmp.checks.find((c) => c.metric === "jump_apex_pct").passed, false);
});
