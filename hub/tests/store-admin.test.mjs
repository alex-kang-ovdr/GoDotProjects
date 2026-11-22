import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { auditDomain } from '../server/admin-console.mjs';
import { createStoreAdmin, validateStoreReleaseContract } from '../server/store-admin.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

const adminContractsCtx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(new URL('../web/admin/contracts.js', import.meta.url), 'utf8'), adminContractsCtx);
const Contracts = adminContractsCtx.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

async function callHandler(handler, route, { method = 'GET', origin = 'http://127.0.0.1:8081', cookie = '', csrf = '', body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = route;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {
    host: '127.0.0.1:8091',
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {})
  };
  const headers = {};
  let rawBody = '';
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    removeHeader(name) { delete headers[name.toLowerCase()]; },
    writeHead(code, map = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(map)) headers[k.toLowerCase()] = v;
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.headersSent = true;
    }
  };
  const done = handler(req, res);
  if (body !== undefined) req.end(JSON.stringify(body));
  else req.end();
  await done;
  const setCookies = headers['set-cookie'] ? (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']]) : [];
  const nextCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return { status: res.statusCode, headers, cookie: nextCookie || cookie, data: rawBody ? JSON.parse(rawBody) : null };
}

test('store tab routing contracts and auditDomain mapping work properly', () => {
  assert.deepEqual(plain(Contracts.ADMIN_TABS.map(t => t.id)), ['system', 'hub', 'forge', 'qa', 'l10n', 'store']);
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=store', '')), { tab: 'store', view: 'overview', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=store&view=submissions', '')), { tab: 'store', view: 'submissions', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=store&view=packages', '')), { tab: 'store', view: 'packages', fromLegacyHash: false });

  assert.equal(auditDomain('store_submission_approved'), 'store');
  assert.equal(auditDomain('store_submission_rejected'), 'store');
  assert.equal(auditDomain('store_package_yanked'), 'store');
  assert.equal(auditDomain('store_package_status_changed'), 'store');
  assert.equal(auditDomain('l10n_key_created'), 'l10n');
  assert.equal(auditDomain('qa_run_recorded'), 'qa');
  assert.equal(auditDomain('system_backup_created'), 'system');
  assert.equal(auditDomain('game_enabled'), 'hub');
});

test('validateStoreReleaseContract enforces sha256 64-hex digest and editorial artifact prohibition', () => {
  const validPackage = {
    schema_version: 1,
    asset_id: 'sample-fortress-pack',
    asset_version_id: '1.0.0',
    release_id: 'rel-sample-fortress-100',
    release_kind: 'package',
    title: 'Sample Fortress Pack',
    publisher_id: 'pub-sample',
    artifact_id: 'art-sample-100',
    artifact_digest: 'sha256:' + 'a'.repeat(64),
    dependency_manifest_hash: 'sha256:' + 'b'.repeat(64),
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows'] },
    file_manifest: [{ path: 'assets/wall.glb', bytes: 1024, sha256: 'c'.repeat(64), executable_addon: false }],
    license_snapshot_ref: 'lic-cc0-v1'
  };
  assert.deepEqual(validateStoreReleaseContract(validPackage), []);

  assert.ok(validateStoreReleaseContract({ ...validPackage, artifact_digest: 'sha256:bad' }).length > 0);
  assert.ok(validateStoreReleaseContract({ ...validPackage, artifact_digest: 'A'.repeat(64) }).length > 0);
  assert.ok(validateStoreReleaseContract({ ...validPackage, artifact_digest: 'sha256:' + 'A'.repeat(64) }).length > 0);

  const validEditorial = {
    schema_version: 1,
    asset_id: 'dock-usage-guide',
    asset_version_id: '1.0.0',
    release_id: 'rel-dock-guide-100',
    release_kind: 'editorial',
    title: 'Dock Guide',
    publisher_id: 'pub-docs',
    license_snapshot_ref: 'lic-editorial-v1'
  };
  assert.deepEqual(validateStoreReleaseContract(validEditorial), []);
  assert.ok(validateStoreReleaseContract({ ...validEditorial, artifact_id: 'art-forbidden' }).length > 0);
  assert.ok(validateStoreReleaseContract({ ...validEditorial, artifact_digest: 'sha256:' + 'a'.repeat(64) }).length > 0);
  assert.ok(validateStoreReleaseContract({ ...validEditorial, file_manifest: [] }).length > 0);
});

