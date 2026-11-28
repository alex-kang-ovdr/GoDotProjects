class_name SonarTestMap
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")
const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const SonarPulseScript = preload("res://scripts/sonar_pulse.gd")
const SonarResultPopupScript = preload("res://scripts/sonar_result_popup.gd")
const TrackingOrderScript = preload("res://scripts/target_tracking_order.gd")
const TrackingVisual = preload("res://scripts/target_tracking_visual.gd")
const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

var world_layer: Node2D
var player: ShipBody
var camera: Camera2D
var ships: Array[EnemyShip] = []
var stations: Array[Dictionary] = [
	{"id": "alpha_dock", "name": "ALPHA RELAY STATION", "position": Vector2(1150, -520)},
	{"id": "beta_outpost", "name": "BETA SENSOR OUTPOST", "position": Vector2(-1280, 680)},
]
var active_sonar: SonarPulse
var sonar_popup: SonarResultPopup
var mode_switcher: ModeSwitcher
var sonar_range := 2400.0

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

var _ui_layer: CanvasLayer
var _top_banner: PanelContainer
var _touch_bar: PanelContainer
var _touch_grid: GridContainer
var _touch_cancel_btn: Button
var _ui_font: Font

func _ready() -> void:
	_install_ui_font()
	world_layer = Node2D.new()
	world_layer.name = "World"
	add_child(world_layer)
	world_layer.add_child(BackgroundScript.new())

	player = ShipBodyScript.new()
	player.name = "PlayerShip"
	player.position = Vector2.ZERO
	player.rotation = -PI * 0.5
	world_layer.add_child(player)
	player.initialize_player()

	camera = Camera2D.new()
	camera.ignore_rotation = true
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	camera.zoom = Vector2(0.55, 0.55)
	world_layer.add_child(camera)

	_spawn_sector_ships()
	_build_touch_bar()

	sonar_popup = SonarResultPopupScript.new()
	add_child(sonar_popup)

	mode_switcher = ModeSwitcherScript.new()
	mode_switcher.setup("sonar")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_sonar_layout())
	add_child(mode_switcher)
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_sonar_layout)
	_sync_sonar_layout()

func _install_ui_font() -> void:
	_ui_font = UiTheme.load_ui_font()

func _spawn_sector_ships() -> void:
	for s in ships:
		if is_instance_valid(s):
			s.queue_free()
	ships.clear()
	var defs := [
		{"name": "적대 정찰기 A", "pos": Vector2(620, -280), "level": 1, "hostile": true, "boss": ""},
		{"name": "중립 수송선 B", "pos": Vector2(-560, -340), "level": 2, "hostile": false, "boss": ""},
		{"name": "적대 강습함 C", "pos": Vector2(880, 460), "level": 3, "hostile": true, "boss": ""},
		{"name": "중립 탐사선 D", "pos": Vector2(-780, 320), "level": 2, "hostile": false, "boss": ""},
		{"name": "적대 포격함 E", "pos": Vector2(180, -860), "level": 3, "hostile": true, "boss": ""},
		{"name": "원거리 보스 F", "pos": Vector2(1650, -140), "level": 5, "hostile": true, "boss": "RIFT SENTINEL"},
	]
	for d in defs:
		var ship := EnemyShipScript.new()
		ship.position = d.pos
		ship.rotation = (player.position - Vector2(d.pos)).angle()
		world_layer.add_child(ship)
		ship.setup(int(d.level), str(d.boss), "aggressive" if bool(d.hostile) and str(d.boss).is_empty() else "roamer")
		ship.enemy_name = str(d.name)
		ship.hostile_on_sonar = bool(d.hostile)
		ship.radar_range = 0.0
		ships.append(ship)

