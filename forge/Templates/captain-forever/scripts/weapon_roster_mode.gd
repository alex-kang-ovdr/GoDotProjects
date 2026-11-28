class_name WeaponRosterMode
extends Node2D

## 코스모티어 무기 일람표 · 실시간 데모 시연 모드 (2배 확대 UI·폰트 및 반응형 무클리핑 배치).

const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const ArenaScript = preload("res://scripts/weapon_demo_arena.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const SURFACE := Color(0.05, 0.11, 0.18, 0.96)
const EDGE := Color(0.24, 0.62, 0.84, 0.88)
const WHITE := Color("#e4f4ff")
const SOFT := Color("#9ec4da")
const GREEN := Color("#74f2ce")
const GOLD := Color("#ffd175")

var mode_switcher: ModeSwitcher
var sfx: CosmoteerSfx
var _ui_layer: CanvasLayer
var _ui_font: Font
var _ui_theme: Theme

var _main_panel: PanelContainer
var _header_box: BoxContainer
var _body_split: BoxContainer
var _left_panel: PanelContainer
var _right_panel: PanelContainer
var _roster_scroll: ScrollContainer
var _roster_grid: GridContainer
var _controls_grid: GridContainer
var _sliders_scroll: ScrollContainer
var _sliders_grid: GridContainer
var _quick_dock: PanelContainer
var _q_cockpit_btn: Button

var _header_title: Label
var _telemetry_label: Label
var _roster_summary: Label
var _category_picker: OptionButton
var _search_box: LineEdit

var arena: WeaponDemoArena
var play_button: Button
var shield_button: Button
var move_button: Button
var apply_button: Button
var target_dist_slider: HSlider
var target_dist_label: Label

var roster: Array[Dictionary] = []
var visible_roster: Array[Dictionary] = []
var selected_entry: Dictionary = {}
var current_params: Dictionary = {}
var _weapon_buttons: Array[Button] = []
var sliders: Dictionary = {}
var slider_labels: Dictionary = {}
var _syncing_sliders := false

const SLIDER_SPECS := [
	["damage", "공격력", 100.0, 8000.0, 25.0, "%.0f"],
	["fire_interval", "발사 간격", 0.06, 4.0, 0.02, "%.2f초"],
	["projectile_speed", "탄속", 60.0, 1200.0, 10.0, "%.0fm/s"],
	["range", "사거리", 60.0, 500.0, 5.0, "%.0fm"],
	["aoe_radius", "광역 반경", 0.0, 14.0, 0.2, "%.1fm"],
	["penetration", "돌파력", 0.0, 30.0, 0.5, "%.1f"],
	["shield_damage_mult", "방어배수", 0.5, 6.0, 0.1, "%.1f×"],
	["ignite_intensity", "화재 강도", 0.0, 1.0, 0.05, "%.2f"],
	["target_distance", "표적 거리", 35.0, 520.0, 5.0, "%.0fm"],
]

func _ready() -> void:
	CosmoteerAssets.ensure_loaded()
	_load_font()
	sfx = CosmoteerSfx.new()
	add_child(sfx)

	mode_switcher = ModeSwitcherScript.new()
	add_child(mode_switcher)
	mode_switcher.setup("weapon_roster")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	roster = CosmoteerWeaponData.get_roster()
	_build_ui()
	_refresh_list()
	_sync_responsive_layout()

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_style(bg: Color, border: Color, radius: int = 10, margin: int = 9) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, margin, margin, 2)

