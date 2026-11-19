
func _web_chat_probe_start() -> void:
	_open_chat()
	if _panel.providers.provider != "chatgpt-connect":
		_panel.providers.call("_select", 2)
	var timer := Timer.new()
	timer.wait_time = 0.15
	timer.timeout.connect(_web_chat_probe_publish)
	add_child(timer)
	timer.start()


func _web_chat_probe_publish() -> void:
	var transcript := _panel.find_child("ChatTranscript", true, false) as RichTextLabel
	var input := _panel.find_child("ChatInput", true, false) as TextEdit
	var attach := _panel.find_child("ChatAddImage", true, false) as Control
	var chips := _panel.find_child("ChatImageChips", true, false) as Control
	var login := _panel.find_child("ConnectProvider", true, false) as Button
	var row: Dictionary = _panel.providers.current_configuration()
	var state := {
		"configured": row.get("configured", false),
		"transcript": transcript.get_parsed_text(),
		"input": _web_chat_probe_position(input),
		"attach": _web_chat_probe_position(attach),
		"send": _web_chat_probe_position(_panel.find_child("ChatSend", true, false) as Control),
		"settings": _web_chat_probe_position(_panel.find_child("OpenChatSettings", true, false) as Control),
		"login": _web_chat_probe_position(login),
		"loginDisabled": login.disabled,
		"attachments": chips.get_child_count(),
		"storagePath": ProjectSettings.globalize_path(_storage.path_join("chat-sessions.json")),
		"storageExists": FileAccess.file_exists(_storage.path_join("chat-sessions.json")),
		"sessionLoadError": int(_panel.sessions.last_error),
	}
	JavaScriptBridge.eval("window.__playforgeChatProbe = " + JSON.stringify(state), true)


func _web_chat_probe_position(control: Control) -> Dictionary:
	if control == null or not control.is_visible_in_tree():
		return {}
	var screen := control.get_viewport_rect().size
	var point := control.get_global_rect().get_center() / screen
	return {"x": point.x, "y": point.y}
