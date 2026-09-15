class_name NeutralPart
extends RigidBody2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")

var part: PartData

func setup(data: PartData, initial_velocity: Vector2) -> void:
	part = data
	linear_velocity = initial_velocity
	gravity_scale = 0.0
	mass = float(part.spec().mass)
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
	PhysicsData.apply_reference_damping(state, PhysicsData.NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND, PhysicsData.NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND)

func _draw() -> void:
	if part == null:
		return
	var spec := part.spec()
	var rect := Rect2(-Vector2.ONE * BalanceData.CELL * (PhysicsData.NEUTRAL_PART_COLLIDER_SCALE * 0.5), Vector2.ONE * BalanceData.CELL * PhysicsData.NEUTRAL_PART_COLLIDER_SCALE)
	draw_rect(rect, Color(str(spec.fill)), true)
	draw_rect(rect, Color(str(spec.stroke)), false, 2.0)
	draw_string(ThemeDB.fallback_font, Vector2(-18, 4), "SALV", HORIZONTAL_ALIGNMENT_CENTER, 36, 10, Color.WHITE)
