extends Node2D

const EngineModel = preload("res://scripts/fort_engine.gd")
const RemoteModel = preload("res://scripts/fort_remote.gd")
const SAVE_PATH := "user://fortress-war-settings.json"
const INK := Color("ecf3f7")
const MUTED := Color("9aafbd")
const ACCENT := Color("7bdcc0")
var engine
var data: Dictionary
var settings: Dictionary = {"profile": "classic", "teamSize": 2, "control": "ai", "difficulty": "normal", "map": "highlands", "playerTank": "catapult", "opponentTank": "cannon", "seed": 123}
var history: Array = []
var setup_panel: Panel
var result_panel: Panel
var battle_controls: Control
var status_label: Label
var detail_label: Label
var feed_label: Label
var order_label: Label
var result_label: Label
var angle_slider: HSlider
var power_slider: HSlider
var charge_bar: ProgressBar
var fire_button: Button
var pause_button: Button
var weapons: Array[Button] = []
var items: Dictionary = {}
var selectors: Dictionary = {}
var size_option: OptionButton
var seed_input: SpinBox
var history_label: Label
var charging := false
var charge_elapsed := 0.0
var charge_actor := ""
var charge_turn := -1
var held_move := 0
var held_aim := 0
var ui_clock := 0.0
var recorded_result := false
var last_power: Dictionary = {}
var interface_font: FontFile
var multiplayer_mode := false
var network_callback: JavaScriptObject
var network_config := ""
var network_room_id := ""
var network_has_board := false
var setup_button: Button
var retry_button: Button
var result_setup_button: Button
var target_power := 65.0
@onready var battlefield = $Battlefield
@onready var ui: Control = $Hud/Interface

func _ready() -> void:
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
	interface_font = FontFile.new()
	interface_font.data = Marshalls.base64_to_raw(FileAccess.get_file_as_string("res://fonts/fortress-ui.txt").strip_edges())
	var interface_theme := Theme.new()
	interface_theme.default_font = interface_font
	ui.theme = interface_theme
	battlefield.font = interface_font
	_load_settings()
	_build_interface()
	engine = EngineModel.new({"seed": 123, "control": "hotseat"})
	engine.set_paused(true)
	battlefield.bind_engine(engine)
	battle_controls.hide()
	setup_panel.show()
	status_label.hide()
	if OS.has_feature("web"):
		multiplayer_mode = bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('multiplayer') === '1'", true))
		if multiplayer_mode:
			_start_network()
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(0, 0, 1280, 900), Color("0d1722"))
	draw_rect(Rect2(40, 140, 1200, 547), Color("172d40"))
	draw_circle(Vector2(1050, 238), 52, Color("f8d999"))
	for i in range(8):
		var x := float(i * 195 - 70)
		draw_colored_polygon(PackedVector2Array([Vector2(x, 687), Vector2(x + 130, 340 + (i % 3) * 35), Vector2(x + 310, 687)]), Color("254350"))
	draw_line(Vector2(40, 688), Vector2(1240, 688), Color("3b5260"), 2)

func _label(parent: Node, text: String, rect: Rect2, size: int = 18, color: Color = INK) -> Label:
	var label := Label.new()
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label

