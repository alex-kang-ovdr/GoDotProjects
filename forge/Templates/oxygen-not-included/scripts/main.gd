extends Node2D

var world: OniWorld
var renderer: OniRenderer
var camera: Camera2D
var audio: OniAudio

var paused := false
var speed_mult := 1.0
var active_tool := "select"
var active_cat := "base"
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
var _atmo_shader_mat: ShaderMaterial
var _tool_buttons: Dictionary = {}
var _cat_buttons: Dictionary = {}
var _overlay_buttons: Dictionary = {}
var _speed_buttons: Dictionary = {}

const CATEGORIES := [
	{"id": "base", "label": "기본"},
	{"id": "power", "label": "전력·산소"},
	{"id": "pipe", "label": "배관"},
	{"id": "colony", "label": "농사·연구"},
	{"id": "space", "label": "우주"},
]

const CAT_TOOLS := {
	"base": ["tile", "insulated_tile", "ladder", "cot", "storage"],
	"power": ["diffuser", "electrolyzer", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "battery", "wire"],
	"pipe": ["liquid_pipe", "liquid_pump", "liquid_vent", "gas_pipe", "gas_pump", "gas_vent"],
	"colony": ["farm_tile", "research_station"],
	"space": ["rocket_steam_engine", "rocket_research_module", "rocket_command_module"],
}

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

	# 상단 바 (PIE 좌측 상단 오버레이 회피)
	var top_panel := PanelContainer.new()
	top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_panel.offset_left = 260
	top_panel.offset_bottom = 48
	_style_panel(top_panel, Color(0.08, 0.11, 0.16, 0.92))
	_ui_root.add_child(top_panel)

	var top_hbox := HBoxContainer.new()
	top_hbox.add_theme_constant_override("separation", 6)
	top_panel.add_child(top_hbox)

	var title_lbl := Label.new()
	title_lbl.text = "숨 · ONI 4.4"
	title_lbl.add_theme_font_size_override("font_size", 15)
	title_lbl.add_theme_color_override("font_color", Color(0.55, 0.90, 1.0))
	top_hbox.add_child(title_lbl)

	_top_info_lbl = Label.new()
	_top_info_lbl.add_theme_font_size_override("font_size", 12)
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

	var step_btn := Button.new()
	step_btn.text = "틱+0.2s"
	step_btn.pressed.connect(func():
		audio.play_click()
		paused = true
		world.step_gas_tick()
		_update_speed_buttons()
		_refresh_hud()
		renderer.queue_redraw()
	)
	top_hbox.add_child(step_btn)

	for ov in [
		{"id": "normal", "label": "기본"},
		{"id": "gas", "label": "기체(G)"},
		{"id": "temp", "label": "온도(T)"},
		{"id": "pipe", "label": "배관(P)"},
	]:
		var obtn := Button.new()
		obtn.text = String(ov["label"])
		var oid := String(ov["id"])
		obtn.pressed.connect(func():
			audio.play_click()
			_select_overlay(oid)
		)
		top_hbox.add_child(obtn)
		_overlay_buttons[oid] = obtn

	var res_btn := Button.new()
	res_btn.text = "연구(R)"
	res_btn.pressed.connect(func():
		audio.play_click()
		_toggle_research_panel()
	)
	top_hbox.add_child(res_btn)

	var audit_btn := Button.new()
	audit_btn.text = "도감/셰이더(I)"
	audit_btn.pressed.connect(func():
		audio.play_toggle()
		_toggle_audit_panel()
	)
	top_hbox.add_child(audit_btn)

	var reset_btn := Button.new()
	reset_btn.text = "새 기지"
	reset_btn.pressed.connect(func():
		audio.play_click()
		world.generate(world.seed_value + 1)
		renderer.selected_cell = Vector2i(-1, -1)
		_rebuild_tool_buttons()
		_refresh_research_panel()
		_refresh_hud()
		renderer.queue_redraw()
	)
	top_hbox.add_child(reset_btn)

	# 상단 2줄째 자원 요약 바 (PIE 좌측 오버레이와 겹치지 않도록 우측 편향 배치)
	var res_panel := PanelContainer.new()
	res_panel.position = Vector2(220, 54)
	res_panel.custom_minimum_size = Vector2(640, 32)
	_style_panel(res_panel, Color(0.08, 0.11, 0.16, 0.86))
	_ui_root.add_child(res_panel)

	_res_info_lbl = Label.new()
	_res_info_lbl.add_theme_font_size_override("font_size", 12)
	res_panel.add_child(_res_info_lbl)

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

	# 도감 / 셰이더 / 에셋 추출 완결 감사 팝업 (I)
	_audit_panel = PanelContainer.new()
	_audit_panel.position = Vector2(220, 96)
	_audit_panel.custom_minimum_size = Vector2(620, 230)
	_audit_panel.visible = false
	_style_panel(_audit_panel, Color(0.08, 0.12, 0.18, 0.96))
	_ui_root.add_child(_audit_panel)

	_audit_lbl = Label.new()
	_audit_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_audit_lbl.add_theme_font_size_override("font_size", 12)
	_audit_lbl.text = "\n".join(OniMedia.get_complete_audit_lines())
	_audit_panel.add_child(_audit_lbl)

	# 우측 하단 타일 인스펙터
	var insp_panel := PanelContainer.new()
	insp_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	insp_panel.offset_left = -350
	insp_panel.offset_top = -255
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
	renderer.queue_redraw()

