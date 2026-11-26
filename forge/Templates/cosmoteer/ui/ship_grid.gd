extends Control

## Asset-free, 16×10 ship cutaway used by the editor and combat view.
signal cell_action(cell: Vector2i, erase: bool)
signal hover_cell(cell: Vector2i)
signal hover_exited

const GRID_SIZE := Vector2i(16, 10)
const INK := Color("#09141d")
const GRID := Color("#1b303d")
const STEEL := Color("#527080")
const PALE := Color("#d7e9e8")
const MINT := Color("#69e3c1")
const AMBER := Color("#ffc47e")
const RED := Color("#ff7774")
const BLUE := Color("#70b7ff")
const CREW_LEGEND := "승무원: △ 조종사 · ◇ 포수 · ○ 운반원 · 밝은 네모 = 적재"

var design: Variant
var battle: Variant
var enemy_side := false
var selected_id := ""
var rotation_quarters := 0
var erase_mode := false
var mirror_mode := false
var planned_route: Array[Vector2i] = []
var preview_path: Array[Vector2i] = []
var _hover := Vector2i(-1, -1)


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	mouse_exited.connect(_clear_hover)

func _clear_hover() -> void:
	_hover = Vector2i(-1,-1)
	hover_exited.emit()
	queue_redraw()


func _process(_delta: float) -> void:
	if battle != null:
		queue_redraw()


func cell_center(cell: Vector2i) -> Vector2:
	var cell_size := _cell_size()
	var screen_cell := cell
	if _is_mirrored_battle():
		screen_cell.x = GRID_SIZE.x - 1 - cell.x
	return _grid_origin(cell_size) + (Vector2(screen_cell) + Vector2(0.5, 0.5)) * cell_size


func _cell_size() -> Vector2:
	var side := minf(size.x / GRID_SIZE.x, size.y / GRID_SIZE.y)
	return Vector2(side, side)


func _grid_origin(cell_size: Vector2) -> Vector2:
	return (size - Vector2(GRID_SIZE) * cell_size) * 0.5


func _cell_at(point: Vector2) -> Vector2i:
	var cell_size := _cell_size()
	var local := (point - _grid_origin(cell_size)) / cell_size
	if local.x < 0.0 or local.y < 0.0 or local.x >= GRID_SIZE.x or local.y >= GRID_SIZE.y:
		return Vector2i(-1, -1)
	var cell := Vector2i(floori(local.x), floori(local.y))
	if _is_mirrored_battle():
		cell.x = GRID_SIZE.x - 1 - cell.x
	return cell


func _is_mirrored_battle() -> bool:
	return enemy_side and battle != null


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var cell := _cell_at(event.position)
		if cell != _hover:
			_hover = cell
			if _hover.x >= 0:
				hover_cell.emit(_hover)
			else:
				hover_exited.emit()
			queue_redraw()
	elif event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
		var cell := _cell_at(event.position)
		if cell.x >= 0:
			cell_action.emit(cell, erase_mode or event.button_index == MOUSE_BUTTON_RIGHT)
			accept_event()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), INK)
	if size.x <= 1.0 or size.y <= 1.0:
		return
	var cell_size := _cell_size()
	var origin := _grid_origin(cell_size)
	var board_rect := Rect2(origin, Vector2(GRID_SIZE) * cell_size)
	draw_rect(board_rect, Color("#0d1b25"))
	for x in range(GRID_SIZE.x + 1):
		var px := origin.x + x * cell_size.x
		draw_line(Vector2(px, origin.y), Vector2(px, board_rect.end.y), GRID, 1.0)
	for y in range(GRID_SIZE.y + 1):
		var py := origin.y + y * cell_size.y
		draw_line(Vector2(origin.x, py), Vector2(board_rect.end.x, py), GRID, 1.0)
	var local_battle: Variant = _local_battle_state()
	if local_battle != null:
		_draw_parts(_battle_parts(local_battle), cell_size, origin, true)
		_draw_carrier_routes(local_battle, cell_size, origin)
		_draw_carriers(local_battle, cell_size, origin)
		_draw_target(local_battle, cell_size, origin)
		_draw_impacts(cell_size, origin)
	else:
		_draw_parts(_design_parts(), cell_size, origin, false)
		_draw_route(preview_path, cell_size, origin, Color("#67d9bc"), 0.31)
		if mirror_mode:
			var axis_y := origin.y + float(GRID_SIZE.y) * 0.5 * cell_size.y
			draw_line(Vector2(origin.x, axis_y), Vector2(board_rect.end.x, axis_y), Color("#5ce1ff", 0.72), 2.0, true)
		_draw_ghost(cell_size, origin)
	if _hover.x >= 0:
		var hrect := _cell_rect(_hover, Vector2i.ONE, cell_size, origin)
		draw_rect(hrect, Color(PALE, 0.14), true)
		draw_rect(hrect, Color(PALE, 0.58), false, 1.0)


