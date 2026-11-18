extends RefCounted
## Native simulation port of games/fortress-blue/Web/engine.js.
## Physics coefficients are prototype tuning, independent of catalog provenance.

const WIDTH = 1800
const HEIGHT = 820
const HALF_W = 18
const HALF_H = 14
const FIXED_DT = 1.0 / 120.0
const UINT_MASK = 0xffffffff
const CATALOG_PATH = "res://data/catalog.json"
const DEFAULTS = {
	"gravity": 320, "windAcceleration": 9, "maxLaunchSpeed": 1050,
	"minLaunchSpeed": 90, "damageScale": 0.75, "terrainScale": 1, "turnTime": 25,
	"movementPixelsPerUnit": 2, "moveSpeed": 88, "tankGravity": 520,
	"collisionStep": 1, "maxFlightTime": 12, "maxResolutionTime": 17,
}
const TUNING_LIMITS = {
	"gravity": [20, 1600], "windAcceleration": [0, 60], "maxLaunchSpeed": [200, 2000],
	"damageScale": [0.05, 4], "terrainScale": [0.1, 3], "turnTime": [5, 90],
	"collisionStep": [0.5, 1], "movementPixelsPerUnit": [0.25, 6], "moveSpeed": [20, 220],
	"tankGravity": [40, 2000], "maxFlightTime": [2, 20],
}

static var _catalog_data: Dictionary
var data: Dictionary
var config: Dictionary
var tuning: Dictionary
var profile: Dictionary
var catalog: Array
var terrain: Dictionary
var state: Dictionary
var _random_state: int
var _on_event: Callable
var _turn_limit: float
var _max_round: int
var _sudden_round: int
var _accumulator := 0.0
var _launch_queue: Array = []
var _acted: Dictionary = {}
var _transition_left := 0.0
var _resolution_time := 0.0
var _settling_time := 0.0
var _teleport_armed := false
var _turn_extra_delay := 0.0
var _turn_time_used := 0.0
var _move_spent := 0.0
var _shot_delay := 0.0
var _schedule_clock := 0.0
var _trajectory_cache: Dictionary = {}
var _volley_counter := 0
var _shot_counter := 0
var _action: Dictionary = {}
var _hazard_terrain_version := 1
var _ai_wait := 0.0
var _ai_search: Dictionary = {}
var _ai_plan: Dictionary = {}
var _stats := {"shots": 0, "explosions": 0, "damage": 0, "turns": 0, "terrainRemoved": 0}


func _init(options: Dictionary = {}) -> void:
	if _catalog_data.is_empty():
		_catalog_data = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATH))
	data = _catalog_data
	config = {"profile": "classic", "map": "highlands", "teamSize": 2, "playerTank": "catapult",
		"opponentTank": "cannon", "control": "ai", "difficulty": "normal", "seed": 123}
	config.merge(options, true)
	config.profile = "blue3" if config.profile == "blue3" else "classic"
	var angle_profiles = data.aiming.angleProfiles
	if not angle_profiles.has(config.get("angleProfile")):
		config.angleProfile = data.aiming.defaultAngleProfile
	config.teamSize = 4 if config.profile == "blue3" else _finite(config.teamSize, 2)
	if config.teamSize != 1 and config.teamSize != 2 and config.teamSize != 4:
		config.teamSize = 2
	config.teamSize = int(config.teamSize)
	config.control = "hotseat" if config.control == "hotseat" else "ai"
	config.seed = int(_finite(config.seed, 123)) & UINT_MASK
	var callback = options.get("onEvent")
	if callback is Callable:
		_on_event = callback
	_random_state = _seed(config.seed)
	var overrides = options.get("tuning")
	if not overrides is Dictionary:
		overrides = {}
	tuning = DEFAULTS.duplicate()
	tuning.merge(data.tuningDefaults, true)
	tuning.merge(overrides, true)
	for key in DEFAULTS:
		tuning[key] = _finite(tuning[key], DEFAULTS[key])
	for key in TUNING_LIMITS:
		tuning[key] = clampf(tuning[key], TUNING_LIMITS[key][0], TUNING_LIMITS[key][1])
	tuning.minLaunchSpeed = clampf(tuning.minLaunchSpeed, 10, tuning.maxLaunchSpeed - 10)
	tuning.maxResolutionTime = clampf(tuning.maxResolutionTime, tuning.maxFlightTime + 2, 25)
	profile = _find_by(data.profiles, "id", config.profile)
	_turn_limit = tuning.turnTime if overrides.has("turnTime") else clampf(_finite(profile.get("turnLimit"), tuning.turnTime), 5, 90)
	_max_round = 10 if config.profile == "blue3" else int(clampf(_finite(profile.get("maxRound"), 24), 6, 50))
	_sudden_round = 8 if config.profile == "blue3" else int(clampf(_finite(profile.get("suddenDeathRound"), 14), 3, _max_round))
	catalog = data.catalogs[config.profile]
	terrain = _make_terrain(str(config.map), config.seed)
	state = {"phase": "transition", "paused": false, "tanks": [], "activeId": null, "round": 1,
		"turnNumber": 0, "wind": 0, "timeLeft": _turn_limit, "projectiles": [], "winner": null,
		"simTime": 0.0, "power": 65, "weaponIndex": 0, "feed": [], "turnOrder": [],
		"suddenDeath": false, "mines": [], "hazards": [], "endReason": null, "itemUsed": false, "lastAction": null}
	_spawn_teams()
	_begin_next_turn()


static func _finite(value, fallback):
	if value is float or value is int:
		return value if is_finite(float(value)) else fallback
	if value is String and value.is_valid_float():
		var number = value.to_float()
		return number if is_finite(number) else fallback
	return fallback


static func _find_by(entries: Array, key: String, value):
	for entry in entries:
		if entry.get(key) == value:
			return entry
	return null


static func _seed(value: int) -> int:
	return value if value != 0 else 0x9e3779b9


static func _next_random(value: int) -> int:
	value ^= (value << 13) & UINT_MASK
	value ^= value >> 17
	value ^= (value << 5) & UINT_MASK
	return value


func _random() -> float:
	_random_state = _next_random(_random_state)
	return _random_state / 4294967296.0


static func _dist(a: Dictionary, b: Dictionary) -> float:
	return sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)


static func _make_terrain(map_id: String, seed_value: int) -> Dictionary:
	var mask := PackedByteArray()
	mask.resize(WIDTH * HEIGHT)
	var phase = _next_random(_seed(seed_value ^ 0x79a3c61b)) / 4294967296.0 * TAU
	var solid_count := 0
	var islands = [[45, 365], [420, 800], [865, 1230], [1290, 1760]]
	for x in WIDTH:
		var top: float
		var bottom: float
		match map_id:
			"islands":
				var island: Array = []
				for bounds in islands:
					if x >= bounds[0] and x <= bounds[1]:
						island = bounds
						break
				if island.is_empty():
					continue
				var u = float(x - island[0]) / (island[1] - island[0])
				top = 530 + sin(x / 145.0 + phase) * 35 + cos(u * TAU) * 20
				bottom = top + 95 + sin(u * PI) * 70
			"foundry":
				if (x > 795 and x < 845) or (x > 1180 and x < 1220):
					continue
				top = 480 + (floori(x / 225.0) % 3) * 55 + sin(x / 70.0) * 6
				bottom = 720
			_:
				top = 530 + sin(x / 205.0 + phase) * 48 + sin(x / 71.0) * 16
				bottom = 735 + sin(x / 315.0) * 16
		var first = clampi(roundi(top), 360, 640)
		var last = clampi(roundi(bottom), first + 50, HEIGHT - 50)
		for y in range(first, last + 1):
			mask[y * WIDTH + x] = 1
		solid_count += last - first + 1
	return {"width": WIDTH, "height": HEIGHT, "mask": mask, "version": 1,
		"mapId": map_id, "seed": seed_value, "solidCount": solid_count}


func solid(x: float, y: float) -> bool:
	var xx = floori(x)
	var yy = floori(y)
	return xx >= 0 and xx < WIDTH and yy >= 0 and yy < HEIGHT and terrain.mask[yy * WIDTH + xx] != 0


func surface_at(x: float, from_y: float = 0.0):
	var xx = floori(x)
	if xx < 0 or xx >= WIDTH:
		return null
	var mask: PackedByteArray = terrain.mask
	for y in range(maxi(0, floori(from_y)), HEIGHT):
		if mask[y * WIDTH + xx] != 0:
			return y
	return null


func active():
	return _find_by(state.tanks, "uid", state.activeId)


func _emit(type: String, values: Dictionary = {}) -> void:
	var event = {"type": type, "simTime": state.simTime}
	event.merge(values, true)
	if not event.has("sourceTeam") and type in ["shot", "explosion", "item", "heal"]:
		event.sourceTeam = event.get("team")
	if not event.has("targetTeam") and type in ["damage", "death", "heal"]:
		event.targetTeam = event.get("team")
	if event.get("text", "") != "":
		state.feed.push_back(event)
		if state.feed.size() > 14:
			state.feed.pop_front()
	if _on_event.is_valid():
		_on_event.call(event)


