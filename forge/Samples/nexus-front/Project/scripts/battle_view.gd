extends Control
## Native CanvasItem battlefield; simulation is independent of scene rendering.
signal ground_order(position: Vector2, attack_move: bool)
signal target_order(id: int)
signal cast_order(slot: String, position: Vector2, target_id: int)
signal selection_changed(id: int)

const BLUE = Color("62d7e5")
const RED = Color("f08086")
const GOLD = Color("ddc18b")
var world
var camera_pos = Vector2.ZERO
var zoom = 1.0
var follow = true
var aim_slot = ""
var attack_move_mode = false
var selected_id = -1
var show_ranges = false
var portrait_cache = {}
var font: Font
var _fog_texture: ImageTexture
var _fog_revision = -1
var _mouse_world = Vector2.ZERO
var _pan = false
var _order_marker = Vector2.ZERO
var _order_at = -100.0
var _clock = 0.0
var _visibility_texture: ImageTexture
var _effects_viewport: SubViewport
var _effects_canvas
var _effects_rect: TextureRect
var _effects_material: ShaderMaterial

func _ready():
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	font = load("res://assets/NexusSansKR.otf")
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_setup_effect_layer()
	set_process(true)

func set_world(value):
	world = value
	camera_pos = world.hero().get("pos", Vector2.ONE * 800)
	_fog_revision = -1
	selected_id = -1
	aim_slot = ""
	follow = true
	queue_redraw()

func _process(dt):
	_clock += dt
	if world == null:
		return
	var player = world.hero()
	if follow and not player.is_empty():
		camera_pos = camera_pos.lerp(player.pos, 1.0 - exp(-dt * 7.5))
	var half = size / (2.0 * zoom)
	camera_pos.x = clampf(camera_pos.x, minf(half.x, world.size * 0.5), maxf(world.size - half.x, world.size * 0.5))
	camera_pos.y = clampf(camera_pos.y, minf(half.y, world.size * 0.5), maxf(world.size - half.y, world.size * 0.5))
	_mouse_world = screen_to_world(get_local_mouse_position())
	_update_fog()
	_update_effect_layer()
	queue_redraw()

func screen_to_world(point: Vector2) -> Vector2:
	return (point - size * 0.5) / zoom + camera_pos

func world_to_screen(point: Vector2) -> Vector2:
	return (point - camera_pos) * zoom + size * 0.5

func focus_camera(position_value: Vector2):
	camera_pos = position_value
	follow = false

func _update_fog():
	if world == null or world.vision == null:
		return
	var mask = world.vision.mask(0)
	if mask.is_empty() or mask.get("revision", 0) == _fog_revision:
		return
	_fog_revision = mask.get("revision", 0)
	var cols = int(mask.cols)
	var rows = int(mask.rows)
	var pixels = PackedByteArray()
	pixels.resize(cols * rows * 4)
	for i in range(cols * rows):
		pixels[i * 4] = 3
		pixels[i * 4 + 1] = 8
		pixels[i * 4 + 2] = 15
		pixels[i * 4 + 3] = 0 if mask.visible[i] else (186 if mask.explored[i] else 255)
	var visible_pixels = PackedByteArray()
	visible_pixels.resize(cols * rows)
	for i in range(cols * rows):
		visible_pixels[i] = 255 if mask.visible[i] else 0
	var visibility_image = Image.create_from_data(cols, rows, false, Image.FORMAT_R8, visible_pixels)
	if _visibility_texture == null or _visibility_texture.get_width() != cols:
		_visibility_texture = ImageTexture.create_from_image(visibility_image)
	else:
		_visibility_texture.update(visibility_image)
	var image = Image.create_from_data(cols, rows, false, Image.FORMAT_RGBA8, pixels)
	if _fog_texture == null or _fog_texture.get_width() != cols:
		_fog_texture = ImageTexture.create_from_image(image)
	else:
		_fog_texture.update(image)

