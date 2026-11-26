extends Control

## Common world-space battle view. All ship and projectile locations come from
## the live ShipBattle state; this view does not invent ship motion.
signal target_selected(uid: int)

const SPACE := Color("#07101b")
const AssetLoader := preload("res://sim/asset_loader.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const GRID := Color("#173143")
const AXIS := Color("#25455a")
const TEXT := Color("#c5d9e1")
const MINT := Color("#70edc6")
const AMBER := Color("#ffcb85")
const ENEMY := Color("#ff8f85")
const FIT_MARGIN := 38.0
const INSET_MARGIN := 12.0

var battle: Variant
var _camera_center := Vector2.ZERO
var _zoom := 1.0
var _camera_ready := false
var _stars: Array[Vector3] = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	var rng := RandomNumberGenerator.new()
	rng.seed = 0x5A17_2026
	for i in 260:
		_stars.append(Vector3(rng.randf(), rng.randf(), rng.randf_range(0.18, 0.72)))


func _process(delta: float) -> void:
	if size.x < 2.0 or size.y < 2.0 or battle == null or battle.player.is_empty() or battle.enemy.is_empty():
		return
	var desired_center: Vector2 = (battle.player.position + battle.enemy.position) * 0.5
	var bounds := _world_bounds()
	var available := Vector2(maxf(1.0, size.x - FIT_MARGIN * 2.0), maxf(1.0, size.y - FIT_MARGIN * 2.0))
	var desired_zoom := minf(available.x / maxf(bounds.size.x, 1.0), available.y / maxf(bounds.size.y, 1.0))
	desired_zoom = clampf(desired_zoom, 0.045, 18.0)
	if not _camera_ready:
		_camera_center = desired_center
		_zoom = desired_zoom
		_camera_ready = true
	else:
		var blend := 1.0 - exp(-5.0 * delta)
		_camera_center = _camera_center.lerp(desired_center, blend)
		_zoom = lerpf(_zoom, desired_zoom, blend)
	queue_redraw()


func _draw() -> void:
	var bg_tint := SPACE
	if battle != null and battle.mission is Dictionary and battle.mission.has("background"):
		var bg: Dictionary = CombatSystems.get_background(str(battle.mission.background))
		var pal: Array = bg.get("palette", [])
		if not pal.is_empty():
			bg_tint = SPACE.lerp(Color(str(pal[0])), 0.14)
	draw_rect(Rect2(Vector2.ZERO, size), bg_tint)
	if size.x < 2.0 or size.y < 2.0:
		return
	if battle == null or battle.player.is_empty() or battle.enemy.is_empty():
		_draw_waiting()
		return
	if not _camera_ready:
		_camera_center = (battle.player.position + battle.enemy.position) * 0.5
		var bounds := _world_bounds()
		_zoom = minf((size.x - FIT_MARGIN * 2.0) / maxf(1.0, bounds.size.x), (size.y - FIT_MARGIN * 2.0) / maxf(1.0, bounds.size.y))
		_zoom = clampf(_zoom, 0.045, 18.0)
		_camera_ready = true
	_draw_starfield(_camera_center, _zoom)
	_draw_world_grid(_camera_center, _zoom)
	var viewport_center := size * 0.5
	_draw_thruster_plumes(battle.player, _camera_center, _zoom, viewport_center)
	_draw_thruster_plumes(battle.enemy, _camera_center, _zoom, viewport_center)
	_draw_ship(battle.player, _camera_center, _zoom, viewport_center, -1, false)
	_draw_ship(battle.enemy, _camera_center, _zoom, viewport_center, int(battle.target_uid), false)
	_draw_shields(battle.player, _camera_center, _zoom, viewport_center, Color("#5ce1ff"))
	_draw_shields(battle.enemy, _camera_center, _zoom, viewport_center, Color("#ff9e7d"))
	_draw_fires(battle.player, _camera_center, _zoom, viewport_center)
	_draw_fires(battle.enemy, _camera_center, _zoom, viewport_center)
	_draw_ion_beams(_camera_center, _zoom, viewport_center)
	_draw_pd_beams(_camera_center, _zoom, viewport_center)
	_draw_projectiles(_camera_center, _zoom, viewport_center)
	_draw_effects(_camera_center, _zoom, viewport_center)
	_draw_target(battle.player, int(battle.enemy_target_uid), _camera_center, _zoom, viewport_center, ENEMY)
	_draw_target(battle.enemy, int(battle.target_uid), _camera_center, _zoom, viewport_center, AMBER)
	_draw_heading(battle.player, _camera_center, _zoom, viewport_center, MINT)
	_draw_heading(battle.enemy, _camera_center, _zoom, viewport_center, ENEMY)
	var player_bounds := _ship_screen_bounds(battle.player, _camera_center, _zoom, viewport_center)
	var enemy_bounds := _ship_screen_bounds(battle.enemy, _camera_center, _zoom, viewport_center)
	var player_name := _draw_ship_name("내 함선", player_bounds, enemy_bounds, MINT, Rect2())
	var enemy_caption := "적함"
	var enemy_color := ENEMY
	if battle.mission is Dictionary and battle.mission.has("faction"):
		var fac: Dictionary = CombatSystems.get_faction(str(battle.mission.faction))
		if not fac.is_empty():
			enemy_caption = "적함 · " + str(fac.get("name_en", ""))
			enemy_color = Color(str(fac.get("color", "#ff8f85"))).lightened(0.22)
	_draw_ship_name(enemy_caption, enemy_bounds, player_bounds, enemy_color, player_name)
	var grid_step := _grid_pitch(_zoom)
	draw_line(Vector2(14, size.y - 15), Vector2(14 + grid_step * _zoom, size.y - 15), AXIS, 2.0, true)
	draw_string(ThemeDB.fallback_font, Vector2(22 + grid_step * _zoom, size.y - 11), "그리드 %dm" % roundi(grid_step), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, TEXT)
	_draw_tactical_inset()


func part_screen_position(ship: Dictionary, uid: int) -> Vector2:
	if battle == null or not ship.get("parts", {}).has(uid):
		return Vector2(-1, -1)
	return _world_to_screen(_part_world(ship, uid), _camera_center, _zoom, size * 0.5)


func _draw_waiting() -> void:
	var font := ThemeDB.fallback_font
	draw_string(font, size * 0.5 + Vector2(-86, 4), "전술 화면 · 출격 대기", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, TEXT)


func _world_bounds() -> Rect2:
	var points: Array[Vector2] = []
	for ship in [battle.player, battle.enemy]:
		for part in ship.parts.values():
			var cell: Vector2i = part.cell
			var extent: Vector2i = part.size
			for corner in [Vector2(cell), Vector2(cell + Vector2i(extent.x, 0)), Vector2(cell + extent), Vector2(cell + Vector2i(0, extent.y))]:
				points.append(_grid_world(ship, corner))
	if points.is_empty():
		return Rect2(battle.player.position, Vector2(120, 60))
	var low := points[0]
	var high := points[0]
	for point in points:
		low = low.min(point)
		high = high.max(point)
	return Rect2(low - Vector2(7, 7), high - low + Vector2(14, 14))


func _draw_starfield(center: Vector2, zoom: float) -> void:
	for star in _stars:
		var parallax := center * zoom * star.z
		var screen := Vector2(fposmod(star.x * size.x - parallax.x, size.x), fposmod(star.y * size.y - parallax.y, size.y))
		var color := Color("#a7c7dd", lerpf(0.12, 0.34, star.z))
		draw_circle(screen, lerpf(0.55, 1.15, star.z), color)


func _draw_world_grid(center: Vector2, zoom: float) -> void:
	var left := center.x - size.x / (2.0 * zoom)
	var right := center.x + size.x / (2.0 * zoom)
	var top := center.y - size.y / (2.0 * zoom)
	var bottom := center.y + size.y / (2.0 * zoom)
	var step := _grid_pitch(zoom)
	var first_x := floori(left / step)
	var last_x := ceili(right / step)
	var first_y := floori(top / step)
	var last_y := ceili(bottom / step)
	for index in range(first_x, last_x + 1):
		var world_x := float(index) * step
		var color := AXIS if index == 0 else GRID
		draw_line(_world_to_screen(Vector2(world_x, top), center, zoom, size * 0.5), _world_to_screen(Vector2(world_x, bottom), center, zoom, size * 0.5), color, 1.0)
	for index in range(first_y, last_y + 1):
		var world_y := float(index) * step
		var color := AXIS if index == 0 else GRID
		draw_line(_world_to_screen(Vector2(left, world_y), center, zoom, size * 0.5), _world_to_screen(Vector2(right, world_y), center, zoom, size * 0.5), color, 1.0)


func _draw_ship(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2, target_uid: int, inset: bool) -> void:
	for part in ship.parts.values():
		var quad := _part_quad(ship, part, camera, zoom, viewport_center)
		var id := str(part.id)
		var color := _part_color(id)
		var dead: bool = float(part.hp) <= 0.0
		if dead:
			color = Color("#322f3b")
		if not _valid_quad(quad):
			var dot := _center_of(quad)
			if dot.is_finite() and dot.x >= -3.0 and dot.y >= -3.0 and dot.x <= size.x + 3.0 and dot.y <= size.y + 3.0:
				draw_circle(dot, 1.3, color)
			continue
		var orig_tex: Texture2D = AssetLoader.get_part_texture(id, "roof")
		var border := PackedVector2Array(quad)
		border.append(quad[0])
		if orig_tex != null:
			var rot_q: int = posmod(int(part.get("rotation", 0)), 4)
			var base_uv := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]
			var uvs := PackedVector2Array()
			for k in 4:
				uvs.append(base_uv[posmod(k - rot_q, 4)])
			var tint := Color(0.45, 0.38, 0.45, 0.85) if dead else Color.WHITE
			draw_polygon(quad, PackedColorArray([tint, tint, tint, tint]), uvs, orig_tex)
			draw_polyline(border, Color(color, 0.45), 1.0, true)
		else:
			draw_colored_polygon(quad, color.darkened(0.56))
			draw_polyline(border, color.darkened(0.08), 1.4, true)
			_draw_part_icon(ship, part, quad, color, zoom)
		_draw_hp_bar(quad, float(part.hp), float(part.max_hp))
		if not dead and part.get("thermal_trip",false):
			draw_polyline(border,ENEMY,2.0,true)
		if int(part.uid) == target_uid:
			_draw_reticle(_center_of(quad), minf(_part_screen_size(part, zoom).x, _part_screen_size(part, zoom).y) * 0.72 + 8.0, AMBER)
		if dead:
			_draw_destroyed(quad)


