extends Node2D

var world: OniWorld
var renderer: OniRenderer
var camera: Camera2D
var audio: OniAudio

var paused := false
var speed_mult := 1.0
var active_tool := "select"
var active_cat := "base"
var active_codex_tab := "summary"
var show_all_techs := false

var _panning := false
var _pan_last_mouse := Vector2.ZERO
var _ui_font: FontFile
var _ui_root: Control
var _top_info_lbl: Label
var _res_info_lbl: Label
var _inspector_lbl: Label
var _status_lbl: Label
var _tool_row: HBoxContainer
var _research_panel: PanelContainer
var _research_vbox: VBoxContainer
var _audit_panel: PanelContainer
var _audit_lbl: Label
var _codex_tab_buttons: Dictionary = {}
var _print_panel: PanelContainer
var _print_vbox: VBoxContainer
var _print_btn: Button
var _dupes_panel: PanelContainer
var _dupes_vbox: VBoxContainer
var _space_panel: PanelContainer
var _space_vbox: VBoxContainer
var _report_panel: PanelContainer
var _report_vbox: VBoxContainer
var _alert_lbl: Label
var _preset_btn: Button
var _atmo_shader_mat: ShaderMaterial
var _tool_buttons: Dictionary = {}
var _cat_buttons: Dictionary = {}
var _overlay_buttons: Dictionary = {}
var _speed_buttons: Dictionary = {}

const CATEGORIES := [
	{"id": "base", "label": "기본"},
	{"id": "living", "label": "생활·장식"},
	{"id": "power", "label": "전력·산소"},
	{"id": "pipe", "label": "배관"},
	{"id": "auto", "label": "자동화·운송"},
	{"id": "colony", "label": "농사·목축·산업"},
	{"id": "space", "label": "우주"},
]

const CAT_TOOLS := {
	"base": ["tile", "insulated_tile", "door", "ladder", "fire_pole", "cot", "storage", "ceiling_light", "oxygen_dock"],
	"living": ["outhouse", "wash_basin", "mess_table", "ration_box", "microbe_musher", "electric_grill", "flower_pot", "decor_painting", "sculpture"],
	"power": ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "battery", "wire"],
	"pipe": ["liquid_pipe", "liquid_pump", "liquid_vent", "liquid_reservoir", "gas_pipe", "gas_pump", "gas_vent", "gas_reservoir"],
	"auto": ["logic_wire", "smart_battery", "atmo_sensor", "thermo_sensor", "mech_door", "auto_sweeper", "sweep_station", "conveyor_loader"],
	"colony": ["farm_tile", "ranch_station", "incubator", "research_station", "thermo_aquatuner", "metal_refinery", "oil_refinery"],
	"space": ["telescope", "bunker_door", "rocket_steam_engine", "rocket_research_module", "rocket_command_module"],
}

const WORLD_PRESETS := ["terra", "rime", "oceana", "badlands"]

func _ready() -> void:
	_install_ui_font()
	OniMedia.ensure_loaded()

	audio = OniAudio.new()
	add_child(audio)

	world = OniWorld.new(73)
	world.on_dig_completed = Callable(self, "_on_dig_completed")
	world.on_build_completed = Callable(self, "_on_build_completed")

	renderer = OniRenderer.new()
	renderer.world = world
	add_child(renderer)

	camera = Camera2D.new()
	camera.position = Vector2(24 * OniWorld.TILE_SIZE, 15.5 * OniWorld.TILE_SIZE)
	camera.zoom = Vector2(1.15, 1.15)
	add_child(camera)
	camera.make_current()

	_build_hud()
	_select_category("base")
	_select_tool("dig")
	_select_overlay("normal")
	_set_speed(1.0)
	_refresh_hud()