func _make_btn(caption: String, cb: Callable, accent := false) -> Button:
	var b := Button.new()
	b.text = caption
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 48)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.clip_text = true
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_color_override("font_color", GREEN if accent else WHITE)
	b.add_theme_stylebox_override("normal", _make_style(Color(0.08, 0.24, 0.22, 0.96) if accent else Color(0.07, 0.14, 0.24, 0.94), GREEN if accent else EDGE, 8, 6))
	b.pressed.connect(cb)
	return b

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
	root.add_theme_constant_override("separation", 8)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_panel.add_child(root)

	_header_box = BoxContainer.new()
	_header_box.vertical = false
	_header_box.add_theme_constant_override("separation", 6)
	root.add_child(_header_box)

	_header_title = Label.new()
	_header_title.text = "무기 일람표 · 실시간 시연"
	_header_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title.clip_text = true
	_header_title.add_theme_font_size_override("font_size", 26)
	_header_title.add_theme_color_override("font_color", GOLD)
	_header_box.add_child(_header_title)

	_telemetry_label = Label.new()
	_telemetry_label.text = "실측 화력 0 DPS"
	_telemetry_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_telemetry_label.clip_text = true
	_telemetry_label.add_theme_font_size_override("font_size", 20)
	_telemetry_label.add_theme_color_override("font_color", GREEN)
	_header_box.add_child(_telemetry_label)

	_body_split = BoxContainer.new()
	_body_split.vertical = false
	_body_split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_split.add_theme_constant_override("separation", 8)
	root.add_child(_body_split)

	# 좌측(세로 시 상단): 18종 무기 목록 + 필터
	_left_panel = PanelContainer.new()
	_left_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_left_panel)

	var left_col := VBoxContainer.new()
	left_col.add_theme_constant_override("separation", 7)
	left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_left_panel.add_child(left_col)

	var filter_row := HBoxContainer.new()
	filter_row.add_theme_constant_override("separation", 6)
	left_col.add_child(filter_row)

	_category_picker = OptionButton.new()
	_category_picker.custom_minimum_size = Vector2(0, 48)
	_category_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_category_picker.clip_text = true
	_category_picker.add_theme_font_size_override("font_size", 20)
	for cat in CosmoteerWeaponData.CATEGORIES:
		_category_picker.add_item(str(cat.label))
		_category_picker.set_item_metadata(_category_picker.item_count - 1, str(cat.id))
	_category_picker.item_selected.connect(func(_idx: int) -> void: _refresh_list())
	filter_row.add_child(_category_picker)

	_search_box = LineEdit.new()
	_search_box.placeholder_text = "무기 검색"
	_search_box.clear_button_enabled = true
	_search_box.custom_minimum_size = Vector2(0, 48)
	_search_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_search_box.add_theme_font_size_override("font_size", 20)
	_search_box.text_changed.connect(func(_t: String) -> void: _refresh_list())
	filter_row.add_child(_search_box)

	_roster_scroll = FlickScrollScript.new()
	_roster_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_roster_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_col.add_child(_roster_scroll)

	_roster_grid = GridContainer.new()
	_roster_grid.columns = 1
	_roster_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_roster_grid.add_theme_constant_override("h_separation", 6)
	_roster_grid.add_theme_constant_override("v_separation", 6)
	_roster_scroll.add_child(_roster_grid)

	_roster_summary = Label.new()
	_roster_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_roster_summary.add_theme_font_size_override("font_size", 18)
	_roster_summary.add_theme_color_override("font_color", SOFT)
	left_col.add_child(_roster_summary)

	# 우측(세로 시 하단): 시연장 + 2배 타겟 거리 바 + 제어 버튼 + 9종 슬라이더
	_right_panel = PanelContainer.new()
	_right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_right_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_right_panel)

	var right_col := VBoxContainer.new()
	right_col.add_theme_constant_override("separation", 7)
	right_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_child(right_col)

	arena = ArenaScript.new()
	arena.sfx = sfx
	arena.ui_font = _ui_font
	arena.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena.size_flags_vertical = Control.SIZE_EXPAND_FILL
	arena.target_distance_dragged.connect(func(new_d: float) -> void:
		set_target_distance(new_d))
	right_col.add_child(arena)

	var dist_bar := HBoxContainer.new()
	dist_bar.add_theme_constant_override("separation", 8)
	right_col.add_child(dist_bar)

	var d_title := Label.new()
	d_title.text = "타겟 거리"
	d_title.add_theme_font_size_override("font_size", 21)
	d_title.add_theme_color_override("font_color", GOLD)
	dist_bar.add_child(d_title)

	var d_near := _make_btn("-50m", func() -> void: set_target_distance(float(current_params.get("target_distance", 160.0)) - 50.0))
	d_near.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	d_near.custom_minimum_size = Vector2(84, 46)
	dist_bar.add_child(d_near)

	target_dist_slider = HSlider.new()
	target_dist_slider.min_value = 35.0
	target_dist_slider.max_value = 520.0
	target_dist_slider.step = 5.0
	target_dist_slider.value = 160.0
	target_dist_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	target_dist_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	target_dist_slider.value_changed.connect(func(v: float) -> void: set_target_distance(v))
	dist_bar.add_child(target_dist_slider)

	var d_far := _make_btn("+50m", func() -> void: set_target_distance(float(current_params.get("target_distance", 160.0)) + 50.0))
	d_far.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	d_far.custom_minimum_size = Vector2(84, 46)
	dist_bar.add_child(d_far)

	target_dist_label = Label.new()
	target_dist_label.text = "160 m"
	target_dist_label.custom_minimum_size = Vector2(88, 0)
	target_dist_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	target_dist_label.add_theme_font_size_override("font_size", 21)
	target_dist_label.add_theme_color_override("font_color", GREEN)
	dist_bar.add_child(target_dist_label)

	var controls := GridContainer.new()
	controls.columns = 6
	controls.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	controls.add_theme_constant_override("h_separation", 6)
	controls.add_theme_constant_override("v_separation", 6)
	right_col.add_child(controls)
	_controls_grid = controls

	play_button = _make_btn("시연 정지", _toggle_play)
	controls.add_child(play_button)
	controls.add_child(_make_btn("단발 발사", func() -> void: arena.fire_once()))
	shield_button = _make_btn("방어막 켬", _toggle_shield)
	controls.add_child(shield_button)
	move_button = _make_btn("표적이동 끔", _toggle_move)
	controls.add_child(move_button)
	controls.add_child(_make_btn("기본값 복원", _reset_current_params))
	apply_button = _make_btn("전투 적용", _apply_to_battle, true)
	controls.add_child(apply_button)

	_sliders_scroll = FlickScrollScript.new()
	_sliders_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.add_child(_sliders_scroll)

	_sliders_grid = GridContainer.new()
	_sliders_grid.columns = 2
	_sliders_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sliders_grid.add_theme_constant_override("h_separation", 14)
	_sliders_grid.add_theme_constant_override("v_separation", 8)
	_sliders_scroll.add_child(_sliders_grid)

	for sp: Array in SLIDER_SPECS:
		var key := str(sp[0])
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var nm := Label.new()
		nm.text = str(sp[1])
		nm.custom_minimum_size = Vector2(96, 0)
		nm.clip_text = true
		nm.add_theme_font_size_override("font_size", 19)
		nm.add_theme_color_override("font_color", WHITE)
		row.add_child(nm)
		var sl := HSlider.new()
		sl.min_value = float(sp[2])
		sl.max_value = float(sp[3])
		sl.step = float(sp[4])
		sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sl.value_changed.connect(_on_slider_changed.bind(key, str(sp[5])))
		row.add_child(sl)
		var vl := Label.new()
		vl.custom_minimum_size = Vector2(88, 0)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		vl.clip_text = true
		vl.add_theme_font_size_override("font_size", 19)
		vl.add_theme_color_override("font_color", GREEN)
		row.add_child(vl)
		_sliders_grid.add_child(row)
		sliders[key] = sl
		slider_labels[key] = vl

	# 하단 좌측 바로가기 독 (ModeSwitcher와 나란히 84px 높이 정렬)
	_quick_dock = PanelContainer.new()
	if _ui_theme != null:
		_quick_dock.theme = _ui_theme
	_quick_dock.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.88), 12, 6))
	_ui_layer.add_child(_quick_dock)

	var qrow := HBoxContainer.new()
	qrow.add_theme_constant_override("separation", 6)
	_quick_dock.add_child(qrow)
	var b_thr := _make_btn("추진 실험실 ▶", func() -> void: get_tree().change_scene_to_file("res://scenes/thruster_lab_mode.tscn"), true)
	b_thr.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_thr)
	_q_cockpit_btn = _make_btn("실험 조종석", func() -> void: get_tree().change_scene_to_file("res://scenes/cockpit_lab_mode.tscn"))
	_q_cockpit_btn.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(_q_cockpit_btn)
	var b_main := _make_btn("정식 맵", func() -> void: get_tree().change_scene_to_file("res://scenes/main.tscn"))
	b_main.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_main)

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

	if _q_cockpit_btn != null:
		_q_cockpit_btn.visible = not narrow

	if narrow:
		_header_box.vertical = true
		_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		_body_split.vertical = true
		_left_panel.custom_minimum_size = Vector2.ZERO
		_left_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_left_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		_roster_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.15, 132.0, 195.0))
		_roster_grid.columns = 1
		if _controls_grid != null:
			_controls_grid.columns = 3
		_sliders_grid.columns = 1 if vp.x < 700.0 else 2
		_sliders_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.15, 128.0, 195.0))
		arena.custom_minimum_size = Vector2(0, clampf(vp.y * 0.19, 155.0, 250.0))

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
		_header_box.vertical = false
		_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_body_split.vertical = false
		_left_panel.custom_minimum_size = Vector2(clampf(vp.x * 0.29, 340.0, 395.0), 0)
		_left_panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_roster_scroll.custom_minimum_size = Vector2(0, 160)
		_roster_grid.columns = 1
		if _controls_grid != null:
			_controls_grid.columns = 6
		_sliders_grid.columns = 2
		_sliders_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.20, 118.0, 150.0))
		arena.custom_minimum_size = Vector2(0, 168)

		var qw := minf(520.0, vp.x - 340.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0

func _refresh_list() -> void:
	if _roster_grid == null:
		return
	for ch in _roster_grid.get_children():
		ch.queue_free()
	_weapon_buttons.clear()
	visible_roster.clear()

	var sel_cat := str(_category_picker.get_item_metadata(_category_picker.selected)) if _category_picker.selected >= 0 else "all"
	var q := _search_box.text.strip_edges().to_lower()

	for entry in roster:
		if sel_cat != "all" and str(entry.cat) != sel_cat:
			continue
		if not q.is_empty() and not (q in str(entry.name).to_lower() or q in str(entry.id).to_lower() or q in str(entry.role).to_lower()):
			continue
		visible_roster.append(entry)
		var base: Dictionary = entry.defaults
		var dk := str(entry.demo_kind)
		var ov := CosmoteerWeaponData.get_weapon_override(dk)
		var eff_dmg := float(ov.get("damage", base.damage))
		var eff_int := float(ov.get("fire_interval", base.fire_interval))
		var dps := eff_dmg if dk in ["ion", "resonance", "mining"] else (eff_dmg / maxf(0.05, eff_int))
		var mark := " ★" if not ov.is_empty() else ""

		var btn := Button.new()
		btn.text = "%s%s (%d)" % [str(entry.name), mark, roundi(dps)]
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.focus_mode = Control.FOCUS_NONE
		btn.clip_text = true
		btn.custom_minimum_size = Vector2(0, 50)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 19)
		var tex := CosmoteerAssets.get_part_texture(str(entry.id), "cutaway")
		if tex != null:
			btn.icon = tex
			btn.expand_icon = true
		var idx := visible_roster.size() - 1
		btn.pressed.connect(func() -> void: select_weapon_index(idx))
		_roster_grid.add_child(btn)
		_weapon_buttons.append(btn)

	if visible_roster.is_empty():
		_roster_summary.text = "검색 조건과 일치하는 무기가 없습니다."
	else:
		var keep := 0
		for i in visible_roster.size():
			if str(visible_roster[i].id) == str(selected_entry.get("id", "")):
				keep = i
				break
		select_weapon_index(keep)

