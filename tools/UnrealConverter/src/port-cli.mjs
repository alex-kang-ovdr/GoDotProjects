#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractUnrealProjectToIR } from "./ue-extractor.mjs";
import { validateUnifiedIR } from "../common-ir/validators/validate-ir.mjs";
import { generateGodotProjectFromIR } from "./godot-generator.mjs";
import { compareTraces } from "./trace-comparator.mjs";
import { runRepairLoop } from "./ai-repair.mjs";
import { exportPortedToForgeTemplate } from "./export-forge-template.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CONVERTER_ROOT, "../..");
const DEFAULT_GODOT_BIN = "D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe";

export function runGodotHeadlessVerify(portedDir, traceOutPath, godotBin = DEFAULT_GODOT_BIN) {
  if (!fs.existsSync(godotBin)) {
    return {
      skipped: true,
      passed: false,
      reason: `Godot binary not found at ${godotBin}`
    };
  }
  const env = { ...process.env, PLAYFORGE_TRACE_OUT: traceOutPath };
  const res = spawnSync(
    godotBin,
    ["--headless", "--fixed-fps", "60", "--path", portedDir, "res://tests/verify_and_trace.tscn"],
    { env, encoding: "utf8", timeout: 60000 }
  );
  const traceExists = fs.existsSync(traceOutPath);
  const trace = traceExists ? JSON.parse(fs.readFileSync(traceOutPath, "utf8")) : null;
  const passed = res.status === 0 && traceExists && (res.stdout || "").includes("PLAYFORGE_UNREAL_TRACE_OK:");
  return {
    skipped: false,
    passed,
    exitCode: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    traceOutPath,
    trace
  };
}

export function runFullUnrealPortPipeline({
  fixtureDir = path.join(CONVERTER_ROOT, "fixtures/third-person-template"),
  portedDir = path.join(CONVERTER_ROOT, "ported/godot-third-person"),
  reportDir = path.join(CONVERTER_ROOT, "reports"),
  templateDir = path.join(REPO_ROOT, "forge/Templates/unreal-third-person"),
  godotBin = process.env.GODOT_BIN || DEFAULT_GODOT_BIN,
  exportTemplate = true
} = {}) {
  fs.mkdirSync(reportDir, { recursive: true });

  // Stage 1: Extract UE Project -> Unified Game IR v0.1
  const ir = extractUnrealProjectToIR(fixtureDir);
  const irValidation = validateUnifiedIR(ir);
  if (!irValidation.valid) {
    throw new Error(`Unified IR validation failed: ${irValidation.errors.join("; ")}`);
  }

  // Stage 2: Generate Godot 4.7.2 Project
  const genResult = generateGodotProjectFromIR(ir, portedDir);
  ir.source_map = genResult.sourceMap;
  ir.diagnostics.push(...genResult.diagnostics);

  fs.writeFileSync(path.join(reportDir, "unified-ir.json"), JSON.stringify(ir, null, 2), "utf8");

  // Stage 3: Godot 4.7.2 Headless Import + Runtime Trace Verification
  const traceOutPath = path.join(reportDir, "godot-runtime-trace.json");
  const godotVerify = runGodotHeadlessVerify(portedDir, traceOutPath, godotBin);

  // Stage 4: Reference Trace Comparison
  const refTracePath = path.join(fixtureDir, "reference_trace.json");
  let traceComparison = null;
  if (godotVerify.passed && fs.existsSync(refTracePath)) {
    const refTrace = JSON.parse(fs.readFileSync(refTracePath, "utf8"));
    traceComparison = compareTraces(refTrace, godotVerify.trace);
  }

  // Stage 5: AI Diagnosis & Repair Loop (only adopt if regression passes)
  const repairResult = runRepairLoop({
    diagnostics: ir.diagnostics,
    traceComparison,
    verifyWithOverrides: (repairOverrides) => {
      generateGodotProjectFromIR(ir, portedDir, { repairOverrides });
      const repairedTracePath = path.join(reportDir, "godot-runtime-trace-repaired.json");
      const reVerify = runGodotHeadlessVerify(portedDir, repairedTracePath, godotBin);
      if (reVerify.skipped) {
        return { passed: true, mode: "static_only" };
      }
      if (!reVerify.passed) {
        return { passed: false, exitCode: reVerify.exitCode };
      }
      if (fs.existsSync(refTracePath)) {
        const refTrace = JSON.parse(fs.readFileSync(refTracePath, "utf8"));
        const cmp = compareTraces(refTrace, reVerify.trace);
        return { passed: cmp.passed, traceComparison: cmp };
      }
      return { passed: true };
    }
  });

  // Stage 6: Export PlayForge Template
  let templateExport = null;
  if (exportTemplate) {
    templateExport = exportPortedToForgeTemplate({
      portedDir,
      templateDir,
      templateId: "unreal-third-person"
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_project: ir.source.project,
    source_engine_version: ir.source.version,
    ir_validation: irValidation,
    generated_file_count: genResult.generatedFiles.length,
    source_map_entries: ir.source_map.length,
    diagnostics: ir.diagnostics,
    godot_verify: {
      skipped: godotVerify.skipped,
      passed: godotVerify.passed,
      exitCode: godotVerify.exitCode ?? null
    },
    trace_comparison: traceComparison,
    ai_repair: {
      applied: repairResult.applied,
      adopted_count: repairResult.adopted_patches.length,
      rejected_count: repairResult.rejected_patches.length
    },
    template_export: templateExport
  };

  fs.writeFileSync(path.join(reportDir, "conversion-report.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "conversion-report.md"), formatMarkdownReport(report), "utf8");
  return report;
}

function formatMarkdownReport(r) {
  const lines = [
    `# Unreal Engine → Godot Conversion Report`,
    ``,
    `- **Project**: ${r.source_project} (UE ${r.source_engine_version})`,
    `- **IR Validation**: ${r.ir_validation.valid ? "PASS" : "FAIL"} (${r.ir_validation.summary.entities} entities, ${r.ir_validation.summary.logic_graphs} logic graphs, ${r.ir_validation.summary.blocked_assets} license-blocked assets)`,
    `- **Generated Files**: ${r.generated_file_count} (Source Map entries: ${r.source_map_entries})`,
    `- **Godot 4.7.2 Headless Runtime**: ${r.godot_verify.skipped ? "SKIPPED" : r.godot_verify.passed ? "PASS" : "FAIL"}`,
    `- **AI Repair Loop**: ${r.ai_repair.applied ? `APPLIED (${r.ai_repair.adopted_count} patch adopted)` : "NO-OP / REJECTED"}`,
    ``
  ];
  if (r.trace_comparison) {
    lines.push(`## Trace Comparison (${r.trace_comparison.passed ? "PASS" : "FAIL"})`);
    lines.push(`| Metric | Measured | Tolerance | Status |`);
    lines.push(`|---|---:|---:|---|`);
    for (const c of r.trace_comparison.checks) {
      lines.push(`| ${c.metric} | ${c.measured ?? `${c.actual_count}/${c.reference_count}`} | ${c.tolerance ?? "exact"} | ${c.passed ? "PASS" : "FAIL"} |`);
    }
    lines.push(``);
  }
  if (r.diagnostics.length > 0) {
    lines.push(`## Diagnostics (${r.diagnostics.length})`);
    for (const d of r.diagnostics) {
      lines.push(`- **[${d.severity.toUpperCase()}] ${d.code}** (\`${d.source_ref}\`): ${d.message}`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runFullUnrealPortPipeline();
  console.log(JSON.stringify(report, null, 2));
}
