extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/render-latency"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		print("RENDER LATENCY REJECTED: actual rendering required")
		quit(2)
		return
	var terrain := VoxelChunkRenderer.new()
	var factory := VoxelWorld.new()
	var library := factory._create_mesh_library()
	factory.free()
	for material_id in BlockRegistry.MATERIAL_COUNT:
		terrain.materials.append(library.get_item_mesh(material_id).surface_get_material(0))
	terrain.chunk_store.initialize(1337, 41, {}, 0)
	root.add_child(terrain)
	var environment := WorldEnvironment.new()
	environment.environment = WorldLighting.environment_resource()
	root.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_energy = WorldLighting.SUN_ENERGY
	sun.shadow_enabled = true
	root.add_child(sun)
	var camera := Camera3D.new()
	root.add_child(camera)
	camera.current = true
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	for cell: Vector3i in [Vector3i(15, 0, 0), Vector3i(16, 0, 0), Vector3i(-1, 0, 0)]:
		camera.position = Vector3(cell) + Vector3(0.5, 3.5, 7)
		camera.look_at(Vector3(cell) + Vector3.ONE * 0.5)
		for unused in 4: await process_frame
		await RenderingServer.frame_post_draw
		var baseline := root.get_texture().get_image().get_pixel(640, 360)
		for repetition in 4:
			terrain.set_cell_item(cell, BlockRegistry.BRICK if repetition % 2 == 0 else BlockRegistry.MOSS)
			_expect(int(terrain.rebuild_dirty().count) == 1, "single target chunk uploaded")
			# Match the benchmark's exact wait boundary, then force readback only
			# for correctness. Readback cost is NOT included in latency numbers.
			await process_frame
			await RenderingServer.frame_post_draw
			var frame := root.get_texture().get_image()
			var changed := frame.get_pixel(640, 360)
			_expect(_distance(baseline, changed) > 0.03, "first observed viewport contains new block at " + str(cell))
			if repetition == 3:
				_expect(frame.save_png(output_directory.path_join("latency-cell-%d.png" % cell.x)) == OK, "changed viewport PNG")
			terrain.set_cell_item(cell, -1)
			terrain.rebuild_dirty()
			await process_frame
			await RenderingServer.frame_post_draw
			_expect(_distance(baseline, root.get_texture().get_image().get_pixel(640, 360)) < 0.001, "first observed viewport removes block at " + str(cell))
	_expect(terrain.chunk_nodes.is_empty(), "empty target chunks retired")
	for failure in failures: push_error(failure)
	print("RENDER LATENCY SMOKE: %d assertions, %d failures; GPU readback validates viewport only, not physical presentation" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _distance(a: Color, b: Color) -> float:
	return absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
