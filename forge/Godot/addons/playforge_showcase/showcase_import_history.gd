@tool
extends RefCounted

signal restored(result: Dictionary)

var _refresh_pending := false


func record(scene: Node, created: PackedStringArray, pack_files: PackedStringArray, created_directory: bool) -> void:
	if created.is_empty():
		return
	var entries: Array[Dictionary] = []
	for file in created:
		var path := "res://" + file
		entries.append({
			"path": path, "source": FileAccess.get_file_as_bytes(path),
			"settings": FileAccess.get_file_as_bytes(path + ".import"),
			"owned": true, "removed": false,
		})
	var manager := EditorInterface.get_editor_undo_redo()
	manager.create_action("스토어 에셋 %d개 가져오기" % entries.size(), UndoRedo.MERGE_DISABLE, scene, false, false)
	manager.add_undo_method(self, &"_restore", entries, pack_files, created_directory, false)
	manager.add_do_method(self, &"_restore", entries, pack_files, created_directory, true)
	manager.commit_action(false)


func _restore(entries: Array[Dictionary], pack_files: PackedStringArray, created_directory: bool, redo: bool) -> void:
	var count := 0
	var preserved := PackedStringArray()
	for entry in entries:
		if not entry.owned:
			preserved.append(str(entry.path).get_file())
			continue
		if redo != bool(entry.removed):
			continue
		if not (_restore_file(entry) if redo else _remove_file(entry)):
			# Relinquish this path if its owner changed or it could not be safely updated.
			entry.owned = false
			preserved.append(str(entry.path).get_file())
			continue
		entry.removed = not redo
		count += 1
	if not redo and created_directory and DirAccess.dir_exists_absolute("res://Assets"):
		var dir := DirAccess.open("res://Assets")
		if dir != null and dir.get_files().is_empty() and dir.get_directories().is_empty():
			DirAccess.remove_absolute("res://Assets")
	if count > 0 and not _refresh_pending:
		_refresh_pending = true
		_refresh_filesystem.call_deferred()
	var message := ("다시 가져온 파일 %d개" if redo else "가져오기를 취소한 파일 %d개") % count
	if not preserved.is_empty():
		message += " · 현재 상태 보존: " + ", ".join(preserved)
	restored.emit({"state": "redone" if redo else "undone", "count": count, "first": 0,
		"files": pack_files, "preserved": preserved, "message": message})


func _remove_file(entry: Dictionary) -> bool:
	var path: String = entry.path
	var sidecar := path + ".import"
	if not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path) != entry.source:
		return false
	if not FileAccess.file_exists(sidecar) or FileAccess.get_file_as_bytes(sidecar) != entry.settings:
		return false
	if DirAccess.remove_absolute(sidecar) != OK:
		return false
	if DirAccess.remove_absolute(path) != OK:
		_write_new(sidecar, entry.settings)
		return false
	return true


func _restore_file(entry: Dictionary) -> bool:
	var path: String = entry.path
	var sidecar := path + ".import"
	if FileAccess.file_exists(path) or FileAccess.file_exists(sidecar):
		return false
	if DirAccess.make_dir_recursive_absolute(path.get_base_dir()) != OK or not _write_new(sidecar, entry.settings):
		return false
	if not _write_new(path, entry.source):
		DirAccess.remove_absolute(sidecar)
		return false
	return true


func _write_new(path: String, bytes: PackedByteArray) -> bool:
	if FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.WRITE)
	return file != null and file.store_buffer(bytes)


func _refresh_filesystem() -> void:
	var fs := EditorInterface.get_resource_filesystem()
	var tree := EditorInterface.get_base_control().get_tree()
	while fs.is_scanning() or fs.is_importing():
		await tree.process_frame
	_refresh_pending = false
	fs.scan()
