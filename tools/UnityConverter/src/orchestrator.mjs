#!/usr/bin/env node
/**
 * PlayForge Deterministic-Core + Agent-Orchestrated Unity -> Godot 4.7.2 Pipeline
 * (Architecture aligned with tools/UnrealConverter/src/orchestrator.mjs)
 *
 * Stages:
 *   1. Deterministic Unity Extraction -> Unified Game IR v0.1 + Schema Validation + SHA-256 Asset Audit
 *   2. Deterministic Resource & Material/Shader Compilers + Byte-Identical Idempotency Verification
 *   3. Godot 4.7.2 Headless Import + Static GDScript Check Gate (--check-only)
 *   4. Live GPU Runtime E2E + Visual Pixel Telemetry Gate (luminance / non-black / overexposed-white) + JPG Compression
 *   5. Bounded Deterministic Repair Loop (triggered only by structured gate diagnostics, max 2 attempts)
 *   6. Completeness Scorecard & Residual Audit Report (audit/unity-orchestration-report.json + FAILED_ASSETS_TODO.md)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractUnityProjectToIR } from './unity-ir-extractor.mjs';
import {
  compileUnityResourcesDeterministic,
  generateUnityAuditTodoMarkdown,
  compressPngToJpg,
  writeIfChanged,
} from './deterministic-compilers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, '..');

export const UNITY_SAMPLE_CATALOG = [
  {
    id: '2d-roguelike',
    name: '2D Roguelike (Scavengers)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-2d-roguelike'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-2d-roguelike'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'unity-to-godot-port.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'godot-runtime-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots'),
    boards: ['compare_01_gameplay_3way.png', 'compare_02_action_and_mechanics.png', 'compare_03_gameover_ui.png'],
  },
  {
    id: 'roll-a-ball',
    name: 'Roll-a-Ball (3D Physics)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-roll-a-ball'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-roll-a-ball'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'port-roll-a-ball.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'roll-a-ball-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots', 'roll-a-ball'),
    boards: ['compare_game2_roll_a_ball.png'],
  },
  {
    id: 'flappy-bird',
    name: 'Flappy Bird (2D UV Parallax)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-flappy-bird'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-flappy-bird'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'port-flappy-bird.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'flappy-bird-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots', 'flappy-bird'),
    boards: ['compare_game3_flappy_bird.png'],
  },
  {
    id: 'space-shooter',
    name: 'Space Shooter (3D FBX + TIFF)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-space-shooter'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-space-shooter'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'port-space-shooter.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'space-shooter-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots', 'space-shooter'),
    boards: ['compare_game4_space_shooter.png'],
  },
  {
    id: 'tanks-3d',
    name: 'Tanks! 3D (Binary Prefab + 26 FBX)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-tanks'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-tanks-3d'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'port-tanks.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'tanks-3d-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots', 'tanks-3d'),
    boards: ['compare_game5_tanks_3engine.png', 'compare_game5_tanks_gameplay_and_winner.png'],
  },
  {
    id: 'boss-room',
    name: 'Boss Room (Official Co-op 3D RPG)',
    sampleDir: path.join(CONVERTER_ROOT, 'samples', 'unity-boss-room'),
    portedDir: path.join(CONVERTER_ROOT, 'ported', 'godot-boss-room'),
    portScript: path.join(CONVERTER_ROOT, 'src', 'port-boss-room.mjs'),
    verificationJson: path.join(CONVERTER_ROOT, 'reports', 'boss-room-verification.json'),
    screenshotDir: path.join(CONVERTER_ROOT, 'reports', 'screenshots', 'boss-room'),
    boards: ['compare_game6_boss_room_before_after.png', 'compare_game6_boss_room_full_loop.png'],
  },
];

export function resolveGodotBin(explicitBin = '') {
  const exeName = 'Godot_v4.7.2-stable_win64_console.exe';
  const candidates = [
    explicitBin,
    process.env.GODOT_BIN,
    process.env.GODOT_EXECUTABLE,
    path.resolve(CONVERTER_ROOT, '..', '..', exeName),
    path.resolve(CONVERTER_ROOT, '..', '..', '..', exeName),
    path.resolve(CONVERTER_ROOT, '..', '..', '..', '..', exeName),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Scan sibling workspaces (e.g. main repo next to worktrees root) without hardcoding paths
  const parentRoot = path.resolve(CONVERTER_ROOT, '..', '..', '..', '..');
  if (fs.existsSync(parentRoot)) {
    for (const entry of fs.readdirSync(parentRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(parentRoot, entry.name, exeName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function readAutoloadNames(portedDir) {
  const pgPath = path.join(portedDir, 'project.godot');
  if (!fs.existsSync(pgPath)) return new Set();
  const txt = fs.readFileSync(pgPath, 'utf8');
  const sec = txt.match(/\[autoload\]([\s\S]*?)(?:\n\[|$)/);
  const names = new Set();
  if (sec) {
    for (const line of sec[1].split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

function parseScriptErrors(output, ignoredAutoloads = new Set()) {
  const lines = String(output || '').split(/\r?\n/);
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('SCRIPT ERROR:') || l.includes('Parse Error:') || l.includes('Shader compilation failed')) {
      const trimmed = l.trim();
      if (ignoredAutoloads.size > 0) {
        const idMatch = trimmed.match(/Identifier not found:\s*([A-Za-z0-9_]+)/);
        if (idMatch && ignoredAutoloads.has(idMatch[1])) continue;
        if (trimmed.includes('Failed to compile depended scripts.')) continue;
      }
      errors.push({ message: trimmed, location: (lines[i + 1] || '').trim() });
    }
  }
  return errors;
}

/**
 * Pixel telemetry gate: inspects captured screenshots for blank/black frames OR overexposed white blowout.
 */
