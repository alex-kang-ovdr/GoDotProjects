extends CanvasLayer
## PlayHub Universal In-Game Overlay (M0/M1)
## Toggle: Shift+Tab or top-left floating [Play Hub] button.
## Uses SystemFont fallback so CJK (Korean/Japanese/Chinese) renders cleanly without bloating bootstrap.pck.

var _panel: PanelContainer = null
var _tab_content: Label = null
var _status_badge: Label = null
var _ui_font: SystemFont = null

func _ready() -> void:
	layer = 128
	process_mode = Node.PROCESS_MODE_ALWAYS

	if DisplayServer.get_name() == "headless":
		return

	_ui_font = SystemFont.new()
	_ui_font.font_names = PackedStringArray([
		"Malgun Gothic",
		"Apple SD Gothic Neo",
		"Noto Sans CJK KR",
		"Segoe UI",
		"Sans-Serif",
	])

	var theme := Theme.new()
	theme.default_font = _ui_font
	theme.default_font_size = 15

	var root_ctrl := Control.new()
	root_ctrl.set_anchors_preset(Control.PRESET_FULL_RECT)
	root_ctrl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root_ctrl.theme = theme
	add_child(root_ctrl)

	var top_bar := HBoxContainer.new()
	top_bar.position = Vector2(16, 16)
	top_bar.add_theme_constant_override("separation", 10)
	root_ctrl.add_child(top_bar)

	var toggle_btn := Button.new()
	toggle_btn.text = "Play Hub  [Shift+Tab]"
	toggle_btn.custom_minimum_size = Vector2(180, 38)
	toggle_btn.pressed.connect(_toggle_panel)
	top_bar.add_child(toggle_btn)

	_status_badge = Label.new()
	_status_badge.visible = false
	_status_badge.add_theme_font_size_override("font_size", 14)
	var badge_panel := PanelContainer.new()
	badge_panel.name = "StatusBadgePanel"
	badge_panel.visible = false
	var badge_style := StyleBoxFlat.new()
	badge_style.bg_color = Color(0.06, 0.14, 0.10, 0.92)
	badge_style.border_color = Color(0.13, 0.77, 0.37, 1.0)
	badge_style.set_border_width_all(2)
	badge_style.set_corner_radius_all(6)
	badge_style.set_content_margin_all(8)
	badge_panel.add_theme_stylebox_override("panel", badge_style)
	badge_panel.add_child(_status_badge)
	top_bar.add_child(badge_panel)

	_panel = PanelContainer.new()
	_panel.visible = false
	_panel.position = Vector2(16, 66)
	_panel.custom_minimum_size = Vector2(460, 290)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.08, 0.10, 0.14, 0.94)
	panel_style.border_color = Color(0.28, 0.42, 0.68, 0.9)
	panel_style.set_border_width_all(2)
	panel_style.set_corner_radius_all(10)
	panel_style.set_content_margin_all(16)
	_panel.add_theme_stylebox_override("panel", panel_style)
	root_ctrl.add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	_panel.add_child(vbox)

	var header := Label.new()
	header.text = "Play Hub Desktop · 유니버설 인게임 오버레이"
	header.add_theme_font_size_override("font_size", 17)
	vbox.add_child(header)

	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	vbox.add_child(tabs)
	for tab_name in ["People", "Store", "Settings"]:
		var b := Button.new()
		b.text = tab_name
		b.custom_minimum_size = Vector2(120, 34)
		b.pressed.connect(func() -> void: select_tab(tab_name))
		tabs.add_child(b)

	_tab_content = Label.new()
	_tab_content.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tab_content.custom_minimum_size = Vector2(420, 120)
	vbox.add_child(_tab_content)
	select_tab("People")

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	vbox.add_child(actions)

	var save_btn := Button.new()
	save_btn.text = "클라우드 즉시 저장"
	save_btn.custom_minimum_size = Vector2(160, 36)
	save_btn.pressed.connect(func() -> void: PlayHubDesktopBridge.send_request("ready", {"action": "manual_save"}))
	actions.add_child(save_btn)

	var leave_btn := Button.new()
	leave_btn.text = "허브로 나가기 (Leave)"
	leave_btn.custom_minimum_size = Vector2(190, 36)
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

func set_panel_visible(vis: bool) -> void:
	if _panel != null:
		_panel.visible = vis

func set_status_badge(text: String) -> void:
	if _status_badge != null:
		_status_badge.text = text
		_status_badge.visible = not text.is_empty()
		var p := _status_badge.get_parent()
		if p is Control:
			(p as Control).visible = not text.is_empty()

func select_tab(tab_name: String) -> void:
	if _tab_content == null:
		return
	var gpu: String = RenderingServer.get_video_adapter_name()
	var renderer: String = RenderingServer.get_current_rendering_method()
	match tab_name:
		"People":
			_tab_content.text = "플레이어 & 초대 (People)\n• 현재 세션 IPC 인증: %s (PID %d)\n• 파티 초대 및 크로스플레이 Co-Entry(roomCode) 연동 준비됨\n• 온라인 친구 초대 및 신고/차단 메뉴 영역" % [
				"완료" if PlayHubDesktopBridge.is_authenticated() else "대기",
				OS.get_process_id(),
			]
		"Store":
			_tab_content.text = "인게임 스토어 (Store · 웹 PG 연동)\n• 결제는 시스템 브라우저(Hub-Billing Track A +25%)에서 안전하게 진행\n• 결제 완료 시 playhub:// 복귀 → 원장 재조회 → iap_updated 자동 지급\n• 게임 프로세스에는 세션 토큰을 전달하지 않음"
		"Settings":
			_tab_content.text = "설정 (Settings)\n• 엔진: Godot 4.7.2 (%s)\n• GPU: %s\n• 셰이더 캐시: %s / 단축키: Shift+Tab" % [
				renderer,
				gpu if not gpu.is_empty() else "Headless",
				"활성화" if bool(ProjectSettings.get_setting("rendering/shader_compiler/shader_cache/enabled", false)) else "비활성",
			]
		_:
			_tab_content.text = "Play Hub · %s" % tab_name
