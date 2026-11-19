@tool
extends EditorPlugin


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	while EditorInterface.get_resource_filesystem().is_scanning():
		await get_tree().process_frame
	var showcase := get_tree().get_first_node_in_group(&"playforge_showcase_player")
	var root := EditorInterface.get_edited_scene_root()
	if showcase == null or root == null or root.get_child_count() != 0 or DirAccess.dir_exists_absolute("res://Assets"):
		_fail("The manual store test requires an empty, ordinary 3D project.")
		return
	showcase.call("open_asset_store")
	await get_tree().process_frame
	var state: Dictionary = showcase.call("store_diagnostics")
	if not state.get("visible") or not state.get("manual") or state.get("selectedPack") != "tappy-flight":
		_fail("The editor menu did not open the local Tappy product. " + str(state))
		return
	var store := EditorInterface.get_base_control().find_child("PlayForgeAssetStore", true, false)
	var button := store.find_child("ImportPack", true, false) as Button
	if button == null or not button.is_visible_in_tree() or button.disabled:
		_fail("The selected product requires a visible, usable import button.")
		return
	var files: PackedStringArray = PackedStringArray(state.files)
	var manager := EditorInterface.get_editor_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(root))
	var history_version := 0
	var user_edit := ""
	var unrelated := "res://Assets/artist-note.txt"
	for pass_index in range(2):
		button.pressed.emit()
		var end := Time.get_ticks_msec() + 15000
		var first_count := files.size() if pass_index == 0 else 0
		while Time.get_ticks_msec() < end:
			await get_tree().process_frame
			state = showcase.call("store_diagnostics")
			if state.receipt.get("state") == "error" or (state.receipt.get("state") == "done" and state.receipt.get("first") == first_count):
				break
		if state.receipt.get("state") != "done" or state.receipt.get("first") != first_count or state.receipt.get("count") != files.size():
			_fail("Clicking Import must report newly created and reimported assets. " + str(state))
			return
		for file in files:
			var destination := "res://" + file
			if not ResourceLoader.exists(destination, "Texture2D") or not FileAccess.file_exists(destination + ".import"):
				_fail("The manual store did not produce an imported texture: " + file)
				return
			if pass_index == 0 and FileAccess.get_sha256(destination) != FileAccess.get_sha256("res://.playforge-store/" + file):
				_fail("The new texture differs from its store product: " + file)
				return
		if pass_index == 0:
			await get_tree().process_frame
			var settings_hashes := {}
			for name in files:
				settings_hashes[name] = FileAccess.get_sha256("res://" + name + ".import")
			var note := FileAccess.open(unrelated, FileAccess.WRITE)
			note.store_string("Keep my file")
			note.close()
			if not history.has_undo() or not history.undo() or not await _wait_for_files(files, []):
				_fail("Undo must remove the three newly imported textures.")
				return
			if not history.redo() or not await _wait_for_files(files, files):
				_fail("Redo must restore all three original textures and their Godot import metadata.")
				return
			for name in files:
				if FileAccess.get_sha256("res://" + name) != FileAccess.get_sha256("res://.playforge-store/" + name) or FileAccess.get_sha256("res://" + name + ".import") != settings_hashes[name]:
					_fail("Redo must restore the exact stored source and its import settings: " + name)
					return
			history_version = history.get_version()
			var file := "res://" + files[0]
			user_edit = FileAccess.get_file_as_string(file) + "\n<!-- editor user customization -->"
			var writer := FileAccess.open(file, FileAccess.WRITE)
			writer.store_string(user_edit)
			writer.close()
	if FileAccess.get_file_as_string("res://" + files[0]) != user_edit or root.get_child_count() != 0:
		_fail("Reimport must preserve customized textures and the empty scene.")
		return
	await get_tree().process_frame
	if history.get_version() != history_version:
		_fail("Reimporting existing files must not add another destructive undo entry.")
		return
	var settings_path := "res://" + files[1] + ".import"
	var settings := ConfigFile.new()
	if settings.load(settings_path) != OK:
		_fail("Could not inspect the imported texture settings.")
		return
	settings.set_value("params", "svg/scale", 2.0)
	settings.save(settings_path)
	if not history.undo() or not await _wait_for_files(files, [files[0], files[1]]) or FileAccess.get_file_as_string("res://" + files[0]) != user_edit:
		_fail("Undo must preserve a modified texture source and a changed import setting.")
		return
	var undone: Dictionary = showcase.call("store_diagnostics").receipt
	if undone.get("state") != "undone" or undone.get("count") != 1 or not files[0].get_file() in undone.preserved or not files[1].get_file() in undone.preserved:
		_fail("The undo receipt must name both files preserved on disk. " + str(undone))
		return
	if not history.redo() or not await _wait_for_files(files, files) or FileAccess.get_file_as_string("res://" + files[0]) != user_edit or FileAccess.get_file_as_string(unrelated) != "Keep my file":
		_fail("Redo must preserve user modifications and unrelated assets.")
		return
	var redone: Dictionary = showcase.call("store_diagnostics").receipt
	if redone.get("state") != "redone" or redone.get("count") != 1 or settings.load(settings_path) != OK or settings.get_value("params", "svg/scale", 0) != 2.0:
		_fail("The redo receipt and preserved import settings must match the live files. " + str(redone))
		return
	print("PLAYFORGE_MANUAL_STORE_OK ", JSON.stringify({"reimport": state.receipt, "undo": undone, "redo": redone}))
	get_tree().quit(0)


func _wait_for_files(files: PackedStringArray, present: PackedStringArray) -> bool:
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
		var valid := true
		for file in files:
			var path := "res://" + file
			if file in present:
				valid = valid and FileAccess.file_exists(path) and FileAccess.file_exists(path + ".import") and ResourceLoader.exists(path, "Texture2D")
			else:
				valid = valid and not FileAccess.file_exists(path) and not FileAccess.file_exists(path + ".import")
		if valid:
			return true
	return false


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
