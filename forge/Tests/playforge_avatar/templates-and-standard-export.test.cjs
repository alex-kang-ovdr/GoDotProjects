'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const { createServer } = require('../../server.cjs');
const { PlatformStore } = require('../../Tools/platform-store.cjs');
const { buildCorePack, buildThinUgcPack } = require('../../Tools/build-core-pack.cjs');
const { NativeRuntime } = require('../../Tools/native-runtime.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const engineBin = path.resolve(forgeRoot, '..', '..', 'Forge-GodotEngine', 'bin', 'godot.windows.template_debug.x86_64.console.exe');
const officialGodot = NativeRuntime.availability(forgeRoot);
const evidenceDir = path.join(forgeRoot, 'Saved', 'Tests', 'avatar-templates-export');

const ALL_18_TEMPLATES = [
  'blank3d',
  'playground3d',
  'brawllabs',
  'fortress-war',
  'iron-wood',
  'roblox-chaos-obby',
  'roblox-lantai-runtuh',
  'roblox-power-punch-sim',
  'roblox-war-tycoon',
  'survivor-io',
  'tappy-chicken',
  'tappy-chicken-mmo',
  'unity-2d-roguelike',
  'unity-flappy-bird',
  'unity-roll-a-ball',
  'unity-space-shooter',
  'unity-tanks-3d',
  'voxel-frontier',
];

function parseStoredZip(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buffer.subarray(dataStart, dataStart + compSize);
    if (!name.endsWith('/')) entries.set(name, Buffer.from(data));
    offset = dataStart + compSize;
  }
  return entries;
}

function listPckPaths(pckBuffer) {
  const magic = pckBuffer.readUInt32LE(0);
  assert.equal(magic, 0x43504447, 'Not a valid GDPC .pck file');
  const version = pckBuffer.readUInt32LE(4);
  // Header layout: 4 magic + 4 ver + 12 engine ver + 4 flags + 8 file_base = 32 bytes.
  // In PCK v3/v4, uint64 dir_offset sits at byte 32; in PCK v2, directory starts at byte 96.
  let pos = version >= 3 ? Number(pckBuffer.readBigUInt64LE(32)) : 96;
  const count = pckBuffer.readUInt32LE(pos);
  pos += 4;
  const paths = [];
  for (let i = 0; i < count; i++) {
    const pathLen = pckBuffer.readUInt32LE(pos);
    pos += 4;
    const raw = pckBuffer.subarray(pos, pos + pathLen).toString('utf8').replace(/\0+$/, '');
    paths.push(raw);
    pos += pathLen + 8 + 8 + 16 + 4;
  }
  return paths;
}

async function waitForBuild(base, buildId, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/builds/${buildId}`);
    const data = await res.json();
    if (data.build && ['succeeded', 'failed'].includes(data.build.status)) return data.build;
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Build ${buildId} timed out`);
}

