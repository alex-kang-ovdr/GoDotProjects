class_name GrappleTether
extends Node2D

signal detached(reason: String)

const BalanceData = preload("res://scripts/balance.gd")

var owner_ship: ShipBody
var target_ship: ShipBody
var hook_position := Vector2.ZERO
var hook_flying := true
var connected := false
var links: Array[RigidBody2D] = []
var max_hp := float(BalanceData.GRAPPLE.hp)
var hp := max_hp

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
		var break_range := float(BalanceData.GRAPPLE.max_range) + owner_ship.hull_bound_radius + target_ship.hull_bound_radius + float(BalanceData.GRAPPLE.break_slack)
		if owner_ship.global_position.distance_squared_to(target_ship.global_position) > break_range * break_range:
			detach("CHAIN BROKEN")
	queue_redraw()

func create_physical_chain() -> void:
	if connected:
		return
	hook_flying = false
	connected = true
	var distance := owner_ship.global_position.distance_to(target_ship.global_position)
	var link_count := clampi(ceili(distance / float(BalanceData.GRAPPLE.link_length)) - 1, 1, int(BalanceData.GRAPPLE.max_links))
	var previous: Node2D = owner_ship
	for index in link_count:
		var link := RigidBody2D.new()
		link.name = "ChainLink_%02d" % index
		link.global_position = owner_ship.global_position.lerp(target_ship.global_position, float(index + 1) / float(link_count + 1))
		link.mass = float(BalanceData.GRAPPLE.link_mass)
		link.gravity_scale = 0.0
		link.linear_damp = float(BalanceData.GRAPPLE.link_damp)
		link.angular_damp = float(BalanceData.GRAPPLE.link_damp)
		link.collision_layer = 0
		link.collision_mask = 0
		add_child(link)
		add_pin_joint(previous, link)
		links.append(link)
		previous = link
	add_pin_joint(previous, target_ship)

func add_pin_joint(first: Node2D, second: Node2D) -> void:
	var joint := PinJoint2D.new()
	joint.global_position = first.global_position.lerp(second.global_position, 0.5)
	add_child(joint)
	joint.node_a = joint.get_path_to(first)
	joint.node_b = joint.get_path_to(second)

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
	var points := PackedVector2Array()
	if owner_ship != null and is_instance_valid(owner_ship):
		points.append(owner_ship.global_position)
	for link in links:
		if is_instance_valid(link):
			points.append(link.global_position)
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
	var points := PackedVector2Array([to_local(owner_ship.global_position)])
	if hook_flying:
		points.append(to_local(hook_position))
	else:
		for link in links:
			if is_instance_valid(link):
				points.append(to_local(link.global_position))
		if target_ship != null and is_instance_valid(target_ship):
			points.append(to_local(target_ship.global_position))
	if points.size() >= 2:
		var integrity := hp / maxf(max_hp, 1.0)
		var chain_color := Color("91eaff").lerp(Color("ff7d75"), 1.0 - integrity)
		draw_polyline(points, chain_color, 2.5, true)
		for point in points:
			draw_circle(point, 3.5, Color("c8fbff"))
		var hud_point := points[points.size() >> 1]
		draw_rect(Rect2(hud_point + Vector2(-18, -14), Vector2(36, 4)), Color("08111f", 0.9), true)
		draw_rect(Rect2(hud_point + Vector2(-18, -14), Vector2(36 * integrity, 4)), chain_color, true)