func _spawn_teams() -> void:
	var count: int = config.teamSize
	for team in 2:
		var wanted = config.playerTank if team == 0 else config.opponentTank
		var preferred = _find_by(catalog, "id", wanted)
		if preferred == null:
			preferred = catalog[team % catalog.size()]
		for i in count:
			var definition = catalog[(catalog.find(preferred) + i) % catalog.size()]
			var x = (1330.0 if team else 470.0) if count == 1 else (1040 if team else 190) + (i + 0.5) * (570.0 / count)
			x = _find_spawn(x + (_random() - 0.5) * 36)
			var surface = surface_at(x)
			var hp = maxf(1, _finite(definition.get("hp"), 950))
			var delay = maxf(100, _finite(definition.get("delay"), 550))
			var movement = clampf(_finite(definition.get("movement"), 40) * tuning.movementPixelsPerUnit, 15, 220)
			var aim = _resolve_aiming({"def": definition, "typeId": definition.id}, definition.weapons[0])
			state.tanks.push_back({"uid": "t%d_%d" % [team, i], "typeId": definition.id, "name": definition.get("name", definition.id),
				"team": team, "x": x, "y": (540 if surface == null else surface) - HALF_H, "vx": 0.0, "vy": 0.0,
				"hp": hp, "maxHp": hp, "angle": clampf(45, aim.min, aim.max), "face": -1 if team else 1,
				"tilt": 0.0, "alive": true, "delay": delay, "nextDelay": delay + i * 7 + team * 3,
				"moveLeft": movement, "maxMove": movement, "status": {},
				"inventory": {"repair": 1, "shield": 1, "double": 1, "teleport": 1}, "def": definition})
	for tank in state.tanks:
		_update_tilt(tank)


func _find_spawn(desired: float) -> float:
	for offset in range(0, 450, 8):
		for direction in [1, -1]:
			var x = clampf(desired + offset * direction, 35, WIDTH - 35)
			if surface_at(x) == null or surface_at(x - 12) == null or surface_at(x + 12) == null:
				continue
			var separated = true
			for tank in state.tanks:
				if absf(tank.x - x) <= 48:
					separated = false
					break
			if separated:
				return x
	return clampf(desired, 35, WIDTH - 35)


func _weapons(tank) -> Array:
	if tank == null:
		return []
	return tank.def.weapons.slice(0, 4 if config.profile == "blue3" else 2)


func _weapon(tank, index: int):
	var weapons = _weapons(tank)
	return weapons[index] if index >= 0 and index < weapons.size() else null


func _available(weapon) -> bool:
	return weapon != null and _finite(weapon.get("unlockRound"), 1) <= state.round


func _behavior(weapon) -> Dictionary:
	weapon = {} if weapon == null else weapon
	var behavior = weapon.get("behavior", {})
	var shield = weapon.get("kind") == "shield"
	var role = weapon.get("role", behavior.get("role", "support" if shield else "attack"))
	return {"role": "support" if role == "support" else "attack",
		"delivery": weapon.get("delivery", "self" if shield else "projectile"),
		"trajectory": "linear" if behavior.get("trajectory") == "linear" else "ballistic",
		"bounces": clampi(roundi(_finite(behavior.get("bounces"), 0)), 0, 5),
		"restitution": clampf(_finite(behavior.get("restitution"), 0.72), 0.1, 0.95),
		"lifeSteal": clampf(_finite(behavior.get("lifeSteal"), 0), 0, 1),
		"repeatable": role != "support" and behavior.get("repeatable", true) != false,
		"homingTarget": "enemy" if behavior.get("homingTarget") == "enemy" else "all",
		"aimMin": behavior.get("aimMin"), "aimMax": behavior.get("aimMax")}


func _resolve_aiming(tank: Dictionary, weapon) -> Dictionary:
	var definition = tank.def
	var behavior = _behavior(weapon)
	var spec = data.aiming
	var is_classic = config.profile == "classic"
	var angle_profile_id = config.angleProfile if is_classic else "blue3_catalog"
	var angle_profile = spec.angleProfiles.get(angle_profile_id, {})
	var bounds = angle_profile.get("bounds", {}).get(tank.get("typeId", definition.id), {})
	var known_min = _finite(bounds.get("min"), null)
	var known_max = _finite(bounds.get("max"), null)
	var complete = known_min != null and known_max != null and known_min <= known_max
	var weapon_min = _finite(behavior.aimMin, null)
	var weapon_max = _finite(behavior.aimMax, null)
	var weapon_override = weapon_min != null or weapon_max != null
	var minimum = clampf(_finite(weapon_min, _finite(known_min, _finite(definition.get("aimMin"), 0))), -85, 90)
	var maximum = clampf(_finite(weapon_max, _finite(known_max, _finite(definition.get("aimMax"), 85))), minimum, 90)
	var catalog_refs: Array = []
	var catalog_has_source = false
	var catalog_reported = true
	for source in definition.get("provenance", {}).get("statSources", []):
		if source.field in ["aimMin", "aimMax"]:
			catalog_has_source = true
			catalog_reported = catalog_reported and source.status == "source_reported"
			for ref in source.get("sourceRefs", []):
				if ref not in catalog_refs:
					catalog_refs.append(ref)
	var angle_status = "simulation_assumption"
	if not weapon_override:
		if complete:
			angle_status = bounds.get("status", angle_profile.get("status", "source_reported"))
		elif angle_profile.is_empty() and catalog_has_source and catalog_reported:
			angle_status = "source_reported"
	var defaults = spec.powerDefaults
	var tank_runtime = definition.get("aimingRuntime", {})
	var weapon_runtime = weapon.get("aimingRuntime") if weapon != null else null
	if weapon_runtime == null:
		weapon_runtime = {}
	var runtime = func(key, fallback):
		return _finite(weapon_runtime.get(key), _finite(tank_runtime.get(key), fallback))
	var power_min = clampf(runtime.call("powerMin", _finite(defaults.get("min"), 0)), 0, 100)
	var power_max = clampf(runtime.call("powerMax", _finite(defaults.get("max"), 100)), power_min, 100)
	var step = _finite(defaults.get("step"), 1)
	var power_override = false
	for key in ["powerMin", "powerMax", "chargeRate"]:
		power_override = power_override or runtime.call(key, null) != null
	return {"min": minimum, "max": maximum, "powerMin": power_min, "powerMax": power_max,
		"powerStep": clampf(step if step > 0 else 1, 0.001, 100),
		"chargeRate": maxf(0, runtime.call("chargeRate", _finite(defaults.get("chargeRate"), 72))),
		"chargeCycle": "clamp" if defaults.get("cycle") == "clamp" else "ping_pong",
		"angleProfileId": angle_profile_id, "angleProfileStatus": angle_status,
		"angleProfileLabel": angle_profile.get("label", "JP 2003") if is_classic else "BLUE3 구현값",
		"angleFallbackApplied": not is_classic or not complete or weapon_override,
		"angleSourceRefs": [] if weapon_override else (bounds.get("sourceRefs", []) if complete else catalog_refs),
		"powerStatus": "simulation_assumption" if power_override else defaults.get("status", "simulation_assumption"),
		"velocityScale": maxf(0, runtime.call("velocityScale", 1)),
		"gravityScale": maxf(0, runtime.call("gravityScale", 1)),
		"windScale": maxf(0, runtime.call("windScale", 1))}


static func _normalize_power(value, aim: Dictionary) -> float:
	var power = clampf(_finite(value, 65), aim.powerMin, aim.powerMax)
	if power <= aim.powerMin or power >= aim.powerMax:
		return power
	var stepped = aim.powerMin + roundf((power - aim.powerMin) / aim.powerStep) * aim.powerStep
	return clampf(snappedf(stepped, 0.00000001), aim.powerMin, aim.powerMax)


static func _direction_to_world(tank: Dictionary, x: float, y: float):
	var dx = x - tank.x
	var dy = y - (tank.y - 4)
	if dx * dx + dy * dy < 1e-18:
		return null
	var local_x = cos(tank.tilt) * dx + sin(tank.tilt) * dy
	var local_y = -sin(tank.tilt) * dx + cos(tank.tilt) * dy
	return {"face": tank.face if absf(local_x) < 1e-9 else (-1 if local_x < 0 else 1),
		"angle": rad_to_deg(atan2(-local_y, absf(local_x)))}


func get_aiming_state():
	var tank = active()
	if tank == null:
		return null
	var weapon = _weapon(tank, state.weaponIndex)
	var aim = _resolve_aiming(tank, _teleport_weapon(weapon) if _teleport_armed else weapon)
	aim.localAngle = clampf(tank.angle, aim.min, aim.max)
	aim.terrainAngle = rad_to_deg(-tank.face * tank.tilt)
	aim.actualElevation = aim.localAngle + aim.terrainAngle
	aim.face = tank.face
	aim.power = _normalize_power(state.power, aim)
	return aim


func get_charge_power(elapsed_seconds):
	var aim = get_aiming_state()
	if aim == null:
		return null
	var span = aim.powerMax - aim.powerMin
	if span <= 0 or aim.chargeRate == 0:
		return aim.powerMin
	var elapsed = maxf(0, _finite(elapsed_seconds, 0))
	var progress = minf(span, elapsed * aim.chargeRate) if aim.chargeCycle == "clamp" else fmod(elapsed, 2 * span / aim.chargeRate) * aim.chargeRate
	return _normalize_power(aim.powerMin + (progress if progress <= span else 2 * span - progress), aim)


