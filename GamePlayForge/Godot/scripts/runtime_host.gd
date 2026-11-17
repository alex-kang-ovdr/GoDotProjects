extends Node2D
## One Godot process per play session. GDScript is trusted local project code.
## The native physics clock owns interactive play; manual clock is for replay/tests.

const View = preload("res://scripts/tappy_view.gd")
const RUNTIME := "PlayForge Godot / GDScript"
const MAX_MESSAGE := 512000
const MAX_RESPONSE := 4 * 1024 * 1024
var game: RefCounted
var game_script: GDScript
var view: Node2D
var state: Dictionary = {}
var last_error := ""
var peer := StreamPeerTCP.new()
var incoming := PackedByteArray()
var bridge_port := 0
var bridge_token := ""
var greeted := false
var realtime := true
var connected_at := 0
var steps := 0
var root_dir := ""
var project_dir := ""
var manifest: Dictionary = {}
var serialization_nodes := 0
var serialization_bytes := 0

func _ready() -> void:
	root_dir = "res://" if FileAccess.file_exists("res://Projects/TappyChicken/project.json") else ProjectSettings.globalize_path("res://").path_join("..").simplify_path()
	project_dir = root_dir.path_join("Projects/TappyChicken")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--bridge-port="):
			bridge_port = int(arg.get_slice("=", 1))
		elif arg.begins_with("--bridge-token="):
			bridge_token = arg.get_slice("=", 1)
	realtime = bridge_port == 0 or "--realtime" in OS.get_cmdline_user_args()
	Engine.max_fps = 240 if not realtime else 60
	manifest = _read_json(project_dir.path_join("project.json"))
	view = View.new()
	view.position.y = 50
	add_child(view)
	if view.configure(project_dir, manifest) != OK:
		last_error = "Project assets could not be loaded"
		view.message = last_error
		queue_redraw()
		get_tree().quit(2)
		return
	if bridge_port > 0:
		connected_at = Time.get_ticks_msec()
		if bridge_token.is_empty() or peer.connect_to_host("127.0.0.1", bridge_port) != OK:
			get_tree().quit(2)
	else:
		var source_file := FileAccess.open(project_dir.path_join(manifest.get("runtime", {}).get("entry", "Scripts/Game.gd")), FileAccess.READ)
		if source_file == null:
			last_error = "Game source was not found"
		else:
			var result := execute({"op": "load", "source": source_file.get_as_text(), "settings": _read_json(project_dir.path_join(manifest.get("settings", "Gameplay.settings.json")))})
			if not result.ok:
				last_error = result.error
	queue_redraw()

func _read_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}

func _physics_process(delta: float) -> void:
	if realtime and game != null and state.get("state", "") == "playing":
		game.update(delta)
		steps += 1
		var result := _snapshot()
		if not result.ok:
			last_error = result.error
			game = null

func _process(_delta: float) -> void:
	if bridge_port == 0:
		return
	peer.poll()
	var status := peer.get_status()
	if status == StreamPeerTCP.STATUS_CONNECTED:
		if not greeted:
			peer.set_no_delay(true)
			_send({"type": "ready", "token": bridge_token})
			greeted = true
		var available := peer.get_available_bytes()
		if incoming.size() + available > MAX_MESSAGE:
			get_tree().quit(3)
			return
		if available > 0:
			var read := peer.get_data(available)
			if read[0] != OK:
				get_tree().quit(3)
				return
			incoming.append_array(read[1])
		for _index in range(16):
			var newline := incoming.find(10)
			if newline < 0:
				break
			var packet = JSON.parse_string(incoming.slice(0, newline).get_string_from_utf8())
			incoming = incoming.slice(newline + 1)
			if not packet is Dictionary:
				get_tree().quit(3)
				return
			var result: Dictionary
			var command = packet.get("command")
			if command is Dictionary and command.get("op", "") == "capture":
				if DisplayServer.get_name() == "headless":
					result = _error("Capture requires a visible renderer")
				else:
					await RenderingServer.frame_post_draw
					var output := root_dir.path_join("Saved/Tests/godot-native.png")
					DirAccess.make_dir_recursive_absolute(output.get_base_dir())
					var saved := get_viewport().get_texture().get_image().save_png(output)
					result = {"ok": saved == OK, "path": output, "engine": _engine_info()}
			else:
				result = execute(packet.get("command"))
			_send({"id": packet.get("id"), "result": result})
	elif greeted or status == StreamPeerTCP.STATUS_ERROR or Time.get_ticks_msec() - connected_at > 10000:
		get_tree().quit()

func _send(value: Dictionary) -> void:
	if peer.put_data((JSON.stringify(value) + "\n").to_utf8_buffer()) != OK:
		get_tree().quit(3)

