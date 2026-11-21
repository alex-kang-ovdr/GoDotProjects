'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  PLATFORMS,
  createAssetLibraryHandler,
  createStoreBridge,
  isEngineCompatible,
  validateStoreContract,
  verifyUsageLicense,
} = require('../../Tools/asset-library.cjs');
const { createServer: createForgeServer } = require('../../server.cjs');
const { appendEditorPlugin } = require('../../Tools/platform-project.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(forgeRoot, '..');
const schemaPath = path.join(repoRoot, 'store', 'schemas', 'package-contract.schema.json');
const addonDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_asset_store');
const godotConsole = process.env.GODOT_CONSOLE
  || process.env.GODOT_BIN
  || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe';

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
    }, options.timeout || 35000);
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

async function startLiveStoreApp(t, opts = {}) {
  const { createStoreApp } = await import('../../../store/server/store-api.mjs');
  const dataDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-xplat-store-'));
  const app = createStoreApp({
    dataDir,
    serveStatic: true,
    ...opts,
  });
  const addr = await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return {
    app,
    dataDir,
    url: `http://127.0.0.1:${addr.port}`,
  };
}

async function startLiveForgeServer(t, opts = {}) {
  const workDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-xplat-forge-'));
  const server = createForgeServer({
    hubAuth: false,
    workspace: path.join(workDir, 'workspace'),
    platformWorkspace: path.join(workDir, 'platform'),
    buildDirectory: path.join(workDir, 'builds'),
    ...opts,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    server.shutdown?.();
    fs.rmSync(workDir, { recursive: true, force: true });
  });
  const port = server.address().port;
  return {
    server,
    workDir,
    url: `http://127.0.0.1:${port}`,
  };
}

function walkSourceFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'build' || entry.name === '.gradle' || entry.name === 'DerivedData') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((ext) => entry.name.endsWith(ext))) results.push(full);
    }
  };
  walk(dir);
  return results;
}

