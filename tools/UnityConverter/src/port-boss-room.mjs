import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reportsPathsGd } from './godot-harness-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, '..');

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\r\n/g, '\n'), 'utf8');
}

function walkFiles(dir, skip = new Set()) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    if (e.name.endsWith('.import') || e.name.endsWith('.uid')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full, skip));
    else out.push(full);
  }
  return out;
}

function convertBossRoomTextures(srcTexDir, dstTexDir) {
  fs.mkdirSync(dstTexDir, { recursive: true });
  const pyScript = [
    'import os, sys, json',
    'from PIL import Image',
    'src_root, dst_root = sys.argv[1], sys.argv[2]',
    'converted_tga = []',
    'copied_png = []',
    'unpacked_mse = []',
    'for root, _, files in os.walk(src_root):',
    '    for f in sorted(files):',
    '        src = os.path.join(root, f)',
    '        low = f.lower()',
    '        if low.endswith(".tga"):',
    '            stem = os.path.splitext(f)[0]',
    '            dst = os.path.join(dst_root, stem + ".png")',
    '            im = Image.open(src)',
    '            if "MetalSmoothEmissive" in stem:',
    '                rgb = im.convert("RGB")',
    '                r, g, b = rgb.split()',
    '                r.save(os.path.join(dst_root, stem + "_metallic.png"))',
    '                rough = g.point(lambda v: 255 - v)',
    '                rough.save(os.path.join(dst_root, stem + "_roughness.png"))',
    '                # Unpack Emissive channel (B) into crimson-orange rune map',
    '                er = b',
    '                eg = b.point(lambda v: int(v * 0.22))',
    '                eb = b.point(lambda v: int(v * 0.05))',
    '                em = Image.merge("RGB", (er, eg, eb))',
    '                em.save(os.path.join(dst_root, stem + "_emissive.png"))',
    '                rgb.save(dst)',
    '                unpacked_mse.append(stem)',
    '            else:',
    '                im.convert("RGBA" if im.mode in ("RGBA", "LA") else "RGB").save(dst)',
    '            converted_tga.append(stem + ".png")',
    '        elif low.endswith(".png"):',
    '            dst = os.path.join(dst_root, f)',
    '            Image.open(src).save(dst)',
    '            copied_png.append(f)',
    'print(json.dumps({"convertedTga": len(converted_tga), "copiedPng": len(copied_png), "unpackedMse": unpacked_mse}))',
  ].join('\n');
  const out = execFileSync('python', ['-c', pyScript, srcTexDir, dstTexDir], {
    encoding: 'utf8',
  });
  return JSON.parse(out.trim());
}

