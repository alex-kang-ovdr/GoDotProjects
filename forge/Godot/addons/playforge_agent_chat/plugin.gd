@tool
extends EditorPlugin

const ChatPanel := preload("chat_panel.gd")
const ProviderSettings := preload("chat_settings.gd")
const ChatStream := preload("chat_stream.gd")
const ChatWebDock := preload("chat_web_dock.gd")
const Commands := preload("scene_commands.gd")
const REPLAY_DIR := "res://.godot/playforge_agent_replays"
const TOOL := "pf_workspace_apply"
const PACK_IMPORT_TOOL := "pf_asset_pack_import"
const PACK_STATUS_TOOL := "pf_asset_pack_status"
const TOOL_MENU := "PlayForge AI 채팅"
const WEB_MODES := {"review": ChatPanel.EditMode.REVIEW, "plan": ChatPanel.EditMode.PLAN, "apply": ChatPanel.EditMode.APPLY}
const SKILLS := {
	"scene-review": "열린 씬과 첨부 노드의 관계를 먼저 설명하고 확인한 문맥과 추정을 구분하세요. ",
	"godot-script": "Godot 4 GDScript 문법을 사용하고 스크립트가 연결될 노드와 사용 방법을 함께 안내하세요. ",
	"asset-workflow": "사용할 에셋 팩과 배치 순서를 먼저 설명하고 상품 ID를 추정하지 마세요. ",
}
var _commands := Commands.new()
var _panel: VBoxContainer
var _dock: EditorDock
var _request: HTTPRequest
var _stream := ChatStream.new()
var _request_root: Node
var _request_version := 0
var _request_mode := ChatPanel.EditMode.REVIEW
var _request_provider := "ollama"
var _request_tools: Array[String] = []
var _web_turn: Dictionary = {}
var _proposal: Dictionary = {}
var _proposal_content := ""
var _selection_actions: Array[Button] = []
var _sessions := {}
var _latest := {}
var _storage := ""
var _last_error := ""
var _opening := false
var _file_dialog: EditorFileDialog
var _web_import_callback: JavaScriptObject
var _web_remote_callback: JavaScriptObject
var _pack_receipts := {}
var _active_pack_operation := ""

func _enter_tree() -> void:
	add_to_group(&"playforge_agent_chat")
	var project_key := ProjectSettings.globalize_path("res://").sha256_text().left(16)
	var legacy_storage := "user://forge-agent-" + project_key
	_storage = "/home/web_user/playforge_agent_chat/" + project_key if OS.has_feature("web") else legacy_storage
	DirAccess.make_dir_recursive_absolute(_storage)
	var saved := _storage.path_join("latest.json")
	var legacy_recording := legacy_storage.path_join("latest.json")
	if _storage != legacy_storage and not FileAccess.file_exists(saved) and FileAccess.file_exists(legacy_recording):
		DirAccess.copy_absolute(legacy_recording, saved)
	if FileAccess.file_exists(saved):
		var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(saved))
		if value is Dictionary and value.get("events") is Array:
			_latest = value
	_dock = EditorDock.new()
	_dock.name = "PlayForgeAgentChat"
	_dock.title = "PlayForge AI Agent"
	_dock.layout_key = "playforge_agent_chat"
	_dock.default_slot = EditorDock.DOCK_SLOT_RIGHT_UL
	_dock.available_layouts = EditorDock.DOCK_LAYOUT_VERTICAL | EditorDock.DOCK_LAYOUT_HORIZONTAL
	_panel = ClassDB.instantiate(&"PlayForgeAgentChatDock") as VBoxContainer if ClassDB.class_exists(&"PlayForgeAgentChatDock") else VBoxContainer.new()
	_panel.set_script(ChatPanel)
	_panel.load_sessions(_storage)
	_dock.add_child(_panel)
	add_dock(_dock)
	add_tool_menu_item(TOOL_MENU, _open_chat)
	add_tool_menu_item("선택한 노드를 AI 채팅에 추가", _stage_selection)
	_add_selection_action(CONTAINER_CANVAS_EDITOR_MENU)
	_add_selection_action(CONTAINER_SPATIAL_EDITOR_MENU)
	add_tool_menu_item("MCP 녹화로 제작 시연 열기", _choose_recording)
	_panel.submitted.connect(_on_submitted)
	_panel.replay_requested.connect(play_recording)
	_panel.stop_requested.connect(_stop_turn)
	_panel.proposal_decided.connect(_decide_proposal)
	_commands.history_step.connect(_on_history_step)
	_request = HTTPRequest.new()
	_request.timeout = 180
	_request.max_redirects = 0
	_request.body_size_limit = 524288
	add_child(_request)
	_request.request_completed.connect(_on_reply)
	add_child(_stream)
	_stream.delta_received.connect(_panel.append_response_delta)
	_stream.completed.connect(_handle_response)
	_stream.failed.connect(_panel.fail_turn)
	EditorInterface.get_selection().selection_changed.connect(_refresh_context)
	scene_changed.connect(_scene_changed)
	if OS.has_feature("web"):
		var web_dock := ChatWebDock.new()
		add_child(web_dock)
		web_dock.configure(_dock, _panel, _submit_web_turn)
		_install_web_remote_bridge()
	_refresh_context.call_deferred()

func _exit_tree() -> void:
	remove_tool_menu_item(TOOL_MENU)
	remove_tool_menu_item("선택한 노드를 AI 채팅에 추가")
	remove_tool_menu_item("MCP 녹화로 제작 시연 열기")
	if _web_import_callback != null:
		JavaScriptBridge.get_interface("window")["__playforgeImportAgentRecording"] = null
		_web_import_callback = null
	if _web_remote_callback != null:
		var win := JavaScriptBridge.get_interface("window")
		if win != null:
			win["__playforgeExecuteRemoteCommand"] = null
		_web_remote_callback = null
	EditorInterface.get_selection().selection_changed.disconnect(_refresh_context)
	_request.cancel_request()
	_stream.cancel()
	_commands.close_scene()
	for button in _selection_actions:
		remove_control_from_container(int(button.get_meta("container")), button)
		button.queue_free()
	_selection_actions.clear()
	remove_dock(_dock)
	_dock.queue_free()

func _scene_changed(_node: Node) -> void:
	_refresh_context.call_deferred()

func _refresh_context() -> void:
	_panel.context.refresh()
	var has_selection := not EditorInterface.get_selection().get_selected_nodes().is_empty()
	for button in _selection_actions:
		button.visible = has_selection
	if OS.has_feature("web"):
		_publish_web_editor_state()

func _install_web_remote_bridge() -> void:
	var win := JavaScriptBridge.get_interface("window")
	if win == null:
		return
	_web_remote_callback = JavaScriptBridge.create_callback(_on_web_remote_command)
	win["__playforgeExecuteRemoteCommand"] = _web_remote_callback
	_publish_web_editor_state.call_deferred()

func _publish_web_editor_state() -> void:
	if not OS.has_feature("web") or not is_instance_valid(_panel):
		return
	var ctx: Dictionary = _panel.context.request_context()
	JavaScriptBridge.eval("window.__playforgeEditorState = " + JSON.stringify(ctx) + "; window.__playforgeOnEditorStateChanged?.(window.__playforgeEditorState);", true)

func _on_web_remote_command(args: Array) -> void:
	if args.is_empty():
		return
	_execute_remote_command_json.call_deferred(str(args[0]))

func _execute_remote_command_json(raw: String) -> void:
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		return
	var cmd_id := str(parsed.get("id", ""))
	var command := str(parsed.get("command", ""))
	var cmd_args: Dictionary = parsed.get("arguments", {}) if parsed.get("arguments") is Dictionary else {}
	var result := {"id": cmd_id, "ok": true, "command": command, "message": "실행 완료"}
	match command:
		"showcase.play":
			var target_scene := str(cmd_args.get("scenePath", ""))
			if not target_scene.is_empty() and ResourceLoader.exists(target_scene, "PackedScene"):
				EditorInterface.open_scene_from_path(target_scene)
			play_recording()
			result["message"] = "Showcase 제작 과정 재연을 시작했습니다."
		"workspace.apply":
			var ops: Variant = cmd_args.get("operations", parsed.get("operations", []))
			var outcome := apply_call({"jsonrpc": "2.0", "method": "tools/call", "params": {"name": TOOL, "arguments": {"operations": ops}}})
			result["ok"] = outcome.get("ok", false) == true
			result["message"] = str(outcome.get("message", ""))
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
		"state.get":
			result["data"] = _panel.context.request_context()
		_:
			result["ok"] = false
			result["message"] = "지원하지 않는 원격 명령입니다: " + command
	_publish_web_editor_state()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__playforgeReportRemoteResult?.(" + JSON.stringify(result) + ");", true)

