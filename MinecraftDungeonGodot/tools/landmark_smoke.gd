extends SceneTree

var failures: Array[String] = []
var assertions := 0
var player: VoxelPlayer
var world: VoxelWorld
var output_directory := "res://Saved/Verification/landmarks"
var accelerated := false


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument == "--accelerated": accelerated = true
	call_deferred("_run")


func _run() -> void:
	if accelerated:
		# Eight simulated seconds per wall second, preserving 1/60 simulation dt.
		Engine.time_scale = 8.0
		Engine.physics_ticks_per_second = 480
		Engine.max_physics_steps_per_frame = 64
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	player = instance.get_node("Player")
	for seed_value in [1337, -48, 2147483647]:
		player.set_physics_process(false)
		if world.world_seed != seed_value: world.generate_world(seed_value, 41)
		player.global_position = Vector3(world.layout.spawn) + Vector3(0.5, 0.05, 0.5)
		player.velocity = Vector3.ZERO
		for unused in 4: await physics_frame
		player.set_physics_process(true)
		var targets: Array = []
		for structure: Dictionary in world.layout.structures: targets.append(structure.door)
		var survey := VoxelTraversal.survey(world.layout.cells, 41, world.layout.spawn, targets)
		_expect(survey.reachable == 6, "all six landmarks have final-cell graph paths")
		for index in targets.size():
			var path: Array = survey.paths[index]
			if path.is_empty(): continue
			var outward := await _walk(path)
			_expect(outward, "seed %d landmark %d outward actual W/Space traversal" % [seed_value, index])
			if not outward: break
			if seed_value == 1337 and index == 0 and DisplayServer.get_name() != "headless":
				DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
				await RenderingServer.frame_post_draw
				_expect(root.get_texture().get_image().save_png(output_directory.path_join("landmark-arrival.png")) == OK, "arrival PNG saved")
			path.reverse()
			var returned := await _walk(path)
			_expect(returned, "seed %d landmark %d return without teleport" % [seed_value, index])
			if not returned: break
	_expect(world.chunk_store.edits.is_empty(), "walking does not mine/place or repair at runtime")
	_expect(is_equal_approx(player.get_physics_process_delta_time(), 1.0 / 60.0), "physics simulation retains 1/60 second timestep")
	for failure in failures: push_error(failure)
	print("LANDMARK SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _walk(path: Array) -> bool:
	var frames := 0
	for feet: Vector3i in path:
		var target := Vector3(feet) + Vector3(0.5, 0, 0.5)
		var segment := 0
		while segment < 180:
			var delta := target - player.global_position
			var distance := Vector2(delta.x, delta.z).length()
			if distance < 0.13 and absf(delta.y) < 0.15 and player.is_on_floor(): break
			if distance > 0.09: player.rotation.y = atan2(-delta.x, -delta.z)
			_hold(KEY_W, distance > 0.09)
			_hold(KEY_SPACE, delta.y > 0.2)
			await physics_frame
			segment += 1
			frames += 1
		_hold(KEY_W, false)
		_hold(KEY_SPACE, false)
		if segment >= 180:
			print("LANDMARK WALK FAIL seed=%d feet=%s actual=%s grounded=%s" % [world.world_seed, feet, player.global_position, player.is_on_floor()])
			return false
	for unused in 4: await physics_frame
	print("LANDMARK WALK seed=%d nodes=%d frames=%d position=%s" % [world.world_seed, path.size(), frames, player.global_position])
	return true


func _hold(key: Key, pressed: bool) -> void:
	if Input.is_key_pressed(key) == pressed: return
	var event := InputEventKey.new()
	event.keycode = key
	event.pressed = pressed
	Input.parse_input_event(event)
	# The accelerated walker can request multiple transitions in one rendered
	# frame. Deliver each synthetic key before the next physics step rather than
	# allowing render-rate buffering to prolong movement past a waypoint.
	Input.flush_buffered_events()


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
