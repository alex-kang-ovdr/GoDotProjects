extends Node3D
## Unreal Engine USkeletalMeshComponent + UAnimSequence -> Godot 4.7 13-Bone Articulated Skeleton3D + AnimationPlayer
## Supports loading bone hierarchy & animation tracks directly extracted from UE binary `.uasset` packages
## (`skeleton_data_path`), with full 2-segment limbs (upperarm->forearm, thigh->calf), chest core, visor, and jetpack flames.

@export var character_style: String = "bot" # "bot" (Stack O Bot) | "manny" (Third Person)
@export var skeleton_data_path: String = "" # Optional res://assets/skeletons/<id>.json extracted from binary .uasset
@export var primary_color: Color = Color(0.18, 0.62, 0.96, 1.0)
@export var accent_color: Color = Color(0.95, 0.85, 0.25, 1.0)
@export var is_offline: bool = false

var skeleton: Skeleton3D = null
var anim_player: AnimationPlayer = null
var flame_l: Node3D = null
var flame_r: Node3D = null
var bone_count_loaded: int = 0
var loaded_from_binary: bool = false

var _bone_ids: Dictionary = {}
var _current_clip: String = ""
var _binary_payload: Dictionary = {}


func _ready() -> void:
	_load_binary_skeleton_if_present()
	_build_skeleton_and_rig()
	_build_animation_library()
	play_state("Offline" if is_offline else "Idle")


func _load_binary_skeleton_if_present() -> void:
	if skeleton_data_path.is_empty() or not ResourceLoader.exists(skeleton_data_path):
		if not skeleton_data_path.is_empty() and FileAccess.file_exists(skeleton_data_path):
			var txt := FileAccess.get_file_as_string(skeleton_data_path)
			var parsed: Variant = JSON.parse_string(txt)
			if parsed is Dictionary:
				_binary_payload = parsed
				loaded_from_binary = true
		return
	var txt := FileAccess.get_file_as_string(skeleton_data_path)
	var parsed: Variant = JSON.parse_string(txt)
	if parsed is Dictionary:
		_binary_payload = parsed
		loaded_from_binary = true


