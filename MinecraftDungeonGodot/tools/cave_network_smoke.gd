extends "res://tools/landmark_smoke.gd"


func _run() -> void:
	if accelerated:
		Engine.time_scale = 8.0
		Engine.physics_ticks_per_second = 480
		Engine.max_physics_steps_per_frame = 64
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	player = instance.get_node("Player")
	var hud: GameHud = instance.get_node("HUD")
	for fixture in [[1337, 41], [-7, 41], [2147483647, 41], [1337, 185]]:
		player.set_physics_process(false)
		if world.world_seed != fixture[0] or world.world_size != fixture[1]: world.generate_world(fixture[0], fixture[1])
		player.global_position = Vector3(world.layout.spawn) + Vector3(0.5, 0.05, 0.5)
		player.velocity = Vector3.ZERO
		for unused in 4: await physics_frame
		player.set_physics_process(true)
		var network: Dictionary = world.layout.cave_network
		var targets: Array = []
		for room: Dictionary in network.rooms: targets.append(room.center)
		_expect(VoxelTraversal.survey(world.layout.cells, world.world_size, world.layout.spawn, targets).reachable == 5, "five rooms reachable in final-cell graph")
		var entered := await _walk(world.layout.cave_path)
		_expect(entered, "walk original entrance stair")
		if not entered: break
		entered = await _walk(network.access)
		_expect(entered, "walk descending access to deep hub")
		if not entered: break
		for index in network.branches.size():
			var branch: Array = network.branches[index]
			var reached := await _walk(branch)
			_expect(reached, "room %d outward traversal %s" % [index, fixture])
			if not reached: break
			hud._refresh_navigation()
			_expect(hud.navigation_panel.visible and str(network.rooms[index + 1].name).to_upper() in hud.navigation_title.text, "actual arrival names the correct chamber")
			if fixture[0] == 1337 and fixture[1] == 41 and DisplayServer.get_name() != "headless":
				DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
				player.camera.rotation.x = -0.15
				await RenderingServer.frame_post_draw
				_expect(root.get_texture().get_image().save_png(output_directory.path_join("cave-room-%d.png" % index)) == OK, "room PNG")
				# Also inspect the entrance and floor ring; an outward wall alone
				# cannot demonstrate chamber shape or visual wayfinding quality.
				var return_delta := Vector3(branch[-2]) - player.global_position
				player.rotation.y = atan2(-return_delta.x, -return_delta.z)
				player.camera.rotation.x = -0.45
				for unused in 4: await process_frame
				await RenderingServer.frame_post_draw
				_expect(root.get_texture().get_image().save_png(output_directory.path_join("cave-room-return-%d.png" % index)) == OK, "room entrance and floor PNG")
			# Follow the displayed atlas graph, not the generator's original path.
			var returning: Array = [network.rooms[index + 1].center]
			while returning[-1] != network.rooms[0].center and returning.size() <= hud.wayfinding.candidates.size():
				var current: Vector3i = returning[-1]
				if not hud.wayfinding.parents.has(current) or hud.wayfinding.parents[current] == current: break
				returning.append(hud.wayfinding.parents[current])
			# The shortest exit may bypass the hub at a corridor junction. In that
			# case prove the whole suggested exit, then walk the known access back.
			_expect(returning.size() <= hud.wayfinding.candidates.size(), "atlas parent chain terminates")
			_expect(await _walk(returning), "room %d atlas return without teleport %s" % [index, fixture])
			if returning[-1] != network.rooms[0].center:
				_expect(returning[-1] == world.layout.spawn, "atlas bypass reaches surface exit")
				_expect(await _walk(world.layout.cave_path) and await _walk(network.access), "walk back to hub after atlas exit")
		var access_return: Array = network.access.duplicate()
		access_return.reverse()
		_expect(await _walk(access_return), "return up access stair")
		var entrance_return: Array = world.layout.cave_path.duplicate()
		entrance_return.reverse()
		_expect(await _walk(entrance_return), "return to spawn without teleport")
		_expect(world.chunk_store.edits.is_empty(), "exploration does not mine or repair terrain")
	_expect(is_equal_approx(player.get_physics_process_delta_time(), 1.0 / 60.0), "physics dt remains 1/60")
	for failure in failures: push_error(failure)
	print("CAVE NETWORK SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)
