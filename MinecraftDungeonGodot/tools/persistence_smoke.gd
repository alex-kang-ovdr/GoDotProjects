extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	player.set_physics_process(false)
	await physics_frame
	var before_edits: Dictionary = world.chunk_store.edits.duplicate()
	var initial_player := player.capture_state()
	var initial_save := world.chunk_store.encode(initial_player)
	var test_height: int = Array(world.layout.heights).max() + 6
	var added_cell := Vector3i(12, test_height, 12)
	_expect(world.place_from_inventory(added_cell, 0, player.inventory, player.global_position), "place a block after checkpoint")
	var original_cell: Vector3i = world.layout.spawn + Vector3i.DOWN
	_expect(world.remove_cell_for_inventory(original_cell, player.inventory), "mine a block after checkpoint")
	# A checkpoint must restore BOTH additions and removals that occurred after it.
	var saved_edits: Dictionary = world.chunk_store.edits.duplicate()
	var loaded := world.apply_saved_game(initial_save, player)
	_expect(loaded.ok, "valid checkpoint accepted")
	_expect(world.get_cell_item(added_cell) == -1, "post-save placement removed from GridMap")
	_expect(world.get_cell_item(original_cell) == int(world.layout.cells[original_cell]), "post-save mining restored in GridMap")
	_expect(world.chunk_store.edits == before_edits, "journal returns to checkpoint")
	_expect(_same_player(player.capture_state(), initial_player), "inventory and pose return to checkpoint within floating-point tolerance")
	_expect(int(loaded.get("changed_cells", -1)) == saved_edits.size(), "only changed cells are applied")
	var repeat := world.apply_saved_game(initial_save, player)
	_expect(int(repeat.get("changed_cells", -1)) == 0, "reloading identical save does not rebuild cells")
	for corruption in ["inventory", "position", "selected_slot", "yaw", "pitch"]:
		var state_before_rejection := player.capture_state()
		var payload: Dictionary = JSON.parse_string(JSON.parse_string(initial_save).payload)
		payload.edits = [[12, test_height, 12, BlockRegistry.SAND]]
		match corruption:
			"inventory": payload.player.inventory.slots[0][1] = 65
			"position": payload.player.position[0] = "invalid"
			"selected_slot": payload.player.selected_slot = 1.25
			"yaw": payload.player.yaw = {}
			"pitch": payload.player.pitch = 3.0
		var result := world.apply_saved_game(_seal(payload), player)
		_expect(not result.ok, "reject invalid player %s" % corruption)
		_expect(world.chunk_store.edits == before_edits, "invalid player leaves journal untouched: %s" % corruption)
		_expect(world.get_cell_item(added_cell) == -1, "invalid player leaves rendered world untouched: %s" % corruption)
		_expect(player.capture_state() == state_before_rejection, "invalid player leaves inventory and pose untouched: %s" % corruption)
	await _test_async_disk(world, player)
	_test_schema(world.chunk_store, initial_save)
	print("PERSISTENCE SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	for failure in failures:
		push_error(failure)
	quit(0 if failures.is_empty() else 1)


func _seal(payload: Dictionary) -> String:
	var encoded := JSON.stringify(payload)
	return JSON.stringify({"payload": encoded, "sha256": encoded.sha256_text()})


func _test_schema(store: VoxelChunkStore, encoded: String) -> void:
	var original_edits := store.edits.duplicate()
	var original_dirty := store.dirty_chunks.duplicate()
	var baseline: Dictionary = JSON.parse_string(JSON.parse_string(encoded).payload)
	var cases: Array[Dictionary] = []
	for field in ["format_version", "generation_version", "seed", "world_size", "base_signature"]:
		var invalid := baseline.duplicate(true)
		invalid[field] = float(invalid[field]) + 0.5
		cases.append(invalid)
	for row in [[1.5, 0, 0, 0], ["1", 0, 0, 0], [40000, 0, 0, 0], [0, 0, 0, 1.5], [0, 0, 0, 12]]:
		var invalid := baseline.duplicate(true)
		invalid.edits = [row]
		cases.append(invalid)
	var duplicate := baseline.duplicate(true)
	duplicate.edits = [[1, 2, 3, 0], [1, 2, 3, 1]]
	cases.append(duplicate)
	for invalid in cases:
		_expect(not store.decode(_seal(invalid)).ok, "well-checksummed but invalid schema rejected")
		_expect(store.edits == original_edits and store.dirty_chunks == original_dirty, "rejection has no journal or dirty side effects")


func _test_async_disk(world: VoxelWorld, player: VoxelPlayer) -> void:
	var evidence := "res://Saved/Verification/persistence-%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(evidence))
	world.save_path = evidence.path_join("checkpoint.json")
	var checkpoint := player.capture_state()
	_expect(world.save_game(player), "background save starts")
	_expect(not world.save_game(player), "duplicate save rejected while busy")
	var test_height: int = Array(world.layout.heights).max() + 6
	var post_checkpoint := Vector3i(10, test_height, 10)
	_expect(world.place_from_inventory(post_checkpoint, 0, player.inventory, player.global_position), "editing can continue while snapshot saves")
	await _wait_service(world.save_service)
	var first_bytes := VoxelChunkStore.read_encoded_file(world.save_path)
	_expect(first_bytes.ok, "background save exists on disk")
	if not first_bytes.ok:
		return
	var first_snapshot := world.chunk_store.inspect_save(first_bytes.encoded)
	_expect(first_snapshot.ok and first_snapshot.edits.is_empty(), "disk save is the snapshot before subsequent editing")
	_expect(world.load_game(player), "background load starts")
	_expect(not world.place_from_inventory(Vector3i(9, test_height, 9), 0, player.inventory, player.global_position), "load locks gameplay edits")
	await _wait_service(world.save_service)
	_expect(not world.loading, "load releases input lock")
	_expect(world.get_cell_item(post_checkpoint) == -1, "background load reverts post-checkpoint cell")
	_expect(_same_player(player.capture_state(), checkpoint), "background load restores checkpoint inventory and pose")
	# Exercise 1,000 disk edits rather than just an in-memory JSON round trip.
	for index in 1000:
		var cell := Vector3i(index % 40 - 20, test_height + int(index / 40), -10)
		world.chunk_store.set_block(cell, index % 9)
		world.set_cell_item(cell, index % 9)
	_expect(world.save_game(player), "second background checkpoint starts")
	await _wait_service(world.save_service)
	var disk := VoxelChunkStore.read_encoded_file(world.save_path)
	_expect(disk.ok and world.chunk_store.inspect_save(disk.encoded).edits.size() == 1000, "1,000 edits persist to disk")
	var backup := VoxelChunkStore.read_encoded_file(world.save_path + ".bak")
	_expect(backup.ok and backup.encoded == first_bytes.encoded, "previous checkpoint preserved byte-for-byte as backup")
	_expect(not FileAccess.file_exists(world.save_path + ".pending"), "successful replacement consumes staged file")
	# Restore those edits in a freshly created world and player (restart semantics).
	var restarted := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(restarted)
	var restored_world := restarted.get_node("VoxelWorld") as VoxelWorld
	var restored_player := restarted.get_node("Player") as VoxelPlayer
	restored_player.set_physics_process(false)
	restored_world.save_path = world.save_path
	_expect(restored_world.load_game(restored_player), "fresh scene loads persisted checkpoint")
	await _wait_service(restored_world.save_service)
	_expect(restored_world.chunk_store.edits == world.chunk_store.edits, "fresh scene restores all 1,000 edits")
	var render_matches := true
	for cell: Vector3i in world.chunk_store.edits:
		if restored_world.get_cell_item(cell) != int(world.chunk_store.edits[cell]):
			render_matches = false
	_expect(render_matches, "fresh scene GridMap matches all persisted cells")
	# A failed write has no effect on the previous checkpoint.
	var invalid_state := player.capture_state()
	invalid_state.inventory.slots[0][1] = 65
	_expect(not world.chunk_store.save_to_file(world.save_path, invalid_state).is_empty(), "invalid save rejected before disk replacement")
	_expect(VoxelChunkStore.read_encoded_file(world.save_path).encoded == disk.encoded, "failed save leaves previous checkpoint intact")
	print("PERSISTENCE DISK EVIDENCE: %s; metrics=%s" % [ProjectSettings.globalize_path(evidence), JSON.stringify(world.save_service.last_metrics)])
	restarted.queue_free()
	await process_frame


func _wait_service(service: VoxelSaveService) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while service.is_busy() and Time.get_ticks_msec() < deadline:
		await process_frame
	_expect(not service.is_busy(), "background operation finishes within timeout")


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)


func _same_player(actual: Dictionary, expected: Dictionary) -> bool:
	if actual.crouched != expected.crouched:
		return false
	if actual.total_mined != expected.total_mined or actual.total_placed != expected.total_placed:
		return false
	if actual.inventory != expected.inventory or actual.selected_slot != expected.selected_slot:
		return false
	for axis in 3:
		if not is_equal_approx(actual.position[axis], expected.position[axis]):
			return false
	return is_equal_approx(actual.yaw, expected.yaw) and is_equal_approx(actual.pitch, expected.pitch)