func _build_skeleton_and_rig() -> void:
	skeleton = Skeleton3D.new()
	skeleton.name = "UE_Skeleton3D"
	add_child(skeleton)

	var is_bot := (character_style == "bot")
	var bones_to_create: Array = []

	if loaded_from_binary and _binary_payload.has("bones") and _binary_payload["bones"] is Array:
		var bin_bones: Array = _binary_payload["bones"]
		for b in bin_bones:
			var p: Array = b.get("position_m", [0.0, 0.0, 0.0])
			var pidx: int = int(b.get("parent_index", -1))
			bones_to_create.append({
				"name": str(b.get("name", "bone")),
				"parent_index": pidx,
				"offset": Vector3(float(p[0]), float(p[1]), float(p[2]))
			})
	else:
		# Default 13-bone articulated UE hierarchy converted to Godot meters
		var default_defs := [
			["root", -1, Vector3(0.0, -0.90, 0.0)],
			["pelvis", 0, Vector3(0.0, 0.68, 0.0)],
			["spine", 1, Vector3(0.0, 0.20, 0.0)],
			["chest", 2, Vector3(0.0, 0.22, 0.0)],
			["head", 3, Vector3(0.0, 0.30 if is_bot else 0.34, 0.0)],
			["upperarm_l", 3, Vector3(-0.34 if is_bot else -0.30, 0.06, 0.0)],
			["forearm_l", 5, Vector3(0.0, -0.26, 0.0)],
			["upperarm_r", 3, Vector3(0.34 if is_bot else 0.30, 0.06, 0.0)],
			["forearm_r", 7, Vector3(0.0, -0.26, 0.0)],
			["thigh_l", 1, Vector3(-0.15 if is_bot else -0.13, -0.10, 0.0)],
			["calf_l", 9, Vector3(0.0, -0.28, 0.0)],
			["thigh_r", 1, Vector3(0.15 if is_bot else 0.13, -0.10, 0.0)],
			["calf_r", 11, Vector3(0.0, -0.28, 0.0)]
		]
		for d in default_defs:
			bones_to_create.append({"name": d[0], "parent_index": d[1], "offset": d[2]})

	for bdef in bones_to_create:
		var idx := skeleton.add_bone(bdef["name"])
		_bone_ids[bdef["name"]] = idx
		if int(bdef["parent_index"]) >= 0:
			skeleton.set_bone_parent(idx, int(bdef["parent_index"]))
		skeleton.set_bone_rest(idx, Transform3D(Basis.IDENTITY, bdef["offset"]))
		skeleton.set_bone_pose_position(idx, bdef["offset"])

	bone_count_loaded = skeleton.get_bone_count()

	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color(0.88, 0.46, 0.14, 1.0) if is_offline else primary_color
	body_mat.metallic = 0.45 if is_bot else 0.22
	body_mat.roughness = 0.32 if is_bot else 0.48

	var trim_mat := StandardMaterial3D.new()
	trim_mat.albedo_color = Color(0.82, 0.88, 0.94, 1.0) if not is_offline else Color(0.45, 0.42, 0.38, 1.0)
	trim_mat.metallic = 0.55
	trim_mat.roughness = 0.30

	var dark_mat := StandardMaterial3D.new()
	dark_mat.albedo_color = Color(0.16, 0.20, 0.26, 1.0)
	dark_mat.metallic = 0.55
	dark_mat.roughness = 0.38

	var glow_mat := StandardMaterial3D.new()
	glow_mat.albedo_color = Color(0.28, 0.28, 0.28, 1.0) if is_offline else accent_color
	if not is_offline:
		glow_mat.emission_enabled = true
		glow_mat.emission = accent_color
		glow_mat.emission_energy_multiplier = 2.0

	var core_mat := StandardMaterial3D.new()
	core_mat.albedo_color = Color(0.2, 0.2, 0.2, 1.0) if is_offline else Color(0.18, 0.92, 1.0, 1.0)
	if not is_offline:
		core_mat.emission_enabled = true
		core_mat.emission = Color(0.18, 0.92, 1.0, 1.0)
		core_mat.emission_energy_multiplier = 2.2

	# Pelvis & Lower Spine
	_attach_box("pelvis", "PelvisMesh", Vector3(0.38 if is_bot else 0.34, 0.18, 0.26), Vector3.ZERO, dark_mat)
	_attach_box("spine", "WaistMesh", Vector3(0.34 if is_bot else 0.32, 0.22, 0.24), Vector3.ZERO, trim_mat)

	# Chest + Power Core + Shoulder Pauldrons
	var chest_att := _attach_box("chest", "ChestMesh", Vector3(0.54 if is_bot else 0.46, 0.36, 0.34 if is_bot else 0.28), Vector3(0.0, 0.04, 0.0), body_mat)
	_add_child_box(chest_att, Vector3(0.16, 0.14, 0.06), Vector3(0.0, 0.04, -0.18 if is_bot else -0.15), core_mat)
	_add_child_box(chest_att, Vector3(0.16, 0.12, 0.26), Vector3(-0.32 if is_bot else -0.28, 0.14, 0.0), trim_mat)
	_add_child_box(chest_att, Vector3(0.16, 0.12, 0.26), Vector3(0.32 if is_bot else 0.28, 0.14, 0.0), trim_mat)

	# Head + Glowing Visor + Antenna
	var head_att := _attach_box("head", "HeadMesh", Vector3(0.46 if is_bot else 0.27, 0.38 if is_bot else 0.30, 0.42 if is_bot else 0.28), Vector3(0.0, 0.14, 0.0), body_mat)
	_add_child_box(head_att, Vector3(0.36 if is_bot else 0.23, 0.12, 0.08), Vector3(0.0, 0.15, -0.22 if is_bot else -0.15), glow_mat)

	if is_bot:
		var ant := MeshInstance3D.new()
		var ant_mesh := CylinderMesh.new()
		ant_mesh.top_radius = 0.018
		ant_mesh.bottom_radius = 0.028
		ant_mesh.height = 0.26
		ant_mesh.material = trim_mat
		ant.mesh = ant_mesh
		ant.position = Vector3(0.0, 0.44, 0.0)
		head_att.add_child(ant)

		var tip := MeshInstance3D.new()
		var tip_s := SphereMesh.new()
		tip_s.radius = 0.045
		tip_s.height = 0.09
		tip_s.material = core_mat
		tip.mesh = tip_s
		tip.position = Vector3(0.0, 0.58, 0.0)
		head_att.add_child(tip)

		# Twin Jetpack Thrusters + Dual-Stage Plasma Flames on Chest
		for side in [-1.0, 1.0]:
			var pack := MeshInstance3D.new()
			var pack_mesh := CylinderMesh.new()
			pack_mesh.top_radius = 0.095
			pack_mesh.bottom_radius = 0.11
			pack_mesh.height = 0.44
			pack_mesh.material = dark_mat
			pack.mesh = pack_mesh
			pack.position = Vector3(side * 0.14, 0.02, 0.24)
			chest_att.add_child(pack)

			var nozzle := MeshInstance3D.new()
			var nmesh := CylinderMesh.new()
			nmesh.top_radius = 0.08
			nmesh.bottom_radius = 0.10
			nmesh.height = 0.08
			nmesh.material = trim_mat
			nozzle.mesh = nmesh
			nozzle.position = Vector3(side * 0.14, -0.22, 0.24)
			chest_att.add_child(nozzle)

			var flame_root := Node3D.new()
			flame_root.position = Vector3(side * 0.14, -0.26, 0.24)
			flame_root.visible = false
			chest_att.add_child(flame_root)

			var outer_f := MeshInstance3D.new()
			var ofm := CylinderMesh.new()
			ofm.top_radius = 0.095
			ofm.bottom_radius = 0.015
			ofm.height = 0.62
			var ofmat := StandardMaterial3D.new()
			ofmat.albedo_color = Color(1.0, 0.56, 0.10, 1.0)
			ofmat.emission_enabled = true
			ofmat.emission = Color(1.0, 0.48, 0.06, 1.0)
			ofmat.emission_energy_multiplier = 3.5
			ofm.material = ofmat
			outer_f.mesh = ofm
			outer_f.position = Vector3(0.0, -0.30, 0.0)
			flame_root.add_child(outer_f)

			var inner_f := MeshInstance3D.new()
			var ifm := CylinderMesh.new()
			ifm.top_radius = 0.055
			ifm.bottom_radius = 0.01
			ifm.height = 0.38
			ifm.material = core_mat
			inner_f.mesh = ifm
			inner_f.position = Vector3(0.0, -0.18, 0.0)
			flame_root.add_child(inner_f)

			if side < 0.0:
				flame_l = flame_root
			else:
				flame_r = flame_root

	# 2-Segment Articulated Arms (UpperArm -> Forearm + Hand)
	_attach_box("upperarm_l", "UpperArmL", Vector3(0.14, 0.26, 0.14), Vector3(0.0, -0.13, 0.0), body_mat)
	_attach_box("forearm_l", "ForearmL", Vector3(0.12, 0.26, 0.12), Vector3(0.0, -0.13, 0.0), trim_mat)
	_attach_box("upperarm_r", "UpperArmR", Vector3(0.14, 0.26, 0.14), Vector3(0.0, -0.13, 0.0), body_mat)
	_attach_box("forearm_r", "ForearmR", Vector3(0.12, 0.26, 0.12), Vector3(0.0, -0.13, 0.0), trim_mat)

	# 2-Segment Articulated Legs (Thigh -> Calf + Boot)
	_attach_box("thigh_l", "ThighL", Vector3(0.17, 0.28, 0.17), Vector3(0.0, -0.14, 0.0), dark_mat)
	var calf_l_att := _attach_box("calf_l", "CalfL", Vector3(0.15, 0.28, 0.15), Vector3(0.0, -0.14, 0.0), body_mat)
	_add_child_box(calf_l_att, Vector3(0.18, 0.10, 0.24), Vector3(0.0, -0.28, -0.04), dark_mat)

	_attach_box("thigh_r", "ThighR", Vector3(0.17, 0.28, 0.17), Vector3(0.0, -0.14, 0.0), dark_mat)
	var calf_r_att := _attach_box("calf_r", "CalfR", Vector3(0.15, 0.28, 0.15), Vector3(0.0, -0.14, 0.0), body_mat)
	_add_child_box(calf_r_att, Vector3(0.18, 0.10, 0.24), Vector3(0.0, -0.28, -0.04), dark_mat)


