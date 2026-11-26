class_name DSTHud
extends CanvasLayer

## Don't Starve Together 원작 스타일 HUD (M4/M5 고도화):
## - 전체 화면 가장자리 상태 비네트 (어둠/광기/계몽/동상/과열)
## - 상단 중앙: 거대 보스 전용 대형 체력바 (외눈사슴 / 결정화 외눈사슴)
## - 우측 상단: 16세그먼트 원형 시계 + 원작 캐릭터 초상화 + 3대 원형 배지(체력/허기/정신력) + 실시간 2D 미니맵
## - 좌측: 원작 PNG 아이콘 제작 사이드바 (도구/광원/과학기계/무기/방어구/요리/농사/항해/평면장비)
## - 하단: 원작 PNG 아이콘 클릭형 인벤토리 바 + 장비/보트/스킬 상태 바
## - 팝업: 인사이트 스킬트리 패널 (K키 토글)

var sim: DSTWorldSim
var action_callback: Callable

var vignette_ctrl: Control
var boss_panel: PanelContainer
var boss_label: Label
var boss_bar: ProgressBar

var clock_panel: Control
var badge_panel: Control
var minimap_panel: Control
var portrait_rect: TextureRect
var stats_label: Label

var equip_label: Label
var inv_slot_box: HBoxContainer
var inv_buttons: Array = []
var log_label: Label
var recipe_box: VBoxContainer
var recipe_buttons: Dictionary = {}

var skill_panel: PanelContainer
var skill_points_label: Label
var skill_buttons: Dictionary = {}


class StatusVignette extends Control:
	var sim: DSTWorldSim

	func _draw() -> void:
		if sim == null:
			return
		var col: Color = Color(0, 0, 0, 0)
		if sim.phase == "night" and sim.moon_phase != "full" and sim.character_id != "willow":
			col = Color(0.02, 0.02, 0.05, 0.34 if sim.dark_exposure_timer > 0.5 else 0.16)
		elif sim.is_insane():
			col = Color(0.32, 0.05, 0.22, 0.24)
		elif sim.is_enlightened():
			col = Color(0.28, 0.78, 0.92, 0.20)
		elif sim.temperature < 5.0:
			col = Color(0.45, 0.78, 1.0, 0.24)
		elif sim.temperature > 65.0:
			col = Color(1.0, 0.42, 0.12, 0.24)
		if col.a <= 0.001:
			return
		var edge: float = 34.0
		draw_rect(Rect2(0, 0, size.x, edge), col)
		draw_rect(Rect2(0, size.y - edge, size.x, edge), col)
		draw_rect(Rect2(0, edge, edge, size.y - edge * 2.0), col)
		draw_rect(Rect2(size.x - edge, edge, edge, size.y - edge * 2.0), col)


class ClockWidget extends Control:
	var sim: DSTWorldSim

	func _draw() -> void:
		if sim == null:
			return
		var center: Vector2 = size * 0.5
		var radius: float = min(size.x, size.y) * 0.44
		draw_circle(center, radius + 5.0, Color(0.11, 0.09, 0.08, 0.92))
		var segs: Dictionary = sim.get_season_segs()
		var d_n: int = int(segs["day"])
		var u_n: int = int(segs["dusk"])
		var total_segs: int = 16
		for i in range(total_segs):
			var a0: float = -PI * 0.5 + (float(i) / float(total_segs)) * TAU
			var a1: float = -PI * 0.5 + (float(i + 1) / float(total_segs)) * TAU
			var col: Color = Color(0.87, 0.68, 0.24) if i < d_n else (Color(0.68, 0.30, 0.18) if i < d_n + u_n else Color(0.14, 0.20, 0.34))
			var pts: PackedVector2Array = PackedVector2Array([center])
			for k in range(5):
				var ang: float = lerp(a0, a1, float(k) / 4.0)
				pts.append(center + Vector2(cos(ang), sin(ang)) * radius)
			draw_colored_polygon(pts, col)
			draw_line(center, center + Vector2(cos(a0), sin(a0)) * radius, Color(0.08, 0.07, 0.06), 1.4)

		var prog: float = sim.time_in_day / float(sim.db.data["clock"]["total_day_time"])
		var hand_ang: float = -PI * 0.5 + prog * TAU
		draw_line(center, center + Vector2(cos(hand_ang), sin(hand_ang)) * (radius * 0.92), Color(1.0, 0.95, 0.8), 3.0)
		draw_circle(center, radius * 0.40, Color(0.14, 0.12, 0.10, 0.95))
		draw_arc(center, radius, 0.0, TAU, 48, Color(0.76, 0.62, 0.38), 2.5)


