class_name Projectile
extends Area2D

var velocity := Vector2.ZERO
var life := 1.5
var tint := Color.WHITE
var guided_target := Vector2.ZERO
var guided := false
var damage := 0.0
var team := "player"
var kind := "laser"
var previous_position := Vector2.ZERO
var target_ship: Node2D
var turn_speed := 2.5
var age := 0.0
var distance_travelled := 0.0
var max_range := INF

func setup(info: Dictionary) -> void:
	global_position = info.position
	previous_position = global_position
	velocity = info.velocity
	tint = info.color
	guided = bool(info.get("guided", false))
	guided_target = info.get("target", Vector2.ZERO)
	damage = float(info.get("damage", 0.0))
	team = str(info.get("team", "player"))
	kind = str(info.get("kind", "laser"))
	life = float(info.get("life", life))
	target_ship = info.get("target_ship", null)
	turn_speed = float(info.get("turn_speed", 2.5))
	max_range = float(info.get("max_range", INF))
	queue_redraw()

func advance(delta: float) -> void:
	# 이동과 swept hit 판정을 같은 고정 물리 스텝에서 실행한다.
	previous_position = global_position
	age += delta
	if is_instance_valid(target_ship):
		guided_target = target_ship.global_position
	if guided:
		var speed := velocity.length()
		if kind == "mini_missile" and age >= float(Balance.WEAPONS.mini_missile.lock_seconds):
			speed = minf(float(Balance.WEAPONS.mini_missile.max_speed), speed + float(Balance.WEAPONS.mini_missile.boost) * delta)
		var desired_angle := global_position.direction_to(guided_target).angle()
		velocity = Vector2.RIGHT.rotated(rotate_toward(velocity.angle(), desired_angle, turn_speed * delta)) * speed
	global_position += velocity * delta
	distance_travelled += velocity.length() * delta
	life -= delta
	if distance_travelled >= max_range: life = 0.0

func _draw() -> void:
	draw_circle(Vector2.ZERO, 4.0, tint)
	draw_circle(Vector2.ZERO, 8.0, Color(tint, 0.18))
