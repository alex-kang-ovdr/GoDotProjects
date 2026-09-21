## 전 플랫폼 공통 밸런스 SSOT. 게임 규칙 수치는 이 파일에서만 조정한다.
class_name Balance
extends RefCounted

const CELL := 42.0
const PLAYER := {"core_hp": 200.0, "module_limit": 18, "salvage_range": 420.0, "pickup_click_radius": 72.0}
const NAVIGATION := {"arrival_radius": 54.0, "slow_radius": 250.0, "turn_gain": 2.0, "cruise_throttle": 1.0, "approach_throttle": 0.42}
const SHIELD := {"max_layers": 5, "base_recharge": 6.0, "min_recharge": 1.8, "generator_coverage_mass": 20.0}
const WEAPONS := {
	"laser": {"cooldown": 0.28, "damage": 7.0, "speed": 720.0, "life": 2.25, "heat": 11.0},
	"machine_gun": {"damage": 4.0, "speed": 760.0, "life": 1.725, "ammo_cost": 1},
	"railgun": {"damage": 24.0, "speed": 1040.0, "life": 2.475, "ammo_cost": 4},
	"missile": {"cooldown": 0.72, "damage": 30.0, "speed": 460.0, "range": 1470.0, "life": 3.2, "ammo_cost": 2},
	"mini_missile": {"cooldown": 3.0, "damage": 12.0, "speed": 250.0, "lock_seconds": 2.0, "boost": 720.0, "max_speed": 860.0, "range":2175.0, "ammo_cost": 1},
}
const NPC_AI := {
	"state_tick_seconds": 0.066,
	"thrust_multiplier": 0.5,
	"weapon_range": 620.0,
	"contact_range": 560.0,
	"roam_radius": 460.0,
	"roam_arrival_radius": 70.0,
	"exclusion_grace_seconds": 5.0,
	"spawn_weights": {"roamer": 70, "aggressive": 20, "contact": 10},
	"archetypes": {
		"roamer": {"radar_range": 0.0, "contact": ""},
		"aggressive": {"radar_range": 760.0, "contact": ""},
		"contact_quest": {"radar_range": 0.0, "contact": "quest"},
		"contact_warning": {"radar_range": 0.0, "contact": "warning"},
		"boss": {"radar_range": 1200.0, "contact": ""}
	}
}
const GRAPPLE := {
	"max_range": 980.0,
	"hook_speed": 1600.0,
	"link_length": 36.0,
	"max_links": 30,
	"link_mass": 0.16,
	"link_damp": 6.0,
	"tension_slack": 3.0,
	"tension_stiffness": 1800.0,
	"tension_damping": 240.0,
	"max_tension_force": 42000.0,
	"break_slack": 420.0,
	"hp": 32.0,
	"hit_radius": 12.0
}
const WORLD := {
	"width": 190000.0, "height": 100000.0,
	"stations": [
		{"id":"kepler", "name":"KEPLER REPAIR DOCK", "position":Vector2(24000, 9000), "upgrade":"HULL +30"},
		{"id":"lyra", "name":"LYRA CONTROL TOWER", "position":Vector2(77000, 37000), "upgrade":"DAMAGE +2 · MISSILE LINK"},
		{"id":"perseus", "name":"PERSEUS REACTOR BAY", "position":Vector2(130000, 64000), "upgrade":"COOLING +12 · SHIELD"},
	],
	"bosses": [
		{"id":"rift", "name":"RIFT BREAKER", "position":Vector2(49000, 22000), "tier":4},
		{"id":"crown", "name":"CROWN EATER", "position":Vector2(104000, 49000), "tier":7},
		{"id":"warden", "name":"VOID WARDEN", "position":Vector2(157000, 73000), "tier":10},
	],
}
const MODULES := {
	"core": {"label":"CORE", "hp":100.0, "mass":2.0, "fill":"17365e", "stroke":"70ddff"},
	"armor": {"label":"PLATE", "hp":18.0, "mass":1.8, "fill":"334661", "stroke":"a9bed9"},
	"thruster": {"label":"MAIN DRIVE", "hp":14.0, "mass":1.1, "force":4750.0, "fill":"174a5a", "stroke":"62e7ff", "actuator":"forward"},
	"reverse_thruster": {"label":"REV DRIVE", "hp":9.0, "mass":0.65, "force":220.0, "fill":"4d3c55", "stroke":"e3a8ff", "actuator":"reverse"},
	"rcs_thruster": {"label":"RCS", "hp":8.0, "mass":0.5, "force":5400.0, "fill":"3a5a50", "stroke":"8cf0cd", "actuator":"turn"},
	"battery": {"label":"BATTERY", "hp":10.0, "mass":1.0, "fill":"3f4d5f", "stroke":"b9d8ff"},
	"laser": {"label":"LZR", "hp":12.0, "mass":1.2, "fill":"533052", "stroke":"ff92e8"},
	"missile_launcher": {"label":"MISSILE", "hp":16.0, "mass":1.65, "fill":"58402e", "stroke":"ffbd78"},
	"mini_missile_launcher": {"label":"TORPEDO", "hp":11.0, "mass":0.9, "fill":"4b4e35", "stroke":"d7ed8e"},
	"machine_gun": {"label":"MACHINE GUN", "hp":13.0, "mass":1.05, "fill":"3c4d63", "stroke":"9ebbe4"},
	"railgun": {"label":"RAILGUN", "hp":19.0, "mass":1.9, "fill":"4d3e62", "stroke":"d6b3ff"},
	"ammo_bay": {"label":"MISSILE BAY", "hp":24.0, "mass":2.2, "ammo":6, "capacity":6, "ammo_type":"missile", "fill":"5d5534", "stroke":"ffe18c"},
	"bullet_bay": {"label":"BULLET BAY", "hp":20.0, "mass":1.75, "ammo":36, "capacity":36, "ammo_type":"bullet", "fill":"3f554e", "stroke":"a8e7c5"},
	"shield_generator": {"label":"SHIELD GEN", "hp":22.0, "mass":1.8, "coverage_mass":20.0, "fill":"31576a", "stroke":"8eeaff"},
	"block": {"label":"BLOCK", "hp":20.0, "mass":1.9, "fill":"475968", "stroke":"b4d0df"},
	"beam2": {"label":"BEAM-2", "hp":34.0, "mass":3.35, "fill":"4b5d78", "stroke":"afc7ee", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"beam3": {"label":"BEAM-3", "hp":48.0, "mass":4.8, "fill":"516275", "stroke":"b4d5dc", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(2,0)]},
	"beam4": {"label":"BEAM-4", "hp":62.0, "mass":6.2, "fill":"564c68", "stroke":"d2b8ee", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(2,0), Vector2i(3,0)]},
	"plate4": {"label":"PLATE-4", "hp":74.0, "mass":7.1, "fill":"455966", "stroke":"b9d5dc", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"wedge": {"label":"WEDGE", "hp":15.0, "mass":1.25, "fill":"42615c", "stroke":"97e6d3", "shape":"triangle"},
	"wedge_long": {"label":"LONG WEDGE", "hp":26.0, "mass":2.35, "fill":"604b3e", "stroke":"f1bf94", "shape":"triangle-long", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
}

static var _part_tuning_cache: Dictionary = {}
static var _part_tuning_rows: Dictionary = {}
static var _part_tuning_overrides: Dictionary = {}
static var _part_tuning_loaded := false
const PART_TUNING_OVERRIDE_PATH := "user://part_tuning_overrides.csv"
static var part_tuning_headers := PackedStringArray(["id", "display_name", "description", "hull", "shield", "power", "weapon_type", "thrust", "reverse_thrust", "rcs_thrust", "ammo_type", "ammo", "capacity", "coverage_mass", "weapon_display_name", "weapon_display_desc", "mass", "material"])

static func module_spec(kind: String) -> Dictionary:
	var result: Dictionary = MODULES.get(kind, MODULES["block"]).duplicate(true)
	var tuning := part_tuning(kind)
	if tuning.is_empty():
		return result
	result["display_name"] = tuning.display_name
	result["description"] = tuning.description
	result["hull"] = tuning.hull
	result["mass"] = tuning.mass
	result["material"] = tuning.material
	result["shield"] = tuning.shield
	result["power"] = tuning.power
	result["weapon_type"] = tuning.weapon_type
	result["weapon_display_name"] = tuning.weapon_display_name
	result["weapon_display_desc"] = tuning.weapon_display_desc
	result["hp"] = tuning.hull
	if not str(tuning.ammo_type).is_empty():
		result["ammo_type"] = tuning.ammo_type
		result["ammo"] = tuning.ammo
		result["capacity"] = tuning.capacity
	if tuning.coverage_mass > 0.0:
		result["coverage_mass"] = tuning.coverage_mass
	match str(result.get("actuator", "")):
		"forward": result["force"] = tuning.thrust
		"reverse": result["force"] = tuning.reverse_thrust
		"turn": result["force"] = tuning.rcs_thrust
	return result

static func part_tuning(kind: String) -> Dictionary:
	if not _part_tuning_loaded:
		load_part_tuning()
	return _part_tuning_cache.get(kind, {})

static func load_part_tuning() -> void:
	_part_tuning_loaded = true
	_part_tuning_cache.clear()
	_part_tuning_rows.clear()
	_part_tuning_overrides.clear()
	var source_path := "res://data/part_tuning.csv"
	if not FileAccess.file_exists(source_path):
		source_path = "res://data/part_tuning_runtime.txt"
	if not FileAccess.file_exists(source_path):
		push_error("PART TUNING CSV와 런타임 사본을 열 수 없습니다.")
		return
	load_part_tuning_file(source_path, false)
	if FileAccess.file_exists(PART_TUNING_OVERRIDE_PATH):
		load_part_tuning_file(PART_TUNING_OVERRIDE_PATH, true)

static func load_part_tuning_file(path: String, is_override: bool) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	var headers := file.get_csv_line()
	while not file.eof_reached():
		var values := file.get_csv_line()
		if values.is_empty() or values[0].strip_edges().is_empty():
			continue
		var row := {}
		for index in mini(headers.size(), values.size()):
			row[headers[index]] = values[index].strip_edges()
		var id := str(row.get("id", ""))
		if id.is_empty():
			continue
		_part_tuning_rows[id] = row.duplicate(true)
		if is_override:
			_part_tuning_overrides[id] = row.duplicate(true)
		_part_tuning_cache[id] = parse_part_tuning_row(row)
	file.close()

static func parse_part_tuning_row(row: Dictionary) -> Dictionary:
	return {
			"display_name": str(row.get("display_name", row.get("id", ""))),
			"description": str(row.get("description", "")),
			"hull": csv_number(row.get("hull", "0")),
			"mass": csv_number(row.get("mass", "0")),
			"material": str(row.get("material", "standard")),
			"shield": csv_number(row.get("shield", "0")),
			"power": csv_number(row.get("power", "0")),
			"weapon_type": str(row.get("weapon_type", "none")),
			"weapon_display_name": str(row.get("weapon_display_name", "")),
			"weapon_display_desc": str(row.get("weapon_display_desc", "")),
			"thrust": csv_number(row.get("thrust", "0")),
			"reverse_thrust": csv_number(row.get("reverse_thrust", "0")),
			"rcs_thrust": csv_number(row.get("rcs_thrust", "0")),
			"ammo_type": str(row.get("ammo_type", "")),
			"ammo": int(csv_number(row.get("ammo", "0"))),
			"capacity": int(csv_number(row.get("capacity", "0"))),
			"coverage_mass": csv_number(row.get("coverage_mass", "0")),
		}

static func part_tuning_row(kind: String) -> Dictionary:
	if not _part_tuning_loaded:
		load_part_tuning()
	return _part_tuning_rows.get(kind, {}).duplicate(true)

static func save_part_tuning_override(kind: String, changes: Dictionary) -> bool:
	if not _part_tuning_loaded:
		load_part_tuning()
	var row: Dictionary = _part_tuning_rows.get(kind, {}).duplicate(true)
	if row.is_empty():
		return false
	for key in changes:
		row[str(key)] = str(changes[key])
	row["id"] = kind
	_part_tuning_rows[kind] = row
	_part_tuning_overrides[kind] = row.duplicate(true)
	_part_tuning_cache[kind] = parse_part_tuning_row(row)
	var file := FileAccess.open(PART_TUNING_OVERRIDE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_csv_line(part_tuning_headers)
	var ids: Array = _part_tuning_overrides.keys()
	ids.sort()
	for id in ids:
		var override_row: Dictionary = _part_tuning_overrides[id]
		var values := PackedStringArray()
		for header in part_tuning_headers:
			values.append(str(override_row.get(header, "")))
		file.store_csv_line(values)
	file.close()
	return true

static func csv_number(value: Variant) -> float:
	return str(value).to_float()
