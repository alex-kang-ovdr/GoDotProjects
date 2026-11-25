extends CanvasLayer
## PlayHub Universal Android Virtual Gamepad & Dual-Stick Overlay.
## Attached by bootstrap.gd to get_tree().root so every Godot .pck game has
## responsive multi-touch dual-stick / action controls out of the box, while
## automatically standing down when a game declares native touch controls
## (get_tree().root.set_meta("playhub_native_touch_controls", true)).

const STICK_DEADZONE := 0.14
const DPAD_REPEAT_INITIAL := 0.24
const DPAD_REPEAT_INTERVAL := 0.16

var profile: String = "none"
var game_id_norm: String = ""
var user_visible: bool = true
var active_for_game: bool = false

# Left stick state
var has_left_stick: bool = false
var left_label: String = "MOVE"
var left_touch_id: int = -1
var left_origin: Vector2 = Vector2.ZERO
var left_vec: Vector2 = Vector2.ZERO
var left_radius: float = 58.0

# Right stick state
var has_right_stick: bool = false
var right_mode: String = "" # "aim_fire", "fps_look", "turret"
var right_label: String = "AIM"
var right_touch_id: int = -1
var right_origin: Vector2 = Vector2.ZERO
var right_last: Vector2 = Vector2.ZERO
var right_vec: Vector2 = Vector2.ZERO
var right_radius: float = 58.0
var right_press_time: float = 0.0
var right_max_travel: float = 0.0
var _tap_fire_timer: float = 0.0

# Buttons: Array of {id, label, color, action, key, mode ("hold"|"tap"|"fps_mine"|"fps_place"|"fps_slot"), rect, touch_id}
var buttons: Array[Dictionary] = []

# Toggle pill
var _toggle_rect: Rect2 = Rect2()
var _toggle_touch_id: int = -1

# Held state tracking so we never leak stuck inputs
var _held_actions: Dictionary = {}
var _held_keys: Dictionary = {}

# Discrete step D-pad state (unity-2d-roguelike)
var _dpad_dir: String = ""
var _dpad_timer: float = 0.0

# Tap-anywhere state (unity-flappy-bird)
var _tap_anywhere: bool = false

# FPS look drag state
var _fps_slot_index: int = 0

var _overlay: Control


class _PadDrawControl extends Control:
	var owner_pad: Node

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		if owner_pad != null:
			owner_pad._draw_pad(self)


func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	_overlay = _PadDrawControl.new()
	_overlay.owner_pad = self
	add_child(_overlay)


func configure(raw_game_id: String, pck_path: String, game_settings: Dictionary) -> void:
	var app_name := str(game_settings.get("application/config/name", ""))
	game_id_norm = ("%s %s %s" % [raw_game_id, pck_path.get_file(), app_name]).to_lower()
	profile = _resolve_profile(game_id_norm, game_settings)
	_setup_profile(profile)
	active_for_game = profile != "none"
	visible = active_for_game
	print("PlayHubVirtualGamepad: profile=", profile, " active=", active_for_game, " id=", raw_game_id)


func _resolve_profile(norm: String, game_settings: Dictionary) -> String:
	# Games with complete native touch controls
	if norm.contains("survivor-io") or norm.contains("survivor_io") or norm.contains("survivor-arena"):
		return "none"
	if norm.contains("tappy-chicken") or norm.contains("tappy_chicken"):
		return "none"
	if norm.contains("fortress-war") or norm.contains("fortress_war"):
		return "none"

	# Specific Forge templates
	if norm.contains("brawllabs") or norm.contains("brawl"):
		return "dual_stick_arena"
	if norm.contains("voxel-frontier") or norm.contains("voxel_frontier") or norm.contains("voxel frontier"):
		return "dual_stick_fps"
	if norm.contains("iron-wood") or norm.contains("iron_wood") or norm.contains("iron wood"):
		return "dual_stick_vehicle"
	if norm.contains("captain-forever") or norm.contains("captain_forever") or norm.contains("captain forever"):
		return "flight_stick"
	if norm.contains("unity-tanks") or norm.contains("tanks-3d") or norm.contains("tanks!"):
		return "stick_charge"
	if norm.contains("unity-2d-roguelike") or norm.contains("scavengers") or norm.contains("roguelike"):
		return "dpad_step"
	if norm.contains("unity-roll-a-ball") or norm.contains("roll-a-ball") or norm.contains("roll a ball"):
		return "stick_only"
	if norm.contains("unity-space-shooter") or norm.contains("space-shooter") or norm.contains("space shooter"):
		return "stick_shooter"
	if norm.contains("unity-flappy-bird") or norm.contains("flappy"):
		return "tap_only"
	if norm.contains("roblox-") or norm.contains("chaos-obby") or norm.contains("lantai-runtuh") or norm.contains("power-punch") or norm.contains("war-tycoon"):
		return "stick_jump"
	if norm.contains("boss-room") or norm.contains("boss_room"):
		return "dual_stick_arena"

	# Auto-detect from InputMap / project settings for user-authored Forge games
	if game_settings.has("input/move_left") and game_settings.has("input/attack"):
		return "dual_stick_arena"
	if game_settings.has("input/move_left") or game_settings.has("input/move_forward"):
		return "stick_jump"
	return "none"


