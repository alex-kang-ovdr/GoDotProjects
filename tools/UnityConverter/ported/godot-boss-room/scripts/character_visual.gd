extends Node3D
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