func _toggle_research_panel() -> void:
	_research_panel.visible = not _research_panel.visible
	if _research_panel.visible:
		_audit_panel.visible = false
		_refresh_research_panel()

func _toggle_audit_panel() -> void:
	_audit_panel.visible = not _audit_panel.visible
	if _audit_panel.visible:
		_research_panel.visible = false
		_audit_lbl.text = "\n".join(OniMedia.get_complete_audit_lines())

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
	renderer.queue_redraw()

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
	_top_info_lbl.text = "주기 %d (%.0fs) | 틱 #%d | O2 %.2fkg | 전력 %.0f/%.0fW" % [
		world.cycle, cyc_sec, world.gas_tick_count, world.avg_oxygen_kg, world.power_produced_w, world.power_consumed_w
	]

	var tech_str := "완료"
	if not world.active_tech.is_empty():
		var td := OniElements.get_tech(world.active_tech)
		tech_str = "%s %.0f/%.0f" % [String(td.get("name_ko", world.active_tech)), float(world.tech_progress.get(world.active_tech, 0.0)), float(td.get("cost_basic", 10.0))]

	_res_info_lbl.text = "%s | %s | 사암 %.0f · 구리 %.0f · 조류 %.0f | 식량 %.0fkcal | 연구: %s" % [
		OniElements.get_counts_summary(),
		OniMedia.get_media_summary(),
		float(world.inventory.get("SandStone", 0.0)),
		float(world.inventory.get("Cuprite", 0.0)),
		float(world.inventory.get("Algae", 0.0)),
		world.food_kcal,
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
			inspect_el = "Water"
			lines.append("액체: 물 (%.0f kg)" % float(info["liquid_mass"]))
		else:
			inspect_el = String(info["gas_el"])
			var gname := OniElements.get_element_name(inspect_el)
			var g_grams := float(info["gas_mass"]) * 1000.0
			var d_grams := float(info["gas_delta"]) * 1000.0
			lines.append("기체: %s %.0f g (Δ %+.1f g)" % [gname, g_grams, d_grams])
		if not inspect_el.is_empty() and inspect_el != "Vacuum":
			var ed := OniElements.get_element(inspect_el)
			lines.append("물성: 비열 %.3f · 전도 %.4f · 몰 %.1f" % [float(ed.get("shc", 0.0)), float(ed.get("tc", 0.0)), float(ed.get("molar_mass", 0.0))])
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
			elif b_id in ["diffuser", "electrolyzer", "coal_gen", "steam_turbine", "liquid_pump", "gas_pump", "research_station"]:
				extra = " [가동]" if bool(info["machine_running"]) else " [대기]"
			lines.append("건물: %s%s" % [bname, extra])
		if bool(info["has_liquid_pipe"]):
			lines.append("액체관: 물 %.1f kg" % float(info["lpipe_mass"]))
		if bool(info["has_gas_pipe"]):
			lines.append("기체관: %s %.0f g" % [OniElements.get_element_name(String(info["gpipe_el"])), float(info["gpipe_mass"]) * 1000.0])
		if bool(info["has_wire"]):
			lines.append("배선: 전선 연결됨")
	else:
		lines.append("[타일 인스펙터] 칸을 클릭해 확인")

	lines.append("--- 대원 현황 ---")
	for d in world.duplicants:
		lines.append("%s: %s | 호흡 %.0f%% | 체력 %.0f%%" % [d.dupe_name, d.state_ko, d.breath, d.stamina])

	_inspector_lbl.text = "\n".join(lines)
