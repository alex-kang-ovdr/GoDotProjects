class_name GrappleTether
extends Node2D

signal detached(reason: String)

const BalanceData = preload("res://scripts/balance.gd")
const CHAIN_SOLVER_ITERATIONS := 20

var owner_ship: ShipBody
var target_ship: ShipBody
var hook_position := Vector2.ZERO
var hook_flying := true
var connected := false
var links: Array[RigidBody2D] = []
var _chain_nodes: PackedVector2Array = PackedVector2Array()
var _chain_prev: PackedVector2Array = PackedVector2Array()
var _chain_inv_mass: PackedFloat32Array = PackedFloat32Array()
var _chain_seg_len := 36.0
var max_hp := maxf(float(BalanceData.GRAPPLE.hp) * 3.0, 96.0)
var hp := max_hp
var chain_rest_length := 0.0
var current_tension := 0.0
var peak_tension := 0.0

func launch(next_owner: ShipBody, next_target: ShipBody) -> void:
	owner_ship = next_owner
	target_ship = next_target
	hook_position = owner_ship.global_position
	queue_redraw()

func _physics_process(delta: float) -> void:
	if owner_ship == null or target_ship == null or not is_instance_valid(owner_ship) or not is_instance_valid(target_ship):
		detach("TARGET LOST")
		return
	if hook_flying:
		var offset := target_ship.global_position - hook_position
		var hit_radius := target_ship.hull_bound_radius
		var step := float(BalanceData.GRAPPLE.hook_speed) * delta
		if offset.length_squared() <= (step + hit_radius) * (step + hit_radius):
			hook_position = target_ship.global_position
			create_physical_chain()
		else:
			hook_position += offset.normalized() * step
		if owner_ship.global_position.distance_squared_to(hook_position) > float(BalanceData.GRAPPLE.max_range) * float(BalanceData.GRAPPLE.max_range):
			detach("OUT OF RANGE")
	elif connected:
		apply_tension_stabilizer(delta)
		_step_visual_chain(delta)
		var break_range := float(BalanceData.GRAPPLE.max_range) + owner_ship.hull_bound_radius + target_ship.hull_bound_radius + float(BalanceData.GRAPPLE.break_slack)
		if owner_ship.global_position.distance_squared_to(target_ship.global_position) > break_range * break_range:
			detach("CHAIN BROKEN")
	queue_redraw()

func create_physical_chain() -> void:
	if connected:
		return
	hook_flying = false
	connected = true
	var p_a := owner_ship.global_position
	var p_b := target_ship.global_position
	var distance := p_a.distance_to(p_b)
	var min_safe := owner_ship.hull_bound_radius + target_ship.hull_bound_radius + 18.0
	chain_rest_length = maxf(distance, min_safe)
	var seg_count := clampi(ceili(chain_rest_length / float(BalanceData.GRAPPLE.link_length)), 3, mini(int(BalanceData.GRAPPLE.max_links), 16))
	_chain_seg_len = chain_rest_length / float(seg_count)
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
	if distance <= 0.001:
		current_tension = 0.0
		return
	var direction := offset / distance
	var min_safe := owner_ship.hull_bound_radius + target_ship.hull_bound_radius + 14.0
	var inv_m1 := 1.0 / maxf(owner_ship.mass, 0.5)
	var inv_m2 := 1.0 / maxf(target_ship.mass, 0.5)
	var inv_sum := inv_m1 + inv_m2
	var w1 := inv_m1 / inv_sum
	var w2 := inv_m2 / inv_sum
	var eff_mass := 1.0 / inv_sum

	# 근접 시 겹침 방지: 접근 속도만 소산(튕겨내기 없음)
	if distance < min_safe:
		var closing := (owner_ship.linear_velocity - target_ship.linear_velocity).dot(direction)
		if closing > 0.0:
			owner_ship.linear_velocity -= direction * (closing * w1)
			target_ship.linear_velocity += direction * (closing * w2)
		var overlap := min_safe - distance
		if overlap > 0.5:
			var push := minf(overlap * 0.35, 10.0)
			owner_ship.global_position -= direction * (push * w1)
			target_ship.global_position += direction * (push * w2)
		current_tension = 0.0
		return

	var stretch := distance - chain_rest_length
	if stretch <= -16.0:
		current_tension = 0.0
		return

	# 장력/준장력 구간: 상대 속도 지수 감쇠 (진동·진자 흔들림 억제)
	var rel_vel := target_ship.linear_velocity - owner_ship.linear_velocity
	var damp_alpha := 1.0 - exp(-5.0 * dt)
	var damp_vec := rel_vel * damp_alpha
	owner_ship.linear_velocity += damp_vec * (w1 * 0.6)
	target_ship.linear_velocity -= damp_vec * (w2 * 0.9)
	target_ship.angular_velocity *= exp(-5.0 * dt)

	if stretch <= 0.0:
		current_tension = 0.0
		return

	# 1) 순수 분리 속도 상쇄 (내측 반발 속도 주입 없음 -> 진동 증폭 불가능)
	var v_rel := (target_ship.linear_velocity - owner_ship.linear_velocity).dot(direction)
	var j_mag := 0.0
	if v_rel > 0.0:
		j_mag = v_rel * eff_mass
		owner_ship.linear_velocity += direction * (v_rel * w1)
		target_ship.linear_velocity -= direction * (v_rel * w2)

	# 2) Split-Impulse 위치 보정 (속도에 에너지를 넣지 않고 늘어난 거리만 부드럽게 복원)
	var corr := minf(stretch * 0.5, 28.0)
	owner_ship.global_position += direction * (corr * w1)
	target_ship.global_position -= direction * (corr * w2)

	current_tension = clampf(j_mag / dt + stretch * 120.0, 0.0, float(BalanceData.GRAPPLE.max_tension_force))
	peak_tension = maxf(peak_tension, current_tension)

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
	for _iter in CHAIN_SOLVER_ITERATIONS:
		_chain_nodes[0] = p_start
		_chain_nodes[n - 1] = p_end
		for i in range(n - 1):
			var a := _chain_nodes[i]
			var b := _chain_nodes[i + 1]
			var diff := b - a
			var d := diff.length()
			if d <= 0.0001:
				continue
			var err := (d - _chain_seg_len) / d
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

func apply_damage(damage: float) -> void:
	if damage <= 0.0 or is_queued_for_deletion():
		return
	hp = maxf(0.0, hp - damage)
	if hp <= 0.0:
		detach("GRAPPLE DESTROYED")
	else:
		queue_redraw()

func can_be_hit_at(point: Vector2) -> bool:
	var radius := float(BalanceData.GRAPPLE.hit_radius)
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
		var tension_ratio := clampf(current_tension / maxf(float(BalanceData.GRAPPLE.max_tension_force) * 0.25, 1.0), 0.0, 1.0)
		var chain_color := Color("91eaff").lerp(Color("ffcf72"), tension_ratio).lerp(Color("ff7d75"), 1.0 - integrity)
		draw_polyline(points, chain_color, 2.5)
		for point in points:
			draw_circle(point, 3.2, Color("c8fbff"))
		var hud_point := points[points.size() >> 1]
		draw_rect(Rect2(hud_point + Vector2(-18, -14), Vector2(36, 4)), Color("08111f", 0.9), true)
		draw_rect(Rect2(hud_point + Vector2(-18, -14), Vector2(36 * integrity, 4)), chain_color, true)