func _setup_profile(p: String) -> void:
	has_left_stick = false
	has_right_stick = false
	right_mode = ""
	_tap_anywhere = false
	buttons.clear()

	match p:
		"dual_stick_arena":
			has_left_stick = true
			left_label = "MOVE"
			has_right_stick = true
			right_mode = "aim_fire"
			right_label = "AIM · FIRE"
			buttons.append({"id": "super", "label": "SUPER", "color": Color(0.68, 0.45, 0.96, 0.72), "action": "super", "key": KEY_E, "mode": "tap", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "gadget", "label": "GADGET", "color": Color(0.28, 0.78, 0.72, 0.72), "action": "gadget", "key": KEY_Q, "mode": "tap", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "restart", "label": "R", "color": Color(0.38, 0.48, 0.62, 0.62), "action": "restart", "key": KEY_R, "mode": "tap", "rect": Rect2(), "touch_id": -1})
		"dual_stick_fps":
			has_left_stick = true
			left_label = "MOVE"
			has_right_stick = true
			right_mode = "fps_look"
			right_label = "LOOK"
			buttons.append({"id": "jump", "label": "JUMP", "color": Color(0.26, 0.76, 0.56, 0.72), "action": "", "key": KEY_SPACE, "mode": "hold", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "mine", "label": "MINE", "color": Color(0.92, 0.52, 0.34, 0.72), "action": "", "key": 0, "mode": "fps_mine", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "place", "label": "PLACE", "color": Color(0.36, 0.66, 0.94, 0.72), "action": "", "key": 0, "mode": "fps_place", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "slot", "label": "SLOT", "color": Color(0.55, 0.58, 0.72, 0.68), "action": "", "key": 0, "mode": "fps_slot", "rect": Rect2(), "touch_id": -1})
		"dual_stick_vehicle":
			has_left_stick = true
			left_label = "DRIVE"
			has_right_stick = true
			right_mode = "turret"
			right_label = "TURRET"
			buttons.append({"id": "fire", "label": "FIRE", "color": Color(0.92, 0.42, 0.38, 0.76), "action": "", "key": KEY_F, "mode": "hold", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "build", "label": "BUILD", "color": Color(0.32, 0.72, 0.86, 0.72), "action": "", "key": KEY_B, "mode": "tap", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "reset", "label": "RESET", "color": Color(0.45, 0.52, 0.62, 0.65), "action": "", "key": KEY_R, "mode": "tap", "rect": Rect2(), "touch_id": -1})
		"flight_stick":
			has_left_stick = true
			left_label = "THRUST"
			buttons.append({"id": "strafe_l", "label": "SL", "color": Color(0.28, 0.64, 0.78, 0.66), "action": "strafe_left", "key": KEY_Q, "mode": "hold", "rect": Rect2(), "touch_id": -1, "side": "left"})
			buttons.append({"id": "strafe_r", "label": "SR", "color": Color(0.28, 0.64, 0.78, 0.66), "action": "strafe_right", "key": KEY_E, "mode": "hold", "rect": Rect2(), "touch_id": -1, "side": "left"})
		"stick_charge":
			has_left_stick = true
			left_label = "DRIVE"
			buttons.append({"id": "fire", "label": "FIRE", "color": Color(0.94, 0.46, 0.34, 0.78), "action": "", "key": KEY_SPACE, "mode": "hold", "rect": Rect2(), "touch_id": -1})
		"stick_jump":
			has_left_stick = true
			left_label = "MOVE"
			buttons.append({"id": "jump", "label": "JUMP", "color": Color(0.18, 0.78, 0.54, 0.78), "action": "ui_accept", "key": KEY_SPACE, "mode": "hold", "rect": Rect2(), "touch_id": -1})
		"stick_shooter":
			has_left_stick = true
			left_label = "MOVE"
			buttons.append({"id": "fire", "label": "FIRE", "color": Color(0.94, 0.46, 0.38, 0.78), "action": "ui_accept", "key": KEY_SPACE, "mode": "hold", "rect": Rect2(), "touch_id": -1})
			buttons.append({"id": "retry", "label": "RETRY", "color": Color(0.44, 0.54, 0.68, 0.68), "action": "", "key": KEY_R, "mode": "tap", "rect": Rect2(), "touch_id": -1})
		"stick_only":
			has_left_stick = true
			left_label = "ROLL"
		"dpad_step":
			has_left_stick = true
			left_label = "STEP"
			buttons.append({"id": "retry", "label": "RETRY", "color": Color(0.46, 0.56, 0.70, 0.72), "action": "", "key": KEY_R, "mode": "tap", "rect": Rect2(), "touch_id": -1})
		"tap_only":
			_tap_anywhere = true


