'use strict';
// Reproducible headless export check (roadmap 16 R0 spike, Forge-BuildExport).
// Exports the same Godot project N times into fresh, separate project copies + output dirs, builds a
// BuildManifest for each, and compares content_hash / per-file sha256 / PCK directory entries.
//
// Usage:
//   node forge/Tools/build-export/repro-export.cjs [--project <dir>] [--work <dir>] [--godot <bin>]
//        [--modes release,pack] [--preset Web] [--report <file.json>]
// Default project: forge/Tests/build-export/fixtures/minimal
//
// NOTE: this runs Godot import/export on the given project (it can execute @tool scripts / editor plugins).
// Only point it at trusted projects; see docs/build-export/ISOLATED_BUILD_WORKER.md.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const engineResolver = require('../../../tools/engine/resolve-godot.cjs');
const bm = require('./build-manifest.cjs');
const { diffPck } = require('./pck-reader.cjs');
const { lintProject } = require('./repro-lint.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_PROJECT = path.join(REPO_ROOT, 'forge', 'Tests', 'build-export', 'fixtures', 'minimal');
// Stock roots only (the worktrees root also holds Forge-GodotEngine/bin, whose template binaries are rejected).
const STOCK_SEARCH = [path.join(REPO_ROOT, 'artifacts', 'local-runtime', 'godot'), path.resolve(REPO_ROOT, '..', '..', 'GoDotProjects')];

/**
 * Resolve an EDITOR-capable Godot binary. tools/engine/resolve-godot may return a fork *template* binary
 * (e.g. Forge-GodotEngine/bin/godot.windows.template_debug...), which cannot import/export; such a hit is
 * rejected and we fall back to the stock search roots.
 */
function resolveExportGodot(explicit) {
  const notes = [];
  if (explicit) return { executable: path.resolve(explicit), source: 'explicit', notes };
  const first = engineResolver.resolveGodotBinary({ preferConsole: true });
  if (first.found && !/template_(debug|release)/i.test(path.basename(first.executable))) {
    return { executable: first.executable, source: first.source, notes };
  }
  if (first.found) notes.push(`resolve-godot returned a non-editor template binary (${first.executable}); falling back to stock search`);
  const stock = engineResolver.resolveGodotBinary({ preferConsole: true, searchFrom: STOCK_SEARCH, searchOnly: true });
  if (stock.found && !/template_(debug|release)/i.test(path.basename(stock.executable))) {
    return { executable: stock.executable, source: stock.source, notes };
  }
  throw new Error(`No editor-capable Godot binary found. ${first.reason || ''} ${stock.reason || ''}`.trim());
}

function copyProject(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      return base !== '.godot' && base !== '.git' && base !== 'build-manifest.json';
    },
  });
}

function runGodot(godot, args, logFile, timeoutMs = 180000) {
  const started = Date.now();
  const r = spawnSync(godot, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const out = `$ godot ${args.join(' ')}\n${r.stdout || ''}${r.stderr || ''}\n[exit ${r.status}${r.error ? ' ' + r.error.message : ''}]\n`;
  fs.appendFileSync(logFile, out);
  const errorLines = (r.stdout + r.stderr).split(/\r?\n/).filter((l) => /SCRIPT ERROR:|^ERROR:|\bERROR:/.test(l));
  return { status: r.status, ms: Date.now() - started, errorLines };
}

function exportOnce({ godot, projectSrc, runDir, mode, preset }) {
  const project = path.join(runDir, 'project');
  const output = path.join(runDir, 'output');
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  copyProject(projectSrc, project);
  const log = path.join(runDir, 'godot.log');
  const imp = runGodot(godot, ['--headless', '--path', project, '--editor', '--import', '--quit'], log);
  const target = mode === 'pack' ? path.join(output, 'game.pck') : path.join(output, 'index.html');
  const flag = mode === 'pack' ? '--export-pack' : '--export-release';
  const exp = runGodot(godot, ['--headless', '--path', project, flag, preset, target], log);
  if (exp.status !== 0 || !fs.existsSync(target)) throw new Error(`Export failed (${mode}) in ${runDir}; see ${log}`);
  return { project, output, log, importMs: imp.ms, exportMs: exp.ms, errorLines: [...imp.errorLines, ...exp.errorLines] };
}

function compareManifests(a, b) {
  const mapB = new Map(b.artifacts.map((x) => [x.path, x]));
  const mapA = new Map(a.artifacts.map((x) => [x.path, x]));
  const differing = [];
  for (const x of a.artifacts) {
    const y = mapB.get(x.path);
    if (!y) differing.push({ path: x.path, reason: 'only-in-A' });
    else if (x.sha256 !== y.sha256) differing.push({ path: x.path, reason: 'content', bytesA: x.bytes, bytesB: y.bytes });
  }
  for (const y of b.artifacts) if (!mapA.has(y.path)) differing.push({ path: y.path, reason: 'only-in-B' });
  return { identical: a.content_hash === b.content_hash, contentHashA: a.content_hash, contentHashB: b.content_hash, fileCount: a.artifacts.length, differing };
}

/** Locate first differing byte ranges (for non-PCK files). */
function byteDiffSummary(fileA, fileB, maxRanges = 5) {
  const a = fs.readFileSync(fileA);
  const b = fs.readFileSync(fileB);
  const ranges = [];
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && ranges.length < maxRanges) {
    if (a[i] !== b[i]) {
      const start = i;
      while (i < n && a[i] !== b[i]) i += 1;
      ranges.push({ start, end: i });
    } else i += 1;
  }
  const differingBytes = (() => { let c = 0; for (let k = 0; k < n; k += 1) if (a[k] !== b[k]) c += 1; return c + Math.abs(a.length - b.length); })();
  return { sizeA: a.length, sizeB: b.length, differingBytes, firstRanges: ranges };
}