test('store admin endpoints enforce auth, contract rules, kill-switch, Hub isolation, audit logging, and backup compatibility', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-admin-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeAdminCreds('AdminPassphrase!2026');

  const app = createApp({
    dataDir,
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Security boundaries: blocked on public handler, 401 on unauthenticated admin handler
  assert.equal((await callHandler(app.publicHandler, '/api/admin/store/overview', { origin: 'http://localhost:8080' })).status, 404);
  assert.equal((await callHandler(app.adminHandler, '/api/admin/store/overview')).status, 401);

  // Login as admin
  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  assert.equal(login.status, 200);
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // CSRF boundary check on store mutation
  assert.equal((await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', cookie: auth.cookie, csrf: 'wrong-csrf', body: { status: 'hidden' }
  })).status, 403);

  // Snapshot Hub catalog before Store mutations to verify strict isolation
  const hubGamesBefore = (await callHandler(app.adminHandler, '/api/admin/games', auth)).data.games;
  assert.ok(hubGamesBefore.length > 0);
  const hubIds = new Set(hubGamesBefore.map(g => g.id));

  // 1. Overview & seeded Store catalog (isolated from Hub games)
  const overview = await callHandler(app.adminHandler, '/api/admin/store/overview', auth);
  assert.equal(overview.status, 200);
  assert.equal(overview.data.contractPolicy.hubCatalogIsolated, true);
  assert.equal(overview.data.summary.totalPackages, 5);
  assert.equal(overview.data.summary.publishedPackages, 4);
  assert.equal(overview.data.summary.pendingSubmissions, 3);
  for (const pkg of overview.data.packages) {
    assert.equal(hubIds.has(pkg.slug), false, `Store package ${pkg.slug} must be separate from Hub catalog`);
  }

  // 2. Submissions listing & filters
  const pendingSubs = await callHandler(app.adminHandler, '/api/admin/store/submissions?status=in_review', auth);
  assert.equal(pendingSubs.status, 200);
  assert.equal(pendingSubs.data.submissions.length, 3);
  const editorialSubs = await callHandler(app.adminHandler, '/api/admin/store/submissions?kind=editorial', auth);
  assert.equal(editorialSubs.status, 200);
  assert.equal(editorialSubs.data.submissions.length, 1);
  assert.equal(editorialSubs.data.submissions[0].id, 'sub-store-checklist-100');

  // 3. Immutable artifact_digest verification on package approval
  const badDigestApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-navmesh-grid-110/decision', {
    method: 'POST', ...auth,
    body: { decision: 'approve', artifact_digest: 'sha256:not-64-hex' }
  });
  assert.equal(badDigestApprove.status, 422);
  assert.equal(badDigestApprove.data.error.code, 'STORE_INVALID_ARTIFACT_DIGEST');

  const mismatchedDigestApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-navmesh-grid-110/decision', {
    method: 'POST', ...auth,
    body: { decision: 'approve', artifact_digest: 'sha256:' + 'f'.repeat(64) }
  });
  assert.equal(mismatchedDigestApprove.status, 409);
  assert.equal(mismatchedDigestApprove.data.error.code, 'STORE_ARTIFACT_DIGEST_IMMUTABLE');

  const validPackageApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-navmesh-grid-110/decision', {
    method: 'POST', ...auth,
    body: { decision: 'approve', artifact_digest: 'sha256:' + 'c'.repeat(64), note: '해시 및 매니페스트 확인 완료' }
  });
  assert.equal(validPackageApprove.status, 200);
  assert.equal(validPackageApprove.data.submission.status, 'approved');
  assert.equal(validPackageApprove.data.catalogAutoPublished, false);
  assert.equal(validPackageApprove.data.stagedPackage.status, 'hidden');

  // Re-deciding an already approved submission must fail with 409
  const duplicateDecision = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-navmesh-grid-110/decision', {
    method: 'POST', ...auth,
    body: { decision: 'reject', note: 'late reject' }
  });
  assert.equal(duplicateDecision.status, 409);

  // 4. Editorial rule: editorial cannot carry package artifacts; clean editorial approval succeeds
  const editorialWithArtifact = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-store-checklist-100/decision', {
    method: 'POST', ...auth,
    body: { decision: 'approve', artifact_digest: 'sha256:' + 'a'.repeat(64) }
  });
  assert.equal(editorialWithArtifact.status, 422);
  assert.equal(editorialWithArtifact.data.error.code, 'STORE_EDITORIAL_ARTIFACT_FORBIDDEN');

  const editorialApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-store-checklist-100/decision', {
    method: 'POST', ...auth,
    body: { decision: 'approve', note: '일반 콘텐츠 확인 완료' }
  });
  assert.equal(editorialApprove.status, 200);
  assert.equal(editorialApprove.data.submission.status, 'approved');

  // 5. Request changes & direct SQLite broken contract tests (broken editorial / broken digest blocked on approve, allowed on reject)
  const requestChangesRes = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-fortress-130/decision', {
    method: 'POST', ...auth,
    body: { decision: 'request_changes', note: '성문 씬 콜라이더 누락 보완 요청' }
  });
  assert.equal(requestChangesRes.status, 200);
  assert.equal(requestChangesRes.data.submission.status, 'changes_requested');

  const storeDb = new DatabaseSync(path.join(dataDir, 'store-admin.sqlite'));
  const stamp = Date.now();
  storeDb.prepare(`INSERT INTO store_admin_submissions (
    id, slug, asset_id, title, summary, category, publisher_id, publisher_name,
    release_kind, asset_version_id, release_id, artifact_id, artifact_digest, dependency_manifest_hash,
    engine_compatibility_json, file_manifest_json, license_snapshot_ref,
    validator_status, status, revision, review_note, decided_by, submitted_at, decided_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'sub-broken-editorial', 'broken-editorial-guide', 'broken-editorial-guide', 'Broken Editorial', 'Has illegal artifact',
    '가이드', 'pub-docs', 'Docs', 'editorial', '1.0.0', 'rel-broken-editorial-100',
    'art-forbidden-100', 'sha256:' + 'a'.repeat(64), null, null, null, 'lic-editorial-v1',
    'failed', 'in_review', 1, null, null, stamp, null, stamp
  );
  storeDb.prepare(`INSERT INTO store_admin_submissions (
    id, slug, asset_id, title, summary, category, publisher_id, publisher_name,
    release_kind, asset_version_id, release_id, artifact_id, artifact_digest, dependency_manifest_hash,
    engine_compatibility_json, file_manifest_json, license_snapshot_ref,
    validator_status, status, revision, review_note, decided_by, submitted_at, decided_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'sub-broken-digest', 'broken-digest-pack', 'broken-digest-pack', 'Broken Digest Pack', 'Short sha256',
    'Addon', 'pub-test', 'Test', 'package', '1.0.0', 'rel-broken-digest-100',
    'art-broken-digest-100', 'sha256:1234', 'sha256:' + '2'.repeat(64),
    JSON.stringify({ godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web'] }),
    JSON.stringify([{ path: 'addons/bad/plugin.cfg', bytes: 100, sha256: '3'.repeat(64), executable_addon: true }]),
    'lic-mit-v1', 'failed', 'in_review', 1, null, null, stamp, null, stamp
  );
  storeDb.close();

  const brokenEdApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-broken-editorial/decision', {
    method: 'POST', ...auth, body: { decision: 'approve' }
  });
  assert.equal(brokenEdApprove.status, 422);
  assert.equal(brokenEdApprove.data.error.code, 'STORE_EDITORIAL_ARTIFACT_FORBIDDEN');

  const brokenPkgApprove = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-broken-digest/decision', {
    method: 'POST', ...auth, body: { decision: 'approve' }
  });
  assert.equal(brokenPkgApprove.status, 422);
  assert.equal(brokenPkgApprove.data.error.code, 'STORE_CONTRACT_INVALID');

  const brokenReject = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-broken-editorial/decision', {
    method: 'POST', ...auth, body: { decision: 'reject', note: 'editorial 아티팩트 첨부 금지 위반' }
  });
  assert.equal(brokenReject.status, 200);
  assert.equal(brokenReject.data.submission.status, 'rejected');

  // 6. Package status transitions & kill-switch (published / hidden / deprecated / yanked) with expectedRevision & yanked restore confirmation
  let fortressRev = 1;
  for (const nextStatus of ['hidden', 'deprecated', 'yanked']) {
    const res = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
      method: 'POST', ...auth,
      body: { status: nextStatus, reason: `transition to ${nextStatus}`, expectedRevision: fortressRev }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.package.status, nextStatus);
    assert.equal(res.data.package.revision, fortressRev + 1);
    fortressRev = res.data.package.revision;
  }

  // yanked -> published without explicit confirmation must be rejected
  const blockedRestore = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'published', reason: '복구 시도', expectedRevision: fortressRev }
  });
  assert.equal(blockedRestore.status, 409);
  assert.equal(blockedRestore.data.error.code, 'STORE_YANKED_RESTORE_CONFIRMATION_REQUIRED');

  // yanked -> deprecated directly must be rejected
  const blockedDeprecated = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'deprecated', reason: '직접 deprecated 시도', expectedRevision: fortressRev }
  });
  assert.equal(blockedDeprecated.status, 409);
  assert.equal(blockedDeprecated.data.error.code, 'STORE_INVALID_STATUS_TRANSITION');

  // yanked -> published with confirmation but empty reason must be rejected
  const noReasonRestore = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'published', reason: '   ', expectedRevision: fortressRev, confirmRestoreFromYanked: true }
  });
  assert.equal(noReasonRestore.status, 422);
  assert.equal(noReasonRestore.data.error.code, 'STORE_YANKED_RESTORE_REASON_REQUIRED');

  // yanked -> published with explicit confirmation + reason + valid expectedRevision succeeds
  const confirmedRestore = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'published', reason: '보안 패치 재검증 완료', expectedRevision: fortressRev, confirmRestoreFromYanked: true }
  });
  assert.equal(confirmedRestore.status, 200);
  assert.equal(confirmedRestore.data.package.status, 'published');
  assert.equal(confirmedRestore.data.package.revision, fortressRev + 1);

  // Stale expectedRevision must fail with 409 conflict
  const staleRev = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'hidden', reason: 'stale write', expectedRevision: fortressRev }
  });
  assert.equal(staleRev.status, 409);
  assert.equal(staleRev.data.error.code, 'STORE_PACKAGE_REVISION_CONFLICT');

  // Missing expectedRevision must fail with 400
  const missingRev = await callHandler(app.adminHandler, '/api/admin/store/packages/ui-tactical-hud-kit/status', {
    method: 'POST', ...auth,
    body: { status: 'yanked', reason: 'revision 누락' }
  });
  assert.equal(missingRev.status, 400);
  assert.equal(missingRev.data.error.code, 'INVALID_PACKAGE_REVISION');

  const yankRes = await callHandler(app.adminHandler, '/api/admin/store/packages/ui-tactical-hud-kit/status', {
    method: 'POST', ...auth,
    body: { status: 'yanked', reason: '긴급 보안 킬스위치 테스트', expectedRevision: 1 }
  });
  assert.equal(yankRes.status, 200);
  assert.equal(yankRes.data.package.status, 'yanked');
  assert.equal(yankRes.data.package.revision, 2);

  assert.equal((await callHandler(app.adminHandler, '/api/admin/store/packages/ui-tactical-hud-kit/status', {
    method: 'POST', ...auth, body: { status: 'deleted', expectedRevision: 2 }
  })).status, 422);
  assert.equal((await callHandler(app.adminHandler, '/api/admin/store/packages/unknown-slug/status', {
    method: 'POST', ...auth, body: { status: 'hidden', expectedRevision: 1 }
  })).status, 404);

  // 7. Audit domain mapping (`domain=store`) & summary badges
  const storeAudit = await callHandler(app.adminHandler, '/api/admin/audit?domain=store', auth);
  assert.equal(storeAudit.status, 200);
  assert.ok(storeAudit.data.audit.some(a => a.action === 'store_submission_approved' && a.domain === 'store'));
  assert.ok(storeAudit.data.audit.some(a => a.action === 'store_submission_rejected' && a.domain === 'store'));
  assert.ok(storeAudit.data.audit.some(a => a.action === 'store_submission_changes_requested' && a.domain === 'store'));
  assert.ok(storeAudit.data.audit.some(a => a.action === 'store_package_status_changed' && a.domain === 'store'));
  assert.ok(storeAudit.data.audit.some(a => a.action === 'store_package_yanked' && a.domain === 'store'));

  const badges = await callHandler(app.adminHandler, '/api/admin/summary/badges', auth);
  assert.equal(badges.status, 200);
  assert.equal(badges.data.store.yankedPackages, 1);
  assert.equal(badges.data.store.pendingSubmissions, 1); // only sub-broken-digest remains in_review

  // Verify Hub games catalog was completely untouched
  const hubGamesAfter = (await callHandler(app.adminHandler, '/api/admin/games', auth)).data.games;
  assert.deepEqual(hubGamesAfter, hubGamesBefore);

  // 8. Platform online backup + inspectDatabase compatibility remains intact
  const backupRes = await callHandler(app.adminHandler, '/api/admin/system/backups', { method: 'POST', ...auth, body: {} });
  assert.equal(backupRes.status, 201);
  const inspected = inspectDatabase(path.join(dir, 'backups', backupRes.data.backup.filename));
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});

