class_name FlickScrollContainer
extends ScrollContainer

## 스크롤바 없이 터치/마우스 드래그 및 플릭 관성으로 부드럽게 스크롤하는 컨테이너.
## 10px 이상 드래그하면 내부 버튼 클릭을 억제해 오작동을 방지한다.

const DRAG_THRESHOLD_PX := 10.0
const FRICTION_RATE := 5.4
const STOP_VELOCITY := 14.0

var _dragging := false
var _drag_moved := false
var _pointer_id := -2 # -1 = mouse, >=0 = touch index
var _press_pos := Vector2.ZERO
var _last_pos := Vector2.ZERO
var _last_time_sec := 0.0
var _scroll_float := 0.0
var _velocity_y := 0.0

func _ready() -> void:
	vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	follow_focus = false
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_PASS

func _max_scroll_y() -> float:
	if get_child_count() == 0:
		return 0.0
	var content := get_child(0) as Control
	if content == null:
		return 0.0
	return maxf(0.0, content.size.y - size.y)

func _set_scroll_clamped(next_y: float) -> void:
	var max_y := _max_scroll_y()
	_scroll_float = clampf(next_y, 0.0, max_y)
	scroll_vertical = int(round(_scroll_float))
	if _scroll_float <= 0.0 or _scroll_float >= max_y:
		_velocity_y = 0.0

func _process(delta: float) -> void:
	if _dragging or absf(_velocity_y) <= 0.1:
		return
	_set_scroll_clamped(_scroll_float + _velocity_y * delta)
	_velocity_y *= exp(-FRICTION_RATE * delta)
	if absf(_velocity_y) < STOP_VELOCITY:
		_velocity_y = 0.0

func _begin_drag(pointer_id: int, pos: Vector2) -> void:
	_dragging = true
	_drag_moved = false
	_pointer_id = pointer_id
	_press_pos = pos
	_last_pos = pos
	_last_time_sec = float(Time.get_ticks_usec()) * 0.000001
	_scroll_float = float(scroll_vertical)
	_velocity_y = 0.0

func _update_drag(pos: Vector2) -> void:
	var now := float(Time.get_ticks_usec()) * 0.000001
	var dt := maxf(now - _last_time_sec, 0.004)
	var dy := _last_pos.y - pos.y
	if not _drag_moved and pos.distance_to(_press_pos) >= DRAG_THRESHOLD_PX:
		_drag_moved = true
		# 드래그 전환 시 포커스 해제해 버튼 눌림 시각 효과 정리
		var owner_vp := get_viewport()
		if owner_vp != null:
			var fo := owner_vp.gui_get_focus_owner()
			if fo != null:
				fo.release_focus()
	if _drag_moved:
		_set_scroll_clamped(_scroll_float + dy)
		var inst_vel := clampf(dy / dt, -2600.0, 2600.0)
		_velocity_y = lerpf(_velocity_y, inst_vel, 0.45)
	_last_pos = pos
	_last_time_sec = now

func _end_drag() -> bool:
	var was_drag := _drag_moved
	_dragging = false
	_drag_moved = false
	_pointer_id = -2
	return was_drag

func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		if _dragging:
			_end_drag()
		return

	if event is InputEventScreenTouch:
		var te := event as InputEventScreenTouch
		if te.pressed:
			if not _dragging and get_global_rect().has_point(te.position):
				_begin_drag(te.index, te.position)
		elif _dragging and te.index == _pointer_id:
			if _end_drag():
				get_viewport().set_input_as_handled()
		return

	if event is InputEventScreenDrag:
		var de := event as InputEventScreenDrag
		if _dragging and de.index == _pointer_id:
			_update_drag(de.position)
			if _drag_moved:
				get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.device == -1:
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed and get_global_rect().has_point(mb.position):
			_scroll_float = float(scroll_vertical)
			_velocity_y = -480.0
			_set_scroll_clamped(_scroll_float - 46.0)
			get_viewport().set_input_as_handled()
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed and get_global_rect().has_point(mb.position):
			_scroll_float = float(scroll_vertical)
			_velocity_y = 480.0
			_set_scroll_clamped(_scroll_float + 46.0)
			get_viewport().set_input_as_handled()
			return
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				if not _dragging and get_global_rect().has_point(mb.position):
					_begin_drag(-1, mb.position)
			elif _dragging and _pointer_id == -1:
				if _end_drag():
					get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if mm.device == -1:
			return
		if _dragging and _pointer_id == -1:
			_update_drag(mm.position)
			if _drag_moved:
				get_viewport().set_input_as_handled()