func _add_selection_action(container: CustomControlContainer) -> void:
	var button := Button.new()
	button.text = "AI 채팅에 추가"
	button.tooltip_text = "선택한 노드를 다음 AI 채팅 메시지의 문맥에 추가합니다."
	button.set_meta("container", container)
	button.pressed.connect(_stage_selection)
	button.hide()
	add_control_to_container(container, button)
	_selection_actions.append(button)

func _stage_selection() -> void:
	_open_chat()
	_panel.context.stage_selection()

func _open_chat() -> void:
	_dock.make_visible()
	_panel.providers.ensure_configuration()

func _tool_schema() -> Dictionary:
	return {"type": "function", "function": {"name": TOOL, "description": "현재 Godot 씬과 프로젝트 에셋·스크립트를 편집하고 Replay 제작 시연을 실행합니다. objectId는 씬 루트 기준 노드 경로이며 루트는 . 입니다. 지원 작업(kind): node.add(type에 모든 Godot Node 클래스 지정), property.set(propertyId와 value 지정; position, size, scale, rotation, text, visible, color, modulate, z_index, offset_*, anchor_*, texture, region_enabled, region_rect, script 등 지원), node.delete(자식 노드 삭제), node.rename(value에 새 이름), scene.clear(objectId='.'로 루트 하위 모든 노드를 삭제해 빈 맵 초기화), editor.undo(최근 편집 되돌리기), asset.write(path에 res://Assets/... 경로, value에 SVG/리소스 텍스트 작성), asset.delete(value 또는 path에 삭제할 파일/폴더 경로 지정), assets.clear(objectId='.'로 모든 사용자 에셋·스크립트 삭제), pack.import(value에 storePacks의 상품 ID 예: 'tappy-original'을 지정해 에셋 스토어 팩 파일들을 즉시 프로젝트로 가져오기), script.write(path에 res://Scripts/...gd 경로, value에 GDScript 전체 코드 작성), script.attach(objectId 노드에 value 또는 path의 res://...gd 스크립트 연결), replay.play(objectId='.'로 처음부터 만드는 과정을 PlayForge Showcase Replay로 즉시 시연). 한 번의 operations 배열 안에 에셋/팩 가져오기, 스크립트 작성, 노드 구성, 스크립트 연결, replay.play를 순서대로 모두 담아 실행할 수 있습니다.", "parameters": {"type": "object", "required": ["operations"], "properties": {"operations": {"type": "array", "items": {"type": "object", "required": ["kind", "objectId", "role", "description"], "properties": {
		"kind": {"type":"string", "enum":["node.add","property.set","node.delete","node.rename","scene.clear","editor.undo","asset.write","asset.delete","assets.clear","pack.import","script.write","script.attach","replay.play"]}, "objectId":{"type":"string"}, "type":{"type":"string"}, "propertyId":{"type":"string","enum":Commands.PROPERTIES}, "path":{"type":"string"}, "value":{}, "role":{"type":"string","enum":Commands.ROLES.keys()}, "description":{"type":"string"}
	}}}}}}}

func _pack_tool_schemas() -> Array[Dictionary]:
	var operation_id := {"type":"string", "minLength":1, "maxLength":128, "description":"가져오기 요청의 고유 ID. 같은 요청을 재시도하거나 상태를 조회할 때 그대로 사용합니다."}
	return [
		{"type":"function", "function":{"name":PACK_IMPORT_TOOL, "description":"프로젝트의 PlayForge 에셋 스토어에서 팩을 가져옵니다. 완료 여부는 pf_asset_pack_status로 확인합니다.", "parameters":{
			"type":"object", "required":["packId", "operationId"], "additionalProperties":false,
			"properties":{"packId":{"type":"string", "description":"등록된 스토어 상품 ID"}, "operationId":operation_id, "dryRun":{"type":"boolean", "description":"파일을 쓰지 않고 가져올 목록을 확인합니다."}},
		}}},
		{"type":"function", "function":{"name":PACK_STATUS_TOOL, "description":"이 에디터 세션에서 요청한 에셋 팩 가져오기의 진행 상태를 조회합니다.", "parameters":{
			"type":"object", "required":["operationId"], "additionalProperties":false, "properties":{"operationId":operation_id},
		}}},
	]

func _asset_store() -> Node:
	var store := get_tree().get_first_node_in_group(&"playforge_showcase_player")
	return store if store != null and store.has_method(&"import_store_pack") and store.has_signal(&"store_import_changed") else null

func _submit_web_turn(turn: Dictionary) -> void:
	var prompt: Variant = turn.get("prompt")
	var provider: Variant = turn.get("provider")
	var mode: Variant = turn.get("mode")
	if prompt is not String or provider not in ProviderSettings.IDS or mode not in WEB_MODES:
		return
	_web_turn = turn
	_panel.submit_message(prompt)
	_web_turn = {}

func _on_submitted(message: String, history: Array) -> void:
	var embedded := not _web_turn.is_empty()
	_request_mode = WEB_MODES[_web_turn.mode] if embedded else _panel.mode
	_request_provider = _web_turn.provider if embedded else _panel.providers.provider
	var permitted: Variant = _web_turn.get("tools", [TOOL, PACK_IMPORT_TOOL, PACK_STATUS_TOOL])
	if permitted is not Array:
		permitted = []
	if message.begins_with("{"):
		if _request_mode == ChatPanel.EditMode.PLAN:
			_panel.fail_turn("계획 모드에서는 MCP 호출을 실행할 수 없습니다.")
			return
		var parser := JSON.new()
		if parser.parse(message) != OK or not parser.data is Dictionary:
			_panel.fail_turn("MCP 호출 JSON을 읽을 수 없습니다.")
			return
		var params: Variant = parser.data.get("params")
		if embedded and (params is not Dictionary or params.get("name") not in permitted):
			_panel.fail_turn("도구 설정에서 허용한 MCP 도구만 실행할 수 있습니다.")
			return
		_show_result(apply_call(parser.data))
		return
	var web := OS.has_feature("web")
	var bridge: String = _panel.providers.endpoint
	var model := OS.get_environment("PLAYFORGE_AGENT_MODEL")
	if bridge.is_empty() and _request_provider != "ollama":
		_panel.fail_turn("Run_AgentReplay.cmd로 로컬 에디터를 열고 설정에서 계정을 연결해 주세요.")
		return
	if not web and bridge.is_empty() and model.is_empty():
		_panel.fail_turn("Ollama에 설치한 모델 이름으로 PLAYFORGE_AGENT_MODEL을 설정하고 에디터를 다시 여세요. MCP 호출 JSON도 입력할 수 있습니다.")
		return
	_request_root = EditorInterface.get_edited_scene_root()
	_request_version = _editor_version(_request_root)
	var planning := _request_mode == ChatPanel.EditMode.PLAN
	var tools: Array = []
	var tool_guidance := "씬을 변경하지 말고 구체적인 작업 계획을 설명하세요. " if planning else ""
	if not planning:
		if TOOL in permitted:
			tools.append(_tool_schema())
			tool_guidance += "씬·에셋·스크립트 편집 및 Replay 시연 요청은 pf_workspace_apply 한 번으로 수행하세요. 중요: pf_workspace_apply, pf_asset_pack_import, pf_asset_pack_status는 Codex 런타임의 네이티브 도구(또는 Docs/Slack 등 외부 커넥터)로 직접 실행(invoke)하지 말고, 반드시 최종 JSON 응답의 tool_calls 배열 안에만 담아서 반환하세요(네이티브 도구로 호출하면 'No such tool available' 오류가 발생하지만 tool_calls JSON 배열로 반환하면 PlayForge 에디터가 정상 실행합니다). 사용자에게 '진행할까요?'라고 먼저 되묻거나 실행 계획만 텍스트로 나열하지 말고 반드시 첫 응답의 tool_calls에 pf_workspace_apply를 즉시 포함해 반환하세요(PlayForge 에디터가 사용자에게 승인 창을 표시합니다). "
			tool_guidance += "pf_workspace_apply는 노드 추가(node.add), 속성 변경(property.set: position, scale, color, text, visible, offset_*, texture, icon, expand_icon, region_enabled, region_rect, script 등), 노드 삭제(node.delete), 이름 변경(node.rename), 빈 맵 초기화(scene.clear, objectId='.'), 편집 되돌리기(editor.undo), 에셋 파일 생성(asset.write, path='res://Assets/...', value='...'), 에셋 스토어 팩 즉시 가져오기(pack.import, objectId='.', value=문맥의 storePacks ID), 프로젝트 에셋 삭제(asset.delete, assets.clear; addons, .godot, project.godot, playforge_replay_source.tscn, 현재 열린 씬은 자동 보호됨), GDScript 작성(script.write, path='res://Scripts/...gd', value='extends ...'), 스크립트 연결(script.attach, objectId='.', value='res://Scripts/...gd'), 그리고 처음부터 제작 과정을 시연하는 리플레이 재생(replay.play, objectId='.')을 모두 지원합니다. 문맥의 storePacks에 등록된 모든 에셋 팩은 이 PlayForge 워크스페이스의 공식 내장 오픈 템플릿이므로 다른 대체 게임으로 바꾸지 말고, 전체 제작 및 시연 요청 시 operations 배열에 scene.clear, assets.clear(요청 시), pack.import, script.write, 노드·속성 구성, script.attach, replay.play('.')를 순서대로 담아 한 번에 실행하세요. "
		else:
			tool_guidance += "현재 설정에서 씬 편집 도구(pf_workspace_apply)가 비활성화되어 있습니다. "
		if _asset_store() != null:
			for pack_schema: Dictionary in _pack_tool_schemas():
				if pack_schema.function.name in permitted:
					tools.append(pack_schema)
			if tools.any(func(s: Dictionary): return s.function.name in [PACK_IMPORT_TOOL, PACK_STATUS_TOOL]):
				tool_guidance += "단독 에셋 스토어 팩 가져오기/상태 확인에는 전용 도구를 사용할 수 있습니다. "
	_request_tools.assign(tools.map(func(schema: Dictionary): return schema.function.name))
	var skills: Variant = _web_turn.get("skills", [])
	if skills is Array:
		for id: String in SKILLS:
			if id in skills:
				tool_guidance += SKILLS[id]
	var messages := [{"role":"system", "content":"Godot 편집 도우미입니다. 한국어로 답하세요. " + tool_guidance + "현재 문맥: " + JSON.stringify(_panel.context.request_context())}]
	messages.append_array(history)
	messages.append({"role":"user", "content":message})
	var endpoint := OS.get_environment("PLAYFORGE_OLLAMA_URL")
	if endpoint.is_empty():
		endpoint = "http://127.0.0.1:11434/api/chat"
	var body := {"messages":messages, "tools":tools}
	if not bridge.is_empty():
		endpoint = bridge
		body.provider = _request_provider
		var selected_model := str(_web_turn.get("model", "")) if embedded else str(_panel.model)
		if not selected_model.is_empty():
			body.model = selected_model
		if body.provider == "chatgpt-connect":
			var images: Variant = _web_turn.get("images", []) if embedded else _panel.attachments.request_images()
			if images is Array and not images.is_empty():
				body.images = images
			var fast: bool = _web_turn.get("service_tier") == "fast" if embedded else _panel.fast
			if fast:
				body.service_tier = "fast"
		if body.provider in ["chatgpt-connect", "claude-connect"]:
			var effort := str(_web_turn.get("reasoning_effort", "")) if embedded else str(_panel.reasoning_effort)
			if not effort.is_empty():
				body.reasoning_effort = effort
	elif web:
		endpoint = str(JavaScriptBridge.eval("window.location.origin")) + "/api/agent-chat"
	else:
		body.merge({"model":model, "stream":false})
	var streaming: bool = _web_turn.get("streaming", false) == true if embedded else _panel.providers.current_configuration().get("streaming", false)
	if body.get("provider") in ["chatgpt-connect", "claude-connect", "gemini-connect"] and streaming:
		body.stream = true
		if _stream.start(endpoint, body) != OK:
			_panel.fail_turn("AI 모델 연결을 시작하지 못했습니다.")
		return
	if _request.request(endpoint, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body)) != OK:
		_panel.fail_turn("AI 모델 연결을 시작하지 못했습니다.")

