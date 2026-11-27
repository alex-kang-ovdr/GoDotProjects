class_name ColonyBoard
extends Control

signal tile_clicked(cell: Vector2i, button: int, additive: bool)
signal zone_dragged(from_cell: Vector2i, to_cell: Vector2i)

const VOID := Color("#222720")
const AMBER := Color("#f2d49a")
const IVORY := Color("#f5eacf")
const INK := Color("#293126")
const NO_CELL := Vector2i(-1, -1)
const FARMS := ["farm", "zone:farm"]
const STOCKPILES := ["stockpile", "zone:stockpile"]
const CONDUCTORS := ["conduit", "solar", "battery"]
const CONSUMERS := ["heater", "cooler", "beacon"]
const BATTERY_CAPACITY := 18000.0

var overlay: String = "":
	set(value):
		overlay = value
		queue_redraw()
var grid_visible: bool = false:
	set(value):
		grid_visible = value
		queue_redraw()

var _state: Dictionary = {}
var _selected: Dictionary = {}
var _tool := "select"
var _center := Vector2(23.5, 15.6)
var _zoom := 1.0
var _hover := NO_CELL
var _zone_origin := NO_CELL
var _zone_end := NO_CELL
var _panning := false
var _clock := 0.0
var _next_frame := 0.0


func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_exited.connect(_on_mouse_exited)
	resized.connect(queue_redraw)


func set_state(state: Dictionary) -> void:
	_state = state
	queue_redraw()


func set_tool(tool: String) -> void:
	if _tool != tool:
		_zone_origin = NO_CELL
		_zone_end = NO_CELL
	_tool = tool
	mouse_default_cursor_shape = Control.CURSOR_ARROW if tool == "select" else Control.CURSOR_CROSS
	queue_redraw()


func set_selected(ids: Array) -> void:
	_selected.clear()
	for id in ids:
		_selected[id] = true
	queue_redraw()


func center_colony() -> void:
	_center = Vector2(23.5, 15.6)
	_zoom = 1.0
	_clamp_camera()
	queue_redraw()


func zoom_by(multiplier: float) -> void:
	_zoom_at(multiplier, size * 0.5)


func _process(delta: float) -> void:
	_clock += delta
	if _clock >= _next_frame:
		_next_frame = _clock + 0.05
		queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if _panning:
			_center -= event.relative / _scale()
			_clamp_camera()
		_hover = _cell_at(event.position)
		if _zone_origin != NO_CELL:
			_zone_end = _cell_at(event.position, true)
		queue_redraw()
		accept_event()
	elif event is InputEventMouseButton:
		_handle_button(event)


func _handle_button(event: InputEventMouseButton) -> void:
	match event.button_index:
		MOUSE_BUTTON_MIDDLE:
			_panning = event.pressed
			mouse_default_cursor_shape = Control.CURSOR_DRAG if _panning else (Control.CURSOR_ARROW if _tool == "select" else Control.CURSOR_CROSS)
		MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN:
			if event.pressed:
				_zoom_at(1.15 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.15, event.position)
		MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT:
			var cell := _cell_at(event.position)
			if event.button_index == MOUSE_BUTTON_LEFT and _is_zone_tool():
				if event.pressed:
					_zone_origin = cell
					_zone_end = cell
				elif _zone_origin != NO_CELL:
					zone_dragged.emit(_zone_origin, _cell_at(event.position, true))
					_zone_origin = NO_CELL
					_zone_end = NO_CELL
			elif event.pressed and cell != NO_CELL:
				tile_clicked.emit(cell, event.button_index, event.shift_pressed or event.ctrl_pressed)
		_:
			return
	queue_redraw()
	accept_event()


func _on_mouse_exited() -> void:
	_hover = NO_CELL
	if not Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
		_panning = false
	queue_redraw()


func _is_zone_tool() -> bool:
	return _tool in FARMS or _tool in STOCKPILES


func _dimensions() -> Vector2i:
	return Vector2i(int(_state.get("width", 48)), int(_state.get("height", 32)))


func _scale() -> float:
	return clampf(size.y / 19.0, 29.0, 38.0) * _zoom


func _zoom_at(multiplier: float, anchor: Vector2) -> void:
	if multiplier <= 0.0:
		return
	var offset := anchor - size * 0.5
	var world := _center + offset / _scale()
	_zoom = clampf(_zoom * multiplier, 0.45, 2.5)
	_center = world - offset / _scale()
	_clamp_camera()
	_hover = _cell_at(anchor)
	queue_redraw()


func _clamp_camera() -> void:
	var bounds := Vector2(_dimensions())
	var half := size / (_scale() * 2.0)
	_center.x = clampf(_center.x, half.x - 1.0, bounds.x - half.x + 1.0) if half.x < bounds.x * 0.5 else bounds.x * 0.5
	_center.y = clampf(_center.y, half.y - 1.0, bounds.y - half.y + 1.0) if half.y < bounds.y * 0.5 else bounds.y * 0.5


