@tool
extends VBoxContainer

signal configuration_changed
signal login_browser_requested(url: String)

const CHOICE := "playforge/agent_chat/provider"
const IDS := ["ollama", "claude-console", "chatgpt-connect", "claude-connect", "gemini-connect", "openai-api", "gemini", "zai-coding-plan"]
const LABELS := ["Ollama", "Claude API", "ChatGPT", "Claude", "Gemini", "OpenAI API", "Gemini API", "z.ai Coding Plan API"]
var provider := "ollama"
var endpoint := ""
var _providers := {}
var _choice := OptionButton.new()
var _model := LineEdit.new()
var _ollama_model := OptionButton.new()
var _ollama_manual := CheckButton.new()
var _ollama_url := LineEdit.new()
var _catalog := MenuButton.new()
var _key := LineEdit.new()
var _workspace := LineEdit.new()
var _connect := Button.new()
var _disconnect := Button.new()
var _refresh := Button.new()
var _link := LinkButton.new()
var _copy_link := Button.new()
var _console := LinkButton.new()
var _status := Label.new()
var _http := HTTPRequest.new()
var _poll := Timer.new()
var _busy := false
var _awaiting_login_url := false
var _login_tab: JavaScriptObject


func current_configuration() -> Dictionary:
	return _providers.get(provider, {})


func current_label() -> String:
	return LABELS[IDS.find(provider)]


func ensure_configuration() -> void:
	if _providers.is_empty():
		_request("")


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
	_ollama_model.name = "OllamaInstalledModel"
	_ollama_model.custom_minimum_size.x = 170 * EditorInterface.get_editor_scale()
	_ollama_model.tooltip_text = "실행 중인 Ollama에서 발견한 모델 목록"
	fields.add_child(_ollama_model)
	_ollama_manual.name = "OllamaManualConnection"
	_ollama_manual.text = "수동 연결"
	_ollama_manual.toggled.connect(func(checked: bool):
		if checked and _model.text.strip_edges().is_empty():
			_model.text = _selected_ollama_model()
		_render()
	)
	fields.add_child(_ollama_manual)
	_ollama_url.name = "OllamaAddress"
	_ollama_url.placeholder_text = "http://127.0.0.1:11434"
	_ollama_url.custom_minimum_size.x = 180 * EditorInterface.get_editor_scale()
	fields.add_child(_ollama_url)
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
	for button in [_connect, _disconnect, _refresh, _link, _copy_link]:
		fields.add_child(button)
	_connect.name = "ConnectProvider"
	_connect.pressed.connect(_connect_provider)
	_disconnect.text = "연결 해제"
	_disconnect.pressed.connect(func(): _request("/disconnect", {"provider": provider}))
	_refresh.text = "상태 확인"
	_refresh.pressed.connect(func(): _request(""))
	_link.text = "로그인 페이지 열기"
	_link.hide()
	_copy_link.text = "로그인 주소 복사"
	_copy_link.pressed.connect(func():
		if not _link.uri.is_empty():
			DisplayServer.clipboard_set(_link.uri)
			_status.text = "로그인 주소를 복사했습니다."
	)
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
	configuration_changed.emit()


func _on_visibility() -> void:
	if is_visible_in_tree():
		_request("")
	else:
		_key.clear()
		_poll.stop()

func _exit_tree() -> void:
	_close_login_tab()


func _select(index: int) -> void:
	provider = IDS[index]
	EditorInterface.get_editor_settings().set_setting(CHOICE, provider)
	_key.clear()
	_workspace.clear()
	if provider == "ollama":
		_ollama_url.text = str(current_configuration().get("url", ""))
	_render(true)
	configuration_changed.emit()