func _is_native_touch_claimed() -> bool:
	if not is_inside_tree():
		return false
	var tree := get_tree()
	if tree == null or tree.root == null:
		return false
	return bool(tree.root.get_meta("playhub_native_touch_controls", false))

func _mark_handled() -> void:
	var vp := get_viewport()
	if vp != null:
		vp.set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		_release_all()


func _exit_tree() -> void:
	_release_all()


func _vp_size() -> Vector2:
	var vp := get_viewport()
	if vp == null:
		return Vector2(1280.0, 720.0)
	return vp.get_visible_rect().size


func _layout_geometry() -> Dictionary:
	var sz := _vp_size()
	var short_side := minf(sz.x, sz.y)
	# Balanced 70% sizing (~96px radius on 720p) for comfortable thumb control without crowding the viewport.
	var base_r := clampf(short_side * 0.136, 60.0, 96.0)
	base_r = minf(base_r, sz.x * 0.17)
	left_radius = base_r
	right_radius = base_r

	var margin_x := clampf(sz.x * 0.032, 18.0, 42.0)
	var margin_y := clampf(sz.y * 0.042, 18.0, 38.0)
	var left_center := Vector2(margin_x + base_r + 8.0, sz.y - margin_y - base_r - 10.0)
	var right_center := Vector2(sz.x - margin_x - base_r - 8.0, sz.y - margin_y - base_r - 10.0)

	# Toggle pill at top-right (never collides with PlayHub top-left overlay)
	var pill_w := clampf(short_side * 0.11, 62.0, 82.0)
	var pill_h := clampf(short_side * 0.056, 30.0, 38.0)
	_toggle_rect = Rect2(sz.x - pill_w - 16.0, 14.0, pill_w, pill_h)

	# Layout action buttons cleanly around right stick (or left stick for flight_stick)
	var btn_d := clampf(short_side * 0.130, 62.0, 92.0)
	btn_d = minf(btn_d, sz.x * 0.16)
	var right_btns: Array[int] = []
	var left_btns: Array[int] = []
	for i in range(buttons.size()):
		if str(buttons[i].get("side", "right")) == "left":
			left_btns.append(i)
		else:
			right_btns.append(i)

	for idx in range(left_btns.size()):
		var bi := left_btns[idx]
		var bw := btn_d * 0.72
		var bh := btn_d * 0.48
		var bx := left_center.x - bw - 8.0 + float(idx) * (bw + 16.0)
		var by := left_center.y - base_r - bh - 16.0
		buttons[bi]["rect"] = Rect2(bx, by, bw, bh)

	if has_right_stick:
		# Place action buttons in an arc above/left of the right stick
		var arc_offsets := [
			Vector2(-base_r * 1.42, -base_r * 0.22),
			Vector2(-base_r * 0.92, -base_r * 1.28),
			Vector2(base_r * 0.22, -base_r * 1.48),
			Vector2(-base_r * 1.75, -base_r * 1.05),
		]
		for idx in range(right_btns.size()):
			var bi := right_btns[idx]
			var off: Vector2 = arc_offsets[idx % arc_offsets.size()]
			var d := btn_d * (0.76 if idx >= 2 else 0.88)
			var c := right_center + off
			c.x = clampf(c.x, d * 0.6, sz.x - d * 0.6)
			c.y = clampf(c.y, 68.0 + d * 0.5, sz.y - d * 0.6)
			buttons[bi]["rect"] = Rect2(c - Vector2(d * 0.5, d * 0.5), Vector2(d, d))
	else:
		# No right stick: place primary action button cleanly in bottom-right
		for idx in range(right_btns.size()):
			var bi := right_btns[idx]
			var d := btn_d * (1.12 if idx == 0 else 0.78)
			var c := right_center if idx == 0 else (right_center + Vector2(-btn_d * 1.15, -btn_d * 0.75 * float(idx)))
			c.x = clampf(c.x, d * 0.6, sz.x - d * 0.6)
			c.y = clampf(c.y, 68.0 + d * 0.5, sz.y - d * 0.6)
			buttons[bi]["rect"] = Rect2(c - Vector2(d * 0.5, d * 0.5), Vector2(d, d))

	return {
		"left_center": left_center,
		"right_center": right_center,
		"base_r": base_r,
	}


