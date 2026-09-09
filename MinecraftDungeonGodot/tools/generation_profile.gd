extends SceneTree

var output_directory := "res://Saved/Verification/generation-profile"
var geometry := "cached"
var rounds := 3
var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument.begins_with("--geometry="): geometry = argument.trim_prefix("--geometry=")
		if argument.begins_with("--rounds="): rounds = int(argument.trim_prefix("--rounds="))
	call_deferred("_run")


func _run() -> void:
	if geometry not in ["cached", "reference"] or rounds < 1 or rounds > 5:
		push_error("invalid generation profile options")
		quit(1)
		return
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	var controls: GenerationControls = instance.get_node("GenerationControls")
	world.generation_trace_enabled = true
	world.use_plane_cache = geometry == "cached"
	player.set_physics_process(false)
	controls.set_open(true)
	for round_index in rounds:
		for size_value in [255, 41]:
			controls.draft_seed = 1337
			controls.draft_size = size_value
			controls.draft_checks = true
			controls.draft_poi = false
			_expect(controls.apply_draft(), "profile generation starts")
			var samples: Array[Dictionary] = []
			var started := Time.get_ticks_usec()
			var previous := started
			while world.generating and Time.get_ticks_usec() - started < 90000000:
				await process_frame
				var now := Time.get_ticks_usec()
				samples.append({"frame": Engine.get_process_frames(), "gap_us": now - previous, "state": world.generation_state, "focus": root.has_focus()})
				previous = now
			_expect(not world.generating and world.generation_state == "PASS", "profile generation completes")
			if world.generating: break
			_expect(world.layout.signature == (546771480 if size_value == 255 else 2029358965), "profile golden hash")
			_expect(world.plane_geometry.size() == (world.chunk_nodes.size() if geometry == "cached" else 0), "profile backend inherited by staging")
			_expect(not world.generation_trace.is_empty() and world.generation_worker_timings.size() == 3, "profile stages captured")
			var sorted_gaps: Array[int] = []
			for sample: Dictionary in samples: sorted_gaps.append(int(sample.gap_us))
			sorted_gaps.sort()
			var name := "%s-%d-%d" % [geometry, round_index + 1, size_value]
			var metrics := {"case": name, "geometry": geometry, "size": size_value, "seed": 1337, "hash": world.layout.signature, "cells": world.layout.cells.size(), "elapsed_ms": world.generation_elapsed_ms, "gap_p95_ms": sorted_gaps[ceili(sorted_gaps.size() * 0.95) - 1] / 1000.0, "gap_max_ms": sorted_gaps[-1] / 1000.0, "vsync": DisplayServer.window_get_vsync_mode(), "rendered": DisplayServer.get_name() != "headless", "worker": world.generation_worker_timings, "frames": samples, "process": world.generation_trace, "stages": world.generation_stage_samples}
			metrics.retirement = {"mode": world.generation_retirement_mode, "release_us": world.generation_retirement_us}
			var file := FileAccess.open(output_directory.path_join(name + ".json"), FileAccess.WRITE)
			_expect(file != null, "profile evidence opens")
			if file != null:
				file.store_string(JSON.stringify(metrics, "  "))
				file.close()
			print("GENERATION PROFILE CASE: %s elapsed_ms=%.3f gap_p95_ms=%.3f max_ms=%.3f" % [name, metrics.elapsed_ms, metrics.gap_p95_ms, metrics.gap_max_ms])
			if DisplayServer.get_name() != "headless":
				await RenderingServer.frame_post_draw
				_expect(root.get_texture().get_image().save_png(output_directory.path_join(name + ".png")) == OK, "profile screenshot")
			for unused in 4: await physics_frame
	for failure in failures: push_error(failure)
	print("GENERATION PROFILE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
