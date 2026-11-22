class_name Projectile
extends Area2D

## 고시인성 SF 투사체: 무기 종류별 궤적(Trail)·플라즈마 코어·유도 미사일 화염 연출.

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
var trail: Array[Vector2] = []

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
	trail.clear()
	trail.append(global_position)
	queue_redraw()

func advance(delta: float) -> void:
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
	if distance_travelled >= max_range:
		life = 0.0
	trail.push_front(global_position)
	var max_pts := 10 if guided else (7 if kind == "railgun" else 5)
	while trail.size() > max_pts:
		trail.pop_back()
	queue_redraw()

func _draw() -> void:
	# 1. Motion trail
	if trail.size() >= 2:
		for i in range(trail.size() - 1):
			var a := trail[i] - global_position
			var b := trail[i + 1] - global_position
			var ratio := 1.0 - float(i) / float(trail.size())
			var w := (5.5 if kind == "railgun" else (4.2 if guided else 3.4)) * ratio
			draw_line(a, b, Color(tint.r, tint.g, tint.b, 0.52 * ratio), maxf(1.2, w), true)

	var dir := velocity.normalized() if velocity.length_squared() > 1.0 else Vector2.RIGHT
	var perp := Vector2(-dir.y, dir.x)

	if guided:
		# Missile / Torpedo body + thruster flare
		var nose := dir * 9.0
		var tail_l := -dir * 7.0 + perp * 4.2
		var tail_r := -dir * 7.0 - perp * 4.2
		draw_circle(-dir * 8.5, 5.5, Color(1.0, 0.58, 0.20, 0.55))
		draw_colored_polygon(PackedVector2Array([nose, tail_l, tail_r]), tint.lightened(0.25))
		draw_polyline(PackedVector2Array([nose, tail_l, tail_r, nose]), Color.WHITE, 1.2, true)
	elif kind == "railgun":
		# High-energy piercing slug
		draw_line(-dir * 16.0, dir * 12.0, Color(tint, 0.36), 9.0, true)
		draw_line(-dir * 13.0, dir * 10.0, tint, 4.0, true)
		draw_line(-dir * 8.0, dir * 9.0, Color.WHITE, 2.0, true)
	else:
		# Plasma / Laser bolt
		draw_circle(Vector2.ZERO, 9.0, Color(tint, 0.18))
		draw_line(-dir * 9.0, dir * 7.0, tint, 4.6, true)
		draw_line(-dir * 5.0, dir * 6.0, Color.WHITE, 2.0, true)
