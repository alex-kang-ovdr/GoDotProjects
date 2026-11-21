extends Node
## PlayForge Unreal Engine Compatibility Autoload (UnrealCompat)
## Provides UE->Godot coordinate utilities, Blueprint helper APIs, and deterministic trace recording.

const UE_CM_TO_M: float = 0.01
const GODOT_M_TO_CM: float = 100.0

var gameplay_events: Array[Dictionary] = []
var printed_messages: Array[String] = []
var elapsed_time_ms: float = 0.0
var _timers: Dictionary = {}


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
