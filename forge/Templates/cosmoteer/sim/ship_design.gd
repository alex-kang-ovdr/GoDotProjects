extends RefCounted

const GRID_SIZE := Vector2i(16, 10)
const CATALOG_PATH := "res://data/catalog.json"
const EngineRoom := preload("res://sim/engine_room.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const CORRIDOR := "cosmoteer.corridor"
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT]
const MAX_UID := 9007199254740991  # Largest safe integer for a JSON double.

var parts: Array[Dictionary] = []
var by_id: Dictionary = {}
var crew_speed := 0.0
var ship_physics: Dictionary = {}
var load_error := ""

var _at: Dictionary = {}
var _by_uid: Dictionary = {}
var _next_uid := 1


func _init() -> void:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		load_error = "%s: %s" % [CATALOG_PATH, error_string(FileAccess.get_open_error())]
		return
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		load_error = "%s:%d %s" % [CATALOG_PATH, json.get_error_line(), json.get_error_message()]
		return
	var catalog: Variant = json.data
	if not catalog is Dictionary or not catalog.get("parts") is Array:
		load_error = "Missing parts in %s" % CATALOG_PATH
		return
	var definitions := {}
	for record in catalog.parts:
		if not record is Dictionary or not record.get("id") is String or definitions.has(record.id):
			load_error = "Invalid or duplicate catalog part ID"
			return
		if not _is_pair(record.get("size"), Vector2i.ONE, Vector2i(2147483647, 2147483647)) or not record.get("resources") is Dictionary:
			load_error = "Invalid catalog size or materials for %s" % record.id
			return
		for material in record.resources:
			if not _integer_between(record.resources[material], 0, MAX_UID):
				load_error = "Invalid material quantity for %s" % record.id
				return
		definitions[record.id] = record
	for id in ["cosmoteer.reactor_small", "cosmoteer.crew_quarters_small", "cosmoteer.control_room_small", "cosmoteer.laser_blaster_small", "cosmoteer.armor", "cosmoteer.thruster_small_3way"]:
		if not definitions.has(id):
			load_error = "Missing starter part %s" % id
			return
	var crew: Variant = catalog.get("crew")
	var floor_def: Dictionary = definitions.get(CORRIDOR, {})
	if not crew is Dictionary or not _positive_number(crew.get("base_speed")) or not _positive_number(floor_def.get("crew_speed_factor")):
		load_error = "Missing crew or corridor movement speed"
		return
	var physics = catalog.get("ship_physics")
	var gun_stats: Dictionary = definitions["cosmoteer.laser_blaster_small"].get("stats",{})
	if not physics is Dictionary or not gun_stats.has("firing_arc_deg") or not definitions["cosmoteer.thruster_small_3way"].stats.has("nozzles"):
		load_error = "비행 데이터가 없습니다. tools/extract_catalog.py로 data/catalog.json을 다시 생성하세요."
		return
	var required_profiles := {
		"thruster_boost":["normal_nozzle","boost_nozzle","battery_toggle_on"],
		"thruster_rocket_nozzle":["sockets","crew_locations","blocked_travel_cells","thrust_exponent","ramp_exponent"],
		"thruster_rocket_extender":["sockets","stage_capacity_limit","blocked_travel_cells"],
		"thruster_rocket_battery":["sockets","local_battery_capacity"]
	}
	for name_key in required_profiles:
		var definition: Dictionary = definitions.get("cosmoteer."+name_key,{})
		var profile: Dictionary = definition.get("stats",{}).get("special_propulsion",{})
		if not profile.has_all(required_profiles[name_key]):
			load_error = "특수 추진 데이터가 누락되었습니다 (%s). tools/extract_catalog.py로 다시 추출하세요." % name_key
			return
	for name_key in ["linear_min_damping","linear_drag_coefficient","linear_drag_exponent","angular_drag_coefficient","rotational_inertia_factor","max_abs_angular_velocity","restitution"]:
		var value = physics.get(name_key)
		if not (value is float or value is int) or not is_finite(float(value)) or value < 0:
			load_error = "비행 카탈로그의 ship_physics.%s 값을 확인하세요." % name_key
			return
	definitions[EngineRoom.ID] = EngineRoom.ROOM.duplicate(true)
	CombatSystems.augment_definitions(definitions)
	by_id = definitions
	ship_physics = physics
	crew_speed = float(crew.base_speed) * float(floor_def.crew_speed_factor)


func _positive_number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value > 0


func _integer_between(value: Variant, low: int, high: int) -> bool:
	return (value is int or value is float) and value >= low and value <= high and value == floor(value)


func _is_pair(value: Variant, low: Vector2i, high: Vector2i) -> bool:
	return value is Array and value.size() == 2 and _integer_between(value[0], low.x, high.x) and _integer_between(value[1], low.y, high.y)


