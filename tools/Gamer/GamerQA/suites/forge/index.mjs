import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveDefaultForgeDir, scanForgeProjects } from '../../adapters/forge/project-scanner.mjs';
import { findGodotBinary, getGodotVersion, runGodotProjectCheck } from '../runtime-godot/index.mjs';

function combineStatuses(staticStatus, runtimeStatus, runRuntime) {
  if (staticStatus === 'error' || (runRuntime && runtimeStatus === 'error')) return 'error';
  if (staticStatus === 'fail' || (runRuntime && runtimeStatus === 'fail')) return 'fail';
  if (runRuntime && runtimeStatus === 'skip') return 'skip';
  if (staticStatus === 'warn') return 'warn';
  return 'pass';
}

function phaseStatus(runtimeResult, phaseName) {
  if (!runtimeResult) return 'skip';
  const phase = runtimeResult.phases?.find(p => p.name === phaseName);
  if (phase) return phase.status;
  return runtimeResult.status === 'error' ? 'error' : 'skip';
}

/**
 * Format a Forge QA suite report into a human-readable Markdown summary.
 */
export function formatForgeReportMarkdown(report) {
  const lines = [
    '# Forge GamerQA Report',
    '',
    `- **Status**: \`${report.status.toUpperCase()}\``,
    `- **Policy**: \`${report.policyVersion}\``,
    `- **Generated**: ${report.generatedAt}`,
    `- **Duration**: ${report.durationMs} ms`,
    `- **Runner**: Node ${report.runner.nodeVersion} (${report.runner.platform}) / Godot ${report.runner.godotVersion || 'unavailable'}`,
    `- **Summary**: ${report.summary.passed}/${report.summary.total} passed (fail: ${report.summary.failed}, error: ${report.summary.errored}, skip: ${report.summary.skipped}, warnings: ${report.summary.warnings})`,
    `- **Template Catalog**: ${report.catalogCheck?.checked ? (report.catalogCheck.ok ? `PASS (${report.catalogCheck.templateIds.length} templates, ${report.catalogCheck.packCount} asset packs)` : `FAIL (${report.catalogCheck.error || report.catalogCheck.missingFromCatalog?.join(', ')})`) : 'SKIPPED'}`,
    '',
    '## Project Verification Matrix',
    '',
    '| ID | Kind | Main Scene | Scripts | Static | Import | Boot | Errors | Duration | Status |',
    '|---|---|---|---:|---|---|---|---:|---:|---|',
  ];

  for (const proj of report.projects) {
    const mainScene = proj.staticScan.checks?.mainScene?.raw || '-';
    const scripts = proj.staticScan.stats?.gdFiles ?? 0;
    const importCol = report.runRuntime ? phaseStatus(proj.runtimeGodot, 'import') : 'skip';
    const bootCol = report.runRuntime ? phaseStatus(proj.runtimeGodot, 'boot') : 'skip';
    lines.push(
      `| ${proj.id} | ${proj.kind} | \`${mainScene}\` | ${scripts} | ${proj.staticScan.status} | ${importCol} | ${bootCol} | ${proj.errorCount} | ${proj.durationMs} ms | **${proj.status.toUpperCase()}** |`,
    );
  }

  const failingProjects = report.projects.filter(p => p.status !== 'pass' || p.warningCount > 0);
  if (failingProjects.length > 0) {
    lines.push('', '## Findings & Diagnostics', '');
    for (const proj of failingProjects) {
      lines.push(`### ${proj.id} (${proj.status})`);
      for (const issue of proj.staticScan.issues || []) {
        lines.push(`- [static:${issue.severity}] ${issue.code}: ${issue.message}`);
      }
      for (const err of proj.runtimeGodot?.errors || []) {
        lines.push(`- [godot:${err.phase}:${err.type}] ${err.line}`);
      }
      for (const warn of proj.runtimeGodot?.warnings || []) {
        lines.push(`- [godot:${warn.phase}:WARNING] ${warn.line}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Run the comprehensive Forge QA suite across `forge/Samples/*` and `forge/Templates/*`:
 * 1. Static structural scan (`project.godot`, `run/main_scene`, `.gd`, `.tscn`/`.tres`, assets)
 * 2. Template catalog cross-check (`forge/Tools/template-catalog.cjs`)
 * 3. Isolated Godot 4.7+ headless import + boot verification (`runtime-godot`)
 */
export function runForgeSuite(options = {}) {
  const started = performance.now();
  const forgeDir = path.resolve(options.forgeDir || resolveDefaultForgeDir());
  const runRuntime = options.runRuntime !== false;

  const scanReport = scanForgeProjects({
    forgeDir,
    includeSamples: options.includeSamples,
    includeTemplates: options.includeTemplates,
    only: options.only,
    checkTemplateCatalog: options.checkTemplateCatalog,
  });

  let godotBinary = { found: false, executable: null, reason: 'Runtime verification disabled' };
  let godotVersion = null;
  if (runRuntime) {
    godotBinary = findGodotBinary({ godotBin: options.godotBin, searchFrom: forgeDir });
    if (godotBinary.found) {
      godotVersion = getGodotVersion(godotBinary.executable);
    }
  }

  const projects = scanReport.projects.map(staticScan => {
    const projectStart = performance.now();
    let runtimeGodot = null;

    if (runRuntime) {
      if (!staticScan.checks?.projectGodot?.ok) {
        runtimeGodot = {
          suite: 'runtime-godot',
          status: 'skip',
          projectDir: staticScan.projectDir,
          isolated: false,
          godot: { executable: godotBinary.executable, version: godotVersion },
          phases: [],
          errors: [{ phase: 'preflight', type: 'SKIPPED_MISSING_PROJECT', line: 'Skipped runtime check because project.godot is missing or invalid' }],
          warnings: [],
          durationMs: 0,
        };
      } else if (!godotBinary.found) {
        runtimeGodot = {
          suite: 'runtime-godot',
          status: 'error',
          projectDir: staticScan.projectDir,
          isolated: false,
          godot: { executable: null, version: null },
          phases: [],
          errors: [{ phase: 'preflight', type: 'GODOT_NOT_FOUND', line: godotBinary.reason }],
          warnings: [],
          durationMs: 0,
        };
      } else {
        runtimeGodot = runGodotProjectCheck(staticScan.projectDir, {
          godotBin: godotBinary.executable,
          isolate: options.isolate !== false,
          runImport: options.runImport,
          runBoot: options.runBoot,
          quitAfterFrames: options.quitAfterFrames ?? 3,
          importTimeoutMs: options.importTimeoutMs,
          bootTimeoutMs: options.bootTimeoutMs,
          failOnWarning: options.failOnWarning,
        });
      }
    }

    const staticFailCount = (staticScan.issues || []).filter(i => i.severity === 'fail').length;
    const staticWarnCount = (staticScan.issues || []).filter(i => i.severity === 'warn').length;
    const runtimeErrorCount = runtimeGodot ? runtimeGodot.errors.length : 0;
    const runtimeWarnCount = runtimeGodot ? runtimeGodot.warnings.length : 0;
    const status = combineStatuses(staticScan.status, runtimeGodot?.status, runRuntime);

    return {
      id: staticScan.id,
      name: staticScan.name,
      kind: staticScan.kind,
      relativePath: staticScan.relativePath,
      projectDir: staticScan.projectDir,
      status,
      staticScan,
      runtimeGodot,
      errorCount: staticFailCount + runtimeErrorCount,
      warningCount: staticWarnCount + runtimeWarnCount,
      durationMs: Math.round(performance.now() - projectStart),
    };
  });

  const samples = projects.filter(p => p.kind === 'sample');
  const templates = projects.filter(p => p.kind === 'template');

  const summary = {
    total: projects.length,
    passed: projects.filter(p => p.status === 'pass').length,
    warned: projects.filter(p => p.status === 'warn').length,
    failed: projects.filter(p => p.status === 'fail').length,
    errored: projects.filter(p => p.status === 'error').length,
    skipped: projects.filter(p => p.status === 'skip').length,
    warnings: projects.reduce((sum, p) => sum + p.warningCount, 0),
    samplesTotal: samples.length,
    samplesPassed: samples.filter(p => p.status === 'pass').length,
    templatesTotal: templates.length,
    templatesPassed: templates.filter(p => p.status === 'pass').length,
  };

  const overallStatus = summary.total === 0 || summary.errored > 0
    ? 'error'
    : summary.failed > 0 || !scanReport.catalogCheck.ok
      ? 'fail'
      : summary.skipped > 0
        ? 'skip'
        : summary.warned > 0
          ? 'warn'
          : 'pass';

  const report = {
    suite: 'forge',
    policyVersion: 'forge-qa.v1',
    status: overallStatus,
    generatedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    forgeDir: scanReport.forgeDir,
    runRuntime,
    runner: {
      platform: `${os.platform()} ${os.release()}`,
      nodeVersion: process.version,
      godotExecutable: godotBinary.executable,
      godotVersion,
    },
    catalogCheck: scanReport.catalogCheck,
    summary,
    projects,
  };

  return {
    ...report,
    markdown: formatForgeReportMarkdown(report),
  };
}

export function runSuite(options = {}) {
  return runForgeSuite(options);
}

function parseCliArgs(argv) {
  const options = { format: 'markdown' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.format = 'json';
    else if (arg === '--md' || arg === '--markdown') options.format = 'markdown';
    else if (arg === '--samples-only') options.includeTemplates = false;
    else if (arg === '--templates-only') options.includeSamples = false;
    else if (arg === '--no-runtime') options.runRuntime = false;
    else if (arg === '--godot' && argv[i + 1]) options.godotBin = argv[++i];
    else if (arg === '--only' && argv[i + 1]) options.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--forge-dir' && argv[i + 1]) options.forgeDir = argv[++i];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const cli = parseCliArgs(process.argv.slice(2));
  const result = runForgeSuite(cli);
  if (cli.format === 'json') {
    const { markdown: _markdown, ...jsonReport } = result;
    console.log(JSON.stringify(jsonReport, null, 2));
  } else {
    console.log(result.markdown);
  }
  process.exitCode = result.status === 'pass' ? 0 : 1;
}