class BadgesWidget extends Control:
	var sim: DSTWorldSim

	func _draw() -> void:
		if sim == null:
			return
		var specs: Array = [
			{"ratio": sim.health / max(1.0, sim.max_health), "pen": sim.health_penalty, "col": Color(0.84, 0.20, 0.20), "lbl": "HP %.0f" % sim.health},
			{"ratio": sim.hunger / max(1.0, sim.max_hunger), "pen": 0.0, "col": Color(0.90, 0.64, 0.18), "lbl": "HU %.0f" % sim.hunger},
			{"ratio": sim.sanity / max(1.0, sim.max_sanity), "pen": 0.0, "col": Color(0.32, 0.78, 0.94) if sim.sanity_mode == 1 else Color(0.88, 0.42, 0.26), "lbl": ("LU %.0f" if sim.sanity_mode == 1 else "SA %.0f") % sim.sanity},
		]
		var r: float = 24.0
		var y: float = size.y * 0.5
		var spacing: float = size.x / 3.0
		var font: Font = ThemeDB.fallback_font
		for i in range(3):
			var sp: Dictionary = specs[i]
			var cx: float = spacing * (float(i) + 0.5)
			var c: Vector2 = Vector2(cx, y)
			draw_circle(c, r + 3.0, Color(0.12, 0.10, 0.09, 0.95))
			draw_circle(c, r, Color(0.22, 0.19, 0.17, 0.95))
			var fill_r: float = clamp(float(sp["ratio"]), 0.0, 1.0)
			if fill_r > 0.01:
				var end_ang: float = -PI * 0.5 + fill_r * TAU
				var pts: PackedVector2Array = PackedVector2Array([c])
				for s in range(19):
					var a: float = lerp(-PI * 0.5, end_ang, float(s) / 18.0)
					pts.append(c + Vector2(cos(a), sin(a)) * (r - 2.0))
				draw_colored_polygon(pts, sp["col"])
			draw_arc(c, r, 0.0, TAU, 32, Color(0.76, 0.62, 0.38), 2.0)
			draw_string(font, Vector2(cx - 21.0, y + 4.0), str(sp["lbl"]), HORIZONTAL_ALIGNMENT_CENTER, 42.0, 11, Color(1.0, 0.98, 0.92))


class MinimapWidget extends Control:
	var sim: DSTWorldSim

	func _draw() -> void:
		if sim == null:
			return
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.08, 0.17, 0.26, 0.94))
		var c: Vector2 = size * 0.5
		var scale_f: float = (min(size.x, size.y) * 0.45) / 68.0
		# 본토 섬 윤곽 & 바이옴 구역
		draw_circle(c, 54.0 * scale_f, Color(0.29, 0.42, 0.21, 0.95))
		draw_circle(c + Vector2(-24.0, 22.0) * scale_f, 18.0 * scale_f, Color(0.16, 0.26, 0.15, 0.9))
		draw_circle(c + Vector2(24.0, 20.0) * scale_f, 17.0 * scale_f, Color(0.58, 0.48, 0.24, 0.9))
		draw_circle(c + Vector2(-24.0, -20.0) * scale_f, 16.0 * scale_f, Color(0.42, 0.40, 0.37, 0.9))
		draw_circle(c + Vector2(36.0, -28.0) * scale_f, 14.0 * scale_f, Color(0.66, 0.78, 0.84, 0.95))

		# 구조물 (주황/노랑)
		for st in sim.structures:
			var p: Vector2 = c + st["pos"] * scale_f
			var scol: Color = Color(1.0, 0.58, 0.15) if str(st["kind"]) == "campfire" else Color(0.95, 0.88, 0.42)
			draw_circle(p, 3.2, scol)
		# 농경지 (초록 사각)
		for fp in sim.farm_plots:
			var p: Vector2 = c + fp["pos"] * scale_f
			draw_rect(Rect2(p - Vector2(2.5, 2.5), Vector2(5.0, 5.0)), Color(0.45, 0.90, 0.35))
		# 보트 (하늘색 사각)
		if sim.boat_active:
			var bp: Vector2 = c + sim.boat_pos * scale_f
			draw_rect(Rect2(bp - Vector2(3.0, 3.0), Vector2(6.0, 6.0)), Color(0.50, 0.92, 1.0))
		# 생물 & 보스 (빨강)
		for cr in sim.creatures:
			var cp: Vector2 = c + cr["pos"] * scale_f
			var is_b: bool = bool(cr.get("boss", false))
			draw_circle(cp, 4.5 if is_b else 2.0, Color(1.0, 0.22, 0.22) if is_b else Color(0.95, 0.45, 0.35))
		# 플레이어 (흰색 + 검정 테두리)
		var pp: Vector2 = c + sim.player_pos * scale_f
		draw_circle(pp, 4.0, Color(0.05, 0.05, 0.05))
		draw_circle(pp, 2.8, Color(1.0, 1.0, 1.0))
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.76, 0.62, 0.38), false, 2.0)


