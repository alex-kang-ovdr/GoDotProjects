class_name ModeSwitcher
extends CanvasLayer

signal orientation_changed(is_portrait: bool)

const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")
const ORIENTATION_SAVE_PATH := "user://screen_orientation.json"
const MODES := [
	{"id": "main", "label": "정식 맵", "scene": "res://scenes/main.tscn"},
	{"id": "build", "label": "빌드 모드", "scene": "res://scenes/build_mode.tscn"},
	{"id": "interior_command", "label": "함내 관제", "scene": "res://scenes/interior_command_mode.tscn"},
	{"id": "crew_combat_lab", "label": "승조원 전투실험", "scene": "res://scenes/crew_combat_lab_mode.tscn"},
	{"id": "weapon_roster", "label": "무기 일람표", "scene": "res://scenes/weapon_roster_mode.tscn"},
	{"id": "thruster_lab", "label": "추진기 실험실", "scene": "res://scenes/thruster_lab_mode.tscn"},
	{"id": "cockpit_lab", "label": "실험 조종석", "scene": "res://scenes/cockpit_lab_mode.tscn"},
	{"id": "grapple", "label": "그래플 실험실", "scene": "res://scenes/grapple_test_map.tscn"},
	{"id": "sonar", "label": "소나 실험실", "scene": "res://scenes/sonar_test_map.tscn"},
]

static var is_portrait_mode := false
static var _orientation_loaded := false

var active_mode_id := "main"
var _toggle_btn: Button
var orientation_btn: Button
var _popup_orient_btn: Button
var _popup_panel: PanelContainer
var _panel: PanelContainer
var _buttons: Dictionary = {}
var _ui_font: Font
var _ui_theme: Theme
var _expanded := false

func setup(current_mode_id: String) -> void:
	active_mode_id = current_mode_id
	_sync_dock_placement()
	_refresh_highlights()

static func _ensure_orientation_loaded() -> void:
	if _orientation_loaded:
		return
	_orientation_loaded = true
	if FileAccess.file_exists(ORIENTATION_SAVE_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(ORIENTATION_SAVE_PATH))
		if parsed is Dictionary:
			is_portrait_mode = bool((parsed as Dictionary).get("portrait", false))
			return
	if OS.has_feature("web") or OS.has_feature("mobile") or OS.has_feature("android") or OS.has_feature("ios"):
		var wsz := DisplayServer.window_get_size()
		if wsz.x > 0 and wsz.y > wsz.x:
			is_portrait_mode = true

static func _save_orientation() -> void:
	var f := FileAccess.open(ORIENTATION_SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"portrait": is_portrait_mode}))

func _ready() -> void:
	layer = 90
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_orientation_loaded()
	_load_font()
	_build_bar()
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_dock_placement)
	apply_orientation(is_portrait_mode, false)
	_refresh_highlights()

func toggle_orientation() -> bool:
	apply_orientation(not is_portrait_mode, true)
	return is_portrait_mode

func apply_orientation(portrait: bool, persist: bool = true) -> void:
	is_portrait_mode = portrait
	_orientation_loaded = true
	if persist:
		_save_orientation()
	if get_tree() != null and get_tree().root != null:
		get_tree().root.content_scale_size = Vector2i(720, 1280) if portrait else Vector2i(1280, 720)
	if OS.has_feature("mobile") or OS.has_feature("android") or OS.has_feature("ios"):
		DisplayServer.screen_set_orientation(DisplayServer.SCREEN_PORTRAIT if portrait else DisplayServer.SCREEN_SENSOR_LANDSCAPE)
	if OS.has_feature("web"):
		var mode_str := "portrait" if portrait else "landscape"
		JavaScriptBridge.eval("if(window.setGameOrientation){window.setGameOrientation('%s');}else if(screen.orientation&&screen.orientation.lock){screen.orientation.lock('%s').catch(()=>{});}" % [mode_str, mode_str])
	_sync_dock_placement()
	_refresh_highlights()
	orientation_changed.emit(is_portrait_mode)
	call_deferred("_deferred_orientation_sync")

func _deferred_orientation_sync() -> void:
	if not is_inside_tree():
		return
	_sync_dock_placement()
	_refresh_highlights()
	orientation_changed.emit(is_portrait_mode)

