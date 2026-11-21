class_name LandmarkRoutes
extends RefCounted


# Deterministic cost-guided voxel road repairs. Protected terrain is immutable;
# existing successful routes are reserved before adding any new road.
static func build(cells: Dictionary, size: int, terrain: PackedInt32Array, spawn: Vector3i, structures: Array[Dictionary], cave_air: Dictionary, springs: Dictionary) -> Dictionary:
	var targets: Array = []
	for structure: Dictionary in structures: targets.append(structure.door)
	var survey := VoxelTraversal.survey(cells, size, spawn, targets)
	var before_reachable: int = survey.reachable
	var fixed := cave_air.duplicate()
	for cell: Vector3i in cave_air:
		if cells.has(cell + Vector3i.DOWN): fixed[cell + Vector3i.DOWN] = true
	for cell: Vector3i in springs:
		fixed[cell] = true
		fixed[cell + Vector3i.DOWN] = true
		for y in range(cell.y + 1, 64): fixed[Vector3i(cell.x, y, cell.z)] = true
	for structure: Dictionary in structures:
		for dz in range(-2, 3):
			for dx in range(-2, 3):
				for y in 64:
					fixed[Vector3i(structure.anchor.x + dx, y, structure.anchor.z + dz)] = true
		for distance in range(1, 3):
			_reserve([structure.door + Vector3i.FORWARD * distance], fixed, 3)
	for existing_path: Array in survey.paths: _reserve(existing_path, fixed)
	var repaired: Array = []
	var failures: Array[String] = []
	var expanded := 0
	for index in targets.size():
		if not survey.paths[index].is_empty(): continue
		var approach: Vector3i = targets[index] + Vector3i.FORWARD * 2
		if _cost(cells, approach, fixed) < 0.0:
			failures.append("target cannot accept three-cell clearance")
			continue
		# Join the nearest existing component, not a new road all the way to
		# spawn. Multi-goal Dijkstra keeps repairs local even on a 255 map.
		var path: Array = []
		while true:
			var planned := _plan(cells, size, terrain, approach, survey.nodes, fixed)
			expanded += planned.expanded
			path = planned.path
			if path.is_empty(): break
			# Keep the chosen join point's existing path to spawn intact. If
			# planning would alter that path, reserve it and search again.
			var join_path: Array = []
			var cursor: Vector3i = path[-1]
			while cursor != spawn:
				join_path.append(cursor)
				cursor = survey.nodes[cursor]
			join_path.append(spawn)
			_reserve(join_path, fixed)
			var safe := true
			for feet: Vector3i in path:
				if _cost(cells, feet, fixed) < 0.0: safe = false
			if safe: break
		if path.is_empty():
			failures.append("no safe landmark repair for %s" % targets[index])
			continue
		# Reserve the whole route before widening: no later cell can seal a step.
		var route_floor := {}
		var route_air := {}
		for feet: Vector3i in path:
			route_floor[feet + Vector3i.DOWN] = true
			for dy in 3: route_air[feet + Vector3i.UP * dy] = true
		var self_conflict := false
		for cell: Vector3i in route_floor:
			if route_air.has(cell): self_conflict = true
		if self_conflict:
			failures.append("landmark repair overlaps its own clearance")
			continue
		for feet: Vector3i in path: _pave(cells, feet, fixed)
		_reserve(path, fixed, 3)
		# Widen level shoulders where existing protected geometry permits it.
		# Steep bends/doorways may remain a one-cell trail, never a false 3m claim.
		for feet: Vector3i in path:
			for direction: Vector3i in VoxelTraversal.DIRECTIONS:
				var shoulder := feet + direction
				if absi(shoulder.x) >= int(size / 2) or absi(shoulder.z) >= int(size / 2): continue
				if _cost(cells, shoulder, fixed) < 0.0: continue
				_pave(cells, shoulder, fixed)
				_reserve([shoulder], fixed, 3)
		repaired.append({"target": targets[index], "path": path})
		survey = VoxelTraversal.survey(cells, size, spawn, targets)
		for existing_path: Array in survey.paths: _reserve(existing_path, fixed)
	return {"repaired": repaired, "errors": failures, "before_reachable": before_reachable, "expanded": expanded}


