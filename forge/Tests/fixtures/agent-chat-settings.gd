@tool
extends EditorPlugin


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var chat := get_tree().get_first_node_in_group(&"playforge_agent_chat")
	if chat == null:
		_fail("The editor must enable PlayForge Agent Chat.")
		return
	var dock: EditorDock = chat.get("_dock")
	dock.make_visible()
	var panel: Control = chat.get("_panel")
	var settings: Control = panel.find_child("ChatProviderSettings", true, false)
	var open: Button = panel.find_child("OpenChatSettings", true, false)
	if open == null or settings == null or settings.visible:
		_fail("The chat Settings button must be available with settings initially closed.")
		return
	var provider: OptionButton = settings.find_child("ChatProvider", true, false)
	var key: LineEdit = settings.find_child("ClaudeApiKey", true, false)
	var model: LineEdit = settings.find_child("ProviderModel", true, false)
	var connect_button: Button = settings.find_child("ConnectProvider", true, false)
	var status: Label = settings.find_child("ProviderStatus", true, false)
	var browser_login: LinkButton = settings.get("_link")
	var disconnect_button: Button = settings.get("_disconnect")
	open.button_pressed = true
	if not await _wait_for(func() -> bool: return settings.is_visible_in_tree() and status.text.contains("fixture-ollama")):
		_fail("Opening Settings must load the provider list from the bridge.")
		return
	var installed := settings.find_child("OllamaInstalledModel", true, false) as OptionButton
	var manual := settings.find_child("OllamaManualConnection", true, false) as CheckButton
	var address := settings.find_child("OllamaAddress", true, false) as LineEdit
	if not installed.is_visible_in_tree() or model.is_visible_in_tree() or installed.get_item_text(1) != "qwen3:4b (권장)" or installed.get_item_text(2) != "large:test (최저 사양 미달)":
		_fail("Ollama auto mode must show installed models and their eligibility labels.")
		return
	_select(installed, "qwen3:4b (권장)")
	connect_button.pressed.emit()
	if not await _wait_for(func() -> bool: return status.text.contains("qwen3:4b")):
		_fail("Ollama must connect using the selected installed model.")
		return
	manual.button_pressed = true
	if not model.is_visible_in_tree() or not address.is_visible_in_tree() or installed.is_visible_in_tree():
		_fail("Manual Ollama mode must show both the port and model inputs.")
		return
	address.text = "http://127.0.0.1:11555"
	model.text = "alternate:latest"
	connect_button.pressed.emit()
	if not await _wait_for(func() -> bool: return status.text.contains("alternate:latest")):
		_fail("Ollama must accept an explicitly entered model and loopback port.")
		return
	manual.button_pressed = false
	_select(provider, "Claude API")
	if not key.is_visible_in_tree() or not key.secret or connect_button.disabled:
		_fail("Claude API must offer a masked key field and an enabled Connect button.")
		return
	key.text = "fixture-claude-key"
	model.text = "fixture-claude-model"
	connect_button.pressed.emit()
	if not key.text.is_empty() or not await _wait_for(func() -> bool: return status.text.contains("claude connected")):
		_fail("Connecting Claude must clear the submitted key and show the bridge status.")
		return
	if not await _send_message(panel, "claude fixture turn", "reply from claude-console"):
		_fail("Chat must use the selected Claude provider.")
		return
	_select(provider, "ChatGPT")
	if key.is_visible_in_tree() or not key.text.is_empty() or connect_button.disabled:
		_fail("ChatGPT Connect must use browser sign-in and leave the Claude key cleared.")
		return
	var browser_requests := PackedStringArray()
	settings.login_browser_requested.connect(func(url: String): browser_requests.append(url))
	connect_button.pressed.emit()
	if not await _wait_for(func() -> bool: return status.text.contains("브라우저에서 로그인을 마치면")):
		_fail("ChatGPT must show its pending browser sign-in state.")
		return
	if not browser_login.is_visible_in_tree() or browser_login.uri != "https://auth.openai.com/fixture" or not connect_button.disabled:
		_fail("Pending ChatGPT sign-in must show the bridge link and disable duplicate login.")
		return
	if browser_requests != PackedStringArray(["https://auth.openai.com/fixture"]):
		_fail("Starting ChatGPT sign-in must request one browser launch.")
		return
	if not await _wait_for(func() -> bool: return status.text.contains("chatgpt connected")):
		_fail("The editor must poll the provider status and show ChatGPT connected.")
		return
	if browser_login.is_visible_in_tree() or not browser_login.uri.is_empty() or disconnect_button.disabled:
		_fail("Connecting ChatGPT must clear the login link and enable Disconnect.")
		return
	_select(panel.find_child("ChatTurnModel", true, false), "fixture-fast")
	_select(panel.find_child("ChatReasoningEffort", true, false), "추론 높음")
	panel.get("_fast").button_pressed = true
	var transcript: RichTextLabel = panel.find_child("ChatTranscript", true, false)
	panel.submit_message("chatgpt fixture turn")
	if not await _wait_for(func() -> bool: return transcript.get_parsed_text().contains("응답 작성 중")):
		_fail("ChatGPT must show a live text delta before the final response.")
		return
	if not await _wait_for(func() -> bool: return transcript.get_parsed_text().contains("reply from chatgpt-connect")):
		_fail("ChatGPT must persist and show the final response.")
		return
	disconnect_button.pressed.emit()
	if not await _wait_for(func() -> bool: return status.text.contains("chatgpt disconnected") and disconnect_button.disabled):
		_fail("Disconnect must return ChatGPT to its signed-out state.")
		return
	open.button_pressed = false
	if settings.visible or not key.text.is_empty():
		_fail("Closing Settings must keep the Claude secret clear.")
		return
	print("PLAYFORGE_AGENT_CHAT_SETTINGS_OK")
	get_tree().quit()


func _select(choice: OptionButton, title: String) -> void:
	for index in range(choice.item_count):
		if choice.get_item_text(index) == title:
			choice.select(index)
			choice.item_selected.emit(index)
			return


func _send_message(panel: Control, message: String, expected_reply: String) -> bool:
	var transcript: RichTextLabel = panel.find_child("ChatTranscript", true, false)
	panel.submit_message(message)
	return await _wait_for(func() -> bool: return transcript.get_parsed_text().contains(expected_reply))


func _wait_for(predicate: Callable) -> bool:
	var deadline := Time.get_ticks_msec() + 10000
	while not predicate.call():
		if Time.get_ticks_msec() >= deadline:
			return false
		await get_tree().process_frame
	return true


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
