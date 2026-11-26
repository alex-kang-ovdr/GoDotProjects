class_name DSTHud
extends CanvasLayer

## Don't Starve Together 원작 스타일 HUD:
## - 우측 상단: 16세그먼트 원형 시계(낮/황혼/밤 + 달 위상 + 계절/일수) + 4대 생존 배지(체력/허기/정신력·계몽/체온·습기)
## - 좌측: 제작 사이드바(도구/광원/과학기계/무기/방어구/요리냄비/농경지/평면장비)
## - 하단: 인벤토리 바 + 장비 슬롯(Hands/Head/Body) + 이벤트 로그 + 시나리오 컨트롤

var sim: DSTWorldSim
var clock_panel: Control
var stats_label: Label
var inv_label: Label
var log_label: Label
var recipe_box: VBoxContainer
var recipe_buttons: Dictionary = {}
var action_callback: Callable


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

		# 시계 바늘 (현재 하루 진행도)
		var prog: float = sim.time_in_day / float(sim.db.data["clock"]["total_day_time"])
		var hand_ang: float = -PI * 0.5 + prog * TAU
		draw_line(center, center + Vector2(cos(hand_ang), sin(hand_ang)) * (radius * 0.92), Color(1.0, 0.95, 0.8), 3.0)
		draw_circle(center, radius * 0.42, Color(0.14, 0.12, 0.10, 0.95))
		draw_arc(center, radius, 0.0, TAU, 48, Color(0.76, 0.62, 0.38), 2.5)


func setup(world_sim: DSTWorldSim, on_action: Callable) -> void:
	sim = world_sim
	action_callback = on_action
	_build_ui()
	refresh()


func _build_ui() -> void:
	# 1. 좌측 제작 사이드바
	var left_panel: PanelContainer = PanelContainer.new()
	left_panel.position = Vector2(12, 12)
	left_panel.custom_minimum_size = Vector2(236, 520)
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
		btn.pressed.connect(func() -> void: action_callback.call("craft", rid))
		recipe_box.add_child(btn)
		recipe_buttons[rid] = btn

	# 2. 우측 상단 시계 + 생존 배지 패널
	var right_panel: PanelContainer = PanelContainer.new()
	right_panel.anchor_left = 1.0
	right_panel.anchor_right = 1.0
	right_panel.offset_left = -310
	right_panel.offset_right = -12
	right_panel.offset_top = 12
	right_panel.offset_bottom = 350
	add_child(right_panel)

	var rbox: VBoxContainer = VBoxContainer.new()
	right_panel.add_child(rbox)

	var cw: ClockWidget = ClockWidget.new()
	cw.sim = sim
	cw.custom_minimum_size = Vector2(130, 130)
	rbox.add_child(cw)
	clock_panel = cw

	stats_label = Label.new()
	stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	rbox.add_child(stats_label)

	# 3. 우측 하단 시나리오/검증 액션 버튼
	var tool_panel: PanelContainer = PanelContainer.new()
	tool_panel.anchor_left = 1.0
	tool_panel.anchor_right = 1.0
	tool_panel.anchor_top = 1.0
	tool_panel.anchor_bottom = 1.0
	tool_panel.offset_left = -310
	tool_panel.offset_right = -12
	tool_panel.offset_top = -345
	tool_panel.offset_bottom = -12
	add_child(tool_panel)

	var tbox: VBoxContainer = VBoxContainer.new()
	tool_panel.add_child(tbox)

	var q_title: Label = Label.new()
	q_title.text = "빠른 액션 / 시나리오"
	tbox.add_child(q_title)

	var quick_actions: Array = [
		["cook_meatballs", "냄비 요리: 미트볼/피에로기"],
		["cycle_char", "캐릭터 전환 (6인)"],
		["toggle_speed", "시간 배속 전환 (1×/8×)"],
		["spawn_deerclops", "보스 소환: 외눈사슴 (4,000 HP)"],
		["spawn_mutated", "보스 소환: 결정화 외눈사슴 (Planar)"],
		["teleport_moon", "달섬 이동 (달 계몽 모드)"],
		["teleport_home", "본토 복귀 (광기 모드)"],
	]
	for qa in quick_actions:
		var aid: String = str(qa[0])
		var b: Button = Button.new()
		b.text = str(qa[1])
		b.pressed.connect(func() -> void: action_callback.call(aid, ""))
		tbox.add_child(b)

	log_label = Label.new()
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	log_label.add_theme_font_size_override("font_size", 11)
	tbox.add_child(log_label)

	# 4. 하단 인벤토리 & 조작 안내 바
	var bottom_panel: PanelContainer = PanelContainer.new()
	bottom_panel.anchor_left = 0.0
	bottom_panel.anchor_right = 1.0
	bottom_panel.anchor_top = 1.0
	bottom_panel.anchor_bottom = 1.0
	bottom_panel.offset_left = 260
	bottom_panel.offset_right = -322
	bottom_panel.offset_top = -126
	bottom_panel.offset_bottom = -12
	add_child(bottom_panel)

	inv_label = Label.new()
	inv_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	bottom_panel.add_child(inv_label)


