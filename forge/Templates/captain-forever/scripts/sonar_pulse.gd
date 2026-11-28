class_name SonarPulse
extends Node2D

signal ship_detected(ship: EnemyShip, entered_attack_mode: bool)
signal scan_completed(report: Dictionary)

const BalanceData = preload("res://scripts/balance.gd")

var owner_ship: ShipBody
var origin := Vector2.ZERO
var max_range := float(BalanceData.SONAR.max_range)
var wave_speed := float(BalanceData.SONAR.wave_speed)
var reveal_duration := float(BalanceData.SONAR.reveal_duration)
var band_width := float(BalanceData.SONAR.band_width)

var current_radius := 0.0
var expanding := true
var linger_left := 0.0
var completed := false

var _candidate_ships: Array[EnemyShip] = []
var _candidate_stations: Array[Dictionary] = []
var _candidate_salvage_count := 0
var _pinged_ship_ids: Dictionary = {}
var _pinged_station_ids: Dictionary = {}

var detected_ships: Array[Dictionary] = []
var detected_stations: Array[Dictionary] = []
var mutual_detections: Array[Dictionary] = []
var _mutual_pair_keys: Dictionary = {}
var _echo_ripples: Array[Dictionary] = []
var _ping_markers: Array[Dictionary] = []

func launch(
	emitter: ShipBody,
	ships: Array,
	stations: Array = [],
	salvage_nodes: Array = [],
	custom_max_range: float = -1.0
) -> void:
	owner_ship = emitter
	origin = emitter.global_position if emitter != null else Vector2.ZERO
	global_position = origin
	if custom_max_range > 0.0:
		max_range = custom_max_range
	_candidate_ships.clear()
	for s in ships:
		if s is EnemyShip and is_instance_valid(s) and s.alive():
			_candidate_ships.append(s)
	_candidate_stations.clear()
	for st in stations:
		if st is Dictionary:
			_candidate_stations.append(st)
	_candidate_salvage_count = 0
	for sv in salvage_nodes:
		if is_instance_valid(sv) and origin.distance_to(sv.global_position) <= max_range:
			_candidate_salvage_count += 1
	z_index = 18
	current_radius = 0.0
	expanding = true
	linger_left = reveal_duration
	completed = false
	queue_redraw()

func _physics_process(delta: float) -> void:
	var dt := maxf(delta, 0.001)
	if expanding:
		current_radius = minf(max_range, current_radius + wave_speed * dt)
		_scan_ring()
		if current_radius >= max_range:
			expanding = false
			completed = true
			scan_completed.emit(build_report())
	else:
		linger_left = maxf(0.0, linger_left - dt)
		if linger_left <= 0.0:
			queue_free()
			return

	for i in range(_echo_ripples.size() - 1, -1, -1):
		var r: Dictionary = _echo_ripples[i]
		r.t = float(r.t) + dt
		if float(r.t) >= float(r.dur):
			_echo_ripples.remove_at(i)
	for m in _ping_markers:
		m.age = float(m.age) + dt
	queue_redraw()

func _scan_ring() -> void:
	var newly_pinged: Array[EnemyShip] = []
	for ship in _candidate_ships:
		if not is_instance_valid(ship) or not ship.alive():
			continue
		var sid := ship.get_instance_id()
		if _pinged_ship_ids.has(sid):
			continue
		var dist := origin.distance_to(ship.global_position)
		if dist <= current_radius:
			_pinged_ship_ids[sid] = ship
			newly_pinged.append(ship)

	if not newly_pinged.is_empty():
		var active_group: Array[ShipBody] = []
		if owner_ship != null and is_instance_valid(owner_ship):
			active_group.append(owner_ship)
		for existing in _pinged_ship_ids.values():
			if existing is ShipBody and is_instance_valid(existing):
				active_group.append(existing)

		for ship in newly_pinged:
			var peers: Array[ShipBody] = []
			for other in active_group:
				if other != ship and is_instance_valid(other):
					if ship.global_position.distance_to(other.global_position) <= float(BalanceData.SONAR.mutual_detect_range):
						peers.append(other)
						_record_mutual_pair(ship, other)
			var entered_attack := ship.on_sonar_detected(owner_ship, peers)
			var dist := origin.distance_to(ship.global_position)
			var entry := {
				"ship": ship,
				"name": ship.enemy_name,
				"class_label": ship.ship_class_label,
				"distance": dist,
				"hostile": ship.is_hostile_archetype(),
				"attack_mode": entered_attack or ship.is_attacking_player(),
				"boss": ship.boss,
				"peer_count": peers.size(),
			}
			detected_ships.append(entry)
			var ping_color := Color("ffd36e") if ship.boss else (Color("ff5c6c") if entry.attack_mode else Color("6ef2ff"))
			_echo_ripples.append({
				"pos": ship.global_position,
				"color": ping_color,
				"max_r": maxf(ship.hull_bound_radius * 2.4, 90.0),
				"t": 0.0,
				"dur": 0.85,
			})
			_ping_markers.append({
				"node": ship,
				"pos": ship.global_position,
				"label": "%s · %.0fm%s" % [ship.enemy_name, dist, " [공격모드!]" if entry.attack_mode else ""],
				"color": ping_color,
				"age": 0.0,
			})
			ship_detected.emit(ship, entered_attack)

	for st in _candidate_stations:
		var st_id := str(st.get("id", st.get("name", "")))
		if _pinged_station_ids.has(st_id):
			continue
		var st_pos: Vector2 = st.get("position", Vector2.ZERO)
		var dist := origin.distance_to(st_pos)
		if dist <= current_radius:
			_pinged_station_ids[st_id] = true
			detected_stations.append({"name": str(st.get("name", "STATION")), "distance": dist, "position": st_pos})
			_echo_ripples.append({
				"pos": st_pos,
				"color": Color("6ef5a8"),
				"max_r": 120.0,
				"t": 0.0,
				"dur": 0.9,
			})
			_ping_markers.append({
				"node": null,
				"pos": st_pos,
				"label": "%s · %.0fm" % [str(st.get("name", "STATION")), dist],
				"color": Color("6ef5a8"),
				"age": 0.0,
			})

