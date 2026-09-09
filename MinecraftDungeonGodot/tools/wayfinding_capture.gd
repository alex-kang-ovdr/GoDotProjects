extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output_directory := "res://Saved/Verification/wayfinding-dev"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		print("WAYFINDING CAPTURE REJECTED: actual renderer required")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	var hud: GameHud = instance.get_node("HUD")
	player.set_physics_process(false)
	# Deliberate fixed-pose visual fixtures, separate from the real walking test.
	player.position = Vector3(world.layout.cave_network.rooms[3].center) + Vector3(0.5, 0, 0.5)
	player.rotation.y = PI
	player.camera.rotation.x = -0.35
	for unused in 4: await process_frame
	_expect(hud.navigation_panel.visible and "NORTHERN CHAMBER" in hud.navigation_title.text, "rendered room identity")
	_expect(hud.navigation_title.get_minimum_size().x <= hud.navigation_panel.size.x - 32, "long room title fits")
	await _capture("atlas-room.png")
	player.rotation.y = deg_to_rad(140)
	for unused in 4: await process_frame
	_expect("Facing SW" in hud.navigation_title.text and "LEFT (S)" in hud.navigation_detail.text, "diagonal heading distinguishes relative turn from cardinal exit")
	await _capture("atlas-bearing.png")
	player.rotation.y = PI
	for z in range(-1, 2): world.set_cell_item(Vector3i(1, world.layout.spawn.y, z), BlockRegistry.BRICK)
	world.rebuild_dirty()
	for unused in 4: await process_frame
	_expect("No verified exit route" in hud.navigation_detail.text, "rendered blocked warning")
	_expect(hud.navigation_detail.get_minimum_size().x <= hud.navigation_panel.size.x - 32, "warning fits actual renderer")
	await _capture("atlas-blocked.png")
	world.chunk_store.apply_edits({})
	world.rebuild_dirty()
	for unused in 4: await process_frame
	_expect("EXIT:" in hud.navigation_detail.text, "rendered restored route")
	await _capture("atlas-restored.png")
	player.controls_open = true
	for unused in 2: await process_frame
	_expect(not hud.navigation_panel.visible, "controls hide rendered guidance")
	player.controls_open = false
	world.generate_world(1337, 41, "dungeon", 24)
	for unused in 4: await process_frame
	_expect(not hud.navigation_panel.visible and hud.wayfinding.candidates.is_empty(), "actual dungeon replacement clears old atlas")
	world.generate_world(1337, 41)
	for unused in 4: await process_frame
	_expect(hud.navigation_panel.visible and "SURFACE EXIT" in hud.navigation_detail.text, "overworld replacement binds fresh atlas")
	_expect(world.chunk_store.edits.is_empty(), "visual fixtures leave regenerated world unedited")
	for failure in failures: push_error(failure)
	print("WAYFINDING CAPTURE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _capture(filename: String) -> void:
	await RenderingServer.frame_post_draw
	_expect(root.get_texture().get_image().save_png(output_directory.path_join(filename)) == OK, "PNG " + filename)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