func _draw():
	draw_rect(Rect2(Vector2.ZERO, size), Color("07121b"))
	if world == null:
		return
	draw_set_transform(size * 0.5 - camera_pos * zoom, 0.0, Vector2.ONE * zoom)
	_draw_terrain()
	if _fog_texture:
		draw_texture_rect(_fog_texture, Rect2(0, 0, world.size, world.size), false)
	_draw_observations()
	var sorted = world.entities.duplicate()
	sorted.sort_custom(func(a, b): return a.pos.y < b.pos.y)
	for e in sorted:
		if not e.get("alive", false) or e.kind in ["tower", "inhibitor", "nexus", "camp", "dragon", "boss"]:
			continue
		if not world.visible_to(e, 0):
			continue
		_draw_unit(e)
	_draw_reveals()
	_draw_aim()
	if _clock - _order_at < 0.8:
		var a = 1.0 - (_clock - _order_at) / 0.8
		draw_arc(_order_marker, 8.0 + 20.0 * (1.0 - a), 0, TAU, 32, Color(BLUE, a), 2.0, true)
		draw_line(_order_marker - Vector2(5, 0), _order_marker + Vector2(5, 0), Color(BLUE, a), 1.5, true)
		draw_line(_order_marker - Vector2(0, 5), _order_marker + Vector2(0, 5), Color(BLUE, a), 1.5, true)
	draw_set_transform(Vector2.ZERO)
	_draw_compass()

func _draw_terrain():
	var scale_value = float(world.get("map_scale")) if world.get("map_scale") != null else world.size / 1600.0
	draw_rect(Rect2(0, 0, world.size, world.size), Color("112a2c"))
	# Deterministic decoration never consumes simulation RNG.
	for gx in range(0, int(world.size), 90):
		for gy in range(0, int(world.size), 90):
			var k = float((gx * 17 + gy * 23) % 31)
			var p = Vector2(gx + 13 + k, gy + 22 + k * 0.3)
			draw_circle(p, 25 + k * 0.3, Color("153231"), false, 1.0)
			draw_line(p + Vector2(-6, 3), p + Vector2(4, -2), Color("20413b"), 1.0)
	# River crossing from northwest to southeast.
	var river = PackedVector2Array([Vector2(290, 310), Vector2(520, 520), Vector2(800, 800), Vector2(1080, 1080), Vector2(1310, 1290)])
	for i in river.size():
		river[i] *= scale_value
	draw_polyline(river, Color("193d45"), 166 * scale_value, true)
	draw_polyline(river, Color("1a4652"), 138 * scale_value, true)
	draw_polyline(river, Color("235360"), 2.5, true)
	for lane in world.lanes.values():
		var pts = PackedVector2Array(lane)
		draw_polyline(pts, Color("2c4340"), 118 * scale_value, true)
		draw_polyline(pts, Color("4c5347"), 99 * scale_value, true)
		draw_polyline(pts, Color("535a4d"), 81 * scale_value, true)
		for j in range(pts.size() - 1):
			var distance = pts[j].distance_to(pts[j + 1])
			var count = int(distance / 54)
			var side = (pts[j + 1] - pts[j]).normalized().orthogonal() * 29 * scale_value
			for k in range(1, count):
				var p = pts[j].lerp(pts[j + 1], float(k) / count)
				draw_line(p - side, p + side, Color("444f45"), 1.5, true)
	for ground in world.map.highGrounds:
		var center = Vector2(ground.x, ground.y)
		draw_circle(center + Vector2(0, 9), ground.r + 8, Color("0c2026"))
		draw_circle(center, ground.r, Color("354b40"))
		draw_arc(center, ground.r - 3, 0, TAU, 56, Color("6c7b58"), 2.0, true)
		draw_arc(center, ground.r - 12, 0, TAU, 56, Color("536746"), 1.0, true)
		_draw_text(center + Vector2(-14, 5), "+1", 13, Color("b3bd87"))
	for brush in world.map.brushes:
		var center = Vector2(brush.x, brush.y)
		draw_circle(center, brush.r, Color("1a4537"))
		for j in range(15):
			var angle = j * 2.4
			var p = center + Vector2.from_angle(angle) * (brush.r * (0.2 + 0.65 * float(j % 4) / 3.0))
			draw_line(p + Vector2(-4, 7), p + Vector2(0, -10), Color("397653"), 2.0, true)
			draw_line(p + Vector2(0, 5), p + Vector2(6, -7), Color("49805a"), 1.5, true)
	for obstacle in world.map.obstacles:
		var center = Vector2(obstacle.x, obstacle.y)
		draw_circle(center + Vector2(5, 8), obstacle.r + 6, Color("081b23"))
		var rock = PackedVector2Array()
		for j in range(7):
			rock.append(center + Vector2.from_angle(float(j) * TAU / 7.0) * obstacle.r * (0.88 + float(j % 2) * 0.12))
		draw_colored_polygon(rock, Color("33494c"))
		rock.append(rock[0])
		draw_polyline(rock, Color("64726a"), 2, true)
		draw_line(center + Vector2(-obstacle.r * 0.5, -5), center + Vector2(0, -obstacle.r * 0.55), Color("809082"), 3.0, true)
	for team in [0, 1]:
		var base = world.bases[team]
		var c = BLUE if team == 0 else RED
		draw_circle(base, 135 * scale_value, Color(c, 0.10))
		draw_arc(base, 128 * scale_value, 0, TAU, 72, Color(c, 0.25), 3.0, true)
		draw_arc(base, 101 * scale_value, 0, TAU, 72, Color(c, 0.18), 1.5, true)
	draw_rect(Rect2(0, 0, world.size, world.size), Color("9b8c64"), false, 5.0)

