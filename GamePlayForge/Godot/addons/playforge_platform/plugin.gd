@tool
extends EditorPlugin

const META_PATH := "res://.playforge-platform.json"
const MAX_FILES := 512
const MAX_PROJECT_BYTES := 8 * 1024 * 1024
const MAX_FILE_BYTES := 1024 * 1024
const POLL_SECONDS := 1.5
const IGNORED_DIRS := [".godot", ".git", "addons/playforge_platform"]
const TEXT_EXTENSIONS := ["gd", "tscn", "tres", "godot", "cfg", "json", "txt", "md", "shader", "gdshader", "svg"]

var _request: HTTPRequest
var _timer: Timer
var _status: Label
var _keep_local_button: Button
var _use_remote_button: Button
var _revision := 0
var _project_id := ""
var _origin := ""
var _base_files: Dictionary = {}
var _request_kind := ""
var _busy := false
var _conflicted_paths: Array[String] = []
var _conflict_remote_files: Dictionary = {}
var _scan_error := ""
var _client_id := ""
var _base_project_config := ""
var _injected_project_config := ""
var _ready_announced := false


func _enter_tree() -> void:
	var config := FileAccess.open(META_PATH, FileAccess.READ)
	if config == null:
		return
	var parsed = JSON.parse_string(config.get_as_text())
	if not parsed is Dictionary:
		return
	_project_id = str(parsed.get("id", ""))
	_revision = int(parsed.get("revision", 0))
	_base_project_config = str(parsed.get("baseProjectConfig", ""))
	_injected_project_config = str(parsed.get("editorProjectConfig", ""))
	if not _valid_project_id(_project_id):
		return
	if OS.has_feature("web"):
		_origin = str(JavaScriptBridge.eval("window.location.origin", true)).trim_suffix("/")
	else:
		_origin = "http://127.0.0.1:4173"
	_client_id = "godot-" + Crypto.new().generate_random_bytes(16).hex_encode()
	_build_dock()
	_request = HTTPRequest.new()
	_request.timeout = 15.0
	_request.max_redirects = 3
	add_child(_request)
	_request.request_completed.connect(_on_request_completed)
	_timer = Timer.new()
	_timer.wait_time = POLL_SECONDS
	add_child(_timer)
	_timer.timeout.connect(_poll_remote)
	_status.text = "Connecting · project %s" % _project_id
	_fetch_remote("initial")
	_timer.start()
	resource_saved.connect(_on_resource_saved)
	scene_saved.connect(_on_scene_saved)


func _exit_tree() -> void:
	if resource_saved.is_connected(_on_resource_saved):
		resource_saved.disconnect(_on_resource_saved)
	if scene_saved.is_connected(_on_scene_saved):
		scene_saved.disconnect(_on_scene_saved)
	if _timer != null:
		_timer.stop()
		_timer.queue_free()
	if _request != null:
		_request.cancel_request()
		_request.queue_free()
	if _status != null and is_instance_valid(_status):
		remove_control_from_bottom_panel(_status.get_parent())


func _build_dock() -> void:
	var dock := VBoxContainer.new()
	dock.name = "PlayForgePlatform"
	dock.custom_minimum_size = Vector2(260, 80)
	var title := Label.new()
	title.text = "PLAYFORGE · LIVE SYNC"
	title.add_theme_font_size_override("font_size", 15)
	dock.add_child(title)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.text = "Starting file synchronization…"
	dock.add_child(_status)
	var sync_button := Button.new()
	sync_button.text = "Sync now"
	sync_button.pressed.connect(_sync_now)
	dock.add_child(sync_button)
	_keep_local_button = Button.new()
	_keep_local_button.text = "Resolve: keep local files"
	_keep_local_button.visible = false
	_keep_local_button.pressed.connect(_resolve_keep_local)
	dock.add_child(_keep_local_button)
	_use_remote_button = Button.new()
	_use_remote_button.text = "Resolve: load remote files"
	_use_remote_button.visible = false
	_use_remote_button.pressed.connect(_resolve_use_remote)
	dock.add_child(_use_remote_button)
	add_control_to_bottom_panel(dock, "PlayForge")
	make_bottom_panel_item_visible(dock)


