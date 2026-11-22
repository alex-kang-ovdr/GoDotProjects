#!/usr/bin/env node
/**
 * PlayForge Unity -> Godot 4.7.2 Deterministic Porting Pipeline CLI
 *
 * Usage:
 *   node tools/UnityConverter/src/port-cli.mjs --sample all
 *   node tools/UnityConverter/src/port-cli.mjs --sample boss-room --rebuild
 *   node tools/UnityConverter/src/port-cli.mjs --sample all --skip-godot
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUnityOrchestratedPipeline, UNITY_SAMPLE_CATALOG } from './orchestrator.mjs';

function parseArgs(argv) {
  const opts = {
    samples: ['all'],
    rebuildPorts: false,
    skipGodot: false,
    godotBin: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample' && argv[i + 1]) {
      opts.samples = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--rebuild') {
      opts.rebuildPorts = true;
    } else if (a === '--skip-godot') {
      opts.skipGodot = true;
    } else if (a === '--godot-bin' && argv[i + 1]) {
      opts.godotBin = argv[++i];
    } else if (a === '--list') {
      console.log('Available Unity samples:', UNITY_SAMPLE_CATALOG.map((s) => s.id).join(', '));
      process.exit(0);
    }
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const report = runUnityOrchestratedPipeline(opts);
  console.log(
    JSON.stringify(
      {
        all_gates_passed: report.all_gates_passed,
        total_duration_ms: report.total_duration_ms,
        completeness_scorecard: report.completeness_scorecard,
        samples: report.samples.map((s) => ({
          id: s.id,
          ir_valid: s.ir_valid,
          idempotent: s.idempotent_compile,
          static_scripts: s.static_script_gate.checked_scripts,
          e2e: s.runtime_visual_gate.e2e_checks,
          visual_passed: s.runtime_visual_gate.passed,
          jpg_boards: s.jpg_boards.length,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(report.all_gates_passed ? 0 : 1);
}