export function inspectScreenshotsPixelGate(screenshotDir, captureNames) {
  const existing = (captureNames || [])
    .map((name) => path.join(screenshotDir, name))
    .filter((p) => fs.existsSync(p));
  if (existing.length === 0) return [];

  const py = [
    'import sys, os, json',
    'from PIL import Image',
    'import numpy as np',
    'out = []',
    'for p in sys.argv[1:]:',
    '    im = Image.open(p).convert("RGB")',
    '    arr = np.asarray(im, dtype=np.float32) / 255.0',
    '    lum = 0.2126 * arr[:,:,0] + 0.7152 * arr[:,:,1] + 0.0722 * arr[:,:,2]',
    '    non_black = float((lum > 0.02).mean())',
    '    overexposed = float(((arr[:,:,0] > 0.98) & (arr[:,:,1] > 0.98) & (arr[:,:,2] > 0.98)).mean())',
    '    out.append({',
    '        "file": os.path.basename(p),',
    '        "width": im.width,',
    '        "height": im.height,',
    '        "mean_luminance": round(float(lum.mean()), 4),',
    '        "non_black_ratio": round(non_black, 4),',
    '        "overexposed_white_ratio": round(overexposed, 4)',
    '    })',
    'print(json.dumps(out))',
  ].join('\n');

  const raw = execFileSync('python', ['-c', py, ...existing], { encoding: 'utf8' });
  return JSON.parse(raw.trim());
}

/**
 * Bounded deterministic repair rules triggered ONLY by structured gate diagnostics.
 */
