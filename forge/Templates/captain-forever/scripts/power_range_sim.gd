class_name PowerRangeSim
extends RefCounted

## 코스모티어 실험 조종석 120Hz 고정 스텝 전력 보급 사격장 시뮬레이터.
## 원본 추출 데이터(res://assets/cosmoteer/data/catalog.json)의 반응로·복도·승무원·레이저 규칙을 그대로 구동하며,
## 조종석 무장 프리셋(소형 레이저 / 대형 레이저 / 교란기 EMP) 전환도 지원한다.

const CATALOG_PATH := "res://assets/cosmoteer/data/catalog.json"
const TICKS_PER_SECOND := 120
const DT := 1.0 / TICKS_PER_SECOND
const DEFAULT_ROUTE_LENGTH := 6.0
const DEFAULT_TARGET_DISTANCE := 120.0
const EVENT_LIMIT := 48
const REACTOR_ID := "cosmoteer.reactor_small"
const LASER_ID := "cosmoteer.laser_blaster_small"
const ARMOR_ID := "cosmoteer.armor"
const CORRIDOR_ID := "cosmoteer.corridor"

const WEAPON_PRESETS := {
	"cosmoteer.laser_blaster_small": {"name": "소형 레이저", "shot_sprite": "shot_laser_small", "sfx": "shot_laser"},
	"cosmoteer.laser_blaster_large": {"name": "대형 레이저", "shot_sprite": "shot_laser_large", "sfx": "shot_heavy_laser", "battery_capacity": 6000, "resupply_threshold": 1000, "battery_per_shot": 600, "min_resources_used": 200, "fire_interval": 1.35, "fire_delay": 0.35, "damage": 1400.0, "range": 320.0, "projectile_speed": 440.0},
	"cosmoteer.disruptor": {"name": "교란기 EMP", "shot_sprite": "shot_disruptor", "sfx": "shot_disruptor", "battery_capacity": 4000, "resupply_threshold": 1000, "battery_per_shot": 400, "min_resources_used": 200, "fire_interval": 0.95, "fire_delay": 0.25, "damage": 900.0, "range": 270.0, "projectile_speed": 360.0},
}

var active_weapon_id := LASER_ID
var active_weapon_name := "소형 레이저"
var reactor_capacity: int = 8000
var weapon_capacity: int = 2000
var armor_max_hp: float = 4000.0
var maximum_range: float = 240.0
var crew_speed: float = 2.0
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
var last_event_kind := ""

var _by_id: Dictionary = {}
var _reactor: Dictionary = {}
var _laser: Dictionary = {}
var _tick := 0
var _remainder := 0.0
var _generation_ticks := 0
var _ready_tick := 0
var _release_tick := -1

func _init() -> void:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		load_error = "%s: %s" % [CATALOG_PATH, error_string(FileAccess.get_open_error())]
		return
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		load_error = "%s line %d: %s" % [CATALOG_PATH, json.get_error_line(), json.get_error_message()]
		return
	_configure_catalog(json.data)

func _configure_catalog(catalog: Variant) -> void:
	if not (catalog is Dictionary) or not ((catalog as Dictionary).get("parts") is Array):
		load_error = "invalid catalog.json parts array"
		return
	_by_id.clear()
	for part in catalog.parts:
		if part is Dictionary and part.has("id"):
			_by_id[str(part.id)] = part
	for req in [REACTOR_ID, LASER_ID, ARMOR_ID, CORRIDOR_ID]:
		if not _by_id.has(req):
			load_error = "missing part %s" % req
			return
	_reactor = (_by_id[REACTOR_ID].stats as Dictionary).duplicate(true)
	reactor_capacity = int(_reactor.battery_capacity)
	armor_max_hp = float(_by_id[ARMOR_ID].max_health)
	crew_speed = float(catalog.crew.base_speed) * float(_by_id[CORRIDOR_ID].crew_speed_factor)
	select_weapon(LASER_ID)

func select_weapon(weapon_id: String) -> void:
	if not WEAPON_PRESETS.has(weapon_id):
		weapon_id = LASER_ID
	active_weapon_id = weapon_id
	var preset: Dictionary = WEAPON_PRESETS[weapon_id]
	active_weapon_name = str(preset.name)
	if weapon_id == LASER_ID and _by_id.has(LASER_ID):
		_laser = (_by_id[LASER_ID].stats as Dictionary).duplicate(true)
	else:
		_laser = preset.duplicate(true)
	weapon_capacity = int(_laser.battery_capacity)
	maximum_range = float(_laser.range)
	reset()

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
	last_event_kind = ""
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
	if armor_hp <= 0.0:
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

func pop_last_event_kind() -> String:
	var k := last_event_kind
	last_event_kind = ""
	return k

func step(seconds: float) -> void:
	if seconds <= 0.0 or not is_finite(seconds) or not load_error.is_empty():
		return
	_remainder += seconds
	var count := floori((_remainder + 1e-10) * TICKS_PER_SECOND)
	_remainder = maxf(0.0, _remainder - count * DT)
	for _i in count:
		if armor_hp <= 0.0:
			break
		_tick += 1
		elapsed = _tick * DT
		_advance_projectiles()
		if armor_hp > 0.0:
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
	var damage := float(_laser.damage) * float(spent) / float(_laser.battery_per_shot)
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
		if armor_hp <= 0.0:
			continue
		armor_hp = maxf(0.0, armor_hp - float(bolt.damage))
		hits += 1
		_record("hit")
		if armor_hp <= 0.0:
			_record("destroyed")

func _record(kind: String) -> void:
	last_event_kind = kind
	events.append({"time": elapsed, "kind": kind})
	if events.size() > EVENT_LIMIT:
		events.pop_front()
