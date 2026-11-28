class_name GrappleTestMap
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")
const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const GrappleTetherScript = preload("res://scripts/grapple_tether.gd")
const CombatFxScript = preload("res://scripts/combat_fx.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const SonarPulseScript = preload("res://scripts/sonar_pulse.gd")
const SonarResultPopupScript = preload("res://scripts/sonar_result_popup.gd")
const TrackingOrderScript = preload("res://scripts/target_tracking_order.gd")
const TrackingVisual = preload("res://scripts/target_tracking_visual.gd")
const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const SLIDER_SPECS := [
	{"key": "reel_force", "label": "끌어당기기 힘 (Pull Force)", "min": 1000.0, "max": 80000.0, "step": 1000.0, "fmt": "%.0f"},
	{"key": "reel_speed", "label": "끌어당기기 최대 속도 (px/s)", "min": 40.0, "max": 1000.0, "step": 20.0, "fmt": "%.0f"},
	{"key": "sonar_range", "label": "소나 탐지 반경 (px)", "min": 400.0, "max": 4000.0, "step": 100.0, "fmt": "%.0f"},
	{"key": "hp", "label": "체인 내구도 (HP)", "min": 32.0, "max": 600.0, "step": 8.0, "fmt": "%.0f"},
	{"key": "max_stretch_ratio", "label": "체인 최대 신장 배율", "min": 1.0, "max": 2.0, "step": 0.05, "fmt": "%.2fx"},
	{"key": "max_stretch_hp_drain_per_sec", "label": "최대 신장 내구도 감소/s", "min": 0.0, "max": 150.0, "step": 2.0, "fmt": "%.0f"},
	{"key": "elastic_pull_stiffness", "label": "탄성 복원 강성", "min": 1.0, "max": 40.0, "step": 1.0, "fmt": "%.0f"},
	{"key": "max_range", "label": "최대 사거리 (px)", "min": 400.0, "max": 2500.0, "step": 20.0, "fmt": "%.0f"},
	{"key": "break_slack", "label": "단선 여유 거리 (px)", "min": 100.0, "max": 3000.0, "step": 20.0, "fmt": "%.0f"},
	{"key": "hook_speed", "label": "발사 속도 (px/s)", "min": 600.0, "max": 4000.0, "step": 50.0, "fmt": "%.0f"},
	{"key": "max_tension_force", "label": "최대 장력 상한", "min": 10000.0, "max": 300000.0, "step": 2000.0, "fmt": "%.0f"},
	{"key": "tension_damp_rate", "label": "장력 속도 감쇠", "min": 0.5, "max": 15.0, "step": 0.5, "fmt": "%.1f"},
	{"key": "tow_min_mass_ratio", "label": "최소 견인 질량비", "min": 0.2, "max": 1.2, "step": 0.05, "fmt": "%.2f"},
	{"key": "oscillation_flip_stress", "label": "반전 진동 스트레스", "min": 0.0, "max": 0.5, "step": 0.01, "fmt": "%.2f"},
	{"key": "oscillation_tension_rate", "label": "경합 장력 스트레스/s", "min": 0.0, "max": 2.5, "step": 0.05, "fmt": "%.2f"},
	{"key": "oscillation_decay_rate", "label": "스트레스 회복/s", "min": 0.1, "max": 4.0, "step": 0.1, "fmt": "%.1f"},
	{"key": "position_correction_max", "label": "위치 보정 상한", "min": 5.0, "max": 80.0, "step": 1.0, "fmt": "%.0f"},
	{"key": "hit_radius", "label": "피격 판정 반경", "min": 4.0, "max": 32.0, "step": 1.0, "fmt": "%.0f"},
]

const LEGACY_PRESET := {
	"hp": 32.0,
	"max_stretch_ratio": 1.0,
	"max_stretch_hp_drain_per_sec": 0.0,
	"elastic_pull_stiffness": 10.0,
	"max_range": 980.0,
	"break_slack": 420.0,
	"hook_speed": 1600.0,
	"max_tension_force": 42000.0,
	"tension_damp_rate": 5.0,
	"tow_min_mass_ratio": 0.87,
	"tow_dominant_mass_ratio": 1.25,
	"tow_dominant_thrust_ratio": 1.25,
	"oscillation_flip_stress": 0.34,
	"oscillation_tension_rate": 1.45,
	"oscillation_decay_rate": 0.7,
	"oscillation_tension_threshold": 350.0,
	"position_correction_max": 28.0,
	"hit_radius": 12.0,
}

var world_layer: Node2D
var player: ShipBody
var camera: Camera2D
var combat_fx: CombatFxLayer
var targets: Array[EnemyShip] = []
var target_roles: Dictionary = {}
var selected_target: EnemyShip
var grapple: GrappleTether
var active_sonar: SonarPulse
var sonar_popup: SonarResultPopup
var mode_switcher: ModeSwitcher
var grapple_config: Dictionary = {}

var navigation_active := false
var navigation_target := Vector2.ZERO
var tracking_order = TrackingOrderScript.new()
var _pointer_down_pos := Vector2.ZERO
var _pointer_dragged := false
var _active_touch_id := -1
var _pinch_touches: Dictionary = {}
var _pinch_active := false
var _pinch_prev_dist := 0.0
var _touch_forward := false
var _touch_reverse := false
var _touch_turn_left := false
var _touch_turn_right := false

var resist_enabled := true
var fire_test_enabled := false
var reel_toggle_active := false
var _fire_test_timer := 0.0
var _last_event_text := "빈곳 터치: 이동 · 적 드래그: 각도/거리 유지 · G: 그래플 · V: 감기 · X: 소나"
var _panel_collapsed := false

var _ui_layer: CanvasLayer
var _panel: PanelContainer
var _panel_scroll: ScrollContainer
var _touch_bar: PanelContainer
var _touch_grid: GridContainer
var _touch_reel_btn: Button
var _touch_cancel_btn: Button
var _scroll: ScrollContainer
var _telemetry_label: Label
var _stress_bar: ProgressBar
var _reel_btn: Button
var _resist_btn: Button
var _fire_btn: Button
var _collapse_btn: Button
var _sliders: Dictionary = {}
var _value_labels: Dictionary = {}
var _syncing_sliders := false
var _ui_font: Font

func _ready() -> void:
	_install_ui_font()
	grapple_config = BalanceData.GRAPPLE.duplicate(true)
	grapple_config["sonar_range"] = 1600.0

	world_layer = Node2D.new()
	world_layer.name = "World"
	add_child(world_layer)

	var bg := BackgroundScript.new()
	world_layer.add_child(bg)

	player = ShipBodyScript.new()
	player.name = "PlayerShip"
	player.position = Vector2.ZERO
	player.rotation = -PI * 0.5
	world_layer.add_child(player)
	player.initialize_player()

	combat_fx = CombatFxScript.new()
	combat_fx.name = "CombatFx"
	combat_fx.z_index = 20
	world_layer.add_child(combat_fx)

	camera = Camera2D.new()
	camera.ignore_rotation = true
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	camera.zoom = Vector2(0.8, 0.8)
	camera.offset = Vector2(-210, 0)
	world_layer.add_child(camera)

	_spawn_test_targets()
	_build_ui()
	_build_mobile_touch_bar()
	sonar_popup = SonarResultPopupScript.new()
	add_child(sonar_popup)
	mode_switcher = ModeSwitcherScript.new()
	mode_switcher.setup("grapple")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_grapple_layout())
	add_child(mode_switcher)
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_grapple_layout)
	_sync_sliders_from_config()
	_sync_grapple_layout()
	_update_telemetry()

