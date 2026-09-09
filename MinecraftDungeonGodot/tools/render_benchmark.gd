extends SceneTree

const DisplayProbe = preload("res://tools/benchmark_display.gd")

var backend := "chunks"
var size_value := 185
var output_directory := "res://Saved/Verification/render-benchmark"
var lighting := "game"
var vsync := "on"
var geometry := "cached"
var workload := "boundary"
var screen_text := "auto"
var max_fps_text := "0"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--backend="): backend = argument.trim_prefix("--backend=")
		if argument.begins_with("--size="): size_value = int(argument.trim_prefix("--size="))
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument.begins_with("--lighting="): lighting = argument.trim_prefix("--lighting=")
		if argument.begins_with("--vsync="): vsync = argument.trim_prefix("--vsync=")
		if argument.begins_with("--geometry="): geometry = argument.trim_prefix("--geometry=")
		if argument.begins_with("--workload="): workload = argument.trim_prefix("--workload=")
		if argument.begins_with("--screen="): screen_text = argument.trim_prefix("--screen=")
		if argument.begins_with("--max-fps="): max_fps_text = argument.trim_prefix("--max-fps=")
	call_deferred("_run")


func _run() -> void:
	if not max_fps_text.is_valid_int() or int(max_fps_text) < 0 or int(max_fps_text) > 1000:
		print("RENDER OPTIONS REJECTED: max-fps must be an integer in 0..1000")
		quit(2)
		return
	if DisplayServer.get_name() == "headless" or (screen_text != "auto" and (not screen_text.is_valid_int() or int(screen_text) < 0 or int(screen_text) >= DisplayServer.get_screen_count())):
		print("RENDER OPTIONS REJECTED: actual display and available nonnegative screen index required")
		quit(2)
		return
	if lighting not in ["game", "legacy"] or vsync not in ["on", "off"] or geometry not in ["cached", "reference"] or workload not in ["boundary", "scattered"] or backend not in ["chunks", "gridmap"] or size_value < 131:
		push_error("invalid render benchmark options (minimum size 131)")
		quit(1)
		return
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if vsync == "on" else DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = int(max_fps_text)
	var requested_screen := -1 if screen_text == "auto" else int(screen_text)
	if requested_screen >= 0:
		var placement_error := DisplayProbe.place(requested_screen)
		if not placement_error.is_empty():
			print("RENDER OPTIONS REJECTED: " + placement_error)
			quit(2)
			return
	for unused in 8: await process_frame
	var display_initial := DisplayProbe.snapshot()
	var started := Time.get_ticks_usec()
	var layout := DeterministicWorldGenerator.generate(1337, size_value)
	var generation_us := Time.get_ticks_usec() - started
	var factory := VoxelWorld.new()
	var library := factory._create_mesh_library()
	factory.free()
	var terrain: Node3D
	if backend == "gridmap":
		var grid := GridMap.new()
		grid.cell_size = Vector3.ONE
		grid.cell_octant_size = 8
		grid.mesh_library = library
		terrain = grid
	else:
		var chunks := VoxelChunkRenderer.new()
		chunks.use_plane_cache = geometry == "cached"
		for material_id in BlockRegistry.MATERIAL_COUNT:
			chunks.materials.append(library.get_item_mesh(material_id).surface_get_material(0))
		terrain = chunks
	root.add_child(terrain)
	var camera := Camera3D.new()
	root.add_child(camera)
	camera.position = Vector3(size_value * 0.75, size_value * 0.75, size_value * 0.75)
	camera.look_at(Vector3.ZERO)
	camera.far = 1000.0
	camera.current = true
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 0.7
	root.add_child(sun)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("#75a9d6")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color.WHITE
	environment.environment.ambient_light_energy = 0.35
	if lighting == "game":
		sun.rotation_degrees = Vector3(-52, -38, 0)
		sun.light_energy = WorldLighting.SUN_ENERGY
		sun.shadow_enabled = true
		environment.environment = WorldLighting.environment_resource()
	root.add_child(environment)
	var build_started := Time.get_ticks_usec()
	if terrain is GridMap:
		for cell: Vector3i in layout.cells:
			terrain.set_cell_item(cell, int(layout.cells[cell]))
	else:
		terrain.chunk_store.initialize(layout.seed, layout.size, layout.cells, layout.signature)
		terrain.rebuild_all()
	var build_submit_us := Time.get_ticks_usec() - build_started
	var initial_build_timings: Dictionary = terrain.build_timings.duplicate() if terrain is VoxelChunkRenderer else {}
	for unused in 4:
		await physics_frame
		await process_frame
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
	var ready_us := Time.get_ticks_usec() - started
	# Baseline cadence is distinct from edit latency and excluded from readiness.
	for unused in 30: await RenderingServer.frame_post_draw
	var idle_frame_ms: Array[float] = []
	var previous_draw := Time.get_ticks_usec()
	for unused in 120:
		await RenderingServer.frame_post_draw
		var now := Time.get_ticks_usec()
		idle_frame_ms.append((now - previous_draw) / 1000.0)
		previous_draw = now
	var display_before := DisplayProbe.snapshot()
	var samples: Array[float] = []
	var end_to_end: Array[float] = []
	var affected: Array[int] = []
	var focus_samples: Array[bool] = []
	var stage_samples: Array[Dictionary] = []
	var edited_chunks := {}
	var display_samples: Array[Dictionary] = []
	for index in 64:
		var x := 15
		var z := 1 + index % 10
		if workload == "scattered":
			x = -64 + (index % 8) * 16
			z = -64 + int(index / 8) * 16
		var half := int(size_value / 2)
		var column_index := (z + half) * size_value + x + half
		var cell := Vector3i(x, int(layout.heights[column_index]) + 1, z)
		edited_chunks[DeterministicWorldGenerator.world_to_chunk(cell)] = true
		var old: int = terrain.get_cell_item(cell)
		var next := BlockRegistry.BRICK if old == -1 else -1
		var before: Dictionary = terrain.build_timings.duplicate() if terrain is VoxelChunkRenderer else {}
		var edit_started := Time.get_ticks_usec()
		terrain.set_cell_item(cell, next)
		if terrain is VoxelChunkRenderer:
			affected.append(int(terrain.rebuild_dirty().count))
		samples.append((Time.get_ticks_usec() - edit_started) / 1000.0)
		if terrain is VoxelChunkRenderer:
			var delta := {}
			for key: String in terrain.build_timings: delta[key] = int(terrain.build_timings[key]) - int(before.get(key, 0))
			stage_samples.append(delta)
		await process_frame
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
		end_to_end.append((Time.get_ticks_usec() - edit_started) / 1000.0)
		focus_samples.append(root.has_focus())
		display_samples.append(DisplayProbe.window_sample())
	var display_after := DisplayProbe.snapshot()
	var display_errors := DisplayProbe.errors(display_before, display_after, display_samples, requested_screen)
	if display_before.vsync != (DisplayServer.VSYNC_ENABLED if vsync == "on" else DisplayServer.VSYNC_DISABLED): display_errors.append("requested VSync setting not retained")
	if display_before.engine_max_fps != int(max_fps_text): display_errors.append("requested engine FPS cap not retained")
	if focus_samples.has(false): display_errors.append("window lost focus during edits")
	var metrics := {"backend": backend, "seed": 1337, "size": size_value,
		"geometry": geometry if backend == "chunks" else "gridmap", "workload": workload, "edited_primary_chunks": edited_chunks.size(), "edit_build_stages": stage_samples,
		"generation_stages": layout.timings, "initial_build_stages": initial_build_timings,
		"signature": layout.signature, "cells": layout.cells.size(), "generation_ms": generation_us / 1000.0,
		"build_submit_ms": build_submit_us / 1000.0, "ready_ms": ready_us / 1000.0,
		"edit_samples": samples.size(), "edit_submit_p95_ms": _p95(samples),
		"edit_submit_samples_ms": samples, "edit_to_frame_samples_ms": end_to_end,
		"timing_scope": "CPU wall time to RenderingServer.frame_post_draw; not GPU completion, OS presentation or input-to-photon latency",
		"edit_to_viewport_update_p95_ms": _p95(end_to_end), "edit_to_viewport_update_samples_ms": end_to_end,
		"vsync_mode": DisplayServer.window_get_vsync_mode(),
		"lighting": lighting, "lighting_profile": WorldLighting.PROFILE_ID if lighting == "game" else "legacy-benchmark", "sun_shadows": sun.shadow_enabled,
		"window_focus_samples": focus_samples,
		"requested_screen": screen_text, "display_initial": display_initial, "display_before": display_before, "display_after": display_after,
		"display_samples": display_samples, "display_errors": display_errors, "display_conditions_valid": display_errors.is_empty(),
		"idle_frame_samples_ms": idle_frame_ms, "idle_frame_p95_ms": _p95(idle_frame_ms),
		"idle_frame_median_ms": _median(idle_frame_ms), "refresh_reference_period_ms": 1000.0 / maxf(0.001, float(display_before.refresh_hz)),
		"edit_to_frame_p95_ms": _p95(end_to_end), "affected_chunks_max": affected.max() if not affected.is_empty() else 0,
		"engine_static_bytes": Performance.get_monitor(Performance.MEMORY_STATIC),
		"rendered": DisplayServer.get_name() != "headless"}
	if terrain is VoxelChunkRenderer:
		metrics.visible_faces = terrain.visible_face_count()
		metrics.chunk_count = terrain.chunk_nodes.size()
		var quads := 0
		for body: StaticBody3D in terrain.chunk_nodes.values():
			quads += int(body.get_meta("quads", 0))
		metrics.greedy_quads = quads
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	if DisplayServer.get_name() != "headless":
		var capture_error := root.get_texture().get_image().save_png(output_directory.path_join(backend + ".png"))
		if capture_error != OK:
			push_error("benchmark capture failed")
			quit(1)
			return
	var file := FileAccess.open(output_directory.path_join(backend + ".json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(metrics, "  "))
	file.close()
	if not display_errors.is_empty():
		print("RENDER BENCHMARK INVALID: %s" % JSON.stringify(display_errors))
		quit(1)
		return
	print("RENDER BENCHMARK PASS: %s" % JSON.stringify(metrics))
	quit(0)


func _p95(values: Array[float]) -> float:
	var sorted := values.duplicate()
	sorted.sort()
	return sorted[ceili(sorted.size() * 0.95) - 1]


func _median(values: Array[float]) -> float:
	var sorted := values.duplicate()
	sorted.sort()
	return (sorted[int((sorted.size() - 1) / 2)] + sorted[int(sorted.size() / 2)]) / 2.0