func _local_battle_state() -> Variant:
	if battle == null:
		return null
	var side_key := "enemy" if enemy_side else "player"
	var side = _battle_value(side_key, null)
	return side if side is Dictionary else null


func _battle_value(key: String, fallback: Variant = null) -> Variant:
	if battle is Dictionary:
		return battle.get(key, fallback)
	if battle is Object:
		var value: Variant = battle.get(key)
		return fallback if value == null else value
	return fallback


func _design_parts() -> Array:
	if design == null:
		return []
	var rows = design.get("parts", []) if design is Dictionary else design.parts
	return rows if rows is Array else []


func _battle_parts(state: Dictionary) -> Array:
	var result: Array = []
	var rows = state.get("parts", {})
	if rows is Dictionary:
		for uid in rows:
			var part: Dictionary = rows[uid].duplicate()
			part["uid"] = int(uid)
			result.append(part)
	elif rows is Array:
		result = rows
	return result


func _part_def(part: Dictionary) -> Dictionary:
	if design == null:
		return {}
	var catalog: Dictionary = design.get("by_id", {}) if design is Dictionary else design.by_id
	var entry = catalog.get(str(part.get("id", "")), {})
	return entry if entry is Dictionary else {}


func _part_size(part: Dictionary) -> Vector2i:
	var raw = part.get("size", _part_def(part).get("size", Vector2i.ONE))
	var dims := Vector2i(int(raw.x), int(raw.y)) if raw is Vector2i else Vector2i(int(raw[0]), int(raw[1]))
	return dims


func _draw_parts(parts: Array, cell_size: Vector2, origin: Vector2, live: bool) -> void:
	for part in parts:
		if not part is Dictionary:
			continue
		var cell: Vector2i = part.get("cell", Vector2i.ZERO)
		var dims := _part_size(part)
		var rect := _cell_rect(cell, dims, cell_size, origin).grow(-1.5)
		var hp := float(part.get("hp", part.get("max_hp", 1.0)))
		var max_hp := maxf(1.0, float(part.get("max_hp", _part_def(part).get("max_health", 1.0))))
		var dead := live and hp <= 0.0
		_draw_module(part, rect, cell_size, dead)
		if live:
			_draw_health(rect, hp, max_hp, dead)