func _rotated_size(id: String, rotation: int) -> Vector2i:
	var dimensions: Array = by_id[id].size
	var size := Vector2i(int(dimensions[0]), int(dimensions[1]))
	return size if rotation % 2 == 0 else Vector2i(size.y, size.x)


func _fits(id: String, cell: Vector2i, rotation: int, occupied: Dictionary) -> bool:
	if not by_id.has(id) or rotation < 0 or rotation > 3 or cell.x < 0 or cell.y < 0:
		return false
	var size := _rotated_size(id, rotation)
	if cell.x > GRID_SIZE.x - size.x or cell.y > GRID_SIZE.y - size.y:
		return false
	for x in size.x:
		for y in size.y:
			if occupied.has(cell + Vector2i(x, y)):
				return false
	return true


func can_place(id: String, cell: Vector2i, rotation: int = 0) -> bool:
	return _fits(id, cell, rotation, _at)


func _make_part(uid: int, id: String, cell: Vector2i, rotation: int) -> Dictionary:
	return {"uid": uid, "id": id, "cell": cell, "rotation": rotation, "size": _rotated_size(id, rotation)}


func _index_part(part: Dictionary, occupied: Dictionary) -> void:
	for x in part.size.x:
		for y in part.size.y:
			occupied[part.cell + Vector2i(x, y)] = part


func place(id: String, cell: Vector2i, rotation: int = 0) -> bool:
	if not can_place(id, cell, rotation):
		return false
	if _next_uid > MAX_UID:
		_next_uid = 1
	while _by_uid.has(_next_uid):
		_next_uid += 1
	var part := _make_part(_next_uid, id, cell, rotation)
	parts.append(part)
	_index_part(part, _at)
	_by_uid[_next_uid] = part
	_next_uid += 1
	return true


func part_at(cell: Vector2i) -> Dictionary:
	return _at.get(cell, {})


func remove_at(cell: Vector2i) -> bool:
	var part := part_at(cell)
	if part.is_empty():
		return false
	for x in part.size.x:
		for y in part.size.y:
			_at.erase(part.cell + Vector2i(x, y))
	parts.erase(part)
	_by_uid.erase(part.uid)
	return true


func _corridor_at(cell: Vector2i) -> bool:
	return _at.has(cell) and _at[cell].id == CORRIDOR


func _access_cells(part: Dictionary) -> Array[Vector2i]:
	# The lab models door access on all four room edges. Travel itself is on corridors.
	var result: Array[Vector2i] = []
	if part.id == CORRIDOR:
		result.append(part.cell)
		return result
	var edge := Rect2i(part.cell, part.size)
	for x in range(edge.position.x, edge.end.x):
		for y in [edge.position.y - 1, edge.end.y]:
			var cell := Vector2i(x, y)
			if _corridor_at(cell):
				result.append(cell)
	for y in range(edge.position.y, edge.end.y):
		for x in [edge.position.x - 1, edge.end.x]:
			var cell := Vector2i(x, y)
			if _corridor_at(cell):
				result.append(cell)
	return result


func path_between(from_uid: int, to_uid: int) -> Array[Vector2i]:
	var path: Array[Vector2i] = []
	if not _by_uid.has(from_uid) or not _by_uid.has(to_uid):
		return path
	var queue := _access_cells(_by_uid[from_uid])
	var goals := _access_cells(_by_uid[to_uid])
	if goals.is_empty():
		return path
	var previous := {}
	for seed in queue:
		previous[seed] = seed
	var cursor := 0
	while cursor < queue.size():
		var cell := queue[cursor]
		cursor += 1
		if goals.has(cell):
			while previous[cell] != cell:
				path.append(cell)
				cell = previous[cell]
			path.append(cell)
			path.reverse()
			return path
		for direction in DIRECTIONS:
			var neighbor := cell + direction
			if _corridor_at(neighbor) and not previous.has(neighbor):
				previous[neighbor] = cell
				queue.append(neighbor)
	return path


func total_cost() -> Dictionary:
	var result := {}
	for part in parts:
		var costs: Dictionary = by_id[part.id].resources
		for material in costs:
			result[material] = int(result.get(material, 0)) + int(costs[material])
	return result


func serialize() -> Dictionary:
	var rows: Array[Dictionary] = []
	for part in parts:
		rows.append({"uid": part.uid, "id": part.id, "cell": [part.cell.x, part.cell.y], "rotation": part.rotation})
	return {"version": 1, "parts": rows}


