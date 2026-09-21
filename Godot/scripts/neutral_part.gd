class_name NeutralPart
extends RigidBody2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")

var part: PartData
var narrative_tag := ""

func setup(data: PartData, initial_velocity: Vector2, initial_angular_velocity: float = 0.0, tag: String = "") -> void:
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
	var collider := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2.ONE * BalanceData.CELL * PhysicsData.NEUTRAL_PART_COLLIDER_SCALE
	collider.shape = shape
	add_child(collider)
	queue_redraw()

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
	draw_rect(rect, Color(str(spec.fill)), true)
	draw_rect(rect, Color(str(spec.stroke)), false, 2.0)
	var label := "SCRP" if part.kind == "scrap" else "SALV"
	draw_string(ThemeDB.fallback_font, Vector2(-18, 4), label, HORIZONTAL_ALIGNMENT_CENTER, 36, 10, Color.WHITE)
	if part.kind != "scrap":
		var durability := clampf(part.hp / maxf(part.max_hp, 0.001), 0.0, 1.0)
		draw_rect(Rect2(-Vector2(14, 18), Vector2(28, 3)), Color(0.02, 0.04, 0.09, 0.82), true)
		draw_rect(Rect2(-Vector2(14, 18), Vector2(28 * durability, 3)), Color("ff9f6e") if durability < 0.5 else Color("9be6b0"), true)