func select_weapon_index(index: int) -> void:
	if index < 0 or index >= visible_roster.size():
		return
	selected_entry = visible_roster[index]
	var dk := str(selected_entry.demo_kind)
	current_params = (selected_entry.defaults as Dictionary).duplicate(true)
	var ov := CosmoteerWeaponData.get_weapon_override(dk)
	for k in ov.keys():
		current_params[k] = ov[k]
	arena.configure(selected_entry, current_params)
	_sync_sliders()
	_highlight_selected_button(index)
	_update_header()

func _highlight_selected_button(active_idx: int) -> void:
	for i in _weapon_buttons.size():
		var b := _weapon_buttons[i]
		var sel := (i == active_idx)
		b.add_theme_stylebox_override("normal", _make_style(
			Color(0.11, 0.34, 0.44, 0.96) if sel else Color(0.05, 0.10, 0.17, 0.90),
			GREEN if sel else EDGE, 8, 5))
		b.add_theme_color_override("font_color", Color.WHITE if sel else SOFT)

func _sync_sliders() -> void:
	_syncing_sliders = true
	for sp: Array in SLIDER_SPECS:
		var k := str(sp[0])
		var fmt := str(sp[5])
		var sl: HSlider = sliders[k]
		var val := clampf(float(current_params.get(k, sl.min_value)), sl.min_value, sl.max_value)
		sl.set_value_no_signal(val)
		slider_labels[k].text = fmt % val
	if target_dist_slider != null:
		var td := clampf(float(current_params.get("target_distance", 160.0)), 35.0, 520.0)
		target_dist_slider.set_value_no_signal(td)
		if target_dist_label != null:
			target_dist_label.text = "%.0f m" % td
	_syncing_sliders = false

