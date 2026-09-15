class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")

signal weapon_requested(kind: String)

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
	mission_time += delta
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
	for entry in weapon_button_rects():
		if Rect2(entry.rect).has_point(point):
			weapon_requested.emit(str(entry.kind))
			get_viewport().set_input_as_handled()
			return

func _draw() -> void:
	var hud_origin := Vector2(24, 28)
	draw_rect(Rect2(14, 12, 300, 105), Color(0.01, 0.04, 0.10, 0.80), true)
	draw_string(ThemeDB.fallback_font, hud_origin, "YOU · CORE", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("a8e9ff"))
	if ship != null:
		var core := ship.model.core_part()
		var hull_percent := 0 if core == null else ceili(core.hp / maxf(core.max_hp, 1.0) * 100.0)
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(110, 0), "HULL %d%%" % hull_percent, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("d9efff"))
	draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 22), "SHIELD LAYERS", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("8eeaff"))
	if ship != null:
		for index in int(BalanceData.SHIELD.max_layers):
			var color := Color("48ceff") if index < ship.shield_layers else Color("17354a")
			draw_rect(Rect2(hud_origin + Vector2(45 + index * 19, 12), Vector2(14, 14)), color, true)
			draw_rect(Rect2(hud_origin + Vector2(45 + index * 19, 12), Vector2(14, 14)), Color("a7edff"), false, 1.0)
		var threat := "CLEAR" if hostile_count == 0 else "HOSTILE %d" % hostile_count
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 61), "SALVAGE %d  ·  SECTOR %d / 7" % [salvage, sector], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("ffe082"))
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 82), "THREAT %s  ·  HEAT %d%%  ·  PWR %+.0f  ·  MASS %.1f" % [threat, roundi(ship.heat), ship.model.power_balance(), ship.model.total_mass()], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("c7d8f2"))
	var seconds := int(mission_time)
	draw_string(ThemeDB.fallback_font, Vector2(760, 31), "%s · %02d:%02d" % [mission_title, floori(float(seconds) / 60.0), seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("b8d5ff"))
	draw_string(ThemeDB.fallback_font, Vector2(760, 54), mission_copy, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("d8eaff"))
	draw_weapon_controls()
	if message_time > 0.0:
		var message_y := get_viewport_rect().size.y - 22.0
		draw_rect(Rect2(20, message_y - 23.0, get_viewport_rect().size.x - 40.0, 30), Color(0.02, 0.06, 0.12, 0.85), true)
		draw_string(ThemeDB.fallback_font, Vector2(34, message_y - 2.0), message, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("e7f6ff"))

func draw_weapon_controls() -> void:
	var cards := weapon_button_rects()
	var labels := ["LASER", "MISSILE", "GRAPPLE"]
	var hotkeys := ["SPACE", "F", "G"]
	var details := ["READY" if laser_ready else "COOL %d%%" % roundi(heat), "AMMO %d" % missile_ammo, grapple_label]
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