func _cell_at(point: Vector2, clamp_to_map: bool = false) -> Vector2i:
	var world := _center + (point - size * 0.5) / _scale()
	var cell := Vector2i(world.floor())
	var dims := _dimensions()
	if clamp_to_map:
		return cell.clamp(Vector2i.ZERO, dims - Vector2i.ONE)
	return cell if Rect2i(Vector2i.ZERO, dims).has_point(cell) else NO_CELL


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), VOID)
	var tiles: Array = _state.get("tiles", [])
	var dims := _dimensions()
	if tiles.size() != dims.x * dims.y:
		return
	var scale := _scale()
	var origin := size * 0.5 - _center * scale
	var start := _cell_at(Vector2.ZERO, true)
	var end := _cell_at(size, true)
	draw_set_transform(origin, 0.0, Vector2.ONE * scale)
	var region := Rect2i(start, end - start + Vector2i.ONE).grow(1).intersection(Rect2i(Vector2i.ZERO, dims))
	for y in range(region.position.y, region.end.y):
		for x in range(region.position.x, region.end.x):
			var cell := Vector2i(x, y)
			_draw_ground(cell, tiles[y * dims.x + x], tiles, dims)
	for y in range(region.position.y, region.end.y):
		for x in range(region.position.x, region.end.x):
			var cell := Vector2(x, y)
			var tile: Dictionary = tiles[y * dims.x + x]
			_draw_tile_contents(cell, tile)
	if overlay == "power":
		_draw_power(tiles, dims, region)
	for actor in _state.get("colonists", []):
		if _selected.has(actor.get("id", "")):
			_draw_route(actor)
	for item in _state.get("items", []):
		var cell := Vector2i(int(item.get("x", 0)), int(item.get("y", 0)))
		if region.has_point(cell):
			_draw_resource(Vector2(cell) + Vector2(0.52, 0.56), str(item.get("type", "")), 0.26)
	var actors: Array = _state.get("colonists", []).duplicate()
	actors.append_array(_state.get("raiders", []))
	actors.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.get("y", 0)) < float(b.get("y", 0)))
	var raiders: Array = _state.get("raiders", [])
	for actor in actors:
		var location := Vector2(float(actor.get("x", 0)), float(actor.get("y", 0)))
		if region.has_point(Vector2i(location.floor())):
			_draw_pawn(actor, location, actor in raiders)
	for effect in _state.get("effects", []):
		_draw_effect(effect)
	_draw_target()
	draw_set_transform(Vector2.ZERO)
	if Rect2i(Vector2i.ZERO, dims).has_point(_hover):
		_draw_coordinate(_hover, tiles[_hover.y * dims.x + _hover.x])


func _noise(x: int, y: int, channel: int = 0) -> float:
	var sample := x * 173 + y * 919 + channel * 3091
	sample = ((sample ^ (sample >> 11)) * 15485863) & 0x7fffffff
	return float((sample ^ (sample >> 17)) & 1023) / 1023.0


func _water_at(cell: Vector2i, tiles: Array, dims: Vector2i) -> bool:
	return Rect2i(Vector2i.ZERO, dims).has_point(cell) and tiles[cell.y * dims.x + cell.x].get("terrain") == "water"


func _draw_ground(cell: Vector2i, tile: Dictionary, tiles: Array, dims: Vector2i) -> void:
	var pos := Vector2(cell)
	var terrain = tile.get("terrain", "grass")
	var noise := _noise(cell.x, cell.y)
	var patch := (sin(cell.x * 0.38 + cell.y * 0.16) + cos(cell.y * 0.47 - cell.x * 0.19)) * 0.028
	var shade := Color("#879064").lerp(Color("#68764d"), 0.28 + noise * 0.27 + patch * 4.0)
	match terrain:
		"water":
			shade = Color("#396669").lerp(Color("#2d5359"), noise * 0.40)
		"stone":
			shade = Color("#838579").lerp(Color("#686e61"), noise * 0.65)
		"soil":
			shade = Color("#93805c").lerp(Color("#807151"), noise * 0.65)
	if tile.get("roofed", false):
		shade = Color("#70674f")
	if tile.get("burned", false):
		shade = shade.lerp(Color("#49473d"), 0.62)
	draw_rect(Rect2(pos, Vector2.ONE * 1.011), shade)
	var zone = tile.get("zone")
	if zone == "farm":
		draw_rect(Rect2(pos + Vector2.ONE * 0.035, Vector2.ONE * 0.93), Color("#6a543a"))
		for row in range(4):
			var y := 0.15 + row * 0.22
			_stroke(pos, Vector2(0.06, y), Vector2(0.94, y + 0.02), Color("#9a7c4b"), 0.045)
	elif zone == "stockpile":
		draw_rect(Rect2(pos + Vector2.ONE * 0.04, Vector2.ONE * 0.92), Color("#62736a"))
		draw_rect(Rect2(pos + Vector2.ONE * 0.065, Vector2.ONE * 0.87), Color("#9bab92"), false, 0.025)
		_stroke(pos, Vector2(0.12, 0.78), Vector2(0.78, 0.12), Color("#819186"), 0.035)
		_stroke(pos, Vector2(0.35, 0.88), Vector2(0.88, 0.35), Color("#819186"), 0.035)
	elif terrain == "water":
		_draw_water(cell, tiles, dims, noise)
	elif tile.get("roofed", false):
		for index in range(4):
			var y := 0.1 + index * 0.25
			_stroke(pos, Vector2(0.0, y), Vector2(1.0, y), Color("#857458"), 0.023)
	elif terrain == "stone":
		_stroke(pos, Vector2(0.03, 0.39), Vector2(0.45, 0.51), shade.darkened(0.18), 0.025)
		_stroke(pos, Vector2(0.45, 0.51), Vector2(0.94, 0.25), shade.darkened(0.18), 0.025)
	else:
		_draw_ground_marks(cell, shade, terrain == "grass")
	if overlay == "temperature":
		var temperature := float(tile.get("temperature", _state.get("outsideTemperature", 19.0)))
		var transparent_heat := Color("#4fa8d7").lerp(Color("#e2a14b"), inverse_lerp(0.0, 32.0, clampf(temperature, 0.0, 32.0)))
		transparent_heat.a = 0.42 if tile.get("roofed", false) else 0.21
		draw_rect(Rect2(pos, Vector2.ONE), transparent_heat)
	if grid_visible:
		draw_rect(Rect2(pos, Vector2.ONE), Color(0.08, 0.11, 0.09, 0.27), false, 0.024)


