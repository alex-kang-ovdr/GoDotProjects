extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 50908
	var cells := {}
	for x in range(-2, 18):
		for y in range(-1, 5):
			for z in range(-2, 18):
				var material := rng.randi_range(-1, BlockRegistry.MATERIAL_COUNT - 1)
				if material != -1: cells[Vector3i(x, y, z)] = material
	var store := VoxelChunkStore.new()
	store.initialize(1337, 41, cells)
	var masks := {}
	var caches := {}
	for chunk: Vector3i in store.chunks:
		masks[chunk] = VoxelChunkMesher.build_masks(store, chunk)
		caches[chunk] = {}
		var cold := VoxelChunkMesher.build_cached(store, chunk, masks[chunk], caches[chunk])
		_expect(cold.planes_built == masks[chunk].size() and cold.planes_reused == 0, "cold cache %s" % chunk)
		_check(store, chunk, masks[chunk], caches[chunk])
		var warm := VoxelChunkMesher.build_cached(store, chunk, masks[chunk], caches[chunk])
		_expect(warm.planes_built == 0 and warm.planes_reused == masks[chunk].size(), "unchanged cache %s" % chunk)
	# Incremental updates at negative, positive, and chunk-boundary coordinates,
	# including transparent water/leaves and newly exposed interior faces.
	for iteration in 128:
		var cell := Vector3i(rng.randi_range(-2, 17), rng.randi_range(-1, 4), rng.randi_range(-2, 17))
		store.set_block(cell, rng.randi_range(-1, BlockRegistry.MATERIAL_COUNT - 1))
		var affected := [cell]
		for direction: Vector3i in VoxelChunkMesher.DIRECTIONS: affected.append(cell + direction)
		var chunks := {}
		for changed: Vector3i in affected:
			var chunk := DeterministicWorldGenerator.world_to_chunk(changed)
			if not masks.has(chunk):
				masks[chunk] = VoxelChunkMesher.build_masks(store, chunk)
				caches[chunk] = {}
			VoxelChunkMesher.update_cell_mask(store, changed, masks[chunk])
			chunks[chunk] = true
		for chunk: Vector3i in chunks: _check(store, chunk, masks[chunk], caches[chunk])
	# Replacing the source with equal revision but different geometry must miss.
	var isolated := Vector3i(1, 1, 1)
	store.initialize(1, 41, {isolated: BlockRegistry.STONE})
	var single := VoxelChunkMesher.build_masks(store, Vector3i.ZERO)
	var cache := {}
	_check(store, Vector3i.ZERO, single, cache)
	for plane: int in single:
		var replacement := VoxelChunkMesher.PlaneMask.new()
		replacement.revision = single[plane].revision
		single[plane] = replacement
	var replaced := VoxelChunkMesher.build_cached(store, Vector3i.ZERO, single, cache)
	_expect(replaced.planes_built == 6 and replaced.surfaces.is_empty() and replaced.collision.is_empty(), "mask identity invalidation")
	VoxelChunkMesher.build_cached(store, Vector3i.ZERO, {}, cache)
	_expect(cache.is_empty(), "removed planes retire cached geometry")
	single = VoxelChunkMesher.build_masks(store, Vector3i.ZERO)
	_check(store, Vector3i.ZERO, single, cache)
	var disposable := VoxelChunkMesher.build_cached(store, Vector3i.ZERO, single, cache)
	disposable.surfaces[BlockRegistry.STONE][Mesh.ARRAY_VERTEX][0] = Vector3(999, 999, 999)
	disposable.collision[0] = Vector3(999, 999, 999)
	var intact := VoxelChunkMesher.build_cached(store, Vector3i.ZERO, single, cache)
	var reference := VoxelChunkMesher.build(store, Vector3i.ZERO, single)
	_expect(intact.surfaces == reference.surfaces and intact.collision == reference.collision, "returned geometry cannot corrupt immutable plane cache")
	VoxelChunkMesher.update_cell_mask(store, isolated, single)
	_expect(VoxelChunkMesher.build_cached(store, Vector3i.ZERO, single, cache).planes_built == 0, "same material update preserves revisions")
	await _test_renderer_lifetime()
	for failure in failures: push_error(failure)
	print("PLANE CACHE SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _check(store: VoxelChunkStore, chunk: Vector3i, masks: Dictionary, cache: Dictionary) -> void:
	var actual := VoxelChunkMesher.build_cached(store, chunk, masks, cache)
	var expected := VoxelChunkMesher.build(store, chunk, masks)
	_expect(actual.faces == expected.faces and actual.quads == expected.quads, "counts %s" % chunk)
	_expect(actual.collision == expected.collision, "ordered collision triangles %s" % chunk)
	_expect(actual.surfaces == expected.surfaces, "exact ordered vertices/normals/UVs/indices/materials %s" % chunk)
	# The independent full-store mask rebuild also catches stale incremental masks.
	var fresh := VoxelChunkMesher.build_masks_reference(store, chunk)
	var same := true
	for plane: int in masks:
		if fresh.has(plane):
			same = same and masks[plane].cells == fresh[plane].cells
		else:
			for value: int in masks[plane].cells: same = same and value == 0
	for plane: int in fresh: same = same and masks.has(plane)
	_expect(same, "fresh reference mask %s" % chunk)


func _test_renderer_lifetime() -> void:
	var renderer := VoxelChunkRenderer.new()
	for unused in BlockRegistry.MATERIAL_COUNT: renderer.materials.append(StandardMaterial3D.new())
	root.add_child(renderer)
	var cell := Vector3i(-1, 1, 1)
	var chunk := Vector3i.LEFT
	renderer.chunk_store.initialize(1, 41, {cell: BlockRegistry.STONE})
	renderer.rebuild_all()
	_expect(renderer.plane_geometry.has(chunk), "renderer cold cache")
	renderer.set_cell_item(cell, -1)
	renderer.rebuild_dirty()
	_expect(renderer.plane_geometry.is_empty() and renderer.chunk_nodes.is_empty(), "empty chunk retires cache and body")
	renderer.set_cell_item(cell, BlockRegistry.WATER)
	renderer.rebuild_dirty()
	_expect(renderer.plane_geometry.has(chunk) and renderer.chunk_nodes[chunk].get_node("Collision").shape == null, "recreated water has no stale solid collision")
	renderer.rebuild_all()
	_expect(renderer.build_timings.planes_reused == 0, "full rebuild invalidates all planes")
	renderer.clear()
	_expect(renderer.plane_geometry.is_empty() and renderer.face_masks.is_empty(), "world clear releases masks and geometry")
	renderer.queue_free()
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
