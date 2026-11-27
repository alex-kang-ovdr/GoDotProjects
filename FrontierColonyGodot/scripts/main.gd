extends Control

const AUTO_SAVE := "user://frontier_colony_save.json"
const PAPER := Color("#e9e0ce")
const MUTED := Color("#a9b5a7")
const ACCENT := Color("#e5b773")
const GREEN := Color("#a4c4a8")
const ALERT := Color("#f19480")
const PANELS := ["목표", "주민", "작업", "연구", "설비", "의료", "일정", "제작", "교역", "기록"]
const RESOURCES := ["wood", "steel", "rawfood", "meals", "medicine", "silver"]
const TERRAIN_NAMES := {"grass": "초지", "soil": "흙", "stone": "암반", "water": "물"}
const FEATURE_NAMES := {"tree": "나무", "berry": "열매", "ore": "광맥"}

var runtime: ColonyRuntime
var board: ColonyBoard
var state: Dictionary = {}
var summary: Dictionary = {}
var catalog: Dictionary = {}
var objectives: Array = []
var mood_factors: Dictionary = {}
var selected: Array = []
var selected_cell := Vector2i(-1, -1)
var tool := "select"
var speed := 0
var previous_speed := 1
var auto_pause := true
var tick_pending := false
var tick_budget := 0.0
var save_clock := 0.0
var auto_save_enabled := false
var interface_key := ""
var board_hint: Label
var clock_label: Label
var status_label: Label
var event_label: Label
var resources: Dictionary = {}
var resident_buttons: Dictionary = {}
var resident_bar: HBoxContainer
var tabs: TabBar
var scroll: ScrollContainer
var panel_body: VBoxContainer
var tool_picker: OptionButton
var tool_ids: Array = []
var speed_buttons: Dictionary = {}
var live_labels: Array = []
var signal_meter: ProgressBar
var file_dialog: FileDialog
var settlement_menu: MenuButton


func _ready() -> void:
	_create_interface()
	runtime = ColonyRuntime.new()
	runtime.snapshot_received.connect(_on_snapshot)
	runtime.command_finished.connect(_on_result)
	runtime.failed.connect(_on_failure)
	add_child(runtime)
	if FileAccess.file_exists(AUTO_SAVE) and not "--fresh" in OS.get_cmdline_user_args():
		runtime.request("load", {"path": AUTO_SAVE})
	else:
		_start("standard")


func _process(delta: float) -> void:
	if state.is_empty() or speed == 0 or state.get("gameOver", false):
		return
	tick_budget = minf(tick_budget + delta, 0.5)
	if not tick_pending and tick_budget >= 0.1:
		tick_pending = true
		runtime.request("tick", {"seconds": tick_budget * speed})
		tick_budget = 0
	if auto_save_enabled:
		save_clock += delta
		if save_clock >= 20.0:
			save_clock = 0
			runtime.request("save", {"path": AUTO_SAVE, "quiet": true})