func _sync_dock_placement() -> void:
	if _panel == null or _popup_panel == null:
		return
	var vp := Vector2(1280.0, 720.0)
	if get_viewport() != null:
		vp = get_viewport().get_visible_rect().size
	var narrow := is_portrait_mode or vp.x < 960.0
	var ultra_narrow := vp.x < 640.0
	var is_lab := (active_mode_id == "grapple" or active_mode_id == "sonar" or active_mode_id == "grapple_test" or active_mode_id == "sonar_test")
	var is_cosmo_page := (active_mode_id == "weapon_roster" or active_mode_id == "thruster_lab" or active_mode_id == "cockpit_lab" or active_mode_id == "interior_command" or active_mode_id == "crew_combat_lab")

	var btn_fsz := 18 if ultra_narrow else 21
	if _toggle_btn != null:
		_toggle_btn.add_theme_font_size_override("font_size", btn_fsz)
	if orientation_btn != null:
		orientation_btn.add_theme_font_size_override("font_size", btn_fsz)

	var dock_h := 84.0
	if narrow:
		var pw := minf(256.0 if ultra_narrow else 296.0, vp.x - 20.0)
		var dock_bottom := -10.0
		if is_cosmo_page:
			dock_bottom = -10.0
		elif is_lab:
			dock_bottom = -142.0
		elif active_mode_id == "main":
			dock_bottom = -114.0
		else:
			dock_bottom = -106.0
		var dock_top := dock_bottom - dock_h
		_panel.anchor_left = 1.0
		_panel.anchor_right = 1.0
		_panel.anchor_top = 1.0
		_panel.anchor_bottom = 1.0
		_panel.offset_left = -10.0 - pw
		_panel.offset_right = -10.0
		_panel.offset_top = dock_top
		_panel.offset_bottom = dock_bottom

		var pop_w := minf(330.0, vp.x - 20.0)
		var pop_h := minf(480.0, maxf(200.0, vp.y + dock_top - 22.0))
		_popup_panel.anchor_left = 1.0
		_popup_panel.anchor_right = 1.0
		_popup_panel.anchor_top = 1.0
		_popup_panel.anchor_bottom = 1.0
		_popup_panel.offset_left = -10.0 - pop_w
		_popup_panel.offset_right = -10.0
		_popup_panel.offset_bottom = dock_top - 8.0
		_popup_panel.offset_top = dock_top - 8.0 - pop_h
	elif is_cosmo_page:
		var pw := minf(308.0, vp.x - 20.0)
		_panel.anchor_left = 1.0
		_panel.anchor_right = 1.0
		_panel.anchor_top = 1.0
		_panel.anchor_bottom = 1.0
		_panel.offset_left = -10.0 - pw
		_panel.offset_right = -10.0
		_panel.offset_top = -10.0 - dock_h
		_panel.offset_bottom = -10.0

		var pop_w := minf(340.0, vp.x - 20.0)
		var pop_h := minf(480.0, maxf(200.0, vp.y - 122.0))
		_popup_panel.anchor_left = 1.0
		_popup_panel.anchor_right = 1.0
		_popup_panel.anchor_top = 1.0
		_popup_panel.anchor_bottom = 1.0
		_popup_panel.offset_left = -10.0 - pop_w
		_popup_panel.offset_right = -10.0
		_popup_panel.offset_bottom = -102.0
		_popup_panel.offset_top = -102.0 - pop_h
	elif active_mode_id == "main":
		var pw := 290.0
		_panel.anchor_left = 0.0
		_panel.anchor_right = 0.0
		_panel.anchor_top = 1.0
		_panel.anchor_bottom = 1.0
		_panel.offset_left = 286.0
		_panel.offset_right = 286.0 + pw
		_panel.offset_top = -10.0 - dock_h
		_panel.offset_bottom = -10.0

		var pop_w := 336.0
		var pop_h := minf(470.0, maxf(200.0, vp.y - 124.0))
		_popup_panel.anchor_left = 0.0
		_popup_panel.anchor_right = 0.0
		_popup_panel.anchor_top = 1.0
		_popup_panel.anchor_bottom = 1.0
		_popup_panel.offset_left = 286.0
		_popup_panel.offset_right = 286.0 + pop_w
		_popup_panel.offset_bottom = -102.0
		_popup_panel.offset_top = -102.0 - pop_h
	elif active_mode_id == "build":
		var pw := 288.0
		_panel.anchor_left = 0.0
		_panel.anchor_right = 0.0
		_panel.anchor_top = 1.0
		_panel.anchor_bottom = 1.0
		_panel.offset_left = 478.0
		_panel.offset_right = 478.0 + pw
		_panel.offset_top = -10.0 - dock_h
		_panel.offset_bottom = -10.0

		var pop_w := 336.0
		var pop_h := minf(470.0, maxf(200.0, vp.y - 124.0))
		_popup_panel.anchor_left = 0.0
		_popup_panel.anchor_right = 0.0
		_popup_panel.anchor_top = 1.0
		_popup_panel.anchor_bottom = 1.0
		_popup_panel.offset_left = 454.0
		_popup_panel.offset_right = 454.0 + pop_w
		_popup_panel.offset_bottom = -102.0
		_popup_panel.offset_top = -102.0 - pop_h
	else:
		# Grapple / Sonar landscape: bottom-right cleanly above bottom touch bar
		var pw := 304.0
		var dock_bottom := -88.0
		var dock_top := dock_bottom - dock_h
		_panel.anchor_left = 1.0
		_panel.anchor_right = 1.0
		_panel.anchor_top = 1.0
		_panel.anchor_bottom = 1.0
		_panel.offset_left = -12.0 - pw
		_panel.offset_right = -12.0
		_panel.offset_top = dock_top
		_panel.offset_bottom = dock_bottom

		var pop_w := 340.0
		var pop_h := minf(440.0, maxf(200.0, vp.y + dock_top - 22.0))
		_popup_panel.anchor_left = 1.0
		_popup_panel.anchor_right = 1.0
		_popup_panel.anchor_top = 1.0
		_popup_panel.anchor_bottom = 1.0
		_popup_panel.offset_left = -12.0 - pop_w
		_popup_panel.offset_right = -12.0
		_popup_panel.offset_bottom = dock_top - 8.0
		_popup_panel.offset_top = dock_top - 8.0 - pop_h

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_style(bg: Color, border: Color, radius: int = 10, margin: int = 6) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, margin, margin, 2)

