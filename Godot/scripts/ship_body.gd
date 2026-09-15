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
var turret_target := Vector2.ZERO
var is_player := true

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
	break_shake_time = maxf(0.0, break_shake_time - delta)
	if break_shake_time <= 0.0:
		break_shake = 0.0
	if shield_layers < model.shield_capacity():
		shield_recharge_left -= delta
		if shield_recharge_left <= 0.0:
			shield_layers += 1
			shield_recharge_left = float(BalanceData.SHIELD.base_recharge)
	queue_redraw()

func apply_player_thrusters(forward: float, reverse: float, turn: float) -> void:
	var forward_force := actuator_force("forward") * clampf(forward, 0.0, 1.0)
	var reverse_force := actuator_force("reverse") * clampf(reverse, 0.0, 1.0)
	# CoM과 추진선의 어긋남을 반대 RCS 토크로 자동 상쇄한다.
	var com_offset := center_of_mass.y / BalanceData.CELL
	var main_scale := clampf(1.0 - absf(com_offset) * 0.06, float(BalanceData.PHYSICS.forward_min), float(BalanceData.PHYSICS.forward_max))
	if forward_force > 0.0:
		apply_central_force(Vector2.RIGHT.rotated(rotation) * forward_force * main_scale)
	if reverse_force > 0.0:
		apply_central_force(Vector2.LEFT.rotated(rotation) * reverse_force)
	var rcs := actuator_force("turn")
	apply_torque((turn * rcs) - (com_offset * forward_force * 0.08))

func actuator_force(kind: String) -> float:
	var force := 0.0
	for part in model.parts:
		if part.spec().get("actuator", "") == kind:
			force += float(part.spec().get("force", 0.0))
	return force

func fire_laser(target: Vector2) -> Dictionary:
	if laser_cooldown > 0.0:
		return {}
	var has_laser := false
	for part in model.parts:
		if part.kind == "laser":
			has_laser = true
			break
	if not has_laser:
		return {}
	laser_cooldown = float(BalanceData.WEAPONS.laser.cooldown)
	turret_target = target
	return {"position": global_position, "velocity": global_position.direction_to(target) * float(BalanceData.WEAPONS.laser.speed), "damage": float(BalanceData.WEAPONS.laser.damage), "color": Color("ff92e8")}

func fire_missile(target: Vector2) -> Dictionary:
	if not has_part("missile_launcher") or not model.consume_ammo("missile", int(BalanceData.WEAPONS.missile.ammo_cost)):
		return {}
	return {"position": global_position, "velocity": global_position.direction_to(target) * float(BalanceData.WEAPONS.missile.speed), "damage": float(BalanceData.WEAPONS.missile.damage), "color": Color("ffbd78"), "guided": true, "target": target}

func has_part(kind: String) -> bool:
	for part in model.parts:
		if part.kind == kind:
			return true
	return false

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
			draw_colored_polygon(PackedVector2Array([rect.position, rect.position + Vector2(rect.size.x, 0), rect.end]), fill)
			draw_polyline(PackedVector2Array([rect.position, rect.position + Vector2(rect.size.x, 0), rect.end, rect.position]), stroke, VisualData.HULL_OUTLINE_WIDTH, true)
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
	draw_string(ThemeDB.fallback_font, center + Vector2(-15, 4), str(spec.label).left(5), HORIZONTAL_ALIGNMENT_CENTER, 35, 9, Color("e8f7ff"))
