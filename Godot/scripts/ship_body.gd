class_name ShipBody
extends RigidBody2D

const ShipModelScript = preload("res://scripts/ship_model.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var model = ShipModelScript.new()
var shield_layers := 0
var shield_recharge_left := 0.0
var break_shake := 0.0
var break_shake_time := 0.0
var laser_cooldown := 0.0
var missile_cooldown := 0.0
var mini_missile_cooldown := 0.0
var heat := 0.0
var shield_layer_bonus := 0
var shield_recharge_reduction := 0.0
var turret_target := Vector2.ZERO
var is_player := true
var active_exhausts: Dictionary = {}

func _ready() -> void:
	gravity_scale = 0.0
	linear_damp = float(BalanceData.PHYSICS.linear_damp)
	angular_damp = float(BalanceData.PHYSICS.angular_damp)
	contact_monitor = true
	max_contacts_reported = 12
	add_collision_shape()
	refresh_mass()

func initialize_player() -> void:
	model.initialize_player()
	shield_layers = model.shield_capacity()
	refresh_mass()
	queue_redraw()

func add_collision_shape() -> void:
	var collider := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(260, 220)
	collider.shape = shape
	add_child(collider)

func refresh_mass() -> void:
	mass = model.total_mass()
	center_of_mass_mode = RigidBody2D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = model.center_of_mass()

func _physics_process(delta: float) -> void:
	laser_cooldown = maxf(0.0, laser_cooldown - delta)
	missile_cooldown = maxf(0.0, missile_cooldown - delta)
	mini_missile_cooldown = maxf(0.0, mini_missile_cooldown - delta)
	heat = maxf(0.0, heat - delta * (18.0 + float(model.parts.filter(func(part): return part.kind == "battery").size()) * 9.0))
	break_shake_time = maxf(0.0, break_shake_time - delta)
	if break_shake_time <= 0.0:
		break_shake = 0.0
	if shield_layers < shield_max_layers():
		shield_recharge_left -= delta
		if shield_recharge_left <= 0.0:
			shield_layers += 1
			shield_recharge_left = maxf(float(BalanceData.SHIELD.min_recharge), float(BalanceData.SHIELD.base_recharge) - shield_recharge_reduction)
	queue_redraw()

func apply_player_thrusters(forward: float, reverse: float, turn: float) -> void:
	active_exhausts.clear()
	var forward_drives := parts_with_actuator("forward")
	var forward_multipliers := balanced_forward_multipliers(forward_drives)
	for part in forward_drives:
		apply_module_force(part, Vector2.RIGHT * float(part.spec().force) * forward * float(forward_multipliers.get(part.uid, 1.0)))
	for part in parts_with_actuator("reverse"):
		apply_module_force(part, Vector2.LEFT * float(part.spec().force) * reverse)
	for part in parts_with_actuator("turn"):
		var center := Vector2(part.cell)
		var radial := center.normalized()
		if radial.length() > 0.01 and absf(turn) > 0.01:
			apply_module_force(part, radial.orthogonal() * float(part.spec().force) * turn)

func parts_with_actuator(actuator: String) -> Array:
	return model.parts.filter(func(part): return part.spec().get("actuator", "") == actuator)

func balanced_forward_multipliers(drives: Array) -> Dictionary:
	var result := {}
	if drives.is_empty():
		return result
	var com := model.center_of_mass() / BalanceData.CELL
	var torques: Array[float] = []
	for part in drives:
		torques.append(-(float(part.cell.y) - com.y))
	var denominator := 0.0
	var total := 0.0
	for torque in torques:
		denominator += torque * torque
		total += torque
	if denominator < 0.001:
		for part in drives: result[part.uid] = 1.0
		return result
	var correction := total / denominator
	var raw: Array[float] = []
	for torque in torques:
		raw.append(clampf(1.0 - correction * torque, float(BalanceData.PHYSICS.forward_min), float(BalanceData.PHYSICS.forward_max)))
	var raw_total := 0.0
	for value in raw:
		raw_total += value
	var normalizer: float = float(raw.size()) / maxf(raw_total, 0.001)
	for index in drives.size():
		result[drives[index].uid] = raw[index] * normalizer
	return result

func apply_module_force(part: PartData, local_force: Vector2) -> void:
	if local_force.length() <= 0.01:
		return
	var world_force := local_force.rotated(rotation)
	var local_offset := Vector2(part.cell) * BalanceData.CELL
	apply_force(world_force, local_offset.rotated(rotation))
	active_exhausts[part.uid] = -local_force.normalized()

func actuator_force(kind: String) -> float:
	var force := 0.0
	for part in model.parts:
		if part.spec().get("actuator", "") == kind:
			force += float(part.spec().get("force", 0.0))
	return force

func fire_primary_weapons(target: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if laser_cooldown > 0.0 or heat > 100.0:
		return result
	var lasers: Array = []
	var ballistics: Array = []
	for part in model.parts:
		if part.kind == "laser":
			lasers.append(part)
		elif part.kind == "machine_gun" or part.kind == "railgun":
			ballistics.append(part)
	if lasers.is_empty() and ballistics.is_empty():
		return result
	laser_cooldown = float(BalanceData.WEAPONS.laser.cooldown)
	heat += float(BalanceData.WEAPONS.laser.heat) + float(lasers.size()) * 3.0
	turret_target = target
	for part in lasers:
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position": source, "velocity": linear_velocity + source.direction_to(target) * float(BalanceData.WEAPONS.laser.speed), "damage": float(BalanceData.WEAPONS.laser.damage), "color": Color("ff92e8"), "team": "player" if is_player else "enemy", "kind":"laser"})
	for part in ballistics:
		var tuning: Dictionary = BalanceData.WEAPONS[part.kind]
		if not model.consume_ammo("bullet", int(tuning.ammo_cost)):
			continue
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position": source, "velocity": linear_velocity + source.direction_to(target) * float(tuning.speed), "damage": float(tuning.damage), "color": Color("d6b3ff") if part.kind == "railgun" else Color("b9d8ff"), "team": "player" if is_player else "enemy", "kind":part.kind, "life":float(tuning.life)})
	return result

func fire_missile(target: Vector2) -> Dictionary:
	if missile_cooldown > 0.0 or not has_part("missile_launcher") or not model.consume_ammo("missile", int(BalanceData.WEAPONS.missile.ammo_cost)):
		return {}
	missile_cooldown = float(BalanceData.WEAPONS.missile.cooldown)
	return {"position": global_position, "velocity": linear_velocity + global_position.direction_to(target) * float(BalanceData.WEAPONS.missile.speed), "damage": float(BalanceData.WEAPONS.missile.damage), "color": Color("ffbd78"), "guided": true, "target": target, "team": "player" if is_player else "enemy", "kind":"missile"}

func fire_auto_mini_missiles(target: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if mini_missile_cooldown > 0.0:
		return result
	for part in model.parts:
		if part.kind != "mini_missile_launcher" or not model.consume_ammo("missile", int(BalanceData.WEAPONS.mini_missile.ammo_cost)):
			continue
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position":source, "velocity":linear_velocity + source.direction_to(target) * float(BalanceData.WEAPONS.mini_missile.speed), "damage":float(BalanceData.WEAPONS.mini_missile.damage), "color":Color("d7ed8e"), "team":"player" if is_player else "enemy", "kind":"mini_missile", "guided":true, "target":target, "life":float(BalanceData.WEAPONS.mini_missile.lock_seconds) + float(BalanceData.WEAPONS.mini_missile.range) / float(BalanceData.WEAPONS.mini_missile.speed)})
	if not result.is_empty():
		mini_missile_cooldown = float(BalanceData.WEAPONS.mini_missile.cooldown)
	return result

func has_part(kind: String) -> bool:
	for part in model.parts:
		if part.kind == kind:
			return true
	return false

func shield_max_layers() -> int:
	return mini(int(BalanceData.SHIELD.max_layers), model.shield_capacity() + shield_layer_bonus)

func repair_all() -> void:
	for part in model.parts:
		part.hp = part.max_hp
	shield_layers = shield_max_layers()
	shield_recharge_left = 0.0

func damage_part(part: PartData, damage: float, impulse: Vector2 = Vector2.ZERO) -> Array[PartData]:
	if shield_layers > 0:
		shield_layers -= 1
		shield_recharge_left = float(BalanceData.SHIELD.base_recharge)
		return []
	part.hp -= damage
	if part.hp > 0.0:
		return []
	var removed := model.remove(part.uid)
	if removed == null:
		return []
	break_shake = VisualData.WEAPON_BREAK_SHAKE if removed.kind in ["laser", "missile_launcher", "mini_missile_launcher", "machine_gun", "railgun"] else VisualData.STRUCTURE_BREAK_SHAKE
	break_shake_time = 0.16
	var detached := model.detach_disconnected()
	refresh_mass()
	queue_redraw()
	return detached

func local_cell_at(world_point: Vector2) -> Vector2i:
	var local := to_local(world_point)
	return Vector2i(roundi(local.x / BalanceData.CELL), roundi(local.y / BalanceData.CELL))

func _draw() -> void:
	var hull_cells := model.occupied()
	var shake := Vector2.ZERO
	if break_shake_time > 0.0:
		shake = Vector2(sin(Time.get_ticks_msec() * 0.11), cos(Time.get_ticks_msec() * 0.16)) * break_shake
	for part in model.parts:
		draw_part(part, shake, hull_cells)
	for part in model.parts:
		if active_exhausts.has(part.uid):
			draw_exhaust(part, active_exhausts[part.uid], shake)
	if shield_layers > 0:
		var alpha: float = VisualData.SHIELD_LAYER_OPACITY[shield_layers]
		draw_arc(shake, 132.0, 0.0, TAU, 40, Color(0.22, 0.88, 1.0, alpha), 2.0, true)

func draw_part(part: PartData, shake: Vector2, hull_cells: Dictionary) -> void:
	var spec := part.spec()
	var fill := Color(str(spec.fill))
	var stroke := Color(str(spec.stroke))
	for cell in part.cells():
		var rect := Rect2(Vector2(cell) * BalanceData.CELL + shake - Vector2.ONE * (BalanceData.CELL * 0.46), Vector2.ONE * BalanceData.CELL * 0.92)
		if str(spec.get("shape", "")) == "triangle" or str(spec.get("shape", "")) == "triangle-long":
			var triangle := PackedVector2Array([rect.position, rect.position + Vector2(rect.size.x, 0), rect.end, rect.position])
			var pivot := rect.get_center()
			for index in triangle.size():
				triangle[index] = pivot + (triangle[index] - pivot).rotated(part.quarter_turn * PI * 0.5)
			draw_colored_polygon(triangle.slice(0, 3), fill)
			draw_polyline(triangle, stroke, VisualData.HULL_OUTLINE_WIDTH, true)
		else:
			draw_rect(rect, fill, true)
			# 연결 면에는 선을 생략해 9-slice 외곽만 남긴다.
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not hull_cells.has(cell + axis):
					var a := rect.position
					var b := rect.position
					if axis == Vector2i.LEFT: b += Vector2(0, rect.size.y)
					elif axis == Vector2i.RIGHT: a += Vector2(rect.size.x, 0); b += rect.size
					elif axis == Vector2i.UP: b += Vector2(rect.size.x, 0)
					else: a += Vector2(0, rect.size.y); b += rect.size
					draw_line(a, b, stroke, VisualData.HULL_OUTLINE_WIDTH, true)
			draw_rect(Rect2(rect.position + Vector2(5, 5), Vector2(5, 5)), Color(1, 1, 1, 0.18), true)
	var center := Vector2(part.cell) * BalanceData.CELL + shake
	if part.spec().get("ammo_type", "") != "":
		draw_string(ThemeDB.fallback_font, center + Vector2(-18, 4), "%d/%d" % [part.ammo, part.capacity], HORIZONTAL_ALIGNMENT_CENTER, 36, 10, Color("fff0c2"))
	else:
		draw_string(ThemeDB.fallback_font, center + Vector2(-15, 4), str(spec.label).left(5), HORIZONTAL_ALIGNMENT_CENTER, 35, 9, Color("e8f7ff"))
	var bar_width := 28.0
	draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 15), Vector2(bar_width, 3)), Color(0.02, 0.04, 0.09, 0.78), true)
	draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 15), Vector2(bar_width * clampf(part.hp / maxf(part.max_hp, 1.0), 0.0, 1.0), 3)), stroke, true)

func draw_exhaust(part: PartData, direction: Vector2, shake: Vector2) -> void:
	var center := Vector2(part.cell) * BalanceData.CELL + shake
	var end := center + direction * VisualData.EXHAUST_LENGTH
	draw_line(center, end, VisualData.THRUSTER_COLORS[2], 11.0, true)
	draw_line(center, center.lerp(end, 0.72), VisualData.THRUSTER_COLORS[0], 6.0, true)
	draw_line(center, center.lerp(end, 0.38), VisualData.THRUSTER_COLORS[1], 2.2, true)