function runGodotHeadless(executable, projectDir, args, tempEnvRoot, timeout = 60000) {
  const env = {
    ...process.env,
    APPDATA: tempEnvRoot,
    LOCALAPPDATA: tempEnvRoot,
    HOME: tempEnvRoot,
    XDG_DATA_HOME: tempEnvRoot,
    XDG_CONFIG_HOME: tempEnvRoot,
    XDG_CACHE_HOME: tempEnvRoot,
  };
  const res = spawnSync(executable, ['--headless', '--path', projectDir, ...args], {
    env,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return {
    status: res.status,
    error: res.error,
    output: (res.stdout || '') + '\n' + (res.stderr || ''),
  };
}

test('1. All 18 default templates declare valid game-appropriate mandatory avatar mode & position', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tpl-meta-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const store = new PlatformStore(forgeRoot, tmp);
  const listed = store.listTemplates();
  const byId = new Map(listed.map((item) => [item.id, item]));

  for (const id of ALL_18_TEMPLATES) {
    const item = byId.get(id);
    assert.ok(item, `Missing default template: ${id}`);
    const cfg = item.avatarPresentation;
    assert.ok(cfg, `Template ${id} is missing [playforge] avatarPresentation config`);
    assert.ok([0, 1, 2, 3].includes(cfg.mode), `${id}: invalid mode ${cfg.mode}`);

    if (cfg.mode === 0) {
      assert.equal(cfg.worldBinding, 'standalone', `${id}: WORLD_3D should use standalone worldBinding`);
      assert.ok(Array.isArray(cfg.spawnPosition) && cfg.spawnPosition.length === 3, `${id}: missing spawnPosition`);
    } else if (cfg.mode === 1) {
      assert.ok(Array.isArray(cfg.portraitSize), `${id}: missing portraitSize`);
      assert.ok(cfg.portraitSize[0] >= 128 && cfg.portraitSize[1] >= 128, `${id}: upper-body size below 128x128 min`);
      assert.ok(Number.isInteger(cfg.portraitCorner) && cfg.portraitCorner >= 0 && cfg.portraitCorner <= 4, `${id}: invalid corner`);
    } else if (cfg.mode === 2) {
      assert.ok(Array.isArray(cfg.portraitSize), `${id}: missing portraitSize`);
      assert.ok(cfg.portraitSize[0] >= 160 && cfg.portraitSize[1] >= 240, `${id}: full-body size below 160x240 min`);
      assert.ok(Number.isInteger(cfg.portraitCorner) && cfg.portraitCorner >= 0 && cfg.portraitCorner <= 4, `${id}: invalid corner`);
    } else if (cfg.mode === 3) {
      assert.equal(cfg.worldBinding, 'attach_player_character', `${id}: Roblox 3D hybrid should attach to PlayerCharacter`);
      assert.ok(Array.isArray(cfg.portraitSize) && cfg.portraitSize[0] >= 128 && cfg.portraitSize[1] >= 128, `${id}: hybrid portrait below 128x128 min`);
    }
    if (cfg.portraitCorner === 4) {
      assert.ok(Array.isArray(cfg.portraitCustomPosition) && cfg.portraitCustomPosition.length === 2, `${id}: corner=CUSTOM requires portraitCustomPosition`);
    }
  }
});

test('2. Standard Godot Project ZIP Export excludes ALL avatar files/config/nodes across all 18 templates and boots cleanly in stock Godot', {
  skip: officialGodot.available ? false : officialGodot.error || 'Official Godot unavailable',
  timeout: 300000,
}, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-std-zip-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(tmp, 'studio'),
    platformWorkspace: path.join(tmp, 'platform'),
    buildDirectory: path.join(tmp, 'builds'),
  });
  t.after(async () => {
    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // 2A. Verify ZIP contents for ALL 18 templates
  const exportedZips = new Map();
  for (const id of ALL_18_TEMPLATES) {
    const createRes = await fetch(`${base}/api/platform/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `StdExport ${id}`, template: id }),
    });
    assert.equal(createRes.status, 201, `create ${id} failed`);
    const created = await createRes.json();

    const expRes = await fetch(`${base}/api/platform/projects/${created.project.id}/export/godot-project.zip`);
    assert.equal(expRes.status, 200, `export ${id} failed`);
    assert.equal(expRes.headers.get('x-playforge-export-profile'), 'standard-godot');
    assert.equal(expRes.headers.get('x-playforge-avatar-included'), 'false');
    const zipBuf = Buffer.from(await expRes.arrayBuffer());
    const entries = parseStoredZip(zipBuf);
    exportedZips.set(id, entries);

    const paths = [...entries.keys()];
    assert.ok(entries.has('project.godot'), `${id}: exported ZIP missing project.godot`);
    assert.ok(entries.has('scenes/main.tscn'), `${id}: exported ZIP missing scenes/main.tscn`);
    assert.ok(paths.every((p) => !p.startsWith('addons/playforge_avatar/')), `${id}: leaked addons/playforge_avatar/`);
    assert.ok(paths.every((p) => !p.startsWith('addons/playforge_platform/')), `${id}: leaked addons/playforge_platform/`);

    const projGodot = entries.get('project.godot').toString('utf8');
    assert.doesNotMatch(projGodot, /\[playforge\]|playforge_avatar|PlayForgeAvatarRuntime/i, `${id}: project.godot leaked avatar config`);
    if (id.startsWith('roblox-')) {
      assert.match(projGodot, /playforge_roblox_compat/, `${id}: Roblox compat plugin must be preserved in standard export`);
    }
    const mainTscn = entries.get('scenes/main.tscn').toString('utf8');
    assert.doesNotMatch(mainTscn, /playforge_avatar|PlayForgeAvatar/i, `${id}: main.tscn leaked avatar reference`);
  }

  // 2B. Verify a user project with a manual PlayForgeAvatarSpawn node in main.tscn ALSO strips cleanly!
  const manualCreate = await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ManualSpawn Strip Test', template: 'playground3d' }),
  }).then((r) => r.json());
  const modifiedFiles = manualCreate.files.map((f) => {
    if (f.path !== 'scenes/main.tscn') return f;
    const withSpawn = f.content
      .replace('[gd_scene load_steps=4 format=3]', '[gd_scene load_steps=5 format=3]')
      .replace(
        '[ext_resource type="Script" path="res://scripts/spin.gd" id="1_spin"]',
        '[ext_resource type="Script" path="res://scripts/spin.gd" id="1_spin"]\n[ext_resource type="Script" path="res://addons/playforge_avatar/avatar_spawn.gd" id="2_avatar"]',
      )
      + '\n[node name="AvatarSpawn" type="Marker3D" parent="."]\nposition = Vector3(0, 0.2, 3)\nscript = ExtResource("2_avatar")\npresentation_mode = 1\n\n[node name="SpawnMarkerLabel" type="Node3D" parent="AvatarSpawn"]\n';
    return { path: f.path, content: withSpawn };
  });
  const saveRes = await fetch(`${base}/api/platform/projects/${manualCreate.project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: manualCreate.revision, files: modifiedFiles }),
  });
  assert.equal(saveRes.status, 200);
  const manualZipRes = await fetch(`${base}/api/platform/projects/${manualCreate.project.id}/export/godot-project.zip`);
  assert.equal(manualZipRes.status, 200);
  const manualEntries = parseStoredZip(Buffer.from(await manualZipRes.arrayBuffer()));
  const strippedTscn = manualEntries.get('scenes/main.tscn').toString('utf8');
  assert.doesNotMatch(strippedTscn, /playforge_avatar|AvatarSpawn|SpawnMarkerLabel|2_avatar/i, 'Manual PlayForgeAvatarSpawn and child must be stripped');
  exportedZips.set('manual-spawn-stripped', manualEntries);

  // 2C. Actually unpack and boot representative Standard Godot ZIPs in Stock Official Godot 4.7.2!
  const probeGd = `extends Node
func _ready() -> void:
\tcall_deferred("_check")
func _check() -> void:
\tvar scene := load("res://scenes/main.tscn") as PackedScene
\tassert(scene != null, "Failed to load main.tscn")
\tvar inst := scene.instantiate()
\tadd_child(inst)
\tawait get_tree().process_frame
\tawait get_tree().process_frame
\tvar root := get_tree().root
\tvar has_autoload := root.get_node_or_null("PlayForgeAvatarRuntime") != null
\tvar has_portrait := root.get_node_or_null("PlayForgePortraitLayer") != null
\tvar has_avatar := _has_avatar_recursive(root)
\tprint("STD_GODOT_BOOT=" + JSON.stringify({"scene": inst.name, "hasAutoload": has_autoload, "hasPortrait": has_portrait, "hasAvatar": has_avatar}))
\tinst.queue_free()
\tawait get_tree().process_frame
\tget_tree().quit(0)
func _has_avatar_recursive(n: Node) -> bool:
\tif n.name in ["PlayForgePlayerAvatar", "PlayForgeAvatarPortraitUI", "PlayForgeAvatarRuntime"]:
\t\treturn true
\tvar scr: Variant = n.get_script()
\tif scr is Script and str((scr as Script).resource_path).contains("playforge_avatar"):
\t\treturn true
\tfor c in n.get_children():
\t\tif _has_avatar_recursive(c):
\t\t\treturn true
\treturn false
`;
  const probeTscn = `[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://std_probe.gd" id="1"]\n\n[node name="StdProbe" type="Node"]\nscript = ExtResource("1")\n`;

  for (const id of ['playground3d', 'tappy-chicken', 'brawllabs', 'fortress-war', 'roblox-chaos-obby', 'voxel-frontier', 'unity-roll-a-ball', 'iron-wood', 'manual-spawn-stripped']) {
    const dir = path.join(tmp, 'boot-' + id);
    for (const [rel, buf] of exportedZips.get(id).entries()) {
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
    fs.writeFileSync(path.join(dir, 'std_probe.gd'), probeGd, 'utf8');
    fs.writeFileSync(path.join(dir, 'std_probe.tscn'), probeTscn, 'utf8');

    const imp = runGodotHeadless(officialGodot.executable, dir, ['--editor', '--import'], tmp, 60000);
    assert.ifError(imp.error);
    assert.equal(imp.status, 0, `${id} stock Godot import failed:\n${imp.output}`);
    const boot = runGodotHeadless(officialGodot.executable, dir, ['res://std_probe.tscn'], tmp, 45000);
    assert.ifError(boot.error);
    assert.equal(boot.status, 0, `${id} stock Godot boot failed:\n${boot.output}`);
    assert.doesNotMatch(boot.output, /SCRIPT ERROR:|Parse Error:|Failed to load script|Cannot open file/, `${id} stock Godot script error:\n${boot.output}`);
    const m = /STD_GODOT_BOOT=(\{[^\r\n]+\})/.exec(boot.output);
    assert.ok(m, `${id} missing STD_GODOT_BOOT output:\n${boot.output}`);
    const parsed = JSON.parse(m[1]);
    assert.equal(parsed.hasAutoload, false, `${id} must NOT have PlayForgeAvatarRuntime autoload`);
    assert.equal(parsed.hasPortrait, false, `${id} must NOT have PlayForgePortraitLayer`);
    assert.equal(parsed.hasAvatar, false, `${id} must NOT have any avatar node in Standard Godot`);
  }
});

