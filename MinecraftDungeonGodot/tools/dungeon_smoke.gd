extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/dungeon"
var runtime := false
var world: VoxelWorld
var player: VoxelPlayer
var controls: GenerationControls


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument == "--runtime": runtime = true
	call_deferred("_run")


func _run() -> void:
	if runtime: await _runtime()
	else: _data_tests()
	for failure in failures: push_error(failure)
	print("DUNGEON SMOKE: %d assertions, %d failures, runtime=%s" % [assertions, failures.size(), runtime])
	quit(0 if failures.is_empty() else 1)


func _data_tests() -> void:
	var started := Time.get_ticks_msec()
	for seed_value in range(-64, 64):
		var size: int = [11, 41, 65][posmod(seed_value, 3)]
		var attempts := 1 + posmod(seed_value * 13, 512)
		var first := DungeonGenerator.generate(seed_value, size, attempts)
		var again := DungeonGenerator.generate(seed_value, size, attempts)
		_expect(first.cells == again.cells and first.rooms == again.rooms and first.dungeon_path == again.dungeon_path and first.signature == again.signature, "seed %d deterministic data and route" % seed_value)
		_expect(DungeonGenerator.validate(first).is_empty(), "seed %d final layout valid" % seed_value)
		_expect(_reachable(first).size() == first.dungeon_floors.size(), "seed %d independently reachable floors" % seed_value)
	for seed_value in [-2147483648, 2147483647]:
		var maximum := DungeonGenerator.generate(seed_value, 255, 512)
		_expect(DungeonGenerator.validate(maximum).is_empty() and _reachable(maximum).size() == maximum.dungeon_floors.size(), "maximum size/attempts and extreme seed")
		print("DUNGEON MAX seed=%d rooms=%d floors=%d cells=%d hash=%d" % [seed_value, maximum.rooms.size(), maximum.dungeon_floors.size(), maximum.cells.size(), maximum.signature])
	for invalid in [[0, 9, 24], [0, 257, 24], [0, 12, 24], [0, 41, 0], [0, 41, 513], [2147483648, 41, 24]]:
		_expect(DungeonGenerator.generate(invalid[0], invalid[1], invalid[2]).is_empty(), "invalid config rejected: %s" % [invalid])
	var layout := DungeonGenerator.generate(1337, 41, 34)
	_expect(layout.signature != DungeonGenerator.generate(42, 41, 34).signature, "different seed changes dungeon")
	_expect(DungeonGenerator.generate(1337, 41, 1).rooms.size() < layout.rooms.size(), "attempt setting affects accepted room count")
	for mutation in 4:
		var broken := layout.duplicate(true)
		match mutation:
			0: broken.cells[broken.spawn] = BlockRegistry.STONE
			1: broken.rooms.append(broken.rooms[0])
			2: broken.dungeon_floors[Vector2i(1000, 1000)] = BlockRegistry.STONE
			3: broken.dungeon_path[1] = broken.exit + Vector3i.UP
		_expect(not DungeonGenerator.validate(broken).is_empty(), "validator catches mutation %d" % mutation)
	var store := VoxelChunkStore.new()
	store.initialize(layout.seed, layout.size, layout.cells, layout.signature)
	store.generation_options = VoxelWorld._save_options(layout)
	store.set_block(layout.spawn + Vector3i.DOWN, BlockRegistry.COBBLESTONE)
	var encoded := store.encode()
	_expect(store.inspect_save(encoded).ok, "dungeon save round trip")
	var snapshot := VoxelSaveService._snapshot(store)
	_expect(snapshot.inspect_save(encoded).ok, "save worker snapshot preserves dungeon settings")
	snapshot.generation_options = {"mode": "dungeon", "room_attempts": 1}
	_expect(not snapshot.inspect_save(encoded).ok, "same base with different attempts cannot restore")
	snapshot.generation_options = {"mode": "overworld"}
	_expect(not snapshot.inspect_save(encoded).ok, "same base hash cannot bypass mode mismatch")
	var legacy_envelope: Dictionary = JSON.parse_string(snapshot.encode())
	var legacy_payload: Dictionary = JSON.parse_string(legacy_envelope.payload)
	legacy_payload.erase("generation_options")
	var payload_text := JSON.stringify(legacy_payload)
	var legacy := JSON.stringify({"payload": payload_text, "sha256": payload_text.sha256_text()})
	_expect(snapshot.inspect_save(legacy).ok and not store.inspect_save(legacy).ok, "legacy format 2 defaults to overworld only")
	for invalid_attempts in [true, "34", 34.5, 0, 513]:
		var envelope: Dictionary = JSON.parse_string(encoded)
		var payload: Dictionary = JSON.parse_string(envelope.payload)
		payload.generation_options.room_attempts = invalid_attempts
		var text := JSON.stringify(payload)
		_expect(not store.inspect_save(JSON.stringify({"payload": text, "sha256": text.sha256_text()})).ok, "typed dungeon options rejected: %s" % str(invalid_attempts))
	print("DUNGEON MATRIX: 128 seeds plus boundary configurations in %d ms" % (Time.get_ticks_msec() - started))


