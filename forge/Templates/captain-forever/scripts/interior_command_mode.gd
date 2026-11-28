class_name InteriorCommandMode
extends Node2D

## 함내 통합 관제 모드 (2배 확대 UI·폰트 + 도구/시나리오 접이식 드로어 배치 정리).

const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const BalanceData = preload("res://scripts/balance.gd")
const ShipModelScript = preload("res://scripts/ship_model.gd")
const BlueprintLib = preload("res://scripts/blueprint_library.gd")
const InteriorSimScript = preload("res://scripts/ship_interior_sim.gd")
const FtlCrew = preload("res://scripts/ftl_crew_assets.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const SURFACE := Color(0.05, 0.11, 0.18, 0.96)
const EDGE := Color(0.24, 0.62, 0.84, 0.88)
const WHITE := Color("#e4f4ff")
const SOFT := Color("#9ec4da")
const GREEN := Color("#74f2ce")
const GOLD := Color("#ffd175")
const RED := Color("#ff6e66")

const TOOL_SPECS := [
	["move_crew", "승조원 이동"],
	["cool_pipe", "냉각 파이프"],
	["bulkhead_door", "격벽 해치"],
	["bulkhead_firewall", "방화벽 보강"],
	["wire_1", "소형 에너지배관"],
	["wire_2", "중형 에너지배관"],
	["wire_3", "대형 에너지배관"],
	["wire_dir", "배관 방향회전"],
	["wire_0", "에너지배관 철거"],
	["build_cooler", "건설: 냉각기"],
	["build_corridor", "건설: 복도"],
	["deconstruct_corridor", "복도 차단실험"],
]

class CutawayCanvas extends Control:
	var host: InteriorCommandMode = null
	var view_scale := 1.45
	var hovered_cell := Vector2i(999, 999)
	var hovered_edge_a := Vector2i(999, 999)
	var hovered_edge_b := Vector2i(999, 999)

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_STOP
		custom_minimum_size = Vector2(0, 180)

	func _ship_bounds_cells() -> Rect2:
		if host == null or host.ship_model == null or host.ship_model.parts.is_empty():
			return Rect2(-5, -3, 10, 6)
		return host.ship_model.cell_bounds_rect()

	func grid_origin() -> Vector2:
		var b := _ship_bounds_cells()
		var center_world := b.get_center() * BalanceData.CELL
		return size * 0.5 - center_world * view_scale

	func screen_to_cell(local_pos: Vector2) -> Vector2i:
		var rel := (local_pos - grid_origin()) / (BalanceData.CELL * view_scale)
		return Vector2i(roundi(rel.x), roundi(rel.y))

	func screen_to_edge(local_pos: Vector2) -> Array[Vector2i]:
		var rel := (local_pos - grid_origin()) / (BalanceData.CELL * view_scale)
		var cx := roundi(rel.x)
		var cy := roundi(rel.y)
		var base := Vector2i(cx, cy)
		var dx := rel.x - float(cx)
		var dy := rel.y - float(cy)
		var nb := base + (Vector2i(1 if dx >= 0.0 else -1, 0) if absf(dx) >= absf(dy) else Vector2i(0, 1 if dy >= 0.0 else -1))
		return [base, nb]

	func _gui_input(event: InputEvent) -> void:
		if host == null:
			return
		if event is InputEventMouseMotion:
			hovered_cell = screen_to_cell(event.position)
			var ed := screen_to_edge(event.position)
			hovered_edge_a = ed[0]
			hovered_edge_b = ed[1]
			queue_redraw()
		elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			var ed := screen_to_edge(event.position)
			host.on_canvas_tap(screen_to_cell(event.position), ed[0], ed[1])
			accept_event()
		elif event is InputEventScreenTouch and event.pressed:
			hovered_cell = screen_to_cell(event.position)
			var ed := screen_to_edge(event.position)
			hovered_edge_a = ed[0]
			hovered_edge_b = ed[1]
			host.on_canvas_tap(hovered_cell, ed[0], ed[1])
			accept_event()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#060e18"), true)
		if host == null or host.sim == null or host.ship_model == null:
			return
		var cs := BalanceData.CELL
		var bounds := _ship_bounds_cells()
		var span_px := (bounds.size + Vector2(2.2, 1.8)) * cs
		view_scale = clampf(minf(size.x / maxf(240.0, span_px.x), size.y / maxf(180.0, span_px.y)), 0.24, 1.55)
		var orig := grid_origin()
		draw_set_transform(orig, 0.0, Vector2.ONE * view_scale)

		var gx_min := int(floor(bounds.position.x)) - 2
		var gx_max := int(ceil(bounds.end.x)) + 2
		var gy_min := int(floor(bounds.position.y)) - 2
		var gy_max := int(ceil(bounds.end.y)) + 2
		for gx in range(gx_min, gx_max + 1):
			draw_line(Vector2((float(gx) - 0.5) * cs, (float(gy_min) - 0.5) * cs), Vector2((float(gx) - 0.5) * cs, (float(gy_max) + 0.5) * cs), Color(0.12, 0.24, 0.34, 0.45), 1.0)
		for gy in range(gy_min, gy_max + 1):
			draw_line(Vector2((float(gx_min) - 0.5) * cs, (float(gy) - 0.5) * cs), Vector2((float(gx_max) + 0.5) * cs, (float(gy) - 0.5) * cs), Color(0.12, 0.24, 0.34, 0.45), 1.0)

		for p in host.ship_model.parts:
			var rect := p.cell_bounds_rect()
			var is_cor := ShipInteriorSim.is_corridor_kind(p.kind)
			var fill_col := Color("193244") if is_cor else Color(str(p.spec().get("fill", "283848"))).darkened(0.25)
			var border_col := Color("5ce1ff") if is_cor else Color(str(p.spec().get("stroke", "7ea8c4")))
			draw_rect(rect.grow(-1.0), fill_col, true)
			var ctex := CosmoteerAssets.get_part_texture(p.kind, "cutaway")
			if ctex != null:
				var center := rect.get_center()
				var rot := float(p.quarter_turn) * PI * 0.5
				draw_set_transform(orig + center * view_scale, rot, Vector2.ONE * view_scale)
				var dsize := Vector2(rect.size.y, rect.size.x) if (posmod(p.quarter_turn, 2) == 1) else rect.size
				draw_texture_rect(ctex, Rect2(-dsize * 0.48, dsize * 0.96), false, Color.WHITE)
				draw_set_transform(orig, 0.0, Vector2.ONE * view_scale)
			if p.kind == "cosmo_conveyor":
				var cc := rect.get_center()
				var cdir := Vector2.UP.rotated(float(p.quarter_turn) * PI * 0.5)
				var cp := Vector2(-cdir.y, cdir.x)
				draw_line(cc - cdir * 6.0 - cp * 6.0, cc + cdir * 6.0, Color("74f2ce"), 2.2)
				draw_line(cc - cdir * 6.0 + cp * 6.0, cc + cdir * 6.0, Color("74f2ce"), 2.2)
			draw_rect(rect.grow(-1.0), border_col, false, 1.8 if is_cor else 1.3)

			var hpr := clampf(p.hp / maxf(1.0, p.max_hp), 0.0, 1.0)
			if hpr < 0.99:
				var hb := Rect2(rect.get_center() + Vector2(-15, 13), Vector2(30, 3.8))
				draw_rect(hb, Color(0.05, 0.07, 0.12, 0.92), true)
				draw_rect(Rect2(hb.position, Vector2(30.0 * hpr, 3.8)), GREEN if hpr > 0.5 else RED, true)

		host.sim.draw_interior_overlays(self, Vector2.ZERO, host.show_power_overlay, 32.0)

		var hover_box := bounds.grow(1.5)
		if host.active_tool in ["bulkhead_door", "bulkhead_firewall"] and hover_box.has_point(Vector2(hovered_edge_a)):
			var emid := (Vector2(hovered_edge_a) + Vector2(hovered_edge_b)) * 0.5 * cs
			var ediff := hovered_edge_b - hovered_edge_a
			var etan := Vector2(-float(ediff.y), float(ediff.x)) * (cs * 0.48)
			var ecol := Color("ff9e3d") if host.active_tool == "bulkhead_firewall" else Color("6ef2ff")
			draw_line(emid - etan, emid + etan, ecol, 4.2)
		elif hover_box.has_point(Vector2(hovered_cell)):
			var hr := Rect2((Vector2(hovered_cell) - Vector2(0.5, 0.5)) * cs, Vector2(cs, cs))
			draw_rect(hr, Color(1.0, 0.92, 0.45, 0.55), false, 2.0)

		draw_set_transform(Vector2.ZERO)

var ship_model: ShipModel
var sim: ShipInteriorSim
var sfx: CosmoteerSfx
var mode_switcher: ModeSwitcher

var _ui_layer: CanvasLayer
var _ui_font: Font
var _ui_theme: Theme
var _main_panel: PanelContainer
var _body_split: BoxContainer
var _side_panel: PanelContainer
var _side_scroll: ScrollContainer
var _quick_dock: PanelContainer
var _q_build_btn: Button
var canvas_view: CutawayCanvas

var _tools_drawer_panel: PanelContainer
var _scenarios_drawer_panel: PanelContainer
var _tools_grid: GridContainer
var _scenarios_grid: GridContainer
var _btn_open_tools: Button
var _btn_open_scenarios: Button
var open_sub_drawer := "" # "", "tools", "scenarios"

var show_power_overlay := true
var active_tool := "move_crew"
var _tool_buttons: Dictionary = {}
var _crew_box: VBoxContainer
var _header_label: Label
var _power_summary_label: Label
var _log_label: Label
var current_preset_id := "oni_ftl_flagship"

func _ready() -> void:
	CosmoteerAssets.ensure_loaded()
	FtlCrew.ensure_loaded()
	_load_font()
	sfx = CosmoteerSfx.new()
	add_child(sfx)

	mode_switcher = ModeSwitcherScript.new()
	add_child(mode_switcher)
	mode_switcher.setup("interior_command")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	_init_flagship()
	_build_ui()
	_refresh_crew_cards()
	_update_tool_highlights()
	_sync_responsive_layout()

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _init_flagship() -> void:
	load_ship_preset("oni_ftl_flagship")

func load_ship_preset(preset_id: String) -> void:
	current_preset_id = preset_id
	ship_model = ShipModelScript.new()
	var preset := BlueprintLib.get_preset_by_id(preset_id)
	var typed := BlueprintLib.to_typed_blueprint(preset.get("parts", [])) if not preset.is_empty() else ([] as Array[Dictionary])
	if typed.is_empty():
		ship_model.initialize_default_player()
	else:
		ship_model.restore_from_blueprint(typed)
		var preset_wires := BlueprintLib.to_wires_dict(preset.get("wires", []))
		if not preset_wires.is_empty():
			ship_model.wires = preset_wires
		var preset_pipes := BlueprintLib.to_cooling_pipes_dict(preset.get("cooling_pipes", []))
		if not preset_pipes.is_empty():
			ship_model.cooling_pipes = preset_pipes
		var preset_bh := BlueprintLib.to_bulkheads_dict(preset.get("bulkheads", []))
		if not preset_bh.is_empty():
			ship_model.bulkheads = preset_bh
	sim = InteriorSimScript.new()
	sim.attach_model(ship_model, true)
	if preset_id == "colossal_dreadnought" or preset_id.begins_with("super_"):
		sim.add_crew_member("rock", Vector2i(2, 0), true)
		sim.add_crew_member("engi", Vector2i(-4, 0), true)
	sim.on_structure_changed = func() -> void:
		if canvas_view != null:
			canvas_view.queue_redraw()
	var wstats := sim.get_wiring_efficiency_stats()
	sim.log_event("%s 가동: %d회로 · 재료 %.0fkg (-%.0f%%) · 설치 %.1fs" % [
		str(preset.get("name", preset_id)), sim.circuits.size(),
		float(wstats.total_metal_kg), float(wstats.metal_saved_pct), float(wstats.total_build_time_s)
	])
	_refresh_crew_cards()
	if canvas_view != null:
		canvas_view.queue_redraw()

func _make_style(bg: Color, border: Color, radius: int = 10, margin: int = 8) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, margin, margin, 2)

