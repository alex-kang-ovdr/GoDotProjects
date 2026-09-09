extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	_test_geometry()
	await _test_dirty_collision()
	await _test_cache_edits()
	print("MESHING SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	for failure in failures:
		push_error(failure)
	quit(0 if failures.is_empty() else 1)


func _test_geometry() -> void:
	var store := VoxelChunkStore.new()
	var cells := {}
	for x in 3:
		for y in 3:
			for z in 3:
				cells[Vector3i(x, y, z)] = BlockRegistry.STONE
	store.initialize(1, 41, cells)
	var cube := VoxelChunkMesher.build(store, Vector3i.ZERO)
	_expect(cube.faces == 54, "solid 3-cube shell has exactly 54 visible faces")
	_expect(cube.collision.size() == 6 * 6 and cube.quads == 6, "uniform cube merges to six visual/collision rectangles")
	var mesh_arrays: Array = cube.surfaces[BlockRegistry.STONE]
	var vertices: PackedVector3Array = mesh_arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = mesh_arrays[Mesh.ARRAY_NORMAL]
	var indices: PackedInt32Array = mesh_arrays[Mesh.ARRAY_INDEX]
	var winding_valid := true
	for triangle in range(0, indices.size(), 3):
		var a := indices[triangle]
		var b := indices[triangle + 1]
		var c := indices[triangle + 2]
		if (vertices[b] - vertices[a]).cross(vertices[c] - vertices[a]).dot(normals[a]) >= 0.0:
			winding_valid = false
	_expect(winding_valid, "all six face directions use Godot clockwise winding")
	store.initialize(1, 41, {Vector3i(-1, 1, 1): 0, Vector3i(0, 1, 1): 0})
	_expect(VoxelChunkMesher.build(store, Vector3i.LEFT).faces == 5, "negative chunk culls shared border face")
	_expect(VoxelChunkMesher.build(store, Vector3i.ZERO).faces == 5, "positive chunk culls shared border face")
	store.set_block(Vector3i(-1, 1, 1), -1)
	_expect(VoxelChunkMesher.build(store, Vector3i.ZERO).faces == 6, "neighbor removal exposes the correct border face")
	_expect(not store.chunks.has(Vector3i.LEFT), "last removal erases empty chunk index")
	store.initialize(1, 41, {Vector3i(1, 1, 1): BlockRegistry.WATER})
	var water := VoxelChunkMesher.build(store, Vector3i.ZERO)
	_expect(water.faces == 6 and water.collision.is_empty(), "water renders but has no collision")
	store.initialize(1, 41, {Vector3i(1, 1, 1): BlockRegistry.STONE, Vector3i(2, 1, 1): BlockRegistry.LEAVES})
	var leaves := VoxelChunkMesher.build(store, Vector3i.ZERO)
	_expect(leaves.faces == 11, "opaque face remains visible behind transparent leaf neighbor")
	_expect(leaves.collision.size() == 10 * 6, "solid leaves share a collision boundary with stone")
	var checkpoint := store.encode()
	store.set_block(Vector3i(17, 1, 1), 0)
	store.decode(checkpoint)
	_expect(not store.chunks.has(Vector3i.RIGHT), "loading checkpoint removes reverted chunk members")


func _test_dirty_collision() -> void:
	var renderer := VoxelChunkRenderer.new()
	for unused in BlockRegistry.MATERIAL_COUNT:
		renderer.materials.append(StandardMaterial3D.new())
	root.add_child(renderer)
	renderer.set_process(false)
	var left := Vector3i(15, 1, 1)
	var right := Vector3i(16, 1, 1)
	var remote := Vector3i(40, 1, 1)
	renderer.chunk_store.initialize(1, 41, {left: 0, right: 0, remote: 0})
	renderer.rebuild_all()
	_expect(renderer.visible_face_count() == 16, "renderer shows 10 joined and six isolated faces")
	var distant_node: StaticBody3D = renderer.chunk_nodes[Vector3i(2, 0, 0)]
	var revision := int(distant_node.get_meta("revision"))
	renderer.set_cell_item(left, -1)
	var dirty := renderer.rebuild_dirty()
	_expect(dirty.count == 2, "boundary edit rebuilds exactly two affected chunks")
	_expect(int(distant_node.get_meta("revision")) == revision, "unaffected chunk mesh revision is preserved")
	_expect(renderer.visible_face_count() == 12, "renderer exposes neighbor face after removal")
	_expect(renderer.rebuild_dirty().count == 0, "clean frame does no rebuild work")
	for unused in 3:
		await physics_frame
	var query := PhysicsRayQueryParameters3D.create(Vector3(16.5, 4, 1.5), Vector3(16.5, 0, 1.5))
	var hit := root.world_3d.direct_space_state.intersect_ray(query)
	_expect(not hit.is_empty() and is_equal_approx(hit.position.y, 2.0), "rebuilt chunk has correctly oriented top collision")
	renderer.set_cell_item(right, -1)
	renderer.rebuild_dirty()
	for unused in 3:
		await physics_frame
	_expect(root.world_3d.direct_space_state.intersect_ray(query).is_empty(), "removing last block removes stale collision")
	renderer.queue_free()
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)


