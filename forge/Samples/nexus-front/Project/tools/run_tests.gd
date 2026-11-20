extends SceneTree

func _initialize():
	call_deferred("_run")

func _run():
	var total = {"engine": Engine.get_version_info().string, "version": "v11-godot", "passed": 0, "failed": 0, "suites": []}
	var start = Time.get_ticks_msec()
	for path in ["res://tests/test_world.gd", "res://tests/test_abilities.gd", "res://tests/test_vision.gd"]:
		var suite = load(path).new()
		var result = suite.run()
		result["file"] = path
		total.passed += int(result.passed)
		total.failed += int(result.failed)
		total.suites.append(result)
		print("SUITE ", path, " ", JSON.stringify(result))
		suite = null
	total["elapsed_ms"] = Time.get_ticks_msec() - start
	var file = FileAccess.open("res://docs/validation_results.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(total, "  "))
	print("NEXUS_FRONT_TEST_RESULT ", JSON.stringify(total))
	quit(0 if total.failed == 0 else 1)
