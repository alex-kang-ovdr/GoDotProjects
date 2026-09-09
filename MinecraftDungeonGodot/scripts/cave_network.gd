class_name CaveNetwork
extends RefCounted


# Extend the entrance antechamber with a deep, connected exploration network.
# Plan one supported feet height per X/Z column before touching the world.
# This avoids floor/clearance conflicts where slopes widen or routes meet.
static func build(size: int, entrance_end: Vector3i, cells: Dictionary, protected_air: Dictionary) -> Dictionary:
	var columns := {}
	var access: Array[Vector3i] = [entrance_end]
	# The upper landing clears the old 6x7 antechamber before descending.
	for z in range(1, 9): access.append(Vector3i(16, entrance_end.y, z))
	var y := entrance_end.y
	for x in range(15, -13, -1):
		y = maxi(4, y - 1)
		access.append(Vector3i(x, y, 8))
	for z in range(7, -9, -1):
		y = maxi(4, y - 1)
		access.append(Vector3i(-12, y, z))
	for x in range(-11, 1): access.append(Vector3i(x, y, -8))
	var hub := access[-1]
	var span := clampi(int(size / 5), 8, 35)
	var west := Vector3i(-maxi(12, span), hub.y, -8)
	var east := Vector3i(maxi(12, span), hub.y, -8)
	var north := Vector3i(0, hub.y, -8 - span)
	var south := Vector3i(0, hub.y, 3) if span < 22 else Vector3i(22, hub.y, span)
	var branches: Array = []
	for target: Vector3i in [west, east, north, south]:
		var route: Array[Vector3i] = [hub]
		var cursor := hub
		while cursor.x != target.x:
			cursor.x += signi(target.x - cursor.x)
			route.append(cursor)
		while cursor.z != target.z:
			cursor.z += signi(target.z - cursor.z)
			route.append(cursor)
		branches.append(route)
	var all_paths: Array = [access]
	all_paths.append_array(branches)
	var errors: Array[String] = []
	for path: Array in all_paths:
		for feet: Vector3i in path:
			var column := Vector2i(feet.x, feet.z)
			if columns.has(column) and int(columns[column]) != feet.y:
				errors.append("cave centerlines disagree at " + str(column))
			columns[column] = feet.y
	# Centerlines take priority over shoulders at bends. No 3m-width guarantee
	# is made on the diagonal corner of a descending turn.
	for path: Array in all_paths:
		for index in path.size():
			var feet: Vector3i = path[index]
			var direction: Vector3i = path[mini(index + 1, path.size() - 1)] - path[maxi(0, index - 1)]
			var lateral := Vector3i(0, 0, 1) if absi(direction.x) >= absi(direction.z) else Vector3i(1, 0, 0)
			for side in [-1, 1]:
				var shoulder: Vector3i = feet + lateral * side
				var column := Vector2i(shoulder.x, shoulder.z)
				if not columns.has(column): columns[column] = feet.y
	var rooms: Array[Dictionary] = []
	var room_names := ["Hub", "Western Gallery", "Eastern Gallery", "Northern Chamber", "Southern Chamber"]
	var room_materials := [BlockRegistry.STONE, BlockRegistry.MOSS, BlockRegistry.COBBLESTONE, BlockRegistry.BRICK, BlockRegistry.PLANK]
	var room_centers := [hub, west, east, north, south]
	for room_index in room_centers.size():
		var center: Vector3i = room_centers[room_index]
		var radius := 2 if room_index == 0 else 3
		for dz in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				# Chamfered corners give each chamber a less box-like perimeter.
				if absi(dx) == radius and absi(dz) == radius: continue
				var column := Vector2i(center.x + dx, center.z + dz)
				if columns.has(column) and int(columns[column]) != center.y:
					errors.append("chamber intersects a descending column at " + str(column))
				columns[column] = center.y
		rooms.append({"name": room_names[room_index], "center": center, "radius": radius, "material": room_materials[room_index]})
	var floor_cells := {}
	var air := {}
	for column: Vector2i in columns:
		var feet := Vector3i(column.x, int(columns[column]), column.y)
		if absi(feet.x) > int(size / 2) or absi(feet.z) > int(size / 2) or feet.y < 1:
			errors.append("cave network outside world at " + str(feet))
		floor_cells[feet + Vector3i.DOWN] = BlockRegistry.STONE
		var clearance := 3
		for room: Dictionary in rooms:
			var center: Vector3i = room.center
			if absi(feet.x - center.x) <= room.radius and absi(feet.z - center.z) <= room.radius:
				clearance = maxi(clearance, 5 - int(maxi(absi(feet.x - center.x), absi(feet.z - center.z)) / 2))
				if maxi(absi(feet.x - center.x), absi(feet.z - center.z)) == room.radius - 1:
					floor_cells[feet + Vector3i.DOWN] = room.material
		for dy in clearance: air[feet + Vector3i.UP * dy] = true
	for cell: Vector3i in floor_cells:
		if air.has(cell) or protected_air.has(cell): errors.append("cave floor intersects protected air at " + str(cell))
	if not errors.is_empty(): return {"errors": errors, "rooms": rooms, "access": access, "branches": branches}
	for cell: Vector3i in floor_cells: cells[cell] = floor_cells[cell]
	for cell: Vector3i in air:
		cells.erase(cell)
		protected_air[cell] = true
	return {"errors": errors, "rooms": rooms, "access": access, "branches": branches, "floors": floor_cells, "air": air}