func _draw_observations():
	for obs in world.vision.structure_observations(0):
		_draw_structure(obs)
	# Neutrals use the same observed-state rule if available.
	if world.vision.has_method("objective_observations"):
		for obs in world.vision.objective_observations(0):
			_draw_neutral(obs)
	else:
		for e in world.entities:
			if e.kind in ["camp", "dragon", "boss"] and world.visible_to(e, 0) and e.alive:
				_draw_neutral(e)

func _draw_structure(e):
	var p = e.pos
	var remembered = bool(e.get("remembered", false))
	var alive_value = bool(e.get("alive", true))
	var c = BLUE if int(e.team) == 0 else RED
	if remembered:
		c = Color("727c8a")
	if not alive_value:
		draw_circle(p, 24, Color("253039"))
		draw_line(p + Vector2(-17, -10), p + Vector2(17, 10), Color(c, 0.42), 5, true)
		draw_line(p + Vector2(-9, 14), p + Vector2(12, -14), Color(c, 0.3), 4, true)
		return
	var r = 35.0 if e.kind == "nexus" else (23.0 if e.kind == "inhibitor" else 20.0)
	draw_circle(p + Vector2(0, 9), r + 10, Color(0.015, 0.03, 0.04, 0.65))
	draw_circle(p, r + 9, Color("1c303c"))
	draw_arc(p, r + 9, 0, TAU, 36, Color(c, 0.45), 2.0, true)
	if e.kind == "tower":
		draw_rect(Rect2(p + Vector2(-13, -10), Vector2(26, 27)), Color("51606a"))
		var points = PackedVector2Array([p + Vector2(0, -34), p + Vector2(13, -10), p + Vector2(0, 0), p + Vector2(-13, -10)])
		draw_colored_polygon(points, c)
		draw_line(p + Vector2(0, -31), p + Vector2(0, -5), c.lightened(0.5), 2.0, true)
	else:
		var points = PackedVector2Array([p + Vector2(0, -r * 1.25), p + Vector2(r * 0.7, 0), p + Vector2(0, r), p + Vector2(-r * 0.7, 0)])
		draw_colored_polygon(points, c.darkened(0.25))
		draw_colored_polygon(PackedVector2Array([points[0], points[1], points[2]]), c)
		draw_arc(p, r + 4, _clock * 0.4, _clock * 0.4 + PI * 1.4, 32, Color(c, 0.6), 2.0, true)
	if e.get("protected", false):
		draw_arc(p, r + 14, 0, TAU, 48, Color("a8b3cd80"), 1.5, true)
	_draw_bar(p + Vector2(-30, -r - 20), Vector2(60, 5), e.get("hp", 1.0), e.get("max_hp", 1.0), c)
	if remembered:
		_draw_text(p + Vector2(-23, r + 22), "마지막 관측", 10, Color("8d99a6"))

