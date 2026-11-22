extends Node
## PlayForge Unreal Engine Compatibility Autoload (UnrealCompat)
## Provides UE->Godot coordinate utilities, Blueprint helper APIs, and deterministic trace recording.

const UE_CM_TO_M: float = 0.01
const GODOT_M_TO_CM: float = 100.0

var gameplay_events: Array[Dictionary] = []
var printed_messages: Array[String] = []
var elapsed_time_ms: float = 0.0
var _timers: Dictionary = {}
var _actors: Dictionary = {}
var _spawned_bots: Array[Node3D] = []
var orbs_collected: int = 0
var level_completed: bool = false


func _physics_process(delta: float) -> void:
	elapsed_time_ms += delta * 1000.0
	var to_remove: Array[String] = []
	for key in _timers.keys():
		var t: Dictionary = _timers[key]
		t["remaining"] = float(t["remaining"]) - delta
		if float(t["remaining"]) <= 0.0:
			var target: Object = t.get("target")
			var method_name: String = str(t.get("method", ""))
			if is_instance_valid(target) and target.has_method(method_name):
				target.call(method_name)
			if bool(t.get("loop", false)):
				t["remaining"] = float(t["interval"])
			else:
				to_remove.append(key)
	for key in to_remove:
		_timers.erase(key)


func reset_trace_state() -> void:
	gameplay_events.clear()
	printed_messages.clear()
	elapsed_time_ms = 0.0
	_timers.clear()
	_actors.clear()
	_spawned_bots.clear()
	orbs_collected = 0
	level_completed = false


func register_actor(actor_id: String, node: Node) -> void:
	_actors[actor_id] = node


func find_actor(actor_id: String) -> Node:
	var n: Variant = _actors.get(actor_id, null)
	if n != null and is_instance_valid(n):
		return n as Node
	return null


func call_interface(target: Object, method_name: String, args: Array = []) -> Variant:
	if target == null or not is_instance_valid(target):
		return null
	if target.has_method(method_name):
		return target.callv(method_name, args)
	return null


func spawn_inactive_bot(parent_node: Node, world_pos: Vector3, max_bots: int = 3, spawner: Node3D = null) -> Node3D:
	if parent_node == null:
		return null
	while _spawned_bots.size() >= max_bots:
		var oldest: Node3D = _spawned_bots.pop_front()
		if is_instance_valid(oldest):
			oldest.queue_free()
	var spawn_pos := Vector3(world_pos.x, 0.88, world_pos.z)
	var bot := CharacterBody3D.new()
	bot.name = "InactiveBot_%d" % (_spawned_bots.size() + 1)
	bot.add_to_group("ue_bot_body")
	bot.position = spawn_pos
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(0.65, 1.5, 0.65)
	col.shape = shape
	bot.add_child(col)
	var rig_script := load("res://addons/playforge_unreal_compat/ue_skeleton_rig.gd") as Script
	if rig_script != null:
		var rig := Node3D.new()
		rig.name = "OfflineRiggedSkeleton"
		rig.set_script(rig_script)
		rig.set("character_style", "bot")
		rig.set("is_offline", true)
		bot.add_child(rig)
	else:
		var mesh_inst := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.65, 0.9, 0.65)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.92, 0.48, 0.14, 1.0)
		box.material = mat
		mesh_inst.mesh = box
		bot.add_child(mesh_inst)
	parent_node.add_child(bot)
	_spawned_bots.append(bot)
	if spawner != null and is_instance_valid(spawner):
		var fwd := Vector3(0.0, 0.0, -1.0)
		if spawner.has_method("ue_get_control_forward_vector"):
			fwd = spawner.call("ue_get_control_forward_vector")
		spawner.global_position = Vector3(world_pos.x, maxf(world_pos.y, 0.92), world_pos.z) + fwd * 0.95
	record_event("SpawnInactiveBot", {
		"count": _spawned_bots.size(),
		"pos_m": [snappedf(spawn_pos.x, 0.01), snappedf(spawn_pos.y, 0.01), snappedf(spawn_pos.z, 0.01)]
	})
	return bot


func get_spawned_bot_count() -> int:
	return _spawned_bots.size()


func collect_orb(orb_id: String) -> void:
	orbs_collected += 1
	record_event("OrbCollected", {"orb_id": orb_id, "total": orbs_collected})


func complete_level(goal_id: String) -> void:
	if level_completed:
		return
	level_completed = true
	record_event("LevelCompleted", {"goal_id": goal_id, "orbs": orbs_collected})


func record_event(event_name: String, payload: Dictionary = {}) -> void:
	gameplay_events.append({
		"time_ms": snappedf(elapsed_time_ms, 0.1),
		"event": event_name,
		"payload": payload.duplicate(true)
	})


func ue_cm_to_m(cm: float) -> float:
	return cm * UE_CM_TO_M


func godot_m_to_cm(m: float) -> float:
	return m * GODOT_M_TO_CM


func ue_pos_to_godot(ue_pos: Vector3) -> Vector3:
	return Vector3(ue_pos.y * UE_CM_TO_M, ue_pos.z * UE_CM_TO_M, -ue_pos.x * UE_CM_TO_M)


func godot_pos_to_ue(g_pos: Vector3) -> Vector3:
	return Vector3(-g_pos.z * GODOT_M_TO_CM, g_pos.x * GODOT_M_TO_CM, g_pos.y * GODOT_M_TO_CM)


func ue_rot_deg_to_godot_deg(pitch: float, yaw: float, roll: float) -> Vector3:
	return Vector3(pitch, -yaw, -roll)


func print_string(msg: String, _duration: float = 2.0) -> void:
	printed_messages.append(msg)
	record_event("PrintString", {"message": msg})


func set_timer_by_function_name(target: Object, function_name: String, time_sec: float, looping: bool = false) -> String:
	var handle := "%s::%s::%d" % [str(target.get_instance_id()), function_name, _timers.size()]
	_timers[handle] = {
		"target": target,
		"method": function_name,
		"interval": maxf(time_sec, 0.001),
		"remaining": maxf(time_sec, 0.001),
		"loop": looping
	}
	return handle


func line_trace_by_channel(world_node: Node3D, start: Vector3, end: Vector3, exclude: Array[RID] = []) -> Dictionary:
	if world_node == null or not world_node.is_inside_tree():
		return {"hit": false}
	var space_state := world_node.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(start, end)
	query.exclude = exclude
	var result := space_state.intersect_ray(query)
	if result.is_empty():
		return {"hit": false}
	return {
		"hit": true,
		"position": result.get("position", Vector3.ZERO),
		"normal": result.get("normal", Vector3.UP),
		"collider": result.get("collider")
	}
