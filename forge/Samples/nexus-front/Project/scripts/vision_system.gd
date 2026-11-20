extends RefCounted
## Native terrain-memory-v1: exact actor LOS, 10 Hz raster and observation snapshots.
## Attack-origin clues never grant sight, exploration, selection or tracking.

const PROFILE = "terrain-memory-v1"
const CELL_SIZE = 40.0
const REFRESH_SECONDS = 0.1
const REVEAL_RADIUS = 76.0
const STRUCTURE_KINDS = ["tower", "inhibitor", "nexus"]
const OBJECTIVE_KINDS = ["camp", "dragon", "boss"]
const SCOUT_KINDS = ["scout", "scout_hold", "vision", "reveal_travel"]

var world
var cols: int = 0
var rows: int = 0
var revision: int = 0
var metrics = {"refreshes": 0, "sampled_cells": 0, "los_tests": 0, "last_refresh_usec": 0}
var _visible: Array = []
var _explored: Array = []
var _structures: Array = [{}, {}]
var _objectives: Array = [{}, {}]
var _reveals: Array = []
var _emitters: Array = [[], []]
var _walls: Array = []
var _heights: Array = []
var _brushes: Array = []
var _cell_heights = PackedInt32Array()
var _cell_walls = PackedByteArray()
var _next_refresh: float = 0.0
var _next_reveal: int = 0
var _emitter_count: int = -1
var _last_emitter_time: float = -100.0

func _init(p_world) -> void:
	world = p_world
	cols = ceili(float(world.size) / CELL_SIZE)
	rows = ceili(float(world.size) / CELL_SIZE)
	for _team in range(2):
		var v = PackedByteArray()
		v.resize(cols * rows)
		v.fill(0)
		_visible.append(v)
		_explored.append(v.duplicate())
	_walls = _prepare_circles(world.map.get("obstacles", []))
	_heights = _prepare_circles(world.map.get("highGrounds", []))
	_brushes = _prepare_circles(world.map.get("brushes", []))
	_build_cell_geometry()

func _build_cell_geometry() -> void:
	_cell_heights.resize(cols * rows)
	_cell_walls.resize(cols * rows)
	_cell_walls.fill(0)
	for y in range(rows):
		for x in range(cols):
			var index: int = y * cols + x
			var point = Vector2((x + 0.5) * CELL_SIZE, (y + 0.5) * CELL_SIZE)
			_cell_heights[index] = ground_height(point)
			for wall in _walls:
				if point.distance_squared_to(wall.pos) < wall.r * wall.r:
					_cell_walls[index] = 1
					break

func _raster_blockers(origin: Vector2, sight: float, tier: int) -> Array:
	# A source only tests blockers intersecting its sight disk, never the whole map.
	var candidates: Array = []
	for wall in _walls:
		var reach: float = sight + float(wall.r)
		if origin.distance_squared_to(wall.pos) < reach * reach:
			candidates.append(wall)
	for plateau in _heights:
		var reach: float = sight + float(plateau.r)
		if plateau.tier > tier and origin.distance_squared_to(plateau.pos) < reach * reach:
			candidates.append(plateau)
	return candidates

func _clear_blockers(origin: Vector2, point: Vector2, candidates: Array) -> bool:
	for circle in candidates:
		if _crosses(origin, point, circle.pos, circle.r):
			return false
	return true

func _prepare_circles(source: Array) -> Array:
	var result: Array = []
	for circle in source:
		result.append({"pos": Vector2(float(circle.get("x", 0)), float(circle.get("y", 0))), "r": float(circle.get("r", 0)), "tier": int(circle.get("tier", 1))})
	return result

func ground_height(pos: Vector2) -> int:
	var tier: int = 0
	for circle in _heights:
		if pos.distance_squared_to(circle.pos) <= circle.r * circle.r:
			tier = maxi(tier, circle.tier)
	return tier

