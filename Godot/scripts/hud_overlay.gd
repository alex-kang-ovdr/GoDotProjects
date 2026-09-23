class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

signal weapon_requested(kind: String)
signal utility_requested(action: String)

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
var mission_time := 0.0
var sector := 1
var hostile_count := 0
var mission_title := "ROUTE ETA · ~30 MIN"
var mission_copy := "다음 관문: RIFT BREAKER"
var target_label := "TARGET · NONE"
var navigation_label := "MANUAL FLIGHT"
var laser_ready := true
var heat := 0.0
var missile_ammo := 0
var grapple_label := "READY"

func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	if clock_running: mission_time += delta
	if not input_enabled: primary_held = false
	queue_redraw()

func announce(text: String) -> void:
	message = text
	message_time = 4.0

func weapon_button_rects() -> Array[Dictionary]:
	var viewport_size := get_viewport_rect().size
	var origin := Vector2(viewport_size.x - 282.0, viewport_size.y - 104.0)
	return [
		{"kind":"primary", "rect":Rect2(origin, Vector2(86.0, 76.0))},
		{"kind":"missile", "rect":Rect2(origin + Vector2(94.0, 0.0), Vector2(86.0, 76.0))},
		{"kind":"grapple", "rect":Rect2(origin + Vector2(188.0, 0.0), Vector2(86.0, 76.0))},
	]

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
	if not input_enabled: return
	for entry in weapon_button_rects():
		if Rect2(entry.rect).has_point(point):
			if entry.kind == "primary":
				primary_held = true
				if event is InputEventScreenTouch: primary_touch = event.index
			weapon_requested.emit(str(entry.kind))
			get_viewport().set_input_as_handled()
			return

func utility_button_rects() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var labels := ["일시정지 P", "조작 H", "다음 관문 N", "정거장 E", "디자인 보기" if not VisualData.use_textured_design else "모듈 치트 보기"]
	var actions := ["pause", "help", "route", "station", "display_mode"]
	if holding_part:
		labels[2] = "파트 회전 Q"; actions[2] = "rotate_part"
		labels[3] = "회수 취소 ESC"; actions[3] = "cancel_part"
	if defeated:
		labels[0] = "새 항해 R"; actions[0] = "restart"
	for index in labels.size():
		result.append({"label":labels[index], "action":actions[index], "rect":Rect2(14 + index * 112, 158, 104, 32)})
	return result

