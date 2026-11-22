import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGcsV4SignedUrl, runCloudRunBuild } = require('../../../forge/Tools/cloudrun-build-backend.cjs');
const { zipFiles } = require('../../../forge/Tools/export-godot-project.cjs');
const { validateDeploymentZip } = require('../../../forge/Tools/deployment-zip-validator.cjs');

test('createGcsV4SignedUrl builds canonical V4 signed URL via IAM signBlob without static keys', async () => {
  let signCalled = false;
  const mockFetch = async (url, opts) => {
    assert.match(url, /iamcredentials\.googleapis\.com\/v1\/projects\/-\/serviceAccounts\/.*:signBlob$/);
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    const decoded = Buffer.from(body.payload, 'base64').toString('utf8');
    assert.match(decoded, /^GOOG4-RSA-SHA256\n20261121T090000Z\n20261121\/auto\/storage\/goog4_request\n[a-f0-9]{64}$/);
    signCalled = true;
    return {
      ok: true,
      json: async () => ({ signedBlob: Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64') }),
    };
  };

  const url = await createGcsV4SignedUrl({
    bucket: 'playhub-dev-deploy-2611',
    objectName: 'builds/0123456789abcdef/output/PlayForge-Web.zip',
    method: 'PUT',
    contentType: 'application/zip',
    expiresSeconds: 300,
    serviceAccountEmail: '946917288000-compute@developer.gserviceaccount.com',
    accessToken: 'fake-token',
    now: new Date('2026-11-21T09:00:00.000Z'),
    fetchImpl: mockFetch,
  });

  assert.equal(signCalled, true);
  assert.ok(url.startsWith('https://storage.googleapis.com/playhub-dev-deploy-2611/builds/0123456789abcdef/output/PlayForge-Web.zip?'));
  assert.ok(url.includes('X-Goog-Algorithm=GOOG4-RSA-SHA256'));
  assert.ok(url.includes('X-Goog-SignedHeaders=content-type%3Bhost'));
  assert.ok(url.endsWith('&X-Goog-Signature=deadbeef'));
});

test('runCloudRunBuild uploads snapshot, triggers Cloud Run Job with 3 Signed URLs only, polls, validates ZIP', async () => {
  const validZip = zipFiles([
    ['index.html', Buffer.from('<!doctype html><html><body>ok</body></html>')],
    ['index.wasm', Buffer.from([0x00, 0x61, 0x73, 0x6d])],
    ['index.pck', Buffer.from('GDPC')],
  ]);
  const validated = validateDeploymentZip(validZip);
  const gcsStore = new Map();
  let triggerPayload = null;
  let pollCount = 0;

  const mockFetch = async (url, opts = {}) => {
    if (url.includes('storage.googleapis.com/upload/storage/v1/b/')) {
      const u = new URL(url);
      gcsStore.set(u.searchParams.get('name'), Buffer.from(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    if (url.includes(':signBlob')) {
      return { ok: true, json: async () => ({ signedBlob: Buffer.from('sig').toString('base64') }) };
    }
    if (url.endsWith('/jobs/forge-build-worker:run')) {
      triggerPayload = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ name: 'projects/forge-dev-2611/locations/us-west1/operations/op-1', done: false }) };
    }
    if (url.endsWith('/operations/op-1')) {
      pollCount++;
      if (pollCount === 1) return { ok: true, json: async () => ({ name: 'projects/forge-dev-2611/locations/us-west1/operations/op-1', done: false }) };
      gcsStore.set('builds/abcdef0123456789/output/PlayForge-Web.zip', validZip);
      gcsStore.set('builds/abcdef0123456789/output/result.json', Buffer.from(JSON.stringify({
        status: 'succeeded',
        artifactSha256: validated.sha256,
        sdkBridgeVersion: 'playhub-godot-shell-v1',
        log: 'export ok',
      })));
      return { ok: true, json: async () => ({ name: 'projects/forge-dev-2611/locations/us-west1/operations/op-1', done: true }) };
    }
    if (url.includes('storage.googleapis.com/storage/v1/b/')) {
      const m = url.match(/\/o\/([^?]+)\?alt=media/);
      const obj = decodeURIComponent(m[1]);
      const data = gcsStore.get(obj);
      return data
        ? { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) }
        : { ok: false, status: 404 };
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-backend-out-'));
  try {
    const job = { id: 'abcdef0123456789', target: 'web', revision: 5, log: '', files: [] };
    await runCloudRunBuild(
      job,
      { id: '0123456789abcdef01234567', revision: 5, files: [{ path: 'project.godot', content: 'config_version=5\n' }] },
      outDir,
      {
        env: { PLAYFORGE_BUILD_PROJECT: 'forge-dev-2611', PLAYFORGE_BUILD_BUCKET: 'playhub-dev-deploy-2611', PLAYFORGE_BUILD_POLL_MS: '1' },
        accessToken: 'tok',
        signerEmail: '946917288000-compute@developer.gserviceaccount.com',
        fetchImpl: mockFetch,
        sleep: async () => {},
      }
    );

    const passedEnvNames = triggerPayload.overrides.containerOverrides[0].env.map(e => e.name).sort();
    assert.deepEqual(passedEnvNames, ['BUILD_INPUT_URL', 'BUILD_OUTPUT_ZIP_URL', 'BUILD_RESULT_URL']);
    assert.equal(job.artifactSha256, validated.sha256);
    assert.equal(job.backend, 'cloudrun-job');
    assert.equal(job.downloadUrl, '/api/builds/abcdef0123456789/files/PlayForge-Web.zip');
    assert.ok(fs.existsSync(path.join(outDir, 'PlayForge-Web.zip')));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('runCloudRunBuild fails closed when workerResult.artifactSha256 is missing or mismatched', async () => {
  const validZip = zipFiles([
    ['index.html', Buffer.from('<!doctype html><html><body>ok</body></html>')],
    ['index.wasm', Buffer.from([0x00, 0x61, 0x73, 0x6d])],
    ['index.pck', Buffer.from('GDPC')],
  ]);

  async function runWithWorkerResult(workerResultObj) {
    const gcsStore = new Map();
    const mockFetch = async (url, opts = {}) => {
      if (url.includes('storage.googleapis.com/upload/storage/v1/b/')) {
        const u = new URL(url);
        gcsStore.set(u.searchParams.get('name'), Buffer.from(opts.body));
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes(':signBlob')) {
        return { ok: true, json: async () => ({ signedBlob: Buffer.from('sig').toString('base64') }) };
      }
      if (url.endsWith('/jobs/forge-build-worker:run')) {
        gcsStore.set('builds/badhash012345678/output/PlayForge-Web.zip', validZip);
        gcsStore.set('builds/badhash012345678/output/result.json', Buffer.from(JSON.stringify(workerResultObj)));
        return { ok: true, json: async () => ({ name: 'projects/forge-dev-2611/locations/us-west1/operations/op-2', done: true }) };
      }
      if (url.includes('storage.googleapis.com/storage/v1/b/')) {
        const m = url.match(/\/o\/([^?]+)\?alt=media/);
        const obj = decodeURIComponent(m[1]);
        const data = gcsStore.get(obj);
        return data
          ? { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) }
          : { ok: false, status: 404 };
      }
      throw new Error('Unexpected fetch: ' + url);
    };

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-backend-fail-'));
    try {
      const job = { id: 'badhash012345678', target: 'web', revision: 1, log: '', files: [] };
      await assert.rejects(
        () => runCloudRunBuild(
          job,
          { id: '0123456789abcdef01234567', revision: 1, files: [{ path: 'project.godot', content: 'config_version=5\n' }] },
          outDir,
          {
            env: { PLAYFORGE_BUILD_PROJECT: 'forge-dev-2611', PLAYFORGE_BUILD_BUCKET: 'playhub-dev-deploy-2611', PLAYFORGE_BUILD_POLL_MS: '1' },
            accessToken: 'tok',
            signerEmail: '946917288000-compute@developer.gserviceaccount.com',
            fetchImpl: mockFetch,
            sleep: async () => {},
          }
        ),
        /Isolated build ZIP integrity mismatch/
      );
      assert.equal(fs.existsSync(path.join(outDir, 'PlayForge-Web.zip')), false);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  // Missing artifactSha256 (Fail-Closed, must not skip check)
  await runWithWorkerResult({ status: 'succeeded', log: 'no hash' });
  // Empty string artifactSha256
  await runWithWorkerResult({ status: 'succeeded', artifactSha256: '' });
  // Mismatched artifactSha256
  await runWithWorkerResult({ status: 'succeeded', artifactSha256: '0'.repeat(64) });
});