func _create_interface() -> void:
	theme = _make_theme()
	var background := ColorRect.new()
	background.color = Color("#151e1b")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 20)
	add_child(margin)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 12)
	margin.add_child(layout)

	var header := _row(layout, 20)
	var identity := VBoxContainer.new()
	identity.custom_minimum_size.x = 202
	header.add_child(identity)
	_text(identity, "변방의 기록", 32, PAPER)
	clock_label = _text(identity, "정착지를 불러오는 중", 13, MUTED)
	var stock := _row(header, 12)
	stock.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stock.alignment = BoxContainer.ALIGNMENT_CENTER
	for id in RESOURCES:
		var box := VBoxContainer.new()
		box.custom_minimum_size.x = 58
		stock.add_child(box)
		var name_label := _text(box, "", 13, MUTED)
		var value_label := _text(box, "—", 23, PAPER)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		resources[id] = [name_label, value_label]
	var time_controls := _row(header, 6)
	time_controls.alignment = BoxContainer.ALIGNMENT_END
	for value in [0, 1, 3, 6]:
		var btn := _button(time_controls, "정지" if value == 0 else "%d×" % value, _set_speed.bind(value))
		btn.toggle_mode = true
		speed_buttons[value] = btn
	settlement_menu = MenuButton.new()
	settlement_menu.text = "정착지"
	time_controls.add_child(settlement_menu)
	var menu_popup := settlement_menu.get_popup()
	for item in ["저장", "마지막 저장 불러오기", "JSON 가져오기", "JSON 내보내기", "새 정착지", "조작 안내"]:
		menu_popup.add_item(item)
	menu_popup.add_check_item("위기 시 자동 정지", 6)
	menu_popup.set_item_checked(6, auto_pause)
	menu_popup.id_pressed.connect(_menu_action)
	_set_speed(0)

	var content := _row(layout, 12)
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var map_column := VBoxContainer.new()
	map_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_column.add_theme_constant_override("separation", 8)
	content.add_child(map_column)
	var toolbar := _row(map_column, 6)
	tool_picker = OptionButton.new()
	tool_picker.custom_minimum_size.x = 178
	toolbar.add_child(tool_picker)
	tool_picker.item_selected.connect(func(index: int) -> void: _set_tool(tool_ids[index]))
	_button(toolbar, "중심", func() -> void: board.center_colony())
	_button(toolbar, "−", func() -> void: board.zoom_by(0.85))
	_button(toolbar, "+", func() -> void: board.zoom_by(1.18))
	_button(toolbar, "격자", _toggle_grid)
	_button(toolbar, "온도", _overlay.bind("temperature"))
	_button(toolbar, "전력", _overlay.bind("power"))
	var space := Control.new()
	space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar.add_child(space)
	_button(toolbar, "전원 선택", _select_all)
	_button(toolbar, "징집 전환", _draft)
	_button(toolbar, "사수", _hold)
	board = ColonyBoard.new()
	board.clip_contents = true
	board.size_flags_vertical = Control.SIZE_EXPAND_FILL
	board.tile_clicked.connect(_map_click)
	board.zone_dragged.connect(_zone)
	map_column.add_child(board)
	var caption := _row(map_column)
	board_hint = _text(caption, "선택 · 휠 확대 · 가운데 버튼 지도 이동", 14, MUTED)
	board_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	event_label = _text(caption, "", 14, ACCENT)
	resident_bar = _row(map_column, 8)

	var frame := PanelContainer.new()
	frame.custom_minimum_size.x = 364
	content.add_child(frame)
	var sidebar := VBoxContainer.new()
	sidebar.add_theme_constant_override("separation", 8)
	frame.add_child(sidebar)
	tabs = TabBar.new()
	tabs.clip_tabs = true
	tabs.drag_to_rearrange_enabled = false
	tabs.add_theme_font_size_override("font_size", 13)
	for panel in PANELS:
		tabs.add_tab(panel)
	sidebar.add_child(tabs)
	tabs.tab_changed.connect(func(_index: int) -> void: _refresh_panel(true))
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sidebar.add_child(scroll)
	panel_body = VBoxContainer.new()
	panel_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel_body.add_theme_constant_override("separation", 9)
	scroll.add_child(panel_body)
	status_label = _text(layout, "시뮬레이션을 시작하는 중…", 14, MUTED)
	file_dialog = FileDialog.new()
	file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	file_dialog.filters = PackedStringArray(["*.json ; 정착지 저장"])
	file_dialog.file_selected.connect(_file_chosen)
	add_child(file_dialog)
	_rebuild_tools()
	_refresh_panel(true)


func _make_theme() -> Theme:
	var look := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "Apple SD Gothic Neo"])
	look.default_font = font
	look.default_font_size = 15
	for kind in ["Button", "OptionButton", "MenuButton", "TabBar", "PopupMenu", "Label", "LineEdit", "SpinBox"]:
		look.set_color("font_color", kind, PAPER)
		look.set_color("font_hover_color", kind, PAPER)
		look.set_color("font_pressed_color", kind, Color("#171c16"))
		look.set_color("font_disabled_color", kind, Color("#738278"))
		look.set_color("font_selected_color", kind, ACCENT)
	look.set_stylebox("panel", "PanelContainer", _box("#222d27", "#3a4a3e", 12))
	look.set_stylebox("panel", "PopupMenu", _box("#222d27", "#546354", 8))
	for kind in ["Button", "OptionButton", "MenuButton"]:
		look.set_stylebox("normal", kind, _box("#28362e", "#48594b", 7))
		look.set_stylebox("hover", kind, _box("#364a3d", "#849582", 7))
		look.set_stylebox("pressed", kind, _box("#e5b773", "#e5b773", 7))
		look.set_stylebox("disabled", kind, _box("#212d26", "#39463d", 7))
	look.set_stylebox("tab_selected", "TabBar", _box("#364639", "#657259", 4))
	look.set_stylebox("tab_unselected", "TabBar", _box("#222d27", "#222d27", 4))
	look.set_stylebox("tab_hovered", "TabBar", _box("#334139", "#546354", 4))
	look.set_stylebox("background", "ProgressBar", _box("#18221d", "#18221d", 0))
	look.set_stylebox("fill", "ProgressBar", _box("#8baa85", "#8baa85", 0))
	look.set_stylebox("normal", "LineEdit", _box("#18221d", "#48594b", 5))
	return look


