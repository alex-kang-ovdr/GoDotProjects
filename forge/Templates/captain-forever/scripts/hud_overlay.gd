class_name HudOverlay
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

signal weapon_requested(kind: String)
signal utility_requested(action: String)
signal radar_navigation_requested(world_target: Vector2)

const RADAR_RANGE := 3600.0
const RADAR_RADIUS := 78.0

var input_enabled := true
var clock_running := true
var pause_label := ""
var primary_held := false
var primary_touch := -1
var _flight_touch_map: Dictionary = {}
var _flight_mouse_action := ""
var _throttle_touch_id := -1
var _throttle_mouse_held := false
var throttle_value := 0.0
var missile_status := "NO LAUNCHER"
var holding_part := false
var defeated := false
var module_title := ""
var module_detail := ""

# 하단 그룹별 상단 펼치기 상태 ("", "tactical", "ship")
var open_group := ""

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
var _redraw_accum := 0.0
const HUD_REDRAW_INTERVAL := 0.066


func _ready() -> void:
	UiTheme.load_ui_font()
	if get_viewport() != null:
		get_viewport().size_changed.connect(queue_redraw)


func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	_sweep_angle = fposmod(_sweep_angle + delta * 1.65, TAU)
	if clock_running:
		mission_time += delta
	if not input_enabled:
		primary_held = false
		_flight_touch_map.clear()
		_flight_mouse_action = ""
		_throttle_touch_id = -1
		_throttle_mouse_held = false
		throttle_value = 0.0
	_redraw_accum += delta
	if _redraw_accum >= HUD_REDRAW_INTERVAL:
		_redraw_accum = 0.0
		queue_redraw()


func announce(text: String) -> void:
	message = text
	message_time = 4.2
	_redraw_accum = HUD_REDRAW_INTERVAL
	queue_redraw()


func _radar_radius_for(vp: Vector2) -> float:
	return 68.0 if vp.x < 680.0 else (74.0 if vp.x < 960.0 else RADAR_RADIUS)


func radar_center() -> Vector2:
	var vp := get_viewport_rect().size
	var r := _radar_radius_for(vp)
	if vp.x < 960.0:
		return Vector2(vp.x - r - 14.0, r + 16.0)
	return Vector2(vp.x - r - 18.0, r + 90.0)


func _dpad_metrics() -> Dictionary:
	var vp := get_viewport_rect().size
	var narrow := vp.x < 960.0
	var s := 72.0 if narrow else 82.0
	var gap := 6.0 if narrow else 7.0
	var ox := 10.0 if narrow else 14.0
	var bottom_pad := 114.0 if narrow else 10.0
	var h := s * 2.0 + gap
	var top_y := vp.y - bottom_pad - h
	return {"s": s, "gap": gap, "ox": ox, "top_y": top_y, "h": h, "w": s * 3.0 + gap * 2.0}


func flight_dpad_rects() -> Array[Dictionary]:
	var m := _dpad_metrics()
	var s := float(m.s)
	var gap := float(m.gap)
	var ox := float(m.ox)
	var top_y := float(m.top_y)
	var btn := Vector2(s, s)
	return [
		{"action": "turn_left", "glyph": "◀", "label": "좌회전", "rect": Rect2(Vector2(ox, top_y), btn)},
		{"action": "turn_right", "glyph": "▶", "label": "우회전", "rect": Rect2(Vector2(ox + (s + gap) * 2.0, top_y + s + gap), btn)},
	]


func throttle_stick_rect() -> Rect2:
	var m := _dpad_metrics()
	var s := float(m.s)
	var gap := float(m.gap)
	return Rect2(Vector2(float(m.ox) + s + gap, float(m.top_y)), Vector2(s, float(m.h)))


func flight_dpad_bounds() -> Rect2:
	var m := _dpad_metrics()
	return Rect2(Vector2(float(m.ox), float(m.top_y)), Vector2(float(m.w), float(m.h)))


