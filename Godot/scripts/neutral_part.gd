class_name NeutralPart
extends RigidBody2D

const BalanceData = preload("res://scripts/balance.gd")

var part: PartData

func setup(data: PartData, initial_velocity: Vector2) -> void:
	part = data
	linear_velocity = initial_velocity
	gravity_scale = 0.0
	linear_damp = 0.35
	var collider := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2.ONE * BalanceData.CELL * 0.82
	collider.shape = shape
	add_child(collider)
	queue_redraw()

func _draw() -> void:
	if part == null:
		return
	var spec := part.spec()
	var rect := Rect2(-Vector2.ONE * BalanceData.CELL * 0.41, Vector2.ONE * BalanceData.CELL * 0.82)
	draw_rect(rect, Color(str(spec.fill)), true)
	draw_rect(rect, Color(str(spec.stroke)), false, 2.0)
	draw_string(ThemeDB.fallback_font, Vector2(-18, 4), "SALV", HORIZONTAL_ALIGNMENT_CENTER, 36, 10, Color.WHITE)
