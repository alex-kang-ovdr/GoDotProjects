@tool
extends EditorPlugin

const MAX_NODES := 120
const MAX_DEPTH := 6

var _web_remote_callback: JavaScriptObject


func _enter_tree() -> void:
	add_to_group(&"playforge_remote_control")
	if not is_remote_control_enabled():
		return
	EditorInterface.get_selection().selection_changed.connect(_on_editor_state_changed)
	scene_changed.connect(_on_scene_changed)
	if OS.has_feature("web"):
		_install_web_remote_bridge()


func _exit_tree() -> void:
	if EditorInterface.get_selection().selection_changed.is_connected(_on_editor_state_changed):
		EditorInterface.get_selection().selection_changed.disconnect(_on_editor_state_changed)
	if scene_changed.is_connected(_on_scene_changed):
		scene_changed.disconnect(_on_scene_changed)
	if _web_remote_callback != null:
		var win := JavaScriptBridge.get_interface("window")
		if win != null:
			win["__playforgeExecuteRemoteCommand"] = null
		_web_remote_callback = null


func is_remote_control_enabled() -> bool:
	if not OS.has_feature("editor") or OS.has_feature("release") or OS.has_feature("live") or OS.has_feature("production"):
		return false
	if not OS.is_debug_build() and not OS.has_feature("debug") and not OS.has_feature("test"):
		return false
	var env_mode := OS.get_environment("PLAYFORGE_BUILD_MODE").strip_edges().to_lower()
	if not env_mode.is_empty() and env_mode not in ["debug", "test", "development"]:
		return false
	if ProjectSettings.has_setting("playforge/remote_control/enabled") and not bool(ProjectSettings.get_setting("playforge/remote_control/enabled")):
		return false
	var setting_mode := str(ProjectSettings.get_setting("playforge/remote_control/build_mode", "debug")).strip_edges().to_lower()
	if setting_mode not in ["debug", "test", "development"]:
		return false
	if OS.has_feature("web"):
		return bool(JavaScriptBridge.eval("window.__PLAYFORGE_REMOTE_CONTROL_ENABLED__ !== false && !['live','release','production'].includes(String(window.__PLAYFORGE_BUILD_MODE__ || '').toLowerCase())", true))
	return true


func collect_editor_state() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	var selection: Array[Dictionary] = []
	var nodes: Array[Dictionary] = []
	if root != null:
		for node in EditorInterface.get_selection().get_selected_nodes():
			if is_instance_valid(node) and (node == root or root.is_ancestor_of(node)):
				selection.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
		_walk_nodes(root, root, nodes, 0)
	var state := {
		"scene": root.scene_file_path if root != null else "",
		"rootType": root.get_class() if root != null else "",
		"rootName": str(root.name) if root != null else "",
		"selection": selection,
		"nodes": nodes,
		"openScenes": Array(EditorInterface.get_open_scenes()),
	}
	var recent_logs := _collect_recent_logs()
	if not recent_logs.is_empty():
		state["recentLogs"] = recent_logs
	return state