func _render(reset_model := false) -> void:
	var row: Dictionary = _providers.get(provider, {})
	if reset_model:
		_model.text = str(row.get("model", ""))
	var menu := _catalog.get_popup()
	menu.clear()
	for value: String in row.get("models", []):
		menu.add_item(value)
	var ollama := provider == "ollama"
	_render_ollama(row)
	_catalog.visible = not ollama and menu.item_count > 0
	var is_oauth := provider in ["chatgpt-connect", "claude-connect", "gemini-connect"]
	var pending: bool = is_oauth and row.get("auth") == "pending"
	_key.visible = not is_oauth and provider != "ollama"
	_key.placeholder_text = "%s API 키" % LABELS[IDS.find(provider)]
	_workspace.visible = provider == "claude-console"
	_console.visible = _workspace.visible
	_link.visible = pending and not _link.uri.is_empty()
	_copy_link.visible = _link.visible
	_connect.text = "브라우저로 로그인" if is_oauth and not row.get("configured", false) else "적용"
	_disconnect.text = "로그인 취소" if pending else "연결 해제"
	_model.placeholder_text = "Ollama 모델 이름" if provider == "ollama" else "모델 (기본값 사용 가능)"
	_disconnect.disabled = _busy or not (row.get("configured", false) or pending)
	_connect.disabled = _busy or endpoint.is_empty() or (pending and not _link.uri.is_empty()) or (
		ollama and not _ollama_manual.button_pressed and _ollama_model.selected < 0)
	_refresh.disabled = _busy or endpoint.is_empty()
	_choice.disabled = _busy
	var states := {"connected": "연결됨", "pending": "브라우저 인증 대기 중", "disconnected": "연결 필요", "unavailable": "사용할 수 없음"}
	_status.text = "%s  %s" % [states.get(row.get("auth", ""), ""), row.get("detail", "")]
	if ollama and not row.is_empty():
		if row.get("available", false):
			var address := str(row.get("url", "http://127.0.0.1:11434"))
			_status.text = "검색됨 · %s" % address
			if row.get("configured", false):
				_status.text = "연결됨 · %s" % row.get("model", "")
			elif _ollama_model.item_count == 0:
				_status.text = "Ollama 검색됨 · 설치된 모델이 없습니다."
		else:
			_status.text = "로컬 Ollama 실행을 기다리는 중입니다. 수동 연결에서 포트를 지정할 수 있습니다."
	if pending:
		_status.text = "브라우저에서 로그인을 마치면 AI 채팅에 연결됩니다. 탭이 열리지 않으면 로그인 주소를 복사할 수 있습니다."
	elif _awaiting_login_url:
		_status.text = "Codex에 실제 로그인 주소를 요청하는 중입니다."
	if endpoint.is_empty():
		_status.text = "계정 설정은 Run_AgentReplay.cmd로 연 로컬 에디터에서 사용할 수 있습니다."
	if (pending or ollama) and is_visible_in_tree() and not endpoint.is_empty():
		var interval := 2.5 if pending else 8.0
		if _poll.is_stopped() or not is_equal_approx(_poll.wait_time, interval):
			_poll.start(interval)
	else:
		_poll.stop()


func _render_ollama(row: Dictionary) -> void:
	var is_ollama := provider == "ollama"
	var manual := is_ollama and _ollama_manual.button_pressed
	_ollama_manual.visible = is_ollama
	_ollama_manual.disabled = _busy
	_ollama_model.visible = is_ollama and not manual
	_ollama_url.visible = manual
	_model.visible = not is_ollama or manual
	if not is_ollama:
		return
	var previous := _selected_ollama_model()
	if previous.is_empty():
		previous = str(row.get("model", ""))
	var details := {}
	for item: Dictionary in row.get("model_details", []):
		details[item.name] = item
	_ollama_model.clear()
	var selected := -1
	var recommended := -1
	for model_name: String in row.get("models", []):
		var info: Dictionary = details.get(model_name, {})
		var below := bool(info.get("below_minimum", false))
		var suggested := bool(info.get("recommended", false))
		var suffix := " (최저 사양 미달)" if below else (" (권장)" if suggested else "")
		_ollama_model.add_item(model_name + suffix)
		var index := _ollama_model.item_count - 1
		_ollama_model.set_item_metadata(index, model_name)
		if below and info.get("minimum_memory_bytes") != null:
			var gib := float(info.minimum_memory_bytes) / 1073741824.0
			_ollama_model.get_popup().set_item_tooltip(index, "추정 최소 시스템 RAM %.1f GiB" % gib)
		if suggested and recommended == -1:
			recommended = index
		if model_name == previous:
			selected = index
	if _ollama_model.item_count > 0:
		_ollama_model.select(selected if selected >= 0 else maxi(recommended, 0))
	_ollama_model.text = "설치된 모델 없음" if _ollama_model.item_count == 0 else _ollama_model.get_item_text(_ollama_model.selected)
	_ollama_model.disabled = _busy or _ollama_model.item_count == 0


