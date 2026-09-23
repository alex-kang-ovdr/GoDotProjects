class_name DialogueOverlay
extends Node2D

signal choice_selected(action: String)
signal dialogue_closed(entry_id: String)

var dialogue_queue: Array[Dictionary] = []
var current: Dictionary = {}
var choice_rects: Array[Rect2] = []

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
	# 대화 바깥 클릭도 월드로 흘려보내지 않는다.
	get_viewport().set_input_as_handled()

func panel_rect() -> Rect2:
	var viewport_size := get_viewport_rect().size
	var width := minf(830.0, viewport_size.x - 48.0)
	return Rect2((viewport_size.x - width) * 0.5, viewport_size.y - 230.0, width, 190.0)

func wrap_lines(text: String, width: float, font_size: int) -> PackedStringArray:
	var lines := PackedStringArray()
	var line := ""
	for word in text.split(" "):
		var next := word if line.is_empty() else "%s %s" % [line, word]
		if not line.is_empty() and ThemeDB.fallback_font.get_string_size(next, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > width:
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
	var panel := panel_rect()
	var choices: Array = current.get("choices", [])
	draw_rect(panel.grow(3.0), Color("5ddaff", 0.35), true)
	draw_rect(panel, Color(0.02, 0.05, 0.12, 0.94), true)
	draw_rect(panel, Color("87e8ff", 0.86), false, 1.5)
	var icon_rect := Rect2(panel.position + Vector2(18, 20), Vector2(76, 76))
	draw_rect(icon_rect, Color("133856"), true)
	draw_rect(icon_rect, Color("72d9ff"), false, 2.0)
	draw_string(ThemeDB.fallback_font, icon_rect.position + Vector2(8, 46), str(current.get("icon", "INFO")), HORIZONTAL_ALIGNMENT_CENTER, 60, 16, Color("b8f4ff"))
	var text_origin := panel.position + Vector2(112, 30)
	draw_string(ThemeDB.fallback_font, text_origin, str(current.get("speaker", "SYSTEM")), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("70ddff"))
	draw_string(ThemeDB.fallback_font, text_origin + Vector2(0, 24), str(current.get("title", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("f4fbff"))
	var body_lines := wrap_lines(str(current.get("body", "")), panel.size.x - 136.0, 14)
	for index in body_lines.size():
		draw_string(ThemeDB.fallback_font, text_origin + Vector2(0, 50 + index * 18), body_lines[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("d0e4f5"))
	choice_rects.clear()
	if choices.is_empty():
		draw_string(ThemeDB.fallback_font, panel.end - Vector2(142, 14), "ENTER / 클릭 · 계속", HORIZONTAL_ALIGNMENT_RIGHT, 132, 12, Color("8ab4ca"))
		return
	var choice_width := (panel.size.x - 50.0) / choices.size()
	for index in choices.size():
		var rect := Rect2(panel.position + Vector2(18 + index * choice_width, 140), Vector2(choice_width - 14, 35))
		choice_rects.append(rect)
		draw_rect(rect, Color("123a55"), true)
		draw_rect(rect, Color("65d8ff"), false, 1.0)
		draw_string(ThemeDB.fallback_font, rect.position + Vector2(10, 23), "%d · %s" % [index + 1, str(choices[index].get("label", "선택"))], HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 20, 14, Color("e8fbff"))