func _crosses(a: Vector2, b: Vector2, center: Vector2, radius: float) -> bool:
	# Segment/circle interior intersection; a tangent does not obstruct sight.
	if maxf(a.x, b.x) <= center.x - radius or minf(a.x, b.x) >= center.x + radius or maxf(a.y, b.y) <= center.y - radius or minf(a.y, b.y) >= center.y + radius:
		return false
	var delta: Vector2 = b - a
	var length_sq: float = delta.length_squared()
	if length_sq < 0.000001:
		return a.distance_squared_to(center) < radius * radius - 0.0001
	var t: float = clampf((center - a).dot(delta) / length_sq, 0.0, 1.0)
	return (a + delta * t).distance_squared_to(center) < radius * radius - 0.0001

func has_line_of_sight(a: Vector2, b: Vector2) -> bool:
	if not a.is_finite() or not b.is_finite():
		return false
	var source_tier: int = ground_height(a)
	if ground_height(b) > source_tier:
		return false
	for wall in _walls:
		if _crosses(a, b, wall.pos, wall.r):
			return false
	for plateau in _heights:
		if plateau.tier > source_tier and _crosses(a, b, plateau.pos, plateau.r):
			return false
	return true

func _in_bounds(pos: Vector2) -> bool:
	return pos.is_finite() and pos.x >= 0 and pos.y >= 0 and pos.x <= float(world.size) and pos.y <= float(world.size)

func _refresh_emitters() -> void:
	_emitters = [[], []]
	for team in range(2):
		var base_pos: Vector2 = world.bases[team]
		_emitters[team].append({"pos": base_pos, "range": 450.0, "flying": false, "brush": false})
	for unit in world.entities:
		var team: int = int(unit.get("team", 2))
		if team < 0 or team > 1 or not unit.get("alive", false):
			continue
		var sight: float = 250.0
		match unit.get("kind", ""):
			"hero", "tower": sight = 420.0
			"nexus": sight = 450.0
			"inhibitor": sight = 270.0
			"ward": sight = 480.0
		var custom: float = float(unit.get("vision_range", sight))
		_emitters[team].append({"unit": unit, "range": custom, "flying": false, "brush": false})
	if world.abilities != null:
		for effect in world.abilities.effects:
			if effect.get("kind", "") not in SCOUT_KINDS or float(effect.get("until", 0)) <= float(world.time):
				continue
			var team: int = int(effect.get("team", 2))
			if team >= 0 and team <= 1 and effect.get("pos") is Vector2:
				_emitters[team].append({"effect": effect, "range": float(effect.get("radius", 220.0)), "flying": true, "brush": true})
	_emitter_count = world.entities.size()
	_last_emitter_time = float(world.time)

func _ensure_emitters() -> void:
	if _emitter_count != world.entities.size() or float(world.time) - _last_emitter_time >= REFRESH_SECONDS or float(world.time) < _last_emitter_time:
		_refresh_emitters()

func _emitter_pos(emitter: Dictionary) -> Vector2:
	if emitter.has("unit"):
		return emitter.unit.pos
	if emitter.has("effect"):
		return emitter.effect.pos
	return emitter.pos

func _emitter_alive(emitter: Dictionary) -> bool:
	if emitter.has("unit"):
		return bool(emitter.unit.get("alive", false))
	if emitter.has("effect"):
		return float(emitter.effect.get("until", 0)) > float(world.time)
	return true

func _emitter_sees(emitter: Dictionary, pos: Vector2) -> bool:
	if not _emitter_alive(emitter):
		return false
	var origin: Vector2 = _emitter_pos(emitter)
	var sight: float = float(emitter.range)
	return origin.distance_squared_to(pos) <= sight * sight and (bool(emitter.flying) or has_line_of_sight(origin, pos))

func is_point_visible(pos: Vector2, team: int = 0) -> bool:
	if team < 0 or team > 1 or not _in_bounds(pos):
		return false
	_ensure_emitters()
	for emitter in _emitters[team]:
		if _emitter_sees(emitter, pos):
			return true
	return false

