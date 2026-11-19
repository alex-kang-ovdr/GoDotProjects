@tool
extends VBoxContainer

signal submitted(message: String, history: Array)
signal replay_requested
signal stop_requested
signal proposal_decided(approved: bool)

const ProviderSettings := preload("chat_settings.gd")
const ChatContext := preload("chat_context.gd")
const ChatSessions := preload("chat_sessions.gd")
const ChatAttachments := preload("chat_attachments.gd")
const MODES := ["확인 후 편집", "계획만", "바로 편집"]
enum EditMode { REVIEW, PLAN, APPLY }

var providers := ProviderSettings.new()
var context := ChatContext.new()
var sessions := ChatSessions.new()
var attachments := ChatAttachments.new()
var mode := 0
var model := ""
var reasoning_effort := ""
var fast := false
var _pending := ""
var _pending_id := ""
var _streaming := false
var partial_response := ""
var _drafts := {}
var _ephemeral_turns := {}
var _thread_button: Button
var _new_thread: Button
var _thread_popup: PopupPanel
var _thread_search: LineEdit
var _thread_list: ItemList
var _thread_title: ConfirmationDialog
var _title_input: LineEdit
var _delete_thread: ConfirmationDialog
var _rename_action: Button
var _delete_action: Button
var _model: OptionButton
var _mode: OptionButton
var _effort: OptionButton
var _fast: CheckButton
var _transcript: RichTextLabel
var _input: TextEdit
var _send: Button
var _stop: Button
var _status: Label
var _proposal: VBoxContainer
var _proposal_text: RichTextLabel


func load_sessions(directory: String) -> void:
	sessions.load_from(directory)


func _ready() -> void:
	add_theme_constant_override("separation", 8)
	_build_header()
	_build_history_popup()
	_transcript = RichTextLabel.new()
	_transcript.name = "ChatTranscript"
	_transcript.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_transcript.custom_minimum_size.y = 110 * EditorInterface.get_editor_scale()
	_transcript.selection_enabled = true
	_transcript.scroll_following = true
	add_child(_transcript)
	_status = Label.new()
	_status.name = "ChatStatus"
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.hide()
	add_child(_status)
	_build_approval()
	add_child(context)
	add_child(attachments)
	_build_composer()
	_refresh_thread()
	_update_input()


func _build_header() -> void:
	var header := HFlowContainer.new()
	add_child(header)
	_new_thread = Button.new()
	_new_thread.name = "ChatNewConversation"
	_new_thread.text = "새 대화"
	_new_thread.pressed.connect(_create_thread)
	header.add_child(_new_thread)
	_thread_button = Button.new()
	_thread_button.name = "ChatHistory"
	_thread_button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_thread_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_thread_button.pressed.connect(_open_history)
	header.add_child(_thread_button)
	var settings := Button.new()
	settings.name = "OpenChatSettings"
	settings.text = "설정"
	settings.toggle_mode = true
	header.add_child(settings)
	var replay := Button.new()
	replay.name = "RequestReplay"
	replay.text = "리플레이 재생"
	replay.pressed.connect(func() -> void: replay_requested.emit())
	header.add_child(replay)
	providers.hide()
	add_child(providers)
	settings.toggled.connect(providers.set_visible)
	providers.configuration_changed.connect(_refresh_model_controls)