func _input(event: InputEvent) -> void:
	if not active_for_game or _is_native_touch_claimed():
		return

	# Never let emulated mouse events from touch interfere
	if event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION:
		return

	if _tap_anywhere:
		if event is InputEventScreenTouch and event.pressed:
			_pulse_action("ui_accept", KEY_SPACE)
		return

	var geo := _layout_geometry()
	var left_center: Vector2 = geo["left_center"]
	var right_center: Vector2 = geo["right_center"]
	var base_r: float = geo["base_r"]

	if event is InputEventScreenTouch:
		var pos: Vector2 = event.position
		if event.pressed:
			# 1. PAD visibility toggle pill
			if _toggle_rect.grow(8.0).has_point(pos):
				_toggle_touch_id = event.index
				user_visible = not user_visible
				if not user_visible:
					_release_all()
				if _overlay:
					_overlay.queue_redraw()
				_mark_handled()
				return

			if not user_visible:
				return

			# 2. Action buttons (checked before sticks so overlapping edge taps hit button)
			for i in range(buttons.size()):
				var b: Dictionary = buttons[i]
				if int(b["touch_id"]) != -1:
					continue
				var r: Rect2 = b["rect"]
				if r.grow(10.0).has_point(pos):
					buttons[i]["touch_id"] = event.index
					_on_button_pressed(buttons[i])
					if _overlay:
						_overlay.queue_redraw()
					_mark_handled()
					return

			# 3. Left stick (hit zone: circle around bottom-left stick or bottom-left quadrant)
			var sz := _vp_size()
			var in_left_zone := pos.distance_to(left_center) <= base_r * 1.35 or (pos.x < sz.x * 0.44 and pos.y > sz.y * 0.40)
			if has_left_stick and left_touch_id == -1 and in_left_zone:
				left_touch_id = event.index
				left_origin = left_center if pos.distance_to(left_center) <= base_r * 1.1 else pos
				left_vec = _compute_stick_vec(pos, left_origin, left_radius)
				if _overlay:
					_overlay.queue_redraw()
				_mark_handled()
				return

			# 4. Right stick (hit zone: circle around bottom-right stick or bottom-right quadrant)
			var in_right_zone := pos.distance_to(right_center) <= base_r * 1.35 or (pos.x > sz.x * 0.54 and pos.y > sz.y * 0.35)
			if has_right_stick and right_touch_id == -1 and in_right_zone:
				right_touch_id = event.index
				right_origin = pos if right_mode == "fps_look" else (right_center if pos.distance_to(right_center) <= base_r * 1.1 else pos)
				right_last = pos
				right_vec = _compute_stick_vec(pos, right_origin, right_radius)
				right_press_time = Time.get_ticks_msec() / 1000.0
				right_max_travel = 0.0
				if _overlay:
					_overlay.queue_redraw()
				_mark_handled()
				return
		else:
			if event.index == _toggle_touch_id:
				_toggle_touch_id = -1
				_mark_handled()
				return
			if event.index == left_touch_id:
				left_touch_id = -1
				left_vec = Vector2.ZERO
				_dpad_dir = ""
				_dpad_timer = 0.0
				_sync_left_stick_inputs(Vector2.ZERO)
				if _overlay:
					_overlay.queue_redraw()
				_mark_handled()
				return
			if event.index == right_touch_id:
				var elapsed_tap := (Time.get_ticks_msec() / 1000.0) - right_press_time
				if right_mode == "aim_fire" and right_max_travel < 16.0 and elapsed_tap < 0.32:
					_tap_fire_timer = 0.14
				right_touch_id = -1
				right_vec = Vector2.ZERO
				_sync_right_stick_inputs(Vector2.ZERO, Vector2.ZERO)
				if _overlay:
					_overlay.queue_redraw()
				_mark_handled()
				return
			for i in range(buttons.size()):
				if int(buttons[i]["touch_id"]) == event.index:
					buttons[i]["touch_id"] = -1
					_on_button_released(buttons[i])
					if _overlay:
						_overlay.queue_redraw()
					_mark_handled()
					return

	elif event is InputEventScreenDrag:
		if not user_visible:
			return
		var pos: Vector2 = event.position
		if event.index == left_touch_id:
			left_vec = _compute_stick_vec(pos, left_origin, left_radius)
			if _overlay:
				_overlay.queue_redraw()
			_mark_handled()
			return
		if event.index == right_touch_id:
			var delta_pos := pos - right_last
			right_last = pos
			right_max_travel = maxf(right_max_travel, pos.distance_to(right_origin))
			right_vec = _compute_stick_vec(pos, right_origin, right_radius)
			if right_mode == "fps_look":
				_apply_fps_look(delta_pos)
			if _overlay:
				_overlay.queue_redraw()
			_mark_handled()
			return