func _button(parent: Node, text: String, rect: Rect2, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_NONE
	button.clip_text = true
	button.add_theme_font_size_override("font_size", 17)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _panel(rect: Rect2) -> Panel:
	var panel := Panel.new()
	panel.position = rect.position
	panel.size = rect.size
	var style := StyleBoxFlat.new()
	style.bg_color = Color("172433")
	style.border_color = Color("486477")
	style.set_border_width_all(1)
	style.set_corner_radius_all(16)
	panel.add_theme_stylebox_override("panel", style)
	ui.add_child(panel)
	return panel

func _select(parent: Node, key: String, values: Array, rect: Rect2) -> OptionButton:
	var option := OptionButton.new()
	option.position = rect.position
	option.size = rect.size
	option.focus_mode = Control.FOCUS_NONE
	option.clip_text = true
	option.add_theme_font_size_override("font_size", 18)
	parent.add_child(option)
	selectors[key] = option
	_fill_select(option, values, str(settings.get(key, "")))
	return option

func _fill_select(option: OptionButton, values: Array, selected_id: String = "") -> void:
	option.clear()
	for value in values:
		option.add_item(str(value.get("name", value.id)))
		option.set_item_metadata(option.item_count - 1, value.id)
		if str(value.id) == selected_id:
			option.select(option.item_count - 1)

func _selected(key: String) -> String:
	var option: OptionButton = selectors[key]
	return str(option.get_item_metadata(option.selected))

func _build_interface() -> void:
	_label(ui, "FORTRESS WAR", Rect2(40, 18, 600, 44), 34)
	_label(ui, "GODOT TEMPLATE  /  TURN-BASED ARTILLERY", Rect2(42, 63, 700, 25), 14, ACCENT)
	status_label = _label(ui, "바람을 읽고, 지형을 바꾸세요.", Rect2(40, 98, 1000, 32), 21)
	pause_button = _button(ui, "일시정지 [P]", Rect2(1000, 30, 145, 44), _toggle_pause)
	setup_button = _button(ui, "설정", Rect2(1155, 30, 85, 44), show_setup)
	order_label = _label(ui, "", Rect2(42, 660, 1195, 24), 14, INK)
	battle_controls = Control.new()
	battle_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(battle_controls)
	detail_label = _label(battle_controls, "", Rect2(40, 700, 800, 30), 18, ACCENT)
	for i in range(4):
		var index := i
		weapons.append(_button(battle_controls, "", Rect2(40 + i * 184, 740, 176, 42), func(): _choose_weapon(index)))
	for i in range(data.items.size()):
		var definition: Dictionary = data.items[i]
		var id: String = definition.id
		items[id] = _button(battle_controls, str(definition.name), Rect2(40 + i * 115, 794, 107, 40), func(): _use_item(id))
	var left := _button(battle_controls, "◀ 이동", Rect2(510, 794, 100, 40), func(): pass)
	left.button_down.connect(func(): held_move = -1)
	left.button_up.connect(func(): held_move = 0)
	var right := _button(battle_controls, "이동 ▶", Rect2(618, 794, 100, 40), func(): pass)
	right.button_down.connect(func(): held_move = 1)
	right.button_up.connect(func(): held_move = 0)
	_label(battle_controls, "각도", Rect2(800, 697, 60, 28), 16, MUTED)
	angle_slider = HSlider.new()
	angle_slider.position = Vector2(860, 703)
	angle_slider.size = Vector2(220, 24)
	angle_slider.focus_mode = Control.FOCUS_NONE
	angle_slider.value_changed.connect(func(value):
		if engine != null: engine.set_angle(value))
	battle_controls.add_child(angle_slider)
	_label(battle_controls, "파워", Rect2(800, 736, 60, 28), 16, MUTED)
	power_slider = HSlider.new()
	power_slider.position = Vector2(860, 742)
	power_slider.size = Vector2(220, 24)
	power_slider.focus_mode = Control.FOCUS_NONE
	power_slider.value_changed.connect(func(value):
		target_power = value
		if engine != null and not charging: engine.set_power(value))
	battle_controls.add_child(power_slider)
	charge_bar = ProgressBar.new()
	charge_bar.position = Vector2(800, 786)
	charge_bar.size = Vector2(280, 32)
	charge_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	battle_controls.add_child(charge_bar)
	fire_button = _button(battle_controls, "충전 / 발사\n[SPACE]", Rect2(1100, 700, 140, 82), func(): pass)
	fire_button.button_down.connect(_begin_charge)
	fire_button.button_up.connect(_release_charge)
	_button(battle_controls, "발사", Rect2(1100, 792, 65, 42), _fire_target)
	_button(battle_controls, "패스", Rect2(1173, 792, 67, 42), func():
		_cancel_charge()
		engine.skip())
	feed_label = _label(battle_controls, "", Rect2(40, 845, 1200, 22), 14, MUTED)
	_label(ui, "A/D 이동 · W/S 조준 · Space 충전 후 발사 · 1–4 무기 · P 일시정지 · 마우스로 전장 조준", Rect2(40, 875, 1200, 22), 14, MUTED)
	_build_setup()
	result_panel = _panel(Rect2(360, 280, 560, 300))
	result_label = _label(result_panel, "", Rect2(30, 35, 500, 130), 27)
	result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	retry_button = _button(result_panel, "다시 대전 [R]", Rect2(50, 210, 220, 50), func(): start_match(settings))
	result_setup_button = _button(result_panel, "대전 설정", Rect2(290, 210, 220, 50), show_setup)
	result_panel.hide()

func _build_setup() -> void:
	setup_panel = _panel(Rect2(220, 110, 840, 650))
	_label(setup_panel, "대전 준비", Rect2(40, 25, 760, 44), 30)
	_label(setup_panel, "각도와 바람을 이용해 상대 팀을 격파하세요.", Rect2(40, 72, 760, 28), 18, MUTED)
	var labels := ["규칙", "맵", "대전 방식", "팀 인원", "내 탱크", "상대 탱크", "AI 난이도", "각도 자료"]
	for i in range(labels.size()):
		var column: int = i % 2
		var row: int = i / 2
		_label(setup_panel, labels[i], Rect2(40 + column * 390, 120 + row * 90, 350, 24), 16, MUTED)
	var profile := _select(setup_panel, "profile", data.profiles, Rect2(40, 150, 350, 42))
	_select(setup_panel, "map", data.maps, Rect2(430, 150, 350, 42))
	_select(setup_panel, "control", [{"id":"ai", "name":"AI 상대"}, {"id":"hotseat", "name":"같은 기기 2인"}], Rect2(40, 240, 350, 42))
	size_option = _select(setup_panel, "teamSize", [{"id":"1", "name":"1 vs 1"}, {"id":"2", "name":"2 vs 2"}, {"id":"4", "name":"4 vs 4"}], Rect2(430, 240, 350, 42))
	_select(setup_panel, "playerTank", [], Rect2(40, 330, 350, 42))
	_select(setup_panel, "opponentTank", [], Rect2(430, 330, 350, 42))
	_select(setup_panel, "difficulty", [{"id":"normal", "name":"보통"}, {"id":"easy", "name":"쉬움"}, {"id":"hard", "name":"어려움"}], Rect2(40, 420, 350, 42))
	_select(setup_panel, "angleProfile", [{"id":"jp2003", "name":"JP 2003 자료"}, {"id":"kr_reference", "name":"KR 참고 자료 (미검증)"}], Rect2(430, 420, 350, 42))
	profile.item_selected.connect(func(_index): _update_roster())
	_update_roster()
	_label(setup_panel, "맵 / 난수 시드", Rect2(40, 485, 160, 30), 16, MUTED)
	seed_input = SpinBox.new()
	seed_input.position = Vector2(205, 480)
	seed_input.size = Vector2(185, 40)
	seed_input.min_value = 1
	seed_input.max_value = 2147483647
	seed_input.value = int(settings.get("seed", 123))
	setup_panel.add_child(seed_input)
	history_label = _label(setup_panel, "", Rect2(430, 485, 350, 56), 15, MUTED)
	_update_history()
	_button(setup_panel, "대전 시작  [ENTER]", Rect2(230, 565, 380, 56), _start_from_setup)

func _update_roster() -> void:
	var profile := _selected("profile")
	_fill_select(selectors.playerTank, data.catalogs[profile], str(settings.get("playerTank", "catapult")))
	_fill_select(selectors.opponentTank, data.catalogs[profile], str(settings.get("opponentTank", "cannon")))
	size_option.disabled = profile == "blue3"
	if size_option.disabled:
		size_option.select(2)
	selectors.angleProfile.disabled = profile == "blue3"

func _start_from_setup() -> void:
	var options: Dictionary = {}
	for key in selectors:
		options[key] = _selected(key)
	options.teamSize = int(options.teamSize)
	options.seed = int(seed_input.value)
	start_match(options)

func start_match(options: Dictionary = {}) -> void:
	if multiplayer_mode:
		return
	_cancel_charge()
	settings = options.duplicate(true)
	settings.erase("onEvent")
	_save_settings()
	var runtime_options := settings.duplicate(true)
	runtime_options.onEvent = _on_event
	engine = EngineModel.new(runtime_options)
	battlefield.bind_engine(engine)
	setup_panel.hide()
	result_panel.hide()
	battle_controls.show()
	status_label.show()
	recorded_result = false
	last_power.clear()
	target_power = 65
	_refresh_ui()

func show_setup() -> void:
	if multiplayer_mode:
		return
	_cancel_charge()
	if engine != null:
		engine.set_paused(true)
	setup_panel.show()
	result_panel.hide()
	battle_controls.hide()
	status_label.hide()
	pause_button.disabled = true
	_update_history()

func _process(delta: float) -> void:
	if engine == null or engine.state.is_empty():
		return
	if not setup_panel.visible:
		if engine.is_human_turn():
			var direction := held_move
			if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): direction -= 1
			if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): direction += 1
			if direction != 0: engine.move(signi(direction), delta)
			var aim_direction := held_aim
			if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): aim_direction += 1
			if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): aim_direction -= 1
			if aim_direction != 0: engine.set_angle(engine.active().angle + aim_direction * 40 * delta)
		if charging:
			if not engine.is_human_turn() or str(engine.state.activeId) != charge_actor or int(engine.state.turnNumber) != charge_turn:
				_cancel_charge()
			else:
				charge_elapsed += delta
				engine.set_power(engine.get_charge_power(charge_elapsed))
		engine.tick(delta)
		if engine.state.phase == "gameover" and not recorded_result:
			_show_result()
	battlefield.refresh(delta)
	ui_clock -= delta
	if ui_clock <= 0:
		_refresh_ui()
		ui_clock = 0.08

