@tool
extends EditorPlugin

const ChatPanel := preload("chat_panel.gd")
const Commands := preload("scene_commands.gd")
const REPLAY_DIR := "res://.godot/playforge_agent_replays"
const TOOL := "pf_workspace_apply"
const PACK_IMPORT_TOOL := "pf_asset_pack_import"
const PACK_STATUS_TOOL := "pf_asset_pack_status"
const TOOL_MENU := "PlayForge AI 채팅"
var _commands := Commands.new()
var _panel: VBoxContainer
var _dock: EditorDock
var _request: HTTPRequest
var _request_root: Node
var _request_version := 0
var _sessions := {}
var _latest := {}
var _storage := ""
var _last_error := ""
var _opening := false
var _file_dialog: EditorFileDialog
var _web_import_callback: JavaScriptObject
var _pack_receipts := {}
var _active_pack_operation := ""

func _enter_tree() -> void:
	add_to_group(&"playforge_agent_chat")
	_storage = "user://forge-agent-" + ProjectSettings.globalize_path("res://").sha256_text().left(16)
	DirAccess.make_dir_recursive_absolute(_storage)
	var saved := _storage.path_join("latest.json")
	if FileAccess.file_exists(saved):
		var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(saved))
		if value is Dictionary and value.get("events") is Array:
			_latest = value
	_dock = EditorDock.new()
	_dock.name = "PlayForgeAgentChat"
	_dock.title = "AI 채팅"
	_dock.layout_key = "playforge_agent_chat"
	_dock.default_slot = EditorDock.DOCK_SLOT_BOTTOM
	_dock.available_layouts = EditorDock.DOCK_LAYOUT_HORIZONTAL
	_panel = ClassDB.instantiate(&"PlayForgeAgentChatDock") as VBoxContainer if ClassDB.class_exists(&"PlayForgeAgentChatDock") else VBoxContainer.new()
	_panel.set_script(ChatPanel)
	_dock.add_child(_panel)
	add_dock(_dock)
	add_tool_menu_item(TOOL_MENU, _dock.make_visible)
	add_tool_menu_item("MCP 녹화로 제작 시연 열기", _choose_recording)
	_panel.submitted.connect(_on_submitted)
	_panel.replay_requested.connect(play_recording)
	_commands.history_step.connect(_on_history_step)
	_request = HTTPRequest.new()
	_request.timeout = 90
	_request.body_size_limit = 524288
	add_child(_request)
	_request.request_completed.connect(_on_reply)
	EditorInterface.get_selection().selection_changed.connect(_refresh_context)
	scene_changed.connect(_scene_changed)
	_refresh_context.call_deferred()

func _exit_tree() -> void:
	remove_tool_menu_item(TOOL_MENU)
	remove_tool_menu_item("MCP 녹화로 제작 시연 열기")
	if _web_import_callback != null:
		JavaScriptBridge.get_interface("window")["__playforgeImportAgentRecording"] = null
		_web_import_callback = null
	EditorInterface.get_selection().selection_changed.disconnect(_refresh_context)
	_request.cancel_request()
	remove_dock(_dock)
	_dock.queue_free()

func _scene_changed(_node: Node) -> void:
	_refresh_context.call_deferred()

func _context() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return {"scene": "", "selection": []}
	var selection := []
	for node in EditorInterface.get_selection().get_selected_nodes():
		if node == root or root.is_ancestor_of(node):
			selection.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
	return {"scene": root.scene_file_path, "rootType": root.get_class(), "selection": selection}

func _refresh_context() -> void:
	var context := _context()
	var selected := PackedStringArray()
	for item: Dictionary in context.selection:
		selected.append(item.path)
	_panel.set_context("씬 선택 필요" if context.scene.is_empty() else "%s  ·  %s" % [context.scene.get_file(), ", ".join(selected) if not selected.is_empty() else "선택 없음"])

