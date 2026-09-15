class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")

var ship: ShipBody
var message := ""
var message_time := 0.0
var salvage := 0
var mission_time := 0.0
var sector := 1
var hostile_count := 0
var mission_title := "ROUTE ETA · ~30 MIN"
var mission_copy := "다음 관문: RIFT BREAKER"

func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	mission_time += delta
	queue_redraw()

func announce(text: String) -> void:
	message = text
	message_time = 4.0

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
		draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 82), "THREAT %s  ·  HEAT %d%%  ·  MASS %.1f" % [threat, roundi(ship.heat), ship.model.total_mass()], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("c7d8f2"))
	var seconds := int(mission_time)
	draw_string(ThemeDB.fallback_font, Vector2(760, 31), "%s · %02d:%02d" % [mission_title, seconds / 60, seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("b8d5ff"))
	draw_string(ThemeDB.fallback_font, Vector2(760, 54), mission_copy, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("d8eaff"))
	if message_time > 0.0:
		draw_rect(Rect2(20, 665, 1050, 34), Color(0.02, 0.06, 0.12, 0.85), true)
		draw_string(ThemeDB.fallback_font, Vector2(34, 688), message, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("e7f6ff"))
