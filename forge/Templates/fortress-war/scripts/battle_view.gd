extends Node2D

var engine
var terrain_version := -1
var terrain_sprite: Sprite2D
var terrain_texture: ImageTexture
var trajectory: Array = []
var preview_clock := 0.0
var flashes: Array = []
var font: Font = ThemeDB.fallback_font
const BLUE := Color("65d8ff")
const RED := Color("ff8c88")

func _ready() -> void:
	terrain_sprite = Sprite2D.new()
	terrain_sprite.name = "DestructibleTerrain"
	terrain_sprite.centered = false
	terrain_sprite.show_behind_parent = true
	terrain_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var shader_material := ShaderMaterial.new()
	shader_material.shader = load("res://materials/terrain.gdshader")
	terrain_sprite.material = shader_material
	add_child(terrain_sprite)

func bind_engine(value) -> void:
	engine = value
	terrain_version = -1
	terrain_texture = null
	trajectory.clear()
	flashes.clear()
	refresh(0.0)

func refresh(delta: float) -> void:
	if engine == null or terrain_sprite == null:
		return
	if terrain_version != int(engine.terrain.version):
		var terrain_image := Image.create_from_data(1800, 820, false, Image.FORMAT_R8, engine.terrain.mask)
		if terrain_texture == null:
			terrain_texture = ImageTexture.create_from_image(terrain_image)
			terrain_sprite.texture = terrain_texture
		else:
			terrain_texture.update(terrain_image)
		terrain_version = int(engine.terrain.version)
	preview_clock -= delta
	if preview_clock <= 0.0:
		trajectory = engine.get_trajectory() if engine.is_human_turn() else []
		preview_clock = 0.12
	for flash in flashes:
		flash.life -= delta
	flashes = flashes.filter(func(f): return f.life > 0.0)
	queue_redraw()

func add_event(event: Dictionary) -> void:
	if event.get("type") == "explosion":
		flashes.append({"position": Vector2(event.get("x", 0), event.get("y", 0)), "radius": event.get("radius", 50), "life": 0.45})

func _draw() -> void:
	if engine == null:
		return
	for i in range(0, trajectory.size(), 3):
		var point = trajectory[i]
		draw_circle(Vector2(point.x, point.y), 3.0, Color(0.9, 0.96, 1.0, 0.5))
	for mine in engine.state.get("mines", []):
		draw_circle(Vector2(mine.x, mine.y), 7, Color("ffba65"))
	for hazard in engine.state.get("hazards", []):
		var tint := Color(0.8, 0.4, 0.15, 0.4) if hazard.get("kind", "fire") == "fire" else Color(0.5, 0.9, 0.3, 0.4)
		draw_circle(Vector2(hazard.x, hazard.y), float(hazard.get("radius", 30)), tint)
	for tank in engine.state.tanks:
		if not tank.alive:
			continue
		_draw_tank(tank)
	for shot in engine.state.projectiles:
		var trail = shot.get("trail", [])
		for i in range(1, trail.size()):
			var a = trail[i - 1]
			var b = trail[i]
			draw_line(Vector2(a.x, a.y), Vector2(b.x, b.y), Color(1, 0.88, 0.5, float(i) / trail.size() * 0.7), 3)
		draw_circle(Vector2(shot.x, shot.y), 6, Color("fff3b0"))
	for flash in flashes:
		var progress: float = 1.0 - flash.life / 0.45
		draw_circle(flash.position, float(flash.radius) * (0.4 + progress), Color(1, 0.75, 0.3, (1 - progress) * 0.7))
		draw_arc(flash.position, float(flash.radius) * (0.4 + progress), 0, TAU, 40, Color(1, 0.95, 0.7, 1 - progress), 3)

func _draw_tank(tank: Dictionary) -> void:
	var point := Vector2(tank.x, tank.y)
	var team_color := BLUE if tank.team == 0 else RED
	var body_color := Color.from_string(tank.def.get("color", "#d9a05b"), Color.WHITE)
	if tank.uid == engine.state.activeId and engine.state.phase != "gameover":
		draw_arc(point, 34, 0, TAU, 32, team_color, 3)
		draw_colored_polygon(PackedVector2Array([point + Vector2(-8, -63), point + Vector2(8, -63), point + Vector2(0, -52)]), team_color)
	if float(tank.status.get("shield", 0)) > 0:
		draw_circle(point, 31, Color(0.4, 0.8, 1, 0.16))
		draw_arc(point, 31, 0, TAU, 32, Color(0.4, 0.8, 1, 0.65), 2)
	draw_set_transform(point, tank.tilt)
	draw_style_box(_body_style(Color("131e2c")), Rect2(-23, 2, 46, 16))
	for x in [-15, 0, 15]:
		draw_circle(Vector2(x, 10), 5, Color("617281"))
	draw_style_box(_body_style(body_color), Rect2(-20, -12, 40, 23))
	var direction := Vector2(cos(deg_to_rad(tank.angle)) * tank.face, -sin(deg_to_rad(tank.angle)))
	draw_line(Vector2(0, -7), Vector2(0, -7) + direction * 34, Color("172536"), 10)
	draw_line(Vector2(0, -7), Vector2(0, -7) + direction * 34, body_color.lightened(0.3), 5)
	draw_circle(Vector2(0, -7), 8, body_color.lightened(0.15))
	draw_set_transform(Vector2.ZERO)
	draw_rect(Rect2(point + Vector2(-30, -39), Vector2(60, 6)), Color("263443"))
	draw_rect(Rect2(point + Vector2(-30, -39), Vector2(60.0 * tank.hp / tank.maxHp, 6)), team_color)
	draw_string(font, point + Vector2(-32, -44), str(int(tank.hp)), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
	draw_string(font, point + Vector2(-50, 42), str(tank.name), HORIZONTAL_ALIGNMENT_CENTER, 100, 16, team_color)

func _body_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(5)
	return style
