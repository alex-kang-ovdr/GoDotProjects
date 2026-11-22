extends Node3D
class_name CharacterVisual
## Text-only PlayForge Template CharacterVisual loading baked per-role ArrayMesh .tres & ImageTexture .tres.

const MODEL_DIR := "res://assets/models/"
const TEX_DIR := "res://assets/textures/"

static var _tex_cache: Dictionary = {}

var role_id: String = "tank"
var model_pivot: Node3D = null
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
	if not ResourceLoader.exists(full):
		return null
	var tex: Texture2D = load(full) as Texture2D
	_tex_cache[file_name] = tex
	return tex


func setup(p_role: String, p_scale: float = 1.0) -> void:
	role_id = p_role.to_lower()
	base_scale = p_scale

	model_pivot = Node3D.new()
	model_pivot.name = "ModelPivot"
	model_pivot.scale = Vector3.ONE * base_scale
	add_child(model_pivot)

	var mesh_path := MODEL_DIR + "char_" + role_id + ".tres"
	var mesh_res: ArrayMesh = load(mesh_path) as ArrayMesh
	if mesh_res == null:
		return
	var mi := MeshInstance3D.new()
	mi.mesh = mesh_res
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for s in mesh_res.get_surface_count():
		var sname: String = mesh_res.surface_get_name(s)
		var mat: StandardMaterial3D = _build_material_for_mesh(sname)
		mi.set_surface_override_material(s, mat)
		original_mats.append(mat)
	model_pivot.add_child(mi)
	active_meshes.append(mi)


func _build_material_for_mesh(mesh_name: String) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.roughness = 0.62
	mat.metallic = 0.08
	var low := mesh_name.to_lower()
	var tex_file := ""

	if low.contains("eyes"):
		var is_enemy := role_id == "boss" or role_id == "imp"
		tex_file = "Enemy_Eyes.tres" if is_enemy else "Hero_Eyes.tres"
		mat.albedo_texture = _get_tex(tex_file)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		if role_id == "boss":
			mat.albedo_color = Color(1.0, 0.85, 0.25)
			mat.emission_enabled = true
			mat.emission = Color(1.0, 0.28, 0.05)
			mat.emission_energy_multiplier = 3.0
		return mat
	if low.contains("mouth"):
		var is_enemy := role_id == "boss" or role_id == "imp"
		tex_file = "Enemy_Mouths.tres" if is_enemy else "Hero_Mouths.tres"
		mat.albedo_texture = _get_tex(tex_file)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		return mat

	match role_id:
		"tank":
			tex_file = "Tank_Hair_Boy_CLR.tres" if low.contains("hair") else ("Tank_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Tank_Weapon_CLR.tres" if (low.contains("weapon") or low.contains("shield")) else "Tank_Torso_CLR.tres"))
		"archer":
			tex_file = "Archer_Hair_Boy_CLR.tres" if low.contains("hair") else ("Archer_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Archer_Weapons_CLR.tres" if (low.contains("weapon") or low.contains("quiver")) else "Archer_Torso_CLR.tres"))
		"mage":
			tex_file = "Mage_Hair_Girl_CLR.tres" if low.contains("hair") else ("Mage_Head_Girl_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Mage_Weapons_CLR.tres" if low.contains("weapon") else "Mage_Torso_CLR_Girl.tres"))
		"rogue":
			tex_file = "Rogue_Hair_Boy_CLR.tres" if low.contains("hair") else ("Rogue_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Rogue_Weapon_CLR.tres" if low.contains("weapon") else "Rogue_Torso_CLR.tres"))
		"imp":
			tex_file = "Imp_Head_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Imp_Weapons_CLR.tres" if low.contains("weapon") else "Imp_Torso_CLR.tres")
		"boss":
			tex_file = "Imp_Helmet_CLR.tres" if low.contains("helmet") else ("Boss_Head_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Imp_Weapons_CLR.tres" if low.contains("weapon") else "Boss_Torso_CLR.tres"))
	if tex_file != "":
		mat.albedo_texture = _get_tex(tex_file)
	return mat


func trigger_attack(duration: float = 0.32) -> void:
	attack_anim_timer = duration


func trigger_hit_flash(duration: float = 0.09) -> void:
	hit_flash_timer = duration


func animate(delta: float, move_speed: float, charging: bool = false) -> void:
	if model_pivot == null:
		return
	walk_phase += delta * (9.5 if move_speed > 0.15 else 2.4)
	var bob_y: float = absf(sin(walk_phase)) * (0.14 if move_speed > 0.15 else 0.03)
	var pitch_x: float = 0.28 if charging else (-0.12 if shield_raised else (-1.35 if is_downed else 0.0))
	var roll_z: float = sin(walk_phase * 4.5) * 0.22 if is_stunned else sin(walk_phase) * (0.07 if move_speed > 0.15 else 0.012)
	if attack_anim_timer > 0.0:
		attack_anim_timer = maxf(0.0, attack_anim_timer - delta)
		pitch_x += sin((attack_anim_timer / 0.32) * PI) * 0.36
	model_pivot.position.y = lerpf(model_pivot.position.y, -0.35 if is_downed else bob_y, minf(1.0, delta * 14.0))
	model_pivot.rotation = Vector3(lerpf(model_pivot.rotation.x, pitch_x, minf(1.0, delta * 16.0)), 0.0, lerpf(model_pivot.rotation.z, roll_z, minf(1.0, delta * 16.0)))
	if hit_flash_timer > 0.0:
		hit_flash_timer = maxf(0.0, hit_flash_timer - delta)
		var on := hit_flash_timer > 0.0
		for mat in original_mats:
			if mat.shading_mode != BaseMaterial3D.SHADING_MODE_UNSHADED:
				mat.emission_enabled = on
				mat.emission = Color(0.9, 0.2, 0.12)
				mat.emission_energy_multiplier = 0.42