func _process(delta: float) -> void:
	if not active_for_game:
		visible = false
		return

	if _is_native_touch_claimed():
		if visible:
			visible = false
			_release_all()
		return

	if not visible:
		visible = true
	if _overlay:
		_overlay.queue_redraw()

	if not user_visible:
		return

	# Sync continuous stick inputs every frame
	if has_left_stick:
		if profile == "dpad_step":
			_tick_dpad_step(delta)
		else:
			_sync_left_stick_inputs(left_vec)

	if has_right_stick:
		if _tap_fire_timer > 0.0:
			_tap_fire_timer = maxf(0.0, _tap_fire_timer - delta)
		_sync_right_stick_inputs(right_vec, Vector2.ZERO)


func _compute_stick_vec(pos: Vector2, origin: Vector2, radius: float) -> Vector2:
	var offset := pos - origin
	var dist := offset.length()
	if dist <= radius * STICK_DEADZONE:
		return Vector2.ZERO
	var clamped := minf(dist, radius)
	return (offset / dist) * (clamped / radius)


func _sync_left_stick_inputs(v: Vector2) -> void:
	match profile:
		"dual_stick_arena":
			_set_action_axis("move_left", "move_right", v.x)
			_set_action_axis("move_up", "move_down", v.y)
			_set_key(KEY_A, v.x < -0.25)
			_set_key(KEY_D, v.x > 0.25)
			_set_key(KEY_W, v.y < -0.25)
			_set_key(KEY_S, v.y > 0.25)
		"dual_stick_fps":
			_set_key(KEY_A, v.x < -0.22)
			_set_key(KEY_D, v.x > 0.22)
			_set_key(KEY_W, v.y < -0.22)
			_set_key(KEY_S, v.y > 0.22)
		"stick_charge":
			if not _apply_camera_aligned_tank_drive(v):
				_set_key(KEY_A, v.x < -0.22)
				_set_key(KEY_D, v.x > 0.22)
				_set_key(KEY_W, v.y < -0.22)
				_set_key(KEY_S, v.y > 0.22)
		"dual_stick_vehicle":
			_set_action_axis("steer_left", "steer_right", v.x)
			_set_action_axis("move_forward", "move_back", v.y)
			_set_key(KEY_A, v.x < -0.22)
			_set_key(KEY_D, v.x > 0.22)
			_set_key(KEY_W, v.y < -0.22)
			_set_key(KEY_S, v.y > 0.22)
		"flight_stick":
			_set_action_axis("turn_left", "turn_right", v.x)
			_set_action_axis("thrust_forward", "thrust_reverse", v.y)
			_set_key(KEY_A, v.x < -0.22)
			_set_key(KEY_D, v.x > 0.22)
			_set_key(KEY_W, v.y < -0.22)
			_set_key(KEY_S, v.y > 0.22)
		"stick_jump", "stick_shooter", "stick_only":
			_set_action_axis("ui_left", "ui_right", v.x)
			_set_action_axis("ui_up", "ui_down", v.y)


func _tick_dpad_step(delta: float) -> void:
	var wanted := ""
	if left_vec.length() > 0.35:
		if absf(left_vec.x) >= absf(left_vec.y):
			wanted = "move_right" if left_vec.x > 0.0 else "move_left"
		else:
			wanted = "move_down" if left_vec.y > 0.0 else "move_up"
	if wanted.is_empty():
		_dpad_dir = ""
		_dpad_timer = 0.0
		return
	if wanted != _dpad_dir:
		_dpad_dir = wanted
		_dpad_timer = DPAD_REPEAT_INITIAL
		_pulse_action(wanted, 0)
	else:
		_dpad_timer -= delta
		if _dpad_timer <= 0.0:
			_dpad_timer = DPAD_REPEAT_INTERVAL
			_pulse_action(wanted, 0)


