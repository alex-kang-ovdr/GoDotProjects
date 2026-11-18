@tool
extends VBoxContainer

const CHOICE := "playforge/agent_chat/provider"
const IDS := ["ollama", "claude-console", "chatgpt-connect", "openai-api", "gemini", "zai-coding-plan"]
const LABELS := ["Ollama", "Claude Console", "ChatGPT Connect", "OpenAI API", "Gemini", "z.ai Coding Plan"]
var provider := "ollama"
var endpoint := ""
var _providers := {}
var _choice := OptionButton.new()
var _model := LineEdit.new()
var _catalog := MenuButton.new()
var _key := LineEdit.new()
var _workspace := LineEdit.new()
var _connect := Button.new()
var _disconnect := Button.new()
var _refresh := Button.new()
var _link := LinkButton.new()
var _console := LinkButton.new()
var _status := Label.new()
var _http := HTTPRequest.new()
var _poll := Timer.new()
var _busy := false


func _ready() -> void:
	name = "ChatProviderSettings"
	if OS.has_feature("web"):
		endpoint = str(JavaScriptBridge.eval("['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin + '/api/agent-chat' : ''", true))
	else:
		var local := RegEx.new()
		local.compile("^https?://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]{1,5})?/api/agent-chat$")
		var address := OS.get_environment("PLAYFORGE_AGENT_CHAT_URL")
		if local.search(address) != null:
			endpoint = address
	var preferences := EditorInterface.get_editor_settings()
	if preferences.has_setting(CHOICE) and preferences.get_setting(CHOICE) in IDS:
		provider = preferences.get_setting(CHOICE)
	var fields := HFlowContainer.new()
	add_child(fields)
	_choice.name = "ChatProvider"
	for label: String in LABELS:
		_choice.add_item(label)
	fields.add_child(_choice)
	_choice.select(IDS.find(provider))
	_choice.item_selected.connect(_select)
	_model.name = "ProviderModel"
	_model.placeholder_text = "모델 이름"
	_model.custom_minimum_size.x = 155 * EditorInterface.get_editor_scale()
	fields.add_child(_model)
	_catalog.text = "사용 가능 모델"
	fields.add_child(_catalog)
	_catalog.get_popup().id_pressed.connect(func(id: int): _model.text = _catalog.get_popup().get_item_text(id))
	_key.name = "ClaudeApiKey"
	_key.secret = true
	_key.placeholder_text = "Anthropic API 키"
	fields.add_child(_key)
	_workspace.placeholder_text = "워크스페이스 ID (선택)"
	fields.add_child(_workspace)
	_console.text = "Claude Console에서 키 관리"
	_console.uri = "https://platform.claude.com/settings/keys"
	fields.add_child(_console)
	for button in [_connect, _disconnect, _refresh, _link]:
		fields.add_child(button)
	_connect.name = "ConnectProvider"
	_connect.pressed.connect(_connect_provider)
	_disconnect.text = "연결 해제"
	_disconnect.pressed.connect(func(): _request("/disconnect", {"provider": provider}))
	_refresh.text = "상태 확인"
	_refresh.pressed.connect(func(): _request(""))
	_link.text = "브라우저에서 ChatGPT 로그인"
	_link.hide()
	_status.name = "ProviderStatus"
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status)
	_http.timeout = 25
	_http.max_redirects = 0
	_http.body_size_limit = 65536
	add_child(_http)
	_http.request_completed.connect(_reply)
	_poll.wait_time = 2.5
	_poll.timeout.connect(func(): _request(""))
	add_child(_poll)
	visibility_changed.connect(_on_visibility)
	_render(true)


func _on_visibility() -> void:
	if is_visible_in_tree():
		_request("")
	else:
		_key.clear()
		_poll.stop()


func _select(index: int) -> void:
	provider = IDS[index]
	EditorInterface.get_editor_settings().set_setting(CHOICE, provider)
	_key.clear()
	_workspace.clear()
	_render(true)


func _render(reset_model := false) -> void:
	var row: Dictionary = _providers.get(provider, {})
	if reset_model:
		_model.text = str(row.get("model", ""))
	var menu := _catalog.get_popup()
	menu.clear()
	for value: String in row.get("models", []):
		menu.add_item(value)
	_catalog.visible = menu.item_count > 0
	var pending: bool = provider == "chatgpt-connect" and row.get("auth") == "pending"
	_key.visible = provider not in ["chatgpt-connect", "ollama"]
	_key.placeholder_text = "%s API 키" % LABELS[IDS.find(provider)]
	_workspace.visible = provider == "claude-console"
	_console.visible = _workspace.visible
	_link.visible = pending and not _link.uri.is_empty()
	_connect.text = "로그인" if provider == "chatgpt-connect" and not row.get("configured", false) else "적용"
	_model.placeholder_text = "Ollama 모델 이름" if provider == "ollama" else "모델 (기본값 사용 가능)"
	_disconnect.disabled = _busy or not (row.get("configured", false) or pending)
	_connect.disabled = _busy or endpoint.is_empty() or (pending and not _link.uri.is_empty())
	_refresh.disabled = _busy or endpoint.is_empty()
	_choice.disabled = _busy
	var states := {"connected": "연결됨", "pending": "브라우저 인증 대기 중", "disconnected": "연결 필요", "unavailable": "사용할 수 없음"}
	_status.text = "%s  %s" % [states.get(row.get("auth", ""), ""), row.get("detail", "")]
	if endpoint.is_empty():
		_status.text = "계정 설정은 Run_AgentReplay.cmd로 연 로컬 에디터에서 사용할 수 있습니다."
	if pending and is_visible_in_tree() and _poll.is_stopped():
		_poll.start()
	elif not pending:
		_poll.stop()


func _connect_provider() -> void:
	var data := {"provider": provider, "model": _model.text.strip_edges()}
	if _key.visible and not _key.text.is_empty():
		data.api_key = _key.text.strip_edges()
	if _workspace.visible and not _workspace.text.strip_edges().is_empty():
		data.workspace = _workspace.text.strip_edges()
	_key.clear()
	_request("/connect", data)


func _request(suffix: String, data := {}) -> void:
	if _busy or endpoint.is_empty():
		return
	_busy = true
	_render()
	var method := HTTPClient.METHOD_GET if data.is_empty() else HTTPClient.METHOD_POST
	var err := _http.request(endpoint + "/providers" + suffix, ["Content-Type: application/json"], method, "" if data.is_empty() else JSON.stringify(data))
	if err != OK:
		_busy = false
		_render()
		_status.text = "인증 서비스 연결을 시작할 수 없습니다."


func _reply(result: int, status: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
	_busy = false
	var data: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	if result != HTTPRequest.RESULT_SUCCESS or status != 200 or not data is Dictionary or not data.get("providers") is Array:
		_render()
		_poll.stop()
		_status.text = str(data.get("error", "인증 서비스가 응답하지 않습니다.")) if data is Dictionary else "인증 서비스가 응답하지 않습니다."
		return
	var previous_model: String = _providers.get(provider, {}).get("model", "")
	_providers.clear()
	for row: Dictionary in data.providers:
		if row.get("id") in IDS:
			_providers[row.id] = row
	if data.has("connect_url"):
		var url := str(data.connect_url)
		if url.begins_with("https://auth.openai.com/") or url.begins_with("https://chatgpt.com/"):
			_link.uri = url
	if _providers.get("chatgpt-connect", {}).get("auth") != "pending":
		_link.uri = ""
	_render(_model.text == previous_model or _model.text.is_empty())
