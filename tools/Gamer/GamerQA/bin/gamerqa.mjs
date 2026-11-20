#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStrictJson } from '../core/fs-utils.mjs';
import { resolveProjectRoot } from '../core/paths.mjs';
import { runQaPipeline, verifyInstallation } from '../core/runner.mjs';
import { renderMarkdownReport, writeMarkdownReport } from '../reporters/markdown-reporter.mjs';

const VALID_SUITES = new Set(['static', 'security', 'runtime-web']);

function printHelp() {
  console.log(`GamerQA CLI (PlayHub QA & Submission Review)

Usage:
  gamerqa run [options]       Run Tier 0 (static, security) and Tier 1 (runtime-web) checks
  gamerqa report [options]    Generate Markdown/JSON report from an existing report.json
  gamerqa verify [options]    Verify Node 24+, schemas, policy, catalog, and browser driver

Run options:
  --game <id[,id...]>         Target game ID(s) (repeatable)
  --all                       Run against all games in games/catalog.json
  --project-root <dir>        Override PlayHub repository/worktree root
  --out-dir <dir>             Output directory (default: <projectRoot>/artifacts/gamerqa/<runId>)
  --run-id <id>               Explicit run ID
  --policy <version|path>     Review policy version or path (default: v1)
  --tier <suite[,suite...]>   Suites to run: static,security,runtime-web
  --skip-browser              Run HTTP checks without launching browser
  --continue-on-block         Do not fail-fast Tier 1 when Tier 0 hits a block rule
  --timeout-ms <ms>           Browser readiness timeout in ms (default: 20000)
  --json                      Print JSON report summary to stdout

Report options:
  --input <path>              Input report.json path
  --run-id <id>               Read <projectRoot>/artifacts/gamerqa/<runId>/report.json
  --out <path>                Output path (default: REPORT.md beside input or stdout)
  --format <markdown|json>    Output format (default: markdown)
  --project-root <dir>        Override PlayHub repository/worktree root

Verify options:
  --check                     Check-only readiness mode (non-mutating)
  --project-root <dir>        Override PlayHub repository/worktree root
  --json                      Print JSON result

Exit codes:
  0  passed or warned (no fail, error, or skip)
  1  failed or error
  2  invalid usage or not_run
  3  partial (some checks skipped)`);
}

function parseFlags(args) {
  const opts = { games: [], suites: [], positional: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '-h' || token === '--help') { opts.help = true; continue; }
    if (token === '--all') { opts.all = true; continue; }
    if (token === '--check') { opts.check = true; continue; }
    if (token === '--skip-browser') { opts.skipBrowser = true; continue; }
    if (token === '--continue-on-block') { opts.continueOnBlock = true; continue; }
    if (token === '--json') { opts.json = true; continue; }
    if (!token.startsWith('--')) { opts.positional.push(token); continue; }

    const eqIdx = token.indexOf('=');
    const key = eqIdx > 0 ? token.slice(0, eqIdx) : token;
    const value = eqIdx > 0 ? token.slice(eqIdx + 1) : args[++i];
    if (value === undefined || (eqIdx < 0 && value.startsWith('--'))) {
      throw new Error(`Missing value for ${key}`);
    }

    if (key === '--game' || key === '--games') {
      opts.games.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (key === '--tier' || key === '--suite' || key === '--suites') {
      for (const s of value.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!VALID_SUITES.has(s)) throw new Error(`Unsupported suite '${s}'. Expected: static, security, runtime-web`);
        opts.suites.push(s);
      }
    } else if (key === '--project-root') {
      opts.projectRoot = value;
    } else if (key === '--out-dir') {
      opts.outDir = value;
    } else if (key === '--run-id') {
      opts.runId = value;
    } else if (key === '--policy') {
      opts.policy = value;
    } else if (key === '--timeout-ms') {
      const ms = Number(value);
      if (!Number.isInteger(ms) || ms < 1000 || ms > 180000) throw new Error('--timeout-ms must be 1000..180000');
      opts.timeoutMs = ms;
    } else if (key === '--input') {
      opts.input = value;
    } else if (key === '--out') {
      opts.out = value;
    } else if (key === '--format') {
      if (!['markdown', 'json'].includes(value)) throw new Error('--format must be markdown or json');
      opts.format = value;
    } else {
      throw new Error(`Unknown flag: ${key}`);
    }
  }
  return opts;
}