func set_aim_at_world(x, y) -> bool:
	x = _finite(x, null)
	y = _finite(y, null)
	if not is_human_turn() or x == null or y == null:
		return false
	var tank = active()
	var direction = _direction_to_world(tank, x, y)
	if direction == null:
		return false
	var aim = get_aiming_state()
	tank.face = direction.face
	tank.angle = clampf(direction.angle, aim.min, aim.max)
	return true


func _attack_multiplier(tank: Dictionary) -> float:
	var value = _finite(tank.status.get("attackBuff", {}).get("multiplier"), 1)
	for passive in tank.def.get("passives", []):
		if passive.id == "low_hp_attack_boost" and tank.hp <= tank.maxHp * _finite(passive.get("hpRatioAtMost"), 0.5):
			value *= clampf(_finite(passive.get("attackMultiplier"), 1), 0.1, 4)
	return value


static func _teleport_weapon(weapon) -> Dictionary:
	var result = weapon.duplicate() if weapon != null else {}
	result.merge({"kind": "teleport", "attack": 0, "radius": 0, "terrainRadius": 0, "shots": 1,
		"spread": 0, "role": "support", "delivery": "projectile", "effect": null, "aimingRuntime": null,
		"behavior": {"trajectory": "ballistic", "bounces": 0, "lifeSteal": 0, "role": "support",
			"repeatable": false, "homingTarget": "enemy"}}, true)
	return result


func get_action_preview():
	var tank = active()
	if tank == null:
		return null
	var weapon = _weapon(tank, state.weaponIndex)
	var behavior = _behavior(weapon)
	var aim = get_aiming_state()
	var role = "support" if _teleport_armed else behavior.role
	var delivery = "projectile" if _teleport_armed else behavior.delivery
	var repeat = 1
	if not _teleport_armed and behavior.repeatable and delivery != "self":
		repeat = maxi(3 if config.profile == "blue3" and state.suddenDeath else 1,
			clampi(tank.status.get("double", 1), 1, 3))
	var shots = 0 if delivery == "self" else (1 if _teleport_armed else clampi(roundi(_finite(weapon.get("shots"), 1)), 1, 12)) * repeat
	var can_fire = is_human_turn() and _available(weapon)
	var reason = null
	if not can_fire:
		if not _available(weapon):
			reason = "locked_weapon"
		elif state.paused:
			reason = "paused"
		else:
			reason = "ai_turn" if state.phase == "aim" else state.phase
	return {"canFire": can_fire, "reason": reason, "ownerId": tank.uid, "team": tank.team, "tankName": tank.name,
		"weaponId": "item_teleport" if _teleport_armed else weapon.id,
		"weaponName": "이동탄" if _teleport_armed else weapon.name,
		"kind": "teleport" if _teleport_armed else weapon.kind, "role": role, "delivery": delivery, "isSupport": role == "support",
		"angle": aim.localAngle, "localAngle": aim.localAngle, "terrainAngle": aim.terrainAngle,
		"actualElevation": aim.actualElevation, "power": aim.power, "face": tank.face, "wind": state.wind,
		"aimMin": aim.min, "aimMax": aim.max, "repeat": repeat, "shots": shots, "projectileCount": shots,
		"powerMin": aim.powerMin, "powerMax": aim.powerMax, "powerStep": aim.powerStep,
		"chargeRate": aim.chargeRate, "chargeCycle": aim.chargeCycle, "angleProfileId": aim.angleProfileId,
		"angleProfileStatus": aim.angleProfileStatus, "angleFallbackApplied": aim.angleFallbackApplied,
		"powerStatus": aim.powerStatus, "itemUsed": state.itemUsed,
		"doubleArmed": tank.status.has("double"), "teleportArmed": _teleport_armed}


func _action_payload(reason = null) -> Dictionary:
	var payload: Dictionary = {}
	for key in ["volleyId", "ownerId", "team", "tankName", "weaponName", "weaponId", "role", "delivery",
			"angle", "power", "face", "wind", "localAngle", "terrainAngle", "actualElevation", "aimMin", "aimMax",
			"powerMin", "powerMax", "powerStep", "angleProfileId", "angleProfileStatus", "powerStatus",
			"damageToEnemy", "friendlyDamage", "kills", "heal", "terrainRemoved", "isSupport"]:
		payload[key] = _action[key]
	payload.sourceTeam = _action.team
	payload.shots = _action.releasedShots if _action.ended else _action.shots
	payload.hits = _action.hitTargets.size()
	payload.reason = reason
	return payload


func _start_action(preview: Dictionary) -> void:
	_volley_counter += 1
	_action = preview.duplicate()
	_action.merge({"volleyId": "v%d" % _volley_counter, "releasedShots": 0, "damageToEnemy": 0,
		"friendlyDamage": 0, "kills": 0, "heal": 0, "terrainRemoved": 0, "hitTargets": {},
		"impacts": 0, "misses": 0, "ended": false, "outcome": "support" if preview.delivery == "self" else null})
	_emit("actionStart", _action_payload())


func _end_action() -> void:
	if _action.is_empty() or _action.ended:
		return
	_action.ended = true
	var outcome = _action.outcome
	if outcome == null:
		outcome = "hit" if _action.damageToEnemy > 0 or _action.friendlyDamage > 0 else ("terrain" if _action.impacts else "miss")
	var payload = _action_payload(outcome)
	state.lastAction = payload.duplicate()
	_emit("actionEnd", payload)
	_action = {}


static func _projectile_context(projectile: Dictionary) -> Dictionary:
	return {"shotId": projectile.get("shotId"), "volleyId": projectile.get("volleyId"),
		"ownerId": projectile.get("ownerId"), "sourceTeam": projectile.team, "triggered": projectile.get("triggered", false)}


func _is_action_shot(projectile: Dictionary) -> bool:
	return not _action.is_empty() and _action.volleyId == projectile.get("volleyId")


func is_human_turn() -> bool:
	if state.phase != "aim" or state.paused:
		return false
	var tank = active()
	return tank != null and tank.alive and (config.control == "hotseat" or tank.team == 0)


func set_angle(value) -> bool:
	value = _finite(value, null)
	if not is_human_turn() or value == null:
		return false
	var aim = get_aiming_state()
	active().angle = clampf(value, aim.min, aim.max)
	return true


func set_power(value) -> bool:
	value = _finite(value, null)
	if not is_human_turn() or value == null:
		return false
	state.power = _normalize_power(value, get_aiming_state())
	return true


func set_facing(value) -> bool:
	if not is_human_turn() or value not in [-1, 1]:
		return false
	active().face = value
	return true


func set_weapon(index) -> bool:
	if not is_human_turn() or not (index is int or index is float) or not is_finite(float(index)) or int(index) != index:
		return false
	var tank = active()
	if not _available(_weapon(tank, index)):
		return false
	state.weaponIndex = int(index)
	var aim = get_aiming_state()
	tank.angle = aim.localAngle
	state.power = aim.power
	return true


func set_paused(value: bool) -> bool:
	if state.phase == "gameover":
		return false
	state.paused = value
	return true


func move(direction, dt) -> bool:
	if not is_human_turn():
		return false
	var tank = active()
	var dir = signf(_finite(direction, 0))
	if dir == 0 or tank.get("_boundThisTurn", false) or tank.moveLeft <= 0:
		return false
	var budget = minf(tank.moveLeft, tuning.moveSpeed * clampf(_finite(dt, 0), 0, 0.2))
	if budget <= 0:
		return false
	tank.face = dir
	var moved = 0.0
	while budget > 0.001:
		var step = minf(1, budget)
		var nx = tank.x + dir * step
		if nx < HALF_W or nx > WIDTH - HALF_W or _tank_blocks(tank, nx, 27) or solid(nx + dir * 10, tank.y - 9):
			break
		var ground = surface_at(nx, maxf(0, tank.y + HALF_H - 18))
		tank.x = nx
		if ground != null and ground <= tank.y + HALF_H + 22:
			tank.y = ground - HALF_H
			tank.vy = 0
		moved += step
		budget -= step
	tank.moveLeft = maxf(0, tank.moveLeft - moved)
	_move_spent += moved
	_update_tilt(tank)
	_trigger_mines()
	return moved > 0


func _tank_blocks(tank: Dictionary, x: float, y_tolerance: float) -> bool:
	for other in state.tanks:
		if other.alive and not is_same(other, tank) and absf(other.x - x) < 31 and absf(other.y - tank.y) < y_tolerance:
			return true
	return false


func use_item(id: String) -> bool:
	return is_human_turn() and _use_item_internal(id)


func can_use_item(id: String) -> bool:
	return is_human_turn() and _can_use_item_internal(id)


func _can_use_item_internal(id: String) -> bool:
	var tank = active()
	if id not in ["repair", "shield", "double", "teleport"] or tank == null or not tank.alive or state.itemUsed:
		return false
	if state.phase != "aim" or state.paused or tank.inventory.get(id, 0) <= 0:
		return false
	match id:
		"repair":
			return tank.hp < tank.maxHp
		"shield":
			return tank.status.get("shield", 0) <= 0
		"double":
			return tank.status.get("double", 1) <= 1 and not (config.profile == "blue3" and state.suddenDeath)
		"teleport":
			return not _teleport_armed
	return false