func is_entity_visible(entity: Dictionary, team: int = 0) -> bool:
	if entity.is_empty() or team < 0 or team > 1 or not entity.get("pos") is Vector2:
		return false
	if int(entity.get("team", 2)) == team:
		return true
	if not entity.get("alive", false) and entity.get("kind", "") not in STRUCTURE_KINDS:
		return false
	var pos: Vector2 = entity.pos
	if not _in_bounds(pos):
		return false
	_ensure_emitters()
	var brush = null
	var explicitly_revealed: bool = float(entity.get("revealed_until", 0)) > float(world.time) and int(entity.get("reveal_team", team)) == team
	if entity.get("kind", "") == "hero" and not explicitly_revealed:
		for circle in _brushes:
			if pos.distance_squared_to(circle.pos) <= circle.r * circle.r:
				brush = circle
				break
	for emitter in _emitters[team]:
		if not _emitter_sees(emitter, pos):
			continue
		# A single emitter must independently meet LOS, range and brush access.
		if brush == null or emitter.brush:
			return true
		var origin: Vector2 = _emitter_pos(emitter)
		if origin.distance_squared_to(pos) < 95.0 * 95.0 or origin.distance_squared_to(brush.pos) <= brush.r * brush.r:
			return true
	return false

func is_explored(pos: Vector2, team: int = 0) -> bool:
	if team < 0 or team > 1 or not _in_bounds(pos):
		return false
	var x: int = clampi(int(pos.x / CELL_SIZE), 0, cols - 1)
	var y: int = clampi(int(pos.y / CELL_SIZE), 0, rows - 1)
	return _explored[team][y * cols + x] != 0

func step(_dt: float) -> void:
	_expire_reveals()
	if float(world.time) + 0.000001 >= _next_refresh:
		force_refresh()

func force_refresh() -> void:
	var start: int = Time.get_ticks_usec()
	_expire_reveals()
	_refresh_emitters()
	metrics.sampled_cells = 0
	metrics.los_tests = 0
	for team in range(2):
		var visible: PackedByteArray = _visible[team]
		var explored: PackedByteArray = _explored[team]
		visible.fill(0)
		# Rasterize emitter rectangles and skip cells already covered by allies.
		for emitter in _emitters[team]:
			if not _emitter_alive(emitter):
				continue
			var pos: Vector2 = _emitter_pos(emitter)
			var sight: float = float(emitter.range)
			var source_tier: int = ground_height(pos)
			var blockers: Array = _raster_blockers(pos, sight, source_tier) if not emitter.flying else []
			var left: int = maxi(0, floori((pos.x - sight) / CELL_SIZE))
			var right: int = mini(cols - 1, floori((pos.x + sight) / CELL_SIZE))
			var top: int = maxi(0, floori((pos.y - sight) / CELL_SIZE))
			var bottom: int = mini(rows - 1, floori((pos.y + sight) / CELL_SIZE))
			for y in range(top, bottom + 1):
				for x in range(left, right + 1):
					var index: int = y * cols + x
					if visible[index] != 0:
						continue
					metrics.sampled_cells += 1
					var sample = Vector2((x + 0.5) * CELL_SIZE, (y + 0.5) * CELL_SIZE)
					if pos.distance_squared_to(sample) > sight * sight:
						continue
					metrics.los_tests += 1
					if emitter.flying or (_cell_walls[index] == 0 and _cell_heights[index] <= source_tier and _clear_blockers(pos, sample, blockers)):
						visible[index] = 1
						explored[index] = 1
		_visible[team] = visible
		_explored[team] = explored
	revision += 1
	_next_refresh = float(world.time) + REFRESH_SECONDS
	_observe()
	metrics.refreshes += 1
	metrics.last_refresh_usec = Time.get_ticks_usec() - start

func _structure_snapshot(entity: Dictionary) -> Dictionary:
	var protected: bool = bool(entity.get("protected", false))
	if world.has_method("is_protected"):
		protected = world.is_protected(entity)
	return {"id": int(entity.id), "kind": str(entity.kind), "team": int(entity.team), "pos": entity.pos,
		"r": float(entity.get("r", 25)), "hp": float(entity.hp), "max_hp": float(entity.max_hp),
		"alive": bool(entity.alive), "protected": protected, "name": str(entity.get("name", entity.kind)),
		"lane": str(entity.get("lane", "")), "tier": str(entity.get("tier", "")),
		"attack_range": float(entity.get("attack_range", 0)), "observed_at": float(world.time)}

func _objective_home(entity: Dictionary) -> Vector2:
	for key in ["home_pos", "spawn_pos", "home"]:
		if entity.get(key) is Vector2:
			return entity[key]
	return entity.pos

