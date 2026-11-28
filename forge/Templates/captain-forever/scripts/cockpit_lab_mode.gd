class_name CockpitLabMode
extends Node2D

## 코스모티어 실험 조종석 모드 (2배 확대 UI·폰트 및 가로·세로 무클리핑 배치).

const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const RangeSimScript = preload("res://scripts/power_range_sim.gd")
const RangeViewScript = preload("res://scripts/power_range_view.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const SURFACE := Color(0.05, 0.11, 0.18, 0.96)
const EDGE := Color(0.24, 0.62, 0.84, 0.88)
const WHITE := Color("#e4f4ff")
const SOFT := Color("#9ec4da")
const GREEN := Color("#74f2ce")
const GOLD := Color("#ffd175")

const STATUS_LABELS := {
	"finished": "표적 파괴 완료",
	"hold": "사격 대기",
	"no_gunner": "포수 대기",
	"out_of_range": "사거리 밖",
	"starved": "전력 보급 대기",
	"firing": "사격 중",
}
const EVENT_NAMES := {
	"pickup": "반응로 전력 수령",
	"delivery": "무기 전력 전달",
	"shot": "포탑 발사",
	"hit": "표적 명중",
	"destroyed": "장갑 파괴",
}

var sim: PowerRangeSim
var sfx: CosmoteerSfx
var mode_switcher: ModeSwitcher
var _ui_layer: CanvasLayer
var _ui_font: Font
var _ui_theme: Theme

var _main_panel: PanelContainer
var _middle_split: BoxContainer
var _side_panel: PanelContainer
var _side_scroll: ScrollContainer
var _quick_dock: PanelContainer
var _q_build_btn: Button
var board: PowerRangeView

var running := true
var speed := 1
var state_label: Label
var time_label: Label
var tallies_label: Label
var event_label: Label
var distance_label: Label
var distance_slider: HSlider
var run_button: Button
var speed_select: OptionButton
var weapon_select: OptionButton
var switches: Array[CheckButton] = []
var meters: Array[Dictionary] = []

func _ready() -> void:
	CosmoteerAssets.ensure_loaded()
	_load_font()
	sim = RangeSimScript.new()
	sfx = CosmoteerSfx.new()
	add_child(sfx)

	mode_switcher = ModeSwitcherScript.new()
	add_child(mode_switcher)
	mode_switcher.setup("cockpit_lab")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	_build_ui()
	_sync_inputs()
	_refresh()
	_sync_responsive_layout()

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_style(bg: Color, border: Color, radius: int = 10, margin: int = 8) -> StyleBoxFlat:
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

	var heading := HFlowContainer.new()
	heading.add_theme_constant_override("h_separation", 10)
	heading.add_theme_constant_override("v_separation", 6)
	root.add_child(heading)

	var title := Label.new()
	title.text = "실험 조종석 · 전력 보급 사격장"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", GOLD)
	heading.add_child(title)

	weapon_select = OptionButton.new()
	weapon_select.custom_minimum_size = Vector2(240, 48)
	weapon_select.clip_text = true
	weapon_select.add_theme_font_size_override("font_size", 20)
	for wid in ["cosmoteer.laser_blaster_small", "cosmoteer.laser_blaster_large", "cosmoteer.disruptor"]:
		var pname := str(PowerRangeSim.WEAPON_PRESETS[wid].name)
		weapon_select.add_item("무장: " + pname)
		weapon_select.set_item_metadata(weapon_select.item_count - 1, wid)
	weapon_select.item_selected.connect(func(idx: int) -> void:
		sim.select_weapon(str(weapon_select.get_item_metadata(idx)))
		_sync_inputs()
		_refresh())
	heading.add_child(weapon_select)

	time_label = Label.new()
	time_label.text = "T + 000.00 s"
	time_label.add_theme_font_size_override("font_size", 22)
	time_label.add_theme_color_override("font_color", GREEN)
	heading.add_child(time_label)

	_middle_split = BoxContainer.new()
	_middle_split.vertical = false
	_middle_split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_middle_split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_middle_split.add_theme_constant_override("separation", 8)
	root.add_child(_middle_split)

	var left_panel := PanelContainer.new()
	left_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_middle_split.add_child(left_panel)

	var left_col := VBoxContainer.new()
	left_col.add_theme_constant_override("separation", 6)
	left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_panel.add_child(left_col)

	var map_head := HBoxContainer.new()
	left_col.add_child(map_head)
	var cut_lbl := Label.new()
	cut_lbl.text = "함선 단면도 (반응로 -> 승무원 배터리 운반 -> 포탑)"
	cut_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cut_lbl.clip_text = true
	cut_lbl.add_theme_font_size_override("font_size", 21)
	cut_lbl.add_theme_color_override("font_color", WHITE)
	map_head.add_child(cut_lbl)

	state_label = Label.new()
	state_label.add_theme_font_size_override("font_size", 21)
	state_label.add_theme_color_override("font_color", GREEN)
	map_head.add_child(state_label)

	board = RangeViewScript.new()
	board.sim = sim
	board.font = _ui_font
	board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	board.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_col.add_child(board)

	tallies_label = Label.new()
	tallies_label.clip_text = true
	tallies_label.add_theme_font_size_override("font_size", 20)
	tallies_label.add_theme_color_override("font_color", SOFT)
	left_col.add_child(tallies_label)

	_side_panel = PanelContainer.new()
	_side_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_middle_split.add_child(_side_panel)

	_side_scroll = FlickScrollScript.new()
	_side_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_side_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_side_panel.add_child(_side_scroll)

	var side_col := VBoxContainer.new()
	side_col.add_theme_constant_override("separation", 8)
	side_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_side_scroll.add_child(side_col)

	var st_title := Label.new()
	st_title.text = "계통 상태 · 조종석 스위치"
	st_title.add_theme_font_size_override("font_size", 23)
	st_title.add_theme_color_override("font_color", GOLD)
	side_col.add_child(st_title)

	_add_meter(side_col, "반응로 전력", GREEN)
	_add_meter(side_col, "무기 전력", GOLD)
	_add_meter(side_col, "표적 장갑", Color("#ff9284"))

	for item in [["보급 통로 개방", sim.set_route_open], ["포수 배치", sim.set_gunner_active], ["사격 허가", sim.set_fire_enabled]]:
		var toggle := CheckButton.new()
		toggle.text = str(item[0])
		toggle.focus_mode = Control.FOCUS_NONE
		toggle.custom_minimum_size = Vector2(0, 46)
		toggle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		toggle.add_theme_font_size_override("font_size", 20)
		toggle.toggled.connect(item[1])
		switches.append(toggle)
		side_col.add_child(toggle)

	distance_label = Label.new()
	distance_label.add_theme_font_size_override("font_size", 20)
	distance_label.add_theme_color_override("font_color", SOFT)
	side_col.add_child(distance_label)

	distance_slider = HSlider.new()
	distance_slider.min_value = 20.0
	distance_slider.max_value = 320.0
	distance_slider.step = 1.0
	distance_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	distance_slider.value_changed.connect(func(v: float) -> void:
		sim.set_target_distance(v)
		_refresh())
	side_col.add_child(distance_slider)

	var bottom := HFlowContainer.new()
	bottom.add_theme_constant_override("h_separation", 6)
	bottom.add_theme_constant_override("v_separation", 6)
	root.add_child(bottom)

	run_button = _make_btn("일시 정지", _toggle_run, true)
	bottom.add_child(run_button)
	bottom.add_child(_make_btn("+0.25초 진행", _step_once))

	speed_select = OptionButton.new()
	speed_select.custom_minimum_size = Vector2(0, 48)
	speed_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	speed_select.add_theme_font_size_override("font_size", 20)
	for value in [1, 2, 4]:
		speed_select.add_item("%d× 배속" % value, value)
	speed_select.item_selected.connect(func(index: int) -> void: speed = speed_select.get_item_id(index))
	bottom.add_child(speed_select)

	bottom.add_child(_make_btn("초기화", _reset))

	var hist_panel := PanelContainer.new()
	hist_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 8, 7))
	root.add_child(hist_panel)

	event_label = Label.new()
	event_label.clip_text = true
	event_label.add_theme_font_size_override("font_size", 19)
	event_label.add_theme_color_override("font_color", WHITE)
	hist_panel.add_child(event_label)

	_quick_dock = PanelContainer.new()
	if _ui_theme != null:
		_quick_dock.theme = _ui_theme
	_quick_dock.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.88), 12, 6))
	_ui_layer.add_child(_quick_dock)

	var qrow := HBoxContainer.new()
	qrow.add_theme_constant_override("separation", 6)
	_quick_dock.add_child(qrow)
	var b_wr := _make_btn("◀ 무기 일람표", func() -> void: get_tree().change_scene_to_file("res://scenes/weapon_roster_mode.tscn"), true)
	b_wr.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_wr)
	_q_build_btn = _make_btn("빌드 모드", func() -> void: get_tree().change_scene_to_file("res://scenes/build_mode.tscn"))
	_q_build_btn.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(_q_build_btn)
	var b_main := _make_btn("정식 맵", func() -> void: get_tree().change_scene_to_file("res://scenes/main.tscn"))
	b_main.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_main)

