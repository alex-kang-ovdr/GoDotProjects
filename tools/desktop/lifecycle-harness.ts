/**
 * PlayHub Desktop M0 3-OS Lifecycle Test Harness (L2, L4, L5) + Size/Latency Measurement
 * Runs directly on Node 24+ (type stripping, zero build step):
 *   node tools/desktop/lifecycle-harness.ts [--headless] [--game-pck <path>]
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

interface BootstrapperReport {
  status: string;
  os: string;
  arch: string;
  platformBackend: string;
  playerPid: number;
  authenticated: boolean;
  engineVersion: string | null;
  authLatencyMs: number | null;
  firstFrameLatencyMs: number | null;
  totalDurationMs: number;
  heartbeatCount: number;
  leaveRequested: boolean;
  exitCode: number | null;
  rejectedConnections: number;
  firstFramePayload: Record<string, unknown> | null;
  shaderTelemetry: Record<string, unknown> | null;
  isolationProbe: Record<string, unknown> | null;
}

interface ScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  detail: Record<string, unknown>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outDir = path.join(repoRoot, 'artifacts', 'desktop-m0');
fs.mkdirSync(outDir, { recursive: true });

const argv = process.argv.slice(2);
const headless = argv.includes('--headless');
const gamePckIdx = argv.indexOf('--game-pck');
const defaultGamePck = path.join(repoRoot, 'games', 'survivor-arena-g2', 'Web', 'index.pck');
const gamePck = gamePckIdx >= 0 ? argv[gamePckIdx + 1] : (fs.existsSync(defaultGamePck) ? defaultGamePck : '');

const exeExt = process.platform === 'win32' ? '.exe' : '';
const bootstrapperExe = path.join(repoRoot, 'native', 'target', 'release', `playhub-bootstrapper${exeExt}`);
const packExe = path.join(repoRoot, 'native', 'target', 'release', `playhub-pack${exeExt}`);
const playerExe = path.join(outDir, 'player', `PlayHubPlayer${exeExt}`);
const bootstrapPck = path.join(outDir, 'player', 'PlayHubPlayer.pck');

for (const req of [bootstrapperExe, playerExe, bootstrapPck]) {
  if (!fs.existsSync(req)) {
    console.error(`[harness] Missing required binary/asset: ${req}`);
    process.exit(2);
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    return code === 'EPERM';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runBootstrapper(extraArgs: string[]): { code: number; report: BootstrapperReport | null; stderr: string } {
  const reportFile = path.join(outDir, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  const args = [
    'launch',
    '--player', playerExe,
    '--bootstrap-pck', bootstrapPck,
    '--report', reportFile,
    ...(headless ? ['--headless'] : []),
    ...extraArgs,
  ];
  let exitCode = 0;
  let stderr = '';
  try {
    execFileSync(bootstrapperExe, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string };
    exitCode = typeof e.status === 'number' ? e.status : 1;
    stderr = String(e.stderr || '');
  }
  let report: BootstrapperReport | null = null;
  if (fs.existsSync(reportFile)) {
    report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as BootstrapperReport;
    fs.unlinkSync(reportFile);
  }
  return { code: exitCode, report, stderr };
}

function measureGzipSize(filePath: string): { rawBytes: number; gzipBytes: number } {
  const buf = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(buf, { level: 6 });
  return { rawBytes: buf.length, gzipBytes: gz.length };
}

async function runL2(): Promise<ScenarioResult> {
  const t0 = Date.now();
  const extra = ['--test-mode', 'exit_ok'];
  if (gamePck) extra.push('--game-pck', gamePck);
  const res = runBootstrapper(extra);
  const r = res.report;
  const passed =
    res.code === 0 &&
    r !== null &&
    r.status === 'ok' &&
    r.authenticated === true &&
    r.firstFrameLatencyMs !== null &&
    r.firstFrameLatencyMs <= 10_000 &&
    !isPidAlive(r.playerPid);
  return {
    id: 'L2',
    name: 'Launch -> IPC Auth -> First Frame -> Clean Exit',
    passed,
    durationMs: Date.now() - t0,
    detail: {
      exitCode: res.code,
      gamePck: gamePck || '(bootstrap-only)',
      headless,
      report: r,
    },
  };
}

async function runL4Crash(): Promise<ScenarioResult> {
  const t0 = Date.now();
  const res = runBootstrapper(['--test-mode', 'crash']);
  const r = res.report;
  const passed =
    res.code !== 0 &&
    r !== null &&
    r.status === 'crash_detected' &&
    r.authenticated === true &&
    r.exitCode === 42 &&
    !isPidAlive(r.playerPid);
  return {
    id: 'L4-crash',
    name: 'Game Crash Detection (non-zero exit code)',
    passed,
    durationMs: Date.now() - t0,
    detail: { exitCode: res.code, report: r },
  };
}

async function runL4Hang(): Promise<ScenarioResult> {
  const t0 = Date.now();
  const res = runBootstrapper(['--test-mode', 'hang', '--heartbeat-timeout-ms', '1500']);
  const r = res.report;
  await sleep(200);
  const passed =
    res.code !== 0 &&
    r !== null &&
    r.status === 'hang_detected' &&
    r.authenticated === true &&
    !isPidAlive(r.playerPid);
  return {
    id: 'L4-hang',
    name: 'Game Hang Detection & Forced Termination (0 orphans)',
    passed,
    durationMs: Date.now() - t0,
    detail: { exitCode: res.code, report: r },
  };
}

async function runL5OrphanKill(): Promise<ScenarioResult> {
  const t0 = Date.now();
  const pidFile = path.join(outDir, `l5-player-${Date.now()}.pid`);
  const args = [
    'launch',
    '--player', playerExe,
    '--bootstrap-pck', bootstrapPck,
    '--pid-file', pidFile,
    '--heartbeat-timeout-ms', '20000',
    ...(headless ? ['--headless'] : []),
  ];

  const child = spawn(bootstrapperExe, args, { stdio: 'ignore' });
  let playerPid = 0;

  // Wait up to 8s for Player PID to appear and stay alive
  const waitDeadline = Date.now() + 8_000;
  while (Date.now() < waitDeadline) {
    if (fs.existsSync(pidFile)) {
      const txt = fs.readFileSync(pidFile, 'utf8').trim();
      const parsed = Number.parseInt(txt, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        playerPid = parsed;
        break;
      }
    }
    await sleep(50);
  }

  // Give Player a moment to initialize inside the Job Object / process group
  await sleep(600);
  const aliveBeforeKill = isPidAlive(playerPid);

  // Force-kill the Bootstrapper (simulating crash / Task Manager kill)
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/F'], { stdio: 'ignore' });
    } catch {
      child.kill('SIGKILL');
    }
  } else {
    child.kill('SIGKILL');
  }

  // Wait up to 2s for kernel Job Object / PR_SET_PDEATHSIG to terminate Player
  const killDeadline = Date.now() + 2_000;
  let aliveAfterKill = true;
  while (Date.now() < killDeadline) {
    aliveAfterKill = isPidAlive(playerPid);
    if (!aliveAfterKill) break;
    await sleep(50);
  }

  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  if (aliveAfterKill && playerPid > 0) {
    try { process.kill(playerPid, 'SIGKILL'); } catch { /* ignore */ }
  }

  const passed = playerPid > 0 && aliveBeforeKill && !aliveAfterKill;
  return {
    id: 'L5',
    name: 'Bootstrapper Force-Kill -> 0 Orphan Player Processes',
    passed,
    durationMs: Date.now() - t0,
    detail: {
      bootstrapperPid: child.pid ?? null,
      playerPid,
      aliveBeforeKill,
      aliveAfterKill,
    },
  };
}

