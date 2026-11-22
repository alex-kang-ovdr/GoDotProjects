'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const { buildCorePack, buildThinUgcPack, writeGodotPck } = require('../../Tools/build-core-pack.cjs');
const { buildThinUgcArtifact } = require('../../Tools/build-queue.cjs');

const run = promisify(execFile);
const forgeRoot = path.resolve(__dirname, '../..');
const addonDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar');
const catalog = JSON.parse(fs.readFileSync(path.join(addonDir, 'catalog.json'), 'utf8'));

function resolveEngineBinary() {
  const candidates = [
    process.env.PLAYFORGE_ENGINE_BIN,
    path.resolve(forgeRoot, '../../Forge-GodotEngine/bin/godot.windows.template_debug.x86_64.console.exe'),
    path.resolve(forgeRoot, '../../Forge-GodotEngine/bin/godot.windows.template_debug.x86_64.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const engineBin = resolveEngineBinary();

/**
 * Lightweight live PlayHub Asset HTTP server (Layer 3) that serves /api/avatar/assets/*
 * and tracks exact per-file HTTP download counts so we can verify ZERO duplicate downloads.
 */
function startAssetServer() {
  const downloads = new Map();
  let totalRequests = 0;
  let totalBytesServed = 0;

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
    totalBytesServed += bytes.length;

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
        getMetrics: () => ({
          totalRequests,
          totalBytesServed,
          uniqueAssets: downloads.size,
          perAsset: Object.fromEntries(downloads.entries()),
        }),
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/**
 * GDScript Autoload embedded into each Thin UGC world ONLY to inspect engine state,
 * run the 16-vector adversarial C++ seal attack suite, test locomotion/ragdoll/emotes,
 * and emit a single JSON summary line then exit cleanly.
 * Note: the main 3D scenes themselves (e.g. blank_world.tscn) stay 100% pure/empty!
 */
const WORLD_AUDITOR_GD = `extends Node

var _ticks := 0
var _done := false
var _stage := 0
var _tps_start := Vector3.ZERO
var _tps_moved := 0.0
var _topdown_start := Vector3.ZERO
var _topdown_moved := 0.0
var _report: Dictionary = {}

func _get_user_arg(prefix: String) -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with(prefix):
			return arg.substr(prefix.length())
	return ""

func _physics_process(_delta: float) -> void:
	if _done:
		return
	_ticks += 1
	if _stage == 0 and _ticks >= 4:
		_run_bootstrap_and_seal_audit()
		_stage = 1
		var avatar: Node = _get_avatar()
		if avatar != null and avatar.has_method("set_virtual_input"):
			_tps_start = (avatar as Node3D).global_position
			avatar.call("set_virtual_input", Vector2(0.0, -1.0), true, false, false)
	elif _stage == 1 and _ticks >= 24:
		var avatar: Node = _get_avatar()
		if avatar != null:
			_tps_moved = _tps_start.distance_to((avatar as Node3D).global_position)
			if avatar.has_method("set_camera_mode"):
				avatar.call("set_camera_mode", 1) # FPS
				var st_fps: Dictionary = avatar.call("get_public_state")
				_report["fpsModeOk"] = st_fps.get("cameraMode", "") == "FPS" and bool(st_fps.get("rig", {}).get("firstPersonHeadHidden", false))
				avatar.call("set_camera_mode", 2) # TopDown
				_topdown_start = (avatar as Node3D).global_position
				avatar.call("set_virtual_input", Vector2(1.0, 0.0), false, false, false)
		_stage = 2
	elif _stage == 2 and _ticks >= 40:
		var avatar: Node = _get_avatar()
		if avatar != null:
			_topdown_moved = _topdown_start.distance_to((avatar as Node3D).global_position)
			avatar.call("set_virtual_input", Vector2.ZERO, false, false, false)
			avatar.call("set_camera_mode", 0) # Back to TPS
			var emote_ok: bool = bool(avatar.call("play_emote_slot", 0))
			var ragdoll_ok: bool = bool(avatar.call("trigger_ragdoll", Vector3(0.0, 1.8, -3.5), "chest"))
			var ragdoll_active: bool = bool(avatar.call("is_ragdoll_active"))
			var recover_ok: bool = bool(avatar.call("recover_from_ragdoll"))
			_report["tpsMovedDistance"] = snappedf(_tps_moved, 0.001)
			_report["topDownMovedDistance"] = snappedf(_topdown_moved, 0.001)
			_report["emoteOk"] = emote_ok
			_report["ragdollOk"] = ragdoll_ok and ragdoll_active and recover_ok and not bool(avatar.call("is_ragdoll_active"))
			var final_state: Dictionary = avatar.call("get_public_state")
			_report["finalState"] = final_state
		_done = true
		print("MULTIWORLD_AUDIT_JSON=" + JSON.stringify(_report))
		get_tree().quit(0)

func _get_avatar() -> Node:
	if Engine.has_singleton("PlayForgePlatform"):
		var pf = Engine.get_singleton("PlayForgePlatform")
		return pf.call("get_local_avatar") as Node
	return null

func _run_bootstrap_and_seal_audit() -> void:
	var scene := get_tree().current_scene
	var root := get_tree().root
	var world_id := _get_user_arg("--world-id=")
	var run_tamper := _get_user_arg("--run-tamper-audit=") == "1"
	var evil_pck := _get_user_arg("--evil-pck=")

	var pf = Engine.get_singleton("PlayForgePlatform") if Engine.has_singleton("PlayForgePlatform") else null
	var avatar: Node = pf.call("get_local_avatar") as Node if pf != null else null
	var state: Dictionary = avatar.call("get_public_state") if (avatar != null and avatar.has_method("get_public_state")) else {}
	var rig: Dictionary = state.get("rig", {})
	var ragdoll: Dictionary = state.get("ragdoll", {})
	var safe_inset: Rect2 = pf.call("get_topbar_safe_inset") if pf != null else Rect2()

	_report = {
		"worldId": world_id,
		"sceneName": scene.name if scene != null else "",
		"hasPlayForgeSingleton": pf != null,
		"isEngineSealed": bool(pf.call("is_engine_sealed")) if pf != null else false,
		"isPlatformHudActive": bool(pf.call("is_platform_hud_active")) if pf != null else false,
		"topbarInset": [safe_inset.position.x, safe_inset.position.y, safe_inset.size.x, safe_inset.size.y],
		"sealedPrefixes": Array(pf.call("get_sealed_prefixes")) if pf != null else [],
		"hasFallbackFloor": scene.get_node_or_null("PlayForgeBaseplateFloor") != null if scene != null else false,
		"hasFallbackLight": scene.get_node_or_null("PlayForgeDefaultLight") != null if scene != null else false,
		"avatarFound": avatar != null,
		"avatarIsPlatformSealed": bool(avatar.call("is_platform_sealed")) if avatar != null else false,
		"initialCameraMode": state.get("cameraMode", ""),
		"avatarSpawnPos": state.get("position", []),
		"skinId": rig.get("skinId", ""),
		"rigOk": bool(rig.get("ok", false)),
		"boneCount": int(rig.get("boneCount", 0)),
		"animationCount": int(rig.get("animationCount", 0)),
		"mountedAttachments": rig.get("mountedAttachments", {}),
		"ragdollBoneCount": int(ragdoll.get("physicalBoneCount", 0)),
		"cacheMetrics": rig.get("cacheMetrics", {}),
		"tamperAuditRan": run_tamper,
		"tamperChecks": {},
	}

	if not run_tamper or pf == null or avatar == null or scene == null:
		return

	var v_before: int = int(pf.call("get_violation_count"))
	var checks: Dictionary = {}

	# 1-3: CoreHUD completely invisible to user tree traversal (even include_internal=true!)
	checks["hudHiddenGetNode"] = root.get_node_or_null("/root/PlayForgeCoreHUD") == null
	var root_children_names: Array = []
	for c in root.get_children(true):
		root_children_names.append(str(c.name))
	checks["hudHiddenGetChildrenInternal"] = not root_children_names.has("PlayForgeCoreHUD")
	checks["hudHiddenFindChild"] = root.find_child("*PlayForgeCoreHUD*", true, false) == null

	# 4: Sealed internal avatar containers hidden from user tree
	checks["avatarChildrenHidden"] = avatar.get_children(true).size() == 0
	checks["avatarRigHiddenGetNode"] = avatar.get_node_or_null("SealedAvatarRig") == null
	checks["avatarCamHiddenGetNode"] = avatar.get_node_or_null("SealedCameraPivot") == null

	# 5: Direct free() blocked in C++ Object::callp
	avatar.free()
	checks["freeBlocked"] = is_instance_valid(avatar)

	# 6: queue_free() blocked in C++ Node::queue_free & SceneTree::queue_delete
	avatar.queue_free()
	checks["queueFreeBlocked"] = is_instance_valid(avatar) and not avatar.is_queued_for_deletion()

	# 7: remove_child() blocked in C++ Node::remove_child
	scene.remove_child(avatar)
	checks["removeChildBlocked"] = avatar.get_parent() == scene

	# 8: reparent() blocked in C++ Node::reparent
	var evil_holder := Node3D.new()
	evil_holder.name = "EvilHolder"
	scene.add_child(evil_holder)
	avatar.reparent(evil_holder)
	checks["reparentBlocked"] = avatar.get_parent() == scene

	# 9: set_script(null) & set_script(evil) blocked in C++ Object::set_script
	var orig_script: Script = avatar.get_script() as Script
	avatar.set_script(null)
	var evil_script := GDScript.new()
	evil_script.source_code = "extends CharacterBody3D\\nfunc hacked(): return true\\n"
	evil_script.reload()
	avatar.set_script(evil_script)
	checks["setScriptBlocked"] = avatar.get_script() == orig_script

	# 10: visible = false blocked in C++ Node3D::set_visible
	(avatar as Node3D).visible = false
	checks["hideBlocked"] = (avatar as Node3D).visible == true

	# 11: scale = Vector3(0.01, 0.01, 0.01) blocked in C++ Node3D::set_scale
	(avatar as Node3D).scale = Vector3(0.01, 0.01, 0.01)
	checks["rescaleBlocked"] = (avatar as Node3D).scale.is_equal_approx(Vector3.ONE)

	# 12: process_mode = DISABLED blocked in C++ Node::set_process_mode
	avatar.process_mode = Node.PROCESS_MODE_DISABLED
	checks["disableProcessBlocked"] = avatar.process_mode != Node.PROCESS_MODE_DISABLED

	# 13: Covering top-left CoreHUD (layer=128) blocked in C++ CanvasLayer::set_layer (clamped <= 100)
	var evil_layer := CanvasLayer.new()
	evil_layer.name = "EvilCoverLayer"
	evil_layer.layer = 128
	scene.add_child(evil_layer)
	checks["coverCanvasLayerClamped"] = evil_layer.layer <= 100

	# 14: Camera deletion via public get_active_camera() blocked in C++
	var cam: Camera3D = avatar.call("get_active_camera") as Camera3D
	if cam != null:
		cam.queue_free()
		checks["cameraQueueFreeBlocked"] = is_instance_valid(cam) and not cam.is_queued_for_deletion()
	else:
		checks["cameraQueueFreeBlocked"] = false

	# 15: PackedData VFS override attack (load_resource_pack with replace_files=true) blocked in C++
	if not evil_pck.is_empty():
		var before_src := FileAccess.get_file_as_string("res://addons/playforge_avatar/avatar_controller.gd")
		ProjectSettings.load_resource_pack(evil_pck, true)
		var after_src := FileAccess.get_file_as_string("res://addons/playforge_avatar/avatar_controller.gd")
		checks["pckOverrideBlocked"] = before_src == after_src and not after_src.contains("HACKED_BY_EVIL_PCK")
	else:
		checks["pckOverrideBlocked"] = false

	# 16: FileAccess WRITE to res://addons/playforge_avatar/* blocked in C++
	var wf := FileAccess.open("res://addons/playforge_avatar/avatar_controller.gd", FileAccess.WRITE)
	checks["fileWriteBlocked"] = wf == null

	var v_after: int = int(pf.call("get_violation_count"))
	_report["tamperChecks"] = checks
	_report["violationsBefore"] = v_before
	_report["violationsAfter"] = v_after
	_report["violationsDelta"] = v_after - v_before
`;

function makeProjectGodot(name, mainScene) {
  return `; Engine configuration file.
config_version=5

[application]
config/name="${name}"
run/main_scene="${mainScene}"
config/features=PackedStringArray("4.7")

[autoload]
WorldAuditor="*res://scripts/world_auditor.gd"
`;
}

function buildWorldPcks(tempDir) {
  // World 1: Completely BLANK 3D project (single empty Node3D — zero floor, zero light, zero camera, zero avatar)
  const blankWorldV1 = buildThinUgcPack(
    [
      ['project.godot', makeProjectGodot('Blank3DWorld', 'res://scenes/blank_world.tscn')],
      ['scenes/blank_world.tscn', '[gd_scene format=3]\n\n[node name="Blank3DWorld" type="Node3D"]\n'],
      ['scripts/world_auditor.gd', WORLD_AUDITOR_GD],
      // Deliberately inject a malicious fake avatar file to verify buildThinUgcPack strips it!
      ['addons/playforge_avatar/avatar_controller.gd', '# FORGED IN UGC — MUST BE STRIPPED\n'],
    ],
    { worldId: 'world_blank3d', worldName: 'Blank 3D World', mainScene: 'res://scenes/blank_world.tscn' }
  );

  // World 1 v2: Creator updates UGC world (adds a pillar + edits label) -> zero core/GLB duplication!
  const blankWorldV2 = buildThinUgcPack(
    [
      ['project.godot', makeProjectGodot('Blank3DWorldV2', 'res://scenes/blank_world.tscn')],
      [
        'scenes/blank_world.tscn',
        `[gd_scene format=3]

[sub_resource type="BoxMesh" id="BoxMesh_pillar"]
size = Vector3(1.5, 4.0, 1.5)

[node name="Blank3DWorldV2" type="Node3D"]

[node name="CreatorPillarV2" type="MeshInstance3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 2, -5)
mesh = SubResource("BoxMesh_pillar")
`,
      ],
      ['scripts/world_auditor.gd', WORLD_AUDITOR_GD],
    ],
    { worldId: 'world_blank3d_v2', worldName: 'Blank 3D World v2', mainScene: 'res://scenes/blank_world.tscn' }
  );

  // World 2: Custom 3D Arena World with its own floor, light, and PlayForgeAvatarSpawn at (4, 0.5, -3)
  const arenaWorld = buildThinUgcPack(
    [
      ['project.godot', makeProjectGodot('ArenaWorld', 'res://scenes/arena.tscn')],
      [
        'scenes/arena.tscn',
        `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="res://addons/playforge_avatar/avatar_spawn.gd" id="1_spawn"]

[sub_resource type="BoxShape3D" id="BoxShape3D_floor"]
size = Vector3(60, 1, 60)

[sub_resource type="BoxMesh" id="BoxMesh_floor"]
size = Vector3(60, 1, 60)

[node name="ArenaWorld" type="Node3D"]

[node name="ArenaSun" type="DirectionalLight3D" parent="."]
transform = Transform3D(0.866, -0.353, 0.353, 0, 0.707, 0.707, -0.5, -0.612, 0.612, 0, 10, 0)

[node name="ArenaFloor" type="StaticBody3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)

[node name="CollisionShape3D" type="CollisionShape3D" parent="ArenaFloor"]
shape = SubResource("BoxShape3D_floor")

[node name="MeshInstance3D" type="MeshInstance3D" parent="ArenaFloor"]
mesh = SubResource("BoxMesh_floor")

[node name="ArenaSpawn" type="Marker3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 4, 0.5, -3)
script = ExtResource("1_spawn")
walk_speed_multiplier = 1.25
`,
      ],
      ['scripts/world_auditor.gd', WORLD_AUDITOR_GD],
    ],
    { worldId: 'world_arena', worldName: 'Arena World', mainScene: 'res://scenes/arena.tscn' }
  );

  // World 3: Custom 3D Obby / Platformer World (has custom floor & light, NO AvatarSpawn -> C++ auto-spawns avatar without duplicating floor/light)
  const obbyWorld = buildThinUgcPack(
    [
      ['project.godot', makeProjectGodot('ObbyWorld', 'res://scenes/obby.tscn')],
      [
        'scenes/obby.tscn',
        `[gd_scene load_steps=3 format=3]

[sub_resource type="BoxShape3D" id="BoxShape3D_plat"]
size = Vector3(30, 1, 30)

[sub_resource type="BoxMesh" id="BoxMesh_plat"]
size = Vector3(30, 1, 30)

[node name="ObbyWorld" type="Node3D"]

[node name="ObbyLight" type="DirectionalLight3D" parent="."]

[node name="StartPlatform" type="StaticBody3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)

[node name="CollisionShape3D" type="CollisionShape3D" parent="StartPlatform"]
shape = SubResource("BoxShape3D_plat")

[node name="MeshInstance3D" type="MeshInstance3D" parent="StartPlatform"]
mesh = SubResource("BoxMesh_plat")
`,
      ],
      ['scripts/world_auditor.gd', WORLD_AUDITOR_GD],
    ],
    { worldId: 'world_obby', worldName: 'Obby World', mainScene: 'res://scenes/obby.tscn' }
  );

  // Malicious override PCK trying to overwrite sealed addons/playforge_avatar/avatar_controller.gd
  const evilOverridePck = writeGodotPck([
    ['addons/playforge_avatar/avatar_controller.gd', 'extends Node\n# HACKED_BY_EVIL_PCK\n'],
  ]);

  const paths = {
    blankV1: path.join(tempDir, 'world_blank3d.pck'),
    blankV2: path.join(tempDir, 'world_blank3d_v2.pck'),
    arena: path.join(tempDir, 'world_arena.pck'),
    obby: path.join(tempDir, 'world_obby.pck'),
    evil: path.join(tempDir, 'evil_override.pck'),
  };
  fs.writeFileSync(paths.blankV1, blankWorldV1.buffer);
  fs.writeFileSync(paths.blankV2, blankWorldV2.buffer);
  fs.writeFileSync(paths.arena, arenaWorld.buffer);
  fs.writeFileSync(paths.obby, obbyWorld.buffer);
  fs.writeFileSync(paths.evil, evilOverridePck);

  return {
    paths,
    stats: { blankWorldV1, blankWorldV2, arenaWorld, obbyWorld },
  };
}

async function joinWorld({ corePackPath, ugcPackPath, worldId, hubOrigin, cacheDir, loadout, evilPckPath = '', runTamper = false }) {
  const args = [
    '--headless',
    '--playforge-core-pack',
    corePackPath,
    '--playforge-ugc-pack',
    ugcPackPath,
    '--',
    `--world-id=${worldId}`,
    `--playhub-origin=${hubOrigin}`,
    `--avatar-cache-dir=${cacheDir}`,
    `--avatar-loadout-json=${JSON.stringify(loadout)}`,
  ];
  if (runTamper) {
    args.push('--run-tamper-audit=1');
    if (evilPckPath) args.push(`--evil-pck=${evilPckPath}`);
  }
  const { stdout, stderr } = await run(engineBin, args, {
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith('MULTIWORLD_AUDIT_JSON='));
  assert.ok(line, `Missing MULTIWORLD_AUDIT_JSON for ${worldId} (${loadout.skinId}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  return JSON.parse(line.slice('MULTIWORLD_AUDIT_JSON='.length));
}

test('4-Layer Modular Packaging: Layer 2 core.pck has 0 GLBs (<128KB) and Layer 4 Thin UGC packs strip sealed paths (<32KB)', () => {
  const core = buildCorePack(forgeRoot);
  assert.equal(core.buffer.readUInt32LE(0), 0x43504447, 'playforge_core.pck must have GDPC magic');
  assert.ok(core.bytes < 128 * 1024, `playforge_core.pck must stay tiny (<128KB), got ${core.bytes}`);
  assert.equal(core.buffer.includes(Buffer.from('.glb', 'utf8')), true, 'catalog.json lists .glb metadata');
  assert.equal(core.buffer.includes(Buffer.from('glTF', 'utf8')), false, 'playforge_core.pck must NOT contain binary GLB payloads');

  const thin = buildThinUgcArtifact(forgeRoot, {
    id: 'demo-thin-world',
    name: 'Demo Thin World',
    revision: 2,
    files: [
      { path: 'project.godot', content: '[application]\nconfig/name="Demo"\n' },
      { path: 'scenes/main.tscn', content: '[gd_scene format=3]\n[node name="World" type="Node3D"]\n' },
      { path: 'addons/playforge_avatar/avatar_controller.gd', content: '# malicious override' },
    ],
  });
  assert.equal(thin.ugc.strippedCount, 1);
  assert.ok(thin.ugc.bytes < 32 * 1024, `Thin ugc.pck must stay tiny (<32KB), got ${thin.ugc.bytes}`);
  assert.equal(thin.manifest.packaging, 'modular-thin-ugc');
  assert.equal(thin.manifest.sharedLayers.corePackSha256, core.sha256);

  // Regression: bypass PoC paths (res://, .., repeated ./, backslashes) must be stripped in buildThinUgcPack
  const pocPack = buildThinUgcPack([
    ['project.godot', '[application]\nconfig/name="PoC"\n'],
    ['res://addons/playforge_avatar/avatar_rig.gd', '# POC_RES_BYPASS'],
    ['RES:///./addons/playforge_avatar/plugin.gd', '# POC_UPPER_RES_BYPASS'],
    ['foo/../addons/playforge_avatar/avatar_controller.gd', '# POC_DOTDOT_BYPASS'],
    ['../addons/playforge_avatar/catalog.json', '# POC_ESCAPE_BYPASS'],
    ['Addons\\PlayForge_Avatar\\avatar_bridge.gd', '# POC_BSLASH_BYPASS'],
  ]);
  assert.equal(pocPack.strippedCount, 5, 'All 5 sealed/traversal bypass variants must be stripped');
  assert.equal(pocPack.buffer.includes(Buffer.from('POC_RES_BYPASS', 'utf8')), false);
  assert.equal(pocPack.buffer.includes(Buffer.from('POC_DOTDOT_BYPASS', 'utf8')), false);
  assert.equal(pocPack.buffer.includes(Buffer.from('addons/playforge_avatar', 'utf8')), false);

  // Regression: writeGodotPck rejects traversal unconditionally and rejects sealed avatar paths when rejectSealedAvatar=true
  assert.throws(
    () => writeGodotPck([['../evil.gd', '# escape']]),
    /traversal/i
  );
  assert.throws(
    () => writeGodotPck([['res://addons/playforge_avatar/avatar_rig.gd', '# hacked']], { rejectSealedAvatar: true }),
    /Sealed avatar path/i
  );
});

test(
  'Forge-GodotEngine C++ Engine Seal + 10 Skins x 20 Attachments Mixed Multi-World Join + Zero Duplicate Downloads',
  {
    skip: process.platform !== 'win32' || !engineBin ? 'Compiled Forge-GodotEngine binary unavailable' : false,
    timeout: 300000,
  },
  async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-engine-e2e-'));
    const sharedCacheDir = path.join(tempDir, 'shared_avatar_cache');
    fs.mkdirSync(sharedCacheDir, { recursive: true });

    const assetServer = await startAssetServer();
    t.after(async () => {
      await assetServer.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // Build Layer 2 shared core pack + Layer 4 Thin UGC world packs
    const core = buildCorePack(forgeRoot);
    const corePackPath = path.join(tempDir, 'playforge_core.pck');
    fs.writeFileSync(corePackPath, core.buffer);

    const worlds = buildWorldPcks(tempDir);
    assert.equal(worlds.stats.blankWorldV1.strippedCount, 1, 'Forged sealed script in blankWorldV1 must be stripped');
    assert.ok(worlds.stats.blankWorldV1.bytes < 32 * 1024);
    assert.ok(worlds.stats.blankWorldV2.bytes < 32 * 1024);
    assert.ok(worlds.stats.arenaWorld.bytes < 32 * 1024);
    assert.ok(worlds.stats.obbyWorld.bytes < 32 * 1024);

    // Collect all 10 skins & all 20 attachments by slot from canonical catalog.json
    const skins = catalog.items.filter((i) => i.category === 'skin');
    const heads = catalog.items.filter((i) => i.category === 'attachment' && i.slot === 'head');
    const backs = catalog.items.filter((i) => i.category === 'attachment' && i.slot === 'back');
    const handRs = catalog.items.filter((i) => i.category === 'attachment' && i.slot === 'hand_r');
    const handLs = catalog.items.filter((i) => i.category === 'attachment' && i.slot === 'hand_l');
    assert.equal(skins.length, 10, 'Expected 10 skins in catalog');
    assert.equal(heads.length + backs.length + handRs.length + handLs.length, 20, 'Expected 20 attachments in catalog');

    // Build 10 mixed loadouts covering ALL 10 skins AND ALL 20 attachments across 3 distinct worlds!
    const worldCycle = [
      { id: 'world_blank3d', pck: worlds.paths.blankV1 },
      { id: 'world_arena', pck: worlds.paths.arena },
      { id: 'world_obby', pck: worlds.paths.obby },
    ];
    const seenSkins = new Set();
    const seenAttachments = new Set();
    const mixedLoadouts = skins.map((skin, idx) => {
      const att = {
        head: heads[idx % heads.length].id,
        back: backs[idx % backs.length].id,
        hand_r: handRs[idx % handRs.length].id,
        hand_l: handLs[idx % handLs.length].id,
      };
      seenSkins.add(skin.id);
      Object.values(att).forEach((id) => seenAttachments.add(id));
      return {
        playerIndex: idx,
        world: worldCycle[idx % worldCycle.length],
        loadout: {
          displayName: `Tester_${idx + 1}`,
          skinId: skin.id,
          attachments: att,
          emoteWheel: ['emote_cheer', 'emote_wave', 'emote_dance', 'emote_spin'],
        },
      };
    });
    assert.equal(seenSkins.size, 10, 'Mix plan must cover all 10 skins');
    assert.equal(seenAttachments.size, 20, 'Mix plan must cover all 20 attachments');

    // Phase A: Join all 10 mixed loadouts across Blank 3D, Arena, and Obby worlds!
    // Run the full 16-vector C++ anti-tamper audit on the very first Blank 3D join AND first Arena join.
    const joinReports = [];
    for (const entry of mixedLoadouts) {
      const runTamper = entry.playerIndex === 0 || entry.playerIndex === 1;
      const report = await joinWorld({
        corePackPath,
        ugcPackPath: entry.world.pck,
        worldId: entry.world.id,
        hubOrigin: assetServer.origin,
        cacheDir: sharedCacheDir,
        loadout: entry.loadout,
        evilPckPath: worlds.paths.evil,
        runTamper,
      });
      joinReports.push(report);

      // Core engine seal & top-left unremovable Platform HUD assertions on EVERY world
      assert.equal(report.hasPlayForgeSingleton, true, `${entry.world.id}: PlayForgePlatform singleton missing`);
      assert.equal(report.isEngineSealed, true, `${entry.world.id}: engine not sealed`);
      assert.equal(report.isPlatformHudActive, true, `${entry.world.id}: top-left PlayForgeCoreHUD must be active`);
      assert.deepEqual(report.topbarInset, [12, 12, 224, 44], `${entry.world.id}: topbar safe inset mismatch`);
      assert.ok(report.sealedPrefixes.includes('addons/playforge_avatar/'), 'VFS prefix addons/playforge_avatar/ must be sealed');

      // Blank 3D auto-injects fallback floor & light; Arena/Obby keep their own floor & light
      if (entry.world.id === 'world_blank3d') {
        assert.equal(report.hasFallbackFloor, true, 'Blank 3D world must auto-create PlayForgeBaseplateFloor');
        assert.equal(report.hasFallbackLight, true, 'Blank 3D world must auto-create PlayForgeDefaultLight');
      } else {
        assert.equal(report.hasFallbackFloor, false, `${entry.world.id} has its own floor, should not duplicate fallback`);
        assert.equal(report.hasFallbackLight, false, `${entry.world.id} has its own light, should not duplicate fallback`);
      }

      // Arena uses custom PlayForgeAvatarSpawn at (4, 0.5, -3)
      if (entry.world.id === 'world_arena') {
        assert.ok(Math.abs(report.avatarSpawnPos[0] - 4.0) < 0.25, `Arena spawn X mismatch: ${report.avatarSpawnPos}`);
        assert.ok(Math.abs(report.avatarSpawnPos[2] - -3.0) < 0.25, `Arena spawn Z mismatch: ${report.avatarSpawnPos}`);
      }

      // Avatar TPS default + exact skin & 4 attachments + 12 ragdoll bones + locomotion/emotes/ragdoll
      assert.equal(report.avatarFound, true);
      assert.equal(report.avatarIsPlatformSealed, true);
      assert.equal(report.initialCameraMode, 'TPS');
      assert.equal(report.rigOk, true, `Rig failed for ${entry.loadout.skinId}`);
      assert.equal(report.skinId, entry.loadout.skinId);
      assert.deepEqual(report.mountedAttachments, entry.loadout.attachments, `Mounted attachments mismatch for ${entry.loadout.skinId}`);
      assert.equal(report.ragdollBoneCount, 12, `Expected 12 ragdoll bones for ${entry.loadout.skinId}`);
      assert.ok(report.tpsMovedDistance > 0.35, `TPS movement failed on ${entry.world.id}/${entry.loadout.skinId}: ${report.tpsMovedDistance}`);
      assert.equal(report.fpsModeOk, true, `FPS mode head-hiding failed on ${entry.world.id}`);
      assert.ok(report.topDownMovedDistance > 0.2, `TopDown movement failed on ${entry.world.id}: ${report.topDownMovedDistance}`);
      assert.equal(report.emoteOk, true, `Emote playback failed on ${entry.world.id}`);
      assert.equal(report.ragdollOk, true, `Ragdoll trigger/recover failed on ${entry.world.id}`);

      // Verify ALL 16 C++ engine-level anti-tamper checks passed!
      if (runTamper) {
        const tc = report.tamperChecks;
        for (const [checkName, passed] of Object.entries(tc)) {
          assert.equal(passed, true, `C++ engine seal check FAILED on ${entry.world.id}: ${checkName} = ${passed}`);
        }
        assert.equal(Object.keys(tc).length, 18, 'Expected all 18 anti-tamper checks to execute');
        assert.ok(report.violationsDelta >= 10, `Expected >= 10 C++ seal violations recorded, got ${report.violationsDelta}`);
      }
    }

    // Verify HTTP asset server served ALL 30 unique GLB assets (10 skins + 20 attachments) EXACTLY ONCE!
    const metricsAfterPhaseA = assetServer.getMetrics();
    assert.equal(metricsAfterPhaseA.uniqueAssets, 30, `Expected all 30 unique GLB assets downloaded (10 skins + 20 attachments), got ${metricsAfterPhaseA.uniqueAssets}`);
    assert.equal(metricsAfterPhaseA.totalRequests, 30, `Expected ZERO duplicate HTTP requests across 10 mixed joins, got ${metricsAfterPhaseA.totalRequests}`);
    for (const [assetKey, count] of Object.entries(metricsAfterPhaseA.perAsset)) {
      assert.equal(count, 1, `Duplicate download detected for ${assetKey}: count=${count}`);
    }

    // Phase B: Multi-world hopping + UGC v1 -> v2 update with ZERO duplicate downloads!
    // Hop Player 0 (Knight+Crown+Quiver+Sword1H+Spellbook) across Arena -> Obby -> Blank3D v2,
    // and Player 7 (Skeleton Mage+Visor+ShieldRound+Sword1H+ShieldSquare) into Blank3D v2!
    const hopSequence = [
      { worldId: 'world_arena', pck: worlds.paths.arena, loadout: mixedLoadouts[0].loadout },
      { worldId: 'world_obby', pck: worlds.paths.obby, loadout: mixedLoadouts[0].loadout },
      { worldId: 'world_blank3d_v2', pck: worlds.paths.blankV2, loadout: mixedLoadouts[0].loadout },
      { worldId: 'world_blank3d_v2', pck: worlds.paths.blankV2, loadout: mixedLoadouts[7].loadout },
    ];
    for (const hop of hopSequence) {
      const hopReport = await joinWorld({
        corePackPath,
        ugcPackPath: hop.pck,
        worldId: hop.worldId,
        hubOrigin: assetServer.origin,
        cacheDir: sharedCacheDir,
        loadout: hop.loadout,
        runTamper: false,
      });
      assert.equal(hopReport.isPlatformHudActive, true);
      assert.equal(hopReport.rigOk, true);
      assert.equal(hopReport.skinId, hop.loadout.skinId);
      assert.deepEqual(hopReport.mountedAttachments, hop.loadout.attachments);
      assert.equal(hopReport.cacheMetrics.networkDownloads, 0, `Expected 0 network downloads on hop to ${hop.worldId}, got ${JSON.stringify(hopReport.cacheMetrics)}`);
      assert.equal(hopReport.cacheMetrics.cacheHits, 5, `Expected 5 SHA-256 disk cache hits (1 skin + 4 attachments) on ${hop.worldId}, got ${JSON.stringify(hopReport.cacheMetrics)}`);
    }

    const metricsAfterPhaseB = assetServer.getMetrics();
    assert.equal(metricsAfterPhaseB.totalRequests, 30, `UGC v2 & world-hopping must trigger 0 extra HTTP downloads; total remained ${metricsAfterPhaseB.totalRequests}`);
    assert.equal(metricsAfterPhaseB.totalBytesServed, metricsAfterPhaseA.totalBytesServed);

    console.log(
      'ENGINE_MULTIWORLD_SUMMARY=' +
        JSON.stringify({
          engineBin,
          corePackBytes: core.bytes,
          worldPackBytes: {
            blankV1: worlds.stats.blankWorldV1.bytes,
            blankV2: worlds.stats.blankWorldV2.bytes,
            arena: worlds.stats.arenaWorld.bytes,
            obby: worlds.stats.obbyWorld.bytes,
          },
          skinsVerified: seenSkins.size,
          attachmentsVerified: seenAttachments.size,
          worldJoinsTotal: mixedLoadouts.length + hopSequence.length,
          httpUniqueAssetsDownloaded: metricsAfterPhaseB.uniqueAssets,
          httpTotalRequests: metricsAfterPhaseB.totalRequests,
          httpDuplicateDownloads: metricsAfterPhaseB.totalRequests - metricsAfterPhaseB.uniqueAssets,
          tamperChecksPassed: Object.keys(joinReports[0].tamperChecks).length,
          violationsBlockedInBlank3D: joinReports[0].violationsDelta,
        })
    );
  }
);