func _test_cache_edits() -> void:
	var renderer := VoxelChunkRenderer.new()
	for unused in BlockRegistry.MATERIAL_COUNT:
		renderer.materials.append(StandardMaterial3D.new())
	root.add_child(renderer)
	renderer.set_process(false)
	var cells := {}
	for x in range(-2, 19):
		for z in range(-2, 19):
			cells[Vector3i(x, 1, z)] = BlockRegistry.STONE
	renderer.chunk_store.initialize(42, 41, cells)
	renderer.rebuild_all()
	var rng := RandomNumberGenerator.new()
	rng.seed = 917
	for iteration in 96:
		var cell := Vector3i(rng.randi_range(-2, 18), rng.randi_range(1, 3), rng.randi_range(-2, 18))
		var value := rng.randi_range(-1, BlockRegistry.MATERIAL_COUNT - 1)
		renderer.set_cell_item(cell, value)
		var updated := renderer.rebuild_dirty()
		for chunk: Vector3i in updated.chunks:
			if not renderer.face_masks.has(chunk):
				continue
			var full := VoxelChunkMesher.build(renderer.chunk_store, chunk)
			var cached := VoxelChunkMesher.build(renderer.chunk_store, chunk, renderer.face_masks[chunk])
			_expect(_face_cells(full) == _face_cells(cached), "incremental masks match full rebuild after edit %d in %s" % [iteration, chunk])
			_expect(full.collision.size() == cached.collision.size(), "incremental collision matches full rebuild after edit %d" % iteration)
			var expected := _expected_faces(renderer.chunk_store, chunk)
			_expect(_face_cells(cached) == expected.visual, "greedy quads cover exactly the brute-force visible cells after edit %d" % iteration)
			_expect(_collision_faces(cached.collision) == expected.collision, "greedy collision covers exactly the solid boundary after edit %d" % iteration)
	renderer.queue_free()
	await process_frame


# Expand each merged quad back to unit face IDs, ignoring rectangle/order choices.
func _face_cells(data: Dictionary) -> Dictionary:
	var result := {}
	for material_id: int in data.surfaces:
		var arrays: Array = data.surfaces[material_id]
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		for first in range(0, vertices.size(), 4):
			var minimum := vertices[first]
			var maximum := minimum
			for offset in range(1, 4):
				minimum = minimum.min(vertices[first + offset])
				maximum = maximum.max(vertices[first + offset])
			var normal := Vector3i(normals[first])
			var face := VoxelChunkMesher.DIRECTIONS.find(normal)
			var axis: int = VoxelChunkMesher.NORMAL_AXIS[face]
			var u: int = VoxelChunkMesher.U_AXIS[face]
			var v: int = VoxelChunkMesher.V_AXIS[face]
			for column in range(roundi(minimum[u]), roundi(maximum[u])):
				for row in range(roundi(minimum[v]), roundi(maximum[v])):
					var cell := Vector3i.ZERO
					cell[axis] = roundi(minimum[axis]) - (1 if normal[axis] > 0 else 0)
					cell[u] = column
					cell[v] = row
					result[Vector4i(cell.x, cell.y, cell.z, face)] = material_id
	return result


func _expected_faces(store: VoxelChunkStore, chunk: Vector3i) -> Dictionary:
	var visual := {}
	var collision := {}
	var members: Dictionary = store.chunks.get(chunk, {})
	for cell: Vector3i in members:
		var material_id := int(members[cell])
		var local := cell - chunk * 16
		for face in 6:
			var neighbor := store.get_block(cell + VoxelChunkMesher.DIRECTIONS[face])
			var key := Vector4i(local.x, local.y, local.z, face)
			if neighbor == -1 or (BlockRegistry.DEFINITIONS[neighbor].transparent and neighbor != material_id):
				visual[key] = material_id
			if BlockRegistry.DEFINITIONS[material_id].solid and (neighbor == -1 or not BlockRegistry.DEFINITIONS[neighbor].solid):
				collision[key] = 0
	return {"visual": visual, "collision": collision}


func _collision_faces(triangles: PackedVector3Array) -> Dictionary:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	for first in range(0, triangles.size(), 6):
		var normal := -(triangles[first + 1] - triangles[first]).cross(triangles[first + 2] - triangles[first]).normalized()
		for offset in [0, 1, 2, 4]:
			vertices.append(triangles[first + offset])
			normals.append(normal)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	return _face_cells({"surfaces": {0: arrays}})