test('approving an update submission for an existing slug records pending_release without auto-overwriting live release', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-pending-rel-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeAdminCreds('AdminPassphrase!2026');
  const app = createApp({
    dataDir,
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // Seed already has published lowpoly-fortress-pack v1.2.0 and in_review submission sub-fortress-130 v1.3.0
  const approveUpdate = await callHandler(app.adminHandler, '/api/admin/store/submissions/sub-fortress-130/decision', {
    method: 'POST', ...auth,
    body: {
      decision: 'approve',
      revision: 1,
      artifact_digest: 'sha256:' + 'e'.repeat(64),
      note: 'v1.3.0 업데이트 검증 완료'
    }
  });
  assert.equal(approveUpdate.status, 200);
  assert.equal(approveUpdate.data.catalogAutoPublished, false);
  assert.ok(approveUpdate.data.pendingRelease, 'existing slug update approval must record pendingRelease');
  assert.equal(approveUpdate.data.pendingRelease.submission_id, 'sub-fortress-130');
  assert.equal(approveUpdate.data.pendingRelease.asset_version_id, '1.3.0');
  assert.equal(approveUpdate.data.pendingRelease.release_id, 'rel-lowpoly-fortress-130');
  assert.equal(approveUpdate.data.pendingRelease.artifact_digest, 'sha256:' + 'e'.repeat(64));
  assert.equal(approveUpdate.data.pendingRelease.file_manifest.length, 2);
  assert.equal(approveUpdate.data.pendingRelease.file_manifest[1].path, 'assets/fortress/gatehouse.tscn');

  // Active live release remains 1.2.0 published while pending_release holds 1.3.0 and revision bumped to 2
  const pkg = approveUpdate.data.stagedPackage;
  assert.equal(pkg.slug, 'lowpoly-fortress-pack');
  assert.equal(pkg.status, 'published');
  assert.equal(pkg.asset_version_id, '1.2.0');
  assert.equal(pkg.revision, 2);
  assert.deepEqual(pkg.pending_release, approveUpdate.data.pendingRelease);

  // Persisted and visible through GET /api/admin/store/packages and overview summary
  const pkgsRes = await callHandler(app.adminHandler, '/api/admin/store/packages', auth);
  const fortress = pkgsRes.data.packages.find(p => p.slug === 'lowpoly-fortress-pack');
  assert.equal(fortress.pending_release.asset_version_id, '1.3.0');
  assert.equal(fortress.pending_release.artifact_digest, 'sha256:' + 'e'.repeat(64));
  assert.equal(fortress.pending_release.file_manifest.length, 2);

  const overviewRes = await callHandler(app.adminHandler, '/api/admin/store/overview', auth);
  assert.equal(overviewRes.data.summary.pendingReleasePackages, 1);

  // yanked -> hidden transition is allowed as safe quarantine transition
  const toYanked = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'yanked', reason: '긴급 차단', expectedRevision: 2 }
  });
  assert.equal(toYanked.status, 200);
  const toHidden = await callHandler(app.adminHandler, '/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST', ...auth,
    body: { status: 'hidden', reason: '비공개 재검토 전환', expectedRevision: 3 }
  });
  assert.equal(toHidden.status, 200);
  assert.equal(toHidden.data.package.status, 'hidden');
  assert.equal(toHidden.data.package.revision, 4);
});

