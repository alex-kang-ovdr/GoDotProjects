'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { deflateRawSync } = require('node:zlib');

const {
  ZIP_LIMITS,
  applyInstallPlan,
  buildPackageArtifact,
  checkReleaseUpdate,
  computeDependencyManifestHash,
  createAssetLibraryHandler,
  createStoreBridge,
  formatDigest,
  normalizeLoopbackOrigin,
  queryLibraryEntries,
  readProjectInstallations,
  readZipEntries,
  rejectEditorialInstall,
  reviewInstallPlan,
  saveLibraryEntry,
  sha256Hex,
  stageVerifiedArtifact,
  validateStoreContract,
  verifyUsageLicense,
} = require('../../Tools/asset-library.cjs');
const { appendEditorPlugin } = require('../../Tools/platform-project.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(forgeRoot, '..');
const schemaPath = path.join(repoRoot, 'store', 'schemas', 'package-contract.schema.json');
const addonDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_asset_store');
const godotConsole = process.env.GODOT_CONSOLE
  || process.env.GODOT_BIN
  || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe';

function makeSamplePackages() {
  const v1 = buildPackageArtifact({
    entry: {
      schema_version: 1,
      asset_id: 'ui-tactical-hud-kit',
      asset_version_id: '2.0.1',
      release_id: 'rel-ui-tactical-201',
      release_kind: 'package',
      title: 'Tactical Strategy HUD & Minimap',
      summary: 'HUD 테마 및 도크 보조 스크립트 패키지',
      publisher_id: 'pub-studio-nord',
      store_state: 'catalog_listed',
      artifact_id: 'art-ui-tactical-201',
      engine_compatibility: {
        godot_min: '4.3',
        godot_tested: '4.7.2',
        platforms: ['web', 'windows', 'linux'],
      },
      license_snapshot_ref: 'lic-mit-v1-20261120',
    },
    files: {
      'addons/tactical_hud/plugin.cfg': '[plugin]\nname="Tactical HUD"\nscript="hud.gd"\n',
      'addons/tactical_hud/hud.gd': '@tool\nextends Node\nconst HUD_VERSION := "2.0.1"\n',
      'assets/tactical_hud/bar.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="8"><rect width="32" height="8" fill="#4c8df6"/></svg>\n',
    },
  });

  const v2 = buildPackageArtifact({
    entry: {
      schema_version: 1,
      asset_id: 'ui-tactical-hud-kit',
      asset_version_id: '2.1.0',
      release_id: 'rel-ui-tactical-210',
      release_kind: 'package',
      title: 'Tactical Strategy HUD & Minimap',
      summary: '2.1.0 업데이트 릴리스',
      publisher_id: 'pub-studio-nord',
      store_state: 'catalog_listed',
      artifact_id: 'art-ui-tactical-210',
      engine_compatibility: {
        godot_min: '4.3',
        godot_tested: '4.7.2',
        platforms: ['web', 'windows', 'linux'],
      },
      license_snapshot_ref: 'lic-mit-v1-20261120',
    },
    files: {
      'addons/tactical_hud/plugin.cfg': '[plugin]\nname="Tactical HUD"\nscript="hud.gd"\n',
      'addons/tactical_hud/hud.gd': '@tool\nextends Node\nconst HUD_VERSION := "2.1.0"\n',
      'assets/tactical_hud/bar.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="8"><rect width="32" height="8" fill="#22c55e"/></svg>\n',
    },
  });

  const editorial = {
    schema_version: 1,
    asset_id: 'godot-47-dock-guide',
    asset_version_id: '1.0.0',
    release_id: 'rel-editorial-dock-100',
    release_kind: 'editorial',
    title: 'Godot 에디터 도크 레이아웃 가이드',
    summary: '일반 콘텐츠(editorial) 가이드',
    publisher_id: 'pub-playforge-docs',
    store_state: 'catalog_listed',
    license_snapshot_ref: 'lic-editorial-v1',
    installation_record: null,
  };

  return { v1, v2, editorial };
}

function snapshotTree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else out[rel] = fs.readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

function runGodotAsync(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeout || 30000);
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr, error });
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      resolve({
        status,
        stdout,
        stderr,
        error: timedOut ? new Error('Godot test timed out') : null,
      });
    });
  });
}

