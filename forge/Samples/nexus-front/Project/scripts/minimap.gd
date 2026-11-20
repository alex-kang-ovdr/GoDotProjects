extends Control
signal camera_requested(point: Vector2)
var world
var camera_view
var font: Font
func _ready():
	font = load("res://assets/NexusSansKR.otf")
	mouse_filter = Control.MOUSE_FILTER_STOP
func _process(_dt):
	if world != null:
		queue_redraw()
func _draw():
	draw_rect(Rect2(Vector2.ZERO, size), Color("07131d"))
	if world == null:
		return
	var s = size.x / world.size
	for lane in world.lanes.values():
		var pts = PackedVector2Array()
		for p in lane:
			pts.append(p * s)
		draw_polyline(pts, Color("45584e"), 6.0, true)
	for wall in world.map.obstacles:
		draw_circle(Vector2(wall.x, wall.y) * s, maxf(2, wall.r * s), Color("283e42"))
	# Share the revision-cached fog texture; one draw rather than 6,400 cells/frame.
	if camera_view != null and camera_view.get("_fog_texture") != null:
		draw_texture_rect(camera_view.get("_fog_texture"), Rect2(Vector2.ZERO, size), false)
	for obs in world.vision.structure_observations(0):
		if not obs.get("alive", false):
			continue
		var c = Color("62d7e5") if obs.team == 0 else Color("f08086")
		if obs.get("remembered", false):
			c = c.darkened(0.5)
		var r = 4.0 if obs.kind == "nexus" else 2.5
		draw_rect(Rect2(obs.pos * s - Vector2.ONE * r, Vector2.ONE * r * 2), c)
	for e in world.entities:
		if not e.alive or not world.visible_to(e, 0):
			continue
		if e.kind in ["tower", "inhibitor", "nexus"]:
			continue
		var c = Color("62d7e5") if e.team == 0 else (Color("f08086") if e.team == 1 else Color("d5ad71"))
		var r = 3.5 if e.kind == "hero" else 1.5
		draw_circle(e.pos * s, r, c)
		if e.get("is_player", false):
			draw_arc(e.pos * s, 6, 0, TAU, 24, Color("f6e6b7"), 1.5, true)
	for hint in world.vision.attack_reveals(0):
		var pos = hint.get("pos", Vector2(hint.get("x", 0), hint.get("y", 0)))
		draw_arc(pos * s, 6, 0, TAU, 24, Color("edb779"), 1.5, true)
	if camera_view != null:
		var rect = Rect2((camera_view.camera_pos - camera_view.size / (camera_view.zoom * 2)) * s, camera_view.size / camera_view.zoom * s)
		draw_rect(rect, Color("e5dfbe70"), false, 1.0)
	draw_rect(Rect2(Vector2.ZERO, size), Color("54707c"), false, 1.0)
func _gui_input(event):
	if world != null and event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		camera_requested.emit(event.position / size.x * world.size)
		accept_event()