func _draw_ground_marks(cell: Vector2i, shade: Color, grass: bool) -> void:
	var pos := Vector2(cell)
	for index in range(3):
		var point := Vector2(_noise(cell.x, cell.y, index + 2), _noise(cell.x, cell.y, index + 8))
		if grass:
			_stroke(pos, point, point + Vector2(-0.034, -0.088), shade.lightened(0.18), 0.024)
			if index == 1:
				_stroke(pos, point, point + Vector2(0.058, -0.06), shade.darkened(0.21), 0.021)
		else:
			draw_circle(pos + point, 0.025, shade.darkened(0.15))
	if _noise(cell.x, cell.y, 18) > 0.97:
		draw_circle(pos + Vector2(0.45, 0.56), 0.035, Color("#ddcd92"), true, -1.0, true)
		draw_circle(pos + Vector2(0.56, 0.47), 0.023, Color("#ddcd92"), true, -1.0, true)


func _draw_water(cell: Vector2i, tiles: Array, dims: Vector2i, noise: float) -> void:
	var pos := Vector2(cell)
	var sand := Color("#7c8a68")
	var foam := Color("#8caca0")
	if not _water_at(cell + Vector2i.UP, tiles, dims):
		_stroke(pos, Vector2.ZERO, Vector2.RIGHT, sand, 0.10)
		_stroke(pos, Vector2(0.08, 0.09), Vector2(0.92, 0.09), foam, 0.025)
	if not _water_at(cell + Vector2i.DOWN, tiles, dims):
		_stroke(pos, Vector2.DOWN, Vector2.ONE, sand, 0.10)
	if not _water_at(cell + Vector2i.LEFT, tiles, dims):
		_stroke(pos, Vector2.ZERO, Vector2.DOWN, sand, 0.10)
		_stroke(pos, Vector2(0.09, 0.08), Vector2(0.09, 0.91), foam, 0.025)
	if not _water_at(cell + Vector2i.RIGHT, tiles, dims):
		_stroke(pos, Vector2.RIGHT, Vector2.ONE, sand, 0.10)
	var shift := sin(_clock * 0.8 + cell.y * 0.52 + noise * TAU) * 0.07
	_stroke(pos, Vector2(0.22, 0.31 + shift), Vector2(0.62, 0.29 + shift), Color(0.55, 0.68, 0.63, 0.4), 0.025)
	_stroke(pos, Vector2(0.41, 0.72 - shift), Vector2(0.79, 0.69 - shift), Color(0.63, 0.73, 0.67, 0.31), 0.022)


func _draw_tile_contents(pos: Vector2, tile: Dictionary) -> void:
	var feature = tile.get("feature")
	if feature == "tree":
		_draw_tree(pos, _noise(int(pos.x), int(pos.y), 11))
	elif feature == "berry":
		_draw_berry(pos)
	elif feature == "ore":
		_draw_ore(pos)
	var crop = tile.get("crop")
	if crop is Dictionary:
		_draw_crop(pos, float(crop.get("growth", 0.0)))
	var building = tile.get("building")
	if building is Dictionary:
		if building.get("complete", false):
			_draw_structure(pos, building)
		else:
			_draw_blueprint(pos, building)
	if tile.get("designation") != null:
		_draw_designation(pos, str(tile["designation"]))
	var fire := float(tile.get("fire", 0.0))
	if fire > 0.0:
		_draw_fire(pos, fire)


func _draw_tree(pos: Vector2, seed: float) -> void:
	var tint := Color("#3d5940").lerp(Color("#5c6a43"), seed)
	var leaf := Color("#718754").lerp(Color("#99a262"), seed)
	_poly(pos, [Vector2(0.17, 0.71), Vector2(0.68, 0.49), Vector2(1.05, 0.75), Vector2(0.75, 0.99)], Color(0.17, 0.23, 0.16, 0.32))
	_stroke(pos, Vector2(0.47, 0.75), Vector2(0.53, 0.37), Color("#5a4b36"), 0.12)
	_poly(pos, [Vector2(0.08, 0.55), Vector2(0.16, 0.31), Vector2(0.34, 0.24), Vector2(0.44, 0.09), Vector2(0.68, 0.12), Vector2(0.84, 0.28), Vector2(0.92, 0.54), Vector2(0.76, 0.75), Vector2(0.55, 0.8), Vector2(0.24, 0.73)], tint.darkened(0.16))
	_poly(pos, [Vector2(0.14, 0.47), Vector2(0.21, 0.28), Vector2(0.46, 0.16), Vector2(0.62, 0.16), Vector2(0.8, 0.27), Vector2(0.84, 0.49), Vector2(0.69, 0.66), Vector2(0.47, 0.72), Vector2(0.27, 0.61)], tint)
	_poly(pos, [Vector2(0.23, 0.43), Vector2(0.34, 0.25), Vector2(0.52, 0.17), Vector2(0.71, 0.27), Vector2(0.66, 0.43), Vector2(0.49, 0.49), Vector2(0.40, 0.60)], leaf)
	_stroke(pos, Vector2(0.48, 0.48), Vector2(0.59, 0.62), tint.lightened(0.19), 0.035)
	_stroke(pos, Vector2(0.21, 0.45), Vector2(0.34, 0.31), leaf.lightened(0.20), 0.032)


