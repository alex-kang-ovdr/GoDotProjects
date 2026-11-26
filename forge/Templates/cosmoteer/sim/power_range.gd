extends RefCounted

## Fixed-step firing range. Times are seconds, distances are simulation units,
## and energy uses the raw battery resource quantity from the imported rules.
const CATALOG_PATH := "res://data/catalog.json"
const TICKS_PER_SECOND := 120
const DT := 1.0 / TICKS_PER_SECOND
const DEFAULT_ROUTE_LENGTH := 6.0
const DEFAULT_TARGET_DISTANCE := 120.0
const EVENT_LIMIT := 48
const REACTOR_ID := "cosmoteer.reactor_small"
const LASER_ID := "cosmoteer.laser_blaster_small"
const ARMOR_ID := "cosmoteer.armor"
const CORRIDOR_ID := "cosmoteer.corridor"

var reactor_capacity: int
var weapon_capacity: int
var armor_max_hp: float
var maximum_range: float
var crew_speed: float
var route_length := DEFAULT_ROUTE_LENGTH

var route_open := true
var gunner_active := true
var fire_enabled := true
var target_distance := DEFAULT_TARGET_DISTANCE
var elapsed := 0.0
var reactor_energy := 0
var weapon_energy := 0
var armor_hp := 0.0
var carrier_position := 0.0
var cargo := 0
var shots := 0
var hits := 0
var deliveries := 0
var projectiles: Array[Dictionary] = []
var events: Array[Dictionary] = []
var load_error := ""

var _reactor: Dictionary
var _laser: Dictionary
var _tick := 0
var _remainder := 0.0
var _generation_ticks := 0
var _ready_tick := 0
var _release_tick := -1


func _init() -> void:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		load_error = "%s: %s" % [CATALOG_PATH, error_string(FileAccess.get_open_error())]
	else:
		var json := JSON.new()
		if json.parse(file.get_as_text()) != OK:
			load_error = "%s line %d: %s" % [CATALOG_PATH, json.get_error_line(), json.get_error_message()]
		else:
			_configure_catalog(json.data)
	if not load_error.is_empty():
		push_error(load_error)


func _configure_catalog(catalog: Variant) -> void:
	var by_id := {}
	load_error = _validate_catalog(catalog, by_id)
	if not load_error.is_empty():
		load_error = "%s: %s. Check tools/extract_catalog.py and regenerate the catalog." % [CATALOG_PATH, load_error]
		return
	_reactor = by_id[REACTOR_ID].stats
	_laser = by_id[LASER_ID].stats
	reactor_capacity = int(_reactor.battery_capacity)
	weapon_capacity = int(_laser.battery_capacity)
	armor_max_hp = float(by_id[ARMOR_ID].max_health)
	maximum_range = float(_laser.range)
	crew_speed = float(catalog.crew.base_speed) * float(by_id[CORRIDOR_ID].crew_speed_factor)
	reset()


func _validate_catalog(catalog: Variant, by_id: Dictionary) -> String:
	if not catalog is Dictionary or not catalog.get("parts") is Array:
		return "expected a parts array"
	for i in catalog.parts.size():
		var part = catalog.parts[i]
		if not part is Dictionary or not part.get("id") is String:
			return "expected a part ID at parts[%d].id" % i
		if by_id.has(part.id):
			return "duplicate part ID %s" % part.id
		by_id[part.id] = part
	for id in [REACTOR_ID, LASER_ID, ARMOR_ID, CORRIDOR_ID]:
		if not by_id.has(id):
			return "missing part %s" % id
	var reactor = by_id[REACTOR_ID].get("stats")
	var laser = by_id[LASER_ID].get("stats")
	var errors := [
		_validate_values(reactor, REACTOR_ID + ".stats", ["battery_capacity", "production_quantity", "pickup_quantity"], true),
		_validate_values(reactor, REACTOR_ID + ".stats", ["production_interval"]),
		_validate_values(laser, LASER_ID + ".stats", ["battery_capacity", "battery_per_shot", "min_resources_used", "resupply_threshold"], true),
		_validate_values(laser, LASER_ID + ".stats", ["fire_interval", "damage", "range", "projectile_speed"]),
		_validate_values(laser, LASER_ID + ".stats", ["fire_delay"], false, true),
		_validate_values(by_id[ARMOR_ID], ARMOR_ID, ["max_health"]),
		_validate_values(by_id[CORRIDOR_ID], CORRIDOR_ID, ["crew_speed_factor"]),
		_validate_values(catalog.get("crew"), "crew", ["base_speed"]),
	]
	for error in errors:
		if not error.is_empty():
			return error
	if reactor.pickup_quantity > reactor.battery_capacity:
		return REACTOR_ID + ".stats.pickup_quantity exceeds battery_capacity"
	if laser.resupply_threshold > laser.battery_capacity:
		return LASER_ID + ".stats.resupply_threshold exceeds battery_capacity"
	if laser.min_resources_used > minf(laser.battery_capacity, laser.battery_per_shot):
		return LASER_ID + ".stats.min_resources_used exceeds battery_capacity or battery_per_shot"
	return ""


