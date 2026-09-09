class_name GenerationControls
extends CanvasLayer

const ROWS := ["Mode", "Seed", "Size", "Room Attempts", "Generation Checks", "Show POI"]
var world: VoxelWorld
var player: VoxelPlayer
var panel: PanelContainer
var row_labels: Array[Label] = []
var status_label: Label
var compact_status: Label
var draft_seed := 1337
var draft_mode := "overworld"
var draft_room_attempts := 24
var draft_size := 41
var draft_checks := true
var draft_poi := false
var selected_row := 0
var opened := false
var editing_number := false
var number_buffer := ""
var notice := "Changes apply only with G; unsaved edits will be replaced"
var previous_mouse_mode := Input.MOUSE_MODE_CAPTURED
var active_poi := false
var pending_poi: Variant = null
var poi_root: Node3D


func setup(target_world: VoxelWorld, target_player: VoxelPlayer) -> void:
	world = target_world
	player = target_player
	draft_seed = world.world_seed
	draft_size = world.world_size
	draft_mode = world.layout.get("mode", "overworld")
	draft_room_attempts = world.layout.get("room_attempts", 24)
	layer = 10
	_build_panel()
	world.generation_completed.connect(_on_generated)
	world.generation_status_changed.connect(_refresh)
	poi_root = Node3D.new()
	poi_root.name = "POIMarkers"
	world.add_child(poi_root)
	_refresh()


func _input(event: InputEvent) -> void:
	if player.controls_open and not opened: return
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_TAB and not event.ctrl_pressed and not event.alt_pressed:
		set_open(not opened)
		get_viewport().set_input_as_handled()
		return
	if not opened: return
	get_viewport().set_input_as_handled()
	if editing_number:
		_edit_number(event)
		_refresh()
		return
	if event.keycode == KEY_ESCAPE:
		set_open(false)
		return
	if event.ctrl_pressed or event.alt_pressed or event.meta_pressed: return
	match event.keycode:
		KEY_UP: selected_row = posmod(selected_row - 1, ROWS.size())
		KEY_DOWN: selected_row = (selected_row + 1) % ROWS.size()
		KEY_LEFT: _adjust(-1)
		KEY_RIGHT: _adjust(1)
		KEY_PAGEUP: _adjust(10)
		KEY_PAGEDOWN: _adjust(-10)
		KEY_N:
			if (selected_row in [1, 2] or (selected_row == 3 and draft_mode == "dungeon")) and not world.generating:
				editing_number = true
				number_buffer = ""
		KEY_J:
			if not world.generating:
				var rng := RandomNumberGenerator.new()
				rng.randomize()
				draft_seed = rng.randi_range(-2147483648, 2147483647)
		KEY_G: apply_draft()
	_refresh()


func set_open(value: bool) -> void:
	if value and player.controls_open and not opened: return
	opened = value
	panel.visible = opened
	player.controls_open = opened
	player.velocity = Vector3.ZERO
	editing_number = false
	if opened:
		previous_mouse_mode = Input.mouse_mode
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	else:
		Input.mouse_mode = previous_mouse_mode
	_refresh()


func _adjust(direction: int) -> void:
	if world.generating: return
	match selected_row:
		0:
			draft_mode = "dungeon" if draft_mode == "overworld" else "overworld"
			draft_size = 41 if draft_mode == "dungeon" else 185
		1: draft_seed = clampi(draft_seed + direction, -2147483648, 2147483647)
		2: draft_size = clampi(draft_size + direction * 2, 11 if draft_mode == "dungeon" else 41, 255)
		3:
			if draft_mode == "dungeon": draft_room_attempts = clampi(draft_room_attempts + direction, 1, 512)
		4: draft_checks = not draft_checks
		5: draft_poi = not draft_poi


func _edit_number(event: InputEventKey) -> void:
	if event.keycode == KEY_ESCAPE:
		editing_number = false
		return
	if event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
		if not number_buffer.is_valid_int():
			notice = "Enter a signed integer"
			return
		var value := number_buffer.to_int()
		if selected_row == 1:
			if value < -2147483648 or value > 2147483647:
				notice = "Seed is outside signed int32"
				return
			draft_seed = value
		elif selected_row == 2:
			var minimum := 11 if draft_mode == "dungeon" else 41
			if value < minimum or value > 255:
				notice = "Size must be between %d and 255" % minimum
				return
			draft_size = value if value % 2 == 1 else value + 1
		elif selected_row == 3:
			if value < 1 or value > 512:
				notice = "Room attempts must be between 1 and 512"
				return
			draft_room_attempts = value
		editing_number = false
		notice = "Draft updated; press G to replace the current world"
		return
	if event.keycode == KEY_BACKSPACE:
		number_buffer = number_buffer.left(maxi(0, number_buffer.length() - 1))
	elif event.keycode == KEY_MINUS and selected_row == 1 and number_buffer.is_empty():
		number_buffer = "-"
	elif event.keycode >= KEY_0 and event.keycode <= KEY_9 and number_buffer.length() < 11:
		number_buffer += str(event.keycode - KEY_0)


