extends Node2D

var world: OniWorld
var renderer: OniRenderer
var camera: Camera2D
var audio: OniAudio

var paused := false
var speed_mult := 1.0
var active_tool := "select"

var _panning := false
var _pan_last_mouse := Vector2.ZERO
var _ui_font: FontFile
var _ui_root: Control
var _top_info_lbl: Label
var _res_info_lbl: Label
var _inspector_lbl: Label
var _status_lbl: Label
var _tool_buttons: Dictionary = {}
var _overlay_buttons: Dictionary = {}
var _speed_buttons: Dictionary = {}

const TOOL_LIST := [
	{"id": "select", "label": "선택"},
	{"id": "dig", "label": "채굴(B)"},
	{"id": "cancel", "label": "취소(C)"},
	{"id": "tile", "label": "타일"},
	{"id": "ladder", "label": "사다리"},
	{"id": "diffuser", "label": "산소확산기"},
	{"id": "generator", "label": "수동발전기"},
	{"id": "battery", "label": "배터리"},
	{"id": "wire", "label": "전선"},
	{"id": "cot", "label": "침대"},
	{"id": "storage", "label": "보관함"},
]

func _ready() -> void:
	_install_ui_font()

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

	# 상단 바
	var top_panel := PanelContainer.new()
	top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_panel.offset_bottom = 52
	_style_panel(top_panel, Color(0.08, 0.11, 0.16, 0.92))
	_ui_root.add_child(top_panel)

	var top_hbox := HBoxContainer.new()
	top_hbox.add_theme_constant_override("separation", 8)
	top_panel.add_child(top_hbox)

	var title_lbl := Label.new()
	title_lbl.text = "숨 · ONI Godot"
	title_lbl.add_theme_font_size_override("font_size", 16)
	title_lbl.add_theme_color_override("font_color", Color(0.55, 0.90, 1.0))
	top_hbox.add_child(title_lbl)

	_top_info_lbl = Label.new()
	_top_info_lbl.add_theme_font_size_override("font_size", 13)
	top_hbox.add_child(_top_info_lbl)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_hbox.add_child(spacer)

	# 배속 버튼
	for sp in [
		{"id": "pause", "label": "일시정지", "val": 0.0},
		{"id": "1x", "label": "1x", "val": 1.0},
		{"id": "2x", "label": "2x", "val": 2.0},
		{"id": "4x", "label": "4x", "val": 4.0},
	]:
		var btn := Button.new()
		btn.text = sp["label"]
		var v: float = sp["val"]
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
		_speed_buttons[sp["id"]] = btn

	var step_btn := Button.new()
	step_btn.text = "다음 기체 틱(+0.2s)"
	step_btn.pressed.connect(func():
		audio.play_click()
		paused = true
		world.step_gas_tick()
		_update_speed_buttons()
		_refresh_hud()
		renderer.queue_redraw()
	)
	top_hbox.add_child(step_btn)

	# 오버레이 버튼
	for ov in [
		{"id": "normal", "label": "기본"},
		{"id": "gas", "label": "기체(G)"},
		{"id": "temp", "label": "온도(T)"},
	]:
		var obtn := Button.new()
		obtn.text = ov["label"]
		var oid: String = ov["id"]
		obtn.pressed.connect(func():
			audio.play_click()
			_select_overlay(oid)
		)
		top_hbox.add_child(obtn)
		_overlay_buttons[oid] = obtn

	var reset_btn := Button.new()
	reset_btn.text = "새 기지"
	reset_btn.pressed.connect(func():
		audio.play_click()
		world.generate(world.seed_value + 1)
		renderer.selected_cell = Vector2i(-1, -1)
		_refresh_hud()
		renderer.queue_redraw()
	)
	top_hbox.add_child(reset_btn)

	# 좌측 상단 자원 요약 바
	var res_panel := PanelContainer.new()
	res_panel.position = Vector2(10, 60)
	res_panel.custom_minimum_size = Vector2(460, 36)
	_style_panel(res_panel, Color(0.08, 0.11, 0.16, 0.86))
	_ui_root.add_child(res_panel)

	_res_info_lbl = Label.new()
	_res_info_lbl.add_theme_font_size_override("font_size", 12)
	res_panel.add_child(_res_info_lbl)

	# 우측 하단 타일 인스펙터
	var insp_panel := PanelContainer.new()
	insp_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	insp_panel.offset_left = -330
	insp_panel.offset_top = -230
	insp_panel.offset_right = -10
	insp_panel.offset_bottom = -64
	_style_panel(insp_panel, Color(0.08, 0.11, 0.16, 0.90))
	_ui_root.add_child(insp_panel)

	_inspector_lbl = Label.new()
	_inspector_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_inspector_lbl.add_theme_font_size_override("font_size", 12)
	insp_panel.add_child(_inspector_lbl)

	# 하단 도구 바
	var bot_panel := PanelContainer.new()
	bot_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bot_panel.offset_top = -54
	_style_panel(bot_panel, Color(0.08, 0.11, 0.16, 0.94))
	_ui_root.add_child(bot_panel)

	var bot_hbox := HBoxContainer.new()
	bot_hbox.add_theme_constant_override("separation", 6)
	bot_panel.add_child(bot_hbox)

	for t in TOOL_LIST:
		var tbtn := Button.new()
		tbtn.text = t["label"]
		var tid: String = t["id"]
		tbtn.pressed.connect(func():
			audio.play_click()
			_select_tool(tid)
		)
		bot_hbox.add_child(tbtn)
		_tool_buttons[tid] = tbtn

	var bspacer := Control.new()
	bspacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bot_hbox.add_child(bspacer)

	_status_lbl = Label.new()
	_status_lbl.add_theme_font_size_override("font_size", 12)
	_status_lbl.add_theme_color_override("font_color", Color(0.75, 0.88, 0.96))
	bot_hbox.add_child(_status_lbl)