func _observe() -> void:
	for team in range(2):
		var actual: Dictionary = {}
		for entity in world.entities:
			var kind: String = str(entity.get("kind", ""))
			if kind in STRUCTURE_KINDS:
				actual[int(entity.id)] = true
				if int(entity.team) == team or is_point_visible(entity.pos, team):
					_structures[team][int(entity.id)] = _structure_snapshot(entity)
			elif kind in OBJECTIVE_KINDS:
				var home: Vector2 = _objective_home(entity)
				var old: Dictionary = _objectives[team].get(int(entity.id), {})
				var common = {"id": int(entity.id), "kind": kind, "name": str(entity.get("name", kind)), "home": home, "pos": home, "observed_at": float(world.time)}
				if entity.get("alive", false) and is_entity_visible(entity, team):
					common.merge({"presence": "present", "alive": true, "respawn_at": 0.0, "pos": entity.pos, "hp": float(entity.get("hp", 1)), "max_hp": float(entity.get("max_hp", 1)), "r": float(entity.get("r", 18))}, true)
					_objectives[team][int(entity.id)] = common
				elif is_point_visible(home, team):
					# Empty home is not proof of death; the living actor may be pulled away.
					if old.get("presence", "") == "dead" and float(old.get("respawn_at", 0)) > float(world.time):
						continue
					common["presence"] = "absent"
					common["alive"] = false
					_objectives[team][int(entity.id)] = common
		for id in _structures[team]:
			var old: Dictionary = _structures[team][id]
			if not actual.has(id) and is_point_visible(old.pos, team):
				old.alive = false
				old.hp = 0.0
				old.protected = false
				old.observed_at = float(world.time)

func structure_observations(team: int = 0) -> Array:
	var result: Array = []
	if team < 0 or team > 1:
		return result
	for old in _structures[team].values():
		var item: Dictionary = old.duplicate(true)
		item.visible = int(item.team) == team or is_point_visible(item.pos, team)
		item.remembered = not item.visible
		result.append(item)
	return result

func objective_observation(id: int, team: int = 0) -> Dictionary:
	if team < 0 or team > 1 or not _objectives[team].has(id):
		return {}
	var item: Dictionary = _objectives[team][id].duplicate(true)
	item.visible = is_point_visible(item.pos, team)
	item.remembered = not item.visible
	item.known = item.get("presence", "absent") != "absent"
	return item

func objective_observations(team: int = 0) -> Array:
	var result: Array = []
	if team < 0 or team > 1:
		return result
	for id in _objectives[team]:
		result.append(objective_observation(id, team))
	return result

func record_objective_death(entity: Dictionary, killer_team: int) -> void:
	if entity.get("kind", "") not in OBJECTIVE_KINDS:
		return
	for team in range(2):
		if killer_team == team or is_point_visible(entity.pos, team):
			_objectives[team][int(entity.id)] = {"id": int(entity.id), "kind": str(entity.kind), "name": str(entity.get("name", entity.kind)), "home": _objective_home(entity), "pos": _objective_home(entity), "presence": "dead", "alive": false, "respawn_at": float(entity.get("respawn_at", 0)), "observed_at": float(world.time)}

func reveal_attack(source_team: int, pos: Vector2, victim_team: int, duration: float = 1.5) -> void:
	if source_team < 0 or source_team > 2 or victim_team < 0 or victim_team > 1 or source_team == victim_team or not _in_bounds(pos) or duration <= 0:
		return
	if is_point_visible(pos, victim_team):
		return
	var expiry: float = float(world.time) + minf(duration, 10.0)
	for reveal in _reveals:
		if int(reveal.team) == victim_team and reveal.pos.distance_squared_to(pos) < 4.0:
			reveal.expires_at = maxf(float(reveal.expires_at), expiry)
			return
	_next_reveal += 1
	_reveals.append({"id": _next_reveal, "team": victim_team, "pos": pos, "radius": REVEAL_RADIUS, "created_at": float(world.time), "expires_at": expiry})
	if _reveals.size() > 128:
		_reveals.pop_front()