test('createStoreAdmin rejects missing dataDir in operational mode, warns in dev mode, and migrates legacy sqlite schema', t => {
  // Operational/production mode must refuse silent :memory: fallback
  assert.throws(
    () => createStoreAdmin({ config: {}, env: { NODE_ENV: 'production' } }),
    err => err.code === 'STORE_ADMIN_DATA_DIR_REQUIRED'
  );
  assert.throws(
    () => createStoreAdmin({ config: {}, env: { PLAYHUB_CHANNEL: 'live' } }),
    err => err.code === 'STORE_ADMIN_DATA_DIR_REQUIRED'
  );
  assert.throws(
    () => createStoreAdmin({ config: {}, env: { K_SERVICE: 'playhub-hub' } }),
    err => err.code === 'STORE_ADMIN_DATA_DIR_REQUIRED'
  );
  assert.throws(
    () => createStoreAdmin({ config: { secureCookies: true }, env: {} }),
    err => err.code === 'STORE_ADMIN_DATA_DIR_REQUIRED'
  );

  // Local/dev mode emits warning when falling back to :memory:
  const warnings = [];
  const memAdmin = createStoreAdmin({
    config: {},
    env: { NODE_ENV: 'development' },
    warn: msg => warnings.push(msg)
  });
  assert.equal(memAdmin.storageMode, 'memory');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /:memory:/);

  // Legacy store-admin.sqlite without revision / pending_release_json columns is migrated cleanly
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-migrate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'store-admin.sqlite');
  const legacyDb = new DatabaseSync(dbPath);
  legacyDb.exec(`
    CREATE TABLE store_admin_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO store_admin_meta(key, value) VALUES('seeded_v1', '1');
    CREATE TABLE store_admin_packages (
      slug TEXT PRIMARY KEY, asset_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', publisher_id TEXT NOT NULL,
      release_kind TEXT NOT NULL, asset_version_id TEXT NOT NULL, release_id TEXT NOT NULL,
      artifact_id TEXT, artifact_digest TEXT, dependency_manifest_hash TEXT,
      engine_compatibility_json TEXT, file_manifest_json TEXT, license_snapshot_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, status_reason TEXT, install_count INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    INSERT INTO store_admin_packages VALUES (
      'legacy-pack', 'legacy-pack', 'Legacy Pack', '', '', 'pub-legacy', 'package',
      '1.0.0', 'rel-legacy-100', 'art-legacy-100', 'sha256:${'a'.repeat(64)}', 'sha256:${'b'.repeat(64)}',
      NULL, NULL, 'lic-mit-v1', 'published', NULL, 0, 0, 'seed', 1700000000000, 1700000000000
    );
  `);
  legacyDb.close();

  const migratedWarnings = [];
  const fileAdmin = createStoreAdmin({
    config: { dataDir: dir },
    env: { NODE_ENV: 'production' },
    warn: msg => migratedWarnings.push(msg)
  });
  assert.equal(fileAdmin.storageMode, 'file');
  assert.equal(migratedWarnings.length, 0);
  const pkg = fileAdmin.overview().packages.find(p => p.slug === 'legacy-pack');
  assert.equal(pkg.revision, 1);
  assert.equal(pkg.pending_release, null);
});