func _install_ui_font() -> void:
	if FileAccess.file_exists("res://assets/fonts/oni-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/oni-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			_ui_font = ff
			ThemeDB.fallback_font = ff

func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)

	_ui_root = Control.new()
	_ui_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _ui_font != null:
		var ui_theme := Theme.new()
		ui_theme.default_font = _ui_font
		_ui_root.theme = ui_theme
	canvas.add_child(_ui_root)

	# 원작 Klei/GasTest·PostFX 포팅 셰이더 오버레이 적용 (oni_atmosphere_fx.gdshader)
	if ResourceLoader.exists("res://shaders/oni_atmosphere_fx.gdshader"):
		var sh: Variant = load("res://shaders/oni_atmosphere_fx.gdshader")
		if sh is Shader:
			var fx_rect := ColorRect.new()
			fx_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
			fx_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_atmo_shader_mat = ShaderMaterial.new()
			_atmo_shader_mat.shader = sh
			fx_rect.material = _atmo_shader_mat
			_ui_root.add_child(fx_rect)

	# 상단 바 (PIE 좌측 상단 오버레이 회피 + 1280px 폭 내 전 버튼 완전 노출)
	var top_panel := PanelContainer.new()
	top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_panel.offset_left = 256
	top_panel.offset_bottom = 48
	_style_panel(top_panel, Color(0.08, 0.11, 0.16, 0.92))
	_ui_root.add_child(top_panel)

	var top_hbox := HBoxContainer.new()
	top_hbox.add_theme_constant_override("separation", 3)
	top_panel.add_child(top_hbox)

	var title_lbl := Label.new()
	title_lbl.text = "숨·ONI"
	title_lbl.add_theme_font_size_override("font_size", 14)
	title_lbl.add_theme_color_override("font_color", Color(0.55, 0.90, 1.0))
	top_hbox.add_child(title_lbl)

	_top_info_lbl = Label.new()
	_top_info_lbl.add_theme_font_size_override("font_size", 11)
	top_hbox.add_child(_top_info_lbl)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_hbox.add_child(spacer)

	for sp in [
		{"id": "pause", "label": "정지", "val": 0.0},
		{"id": "1x", "label": "1x", "val": 1.0},
		{"id": "2x", "label": "2x", "val": 2.0},
		{"id": "4x", "label": "4x", "val": 4.0},
	]:
		var btn := Button.new()
		btn.text = String(sp["label"])
		var v: float = float(sp["val"])
		btn.pressed.connect(func():
			audio.play_click()
			if v <= 0.0:
				paused = true
				_update_speed_buttons()
			else:
				paused = false
				_set_speed(v)
		)
		top_hbox.add_child(btn)
		_speed_buttons[String(sp["id"])] = btn

	for ov in [
		{"id": "normal", "label": "기본"},
		{"id": "gas", "label": "기체G"},
		{"id": "temp", "label": "온도T"},
		{"id": "power", "label": "전력E"},
		{"id": "pipe", "label": "배관P"},
		{"id": "room", "label": "방M"},
		{"id": "germ", "label": "세균J"},
		{"id": "logic", "label": "자동L"},
		{"id": "decor", "label": "장식K"},
	]:
		var obtn := Button.new()
		obtn.text = String(ov["label"])
		var oid := String(ov["id"])
		obtn.pressed.connect(func():
			audio.play_circuit_toggle()
			_select_overlay(oid)
		)
		top_hbox.add_child(obtn)
		_overlay_buttons[oid] = obtn

	# 상단 2줄째: 자원 요약 + 식민지 관리 패널 7종 (인쇄N · 연구R · 대원V · 우주U · 보고O · 도감I · 행성전환)
	var res_panel := PanelContainer.new()
	res_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	res_panel.offset_left = 216
	res_panel.offset_top = 52
	res_panel.offset_bottom = 86
	_style_panel(res_panel, Color(0.08, 0.11, 0.16, 0.88))
	_ui_root.add_child(res_panel)

	var res_hbox := HBoxContainer.new()
	res_hbox.add_theme_constant_override("separation", 4)
	res_panel.add_child(res_hbox)

	_res_info_lbl = Label.new()
	_res_info_lbl.add_theme_font_size_override("font_size", 11)
	res_hbox.add_child(_res_info_lbl)

	var rspacer := Control.new()
	rspacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	res_hbox.add_child(rspacer)

	_print_btn = Button.new()
	_print_btn.text = "★인쇄N"
	_print_btn.pressed.connect(func():
		audio.play_toggle()
		_toggle_print_panel()
	)
	res_hbox.add_child(_print_btn)

	var res_btn := Button.new()
	res_btn.text = "연구R"
	res_btn.pressed.connect(func():
		audio.play_click()
		_toggle_research_panel()
	)
	res_hbox.add_child(res_btn)

	var dupes_btn := Button.new()
	dupes_btn.text = "대원V"
	dupes_btn.pressed.connect(func():
		audio.play_click()
		_toggle_dupes_panel()
	)
	res_hbox.add_child(dupes_btn)

	var space_btn := Button.new()
	space_btn.text = "우주U"
	space_btn.pressed.connect(func():
		audio.play_click()
		_toggle_space_panel()
	)
	res_hbox.add_child(space_btn)

	var rep_btn := Button.new()
	rep_btn.text = "보고O"
	rep_btn.pressed.connect(func():
		audio.play_click()
		_toggle_report_panel()
	)
	res_hbox.add_child(rep_btn)

	var audit_btn := Button.new()
	audit_btn.text = "도감I"
	audit_btn.pressed.connect(func():
		audio.play_toggle()
		_toggle_audit_panel()
	)
	res_hbox.add_child(audit_btn)

	_preset_btn = Button.new()
	_preset_btn.text = world.get_world_preset_label()
	_preset_btn.pressed.connect(func():
		audio.play_warp()
		var cur_i: int = WORLD_PRESETS.find(world.world_preset)
		var next_preset := String(WORLD_PRESETS[(cur_i + 1) % WORLD_PRESETS.size()])
		world.generate(world.seed_value + 1, next_preset)
		_preset_btn.text = world.get_world_preset_label()
		renderer.selected_cell = Vector2i(-1, -1)
		_rebuild_tool_buttons()
		_refresh_research_panel()
		_refresh_hud()
		renderer.request_redraw()
	)
	res_hbox.add_child(_preset_btn)

	# 식민지 실시간 경보 배너
	_alert_lbl = Label.new()
	_alert_lbl.position = Vector2(220, 90)
	_alert_lbl.add_theme_font_size_override("font_size", 12)
	_alert_lbl.add_theme_color_override("font_color", Color(1.0, 0.90, 0.42))
	_ui_root.add_child(_alert_lbl)

	# 인쇄기 보급품 / 신규 복제체 인쇄 팝업 (N)
	_print_panel = PanelContainer.new()
	_print_panel.position = Vector2(310, 118)
	_print_panel.custom_minimum_size = Vector2(560, 250)
	_print_panel.visible = false
	_style_panel(_print_panel, Color(0.08, 0.13, 0.20, 0.97))
	_ui_root.add_child(_print_panel)

	_print_vbox = VBoxContainer.new()
	_print_vbox.add_theme_constant_override("separation", 8)
	_print_panel.add_child(_print_vbox)

	# 대원 우선순위·스킬 관리 팝업 (V)
	_dupes_panel = PanelContainer.new()
	_dupes_panel.position = Vector2(230, 110)
	_dupes_panel.custom_minimum_size = Vector2(680, 320)
	_dupes_panel.visible = false
	_style_panel(_dupes_panel, Color(0.08, 0.12, 0.19, 0.97))
	_ui_root.add_child(_dupes_panel)

	_dupes_vbox = VBoxContainer.new()
	_dupes_vbox.add_theme_constant_override("separation", 6)
	_dupes_panel.add_child(_dupes_vbox)

	# 우주 스타맵·로켓 발사 관제 팝업 (U)
	_space_panel = PanelContainer.new()
	_space_panel.position = Vector2(250, 110)
	_space_panel.custom_minimum_size = Vector2(620, 310)
	_space_panel.visible = false
	_style_panel(_space_panel, Color(0.06, 0.09, 0.18, 0.97))
	_ui_root.add_child(_space_panel)

	_space_vbox = VBoxContainer.new()
	_space_vbox.add_theme_constant_override("separation", 7)
	_space_panel.add_child(_space_vbox)

	# 주기 보고서·저장/불러오기 팝업 (O)
	_report_panel = PanelContainer.new()
	_report_panel.position = Vector2(300, 115)
	_report_panel.custom_minimum_size = Vector2(520, 290)
	_report_panel.visible = false
	_style_panel(_report_panel, Color(0.08, 0.12, 0.18, 0.97))
	_ui_root.add_child(_report_panel)

	_report_vbox = VBoxContainer.new()
	_report_vbox.add_theme_constant_override("separation", 6)
	_report_panel.add_child(_report_vbox)

	# 연구 패널 팝업 (R) - 스크롤 가능한 원작 97개 기술 트리
	_research_panel = PanelContainer.new()
	_research_panel.position = Vector2(220, 96)
	_research_panel.custom_minimum_size = Vector2(520, 360)
	_research_panel.visible = false
	_style_panel(_research_panel, Color(0.09, 0.12, 0.19, 0.96))
	_ui_root.add_child(_research_panel)

	var res_scroll := ScrollContainer.new()
	res_scroll.custom_minimum_size = Vector2(500, 344)
	_research_panel.add_child(res_scroll)

	_research_vbox = VBoxContainer.new()
	_research_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_research_vbox.add_theme_constant_override("separation", 5)
	res_scroll.add_child(_research_vbox)
	_refresh_research_panel()

	# 인터랙티브 탭형 ONI 백과/도감 브라우저 (I)
	_audit_panel = PanelContainer.new()
	_audit_panel.position = Vector2(210, 94)
	_audit_panel.custom_minimum_size = Vector2(690, 390)
	_audit_panel.visible = false
	_style_panel(_audit_panel, Color(0.08, 0.12, 0.18, 0.96))
	_ui_root.add_child(_audit_panel)

	var codex_vbox := VBoxContainer.new()
	codex_vbox.add_theme_constant_override("separation", 6)
	_audit_panel.add_child(codex_vbox)

	var codex_tabs := HBoxContainer.new()
	codex_tabs.add_theme_constant_override("separation", 4)
	codex_vbox.add_child(codex_tabs)
	for ct in [
		{"id": "summary", "label": "요약"},
		{"id": "elements", "label": "원소"},
		{"id": "buildings", "label": "건물"},
		{"id": "creatures", "label": "생물·음식"},
		{"id": "rooms", "label": "방"},
		{"id": "diseases", "label": "질병"},
		{"id": "personalities", "label": "복제체"},
		{"id": "worlds", "label": "행성·POI"},
		{"id": "shaders", "label": "셰이더"},
	]:
		var ctb := Button.new()
		ctb.text = String(ct["label"])
		var ctid := String(ct["id"])
		ctb.pressed.connect(func():
			audio.play_click()
			_select_codex_tab(ctid)
		)
		codex_tabs.add_child(ctb)
		_codex_tab_buttons[ctid] = ctb

	var codex_scroll := ScrollContainer.new()
	codex_scroll.custom_minimum_size = Vector2(666, 336)
	codex_vbox.add_child(codex_scroll)

	_audit_lbl = Label.new()
	_audit_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_audit_lbl.custom_minimum_size = Vector2(648, 0)
	_audit_lbl.add_theme_font_size_override("font_size", 12)
	codex_scroll.add_child(_audit_lbl)
	_select_codex_tab("summary")

	# 우측 하단 타일 인스펙터
	var insp_panel := PanelContainer.new()
	insp_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	insp_panel.offset_left = -356
	insp_panel.offset_top = -288
	insp_panel.offset_right = -10
	insp_panel.offset_bottom = -86
	_style_panel(insp_panel, Color(0.08, 0.11, 0.16, 0.90))
	_ui_root.add_child(insp_panel)

	_inspector_lbl = Label.new()
	_inspector_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_inspector_lbl.add_theme_font_size_override("font_size", 12)
	insp_panel.add_child(_inspector_lbl)

	# 하단 2단 도구 바 (카테고리 탭 + 도구 버튼, PIE 좌측 하단 아바타 회피)
	var bot_panel := PanelContainer.new()
	bot_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bot_panel.offset_left = 172
	bot_panel.offset_top = -78
	_style_panel(bot_panel, Color(0.08, 0.11, 0.16, 0.94))
	_ui_root.add_child(bot_panel)

	var bot_vbox := VBoxContainer.new()
	bot_vbox.add_theme_constant_override("separation", 4)
	bot_panel.add_child(bot_vbox)

	var cat_row := HBoxContainer.new()
	cat_row.add_theme_constant_override("separation", 6)
	bot_vbox.add_child(cat_row)

	for fix_t in [
		{"id": "select", "label": "선택"},
		{"id": "dig", "label": "채굴(B)"},
		{"id": "cancel", "label": "취소(C)"},
	]:
		var fbtn := Button.new()
		fbtn.text = String(fix_t["label"])
		var ftid := String(fix_t["id"])
		fbtn.pressed.connect(func():
			audio.play_click()
			_select_tool(ftid)
		)
		cat_row.add_child(fbtn)
		_tool_buttons[ftid] = fbtn

	var sep := VSeparator.new()
	cat_row.add_child(sep)

	for c in CATEGORIES:
		var cbtn := Button.new()
		cbtn.text = String(c["label"])
		var cid := String(c["id"])
		cbtn.pressed.connect(func():
			audio.play_click()
			_select_category(cid)
		)
		cat_row.add_child(cbtn)
		_cat_buttons[cid] = cbtn

	var cspacer := Control.new()
	cspacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cat_row.add_child(cspacer)

	_status_lbl = Label.new()
	_status_lbl.add_theme_font_size_override("font_size", 12)
	_status_lbl.add_theme_color_override("font_color", Color(0.75, 0.88, 0.96))
	cat_row.add_child(_status_lbl)

	_tool_row = HBoxContainer.new()
	_tool_row.add_theme_constant_override("separation", 6)
	bot_vbox.add_child(_tool_row)

