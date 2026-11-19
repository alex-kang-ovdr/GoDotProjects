@tool
extends EditorPlugin

var _panel: Control
var _input: TextEdit
var _transcript: RichTextLabel
var _status: Label
var _history: PopupPanel
var _search: LineEdit
var _results: ItemList


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var scene_tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning() or EditorInterface.get_edited_scene_root() == null:
		await scene_tree.process_frame
	var chat := scene_tree.get_first_node_in_group(&"playforge_agent_chat")
	var dock: EditorDock = chat.get("_dock")
	dock.make_visible()
	_panel = chat.get("_panel")
	_input = _panel.find_child("ChatInput", true, false)
	_transcript = _panel.find_child("ChatTranscript", true, false)
	_status = _panel.find_child("ChatStatus", true, false)
	_history = _panel.find_child("ChatHistoryPopup", true, false)
	_search = _history.find_child("ChatSearch", true, false)
	_results = _history.find_child("ChatConversationList", true, false)
	var source := EditorInterface.get_edited_scene_root()
	if not await _verify_threads() or not await _verify_stop_and_plan(source):
		return
	print("PLAYFORGE_AGENT_CHAT_WORKSPACE_OK")
	scene_tree.quit(0)


func _verify_threads() -> bool:
	_send("Original narrative")
	if not await _wait_for(func() -> bool: return _has_reply("First mock reply")):
		return _fail("The existing conversation must show its completed reply.")
	_input.text = "Draft in the first conversation"
	_press("ChatNewConversation")
	if not _input.text.is_empty() or _has_reply("First mock reply"):
		return _fail("A new conversation must open a separate empty transcript and composer.")
	_send("Alternative workspace")
	if not await _wait_for(func() -> bool: return _has_reply("Second mock reply")):
		return _fail("The new conversation must show its own reply.")
	_search_history("original narrative")
	if not _history.visible or _results.item_count != 1 or _results.get_item_text(0) != "Original narrative":
		return _fail("History must search the titles of saved conversations.")
	_results.item_activated.emit(0)
	if _history.visible or not _has_reply("First mock reply") or _has_reply("Second mock reply") or _input.text != "Draft in the first conversation":
		return _fail("Opening a search result must restore its transcript and in-memory draft.")
	_search_history("original narrative")
	_select_result(0)
	_action("이름 변경")
	var rename: ConfirmationDialog = _panel.get("_thread_title")
	var title: LineEdit = _panel.get("_title_input")
	if not rename.visible or not is_instance_valid(title):
		return _fail("Rename must open a confirmation dialog with the active thread title.")
	title.text = "Revised story"
	rename.confirmed.emit()
	rename.hide()
	_search_history("revised story")
	if _results.item_count != 1 or _results.get_item_text(0) != "Revised story":
		return _fail("Confirming a rename must update the conversation title and search result.")
	_select_result(0)
	_action("삭제")
	var deletion: ConfirmationDialog = _panel.get("_delete_thread")
	if not deletion.visible:
		return _fail("Deleting a conversation requires a confirmation.")
	deletion.confirmed.emit()
	deletion.hide()
	_search_history("revised story")
	if _results.item_count != 0 or not _has_reply("Second mock reply") or _has_reply("First mock reply"):
		return _fail("Deleting the selected conversation must remove its history and open another conversation.")
	_history.hide()
	return true


func _verify_stop_and_plan(source: Node) -> bool:
	var manager := get_undo_redo()
	var undo := manager.get_history_undo_redo(manager.get_object_history_id(source))
	var version := undo.get_version()
	_send("Cancel this turn")
	var stop: Button = _panel.find_child("ChatStop", true, false)
	if not stop.visible:
		return _fail("A pending request must expose Stop.")
	await get_tree().create_timer(0.35).timeout
	stop.pressed.emit()
	if stop.visible or _input.text != "Cancel this turn" or not _status.text.contains("중지") or _has_reply("Cancel this turn"):
		return _fail("Stopping must restore the pending prompt as a draft and remove it from the transcript.")
	var mode: OptionButton = _panel.find_child("ChatEditMode", true, false)
	var plan := -1
	for index in range(mode.item_count):
		if mode.get_item_text(index) == "계획만":
			plan = index
			break
	if plan < 0:
		return _fail("Conversation controls must offer a plan-only mode.")
	mode.select(plan)
	mode.item_selected.emit(plan)
	var direct := JSON.stringify({"method": "tools/call", "params": {"name": "pf_workspace_apply", "arguments": {"operations": [
		{"kind": "node.add", "objectId": "ForbiddenPlanNode", "type": "Label", "role": "gui"},
	]}}})
	_send(direct)
	if not _status.text.contains("MCP") or _input.text != direct or source.has_node("ForbiddenPlanNode") or undo.get_version() != version:
		return _fail("Plan mode must reject a direct MCP edit and preserve both the scene and the prompt.")
	_send("Plan a scene edit")
	if not await _wait_for(func() -> bool: return _status.visible and _status.text.contains("편집 도구")):
		return _fail("Plan mode must reject an edit tool returned by the bridge.")
	if source.has_node("ForbiddenPlanNode") or undo.get_version() != version:
		return _fail("A bridge edit tool must leave the scene and Undo history untouched in Plan mode.")
	return true


func _send(message: String) -> void:
	_input.text = message
	_press("ChatSend")


func _press(button_name: String) -> void:
	(_panel.find_child(button_name, true, false) as Button).pressed.emit()


func _search_history(query: String) -> void:
	_press("ChatHistory")
	_search.text = query
	_search.text_changed.emit(query)


func _select_result(index: int) -> void:
	_results.select(index)
	_results.item_selected.emit(index)


func _action(title: String) -> void:
	for button: Button in _history.find_children("*", "Button", true, false):
		if button.text == title:
			button.pressed.emit()
			return


func _has_reply(content: String) -> bool:
	return _transcript.get_parsed_text().contains(content)


func _wait_for(predicate: Callable) -> bool:
	var deadline := Time.get_ticks_msec() + 8000
	while not predicate.call():
		if Time.get_ticks_msec() >= deadline:
			return false
		await get_tree().process_frame
	return true


func _fail(reason: String) -> bool:
	push_error(reason)
	get_tree().quit(1)
	return false