func _use_item_internal(id: String) -> bool:
	if not _can_use_item_internal(id):
		return false
	var tank = active()
	var definition = _find_by(data.items, "id", id)
	var fallback = {"repair": 0.2, "shield": 1, "double": 2, "teleport": 0}
	var value = definition.get("profileValues", {}).get(config.profile, _finite(definition.get("value"), fallback[id]))
	tank.inventory[id] -= 1
	state.itemUsed = true
	_turn_extra_delay += maxf(0, _finite(definition.get("delay"), 100))
	match id:
		"repair":
			var fraction = clampf(value / 100 if value > 1 else value, 0, 1)
			var amount = minf(tank.maxHp - tank.hp, roundf(tank.maxHp * fraction))
			tank.hp += amount
			_emit("heal", {"x": tank.x, "y": tank.y, "tankId": tank.uid, "team": tank.team,
				"value": amount, "text": "%s 회복 +%d" % [tank.name, amount]})
		"shield":
			tank.status.shield = maxi(1, roundi(value))
		"double":
			tank.status.double = clampi(roundi(value), 2, 3)
		"teleport":
			_teleport_armed = true
			tank.status.teleport = true
			var aim = get_aiming_state()
			tank.angle = aim.localAngle
			state.power = aim.power
	_emit("item", {"x": tank.x, "y": tank.y, "tankId": tank.uid, "team": tank.team,
		"kind": id, "text": "%s 사용" % definition.get("name", id)})
	return true


func fire() -> bool:
	return is_human_turn() and _fire_internal()


func _fire_internal() -> bool:
	var tank = active()
	var weapon = _weapon(tank, state.weaponIndex)
	if tank == null or not tank.alive or state.paused or state.phase != "aim" or not _available(weapon):
		return false
	var preview = get_action_preview()
	tank.angle = preview.localAngle
	state.power = preview.power
	_start_action(preview)
	_shot_delay = maxf(0, _finite(weapon.get("delay"), 200 if state.weaponIndex else 100))
	_resolution_time = 0
	_settling_time = 0
	if preview.delivery == "self":
		var effect = weapon.get("effect")
		if _finite(weapon.get("shieldValue"), 0) > 0:
			tank.status.barrier = tank.status.get("barrier", 0) + weapon.shieldValue
		elif effect == null:
			tank.status.shield = maxi(1, tank.status.get("shield", 0))
		if effect != null and effect.type == "attackBuff":
			tank.status.attackBuff = {"multiplier": clampf(_finite(effect.get("multiplier"), 1.2), 1, 3),
				"turns": clampf(_finite(effect.get("durationTurns"), 2), 1, 5), "appliedTurn": state.turnNumber}
		_emit("item", {"x": tank.x, "y": tank.y, "tankId": tank.uid, "ownerId": tank.uid,
			"volleyId": _action.volleyId, "team": tank.team, "kind": "shield", "text": "%s · %s" % [tank.name, weapon.name]})
		state.phase = "settling"
		return true
	var shot_weapon = _teleport_weapon(weapon) if _teleport_armed else weapon
	var count = clampi(roundi(_finite(shot_weapon.get("shots"), 1)), 1, 12)
	var spread = _finite(shot_weapon.get("spread"), 0)
	for repetition in preview.repeat:
		for i in count:
			var offset = (i - (count - 1) / 2.0) * spread
			var projectile = _new_projectile(tank, shot_weapon, tank.angle + offset, state.power)
			_shot_counter += 1
			projectile.shotId = "s%d" % _shot_counter
			projectile.volleyId = _action.volleyId
			_launch_queue.append({"time": state.simTime + repetition * 0.48 + i * 0.045, "projectile": projectile})
	_launch_queue.sort_custom(func(a, b): return a.time < b.time)
	if not _teleport_armed and _behavior(weapon).repeatable:
		tank.status.erase("double")
	tank.status.erase("teleport")
	_teleport_armed = false
	state.phase = "projectile"
	_emit("message", {"text": "%s · %s" % [tank.name, preview.weaponName], "team": tank.team})
	_release_projectiles()
	return true


func skip() -> bool:
	if not is_human_turn():
		return false
	_emit("message", {"text": "%s 대기" % active().name, "team": active().team})
	_shot_delay = 0
	_finish_turn()
	return true


func _new_projectile(tank: Dictionary, weapon: Dictionary, angle: float, power: float) -> Dictionary:
	var radians = deg_to_rad(angle)
	var c = cos(tank.tilt)
	var s = sin(tank.tilt)
	var dx = tank.face * cos(radians)
	var dy = -sin(radians)
	var ux = dx * c - dy * s
	var uy = dx * s + dy * c
	var aim = _resolve_aiming(tank, weapon)
	var resolved_power = _normalize_power(power, aim)
	var speed = lerpf(tuning.minLaunchSpeed, tuning.maxLaunchSpeed, resolved_power / 100) * aim.velocityScale
	var behavior = _behavior(weapon)
	var kind = weapon.get("kind", "shell")
	var projectile = {"x": tank.x + ux * 28, "y": tank.y - 4 + uy * 28,
		"vx": ux * speed, "vy": uy * speed, "kind": kind, "team": tank.team, "ownerId": tank.uid,
		"trail": [], "radius": 3 if kind == "laser" else 5, "age": 0.0,
		"attack": maxf(0, _finite(weapon.get("attack"), 200)) * _attack_multiplier(tank),
		"damageRadius": maxf(0, _finite(weapon.get("radius"), 55)),
		"terrainRadius": maxf(0, _finite(weapon.get("terrainRadius"), 45)), "effect": weapon.get("effect"),
		"dead": false, "_trailStep": 0, "homingTarget": null, "weaponId": weapon.get("id"), "behavior": behavior,
		"bouncesLeft": behavior.bounces, "bounceCount": 0, "power": resolved_power,
		"velocityScale": aim.velocityScale, "gravityScale": aim.gravityScale, "windScale": aim.windScale}
	# Sweep the barrel segment too, so the muzzle cannot spawn past nearby cover.
	for i in range(1, 29):
		var x = tank.x + ux * i
		var y = tank.y - 4 + uy * i
		var hit = _collision(projectile, x, y)
		if hit != null:
			projectile.x = x
			projectile.y = y
			hit.previousX = x - ux
			hit.previousY = y - uy
			projectile._muzzleHit = hit
			break
	return projectile


func _release_projectiles() -> void:
	while not _launch_queue.is_empty() and _launch_queue[0].time <= state.simTime + 0.000001:
		var projectile = _launch_queue.pop_front().projectile
		state.projectiles.append(projectile)
		_stats.shots += 1
		if _is_action_shot(projectile):
			_action.releasedShots += 1
		var event = _projectile_context(projectile)
		event.merge({"x": projectile.x, "y": projectile.y, "team": projectile.team, "kind": projectile.kind, "tankId": projectile.ownerId})
		_emit("shot", event)


func _steer(projectile: Dictionary, dt: float) -> void:
	if projectile.kind != "homing" or projectile.behavior.trajectory == "linear" or projectile.vy < 0 or projectile.age < 0.2:
		return
	var closest = null
	var distance = 360.0
	for tank in state.tanks:
		if not tank.alive or (projectile.behavior.homingTarget == "enemy" and tank.team == projectile.team):
			continue
		if tank.uid == projectile.ownerId and projectile.age <= 0.6:
			continue
		var candidate = _dist(tank, projectile)
		if candidate < distance:
			distance = candidate
			closest = tank
	if closest == null:
		return
	var speed = clampf(sqrt(projectile.vx ** 2 + projectile.vy ** 2), 180, 750)
	var blend = minf(1, dt * 3.8)
	projectile.vx = lerpf(projectile.vx, (closest.x - projectile.x) * speed / maxf(1, distance), blend)
	projectile.vy = lerpf(projectile.vy, (closest.y - projectile.y) * speed / maxf(1, distance), blend)
	projectile.homingTarget = closest.uid


func _collision(projectile: Dictionary, x: float, y: float):
	var radius_x = HALF_W + projectile.radius
	var radius_y = HALF_H + projectile.radius
	for tank in state.tanks:
		if not tank.alive or (tank.uid == projectile.ownerId and projectile.age < 0.18):
			continue
		var dx = x - tank.x
		var dy = y - tank.y
		if absf(dx) < radius_x and absf(dy) < radius_y and (dx / radius_x) ** 2 + (dy / radius_y) ** 2 <= 1:
			return {"kind": "tank", "tank": tank, "x": x, "y": y}
	if solid(x, y):
		return {"kind": "terrain", "x": x, "y": y, "contactX": x, "contactY": y}
	var lower_y = y + projectile.radius * 0.5
	if solid(x, lower_y):
		return {"kind": "terrain", "x": x, "y": y, "contactX": x, "contactY": lower_y}
	return null