func _add_child_box(parent: Node3D, size: Vector3, local_pos: Vector3, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	box.material = mat
	mi.mesh = box
	mi.position = local_pos
	parent.add_child(mi)


func _attach_box(bone_name: String, mesh_name: String, size: Vector3, local_pos: Vector3, mat: Material) -> BoneAttachment3D:
	var att := BoneAttachment3D.new()
	att.name = "Attach_" + bone_name
	if _bone_ids.has(bone_name):
		att.bone_name = bone_name
	skeleton.add_child(att)
	var mi := MeshInstance3D.new()
	mi.name = mesh_name
	var box := BoxMesh.new()
	box.size = size
	box.material = mat
	mi.mesh = box
	mi.position = local_pos
	att.add_child(mi)
	return att


func _build_animation_library() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "UE_AnimationPlayer"
	add_child(anim_player)

	var lib := AnimationLibrary.new()
	lib.add_animation("Idle", _make_idle_anim())
	lib.add_animation("Run", _make_run_anim())
	lib.add_animation("JumpStart", _make_jump_anim())
	lib.add_animation("JetpackHover", _make_jetpack_anim())
	lib.add_animation("FallLoop", _make_fall_anim())
	lib.add_animation("Land", _make_land_anim())
	lib.add_animation("Offline", _make_offline_anim())

	# Override / augment clips from binary UAnimSequence tracks if present
	if loaded_from_binary and _binary_payload.has("animations") and _binary_payload["animations"] is Array:
		for clip_data in _binary_payload["animations"]:
			var cname: String = str(clip_data.get("name", ""))
			var tracks: Array = clip_data.get("tracks", [])
			if not cname.is_empty() and tracks.size() > 0:
				var anim := _build_clip_from_binary_tracks(clip_data)
				if lib.has_animation(cname):
					lib.remove_animation(cname)
				lib.add_animation(cname, anim)

	anim_player.add_animation_library("", lib)


func _build_clip_from_binary_tracks(clip_data: Dictionary) -> Animation:
	var a := Animation.new()
	a.length = maxf(0.2, float(clip_data.get("duration_sec", 0.6)))
	if bool(clip_data.get("loop", true)):
		a.loop_mode = Animation.LOOP_LINEAR
	var by_bone: Dictionary = {}
	for tr in clip_data.get("tracks", []):
		var bn: String = str(tr.get("bone", ""))
		if not by_bone.has(bn):
			by_bone[bn] = []
		by_bone[bn].append(tr)
	for bn in by_bone.keys():
		if not _bone_ids.has(bn):
			continue
		var keys: Array = []
		for tr in by_bone[bn]:
			var rd: Array = tr.get("rotation_deg", [0.0, 0.0, 0.0])
			keys.append([float(tr.get("time_sec", 0.0)), Vector3(float(rd[0]), float(rd[1]), float(rd[2]))])
		_add_rot_track(a, bn, keys)
	return a


func _add_rot_track(anim: Animation, bone: String, keys: Array) -> void:
	if not _bone_ids.has(bone):
		return
	var t := anim.add_track(Animation.TYPE_ROTATION_3D)
	anim.track_set_path(t, NodePath("UE_Skeleton3D:" + bone))
	for k in keys:
		var q := Quaternion.from_euler(Vector3(deg_to_rad(k[1].x), deg_to_rad(k[1].y), deg_to_rad(k[1].z)))
		anim.rotation_track_insert_key(t, float(k[0]), q)


func _add_pos_track(anim: Animation, bone: String, keys: Array) -> void:
	if not _bone_ids.has(bone):
		return
	var t := anim.add_track(Animation.TYPE_POSITION_3D)
	anim.track_set_path(t, NodePath("UE_Skeleton3D:" + bone))
	for k in keys:
		anim.position_track_insert_key(t, float(k[0]), k[1])


func _make_idle_anim() -> Animation:
	var a := Animation.new()
	a.length = 1.6
	a.loop_mode = Animation.LOOP_LINEAR
	_add_rot_track(a, "chest", [[0.0, Vector3(0, 0, 0)], [0.8, Vector3(3, 0, 0)], [1.6, Vector3(0, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(0, 0, -8)], [0.8, Vector3(4, 0, -10)], [1.6, Vector3(0, 0, -8)]])
	_add_rot_track(a, "forearm_l", [[0.0, Vector3(14, 0, 0)], [0.8, Vector3(18, 0, 0)], [1.6, Vector3(14, 0, 0)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(0, 0, 8)], [0.8, Vector3(4, 0, 10)], [1.6, Vector3(0, 0, 8)]])
	_add_rot_track(a, "forearm_r", [[0.0, Vector3(14, 0, 0)], [0.8, Vector3(18, 0, 0)], [1.6, Vector3(14, 0, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3.ZERO], [1.6, Vector3.ZERO]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3.ZERO], [1.6, Vector3.ZERO]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3.ZERO], [1.6, Vector3.ZERO]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3.ZERO], [1.6, Vector3.ZERO]])
	return a