func _install_ui_font() -> void:
	_ui_font = UiTheme.load_ui_font()

func _spawn_test_targets() -> void:
	for t in targets:
		if is_instance_valid(t):
			t.queue_free()
	targets.clear()
	target_roles.clear()
	selected_target = null

	var specs := [
		{"role": "light", "label": "경량 드론 (중립)", "pos": Vector2(360, -140), "level": 1, "hostile": false},
		{"role": "tug", "label": "동급 저항선 (적대)", "pos": Vector2(400, 140), "level": 2, "hostile": true},
		{"role": "heavy", "label": "중량 프리깃 (중립)", "pos": Vector2(-380, 140), "level": 5, "hostile": false},
		{"role": "shooter", "label": "포격 더미 (적대)", "pos": Vector2(-340, -160), "level": 2, "hostile": true},
	]
	for spec in specs:
		var ship := EnemyShipScript.new()
		ship.position = spec.pos
		ship.rotation = (player.position - Vector2(spec.pos)).angle()
		world_layer.add_child(ship)
		ship.setup(int(spec.level), "", "roamer")
		ship.hostile_on_sonar = bool(spec.hostile)
		ship.enemy_name = str(spec.label)
		if spec.role == "light":
			ship.model.parts.clear()
			ship.model.add("core", Vector2i.ZERO)
			ship.model.add("thruster", Vector2i(-1, 0))
			ship.refresh_mass()
		elif spec.role == "tug":
			ship.model.parts.clear()
			ship.model.add("core", Vector2i.ZERO)
			ship.model.add("armor", Vector2i(1, 0))
			ship.model.add("armor", Vector2i(0, -1))
			ship.model.add("armor", Vector2i(0, 1))
			ship.model.add("thruster", Vector2i(-1, -1))
			ship.model.add("thruster", Vector2i(-1, 1))
			ship.model.add("rcs_thruster", Vector2i(0, -2))
			ship.model.add("rcs_thruster", Vector2i(0, 2))
			ship.refresh_mass()
		elif spec.role == "heavy":
			ship.model.parts.clear()
			ship.model.add("core", Vector2i.ZERO)
			ship.model.add("plate4", Vector2i(1, 0))
			ship.model.add("plate4", Vector2i(-2, 0))
			ship.model.add("armor", Vector2i(0, -1))
			ship.model.add("armor", Vector2i(0, 2))
			ship.model.add("thruster", Vector2i(-3, 0))
			ship.refresh_mass()
		ship.linear_velocity = Vector2.ZERO
		ship.angular_velocity = 0.0
		targets.append(ship)
		target_roles[ship] = spec
	if targets.size() >= 2:
		selected_target = targets[1]