func _draw_berry(pos: Vector2) -> void:
	draw_circle(pos + Vector2(0.54, 0.60), 0.33, Color("#435745"))
	draw_circle(pos + Vector2(0.37, 0.46), 0.21, Color("#66794f"))
	draw_circle(pos + Vector2(0.61, 0.39), 0.20, Color("#708453"))
	draw_circle(pos + Vector2(0.69, 0.59), 0.17, Color("#536e4e"))
	for berry in [Vector2(0.31, 0.45), Vector2(0.47, 0.62), Vector2(0.69, 0.50), Vector2(0.58, 0.31)]:
		draw_circle(pos + berry, 0.063, Color("#bd775c"), true, -1.0, true)
		draw_circle(pos + berry - Vector2.ONE * 0.017, 0.023, Color("#e7ab78"))


func _draw_ore(pos: Vector2) -> void:
	_poly(pos, [Vector2(0.09, 0.66), Vector2(0.22, 0.29), Vector2(0.55, 0.17), Vector2(0.80, 0.35), Vector2(0.91, 0.69), Vector2(0.74, 0.82), Vector2(0.35, 0.88)], Color("#515b58"))
	_poly(pos, [Vector2(0.14, 0.65), Vector2(0.25, 0.30), Vector2(0.54, 0.18), Vector2(0.60, 0.49), Vector2(0.42, 0.65)], Color("#a2a18b"))
	_poly(pos, [Vector2(0.54, 0.18), Vector2(0.78, 0.35), Vector2(0.87, 0.65), Vector2(0.61, 0.49)], Color("#838f86"))
	_stroke(pos, Vector2(0.23, 0.59), Vector2(0.45, 0.44), Color("#ddd0a2"), 0.048)
	_stroke(pos, Vector2(0.45, 0.44), Vector2(0.68, 0.59), Color("#bcad84"), 0.039)


func _draw_crop(pos: Vector2, growth: float) -> void:
	var reach := lerpf(0.09, 0.23, growth)
	var leaf := Color("#87a262").lerp(Color("#d3b85b"), growth)
	for center in [Vector2(0.30, 0.44), Vector2(0.68, 0.47), Vector2(0.46, 0.79)]:
		var plant: Vector2 = center
		_stroke(pos, plant, plant + Vector2(0.02, -reach), leaf.darkened(0.2), 0.035)
		_stroke(pos, plant + Vector2(0.01, -reach * 0.4), plant + Vector2(-reach * 0.42, -reach * 0.83), leaf, 0.039)
		_stroke(pos, plant + Vector2(0.01, -reach * 0.5), plant + Vector2(reach * 0.43, -reach * 0.86), leaf, 0.036)
		if growth > 0.70:
			draw_circle(pos + plant + Vector2(0.02, -reach), 0.041, AMBER)

