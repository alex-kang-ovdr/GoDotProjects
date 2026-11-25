'use strict';
// Godot 헤드리스로 playforge_trace 수집기를 실행 → 스키마 검증 → p50/p95/p99 요약.
// 사용법:
//   node forge/Tools/trace/run-godot-collector.cjs --out <dir> [--frames 300] [--warmup 30]
//        [--project forge/Godot] [--godot <exe>] [--scene res://...] [--build-id <id>]
//        [--target forge-desktop --semver 0.1.0]   (tools/build-version buildId 사용 시)
// 산출물: <dir>/trace.jsonl, <dir>/summary.json, <dir>/console.log
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateJsonlFile } = require('./trace-sample.cjs');
const { summarize, formatTable } = require('./summarize.cjs');
const { resolveTraceBuildId, REPO_ROOT } = require('./build-id.cjs');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}

function resolveGodot(explicit) {
  if (explicit) return explicit;
  try {
    const { resolveGodotBinary } = require(path.join(REPO_ROOT, 'tools', 'engine', 'resolve-godot.cjs'));
    const r = resolveGodotBinary({ preferConsole: true });
    // export template 빌드는 --path 오버라이드를 막아 두었으므로(disable_path_overrides) 수집기 실행에 쓸 수 없다
    if (r.found && !/template_(debug|release)/i.test(path.basename(r.executable))) return r.executable;
  } catch {}
  for (const dir of [path.join(REPO_ROOT, 'artifacts', 'local-runtime', 'godot'), path.resolve(REPO_ROOT, '..', '..', 'GoDotProjects')]) {
    const exe = path.join(dir, 'Godot_v4.7.2-stable_win64_console.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.out) { console.error('usage: run-godot-collector.cjs --out <dir> [--frames N] [--warmup N] [--godot exe] [--project dir]'); process.exit(2); }
  const outDir = path.resolve(o.out);
  fs.mkdirSync(outDir, { recursive: true });
  const project = path.resolve(o.project || path.join(REPO_ROOT, 'forge', 'Godot'));
  const godot = resolveGodot(o.godot);
  if (!godot) { console.error('Godot executable not found (set --godot or GODOT_BIN)'); process.exit(2); }
  const { buildId, origin } = await resolveTraceBuildId({ buildId: o['build-id'], target: o.target, semver: o.semver });
  const tracePath = path.join(outDir, 'trace.jsonl');
  if (fs.existsSync(tracePath)) fs.rmSync(tracePath);
  const args = ['--headless', '--path', project, '-s', 'res://addons/playforge_trace/trace_main.gd', '--',
    `--trace-out=${tracePath}`, `--trace-frames=${o.frames || 300}`, `--trace-warmup=${o.warmup || 30}`,
    `--trace-build-id=${buildId}`, '--trace-quit'];
  if (o.scene) args.push(`--trace-scene=${o.scene}`);
  const t0 = Date.now();
  const run = spawnSync(godot, args, { encoding: 'utf8', timeout: Number(o.timeout || 180000), windowsHide: true });
  const wallMs = Date.now() - t0;
  fs.writeFileSync(path.join(outDir, 'console.log'), `$ ${godot} ${args.join(' ')}\n--- stdout ---\n${run.stdout || ''}\n--- stderr ---\n${run.stderr || ''}\nexit=${run.status} signal=${run.signal}\n`, 'utf8');
  if (run.status !== 0 || !fs.existsSync(tracePath)) {
    console.error(`godot run failed (exit=${run.status}); see ${path.join(outDir, 'console.log')}`);
    process.exit(1);
  }
  const v = validateJsonlFile(tracePath);
  const summary = summarize(v.samples);
  const report = {
    godot, project, buildId, buildIdOrigin: origin, wallMs,
    validation: { lines: v.count, valid: v.samples.length, invalid: v.errors.length, firstErrors: v.errors.slice(0, 5) },
    summary,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(formatTable(summary));
  console.log(`validation: ${v.samples.length}/${v.count} valid; build_id=${buildId} (${origin}); wall=${wallMs}ms`);
  process.exit(v.errors.length ? 1 : 0);
}

if (require.main === module) main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
