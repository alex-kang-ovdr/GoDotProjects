class_name InventoryPanel
extends CanvasLayer

var player: VoxelPlayer
var world: VoxelWorld
var opened := false
var selected := 0
var previous_mouse_mode := Input.MOUSE_MODE_CAPTURED
var overlay: ColorRect
var panel: PanelContainer
var grid: GridContainer
var buttons: Array[Button] = []
var cursor_label: Label
var help_label: Label
var title_label: Label
var subtitle_label: Label
var column: VBoxContainer
var equipment_grid: VBoxContainer
var gear_buttons: Array[Button] = []
var gear_mode := false
var selected_gear := 0


func setup(target_player: VoxelPlayer, target_world: VoxelWorld) -> void:
	player = target_player
	world = target_world
	layer = 20
	overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = Color(0.015, 0.025, 0.04, 0.93)
	add_child(overlay)
	panel = PanelContainer.new()
	overlay.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(margin)
	column = VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)
	var title := Label.new()
	title_label = title
	title.text = "INVENTORY  /  36 SLOTS"
	title.add_theme_font_size_override("font_size", 22)
	column.add_child(title)
	var subtitle := Label.new()
	subtitle_label = subtitle
	subtitle.text = "Top row: hotbar 1–9   /   Remaining rows: backpack"
	subtitle.add_theme_font_size_override("font_size", 13)
	column.add_child(subtitle)
	grid = GridContainer.new()
	grid.columns = 9
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	column.add_child(grid)
	for slot in BlockInventory.SLOT_COUNT:
		var button := Button.new()
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.clip_text = true
		button.add_theme_font_size_override("font_size", 12)
		button.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
				selected = slot
				activate_selected(event.button_index == MOUSE_BUTTON_RIGHT)
				button.accept_event()
		)
		grid.add_child(button)
		buttons.append(button)
	equipment_grid = VBoxContainer.new()
	column.add_child(equipment_grid)
	for gear in BlockInventory.EQUIPMENT_COUNT:
		var button := Button.new()
		button.custom_minimum_size = Vector2(0, 48)
		button.pressed.connect(func() -> void:
			if opened and not world.gameplay_locked():
				player.inventory.click_equipment(gear)
				_refresh()
		)
		equipment_grid.add_child(button)
		gear_buttons.append(button)
	equipment_grid.hide()
	cursor_label = Label.new()
	cursor_label.add_theme_color_override("font_color", Color("#efce75"))
	cursor_label.add_theme_font_size_override("font_size", 15)
	column.add_child(cursor_label)
	help_label = Label.new()
	help_label.text = "LMB / Enter: whole stack, merge or swap\nRMB / Shift+Enter: take half or place one\nArrows: select   E / Esc: close   Ctrl+8 / Ctrl+9: save / load\nHeld items stay on the cursor when closed and are saved."
	help_label.add_theme_font_size_override("font_size", 13)
	column.add_child(help_label)
	player.inventory.changed.connect(_refresh)
	get_viewport().size_changed.connect(_layout)
	_layout()
	overlay.hide()
	_refresh()


func _layout() -> void:
	# Counteract project canvas stretch in this modal only. Other game HUDs retain
	# their existing layout; inventory text remains legible in a small window.
	var stretch := get_viewport().get_stretch_transform().get_scale()
	scale = Vector2(1.0 / stretch.x, 1.0 / stretch.y)
	var viewport_size := get_viewport().get_visible_rect().size * stretch
	var compact := viewport_size.y < 600
	var width := minf(900, viewport_size.x - 24)
	var cell_width := floorf((width - 24 - 32) / 9.0)
	for button in buttons:
		button.custom_minimum_size = Vector2(cell_width, 42 if compact else 68)
		button.add_theme_font_size_override("font_size", 11 if compact else 12)
	for button in gear_buttons:
		button.custom_minimum_size.y = 36 if compact else 48
		button.add_theme_font_size_override("font_size", 13 if compact else 16)
	column.add_theme_constant_override("separation", 5 if compact else 8)
	title_label.add_theme_font_size_override("font_size", 18 if compact else 22)
	subtitle_label.add_theme_font_size_override("font_size", 11 if compact else 13)
	help_label.add_theme_font_size_override("font_size", 11 if compact else 13)
	cursor_label.add_theme_font_size_override("font_size", 13 if compact else 15)
	help_label.text = "LMB / Enter: whole, merge, swap   RMB / Shift+Enter: half / one\nArrows: select   E / Esc: close   Ctrl+8 / Ctrl+9: save / load\nHeld cursor items are retained when closed and saved."
	panel.size = Vector2(width, 0)
	panel.reset_size()
	_center.call_deferred(viewport_size)


func _center(viewport_size: Vector2) -> void:
	panel.size = panel.get_combined_minimum_size()
	panel.position = (viewport_size - panel.size) * 0.5