func _draw_part_icon(ship: Dictionary, part: Dictionary, quad: PackedVector2Array, color: Color, zoom: float) -> void:
	var center := _center_of(quad)
	var dimensions := _part_screen_size(part, zoom)
	var min_dim := maxf(2.0, minf(dimensions.x, dimensions.y))
	var id := str(part.id)
	if id.contains("reactor"):
		var radius := min_dim * 0.28
		draw_arc(center, radius, 0, TAU, 24, color.lightened(0.25), maxf(1.0, min_dim * 0.06), true)
		draw_circle(center, radius * 0.42, Color("#d6fff2"))
		for angle in [0.0, PI * 0.5, PI, PI * 1.5]:
			draw_line(center + Vector2.RIGHT.rotated(angle) * radius * 1.25, center + Vector2.RIGHT.rotated(angle) * radius * 1.55, MINT, maxf(1.0, min_dim * 0.045))
	elif id.contains("laser") or id.contains("cannon") or id.contains("weapon"):
		var local_angle := float(part.get("turret_angle_local", float(part.rotation) * PI * 0.5))
		var direction := Vector2.RIGHT.rotated(float(ship.heading) + local_angle)
		var barrel := min_dim * 0.46
		draw_line(center - direction * barrel * 0.17, center + direction * barrel, color.lightened(0.26), maxf(2.0, min_dim * 0.13), true)
		draw_circle(center - direction * barrel * 0.15, maxf(1.5, min_dim * 0.1), TEXT)
	elif id.contains("control_room") or id.contains("bridge"):
		var w := min_dim * 0.55
		var window := Rect2(center - Vector2(w, w * 0.43), Vector2(w * 2, w * 0.86))
		draw_rect(window, Color("#9fdbff"), false, maxf(1.0, min_dim * 0.04))
		draw_line(window.position + Vector2(2, window.size.y * 0.68), window.end - Vector2(2, window.size.y * 0.68), TEXT, 1.0)
	elif id.contains("crew_quarters") or id.contains("bunk"):
		var bed_w := minf(dimensions.x * 0.35, min_dim * 0.28)
		var bed_h := minf(dimensions.y * 0.35, min_dim * 0.24)
		for sign in [-1.0, 1.0]:
			var bed := Rect2(center + Vector2(-bed_w * 0.55, sign * -bed_h * 0.58), Vector2(bed_w, bed_h))
			draw_rect(bed, color.lightened(0.1), true)
			draw_rect(Rect2(bed.position + Vector2(2, 2), Vector2(maxf(2.0, bed_w * 0.22), maxf(2.0, bed_h - 4))), TEXT)
	elif id.contains("armor"):
		var diagonal := min_dim * 0.2
		draw_line(center + Vector2(-diagonal, diagonal), center + Vector2(diagonal, -diagonal), color.lightened(0.2), maxf(1.0, min_dim * 0.045))
		if dimensions.x > min_dim * 1.2:
			draw_line(center + Vector2(0, -dimensions.y * 0.28), center + Vector2(0, dimensions.y * 0.28), Color(color, 0.55), 1.0)
	elif id.contains("corridor"):
		draw_circle(center, maxf(1.5, min_dim * 0.08), Color("#d5e8ea"))
		draw_line(center - Vector2(min_dim * 0.22, 0), center + Vector2(min_dim * 0.22, 0), Color(color.lightened(0.28), 0.8), maxf(1.0, min_dim * 0.035))
	elif id.contains("thruster") or id.contains("nozzle"):
		draw_line(center - Vector2.RIGHT * min_dim * 0.16, center + Vector2.RIGHT * min_dim * 0.16, color, maxf(1.0, min_dim * 0.08))