func _build_touch_bar() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 50
	add_child(_ui_layer)

	var t := UiTheme.build_theme(true)

	_top_banner = PanelContainer.new()
	_top_banner.theme = t
	_top_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_banner.add_theme_stylebox_override("panel", UiTheme.make_box(Color(0.03, 0.07, 0.14, 0.90), Color(0.36, 0.86, 1.0, 0.80), 11, 12, 9, 2))
	_ui_layer.add_child(_top_banner)

	var bcol := VBoxContainer.new()
	bcol.add_theme_constant_override("separation", 3)
	bcol.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_banner.add_child(bcol)

	var btitle := Label.new()
	btitle.text = "SONAR LAB · 소나 탐지 실험실"
	btitle.clip_text = true
	btitle.add_theme_font_size_override("font_size", 24)
	btitle.add_theme_color_override("font_color", Color("8ef8ff"))
	bcol.add_child(btitle)

	var bsub := Label.new()
	bsub.text = "하단 [소나 (X)] 발신 -> 적대/중립/상호탐지 판독 · 화면 터치 항법"
	bsub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	bsub.add_theme_font_size_override("font_size", 19)
	bsub.add_theme_color_override("font_color", Color("d8f0ff"))
	bcol.add_child(bsub)

	_touch_bar = PanelContainer.new()
	_touch_bar.theme = t
	_touch_bar.add_theme_stylebox_override("panel", UiTheme.make_box(Color(0.03, 0.06, 0.12, 0.92), Color(0.32, 0.78, 0.96, 0.80), 10, 8, 6, 2))
	_ui_layer.add_child(_touch_bar)

	_touch_grid = GridContainer.new()
	_touch_grid.columns = 9
	_touch_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_touch_grid.add_theme_constant_override("h_separation", 6)
	_touch_grid.add_theme_constant_override("v_separation", 6)
	_touch_bar.add_child(_touch_grid)

	var make_hold := func(text: String, cb: Callable) -> Button:
		var b := Button.new()
		b.text = text
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 19)
		b.button_down.connect(func() -> void: cb.call(true))
		b.button_up.connect(func() -> void: cb.call(false))
		return b

	_touch_grid.add_child(make_hold.call("좌회전", func(v: bool) -> void: _touch_turn_left = v))
	_touch_grid.add_child(make_hold.call("전진 ▲", func(v: bool) -> void: _touch_forward = v))
	_touch_grid.add_child(make_hold.call("후진 ▼", func(v: bool) -> void: _touch_reverse = v))
	_touch_grid.add_child(make_hold.call("우회전", func(v: bool) -> void: _touch_turn_right = v))

	var make_tap := func(text: String, cb: Callable) -> Button:
		var b := Button.new()
		b.text = text
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 19)
		b.pressed.connect(cb)
		return b

	_touch_grid.add_child(make_tap.call("축소 -", func() -> void: _set_zoom(camera.zoom.x / 1.18)))
	_touch_grid.add_child(make_tap.call("확대 +", func() -> void: _set_zoom(camera.zoom.x * 1.18)))
	_touch_cancel_btn = make_tap.call("자동정지", cancel_navigation_and_tracking)
	_touch_cancel_btn.disabled = true
	_touch_grid.add_child(_touch_cancel_btn)
	_touch_grid.add_child(make_tap.call("초기화", reset_sector))
	_touch_grid.add_child(make_tap.call("소나 (X)", trigger_sonar_pulse))

func _sync_sonar_layout() -> void:
	if _touch_bar == null or get_viewport() == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	if _top_banner != null:
		var bw := minf(560.0, vp.x - 20.0)
		_top_banner.anchor_left = 0.0
		_top_banner.anchor_right = 0.0
		_top_banner.offset_left = 10.0
		_top_banner.offset_right = 10.0 + bw
		_top_banner.offset_top = 10.0
	if _touch_grid != null:
		_touch_grid.columns = 5 if narrow else 9
	var bar_h := 122.0 if narrow else 68.0
	_touch_bar.anchor_left = 0.0
	_touch_bar.anchor_right = 1.0
	_touch_bar.anchor_top = 1.0
	_touch_bar.anchor_bottom = 1.0
	_touch_bar.offset_left = 10.0 if narrow else 12.0
	_touch_bar.offset_right = -10.0 if narrow else -12.0
	_touch_bar.offset_top = -10.0 - bar_h
	_touch_bar.offset_bottom = -10.0

func trigger_sonar_pulse() -> void:
	if active_sonar != null and is_instance_valid(active_sonar):
		active_sonar.queue_free()
	active_sonar = SonarPulseScript.new()
	world_layer.add_child(active_sonar)
	active_sonar.scan_completed.connect(func(report: Dictionary) -> void:
		if sonar_popup != null and is_instance_valid(sonar_popup):
			sonar_popup.show_report(report))
	active_sonar.launch(player, ships, stations, [], sonar_range)

