class_name GrappleTether
extends Node2D

signal detached(reason: String)

const BalanceData = preload("res://scripts/balance.gd")
const CHAIN_POINT_COUNT := 20
const CHAIN_SOLVER_ITERATIONS := 24
const TOW_MIN_MASS_RATIO := 0.55
const TOW_DOMINANT_MASS_RATIO := 1.15
const TOW_DOMINANT_THRUST_RATIO := 1.15

var owner_ship: ShipBody
var target_ship: ShipBody
var config_override: Dictionary = {}
var hook_position := Vector2.ZERO
var hook_flying := true
var connected := false
var links: Array[RigidBody2D] = []
var _chain_nodes: PackedVector2Array = PackedVector2Array()
var _chain_prev: PackedVector2Array = PackedVector2Array()
var _chain_inv_mass: PackedFloat32Array = PackedFloat32Array()
var _chain_seg_len := 36.0
var _first_seg_len := 36.0
var max_hp := float(BalanceData.GRAPPLE.hp)
var hp := max_hp
var chain_rest_length := 0.0
var current_tension := 0.0
var peak_tension := 0.0
var stretch_ratio := 1.0
var is_at_max_stretch := false
var reeling_in := false
var _reel_anim_time := 0.0
var _oscillation_stress := 0.0
var _prev_v_rel := 0.0

func _cfg(key: String, default_value: float) -> float:
	if config_override.has(key):
		return float(config_override[key])
	return float(BalanceData.GRAPPLE.get(key, default_value))

func apply_config(next_config: Dictionary, preserve_hp_ratio: bool = true) -> void:
	var prev_ratio := hp / maxf(max_hp, 1.0)
	config_override = next_config.duplicate(true)
	max_hp = maxf(_cfg("hp", float(BalanceData.GRAPPLE.hp)), 1.0)
	hp = clampf(max_hp * prev_ratio, 0.0, max_hp) if preserve_hp_ratio else max_hp
	queue_redraw()

static func ship_forward_thrust(ship: ShipBody) -> float:
	if ship == null or ship.model == null:
		return 0.0
	var total := 0.0
	for part in ship.model.parts:
		if str(part.spec().get("actuator", "")) == "forward":
			total += ship.effective_module_thrust(part)
	return total

static func ship_active_thrust_along(ship: ShipBody, world_axis: Vector2) -> float:
	if ship == null or ship.model == null:
		return 0.0
	var total := 0.0
	for part in ship.model.parts:
		var actuator := str(part.spec().get("actuator", ""))
		if actuator != "forward" and actuator != "reverse":
			continue
		var entry: Variant = ship.active_exhausts.get(part.uid, null)
		if not (entry is Dictionary):
			continue
		var intensity := float(entry.get("intensity", 0.0))
		if intensity <= 0.12:
			continue
		var world_push := ship.global_transform.basis_xform(ship.module_push_vector(part)).normalized()
		var aligned := world_push.dot(world_axis)
		if aligned > 0.2:
			total += intensity * aligned
	return total

static func can_tow(tower: ShipBody, target: ShipBody, cfg: Dictionary = {}) -> bool:
	if tower == null or target == null:
		return false
	var min_ratio := float(cfg.get("tow_min_mass_ratio", BalanceData.GRAPPLE.get("tow_min_mass_ratio", TOW_MIN_MASS_RATIO)))
	return tower.mass >= target.mass * min_ratio

func break_range() -> float:
	if owner_ship == null or target_ship == null or not is_instance_valid(owner_ship) or not is_instance_valid(target_ship):
		return _cfg("max_range", 980.0) + _cfg("break_slack", 1260.0)
	return _cfg("max_range", 980.0) + owner_ship.hull_bound_radius + target_ship.hull_bound_radius + _cfg("break_slack", 1260.0)

func max_chain_length() -> float:
	return chain_rest_length * maxf(_cfg("max_stretch_ratio", 1.2), 1.0)

func oscillation_stress() -> float:
	return _oscillation_stress

