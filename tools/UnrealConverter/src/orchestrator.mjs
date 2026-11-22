#!/usr/bin/env node
/**
 * PlayForge Deterministic-Core + Agent-Orchestrated Unreal -> Godot 4.7.2 Pipeline
 *
 * Design Philosophy:
 *   - 95%+ of asset & scene conversion is 100% deterministic (C# UAssetBridge binary parser,
 *     Oodle SeekableCompressedBuffer Nanite decimator, static .tres/.gdshader/.tscn/.wav compilers).
 *   - The Orchestrator drives verification gates (static GDScript check, headless import,
 *     GPU runtime telemetry, screenshot luminance/non-black pixel gate) and executes
 *     bounded, regression-checked repairs only on structured gate diagnostics.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runAllDeterministicCompilers } from "./deterministic-compilers.mjs";
import { buildRealStackOBotGodotProject } from "./real-project-builder.mjs";
import { generateFailedAssetsTodoMarkdown } from "./generate-audit-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, "..");
const DEFAULT_GODOT_BIN = "D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe";
const DEFAULT_UE_CONTENT = "C:\\ProgramData\\Epic\\EpicGamesLauncher\\VaultCache\\StackOBot_5.4\\data\\Content";

function parseScriptErrors(output) {
  const lines = String(output || "").split(/\r?\n/);
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes("SCRIPT ERROR:") || l.includes("Parse Error:") || l.includes("Shader compilation failed")) {
      errors.push({
        message: l.trim(),
        location: (lines[i + 1] || "").trim()
      });
    }
  }
  return errors;
}

/**
 * Bounded deterministic repair rules triggered by structured gate diagnostics.
 */
function applyBoundedDeterministicRepairs(portedDir, diagnostics) {
  const applied = [];

  // Repair Rule 1: GDScript 2.0 `Cannot infer the type of "x" variable` -> rewrite `var x :=` to `var x: Variant =`
  const inferErrs = diagnostics.filter((d) => d.message.includes("Cannot infer the type of"));
  if (inferErrs.length > 0) {
    const scriptsDir = path.join(portedDir, "scripts");
    for (const f of fs.readdirSync(scriptsDir).filter((n) => n.endsWith(".gd"))) {
      const fp = path.join(scriptsDir, f);
      const orig = fs.readFileSync(fp, "utf8");
      const patched = orig.replace(/^(\s*var\s+[A-Za-z0-9_]+)\s*:=\s*(.+)$/gm, (m, lhs, rhs) => {
        if (/^(Vector[234]|Color|Transform3D|Basis|AABB|NodePath|String|int|float|bool|Array|Dictionary|[A-Z][A-Za-z0-9_]*\.new)\b/.test(rhs.trim())) {
          return m;
        }
        return `${lhs}: Variant = ${rhs}`;
      });
      if (patched !== orig) {
        fs.writeFileSync(fp, patched, "utf8");
        applied.push({ rule: "FIX_GDSCRIPT_TYPE_INFERENCE", file: `scripts/${f}` });
      }
    }
  }

  // Repair Rule 2: Under-exposed screenshots (`mean_luminance < 0.08`) -> boost tonemap exposure & sky energy
  const darkShot = diagnostics.find((d) => d.code === "SHOT_TOO_DARK");
  if (darkShot) {
    const loaderPath = path.join(portedDir, "scripts/main_world_loader.gd");
    if (fs.existsSync(loaderPath)) {
      const orig = fs.readFileSync(loaderPath, "utf8");
      const patched = orig
        .replace("env.tonemap_exposure = 1.05", "env.tonemap_exposure = 1.25")
        .replace("env.ambient_light_energy = 1.05", "env.ambient_light_energy = 1.30");
      if (patched !== orig) {
        fs.writeFileSync(loaderPath, patched, "utf8");
        applied.push({ rule: "BOOST_SCENE_EXPOSURE", file: "scripts/main_world_loader.gd" });
      }
    }
  }

  return applied;
}