# Independent flood fill over actual supported two-block-clear cells, not the
# generator's parent links or its own BFS implementation.
func _reachable(layout: Dictionary) -> Dictionary:
	var seen := {}
	var pending: Array[Vector3i] = [layout.spawn]
	while not pending.is_empty():
		var feet := pending.pop_back() as Vector3i
		if seen.has(feet) or not layout.dungeon_floors.has(Vector2i(feet.x, feet.z)): continue
		if layout.cells.has(feet) or layout.cells.has(feet + Vector3i.UP): continue
		var support := BlockRegistry.by_material(int(layout.cells.get(feet + Vector3i.DOWN, -1)))
		if support.is_empty() or not support.solid: continue
		seen[feet] = true
		for direction in [Vector3i.LEFT, Vector3i.RIGHT, Vector3i.FORWARD, Vector3i.BACK]: pending.append(feet + direction)
	return seen


func _runtime() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	player = instance.get_node("Player")
	controls = instance.get_node("GenerationControls")
	await _key(KEY_TAB)
	controls.selected_row = 3
	await _key(KEY_N)
	await _key(KEY_RIGHT)
	_expect(not controls.editing_number and controls.draft_room_attempts == 24, "Overworld room attempts disabled")
	controls.selected_row = 0
	await _key(KEY_RIGHT)
	_expect(controls.draft_mode == "dungeon" and controls.draft_size == 41 and world.layout.get("mode", "overworld") == "overworld", "mode changes draft only")
	controls.selected_row = 3
	await _key(KEY_PAGEUP)
	_expect(controls.draft_room_attempts == 34, "room attempts page step")
	await _key(KEY_N)
	await _key(KEY_5)
	await _key(KEY_1)
	await _key(KEY_3)
	await _key(KEY_ENTER)
	_expect(controls.editing_number and controls.draft_room_attempts == 34, "out of range numeric room count rejected")
	await _key(KEY_BACKSPACE)
	await _key(KEY_2)
	await _key(KEY_ENTER)
	_expect(not controls.editing_number and controls.draft_room_attempts == 512, "numeric edit recovery accepts upper bound")
	controls.draft_room_attempts = 34
	controls.draft_poi = true
	await _key(KEY_G)
	await _wait_generation()
	_expect(world.layout.get("mode") == "dungeon" and world.layout.room_attempts == 34 and world.generation_state == "PASS", "dungeon generation applied and checked")
	_expect(controls.poi_root.get_child_count() == 2, "dungeon has entrance and exit POIs")
	await _capture("dungeon-controls.png")
	await _key(KEY_TAB)
	# Spawn intentionally starts 0.55m above the floor; wait for actual landing,
	# not an arbitrary eight frames shorter than the gravity fall time.
	for unused in 60:
		await physics_frame
		if player.is_on_floor(): break
	_expect(player.is_on_floor() and absf(player.global_position.y - 1.0) < 0.15, "dungeon collision supports spawn within one second")
	await _walk_route(world.layout.dungeon_path)
	# The farthest floor is against a perimeter wall. Look back along the route
	# and down at its sand marker so the capture documents the exit, not a wall.
	player.rotation.y += PI
	player.pitch = deg_to_rad(-48.0)
	player.camera.rotation.x = player.pitch
	await _capture("dungeon-exit.png")
	player.pitch = deg_to_rad(-12.0)
	player.camera.rotation.x = player.pitch
	var return_route: Array = world.layout.dungeon_path.duplicate()
	return_route.reverse()
	await _walk_route(return_route)
	var saved_position := player.global_position
	world.save_path = output_directory.path_join("dungeon-checkpoint.json")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	_expect(world.save_game(player), "dungeon async checkpoint starts")
	await _wait_save()
	var floor_cell: Vector3i = world.layout.spawn + Vector3i.DOWN
	_expect(world.remove_cell_for_inventory(floor_cell, player.inventory), "dungeon mining transaction")
	_expect(world.load_game(player), "dungeon async checkpoint load starts")
	await _wait_save()
	_expect(world.get_cell_item(floor_cell) == BlockRegistry.GRASS and player.global_position.distance_to(saved_position) < 0.2, "dungeon checkpoint restores floor and pose")
	_expect(not world.request_generation(1337, 41, true, "dungeon", 513), "runtime rejects invalid attempts")
	controls.set_open(true)
	controls.draft_size = 11
	controls.draft_room_attempts = 1
	controls.draft_checks = false
	_expect(controls.apply_draft(), "minimum dungeon starts")
	await _wait_generation(false)
	_expect(world.world_size == 11 and world.layout.rooms.size() == 1 and world.generation_state == "READY" and DungeonGenerator.validate(world.layout).is_empty(), "minimum dungeon valid with optional runtime checks off")
	controls.draft_size = 255
	controls.draft_room_attempts = 512
	controls.draft_checks = true
	_expect(controls.apply_draft(), "maximum dungeon starts")
	await _wait_generation()
	_expect(world.world_size == 255 and world.layout.rooms.size() > 1 and world.generation_state == "PASS", "maximum dungeon checked with live mesh")
	await _capture("dungeon-large.png")
	# Show the whole layout with a temporary camera; normal first-person scene remains.
	var overview := Camera3D.new()
	instance.add_child(overview)
	overview.position = Vector3(0, 340, 260)
	overview.look_at(Vector3.ZERO)
	overview.current = true
	controls.set_open(false)
	await _capture("dungeon-overview.png")
	player.camera.current = true
	overview.queue_free()
	controls.set_open(true)
	controls.selected_row = 0
	await _key(KEY_RIGHT)
	_expect(controls.draft_mode == "overworld" and controls.draft_size == 185, "mode switch restores Overworld size default")
	controls.draft_size = 41
	await _key(KEY_G)
	await _wait_generation()
	_expect(world.layout.get("mode", "overworld") == "overworld" and world.layout.signature == 2029358965 and controls.poi_root.get_child_count() == 6, "return to Overworld preserves version 6 baseline and refreshes POIs")
	_expect(not world.chunk_store.inspect_save(FileAccess.get_file_as_string(world.save_path)).ok, "dungeon disk checkpoint rejected by Overworld")


