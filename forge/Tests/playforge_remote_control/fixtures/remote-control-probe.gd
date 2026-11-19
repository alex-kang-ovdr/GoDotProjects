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
	var open_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-0", "command": "scene.open", "arguments": {"scenePath": "res://scenes/main.tscn"}})
	for _j in 20:
		await get_tree().process_frame
		if EditorInterface.get_edited_scene_root() != null:
			break
	var state: Dictionary = rc.call(&"collect_editor_state")
	var state_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-1", "command": "state.get"})
	var apply_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-2", "command": "workspace.apply", "arguments": {"operations": []}})
	var save_cmd: Dictionary = rc.call(&"execute_command", {"id": "rc-3", "command": "scene.save"})
	_finish({
		"ok": true,
		"enabled": enabled,
		"openCmd": open_cmd,
		"state": state,
		"stateCmd": state_cmd,
		"applyCmd": apply_cmd,
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