func _on_resource_saved(_resource: Resource) -> void:
	_sync_now()


func _on_scene_saved(_scene_path: String) -> void:
	_sync_now()


func _poll_remote() -> void:
	if _busy:
		return
	_fetch_remote("poll")


func _sync_now() -> void:
	if _busy:
		return
	var local := _collect_local_files()
	if not _scan_error.is_empty():
		_status.text = _scan_error
		return
	if local.is_empty():
		return
	var changed := _changed_paths(local, _base_files)
	if changed.is_empty():
		_status.text = "All project files synced · revision %d" % _revision
		return
	if not _conflicted_paths.is_empty():
		_status.text = "Conflict in %s · local files kept; compare before retrying." % ", ".join(_conflicted_paths.slice(0, 3))
		return
	var payload_files: Array[Dictionary] = []
	for file_path in local.keys():
		payload_files.append({"path": file_path, "content": local[file_path]})
	var body := JSON.stringify({"baseRevision": _revision, "files": payload_files, "clientId": _client_id})
	_start_request("save", "PUT", _project_url(), body)
	_status.text = "Saving %d changed file(s)…" % changed.size()


func _fetch_remote(kind: String) -> void:
	_start_request(kind, "GET", _project_url())


func _project_url() -> String:
	return _origin + "/api/platform/projects/" + _project_id.uri_encode()


func _start_request(kind: String, method: String, url: String, body := "") -> void:
	if _busy or _request == null:
		return
	_busy = true
	_request_kind = kind
	var headers := PackedStringArray()
	if not body.is_empty():
		headers.append("Content-Type: application/json")
	var method_id := HTTPClient.METHOD_GET if method == "GET" else HTTPClient.METHOD_PUT
	var error := _request.request(url, headers, method_id, body)
	if error != OK:
		_busy = false
		_request_kind = ""
		_status.text = "Could not start PlayForge request (error %d)." % error


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
	var kind := _request_kind
	_busy = false
	_request_kind = ""
	var response = JSON.parse_string(bytes.get_string_from_utf8()) if bytes.size() <= MAX_PROJECT_BYTES * 2 else null
	if result != HTTPRequest.RESULT_SUCCESS or not response is Dictionary:
		_status.text = "PlayForge connection failed; local files remain safe."
		return
	if response_code == 409 and kind == "save":
		var conflict_remote := _parse_remote(response)
		if conflict_remote.is_empty():
			_status.text = "Remote revision conflict; local files remain safe."
			return
		_apply_remote(conflict_remote, true)
		_status.text = "Remote changed during save · checking file conflicts…"
		return
	if response_code < 200 or response_code >= 300 or response.get("ok", false) != true:
		_status.text = "PlayForge request failed (HTTP %d): %s" % [response_code, str(response.get("error", "request failed"))]
		return
	var remote := _parse_remote(response)
	if remote.is_empty():
		_status.text = "PlayForge returned an invalid project snapshot."
		return
	if kind == "save":
		_apply_remote(remote, false)
		_conflicted_paths.clear()
		_update_marker()
		_status.text = "Saved project files · revision %d" % _revision
		if not _ready_announced:
			_announce_plugin_ready()
		return
	_apply_remote(remote, kind == "initial")


func _parse_remote(response: Dictionary) -> Dictionary:
	if not response.get("ok", false) and not response.get("error", "") == "revision_conflict":
		return {}
	var revision = response.get("revision", 0)
	var raw_files = response.get("files", [])
	if not (revision is int or revision is float) or not is_finite(revision) or floor(revision) != revision or revision < 1 or not raw_files is Array or raw_files.size() > MAX_FILES:
		return {}
	var files: Dictionary = {}
	var total := 0
	for entry in raw_files:
		if not entry is Dictionary or not entry.get("path", "") is String or not entry.get("content", "") is String:
			return {}
		var file_path := str(entry.path)
		if not _valid_file_path(file_path) or files.has(file_path):
			return {}
		if file_path.ends_with(".import") or file_path.ends_with(".remap"):
			continue
		var content := str(entry.content)
		var size := content.to_utf8_buffer().size()
		if size > MAX_FILE_BYTES:
			return {}
		total += size
		if total > MAX_PROJECT_BYTES:
			return {}
		files[file_path] = content
	return {"revision": int(revision), "files": files}