func _bounce_projectile(projectile: Dictionary, hit: Dictionary, previous_x: float, previous_y: float, prediction: bool) -> bool:
	if hit.kind != "terrain" or projectile.bouncesLeft <= 0 or projectile.vx ** 2 + projectile.vy ** 2 < 65 ** 2:
		return false
	var cx = hit.contactX
	var cy = hit.contactY
	var nx = 0.0
	var ny = 0.0
	for d in range(-3, 4):
		nx += int(solid(cx - 3, cy + d)) - int(solid(cx + 3, cy + d))
		ny += int(solid(cx + d, cy - 3)) - int(solid(cx + d, cy + 3))
	var length = sqrt(nx * nx + ny * ny)
	if length > 0:
		nx /= length
		ny /= length
	elif absf(projectile.vx) > absf(projectile.vy):
		nx = -signf(projectile.vx)
	else:
		ny = -signf(projectile.vy) if projectile.vy != 0 else -1
	var dot = projectile.vx * nx + projectile.vy * ny
	if dot > 0:
		nx = -nx
		ny = -ny
		dot = -dot
	projectile.vx = (projectile.vx - 2 * dot * nx) * projectile.behavior.restitution
	projectile.vy = (projectile.vy - 2 * dot * ny) * projectile.behavior.restitution
	projectile.x = previous_x + nx * (projectile.radius + 1)
	projectile.y = previous_y + ny * (projectile.radius + 1)
	projectile.bouncesLeft -= 1
	projectile.bounceCount += 1
	if not prediction:
		var event = _projectile_context(projectile)
		event.merge({"x": hit.x, "y": hit.y, "team": projectile.team, "kind": projectile.kind,
			"normal": {"x": nx, "y": ny}, "bouncesLeft": projectile.bouncesLeft})
		_emit("bounce", event)
	return true


func _advance_projectile(projectile: Dictionary, dt: float, prediction: bool):
	if projectile.has("_muzzleHit"):
		var muzzle_hit = projectile._muzzleHit
		projectile.erase("_muzzleHit")
		if _bounce_projectile(projectile, muzzle_hit, muzzle_hit.previousX, muzzle_hit.previousY, prediction):
			return null
		return muzzle_hit
	projectile.age += dt
	_steer(projectile, dt)
	if projectile.behavior.trajectory != "linear":
		projectile.vx += state.wind * tuning.windAcceleration * projectile.windScale * dt
		projectile.vy += tuning.gravity * projectile.gravityScale * dt
	var dx = projectile.vx * dt
	var dy = projectile.vy * dt
	var steps = maxi(1, ceili(sqrt(dx * dx + dy * dy) / tuning.collisionStep))
	var step_x = dx / steps
	var step_y = dy / steps
	for i in steps:
		var previous_x = projectile.x
		var previous_y = projectile.y
		projectile.x += step_x
		projectile.y += step_y
		var hit = _collision(projectile, projectile.x, projectile.y)
		if hit != null:
			if _bounce_projectile(projectile, hit, previous_x, previous_y, prediction):
				return null
			return hit
		if projectile.x < -100 or projectile.x > WIDTH + 100 or projectile.y > HEIGHT + 60 or projectile.y < -2600 or projectile.age > tuning.maxFlightTime:
			return {"kind": "void", "x": projectile.x, "y": projectile.y}
	if not prediction:
		projectile._trailStep += 1
		if projectile._trailStep % 2 == 0:
			projectile.trail.push_back({"x": projectile.x, "y": projectile.y})
			if projectile.trail.size() > 30:
				projectile.trail.pop_front()
	return null


func _impact(projectile: Dictionary, hit: Dictionary) -> void:
	if projectile.dead:
		return
	projectile.dead = true
	projectile.impactKind = hit.kind
	var context = _projectile_context(projectile)
	var event = context.duplicate()
	var target = hit.get("tank")
	event.merge({"x": projectile.x, "y": projectile.y, "team": projectile.team, "kind": projectile.kind,
		"impactKind": hit.kind, "tankId": target.uid if target != null else null})
	_emit("impact", event)
	if _is_action_shot(projectile):
		_action["misses" if hit.kind == "void" else "impacts"] += 1
	if hit.kind == "void":
		return
	if projectile.kind == "teleport":
		var owner = _find_by(state.tanks, "uid", projectile.ownerId)
		if owner != null and owner.alive:
			owner.x = clampf(projectile.x, 25, WIDTH - 25)
			var ground = surface_at(owner.x, maxf(0, projectile.y - 30))
			owner.y = ground - HALF_H - 1 if ground != null else minf(projectile.y - 25, HEIGHT - 50)
			owner.vx = 0
			owner.vy = 0
			_update_tilt(owner)
			context.merge({"x": owner.x, "y": owner.y, "team": owner.team, "tankId": owner.uid,
				"kind": "teleport", "text": "%s 이동" % owner.name})
			_emit("item", context)
			if _is_action_shot(projectile):
				_action.outcome = "teleport"
		return
	if projectile.kind == "mine" and hit.kind != "tank":
		state.mines.push_back({"x": projectile.x, "y": projectile.y - 4, "team": projectile.team,
			"ownerId": projectile.ownerId, "kind": "mine", "life": 6, "age": 0.0, "attack": projectile.attack,
			"damageRadius": maxf(42, projectile.damageRadius), "terrainRadius": projectile.terrainRadius,
			"shotId": projectile.shotId, "volleyId": projectile.volleyId, "behavior": projectile.behavior, "triggered": false})
		_hazard_terrain_version = -1
		context.merge({"x": projectile.x, "y": projectile.y, "team": projectile.team, "kind": "mine", "text": "지뢰 설치"})
		_emit("item", context)
		if _is_action_shot(projectile):
			_action.outcome = "mine_placed"
		return
	_explode(projectile, projectile.x, projectile.y, 0.45 if projectile.kind == "mine" else 1.0, target)


func _destroy_terrain(x: float, y: float, radius: float) -> int:
	radius *= tuning.terrainScale
	if radius <= 0:
		return 0
	var left = maxi(0, floori(x - radius))
	var right = mini(WIDTH - 1, ceili(x + radius))
	var top = maxi(0, floori(y - radius))
	var bottom = mini(HEIGHT - 1, ceili(y + radius))
	var mask: PackedByteArray = terrain.mask
	var removed = 0
	var radius_squared = radius * radius
	for yy in range(top, bottom + 1):
		var remaining = radius_squared - (yy - y) ** 2
		for xx in range(left, right + 1):
			var index = yy * WIDTH + xx
			if (xx - x) ** 2 <= remaining and mask[index] != 0:
				mask[index] = 0
				removed += 1
	if removed > 0:
		terrain.mask = mask
		terrain.version += 1
		terrain.solidCount -= removed
		_stats.terrainRemoved += removed
	return removed


func _explode(projectile: Dictionary, x: float, y: float, attack_scale: float, direct_tank) -> void:
	var radius = maxf(18, _finite(projectile.get("damageRadius"), 55))
	var context = _projectile_context(projectile)
	context.impactKind = projectile.get("impactKind", "terrain")
	var supported = state.tanks.filter(func(t): return t.alive and solid(t.x, t.y + HALF_H))
	_stats.explosions += 1
	var removed = _destroy_terrain(x, y, projectile.terrainRadius)
	if _is_action_shot(projectile):
		_action.terrainRemoved += removed
	for tank in supported:
		if not solid(tank.x, tank.y + HALF_H):
			tank._fallContext = context
	var event = context.duplicate()
	event.merge({"x": x, "y": y, "radius": maxf(radius, projectile.terrainRadius), "kind": projectile.kind, "team": projectile.team})
	_emit("explosion", event)
	var damage_to_enemies = 0.0
	var effect = projectile.get("effect")
	for tank in state.tanks:
		if not tank.alive:
			continue
		var distance = maxf(0, sqrt((tank.x - x) ** 2 + (tank.y - y) ** 2) - 14)
		var direct = is_same(tank, direct_tank)
		if distance > radius and not direct:
			continue
		var falloff = 1.0 if direct else clampf(1 - distance / (radius + 0.01), 0.1, 1)
		if effect != null and effect.type == "dispel" and tank.team != projectile.team:
			for key in ["shield", "barrier", "attackBuff"]:
				tank.status.erase(key)
			_emit("message", {"text": "%s 강화 효과 해제" % tank.name, "team": tank.team})
			if _is_action_shot(projectile):
				_action.outcome = "support_hit"
		var damage = maxf(0, roundf(projectile.attack * tuning.damageScale * falloff * attack_scale))
		var before = tank.hp
		var blocked = _damage(tank, damage, projectile.kind, false, projectile.team, projectile.ownerId, context)
		if tank.team != projectile.team:
			damage_to_enemies += before - tank.hp
		if blocked or not tank.alive:
			continue
		match projectile.kind:
			"poison", "fire":
				_set_periodic(tank, projectile.kind, 3 if projectile.kind == "poison" else 2, projectile, context)
			"water":
				tank.status.bind = maxi(tank.status.get("bind", 0), 2)
		if effect != null and effect.type == "knockback":
			var strength = clampf(_finite(effect.get("strength"), 65), 0, 240) * falloff
			var away = signf(tank.x - x)
			if away == 0:
				away = signf(projectile.get("vx", 0))
			if away == 0:
				away = -1 if projectile.team else 1
			tank.vx += away * strength
			tank.vy -= strength * 0.7
	var life_steal = projectile.behavior.lifeSteal
	var owner = _find_by(state.tanks, "uid", projectile.ownerId)
	if life_steal > 0 and damage_to_enemies > 0 and owner != null and owner.alive:
		var amount = minf(owner.maxHp - owner.hp, roundf(damage_to_enemies * life_steal))
		if amount > 0:
			owner.hp += amount
			if _is_action_shot(projectile):
				_action.heal += amount
			event = context.duplicate()
			event.merge({"x": owner.x, "y": owner.y, "tankId": owner.uid, "team": owner.team,
				"targetTeam": owner.team, "value": amount, "kind": "lifeSteal", "text": "%s 흡혈 +%d" % [owner.name, amount]})
			_emit("heal", event)
	if projectile.kind == "fire":
		state.hazards.push_back({"x": x, "y": y, "kind": "fire", "team": projectile.team, "ownerId": projectile.ownerId,
			"shotId": projectile.shotId, "volleyId": projectile.volleyId, "life": 3, "radius": 36})
		_hazard_terrain_version = -1