func _draw_hp_bar(quad: PackedVector2Array, hp: float, max_hp: float) -> void:
	var center := _center_of(quad)
	var dimensions := _quad_size(quad)
	if dimensions.x < 9 or dimensions.y < 8 or hp >= max_hp:
		return
	var width := minf(dimensions.x * 0.72, 24.0)
	var y := center.y + dimensions.y * 0.32
	var bar := Rect2(Vector2(center.x - width * 0.5, y), Vector2(width, maxf(1.5, minf(3.0, dimensions.y * 0.07))))
	draw_rect(bar, Color("#0b131b"))
	var ratio := clampf(hp / maxf(max_hp, 1.0), 0.0, 1.0)
	var tint := MINT if ratio > 0.55 else (AMBER if ratio > 0.25 else ENEMY)
	draw_rect(Rect2(bar.position, Vector2(width * ratio, bar.size.y)), tint)


func _draw_destroyed(quad: PackedVector2Array) -> void:
	var center := _center_of(quad)
	var span := minf(_quad_size(quad).x, _quad_size(quad).y) * 0.3
	draw_line(center - Vector2(span, span), center + Vector2(span, span), ENEMY, 1.5, true)
	draw_line(center + Vector2(span, -span), center + Vector2(-span, span), ENEMY, 1.5, true)