func launch(next_owner: ShipBody, next_target: ShipBody, next_config: Dictionary = {}) -> void:
	owner_ship = next_owner
	target_ship = next_target
	if not next_config.is_empty():
		apply_config(next_config, false)
	else:
		max_hp = maxf(_cfg("hp", float(BalanceData.GRAPPLE.hp)), 1.0)
		hp = max_hp
	hook_position = owner_ship.global_position
	queue_redraw()

func _physics_process(delta: float) -> void:
	if owner_ship == null or target_ship == null or not is_instance_valid(owner_ship) or not is_instance_valid(target_ship):
		detach("TARGET LOST")
		return
	var max_range := _cfg("max_range", 980.0)
	if hook_flying:
		var offset := target_ship.global_position - hook_position
		var hit_radius := target_ship.hull_bound_radius
		var step := _cfg("hook_speed", 1600.0) * delta
		if offset.length_squared() <= (step + hit_radius) * (step + hit_radius):
			hook_position = target_ship.global_position
			create_physical_chain()
		else:
			hook_position += offset.normalized() * step
		if owner_ship.global_position.distance_squared_to(hook_position) > max_range * max_range:
			detach("OUT OF RANGE")
	elif connected:
		if reeling_in:
			_apply_reel_in(delta)
		apply_tension_stabilizer(delta)
		_step_visual_chain(delta)
		var limit_range := break_range()
		if owner_ship.global_position.distance_squared_to(target_ship.global_position) > limit_range * limit_range:
			detach("CHAIN BROKEN")
	queue_redraw()

func active_link_count() -> int:
	return maxi(_chain_nodes.size() - 1, 0)

func set_reeling(active: bool) -> void:
	reeling_in = active and connected

func _apply_reel_in(delta: float) -> void:
	if not connected or owner_ship == null or target_ship == null:
		return
	var dt := maxf(delta, 0.001)
	_reel_anim_time += dt
	var offset := target_ship.global_position - owner_ship.global_position
	var distance := offset.length()
	var reel_speed := maxf(_cfg("reel_speed", 220.0), 0.0)
	var reel_force := maxf(_cfg("reel_force", 12000.0), 0.0)
	# 체인 간격(_chain_seg_len)은 고정한 채, 선두 링크(_first_seg_len)가 함선 윈치로 감겨 들어가며 체인 개수가 하나씩 줄어든다.
	if distance < chain_rest_length:
		var prev_rest := chain_rest_length
		chain_rest_length = maxf(distance, chain_rest_length - maxf(reel_speed, 600.0) * dt)
		var wound_len := prev_rest - chain_rest_length
		if wound_len > 0.0:
			_wind_in_chain_links(wound_len)
	if distance <= 0.5 or reel_force <= 0.0:
		return
	var direction := offset / distance
	var closing_speed := (owner_ship.linear_velocity - target_ship.linear_velocity).dot(direction)
	if reel_speed <= 0.0 or closing_speed < reel_speed:
		owner_ship.apply_central_force(direction * reel_force)
		target_ship.apply_central_force(-direction * reel_force)
	current_tension = maxf(current_tension, reel_force)
	peak_tension = maxf(peak_tension, current_tension)

func _wind_in_chain_links(wound_len: float) -> void:
	_first_seg_len -= wound_len
	while _first_seg_len <= 0.0 and _chain_nodes.size() > 2:
		_chain_nodes.remove_at(1)
		_chain_prev.remove_at(1)
		_chain_inv_mass.remove_at(1)
		_first_seg_len += _chain_seg_len
	if _chain_nodes.size() <= 2:
		_first_seg_len = clampf(chain_rest_length, 0.0, _chain_seg_len)
	else:
		_first_seg_len = clampf(_first_seg_len, 0.01, _chain_seg_len)