export async function runCli(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return 0;
  }

  const command = argv[0];
  let opts;
  try {
    opts = parseFlags(argv.slice(1));
  } catch (err) {
    console.error(`Usage error: ${err.message}`);
    return 2;
  }

  if (opts.help) {
    printHelp();
    return 0;
  }

  if (command === 'verify') {
    const result = verifyInstallation({ projectRoot: opts.projectRoot });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`GamerQA verify: ${result.ok ? 'READY' : 'FAILED'}`);
      for (const item of result.checks) {
        console.log(`  [${item.ok ? 'OK' : 'FAIL'}] ${item.id}: ${item.message}`);
      }
    }
    return result.ok ? 0 : 1;
  }

  if (command === 'report') {
    try {
      let inputPath = opts.input ? path.resolve(opts.input) : null;
      if (!inputPath && opts.runId) {
        const root = resolveProjectRoot(opts.projectRoot);
        inputPath = path.join(root, 'artifacts', 'gamerqa', opts.runId, 'report.json');
      }
      if (!inputPath) throw new Error('Specify --input <report.json> or --run-id <id>');
      if (!fs.existsSync(inputPath)) throw new Error(`Report file not found: ${inputPath}`);

      const report = readStrictJson(inputPath, 16 * 1024 * 1024);
      const format = opts.format || 'markdown';
      if (format === 'json') {
        const out = JSON.stringify(report, null, 2) + '\n';
        if (opts.out) {
          fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
          fs.writeFileSync(path.resolve(opts.out), out, 'utf8');
        } else {
          process.stdout.write(out);
        }
        return 0;
      }

      if (opts.out) {
        const written = writeMarkdownReport(report, path.resolve(opts.out));
        console.log(`Wrote Markdown report: ${written}`);
      } else {
        process.stdout.write(renderMarkdownReport(report) + '\n');
      }
      return 0;
    } catch (err) {
      console.error(`Report error: ${err.message}`);
      return 2;
    }
  }

  if (command === 'run') {
    try {
      const { report, outDir, reportJsonPath, reportMdPath } = await runQaPipeline({
        projectRoot: opts.projectRoot,
        games: opts.games,
        all: Boolean(opts.all),
        suites: opts.suites.length ? [...new Set(opts.suites)] : undefined,
        policy: opts.policy || 'v1',
        runId: opts.runId,
        outDir: opts.outDir,
        skipBrowser: Boolean(opts.skipBrowser),
        continueOnBlock: Boolean(opts.continueOnBlock),
        browserTimeoutMs: opts.timeoutMs || 20000,
      });

      if (opts.json) {
        console.log(JSON.stringify({ runId: report.runId, status: report.status, passed: report.passed, score: report.score, summary: report.summary, outDir, reportJsonPath, reportMdPath }, null, 2));
      } else {
        console.log(`GamerQA run ${report.runId}: status=${report.status} passed=${report.passed} score=${report.score}/100`);
        for (const g of report.games) {
          console.log(`  - ${g.gameId}: ${g.status.toUpperCase()} (score=${g.score}, pass=${g.summary.pass}, warn=${g.summary.warn}, fail=${g.summary.fail}, skip=${g.summary.skip})`);
        }
        console.log(`Reports: ${reportJsonPath} | ${reportMdPath}`);
      }

      if (report.status === 'passed' || report.status === 'warned') return 0;
      if (report.status === 'partial') return 3;
      if (report.status === 'not_run') return 2;
      return 1;
    } catch (err) {
      console.error(`GamerQA run error: ${err.message}`);
      return 2;
    }
  }

  console.error(`Unknown subcommand: ${command}`);
  printHelp();
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