func _validate_values(record: Variant, location: String, fields: Array, whole := false, allow_zero := false) -> String:
	if not record is Dictionary:
		return "expected an object at %s" % location
	for field in fields:
		var value = record.get(field)
		var key := "%s.%s" % [location, field]
		if not (value is int or value is float) or not is_finite(float(value)):
			return "expected a finite number at %s" % key
		if value < 0 or (value == 0 and not allow_zero):
			return "invalid value %s at %s" % [value, key]
		if whole and (float(value) != floorf(value) or float(value) >= 9223372036854775808.0):
			return "expected a whole battery quantity at %s" % key
	return ""


func reset() -> void:
	route_open = true
	gunner_active = true
	fire_enabled = true
	target_distance = DEFAULT_TARGET_DISTANCE
	route_length = DEFAULT_ROUTE_LENGTH
	elapsed = 0.0
	reactor_energy = reactor_capacity
	weapon_energy = 0
	armor_hp = armor_max_hp
	carrier_position = 0.0
	cargo = 0
	shots = 0
	hits = 0
	deliveries = 0
	projectiles.clear()
	events.clear()
	_tick = 0
	_remainder = 0.0
	_generation_ticks = 0
	_ready_tick = 0
	_release_tick = -1


func set_route_open(value: bool) -> void:
	route_open = value


func set_gunner_active(value: bool) -> void:
	gunner_active = value
	if not value:
		_release_tick = -1


func set_fire_enabled(value: bool) -> void:
	fire_enabled = value
	if not value:
		_release_tick = -1


func set_target_distance(value: float) -> void:
	target_distance = maxf(0.0, value)
	if target_distance > maximum_range:
		_release_tick = -1


func status() -> String:
	if not load_error.is_empty():
		return "catalog_error"
	if armor_hp <= 0:
		return "finished"
	if not fire_enabled:
		return "hold"
	if not gunner_active:
		return "no_gunner"
	if target_distance > maximum_range:
		return "out_of_range"
	if weapon_energy < int(_laser.min_resources_used):
		return "starved"
	return "firing"


func step(seconds: float) -> void:
	if seconds <= 0.0 or not is_finite(seconds) or not load_error.is_empty():
		return
	_remainder += seconds
	var count := floori((_remainder + 1e-10) * TICKS_PER_SECOND)
	_remainder = maxf(0.0, _remainder - count * DT)
	for i in count:
		if armor_hp <= 0:
			break
		_tick += 1
		elapsed = _tick * DT
		_advance_projectiles()
		if armor_hp > 0:
			_generate()
			_transport()
			_fire()


func _generate() -> void:
	if reactor_energy >= reactor_capacity:
		_generation_ticks = 0
		return
	_generation_ticks += 1
	if _generation_ticks >= roundi(float(_reactor.production_interval) * TICKS_PER_SECOND):
		reactor_energy = mini(reactor_capacity, reactor_energy + int(_reactor.production_quantity))
		_generation_ticks = 0


func _transport() -> void:
	if not route_open:
		return
	var stride := crew_speed * DT / maxf(route_length, 0.01)
	if cargo == 0:
		if carrier_position > 0.0:
			carrier_position = move_toward(carrier_position, 0.0, stride)
			if carrier_position < 1e-9:
				carrier_position = 0.0
		if carrier_position > 0.0:
			return
		var pickup := int(_reactor.pickup_quantity)
		if reactor_energy < pickup or weapon_capacity - weapon_energy < int(_laser.resupply_threshold):
			return
		reactor_energy -= pickup
		cargo = pickup
		_record("pickup")
		return
	carrier_position = move_toward(carrier_position, 1.0, stride)
	if carrier_position >= 1.0 - 1e-9:
		carrier_position = 1.0
		# Battery.LoseExcessOnDelivery discards any overflow.
		weapon_energy = mini(weapon_capacity, weapon_energy + cargo)
		cargo = 0
		deliveries += 1
		_record("delivery")


func _fire() -> void:
	if status() != "firing":
		_release_tick = -1
		return
	if _release_tick < 0:
		if _tick >= _ready_tick:
			_release_tick = _tick + roundi(float(_laser.fire_delay) * TICKS_PER_SECOND)
			_ready_tick = _tick + roundi(float(_laser.fire_interval) * TICKS_PER_SECOND)
		else:
			return
	if _tick < _release_tick:
		return
	_release_tick = -1
	var spent := mini(weapon_energy, int(_laser.battery_per_shot))
	weapon_energy -= spent
	shots += 1
	# Armor inherits base_part.HealthType = Operational, unlike bare structure.
	var damage := float(_laser.damage) * spent / float(_laser.battery_per_shot)
	projectiles.append({
		"progress": 0.0, "distance": target_distance, "travelled": 0.0, "damage": damage
	})
	_record("shot")


func _advance_projectiles() -> void:
	for index in range(projectiles.size() - 1, -1, -1):
		var bolt := projectiles[index]
		bolt.travelled = float(bolt.travelled) + float(_laser.projectile_speed) * DT
		bolt.progress = minf(1.0, float(bolt.travelled) / maxf(0.001, float(bolt.distance)))
		if float(bolt.progress) < 1.0:
			continue
		projectiles.remove_at(index)
		if armor_hp <= 0:
			continue
		armor_hp = maxf(0.0, armor_hp - float(bolt.damage))
		hits += 1
		_record("hit")
		if armor_hp <= 0:
			_record("destroyed")


func _record(kind: String) -> void:
	events.append({"time": elapsed, "kind": kind})
	if events.size() > EVENT_LIMIT:
		events.pop_front()