func _draw_module(part: Dictionary, rect: Rect2, cell_size: Vector2, dead: bool) -> void:
	var id := str(part.get("id", ""))
	var color := _part_color(id)
	if dead:
		color = Color("#302a34")
	draw_rect(rect, Color("#172731"), true)
	draw_rect(rect, color.darkened(0.54), true)
	draw_rect(rect, color.darkened(0.2), false, maxf(1.0, cell_size.x * 0.035))
	var center := rect.get_center()
	var inset := minf(cell_size.x, cell_size.y)
	var stats: Dictionary = _part_def(part).get("stats",{})
	if id == "cosmoteer.lab_engine_room":
		draw_arc(center, inset*0.58, 0.15, TAU-0.15, 28, color, inset*0.08, true)
		for angle in [0.0, TAU/3, TAU*2/3]:
			var blade := Vector2.RIGHT.rotated(angle)
			draw_line(center, center+blade*inset*0.42, color, inset*0.14, true)
		draw_circle(center,inset*0.11,PALE)
	elif stats.has("special_propulsion"):
		_draw_special(center,inset,part,stats.special_propulsion,color)
	elif stats.has("nozzles"):
		_draw_engine(center,inset,part,stats.nozzles,color)
	elif id.contains("reactor"):
		var radius := minf(rect.size.x, rect.size.y) * 0.26
		draw_arc(center, radius * 1.65, 0.0, TAU, 32, Color(color, 0.5), maxf(1.0, inset * 0.035), true)
		draw_arc(center, radius, 0.0, TAU, 32, color, maxf(1.0, inset * 0.09), true)
		draw_circle(center, radius * 0.37, PALE)
		for k in range(4):
			var bar := Rect2(center + Vector2(-radius * 1.2 + k * radius * 0.62, radius * 1.35), Vector2(radius * 0.42, radius * 0.23))
			draw_rect(bar, MINT if not dead else STEEL)
	elif id.contains("crew_quarters") or id.contains("bunk"):
		var bunk_w := minf(rect.size.x * 0.35, inset * 0.56)
		var bunk_h := minf(rect.size.y * 0.34, inset * 0.42)
		for k in range(2):
			var bed := Rect2(Vector2(center.x - bunk_w - 2 + k * (bunk_w + 4), center.y - bunk_h * 0.5), Vector2(bunk_w, bunk_h))
			draw_rect(bed, color.lightened(0.09), true)
			draw_rect(Rect2(bed.position + Vector2(2, 2), Vector2(maxf(2, bunk_w * 0.25), bunk_h - 4)), PALE)
			draw_rect(bed, Color(PALE, 0.6), false, 1.0)
	elif id == "cosmoteer.shield_gen_small" or id == "cosmoteer.shield_gen_large":
		var rest_rot := deg_to_rad(float(stats.get("turret_rotation_deg", -90))) + int(part.rotation) * PI * 0.5
		if _is_mirrored_battle():
			rest_rot = PI - rest_rot
		draw_circle(center, inset * 0.28, color.darkened(0.15))
		draw_circle(center, inset * 0.14, PALE)
		draw_arc(center, minf(rect.size.x, rect.size.y) * 0.44, rest_rot - 0.9, rest_rot + 0.9, 20, Color("#7ef2ff"), maxf(2.0, inset * 0.09), true)
	elif id == "cosmoteer.ion_beam_prism":
		var r := minf(rect.size.x, rect.size.y) * 0.34
		var diamond := PackedVector2Array([center + Vector2(0, -r), center + Vector2(r, 0), center + Vector2(0, r), center + Vector2(-r, 0)])
		draw_colored_polygon(diamond, Color("#ff8ad4", 0.75))
		draw_polyline(PackedVector2Array([diamond[0], diamond[1], diamond[2], diamond[3], diamond[0]]), Color.WHITE, maxf(1.5, inset * 0.06), true)
	elif id == "cosmoteer.flak_cannon_large":
		var rest_rot := deg_to_rad(-90.0) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(rest_rot)
		if _is_mirrored_battle():
			dir.x = -dir.x
		var side_vec := dir.orthogonal()
		for off in [-0.3, 0.0, 0.3]:
			draw_line(center + side_vec * inset * off, center + side_vec * inset * off + dir * inset * 0.65, color, maxf(2.0, inset * 0.14), true)
		draw_circle(center, inset * 0.24, PALE)
	elif id == "cosmoteer.chaingun" or id == "cosmoteer.chaingun_magazine":
		var rest_rot := deg_to_rad(-90.0) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(rest_rot)
		if _is_mirrored_battle():
			dir.x = -dir.x
		draw_line(center - dir * inset * 0.45, center + dir * inset * 0.65, color, maxf(2.5, inset * 0.18), true)
		draw_circle(center, inset * 0.18, AMBER)
	elif id == "cosmoteer.ion_beam_emitter":
		var rest_rot := deg_to_rad(float(stats.get("turret_rotation_deg", -90))) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(rest_rot)
		if _is_mirrored_battle():
			dir.x = -dir.x
		draw_line(center - dir * inset * 0.5, center + dir * inset * 0.7, Color("#ff70b8"), maxf(3.0, inset * 0.2), true)
		draw_circle(center, inset * 0.24, Color("#ffd6ef"))
	elif id.contains("railgun"):
		var rest_rot := deg_to_rad(-90.0) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(rest_rot)
		if _is_mirrored_battle():
			dir.x = -dir.x
		var side_vec := dir.orthogonal()
		for off in [-0.26, 0.26]:
			draw_line(center + side_vec * inset * off - dir * inset * 0.6, center + side_vec * inset * off + dir * inset * 0.6, Color("#7ce0ff"), maxf(2.0, inset * 0.12), true)
		draw_line(center - dir * inset * 0.5, center + dir * inset * 0.5, PALE, maxf(1.2, inset * 0.06), true)
	elif id == "cosmoteer.fire_extinguisher":
		draw_circle(center, inset * 0.26, Color("#ff6b57"))
		draw_line(center - Vector2(0, inset * 0.15), center + Vector2(0, inset * 0.15), PALE, maxf(1.8, inset * 0.08), true)
		draw_line(center - Vector2(inset * 0.15, 0), center + Vector2(inset * 0.15, 0), PALE, maxf(1.8, inset * 0.08), true)
	elif id == "cosmoteer.missile_launcher":
		var rest_rot := deg_to_rad(float(stats.get("turret_rotation_deg", -90))) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(rest_rot)
		if _is_mirrored_battle():
			dir.x = -dir.x
		var side_vec := dir.orthogonal()
		for off in [-0.24, 0.24]:
			var base_p: Vector2 = center + side_vec * inset * off - dir * inset * 0.35
			var tip_p: Vector2 = center + side_vec * inset * off + dir * inset * 0.42
			draw_line(base_p, tip_p, color, maxf(2.5, inset * 0.16), true)
			draw_circle(tip_p, maxf(1.8, inset * 0.1), Color("#ffe4b5"))
	elif id == "cosmoteer.point_defense":
		var rest_rot := deg_to_rad(float(stats.get("turret_rotation_deg", -90))) + int(part.rotation) * PI * 0.5
		var dir := Vector2.from_angle(float(part.get("turret_angle_local", rest_rot)))
		if _is_mirrored_battle():
			dir.x = -dir.x
		draw_arc(center, inset * 0.28, 0.0, TAU, 20, color, maxf(1.5, inset * 0.07), true)
		draw_line(center, center + dir * inset * 0.36, PALE, maxf(1.8, inset * 0.09), true)
	elif id.contains("laser") or id.contains("cannon") or id.contains("weapon"):
		var barrel_len := minf(rect.size.x, rect.size.y) * 0.50
		var rest_rotation := deg_to_rad(float(stats.get("turret_rotation_deg",-90))) + int(part.rotation)*PI*0.5
		var direction := Vector2.from_angle(float(part.get("turret_angle_local",rest_rotation)))
		if _is_mirrored_battle():
			direction.x = -direction.x
		var start := center - direction * (barrel_len * 0.08)
		var finish := center + direction * (barrel_len * 0.58)
		draw_line(start, finish, color, maxf(2.0, inset * 0.13), true)
		draw_circle(start, inset * 0.18, PALE)
		draw_arc(finish, inset * 0.19, 0, TAU, 20, AMBER, maxf(1.0, inset * 0.045), true)
	elif id.contains("control_room") or id.contains("bridge"):
		var glass := Rect2(center - Vector2(minf(rect.size.x * 0.34, inset * 0.46), minf(rect.size.y * 0.25, inset * 0.29)), Vector2(minf(rect.size.x * 0.68, inset * 0.92), minf(rect.size.y * 0.5, inset * 0.58)))
		draw_rect(glass, Color("#102430"), true)
		draw_rect(glass, color, false, maxf(1.0, inset * 0.045))
		draw_line(glass.position + Vector2(3, glass.size.y - 3), glass.end - Vector2(3, 3), PALE, 1.0)
		draw_line(glass.position + Vector2(3, glass.size.y * 0.55), glass.end - Vector2(3, glass.size.y * 0.55), color.lightened(0.35), 1.0)
	elif id.contains("armor") or id.contains("structure"):
		for k in range(3):
			var offset := float(k - 1) * inset * 0.23
			draw_line(center + Vector2(-inset * 0.25 + offset, inset * 0.25), center + Vector2(inset * 0.25 + offset, -inset * 0.25), color.lightened(0.2), maxf(1.0, inset * 0.055))
	elif id.contains("corridor"):
		var half := inset * 0.23
		draw_line(center - Vector2(half, 0), center + Vector2(half, 0), Color(color.lightened(0.22), 0.86), maxf(1.0, inset * 0.045))
		draw_circle(center, maxf(1.3, inset * 0.055), PALE)
		for side in [-1.0, 1.0]:
			var seam_x: float = center.x + half * side
			draw_line(Vector2(seam_x, center.y - inset * 0.19), Vector2(seam_x, center.y + inset * 0.19), color, maxf(1.0, inset * 0.035))
	else:
		var half := inset * 0.18
		draw_line(center - Vector2(half, 0), center + Vector2(half, 0), Color(color, 0.7), 1.0)
	var facing := Vector2.UP.rotated(float(int(part.get("rotation", 0))) * PI * 0.5)
	if _is_mirrored_battle():
		facing.x = -facing.x
	var marker_center := center + facing * (minf(rect.size.x, rect.size.y) * 0.37)
	draw_circle(marker_center, maxf(1.5, inset * 0.045), PALE if not dead else RED)
	if dead:
		draw_line(rect.position + Vector2(4, 4), rect.end - Vector2(4, 4), RED, maxf(1.5, inset * 0.05))
		draw_line(Vector2(rect.end.x - 4, rect.position.y + 4), Vector2(rect.position.x + 4, rect.end.y - 4), RED, maxf(1.5, inset * 0.05))
	elif part.get("thermal_trip",false):
		draw_rect(rect.grow(-2),RED,false,2)
	if not dead and float(part.get("fire", 0.0)) > 0.05:
		var f := float(part.get("fire", 0.0))
		draw_circle(center, inset * (0.22 + 0.14 * f), Color("#ff6a2b", 0.65 * f))
		draw_circle(center, inset * 0.14, Color("#ffe066", 0.9 * f))

