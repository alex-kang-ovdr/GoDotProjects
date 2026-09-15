class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")

var ship: ShipBody
var message := ""
var message_time := 0.0

func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	queue_redraw()

func announce(text: String) -> void:
	message = text
	message_time = 4.0

func _draw() -> void:
	var hud_origin := Vector2(24, 30)
	draw_string(ThemeDB.fallback_font, hud_origin, "YOU · CORE  %03d HP" % int(BalanceData.PLAYER.core_hp), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("a8e9ff"))
	draw_string(ThemeDB.fallback_font, hud_origin + Vector2(0, 25), "SHD", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("8eeaff"))
	if ship != null:
		for index in int(BalanceData.SHIELD.max_layers):
			var color := Color("48ceff") if index < ship.shield_layers else Color("17354a")
			draw_rect(Rect2(hud_origin + Vector2(45 + index * 19, 12), Vector2(14, 14)), color, true)
			draw_rect(Rect2(hud_origin + Vector2(45 + index * 19, 12), Vector2(14, 14)), Color("a7edff"), false, 1.0)
	if message_time > 0.0:
		draw_rect(Rect2(20, 665, 1050, 34), Color(0.02, 0.06, 0.12, 0.85), true)
		draw_string(ThemeDB.fallback_font, Vector2(34, 688), message, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("e7f6ff"))
