class_name Projectile
extends Area2D

var velocity := Vector2.ZERO
var life := 1.5
var tint := Color.WHITE
var guided_target := Vector2.ZERO
var guided := false

func setup(info: Dictionary) -> void:
	global_position = info.position
	velocity = info.velocity
	tint = info.color
	guided = bool(info.get("guided", false))
	guided_target = info.get("target", Vector2.ZERO)
	queue_redraw()

func _process(delta: float) -> void:
	if guided and guided_target != Vector2.ZERO:
		velocity = velocity.lerp(global_position.direction_to(guided_target) * velocity.length(), delta * 2.5)
	global_position += velocity * delta
	life -= delta
	if life <= 0.0:
		queue_free()

func _draw() -> void:
	draw_circle(Vector2.ZERO, 4.0, tint)
	draw_circle(Vector2.ZERO, 8.0, Color(tint, 0.18))