func _build_history_popup() -> void:
	_thread_popup = PopupPanel.new()
	_thread_popup.name = "ChatHistoryPopup"
	add_child(_thread_popup)
	var content := VBoxContainer.new()
	_thread_popup.add_child(content)
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 12)
	_thread_search = LineEdit.new()
	_thread_search.name = "ChatSearch"
	_thread_search.placeholder_text = "대화 검색"
	_thread_search.text_changed.connect(func(_query: String) -> void: _filter_threads())
	content.add_child(_thread_search)
	_thread_list = ItemList.new()
	_thread_list.name = "ChatConversationList"
	_thread_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_thread_list.auto_height = false
	_thread_list.item_activated.connect(func(index: int) -> void:
		_switch_thread(str(_thread_list.get_item_metadata(index)))
		_thread_popup.hide()
	)
	_thread_list.item_selected.connect(func(_index: int) -> void: _update_history_actions())
	content.add_child(_thread_list)
	var actions := HFlowContainer.new()
	content.add_child(actions)
	var open := Button.new()
	open.text = "열기"
	open.pressed.connect(func() -> void:
		var id := _history_selection()
		if not id.is_empty():
			_switch_thread(id)
			_thread_popup.hide()
	)
	actions.add_child(open)
	_rename_action = Button.new()
	_rename_action.text = "이름 변경"
	_rename_action.pressed.connect(_prompt_rename)
	actions.add_child(_rename_action)
	_delete_action = Button.new()
	_delete_action.text = "삭제"
	_delete_action.pressed.connect(_prompt_delete)
	actions.add_child(_delete_action)
	_thread_title = ConfirmationDialog.new()
	_thread_title.title = "대화 이름 변경"
	_thread_title.min_size = Vector2i(300, 92)
	add_child(_thread_title)
	_title_input = LineEdit.new()
	_title_input.placeholder_text = "대화 이름"
	_thread_title.add_child(_title_input)
	_thread_title.register_text_enter(_title_input)
	_thread_title.confirmed.connect(func() -> void:
		_drafts[sessions.active_id] = _input.text
		sessions.rename(str(_thread_title.get_meta("thread")), _title_input.text)
		_refresh_thread()
	)
	_delete_thread = ConfirmationDialog.new()
	_delete_thread.title = "대화 삭제"
	_delete_thread.dialog_text = "이 대화와 저장된 메시지를 삭제할까요?"
	add_child(_delete_thread)
	_delete_thread.confirmed.connect(func() -> void:
		var id := str(_delete_thread.get_meta("thread"))
		var previous := sessions.active_id
		_drafts[previous] = _input.text
		if sessions.remove(id):
			_drafts.erase(id)
			_ephemeral_turns.erase(id)
			if sessions.active_id != previous:
				_clear_attachments()
		_refresh_thread()
	)


func _build_approval() -> void:
	_proposal = VBoxContainer.new()
	_proposal.name = "ChatProposal"
	_proposal.hide()
	add_child(_proposal)
	_proposal_text = RichTextLabel.new()
	_proposal_text.custom_minimum_size.y = 84 * EditorInterface.get_editor_scale()
	_proposal_text.selection_enabled = true
	_proposal_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_proposal.add_child(_proposal_text)
	var actions := HBoxContainer.new()
	_proposal.add_child(actions)
	var apply := Button.new()
	apply.name = "ChatApprove"
	apply.text = "편집 적용"
	apply.pressed.connect(func() -> void: proposal_decided.emit(true))
	actions.add_child(apply)
	var reject := Button.new()
	reject.name = "ChatReject"
	reject.text = "거절"
	reject.pressed.connect(func() -> void: proposal_decided.emit(false))
	actions.add_child(reject)


