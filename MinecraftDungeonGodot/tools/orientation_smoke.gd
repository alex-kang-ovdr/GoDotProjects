extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output_directory := "res://Saved/Verification/orientation-dev"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	_test_rotations()
	_test_store()
	_test_masks()
	await _test_runtime()
	for failure in failures: push_error(failure)
	print("ORIENTATION SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _test_rotations() -> void:
	var unique := {}
	for state in BlockOrientation.COUNT:
		var basis := BlockOrientation.rotation(state)
		_expect(basis.determinant() == 1 and basis.transposed() * basis == Basis.IDENTITY, "proper exact rotation %d" % state)
		_expect(basis.y == BlockOrientation.NORMALS[int(state / 4)], "local log axis follows placement face %d" % state)
		unique[str(basis)] = true
		_expect(BlockOrientation.from_hit(BlockOrientation.NORMALS[int(state / 4)], (state % 4) * PI * 0.5) == state, "face/yaw state %d" % state)
		_expect(BlockOrientation.from_hit(BlockOrientation.NORMALS[int(state / 4)], (state % 4 - 4) * PI * 0.5) == state, "negative yaw wraps %d" % state)
	_expect(unique.size() == 24, "all 24 bases unique, including wall quarter turns")
	_expect(BlockOrientation.rotation(0) == Basis.IDENTITY, "generated default is vertical identity")
	_expect(BlockOrientation.from_hit(Vector3.UP, deg_to_rad(44)) == 0 and BlockOrientation.from_hit(Vector3.UP, deg_to_rad(46)) == 1, "quarter-turn boundary is explicit")


func _test_store() -> void:
	var cell := Vector3i(-1, 16, 15)
	var store := VoxelChunkStore.new()
	store.initialize(1337, 41, {cell: BlockRegistry.LOG})
	_expect(store.set_state(cell, 23) and store.edits.is_empty(), "base cell can have state without material edit")
	var encoded := store.encode()
	var result := store.inspect_save(encoded)
	_expect(result.ok and result.block_states == {cell: 23}, "state-only checkpoint validates")
	_expect(store.dirty_chunks.has(Vector3i(-1, 1, 0)) and store.dirty_chunks.has(Vector3i(0, 1, 0)) and store.dirty_chunks.has(Vector3i(-1, 0, 0)), "state-only boundary marks owning and adjacent chunks")
	store.consume_dirty_chunks()
	var serial := store.change_serial
	_expect(store.set_state(cell, 23) and store.change_serial == serial and store.dirty_chunks.is_empty(), "same state is a no-op")
	store.set_block(cell, -1)
	_expect(store.block_states.is_empty(), "removal clears stale orientation")
	_expect(store.decode(encoded).ok and store.get_block(cell) == BlockRegistry.LOG and store.get_state(cell) == 23, "material and state restore together")
	_expect(store.decode(encoded).changed_cells.is_empty(), "identical restore has no dirty cells")
	store.set_state(cell, 2)
	_expect(store.decode(encoded).changed_cells == [cell], "state-only restore rebuilds the changed cell")
	for legacy in [2, 3]:
		var payload := _payload(encoded)
		payload.format_version = legacy
		payload.erase("block_states")
		_expect(store.decode(_envelope(payload)).ok and store.block_states.is_empty(), "legacy format %d clears current state" % legacy)
		store.set_state(cell, 23)
	for bad in [-1, 24, 1.5, "1", null, true]:
		var payload := _payload(encoded)
		payload.block_states[0][3] = bad
		_expect(not store.decode(_envelope(payload)).ok and store.get_state(cell) == 23, "invalid state rejected atomically")
	for bad in [null, {}, [1], [[-1, 16, 15]], [[-1, 16, 15, 1], [-1, 16, 15, 2]], [[0, 0, 0, 1]], [[32768, 16, 15, 1]], [[-1, 1.5, 15, 1]]]:
		var payload := _payload(encoded)
		payload.block_states = bad
		_expect(not store.decode(_envelope(payload)).ok and store.get_state(cell) == 23, "malformed/duplicate/air state rejected atomically")
	var missing := _payload(encoded)
	missing.erase("block_states")
	_expect(not store.inspect_save(_envelope(missing)).ok, "current schema requires block state field")
	store.set_block(cell, BlockRegistry.WATER)
	_expect(not store.set_state(cell, 2) and store.block_states.is_empty(), "fluid has no placement rotation")
	var water := _payload(store.encode())
	water.block_states = [[cell.x, cell.y, cell.z, 1]]
	_expect(not store.inspect_save(_envelope(water)).ok, "saved state on fluid rejected")
	store.initialize(0, 1, {cell: BlockRegistry.LOG})
	_expect(store.get_state(cell) == 0 and store.block_states.is_empty(), "generation reinitialize clears states")
	# Snapshot must own its states while the live player keeps editing.
	store.set_state(cell, 9)
	var snapshot := VoxelSaveService._snapshot(store)
	store.set_state(cell, 18)
	_expect(snapshot.get_state(cell) == 9, "worker snapshot does not alias live state dictionary")


func _test_masks() -> void:
	var store := VoxelChunkStore.new()
	var cell := Vector3i(15, 15, 15)
	store.initialize(0, 41, {cell: BlockRegistry.LOG})
	var masks := VoxelChunkMesher.build_masks(store, Vector3i.ZERO)
	var cache := {}
	var unique_uvs := {}
	for state in 24:
		store.set_state(cell, state)
		VoxelChunkMesher.update_cell_mask(store, cell, masks)
		var data := VoxelChunkMesher.build_cached(store, Vector3i.ZERO, masks, cache)
		var fresh := VoxelChunkMesher.build(store, Vector3i.ZERO, VoxelChunkMesher.build_masks_reference(store, Vector3i.ZERO))
		_expect(data.surfaces == fresh.surfaces and data.collision == fresh.collision, "incremental/cache geometry equals fresh state %d" % state)
		_expect(data.faces == 6 and data.collision.size() == 36, "orientation does not change cube geometry/collision")
		var arrays: Array = data.surfaces[BlockRegistry.LOG]
		var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		unique_uvs[str(uvs)] = true
		var caps := 0
		for index in range(0, uvs.size(), 4):
			var cap := uvs[index].x > 32
			for corner in 4: _expect((uvs[index + corner].x > 32) == cap, "quad never interpolates across texture selector")
			if cap: caps += 1
		_expect(caps == 2, "exactly two log end faces %d" % state)
		var packed := VoxelChunkMesher.build_masks_packed(store, Vector3i.ZERO)
		var same := packed.size() == masks.size()
		for key: int in masks: same = same and packed.has(key) and packed[key].cells == masks[key].cells
		_expect(same, "packed halo preserves orientation %d" % state)
	_expect(unique_uvs.size() == 24, "render UVs distinguish every orientation")
	# Differing rotations must not collapse into the same greedy surface key.
	store.initialize(0, 41, {Vector3i.ZERO: BlockRegistry.LOG, Vector3i.RIGHT: BlockRegistry.LOG})
	var same := VoxelChunkMesher.build(store, Vector3i.ZERO)
	store.set_state(Vector3i.RIGHT, 8)
	var different := VoxelChunkMesher.build(store, Vector3i.ZERO)
	_expect(same.quads == 6 and different.quads == 10 and same.faces == different.faces, "greedy merge splits different rotations without adding hidden faces")
	var original: Array = different.surfaces[BlockRegistry.LOG]
	var corrupted := original.duplicate(true)
	var corrupt_uv: PackedVector2Array = corrupted[Mesh.ARRAY_TEX_UV]
	corrupt_uv[0] += Vector2(0.25, 0)
	corrupted[Mesh.ARRAY_TEX_UV] = corrupt_uv
	_expect(_triangles(original) != _triangles(corrupted), "geometry comparator detects misplaced UVs")
	corrupted = original.duplicate(true)
	var indices: PackedInt32Array = corrupted[Mesh.ARRAY_INDEX]
	var swap := indices[0]
	indices[0] = indices[1]
	indices[1] = swap
	corrupted[Mesh.ARRAY_INDEX] = indices
	_expect(_triangles(original) != _triangles(corrupted), "geometry comparator detects reversed winding")


func _test_runtime() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	player.set_physics_process(false)
	var y: int = Array(world.layout.heights).max() + 8
	var anchor := Vector3i(0, y, 0)
	player.selected_slot = 8
	if DisplayServer.get_name() != "headless":
		for normal: Vector3 in BlockOrientation.NORMALS:
			world.set_cell_item(anchor, BlockRegistry.STONE)
			world.rebuild_dirty()
			var offset := normal * 4.0 + (Vector3.FORWARD * 0.4 if absf(normal.y) > 0.5 else Vector3.UP * 0.2)
			player.position = Vector3(anchor) + Vector3.ONE * 0.5 + offset - Vector3.UP * player.camera.position.y
			var direction := -offset
			player.rotation.y = atan2(-direction.x, -direction.z)
			player.pitch = atan2(direction.y, Vector2(direction.x, direction.z).length())
			player.camera.rotation.x = player.pitch
			for unused in 5: await physics_frame
			var target := world.get_target(player.camera.global_position, -player.camera.global_basis.z)
			_expect(not target.is_empty() and target.normal == normal, "actual ray sees requested placement face")
			var stock := player.inventory.count(8)
			var event := InputEventMouseButton.new()
			event.button_index = MOUSE_BUTTON_RIGHT
			event.pressed = true
			event.position = root.get_visible_rect().size * 0.5
			Input.parse_input_event(event)
			await process_frame
			event = event.duplicate()
			event.pressed = false
			Input.parse_input_event(event)
			for unused in 3: await process_frame
			var placed := anchor + Vector3i(normal)
			_expect(world.get_cell_item(placed) == BlockRegistry.LOG and player.inventory.count(8) == stock - 1, "actual RMB places and consumes one log")
			_expect(world.chunk_store.get_state(placed) == BlockOrientation.from_hit(normal, player.rotation.y), "actual RMB stores hit face and yaw")
			world.set_cell_item(placed, -1)
			world.rebuild_dirty()
	# Native gallery covers all 24 states; no extra resources enter game saves.
	world.set_cell_item(anchor, -1)
	var expected := {}
	for state in 24:
		var cell := Vector3i((state % 4) * 3 - 5, y, int(state / 4) * 3 - 8)
		world.set_cell_item(cell, BlockRegistry.LOG)
		world.chunk_store.set_state(cell, state)
		expected[cell] = state
		world.set_cell_item(cell + Vector3i.DOWN, BlockRegistry.BRICK)
		if DisplayServer.get_name() != "headless":
			var label := Label3D.new()
			label.text = "%02d" % state
			label.font_size = 48
			label.pixel_size = 0.01
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			label.position = Vector3(cell) + Vector3(0.5, 1.5, 0.5)
			instance.add_child(label)
	world.rebuild_dirty()
	var checkpoint := world.chunk_store.encode(player.capture_state())
	for cell: Vector3i in expected: world.chunk_store.set_state(cell, 0)
	world.rebuild_dirty()
	_expect(world.apply_saved_game(checkpoint, player).ok, "gallery checkpoint restores")
	_verify_render_meshes(world, "restored")
	for cell: Vector3i in expected:
		_expect(world.chunk_store.get_state(cell) == expected[cell], "gallery state survives save %s" % cell)
		world.set_cell_item(cell + Vector3i.UP, BlockRegistry.STONE)
	world.rebuild_dirty()
	for cell: Vector3i in expected: world.set_cell_item(cell + Vector3i.UP, -1)
	world.rebuild_dirty()
	for cell: Vector3i in expected: _expect(world.chunk_store.get_state(cell) == expected[cell], "neighbor rebuild preserves orientation")
	_verify_render_meshes(world, "neighbor rebuilt")
	if DisplayServer.get_name() != "headless":
		player.camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		player.camera.size = 23.0
		player.position = Vector3(16, y + 15, 22)
		player.camera.look_at(Vector3(0, y, 0))
		for unused in 5: await process_frame
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
		_expect(root.get_texture().get_image().save_png(output_directory.path_join("orientation-gallery.png")) == OK, "24-state native gallery PNG")
		for state in [0, 8, 16]:
			var cell := Vector3i(-5, y, int(state / 4) * 3 - 8)
			player.camera.size = 3.8
			player.position = Vector3(cell) + Vector3(3.5, 1.8, 4.5)
			player.camera.look_at(Vector3(cell) + Vector3.ONE * 0.5)
			for unused in 3: await process_frame
			await RenderingServer.frame_post_draw
			_expect(root.get_texture().get_image().save_png(output_directory.path_join("orientation-axis-%d.png" % state)) == OK, "axis close-up PNG")
	world.generate_world(42, 41, "dungeon")
	_expect(world.chunk_store.block_states.is_empty(), "world regeneration leaves no stale placement states")
	instance.queue_free()
	await process_frame


func _verify_render_meshes(world: VoxelWorld, label: String) -> void:
	for chunk: Vector3i in world.chunk_nodes:
		var expected := VoxelChunkMesher.build(world.chunk_store, chunk)
		if not expected.surfaces.has(BlockRegistry.LOG): continue
		var mesh: ArrayMesh = world.chunk_nodes[chunk].get_node("Mesh").mesh
		# Godot packs normals on ArrayMesh upload (e.g. axis zero reads ~-1.5e-5).
		# Put the independent fresh geometry through the same encoding boundary.
		var reference := ArrayMesh.new()
		reference.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, expected.surfaces[BlockRegistry.LOG])
		var found := false
		for surface in mesh.get_surface_count():
			if mesh.surface_get_material(surface) == world.materials[BlockRegistry.LOG]:
				found = true
				_expect(_triangles(mesh.surface_get_arrays(surface)) == _triangles(reference.surface_get_arrays(0)), label + " uploaded positions/normals/UVs/winding equal independent rebuild")
		_expect(found, label + " log material surface exists")