func _box(fill: String, border: String, padding: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(fill)
	style.border_color = Color(border)
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	return style


func _row(parent: Node, separation := 8) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", separation)
	parent.add_child(row)
	return row


func _text(parent: Node, value: String, font_size := 15, color := PAPER, wrap := false) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label


func _button(parent: Node, value: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = value
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func _line() -> void:
	panel_body.add_child(HSeparator.new())


func _live(parent: Node, callback: Callable, color := MUTED, font_size := 14) -> void:
	var label := _text(parent, "", font_size, color, true)
	live_labels.append([label, callback])
	label.text = str(callback.call())


func _start(difficulty: String) -> void:
	_set_speed(0)
	runtime.request("start", {"seed": 314159, "difficulty": difficulty})


func _set_speed(value: int) -> void:
	if value > 0:
		previous_speed = value
	speed = value
	tick_budget = 0
	for key in speed_buttons:
		speed_buttons[key].set_pressed_no_signal(key == value)


func _on_failure(message: String) -> void:
	tick_pending = false
	_set_speed(0)
	_notice(message, ALERT)


func _on_result(action: String, result: Dictionary) -> void:
	if action == "tick":
		tick_pending = false
		if result.get("ok", false):
			return
	if result.get("ok", false) and action in ["start", "load"]:
		auto_save_enabled = true
		save_clock = 0
		selected.clear()
		selected_cell = Vector2i(-1, -1)
		board.set_selected(selected)
		board.center_colony()
		_repaint_residents()
		_refresh_panel(true)
	if result.get("quiet", false) and result.get("ok", false):
		return
	var message := str(result.get("message", ""))
	if message.is_empty() and result.get("ok", false):
		message = {"start": "정착지가 준비됐습니다. 1× 또는 Space로 진행하세요.", "load": "정착지를 불러왔습니다.", "save": "정착지를 저장했습니다."}.get(action, "")
	if not message.is_empty():
		_notice(message, GREEN if result.get("ok", false) else ALERT)


func _on_snapshot(snapshot: Dictionary) -> void:
	var old_time := float(state.get("time", -1))
	var old_raid := bool(state.get("activeRaid", false))
	var old_fire := int(summary.get("fireCount", 0))
	var old_downed := int(summary.get("downed", 0))
	var old_victory := bool(state.get("victory", false))
	state = snapshot.get("state", {})
	summary = snapshot.get("summary", {})
	objectives = snapshot.get("objectives", [])
	mood_factors = snapshot.get("mood_factors", {})
	selected = selected.filter(func(id: String) -> bool: return not _pawn(id).get("dead", true))
	if catalog.is_empty() and not snapshot.get("catalog", {}).is_empty():
		catalog = snapshot.catalog
		_rebuild_tools()
	board.set_state(state)
	board.set_selected(selected)
	if old_time < 0 or float(state.get("time", 0)) < old_time:
		selected.clear()
		selected_cell = Vector2i(-1, -1)
		board.center_colony()
		board.set_selected(selected)
		interface_key = ""
	_repaint_header()
	_repaint_residents()
	_refresh_panel()
	var crisis := ""
	if state.get("gameOver", false):
		crisis = "정착지가 무너졌습니다. 정착지 메뉴에서 다시 시작할 수 있습니다."
	elif state.get("victory", false) and not old_victory:
		crisis = "구조선이 응답했습니다. 정착지를 계속 운영할 수 있습니다."
	elif state.get("activeRaid", false) and not old_raid:
		crisis = "습격이 시작됐습니다. 주민을 징집하고 방어하세요."
	elif int(summary.get("fireCount", 0)) > old_fire:
		crisis = "새 화재가 발생했습니다. 의료 탭에서 진화 상황을 확인하세요."
	elif int(summary.get("downed", 0)) > old_downed:
		crisis = "주민이 쓰러졌습니다. 의료 탭에서 구조를 지시하세요."
	if not crisis.is_empty():
		if auto_pause or state.get("gameOver", false):
			_set_speed(0)
		_notice(crisis, GREEN if state.get("victory", false) else ALERT)


func _repaint_header() -> void:
	var hour := float(summary.get("hour", 8))
	var weather: String = {"clear": "맑음", "rain": "비", "heat": "더위"}.get(state.get("weather", "clear"), "")
	clock_label.text = "%d일차  %02d:%02d  ·  %s  %d°C" % [summary.get("day", 1), floori(hour), floori(fmod(hour, 1.0) * 60), weather, summary.get("temperature", 0)]
	for id in RESOURCES:
		resources[id][0].text = _resource_name(id)
		resources[id][1].text = str(int(state.get("resources", {}).get(id, 0)))
	event_label.text = "구조 성공" if state.get("victory", false) else str(summary.get("threat", ""))
	event_label.add_theme_color_override("font_color", ALERT if state.get("activeRaid", false) else ACCENT)


func _repaint_residents() -> void:
	for pawn in state.get("colonists", []):
		var id: String = pawn.id
		if not resident_buttons.has(id):
			var button := _button(resident_bar, "", _select_resident_button.bind(id))
			button.toggle_mode = true
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			resident_buttons[id] = button
		var button: Button = resident_buttons[id]
		button.disabled = pawn.dead
		button.text = "%s  ·  %s" % [pawn.name, pawn.status]
		button.set_pressed_no_signal(id in selected)
		button.tooltip_text = "%s · 건강 %d · 기분 %d" % [pawn.role, pawn.health, pawn.mood]
	for id in resident_buttons.keys():
		if _pawn(id).is_empty():
			resident_buttons[id].queue_free()
			resident_buttons.erase(id)


func _rebuild_tools() -> void:
	tool_picker.clear()
	tool_ids.clear()
	for pair in [["select", "선택 / 지휘"], ["gather", "채집 지정"], ["farm", "경작 구역"], ["stockpile", "창고 구역"], ["prioritize", "우선 작업"], ["cancel", "지정 취소"], ["demolish", "철거"]]:
		_add_tool(pair[0], pair[1])
	if not catalog.get("buildings", {}).is_empty():
		tool_picker.add_separator("건설")
		tool_ids.append("")
		for id in catalog.buildings:
			var def: Dictionary = catalog.buildings[id]
			_add_tool("build:" + id, "%s · %s" % [def.label, _cost(def.cost)])
	_set_tool(tool if tool in tool_ids else "select")


func _add_tool(id: String, title: String) -> void:
	tool_picker.add_item(title)
	tool_ids.append(id)


func _set_tool(new_tool: String) -> void:
	if not new_tool in tool_ids:
		return
	tool = new_tool
	board.set_tool(tool)
	tool_picker.select(tool_ids.find(tool))
	board_hint.text = "%s  ·  휠 확대 / 가운데 버튼 이동" % tool_picker.get_item_text(tool_picker.selected)


func _overlay(value: String) -> void:
	board.overlay = "" if board.overlay == value else value
	board.queue_redraw()


func _toggle_grid() -> void:
	board.grid_visible = not board.grid_visible
	board.queue_redraw()


func _notice(message: String, color := MUTED) -> void:
	status_label.text = message
	status_label.add_theme_color_override("font_color", color)


func _resource_name(id: String) -> String:
	return str(catalog.get("resources", {}).get(id, id))


func _cost(cost: Dictionary) -> String:
	var parts := PackedStringArray()
	for id in cost:
		parts.append("%s %d" % [_resource_name(id), cost[id]])
	return " · ".join(parts)


func _pawn(id: String) -> Dictionary:
	for pawn in state.get("colonists", []):
		if pawn.id == id:
			return pawn
	return {}


func _active_pawn() -> Dictionary:
	return {} if selected.is_empty() else _pawn(selected[0])


func _tile(cell: Vector2i) -> Dictionary:
	if cell.x < 0 or cell.y < 0 or cell.x >= int(state.get("width", 0)) or cell.y >= int(state.get("height", 0)):
		return {}
	return state.tiles[cell.y * int(state.width) + cell.x]


func _at_cell(actor: Dictionary, cell: Vector2i) -> bool:
	return floori(actor.x) == cell.x and floori(actor.y) == cell.y


func _select_resident_button(id: String) -> void:
	_set_tool("select")
	_select_resident(id, Input.is_key_pressed(KEY_SHIFT))


func _select_resident(id: String, additive: bool) -> void:
	selected_cell = Vector2i(-1, -1)
	if not additive:
		selected.assign([id])
	elif id in selected:
		selected.erase(id)
	else:
		selected.append(id)
	board.set_selected(selected)
	_repaint_residents()
	tabs.current_tab = 1
	_refresh_panel(true)


func _select_all() -> void:
	_set_tool("select")
	selected.clear()
	selected_cell = Vector2i(-1, -1)
	for pawn in state.get("colonists", []):
		if not pawn.dead:
			selected.append(pawn.id)
	board.set_selected(selected)
	_repaint_residents()
	tabs.current_tab = 1
	_refresh_panel(true)


func _command(type: String, payload: Dictionary) -> void:
	if not state.is_empty():
		runtime.request("command", {"type": type, "payload": payload})


func _with_cell(cell: Vector2i, options: Dictionary = {}) -> Dictionary:
	var result := {"x": cell.x, "y": cell.y}
	result.merge(options)
	return result


func _map_click(cell: Vector2i, button: int, additive: bool) -> void:
	if _tile(cell).is_empty():
		return
	if button == MOUSE_BUTTON_RIGHT:
		_issue_order(cell)
		return
	if button != MOUSE_BUTTON_LEFT:
		return
	match tool:
		"select":
			for pawn in state.colonists:
				if not pawn.dead and _at_cell(pawn, cell):
					_select_resident(pawn.id, additive)
					return
			if not _drafted_ids().is_empty():
				_issue_order(cell)
				return
			selected.clear()
			selected_cell = cell
			board.set_selected(selected)
			_repaint_residents()
			tabs.current_tab = 1
			_refresh_panel(true)
		"gather":
			_command("designate", _with_cell(cell, {"kind": "gather"}))
		"farm", "stockpile":
			_zone(cell, cell)
		"cancel", "demolish":
			_command(tool, _with_cell(cell))
		"prioritize":
			_priority_order(cell)
		_:
			if tool.begins_with("build:"):
				_command("build", _with_cell(cell, {"kind": tool.trim_prefix("build:")}))


func _zone(from_cell: Vector2i, to_cell: Vector2i) -> void:
	if tool not in ["farm", "stockpile"] or state.is_empty():
		return
	var cells: Array = []
	for y in range(maxi(0, mini(from_cell.y, to_cell.y)), mini(int(state.height), maxi(from_cell.y, to_cell.y) + 1)):
		for x in range(maxi(0, mini(from_cell.x, to_cell.x)), mini(int(state.width), maxi(from_cell.x, to_cell.x) + 1)):
			cells.append({"x": x, "y": y, "kind": tool})
	if not cells.is_empty():
		runtime.request("command", {"type": "zone", "payload": cells[0], "batch": cells.map(func(cell: Dictionary) -> Dictionary: return {"type": "zone", "payload": cell})})


func _drafted_ids() -> Array:
	return selected.filter(func(id: String) -> bool: return bool(_pawn(id).get("drafted", false)))


func _issue_order(cell: Vector2i) -> void:
	var soldiers := _drafted_ids()
	if soldiers.is_empty():
		_priority_order(cell)
		return
	for raider in state.raiders:
		if not raider.dead and _at_cell(raider, cell):
			for id in soldiers:
				_command("attack", {"id": id, "targetId": raider.id})
			return
	_command("moveGroup", _with_cell(cell, {"ids": soldiers}))


func _priority_order(cell: Vector2i) -> void:
	var pawn := _active_pawn()
	if pawn.is_empty():
		_notice("우선 작업을 맡길 주민을 선택하세요.", ACCENT)
	else:
		_command("prioritize", _with_cell(cell, {"id": pawn.id}))


func _draft() -> void:
	if selected.is_empty():
		_select_all()
	var standing := selected.map(_pawn).filter(func(pawn: Dictionary) -> bool: return not pawn.get("dead", true) and float(pawn.health) >= 15 and not pawn.carriedBy)
	var value := standing.any(func(pawn: Dictionary) -> bool: return not pawn.drafted)
	for pawn in standing:
		if pawn.drafted != value:
			_command("draft", {"id": pawn.id, "value": value})


func _hold() -> void:
	for id in _drafted_ids():
		_command("hold", {"id": id})


func _refresh_panel(force := false) -> void:
	var pawn := _active_pawn()
	var tab := tabs.current_tab
	var tile := _tile(selected_cell)
	var bed: Variant = tile.get("building")
	var resident_ids: Array = state.get("colonists", []).map(func(person: Dictionary) -> String: return person.id)
	var key := "%d/%s/%s/%s/%s" % [tab, selected, selected_cell, bed.get("type") if bed is Dictionary else "", resident_ids]
	if force or key != interface_key:
		interface_key = key
		for child in panel_body.get_children():
			panel_body.remove_child(child)
			child.queue_free()
		live_labels.clear()
		signal_meter = null
		_text(panel_body, PANELS[tab], 24, PAPER)
		if state.is_empty():
			_text(panel_body, "정착지 상태를 기다리는 중입니다.", 14, MUTED, true)
		else:
			match tab:
				0: _goals()
				1: _inspect(pawn, tile)
				2: _work()
				3: _research()
				4: _systems()
				5: _care()
				6: _schedule(pawn)
				7: _industry(pawn)
				8: _trade()
				9: _journal()
	for binding in live_labels:
		binding[0].text = str(binding[1].call())
	if signal_meter != null:
		signal_meter.value = float(state.beaconProgress)


func _goals() -> void:
	_text(panel_body, "거처를 닫고 구조 신호를 보내세요.", 16, ACCENT, true)
	_live(panel_body, func() -> String: return "구조 신호  %d%%  ·  식량 약 %.1f일분" % [float(state.beaconProgress) * 100, summary.foodDays], GREEN, 17)
	signal_meter = ProgressBar.new()
	signal_meter.show_percentage = false
	signal_meter.custom_minimum_size.y = 5
	signal_meter.max_value = 1
	panel_body.add_child(signal_meter)
	for index in range(objectives.size()):
		_line()
		_live(panel_body, func() -> String:
			var objective: Dictionary = objectives[index]
			return "%s  %s" % ["✓" if objective.done else "○", objective.label], PAPER, 15)
		_live(panel_body, func() -> String: return objectives[index].detail)


func _inspect(pawn: Dictionary, tile: Dictionary) -> void:
	if not pawn.is_empty():
		var id: String = pawn.id
		_text(panel_body, "%s · %s" % [pawn.name, pawn.role], 20, ACCENT)
		_live(panel_body, func() -> String:
			var p := _pawn(id)
			return "%s\n건강 %d · 포만 %d · 휴식 %d\n기분 %d · 여가 %d · 출혈 %.2f" % [p.status, p.health, p.hunger, p.energy, p.mood, p.get("recreation", 0), p.bleed], PAPER)
		var commands := _row(panel_body)
		_button(commands, "징집 전환", _draft)
		_button(commands, "위치 사수", _hold)
		_button(commands, "우선 작업", _set_tool.bind("prioritize"))
		_line()
		_text(panel_body, "기분 요인", 16, PAPER)
		_live(panel_body, func() -> String:
			var parts := PackedStringArray()
			for factor in mood_factors.get(id, []):
				if absf(float(factor.value)) > 0.01:
					parts.append("%s %+.1f" % [factor.label, factor.value])
			return " · ".join(parts))
		_button(panel_body, "장비 관리", func() -> void: tabs.current_tab = 7)
	elif not tile.is_empty():
		var cell := selected_cell
		_text(panel_body, "%s  (%d, %d)" % [TERRAIN_NAMES.get(tile.terrain, tile.terrain), cell.x, cell.y], 20, ACCENT)
		_live(panel_body, _tile_details.bind(cell))
		var buttons := _row(panel_body)
		_button(buttons, "채집", _command.bind("designate", _with_cell(cell, {"kind": "gather"})))
		_button(buttons, "취소", _command.bind("cancel", _with_cell(cell)))
		_button(buttons, "철거", _command.bind("demolish", _with_cell(cell)))
		if tile.building is Dictionary and tile.building.type == "bed":
			_button(panel_body, "의료 침상 전환", _toggle_medical_bed.bind(cell))
	else:
		_text(panel_body, "지도에서 주민이나 칸을 선택하세요. Shift로 주민을 추가 선택합니다.", 14, MUTED, true)


func _tile_details(cell: Vector2i) -> String:
	var tile := _tile(cell)
	var lines := PackedStringArray(["%s · %.1f°C" % ["실내" if tile.get("roofed", false) else "실외", tile.get("temperature", 0)]])
	if tile.building is Dictionary:
		var b: Dictionary = tile.building
		lines.append("%s · %s · 내구도 %d" % [catalog.buildings.get(b.type, {}).get("label", b.type), "완공" if b.complete else "건설 중", b.hp])
		if b.get("medical", false):
			lines.append("의료 침상")
	if tile.feature != null:
		lines.append("%s %d" % [FEATURE_NAMES.get(tile.feature, tile.feature), tile.amount])
	if tile.zone != null:
		lines.append("경작 구역" if tile.zone == "farm" else "창고 구역")
	if tile.get("fire", 0) > 0:
		lines.append("화재 발생")
	return "\n".join(lines)


func _toggle_medical_bed(cell: Vector2i) -> void:
	var building: Variant = _tile(cell).get("building")
	if building is Dictionary:
		_command("medicalBed", _with_cell(cell, {"value": not building.get("medical", false)}))


func _work() -> void:
	_text(panel_body, "1부터 높은 순서로 배정합니다. 0은 비활성입니다.", 14, MUTED, true)
	for pawn in state.colonists:
		var id: String = pawn.id
		_line()
		_text(panel_body, pawn.name, 17, PAPER)
		for work in catalog.get("jobs", {}):
			var row := _row(panel_body)
			var label := _text(row, catalog.jobs[work], 14)
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			_button(row, "−", _edit_priority.bind(id, work, -1))
			_live(row, func() -> String: return str(int(_pawn(id).priorities.get(work, 0))), GREEN)
			_button(row, "+", _edit_priority.bind(id, work, 1))


func _edit_priority(id: String, work: String, offset: int) -> void:
	var value := int(_pawn(id).priorities.get(work, 0))
	_command("priority", {"id": id, "work": work, "value": clampi(value + offset, 0, 4)})


func _research() -> void:
	_button(panel_body, "연구대 건설", _set_tool.bind("build:researchbench"))
	for id in catalog.get("research", {}):
		var def: Dictionary = catalog.research[id]
		_line()
		_text(panel_body, def.label, 17, PAPER)
		_text(panel_body, def.description, 14, MUTED, true)
		_live(panel_body, func() -> String:
			return "%d / %d  ·  %s" % [state.research.progress.get(id, 0), def.points, "완료" if id in state.research.unlocked else ("연구 중" if state.research.active == id else "대기")], GREEN)
		_button(panel_body, "연구 선택", _command.bind("research", {"id": id}))


func _systems() -> void:
	_live(panel_body, func() -> String: return "발전 %d W · 수요 %d W\n축전 %.0f / %.0f · 실내 침대 %d\n냉장 창고 %s · 부패 식량 %d" % [summary.powerGeneration, summary.powerDemand, summary.powerStored, summary.powerCapacity, summary.indoorBeds, "가동" if summary.coldStorage else "없음", summary.spoiled], PAPER)
	var controls := _row(panel_body)
	_button(controls, "전력망", _overlay.bind("power"))
	_button(controls, "온도", _overlay.bind("temperature"))
	for id in ["solar", "battery", "conduit", "heater", "cooler", "beacon"]:
		var def: Dictionary = catalog.get("buildings", {}).get(id, {})
		if not def.is_empty():
			_button(panel_body, "%s 건설" % def.label, _set_tool.bind("build:" + id))
	_line()
	_live(panel_body, func() -> String: return "자동 조리 %s · 목표 %d / 자동 수리 %s" % ["켜짐" if state.autoCook else "꺼짐", state.mealTarget, "켜짐" if state.autoRepair else "꺼짐"])
	var cook_row := _row(panel_body)
	var meal_target := _number(cook_row, 1, 100, int(state.mealTarget))
	_button(cook_row, "조리 목표 적용", func() -> void: _command("autoCook", {"value": true, "target": int(meal_target.value)}))
	_button(panel_body, "자동 조리 전환", func() -> void: _command("autoCook", {"value": not state.autoCook}))
	_button(panel_body, "자동 수리 전환", func() -> void: _command("autoRepair", {"value": not state.autoRepair}))


func _care() -> void:
	_live(panel_body, func() -> String: return "화재 %d칸 · 쓰러진 주민 %d명" % [summary.fireCount, summary.downed], ALERT, 17)
	_text(panel_body, "의료 침상은 완성된 침대를 선택해 지정합니다. 불을 선택하면 소방 작업을 우선 지시할 수 있습니다.", 14, MUTED, true)
	_button(panel_body, "우선 작업 도구", _set_tool.bind("prioritize"))
	for patient in state.colonists:
		var id: String = patient.id
		_line()
		_live(panel_body, func() -> String:
			var person := _pawn(id)
			return "%s · 건강 %d · 출혈 %.2f" % [person.name, person.health, person.bleed], PAPER)
		var row := _row(panel_body)
		_button(row, "구조 지시", _care_order.bind("rescue", id))
		_button(row, "치료 지시", _care_order.bind("tend", id))


func _care_order(action: String, target: String) -> void:
	var active := _active_pawn()
	if not active.is_empty() and active.id != target and not active.drafted and float(active.health) >= 15:
		_command(action, {"id": active.id, "targetId": target})
		return
	for pawn in state.colonists:
		if pawn.id != target and not pawn.dead and not pawn.drafted and float(pawn.health) >= 15:
			_command(action, {"id": pawn.id, "targetId": target})
			return
	_notice("구조·치료를 맡을 건강한 주민이 없습니다.", ALERT)


func _schedule(pawn: Dictionary) -> void:
	var id: String = pawn.get("id", state.colonists[0].id)
	_text(panel_body, _pawn(id).name, 17, ACCENT)
	_text(panel_body, "주민 카드를 선택한 뒤 일정 탭에서 편집하세요.", 14, MUTED, true)
	var presets := _row(panel_body)
	for pair in [["balanced", "균형"], ["night", "야간"], ["free", "자율"]]:
		_button(presets, pair[1], _command.bind("schedulePreset", {"id": id, "preset": pair[0]}))
	var modes: Dictionary = catalog.get("schedule_modes", {})
	for hour in range(24):
		var row := _row(panel_body)
		var label := _text(row, "%02d시" % hour, 14)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_live(row, func() -> String: return modes.get(_pawn(id).schedule[hour], ""), GREEN)
		_button(row, "변경", _cycle_schedule.bind(id, hour))


func _cycle_schedule(id: String, hour: int) -> void:
	var modes: Array = catalog.get("schedule_modes", {}).keys()
	if not modes.is_empty():
		var next := (modes.find(_pawn(id).schedule[hour]) + 1) % modes.size()
		_command("schedule", {"id": id, "hour": hour, "mode": modes[next]})


func _number(parent: Node, minimum: int, maximum: int, current: int) -> SpinBox:
	var spin := SpinBox.new()
	spin.min_value = minimum
	spin.max_value = maximum
	spin.value = current
	parent.add_child(spin)
	return spin


func _industry(pawn: Dictionary) -> void:
	_button(panel_body, "제작대 건설", _set_tool.bind("build:workbench"))
	for id in catalog.get("recipes", {}):
		var recipe: Dictionary = catalog.recipes[id]
		var bill: Dictionary = state.industry.bills[id]
		_line()
		_text(panel_body, "%s · %s" % [recipe.label, _cost(recipe.cost)], 15, PAPER, true)
		_text(panel_body, recipe.description, 14, MUTED, true)
		_live(panel_body, func() -> String:
			var current: Dictionary = state.industry.bills[id]
			return "%s %d · 창고 %d%s" % ["남은 주문" if current.mode == "count" else "유지 목표", current.target, state.resources[id], " · 일시 정지" if current.paused else ""], GREEN)
		var row := _row(panel_body, 4)
		var mode := OptionButton.new()
		mode.add_item("횟수")
		mode.add_item("유지")
		mode.select(0 if bill.mode == "count" else 1)
		row.add_child(mode)
		var count := _number(row, 0, 99, int(bill.target))
		_button(row, "적용", func() -> void:
			_command("bill", {"recipeId": id, "mode": "count" if mode.selected == 0 else "maintain", "target": int(count.value), "paused": false}))
		_button(row, "정지/재개", _toggle_bill.bind(id))
		if not pawn.is_empty():
			var character: String = pawn.id
			var slot: String = catalog.equipment[id].slot
			var gear := _row(panel_body)
			_button(gear, pawn.name + " 장착", _command.bind("equip", {"id": character, "item": id}))
			_button(gear, "해제", _command.bind("unequip", {"id": character, "slot": slot}))
			_live(panel_body, func() -> String:
				var worn: Variant = _pawn(character).equipment.get(slot)
				return "장착: %s" % (_resource_name(worn) if worn is String else "없음"))


func _toggle_bill(id: String) -> void:
	var bill: Dictionary = state.industry.bills[id]
	_command("bill", {"recipeId": id, "mode": bill.mode, "target": bill.target, "paused": not bill.paused})


func _trade() -> void:
	_live(panel_body, _trade_status, ACCENT, 17)
	_text(panel_body, "구매품과 판매 대금은 상인 발밑에 놓입니다. 창고로 운반한 뒤 사용할 수 있습니다.", 14, MUTED, true)
	var item := OptionButton.new()
	var prices: Dictionary = catalog.get("trade_prices", {})
	var ids := prices.keys()
	for id in ids:
		item.add_item(_resource_name(id))
	if ids.is_empty():
		return
	panel_body.add_child(item)
	var row := _row(panel_body)
	var count := _number(row, 1, 100, 1)
	for pair in [["buy", "구매"], ["sell", "판매"]]:
		var side: String = pair[0]
		_button(row, pair[1], func() -> void: _trade_order(side, ids[item.selected], int(count.value)))
	_live(panel_body, func() -> String:
		var id: String = ids[item.selected]
		var trader: Variant = state.trade.visitor
		var trader_stock: int = int(trader.stock.get(id, 0)) if trader is Dictionary else 0
		var sell_price: Variant = prices[id].sell
		var sale := "판매 불가" if sell_price == null else "판매 %d" % sell_price
		return "구매 %d · %s\n상인 재고 %d · 창고 재고 %d" % [prices[id].buy, sale, trader_stock, state.resources[id]])


func _trade_status() -> String:
	var trader: Variant = state.trade.visitor
	if not trader is Dictionary:
		return "다음 방문까지 %.0f초" % maxf(0, state.trade.nextVisitAt - state.time)
	var phase: String = {"arriving": "이동 중", "trading": "교역 중", "leaving": "떠나는 중"}.get(trader.phase, "")
	return "%s · %s · 은화 %d" % [trader.name, phase, trader.silver]


func _trade_order(side: String, id: String, count: int) -> void:
	var trader: Variant = state.trade.visitor
	if trader is Dictionary:
		_command("trade", {"traderId": trader.id, "side": side, "type": id, "count": count})
	else:
		_notice("방문 상인이 도착하면 교역할 수 있습니다.", ACCENT)


func _journal() -> void:
	_live(panel_body, func() -> String:
		var lines := PackedStringArray()
		for entry in state.logs.slice(0, 20):
			lines.append("%05.1f  %s\n%s" % [entry.time, entry.title, entry.text])
		return "\n\n".join(lines))


func _menu_action(id: int) -> void:
	match id:
		0: runtime.request("save", {"path": AUTO_SAVE})
		1:
			_set_speed(0)
			runtime.request("load", {"path": AUTO_SAVE})
		2, 3:
			_set_speed(0)
			file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE if id == 2 else FileDialog.FILE_MODE_SAVE_FILE
			file_dialog.current_file = "" if id == 2 else "frontier-colony.json"
			file_dialog.popup_centered_ratio(0.65)
		4: _new_dialog()
		5: _help_dialog()
		6:
			auto_pause = not auto_pause
			settlement_menu.get_popup().set_item_checked(6, auto_pause)


func _file_chosen(path: String) -> void:
	runtime.request("load" if file_dialog.file_mode == FileDialog.FILE_MODE_OPEN_FILE else "save", {"path": path})


func _new_dialog() -> void:
	_set_speed(0)
	var dialog := ConfirmationDialog.new()
	dialog.title = "새 정착지"
	dialog.dialog_text = "새 게임을 시작하면 현재 진행이 바뀝니다. 자동 저장은 새 게임을 진행한 뒤 갱신됩니다."
	dialog.ok_button_text = "표준"
	dialog.cancel_button_text = "취소"
	dialog.add_button("여유", true, "relaxed")
	dialog.confirmed.connect(func() -> void: _start("standard"); dialog.queue_free())
	dialog.custom_action.connect(func(_action: String) -> void: _start("relaxed"); dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	add_child(dialog)
	dialog.popup_centered()


func _help_dialog() -> void:
	var dialog := AcceptDialog.new()
	dialog.title = "조작 안내"
	dialog.dialog_text = "Space │ 정지 / 재개     1–3 │ 1× / 3× / 6×\n가운데 버튼 드래그 │ 이동     휠 │ 확대·축소\nShift+클릭 │ 여러 주민 선택     R │ 징집 전환\n징집 후 지도 클릭 │ 이동 / 공격     X │ 사수\n비징집 주민 선택 후 우클릭 │ 우선 작업\nCtrl+S │ 저장     Esc │ 선택 모드\n\n동쪽 (27,16)과 남쪽 (23,19) 틈을 닫고 세 번째 침대를 지으세요."
	dialog.confirmed.connect(dialog.queue_free)
	dialog.canceled.connect(dialog.queue_free)
	add_child(dialog)
	dialog.popup_centered()


func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_SPACE: _set_speed(previous_speed if speed == 0 else 0)
		KEY_1: _set_speed(1)
		KEY_2: _set_speed(3)
		KEY_3: _set_speed(6)
		KEY_ESCAPE, KEY_Q: _set_tool("select")
		KEY_R: _draft()
		KEY_X: _hold()
		KEY_F: board.center_colony()
		KEY_G: _toggle_grid()
		KEY_T: _overlay("temperature")
		KEY_P: _overlay("power")
		KEY_H: _help_dialog()
		KEY_J: tabs.current_tab = 3
		KEY_C: tabs.current_tab = 5
		KEY_L: tabs.current_tab = 6
		KEY_I: tabs.current_tab = 7
		KEY_O: tabs.current_tab = 8
		KEY_A:
			if event.ctrl_pressed:
				_select_all()
		KEY_S:
			if event.ctrl_pressed:
				runtime.request("save", {"path": AUTO_SAVE})
