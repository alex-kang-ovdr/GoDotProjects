@tool
extends EditorPlugin

const SHOWCASE := "res://addons/playforge_showcase/plugin.gd"


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning() or EditorInterface.get_edited_scene_root() == null:
		await tree.process_frame
	var source := EditorInterface.get_edited_scene_root()
	var chat := tree.get_first_node_in_group("playforge_agent_chat") as EditorPlugin
	var showcase := _find_showcase(tree.root)
	if chat == null or showcase == null:
		_fail("The production starter editor must load Agent Chat and Showcase together.")
		return
	var initial := Label.new()
	initial.name = "ExistingLabel"
	initial.text = "Before chat"
	initial.position = Vector2(14, 28)
	source.add_child(initial)
	initial.owner = source

	var first := [
		{"kind": "node.add", "objectId": "AgentLabel", "type": "Label", "role": "gui"},
		_change_text("AgentLabel", "First answer"),
		_change_text("ExistingLabel", "Edited by chat"),
	]
	if not _call_tool(chat, "first", first).get("ok", false) or not _scene_matches(source, "Edited by chat", "First answer"):
		_fail("The MCP batch did not update real owned nodes in the source scene.")
		return
	var invalid := [
		{"kind": "node.add", "objectId": "PartialWrite", "type": "Label", "role": "gui"},
		_change_text("../Outside", "Must not be written"),
	]
	if _call_tool(chat, "invalid", invalid).get("ok", false) or source.has_node("PartialWrite"):
		_fail("A rejected MCP batch must not partially modify the source scene.")
		return
	if not _call_tool(chat, "second", [_change_text("AgentLabel", "Second answer")]).get("ok", false):
		_fail("The second MCP edit was not accepted.")
		return
	var manager := chat.get_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(source))
	if not history.has_undo() or not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("MCP edits must be registered in the source scene's real Godot undo history.")
		return
	history.undo()
	if not _scene_matches(source, "Edited by chat", "First answer"):
		_fail("The first undo should revert only the second MCP edit.")
		return
	history.undo()
	if not _scene_matches(source, "Before chat"):
		_fail("Undoing the first batch must restore the user node and remove the agent node.")
		return
	history.redo()
	if not _scene_matches(source, "Edited by chat", "First answer"):
		_fail("Redo must restore the whole first batch on the source editor scene.")
		return
	history.redo()
	if not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("The full redo sequence must restore the complete last result.")
		return

	var manifest: Dictionary = chat.call("recording_manifest")
	var commands: Array = manifest.get("cues", []).filter(func(cue: Dictionary) -> bool:
		return cue.action in ["add", "set", "revert"]
	)
	var expected := ["add", "set", "set", "set", "revert", "revert", "revert", "revert", "add", "set", "set", "set"]
	if manifest.get("schemaVersion") != 4 or commands.map(func(cue: Dictionary) -> String: return cue.action) != expected:
		_fail("The recording must retain the actual accepted edits, Undo and Redo in order.")
		return
	var scratch := await _play_scratch(chat, showcase, source)
	var panel: Control = showcase.get("_panel")
	if scratch == null or scratch == source or panel == null:
		_fail("Playing the recording must open a separate Godot scene tab.")
		return
	panel.call("seek", 0.0)
	if not _scene_matches(scratch, "Before chat") or not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("The replay must begin with the original user state in its own scene, preserving current source edits.")
		return
	panel.call("seek", float(commands[3].at))
	if not _scene_matches(scratch, "Edited by chat", "Second answer"):
		_fail("The scratch scene did not apply the first two batches in chronological order.")
		return
	panel.call("seek", float(commands[7].at))
	if not _scene_matches(scratch, "Before chat"):
		_fail("The scratch scene must show the original state when the recording reaches Undo.")
		return
	panel.call("seek", float(manifest.duration))
	if not _scene_matches(scratch, "Edited by chat", "Second answer") or not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("The recorded redo must restore the expected scratch result without changing the source.")
		return
	panel.call("play_from_start")
	panel.call("seek", 0.0)
	if not _scene_matches(scratch, "Before chat") or not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("Restart must reproduce the same initial snapshot without modifying the source.")
		return
	if not await _verify_jsonl_import(chat, showcase, source):
		return
	print("PLAYFORGE_AGENT_CHAT_PROBE_OK ", commands.size(), " staged operations")
	tree.quit(0)