func refresh() -> void:
	if sim == null:
		return
	if clock_panel != null:
		clock_panel.queue_redraw()

	var smode_txt: String = "달 계몽(LUNACY)" if sim.sanity_mode == 1 else "정신력(INSANITY)"
	var sstate_txt: String = "계몽!" if sim.is_enlightened() else ("광기!" if sim.is_insane() else "정상")
	var ghost_txt: String = (" [유령! 리셋 %.0fs · Space 부활]" % sim.world_reset_countdown) if sim.is_ghost else ""
	stats_label.text = (
		"Day %d (%s %d일차) · %s · 달:%s · %.0f×\n" % [sim.day, sim.get_season_name().to_upper(), sim.day_in_season, sim.phase.to_upper(), sim.moon_phase, sim.time_scale]
		+ "캐릭터: %s (%s)%s\n" % [str(sim.db.data["characters"][sim.character_id]["name"]), sim.get_biome_at(sim.player_pos), ghost_txt]
		+ "체력: %.0f / %.0f (페널티 %.0f%%)\n" % [sim.health, sim.get_max_health_with_penalty(), sim.health_penalty * 100.0]
		+ "허기: %.0f / %.0f\n" % [sim.hunger, sim.max_hunger]
		+ "%s: %.0f / %.0f [%s]\n" % [smode_txt, sim.sanity, sim.max_sanity, sstate_txt]
		+ "체온: %.1f°C (세계 %.1f°C) · 습기: %.0f%s" % [sim.temperature, sim.world_temperature, sim.moisture, " [젖음]" if sim.is_wet else ""]
	)

	var head_str: String = "%s(%.0f)" % [str(sim.equip_head["id"]), float(sim.equip_head["durability"])] if not sim.equip_head.is_empty() else "없음"
	var body_str: String = "%s(%.0f)" % [str(sim.equip_body["id"]), float(sim.equip_body["durability"])] if not sim.equip_body.is_empty() else "없음"
	var items_arr: Array = []
	for k in sim.inventory.keys():
		items_arr.append("%s×%d" % [str(k), int(sim.inventory[k])])
	inv_label.text = (
		"[장비] 손: %s | 머리: %s | 몸통: %s | 테크Lv: %d\n" % [sim.equip_hands if sim.equip_hands != "" else "맨손", head_str, body_str, sim.get_nearby_tech_level()]
		+ "[인벤토리] " + ", ".join(items_arr) + "\n"
		+ "[조작] WASD 이동 · Space 채집/돌봄/부활 · F 공격 · Q/E 카메라 회전 · 휠 줌 · 1~4 식사(베리/당근/미트볼/피에로기)"
	)

	for rid in recipe_buttons.keys():
		var btn: Button = recipe_buttons[rid]
		btn.disabled = not sim.can_craft(rid)

	var recent: Array = sim.event_log.slice(max(0, sim.event_log.size() - 5), sim.event_log.size())
	log_label.text = "\n".join(recent)
