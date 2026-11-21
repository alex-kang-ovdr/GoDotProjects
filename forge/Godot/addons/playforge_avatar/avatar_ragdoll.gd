class_name PlayForgeAvatarRagdoll
extends Node

signal ragdoll_started(hit_bone: String)
signal ragdoll_stopped(hips_world_position: Vector3)

const RAGDOLL_BONE_SPECS := [
	{"key": "hips", "mass": 14.0, "radius": 0.14, "length": 0.24, "joint": "none"},
	{"key": "spine", "mass": 10.0, "radius": 0.13, "length": 0.22, "joint": "cone", "swing": 35.0, "twist": 25.0},
	{"key": "chest", "mass": 12.0, "radius": 0.15, "length": 0.26, "joint": "cone", "swing": 35.0, "twist": 25.0},
	{"key": "head", "mass": 5.0, "radius": 0.14, "length": 0.24, "joint": "cone", "swing": 45.0, "twist": 40.0},
	{"key": "upper_arm_l", "mass": 3.5, "radius": 0.08, "length": 0.28, "joint": "cone", "swing": 75.0, "twist": 45.0},
	{"key": "lower_arm_l", "mass": 2.5, "radius": 0.07, "length": 0.26, "joint": "cone", "swing": 65.0, "twist": 20.0},
	{"key": "upper_arm_r", "mass": 3.5, "radius": 0.08, "length": 0.28, "joint": "cone", "swing": 75.0, "twist": 45.0},
	{"key": "lower_arm_r", "mass": 2.5, "radius": 0.07, "length": 0.26, "joint": "cone", "swing": 65.0, "twist": 20.0},
	{"key": "upper_leg_l", "mass": 6.5, "radius": 0.10, "length": 0.36, "joint": "cone", "swing": 70.0, "twist": 30.0},
	{"key": "lower_leg_l", "mass": 4.5, "radius": 0.08, "length": 0.36, "joint": "cone", "swing": 65.0, "twist": 15.0},
	{"key": "upper_leg_r", "mass": 6.5, "radius": 0.10, "length": 0.36, "joint": "cone", "swing": 70.0, "twist": 30.0},
	{"key": "lower_leg_r", "mass": 4.5, "radius": 0.08, "length": 0.36, "joint": "cone", "swing": 65.0, "twist": 15.0},
]

var _skeleton: Skeleton3D
var _simulator: PhysicalBoneSimulator3D
var _bones_by_key: Dictionary = {}
var _bones_by_name: Dictionary = {}
var _is_ragdoll := false
var _hips_bone_key := "hips"
var _hips_rest_height := 0.95


func is_ragdoll_active() -> bool:
	return _is_ragdoll


func get_physical_bone_count() -> int:
	return _bones_by_key.size()


func setup_for_skeleton(skeleton: Skeleton3D, rig_profile: Dictionary, collision_layer := 4, collision_mask := 1) -> int:
	clear()
	_skeleton = skeleton
	if _skeleton == null or not is_instance_valid(_skeleton):
		return 0
	var bone_map: Dictionary = rig_profile.get("bones", {})
	var model_scale := maxf(float(rig_profile.get("modelScale", 1.0)), 0.05)

	_simulator = PhysicalBoneSimulator3D.new()
	_simulator.name = "PlayForgeRagdollSimulator"
	_simulator.set_meta("_playforge_avatar_sealed", true)
	_skeleton.add_child(_simulator)

	var created := 0
	for spec in RAGDOLL_BONE_SPECS:
		var key := str(spec.key)
		var wanted_name := str(bone_map.get(key, ""))
		if wanted_name.is_empty():
			continue
		var bone_idx := _find_bone_idx(_skeleton, wanted_name)
		if bone_idx < 0:
			continue
		var bone_name := _skeleton.get_bone_name(bone_idx)

		var pbone := PhysicalBone3D.new()
		pbone.name = "PB_" + key
		pbone.bone_name = bone_name
		pbone.mass = float(spec.mass)
		pbone.linear_damp = 0.25
		pbone.angular_damp = 0.45
		pbone.collision_layer = collision_layer
		pbone.collision_mask = collision_mask
		pbone.set_meta("_playforge_avatar_sealed", true)

		var radius := float(spec.radius) / model_scale
		var length := float(spec.length) / model_scale
		# Adapt capsule length to real skeleton bone span when child bones exist
		var child_bones := _skeleton.get_bone_children(bone_idx)
		if not child_bones.is_empty():
			var origin_a := _skeleton.get_bone_global_rest(bone_idx).origin
			var origin_b := _skeleton.get_bone_global_rest(child_bones[0]).origin
			var dist := origin_a.distance_to(origin_b)
			if dist > 0.001:
				length = clampf(dist, radius * 1.4, dist * 1.05)
				radius = clampf(dist * 0.34, 0.004, maxf(radius, 0.01))

		var col := CollisionShape3D.new()
		col.name = "Shape"
		var capsule := CapsuleShape3D.new()
		capsule.radius = maxf(radius, 0.005)
		capsule.height = maxf(length, capsule.radius * 2.0 + 0.005)
		col.shape = capsule
		pbone.add_child(col)

		if str(spec.joint) == "cone":
			pbone.joint_type = PhysicalBone3D.JOINT_TYPE_CONE
			pbone.set("joint_constraints/swing_span", float(spec.get("swing", 45.0)))
			pbone.set("joint_constraints/twist_span", float(spec.get("twist", 30.0)))
			pbone.set("joint_constraints/bias", 0.3)
			pbone.set("joint_constraints/softness", 0.8)
			pbone.set("joint_constraints/relaxation", 1.0)
		else:
			pbone.joint_type = PhysicalBone3D.JOINT_TYPE_NONE

		_simulator.add_child(pbone)
		_bones_by_key[key] = pbone
		_bones_by_name[bone_name.to_lower()] = pbone
		created += 1

	var hips_idx := _find_bone_idx(_skeleton, str(bone_map.get("hips", "")))
	if hips_idx >= 0:
		var hips_global := _skeleton.to_global(_skeleton.get_bone_global_pose(hips_idx).origin)
		_hips_rest_height = maxf(hips_global.y - _skeleton.global_position.y, 0.5)

	return created