func _style_panel(p: PanelContainer, bg: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = Color(0.24, 0.36, 0.48, 0.85)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	p.add_theme_stylebox_override("panel", sb)

func _select_tool(tid: String) -> void:
	active_tool = tid
	renderer.active_tool = tid
	for k in _tool_buttons.keys():
		var btn: Button = _tool_buttons[k]
		btn.modulate = Color(0.55, 0.95, 1.0) if k == tid else Color(1, 1, 1)
	var bdef := OniElements.get_building(tid)
	if not bdef.is_empty():
		var el_ko := OniElements.get_element_name(String(bdef.get("cost_element", "SandStone")))
		_status_lbl.text = "%s (%s %.0fkg) - %s" % [bdef["name_ko"], el_ko, float(bdef["cost_kg"]), bdef["desc"]]
	elif tid == "dig":
		_status_lbl.text = "좌클릭 드래그로 채굴할 지형을 지정하세요"
	elif tid == "cancel":
		_status_lbl.text = "좌클릭 드래그로 채굴/건설 지시를 취소하세요"
	else:
		_status_lbl.text = "칸을 클릭해 원소·기체·온도를 검사하세요 (우클릭 드래그: 이동, 휠: 줌)"

func _select_overlay(oid: String) -> void:
	renderer.overlay_mode = oid
	for k in _overlay_buttons.keys():
		var btn: Button = _overlay_buttons[k]
		btn.modulate = Color(0.55, 0.95, 1.0) if k == oid else Color(1, 1, 1)
	renderer.queue_redraw()

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
	if not paused:
		var sim_dt := minf(delta, 0.05) * speed_mult
		world.step(sim_dt)
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
	var x0: int = min(c0.x, c1.x)
	var x1: int = max(c0.x, c1.x)
	var y0: int = min(c0.y, c1.y)
	var y1: int = max(c0.y, c1.y)
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if active_tool == "dig":
				world.order_dig(x, y)
			elif active_tool == "cancel":
				world.cancel_order(x, y)
			elif active_tool != "select":
				world.order_build(x, y, active_tool)

func _on_dig_completed(_cell: Vector2i, _el: String, _gained: float) -> void:
	audio.play_dig_done()

func _on_build_completed(_cell: Vector2i, _b_id: String) -> void:
	audio.play_build_done()

func _refresh_hud() -> void:
	var cyc_sec := fmod(world.sim_time, OniElements.CYCLE_SECONDS)
	_top_info_lbl.text = "주기 %d (%.0f/%.0fs) | 기체 틱 #%d | 평균 O2 %.2f kg | 전력 %.0f/%.0fW" % [
		world.cycle, cyc_sec, OniElements.CYCLE_SECONDS, world.gas_tick_count, world.avg_oxygen_kg, world.power_produced_w, world.power_consumed_w
	]

	_res_info_lbl.text = "사암 %.0fkg · 구리 %.0fkg · 조류 %.0fkg · 흙 %.0fkg · 석탄 %.0fkg | 배터리 %.1f/%.1fkJ" % [
		float(world.inventory.get("SandStone", 0.0)),
		float(world.inventory.get("Cuprite", 0.0)),
		float(world.inventory.get("Algae", 0.0)),
		float(world.inventory.get("Dirt", 0.0)),
		float(world.inventory.get("Carbon", 0.0)),
		world.total_battery_j / 1000.0,
		world.total_battery_cap_j / 1000.0,
	]

	var lines: Array[String] = []
	var sc := renderer.selected_cell
	if world.in_bounds(sc.x, sc.y):
		var info := world.get_cell_summary(sc.x, sc.y)
		lines.append("[좌표 %d, %d] 온도 %.1f°C" % [sc.x, sc.y, float(info["temp_c"])])
		if not String(info["solid_el"]).is_empty():
			lines.append("지형: %s (%.0f kg)" % [OniElements.get_element_name(info["solid_el"]), float(info["solid_mass"])])
		elif float(info["liquid_mass"]) > 1.0:
			lines.append("액체: 물 (%.0f kg)" % float(info["liquid_mass"]))
		else:
			var gname := OniElements.get_element_name(info["gas_el"])
			var g_grams := float(info["gas_mass"]) * 1000.0
			var d_grams := float(info["gas_delta"]) * 1000.0
			lines.append("기체: %s %.0f g (Δ %+.1f g)" % [gname, g_grams, d_grams])
		if not String(info["building"]).is_empty():
			var b_id := String(info["building"])
			var bname := "인쇄기" if b_id == "pod" else String(OniElements.get_building(b_id).get("name_ko", b_id))
			var extra := ""
			if b_id == "battery":
				extra = " (%.1f kJ)" % (float(info["battery_j"]) / 1000.0)
			elif b_id == "diffuser":
				extra = " [가동]" if bool(info["diffuser_running"]) else " [대기/전력·조류 확인]"
			lines.append("건물: %s%s" % [bname, extra])
		if bool(info["has_wire"]):
			lines.append("배선: 전선 연결됨")
	else:
		lines.append("[타일 인스펙터] 칸을 클릭해 확인")

	lines.append("--- 대원 현황 ---")
	for d in world.duplicants:
		lines.append("%s: %s | 호흡 %.0f%% | 체력 %.0f%%" % [d.dupe_name, d.state_ko, d.breath, d.stamina])

	_inspector_lbl.text = "\n".join(lines)