func execute(command) -> Dictionary:
	if not command is Dictionary or not command.get("op") is String:
		return _error("command must be an object with a string op")
	var op: String = command.op
	if op == "stop":
		game = null
		game_script = null
		state = {}
		view.message = "Stopped — start from Studio"
		view.show_state(state)
		return {"ok": true, "runtime": RUNTIME, "state": null, "engine": _engine_info()}
	if op == "load":
		if not command.get("source") is String or command.source.to_utf8_buffer().size() > 256000:
			return _error("load requires a GDScript source string under 256 KB")
		if not command.get("settings", {}) is Dictionary:
			return _error("load settings must be an object")
		game = null
		state = {}
		view.show_state(state)
		game_script = GDScript.new()
		game_script.source_code = command.source
		if game_script.reload() != OK or not game_script.can_instantiate():
			game_script = null
			return _error("Game.gd could not compile; inspect the Godot diagnostic log")
		if game_script.get_instance_base_type() != "RefCounted":
			return _error("Game.gd must extend RefCounted")
		var instance = game_script.new()
		for method in ["reset", "input", "update", "snapshot"]:
			if not instance.has_method(method):
				return _error("Game.%s is not defined" % method)
		for method in game_script.get_script_method_list():
			if method.name in ["reset", "input", "update", "snapshot"]:
				var expected := 0 if method.name == "snapshot" else 1
				if method.args.size() < expected or method.args.size() - method.default_args.size() > expected:
					return _error("Game.%s has an invalid argument count" % method.name)
		game = instance
		steps = 0
		last_error = ""
		game.reset(command.get("settings", {}))
	elif game == null:
		return _error("no GDScript game is loaded")
	elif op == "step":
		var dt = command.get("dt")
		if not (dt is float or dt is int) or not is_finite(dt) or dt < 0 or dt > 1:
			return _error("dt must be finite and between 0 and 1")
		if realtime:
			return _error("step is disabled while the Godot realtime clock is active; use snapshot")
		game.update(float(dt))
		steps += 1
	elif op == "input":
		var action = command.get("action")
		if not action is String or action.is_empty() or action.to_utf8_buffer().size() > 128:
			return _error("input action must contain 1 to 128 bytes")
		game.input(action)
	elif op == "settings":
		if not command.get("settings") is Dictionary:
			return _error("settings requires a settings object")
		game.reset(command.settings)
		steps = 0
	elif op != "snapshot":
		return _error("unsupported op: " + op)
	return _snapshot()

func _snapshot() -> Dictionary:
	var value = game.snapshot()
	serialization_nodes = 0
	serialization_bytes = 0
	if not value is Dictionary or not _json_value(value, [], 0):
		return _error("Game.snapshot must return a JSON-compatible Dictionary within serialization limits")
	if JSON.stringify(value).to_utf8_buffer().size() > MAX_RESPONSE - 4096:
		return _error("snapshot exceeds 4 MiB serialization limit")
	var presents_tappy: bool = value.has_all(["bird", "world", "pipes", "settings"])
	if presents_tappy and not _valid_tappy_view(value):
		return _error("Invalid Tappy presentation snapshot")
	state = value.duplicate(true)
	if OS.has_feature("web"):
		# Read-only inspection for the web preview and cross-runtime PoC checks.
		JavaScriptBridge.get_interface("window").PlayForgeRuntimeState = JSON.stringify(state)
	# A custom game's diagnostic snapshot may have no Tappy presentation fields.
	if presents_tappy:
		view.show_state(state)
	queue_redraw()
	return {"ok": true, "runtime": RUNTIME, "state": state, "engine": _engine_info()}

func _json_value(value, ancestors: Array, depth: int) -> bool:
	serialization_nodes += 1
	serialization_bytes += 8
	if depth > 64 or serialization_nodes > 100000 or serialization_bytes > MAX_RESPONSE:
		return false
	if value is String:
		serialization_bytes += value.to_utf8_buffer().size()
		return serialization_bytes <= MAX_RESPONSE
	if value is float:
		return is_finite(value)
	if value == null or value is bool or value is int:
		return true
	if value is Dictionary or value is Array:
		for parent in ancestors:
			if is_same(parent, value):
				return false
		ancestors.append(value)
		if value is Dictionary:
			for key in value:
				if not key is String or not _json_value(key, ancestors, depth + 1) or not _json_value(value[key], ancestors, depth + 1):
					ancestors.pop_back()
					return false
		else:
			for item in value:
				if not _json_value(item, ancestors, depth + 1):
					ancestors.pop_back()
					return false
		ancestors.pop_back()
		return true
	return false

func _numbers(value, keys: Array) -> bool:
	if not value is Dictionary:
		return false
	for key in keys:
		var number = value.get(key)
		if not (number is int or number is float) or not is_finite(number) or absf(number) > 10000000:
			return false
	return true

func _valid_tappy_view(value: Dictionary) -> bool:
	if not _numbers(value.bird, ["x", "y", "angle"]) or not _numbers(value.world, ["width", "height", "ground"]):
		return false
	if not _numbers(value.settings, ["pipeWidth"]) or value.settings.pipeWidth <= 0:
		return false
	if not value.pipes is Array or value.pipes.size() > 4096:
		return false
	for pipe in value.pipes:
		if not _numbers(pipe, ["x", "top", "bottom"]):
			return false
	return true

func _engine_info() -> Dictionary:
	return {"name": "Godot", "version": Engine.get_version_info().string,
		"renderer": DisplayServer.get_name(), "clock": "realtime" if realtime else "manual",
		"nodes": get_tree().get_node_count(), "steps": steps, "fps": Engine.get_frames_per_second(),
		"physics_hz": Engine.physics_ticks_per_second}

func _error(message: String) -> Dictionary:
	last_error = message
	queue_redraw()
	return {"ok": false, "error": message, "engine": _engine_info()}

func _unhandled_input(event: InputEvent) -> void:
	var action := ""
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE: action = "flap"
			KEY_P: action = "togglePause"
			KEY_R: action = "restart"
			KEY_ESCAPE: get_tree().quit()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		action = "flap"
	if game != null and not action.is_empty():
		execute({"op": "input", "action": action})

func _draw() -> void:
	var font: Font = ThemeDB.fallback_font
	draw_string(font, Vector2(18, 32), "PLAYFORGE  /  GODOT", HORIZONTAL_ALIGNMENT_LEFT, 440, 21, Color("d9eef0"))
	var footer := "Space / click: flap   P: pause   R: restart   Esc: close"
	if not last_error.is_empty():
		footer = last_error
	draw_string(font, Vector2(12, 709), footer, HORIZONTAL_ALIGNMENT_LEFT, 456, 14, Color("9db9c8"))

func _exit_tree() -> void:
	peer.disconnect_from_host()
	game = null
	game_script = null