func _draw_thruster_plumes(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	for part in ship.parts.values():
		if float(part.get("hp", 0.0)) <= 0.0:
			continue
		var nozzles: Array = part.get("nozzles", [])
		if nozzles.is_empty() and float(part.get("activation", 0.0)) > 0.0:
			nozzles = [{"location_local": Vector2(part.cell) + Vector2(part.size) * 0.5,
				"direction_local": part.get("force_local", Vector2.LEFT), "activation": part.activation}]
		for nozzle in nozzles:
			var activation := clampf(float(nozzle.get("activation", part.get("activation", 0.0))), 0.0, 1.0)
			if activation <= 0.01:
				continue
			var origin_world := _grid_world(ship, nozzle.get("location_local", Vector2(part.cell) + Vector2(part.size) * 0.5))
			var direction_local: Vector2 = nozzle.get("direction_local", part.get("force_local", Vector2.LEFT))
			var exhaust_dir := -direction_local.rotated(float(ship.heading))
			var tail_world := origin_world + exhaust_dir * (1.5 + activation * 3.0)
			var p0 := _world_to_screen(origin_world, camera, zoom, viewport_center)
			var p1 := _world_to_screen(tail_world, camera, zoom, viewport_center)
			var bright := Color("#ecffff")
			var hot := Color("#75d7ff") if ship == battle.player else Color("#ffb185")
			if part.get("boost_active",false):
				hot = Color("#ff8e59")
			elif part.id.ends_with("rocket_nozzle"):
				hot = Color("#c0a2ff")
			draw_line(p0, p1, Color(hot, 0.35 * activation), maxf(3.0, zoom * 0.68 * activation), true)
			draw_line(p0, p0.lerp(p1, 0.72), hot.lightened(0.12), maxf(1.5, zoom * 0.24 * activation), true)
			draw_line(p0, p0.lerp(p1, 0.28), bright, maxf(1.0, zoom * 0.11 * activation), true)


func _draw_shields(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2, tint: Color) -> void:
	for sid in ["cosmoteer.shield_gen_small", "cosmoteer.shield_gen_large"]:
		for uid in ship.get("ids", {}).get(sid, []):
			var part: Dictionary = ship.parts[uid]
			if float(part.get("hp", 0.0)) <= 0.0 or not part.get("shield_active", false):
				continue
			var max_hp := maxf(1.0, float(part.get("shield_max_hp", 6000.0)))
			var ratio := clampf(float(part.get("shield_hp", 0.0)) / max_hp, 0.0, 1.0)
			var local_mount: Vector2 = part.get("mount_local", Vector2(part.cell) + Vector2(part.size) * 0.5)
			var center := _world_to_screen(_grid_world(ship, local_mount), camera, zoom, viewport_center)
			var radius := maxf(6.0, float(part.get("shield_radius", 7.5)) * zoom)
			var facing := float(ship.heading) + float(part.get("rest_angle", 0.0))
			var half_arc := float(part.get("shield_arc_rad", deg_to_rad(110.0))) * 0.5
			var flash := clampf(float(part.get("shield_flash", 0.0)), 0.0, 1.0)
			var glow := tint.lerp(Color.WHITE, flash * 0.7)
			draw_arc(center, radius, facing - half_arc, facing + half_arc, 32, Color(glow, 0.18 + 0.28 * ratio + 0.25 * flash), maxf(4.0, zoom * 0.85), true)
			draw_arc(center, radius, facing - half_arc, facing + half_arc, 32, Color(glow, 0.55 + 0.4 * ratio), maxf(1.8, zoom * 0.26), true)


func _draw_ion_beams(camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	for beam in battle.get("ion_beams"):
		var a := _world_to_screen(beam.from, camera, zoom, viewport_center)
		var b := _world_to_screen(beam.to, camera, zoom, viewport_center)
		var strength := clampf(float(beam.get("strength", 1.0)), 0.8, 3.0)
		var bkind := str(beam.get("beam_kind", "ion"))
		var outer := Color("#ff47a3") if beam.side == "player" else Color("#ff5b5b")
		if bkind == "resonance":
			outer = Color("#ff5514")
		elif bkind == "mining":
			outer = Color("#ffe36e")
		elif bkind == "tractor":
			outer = Color("#59e8ff")
		draw_line(a, b, Color(outer, 0.35), maxf(5.5, zoom * 1.05 * strength), true)
		draw_line(a, b, Color(outer.lightened(0.25), 0.88), maxf(2.4, zoom * 0.40 * strength), true)
		draw_line(a, b, Color.WHITE, maxf(1.2, zoom * 0.16 * strength), true)
		if beam.hit_kind != "miss":
			draw_circle(b, maxf(3.5, zoom * 0.42 * strength), outer.lightened(0.45))


func _draw_fires(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	for part in ship.parts.values():
		var f := float(part.get("fire", 0.0))
		if f <= 0.05 or float(part.get("hp", 0.0)) <= 0.0:
			continue
		var center := _world_to_screen(_part_world(ship, int(part.uid)), camera, zoom, viewport_center)
		var r := maxf(3.0, minf(part.size.x, part.size.y) * zoom * (0.28 + 0.18 * f))
		draw_circle(center, r, Color("#ff6a2b", 0.55 * f))
		draw_circle(center, r * 0.5, Color("#ffe066", 0.85 * f))


func _draw_pd_beams(camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	for beam in battle.get("pd_beams"):
		var a := _world_to_screen(beam.from, camera, zoom, viewport_center)
		var b := _world_to_screen(beam.to, camera, zoom, viewport_center)
		var tint := Color("#8cf7ff") if beam.side == "player" else Color("#ffb38f")
		draw_line(a, b, Color(tint, 0.85), maxf(1.5, zoom * 0.16), true)
		draw_circle(b, maxf(2.5, zoom * 0.22), Color.WHITE)


func _draw_projectiles(camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	for bolt in battle.projectiles:
		var a := _world_to_screen(bolt.get("previous_pos", bolt.pos), camera, zoom, viewport_center)
		var b := _world_to_screen(bolt.pos, camera, zoom, viewport_center)
		var kind := str(bolt.get("kind", "laser"))
		var tint := MINT if bolt.side == "player" else ENEMY
		var direction := b - a
		if direction.length_squared() < 0.01:
			direction = bolt.velocity.normalized() * maxf(6.0, zoom * 1.5)
		var tip := b if a.distance_to(b) > 1.5 else b + direction
		if kind == "missile" or kind == "missile_emp" or kind == "missile_nuke":
			var back: Vector2 = tip - Vector2(bolt.velocity).normalized() * maxf(7.0, zoom * 1.4)
			var plume := Color("#a864ff", 0.65) if kind == "missile_emp" else (Color("#ff2d2d", 0.78) if kind == "missile_nuke" else Color("#ff8a4c", 0.55))
			draw_line(back, tip, plume, maxf(3.5, zoom * (0.75 if kind == "missile_nuke" else 0.55)), true)
			draw_line(back.lerp(tip, 0.35), tip, plume.lightened(0.35), maxf(2.0, zoom * 0.25), true)
			draw_circle(tip, maxf(2.4, zoom * (0.32 if kind == "missile_nuke" else 0.24)), Color("#fff5e6"))
		elif kind == "cannon_deck" or kind == "cannon_large":
			var sc := 1.45 if kind == "cannon_deck" else 1.15
			draw_line(a, tip, Color("#ff6414", 0.72), maxf(4.2, zoom * 0.68 * sc), true)
			draw_circle(tip, maxf(3.2, zoom * 0.34 * sc), Color("#ffcb78"))
		elif kind == "cannon":
			draw_line(a, tip, Color(AMBER, 0.6), maxf(3.5, zoom * 0.5), true)
			draw_circle(tip, maxf(2.8, zoom * 0.28), AMBER)
		elif kind == "railgun":
			var back_r: Vector2 = tip - Vector2(bolt.velocity).normalized() * maxf(14.0, zoom * 2.8)
			draw_line(back_r, tip, Color("#4dc8ff", 0.55), maxf(5.0, zoom * 0.85), true)
			draw_line(back_r.lerp(tip, 0.2), tip, Color("#d4f7ff"), maxf(2.4, zoom * 0.32), true)
			draw_circle(tip, maxf(2.8, zoom * 0.3), Color.WHITE)
		elif kind == "disruptor":
			draw_line(a, tip, Color("#c382ff", 0.65), maxf(3.8, zoom * 0.65), true)
			draw_circle(tip, maxf(2.6, zoom * 0.26), Color("#f2d9ff"))
		elif kind == "flak":
			draw_circle(tip, maxf(3.2, zoom * 0.34), Color("#ffe38a", 0.85))
			draw_arc(tip, maxf(5.0, zoom * 0.55), 0.0, TAU, 12, Color("#ffb35c", 0.65), 1.4, true)
		elif kind == "chaingun":
			draw_line(a, tip, Color("#ffb85c", 0.85), maxf(1.8, zoom * 0.24), true)
			draw_circle(tip, maxf(1.8, zoom * 0.18), Color("#fff2cc"))
		elif kind == "heavy_laser":
			var heavy := Color("#66f2ff") if bolt.side == "player" else Color("#ff6e6e")
			draw_line(a, tip, Color(heavy, 0.55), maxf(4.8, zoom * 0.82), true)
			draw_line(a, tip, heavy.lightened(0.25), maxf(2.2, zoom * 0.3), true)
			draw_circle(tip, maxf(2.4, zoom * 0.24), Color.WHITE)
		else:
			draw_line(a, tip, Color(tint, 0.52), maxf(3.0, zoom * 0.55), true)
			draw_line(a, tip, tint, maxf(1.5, zoom * 0.17), true)
			draw_circle(tip, maxf(2.0, zoom * 0.18), TEXT)


func _draw_target(ship: Dictionary, uid: int, camera: Vector2, zoom: float, viewport_center: Vector2, color: Color) -> void:
	if uid < 0 or not ship.parts.has(uid):
		return
	var center := _world_to_screen(_part_world(ship, uid), camera, zoom, viewport_center)
	var part: Dictionary = ship.parts[uid]
	var radius := maxf(9.0, maxf(part.size.x, part.size.y) * zoom * 0.62)
	_draw_reticle(center, radius, color)


func _draw_reticle(center: Vector2, radius: float, color: Color) -> void:
	draw_arc(center, radius, 0.08, TAU * 0.42, 36, Color(color, 0.84), 1.5, true)
	draw_arc(center, radius, TAU * 0.58, TAU * 0.92, 36, Color(color, 0.84), 1.5, true)
	var gap := radius * 0.7
	draw_line(center - Vector2(gap, 0), center - Vector2(radius + 4, 0), color, 1.4)
	draw_line(center + Vector2(gap, 0), center + Vector2(radius + 4, 0), color, 1.4)
	draw_line(center - Vector2(0, gap), center - Vector2(0, radius + 4), color, 1.4)
	draw_line(center + Vector2(0, gap), center + Vector2(0, radius + 4), color, 1.4)


func _draw_heading(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2, color: Color) -> void:
	var origin := _world_to_screen(ship.position, camera, zoom, viewport_center)
	var direction := Vector2.RIGHT.rotated(float(ship.heading))
	var tip := _world_to_screen(ship.position + direction * 10.0, camera, zoom, viewport_center)
	draw_line(origin, tip, color, 2.0, true)
	draw_circle(tip, 2.5, color)


func _ship_screen_bounds(ship: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2) -> Rect2:
	var bounds := _ship_world_bounds(ship)
	var a := _world_to_screen(bounds.position, camera, zoom, viewport_center)
	var b := _world_to_screen(bounds.end, camera, zoom, viewport_center)
	return Rect2(a.min(b), (b - a).abs())


func _draw_ship_name(caption: String, hull: Rect2, other_hull: Rect2, color: Color, other_label: Rect2) -> Rect2:
	var font := ThemeDB.fallback_font
	var width := maxf(48.0, font.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 10.0)
	var height := 17.0
	var candidates := [
		Rect2(Vector2(hull.get_center().x - width * 0.5, hull.position.y - height - 5.0), Vector2(width, height)),
		Rect2(Vector2(hull.get_center().x - width * 0.5, hull.end.y + 5.0), Vector2(width, height)),
		Rect2(Vector2(hull.position.x - width - 5.0, hull.get_center().y - height * 0.5), Vector2(width, height)),
		Rect2(Vector2(hull.end.x + 5.0, hull.get_center().y - height * 0.5), Vector2(width, height)),
	]
	var chosen: Rect2 = candidates[0]
	for candidate in candidates:
		var inside: bool = candidate.position.x >= 2.0 and candidate.end.x <= size.x - 2.0 and candidate.position.y >= 2.0 and candidate.end.y <= size.y - 2.0
		var clear_other_label: bool = other_label.size == Vector2.ZERO or not candidate.intersects(other_label)
		if inside and not candidate.intersects(hull) and not candidate.intersects(other_hull) and clear_other_label:
			chosen = candidate
			break
	draw_rect(chosen.grow(2.0), Color("#07131d", 0.84), true)
	draw_string(font, chosen.position + Vector2(4, height - 4), caption, HORIZONTAL_ALIGNMENT_LEFT, width - 4, 12, color)
	return chosen


func _draw_tactical_inset() -> void:
	var data := _tactical_inset_data()
	if data.is_empty():
		return
	var rect: Rect2 = data.rect
	draw_rect(rect, Color("#091722", 0.97), true)
	draw_rect(rect, Color("#527080"), false, 1.0)
	var ship: Dictionary = data.ship
	var uid := int(data.uid)
	var zoom := float(data.zoom)
	var view_center: Vector2 = data.viewport_center
	var camera: Vector2 = data.camera
	_draw_ship(ship, camera, zoom, view_center, uid, true)
	_draw_shields(ship, camera, zoom, view_center, Color("#5ce1ff") if ship == battle.player else Color("#ff9e7d"))
	draw_string(ThemeDB.fallback_font, rect.position + Vector2(9, 16), "전술 확대 · 실시간 표적", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, TEXT)


func _tactical_inset_data() -> Dictionary:
	var inset_size := Vector2(minf(224.0, size.x * 0.36), minf(164.0, size.y * 0.42))
	if inset_size.x < 130 or inset_size.y < 100:
		return {}
	var rect := Rect2(size - inset_size - Vector2(14, 14), inset_size)
	var ship: Dictionary = battle.enemy
	var uid := int(battle.target_uid)
	if uid < 0 or not ship.parts.has(uid):
		ship = battle.player
		uid = int(battle.enemy_target_uid)
	var bounds := _ship_world_bounds(ship)
	var inner := rect.size - Vector2(INSET_MARGIN * 2, 34)
	var zoom := clampf(minf(inner.x / maxf(bounds.size.x, 1.0), inner.y / maxf(bounds.size.y, 1.0)), 1.5, 30.0)
	return {"rect":rect, "ship":ship, "uid":uid, "zoom":zoom, "camera":Vector2(ship.position),
		"viewport_center":rect.position + Vector2(rect.size.x * 0.5, rect.size.y * 0.56)}


func _ship_world_bounds(ship: Dictionary) -> Rect2:
	var corners: Array[Vector2] = []
	for part in ship.parts.values():
		var cell: Vector2i = part.cell
		var extent: Vector2i = part.size
		for corner in [Vector2(cell), Vector2(cell + Vector2i(extent.x, 0)), Vector2(cell + extent), Vector2(cell + Vector2i(0, extent.y))]:
			corners.append(_grid_world(ship, corner))
	if corners.is_empty():
		return Rect2(ship.position, Vector2(10, 10))
	var low := corners[0]
	var high := corners[0]
	for point in corners:
		low = low.min(point)
		high = high.max(point)
	return Rect2(low - Vector2(1.5, 1.5), high - low + Vector2(3, 3))


func _part_quad(ship: Dictionary, part: Dictionary, camera: Vector2, zoom: float, viewport_center: Vector2) -> PackedVector2Array:
	var cell: Vector2i = part.cell
	var dimensions: Vector2i = part.size
	var corners := [Vector2(cell), Vector2(cell + Vector2i(dimensions.x, 0)), Vector2(cell + dimensions), Vector2(cell + Vector2i(0, dimensions.y))]
	var points := PackedVector2Array()
	for corner in corners:
		points.append(_world_to_screen(_grid_world(ship, corner), camera, zoom, viewport_center))
	return points


func _valid_quad(quad: PackedVector2Array) -> bool:
	if quad.size() != 4:
		return false
	var twice_area := 0.0
	for index in quad.size():
		var a: Vector2 = quad[index]
		var b: Vector2 = quad[(index + 1) % quad.size()]
		if not a.is_finite() or not b.is_finite():
			return false
		twice_area += a.cross(b)
	return absf(twice_area) > 0.01


func _grid_world(ship: Dictionary, grid_point: Vector2) -> Vector2:
	if battle.has_method("grid_world"):
		return battle.grid_world(ship, grid_point)
	return ship.position + (grid_point - Vector2(ship.center_of_mass)).rotated(float(ship.heading))


func _part_world(ship: Dictionary, uid: int) -> Vector2:
	if battle.has_method("part_world"):
		return battle.part_world(ship, uid)
	var part: Dictionary = ship.parts[uid]
	return _grid_world(ship, Vector2(part.cell) + Vector2(part.size) * 0.5)


func _world_to_screen(world: Vector2, camera: Vector2, zoom: float, viewport_center: Vector2) -> Vector2:
	return viewport_center + (world - camera) * zoom


func _grid_pitch(zoom: float) -> float:
	return maxf(20.0, ceilf(80.0 / maxf(zoom, 0.001) / 20.0) * 20.0)


func _part_screen_size(part: Dictionary, zoom: float) -> Vector2:
	return Vector2(part.size) * zoom


func _center_of(quad: PackedVector2Array) -> Vector2:
	var center := Vector2.ZERO
	for point in quad:
		center += point
	return center / maxf(float(quad.size()), 1.0)


func _quad_size(quad: PackedVector2Array) -> Vector2:
	var low := quad[0]
	var high := quad[0]
	for point in quad:
		low = low.min(point)
		high = high.max(point)
	return high - low


func _draw_effects(camera: Vector2, zoom: float, viewport_center: Vector2) -> void:
	var now := float(battle.elapsed)
	for ev in battle.events:
		if not ev.has("pos"):
			continue
		var age := now - float(ev.get("time", 0.0))
		if age < 0.0 or age > 0.45:
			continue
		var t := clampf(age / 0.45, 0.0, 1.0)
		var alpha := 1.0 - t
		var pos := _world_to_screen(Vector2(ev.pos), camera, zoom, viewport_center)
		var kind := str(ev.get("kind", ""))
		if kind == "destroyed":
			var r := maxf(8.0, (2.5 + 8.5 * t) * zoom)
			draw_circle(pos, r * 0.45, Color("#ffae52", alpha * 0.55))
			draw_arc(pos, r, 0.0, TAU, 24, Color("#ff7354", alpha * 0.9), maxf(2.0, zoom * 0.35), true)
		elif kind == "shield_down":
			var r := maxf(10.0, (4.0 + 10.0 * t) * zoom)
			draw_arc(pos, r, 0.0, TAU, 28, Color("#7ef2ff", alpha * 0.95), maxf(2.4, zoom * 0.4), true)
		elif kind == "shield_hit":
			var r := maxf(5.0, (1.5 + 4.5 * t) * zoom)
			draw_arc(pos, r, 0.0, TAU, 18, Color("#9af7ff", alpha * 0.9), maxf(1.6, zoom * 0.24), true)
		elif kind == "intercept":
			var r := maxf(4.0, (1.2 + 3.8 * t) * zoom)
			draw_circle(pos, r * 0.4, Color(Color.WHITE, alpha * 0.85))
			draw_arc(pos, r, 0.0, TAU, 14, Color("#8cf7ff", alpha * 0.8), 1.4, true)
		elif kind == "blast":
			var br := maxf(8.0, float(ev.get("radius", 3.5)) * zoom * (0.4 + 0.75 * t))
			var bk := str(ev.get("blast_kind", "he"))
			var fill_c := Color("#a864ff", alpha * 0.36) if bk == "emp" else (Color("#ff3322", alpha * 0.48) if bk == "nuke" else Color("#ff7c2b", alpha * 0.38))
			var ring_c := Color("#d8b4ff", alpha * 0.92) if bk == "emp" else (Color("#ffec80", alpha * 0.95) if bk == "nuke" else Color("#ffd166", alpha * 0.9))
			draw_circle(pos, br * 0.55, fill_c)
			draw_arc(pos, br, 0.0, TAU, 24, ring_c, maxf(2.0, zoom * 0.32), true)
		elif kind == "hit":
			var r := maxf(3.5, (1.0 + 3.0 * t) * zoom)
			draw_arc(pos, r, 0.0, TAU, 14, Color("#ffd180", alpha * 0.8), 1.5, true)


func _part_color(id: String) -> Color:
	if id == "cosmoteer.shield_gen_small" or id == "cosmoteer.shield_gen_large":
		return Color("#5ce1ff")
	if id == "cosmoteer.ion_beam_emitter" or id == "cosmoteer.ion_beam_prism":
		return Color("#ff5ea8")
	if id == "cosmoteer.flak_cannon_large":
		return Color("#e8c86e")
	if id.contains("chaingun"):
		return Color("#f09a4b")
	if id.contains("railgun"):
		return Color("#4dc8ff")
	if id == "cosmoteer.disruptor":
		return Color("#c382ff")
	if id == "cosmoteer.fire_extinguisher":
		return Color("#ff6b57")
	if id == "cosmoteer.missile_launcher":
		return Color("#ff8a5c")
	if id == "cosmoteer.point_defense":
		return Color("#6ef2d6")
	if id == "cosmoteer.laser_blaster_large":
		return Color("#78e4ff")
	if id == "cosmoteer.cannon_med":
		return Color("#f0ad58")
	if id.contains("reactor"):
		return Color("#5de0bd")
	if id.contains("crew_quarters") or id.contains("bunk"):
		return Color("#66aee7")
	if id.contains("laser") or id.contains("cannon") or id.contains("weapon"):
		return Color("#ffc06e")
	if id.contains("control_room") or id.contains("bridge"):
		return Color("#a898ff")
	if id.contains("armor") or id.contains("structure"):
		return Color("#9daeb9")
	if id == "cosmoteer.lab_engine_room":
		return Color("#dfc16f")
	if id.ends_with("thruster_boost"):
		return Color("#ff986e")
	if id.contains("thruster_rocket"):
		return Color("#ad9cf4") if not id.ends_with("battery") else Color("#82c7a0")
	if id.contains("thruster"):
		return Color("#76d8ff")
	return Color("#55798b")


func _gui_input(event: InputEvent) -> void:
	if not event is InputEventMouseButton or event.button_index != MOUSE_BUTTON_LEFT or not event.pressed or battle == null:
		return
	var inset := _tactical_inset_data()
	if not inset.is_empty() and inset.rect.has_point(event.position):
		var inset_world: Vector2 = inset.camera + (event.position - inset.viewport_center) / float(inset.zoom)
		if inset.ship == battle.enemy:
			for target_part in battle.enemy.parts.values():
				if _contains_world_point(battle.enemy, target_part, inset_world):
					target_selected.emit(int(target_part.uid))
					break
		accept_event()
		return
	var world: Vector2 = _camera_center + (event.position - size * 0.5) / maxf(_zoom, 0.001)
	for part in battle.enemy.parts.values():
		if _contains_world_point(battle.enemy, part, world):
			target_selected.emit(int(part.uid))
			accept_event()
			return


func _contains_world_point(ship: Dictionary, part: Dictionary, world_point: Vector2) -> bool:
	var local: Vector2 = (world_point - ship.position).rotated(-float(ship.heading)) + Vector2(ship.center_of_mass)
	var cell: Vector2i = part.cell
	var dims: Vector2i = part.size
	return local.x >= cell.x and local.x <= cell.x + dims.x and local.y >= cell.y and local.y <= cell.y + dims.y
