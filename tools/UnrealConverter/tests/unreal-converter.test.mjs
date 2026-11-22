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
import { encodeUeBinaryPackage, parseUeBinaryPackage, PACKAGE_FILE_TAG } from "../src/uasset-binary-parser.mjs";
import { convertBinaryUAssetBufferToIR, convertCUE4ParseJsonToIR } from "../src/ue-binary-bridge.mjs";

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

test("2. UE Extractor produces valid Unified Game IR v0.1 and supports internal_research vs redistributable_only modes", () => {
  // Default internal_research mode: ports ALL assets including internal_only UE meshes
  const irInternal = extractUnrealProjectToIR(FIXTURE_DIR);
  const validation = validateUnifiedIR(irInternal);

  assert.equal(validation.valid, true, `IR errors: ${validation.errors.join(", ")}`);
  assert.equal(irInternal.source.engine, "unreal");
  assert.equal(irInternal.units.distance, "meter");
  assert.equal(irInternal.units.coordinate_system, "godot_3d");
  assert.equal(irInternal.scenes.length, 1);
  assert.equal(irInternal.entities.length, 7);
  assert.equal(irInternal.logic.length, 1);

  const internalAsset = irInternal.assets.find((a) => a.id === "asset_epic_mannequin_blocked");
  assert.ok(internalAsset);
  assert.equal(internalAsset.redistributable, false);
  assert.ok(internalAsset.godot_path, "internal_research mode must port internal_only assets");
  assert.ok(irInternal.diagnostics.some((d) => d.code === "INTERNAL_RESEARCH_ASSET_PORTED"));

  // Strict redistributable_only mode: excludes non-redistributable assets (§11)
  const irRedist = extractUnrealProjectToIR(FIXTURE_DIR, { licenseMode: "redistributable_only" });
  const excludedAsset = irRedist.assets.find((a) => a.id === "asset_epic_mannequin_blocked");
  assert.equal(excludedAsset.godot_path, null);
  assert.ok(irRedist.diagnostics.some((d) => d.code === "LICENSE_ASSET_EXCLUDED"));
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

const STACK_O_BOT_DIR = path.join(CONVERTER_ROOT, "fixtures/stack-o-bot");

test("7. Stack O Bot P1 Blueprint Compiler handles Delegates, Interfaces, Overlap, Timeline, and SpawnActor", () => {
  const ir = extractUnrealProjectToIR(STACK_O_BOT_DIR);
  const validation = validateUnifiedIR(ir);
  assert.equal(validation.valid, true, `IR errors: ${validation.errors.join(", ")}`);
  assert.equal(ir.logic.length, 5);

  const plateBp = compileBlueprintToGDScript(ir.logic.find((g) => g.id === "bp_pressure_plate"));
  assert.ok(plateBp.code.includes("signal on_plate_state_changed(is_pressed: bool)"));
  assert.ok(plateBp.code.includes("on_plate_state_changed.emit(is_pressed)"));
  assert.ok(plateBp.code.includes('UnrealCompat.call_interface(UnrealCompat.find_actor(target_door_id), "bpi_on_interact", [is_pressed])'));

  const doorBp = compileBlueprintToGDScript(ir.logic.find((g) => g.id === "bp_door"));
  assert.ok(doorBp.code.includes("func bpi_on_interact(is_active: bool) -> void:"));
  assert.ok(doorBp.code.includes("_timeline_target = 1.0"));
  assert.ok(doorBp.code.includes('UnrealCompat.record_event("DoorOpened"'));

  const botBp = compileBlueprintToGDScript(ir.logic.find((g) => g.id === "bp_bot"));
  assert.ok(botBp.code.includes("ue_set_jetpack_active(true)"));
  assert.ok(botBp.code.includes("UnrealCompat.spawn_inactive_bot(get_parent(), global_position, max_inactive_bots, self)"));
});

test("8. Stack O Bot P1 Full Pipeline + Godot 4.7.2 Headless Puzzle E2E + Trace Comparison + Template Export", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "playforge-stackobot-port-"));
  const portedDir = path.join(tmpDir, "ported");
  const reportDir = path.join(tmpDir, "reports");
  const templateDir = path.join(tmpDir, "template");

  try {
    const report = runFullUnrealPortPipeline({
      fixtureDir: STACK_O_BOT_DIR,
      portedDir,
      reportDir,
      templateDir,
      templateId: "unreal-stack-o-bot",
      godotBin: GODOT_BIN,
      exportTemplate: true
    });

    assert.equal(report.ir_validation.valid, true);
    assert.equal(report.template_export.templateId, "unreal-stack-o-bot");
    assert.ok(fs.existsSync(path.join(templateDir, "scripts/bp_pressure_plate.gd")));
    assert.ok(fs.existsSync(path.join(templateDir, "scripts/bp_door.gd")));

    if (fs.existsSync(GODOT_BIN)) {
      assert.equal(report.godot_verify.passed, true, "Stack O Bot Godot 4.7.2 headless verification must pass");
      const trace = JSON.parse(fs.readFileSync(path.join(reportDir, "godot-runtime-trace.json"), "utf8"));
      assert.equal(trace.spawned_bots, 1, "InactiveBot must be spawned on pressure plate");
      assert.equal(trace.orbs_collected, 1, "Energy orb must be collected after door opens");
      assert.equal(trace.level_completed, true, "Goal pad must be reached for level completion");
      assert.ok(report.trace_comparison.passed, `Trace comparison failed: ${JSON.stringify(report.trace_comparison.checks)}`);
      assert.equal(report.ai_repair.applied, true);
    } else {
      t.diagnostic("Godot 4.7.2 binary not present; skipped live Stack O Bot headless check.");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("9. Asset Porting Pipeline converts UE OBJ meshes, Textures, PBR Materials, and WAV Audio into pure-text Godot 4.7 .tres", () => {
  const stackTemplateDir = path.resolve(CONVERTER_ROOT, "../../forge/Templates/unreal-stack-o-bot");
  const meta = JSON.parse(fs.readFileSync(path.join(stackTemplateDir, "metadata.json"), "utf8"));

  assert.ok(meta.assetPaths.includes("assets/meshes/mesh_bot_chassis.tres"));
  assert.ok(meta.assetPaths.includes("assets/meshes/asset_epic_stackobot_skm_blocked.tres"));
  assert.ok(meta.assetPaths.includes("assets/meshes/mesh_energy_orb.tres"));
  const tpTemplateDir = path.resolve(CONVERTER_ROOT, "../../forge/Templates/unreal-third-person");
  const tpMeta = JSON.parse(fs.readFileSync(path.join(tpTemplateDir, "metadata.json"), "utf8"));
  assert.ok(tpMeta.assetPaths.includes("assets/meshes/asset_epic_mannequin_blocked.tres"));
  assert.ok(meta.assetPaths.includes("assets/textures/tex_island_grass.tres"));
  assert.ok(meta.assetPaths.includes("assets/textures/tex_tech_metal.tres"));
  assert.ok(meta.assetPaths.includes("assets/textures/tex_warning_stripes.tres"));
  assert.ok(meta.assetPaths.includes("assets/materials/mat_bot_chassis.tres"));
  assert.ok(meta.assetPaths.includes("assets/materials/mat_energy_orb.tres"));
  assert.ok(meta.assetPaths.includes("assets/audio/sfx_jump.tres"));
  assert.ok(meta.assetPaths.includes("assets/audio/sfx_orb_collect.tres"));
  assert.ok(meta.assetPaths.includes("assets/audio/sfx_door_open.tres"));

  const botMeshTres = fs.readFileSync(path.join(stackTemplateDir, "assets/meshes/mesh_bot_chassis.tres"), "utf8");
  assert.ok(botMeshTres.includes('[gd_resource type="ArrayMesh" load_steps=2 format=4]'));
  assert.ok(botMeshTres.includes('"format": 34359738387'));

  const sfxTres = fs.readFileSync(path.join(stackTemplateDir, "assets/audio/sfx_orb_collect.tres"), "utf8");
  assert.ok(sfxTres.includes('[gd_resource type="AudioStreamWAV" format=4]'));
});

test("10. Level Design (Hierarchy/Lights/Fog/PlayerStart), Blueprint (Data Pins/Functions), and Material (NormalMap/Instance/GDShader)", () => {
  const stackTemplateDir = path.resolve(CONVERTER_ROOT, "../../forge/Templates/unreal-stack-o-bot");
  const tscn = fs.readFileSync(path.join(stackTemplateDir, "scenes/main.tscn"), "utf8");

  // Level Design: parent-child hierarchy, OmniLight3D, Marker3D, Fog
  assert.ok(tscn.includes('[node name="GateAssembly" type="Node3D" parent="."]'));
  assert.ok(tscn.includes('[node name="GateWallLeft" type="StaticBody3D" parent="GateAssembly"]'));
  assert.ok(tscn.includes('[node name="GateBeaconLight" type="OmniLight3D" parent="GateAssembly"]'));
  assert.ok(tscn.includes('[node name="PlayerStart_01" type="Marker3D" parent="."]'));
  assert.ok(tscn.includes("fog_enabled = true"));

  // Blueprint: data-pin math expression & custom function
  const plateGd = fs.readFileSync(path.join(stackTemplateDir, "scripts/bp_pressure_plate.gd"), "utf8");
  assert.ok(plateGd.includes("press_count = (press_count + 1)"));
  assert.ok(plateGd.includes("func get_press_count() -> int:"));

  // Material: Normal map, MaterialInstance inheritance, and UE Material Graph -> .gdshader
  const techMat = fs.readFileSync(path.join(stackTemplateDir, "assets/materials/mat_tech_metal.tres"), "utf8");
  assert.ok(techMat.includes("normal_enabled = true"));
  assert.ok(techMat.includes("tex_tech_metal_normal.tres"));

  const doorMi = fs.readFileSync(path.join(stackTemplateDir, "assets/materials/mi_door_metal.tres"), "utf8");
  assert.ok(doorMi.includes("tex_tech_metal.tres"), "MaterialInstance must inherit parent albedo_texture");
  assert.ok(doorMi.includes("normal_enabled = true"), "MaterialInstance must inherit parent normal_texture");
  assert.ok(doorMi.includes("metallic = 0.55"), "MaterialInstance must override metallic");

  const orbShader = fs.readFileSync(path.join(stackTemplateDir, "assets/shaders/mat_energy_orb.gdshader"), "utf8");
  assert.ok(orbShader.includes("shader_type spatial;"));
  assert.ok(orbShader.includes("float fresnel = pow("));
  assert.ok(orbShader.includes("uv_panned = UV + pan_speed * TIME"));

  const goalMat = fs.readFileSync(path.join(stackTemplateDir, "assets/materials/mat_goal_hologram.tres"), "utf8");
  assert.ok(goalMat.includes('[gd_resource type="ShaderMaterial"'));
});

test("11. Reverse-Engineered Binary .umap/.uasset Parser (0x9E2A83C1) extracts Level Actors, Skeleton Bones, and AnimSequence into Unified IR", () => {
  const binaryBuf = encodeUeBinaryPackage({
    folderName: "/Game/StackOBot/Maps/MainLevel",
    imports: [
      { classPackage: "/Script/Engine", className: "Class", objectName: "StaticMeshActor" },
      { classPackage: "/Script/Engine", className: "Class", objectName: "PointLight" },
      { classPackage: "/Script/Engine", className: "Class", objectName: "SkeletalMesh" },
      { classPackage: "/Script/Engine", className: "Class", objectName: "AnimSequence" }
    ],
    exports: [
      {
        classIndex: -1,
        objectName: "GateWallLeft",
        properties: {
          RelativeLocation: { type: "Vector", value: [700, -340, 160] },
          RelativeRotation: { type: "Rotator", value: { pitch: 0, yaw: 90, roll: 0 } },
          RelativeScale3D: { type: "Vector", value: [1, 1.5, 2] },
          StaticMesh: { type: "Str", value: "/Game/StackOBot/Meshes/SM_Wall" }
        }
      },
      {
        classIndex: -2,
        objectName: "GateBeaconLight",
        properties: {
          RelativeLocation: { type: "Vector", value: [620, 0, 340] },
          Intensity: { type: "Float", value: 3.5 }
        }
      },
      {
        classIndex: -3,
        objectName: "SKM_Bot",
        properties: {
          ReferenceSkeleton: {
            type: "BoneArray",
            value: [
              { name: "pelvis", parent_index: -1, location_cm: [0, 0, 90] },
              { name: "spine", parent_index: 0, location_cm: [0, 0, 30] },
              { name: "head", parent_index: 1, location_cm: [0, 0, 42] }
            ]
          }
        }
      },
      {
        classIndex: -4,
        objectName: "Anim_Run",
        properties: {
          SequenceLength: { type: "Float", value: 0.6 },
          AnimTracks: {
            type: "AnimKeyArray",
            value: [
              { bone: "spine", time_sec: 0.0, rotation_deg: { pitch: -12, yaw: 4, roll: 0 } },
              { bone: "spine", time_sec: 0.3, rotation_deg: { pitch: -12, yaw: -4, roll: 0 } }
            ]
          }
        }
      }
    ]
  });

  // Verify raw UE magic tag 0x9E2A83C1 at offset 0
  assert.equal(binaryBuf.readUInt32LE(0), PACKAGE_FILE_TAG);

  const parsed = parseUeBinaryPackage(binaryBuf);
  assert.equal(parsed.summary.tag, "0x9E2A83C1");
  assert.equal(parsed.exports.length, 4);

  const ir = convertBinaryUAssetBufferToIR(binaryBuf, { projectName: "StackOBotBinary" });
  const validation = validateUnifiedIR(ir);
  assert.equal(validation.valid, true, `Binary IR errors: ${validation.errors.join(", ")}`);
  assert.equal(ir.entities.length, 2);
  // GateWallLeft: UE (700, -340, 160)cm -> Godot (-3.4, 1.6, -7.0)m
  assert.deepEqual(ir.entities[0].transform.position, [-3.4, 1.6, -7]);
  assert.deepEqual(ir.entities[0].transform.rotation_deg, [0, -90, 0]);
  assert.equal(ir.entities[1].godot_class, "OmniLight3D");
  assert.equal(ir.skeletons.length, 1);
  assert.equal(ir.skeletons[0].bones.length, 3);
  assert.deepEqual(ir.skeletons[0].bones[0].position_m, [0, 0.9, 0]);
  assert.equal(ir.animations.length, 1);
  assert.equal(ir.animations[0].tracks.length, 2);
});

test("12. GitHub CUE4Parse / FModel JSON Bridge converts UE Level & Character Skeleton exports to Unified IR", () => {
  const cue4Sample = [
    {
      Type: "StaticMeshComponent",
      Name: "StaticMeshComponent0",
      Outer: "BP_Door_2",
      Properties: {
        RelativeLocation: { X: 700, Y: 0, Z: 160 },
        RelativeRotation: { Pitch: 0, Yaw: 0, Roll: 0 },
        RelativeScale3D: { X: 1, Y: 1, Z: 1 },
        StaticMesh: { ObjectName: "StaticMesh'SM_Door'" }
      }
    },
    {
      Type: "SkeletalMesh",
      Name: "SKM_Bot",
      ReferenceSkeleton: {
        FinalRefBoneInfo: [
          { Name: "root", ParentIndex: -1 },
          { Name: "pelvis", ParentIndex: 0 }
        ],
        FinalRefBonePose: [
          { Translation: { X: 0, Y: 0, Z: 0 }, Rotation: { Pitch: 0, Yaw: 0, Roll: 0 } },
          { Translation: { X: 0, Y: 0, Z: 90 }, Rotation: { Pitch: 0, Yaw: 0, Roll: 0 } }
        ]
      }
    }
  ];

  const ir = convertCUE4ParseJsonToIR(cue4Sample, { projectName: "CUE4StackOBot" });
  const validation = validateUnifiedIR(ir);
  assert.equal(validation.valid, true, `CUE4Parse IR errors: ${validation.errors.join(", ")}`);
  assert.equal(ir.entities.length, 1);
  assert.equal(ir.entities[0].name, "BP_Door_2");
  assert.deepEqual(ir.entities[0].transform.position, [0, 1.6, -7]);
  assert.equal(ir.skeletons.length, 1);
  assert.equal(ir.skeletons[0].bones[1].name, "pelvis");
  assert.deepEqual(ir.skeletons[0].bones[1].position_m, [0, 0.9, 0]);
});

test("13. Full Binary .umap/.uasset Reverse-Engineering E2E -> 13-Bone Skeleton3D + Kismet Bytecode + Godot 4.7.2 Puzzle Clear", (t) => {
  const binaryFixtureDir = path.join(CONVERTER_ROOT, "fixtures/binary-stack-o-bot-umap");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "playforge-binary-umap-"));
  const portedDir = path.join(tmpDir, "ported");
  const reportDir = path.join(tmpDir, "reports");
  const templateDir = path.join(tmpDir, "template");

  try {
    // Confirm actual binary 0x9E2A83C1 files on disk
    const umapBytes = fs.readFileSync(path.join(binaryFixtureDir, "Content/Maps/MainLevel.umap"));
    const skmBytes = fs.readFileSync(path.join(binaryFixtureDir, "Content/Characters/SKM_StackOBot.uasset"));
    const bpBytes = fs.readFileSync(path.join(binaryFixtureDir, "Content/Blueprints/BP_Bot.uasset"));
    assert.equal(umapBytes.readUInt32LE(0), PACKAGE_FILE_TAG);
    assert.equal(skmBytes.readUInt32LE(0), PACKAGE_FILE_TAG);
    assert.equal(bpBytes.readUInt32LE(0), PACKAGE_FILE_TAG);

    const report = runFullUnrealPortPipeline({
      fixtureDir: binaryFixtureDir,
      assetFallbackDir: STACK_O_BOT_DIR,
      portedDir,
      reportDir,
      templateDir,
      templateId: "unreal-binary-stack-o-bot",
      binaryMode: true,
      godotBin: GODOT_BIN,
      exportTemplate: true
    });

    assert.equal(report.ir_validation.valid, true);
    const skelJson = JSON.parse(fs.readFileSync(path.join(portedDir, "assets/skeletons/skm_stackobot.json"), "utf8"));
    assert.equal(skelJson.bones.length, 13, "Binary SKM_StackOBot.uasset must yield 13 bones");
    assert.ok(skelJson.animations.length >= 2, "Binary Anim_StackOBot.uasset must yield multi-clip animation tracks");

    const irDump = JSON.parse(fs.readFileSync(path.join(reportDir, "unified-ir.json"), "utf8"));
    assert.equal(irDump.kismet_bytecode.length, 1);
    assert.equal(irDump.kismet_bytecode[0].instructions[0].opcode, "EX_LocalFinalFunction");
    assert.equal(irDump.kismet_bytecode[0].instructions[0].target, "PrintString");

    if (fs.existsSync(GODOT_BIN)) {
      assert.equal(report.godot_verify.passed, true, "Binary .umap ported Godot project must boot & run cleanly");
      const trace = JSON.parse(fs.readFileSync(path.join(reportDir, "godot-runtime-trace.json"), "utf8"));
      assert.equal(trace.spawned_bots, 1);
      assert.equal(trace.orbs_collected, 1);
      assert.equal(trace.level_completed, true);
    } else {
      t.diagnostic("Godot 4.7.2 binary not present; skipped live binary-umap headless check.");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("14. Real Epic StackOBot_5.4 260-Asset Porting Audit & Failed-Asset TODO Investigation Report", () => {
  const auditJsonPath = path.join(CONVERTER_ROOT, "audit/stack-o-bot-5.4-porting-audit.json");
  const todoMdPath = path.join(CONVERTER_ROOT, "audit/FAILED_ASSETS_TODO.md");

  assert.ok(fs.existsSync(auditJsonPath), "stack-o-bot-5.4-porting-audit.json must exist");
  assert.ok(fs.existsSync(todoMdPath), "FAILED_ASSETS_TODO.md must exist");

  const audit = JSON.parse(fs.readFileSync(auditJsonPath, "utf8"));
  assert.equal(audit.totals.total_assets_audited, 260);
  assert.equal(audit.totals.mainworld_external_actors, 419);
  assert.ok(audit.totals.ported_full >= 173, `Expected >=173 PORTED_FULL assets, got ${audit.totals.ported_full}`);
  assert.equal(
    audit.totals.ported_full + audit.totals.ported_partial + audit.totals.failed_unsupported,
    audit.totals.total_assets_audited
  );
  assert.ok(audit.totals.multimesh_total_instances > 10000);
  assert.ok(audit.totals.landscape_triangles > 50000);

  const todoMd = fs.readFileSync(todoMdPath, "utf8");
  assert.ok(todoMd.includes("MetaSoundSource"));
  assert.ok(todoMd.includes("ControlRig"));
  assert.ok(todoMd.includes("NiagaraSystem"));
  assert.ok(todoMd.includes("RuntimeVirtualTexture"));
});

test("15. Deterministic Resource Compilers + Agent-Orchestrated Pipeline Scorecard Verification", () => {
  const orchReportPath = path.join(CONVERTER_ROOT, "audit/orchestration-report.json");
  assert.ok(fs.existsSync(orchReportPath), "orchestration-report.json must exist");
  const orch = JSON.parse(fs.readFileSync(orchReportPath, "utf8"));

  assert.equal(orch.architecture, "deterministic_core_with_agent_orchestration");
  assert.equal(orch.completeness_scorecard.total_ue5_assets, 260);
  assert.ok(
    orch.completeness_scorecard.usable_in_godot_pct >= 95.0,
    `Expected >=95% usable assets after deterministic compilers, got ${orch.completeness_scorecard.usable_in_godot_pct}%`
  );
  assert.ok(orch.deterministic_compilers.compiledMaterials >= 40);
  assert.equal(orch.deterministic_compilers.compiledNiagaraScenes, 6);
  assert.equal(orch.deterministic_compilers.compiledMetaSoundWavs, 3);
  assert.equal(orch.deterministic_compilers.compiledUmgScenes, 7);
  assert.equal(orch.deterministic_compilers.compiledPhysicsAssets, 1);

  if (!orch.runtime_verification.skipped) {
    assert.equal(orch.runtime_verification.passed, true);
    assert.equal(orch.runtime_verification.script_error_count, 0);
    assert.equal(orch.runtime_verification.telemetry.shots.length, 6);
  }
});
