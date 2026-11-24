// Regression: https://playhub-dev-2611.web.app/forge/OfficialGodot/ could not connect.
// 1) Hub rewrites Host to the Forge run.app host, so Forge without PUBLIC_ORIGIN
//    rejected every browser POST/WebSocket from the Firebase Hosting origin (403 Foreign origin),
//    and Hub itself answered ORIGIN_DENIED because web.app was not in its user origins.
// 2) The CI-built Forge image shipped without the gitignored custom web editor binaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  repoRoot, buildManifest, verifyDir, parseManifest, webEditorArtifactVersion, MANIFEST_NAME,
} from './web-editor-artifact.mjs';

const require = createRequire(import.meta.url);
const { createOriginPolicy } = require('../../../forge/Tools/origin-policy.cjs');

const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/cloudrun-pipeline.yml'), 'utf8');
const WEB_APP = 'https://playhub-dev-2611.web.app';
const HUB_RUN_APP = 'https://playhub-hub-abc123-uw.a.run.app';
const FORGE_HOST = 'playhub-forge-def456-uw.a.run.app';

function devPublicOrigins() {
  const m = /^\s*DEV_PUBLIC_ORIGINS:\s*(\S+)\s*$/m.exec(workflow);
  assert.ok(m, 'workflow env must define DEV_PUBLIC_ORIGINS');
  return m[1];
}

test('workflow lists the Firebase Hosting origins as exact HTTPS origins', () => {
  const origins = devPublicOrigins().split(',');
  assert.ok(origins.includes(WEB_APP));
  for (const origin of origins) assert.equal(new URL(origin).origin, origin);
});

test('Forge behind the Hub proxy accepts the hosting origin only when PUBLIC_ORIGIN is configured', () => {
  const browserPost = { headers: { host: FORGE_HOST, origin: WEB_APP } };
  // Reproduces the deployed failure: no PUBLIC_ORIGIN -> compared against the rewritten run.app Host.
  assert.equal(createOriginPolicy(undefined)(browserPost), false);

  const deploy = /gcloud run deploy playhub-forge[\s\S]*?--update-env-vars="([^"]+)"/.exec(workflow);
  assert.ok(deploy, 'dev Forge deploy step must set env vars');
  const publicOrigin = /(?:\^##\^|##)PUBLIC_ORIGIN=([^#]+)/.exec(deploy[1]);
  assert.ok(publicOrigin, 'dev Forge deploy must set PUBLIC_ORIGIN');
  assert.equal(publicOrigin[1], '${DEV_PUBLIC_ORIGINS},${HUB_URL}');

  const resolved = publicOrigin[1].replace('${DEV_PUBLIC_ORIGINS}', devPublicOrigins()).replace('${HUB_URL}', HUB_RUN_APP);
  const policy = createOriginPolicy(resolved);
  assert.equal(policy(browserPost), true);
  assert.equal(policy({ headers: { host: FORGE_HOST, origin: HUB_RUN_APP } }), true);
  assert.equal(policy({ headers: { host: FORGE_HOST, origin: 'https://foreign.test', 'x-forwarded-host': 'playhub-dev-2611.web.app' } }), false);
});

test('dev Hub deploy adds the hosting origins to PLAYHUB_EXTRA_ORIGINS', () => {
  const envVars = /^\s*ENV_VARS="\^##\^PLAYHUB_ROLE=public[^"]*"/m.exec(workflow);
  assert.ok(envVars);
  assert.match(envVars[0], /##PLAYHUB_EXTRA_ORIGINS=\$\{DEV_PUBLIC_ORIGINS\}##/);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// Needs hub/dist built for the Cloud Run config (CI verify job runs `node hub/tools/build.mjs` first).
test('Hub entrypoint honours PLAYHUB_EXTRA_ORIGINS for user API origin checks', async t => {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-origin-'));
  const child = spawn(process.execPath, ['deploy/cloudrun/hub/entrypoint.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PLAYHUB_DATA_DIR: path.join(tmp, 'data'),
      PLAYHUB_FORGE_DIR: path.join(tmp, 'forge'),
      PLAYHUB_EXTRA_ORIGINS: devPublicOrigins(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill('SIGTERM'); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const started = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Hub entrypoint did not start')), 20000);
    child.stdout.on('data', d => { out += d; if (out.includes('cloudrun_hub_listening')) { clearTimeout(timer); resolve(true); } });
    child.once('exit', code => {
      clearTimeout(timer);
      if (/Complete manual deployment|Missing deployed Hub output/.test(stderr)) resolve(false);
      else reject(new Error(`Hub exited ${code}: ${stderr.slice(-400)}`));
    });
  });
  if (!started) return t.skip('hub/dist is not built for the Cloud Run entrypoint (run node hub/tools/build.mjs)');
  const post = origin => fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
  }).then(async r => ({ status: r.status, body: await r.text() }));
  const allowed = await post(WEB_APP);
  assert.doesNotMatch(allowed.body, /ORIGIN_DENIED/);
  const foreign = await post('https://foreign.test');
  assert.equal(foreign.status, 403);
  assert.match(foreign.body, /ORIGIN_DENIED/);
});

test('web editor artifact manifest is required, complete and tamper-evident', () => {
  assert.match(webEditorArtifactVersion(), /^[0-9a-f]{40}$/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-editor-artifact-'));
  try {
    fs.writeFileSync(path.join(dir, 'godot.editor.js'), 'var Engine = {};');
    assert.throws(() => buildManifest(dir), /godot\.editor\.wasm/);
    fs.writeFileSync(path.join(dir, 'godot.editor.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
    fs.writeFileSync(path.join(dir, 'godot.editor.wasm.br'), 'derived');
    const manifest = buildManifest(dir);
    assert.deepEqual([...parseManifest(manifest).keys()], ['godot.editor.js', 'godot.editor.wasm']);
    fs.writeFileSync(path.join(dir, MANIFEST_NAME), manifest);
    assert.equal(verifyDir(dir).size, 2);
    fs.writeFileSync(path.join(dir, 'godot.editor.js'), 'tampered');
    assert.throws(() => verifyDir(dir), /checksum mismatch: godot\.editor\.js/);
    fs.writeFileSync(path.join(dir, 'godot.editor.js'), 'var Engine = {};');
    fs.rmSync(path.join(dir, 'godot.editor.wasm'));
    assert.throws(() => verifyDir(dir), /missing after fetch: godot\.editor\.wasm/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CI fetches the web editor before building the Forge image, and the image build fails closed', () => {
  const fetchAt = workflow.indexOf('node deploy/cloudrun/forge/web-editor-artifact.mjs fetch --base "${WEB_EDITOR_ARTIFACT_BASE}"');
  const buildAt = workflow.indexOf('docker build -f deploy/cloudrun/forge/Dockerfile');
  assert.ok(fetchAt > 0 && buildAt > fetchAt);
  assert.match(workflow, /^\s*WEB_EDITOR_ARTIFACT_BASE: gs:\/\/[a-z0-9._-]+\/\S+$/m);
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'deploy/cloudrun/forge/Dockerfile'), 'utf8');
  const guardAt = dockerfile.indexOf('test -s ./OfficialGodot/vendor-release/godot.editor.wasm');
  assert.ok(guardAt > 0, 'Dockerfile must refuse to build without vendor-release');
  assert.ok(guardAt < dockerfile.lastIndexOf('FROM node:24-slim'), 'guard must run in the assets prep stage');
});