func _selected_ollama_model() -> String:
	return str(_ollama_model.get_selected_metadata()) if _ollama_model.selected >= 0 else ""


func _connect_provider() -> void:
	if _busy or endpoint.is_empty():
		return
	if provider == "chatgpt-connect" and not current_configuration().get("configured", false):
		_reserve_login_tab()
	var data := {"provider": provider, "model": _model.text.strip_edges()}
	if provider == "ollama":
		if _ollama_manual.button_pressed:
			data.url = _ollama_url.text.strip_edges()
		else:
			data.model = _selected_ollama_model()
	if _key.visible and not _key.text.is_empty():
		data.api_key = _key.text.strip_edges()
	if _workspace.visible and not _workspace.text.strip_edges().is_empty():
		data.workspace = _workspace.text.strip_edges()
	_key.clear()
	_request("/connect", data)


func _reserve_login_tab() -> void:
	_awaiting_login_url = true
	if OS.has_feature("web"):
		var window := JavaScriptBridge.get_interface("window")
		if window != null and window.__playforgeReserveChatGPTLogin != null:
			_login_tab = window.__playforgeReserveChatGPTLogin()


func _open_login_browser(url: String) -> void:
	login_browser_requested.emit(url)
	if OS.has_feature("web"):
		if _login_tab != null:
			_login_tab.navigate(url)
			_login_tab = null
	elif DisplayServer.get_name() != "headless":
		OS.shell_open(url)


func _close_login_tab(message := "편집기에서 로그인 요청이 종료되었습니다.") -> void:
	_awaiting_login_url = false
	if _login_tab != null:
		_login_tab.fail(message)
		_login_tab = null


func _request(suffix: String, data := {}) -> void:
	if _busy or endpoint.is_empty():
		return
	_busy = true
	_render()
	var method := HTTPClient.METHOD_GET if data.is_empty() else HTTPClient.METHOD_POST
	var err := _http.request(endpoint + "/providers" + suffix, ["Content-Type: application/json"], method, "" if data.is_empty() else JSON.stringify(data))
	if err != OK:
		_busy = false
		_close_login_tab("로컬 인증 서비스에 연결하지 못했습니다.")
		_render()
		_status.text = "인증 서비스 연결을 시작할 수 없습니다."


func _reply(result: int, status: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
	_busy = false
	var data: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	if result != HTTPRequest.RESULT_SUCCESS or status != 200 or not data is Dictionary or not data.get("providers") is Array:
		var message := str(data.get("error", "인증 서비스가 응답하지 않습니다.")) if data is Dictionary else "인증 서비스가 응답하지 않습니다."
		_close_login_tab(message)
		_render()
		_poll.stop()
		_status.text = message
		return
	var previous_model: String = _providers.get(provider, {}).get("model", "")
	var previous_url: String = _providers.get("ollama", {}).get("url", "")
	_providers.clear()
	for row: Dictionary in data.providers:
		if row.get("id") in IDS:
			_providers[row.id] = row
	if _ollama_url.text == previous_url or _ollama_url.text.is_empty():
		_ollama_url.text = str(_providers.get("ollama", {}).get("url", ""))
	if data.has("connect_url"):
		var url := str(data.connect_url)
		if url.begins_with("https://auth.openai.com/") or url.begins_with("https://chatgpt.com/"):
			_link.uri = url
	if _providers.get("chatgpt-connect", {}).get("auth") != "pending":
		_link.uri = ""
	if _awaiting_login_url and not _link.uri.is_empty():
		_open_login_browser(_link.uri)
	var login_failed: bool = _awaiting_login_url and _link.uri.is_empty() and not current_configuration().get("configured", false)
	_close_login_tab("Codex에서 사용할 수 있는 로그인 주소를 받지 못했습니다." if login_failed else "이 계정은 이미 연결되어 있습니다.")
	_render(_model.text == previous_model or _model.text.is_empty())
	if login_failed:
		_status.text = "Codex에서 로그인 주소를 받지 못했습니다. 다시 시도해 주세요."
	configuration_changed.emit()