func _draw_neutral(e):
	if not e.get("alive", true):
		return
	var p = e.pos
	var big = e.kind in ["dragon", "boss"]
	var r = 27.0 if big else 16.0
	var c = Color("a68de5") if e.kind == "boss" else Color("d5ad71")
	if e.get("remembered", false):
		c = Color("6a7380")
	draw_circle(p + Vector2(0, 6), r + 5, Color("0b141d"))
	var poly = PackedVector2Array()
	for i in range(6):
		poly.append(p + Vector2.from_angle(float(i) * TAU / 6.0) * r)
	draw_colored_polygon(poly, c.darkened(0.5))
	poly.append(poly[0])
	draw_polyline(poly, c, 2.0, true)
	_draw_text(p + Vector2(-7, 6), "D" if e.kind == "dragon" else ("B" if e.kind == "boss" else "•"), 16, c)
	_draw_bar(p + Vector2(-27, -r - 10), Vector2(54, 4), e.get("hp", 1), e.get("max_hp", 1), c)

func _draw_unit(e):
	var p = e.pos
	var is_hero = e.kind == "hero"
	var r = float(e.get("r", 12))
	var c = BLUE if e.team == 0 else RED
	if e.kind == "ward":
		draw_arc(p, 12, 0, TAU, 20, c, 2.0, true)
		draw_circle(p, 4, c)
		return
	draw_circle(p + Vector2(1, 6), r + 3, Color(0, 0.01, 0.02, 0.55))
	if selected_id == e.id:
		draw_arc(p, r + 9, 0, TAU, 48, GOLD, 2.0, true)
	if e.get("is_player", false):
		draw_arc(p, r + 7, 0, TAU, 48, Color("e6cf91"), 2.0, true)
		draw_colored_polygon(PackedVector2Array([p + Vector2(-5, -r-14), p + Vector2(5, -r-14), p + Vector2(0, -r-8)]), GOLD)
	if is_hero:
		var hc = Color(world.hero_defs.get(e.hero_id, {}).get("color", "#d4dfea"))
		draw_circle(p, r + 3, c.darkened(0.55))
		draw_circle(p, r, hc.darkened(0.35))
		var texture = _portrait(e.hero_id)
		if texture:
			draw_texture_rect(texture, Rect2(p - Vector2.ONE * (r - 2), Vector2.ONE * (r - 2) * 2), false)
		draw_arc(p, r + 2, 0, TAU, 36, c, 2.0, true)
		if e.get("shield", 0) > 0:
			draw_arc(p, r + 5, 0, TAU, 40, Color("cee5fa"), 2.0, true)
		_draw_text(p + Vector2(-32, -r - 21), "%s  %d" % [e.get("name", ""), e.get("level", 1)], 11, Color("f2f4eb"))
		_draw_bar(p + Vector2(-30, -r - 16), Vector2(60, 6), e.hp, e.max_hp, c)
		_draw_bar(p + Vector2(-30, -r - 8), Vector2(60, 3), e.get("mp", 0), maxf(e.get("max_mp", 1), 1), Color("688cdb"))
		if e.get("cc_until", 0) > world.time:
			_draw_text(p + Vector2(-12, r + 20), "기절", 11, GOLD)
		elif e.get("root_until", 0) > world.time:
			_draw_text(p + Vector2(-12, r + 20), "속박", 11, Color("c49beb"))
		elif e.get("silence_until", 0) > world.time:
			_draw_text(p + Vector2(-12, r + 20), "침묵", 11, Color("c49beb"))
		if e.get("recall_until", 0) > world.time:
			draw_arc(p, r + 14, -PI * 0.5, -PI * 0.5 + TAU * clampf(1.0 - (e.recall_until - world.time) / 4.0, 0, 1), 48, BLUE, 3.0, true)
	else:
		var tri = PackedVector2Array([p + Vector2(0, -r), p + Vector2(r, r * 0.7), p + Vector2(-r, r * 0.7)])
		draw_colored_polygon(tri, c.darkened(0.2))
		draw_line(p + Vector2(0, -r), p + Vector2(0, r * 0.3), c.lightened(0.2), 2.0, true)
		_draw_bar(p + Vector2(-15, -r - 8), Vector2(30, 3), e.hp, e.max_hp, c)

