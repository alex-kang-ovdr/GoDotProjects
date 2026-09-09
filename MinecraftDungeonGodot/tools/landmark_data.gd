extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	for fixture in [[1337, 41], [-48, 41], [-7, 41], [42, 41], [-2147483648, 41], [2147483647, 41], [1337, 185], [1337, 255]]:
		var layout := DeterministicWorldGenerator.generate(fixture[0], fixture[1])
		var reached := _independent_reachable(layout.cells, layout.spawn)
		var reached_count := 0
		_expect(WorldLayoutValidator.validate(layout).is_empty(), "final world validation %s" % [fixture])
		for structure: Dictionary in layout.structures:
			if reached.has(structure.door): reached_count += 1
			_expect(reached.has(structure.door), "independent solid-surface graph reaches %s landmark %d" % [fixture, structure.biome])
			var intact := true
			for dz in range(-2, 3):
				for dx in range(-2, 3):
					var roof: Vector3i = structure.anchor + Vector3i(dx, 2, dz)
					intact = intact and int(layout.cells.get(roof, -1)) == structure.material
			_expect(intact, "repair preserves complete landmark roof")
		_expect(layout.signature == DeterministicWorldGenerator._signature_reference(layout.cells), "independent reference hash after generation change")
		print("LANDMARK DATA seed=%d size=%d before=%d/6 after=%d/6 repairs=%d nodes=%d cells=%d hash=%d routes_ms=%.3f" % [fixture[0], fixture[1], layout.landmark_routes.before_reachable, reached_count, layout.landmark_routes.repaired.size(), reached.size(), layout.cells.size(), layout.signature, layout.timings.routes_us / 1000.0])
	# An open supported door beyond a four-block wall is locally valid but unreachable.
	var cells := {}
	for z in range(-3, 4):
		for x in range(-3, 4): cells[Vector3i(x, 0, z)] = BlockRegistry.STONE
	for z in range(-3, 4):
		for y in range(1, 5): cells[Vector3i(0, y, z)] = BlockRegistry.STONE
	var start := Vector3i(-2, 1, 0)
	var door := Vector3i(2, 1, 0)
	_expect(VoxelTraversal.walkable(cells, door), "isolated door alone is valid")
	_expect(VoxelTraversal.survey(cells, 7, start, [door]).reachable == 0 and not _independent_reachable(cells, start).has(door), "both graph algorithms detect separated components")
	for y in range(1, 5): cells.erase(Vector3i(0, y, 0))
	_expect(VoxelTraversal.survey(cells, 7, start, [door]).reachable == 1 and _independent_reachable(cells, start).has(door), "opening real corridor restores connectivity")
	var diagonal := {Vector3i.ZERO: BlockRegistry.STONE, Vector3i(1, 0, 1): BlockRegistry.STONE}
	_expect(VoxelTraversal.survey(diagonal, 3, Vector3i.UP, [Vector3i(1, 1, 1)]).reachable == 0, "diagonal contact is not a walking corridor")
	var golden := DeterministicWorldGenerator.generate(1337, 41)
	_expect(golden.signature == DeterministicWorldGenerator.generate(1337, 41).signature, "road tie-breaking is repeatable")
	for structure: Dictionary in golden.structures: golden.cells[structure.door] = BlockRegistry.STONE
	_expect("landmarks or cave rooms are not all reachable from spawn" in WorldLayoutValidator.validate(golden), "final-cell validator detects sealed routes regardless of stored path metadata")
	for failure in failures: push_error(failure)
	print("LANDMARK DATA: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


# Unlike the runtime BFS, enumerate every supported solid surface first, then
# DFS its graph. Neither the repair paths nor generation's survey are the oracle.
func _independent_reachable(cells: Dictionary, spawn: Vector3i) -> Dictionary:
	var nodes := {}
	for support: Vector3i in cells:
		if not BlockRegistry.by_material(cells[support]).solid: continue
		var feet := support + Vector3i.UP
		if not cells.has(feet) and not cells.has(feet + Vector3i.UP): nodes[feet] = true
	var reached := {}
	var stack: Array[Vector3i] = []
	if nodes.has(spawn):
		stack.append(spawn)
		reached[spawn] = true
	while not stack.is_empty():
		var feet: Vector3i = stack.pop_back()
		for offset in [Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
			for elevation in range(feet.y - 1, feet.y + 2):
				var next := Vector3i(feet.x + offset.x, elevation, feet.z + offset.y)
				if not nodes.has(next) or reached.has(next): continue
				if elevation < feet.y and cells.has(next + Vector3i(0, 2, 0)): continue
				if elevation > feet.y and cells.has(feet + Vector3i(0, 2, 0)): continue
				reached[next] = true
				stack.append(next)
	return reached


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
