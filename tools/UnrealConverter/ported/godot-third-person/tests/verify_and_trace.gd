extends Node
## Automated Godot 4.7.2 Headless Runtime Verification & Trace Recorder (Spec §7 & §12)
## Executes the deterministic P0 Third Person input scenario and writes a JSON trace report.

const MAIN_SCENE_PATH := "res://scenes/main.tscn"
const TRACE_OUT_PATH := "user://godot_runtime_trace.json"

var _main_instance: Node3D = null
var _player: CharacterBody3D = null
var _frame: int = 0
var _samples: Array[Dictionary] = []


func _ready() -> void:
	var compat := get_node_or_null("/root/UnrealCompat")
	if compat != null and compat.has_method("reset_trace_state"):
		compat.call("reset_trace_state")
	var packed := load(MAIN_SCENE_PATH) as PackedScene
	if packed == null:
		push_error("VERIFY_FAIL: Could not load main scene: " + MAIN_SCENE_PATH)
		get_tree().quit(2)
		return
	_main_instance = packed.instantiate() as Node3D
	add_child(_main_instance)
	_player = _main_instance.get_node_or_null("BP_ThirdPersonCharacter") as CharacterBody3D
	if _player == null:
		push_error("VERIFY_FAIL: BP_ThirdPersonCharacter not found in main scene")
		get_tree().quit(3)
		return


func _physics_process(_delta: float) -> void:
	if _player == null:
		return
	# Deterministic P0 Scenario (60 Hz physics ticks = 180 ticks = 3.0s):
	#   0..14  (0.00-0.25s): Idle settle on floor
	#  15..59  (0.25-1.00s): Move forward (+Y in IA_Move)
	#  60..61  (1.00s):      Jump press + continue forward
	#  62..119 (1.03-2.00s): Airborne arc & land while moving forward
	# 120..149 (2.00-2.50s): Yaw camera right +30 deg over 30 frames (1 deg/tick) + strafe right
	# 150..179 (2.50-3.00s): Release inputs and decelerate to Idle
	var move_vec := Vector2.ZERO
	var look_vec := Vector2.ZERO
	var jump_press := false

	if _frame >= 15 and _frame < 60:
		move_vec = Vector2(0.0, 1.0)
	elif _frame == 60:
		move_vec = Vector2(0.0, 1.0)
		jump_press = true
	elif _frame > 60 and _frame < 120:
		move_vec = Vector2(0.0, 1.0)
	elif _frame >= 120 and _frame < 150:
		move_vec = Vector2(1.0, 0.0)
		look_vec = Vector2(4.0, 0.0)
	else:
		move_vec = Vector2.ZERO

	_player.call("set_scripted_inputs", move_vec, look_vec, jump_press)

	if _frame % 15 == 0 or _frame == 179:
		var p := _player.global_position
		var v := _player.velocity
		_samples.append({
			"tick": _frame,
			"position_m": [snappedf(p.x, 0.0001), snappedf(p.y, 0.0001), snappedf(p.z, 0.0001)],
			"velocity_m_s": [snappedf(v.x, 0.0001), snappedf(v.y, 0.0001), snappedf(v.z, 0.0001)],
			"yaw_deg": snappedf(float(_player.get("controller_yaw_deg")), 0.01),
			"on_floor": _player.is_on_floor(),
			"anim_state": str(_player.get("anim_state"))
		})

	_frame += 1
	if _frame >= 180:
		_finish_and_write_trace()


func _finish_and_write_trace() -> void:
	var compat := get_node_or_null("/root/UnrealCompat")
	var events: Array = compat.get("gameplay_events") if compat != null else []
	var trace := {
		"engine": "godot_4.7",
		"scenario": "p0_third_person_core",
		"ticks": _frame,
		"jump_apex_m": snappedf(float(_player.get("max_jump_apex_m")), 0.0001),
		"final_anim_state": str(_player.get("anim_state")),
		"anim_transitions": _player.get("anim_transitions"),
		"gameplay_events": events,
		"samples": _samples
	}
	var out_path := OS.get_environment("PLAYFORGE_TRACE_OUT")
	if out_path.is_empty():
		out_path = ProjectSettings.globalize_path("res://godot_runtime_trace.json")
	var f := FileAccess.open(out_path, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(trace, "  "))
		f.close()
	print("PLAYFORGE_UNREAL_TRACE_OK:" + out_path)
	get_tree().quit(0)