func _input(event: InputEvent) -> void:
	if engine == null or engine.state.is_empty():
		return
	if event is InputEventKey and not event.echo:
		if setup_panel != null and setup_panel.visible:
			if event.pressed and event.keycode == KEY_ENTER:
				_start_from_setup()
				get_viewport().set_input_as_handled()
			return
		if event.keycode == KEY_SPACE:
			if event.pressed: _begin_charge()
			else: _release_charge()
			get_viewport().set_input_as_handled()
		elif event.pressed and event.keycode == KEY_P:
			_toggle_pause()
		elif event.pressed and event.keycode == KEY_R and engine.state.phase == "gameover":
			start_match(settings)
		elif event.pressed and event.keycode >= KEY_1 and event.keycode <= KEY_4:
			_choose_weapon(event.keycode - KEY_1)

func _unhandled_input(event: InputEvent) -> void:
	if setup_panel.visible or result_panel.visible or not engine.is_human_turn():
		return
	var point := Vector2.ZERO
	var aim := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION:
		point = event.position
		aim = true
	elif event is InputEventScreenTouch and event.pressed:
		point = event.position
		aim = true
	if aim and Rect2(40, 140, 1200, 547).has_point(point):
		var world_point: Vector2 = battlefield.to_local(point)
		engine.set_aim_at_world(world_point.x, world_point.y)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and engine != null and setup_panel != null:
		_cancel_charge()
		engine.set_paused(true)