func _expire_reveals() -> void:
	for index in range(_reveals.size() - 1, -1, -1):
		if float(_reveals[index].expires_at) <= float(world.time):
			_reveals.remove_at(index)

func attack_reveals(team: int = 0) -> Array:
	var result: Array = []
	for reveal in _reveals:
		if int(reveal.team) == team and float(reveal.expires_at) > float(world.time):
			result.append(reveal.duplicate(true))
	return result

func mask(team: int = 0) -> Dictionary:
	team = clampi(team, 0, 1)
	return {"cols": cols, "rows": rows, "cell_size": CELL_SIZE, "width": float(world.size), "height": float(world.size), "visible": _visible[team].duplicate(), "explored": _explored[team].duplicate(), "revision": revision}

func is_walkable(pos: Vector2, radius: float = 12.0) -> bool:
	if not pos.is_finite() or pos.x < radius or pos.y < radius or pos.x > float(world.size) - radius or pos.y > float(world.size) - radius:
		return false
	for wall in _walls:
		var combined: float = float(wall.r) + radius
		if pos.distance_squared_to(wall.pos) < combined * combined - 0.01:
			return false
	return true

func _wall_hit(from: Vector2, to: Vector2, radius: float) -> Dictionary:
	var move: Vector2 = to - from
	var a: float = move.length_squared()
	var best: float = 1.0
	var blocker: Dictionary = {}
	if a < 0.000001:
		return {"t": best, "wall": blocker}
	for wall in _walls:
		var combined: float = float(wall.r) + radius
		if not _crosses(from, to, wall.pos, combined):
			continue
		var offset: Vector2 = from - wall.pos
		var b: float = 2.0 * offset.dot(move)
		var c: float = offset.length_squared() - combined * combined
		var discriminant: float = b * b - 4.0 * a * c
		if discriminant <= 0:
			continue
		var entry: float = (-b - sqrt(discriminant)) / (2.0 * a)
		if entry >= -0.00001 and entry < best:
			best = maxf(0.0, entry)
			blocker = wall
	return {"t": best, "wall": blocker}

func safe_move(from: Vector2, to: Vector2, radius: float = 12.0) -> Vector2:
	if not from.is_finite() or not to.is_finite():
		return from
	radius = maxf(1.0, radius)
	var start: Vector2 = from.clamp(Vector2.ONE * radius, Vector2.ONE * (float(world.size) - radius))
	var target: Vector2 = to.clamp(Vector2.ONE * radius, Vector2.ONE * (float(world.size) - radius))
	# Recover safely from authored spawn/restore positions intersecting a wall.
	for wall in _walls:
		var combined: float = float(wall.r) + radius + 0.05
		if start.distance_squared_to(wall.pos) < combined * combined:
			var normal: Vector2 = start - wall.pos
			if normal.length_squared() < 0.0001:
				normal = Vector2.LEFT
			start = wall.pos + normal.normalized() * combined
	var hit: Dictionary = _wall_hit(start, target, radius)
	if hit.wall.is_empty():
		return target
	var movement: Vector2 = target - start
	var contact: Vector2 = start + movement * maxf(0.0, float(hit.t) - 0.0001)
	var normal: Vector2 = (contact - hit.wall.pos).normalized()
	var remaining: Vector2 = target - contact
	var slide: Vector2 = remaining - normal * minf(0.0, remaining.dot(normal))
	var slide_target: Vector2 = (contact + slide).clamp(Vector2.ONE * radius, Vector2.ONE * (float(world.size) - radius))
	var next_hit: Dictionary = _wall_hit(contact, slide_target, radius)
	return contact.lerp(slide_target, maxf(0.0, float(next_hit.t) - 0.0001))

