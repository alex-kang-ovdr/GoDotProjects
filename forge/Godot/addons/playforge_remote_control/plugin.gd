@tool
extends EditorPlugin

const RemoteWorkspace := preload("remote_workspace.gd")
const RemoteReflection := preload("remote_reflection.gd")
const PROTOCOL_VERSION := "1.1"
const MAX_NODES := 120
const MAX_DEPTH := 6

var _workspace := RemoteWorkspace.new()
var _reflection := RemoteReflection.new()
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


func list_capabilities() -> Dictionary:
	return {
		"protocol": "playforge-remote-control",
		"version": PROTOCOL_VERSION,
		"jsonrpc": "2.0",
		"buildPolicy": "debug-test-only",
		"commands": [
			{"name": "capabilities.list", "description": "지원하는 Remote Control 명령과 JSON-RPC 2.0 도구 스키마를 반환합니다."},
			{"name": "tools/list", "description": "MCP 호환 도구 목록(pf_workspace_apply 등)을 반환합니다."},
			{"name": "tools/call", "description": "MCP JSON-RPC 2.0 형식의 도구 호출을 실행합니다."},
			{"name": "state.get", "description": "현재 열린 씬 트리, 선택 노드, Undo/Redo 상태, 최근 로그를 조회합니다."},
			{"name": "scene.open", "description": "지정한 res:// 씬 파일을 에디터에서 엽니다.", "arguments": {"scenePath": "string"}},
			{"name": "scene.save", "description": "현재 편집 중인 씬을 저장합니다."},
			{"name": "workspace.apply", "description": "노드/속성/스크립트/에셋 편집 배치(operations)를 EditorUndoRedoManager와 임포터를 통해 실행합니다.", "arguments": {"operations": "array", "dryRun": "boolean"}},
			{"name": "object.describe", "description": "Unreal Remote Control 스타일로 노드/객체의 속성·메서드 메타데이터를 조회합니다.", "arguments": {"objectPath": "string", "filter": "string"}},
			{"name": "object.get", "description": "지정 객체의 속성 값을 Reflection으로 읽습니다.", "arguments": {"objectPath": "string", "propertyName": "string"}},
			{"name": "object.set", "description": "지정 객체의 속성 값을 변경합니다(generateTransaction 기본 true로 Undo 기록).", "arguments": {"objectPath": "string", "propertyName": "string", "value": "any", "generateTransaction": "boolean"}},
			{"name": "object.call", "description": "지정 객체의 메서드를 원격 호출합니다.", "arguments": {"objectPath": "string", "functionName": "string", "arguments": "array"}},
			{"name": "script.eval", "description": "Debug/Test 빌드 전용으로 인메모리 GDScript를 컴파일·실행하고 결과를 반환합니다.", "arguments": {"code": "string", "objectPath": "string", "args": "object"}},
			{"name": "editor.undo", "description": "현재 씬의 편집 히스토리를 되돌립니다.", "arguments": {"steps": "integer"}},
			{"name": "editor.redo", "description": "되돌린 편집 히스토리를 다시 실행합니다.", "arguments": {"steps": "integer"}},
			{"name": "game.play", "description": "현재 씬 또는 메인 씬을 실행합니다.", "arguments": {"main": "boolean"}},
			{"name": "game.stop", "description": "실행 중인 게임 테스트를 중지합니다."},
			{"name": "replay.play", "description": "AgentReplay 제작 시연을 재생합니다.", "arguments": {"scenePath": "string"}},
		],
		"tools": [
			{
				"name": "pf_workspace_apply",
				"description": "Godot 씬·노드·속성·스크립트·에셋을 배치 실행합니다(EditorUndoRedoManager + 자동 에셋 임포트).",
				"inputSchema": {
					"type": "object",
					"required": ["operations"],
					"properties": {
						"dryRun": {"type": "boolean"},
						"operations": {
							"type": "array",
							"maxItems": RemoteWorkspace.MAX_OPERATIONS,
							"items": {
								"type": "object",
								"required": ["kind"],
								"properties": {
									"kind": {"type": "string", "enum": RemoteWorkspace.SCENE_OP_KINDS + RemoteWorkspace.FILE_OP_KINDS + ["editor.undo", "editor.redo"]},
									"objectId": {"type": "string"},
									"type": {"type": "string"},
									"propertyId": {"type": "string"},
									"path": {"type": "string"},
									"value": {},
								},
							},
						},
					},
				},
			},
		],
		"commonProperties": RemoteWorkspace.COMMON_PROPERTIES,
	}


func collect_editor_state() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	var selection: Array[Dictionary] = []
	var nodes: Array[Dictionary] = []
	var has_undo := false
	var has_redo := false
	if root != null:
		for node in EditorInterface.get_selection().get_selected_nodes():
			if is_instance_valid(node) and (node == root or root.is_ancestor_of(node)):
				selection.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
		_walk_nodes(root, root, nodes, 0)
		var ur := get_undo_redo()
		var history := ur.get_history_undo_redo(ur.get_object_history_id(root))
		if history != null:
			has_undo = history.has_undo()
			has_redo = history.has_redo()
	var state := {
		"scene": root.scene_file_path if root != null else "",
		"rootType": root.get_class() if root != null else "",
		"rootName": str(root.name) if root != null else "",
		"selection": selection,
		"nodes": nodes,
		"openScenes": Array(EditorInterface.get_open_scenes()),
		"history": {"hasUndo": has_undo, "hasRedo": has_redo},
		"playing": EditorInterface.is_playing_scene(),
	}
	var recent_logs := _collect_recent_logs()
	if not recent_logs.is_empty():
		state["recentLogs"] = recent_logs
	return state


