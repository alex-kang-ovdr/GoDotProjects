class_name RemoteCaptainShip
extends Node2D

## Visual & hit-proxy representation of another online captain's modular ship.
## Reconstructs the remote ShipModel from compact blueprint syncs and smoothly
## extrapolates position & rotation between MMO state updates.

const ShipModelScript = preload("res://scripts/ship_model.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var peer_id := ""
var captain_name := "Captain"
var model: ShipModel = ShipModelScript.new()
var target_position := Vector2.ZERO
var target_velocity := Vector2.ZERO
var target_rotation := -PI * 0.5
var target_angular_velocity := 0.0
var thrust_mask := 0
var shield_layers := 0
var hull_ratio := 1.0
var salvage_score := 0
var phase := "playing"
var hit_flash := 0.0
var _initialized := false


func setup(next_peer_id: String, next_name: String) -> void:
	peer_id = next_peer_id
	captain_name = next_name if not next_name.is_empty() else ("Cap-" + next_peer_id)
	model.initialize_player()
	queue_redraw()


func apply_event(event: Dictionary) -> void:
	var incoming_name := str(event.get("name", "")).strip_edges()
	if not incoming_name.is_empty():
		captain_name = incoming_name
	target_position = Vector2(float(event.get("x", target_position.x)), float(event.get("y", target_position.y)))
	target_velocity = Vector2(float(event.get("vx", target_velocity.x)), float(event.get("vy", target_velocity.y)))
	target_rotation = float(event.get("rot", target_rotation))
	target_angular_velocity = float(event.get("vrot", target_angular_velocity))
	thrust_mask = int(event.get("thrust", thrust_mask))
	shield_layers = int(event.get("shields", shield_layers))
	hull_ratio = clampf(float(event.get("hull_ratio", event.get("hullRatio", hull_ratio))), 0.0, 1.0)
	salvage_score = int(event.get("salvage", salvage_score))
	phase = str(event.get("phase", phase))
	if not _initialized:
		_initialized = true
		global_position = target_position
		global_rotation = target_rotation
	if event.has("blueprint") and event["blueprint"] is Array and not (event["blueprint"] as Array).is_empty():
		apply_blueprint(event["blueprint"] as Array)
	visible = phase != "destroyed"
	queue_redraw()


func apply_blueprint(blueprint: Array) -> void:
	var next_model: ShipModel = ShipModelScript.new()
	for entry in blueprint:
		if not entry is Array or entry.size() < 4:
			continue
		var kind := str(entry[0])
		if not BalanceData.MODULES.has(kind):
			kind = "block"
		var cell := Vector2i(int(entry[1]), int(entry[2]))
		var turns := posmod(int(entry[3]), 4)
		var part := next_model.add(kind, cell, turns)
		if entry.size() >= 5:
			part.hp = maxf(0.1, part.max_hp * clampf(float(entry[4]), 0.0, 1.0))
	if next_model.parts.is_empty():
		next_model.initialize_player()
	model = next_model
	queue_redraw()


func flash_hit() -> void:
	hit_flash = 0.22
	queue_redraw()


func _process(delta: float) -> void:
	if not _initialized:
		return
	target_position += target_velocity * delta
	target_rotation += target_angular_velocity * delta
	var dist_sq := global_position.distance_squared_to(target_position)
	if dist_sq > 900.0 * 900.0:
		global_position = target_position
		global_rotation = target_rotation
	else:
		var blend := 1.0 - exp(-12.0 * delta)
		global_position = global_position.lerp(target_position, blend)
		global_rotation = lerp_angle(global_rotation, target_rotation, blend)
	if hit_flash > 0.0:
		hit_flash = maxf(0.0, hit_flash - delta)
	queue_redraw()


func projectile_hit(from_world: Vector2, to_world: Vector2) -> Dictionary:
	if not visible or phase == "destroyed":
		return {}
	var from := to_local(from_world)
	var to := to_local(to_world)
	if ShipBodyScript.segment_box_fraction(from, to, model.collision_box_rect().grow(6.0)) == INF:
		return {}
	var best := INF
	var hit_part: PartData = null
	for part in model.parts:
		for cell in part.cells():
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * (BalanceData.CELL * 0.5 + 3.0), Vector2.ONE * (BalanceData.CELL + 6.0))
			var fraction: float = ShipBodyScript.segment_box_fraction(from, to, rect)
			if fraction < best:
				best = fraction
				hit_part = part
	return {"part": hit_part, "fraction": best} if hit_part != null else {}


func _draw() -> void:
	if not visible:
		return
	var half := BalanceData.CELL * 0.5
	var bounds := model.collision_box_rect()
	# Remote captain teal aura + shield layers
	if shield_layers > 0:
		var radius := model.bound_radius() + 10.0
		var opacity: float = VisualData.SHIELD_LAYER_OPACITY[clampi(shield_layers, 0, VisualData.SHIELD_LAYER_OPACITY.size() - 1)]
		draw_arc(bounds.get_center(), radius, 0.0, TAU, 36, Color(0.32, 0.92, 1.0, opacity), 2.5)
	for part in model.parts:
		var spec := part.spec()
		var fill := Color(str(spec.get("fill", "334661"))).lerp(Color("4ef5d6"), 0.16)
		var stroke := Color(str(spec.get("stroke", "a9bed9")))
		if hit_flash > 0.0:
			fill = fill.lerp(Color.WHITE, hit_flash * 2.5)
		var hp_ratio := clampf(part.hp / maxf(part.max_hp, 1.0), 0.0, 1.0)
		if hp_ratio < 0.65:
			fill = fill.lerp(Color("ff6b4a"), (0.65 - hp_ratio) * 0.85)
		for cell in part.cells():
			var center := Vector2(cell) * BalanceData.CELL
			var rect := Rect2(center - Vector2.ONE * (half - 2.0), Vector2.ONE * (BalanceData.CELL - 4.0))
			draw_rect(rect, fill, true)
			draw_rect(rect, stroke, false, 2.0)
			if part.kind == "core":
				draw_circle(center, 7.0, Color("7ef9ff"))
			elif part.kind == "thruster" and (thrust_mask & 1) != 0:
				var flame := PackedVector2Array([
					center + Vector2(-half, -6.0),
					center + Vector2(-half - 22.0, 0.0),
					center + Vector2(-half, 6.0),
				])
				draw_colored_polygon(flame, Color("55f4ff", 0.85))
	# Upright floating captain nameplate + hull bar
	var label_offset := Vector2(0.0, -(model.bound_radius() + 26.0))
	draw_set_transform(Vector2.ZERO, -global_rotation, Vector2.ONE)
	var badge := "%s (%d파트)" % [captain_name, model.parts.size()]
	var bar_w := 88.0
	var bar_pos := label_offset + Vector2(-bar_w * 0.5, 6.0)
	draw_rect(Rect2(bar_pos - Vector2(2.0, 2.0), Vector2(bar_w + 4.0, 8.0)), Color(0.02, 0.06, 0.12, 0.82), true)
	draw_rect(Rect2(bar_pos, Vector2(bar_w * hull_ratio, 4.0)), Color("4ef5d6") if hull_ratio > 0.4 else Color("ff7b54"), true)
	draw_string(ThemeDB.fallback_font, label_offset + Vector2(-90.0, 0.0), badge, HORIZONTAL_ALIGNMENT_CENTER, 180.0, 13, Color("a8fff0"))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