func _apply_remote(remote: Dictionary, initial: bool) -> void:
	var remote_files: Dictionary = remote.files
	var local := _collect_local_files()
	if not _scan_error.is_empty():
		_status.text = _scan_error + " · remote files were left untouched."
		return
	if initial and _base_files.is_empty():
		_base_files = remote_files.duplicate(true)
		_revision = remote.revision
		_conflicted_paths.clear()
		_update_marker()
		var initial_changes := _changed_paths(local, _base_files)
		_status.text = "Live sync · revision %d · all files current" % _revision if initial_changes.is_empty() else "Live sync · %d local change(s) pending" % initial_changes.size()
		if initial_changes.is_empty():
			_announce_plugin_ready()
		else:
			_sync_now()
		return
	var dirty_paths := _changed_paths(local, _base_files)
	var remote_paths := _changed_paths(remote_files, _base_files)
	var conflicts: Array[String] = []
	var to_write: Dictionary = {}
	var open_scenes := EditorInterface.get_open_scenes()
	var unsaved_scenes := EditorInterface.get_unsaved_scenes()
	var unsaved_scripts := EditorInterface.get_script_editor().get_unsaved_files()
	for file_path in remote_paths:
		var remote_content = remote_files.get(file_path, null)
		var local_content = local.get(file_path, null)
		var resource_path := "res://" + file_path
		var scene_is_unsaved := file_path.ends_with(".tscn") and unsaved_scenes.has(resource_path)
		var script_is_unsaved := file_path.ends_with(".gd") and _is_unsaved_script(resource_path, unsaved_scripts)
		if dirty_paths.has(file_path) or scene_is_unsaved or script_is_unsaved:
			if local_content != remote_content:
				conflicts.append(file_path)
			continue
		to_write[file_path] = remote_content
	_conflicted_paths = conflicts
	_conflict_remote_files = remote_files.duplicate(true) if not conflicts.is_empty() else {}
	_keep_local_button.visible = not conflicts.is_empty()
	_use_remote_button.visible = not conflicts.is_empty()
	var write_succeeded := true
	for file_path in to_write:
		if not _write_or_delete_file(file_path, to_write[file_path]):
			write_succeeded = false
	if not write_succeeded:
		EditorInterface.get_resource_filesystem().scan()
		return
	_base_files = remote_files.duplicate(true)
	_revision = remote.revision
	_conflicted_paths = conflicts
	_conflict_remote_files = remote_files.duplicate(true) if not conflicts.is_empty() else {}
	_keep_local_button.visible = not conflicts.is_empty()
	_use_remote_button.visible = not conflicts.is_empty()
	_update_marker()
	if not to_write.is_empty():
		EditorInterface.get_resource_filesystem().scan()
		var changed_script := false
		for file_path in to_write:
			if file_path.ends_with(".tscn") and open_scenes.has("res://" + file_path):
				EditorInterface.reload_scene_from_path("res://" + file_path)
			if file_path.ends_with(".gd"):
				changed_script = true
		if changed_script and unsaved_scripts.is_empty():
			EditorInterface.get_script_editor().reload_open_files()
	if not conflicts.is_empty():
		_status.text = "File conflict: %s · local edits kept; remote edits kept on server." % ", ".join(conflicts.slice(0, 3))
	elif dirty_paths.is_empty():
		_status.text = "Live sync · revision %d · all files current" % _revision
	else:
		_status.text = "Live sync · %d local change(s) pending" % dirty_paths.size()
		if not initial:
			_sync_now()
	if initial:
		_announce_plugin_ready()


func _resolve_keep_local() -> void:
	if _conflicted_paths.is_empty():
		return
	_conflicted_paths.clear()
	_conflict_remote_files.clear()
	_keep_local_button.visible = false
	_use_remote_button.visible = false
	_sync_now()