func execute_command(parsed: Dictionary) -> Dictionary:
	var is_jsonrpc := str(parsed.get("jsonrpc", "")) == "2.0" or parsed.has("method")
	var cmd_id: Variant = parsed.get("id", "")
	var command := str(parsed.get("method", parsed.get("command", "")))
	var raw_args: Variant = parsed.get("params", parsed.get("arguments", {}))
	var cmd_args: Dictionary = raw_args if raw_args is Dictionary else {}
	if not is_remote_control_enabled():
		return _format_result(cmd_id, command, false, "Remote Control is disabled in Live builds (Debug/Test only).", {}, is_jsonrpc)

	var ok := true
	var message := "실행 완료"
	var data: Variant = null

	match command:
		"capabilities.list":
			data = list_capabilities()
			message = "Remote Control 기능 목록을 반환했습니다."
		"tools/list":
			var caps := list_capabilities()
			data = {"tools": caps.tools}
			message = "MCP 호환 도구 목록을 반환했습니다."
		"tools/call":
			var tool_name := str(cmd_args.get("name", ""))
			var tool_args: Dictionary = cmd_args.get("arguments", {}) if cmd_args.get("arguments") is Dictionary else {}
			if tool_name == "pf_workspace_apply":
				var apply_outcome := _run_workspace_apply(tool_args)
				ok = apply_outcome.get("ok", false) == true
				message = str(apply_outcome.get("message", ""))
				data = apply_outcome.get("data")
			else:
				ok = false
				message = "지원하지 않는 도구입니다: " + tool_name
		"state.get":
			data = collect_editor_state()
		"scene.open":
			var path := str(cmd_args.get("scenePath", ""))
			if path.begins_with("res://") and ResourceLoader.exists(path, "PackedScene"):
				EditorInterface.open_scene_from_path(path)
				message = "씬을 열었습니다: " + path
			else:
				ok = false
				message = "열 수 있는 씬 경로가 아닙니다: " + path
		"scene.save":
			ok = EditorInterface.save_scene() == OK
			message = "현재 씬을 저장했습니다." if ok else "현재 씬을 저장하지 못했습니다."
		"workspace.apply":
			var apply_args := cmd_args.duplicate(true)
			if not apply_args.has("operations") and parsed.has("operations"):
				apply_args["operations"] = parsed.get("operations")
			var apply_outcome := _run_workspace_apply(apply_args)
			ok = apply_outcome.get("ok", false) == true
			message = str(apply_outcome.get("message", ""))
			data = apply_outcome.get("data")
		"object.describe":
			var desc_res := _reflection.describe_object(cmd_args, self)
			ok = desc_res.get("ok", false) == true
			message = str(desc_res.get("message", ""))
			data = desc_res.get("data")
		"object.get":
			var get_res := _reflection.get_object_property(cmd_args, self)
			ok = get_res.get("ok", false) == true
			message = str(get_res.get("message", ""))
			data = get_res.get("data")
		"object.set":
			var set_res := _reflection.set_object_property(cmd_args, self, get_undo_redo())
			ok = set_res.get("ok", false) == true
			message = str(set_res.get("message", ""))
			data = set_res.get("data")
		"object.call":
			var call_res := _reflection.call_object_method(cmd_args, self)
			ok = call_res.get("ok", false) == true
			message = str(call_res.get("message", ""))
			data = call_res.get("data")
		"script.eval":
			var eval_res := _reflection.eval_script(cmd_args, self)
			ok = eval_res.get("ok", false) == true
			message = str(eval_res.get("message", ""))
			data = eval_res.get("data")
		"editor.undo", "editor.redo":
			var steps := clampi(int(cmd_args.get("steps", cmd_args.get("value", 1))), 1, 50)
			var hist := _workspace.execute_history(get_undo_redo(), command == "editor.redo", steps, false)
			ok = hist.get("ok", false) == true
			message = str(hist.get("message", ""))
			data = hist.get("data")
		"game.play":
			if cmd_args.get("main", false) == true:
				EditorInterface.play_main_scene()
			else:
				EditorInterface.play_current_scene()
			message = "게임 테스트 실행을 시작했습니다."
		"game.stop":
			EditorInterface.stop_playing_scene()
			message = "실행 중인 게임을 중지했습니다."
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
				message = "AgentReplay 제작 과정 재연을 시작했습니다."
			elif replay != null and replay.has_method(&"_start_template_showcase"):
				replay.call(&"_start_template_showcase")
				message = "AgentReplay 제작 과정 재연을 시작했습니다."
			else:
				ok = false
				message = "AgentReplay 플러그인이 활성화되어 있지 않습니다."
		_:
			ok = false
			message = "지원하지 않는 원격 명령입니다: " + command

	publish_web_editor_state()
	return _format_result(cmd_id, command, ok, message, data, is_jsonrpc)


func _run_workspace_apply(args: Dictionary) -> Dictionary:
	var chat := get_tree().get_first_node_in_group(&"playforge_agent_chat")
	if chat != null and chat.has_method(&"apply_call") and args.get("standalone", false) != true:
		var outcome: Dictionary = chat.call(&"apply_call", {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "pf_workspace_apply", "arguments": args}})
		return outcome
	return _workspace.apply_operations(args.get("operations", []), get_undo_redo(), args.get("dryRun", false) == true)


func _format_result(cmd_id: Variant, command: String, ok: bool, message: String, data: Variant, is_jsonrpc: bool) -> Dictionary:
	var result := {
		"id": cmd_id,
		"ok": ok,
		"command": command,
		"message": message,
	}
	if data != null:
		result["data"] = data
	if is_jsonrpc:
		result["jsonrpc"] = "2.0"
		if ok:
			result["result"] = data if data != null else {"ok": true, "message": message}
		else:
			result["error"] = {"code": -32000, "message": message}
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