func _triangles(arrays: Array) -> Array[String]:
	# Incremental masks retain plane insertion order; fresh masks need not.
	# Compare exact geometric triangles, allowing reorder but never UV relocation,
	# dropped/duplicate faces or winding reversal. Coordinates are integer here.
	var result: Array[String] = []
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	for start in range(0, indices.size(), 3):
		var corners: Array[String] = []
		for offset in 3:
			var index := indices[start + offset]
			corners.append("%s/%s/%s" % [arrays[Mesh.ARRAY_VERTEX][index], arrays[Mesh.ARRAY_NORMAL][index], arrays[Mesh.ARRAY_TEX_UV][index]])
		var rotations: Array[String] = []
		for offset in 3: rotations.append(corners[offset] + "|" + corners[(offset + 1) % 3] + "|" + corners[(offset + 2) % 3])
		rotations.sort()
		result.append(rotations[0])
	result.sort()
	return result


func _payload(encoded: String) -> Dictionary:
	return JSON.parse_string(JSON.parse_string(encoded).payload)


func _envelope(payload: Dictionary) -> String:
	var encoded := JSON.stringify(payload, "", true, true)
	return JSON.stringify({"payload": encoded, "sha256": encoded.sha256_text()})


func _expect(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		failures.append(label)
		print("ORIENTATION FAIL: " + label)
