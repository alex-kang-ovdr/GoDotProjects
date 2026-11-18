@tool
extends VBoxContainer

signal submitted(message: String, history: Array)
signal replay_requested

# Keep the same number of completed exchanges as PlayForgeAgentChatDock.
const HISTORY_TURNS := 12
const ProviderSettings := preload("chat_settings.gd")
var providers := ProviderSettings.new()
var _web_history: Array = []
var _pending := ""
var _context_text := ""
var _context: Label
var _transcript: RichTextLabel
var _input: LineEdit
var _send: Button
var _status: Label


func _ready() -> void:
	add_theme_constant_override("separation", 6)
	var header := HBoxContainer.new()
	add_child(header)
	_context = Label.new()
	_context.name = "ChatContext"
	_context.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_context.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(_context)
	set_context(_context_text)
	var settings_button := Button.new()
	settings_button.name = "OpenChatSettings"
	settings_button.text = "설정"
	settings_button.toggle_mode = true
	header.add_child(settings_button)
	providers.hide()
	add_child(providers)
	settings_button.toggled.connect(providers.set_visible)
	var replay := Button.new()
	replay.name = "RequestReplay"
	replay.text = "리플레이 재생"
	replay.pressed.connect(func() -> void: replay_requested.emit())
	header.add_child(replay)
	_transcript = RichTextLabel.new()
	_transcript.name = "ChatTranscript"
	_transcript.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_transcript.custom_minimum_size.y = 86
	_transcript.selection_enabled = true
	_transcript.scroll_following = true
	add_child(_transcript)
	_status = Label.new()
	_status.name = "ChatStatus"
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.hide()
	add_child(_status)
	var composer := HBoxContainer.new()
	add_child(composer)
	_input = LineEdit.new()
	_input.name = "ChatInput"
	_input.placeholder_text = "에이전트에게 메시지 보내기"
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.text_submitted.connect(submit_message)
	_input.text_changed.connect(func(_value: String) -> void: _update_input())
	composer.add_child(_input)
	_send = Button.new()
	_send.name = "ChatSend"
	_send.text = "보내기"
	_send.pressed.connect(func() -> void: submit_message(_input.text))
	composer.add_child(_send)
	_update_input()


func configure(callback: Callable) -> void:
	if callback.is_valid() and not submitted.is_connected(callback):
		submitted.connect(callback)


func set_context(label: String) -> void:
	_context_text = label
	if is_instance_valid(_context):
		_context.text = label
		_context.tooltip_text = label


func submit_message(text: String) -> void:
	var message := text.strip_edges()
	if not _pending.is_empty() or message.is_empty():
		return
	_pending = message
	_input.clear()
	_append_message("나", message)
	_status.text = "응답을 기다리는 중…"
	_status.show()
	_update_input()
	var history: Array = get("agent_chat_history") if is_class("PlayForgeAgentChatDock") else _web_history.duplicate(true)
	submitted.emit(message, history)


func add_reply(message: String) -> void:
	if _pending.is_empty():
		return
	var exchange := [{"role": "user", "content": _pending}, {"role": "assistant", "content": message}]
	if is_class("PlayForgeAgentChatDock"):
		set("agent_chat_exchange", exchange)
	else:
		_web_history.append_array(exchange)
		if _web_history.size() > HISTORY_TURNS * 2:
			_web_history = _web_history.slice(2)
	_append_message("에이전트", message)
	_pending = ""
	_status.hide()
	_update_input()


func fail_turn(message: String) -> void:
	if _pending.is_empty():
		return
	_status.text = message
	_status.show()
	_input.text = _pending
	_input.caret_column = _pending.length()
	_pending = ""
	_update_input()


func _update_input() -> void:
	_input.editable = _pending.is_empty()
	_send.disabled = not _pending.is_empty() or _input.text.strip_edges().is_empty()


func _append_message(speaker: String, message: String) -> void:
	if _transcript.get_paragraph_count() > 1 or _transcript.get_total_character_count() > 0:
		_transcript.newline()
	_transcript.push_bold()
	_transcript.add_text(speaker + "  ")
	_transcript.pop()
	_transcript.add_text(message)
