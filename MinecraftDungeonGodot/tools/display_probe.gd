extends SceneTree

const Probe = preload("res://tools/benchmark_display.gd")


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		print("DISPLAY PROBE REJECTED: actual display required")
		quit(2)
		return
	for unused in 8: await process_frame
	print("DISPLAY PROBE: " + JSON.stringify(Probe.snapshot()))
	quit()