test('S1: PC Store Web -> Forge Bridge -> Desktop Godot 4.7.2 StoreDock end-to-end sync & real .playforgepkg install', {
  skip: !fs.existsSync(godotConsole) && `Godot console binary not found at ${godotConsole}`,
  timeout: 45000,
}, async (t) => {
  const storeSrv = await startLiveStoreApp(t);
  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: storeSrv.url,
    storeWebUrl: storeSrv.url,
  });

  // 1. User saves two real packages in Store Web (PC Web)
  for (const slug of ['lowpoly-fortress-pack', 'ui-tactical-hud-kit']) {
    const saveRes = await fetch(`${storeSrv.url}/api/store/my-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, action: 'save' }),
    });
    assert.equal(saveRes.status, 200);
    const saved = await saveRes.json();
    assert.equal(saved.saved, true);
  }

  // 2. Forge bridge reflects ONLY the saved packages (not unsaved sfx-siege-audio-pack)
  const libRes = await fetch(`${forgeSrv.url}/api/asset-library/store/library?account_id=default&project_id=proj-a`);
  assert.equal(libRes.status, 200);
  const libJson = await libRes.json();
  assert.equal(libJson.ok, true);
  assert.equal(libJson.upstream_synced, true);
  assert.equal(libJson.store_web_url, storeSrv.url);
  assert.deepEqual(
    libJson.entries.map((e) => e.asset_id).sort(),
    ['lowpoly-fortress-pack', 'ui-tactical-hud-kit'],
  );

  // 3. Real Godot 4.7.2 StoreDock refreshes via HTTP, downloads real .playforgepkg from Store Web through Forge bridge,
  // verifies SHA-256 + file_manifest, reviews plan, and applies ONLY to proj-a
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-s1-godot-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const hostProj = path.join(tmp, 'host');
  const projA = path.join(tmp, 'proj-a');
  const projB = path.join(tmp, 'proj-b');
  const staging = path.join(tmp, 'staging');
  fs.mkdirSync(hostProj, { recursive: true });
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });
  fs.writeFileSync(path.join(hostProj, 'project.godot'), 'config_version=5\n[application]\nconfig/name="S1Host"\n');
  fs.writeFileSync(path.join(projA, 'project.godot'), 'config_version=5\n[application]\nconfig/name="ProjectA"\n');
  fs.writeFileSync(path.join(projB, 'project.godot'), 'config_version=5\n[application]\nconfig/name="ProjectB"\n');
  fs.cpSync(addonDir, path.join(hostProj, 'addons', 'playforge_asset_store'), { recursive: true });
  const projBBefore = snapshotTree(projB);

  const scriptPath = path.join(hostProj, 's1_e2e_probe.gd');
  fs.writeFileSync(scriptPath, `extends SceneTree

const StoreDock := preload("res://addons/playforge_asset_store/store_dock.gd")
const PackageInstaller := preload("res://addons/playforge_asset_store/package_installer.gd")

var _lib_done := false
var _lib_entries: Array = []
var _plan_done := false
var _plan_result: Dictionary = {}
var _last_error: Dictionary = {}

func _init() -> void:
	call_deferred("_run")

func _fail(msg: String) -> void:
	printerr("S1_FAIL: " + msg)
	quit(1)

func _wait_flag(check: Callable, timeout_ms: int = 12000) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if check.call():
			return true
		await create_timer(0.03).timeout
	return false

func _run() -> void:
	var dock := StoreDock.new()
	dock.set_endpoints(OS.get_environment("TEST_STORE_WEB"), OS.get_environment("TEST_STORE_API"))
	dock.set_staging_root(OS.get_environment("TEST_STAGING"))
	dock.set_target_projects([
		{"id": "proj-a", "name": "Project A", "root": OS.get_environment("TEST_PROJ_A")},
		{"id": "proj-b", "name": "Project B", "root": OS.get_environment("TEST_PROJ_B")},
	])
	dock.library_refreshed.connect(func(entries: Array) -> void:
		_lib_entries = entries
		_lib_done = true
	)
	dock.plan_reviewed.connect(func(plan: Dictionary) -> void:
		_plan_result = plan
		_plan_done = true
	)
	dock.operation_failed.connect(func(err: Dictionary) -> void:
		_last_error = err
	)
	root.add_child(dock)
	await process_frame

	dock.refresh_library()
	if not await _wait_flag(func() -> bool: return _lib_done or not _last_error.is_empty()):
		_fail("Timed out waiting for library_refreshed")
		return
	if not _last_error.is_empty():
		_fail("library_refreshed failed: " + JSON.stringify(_last_error))
		return
	if _lib_entries.size() != 2:
		_fail("Expected 2 saved Store Web packages, got %d" % _lib_entries.size())
		return

	# Install both real .playforgepkg packages via live HTTP download -> SHA-256 -> plan review -> apply to proj-a
	for asset_id in ["lowpoly-fortress-pack", "ui-tactical-hud-kit"]:
		if not dock.select_asset(asset_id):
			_fail("Could not select asset: " + asset_id)
			return
		_plan_done = false
		_plan_result = {}
		_last_error = {}
		var review_res := dock.review_selected_package("4.7.2", "windows")
		if not review_res.ok:
			_fail("review_selected_package failed for %s: %s" % [asset_id, JSON.stringify(review_res)])
			return
		if review_res.get("pending", false):
			if not await _wait_flag(func() -> bool: return _plan_done or not _last_error.is_empty()):
				_fail("Timed out downloading/reviewing artifact for " + asset_id)
				return
			if not _last_error.is_empty():
				_fail("Async artifact review failed for %s: %s" % [asset_id, JSON.stringify(_last_error)])
				return
		else:
			_plan_result = review_res
		if str(_plan_result.get("store_state", "")) != "plan_reviewed":
			_fail("Expected plan_reviewed for " + asset_id)
			return
		if asset_id == "ui-tactical-hud-kit":
			var exec_addons: Array = _plan_result.get("executable_addons", [])
			if not ("addons/tactical_hud/plugin.cfg" in exec_addons):
				_fail("Expected executable_addon detection for addons/tactical_hud/plugin.cfg")
				return
		var apply_res := dock.apply_selected_package(false)
		if not apply_res.ok or str(apply_res.get("store_state", "")) != "applied_to_project":
			_fail("apply_selected_package failed for %s: %s" % [asset_id, JSON.stringify(apply_res)])
			return

	print("S1_E2E_GODOT_OK")
	quit(0)
`);

  const res = await runGodotAsync(godotConsole, ['--headless', '--path', hostProj, '--script', scriptPath], {
    cwd: hostProj,
    env: {
      ...process.env,
      TEST_STORE_WEB: storeSrv.url,
      TEST_STORE_API: `${forgeSrv.url}/api/asset-library/store`,
      TEST_STAGING: staging,
      TEST_PROJ_A: projA,
      TEST_PROJ_B: projB,
    },
  });
  assert.equal(res.error, null, `${res.stdout}\n${res.stderr}`);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /S1_E2E_GODOT_OK/);

  // Verify real .playforgepkg files extracted ONLY into proj-a
  assert.ok(fs.existsSync(path.join(projA, 'assets', 'fortress', 'turret_base.tscn')));
  assert.ok(fs.existsSync(path.join(projA, 'assets', 'fortress', 'wall_segment.glb')));
  assert.ok(fs.existsSync(path.join(projA, 'addons', 'tactical_hud', 'plugin.cfg')));
  assert.ok(fs.existsSync(path.join(projA, 'addons', 'tactical_hud', 'hud_theme.tres')));
  assert.ok(!fs.existsSync(path.join(projA, 'playforge-package.json')), 'Internal manifest must not pollute user project');

  const receipts = JSON.parse(fs.readFileSync(path.join(projA, '.playforge-store-installations.json'), 'utf8'));
  assert.equal(receipts['lowpoly-fortress-pack'].status, 'applied');
  assert.equal(receipts['ui-tactical-hud-kit'].status, 'applied');
  assert.deepEqual(snapshotTree(projB), projBBefore, 'Unselected proj-b must remain completely untouched');
});

test('S2: Hub SSO multi-account isolation across Store Web <-> Forge Bridge <-> Godot StoreDock', {
  skip: !fs.existsSync(godotConsole) && `Godot console binary not found at ${godotConsole}`,
  timeout: 45000,
}, async (t) => {
  const internalSecret = 'test-hub-sso-secret-20261121';
  const storeSrv = await startLiveStoreApp(t, { internalSecret, requireAuth: true });
  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: storeSrv.url,
    storeWebUrl: storeSrv.url,
    storeOptions: {
      storeInternalSecret: internalSecret,
    },
  });

  // Alice saves lowpoly-fortress-pack; Bob saves sfx-siege-audio-pack
  const saveAs = async (user, slug) => {
    const res = await fetch(`${storeSrv.url}/api/store/my-assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PlayHub-Internal-Secret': internalSecret,
        'X-PlayHub-User': user,
      },
      body: JSON.stringify({ slug, action: 'save' }),
    });
    assert.equal(res.status, 200);
  };
  await saveAs('alice@playhub.local', 'lowpoly-fortress-pack');
  await saveAs('bob@playhub.local', 'sfx-siege-audio-pack');

  // Verify via Forge HTTP bridge
  const aliceLib = await (await fetch(`${forgeSrv.url}/api/asset-library/store/library?account_id=alice@playhub.local`)).json();
  const bobLib = await (await fetch(`${forgeSrv.url}/api/asset-library/store/library?account_id=bob@playhub.local`)).json();
  const charlieLib = await (await fetch(`${forgeSrv.url}/api/asset-library/store/library?account_id=charlie@playhub.local`)).json();

  assert.deepEqual(aliceLib.entries.map((e) => e.asset_id), ['lowpoly-fortress-pack']);
  assert.deepEqual(bobLib.entries.map((e) => e.asset_id), ['sfx-siege-audio-pack']);
  assert.deepEqual(charlieLib.entries, [], 'Account with zero saved assets must receive empty library');

  // Verify Godot plugin.gd picks up PLAYFORGE_STORE_ACCOUNT_ID and sees only Alice's library
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-s2-sso-'));
  const settings = path.join(tmp, 'settings');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(settings, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  fs.cpSync(addonDir, path.join(proj, 'addons', 'playforge_asset_store'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'addons', 's2_probe'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'addons', 's2_probe', 'plugin.cfg'), '[plugin]\nname="S2 Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(path.join(proj, 'addons', 's2_probe', 'probe.gd'), `@tool
extends EditorPlugin

var _done := false
var _entries: Array = []

func _enter_tree() -> void:
	call_deferred("_verify")

func _verify() -> void:
	await get_tree().process_frame
	var plugins := get_tree().get_nodes_in_group(&"playforge_asset_store")
	if plugins.is_empty():
		printerr("S2_FAIL: plugin missing")
		get_tree().quit(1)
		return
	var dock: Node = plugins[0].get_store_dock()
	var diag: Dictionary = dock.get_diagnostics()
	if diag.account_id != "alice@playhub.local":
		printerr("S2_FAIL: account_id mismatch: " + str(diag.account_id))
		get_tree().quit(1)
		return
	dock.library_refreshed.connect(func(entries: Array) -> void:
		_entries = entries
		_done = true
	)
	dock.refresh_library()
	var deadline := Time.get_ticks_msec() + 10000
	while not _done and Time.get_ticks_msec() < deadline:
		await get_tree().create_timer(0.05).timeout
	if not _done or _entries.size() != 1 or str(_entries[0].get("asset_id", "")) != "lowpoly-fortress-pack":
		printerr("S2_FAIL: unexpected entries for Alice: " + JSON.stringify(_entries))
		get_tree().quit(1)
		return
	print("S2_SSO_ISOLATION_OK")
	get_tree().quit(0)
`);
  fs.writeFileSync(
    path.join(proj, 'project.godot'),
    appendEditorPlugin(
      appendEditorPlugin('config_version=5\n[application]\nconfig/name="S2Proj"\n', 'res://addons/playforge_asset_store/plugin.cfg'),
      'res://addons/s2_probe/plugin.cfg',
    ),
  );

  const res = await runGodotAsync(godotConsole, ['--headless', '--editor', '--path', proj], {
    cwd: proj,
    env: {
      ...process.env,
      APPDATA: settings,
      XDG_CONFIG_HOME: settings,
      XDG_DATA_HOME: settings,
      XDG_CACHE_HOME: settings,
      PLAYFORGE_STORE_WEB_URL: storeSrv.url,
      PLAYFORGE_STORE_API_URL: `${forgeSrv.url}/api/asset-library/store`,
      PLAYFORGE_STORE_ACCOUNT_ID: 'alice@playhub.local',
    },
  });
  assert.equal(res.error, null, `${res.stdout}\n${res.stderr}`);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /S2_SSO_ISOLATION_OK/);
});

test('S3: Multi-platform Forge matrix (web/windows/linux/macos) & explicit AOS/iOS non-support boundary', {
  skip: !fs.existsSync(godotConsole) && `Godot console binary not found at ${godotConsole}`,
  timeout: 30000,
}, async (t) => {
  // 1. Contract schema strictly restricts platforms to Forge platforms (no android, no ios)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const schemaPlatforms = schema.properties.engine_compatibility.properties.platforms.items.enum;
  assert.deepEqual(schemaPlatforms, ['web', 'windows', 'linux', 'macos']);
  assert.deepEqual(PLATFORMS, ['web', 'windows', 'linux', 'macos']);
  assert.equal(schemaPlatforms.includes('android'), false);
  assert.equal(schemaPlatforms.includes('ios'), false);

  // 2. Node bridge compatibility matrix on SAMPLE_CATALOG
  const { SAMPLE_CATALOG } = await import('../../../store/web/store-catalog.js');
  const fortress = SAMPLE_CATALOG.find((x) => x.asset_id === 'lowpoly-fortress-pack');
  const sfx = SAMPLE_CATALOG.find((x) => x.asset_id === 'sfx-siege-audio-pack');
  assert.ok(fortress && sfx);

  for (const plat of ['web', 'windows', 'linux']) {
    assert.equal(isEngineCompatible(fortress.engine_compatibility, '4.7.2', plat).ok, true, `fortress should allow ${plat}`);
  }
  assert.equal(isEngineCompatible(fortress.engine_compatibility, '4.7.2', 'macos').ok, false, 'fortress excludes macos');

  for (const plat of ['web', 'windows', 'linux', 'macos']) {
    assert.equal(isEngineCompatible(sfx.engine_compatibility, '4.7.2', plat).ok, true, `sfx should allow ${plat}`);
  }
  // AOS and iOS MUST be rejected even for packages supporting all 4 Forge platforms
  for (const mobilePlat of ['android', 'ios']) {
    const compat = isEngineCompatible(sfx.engine_compatibility, '4.7.2', mobilePlat);
    assert.equal(compat.ok, false, `${mobilePlat} must be rejected`);
    assert.match(compat.reason, /Forge-only/i);
    const lic = verifyUsageLicense({ accountId: 'u1', entry: sfx, targetEngineVersion: '4.7.2', targetPlatform: mobilePlat });
    assert.equal(lic.ok, false);
    assert.equal(lic.code, 'ENGINE_INCOMPATIBLE');
  }
  // Contract rejects adding android/ios to platforms
  const invalidMobileContract = validateStoreContract({
    ...sfx,
    engine_compatibility: { ...sfx.engine_compatibility, platforms: ['web', 'android'] },
  });
  assert.equal(invalidMobileContract.valid, false);

  // 3. Godot PackageInstaller GDScript platform matrix & AOS/iOS rejection
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-s3-plat-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tmp, 'project.godot'), 'config_version=5\n[application]\nconfig/name="S3Plat"\n');
  fs.cpSync(addonDir, path.join(tmp, 'addons', 'playforge_asset_store'), { recursive: true });
  const scriptPath = path.join(tmp, 's3_platform_probe.gd');
  fs.writeFileSync(scriptPath, `extends SceneTree

const PackageInstaller := preload("res://addons/playforge_asset_store/package_installer.gd")

func _init() -> void:
	var installer := PackageInstaller.new()
	for p in ["web", "windows", "linux", "macos"]:
		if not PackageInstaller.is_supported_forge_platform(p):
			printerr("S3_FAIL: expected supported platform " + p)
			quit(1)
			return
	for m in ["android", "ios", "Android", "iOS"]:
		if PackageInstaller.is_supported_forge_platform(m):
			printerr("S3_FAIL: mobile platform must not be supported: " + m)
			quit(1)
			return

	var entry := ${JSON.stringify(sfx)}
	for p in ["web", "windows", "linux", "macos"]:
		var ok_res := installer.stage_2_verify_license(entry, "4.7.2", p)
		if not ok_res.ok:
			printerr("S3_FAIL: stage_2 failed for %s: %s" % [p, JSON.stringify(ok_res)])
			quit(1)
			return
	for m in ["android", "ios"]:
		var bad_res := installer.stage_2_verify_license(entry, "4.7.2", m)
		if bad_res.ok or bad_res.code != "PLATFORM_INCOMPATIBLE":
			printerr("S3_FAIL: expected PLATFORM_INCOMPATIBLE for %s, got %s" % [m, JSON.stringify(bad_res)])
			quit(1)
			return

	var fortress := ${JSON.stringify(fortress)}
	var mac_res := installer.stage_2_verify_license(fortress, "4.7.2", "macos")
	if mac_res.ok or mac_res.code != "PLATFORM_INCOMPATIBLE":
		printerr("S3_FAIL: expected macos rejection for fortress")
		quit(1)
		return
	var old_engine := installer.stage_2_verify_license(fortress, "4.2.0", "web")
	if old_engine.ok or old_engine.code != "ENGINE_INCOMPATIBLE":
		printerr("S3_FAIL: expected ENGINE_INCOMPATIBLE for 4.2.0")
		quit(1)
		return

	print("S3_PLATFORM_MATRIX_OK")
	quit(0)
`);
  const res = await runGodotAsync(godotConsole, ['--headless', '--path', tmp, '--script', scriptPath], { cwd: tmp });
  assert.equal(res.error, null, `${res.stdout}\n${res.stderr}`);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /S3_PLATFORM_MATRIX_OK/);

  // 4. Native Android & iOS apps must NOT expose Forge Asset Store
  const mobileFiles = [
    ...walkSourceFiles(path.join(repoRoot, 'android', 'app', 'src'), ['.kt', '.java', '.xml']),
    ...walkSourceFiles(path.join(repoRoot, 'ios', 'App'), ['.swift']),
    ...walkSourceFiles(path.join(repoRoot, 'ios', 'Packages'), ['.swift']),
  ];
  assert.ok(mobileFiles.length > 0, 'Expected Android/iOS source files to inspect');
  for (const file of mobileFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /playforge_asset_store|\/api\/store\/my-assets|\.playforgepkg|\/api\/asset-library\/store/,
      `Native mobile source ${path.relative(repoRoot, file)} must not expose Forge Asset Store`,
    );
  }
});

test('S4: Godot Web Editor addon delivery (/api/platform-addon/asset-store), .playforge-store-config.json & slot persistence', {
  skip: !fs.existsSync(godotConsole) && `Godot console binary not found at ${godotConsole}`,
  timeout: 45000,
}, async (t) => {
  const storeSrv = await startLiveStoreApp(t);
  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: storeSrv.url,
    storeWebUrl: storeSrv.url,
  });

  // 1. Forge server serves /api/platform-addon/asset-store with all 4 addon files + Store endpoints
  const addonRes = await fetch(`${forgeSrv.url}/api/platform-addon/asset-store`);
  assert.equal(addonRes.status, 200);
  const addonJson = await addonRes.json();
  assert.equal(addonJson.ok, true);
  assert.deepEqual(
    Object.keys(addonJson.files).sort(),
    ['package_installer.gd', 'plugin.cfg', 'plugin.gd', 'store_dock.gd'],
  );
  assert.equal(addonJson.config.store_web_url, storeSrv.url);
  assert.equal(addonJson.config.store_api_url, '/api/asset-library/store');

  // 2. editor-bridge.js mounts playforge_asset_store, enables plugin, and writes .playforge-store-config.json
  const bridgeSrc = fs.readFileSync(path.join(forgeRoot, 'OfficialGodot', 'editor-bridge.js'), 'utf8');
  assert.match(bridgeSrc, /\/api\/platform-addon\/asset-store/);
  assert.match(bridgeSrc, /res:\/\/addons\/playforge_asset_store\/plugin\.cfg/);
  assert.match(bridgeSrc, /\.playforge-store-config\.json/);
  assert.match(bridgeSrc, /window\.__playforgeStoreWebUrl/);

  // 3. Godot plugin.gd loads endpoints & account_id from res://.playforge-store-config.json,
  // persists dock slot across disable/re-enable, and triggers clipboard fallback when open_store_web fails
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-s4-webcfg-'));
  const settings = path.join(tmp, 'settings');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(settings, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  fs.cpSync(addonDir, path.join(proj, 'addons', 'playforge_asset_store'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.playforge-store-config.json'), JSON.stringify({
    store_web_url: storeSrv.url,
    store_api_url: `${forgeSrv.url}/api/asset-library/store`,
    account_id: 'web-editor-user@playhub.local',
  }));
  fs.mkdirSync(path.join(proj, 'addons', 's4_probe'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'addons', 's4_probe', 'plugin.cfg'), '[plugin]\nname="S4 Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(path.join(proj, 'addons', 's4_probe', 'probe.gd'), `@tool
extends EditorPlugin

func _enter_tree() -> void:
	call_deferred("_verify")

func _verify() -> void:
	await get_tree().process_frame
	var plugins := get_tree().get_nodes_in_group(&"playforge_asset_store")
	if plugins.size() != 1:
		printerr("S4_FAIL: expected 1 plugin, got %d" % plugins.size())
		get_tree().quit(1)
		return
	var plugin: EditorPlugin = plugins[0]
	var dock: Node = plugin.get_store_dock()
	var diag: Dictionary = dock.get_diagnostics()
	if diag.store_web_url != "${storeSrv.url}":
		printerr("S4_FAIL: wrong store_web_url: " + str(diag.store_web_url))
		get_tree().quit(1)
		return
	if diag.account_id != "web-editor-user@playhub.local":
		printerr("S4_FAIL: wrong account_id: " + str(diag.account_id))
		get_tree().quit(1)
		return
	if plugin._has_main_screen():
		printerr("S4_FAIL: _has_main_screen must be false")
		get_tree().quit(1)
		return
	# Switch to bottom slot and verify EditorSettings saved it
	plugin.switch_dock_slot("bottom")
	var saved_slot := str(EditorInterface.get_editor_settings().get_setting("playforge/asset_store/dock_slot"))
	if saved_slot != "bottom":
		printerr("S4_FAIL: dock_slot setting not persisted: " + saved_slot)
		get_tree().quit(1)
		return
	# Verify popup-blocked / shell_open failure triggers fallback cleanly
	dock.set_shell_open_handler(func(_url: String) -> int: return ERR_CANT_OPEN)
	var open_res: Dictionary = dock.open_store_web()
	if open_res.ok or int(open_res.error) != ERR_CANT_OPEN:
		printerr("S4_FAIL: expected fallback error result on blocked browser open")
		get_tree().quit(1)
		return
	if not ("복사" in str(dock.get_diagnostics().status_text)):
		printerr("S4_FAIL: expected clipboard fallback message")
		get_tree().quit(1)
		return
	print("S4_WEB_CONFIG_AND_FALLBACK_OK")
	get_tree().quit(0)
`);
  fs.writeFileSync(
    path.join(proj, 'project.godot'),
    appendEditorPlugin(
      appendEditorPlugin('config_version=5\n[application]\nconfig/name="S4Proj"\n', 'res://addons/playforge_asset_store/plugin.cfg'),
      'res://addons/s4_probe/plugin.cfg',
    ),
  );

  // Run 1: reads .playforge-store-config.json & persists bottom slot
  const res1 = await runGodotAsync(godotConsole, ['--headless', '--editor', '--path', proj], {
    cwd: proj,
    env: {
      ...process.env,
      APPDATA: settings,
      XDG_CONFIG_HOME: settings,
      XDG_DATA_HOME: settings,
      XDG_CACHE_HOME: settings,
    },
  });
  assert.equal(res1.error, null, `${res1.stdout}\n${res1.stderr}`);
  assert.equal(res1.status, 0, `${res1.stdout}\n${res1.stderr}`);
  assert.match(res1.stdout, /S4_WEB_CONFIG_AND_FALLBACK_OK/);

  // Run 2: restart Godot with same EditorSettings -> verifies bottom slot is restored automatically!
  fs.writeFileSync(path.join(proj, 'addons', 's4_probe', 'probe.gd'), `@tool
extends EditorPlugin

func _enter_tree() -> void:
	call_deferred("_verify")

func _verify() -> void:
	await get_tree().process_frame
	var plugins := get_tree().get_nodes_in_group(&"playforge_asset_store")
	if plugins.size() != 1:
		printerr("S4_RESTORE_FAIL: plugin count %d" % plugins.size())
		get_tree().quit(1)
		return
	if plugins[0].get_current_slot_mode() != "bottom" or plugins[0].get_registered_place() != "bottom":
		printerr("S4_RESTORE_FAIL: expected restored bottom slot, got %s/%s" % [plugins[0].get_current_slot_mode(), plugins[0].get_registered_place()])
		get_tree().quit(1)
		return
	print("S4_SLOT_RESTORE_OK")
	get_tree().quit(0)
`);
  const res2 = await runGodotAsync(godotConsole, ['--headless', '--editor', '--path', proj], {
    cwd: proj,
    env: {
      ...process.env,
      APPDATA: settings,
      XDG_CONFIG_HOME: settings,
      XDG_DATA_HOME: settings,
      XDG_CACHE_HOME: settings,
    },
  });
  assert.equal(res2.error, null, `${res2.stdout}\n${res2.stderr}`);
  assert.equal(res2.status, 0, `${res2.stdout}\n${res2.stderr}`);
  assert.match(res2.stdout, /S4_SLOT_RESTORE_OK/);
});

test('S5: Store outage isolation, non-Store Forge continuity, and tampered upstream artifact rejection', async (t) => {
  // 1. Start Store Web, then close it to simulate Store outage
  const storeSrv = await startLiveStoreApp(t);
  const deadUrl = storeSrv.url;
  await storeSrv.app.close();

  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: deadUrl,
    storeWebUrl: deadUrl,
  });

  // Non-Store Forge APIs remain 100% operational during Store outage
  const legacyRes = await fetch(`${forgeSrv.url}/api/asset-library`);
  assert.equal(legacyRes.status, 200);
  const projectsRes = await fetch(`${forgeSrv.url}/api/platform/projects`);
  assert.equal(projectsRes.status, 200);

  // Store bridge fails cleanly with 503 STORE_UPSTREAM_UNAVAILABLE
  const outageRes = await fetch(`${forgeSrv.url}/api/asset-library/store/library`);
  assert.equal(outageRes.status, 503);
  const outageJson = await outageRes.json();
  assert.equal(outageJson.ok, false);
  assert.equal(outageJson.code, 'STORE_UPSTREAM_UNAVAILABLE');

  // 2. Rogue upstream serving tampered artifact bytes MUST be rejected with 422 ARTIFACT_DIGEST_MISMATCH
  const { SAMPLE_CATALOG } = await import('../../../store/web/store-catalog.js');
  const pkg = SAMPLE_CATALOG.find((x) => x.asset_id === 'lowpoly-fortress-pack');
  const rogueServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/api/store/catalog') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        items: [{ ...pkg, artifact_url: '/api/store/packages/lowpoly-fortress-pack/releases/1.2.0/artifact' }],
      }));
      return;
    }
    if (u.pathname === '/api/store/my-assets') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        entries: [{ ...pkg, slug: pkg.asset_id, store_state: 'saved_to_library', artifact_url: '/api/store/packages/lowpoly-fortress-pack/releases/1.2.0/artifact' }],
      }));
      return;
    }
    if (u.pathname.endsWith('/artifact')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from('TAMPERED_MALICIOUS_PAYLOAD'));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    rogueServer.once('error', reject);
    rogueServer.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => rogueServer.close(resolve)));

  const rogueBridge = createStoreBridge({
    storeServerUrl: `http://127.0.0.1:${rogueServer.address().port}`,
  });
  const sync = await rogueBridge.syncUpstreamLibrary('default');
  assert.equal(sync.ok, true);
  const fetchArtifact = await rogueBridge.ensureUpstreamArtifact(pkg.release_id);
  assert.equal(fetchArtifact.ok, false);
  assert.equal(fetchArtifact.status, 422);
  assert.equal(fetchArtifact.code, 'ARTIFACT_DIGEST_MISMATCH');
  assert.equal(fetchArtifact.project_modified, false);
});

