'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const { buildCorePack, buildThinUgcPack } = require('../../Tools/build-core-pack.cjs');

const run = promisify(execFile);
const forgeRoot = path.resolve(__dirname, '../..');
const addonDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar');

function resolveEngineBin(gui = false) {
  const name = gui
    ? 'godot.windows.template_debug.x86_64.exe'
    : 'godot.windows.template_debug.x86_64.console.exe';
  const candidates = [
    process.env.PLAYFORGE_ENGINE_BIN,
    path.resolve(forgeRoot, `../../Forge-GodotEngine/bin/${name}`),
    path.resolve(forgeRoot, '../../Forge-GodotEngine/bin/godot.windows.template_debug.x86_64.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const engineConsoleBin = resolveEngineBin(false);

function startAssetServer() {
  const downloads = new Map();
  let totalRequests = 0;
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '').split('?')[0];
    const m = urlPath.match(/^\/api\/avatar\/assets\/(skins|accessories)\/([A-Za-z0-9_-]{1,80}\.glb)$/);
    if (!m || req.method !== 'GET') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const key = `${m[1]}/${m[2]}`;
    const full = path.join(addonDir, 'assets', m[1], m[2]);
    if (!fs.existsSync(full)) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    const bytes = fs.readFileSync(full);
    downloads.set(key, (downloads.get(key) || 0) + 1);
    totalRequests += 1;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(bytes);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        getMetrics: () => ({ totalRequests, uniqueAssets: downloads.size, perAsset: Object.fromEntries(downloads.entries()) }),
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const PORTRAIT_AUDIT_GD = `extends Node

var _ticks := 0
var _done := false

func _physics_process(_delta: float) -> void:
	if _done:
		return
	_ticks += 1
	if _ticks < 6:
		return
	_done = true
	var pf = Engine.get_singleton("PlayForgePlatform")
	var root := get_tree().root
	var portrait: Control = pf.call("get_avatar_portrait_ui") as Control
	var world_avatar: Node = pf.call("get_local_avatar") as Node
	var mode: int = int(pf.call("get_avatar_presentation_mode"))
	var min_upper: Vector2 = pf.call("get_portrait_min_size", 0)
	var min_full: Vector2 = pf.call("get_portrait_min_size", 1)

	var report: Dictionary = {
		"mode": mode,
		"hasPortrait": portrait != null,
		"hasWorldAvatar": world_avatar != null,
		"minUpper": [min_upper.x, min_upper.y],
		"minFull": [min_full.x, min_full.y],
		"initialState": portrait.call("get_public_state") if portrait != null else {},
		"checks": {},
	}

	if portrait != null:
		var checks: Dictionary = {}
		var v0: int = int(pf.call("get_violation_count"))

		# 1. Layer & internal SubViewport completely hidden from user GDScript
		checks["portraitLayerHidden"] = root.get_node_or_null("/root/PlayForgePortraitLayer") == null
		checks["portraitChildrenHidden"] = portrait.get_children(true).size() == 0
		checks["portraitStageHidden"] = portrait.get_node_or_null("SealedPortraitStage") == null
		checks["portraitSealedFlag"] = bool(portrait.call("is_platform_sealed"))

		# 2. C++ Minimum UI Size enforcement (UPPER_BODY >= 128x128)
		portrait.size = Vector2(24, 24)
		checks["shrinkSizeClampedUpper"] = portrait.size.x >= 128.0 and portrait.size.y >= 128.0

		portrait.custom_minimum_size = Vector2(10, 10)
		checks["shrinkCustomMinClampedUpper"] = portrait.custom_minimum_size.x >= 128.0 and portrait.custom_minimum_size.y >= 128.0

		portrait.custom_maximum_size = Vector2(40, 40)
		checks["shrinkCustomMaxClampedUpper"] = (portrait.custom_maximum_size.x < 0.0 or portrait.custom_maximum_size.x >= 128.0) and (portrait.custom_maximum_size.y < 0.0 or portrait.custom_maximum_size.y >= 128.0) and portrait.size.x >= 128.0 and portrait.size.y >= 128.0

		var res_small: Vector2 = portrait.call("set_portrait_size", Vector2(16, 16))
		checks["apiSmallSizeClampedUpper"] = res_small.x >= 128.0 and res_small.y >= 128.0

		# 3. Shrink scale / hide visibility / transparent modulate blocked in C++
		portrait.scale = Vector2(0.05, 0.05)
		checks["scaleShrinkBlocked"] = portrait.scale.x >= 1.0 and portrait.scale.y >= 1.0

		portrait.visible = false
		checks["hideBlocked"] = portrait.visible == true

		portrait.modulate = Color(1.0, 1.0, 1.0, 0.0)
		checks["modulateAlphaBlocked"] = portrait.modulate.a >= 0.85

		portrait.self_modulate = Color(1.0, 1.0, 1.0, 0.0)
		checks["selfModulateAlphaBlocked"] = portrait.self_modulate.a >= 0.85

		# 4. Deletion & script replacement blocked in C++
		portrait.free()
		portrait.queue_free()
		var orig_scr = portrait.get_script()
		portrait.set_script(null)
		checks["deleteAndScriptBlocked"] = is_instance_valid(portrait) and not portrait.is_queued_for_deletion() and portrait.get_script() == orig_scr

		# 5. Legitimate upscale ABOVE minimum (including large full-screen / lobby sizes, NO upper cap!) succeeds cleanly
		var res_large: Vector2 = portrait.call("set_portrait_size", Vector2(960, 720))
		checks["legitimateUpscaleNoMaxCapOk"] = is_equal_approx(res_large.x, 960.0) and is_equal_approx(res_large.y, 720.0) and is_equal_approx(portrait.size.x, 960.0) and is_equal_approx(portrait.size.y, 720.0)

		# 6. Dynamic switch to FULL_BODY with undersized request -> enforces higher C++ floor 160x240!
		portrait.call("set_framing", 1, Vector2(90, 90))
		var full_state: Dictionary = portrait.call("get_public_state")
		checks["fullBodyFramingOk"] = full_state.get("framingName", "") == "FULL_BODY"
		checks["fullBodyMinFloorApplied"] = portrait.size.x >= 160.0 and portrait.size.y >= 240.0 and full_state.get("platformMinSize", []) == [160.0, 240.0]

		# Attempt size valid for upper body (140x180) while in full-body mode -> clamped to 160x240!
		portrait.size = Vector2(140, 180)
		checks["fullBodyRejectsUpperSize"] = portrait.size.x >= 160.0 and portrait.size.y >= 240.0

		# 7. Emote works inside 3D RenderTarget Portrait
		checks["portraitEmoteOk"] = bool(portrait.call("play_emote_slot", 0))

		# 8. RenderTarget ViewportTexture exists
		var tex = portrait.call("get_render_texture")
		checks["renderTextureValid"] = tex != null

		var v1: int = int(pf.call("get_violation_count"))
		report["checks"] = checks
		report["fullBodyState"] = full_state
		report["violationsDelta"] = v1 - v0

	print("PORTRAIT_AUDIT_JSON=" + JSON.stringify(report))
	get_tree().quit(0)
`;

test(
  'Game-Mode 3D RenderTarget Portrait UI (Upper-Body min 128x128 & Full-Body min 160x240) + C++ Engine Seal in 2D & Hybrid 3D Worlds',
  {
    skip: process.platform !== 'win32' || !engineConsoleBin ? 'Compiled Forge-GodotEngine binary unavailable' : false,
    timeout: 120000,
  },
  async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-portrait-e2e-'));
    const cacheDir = path.join(tempDir, 'shared_cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const assetServer = await startAssetServer();
    t.after(async () => {
      await assetServer.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const core = buildCorePack(forgeRoot);
    const corePackPath = path.join(tempDir, 'playforge_core.pck');
    fs.writeFileSync(corePackPath, core.buffer);

    // 1. Completely blank 2D game configured with playforge/avatar/presentation_mode = 1 (PORTRAIT_UPPER_BODY)
    //    and deliberately requesting an illegally tiny portrait_size = Vector2(32, 32)!
    const world2d = buildThinUgcPack(
      [
        [
          'project.godot',
          `; Engine configuration file.
config_version=5

[application]
config/name="Blank2DCardGame"
run/main_scene="res://scenes/main_2d.tscn"
config/features=PackedStringArray("4.7")

[playforge]
avatar/presentation_mode=1
avatar/portrait_size=Vector2(32, 32)
avatar/portrait_corner=0

[autoload]
PortraitAuditor="*res://scripts/portrait_auditor.gd"
`,
        ],
        ['scenes/main_2d.tscn', '[gd_scene format=3]\n\n[node name="CardBoard2D" type="Control"]\n'],
        ['scripts/portrait_auditor.gd', PORTRAIT_AUDIT_GD],
      ],
      { worldId: 'world_2d_portrait', worldName: 'Blank 2D Portrait Game' }
    );
    const world2dPath = path.join(tempDir, 'world_2d_portrait.pck');
    fs.writeFileSync(world2dPath, world2d.buffer);

    const loadout = {
      displayName: 'PortraitTester',
      skinId: 'skin_skeleton_mage',
      attachments: {
        head: 'acc_crown_gold',
        back: 'acc_shield_spikes',
        hand_r: 'acc_sword_2h',
        hand_l: 'acc_crossbow_1h',
      },
      emoteWheel: ['emote_cheer', 'emote_wave', 'emote_dance', 'emote_spin'],
    };

    const { stdout: out2d } = await run(
      engineConsoleBin,
      [
        '--headless',
        '--playforge-core-pack',
        corePackPath,
        '--playforge-ugc-pack',
        world2dPath,
        '--',
        `--playhub-origin=${assetServer.origin}`,
        `--avatar-cache-dir=${cacheDir}`,
        `--avatar-loadout-json=${JSON.stringify(loadout)}`,
      ],
      { timeout: 60000 }
    );
    const line2d = out2d.split(/\r?\n/).find((l) => l.startsWith('PORTRAIT_AUDIT_JSON='));
    assert.ok(line2d, `Missing PORTRAIT_AUDIT_JSON in 2D portrait run:\n${out2d}`);
    const rep2d = JSON.parse(line2d.slice('PORTRAIT_AUDIT_JSON='.length));

    assert.equal(rep2d.mode, 1);
    assert.equal(rep2d.hasPortrait, true);
    assert.equal(rep2d.hasWorldAvatar, false, 'Portrait-only 2D mode should not spawn a 3D world avatar');
    assert.deepEqual(rep2d.minUpper, [128, 128]);
    assert.deepEqual(rep2d.minFull, [160, 240]);
    // Even though project.godot requested Vector2(32, 32), C++ clamped initial size to >= 128x128!
    assert.ok(rep2d.initialState.size[0] >= 128 && rep2d.initialState.size[1] >= 128, `Initial 32x32 must be clamped to >=128x128, got ${rep2d.initialState.size}`);
    assert.equal(rep2d.initialState.rig.ok, true);
    assert.equal(rep2d.initialState.rig.skinId, 'skin_skeleton_mage');
    assert.deepEqual(rep2d.initialState.rig.mountedAttachments, loadout.attachments);

    for (const [k, v] of Object.entries(rep2d.checks)) {
      assert.equal(v, true, `Portrait C++ seal / min-size check FAILED: ${k} = ${v}`);
    }
    assert.equal(Object.keys(rep2d.checks).length, 19);
    assert.ok(rep2d.violationsDelta >= 9, `Expected >=9 C++ seal violations blocked on Portrait UI, got ${rep2d.violationsDelta}`);

    // Asset server should have served exactly 5 GLBs (1 skin + 4 attachments)
    const mAfter2d = assetServer.getMetrics();
    assert.equal(mAfter2d.totalRequests, 5);

    // 2. Hybrid 3D Game Mode (presentation_mode = 3: WORLD_3D_WITH_PORTRAIT)
    //    Verifies BOTH 3D world avatar AND 3D RenderTarget Portrait coexist with 0 duplicate downloads!
    const worldHybrid = buildThinUgcPack(
      [
        [
          'project.godot',
          `; Engine configuration file.
config_version=5

[application]
config/name="Hybrid3DRPG"
run/main_scene="res://scenes/main_3d.tscn"
config/features=PackedStringArray("4.7")

[playforge]
avatar/presentation_mode=3
avatar/portrait_size=Vector2(180, 180)
avatar/portrait_corner=0

[autoload]
PortraitAuditor="*res://scripts/portrait_auditor.gd"
`,
        ],
        ['scenes/main_3d.tscn', '[gd_scene format=3]\n\n[node name="HybridWorld3D" type="Node3D"]\n'],
        ['scripts/portrait_auditor.gd', PORTRAIT_AUDIT_GD],
      ],
      { worldId: 'world_3d_hybrid', worldName: 'Hybrid 3D + Portrait RPG' }
    );
    const worldHybridPath = path.join(tempDir, 'world_3d_hybrid.pck');
    fs.writeFileSync(worldHybridPath, worldHybrid.buffer);

    const { stdout: outHybrid } = await run(
      engineConsoleBin,
      [
        '--headless',
        '--playforge-core-pack',
        corePackPath,
        '--playforge-ugc-pack',
        worldHybridPath,
        '--',
        `--playhub-origin=${assetServer.origin}`,
        `--avatar-cache-dir=${cacheDir}`,
        `--avatar-loadout-json=${JSON.stringify(loadout)}`,
      ],
      { timeout: 60000 }
    );
    const lineHybrid = outHybrid.split(/\r?\n/).find((l) => l.startsWith('PORTRAIT_AUDIT_JSON='));
    assert.ok(lineHybrid, `Missing PORTRAIT_AUDIT_JSON in Hybrid 3D run:\n${outHybrid}`);
    const repHybrid = JSON.parse(lineHybrid.slice('PORTRAIT_AUDIT_JSON='.length));

    assert.equal(repHybrid.mode, 3);
    assert.equal(repHybrid.hasPortrait, true, 'Hybrid mode must mount 3D RenderTarget Portrait UI');
    assert.equal(repHybrid.hasWorldAvatar, true, 'Hybrid mode must also spawn sealed 3D world avatar');
    assert.equal(repHybrid.initialState.rig.skinId, 'skin_skeleton_mage');

    // ZERO extra HTTP downloads because both 3D world avatar and Portrait UI read from shared SHA-256 disk cache!
    const mAfterHybrid = assetServer.getMetrics();
    assert.equal(mAfterHybrid.totalRequests, 5, `Expected 0 extra HTTP downloads in hybrid mode, got ${mAfterHybrid.totalRequests - 5}`);
  }
);