func _style_panel(p: PanelContainer, bg: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = Color(0.24, 0.36, 0.48, 0.85)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 5
	sb.content_margin_bottom = 5
	p.add_theme_stylebox_override("panel", sb)

func _select_category(cid: String) -> void:
	active_cat = cid
	for k in _cat_buttons.keys():
		var btn: Button = _cat_buttons[k]
		btn.modulate = Color(1.0, 0.88, 0.45) if String(k) == cid else Color(1, 1, 1)
	_rebuild_tool_buttons()

func _rebuild_tool_buttons() -> void:
	for child in _tool_row.get_children():
		child.queue_free()
	# 고정 도구 유지, 동적 도구만 재생성
	var remove_keys: Array[String] = []
	for k in _tool_buttons.keys():
		var ks := String(k)
		if ks != "select" and ks != "dig" and ks != "cancel":
			remove_keys.append(ks)
	for rk: String in remove_keys:
		_tool_buttons.erase(rk)

	var list: Array = CAT_TOOLS.get(active_cat, [])
	for tid_v in list:
		var tid := String(tid_v)
		var bdef := OniElements.get_building(tid)
		var unlocked := world.is_building_unlocked(tid)
		var tbtn := Button.new()
		tbtn.text = String(bdef.get("name_ko", tid)) + ("" if unlocked else " [잠김]")
		tbtn.disabled = not unlocked
		tbtn.pressed.connect(func():
			audio.play_click()
			_select_tool(tid)
		)
		_tool_row.add_child(tbtn)
		_tool_buttons[tid] = tbtn
	_update_tool_highlight()

func _select_tool(tid: String) -> void:
	active_tool = tid
	renderer.active_tool = tid
	_update_tool_highlight()
	var bdef := OniElements.get_building(tid)
	if not bdef.is_empty():
		var el_ko := OniElements.get_element_name(String(bdef.get("cost_element", "SandStone")))
		_status_lbl.text = "%s (%s %.0fkg) - %s" % [String(bdef["name_ko"]), el_ko, float(bdef["cost_kg"]), String(bdef["desc"])]
	elif tid == "dig":
		_status_lbl.text = "좌클릭 드래그로 채굴 지정 · 연구(R)로 배관/전해조/농사 해금"
	elif tid == "cancel":
		_status_lbl.text = "좌클릭 드래그로 채굴/건설 지시 취소"
	else:
		_status_lbl.text = "칸 클릭: 원소·기체·배관·온도 검사 (우클릭: 이동, 휠: 줌)"

func _update_tool_highlight() -> void:
	for k in _tool_buttons.keys():
		var btn: Button = _tool_buttons[k]
		if is_instance_valid(btn):
			btn.modulate = Color(0.55, 0.95, 1.0) if String(k) == active_tool else Color(1, 1, 1)

func _select_overlay(oid: String) -> void:
	renderer.overlay_mode = oid
	for k in _overlay_buttons.keys():
		var btn: Button = _overlay_buttons[k]
		btn.modulate = Color(0.55, 0.95, 1.0) if String(k) == oid else Color(1, 1, 1)
	renderer.request_redraw()

func _close_all_modals(except: Control = null) -> void:
	for p in [_research_panel, _audit_panel, _print_panel, _dupes_panel, _space_panel, _report_panel]:
		if p != null and p != except:
			p.visible = false

func _toggle_research_panel() -> void:
	_research_panel.visible = not _research_panel.visible
	if _research_panel.visible:
		_close_all_modals(_research_panel)
		_refresh_research_panel()

func _toggle_audit_panel() -> void:
	_audit_panel.visible = not _audit_panel.visible
	if _audit_panel.visible:
		_close_all_modals(_audit_panel)
		_select_codex_tab(active_codex_tab)

func _toggle_print_panel() -> void:
	_print_panel.visible = not _print_panel.visible
	if _print_panel.visible:
		_close_all_modals(_print_panel)
		_refresh_print_panel()

func _toggle_dupes_panel() -> void:
	_dupes_panel.visible = not _dupes_panel.visible
	if _dupes_panel.visible:
		_close_all_modals(_dupes_panel)
		_refresh_dupes_panel()

func _toggle_space_panel() -> void:
	_space_panel.visible = not _space_panel.visible
	if _space_panel.visible:
		_close_all_modals(_space_panel)
		_refresh_space_panel()

func _toggle_report_panel() -> void:
	_report_panel.visible = not _report_panel.visible
	if _report_panel.visible:
		_close_all_modals(_report_panel)
		_refresh_report_panel()

func _refresh_dupes_panel() -> void:
	for child in _dupes_vbox.get_children():
		child.queue_free()
	var hdr := Label.new()
	hdr.text = "=== 복제체 우선순위 & 스킬 관리 (%d/8명 · 공식 스킬 56종 기반) ===" % world.duplicants.size()
	hdr.add_theme_color_override("font_color", Color(0.55, 0.94, 1.0))
	_dupes_vbox.add_child(hdr)
	for d in world.duplicants:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 5)
		var lbl := Label.new()
		lbl.text = "%s[%s] Lv.%d %s (XP %.0f/100 · 사기 %d)" % [d.dupe_name, d.trait_ko, d.skill_level, d.skill_name_ko, d.xp, d.morale]
		lbl.custom_minimum_size = Vector2(315, 0)
		lbl.add_theme_font_size_override("font_size", 11)
		row.add_child(lbl)
		for pr in [
			{"k": "dig", "t": "채굴", "v": d.prio_dig},
			{"k": "build", "t": "건설", "v": d.prio_build},
			{"k": "operate", "t": "발전", "v": d.prio_operate},
			{"k": "research", "t": "연구", "v": d.prio_research},
		]:
			var pb := Button.new()
			pb.text = String(pr["t"])
			pb.modulate = Color(0.45, 0.96, 0.62) if bool(pr["v"]) else Color(0.55, 0.58, 0.65)
			var pk := String(pr["k"])
			var dc: OniDuplicant = d
			pb.pressed.connect(func():
				audio.play_click()
				if pk == "dig":
					dc.prio_dig = not dc.prio_dig
				elif pk == "build":
					dc.prio_build = not dc.prio_build
				elif pk == "operate":
					dc.prio_operate = not dc.prio_operate
				else:
					dc.prio_research = not dc.prio_research
				_refresh_dupes_panel()
			)
			row.add_child(pb)
		var skb := Button.new()
		skb.text = "+스킬" if d.xp >= 100.0 and d.skill_level < 4 else "XP부족"
		skb.disabled = d.xp < 100.0 or d.skill_level >= 4
		var dc2: OniDuplicant = d
		skb.pressed.connect(func():
			if dc2.upgrade_skill():
				audio.play_level_up()
				_refresh_dupes_panel()
		)
		row.add_child(skb)
		_dupes_vbox.add_child(row)
	var cb := Button.new()
	cb.text = "닫기"
	cb.pressed.connect(func():
		audio.play_click()
		_dupes_panel.visible = false
	)
	_dupes_vbox.add_child(cb)