func _sync_right_stick_inputs(v: Vector2, _delta_pos: Vector2) -> void:
	match right_mode:
		"aim_fire":
			var aiming := v.length() > 0.16
			if aiming:
				var aim_dir := v.normalized()
				var anchor := _find_arena_player_screen_pos()
				var target := anchor + aim_dir * 260.0
				var mm := InputEventMouseMotion.new()
				mm.position = target
				mm.global_position = target
				mm.device = 0
				Input.parse_input_event(mm)
			_set_action_strength("attack", 1.0 if (aiming or _tap_fire_timer > 0.0) else 0.0)
		"turret":
			_set_action_axis("aim_left", "aim_right", v.x)
			_set_key(KEY_Q, v.x < -0.22)
			_set_key(KEY_E, v.x > 0.22)
		"fps_look":
			if v.length() > 0.22:
				_apply_fps_look(v * 7.5)


func _find_arena_player_screen_pos() -> Vector2:
	if not is_inside_tree():
		return _vp_size() * 0.5
	var scene := get_tree().current_scene
	if scene != null and "actors" in scene:
		var actor_list: Variant = scene.get("actors")
		if actor_list is Array and not actor_list.is_empty():
			var first: Variant = actor_list[0]
			if first is Dictionary and first.has("body") and is_instance_valid(first["body"]):
				var body_pos: Vector2 = first["body"].global_position
				return scene.get_canvas_transform() * body_pos
	return _vp_size() * 0.5


func _find_p1_tank() -> Node3D:
	if not is_inside_tree():
		return null
	var scene := get_tree().current_scene
	if scene == null:
		return null
	if "tanks" in scene:
		var tank_list: Variant = scene.get("tanks")
		if tank_list is Array and not tank_list.is_empty():
			var first: Variant = tank_list[0]
			if first is Node3D and is_instance_valid(first):
				return first as Node3D
	var found := scene.find_child("Tank_P1", true, false)
	if found is Node3D:
		return found as Node3D
	return null


func _apply_camera_aligned_tank_drive(v: Vector2) -> bool:
	var tank := _find_p1_tank()
	if tank == null or not ("synthetic_move" in tank) or not ("synthetic_turn" in tank):
		return false
	var mag := v.length()
	if mag < STICK_DEADZONE:
		tank.set("synthetic_move", 0.0)
		tank.set("synthetic_turn", 0.0)
		return true

	# Project active Camera3D axes onto the XZ ground plane so thumbstick UP/RIGHT
	# matches screen UP/RIGHT regardless of the 45-degree isometric CameraRig angle.
	var vp := get_viewport()
	var cam := vp.get_camera_3d() if vp != null else null
	var cam_fwd := Vector3(0.0, 0.0, -1.0)
	var cam_right := Vector3(1.0, 0.0, 0.0)
	if cam != null:
		var raw_fwd := -cam.global_transform.basis.z
		raw_fwd.y = 0.0
		if raw_fwd.length_squared() > 0.0001:
			cam_fwd = raw_fwd.normalized()
		var raw_right := cam.global_transform.basis.x
		raw_right.y = 0.0
		if raw_right.length_squared() > 0.0001:
			cam_right = raw_right.normalized()

	var desired := (cam_right * v.x + cam_fwd * (-v.y)).normalized()
	var tank_fwd := -tank.global_transform.basis.z
	tank_fwd.y = 0.0
	if tank_fwd.length_squared() > 0.0001:
		tank_fwd = tank_fwd.normalized()
	else:
		tank_fwd = Vector3(0.0, 0.0, -1.0)

	# Signed yaw angle from tank nose to desired world direction:
	# positive => desired is to the LEFT (CCW around +Y => positive rotate_y).
	var signed_angle := atan2(tank_fwd.cross(desired).y, tank_fwd.dot(desired))
	var turn_in := clampf(signed_angle / 0.55, -1.0, 1.0)
	if absf(signed_angle) < 0.04:
		turn_in = 0.0
	var align := cos(signed_angle)
	var move_in := clampf(mag * maxf(0.15, align), 0.0, 1.0) if align > -0.35 else 0.0
	tank.set("synthetic_turn", turn_in)
	tank.set("synthetic_move", move_in)
	return true


func _find_voxel_player() -> Node:
	if not is_inside_tree():
		return null
	var scene := get_tree().current_scene
	if scene == null:
		return null
	if "player" in scene and is_instance_valid(scene.get("player")):
		return scene.get("player")
	var by_name := scene.get_node_or_null("Player")
	if by_name != null and ("pitch" in by_name) and ("camera" in by_name):
		return by_name
	for child in scene.get_children():
		if child is Node3D and ("pitch" in child) and ("camera" in child):
			return child
	return scene.find_child("VoxelPlayer", true, false)