func _scene_matches(root: Node, original_text: String, agent_text := "") -> bool:
	var original := root.get_node_or_null("ExistingLabel") as Label
	var added := root.get_node_or_null("AgentLabel") as Label
	if original == null or original.text != original_text or original.position != Vector2(14, 28) or original.owner != root:
		return false
	if agent_text.is_empty():
		return added == null
	return added != null and added.text == agent_text and added.owner == root


func _change_text(path: String, value: String) -> Dictionary:
	return {"kind": "property.set", "objectId": path, "propertyId": "text", "value": value, "role": "gui"}


func _call_tool(chat: EditorPlugin, id: String, operations: Array) -> Dictionary:
	return chat.call("apply_call", _command(id, operations))


func _command(id: String, operations: Array) -> Dictionary:
	return {"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": {
		"name": "pf_workspace_apply", "arguments": {"operations": operations},
	}}


func _play_scratch(chat: EditorPlugin, showcase: EditorPlugin, source: Node) -> Node:
	chat.call("play_recording")
	for frame in range(180):
		var scene := EditorInterface.get_edited_scene_root()
		var panel: Control = showcase.get("_panel")
		if scene != null and scene != source and panel != null and panel.call("has_started"):
			return scene
		await get_tree().process_frame
	return null


func _verify_jsonl_import(chat: EditorPlugin, showcase: EditorPlugin, source: Node) -> bool:
	EditorInterface.open_scene_from_path(source.scene_file_path)
	for frame in range(180):
		if EditorInterface.get_edited_scene_root() == source:
			break
		await get_tree().process_frame
	if EditorInterface.get_edited_scene_root() != source:
		_fail("The authored source must remain available independently of the scratch replay.")
		return false
	var recording := "\n".join([
		JSON.stringify(_command("import-add", [{"kind": "node.add", "objectId": "ImportedLabel", "type": "Label", "role": "gui"}])),
		JSON.stringify(_command("import-set", [_change_text("ImportedLabel", "From recording")])),
	])
	var outcome: Dictionary = chat.call("import_recording", recording)
	if not outcome.get("ok", false) or source.has_node("ImportedLabel") or not _scene_matches(source, "Edited by chat", "Second answer"):
		_fail("Acknowledged MCP JSONL must import as a recording without modifying the authored scene.")
		return false
	var accepted_manifest: Dictionary = chat.call("recording_manifest")
	var invalid := recording + "\n" + JSON.stringify(_command("invalid-last", [_change_text("MissingNode", "Rejected")]))
	var rejected: Dictionary = chat.call("import_recording", invalid)
	if rejected.get("ok", false) or chat.call("recording_manifest") != accepted_manifest or source.has_node("ImportedLabel"):
		_fail("An invalid final operation must reject the whole JSONL without changing the prior recording or source.")
		return false
	var scratch := await _play_scratch(chat, showcase, source)
	var panel: Control = showcase.get("_panel")
	if scratch == null or panel == null:
		_fail("The imported recording could not open an isolated replay scene.")
		return false
	panel.call("seek", 0.0)
	if scratch.has_node("ImportedLabel") or not _scene_matches(scratch, "Edited by chat", "Second answer"):
		_fail("Imported replay must begin at the scene snapshot before the imported operations.")
		return false
	panel.call("seek", float(accepted_manifest.duration))
	var generated := scratch.get_node_or_null("ImportedLabel") as Label
	if generated == null or generated.text != "From recording" or generated.owner != scratch or source.has_node("ImportedLabel"):
		_fail("The imported replay did not apply its valid edits only to the isolated scene.")
		return false
	return true


func _find_showcase(node: Node) -> EditorPlugin:
	if node is EditorPlugin and node.get_script() != null and node.get_script().resource_path == SHOWCASE:
		return node
	for child in node.get_children(true):
		var found := _find_showcase(child)
		if found != null:
			return found
	return null


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
