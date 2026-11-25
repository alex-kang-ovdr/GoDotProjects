extends RefCounted
class_name SpatialHash
var size: float = 4.0
var cells: Dictionary = {}
func _init(cell_size = 4): size = cell_size
func key(x, z): return Vector2i(int(floor(x / size)), int(floor(z / size)))
func rebuild(entities):
	cells.clear()
	for entity in entities:
		if entity.get("dead", false): continue
		var cell_key = key(entity.x, entity.z)
		if not cells.has(cell_key): cells[cell_key] = []
		cells[cell_key].append(entity)
func nearby(x, z, radius):
	var found = []
	for ix in range(int(floor((x-radius)/size)), int(floor((x+radius)/size))+1):
		for iz in range(int(floor((z-radius)/size)), int(floor((z+radius)/size))+1):
			var cell_key = Vector2i(ix,iz)
			if cells.has(cell_key): found.append_array(cells[cell_key])
	return found