func _draw_engine(center: Vector2, tile: float, part: Dictionary, nozzles: Array, color: Color) -> void:
	var shape: Array = _part_def(part).size
	var half := Vector2(shape[0],shape[1])*0.5
	var angle := int(part.rotation)*PI/2
	for jet in nozzles:
		var offset := (Vector2(jet.location[0],jet.location[1])-half).rotated(angle)
		var exhaust := Vector2.RIGHT.rotated(deg_to_rad(jet.rotation_deg)+angle)
		if _is_mirrored_battle():
			offset.x = -offset.x
			exhaust.x = -exhaust.x
		var anchor := center+offset*tile
		var across := exhaust.orthogonal()*tile*0.18
		var back := anchor-exhaust*tile*0.32
		draw_colored_polygon(PackedVector2Array([back-across*0.6,back+across*0.6,anchor+across,anchor-across]),color)
		draw_line(anchor-across,anchor+across,PALE,2,true)

func _draw_special(center: Vector2, tile: float, part: Dictionary, spec: Dictionary, color: Color) -> void:
	var shape: Array = _part_def(part).size
	var dims := Vector2(shape[0],shape[1])
	var angle := int(part.rotation)*PI/2
	var axis := Vector2.UP.rotated(angle)
	if _is_mirrored_battle():
		axis.x = -axis.x
	var sideways := axis.orthogonal()
	if spec.has("normal_nozzle"):
		_draw_engine(center,tile,part,[spec.normal_nozzle],color)
		for n in [-1,0,1]:
			var c: Vector2 = center+axis*tile*n*0.42
			draw_polyline(PackedVector2Array([c+sideways*tile*0.4,c+axis*tile*0.25,c-sideways*tile*0.4]),color,2,true)
	elif spec.has("base_force"):
		_draw_engine(center,tile,part,[spec],color)
		draw_line(center-axis*tile,center+axis*tile,color,tile*0.26,true)
	elif spec.has("propagated_buff"):
		for n in [-1,0,1]:
			var c: Vector2 = center+sideways*tile*n*0.54
			draw_line(c-axis*tile*0.64,c+axis*tile*0.64,color,tile*0.17,true)
	else:
		for n in [-1,0,1]:
			var c: Vector2 = center+axis*tile*n*0.42
			draw_line(c-sideways*tile*0.25,c+sideways*tile*0.25,color,tile*0.19,true)
	for socket in spec.get("sockets",{}).values():
		var offset := Vector2(socket.offset[0],socket.offset[1])
		var edge: Vector2
		if offset.x < 0 or offset.x >= dims.x:
			edge = Vector2(clampf(offset.x,0,dims.x),(socket.get("top",0)+socket.get("bottom",dims.y))*0.5)
		else:
			edge = Vector2((socket.get("left",offset.x)+socket.get("right",offset.x+1))*0.5,clampf(offset.y,0,dims.y))
		var marker := (edge-dims*0.5).rotated(angle)
		if _is_mirrored_battle():
			marker.x = -marker.x
		draw_circle(center+marker*tile,maxf(2.5,tile*0.11),AMBER)