func _active_mode_label() -> String:
	for m in MODES:
		if str(m.id) == active_mode_id:
			return str(m.label)
	return "모드"

func _build_bar() -> void:
	_panel = PanelContainer.new()
	if _ui_theme != null:
		_panel.theme = _ui_theme
	_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.92), 12, 6))
	add_child(_panel)

	var dock_row := HBoxContainer.new()
	dock_row.add_theme_constant_override("separation", 6)
	_panel.add_child(dock_row)

	_toggle_btn = Button.new()
	_toggle_btn.focus_mode = Control.FOCUS_NONE
	_toggle_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_toggle_btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_toggle_btn.size_flags_stretch_ratio = 1.45
	_toggle_btn.custom_minimum_size = Vector2(0, 68)
	_toggle_btn.clip_text = true
	_toggle_btn.add_theme_font_size_override("font_size", 21)
	_toggle_btn.add_theme_color_override("font_color", Color("9ef8ff"))
	_toggle_btn.add_theme_stylebox_override("normal", _make_style(Color(0.06, 0.16, 0.28, 0.94), Color(0.32, 0.78, 0.98, 0.72), 9, 5))
	_toggle_btn.pressed.connect(toggle_expanded)
	dock_row.add_child(_toggle_btn)

	orientation_btn = Button.new()
	orientation_btn.focus_mode = Control.FOCUS_NONE
	orientation_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	orientation_btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
	orientation_btn.custom_minimum_size = Vector2(0, 68)
	orientation_btn.clip_text = true
	orientation_btn.add_theme_font_size_override("font_size", 21)
	orientation_btn.pressed.connect(func() -> void: toggle_orientation())
	dock_row.add_child(orientation_btn)

	# 상단 펼치기 패널 (플릭 스크롤 내장 · 2배 확대 버튼)
	_popup_panel = PanelContainer.new()
	_popup_panel.visible = false
	if _ui_theme != null:
		_popup_panel.theme = _ui_theme
	_popup_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.07, 0.14, 0.98), Color(0.42, 0.90, 1.0, 0.95), 12, 10))
	add_child(_popup_panel)

	var pop_scroll := FlickScrollScript.new()
	pop_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pop_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_popup_panel.add_child(pop_scroll)

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 7)
	pop_scroll.add_child(vbox)

	var hdr := Label.new()
	hdr.text = "맵 · 화면 전환"
	hdr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hdr.add_theme_font_size_override("font_size", 24)
	hdr.add_theme_color_override("font_color", Color("ffd36e"))
	vbox.add_child(hdr)

	for m in MODES:
		var btn := Button.new()
		btn.text = str(m.label)
		btn.custom_minimum_size = Vector2(0, 52)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.focus_mode = Control.FOCUS_NONE
		btn.add_theme_font_size_override("font_size", 22)
		var scene_path: String = m.scene
		var mode_id: String = m.id
		btn.pressed.connect(func() -> void:
			set_expanded(false)
			switch_to(mode_id, scene_path))
		vbox.add_child(btn)
		_buttons[mode_id] = btn

	_popup_orient_btn = Button.new()
	_popup_orient_btn.custom_minimum_size = Vector2(0, 52)
	_popup_orient_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_popup_orient_btn.focus_mode = Control.FOCUS_NONE
	_popup_orient_btn.add_theme_font_size_override("font_size", 21)
	_popup_orient_btn.pressed.connect(func() -> void: toggle_orientation())
	vbox.add_child(_popup_orient_btn)

	var fs_btn := Button.new()
	fs_btn.text = "전체화면 전환"
	fs_btn.custom_minimum_size = Vector2(0, 52)
	fs_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fs_btn.focus_mode = Control.FOCUS_NONE
	fs_btn.add_theme_font_size_override("font_size", 22)
	fs_btn.add_theme_stylebox_override("normal", _make_style(Color(0.08, 0.16, 0.26, 0.92), Color(0.36, 0.72, 0.92, 0.75), 8, 6))
	fs_btn.add_theme_color_override("font_color", Color("d8f0ff"))
	fs_btn.pressed.connect(func() -> void:
		set_expanded(false)
		_toggle_fullscreen())
	vbox.add_child(fs_btn)