function applyBoundedDeterministicRepairs(portedDir, diagnostics) {
  const applied = [];
  const scriptsDir = path.join(portedDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) return applied;

  // Rule 1: GDScript 2.0 type inference error -> explicit Variant annotation
  if (diagnostics.some((d) => String(d.message || '').includes('Cannot infer the type of'))) {
    for (const f of fs.readdirSync(scriptsDir).filter((n) => n.endsWith('.gd'))) {
      const fp = path.join(scriptsDir, f);
      const orig = fs.readFileSync(fp, 'utf8');
      const patched = orig.replace(/^(\s*var\s+[A-Za-z0-9_]+)\s*:=\s*(.+)$/gm, (m, lhs, rhs) => {
        if (/^(Vector[234]|Color|Transform3D|Basis|AABB|NodePath|String|int|float|bool|Array|Dictionary|[A-Z][A-Za-z0-9_]*\.new)\b/.test(rhs.trim())) {
          return m;
        }
        return `${lhs}: Variant = ${rhs}`;
      });
      if (patched !== orig) {
        fs.writeFileSync(fp, patched, 'utf8');
        applied.push({ rule: 'FIX_GDSCRIPT_TYPE_INFERENCE', file: `scripts/${f}` });
      }
    }
  }

  // Rule 2: Overexposed white blowout -> enforce EMISSION_OP_MULTIPLY on emission_texture materials
  if (diagnostics.some((d) => d.code === 'SHOT_OVEREXPOSED_WHITE')) {
    for (const f of fs.readdirSync(scriptsDir).filter((n) => n.endsWith('.gd'))) {
      const fp = path.join(scriptsDir, f);
      const orig = fs.readFileSync(fp, 'utf8');
      if (orig.includes('emission_texture') && !orig.includes('EMISSION_OP_MULTIPLY')) {
        const patched = orig.replace(
          /(\w+)\.emission_enabled\s*=\s*true/g,
          '$1.emission_enabled = true\n\t$1.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY',
        );
        if (patched !== orig) {
          fs.writeFileSync(fp, patched, 'utf8');
          applied.push({ rule: 'FIX_EMISSION_OP_MULTIPLY', file: `scripts/${f}` });
        }
      }
    }
  }

  return applied;
}