func _draw_structure(pos: Vector2, building: Dictionary) -> void:
	var kind := str(building.get("type", "wall"))
	match kind:
		"wall":
			_panel(pos, Rect2(0.0, 0.06, 1.0, 0.88), Color("#7a5d42"), Color("#af8e62"))
			_stroke(pos, Vector2(0.0, 0.54), Vector2(1.0, 0.54), Color("#584c3d"), 0.048)
			_stroke(pos, Vector2(0.20, 0.14), Vector2(0.20, 0.54), Color("#64543f"), 0.036)
			_stroke(pos, Vector2(0.66, 0.54), Vector2(0.66, 0.85), Color("#64543f"), 0.041)
		"door":
			_panel(pos, Rect2(0.06, 0.10, 0.88, 0.78), Color("#4c4c3a"), Color("#ad885e"))
			_panel(pos, Rect2(0.20, 0.17, 0.60, 0.64), Color("#8a6b48"), Color("#c5a16c"))
			for x in [0.35, 0.59]:
				_stroke(pos, Vector2(x, 0.22), Vector2(x, 0.76), Color("#634d39"), 0.030)
			draw_circle(pos + Vector2(0.70, 0.48), 0.047, AMBER)
		"bed":
			_panel(pos, Rect2(0.15, 0.04, 0.70, 0.91), Color("#403e34"), Color("#b89b70"))
			draw_rect(Rect2(pos + Vector2(0.23, 0.13), Vector2(0.54, 0.25)), Color("#ddca9c"))
			draw_rect(Rect2(pos + Vector2(0.23, 0.41), Vector2(0.54, 0.42)), Color("#82928a"))
			_stroke(pos, Vector2(0.25, 0.53), Vector2(0.75, 0.53), Color("#b9bc9c"), 0.045)
			if building.get("medical", false):
				_cross(pos + Vector2(0.5, 0.65), 0.105, IVORY)
		"sandbag":
			for x in [0.12, 0.39, 0.66]:
				_panel(pos, Rect2(x, 0.30, 0.25, 0.43), Color("#a39571"), Color("#c8b98d"))
		"stove":
			_panel(pos, Rect2(0.1, 0.12, 0.80, 0.74), Color("#5e665d"), Color("#9ba093"))
			for burner in [Vector2(0.32, 0.39), Vector2(0.69, 0.39)]:
				draw_circle(pos + burner, 0.13, INK, true, -1.0, true)
				draw_arc(pos + burner, 0.079, 0.0, TAU, 12, Color("#be8a58"), 0.027, true)
			draw_rect(Rect2(pos + Vector2(0.21, 0.61), Vector2(0.58, 0.14)), Color("#464b43"))
		"researchbench", "workbench":
			_panel(pos, Rect2(0.08, 0.13, 0.84, 0.76), Color("#80684a"), Color("#bfa170"))
			if kind == "researchbench":
				draw_rect(Rect2(pos + Vector2(0.16, 0.30), Vector2(0.39, 0.39)), Color("#ceb98a"))
				for row in range(3):
					_stroke(pos, Vector2(0.22, 0.38 + row * 0.1), Vector2(0.48, 0.38 + row * 0.1), Color("#77775e"), 0.019)
				_stroke(pos, Vector2(0.68, 0.31), Vector2(0.79, 0.63), Color("#abccba"), 0.12)
			else:
				_stroke(pos, Vector2(0.22, 0.64), Vector2(0.59, 0.31), Color("#b6b2a0"), 0.095)
				_stroke(pos, Vector2(0.52, 0.28), Vector2(0.68, 0.44), Color("#555b53"), 0.095)
				draw_circle(pos + Vector2(0.73, 0.59), 0.096, Color("#c0aa75"))
		"horseshoes":
			draw_arc(pos + Vector2(0.52, 0.54), 0.29, 0.30, TAU - 0.30, 20, Color("#c5a379"), 0.075, true)
			draw_circle(pos + Vector2(0.52, 0.50), 0.10, Color("#74614f"))
			draw_circle(pos + Vector2(0.50, 0.46), 0.041, Color("#be9f70"))
		"conduit":
			draw_circle(pos + Vector2(0.5, 0.5), 0.15, Color("#4a554d"))
			_cross(pos + Vector2(0.5, 0.5), 0.097, Color("#b2a36e"))
		"solar":
			_panel(pos, Rect2(0.08, 0.14, 0.84, 0.71), Color("#435c62"), Color("#a8ac99"))
			for x in [0.32, 0.55, 0.77]:
				_stroke(pos, Vector2(x, 0.20), Vector2(x, 0.76), Color("#779596"), 0.024)
			_stroke(pos, Vector2(0.13, 0.47), Vector2(0.87, 0.47), Color("#779596"), 0.024)
		"battery", "heater", "cooler":
			_panel(pos, Rect2(0.13, 0.12, 0.74, 0.78), Color("#657269"), Color("#a1a692"))
			var active := Color("#cfa567") if kind == "heater" else Color("#9ac6b9")
			if kind == "battery":
				draw_rect(Rect2(pos + Vector2(0.22, 0.32), Vector2(0.56, 0.37)), INK)
				var charge := clampf(float(building.get("charge", 0.0)) / BATTERY_CAPACITY, 0.0, 1.0)
				draw_rect(Rect2(pos + Vector2(0.26, 0.37), Vector2(0.48 * charge, 0.27)), active)
			else:
				for row in range(4):
					var y := 0.29 + row * 0.137
					_stroke(pos, Vector2(0.22, y), Vector2(0.73, y), INK, 0.050)
				draw_circle(pos + Vector2(0.75, 0.77), 0.049, active if building.get("powered", false) else INK)
		"beacon":
			_panel(pos, Rect2(0.14, 0.12, 0.72, 0.78), Color("#465958"), Color("#a9a78d"))
			draw_arc(pos + Vector2(0.50, 0.46), 0.23, PI, TAU, 16, Color("#c7bd97"), 0.055, true)
			_stroke(pos, Vector2(0.50, 0.45), Vector2(0.50, 0.75), Color("#c7bd97"), 0.065)
			draw_circle(pos + Vector2(0.50, 0.30), 0.050, AMBER)
	var health := float(building.get("hp", 1.0)) / maxf(1.0, float(building.get("maxHp", 1.0)))
	if health < 0.96:
		_bar(pos + Vector2(0.12, 0.9), 0.76, health, Color("#c68a5c"))


func _draw_blueprint(pos: Vector2, building: Dictionary) -> void:
	var color := Color("#b2d4c3")
	draw_rect(Rect2(pos + Vector2.ONE * 0.07, Vector2.ONE * 0.86), Color(0.24, 0.44, 0.42, 0.52))
	_corners(pos, Vector2.ONE, color)
	_stroke(pos, Vector2(0.21, 0.76), Vector2(0.76, 0.23), Color(0.67, 0.84, 0.75, 0.42), 0.034)
	_stroke(pos, Vector2(0.47, 0.82), Vector2(0.82, 0.49), Color(0.67, 0.84, 0.75, 0.34), 0.034)
	_bar(pos + Vector2(0.16, 0.83), 0.68, float(building.get("progress", 0.0)), color)


