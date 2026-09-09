class_name StationPanel
extends CanvasLayer

var player: VoxelPlayer
var world: VoxelWorld
var opened := false
var cell := Vector3i.ZERO
var bag_mode := false
var selected := 0
var previous_mouse_mode := Input.MOUSE_MODE_CAPTURED
var overlay: ColorRect
var panel: PanelContainer
var column: VBoxContainer
var title: Label
var info: Label
var cursor_label: Label
var help_label: Label
var grid: GridContainer
var buttons: Array[Button] = []


func setup(target_player: VoxelPlayer, target_world: VoxelWorld) -> void:
	player = target_player
	world = target_world
	layer = 22
	overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = Color(0.015, 0.025, 0.04, 0.96)
	add_child(overlay)
	panel = PanelContainer.new()
	overlay.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(margin)
	column = VBoxContainer.new()
	margin.add_child(column)
	title = Label.new()
	column.add_child(title)
	info = Label.new()
	column.add_child(info)
	grid = GridContainer.new()
	grid.columns = 9
	column.add_child(grid)
	for slot in 36:
		var button := Button.new()
		button.clip_text = true
		button.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
				selected = slot
				activate(event.button_index == MOUSE_BUTTON_RIGHT)
				button.accept_event()
		)
		grid.add_child(button)
		buttons.append(button)
	cursor_label = Label.new()
	cursor_label.add_theme_color_override("font_color", Color("#efce75"))
	column.add_child(cursor_label)
	help_label = Label.new()
	help_label.text = "B: switch bag / station   Arrows: select   LMB / Enter: whole / swap\nRMB / Shift+Enter: half / one   X / Esc: close   Ctrl+8 / 9: save / load"
	column.add_child(help_label)
	player.inventory.changed.connect(_refresh)
	world.stations.changed.connect(_refresh)
	get_viewport().size_changed.connect(_layout)
	_layout()
	overlay.hide()


func _process(_delta: float) -> void:
	if opened and (world.stations.target_cell(player) != cell or world.generating): set_open(false)


func set_open(value: bool) -> void:
	if value == opened: return
	if value:
		if player.controls_open or world.gameplay_locked(): return
		var target: Variant = world.stations.target_cell(player)
		if target == null:
			world.action_feedback.emit("Look at a placed chest or furnace within reach; X opens it")
			return
		cell = target
		bag_mode = false
		selected = 0
		previous_mouse_mode = Input.mouse_mode
	opened = value
	overlay.visible = value
	player.controls_open = value
	player.velocity = Vector3.ZERO
	player.cancel_mining()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if value else previous_mouse_mode
	if value:
		_refresh()
		_layout()


func activate(half: bool = false) -> void:
	if not opened or world.gameplay_locked() or world.stations.target_cell(player) != cell: return
	if bag_mode: player.inventory.click(selected, half)
	else: world.stations.click(cell, selected, player.inventory, half)
	_refresh()


func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_X and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
		if player.controls_open and not opened: return
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
	var count_value: int = 36 if bag_mode else world.chunk_store.stations[cell].slots.size()
	match event.keycode:
		KEY_B:
			bag_mode = not bag_mode
			selected = 0
			_refresh()
			_layout()
		KEY_LEFT: selected = posmod(selected - 1, count_value)
		KEY_RIGHT: selected = (selected + 1) % count_value
		KEY_UP: selected = posmod(selected - grid.columns, count_value)
		KEY_DOWN: selected = (selected + grid.columns) % count_value
		KEY_ENTER, KEY_KP_ENTER: activate(event.shift_pressed)
	_refresh()


func _refresh() -> void:
	if not opened or not world.chunk_store.stations.has(cell): return
	var state: Dictionary = world.chunk_store.stations[cell]
	var furnace := int(state.kind) == ItemRegistry.FURNACE
	title.text = "%s / %s  @ %d, %d, %d" % ["FURNACE" if furnace else "CHEST", "YOUR BAG" if bag_mode else "STORAGE", cell.x, cell.y, cell.z]
	info.text = "Input: raw iron   Fuel: coal   Output: iron ingot | %d/200 cook, %d/1600 burn" % [state.cook, state.burn] if furnace else "27 slots. Empty the chest before mining. Cursor is retained on close."
	grid.columns = 3 if furnace and not bag_mode else 9
	for slot in 36:
		buttons[slot].visible = bag_mode or slot < state.slots.size()
		if not buttons[slot].visible: continue
		var stack: Array = player.inventory.stack_at(slot) if bag_mode else state.slots[slot]
		var item_name: String = ItemRegistry.definition(int(stack[0])).get("name", "Empty")
		var prefix: String = ["INPUT", "FUEL", "OUTPUT"][slot] if furnace and not bag_mode else "%02d" % [slot + 1]
		buttons[slot].text = "%s %s\n%s" % [prefix, item_name, "%d wear" % stack[2] if stack.size() == 3 else "x%d" % stack[1]]
		buttons[slot].tooltip_text = item_name
		buttons[slot].add_theme_color_override("font_color", Color("#efce75") if slot == selected else Color.WHITE)
	var cursor := player.inventory.cursor
	cursor_label.text = "CURSOR: %s x%d%s" % [ItemRegistry.definition(cursor[0]).get("name", "Empty"), cursor[1], " (%d wear)" % cursor[2] if cursor.size() == 3 else ""]


func _layout() -> void:
	var stretch := get_viewport().get_stretch_transform().get_scale()
	scale = Vector2(1.0 / stretch.x, 1.0 / stretch.y)
	var available := get_viewport().get_visible_rect().size * stretch
	var compact := available.y < 600
	var width := minf(1000, available.x - 24)
	for button in buttons:
		button.custom_minimum_size = Vector2(floorf((width - 24 - 32) / 9), 42 if compact else 64)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 11 if compact else 13)
	title.add_theme_font_size_override("font_size", 17 if compact else 22)
	for label in [info, help_label, cursor_label]: label.add_theme_font_size_override("font_size", 11 if compact else 13)
	panel.size = Vector2(width, 0)
	_center.call_deferred(available)


func _center(available: Vector2) -> void:
	panel.reset_size()
	panel.position = (available - panel.size) * 0.5
