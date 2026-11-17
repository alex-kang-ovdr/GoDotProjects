extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var host = load("res://scenes/main.tscn").instantiate()
	root.add_child(host)
	await process_frame
	if host.state.get("state") != "ready":
		_fail("Standalone project did not load")
		return
	await _key(KEY_SPACE)
	if host.state.get("state") != "playing":
		_fail("Native Space event did not flap")
		return
	await create_timer(0.15).timeout
	if host.steps < 3:
		_fail("Godot physics clock did not advance")
		return
	await _key(KEY_P)
	var paused = host.state.duplicate(true)
	await create_timer(0.15).timeout
	if host.state.state != "paused" or host.state.bird != paused.bird or host.state.elapsed != paused.elapsed:
		_fail("Native pause did not freeze the game")
		return
	await _key(KEY_R)
	if host.state.state != "ready" or host.state.score != 0:
		_fail("Native restart did not reset the game")
		return
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	Input.parse_input_event(click)
	await process_frame
	await process_frame
	click = InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	Input.parse_input_event(click)
	if host.state.state != "playing":
		_fail("Native mouse click did not flap")
		return
	print("PASS native input: Space, P, R, mouse; realtime tick; pause freeze")
	quit(0)

func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	await process_frame
	event = InputEventKey.new()
	event.keycode = code
	Input.parse_input_event(event)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