func _make_run_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.6
	a.loop_mode = Animation.LOOP_LINEAR
	_add_rot_track(a, "chest", [[0.0, Vector3(-14, 6, 0)], [0.3, Vector3(-14, -6, 0)], [0.6, Vector3(-14, 6, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(44, 0, 0)], [0.3, Vector3(-38, 0, 0)], [0.6, Vector3(44, 0, 0)]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-16, 0, 0)], [0.3, Vector3(-52, 0, 0)], [0.6, Vector3(-16, 0, 0)]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(-38, 0, 0)], [0.3, Vector3(44, 0, 0)], [0.6, Vector3(-38, 0, 0)]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3(-52, 0, 0)], [0.3, Vector3(-16, 0, 0)], [0.6, Vector3(-52, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(-36, 0, -10)], [0.3, Vector3(40, 0, -10)], [0.6, Vector3(-36, 0, -10)]])
	_add_rot_track(a, "forearm_l", [[0.0, Vector3(48, 0, 0)], [0.3, Vector3(24, 0, 0)], [0.6, Vector3(48, 0, 0)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(40, 0, 10)], [0.3, Vector3(-36, 0, 10)], [0.6, Vector3(40, 0, 10)]])
	_add_rot_track(a, "forearm_r", [[0.0, Vector3(24, 0, 0)], [0.3, Vector3(48, 0, 0)], [0.6, Vector3(24, 0, 0)]])
	return a


