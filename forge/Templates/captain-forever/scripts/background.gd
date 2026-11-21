class_name SpaceBackground
extends Node2D

## 다중 시차(Parallax) 성운 + 3단계 별무리 + 전술 섹터 그리드 배경 렌더러.

const VisualData = preload("res://scripts/visual_tuning.gd")
const GRID_STEP := 420.0

var stars_far: Array[Dictionary] = []
var stars_mid: Array[Dictionary] = []
var stars_near: Array[Dictionary] = []
var nebulae: Array[Dictionary] = []
var camera_pos := Vector2.ZERO
var pulse_time := 0.0

func _ready() -> void:
	z_index = -100
	var rng := RandomNumberGenerator.new()
	rng.seed = 90210
	var star_palette := [
		Color("bfe6ff"),
		Color("ffffff"),
		Color("ffd9a8"),
		Color("9ed0ff"),
		Color("d6c2ff"),
	]
	for i in 150:
		stars_far.append({
			"p": Vector2(rng.randf_range(-3200, 3200), rng.randf_range(-2200, 2200)),
			"r": rng.randf_range(0.7, 1.4),
			"c": star_palette[i % star_palette.size()],
			"a": rng.randf_range(0.18, 0.48),
		})
	for i in 110:
		stars_mid.append({
			"p": Vector2(rng.randf_range(-3200, 3200), rng.randf_range(-2200, 2200)),
			"r": rng.randf_range(1.2, 2.3),
			"c": star_palette[(i + 2) % star_palette.size()],
			"a": rng.randf_range(0.38, 0.78),
			"phase": rng.randf_range(0.0, TAU),
		})
	for i in 45:
		stars_near.append({
			"p": Vector2(rng.randf_range(-3200, 3200), rng.randf_range(-2200, 2200)),
			"r": rng.randf_range(2.0, 3.2),
			"c": star_palette[(i + 1) % star_palette.size()],
			"a": rng.randf_range(0.55, 0.95),
			"phase": rng.randf_range(0.0, TAU),
		})
	var nebula_colors := [
		Color(0.07, 0.26, 0.46, 0.13),
		Color(0.22, 0.10, 0.38, 0.11),
		Color(0.05, 0.34, 0.36, 0.10),
		Color(0.30, 0.14, 0.28, 0.09),
	]
	for i in 10:
		var pts := PackedVector2Array()
		var base_r := rng.randf_range(420.0, 820.0)
		for s in 12:
			var ang := float(s) * TAU / 12.0
			var rad := base_r * rng.randf_range(0.68, 1.26)
			pts.append(Vector2(cos(ang), sin(ang)) * rad)
		nebulae.append({
			"p": Vector2(rng.randf_range(-3600, 3600), rng.randf_range(-2600, 2600)),
			"pts": pts,
			"c": nebula_colors[i % nebula_colors.size()],
		})
	queue_redraw()

func _process(delta: float) -> void:
	pulse_time += delta
	var active_camera := get_viewport().get_camera_2d()
	if active_camera == null:
		return
	camera_pos = active_camera.get_screen_center_position()
	global_position = camera_pos
	queue_redraw()

func _wrap(p: Vector2, offset: Vector2, span: Vector2) -> Vector2:
	return Vector2(
		fposmod(p.x - offset.x + span.x * 0.5, span.x) - span.x * 0.5,
		fposmod(p.y - offset.y + span.y * 0.5, span.y) - span.y * 0.5
	)

func _draw() -> void:
	draw_rect(Rect2(-5000, -5000, 10000, 10000), Color("040915"), true)

	# 1. Deep-space nebula clouds (slow parallax)
	var neb_span := Vector2(7200.0, 5200.0)
	var neb_offset := camera_pos * 0.06
	for neb in nebulae:
		var center := _wrap(neb.p, neb_offset, neb_span)
		draw_set_transform(center, 0.0, Vector2.ONE)
		draw_colored_polygon(neb.pts, neb.c)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	# 2. Galactic dust band
	draw_colored_polygon(
		PackedVector2Array([Vector2(-4200, -980), Vector2(4200, 460), Vector2(4200, 980), Vector2(-4200, -440)]),
		Color(0.11, 0.27, 0.48, 0.08)
	)

	# 3. Subtle tactical sector grid (helps judge ship drift, speed, and rotation!)
	var grid_extent := 2520.0
	var gx_start := -fposmod(camera_pos.x, GRID_STEP) - grid_extent
	var gy_start := -fposmod(camera_pos.y, GRID_STEP) - grid_extent
	var grid_col := Color(0.16, 0.42, 0.62, 0.085)
	var major_col := Color(0.24, 0.66, 0.86, 0.15)
	var x := gx_start
	while x <= grid_extent:
		var world_ix := roundi((camera_pos.x + x) / GRID_STEP)
		draw_line(Vector2(x, -grid_extent), Vector2(x, grid_extent), major_col if posmod(world_ix, 4) == 0 else grid_col, 1.0)
		x += GRID_STEP
	var y := gy_start
	while y <= grid_extent:
		var world_iy := roundi((camera_pos.y + y) / GRID_STEP)
		draw_line(Vector2(-grid_extent, y), Vector2(grid_extent, y), major_col if posmod(world_iy, 4) == 0 else grid_col, 1.0)
		y += GRID_STEP

	# 4. 3-Layer parallax starfield with twinkle
	var span := Vector2(6400.0, 4400.0)
	var off_far := camera_pos * 0.09
	for s in stars_far:
		var pos := _wrap(s.p, off_far, span)
		draw_circle(pos, s.r, Color(s.c.r, s.c.g, s.c.b, s.a))

	var off_mid := camera_pos * 0.18
	for s in stars_mid:
		var pos := _wrap(s.p, off_mid, span)
		var tw: float = float(s.a) * (0.82 + 0.18 * sin(pulse_time * 1.9 + float(s.phase)))
		draw_circle(pos, float(s.r), Color(s.c.r, s.c.g, s.c.b, tw))

	var off_near := camera_pos * 0.32
	for s in stars_near:
		var pos := _wrap(s.p, off_near, span)
		var tw: float = float(s.a) * (0.78 + 0.22 * sin(pulse_time * 2.7 + float(s.phase)))
		var sr: float = float(s.r)
		var col := Color(s.c.r, s.c.g, s.c.b, tw)
		draw_circle(pos, sr * 1.9, Color(s.c.r, s.c.g, s.c.b, tw * 0.18))
		draw_circle(pos, sr, col)
		draw_line(pos + Vector2(-sr * 2.4, 0.0), pos + Vector2(sr * 2.4, 0.0), Color(col, tw * 0.45), 1.0)
		draw_line(pos + Vector2(0.0, -sr * 2.4), pos + Vector2(0.0, sr * 2.4), Color(col, tw * 0.45), 1.0)