func enter_ragdoll(impulse := Vector3.ZERO, hit_bone := "hips") -> bool:
	if _simulator == null or not is_instance_valid(_simulator) or _bones_by_key.is_empty():
		return false
	if _is_ragdoll:
		_apply_impulse(impulse, hit_bone)
		return true
	_is_ragdoll = true
	_simulator.active = true
	_simulator.physical_bones_start_simulation()
	_apply_impulse(impulse, hit_bone)
	ragdoll_started.emit(hit_bone)
	return true


func recover_from_ragdoll() -> Vector3:
	if not _is_ragdoll:
		return _skeleton.global_position if (_skeleton != null and is_instance_valid(_skeleton)) else Vector3.ZERO
	var hips_pos := get_hips_world_position()
	_is_ragdoll = false
	if _simulator != null and is_instance_valid(_simulator):
		_simulator.physical_bones_stop_simulation()
		_simulator.active = false
	if _skeleton != null and is_instance_valid(_skeleton):
		_skeleton.clear_bones_global_pose_override()
	ragdoll_stopped.emit(hips_pos)
	return hips_pos


func get_hips_world_position() -> Vector3:
	var hips: PhysicalBone3D = _bones_by_key.get(_hips_bone_key, null)
	if hips != null and is_instance_valid(hips):
		return hips.global_position
	if _skeleton != null and is_instance_valid(_skeleton):
		return _skeleton.global_position + Vector3(0.0, _hips_rest_height, 0.0)
	return Vector3.ZERO


func get_ragdoll_state() -> Dictionary:
	return {
		"active": _is_ragdoll,
		"physicalBoneCount": _bones_by_key.size(),
		"boneKeys": _bones_by_key.keys(),
		"hipsWorldPosition": get_hips_world_position(),
	}


func clear() -> void:
	if _is_ragdoll and _simulator != null and is_instance_valid(_simulator):
		_simulator.physical_bones_stop_simulation()
		_simulator.active = false
	_is_ragdoll = false
	if _simulator != null and is_instance_valid(_simulator):
		_simulator.queue_free()
	_simulator = null
	_skeleton = null
	_bones_by_key.clear()
	_bones_by_name.clear()


func _apply_impulse(impulse: Vector3, hit_bone: String) -> void:
	if impulse.length_squared() <= 0.0001:
		return
	var target: PhysicalBone3D = _bones_by_key.get(hit_bone, null)
	if target == null:
		target = _bones_by_name.get(hit_bone.to_lower(), null)
	if target == null:
		target = _bones_by_key.get(_hips_bone_key, null)
	if target != null and is_instance_valid(target):
		target.apply_central_impulse(impulse)


static func _find_bone_idx(skeleton: Skeleton3D, wanted: String) -> int:
	if skeleton == null or wanted.is_empty():
		return -1
	var idx := skeleton.find_bone(wanted)
	if idx >= 0:
		return idx
	idx = skeleton.find_bone(wanted.replace(".", "_"))
	if idx >= 0:
		return idx
	var norm_wanted := wanted.to_lower().replace(".", "").replace("_", "").replace("-", "")
	for i in range(skeleton.get_bone_count()):
		var bname := skeleton.get_bone_name(i)
		var norm := bname.to_lower().replace(".", "").replace("_", "").replace("-", "")
		if norm == norm_wanted or norm.begins_with(norm_wanted):
			return i
	return -1
