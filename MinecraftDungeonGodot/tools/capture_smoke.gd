extends SceneTree

var output_directory := "res://Saved/Verification/smoke"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var started := Time.get_ticks_msec()
	var scene := load("res://scenes/main.tscn") as PackedScene
	var instance := scene.instantiate()
	root.add_child(instance)
	for unused in 30:
		await process_frame
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var image := root.get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var screenshot_path := output_directory.path_join("runtime.png")
	var screenshot_error := image.save_png(screenshot_path)
	var player := instance.get_node("Player") as VoxelPlayer
	player.set_physics_process(false)
	player.velocity = Vector3.ZERO
	player.global_position = Vector3(world.layout.cave_destination) + Vector3(0.5, 0.05, 0.5)
	player.rotation.y = PI / 2.0
	player.pitch = 0.0
	player.camera.rotation.x = 0.0
	for unused in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var cave_error := root.get_texture().get_image().save_png(output_directory.path_join("cave.png"))
	var metrics := {
		"engine": Engine.get_version_info().string,
		"seed": world.layout.seed,
		"size": world.layout.size,
		"blocks": world.layout.cells.size(),
		"signature": world.layout.signature,
		"elapsed_ms": Time.get_ticks_msec() - started,
		"screenshot_error": screenshot_error,
		"cave_screenshot_error": cave_error,
		"protected_cave_cells": world.layout.protected_cave.size(),
	}
	var metrics_file := FileAccess.open(output_directory.path_join("metrics.json"), FileAccess.WRITE)
	metrics_file.store_string(JSON.stringify(metrics, "  "))
	metrics_file.close()
	print("SMOKE PASS: %s" % JSON.stringify(metrics))
	quit(0 if screenshot_error == OK and cave_error == OK else 1)
