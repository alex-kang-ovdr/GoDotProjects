extends SceneTree

const Design := preload("res://sim/ship_design.gd")
const ARMOR := "cosmoteer.armor"
const LASER := "cosmoteer.laser_blaster_small"
const CORRIDOR := "cosmoteer.corridor"

var checks := 0
var failures: Array[String] = []


func _check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures.append(message)


func _initialize() -> void:
	var design := Design.new()
	_check(design.load_error.is_empty(), "Catalog load: %s" % design.load_error)
	if design.load_error.is_empty():
		_test_placement(design)
		_test_routes(design)
		_test_starter(design)
		_test_serialization(design)
		_test_flight_starter(design)
	for message in failures:
		printerr("FAIL ", message)
	print("Ship design checks: %d; failures: %d" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _test_placement(design: Design) -> void:
	_check(design.parts.is_empty() and design.by_id.has(LASER), "Empty grid, populated definitions")
	_check(not design.place("unknown", Vector2i.ZERO) and not design.place(ARMOR, Vector2i(-1, 4)), "Reject unknown ID and negative cell")
	_check(not design.can_place(LASER, Vector2i(15, 9), 0) and not design.can_place(LASER, Vector2i.ZERO, 4), "Reject out-of-bounds footprint and invalid rotation")
	_check(design.place(LASER, Vector2i(13, 9), 1), "Rotated laser fits flush to lower right edge")
	var laser := design.part_at(Vector2i(15, 9))
	_check(laser.size == Vector2i(3, 1) and laser.rotation == 1, "Selection resolves the full rotated footprint")
	_check(not design.place(ARMOR, Vector2i(14, 9)), "Reject overlap on a non-origin tile")
	_check(design.total_cost() == {"steel": 32, "coil": 12}, "Laser material recipe")
	_check(design.remove_at(Vector2i(14, 9)) and not design.remove_at(Vector2i(15, 9)), "Remove once from interior cell")
	_check(design.parts.is_empty() and design.total_cost().is_empty() and design.part_at(Vector2i(13, 9)).is_empty(), "Removal clears all occupied cells and material cost")


func _test_routes(design: Design) -> void:
	design.place(ARMOR, Vector2i(0, 0))
	design.place(ARMOR, Vector2i(2, 0))
	var left := int(design.part_at(Vector2i.ZERO).uid)
	var right := int(design.part_at(Vector2i(2, 0)).uid)
	_check(design.path_between(left, right).is_empty(), "No route through empty space")
	design.place(CORRIDOR, Vector2i(1, 0))
	_check(design.path_between(left, right) == [Vector2i(1, 0)], "Shared access cell gives one-tile route")
	for x in 3:
		design.place(CORRIDOR, Vector2i(x, 1))
	_check(design.path_between(left, right).size() == 1, "Multi-source BFS selects the shortest available route")
	design.remove_at(Vector2i(1, 0))
	_check(design.path_between(left, right) == [Vector2i(0, 1), Vector2i(1, 1), Vector2i(2, 1)], "Detour uses orthogonally adjacent corridor tiles")
	design.remove_at(Vector2i(1, 1))
	design.place(ARMOR, Vector2i(1, 1))
	_check(design.path_between(left, right).is_empty(), "Armor in corridor cannot relay movement")
	_check(design.path_between(left, 9999).is_empty(), "Unknown destination")


func _test_starter(design: Design) -> void:
	design.starter()
	_check(design.parts.size() == 16 and is_equal_approx(design.crew_speed, 3.2), "Starter modules, corridor and movement speed")
	var origin := int(design.part_at(Vector2i(3, 3)).uid)
	var target := int(design.part_at(Vector2i(11, 2)).uid)
	var path := design.path_between(origin, target)
	_check(path.size() == 8 and path.front() == Vector2i(4, 5) and path.back() == Vector2i(11, 5), "Starter reactor to laser route spans eight corridor tiles")
	var first_layout := design.serialize()
	design.starter()
	_check(design.serialize() == first_layout, "Starter reset is repeatable")
	_check(design.total_cost() == {"steel": 192, "coil": 136, "processor": 2, "enriched_uranium": 8}, "Starter material bill")
	for cell in [Vector2i(6, 3), Vector2i(7, 3), Vector2i(8, 3)]:
		_check(not design.path_between(origin, int(design.part_at(cell).uid)).is_empty(), "Reactor connects to crew or control at %s" % cell)


func _test_serialization(design: Design) -> void:
	var snapshot := design.serialize()
	var recovered := Design.new()
	_check(recovered.restore(JSON.parse_string(JSON.stringify(snapshot))), "Real JSON round trip accepts integral floats")
	_check(recovered.serialize() == snapshot and recovered.total_cost() == design.total_cost(), "Round trip preserves all IDs, geometry, materials and rotations")
	var cases: Array = [null, {}, {"parts": []}, {"version": 2, "parts": []}, {"version": 1, "parts": {}}]
	for patch in [{"id": "unknown"}, {"uid": 0}, {"uid": 1}, {"cell": [3, 3]}, {"cell": [1, 4.5]}, {"cell": [16, 1]}, {"rotation": -1}, {"rotation": true}, {"cell": [1]}]:
		var bad := snapshot.duplicate(true)
		bad.parts[-1].merge(patch, true)
		cases.append(bad)
	for bad in cases:
		_check(not recovered.restore(bad) and recovered.serialize() == snapshot, "Invalid save rejected atomically")
	var id := int(recovered.part_at(Vector2i(11, 2)).uid)
	var reactor_id := int(recovered.part_at(Vector2i(3, 3)).uid)
	_check(recovered.path_between(reactor_id, id).size() == 8, "Invalid restore leaves route index intact")
	_check(recovered.place(ARMOR, Vector2i.ZERO) and int(recovered.part_at(Vector2i.ZERO).uid) > 16, "Restored design allocates a fresh ID")
	_check(recovered.restore({"version": 1, "parts": []}) and recovered.parts.is_empty(), "Empty design is a valid save")


func _test_flight_starter(design: Design) -> void:
	design.flight_starter()
	var reactor: int = design.part_at(Vector2i(4,4)).uid
	var jets := 0
	for part in design.parts:
		if design.by_id[part.id].stats.has("nozzles"):
			jets += 1
			_check(not design.path_between(reactor,part.uid).is_empty(),"Reactor supplies mounted engine %d" % part.uid)
	_check(jets==4,"Four maneuvering modules on flight starter")
	var clone := Design.new()
	_check(clone.restore(JSON.parse_string(JSON.stringify(design.serialize()))) and clone.serialize()==design.serialize(),"Flight blueprint round trip preserves nozzle orientation")