func _make_btn(caption: String, cb: Callable, accent := false, clip := true) -> Button:
	var b := Button.new()
	b.text = caption
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 48)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.clip_text = clip
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_color_override("font_color", GREEN if accent else WHITE)
	b.add_theme_stylebox_override("normal", _make_style(Color(0.08, 0.24, 0.22, 0.96) if accent else Color(0.07, 0.14, 0.24, 0.94), GREEN if accent else EDGE, 8, 6))
	b.pressed.connect(cb)
	return b

func _active_tool_label() -> String:
	for ts in TOOL_SPECS:
		if str(ts[0]) == active_tool:
			return str(ts[1])
	return "승조원 이동"

func _toggle_sub_drawer(which: String) -> void:
	open_sub_drawer = "" if open_sub_drawer == which else which
	_update_tool_highlights()

func _build_ui() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 10
	add_child(_ui_layer)

	var bg := ColorRect.new()
	bg.color = Color("#040912")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui_layer.add_child(bg)

	_main_panel = PanelContainer.new()
	if _ui_theme != null:
		_main_panel.theme = _ui_theme
	_main_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.07, 0.13, 0.96), Color(0.32, 0.78, 0.98, 0.88), 12, 10))
	_ui_layer.add_child(_main_panel)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 7)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_panel.add_child(root)

	var hdr := HBoxContainer.new()
	hdr.add_theme_constant_override("separation", 8)
	root.add_child(hdr)

	_header_label = Label.new()
	_header_label.text = "함내 통합 관제 · ONI 전력/냉각 · FTL 승조원 · 격벽"
	_header_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_label.clip_text = true
	_header_label.add_theme_font_size_override("font_size", 26)
	_header_label.add_theme_color_override("font_color", GOLD)
	hdr.add_child(_header_label)

	var ov_btn := _make_btn("전력망: ON", func() -> void:
		show_power_overlay = not show_power_overlay
		if canvas_view != null:
			canvas_view.queue_redraw(), true)
	ov_btn.pressed.connect(func() -> void: ov_btn.text = "전력망: ON" if show_power_overlay else "전력망: OFF")
	ov_btn.size_flags_horizontal = Control.SIZE_SHRINK_END
	ov_btn.custom_minimum_size = Vector2(148, 46)
	hdr.add_child(ov_btn)

	_body_split = BoxContainer.new()
	_body_split.vertical = false
	_body_split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_split.add_theme_constant_override("separation", 8)
	root.add_child(_body_split)

	# 좌측: 함선 단면도 + 접이식 2배 도구/시나리오 드로어 + 하단 4버튼 제어 바
	var left_panel := PanelContainer.new()
	left_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(left_panel)

	var left_col := VBoxContainer.new()
	left_col.add_theme_constant_override("separation", 6)
	left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_panel.add_child(left_col)

	canvas_view = CutawayCanvas.new()
	canvas_view.host = self
	canvas_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_col.add_child(canvas_view)

	# 접이식 설비 도구 드로어
	_tools_drawer_panel = PanelContainer.new()
	_tools_drawer_panel.visible = false
	_tools_drawer_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.15, 0.98), GOLD, 10, 8))
	left_col.add_child(_tools_drawer_panel)

	var t_scroll := FlickScrollScript.new()
	t_scroll.custom_minimum_size = Vector2(0, 152)
	t_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tools_drawer_panel.add_child(t_scroll)

	_tools_grid = GridContainer.new()
	_tools_grid.columns = 3
	_tools_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tools_grid.add_theme_constant_override("h_separation", 6)
	_tools_grid.add_theme_constant_override("v_separation", 6)
	t_scroll.add_child(_tools_grid)

	for tspec in TOOL_SPECS:
		var tid := str(tspec[0])
		var tb := _make_btn(str(tspec[1]), func() -> void:
			active_tool = tid
			open_sub_drawer = ""
			_update_tool_highlights())
		_tools_grid.add_child(tb)
		_tool_buttons[tid] = tb

	# 접이식 실전 시나리오 드로어
	_scenarios_drawer_panel = PanelContainer.new()
	_scenarios_drawer_panel.visible = false
	_scenarios_drawer_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.15, 0.98), GREEN, 10, 8))
	left_col.add_child(_scenarios_drawer_panel)

	var s_scroll := FlickScrollScript.new()
	s_scroll.custom_minimum_size = Vector2(0, 152)
	s_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scenarios_drawer_panel.add_child(s_scroll)

	_scenarios_grid = GridContainer.new()
	_scenarios_grid.columns = 3
	_scenarios_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scenarios_grid.add_theme_constant_override("h_separation", 6)
	_scenarios_grid.add_theme_constant_override("v_separation", 6)
	s_scroll.add_child(_scenarios_grid)

	_scenarios_grid.add_child(_make_btn("전력망 효율화", func() -> void:
		sim.optimize_wire_gauges()
		open_sub_drawer = ""
		_update_tool_highlights()
		if canvas_view != null:
			canvas_view.queue_redraw(), true))
	_scenarios_grid.add_child(_make_btn("생화학 가스 피격", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		_trigger_biochemical_hit()))
	var lock_btn := _make_btn("전체 격벽 잠금", func() -> void:
		sim.set_all_doors_locked(not sim.doors_master_locked)
		if canvas_view != null:
			canvas_view.queue_redraw())
	lock_btn.pressed.connect(func() -> void:
		lock_btn.text = "전체 격벽 개방" if sim.doors_master_locked else "전체 격벽 잠금")
	_scenarios_grid.add_child(lock_btn)
	_scenarios_grid.add_child(_make_btn("탄약 소모·보급", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		_trigger_ammo_resupply_test()))
	_scenarios_grid.add_child(_make_btn("원자로 대폭발!", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		_trigger_reactor_meltdown()))
	_scenarios_grid.add_child(_make_btn("피격 배관파괴", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		_trigger_attack_pipe_damage()))
	_scenarios_grid.add_child(_make_btn("전력 방전->입자충전", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		if sim != null:
			sim.drain_all_consumer_buffers()
		if sfx != null:
			sfx.play("shield_down"), true))
	_scenarios_grid.add_child(_make_btn("FTL 침투조 투입", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		_trigger_boarder_attack()))
	_scenarios_grid.add_child(_make_btn("승조원 전투실험실", func() -> void:
		get_tree().change_scene_to_file("res://scenes/crew_combat_lab_mode.tscn"), true))
	_scenarios_grid.add_child(_make_btn("기함 초기화", func() -> void:
		open_sub_drawer = ""
		_update_tool_highlights()
		load_ship_preset(current_preset_id)))

	# 하단 깔끔한 4버튼 대형 커맨드 바
	var cmd_bar := HFlowContainer.new()
	cmd_bar.add_theme_constant_override("h_separation", 6)
	cmd_bar.add_theme_constant_override("v_separation", 6)
	left_col.add_child(cmd_bar)

	_btn_open_tools = _make_btn("도구: 승조원 이동 ▲", func() -> void: _toggle_sub_drawer("tools"))
	_btn_open_tools.custom_minimum_size = Vector2(180, 52)
	cmd_bar.add_child(_btn_open_tools)

	_btn_open_scenarios = _make_btn("실전 시나리오 ▲", func() -> void: _toggle_sub_drawer("scenarios"), true)
	_btn_open_scenarios.custom_minimum_size = Vector2(154, 52)
	cmd_bar.add_child(_btn_open_scenarios)

	var b_dread := _make_btn("드레드노트", func() -> void: load_ship_preset("colossal_dreadnought"))
	b_dread.custom_minimum_size = Vector2(124, 52)
	cmd_bar.add_child(b_dread)

	var b_lev := _make_btn("1.5배 레비아탄", func() -> void: load_ship_preset("super_leviathan_15x"), true)
	b_lev.custom_minimum_size = Vector2(142, 52)
	cmd_bar.add_child(b_lev)

	# 우측: ONI 전력·냉각 계기판 + FTL 승조원 카드 + 로그
	_side_panel = PanelContainer.new()
	_side_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_side_panel)

	_side_scroll = FlickScrollScript.new()
	_side_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_side_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_side_panel.add_child(_side_scroll)

	var side_col := VBoxContainer.new()
	side_col.add_theme_constant_override("separation", 8)
	side_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_side_scroll.add_child(side_col)

	var pwr_hdr := Label.new()
	pwr_hdr.text = "1방향 에너지 배관 · 냉각 계기판"
	pwr_hdr.add_theme_font_size_override("font_size", 23)
	pwr_hdr.add_theme_color_override("font_color", GOLD)
	side_col.add_child(pwr_hdr)

	_power_summary_label = Label.new()
	_power_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_power_summary_label.add_theme_font_size_override("font_size", 19)
	_power_summary_label.add_theme_color_override("font_color", GREEN)
	side_col.add_child(_power_summary_label)

	var crew_hdr := Label.new()
	crew_hdr.text = "FTL 승조원 부대 (터치 후 구획 이동)"
	crew_hdr.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	crew_hdr.add_theme_font_size_override("font_size", 22)
	crew_hdr.add_theme_color_override("font_color", GOLD)
	side_col.add_child(crew_hdr)

	_crew_box = VBoxContainer.new()
	_crew_box.add_theme_constant_override("separation", 6)
	_crew_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side_col.add_child(_crew_box)

	var log_hdr := Label.new()
	log_hdr.text = "실시간 함내 관제 기록"
	log_hdr.add_theme_font_size_override("font_size", 21)
	log_hdr.add_theme_color_override("font_color", GOLD)
	side_col.add_child(log_hdr)

	_log_label = Label.new()
	_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log_label.add_theme_font_size_override("font_size", 18)
	_log_label.add_theme_color_override("font_color", SOFT)
	side_col.add_child(_log_label)

	# 하단 좌측 바로가기 독
	_quick_dock = PanelContainer.new()
	if _ui_theme != null:
		_quick_dock.theme = _ui_theme
	_quick_dock.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.88), 12, 6))
	_ui_layer.add_child(_quick_dock)

	var qrow := HBoxContainer.new()
	qrow.add_theme_constant_override("separation", 6)
	_quick_dock.add_child(qrow)
	var b_main := _make_btn("정식 맵", func() -> void: get_tree().change_scene_to_file("res://scenes/main.tscn"), true)
	b_main.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_main)
	_q_build_btn = _make_btn("빌드 모드", func() -> void: get_tree().change_scene_to_file("res://scenes/build_mode.tscn"))
	_q_build_btn.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(_q_build_btn)
	var b_thr := _make_btn("추진 실험실", func() -> void: get_tree().change_scene_to_file("res://scenes/thruster_lab_mode.tscn"))
	b_thr.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_thr)