func _build_composer() -> void:
	var controls := HFlowContainer.new()
	add_child(controls)
	_model = OptionButton.new()
	_model.name = "ChatTurnModel"
	_model.tooltip_text = "이 대화 요청에 사용할 모델"
	_model.get_popup().about_to_popup.connect(providers.ensure_configuration)
	_model.item_selected.connect(func(index: int) -> void:
		model = str(_model.get_item_metadata(index))
		_refresh_effort_controls()
	)
	controls.add_child(_model)
	_mode = OptionButton.new()
	_mode.name = "ChatEditMode"
	_mode.tooltip_text = "에이전트가 씬을 편집할 수 있는 범위"
	for label: String in MODES:
		_mode.add_item(label)
	_mode.item_selected.connect(func(index: int) -> void: mode = index)
	controls.add_child(_mode)
	_effort = OptionButton.new()
	_effort.name = "ChatReasoningEffort"
	_effort.item_selected.connect(func(index: int) -> void: reasoning_effort = str(_effort.get_item_metadata(index)))
	controls.add_child(_effort)
	_fast = CheckButton.new()
	_fast.text = "빠른 응답"
	_fast.toggled.connect(func(value: bool) -> void: fast = value)
	controls.add_child(_fast)
	_input = TextEdit.new()
	_input.name = "ChatInput"
	_input.placeholder_text = "Godot 프로젝트 작업을 요청하세요"
	_input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_input.custom_minimum_size.y = 65 * EditorInterface.get_editor_scale()
	_input.text_changed.connect(_update_input)
	_input.gui_input.connect(_composer_key)
	add_child(_input)
	var actions := HBoxContainer.new()
	add_child(actions)
	var hint := Label.new()
	hint.text = "Enter 전송 · Shift+Enter 줄바꿈"
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	actions.add_child(hint)
	_stop = Button.new()
	_stop.name = "ChatStop"
	_stop.text = "중지"
	_stop.pressed.connect(func() -> void: stop_requested.emit())
	actions.add_child(_stop)
	_send = Button.new()
	_send.name = "ChatSend"
	_send.text = "보내기"
	_send.pressed.connect(func() -> void: submit_message(_input.text))
	actions.add_child(_send)
	_refresh_model_controls()


func _composer_key(event: InputEvent) -> void:
	if event is not InputEventKey or not event.pressed or event.echo or event.shift_pressed:
		return
	if event.keycode not in [KEY_ENTER, KEY_KP_ENTER]:
		return
	_input.accept_event()
	if _pending.is_empty():
		submit_message(_input.text)
	elif (event.ctrl_pressed or event.meta_pressed) and not _input.text.strip_edges().is_empty():
		var next := _input.text
		stop_requested.emit()
		submit_message(next)


func _refresh_model_controls() -> void:
	attachments.set_provider(providers.provider)
	if not is_instance_valid(_model):
		return
	var info: Dictionary = providers.current_configuration()
	var configured := str(info.get("model", ""))
	var previous := model
	var models: Array = info.get("models", [])
	_model.clear()
	_model.add_item(configured if not configured.is_empty() else "%s 기본 모델" % providers.current_label())
	_model.set_item_metadata(0, "")
	var selected := 0
	for value: String in models:
		if value == configured or value.is_empty():
			continue
		_model.add_item(value)
		var index := _model.item_count - 1
		_model.set_item_metadata(index, value)
		if value == previous:
			selected = index
	_model.select(selected)
	model = str(_model.get_item_metadata(selected))
	_refresh_effort_controls()


func _refresh_effort_controls() -> void:
	var info: Dictionary = providers.current_configuration()
	var configured := str(info.get("model", ""))
	var codex := providers.provider == "chatgpt-connect"
	_effort.visible = codex
	_fast.visible = codex
	_effort.clear()
	_effort.add_item("추론 기본값")
	_effort.set_item_metadata(0, "")
	var efforts: Array = info.get("reasoning_efforts", {}).get(model if not model.is_empty() else configured, [])
	var effort_index := 0
	for value: String in efforts:
		_effort.add_item(str({"none": "추론 없음", "minimal": "추론 최소", "low": "추론 낮음", "medium": "추론 보통", "high": "추론 높음", "xhigh": "추론 매우 높음", "max": "추론 최고"}.get(value, value)))
		var index := _effort.item_count - 1
		_effort.set_item_metadata(index, value)
		if value == reasoning_effort:
			effort_index = index
	_effort.select(effort_index)
	reasoning_effort = str(_effort.get_item_metadata(effort_index))
	_effort.disabled = _effort.item_count == 1


