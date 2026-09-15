extends SceneTree

const SUITES := ["smoke", "naming-contract", "playback-contract"]

func _init() -> void:
	var options := _parse_options(OS.get_cmdline_user_args())
	var suite_name: String = options.get("suite", "smoke")
	var report_path: String = options.get("report", "")
	var results: Array[Dictionary] = []

	if suite_name == "smoke":
		results.append(_run_smoke())
	elif suite_name == "naming-contract":
		results.append(_run_naming_contract())
	elif suite_name == "playback-contract":
		results.append(_run_playback_contract())
	else:
		results.append({
			"name": suite_name,
			"passed": false,
			"message": "Unknown suite. Available suites: %s" % ", ".join(SUITES),
		})

	var passed := true
	for result in results:
		passed = passed and bool(result.get("passed", false))

	var payload := {
		"suite": suite_name,
		"passed": passed,
		"results": results,
	}
	if not report_path.is_empty():
		_write_report(report_path, payload)

	print("BALL_GODOT_TEST_RESULT %s %s" % ["PASS" if passed else "FAIL", JSON.stringify(payload)])
	quit(0 if passed else 1)

func _parse_options(args: PackedStringArray) -> Dictionary:
	var options := {}
	var index := 0
	while index < args.size():
		var argument := args[index]
		if argument == "--suite" and index + 1 < args.size():
			options["suite"] = args[index + 1]
			index += 2
			continue
		if argument == "--report" and index + 1 < args.size():
			options["report"] = args[index + 1]
			index += 2
			continue
		index += 1
	return options

func _run_smoke() -> Dictionary:
	var expected_name := "Godot Ball Simulator"
	var actual_name := str(ProjectSettings.get_setting("application/config/name", ""))
	return {
		"name": "project configuration",
		"passed": actual_name == expected_name,
		"message": "name=%s" % actual_name,
	}

func _run_naming_contract() -> Dictionary:
	var header_path := "res://native/include/ball_simulator/core/ball_simulation_core.hpp"
	var file := FileAccess.open(header_path, FileAccess.READ)
	if file == null:
		return {"name": "naming contract", "passed": false, "message": "Missing %s" % header_path}
	var source := file.get_as_text()
	var required_names := ["BallSimulatorComponent3D", "BallSimulateParams", "BallSnapshot", "BallSimulationFrame", "BallBounce", "BallCollisionQueryWorld"]
	var missing: Array[String] = []
	for required_name in required_names:
		if not source.contains(required_name):
			missing.append(required_name)
	return {
		"name": "naming contract",
		"passed": missing.is_empty(),
		"message": "missing=%s" % ", ".join(missing),
	}

func _run_playback_contract() -> Dictionary:
	var source_path := "res://scenes/bootstrap_rhi_lab.gd"
	var source_file := FileAccess.open(source_path, FileAccess.READ)
	if source_file == null:
		return {"name": "playback contract", "passed": false, "message": "Missing %s" % source_path}
	var source := source_file.get_as_text()
	var forbidden_terms := ["_physics_process", "RigidBody3D", "CharacterBody3D", "PhysicsServer3D", "PhysicsDirectSpaceState3D"]
	var forbidden_found: Array[String] = []
	for term in forbidden_terms:
		if source.contains(term):
			forbidden_found.append(term)

	var simulator_script := load("res://scripts/ball_trajectory_simulator.gd")
	var simulator: Variant = simulator_script.new()
	var generated: bool = bool(simulator.simulate(Vector3(0.0, 2.0, 0.0), Vector3(2.0, 4.0, 0.0), Vector3(0.0, -9.81, 0.0), 0.25, 2.0, 0.1, 0.65))
	var snapshot_count: int = int(simulator.snapshots.size())
	var initial_snapshot: Dictionary = simulator.get_current_snapshot()
	var started: bool = bool(simulator.play())
	simulator.advance_playback(0.35)
	var moved_snapshot: Dictionary = simulator.get_current_snapshot()
	var paused_time: float = float(simulator.playback_time_s)
	simulator.pause()
	simulator.advance_playback(0.5)
	var pause_holds_time := is_equal_approx(simulator.playback_time_s, paused_time)
	simulator.stop()
	var stopped_at_initial := is_equal_approx(simulator.playback_time_s, 0.0)
	var replayed: bool = bool(simulator.replay())
	simulator.advance_playback(0.35)
	var replay_snapshot: Dictionary = simulator.get_current_snapshot()
	var initial_position: Vector3 = initial_snapshot["position"]
	var moved_position: Vector3 = moved_snapshot["position"]
	var replay_position: Vector3 = replay_snapshot["position"]
	var replay_is_deterministic: bool = moved_position.is_equal_approx(replay_position)
	var moved: bool = not initial_position.is_equal_approx(moved_position)
	var passed: bool = forbidden_found.is_empty() and generated and snapshot_count == 21 and started and moved and pause_holds_time and stopped_at_initial and replayed and replay_is_deterministic
	return {
		"name": "precomputed playback and physics isolation",
		"passed": passed,
		"message": "forbidden=%s snapshots=%d moved=%s pause=%s stop=%s replay=%s" % [", ".join(forbidden_found), snapshot_count, moved, pause_holds_time, stopped_at_initial, replay_is_deterministic],
	}

func _write_report(path: String, payload: Dictionary) -> void:
	var absolute_path := ProjectSettings.globalize_path(path)
	DirAccess.make_dir_recursive_absolute(absolute_path.get_base_dir())
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(payload, "\t") + "\n")
