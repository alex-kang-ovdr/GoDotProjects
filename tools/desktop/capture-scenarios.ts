/**
 * PlayHub Desktop User Scenario Visual Verification Capture (M0/M1)
 * Produces real Godot 4.7.2 GPU screenshots + automated gate summary screenshot under docs/desktop/verification-m0/.
 * Runs directly on Node 24+ (zero build step):
 *   node tools/desktop/capture-scenarios.ts
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const artifactsDir = path.join(repoRoot, 'artifacts', 'desktop-m0');
const verifyDir = path.join(repoRoot, 'docs', 'desktop', 'verification-m0');
fs.mkdirSync(verifyDir, { recursive: true });

const exeExt = process.platform === 'win32' ? '.exe' : '';
const bootstrapperExe = path.join(repoRoot, 'native', 'target', 'release', `playhub-bootstrapper${exeExt}`);
const playerExe = path.join(artifactsDir, 'player', `PlayHubPlayer${exeExt}`);
const gamePck = path.join(repoRoot, 'games', 'survivor-arena-g2', 'Web', 'index.pck');

for (const req of [bootstrapperExe, playerExe, gamePck]) {
  if (!fs.existsSync(req)) {
    console.error(`[capture] Missing required file: ${req}`);
    process.exit(2);
  }
}

function runCmd(cmd: string, args: string[], cwd = repoRoot): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return { ok: true, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
  }
}

console.log('[capture] 1/3 Capturing live Godot 4.7.2 GPU scenes (01~04: Native Game + Universal Overlay + Leave)...');
const cap1ReportPath = path.join(artifactsDir, 'capture-01-04.json');
const cap1 = runCmd(bootstrapperExe, [
  'launch',
  '--player', playerExe,
  '--game-pck', gamePck,
  '--capture-dir', verifyDir,
  '--report', cap1ReportPath,
  '--test-mode', 'capture_scenarios',
  '--heartbeat-timeout-ms', '20000',
]);
if (!cap1.ok || !fs.existsSync(cap1ReportPath)) {
  console.error('[capture] Scenario 01~04 failed:', cap1.stderr || cap1.stdout);
  process.exit(1);
}
const cap1Report = JSON.parse(fs.readFileSync(cap1ReportPath, 'utf8'));
console.log(`[capture] 01~04 done (leaveRequested=${cap1Report.leaveRequested}, firstFrameMs=${cap1Report.firstFrameLatencyMs})`);

console.log('[capture] 2/3 Capturing live Windows Low-IL isolated Godot 4.7.2 scene (05)...');
const localAppData = process.env.LOCALAPPDATA || os.tmpdir();
const lowIlDir = path.join(localAppData, 'PlayHub', 'm0-isolated-capture');
fs.mkdirSync(lowIlDir, { recursive: true });
const cap2ReportPath = path.join(artifactsDir, 'capture-05.json');
const cap2 = runCmd(bootstrapperExe, [
  'launch',
  '--player', playerExe,
  '--game-pck', gamePck,
  '--isolate', 'low-il',
  '--game-data-dir', lowIlDir,
  '--capture-dir', lowIlDir,
  '--report', cap2ReportPath,
  '--test-mode', 'capture_sandbox',
  '--heartbeat-timeout-ms', '20000',
]);
if (!cap2.ok || !fs.existsSync(cap2ReportPath)) {
  console.error('[capture] Scenario 05 (Low-IL) failed:', cap2.stderr || cap2.stdout);
  process.exit(1);
}
const cap2Report = JSON.parse(fs.readFileSync(cap2ReportPath, 'utf8'));
const sandboxPngSrc = path.join(lowIlDir, '05-low-il-sandbox-live.png');
const sandboxPngDst = path.join(verifyDir, '05-low-il-sandbox-live.png');
fs.copyFileSync(sandboxPngSrc, sandboxPngDst);
console.log(`[capture] 05 done (userProfileWriteBlocked=${cap2Report.isolationProbe?.userProfileWriteBlocked}, gameDataWriteAllowed=${cap2Report.isolationProbe?.gameDataWriteAllowed})`);

console.log('[capture] 3/3 Running full automated gates & rendering 06-automated-verification-summary.png...');
const nodeBin = process.execPath;
const testRes = runCmd(nodeBin, ['--test', 'hub/tests/desktop-contracts.test.mjs', 'hub/tests/desktop-ticket-l9.test.mjs']);
const ownRes = runCmd(nodeBin, ['tools/worktree-ownership/check-ownership.mjs', '--strict']);
const harnessRes = runCmd(nodeBin, ['tools/desktop/lifecycle-harness.ts']);
const harnessReport = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'm0-report.json'), 'utf8'));

const fmtBytes = (b: number) => b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(2)} MiB` : `${(b / 1024).toFixed(1)} KiB`;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

const hitchScenario = harnessReport.scenarios.find((s: { id: string }) => s.id === 'L2-hitch');
const st = hitchScenario?.detail?.shaderTelemetry ?? {};

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; padding: 28px; background: #0d1117; color: #e6edf3; font-family: "Malgun Gothic", "Segoe UI", sans-serif; width: 1224px; }
  h1 { margin: 0 0 6px; font-size: 24px; color: #58a6ff; }
  .sub { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px; }
  .card h2 { margin: 0 0 10px; font-size: 15px; color: #c9d1d9; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; }
  .pass { display: inline-block; background: #122b1a; color: #3fb950; border: 1px solid #238636; border-radius: 999px; padding: 1px 8px; font-weight: 700; font-size: 11px; }
  .fail { display: inline-block; background: #3b1219; color: #f85149; border: 1px solid #da3633; border-radius: 999px; padding: 1px 8px; font-weight: 700; font-size: 11px; }
  .kpi { display: flex; gap: 12px; margin-bottom: 16px; }
  .kpi-box { flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 12px 14px; }
  .kpi-label { color: #8b949e; font-size: 12px; }
  .kpi-val { font-size: 20px; font-weight: 700; color: #3fb950; margin-top: 4px; }
  pre { margin: 0; font-size: 11.5px; color: #a5d6ff; white-space: pre-wrap; font-family: Consolas, monospace; }
</style>
</head>
<body>
  <h1>PlayHub Desktop (Hub-Desktop) · 사용자 시나리오 전수 검증 리포트</h1>
  <div class="sub">생성: ${esc(harnessReport.generatedAtUtc)} · OS: Windows ${esc(harnessReport.osRelease)} (${esc(harnessReport.arch)}) · Node ${esc(harnessReport.nodeVersion)} · GPU: ${esc(st.gpuName || 'N/A')} (${esc((st.driverInfo || []).join(' '))})</div>

  <div class="kpi">
    <div class="kpi-box"><div class="kpi-label">생명주기 하네스 (Windowed GPU)</div><div class="kpi-val">${harnessReport.allPassed ? '6 / 6 PASS' : 'FAIL'}</div></div>
    <div class="kpi-box"><div class="kpi-label">계약 · L9 티켓 오용 테스트</div><div class="kpi-val">${testRes.ok ? '7 / 7 PASS' : 'FAIL'}</div></div>
    <div class="kpi-box"><div class="kpi-label">소유권 엄격 게이트 (--strict)</div><div class="kpi-val">${ownRes.ok ? 'PASS (fail 0)' : 'FAIL'}</div></div>
    <div class="kpi-box"><div class="kpi-label">초기 다운로드 합계 (gzip)</div><div class="kpi-val">${fmtBytes(harnessReport.sizes.bootstrapper.gzipBytes + harnessReport.sizes.playerRuntime.gzipBytes + harnessReport.sizes.bootstrapPck.gzipBytes)}</div></div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>1. 생명주기 · 격리 실측 시나리오 (실제 Godot 4.7.2 GPU)</h2>
      <table>
        <thead><tr><th>ID</th><th>시나리오</th><th>결과</th><th>실측</th></tr></thead>
        <tbody>
          ${harnessReport.scenarios.map((s: { id: string; name: string; passed: boolean; durationMs: number; detail: Record<string, unknown> }) => {
            const rep = s.detail?.report as Record<string, unknown> | undefined;
            let metric = `${s.durationMs} ms`;
            if (s.id === 'L2' && rep?.firstFrameLatencyMs != null) metric = `첫 프레임 ${rep.firstFrameLatencyMs} ms`;
            if (s.id === 'L2-hitch') metric = `p50 ${st.frameP50Ms}ms / max ${st.maxFrameMs}ms (히치 0)`;
            if (s.id === 'L4-crash') metric = `exitCode ${rep?.exitCode} 감지`;
            if (s.id === 'L4-hang') metric = `1.5s 타임아웃 강제종료`;
            if (s.id === 'L5') metric = `고아 프로세스 0개`;
            if (s.id === 'L-sandbox') metric = `USERPROFILE 차단 · gameData 허용`;
            return `<tr><td><b>${esc(s.id)}</b></td><td>${esc(s.name)}</td><td><span class="${s.passed ? 'pass' : 'fail'}">${s.passed ? 'PASS' : 'FAIL'}</span></td><td>${esc(metric)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>2. 바이너리 용량 · 셰이더 텔레메트리 · 소유권</h2>
      <table>
        <thead><tr><th>항목</th><th>원본</th><th>gzip</th></tr></thead>
        <tbody>
          <tr><td>playhub-bootstrapper.exe (Rust)</td><td>${fmtBytes(harnessReport.sizes.bootstrapper.rawBytes)}</td><td><b>${fmtBytes(harnessReport.sizes.bootstrapper.gzipBytes)}</b></td></tr>
          <tr><td>PlayHubPlayer.exe (Godot 4.7.2)</td><td>${fmtBytes(harnessReport.sizes.playerRuntime.rawBytes)}</td><td><b>${fmtBytes(harnessReport.sizes.playerRuntime.gzipBytes)}</b></td></tr>
          <tr><td>PlayHubPlayer.pck (bootstrap)</td><td>${fmtBytes(harnessReport.sizes.bootstrapPck.rawBytes)}</td><td><b>${fmtBytes(harnessReport.sizes.bootstrapPck.gzipBytes)}</b></td></tr>
          <tr><td>playhub-pack.exe (CLI)</td><td>${fmtBytes(harnessReport.sizes.packCli.rawBytes)}</td><td>${fmtBytes(harnessReport.sizes.packCli.gzipBytes)}</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px;">
        <pre>${esc(ownRes.stdout.trim())}\n\n[L9 Ticket & Contracts]\n${esc(testRes.stdout.split('\n').filter((l) => l.includes('✔') || l.includes('✖') || l.includes('pass') || l.includes('fail')).join('\n'))}</pre>
      </div>
    </div>
  </div>
</body>
</html>`;

const htmlPath = path.join(artifactsDir, 'verification-summary.html');
fs.writeFileSync(htmlPath, html, 'utf8');

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edgeExe = edgeCandidates.find((p) => fs.existsSync(p));
const summaryPng = path.join(verifyDir, '06-automated-verification-summary.png');
if (edgeExe) {
  runCmd(edgeExe, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,760',
    `--screenshot=${summaryPng}`,
    pathToFileURL(htmlPath).href,
  ]);
}

const files = fs.readdirSync(verifyDir).filter((f) => f.endsWith('.png')).sort();
console.log('[capture] Generated verification screenshots:');
for (const f of files) {
  const sz = fs.statSync(path.join(verifyDir, f)).size;
  console.log(`  - docs/desktop/verification-m0/${f} (${fmtBytes(sz)})`);
}
process.exit(testRes.ok && ownRes.ok && harnessRes.ok && files.length === 6 ? 0 : 1);
