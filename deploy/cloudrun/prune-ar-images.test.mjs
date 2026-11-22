import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  parseDockerImageResource,
  selectPrunePlan,
  buildRepositoryCleanupPatch,
  runPrune,
} from './prune-ar-images.mjs';

test('parseDockerImageResource extracts package, digest, tags, and sizeBytes', () => {
  const parsed = parseDockerImageResource({
    name: 'projects/playhub-dev-2611/locations/us-west1/repositories/playhub-containers/dockerImages/build-worker@sha256:abc123',
    uri: 'us-west1-docker.pkg.dev/playhub-dev-2611/playhub-containers/build-worker@sha256:abc123',
    tags: ['bw-1234567890ab'],
    imageSizeBytes: '104857600',
    uploadTime: '2026-11-22T17:00:00Z',
  });
  assert.equal(parsed.pkg, 'build-worker');
  assert.equal(parsed.digest, 'sha256:abc123');
  assert.deepEqual(parsed.tags, ['bw-1234567890ab']);
  assert.equal(parsed.sizeBytes, 104857600);
});

test('selectPrunePlan keeps newest N versions per package plus promoted and explicitly protected tags', () => {
  const mk = (pkg, idx, tags, mb) => ({
    name: `projects/p/locations/us-west1/repositories/r/dockerImages/${pkg}@sha256:${pkg}-${idx}`,
    tags,
    imageSizeBytes: String(mb * 1048576),
    uploadTime: new Date(Date.UTC(2026, 10, 1 + idx)).toISOString(),
  });
  const images = [
    mk('hub', 1, ['sha-001'], 120),
    mk('hub', 2, ['qa-release-1'], 120),
    mk('hub', 3, ['sha-003'], 110),
    mk('hub', 4, ['sha-004'], 100),
    mk('hub', 5, ['sha-005'], 95),
    mk('hub', 6, ['sha-006'], 90),
    mk('forge', 1, ['pinned-deploy'], 80),
    mk('forge', 2, ['sha-f2'], 80),
    mk('forge', 3, ['sha-f3'], 80),
    mk('forge', 4, ['sha-f4'], 80),
    mk('forge', 5, ['sha-f5'], 80),
  ];

  const plan = selectPrunePlan(images, { keepCount: 3, protectTags: ['pinned-deploy'] });
  const keepDigests = new Set(plan.keep.map(x => x.digest));
  const delDigests = new Set(plan.remove.map(x => x.digest));

  // hub: keeps newest 3 (6,5,4) + qa-release-1 (2); removes 1 and 3
  assert.ok(keepDigests.has('sha256:hub-6'));
  assert.ok(keepDigests.has('sha256:hub-5'));
  assert.ok(keepDigests.has('sha256:hub-4'));
  assert.ok(keepDigests.has('sha256:hub-2'));
  assert.ok(delDigests.has('sha256:hub-1'));
  assert.ok(delDigests.has('sha256:hub-3'));

  // forge: keeps newest 3 (5,4,3) + pinned-deploy (1); removes 2
  assert.ok(keepDigests.has('sha256:forge-5'));
  assert.ok(keepDigests.has('sha256:forge-4'));
  assert.ok(keepDigests.has('sha256:forge-3'));
  assert.ok(keepDigests.has('sha256:forge-1'));
  assert.ok(delDigests.has('sha256:forge-2'));
  assert.equal(plan.deleteCount, 3);
});

test('runPrune patches cleanup policies and deletes older versions via Artifact Registry REST v1', async t => {
  const calls = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: bodyText ? JSON.parse(bodyText) : null });
      if (req.method === 'PATCH') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url.includes('/dockerImages')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          dockerImages: [
            { name: 'projects/p/locations/us-west1/repositories/r/dockerImages/hub@sha256:old1', tags: ['sha-old1'], imageSizeBytes: '50000000', uploadTime: '2026-11-01T00:00:00Z' },
            { name: 'projects/p/locations/us-west1/repositories/r/dockerImages/hub@sha256:new1', tags: ['sha-new1'], imageSizeBytes: '40000000', uploadTime: '2026-11-02T00:00:00Z' },
            { name: 'projects/p/locations/us-west1/repositories/r/dockerImages/hub@sha256:new2', tags: ['sha-new2'], imageSizeBytes: '40000000', uploadTime: '2026-11-03T00:00:00Z' },
          ],
        }));
        return;
      }
      if (req.method === 'DELETE' && req.url.includes('/packages/hub/versions/sha256%3Aold1?force=true')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'operations/del-1', done: true }));
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  t.after(() => new Promise(resolve => { srv.close(resolve); srv.closeAllConnections?.(); }));

  const patch = buildRepositoryCleanupPatch({ keepCount: 2 });
  assert.equal(patch.cleanupPolicyDryRun, false);
  assert.equal(patch.cleanupPolicies['keep-recent-versions'].mostRecentVersions.keepCount, 2);

  const logs = [];
  const res = await runPrune({
    project: 'p',
    location: 'us-west1',
    repository: 'r',
    keepCount: 2,
    applyPolicy: true,
    token: 'test-token',
    apiBase: `http://127.0.0.1:${port}`,
    log: (m) => logs.push(m),
  });

  assert.equal(res.policyApplied, true);
  assert.equal(res.deleted, 1);
  assert.equal(res.failed, 0);
  assert.equal(res.freedBytes, 50000000);
  assert.equal(res.remainingBytes, 80000000);
  assert.ok(calls.some(c => c.method === 'PATCH' && c.url.includes('updateMask=cleanupPolicies,cleanupPolicyDryRun')));
  assert.ok(calls.some(c => c.method === 'DELETE' && c.url.includes('sha256%3Aold1?force=true')));
});