func create_physical_chain() -> void:
	if connected:
		return
	if not can_tow(owner_ship, target_ship, config_override):
		detach("TARGET TOO HEAVY · 더 큰 함선은 견인 불가")
		return
	hook_flying = false
	connected = true
	_oscillation_stress = 0.0
	_prev_v_rel = 0.0
	var p_a := owner_ship.global_position
	var p_b := target_ship.global_position
	var distance := p_a.distance_to(p_b)
	chain_rest_length = maxf(distance, 1.0)
	var base_link := maxf(_cfg("link_length", 36.0), 12.0)
	var max_links := maxi(int(_cfg("max_links", 30)), 2)
	var seg_count := clampi(ceili(chain_rest_length / base_link), 1, max_links)
	_chain_seg_len = maxf(chain_rest_length / float(seg_count), 1.0)
	_first_seg_len = _chain_seg_len
	_chain_nodes.resize(seg_count + 1)
	_chain_prev.resize(seg_count + 1)
	_chain_inv_mass.resize(seg_count + 1)
	var m_a := maxf(owner_ship.mass, 0.5)
	var m_b := maxf(target_ship.mass, 0.5)
	for i in range(seg_count + 1):
		var t := float(i) / float(seg_count)
		var pt := p_a.lerp(p_b, t)
		_chain_nodes[i] = pt
		_chain_prev[i] = pt
		# 각 체인 포인트의 질량을 함선 A·B 질량 사이 값으로 선형 보간해 질량비 차이를 최소화한다.
		_chain_inv_mass[i] = 1.0 / maxf(lerpf(m_a, m_b, t), 0.5)