func setup(world_sim: DSTWorldSim, on_action: Callable) -> void:
	sim = world_sim
	action_callback = on_action
	_build_ui()
	refresh()


func toggle_skill_panel() -> void:
	if skill_panel != null:
		skill_panel.visible = not skill_panel.visible
		refresh()


func toggle_minimap() -> void:
	if minimap_panel != null:
		minimap_panel.visible = not minimap_panel.visible


func _build_ui() -> void:
	# 0. 전체 화면 상태 비네트 (마우스 통과)
	var vig: StatusVignette = StatusVignette.new()
	vig.sim = sim
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vig)
	vignette_ctrl = vig

	# 0b. 상단 중앙 보스 대형 체력바
	boss_panel = PanelContainer.new()
	boss_panel.anchor_left = 0.5
	boss_panel.anchor_right = 0.5
	boss_panel.offset_left = -220
	boss_panel.offset_right = 220
	boss_panel.offset_top = 12
	boss_panel.offset_bottom = 66
	boss_panel.visible = false
	add_child(boss_panel)
	var bbox: VBoxContainer = VBoxContainer.new()
	boss_panel.add_child(bbox)
	boss_label = Label.new()
	boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bbox.add_child(boss_label)
	boss_bar = ProgressBar.new()
	boss_bar.show_percentage = false
	boss_bar.custom_minimum_size = Vector2(420, 18)
	var bb_bg: StyleBoxFlat = StyleBoxFlat.new()
	bb_bg.bg_color = Color(0.14, 0.11, 0.10, 0.95)
	bb_bg.corner_radius_top_left = 4
	bb_bg.corner_radius_top_right = 4
	bb_bg.corner_radius_bottom_left = 4
	bb_bg.corner_radius_bottom_right = 4
	var bb_fill: StyleBoxFlat = StyleBoxFlat.new()
	bb_fill.bg_color = Color(0.84, 0.18, 0.20, 1.0)
	bb_fill.corner_radius_top_left = 4
	bb_fill.corner_radius_top_right = 4
	bb_fill.corner_radius_bottom_left = 4
	bb_fill.corner_radius_bottom_right = 4
	boss_bar.add_theme_stylebox_override("background", bb_bg)
	boss_bar.add_theme_stylebox_override("fill", bb_fill)
	bbox.add_child(boss_bar)

	# 1. 좌측 제작 사이드바 (원작 아이콘)
	var left_panel: PanelContainer = PanelContainer.new()
	left_panel.position = Vector2(12, 12)
	left_panel.custom_minimum_size = Vector2(236, 560)
	add_child(left_panel)

	var left_scroll: ScrollContainer = ScrollContainer.new()
	left_panel.add_child(left_scroll)
	recipe_box = VBoxContainer.new()
	recipe_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_scroll.add_child(recipe_box)

	var craft_title: Label = Label.new()
	craft_title.text = "제작 메뉴 (Crafting)"
	recipe_box.add_child(craft_title)

	for r in sim.db.data.get("recipes", []):
		var rid: String = str(r["id"])
		var btn: Button = Button.new()
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.text = str(r["name"])
		var ic: Texture2D = DSTMedia.get_icon_texture(rid)
		if ic != null:
			btn.icon = ic
			btn.expand_icon = true
		btn.custom_minimum_size = Vector2(214, 28)
		btn.pressed.connect(func() -> void: action_callback.call("craft", rid))
		recipe_box.add_child(btn)
		recipe_buttons[rid] = btn

	# 2. 우측 상단 시계 + 원작 캐릭터 초상화 + 3대 원형 배지 + 미니맵
	var right_panel: PanelContainer = PanelContainer.new()
	right_panel.anchor_left = 1.0
	right_panel.anchor_right = 1.0
	right_panel.offset_left = -316
	right_panel.offset_right = -12
	right_panel.offset_top = 12
	right_panel.offset_bottom = 398
	add_child(right_panel)

	var rbox: VBoxContainer = VBoxContainer.new()
	right_panel.add_child(rbox)

	var top_row: HBoxContainer = HBoxContainer.new()
	rbox.add_child(top_row)

	var cw: ClockWidget = ClockWidget.new()
	cw.sim = sim
	cw.custom_minimum_size = Vector2(104, 104)
	top_row.add_child(cw)
	clock_panel = cw

	portrait_rect = TextureRect.new()
	portrait_rect.custom_minimum_size = Vector2(78, 78)
	portrait_rect.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	top_row.add_child(portrait_rect)

	var mm: MinimapWidget = MinimapWidget.new()
	mm.sim = sim
	mm.custom_minimum_size = Vector2(104, 104)
	top_row.add_child(mm)
	minimap_panel = mm

	var bw: BadgesWidget = BadgesWidget.new()
	bw.sim = sim
	bw.custom_minimum_size = Vector2(288, 60)
	rbox.add_child(bw)
	badge_panel = bw

	stats_label = Label.new()
	stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	stats_label.add_theme_font_size_override("font_size", 12)
	rbox.add_child(stats_label)

	# 3. 우측 하단 빠른 액션 / 시나리오 & 로그
	var tool_panel: PanelContainer = PanelContainer.new()
	tool_panel.anchor_left = 1.0
	tool_panel.anchor_right = 1.0
	tool_panel.anchor_top = 1.0
	tool_panel.anchor_bottom = 1.0
	tool_panel.offset_left = -316
	tool_panel.offset_right = -12
	tool_panel.offset_top = -310
	tool_panel.offset_bottom = -12
	add_child(tool_panel)

	var tbox: VBoxContainer = VBoxContainer.new()
	tool_panel.add_child(tbox)

	var row1: HBoxContainer = HBoxContainer.new()
	tbox.add_child(row1)
	_add_small_btn(row1, "요리(미트볼/피에로기)", "cook_meatballs")
	_add_small_btn(row1, "스킬트리(K)", "toggle_skills")

	var row2: HBoxContainer = HBoxContainer.new()
	tbox.add_child(row2)
	_add_small_btn(row2, "캐릭터(6인)", "cycle_char")
	_add_small_btn(row2, "보트(B)", "toggle_boat")
	_add_small_btn(row2, "배속(T)", "toggle_speed")

	var row3: HBoxContainer = HBoxContainer.new()
	tbox.add_child(row3)
	_add_small_btn(row3, "외눈사슴", "spawn_deerclops")
	_add_small_btn(row3, "평면보스", "spawn_mutated")
	_add_small_btn(row3, "연금술(G)", "transmute")

	var row4: HBoxContainer = HBoxContainer.new()
	tbox.add_child(row4)
	_add_small_btn(row4, "달섬(계몽)", "teleport_moon")
	_add_small_btn(row4, "본토(광기)", "teleport_home")
	_add_small_btn(row4, "미니맵(M)", "toggle_minimap")

	log_label = Label.new()
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	log_label.add_theme_font_size_override("font_size", 11)
	tbox.add_child(log_label)

	# 4. 하단 원작 PNG 아이콘 클릭형 인벤토리 & 장비 바
	var bottom_panel: PanelContainer = PanelContainer.new()
	bottom_panel.anchor_left = 0.0
	bottom_panel.anchor_right = 1.0
	bottom_panel.anchor_top = 1.0
	bottom_panel.anchor_bottom = 1.0
	bottom_panel.offset_left = 258
	bottom_panel.offset_right = -326
	bottom_panel.offset_top = -120
	bottom_panel.offset_bottom = -12
	add_child(bottom_panel)

	var bot_v: VBoxContainer = VBoxContainer.new()
	bottom_panel.add_child(bot_v)

	equip_label = Label.new()
	equip_label.add_theme_font_size_override("font_size", 12)
	bot_v.add_child(equip_label)

	var inv_scroll: ScrollContainer = ScrollContainer.new()
	inv_scroll.custom_minimum_size = Vector2(400, 56)
	bot_v.add_child(inv_scroll)
	inv_slot_box = HBoxContainer.new()
	inv_scroll.add_child(inv_slot_box)

	var hint_lbl: Label = Label.new()
	hint_lbl.add_theme_font_size_override("font_size", 11)
	hint_lbl.text = "WASD 이동 · Space 채집/부활 · F 공격 · Q/E 회전 · B 보트 · K 스킬트리 · M 미니맵 · 인벤토리 클릭(식사/장착)"
	bot_v.add_child(hint_lbl)

	# 5. 중앙 인사이트 스킬트리 팝업 패널 (K키 토글)
	skill_panel = PanelContainer.new()
	skill_panel.anchor_left = 0.5
	skill_panel.anchor_right = 0.5
	skill_panel.anchor_top = 0.5
	skill_panel.anchor_bottom = 0.5
	skill_panel.offset_left = -210
	skill_panel.offset_right = 210
	skill_panel.offset_top = -170
	skill_panel.offset_bottom = 170
	skill_panel.visible = false
	add_child(skill_panel)

	var sk_box: VBoxContainer = VBoxContainer.new()
	skill_panel.add_child(sk_box)
	skill_points_label = Label.new()
	skill_points_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sk_box.add_child(skill_points_label)

	for sk in sim.db.data.get("skills", []):
		var sid: String = str(sk["id"])
		var sb: Button = Button.new()
		sb.alignment = HORIZONTAL_ALIGNMENT_LEFT
		sb.text = "[%s] %s — %s" % [str(sk["branch"]), str(sk["name"]), str(sk["desc"])]
		sb.pressed.connect(func() -> void: action_callback.call("unlock_skill", sid))
		sk_box.add_child(sb)
		skill_buttons[sid] = sb

	var close_btn: Button = Button.new()
	close_btn.text = "닫기 (K)"
	close_btn.pressed.connect(func() -> void: toggle_skill_panel())
	sk_box.add_child(close_btn)