func _draw_designation(pos: Vector2, designation: String) -> void:
	var badge := pos + Vector2(0.79, 0.22)
	draw_circle(badge, 0.19, Color("#4a4838"), true, -1.0, true)
	draw_arc(badge, 0.185, 0.0, TAU, 20, AMBER, 0.025, true)
	match designation:
		"chop", "mine":
			_stroke(badge, Vector2(-0.085, 0.093), Vector2(0.064, -0.072), AMBER, 0.040)
			_stroke(badge, Vector2(-0.064, -0.092), Vector2(0.079, 0.034), AMBER, 0.042 if designation == "mine" else 0.063)
		"harvest":
			draw_circle(badge, 0.045, AMBER)
			_stroke(badge, Vector2(-0.093, 0.074), Vector2(0.093, -0.074), AMBER, 0.035)


func _draw_fire(pos: Vector2, strength: float) -> void:
	var flicker := sin(_clock * 11.0 + pos.x * 2.0 + pos.y) * 0.07
	var extent := minf(0.78, 0.35 + strength * 0.48)
	var floor_point := Vector2(0.51, 0.77)
	draw_circle(pos + floor_point, 0.31 * extent, Color("#553e32"))
	_poly(pos + floor_point, [Vector2(-0.26, 0.0), Vector2(-0.31, -0.15), Vector2(-0.22, -extent * 0.70), Vector2(-0.11, -0.34), Vector2(flicker, -extent), Vector2(0.16, -0.37), Vector2(0.25, -extent * 0.69), Vector2(0.31, -0.19), Vector2(0.23, 0.01)], Color("#b9583e"))
	_poly(pos + floor_point, [Vector2(-0.17, 0.0), Vector2(-0.14, -0.23), Vector2(0.02, -extent * 0.74), Vector2(0.16, -0.25), Vector2(0.20, 0.0)], Color("#f19b55"))
	_poly(pos + floor_point, [Vector2(-0.075, 0.0), Vector2(0.01, -extent * 0.39), Vector2(0.10, 0.0)], AMBER)
	for i in range(3):
		var rise := fposmod(_clock * 0.62 + i / 3.0 + pos.x * 0.19, 1.0)
		draw_circle(pos + Vector2(0.52 + flicker + i * 0.055, 0.56 - rise), 0.065 + rise * 0.10, Color(0.23, 0.24, 0.20, (1.0 - rise) * 0.32))


func _draw_power(tiles: Array, dims: Vector2i, region: Rect2i) -> void:
	for y in range(region.position.y, region.end.y):
		for x in range(region.position.x, region.end.x):
			var building = tiles[y * dims.x + x].get("building")
			if not building is Dictionary or not building.get("complete", false):
				continue
			var kind = building.get("type")
			if kind not in CONDUCTORS and kind not in CONSUMERS:
				continue
			var pos := Vector2(x, y) + Vector2.ONE * 0.5
			var color := Color("#e1cb75") if building.get("powered", false) else Color("#a89a85")
			var network = building.get("networkId")
			if network != null and kind in CONDUCTORS:
				for direction in [Vector2i.RIGHT, Vector2i.DOWN]:
					var neighbor_cell: Vector2i = Vector2i(x, y) + direction
					if not Rect2i(Vector2i.ZERO, dims).has_point(neighbor_cell):
						continue
					var neighbor = tiles[neighbor_cell.y * dims.x + neighbor_cell.x].get("building")
					if neighbor is Dictionary and neighbor.get("type") in CONDUCTORS and neighbor.get("networkId") == network:
						draw_line(pos, pos + Vector2(direction), color, 0.058, true)
			elif network != null:
				var connection := _consumer_connection(Vector2i(x, y), tiles, dims, network)
				if connection != NO_CELL:
					draw_dashed_line(pos, Vector2(connection) + Vector2.ONE * 0.5, color, 0.045, 0.19, true, true)
			draw_circle(pos, 0.137, INK, true, -1.0, true)
			draw_circle(pos, 0.10, color, true, -1.0, true)


func _consumer_connection(cell: Vector2i, tiles: Array, dims: Vector2i, network: Variant) -> Vector2i:
	# The engine selects the closest conductor within three Manhattan steps.
	# At equal distances it selects the first cell in row-major order.
	var closest := NO_CELL
	var best_distance := 4
	var area := Rect2i(cell - Vector2i.ONE * 3, Vector2i.ONE * 7).intersection(Rect2i(Vector2i.ZERO, dims))
	for y in range(area.position.y, area.end.y):
		for x in range(area.position.x, area.end.x):
			var distance := absi(cell.x - x) + absi(cell.y - y)
			if distance >= best_distance:
				continue
			var building = tiles[y * dims.x + x].get("building")
			if building is Dictionary and building.get("type") in CONDUCTORS and building.get("networkId") == network:
				closest = Vector2i(x, y)
				best_distance = distance
	return closest