# Split-Impulse 비탄성 로프 제약 (에너지 주입 0%):
# 1) 분리 속도만 정확히 상쇄(반발/되튐 없음)
# 2) 위치 오차는 속도 변화 없이 직접 보정(진동 증폭 원천 차단)
# 3) 장력 구간에서 상대 속도·각속도를 지수 감쇠해 안정적으로 견인한다.
func apply_tension_stabilizer(delta: float = 1.0 / 60.0) -> void:
	var dt := maxf(delta, 0.001)
	var offset := target_ship.global_position - owner_ship.global_position
	var distance := offset.length()
	stretch_ratio = distance / maxf(chain_rest_length, 1.0)
	is_at_max_stretch = false
	if distance <= 0.001:
		current_tension = 0.0
		return
	var direction := offset / distance
	var inv_m1 := 1.0 / maxf(owner_ship.mass, 0.5)
	var inv_m2 := 1.0 / maxf(target_ship.mass, 0.5)
	var inv_sum := inv_m1 + inv_m2
	var w1 := inv_m1 / inv_sum
	var w2 := inv_m2 / inv_sum
	var eff_mass := 1.0 / inv_sum

	# 체인은 장력 전용: 체인 사이 거리는 0까지 자유롭게 축소 가능(밀어내기 없음)
	var stretch := distance - chain_rest_length
	if stretch <= -16.0:
		current_tension = 0.0
		return

	# 장력/준장력 구간: 상대 속도 지수 감쇠 (진동·진자 흔들림 억제)
	var damp_rate := _cfg("tension_damp_rate", 5.0)
	var rel_vel := target_ship.linear_velocity - owner_ship.linear_velocity
	var damp_alpha := 1.0 - exp(-damp_rate * dt)
	var damp_vec := rel_vel * damp_alpha
	owner_ship.linear_velocity += damp_vec * (w1 * 0.6)
	target_ship.linear_velocity -= damp_vec * (w2 * 0.9)
	target_ship.angular_velocity *= exp(-damp_rate * dt)

	if stretch <= 0.0:
		current_tension = 0.0
		return

	var max_stretch_mult := maxf(_cfg("max_stretch_ratio", 1.2), 1.0)
	var max_len := chain_rest_length * max_stretch_mult
	var elastic_span := maxf(max_len - chain_rest_length, 0.0)
	var over_max := distance - max_len
	var v_rel := (target_ship.linear_velocity - owner_ship.linear_velocity).dot(direction)
	var j_mag := 0.0
	var max_tension := _cfg("max_tension_force", 126000.0)

	if elastic_span > 0.5 and over_max < 0.0:
		# 1.0x ~ max_stretch_ratio(1.2x) 탄성 신장 구간: 체인이 늘어나며 점진적 복원력 적용 (내구도 미감소)
		var stretch_frac := clampf(stretch / elastic_span, 0.0, 1.0)
		var elastic_stiffness := maxf(_cfg("elastic_pull_stiffness", 10.0), 0.5)
		var pull_dv := stretch * elastic_stiffness * (0.35 + 0.65 * stretch_frac) * dt
		owner_ship.linear_velocity += direction * (pull_dv * w1)
		target_ship.linear_velocity -= direction * (pull_dv * w2)
		if v_rel > 0.0:
			var damp_sep := v_rel * clampf(0.2 + 0.75 * stretch_frac, 0.0, 0.95)
			j_mag = damp_sep * eff_mass
			owner_ship.linear_velocity += direction * (damp_sep * w1)
			target_ship.linear_velocity -= direction * (damp_sep * w2)
		current_tension = clampf(j_mag / dt + stretch * 120.0, 0.0, max_tension)
	else:
		# 최대 신장(1.2x) 도달: 비탄성 하드 제약으로 추가 신장을 차단하고 내구도 감소 시작
		if v_rel > 0.0:
			j_mag = v_rel * eff_mass
			owner_ship.linear_velocity += direction * (v_rel * w1)
			target_ship.linear_velocity -= direction * (v_rel * w2)
		var corr_max := _cfg("position_correction_max", 42.0)
		var corr := minf(maxf(over_max, 0.0) * 0.55, corr_max)
		if corr > 0.0:
			owner_ship.global_position += direction * (corr * w1)
			target_ship.global_position -= direction * (corr * w2)
		current_tension = clampf(j_mag / dt + stretch * 160.0, 0.0, max_tension)

	peak_tension = maxf(peak_tension, current_tension)

	# 최대로 늘어진 상태(>= 98.5% of max_stretch_ratio)에서 내구도 감소 시작
	var drain_threshold := maxf(max_stretch_mult - 0.015, 1.0)
	if stretch_ratio >= drain_threshold and (max_stretch_mult > 1.001 or stretch > 1.0):
		is_at_max_stretch = true
		var drain_rate := maxf(_cfg("max_stretch_hp_drain_per_sec", 36.0), 0.0)
		if drain_rate > 0.0:
			apply_damage(drain_rate * dt, "MAX STRETCH BREAK · 최대 신장 내구도 소진")
			if is_queued_for_deletion():
				return

	# 3) 질량/추력 조건 검증:
	# - 대상이 확실히 더 큰 함선(1/tow_min_mass_ratio 초과)이면 견인 불가 -> 단선
	# - 비슷한 질량이라도 대상이 스러스트 없이 가만히 있으면 정상 견인 가능
	# - 양쪽 함선이 모두 스러스트를 가동하며 질량/추력이 비슷해 진동·경합이 발생하면 단선
	if not can_tow(owner_ship, target_ship, config_override):
		detach("TARGET TOO HEAVY · 더 큰 함선은 견인 불가")
		return
	var mass_ratio := owner_ship.mass / maxf(target_ship.mass, 0.1)
	var thrust_ratio := ship_forward_thrust(owner_ship) / maxf(ship_forward_thrust(target_ship), 1.0)
	var owner_pulling := owner_ship.active_command_thrust > 0.05 and ship_active_thrust_along(owner_ship, -direction) > 0.15
	var target_resisting := target_ship.active_command_thrust > 0.05 and ship_active_thrust_along(target_ship, direction) > 0.15
	var both_thrusting := owner_pulling and target_resisting
	var dom_mass := _cfg("tow_dominant_mass_ratio", TOW_DOMINANT_MASS_RATIO)
	var dom_thrust := _cfg("tow_dominant_thrust_ratio", TOW_DOMINANT_THRUST_RATIO)
	var parity_contested := both_thrusting and (mass_ratio < dom_mass or thrust_ratio < dom_thrust)
	var raw_v_rel := (target_ship.linear_velocity - owner_ship.linear_velocity).dot(direction)
	if parity_contested:
		var flip_stress := _cfg("oscillation_flip_stress", 0.11)
		var tension_rate := _cfg("oscillation_tension_rate", 0.48)
		var decay_rate := _cfg("oscillation_decay_rate", 1.2)
		var tension_threshold := _cfg("oscillation_tension_threshold", 900.0)
		var flipped := (_prev_v_rel * raw_v_rel < 0.0) and (absf(raw_v_rel - _prev_v_rel) > 16.0)
		if flipped:
			_oscillation_stress += flip_stress
		elif stretch > 0.2 and current_tension > tension_threshold:
			_oscillation_stress += dt * tension_rate
		else:
			_oscillation_stress = maxf(0.0, _oscillation_stress - dt * decay_rate)
		if _oscillation_stress >= 1.0:
			detach("RESONANCE BREAK · 질량/추력 경합 진동 단선")
			return
	else:
		_oscillation_stress = maxf(0.0, _oscillation_stress - dt * maxf(_cfg("oscillation_decay_rate", 1.2), 1.5))
	_prev_v_rel = raw_v_rel

