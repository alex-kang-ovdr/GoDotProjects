class_name CraftingPanel
extends CanvasLayer

var player: VoxelPlayer
var world: VoxelWorld
var opened := false
var selected := 0
var previous_mouse_mode := Input.MOUSE_MODE_CAPTURED
var overlay: ColorRect
var panel: PanelContainer
var recipe_buttons: Array[Button] = []
var preview: GridContainer
var preview_cells: Array[Label] = []
var detail: Label
var status: Label
var scroll: ScrollContainer
var craft_button: Button
var entries := CraftingRecipes.recipes()
var notice := "Select a recipe; Enter or Craft makes one batch."


func setup(target_player: VoxelPlayer, target_world: VoxelWorld) -> void:
	player = target_player
	world = target_world
	layer = 21
	overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = Color(0.015, 0.025, 0.04, 0.94)
	add_child(overlay)
	panel = PanelContainer.new()
	overlay.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)
	var title := Label.new()
	title.text = "CRAFTING  /  C or Esc closes"
	title.add_theme_font_size_override("font_size", 20)
	column.add_child(title)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	column.add_child(body)
	scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(270, 200)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	for index in entries.size():
		var button := Button.new()
		button.text = entries[index].name
		button.custom_minimum_size.y = 30
		button.add_theme_font_size_override("font_size", 13)
		button.clip_text = true
		button.pressed.connect(func() -> void:
			selected = index
			_refresh()
		)
		list.add_child(button)
		recipe_buttons.append(button)
	var right := VBoxContainer.new()
	right.custom_minimum_size.x = 270
	body.add_child(right)
	preview = GridContainer.new()
	preview.add_theme_constant_override("h_separation", 3)
	preview.add_theme_constant_override("v_separation", 3)
	right.add_child(preview)
	for unused in 9:
		var label := Label.new()
		label.custom_minimum_size = Vector2(64, 30)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 12)
		preview.add_child(label)
		preview_cells.append(label)
	detail = Label.new()
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.custom_minimum_size.x = 260
	detail.add_theme_font_size_override("font_size", 12)
	right.add_child(detail)
	craft_button = Button.new()
	craft_button.text = "Craft selected  [Enter]"
	craft_button.pressed.connect(craft_selected)
	column.add_child(craft_button)
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.custom_minimum_size.x = 540
	status.add_theme_font_size_override("font_size", 12)
	column.add_child(status)
	player.inventory.changed.connect(_refresh)
	get_viewport().size_changed.connect(_layout)
	_layout()
	overlay.hide()


func _layout() -> void:
	var stretch := get_viewport().get_stretch_transform().get_scale()
	scale = Vector2(1.0 / stretch.x, 1.0 / stretch.y)
	var available := get_viewport().get_visible_rect().size * stretch
	scroll.custom_minimum_size.y = 174 if available.y < 600 else 330
	panel.size = Vector2(minf(820, available.x - 24), 0)
	_center.call_deferred(available)


func _center(available: Vector2) -> void:
	panel.reset_size()
	panel.position = (available - panel.size) * 0.5


func set_open(value: bool) -> void:
	if value == opened: return
	if value and (player.controls_open or world.gameplay_locked()): return
	opened = value
	overlay.visible = value
	player.controls_open = value
	player.velocity = Vector3.ZERO
	player.cancel_mining()
	if value:
		previous_mouse_mode = Input.mouse_mode
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		_layout()
		_refresh()
	else: Input.mouse_mode = previous_mouse_mode


func craft_selected() -> void:
	if not opened or world.gameplay_locked(): return
	var result := CraftingRecipes.craft(player.inventory, str(entries[selected].id))
	notice = "Crafted " + str(entries[selected].name) if result.ok else str(result.error)
	_refresh()


func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_C and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
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
	match event.keycode:
		KEY_UP: selected = posmod(selected - 1, entries.size())
		KEY_DOWN: selected = (selected + 1) % entries.size()
		KEY_ENTER, KEY_KP_ENTER: craft_selected()
	_refresh()
	scroll.ensure_control_visible(recipe_buttons[selected])


func _refresh() -> void:
	if not opened: return
	var recipe: Dictionary = entries[selected]
	var grid := CraftingRecipes.canonical(recipe)
	preview.columns = int(recipe.size)
	for index in preview_cells.size():
		preview_cells[index].visible = index < grid.size()
		if index < grid.size():
			preview_cells[index].text = _short(ItemRegistry.definition(int(grid[index])).get("name", "·"))
	var needed := ""
	var requirements := CraftingRecipes.ingredients(recipe)
	for item: int in requirements:
		needed += "%s: %d / %d\n" % [ItemRegistry.definition(item).name, player.inventory.total(item), requirements[item]]
	var possible := CraftingRecipes.craft(player.inventory, str(recipe.id), false)
	detail.text = "%dx%d %s\n%s\n%s" % [recipe.size, recipe.size, "shapeless" if recipe.has("shapeless") else "shaped (mirror allowed)", needed, "READY" if possible.ok else possible.error]
	craft_button.disabled = not possible.ok
	status.text = notice + "\nUp/Down select. Tools: E then Q equips. 3x3 needs a carried workbench."
	for index in recipe_buttons.size():
		recipe_buttons[index].add_theme_color_override("font_color", Color("#f2ce73") if index == selected else Color.WHITE)


func _short(value: String) -> String:
	return value.replace("Oak planks", "Plank").replace("Oak log", "Log").replace("Cobblestone", "Cobble").replace("Iron ingot", "Iron")
