@tool
extends EditorPlugin


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning() or EditorInterface.get_edited_scene_root() == null:
		await tree.process_frame
	var source := EditorInterface.get_edited_scene_root()
	var status := source.get_node("Hud/Status") as Label
	var chat := tree.get_first_node_in_group(&"playforge_agent_chat")
	var player := tree.get_first_node_in_group(&"playforge_showcase_player")
	var dock: VBoxContainer = chat.get("_panel")
	if not dock.is_class("PlayForgeAgentChatDock") or status.text != "TAPPY CHICKEN":
		_fail("Expected native Windows chat dock and the original Tappy Chicken status label.")
		return
	var selection := EditorInterface.get_selection()
	selection.clear()
	selection.add_node(status)
	var manager := get_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(source))
	var version := history.get_version()
	dock.call("submit_message", "선택한 상태 문구를 준비 완료로 바꿔 줘.")
	if not await _wait_for_reply(dock, "선택한 문구를 바꿨어요.") or status.text != "준비 완료" or history.get_version() == version:
		_fail("The provider tool call did not update the selected scene label and its history.")
		return
	version = history.get_version()
	dock.call("submit_message", "지금 상태 문구를 설명해 줘.")
	if not await _wait_for_reply(dock, "현재 상태 문구는 준비 완료입니다.") or history.get_version() != version or status.text != "준비 완료":
		_fail("A plain assistant reply must appear without creating a scene edit.")
		return
	history.undo()
	var manifest: Dictionary = chat.call("recording_manifest")
	if status.text != "TAPPY CHICKEN" or manifest.get("cues", []).size() != 2 or manifest.cues[1].action != "revert":
		_fail("Undo must restore the selection and be recorded as a replay step.")
		return
	var replay_button := dock.find_child("RequestReplay", true, false) as Button
	replay_button.pressed.emit()
	var deadline := Time.get_ticks_msec() + 5000
	while EditorInterface.get_edited_scene_root() == source or player.get("_panel") == null:
		if Time.get_ticks_msec() >= deadline:
			_fail("The replay button did not open the recorded session.")
			return
		await tree.process_frame
	var scratch := EditorInterface.get_edited_scene_root()
	var replay: Control = player.get("_panel")
	var recorded := scratch.get_node("Hud/Status") as Label
	replay.call("seek", float(manifest.cues[0].at))
	if recorded.text != "준비 완료" or status.text != "TAPPY CHICKEN":
		_fail("Replay must apply the provider edit in a separate scene.")
		return
	replay.call("seek", float(manifest.duration))
	if recorded.text != "TAPPY CHICKEN":
		_fail("Replay must restore the original label when it reaches Undo.")
		return
	print("PLAYFORGE_AGENT_CONVERSATION_OK")
	tree.quit(0)


func _wait_for_reply(dock: Control, expected: String) -> bool:
	var transcript := dock.find_child("ChatTranscript", true, false) as RichTextLabel
	var deadline := Time.get_ticks_msec() + 8000
	while not transcript.get_parsed_text().contains(expected):
		if Time.get_ticks_msec() >= deadline:
			return false
		await get_tree().process_frame
	return true


func _fail(reason: String) -> void:
	push_error(reason)
	get_tree().quit(1)
