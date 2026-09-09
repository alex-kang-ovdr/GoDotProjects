extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/builder"
var input_player: VoxelPlayer


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	input_player = player
	var hud := instance.get_node("HUD") as GameHud
	player.set_physics_process(false)
	player.profile_directory = output_directory.path_join("profiles-%d" % OS.get_process_id())
	var y: int = Array(world.layout.heights).max() + 6
	var target := Vector3i(12, y, 12)
	player.global_position = Vector3(12.5, y + 2.0, 12.5)
	player.rotation = Vector3.ZERO
	player.pitch = deg_to_rad(-89.0)
	player.camera.rotation.x = player.pitch
	_expect(player.total_mined == 0 and player.total_placed == 0 and not player.challenge_complete(), "challenge starts empty")
	for index in 8:
		world.set_cell_item(target, BlockRegistry.STONE)
		world.rebuild_dirty()
		for unused in 3: await physics_frame
		if DisplayServer.get_name() == "headless":
			world.remove_cell_for_inventory(target, player.inventory)
		else:
			await _click(MOUSE_BUTTON_LEFT)
		_expect(player.total_mined == index + 1, "successful mine counted once %d" % index)
	_expect(not player.challenge_complete(), "mining alone does not complete challenge")
	for index in 4:
		world.set_cell_item(target, -1)
		world.set_cell_item(target + Vector3i.DOWN, BlockRegistry.STONE)
		world.rebuild_dirty()
		for unused in 3: await physics_frame
		if DisplayServer.get_name() == "headless":
			world.place_from_inventory(target, 0, player.inventory, player.global_position)
		else:
			await _click(MOUSE_BUTTON_RIGHT)
		_expect(player.total_placed == index + 1, "successful placement counted once %d" % index)
	_expect(player.challenge_complete() and hud.challenge_label.text.contains("COMPLETE"), "8/4 updates completion HUD")
	var checkpoint := world.chunk_store.encode(player.capture_state())
	world.set_cell_item(target, BlockRegistry.WATER)
	_expect(not world.remove_cell_for_inventory(target, player.inventory), "water cannot count as mining")
	world.set_cell_item(target, BlockRegistry.LEAVES)
	_expect(not world.remove_cell_for_inventory(target, player.inventory), "leaves cannot count as mining")
	_expect(not world.place_from_inventory(target, 0, player.inventory, Vector3(999, 999, 999)), "occupied placement rejected")
	for slot in BlockInventory.SLOT_COUNT: player.inventory.set_stack(slot, 0, 64)
	world.set_cell_item(target, BlockRegistry.STONE)
	_expect(not world.remove_cell_for_inventory(target, player.inventory), "full inventory rejects mine")
	player.inventory.set_stack(0, -1, 0)
	world.set_cell_item(target, -1)
	_expect(not world.place_from_inventory(target, 0, player.inventory, Vector3(999, 999, 999)), "empty inventory rejects place")
	_expect(player.total_mined == 8 and player.total_placed == 4, "failed actions preserve counters")
	var outsider := BlockInventory.new()
	world.set_cell_item(target, BlockRegistry.STONE)
	world.remove_cell_for_inventory(target, outsider)
	_expect(player.total_mined == 8, "another inventory does not advance player challenge")
	for field in ["total_mined", "total_placed"]:
		for bad in [-1, 0.5, 2147483648, "8", null]:
			var state := player.capture_state()
			state[field] = bad
			var before := player.capture_state()
			var edits_before := world.chunk_store.edits.duplicate()
			var encoded := world.chunk_store.encode(state)
			_expect(not world.apply_saved_game(encoded, player).ok, "invalid %s rejected" % field)
			_expect(before == player.capture_state() and edits_before == world.chunk_store.edits, "invalid counter transaction is atomic")
	_expect(world.apply_saved_game(checkpoint, player).ok and player.challenge_complete(), "checkpoint restores completed challenge")
	var legacy := player.capture_state()
	legacy.erase("total_mined")
	legacy.erase("total_placed")
	_expect(player.restore_state(legacy) and player.total_mined == 0 and player.total_placed == 0, "legacy format-2 state defaults counters to zero")
	_expect(world.apply_saved_game(checkpoint, player).ok and player.challenge_complete(), "completion can be restored after legacy load")
	var saturated := player.capture_state()
	saturated.total_mined = 2147483647
	saturated.total_placed = 2147483647
	_expect(player.restore_state(saturated), "maximum counters are valid")
	world.set_cell_item(target, BlockRegistry.STONE)
	_expect(world.remove_cell_for_inventory(target, player.inventory), "mining at maximum counter still works")
	_expect(world.place_from_inventory(target, 0, player.inventory, player.global_position), "placement at maximum counter still works")
	_expect(player.total_mined == 2147483647 and player.total_placed == 2147483647, "counters saturate without wrapping")
	world.apply_saved_game(checkpoint, player)
	if DisplayServer.get_name() != "headless":
		await _test_keys(world, player, hud)
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
		await RenderingServer.frame_post_draw
		_expect(root.get_texture().get_image().save_png(output_directory.path_join("builder.png")) == OK, "builder HUD captured")
		print("BUILDER INPUT: viewport mining, placement, development keys and R tested")
	# An edited-in solid room must reject R without changing player state or clearing blocks.
	for x in range(-2, 3):
		for z in range(-2, 3):
			for dy in range(-5, 7): world.set_cell_item(world.layout.spawn + Vector3i(x, dy, z), BlockRegistry.STONE)
	var trapped_state := player.capture_state()
	var trapped_edits := world.chunk_store.edits.duplicate()
	_expect(not player.return_to_spawn(), "fully blocked entrance rejects return")
	_expect(player.capture_state() == trapped_state and world.chunk_store.edits == trapped_edits, "failed return does not teleport or alter terrain")
	# Restore resets the counter displays, and world generation starts a new session.
	world.generate_world(42, 41)
	_expect(player.total_mined == 0 and player.total_placed == 0 and player.selected_slot == 0, "new world resets challenge and selection")
	_expect(player.inventory.count(0) == 8 and hud.challenge_label.text.contains("Mine 0/8"), "new world resets inventory and HUD")
	for failure in failures: push_error(failure)
	print("BUILDER SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _test_keys(world: VoxelWorld, player: VoxelPlayer, hud: GameHud) -> void:
	await _key(KEY_5)
	_expect(player.selected_slot == 4, "plain number selects hotbar")
	await _key(KEY_1, true)
	_expect(player.selected_slot == 4 and player.inventory.count(4) == 64, "Ctrl+1 fills selected slot without selecting slot 1")
	await _key(KEY_2, true)
	_expect(player.selected_slot == 4 and player.inventory.count(4) == 0, "Ctrl+2 clears selected slot without selecting slot 2")
	_expect(player.total_mined == 8 and player.total_placed == 4, "cheat actions do not count as gameplay")
	await _key(KEY_0, true)
	_expect(player.cheat_hud_visible and hud.development_label.visible, "Ctrl+0 opens development HUD")
	await _key(KEY_3, true)
	_expect(hud.feedback_label.text.begins_with("Diagnostics PASS"), "Ctrl+3 diagnoses state")
	await _key(KEY_1, false, true)
	_expect(player.selected_slot == 4 and hud.performance_label.visible, "Alt+1 opens performance HUD without slot change")
	await _key(KEY_3, false, true)
	_expect(FileAccess.file_exists(player.last_profile_path), "Alt+3 writes profile snapshot")
	if FileAccess.file_exists(player.last_profile_path):
		var profile: Variant = JSON.parse_string(FileAccess.get_file_as_string(player.last_profile_path))
		_expect(profile is Dictionary and profile.signature == world.layout.signature, "profile describes current world")
	await _key(KEY_7, true)
	_expect(player.selected_slot == 4, "unknown modified number is not a hotbar selection")
	world.save_path = output_directory.path_join("keyboard-checkpoint.json")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	await _key(KEY_8, true)
	await _wait_service(world)
	_expect(FileAccess.file_exists(world.save_path), "Ctrl+8 writes checkpoint")
	player.total_mined = 0
	player.total_placed = 0
	await _key(KEY_9, true)
	await _wait_service(world)
	_expect(player.challenge_complete() and hud.challenge_label.text.contains("COMPLETE"), "Ctrl+9 restores challenge and HUD")
	# World-drop motion is asynchronous presentation state.  The loading lock is
	# responsible for rejecting player commands, so compare the player-owned
	# command state and deliberately exclude unrelated drop interpolation.
	var before := player.capture_state()
	before.erase("drops")
	world.loading = true
	await _key(KEY_1, true)
	await _key(KEY_R)
	var after := player.capture_state()
	after.erase("drops")
	_expect(before == after, "load lock blocks cheats and return")
	world.loading = false
	# Fill the exact spawn feet; R must find another supported cell using current edits.
	world.set_cell_item(world.layout.spawn, BlockRegistry.BRICK)
	await _key(KEY_R)
	var feet := world.local_to_map(player.global_position)
	_expect(feet != world.layout.spawn and world.get_cell_item(feet) == -1, "R avoids edited blocked spawn")
	_expect(player.velocity == Vector3.ZERO and player.challenge_complete(), "R clears velocity but preserves progression")
	player.set_physics_process(true)
	for unused in 30: await physics_frame
	_expect(player.is_on_floor(), "returned player lands on actual chunk collision")
	player.set_physics_process(false)


func _click(button: MouseButton) -> void:
	var mined_before := input_player.total_mined
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.position = root.get_visible_rect().size * 0.5
	event.pressed = true
	Input.parse_input_event(event)
	if button == MOUSE_BUTTON_LEFT:
		var deadline := Time.get_ticks_msec() + 5000
		while input_player.total_mined == mined_before and Time.get_ticks_msec() < deadline: await process_frame
	else:
		await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _wait_service(world: VoxelWorld) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while world.save_service.is_busy() and Time.get_ticks_msec() < deadline: await process_frame
	_expect(not world.save_service.is_busy(), "keyboard persistence finishes")


func _key(code: Key, ctrl := false, alt := false) -> void:
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