func _build_ui() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 50
	add_child(_ui_layer)

	_panel = PanelContainer.new()
	_panel.position = Vector2(10, 10)
	_panel.custom_minimum_size = Vector2.ZERO
	_panel.theme = UiTheme.build_theme(true)
	_panel.add_theme_stylebox_override("panel", UiTheme.make_box(Color(0.04, 0.07, 0.13, 0.92), Color(0.32, 0.72, 0.95, 0.85), 12, 12, 10, 2))
	_ui_layer.add_child(_panel)

	var root_box := VBoxContainer.new()
	root_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_box.add_theme_constant_override("separation", 8)
	_panel.add_child(root_box)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	root_box.add_child(header)
	var title := Label.new()
	title.text = "GRAPPLE LAB · 그래플 실험실"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color("91eaff"))
	header.add_child(title)

	_collapse_btn = Button.new()
	_collapse_btn.text = "접기"
	_collapse_btn.custom_minimum_size = Vector2(92, 46)
	_collapse_btn.add_theme_font_size_override("font_size", 20)
	_collapse_btn.pressed.connect(_toggle_collapse)
	header.add_child(_collapse_btn)

	_panel_scroll = FlickScrollScript.new()
	_panel_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_panel_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_box.add_child(_panel_scroll)

	var body_box := VBoxContainer.new()
	body_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_box.add_theme_constant_override("separation", 8)
	_panel_scroll.add_child(body_box)

	_telemetry_label = Label.new()
	_telemetry_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_telemetry_label.add_theme_font_size_override("font_size", 19)
	_telemetry_label.add_theme_color_override("font_color", Color("d8ecff"))
	body_box.add_child(_telemetry_label)

	var stress_row := HBoxContainer.new()
	stress_row.add_theme_constant_override("separation", 8)
	body_box.add_child(stress_row)
	var stress_lbl := Label.new()
	stress_lbl.text = "공진 스트레스"
	stress_lbl.custom_minimum_size = Vector2(138, 0)
	stress_lbl.add_theme_font_size_override("font_size", 19)
	stress_row.add_child(stress_lbl)
	_stress_bar = ProgressBar.new()
	_stress_bar.min_value = 0.0
	_stress_bar.max_value = 100.0
	_stress_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_stress_bar.custom_minimum_size = Vector2(0, 22)
	stress_row.add_child(_stress_bar)

	var btn_grid := GridContainer.new()
	btn_grid.columns = 2
	btn_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn_grid.add_theme_constant_override("h_separation", 6)
	btn_grid.add_theme_constant_override("v_separation", 6)
	body_box.add_child(btn_grid)

	var make_gbtn := func(txt: String, cb: Callable) -> Button:
		var b := Button.new()
		b.text = txt
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 48)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 19)
		b.pressed.connect(cb)
		return b

	btn_grid.add_child(make_gbtn.call("그래플 발사 (G)", toggle_grapple))
	_reel_btn = make_gbtn.call("감기: 대기 (V)", toggle_reel_in)
	_reel_btn.disabled = true
	btn_grid.add_child(_reel_btn)
	btn_grid.add_child(make_gbtn.call("위치 초기화 (R)", reset_arena))
	btn_grid.add_child(make_gbtn.call("3배 강화 기본값", apply_default_preset))
	btn_grid.add_child(make_gbtn.call("구버전(약함)", apply_legacy_preset))
	_resist_btn = make_gbtn.call("적 저항: ON", _toggle_resist)
	btn_grid.add_child(_resist_btn)
	_fire_btn = make_gbtn.call("적 사격: OFF", _toggle_fire_test)
	btn_grid.add_child(_fire_btn)
	btn_grid.add_child(make_gbtn.call("소나 발신 (X)", trigger_sonar_pulse))

	_scroll = FlickScrollScript.new()
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.custom_minimum_size = Vector2(0, 180)
	body_box.add_child(_scroll)

	var sliders_box := VBoxContainer.new()
	sliders_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sliders_box.add_theme_constant_override("separation", 8)
	_scroll.add_child(sliders_box)

	for spec in SLIDER_SPECS:
		var key: String = spec.key
		var row := VBoxContainer.new()
		row.add_theme_constant_override("separation", 3)
		sliders_box.add_child(row)

		var top := HBoxContainer.new()
		row.add_child(top)
		var lbl := Label.new()
		lbl.text = spec.label
		lbl.clip_text = true
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lbl.add_theme_font_size_override("font_size", 19)
		lbl.add_theme_color_override("font_color", Color("b8d7f0"))
		top.add_child(lbl)

		var val_lbl := Label.new()
		val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		val_lbl.custom_minimum_size = Vector2(88, 0)
		val_lbl.add_theme_font_size_override("font_size", 19)
		val_lbl.add_theme_color_override("font_color", Color("ffcf72"))
		top.add_child(val_lbl)
		_value_labels[key] = val_lbl

		var slider := HSlider.new()
		slider.min_value = float(spec.min)
		slider.max_value = float(spec.max)
		slider.step = float(spec.step)
		slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slider.value_changed.connect(func(v: float) -> void:
			if _syncing_sliders:
				return
			set_param(key, v))
		row.add_child(slider)
		_sliders[key] = slider