test('3. PlayHub Publish Web Build includes mandatory avatar while Standard Godot Web Build excludes avatar & is blocked from Hub publish', {
  skip: officialGodot.available ? false : officialGodot.error || 'Official Godot unavailable',
  timeout: 420000,
}, async (t) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-web-profiles-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(tmp, 'studio'),
    platformWorkspace: path.join(tmp, 'platform'),
    buildDirectory: path.join(tmp, 'builds'),
  });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // Test PlayHub Publish Build vs Standard Godot Web Build across 4 diverse modes
  for (const templateId of ['playground3d', 'tappy-chicken', 'fortress-war', 'roblox-chaos-obby']) {
    const created = await fetch(`${base}/api/platform/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `ProfileQA ${templateId}`, template: templateId }),
    }).then((r) => r.json());
    const pid = created.project.id;

    // 3A. PlayHub Publish Build with experimental Platform Avatar opt-in ON
    const hubEnq = await fetch(`${base}/api/platform-builds/${pid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: created.revision, buildProfile: 'playhub-publish', includePlatformAvatar: true }),
    });
    assert.equal(hubEnq.status, 202);
    const hubJob = await waitForBuild(base, (await hubEnq.json()).build.id);
    assert.equal(hubJob.status, 'succeeded', `${templateId} playhub-publish build failed: ${hubJob.error}\n${hubJob.log}`);
    assert.equal(hubJob.buildProfile, 'playhub-publish');
    assert.equal(hubJob.avatarIncluded, true);
    assert.equal(hubJob.sdkBridgeVersion, 'playhub-godot-shell-v1');
    assert.ok(hubJob.files.includes('playhub-godot-shell.js'));
    assert.ok(hubJob.files.includes('PlayForge-Web.zip'));

    // Inspect exported index.pck from PlayHub Publish Build
    const hubPck = Buffer.from(await (await fetch(`${base}/api/builds/${hubJob.id}/files/index.pck`)).arrayBuffer());
    const hubPckPaths = listPckPaths(hubPck);
    assert.ok(hubPckPaths.some((p) => p.includes('addons/playforge_avatar/avatar_bootstrap.gd')), `${templateId} hub PCK missing avatar_bootstrap.gd`);
    assert.ok(hubPckPaths.some((p) => p.includes('addons/playforge_avatar/avatar_portrait_ui.gd')), `${templateId} hub PCK missing avatar_portrait_ui.gd`);
    assert.ok(hubPckPaths.some((p) => p.includes('addons/playforge_avatar/assets/skins/Knight.glb')), `${templateId} hub PCK missing starter Knight.glb`);

    // Open PlayHub Publish Build in headless Chrome and capture screenshot
    const page = await browser.newPage({ viewport: { width: 1280, height: templateId === 'fortress-war' ? 900 : 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => {
      if (/SCRIPT ERROR:|Parse Error|Failed loading resource/i.test(m.text())) errs.push(m.text());
    });
    await page.goto(`${base}${hubJob.previewUrl}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3500));
    await page.screenshot({ path: path.join(evidenceDir, `hub-publish-${templateId}.png`) });
    assert.deepEqual(errs, [], `${templateId} PlayHub Publish Build runtime errors: ${errs.join('\n')}`);
    await page.close();

    // 3B. Standard Godot Web Build (standard-godot -> NO avatar, NO playhub-godot-shell.js, blocked from Hub publish!)
    if (templateId === 'playground3d' || templateId === 'tappy-chicken') {
      const stdEnq = await fetch(`${base}/api/platform-builds/${pid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: created.revision, buildProfile: 'standard-godot' }),
      });
      assert.equal(stdEnq.status, 202);
      const stdJob = await waitForBuild(base, (await stdEnq.json()).build.id);
      assert.equal(stdJob.status, 'succeeded', `${templateId} standard-godot build failed: ${stdJob.error}\n${stdJob.log}`);
      assert.notEqual(stdJob.id, hubJob.id, 'standard-godot build must NOT collide with playhub-publish cache');
      assert.equal(stdJob.buildProfile, 'standard-godot');
      assert.equal(stdJob.avatarIncluded, false);
      assert.equal(stdJob.sdkBridgeVersion, null);
      assert.ok(!stdJob.files.includes('playhub-godot-shell.js'), 'standard-godot must NOT include playhub-godot-shell.js');
      assert.ok(stdJob.files.includes('StandardGodot-Web.zip'));

      const stdPck = Buffer.from(await (await fetch(`${base}/api/builds/${stdJob.id}/files/index.pck`)).arrayBuffer());
      const stdPckPaths = listPckPaths(stdPck);
      assert.ok(stdPckPaths.every((p) => !p.includes('playforge_avatar')), `${templateId} standard PCK leaked playforge_avatar: ${stdPckPaths.filter((p) => p.includes('playforge_avatar'))}`);
      assert.ok(stdPckPaths.every((p) => !p.includes('Knight.glb')), `${templateId} standard PCK leaked Knight.glb`);

      // Verify Standard Godot Web Build also boots cleanly in Chrome with 0 errors
      const stdPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const stdErrs = [];
      stdPage.on('pageerror', (e) => stdErrs.push(e.message));
      stdPage.on('console', (m) => {
        if (/SCRIPT ERROR:|Parse Error|Failed loading resource/i.test(m.text())) stdErrs.push(m.text());
      });
      await stdPage.goto(`${base}${stdJob.previewUrl}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await stdPage.locator('canvas').first().waitFor({ state: 'visible', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));
      await stdPage.screenshot({ path: path.join(evidenceDir, `standard-godot-${templateId}.png`) });
      assert.deepEqual(stdErrs, [], `${templateId} Standard Godot Web Build runtime errors: ${stdErrs.join('\n')}`);
      await stdPage.close();

      // Verify Standard Godot Web Build is REJECTED by PlayHub Release publishing!
      const badRel = await fetch(`${base}/api/platform/projects/${pid}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: created.revision,
          buildId: stdJob.id,
          label: 'Should Fail',
          visibility: 'private',
        }),
      });
      assert.equal(badRel.status, 409, 'Standard Godot build MUST NOT be publishable as a PlayHub release');
    }
  }
});

