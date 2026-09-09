extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	# Exhaust the supported terrain-height envelope before integrating with the
	# full generator. This fixture has no natural shortcuts that could hide a gap.
	# Include both sides of the south-branch routing and span-clamp thresholds.
	for size_value in [41, 43, 109, 111, 173, 175, 185, 255]:
		for height in range(22, 53):
			var cells := {}
			var original := DeterministicWorldGenerator._carve_protected_cave(height, cells)
			var network := CaveNetwork.build(size_value, original.path[-1], cells, original.air)
			_expect(network.errors.is_empty(), "network plan size=%d height=%d: %s" % [size_value, height, network.errors])
			if not network.errors.is_empty(): continue
			var targets: Array = []
			for room: Dictionary in network.rooms: targets.append(room.center)
			var survey := VoxelTraversal.survey(cells, size_value, original.path[0], targets)
			_expect(survey.reachable == 5, "all rooms have supported reversible final-cell routes")
			var floor_ok := true
			for floor_cell: Vector3i in network.floors:
				floor_ok = floor_ok and cells.get(floor_cell, -1) == network.floors[floor_cell] and not original.air.has(floor_cell)
			_expect(floor_ok, "no floor/air overlap after commit")
			var empty := true
			for air_cell: Vector3i in original.air: empty = empty and not cells.has(air_cell)
			_expect(empty, "protected entrance and new rooms remain empty")
	for fixture in [[1337, 41], [-7, 41], [42, 41], [-48, 41], [-2147483648, 41], [2147483647, 41], [1337, 185], [1337, 255]]:
		var layout := DeterministicWorldGenerator.generate(fixture[0], fixture[1])
		_expect(WorldLayoutValidator.validate(layout).is_empty(), "final network survives all decoration %s" % [fixture])
		_expect(_connected_air(layout.protected_cave, layout.cave_entrance), "all protected tunnel/room air connects to entrance")
		_expect(layout.signature == DeterministicWorldGenerator._signature_reference(layout.cells), "independent full-cell golden oracle")
		print("CAVE NETWORK GOLDEN seed=%d size=%d cells=%d hash=%d air=%d rooms=%d" % [fixture[0], fixture[1], layout.cells.size(), layout.signature, layout.protected_cave.size(), layout.cave_network.rooms.size()])
	var broken := DeterministicWorldGenerator.generate(1337, 41)
	# Metadata alone must not make a sealed room pass: mutate the final cells.
	var target: Vector3i = broken.cave_network.rooms[1].center
	broken.cells[target] = BlockRegistry.STONE
	_expect(not WorldLayoutValidator.validate(broken).is_empty(), "filled chamber mutation is rejected")
	_expect(not _connected_air({Vector3i.ZERO: true, Vector3i(1, 1, 0): true}, Vector3i.ZERO), "air graph does not connect diagonal-only pockets")
	broken.cells.erase(target)
	broken.protected_cave[Vector3i(20, 63, 20)] = true
	_expect("protected cave air is not all connected to its entrance" in WorldLayoutValidator.validate(broken), "runtime validator rejects isolated protected metadata")
	broken.protected_cave.erase(Vector3i(20, 63, 20))
	var marked_floor: Vector3i = target + Vector3i.DOWN
	broken.cells[marked_floor] = BlockRegistry.SAND
	_expect("protected cave floor or chamber marker was changed" in WorldLayoutValidator.validate(broken), "floor material mutation is rejected")
	var untouched := {Vector3i.ZERO: BlockRegistry.STONE}
	var protected_air := {Vector3i(16, 23, 0): true}
	var rejected := CaveNetwork.build(11, Vector3i(16, 23, 0), untouched, protected_air)
	_expect(not rejected.errors.is_empty() and untouched == {Vector3i.ZERO: BlockRegistry.STONE} and protected_air.size() == 1, "invalid network plan does not partially mutate its inputs")
	for failure in failures: push_error(failure)
	print("CAVE NETWORK DATA: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _connected_air(air: Dictionary, entrance: Vector3i) -> bool:
	if not air.has(entrance): return false
	var seen := {entrance: true}
	var stack: Array[Vector3i] = [entrance]
	while not stack.is_empty():
		var cell: Vector3i = stack.pop_back()
		for direction: Vector3i in [Vector3i.LEFT, Vector3i.RIGHT, Vector3i.UP, Vector3i.DOWN, Vector3i.FORWARD, Vector3i.BACK]:
			var next := cell + direction
			if air.has(next) and not seen.has(next):
				seen[next] = true
				stack.append(next)
	return seen.size() == air.size()


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