func _update_throttle_from_point(point: Vector2) -> void:
	var rect := throttle_stick_rect()
	var center_y := rect.get_center().y
	var max_travel := maxf(18.0, rect.size.y * 0.5 - 24.0)
	var raw := clampf((center_y - point.y) / max_travel, -1.0, 1.0)
	throttle_value = 0.0 if absf(raw) < 0.08 else raw


func flight_forward_strength() -> float:
	if not input_enabled:
		return 0.0
	return maxf(0.0, throttle_value)


func flight_reverse_strength() -> float:
	if not input_enabled:
		return 0.0
	return maxf(0.0, -throttle_value)


func flight_action_held(action: String) -> bool:
	if not input_enabled:
		return false
	if _flight_mouse_action == action:
		return true
	for held_action in _flight_touch_map.values():
		if str(held_action) == action:
			return true
	return false


func _hit_flight_dpad(point: Vector2) -> String:
	for entry in flight_dpad_rects():
		if Rect2(entry.rect).has_point(point):
			return str(entry.action)
	return ""


## 하단 대형 2배 전투·그룹 도크: [함선 ▲] [전술 ▲] [그래플] [미사일] [사격]
func weapon_button_rects() -> Array[Dictionary]:
	var vp := get_viewport_rect().size
	var narrow := vp.x < 960.0
	var h := 94.0
	var y := vp.y - h - 10.0
	var gap := 6.0
	var start_x := 10.0 if narrow else 588.0
	var end_x := vp.x - 10.0
	var total_w := maxf(300.0, end_x - start_x)
	var unit := (total_w - gap * 4.0) / 5.15
	var w_std := unit
	var w_primary := unit * 1.15
	var x_ship := start_x
	var x_tactical := x_ship + w_std + gap
	var x_grapple := x_tactical + w_std + gap
	var x_missile := x_grapple + w_std + gap
	var x_primary := x_missile + w_std + gap
	return [
		{"kind": "group_ship", "rect": Rect2(Vector2(x_ship, y), Vector2(w_std, h))},
		{"kind": "group_tactical", "rect": Rect2(Vector2(x_tactical, y), Vector2(w_std, h))},
		{"kind": "grapple", "rect": Rect2(Vector2(x_grapple, y), Vector2(w_std, h))},
		{"kind": "missile", "rect": Rect2(Vector2(x_missile, y), Vector2(w_std, h))},
		{"kind": "primary", "rect": Rect2(Vector2(x_primary, y), Vector2(w_primary, h))},
	]


