@tool
extends EditorPlugin


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning():
		await tree.process_frame
	var showcase := tree.get_first_node_in_group(&"playforge_showcase_player")
	showcase.call("_start_showcase")
	var panel: Control = showcase.get("_panel")
	for frame in 120:
		if panel.call("is_playing"):
			break
		await tree.process_frame
	var root := EditorInterface.get_edited_scene_root()
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-showcase.json"))
	for cue: Dictionary in manifest.cues:
		if cue.action != "import":
			continue
		panel.call("seek", float(cue.at))
		var import_done := false
		for frame in 1200:
			await tree.process_frame
			var receipt: Dictionary = showcase.call("import_diagnostics")
			if receipt.get("state") == "done":
				import_done = true
				break
			if receipt.get("state") == "error":
				_fail("Tappy asset import failed: " + str(receipt))
				return
		if not import_done:
			_fail("Timed out waiting for Tappy assets: " + str(showcase.call("import_diagnostics")))
			return
	if not showcase.call("replay_diagnostics").finished:
		if not panel.call("is_playing"):
			panel.call("_toggle_playback")
		panel.call("advance", 100.0)
		await tree.process_frame
	var finished: Dictionary = showcase.call("replay_diagnostics")
	if not finished.finished:
		_fail("Replay failed to finish at %.2f: %s" % [panel.get("current_time"), str(finished)])
		return
	var manager := EditorInterface.get_editor_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(root))
	var script: Script = root.get_script()
	var selection := EditorInterface.get_selection()
	for round_index in 3:
		var steps := 0
		while history.has_undo():
			var selected_id := 0
			var selected_path := NodePath()
			if root.get_child_count() > 0:
				var selected := root.get_child(0) if round_index == 0 else root.get_child(-1)
				if round_index == 2:
					selected = selected.get_child(-1) if selected.get_child_count() > 0 else root
				selected_id = selected.get_instance_id()
				selected_path = root.get_path_to(selected)
				selection.clear()
				selection.add_node(selected)
				EditorInterface.edit_node(selected)
				if steps % 2 == 0:
					EditorInterface.edit_script(script)
			await tree.process_frame
			history.undo()
			await tree.process_frame
			if selected_id != 0 and root.has_node(selected_path) and root.get_node(selected_path).get_instance_id() != selected_id:
				_fail("Undo replaced a node that still exists: " + str(selected_path))
				return
			steps += 1
		if steps < 2 or root.get_child_count() != 0 or root.get_script() != null:
			_fail("Undo must return to the blank scene: " + str(showcase.call("replay_diagnostics")))
			return
		while history.has_redo():
			history.redo()
			await tree.process_frame
		if showcase.call("replay_diagnostics") != finished or root.get_script() != script:
			_fail("Redo must restore the completed scene and script: " + str(showcase.call("replay_diagnostics")))
			return
		print("UNDO_REDO_ROUND_OK ", round_index + 1, " ", steps)
	print("TAPPY_UNDO_STRESS_OK")
	tree.quit()


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