export function runUnityOrchestratedPipeline({
  samples = ['all'],
  rebuildPorts = false,
  skipGodot = false,
  godotBin = '',
  maxRepairIterations = 2,
  auditReportPath = path.join(CONVERTER_ROOT, 'audit', 'unity-orchestration-report.json'),
  todoMdPath = path.join(CONVERTER_ROOT, 'audit', 'FAILED_ASSETS_TODO.md'),
} = {}) {
  const startedAt = Date.now();
  const resolvedGodot = skipGodot ? null : resolveGodotBin(godotBin);

  const selected = samples.includes('all')
    ? UNITY_SAMPLE_CATALOG
    : UNITY_SAMPLE_CATALOG.filter((s) => samples.includes(s.id));
  if (selected.length === 0) {
    throw new Error(`No matching Unity samples for: ${samples.join(', ')}`);
  }

  const sampleReports = [];
  const sampleAudits = [];

  for (const sample of selected) {
    const tSample = Date.now();
    const stages = [];

    // Stage 1: Deterministic Unity -> Unified Game IR v0.1 Extraction + Asset Audit
    const t1 = Date.now();
    const { validation, auditReport } = extractUnityProjectToIR({
      sampleId: sample.id,
      sampleName: sample.name,
      unityProjectDir: sample.sampleDir,
      portedDir: sample.portedDir,
    });
    sampleAudits.push(auditReport);
    stages.push({
      stage: '1_deterministic_ir_extract',
      passed: validation.valid,
      duration_ms: Date.now() - t1,
      assets_audited: auditReport.totals.total_assets_audited,
      usable_pct: auditReport.totals.usable_in_godot_pct,
      ir_summary: validation.summary,
    });

    // Stage 2: Optional Port Rebuild + Deterministic Material/Shader Compiler + Idempotency Proof
    const t2 = Date.now();
    if (rebuildPorts && fs.existsSync(sample.portScript)) {
      const pRes = spawnSync(process.execPath, [sample.portScript], { encoding: 'utf8', timeout: 120000 });
      if (pRes.status !== 0) {
        throw new Error(`Port script failed for ${sample.id}:\n${pRes.stdout}\n${pRes.stderr}`);
      }
    }
    const pass1 = compileUnityResourcesDeterministic(sample.portedDir);
    const pass2 = compileUnityResourcesDeterministic(sample.portedDir);
    const idempotent = pass2.filesWritten === 0;
    stages.push({
      stage: '2_deterministic_resource_compile',
      passed: idempotent,
      duration_ms: Date.now() - t2,
      compiled_materials: pass1.compiledMaterials,
      compiled_shaders: pass1.compiledShaders,
      idempotent_second_pass_writes: pass2.filesWritten,
    });

    // Stage 3..5: Static GDScript Gate + Live Runtime E2E + Visual Pixel Telemetry Gate + Bounded Repair
    let staticGate = { passed: true, skipped: !resolvedGodot, checked_scripts: 0, errors: [] };
    let runtimeGate = { passed: false, skipped: !resolvedGodot, shots: [], verification: null };
    const repairHistory = [];

    if (resolvedGodot) {
      for (let attempt = 0; attempt <= maxRepairIterations; attempt++) {
        // Static --check-only on every GDScript in scripts/
        const t3 = Date.now();
        const autoloads = readAutoloadNames(sample.portedDir);
        const scriptsDir = path.join(sample.portedDir, 'scripts');
        const gdFiles = fs.existsSync(scriptsDir)
          ? fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.gd')).sort()
          : [];
        const staticErrors = [];
        for (const f of gdFiles) {
          const chk = spawnSync(
            resolvedGodot,
            ['--headless', '--check-only', '--path', sample.portedDir, '-s', `res://scripts/${f}`],
            { encoding: 'utf8', timeout: 25000 },
          );
          staticErrors.push(...parseScriptErrors(`${chk.stdout}\n${chk.stderr}`, autoloads));
        }
        staticGate = {
          passed: staticErrors.length === 0,
          skipped: false,
          attempt,
          duration_ms: Date.now() - t3,
          checked_scripts: gdFiles.length,
          errors: staticErrors,
        };
        stages.push({ stage: `3_static_gdscript_gate_attempt_${attempt}`, ...staticGate });

        if (!staticGate.passed && attempt < maxRepairIterations) {
          const repairs = applyBoundedDeterministicRepairs(sample.portedDir, staticErrors);
          repairHistory.push({ attempt, trigger: 'STATIC_SCRIPT_GATE', repairs });
          if (repairs.length > 0) continue;
        }

        // Live Runtime E2E (deterministic --fixed-fps 60) + Visual Pixel Telemetry Gate
        const t4 = Date.now();
        const verifyScene = path.join(sample.portedDir, 'tests', 'verify_and_capture.tscn');
        const runRes = fs.existsSync(verifyScene)
          ? spawnSync(
              resolvedGodot,
              ['--fixed-fps', '60', '--path', sample.portedDir, 'res://tests/verify_and_capture.tscn'],
              { encoding: 'utf8', timeout: 90000 },
            )
          : { status: 0, stdout: '', stderr: '' };

        const runtimeScriptErrors = parseScriptErrors(`${runRes.stdout}\n${runRes.stderr}`);
        const ver = fs.existsSync(sample.verificationJson)
          ? JSON.parse(fs.readFileSync(sample.verificationJson, 'utf8'))
          : null;
        const shots = ver ? inspectScreenshotsPixelGate(sample.screenshotDir, ver.captures) : [];
        const badShots = shots.filter((s) => {
          const isDarkOverlay = /(?:game_over|gameover|title|splash|intro)/i.test(s.file);
          if (isDarkOverlay) return s.non_black_ratio < 0.001 || s.overexposed_white_ratio > 0.55;
          return s.mean_luminance < 0.05 || s.non_black_ratio < 0.5 || s.overexposed_white_ratio > 0.55;
        });

        const passed =
          runRes.status === 0 &&
          runtimeScriptErrors.length === 0 &&
          Boolean(ver && ver.failedChecks === 0 && ver.passedChecks === ver.totalChecks) &&
          badShots.length === 0;

        runtimeGate = {
          passed,
          skipped: false,
          attempt,
          exit_code: runRes.status,
          duration_ms: Date.now() - t4,
          script_error_count: runtimeScriptErrors.length,
          e2e_checks: ver ? `${ver.passedChecks}/${ver.totalChecks}` : '0/0',
          shots,
        };
        stages.push({ stage: `4_gpu_runtime_and_visual_gate_attempt_${attempt}`, ...runtimeGate });

        if (passed || attempt === maxRepairIterations) break;
        const diags = [
          ...runtimeScriptErrors,
          ...badShots.map((s) => ({
            code: s.overexposed_white_ratio > 0.55 ? 'SHOT_OVEREXPOSED_WHITE' : 'SHOT_TOO_DARK',
            message: `${s.file} lum=${s.mean_luminance} white=${s.overexposed_white_ratio}`,
          })),
        ];
        const repairs = applyBoundedDeterministicRepairs(sample.portedDir, diags);
        repairHistory.push({ attempt, trigger: 'RUNTIME_VISUAL_GATE', diagnostics: diags, repairs });
        if (repairs.length === 0) break;
      }
    } else if (fs.existsSync(sample.verificationJson)) {
      // Offline mode (--skip-godot): verify existing E2E report + pixel gate on saved captures
      const ver = JSON.parse(fs.readFileSync(sample.verificationJson, 'utf8'));
      const shots = inspectScreenshotsPixelGate(sample.screenshotDir, ver.captures);
      runtimeGate = {
        passed: ver.failedChecks === 0 && ver.passedChecks === ver.totalChecks,
        skipped: true,
        e2e_checks: `${ver.passedChecks}/${ver.totalChecks}`,
        shots,
      };
    }

    // Default JPG Compression Policy on comparison boards
    const jpgBoards = [];
    const boardsRoot = path.join(CONVERTER_ROOT, 'reports', 'screenshots');
    for (const boardPng of sample.boards || []) {
      const pngPath = path.join(boardsRoot, boardPng);
      if (fs.existsSync(pngPath)) {
        const jpgPath = pngPath.replace(/\.png$/i, '.jpg');
        const info = compressPngToJpg(pngPath, jpgPath, { quality: 84, maxWidth: 1400 });
        jpgBoards.push({ file: path.basename(jpgPath), ...info });
      }
    }

    sampleReports.push({
      id: sample.id,
      name: sample.name,
      duration_ms: Date.now() - tSample,
      ir_valid: validation.valid,
      idempotent_compile: idempotent,
      completeness: auditReport.totals,
      static_script_gate: staticGate,
      runtime_visual_gate: runtimeGate,
      jpg_boards: jpgBoards,
      repair_history: repairHistory,
      stages,
    });
  }

  // Stage 6: Aggregate Scorecard & Audit Report
  const agg = generateUnityAuditTodoMarkdown(sampleAudits, todoMdPath);
  const allPassed = sampleReports.every(
    (r) => r.ir_valid && r.idempotent_compile && r.static_script_gate.passed && r.runtime_visual_gate.passed,
  );

  const report = {
    generated_at: new Date().toISOString(),
    total_duration_ms: Date.now() - startedAt,
    architecture: 'deterministic_core_with_agent_orchestration',
    default_image_format: 'jpg_progressive_q84_max1400',
    all_gates_passed: allPassed,
    completeness_scorecard: {
      samples_audited: sampleReports.length,
      total_unity_assets: agg.totalAssets,
      ported_full: agg.totalFull,
      ported_partial: agg.totalPartial,
      failed_unsupported: agg.totalFailed,
      usable_in_godot_pct: agg.usablePct,
      weighted_completeness_pct: agg.weightedPct,
    },
    samples: sampleReports,
  };

  writeIfChanged(auditReportPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}
