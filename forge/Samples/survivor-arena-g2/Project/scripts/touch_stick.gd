extends Control
## Pointer capture works for mouse/touch; keyboard can be used at the same time.
var vector: Vector2 = Vector2.ZERO
var dragging: bool = false
var origin: Vector2 = Vector2.ZERO
var current: Vector2 = Vector2.ZERO
var enabled: bool = false
var touch_id: int = -1
const RADIUS: float = 62.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _input(event: InputEvent) -> void:
	if not enabled:
		clear()
		return
	if event is InputEventScreenTouch:
		# End an existing capture even if a GUI overlay consumed the release.
		# New captures are started only after native GUI has seen the press.
		if event.index == touch_id and not event.pressed:
			clear()
	elif event is InputEventScreenDrag and event.index == touch_id:
		_move(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if not event.pressed and touch_id == -2:
			clear()
	elif event is InputEventMouseMotion and touch_id == -2:
		_move(event.position)

func _unhandled_input(event: InputEvent) -> void:
	if not enabled or dragging:
		return
	if event is InputEventScreenTouch and event.pressed:
		if _inside_play_area(event.position):
			touch_id = event.index
			_begin(event.position)
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if _inside_play_area(event.position):
			touch_id = -2
			_begin(event.position)
			get_viewport().set_input_as_handled()

func _inside_play_area(at: Vector2) -> bool:
	return at.x >= 0 and at.x < size.x*0.65 and at.y > 110 and at.y < size.y

func _begin(at: Vector2) -> void:
	dragging = true
	origin = at
	current = at
	vector = Vector2.ZERO
	queue_redraw()

func _move(at: Vector2) -> void:
	current = origin + (at - origin).limit_length(RADIUS)
	vector = (current - origin) / RADIUS
	if vector.length() < 0.08:
		vector = Vector2.ZERO
	queue_redraw()

func clear() -> void:
	dragging = false
	vector = Vector2.ZERO
	touch_id = -1
	queue_redraw()

func _draw() -> void:
	if dragging and enabled:
		draw_circle(origin, RADIUS, Color(0.07,0.14,0.16,0.35))
		draw_arc(origin, RADIUS, 0, TAU, 64, Color(0.7,0.94,0.82,0.5),2,true)
		draw_circle(current, 23, Color(0.7,0.94,0.82,0.65))
		draw_circle(current, 8, Color(0.95,0.97,0.88,0.9))