func _draw() -> void:
	var hud_origin := Vector2(24, 28)
	draw_rect(Rect2(14, 12, 448, 136), Color(0.01, 0.04, 0.10, 0.80), true)
	draw_string(ThemeDB.fallback_font, hud_origin, "YOU · CORE", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("a8e9ff"))
	if ship != null:
		var core := ship.model.core_part()
		var hull_percent := 0 if core == null else ceili(core.hp / maxf(core.max_hp, 1.0) * 100.0)
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(110, 0), "HULL %d%%" % hull_percent, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("d9efff"))
	draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 22), "SHIELD LAYERS", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("8eeaff"))
	if ship != null:
		for index in int(BalanceData.SHIELD.max_layers):
			var color := Color("48ceff") if index < ship.shield_layers else Color("17354a")
			draw_rect(Rect2(hud_origin + Vector2(144 + index * 19, 12), Vector2(14, 14)), color, true)
			draw_rect(Rect2(hud_origin + Vector2(144 + index * 19, 12), Vector2(14, 14)), Color("a7edff"), false, 1.0)
		var threat := "CLEAR" if hostile_count == 0 else "HOSTILE %d" % hostile_count
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 61), "SALVAGE %d  ·  ROUTE %d / 6" % [salvage, sector], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("ffe082"))
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 82), "THREAT %s  ·  HEAT %d%%  ·  PWR %+.0f  ·  MASS %.1f" % [threat, roundi(ship.heat), ship.model.power_balance(), ship.model.total_mass()], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("c7d8f2"))
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 106), "SPD %.0f / %.0f px/s · TURN %.2f rad/s" % [ship.linear_velocity.length(), ship.max_linear_speed(), ship.angular_velocity], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("82e7c6"))
	var seconds := int(mission_time)
	var mission_origin := Vector2(maxf(480, get_viewport_rect().size.x - 570), 31)
	draw_string(ThemeDB.fallback_font, mission_origin, "%s · %02d:%02d" % [mission_title, floori(float(seconds) / 60.0), seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, 555, 14, Color("b8d5ff"))
	draw_string(ThemeDB.fallback_font, mission_origin + Vector2(0, 23), mission_copy, HORIZONTAL_ALIGNMENT_LEFT, 555, 13, Color("d8eaff"))
	for entry in utility_button_rects():
		var rect: Rect2 = entry.rect
		draw_rect(rect, Color("123a55"), true)
		draw_string(ThemeDB.fallback_font, rect.position + Vector2(7, 21), entry.label, HORIZONTAL_ALIGNMENT_LEFT, 92, 13, Color("d8eaff"))
	if not pause_label.is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(480, 100), pause_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("ffe082"))
	draw_weapon_controls()
	if not VisualData.use_textured_design and not module_title.is_empty():
		var panel := Rect2(20, get_viewport_rect().size.y - 118, minf(680, get_viewport_rect().size.x - 340), 60)
		draw_rect(panel, Color("071221", 0.96), true)
		draw_rect(panel, Color("82e7c6"), false, 1.0)
		draw_string(ThemeDB.fallback_font, panel.position + Vector2(12, 22), module_title, HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 24, 16, Color.WHITE)
		draw_string(ThemeDB.fallback_font, panel.position + Vector2(12, 44), module_detail, HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 24, 13, Color("a8d5e5"))
	if message_time > 0.0:
		var message_y := get_viewport_rect().size.y - 22.0
		var message_width := get_viewport_rect().size.x - 340.0
		draw_rect(Rect2(20, message_y - 23.0, message_width, 30), Color(0.02, 0.06, 0.12, 0.85), true)
		draw_string(ThemeDB.fallback_font, Vector2(34, message_y - 2.0), message, HORIZONTAL_ALIGNMENT_LEFT, message_width - 28.0, 13, Color("e7f6ff"))

func draw_weapon_controls() -> void:
	var cards := weapon_button_rects()
	var labels := ["GUNS", "MISSILE", "GRAPPLE"]
	var hotkeys := ["SPACE", "F", "G"]
	var details := ["READY" if laser_ready else "COOL %d%%" % roundi(heat), missile_status, grapple_label]
	var colors := [Color("ff92e8"), Color("ffbd78"), Color("91eaff")]
	for index in cards.size():
		var rect: Rect2 = cards[index].rect
		var color: Color = colors[index]
		draw_rect(rect, Color("071221", 0.92), true)
		draw_rect(rect, color, false, 2.0)
		# 작은 색 블록은 무기 타입을 즉시 구분하는 아이콘 역할을 한다.
		draw_rect(Rect2(rect.position + Vector2(9, 10), Vector2(18, 18)), color, true)
		draw_string(ThemeDB.fallback_font, rect.position + Vector2(34, 23), labels[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, color)
		draw_string(ThemeDB.fallback_font, rect.position + Vector2(9, 47), details[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("e7f6ff"))
		draw_string(ThemeDB.fallback_font, rect.position + Vector2(9, 66), hotkeys[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("a9bed9"))
	var cards_origin: Rect2 = cards[0].rect
	draw_string(ThemeDB.fallback_font, cards_origin.position + Vector2(0, -22), target_label, HORIZONTAL_ALIGNMENT_LEFT, 274, 13, Color("ffcf98") if not target_label.ends_with("NONE") else Color("8da7c2"))
	draw_string(ThemeDB.fallback_font, cards_origin.position + Vector2(0, -7), navigation_label, HORIZONTAL_ALIGNMENT_LEFT, 274, 12, Color("82e7c6") if navigation_label.begins_with("AUTO") else Color("8da7c2"))