func _refresh_space_panel() -> void:
	for child in _space_vbox.get_children():
		child.queue_free()
	var hdr := HBoxContainer.new()
	var hl := Label.new()
	var st_ko := "발사 준비 완료" if world.rocket_state == "READY" else ("발사 상승 중!" if world.rocket_state == "LAUNCHING" else ("우주 탐사 중 (%.0fs)" % world.rocket_mission_timer if world.rocket_state == "IN_SPACE" else "귀환 착륙 중!"))
	hl.text = "우주 스타맵 관제 (110 목적지) · 로켓: %s · 데이터 뱅크 %d · 발사 %d회" % [st_ko, world.data_banks, world.rockets_launched]
	hl.add_theme_color_override("font_color", Color(0.58, 0.88, 1.0))
	hl.add_theme_font_size_override("font_size", 12)
	hdr.add_child(hl)
	_space_vbox.add_child(hdr)

	var jump_btn := Button.new()
	jump_btn.text = "▲ 우주 표면 발사대·망원경·태양광 위치로 카메라 이동"
	jump_btn.pressed.connect(func():
		audio.play_click()
		camera.position = Vector2(23.5 * OniWorld.TILE_SIZE, 3.8 * OniWorld.TILE_SIZE)
		_clamp_camera()
		_space_panel.visible = false
	)
	_space_vbox.add_child(jump_btn)

	for mi in range(world.space_missions.size()):
		var m: Dictionary = world.space_missions[mi]
		var mb := Button.new()
		mb.text = "[발사] [%s] %s — %s" % [String(m["dist"]), String(m["name_ko"]), String(m["desc"])]
		mb.alignment = HORIZONTAL_ALIGNMENT_LEFT
		mb.disabled = world.rocket_state != "READY"
		var cap_i: int = mi
		mb.pressed.connect(func():
			if world.launch_rocket(cap_i):
				audio.play_warp()
				audio.play_print_ok()
				camera.position = Vector2(23.5 * OniWorld.TILE_SIZE, 3.8 * OniWorld.TILE_SIZE)
				_clamp_camera()
				_space_panel.visible = false
				_refresh_hud()
		)
		_space_vbox.add_child(mb)
	var cb := Button.new()
	cb.text = "닫기"
	cb.pressed.connect(func():
		audio.play_click()
		_space_panel.visible = false
	)
	_space_vbox.add_child(cb)

