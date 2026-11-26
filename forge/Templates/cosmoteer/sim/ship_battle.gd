extends RefCounted

const ShipDesign := preload("res://sim/ship_design.gd")
const Flight := preload("res://sim/flight_dynamics.gd")
const Special := preload("res://sim/special_propulsion.gd")
const EngineRoom := preload("res://sim/engine_room.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const REACTOR := "cosmoteer.reactor_small"
const GUN := "cosmoteer.laser_blaster_small"
const BRIDGE := "cosmoteer.control_room_small"
const BUNK := "cosmoteer.crew_quarters_small"
const CORRIDOR := "cosmoteer.corridor"
const ARMOR := "cosmoteer.armor"
const HZ := 60
const DT := 1.0 / HZ
const STALEMATE_TICKS := 120 * HZ
const ACQUIRE_TICKS := 2 * HZ
const NEIGHBORS := [Vector2i.UP, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT]

var player_design
var enemy_design
var player: Dictionary = {}
var enemy: Dictionary = {}
var events: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var pd_beams: Array[Dictionary] = []
var ion_beams: Array[Dictionary] = []
var result := "idle"
var outcome_reason := ""
var mission: Dictionary = {}
var launch_error := ""
var target_uid := -1
var enemy_target_uid := -1
var elapsed := 0.0
var _tick := 0
var _last_hit := 0
var _remaining := 0.0
var _move := Vector2.ZERO
var _turn := 0.0


static func validate_design(design) -> String:
	if design == null or not design.load_error.is_empty():
		return "설계 카탈로그를 불러올 수 없습니다."
	return _launch_issue(_build_ship(design))


func start(design, opponent = null, operation: Dictionary = {}) -> bool:
	result = "idle"
	outcome_reason = ""
	mission = operation.duplicate()
	events.clear()
	projectiles.clear()
	pd_beams.clear()
	ion_beams.clear()
	player.clear()
	enemy.clear()
	elapsed = 0.0
	_tick = 0
	_last_hit = 0
	_remaining = 0.0
	_move = Vector2.ZERO
	_turn = 0.0
	target_uid = -1
	enemy_target_uid = -1
	if opponent == null:
		opponent = _make_opponent(str(mission.get("opponent", "flight")))
	launch_error = validate_design(design)
	if not launch_error.is_empty():
		return false
	launch_error = validate_design(opponent)
	if not launch_error.is_empty():
		launch_error = "상대 함선 · " + launch_error
		return false
	player_design = design
	enemy_design = opponent
	player = _build_ship(design)
	enemy = _build_ship(opponent)
	var half_distance := float(mission.get("distance", 120.0)) * 0.5
	Flight.deploy(player, Vector2(-half_distance, 0), 0.0, design.ship_physics)
	Flight.deploy(enemy, Vector2(half_distance, 0), PI, opponent.ship_physics)
	_prepare_engines(player)
	_prepare_engines(enemy)
	target_uid = _choose_target(enemy, CombatSystems.WEAPON_IDS if mission.get("objective") == "disarm" else [ARMOR, CombatSystems.ARMOR_2X1, GUN, CombatSystems.LASER_LARGE, CombatSystems.CANNON_MED, CombatSystems.MISSILE_LAUNCHER, BRIDGE])
	enemy_target_uid = _choose_target(player, [BRIDGE])
	result = "active"
	return true


static func _ids_of(ship: Dictionary, id_list: Array) -> Array:
	var out: Array = []
	for id in id_list:
		for uid in ship.ids.get(id, []):
			out.append(uid)
	return out


static func defense_state(ship: Dictionary) -> Dictionary:
	return CombatSystems.shield_summary(ship)


static func _make_opponent(profile: String):
	var opponent := ShipDesign.new()
	if profile == "vanguard":
		opponent.shield_missile_cruiser()
		return opponent
	if profile == "dreadnought":
		opponent.dreadnought_battleship()
		return opponent
	opponent.flight_starter()
	match profile:
		"fast":
			opponent.place("cosmoteer.thruster_med", Vector2i(0, 3), 1)
		"siege":
			opponent.place(CORRIDOR, Vector2i(12, 6))
			opponent.place(GUN, Vector2i(12, 7), 1)
			opponent.place(ARMOR, Vector2i(13, 4))
			opponent.place(ARMOR, Vector2i(14, 5))
	return opponent


func set_flight_input(move: Vector2, turn: float) -> void:
	_move = move.limit_length(1.0) if move.is_finite() else Vector2.ZERO
	_turn = clampf(turn, -1.0, 1.0) if is_finite(turn) else 0.0


func request_boost(enabled: bool) -> bool:
	if result != "active":
		return false
	var changed := false
	for uid in player.ids.get(Special.BOOST, []):
		if Special.set_boost(player, player.parts[uid], enabled):
			_record("boost_on" if enabled else "boost_off", "player", uid, uid)
			changed = true
	return changed


static func propulsion_state(ship: Dictionary) -> Dictionary:
	return Special.summary(ship)


func request_overclock(enabled: bool) -> bool:
	if result != "active" or enabled == player.overclock:
		return false
	if enabled and not EngineRoom.available(player):
		return false
	player.overclock = enabled
	return true


func overclock_state() -> Dictionary:
	return EngineRoom.snapshot(player)


static func grid_world(ship: Dictionary, point: Vector2) -> Vector2:
	return Flight.grid_world(ship, point)


static func part_world(ship: Dictionary, uid: int) -> Vector2:
	var part: Dictionary = ship.parts[uid]
	return grid_world(ship, Vector2(part.cell) + Vector2(part.size) * 0.5)


## A powered ship deploys with its pilot at the controls. Deployment cells
## are transferred from connected reactor reserves, including engine fuel.
static func _prepare_engines(ship: Dictionary) -> void:
	var has_defenses: bool = not _ids_of(ship, CombatSystems.SHIELD_IDS).is_empty() or ship.ids.has(CombatSystems.POINT_DEFENSE)
	if ship.engines.is_empty() and not has_defenses:
		return
	var destinations: Array = []
	for member in ship.crew:
		if member.role == "pilot":
			member.at = member.path[-1]
			member.pos = Vector2(member.at)
			member.path.clear()
			ship.parts[member.station].staffed = 1
			destinations.append(member.station)
			break
	destinations.append_array(ship.engines)
	destinations.append_array(_ids_of(ship, CombatSystems.SHIELD_IDS))
	destinations.append_array(ship.ids.get(CombatSystems.POINT_DEFENSE, []))
	var reactors := _ids_of(ship, CombatSystems.REACTOR_IDS)
	for uid in destinations:
		var p: Dictionary = ship.parts[uid]
		for rid in reactors:
			var reactor: Dictionary = ship.parts[rid]
			if _path(ship, reactor.cell, uid).is_empty():
				continue
			var requested := int(p.capacity) if p.id == Special.BOOST else (mini(p.capacity, 6000) if p.id == CombatSystems.SHIELD_LARGE else (mini(p.capacity, 3000) if p.id == CombatSystems.SHIELD_SMALL else mini(p.capacity, int(reactor.stats.pickup_quantity))))
			var quantity := mini(int(reactor.energy), requested - int(p.energy))
			p.energy += quantity
			reactor.energy -= quantity
			if p.id == BRIDGE and p.energy > 0:
				ship.command = true
			if p.energy >= requested:
				break
	for uid in ship.ids.get(Special.BOOST, []):
		Special.update_boost_ready(ship, ship.parts[uid])
	for uid in ship.ids.get(Special.ROCKET, []):
		Special.update_rocket(ship, ship.parts[uid])
	CombatSystems.activate_initial_shields(ship)


func select_target(uid: int) -> bool:
	if result != "active" or not _alive(enemy, uid):
		return false
	target_uid = uid
	return true


static func _build_ship(design) -> Dictionary:
	var ship := {
		"parts": {}, "cells": {}, "crew": [], "speed": float(design.crew_speed),
		"shots": 0, "hits": 0, "deliveries": 0, "ids": {}, "command": false,
		"engines": [], "consumers": [], "rocket_graph":{"nozzles":{}, "consumers":{}},
		"design":{"parts":design.parts.duplicate(true),"by_id":design.by_id},
		"blocked_cells": {}
	}
	for item in design.parts:
		var row: Dictionary = design.by_id[item.id]
		var stats: Dictionary = row.stats
		var part: Dictionary = item.duplicate()
		var walk_factor := 0.0
		if item.id in [REACTOR, GUN, BRIDGE, BUNK, CORRIDOR] or stats.has("nozzles") or stats.has("special_propulsion") or CombatSystems.is_walkable_expansion(item.id):
			walk_factor = float(row.crew_speed_factor) / float(design.by_id[CORRIDOR].crew_speed_factor)
		part.merge({
			"hp": float(row.max_health), "max_hp": float(row.max_health),
			"stats": stats, "health_type": row.get("health_type", "Operational"),
			"walk_factor": walk_factor,
			"capacity": int(stats.get("battery_capacity", 0)), "energy": 0,
			"shots": 0, "staffed": 0, "clock": 0, "ready": 0, "release": -1,
			"acquired": false, "pickups": 0, "deliveries": 0,
		})
		if CombatSystems.is_reactor(part.id):
			part.energy = part.capacity
		Flight.prepare_part(part, row)
		CombatSystems.prepare_part(part)
		if part.id in [Special.ROCKET, Special.EXTENDER]:
			part.seats = []
			var source: Dictionary = part.stats.special_propulsion
			for local in source.get("crew_locations", []):
				part.seats.append(Flight.mount_point(part, Vector2(local[0], local[1])))
			for local in source.get("blocked_travel_cells", []):
				var blocked := Flight.mount_point(part, Vector2(local[0] + 0.5, local[1] + 0.5))
				ship.blocked_cells[Vector2i(blocked.floor())] = true
		if not part.nozzles.is_empty():
			ship.engines.append(part.uid)
		if part.id in [BRIDGE, Special.EXTENDER, Special.BATTERY, CombatSystems.POINT_DEFENSE] or CombatSystems.is_shield(part.id) or CombatSystems.is_weapon(part.id) or not part.nozzles.is_empty():
			ship.consumers.append(part.uid)
		ship.parts[part.uid] = part
		if not ship.ids.has(part.id):
			ship.ids[part.id] = []
		ship.ids[part.id].append(part.uid)
		for x in part.size.x:
			for y in part.size.y:
				ship.cells[part.cell + Vector2i(x, y)] = part.uid
		if CombatSystems.is_bunk(part.id):
			for berth in int(stats.crew_capacity):
				var tile: Vector2i = part.cell + Vector2i(berth % part.size.x, floori(float(berth) / part.size.x) % part.size.y)
				ship.crew.append({
					"uid": ship.crew.size(), "home": part.uid, "role": "carrier", "at": tile, "pos": Vector2(tile),
					"alive": true, "path": [], "cargo": 0, "station": -1,
					"source": -1, "delivery": -1, "goal": -1, "retry": 0, "seat":null
				})
	# Staff the bridge and weapons from reachable berths, leaving a courier to supply them.
	var available: int = ship.crew.size()
	var assigned := {}
	var phase_groups: Array = [[BRIDGE], CombatSystems.WEAPON_IDS, [Special.ROCKET], [BRIDGE]]
	for phase in phase_groups.size():
		for id in phase_groups[phase]:
			for uid in ship.ids.get(id, []):
				if available <= 1:
					break
				if assigned.has(uid):
					continue
				var slots: int = ship.parts[uid].stats.special_propulsion.crew_required if id == Special.ROCKET else int(ship.parts[uid].stats.get("crew_required", 1))
				for slot in mini(slots, available - 1):
					var member: Dictionary = {}
					var shortest: Array = []
					var seat: Variant = null
					var seat_tile: Variant = null
					if id == Special.ROCKET and slot < ship.parts[uid].seats.size():
						seat = ship.parts[uid].seats[slot]
						seat_tile = Vector2i(seat.floor())
					for crew in ship.crew:
						if crew.station >= 0:
							continue
						var path := _path(ship, crew.at, uid, seat_tile)
						if not path.is_empty() and (member.is_empty() or path.size() < shortest.size()):
							member = crew
							shortest = path
					if member.is_empty():
						break
					member.station = uid
					member.seat = seat
					member.role = "pilot" if id == BRIDGE else ("rocket_operator" if id == Special.ROCKET else "gunner")
					member.goal = uid
					member.path = shortest
					assigned[uid] = true
					available -= 1
				if phase == 0 and assigned.has(uid):
					break
	if ship.ids.has(Special.ROCKET) or ship.ids.has(Special.EXTENDER) or ship.ids.has(Special.BATTERY):
		Special.refresh_network(ship)
	if ship.ids.has(CombatSystems.RAILGUN_LAUNCHER):
		CombatSystems.refresh_railguns(ship)
	EngineRoom.setup(ship)
	return ship


static func _launch_issue(ship: Dictionary) -> String:
	for pair in [
		[CombatSystems.BUNK_IDS, "승무원 침실"],
		[[BRIDGE], "소형 조종실"],
		[CombatSystems.REACTOR_IDS, "원자로"],
		[CombatSystems.WEAPON_IDS, "무기"],
	]:
		if _ids_of(ship, pair[0]).is_empty():
			return "%s 부품이 필요합니다." % pair[1]
	if not _connected_hull(ship.cells):
		return "떨어진 부품이 있습니다. 모든 부품의 한 변을 선체와 맞닿게 배치하세요."
	if ship.crew.size() < 3:
		return "조종사·사수·운반원용 침상 3개 이상이 필요합니다."
	var pilot := false
	var gunner := false
	var supply_bridge := false
	var supply_gun := false
	var reactors := _ids_of(ship, CombatSystems.REACTOR_IDS)
	for crew in ship.crew:
		pilot = pilot or crew.role == "pilot"
		gunner = gunner or crew.role == "gunner"
		if crew.role != "carrier":
			continue
		for source in reactors:
			if _path(ship, crew.at, source).is_empty():
				continue
			for worker in ship.crew:
				if worker.station == -1 or _path(ship, ship.parts[source].cell, worker.station).is_empty():
					continue
				supply_bridge = supply_bridge or worker.role == "pilot"
				supply_gun = supply_gun or worker.role == "gunner"
	if not pilot or not gunner:
		return "침실에서 조종실과 레이저까지 통로를 연결하세요."
	if not supply_bridge or not supply_gun:
		return "운반원이 침실에서 원자로를 거쳐 조종실과 레이저에 닿도록 통로를 연결하세요."
	return ""


## Require a single edge-connected launch footprint. During battle disconnected
## sections retain their grid position; only crew paths and systems lose access.
static func _connected_hull(cells: Dictionary) -> bool:
	if cells.is_empty():
		return false
	var origin: Vector2i = cells.keys()[0]
	var queue: Array[Vector2i] = [origin]
	var seen := {origin: true}
	var cursor := 0
	while cursor < queue.size():
		var tile := queue[cursor]
		cursor += 1
		for direction: Vector2i in NEIGHBORS:
			var next := tile + direction
			if cells.has(next) and not seen.has(next):
				seen[next] = true
				queue.append(next)
	return queue.size() == cells.size()


static func _alive(ship: Dictionary, uid: int) -> bool:
	return ship.parts.has(uid) and ship.parts[uid].hp > 0


static func _choose_target(ship: Dictionary, priorities: Array) -> int:
	for id in priorities:
		for uid in ship.ids.get(id, []):
			if _alive(ship, uid):
				return uid
	return -1


## Start and finish inside the relevant rooms. All other cells must be live corridor.
## Returned waypoints exclude the starting cell; floors of adjacent rooms do not connect.
static func _path(ship: Dictionary, origin: Vector2i, goal: int, seat_tile: Variant = null) -> Array:
	var from: int = ship.cells.get(origin, -1)
	if not _alive(ship, from) or not _alive(ship, goal):
		return []
	if from == goal and (seat_tile == null or origin == seat_tile):
		return [origin]
	var queue: Array[Vector2i] = [origin]
	var previous := {origin: origin}
	var index := 0
	while index < queue.size():
		var current := queue[index]
		var current_uid: int = ship.cells[current]
		index += 1
		for direction: Vector2i in NEIGHBORS:
			var next := current + direction
			var uid: int = ship.cells.get(next, -1)
			if previous.has(next) or ship.blocked_cells.has(next) or not _alive(ship, uid):
				continue
			var is_corridor: bool = ship.parts[uid].id == CORRIDOR
			if uid != from and uid != goal and not is_corridor:
				continue
			if uid != current_uid and not is_corridor and ship.parts[current_uid].id != CORRIDOR:
				continue
			previous[next] = current
			if uid == goal and (seat_tile == null or next == seat_tile):
				var route: Array[Vector2i] = []
				while next != origin:
					route.append(next)
					next = previous[next]
				route.reverse()
				return route
			queue.append(next)
	return []


func step(seconds: float) -> void:
	if result != "active" or not is_finite(seconds) or seconds <= 0:
		return
	_remaining += seconds
	var count := floori((_remaining + 1e-10) * HZ)
	_remaining = maxf(0, _remaining - count * DT)
	for i in count:
		if result != "active":
			break
		_tick += 1
		elapsed = _tick * DT
		var orders := Flight.ai_orders(enemy, player, elapsed, str(mission.get("ai", "balanced")))
		Flight.advance(player, _move, _turn, DT)
		Flight.advance(enemy, Vector2(orders.x, orders.y), orders.z, DT)
		Flight.resolve_contact(player, enemy)
		_fly()
		_resolve()
		if result != "active":
			break
		if not _alive(enemy, target_uid):
			target_uid = _choose_target(enemy, CombatSystems.WEAPON_IDS if mission.get("objective") == "disarm" else [BRIDGE])
		if not _alive(player, enemy_target_uid):
			enemy_target_uid = _choose_target(player, [BRIDGE])
		ion_beams.clear()
		_operate(player, enemy, "player", target_uid)
		_operate(enemy, player, "enemy", enemy_target_uid)


func _operate(ship: Dictionary, other: Dictionary, side: String, target: int) -> void:
	for uid in _ids_of(ship, CombatSystems.REACTOR_IDS):
		var part: Dictionary = ship.parts[uid]
		if part.hp <= 0 or part.energy == part.capacity:
			part.clock = 0
			continue
		part.clock += 1
		if part.clock >= roundi(part.stats.production_interval * HZ):
			part.energy = mini(part.capacity, part.energy + int(part.stats.production_quantity))
			part.clock = 0
	for id in [BRIDGE, Special.ROCKET] + CombatSystems.WEAPON_IDS:
		for uid in ship.ids.get(id, []):
			ship.parts[uid].staffed = 0
	for crew in ship.crew:
		if crew.alive:
			_crew_tick(ship, crew, side)
	ship.command = false
	for uid in ship.ids[BRIDGE]:
		var part: Dictionary = ship.parts[uid]
		if part.hp <= 0 or part.staffed <= 0 or part.energy <= 0:
			continue
		part.clock += 1
		if part.clock >= roundi(part.stats.drain_interval * HZ):
			part.energy = maxi(0, part.energy - int(part.stats.drain_quantity))
			part.clock = 0
		ship.command = ship.command or part.energy > 0
	for uid in _ids_of(ship, CombatSystems.PROJECTILE_WEAPON_IDS):
		var gun: Dictionary = ship.parts[uid]
		var need_crew := int(gun.stats.get("crew_required", 1))
		if gun.hp <= 0 or gun.staffed < need_crew or not ship.command or gun.energy < gun.stats.min_resources_used or not _alive(other, target):
			gun.aim_status = "offline"
			gun.release = -1
			continue
		var is_homing := bool(gun.stats.get("homing", false))
		var eff_range := float(gun.stats.range) * float(gun.get("rail_range_mult", 1.0))
		if is_homing:
			var muzzle_pos := grid_world(ship, gun.mount_local)
			var target_pos := part_world(other, target)
			if muzzle_pos.distance_to(target_pos) > eff_range:
				gun.aim_status = "out_of_range"
				gun.release = -1
				continue
			gun.aim_status = "ready"
			gun.turret_angle_local = gun.rest_angle
		elif not Flight.aim(ship, other, gun, target, DT):
			gun.release = -1
			continue
		if not gun.acquired:
			gun.acquired = true
			if side == "enemy":
				gun.ready = _tick + ACQUIRE_TICKS
		if gun.release < 0:
			if _tick < gun.ready:
				continue
			gun.release = _tick + roundi(gun.stats.fire_delay * HZ)
			gun.ready = _tick + roundi(float(gun.stats.fire_interval) * float(gun.get("rail_reload_mult", 1.0)) * HZ)
		if _tick >= gun.release:
			gun.release = -1
			var muzzle := grid_world(ship, gun.mount_local)
			var direction := Vector2.from_angle(ship.heading + gun.turret_angle_local)
			var spent := mini(gun.energy, int(gun.stats.battery_per_shot))
			gun.energy -= spent
			gun.shots += 1
			ship.shots += 1
			var eff_speed := float(gun.stats.projectile_speed) * float(gun.get("rail_speed_mult", 1.0))
			var dmg_mult := float(gun.get("rail_damage_mult", 1.0))
			projectiles.append({
				"side": side, "source_uid": uid, "target_uid": target, "aim_uid": target, "progress": 0.0,
				"kind": str(gun.stats.get("weapon_kind", "laser")),
				"homing": is_homing,
				"turn_rate": deg_to_rad(float(gun.stats.get("turn_rate_deg", 0.0))),
				"hp": float(gun.stats.get("missile_hp", 0.0)),
				"shield_damage_mult": float(gun.stats.get("shield_damage_mult", 1.0)),
				"shield_energy_drain": int(gun.stats.get("shield_energy_drain", 0)),
				"pierce": int(gun.stats.get("pierce", 0)),
				"hit_uids": {},
				"ignite": float(gun.stats.get("ignite_intensity", 0.0)),
				"pos": muzzle, "previous_pos": muzzle,
				"velocity": Flight.point_velocity(ship, muzzle) + direction * eff_speed,
				"travelled": 0.0, "range": eff_range,
				"speed": eff_speed,
				"power": float(spent) / gun.stats.battery_per_shot,
				"damage": float(gun.stats.damage) * dmg_mult,
				"structural_damage": float(gun.stats.structural_damage) * dmg_mult,
			})
			_record("shot", side, uid, target)
	var active_ions := CombatSystems.tick_ion_beams(ship, other, side, target, DT)
	for beam in active_ions:
		ion_beams.append(beam)
		if beam.hit_kind == "shield":
			_last_hit = _tick
			if beam.collapsed:
				_record("shield_down", side, int(beam.hit_uid), target)
				events[-1].pos = beam.to
		elif beam.hit_kind == "hull":
			_last_hit = _tick
			if beam.ignited:
				_record("fire_start", "enemy" if side == "player" else "player", int(beam.hit_uid), int(beam.hit_uid))
				events[-1].pos = beam.to
			if beam.destroyed:
				_on_part_destroyed(other, int(beam.hit_uid), side, target, beam.to)
		if _tick % 18 == 0:
			ship.shots += 1
			if beam.hit_kind != "miss":
				ship.hits += 1
			_record("shot", side, int(beam.source_uid), target)
	var fire_report := CombatSystems.tick_fires(ship, DT)
	for ext_uid in fire_report.extinguished:
		_record("fire_out", side, int(ext_uid), int(ext_uid))
	for dead_uid in fire_report.destroyed:
		var attacker := "enemy" if side == "player" else "player"
		_on_part_destroyed(ship, int(dead_uid), attacker, int(dead_uid), part_world(ship, int(dead_uid)))
	CombatSystems.tick_shields(ship, DT)
	var pd_shots := CombatSystems.tick_point_defense(ship, side, projectiles, DT)
	if not pd_shots.is_empty():
		var killed_indices: Array[int] = []
		for s in pd_shots:
			pd_beams.append({"from": s.from, "to": s.to, "side": side, "ttl": 0.14})
			if s.killed and not (int(s.proj_index) in killed_indices):
				killed_indices.append(int(s.proj_index))
				_record("intercept", side, int(s.pd_uid), int(s.pd_uid))
				events[-1].pos = s.to
		killed_indices.sort()
		killed_indices.reverse()
		for idx in killed_indices:
			if idx >= 0 and idx < projectiles.size():
				projectiles.remove_at(idx)
	for uid in ship.ids.get(Special.BOOST, []):
		Special.update_boost_ready(ship, ship.parts[uid])
	for uid in ship.ids.get(Special.ROCKET, []):
		Special.update_rocket(ship, ship.parts[uid])


func _crew_tick(ship: Dictionary, crew: Dictionary, side: String) -> void:
	if crew.station >= 0 and not _alive(ship, crew.station):
		crew.station = -1
		crew.role = "carrier"
		crew.seat = null
	if not crew.path.is_empty():
		var next: Vector2i = crew.path[0]
		# An interrupted leg retreats continuously to the previous intact tile.
		if not _alive(ship, ship.cells[next]):
			crew.pos = Vector2(crew.pos).move_toward(Vector2(crew.at), ship.speed * DT)
			if crew.pos.is_equal_approx(Vector2(crew.at)):
				crew.path.clear()
				crew.goal = -1
			return
		var floor_id: int = ship.cells[crew.at]
		var factor: float = ship.parts[floor_id].walk_factor
		crew.pos = Vector2(crew.pos).move_toward(Vector2(next), ship.speed * factor * DT)
		if not crew.pos.is_equal_approx(Vector2(next)):
			return
		crew.at = next
		crew.path.pop_front()
		if not crew.path.is_empty():
			return
	if crew.station >= 0:
		var seat_tile: Variant = Vector2i(crew.seat.floor()) if crew.seat != null else null
		if ship.cells[crew.at] == crew.station and (seat_tile == null or crew.at == seat_tile):
			if crew.seat != null:
				var seat_pos: Vector2 = crew.seat - Vector2(0.5, 0.5)
				crew.pos = Vector2(crew.pos).move_toward(seat_pos, ship.speed * ship.parts[crew.station].walk_factor * DT)
				if not crew.pos.is_equal_approx(seat_pos):
					return
			ship.parts[crew.station].staffed += 1
		elif _tick >= crew.retry:
			crew.path = _path(ship, crew.at, crew.station, seat_tile)
			crew.retry = _tick + HZ / 2
		return
	if crew.goal >= 0 and ship.cells[crew.at] == crew.goal:
		if crew.goal == crew.source and _alive(ship, crew.source):
			var reactor: Dictionary = ship.parts[crew.source]
			var quantity: int = reactor.stats.pickup_quantity
			if reactor.energy >= quantity:
				reactor.energy -= quantity
				reactor.pickups += 1
				crew.cargo = quantity
			crew.source = -1
		elif crew.goal == crew.delivery and _alive(ship, crew.delivery) and crew.cargo > 0 and not Special.outlets(ship, crew.delivery).is_empty():
			var consumer: Dictionary = ship.parts[crew.delivery]
			var accepted := Special.deliver(ship, Special.outlets(ship, crew.delivery), crew.cargo)
			if consumer.stats.has("special_propulsion"):
				crew.cargo -= accepted
			else:
				# Ordinary batteries follow LoseExcessOnDelivery from resource rules.
				crew.cargo = 0
			if accepted > 0:
				consumer.deliveries += 1
				ship.deliveries += 1
				_record("delivery", side, crew.delivery, crew.delivery)
			crew.delivery = -1
		crew.goal = -1
	if crew.cargo > 0 and not Special.outlets(ship, crew.delivery).is_empty():
		var route := _path(ship, crew.at, crew.delivery)
		if not route.is_empty():
			crew.path = route
			crew.goal = crew.delivery
			return
	crew.delivery = -1
	crew.source = -1
	if _tick >= crew.retry:
		_find_job(ship, crew)
		crew.retry = _tick + HZ / 2


func _find_job(ship: Dictionary, crew: Dictionary) -> void:
	# Compare storage including cells reserved by other couriers so parallel
	# deliveries can serve different consumers. An empty bridge has precedence.
	var best := INF
	for uid in ship.consumers:
		var consumer: Dictionary = ship.parts[uid]
		var stores := Special.outlets(ship, uid)
		if stores.is_empty():
			continue
		var promised := Special.total(ship, stores, "energy")
		var room := Special.total(ship, stores, "capacity")
		var has_staff: bool = not consumer.nozzles.is_empty() or consumer.id in [Special.BATTERY, Special.EXTENDER, CombatSystems.POINT_DEFENSE] or CombatSystems.is_shield(consumer.id)
		for other in ship.crew:
			if not other.alive:
				continue
			has_staff = has_staff or other.station == uid
			if other.uid != crew.uid and other.delivery >= 0 and Special.overlaps(stores, Special.outlets(ship, other.delivery)):
				if other.cargo > 0:
					promised += int(other.cargo)
				elif _alive(ship, other.source):
					promised += int(ship.parts[other.source].stats.pickup_quantity)
		if not has_staff:
			continue
		var threshold: int = consumer.stats.get("resupply_threshold", 1)
		if room - promised < threshold:
			continue
		var priority: float = float(promised) / room
		if consumer.id == BRIDGE:
			priority += -2.0 if promised == 0 else 1.0
		var sources: Array = [-1] if crew.cargo > 0 else _ids_of(ship, CombatSystems.REACTOR_IDS)
		for source in sources:
			var goal: int = uid if source == -1 else source
			var route := _path(ship, crew.at, goal)
			if route.is_empty():
				continue
			var cost := float(route.size())
			if source != -1:
				var reactor: Dictionary = ship.parts[source]
				var available: int = reactor.energy
				for other in ship.crew:
					if other.alive and other.uid != crew.uid and other.source == source:
						available -= int(reactor.stats.pickup_quantity)
				if available < reactor.stats.pickup_quantity:
					continue
				var onward := _path(ship, route[-1], uid)
				if onward.is_empty():
					continue
				cost += onward.size()
			var score: float = priority + cost / 10000.0
			if score < best:
				best = score
				crew.source = source
				crew.delivery = uid
				crew.goal = goal
				crew.path = route


func _fly() -> void:
	for j in range(pd_beams.size() - 1, -1, -1):
		pd_beams[j].ttl = float(pd_beams[j].ttl) - DT
		if pd_beams[j].ttl <= 0.0:
			pd_beams.remove_at(j)
	for i in range(projectiles.size() - 1, -1, -1):
		var bolt := projectiles[i]
		var victim := enemy if bolt.side == "player" else player
		var actor := player if bolt.side == "player" else enemy
		var dt := minf(DT, (bolt.range - bolt.travelled) / float(bolt.speed))
		if bolt.get("homing", false):
			var lock_uid: int = int(bolt.target_uid)
			if not _alive(victim, lock_uid):
				lock_uid = _choose_target(victim, [BRIDGE] + CombatSystems.WEAPON_IDS)
				bolt.target_uid = lock_uid
			if _alive(victim, lock_uid):
				var desired := (part_world(victim, lock_uid) - Vector2(bolt.pos)).angle()
				var vel: Vector2 = bolt.velocity
				var cur_angle := vel.angle() if vel.length_squared() > 1e-6 else desired
				var max_step := float(bolt.get("turn_rate", 2.0)) * dt
				var next_angle := cur_angle + clampf(wrapf(desired - cur_angle, -PI, PI), -max_step, max_step)
				bolt.velocity = Vector2.from_angle(next_angle) * float(bolt.speed)
		bolt.previous_pos = bolt.pos
		bolt.pos += Vector2(bolt.velocity) * dt
		bolt.travelled = minf(bolt.range, bolt.travelled + bolt.speed * dt)
		bolt.progress = bolt.travelled / bolt.range
		var shield_hit := CombatSystems.intercept_shield(victim, bolt.previous_pos, bolt.pos)
		if not shield_hit.is_empty():
			projectiles.remove_at(i)
			var shield_uid: int = shield_hit.uid
			var shield_part: Dictionary = victim.parts[shield_uid]
			var s_dmg := float(bolt.damage) * float(bolt.power) * float(bolt.get("shield_damage_mult", 1.0))
			var collapsed := CombatSystems.apply_shield_damage(shield_part, s_dmg, int(bolt.get("shield_energy_drain", 0)))
			actor.hits += 1
			_last_hit = _tick
			_record("shield_hit", bolt.side, shield_uid, bolt.target_uid)
			events[-1].pos = shield_hit.pos
			if collapsed:
				_record("shield_down", bolt.side, shield_uid, bolt.target_uid)
				events[-1].pos = shield_hit.pos
			continue
		var contact := Flight.trace(victim, bolt.previous_pos, bolt.pos)
		if contact.is_empty():
			if bolt.progress >= 1.0:
				projectiles.remove_at(i)
				actor.misses += 1
				_record("miss", bolt.side, bolt.source_uid, bolt.target_uid)
			continue
		var uid: int = contact.uid
		var hit_uids: Dictionary = bolt.get("hit_uids", {})
		if hit_uids.has(uid):
			if bolt.progress >= 1.0:
				projectiles.remove_at(i)
			continue
		hit_uids[uid] = true
		var pierce_left := int(bolt.get("pierce", 0))
		if pierce_left > 0:
			bolt["pierce"] = pierce_left - 1
		else:
			projectiles.remove_at(i)
		var part: Dictionary = victim.parts[uid]
		var damage: float = bolt.structural_damage if part.health_type == "Structural" else bolt.damage
		part.hp = maxf(0.0, part.hp - damage * bolt.power)
		actor.hits += 1
		_last_hit = _tick
		_record("hit", bolt.side, uid, bolt.target_uid)
		events[-1].pos = contact.pos
		var ignite := float(bolt.get("ignite", 0.0))
		if part.hp > 0.0 and ignite > 0.0 and CombatSystems.ignite_part(part, ignite):
			_record("fire_start", "enemy" if bolt.side == "player" else "player", uid, uid)
			events[-1].pos = contact.pos
		if part.hp == 0:
			_on_part_destroyed(victim, uid, bolt.side, bolt.target_uid, contact.pos)


func _on_part_destroyed(victim: Dictionary, uid: int, attacker_side: String, target: int, pos: Vector2) -> void:
	var part: Dictionary = victim.parts[uid]
	part.staffed = 0
	part.energy = 0
	part["fire"] = 0.0
	for crew in victim.crew:
		var tile := Vector2i(Vector2(crew.pos).round())
		if victim.cells.get(tile, -1) == uid or victim.cells[crew.at] == uid:
			crew.alive = false
			crew.cargo = 0
			crew.path.clear()
	if part.id in [Special.ROCKET, Special.EXTENDER, Special.BATTERY]:
		Special.refresh_network(victim)
	if part.id in CombatSystems.RAILGUN_PART_IDS:
		CombatSystems.refresh_railguns(victim)
	if part.id == Special.BOOST and part.boost_active:
		Special.set_boost(victim, part, false)
	Flight.refresh_mass(victim)
	_record("destroyed", attacker_side, uid, target)
	events[-1].pos = pos


func _resolve() -> void:
	var ours := _choose_target(player, [BRIDGE]) >= 0
	var theirs := _choose_target(enemy, [BRIDGE]) >= 0
	match mission.get("objective", "duel"):
		"survive":
			if not ours:
				_finish("loss", "own_bridge")
			elif elapsed >= float(mission.seconds):
				_finish("win", "survived")
			return
		"disarm":
			if not ours:
				_finish("loss", "own_bridge")
			elif not theirs:
				_finish("loss", "protected_bridge")
			elif _choose_target(enemy, CombatSystems.WEAPON_IDS) < 0:
				_finish("win", "disarmed")
			elif projectiles.is_empty() and _choose_target(player, CombatSystems.WEAPON_IDS) < 0:
				_finish("loss", "own_weapons")
			elif _tick - _last_hit >= STALEMATE_TICKS:
				_finish("draw", "stalemate")
			return
	if not ours or not theirs:
		if ours:
			_finish("win", "enemy_bridge")
		elif theirs:
			_finish("loss", "own_bridge")
		else:
			_finish("draw", "mutual_bridge")
	elif projectiles.is_empty() and _choose_target(player, CombatSystems.WEAPON_IDS) < 0 and _choose_target(enemy, CombatSystems.WEAPON_IDS) < 0:
		_finish("draw", "mutual_weapons")
	elif _tick - _last_hit >= STALEMATE_TICKS:
		_finish("draw", "stalemate")


func _finish(outcome: String, reason: String) -> void:
	result = outcome
	outcome_reason = reason


func _record(kind: String, side: String, uid: int, target: int) -> void:
	events.append({"time": elapsed, "kind": kind, "side": side, "uid": uid, "target_uid": target})
	if events.size() > 128:
		events.pop_front()