func _apply_fps_look(delta_px: Vector2) -> void:
	var vp_player := _find_voxel_player()
	if vp_player != null and vp_player is Node3D and "camera" in vp_player and "pitch" in vp_player:
		var sens := 0.0055
		vp_player.rotate_y(-delta_px.x * sens)
		var new_pitch := clampf(float(vp_player.get("pitch")) - delta_px.y * sens, deg_to_rad(-89.0), deg_to_rad(89.0))
		vp_player.set("pitch", new_pitch)
		var cam: Variant = vp_player.get("camera")
		if cam is Node3D:
			cam.rotation.x = new_pitch
		return
	var mm := InputEventMouseMotion.new()
	mm.relative = delta_px * 1.6
	mm.device = 0
	Input.parse_input_event(mm)


func _on_button_pressed(b: Dictionary) -> void:
	var mode := str(b.get("mode", "hold"))
	var act := str(b.get("action", ""))
	var key := int(b.get("key", 0))
	match mode:
		"hold":
			if not act.is_empty():
				_set_action_strength(act, 1.0)
			if key > 0:
				_set_key(key, true)
		"tap":
			_pulse_action(act, key)
		"fps_mine":
			var p := _find_voxel_player()
			if p != null and p.has_method("_break_target"):
				if not ("touch_mining" in p):
					Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
				p.call("_break_target")
		"fps_place":
			var p := _find_voxel_player()
			if p != null and p.has_method("_place_target"):
				p.call("_place_target")
		"fps_slot":
			_fps_slot_index = (_fps_slot_index + 1) % 8
			_pulse_action("", KEY_1 + _fps_slot_index)


func _on_button_released(b: Dictionary) -> void:
	var mode := str(b.get("mode", "hold"))
	var act := str(b.get("action", ""))
	var key := int(b.get("key", 0))
	match mode:
		"hold":
			if not act.is_empty():
				_set_action_strength(act, 0.0)
			if key > 0:
				_set_key(key, false)
		"fps_mine":
			var p := _find_voxel_player()
			if p != null and p.has_method("cancel_mining"):
				p.call("cancel_mining")


func _set_action_axis(neg_action: String, pos_action: String, value: float) -> void:
	_set_action_strength(neg_action, maxf(0.0, -value))
	_set_action_strength(pos_action, maxf(0.0, value))


func _set_action_strength(action: String, strength: float) -> void:
	if action.is_empty() or not InputMap.has_action(action):
		return
	var prev := float(_held_actions.get(action, 0.0))
	if strength > 0.01:
		Input.action_press(action, clampf(strength, 0.0, 1.0))
		_held_actions[action] = strength
	elif prev > 0.01:
		Input.action_release(action)
		_held_actions.erase(action)


func _set_key(keycode: int, pressed: bool) -> void:
	if keycode <= 0:
		return
	var prev := bool(_held_keys.get(keycode, false))
	if pressed == prev:
		return
	var ev := InputEventKey.new()
	ev.keycode = keycode as Key
	ev.physical_keycode = keycode as Key
	ev.pressed = pressed
	Input.parse_input_event(ev)
	if pressed:
		_held_keys[keycode] = true
	else:
		_held_keys.erase(keycode)


func _pulse_action(action: String, keycode: int) -> void:
	if not action.is_empty() and InputMap.has_action(action):
		var aev := InputEventAction.new()
		aev.action = action
		aev.pressed = true
		aev.strength = 1.0
		Input.parse_input_event(aev)
		call_deferred("_release_pulse_action", action)
	if keycode > 0:
		var kev := InputEventKey.new()
		kev.keycode = keycode as Key
		kev.physical_keycode = keycode as Key
		kev.pressed = true
		Input.parse_input_event(kev)
		call_deferred("_release_pulse_key", keycode)


func _release_pulse_action(action: String) -> void:
	if not InputMap.has_action(action):
		return
	var aev := InputEventAction.new()
	aev.action = action
	aev.pressed = false
	Input.parse_input_event(aev)


func _release_pulse_key(keycode: int) -> void:
	var kev := InputEventKey.new()
	kev.keycode = keycode as Key
	kev.physical_keycode = keycode as Key
	kev.pressed = false
	Input.parse_input_event(kev)


func _release_all() -> void:
	left_touch_id = -1
	right_touch_id = -1
	left_vec = Vector2.ZERO
	right_vec = Vector2.ZERO
	_dpad_dir = ""
	_dpad_timer = 0.0
	_tap_fire_timer = 0.0
	if profile == "stick_charge":
		var tank := _find_p1_tank()
		if tank != null and ("synthetic_move" in tank) and ("synthetic_turn" in tank):
			tank.set("synthetic_move", 0.0)
			tank.set("synthetic_turn", 0.0)
	for i in range(buttons.size()):
		if int(buttons[i]["touch_id"]) != -1:
			buttons[i]["touch_id"] = -1
			_on_button_released(buttons[i])
	for act in _held_actions.keys():
		if InputMap.has_action(str(act)):
			Input.action_release(str(act))
	_held_actions.clear()
	for k in _held_keys.keys():
		var ev := InputEventKey.new()
		ev.keycode = int(k) as Key
		ev.physical_keycode = int(k) as Key
		ev.pressed = false
		Input.parse_input_event(ev)
	_held_keys.clear()


