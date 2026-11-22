extends Node
## Automated Godot 4.7.2 Headless Runtime Verification & Trace Recorder — P1 Stack O Bot
## Exercises: Move -> Jump + Jetpack Hover -> Walk to Pressure Plate -> Spawn Inactive Bot (E)
## -> Plate fires Delegate + BPI_Interactable -> Door opens via Timeline -> Walk through Door
## -> Collect Energy Orb -> Reach Goal Pad (LevelCompleted).

const MAIN_SCENE_PATH := "res://scenes/main.tscn"

var _main_instance: Node3D = null
var _player: CharacterBody3D = null
var _frame: int = 0
var _samples: Array[Dictionary] = []
var _capture_dir: String = ""


func _capture_screenshot(filename: String) -> void:
	if _capture_dir.is_empty():
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img != null:
		img.save_png(_capture_dir.path_join(filename))


func _ready() -> void:
	_capture_dir = OS.get_environment("PLAYFORGE_CAPTURE_DIR")
	if not _capture_dir.is_empty():
		DirAccess.make_dir_recursive_absolute(_capture_dir)
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
	_player = _main_instance.get_node_or_null("BP_Bot") as CharacterBody3D
	if _player == null:
		push_error("VERIFY_FAIL: BP_Bot not found in main scene")
		get_tree().quit(3)
		return


func _physics_process(_delta: float) -> void:
	if _player == null:
		return
	# Deterministic P1 Stack O Bot Scenario (60 Hz, 300 ticks = 5.0s):
	#   0..14   : Idle settle at (0, 0.9, 0)
	#  15..44   : Jump + Jetpack hover while moving forward toward Pressure Plate at (0, 0, -4m)
	#  45..84   : Land & reach Pressure Plate at z = -4.0m
	#  85       : Press IA_SpawnBot (E) to leave InactiveBot on Pressure Plate!
	#  86..125  : Wait/pause briefly while Door at z = -7.0m opens via Timeline (0.5s)
	# 126..265  : Walk forward through opened Door, collect Energy Orb at z = -9.5m, reach Goal Pad at z = -12.0m
	# 266..299  : Stop and settle on Goal Pad
	var move_vec := Vector2.ZERO
	var jump_press := false
	var jetpack := false
	var spawn_bot := false

	if _frame == 15:
		move_vec = Vector2(0.0, 1.0)
		jump_press = true
	elif _frame >= 22 and _frame < 38:
		move_vec = Vector2(0.0, 0.7)
		jetpack = true
	elif _frame >= 38 and _frame < 84:
		if _player.global_position.z > -3.85:
			move_vec = Vector2(0.0, 1.0)
		elif _player.global_position.z < -4.15:
			move_vec = Vector2(0.0, -1.0)
	elif _frame == 85:
		spawn_bot = true
	elif _frame >= 126 and _frame < 265:
		if _player.global_position.z > -12.0:
			move_vec = Vector2(0.0, 1.0)

	_player.call("set_scripted_inputs", move_vec, Vector2.ZERO, jump_press, jetpack, spawn_bot)

	if _frame == 10:
		_capture_screenshot("01_start_idle.png")
	elif _frame == 32:
		_capture_screenshot("02_jetpack_hover.png")
	elif _frame == 128:
		_capture_screenshot("03_inactive_bot_and_door_open.png")
	elif _frame == 250:
		_capture_screenshot("04_goal_clear.png")

	if _frame % 30 == 0 or _frame == 299:
		var p := _player.global_position
		var v := _player.velocity
		_samples.append({
			"tick": _frame,
			"position_m": [snappedf(p.x, 0.0001), snappedf(p.y, 0.0001), snappedf(p.z, 0.0001)],
			"velocity_m_s": [snappedf(v.x, 0.0001), snappedf(v.y, 0.0001), snappedf(v.z, 0.0001)],
			"yaw_deg": snappedf(float(_player.get("controller_yaw_deg")), 0.01),
			"on_floor": _player.is_on_floor(),
			"anim_state": str(_player.get("anim_state")),
			"jetpack_fuel": snappedf(float(_player.get("jetpack_fuel")), 0.01)
		})

	_frame += 1
	if _frame >= 300:
		_finish_and_write_trace()


func _finish_and_write_trace() -> void:
	var compat := get_node_or_null("/root/UnrealCompat")
	var events: Array = compat.get("gameplay_events") if compat != null else []
	var trace := {
		"engine": "godot_4.7",
		"scenario": "p1_stack_o_bot_puzzle",
		"ticks": _frame,
		"jump_apex_m": snappedf(float(_player.get("max_jump_apex_m")), 0.0001),
		"spawned_bots": int(compat.call("get_spawned_bot_count")) if compat != null else 0,
		"orbs_collected": int(compat.get("orbs_collected")) if compat != null else 0,
		"level_completed": bool(compat.get("level_completed")) if compat != null else false,
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