func restore(data: Variant) -> bool:
	if not data is Dictionary or not _integer_between(data.get("version"), 1, 1) or not data.get("parts") is Array:
		return false
	if data.parts.size() > GRID_SIZE.x * GRID_SIZE.y or not load_error.is_empty():
		return false
	var restored: Array[Dictionary] = []
	var occupied := {}
	var uids := {}
	var highest := 0
	for row in data.parts:
		if not row is Dictionary or not row.get("id") is String or not _integer_between(row.get("uid"), 1, MAX_UID):
			return false
		if not _is_pair(row.get("cell"), Vector2i.ZERO, GRID_SIZE - Vector2i.ONE) or not _integer_between(row.get("rotation"), 0, 3):
			return false
		var uid := int(row.uid)
		var rotation := int(row.rotation)
		var cell := Vector2i(int(row.cell[0]), int(row.cell[1]))
		if uids.has(uid) or not _fits(row.id, cell, rotation, occupied):
			return false
		var part := _make_part(uid, row.id, cell, rotation)
		_index_part(part, occupied)
		restored.append(part)
		uids[uid] = part
		highest = maxi(highest, uid)
	parts = restored
	_at = occupied
	_by_uid = uids
	_next_uid = highest + 1
	return true


func _clear_layout() -> void:
	parts.clear()
	_at.clear()
	_by_uid.clear()
	_next_uid = 1


func starter() -> void:
	_clear_layout()
	place("cosmoteer.reactor_small", Vector2i(3, 3))
	place("cosmoteer.crew_quarters_small", Vector2i(6, 3), 2)
	place("cosmoteer.crew_quarters_small", Vector2i(7, 3), 2)
	place("cosmoteer.control_room_small", Vector2i(8, 3))
	place("cosmoteer.laser_blaster_small", Vector2i(11, 2))
	place("cosmoteer.armor", Vector2i(12, 4))
	for x in range(3, 13):
		place(CORRIDOR, Vector2i(x, 5))


func flight_starter() -> void:
	_clear_layout()
	place("cosmoteer.reactor_small", Vector2i(4, 4))
	place("cosmoteer.control_room_small", Vector2i(8, 4))
	place("cosmoteer.laser_blaster_small", Vector2i(11, 4), 1)
	for x in [6, 7]:
		place("cosmoteer.crew_quarters_small", Vector2i(x, 4), 2)
		place("cosmoteer.crew_quarters_small", Vector2i(x, 1), 2)
	for x in [2, 9]:
		place("cosmoteer.thruster_small_3way", Vector2i(x, 1), 2)
		place("cosmoteer.thruster_small_3way", Vector2i(x, 7))
	for x in range(3, 12):
		place(CORRIDOR, Vector2i(x, 3))
		place(CORRIDOR, Vector2i(x, 6))
	for x in [3, 10]:
		for y in [4, 5]:
			place(CORRIDOR, Vector2i(x, y))
	place(CORRIDOR, Vector2i(11, 5))
	for x in [12, 13]:
		place("cosmoteer.armor", Vector2i(x, 5))


func special_starter() -> void:
	_clear_layout()
	place(EngineRoom.ID, Vector2i(2, 3))
	place("cosmoteer.thruster_boost", Vector2i(1, 1), 1)
	place("cosmoteer.thruster_rocket_nozzle", Vector2i(1, 5), 1)
	place("cosmoteer.thruster_rocket_extender", Vector2i(6, 5), 1)
	place("cosmoteer.thruster_rocket_battery", Vector2i(6, 8), 1)
	place("cosmoteer.reactor_small", Vector2i(12, 1))
	place("cosmoteer.reactor_small", Vector2i(11, 5))
	place("cosmoteer.control_room_small", Vector2i(10, 1))
	place("cosmoteer.laser_blaster_small", Vector2i(13, 5), 1)
	for x in range(6, 10):
		place("cosmoteer.crew_quarters_small", Vector2i(x, 1))
	place("cosmoteer.thruster_small_3way", Vector2i(1, 8))
	place("cosmoteer.thruster_small_3way", Vector2i(11, 8), 2)
	for x in range(4, 14):
		place(CORRIDOR, Vector2i(x, 4))
	for x in range(4, 14):
		place(CORRIDOR, Vector2i(x, 3))
	for x in range(10, 14):
		place(CORRIDOR, Vector2i(x, 7))
	for y in [5, 6, 8, 9]:
		place(CORRIDOR, Vector2i(10, y))
	for x in range(4, 10):
		place(CORRIDOR, Vector2i(x, 9))