test('4. Forge-GodotEngine C++ PlayForgePlatform mounts each template in its exact configured avatar mode & position', {
  skip: fs.existsSync(engineBin) ? false : `Forge-GodotEngine binary missing at ${engineBin}`,
  timeout: 240000,
}, (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cpp-tpl-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const corePackPath = path.join(tmp, 'playforge_core.pck');
  fs.writeFileSync(corePackPath, buildCorePack(forgeRoot).buffer);
  const assetsDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar', 'assets');
  const store = new PlatformStore(forgeRoot, path.join(tmp, 'store'));

  const cases = [
    { id: 'blank3d', expectMode: 0, expectWorld: true, expectPortrait: false },
    { id: 'playground3d', expectMode: 0, expectWorld: true, expectPortrait: false, expectSpawnZ: 3.8 },
    { id: 'roblox-chaos-obby', expectMode: 3, expectWorld: true, expectPortrait: true, expectCorner: 0, expectMinW: 128, expectMinH: 128 },
    { id: 'iron-wood', expectMode: 2, expectWorld: false, expectPortrait: true, expectCorner: 2, expectMinW: 160, expectMinH: 240 },
    { id: 'fortress-war', expectMode: 2, expectWorld: false, expectPortrait: true, expectCorner: 4, expectMinW: 160, expectMinH: 240 },
    { id: 'tappy-chicken', expectMode: 1, expectWorld: false, expectPortrait: true, expectCorner: 0, expectMinW: 128, expectMinH: 128 },
    { id: 'survivor-io', expectMode: 1, expectWorld: false, expectPortrait: true, expectCorner: 0, expectMinW: 128, expectMinH: 128 },
    { id: 'brawllabs', expectMode: 1, expectWorld: false, expectPortrait: true, expectCorner: 4, expectMinW: 128, expectMinH: 128 },
  ];

  const probeAutoload = `extends Node
func _ready() -> void:
\tcall_deferred("_run")
func _run() -> void:
\tfor _i in range(6):
\t\tawait get_tree().process_frame
\tvar pf = Engine.get_singleton("PlayForgePlatform")
\tvar mode: int = pf.get_avatar_presentation_mode()
\tvar av = pf.get_local_avatar()
\tvar pt = pf.get_avatar_portrait_ui()
\tvar pstate: Dictionary = pt.get_public_state() if (pt != null and pt.has_method("get_public_state")) else {}
\tvar out := {
\t\t"mode": mode,
\t\t"hasWorld": av != null,
\t\t"worldPos": [av.position.x, av.position.y, av.position.z] if (av is Node3D) else null,
\t\t"worldParent": av.get_parent().name if (av != null and av.get_parent() != null) else "",
\t\t"hasPortrait": pt != null,
\t\t"portraitCorner": int(pstate.get("corner", -1)),
\t\t"portraitSize": pstate.get("size", [0, 0]),
\t\t"portraitPos": pstate.get("position", [0, 0]),
\t\t"platformMinSize": pstate.get("platformMinSize", [0, 0]),
\t\t"rigOk": bool((pstate.get("rig", {}) as Dictionary).get("ok", false)) if pt != null else true,
\t}
\tprint("CPP_TPL_PROBE=" + JSON.stringify(out))
\tget_tree().quit(0)
`;

  for (const c of cases) {
    const { files } = store.createProject({ name: `Cpp ${c.id}`, template: c.id, mode: 'ready' });
    let pj = files['project.godot'];
    if (/^\[autoload\]/m.test(pj)) {
      pj = pj.replace(/^\[autoload\]\r?\n/m, '[autoload]\nCppTemplateProbe="*res://cpp_probe.gd"\n');
    } else {
      pj += '\n[autoload]\nCppTemplateProbe="*res://cpp_probe.gd"\n';
    }
    const entries = Object.entries({ ...files, 'project.godot': pj, 'cpp_probe.gd': probeAutoload });
    const ugcPackPath = path.join(tmp, `ugc-${c.id}.pck`);
    fs.writeFileSync(ugcPackPath, buildThinUgcPack(entries, { worldId: c.id, worldName: c.id }).buffer);

    const env = {
      ...process.env,
      APPDATA: tmp,
      LOCALAPPDATA: tmp,
      HOME: tmp,
      XDG_DATA_HOME: tmp,
      XDG_CONFIG_HOME: tmp,
      XDG_CACHE_HOME: tmp,
    };
    const spawnRes = spawnSync(engineBin, [
      '--headless',
      '--playforge-core-pack', corePackPath,
      '--playforge-ugc-pack', ugcPackPath,
      '--',
      `--avatar-assets-dir=${assetsDir}`,
      `--avatar-cache-dir=${path.join(tmp, 'cache')}`,
    ], {
      env,
      encoding: 'utf8',
      timeout: 45000,
      windowsHide: true,
    });
    const res = {
      status: spawnRes.status,
      error: spawnRes.error,
      output: (spawnRes.stdout || '') + '\n' + (spawnRes.stderr || ''),
    };
    assert.ifError(res.error);
    assert.equal(res.status, 0, `${c.id} C++ engine boot failed:\n${res.output}`);
    const match = /CPP_TPL_PROBE=(\{[^\r\n]+\})/.exec(res.output);
    assert.ok(match, `${c.id} missing CPP_TPL_PROBE:\n${res.output}`);
    const data = JSON.parse(match[1]);
    assert.equal(data.mode, c.expectMode, `${c.id} mode mismatch: ${JSON.stringify(data)}`);
    assert.equal(data.hasWorld, c.expectWorld, `${c.id} hasWorld mismatch: ${JSON.stringify(data)}`);
    assert.equal(data.hasPortrait, c.expectPortrait, `${c.id} hasPortrait mismatch: ${JSON.stringify(data)}`);
    if (c.expectSpawnZ !== undefined) {
      assert.ok(Math.abs(data.worldPos[2] - c.expectSpawnZ) < 0.05, `${c.id} spawn Z mismatch: ${JSON.stringify(data)}`);
    }
    if (c.id === 'roblox-chaos-obby') {
      assert.equal(data.worldParent, 'PlayerCharacter', `${c.id} world avatar must attach to PlayerCharacter`);
    }
    if (c.expectPortrait) {
      assert.equal(data.portraitCorner, c.expectCorner, `${c.id} corner mismatch: ${JSON.stringify(data)}`);
      assert.ok(data.portraitSize[0] >= c.expectMinW && data.portraitSize[1] >= c.expectMinH, `${c.id} size below min: ${JSON.stringify(data)}`);
      assert.equal(data.platformMinSize[0], c.expectMinW, `${c.id} C++ platform_min_size W mismatch`);
      assert.equal(data.platformMinSize[1], c.expectMinH, `${c.id} C++ platform_min_size H mismatch`);
      assert.equal(data.rigOk, true, `${c.id} portrait GLB rig failed to load: ${JSON.stringify(data)}`);
    }
  }
});
