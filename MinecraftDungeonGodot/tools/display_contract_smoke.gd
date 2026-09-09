extends SceneTree

const Probe = preload("res://tools/benchmark_display.gd")


func _init() -> void:
	var baseline := {"screen": 0, "position": [300, 200], "size": [1280, 720], "vsync": 1,
		"refresh_hz": 60.0, "screens": [{"screen": 0, "refresh_hz": 60.0}],
		"window_mode": 0, "engine_max_fps": 0, "renderer": "gl_compatibility"}
	var samples: Array = []
	for unused in 64: samples.append(baseline.duplicate(true))
	var failures: Array[String] = []
	var assertions := 0
	assertions += 1
	if not Probe.errors(baseline, baseline.duplicate(true), samples, 0).is_empty(): failures.append("stable display rejected")
	for key in ["screen", "position", "size", "vsync", "refresh_hz", "screens", "window_mode", "engine_max_fps", "renderer"]:
		var changed := baseline.duplicate(true)
		changed[key] = null
		assertions += 1
		if Probe.errors(baseline, changed, samples, 0).is_empty(): failures.append("missed endpoint change: " + key)
	for key in ["screen", "position", "size", "vsync"]:
		var changed := samples.duplicate(true)
		changed[31][key] = null
		assertions += 1
		if Probe.errors(baseline, baseline, changed, 0).is_empty(): failures.append("missed transient change: " + key)
	for refresh in [-1.0, 0.0, NAN, INF]:
		var unknown := baseline.duplicate(true)
		unknown.refresh_hz = refresh
		assertions += 1
		if Probe.errors(unknown, unknown, samples, 0).is_empty(): failures.append("unknown refresh treated as valid")
	assertions += 1
	if Probe.errors(baseline, baseline, samples, 1).is_empty(): failures.append("wrong requested screen accepted")
	assertions += 1
	if Probe.errors(baseline, baseline, [], 0).is_empty(): failures.append("missing edit samples accepted")
	var undersized := baseline.duplicate(true)
	undersized.size = [640, 360]
	assertions += 1
	if Probe.errors(undersized, undersized, samples, 0).is_empty(): failures.append("wrong client size accepted")
	for failure in failures: push_error(failure)
	print("DISPLAY CONTRACT SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)