func _make_jump_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.4
	_add_rot_track(a, "chest", [[0.0, Vector3(8, 0, 0)], [0.4, Vector3(-4, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(115, 0, -22)], [0.4, Vector3(135, 0, -26)]])
	_add_rot_track(a, "forearm_l", [[0.0, Vector3(28, 0, 0)], [0.4, Vector3(18, 0, 0)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(115, 0, 22)], [0.4, Vector3(135, 0, 26)]])
	_add_rot_track(a, "forearm_r", [[0.0, Vector3(28, 0, 0)], [0.4, Vector3(18, 0, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(46, 0, 0)], [0.4, Vector3(32, 0, 0)]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-56, 0, 0)], [0.4, Vector3(-42, 0, 0)]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(-20, 0, 0)], [0.4, Vector3(-12, 0, 0)]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3(-24, 0, 0)], [0.4, Vector3(-18, 0, 0)]])
	return a


func _make_jetpack_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.5
	a.loop_mode = Animation.LOOP_LINEAR
	_add_rot_track(a, "chest", [[0.0, Vector3(-22, 0, 0)], [0.25, Vector3(-26, 0, 0)], [0.5, Vector3(-22, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(-28, 0, -34)], [0.25, Vector3(-34, 0, -38)], [0.5, Vector3(-28, 0, -34)]])
	_add_rot_track(a, "forearm_l", [[0.0, Vector3(22, 0, 0)], [0.5, Vector3(22, 0, 0)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(-28, 0, 34)], [0.25, Vector3(-34, 0, 38)], [0.5, Vector3(-28, 0, 34)]])
	_add_rot_track(a, "forearm_r", [[0.0, Vector3(22, 0, 0)], [0.5, Vector3(22, 0, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(-18, 0, 0)], [0.25, Vector3(-24, 0, 0)], [0.5, Vector3(-18, 0, 0)]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-38, 0, 0)], [0.25, Vector3(-44, 0, 0)], [0.5, Vector3(-38, 0, 0)]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(-12, 0, 0)], [0.25, Vector3(-18, 0, 0)], [0.5, Vector3(-12, 0, 0)]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3(-28, 0, 0)], [0.25, Vector3(-34, 0, 0)], [0.5, Vector3(-28, 0, 0)]])
	return a