export function portUnityBossRoom(inputDir, outputDir) {
  const srcAssets = path.join(inputDir, 'Assets');

  // 1. Copy 3D models (.fbx / .obj) for native Godot 4.7.2 ufbx import
  const modelsSrc = path.join(srcAssets, 'Models');
  const modelsDst = path.join(outputDir, 'assets', 'models');
  fs.mkdirSync(modelsDst, { recursive: true });
  const modelFiles = [];
  for (const full of walkFiles(modelsSrc)) {
    const ext = path.extname(full).toLowerCase();
    if (ext === '.fbx' || ext === '.obj') {
      const base = path.basename(full);
      fs.copyFileSync(full, path.join(modelsDst, base));
      modelFiles.push(base);
    }
  }

  // 2. Convert TGA textures -> PNG + unpack URP MetalSmoothEmissive channels
  const texStats = convertBossRoomTextures(
    path.join(srcAssets, 'Textures'),
    path.join(outputDir, 'assets', 'textures'),
  );

  // 3. Copy WAV audio clips (Boss Room stores audio under Assets/Sounds/)
  const audioSrc = path.join(srcAssets, 'Sounds');
  const audioDst = path.join(outputDir, 'assets', 'audio');
  fs.mkdirSync(audioDst, { recursive: true });
  const audioFiles = [];
  for (const full of walkFiles(audioSrc)) {
    if (path.extname(full).toLowerCase() === '.wav') {
      const base = path.basename(full);
      fs.copyFileSync(full, path.join(audioDst, base));
      audioFiles.push(base);
    }
  }

  // 4. Write project.godot (Godot 4.7.2 GL Compatibility, 1280x720)
  writeText(
    path.join(outputDir, 'project.godot'),
    `; Engine configuration file.
; Ported from Unity Official Sample: Boss Room (com.unity.multiplayer.samples.coop)
; Target: Godot 4.7.2

config_version=5

[application]

config/name="Boss Room 3D Co-op (Unity Port)"
run/main_scene="res://scenes/boss_room.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[autoload]

ActionBus="*res://scripts/network_action_bus.gd"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
lights_and_shadows/directional_shadow/size=4096
`,
  );

  // 5. scripts/network_action_bus.gd — Port of ServerActionPlayer / ClientActionPlayer / NetworkBehaviour RPCs
  writeText(
    path.join(outputDir, 'scripts', 'network_action_bus.gd'),
    `extends Node
## Port of Unity Boss Room Netcode Action System:
##   ServerActionPlayer.cs + ClientActionPlayer.cs + Action.cs + NetworkBehaviour RPCs.
## Uses Godot 4 @rpc("any_peer") / @rpc("authority") for server-authoritative action validation
## while seamlessly supporting local co-op host mode when running offline.

signal action_executed(actor_id: String, action_id: String, payload: Dictionary)
signal telegraph_started(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float)
signal state_synced(snapshot: Dictionary)

var is_server_authority: bool = true
var action_history: Array[Dictionary] = []
var total_rpc_dispatches: int = 0
var rejected_out_of_range: int = 0
var active_cooldowns: Dictionary = {}


func reset_session() -> void:
	action_history.clear()
	active_cooldowns.clear()
	total_rpc_dispatches = 0
	rejected_out_of_range = 0


func _process(delta: float) -> void:
	var expired: Array[String] = []
	for k in active_cooldowns.keys():
		var rem: float = float(active_cooldowns[k]) - delta
		if rem <= 0.0:
			expired.append(str(k))
		else:
			active_cooldowns[k] = rem
	for k in expired:
		active_cooldowns.erase(k)


func is_on_cooldown(actor_id: String, action_id: String) -> bool:
	var key := actor_id + ":" + action_id
	return active_cooldowns.has(key) and float(active_cooldowns[key]) > 0.0


func get_cooldown_remaining(actor_id: String, action_id: String) -> float:
	var key := actor_id + ":" + action_id
	return float(active_cooldowns.get(key, 0.0))


func request_action(actor_id: String, action_id: String, payload: Dictionary = {}, cooldown_sec: float = 0.0, max_range: float = -1.0) -> bool:
	if multiplayer != null and multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		_server_receive_action_rpc.rpc_id(1, actor_id, action_id, payload, cooldown_sec, max_range)
		return true
	return _server_validate_and_dispatch(actor_id, action_id, payload, cooldown_sec, max_range)


@rpc("any_peer", "call_local", "reliable")
func _server_receive_action_rpc(actor_id: String, action_id: String, payload: Dictionary, cooldown_sec: float, max_range: float) -> void:
	_server_validate_and_dispatch(actor_id, action_id, payload, cooldown_sec, max_range)


func _server_validate_and_dispatch(actor_id: String, action_id: String, payload: Dictionary, cooldown_sec: float, max_range: float) -> bool:
	if is_on_cooldown(actor_id, action_id):
		return false
	# Cheat-prevention range check ported from Unity AOEAction.cs (k_MaxDistanceDivergence = 1.0)
	if max_range > 0.0 and payload.has("origin") and payload.has("target_pos"):
		var dist: float = (payload["origin"] as Vector3).distance_to(payload["target_pos"] as Vector3)
		if dist > max_range + 1.0:
			rejected_out_of_range += 1
			return false
	if cooldown_sec > 0.0:
		active_cooldowns[actor_id + ":" + action_id] = cooldown_sec
	total_rpc_dispatches += 1
	action_history.append({
		"seq": total_rpc_dispatches,
		"actor": actor_id,
		"action": action_id,
		"time": Time.get_ticks_msec() / 1000.0,
	})
	if action_history.size() > 200:
		action_history.pop_front()
	if multiplayer != null and multiplayer.has_multiplayer_peer():
		_client_play_action_rpc.rpc(actor_id, action_id, payload)
	else:
		_client_play_action_rpc(actor_id, action_id, payload)
	return true


@rpc("authority", "call_local", "reliable")
func _client_play_action_rpc(actor_id: String, action_id: String, payload: Dictionary) -> void:
	action_executed.emit(actor_id, action_id, payload)


func broadcast_telegraph(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float) -> void:
	total_rpc_dispatches += 1
	if multiplayer != null and multiplayer.has_multiplayer_peer():
		_client_telegraph_rpc.rpc(actor_id, telegraph_type, origin, direction, radius, duration)
	else:
		_client_telegraph_rpc(actor_id, telegraph_type, origin, direction, radius, duration)


@rpc("authority", "call_local", "reliable")
func _client_telegraph_rpc(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float) -> void:
	telegraph_started.emit(actor_id, telegraph_type, origin, direction, radius, duration)


func sync_world_state(snapshot: Dictionary) -> void:
	state_synced.emit(snapshot)
`,
  );

  // 6. scripts/character_visual.gd — Instantiates Unity CharacterSet.fbx with exact per-class meshes & original textures
  writeText(
    path.join(outputDir, 'scripts', 'character_visual.gd'),
    `extends Node3D
class_name CharacterVisual
## Instantiates Unity Boss Room's CharacterSet.fbx, isolates the exact meshes for
## Tank, Archer, Mage, Rogue, Imp, or Boss, binds the converted original PNG textures,
## and animates walk bob, attack swing, shield raise, dash lean, hit flash, and stun wobble.

const CHARACTER_SET_PATH := "res://assets/models/CharacterSet.fbx"
const TEX_DIR := "res://assets/textures/"

static var _cached_scene: PackedScene = null
static var _tex_cache: Dictionary = {}

const ROLE_MESHES := {
	"tank": [
		"Tank_Torso_Boy", "Tank_Head_Boy", "Tank_Hair_Boy", "Tank_Eyes_Boy",
		"Tank_Mouth_Boy", "Tank_Ears_Boy", "Tank_Glove_Lt_Boy", "Tank_Glove_Rt_Boy",
		"Gear_LS_Tank_ShoulderPad_Boy", "Gear_RS_Tank_ShoulderPad_Boy",
		"Tank_Shield_Boy", "Tank_Weapon_Boy",
	],
	"archer": [
		"Archer_Torso_Boy", "Archer_Head_Boy", "Archer_Hair_Boy", "Archer_Eyes_Boy",
		"Archer_Mouth_Boy", "Archer_Ears_Boy", "Archer_Hand_Lt_Boy", "Archer_Hand_Rt_Boy",
		"Gear_LS_Archer_Quiver_Boy", "Archer_weapon_Boy",
	],
	"mage": [
		"Mage_Torso_Girl", "Mage_Head_Girl", "Mage_Hair_Girl", "Mage_Eyes_Girl",
		"Mage_Mouth_Girl", "Mage_Ears_Girl", "Mage_Hand_Lt1_Girl", "Mage_Hand_Rt_Girl",
		"Mage_Weapon_Girl",
	],
	"rogue": [
		"Rogue_Torso_Boy", "Rogue_Head_Boy", "Rogue_Hair_Boy", "Rogue_Eyes_Boy",
		"Rogue_Mouth_Boy", "Rogue_Ears_Boy", "Rogue_Hand_Lt_Boy", "Rogue_Hand_Rt_Boy",
		"Rogue_Weapon_Boy",
	],
	"imp": [
		"Imp_Torso", "Imp_Head", "Imp_Eyes", "Imp_Mouth", "Imp_Ears",
		"Imp_Glove_Lt", "Imp_Glove_Rt", "Gear_LS_Boss_ShoulderPad_Imp", "Imp_WeaponR",
	],
	"boss": [
		"Boss_Torso", "Boss_Cape", "Boss_Head", "Boss_Eyes", "Boss_Mouth", "Boss_Ears",
		"Boss_Helmet", "Boss_Glove_Lt", "Boss_Glove_Rt",
		"Gear_LS_Boss_ShoulderPad_Boss", "Gear_RS_Boss_ShoulderPad_Boss",
		"Boss_WeaponL", "Boss_WeaponR",
	],
}

var role_id: String = "tank"
var model_pivot: Node3D = null
var skeleton: Skeleton3D = null
var active_meshes: Array[MeshInstance3D] = []
var original_mats: Array[StandardMaterial3D] = []
var hit_flash_timer: float = 0.0
var attack_anim_timer: float = 0.0
var walk_phase: float = 0.0
var shield_raised: bool = false
var is_stunned: bool = false
var is_downed: bool = false
var base_scale: float = 1.0


static func _get_tex(file_name: String) -> Texture2D:
	if _tex_cache.has(file_name):
		return _tex_cache[file_name] as Texture2D
	var full := TEX_DIR + file_name
	var tex: Texture2D = load(full) as Texture2D
	_tex_cache[file_name] = tex
	return tex


func setup(p_role: String, p_scale: float = 1.0) -> void:
	role_id = p_role.to_lower()
	base_scale = p_scale

	if _cached_scene == null:
		_cached_scene = load(CHARACTER_SET_PATH) as PackedScene

	model_pivot = Node3D.new()
	model_pivot.name = "ModelPivot"
	model_pivot.scale = Vector3.ONE * base_scale
	add_child(model_pivot)

	var inst: Node = _cached_scene.instantiate()
	model_pivot.add_child(inst)

	var keep_list: Array = ROLE_MESHES.get(role_id, ROLE_MESHES["tank"])
	var keep_set: Dictionary = {}
	for m_name in keep_list:
		keep_set[str(m_name)] = true

	_filter_and_texture(inst, keep_set)


func _filter_and_texture(node: Node, keep_set: Dictionary) -> void:
	if node is AnimationPlayer:
		var ap: AnimationPlayer = node
		ap.stop()
	elif node is Skeleton3D:
		skeleton = node
	elif node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if keep_set.has(mi.name):
			mi.visible = true
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			var mat: StandardMaterial3D = _build_material_for_mesh(mi.name)
			mi.material_override = mat
			active_meshes.append(mi)
			original_mats.append(mat)
		else:
			mi.visible = false
	for child in node.get_children():
		_filter_and_texture(child, keep_set)


func _build_material_for_mesh(mesh_name: String) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.roughness = 0.62
	mat.metallic = 0.08
	mat.cull_mode = BaseMaterial3D.CULL_BACK

	var low := mesh_name.to_lower()
	var tex_file := ""

	# Eyes & Mouth sprite-sheet overlays
	if low.contains("eyes"):
		var is_enemy := role_id == "boss" or role_id == "imp"
		tex_file = "Enemy_Eyes.png" if is_enemy else "Hero_Eyes.png"
		mat.albedo_texture = _get_tex(tex_file)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_OPAQUE_ONLY
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		if role_id == "boss":
			# Signature glowing fiery eyes on Imp Boss
			mat.albedo_color = Color(1.0, 0.85, 0.25)
			mat.emission_enabled = true
			mat.emission = Color(1.0, 0.28, 0.05)
			mat.emission_energy_multiplier = 3.2
		return mat

	if low.contains("mouth"):
		var is_enemy := role_id == "boss" or role_id == "imp"
		tex_file = "Enemy_Mouths.png" if is_enemy else "Hero_Mouths.png"
		mat.albedo_texture = _get_tex(tex_file)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		return mat

	# Per-role original Unity textures
	match role_id:
		"tank":
			if low.contains("hair"):
				tex_file = "Tank_Hair_Boy_CLR.png"
			elif low.contains("head") or low.contains("ears"):
				tex_file = "Tank_Head_Boy_CLR.png"
			elif low.contains("weapon") or low.contains("shield"):
				tex_file = "Tank_Weapon_CLR.png"
				mat.metallic = 0.45
				mat.roughness = 0.35
			else:
				tex_file = "Tank_Torso_CLR.png"
				mat.metallic = 0.22
		"archer":
			if low.contains("hair"):
				tex_file = "Archer_Hair_Boy_CLR.png"
			elif low.contains("head") or low.contains("ears"):
				tex_file = "Archer_Head_Boy_CLR.png"
			elif low.contains("weapon") or low.contains("quiver"):
				tex_file = "Archer_Weapons_CLR.png"
			else:
				tex_file = "Archer_Torso_CLR.png"
		"mage":
			if low.contains("hair"):
				tex_file = "Mage_Hair_Girl_CLR.png"
			elif low.contains("head") or low.contains("ears"):
				tex_file = "Mage_Head_Girl_CLR.png"
			elif low.contains("weapon"):
				tex_file = "Mage_Weapons_CLR.png"
				mat.emission_enabled = true
				mat.emission = Color(0.25, 0.85, 1.0)
				mat.emission_energy_multiplier = 0.65
			else:
				tex_file = "Mage_Torso_CLR_Girl.png"
		"rogue":
			if low.contains("hair"):
				tex_file = "Rogue_Hair_Boy_CLR.png"
			elif low.contains("head") or low.contains("ears"):
				tex_file = "Rogue_Head_Boy_CLR.png"
			elif low.contains("weapon"):
				tex_file = "Rogue_Weapon_CLR.png"
				mat.metallic = 0.55
				mat.roughness = 0.3
			else:
				tex_file = "Rogue_Torso_CLR.png"
		"imp":
			if low.contains("head") or low.contains("ears"):
				tex_file = "Imp_Head_CLR.png"
			elif low.contains("helmet"):
				tex_file = "Imp_Helmet_CLR.png"
			elif low.contains("weapon"):
				tex_file = "Imp_Weapons_CLR.png"
			else:
				tex_file = "Imp_Torso_CLR.png"
		"boss":
			if low.contains("helmet"):
				tex_file = "Imp_Helmet_CLR.png"
				mat.metallic = 0.48
				mat.roughness = 0.34
			elif low.contains("head") or low.contains("ears"):
				tex_file = "Boss_Head_CLR.png"
			elif low.contains("weapon"):
				tex_file = "Imp_Weapons_CLR.png"
				mat.metallic = 0.52
				mat.roughness = 0.32
			else:
				tex_file = "Boss_Torso_CLR.png"
				mat.metallic = 0.25
				mat.roughness = 0.45

	if tex_file != "":
		var tex: Texture2D = _get_tex(tex_file)
		if tex != null:
			mat.albedo_texture = tex
	return mat


func trigger_attack(duration: float = 0.32) -> void:
	attack_anim_timer = duration


func trigger_hit_flash(duration: float = 0.09) -> void:
	hit_flash_timer = duration


func animate(delta: float, move_speed: float, charging: bool = false) -> void:
	if model_pivot == null:
		return

	if move_speed > 0.15:
		walk_phase += delta * (9.5 if not charging else 16.0)
	else:
		walk_phase += delta * 2.4

	var bob_y: float = absf(sin(walk_phase)) * (0.14 if move_speed > 0.15 else 0.03)
	var pitch_x: float = 0.0
	var roll_z: float = sin(walk_phase) * (0.07 if move_speed > 0.15 else 0.012)
	var yaw_y: float = 0.0

	if attack_anim_timer > 0.0:
		attack_anim_timer = maxf(0.0, attack_anim_timer - delta)
		var t: float = attack_anim_timer / 0.32
		pitch_x += sin(t * PI) * 0.36
		yaw_y += sin(t * PI * 2.0) * 0.28

	if charging:
		pitch_x += 0.28
		bob_y *= 1.35

	if shield_raised:
		pitch_x -= 0.12
		bob_y *= 0.3

	if is_stunned:
		roll_z = sin(walk_phase * 4.5) * 0.22
		pitch_x = -0.18
		bob_y = 0.0

	if is_downed:
		pitch_x = -1.35
		bob_y = -0.35
		roll_z = 0.0

	model_pivot.position.y = lerpf(model_pivot.position.y, bob_y, minf(1.0, delta * 14.0))
	model_pivot.rotation = Vector3(
		lerpf(model_pivot.rotation.x, pitch_x, minf(1.0, delta * 16.0)),
		lerpf(model_pivot.rotation.y, yaw_y, minf(1.0, delta * 16.0)),
		lerpf(model_pivot.rotation.z, roll_z, minf(1.0, delta * 16.0))
	)

	if hit_flash_timer > 0.0:
		hit_flash_timer = maxf(0.0, hit_flash_timer - delta)
		var flash_on := hit_flash_timer > 0.0
		for i in active_meshes.size():
			var mat: StandardMaterial3D = original_mats[i]
			if mat.shading_mode == BaseMaterial3D.SHADING_MODE_UNSHADED:
				continue
			if flash_on:
				mat.emission_enabled = true
				mat.emission = Color(0.9, 0.2, 0.12)
				mat.emission_energy_multiplier = 0.42
			else:
				var is_mage_staff := role_id == "mage" and active_meshes[i].name.to_lower().contains("weapon")
				mat.emission_enabled = is_mage_staff
				if is_mage_staff:
					mat.emission = Color(0.25, 0.85, 1.0)
					mat.emission_energy_multiplier = 0.65
`,
  );

  // 7. scripts/dungeon_builder.gd — Assembles Unity DungeonPieces.FBX + boss_door + floor_switch + chest + PBR rune materials
  writeText(
    path.join(outputDir, 'scripts', 'dungeon_builder.gd'),
    `extends Node3D
class_name DungeonBuilder
## Builds the Boss Room dungeon directly from Unity's DungeonPieces.FBX, door_boss_ani.FBX,
## floor_switch_ani.FBX, and chest_ani.FBX with unpacked PBR MetalSmoothEmissive materials.

const DUNGEON_PIECES_PATH := "res://assets/models/DungeonPieces.FBX"
const DOOR_BOSS_PATH := "res://assets/models/door_boss_ani.FBX"
const FLOOR_SWITCH_PATH := "res://assets/models/floor_switch_ani.FBX"
const CHEST_PATH := "res://assets/models/chest_ani.FBX"
const TEX_DIR := "res://assets/textures/"

var boss_arena_mat: StandardMaterial3D = null
var env_deco_mat: StandardMaterial3D = null
var portal_mat: StandardMaterial3D = null
var switch_glow_mat: StandardMaterial3D = null
var chest_glow_mat: StandardMaterial3D = null

var door_node: Node3D = null
var door_anim: AnimationPlayer = null
var door_portal_mesh: MeshInstance3D = null
var switch_node: Node3D = null
var switch_anim: AnimationPlayer = null
var chest_node: Node3D = null
var chest_anim: AnimationPlayer = null
var chest_light: OmniLight3D = null
var torch_lights: Array[OmniLight3D] = []
var torch_flames: Array[MeshInstance3D] = []
var arrow_mesh_template: Mesh = null
var flicker_time: float = 0.0


func build_dungeon() -> void:
	_create_materials()

	var pieces_scene: PackedScene = load(DUNGEON_PIECES_PATH) as PackedScene
	var pieces_inst: Node = pieces_scene.instantiate()
	var mesh_map: Dictionary = {}
	_extract_meshes(pieces_inst, mesh_map)

	if mesh_map.has("fx_arrrow"):
		arrow_mesh_template = mesh_map["fx_arrrow"] as Mesh

	# 1. Boss Arena Floor (boss_floor: AABB P=(-36,-0.05,0) S=(36,0.1,44) -> center at (0, 0, 0))
	if mesh_map.has("boss_floor"):
		var floor_mi := MeshInstance3D.new()
		floor_mi.name = "BossArenaFloor"
		floor_mi.mesh = mesh_map["boss_floor"] as Mesh
		floor_mi.position = Vector3(18.0, 0.0, -22.0)
		floor_mi.material_override = boss_arena_mat
		floor_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(floor_mi)

	# 2. Entrance Corridor Floor (boss_floor_2: AABB P=(-16,-0.02,-12) S=(16,0.76,28) -> placed at Z=+22..+44)
	if mesh_map.has("boss_floor_2"):
		var entry_mi := MeshInstance3D.new()
		entry_mi.name = "EntranceFloor"
		entry_mi.mesh = mesh_map["boss_floor_2"] as Mesh
		entry_mi.position = Vector3(8.0, -0.32, 26.0)
		entry_mi.material_override = boss_arena_mat
		entry_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(entry_mi)

	# Subtle safety stone base beneath corridors so no void shows at outer corners
	var under_floor := MeshInstance3D.new()
	under_floor.name = "DungeonSubFloor"
	var uf_box := BoxMesh.new()
	uf_box.size = Vector3(68.0, 0.4, 84.0)
	under_floor.mesh = uf_box
	under_floor.position = Vector3(0.0, -0.35, 8.0)
	var uf_mat := StandardMaterial3D.new()
	uf_mat.albedo_color = Color(0.08, 0.09, 0.13)
	uf_mat.roughness = 0.92
	under_floor.material_override = uf_mat
	add_child(under_floor)

	# 3. Dungeon Perimeter Stone Walls (wall1_base_straight_1 spans 4m along local Z -> rot 90 for X-lines, 0 for Z-lines)
	_build_wall_line(mesh_map, Vector3(-16.0, 0.0, -17.5), Vector3(1.0, 0.0, 0.0), 9, 90.0)
	_build_wall_line(mesh_map, Vector3(-17.5, 0.0, -16.0), Vector3(0.0, 0.0, 1.0), 9, 0.0)
	_build_wall_line(mesh_map, Vector3(17.5, 0.0, -16.0), Vector3(0.0, 0.0, 1.0), 9, 180.0)
	# South wall flanking Boss Door (leave central doorway at X=-5..+5, Z=+17.5)
	_build_wall_line(mesh_map, Vector3(-16.0, 0.0, 17.5), Vector3(1.0, 0.0, 0.0), 3, -90.0)
	_build_wall_line(mesh_map, Vector3(8.0, 0.0, 17.5), Vector3(1.0, 0.0, 0.0), 3, -90.0)
	# Entrance corridor side walls
	_build_wall_line(mesh_map, Vector3(-8.5, 0.0, 19.0), Vector3(0.0, 0.0, 1.0), 5, 0.0)
	_build_wall_line(mesh_map, Vector3(8.5, 0.0, 19.0), Vector3(0.0, 0.0, 1.0), 5, 180.0)

	# 4. Pillars framing the Boss Arena (Pillar_LOD0 / Pillar2_LOD0)
	var pillar_mesh: Mesh = mesh_map.get("Pillar_LOD0", null) as Mesh
	if pillar_mesh != null:
		var pillar_positions: Array[Vector3] = [
			Vector3(-12.5, 0.0, -12.5), Vector3(12.5, 0.0, -12.5),
			Vector3(-13.5, 0.0, 0.0), Vector3(13.5, 0.0, 0.0),
			Vector3(-12.5, 0.0, 12.5), Vector3(12.5, 0.0, 12.5),
		]
		for p_pos in pillar_positions:
			var p_mi := MeshInstance3D.new()
			p_mi.mesh = pillar_mesh
			p_mi.position = p_pos + Vector3(1.9, 0.0, 1.4)
			p_mi.material_override = env_deco_mat
			p_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			add_child(p_mi)

	# 5. Giant Red Boss Banners (banner_LOD0) on North wall behind Treasure Chest & side walls
	var banner_mesh: Mesh = mesh_map.get("banner_LOD0", null) as Mesh
	if banner_mesh != null:
		var b_center := MeshInstance3D.new()
		b_center.name = "BossBannerCenter"
		b_center.mesh = banner_mesh
		b_center.position = Vector3(0.0, 1.8, -16.2)
		b_center.scale = Vector3(1.05, 1.05, 1.05)
		b_center.material_override = env_deco_mat
		add_child(b_center)

		for side_x in [-11.0, 11.0]:
			var b_side := MeshInstance3D.new()
			b_side.mesh = banner_mesh
			b_side.position = Vector3(float(side_x), 2.1, -16.1)
			b_side.scale = Vector3(0.68, 0.68, 0.68)
			b_side.material_override = env_deco_mat
			add_child(b_side)

	# 6. Braziers / Torches (torch2) with warm flickering fire flames & OmniLight3D
	var torch_mesh: Mesh = mesh_map.get("torch2", mesh_map.get("torch", null)) as Mesh
	var torch_positions: Array[Vector3] = [
		Vector3(-5.8, 0.0, -14.2),
		Vector3(5.8, 0.0, -14.2),
		Vector3(-13.8, 0.0, -6.0),
		Vector3(13.8, 0.0, -6.0),
		Vector3(-13.8, 0.0, 7.5),
		Vector3(13.8, 0.0, 7.5),
		Vector3(-6.2, 0.0, 23.5),
		Vector3(6.2, 0.0, 23.5),
	]
	for t_pos in torch_positions:
		_spawn_torch(torch_mesh, t_pos)

	# 7. Dungeon Clay Pots (pot2_LOD0)
	var pot_mesh: Mesh = mesh_map.get("pot2_LOD0", null) as Mesh
	if pot_mesh != null:
		for pot_pos in [
			Vector3(-9.5, 0.0, -14.5), Vector3(-8.0, 0.0, -15.0),
			Vector3(9.2, 0.0, -14.6), Vector3(-6.8, 0.0, 26.2), Vector3(6.6, 0.0, 26.5),
		]:
			var pot := MeshInstance3D.new()
			pot.mesh = pot_mesh
			pot.position = pot_pos
			pot.scale = Vector3.ONE * 0.72
			pot.material_override = env_deco_mat
			add_child(pot)

	# 8. Crystal Pedestals flanking the Boss Door (door_crystral_base + glowing magenta crystal)
	var crystal_base: Mesh = mesh_map.get("door_crystral_base", null) as Mesh
	for cx in [-6.0, 6.0]:
		_spawn_crystal_pedestal(crystal_base, Vector3(float(cx), 0.0, 15.6))

	# 9. Animated Boss Door (door_boss_ani.FBX) at Z = +17.5
	_spawn_boss_door()

	# 10. Animated Floor Switch (floor_switch_ani.FBX) in Entrance Corridor at Z = +25.5
	_spawn_floor_switch()

	# 11. Animated Treasure Chest (chest_ani.FBX) on North Dais at Z = -13.4
	_spawn_treasure_chest()

	pieces_inst.free()


func _create_materials() -> void:
	boss_arena_mat = StandardMaterial3D.new()
	boss_arena_mat.albedo_texture = load(TEX_DIR + "env_deco_boss_arena_BaseColor.png") as Texture2D
	boss_arena_mat.albedo_color = Color(0.86, 0.88, 0.96)
	boss_arena_mat.normal_enabled = true
	boss_arena_mat.normal_texture = load(TEX_DIR + "env_deco_boss_arena_Normal.png") as Texture2D
	boss_arena_mat.normal_scale = 1.15
	boss_arena_mat.roughness_texture = load(TEX_DIR + "env_deco_boss_arena_MetalSmoothEmissive_roughness.png") as Texture2D
	boss_arena_mat.roughness = 0.88
	boss_arena_mat.emission_enabled = true
	boss_arena_mat.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
	boss_arena_mat.emission = Color(1.0, 0.25, 0.08)
	boss_arena_mat.emission_texture = load(TEX_DIR + "env_deco_boss_arena_MetalSmoothEmissive_emissive.png") as Texture2D
	boss_arena_mat.emission_energy_multiplier = 3.6

	env_deco_mat = StandardMaterial3D.new()
	env_deco_mat.albedo_texture = load(TEX_DIR + "env_deco_BaseColor.png") as Texture2D
	env_deco_mat.albedo_color = Color(0.9, 0.88, 0.92)
	env_deco_mat.normal_enabled = true
	env_deco_mat.normal_texture = load(TEX_DIR + "env_deco_Normal.png") as Texture2D
	env_deco_mat.normal_scale = 1.1
	env_deco_mat.metallic_texture = load(TEX_DIR + "env_deco_MetalSmoothEmissive_metallic.png") as Texture2D
	env_deco_mat.metallic = 0.25
	env_deco_mat.roughness_texture = load(TEX_DIR + "env_deco_MetalSmoothEmissive_roughness.png") as Texture2D
	env_deco_mat.roughness = 0.82

	portal_mat = StandardMaterial3D.new()
	portal_mat.albedo_color = Color(0.95, 0.28, 0.92, 0.88)
	portal_mat.emission_enabled = true
	portal_mat.emission = Color(1.0, 0.25, 0.95)
	portal_mat.emission_energy_multiplier = 4.2
	portal_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	portal_mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	switch_glow_mat = StandardMaterial3D.new()
	switch_glow_mat.albedo_color = Color(0.25, 0.75, 1.0, 0.7)
	switch_glow_mat.emission_enabled = true
	switch_glow_mat.emission = Color(0.25, 0.8, 1.0)
	switch_glow_mat.emission_energy_multiplier = 2.4
	switch_glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

	chest_glow_mat = StandardMaterial3D.new()
	chest_glow_mat.albedo_color = Color(1.0, 0.88, 0.35, 0.85)
	chest_glow_mat.emission_enabled = true
	chest_glow_mat.emission = Color(1.0, 0.82, 0.25)
	chest_glow_mat.emission_energy_multiplier = 3.5
	chest_glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA


func _extract_meshes(node: Node, out: Dictionary) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null and not out.has(mi.name):
			out[mi.name] = mi.mesh
	for c in node.get_children():
		_extract_meshes(c, out)


func _build_wall_line(mesh_map: Dictionary, start: Vector3, step_dir: Vector3, count: int, rot_y_deg: float) -> void:
	var base_mesh: Mesh = mesh_map.get("wall1_base_straight_1", null) as Mesh
	var top_mesh: Mesh = mesh_map.get("wall1_top_straight_1", null) as Mesh
	if base_mesh == null:
		return
	for i in count:
		var pos := start + step_dir * (float(i) * 4.0)
		var base_mi := MeshInstance3D.new()
		base_mi.mesh = base_mesh
		base_mi.position = pos
		base_mi.rotation_degrees = Vector3(0.0, rot_y_deg, 0.0)
		base_mi.material_override = env_deco_mat
		add_child(base_mi)
		if top_mesh != null:
			var top_mi := MeshInstance3D.new()
			top_mi.mesh = top_mesh
			top_mi.position = pos + Vector3(0.0, 4.0, 0.0)
			top_mi.rotation_degrees = Vector3(0.0, rot_y_deg, 0.0)
			top_mi.material_override = env_deco_mat
			add_child(top_mi)


func _spawn_torch(torch_mesh: Mesh, pos: Vector3) -> void:
	var holder := Node3D.new()
	holder.position = pos
	add_child(holder)

	if torch_mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = torch_mesh
		mi.material_override = env_deco_mat
		holder.add_child(mi)

	var flame := MeshInstance3D.new()
	var cone := CylinderMesh.new()
	cone.top_radius = 0.04
	cone.bottom_radius = 0.56
	cone.height = 1.55
	cone.radial_segments = 12
	flame.mesh = cone
	flame.position = Vector3(0.0, 3.3, 0.0)
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(1.0, 0.65, 0.14)
	fmat.emission_enabled = true
	fmat.emission = Color(1.0, 0.48, 0.08)
	fmat.emission_energy_multiplier = 3.2
	fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame.material_override = fmat
	holder.add_child(flame)
	torch_flames.append(flame)

	var light := OmniLight3D.new()
	light.position = Vector3(0.0, 3.8, 0.0)
	light.light_color = Color(1.0, 0.52, 0.16)
	light.light_energy = 2.3
	light.omni_range = 14.0
	light.omni_attenuation = 1.45
	light.shadow_enabled = false
	holder.add_child(light)
	torch_lights.append(light)


func _spawn_crystal_pedestal(base_mesh: Mesh, pos: Vector3) -> void:
	var root := Node3D.new()
	root.position = pos
	add_child(root)
	if base_mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = base_mesh
		mi.material_override = env_deco_mat
		root.add_child(mi)
	var crystal := MeshInstance3D.new()
	var prism := CylinderMesh.new()
	prism.top_radius = 0.02
	prism.bottom_radius = 0.45
	prism.height = 1.35
	prism.radial_segments = 6
	crystal.mesh = prism
	crystal.position = Vector3(0.0, 2.35, 0.0)
	crystal.material_override = portal_mat
	root.add_child(crystal)
	var cl := OmniLight3D.new()
	cl.position = Vector3(0.0, 2.6, 0.0)
	cl.light_color = Color(0.95, 0.3, 1.0)
	cl.light_energy = 3.0
	cl.omni_range = 10.0
	root.add_child(cl)


func _spawn_boss_door() -> void:
	var ps: PackedScene = load(DOOR_BOSS_PATH) as PackedScene
	door_node = Node3D.new()
	door_node.name = "BossDoor"
	door_node.position = Vector3(0.0, 0.0, 17.4)
	door_node.scale = Vector3(0.85, 0.85, 0.85)
	add_child(door_node)

	var inst: Node = ps.instantiate()
	door_node.add_child(inst)
	_apply_mat_recursive(inst, env_deco_mat)
	door_anim = _find_anim_player(inst)
	if door_anim != null:
		door_anim.stop()

	# Glowing magenta energy portal veil inside the Boss Door archway
	door_portal_mesh = MeshInstance3D.new()
	var plane := BoxMesh.new()
	plane.size = Vector3(5.6, 6.2, 0.45)
	door_portal_mesh.mesh = plane
	door_portal_mesh.position = Vector3(0.0, 3.1, 0.0)
	door_portal_mesh.material_override = portal_mat
	door_node.add_child(door_portal_mesh)

	var portal_light := OmniLight3D.new()
	portal_light.position = Vector3(0.0, 3.5, -1.5)
	portal_light.light_color = Color(0.95, 0.25, 0.95)
	portal_light.light_energy = 5.0
	portal_light.omni_range = 14.0
	door_node.add_child(portal_light)


func _spawn_floor_switch() -> void:
	var ps: PackedScene = load(FLOOR_SWITCH_PATH) as PackedScene
	switch_node = Node3D.new()
	switch_node.name = "FloorSwitch"
	switch_node.position = Vector3(0.0, 0.08, 25.0)
	add_child(switch_node)

	var inst: Node = ps.instantiate()
	switch_node.add_child(inst)
	_apply_mat_recursive(inst, env_deco_mat)
	switch_anim = _find_anim_player(inst)
	if switch_anim != null:
		switch_anim.stop()

	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 1.9
	torus.outer_radius = 2.25
	ring.mesh = torus
	ring.position = Vector3(0.0, 0.2, 0.0)
	ring.material_override = switch_glow_mat
	switch_node.add_child(ring)


func _spawn_treasure_chest() -> void:
	var ps: PackedScene = load(CHEST_PATH) as PackedScene
	chest_node = Node3D.new()
	chest_node.name = "TreasureChest"
	chest_node.position = Vector3(0.0, 0.0, -13.2)
	chest_node.scale = Vector3(0.95, 0.95, 0.95)
	add_child(chest_node)

	var inst: Node = ps.instantiate()
	chest_node.add_child(inst)
	_apply_mat_recursive(inst, env_deco_mat)
	chest_anim = _find_anim_player(inst)
	if chest_anim != null:
		chest_anim.stop()

	var glow_orb := MeshInstance3D.new()
	glow_orb.name = "VictoryGlowOrb"
	var sp := SphereMesh.new()
	sp.radius = 0.85
	sp.height = 1.7
	glow_orb.mesh = sp
	glow_orb.position = Vector3(0.0, 2.2, 0.0)
	glow_orb.material_override = chest_glow_mat
	glow_orb.visible = false
	chest_node.add_child(glow_orb)

	chest_light = OmniLight3D.new()
	chest_light.position = Vector3(0.0, 2.8, 1.0)
	chest_light.light_color = Color(1.0, 0.85, 0.35)
	chest_light.light_energy = 1.8
	chest_light.omni_range = 10.0
	chest_node.add_child(chest_light)


func set_switch_pressed(pressed: bool) -> void:
	if switch_glow_mat != null:
		if pressed:
			switch_glow_mat.albedo_color = Color(0.25, 1.0, 0.45, 0.85)
			switch_glow_mat.emission = Color(0.2, 1.0, 0.45)
			switch_glow_mat.emission_energy_multiplier = 4.2
		else:
			switch_glow_mat.albedo_color = Color(0.25, 0.75, 1.0, 0.7)
			switch_glow_mat.emission = Color(0.25, 0.8, 1.0)
			switch_glow_mat.emission_energy_multiplier = 2.4
	if switch_anim != null and pressed and switch_anim.has_animation("Take 001"):
		switch_anim.play("Take 001")


func open_boss_door() -> void:
	if door_anim != null and door_anim.has_animation("Take 001"):
		door_anim.play("Take 001")
	if door_portal_mesh != null:
		door_portal_mesh.visible = false


func open_treasure_chest() -> void:
	if chest_anim != null and chest_anim.has_animation("Take 001"):
		chest_anim.play("Take 001")
	if chest_node != null:
		var orb: Node3D = chest_node.get_node_or_null("VictoryGlowOrb") as Node3D
		if orb != null:
			orb.visible = true
	if chest_light != null:
		chest_light.light_energy = 7.5
		chest_light.omni_range = 18.0


func _process(delta: float) -> void:
	flicker_time += delta
	for i in torch_lights.size():
		var wave: float = sin(flicker_time * 7.5 + float(i) * 1.7) * 0.3 + cos(flicker_time * 13.0 + float(i)) * 0.16
		torch_lights[i].light_energy = 2.3 + wave
		var sc: float = 1.0 + wave * 0.09
		torch_flames[i].scale = Vector3(sc, 1.0 + wave * 0.14, sc)


func _apply_mat_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		mi.material_override = mat
	for c in node.get_children():
		_apply_mat_recursive(c, mat)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for c in node.get_children():
		var found := _find_anim_player(c)
		if found != null:
			return found
	return null
`,
  );

  // 8. scripts/hero_unit.gd — 4 Hero Classes (Tank, Archer, Mage, Rogue), Co-op AI, ChargedShield, Heal AOE, DashAttack, Revive
  writeText(
    path.join(outputDir, 'scripts', 'hero_unit.gd'),
    `extends Node3D
class_name HeroUnit
## Playable & AI-cooperative Hero unit implementing Boss Room's 4 classes:
##   1. Tank   - Melee Hammer, Q: ChargedShieldAction (blocks Boss Trample -> Stuns Boss!), E: Taunt Smash
##   2. Archer - 3D Arrow Shot (fx_arrrow), Q: Piercing PowerShot, E: Multi-Arrow Volley
##   3. Mage   - Arcane Bolt, Q: Healing Ring AOEAction (heals party), E: Arcane Nova AOE
##   4. Rogue  - Twin Blade Strike, Q: DashAttackAction, E: Smoke Evasion Strike

signal damaged(hero: HeroUnit, amount: float)
signal downed(hero: HeroUnit)
signal revived(hero: HeroUnit)

const CLASS_STATS := {
	"tank": {
		"title": "Tank",
		"max_hp": 220.0,
		"speed": 6.4,
		"attack_range": 3.4,
		"attack_damage": 26.0,
		"attack_cd": 0.65,
		"q_name": "Charged Shield",
		"q_cd": 4.5,
		"e_name": "Hammer Smash",
		"e_cd": 5.5,
		"accent": Color(0.28, 0.72, 1.0),
	},
	"archer": {
		"title": "Archer",
		"max_hp": 140.0,
		"speed": 7.6,
		"attack_range": 13.5,
		"attack_damage": 24.0,
		"attack_cd": 0.55,
		"q_name": "Power Shot",
		"q_cd": 4.0,
		"e_name": "Arrow Volley",
		"e_cd": 6.0,
		"accent": Color(0.38, 0.95, 0.32),
	},
	"mage": {
		"title": "Mage",
		"max_hp": 130.0,
		"speed": 6.9,
		"attack_range": 12.0,
		"attack_damage": 22.0,
		"attack_cd": 0.65,
		"q_name": "Heal Ring AOE",
		"q_cd": 5.0,
		"e_name": "Arcane Nova",
		"e_cd": 6.5,
		"accent": Color(1.0, 0.45, 0.85),
	},
	"rogue": {
		"title": "Rogue",
		"max_hp": 150.0,
		"speed": 8.4,
		"attack_range": 3.0,
		"attack_damage": 32.0,
		"attack_cd": 0.42,
		"q_name": "Dash Attack",
		"q_cd": 3.5,
		"e_name": "Shadow Strike",
		"e_cd": 5.0,
		"accent": Color(0.85, 0.55, 1.0),
	},
}

var hero_class: String = "tank"
var display_name: String = "Tank"
var max_hp: float = 200.0
var hp: float = 200.0
var move_speed: float = 6.5
var attack_range: float = 3.2
var attack_damage: float = 24.0
var accent_color: Color = Color(0.3, 0.75, 1.0)

var is_player_controlled: bool = false
var is_downed: bool = false
var shield_active: bool = false
var shield_fully_charged: bool = false
var shield_timer: float = 0.0
var dash_timer: float = 0.0
var dash_velocity: Vector3 = Vector3.ZERO
var revive_progress: float = 0.0
var total_damage_dealt: float = 0.0
var total_healing_done: float = 0.0
var ai_think_timer: float = 0.0

var visual: CharacterVisual = null
var ring_mesh: MeshInstance3D = null
var ring_mat: StandardMaterial3D = null
var shield_aura: MeshInstance3D = null
var hp_bar_fill: MeshInstance3D = null


func setup(p_class: String, start_pos: Vector3) -> void:
	hero_class = p_class.to_lower()
	var cfg: Dictionary = CLASS_STATS.get(hero_class, CLASS_STATS["tank"])
	display_name = str(cfg["title"])
	max_hp = float(cfg["max_hp"])
	hp = max_hp
	move_speed = float(cfg["speed"])
	attack_range = float(cfg["attack_range"])
	attack_damage = float(cfg["attack_damage"])
	accent_color = cfg["accent"] as Color
	position = start_pos
	name = "Hero_" + display_name

	visual = CharacterVisual.new()
	visual.name = "Visual"
	add_child(visual)
	visual.setup(hero_class, 1.05)

	# Ground class selection ring
	ring_mesh = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.92
	torus.outer_radius = 1.16
	ring_mesh.mesh = torus
	ring_mesh.position = Vector3(0.0, 0.09, 0.0)
	ring_mat = StandardMaterial3D.new()
	ring_mat.albedo_color = Color(accent_color.r, accent_color.g, accent_color.b, 0.85)
	ring_mat.emission_enabled = true
	ring_mat.emission = accent_color
	ring_mat.emission_energy_multiplier = 2.4
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mesh.material_override = ring_mat
	add_child(ring_mesh)

	# Tank ChargedShield sleek front glowing magic barrier ring (keeps Tank fully visible!)
	shield_aura = MeshInstance3D.new()
	var sh_torus := TorusMesh.new()
	sh_torus.inner_radius = 0.95
	sh_torus.outer_radius = 1.22
	shield_aura.mesh = sh_torus
	shield_aura.position = Vector3(0.0, 1.25, 1.15)
	shield_aura.rotation_degrees = Vector3(90.0, 0.0, 0.0)
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(0.32, 0.85, 1.0, 0.58)
	smat.emission_enabled = true
	smat.emission = Color(0.28, 0.82, 1.0)
	smat.emission_energy_multiplier = 1.5
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shield_aura.material_override = smat
	shield_aura.visible = false
	add_child(shield_aura)

	# Compact floating world HP bar (billboarded with render_priority so green fill never Z-fights)
	var bar_bg := MeshInstance3D.new()
	var bg_quad := QuadMesh.new()
	bg_quad.size = Vector2(1.45, 0.14)
	bar_bg.mesh = bg_quad
	bar_bg.position = Vector3(0.0, 2.75, 0.0)
	var bg_mat := StandardMaterial3D.new()
	bg_mat.albedo_color = Color(0.06, 0.06, 0.1, 0.88)
	bg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bg_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bg_mat.render_priority = 1
	bar_bg.material_override = bg_mat
	add_child(bar_bg)

	hp_bar_fill = MeshInstance3D.new()
	var fill_quad := QuadMesh.new()
	fill_quad.size = Vector2(1.38, 0.1)
	hp_bar_fill.mesh = fill_quad
	hp_bar_fill.position = Vector3(0.0, 2.75, 0.0)
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(0.24, 0.92, 0.38)
	fmat.emission_enabled = true
	fmat.emission = Color(0.2, 0.88, 0.35)
	fmat.emission_energy_multiplier = 1.1
	fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fmat.no_depth_test = true
	fmat.render_priority = 2
	hp_bar_fill.material_override = fmat
	add_child(hp_bar_fill)


func set_controlled(controlled: bool) -> void:
	is_player_controlled = controlled
	if ring_mat != null:
		ring_mat.emission_energy_multiplier = 3.8 if controlled else 1.4
		ring_mesh.scale = Vector3.ONE * (1.18 if controlled else 0.88)


func activate_charged_shield(duration: float = 3.4) -> void:
	if is_downed:
		return
	shield_active = true
	shield_fully_charged = true
	shield_timer = duration
	if shield_aura != null:
		shield_aura.visible = true
	if visual != null:
		visual.shield_raised = true


func trigger_dash(direction: Vector3, speed: float = 22.0, duration: float = 0.28) -> void:
	if is_downed:
		return
	var dir := Vector3(direction.x, 0.0, direction.z).normalized()
	if dir.length_squared() < 0.01:
		dir = -global_transform.basis.z
	dash_velocity = dir * speed
	dash_timer = duration
	look_at_flat(position + dir)
	if visual != null:
		visual.trigger_attack(0.32)


func take_damage(amount: float) -> float:
	if is_downed:
		return 0.0
	var actual: float = amount
	if shield_active:
		# ChargedShieldAction reduces damage 80% when fully charged
		actual = amount * (0.2 if shield_fully_charged else 0.5)
	hp = maxf(0.0, hp - actual)
	if visual != null:
		visual.trigger_hit_flash()
	_update_hp_bar()
	damaged.emit(self, actual)
	if hp <= 0.0:
		is_downed = true
		shield_active = false
		shield_fully_charged = false
		if shield_aura != null:
			shield_aura.visible = false
		if visual != null:
			visual.is_downed = true
			visual.shield_raised = false
		downed.emit(self)
	return actual


func heal(amount: float) -> float:
	if is_downed:
		return 0.0
	var before: float = hp
	hp = minf(max_hp, hp + amount)
	_update_hp_bar()
	return hp - before


func revive(hp_ratio: float = 0.65) -> void:
	if not is_downed:
		return
	is_downed = false
	revive_progress = 0.0
	hp = max_hp * hp_ratio
	if visual != null:
		visual.is_downed = false
	_update_hp_bar()
	revived.emit(self)


func look_at_flat(target_pos: Vector3) -> void:
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z)
	if dir.length_squared() > 0.001:
		rotation.y = atan2(dir.x, dir.z)


func step_hero(delta: float, move_vec: Vector3, arena_bounds: Rect2) -> void:
	if shield_timer > 0.0:
		shield_timer = maxf(0.0, shield_timer - delta)
		if shield_timer <= 0.0:
			shield_active = false
			shield_fully_charged = false
			if shield_aura != null:
				shield_aura.visible = false
			if visual != null:
				visual.shield_raised = false

	var speed_used: float = 0.0
	if not is_downed:
		if dash_timer > 0.0:
			dash_timer = maxf(0.0, dash_timer - delta)
			position += dash_velocity * delta
			speed_used = dash_velocity.length()
		elif move_vec.length_squared() > 0.001:
			var flat := Vector3(move_vec.x, 0.0, move_vec.z).normalized()
			var spd := move_speed * (0.55 if shield_active else 1.0)
			position += flat * spd * delta
			look_at_flat(position + flat)
			speed_used = spd

	position.x = clampf(position.x, arena_bounds.position.x, arena_bounds.position.x + arena_bounds.size.x)
	position.z = clampf(position.z, arena_bounds.position.y, arena_bounds.position.y + arena_bounds.size.y)

	if visual != null:
		visual.animate(delta, speed_used, dash_timer > 0.0)


func _update_hp_bar() -> void:
	if hp_bar_fill == null:
		return
	var ratio: float = clampf(hp / max_hp, 0.0, 1.0)
	hp_bar_fill.scale.x = maxf(0.01, ratio)
	hp_bar_fill.position.x = -0.71 * (1.0 - ratio)
	var mat: StandardMaterial3D = hp_bar_fill.material_override as StandardMaterial3D
	if mat != null:
		var col := Color(0.24, 0.92, 0.38) if ratio > 0.45 else (Color(0.98, 0.78, 0.2) if ratio > 0.2 else Color(0.95, 0.25, 0.22))
		mat.albedo_color = col
		mat.emission = col
`,
  );

  // 9. scripts/enemy_unit.gd — Imp Boss (Melee Smash, Trample + Shield-Stun, AOE Summon) & Imp Minions
  writeText(
    path.join(outputDir, 'scripts', 'enemy_unit.gd'),
    `extends Node3D
class_name EnemyUnit
## Enemy unit for Boss Room: Imp Minions & the giant Imp Boss.
## Implements Unity Boss Room's TrampleAction (Windup -> Charging -> Stunned by Tank ChargedShield!),
## Melee Smash, and AOE Stomp + Imp Summon with clear ground telegraphs.

signal died(enemy: EnemyUnit)
signal stunned_by_shield(boss: EnemyUnit, blocker: HeroUnit)
signal telegraph_triggered(boss: EnemyUnit, pattern: String)

enum BossPattern { IDLE, MELEE_WINDUP, TRAMPLE_WINDUP, TRAMPLE_CHARGE, AOE_WINDUP, STUNNED }

var is_boss: bool = false
var enemy_name: String = "Imp"
var max_hp: float = 110.0
var hp: float = 110.0
var move_speed: float = 4.6
var is_dead: bool = false

var pattern: BossPattern = BossPattern.IDLE
var pattern_timer: float = 0.0
var pattern_cooldown: float = 1.6
var pattern_cycle: int = 0
var charge_direction: Vector3 = Vector3.FORWARD
var hit_during_charge: Dictionary = {}
var stun_count: int = 0

var visual: CharacterVisual = null
var telegraph_mesh: MeshInstance3D = null
var telegraph_mat: StandardMaterial3D = null
var stun_stars: Node3D = null
var hp_bar_fill: MeshInstance3D = null


func setup(p_is_boss: bool, start_pos: Vector3, idx: int = 0) -> void:
	is_boss = p_is_boss
	position = start_pos
	if is_boss:
		enemy_name = "Imp Boss"
		name = "ImpBoss"
		max_hp = 1200.0
		hp = max_hp
		move_speed = 4.4
	else:
		enemy_name = "Imp_" + str(idx)
		name = enemy_name
		max_hp = 115.0
		hp = max_hp
		move_speed = 5.1

	visual = CharacterVisual.new()
	visual.name = "Visual"
	add_child(visual)
	visual.setup("boss" if is_boss else "imp", 2.05 if is_boss else 0.92)

	# Ground telegraph decal mesh (red line for Trample, red ring for AOE/Melee)
	telegraph_mesh = MeshInstance3D.new()
	telegraph_mesh.name = "TelegraphDecal"
	telegraph_mesh.position = Vector3(0.0, 0.14, 0.0)
	telegraph_mat = StandardMaterial3D.new()
	telegraph_mat.albedo_color = Color(1.0, 0.18, 0.12, 0.52)
	telegraph_mat.emission_enabled = true
	telegraph_mat.emission = Color(1.0, 0.22, 0.1)
	telegraph_mat.emission_energy_multiplier = 3.0
	telegraph_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	telegraph_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	telegraph_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	telegraph_mesh.material_override = telegraph_mat
	telegraph_mesh.visible = false
	add_child(telegraph_mesh)

	# Stunned golden spinning stars above Boss head
	stun_stars = Node3D.new()
	stun_stars.position = Vector3(0.0, 5.1 if is_boss else 2.2, 0.0)
	stun_stars.visible = false
	add_child(stun_stars)
	var star_mat := StandardMaterial3D.new()
	star_mat.albedo_color = Color(1.0, 0.92, 0.2)
	star_mat.emission_enabled = true
	star_mat.emission = Color(1.0, 0.85, 0.15)
	star_mat.emission_energy_multiplier = 3.5
	star_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in 4:
		var ang: float = float(i) * PI * 0.5
		var orb := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = 0.24
		sp.height = 0.48
		orb.mesh = sp
		orb.position = Vector3(cos(ang) * 1.1, 0.0, sin(ang) * 1.1)
		orb.material_override = star_mat
		stun_stars.add_child(orb)

	# World HP bar for Imp minions only (Boss uses the big top HUD HP bar)
	if not is_boss:
		hp_bar_fill = MeshInstance3D.new()
		var fquad := QuadMesh.new()
		fquad.size = Vector2(1.25, 0.12)
		hp_bar_fill.mesh = fquad
		hp_bar_fill.position = Vector3(0.0, 2.35, 0.0)
		var hmat := StandardMaterial3D.new()
		hmat.albedo_color = Color(0.95, 0.2, 0.18)
		hmat.emission_enabled = true
		hmat.emission = Color(0.95, 0.18, 0.15)
		hmat.emission_energy_multiplier = 1.1
		hmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		hmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		hp_bar_fill.material_override = hmat
		add_child(hp_bar_fill)


func get_pattern_label() -> String:
	match pattern:
		BossPattern.MELEE_WINDUP:
			return "HAMMER SMASH (Telegraph)"
		BossPattern.TRAMPLE_WINDUP:
			return "TRAMPLE CHARGE (Raise Tank Shield!)"
		BossPattern.TRAMPLE_CHARGE:
			return "TRAMPLE CHARGING!"
		BossPattern.AOE_WINDUP:
			return "IMP STOMP AOE (Spread Out!)"
		BossPattern.STUNNED:
			return "STUNNED! (2x Vulnerability)"
		_:
			return "PURSUING PARTY"


func take_damage(amount: float) -> float:
	if is_dead:
		return 0.0
	var mult: float = 1.75 if pattern == BossPattern.STUNNED else 1.0
	var actual: float = amount * mult
	hp = maxf(0.0, hp - actual)
	if visual != null:
		visual.trigger_hit_flash()
	if hp_bar_fill != null:
		var ratio := clampf(hp / max_hp, 0.0, 1.0)
		hp_bar_fill.scale.x = maxf(0.01, ratio)
	if hp <= 0.0:
		is_dead = true
		telegraph_mesh.visible = false
		stun_stars.visible = false
		visible = false
		died.emit(self)
	return actual


func start_trample_toward(target_pos: Vector3) -> void:
	if is_dead:
		return
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z).normalized()
	if dir.length_squared() < 0.01:
		dir = Vector3(0.0, 0.0, 1.0)
	charge_direction = dir
	rotation.y = atan2(dir.x, dir.z)
	pattern = BossPattern.TRAMPLE_WINDUP
	pattern_timer = 1.05
	hit_during_charge.clear()
	_show_line_telegraph(15.0, 3.2)
	ActionBus.broadcast_telegraph(name, "trample", position, dir, 15.0, 1.05)
	telegraph_triggered.emit(self, "trample")


func start_aoe_stomp() -> void:
	if is_dead:
		return
	pattern = BossPattern.AOE_WINDUP
	pattern_timer = 1.1
	_show_circle_telegraph(6.4)
	ActionBus.broadcast_telegraph(name, "aoe", position, Vector3.ZERO, 6.4, 1.1)
	telegraph_triggered.emit(self, "aoe")


func start_melee_smash(target_pos: Vector3) -> void:
	if is_dead:
		return
	look_at_flat(target_pos)
	pattern = BossPattern.MELEE_WINDUP
	pattern_timer = 0.65
	_show_circle_telegraph(4.2)
	ActionBus.broadcast_telegraph(name, "melee", position, Vector3.ZERO, 4.2, 0.65)
	telegraph_triggered.emit(self, "melee")


func apply_stun(duration: float, blocker: HeroUnit) -> void:
	pattern = BossPattern.STUNNED
	pattern_timer = duration
	stun_count += 1
	telegraph_mesh.visible = false
	stun_stars.visible = true
	if visual != null:
		visual.is_stunned = true
		visual.trigger_hit_flash(0.08)
	stunned_by_shield.emit(self, blocker)


func look_at_flat(target_pos: Vector3) -> void:
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z)
	if dir.length_squared() > 0.001:
		rotation.y = atan2(dir.x, dir.z)


func _show_line_telegraph(length: float, width: float) -> void:
	var box := BoxMesh.new()
	box.size = Vector3(width, 0.06, length)
	telegraph_mesh.mesh = box
	telegraph_mesh.position = Vector3(0.0, 0.14, length * 0.5)
	telegraph_mat.albedo_color = Color(1.0, 0.18, 0.1, 0.55)
	telegraph_mat.emission = Color(1.0, 0.2, 0.08)
	telegraph_mesh.visible = true


func _show_circle_telegraph(radius: float) -> void:
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 0.06
	cyl.radial_segments = 32
	telegraph_mesh.mesh = cyl
	telegraph_mesh.position = Vector3(0.0, 0.14, 0.0)
	telegraph_mat.albedo_color = Color(1.0, 0.3, 0.12, 0.45)
	telegraph_mat.emission = Color(1.0, 0.35, 0.1)
	telegraph_mesh.visible = true


func step_enemy(delta: float, heroes: Array[HeroUnit], arena_bounds: Rect2, on_aoe_burst: Callable) -> void:
	if is_dead:
		return

	var target: HeroUnit = _pick_nearest_living_hero(heroes)
	var moved_speed: float = 0.0

	if pattern == BossPattern.STUNNED:
		stun_stars.rotate_y(delta * 4.5)
		pattern_timer -= delta
		if pattern_timer <= 0.0:
			pattern = BossPattern.IDLE
			pattern_cooldown = 1.4
			stun_stars.visible = false
			if visual != null:
				visual.is_stunned = false
		if visual != null:
			visual.animate(delta, 0.0, false)
		return

	if not is_boss:
		# Imp minion simple chase + melee poke
		pattern_cooldown = maxf(0.0, pattern_cooldown - delta)
		if target != null:
			var dist := position.distance_to(target.position)
			look_at_flat(target.position)
			if dist > 2.2:
				var step := (target.position - position).normalized() * move_speed * delta
				position += Vector3(step.x, 0.0, step.z)
				moved_speed = move_speed
			elif pattern_cooldown <= 0.0:
				pattern_cooldown = 1.45
				if visual != null:
					visual.trigger_attack(0.3)
				target.take_damage(14.0)
		_clamp_bounds(arena_bounds)
		if visual != null:
			visual.animate(delta, moved_speed, false)
		return

	# Imp Boss state machine
	match pattern:
		BossPattern.IDLE:
			pattern_cooldown = maxf(0.0, pattern_cooldown - delta)
			if target != null:
				var dist := position.distance_to(target.position)
				look_at_flat(target.position)
				if dist > 3.6:
					var dir := (target.position - position).normalized()
					position += Vector3(dir.x, 0.0, dir.z) * move_speed * delta
					moved_speed = move_speed
				if pattern_cooldown <= 0.0:
					pattern_cycle += 1
					if pattern_cycle % 3 == 1:
						start_trample_toward(target.position)
					elif pattern_cycle % 3 == 2:
						start_aoe_stomp()
					else:
						start_melee_smash(target.position)

		BossPattern.MELEE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				telegraph_mesh.visible = false
				if visual != null:
					visual.trigger_attack(0.4)
				for h in heroes:
					if not h.is_downed and position.distance_to(h.position) <= 4.5:
						h.take_damage(32.0)
				pattern = BossPattern.IDLE
				pattern_cooldown = 1.5

		BossPattern.TRAMPLE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				pattern = BossPattern.TRAMPLE_CHARGE
				pattern_timer = 0.85
				telegraph_mesh.visible = false

		BossPattern.TRAMPLE_CHARGE:
			pattern_timer -= delta
			var charge_spd: float = 19.5
			position += charge_direction * charge_spd * delta
			moved_speed = charge_spd
			# Check hero collisions during Trample
			for h in heroes:
				if h.is_downed or hit_during_charge.has(h.name):
					continue
				if position.distance_to(h.position) <= 2.9:
					hit_during_charge[h.name] = true
					if h.hero_class == "tank" and h.shield_active and h.shield_fully_charged:
						# Authentic Unity Boss Room counter-mechanic: Tank ChargedShield STUNS the trampling Boss!
						apply_stun(3.2, h)
						return
					else:
						h.take_damage(44.0)
			if pattern_timer <= 0.0:
				pattern = BossPattern.IDLE
				pattern_cooldown = 1.65

		BossPattern.AOE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				telegraph_mesh.visible = false
				if visual != null:
					visual.trigger_attack(0.45)
				for h in heroes:
					if not h.is_downed and position.distance_to(h.position) <= 6.6:
						h.take_damage(36.0)
				if on_aoe_burst.is_valid():
					on_aoe_burst.call(position)
				pattern = BossPattern.IDLE
				pattern_cooldown = 2.0

	_clamp_bounds(arena_bounds)
	if visual != null:
		visual.animate(delta, moved_speed, pattern == BossPattern.TRAMPLE_CHARGE)


func _clamp_bounds(b: Rect2) -> void:
	position.x = clampf(position.x, b.position.x, b.position.x + b.size.x)
	position.z = clampf(position.z, b.position.y, b.position.y + b.size.y)


func _pick_nearest_living_hero(heroes: Array[HeroUnit]) -> HeroUnit:
	var best: HeroUnit = null
	var best_d := 9999.0
	for h in heroes:
		if h.is_downed:
			continue
		var d := position.distance_to(h.position)
		if d < best_d:
			best_d = d
			best = h
	return best
`,
  );

  // 10. scripts/boss_room_game.gd — Full Boss Room Co-op Game Controller, VFX, Audio, HUD & PostGame Summary
  writeText(
    path.join(outputDir, 'scripts', 'boss_room_game.gd'),
    `extends Node3D
class_name BossRoomGame
## Main Boss Room 3D Co-op RPG Scene Controller (Godot 4.7.2 Port of Unity Boss Room).
## Flow:
##   Phase 1 (ENTRANCE): Heroes stand on Floor Switch -> opens Boss Door -> enter Boss Arena
##   Phase 2 (BOSS_FIGHT): 4-Hero Party vs Imp Boss + Imp Minions (Server-Authoritative ActionBus)
##   Phase 3 (VICTORY): Boss defeated -> Treasure Chest opens -> PostGame Party Summary

enum GamePhase { ENTRANCE, BOSS_FIGHT, VICTORY, DEFEAT }

const AUDIO_DIR := "res://assets/audio/"

var phase: GamePhase = GamePhase.ENTRANCE
var dungeon: DungeonBuilder = null
var camera: Camera3D = null
var heroes: Array[HeroUnit] = []
var enemies: Array[EnemyUnit] = []
var boss: EnemyUnit = null
var active_hero_index: int = 0
var switch_activated: bool = false
var boss_door_open: bool = false
var chest_opened: bool = false
var elapsed_time: float = 0.0

var projectiles: Array[Dictionary] = []
var vfx_nodes: Array[Dictionary] = []
var sfx_players: Dictionary = {}
var camera_target_pos: Vector3 = Vector3(0.0, 0.0, 22.0)
var camera_offset: Vector3 = Vector3(0.0, 17.5, 19.5)
var camera_look_offset: Vector3 = Vector3(0.0, 1.4, -2.5)
var camera_override: bool = false

# HUD Controls
var hud_layer: CanvasLayer = null
var boss_panel: PanelContainer = null
var boss_hp_bar: ProgressBar = null
var boss_state_label: Label = null
var objective_label: Label = null
var netcode_badge: Label = null
var skill_bar_label: Label = null
var party_cards: Array[Dictionary] = []
var victory_panel: PanelContainer = null
var victory_stats_label: Label = null


func _ready() -> void:
	ActionBus.reset_session()
	ActionBus.action_executed.connect(_on_action_executed)

	_setup_lighting_and_env()
	_setup_audio()

	dungeon = DungeonBuilder.new()
	dungeon.name = "Dungeon"
	add_child(dungeon)
	dungeon.build_dungeon()

	_setup_camera()
	_spawn_party_at_entrance()
	_spawn_boss_and_imps()
	_build_hud()
	_select_hero(0)


func _setup_lighting_and_env() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.035, 0.04, 0.075)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.24, 0.3, 0.5)
	env.ambient_light_energy = 0.44
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.96
	env.glow_enabled = true
	env.glow_intensity = 0.32
	env.glow_strength = 0.65
	env.glow_bloom = 0.09
	env.glow_hdr_threshold = 1.35

	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	# Cool moonlight-blue dungeon directional rim light matching Unity Boss Room contrast
	var key_light := DirectionalLight3D.new()
	key_light.name = "DungeonKeyLight"
	key_light.rotation_degrees = Vector3(-52.0, -32.0, 0.0)
	key_light.light_color = Color(0.7, 0.8, 1.0)
	key_light.light_energy = 0.82
	key_light.shadow_enabled = true
	key_light.shadow_bias = 0.04
	add_child(key_light)

	# Subtle warm dramatic Boss Arena center fill
	var arena_fill := OmniLight3D.new()
	arena_fill.name = "ArenaCenterFill"
	arena_fill.position = Vector3(0.0, 11.5, -2.0)
	arena_fill.light_color = Color(1.0, 0.65, 0.45)
	arena_fill.light_energy = 1.15
	arena_fill.omni_range = 32.0
	add_child(arena_fill)


func _setup_audio() -> void:
	var clips := {
		"archer_shot": "archer_attk_a.wav",
		"power_shot": "archer_powershot.wav",
		"charge_start": "charge_attack_start.wav",
		"charge_end": "charge_attack_end.wav",
		"defeat": "defeat_a.wav",
	}
	for key in clips.keys():
		var p := AudioStreamPlayer.new()
		p.name = "SFX_" + str(key)
		var stream: AudioStream = load(AUDIO_DIR + str(clips[key])) as AudioStream
		p.stream = stream
		p.volume_db = -8.0
		add_child(p)
		sfx_players[key] = p


func _play_sfx(key: String) -> void:
	if sfx_players.has(key):
		var p: AudioStreamPlayer = sfx_players[key] as AudioStreamPlayer
		if p != null and p.stream != null:
			p.play()


func _setup_camera() -> void:
	camera = Camera3D.new()
	camera.name = "MainCamera"
	camera.fov = 44.0
	camera.near = 0.2
	camera.far = 160.0
	add_child(camera)
	camera.position = camera_target_pos + camera_offset
	camera.look_at(camera_target_pos + camera_look_offset, Vector3.UP)
	camera.make_current()


func _spawn_party_at_entrance() -> void:
	var starts: Array[Array] = [
		["tank", Vector3(-1.8, 0.0, 29.2)],
		["archer", Vector3(2.2, 0.0, 30.2)],
		["mage", Vector3(-3.0, 0.0, 31.2)],
		["rogue", Vector3(3.2, 0.0, 28.6)],
	]
	for entry in starts:
		var h := HeroUnit.new()
		add_child(h)
		h.setup(str(entry[0]), entry[1] as Vector3)
		heroes.append(h)


func _spawn_boss_and_imps() -> void:
	boss = EnemyUnit.new()
	add_child(boss)
	boss.setup(true, Vector3(0.0, 0.0, -6.0), 0)
	boss.died.connect(_on_boss_died)
	boss.stunned_by_shield.connect(_on_boss_stunned)
	boss.telegraph_triggered.connect(_on_boss_telegraph)
	enemies.append(boss)

	var imp_positions: Array[Vector3] = [
		Vector3(-8.5, 0.0, -3.0),
		Vector3(8.5, 0.0, -2.5),
	]
	for i in imp_positions.size():
		var imp := EnemyUnit.new()
		add_child(imp)
		imp.setup(false, imp_positions[i], i + 1)
		enemies.append(imp)


func _select_hero(index: int) -> void:
	active_hero_index = clampi(index, 0, heroes.size() - 1)
	for i in heroes.size():
		heroes[i].set_controlled(i == active_hero_index)
	_update_skill_bar()


func get_active_hero() -> HeroUnit:
	return heroes[active_hero_index]


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var kev: InputEventKey = event
		match kev.keycode:
			KEY_1:
				_select_hero(0)
			KEY_2:
				_select_hero(1)
			KEY_3:
				_select_hero(2)
			KEY_4:
				_select_hero(3)
			KEY_SPACE:
				trigger_hero_basic_attack(get_active_hero())
			KEY_Q:
				trigger_hero_skill_q(get_active_hero())
			KEY_E:
				trigger_hero_skill_e(get_active_hero())
			KEY_R:
				trigger_revive_nearest(get_active_hero())


func _process(delta: float) -> void:
	elapsed_time += delta
	_step_vfx(delta)
	_step_projectiles(delta)

	var active := get_active_hero()
	var input_vec := Vector3.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		input_vec.z -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		input_vec.z += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		input_vec.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		input_vec.x += 1.0

	var bounds := Rect2(-14.5, -14.5, 29.0, 48.0) if boss_door_open else Rect2(-7.0, 19.0, 14.0, 15.0)
	if phase == GamePhase.BOSS_FIGHT or phase == GamePhase.VICTORY:
		bounds = Rect2(-14.5, -14.5, 29.0, 30.0)

	# Step active hero + cooperative AI party
	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		if i == active_hero_index:
			h.step_hero(delta, input_vec, bounds)
		else:
			var ai_move := _compute_party_ai(h, delta)
			h.step_hero(delta, ai_move, bounds)

	# Phase 1: Floor Switch puzzle check
	if phase == GamePhase.ENTRANCE:
		if not switch_activated:
			for h in heroes:
				if h.position.distance_to(Vector3(0.0, 0.0, 25.0)) <= 2.6:
					activate_floor_switch()
					break
		elif boss_door_open:
			for h in heroes:
				if h.position.z < 14.5:
					enter_boss_arena()
					break

	# Phase 2: Boss & Imp combat
	if phase == GamePhase.BOSS_FIGHT:
		for e in enemies:
			if not e.is_dead:
				e.step_enemy(delta, heroes, Rect2(-14.2, -14.0, 28.4, 28.5), _on_boss_aoe_burst)
		var all_down := true
		for h in heroes:
			if not h.is_downed:
				all_down = false
				break
		if all_down:
			phase = GamePhase.DEFEAT
			_play_sfx("defeat")

	# Smooth camera follow
	if not camera_override and camera != null:
		var desired_focus: Vector3 = active.position
		if phase == GamePhase.BOSS_FIGHT and boss != null and not boss.is_dead:
			desired_focus = active.position.lerp(boss.position, 0.42)
		camera_target_pos = camera_target_pos.lerp(desired_focus, minf(1.0, delta * 5.0))
		camera.position = camera_target_pos + camera_offset
		camera.look_at(camera_target_pos + camera_look_offset, Vector3.UP)

	_update_hud()


func activate_floor_switch() -> void:
	if switch_activated:
		return
	switch_activated = true
	boss_door_open = true
	dungeon.set_switch_pressed(true)
	dungeon.open_boss_door()
	ActionBus.request_action("Party", "FloorSwitchOpenDoor", {"origin": Vector3(0, 0, 25)})
	_spawn_ring_vfx(Vector3(0.0, 0.25, 25.0), 3.4, Color(0.25, 1.0, 0.55), 0.7)
	_play_sfx("charge_end")


func enter_boss_arena() -> void:
	if phase == GamePhase.BOSS_FIGHT:
		return
	phase = GamePhase.BOSS_FIGHT
	# Rally party inside arena if any member is still in corridor
	var rally_offsets: Array[Vector3] = [
		Vector3(-2.5, 0.0, 9.5), Vector3(3.5, 0.0, 10.5),
		Vector3(-4.5, 0.0, 11.2), Vector3(1.8, 0.0, 8.8),
	]
	for i in heroes.size():
		if heroes[i].position.z > 14.0:
			heroes[i].position = rally_offsets[i]
	boss_panel.visible = true
	ActionBus.sync_world_state({"phase": "BOSS_FIGHT", "boss_hp": boss.hp})


func _compute_party_ai(h: HeroUnit, delta: float) -> Vector3:
	if h.is_downed:
		return Vector3.ZERO
	h.ai_think_timer = maxf(0.0, h.ai_think_timer - delta)

	if phase == GamePhase.ENTRANCE:
		var leader := get_active_hero()
		var idx := heroes.find(h)
		var slot := leader.position + Vector3((float(idx) - 1.5) * 2.2, 0.0, 1.8)
		var diff := slot - h.position
		return diff.normalized() if diff.length() > 1.4 else Vector3.ZERO

	if phase == GamePhase.VICTORY:
		var chest_spot := Vector3((float(heroes.find(h)) - 1.5) * 2.6, 0.0, -8.5)
		var diff := chest_spot - h.position
		return diff.normalized() if diff.length() > 0.7 else Vector3.ZERO

	# Boss Fight Co-op AI: revive downed allies, Mage heals low HP allies, Tank blocks Trample!
	for ally in heroes:
		if ally.is_downed and h != ally:
			var d_ally := h.position.distance_to(ally.position)
			if d_ally > 2.0:
				return (ally.position - h.position).normalized()
			else:
				trigger_revive_nearest(h)
				return Vector3.ZERO

	var target: EnemyUnit = _find_nearest_enemy(h.position)
	if target == null:
		return Vector3.ZERO

	var dist := h.position.distance_to(target.position)
	var desired_range := h.attack_range * 0.85

	if h.ai_think_timer <= 0.0:
		h.ai_think_timer = 0.35
		if h.hero_class == "tank" and boss != null and boss.pattern == EnemyUnit.BossPattern.TRAMPLE_WINDUP:
			trigger_hero_skill_q(h)
		elif h.hero_class == "mage":
			var needs_heal := false
			for ally in heroes:
				if not ally.is_downed and ally.hp < ally.max_hp * 0.78:
					needs_heal = true
					break
			if needs_heal:
				trigger_hero_skill_q(h)
			elif dist <= h.attack_range:
				trigger_hero_basic_attack(h)
		elif dist <= h.attack_range:
			if not ActionBus.is_on_cooldown(h.name, "skill_q"):
				trigger_hero_skill_q(h)
			else:
				trigger_hero_basic_attack(h)

	if dist > desired_range:
		return (target.position - h.position).normalized()
	elif dist < desired_range * 0.45 and (h.hero_class == "archer" or h.hero_class == "mage"):
		return (h.position - target.position).normalized()
	return Vector3.ZERO


func trigger_hero_basic_attack(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else (h.position + Vector3(0.0, 0.0, -5.0))
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"basic_attack",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["attack_cd"]),
		h.attack_range + 4.0
	)


func trigger_hero_skill_q(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else h.position
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"skill_q",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["q_cd"])
	)


func trigger_hero_skill_e(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else h.position
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"skill_e",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["e_cd"])
	)


func trigger_revive_nearest(caster: HeroUnit) -> bool:
	if caster.is_downed:
		return false
	for ally in heroes:
		if ally.is_downed and caster.position.distance_to(ally.position) <= 4.0:
			return ActionBus.request_action(
				caster.name,
				"revive",
				{"caster_index": heroes.find(caster), "target_index": heroes.find(ally), "origin": caster.position, "target_pos": ally.position},
				1.5,
				4.5
			)
	return false


func _on_action_executed(_actor_id: String, action_id: String, payload: Dictionary) -> void:
	if action_id == "revive":
		var ti: int = int(payload.get("target_index", -1))
		if ti >= 0 and ti < heroes.size():
			heroes[ti].revive(0.75)
			_spawn_ring_vfx(heroes[ti].position + Vector3(0.0, 0.2, 0.0), 2.8, Color(0.4, 1.0, 0.75), 0.75)
		return

	if not payload.has("hero_index"):
		return
	var hi: int = int(payload["hero_index"])
	if hi < 0 or hi >= heroes.size():
		return
	var h: HeroUnit = heroes[hi]
	var target_pos: Vector3 = payload.get("target_pos", h.position + Vector3(0.0, 0.0, -4.0)) as Vector3
	h.look_at_flat(target_pos)

	match action_id:
		"basic_attack":
			h.visual.trigger_attack(0.32)
			if h.hero_class == "archer":
				_spawn_projectile(h, target_pos, h.attack_damage, Color(0.55, 1.0, 0.3), true)
				_play_sfx("archer_shot")
			elif h.hero_class == "mage":
				_spawn_projectile(h, target_pos, h.attack_damage, Color(0.45, 0.85, 1.0), false)
			else:
				_deal_melee_arc(h, h.attack_range + 0.9, h.attack_damage)
				_spawn_ring_vfx(h.position + (target_pos - h.position).normalized() * 1.4, 1.7, h.accent_color, 0.25)

		"skill_q":
			match h.hero_class:
				"tank":
					h.activate_charged_shield(3.6)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 2.5, Color(0.3, 0.85, 1.0), 0.5)
					_play_sfx("charge_start")
				"archer":
					h.visual.trigger_attack(0.38)
					_spawn_projectile(h, target_pos, 62.0, Color(0.95, 1.0, 0.35), true, 1.55)
					_play_sfx("power_shot")
				"mage":
					h.visual.trigger_attack(0.42)
					# Healing Ring AOEAction centered on party
					var heal_pos := h.position
					_spawn_ring_vfx(heal_pos + Vector3(0.0, 0.16, 0.0), 6.2, Color(0.32, 1.0, 0.48), 1.45)
					for ally in heroes:
						if not ally.is_downed and ally.position.distance_to(heal_pos) <= 9.5:
							h.total_healing_done += ally.heal(55.0)
				"rogue":
					var dir := (target_pos - h.position).normalized()
					h.trigger_dash(dir, 23.0, 0.28)
					_deal_melee_arc(h, 4.4, 58.0)
					_spawn_ring_vfx(target_pos + Vector3(0.0, 0.2, 0.0), 2.4, Color(0.85, 0.45, 1.0), 0.45)

		"skill_e":
			h.visual.trigger_attack(0.42)
			match h.hero_class:
				"tank":
					_deal_melee_arc(h, 5.2, 54.0)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 4.8, Color(0.3, 0.72, 1.0), 0.55)
				"archer":
					for ang in [-0.22, 0.0, 0.22]:
						var d := (target_pos - h.position).normalized().rotated(Vector3.UP, float(ang))
						_spawn_projectile(h, h.position + d * 12.0, 34.0, Color(0.45, 1.0, 0.35), true)
					_play_sfx("power_shot")
				"mage":
					_spawn_ring_vfx(target_pos + Vector3(0.0, 0.2, 0.0), 5.6, Color(1.0, 0.4, 0.92), 0.8)
					for e in enemies:
						if not e.is_dead and e.position.distance_to(target_pos) <= 6.2:
							h.total_damage_dealt += e.take_damage(68.0)
				"rogue":
					_deal_melee_arc(h, 4.2, 74.0)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 3.0, Color(0.9, 0.4, 1.0), 0.45)


func _deal_melee_arc(h: HeroUnit, range_val: float, dmg: float) -> void:
	for e in enemies:
		if e.is_dead:
			continue
		if h.position.distance_to(e.position) <= range_val + (1.6 if e.is_boss else 0.4):
			h.total_damage_dealt += e.take_damage(dmg)


func _spawn_projectile(owner_hero: HeroUnit, target_pos: Vector3, dmg: float, color: Color, use_arrow_mesh: bool, scale_mult: float = 1.0) -> void:
	var node := Node3D.new()
	node.position = owner_hero.position + Vector3(0.0, 1.35, 0.0)
	var dir := Vector3(target_pos.x - owner_hero.position.x, 0.0, target_pos.z - owner_hero.position.z).normalized()
	if dir.length_squared() < 0.01:
		dir = Vector3(0.0, 0.0, -1.0)
	node.rotation.y = atan2(dir.x, dir.z)

	var mi := MeshInstance3D.new()
	if use_arrow_mesh and dungeon.arrow_mesh_template != null:
		mi.mesh = dungeon.arrow_mesh_template
		mi.scale = Vector3.ONE * (1.35 * scale_mult)
	else:
		var sp := SphereMesh.new()
		sp.radius = 0.34 * scale_mult
		sp.height = 0.68 * scale_mult
		mi.mesh = sp
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 4.2
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	node.add_child(mi)

	var glow := OmniLight3D.new()
	glow.light_color = color
	glow.light_energy = 2.6
	glow.omni_range = 6.0
	node.add_child(glow)

	add_child(node)
	projectiles.append({
		"node": node,
		"owner": owner_hero,
		"dir": dir,
		"speed": 26.0,
		"dmg": dmg,
		"life": 1.1,
	})


func _step_projectiles(delta: float) -> void:
	var keep: Array[Dictionary] = []
	for p in projectiles:
		var n: Node3D = p["node"] as Node3D
		var dir: Vector3 = p["dir"] as Vector3
		var spd: float = float(p["speed"])
		var life: float = float(p["life"]) - delta
		n.position += dir * spd * delta

		var hit := false
		for e in enemies:
			if e.is_dead:
				continue
			var hit_r: float = 2.3 if e.is_boss else 1.25
			if Vector2(n.position.x - e.position.x, n.position.z - e.position.z).length() <= hit_r:
				var owner_h: HeroUnit = p["owner"] as HeroUnit
				owner_h.total_damage_dealt += e.take_damage(float(p["dmg"]))
				_spawn_ring_vfx(n.position, 1.5, Color(1.0, 0.92, 0.4), 0.25)
				hit = true
				break

		if hit or life <= 0.0:
			n.queue_free()
		else:
			p["life"] = life
			keep.append(p)
	projectiles = keep


func _spawn_ring_vfx(pos: Vector3, radius: float, color: Color, duration: float) -> void:
	var mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius * 0.78
	torus.outer_radius = radius
	mi.mesh = torus
	mi.position = pos
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(color.r, color.g, color.b, 0.85)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 3.8
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	add_child(mi)
	vfx_nodes.append({"node": mi, "mat": mat, "life": duration, "max_life": duration})


func _step_vfx(delta: float) -> void:
	var keep: Array[Dictionary] = []
	for v in vfx_nodes:
		var n: Node3D = v["node"] as Node3D
		var mat: StandardMaterial3D = v["mat"] as StandardMaterial3D
		var life: float = float(v["life"]) - delta
		var ratio: float = clampf(life / float(v["max_life"]), 0.0, 1.0)
		if life <= 0.0:
			n.queue_free()
		else:
			v["life"] = life
			var sc: float = 0.65 + (1.0 - ratio) * 0.55
			n.scale = Vector3(sc, 1.0, sc)
			mat.albedo_color.a = ratio * 0.85
			keep.append(v)
	vfx_nodes = keep


func _on_boss_telegraph(_boss: EnemyUnit, pattern: String) -> void:
	if pattern == "trample":
		_play_sfx("charge_start")


func _on_boss_stunned(b: EnemyUnit, _blocker: HeroUnit) -> void:
	_play_sfx("charge_end")
	_spawn_ring_vfx(b.position + Vector3(0.0, 0.3, 0.0), 4.6, Color(1.0, 0.9, 0.25), 0.9)


func _on_boss_aoe_burst(pos: Vector3) -> void:
	_spawn_ring_vfx(pos + Vector3(0.0, 0.25, 0.0), 6.5, Color(1.0, 0.32, 0.12), 0.7)
	# Summon 1 extra Imp if fewer than 3 alive Imps
	var living_imps := 0
	for e in enemies:
		if not e.is_boss and not e.is_dead:
			living_imps += 1
	if living_imps < 2:
		var imp := EnemyUnit.new()
		add_child(imp)
		imp.setup(false, pos + Vector3(4.5, 0.0, 2.5), enemies.size())
		enemies.append(imp)


func _on_boss_died(_b: EnemyUnit) -> void:
	phase = GamePhase.VICTORY
	chest_opened = true
	if boss_panel != null:
		boss_panel.visible = false
	for e in enemies:
		if not e.is_dead:
			e.take_damage(9999.0)
	dungeon.open_treasure_chest()
	_spawn_ring_vfx(Vector3(0.0, 0.35, -13.2), 5.5, Color(1.0, 0.85, 0.25), 2.5)
	_play_sfx("charge_end")
	_show_victory_panel()


func _find_nearest_enemy(from_pos: Vector3) -> EnemyUnit:
	var best: EnemyUnit = null
	var best_d := 9999.0
	for e in enemies:
		if e.is_dead:
			continue
		var d := from_pos.distance_to(e.position)
		if d < best_d:
			best_d = d
			best = e
	return best


func _build_hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.name = "HUD"
	add_child(hud_layer)

	# Top-center Boss HP Bar + Telegraph Status
	boss_panel = PanelContainer.new()
	boss_panel.position = Vector2(340.0, 14.0)
	boss_panel.custom_minimum_size = Vector2(600.0, 74.0)
	boss_panel.visible = false
	var bp_style := StyleBoxFlat.new()
	bp_style.bg_color = Color(0.08, 0.06, 0.12, 0.84)
	bp_style.border_color = Color(0.95, 0.26, 0.18, 0.92)
	bp_style.set_border_width_all(2)
	bp_style.set_corner_radius_all(8)
	boss_panel.add_theme_stylebox_override("panel", bp_style)
	hud_layer.add_child(boss_panel)

	var bp_vbox := VBoxContainer.new()
	bp_vbox.add_theme_constant_override("separation", 4)
	boss_panel.add_child(bp_vbox)

	var boss_title := Label.new()
	boss_title.text = "IMP BOSS — DUNGEON OVERLORD"
	boss_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	boss_title.add_theme_font_size_override("font_size", 16)
	bp_vbox.add_child(boss_title)

	boss_hp_bar = ProgressBar.new()
	boss_hp_bar.min_value = 0.0
	boss_hp_bar.max_value = 1200.0
	boss_hp_bar.value = 1200.0
	boss_hp_bar.custom_minimum_size = Vector2(560.0, 20.0)
	boss_hp_bar.show_percentage = false
	var fill_sb := StyleBoxFlat.new()
	fill_sb.bg_color = Color(0.92, 0.18, 0.15)
	fill_sb.set_corner_radius_all(4)
	boss_hp_bar.add_theme_stylebox_override("fill", fill_sb)
	bp_vbox.add_child(boss_hp_bar)

	boss_state_label = Label.new()
	boss_state_label.text = "STATE: PURSUING PARTY"
	boss_state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_state_label.add_theme_color_override("font_color", Color(1.0, 0.55, 0.35))
	boss_state_label.add_theme_font_size_override("font_size", 13)
	bp_vbox.add_child(boss_state_label)

	# Top-left Objective & Netcode Authority Panel
	var top_left := PanelContainer.new()
	top_left.position = Vector2(16.0, 14.0)
	top_left.custom_minimum_size = Vector2(305.0, 68.0)
	var tl_style := StyleBoxFlat.new()
	tl_style.bg_color = Color(0.06, 0.08, 0.14, 0.82)
	tl_style.border_color = Color(0.35, 0.65, 1.0, 0.75)
	tl_style.set_border_width_all(2)
	tl_style.set_corner_radius_all(8)
	top_left.add_theme_stylebox_override("panel", tl_style)
	hud_layer.add_child(top_left)

	var tl_v := VBoxContainer.new()
	top_left.add_child(tl_v)
	objective_label = Label.new()
	objective_label.text = "QUEST: Step on Floor Switch to open Boss Door"
	objective_label.add_theme_font_size_override("font_size", 13)
	objective_label.add_theme_color_override("font_color", Color(0.95, 0.96, 1.0))
	tl_v.add_child(objective_label)

	netcode_badge = Label.new()
	netcode_badge.text = "HOST AUTHORITY (RPCs: 0)"
	netcode_badge.add_theme_font_size_override("font_size", 12)
	netcode_badge.add_theme_color_override("font_color", Color(0.45, 0.92, 0.7))
	tl_v.add_child(netcode_badge)

	# Bottom-left 4-Hero Party Status Cards
	var party_hbox := HBoxContainer.new()
	party_hbox.position = Vector2(16.0, 616.0)
	party_hbox.add_theme_constant_override("separation", 10)
	hud_layer.add_child(party_hbox)

	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(182.0, 88.0)
		var cs := StyleBoxFlat.new()
		cs.bg_color = Color(0.07, 0.08, 0.13, 0.84)
		cs.border_color = h.accent_color
		cs.set_border_width_all(2)
		cs.set_corner_radius_all(8)
		card.add_theme_stylebox_override("panel", cs)
		party_hbox.add_child(card)

		var cv := VBoxContainer.new()
		card.add_child(cv)
		var name_lbl := Label.new()
		name_lbl.text = "[" + str(i + 1) + "] " + h.display_name
		name_lbl.add_theme_color_override("font_color", h.accent_color)
		name_lbl.add_theme_font_size_override("font_size", 14)
		cv.add_child(name_lbl)

		var bar := ProgressBar.new()
		bar.max_value = h.max_hp
		bar.value = h.hp
		bar.custom_minimum_size = Vector2(160.0, 14.0)
		bar.show_percentage = false
		var bsb := StyleBoxFlat.new()
		bsb.bg_color = Color(0.24, 0.88, 0.42)
		bsb.set_corner_radius_all(3)
		bar.add_theme_stylebox_override("fill", bsb)
		cv.add_child(bar)

		var status_lbl := Label.new()
		status_lbl.text = "HP " + str(int(h.hp)) + "/" + str(int(h.max_hp))
		status_lbl.add_theme_font_size_override("font_size", 12)
		status_lbl.add_theme_color_override("font_color", Color(0.9, 0.92, 0.98))
		cv.add_child(status_lbl)

		party_cards.append({"panel": card, "style": cs, "bar": bar, "status": status_lbl})

	# Bottom-right Active Hero Skill Hotbar
	var skill_panel := PanelContainer.new()
	skill_panel.position = Vector2(780.0, 622.0)
	skill_panel.custom_minimum_size = Vector2(484.0, 80.0)
	var sp_style := StyleBoxFlat.new()
	sp_style.bg_color = Color(0.06, 0.08, 0.14, 0.86)
	sp_style.border_color = Color(0.95, 0.78, 0.25, 0.85)
	sp_style.set_border_width_all(2)
	sp_style.set_corner_radius_all(8)
	skill_panel.add_theme_stylebox_override("panel", sp_style)
	hud_layer.add_child(skill_panel)

	skill_bar_label = Label.new()
	skill_bar_label.add_theme_font_size_override("font_size", 13)
	skill_bar_label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.9))
	skill_panel.add_child(skill_bar_label)

	# Victory PostGame Summary Overlay (top-center so Treasure Chest & 4 Heroes remain clearly visible below!)
	victory_panel = PanelContainer.new()
	victory_panel.position = Vector2(360.0, 22.0)
	victory_panel.custom_minimum_size = Vector2(560.0, 270.0)
	victory_panel.visible = false
	var vp_style := StyleBoxFlat.new()
	vp_style.bg_color = Color(0.06, 0.05, 0.11, 0.9)
	vp_style.border_color = Color(1.0, 0.84, 0.25, 0.98)
	vp_style.set_border_width_all(3)
	vp_style.set_corner_radius_all(12)
	victory_panel.add_theme_stylebox_override("panel", vp_style)
	hud_layer.add_child(victory_panel)

	var vp_v := VBoxContainer.new()
	vp_v.add_theme_constant_override("separation", 10)
	victory_panel.add_child(vp_v)

	var v_title := Label.new()
	v_title.text = "BOSS DEFEATED — VICTORY!"
	v_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v_title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.28))
	v_title.add_theme_font_size_override("font_size", 26)
	vp_v.add_child(v_title)

	victory_stats_label = Label.new()
	victory_stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	victory_stats_label.add_theme_color_override("font_color", Color(0.94, 0.95, 1.0))
	victory_stats_label.add_theme_font_size_override("font_size", 15)
	vp_v.add_child(victory_stats_label)


func _update_skill_bar() -> void:
	if skill_bar_label == null:
		return
	var h := get_active_hero()
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	skill_bar_label.text = "ACTIVE: %s (1-4 Switch) | WASD Move\n[SPACE] Attack   [Q] %s   [E] %s   [R] Revive" % [
		h.display_name, str(cfg["q_name"]), str(cfg["e_name"])
	]


func _update_hud() -> void:
	match phase:
		GamePhase.ENTRANCE:
			objective_label.text = "QUEST: Boss Door OPEN! Enter the Arena!" if boss_door_open else "QUEST: Stand on Floor Switch to unlock Boss Door"
		GamePhase.BOSS_FIGHT:
			objective_label.text = "QUEST: Defeat Imp Boss! Block Trample w/ Tank [Q]"
		GamePhase.VICTORY:
			objective_label.text = "VICTORY! Treasure Chest unlocked!"
		GamePhase.DEFEAT:
			objective_label.text = "DEFEAT — Party Fallen"

	netcode_badge.text = "SERVER AUTHORITY (RPCs: %d | Stuns: %d)" % [
		ActionBus.total_rpc_dispatches, boss.stun_count if boss != null else 0
	]

	if boss != null and boss_panel.visible:
		boss_hp_bar.value = boss.hp
		boss_state_label.text = "STATE: " + boss.get_pattern_label()

	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		var card: Dictionary = party_cards[i]
		var bar: ProgressBar = card["bar"] as ProgressBar
		var status: Label = card["status"] as Label
		var style: StyleBoxFlat = card["style"] as StyleBoxFlat
		bar.value = h.hp
		var tag := "DOWNED" if h.is_downed else ("SHIELD!" if h.shield_active else "HP %d/%d" % [int(h.hp), int(h.max_hp)])
		status.text = tag + (" [YOU]" if i == active_hero_index else " [AI]")
		style.set_border_width_all(3 if i == active_hero_index else 1)


func _show_victory_panel() -> void:
	var lines: PackedStringArray = PackedStringArray()
	lines.append("Treasure Chest Opened! Party Co-op Summary:")
	lines.append("")
	for h in heroes:
		lines.append("• %-6s  |  DMG: %4d  |  HEAL: %3d  |  HP: %d/%d" % [
			h.display_name, int(h.total_damage_dealt), int(h.total_healing_done), int(h.hp), int(h.max_hp)
		])
	lines.append("")
	lines.append("Boss Stuns (Tank Shield): %d   |   Server RPCs: %d" % [boss.stun_count, ActionBus.total_rpc_dispatches])
	victory_stats_label.text = "\\n".join(lines)
	victory_panel.visible = true
`,
  );

  // 11. scenes/boss_room.tscn
  writeText(
    path.join(outputDir, 'scenes', 'boss_room.tscn'),
    `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/boss_room_game.gd" id="1"]

[node name="BossRoom" type="Node3D"]
script = ExtResource("1")
`,
  );

  // 12. tests/verify_and_capture.gd (using reportsPathsGd — ZERO hardcoded absolute paths!)
  const pathsHeader = reportsPathsGd('boss-room', 'boss-room-verification.json');
  writeText(
    path.join(outputDir, 'tests', 'verify_and_capture.gd'),
    `extends Node
## Automated E2E verification & HD screenshot capture harness for Boss Room (Godot 4.7.2).

${pathsHeader}

const BOSS_ROOM_SCENE := preload("res://scenes/boss_room.tscn")

var checks: Array[Dictionary] = []
var captures: Array[String] = []


func _record(check_name: String, passed: bool, detail: String = "") -> void:
	checks.append({"name": check_name, "passed": passed, "detail": detail})
	print(("[PASS] " if passed else "[FAIL] ") + check_name + ("" if detail == "" else " -- " + detail))


func _wait_frames(count: int) -> void:
	for _i in count:
		await get_tree().process_frame


func _capture(filename: String) -> void:
	DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
	await RenderingServer.frame_post_draw
	var img: Image = get_viewport().get_texture().get_image()
	var full_path: String = SCREENSHOT_DIR.path_join(filename)
	var err: Error = img.save_png(full_path)
	if err == OK:
		captures.append(filename)
		print("[CAPTURE] ", filename, " (", img.get_width(), "x", img.get_height(), ")")
	else:
		push_error("Failed to save screenshot: " + full_path)


func _ready() -> void:
	var game: BossRoomGame = BOSS_ROOM_SCENE.instantiate() as BossRoomGame
	add_child(game)
	await _wait_frames(8)

	# 1. Verify all 4 hero classes + Boss + Imps + Dungeon assets instantiated
	_record("party_4_classes_spawned", game.heroes.size() == 4, "heroes=" + str(game.heroes.size()))
	_record("boss_and_imps_spawned", game.boss != null and game.enemies.size() >= 3, "enemies=" + str(game.enemies.size()))
	_record("dungeon_fbx_assets_built", game.dungeon != null and game.dungeon.door_node != null and game.dungeon.switch_node != null and game.dungeon.chest_node != null, "door/switch/chest ready")

	# 2. Scene 1 Capture: Entrance Corridor + Floor Switch puzzle -> activate switch & open Boss Door
	game.heroes[0].position = Vector3(0.0, 0.0, 25.2)
	game.heroes[1].position = Vector3(2.8, 0.0, 26.8)
	game.heroes[2].position = Vector3(-2.8, 0.0, 26.5)
	game.heroes[3].position = Vector3(3.6, 0.0, 24.4)
	game.activate_floor_switch()
	game.camera_override = true
	game.camera.position = Vector3(0.0, 12.5, 36.5)
	game.camera.look_at(Vector3(0.0, 2.2, 20.0), Vector3.UP)
	await _wait_frames(12)
	_record("floor_switch_opens_boss_door", game.switch_activated and game.boss_door_open, "door_open=" + str(game.boss_door_open))
	await _capture("01_entrance_switch_door.png")

	# 3. Enter Boss Arena & verify dramatic Boss Fight framing (matches Unity Boss.png angle!)
	game.enter_boss_arena()
	game.boss.position = Vector3(-2.6, 0.0, -1.5)
	game.boss.look_at_flat(Vector3(3.0, 0.0, 4.5))
	game.enemies[1].position = Vector3(-9.2, 0.0, -6.5)
	game.enemies[2].position = Vector3(-7.0, 0.0, -7.2)
	# Position 4 heroes in dramatic Boss Room co-op formation
	game.heroes[0].position = Vector3(2.8, 0.0, 2.5)   # Tank facing Boss with shield
	game.heroes[0].look_at_flat(game.boss.position)
	game.heroes[1].position = Vector3(8.2, 0.0, 2.2)   # Archer firing arrow
	game.heroes[1].look_at_flat(game.boss.position)
	game.heroes[2].position = Vector3(5.0, 0.0, -4.2)  # Mage casting green heal aura near chest
	game.heroes[2].look_at_flat(game.boss.position)
	game.heroes[3].position = Vector3(0.8, 0.0, 6.2)   # Rogue flanking
	game.heroes[3].look_at_flat(game.boss.position)

	# Fire authentic class skills for active combat frame
	var boss_hp_before: float = game.boss.hp
	game.trigger_hero_skill_e(game.heroes[0])  # Tank Hammer Smash hit
	game.trigger_hero_skill_q(game.heroes[0])  # Tank Charged Shield
	game.trigger_hero_skill_q(game.heroes[1])  # Archer Power Shot
	game.trigger_hero_skill_q(game.heroes[2])  # Mage Heal Ring AOE
	game.trigger_hero_basic_attack(game.heroes[3])
	game.camera.position = Vector3(-3.8, 7.6, 12.6)
	game.camera.look_at(Vector3(1.2, 2.1, -4.2), Vector3.UP)
	await _wait_frames(8)
	_record("boss_arena_combat_active", game.phase == BossRoomGame.GamePhase.BOSS_FIGHT and ActionBus.total_rpc_dispatches >= 5, "rpcs=" + str(ActionBus.total_rpc_dispatches))
	await _capture("02_boss_arena_combat.png")

	# Let projectiles land & verify damage + cheat-range validation on ActionBus
	await _wait_frames(18)
	_record("heroes_damage_boss", game.boss.hp < boss_hp_before, "hp=" + str(int(game.boss.hp)) + "/" + str(int(boss_hp_before)))
	var cheat_rejected: bool = not ActionBus.request_action("CheatClient", "aoe_test", {"origin": Vector3.ZERO, "target_pos": Vector3(99.0, 0.0, 0.0)}, 0.0, 5.0)
	_record("server_authority_range_check", cheat_rejected and ActionBus.rejected_out_of_range >= 1, "rejected=" + str(ActionBus.rejected_out_of_range))

	# 4. Scene 3 Capture: Boss Trample Telegraph -> collides with Tank's Charged Shield -> BOSS STUNNED!
	game.boss.position = Vector3(-5.5, 0.0, -2.0)
	game.heroes[0].position = Vector3(2.2, 0.0, -2.0)
	game.heroes[0].look_at_flat(game.boss.position)
	game.heroes[0].activate_charged_shield(5.0)
	game.boss.start_trample_toward(game.heroes[0].position)
	game.camera.position = Vector3(0.0, 14.5, 13.5)
	game.camera.look_at(Vector3(-1.0, 1.2, -2.0), Vector3.UP)
	await _wait_frames(6)
	await _capture("03_boss_trample_telegraph.png")

	# Advance Boss Trample until Tank ChargedShield stuns the Boss
	for _step in 120:
		if game.boss.pattern == EnemyUnit.BossPattern.STUNNED:
			break
		game.boss.step_enemy(0.03, game.heroes, Rect2(-14.2, -14.0, 28.4, 28.5), game._on_boss_aoe_burst)
		await get_tree().process_frame
	_record("tank_charged_shield_stuns_trample_boss", game.boss.pattern == EnemyUnit.BossPattern.STUNNED and game.boss.stun_count >= 1, "stun_count=" + str(game.boss.stun_count))

	# 5. Verify Mage Heal AOE + Downed Hero ReviveAction + Rogue DashAttack
	game.heroes[3].take_damage(500.0)
	var was_downed: bool = game.heroes[3].is_downed
	game.heroes[2].position = game.heroes[3].position + Vector3(1.8, 0.0, 0.0)
	game.trigger_revive_nearest(game.heroes[2])
	_record("downed_hero_revived_by_ally", was_downed and not game.heroes[3].is_downed, "rogue_hp=" + str(int(game.heroes[3].hp)))

	game.heroes[1].take_damage(70.0)
	var archer_hp_low: float = game.heroes[1].hp
	ActionBus.active_cooldowns.clear()
	game.heroes[2].position = game.heroes[1].position + Vector3(-2.0, 0.0, 0.0)
	game.trigger_hero_skill_q(game.heroes[2])
	_record("mage_heal_aoe_restores_party", game.heroes[1].hp > archer_hp_low, "archer_hp=" + str(int(archer_hp_low)) + "->" + str(int(game.heroes[1].hp)))

	# Scene 4 Capture: Stunned Boss with golden stars + Rogue Dash + Mage Heal Ring
	game.trigger_hero_skill_q(game.heroes[3])
	game.camera.position = Vector3(1.5, 11.5, 11.8)
	game.camera.look_at(game.boss.position + Vector3(0.0, 1.8, 0.0), Vector3.UP)
	await _wait_frames(8)
	await _capture("04_boss_stunned_and_coop_skills.png")

	# 6. Scene 5 Capture: Defeat Imp Boss -> Treasure Chest Opens -> Victory PostGame Summary
	game.boss.take_damage(9999.0)
	await _wait_frames(10)
	_record("boss_defeat_opens_chest_and_victory", game.phase == BossRoomGame.GamePhase.VICTORY and game.chest_opened and game.victory_panel.visible, "chest_open=" + str(game.chest_opened))

	game.heroes[0].position = Vector3(-3.2, 0.0, -8.8)
	game.heroes[1].position = Vector3(-1.1, 0.0, -8.2)
	game.heroes[2].position = Vector3(1.1, 0.0, -8.2)
	game.heroes[3].position = Vector3(3.2, 0.0, -8.8)
	for h in game.heroes:
		h.look_at_flat(Vector3(0.0, 0.0, -13.2))
	game.camera.position = Vector3(0.0, 9.5, -0.5)
	game.camera.look_at(Vector3(0.0, 2.2, -13.2), Vector3.UP)
	await _wait_frames(10)
	await _capture("05_victory_treasure_chest.png")

	# 7. Write verification report JSON
	var passed_count: int = 0
	var failed_count: int = 0
	for c in checks:
		if bool(c["passed"]):
			passed_count += 1
		else:
			failed_count += 1

	var report := {
		"game": "Unity Boss Room (com.unity.multiplayer.samples.coop)",
		"godotVersion": Engine.get_version_info().get("string", "4.7.2"),
		"totalChecks": checks.size(),
		"passedChecks": passed_count,
		"failedChecks": failed_count,
		"captures": captures,
		"rpcDispatches": ActionBus.total_rpc_dispatches,
		"bossStuns": game.boss.stun_count,
		"checks": checks,
	}
	var out_dir := REPORT_PATH.get_base_dir()
	DirAccess.make_dir_recursive_absolute(out_dir)
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(report, "  "))
		f.close()
	print("[SUMMARY] Boss Room E2E: ", passed_count, "/", checks.size(), " passed, ", failed_count, " failed")
	CharacterVisual._cached_scene = null
	CharacterVisual._tex_cache.clear()
	game.queue_free()
	await _wait_frames(2)
	get_tree().quit(0 if failed_count == 0 else 1)
`,
  );

  // 13. tests/verify_and_capture.tscn
  writeText(
    path.join(outputDir, 'tests', 'verify_and_capture.tscn'),
    `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://tests/verify_and_capture.gd" id="1"]

[node name="VerifyBossRoom" type="Node"]
script = ExtResource("1")
`,
  );

  // 14. Write porting metrics report
  const metrics = {
    game: 'Boss Room (Official Unity Co-op RPG Sample)',
    unityRepo: 'https://github.com/Unity-Technologies/com.unity.multiplayer.samples.coop',
    godotTarget: '4.7.2',
    modelsCopied: modelFiles.length,
    texturesConvertedTgaToPng: texStats.convertedTga,
    texturesCopiedPng: texStats.copiedPng,
    unpackedMetalSmoothEmissive: texStats.unpackedMse,
    audioWavCopied: audioFiles.length,
    gdScriptsGenerated: 6,
    scenesGenerated: 2,
    architectureMappings: {
      'Unity.Netcode.NetworkBehaviour + ServerRpc/ClientRpc': 'Godot 4 MultiplayerAPI @rpc("any_peer") / @rpc("authority") ActionBus',
      'ServerActionPlayer + ClientActionPlayer': 'scripts/network_action_bus.gd (cooldown + range cheat check + action broadcast)',
      'Unity URP ShaderGraph (MetalSmoothEmissive)': 'Unpacked R=Metallic, 1-G=Roughness, B=Emissive PNG + StandardMaterial3D',
      'FBX CharacterSet + DungeonPieces + Animated Props': 'Native Godot 4.7.2 ufbx import + Skeleton3D + AnimationPlayer',
      '4 Hero Classes + Imp Boss + FloorSwitch/Door/Chest': '100% playable co-op loop with party AI & Tank Shield-Stun counter',
    },
  };
  writeText(
    path.join(CONVERTER_ROOT, 'reports', 'boss-room-metrics.json'),
    JSON.stringify(metrics, null, 2),
  );

  return metrics;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputDir = process.argv[2] || path.join(CONVERTER_ROOT, 'samples', 'unity-boss-room');
  const outputDir = process.argv[3] || path.join(CONVERTER_ROOT, 'ported', 'godot-boss-room');
  const res = portUnityBossRoom(inputDir, outputDir);
  console.log('[port-boss-room] Complete:', JSON.stringify(res, null, 2));
}
