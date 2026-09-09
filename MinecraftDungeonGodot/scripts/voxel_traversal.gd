class_name VoxelTraversal
extends RefCounted

const DIRECTIONS := [Vector3i.LEFT, Vector3i.RIGHT, Vector3i.FORWARD, Vector3i.BACK]


# A conservative, reversible walking/jumping graph derived only from final cells.
# Unit ascents require an extra cell over the lower endpoint for the 1.8m body.
static func survey(cells: Dictionary, size: int, spawn: Vector3i, targets: Array) -> Dictionary:
	var parents := {}
	var queue: Array[Vector3i] = []
	if walkable(cells, spawn):
		parents[spawn] = spawn
		queue.append(spawn)
	var pending := {}
	for target: Vector3i in targets: pending[target] = true
	var head := 0
	var half := int(size / 2)
	while head < queue.size() and not pending.is_empty():
		var current := queue[head]
		head += 1
		pending.erase(current)
		for direction: Vector3i in DIRECTIONS:
			for dy in [0, -1, 1]:
				var next := current + direction + Vector3i(0, dy, 0)
				if absi(next.x) > half or absi(next.z) > half or next.y < 1 or next.y >= 64: continue
				if parents.has(next) or not walkable(cells, next): continue
				var lower := current if dy > 0 else next
				if dy != 0 and cells.has(lower + Vector3i.UP * 2): continue
				parents[next] = current
				queue.append(next)
	var paths: Array = []
	for target: Vector3i in targets:
		var path: Array[Vector3i] = []
		if parents.has(target):
			var cursor := target
			while cursor != spawn:
				path.append(cursor)
				cursor = parents[cursor]
			path.append(spawn)
			path.reverse()
		paths.append(path)
	return {"paths": paths, "reachable": targets.size() - pending.size(), "visited": head, "nodes": parents}


static func walkable(cells: Dictionary, feet: Vector3i) -> bool:
	if cells.has(feet) or cells.has(feet + Vector3i.UP): return false
	var definition := BlockRegistry.by_material(int(cells.get(feet + Vector3i.DOWN, -1)))
	return not definition.is_empty() and definition.solid