func _refresh_report_panel() -> void:
	for child in _report_vbox.get_children():
		child.queue_free()
	var title := Label.new()
	title.text = "=== 식민지 주기 %d 보고서 & 브라우저 영속 저장 ===" % world.cycle
	title.add_theme_color_override("font_color", Color(0.55, 0.94, 1.0))
	_report_vbox.add_child(title)
	var body := Label.new()
	body.add_theme_font_size_override("font_size", 12)
	body.text = "\n".join([
		"행성: %s (시드 %d) · 현재 시간: %s" % [world.get_world_preset_label(), world.seed_value, "야간 취침" if world.is_night() else "주간 작업"],
		"복제체: %d명 · 방 구획: %d개 (사기 보너스 +%d) · 야생 생물: %d마리" % [world.duplicants.size(), world.rooms_list.size(), world.colony_morale_bonus, world.critters.size()],
		"산소 생산 누적: %.1f kg (평균 O2 %.2f kg/칸) · 전력 누적: %.1f kJ" % [world.report_o2_kg, world.avg_oxygen_kg, world.report_power_kj],
		"식량 비축: %.0f kcal · 채굴 완료: %d칸 · 건설 완료: %d건" % [world.food_kcal, world.report_digs, world.report_builds],
		"연구 해금: %d / %d 기술 · 로켓 발사: %d회 · 데이터 뱅크: %d개" % [world.unlocked_techs.size(), OniElements.techs.size(), world.rockets_launched, world.data_banks],
		"저장 상태: %s" % (world.last_save_status if not world.last_save_status.is_empty() else "대기 중 (user://oni_save.json)"),
	])
	_report_vbox.add_child(body)
	var brow := HBoxContainer.new()
	brow.add_theme_constant_override("separation", 8)
	var sbtn := Button.new()
	sbtn.text = "식민지 저장"
	sbtn.pressed.connect(func():
		world.save_colony()
		audio.play_work_chime()
		_refresh_report_panel()
	)
	brow.add_child(sbtn)
	var lbtn := Button.new()
	lbtn.text = "불러오기"
	lbtn.pressed.connect(func():
		if world.load_colony():
			audio.play_warp()
			_preset_btn.text = world.get_world_preset_label()
			_rebuild_tool_buttons()
			_refresh_hud()
			renderer.request_redraw()
		_refresh_report_panel()
	)
	brow.add_child(lbtn)
	var cbtn := Button.new()
	cbtn.text = "닫기"
	cbtn.pressed.connect(func():
		audio.play_click()
		_report_panel.visible = false
	)
	brow.add_child(cbtn)
	_report_vbox.add_child(brow)

