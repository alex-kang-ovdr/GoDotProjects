import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cr-smoke-'));
const port = Number(process.env.SMOKE_PORT || 18991);

const child = spawn(process.execPath, ['deploy/cloudrun/hub/entrypoint.mjs'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    PLAYHUB_DATA_DIR: path.join(tmp, 'data'),
    PLAYHUB_FORGE_DIR: path.join(tmp, 'forge'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
let stdout = '';
let finished = false;

const cleanup = code => {
  if (finished) return;
  finished = true;
  child.kill('SIGTERM');
  setTimeout(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    process.exit(code);
  }, 400);
};

child.stderr.on('data', d => { stderr += d.toString(); });
child.stdout.on('data', async d => {
  stdout += d.toString();
  if (!stdout.includes('cloudrun_hub_listening')) return;
  try {
    const base = `http://127.0.0.1:${port}`;
    const hz = await fetch(`${base}/_healthz`).then(r => r.json());
    const idx = await fetch(`${base}/`);
    const cfg = await fetch(`${base}/config.js`).then(r => r.text());
    const api = await fetch(`${base}/api/health`).then(r => r.json());
    const ver = await fetch(`${base}/api/version`).then(r => r.json());
    const compatOk = await fetch(`${base}/api/compat/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'hub',
        buildCode: ver.buildInfo.buildCode,
        engineAbi: ver.buildInfo.compat.engineAbi,
        engineApiRev: ver.buildInfo.compat.engineApiRev,
        netProtocol: ver.buildInfo.compat.netProtocol,
        gameplayHash: ver.buildInfo.compat.gameplayHash,
      }),
    });
    const compatOkBody = await compatOk.json();
    const compatBlock = await fetch(`${base}/api/compat/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'aos', buildCode: ver.buildInfo.buildCode, engineAbi: 'godot-4.6' }),
    });
    const compatBlockBody = await compatBlock.json();
    const adm = await fetch(`${base}/api/admin/health`);
    const admPolicy = await fetch(`${base}/api/admin/release-policy`);
    const intl = await fetch(`${base}/internal/session/verify`);
    const storePage = await fetch(`${base}/store/`);
    const storeCat = await fetch(`${base}/api/store/catalog?limit=2`).then(r => r.json());
    const billCat = await fetch(`${base}/api/billing/catalog?currency=KRW&channel=web_browser`);
    const billWallet = await fetch(`${base}/api/billing/wallet`);
    const forgeRedir = await fetch(`${base}/PlayForge/`, { redirect: 'manual' });
    const res = {
      hz,
      indexStatus: idx.status,
      hasCoopOnHub: idx.headers.has('cross-origin-opener-policy'),
      hasLocationOrigin: cfg.includes('location.origin'),
      api,
      versionOk: ver.ok && Boolean(ver.buildInfo?.buildId),
      compatOkStatus: compatOk.status,
      compatOkDecision: compatOkBody.decision,
      compatBlockStatus: compatBlock.status,
      compatBlockDecision: compatBlockBody.decision,
      adminBlocked: adm.status,
      adminPolicyBlocked: admPolicy.status,
      internalBlocked: intl.status,
      storePageStatus: storePage.status,
      storeCatalogTotal: storeCat.total ?? storeCat.items?.length ?? 0,
      billingCatalogStatus: billCat.status,
      billingWalletStatus: billWallet.status,
      playForgeRedirectStatus: forgeRedir.status,
      playForgeRedirectLocation: forgeRedir.headers.get('location'),
    };
    console.log('SMOKE_OK', JSON.stringify(res));
    if (
      !hz.ok ||
      idx.status !== 200 ||
      res.hasCoopOnHub ||
      !res.hasLocationOrigin ||
      !api.ok ||
      !res.versionOk ||
      compatOk.status !== 200 ||
      compatOkBody.decision !== 'COMPAT_ALLOW' ||
      compatBlock.status !== 426 ||
      compatBlockBody.decision !== 'COMPAT_BLOCK_FORCE_UPDATE' ||
      adm.status !== 404 ||
      admPolicy.status !== 404 ||
      intl.status !== 404 ||
      storePage.status !== 200 ||
      res.storeCatalogTotal < 1 ||
      billCat.status !== 200 ||
      billWallet.status !== 200 ||
      forgeRedir.status !== 302 ||
      res.playForgeRedirectLocation !== '/forge/OfficialGodot/'
    ) {
      throw new Error('Unexpected smoke check result: ' + JSON.stringify(res));
    }
    cleanup(0);
  } catch (err) {
    console.error('SMOKE_FAIL', err.message, stderr);
    cleanup(1);
  }
});

child.on('exit', code => {
  if (!finished) {
    console.error('ENTRYPOINT_EXITED_EARLY', code, stderr);
    cleanup(1);
  }
});

setTimeout(() => {
  console.error('SMOKE_TIMEOUT', stdout, stderr);
  cleanup(1);
}, 12000);
