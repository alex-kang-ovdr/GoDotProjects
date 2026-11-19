@tool
extends EditorPlugin

func _enter_tree() -> void:
	call_deferred("_probe")

func _probe() -> void:
	for _i in 20:
		await get_tree().process_frame
		if get_tree().get_first_node_in_group(&"playforge_remote_control") != null:
			break
	var rc := get_tree().get_first_node_in_group(&"playforge_remote_control")
	if rc == null:
		_finish({"ok": false, "error": "playforge_remote_control addon not loaded"})
		return
	var enabled: bool = rc.call(&"is_remote_control_enabled")
	var caps_cmd: Dictionary = rc.call(&"execute_command", {"jsonrpc": "2.0", "id": "rc-caps", "method": "capabilities.list"})
	var tools_cmd: Dictionary = rc.call(&"execute_command", {"jsonrpc": "2.0", "id": "rc-tools", "method": "tools/list"})
	var open_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-0", "command": "scene.open", "arguments": {"scenePath": "res://scenes/main.tscn"}})
	for _j in 20:
		await get_tree().process_frame
		if EditorInterface.get_edited_scene_root() != null:
			break
	var tappy_ops := [
		{"kind": "asset.write", "objectId": ".", "path": "res://Assets/chicken.svg", "value": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><circle cx=\"32\" cy=\"32\" r=\"24\" fill=\"#ffd447\"/></svg>"},
		{"kind": "script.write", "objectId": ".", "path": "res://Scripts/TappyRC.gd", "value": "extends Node2D\nfunc _ready() -> void:\n\tprint(\"RC_TAPPY_READY\")\n"},
		{"kind": "node.add", "objectId": "Bird", "type": "Sprite2D"},
		{"kind": "property.set", "objectId": "Bird", "propertyId": "texture", "value": "res://Assets/chicken.svg"},
		{"kind": "property.set", "objectId": "Bird", "propertyId": "position", "value": [160.0, 280.0]},
		{"kind": "script.attach", "objectId": ".", "value": "res://Scripts/TappyRC.gd"},
	]
	var apply_cmd: Dictionary = rc.call(&"execute_command", {
		"jsonrpc": "2.0",
		"id": "rc-apply",
		"method": "tools/call",
		"params": {"name": "pf_workspace_apply", "arguments": {"operations": tappy_ops}},
	})
	var state_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-1", "command": "state.get"})
	var undo_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-undo", "command": "editor.undo", "arguments": {"steps": 1}})
	var redo_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-redo", "command": "editor.redo", "arguments": {"steps": 1}})
	var save_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-3", "command": "scene.save"})
	_finish({
		"ok": true,
		"enabled": enabled,
		"capsCmd": caps_cmd,
		"toolsCmd": tools_cmd,
		"openCmd": open_cmd,
		"applyCmd": apply_cmd,
		"stateCmd": state_cmd,
		"undoCmd": undo_cmd,
		"redoCmd": redo_cmd,
		"saveCmd": save_cmd,
	})

func _finish(payload: Dictionary) -> void:
	var out_path := OS.get_environment("PLAYFORGE_RC_PROBE_OUT")
	if not out_path.is_empty():
		var file := FileAccess.open(out_path, FileAccess.WRITE)
		if file != null:
			file.store_string(JSON.stringify(payload))
			file.close()
	get_tree().quit(0 if payload.get("ok", false) else 1)
