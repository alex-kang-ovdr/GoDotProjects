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
	if dock.context.stage_selection() != 1:
		_fail("Expected the selected status label to be attached explicitly.")
		return
	var manager := get_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(source))
	var version := history.get_version()
	dock.call("submit_message", "선택한 상태 문구를 준비 완료로 바꿔 줘.")
	var proposal := dock.find_child("ChatProposal", true, false) as Control
	var proposal_deadline := Time.get_ticks_msec() + 8000
	while not proposal.visible:
		if Time.get_ticks_msec() >= proposal_deadline:
			_fail("The edit proposal did not arrive for review.")
			return
		await tree.process_frame
	if status.text != "TAPPY CHICKEN" or history.get_version() != version:
		_fail("A proposed edit cannot run before user approval.")
		return
	(dock.find_child("ChatApprove", true, false) as Button).pressed.emit()
	if not await _wait_for_reply(dock, "선택한 문구를 바꿨어요.") or status.text != "준비 완료" or history.get_version() == version:
		_fail("The provider tool call did not update the selected scene label and its history.")
		return
	version = history.get_version()
	dock.call("submit_message", "지금 상태 문구를 설명해 줘.")
	if not await _wait_for_reply(dock, "현재 상태 문구는 준비 완료입니다.") or history.get_version() != version or status.text != "준비 완료":
		_fail("A plain assistant reply must appear without creating a scene edit.")
		return
	var feedback := dock.find_child("ChatStatus", true, false) as Label
	var invalid_responses := [
		["장면을 초기화해 줘.", "일반 텍스트로 반환해 씬 편집을 실행하지 못했습니다. Ollama 모델을 qwen3:4b(권장)"],
		["장면을 다시 초기화해 줘.", "일반 텍스트로 반환해 씬 편집을 실행하지 못했습니다. Ollama 모델을 qwen3:4b(권장)"],
		["비어 있는 편집을 요청합니다.", "편집 명령은 1~256개로 묶어 주세요."],
		["지원하지 않는 편집 작업을 요청합니다.", "지원하지 않는 작업: unknown.op"],
	]
	for invalid: Array in invalid_responses:
		dock.call("submit_message", invalid[0])
		if not await _wait_for_failure(dock, proposal, feedback, invalid[1]):
			_fail("Expected invalid edit feedback before approval: " + str(invalid[1]))
			return
		if status.text != "준비 완료" or history.get_version() != version or source.get_node_or_null("Hud/Status") != status:
			_fail("A rejected tool response cannot edit the scene or add Undo history.")
			return
	# Verify node.delete + Undo restoration
	dock.call("submit_message", "상태 문구 노드를 삭제해 줘.")
	proposal_deadline = Time.get_ticks_msec() + 8000
	while not proposal.visible:
		if Time.get_ticks_msec() >= proposal_deadline:
			_fail("The node.delete proposal did not arrive for review.")
			return
		await tree.process_frame
	(dock.find_child("ChatApprove", true, false) as Button).pressed.emit()
	if not await _wait_for_reply(dock, "상태 문구 노드를 삭제했어요.") or source.get_node_or_null("Hud/Status") != null:
		_fail("Approved node.delete must remove Hud/Status from the scene.")
		return
	history.undo()
	if source.get_node_or_null("Hud/Status") != status or status.text != "준비 완료":
		_fail("Undo after node.delete must restore Hud/Status cleanly.")
		return
	# Verify scene.clear (empty map reset) + Undo restoration
	var child_count_before := source.get_child_count()
	if child_count_before == 0:
		_fail("Expected children under scene root before scene.clear.")
		return
	dock.call("submit_message", "전부 지워서 빈 맵으로 초기화해 줘.")
	proposal_deadline = Time.get_ticks_msec() + 8000
	while not proposal.visible:
		if Time.get_ticks_msec() >= proposal_deadline:
			_fail("The scene.clear proposal did not arrive for review.")
			return
		await tree.process_frame
	(dock.find_child("ChatApprove", true, false) as Button).pressed.emit()
	if not await _wait_for_reply(dock, "빈 맵으로 초기화했어요.") or source.get_child_count() != 0:
		_fail("Approved scene.clear must remove all children under root to create an empty map.")
		return
	history.undo()
	if source.get_child_count() != child_count_before or source.get_node_or_null("Hud/Status") != status:
		_fail("Undo after scene.clear must restore all children under root.")
		return
	history.undo()
	var manifest: Dictionary = chat.call("recording_manifest")
	if status.text != "TAPPY CHICKEN" or manifest.get("cues", []).size() != 6 or manifest.cues.back().action != "revert":
		_fail("Undo must restore the original scene and be recorded as a replay step.")
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
	# Return to original scene to test prose preservation on failed tool validation, asset deletion, and TappyChicken build + Replay
	EditorInterface.open_scene_from_path("res://scenes/main.tscn")
	deadline = Time.get_ticks_msec() + 5000
	while EditorInterface.get_edited_scene_root() == null or EditorInterface.get_edited_scene_root().scene_file_path != "res://scenes/main.tscn":
		if Time.get_ticks_msec() >= deadline:
			_fail("Could not reopen original main.tscn.")
			return
		await tree.process_frame
	source = EditorInterface.get_edited_scene_root()
	# 1) Verify that when tool validation fails AFTER assistant prose arrives, the question & answer do NOT disappear!
	dock.call("submit_message", "실패하는 편집이지만 설명은 남아야 해.")
	if not await _wait_for_failure(dock, proposal, feedback, "지원하지 않는 작업: unknown.op"):
		_fail("Expected validation failure status for unknown.op with prose.")
		return
	if not await _wait_for_reply(dock, "이 설명은 편집 검증이 실패해도 대화창에서 사라지지 않고 유지되어야 합니다."):
		_fail("Assistant prose and user question must remain in the transcript even when tool validation fails.")
		return
	# 2) Verify asset.delete deletes res://Assets/egg.svg
	if not FileAccess.file_exists("res://Assets/egg.svg"):
		_fail("Expected res://Assets/egg.svg to exist before asset.delete.")
		return
	dock.call("submit_message", "알 에셋만 삭제해 줘.")
	proposal_deadline = Time.get_ticks_msec() + 8000
	while not proposal.visible:
		if Time.get_ticks_msec() >= proposal_deadline:
			_fail("The asset.delete proposal did not arrive for review.")
			return
		await tree.process_frame
	(dock.find_child("ChatApprove", true, false) as Button).pressed.emit()
	if not await _wait_for_reply(dock, "개별 에셋 파일을 삭제했어요.") or FileAccess.file_exists("res://Assets/egg.svg"):
		_fail("Approved asset.delete must delete res://Assets/egg.svg from the project.")
		return
	# 3) Verify full TappyChicken build + script.write + script.attach + pack.import + replay.play in one turn!
	dock.call("submit_message", "TappyChicken 만들고 Replay 로 처음부터 과정 시연")
	proposal_deadline = Time.get_ticks_msec() + 8000
	while not proposal.visible:
		if Time.get_ticks_msec() >= proposal_deadline:
			_fail("The TappyChicken build + replay.play proposal did not arrive for review.")
			return
		await tree.process_frame
	(dock.find_child("ChatApprove", true, false) as Button).pressed.emit()
	if not await _wait_for_reply(dock, "AgentReplay로 처음부터 제작 과정을 시연합니다."):
		_fail("Approved TappyChicken build + replay.play must complete and keep its reply in the transcript.")
		return
	if not FileAccess.file_exists("res://Scripts/TappyBuilt.gd") or not FileAccess.file_exists("res://Assets/chicken.svg"):
		_fail("TappyChicken build must write res://Scripts/TappyBuilt.gd and import pack assets.")
		return
	deadline = Time.get_ticks_msec() + 6000
	while EditorInterface.get_edited_scene_root() == null or not EditorInterface.get_edited_scene_root().scene_file_path.begins_with("res://.godot/playforge_agent_replays/"):
		if Time.get_ticks_msec() >= deadline:
			_fail("replay.play operation did not open the AgentReplay scene automatically.")
			return
		await tree.process_frame
	var built_manifest: Dictionary = chat.call("recording_manifest")
	var built_replay: Control = player.get("_panel")
	var built_scene := EditorInterface.get_edited_scene_root()
	built_replay.call("seek", float(built_manifest.duration))
	if built_scene.get_node_or_null("Bird") == null or built_scene.get_node_or_null("Hud/Score") == null or built_scene.get_script() == null:
		_fail("Replaying the TappyChicken build to completion must construct Bird, Hud/Score, and attach TappyBuilt.gd.")
		return
	# 4) Verify authored scene/script synthesis (for external / Chrome AI screen-control builds without recorded tool events)
	var custom_scene := PackedScene.new()
	var custom_root := Node2D.new()
	custom_root.name = "CustomGame"
	custom_root.set_script(ResourceLoader.load("res://Scripts/TappyBuilt.gd", "Script"))
	custom_scene.pack(custom_root)
	custom_root.free()
	ResourceSaver.save(custom_scene, "res://scenes/custom_ai_build.tscn")
	chat.set("_latest", {})
	var synth_manifest: Dictionary = chat.call("recording_manifest")
	if synth_manifest.get("playOnCompletion") != true or synth_manifest.get("cues", []).is_empty():
		_fail("Synthesized authored recording must produce a schemaVersion 4 manifest with playOnCompletion.")
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


func _wait_for_failure(dock: Control, proposal: Control, feedback: Label, expected: String) -> bool:
	var deadline := Time.get_ticks_msec() + 8000
	while not str(dock.get("_pending")).is_empty():
		if proposal.visible or Time.get_ticks_msec() >= deadline:
			return false
		await get_tree().process_frame
	return not proposal.visible and feedback.visible and feedback.text.contains(expected)


func _fail(reason: String) -> void:
	push_error(reason)
	get_tree().quit(1)
