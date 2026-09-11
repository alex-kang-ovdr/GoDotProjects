class_name DebugWorkbench
extends CanvasLayer

var player: VoxelPlayer
var world: VoxelWorld
var opened := false
var root_control: Control
var panel: PanelContainer
var health_input: SpinBox
var hunger_input: SpinBox
var warmth_input: SpinBox
var item_input: SpinBox
var count_input: SpinBox
var command_input: LineEdit
var result_label: Label


func setup(target_player: VoxelPlayer, target_world: VoxelWorld) -> void:
	player = target_player
	world = target_world
	_build_ui()
	player.debug_workbench_requested.connect(toggle)
	player.survival.changed.connect(_refresh_values)


func toggle() -> void:
	if opened:
		close()
	else:
		open()


func open() -> bool:
	if not OS.is_debug_build() or world.gameplay_locked() or player.controls_open:
		return false
	opened = true
	root_control.visible = true
	player.controls_open = true
	player.velocity = Vector3.ZERO
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_refresh_values()
	command_input.grab_focus()
	return true


func close() -> void:
	if not opened:
		return
	opened = false
	root_control.visible = false
	player.controls_open = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED



func execute_command(source: String) -> Dictionary:
	if not OS.is_debug_build():
		return _result(false, "Debug workbench is disabled outside a debug build")
	var parts := source.strip_edges().to_lower().split(" ", false)
	if parts.is_empty():
		return _result(false, "Enter a command; use help")
	match parts[0]:
		"help":
			return _result(true, "set <health|hunger|warmth> <0..100> | reset | day | night | advance <seconds> | give <item-id> <count> | fill | clear | return | save | load | profile | perf | axes")
		"set":
			if parts.size() != 3 or not parts[1] in ["health", "hunger", "warmth"] or not parts[2].is_valid_float():
				return _result(false, "Usage: set <health|hunger|warmth> <0..100>")
			var values := player.survival.snapshot()
			values[parts[1]] = float(parts[2])
			player.survival.set_values(float(values.health), float(values.hunger), float(values.warmth))
			return _result(true, "%s set to %.1f" % [parts[1], float(values[parts[1]])])
		"day":
			player.survival.set_phase(false)
			return _result(true, "Survival clock set to DAY")
		"night":
			player.survival.set_phase(true)
			return _result(true, "Survival clock set to NIGHT")
		"reset":
			player.survival.reset()
			return _result(true, "Survival state reset")
		"advance":
			if parts.size() != 2 or not parts[1].is_valid_float() or not player.survival.advance(float(parts[1])):
				return _result(false, "Usage: advance <non-negative seconds>")
			return _result(true, "Advanced %.2f seconds" % float(parts[1]))
		"give":
			if parts.size() != 3 or not parts[1].is_valid_int() or not parts[2].is_valid_int():
				return _result(false, "Usage: give <item-id> <count>")
			return _give_item(parts[1].to_int(), parts[2].to_int())
		"fill":
			player.development_fill_selected()
			return _result(true, "Filled selected inventory stack")
		"clear":
			player.development_clear_selected()
			return _result(true, "Cleared selected inventory stack")
		"return":
			var returned := player.return_to_spawn()
			return _result(returned, "Returned to safe entrance" if returned else "No safe entrance cell")
		"save":
			world.save_game(player)
			return _result(true, "Save requested")
		"load":
			world.load_game(player)
			return _result(true, "Load requested")
		"profile":
			return _result(player.write_profile_snapshot(), "Profile snapshot requested" if player.last_profile_path.is_empty() else "Profile saved: " + player.last_profile_path)
		"perf":
			player.toggle_performance_hud()
			return _result(true, "Performance HUD toggled")
		"axes":
			player.toggle_voxel_debug()
			return _result(true, "Voxel axis visualization toggled")
		_:
			return _result(false, "Unknown command; use help")


func _unhandled_input(event: InputEvent) -> void:
	if not OS.is_debug_build() or not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.keycode == KEY_F4:
		toggle()
		get_viewport().set_input_as_handled()
	elif opened and event.keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()