func _open_history() -> void:
	_thread_search.clear()
	_filter_threads()
	_thread_popup.popup_centered(Vector2i(420, 300) * EditorInterface.get_editor_scale())
	_thread_search.grab_focus()


func _filter_threads() -> void:
	_thread_list.clear()
	for item: Dictionary in sessions.list(_thread_search.text):
		_thread_list.add_item(item.title)
		var index := _thread_list.item_count - 1
		_thread_list.set_item_metadata(index, item.id)
		if item.id == sessions.active_id:
			_thread_list.select(index)
	_update_history_actions()


func _update_history_actions() -> void:
	var selected := not _history_selection().is_empty()
	_rename_action.disabled = not selected
	_delete_action.disabled = not selected


func _history_selection() -> String:
	var current := _thread_list.get_selected_items()
	return "" if current.is_empty() else str(_thread_list.get_item_metadata(current[0]))


func _create_thread() -> void:
	if not _pending.is_empty():
		return
	_drafts[sessions.active_id] = _input.text
	if not sessions.create().is_empty():
		_clear_attachments()
	_refresh_thread()


func _switch_thread(id: String) -> void:
	if not _pending.is_empty():
		return
	_drafts[sessions.active_id] = _input.text
	if sessions.select(id):
		_clear_attachments()
		_refresh_thread()


func _prompt_rename() -> void:
	var id := _history_selection()
	if id.is_empty():
		return
	_thread_popup.hide()
	_thread_title.set_meta("thread", id)
	for item: Dictionary in sessions.list():
		if item.id == id:
			_title_input.text = item.title
			break
	_thread_title.popup_centered()
	_title_input.grab_focus()
	_title_input.select_all()


func _prompt_delete() -> void:
	var id := _history_selection()
	if not id.is_empty():
		_thread_popup.hide()
		_delete_thread.set_meta("thread", id)
		_delete_thread.popup_centered()


func _refresh_thread() -> void:
	for item: Dictionary in sessions.list():
		if item.id == sessions.active_id:
			_thread_button.text = "대화 · " + item.title
			_thread_button.tooltip_text = item.title
			break
	_input.text = str(_drafts.get(sessions.active_id, ""))
	_status.hide()
	_render_transcript()
	if sessions.last_error != OK:
		_set_status("대화 기록을 저장하거나 읽지 못했습니다.")
	_update_input()


func display_messages() -> Array:
	var result := sessions.messages()
	var extra: Variant = _ephemeral_turns.get(sessions.active_id, [])
	if extra is Array and not extra.is_empty():
		result.append_array(extra.duplicate(true))
	return result


func _render_transcript(show_empty := true) -> void:
	_transcript.clear()
	var messages := display_messages()
	if show_empty and messages.is_empty() and _pending.is_empty():
		_transcript.push_color(get_theme_color("font_color", "Label").lerp(Color.GRAY, 0.36))
		_transcript.add_text("새 대화를 시작하세요. 씬의 노드를 선택한 뒤 문맥에 첨부할 수 있습니다.")
		_transcript.pop()
		return
	for entry: Dictionary in messages:
		_append_message("나" if entry.role == "user" else "에이전트", entry.content)
	if not _pending.is_empty():
		_append_message("나", _pending)


func submit_message(text: String) -> void:
	var message := text.strip_edges()
	if not _pending.is_empty() or message.is_empty():
		return
	if JSON.stringify(message).to_utf8_buffer().size() > ChatSessions.MAX_MESSAGE_BYTES:
		_set_status("메시지가 너무 깁니다. 64 KiB 이내로 줄여 주세요.")
		return
	_pending = message
	_pending_id = sessions.active_id
	_drafts.erase(_pending_id)
	_input.clear()
	_render_transcript()
	_set_status("에이전트가 작업 중…")
	_update_input()
	submitted.emit(message, sessions.history(_pending_id))


func preview_proposal(summary: String) -> void:
	_proposal_text.text = summary
	_proposal_text.scroll_to_line(0)
	_proposal.show()
	_set_status("편집을 적용할지 선택하세요.")