func _begin_charge() -> void:
	if engine == null or setup_panel.visible or not engine.is_human_turn():
		return
	charging = true
	charge_elapsed = 0
	charge_actor = str(engine.state.activeId)
	charge_turn = int(engine.state.turnNumber)
	engine.set_power(engine.get_charge_power(0))

func _cancel_charge() -> void:
	charging = false
	charge_elapsed = 0
	charge_actor = ""
	charge_turn = -1
	held_move = 0
	held_aim = 0

func _release_charge() -> void:
	if not charging:
		return
	var actor := charge_actor
	var turn := charge_turn
	_cancel_charge()
	if engine.is_human_turn() and actor == str(engine.state.activeId) and turn == int(engine.state.turnNumber):
		_accept_fire()

func _fire_target() -> void:
	_cancel_charge()
	engine.set_power(target_power)
	_accept_fire()

func _accept_fire() -> void:
	if engine == null or engine.state.is_empty() or not engine.is_human_turn():
		return
	var actor = engine.active()
	var power = engine.state.power
	var preview = engine.get_action_preview()
	if engine.fire() and actor != null and not actor.is_empty():
		if preview != null and preview.get("delivery", "projectile") != "self":
			last_power[actor.uid] = power

func _choose_weapon(index: int) -> void:
	_cancel_charge()
	engine.set_weapon(index)
	_refresh_ui()