func _part_color(id: String) -> Color:
	if id == "cosmoteer.lab_engine_room":
		return Color("#dfc16f")
	if id.ends_with("thruster_boost"):
		return Color("#ff986e")
	if id.contains("thruster_rocket"):
		return Color("#ad9cf4") if not id.ends_with("battery") else Color("#82c7a0")
	if id.contains("thruster"):
		return Color("#57bdd2")
	if id.contains("reactor"):
		return MINT
	if id.contains("crew_quarters") or id.contains("bunk"):
		return BLUE
	if id == "cosmoteer.shield_gen_small" or id == "cosmoteer.shield_gen_large":
		return Color("#5ce1ff")
	if id == "cosmoteer.ion_beam_emitter" or id == "cosmoteer.ion_beam_prism":
		return Color("#ff5ea8")
	if id == "cosmoteer.flak_cannon_large":
		return Color("#e8c86e")
	if id.contains("chaingun"):
		return Color("#f09a4b")
	if id.contains("railgun"):
		return Color("#4dc8ff")
	if id == "cosmoteer.disruptor":
		return Color("#c382ff")
	if id == "cosmoteer.fire_extinguisher":
		return Color("#ff6b57")
	if id == "cosmoteer.missile_launcher":
		return Color("#ff8a5c")
	if id == "cosmoteer.point_defense":
		return Color("#6ef2d6")
	if id == "cosmoteer.laser_blaster_large":
		return Color("#78e4ff")
	if id == "cosmoteer.cannon_med":
		return Color("#f0ad58")
	if id.contains("laser") or id.contains("cannon") or id.contains("weapon"):
		return AMBER
	if id.contains("control_room") or id.contains("bridge"):
		return Color("#a9a0ff")
	if id.contains("armor") or id.contains("structure"):
		return Color("#a3b0b8")
	return STEEL