func _stop_turn() -> void:
	_request.cancel_request()
	_stream.cancel()
	_proposal.clear()
	_proposal_content = ""
	_request_root = null
	_panel.fail_turn("요청을 중지했습니다.")

func _editor_version(root: Node) -> int:
	if not is_instance_valid(root):
		return -1
	var manager := get_undo_redo()
	return manager.get_history_undo_redo(manager.get_object_history_id(root)).get_version()

func _on_reply(result: int, status: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
	var body: Variant = JSON.parse_string(bytes.get_string_from_utf8()) if not bytes.is_empty() else null
	if result != HTTPRequest.RESULT_SUCCESS or status != 200 or not body is Dictionary or not body.get("message") is Dictionary:
		_panel.fail_turn(str(body.get("error", "AI 모델 응답을 확인해 주세요.")) if body is Dictionary else "AI 모델에 연결하지 못했습니다. Ollama 서비스와 모델을 확인해 주세요.")
		return
	_handle_response(body.message)

func _fail_or_preserve(error_message: String, response_content: String = "") -> void:
	var fallback_partial := str(_panel.get("partial_response")) if _panel != null else ""
	var prose: String = response_content if not response_content.strip_edges().is_empty() else fallback_partial
	if not prose.strip_edges().is_empty() and not _looks_like_tool_text(prose) and _panel.has_method(&"preserve_reply_with_error"):
		_panel.preserve_reply_with_error(prose, error_message)
	else:
		_panel.fail_turn(error_message)

func _handle_response(response: Dictionary) -> void:
	var content := str(response.get("content", ""))
	var calls: Variant = response.get("tool_calls", [])
	if not calls is Array or calls.size() > 1:
		_fail_or_preserve("한 번의 요청에는 편집 작업 묶음 하나를 사용해 주세요.", content)
		return
	if calls.is_empty():
		if _looks_like_tool_text(content):
			var hint := " Ollama 모델을 qwen3:4b(권장)로 바꾸고 다시 요청해 주세요." if _request_provider == "ollama" else ""
			_panel.fail_turn("모델이 도구 호출을 일반 텍스트로 반환해 씬 편집을 실행하지 못했습니다." + hint)
		else:
			_panel.add_reply(content)
		return
	if not calls[0] is Dictionary or not calls[0].get("function") is Dictionary:
		_fail_or_preserve("AI가 반환한 호출 형식이 올바르지 않습니다.", content)
		return
	var tool_call: Dictionary = calls[0].function
	var tool: Variant = tool_call.get("name")
	if _request_mode == ChatPanel.EditMode.PLAN:
		_fail_or_preserve("계획 모드에서는 편집 도구 호출을 실행할 수 없습니다.", content)
		return
	if tool not in _request_tools:
		_fail_or_preserve("현재 요청의 도구 설정에서 허용하지 않은 작업입니다.", content)
		return
	if tool != PACK_STATUS_TOOL and not _request_scene_is_current():
		_fail_or_preserve("응답을 기다리는 동안 씬이 바뀌었습니다. 현재 씬에서 다시 요청해 주세요.", content)
		return
	if tool == TOOL:
		var arguments: Variant = tool_call.get("arguments")
		if not arguments is Dictionary:
			_fail_or_preserve("AI가 반환한 씬 편집 인수가 올바르지 않습니다.", content)
			return
		var preview: Dictionary = arguments.duplicate(true)
		preview["dryRun"] = true
		var validation := _call_scene_edit(preview)
		if not validation.ok:
			_fail_or_preserve(validation.message, content)
			return
	var tool_content := content if tool == TOOL else ""
	if _request_mode == ChatPanel.EditMode.REVIEW and tool in [TOOL, PACK_IMPORT_TOOL]:
		_proposal = tool_call
		_proposal_content = tool_content
		_panel.preview_proposal(_describe_proposal(tool_call, tool_content))
		return
	_apply_model_call(tool_call, tool_content)

func _looks_like_tool_text(content: String) -> bool:
	var text := content.strip_edges()
	if text.begins_with("```") and text.ends_with("```"):
		var header_end := text.find("\n")
		if header_end < 0 or text.substr(3, header_end - 3).strip_edges().to_lower() not in ["", "json"]:
			return false
		text = text.substr(header_end + 1, text.length() - header_end - 4).strip_edges()
	if not text.begins_with("{") or not text.ends_with("}"):
		return false
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		return false
	if parsed.get("method") == "tools/call" or parsed.get("tool_calls") is Array:
		return true
	var call: Variant = parsed.get("function", parsed)
	return call is Dictionary and call.get("name") in [TOOL, PACK_IMPORT_TOOL, PACK_STATUS_TOOL]

func _request_scene_is_current() -> bool:
	return is_instance_valid(_request_root) and _request_root == EditorInterface.get_edited_scene_root() and _request_version == _editor_version(_request_root)

func _describe_proposal(call: Dictionary, content: String) -> String:
	var args: Variant = call.get("arguments")
	if not args is Dictionary:
		return "요청의 편집 인수를 읽을 수 없습니다."
	if call.get("name") == PACK_IMPORT_TOOL:
		return "에셋 팩 가져오기 · " + str(args.get("packId", "")).left(128)
	var ops: Variant = args.get("operations")
	if not ops is Array:
		return "요청의 씬 편집 목록을 읽을 수 없습니다."
	var lines := PackedStringArray()
	if not content.is_empty():
		lines.append(content.left(360))
	lines.append("씬 편집 %d개" % ops.size())
	for item: Variant in ops.slice(0, Commands.MAX_OPERATIONS):
		if item is Dictionary:
			var kind := str(item.get("kind", "")).left(40)
			var target := "%s · %s" % [kind, str(item.get("objectId", "")).left(96)]
			if item.has("propertyId"):
				var value := JSON.stringify(item.get("value"))
				target += " · %s = %s" % [str(item.propertyId).left(60), value if value.length() <= 280 else value.left(280) + "…"]
			elif kind == "node.rename" and item.has("value"):
				target += " → " + str(item.value).left(60)
			elif kind == "scene.clear":
				var root := EditorInterface.get_edited_scene_root()
				var child_count := root.get_child_count() if root != null else 0
				target += " · 자식 노드 %d개 삭제(빈 맵 초기화)" % child_count
			elif kind == "editor.undo":
				var steps := clampi(int(item.get("value", 1)), 1, 50)
				target += " · %d단계 되돌리기" % steps
			elif kind == "asset.write":
				target += " · 에셋 생성: " + str(_extract_op_path(item)).left(120)
			elif kind == "asset.delete":
				target += " · 파일/폴더 삭제: " + str(_extract_op_path(item)).left(120)
			elif kind == "assets.clear":
				target += " · 프로젝트의 모든 사용자 에셋·스크립트 삭제"
			elif kind == "pack.import":
				target += " · 에셋 스토어 팩 가져오기: " + str(item.get("value", item.get("path", ""))).left(80)
			elif kind == "script.write":
				target += " · 스크립트 작성: " + str(_extract_op_path(item)).left(120)
			elif kind == "script.attach":
				target += " · 스크립트 연결: " + str(_extract_op_path(item)).left(120)
			elif kind == "replay.play":
				target += " · 처음부터 제작 과정 Replay 시연"
			elif item.has("type"):
				target += " · " + str(item.type).left(60)
			lines.append(target)
	if ops.size() > Commands.MAX_OPERATIONS:
		lines.append("편집 명령 개수 제한을 초과했습니다.")
	return "\n".join(lines)

func _decide_proposal(approved: bool) -> void:
	if _proposal.is_empty():
		return
	var call := _proposal
	var content := _proposal_content
	_proposal = {}
	_proposal_content = ""
	if not approved:
		_panel.add_reply((content + "\n" if not content.is_empty() else "") + "편집 제안을 거절했습니다.")
	elif not _request_scene_is_current():
		_fail_or_preserve("승인 전에 씬이 바뀌었습니다. 현재 씬에서 다시 요청해 주세요.", content)
	else:
		_apply_model_call(call, content)

func _apply_model_call(call: Dictionary, content: String) -> void:
	var outcome := apply_call({"jsonrpc":"2.0","method":"tools/call","params":call})
	_show_result(outcome, content)

func _show_result(outcome: Dictionary, reply := "") -> void:
	var message: String = outcome.message
	if outcome.has("operationId"):
		message += "\n작업 ID: " + outcome.operationId
	if outcome.ok:
		_panel.add_reply((reply + "\n" if not reply.is_empty() else "") + message)
	else:
		_fail_or_preserve(message, reply)

func apply_call(call_data: Dictionary) -> Dictionary:
	var params: Variant = call_data.get("params")
	if call_data.get("method") != "tools/call" or not params is Dictionary or not params.get("arguments") is Dictionary:
		return {"ok":false, "message":"지원하는 tools/call 요청과 인수가 필요합니다."}
	match params.get("name"):
		PACK_IMPORT_TOOL:
			return _call_pack_import(params.arguments)
		PACK_STATUS_TOOL:
			return _call_pack_status(params.arguments)
		TOOL:
			return _call_scene_edit(params.arguments)
	return {"ok":false, "message":"지원하지 않는 편집 도구입니다."}

func _call_pack_import(args: Dictionary) -> Dictionary:
	var pack_id: Variant = args.get("packId")
	var operation_id: Variant = args.get("operationId")
	var dry_run: Variant = args.get("dryRun", false)
	if not pack_id is String or pack_id.is_empty() or pack_id.length() > 128 or not _valid_operation_id(operation_id) or not dry_run is bool:
		return _pack_error("유효한 packId, operationId와 불리언 dryRun을 입력해 주세요.")
	if not dry_run and _pack_receipts.has(operation_id):
		var previous: Dictionary = _pack_receipts[operation_id]
		if previous.packId != pack_id:
			return _pack_error("이 작업 ID는 다른 에셋 팩에 사용했습니다.")
		return previous.duplicate(true)
	var store := _asset_store()
	if store == null:
		return _pack_error("이 프로젝트에서 PlayForge 에셋 스토어를 열 수 없습니다.")
	if dry_run:
		return _pack_result(store.call(&"import_store_pack", pack_id, true), operation_id)
	if not _active_pack_operation.is_empty():
		return _pack_result({"state":"busy", "packId":pack_id, "message":"다른 에셋 팩을 가져오는 중입니다."}, operation_id)
	if not store.is_connected(&"store_import_changed", _on_pack_receipt):
		store.connect(&"store_import_changed", _on_pack_receipt)
	_active_pack_operation = operation_id
	_pack_receipts[operation_id] = _pack_result({"state":"queued", "packId":pack_id, "message":"에셋 팩 가져오기 대기 중"}, operation_id)
	var receipt: Dictionary = store.call(&"import_store_pack", pack_id)
	if receipt.get("state") == "busy":
		_active_pack_operation = ""
		_pack_receipts.erase(operation_id)
		return _pack_result(receipt, operation_id)
	if _active_pack_operation == operation_id:
		_on_pack_receipt(receipt)
	return _pack_receipts[operation_id].duplicate(true)

func _call_pack_status(args: Dictionary) -> Dictionary:
	var operation_id: Variant = args.get("operationId")
	if not _valid_operation_id(operation_id) or not _pack_receipts.has(operation_id):
		return _pack_error("이 에디터 세션에서 해당 에셋 팩 작업 ID를 찾을 수 없습니다.")
	return _pack_receipts[operation_id].duplicate(true)

func _on_pack_receipt(receipt: Dictionary) -> void:
	if _active_pack_operation.is_empty() or receipt.get("packId") != _pack_receipts[_active_pack_operation].packId:
		return
	var state: Variant = receipt.get("state")
	if state in ["queued", "importing", "done", "error"]:
		_pack_receipts[_active_pack_operation] = _pack_result(receipt, _active_pack_operation)
		if state == "done" or state == "error":
			_active_pack_operation = ""

func _valid_operation_id(value: Variant) -> bool:
	if not value is String or value.is_empty() or value.length() > 128:
		return false
	for index in value.length():
		var character: String = value[index]
		if not character.is_valid_ascii_identifier() and not character.is_valid_int() and character != "-":
			return false
	return true

func _pack_result(receipt: Dictionary, operation_id: String) -> Dictionary:
	var outcome := receipt.duplicate(true)
	outcome.operationId = operation_id
	outcome.ok = outcome.get("state") in ["preview", "queued", "importing", "done"]
	return outcome

func _pack_error(message: String) -> Dictionary:
	return {"ok":false, "state":"error", "message":message}

const FILE_OP_KINDS := ["asset.write", "asset.delete", "assets.clear", "pack.import", "script.write"]
const WRITABLE_ASSET_EXTS := ["svg", "tres", "gdshader", "json", "txt", "cfg", "gd"]

func _extract_op_path(op: Dictionary) -> String:
	var direct: Variant = op.get("path", "")
	if direct is String and not (direct as String).strip_edges().is_empty():
		return _normalize_asset_path(direct)
	var val: Variant = op.get("value")
	if val is Dictionary:
		return _normalize_asset_path(val.get("path", val.get("file", "")))
	if op.get("kind") in ["asset.delete", "script.attach"] and val is String:
		return _normalize_asset_path(val)
	return _normalize_asset_path(op.get("propertyId", ""))

func _extract_op_content(op: Dictionary) -> Variant:
	var val: Variant = op.get("value")
	if val is Dictionary:
		return val.get("content", val.get("code", val.get("source", "")))
	if op.has("content") and op.get("content") is String:
		return op.get("content")
	return val

func _store_pack_files(pack_id: String) -> Array[String]:
	var files: Array[String] = []
	if pack_id.is_empty() or not FileAccess.file_exists("res://.playforge-store.json"):
		return files
	var catalog: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-store.json"))
	if not catalog is Dictionary or not catalog.get("packs") is Array:
		return files
	for pack: Variant in catalog.packs:
		if pack is Dictionary and str(pack.get("id", "")) == pack_id and pack.get("files") is Array:
			for f: Variant in pack.files:
				if f is String:
					files.append(f)
			break
	return files

func _store_source_path(rel_file: String) -> String:
	if OS.has_feature("web"):
		var project := ProjectSettings.globalize_path("res://").trim_suffix("/").get_file()
		return "/tmp/playforge-store/%s/%s" % [project, rel_file]
	return "res://.playforge-store/" + rel_file

func _call_scene_edit(args: Dictionary) -> Dictionary:
	var ops: Variant = args.get("operations")
	if not ops is Array or ops.is_empty() or ops.size() > Commands.MAX_OPERATIONS:
		return {"ok":false,"message":"편집 명령은 1~256개로 묶어 주세요."}
	var root := EditorInterface.get_edited_scene_root()
	var undo_ops: Array = (ops as Array).filter(func(op: Variant): return op is Dictionary and op.get("kind") == "editor.undo")
	var file_ops: Array = (ops as Array).filter(func(op: Variant): return op is Dictionary and op.get("kind") in FILE_OP_KINDS)
	var replay_ops: Array = (ops as Array).filter(func(op: Variant): return op is Dictionary and op.get("kind") == "replay.play")
	var scene_ops: Array = (ops as Array).filter(func(op: Variant): return not (op is Dictionary and (op.get("kind") in FILE_OP_KINDS or op.get("kind") in ["editor.undo", "replay.play"])))
	for op: Dictionary in file_ops:
		if str(op.get("kind", "")) == "script.write" and (op.get("attach", false) == true or (op.get("value") is Dictionary and op.value.get("attach", false) == true)):
			var script_path := _extract_op_path(op)
			var target_node := str(op.get("objectId", "."))
			var already_attached := false
			for s_op: Variant in scene_ops:
				if s_op is Dictionary and s_op.get("kind") in ["script.attach", "property.set"] and str(s_op.get("objectId", "")) == target_node:
					already_attached = true
					break
			if not already_attached and not script_path.is_empty():
				scene_ops.append({
					"kind": "script.attach",
					"objectId": target_node,
					"value": script_path,
					"role": str(op.get("role", "script")),
					"description": "%s에 %s 스크립트를 연결합니다" % [target_node, script_path.get_file()],
				})
	var pure_replay := not replay_ops.is_empty() and undo_ops.is_empty() and file_ops.is_empty() and scene_ops.is_empty()
	if not pure_replay and (root == null or root.scene_file_path.begins_with(REPLAY_DIR)):
		return {"ok":false,"message":"작업할 원본 씬을 먼저 여세요."}
	if not undo_ops.is_empty():
		if undo_ops.size() != ops.size():
			return {"ok":false,"message":"editor.undo는 단독 작업으로 요청해 주세요."}
		var manager := get_undo_redo()
		var history := manager.get_history_undo_redo(manager.get_object_history_id(root))
		if history == null or not history.has_undo():
			return {"ok":false,"message":"되돌릴 편집 기록이 없습니다."}
		if args.get("dryRun", false) == true:
			return {"ok":true,"message":"되돌리기 명령 검증 완료"}
		var requested := 0
		for op: Dictionary in undo_ops:
			requested += clampi(int(op.get("value", 1)), 1, 50)
		var undone := 0
		while undone < requested and history.has_undo():
			if not history.undo():
				break
			undone += 1
		return {"ok": undone > 0, "message": "편집 %d단계를 되돌렸습니다." % undone if undone > 0 else "되돌리기를 수행하지 못했습니다."}
	var staged_files := {}
	if not file_ops.is_empty():
		var file_check := _validate_file_ops(root, file_ops, staged_files)
		if not file_check.ok:
			return file_check
	if not replay_ops.is_empty() and scene_ops.is_empty():
		var player := get_tree().get_first_node_in_group(&"playforge_showcase_player")
		var has_template := player != null and player.get("_template_timeline") != null
		if _latest.is_empty() and not has_template:
			return {"ok":false,"message":"재생할 제작 기록이 없습니다. 먼저 씬 편집을 수행한 뒤 Replay를 요청해 주세요."}
	if args.get("dryRun", false) == true:
		if not scene_ops.is_empty():
			var valid := _commands.validate_batch(root, scene_ops, staged_files)
			if not valid:
				return {"ok": false, "message": _commands.error_message}
		return {"ok": true, "message": "편집 명령 검증 완료"}
	var messages := PackedStringArray()
	if not file_ops.is_empty():
		var file_outcome := _apply_file_ops(root, file_ops)
		if not file_outcome.ok:
			return file_outcome
		if not file_outcome.message.is_empty():
			messages.append(file_outcome.message)
	if not scene_ops.is_empty():
		var id := root.get_instance_id()
		var session: Dictionary = _sessions.get(id, {})
		var key := str(args.get("idempotencyKey", ""))
		var digest := JSON.stringify(scene_ops).sha256_text()
		if not key.is_empty() and session.get("keys", {}).has(key):
			var same: bool = session["keys"][key] == digest
			return {"ok":same,"message":"이미 적용한 작업입니다." if same else "같은 멱등 키에 다른 작업이 지정됐습니다."}
		var starts_fresh_build := root.get_child_count() == 0 and scene_ops.any(func(op: Variant): return op is Dictionary and op.get("kind") == "node.add")
		if session.is_empty() or starts_fresh_build:
			if not _commands.validate_batch(root, scene_ops, staged_files):
				return {"ok":false,"message":_commands.error_message}
			var baseline := PackedScene.new()
			var file := _storage.path_join("baseline-%s.tscn" % ResourceUID.create_id())
			if baseline.pack(root) != OK or ResourceSaver.save(baseline, file) != OK:
				return {"ok":false,"message":"편집 전 씬을 녹화용으로 저장하지 못했습니다."}
			session = {"baseline": file, "scene": root.scene_file_path, "events": [], "keys": {}, "count": 0}
			_sessions[id] = session
		var captured := _commands.capture_steps(root, scene_ops, get_undo_redo(), {"name":TOOL,"arguments":{"operations":scene_ops.duplicate(true)}})
		if captured.is_empty():
			return {"ok":false,"message":_commands.error_message}
		if not key.is_empty():
			session["keys"][key] = digest
		messages.append("씬 편집 %d개를 적용했습니다.%s" % [captured.size(), " 제작 시연으로 다시 볼 수 있습니다." if _last_error.is_empty() else " " + _last_error])
	if not replay_ops.is_empty():
		_trigger_replay.call_deferred()
		messages.append("PlayForge Showcase Replay로 처음부터 제작 과정을 시연합니다.")
	return {"ok":true, "message":"\n".join(messages)}

func _trigger_replay() -> void:
	if not _latest.is_empty():
		play_recording()
		return
	var player := get_tree().get_first_node_in_group(&"playforge_showcase_player")
	if player != null and player.get("_template_timeline") != null and player.has_method(&"_start_template_showcase"):
		player.call(&"_start_template_showcase")

const ASSET_PROTECTED_DIRS := [".godot", ".git", "addons", ".playforge-store", ".playforge-import"]
const ASSET_PROTECTED_FILES := ["project.godot", "playforge_replay_source.tscn", ".gdignore", ".gitignore", ".gitattributes", ".editorconfig"]

func _normalize_asset_path(raw: Variant) -> String:
	if not raw is String:
		return ""
	var text := (raw as String).strip_edges().replace("\\", "/")
	if text.is_empty() or text.length() > 512:
		return ""
	if not text.begins_with("res://"):
		text = "res://" + text.trim_prefix("/")
	text = text.simplify_path().trim_suffix("/")
	if not text.begins_with("res://") or text == "res://" or text == "res:/" or text.contains(".."):
		return ""
	return text

func _is_protected_asset_path(path: String, active_scene: String) -> bool:
	var rel := path.trim_prefix("res://")
	if rel.is_empty():
		return true
	var top := rel.split("/", false)[0]
	if top in ASSET_PROTECTED_DIRS or top.begins_with("."):
		return true
	if rel in ASSET_PROTECTED_FILES:
		return true
	if not active_scene.is_empty() and (path == active_scene or active_scene.begins_with(path + "/")):
		return true
	return false

func _validate_file_ops(root: Node, ops: Array, staged_files: Dictionary) -> Dictionary:
	var active_scene := root.scene_file_path if root != null else ""
	for op: Variant in ops:
		if not op is Dictionary:
			return {"ok":false, "message":"파일/에셋 명령 형식이 올바르지 않습니다."}
		var kind := str(op.get("kind", ""))
		if kind == "asset.delete":
			var target := _extract_op_path(op)
			if target.is_empty():
				return {"ok":false, "message":"삭제할 프로젝트 에셋 경로(res://...)를 지정해 주세요."}
			if _is_protected_asset_path(target, active_scene):
				return {"ok":false, "message":"보호된 프로젝트 파일이나 현재 열린 씬은 삭제할 수 없습니다: " + target}
			if not FileAccess.file_exists(target) and not DirAccess.dir_exists_absolute(target) and not staged_files.has(target):
				return {"ok":false, "message":"삭제할 에셋 파일 또는 폴더를 찾을 수 없습니다: " + target}
			staged_files.erase(target)
		elif kind == "assets.clear":
			staged_files.clear()
		elif kind == "pack.import":
			var pack_id := str(op.get("value", op.get("path", ""))).strip_edges()
			var pack_files := _store_pack_files(pack_id)
			if pack_files.is_empty():
				return {"ok":false, "message":"가져올 에셋 스토어 팩을 찾을 수 없습니다: " + pack_id}
			for rel in pack_files:
				if not FileAccess.file_exists(_store_source_path(rel)) and not FileAccess.file_exists("res://" + rel):
					return {"ok":false, "message":"에셋 스토어 원본 파일을 찾을 수 없습니다: " + rel}
				staged_files["res://" + rel] = true
			var bak_dir := DirAccess.open(_storage.path_join("backup_scripts"))
			if bak_dir != null:
				for script_name: String in bak_dir.get_files():
					if script_name.ends_with(".gd"):
						staged_files["res://Scripts/" + script_name] = true
		elif kind in ["asset.write", "script.write"]:
			var target := _extract_op_path(op)
			var content: Variant = _extract_op_content(op)
			if target.is_empty():
				return {"ok":false, "message":"작성할 파일 경로(res://...)를 path에 지정해 주세요."}
			if _is_protected_asset_path(target, active_scene):
				return {"ok":false, "message":"보호된 프로젝트 경로에는 파일을 작성할 수 없습니다: " + target}
			var ext := target.get_extension().to_lower()
			if kind == "script.write" and ext != "gd":
				return {"ok":false, "message":"script.write의 파일 확장자는 .gd여야 합니다: " + target}
			if kind == "asset.write" and ext not in WRITABLE_ASSET_EXTS:
				return {"ok":false, "message":"지원하지 않는 에셋 파일 확장자입니다: " + target}
			if not content is String or (content as String).strip_edges().is_empty() or (content as String).to_utf8_buffer().size() > 262144:
				return {"ok":false, "message":"파일 내용(value)은 256 KiB 이하의 비어 있지 않은 문자열이어야 합니다: " + target}
			staged_files[target] = true
	return {"ok":true, "message":"파일 명령 검증 완료"}

func _apply_file_ops(root: Node, ops: Array) -> Dictionary:
	var active_scene := root.scene_file_path if root != null else ""
	var deleted_count := 0
	var written_count := 0
	var imported_count := 0
	for op: Dictionary in ops:
		var kind := str(op.get("kind", ""))
		if kind == "asset.delete":
			var target := _extract_op_path(op)
			deleted_count += _delete_path_recursive(target, root, active_scene)
		elif kind == "assets.clear":
			deleted_count += _clear_project_assets("res://", root, active_scene, 0)
		elif kind == "pack.import":
			var pack_id := str(op.get("value", op.get("path", ""))).strip_edges()
			for rel in _store_pack_files(pack_id):
				var dst := "res://" + rel
				var src := _store_source_path(rel)
				if FileAccess.file_exists(src):
					DirAccess.make_dir_recursive_absolute(dst.get_base_dir())
					if DirAccess.copy_absolute(src, dst) == OK:
						imported_count += 1
				elif FileAccess.file_exists(dst):
					imported_count += 1
			var bak_dir := DirAccess.open(_storage.path_join("backup_scripts"))
			if bak_dir != null:
				for script_name: String in bak_dir.get_files():
					if not script_name.ends_with(".gd"):
						continue
					var script_dst: String = "res://Scripts/" + script_name
					var script_bak: String = _storage.path_join("backup_scripts").path_join(script_name)
					if not FileAccess.file_exists(script_dst) and FileAccess.file_exists(script_bak):
						DirAccess.make_dir_recursive_absolute("res://Scripts")
						DirAccess.copy_absolute(script_bak, script_dst)
		elif kind in ["asset.write", "script.write"]:
			var target := _extract_op_path(op)
			var content := str(_extract_op_content(op))
			if DirAccess.make_dir_recursive_absolute(target.get_base_dir()) != OK:
				return {"ok":false, "message":"폴더를 생성하지 못했습니다: " + target.get_base_dir()}
			var f := FileAccess.open(target, FileAccess.WRITE)
			if f == null:
				return {"ok":false, "message":"파일을 저장하지 못했습니다: " + target}
			f.store_string(content)
			f.close()
			written_count += 1
	var efs := EditorInterface.get_resource_filesystem()
	if efs != null:
		efs.scan()
	_refresh_context.call_deferred()
	var parts := PackedStringArray()
	if imported_count > 0:
		parts.append("에셋 스토어 파일 %d개를 가져왔습니다." % imported_count)
	if written_count > 0:
		parts.append("스크립트·에셋 파일 %d개를 작성했습니다." % written_count)
	if deleted_count > 0:
		parts.append("프로젝트 에셋 %d개를 삭제했습니다." % deleted_count)
	elif ops.any(func(o: Variant): return o is Dictionary and o.get("kind") in ["asset.delete", "assets.clear"]):
		parts.append("삭제할 프로젝트 에셋이 없어 이미 빈 프로젝트 상태입니다.")
	return {"ok":true, "message":" ".join(parts)}

func _detach_deleted_script(node: Node, deleted_path: String) -> void:
	if node == null:
		return
	var script: Script = node.get_script() as Script
	if script != null and script.resource_path == deleted_path:
		node.set_script(null)
	for child in node.get_children():
		_detach_deleted_script(child, deleted_path)

func _remove_file_with_sidecars(path: String, root: Node) -> int:
	var removed := 0
	if FileAccess.file_exists(path):
		if path.ends_with(".gd"):
			if path.begins_with("res://Scripts/"):
				var backup_dir: String = _storage.path_join("backup_scripts")
				DirAccess.make_dir_recursive_absolute(backup_dir)
				DirAccess.copy_absolute(path, backup_dir.path_join(path.get_file()))
			_detach_deleted_script(root, path)
		if DirAccess.remove_absolute(path) == OK:
			removed += 1
	for suffix: String in [".import", ".uid"]:
		var sidecar: String = path + suffix
		if FileAccess.file_exists(sidecar):
			DirAccess.remove_absolute(sidecar)
	return removed

func _delete_path_recursive(path: String, root: Node, active_scene: String) -> int:
	if _is_protected_asset_path(path, active_scene):
		return 0
	if FileAccess.file_exists(path):
		return _remove_file_with_sidecars(path, root)
	if not DirAccess.dir_exists_absolute(path):
		return 0
	var count := 0
	var dir := DirAccess.open(path)
	if dir == null:
		return 0
	var entries: Array[String] = []
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty():
		if entry != "." and entry != "..":
			entries.append(entry)
		entry = dir.get_next()
	dir.list_dir_end()
	for name_entry in entries:
		var child := path.path_join(name_entry)
		if DirAccess.dir_exists_absolute(child):
			count += _delete_path_recursive(child, root, active_scene)
		elif FileAccess.file_exists(child):
			if name_entry.ends_with(".import") or name_entry.ends_with(".uid"):
				DirAccess.remove_absolute(child)
			else:
				count += _remove_file_with_sidecars(child, root)
	DirAccess.remove_absolute(path)
	return count

func _clear_project_assets(dir_path: String, root: Node, active_scene: String, depth: int) -> int:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return 0
	var entries: Array[String] = []
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty():
		if entry != "." and entry != "..":
			entries.append(entry)
		entry = dir.get_next()
	dir.list_dir_end()
	var count := 0
	for name_entry in entries:
		var full := dir_path.path_join(name_entry) if dir_path != "res://" else "res://" + name_entry
		if depth == 0 and (name_entry in ASSET_PROTECTED_DIRS or name_entry in ASSET_PROTECTED_FILES or name_entry.begins_with(".")):
			continue
		if DirAccess.dir_exists_absolute(full):
			if not active_scene.is_empty() and active_scene.begins_with(full + "/"):
				count += _clear_project_assets(full, root, active_scene, depth + 1)
			else:
				count += _delete_path_recursive(full, root, active_scene)
		elif FileAccess.file_exists(full):
			if not active_scene.is_empty() and (full == active_scene or full == active_scene + ".uid" or full == active_scene + ".import"):
				continue
			if name_entry.ends_with(".import") or name_entry.ends_with(".uid"):
				DirAccess.remove_absolute(full)
			else:
				count += _remove_file_with_sidecars(full, root)
	return count

func _on_history_step(root: Node, call_record: Dictionary, cues: Array, reverted: bool) -> void:
	var session: Dictionary = _sessions[root.get_instance_id()]
	session.events.append({"call":call_record, "cues":cues.duplicate(true), "undo":reverted})
	session.count += cues.size()
	_latest = session
	_save_latest()

func _save_latest() -> void:
	var pending := _storage.path_join("latest.tmp")
	var f := FileAccess.open(pending, FileAccess.WRITE)
	_last_error = "녹화 저장 실패"
	if f != null:
		f.store_string(JSON.stringify(_latest))
		f.close()
		if DirAccess.rename_absolute(pending, _storage.path_join("latest.json")) == OK:
			_last_error = ""

func recording_manifest() -> Dictionary:
	if _latest.is_empty():
		_synthesize_authored_session()
	if _latest.is_empty():
		return {}
	var roles := []
	for id: String in Commands.ROLES:
		var info: Array = Commands.ROLES[id]
		roles.append({"id":id,"label":info[0],"color":info[1],"editorRegion":info[2],"description":info[0] + " 작업"})
	var cues := []
	for event: Dictionary in _latest.events:
		var batch: Array = event.cues.duplicate(true)
		if event.undo:
			batch.reverse()
		for item: Dictionary in batch:
			if event.undo:
				item.text = "되돌리기 · " + str(item.text)
				item.action = "revert"
			item.at = (cues.size() + 1) * 0.8
			if not item.has("x"):
				item.x = 420 + (cues.size() % 3) * 50
			if not item.has("y"):
				item.y = 180 + (cues.size() % 4) * 36
			cues.append(item)
	var manifest := {"schemaVersion":4, "title":"AI 제작 과정 시연", "duration":maxf(2.0, 1.0 + cues.size() * 0.8), "roles":roles, "cues":cues}
	if _latest.get("playOnCompletion", false) == true:
		manifest["playOnCompletion"] = true
	return manifest

func play_recording() -> void:
	if _opening:
		return
	if _latest.is_empty() or _latest.get("events", []).is_empty() or _latest.get("synthesized", false) == true:
		_synthesize_authored_session()
	var manifest := recording_manifest()
	if manifest.get("cues", []).is_empty():
		_panel.set_context("재생할 편집 기록이 없습니다.")
		return
	var player := get_tree().get_first_node_in_group(&"playforge_showcase_player")
	if player == null:
		_panel.set_context("PlayForge Showcase 플러그인을 활성화해 주세요.")
		return
	var baseline := ResourceLoader.load(_latest.baseline, "PackedScene") as PackedScene
	if baseline == null or DirAccess.make_dir_recursive_absolute(REPLAY_DIR) != OK:
		_panel.set_context("녹화 시작 씬을 열 수 없습니다.")
		return
	var file := REPLAY_DIR.path_join("AgentReplay-%s.tscn" % ResourceUID.create_id())
	if ResourceSaver.save(baseline, file) != OK:
		_panel.set_context("시연 장면을 만들 수 없습니다.")
		return
	_opening = true
	EditorInterface.open_scene_from_path(file)
	for frame in range(30):
		var scene := EditorInterface.get_edited_scene_root()
		if scene != null and scene.scene_file_path == file:
			break
		await get_tree().process_frame
	var replay := Commands.new()
	replay.configure(manifest.cues)
	if not player.play_agent_recording(manifest, replay, file):
		_panel.set_context("녹화 장면을 재생하지 못했습니다.")
	_opening = false

const SYNTH_PROPERTIES := [
	"position", "size", "scale", "rotation",
	"offset_left", "offset_top", "offset_right", "offset_bottom",
	"color", "modulate", "self_modulate", "z_index",
	"texture_filter", "texture_repeat", "centered", "flip_h", "flip_v",
	"region_enabled", "region_rect", "texture", "icon", "expand_icon", "flat",
	"text", "horizontal_alignment", "vertical_alignment", "mouse_filter", "visible",
]

func _find_authored_target_scene() -> String:
	var current := EditorInterface.get_edited_scene_root()
	var current_path := current.scene_file_path if current != null else ""
	var scenes_dir := DirAccess.open("res://scenes")
	var custom_scenes: Array[String] = []
	if scenes_dir != null:
		for f: String in scenes_dir.get_files():
			if f.ends_with(".tscn") and f != "main.tscn":
				custom_scenes.append("res://scenes/" + f)
	if not custom_scenes.is_empty():
		if current_path in custom_scenes:
			return current_path
		custom_scenes.sort()
		return custom_scenes.back()
	if current != null and not current_path.begins_with("res://.godot/"):
		if current.get_child_count() > 0 or current.get_script() != null or current.name != &"ForgeReplay":
			return current_path
	if ResourceLoader.exists("res://scenes/main.tscn", "PackedScene"):
		return "res://scenes/main.tscn"
	return ""

func _find_fallback_authored_script() -> String:
	var scripts_dir := DirAccess.open("res://Scripts")
	if scripts_dir == null:
		return ""
	var candidates: Array[String] = []
	for f: String in scripts_dir.get_files():
		if f.ends_with(".gd"):
			candidates.append("res://Scripts/" + f)
	candidates.sort()
	for path: String in candidates:
		if not path.ends_with("/Main.gd") and not path.ends_with("/Game.gd"):
			return path
	return candidates.back() if not candidates.is_empty() else ""

func _synthesize_authored_session() -> bool:
	var target_path := _find_authored_target_scene()
	if target_path.is_empty():
		return false
	var current := EditorInterface.get_edited_scene_root()
	var source_root: Node = null
	var owns_source := false
	if current != null and current.scene_file_path == target_path:
		source_root = current
	else:
		var packed := ResourceLoader.load(target_path, "PackedScene") as PackedScene
		if packed == null:
			return false
		source_root = packed.instantiate()
		owns_source = true
	if source_root == null or not Commands.valid_node_type(source_root.get_class()):
		if owns_source and source_root != null:
			source_root.free()
		return false
	var blank_root := ClassDB.instantiate(source_root.get_class()) as Node
	if blank_root == null:
		if owns_source:
			source_root.free()
		return false
	blank_root.name = source_root.name
	var baseline := PackedScene.new()
	var packed_ok := baseline.pack(blank_root) == OK
	blank_root.free()
	if not packed_ok:
		if owns_source:
			source_root.free()
		return false
	var cues: Array = []
	var assets_dir := DirAccess.open("res://Assets")
	if assets_dir != null and not assets_dir.get_files().is_empty():
		cues.append({"action": "point", "role": "assets", "x": 140, "y": 420, "text": "프로젝트 에셋 리소스 확인"})
	for child in source_root.get_children():
		_collect_authored_node_cues(child, source_root, cues)
	var root_script_path := ""
	var root_script: Script = source_root.get_script() as Script
	if root_script != null and root_script.resource_path.begins_with("res://") and FileAccess.file_exists(root_script.resource_path):
		root_script_path = root_script.resource_path
	elif cues.size() <= 1:
		root_script_path = _find_fallback_authored_script()
	if not root_script_path.is_empty():
		cues.append({"action": "point", "role": "script", "scriptPhase": "open", "scriptPath": root_script_path, "x": 480, "y": 210, "text": "%s 스크립트 에디터 열기" % root_script_path.get_file()})
		cues.append({"action": "point", "role": "script", "scriptPhase": "paste", "scriptPath": root_script_path, "x": 480, "y": 260, "text": "%s 게임 로직 스크립트 작성" % root_script_path.get_file()})
		cues.append({"action": "set", "object": ".", "property": "script", "value": root_script_path, "role": "script", "text": "루트 노드에 %s 스크립트 연결" % root_script_path.get_file()})
	if owns_source:
		source_root.free()
	if cues.is_empty():
		return false
	var baseline_file := _storage.path_join("baseline-%s.tscn" % ResourceUID.create_id())
	if ResourceSaver.save(baseline, baseline_file) != OK:
		return false
	_latest = {
		"baseline": baseline_file,
		"scene": target_path,
		"events": [{"call": {"name": TOOL}, "cues": cues, "undo": false}],
		"count": cues.size(),
		"playOnCompletion": true,
		"synthesized": true,
	}
	return true

func _collect_authored_node_cues(node: Node, root: Node, cues: Array) -> void:
	if cues.size() >= 240 or not Commands.valid_node_type(node.get_class()):
		return
	var rel_path := str(root.get_path_to(node))
	if not Commands.valid_path(rel_path) or rel_path == ".":
		return
	var role := "gui" if (node is Control or node is CanvasLayer) else "level"
	cues.append({
		"action": "add",
		"object": rel_path,
		"type": node.get_class(),
		"role": role,
		"text": "%s (%s) 노드 추가" % [node.name, node.get_class()],
	})
	var def_node := ClassDB.instantiate(node.get_class()) as Node
	if def_node != null:
		for prop: String in SYNTH_PROPERTIES:
			if cues.size() >= 240:
				break
			if prop not in node:
				continue
			var val: Variant = node.get(prop)
			var def_val: Variant = def_node.get(prop)
			if typeof(val) == typeof(def_val) and val == def_val:
				continue
			var encoded := _encode_cue_value(prop, val)
			if not encoded.get("ok", false):
				continue
			if not Commands.decode_property(def_node, prop, encoded.value).get("ok", false):
				continue
			var prop_role := "assets" if prop in ["texture", "icon", "texture_normal"] else role
			cues.append({
				"action": "set",
				"object": rel_path,
				"property": prop,
				"value": encoded.value,
				"role": prop_role,
				"text": "%s · %s 설정" % [node.name, prop],
			})
		def_node.free()
	var node_script: Script = node.get_script() as Script
	if node_script != null and node_script.resource_path.begins_with("res://") and FileAccess.file_exists(node_script.resource_path):
		cues.append({
			"action": "set",
			"object": rel_path,
			"property": "script",
			"value": node_script.resource_path,
			"role": "script",
			"text": "%s 스크립트 연결" % node.name,
		})
	if not node.scene_file_path.is_empty():
		return
	for child in node.get_children():
		_collect_authored_node_cues(child, root, cues)

static func _encode_cue_value(prop: String, val: Variant) -> Dictionary:
	match typeof(val):
		TYPE_VECTOR2:
			var v2: Vector2 = val
			return {"ok": is_finite(v2.x) and is_finite(v2.y), "value": [v2.x, v2.y]}
		TYPE_VECTOR3:
			var v3: Vector3 = val
			return {"ok": is_finite(v3.x) and is_finite(v3.y) and is_finite(v3.z), "value": [v3.x, v3.y, v3.z]}
		TYPE_RECT2:
			var r2: Rect2 = val
			return {"ok": is_finite(r2.position.x) and is_finite(r2.position.y) and is_finite(r2.size.x) and is_finite(r2.size.y), "value": [r2.position.x, r2.position.y, r2.size.x, r2.size.y]}
		TYPE_COLOR:
			var c: Color = val
			return {"ok": true, "value": "#" + c.to_html(true)}
		TYPE_BOOL, TYPE_INT:
			return {"ok": true, "value": val}
		TYPE_FLOAT:
			return {"ok": is_finite(val), "value": val}
		TYPE_STRING:
			return {"ok": (val as String).length() <= 4096, "value": val}
		TYPE_OBJECT:
			if val is Resource and prop in ["texture", "icon", "texture_normal", "texture_pressed", "texture_hover", "script"]:
				var rpath := (val as Resource).resource_path
				if rpath.begins_with("res://") and not rpath.contains("::") and FileAccess.file_exists(rpath):
					return {"ok": true, "value": rpath}
	return {"ok": false}

func _choose_recording() -> void:
	_dock.make_visible()
	if OS.has_feature("web"):
		if _web_import_callback == null:
			_web_import_callback = JavaScriptBridge.create_callback(_web_import_selected)
			JavaScriptBridge.get_interface("window")["__playforgeImportAgentRecording"] = _web_import_callback
		JavaScriptBridge.eval("(function(){const i=document.createElement('input');i.type='file';i.accept='.jsonl';i.onchange=async()=>{const f=i.files[0];if(f)window.__playforgeImportAgentRecording?.(f.size<=4194304?await f.text():'');};i.click();})()", true)
		return
	if _file_dialog == null:
		_file_dialog = EditorFileDialog.new()
		_file_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILE
		_file_dialog.access = EditorFileDialog.ACCESS_FILESYSTEM
		_file_dialog.add_filter("*.jsonl", "MCP 녹화")
		_file_dialog.file_selected.connect(_import_file)
		_dock.add_child(_file_dialog)
	_file_dialog.popup_centered_ratio(0.65)

func _web_import_selected(args: Array) -> void:
	if args.size() == 1:
		_import_text.call_deferred(str(args[0]))

func _import_file(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > 4194304:
		_panel.set_context("4 MB 이하의 MCP 녹화 파일을 선택해 주세요.")
		return
	_import_text(file.get_as_text())

func _import_text(source: String) -> void:
	var result := import_recording(source)
	if result.ok:
		play_recording()
	else:
		_panel.set_context(result.message)

func import_recording(source: String) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null or source.is_empty() or source.to_utf8_buffer().size() > 4194304:
		return {"ok":false, "message":"편집 전 씬과 4 MB 이하의 MCP 녹화가 필요합니다."}
	var baseline := PackedScene.new()
	if baseline.pack(root) != OK:
		return {"ok":false, "message":"녹화의 시작 씬을 준비하지 못했습니다."}
	var packets: Array[Dictionary] = []
	var revisions := {}
	for line in source.split("\n", false):
		var parser := JSON.new()
		if parser.parse(line) != OK or not parser.data is Dictionary:
			return {"ok":false, "message":"녹화 파일의 JSON 행을 읽을 수 없습니다."}
		var packet: Dictionary = parser.data
		if packet.get("params") is Dictionary and packet.params.get("_meta") is Dictionary and packet.params._meta.has("playforge/revision"):
			var rev: Variant = packet.params._meta["playforge/revision"]
			if (not rev is float and not rev is int) or not is_finite(rev) or rev < 0 or floor(rev) != rev or revisions.has(rev):
				return {"ok":false,"message":"녹화의 서버 리비전이 중복되거나 올바르지 않습니다."}
			revisions[rev] = true
		packets.append(packet)
	if not revisions.is_empty():
		if revisions.size() != packets.size():
			return {"ok":false, "message":"서버 리비전이 일부 누락되어 편집 순서를 결정할 수 없습니다."}
		packets.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.params._meta["playforge/revision"] < b.params._meta["playforge/revision"])
	var scratch := baseline.instantiate()
	var commands := Commands.new()
	var events := []
	var count := 0
	var problem := ""
	for request in packets:
		var params: Variant = request.get("params")
		if request.get("method") != "tools/call" or not params is Dictionary or params.get("name") != TOOL or not params.get("arguments") is Dictionary:
			problem = "지원하는 pf_workspace_apply 녹화가 아닙니다."
			break
		if params.arguments.get("dryRun") == true:
			continue
		var ops: Variant = params.arguments.get("operations")
		if not ops is Array or ops.is_empty() or ops.size() > Commands.MAX_OPERATIONS or count + ops.size() > 512:
			problem = "한 호출은 1~256개, 한 녹화는 최대 512개 명령을 지원합니다."
			break
		var plans := commands.prepare(scratch, ops)
		if plans.is_empty():
			problem = commands.error_message
			break
		var cues := []
		for plan: Dictionary in plans:
			match plan.action:
				"add":
					Commands.attach(plan.parent, plan.node, scratch)
				"set":
					plan.node.set(plan.property, plan.decoded)
				"delete":
					plan.parent.remove_child(plan.node)
					plan.node.free()
				"rename":
					plan.node.name = plan.value
				"clear":
					for child: Node in plan.children:
						scratch.remove_child(child)
						child.free()
			cues.append(Commands.recorded_cue(plan))
		events.append({"call":params,"cues":cues,"undo":false})
		count += cues.size()
	scratch.free()
	if not problem.is_empty() or events.is_empty():
		return {"ok":false, "message":problem if not problem.is_empty() else "녹화에 편집 명령이 없습니다."}
	var file := _storage.path_join("baseline-%s.tscn" % ResourceUID.create_id())
	if ResourceSaver.save(baseline, file) != OK:
		return {"ok":false,"message":"녹화 시작 씬을 저장하지 못했습니다."}
	_latest = {"baseline":file,"scene":root.scene_file_path,"events":events,"count":count}
	_save_latest()
	return {"ok":true,"message":"MCP 녹화를 열었습니다."}