func _build_mobile_touch_bar() -> void:
	_touch_bar = PanelContainer.new()
	_touch_bar.theme = UiTheme.build_theme(true)
	_touch_bar.add_theme_stylebox_override("panel", UiTheme.make_box(Color(0.03, 0.06, 0.12, 0.92), Color(0.28, 0.72, 0.95, 0.78), 10, 8, 6, 2))
	_ui_layer.add_child(_touch_bar)

	_touch_grid = GridContainer.new()
	_touch_grid.columns = 10
	_touch_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_touch_grid.add_theme_constant_override("h_separation", 6)
	_touch_grid.add_theme_constant_override("v_separation", 6)
	_touch_bar.add_child(_touch_grid)

	var make_hold_btn := func(text: String, on_change: Callable) -> Button:
		var b := Button.new()
		b.text = text
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 19)
		b.button_down.connect(func() -> void: on_change.call(true))
		b.button_up.connect(func() -> void: on_change.call(false))
		b.mouse_exited.connect(func() -> void:
			if not b.button_pressed:
				on_change.call(false))
		return b

	_touch_grid.add_child(make_hold_btn.call("좌회전", func(v: bool) -> void: _touch_turn_left = v))
	_touch_grid.add_child(make_hold_btn.call("전진 ▲", func(v: bool) -> void: _touch_forward = v))
	_touch_grid.add_child(make_hold_btn.call("후진 ▼", func(v: bool) -> void: _touch_reverse = v))
	_touch_grid.add_child(make_hold_btn.call("우회전", func(v: bool) -> void: _touch_turn_right = v))

	var make_tap_btn := func(text: String, on_press: Callable) -> Button:
		var b := Button.new()
		b.text = text
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 19)
		b.pressed.connect(on_press)
		return b

	_touch_grid.add_child(make_tap_btn.call("축소 -", func() -> void: _set_zoom(camera.zoom.x / 1.18)))
	_touch_grid.add_child(make_tap_btn.call("확대 +", func() -> void: _set_zoom(camera.zoom.x * 1.18)))

	_touch_cancel_btn = make_tap_btn.call("이동정지", cancel_navigation_and_tracking)
	_touch_cancel_btn.disabled = true
	_touch_grid.add_child(_touch_cancel_btn)

	_touch_grid.add_child(make_tap_btn.call("소나 (X)", trigger_sonar_pulse))
	_touch_reel_btn = make_tap_btn.call("감기 (V)", toggle_reel_in)
	_touch_reel_btn.disabled = true
	_touch_grid.add_child(_touch_reel_btn)
	_touch_grid.add_child(make_tap_btn.call("그래플", toggle_grapple))

func _sync_grapple_layout() -> void:
	if get_viewport() == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	if _panel != null:
		var pw := minf(480.0, vp.x - 20.0)
		var max_h := maxf(180.0, vp.y - (250.0 if narrow else 104.0))
		var ph := 68.0 if _panel_collapsed else minf(560.0, max_h)
		_panel.anchor_left = 0.0
		_panel.anchor_right = 0.0
		_panel.anchor_top = 0.0
		_panel.anchor_bottom = 0.0
		_panel.offset_left = 10.0
		_panel.offset_right = 10.0 + pw
		_panel.offset_top = 10.0
		_panel.offset_bottom = 10.0 + ph
	if _touch_bar != null:
		if _touch_grid != null:
			_touch_grid.columns = 5 if narrow else 10
		var bar_h := 122.0 if narrow else 68.0
		_touch_bar.anchor_left = 0.0
		_touch_bar.anchor_right = 1.0
		_touch_bar.anchor_top = 1.0
		_touch_bar.anchor_bottom = 1.0
		_touch_bar.offset_left = 10.0
		_touch_bar.offset_right = -10.0
		_touch_bar.offset_top = -10.0 - bar_h
		_touch_bar.offset_bottom = -10.0

func set_param(key: String, value: float) -> void:
	grapple_config[key] = value
	_update_slider_label(key, value)
	if grapple != null and is_instance_valid(grapple):
		grapple.apply_config(grapple_config, true)

func _update_slider_label(key: String, value: float) -> void:
	var val_lbl: Label = _value_labels.get(key, null)
	if val_lbl == null:
		return
	for spec in SLIDER_SPECS:
		if spec.key == key:
			val_lbl.text = spec.fmt % value
			return

func _sync_sliders_from_config() -> void:
	_syncing_sliders = true
	for spec in SLIDER_SPECS:
		var key: String = spec.key
		var v := float(grapple_config.get(key, BalanceData.GRAPPLE.get(key, 0.0)))
		var slider: HSlider = _sliders.get(key, null)
		if slider != null:
			slider.value = v
		_update_slider_label(key, v)
	_syncing_sliders = false

func apply_default_preset() -> void:
	grapple_config = BalanceData.GRAPPLE.duplicate(true)
	_sync_sliders_from_config()
	if grapple != null and is_instance_valid(grapple):
		grapple.apply_config(grapple_config, false)
	_last_event_text = "3배 강화 기본값 적용 (HP %.0f, BreakSlack %.0f)" % [float(grapple_config.hp), float(grapple_config.break_slack)]

func apply_legacy_preset() -> void:
	for k in LEGACY_PRESET:
		grapple_config[k] = LEGACY_PRESET[k]
	_sync_sliders_from_config()
	if grapple != null and is_instance_valid(grapple):
		grapple.apply_config(grapple_config, false)
	_last_event_text = "구버전(약함) 프리셋 적용 (HP %.0f, BreakSlack %.0f)" % [float(grapple_config.hp), float(grapple_config.break_slack)]

func _toggle_resist() -> void:
	resist_enabled = not resist_enabled
	_resist_btn.text = "적 저항 추력: %s" % ("ON" if resist_enabled else "OFF")

func toggle_reel_in() -> void:
	if grapple == null or not is_instance_valid(grapple) or not grapple.connected:
		reel_toggle_active = false
		_sync_reel_button()
		_last_event_text = "그래플이 연결된 후 끌어당길 수 있습니다"
		return
	reel_toggle_active = not reel_toggle_active
	grapple.set_reeling(reel_toggle_active)
	_sync_reel_button()
	_last_event_text = "끌어당기기 %s (힘 %.0f)" % ["ON" if reel_toggle_active else "OFF", float(grapple_config.get("reel_force", BalanceData.GRAPPLE.reel_force))]