static func _set_periodic(tank: Dictionary, kind: String, duration: int, source: Dictionary, context: Dictionary) -> void:
	tank.status[kind] = maxi(tank.status.get(kind, 0), duration)
	tank.status[kind + "SourceTeam"] = source.team
	tank.status[kind + "SourceId"] = source.ownerId
	tank.status[kind + "Context"] = context


func _damage(tank: Dictionary, amount: float, kind: String, periodic: bool, source_team = null, source_id = null, context = null) -> bool:
	if not tank.alive or amount <= 0:
		return false
	if not periodic and tank.status.get("shield", 0) > 0:
		tank.status.shield -= 1
		_emit("item", {"x": tank.x, "y": tank.y, "kind": "shield", "tankId": tank.uid, "team": tank.team, "text": "%s 공격 차단" % tank.name})
		return true
	if not periodic and tank.status.get("barrier", 0) > 0:
		var absorbed = minf(amount, tank.status.barrier)
		tank.status.barrier -= absorbed
		amount -= absorbed
		if amount <= 0:
			return true
	var actual = minf(tank.hp, maxf(0, roundf(amount)))
	tank.hp = maxf(0, tank.hp - actual)
	_stats.damage += actual
	if source_team in [0, 1]:
		tank._lastSourceTeam = source_team
		tank._lastSourceId = source_id
		tank._lastContext = context
	if actual > 0 and context != null and _is_action_shot(context) and not context.triggered:
		_action["friendlyDamage" if tank.team == _action.team else "damageToEnemy"] += actual
		_action.hitTargets[tank.uid] = true
	var event = context.duplicate() if context != null else {}
	event.merge({"x": tank.x, "y": tank.y - 16, "value": actual, "kind": kind, "team": tank.team,
		"sourceTeam": source_team, "targetTeam": tank.team, "ownerId": source_id, "tankId": tank.uid}, true)
	_emit("damage", event)
	if tank.hp <= 0:
		_kill(tank, kind, source_team, source_id, context)
	return false


func _kill(tank: Dictionary, kind: String, source_team = null, source_id = null, context = null) -> void:
	if not tank.alive:
		return
	tank.alive = false
	tank.hp = 0
	tank.vx = 0
	tank.vy = 0
	if kind == "fall" and context == null:
		context = tank.get("_fallContext")
		if context == null:
			context = tank.get("_lastContext")
	if context != null and _is_action_shot(context) and not context.triggered and tank.team != _action.team:
		_action.kills += 1
	var event = context.duplicate() if context != null else {}
	if kind == "fall":
		if source_team == null:
			source_team = event.get("sourceTeam", tank.get("_lastSourceTeam"))
		if source_id == null:
			source_id = event.get("ownerId", tank.get("_lastSourceId"))
	event.merge({"x": tank.x, "y": minf(tank.y, HEIGHT), "tankId": tank.uid, "team": tank.team,
		"targetTeam": tank.team, "sourceTeam": source_team, "ownerId": source_id, "kind": kind,
		"text": tank.name + (" 낙하!" if kind == "fall" else " 격파!")}, true)
	_emit("death", event)


func _update_tilt(tank: Dictionary) -> void:
	var start_y = maxf(0, tank.y + HALF_H - 22)
	var left = surface_at(tank.x - 12, start_y)
	var right = surface_at(tank.x + 12, start_y)
	if left != null and right != null and absi(left - right) < 60:
		tank.tilt = clampf(atan2(right - left, 24), -0.6, 0.6)


func _settle_tanks(dt: float) -> bool:
	var stable = true
	for tank in state.tanks:
		if not tank.alive:
			continue
		if not is_finite(tank.x + tank.y + tank.vx + tank.vy):
			_kill(tank, "fall")
			continue
		if absf(tank.vx) > 0.5:
			var dx = tank.vx * dt
			var steps = maxi(1, ceili(absf(dx)))
			for i in steps:
				var nx = tank.x + dx / steps
				var edge = nx + signf(dx) * (HALF_W - 3)
				if solid(edge, tank.y - 5) or solid(edge, tank.y + 3) or _tank_blocks(tank, nx, 25):
					tank.vx = 0
					break
				tank.x = nx
			tank.vx *= exp(-dt * 3.5)
			if absf(tank.vx) > 1:
				stable = false
		else:
			tank.vx = 0
		var old_bottom = tank.y + HALF_H
		tank.vy += tuning.tankGravity * dt
		var next_y = tank.y + tank.vy * dt
		var floor_y = surface_at(tank.x, maxf(0, old_bottom - 1))
		if floor_y != null and floor_y <= next_y + HALF_H and tank.vy >= 0:
			next_y = floor_y - HALF_H
			tank.vy = 0
			tank._fallContext = null
			_update_tilt(tank)
		else:
			stable = false
		tank.y = next_y
		if tank.y > HEIGHT + 35 or tank.x < -HALF_W or tank.x > WIDTH + HALF_W:
			_kill(tank, "fall")
	return stable


func _settle_ground_effects() -> void:
	if _hazard_terrain_version == terrain.version:
		return
	_hazard_terrain_version = terrain.version
	for effect in state.mines + state.hazards:
		var floor_y = surface_at(effect.x, maxf(0, effect.y - 2))
		if floor_y == null:
			effect.dead = true
		else:
			effect.y = floor_y - (4 if effect.kind == "mine" else 3)
	state.mines = state.mines.filter(func(m): return not m.get("dead", false))
	state.hazards = state.hazards.filter(func(h): return not h.get("dead", false))


static func _mine_exempt(tank: Dictionary) -> bool:
	return _find_by(tank.def.get("passives", []), "id", "mine_trigger_exemption") != null


func _trigger_mines() -> void:
	for mine in state.mines:
		if mine.get("dead", false) or mine.age < 0.45:
			continue
		for tank in state.tanks:
			if tank.alive and absf(tank.x - mine.x) < 23 and absf(tank.y + HALF_H - mine.y) < 23 and not _mine_exempt(tank):
				mine.dead = true
				mine.triggered = true
				mine.impactKind = "mine"
				_explode(mine, mine.x, mine.y, 1, tank)
				break
	state.mines = state.mines.filter(func(m): return not m.get("dead", false) and m.life > 0)


func _check_winner(reason = null) -> bool:
	if state.phase == "gameover":
		return true
	var alive = state.tanks.filter(func(t): return t.alive)
	var teams = {}
	for tank in alive:
		teams[tank.team] = true
	if teams.size() > 1 and reason != "round_limit":
		return false
	var winner = -1
	if teams.size() == 1:
		winner = alive[0].team
	else:
		var totals = [0.0, 0.0]
		for tank in state.tanks:
			totals[tank.team] += tank.hp / tank.maxHp
		if absf(totals[0] - totals[1]) >= 1e-9:
			winner = 0 if totals[0] > totals[1] else 1
	_end_action()
	state.winner = winner
	state.phase = "gameover"
	state.endReason = reason if reason != null else ("simultaneous_elimination" if alive.is_empty() else "elimination")
	state.projectiles = []
	_launch_queue.clear()
	_emit("end", {"team": winner, "kind": state.endReason,
		"text": "무승부" if winner == -1 else ("블루 팀 승리" if winner == 0 else "오렌지 팀 승리")})
	return true


func _round_boundary() -> void:
	var alive = state.tanks.filter(func(t): return t.alive)
	if alive.is_empty() or not alive.all(func(t): return _acted.has(t.uid)):
		return
	_acted.clear()
	if state.round >= _max_round:
		_check_winner("round_limit")
		return
	state.round += 1
	for mine in state.mines:
		mine.life -= 1
	for hazard in state.hazards:
		hazard.life -= 1
	state.hazards = state.hazards.filter(func(h): return h.life > 0)
	if state.round >= _sudden_round:
		state.suddenDeath = true
		var fraction = 0.08 * (state.round - 7) if config.profile == "blue3" else 0.055
		_emit("message", {"text": "서든데스 · %d 라운드" % state.round, "kind": "suddenDeath"})
		for tank in alive:
			_damage(tank, ceilf(tank.maxHp * fraction), "suddenDeath", true)


func _update_turn_order() -> void:
	var alive = state.tanks.filter(func(t): return t.alive)
	alive.sort_custom(func(a, b): return a.uid < b.uid if a.nextDelay == b.nextDelay else a.nextDelay < b.nextDelay)
	state.turnOrder = alive.map(func(t): return t.uid)