func _use_item(id: String) -> void:
	_cancel_charge()
	engine.use_item(id)
	_refresh_ui()

func _toggle_pause() -> void:
	if multiplayer_mode or engine == null or setup_panel.visible or engine.state.phase == "gameover":
		return
	_cancel_charge()
	engine.set_paused(not engine.state.paused)
	_refresh_ui()

func _refresh_ui() -> void:
	if engine == null or engine.state.is_empty():
		return
	pause_button.disabled = multiplayer_mode or setup_panel.visible or engine.state.phase == "gameover"
	pause_button.text = "계속 [P]" if engine.state.paused else "일시정지 [P]"
	if setup_panel.visible:
		return
	var actor = engine.active()
	if actor == null or actor.is_empty():
		return
	var human: bool = engine.is_human_turn()
	var side := "BLUE" if actor.team == 0 else "RED"
	var phase := "조준" if human else "AI 계산 중" if engine.state.phase == "aim" else "포격 진행 중"
	if multiplayer_mode:
		phase = "내 차례" if human else "상대 차례" if engine.state.phase == "aim" else "포격 진행 중"
		if engine.player_team < 0:
			phase = "관전 중"
		if not engine.connected:
			phase = "연결 종료"
	if engine.state.paused: phase = "일시정지"
	status_label.text = "ROUND %02d   /   %s · %s   /   %s   /   %.1fs    바람 %+.1f%s" % [engine.state.round, side, actor.name, phase, engine.state.timeLeft, engine.state.wind, "  ·  SUDDEN DEATH" if engine.state.suddenDeath else ""]
	var aim = engine.get_aiming_state()
	if aim != null and not aim.is_empty():
		angle_slider.min_value = aim.min
		angle_slider.max_value = aim.max
		angle_slider.set_value_no_signal(actor.angle)
		power_slider.min_value = aim.powerMin
		power_slider.max_value = aim.powerMax
		power_slider.set_value_no_signal(target_power)
		charge_bar.value = engine.state.power
		detail_label.text = "각도 %.0f° · 파워 %.0f%% · 이동 %.0f · HP %.0f / %.0f · 이전 파워 %s" % [actor.angle, engine.state.power, actor.moveLeft, actor.hp, actor.maxHp, str(last_power.get(actor.uid, "—"))]
	angle_slider.editable = human and not charging
	power_slider.editable = human and not charging
	fire_button.disabled = not human
	var available_weapons: Array = actor.def.weapons
	var count := mini(available_weapons.size(), 4 if engine.config.profile == "blue3" else 2)
	for i in range(weapons.size()):
		weapons[i].visible = i < count
		if i < count:
			var weapon: Dictionary = available_weapons[i]
			var locked: bool = int(weapon.get("unlockRound", 1)) > int(engine.state.round)
			weapons[i].text = "%s%d %s%s" % ["● " if i == engine.state.weaponIndex else "", i + 1, weapon.name, " (R%d)" % weapon.unlockRound if locked else ""]
			weapons[i].disabled = not human or locked
			weapons[i].tooltip_text = str(weapon.get("description", ""))
	for id in items:
		items[id].disabled = not engine.can_use_item(id)
	var names: Array[String] = []
	for entry in engine.state.turnOrder:
		if entry is Dictionary:
			names.append(str(entry.get("name", entry.get("uid", ""))))
		else:
			for tank in engine.state.tanks:
				if tank.uid == entry: names.append(str(tank.name))
	order_label.text = "NEXT  /  " + "  →  ".join(names)
	if not engine.state.feed.is_empty():
		feed_label.text = str(engine.state.feed.back().get("text", ""))