func _draw_health(rect: Rect2, hp: float, max_hp: float, dead: bool) -> void:
	var bar_height := maxf(2.0, minf(4.0, rect.size.y * 0.10))
	var bar := Rect2(rect.position + Vector2(2, rect.size.y - bar_height - 2), Vector2(maxf(0.0, rect.size.x - 4), bar_height))
	draw_rect(bar, Color("#11181e"))
	if not dead:
		var tint := MINT if hp / max_hp > 0.55 else (AMBER if hp / max_hp > 0.25 else RED)
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * clampf(hp / max_hp, 0.0, 1.0), bar.size.y)), tint)


func _draw_ghost(cell_size: Vector2, origin: Vector2) -> void:
	if selected_id.is_empty() or _hover.x < 0 or design == null:
		return
	var source: Dictionary = design.by_id.get(selected_id, {}) if not design is Dictionary else design.get("by_id", {}).get(selected_id, {})
	if source.is_empty():
		return
	var raw_size = source.get("size", Vector2i.ONE)
	var dims := Vector2i(int(raw_size.x), int(raw_size.y)) if raw_size is Vector2i else Vector2i(int(raw_size[0]), int(raw_size[1]))
	if posmod(rotation_quarters, 2) == 1:
		dims = Vector2i(dims.y, dims.x)
	var placeable := false
	if not design is Dictionary and design.has_method("can_place"):
		placeable = design.can_place(selected_id, _hover, rotation_quarters)
	var color := MINT if placeable else RED
	var rect := Rect2(origin + Vector2(_hover) * cell_size, Vector2(dims) * cell_size).grow(-2.0)
	draw_rect(rect, Color(color, 0.19), true)
	draw_rect(rect, Color(color, 0.95), false, 2.0)
	var center := rect.get_center()
	if source.get("stats",{}).has("special_propulsion"):
		_draw_special(center,cell_size.x,{"id":selected_id,"rotation":rotation_quarters},source.stats.special_propulsion,color)
		return
	if source.get("stats",{}).has("nozzles"):
		_draw_engine(center,cell_size.x,{"id":selected_id,"rotation":rotation_quarters},source.stats.nozzles,color)
		return
	draw_circle(center, minf(rect.size.x, rect.size.y) * 0.14, Color(color, 0.88))
	var heading := Vector2.UP.rotated(float(rotation_quarters) * PI * 0.5)
	draw_line(center, center + heading * minf(rect.size.x, rect.size.y) * 0.36, color, 3.0, true)
	if mirror_mode:
		var mcell := Vector2i(_hover.x, GRID_SIZE.y - dims.y - _hover.y)
		if mcell != _hover:
			var mrect := Rect2(origin + Vector2(mcell) * cell_size, Vector2(dims) * cell_size).grow(-2.0)
			draw_rect(mrect, Color("#5ce1ff", 0.14), true)
			draw_rect(mrect, Color("#5ce1ff", 0.8), false, 1.5)


