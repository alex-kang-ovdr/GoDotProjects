class_name DialogueOverlay
extends Node2D

const UiTheme = preload("res://scripts/ui_scale_theme.gd")

signal choice_selected(action: String)
signal dialogue_closed(entry_id: String)

var dialogue_queue: Array[Dictionary] = []
var current: Dictionary = {}
var choice_rects: Array[Rect2] = []

func _ready() -> void:
	if get_viewport() != null:
		get_viewport().size_changed.connect(queue_redraw)

func enqueue(entry: Dictionary) -> void:
	if entry.is_empty():
		return
	dialogue_queue.append(entry.duplicate(true))
	if current.is_empty():
		show_next()

func is_showing() -> bool:
	return not current.is_empty()

func current_id() -> String:
	return str(current.get("id", ""))

func show_next() -> void:
	if dialogue_queue.is_empty():
		current = {}
		choice_rects.clear()
		queue_redraw()
		return
	current = dialogue_queue.pop_front()
	choice_rects.clear()
	queue_redraw()

func choose(index: int) -> String:
	var choices: Array = current.get("choices", [])
	if index < 0 or index >= choices.size():
		return ""
	var action := str(choices[index].get("action", ""))
	close_current()
	if not action.is_empty():
		choice_selected.emit(action)
	return action

func dismiss() -> void:
	if current.is_empty() or not (current.get("choices", []) as Array).is_empty():
		return
	close_current()

func close_current() -> void:
	var closing_id := current_id()
	show_next()
	dialogue_closed.emit(closing_id)

func _input(event: InputEvent) -> void:
	if current.is_empty():
		return
	if event is InputEventMouse and event.device == -1: return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_1 or event.keycode == KEY_KP_1:
			choose(0)
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_2 or event.keycode == KEY_KP_2:
			choose(1)
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
			dismiss()
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		for index in choice_rects.size():
			if choice_rects[index].has_point(event.position):
				choose(index)
				get_viewport().set_input_as_handled()
				return
		if panel_rect().has_point(event.position) and (current.get("choices", []) as Array).is_empty():
			dismiss()
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch and event.pressed:
		for index in choice_rects.size():
			if choice_rects[index].has_point(event.position):
				choose(index)
				get_viewport().set_input_as_handled()
				return
		if panel_rect().has_point(event.position): dismiss()
	get_viewport().set_input_as_handled()

func panel_rect() -> Rect2:
	var vp := get_viewport_rect().size
	var width := minf(980.0, vp.x - 24.0)
	var height := minf(268.0, maxf(212.0, vp.y - 310.0))
	var bottom_clearance := 276.0 if vp.x < 960.0 else 118.0
	var py := clampf(vp.y - bottom_clearance - height, 12.0, maxf(12.0, vp.y - height - 12.0))
	return Rect2((vp.x - width) * 0.5, py, width, height)

func wrap_lines(text: String, width: float, font_size: int, font: Font) -> PackedStringArray:
	var lines := PackedStringArray()
	var line := ""
	for word in text.split(" "):
		var next := word if line.is_empty() else "%s %s" % [line, word]
		if not line.is_empty() and font.get_string_size(next, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > width:
			lines.append(line)
			line = word
		else:
			line = next
	if not line.is_empty():
		lines.append(line)
	return lines

func _draw() -> void:
	if current.is_empty():
		return
	var font := UiTheme.load_ui_font()
	if font == null:
		return
	var panel := panel_rect()
	var choices: Array = current.get("choices", [])
	draw_rect(panel.grow(4.0), Color("5ddaff", 0.35), true)
	draw_rect(panel, Color(0.02, 0.05, 0.12, 0.96), true)
	draw_rect(panel, Color("87e8ff", 0.90), false, 2.2)
	var icon_rect := Rect2(panel.position + Vector2(18, 22), Vector2(88, 88))
	draw_rect(icon_rect, Color("133856"), true)
	draw_rect(icon_rect, Color("72d9ff"), false, 2.2)
	draw_string(font, icon_rect.position + Vector2(6, 54), str(current.get("icon", "INFO")), HORIZONTAL_ALIGNMENT_CENTER, 76, 24, Color("b8f4ff"))
	var text_origin := panel.position + Vector2(124, 38)
	draw_string(font, text_origin, str(current.get("speaker", "SYSTEM")), HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 144.0, 20, Color("70ddff"))
	draw_string(font, text_origin + Vector2(0, 34), str(current.get("title", "")), HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 144.0, 28, Color("f4fbff"))
	var body_lines := wrap_lines(str(current.get("body", "")), panel.size.x - 148.0, 21, font)
	for index in mini(body_lines.size(), 3):
		draw_string(font, text_origin + Vector2(0, 68 + index * 27), body_lines[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 21, Color("d0e4f5"))
	choice_rects.clear()
	if choices.is_empty():
		draw_string(font, panel.end - Vector2(246, 18), "ENTER / 터치 · 계속", HORIZONTAL_ALIGNMENT_RIGHT, 232, 20, Color("8ab4ca"))
		return
	var choice_width := (panel.size.x - 42.0) / choices.size()
	for index in choices.size():
		var rect := Rect2(panel.position + Vector2(18 + index * choice_width, panel.size.y - 68.0), Vector2(choice_width - 12, 52))
		choice_rects.append(rect)
		draw_rect(rect, Color("123a55"), true)
		draw_rect(rect, Color("65d8ff"), false, 1.8)
		draw_string(font, rect.position + Vector2(12, 34), "%d · %s" % [index + 1, str(choices[index].get("label", "선택"))], HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 24, 21, Color("e8fbff"))