func _portrait(hero_id):
	if portrait_cache.has(hero_id):
		return portrait_cache[hero_id]
	var definition = world.hero_defs.get(hero_id, {})
	var path = "res://" + definition.get("portrait", "")
	var texture = load(path) if ResourceLoader.exists(path) else null
	portrait_cache[hero_id] = texture
	return texture

func _draw_reveals():
	for hint in world.vision.attack_reveals(0):
		var p = hint.get("pos", Vector2(hint.get("x", 0), hint.get("y", 0)))
		var alpha = clampf((hint.get("expires_at", hint.get("until", world.time + 0.5)) - world.time) / 1.5, 0.0, 1.0)
		var r = hint.get("radius", 76.0)
		draw_arc(p, r * (0.85 + sin(_clock * 8) * 0.05), 0, TAU, 48, Color(1.0, 0.7, 0.38, maxf(0.2, alpha)), 2, true)
		_draw_text(p + Vector2(-34, -8), "공격 원점", 12, Color("f5c38c"))
		_draw_text(p + Vector2(-32, 10), "일시 관측", 10, Color("baa38b"))

func _draw_aim():
	var hero = world.hero()
	if hero.is_empty() or not hero.alive:
		return
	if show_ranges or not aim_slot.is_empty():
		var radius = hero.attack_range if aim_slot.is_empty() else world.abilities.describe(hero, aim_slot).get("range", 300.0)
		draw_arc(hero.pos, radius, 0, TAU, 80, Color(BLUE, 0.3), 1.5, true)
	if aim_slot.is_empty():
		return
	var desc = world.abilities.describe(hero, aim_slot)
	var target_type = desc.get("target", "direction")
	var radius = float(desc.get("range", 300))
	var end = hero.pos + (hero.pos.direction_to(_mouse_world) * minf(radius, hero.pos.distance_to(_mouse_world)))
	var c = BLUE
	if target_type == "ally":
		var ally_id = pick_target(_mouse_world, true)
		var ally = world.unit(ally_id)
		if ally.is_empty() or hero.pos.distance_to(ally.pos) > radius + ally.get("r", 18):
			c = RED
		else:
			end = ally.pos
			draw_arc(end, ally.get("r", 18) + 14, 0, TAU, 32, Color("8de6b4"), 2.5, true)
	if target_type in ["self"]:
		draw_arc(hero.pos, desc.get("radius", 100), 0, TAU, 64, Color(c, 0.75), 2.0, true)
	elif target_type in ["ground", "area"]:
		draw_arc(end, desc.get("radius", 100), 0, TAU, 64, Color(c, 0.75), 2.0, true)
	else:
		draw_line(hero.pos, end, Color(c, 0.65), 2.5, true)
		draw_arc(end, 13, 0, TAU, 32, c, 2.0, true)

func _draw_compass():
	_draw_text(Vector2(20, 26), "SUMMONER'S FRONT", 11, Color("90a8b5"))
	_draw_text(Vector2(20, 46), "추적 카메라" if follow else "자유 카메라 · Space 복귀", 11, Color("728c9a"))
	if not aim_slot.is_empty():
		draw_rect(Rect2(size.x * 0.5 - 185, 15, 370, 34), Color("0c1a24e8"))
		_draw_text(Vector2(size.x * 0.5 - 170, 37), "%s 조준  ·  좌클릭 시전  ·  우클릭 취소" % aim_slot.to_upper(), 13, BLUE)

func _draw_bar(at: Vector2, bar_size: Vector2, value, maximum, color: Color):
	draw_rect(Rect2(at - Vector2.ONE, bar_size + Vector2.ONE * 2), Color("08121c"))
	draw_rect(Rect2(at, bar_size), Color("2b3642"))
	draw_rect(Rect2(at, Vector2(bar_size.x * clampf(float(value) / maxf(1, float(maximum)), 0, 1), bar_size.y)), color)

