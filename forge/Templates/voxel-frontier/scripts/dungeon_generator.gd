class_name DungeonGenerator
extends RefCounted

const DIRECTIONS := [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.UP, Vector2i.DOWN]


static func generate(seed_value: int, size: int, attempts: int) -> Dictionary:
	if seed_value < -2147483648 or seed_value > 2147483647 or size < 11 or size > 255 or size % 2 == 0 or attempts < 1 or attempts > 512:
		return {}
	var started := Time.get_ticks_usec()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var half := int(size / 2)
	var rooms: Array[Rect2i] = []
	var floors := {}
	for unused in attempts:
		var width := rng.randi_range(5, mini(11, size - 4))
		var depth := rng.randi_range(5, mini(11, size - 4))
		var room := Rect2i(rng.randi_range(-half + 2, half - width - 1), rng.randi_range(-half + 2, half - depth - 1), width, depth)
		var overlaps := false
		for other in rooms:
			if room.grow(1).intersects(other):
				overlaps = true
				break
		if overlaps: continue
		for z in range(room.position.y, room.end.y):
			for x in range(room.position.x, room.end.x):
				floors[Vector2i(x, z)] = BlockRegistry.PLANK
		# Each accepted room joins a prior room. The union stays connected even
		# when this three-cell-wide route crosses another route or room.
		if not rooms.is_empty():
			var nearest := rooms[0].get_center()
			for other in rooms:
				if other.get_center().distance_squared_to(room.get_center()) < nearest.distance_squared_to(room.get_center()):
					nearest = other.get_center()
			var cursor := room.get_center()
			var x_first := rng.randi_range(0, 1) == 0
			while cursor != nearest:
				_carve_route(floors, cursor)
				if (x_first and cursor.x != nearest.x) or cursor.y == nearest.y:
					cursor.x += signi(nearest.x - cursor.x)
				else:
					cursor.y += signi(nearest.y - cursor.y)
			_carve_route(floors, nearest)
		rooms.append(room)
	var entrance := rooms[0].get_center()
	var search := paths(floors, entrance)
	var exit_cell: Vector2i = search.order[-1]
	var route: Array[Vector3i] = []
	var cursor := exit_cell
	while cursor != entrance:
		route.push_front(Vector3i(cursor.x, 1, cursor.y))
		cursor = search.parents[cursor]
	route.push_front(Vector3i(entrance.x, 1, entrance.y))
	var cells := {}
	for floor_cell: Vector2i in floors:
		cells[Vector3i(floor_cell.x, 0, floor_cell.y)] = floors[floor_cell]
		for dz in range(-1, 2):
			for dx in range(-1, 2):
				var neighbor := floor_cell + Vector2i(dx, dz)
				if floors.has(neighbor): continue
				for y in range(0, 4):
					cells[Vector3i(neighbor.x, y, neighbor.y)] = BlockRegistry.MOSS if y == 0 else BlockRegistry.BRICK
	cells[Vector3i(entrance.x, 0, entrance.y)] = BlockRegistry.GRASS
	cells[Vector3i(exit_cell.x, 0, exit_cell.y)] = BlockRegistry.SAND
	var heights := DeterministicWorldGenerator._motion_heights(size, half, cells)
	return {"generation_version": DeterministicWorldGenerator.GENERATION_VERSION,
		"mode": "dungeon", "room_attempts": attempts, "seed": seed_value, "size": size,
		"cells": cells, "heights": heights, "rooms": rooms, "dungeon_floors": floors,
		"spawn": route[0], "exit": route[-1], "dungeon_path": route,
		"structures": [], "biome_counts": PackedInt32Array(),
		"signature": DeterministicWorldGenerator.signature(cells),
		"timings": {"dungeon_us": Time.get_ticks_usec() - started}}


static func _carve_route(floors: Dictionary, center: Vector2i) -> void:
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			var cell := center + Vector2i(dx, dz)
			if not floors.has(cell): floors[cell] = BlockRegistry.COBBLESTONE


static func paths(floors: Dictionary, start: Vector2i) -> Dictionary:
	var parents := {start: start}
	var order: Array[Vector2i] = [start]
	var index := 0
	while index < order.size():
		var cell := order[index]
		index += 1
		for direction: Vector2i in DIRECTIONS:
			var neighbor := cell + direction
			if floors.has(neighbor) and not parents.has(neighbor):
				parents[neighbor] = cell
				order.append(neighbor)
	return {"parents": parents, "order": order}


static func validate(layout: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if not layout.has_all(["rooms", "dungeon_floors", "cells", "spawn", "exit", "dungeon_path", "size", "heights"]):
		errors.append("dungeon layout fields missing")
		return errors
	var half := int(layout.size / 2)
	var floors: Dictionary = layout.dungeon_floors
	var cells: Dictionary = layout.cells
	if floors.is_empty() or layout.rooms.is_empty(): errors.append("dungeon has no floors or rooms")
	for cell: Vector3i in cells:
		if absi(cell.x) > half or absi(cell.z) > half or cell.y < 0 or cell.y > 3:
			errors.append("dungeon block outside bounds")
			break
		if BlockRegistry.by_material(int(cells[cell])).is_empty():
			errors.append("dungeon material invalid")
			break
	for index in layout.rooms.size():
		var room: Rect2i = layout.rooms[index]
		if room.position.x <= -half or room.position.y <= -half or room.end.x > half or room.end.y > half:
			errors.append("dungeon room outside bounds")
		for other_index in range(index + 1, layout.rooms.size()):
			if room.intersects(layout.rooms[other_index]): errors.append("dungeon rooms overlap")
		for z in range(room.position.y, room.end.y):
			for x in range(room.position.x, room.end.x):
				if not floors.has(Vector2i(x, z)): errors.append("room floor missing")
	for point: Vector2i in floors:
		var feet := Vector3i(point.x, 1, point.y)
		if absi(point.x) >= half or absi(point.y) >= half or not WorldLayoutValidator._walkable(cells, feet) or cells.has(feet + Vector3i.UP * 2):
			errors.append("dungeon floor lacks clearance/support or exceeds bounds")
			break
		for direction: Vector2i in DIRECTIONS:
			var neighbor := point + direction
			if not floors.has(neighbor):
				for y in range(1, 4):
					if not WorldLayoutValidator._solid(cells, Vector3i(neighbor.x, y, neighbor.y)):
						errors.append("dungeon perimeter wall missing")
	var entrance := Vector2i(layout.spawn.x, layout.spawn.z)
	var exit_point := Vector2i(layout.exit.x, layout.exit.z)
	if not floors.has(entrance) or not floors.has(exit_point) or layout.spawn.y != 1 or layout.exit.y != 1:
		errors.append("dungeon entrance/exit invalid")
	elif paths(floors, entrance).order.size() != floors.size(): errors.append("dungeon floors disconnected")
	var route: Array = layout.dungeon_path
	if route.is_empty() or route[0] != layout.spawn or route[-1] != layout.exit:
		errors.append("dungeon route endpoints invalid")
	for index in route.size():
		if not WorldLayoutValidator._walkable(cells, route[index]): errors.append("dungeon route obstructed")
		if index > 0 and Vector3(route[index] - route[index - 1]).length_squared() != 1.0: errors.append("dungeon route is not contiguous")
	if DeterministicWorldGenerator._motion_heights(layout.size, half, cells) != layout.heights:
		errors.append("dungeon final heightmap mismatch")
	return errors
