class_name FTLMapCanvas
extends Control

## Interactive FTL Sector Star Map canvas: beacons, jump links, Rebel Fleet wave, nebula, and hover lines.

var sector_map: FTLSectorMap
var hover_beacon_id: int = -1
var can_jump_now: bool = true

signal beacon_clicked(beacon_id: int)


func _ready() -> void:
	custom_minimum_size = FTLSectorMap.MAP_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP


func _gui_input(event: InputEvent) -> void:
	if sector_map == null:
		return
	if event is InputEventMouseMotion:
		hover_beacon_id = _find_beacon_at(event.position)
		queue_redraw()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var bid := _find_beacon_at(event.position)
		if bid >= 0:
			beacon_clicked.emit(bid)


func _find_beacon_at(pt: Vector2) -> int:
	if sector_map == null:
		return -1
	for b in sector_map.beacons:
		if (b.pos as Vector2).distance_to(pt) <= 18.0:
			return int(b.id)
	return -1


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.04, 0.06, 0.1, 0.96), true)
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.38, 0.56, 0.72, 0.85), false, 2.0)
	if sector_map == null:
		return

	# Subtle background stars
	for i in range(60):
		var sx := fmod(float(i * 151 + 29), size.x)
		var sy := fmod(float(i * 239 + 17), size.y)
		draw_circle(Vector2(sx, sy), 1.0, Color(0.75, 0.85, 1.0, 0.35))

	# Nebula patches
	for b in sector_map.beacons:
		if bool(b.nebula):
			draw_circle(b.pos, 46.0, Color(0.45, 0.2, 0.62, 0.25))

	# Rebel Fleet pursuit zone (red curved frontier)
	if sector_map.current_sector_index < 7 and sector_map.rebel_fleet_x > -40.0:
		var pts := PackedVector2Array([Vector2(0, 0)])
		for y_i in range(0, 21):
			var y := float(y_i) / 20.0 * size.y
			var dy := (y - size.y * 0.5) / (size.y * 0.5)
			var curve_x := clampf(sector_map.rebel_fleet_x - dy * dy * 48.0, 0.0, size.x)
			pts.append(Vector2(curve_x, y))
		pts.append(Vector2(0, size.y))
		draw_colored_polygon(pts, Color(0.82, 0.15, 0.15, 0.28))
		if pts.size() >= 3:
			draw_polyline(pts.slice(1, pts.size() - 1), Color(1.0, 0.35, 0.25, 0.85), 2.5)

	# Jump links for current beacon and hovered beacon
	var cur_b: Dictionary = sector_map.beacons[sector_map.current_beacon_id]
	for nb in cur_b.links:
		var nb_b: Dictionary = sector_map.beacons[int(nb)]
		draw_line(cur_b.pos, nb_b.pos, Color(0.42, 0.92, 0.55, 0.72), 2.0)

	if hover_beacon_id >= 0 and hover_beacon_id != sector_map.current_beacon_id:
		var hb: Dictionary = sector_map.beacons[hover_beacon_id]
		for nb in hb.links:
			var nb_b: Dictionary = sector_map.beacons[int(nb)]
			draw_line(hb.pos, nb_b.pos, Color(0.82, 0.9, 1.0, 0.35), 1.3)

	var font := ThemeDB.fallback_font
	for b in sector_map.beacons:
		var bid := int(b.id)
		var pos: Vector2 = b.pos
		var btype := str(b.type)
		var is_cur := (bid == sector_map.current_beacon_id)
		var reachable := sector_map.can_jump_to(bid)

		var col := Color("c8d8e8")
		if bool(b.rebel):
			col = Color("ff4c44")
		elif btype == "exit" or btype == "boss_base":
			col = Color("ffd54f")
		elif btype == "store":
			col = Color("5ef282")
		elif btype == "distress":
			col = Color("ff9f43")
		elif bool(b.visited):
			col = Color("5d758c")

		if is_cur:
			draw_arc(pos, 15.0, 0, TAU, 24, Color("7eff8b"), 2.5)
		elif bid == hover_beacon_id:
			draw_arc(pos, 14.0, 0, TAU, 20, Color.WHITE if reachable else Color("99aacc"), 2.0)

		draw_circle(pos, 7.5 if (btype in ["exit", "boss_base", "store"]) else 6.0, col)
		draw_circle(pos, 3.0, Color(0.08, 0.1, 0.14))

		if font != null:
			var tag := ""
			if btype == "exit": tag = "EXIT"
			elif btype == "boss_base": tag = "FLAGSHIP"
			elif btype == "store" and (bool(b.explored) or bool(b.visited)): tag = "STORE"
			elif btype == "distress": tag = "DISTRESS"
			elif bool(b.rebel): tag = "REBEL"
			elif not str(b.hazard).is_empty() and bool(b.explored): tag = str(b.hazard).to_upper()
			if not tag.is_empty():
				draw_string(font, pos + Vector2(-26, -11), tag, HORIZONTAL_ALIGNMENT_CENTER, 56, 11, col)
			if is_cur:
				draw_string(font, pos + Vector2(-18, 22), "YOU", HORIZONTAL_ALIGNMENT_CENTER, 36, 11, Color("7eff8b"))
