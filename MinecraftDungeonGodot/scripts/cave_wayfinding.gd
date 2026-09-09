class_name CaveWayfinding
extends RefCounted

# A small, conservative atlas of the generated cave, not a whole-world navmesh.
# Never retain the layout/store: retired worlds must remain releasable off-thread.
var candidates: Dictionary = {}
var mapped_air: Dictionary = {}
var rooms: Array = []
var exit_cell := Vector3i.ZERO
var parents: Dictionary = {}
var distances: Dictionary = {}
var cached_store_id := 0
var cached_serial := -1
var rebuild_count := 0
var last_build_us := 0


func configure(layout: Dictionary) -> void:
	candidates.clear()
	mapped_air.clear()
	rooms.clear()
	parents.clear()
	distances.clear()
	cached_store_id = 0
	cached_serial = -1
	if not layout.has("cave_network"): return
	exit_cell = layout.spawn
	rooms = layout.cave_network.rooms.duplicate(true)
	for cell: Vector3i in layout.protected_cave:
		mapped_air[cell] = true
		if VoxelTraversal.walkable(layout.cells, cell): candidates[cell] = true


func sample(store: VoxelChunkStore, position: Vector3, yaw: float) -> Dictionary:
	var feet := Vector3i(floori(position.x), floori(position.y + 0.05), floori(position.z))
	if not mapped_air.has(feet): return {"visible": false}
	var result := {"visible": true, "area": _area(feet), "heading": _compass(Vector3(-sin(yaw), 0, -cos(yaw))), "status": "unmapped", "text": "Land on the mapped floor to resume exit guidance"}
	if not candidates.has(feet): return result
	if store.get_instance_id() != cached_store_id or store.change_serial != cached_serial:
		_rebuild(store)
	if not parents.has(feet):
		result.status = "blocked"
		result.text = "No verified exit route | Restore the path or press R to return"
		return result
	if feet == exit_cell:
		result.status = "exit"
		result.text = "SURFACE EXIT | You are back at the entrance"
		return result
	var next: Vector3i = parents[feet]
	var delta := Vector3(next) + Vector3(0.5, 0, 0.5) - position
	var angle := wrapf(atan2(-delta.x, -delta.z) - yaw, -PI, PI)
	var turn := "AHEAD"
	if absf(angle) > deg_to_rad(150): turn = "TURN BACK"
	elif angle > deg_to_rad(30): turn = "LEFT"
	elif angle < deg_to_rad(-30): turn = "RIGHT"
	var slope := " | Space: climb" if next.y > feet.y else (" | Step down" if next.y < feet.y else "")
	result.status = "route"
	result.next = next
	result.steps = distances[feet]
	result.text = "EXIT: %s (%s) | %d grid steps%s" % [turn, _compass(Vector3(next - feet)), distances[feet], slope]
	return result


func _rebuild(store: VoxelChunkStore) -> void:
	var started := Time.get_ticks_usec()
	parents.clear()
	distances.clear()
	var live := {}
	for cell: Vector3i in candidates:
		if store.get_block(cell) != -1 or store.get_block(cell + Vector3i.UP) != -1: continue
		var floor_block := BlockRegistry.by_material(store.get_block(cell + Vector3i.DOWN))
		if not floor_block.is_empty() and floor_block.solid: live[cell] = true
	var queue: Array[Vector3i] = []
	if live.has(exit_cell):
		parents[exit_cell] = exit_cell
		distances[exit_cell] = 0
		queue.append(exit_cell)
	var head := 0
	while head < queue.size():
		var current := queue[head]
		head += 1
		for direction: Vector3i in VoxelTraversal.DIRECTIONS:
			for dy in [0, -1, 1]:
				var next := current + direction + Vector3i(0, dy, 0)
				if parents.has(next) or not live.has(next): continue
				var lower := current if dy > 0 else next
				if dy != 0 and store.get_block(lower + Vector3i.UP * 2) != -1: continue
				parents[next] = current
				distances[next] = int(distances[current]) + 1
				queue.append(next)
	cached_store_id = store.get_instance_id()
	cached_serial = store.change_serial
	rebuild_count += 1
	last_build_us = Time.get_ticks_usec() - started


func _area(feet: Vector3i) -> String:
	for room: Dictionary in rooms:
		var center: Vector3i = room.center
		var dx := absi(feet.x - center.x)
		var dz := absi(feet.z - center.z)
		if feet.y >= center.y and feet.y < center.y + 4 and dx <= room.radius and dz <= room.radius and not (dx == room.radius and dz == room.radius):
			return str(room.name)
	return "Entrance stair" if feet.y > exit_cell.y - 8 else "Cave passages"


static func _compass(direction: Vector3) -> String:
	var octant := posmod(roundi(atan2(direction.x, -direction.z) / (PI / 4.0)), 8)
	return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][octant]