func _sync_reel_button() -> void:
	var can_reel := grapple != null and is_instance_valid(grapple) and grapple.connected
	var active := can_reel and (reel_toggle_active or Input.is_key_pressed(KEY_V))
	if _reel_btn != null:
		_reel_btn.disabled = not can_reel
		_reel_btn.text = "감기: 대기 (V)" if not can_reel else ("감기: %s (V)" % ("ON" if active else "OFF"))
	if _touch_reel_btn != null:
		_touch_reel_btn.disabled = not can_reel
		_touch_reel_btn.text = "감기 ON" if active else "감기 (V)"
	if _touch_cancel_btn != null:
		var auto_on: bool = navigation_active or bool(tracking_order.active)
		_touch_cancel_btn.disabled = not auto_on
		_touch_cancel_btn.text = "추적정지" if bool(tracking_order.active) else ("이동정지" if navigation_active else "자동정지")

func cancel_navigation_and_tracking() -> void:
	navigation_active = false
	tracking_order.cancel()
	_pointer_dragged = false
	_active_touch_id = -1
	_sync_reel_button()
	_last_event_text = "자동 이동 / 표적 추적 해제"
	queue_redraw()

func _toggle_fire_test() -> void:
	fire_test_enabled = not fire_test_enabled
	_fire_btn.text = "적 사격 테스트: %s" % ("ON" if fire_test_enabled else "OFF")

func _toggle_collapse() -> void:
	_panel_collapsed = not _panel_collapsed
	if _panel_scroll != null:
		_panel_scroll.visible = not _panel_collapsed
	_collapse_btn.text = "펼치기" if _panel_collapsed else "접기"
	_sync_grapple_layout()

func _return_to_main() -> void:
	if get_tree() != null:
		get_tree().change_scene_to_file("res://scenes/main.tscn")

func reset_arena() -> void:
	if grapple != null and is_instance_valid(grapple):
		grapple.detach("ARENA RESET")
		grapple = null
	if active_sonar != null and is_instance_valid(active_sonar):
		active_sonar.queue_free()
		active_sonar = null
	if sonar_popup != null and is_instance_valid(sonar_popup):
		sonar_popup.hide_popup()
	cancel_navigation_and_tracking()
	player.global_position = Vector2.ZERO
	player.rotation = -PI * 0.5
	player.linear_velocity = Vector2.ZERO
	player.angular_velocity = 0.0
	player.repair_all()
	_spawn_test_targets()
	_last_event_text = "아레나 초기화 완료"

func trigger_sonar_pulse() -> void:
	if active_sonar != null and is_instance_valid(active_sonar):
		active_sonar.queue_free()
	var scan_range := float(grapple_config.get("sonar_range", 1600.0))
	active_sonar = SonarPulseScript.new()
	world_layer.add_child(active_sonar)
	active_sonar.ship_detected.connect(func(ship: EnemyShip, entered_attack: bool) -> void:
		if entered_attack:
			_last_event_text = "소나 탐지! %s 공격모드 전환!" % ship.enemy_name)
	active_sonar.scan_completed.connect(func(report: Dictionary) -> void:
		if sonar_popup != null and is_instance_valid(sonar_popup):
			sonar_popup.show_report(report)
		_last_event_text = "소나 완료 · 함선 %d척 (공격모드 %d / 상호탐지 %d건)" % [
			(report.get("ships", []) as Array).size(),
			int(report.get("hostile_count", 0)),
			(report.get("mutual_pairs", []) as Array).size()
		])
	active_sonar.launch(player, targets, [], [], scan_range)
	_last_event_text = "소나 파동 발신 중... (반경 %.0fpx)" % scan_range

func _is_point_on_ui(screen_pos: Vector2) -> bool:
	if _panel != null and _panel.visible and _panel.get_global_rect().has_point(screen_pos):
		return true
	if _touch_bar != null and _touch_bar.visible and _touch_bar.get_global_rect().has_point(screen_pos):
		return true
	if mode_switcher != null and mode_switcher.is_point_inside(screen_pos):
		return true
	if sonar_popup != null and sonar_popup.is_showing() and sonar_popup._panel != null and sonar_popup._panel.get_global_rect().has_point(screen_pos):
		return true
	return false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_pinch_touches.clear()
		_pinch_active = false
		_pinch_prev_dist = 0.0
		_active_touch_id = -1
		_pointer_dragged = false
		_touch_forward = false
		_touch_reverse = false
		_touch_turn_left = false
		_touch_turn_right = false

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and (not event.pressed or event.canceled):
		_pinch_touches.erase(event.index)
		if _pinch_touches.size() < 2:
			_pinch_prev_dist = 0.0
		if _pinch_touches.is_empty():
			_pinch_active = false
		if event.index == _active_touch_id and not tracking_order.dragging:
			_active_touch_id = -1
			_pointer_dragged = false
	if tracking_order.dragging:
		if event is InputEventMouse and event.device == -1:
			return
		if event is InputEventMouseMotion:
			if event.position.distance_squared_to(_pointer_down_pos) >= 36.0:
				_pointer_dragged = true
			if _pointer_dragged:
				tracking_order.update_pointer(_viewport_to_world(event.position))
				queue_redraw()
			get_viewport().set_input_as_handled()
			return
		if event is InputEventScreenDrag and event.index == _active_touch_id:
			if event.position.distance_squared_to(_pointer_down_pos) >= 36.0:
				_pointer_dragged = true
			if _pointer_dragged:
				tracking_order.update_pointer(_viewport_to_world(event.position))
				queue_redraw()
			get_viewport().set_input_as_handled()
			return
		var mouse_rel: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed
		var touch_rel: bool = event is InputEventScreenTouch and event.index == _active_touch_id and (not event.pressed or event.canceled)
		if mouse_rel or touch_rel:
			if _pointer_dragged:
				tracking_order.update_pointer(_viewport_to_world(event.position))
				if tracking_order.commit():
					navigation_active = false
					_last_event_text = "표적 유지 · 거리 %.0fpx / 각도 %+.0f°" % [tracking_order.distance, rad_to_deg(tracking_order.angle)]
				else:
					tracking_order.cancel()
			else:
				tracking_order.cancel()
			_pointer_dragged = false
			_active_touch_id = -1
			_sync_reel_button()
			queue_redraw()
			get_viewport().set_input_as_handled()
			return