func _sync_responsive_layout() -> void:
	if _main_panel == null or get_viewport() == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	var ultra_narrow := vp.x < 640.0
	_main_panel.anchor_left = 0.0
	_main_panel.anchor_right = 1.0
	_main_panel.anchor_top = 0.0
	_main_panel.anchor_bottom = 1.0
	_main_panel.offset_left = 10.0
	_main_panel.offset_right = -10.0
	_main_panel.offset_top = 10.0
	_main_panel.offset_bottom = -102.0

	if _q_build_btn != null:
		_q_build_btn.visible = not narrow
	if _tools_grid != null:
		_tools_grid.columns = 2 if vp.x < 760.0 else 3
	if _scenarios_grid != null:
		_scenarios_grid.columns = 2 if vp.x < 760.0 else 3

	if narrow:
		_body_split.vertical = true
		_side_panel.custom_minimum_size = Vector2(0, clampf(vp.y * 0.25, 210.0, 320.0))
		_side_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_side_panel.size_flags_vertical = Control.SIZE_SHRINK_END
		canvas_view.custom_minimum_size = Vector2(0, clampf(vp.y * 0.28, 220.0, 380.0))

		var ms_w := 256.0 if ultra_narrow else 296.0
		var qw := maxf(200.0, vp.x - ms_w - 28.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0
	else:
		_body_split.vertical = false
		_side_panel.custom_minimum_size = Vector2(clampf(vp.x * 0.31, 360.0, 420.0), 0)
		_side_panel.size_flags_horizontal = Control.SIZE_SHRINK_END
		_side_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		canvas_view.custom_minimum_size = Vector2(0, 180)

		var qw := minf(520.0, vp.x - 340.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0

func _update_tool_highlights() -> void:
	for tid in _tool_buttons.keys():
		var b: Button = _tool_buttons[tid]
		var sel: bool = (str(tid) == active_tool)
		b.add_theme_stylebox_override("normal", _make_style(
			Color(0.12, 0.36, 0.46, 0.96) if sel else Color(0.06, 0.12, 0.21, 0.90),
			GOLD if sel else EDGE, 8, 5))
		b.add_theme_color_override("font_color", GOLD if sel else WHITE)
	if _tools_drawer_panel != null:
		_tools_drawer_panel.visible = (open_sub_drawer == "tools")
	if _scenarios_drawer_panel != null:
		_scenarios_drawer_panel.visible = (open_sub_drawer == "scenarios")
	if _btn_open_tools != null:
		var t_open := (open_sub_drawer == "tools")
		_btn_open_tools.text = "도구: %s %s" % [_active_tool_label(), "▼" if t_open else "▲"]
		_btn_open_tools.add_theme_color_override("font_color", GOLD if t_open else WHITE)
	if _btn_open_scenarios != null:
		var s_open := (open_sub_drawer == "scenarios")
		_btn_open_scenarios.text = "실전 시나리오 %s" % ("▼" if s_open else "▲")

func on_canvas_tap(cell: Vector2i, edge_a: Vector2i = Vector2i.ZERO, edge_b: Vector2i = Vector2i.RIGHT) -> void:
	if sim == null or ship_model == null:
		return
	match active_tool:
		"move_crew":
			for c in sim.crew:
				if bool(c.is_friendly) and float(c.hp) > 0.0 and c.cell == cell and int(c.id) != sim.selected_crew_id:
					sim.select_crew(int(c.id))
					_refresh_crew_cards()
					return
			if sim.selected_crew_id >= 0:
				sim.command_crew_to_cell(sim.selected_crew_id, cell)
		"cool_pipe":
			if sim.cooling_pipes.has(cell):
				sim.set_cooling_pipe(cell, 0)
				sim.log_event("ONI 냉각 파이프 철거: (%d,%d)" % [cell.x, cell.y])
			else:
				sim.set_cooling_pipe(cell, 2)
				sim.log_event("ONI 복사 냉각 파이프 포설: (%d,%d)" % [cell.x, cell.y])
		"bulkhead_door":
			sim.interact_bulkhead_edge(edge_a, edge_b, "door")
		"bulkhead_firewall":
			sim.interact_bulkhead_edge(edge_a, edge_b, "firewall")
		"wire_1":
			if int(sim.wires.get(cell, 0)) == 1:
				var nd1 := sim.rotate_energy_pipe_dir(cell)
				sim.log_event("소형 에너지 배관 1방향 회전: (%d,%d) -> %s" % [cell.x, cell.y, _dir_arrow_text(nd1)])
			else:
				sim.set_wire(cell, 1)
				sim.log_event("소형 1방향 에너지 배관 포설: (%d,%d)" % [cell.x, cell.y])
		"wire_2":
			if int(sim.wires.get(cell, 0)) == 2:
				var nd2 := sim.rotate_energy_pipe_dir(cell)
				sim.log_event("중형 에너지 배관 1방향 회전: (%d,%d) -> %s" % [cell.x, cell.y, _dir_arrow_text(nd2)])
			else:
				sim.set_wire(cell, 2)
				sim.log_event("중형 1방향 에너지 배관 포설: (%d,%d)" % [cell.x, cell.y])
		"wire_3":
			if int(sim.wires.get(cell, 0)) == 3:
				var nd3 := sim.rotate_energy_pipe_dir(cell)
				sim.log_event("대형 에너지 배관 1방향 회전: (%d,%d) -> %s" % [cell.x, cell.y, _dir_arrow_text(nd3)])
			else:
				sim.set_wire(cell, 3)
				sim.log_event("대형 1방향 에너지 배관 포설: (%d,%d)" % [cell.x, cell.y])
		"wire_dir":
			var nd := sim.rotate_energy_pipe_dir(cell)
			if nd != Vector2i.ZERO:
				sim.log_event("에너지 배관 1방향 화살표 회전: (%d,%d) -> %s (역방향 수송 차단)" % [cell.x, cell.y, _dir_arrow_text(nd)])
			else:
				sim.log_event("(%d,%d)에 회전할 에너지 배관이 없습니다." % [cell.x, cell.y])
		"wire_0":
			sim.set_wire(cell, 0)
			sim.log_event("에너지 배관 철거: (%d,%d)" % [cell.x, cell.y])
		"build_cooler":
			sim.order_build_module("oni_cooler", cell, 0, 8)
		"build_corridor":
			sim.order_build_module("cosmo_corridor", cell, 0, 8)
		"deconstruct_corridor":
			var p := ship_model.part_at(cell)
			if p != null and p.kind in ["cosmo_corridor", "cosmo_conveyor", "cosmo_airlock"]:
				ship_model.remove(p.uid)
				sim.log_event("복도 제거 (%d,%d) -> 인접 비복도 구획 간 승조원 이동 차단!" % [cell.x, cell.y])
	canvas_view.queue_redraw()

func _trigger_biochemical_hit() -> void:
	var gas_cell := Vector2i(0, -3) if ship_model.part_at(Vector2i(0, -3)) != null else Vector2i(3, 0)
	sim.set_all_doors_locked(true)
	sim.inject_biochemical_gas(gas_cell, 98.0)
	if sfx != null:
		sfx.play("shield_hit")

func _trigger_ammo_resupply_test() -> void:
	sim.drain_all_weapon_mags()
	if sfx != null:
		sfx.play("shot_cannon")

func _trigger_reactor_meltdown() -> void:
	var target_uid := -1
	for p in ship_model.parts:
		if p.kind in ["cosmo_reactor_small", "cosmo_reactor_med"]:
			target_uid = p.uid
			break
	if target_uid < 0:
		for p in ship_model.parts:
			if "reactor" in p.kind:
				target_uid = p.uid
				break
	if target_uid >= 0:
		sim.detonate_reactor(target_uid)
		if sfx != null:
			sfx.play("reactor_meltdown")

static func _dir_arrow_text(d: Vector2i) -> String:
	if d == Vector2i.RIGHT: return "우측(▶)"
	if d == Vector2i.LEFT: return "좌측(◀)"
	if d == Vector2i.DOWN: return "하단(▼)"
	if d == Vector2i.UP: return "상단(▲)"
	return "-"

func _trigger_attack_pipe_damage() -> void:
	var hit_cell := Vector2i(3, 0) if sim.wires.has(Vector2i(3, 0)) else Vector2i(2, 0)
	if not sim.wires.has(hit_cell) and not sim.wires.is_empty():
		hit_cell = sim.wires.keys()[0]
	var hit_part := ship_model.part_at(hit_cell)
	if hit_part != null:
		hit_part.hp = maxf(6.0, hit_part.hp - 14.0)
	sim.damage_energy_pipe_at(hit_cell, 180.0, 0.0)
	sim.step_power_grid(0.1)
	if sfx != null:
		sfx.play("shot_cannon")

func _trigger_boarder_attack() -> void:
	sim.spawn_enemy_boarder("mantis", Vector2i(3, 0))
	_refresh_crew_cards()
	if sfx != null:
		sfx.play("shield_down")

func _trigger_fire_and_damage() -> void:
	for p in ship_model.parts:
		if p.kind in ["cosmo_heavy_laser", "cosmo_shield_small"]:
			p.hp = maxf(6.0, p.max_hp * 0.42)
			sim.ignite_part_fire(p.uid, 85.0)
			sim.log_event("FTL 구획 피격! %s 손상 및 화재 발생!" % p.kind)
			break
	if sfx != null:
		sfx.play("fire_ignite")

var _crew_refresh_accum := 0.0
var _telemetry_accum := 0.2
var _canvas_redraw_accum := 0.0

func _refresh_crew_cards() -> void:
	if _crew_box == null:
		return
	for ch in _crew_box.get_children():
		ch.queue_free()
	var state_ko := {
		"idle": "대기", "walk": "복도이동", "repair": "ONI수리",
		"build": "ONI건설", "fire": "화재진압", "fight": "FTL전투",
		"sabotage": "사보타주", "man": "배치보너스"
	}
	for c in sim.crew:
		if float(c.hp) <= 0.0:
			continue
		var cid := int(c.id)
		var friendly := bool(c.is_friendly)
		var btn := Button.new()
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.focus_mode = Control.FOCUS_NONE
		btn.clip_text = true
		btn.custom_minimum_size = Vector2(0, 48)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 19)
		var icon := FtlCrew.get_icon_atlas(str(c.species))
		if icon != null:
			btn.icon = icon
			btn.expand_icon = true
		var tag := "" if friendly else "[침투] "
		btn.text = "%s%s (%s) %d/%d · %s" % [
			tag, str(c.name), str(c.species).to_upper(),
			roundi(float(c.hp)), roundi(float(c.max_hp)),
			str(state_ko.get(str(c.state), str(c.state)))
		]
		var is_sel := (cid == sim.selected_crew_id)
		btn.add_theme_stylebox_override("normal", _make_style(
			Color(0.26, 0.10, 0.12, 0.94) if not friendly else (Color(0.11, 0.34, 0.30, 0.96) if is_sel else Color(0.06, 0.11, 0.19, 0.92)),
			RED if not friendly else (GREEN if is_sel else EDGE), 8, 5))
		btn.add_theme_color_override("font_color", Color("ffb8b8") if not friendly else WHITE)
		if friendly:
			btn.pressed.connect(func() -> void:
				sim.select_crew(cid)
				active_tool = "move_crew"
				_update_tool_highlights()
				_refresh_crew_cards())
		_crew_box.add_child(btn)

func _physics_process(delta: float) -> void:
	if sim == null:
		return
	sim.step(delta)
	_crew_refresh_accum += delta
	if _crew_refresh_accum >= 0.35:
		_crew_refresh_accum = 0.0
		_refresh_crew_cards()

	_telemetry_accum += delta
	if _telemetry_accum >= 0.15:
		_telemetry_accum = 0.0
		var pipe_state_txt := "피격단절 %d건!" % sim.wires_destroyed_count if sim.wires_destroyed_count > 0 else "1방향 수송 정상"
		var no_pwr_cnt := 0
		for uid in sim.part_status.keys():
			if str(sim.part_status[uid]) == "NO_POWER":
				no_pwr_cnt += 1
		var wstats := sim.get_wiring_efficiency_stats()
		var c_parts := PackedStringArray()
		for ci in mini(sim.circuits.size(), 4):
			var net: Dictionary = sim.circuits[ci]
			c_parts.append("P%d:%.1fkW" % [ci + 1, float(net.consumed_w) / 1000.0])
		var c_line := " | ".join(c_parts) if not c_parts.is_empty() else "-"
		_power_summary_label.text = "생산 %.0fW / 소비 %.0fW (%d배관망)\n계통: %s\n에너지입자 %d알 1방향 이동 · 충전 %d회 | 냉매 %d개 · %.0f°C\n배관재료 %.0fkg (-%.0f%%) · 설치 %.1fs (-%.0f%%)\n규격: 소형 %d · 중형 %d · 대형 %d · 피격파괴 %d건\n격벽 %d개 · 독가스 %d칸 · 보급 %d회 · 무전력 %d · %s" % [
			sim.power_produced_w, sim.power_consumed_w, sim.circuits.size(),
			c_line,
			sim.energy_packets.size(), sim.energy_deliveries, sim.coolant_packets.size(), sim.max_part_temp_c,
			float(wstats.total_metal_kg), float(wstats.metal_saved_pct),
			float(wstats.total_build_time_s), float(wstats.time_saved_pct),
			int(wstats.tier1_cells), int(wstats.tier2_cells), int(wstats.tier3_cells), sim.wires_destroyed_count,
			sim.bulkheads.size(), sim.bio_gas.size(), sim.ammo_deliveries, no_pwr_cnt, pipe_state_txt,
		]
		_power_summary_label.add_theme_color_override("font_color", RED if (no_pwr_cnt > 0 or sim.wires_destroyed_count > 0 or not sim.bio_gas.is_empty()) else GREEN)

		var tail := PackedStringArray()
		for i in range(maxi(0, sim.events_log.size() - 4), sim.events_log.size()):
			tail.append("• " + sim.events_log[i])
		_log_label.text = "\n".join(tail) if not tail.is_empty() else "• 대기 중"

	_canvas_redraw_accum += delta
	if canvas_view != null and _canvas_redraw_accum >= 0.033:
		_canvas_redraw_accum = 0.0
		canvas_view.queue_redraw()