func _draw_pad(ctrl: Control) -> void:
	if not active_for_game or _tap_anywhere or _is_native_touch_claimed():
		return
	var geo := _layout_geometry()
	var left_center: Vector2 = geo["left_center"]
	var right_center: Vector2 = geo["right_center"]
	var base_r: float = geo["base_r"]
	var font := ThemeDB.fallback_font

	# Draw compact PAD toggle pill at top-right
	var pill_bg := Color(0.08, 0.12, 0.16, 0.78) if user_visible else Color(0.08, 0.10, 0.13, 0.45)
	var pill_border := Color(0.0, 0.76, 0.48, 0.85) if user_visible else Color(0.55, 0.62, 0.70, 0.45)
	ctrl.draw_rect(_toggle_rect, pill_bg, true)
	ctrl.draw_rect(_toggle_rect, pill_border, false, 1.8)
	if font != null:
		var lbl := "PAD ON" if user_visible else "PAD"
		ctrl.draw_string(font, _toggle_rect.position + Vector2(0, _toggle_rect.size.y * 0.68), lbl, HORIZONTAL_ALIGNMENT_CENTER, _toggle_rect.size.x, 12, Color(0.92, 0.97, 0.99, 0.92))

	if not user_visible:
		return

	# Left stick
	if has_left_stick:
		var c := left_origin if left_touch_id != -1 else left_center
		var active := left_touch_id != -1
		var knob := c + left_vec * base_r * 0.72
		ctrl.draw_circle(c, base_r, Color(0.06, 0.14, 0.20, 0.42 if active else 0.28))
		ctrl.draw_arc(c, base_r, 0.0, TAU, 56, Color(0.45, 0.90, 0.96, 0.82 if active else 0.48), 2.8, true)
		ctrl.draw_circle(knob, base_r * 0.42, Color(0.56, 0.92, 0.98, 0.76 if active else 0.46))
		ctrl.draw_arc(knob, base_r * 0.42, 0.0, TAU, 36, Color(0.90, 0.98, 1.0, 0.88), 2.0, true)
		if font != null:
			ctrl.draw_string(font, c + Vector2(-base_r, base_r + 18.0), left_label, HORIZONTAL_ALIGNMENT_CENTER, base_r * 2.0, 13, Color(0.84, 0.92, 0.96, 0.78))

	# Right stick
	if has_right_stick:
		var c := right_origin if right_touch_id != -1 else right_center
		var active := right_touch_id != -1
		var knob := c + right_vec * base_r * 0.72
		ctrl.draw_circle(c, base_r, Color(0.24, 0.08, 0.12, 0.44 if active else 0.28))
		ctrl.draw_arc(c, base_r, 0.0, TAU, 56, Color(1.0, 0.56, 0.60, 0.85 if active else 0.50), 2.8, true)
		ctrl.draw_circle(knob, base_r * 0.42, Color(1.0, 0.62, 0.64, 0.78 if active else 0.48))
		ctrl.draw_arc(knob, base_r * 0.42, 0.0, TAU, 36, Color(1.0, 0.92, 0.92, 0.90), 2.0, true)
		if font != null:
			ctrl.draw_string(font, c + Vector2(-base_r, base_r + 18.0), right_label, HORIZONTAL_ALIGNMENT_CENTER, base_r * 2.0, 13, Color(1.0, 0.86, 0.88, 0.80))

	# Action buttons
	for b in buttons:
		var r: Rect2 = b["rect"]
		var center := r.get_center()
		var rad := minf(r.size.x, r.size.y) * 0.5
		var col: Color = b["color"]
		var pressed := int(b["touch_id"]) != -1
		var fill := col.lightened(0.22) if pressed else Color(col.r, col.g, col.b, col.a * 0.55)
		ctrl.draw_circle(center, rad, fill)
		ctrl.draw_arc(center, rad, 0.0, TAU, 40, col.lightened(0.35), 2.4, true)
		if font != null:
			var label_text := str(b["label"])
			ctrl.draw_string(font, Vector2(r.position.x, center.y + 5.0), label_text, HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 13, Color(0.98, 0.99, 1.0, 0.96))