func _begin_world_pointer(screen_pos: Vector2, is_touch: bool) -> void:
	if _is_point_on_ui(screen_pos):
		return
	var world_pos := _viewport_to_world(screen_pos)
	var pick_pad := 46.0 if is_touch else 28.0
	var picked := _nearest_target_at(world_pos, pick_pad)
	if picked != null:
		selected_target = picked
		navigation_active = false
		tracking_order.begin(picked, player.global_position, player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE)
		var info: Dictionary = target_roles.get(picked, {})
		_last_event_text = "대상 선택: %s · 드래그로 각도/거리 유지" % str(info.get("label", picked.enemy_name))
		_sync_reel_button()
		queue_redraw()
		return
	tracking_order.cancel()
	if player != null and player.touches_navigation_point(world_pos):
		navigation_active = false
		_last_event_text = "이미 목표 지점에 닿아 있습니다"
		_sync_reel_button()
		queue_redraw()
		return
	navigation_target = world_pos
	navigation_active = true
	if player != null:
		player.reset_auto_nav_monitor(world_pos)
	_last_event_text = "위치 지정 이동 · (%.0f, %.0f)" % [world_pos.x, world_pos.y]
	_sync_reel_button()
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouse and event.device == -1:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F9:
			_return_to_main()
			return
		if event.keycode == KEY_ESCAPE and (tracking_order.active or tracking_order.dragging or navigation_active):
			cancel_navigation_and_tracking()
			return
		if event.is_action_pressed("fire_grapple") or event.keycode == KEY_G:
			toggle_grapple()
			return
		if event.keycode == KEY_X:
			trigger_sonar_pulse()
			return
		if event.is_action_pressed("restart") or event.keycode == KEY_R:
			reset_arena()
			return
		if event.is_action_pressed("zoom_in"):
			_set_zoom(camera.zoom.x * 1.15)
		elif event.is_action_pressed("zoom_out"):
			_set_zoom(camera.zoom.x / 1.15)
	elif event is InputEventMagnifyGesture:
		_set_zoom(camera.zoom.x * float(event.factor))
	elif event is InputEventScreenTouch:
		if event.pressed and not event.canceled:
			if _is_point_on_ui(event.position):
				return
			_pinch_touches[event.index] = event.position
			if _pinch_touches.size() >= 2:
				_pinch_active = true
				_active_touch_id = -1
				_pointer_dragged = false
				if tracking_order.dragging:
					tracking_order.cancel()
				var pts := _pinch_touches.values()
				_pinch_prev_dist = (pts[0] as Vector2).distance_to(pts[1] as Vector2)
				return
			_pinch_active = false
			if _active_touch_id != -1 and not _pinch_touches.has(_active_touch_id):
				_active_touch_id = -1
			_active_touch_id = event.index
			_pointer_down_pos = event.position
			_pointer_dragged = false
			_begin_world_pointer(event.position, true)
		else:
			_pinch_touches.erase(event.index)
			if _pinch_touches.size() < 2:
				_pinch_prev_dist = 0.0
			if _pinch_active:
				if _pinch_touches.is_empty():
					_pinch_active = false
				return
			if event.index == _active_touch_id:
				_active_touch_id = -1
				_pointer_dragged = false
	elif event is InputEventScreenDrag:
		if _pinch_touches.has(event.index):
			_pinch_touches[event.index] = event.position
		if _pinch_touches.size() >= 2:
			_pinch_active = true
			var pts := _pinch_touches.values()
			var dist := (pts[0] as Vector2).distance_to(pts[1] as Vector2)
			if _pinch_prev_dist > 12.0 and dist > 12.0:
				_set_zoom(camera.zoom.x * (dist / _pinch_prev_dist))
			_pinch_prev_dist = dist
			return
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_zoom(camera.zoom.x * 1.12)
			return
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_zoom(camera.zoom.x / 1.12)
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			_pointer_down_pos = event.position
			_pointer_dragged = false
			_begin_world_pointer(event.position, false)

func _set_zoom(next_zoom: float) -> void:
	var z := clampf(next_zoom, 1.0 / 4.5, 1.6)
	camera.zoom = Vector2(z, z)
	camera.offset = Vector2(-168.0 / maxf(z, 0.2), 0.0)

