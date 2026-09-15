extends SceneTree

const SUITES := ["smoke", "naming-contract"]

func _init() -> void:
	var options := _parse_options(OS.get_cmdline_user_args())
	var suite_name: String = options.get("suite", "smoke")
	var report_path: String = options.get("report", "")
	var results: Array[Dictionary] = []

	if suite_name == "smoke":
		results.append(_run_smoke())
	elif suite_name == "naming-contract":
		results.append(_run_naming_contract())
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
	var tick_rate := int(ProjectSettings.get_setting("physics/common/physics_ticks_per_second", 0))
	return {
		"name": "project configuration",
		"passed": actual_name == expected_name and tick_rate == 60,
		"message": "name=%s physics_ticks_per_second=%d" % [actual_name, tick_rate],
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

func _write_report(path: String, payload: Dictionary) -> void:
	var absolute_path := ProjectSettings.globalize_path(path)
	DirAccess.make_dir_recursive_absolute(absolute_path.get_base_dir())
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(payload, "\t") + "\n")