func navigation_target(from: Vector2, to: Vector2, radius: float = 12.0) -> Vector2:
	# A short deterministic waypoint around the first blocking rock; caller owns movement.
	var hit: Dictionary = _wall_hit(from, to, radius + 5.0)
	if hit.wall.is_empty():
		return to
	var wall: Dictionary = hit.wall
	var distance: float = float(wall.r) + radius + 24.0
	var approach: Vector2 = (from - wall.pos).normalized()
	if approach.length_squared() < 0.1:
		approach = Vector2.LEFT
	var best: Vector2 = from
	var score: float = INF
	for angle in [-1.8, -1.2, -0.7, 0.7, 1.2, 1.8]:
		var candidate: Vector2 = wall.pos + approach.rotated(angle) * distance
		if not is_walkable(candidate, radius) or not _wall_hit(from, candidate, radius).wall.is_empty():
			continue
		var cost: float = from.distance_to(candidate) + candidate.distance_to(to)
		if cost < score:
			score = cost
			best = candidate
	return best

func navigate_direction(from: Vector2, to: Vector2, radius: float = 12.0) -> Vector2:
	return (navigation_target(from, to, radius) - from).normalized()

func export_state() -> Dictionary:
	return {"version": 1, "profile": PROFILE, "map_size": float(world.size), "cell_size": CELL_SIZE,
		"explored": [_explored[0].duplicate(), _explored[1].duplicate()],
		"structures": _structures.duplicate(true), "objectives": _objectives.duplicate(true),
		"reveals": _reveals.duplicate(true), "next_reveal": _next_reveal}

func _valid_number(value, low: float, high: float) -> bool:
	return (value is float or value is int) and is_finite(float(value)) and float(value) >= low and float(value) <= high

func _valid_snapshot(value, objective: bool) -> bool:
	if not value is Dictionary or not value.get("pos") is Vector2 or not _in_bounds(value.pos):
		return false
	if not _valid_number(value.get("id"), 0, 1000000000) or not _valid_number(value.get("observed_at"), 0, float(world.time) + 0.001):
		return false
	if objective:
		return value.get("kind") in OBJECTIVE_KINDS and value.get("presence") in ["present", "absent", "dead"] and value.get("home") is Vector2 and _in_bounds(value.home) and _valid_number(value.get("respawn_at", 0), 0, 1000000000)
	return value.get("kind") in STRUCTURE_KINDS and value.get("team") in [0, 1] and _valid_number(value.get("hp"), 0, 1000000000) and _valid_number(value.get("max_hp"), 1, 1000000000) and value.get("alive") is bool

func import_state(state: Dictionary) -> bool:
	# Validate everything before mutation; rejected loads cannot partially disclose knowledge.
	if state.get("version") != 1 or state.get("profile") != PROFILE or not _valid_number(state.get("map_size"), 1, 10000) or not _valid_number(state.get("cell_size"), 1, 100) or float(state.map_size) != float(world.size) or float(state.cell_size) != CELL_SIZE:
		return false
	for key in ["explored", "structures", "objectives"]:
		if not state.get(key) is Array or state[key].size() != 2:
			return false
	for team in range(2):
		if not state.explored[team] is PackedByteArray or state.explored[team].size() != cols * rows:
			return false
		for bit in state.explored[team]:
			if bit > 1:
				return false
		if not state.structures[team] is Dictionary or state.structures[team].size() > 1024 or not state.objectives[team] is Dictionary or state.objectives[team].size() > 1024:
			return false
		for snapshot in state.structures[team].values():
			if not _valid_snapshot(snapshot, false):
				return false
		for snapshot in state.objectives[team].values():
			if not _valid_snapshot(snapshot, true):
				return false
	if not state.get("reveals") is Array or state.reveals.size() > 128 or not _valid_number(state.get("next_reveal"), 0, 1000000000):
		return false
	for reveal in state.reveals:
		if not reveal is Dictionary or reveal.get("team") not in [0, 1] or not reveal.get("pos") is Vector2 or not _in_bounds(reveal.pos):
			return false
		if not _valid_number(reveal.get("id"), 0, 1000000000) or not _valid_number(reveal.get("radius"), 0, 200) or not _valid_number(reveal.get("created_at"), 0, float(world.time) + 0.001) or not _valid_number(reveal.get("expires_at"), 0, float(world.time) + 10.0):
			return false
	_explored = [state.explored[0].duplicate(), state.explored[1].duplicate()]
	_structures = state.structures.duplicate(true)
	_objectives = state.objectives.duplicate(true)
	_reveals = state.reveals.duplicate(true)
	_next_reveal = int(state.next_reveal)
	force_refresh()
	return true