export function runOrchestratedPortingPipeline({
  ueContentDir = process.env.UE_STACKOBOT_CONTENT || DEFAULT_UE_CONTENT,
  portedDir = path.join(CONVERTER_ROOT, "ported/godot-real-stack-o-bot"),
  auditJsonPath = path.join(CONVERTER_ROOT, "audit/stack-o-bot-5.4-porting-audit.json"),
  todoMdPath = path.join(CONVERTER_ROOT, "audit/FAILED_ASSETS_TODO.md"),
  orchestrationReportPath = path.join(CONVERTER_ROOT, "audit/orchestration-report.json"),
  captureDir = path.join(CONVERTER_ROOT, "reports/screenshots/real-stack-o-bot"),
  godotBin = process.env.GODOT_BIN || DEFAULT_GODOT_BIN,
  maxRepairIterations = 2
} = {}) {
  const startedAt = Date.now();
  const stageTimeline = [];

  // --- Stage 1: Deterministic Binary Extraction (C# UAssetBridge + Oodle + Seekable Nanite Stream) ---
  const csprojPath = path.join(CONVERTER_ROOT, "unreal-extractor/UAssetBridge/UAssetBridge.csproj");
  const dllPath = path.join(CONVERTER_ROOT, "unreal-extractor/UAssetBridge/bin/Release/net9.0/UAssetBridge.dll");

  const t1 = Date.now();
  const buildRes = spawnSync("dotnet", ["build", csprojPath, "-c", "Release"], { encoding: "utf8", timeout: 60000 });
  if (buildRes.status !== 0) {
    throw new Error(`UAssetBridge build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);
  }
  const extRes = spawnSync("dotnet", [dllPath, "extract-real-project", ueContentDir, portedDir, auditJsonPath], {
    encoding: "utf8",
    timeout: 300000
  });
  if (extRes.status !== 0) {
    throw new Error(`UAssetBridge extract-real-project failed:\n${extRes.stdout}\n${extRes.stderr}`);
  }
  stageTimeline.push({
    stage: "1_deterministic_binary_extract",
    passed: true,
    duration_ms: Date.now() - t1,
    stdout_tail: (extRes.stdout || "").trim().split(/\r?\n/).slice(-2)
  });

  // --- Stage 2: Deterministic Resource & Scene Compilers (.tres / .gdshader / .tscn / .wav) ---
  const t2 = Date.now();
  const compilerSummary = runAllDeterministicCompilers(portedDir);
  buildRealStackOBotGodotProject(portedDir);
  stageTimeline.push({
    stage: "2_deterministic_resource_compile",
    passed: true,
    duration_ms: Date.now() - t2,
    outputs: compilerSummary
  });

  // --- Stage 3..5: Import + Static Script Gate + Live GPU Runtime Gate + Bounded Agentic Repair Loop ---
  fs.mkdirSync(captureDir, { recursive: true });
  const telemetryPath = path.join(portedDir, "extracted/runtime-verification-telemetry.json");
  let repairHistory = [];
  let runtimeGate = { passed: false, skipped: !fs.existsSync(godotBin) };

  if (fs.existsSync(godotBin)) {
    for (let attempt = 0; attempt <= maxRepairIterations; attempt++) {
      const tImport = Date.now();
      const impRes = spawnSync(godotBin, ["--headless", "--import", "--path", portedDir], {
        encoding: "utf8",
        timeout: 180000
      });
      stageTimeline.push({
        stage: `3_godot_import_attempt_${attempt}`,
        passed: impRes.status === 0,
        duration_ms: Date.now() - tImport
      });

      // Static GDScript check gate before opening GPU window!
      const scriptCheckErrors = [];
      for (const scriptRel of ["res://scripts/material_library.gd", "res://scripts/bp_bot_real.gd", "res://scripts/main_world_loader.gd", "res://scripts/capture_evidence.gd"]) {
        const chk = spawnSync(godotBin, ["--headless", "--check-only", "--path", portedDir, "-s", scriptRel], {
          encoding: "utf8",
          timeout: 20000
        });
        scriptCheckErrors.push(...parseScriptErrors(`${chk.stdout}\n${chk.stderr}`));
      }

      if (scriptCheckErrors.length > 0 && attempt < maxRepairIterations) {
        const repairs = applyBoundedDeterministicRepairs(portedDir, scriptCheckErrors);
        repairHistory.push({ attempt, trigger: "STATIC_SCRIPT_GATE", diagnostics: scriptCheckErrors, repairs });
        if (repairs.length > 0) continue;
      }

      // Stage 4: Live GPU Runtime Execution + Telemetry + 6-Angle Screenshot Capture
      if (fs.existsSync(telemetryPath)) fs.unlinkSync(telemetryPath);
      const tRun = Date.now();
      const runRes = spawnSync(
        godotBin,
        ["--windowed", "--resolution", "1280x720", "--fixed-fps", "60", "--path", portedDir, "res://scenes/capture_evidence.tscn"],
        {
          env: {
            ...process.env,
            PLAYFORGE_REAL_CAPTURE_DIR: captureDir,
            PLAYFORGE_TELEMETRY_OUT: telemetryPath
          },
          encoding: "utf8",
          timeout: 60000
        }
      );

      const runtimeScriptErrors = parseScriptErrors(`${runRes.stdout}\n${runRes.stderr}`);
      const telemetry = fs.existsSync(telemetryPath) ? JSON.parse(fs.readFileSync(telemetryPath, "utf8")) : null;
      const darkShots = (telemetry?.shots || []).filter((s) => s.mean_luminance < 0.08 || s.non_black_ratio < 0.65);

      const allPassed =
        runRes.status === 0 &&
        runtimeScriptErrors.length === 0 &&
        Boolean(telemetry?.passed) &&
        darkShots.length === 0;

      runtimeGate = {
        passed: allPassed,
        attempt,
        exit_code: runRes.status,
        duration_ms: Date.now() - tRun,
        script_error_count: runtimeScriptErrors.length,
        script_errors: runtimeScriptErrors.slice(0, 5),
        telemetry
      };
      stageTimeline.push({ stage: `4_gpu_runtime_and_visual_gate_attempt_${attempt}`, ...runtimeGate });

      if (allPassed || attempt === maxRepairIterations) break;

      const gateDiags = [
        ...runtimeScriptErrors,
        ...darkShots.map((s) => ({ code: "SHOT_TOO_DARK", message: `Shot ${s.file} luminance=${s.mean_luminance}` }))
      ];
      const repairs = applyBoundedDeterministicRepairs(portedDir, gateDiags);
      repairHistory.push({ attempt, trigger: "RUNTIME_VISUAL_GATE", diagnostics: gateDiags, repairs });
      if (repairs.length === 0) break;
    }
  }

  // --- Stage 6: Completeness Scorecard & Residual TODO Audit ---
  const todoStats = generateFailedAssetsTodoMarkdown(auditJsonPath, todoMdPath);
  const auditData = JSON.parse(fs.readFileSync(auditJsonPath, "utf8"));
  const totalAssets = auditData.totals.total_assets_audited;
  const fullCount = auditData.totals.ported_full;
  const partialCount = auditData.totals.ported_partial;
  const failedCount = auditData.totals.failed_unsupported;

  const usableInGodotPct = Number((((fullCount + partialCount) / Math.max(1, totalAssets)) * 100).toFixed(2));
  const weightedCompletenessPct = Number((((fullCount * 1.0 + partialCount * 0.7) / Math.max(1, totalAssets)) * 100).toFixed(2));
  const fmtCat = (catName) => {
    const c = (auditData.by_category || []).find((x) => x.category === catName);
    if (!c) return "0/0";
    const ok = c.full + c.partial;
    return `${ok}/${c.total} (${((ok / Math.max(1, c.total)) * 100).toFixed(1)}%)`;
  };

  const report = {
    generated_at: new Date().toISOString(),
    total_duration_ms: Date.now() - startedAt,
    architecture: "deterministic_core_with_agent_orchestration",
    completeness_scorecard: {
      total_ue5_assets: totalAssets,
      ported_full: fullCount,
      ported_partial: partialCount,
      failed_unsupported: failedCount,
      usable_in_godot_pct: usableInGodotPct,
      weighted_completeness_pct: weightedCompletenessPct,
      static_meshes_ported: fmtCat("StaticMesh"),
      textures_ported: fmtCat("Texture"),
      audio_playable_in_godot: fmtCat("Audio"),
      niagara_fx_compiled: fmtCat("NiagaraFX"),
      umg_widgets_compiled: fmtCat("UI/UMG"),
      physics_ragdoll_compiled: fmtCat("Rig/Physics")
    },
    deterministic_compilers: compilerSummary,
    runtime_verification: runtimeGate,
    repair_history: repairHistory,
    stage_timeline: stageTimeline,
    audit_files: {
      audit_json: auditJsonPath,
      failed_todo_md: todoMdPath
    }
  };

  fs.mkdirSync(path.dirname(orchestrationReportPath), { recursive: true });
  fs.writeFileSync(orchestrationReportPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const captureIdx = process.argv.indexOf("--capture-dir");
  const captureDir = captureIdx >= 0 ? path.resolve(process.argv[captureIdx + 1]) : undefined;
  const report = runOrchestratedPortingPipeline({ captureDir });
  console.log(JSON.stringify(report.completeness_scorecard, null, 2));
  console.log(`Runtime Gate Passed: ${report.runtime_verification.passed}`);
  if (!report.runtime_verification.passed && !report.runtime_verification.skipped) {
    console.error("Runtime errors:", JSON.stringify(report.runtime_verification.script_errors, null, 2));
    process.exit(1);
  }
}