func _refresh_print_panel() -> void:
	for child in _print_vbox.get_children():
		child.queue_free()
	var hdr := Label.new()
	if world.print_ready_timer > 0.0:
		hdr.text = "인쇄기 충전 중... (%.0f초 후 다음 보급품/복제체 선택 가능)" % world.print_ready_timer
	else:
		hdr.text = "인쇄기 준비 완료! 아래 3가지 원작 복제체·보급품 중 1개를 선택하세요 (현재 복제체 %d/8명)" % world.duplicants.size()
	hdr.add_theme_color_override("font_color", Color(0.55, 0.94, 1.0))
	_print_vbox.add_child(hdr)

	if world.print_ready_timer <= 0.0:
		if world.print_offers.is_empty():
			world.generate_print_offers()
		for oi in range(world.print_offers.size()):
			var off: Dictionary = world.print_offers[oi]
			var btn := Button.new()
			btn.text = "%d) %s — %s" % [oi + 1, String(off["title"]), String(off["desc"])]
			btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			btn.custom_minimum_size = Vector2(520, 42)
			var idx_cap: int = oi
			btn.pressed.connect(func():
				if world.accept_print_offer(idx_cap):
					audio.play_print_ok()
					renderer.spawn_burst(Vector2i(23, 15), "burst", Color(0.42, 0.96, 1.0, 1.0))
					_print_panel.visible = false
					_refresh_hud()
					renderer.request_redraw()
			)
			_print_vbox.add_child(btn)
	var close_btn := Button.new()
	close_btn.text = "닫기"
	close_btn.pressed.connect(func():
		audio.play_click()
		_print_panel.visible = false
	)
	_print_vbox.add_child(close_btn)

func _select_codex_tab(tab_id: String) -> void:
	active_codex_tab = tab_id
	for k in _codex_tab_buttons.keys():
		var btn: Button = _codex_tab_buttons[k]
		btn.modulate = Color(0.55, 0.95, 1.0) if String(k) == tab_id else Color(1, 1, 1)
	var lines := OniMedia.get_codex_tab_lines(tab_id)
	if lines.size() > 80:
		var clipped: Array[String] = []
		for li in range(80):
			clipped.append(lines[li])
		clipped.append("... 외 %d건 추출 완료" % (lines.size() - 80))
		_audit_lbl.text = "\n".join(clipped)
	else:
		_audit_lbl.text = "\n".join(lines)

func _refresh_research_panel() -> void:
	for child in _research_vbox.get_children():
		child.queue_free()

	var hdr := HBoxContainer.new()
	var hlbl := Label.new()
	hlbl.text = "원작 연구 트리 (%d종 · 연구 작업대 60W)" % OniElements.techs.size()
	hlbl.add_theme_color_override("font_color", Color(0.65, 0.90, 1.0))
	hdr.add_child(hlbl)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hdr.add_child(sp)

	var filter_btn := Button.new()
	filter_btn.text = "전체 97종" if not show_all_techs else "핵심 해금만"
	filter_btn.pressed.connect(func():
		audio.play_click()
		show_all_techs = not show_all_techs
		_refresh_research_panel()
	)
	hdr.add_child(filter_btn)

	var unlock_btn := Button.new()
	unlock_btn.text = "전체 해금 ON" if world.sandbox_unlock_all else "전체 해금"
	unlock_btn.pressed.connect(func():
		audio.play_click()
		world.sandbox_unlock_all = not world.sandbox_unlock_all
		_rebuild_tool_buttons()
		_refresh_research_panel()
	)
	hdr.add_child(unlock_btn)
	_research_vbox.add_child(hdr)

	for tid_v in OniElements.techs.keys():
		var tid := String(tid_v)
		var tdef: Dictionary = OniElements.techs[tid]
		var unlocks: Array = tdef.get("unlocks", [])
		if not show_all_techs and unlocks.is_empty():
			continue
		var cost: float = float(tdef.get("cost_basic", 10.0))
		var prog: float = float(world.tech_progress.get(tid, 0.0))
		var done: bool = world.is_tech_done(tid)
		var can_res: bool = world.can_research_tech(tid)
		var row := HBoxContainer.new()
		var tbtn := Button.new()
		var status_txt := "[완료]" if done else ("(진행 %.1f/%.0f)" % [prog, cost] if world.active_tech == tid else ("(%.1f/%.0f)" % [prog, cost] if can_res else "[선행 필요]"))
		var tier_n: int = int(tdef.get("tier", 1))
		var desc_s := String(tdef.get("desc", ""))
		if desc_s.length() > 36:
			desc_s = desc_s.substr(0, 36) + "…"
		tbtn.text = "T%d %s %s %s" % [tier_n, String(tdef.get("name_ko", tid)), status_txt, desc_s]
		tbtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tbtn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		if done:
			tbtn.modulate = Color(0.55, 0.96, 0.65)
		elif world.active_tech == tid:
			tbtn.modulate = Color(0.55, 0.92, 1.0)
		elif not can_res:
			tbtn.modulate = Color(0.62, 0.65, 0.72)
		tbtn.pressed.connect(func():
			audio.play_click()
			if not done and (can_res or world.sandbox_unlock_all):
				world.active_tech = tid
				_refresh_research_panel()
		)
		row.add_child(tbtn)
		_research_vbox.add_child(row)

func _set_speed(v: float) -> void:
	speed_mult = v
	_update_speed_buttons()

func _update_speed_buttons() -> void:
	for k in _speed_buttons.keys():
		var key := String(k)
		var btn: Button = _speed_buttons[k]
		var on: bool = (key == "pause" and paused) or (not paused and ((key == "1x" and speed_mult == 1.0) or (key == "2x" and speed_mult == 2.0) or (key == "4x" and speed_mult == 4.0)))
		btn.modulate = Color(1.0, 0.88, 0.45) if on else Color(1, 1, 1)

