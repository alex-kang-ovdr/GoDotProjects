class_name NeutralPart
extends RigidBody2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var part: PartData
var narrative_tag := ""
var collision_grace_left := 0.0

func setup(data: PartData, initial_velocity: Vector2, initial_angular_velocity: float = 0.0, tag: String = "", collision_grace_seconds: float = 0.0) -> void:
	part = data
	narrative_tag = tag
	linear_velocity = initial_velocity
	angular_velocity = clampf(initial_angular_velocity, -PhysicsData.DEBRIS_MAX_ANGULAR_SPEED, PhysicsData.DEBRIS_MAX_ANGULAR_SPEED)
	gravity_scale = 0.0
	mass = float(part.spec().mass)
	# RigidBody2D는 2D 물리이므로 inertia tensor 대신 스칼라 관성 모멘트를 쓴다.
	# 자동 산정치보다 크게 잡아, 같은 충격에서도 파트가 급격히 팽이처럼 돌지 않게 한다.
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

func _process(_delta: float) -> void:
	if not VisualData.use_textured_design:
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
		# 충돌체는 유지하되 레이어/마스크를 비워, 위치 보정 없이 운동량만 계승한다.
		collision_layer = 0
		collision_mask = 0
	else:
		collision_layer = PhysicsData.DEBRIS_COLLISION_LAYER
		collision_mask = PhysicsData.DEBRIS_COLLISION_MASK

func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	PhysicsData.apply_reference_damping(state, PhysicsData.NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND, PhysicsData.NEUTRAL_PART_ANGULAR_RETAIN_PER_SECOND)

func part_inertia_radius_squared() -> float:
	# part.cell은 파괴 전 선체 내 좌표이므로 관성 산정에 쓰지 않는다.
	# 실제 파트의 면적(footprint)만 반영해, 어느 위치에서 떨어져도 같은 회전 저항을 갖는다.
	return maxf(
		(BalanceData.CELL * 0.5) * (BalanceData.CELL * 0.5),
		BalanceData.CELL * BalanceData.CELL * float(part.cells().size()) * 0.25
	)

func _draw() -> void:
	if part == null:
		return
	var spec := part.spec()
	var rect := Rect2(-Vector2.ONE * BalanceData.CELL * (PhysicsData.NEUTRAL_PART_COLLIDER_SCALE * 0.5), Vector2.ONE * BalanceData.CELL * PhysicsData.NEUTRAL_PART_COLLIDER_SCALE)
	for cell in part.cells():
		var cell_rect := Rect2(rect.position + Vector2(cell - part.cell) * BalanceData.CELL, rect.size)
		draw_rect(cell_rect, Color(str(spec.fill)), true)
		draw_rect(cell_rect, Color(str(spec.stroke)), false, 2.0)
	var label := "SCRP" if part.kind == "scrap" else "SALV"
	if not VisualData.use_textured_design:
		var center := Vector2.ZERO
		for cell in part.cells(): center += Vector2(cell - part.cell) * BalanceData.CELL
		center /= float(part.cells().size())
		draw_set_transform(center, VisualData.module_label_rotation(self))
		draw_rect(Rect2(Vector2(-21, -10), Vector2(42, 20)), Color("071221", 0.94), true)
		label = VisualData.module_debug_label(part.kind)
	draw_string(ThemeDB.fallback_font, Vector2(-20, 4), label, HORIZONTAL_ALIGNMENT_CENTER, 40, 10, Color.WHITE)
	if part.kind != "scrap":
		var durability := clampf(part.hp / maxf(part.max_hp, 0.001), 0.0, 1.0)
		draw_rect(Rect2(-Vector2(14, 18), Vector2(28, 3)), Color(0.02, 0.04, 0.09, 0.82), true)
		draw_rect(Rect2(-Vector2(14, 18), Vector2(28 * durability, 3)), Color("ff9f6e") if durability < 0.5 else Color("9be6b0"), true)
	draw_set_transform(Vector2.ZERO)