func set_open(value: bool) -> void:
	if value == opened: return
	if value and (player.controls_open or world.gameplay_locked()): return
	opened = value
	if value:
		gear_mode = false
		grid.show()
		equipment_grid.hide()
	overlay.visible = value
	player.controls_open = value
	player.velocity = Vector3.ZERO
	player.cancel_mining()
	if value:
		previous_mouse_mode = Input.mouse_mode
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		_layout()
	else:
		Input.mouse_mode = previous_mouse_mode
	_refresh()


func activate_selected(half: bool = false) -> void:
	if not opened or world.gameplay_locked(): return
	player.inventory.click(selected, half)
	_refresh()


func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_E and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
		set_open(not opened)
		get_viewport().set_input_as_handled()
		return
	if not opened: return
	get_viewport().set_input_as_handled()
	if event.keycode == KEY_ESCAPE:
		set_open(false)
		return
	if world.gameplay_locked(): return
	if event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
		if event.keycode == KEY_8: world.save_game(player)
		elif event.keycode == KEY_9: world.load_game(player)
		return
	if event.ctrl_pressed or event.alt_pressed or event.meta_pressed: return
	match event.keycode:
		KEY_F:
			gear_mode = not gear_mode
			grid.visible = not gear_mode
			equipment_grid.visible = gear_mode
			_layout()
		KEY_Q: player.inventory.equip_from_slot(selected, 0)
		KEY_LEFT, KEY_UP:
			if gear_mode: selected_gear = posmod(selected_gear - 1, BlockInventory.EQUIPMENT_COUNT)
			else: selected = posmod(selected - (9 if event.keycode == KEY_UP else 1), BlockInventory.SLOT_COUNT)
		KEY_RIGHT, KEY_DOWN:
			if gear_mode: selected_gear = (selected_gear + 1) % BlockInventory.EQUIPMENT_COUNT
			else: selected = (selected + (9 if event.keycode == KEY_DOWN else 1)) % BlockInventory.SLOT_COUNT
		KEY_ENTER, KEY_KP_ENTER:
			if gear_mode: player.inventory.click_equipment(selected_gear)
			else: activate_selected(event.shift_pressed)
	_refresh()


func _refresh() -> void:
	if not opened or not is_instance_valid(player): return
	title_label.text = "EQUIPMENT  /  1 ACTIVE + 3 SPARES" if gear_mode else "INVENTORY  /  36 SLOTS"
	subtitle_label.text = "Active tool determines mining speed. Spares are not used automatically." if gear_mode else "Top row: hotbar 1–9   /   Remaining rows: backpack"
	for slot in buttons.size():
		var item := player.inventory.item_at(slot)
		var definition := ItemRegistry.definition(item)
		var item_name := str(definition.get("name", "Empty"))
		buttons[slot].text = "%02d %s\n%s" % [slot + 1, _short_name(item_name), "%d/%d" % [player.inventory.durability[slot], definition.durability] if ItemRegistry.is_tool_item(item) else "×%d" % player.inventory.count(slot)]
		buttons[slot].tooltip_text = item_name
		var style := StyleBoxFlat.new()
		style.bg_color = Color("#685b32") if slot == selected else Color("#243648")
		style.set_border_width_all(2)
		style.content_margin_top = 3
		style.content_margin_bottom = 3
		style.content_margin_left = 2
		style.content_margin_right = 2
		style.border_color = Color("#efce75") if slot == selected else Color("#536a7b")
		buttons[slot].add_theme_stylebox_override("normal", style)
	var cursor_item := int(player.inventory.cursor[0])
	cursor_label.text = "CURSOR: %s ×%d%s" % [ItemRegistry.definition(cursor_item).get("name", "Empty"), player.inventory.cursor[1], " (%d wear left)" % player.inventory.cursor[2] if player.inventory.cursor.size() == 3 else ""]
	for gear in gear_buttons.size():
		var stack: Array = player.inventory.equipment[gear]
		gear_buttons[gear].text = "%s: %s%s" % ["ACTIVE TOOL" if gear == 0 else "SPARE %d" % gear, ItemRegistry.definition(int(stack[0])).get("name", "Empty"), "  %d durability" % stack[2] if stack.size() == 3 else ""]
		gear_buttons[gear].add_theme_color_override("font_color", Color("#efce75") if gear == selected_gear else Color.WHITE)
	help_label.text = ("LMB / Enter: swap with cursor   Arrows: select equipment\nF: inventory view   E / Esc: close" if gear_mode else "LMB / Enter: whole, merge, swap   RMB / Shift+Enter: half / one\nF: equipment view   Q: equip selected to active   E / Esc: close") + "\nCtrl+8 / Ctrl+9: save / load   Held cursor items are saved."


func _short_name(value: String) -> String:
	return value.replace("Cobblestone", "Cobble").replace("Mossy cobblestone", "Moss").replace("Stone bricks", "Brick").replace("Oak planks", "Plank").replace("Grass block", "Grass").replace("Snow block", "Snow").replace("Oak log", "Log")
