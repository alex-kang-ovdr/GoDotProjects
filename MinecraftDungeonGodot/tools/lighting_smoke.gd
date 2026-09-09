extends "res://tools/lighting_audit.gd"

var failures: Array[String] = []
var assertions := 0


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("lighting verification requires actual rendering")
		quit(1)
		return
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var player := instance.get_node("Player") as VoxelPlayer
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	player.set_physics_process(false)
	var environment: Environment
	var sun: DirectionalLight3D
	for child in instance.get_children():
		if child is WorldEnvironment: environment = child.environment
		if child is DirectionalLight3D: sun = child
	_expect(is_equal_approx(sun.light_energy, WorldLighting.SUN_ENERGY) and is_equal_approx(environment.ambient_light_energy, WorldLighting.AMBIENT_ENERGY), "production scene uses reviewed profile")
	_expect(sun.shadow_enabled and environment.tonemap_mode == Environment.TONE_MAPPER_LINEAR, "shadows and linear mapper preserved")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var results := {"profile": WorldLighting.PROFILE_ID, "renderer": RenderingServer.get_current_rendering_method(), "measurement_scope": "terrain-only viewport: CanvasLayers hidden, original ROI and thresholds; paired HUD PNG retained", "scenes": {}}
	for seed_value in [1337, -7, 42]:
		if world.world_seed != seed_value: world.generate_world(seed_value, 41)
		var signature: int = world.layout.signature
		for view in ["surface", "cave"]:
			player.global_position = Vector3(world.layout.spawn if view == "surface" else world.layout.cave_destination) + Vector3(0.5, 0.05, 0.5)
			player.rotation.y = deg_to_rad(24) if view == "surface" else PI / 2.0
			player.camera.rotation.x = deg_to_rad(-12) if view == "surface" else 0.0
			var metrics := {}
			for variant in ["baseline", "current"]:
				sun.light_energy = 0.72 if variant == "baseline" else WorldLighting.SUN_ENERGY
				environment.ambient_light_energy = 0.38 if variant == "baseline" else WorldLighting.AMBIENT_ENERGY
				for unused in 4: await process_frame
				await RenderingServer.frame_post_draw
				var frame := root.get_texture().get_image()
				_expect(frame.get_width() == 1280 and frame.get_height() == 720, "native 1280x720 frame")
				var label := "lighting-%d-%s-%s" % [seed_value, view, variant]
				_expect(frame.save_png(output_directory.path_join(label + ".png")) == OK, "PNG written")
				var scene_frame: Image = await _capture_scene(instance)
				_expect(scene_frame.save_png(output_directory.path_join(label + "-scene.png")) == OK, "terrain-only PNG written")
				metrics[variant] = _measure(scene_frame)
			if view == "surface":
				_expect(metrics.current.near_white_fraction < 0.01 and metrics.current.near_white_fraction <= metrics.baseline.near_white_fraction, "surface near-white area below one percent without worsening baseline")
				_expect(metrics.current.mean_display_luma > 0.25, "surface not simply blackened")
			else:
				_expect(metrics.current.mean_display_luma > metrics.baseline.mean_display_luma * 1.1, "cave display brightness improves at least ten percent")
				_expect(metrics.current.mean_display_luma < 0.4 and metrics.current.dark_fraction < 0.01, "cave stays readable without becoming washed out")
			results.scenes["%d-%s" % [seed_value, view]] = metrics
			print("LIGHTING COMPARE seed=%d view=%s: %s" % [seed_value, view, metrics])
		_expect(world.layout.signature == signature and DeterministicWorldGenerator.signature(world.chunk_store.base_cells) == signature and world.chunk_store.edits.is_empty(), "lighting does not mutate generation or edits")
	var file := FileAccess.open(output_directory.path_join("lighting-metrics.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(results, "  "))
	for failure in failures: push_error(failure)
	print("LIGHTING SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