func _resolve_use_remote() -> void:
	if _conflicted_paths.is_empty():
		return
	var open_scenes := EditorInterface.get_open_scenes()
	var reload_scripts := false
	for file_path in _conflicted_paths:
		if not _write_or_delete_file(file_path, _conflict_remote_files.get(file_path, null)):
			return
		if file_path.ends_with(".tscn") and open_scenes.has("res://" + file_path):
			EditorInterface.reload_scene_from_path("res://" + file_path)
		if file_path.ends_with(".gd"):
			reload_scripts = true
	_conflicted_paths.clear()
	_conflict_remote_files.clear()
	_keep_local_button.visible = false
	_use_remote_button.visible = false
	EditorInterface.get_resource_filesystem().scan()
	if reload_scripts:
		EditorInterface.get_script_editor().reload_open_files()
	_status.text = "Loaded remote versions for resolved files · revision %d" % _revision


func _write_or_delete_file(file_path: String, content: Variant) -> bool:
	var absolute := ProjectSettings.globalize_path("res://" + file_path)
	if content == null:
		if FileAccess.file_exists("res://" + file_path):
			var delete_error := DirAccess.remove_absolute(absolute)
			if delete_error != OK:
				_status.text = "Could not delete %s (error %d); remote state was kept for retry." % [file_path, delete_error]
				return false
		return true
	var parent := absolute.get_base_dir()
	var directory_error := DirAccess.make_dir_recursive_absolute(parent)
	if directory_error != OK:
		_status.text = "Could not create the folder for %s (error %d); remote state was kept for retry." % [file_path, directory_error]
		return false
	var resource_path := "res://" + file_path
	var old_contents: Variant = null
	if FileAccess.file_exists(resource_path):
		var old_file := FileAccess.open(resource_path, FileAccess.READ)
		if old_file == null:
			_status.text = "Could not read existing %s before replacement; file was kept." % file_path
			return false
		old_contents = old_file.get_as_text()
		old_file.close()
	var file := FileAccess.open(resource_path, FileAccess.WRITE)
	if file == null:
		_status.text = "Could not update %s (local file kept)." % file_path
		return false
	var contents := str(content)
	if file_path == "project.godot":
		contents = _enable_platform_plugin(contents)
	file.store_string(contents)
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		var restore_error := OK
		if old_contents is String:
			var restore := FileAccess.open(resource_path, FileAccess.WRITE)
			if restore == null:
				restore_error = ERR_CANT_OPEN
			else:
				restore.store_string(old_contents)
				restore.flush()
				restore_error = restore.get_error()
				restore.close()
		else:
			restore_error = DirAccess.remove_absolute(absolute)
		_status.text = "Could not finish writing %s (error %d); %s." % [file_path, write_error, "previous contents restored" if restore_error == OK else "restore also failed (error %d)" % restore_error]
		return false
	return true


func _collect_local_files() -> Dictionary:
	var files: Dictionary = {}
	_scan_error = ""
	_collect_directory("res://", "", files)
	var total := 0
	for file_path in files:
		total += str(files[file_path]).to_utf8_buffer().size()
	if total > MAX_PROJECT_BYTES:
		_scan_error = "Project files exceed the 8 MB synchronization limit."
	return files


func _collect_directory(root: String, relative: String, files: Dictionary) -> void:
	var dir := DirAccess.open(root + relative)
	if dir == null:
		return
	dir.list_dir_begin()
	var item := dir.get_next()
	while not item.is_empty():
		if item.begins_with(".") or item in [".godot", ".playforge-platform.json"]:
			item = dir.get_next()
			continue
		var next_relative := relative + item
		if dir.current_is_dir():
			var nested := next_relative + "/"
			if not _is_ignored_directory(nested):
				_collect_directory(root, nested, files)
		else:
			var ext := item.get_extension().to_lower()
			var file_path := next_relative
			if ext in TEXT_EXTENSIONS:
				var file := FileAccess.open(root + file_path, FileAccess.READ)
				if file != null:
					var content := file.get_as_text()
					if file_path == "project.godot":
						content = _normalize_project_config(content)
					if content.to_utf8_buffer().size() <= MAX_FILE_BYTES:
						files[file_path] = content
					else:
						_scan_error = "File %s exceeds the 1 MB synchronization limit." % file_path
		item = dir.get_next()
	dir.list_dir_end()


func _is_ignored_directory(relative: String) -> bool:
	for ignored in IGNORED_DIRS:
		if relative.trim_suffix("/") == ignored or relative.begins_with(ignored + "/"):
			return true
	return false