func _draw_route(actor: Dictionary) -> void:
	var path: Array = actor.get("path", [])
	var previous := Vector2(float(actor.get("x", 0)), float(actor.get("y", 0)))
	for step in path:
		var next := Vector2(float(step.get("x", 0)), float(step.get("y", 0))) + Vector2.ONE * 0.5
		draw_line(previous, next, Color(0.98, 0.86, 0.56, 0.56), 0.041, true)
		draw_circle(next, 0.047, AMBER)
		previous = next


func _draw_resource(at: Vector2, kind: String, diameter: float) -> void:
	var shade := Color("#ad986d")
	match kind:
		"steel", "armor", "rifle", "tool":
			shade = Color("#a8b6aa")
		"rawfood":
			shade = Color("#aabd75")
		"meals", "silver":
			shade = Color("#d8bb78")
		"medicine":
			shade = Color("#87b3a8")
		"wood":
			shade = Color("#bd8d5d")
	draw_circle(at + Vector2(0.03, 0.05), diameter * 0.79, Color(0.17, 0.20, 0.15, 0.63), true, -1.0, true)
	draw_rect(Rect2(at - Vector2.ONE * diameter * 0.5, Vector2.ONE * diameter), shade)
	draw_rect(Rect2(at - Vector2.ONE * diameter * 0.48, Vector2.ONE * diameter * 0.96), INK,  false, 0.025)
	_stroke(at, Vector2(-diameter * 0.43, -diameter * 0.25), Vector2(diameter * 0.42, -diameter * 0.25), shade.lightened(0.24), 0.025)
	if kind == "medicine":
		_cross(at, diameter * 0.27, IVORY)


func _draw_pawn(actor: Dictionary, pos: Vector2, hostile: bool) -> void:
	if actor.get("carriedBy") != null:
		return
	var selected := _selected.has(actor.get("id"))
	var health := float(actor.get("health", 0.0))
	var color := Color("#c87159") if hostile else Color.from_string(str(actor.get("color", "#e5c58e")), AMBER)
	draw_circle(pos + Vector2(0.03, 0.09), 0.32, Color(0.15, 0.18, 0.14, 0.44), true, -1.0, true)
	if actor.get("dead", false) or (health < 15.0 and not hostile):
		_poly(pos, [Vector2(-0.33, 0.03), Vector2(-0.18, -0.18), Vector2(0.23, -0.10), Vector2(0.32, 0.05), Vector2(0.24, 0.21), Vector2(-0.23, 0.18)], color.darkened(0.42))
		draw_circle(pos + Vector2(-0.22, -0.02), 0.12, Color("#c7a186"))
		_cross(pos + Vector2(0.17, 0.00), 0.073, IVORY if health > 0.0 else INK)
	else:
		_stroke(pos, Vector2(-0.11, 0.10), Vector2(-0.14, 0.29), INK, 0.092)
		_stroke(pos, Vector2(0.12, 0.10), Vector2(0.13, 0.28), INK, 0.092)
		_poly(pos, [Vector2(-0.26, 0.07), Vector2(-0.21, -0.13), Vector2(-0.11, -0.18), Vector2(0.12, -0.18), Vector2(0.23, -0.12), Vector2(0.26, 0.07), Vector2(0.16, 0.21), Vector2(-0.17, 0.21)], INK)
		_poly(pos, [Vector2(-0.20, 0.06), Vector2(-0.16, -0.10), Vector2(0.13, -0.10), Vector2(0.20, 0.06), Vector2(0.12, 0.17), Vector2(-0.12, 0.17)], color)
		draw_circle(pos + Vector2(0.0, -0.17), 0.181, INK, true, -1.0, true)
		draw_circle(pos + Vector2(-0.014, -0.16), 0.132, Color("#d2b296"), true, -1.0, true)
		_stroke(pos, Vector2(-0.129, -0.22), Vector2(0.117, -0.24), color.darkened(0.39), 0.074)
		if actor.get("drafted", false) or hostile:
			_stroke(pos, Vector2(0.19, 0.16), Vector2(0.33, -0.22), Color("#363c35"), 0.071)
			_stroke(pos, Vector2(0.26, -0.018), Vector2(0.33, -0.22), Color("#b3b6a5"), 0.039)
	var carry = actor.get("carry")
	if carry is Dictionary:
		_draw_resource(pos + Vector2(0.28, 0.20), str(carry.get("type", "")), 0.22)
	if actor.get("carryingPawnId") != null:
		_cross(pos + Vector2(0.30, 0.15), 0.091, IVORY)
	if selected:
		_corners(pos - Vector2.ONE * 0.48, Vector2.ONE * 0.96, AMBER)
	var job = actor.get("job")
	if job is Dictionary and float(job.get("progress", 0.0)) > 0.0 and actor.get("path", []).is_empty():
		var progress := float(job.get("progress", 0.0)) / maxf(0.001, float(job.get("total", 1.0)))
		_bar(pos + Vector2(-0.26, 0.39), 0.52, progress, AMBER)
	var max_health := float(actor.get("maxHp", 100.0))
	if not actor.get("dead", false) and (health < max_health - 1.0 or hostile):
		_bar(pos + Vector2(-0.26, -0.49), 0.52, health / maxf(1.0, max_health), Color("#d88869") if hostile else Color("#c6bc75"))