func shield_missile_cruiser() -> void:
	_clear_layout()
	place(CombatSystems.BUNK_MED, Vector2i(2, 4))
	place(CombatSystems.REACTOR_MED, Vector2i(4, 4))
	place(CombatSystems.BUNK_SMALL, Vector2i(7, 4), 2)
	place("cosmoteer.control_room_small", Vector2i(8, 4))
	place(CombatSystems.SHIELD_SMALL, Vector2i(11, 4), 1)
	place(CombatSystems.MISSILE_LAUNCHER, Vector2i(8, 1), 1)
	place(CombatSystems.POINT_DEFENSE, Vector2i(12, 2), 1)
	place(CombatSystems.CANNON_MED, Vector2i(11, 7), 1)
	place(CombatSystems.LASER_SMALL, Vector2i(13, 6), 1)
	place(CombatSystems.ARMOR_2X1, Vector2i(14, 4), 1)
	place("cosmoteer.thruster_small_3way", Vector2i(2, 1), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(6, 1), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(7, 7))
	place("cosmoteer.thruster_small_3way", Vector2i(9, 7))
	for x in range(2, 13):
		place(CORRIDOR, Vector2i(x, 3))
	place(CORRIDOR, Vector2i(10, 4))
	place(CORRIDOR, Vector2i(10, 5))
	for x in range(7, 13):
		place(CORRIDOR, Vector2i(x, 6))


func dreadnought_battleship() -> void:
	_clear_layout()
	place(CombatSystems.BUNK_MED, Vector2i(0, 3))
	place(CombatSystems.BUNK_MED, Vector2i(0, 6))
	place(CombatSystems.REACTOR_LARGE, Vector2i(3, 3))
	place("cosmoteer.control_room_small", Vector2i(7, 3))
	place(CombatSystems.FIRE_EXTINGUISHER, Vector2i(7, 5))
	place(CombatSystems.SHIELD_LARGE, Vector2i(10, 3), 1)
	place(CombatSystems.ION_BEAM, Vector2i(11, 0), 1)
	place(CombatSystems.DISRUPTOR, Vector2i(7, 1), 1)
	place(CombatSystems.RAILGUN_ACCEL, Vector2i(8, 8), 1)
	place(CombatSystems.RAILGUN_LAUNCHER, Vector2i(11, 8), 1)
	place(CombatSystems.POINT_DEFENSE, Vector2i(13, 6), 1)
	place("cosmoteer.armor", Vector2i(15, 6))
	place("cosmoteer.thruster_small_3way", Vector2i(3, 0), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(5, 0), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(3, 8))
	place("cosmoteer.thruster_small_3way", Vector2i(5, 8))
	for y in range(2, 8):
		place(CORRIDOR, Vector2i(2, y))
		place(CORRIDOR, Vector2i(9, y))
	for x in range(3, 14):
		if x != 9:
			place(CORRIDOR, Vector2i(x, 2))
	for x in range(3, 15):
		if x != 9:
			place(CORRIDOR, Vector2i(x, 7))
	place(CORRIDOR, Vector2i(8, 5))
	place(CORRIDOR, Vector2i(7, 6))
	place(CORRIDOR, Vector2i(8, 6))


static func mirror_vertical(cell: Vector2i, dims: Vector2i, rotation: int) -> Dictionary:
	var mrot := 2 if rotation == 0 else (0 if rotation == 2 else rotation)
	return {"cell": Vector2i(cell.x, GRID_SIZE.y - dims.y - cell.y), "rotation": mrot}


func prism_flak_destroyer() -> void:
	_clear_layout()
	place(CombatSystems.BUNK_MED, Vector2i(0, 2))
	place(CombatSystems.BUNK_MED, Vector2i(0, 5))
	place(CombatSystems.REACTOR_LARGE, Vector2i(3, 3))
	place("cosmoteer.control_room_small", Vector2i(7, 4))
	place(CombatSystems.ION_BEAM, Vector2i(9, 4), 1)
	place(CombatSystems.ION_PRISM, Vector2i(14, 4), 1)
	place(CombatSystems.FLAK_CANNON, Vector2i(9, 0), 1)
	place(CombatSystems.CHAINGUN, Vector2i(9, 7), 1)
	place(CombatSystems.CHAINGUN_MAG, Vector2i(7, 8), 1)
	place(CombatSystems.POINT_DEFENSE, Vector2i(7, 1), 1)
	place("cosmoteer.thruster_small_3way", Vector2i(3, 0), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(5, 0), 2)
	place("cosmoteer.thruster_small_3way", Vector2i(3, 8))
	place("cosmoteer.thruster_small_3way", Vector2i(5, 8))
	for y in range(1, 9):
		place(CORRIDOR, Vector2i(2, y))
	for x in range(3, 9):
		place(CORRIDOR, Vector2i(x, 2))
		place(CORRIDOR, Vector2i(x, 7))
	for x in range(7, 15):
		place(CORRIDOR, Vector2i(x, 3))
		place(CORRIDOR, Vector2i(x, 6))