func reset_sector() -> void:
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
	_spawn_sector_ships()

func cancel_navigation_and_tracking() -> void:
	navigation_active = false
	tracking_order.cancel()
	_pointer_dragged = false
	_active_touch_id = -1
	_sync_cancel_btn()

func _sync_cancel_btn() -> void:
	if _touch_cancel_btn == null:
		return
	var auto_on: bool = navigation_active or bool(tracking_order.active)
	_touch_cancel_btn.disabled = not auto_on
	_touch_cancel_btn.text = "추적정지" if bool(tracking_order.active) else ("이동정지" if navigation_active else "자동정지")

func _set_zoom(next_zoom: float) -> void:
	var z := clampf(next_zoom, 1.0 / 4.5, 1.6)
	camera.zoom = Vector2(z, z)

func _is_on_ui(screen_pos: Vector2) -> bool:
	if _touch_bar != null and _touch_bar.visible and _touch_bar.get_global_rect().has_point(screen_pos):
		return true
	if mode_switcher != null and mode_switcher.is_point_inside(screen_pos):
		return true
	if sonar_popup != null and sonar_popup.is_showing() and sonar_popup._panel != null and sonar_popup._panel.get_global_rect().has_point(screen_pos):
		return true
	return false

func _viewport_to_world(screen_pos: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_pos

func _nearest_ship_at(world_pos: Vector2, pad: float) -> EnemyShip:
	var best: EnemyShip = null
	var best_sq := INF
	for s in ships:
		if not is_instance_valid(s) or not s.alive():
			continue
		var r := s.hull_bound_radius + pad
		var d_sq := s.global_position.distance_squared_to(world_pos)
		if d_sq <= r * r and d_sq < best_sq:
			best = s
			best_sq = d_sq
	return best

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
		if event is InputEventMouseMotion or (event is InputEventScreenDrag and event.index == _active_touch_id):
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
				else:
					tracking_order.cancel()
			else:
				tracking_order.cancel()
			_pointer_dragged = false
			_active_touch_id = -1
			_sync_cancel_btn()
			queue_redraw()
			get_viewport().set_input_as_handled()

func _begin_pointer(screen_pos: Vector2, is_touch: bool) -> void:
	if _is_on_ui(screen_pos):
		return
	var world_pos := _viewport_to_world(screen_pos)
	var picked := _nearest_ship_at(world_pos, 46.0 if is_touch else 28.0)
	if picked != null:
		navigation_active = false
		tracking_order.begin(picked, player.global_position, player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE)
		_sync_cancel_btn()
		queue_redraw()
		return
	tracking_order.cancel()
	if player != null and player.touches_navigation_point(world_pos):
		navigation_active = false
		_sync_cancel_btn()
		queue_redraw()
		return
	navigation_target = world_pos
	navigation_active = true
	if player != null:
		player.reset_auto_nav_monitor(world_pos)
	_sync_cancel_btn()
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouse and event.device == -1:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_X:
			trigger_sonar_pulse()
		elif event.keycode == KEY_R:
			reset_sector()
		elif event.keycode == KEY_ESCAPE:
			cancel_navigation_and_tracking()
		elif event.is_action_pressed("zoom_in"):
			_set_zoom(camera.zoom.x * 1.15)
		elif event.is_action_pressed("zoom_out"):
			_set_zoom(camera.zoom.x / 1.15)
	elif event is InputEventMagnifyGesture:
		_set_zoom(camera.zoom.x * float(event.factor))
	elif event is InputEventScreenTouch:
		if event.pressed and not event.canceled:
			if _is_on_ui(event.position):
				return
			_pinch_touches[event.index] = event.position
			if _pinch_touches.size() >= 2:
				_pinch_active = true
				_active_touch_id = -1
				tracking_order.cancel()
				var pts := _pinch_touches.values()
				_pinch_prev_dist = (pts[0] as Vector2).distance_to(pts[1] as Vector2)
				return
			_pinch_active = false
			_active_touch_id = event.index
			_pointer_down_pos = event.position
			_pointer_dragged = false
			_begin_pointer(event.position, true)
		else:
			_pinch_touches.erase(event.index)
			if _pinch_touches.size() < 2:
				_pinch_prev_dist = 0.0
			if _pinch_active and _pinch_touches.is_empty():
				_pinch_active = false
			if event.index == _active_touch_id:
				_active_touch_id = -1
	elif event is InputEventScreenDrag and _pinch_touches.has(event.index):
		_pinch_touches[event.index] = event.position
		if _pinch_touches.size() >= 2:
			var pts := _pinch_touches.values()
			var d := (pts[0] as Vector2).distance_to(pts[1] as Vector2)
			if _pinch_prev_dist > 12.0 and d > 12.0:
				_set_zoom(camera.zoom.x * (d / _pinch_prev_dist))
			_pinch_prev_dist = d
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_zoom(camera.zoom.x * 1.12)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_zoom(camera.zoom.x / 1.12)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			_pointer_down_pos = event.position
			_pointer_dragged = false
			_begin_pointer(event.position, false)

func _physics_process(delta: float) -> void:
	var fwd := Input.get_axis("thrust_reverse", "thrust_forward")
	var turn := Input.get_axis("turn_left", "turn_right")
	var strafe := Input.get_axis("strafe_left", "strafe_right")
	if _touch_forward: fwd = maxf(fwd, 1.0)
	if _touch_reverse: fwd = minf(fwd, -1.0)
	if _touch_turn_left: turn -= 1.0
	if _touch_turn_right: turn += 1.0
	turn = clampf(turn, -1.0, 1.0)
	if absf(fwd) > 0.01 or absf(turn) > 0.01 or absf(strafe) > 0.01:
		navigation_active = false
		tracking_order.cancel()
		player.apply_player_thrusters(maxf(fwd, 0.0), maxf(-fwd, 0.0), turn, strafe)
	elif bool(tracking_order.active):
		if tracking_order.valid():
			tracking_order.minimum_range = player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE
			var dest: Vector2 = tracking_order.destination()
			var tgt: ShipBody = tracking_order.target
			var vel: Vector2 = tgt.linear_velocity + (dest - player.global_position) * PhysicsData.TRACKING_POSITION_GAIN
			player.apply_tracking_thrusters(vel.limit_length(player.max_linear_speed()), tgt.global_position - player.global_position)
		else:
			tracking_order.cancel()
	elif navigation_active:
		var nav_state := player.step_auto_navigation(navigation_target, delta)
		if nav_state == "arrived" or nav_state == "failed":
			navigation_active = false
	else:
		player.apply_player_thrusters(0.0, 0.0, 0.0, 0.0)

	for s in ships:
		if is_instance_valid(s) and s.is_attacking_player() and s.can_fire_at_player() and s.ready_to_fire():
			for shot in s.fire_primary_weapons(player.global_position):
				var p := ProjectileScript.new()
				p.setup(shot)
				world_layer.add_child(p)
	for node in world_layer.get_children():
		if node is Projectile and not node.is_queued_for_deletion():
			node.advance(delta)

	_sync_cancel_btn()
	camera.global_position = player.global_position
	queue_redraw()

func _draw() -> void:
	for st in stations:
		var pt: Vector2 = st.position
		draw_arc(pt, 36.0, 0.0, TAU, 24, Color("6ef5a8"), 1.8)
		if ThemeDB.fallback_font != null:
			draw_string(ThemeDB.fallback_font, pt + Vector2(-140, -48), str(st.name), HORIZONTAL_ALIGNMENT_CENTER, 280, 22, Color("a8ffd0"))
	if navigation_active:
		draw_dashed_line(player.global_position, navigation_target, Color("82e7c6", 0.65), 1.6, 10.0)
		draw_arc(navigation_target, 18.0, 0.0, TAU, 24, Color("82e7c6"), 1.8)
	if (bool(tracking_order.active) or (bool(tracking_order.dragging) and _pointer_dragged)) and tracking_order.valid():
		var g: Dictionary = tracking_order.geometry()
		if not g.is_empty():
			draw_line(g.center, g.base_end, TrackingVisual.BASELINE_COLOR, 2.0)
			draw_line(g.center, g.desired_end, TrackingVisual.DESTINATION_COLOR, 2.0)
			draw_arc(g.desired_end, 16.0, 0.0, TAU, 24, TrackingVisual.DESTINATION_COLOR, 2.0)