func _process(delta: float) -> void:
	_handle_camera_keys(delta)
	var prev_unlocked := world.unlocked_techs.size()
	if not paused:
		var sim_dt := minf(delta, 0.05) * speed_mult
		world.step(sim_dt)
		renderer.tick_fx(sim_dt)
	else:
		renderer.tick_fx(delta * 0.25)
	if world.unlocked_techs.size() != prev_unlocked:
		audio.play_research_done()
		_rebuild_tool_buttons()
		if _research_panel.visible:
			_refresh_research_panel()
	if _atmo_shader_mat != null:
		_atmo_shader_mat.set_shader_parameter("time_sec", world.sim_time)
		var om := 0
		if renderer.overlay_mode == "gas":
			om = 1
		elif renderer.overlay_mode == "temp":
			om = 2
		elif renderer.overlay_mode == "pipe":
			om = 3
		_atmo_shader_mat.set_shader_parameter("overlay_mode", om)
		_atmo_shader_mat.set_shader_parameter("avg_oxygen", world.avg_oxygen_kg)
	_refresh_hud()
	renderer.request_redraw()

func _handle_camera_keys(delta: float) -> void:
	var move := Vector2.ZERO
	if Input.is_action_pressed("cam_up"):
		move.y -= 1.0
	if Input.is_action_pressed("cam_down"):
		move.y += 1.0
	if Input.is_action_pressed("cam_left"):
		move.x -= 1.0
	if Input.is_action_pressed("cam_right"):
		move.x += 1.0
	if move.length_squared() > 0.0:
		camera.position += move.normalized() * (420.0 / camera.zoom.x) * delta
		_clamp_camera()

func _clamp_camera() -> void:
	var max_x := float(OniWorld.WIDTH * OniWorld.TILE_SIZE)
	var max_y := float(OniWorld.HEIGHT * OniWorld.TILE_SIZE)
	camera.position.x = clampf(camera.position.x, 0.0, max_x)
	camera.position.y = clampf(camera.position.y, 0.0, max_y)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.is_action_pressed("toggle_pause"):
			paused = not paused
			_update_speed_buttons()
		elif event.is_action_pressed("overlay_gas"):
			_select_overlay("normal" if renderer.overlay_mode == "gas" else "gas")
		elif event.is_action_pressed("overlay_temp"):
			_select_overlay("normal" if renderer.overlay_mode == "temp" else "temp")
		elif event.physical_keycode == KEY_P:
			_select_overlay("normal" if renderer.overlay_mode == "pipe" else "pipe")
		elif event.physical_keycode == KEY_E:
			_select_overlay("normal" if renderer.overlay_mode == "power" else "power")
		elif event.physical_keycode == KEY_M:
			_select_overlay("normal" if renderer.overlay_mode == "room" else "room")
		elif event.physical_keycode == KEY_J:
			_select_overlay("normal" if renderer.overlay_mode == "germ" else "germ")
		elif event.physical_keycode == KEY_L:
			_select_overlay("normal" if renderer.overlay_mode == "logic" else "logic")
		elif event.physical_keycode == KEY_K:
			_select_overlay("normal" if renderer.overlay_mode == "decor" else "decor")
		elif event.physical_keycode == KEY_N:
			_toggle_print_panel()
		elif event.physical_keycode == KEY_V:
			_toggle_dupes_panel()
		elif event.physical_keycode == KEY_U:
			_toggle_space_panel()
		elif event.physical_keycode == KEY_O:
			_toggle_report_panel()
		elif event.physical_keycode == KEY_R:
			_toggle_research_panel()
		elif event.physical_keycode == KEY_I:
			_toggle_audit_panel()
		elif event.is_action_pressed("tool_dig"):
			_select_tool("dig")
		elif event.is_action_pressed("tool_cancel"):
			_select_tool("cancel")
		elif event.is_action_pressed("step_gas"):
			paused = true
			world.step_gas_tick()
			_update_speed_buttons()

	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			camera.zoom = (camera.zoom * 1.12).clamp(Vector2(0.55, 0.55), Vector2(2.4, 2.4))
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			camera.zoom = (camera.zoom / 1.12).clamp(Vector2(0.55, 0.55), Vector2(2.4, 2.4))
		elif event.button_index == MOUSE_BUTTON_RIGHT or event.button_index == MOUSE_BUTTON_MIDDLE:
			_panning = event.pressed
			_pan_last_mouse = event.position
		elif event.button_index == MOUSE_BUTTON_LEFT:
			var cell := _mouse_to_cell()
			if event.pressed:
				if world.in_bounds(cell.x, cell.y):
					renderer.selected_cell = cell
					if active_tool != "select":
						renderer.drag_active = true
						renderer.drag_start = cell
						renderer.drag_end = cell
					audio.play_click()
			else:
				if renderer.drag_active:
					_apply_drag(renderer.drag_start, renderer.drag_end)
					renderer.drag_active = false

	elif event is InputEventMouseMotion:
		if _panning:
			var diff: Vector2 = event.position - _pan_last_mouse
			_pan_last_mouse = event.position
			camera.position -= diff / camera.zoom
			_clamp_camera()
		var cell := _mouse_to_cell()
		renderer.hover_cell = cell
		if renderer.drag_active and world.in_bounds(cell.x, cell.y):
			renderer.drag_end = cell

func _mouse_to_cell() -> Vector2i:
	var wp := get_global_mouse_position()
	return Vector2i(int(floor(wp.x / float(OniWorld.TILE_SIZE))), int(floor(wp.y / float(OniWorld.TILE_SIZE))))

func _apply_drag(c0: Vector2i, c1: Vector2i) -> void:
	var x0: int = mini(c0.x, c1.x)
	var x1: int = maxi(c0.x, c1.x)
	var y0: int = mini(c0.y, c1.y)
	var y1: int = maxi(c0.y, c1.y)
	var placed_any := false
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if active_tool == "dig":
				if world.order_dig(x, y):
					placed_any = true
			elif active_tool == "cancel":
				if world.cancel_order(x, y):
					placed_any = true
			elif active_tool != "select":
				if world.order_build(x, y, active_tool):
					placed_any = true
	if placed_any:
		if active_tool == "cancel":
			audio.play_cancel()
		elif active_tool == "dig":
			audio.play_drag()
		else:
			audio.play_place()

func _on_dig_completed(cell: Vector2i, _el: String, _gained: float) -> void:
	audio.play_dig_done()
	renderer.spawn_burst(cell, "dust", Color(1.0, 0.78, 0.34, 0.95))