function main() {
  const args = bm.parseArgs(process.argv.slice(2));
  const projectSrc = path.resolve(typeof args.project === 'string' ? args.project : DEFAULT_PROJECT);
  const work = path.resolve(typeof args.work === 'string' ? args.work : fs.mkdtempSync(path.join(os.tmpdir(), 'repro-export-')));
  const preset = typeof args.preset === 'string' ? args.preset : 'Web';
  const godotInfo = resolveExportGodot(typeof args.godot === 'string' ? args.godot : process.env.GODOT_BIN);
  const godot = godotInfo.executable;
  const version = bm.readGodotVersion(godot);
  const engine = bm.deriveEngineLock({ godotBin: godot, binaryVersion: version });

  const templatePath = bm.resolveTemplatePath({ platform: 'Web', mode: 'release' });
  let modes = typeof args.modes === 'string' ? args.modes.split(',') : ['release', 'pack'];
  const notes = [...godotInfo.notes];
  if (modes.includes('release') && !templatePath) {
    notes.push('Web export template (web_nothreads_release.zip) not installed: release export skipped, --export-pack only');
    modes = modes.filter((m) => m !== 'release');
    if (!modes.includes('pack')) modes.push('pack');
  }

  const report = {
    tool: 'forge/Tools/build-export/repro-export.cjs',
    project: path.relative(REPO_ROOT, projectSrc).split(path.sep).join('/'),
    work,
    godot: { path: godot, source: godotInfo.source, version, binary_path_kind: engine.binary_path_kind, binary_sha256: engine.binary_sha256 },
    template: templatePath ? { path: templatePath, sha256: bm.sha256File(templatePath) } : null,
    notes,
    preflightLint: lintProject(projectSrc),
    results: [],
  };

  for (const mode of modes) {
    const runs = {};
    const manifests = {};
    // A and B: separate absolute paths (path-independence). C: same path as A, re-created (pure re-run).
    for (const label of ['A', 'B', 'C']) {
      const runDir = path.join(work, mode, label === 'C' ? 'A' : label);
      if (label === 'C') {
        // keep A's manifest/artifact copies before wiping
        fs.cpSync(path.join(work, mode, 'A'), path.join(work, mode, 'A.keep'), { recursive: true });
      }
      runs[label] = exportOnce({ godot, projectSrc, runDir, mode, preset });
      manifests[label] = bm.buildManifest({
        projectDir: runs[label].project,
        outputDir: runs[label].output,
        projectId: 'build-export-repro-fixture',
        preset,
        platform: 'Web',
        mode,
        templatePath: mode === 'pack' ? null : templatePath,
        engine,
      });
      const errs = bm.validateManifest(manifests[label]);
      if (errs.length) throw new Error(`Manifest invalid (${mode}/${label}): ${errs.join('; ')}`);
      if (label !== 'C') fs.writeFileSync(path.join(runs[label].output, bm.MANIFEST_FILENAME), JSON.stringify(manifests[label], null, 2) + '\n');
    }
    const keptA = path.join(work, mode, 'A.keep', 'output');
    const ab = compareManifests(manifests.A, manifests.B);
    const ac = compareManifests(manifests.A, manifests.C);
    const detail = {};
    for (const d of ab.differing.filter((x) => x.reason === 'content')) {
      const fa = path.join(keptA, ...d.path.split('/'));
      const fb = path.join(runs.B.output, ...d.path.split('/'));
      detail[d.path] = d.path.endsWith('.pck') ? { pck: diffPck(fs.readFileSync(fa), fs.readFileSync(fb)) } : { bytes: byteDiffSummary(fa, fb) };
    }
    report.results.push({
      mode,
      exportFlag: mode === 'pack' ? '--export-pack' : '--export-release',
      artifacts: manifests.A.artifacts.map(({ path: p, bytes }) => ({ path: p, bytes })),
      input_hash_equal: manifests.A.input_hash === manifests.B.input_hash,
      source_hash_equal: manifests.A.source_hash === manifests.B.source_hash,
      timingsMs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { import: v.importMs, export: v.exportMs }])),
      godotErrorLines: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.errorLines.slice(0, 10)])),
      differentPaths_A_vs_B: ab,
      samePathRerun_A_vs_C: ac,
      diffDetail_A_vs_B: detail,
    });
  }

  const reportFile = typeof args.report === 'string' ? path.resolve(args.report) : path.join(work, 'repro-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  for (const r of report.results) {
    const ab = r.differentPaths_A_vs_B;
    const ac = r.samePathRerun_A_vs_C;
    console.log(`[${r.mode}] files=${ab.fileCount} A/B(different paths) ${ab.identical ? 'IDENTICAL' : 'DIFFERENT'} ${ab.contentHashA.slice(0, 16)} vs ${ab.contentHashB.slice(0, 16)}; A/C(same path) ${ac.identical ? 'IDENTICAL' : 'DIFFERENT'}; differing=${ab.differing.map((d) => d.path).join(',') || '-'}`);
  }
  for (const n of notes) console.log(`note: ${n}`);
  for (const l of report.preflightLint) console.log(`lint: ${l.path} ${l.rule} nodes=${l.nodes.join(',')}`);
  console.log(`report: ${reportFile}`);
  return report;
}

module.exports = { resolveExportGodot, compareManifests, byteDiffSummary };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.stack || err.message);
    process.exit(1);
  }
}
