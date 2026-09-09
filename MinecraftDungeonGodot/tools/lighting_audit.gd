extends SceneTree

var output_directory := "res://Saved/Verification/lighting-audit"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
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
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var profiles := [["baseline", 0.72, 0.38, Environment.TONE_MAPPER_LINEAR], ["soft", 0.22, 0.48, Environment.TONE_MAPPER_LINEAR], ["balanced", 0.30, 0.48, Environment.TONE_MAPPER_LINEAR], ["filmic", 0.42, 0.38, Environment.TONE_MAPPER_FILMIC]]
	var results := {}
	for profile in profiles:
		sun.light_energy = profile[1]
		environment.ambient_light_energy = profile[2]
		environment.tonemap_mode = profile[3]
		for view in ["surface", "cave"]:
			if view == "surface":
				player.global_position = Vector3(world.layout.spawn) + Vector3(0.5, 0.05, 0.5)
				player.rotation.y = deg_to_rad(24)
				player.camera.rotation.x = deg_to_rad(-12)
			else:
				player.global_position = Vector3(world.layout.cave_destination) + Vector3(0.5, 0.05, 0.5)
				player.rotation.y = PI / 2.0
				player.camera.rotation.x = 0.0
			for unused in 4: await process_frame
			await RenderingServer.frame_post_draw
			var frame := root.get_texture().get_image()
			var label: String = profile[0] + "-" + view
			var error := frame.save_png(output_directory.path_join(label + ".png"))
			var scene_frame: Image = await _capture_scene(instance)
			var stats := _measure(scene_frame)
			scene_frame.save_png(output_directory.path_join(label + "-scene.png"))
			stats.screenshot_error = error
			results[label] = stats
			print("LIGHTING AUDIT %s: %s" % [label, stats])
	var file := FileAccess.open(output_directory.path_join("lighting.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(results, "  "))
	quit()


func _measure(frame: Image) -> Dictionary:
	var total := 0
	var clipped := 0
	var dark := 0
	var luminance := 0.0
	for y in range(110, 570):
		for x in range(20, 1260):
			if absi(x - 640) < 6 and absi(y - 360) < 6: continue
			var color := frame.get_pixel(x, y)
			var value := color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
			total += 1
			luminance += value
			if minf(color.r, minf(color.g, color.b)) >= 0.98: clipped += 1
			if value < 0.1: dark += 1
	return {"pixels": total, "near_white_fraction": float(clipped) / total, "dark_fraction": float(dark) / total, "mean_display_luma": luminance / total}


# Keep the player-facing PNG, but measure terrain without any CanvasLayer UI.
# The original ROI and brightness thresholds remain unchanged. Hard-coded HUD
# masks become stale when a new panel enters the measurement region.
func _capture_scene(instance: Node) -> Image:
	var layers := {}
	for child in instance.get_children():
		if child is CanvasLayer:
			layers[child] = child.visible
			child.visible = false
	await process_frame
	await RenderingServer.frame_post_draw
	var frame := root.get_texture().get_image()
	for layer: CanvasLayer in layers: layer.visible = layers[layer]
	return frame