func _on_build_completed(cell: Vector2i, _b_id: String) -> void:
	audio.play_build_done()
	renderer.spawn_burst(cell, "burst", Color(0.45, 0.94, 1.0, 0.95))

func _refresh_hud() -> void:
	var cyc_sec := fmod(world.sim_time, OniElements.CYCLE_SECONDS)
	_top_info_lbl.text = "주%d(%.0fs)|O2 %.2f|%.0f/%.0fW|사기+%d" % [
		world.cycle, cyc_sec, world.avg_oxygen_kg, world.power_produced_w, world.power_consumed_w, world.colony_morale_bonus
	]
	if _print_btn != null:
		if world.print_ready_timer <= 0.0:
			_print_btn.text = "★인쇄N"
			_print_btn.modulate = Color(0.55, 1.0, 0.72)
		else:
			_print_btn.text = "인쇄(%.0f)" % world.print_ready_timer
			_print_btn.modulate = Color(0.85, 0.88, 0.94)
	if _alert_lbl != null:
		_alert_lbl.text = "" if world.alerts.is_empty() else ("★ " + "  |  ".join(world.alerts))

	var tech_str := "완료"
	if not world.active_tech.is_empty():
		var td := OniElements.get_tech(world.active_tech)
		tech_str = "%s %.0f/%.0f" % [String(td.get("name_ko", world.active_tech)), float(world.tech_progress.get(world.active_tech, 0.0)), float(td.get("cost_basic", 10.0))]

	_res_info_lbl.text = "%s | 사암 %.0f · 구리 %.0f · 조류 %.0f | 식량 %.0fkcal | 뱅크 %d | 연구: %s" % [
		OniMedia.get_media_summary(),
		float(world.inventory.get("SandStone", 0.0)),
		float(world.inventory.get("Cuprite", 0.0)),
		float(world.inventory.get("Algae", 0.0)),
		world.food_kcal,
		world.data_banks,
		tech_str,
	]

	var lines: Array[String] = []
	var sc := renderer.selected_cell
	if world.in_bounds(sc.x, sc.y):
		var info := world.get_cell_summary(sc.x, sc.y)
		lines.append("[좌표 %d, %d] 온도 %.1f°C" % [sc.x, sc.y, float(info["temp_c"])])
		var inspect_el := ""
		if not String(info["solid_el"]).is_empty():
			inspect_el = String(info["solid_el"])
			lines.append("지형: %s (%.0f kg)" % [OniElements.get_element_name(inspect_el), float(info["solid_mass"])])
		elif float(info["liquid_mass"]) > 1.0:
			inspect_el = String(info.get("liquid_el", "Water"))
			lines.append("액체: %s (%.0f kg)" % [OniElements.get_element_name(inspect_el), float(info["liquid_mass"])])
		else:
			inspect_el = String(info["gas_el"])
			var gname := OniElements.get_element_name(inspect_el)
			var g_grams := float(info["gas_mass"]) * 1000.0
			var d_grams := float(info["gas_delta"]) * 1000.0
			lines.append("기체: %s %.0f g (Δ %+.1f g)" % [gname, g_grams, d_grams])
		if not inspect_el.is_empty() and inspect_el != "Vacuum":
			var ed := OniElements.get_element(inspect_el)
			lines.append("물성: 비열 %.3f · 전도 %.4f · 몰 %.1f" % [float(ed.get("shc", 0.0)), float(ed.get("tc", 0.0)), float(ed.get("molar_mass", 0.0))])
		var rname := String(info.get("room_name", ""))
		var dval := float(info.get("decor", 0.0))
		if not rname.is_empty():
			lines.append("방: %s (사기 +%d) · 장식 %+.0f" % [rname, int(info.get("room_morale", 0)), dval])
		elif absf(dval) >= 1.0:
			lines.append("장식: %+.0f" % dval)
		if bool(info.get("has_logic_wire", false)):
			lines.append("자동화: %s" % ("활성(초록)" if bool(info.get("logic_signal", true)) else "대기(빨강)"))
		var gcnt := float(info.get("germ_count", 0.0))
		if gcnt >= 20.0:
			var gtn := "점액폐균" if String(info.get("germ_type", "")) == "SlimeLung" else "식중독균"
			lines.append("세균: %s %.0f" % [gtn, gcnt])
		if not String(info["building"]).is_empty():
			var b_id := String(info["building"])
			var bname := "인쇄기" if b_id == "pod" else String(OniElements.get_building(b_id).get("name_ko", b_id))
			var extra := ""
			if b_id == "battery":
				extra = " (%.1f kJ)" % (float(info["battery_j"]) / 1000.0)
			elif b_id == "hydrogen_gen":
				extra = " (H2 버퍼 %.2f kg)" % float(info["h2_buffer_kg"])
			elif b_id == "farm_tile":
				extra = " (성장 %.0f%%)" % (float(info["farm_growth"]) * 100.0)
			elif b_id in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "coal_gen", "steam_turbine", "liquid_pump", "gas_pump", "research_station"]:
				extra = " [가동]" if bool(info["machine_running"]) else " [대기]"
			lines.append("건물: %s%s" % [bname, extra])
		if bool(info["has_liquid_pipe"]):
			lines.append("액체관: 물 %.1f kg" % float(info["lpipe_mass"]))
		if bool(info["has_gas_pipe"]):
			lines.append("기체관: %s %.0f g" % [OniElements.get_element_name(String(info["gpipe_el"])), float(info["gpipe_mass"]) * 1000.0])
		if bool(info["has_wire"]):
			lines.append("배선: 전선 연결됨")
	else:
		lines.append("[타일 인스펙터] 칸 클릭 · 방(M) · 세균(J) · 도감(I)")

	lines.append("--- 복제체 현황 ---")
	for d in world.duplicants:
		lines.append("%s[%s]: %s | 사기 %d | 호흡 %.0f%%" % [d.dupe_name, d.trait_ko, d.state_ko, d.morale, d.breath])

	_inspector_lbl.text = "\n".join(lines)