func toggle_expanded() -> void:
	set_expanded(not _expanded)

func set_expanded(v: bool) -> void:
	_expanded = v
	if _popup_panel != null:
		_popup_panel.visible = _expanded
	_refresh_highlights()

func _refresh_highlights() -> void:
	if _toggle_btn != null:
		var arrow := "▼" if _expanded else "▲"
		_toggle_btn.text = "모드 %s\n%s" % [arrow, _active_mode_label()]
	if orientation_btn != null:
		orientation_btn.text = "화면\n세로" if is_portrait_mode else "화면\n가로"
		var ost := _make_style(
			Color(0.32, 0.22, 0.08, 0.95) if is_portrait_mode else Color(0.08, 0.28, 0.36, 0.95),
			Color(1.0, 0.82, 0.36, 0.95) if is_portrait_mode else Color(0.45, 0.94, 1.0, 0.90), 9, 5)
		orientation_btn.add_theme_stylebox_override("normal", ost)
		orientation_btn.add_theme_color_override("font_color", Color("ffe08c") if is_portrait_mode else Color("a8f8ff"))
	if _popup_orient_btn != null:
		_popup_orient_btn.text = "방향: 세로 -> 가로" if is_portrait_mode else "방향: 가로 -> 세로"
		_popup_orient_btn.add_theme_stylebox_override("normal", _make_style(Color(0.18, 0.24, 0.12, 0.92), Color(0.68, 0.95, 0.55, 0.85), 8, 6))
		_popup_orient_btn.add_theme_color_override("font_color", Color("d8ffc0"))
	for mode_id in _buttons:
		var btn: Button = _buttons[mode_id]
		var is_cur: bool = (mode_id == active_mode_id)
		var st := _make_style(
			Color(0.14, 0.44, 0.62, 0.96) if is_cur else Color(0.06, 0.11, 0.20, 0.88),
			Color(0.55, 0.96, 1.0, 1.0) if is_cur else Color(0.24, 0.48, 0.68, 0.55), 8, 6)
		btn.add_theme_stylebox_override("normal", st)
		btn.add_theme_color_override("font_color", Color("ffffff") if is_cur else Color("b4d8f2"))

func _input(event: InputEvent) -> void:
	if not _expanded:
		return
	var clicked := false
	var pos := Vector2.ZERO
	if event is InputEventMouseButton and event.pressed and event.device != -1:
		clicked = true
		pos = event.position
	elif event is InputEventScreenTouch and event.pressed:
		clicked = true
		pos = event.position
	if clicked and not is_point_inside(pos):
		set_expanded(false)

func switch_to(mode_id: String, scene_path: String) -> void:
	if mode_id == active_mode_id:
		return
	if get_tree() != null:
		get_tree().paused = false
		get_tree().change_scene_to_file(scene_path)

func _toggle_fullscreen() -> void:
	var cur := DisplayServer.window_get_mode()
	if cur == DisplayServer.WINDOW_MODE_FULLSCREEN or cur == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	apply_orientation(is_portrait_mode, false)

func is_point_inside(screen_pos: Vector2) -> bool:
	if _panel != null and _panel.visible and _panel.get_global_rect().has_point(screen_pos):
		return true
	if _popup_panel != null and _popup_panel.visible and _popup_panel.get_global_rect().has_point(screen_pos):
		return true
	return false