async function startHandlerServer(handler) {
  const server = http.createServer((req, res) => {
    if (!handler(req, res)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}/api/asset-library`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('1. legacy /api/asset-library GET endpoints remain intact and read-only', async (t) => {
  const handler = createAssetLibraryHandler(forgeRoot);
  const srv = await startHandlerServer(handler);
  t.after(srv.close);

  const rootRes = await fetch(srv.baseUrl);
  assert.equal(rootRes.status, 200);
  assert.deepEqual(await rootRes.json(), { name: 'PlayForge Local' });

  const searchRes = await fetch(`${srv.baseUrl}/search/query?query=tappy`);
  assert.equal(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert.equal(searchJson.count, 1);

  const relRes = await fetch(`${srv.baseUrl}/releases/playforge-local/tappy-original`);
  assert.equal(relRes.status, 200);
  const relJson = await relRes.json();
  assert.equal(relJson.length, 1);

  const zipRes = await fetch(relJson[0].download_url);
  assert.equal(zipRes.status, 200);
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  assert.equal(sha256Hex(zipBuf), relJson[0].sha256);

  const postRes = await fetch(`${srv.baseUrl}/search/query`, { method: 'POST' });
  assert.equal(postRes.status, 405);
});

test('2. 6-stage state model matches package-contract.schema.json and isolates stages 1-4 & 6 from project files', async (t) => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const { v1, v2, editorial } = makeSamplePackages();
  assert.deepEqual(validateStoreContract(v1.entry, { strictAdditionalProperties: true }), { valid: true, errors: [] });
  assert.deepEqual(validateStoreContract(editorial, { strictAdditionalProperties: true }), { valid: true, errors: [] });
  const { SAMPLE_CATALOG } = await import('../../../store/web/store-catalog.js');
  for (const sample of SAMPLE_CATALOG) {
    assert.deepEqual(validateStoreContract(sample), { valid: true, errors: [] }, `SAMPLE_CATALOG entry ${sample.asset_id}`);
  }
  assert.deepEqual(
    schema.properties.store_state.enum,
    ['catalog_listed', 'saved_to_library', 'license_verified', 'artifact_downloaded', 'plan_reviewed', 'applied_to_project', 'update_available'],
  );

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-6stage-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  const projB = path.join(tmp, 'proj-b');
  const staging = path.join(tmp, 'staging');
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });
  fs.writeFileSync(path.join(projA, 'project.godot'), 'config_version=5\n');
  fs.writeFileSync(path.join(projB, 'project.godot'), 'config_version=5\n');
  const projABefore = snapshotTree(projA);
  const projBBefore = snapshotTree(projB);

  // Stage 1: saved_to_library
  const libraries = new Map();
  const s1 = saveLibraryEntry({ libraryMap: libraries, accountId: 'hub-user-1', entry: v1.entry });
  assert.equal(s1.ok, true);
  assert.equal(s1.store_state, 'saved_to_library');
  assert.equal(s1.project_modified, false);
  const listed = queryLibraryEntries({ entries: [...libraries.get('hub-user-1').values()], projectId: 'proj-a', projectRoot: projA, catalog: [v1.entry] });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].store_state, 'saved_to_library');
  assert.deepEqual(snapshotTree(projA), projABefore);

  // Stage 2: license_verified (and check incompatible engine/platform rejection)
  const s2BadEngine = verifyUsageLicense({ accountId: 'hub-user-1', entry: v1.entry, targetEngineVersion: '3.5.0', targetPlatform: 'windows' });
  assert.equal(s2BadEngine.ok, false);
  assert.equal(s2BadEngine.code, 'ENGINE_INCOMPATIBLE');
  const s2BadPlat = verifyUsageLicense({ accountId: 'hub-user-1', entry: v1.entry, targetEngineVersion: '4.7.2', targetPlatform: 'macos' });
  assert.equal(s2BadPlat.ok, false);
  const s2 = verifyUsageLicense({ accountId: 'hub-user-1', entry: v1.entry, targetEngineVersion: '4.7.2', targetPlatform: 'windows' });
  assert.equal(s2.ok, true);
  assert.equal(s2.store_state, 'license_verified');
  assert.deepEqual(snapshotTree(projA), projABefore);

  // Stage 3: artifact_downloaded (staging outside active project)
  const s3 = stageVerifiedArtifact({ entry: v1.entry, artifactBytes: v1.archive, stagingRoot: staging });
  assert.equal(s3.ok, true);
  assert.equal(s3.store_state, 'artifact_downloaded');
  assert.equal(s3.artifact_digest, v1.entry.artifact_digest);
  assert.ok(fs.existsSync(path.join(s3.staged_dir, 'addons/tactical_hud/plugin.cfg')));
  assert.deepEqual(snapshotTree(projA), projABefore);

  // Stage 4: plan_reviewed
  const s4 = reviewInstallPlan({ entry: v1.entry, projectId: 'proj-a', projectRoot: projA });
  assert.equal(s4.ok, true);
  assert.equal(s4.store_state, 'plan_reviewed');
  assert.equal(s4.additions.length, 3);
  assert.equal(s4.conflicts.length, 0);
  assert.deepEqual(s4.executable_addons.sort(), ['addons/tactical_hud/hud.gd', 'addons/tactical_hud/plugin.cfg']);
  assert.deepEqual(snapshotTree(projA), projABefore);

  // Stage 5: applied_to_project (selected project ONLY)
  const s5 = applyInstallPlan({ entry: v1.entry, plan: s4, stagingRoot: staging, projectId: 'proj-a', projectRoot: projA });
  assert.equal(s5.ok, true);
  assert.equal(s5.store_state, 'applied_to_project');
  assert.equal(s5.written_files.length, 3);
  assert.match(s5.installation_record.target_root, /^(?:addons|assets)\//);
  assert.equal(s5.installation_record.project_id, 'proj-a');
  assert.equal(s5.installation_record.installed_release_id, v1.entry.release_id);
  assert.equal(s5.installation_record.installed_digest, v1.entry.artifact_digest);
  assert.equal(s5.installation_record.status, 'applied');
  assert.deepEqual(validateStoreContract({ ...v1.entry, installation_record: s5.installation_record }, { strictAdditionalProperties: true }), { valid: true, errors: [] });
  assert.deepEqual(readProjectInstallations(projA)[v1.entry.asset_id], s5.installation_record);
  assert.deepEqual(snapshotTree(projB), projBBefore, 'Unselected project B must remain completely untouched');

  // Stage 6: update_available (must NOT modify project files)
  const projAAfterInstall = snapshotTree(projA);
  const s6Same = checkReleaseUpdate({ installationRecord: s5.installation_record, installedEntry: v1.entry, latestEntry: v1.entry });
  assert.equal(s6Same.update_available, false);
  assert.equal(s6Same.store_state, 'applied_to_project');

  const s6New = checkReleaseUpdate({ installationRecord: s5.installation_record, installedEntry: v1.entry, latestEntry: v2.entry });
  assert.equal(s6New.update_available, true);
  assert.equal(s6New.store_state, 'update_available');
  assert.equal(s6New.latest_release_id, v2.entry.release_id);
  assert.deepEqual(snapshotTree(projA), projAAfterInstall, 'Stage 6 update check must never alter project files');
});

test('3. conflict detection, overwrite gating, missing dependency check, and stale plan protection', (t) => {
  const { v1 } = makeSamplePackages();
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-conflict-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  const staging = path.join(tmp, 'staging');
  const conflictTarget = path.join(projA, 'assets/tactical_hud/bar.svg');
  fs.mkdirSync(path.dirname(conflictTarget), { recursive: true });
  fs.writeFileSync(conflictTarget, 'USER_CUSTOM_SVG');

  const s3 = stageVerifiedArtifact({ entry: v1.entry, artifactBytes: v1.archive, stagingRoot: staging });
  assert.equal(s3.ok, true);

  const s4 = reviewInstallPlan({ entry: v1.entry, projectId: 'proj-a', projectRoot: projA });
  assert.equal(s4.ok, true);
  assert.equal(s4.conflicts.length, 1);
  assert.equal(s4.conflicts[0].path, 'assets/tactical_hud/bar.svg');
  assert.equal(s4.requires_conflict_resolution, true);

  // Apply without allowOverwriteConflicts -> rejected
  const blocked = applyInstallPlan({ entry: v1.entry, plan: s4, stagingRoot: staging, projectId: 'proj-a', projectRoot: projA, allowOverwriteConflicts: false });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'CONFLICT_DETECTED');
  assert.equal(fs.readFileSync(conflictTarget, 'utf8'), 'USER_CUSTOM_SVG');

  // Modify project after review -> stale plan rejection even when allowOverwriteConflicts is true
  fs.writeFileSync(conflictTarget, 'MODIFIED_AFTER_REVIEW');
  const stale = applyInstallPlan({ entry: v1.entry, plan: s4, stagingRoot: staging, projectId: 'proj-a', projectRoot: projA, allowOverwriteConflicts: true });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'STALE_INSTALL_PLAN');
  assert.equal(fs.readFileSync(conflictTarget, 'utf8'), 'MODIFIED_AFTER_REVIEW');

  // Re-review and apply with explicit overwrite approval
  const s4Fresh = reviewInstallPlan({ entry: v1.entry, projectId: 'proj-a', projectRoot: projA });
  const applied = applyInstallPlan({ entry: v1.entry, plan: s4Fresh, stagingRoot: staging, projectId: 'proj-a', projectRoot: projA, allowOverwriteConflicts: true });
  assert.equal(applied.ok, true);
  assert.match(fs.readFileSync(conflictTarget, 'utf8'), /#4c8df6/);

  // Dependency check: missing dependency prevents can_apply and Stage 5 apply
  const deps = [{ asset_id: 'core-ui-theme', asset_version_id: '1.0.0', release_id: 'rel-core-theme-100' }];
  const depPkg = buildPackageArtifact({
    entry: {
      ...v1.entry,
      release_id: 'rel-ui-tactical-dep',
      artifact_id: 'art-ui-tactical-dep',
      dependency_manifest_hash: computeDependencyManifestHash(deps),
    },
    files: {
      'assets/tactical_hud/bar.svg': 'dep-check',
    },
    dependencies: deps,
  });
  const depPlan = reviewInstallPlan({ entry: depPkg.entry, projectId: 'proj-a', projectRoot: projA, dependencies: deps });
  assert.equal(depPlan.ok, true);
  assert.equal(depPlan.can_apply, false);
  assert.equal(depPlan.missing_dependencies.length, 1);
  const depBlocked = applyInstallPlan({ entry: depPkg.entry, plan: depPlan, stagedFiles: depPkg.filesMap, projectId: 'proj-a', projectRoot: projA, allowOverwriteConflicts: true });
  assert.equal(depBlocked.ok, false);
  assert.equal(depBlocked.code, 'MISSING_DEPENDENCIES');
});

test('4. SHA-256 artifact_digest mismatch and tampered manifest file rejection', (t) => {
  const { v1 } = makeSamplePackages();
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-sha-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const staging = path.join(tmp, 'staging');

  const tamperedArchive = Buffer.from(v1.archive);
  tamperedArchive[tamperedArchive.length - 5] ^= 0xff;
  const mismatch = stageVerifiedArtifact({ entry: v1.entry, artifactBytes: tamperedArchive, stagingRoot: staging });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'ARTIFACT_DIGEST_MISMATCH');
  assert.equal(fs.existsSync(path.join(staging, v1.entry.release_id)), false);

  const badManifestEntry = {
    ...v1.entry,
    file_manifest: v1.entry.file_manifest.map((f, idx) => (idx === 0 ? { ...f, sha256: '0'.repeat(64) } : f)),
  };
  const fileMismatch = stageVerifiedArtifact({ entry: badManifestEntry, artifactBytes: v1.archive, stagingRoot: staging });
  assert.equal(fileMismatch.ok, false);
  assert.equal(fileMismatch.code, 'FILE_HASH_MISMATCH');
});

test('5. release_kind === editorial installation is blocked across all stages and HTTP endpoints', async (t) => {
  const { v1, editorial } = makeSamplePackages();
  const denied = rejectEditorialInstall(editorial);
  assert.equal(denied.ok, false);
  assert.equal(denied.rejected, true);
  assert.equal(denied.code, 'EDITORIAL_NOT_INSTALLABLE');

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-ed-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  fs.mkdirSync(projA, { recursive: true });
  const before = snapshotTree(projA);

  assert.equal(verifyUsageLicense({ entry: editorial }).code, 'EDITORIAL_NOT_INSTALLABLE');
  assert.equal(stageVerifiedArtifact({ entry: editorial, artifactBytes: Buffer.from('abc') }).code, 'EDITORIAL_NOT_INSTALLABLE');
  assert.equal(reviewInstallPlan({ entry: editorial, projectId: 'proj-a', projectRoot: projA }).code, 'EDITORIAL_NOT_INSTALLABLE');
  assert.equal(applyInstallPlan({ entry: editorial, plan: { store_state: 'plan_reviewed' }, projectId: 'proj-a', projectRoot: projA }).code, 'EDITORIAL_NOT_INSTALLABLE');

  const bridge = createStoreBridge({
    catalog: [v1, { entry: editorial }],
    projects: { 'proj-a': projA },
    stagingRoot: path.join(tmp, 'staging'),
    autoSaveAccount: 'default',
  });
  const srv = await startHandlerServer(createAssetLibraryHandler(forgeRoot, { storeBridge: bridge }));
  t.after(srv.close);

  for (const endpoint of ['/store/license', '/store/stage', '/store/plan', '/store/apply']) {
    const res = await fetch(`${srv.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_id: editorial.asset_id, release_id: editorial.release_id, project_id: 'proj-a' }),
    });
    assert.equal(res.status, 400, endpoint);
    const body = await res.json();
    assert.equal(body.code, 'EDITORIAL_NOT_INSTALLABLE');
  }
  assert.deepEqual(snapshotTree(projA), before);
});

