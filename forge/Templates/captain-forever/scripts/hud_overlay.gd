class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

signal weapon_requested(kind: String)
signal utility_requested(action: String)
signal radar_navigation_requested(world_target: Vector2)

const RADAR_RANGE := 3600.0
const RADAR_RADIUS := 74.0

var input_enabled := true
var clock_running := true
var pause_label := ""
var primary_held := false
var primary_touch := -1
var missile_status := "NO LAUNCHER"
var holding_part := false
var defeated := false
var module_title := ""
var module_detail := ""

var ship: ShipBody
var message := ""
var message_time := 0.0
var salvage := 0
var kills := 0
var kill_streak := 0
var overdrive_charge := 100.0
var overdrive_active := false
var mission_time := 0.0
var sector := 1
var hostile_count := 0
var mission_title := "ROUTE 1 / 6"
var mission_copy := "다음 관문: KEPLER REPAIR DOCK"
var target_label := "TARGET · NONE"
var navigation_label := "MANUAL FLIGHT"
var laser_ready := true
var heat := 0.0
var missile_ammo := 0
var grapple_label := "READY"
var radar_blips: Array[Dictionary] = []
var waypoint_world := Vector2.ZERO
var _sweep_angle := 0.0


func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	_sweep_angle = fposmod(_sweep_angle + delta * 1.65, TAU)
	if clock_running:
		mission_time += delta
	if not input_enabled:
		primary_held = false
	queue_redraw()


func announce(text: String) -> void:
	message = text
	message_time = 4.2


func radar_center() -> Vector2:
	var vp := get_viewport_rect().size
	return Vector2(vp.x - RADAR_RADIUS - 22.0, RADAR_RADIUS + 68.0)


func weapon_button_rects() -> Array[Dictionary]:
	var viewport_size := get_viewport_rect().size
	var origin := Vector2(viewport_size.x - 380.0, viewport_size.y - 102.0)
	return [
		{"kind":"primary", "rect":Rect2(origin, Vector2(88.0, 78.0))},
		{"kind":"missile", "rect":Rect2(origin + Vector2(94.0, 0.0), Vector2(88.0, 78.0))},
		{"kind":"grapple", "rect":Rect2(origin + Vector2(188.0, 0.0), Vector2(88.0, 78.0))},
		{"kind":"overdrive", "rect":Rect2(origin + Vector2(282.0, 0.0), Vector2(88.0, 78.0))},
	]


func utility_button_rects() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var labels := [
		"일시정지 P",
		"조작 H",
		"다음 관문 N",
		"정거장 E",
		"빠른장착 C",
		"라벨 보기" if VisualData.use_textured_design else "SF 그래픽",
	]
	var actions := ["pause", "help", "route", "station", "quick_attach", "display_mode"]
	if holding_part:
		labels[2] = "파트 회전 Q"; actions[2] = "rotate_part"
		labels[3] = "회수 취소 ESC"; actions[3] = "cancel_part"
	if defeated:
		labels[0] = "새 항해 R"; actions[0] = "restart"
	for index in labels.size():
		result.append({"label":labels[index], "action":actions[index], "rect":Rect2(14 + index * 102, 166, 96, 30)})
	return result


func _input(event: InputEvent) -> void:
	if event is InputEventMouse and event.device == -1: return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		if primary_held:
			primary_held = false
			get_viewport().set_input_as_handled()
		return
	if event is InputEventScreenTouch and not event.pressed and event.index == primary_touch:
		primary_held = false
		primary_touch = -1
		get_viewport().set_input_as_handled()
		return
	var pressed := false
	var point := Vector2.ZERO
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		pressed = true
		point = event.position
	elif event is InputEventScreenTouch and event.pressed:
		pressed = true
		point = event.position
	if not pressed:
		return
	for entry in utility_button_rects():
		if Rect2(entry.rect).has_point(point):
			utility_requested.emit(str(entry.action))
			get_viewport().set_input_as_handled()
			return
	if not input_enabled:
		return
	for entry in weapon_button_rects():
		if Rect2(entry.rect).has_point(point):
			if entry.kind == "primary":
				primary_held = true
				if event is InputEventScreenTouch: primary_touch = event.index
			weapon_requested.emit(str(entry.kind))
			get_viewport().set_input_as_handled()
			return
	# Click inside Tactical Radar Minimap -> set Auto-Navigation!
	if ship != null:
		var rc := radar_center()
		var offset := point - rc
		if offset.length_squared() <= RADAR_RADIUS * RADAR_RADIUS:
			var world_target := ship.global_position + (offset / RADAR_RADIUS) * RADAR_RANGE
			radar_navigation_requested.emit(world_target)
			get_viewport().set_input_as_handled()