func _changed_paths(current: Dictionary, baseline: Dictionary) -> Array[String]:
	var changed: Array[String] = []
	var paths := {}
	for file_path in current:
		paths[file_path] = true
	for file_path in baseline:
		paths[file_path] = true
	for file_path in paths:
		if current.get(file_path, null) != baseline.get(file_path, null):
			changed.append(file_path)
	return changed


func _valid_project_id(value: String) -> bool:
	if value.is_empty() or value.length() > 100:
		return false
	for character in value:
		if not "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".contains(character):
			return false
	return true


func _is_unsaved_script(resource_path: String, unsaved_files: PackedStringArray) -> bool:
	var absolute_path := ProjectSettings.globalize_path(resource_path).simplify_path()
	for unsaved_path in unsaved_files:
		if unsaved_path == resource_path or unsaved_path.simplify_path() == absolute_path:
			return true
	return false


func _valid_file_path(value: String) -> bool:
	if value.is_empty() or value.begins_with("/") or value.contains("\\") or value.contains(":") or value.contains("\n") or value.contains("\r"):
		return false
	if value.begins_with("addons/playforge_platform/") or value == ".playforge-platform.json":
		return false
	for part in value.split("/"):
		if part.is_empty() or part == "." or part == "..":
			return false
	return true


func _normalize_project_config(source: String) -> String:
	if not _injected_project_config.is_empty():
		var local_canonical := _trim_final_newlines(source)
		var injected_canonical := _trim_final_newlines(_injected_project_config)
		if local_canonical == injected_canonical:
			return _base_project_config
	var plugin_path := "res://addons/playforge_platform/plugin.cfg"
	var normalized := source.replace(', "' + plugin_path + '"', "")
	normalized = normalized.replace('"' + plugin_path + '", ', "")
	normalized = normalized.replace('"' + plugin_path + '"', "")
	var empty_assignment := RegEx.new()
	empty_assignment.compile("(?m)^enabled=PackedStringArray\\(\\s*\\)\\s*\\n?")
	normalized = empty_assignment.sub(normalized, "", true)
	var empty_section := RegEx.new()
	empty_section.compile("(?ms)^\\[editor_plugins\\]\\s*(?=\\[|$)")
	normalized = empty_section.sub(normalized, "", true)
	return normalized


func _trim_final_newlines(value: String) -> String:
	var result := value
	while result.ends_with("\n") or result.ends_with("\r"):
		result = result.left(result.length() - 1)
	return result


func _enable_platform_plugin(source: String) -> String:
	var plugin_path := "res://addons/playforge_platform/plugin.cfg"
	if source.contains('"' + plugin_path + '"'):
		return source
	var enabled_regex := RegEx.new()
	enabled_regex.compile("(?m)^enabled\\s*=\\s*PackedStringArray\\(([^)]*)\\)\\s*$")
	var existing := enabled_regex.search(source)
	if existing != null:
		var values := existing.get_string(1).strip_edges()
		var assignment := "enabled=PackedStringArray(%s%s\"%s\")" % [values, ", " if not values.is_empty() else "", plugin_path]
		return source.replace(existing.get_string(), assignment)
	var section := source.find("[editor_plugins]")
	if section >= 0:
		var newline := source.find("\n", section)
		if newline >= 0:
			return source.insert(newline + 1, "enabled=PackedStringArray(\"%s\")\n" % plugin_path)
	return source + "\n[editor_plugins]\nenabled=PackedStringArray(\"%s\")\n" % plugin_path


func _update_marker() -> void:
	var file := FileAccess.open(META_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({"id": _project_id, "revision": _revision,
			"baseProjectConfig": _base_project_config, "editorProjectConfig": _injected_project_config}))
		file.close()


func _announce_plugin_ready() -> void:
	if _ready_announced or not OS.has_feature("web"):
		return
	_ready_announced = true
	var message := JSON.stringify({"source": "playforge-godot-editor", "type": "pluginready", "projectId": _project_id, "revision": _revision})
	var javascript := "if (window.parent !== window && window.parent.location.origin === window.location.origin) window.parent.postMessage(JSON.parse(%s), window.location.origin);" % JSON.stringify(message)
	JavaScriptBridge.eval(javascript, true)
