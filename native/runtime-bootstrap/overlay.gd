extends CanvasLayer
## PlayHub Universal In-Game Overlay (M0 skeleton)
## Toggle: Shift+Tab or top-left floating [Play Hub] button.

var _panel: PanelContainer = null
var _tab_content: Label = null

func _ready() -> void:
	layer = 128
	process_mode = Node.PROCESS_MODE_ALWAYS

	if DisplayServer.get_name() == "headless":
		return

	var toggle_btn := Button.new()
	toggle_btn.text = "Play Hub"
	toggle_btn.position = Vector2(16, 16)
	toggle_btn.pressed.connect(_toggle_panel)
	add_child(toggle_btn)

	_panel = PanelContainer.new()
	_panel.visible = false
	_panel.position = Vector2(16, 56)
	_panel.custom_minimum_size = Vector2(360, 220)
	add_child(_panel)

	var vbox := VBoxContainer.new()
	_panel.add_child(vbox)

	var tabs := HBoxContainer.new()
	vbox.add_child(tabs)
	for tab_name in ["People", "Store", "Settings"]:
		var b := Button.new()
		b.text = tab_name
		b.pressed.connect(func() -> void: _select_tab(tab_name))
		tabs.add_child(b)

	_tab_content = Label.new()
	_tab_content.text = "Play Hub Desktop Overlay (M0)"
	_tab_content.custom_minimum_size = Vector2(340, 110)
	vbox.add_child(_tab_content)

	var actions := HBoxContainer.new()
	vbox.add_child(actions)

	var leave_btn := Button.new()
	leave_btn.text = "허브로 나가기 (Leave)"
	leave_btn.pressed.connect(func() -> void: PlayHubDesktopBridge.request_leave())
	actions.add_child(leave_btn)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB and event.shift_pressed:
			_toggle_panel()
			get_viewport().set_input_as_handled()

func _toggle_panel() -> void:
	if _panel != null:
		_panel.visible = not _panel.visible

func _select_tab(tab_name: String) -> void:
	if _tab_content != null:
		_tab_content.text = "Play Hub · %s 탭 (M1에서 백엔드 연동)" % tab_name