func _add_meter(parent: Control, caption: String, color: Color) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var c_lbl := Label.new()
	c_lbl.text = caption
	c_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c_lbl.add_theme_font_size_override("font_size", 20)
	c_lbl.add_theme_color_override("font_color", SOFT)
	row.add_child(c_lbl)
	var v_lbl := Label.new()
	v_lbl.add_theme_font_size_override("font_size", 20)
	v_lbl.add_theme_color_override("font_color", WHITE)
	row.add_child(v_lbl)
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 14)
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background", _make_style(Color("#1a2d3d"), Color("#1a2d3d"), 4, 0))
	bar.add_theme_stylebox_override("fill", _make_style(color, color, 4, 0))
	parent.add_child(bar)
	meters.append({"text": v_lbl, "bar": bar})

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

	if narrow:
		_middle_split.vertical = true
		_side_panel.custom_minimum_size = Vector2(0, clampf(vp.y * 0.24, 210.0, 310.0))
		_side_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_side_panel.size_flags_vertical = Control.SIZE_SHRINK_END
		board.custom_minimum_size = Vector2(0, clampf(vp.y * 0.22, 175.0, 290.0))

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
		_middle_split.vertical = false
		_side_panel.custom_minimum_size = Vector2(clampf(vp.x * 0.30, 350.0, 410.0), 0)
		_side_panel.size_flags_horizontal = Control.SIZE_SHRINK_END
		_side_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		board.custom_minimum_size = Vector2(0, 180)

		var qw := minf(520.0, vp.x - 340.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0

func _physics_process(delta: float) -> void:
	if sim == null or not sim.load_error.is_empty():
		return
	if running:
		sim.step(delta * float(speed))
		var ev := sim.pop_last_event_kind()
		if sfx != null and not ev.is_empty():
			if ev == "shot":
				var preset: Dictionary = PowerRangeSim.WEAPON_PRESETS.get(sim.active_weapon_id, {})
				sfx.play(str(preset.get("sfx", "shot_laser")))
			elif ev == "destroyed":
				sfx.play("destroyed")
		if sim.armor_hp <= 0.0:
			running = false
	_refresh()

func _input(event: InputEvent) -> void:
	if sim != null and sim.load_error.is_empty() and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		_toggle_run()
		get_viewport().set_input_as_handled()

func _toggle_run() -> void:
	if sim.armor_hp <= 0.0:
		_reset()
	running = not running
	_refresh()

func _step_once() -> void:
	running = false
	if sim.armor_hp > 0.0:
		sim.step(0.25)
	_refresh()

func _reset() -> void:
	running = false
	sim.reset()
	_sync_inputs()
	_refresh()

func _sync_inputs() -> void:
	var states := [sim.route_open, sim.gunner_active, sim.fire_enabled]
	for i in switches.size():
		switches[i].set_pressed_no_signal(states[i])
	if distance_slider != null:
		distance_slider.set_value_no_signal(sim.target_distance)

func _refresh() -> void:
	if state_label == null:
		return
	state_label.text = str(STATUS_LABELS.get(sim.status(), sim.status()))
	time_label.text = "T + %06.2f s" % sim.elapsed
	tallies_label.text = "보급 %d회  ·  발사 %d회  ·  명중 %d회" % [sim.deliveries, sim.shots, sim.hits]
	run_button.text = "다시 실행" if sim.armor_hp <= 0.0 else ("일시 정지" if running else "실행")
	distance_label.text = "표적 거리: %d m (사거리 %d m)" % [roundi(sim.target_distance), roundi(sim.maximum_range)]
	var values := [
		[sim.reactor_energy, sim.reactor_capacity],
		[sim.weapon_energy, sim.weapon_capacity],
		[roundi(sim.armor_hp), roundi(sim.armor_max_hp)]
	]
	for i in meters.size():
		meters[i].text.text = "%d / %d" % values[i]
		meters[i].bar.max_value = maxf(float(values[i][1]), 1.0)
		meters[i].bar.value = float(values[i][0])
	var lines := PackedStringArray()
	for i in range(maxi(0, sim.events.size() - 3), sim.events.size()):
		var item: Dictionary = sim.events[i]
		lines.append("%05.2fs %s" % [float(item.time), str(EVENT_NAMES.get(str(item.kind), str(item.kind)))])
	event_label.text = "최근 이벤트: 전력 운반·사격 대기" if lines.is_empty() else ("최근: " + "  /  ".join(lines))
	if board != null:
		board.queue_redraw()
