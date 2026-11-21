class_name NeutralPart
extends RigidBody2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var part: PartData
var narrative_tag := ""
var collision_grace_left := 0.0
var pulse_phase := 0.0

func setup(data: PartData, initial_velocity: Vector2, initial_angular_velocity: float = 0.0, tag: String = "", collision_grace_seconds: float = 0.0) -> void:
	part = data
	narrative_tag = tag
	pulse_phase = randf_range(0.0, TAU)
	linear_velocity = initial_velocity
	angular_velocity = clampf(initial_angular_velocity, -PhysicsData.DEBRIS_MAX_ANGULAR_SPEED, PhysicsData.DEBRIS_MAX_ANGULAR_SPEED)
	gravity_scale = 0.0
	mass = float(part.spec().mass)
	inertia = maxf(0.001, mass * part_inertia_radius_squared() * PhysicsData.DEBRIS_INERTIA_MULTIPLIER)
	linear_damp_mode = RigidBody2D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody2D.DAMP_MODE_REPLACE
	linear_damp = PhysicsData.ENGINE_LINEAR_DAMP
	angular_damp = PhysicsData.ENGINE_ANGULAR_DAMP
	physics_material_override = PhysicsData.dynamic_material(PhysicsData.NEUTRAL_PART_BOUNCE)
	for cell in part.cells():
		var collider := CollisionShape2D.new()
		var shape := RectangleShape2D.new()
		shape.size = Vector2.ONE * BalanceData.CELL * PhysicsData.NEUTRAL_PART_COLLIDER_SCALE
		collider.shape = shape
		collider.position = Vector2(cell - part.cell) * BalanceData.CELL
		add_child(collider)
	set_collision_grace(collision_grace_seconds)
	queue_redraw()

func _process(delta: float) -> void:
	pulse_phase += delta * 3.2
	queue_redraw()

func contains_world_point(point: Vector2) -> bool:
	if part == null: return false
	var local_point := to_local(point)
	for cell in part.cells():
		var center := Vector2(cell - part.cell) * BalanceData.CELL
		if Rect2(center - Vector2.ONE * BalanceData.CELL * 0.5, Vector2.ONE * BalanceData.CELL).has_point(local_point):
			return true
	return false

func _physics_process(delta: float) -> void:
	if collision_grace_left <= 0.0:
		return
	collision_grace_left = maxf(0.0, collision_grace_left - delta)
	if collision_grace_left <= 0.0:
		collision_layer = PhysicsData.DEBRIS_COLLISION_LAYER
		collision_mask = PhysicsData.DEBRIS_COLLISION_MASK

func set_collision_grace(seconds: float) -> void:
	collision_grace_left = maxf(0.0, seconds)
	if collision_grace_left > 0.0:
		collision_layer = 0
		collision_mask = 0
	else:
		collision_layer = PhysicsData.DEBRIS_COLLISION_LAYER
		collision_mask = PhysicsData.DEBRIS_COLLISION_MASK

func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	PhysicsData.apply_reference_damping(state, PhysicsData.NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND, PhysicsData.NEUTRAL_PART_ANGULAR_RETAIN_PER_SECOND)

func part_inertia_radius_squared() -> float:
	return maxf(
		(BalanceData.CELL * 0.5) * (BalanceData.CELL * 0.5),
		BalanceData.CELL * BalanceData.CELL * float(part.cells().size()) * 0.25
	)

func _draw() -> void:
	if part == null:
		return
	var spec := part.spec()
	var grade_col := VisualData.grade_color(str(spec.get("grade_color", "gray")))
	var center := Vector2.ZERO
	for cell in part.cells():
		center += Vector2(cell - part.cell) * BalanceData.CELL
	center /= float(maxi(1, part.cells().size()))

	# Pulsing salvage beacon halo
	if part.kind != "scrap":
		var halo_alpha := 0.20 + 0.14 * sin(pulse_phase)
		draw_arc(center, 27.0, 0.0, TAU, 24, Color(grade_col.r, grade_col.g, grade_col.b, halo_alpha), 1.6, true)

	var rect := Rect2(-Vector2.ONE * BalanceData.CELL * (PhysicsData.NEUTRAL_PART_COLLIDER_SCALE * 0.5), Vector2.ONE * BalanceData.CELL * PhysicsData.NEUTRAL_PART_COLLIDER_SCALE)
	for cell in part.cells():
		var cell_rect := Rect2(rect.position + Vector2(cell - part.cell) * BalanceData.CELL, rect.size)
		draw_rect(cell_rect, Color(str(spec.fill)).lightened(0.08), true)
		draw_rect(cell_rect.grow(-3.5), Color(str(spec.fill)).lightened(0.22), true)
		draw_rect(cell_rect, grade_col if part.kind != "scrap" else Color(str(spec.stroke)), false, 2.0)

	draw_set_transform(center, VisualData.module_label_rotation(self))
	var label := VisualData.module_debug_label(part.kind)
	draw_rect(Rect2(Vector2(-22, -9), Vector2(44, 17)), Color(0.03, 0.08, 0.15, 0.86), true)
	draw_string(ThemeDB.fallback_font, Vector2(-21, 4), label, HORIZONTAL_ALIGNMENT_CENTER, 42, 10, grade_col.lightened(0.35) if part.kind != "scrap" else Color("a8b5c4"))
	if part.kind != "scrap":
		var durability := clampf(part.hp / maxf(part.max_hp, 0.001), 0.0, 1.0)
		draw_rect(Rect2(-Vector2(14, 15), Vector2(28, 3)), Color(0.02, 0.04, 0.09, 0.82), true)
		draw_rect(Rect2(-Vector2(14, 15), Vector2(28 * durability, 3)), Color("ff9f6e") if durability < 0.5 else Color("6ee7a4"), true)
	draw_set_transform(Vector2.ZERO)
