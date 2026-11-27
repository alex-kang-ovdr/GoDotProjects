class_name GrappleTestMap
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")
const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const GrappleTetherScript = preload("res://scripts/grapple_tether.gd")
const CombatFxScript = preload("res://scripts/combat_fx.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")

const SLIDER_SPECS := [
	{"key": "reel_force", "label": "끌어당기기 힘 (Pull Force)", "min": 1000.0, "max": 80000.0, "step": 1000.0, "fmt": "%.0f"},
	{"key": "reel_speed", "label": "끌어당기기 최대 속도 (px/s)", "min": 40.0, "max": 1000.0, "step": 20.0, "fmt": "%.0f"},
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
var grapple_config: Dictionary = {}

var resist_enabled := true
var fire_test_enabled := false
var reel_toggle_active := false
var _fire_test_timer := 0.0
var _last_event_text := "G: 발사/해제 · V: 끌어당기기 · 클릭: 대상 · WASD/QE: 비행 · 휠: 줌"
var _panel_collapsed := false

var _ui_layer: CanvasLayer
var _panel: PanelContainer
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
	_sync_sliders_from_config()
	_update_telemetry()

func _install_ui_font() -> void:
	if FileAccess.file_exists("res://assets/fonts/captain-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/captain-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			_ui_font = ff
			ThemeDB.fallback_font = ff

func _spawn_test_targets() -> void:
	for t in targets:
		if is_instance_valid(t):
			t.queue_free()
	targets.clear()
	target_roles.clear()
	selected_target = null

	var specs := [
		{"role": "light", "label": "경량 드론 (EASY TOW)", "pos": Vector2(360, -140), "level": 1},
		{"role": "tug", "label": "동급 저항선 (TUG-OF-WAR)", "pos": Vector2(400, 140), "level": 2},
		{"role": "heavy", "label": "중량 프리깃 (HEAVY)", "pos": Vector2(-380, 140), "level": 5},
		{"role": "shooter", "label": "포격 더미 (CHAIN HIT)", "pos": Vector2(-340, -160), "level": 2},
	]
	for spec in specs:
		var ship := EnemyShipScript.new()
		ship.position = spec.pos
		ship.rotation = (player.position - Vector2(spec.pos)).angle()
		world_layer.add_child(ship)
		ship.setup(int(spec.level), "", "roamer")
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
	_panel.position = Vector2(14, 14)
	_panel.custom_minimum_size = Vector2(360, 0)
	if _ui_font != null:
		var ui_theme := Theme.new()
		ui_theme.default_font = _ui_font
		_panel.theme = ui_theme
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.07, 0.13, 0.88)
	style.border_color = Color(0.32, 0.72, 0.95, 0.75)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(12)
	_panel.add_theme_stylebox_override("panel", style)
	_ui_layer.add_child(_panel)

	var root_box := VBoxContainer.new()
	root_box.add_theme_constant_override("separation", 8)
	_panel.add_child(root_box)

	var header := HBoxContainer.new()
	root_box.add_child(header)
	var title := Label.new()
	title.text = "GRAPPLE LAB · 그래플 실시간 실험실"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_color_override("font_color", Color("91eaff"))
	header.add_child(title)

	_collapse_btn = Button.new()
	_collapse_btn.text = "접기"
	_collapse_btn.pressed.connect(_toggle_collapse)
	header.add_child(_collapse_btn)

	_telemetry_label = Label.new()
	_telemetry_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_telemetry_label.add_theme_font_size_override("font_size", 13)
	_telemetry_label.add_theme_color_override("font_color", Color("d8ecff"))
	root_box.add_child(_telemetry_label)

	var stress_row := HBoxContainer.new()
	root_box.add_child(stress_row)
	var stress_lbl := Label.new()
	stress_lbl.text = "공진 스트레스"
	stress_lbl.custom_minimum_size = Vector2(96, 0)
	stress_lbl.add_theme_font_size_override("font_size", 12)
	stress_row.add_child(stress_lbl)
	_stress_bar = ProgressBar.new()
	_stress_bar.min_value = 0.0
	_stress_bar.max_value = 100.0
	_stress_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_stress_bar.custom_minimum_size = Vector2(0, 16)
	stress_row.add_child(_stress_bar)

	var btn_grid := GridContainer.new()
	btn_grid.columns = 2
	btn_grid.add_theme_constant_override("h_separation", 6)
	btn_grid.add_theme_constant_override("v_separation", 6)
	root_box.add_child(btn_grid)

	var fire_grapple_btn := Button.new()
	fire_grapple_btn.text = "그래플 발사/해제 (G)"
	fire_grapple_btn.pressed.connect(toggle_grapple)
	btn_grid.add_child(fire_grapple_btn)

	_reel_btn = Button.new()
	_reel_btn.text = "끌어당기기: 대기 (V)"
	_reel_btn.disabled = true
	_reel_btn.pressed.connect(toggle_reel_in)
	btn_grid.add_child(_reel_btn)

	var reset_btn := Button.new()
	reset_btn.text = "함선 위치 초기화 (R)"
	reset_btn.pressed.connect(reset_arena)
	btn_grid.add_child(reset_btn)

	var default_btn := Button.new()
	default_btn.text = "3배 강화 기본값"
	default_btn.pressed.connect(apply_default_preset)
	btn_grid.add_child(default_btn)

	var legacy_btn := Button.new()
	legacy_btn.text = "구버전(약함) 설정"
	legacy_btn.pressed.connect(apply_legacy_preset)
	btn_grid.add_child(legacy_btn)

	_resist_btn = Button.new()
	_resist_btn.text = "적 저항 추력: ON"
	_resist_btn.pressed.connect(_toggle_resist)
	btn_grid.add_child(_resist_btn)

	_fire_btn = Button.new()
	_fire_btn.text = "적 사격 테스트: OFF"
	_fire_btn.pressed.connect(_toggle_fire_test)
	btn_grid.add_child(_fire_btn)

	var back_btn := Button.new()
	back_btn.text = "메인 게임으로 (F9)"
	back_btn.pressed.connect(_return_to_main)
	btn_grid.add_child(back_btn)

	_scroll = ScrollContainer.new()
	_scroll.custom_minimum_size = Vector2(336, 360)
	root_box.add_child(_scroll)

	var sliders_box := VBoxContainer.new()
	sliders_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sliders_box.add_theme_constant_override("separation", 6)
	_scroll.add_child(sliders_box)

	for spec in SLIDER_SPECS:
		var key: String = spec.key
		var row := VBoxContainer.new()
		row.add_theme_constant_override("separation", 2)
		sliders_box.add_child(row)

		var top := HBoxContainer.new()
		row.add_child(top)
		var lbl := Label.new()
		lbl.text = spec.label
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.add_theme_color_override("font_color", Color("b8d7f0"))
		top.add_child(lbl)

		var val_lbl := Label.new()
		val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		val_lbl.custom_minimum_size = Vector2(68, 0)
		val_lbl.add_theme_font_size_override("font_size", 12)
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
	if _reel_btn == null:
		return
	var can_reel := grapple != null and is_instance_valid(grapple) and grapple.connected
	_reel_btn.disabled = not can_reel
	if not can_reel:
		_reel_btn.text = "끌어당기기: 대기 (V)"
	else:
		var active := reel_toggle_active or Input.is_key_pressed(KEY_V)
		_reel_btn.text = "끌어당기기: %s (V)" % ("ON" if active else "OFF")

func _toggle_fire_test() -> void:
	fire_test_enabled = not fire_test_enabled
	_fire_btn.text = "적 사격 테스트: %s" % ("ON" if fire_test_enabled else "OFF")

func _toggle_collapse() -> void:
	_panel_collapsed = not _panel_collapsed
	_scroll.visible = not _panel_collapsed
	_collapse_btn.text = "펼치기" if _panel_collapsed else "접기"

func _return_to_main() -> void:
	if get_tree() != null:
		get_tree().change_scene_to_file("res://scenes/main.tscn")

func reset_arena() -> void:
	if grapple != null and is_instance_valid(grapple):
		grapple.detach("ARENA RESET")
		grapple = null
	player.global_position = Vector2.ZERO
	player.rotation = -PI * 0.5
	player.linear_velocity = Vector2.ZERO
	player.angular_velocity = 0.0
	player.repair_all()
	_spawn_test_targets()
	_last_event_text = "아레나 초기화 완료"

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F9:
			_return_to_main()
			return
		if event.is_action_pressed("fire_grapple") or event.keycode == KEY_G:
			toggle_grapple()
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
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_zoom(camera.zoom.x * 1.12)
			return
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_zoom(camera.zoom.x / 1.12)
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			var world_pos := _viewport_to_world(event.position)
			var picked := _nearest_target_at(world_pos, 180.0)
			if picked != null:
				selected_target = picked
				var info: Dictionary = target_roles.get(picked, {})
				_last_event_text = "대상 선택: %s (질량 %.1f)" % [str(info.get("label", picked.enemy_name)), picked.mass]

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
	player.apply_player_thrusters(maxf(fwd, 0.0), maxf(-fwd, 0.0), turn, strafe)

	if grapple != null and is_instance_valid(grapple) and grapple.connected:
		grapple.set_reeling(reel_toggle_active or Input.is_key_pressed(KEY_V))
	else:
		reel_toggle_active = false
	_sync_reel_button()

	for t in targets:
		if not is_instance_valid(t):
			continue
		var role := str(target_roles.get(t, {}).get("role", ""))
		if role == "tug" and resist_enabled and grapple != null and is_instance_valid(grapple) and grapple.target_ship == t and grapple.connected:
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
	if grapple != null and is_instance_valid(grapple) and grapple.connected:
		draw_arc(player.global_position, grapple.break_range(), 0.0, TAU, 72, Color(0.35, 0.85, 1.0, 0.22), 1.5)
	for t in targets:
		if not is_instance_valid(t):
			continue
		var is_sel := (t == selected_target)
		var col := Color("ffcf72") if is_sel else Color(0.65, 0.82, 0.95, 0.55)
		if is_sel:
			draw_arc(t.global_position, t.hull_bound_radius + 16.0, 0.0, TAU, 36, col, 2.0)
		var info: Dictionary = target_roles.get(t, {})
		var label_text := "%s [M:%.1f]" % [str(info.get("label", t.enemy_name)), t.mass]
		if ThemeDB.fallback_font != null:
			draw_string(ThemeDB.fallback_font, t.global_position + Vector2(-72, -t.hull_bound_radius - 22), label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, col)