func _begin_next_turn() -> void:
	if _check_winner():
		return
	_round_boundary()
	if _check_winner():
		return
	# A periodic effect can defeat the scheduled actor before the aim phase.
	for attempt in range(state.tanks.size() + 1):
		_update_turn_order()
		if state.turnOrder.is_empty():
			_check_winner()
			return
		var tank = _find_by(state.tanks, "uid", state.turnOrder[0])
		state.activeId = tank.uid
		_schedule_clock = tank.nextDelay
		state.turnNumber += 1
		_stats.turns += 1
		tank._boundThisTurn = tank.status.get("bind", 0) > 0
		if tank._boundThisTurn:
			tank.status.bind -= 1
		for hazard in state.hazards:
			if _dist(tank, hazard) < hazard.radius + 18:
				_set_periodic(tank, "fire", 1, hazard, _projectile_context(hazard))
		for kind in ["poison", "fire"]:
			if tank.status.get(kind, 0) > 0:
				tank.status[kind] -= 1
				var amount = maxf(16, roundf(tank.maxHp * 0.025)) if kind == "poison" else maxf(10, roundf(tank.maxHp * 0.016))
				_damage(tank, amount, kind, true, tank.status.get(kind + "SourceTeam"),
					tank.status.get(kind + "SourceId"), tank.status.get(kind + "Context"))
		if not tank.alive:
			_acted[tank.uid] = true
			if _check_winner():
				return
			continue
		tank.moveLeft = 0 if tank._boundThisTurn else tank.maxMove
		state.phase = "aim"
		state.timeLeft = _turn_limit
		state.wind = floorf((_random() * 2 - 1) * (9 if state.suddenDeath else 7) * 10 + 0.5) / 10
		state.weaponIndex = 0
		state.power = 65
		state.itemUsed = false
		_teleport_armed = false
		var aim = get_aiming_state()
		tank.angle = aim.localAngle
		state.power = aim.power
		_turn_extra_delay = 0
		_turn_time_used = 0
		_move_spent = 0
		_shot_delay = 0
		_ai_wait = 0.65
		_ai_plan.clear()
		_ai_search.clear()
		_trajectory_cache.clear()
		_emit("turn", {"tankId": tank.uid, "team": tank.team, "x": tank.x, "y": tank.y, "text": "%s 차례" % tank.name})
		return
	_check_winner("round_limit")


func _finish_turn() -> void:
	if state.phase == "gameover":
		return
	_ai_search.clear()
	_ai_plan.clear()
	_end_action()
	var tank = active()
	if tank != null:
		_acted[tank.uid] = true
		var action_delay = _shot_delay + _turn_extra_delay + roundf(_turn_time_used * 10 + _move_spent * 0.5)
		tank.nextDelay = maxf(tank.nextDelay, _schedule_clock) + tank.delay + action_delay
		var buff = tank.status.get("attackBuff")
		if buff != null and buff.appliedTurn < state.turnNumber:
			buff.turns -= 1
			if buff.turns <= 0:
				tank.status.erase("attackBuff")
		tank.status.erase("teleport")
	_teleport_armed = false
	_update_turn_order()
	if not _check_winner():
		state.phase = "transition"
		_transition_left = 0.32


func _predict(tank: Dictionary, weapon: Dictionary, angle: float, power: float, collect: bool) -> Dictionary:
	var projectile = _new_projectile(tank, weapon, angle, power)
	var points: Array = []
	if collect:
		points.push_back({"x": projectile.x, "y": projectile.y})
	var hit = null
	for i in range(ceili(tuning.maxFlightTime / FIXED_DT) + 2):
		hit = _advance_projectile(projectile, FIXED_DT, true)
		if collect and (i % 8 == 0 or hit != null):
			points.push_back({"x": projectile.x, "y": projectile.y})
		if hit != null:
			break
	return {"x": projectile.x, "y": projectile.y, "hit": hit, "points": points, "bounces": projectile.bounceCount}


func get_trajectory() -> Array:
	var tank = active()
	if tank == null or not tank.alive or state.phase != "aim":
		return []
	var weapon = _weapon(tank, state.weaponIndex)
	if weapon == null or (_behavior(weapon).delivery == "self" and not _teleport_armed):
		return []
	if _teleport_armed:
		weapon = _teleport_weapon(weapon)
	var aim = get_aiming_state()
	var targets = state.tanks.map(func(other): return [other.uid, other.alive, other.x, other.y])
	var key = [tank.uid, tank.x, tank.y, tank.tilt, aim.localAngle, tank.face, aim.power, state.weaponIndex,
		state.wind, terrain.version, _teleport_armed, targets, aim.velocityScale, aim.gravityScale, aim.windScale,
		tuning.gravity, tuning.windAcceleration, tuning.minLaunchSpeed, tuning.maxLaunchSpeed]
	if _trajectory_cache.get("key") == key:
		return _trajectory_cache.points
	var points = _predict(tank, weapon, aim.localAngle, aim.power, true).points
	_trajectory_cache = {"key": key, "points": points}
	return points


func _score_ai_prediction(actor: Dictionary, weapon: Dictionary, result: Dictionary) -> float:
	if result.hit == null or result.hit.kind == "void":
		return -1000
	var behavior = _behavior(weapon)
	var radius = maxf(18, _finite(weapon.get("radius"), 55))
	var count = clampf(_finite(weapon.get("shots"), 1), 1, 12)
	var spacing = maxf(8, _dist(actor, result) * tan(deg_to_rad(absf(_finite(weapon.get("spread"), 0)))))
	var pellets = 1.0 if count == 1 else minf(count, 1 + (radius + HALF_W) / spacing)
	var input = _finite(weapon.get("attack"), 0) * _attack_multiplier(actor) * tuning.damageScale
	var score = 0.0
	var nearest = INF
	var effect = weapon.get("effect")
	for target in state.tanks:
		if not target.alive:
			continue
		var enemy = target.team != actor.team
		var distance = maxf(0, _dist(target, result) - 14)
		if enemy:
			nearest = minf(nearest, distance)
		var direct = is_same(result.hit.get("tank"), target)
		var hit_scale = 1.0 if direct else (clampf(1 - distance / (radius + 0.01), 0.1, 1) if distance <= radius else 0.0)
		if weapon.kind == "mine":
			if direct:
				hit_scale = 0.45
			else:
				hit_scale = 1.0 if absf(target.x - result.x) < 23 and absf(target.y + HALF_H - result.y) < 28 and not _mine_exempt(target) else 0.0
		var dispel = enemy and hit_scale > 0 and effect != null and effect.type == "dispel"
		var total_input = input * hit_scale * pellets
		var damage = total_input
		var barrier = _finite(target.status.get("barrier"), 0)
		var shielded = target.status.get("shield", 0) > 0
		if not dispel:
			if shielded:
				damage = maxf(0, damage - input * hit_scale)
			damage = maxf(0, damage - barrier)
		var actual = minf(target.hp, damage)
		var lethal = actual >= target.hp and actual > 0
		if not enemy:
			score -= maxf(actual, total_input * 0.7) * 2.7
			if lethal:
				score -= 400
			continue
		score += actual
		if lethal:
			score += 100
		if dispel:
			score += barrier * 0.85 + (240 if shielded else 0) + (110 if target.status.has("attackBuff") else 0)
		if actual > 0:
			if weapon.kind == "poison" and target.status.get("poison", 0) <= 0:
				score += target.maxHp * 0.025 * 3
			if weapon.kind == "fire" and target.status.get("fire", 0) <= 0:
				score += target.maxHp * 0.016 * 2
			if weapon.kind == "water" and target.status.get("bind", 0) <= 0:
				score += 35
			score += minf(actor.maxHp - actor.hp, actual * behavior.lifeSteal) * 0.9
		var crater = maxf(0, _finite(weapon.get("terrainRadius"), 0)) * tuning.terrainScale
		var dx = absf(target.x - result.x)
		if result.hit.kind == "terrain" and crater > dx and absf(target.y + HALF_H - result.y) < crater:
			var bottom = result.y + sqrt(crater * crater - dx * dx)
			score += target.hp * 0.75 if surface_at(target.x, bottom + 1) == null else 22
	return score - minf(1000, nearest) * 0.12 - _finite(weapon.get("delay"), 100) * 0.015


func _score_ai_support(actor: Dictionary, weapon: Dictionary) -> float:
	var hp_ratio = actor.hp / actor.maxHp
	var effect = weapon.get("effect")
	if effect != null and effect.type == "attackBuff":
		if actor.status.has("attackBuff") or hp_ratio < 0.35 or state.round >= _max_round:
			return -INF
		var strongest = 0.0
		for attack in _weapons(actor):
			if _behavior(attack).role == "attack":
				strongest = maxf(strongest, _finite(attack.get("attack"), 0) * sqrt(_finite(attack.get("shots"), 1)))
		var boost = _finite(effect.get("multiplier"), 1.2) - 1
		return strongest * tuning.damageScale * boost * _finite(effect.get("durationTurns"), 2) * 0.9
	var shield = maxf(0, _finite(weapon.get("shieldValue"), 0) - _finite(actor.status.get("barrier"), 0))
	if shield <= 0 or hp_ratio >= 0.6:
		return -INF
	return shield * (1.65 if hp_ratio < 0.3 else 1.1)