func _draw_effect(effect: Dictionary) -> void:
	var pos := Vector2(float(effect.get("x", 0.0)), float(effect.get("y", 0.0)))
	var age := float(effect.get("age", 0.0))
	var life := maxf(0.001, float(effect.get("life", 0.85)))
	var progress := clampf(age / life, 0.0, 1.0)
	var color := Color.from_string(str(effect.get("color", "#f2d49a")), AMBER)
	color.a *= 1.0 - progress
	match effect.get("kind", ""):
		"shot":
			var target := Vector2(float(effect.get("tx", pos.x)), float(effect.get("ty", pos.y)))
			draw_line(pos, target, color, 0.060, true)
			draw_circle(pos, 0.11, color, true, -1.0, true)
		_:
			draw_arc(pos - Vector2.UP * 0.025, 0.13 + progress * 0.41, 0.0, TAU, 20, color, 0.039, true)
			var message := str(effect.get("text", ""))
			if not message.is_empty():
				_draw_world_text(pos + Vector2(0.0, -0.33 - progress * 0.42), message, color)


func _draw_world_text(pos: Vector2, message: String, color: Color) -> void:
	const FONT_SIZE := 22
	const WORLD_TO_FONT := 0.015
	var font := ThemeDB.fallback_font
	var world_scale := _scale()
	var origin := size * 0.5 - _center * world_scale
	var pixel_pos := origin + pos * world_scale
	var label_scale := world_scale * WORLD_TO_FONT
	var label_width := font.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1.0, FONT_SIZE).x
	draw_set_transform(pixel_pos, 0.0, Vector2.ONE * label_scale)
	draw_string(font, Vector2(-label_width * 0.5, 0.0), message, HORIZONTAL_ALIGNMENT_LEFT, -1.0, FONT_SIZE, color)
	draw_set_transform(origin, 0.0, Vector2.ONE * world_scale)


func _draw_target() -> void:
	if _zone_origin != NO_CELL:
		var span := Rect2i(_zone_origin, _zone_end - _zone_origin).abs()
		span.size += Vector2i.ONE
		var fill := Color(0.75, 0.65, 0.25, 0.24) if _tool in FARMS else Color(0.46, 0.78, 0.72, 0.27)
		draw_rect(Rect2(span), fill)
		_corners(Vector2(span.position), Vector2(span.size), AMBER if _tool in FARMS else Color("#a9d6c6"))
	elif _hover != NO_CELL:
		_corners(Vector2(_hover), Vector2.ONE, Color(0.96, 0.87, 0.67, 0.78))


func _draw_coordinate(cell: Vector2i, tile: Dictionary) -> void:
	var message := "%02d / %02d" % [cell.x + 1, cell.y + 1]
	if overlay == "temperature":
		message += "   %d °C" % roundi(float(tile.get("temperature", 19.0)))
	var font := ThemeDB.fallback_font
	var label_width := font.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 13).x
	var origin := Vector2(13.0, size.y - 40.0)
	draw_rect(Rect2(origin, Vector2(label_width + 20.0, 27.0)), Color(0.14, 0.17, 0.14, 0.9))
	draw_rect(Rect2(origin, Vector2(label_width + 20.0, 27.0)), Color(0.76, 0.67, 0.46, 0.56), false, 1.0)
	draw_string(font, origin + Vector2(10.0, 18.0), message, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 13, AMBER)


func _panel(pos: Vector2, rect: Rect2, fill: Color, top: Color) -> void:
	rect.position += pos
	draw_rect(Rect2(rect.position + Vector2(0.037, 0.067), rect.size), Color(0.19, 0.21, 0.16, 0.48))
	draw_rect(rect, fill)
	draw_rect(rect, Color("#403d32"), false, 0.045)
	draw_line(rect.position + Vector2(0.03, 0.036), Vector2(rect.end.x - 0.035, rect.position.y + 0.036), top, 0.043, true)


func _corners(pos: Vector2, extent: Vector2, color: Color) -> void:
	for direction in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
		var edge: Vector2 = pos + (Vector2.ONE - direction) * 0.5 * extent + direction * 0.043
		draw_line(edge, edge + Vector2(direction.x * 0.27, 0), color, 0.038, true)
		draw_line(edge, edge + Vector2(0, direction.y * 0.27), color, 0.038, true)


func _bar(pos: Vector2, width: float, progress: float, color: Color) -> void:
	draw_rect(Rect2(pos, Vector2(width, 0.074)), INK)
	draw_rect(Rect2(pos + Vector2(0.012, 0.013), Vector2((width - 0.024) * clampf(progress, 0, 1), 0.048)), color)


func _cross(pos: Vector2, extent: float, color: Color) -> void:
	draw_line(pos - Vector2.RIGHT * extent, pos + Vector2.RIGHT * extent, color, 0.05, true)
	draw_line(pos - Vector2.DOWN * extent, pos + Vector2.DOWN * extent, color, 0.05, true)


func _stroke(pos: Vector2, from: Vector2, to: Vector2, color: Color, width: float) -> void:
	draw_line(pos + from, pos + to, color, width, true)


func _poly(pos: Vector2, vertices: Array[Vector2], color: Color) -> void:
	var polygon := PackedVector2Array()
	for point in vertices:
		polygon.append(pos + point)
	draw_colored_polygon(polygon, color)