func _draw_route(route: Array, cell_size: Vector2, origin: Vector2, color: Color, alpha: float) -> void:
	if route.size() < 2:
		return
	var tint := Color(color, alpha)
	for i in range(route.size() - 1):
		var a: Vector2i = route[i]
		var b: Vector2i = route[i + 1]
		draw_line(cell_center(a), cell_center(b), tint, maxf(2.0, cell_size.x * 0.16), true)


func _draw_carrier_routes(state: Dictionary, cell_size: Vector2, origin: Vector2) -> void:
	var crew = state.get("crew", [])
	if not crew is Array:
		return
	for member in crew:
		if member.get("alive", true) and member.get("role", "") == "carrier":
			var route: Array = member.get("path", [])
			_draw_route(route, cell_size, origin, AMBER, 0.30)


func _draw_carriers(state: Dictionary, cell_size: Vector2, origin: Vector2) -> void:
	for member in state.get("crew", []):
		if not member.get("alive", true):
			continue
		var pos: Vector2 = member.get("pos", Vector2.ZERO)
		var screen_pos := pos
		if _is_mirrored_battle():
			screen_pos.x = GRID_SIZE.x - 1.0 - pos.x
		var center := origin + (screen_pos + Vector2(0.5, 0.5)) * cell_size
		_draw_crew_member(center, cell_size.x, member)