func append_response_delta(delta: String) -> void:
	if _pending.is_empty() or delta.is_empty():
		return
	if not _streaming:
		_streaming = true
		_append_message("에이전트", "")
		_set_status("응답을 받는 중…")
	partial_response += delta
	_transcript.add_text(delta)


func _normalize_reply_text(message: String) -> String:
	var text := message
	if text.strip_edges().is_empty():
		text = partial_response if not partial_response.strip_edges().is_empty() else "(응답 완료)"
	var limit := ChatSessions.MAX_MESSAGE_BYTES - 16
	if text.to_utf8_buffer().size() > limit:
		var low := 0
		var high := text.length()
		while low < high:
			var mid := (low + high + 1) / 2
			if text.left(mid).to_utf8_buffer().size() <= limit:
				low = mid
			else:
				high = mid - 1
		text = text.left(low) + "…"
	return text


func _record_ephemeral_turn(session_id: String, prompt: String, reply: String) -> void:
	var existing: Array = _ephemeral_turns.get(session_id, [])
	existing.append({"role": "user", "content": prompt})
	existing.append({"role": "assistant", "content": reply})
	_ephemeral_turns[session_id] = existing


func add_reply(message: String) -> void:
	if _pending.is_empty():
		return
	var prompt := _pending
	var session_id := _pending_id
	var reply_text := _normalize_reply_text(message)
	var saved := sessions.append_turn(session_id, prompt, reply_text)
	if not saved:
		_record_ephemeral_turn(session_id, prompt, reply_text)
	var draft := _input.text
	_finish()
	_clear_attachments()
	_drafts[sessions.active_id] = draft
	_refresh_thread()
	if not saved:
		_set_status("응답을 받았으나 대화 기록에 저장하지 못했습니다.")


func preserve_reply_with_error(reply: String, error_message: String) -> void:
	if _pending.is_empty():
		return
	var prompt := _pending
	var session_id := _pending_id
	var reply_text := _normalize_reply_text(reply)
	var saved := sessions.append_turn(session_id, prompt, reply_text)
	if not saved:
		_record_ephemeral_turn(session_id, prompt, reply_text)
	var draft := _input.text
	_finish()
	_clear_attachments()
	_drafts[sessions.active_id] = draft
	_refresh_thread()
	if not error_message.is_empty():
		_set_status(error_message)


func fail_turn(message: String, discard_partial: bool = false) -> void:
	if _pending.is_empty():
		return
	if not discard_partial and not partial_response.strip_edges().is_empty():
		preserve_reply_with_error(partial_response, message)
		return
	if _input.text.is_empty():
		_input.text = _pending
		_input.set_caret_line(_input.get_line_count() - 1)
		_input.set_caret_column(_input.get_line(_input.get_caret_line()).length())
	_finish()
	_render_transcript()
	_set_status(message)


func _finish() -> void:
	_pending = ""
	_pending_id = ""
	_streaming = false
	partial_response = ""
	_proposal.hide()
	_status.hide()
	_update_input()


func _clear_attachments() -> void:
	context.clear_staged()
	attachments.clear_attachments()


func _set_status(message: String) -> void:
	_status.text = message
	_status.show()


func _update_input() -> void:
	var busy := not _pending.is_empty()
	_send.disabled = busy or _input.text.strip_edges().is_empty()
	_stop.visible = busy
	_new_thread.disabled = busy
	_thread_button.disabled = busy
	_mode.disabled = busy
	_model.disabled = busy
	context.set_busy(busy)
	attachments.set_busy(busy)


func _append_message(speaker: String, message: String) -> void:
	if _transcript.get_total_character_count() > 0:
		_transcript.newline()
		_transcript.newline()
	_transcript.push_bold()
	_transcript.add_text(speaker)
	_transcript.pop()
	_transcript.newline()
	_transcript.add_text(message)
