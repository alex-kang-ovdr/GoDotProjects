extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260908
	_expect(DeterministicWorldGenerator.signature({}) == DeterministicWorldGenerator._signature_reference({}), "empty hash")
	for iteration in 128:
		var cells := {}
		for unused in 128:
			var cell := Vector3i(rng.randi_range(-32768, 32767), rng.randi_range(-32768, 32767), rng.randi_range(-32768, 32767))
			cells[cell] = rng.randi_range(0, 11)
		_expect(DeterministicWorldGenerator.signature(cells) == DeterministicWorldGenerator._signature_reference(cells), "random ordered hash %d" % iteration)
	var edge_cells := {}
	for axis in 3:
		for boundary in [-2147483648, -32769, -32768, 32767, 32768, 2147483647]:
			var cell := Vector3i.ZERO
			cell[axis] = boundary
			edge_cells[cell] = BlockRegistry.STONE
			var expected_chunk := Vector3i(floori(float(cell.x) / 16.0), floori(float(cell.y) / 16.0), floori(float(cell.z) / 16.0))
			_expect(DeterministicWorldGenerator.world_to_chunk(cell) == expected_chunk, "signed chunk division %s" % cell)
	_expect(DeterministicWorldGenerator.signature(edge_cells) == DeterministicWorldGenerator._signature_reference(edge_cells), "full Vector3i range fallback")
	var reordered := {}
	var reverse_keys := edge_cells.keys()
	reverse_keys.reverse()
	for cell: Vector3i in reverse_keys: reordered[cell] = edge_cells[cell]
	_expect(DeterministicWorldGenerator.signature(reordered) == DeterministicWorldGenerator.signature(edge_cells), "insertion order independent")
	var layout := DeterministicWorldGenerator.generate(1337, 41)
	_expect(layout.generation_version == 6 and layout.signature == 2029358965, "version 6 reviewed golden world hash")
	var mixed := {}
	for x in range(-17, 18):
		for y in range(-1, 18):
			for z in range(-17, 18):
				var material_id := rng.randi_range(-1, 11)
				if material_id != -1: mixed[Vector3i(x, y, z)] = material_id
	var store := VoxelChunkStore.new()
	store.initialize(1337, 41, mixed)
	var checkpoint := store.edits.duplicate()
	for phase in 4:
		if phase > 0:
			for unused in 512:
				store.set_block(Vector3i(rng.randi_range(-17, 17), rng.randi_range(-1, 17), rng.randi_range(-17, 17)), rng.randi_range(-1, 11))
		if phase == 3: store.apply_edits(checkpoint)
		for chunk: Vector3i in store.chunks:
			var actual := VoxelChunkMesher.build_masks(store, chunk)
			var expected := VoxelChunkMesher.build_masks_reference(store, chunk)
			_expect(_same_masks(actual, expected), "adaptive mask equivalence phase=%d chunk=%s" % [phase, chunk])
			_expect(_same_masks(VoxelChunkMesher.build_masks_packed(store, chunk), expected), "packed mask equivalence phase=%d chunk=%s" % [phase, chunk])
	for failure in failures: push_error(failure)
	print("OPTIMIZATION EQUIVALENCE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)


func _same_masks(actual: Dictionary, expected: Dictionary) -> bool:
	if actual.size() != expected.size(): return false
	for plane: int in expected:
		if not actual.has(plane) or actual[plane].cells != expected[plane].cells: return false
	return true