func _step_visual_chain(delta: float) -> void:
	var n := _chain_nodes.size()
	if n < 2:
		return
	var p_start := owner_ship.global_position
	var p_end := target_ship.global_position
	var m_a := maxf(owner_ship.mass, 0.5)
	var m_b := maxf(target_ship.mass, 0.5)
	var inv_denom := 1.0 / float(n - 1)
	for i in range(n):
		_chain_inv_mass[i] = 1.0 / maxf(lerpf(m_a, m_b, float(i) * inv_denom), 0.5)
	_chain_nodes[0] = p_start
	_chain_prev[0] = p_start
	_chain_nodes[n - 1] = p_end
	_chain_prev[n - 1] = p_end
	var damp := exp(-8.0 * delta)
	for i in range(1, n - 1):
		var cur := _chain_nodes[i]
		var vel := (cur - _chain_prev[i]) * damp
		_chain_prev[i] = cur
		_chain_nodes[i] = cur + vel
	# 체인 링크 간 self-collision 없음 (장력 전용 제약: 인접·비인접 링크 모두 상호 충돌·반발 미적용)
	var max_stretch_mult := maxf(_cfg("max_stretch_ratio", 1.2), 1.0)
	for _iter in CHAIN_SOLVER_ITERATIONS:
		_chain_nodes[0] = p_start
		_chain_nodes[n - 1] = p_end
		for i in range(n - 1):
			var rest_i := _first_seg_len if i == 0 else _chain_seg_len
			var seg_max_i := rest_i * max_stretch_mult
			var a := _chain_nodes[i]
			var b := _chain_nodes[i + 1]
			var diff := b - a
			var d := diff.length()
			if d <= rest_i or d <= 0.0001:
				continue
			var err := 0.0
			if d > seg_max_i:
				# 각 체인 세그먼트는 최대 1.2배(max_stretch_ratio)까지만 늘어나도록 하드 클램프
				err = (d - seg_max_i) / d
			else:
				# 1.0x ~ 1.2x 사이 탄성 신장 구간: 부드럽게 원래 길이로 복원하려 함
				err = ((d - rest_i) / d) * 0.25
			var w_a := 0.0 if i == 0 else _chain_inv_mass[i]
			var w_b := 0.0 if i + 1 == n - 1 else _chain_inv_mass[i + 1]
			var w_sum := w_a + w_b
			if w_sum <= 0.000001:
				continue
			_chain_nodes[i] = a + diff * (err * (w_a / w_sum))
			_chain_nodes[i + 1] = b - diff * (err * (w_b / w_sum))

func detach(reason: String = "MANUAL RELEASE") -> void:
	detached.emit(reason)
	queue_free()

func apply_damage(damage: float, break_reason: String = "GRAPPLE DESTROYED") -> void:
	if damage <= 0.0 or is_queued_for_deletion():
		return
	hp = maxf(0.0, hp - damage)
	if hp <= 0.0:
		detach(break_reason)
	else:
		queue_redraw()

