extends SceneTree

var phase := ""
var output_directory := ""
var failures: Array[String] = []
var dungeon := false


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--phase="): phase = argument.trim_prefix("--phase=")
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument == "--dungeon": dungeon = true
	call_deferred("_run")


func _run() -> void:
	if phase not in ["write", "read"] or output_directory.is_empty():
		push_error("restart test requires explicit phase and isolated output")
		quit(2)
		return
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	player.set_physics_process(false)
	world.drops.set_physics_process(false)
	world.stations.set_physics_process(false)
	var restored_at_completion := {}
	world.save_service.completed.connect(func(operation: String, result: Dictionary) -> void:
		if operation == "load" and result.ok: restored_at_completion.state = player.capture_state())
	if dungeon: world.generate_world(1337, 41, "dungeon", 34)
	world.save_path = output_directory.path_join("dungeon-restart-checkpoint.json" if dungeon else "restart-checkpoint.json")
	var height: int = Array(world.layout.heights).max() + 6
	var expected := {}
	for index in 1004:
		expected[_cell(index, height)] = index % 9
	var chest_cell := _cell(1004, height)
	var furnace_cell := _cell(1005, height)
	if phase == "write":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
		for cell: Vector3i in expected: world.set_cell_item(cell, expected[cell])
		for index in 8:
			_expect(world.remove_cell_for_inventory(_cell(index, height), player.inventory), "restart fixture mining")
		for index in 4:
			_expect(world.place_from_inventory(_cell(index, height), 0, player.inventory, Vector3(999, 999, 999)), "restart fixture placement")
		player.selected_slot = 4
		player.global_position = Vector3(2.5, world.layout.spawn.y + 0.25, 1.5)
		player.rotation.y = 0.25
		player.pitch = -0.1
		player.camera.rotation.x = player.pitch
		player._set_stance(true)
		player.mining_tools.selected = 7
		player.mining_tools.remaining[7] = 183
		player.mining_tools.remaining[3] = 0
		world.chunk_store.set_state(Vector3i(world.layout.spawn) + Vector3i.DOWN, 17)
		world.chunk_store.set_state(_cell(8, height), 23)
		world.drops.spawn_item(2, 3, Vector3(250.25, 70.125, -260.5), Vector3(1.25, -2.5, 3.75), 0.2)
		world.drops.bodies[0].freeze = true
		world.drops.bodies[0].set_meta("paused_velocity", Vector3(1.25, -2.5, 3.75))
		# Real cursor transfers populate a distant backpack slot and leave a held stack.
		player.inventory.click(8, true)
		player.inventory.click(35, true)
		# Distinct tool instances in active gear, spare gear and the backpack.
		player.inventory.set_stack(9, 16, 1)
		player.inventory.durability[9] = 17
		player.inventory.equip_from_slot(9, 0)
		player.inventory.set_stack(9, 24, 1)
		player.inventory.durability[9] = 0
		player.inventory.equip_from_slot(9, 3)
		player.inventory.set_stack(9, 19, 1)
		player.inventory.durability[9] = 83
		player.inventory.set_stack(10, ItemRegistry.WORKBENCH, 1)
		# Cell-bound station state has independent inventory and partial fixed tick progress.
		world.set_cell_item(chest_cell, BlockRegistry.PLANK)
		world.chunk_store.stations[chest_cell] = StationState.create(ItemRegistry.CHEST)
		world.chunk_store.stations[chest_cell].slots[26] = [ItemRegistry.TOOL_BASE, 1, 17]
		world.set_cell_item(furnace_cell, BlockRegistry.BRICK)
		world.chunk_store.stations[furnace_cell] = StationState.create(ItemRegistry.FURNACE)
		world.chunk_store.stations[furnace_cell].slots[0] = [ItemRegistry.RAW_IRON, 2]
		world.chunk_store.stations[furnace_cell].slots[1] = [ItemRegistry.COAL, 1]
		world.chunk_store.stations[furnace_cell].burn = 1511
		world.chunk_store.stations[furnace_cell].cook = 89
		_expect(world.save_game(player), "writer starts background checkpoint")
	else:
		_expect(world.chunk_store.edits.is_empty() and player.total_mined == 0 and player.inventory.count(0) == 8, "reader starts with fresh process state")
		_expect(world.load_game(player), "reader starts persisted checkpoint")
	var deadline := Time.get_ticks_msec() + 10000
	while world.save_service.is_busy() and Time.get_ticks_msec() < deadline: await process_frame
	_expect(not world.save_service.is_busy() and not world.loading, "operation finishes within timeout")
	_expect(world.chunk_store.generation_options == ({"mode": "dungeon", "room_attempts": 34} if dungeon else {"mode": "overworld"}), "generation settings survive process reconstruction")
	for index in 4: expected[_cell(index, height)] = BlockRegistry.COBBLESTONE
	expected[chest_cell] = BlockRegistry.PLANK
	expected[furnace_cell] = BlockRegistry.BRICK
	# Removing a fixture cell whose generated base is air normalizes out of the journal.
	for index in range(4, 8): expected.erase(_cell(index, height))
	_expect(world.chunk_store.edits == expected, "all 1,000 effective edits match independent fixture")
	_expect(player.total_mined == 8 and player.total_placed == 4 and player.challenge_complete(), "challenge resumes at 8/4")
	_expect(Array(player.inventory.counts.slice(0, 9)) == [5, 9, 9, 9, 9, 9, 9, 9, 4], "hotbar matches mining, placement and cursor transfer")
	_expect(player.inventory.item_at(35) == 8 and player.inventory.count(35) == 1 and Array(player.inventory.cursor) == [8, 3], "backpack and held cursor survive OS restart")
	_expect(player.inventory.stack_at(9) == [19, 1, 83] and player.inventory.stack_at(10) == [13, 1], "worn backpack tool and workbench survive OS restart")
	_expect(player.inventory.equipment == [[16, 1, 17], [-1, 0], [-1, 0], [24, 1, 0]], "active and exhausted spare instances survive OS restart")
	_expect(world.chunk_store.stations.size() == 2 and world.chunk_store.stations[chest_cell].slots[26] == [16, 1, 17], "27th chest slot and worn tool survive OS restart")
	_expect(world.chunk_store.stations[furnace_cell].slots.slice(0, 2) == [[11, 2], [10, 1]] and world.chunk_store.stations[furnace_cell].burn == 1511 and world.chunk_store.stations[furnace_cell].cook == 89, "partial furnace burn/cook state survives OS restart")
	_expect(player.mining_tools.effective().kind == "pickaxe" and player.mining_tools.effective().tier == 1, "restored gear overrides preview toolkit")
	for slot in range(11, 35): _expect(player.inventory.item_at(slot) == -1 and player.inventory.count(slot) == 0, "unused backpack slot remains empty")
	_expect(player.selected_slot == 4 and is_equal_approx(player.rotation.y, 0.25) and is_equal_approx(player.pitch, -0.1), "selection and view resume")
	_expect(player.crouched and is_equal_approx(player.body_capsule.height, 1.5) and is_equal_approx(player.camera.position.y, 1.27), "crouch state, collision height and eye resume")
	_expect(player.mining_tools.selected == 7 and player.mining_tools.remaining[7] == 183 and player.mining_tools.remaining[3] == 0, "used and exhausted tools survive OS restart")
	_expect(world.chunk_store.get_state(Vector3i(world.layout.spawn) + Vector3i.DOWN) == 17, "state-only generated cell survives OS restart")
	_expect(world.chunk_store.get_state(_cell(8, height)) == 23, "edited log orientation survives OS restart")
	var drop_state: Array = restored_at_completion.state.drops if phase == "read" and restored_at_completion.has("state") else world.drops.capture()
	_expect(drop_state == [{"slot": 2, "amount": 3, "position": [250.25, 70.125, -260.5], "velocity": [1.25, -2.5, 3.75], "delay": 0.2}], "out-of-grid physical stack pose, motion and delay survive OS restart")
	_expect(player.global_position.distance_to(Vector3(2.5, world.layout.spawn.y + 0.25, 1.5)) < 0.001, "position resumes")
	if phase == "read":
		var all_cells_match := true
		for cell: Vector3i in expected:
			if world.get_cell_item(cell) != expected[cell]: all_cells_match = false
		for index in range(4, 8):
			if world.get_cell_item(_cell(index, height)) != -1: all_cells_match = false
		_expect(all_cells_match, "loaded render store contains all checkpoint edits")
		_expect((instance.get_node("HUD") as GameHud).challenge_label.text.contains("COMPLETE"), "fresh process HUD restores completion")
	for failure in failures: push_error(failure)
	print("RESTART PERSISTENCE %s: pid=%d failures=%d edits=%d dungeon=%s" % [phase, OS.get_process_id(), failures.size(), world.chunk_store.edits.size(), dungeon])
	quit(0 if failures.is_empty() else 1)


func _cell(index: int, height: int) -> Vector3i:
	return Vector3i(index % 40 - 20, height + int(index / 40), -10)


func _expect(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