func _draw_text(at: Vector2, text: String, font_size: int, color: Color):
	if font:
		draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func pick_target(position_value: Vector2, allies: bool = false) -> int:
	var best = -1
	var distance = 45.0
	for e in world.entities:
		if not e.alive or not world.visible_to(e, 0):
			continue
		if allies and (e.kind != "hero" or e.team != 0 or e.id == world.player_id):
			continue
		if not allies and e.team == 0:
			continue
		var d = e.pos.distance_to(position_value) - e.get("r", 10)
		if d < distance:
			distance = d
			best = e.id
	return best

func _gui_input(event):
	if world == null:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			zoom = clampf(zoom + 0.1, 0.6, 1.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			zoom = clampf(zoom - 0.1, 0.6, 1.5)
		elif event.button_index == MOUSE_BUTTON_MIDDLE:
			_pan = event.pressed
			if _pan:
				follow = false
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			if not aim_slot.is_empty():
				aim_slot = ""
			else:
				var id = pick_target(screen_to_world(event.position))
				if id >= 0:
					target_order.emit(id)
					selected_id = id
					selection_changed.emit(id)
				else:
					ground_order.emit(screen_to_world(event.position), attack_move_mode)
					_order_marker = screen_to_world(event.position)
					_order_at = _clock
				attack_move_mode = false
		elif event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			var position_value = screen_to_world(event.position)
			if not aim_slot.is_empty():
				var desc = world.abilities.describe(world.hero(), aim_slot)
				cast_order.emit(aim_slot, position_value, pick_target(position_value, desc.get("target", "") == "ally"))
				aim_slot = ""
			elif attack_move_mode:
				ground_order.emit(position_value, true)
				attack_move_mode = false
				_order_marker = position_value
				_order_at = _clock
			else:
				selected_id = pick_target(position_value)
				selection_changed.emit(selected_id)
	elif event is InputEventMouseMotion and _pan:
		camera_pos -= event.relative / zoom
	elif event is InputEventScreenTouch and event.pressed:
		var pos = screen_to_world(event.position)
		if not aim_slot.is_empty():
			cast_order.emit(aim_slot, pos, pick_target(pos, world.abilities.describe(world.hero(), aim_slot).get("target", "") == "ally"))
			aim_slot = ""
		else:
			ground_order.emit(pos, false)
	accept_event()

func _setup_effect_layer():
	_effects_viewport = SubViewport.new()
	_effects_viewport.name = "SkillEffectsViewport"
	_effects_viewport.transparent_bg = true
	_effects_viewport.world_2d = World2D.new()
	_effects_viewport.disable_3d = true
	_effects_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_effects_viewport.size = Vector2i(maxf(1, size.x), maxf(1, size.y))
	add_child(_effects_viewport)
	_effects_canvas = preload("res://scripts/effects_canvas.gd").new()
	_effects_viewport.add_child(_effects_canvas)
	_effects_rect = TextureRect.new()
	_effects_rect.name = "VisibleSkillEffects"
	_effects_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_effects_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_effects_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_effects_rect.texture = _effects_viewport.get_texture()
	_effects_material = ShaderMaterial.new()
	_effects_material.shader = preload("res://shaders/visibility_mask.gdshader")
	_effects_rect.material = _effects_material
	add_child(_effects_rect)

func _update_effect_layer():
	if _effects_viewport == null or world == null:
		return
	var new_size = Vector2i(maxf(1, size.x), maxf(1, size.y))
	if _effects_viewport.size != new_size:
		_effects_viewport.size = new_size
	_effects_canvas.world = world
	_effects_canvas.camera_pos = camera_pos
	_effects_canvas.zoom = zoom
	_effects_canvas.view_size = size
	_effects_canvas.font = font
	_effects_canvas.queue_redraw()
	_effects_material.set_shader_parameter("visibility_mask", _visibility_texture)
	_effects_material.set_shader_parameter("camera_pos", camera_pos)
	_effects_material.set_shader_parameter("view_size", size)
	_effects_material.set_shader_parameter("zoom", zoom)
	_effects_material.set_shader_parameter("world_size", float(world.size))

func detach_world():
	world = null
	if _effects_canvas != null:
		_effects_canvas.world = null
	queue_redraw()