func execute_command(parsed: Dictionary) -> Dictionary:
	var cmd_id := str(parsed.get("id", ""))
	var command := str(parsed.get("command", ""))
	if not is_remote_control_enabled():
		return {"id": cmd_id, "ok": false, "command": command, "message": "Remote Control is disabled in Live builds (Debug/Test only)."}
	var cmd_args: Dictionary = parsed.get("arguments", {}) if parsed.get("arguments") is Dictionary else {}
	var result := {"id": cmd_id, "ok": true, "command": command, "message": "실행 완료"}
	match command:
		"state.get":
			result["data"] = collect_editor_state()
		"scene.open":
			var path := str(cmd_args.get("scenePath", ""))
			if path.begins_with("res://") and ResourceLoader.exists(path, "PackedScene"):
				EditorInterface.open_scene_from_path(path)
				result["message"] = "씬을 열었습니다: " + path
			else:
				result["ok"] = false
				result["message"] = "열 수 있는 씬 경로가 아닙니다: " + path
		"scene.save":
			result["ok"] = EditorInterface.save_scene() == OK
			result["message"] = "현재 씬을 저장했습니다." if result["ok"] else "현재 씬을 저장하지 못했습니다."
		"showcase.play", "replay.play":
			var target_scene := str(cmd_args.get("scenePath", ""))
			if not target_scene.is_empty() and ResourceLoader.exists(target_scene, "PackedScene"):
				EditorInterface.open_scene_from_path(target_scene)
			var chat := get_tree().get_first_node_in_group(&"playforge_agent_chat")
			var replay := get_tree().get_first_node_in_group(&"playforge_replay_player")
			if replay == null:
				replay = get_tree().get_first_node_in_group(&"playforge_showcase_player")
			if chat != null and chat.has_method(&"play_recording"):
				chat.call(&"play_recording")
				result["message"] = "AgentReplay 제작 과정 재연을 시작했습니다."
			elif replay != null and replay.has_method(&"_start_template_showcase"):
				replay.call(&"_start_template_showcase")
				result["message"] = "AgentReplay 제작 과정 재연을 시작했습니다."
			else:
				result["ok"] = false
				result["message"] = "AgentReplay 플러그인이 활성화되어 있지 않습니다."
		"workspace.apply":
			var chat := get_tree().get_first_node_in_group(&"playforge_agent_chat")
			if chat == null or not chat.has_method(&"apply_call"):
				result["ok"] = false
				result["message"] = "workspace.apply 실행을 위해 playforge_agent_chat 애드온이 필요합니다."
			else:
				var ops: Variant = cmd_args.get("operations", parsed.get("operations", []))
				var outcome: Dictionary = chat.call(&"apply_call", {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "pf_workspace_apply", "arguments": {"operations": ops}}})
				result["ok"] = outcome.get("ok", false) == true
				result["message"] = str(outcome.get("message", ""))
		_:
			result["ok"] = false
			result["message"] = "지원하지 않는 원격 명령입니다: " + command
	publish_web_editor_state()
	return result


func publish_web_editor_state() -> void:
	if not OS.has_feature("web") or not is_remote_control_enabled():
		return
	var state := collect_editor_state()
	JavaScriptBridge.eval("window.__playforgeEditorState = " + JSON.stringify(state) + "; window.__playforgeOnEditorStateChanged?.(window.__playforgeEditorState);", true)


func _install_web_remote_bridge() -> void:
	var win := JavaScriptBridge.get_interface("window")
	if win == null:
		return
	_web_remote_callback = JavaScriptBridge.create_callback(_on_web_remote_command)
	win["__playforgeExecuteRemoteCommand"] = _web_remote_callback
	publish_web_editor_state.call_deferred()


func _on_web_remote_command(args: Array) -> void:
	if args.is_empty():
		return
	_execute_remote_command_json.call_deferred(str(args[0]))


func _execute_remote_command_json(raw: String) -> void:
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		return
	var result := execute_command(parsed)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__playforgeReportRemoteResult?.(" + JSON.stringify(result) + ");", true)


func _on_scene_changed(_node: Node) -> void:
	publish_web_editor_state.call_deferred()


func _on_editor_state_changed() -> void:
	publish_web_editor_state.call_deferred()


func _walk_nodes(node: Node, root: Node, out: Array[Dictionary], depth: int) -> void:
	if out.size() >= MAX_NODES:
		return
	var rel := str(root.get_path_to(node))
	if rel.is_empty():
		rel = "."
	var entry := {"path": rel, "type": node.get_class()}
	var script: Script = node.get_script() as Script
	if script != null and not script.resource_path.is_empty():
		entry["script"] = script.resource_path
	out.append(entry)
	if depth >= MAX_DEPTH:
		return
	if node != root and not node.scene_file_path.is_empty():
		return
	for child in node.get_children():
		if out.size() >= MAX_NODES:
			break
		_walk_nodes(child, root, out, depth + 1)


func _collect_recent_logs() -> Array:
	if not OS.has_feature("web"):
		return []
	var raw: Variant = JavaScriptBridge.eval("typeof window.__playforgeGetRecentLogs === 'function' ? JSON.stringify(window.__playforgeGetRecentLogs(20)) : '[]'", true)
	if not raw is String or (raw as String).is_empty():
		return []
	var parsed: Variant = JSON.parse_string(raw)
	return parsed if parsed is Array else []