## 선택된 하단 그룹의 상단 펼치기(Upward Popover) 2배 확대 버튼 목록
func expanded_group_item_rects() -> Array[Dictionary]:
	if open_group.is_empty():
		return []
	var anchor_rect := Rect2()
	var anchor_kind := "group_" + open_group
	for entry in weapon_button_rects():
		if str(entry.kind) == anchor_kind:
			anchor_rect = entry.rect
			break
	if anchor_rect.size == Vector2.ZERO:
		return []

	var items: Array[Dictionary] = []
	if open_group == "tactical":
		var reel_lbl := "감기 ON (V)" if grapple_label.begins_with("REEL") else "그래플 감기 (V)"
		var od_lbl := "부스트 활성!" if overdrive_active else "부스트 (B · %d%%)" % roundi(overdrive_charge)
		var sub_lbl := "FTL 조준: 코어"
		if ship != null and ship.interior != null:
			var sub_map := {"core": "코어", "weapons": "무장실", "shields": "방어막실", "flight": "추진실"}
			sub_lbl = "FTL 조준: " + str(sub_map.get(ship.interior.enemy_target_subsystem, "코어"))
		items = [
			{"kind": "utility", "action": "ftl_subtarget", "label": sub_lbl, "accent": Color("ff9e78")},
			{"kind": "weapon", "action": "sonar", "label": "소나 발신 (X)", "accent": Color("6ef2ff")},
			{"kind": "weapon", "action": "reel", "label": reel_lbl, "accent": Color("ffe680")},
			{"kind": "weapon", "action": "overdrive", "label": od_lbl, "accent": Color("ffd36e")},
			{"kind": "utility", "action": "route", "label": "다음 관문 이동 (N)", "accent": Color("8ef8c8")},
		]
	elif open_group == "ship":
		var pwr_on := ship != null and ship.show_power_overlay
		items = [
			{"kind": "utility", "action": "interior_mode", "label": "함내 관제 (ONI·FTL)", "accent": Color("74f2ce")},
			{"kind": "utility", "action": "power_grid", "label": "전력망 표시: ON" if pwr_on else "전력망 표시: OFF", "accent": Color("ffd466")},
			{"kind": "utility", "action": "repair", "label": "도안 수리 (T)", "accent": Color("8ef8ff")},
			{"kind": "utility", "action": "station", "label": "정거장 도킹 (E)", "accent": Color("7ef5a8")},
			{"kind": "utility", "action": "restart" if defeated else "pause", "label": "새 항해 (R)" if defeated else "일시정지 (P)", "accent": Color("ffd36e")},
			{"kind": "utility", "action": "display_mode", "label": "라벨 보기" if VisualData.use_textured_design else "SF 그래픽", "accent": Color("b9d8ff")},
		]

	var vp := get_viewport_rect().size
	var item_w := minf(296.0, vp.x - 24.0)
	var item_h := 56.0
	var gap := 7.0
	var bx := clampf(anchor_rect.get_center().x - item_w * 0.5, 12.0, vp.x - item_w - 12.0)
	var bottom_y := anchor_rect.position.y - 12.0
	var total_h := float(items.size()) * item_h + float(maxi(items.size() - 1, 0)) * gap
	if bottom_y - total_h < 12.0:
		bottom_y = 12.0 + total_h
	var result: Array[Dictionary] = []
	for i in items.size():
		var idx_from_bottom := items.size() - 1 - i
		var ry := bottom_y - float(idx_from_bottom + 1) * item_h - float(idx_from_bottom) * gap
		var d := items[i].duplicate()
		d["rect"] = Rect2(Vector2(bx, ry), Vector2(item_w, item_h))
		result.append(d)
	return result


func utility_button_rects() -> Array[Dictionary]:
	return []


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		primary_held = false
		primary_touch = -1
		_flight_touch_map.clear()
		_flight_mouse_action = ""
		_throttle_touch_id = -1
		_throttle_mouse_held = false
		throttle_value = 0.0