func _make_fall_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.5
	a.loop_mode = Animation.LOOP_LINEAR
	_add_rot_track(a, "chest", [[0.0, Vector3(6, 0, 0)], [0.5, Vector3(6, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(72, 0, -34)], [0.25, Vector3(92, 0, -40)], [0.5, Vector3(72, 0, -34)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(92, 0, 40)], [0.25, Vector3(72, 0, 34)], [0.5, Vector3(92, 0, 40)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(24, 0, 0)], [0.5, Vector3(24, 0, 0)]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-36, 0, 0)], [0.5, Vector3(-36, 0, 0)]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(-16, 0, 0)], [0.5, Vector3(-16, 0, 0)]])
	return a


func _make_land_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.2
	_add_rot_track(a, "chest", [[0.0, Vector3(-18, 0, 0)], [0.2, Vector3(0, 0, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(34, 0, 0)], [0.2, Vector3.ZERO]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-56, 0, 0)], [0.2, Vector3.ZERO]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(34, 0, 0)], [0.2, Vector3.ZERO]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3(-56, 0, 0)], [0.2, Vector3.ZERO]])
	return a


func _make_offline_anim() -> Animation:
	var a := Animation.new()
	a.length = 0.2
	_add_rot_track(a, "chest", [[0.0, Vector3(-28, 0, 0)]])
	_add_rot_track(a, "head", [[0.0, Vector3(-30, 0, 0)]])
	_add_rot_track(a, "upperarm_l", [[0.0, Vector3(-20, 0, -16)]])
	_add_rot_track(a, "forearm_l", [[0.0, Vector3(36, 0, 0)]])
	_add_rot_track(a, "upperarm_r", [[0.0, Vector3(-20, 0, 16)]])
	_add_rot_track(a, "forearm_r", [[0.0, Vector3(36, 0, 0)]])
	_add_rot_track(a, "thigh_l", [[0.0, Vector3(28, 0, 0)]])
	_add_rot_track(a, "calf_l", [[0.0, Vector3(-48, 0, 0)]])
	_add_rot_track(a, "thigh_r", [[0.0, Vector3(28, 0, 0)]])
	_add_rot_track(a, "calf_r", [[0.0, Vector3(-48, 0, 0)]])
	return a


func play_state(state_name: String) -> void:
	if anim_player == null or state_name == _current_clip:
		return
	if anim_player.has_animation(state_name):
		_current_clip = state_name
		anim_player.play(state_name, 0.12)


func set_thruster_active(active: bool, pulse: float = 1.0) -> void:
	if flame_l != null:
		flame_l.visible = active
		flame_l.scale = Vector3(1.0, pulse, 1.0)
	if flame_r != null:
		flame_r.visible = active
		flame_r.scale = Vector3(1.0, pulse, 1.0)