async function runL2HitchProbe(): Promise<ScenarioResult> {
  const t0 = Date.now();
  const extra = ['--test-mode', 'hitch_probe'];
  if (gamePck) extra.push('--game-pck', gamePck);
  const res = runBootstrapper(extra);
  const r = res.report;
  const st = r?.shaderTelemetry ?? null;
  const sampledFrames = typeof st?.sampledFrames === 'number' ? st.sampledFrames : 0;
  const passed =
    res.code === 0 &&
    r !== null &&
    r.status === 'ok' &&
    r.authenticated === true &&
    st !== null &&
    sampledFrames > 0 &&
    !isPidAlive(r.playerPid);
  return {
    id: 'L2-hitch',
    name: 'Shader Compile & Post-Launch Frame Hitch Telemetry',
    passed,
    durationMs: Date.now() - t0,
    detail: {
      exitCode: res.code,
      headless,
      firstFrameLatencyMs: r?.firstFrameLatencyMs ?? null,
      shaderTelemetry: st,
    },
  };
}

async function runLSandbox(): Promise<ScenarioResult> {
  const t0 = Date.now();
  if (process.platform !== 'win32') {
    return {
      id: 'L-sandbox',
      name: 'Low-IL Isolation Escape Test (Windows PoC)',
      passed: true,
      durationMs: 0,
      detail: { skipped: true, reason: 'Windows Low-IL PoC only; Linux/macOS L2 planned in M3' },
    };
  }
  // Per-user game data lives under %LOCALAPPDATA%\PlayHub (user owns Full Control -> can apply Low-IL label without admin).
  const localAppData = process.env.LOCALAPPDATA || os.tmpdir();
  const gameDataDir = path.join(localAppData, 'PlayHub', 'm0-isolated-game-data');
  fs.mkdirSync(gameDataDir, { recursive: true });
  const res = runBootstrapper([
    '--isolate', 'low-il',
    '--game-data-dir', gameDataDir,
    '--test-mode', 'escape_probe',
  ]);
  const r = res.report;
  const probe = r?.isolationProbe ?? null;
  const passed =
    res.code === 0 &&
    r !== null &&
    r.status === 'ok' &&
    r.authenticated === true &&
    probe !== null &&
    probe.userProfileWriteBlocked === true &&
    probe.gameDataWriteAllowed === true &&
    !isPidAlive(r.playerPid);
  return {
    id: 'L-sandbox',
    name: 'Windows Low-IL Restricted Token Escape Test (blocks %USERPROFILE%, allows gameDataDir)',
    passed,
    durationMs: Date.now() - t0,
    detail: {
      exitCode: res.code,
      headless,
      isolationProbe: probe,
      report: r,
    },
  };
}

async function main(): Promise<void> {
  const scenarios: ScenarioResult[] = [];
  scenarios.push(await runL2());
  scenarios.push(await runL2HitchProbe());
  scenarios.push(await runL4Crash());
  scenarios.push(await runL4Hang());
  scenarios.push(await runL5OrphanKill());
  scenarios.push(await runLSandbox());

  const sizes = {
    bootstrapper: measureGzipSize(bootstrapperExe),
    packCli: fs.existsSync(packExe) ? measureGzipSize(packExe) : null,
    playerRuntime: measureGzipSize(playerExe),
    bootstrapPck: measureGzipSize(bootstrapPck),
  };

  const allPassed = scenarios.every((s) => s.passed);
  const report = {
    generatedAtUtc: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    osRelease: os.release(),
    headless,
    allPassed,
    sizes,
    scenarios,
  };

  const reportPath = path.join(outDir, 'm0-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[harness] Report written -> ${reportPath}`);
  process.exit(allPassed ? 0 : 1);
}

main();