func _on_event(event: Dictionary) -> void:
	battlefield.add_event(event)

func _show_result() -> void:
	_cancel_charge()
	recorded_result = true
	var winner: int = int(engine.state.winner)
	var title := "DRAW" if winner == -1 else "BLUE VICTORY" if winner == 0 else "RED VICTORY"
	result_label.text = "%s\n%d 라운드 · %d 턴\n다시 도전해 보세요." % [title, engine.state.round, engine.state.turnNumber]
	if multiplayer_mode:
		result_label.text = "%s\n%d 라운드 · %d 턴\n새 방에서 다시 대전하세요." % [title, engine.state.round, engine.state.turnNumber]
	result_panel.show()
	history.push_front({"winner": winner, "round": engine.state.round, "profile": engine.config.profile})
	if history.size() > 20: history.resize(20)
	_save_settings()

func _load_settings() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var saved = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if saved is Dictionary:
		if saved.get("settings") is Dictionary: settings = saved.settings
		if saved.get("history") is Array: history = saved.history.slice(0, 20)

func _save_settings() -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({"settings": settings, "history": history}))

func _update_history() -> void:
	history_label.text = "완료한 대전: %d회 (최근 20회)\n설정은 자동 저장됩니다." % history.size()

func _start_network() -> void:
	engine = RemoteModel.new(_send_network_action, _on_event)
	setup_panel.hide()
	result_panel.hide()
	battle_controls.hide()
	status_label.show()
	status_label.text = "멀티플레이 방에 연결하는 중…"
	setup_button.disabled = true
	pause_button.disabled = true
	retry_button.hide()
	result_setup_button.hide()
	network_callback = JavaScriptBridge.create_callback(_receive_network_message)
	JavaScriptBridge.get_interface("window")["__playforgeFortressCallback"] = network_callback
	JavaScriptBridge.eval("""
		window.__playforgeFortressListener = event => {
			if (event.source !== window.parent || event.origin !== location.origin || event.data?.source !== 'playforge-fortress-lobby') return;
			window.__playforgeFortressCallback(JSON.stringify(event.data));
		};
		window.addEventListener('message',window.__playforgeFortressListener);
		window.parent.postMessage({source:'playforge-fortress-game',type:'ready'},location.origin);
	""", true)

func _receive_network_message(arguments: Array) -> void:
	if arguments.is_empty():
		return
	var payload = JSON.parse_string(str(arguments[0]))
	if not payload is Dictionary:
		return
	if payload.get("type") == "disconnect":
		engine.disconnect_from_room()
		_cancel_charge()
		return
	if payload.get("type") != "state":
		return
	var previous_actor = engine.state.get("activeId")
	var previous_turn = engine.state.get("turnNumber")
	if engine.receive_snapshot(payload):
		var next_room_id := str(payload.state.get("roomId", ""))
		if next_room_id != network_room_id:
			network_room_id = next_room_id
			network_has_board = false
			recorded_result = false
			last_power.clear()
			result_panel.hide()
			_cancel_charge()
		if not network_has_board:
			network_has_board = true
			battlefield.bind_engine(engine)
			battle_controls.show()
		var signature := JSON.stringify(engine.config)
		if signature != network_config:
			network_config = signature
			battlefield.terrain_version = -1
		if previous_actor != engine.state.get("activeId") or previous_turn != engine.state.get("turnNumber"):
			_cancel_charge()
		battlefield.refresh(0)
		_refresh_ui()

func _send_network_action(command: Dictionary) -> bool:
	if not multiplayer_mode or not OS.has_feature("web"):
		return false
	var payload := {"source": "playforge-fortress-game", "type": "input", "input": command}
	JavaScriptBridge.eval("window.parent.postMessage(JSON.parse(%s),location.origin);" % JSON.stringify(JSON.stringify(payload)), true)
	return true

func _exit_tree() -> void:
	if multiplayer_mode and OS.has_feature("web"):
		JavaScriptBridge.eval("window.removeEventListener('message',window.__playforgeFortressListener); window.__playforgeFortressCallback=null;", true)