func _draw_crew_member(center: Vector2, cell_size: float, member: Dictionary) -> void:
	var role := str(member.get("role", "carrier"))
	var radius := maxf(4.0, cell_size * 0.14)
	var color := MINT if role == "carrier" else (AMBER if role == "gunner" else BLUE)
	if role == "pilot":
		var pilot := PackedVector2Array([center + Vector2(0, -radius), center + Vector2(radius * 0.9, radius * 0.72), center - Vector2(radius * 0.9, -radius * 0.72)])
		draw_colored_polygon(pilot, color)
	elif role == "gunner":
		var gunner := PackedVector2Array([center + Vector2(0, -radius), center + Vector2(radius, 0), center + Vector2(0, radius), center + Vector2(-radius, 0)])
		draw_colored_polygon(gunner, color)
		var muzzle := center + Vector2.RIGHT.rotated(float(int(member.get("rotation", 0))) * PI * 0.5) * radius * 1.45
		draw_line(center, muzzle, PALE, 1.5, true)
	elif role == "rocket_operator":
		var marker := Rect2(center-Vector2.ONE*radius*0.8, Vector2.ONE*radius*1.6)
		draw_rect(marker,Color("#bfa5ff"))
		draw_line(center-Vector2.UP*radius*0.45,center+Vector2.UP*radius*0.45,INK,1.5)
	else:
		draw_circle(center, radius, color)
	if role == "carrier" and int(member.get("cargo", 0)) > 0:
		draw_rect(Rect2(center - Vector2(radius * 0.45, radius * 0.45), Vector2(radius * 0.9, radius * 0.9)), PALE)


func _draw_target(state: Dictionary, cell_size: Vector2, origin: Vector2) -> void:
	if battle == null:
		return
	# A side view marks the UID being targeted on that side's own hull.
	var key := "target_uid" if enemy_side else "enemy_target_uid"
	var uid := int(_battle_value(key, -1))
	for part in _battle_parts(state):
		if int(part.get("uid", -2)) != uid:
			continue
		var rect := _part_rect(part, cell_size, origin).grow(3.0)
		draw_rect(rect, RED, false, maxf(2.0, cell_size.x * 0.06))
		var c := rect.get_center()
		var r := minf(rect.size.x, rect.size.y) * 0.62
		draw_arc(c, r, 0.0, TAU, 40, Color(RED, 0.55), 1.0, true)
		break


func _draw_impacts(cell_size: Vector2, origin: Vector2) -> void:
	var own_side := "enemy" if enemy_side else "player"
	for event in _battle_value("events", []):
		if event.get("kind", "") not in ["hit", "destroyed"]:
			continue
		var victim_side := "enemy" if event.get("side", "player") == "player" else "player"
		if victim_side != own_side:
			continue
		var age := float(_battle_value("elapsed", 0.0)) - float(event.get("time", 0.0))
		if age < 0.0 or age > 0.65:
			continue
		var victim := _find_battle_part(int(event.get("uid", -1)))
		if victim.is_empty():
			continue
		var center := _part_rect(victim, cell_size, origin).get_center()
		var radius := cell_size.x * (0.25 + (0.45 * age / 0.65))
		draw_arc(center, radius, 0.0, TAU, 28, Color(RED, 1.0 - age / 0.75), 2.0, true)


func _find_battle_part(uid: int) -> Dictionary:
	var state: Variant = _local_battle_state()
	if state == null:
		return {}
	for part in _battle_parts(state):
		if int(part.get("uid", -1)) == uid:
			return part
	return {}


func _part_rect(part: Dictionary, cell_size: Vector2, origin: Vector2) -> Rect2:
	var cell: Vector2i = part.get("cell", Vector2i.ZERO)
	return _cell_rect(cell, _part_size(part), cell_size, origin)


func _cell_rect(cell: Vector2i, dimensions: Vector2i, cell_size: Vector2, origin: Vector2) -> Rect2:
	var screen_x := cell.x
	if _is_mirrored_battle():
		screen_x = GRID_SIZE.x - cell.x - dimensions.x
	return Rect2(origin + Vector2(screen_x, cell.y) * cell_size, Vector2(dimensions) * cell_size)