func _start_ai_search(actor: Dictionary) -> Dictionary:
	var enemies = state.tanks.filter(func(t): return t.alive and t.team != actor.team)
	if enemies.is_empty():
		return {}
	var target = enemies[0]
	var priority = INF
	for enemy in enemies:
		var score = enemy.hp / enemy.maxHp * 160 + absf(enemy.x - actor.x)
		if score < priority:
			priority = score
			target = enemy
	var direction = _direction_to_world(actor, target.x, target.y)
	if direction != null:
		actor.face = direction.face
	return {"actor": actor, "enemies": enemies, "weapons": _weapons(actor), "index": 0,
		"best": {}, "candidate": {}, "work": [], "step": 0, "refine": false}


func _prepare_ai_weapon(search: Dictionary, weapon: Dictionary) -> void:
	var actor = search.actor
	var aim = _resolve_aiming(actor, weapon)
	var behavior = _behavior(weapon)
	search.aim = aim
	search.candidate = {"score": -INF, "angle": clampf(actor.angle, aim.min, aim.max),
		"power": _normalize_power(65, aim), "weaponIndex": search.index, "role": behavior.role, "face": actor.face}
	search.refine = false
	if behavior.delivery == "self":
		search.work.push_back(null)
	elif behavior.trajectory == "linear":
		for target in search.enemies:
			var direction = _direction_to_world(actor, target.x, target.y)
			if direction != null:
				for offset in [-1.5, 0.0, 1.5]:
					search.work.push_back([direction.angle + offset, aim.powerMax, direction.face])
	else:
		var powers = []
		for i in 11:
			var power = _normalize_power(lerpf(aim.powerMin, aim.powerMax, i / 10.0), aim)
			if power not in powers:
				powers.push_back(power)
		for i in 9:
			var angle = lerpf(aim.min, aim.max, i / 8.0)
			for power in powers:
				search.work.push_back([angle, power, actor.face])
		search.refine = true


func _advance_ai_search(search: Dictionary) -> bool:
	# Return true after consuming one prediction budget unit, false when exhausted.
	while search.index < search.weapons.size():
		var weapon = search.weapons[search.index]
		if not _available(weapon):
			search.index += 1
			continue
		if search.candidate.is_empty():
			_prepare_ai_weapon(search, weapon)
		if search.step == search.work.size() and search.refine:
			search.refine = false
			var coarse = search.candidate
			for da in range(-4, 5, 2):
				for dp in range(-6, 7, 3):
					search.work.push_back([coarse.angle + da, coarse.power + dp, search.actor.face])
		if search.step < search.work.size():
			var trial = search.work[search.step]
			search.step += 1
			if trial == null:
				search.candidate.score = _score_ai_support(search.actor, weapon)
				return true
			var aim = search.aim
			var angle = clampf(trial[0], aim.min, aim.max)
			var power = _normalize_power(trial[1], aim)
			var shooter = search.actor
			if shooter.face != trial[2]:
				shooter = shooter.duplicate()
				shooter.face = trial[2]
			var score = _score_ai_prediction(shooter, weapon, _predict(shooter, weapon, angle, power, false))
			if score > search.candidate.score:
				search.candidate.merge({"score": score, "angle": angle, "power": power, "face": trial[2]}, true)
			return true
		if search.best.is_empty() or search.candidate.score > search.best.score:
			search.best = search.candidate
		search.candidate = {}
		search.work.clear()
		search.step = 0
		search.index += 1
	return false


func _finish_ai_search(search: Dictionary) -> Dictionary:
	if search.is_empty() or search.best.is_empty():
		return {}
	var best = search.best
	var actor = search.actor
	var chosen = _weapon(actor, best.weaponIndex)
	var aim = _resolve_aiming(actor, chosen)
	var error = 0.65 if config.difficulty == "hard" else (4.5 if config.difficulty == "easy" else 1.8)
	if _behavior(chosen).delivery != "self":
		best.angle = clampf(best.angle + (_random() - 0.5) * error, aim.min, aim.max)
		best.power = _normalize_power(best.power + (_random() - 0.5) * error * 1.5, aim)
	actor.face = best.face
	return best


func _plan_ai() -> Dictionary:
	var actor = active()
	if actor == null or not actor.alive:
		return {}
	var search = _start_ai_search(actor)
	if search.is_empty():
		return {}
	while _advance_ai_search(search):
		pass
	return _finish_ai_search(search)


func _tick_ai(dt: float) -> void:
	_ai_wait -= dt
	if _ai_wait > 0:
		return
	var tank = active()
	if tank == null or not tank.alive:
		return
	if not _ai_plan.is_empty():
		_fire_internal()
		return
	if _ai_search.is_empty():
		if tank.hp < tank.maxHp * 0.58 and tank.inventory.repair > 0:
			_use_item_internal("repair")
		_ai_search = _start_ai_search(tank)
	if _ai_search.is_empty():
		_finish_turn()
		return
	# Six prediction units per simulation step keep AI timing independent of render rate.
	for unit in 6:
		if _advance_ai_search(_ai_search):
			continue
		_ai_plan = _finish_ai_search(_ai_search)
		_ai_search = {}
		if _ai_plan.is_empty():
			_finish_turn()
			return
		var weapon = _weapon(tank, _ai_plan.weaponIndex)
		if _behavior(weapon).repeatable and _ai_plan.score > 0:
			_use_item_internal("double")
		if tank.hp < tank.maxHp * 0.48 and tank.inventory.shield > 0:
			_use_item_internal("shield")
		state.weaponIndex = _ai_plan.weaponIndex
		var aim = _resolve_aiming(tank, weapon)
		tank.face = _ai_plan.face
		tank.angle = clampf(_ai_plan.angle, aim.min, aim.max)
		state.power = _normalize_power(_ai_plan.power, aim)
		_ai_wait = 0.45
		return


func tick(dt) -> void:
	dt = _finite(dt, 0)
	if dt <= 0 or state.paused or state.phase == "gameover":
		return
	_accumulator += minf(dt, 0.25)
	var steps = 0
	while _accumulator >= FIXED_DT and steps < 31 and state.phase != "gameover":
		_accumulator -= FIXED_DT
		steps += 1
		_step(FIXED_DT)


func _step(dt: float) -> void:
	state.simTime += dt
	for mine in state.mines:
		mine.age += dt
	_settle_ground_effects()
	var stable = _settle_tanks(dt)
	_trigger_mines()
	match state.phase:
		"aim":
			var tank = active()
			if tank == null or not tank.alive:
				_finish_turn()
				return
			if _check_winner():
				return
			state.timeLeft = maxf(0, state.timeLeft - dt)
			_turn_time_used += dt
			if state.timeLeft <= 0:
				_emit("message", {"text": "제한 시간 종료 · 턴을 넘깁니다"})
				_finish_turn()
			elif not is_human_turn():
				_tick_ai(dt)
		"projectile":
			_resolution_time += dt
			_release_projectiles()
			for projectile in state.projectiles:
				if not projectile.dead:
					var hit = _advance_projectile(projectile, dt, false)
					if hit != null:
						_impact(projectile, hit)
			state.projectiles = state.projectiles.filter(func(p): return not p.dead)
			if _resolution_time > tuning.maxResolutionTime:
				state.projectiles.clear()
				_launch_queue.clear()
				if not _action.is_empty():
					_action.outcome = "resolution_timeout"
			if state.projectiles.is_empty() and _launch_queue.is_empty():
				state.phase = "settling"
				_settling_time = 0
		"settling":
			_settling_time += dt
			if (stable and _settling_time >= 0.26) or _settling_time > 4:
				_finish_turn()
		"transition":
			_transition_left -= dt
			if (_transition_left <= 0 and stable) or _transition_left < -4:
				_begin_next_turn()


func get_snapshot() -> Dictionary:
	var snapshot_config = config.duplicate(true)
	snapshot_config.erase("onEvent")
	var snapshot := {"profile": config.profile, "config": snapshot_config, "tuning": tuning.duplicate(true),
		"physicsProvenance": "prototype_tuning_not_original_constants",
		"roundModel": "all_living_tanks_have_acted; blue3_normal_rounds_1_to_7_then_sudden_8_to_10",
		"queuedProjectiles": _launch_queue.size(), "stats": _stats.duplicate()}
	for key in ["phase", "paused", "activeId", "itemUsed", "round", "turnNumber", "wind", "timeLeft",
			"simTime", "winner", "endReason", "suddenDeath"]:
		snapshot[key] = state[key]
	snapshot.lastAction = state.lastAction.duplicate(true) if state.lastAction != null else null
	snapshot.terrain = {"width": WIDTH, "height": HEIGHT, "version": terrain.version,
		"solidCount": terrain.solidCount, "mapId": terrain.mapId}
	snapshot.tanks = state.tanks.map(func(t):
		return {"uid": t.uid, "typeId": t.typeId, "team": t.team, "x": t.x, "y": t.y, "hp": t.hp,
			"maxHp": t.maxHp, "alive": t.alive, "angle": t.angle, "face": t.face, "nextDelay": t.nextDelay,
			"moveLeft": t.moveLeft, "status": t.status.duplicate(true), "inventory": t.inventory.duplicate(true)})
	snapshot.projectiles = state.projectiles.map(func(p):
		return {"x": p.x, "y": p.y, "vx": p.vx, "vy": p.vy, "kind": p.kind, "ownerId": p.ownerId})
	return snapshot
