extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/interfaces"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	_parser_tests()
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	var indicator := world.get_node("TargetIndicator") as TargetIndicator
	var controls := instance.get_node("GenerationControls") as GenerationControls
	player.set_physics_process(false)
	# This fixture injects keyboard events, not host cursor motion. Keep OS cursor
	# recenter events from replacing the explicitly aimed camera during capture.
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var cell := Vector3i(-17, 70, -16)
	world.set_cell_item(cell, BlockRegistry.BRICK)
	world.rebuild_dirty()
	player.global_position = Vector3(cell) + Vector3(2.5, 1.7, 3.5)
	player.camera.look_at(world.to_global(world.map_to_local(cell)))
	player.pitch = player.camera.rotation.x
	for unused in 4: await physics_frame
	_expect(indicator.visible and indicator.outline.visible and not indicator.debug_geometry.visible, "basic target outline is visible without debug")
	_expect(indicator.target.get("hit") == cell and indicator.position == world.map_to_local(cell), "outline centers on negative/boundary voxel")
	_expect(indicator.outline.mesh.get_surface_count() == 1 and indicator.debug_geometry.mesh.get_surface_count() == 1, "indicator geometry built once in two small meshes")
	_expect(indicator.process_physics_priority > player.process_physics_priority, "aim ray samples after player physics movement")
	var basic_mesh := indicator.outline.mesh
	var debug_mesh := indicator.debug_geometry.mesh
	var saved := world.chunk_store.encode(player.capture_state())
	await _key(KEY_2, false, true)
	for unused in 3: await physics_frame
	_expect(player.voxel_debug_visible and indicator.debug_geometry.visible and not indicator.outline.visible, "Alt+2 switches to highlighted coordinate axes")
	_expect(player.selected_slot == 0, "Alt+2 does not select slot two")
	_expect(world.chunk_store.encode(player.capture_state()) == saved, "debug toggle does not change world, inventory or player checkpoint")
	var ray := world.get_target(player.camera.global_position, -player.camera.global_transform.basis.z)
	_expect(ray.get("hit") == cell, "debug geometry does not intercept the mining ray")
	for unused in 20: await physics_frame
	_expect(indicator.outline.mesh == basic_mesh and indicator.debug_geometry.mesh == debug_mesh, "steady aim reuses geometry without allocating per frame")
	await _capture("voxel-axes.png")
	await _key(KEY_2, false, true)
	for unused in 2: await physics_frame
	_expect(not player.voxel_debug_visible and indicator.outline.visible, "second Alt+2 restores basic outline")
	await _key(KEY_TAB)
	for unused in 2: await physics_frame
	_expect(not indicator.visible and indicator.target.is_empty(), "generation panel hides aim marker")
	await _key(KEY_2, false, true)
	_expect(not player.voxel_debug_visible, "panel consumes debug key")
	await _key(KEY_TAB)
	await _key(KEY_2, false, true)
	world.loading = true
	for unused in 2: await physics_frame
	_expect(not indicator.visible, "checkpoint loading hides stale target")
	world.loading = false
	world.generating = true
	for unused in 2: await physics_frame
	_expect(not indicator.visible, "generation hides stale target")
	world.generating = false
	player.camera.look_at(player.camera.global_position + Vector3.UP, Vector3.FORWARD)
	for unused in 2: await physics_frame
	_expect(not indicator.visible and indicator.target.is_empty(), "ray miss clears target")
	player.camera.look_at(world.to_global(world.map_to_local(cell)))
	_expect(world.remove_cell_for_inventory(cell, player.inventory), "mining still works with visualization enabled")
	world.rebuild_dirty()
	for unused in 3: await physics_frame
	_expect(not indicator.visible, "mined block cannot retain stale outline")
	world.generate_world(1337, 11, "dungeon", 1)
	player.set_physics_process(false)
	var floor_cell: Vector3i = world.layout.spawn + Vector3i.DOWN
	player.global_position = Vector3(floor_cell) + Vector3(0.5, 1.5, 0.5)
	player.camera.look_at(world.map_to_local(floor_cell), Vector3.FORWARD)
	for unused in 4: await physics_frame
	_expect(indicator.target.get("hit") == floor_cell and indicator.visible, "same indicator follows replaced dungeon collision")
	_expect(indicator.get_parent() == world and indicator.debug_geometry.visible, "world replacement preserves debug setting and indicator lifetime")
	controls.set_open(false)
	for failure in failures: push_error(failure)
	print("INTERFACE SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _parser_tests() -> void:
	var defaults := LaunchOptions.parse([])
	_expect(defaults.ok and defaults.mode == "overworld" and defaults.seed == 1337 and defaults.size == 41 and not defaults.checks and not defaults.requested, "no-argument launch preserves baseline")
	var native := LaunchOptions.parse(["--mode=dungeon", "--seed=-7", "--size=12", "--room-attempts=512", "--checks=off", "--poi=on"])
	_expect(native.ok and native.mode == "dungeon" and native.seed == -7 and native.size == 13 and native.room_attempts == 512 and not native.checks and native.poi, "native generation options normalize and apply")
	var legacy := LaunchOptions.parse(["-Overworld", "-DungeonSeed=42", "-WorldSize=42", "-NoGenerationChecks", "-DungeonPOI"])
	_expect(legacy.ok and legacy.mode == "overworld" and legacy.seed == 42 and legacy.size == 43 and not legacy.checks and legacy.poi, "Unreal Overworld flags supported")
	legacy = LaunchOptions.parse(["-DungeonSeed=-2147483648", "-DungeonSize=11", "-RoomAttempts=1"])
	_expect(legacy.ok and legacy.mode == "dungeon" and legacy.size == 11 and legacy.seed == -2147483648 and legacy.room_attempts == 1 and legacy.checks, "Unreal dungeon flags supported")
	_expect(LaunchOptions.parse(["--seed=2147483647"]).seed == 2147483647, "maximum signed seed accepted")
	_expect(LaunchOptions.parse(["--mode=overworld"]).size == 185, "explicit Overworld generation defaults to shared size 185")
	_expect(LaunchOptions.parse(["--output=x", "--runtime"]).size == 41, "test-runner options do not trigger different world")
	for invalid in [["--seed"], ["--seed=no"], ["--seed=1.0"], ["--seed=2147483648"], ["--seed=-2147483649"], ["--seed=999999999999999999999"], ["--seed=1", "-DungeonSeed=2"], ["--size=40"], ["--size=256"], ["--mode=dungeon", "--size=10"], ["--room-attempts=0"], ["--room-attempts=513"], ["--checks=true"], ["--poi=maybe"], ["--mode=sky"], ["-Overworld", "-DungeonSize=41"], ["--mode=dungeon", "-WorldSize=41"], ["--size=41", "-WorldSize=41"], ["-NoGenerationChecks=0"], ["-DungeonPOI=false"], ["-Overworld=1"], ["--mode=overworld", "-Overworld"]]:
		_expect(not LaunchOptions.parse(PackedStringArray(invalid)).ok, "invalid/ambiguous launch options rejected: %s" % [invalid])


func _capture(name: String) -> void:
	if DisplayServer.get_name() == "headless": return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	await RenderingServer.frame_post_draw
	var captured := root.get_texture().get_image()
	_expect(captured.save_png(output_directory.path_join(name)) == OK, "axes screenshot saved")
	var colored := [0, 0, 0, 0]
	for y in range(200, 520):
		for x in range(400, 880):
			var pixel := captured.get_pixel(x, y)
			if pixel.r > 0.8 and pixel.g < 0.5 and pixel.b < 0.5: colored[0] += 1
			if pixel.g > 0.7 and pixel.r < 0.6 and pixel.b < 0.7: colored[1] += 1
			if pixel.b > 0.8 and pixel.g < 0.65 and pixel.r < 0.5: colored[2] += 1
			if pixel.g > 0.8 and pixel.b > 0.85 and pixel.r < 0.6: colored[3] += 1
	_expect(colored.min() >= 3, "render contains red/green/blue axes and cyan outline")
	print("AXES RENDER PIXELS red/green/blue/cyan=%s" % [colored])


func _key(code: Key, ctrl: bool = false, alt: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.ctrl_pressed = ctrl
	event.alt_pressed = alt
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