func _add_small_btn(parent: HBoxContainer, label: String, action: String) -> void:
	var b: Button = Button.new()
	b.text = label
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.add_theme_font_size_override("font_size", 11)
	b.pressed.connect(func() -> void: action_callback.call(action, ""))
	parent.add_child(b)


func refresh() -> void:
	if sim == null:
		return
	if vignette_ctrl != null:
		vignette_ctrl.queue_redraw()
	if clock_panel != null:
		clock_panel.queue_redraw()
	if badge_panel != null:
		badge_panel.queue_redraw()
	if minimap_panel != null and minimap_panel.visible:
		minimap_panel.queue_redraw()
	if portrait_rect != null:
		var ptex: Texture2D = DSTMedia.get_portrait_texture(sim.character_id)
		if ptex != null and portrait_rect.texture != ptex:
			portrait_rect.texture = ptex

	# 보스 대형 체력바 업데이트
	var boss: Dictionary = sim.get_active_boss()
	if not boss.is_empty():
		boss_panel.visible = true
		var ptag: String = " [PLANAR]" if bool(boss.get("planar_entity", false)) else ""
		boss_label.text = "%s%s — %.0f / %.0f HP" % [str(boss["name"]), ptag, max(0.0, float(boss["hp"])), float(boss["max_hp"])]
		boss_bar.max_value = float(boss["max_hp"])
		boss_bar.value = max(0.0, float(boss["hp"]))
	else:
		boss_panel.visible = false

	var cdef: Dictionary = sim.db.data["characters"][sim.character_id]
	var wform: String = (" [%s]" % sim.get_wolfgang_form()) if sim.character_id == "wolfgang" else ""
	var sstate_txt: String = "계몽!" if sim.is_enlightened() else ("광기!" if sim.is_insane() else "정상")
	var ghost_txt: String = (" [유령! 리셋 %.0fs · Space 부활]" % sim.world_reset_countdown) if sim.is_ghost else ""
	var boat_txt: String = (" · 항해중(돛%d)" % sim.boat_masts) if sim.on_boat else ""
	stats_label.text = (
		"Day %d (%s %d일) · %s · 달:%s · %.0f×\n" % [sim.day, sim.get_season_name().to_upper(), sim.day_in_season, sim.phase.to_upper(), sim.moon_phase, sim.time_scale]
		+ "%s%s (%s)%s%s\n" % [str(cdef["name"]), wform, sim.get_biome_at(sim.player_pos), boat_txt, ghost_txt]
		+ "특성: %s\n" % str(cdef.get("trait", ""))
		+ "체온 %.1f°C(세계 %.1f°C) · 습기 %.0f%s · %s · 인사이트 %dpt" % [sim.temperature, sim.world_temperature, sim.moisture, " [젖음]" if sim.is_wet else "", sstate_txt, sim.insight_points]
	)

	var head_str: String = "%s(%.0f)" % [str(sim.equip_head["id"]), float(sim.equip_head["durability"])] if not sim.equip_head.is_empty() else "없음"
	var body_str: String = "%s(%.0f)" % [str(sim.equip_body["id"]), float(sim.equip_body["durability"])] if not sim.equip_body.is_empty() else "없음"
	equip_label.text = "[장비] 손:%s | 머리:%s | 몸통:%s | 테크Lv:%d | 스킬:%d개 | 공격배율:%.2f×" % [
		sim.equip_hands if sim.equip_hands != "" else "맨손",
		head_str, body_str, sim.get_nearby_tech_level(),
		sim.unlocked_skills.size(), sim.get_effective_damage_mult(),
	]

	# 하단 원작 아이콘 클릭형 인벤토리 슬롯 갱신
	for ch in inv_slot_box.get_children():
		ch.queue_free()
	for k in sim.inventory.keys():
		var item_id: String = str(k)
		var cnt: int = int(sim.inventory[k])
		var slot_btn: Button = Button.new()
		slot_btn.custom_minimum_size = Vector2(76, 46)
		slot_btn.add_theme_font_size_override("font_size", 11)
		var ic: Texture2D = DSTMedia.get_icon_texture(item_id)
		if ic != null:
			slot_btn.icon = ic
			slot_btn.expand_icon = true
			slot_btn.text = "×%d" % cnt
		else:
			slot_btn.text = "%s×%d" % [item_id.substr(0, 6), cnt]
		slot_btn.tooltip_text = "%s ×%d (클릭: 식사/장착)" % [item_id, cnt]
		slot_btn.pressed.connect(func() -> void: action_callback.call("use_item", item_id))
		inv_slot_box.add_child(slot_btn)

	for rid in recipe_buttons.keys():
		var btn: Button = recipe_buttons[rid]
		btn.disabled = not sim.can_craft(rid)

	# 스킬트리 팝업 갱신
	if skill_panel != null and skill_panel.visible:
		skill_points_label.text = "인사이트 스킬트리 (보유 포인트: %d / 해금: %d)" % [sim.insight_points, sim.unlocked_skills.size()]
		for sid in skill_buttons.keys():
			var sb: Button = skill_buttons[sid]
			var unlocked: bool = sim.unlocked_skills.has(sid)
			sb.disabled = unlocked or sim.insight_points < 1
			if unlocked and not sb.text.begins_with("[해금]"):
				sb.text = "[해금] " + sb.text

	var recent: Array = sim.event_log.slice(max(0, sim.event_log.size() - 5), sim.event_log.size())
	log_label.text = "\n".join(recent)