func set_target_distance(dist_m: float) -> void:
	if _syncing_sliders or selected_entry.is_empty():
		return
	var clamped := clampf(dist_m, 35.0, 520.0)
	current_params["target_distance"] = clamped
	_syncing_sliders = true
	if sliders.has("target_distance"):
		(sliders["target_distance"] as HSlider).set_value_no_signal(clamped)
		slider_labels["target_distance"].text = "%.0fm" % clamped
	if target_dist_slider != null:
		target_dist_slider.set_value_no_signal(clamped)
	if target_dist_label != null:
		target_dist_label.text = "%.0f m" % clamped
	_syncing_sliders = false
	arena.update_params(current_params)

func _on_slider_changed(value: float, key: String, fmt: String) -> void:
	if _syncing_sliders or selected_entry.is_empty():
		return
	current_params[key] = value
	slider_labels[key].text = fmt % value
	if key == "target_distance":
		_syncing_sliders = true
		if target_dist_slider != null:
			target_dist_slider.set_value_no_signal(value)
		if target_dist_label != null:
			target_dist_label.text = "%.0f m" % value
		_syncing_sliders = false
	arena.update_params(current_params)

func _toggle_play() -> void:
	arena.playing = not arena.playing
	play_button.text = "시연 정지" if arena.playing else "시연 재생"