test('6. /api/asset-library/store/* HTTP endpoints execute full 6-stage pipeline and isolate selected project', async (t) => {
  const { v1, v2, editorial } = makeSamplePackages();
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-http-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  const projB = path.join(tmp, 'proj-b');
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });
  fs.writeFileSync(path.join(projB, 'marker.txt'), 'keep');
  const projBBefore = snapshotTree(projB);

  const bridge = createStoreBridge({
    catalog: [v1, { entry: editorial }],
    projects: { 'proj-a': projA, 'proj-b': projB },
    stagingRoot: path.join(tmp, 'staging'),
    autoSaveAccount: 'hub-42',
  });
  const srv = await startHandlerServer(createAssetLibraryHandler(forgeRoot, { storeBridge: bridge }));
  t.after(srv.close);

  const libRes = await fetch(`${srv.baseUrl}/store/library?account_id=hub-42&project_id=proj-a`);
  assert.equal(libRes.status, 200);
  const libJson = await libRes.json();
  assert.equal(libJson.entries.length, 2);

  const licRes = await fetch(`${srv.baseUrl}/store/license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: 'hub-42', asset_id: v1.entry.asset_id, godot_version: '4.7.2', platform: 'windows' }),
  });
  assert.equal(licRes.status, 200);
  assert.equal((await licRes.json()).store_state, 'license_verified');

  const stageRes = await fetch(`${srv.baseUrl}/store/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: v1.entry.asset_id, release_id: v1.entry.release_id }),
  });
  assert.equal(stageRes.status, 200);
  assert.equal((await stageRes.json()).store_state, 'artifact_downloaded');

  const planRes = await fetch(`${srv.baseUrl}/store/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: v1.entry.asset_id, release_id: v1.entry.release_id, project_id: 'proj-a' }),
  });
  assert.equal(planRes.status, 200);
  const planJson = await planRes.json();
  assert.equal(planJson.store_state, 'plan_reviewed');

  const applyRes = await fetch(`${srv.baseUrl}/store/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: v1.entry.asset_id, release_id: v1.entry.release_id, project_id: 'proj-a', plan_token: planJson.plan_token }),
  });
  assert.equal(applyRes.status, 200);
  const applyJson = await applyRes.json();
  assert.equal(applyJson.store_state, 'applied_to_project');
  assert.ok(fs.existsSync(path.join(projA, 'addons/tactical_hud/plugin.cfg')));
  assert.deepEqual(snapshotTree(projB), projBBefore);

  bridge.registerEntry(v2.entry, v2);
  const updRes = await fetch(`${srv.baseUrl}/store/updates?account_id=hub-42&project_id=proj-a`);
  assert.equal(updRes.status, 200);
  const updJson = await updRes.json();
  assert.equal(updJson.updates.length, 1);
  assert.equal(updJson.updates[0].store_state, 'update_available');
  assert.equal(updJson.updates[0].latest_release_id, v2.entry.release_id);
});

