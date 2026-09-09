extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	var failures: Array[String] = []
	for seed_value in [1337, -7, 42]:
		player.set_physics_process(false)
		if world.world_seed != seed_value:
			world.generate_world(seed_value, 41)
		player.global_position = Vector3(world.layout.spawn) + Vector3(0.5, 0.05, 0.5)
		player.velocity = Vector3.ZERO
		player.rotation.y = -PI / 2.0
		for unused in 4:
			await physics_frame
		player.set_physics_process(true)
		var key := InputEventKey.new()
		key.keycode = KEY_W
		key.pressed = true
		Input.parse_input_event(key)
		var frames := 0
		var target: Vector3i = world.layout.cave_destination
		while player.global_position.x < target.x + 0.25 and frames < 500:
			await physics_frame
			frames += 1
		key = key.duplicate()
		key.pressed = false
		Input.parse_input_event(key)
		for unused in 45:
			await physics_frame
		var reached := player.global_position.x >= target.x and absf(player.global_position.y - target.y) < 0.2 and player.is_on_floor()
		print("CAVE TRAVERSAL seed=%d frames=%d reached=%s position=%s target=%s" % [seed_value, frames, reached, player.global_position, target])
		if not reached:
			failures.append("seed %d cannot walk down protected stairs to chamber" % seed_value)
		player.rotation.y = PI / 2.0
		key = key.duplicate()
		key.pressed = true
		Input.parse_input_event(key)
		var jump := InputEventKey.new()
		jump.keycode = KEY_SPACE
		jump.pressed = true
		Input.parse_input_event(jump)
		var return_frames := 0
		while player.global_position.x > 1.0 and return_frames < 700:
			await physics_frame
			return_frames += 1
		key = key.duplicate()
		key.pressed = false
		Input.parse_input_event(key)
		jump = jump.duplicate()
		jump.pressed = false
		Input.parse_input_event(jump)
		for unused in 45:
			await physics_frame
		var returned := player.global_position.x < 1.1 and absf(player.global_position.y - world.layout.spawn.y) < 0.2 and player.is_on_floor()
		print("CAVE RETURN seed=%d frames=%d returned=%s position=%s" % [seed_value, return_frames, returned, player.global_position])
		if not returned:
			failures.append("seed %d cannot walk/jump back to spawn from chamber" % seed_value)
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("CAVE TRAVERSAL PASS: 3 seeds, round trip with actual W/Space input and CharacterBody3D movement")
	quit(0 if failures.is_empty() else 1)