func can_be_hit_at(point: Vector2) -> bool:
	var radius := _cfg("hit_radius", 12.0)
	if hook_flying:
		return hook_position.distance_squared_to(point) <= radius * radius
	var points := chain_points()
	for index in range(points.size() - 1):
		if point_segment_distance_squared(point, points[index], points[index + 1]) <= radius * radius:
			return true
	return false

func chain_points() -> PackedVector2Array:
	if not hook_flying and _chain_nodes.size() >= 2:
		return _chain_nodes
	var points := PackedVector2Array()
	if owner_ship != null and is_instance_valid(owner_ship):
		points.append(owner_ship.global_position)
	if not hook_flying and target_ship != null and is_instance_valid(target_ship):
		points.append(target_ship.global_position)
	return points

func point_segment_distance_squared(point: Vector2, from: Vector2, to: Vector2) -> float:
	var segment := to - from
	var length_squared := segment.length_squared()
	if length_squared <= 0.0001:
		return point.distance_squared_to(from)
	var interpolation := clampf((point - from).dot(segment) / length_squared, 0.0, 1.0)
	return point.distance_squared_to(from + segment * interpolation)

func _draw() -> void:
	if owner_ship == null or not is_instance_valid(owner_ship):
		return
	var points := PackedVector2Array()
	if hook_flying:
		points.append(to_local(owner_ship.global_position))
		points.append(to_local(hook_position))
	elif _chain_nodes.size() >= 2:
		points.resize(_chain_nodes.size())
		for i in _chain_nodes.size():
			points[i] = to_local(_chain_nodes[i])
	elif target_ship != null and is_instance_valid(target_ship):
		points.append(to_local(owner_ship.global_position))
		points.append(to_local(target_ship.global_position))
	if points.size() >= 2:
		var integrity := hp / maxf(max_hp, 1.0)
		var max_t := _cfg("max_tension_force", 126000.0)
		var max_stretch_mult := maxf(_cfg("max_stretch_ratio", 1.2), 1.001)
		var stretch_norm := clampf((stretch_ratio - 1.0) / maxf(max_stretch_mult - 1.0, 0.05), 0.0, 1.0)
		var tension_ratio := clampf(maxf(maxf(current_tension / maxf(max_t * 0.25, 1.0), _oscillation_stress), stretch_norm), 0.0, 1.0)
		var chain_color := Color("91eaff").lerp(Color("ffcf72"), tension_ratio).lerp(Color("ff5c5c"), maxf(1.0 - integrity, 0.9 if is_at_max_stretch else _oscillation_stress * 0.85))
		if not hook_flying and _chain_seg_len > 0.1:
			for i in range(points.size() - 1):
				var rest_i := maxf(_first_seg_len if i == 0 else _chain_seg_len, 1.0)
				var seg_len := points[i].distance_to(points[i + 1])
				var seg_norm := clampf((seg_len / rest_i - 1.0) / maxf(max_stretch_mult - 1.0, 0.05), 0.0, 1.0)
				var seg_col := Color("91eaff").lerp(Color("ffcf72"), seg_norm).lerp(Color("ff4b4b"), 0.85 if (is_at_max_stretch or seg_norm >= 0.95) else (1.0 - integrity) * 0.7)
				draw_line(points[i], points[i + 1], seg_col, 3.2 if is_at_max_stretch else 2.5)
		else:
			draw_polyline(points, chain_color, 2.5)
		var node_col := Color("ff9e9e") if is_at_max_stretch else (Color("ffe680") if reeling_in else Color("c8fbff"))
		for i in range(points.size()):
			var r := 3.4 if is_at_max_stretch else 3.0
			var c := node_col
			if reeling_in:
				var wave := fposmod(float(i) / float(max(points.size() - 1, 1)) + _reel_anim_time * 2.2, 1.0)
				if wave < 0.18:
					r = 4.6
					c = Color("ffffff")
			draw_circle(points[i], r, c)
		var hud_point := points[points.size() >> 1]
		draw_rect(Rect2(hud_point + Vector2(-22, -14), Vector2(44, 5)), Color("08111f", 0.9), true)
		draw_rect(Rect2(hud_point + Vector2(-22, -14), Vector2(44 * integrity, 5)), chain_color, true)