test('7. Godot 4.7.2 --headless --script validates GDScript parsing, StoreDock HTTP & UI, SHA-256 verification, editorial block, and project isolation', {
  skip: !fs.existsSync(godotConsole) ? `Godot 4.7.2 console unavailable at ${godotConsole}` : false,
  timeout: 60000,
}, async (t) => {
  const { v1, v2, editorial } = makeSamplePackages();
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-gd-script-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const godotProj = path.join(tmp, 'godot_proj');
  const projA = path.join(tmp, 'target_proj_a');
  const projB = path.join(tmp, 'target_proj_b');
  const staging = path.join(tmp, 'staging');
  fs.mkdirSync(godotProj, { recursive: true });
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });
  fs.writeFileSync(path.join(projB, 'keep.txt'), 'untouched');
  const projBBefore = snapshotTree(projB);

  fs.writeFileSync(path.join(godotProj, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="AssetStoreHeadlessTest"\n');
  fs.cpSync(addonDir, path.join(godotProj, 'addons', 'playforge_asset_store'), { recursive: true });
  fs.mkdirSync(path.join(godotProj, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'store_headless_probe.gd'), path.join(godotProj, 'tests', 'store_headless_probe.gd'));

  const manifestPath = path.join(tmp, 'test_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ pkg_v1: v1.entry, pkg_v2: v2.entry, editorial }));

  const bridge = createStoreBridge({
    catalog: [v1, { entry: editorial }],
    projects: { 'proj-a': projA, 'proj-b': projB },
    stagingRoot: staging,
    autoSaveAccount: 'default',
  });
  const srv = await startHandlerServer(createAssetLibraryHandler(forgeRoot, { storeBridge: bridge }));
  t.after(srv.close);

  const result = await runGodotAsync(godotConsole, [
    '--headless',
    '--path', godotProj,
    '--script', 'res://tests/store_headless_probe.gd',
    '--',
    `--api-url=${srv.baseUrl}/store`,
    '--web-url=http://127.0.0.1:4173/store',
    `--proj-a=${projA}`,
    `--proj-b=${projB}`,
    `--staging=${staging}`,
    `--manifest=${manifestPath}`,
  ], {
    cwd: tmp,
    timeout: 30000,
  });

  const output = (result.stdout || '') + (result.stderr || '');
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_ASSET_STORE_HEADLESS_OK/);
  assert.deepEqual(snapshotTree(projB), projBBefore);
  assert.equal(fs.existsSync(path.join(forgeRoot, 'Godot', '.godot')), false);
});