func _rank_title() -> String:
	var score := salvage + kills * 2
	if score >= 28: return "전설 제독"
	if score >= 18: return "함대 사령관"
	if score >= 10: return "선봉 함장"
	if score >= 4: return "베테랑 선장"
	return "루키 선장"


func _draw() -> void:
	var font := ThemeDB.fallback_font
	if font == null:
		return
	var vp := get_viewport_rect().size

	# 1. Top-Left Commander Status Panel (Glassmorphic Sci-Fi Card)
	var card := Rect2(14, 12, 468, 146)
	draw_rect(card, Color(0.02, 0.06, 0.13, 0.86), true)
	draw_rect(card, Color("38b6ff", 0.52), false, 1.5)
	draw_rect(Rect2(14, 12, 5, 146), Color("55f4ff"), true)

	var rank_text := "%s  ·  PARTS %d" % [_rank_title(), ship.model.parts.size() if ship != null else 0]
	draw_string(font, Vector2(28, 33), rank_text, HORIZONTAL_ALIGNMENT_LEFT, 320, 16, Color("8ef8ff"))
	if kill_streak >= 2:
		draw_string(font, Vector2(346, 33), "연속격파 ×%d" % kill_streak, HORIZONTAL_ALIGNMENT_RIGHT, 122, 13, Color("ffd36e"))

	if ship != null:
		var core := ship.model.core_part()
		var hull_ratio := 0.0 if core == null else clampf(core.hp / maxf(core.max_hp, 1.0), 0.0, 1.0)
		draw_string(font, Vector2(28, 55), "CORE HULL %d%%" % ceili(hull_ratio * 100.0), HORIZONTAL_ALIGNMENT_LEFT, 130, 12, Color("d8f0ff"))
		var hull_bar := Rect2(146, 45, 166, 10)
		draw_rect(hull_bar, Color("0b1c2e"), true)
		var hull_col := Color("55f4ff") if hull_ratio > 0.55 else (Color("ffb85c") if hull_ratio > 0.28 else Color("ff5c70"))
		draw_rect(Rect2(hull_bar.position, Vector2(hull_bar.size.x * hull_ratio, hull_bar.size.y)), hull_col, true)
		draw_rect(hull_bar, Color("7ad7ff", 0.55), false, 1.0)

		# Shield pips
		draw_string(font, Vector2(324, 55), "SHIELD", HORIZONTAL_ALIGNMENT_LEFT, 60, 12, Color("8eeaff"))
		for index in int(BalanceData.SHIELD.max_layers):
			var p_rect := Rect2(Vector2(376 + index * 18, 44), Vector2(13, 12))
			draw_rect(p_rect, Color("48ceff") if index < ship.shield_layers else Color("11293d"), true)
			draw_rect(p_rect, Color("9ce8ff", 0.7), false, 1.0)

		# Heat & Overdrive bars
		var heat_ratio := clampf(ship.heat / 100.0, 0.0, 1.0)
		draw_string(font, Vector2(28, 77), "HEAT %d%%" % roundi(ship.heat), HORIZONTAL_ALIGNMENT_LEFT, 110, 12, Color("ffc8a8"))
		var heat_bar := Rect2(146, 67, 130, 8)
		draw_rect(heat_bar, Color("1a1423"), true)
		draw_rect(Rect2(heat_bar.position, Vector2(heat_bar.size.x * heat_ratio, heat_bar.size.y)), Color("ff6e88") if heat_ratio > 0.75 else Color("ff9e66"), true)

		var od_ratio := clampf(overdrive_charge / 100.0, 0.0, 1.0)
		draw_string(font, Vector2(288, 77), "BOOST", HORIZONTAL_ALIGNMENT_LEFT, 54, 12, Color("ffe082"))
		var od_bar := Rect2(338, 67, 130, 8)
		draw_rect(od_bar, Color("1f1b12"), true)
		draw_rect(Rect2(od_bar.position, Vector2(od_bar.size.x * od_ratio, od_bar.size.y)), Color("ffd36e") if overdrive_active or od_ratio >= 0.99 else Color("d99b38"), true)

		var threat := "CLEAR" if hostile_count == 0 else "HOSTILE %d" % hostile_count
		draw_string(font, Vector2(28, 102), "회수 %d  ·  격침 %d  ·  관문 %d/6  ·  %s" % [salvage, kills, sector, threat], HORIZONTAL_ALIGNMENT_LEFT, 440, 13, Color("ffe394"))
		draw_string(font, Vector2(28, 124), "SPD %.0f/%0.f  ·  MASS %.1f  ·  PWR %+.0f  ·  %s" % [ship.linear_velocity.length(), ship.max_linear_speed(), ship.model.total_mass(), ship.model.power_balance(), navigation_label], HORIZONTAL_ALIGNMENT_LEFT, 440, 12, Color("9be6d8"))
		draw_string(font, Vector2(28, 145), target_label, HORIZONTAL_ALIGNMENT_LEFT, 440, 12, Color("b9d8ff"))

	# 2. Top-Right Mission Banner + Tactical Radar Minimap
	var seconds := int(mission_time)
	var mission_box := Rect2(vp.x - 420.0, 12.0, 406.0, 46.0)
	draw_rect(mission_box, Color(0.02, 0.06, 0.13, 0.86), true)
	draw_rect(mission_box, Color("38b6ff", 0.45), false, 1.2)
	draw_string(font, mission_box.position + Vector2(12, 20), "%s  ·  %02d:%02d" % [mission_title, floori(float(seconds) / 60.0), seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, 382, 14, Color("9ee6ff"))
	draw_string(font, mission_box.position + Vector2(12, 39), mission_copy, HORIZONTAL_ALIGNMENT_LEFT, 382, 12, Color("dcefff"))

	_draw_tactical_radar(font)

	# 3. Utility Toolbar Buttons
	for entry in utility_button_rects():
		var rect: Rect2 = entry.rect
		draw_rect(rect, Color(0.06, 0.18, 0.29, 0.90), true)
		draw_rect(rect, Color("48b8e8", 0.55), false, 1.0)
		draw_string(font, rect.position + Vector2(5, 20), str(entry.label), HORIZONTAL_ALIGNMENT_CENTER, rect.size.x - 10, 12, Color("e3f4ff"))

	if not pause_label.is_empty():
		var p_box := Rect2(vp.x * 0.5 - 210.0, 74.0, 420.0, 36.0)
		draw_rect(p_box, Color(0.04, 0.09, 0.18, 0.92), true)
		draw_rect(p_box, Color("ffd36e"), false, 1.5)
		draw_string(font, p_box.position + Vector2(10, 24), pause_label, HORIZONTAL_ALIGNMENT_CENTER, 400, 15, Color("ffe596"))

	# 4. Weapon & Overdrive Deck
	draw_weapon_controls(font)

	# 5. Module Inspector Tooltip (works in both modes on hover!)
	if not module_title.is_empty():
		var panel := Rect2(20, vp.y - 116, minf(620, vp.x - 420), 56)
		draw_rect(panel, Color("071221", 0.92), true)
		draw_rect(panel, Color("62ffd2", 0.78), false, 1.2)
		draw_string(font, panel.position + Vector2(12, 22), module_title, HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 24, 15, Color.WHITE)
		draw_string(font, panel.position + Vector2(12, 43), module_detail, HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 24, 12, Color("a8e2f0"))

	# 6. Toast Message Bar
	if message_time > 0.0:
		var message_y := vp.y - 22.0
		var message_width := vp.x - 416.0
		var toast := Rect2(20, message_y - 25.0, message_width, 32)
		draw_rect(toast, Color(0.02, 0.07, 0.14, 0.88), true)
		draw_rect(toast, Color("48ceff", 0.45), false, 1.0)
		draw_string(font, Vector2(34, message_y - 4.0), message, HORIZONTAL_ALIGNMENT_LEFT, message_width - 28.0, 13, Color("eef9ff"))


func _draw_tactical_radar(font: Font) -> void:
	var rc := radar_center()
	draw_circle(rc, RADAR_RADIUS + 4.0, Color(0.02, 0.06, 0.13, 0.88))
	draw_arc(rc, RADAR_RADIUS + 4.0, 0.0, TAU, 48, Color("38b6ff", 0.62), 1.6, true)
	draw_arc(rc, RADAR_RADIUS * 0.5, 0.0, TAU, 36, Color("38b6ff", 0.18), 1.0, true)
	draw_line(rc + Vector2(-RADAR_RADIUS, 0), rc + Vector2(RADAR_RADIUS, 0), Color("38b6ff", 0.16), 1.0)
	draw_line(rc + Vector2(0, -RADAR_RADIUS), rc + Vector2(0, RADAR_RADIUS), Color("38b6ff", 0.16), 1.0)

	# Rotating radar sweep line
	var sweep_end := rc + Vector2.from_angle(_sweep_angle) * RADAR_RADIUS
	draw_line(rc, sweep_end, Color(0.35, 0.96, 0.85, 0.35), 1.6, true)

	if ship != null:
		var origin := ship.global_position
		for blip in radar_blips:
			var rel: Vector2 = (blip.pos as Vector2) - origin
			var norm := rel / RADAR_RANGE
			var clamped := norm.limit_length(0.95)
			var pt := rc + clamped * RADAR_RADIUS
			var kind := str(blip.kind)
			if kind == "station":
				draw_rect(Rect2(pt - Vector2(3.5, 3.5), Vector2(7.0, 7.0)), Color("55f4ff"), true)
			elif kind == "boss":
				var dia := PackedVector2Array([pt + Vector2(0, -5), pt + Vector2(5, 0), pt + Vector2(0, 5), pt + Vector2(-5, 0)])
				draw_colored_polygon(dia, Color("ffd36e"))
			elif kind == "enemy":
				draw_circle(pt, 3.2, Color("ff5c77"))
			elif kind == "salvage":
				draw_circle(pt, 2.2, Color("6ee7a4"))

		# Active waypoint directional marker on rim
		var wp_rel := (waypoint_world - origin) / RADAR_RANGE
		var wp_pt := rc + wp_rel.limit_length(0.96) * RADAR_RADIUS
		draw_arc(wp_pt, 5.5, 0.0, TAU, 16, Color("ffe394"), 1.5, true)

		# Player heading triangle at center
		var dir := Vector2.RIGHT.rotated(ship.global_rotation)
		var perp := Vector2(-dir.y, dir.x)
		var tri := PackedVector2Array([rc + dir * 6.5, rc - dir * 4.5 + perp * 4.0, rc - dir * 4.5 - perp * 4.0])
		draw_colored_polygon(tri, Color.WHITE)

	draw_string(font, rc + Vector2(-RADAR_RADIUS, RADAR_RADIUS + 18.0), "전술 레이더 (클릭 항법)", HORIZONTAL_ALIGNMENT_CENTER, RADAR_RADIUS * 2.0, 11, Color("8cc8e8"))


func draw_weapon_controls(font: Font) -> void:
	var cards := weapon_button_rects()
	var labels := ["GUNS", "MISSILE", "GRAPPLE", "BOOST"]
	var hotkeys := ["SPACE", "F", "G", "B"]
	var od_text := "ACTIVE!" if overdrive_active else ("READY" if overdrive_charge >= 40.0 else "%d%%" % roundi(overdrive_charge))
	var details := ["READY" if laser_ready else "HEAT %d%%" % roundi(heat), missile_status, grapple_label, od_text]
	var colors := [Color("ff92e8"), Color("ffbd78"), Color("7ef9ff"), Color("ffd36e")]
	for index in cards.size():
		var rect: Rect2 = cards[index].rect
		var color: Color = colors[index]
		var highlight := (index == 3 and overdrive_active) or (index == 0 and primary_held)
		draw_rect(rect, Color("132942", 0.95) if highlight else Color("071221", 0.92), true)
		draw_rect(rect, color, false, 2.4 if highlight else 1.8)
		draw_rect(Rect2(rect.position + Vector2(8, 10), Vector2(14, 14)), color, true)
		draw_string(font, rect.position + Vector2(28, 22), labels[index], HORIZONTAL_ALIGNMENT_LEFT, 56, 12, color)
		draw_string(font, rect.position + Vector2(8, 44), hotkeys[index], HORIZONTAL_ALIGNMENT_LEFT, 72, 13, Color.WHITE)
		draw_string(font, rect.position + Vector2(8, 65), details[index], HORIZONTAL_ALIGNMENT_LEFT, 74, 11, Color("cbe6f8"))