func _record_mutual_pair(a: ShipBody, b: ShipBody) -> void:
	var id_a := a.get_instance_id()
	var id_b := b.get_instance_id()
	var key := "%d:%d" % [mini(id_a, id_b), maxi(id_a, id_b)]
	if _mutual_pair_keys.has(key):
		return
	_mutual_pair_keys[key] = true
	var name_a: String = "플레이어 함선" if a == owner_ship else (str((a as EnemyShip).enemy_name) if a is EnemyShip else String(a.name))
	var name_b: String = "플레이어 함선" if b == owner_ship else (str((b as EnemyShip).enemy_name) if b is EnemyShip else String(b.name))
	mutual_detections.append({
		"a": a,
		"b": b,
		"name_a": name_a,
		"name_b": name_b,
		"distance": a.global_position.distance_to(b.global_position),
	})

func build_report() -> Dictionary:
	var hostile_count := 0
	var neutral_count := 0
	for s in detected_ships:
		if bool(s.get("attack_mode", false)):
			hostile_count += 1
		else:
			neutral_count += 1
	return {
		"range": max_range,
		"ships": detected_ships.duplicate(true),
		"hostile_count": hostile_count,
		"neutral_count": neutral_count,
		"stations": detected_stations.duplicate(true),
		"salvage_count": _candidate_salvage_count,
		"mutual_pairs": mutual_detections.duplicate(true),
	}

func _draw() -> void:
	var fade := 1.0 if expanding else clampf(linger_left / maxf(reveal_duration, 0.1), 0.0, 1.0)
	if expanding and current_radius > 2.0:
		# 오버드로우 방지를 위해 내부 채움·반투명 띠·격자 없이 얇은 불투명 원 테두리만 그린다.
		draw_arc(Vector2.ZERO, current_radius, 0.0, TAU, 96, Color(0.45, 0.96, 1.0, 1.0), 2.0)
	elif fade > 0.01:
		# 스캔 완료 후에도 내부 채움 없이 얇은 불투명 외곽선만 유지
		draw_arc(Vector2.ZERO, max_range, 0.0, TAU, 96, Color(0.28, 0.68, 0.78, 1.0), 1.5)

	# 함선 간 상호 탐지 연결선
	for pair in mutual_detections:
		var a: ShipBody = pair.a
		var b: ShipBody = pair.b
		if is_instance_valid(a) and is_instance_valid(b):
			var pa := to_local(a.global_position)
			var pb := to_local(b.global_position)
			var is_player_link := (a == owner_ship or b == owner_ship)
			var link_col := Color(0.32, 0.75, 0.85, 1.0) if is_player_link else Color(0.68, 0.48, 0.88, 1.0)
			draw_dashed_line(pa, pb, link_col, 1.4, 10.0)

	# 에코 파문 (얇은 불투명 링 테두리만)
	for r in _echo_ripples:
		var ratio := clampf(float(r.t) / maxf(float(r.dur), 0.01), 0.0, 1.0)
		var lp := to_local(Vector2(r.pos))
		var col: Color = r.color
		col.a = 1.0
		draw_arc(lp, float(r.max_r) * ratio, 0.0, TAU, 40, col, 1.8)

	# 탐지된 함선·정거장 마커 (얇은 불투명 링 테두리만)
	for m in _ping_markers:
		var pos_world := Vector2(m.pos)
		if m.node != null and is_instance_valid(m.node):
			pos_world = m.node.global_position
		var lp := to_local(pos_world)
		var col: Color = m.color
		col.a = 1.0
		var pulse := 1.0 + 0.14 * sin(float(m.age) * 8.0)
		draw_arc(lp, 34.0 * pulse, 0.0, TAU, 32, col, 1.8)
		if ThemeDB.fallback_font != null:
			draw_string(ThemeDB.fallback_font, lp + Vector2(-95.0, -44.0), str(m.label), HORIZONTAL_ALIGNMENT_CENTER, 190.0, 12, col)