func apply_draft() -> bool:
	if world.request_generation(draft_seed, draft_size, draft_checks, draft_mode, draft_room_attempts):
		pending_poi = draft_poi
		notice = "Generation requested; gameplay and saving locked"
		return true
	notice = world.generation_notice
	return false


func _process(_delta: float) -> void:
	if world.generating: _refresh()


func _on_generated(_summary: Dictionary) -> void:
	if pending_poi != null:
		active_poi = bool(pending_poi)
		pending_poi = null
	_refresh_poi()
	notice = "Applied; close with Tab or Escape to play"
	_refresh()


func _refresh_poi() -> void:
	for child in poi_root.get_children():
		poi_root.remove_child(child)
		child.queue_free()
	if not active_poi: return
	var points: Array = []
	if world.layout.get("mode", "overworld") == "dungeon":
		points = [{"anchor": world.layout.spawn, "name": "Entrance", "color": Color("#69dd8a")}, {"anchor": world.layout.exit, "name": "Exit", "color": Color("#ffc95a")}]
	else:
		for structure: Dictionary in world.layout.structures:
			points.append({"anchor": structure.anchor, "name": DeterministicWorldGenerator.BIOME_NAMES[structure.biome], "color": Color("#ffc95a")})
	for point: Dictionary in points:
		var marker := MeshInstance3D.new()
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.08
		mesh.bottom_radius = 0.08
		mesh.height = 3.0
		marker.mesh = mesh
		var material := StandardMaterial3D.new()
		material.albedo_color = point.color
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		marker.material_override = material
		marker.position = Vector3(point.anchor) + Vector3(0.5, 4.0, 0.5)
		marker.name = "POI_" + point.name
		poi_root.add_child(marker)


func _build_panel() -> void:
	var backdrop := ColorRect.new()
	backdrop.position = Vector2(650, 8)
	backdrop.size = Vector2(610, 86)
	backdrop.color = Color("#142431e8")
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(backdrop)
	compact_status = Label.new()
	compact_status.position = Vector2(668, 17)
	add_child(compact_status)
	panel = PanelContainer.new()
	panel.position = Vector2(650, 108)
	panel.size = Vector2(610, 390)
	panel.visible = false
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#142431f2")
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 8)
	panel.add_child(rows)
	var heading := Label.new()
	heading.text = "WORLD GENERATION  |  DRAFT"
	heading.add_theme_font_size_override("font_size", 21)
	rows.add_child(heading)
	for unused in ROWS.size():
		var label := Label.new()
		label.add_theme_font_size_override("font_size", 18)
		rows.add_child(label)
		row_labels.append(label)
	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.custom_minimum_size = Vector2(570, 80)
	rows.add_child(status_label)
	var help := Label.new()
	help.text = "Arrows change/select  |  PgUp/PgDn large step\nN number entry  |  J random seed  |  G apply\nTab/Esc close  |  G replaces unsaved world edits"
	help.add_theme_font_size_override("font_size", 15)
	rows.add_child(help)


func _refresh() -> void:
	if panel == null: return
	if world.generation_state == "FAIL":
		notice = world.generation_notice
		pending_poi = null
	compact_status.text = "%s %s  |  Checks %s  |  POI %s\nRun %d  |  %.2fs  |  %d%%\nTab settings  |  generation replaces unsaved edits" % [world.layout.get("mode", "overworld").capitalize(), world.generation_state, "ON" if world.generation_checks else "OFF", "ON" if active_poi else "OFF", world.generation_count, world.generation_elapsed_ms / 1000.0, int(world.generation_progress * 100)]
	var values := [draft_mode.capitalize(), str(draft_seed), str(draft_size), str(draft_room_attempts) if draft_mode == "dungeon" else "N/A (Dungeon only)", "ON" if draft_checks else "OFF", "ON" if draft_poi else "OFF"]
	for index in row_labels.size():
		var value: String = number_buffer + "_" if editing_number and index == selected_row else values[index]
		row_labels[index].text = "%s %s: %s" % [">" if index == selected_row else " ", ROWS[index], value]
		row_labels[index].modulate = Color("#ffdb89") if index == selected_row else Color.WHITE
	status_label.text = "%s  |  runs %d  |  %.2fs  |  %d%%\nChecks %s  |  Active POI %s\n%s" % [world.generation_state, world.generation_count, world.generation_elapsed_ms / 1000.0, int(world.generation_progress * 100), "ON" if world.generation_checks else "OFF", "ON" if active_poi else "OFF", world.generation_notice if world.generating else notice]