test('S6: Mobile Web async save -> no direct web install -> editorial blocked -> later Godot sync', async (t) => {
  const { canInstallInStoreWeb } = await import('../../../store/web/store-catalog.js');
  assert.equal(canInstallInStoreWeb(), false, 'Store Web (PC or Mobile) must never install directly into projects');

  const storeSrv = await startLiveStoreApp(t);
  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: storeSrv.url,
    storeWebUrl: storeSrv.url,
  });

  // Simulate Mobile Web browser saving sfx-siege-audio-pack asynchronously
  const mobileUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const mobileHtml = await fetch(`${storeSrv.url}/`, { headers: { 'User-Agent': mobileUa } });
  assert.equal(mobileHtml.status, 200);

  const savePkg = await fetch(`${storeSrv.url}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': mobileUa },
    body: JSON.stringify({ slug: 'sfx-siege-audio-pack', action: 'save' }),
  });
  assert.equal(savePkg.status, 200);
  const savedPayload = await savePkg.json();
  assert.equal(savedPayload.entry.store_state, 'saved_to_library');
  assert.equal(savedPayload.entry.installation_record, null);

  // Attempting to save editorial content on Mobile Web is blocked
  const saveEditorial = await fetch(`${storeSrv.url}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': mobileUa },
    body: JSON.stringify({ slug: 'godot-47-dock-guide', action: 'save' }),
  });
  assert.equal(saveEditorial.status, 422);
  assert.equal((await saveEditorial.json()).error.code, 'EDITORIAL_NOT_INSTALLABLE');

  // Later on PC/Web Forge editor, refreshing library receives the mobile-saved package and verified artifact
  const libRes = await fetch(`${forgeSrv.url}/api/asset-library/store/library`);
  assert.equal(libRes.status, 200);
  const libJson = await libRes.json();
  assert.equal(libJson.entries.length, 1);
  assert.equal(libJson.entries[0].asset_id, 'sfx-siege-audio-pack');
  assert.equal(libJson.entries[0].store_state, 'saved_to_library');

  const artRes = await fetch(`${forgeSrv.url}/api/asset-library/store/artifacts/${libJson.entries[0].release_id}`);
  assert.equal(artRes.status, 200);
  assert.equal(artRes.headers.get('x-playforge-artifact-digest'), libJson.entries[0].artifact_digest);
  const artBytes = Buffer.from(await artRes.arrayBuffer());
  assert.ok(artBytes.length > 0);
});

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('S7: Real Chrome CDP PC Web (1280x800) + Mobile Web (390x844) interactive save -> live Forge Bridge sync & screenshots', {
  skip: !fs.existsSync(chromePath) && `Chrome not found at ${chromePath}`,
  timeout: 60000,
}, async (t) => {
  const storeSrv = await startLiveStoreApp(t);
  const forgeSrv = await startLiveForgeServer(t, {
    storeServerUrl: storeSrv.url,
    storeWebUrl: storeSrv.url,
  });

  const evidenceDir = path.join(forgeRoot, 'Saved', 'Tests', 'asset-store-xplat');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-s7-chrome-'));
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' },
  );
  let socket;
  const exceptions = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i += 1) {
      try {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0) { port = value; break; }
      } catch {
        // wait
      }
      await delay(100);
    }
    assert.ok(port, 'Chrome DevToolsActivePort ready');
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.text);
      if (pending.has(msg.id)) {
        const [resolve, reject] = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, [resolve, reject]);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    };
    const until = async (expression) => {
      for (let i = 0; i < 100; i += 1) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(`Condition timed out: ${expression}`);
    };

    await send('Runtime.enable');
    await send('Page.enable');

    // 1. PC Web (1280x800)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${storeSrv.url}/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'live'");
    assert.equal(await evaluate("document.querySelectorAll('#catalog-list .card').length"), 4);

    // Save Lowpoly Fortress Siege Kit on PC Web
    await evaluate("document.querySelector('[data-action=\"toggle-library\"][data-id=\"lowpoly-fortress-pack\"]').click()");
    await until("document.querySelector('#library-count')?.textContent === '1'");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, 'PC Web must have no horizontal overflow');

    // Verify editorial item has no install button
    await evaluate("document.querySelector('[data-card-id=\"godot-47-dock-guide\"]').click()");
    await until("document.querySelector('#detail-pane')?.textContent.includes('release_kind = editorial')");
    assert.equal(await evaluate("!!document.querySelector('#detail-pane [data-action=\"toggle-library\"]')"), false);

    // Reselect saved package and capture PC Web screenshot
    await evaluate("document.querySelector('[data-card-id=\"lowpoly-fortress-pack\"]').click()");
    await until("document.querySelector('#detail-pane')?.textContent.includes('saved_to_library')");
    const pcShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(evidenceDir, '01-pc-web-store-1280x800.png'), Buffer.from(pcShot.data, 'base64'));

    // 2. Mobile Web (390x844)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `${storeSrv.url}/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'live' && document.querySelector('#library-count')?.textContent === '1'");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, 'Mobile Web must have no horizontal overflow');

    // Save Siege Artillery & UI SFX Pack on Mobile Web (async handoff to Forge)
    await evaluate("document.querySelector('[data-action=\"toggle-library\"][data-id=\"sfx-siege-audio-pack\"]').click()");
    await until("document.querySelector('#library-count')?.textContent === '2'");
    const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(evidenceDir, '02-mobile-web-store-390x844.png'), Buffer.from(mobileShot.data, 'base64'));

    // 3. Immediately verify live Forge Bridge sees BOTH browser-saved assets (PC Web + Mobile Web)
    const forgeLib = await (await fetch(`${forgeSrv.url}/api/asset-library/store/library`)).json();
    assert.equal(forgeLib.ok, true);
    assert.equal(forgeLib.upstream_synced, true);
    assert.deepEqual(
      forgeLib.entries.map((e) => e.asset_id).sort(),
      ['lowpoly-fortress-pack', 'sfx-siege-audio-pack'],
    );
    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    await new Promise((resolve) => {
      chrome.once('exit', resolve);
      if (chrome.exitCode !== null || !chrome.kill()) resolve();
    });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