static func _reserve(path: Array, fixed: Dictionary, clearance: int = 2) -> void:
	for feet: Vector3i in path:
		fixed[feet + Vector3i.DOWN] = true
		for dy in clearance: fixed[feet + Vector3i.UP * dy] = true
	for index in range(1, path.size()):
		var previous: Vector3i = path[index - 1]
		var current: Vector3i = path[index]
		if previous.y != current.y:
			var lower := previous if previous.y < current.y else current
			fixed[lower + Vector3i.UP * 2] = true


static func _pave(cells: Dictionary, feet: Vector3i, fixed: Dictionary) -> void:
	var floor_cell := feet + Vector3i.DOWN
	if not fixed.has(floor_cell): cells[floor_cell] = BlockRegistry.COBBLESTONE
	for dy in 3:
		var air := feet + Vector3i.UP * dy
		if not fixed.has(air): cells.erase(air)


static func _cost(cells: Dictionary, feet: Vector3i, fixed: Dictionary) -> float:
	var floor_cell := feet + Vector3i.DOWN
	var definition := BlockRegistry.by_material(int(cells.get(floor_cell, -1)))
	var solid: bool = not definition.is_empty() and definition.solid
	if fixed.has(floor_cell) and not solid: return -1.0
	var cost := 0.0 if solid else 1.5
	for dy in 3:
		var air := feet + Vector3i.UP * dy
		if cells.has(air):
			if fixed.has(air): return -1.0
			cost += 0.6
	return cost


static func _plan(cells: Dictionary, size: int, terrain: PackedInt32Array, start: Vector3i, connected: Dictionary, fixed: Dictionary) -> Dictionary:
	var frontier: Array = []
	var scores := {start: 0.0}
	var parents := {start: start}
	var costs := {}
	var closed := {}
	var half := int(size / 2)
	var serial := 0
	_push(frontier, [0.0, serial, start])
	while not frontier.is_empty():
		var current: Vector3i = _pop(frontier)[2]
		if closed.has(current): continue
		closed[current] = true
		if connected.has(current):
			var path: Array[Vector3i] = []
			while current != start:
				path.append(current)
				current = parents[current]
			path.append(start)
			path.reverse()
			return {"path": path, "expanded": closed.size()}
		for direction: Vector3i in VoxelTraversal.DIRECTIONS:
			for dy in [0, -1, 1]:
				var next := current + direction + Vector3i(0, dy, 0)
				if absi(next.x) > half or absi(next.z) > half or next.y < 2 or next.y > 60: continue
				if closed.has(next): continue
				if not costs.has(next): costs[next] = _cost(cells, next, fixed)
				var cost: float = costs[next]
				if cost < 0.0: continue
				var ground: int = terrain[(next.z + half) * size + next.x + half] + 1
				var score: float = scores[current] + 1.0 + cost + absf(next.y - ground) * 0.15 + absf(dy) * 0.1
				if score >= float(scores.get(next, INF)): continue
				# A road cannot gain height by revisiting its own X/Z column: its
				# new floor would fill an earlier segment's player clearance.
				var ancestor := current
				var revisits := false
				while true:
					if ancestor.x == next.x and ancestor.z == next.z:
						revisits = true
						break
					if ancestor == start: break
					ancestor = parents[ancestor]
				if revisits: continue
				scores[next] = score
				parents[next] = current
				serial += 1
				_push(frontier, [score, serial, next])
	return {"path": [], "expanded": closed.size()}


static func _less(a: Array, b: Array) -> bool:
	return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1])


static func _push(heap: Array, item: Array) -> void:
	heap.append(item)
	var index := heap.size() - 1
	while index > 0:
		var parent := (index - 1) >> 1
		if not _less(item, heap[parent]): break
		heap[index] = heap[parent]
		index = parent
	heap[index] = item


static func _pop(heap: Array) -> Array:
	var first: Array = heap[0]
	var last: Array = heap.pop_back()
	if heap.is_empty(): return first
	var index := 0
	while index * 2 + 1 < heap.size():
		var child := index * 2 + 1
		if child + 1 < heap.size() and _less(heap[child + 1], heap[child]): child += 1
		if not _less(heap[child], last): break
		heap[index] = heap[child]
		index = child
	heap[index] = last
	return first
