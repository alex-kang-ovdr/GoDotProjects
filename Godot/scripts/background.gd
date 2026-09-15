class_name SpaceBackground
extends Node2D

const VisualData = preload("res://scripts/visual_tuning.gd")

var stars: Array[Dictionary] = []

func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 90210
	for index in VisualData.BACKGROUND_STAR_DENSITY:
		stars.append({"p": Vector2(rng.randf_range(-3000, 3000), rng.randf_range(-2000, 2000)), "r": rng.randf_range(0.6, 2.2), "a": rng.randf_range(0.22, 0.85)})
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(-5000, -5000, 10000, 10000), Color("050a14"), true)
	for star in stars:
		draw_circle(star.p, star.r, Color(0.6, 0.86, 1.0, star.a))
	# 저비용 은하수: 고정 시드의 반투명 띠. 텍스처를 포함하지 않는다.
	draw_colored_polygon(PackedVector2Array([Vector2(-4000,-900), Vector2(4000,500), Vector2(4000,950), Vector2(-4000,-450)]), Color(0.18, 0.32, 0.52, 0.08))