func _toggle_shield() -> void:
	arena.target_shield_enabled = not arena.target_shield_enabled
	arena.target_shield_hp = arena.target_shield_max if arena.target_shield_enabled else 0.0
	shield_button.text = "방어막 켬" if arena.target_shield_enabled else "방어막 끔"

func _toggle_move() -> void:
	arena.target_moving = not arena.target_moving
	move_button.text = "표적이동 켬" if arena.target_moving else "표적이동 끔"

func _reset_current_params() -> void:
	if selected_entry.is_empty():
		return
	var dk := str(selected_entry.demo_kind)
	CosmoteerWeaponData.clear_weapon_override(dk)
	current_params = (selected_entry.defaults as Dictionary).duplicate(true)
	arena.update_params(current_params)
	arena.reset_demo()
	_sync_sliders()
	_refresh_list()

func _apply_to_battle() -> void:
	if selected_entry.is_empty():
		return
	var dk := str(selected_entry.demo_kind)
	CosmoteerWeaponData.set_weapon_override(dk, current_params)
	if sfx != null:
		sfx.play("shield_hit")
	_refresh_list()

func _update_header() -> void:
	if selected_entry.is_empty():
		return
	_header_title.text = "무기 일람표 · %s" % str(selected_entry.name)
	var dk := str(selected_entry.demo_kind)
	var has_ov := not CosmoteerWeaponData.get_weapon_override(dk).is_empty()
	_roster_summary.text = "%s · 상태: %s" % [
		str(selected_entry.role),
		"전투 오버라이드 적용 ★" if has_ov else "원본 수치"
	]

func _physics_process(delta: float) -> void:
	if arena == null:
		return
	arena.step_demo(delta)
	_telemetry_label.text = "실측 %.0f DPS · 발사 %d · 명중 %d · 표적 %.0f / 방어막 %.0f" % [
		arena.measured_dps(), arena.shots_fired, arena.hits_landed, arena.target_hp, arena.target_shield_hp
	]