func _input(event: InputEvent) -> void:
	if event is InputEventMouse and event.device == -1: return
	if event is InputEventMouseMotion and _throttle_mouse_held:
		_update_throttle_from_point(event.position)
		queue_redraw()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		var handled := false
		if primary_held:
			primary_held = false
			handled = true
		if not _flight_mouse_action.is_empty():
			_flight_mouse_action = ""
			handled = true
		if _throttle_mouse_held:
			_throttle_mouse_held = false
			throttle_value = 0.0
			handled = true
		if handled:
			queue_redraw()
			get_viewport().set_input_as_handled()
		return
	if event is InputEventScreenTouch and (not event.pressed or event.canceled):
		if event.index == primary_touch:
			primary_held = false
			primary_touch = -1
			queue_redraw()
			get_viewport().set_input_as_handled()
			return
		if event.index == _throttle_touch_id:
			_throttle_touch_id = -1
			throttle_value = 0.0
			queue_redraw()
			get_viewport().set_input_as_handled()
			return
		if _flight_touch_map.has(event.index):
			_flight_touch_map.erase(event.index)
			queue_redraw()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventScreenDrag:
		if event.index == _throttle_touch_id:
			_update_throttle_from_point(event.position)
			queue_redraw()
			get_viewport().set_input_as_handled()
			return
		if _flight_touch_map.has(event.index):
			var next_action := _hit_flight_dpad(event.position)
			if not next_action.is_empty():
				_flight_touch_map[event.index] = next_action
			elif not flight_dpad_bounds().grow(28.0).has_point(event.position):
				_flight_touch_map.erase(event.index)
			queue_redraw()
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

	if not open_group.is_empty():
		for item in expanded_group_item_rects():
			if Rect2(item.rect).has_point(point):
				var kind := str(item.kind)
				var act := str(item.action)
				open_group = ""
				if kind == "utility":
					utility_requested.emit(act)
				elif input_enabled:
					weapon_requested.emit(act)
				queue_redraw()
				get_viewport().set_input_as_handled()
				return

	for entry in weapon_button_rects():
		if Rect2(entry.rect).has_point(point):
			var k := str(entry.kind)
			if k == "group_tactical":
				open_group = "" if open_group == "tactical" else "tactical"
				queue_redraw()
				get_viewport().set_input_as_handled()
				return
			if k == "group_ship":
				open_group = "" if open_group == "ship" else "ship"
				queue_redraw()
				get_viewport().set_input_as_handled()
				return
			open_group = ""
			if not input_enabled:
				return
			if k == "primary":
				primary_held = true
				if event is InputEventScreenTouch: primary_touch = event.index
			weapon_requested.emit(k)
			queue_redraw()
			get_viewport().set_input_as_handled()
			return

	if not open_group.is_empty():
		open_group = ""
		queue_redraw()

	if not input_enabled:
		return
	if throttle_stick_rect().has_point(point):
		if event is InputEventScreenTouch:
			_throttle_touch_id = event.index
		else:
			_throttle_mouse_held = true
		_update_throttle_from_point(point)
		queue_redraw()
		get_viewport().set_input_as_handled()
		return
	var dpad_action := _hit_flight_dpad(point)
	if not dpad_action.is_empty():
		if event is InputEventScreenTouch:
			_flight_touch_map[event.index] = dpad_action
		else:
			_flight_mouse_action = dpad_action
		queue_redraw()
		get_viewport().set_input_as_handled()
		return
	if ship != null:
		var rc := radar_center()
		var r_rad := _radar_radius_for(get_viewport_rect().size)
		var offset := point - rc
		if offset.length_squared() <= r_rad * r_rad:
			var world_target := ship.global_position + (offset / r_rad) * RADAR_RANGE
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
	var font := UiTheme.load_ui_font()
	if font == null:
		return
	var vp := get_viewport_rect().size
	var narrow := vp.x < 960.0
	var r_rad := _radar_radius_for(vp)

	# ==========================================================================
	# 상단: 2배 확대 읽기 전용 함선 상태 카드 + 미션 배너 + 전술 레이더
	# ==========================================================================
	var card_w := clampf(vp.x - (r_rad * 2.0 + 44.0), 340.0, 548.0) if narrow else 548.0
	var card_h := 178.0
	var card := Rect2(12, 10, card_w, card_h)
	draw_rect(card, Color(0.02, 0.06, 0.13, 0.88), true)
	draw_rect(card, Color("38b6ff", 0.56), false, 2.0)
	draw_rect(Rect2(12, 10, 5, card_h), Color("55f4ff"), true)

	var rank_text := "%s · 파츠 %d" % [_rank_title(), ship.model.parts.size() if ship != null else 0]
	draw_string(font, Vector2(26, 40), rank_text, HORIZONTAL_ALIGNMENT_LEFT, card_w - 186.0, 25, Color("8ef8ff"))
	var threat := "CLEAR" if hostile_count == 0 else "적함 %d" % hostile_count
	draw_string(font, Vector2(12 + card_w - 172.0, 40), "격침 %d · %s" % [kills, threat], HORIZONTAL_ALIGNMENT_RIGHT, 160, 20, Color("ffd36e"))

	if ship != null:
		var core := ship.model.core_part()
		var hull_ratio := 0.0 if core == null else clampf(core.hp / maxf(core.max_hp, 1.0), 0.0, 1.0)
		draw_string(font, Vector2(26, 74), "선체 %d%%" % ceili(hull_ratio * 100.0), HORIZONTAL_ALIGNMENT_LEFT, 118, 21, Color("d8f0ff"))
		var shield_zone_w := 148.0
		var hull_bar := Rect2(142, 56, maxf(76.0, card_w - 146.0 - shield_zone_w), 16)
		draw_rect(hull_bar, Color("0b1c2e"), true)
		var hull_col := Color("55f4ff") if hull_ratio > 0.55 else (Color("ffb85c") if hull_ratio > 0.28 else Color("ff5c70"))
		draw_rect(Rect2(hull_bar.position, Vector2(hull_bar.size.x * hull_ratio, hull_bar.size.y)), hull_col, true)
		draw_rect(hull_bar, Color("7ad7ff", 0.65), false, 1.5)

		var pip_lbl_x := hull_bar.end.x + 10.0
		draw_string(font, Vector2(pip_lbl_x, 74), "방어", HORIZONTAL_ALIGNMENT_LEFT, 48, 19, Color("8eeaff"))
		var pip_ox := pip_lbl_x + 46.0
		for index in int(BalanceData.SHIELD.max_layers):
			var p_rect := Rect2(Vector2(pip_ox + index * 21, 56), Vector2(16, 16))
			draw_rect(p_rect, Color("48ceff") if index < ship.shield_layers else Color("11293d"), true)
			draw_rect(p_rect, Color("9ce8ff", 0.75), false, 1.2)

		var heat_ratio := clampf(ship.heat / 100.0, 0.0, 1.0)
		draw_string(font, Vector2(26, 108), "발열 %d%%" % roundi(ship.heat), HORIZONTAL_ALIGNMENT_LEFT, 114, 19, Color("ffc8a8"))
		var bar_half := maxf(54.0, (card_w - 270.0) * 0.5)
		var heat_bar := Rect2(132, 92, bar_half, 14)
		draw_rect(heat_bar, Color("1a1423"), true)
		draw_rect(Rect2(heat_bar.position, Vector2(heat_bar.size.x * heat_ratio, heat_bar.size.y)), Color("ff6e88") if heat_ratio > 0.75 else Color("ff9e66"), true)

		var od_ratio := clampf(overdrive_charge / 100.0, 0.0, 1.0)
		var boost_lbl_x := heat_bar.end.x + 12.0
		draw_string(font, Vector2(boost_lbl_x, 108), "부스트", HORIZONTAL_ALIGNMENT_LEFT, 68, 19, Color("ffe082"))
		var od_bar := Rect2(boost_lbl_x + 64.0, 92, maxf(54.0, card_w - (boost_lbl_x + 64.0) + 2.0), 14)
		draw_rect(od_bar, Color("1f1b12"), true)
		draw_rect(Rect2(od_bar.position, Vector2(od_bar.size.x * od_ratio, od_bar.size.y)), Color("ffd36e") if overdrive_active or od_ratio >= 0.99 else Color("d99b38"), true)

		var pwr_pct := roundi(ship.model.power_efficiency() * 100.0)
		var pwr_col := Color("9be6d8") if pwr_pct >= 95 else Color("ffb86c")
		draw_string(font, Vector2(26, 142), "속도 %.0f/%.0f · 질량 %.1f · 전력 %d%%" % [ship.linear_velocity.length(), ship.max_linear_speed(), ship.model.total_mass(), pwr_pct], HORIZONTAL_ALIGNMENT_LEFT, card_w - 26.0, 20, pwr_col)
		draw_string(font, Vector2(26, 174), "%s · %s · 관문 %d/6" % [navigation_label, target_label, sector], HORIZONTAL_ALIGNMENT_LEFT, card_w - 26.0, 20, Color("b9d8ff"))

	# 미션 배너 (가로: 우측 상단 레이더 위 / 세로: 상태카드 바로 아래 전폭)
	var seconds := int(mission_time)
	var mission_box := Rect2(12.0, 196.0, vp.x - 24.0, 66.0) if narrow else Rect2(vp.x - 448.0, 10.0, 436.0, 68.0)
	draw_rect(mission_box, Color(0.02, 0.06, 0.13, 0.88), true)
	draw_rect(mission_box, Color("38b6ff", 0.52), false, 1.8)
	draw_string(font, mission_box.position + Vector2(14, 30), "%s · %02d:%02d" % [mission_title, floori(float(seconds) / 60.0), seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, mission_box.size.x - 28.0, 23, Color("9ee6ff"))
	draw_string(font, mission_box.position + Vector2(14, 57), mission_copy, HORIZONTAL_ALIGNMENT_LEFT, mission_box.size.x - 28.0, 19, Color("dcefff"))

	_draw_tactical_radar(font)

	# 상단 중앙(가로) 또는 미션 배너 아래(세로): 알림 / 일시정지 / 모듈 인스펙터
	var banner_y := 270.0 if narrow else 198.0
	if not pause_label.is_empty():
		var pw := minf(480.0, vp.x - 28.0)
		var p_box := Rect2(vp.x * 0.5 - pw * 0.5, banner_y, pw, 54.0)
		draw_rect(p_box, Color(0.04, 0.09, 0.18, 0.94), true)
		draw_rect(p_box, Color("ffd36e"), false, 2.0)
		draw_string(font, p_box.position + Vector2(12, 36), pause_label, HORIZONTAL_ALIGNMENT_CENTER, pw - 24.0, 25, Color("ffe596"))
	elif message_time > 0.0 and open_group.is_empty():
		var tw := minf(vp.x - 24.0, 640.0)
		var toast := Rect2(vp.x * 0.5 - tw * 0.5, banner_y, tw, 50.0)
		draw_rect(toast, Color(0.02, 0.07, 0.14, 0.90), true)
		draw_rect(toast, Color("48ceff", 0.62), false, 1.8)
		draw_string(font, toast.position + Vector2(14, 33), message, HORIZONTAL_ALIGNMENT_CENTER, tw - 28.0, 21, Color("eef9ff"))

	if not module_title.is_empty():
		var mw := minf(vp.x - 24.0, 620.0)
		var panel := Rect2(vp.x * 0.5 - mw * 0.5, banner_y + 58.0, mw, 70.0)
		draw_rect(panel, Color("071221", 0.92), true)
		draw_rect(panel, Color("62ffd2", 0.80), false, 1.8)
		draw_string(font, panel.position + Vector2(14, 30), module_title, HORIZONTAL_ALIGNMENT_LEFT, mw - 28, 23, Color.WHITE)
		draw_string(font, panel.position + Vector2(14, 58), module_detail, HORIZONTAL_ALIGNMENT_LEFT, mw - 28, 19, Color("a8e2f0"))

	draw_flight_dpad(font)
	draw_weapon_controls(font)
	draw_expanded_group_drawer(font)


func _draw_tactical_radar(font: Font) -> void:
	var vp := get_viewport_rect().size
	var r_rad := _radar_radius_for(vp)
	var rc := radar_center()
	draw_circle(rc, r_rad + 5.0, Color(0.02, 0.06, 0.13, 0.88))
	draw_arc(rc, r_rad + 5.0, 0.0, TAU, 40, Color("38b6ff", 0.68), 2.0)
	draw_arc(rc, r_rad * 0.5, 0.0, TAU, 28, Color("38b6ff", 0.22), 1.2)
	draw_line(rc + Vector2(-r_rad, 0), rc + Vector2(r_rad, 0), Color("38b6ff", 0.18), 1.0)
	draw_line(rc + Vector2(0, -r_rad), rc + Vector2(0, r_rad), Color("38b6ff", 0.18), 1.0)

	var sweep_end := rc + Vector2.from_angle(_sweep_angle) * r_rad
	draw_line(rc, sweep_end, Color(0.35, 0.96, 0.85, 0.42), 2.0)

	if ship != null:
		var origin := ship.global_position
		for blip in radar_blips:
			var rel: Vector2 = (blip.pos as Vector2) - origin
			var norm := rel / RADAR_RANGE
			var clamped := norm.limit_length(0.95)
			var pt := rc + clamped * r_rad
			var kind := str(blip.kind)
			if kind == "station":
				draw_rect(Rect2(pt - Vector2(4.5, 4.5), Vector2(9.0, 9.0)), Color("55f4ff"), true)
			elif kind == "boss":
				var dia := PackedVector2Array([pt + Vector2(0, -6), pt + Vector2(6, 0), pt + Vector2(0, 6), pt + Vector2(-6, 0)])
				draw_colored_polygon(dia, Color("ffd36e"))
			elif kind == "enemy":
				draw_circle(pt, 4.2, Color("ff5c77"))
			elif kind == "salvage":
				draw_circle(pt, 3.0, Color("6ee7a4"))

		var wp_rel := (waypoint_world - origin) / RADAR_RANGE
		var wp_pt := rc + wp_rel.limit_length(0.96) * r_rad
		draw_arc(wp_pt, 7.0, 0.0, TAU, 16, Color("ffe394"), 2.0, true)

		var dir := Vector2.RIGHT.rotated(ship.global_rotation + ship.forward_angle_offset())
		var perp := Vector2(-dir.y, dir.x)
		var tri := PackedVector2Array([rc + dir * 8.0, rc - dir * 5.5 + perp * 5.0, rc - dir * 5.5 - perp * 5.0])
		draw_colored_polygon(tri, Color.WHITE)

	draw_string(font, rc + Vector2(-r_rad - 8.0, r_rad + 26.0), "전술 레이더", HORIZONTAL_ALIGNMENT_CENTER, (r_rad + 8.0) * 2.0, 19, Color("9ad4f2"))


func draw_flight_dpad(font: Font) -> void:
	for entry in flight_dpad_rects():
		var rect: Rect2 = entry.rect
		var action := str(entry.action)
		var held := flight_action_held(action)
		var accent := Color("8ef0c8")
		draw_rect(rect, Color(accent.r * 0.28, accent.g * 0.34, accent.b * 0.40, 0.94) if held else Color("071221", 0.90), true)
		draw_rect(rect, accent if held else Color(accent.r, accent.g, accent.b, 0.72), false, 2.6 if held else 1.8)
		draw_string(font, rect.position + Vector2(0, rect.size.y * 0.50), str(entry.glyph), HORIZONTAL_ALIGNMENT_CENTER, rect.size.x, 30, Color.WHITE if held else accent)
		draw_string(font, rect.position + Vector2(0, rect.size.y - 11.0), str(entry.label), HORIZONTAL_ALIGNMENT_CENTER, rect.size.x, 19, Color("eef9ff") if held else Color("c4e4f7"))

	var srect := throttle_stick_rect()
	var active := _throttle_touch_id != -1 or _throttle_mouse_held
	var accent := Color("55f4ff") if throttle_value > 0.01 else (Color("ff9e66") if throttle_value < -0.01 else Color("5aa8d6"))
	draw_rect(srect, Color("071221", 0.92), true)
	draw_rect(srect, accent if active else Color("38b6ff", 0.68), false, 2.4 if active else 1.8)

	var cx := srect.get_center().x
	var cy := srect.get_center().y
	var max_travel := maxf(18.0, srect.size.y * 0.5 - 26.0)
	draw_line(Vector2(cx, srect.position.y + 26.0), Vector2(cx, srect.end.y - 26.0), Color("284866", 0.85), 5.0)
	draw_line(Vector2(srect.position.x + 12.0, cy), Vector2(srect.end.x - 12.0, cy), Color("8cc8e8", 0.50), 1.6)
	var knob_y := cy - throttle_value * max_travel
	if absf(throttle_value) > 0.02:
		draw_line(Vector2(cx, cy), Vector2(cx, knob_y), accent, 7.0)
	draw_string(font, Vector2(srect.position.x, srect.position.y + 21.0), "▲ 가속", HORIZONTAL_ALIGNMENT_CENTER, srect.size.x, 18, Color("55f4ff") if throttle_value > 0.01 else Color("9cd4f0"))
	draw_string(font, Vector2(srect.position.x, srect.end.y - 7.0), "▼ 감속", HORIZONTAL_ALIGNMENT_CENTER, srect.size.x, 18, Color("ff9e66") if throttle_value < -0.01 else Color("9cd4f0"))
	var knob_pos := Vector2(cx, knob_y)
	draw_circle(knob_pos, 23.0, Color(accent.r * 0.25, accent.g * 0.35, accent.b * 0.42, 0.96) if active else Color("102438", 0.96))
	draw_arc(knob_pos, 23.0, 0.0, TAU, 24, accent, 2.6 if active else 2.0)
	var pct_label := "중립" if absf(throttle_value) < 0.02 else "%+d%%" % roundi(throttle_value * 100.0)
	draw_string(font, Vector2(srect.position.x, knob_y + 7.0), pct_label, HORIZONTAL_ALIGNMENT_CENTER, srect.size.x, 17, Color.WHITE)


func draw_weapon_controls(font: Font) -> void:
	var vp := get_viewport_rect().size
	var ultra_narrow := vp.x < 640.0
	var main_fsz := 20 if ultra_narrow else 24
	var sub_fsz := 16 if ultra_narrow else 19
	var cards := weapon_button_rects()
	var ship_arrow := "▼" if open_group == "ship" else "▲"
	var tac_arrow := "▼" if open_group == "tactical" else "▲"
	var labels := ["함선 %s" % ship_arrow, "전술 %s" % tac_arrow, "그래플", "미사일", "사격"]
	var subs := ["수리·관제", "소나·감기", "G 키", "F 키", "SPACE"]
	var details := [
		"펼치기" if open_group != "ship" else "열림",
		"부스트 %d%%" % roundi(overdrive_charge),
		grapple_label,
		"미장착" if missile_status == "NO LAUNCHER" else missile_status,
		"준비" if laser_ready else "발열 %d%%" % roundi(heat),
	]
	var colors := [Color("8ef8ff"), Color("ffd36e"), Color("7ef9ff"), Color("ffbd78"), Color("ff92e8")]
	for index in cards.size():
		var rect: Rect2 = cards[index].rect
		var color: Color = colors[index]
		var highlight := (index == 0 and open_group == "ship") or (index == 1 and open_group == "tactical") or (index == 4 and primary_held)
		draw_rect(rect, Color(color.r * 0.26, color.g * 0.26, color.b * 0.34, 0.96) if highlight else Color("071221", 0.92), true)
		draw_rect(rect, color if highlight else Color(color.r, color.g, color.b, 0.78), false, 2.6 if highlight else 2.0)
		draw_rect(Rect2(rect.position, Vector2(rect.size.x, 5.0)), color, true)
		draw_string(font, rect.position + Vector2(2, 34), labels[index], HORIZONTAL_ALIGNMENT_CENTER, rect.size.x - 4.0, main_fsz, Color.WHITE if highlight else color)
		draw_string(font, rect.position + Vector2(2, 60), subs[index], HORIZONTAL_ALIGNMENT_CENTER, rect.size.x - 4.0, sub_fsz, Color("c8e2f6"))
		draw_string(font, rect.position + Vector2(2, 84), details[index], HORIZONTAL_ALIGNMENT_CENTER, rect.size.x - 4.0, sub_fsz, Color("f0f8ff"))


func draw_expanded_group_drawer(font: Font) -> void:
	var items := expanded_group_item_rects()
	if items.is_empty():
		return
	var first_r: Rect2 = items[0].rect
	var last_r: Rect2 = items[items.size() - 1].rect
	var bg_rect := first_r.merge(last_r).grow(10.0)
	draw_rect(bg_rect, Color(0.03, 0.07, 0.14, 0.98), true)
	draw_rect(bg_rect, Color(0.42, 0.90, 1.0, 0.92), false, 2.2)
	for item in items:
		var r: Rect2 = item.rect
		var acc: Color = item.accent
		draw_rect(r, Color(0.07, 0.14, 0.24, 0.96), true)
		draw_rect(r, Color(acc.r, acc.g, acc.b, 0.85), false, 2.0)
		draw_string(font, r.position + Vector2(10, 36), str(item.label), HORIZONTAL_ALIGNMENT_CENTER, r.size.x - 20.0, 22, Color.WHITE)