func _walk_route(route: Array) -> void:
	var reached := true
	var frames := 0
	await _key_hold(KEY_W, true)
	for feet: Vector3i in route:
		var target := Vector3(feet) + Vector3(0.5, 0, 0.5)
		var segment_frames := 0
		while Vector2(player.global_position.x - target.x, player.global_position.z - target.z).length() > 0.12 and segment_frames < 90:
			var delta := target - player.global_position
			player.rotation.y = atan2(-delta.x, -delta.z)
			await physics_frame
			segment_frames += 1
			frames += 1
		if segment_frames >= 90:
			reached = false
			break
	await _key_hold(KEY_W, false)
	for unused in 5: await physics_frame
	_expect(reached and player.is_on_floor() and absf(player.global_position.y - 1.0) < 0.15, "actual W input traverses complete entrance/exit route")
	print("DUNGEON WALK reached=%s cells=%d frames=%d position=%s" % [reached, route.size(), frames, player.global_position])


func _wait_generation(checked: bool = true) -> void:
	var deadline := Time.get_ticks_msec() + 45000
	while world.generating and Time.get_ticks_msec() < deadline: await process_frame
	_expect(not world.generating and world.generation_state == ("PASS" if checked else "READY") and world.generation_checks == checked, "bounded generation completes with selected check state")
	print("DUNGEON RUNTIME mode=%s size=%d cells=%d elapsed_ms=%.2f" % [world.layout.get("mode", "overworld"), world.world_size, world.layout.cells.size(), world.generation_elapsed_ms])


func _wait_save() -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while world.save_service.is_busy() and Time.get_ticks_msec() < deadline: await process_frame
	_expect(not world.save_service.is_busy(), "bounded checkpoint operation completes")


func _capture(name: String) -> void:
	if DisplayServer.get_name() == "headless": return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	await RenderingServer.frame_post_draw
	_expect(root.get_texture().get_image().save_png(output_directory.path_join(name)) == OK, "dungeon screenshot saved")


func _key(code: Key) -> void:
	await _key_hold(code, true)
	await _key_hold(code, false)


func _key_hold(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