func _viewport_to_world(screen_pos: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_pos

func _nearest_target_at(world_pos: Vector2, max_radius: float) -> EnemyShip:
	var best: EnemyShip = null
	var best_sq := max_radius * max_radius
	for t in targets:
		if not is_instance_valid(t):
			continue
		var r := max_radius + t.hull_bound_radius
		var d_sq := t.global_position.distance_squared_to(world_pos)
		if d_sq <= r * r and d_sq < best_sq:
			best = t
			best_sq = d_sq
	return best

func toggle_grapple() -> void:
	if grapple != null and is_instance_valid(grapple):
		grapple.detach("MANUAL RELEASE")
		return
	var target := selected_target
	if target == null or not is_instance_valid(target):
		target = _nearest_target_at(_viewport_to_world(get_viewport().get_mouse_position()), 400.0)
	if target == null and not targets.is_empty():
		target = targets[0]
	if target == null or not is_instance_valid(target):
		_last_event_text = "대상이 없습니다"
		return
	selected_target = target
	var max_range := float(grapple_config.get("max_range", BalanceData.GRAPPLE.max_range))
	if not player.is_within_surface_range(target, max_range):
		_last_event_text = "사거리 초과 (최대 %.0fpx)" % max_range
		return
	if not GrappleTetherScript.can_tow(player, target, grapple_config):
		_last_event_text = "질량 부족 · 견인 불가 (내 %.1f / 대상 %.1f)" % [player.mass, target.mass]
		return
	grapple = GrappleTetherScript.new()
	world_layer.add_child(grapple)
	grapple.detached.connect(func(reason: String) -> void:
		_last_event_text = "단선/해제: %s" % reason
		reel_toggle_active = false
		grapple = null
		_sync_reel_button())
	grapple.launch(player, target, grapple_config)
	_last_event_text = "그래플 발사 -> %s" % str(target_roles.get(target, {}).get("label", target.enemy_name))

func _physics_process(delta: float) -> void:
	var fwd := Input.get_axis("thrust_reverse", "thrust_forward")
	var turn := Input.get_axis("turn_left", "turn_right")
	var strafe := Input.get_axis("strafe_left", "strafe_right")
	if _touch_forward: fwd = maxf(fwd, 1.0)
	if _touch_reverse: fwd = minf(fwd, -1.0)
	if _touch_turn_left: turn -= 1.0
	if _touch_turn_right: turn += 1.0
	turn = clampf(turn, -1.0, 1.0)
	var manual_input := absf(fwd) > 0.01 or absf(turn) > 0.01 or absf(strafe) > 0.01
	if manual_input:
		if navigation_active or tracking_order.active:
			navigation_active = false
			tracking_order.cancel()
		player.apply_player_thrusters(maxf(fwd, 0.0), maxf(-fwd, 0.0), turn, strafe)
	elif tracking_order.active:
		_apply_target_tracking()
	elif navigation_active:
		_apply_auto_navigation(delta)
	else:
		player.apply_player_thrusters(0.0, 0.0, 0.0, 0.0)

	if grapple != null and is_instance_valid(grapple) and grapple.connected:
		grapple.set_reeling(reel_toggle_active or Input.is_key_pressed(KEY_V))
	else:
		reel_toggle_active = false
	_sync_reel_button()

	for t in targets:
		if not is_instance_valid(t):
			continue
		var role := str(target_roles.get(t, {}).get("role", ""))
		if t.is_attacking_player():
			if t.can_fire_at_player() and t.ready_to_fire():
				for shot in t.fire_primary_weapons(player.global_position):
					var p := ProjectileScript.new()
					p.setup(shot)
					world_layer.add_child(p)
		elif role == "tug" and resist_enabled and grapple != null and is_instance_valid(grapple) and grapple.target_ship == t and grapple.connected:
			var away := (t.global_position - player.global_position).normalized()
			t.rotation = lerp_angle(t.rotation, away.angle(), minf(delta * 4.0, 1.0))
			t.apply_player_thrusters(0.9, 0.0, 0.0, 0.0)
		else:
			t.active_command_thrust = 0.0
			t.active_exhausts.clear()

	if fire_test_enabled and grapple != null and is_instance_valid(grapple) and grapple.connected:
		_fire_test_timer -= delta
		if _fire_test_timer <= 0.0:
			_fire_test_timer = 0.35
			var shooter := _find_role_ship("shooter")
			if shooter != null:
				var mid := player.global_position.lerp(grapple.target_ship.global_position, 0.5)
				var dir := (mid - shooter.global_position).normalized()
				var proj := ProjectileScript.new()
				proj.setup({
					"team": "enemy",
					"position": shooter.global_position + dir * 24.0,
					"velocity": dir * 680.0,
					"damage": 8.0,
					"color": Color("ff7d75"),
					"life": 1.6,
					"kind": "laser",
				})
				world_layer.add_child(proj)

	for node in world_layer.get_children():
		if node is Projectile and not node.is_queued_for_deletion():
			node.advance(delta)
			if node.team == "enemy" and grapple != null and is_instance_valid(grapple) and grapple.can_be_hit_at(node.global_position):
				grapple.apply_damage(node.damage)
				node.queue_free()

	camera.global_position = player.global_position
	_update_telemetry()
	queue_redraw()

func _apply_target_tracking() -> void:
	if not tracking_order.valid():
		tracking_order.cancel()
		player.apply_player_thrusters(0.0, 0.0, 0.0, 0.0)
		return
	tracking_order.minimum_range = player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE
	var destination: Vector2 = tracking_order.destination()
	var target: ShipBody = tracking_order.target
	var velocity: Vector2 = target.linear_velocity + (destination - player.global_position) * PhysicsData.TRACKING_POSITION_GAIN
	player.apply_tracking_thrusters(velocity.limit_length(player.max_linear_speed()), target.global_position - player.global_position)

func _apply_auto_navigation(delta: float = 1.0 / 60.0) -> void:
	var state := player.step_auto_navigation(navigation_target, delta)
	if state == "arrived":
		navigation_active = false
		_last_event_text = "목표 지점 접촉 도착"
	elif state == "failed":
		navigation_active = false
		_last_event_text = "이동 실패 · 교착 상태 감지로 정지"

func _find_role_ship(role_name: String) -> EnemyShip:
	for t in targets:
		if is_instance_valid(t) and str(target_roles.get(t, {}).get("role", "")) == role_name:
			return t
	return null

func _update_telemetry() -> void:
	if _telemetry_label == null:
		return
	var target_info := "NONE"
	var dist := 0.0
	var mass_ratio := 0.0
	if selected_target != null and is_instance_valid(selected_target):
		target_info = str(target_roles.get(selected_target, {}).get("label", selected_target.enemy_name))
		dist = player.global_position.distance_to(selected_target.global_position)
		mass_ratio = player.mass / maxf(selected_target.mass, 0.1)
	if grapple != null and is_instance_valid(grapple):
		var state := "FLYING" if grapple.hook_flying else ("MAX STRETCH!" if grapple.is_at_max_stretch else "CONNECTED")
		var stress_pct := clampf(grapple.oscillation_stress() * 100.0, 0.0, 100.0)
		_stress_bar.value = stress_pct
		var max_sr := float(grapple_config.get("max_stretch_ratio", BalanceData.GRAPPLE.max_stretch_ratio))
		var drain_note := " [내구도 감소 중!]" if grapple.is_at_max_stretch else ""
		_telemetry_label.text = "상태: %s%s | 대상: %s\nHP: %.0f / %.0f | 신장률: %.2fx / %.2fx | 체인: %d개\n거리: %.0f / %.0fpx | 장력: %.0f | 질량비: %.2fx\n%s" % [
			state, drain_note, target_info, grapple.hp, grapple.max_hp, grapple.stretch_ratio, max_sr, grapple.active_link_count(),
			dist, grapple.max_chain_length(), grapple.current_tension, mass_ratio, _last_event_text
		]
	else:
		_stress_bar.value = 0.0
		_telemetry_label.text = "상태: READY | 대상: %s\n거리: %.0fpx | 내 질량: %.1f | 질량비: %.2fx\n%s" % [
			target_info, dist, player.mass, mass_ratio, _last_event_text
		]

func _draw() -> void:
	if player == null:
		return
	if navigation_active:
		draw_dashed_line(player.global_position, navigation_target, Color("82e7c6", 0.55), 1.6, 10.0)
		draw_circle(navigation_target, 9.0, Color("82e7c6", 0.24))
		draw_arc(navigation_target, 18.0, 0.0, TAU, 24, Color("82e7c6"), 1.8, true)
		draw_line(navigation_target + Vector2(-24, 0), navigation_target + Vector2(24, 0), Color("82e7c6"), 1.2)
		draw_line(navigation_target + Vector2(0, -24), navigation_target + Vector2(0, 24), Color("82e7c6"), 1.2)
	if (tracking_order.active or (tracking_order.dragging and _pointer_dragged)) and tracking_order.valid():
		var geometry: Dictionary = tracking_order.geometry()
		if not geometry.is_empty():
			var center: Vector2 = geometry.center
			var base_end: Vector2 = geometry.base_end
			var desired_end: Vector2 = geometry.desired_end
			var start_ang := (base_end - center).angle()
			var angle: float = geometry.angle
			var radius: float = geometry.radius
			var polygon := PackedVector2Array([center])
			for step in TrackingVisual.SECTOR_SEGMENTS + 1:
				polygon.append(center + Vector2.from_angle(start_ang + angle * float(step) / float(TrackingVisual.SECTOR_SEGMENTS)) * radius)
			if absf(angle) > 0.001:
				draw_colored_polygon(polygon, TrackingVisual.SECTOR_COLOR)
			draw_line(center, base_end, TrackingVisual.BASELINE_COLOR, TrackingVisual.LINE_WIDTH, true)
			draw_line(center, desired_end, TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)
			for step in TrackingVisual.SECTOR_SEGMENTS:
				draw_line(polygon[step + 1], polygon[step + 2], TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)
			draw_circle(desired_end, 10.0, Color("55f4ff", 0.35))
			draw_arc(desired_end, 16.0, 0.0, TAU, 24, TrackingVisual.DESTINATION_COLOR, 2.0, true)
			if ThemeDB.fallback_font != null:
				draw_string(ThemeDB.fallback_font, desired_end + Vector2(-95, -26), "%.0fpx / %+.0f°" % [radius, rad_to_deg(angle)], HORIZONTAL_ALIGNMENT_CENTER, 190, 20, TrackingVisual.DESTINATION_COLOR)
	if grapple != null and is_instance_valid(grapple) and grapple.connected:
		draw_arc(player.global_position, grapple.break_range(), 0.0, TAU, 72, Color(0.35, 0.85, 1.0, 0.22), 1.5)
	for t in targets:
		if not is_instance_valid(t):
			continue
		var is_sel := (t == selected_target)
		var col := Color("ffcf72") if is_sel else Color(0.65, 0.82, 0.95, 0.72)
		if is_sel:
			draw_arc(t.global_position, t.hull_bound_radius + 16.0, 0.0, TAU, 36, col, 2.2)
		var info: Dictionary = target_roles.get(t, {})
		var label_text := "%s [M:%.1f]" % [str(info.get("label", t.enemy_name)), t.mass]
		if ThemeDB.fallback_font != null:
			draw_string(ThemeDB.fallback_font, t.global_position + Vector2(-96, -t.hull_bound_radius - 24), label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, col)
