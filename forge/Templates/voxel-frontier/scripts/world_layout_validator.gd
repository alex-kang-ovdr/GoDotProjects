class_name WorldLayoutValidator
extends RefCounted


static func validate(layout: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var columns: int = layout.size * layout.size
	for field in ["heights", "surface_heights", "ocean_floor_heights", "terrain_heights"]:
		if not layout.has(field) or not layout[field] is PackedInt32Array or layout[field].size() != columns:
			errors.append("missing or malformed heightmap: " + field)
	if not layout.has("climate") or not layout.climate is PackedFloat32Array or layout.climate.size() != columns * 6:
		errors.append("climate must contain six independent fields per column")
	if not errors.is_empty(): return errors
	for value: float in layout.climate:
		if not is_finite(value) or value < -1.0 or value > 1.0:
			errors.append("climate value outside finite -1..1")
			break
	var actual_heights := PackedInt32Array()
	actual_heights.resize(layout.size * layout.size)
	actual_heights.fill(-1)
	var actual_surface := actual_heights.duplicate()
	var actual_ocean_floor := actual_heights.duplicate()
	var half := int(layout.size / 2)
	for cell: Vector3i in layout.cells:
		if absi(cell.x) > half or absi(cell.z) > half or cell.y < 0:
			errors.append("block outside world bounds: %s" % cell)
			break
		var definition := BlockRegistry.by_material(int(layout.cells[cell]))
		if definition.is_empty():
			errors.append("unknown material in generated cells")
			break
		var index: int = (cell.z + half) * layout.size + cell.x + half
		actual_surface[index] = maxi(actual_surface[index], cell.y)
		if definition.solid:
			actual_heights[index] = maxi(actual_heights[index], cell.y)
			if int(layout.cells[cell]) != BlockRegistry.WATER:
				actual_ocean_floor[index] = maxi(actual_ocean_floor[index], cell.y)
	if actual_heights != layout.heights:
		errors.append("heightmap differs from final motion-blocking cells")
	if actual_surface != layout.surface_heights: errors.append("surface heightmap differs from final occupied cells")
	if actual_ocean_floor != layout.ocean_floor_heights: errors.append("ocean floor heightmap differs from final fluid-excluding solids")
	for group in ["cheese_caves", "spaghetti_caves", "ravine_cells"]:
		for cell: Vector3i in layout[group]:
			if layout.cells.has(cell):
				errors.append("%s contains filled cell %s" % [group, cell])
				break
	for cell: Vector3i in layout.ore_cells:
		if int(layout.cells.get(cell, -1)) not in [BlockRegistry.MOSS, BlockRegistry.COBBLESTONE]:
			errors.append("ore metadata differs from final cell")
			break
	for cell: Vector3i in layout.spring_cells:
		if int(layout.cells.get(cell, -1)) != BlockRegistry.WATER or not _solid(layout.cells, cell + Vector3i.DOWN):
			errors.append("spring is missing or unsupported")
			break
	var footprints := {}
	for structure: Dictionary in layout.structures:
		var anchor: Vector3i = structure.anchor
		for dz in range(-2, 3):
			for dx in range(-2, 3):
				var column := Vector2i(anchor.x + dx, anchor.z + dz)
				if footprints.has(column):
					errors.append("landmark footprints overlap")
				footprints[column] = true
		var door: Vector3i = structure.get("door", anchor + Vector3i(0, 0, -2))
		if not _walkable(layout.cells, door):
			errors.append("landmark door is obstructed or unsupported at %s" % door)
	if not _walkable(layout.cells, layout.spawn):
		errors.append("spawn is not walkable")
	var targets: Array = []
	for structure: Dictionary in layout.structures: targets.append(structure.door)
	var network: Dictionary = layout.get("cave_network", {})
	if network.get("rooms", []).size() != 5 or not network.get("errors", []).is_empty():
		errors.append("protected cave network is incomplete")
	for room: Dictionary in network.get("rooms", []): targets.append(room.center)
	for cell: Vector3i in network.get("floors", {}):
		if int(layout.cells.get(cell, -1)) != int(network.floors[cell]):
			errors.append("protected cave floor or chamber marker was changed")
			break
	var traversal := VoxelTraversal.survey(layout.cells, layout.size, layout.spawn, targets)
	if traversal.reachable != targets.size(): errors.append("landmarks or cave rooms are not all reachable from spawn")
	if not layout.get("landmark_routes", {}).get("errors", []).is_empty(): errors.append("landmark route repair failed")
	var protected: Dictionary = layout.get("protected_cave", {})
	var path: Array = layout.get("cave_path", [])
	if protected.is_empty() or path.size() < 8:
		errors.append("protected cave path is missing")
	else:
		var entrance: Vector3i = layout.get("cave_entrance", Vector3i(-999, -999, -999))
		var air_seen := {}
		var air_queue: Array[Vector3i] = []
		if protected.has(entrance):
			air_seen[entrance] = true
			air_queue.append(entrance)
		var head := 0
		while head < air_queue.size():
			var current := air_queue[head]
			head += 1
			for direction: Vector3i in [Vector3i.LEFT, Vector3i.RIGHT, Vector3i.UP, Vector3i.DOWN, Vector3i.FORWARD, Vector3i.BACK]:
				var next := current + direction
				if protected.has(next) and not air_seen.has(next):
					air_seen[next] = true
					air_queue.append(next)
		if air_seen.size() != protected.size(): errors.append("protected cave air is not all connected to its entrance")
		for cell: Vector3i in protected:
			if layout.cells.has(cell):
				errors.append("protected cave was filled by a later generation pass at %s" % cell)
				break
		for index in path.size():
			var cell: Vector3i = path[index]
			if not _walkable(layout.cells, cell):
				errors.append("cave path lacks floor or two-cell clearance")
				break
			if index > 0:
				var step: Vector3i = cell - path[index - 1]
				if absi(step.x) + absi(step.z) != 1 or absi(step.y) > 1:
					errors.append("cave path has a disconnected step")
	return errors


static func _solid(cells: Dictionary, cell: Vector3i) -> bool:
	var definition := BlockRegistry.by_material(int(cells.get(cell, -1)))
	return not definition.is_empty() and definition.solid


static func _walkable(cells: Dictionary, feet: Vector3i) -> bool:
	return not cells.has(feet) and not cells.has(feet + Vector3i.UP) and _solid(cells, feet + Vector3i.DOWN)