test('8. Godot 4.7.2 --headless --editor loads PlayForge Asset Store dock in DOCK_SLOT_RIGHT_UL and switches slots cleanly', {
  skip: !fs.existsSync(godotConsole) ? `Godot 4.7.2 console unavailable at ${godotConsole}` : false,
  timeout: 60000,
}, (t) => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-gd-editor-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const projectDir = path.join(tmp, 'editor_proj');
  const settingsDir = path.join(tmp, 'settings');
  fs.mkdirSync(path.join(projectDir, 'scenes'), { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });

  let config = [
    'config_version=5',
    '',
    '[application]',
    'config/name="AssetStoreEditorTest"',
    'run/main_scene="res://scenes/main.tscn"',
    'config/features=PackedStringArray("4.7", "GL Compatibility")',
    '',
  ].join('\n');
  config = appendEditorPlugin(config, 'res://addons/playforge_asset_store/plugin.cfg');
  config = appendEditorPlugin(config, 'res://addons/store_editor_probe/plugin.cfg');
  fs.writeFileSync(path.join(projectDir, 'project.godot'), config);
  fs.writeFileSync(path.join(projectDir, 'scenes', 'main.tscn'), '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n');

  fs.cpSync(addonDir, path.join(projectDir, 'addons', 'playforge_asset_store'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'addons', 'store_editor_probe'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'addons', 'store_editor_probe', 'plugin.cfg'), '[plugin]\nname="StoreEditorProbe"\nscript="plugin.gd"\n');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'store_editor_probe.gd'), path.join(projectDir, 'addons', 'store_editor_probe', 'plugin.gd'));

  const env = {
    ...process.env,
    APPDATA: settingsDir,
    XDG_CONFIG_HOME: settingsDir,
    XDG_DATA_HOME: settingsDir,
    XDG_CACHE_HOME: settingsDir,
  };

  const importResult = spawnSync(godotConsole, ['--headless', '--editor', '--path', projectDir, '--import', '--quit'], {
    cwd: tmp,
    env,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  const importOut = (importResult.stdout || '') + (importResult.stderr || '');
  assert.ifError(importResult.error);
  assert.equal(importResult.status, 0, importOut);

  const editorResult = spawnSync(godotConsole, ['--headless', '--editor', '--path', projectDir, '--quit-after', '30', 'res://scenes/main.tscn'], {
    cwd: tmp,
    env,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  const editorOut = (editorResult.stdout || '') + (editorResult.stderr || '');
  assert.ifError(editorResult.error);
  assert.equal(editorResult.status, 0, editorOut);
  assert.doesNotMatch(editorOut, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(editorOut, /PLAYFORGE_ASSET_STORE_EDITOR_OK/);
});

function buildCustomZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const item of entries) {
    const nameBuf = Buffer.from(item.name, 'utf8');
    const rawBuf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(String(item.data), 'utf8');
    const method = item.method ?? 8;
    const payload = method === 8 ? deflateRawSync(rawBuf) : rawBuf;
    const declaredCompressed = item.declaredCompressedSize ?? payload.length;
    const declaredUncompressed = item.declaredUncompressedSize ?? rawBuf.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(declaredCompressed, 18);
    local.writeUInt32LE(declaredUncompressed, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(declaredCompressed, 20);
    central.writeUInt32LE(declaredUncompressed, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDir, eocd]);
}

test('9. Store HTTP bridge rejects client-supplied entry/artifact/plan/dependencies and requires server catalog + plan_token', async (t) => {
  const { v1 } = makeSamplePackages();
  const evil = buildPackageArtifact({
    entry: {
      schema_version: 1,
      asset_id: 'evil-injected-addon',
      asset_version_id: '1.0.0',
      release_id: 'rel-evil-injected-100',
      release_kind: 'package',
      title: 'Evil Injected Addon',
      publisher_id: 'pub-attacker',
      store_state: 'catalog_listed',
      artifact_id: 'art-evil-injected-100',
      engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['windows'] },
      license_snapshot_ref: 'lic-fake',
    },
    files: {
      'addons/evil/plugin.gd': '@tool\nextends EditorPlugin\n',
    },
  });

  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-trust-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  fs.mkdirSync(projA, { recursive: true });
  fs.writeFileSync(path.join(projA, 'project.godot'), 'config_version=5\n');
  const before = snapshotTree(projA);

  const bridge = createStoreBridge({
    catalog: [v1],
    projects: { 'proj-a': projA },
    stagingRoot: path.join(tmp, 'staging'),
    autoSaveAccount: 'default',
  });
  const srv = await startHandlerServer(createAssetLibraryHandler(forgeRoot, { storeBridge: bridge }));
  t.after(srv.close);

  const postJson = (endpoint, payload) => fetch(`${srv.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // 1) Forged entry / artifact_base64 on /stage
  const stageEvilBoth = await postJson('/store/stage', {
    entry: evil.entry,
    artifact_base64: evil.archive.toString('base64'),
  });
  assert.equal(stageEvilBoth.status, 400);
  assert.equal((await stageEvilBoth.json()).code, 'CLIENT_ARTIFACT_NOT_ALLOWED');

  const stageEvilEntry = await postJson('/store/stage', { entry: evil.entry });
  assert.equal(stageEvilEntry.status, 400);
  assert.equal((await stageEvilEntry.json()).code, 'CLIENT_ENTRY_NOT_ALLOWED');

  const stageValidIdWithArtifact = await postJson('/store/stage', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    artifact_base64: evil.archive.toString('base64'),
  });
  assert.equal(stageValidIdWithArtifact.status, 400);
  assert.equal((await stageValidIdWithArtifact.json()).code, 'CLIENT_ARTIFACT_NOT_ALLOWED');

  const stageUnknown = await postJson('/store/stage', {
    asset_id: evil.entry.asset_id,
    release_id: evil.entry.release_id,
  });
  assert.equal(stageUnknown.status, 404);
  assert.equal((await stageUnknown.json()).code, 'RELEASE_NOT_FOUND');

  // 2) Forged entry / dependencies on /plan
  const planEvilEntry = await postJson('/store/plan', { entry: evil.entry, project_id: 'proj-a' });
  assert.equal(planEvilEntry.status, 400);
  assert.equal((await planEvilEntry.json()).code, 'CLIENT_ENTRY_NOT_ALLOWED');

  const planClientDeps = await postJson('/store/plan', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    project_id: 'proj-a',
    dependencies: [],
  });
  assert.equal(planClientDeps.status, 400);
  assert.equal((await planClientDeps.json()).code, 'CLIENT_DEPENDENCIES_NOT_ALLOWED');

  // 3) Forged entry / plan / guessed plan_token on /apply
  const forgedPlan = reviewInstallPlan({ entry: v1.entry, projectId: 'proj-a', projectRoot: projA });
  const applyClientPlan = await postJson('/store/apply', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    project_id: 'proj-a',
    plan: forgedPlan,
  });
  assert.equal(applyClientPlan.status, 400);
  assert.equal((await applyClientPlan.json()).code, 'CLIENT_PLAN_NOT_ALLOWED');

  const applyGuessedToken = await postJson('/store/apply', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    project_id: 'proj-a',
    plan_token: `proj-a:${v1.entry.release_id}:${forgedPlan.project_fingerprint}`,
  });
  assert.equal(applyGuessedToken.status, 400);
  assert.equal((await applyGuessedToken.json()).code, 'PLAN_NOT_REVIEWED');

  // 4) Forged entry on /library and forged installation_record on /check-updates
  const libEvil = await postJson('/store/library', { entry: evil.entry });
  assert.equal(libEvil.status, 400);
  assert.equal((await libEvil.json()).code, 'CLIENT_ENTRY_NOT_ALLOWED');

  const checkEvilRec = await postJson('/store/check-updates', {
    asset_id: v1.entry.asset_id,
    project_id: 'proj-a',
    installation_record: { project_id: 'proj-a', status: 'applied' },
  });
  assert.equal(checkEvilRec.status, 400);
  assert.equal((await checkEvilRec.json()).code, 'CLIENT_RECORD_NOT_ALLOWED');

  assert.deepEqual(snapshotTree(projA), before, 'Untrusted client payloads must never touch project files');

  // 5) Server-catalog flow issues unpredictable single-use plan_token
  const stageOk = await postJson('/store/stage', { asset_id: v1.entry.asset_id, release_id: v1.entry.release_id });
  assert.equal(stageOk.status, 200);
  const planOk = await postJson('/store/plan', { asset_id: v1.entry.asset_id, release_id: v1.entry.release_id, project_id: 'proj-a' });
  assert.equal(planOk.status, 200);
  const planBody = await planOk.json();
  assert.match(planBody.plan_token, /^[a-f0-9]{48}$/);

  const applyOk = await postJson('/store/apply', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    project_id: 'proj-a',
    plan_token: planBody.plan_token,
  });
  assert.equal(applyOk.status, 200);

  // Replaying consumed plan_token is rejected
  const replayRes = await postJson('/store/apply', {
    asset_id: v1.entry.asset_id,
    release_id: v1.entry.release_id,
    project_id: 'proj-a',
    plan_token: planBody.plan_token,
  });
  assert.equal(replayRes.status, 400);
  assert.equal((await replayRes.json()).code, 'PLAN_NOT_REVIEWED');
});

test('10. Store HTTP bridge enforces application/json Content-Type and exact loopback Origin allowlist', async (t) => {
  assert.equal(normalizeLoopbackOrigin('http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  assert.equal(normalizeLoopbackOrigin('http://localhost:4173'), 'http://localhost:4173');
  assert.equal(normalizeLoopbackOrigin('http://[::1]:4173'), 'http://[::1]:4173');
  assert.equal(normalizeLoopbackOrigin('https://evil.example'), null);
  assert.equal(normalizeLoopbackOrigin('http://localhost.evil.example'), null);
  assert.equal(normalizeLoopbackOrigin('http://127.0.0.1.evil.example'), null);
  assert.equal(normalizeLoopbackOrigin('http://127.0.0.1:4173/'), null);
  assert.equal(normalizeLoopbackOrigin('http://user@127.0.0.1:4173'), null);
  assert.equal(normalizeLoopbackOrigin('http://127.1:4173'), null);
  assert.equal(normalizeLoopbackOrigin('null'), null);

  const { v1 } = makeSamplePackages();
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-store-csrf-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projA = path.join(tmp, 'proj-a');
  fs.mkdirSync(projA, { recursive: true });

  const bridge = createStoreBridge({
    catalog: [v1],
    projects: { 'proj-a': projA },
    stagingRoot: path.join(tmp, 'staging'),
    allowedOrigins: ['http://127.0.0.1:4173', 'https://evil.example'],
  });
  const srv = await startHandlerServer(createAssetLibraryHandler(forgeRoot, { storeBridge: bridge }));
  t.after(srv.close);
  const exactServerOrigin = new URL(srv.baseUrl).origin;
  const payload = JSON.stringify({ asset_id: v1.entry.asset_id, release_id: v1.entry.release_id, project_id: 'proj-a' });

  // Non-JSON Content-Type rejected (415)
  for (const contentType of [null, 'text/plain', 'application/x-www-form-urlencoded', 'text/plain; application/json']) {
    const headers = {};
    if (contentType !== null) headers['Content-Type'] = contentType;
    const res = await fetch(`${srv.baseUrl}/store/plan`, { method: 'POST', headers, body: payload });
    assert.equal(res.status, 415, `Content-Type ${String(contentType)}`);
    assert.equal((await res.json()).code, 'UNSUPPORTED_MEDIA_TYPE');
  }

  // application/json with charset parameter accepted
  const charsetRes = await fetch(`${srv.baseUrl}/store/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: payload,
  });
  assert.equal(charsetRes.status, 200);

  // Disallowed Origins rejected (403), including non-allowlisted loopback ports and non-loopback in allowedOrigins
  for (const badOrigin of [
    'https://evil.example',
    'http://localhost.evil.example',
    'http://127.0.0.1.evil.example',
    'null',
    'http://127.0.0.1:9999',
    `${exactServerOrigin}/path`,
  ]) {
    const res = await fetch(`${srv.baseUrl}/store/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: badOrigin },
      body: payload,
    });
    assert.equal(res.status, 403, `Origin ${badOrigin}`);
    assert.equal((await res.json()).code, 'ORIGIN_NOT_ALLOWED');
  }

  // Disallowed Origin on GET also rejected
  const badGet = await fetch(`${srv.baseUrl}/store/library`, {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(badGet.status, 403);
  assert.equal((await badGet.json()).code, 'ORIGIN_NOT_ALLOWED');

  // Exact server loopback Origin and explicitly allowlisted loopback Origin accepted
  for (const okOrigin of [exactServerOrigin, 'http://127.0.0.1:4173']) {
    const res = await fetch(`${srv.baseUrl}/store/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: okOrigin },
      body: payload,
    });
    assert.equal(res.status, 200, `Allowed Origin ${okOrigin}`);
  }
});