func _build_ui() -> void:
	root_control = Control.new()
	root_control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root_control.visible = false
	add_child(root_control)
	var shade := ColorRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.01, 0.02, 0.025, 0.82)
	root_control.add_child(shade)
	panel = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-350, -278)
	panel.size = Vector2(700, 556)
	root_control.add_child(panel)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17231c")
	style.border_color = Color("9bd17f")
	style.set_border_width_all(2)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	var title := Label.new()
	title.text = "SURVIVAL DEBUG WORKBENCH  [F4 / Esc close]"
	title.add_theme_font_size_override("font_size", 21)
	title.add_theme_color_override("font_color", Color("b7ed97"))
	column.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Debug build only · property edits and cheats never advance Builder progress"
	subtitle.add_theme_color_override("font_color", Color("d3ddd0"))
	column.add_child(subtitle)
	var values := HBoxContainer.new()
	values.add_theme_constant_override("separation", 12)
	column.add_child(values)
	health_input = _number_field(values, "Health", 0, 100, 100)
	hunger_input = _number_field(values, "Hunger", 0, 100, 100)
	warmth_input = _number_field(values, "Warmth", 0, 100, 100)
	var apply := Button.new()
	apply.text = "Apply stats"
	apply.pressed.connect(func() -> void:
		player.survival.set_values(health_input.value, hunger_input.value, warmth_input.value)
		_show_result(_result(true, "Survival stats applied")))
	values.add_child(apply)
	var quick := HBoxContainer.new()
	quick.add_theme_constant_override("separation", 8)
	column.add_child(quick)
	for spec in [["Set DAY", "day"], ["Set NIGHT", "night"], ["Advance 60s", "advance 60"], ["Reset survival", "reset"], ["Toggle performance", "perf"], ["Toggle axes", "axes"]]:
		_command_button(quick, str(spec[0]), str(spec[1]))
	var item_row := HBoxContainer.new()
	item_row.add_theme_constant_override("separation", 10)
	column.add_child(item_row)
	item_input = _number_field(item_row, "Item ID", 0, ItemRegistry.COUNT - 1, 9)
	count_input = _number_field(item_row, "Count", 1, 64, 1)
	var give := Button.new()
	give.text = "Give item"
	give.pressed.connect(func() -> void: _show_result(_give_item(int(item_input.value), int(count_input.value))))
	item_row.add_child(give)
	for spec in [["Fill selected", "fill"], ["Clear selected", "clear"], ["Safe return", "return"], ["Save", "save"], ["Load", "load"], ["Profile", "profile"]]:
		_command_button(item_row, str(spec[0]), str(spec[1]))
	var command_title := Label.new()
	command_title.text = "Cheat command"
	column.add_child(command_title)
	command_input = LineEdit.new()
	command_input.placeholder_text = "help  |  set hunger 40  |  night  |  give 10 8"
	command_input.text_submitted.connect(func(value: String) -> void:
		_show_result(execute_command(value))
		command_input.clear())
	column.add_child(command_input)
	result_label = Label.new()
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result_label.custom_minimum_size.y = 80
	result_label.text = "Ready. Choose a button or type help."
	column.add_child(result_label)


func _number_field(parent: Control, caption: String, minimum: float, maximum: float, initial: float) -> SpinBox:
	var group := VBoxContainer.new()
	group.custom_minimum_size.x = 118
	parent.add_child(group)
	var label := Label.new()
	label.text = caption
	group.add_child(label)
	var input := SpinBox.new()
	input.min_value = minimum
	input.max_value = maximum
	input.step = 1.0
	input.value = initial
	group.add_child(input)
	return input


func _command_button(parent: Control, caption: String, command: String) -> void:
	var button := Button.new()
	button.text = caption
	button.pressed.connect(func() -> void: _show_result(execute_command(command)))
	parent.add_child(button)


func _give_item(item: int, amount: int) -> Dictionary:
	if item < 0 or item >= ItemRegistry.COUNT or amount < 1 or amount > ItemRegistry.maximum(item):
		return _result(false, "Item ID or count is outside the allowed range")
	if not player.inventory.add(item, amount):
		return _result(false, "Inventory cannot hold that item stack")
	return _result(true, "Added %d × %s" % [amount, ItemRegistry.definition(item).name])


func _refresh_values() -> void:
	if health_input == null:
		return
	health_input.value = player.survival.health
	hunger_input.value = player.survival.hunger
	warmth_input.value = player.survival.warmth


func _show_result(result: Dictionary) -> void:
	result_label.text = ("OK: " if result.ok else "ERROR: ") + str(result.message)
	result_label.add_theme_color_override("font_color", Color("b7ed97") if result.ok else Color("f39a8b"))


func _result(ok: bool, message: String) -> Dictionary:
	return {"ok": ok, "message": message}