func _tool_schema() -> Dictionary:
	return {"type": "function", "function": {"name": TOOL, "description": "현재 Godot 씬을 한 번의 Undo로 되돌릴 수 있도록 편집합니다. objectId는 씬 루트 기준 노드 경로이며 루트는 . 입니다. node.add는 type, property.set은 propertyId와 value를 사용합니다. 벡터는 배열, 색은 HTML 색상입니다.", "parameters": {"type": "object", "required": ["operations"], "properties": {"operations": {"type": "array", "items": {"type": "object", "required": ["kind", "objectId", "role", "description"], "properties": {
		"kind": {"type":"string", "enum":["node.add","property.set"]}, "objectId":{"type":"string"}, "type":{"type":"string","enum":Commands.TYPES}, "propertyId":{"type":"string","enum":Commands.PROPERTIES}, "value":{}, "role":{"type":"string","enum":Commands.ROLES.keys()}, "description":{"type":"string"}
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

func _on_submitted(message: String, history: Array) -> void:
	if message.begins_with("{"):
		var parser := JSON.new()
		if parser.parse(message) != OK or not parser.data is Dictionary:
			_panel.fail_turn("MCP 호출 JSON을 읽을 수 없습니다.")
			return
		_show_result(apply_call(parser.data))
		return
	var web := OS.has_feature("web")
	var bridge: String = _panel.providers.endpoint
	var model := OS.get_environment("PLAYFORGE_AGENT_MODEL")
	if bridge.is_empty() and _panel.providers.provider != "ollama":
		_panel.fail_turn("Run_AgentReplay.cmd로 로컬 에디터를 열고 설정에서 계정을 연결해 주세요.")
		return
	if not web and bridge.is_empty() and model.is_empty():
		_panel.fail_turn("Ollama에 설치한 모델 이름으로 PLAYFORGE_AGENT_MODEL을 설정하고 에디터를 다시 여세요. MCP 호출 JSON도 입력할 수 있습니다.")
		return
	_request_root = EditorInterface.get_edited_scene_root()
	_request_version = _editor_version(_request_root)
	var tools := [_tool_schema()]
	var tool_guidance := "씬 편집 요청은 pf_workspace_apply 한 번으로 수행하세요. "
	if _asset_store() != null:
		tools.append_array(_pack_tool_schemas())
		tool_guidance += "에셋 스토어 팩 요청에는 전용 도구를 사용하세요. 등록된 상품 ID를 모르면 사용자에게 확인하세요. "
	var messages := [{"role":"system", "content":"Godot 편집 도우미입니다. 한국어로 답하세요. " + tool_guidance + "현재 문맥: " + JSON.stringify(_context())}]
	messages.append_array(history)
	messages.append({"role":"user", "content":message})
	var endpoint := OS.get_environment("PLAYFORGE_OLLAMA_URL")
	if endpoint.is_empty():
		endpoint = "http://127.0.0.1:11434/api/chat"
	var body := {"messages":messages, "tools":tools}
	if not bridge.is_empty():
		endpoint = bridge
		body.provider = _panel.providers.provider
	elif web:
		endpoint = str(JavaScriptBridge.eval("window.location.origin")) + "/api/agent-chat"
	else:
		body.merge({"model":model, "stream":false})
	if _request.request(endpoint, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body)) != OK:
		_panel.fail_turn("AI 모델 연결을 시작하지 못했습니다.")

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
	var response: Dictionary = body.message
	var calls: Variant = response.get("tool_calls", [])
	if not calls is Array or calls.size() > 1:
		_panel.fail_turn("한 번의 요청에는 편집 작업 묶음 하나를 사용해 주세요.")
		return
	if calls.is_empty():
		_panel.add_reply(str(response.get("content", "")))
		return
	if not calls[0] is Dictionary or not calls[0].get("function") is Dictionary:
		_panel.fail_turn("AI가 반환한 호출 형식이 올바르지 않습니다.")
		return
	var tool_call: Dictionary = calls[0].function
	var tool: Variant = tool_call.get("name")
	if tool != PACK_STATUS_TOOL and (not is_instance_valid(_request_root) or _request_root != EditorInterface.get_edited_scene_root() or _request_version != _editor_version(_request_root)):
		_panel.fail_turn("응답을 기다리는 동안 씬이 바뀌었습니다. 현재 씬에서 다시 요청해 주세요.")
		return
	var outcome := apply_call({"jsonrpc":"2.0","method":"tools/call","params":tool_call})
	_show_result(outcome, str(response.get("content", "")) if tool == TOOL else "")

func _show_result(outcome: Dictionary, reply := "") -> void:
	var message: String = outcome.message
	if outcome.has("operationId"):
		message += "\n작업 ID: " + outcome.operationId
	if outcome.ok:
		_panel.add_reply((reply + "\n" if not reply.is_empty() else "") + message)
	else:
		_panel.fail_turn(message)

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

func _call_scene_edit(args: Dictionary) -> Dictionary:
	var ops: Variant = args.get("operations")
	if not ops is Array or ops.is_empty() or ops.size() > Commands.MAX_OPERATIONS:
		return {"ok":false,"message":"편집 명령은 1~256개로 묶어 주세요."}
	var root := EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path.begins_with(REPLAY_DIR):
		return {"ok":false,"message":"작업할 원본 씬을 먼저 여세요."}
	if args.get("dryRun", false) == true:
		var valid := _commands.validate_batch(root, ops)
		return {"ok": valid, "message": "편집 명령 검증 완료" if valid else _commands.error_message}
	var id := root.get_instance_id()
	var session: Dictionary = _sessions.get(id, {})
	var key := str(args.get("idempotencyKey", ""))
	var digest := JSON.stringify(ops).sha256_text()
	if not key.is_empty() and session.get("keys", {}).has(key):
		var same: bool = session["keys"][key] == digest
		return {"ok":same,"message":"이미 적용한 작업입니다." if same else "같은 멱등 키에 다른 작업이 지정됐습니다."}
	if session.is_empty():
		if not _commands.validate_batch(root, ops):
			return {"ok":false,"message":_commands.error_message}
		var baseline := PackedScene.new()
		var file := _storage.path_join("baseline-%s.tscn" % ResourceUID.create_id())
		if baseline.pack(root) != OK or ResourceSaver.save(baseline, file) != OK:
			return {"ok":false,"message":"편집 전 씬을 녹화용으로 저장하지 못했습니다."}
		session = {"baseline": file, "scene": root.scene_file_path, "events": [], "keys": {}, "count": 0}
		_sessions[id] = session
	var captured := _commands.capture_steps(root, ops, get_undo_redo(), {"name":TOOL,"arguments":{"operations":ops.duplicate(true)}})
	if captured.is_empty():
		return {"ok":false,"message":_commands.error_message}
	if not key.is_empty():
		session["keys"][key] = digest
	return {"ok":true,"message":"편집 %d개를 적용했습니다.%s" % [captured.size(), " 제작 시연으로 다시 볼 수 있습니다." if _last_error.is_empty() else " " + _last_error]}

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
			item.x = 420 + (cues.size() % 3) * 50
			item.y = 180 + (cues.size() % 4) * 36
			cues.append(item)
	return {"schemaVersion":4, "title":"AI 채팅 제작 과정", "duration":maxf(2.0, 1.0 + cues.size() * 0.8), "roles":roles, "cues":cues}

func play_recording() -> void:
	if _opening:
		return
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
			if plan.action == "add":
				Commands.attach(plan.parent, plan.node, scratch)
			else:
				plan.node.set(plan.property, plan.decoded)
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