test('11. readZipEntries defends against ZIP bombs via maxOutputLength, maxEntries, maxEntryBytes, and maxTotalBytes', () => {
  assert.ok(ZIP_LIMITS.maxEntries > 0 && ZIP_LIMITS.maxEntryBytes > 0 && ZIP_LIMITS.maxTotalBytes > 0);

  // Valid deflated ZIP works
  const okZip = buildCustomZip([{ name: 'assets/a.txt', data: 'hello deflated zip', method: 8 }]);
  const okEntries = readZipEntries(okZip);
  assert.equal(okEntries.get('assets/a.txt').toString('utf8'), 'hello deflated zip');

  // ZIP bomb: compressed stream expands to 64 KiB, but header lies uncompressedSize = 32 bytes
  const bombZip = buildCustomZip([{
    name: 'assets/bomb.bin',
    data: Buffer.alloc(64 * 1024, 0x41),
    method: 8,
    declaredUncompressedSize: 32,
  }]);
  assert.throws(() => readZipEntries(bombZip), /ZIP entry inflate failed/);

  // stageVerifiedArtifact turns ZIP bomb into clean 422 INVALID_ARCHIVE
  const bombEntry = {
    schema_version: 1,
    asset_id: 'zip-bomb-test',
    asset_version_id: '1.0.0',
    release_id: 'rel-zip-bomb-100',
    release_kind: 'package',
    title: 'Bomb Test',
    publisher_id: 'pub-test',
    store_state: 'catalog_listed',
    artifact_id: 'art-zip-bomb-100',
    artifact_digest: formatDigest(bombZip),
    dependency_manifest_hash: computeDependencyManifestHash([]),
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['windows'] },
    file_manifest: [{ path: 'assets/bomb.bin', bytes: 32, sha256: sha256Hex(Buffer.alloc(32, 0x41)), executable_addon: false }],
    license_snapshot_ref: 'lic-test',
    installation_record: null,
  };
  const stagedBomb = stageVerifiedArtifact({ entry: bombEntry, artifactBytes: bombZip });
  assert.equal(stagedBomb.ok, false);
  assert.equal(stagedBomb.status, 422);
  assert.equal(stagedBomb.code, 'INVALID_ARCHIVE');
  assert.equal(stagedBomb.project_modified, false);

  // Single entry exceeds maxEntryBytes
  const bigEntryZip = buildCustomZip([{ name: 'assets/big.bin', data: Buffer.alloc(2048, 0x42), method: 8 }]);
  assert.throws(() => readZipEntries(bigEntryZip, { maxEntryBytes: 1024 }), /ZIP entry too large/);

  // Total uncompressed size exceeds maxTotalBytes
  const multiZip = buildCustomZip([
    { name: 'assets/f1.bin', data: Buffer.alloc(600, 1), method: 8 },
    { name: 'assets/f2.bin', data: Buffer.alloc(600, 2), method: 8 },
  ]);
  assert.throws(() => readZipEntries(multiZip, { maxTotalBytes: 1000 }), /uncompressed size exceeds limit/);

  // Too many entries exceeds maxEntries
  const manyEntriesZip = buildCustomZip([
    { name: 'assets/1.txt', data: '1', method: 0 },
    { name: 'assets/2.txt', data: '2', method: 0 },
    { name: 'assets/3.txt', data: '3', method: 0 },
    { name: 'assets/4.txt', data: '4', method: 0 },
  ]);
  assert.throws(() => readZipEntries(manyEntriesZip, { maxEntries: 3 }), /too many entries/);

  // Stored entry (method 0) with mismatched compressedSize vs uncompressedSize
  const badStoredZip = buildCustomZip([{
    name: 'assets/stored.txt',
    data: 'abcdef',
    method: 0,
    declaredUncompressedSize: 2,
  }]);
  assert.throws(() => readZipEntries(badStoredZip), /ZIP entry size mismatch/);
});
