@tool
extends EditorPlugin

const PLUGIN_NAME := "PlayForge"
const CONFIG_PATH := "res://service.json"
const MAX_SOURCE_BYTES := 256000
const MAX_RESPONSE_BYTES := 4 * 1024 * 1024
const SAFE_ORIGIN_CHARS := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:[]"
const SAFE_BUILD_ID_CHARS := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"

var _dock: VBoxContainer
var _http: HTTPRequest
var _poll_timer: Timer
var _confirm_overwrite: ConfirmationDialog
var _status: Label
var _path_label: Label
var _revision_label: Label
var _load_button: Button
var _upload_button: Button
var _build_button: Button
var _preview_button: Button
var _download_button: Button

var _service: Dictionary = {}
var _origin := ""
var _source_path := ""
var _revision := 0
var _request_kind := ""
var _busy := false
var _pending_source := ""
var _pending_local_source := ""
var _pending_revision := 0
var _build_id := ""
var _preview_path := ""
var _download_path := ""
var _poll_failures := 0


func _enter_tree() -> void:
	_build_dock()
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	_http.max_redirects = 3
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)
	_poll_timer = Timer.new()
	_poll_timer.wait_time = 1.0
	_poll_timer.one_shot = true
	add_child(_poll_timer)
	_poll_timer.timeout.connect(_poll_build)
	_confirm_overwrite = ConfirmationDialog.new()
	_confirm_overwrite.title = "Load PlayForge Source"
	_confirm_overwrite.confirmed.connect(_confirm_cloud_overwrite)
	add_child(_confirm_overwrite)
	_load_service_config()


func _exit_tree() -> void:
	if _poll_timer != null:
		_poll_timer.stop()
	if _http != null:
		_http.cancel_request()
		_http.request_completed.disconnect(_on_request_completed)
		_http.queue_free()
		_http = null
	if _poll_timer != null:
		_poll_timer.queue_free()
		_poll_timer = null
	if _confirm_overwrite != null:
		_confirm_overwrite.queue_free()
		_confirm_overwrite = null
	if _dock != null:
		remove_control_from_docks(_dock)
		_dock.queue_free()
		_dock = null


func _build_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "PlayForgeDock"
	_dock.custom_minimum_size = Vector2(280, 250)
	var title := Label.new()
	title.text = "PLAYFORGE"
	title.add_theme_font_size_override("font_size", 18)
	_dock.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Godot Web Editor · project service"
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(subtitle)
	_path_label = Label.new()
	_path_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(_path_label)
	_revision_label = Label.new()
	_dock.add_child(_revision_label)
	_load_button = Button.new()
	_load_button.text = "Load from PlayForge"
	_load_button.pressed.connect(_load_from_service)
	_dock.add_child(_load_button)
	_upload_button = Button.new()
	_upload_button.text = "Upload saved script"
	_upload_button.pressed.connect(_upload_saved_script)
	_dock.add_child(_upload_button)
	var save_hint := Label.new()
	save_hint.text = "Save the current script with Ctrl+S, then upload it here."
	save_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(save_hint)
	_build_button = Button.new()
	_build_button.text = "Build web preview"
	_build_button.pressed.connect(_start_web_build)
	_dock.add_child(_build_button)
	_preview_button = Button.new()
	_preview_button.text = "Open preview in browser"
	_preview_button.disabled = true
	_preview_button.pressed.connect(_open_preview)
	_dock.add_child(_preview_button)
	_download_button = Button.new()
	_download_button.text = "Download web build"
	_download_button.disabled = true
	_download_button.pressed.connect(_open_download)
	_dock.add_child(_download_button)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.text = "Reading PlayForge service configuration…"
	_dock.add_child(_status)
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)


func _load_service_config() -> void:
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		_source_path = ""
		_origin = ""
		_path_label.text = "Source: not configured"
		_revision_label.text = "Revision: —"
		_status.text = "Add service.json from the PlayForge project ZIP to connect this project."
		_set_buttons_enabled(false)
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		_set_configuration_error("service.json must contain a JSON object.")
		return
	_service = parsed
	_source_path = str(_service.get("source_path", ""))
	_revision = int(_service.get("revision", 0))
	if not _valid_source_path(_source_path):
		_set_configuration_error("service.json needs a project-relative res:// source_path.")
		return
	_origin = _resolve_origin()
	if not _valid_origin(_origin):
		_set_configuration_error("The PlayForge service origin is missing or invalid.")
		return
	_path_label.text = "Source: " + _source_path
	_revision_label.text = "Cloud revision: %d" % _revision if _revision > 0 else "Cloud revision: unknown"
	_status.text = "Connected to %s" % _origin
	_set_buttons_enabled(true)
	print("PLAYFORGE_EDITOR_READY revision=%d origin=%s" % [_revision, _origin])


func _resolve_origin() -> String:
	if OS.has_feature("web"):
		var current_origin := str(JavaScriptBridge.eval("window.location.origin", true)).trim_suffix("/")
		# A standalone upstream editor may open this ZIP, but must not receive
		# project uploads intended for the configured PlayForge service.
		return current_origin if current_origin == str(_service.get("origin", "")).trim_suffix("/") else ""
	return str(_service.get("origin", "")).trim_suffix("/")


func _valid_origin(value: String) -> bool:
	if not value.begins_with("http://") and not value.begins_with("https://"):
		return false
	var authority := value.trim_prefix("http://").trim_prefix("https://")
	if authority.is_empty():
		return false
	for character in authority:
		if not SAFE_ORIGIN_CHARS.contains(character):
			return false
	return not authority.begins_with(".") and not authority.ends_with(".")


func _valid_source_path(value: String) -> bool:
	return value.begins_with("res://") and not value.contains("\\") and not value.split("/").has("..") and value.length() > 6


static func parse_revision(value: Variant) -> int:
	if not (value is int or value is float) or not is_finite(value) or value < 1 or floor(value) != value:
		return 0
	return int(value)


func _set_configuration_error(message: String) -> void:
	_source_path = ""
	_origin = ""
	_path_label.text = "Source: not configured"
	_revision_label.text = "Revision: —"
	_status.text = message
	_set_buttons_enabled(false)


func _set_buttons_enabled(enabled: bool) -> void:
	if _load_button == null:
		return
	_load_button.disabled = not enabled or _busy
	_upload_button.disabled = not enabled or _busy
	_build_button.disabled = not enabled or _busy or _revision <= 0
	_preview_button.disabled = not enabled or _busy or _preview_path.is_empty()
	_download_button.disabled = not enabled or _busy or _download_path.is_empty()


func _load_from_service() -> void:
	if _begin_request("load", "/api/project", HTTPClient.METHOD_GET):
		_status.text = "Loading the latest PlayForge source…"


func _upload_saved_script() -> void:
	if _source_path.is_empty() or _revision <= 0:
		_status.text = "Load the latest PlayForge revision before uploading."
		return
	if _target_script_has_unsaved_changes():
		_status.text = "Save the current script with Ctrl+S before uploading."
		return
	var file := FileAccess.open(_source_path, FileAccess.READ)
	if file == null:
		_status.text = "The configured source file could not be opened."
		return
	var source := file.get_as_text()
	if source.to_utf8_buffer().size() > MAX_SOURCE_BYTES:
		_status.text = "The saved script is larger than 256 KB."
		return
	var client_id := "editor-" + Crypto.new().generate_random_bytes(16).hex_encode()
	var payload := {"source": source, "baseRevision": _revision, "clientId": client_id}
	if _begin_request("upload", "/api/editor/source", HTTPClient.METHOD_PUT, payload):
		_status.text = "Uploading the saved script…"


func _start_web_build() -> void:
	if _revision <= 0:
		_status.text = "Load or upload the latest source before building."
		return
	var payload := {"target": "web", "revision": _revision}
	if _begin_request("build_start", "/api/builds", HTTPClient.METHOD_POST, payload):
		_status.text = "Queuing web build for revision %d…" % _revision


func _begin_request(kind: String, path: String, method: int, payload: Dictionary = {}) -> bool:
	if _busy or _http == null or _origin.is_empty():
		return false
	var request_data := ""
	var headers := PackedStringArray()
	if method != HTTPClient.METHOD_GET:
		headers.append("Content-Type: application/json")
		request_data = JSON.stringify(payload)
	_request_kind = kind
	_busy = true
	_poll_timer.stop()
	_set_buttons_enabled(false)
	var error := _http.request(_origin + path, headers, method, request_data)
	if error != OK:
		_busy = false
		_request_kind = ""
		_status.text = "Could not start the request (error %d)." % error
		_set_buttons_enabled(true)
		return false
	return true


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := _request_kind
	_request_kind = ""
	_busy = false
	var response = null
	if result == HTTPRequest.RESULT_SUCCESS and body.size() <= MAX_RESPONSE_BYTES:
		response = JSON.parse_string(body.get_string_from_utf8())
	if result != HTTPRequest.RESULT_SUCCESS or body.size() > MAX_RESPONSE_BYTES or not response is Dictionary:
		_status.text = "PlayForge request failed (HTTP %d, transport %d). Local source was not changed." % [response_code, result]
		_set_buttons_enabled(true)
		return
	if kind == "upload" and response_code == 409 and response.get("error", "") == "revision_conflict":
		var latest: Dictionary = response.get("document", {})
		var latest_revision := int(latest.get("revision", 0))
		_status.text = "Cloud revision conflict (latest is %d). Local source was kept; load and compare before retrying." % latest_revision
		_set_buttons_enabled(true)
		return
	if response_code < 200 or response_code >= 300 or not response.get("ok", true):
		_status.text = "PlayForge returned HTTP %d: %s" % [response_code, str(response.get("error", "request failed"))]
		_set_buttons_enabled(true)
		return
	match kind:
		"load":
			_handle_cloud_load(response)
		"upload":
			_handle_upload_success(response)
		"build_start":
			_handle_build_start(response)
		"build_poll":
			_handle_build_poll(response)
		_:
			_status.text = "PlayForge returned an unexpected response."
	_set_buttons_enabled(true)


func _handle_cloud_load(response: Dictionary) -> void:
	var source = response.get("source")
	var new_revision := parse_revision(response.get("revision"))
	if not source is String or source.to_utf8_buffer().size() > MAX_SOURCE_BYTES \
	or new_revision <= 0:
		_status.text = "The project response did not include a valid source and revision."
		return
	var file := FileAccess.open(_source_path, FileAccess.READ)
	if file == null:
		_status.text = "The configured source file is missing. Local files were not changed."
		return
	var local_source := file.get_as_text()
	_pending_source = source
	_pending_local_source = local_source
	_pending_revision = new_revision
	if local_source == source:
		_revision = new_revision
		_revision_label.text = "Cloud revision: %d" % _revision
		_status.text = "Local source already matches PlayForge revision %d." % _revision
		return
	if _target_script_has_unsaved_changes():
		_status.text = "Save the open script with Ctrl+S before loading cloud source."
		return
	_confirm_overwrite.dialog_text = "The cloud source differs from the local file. Replace it after creating a timestamped backup?"
	_confirm_overwrite.popup_centered()
	_status.text = "Review the overwrite prompt. The local file will be backed up before replacement."


func _confirm_cloud_overwrite() -> void:
	if _target_script_has_unsaved_changes():
		_status.text = "Cloud load cancelled: save the open script with Ctrl+S, then load again."
		return
	var current := _read_source_file()
	if current == null or current != _pending_local_source:
		_status.text = "Cloud load cancelled because the local file changed while the prompt was open. Load again to compare."
		return
	if not _backup_and_write_source(current, _pending_source):
		return
	_revision = _pending_revision
	_revision_label.text = "Cloud revision: %d" % _revision
	EditorInterface.get_script_editor().reload_open_files()
	_status.text = "Loaded PlayForge revision %d. Local backup was created." % _revision


func _handle_upload_success(response: Dictionary) -> void:
	var document: Dictionary = response.get("document", {})
	var new_revision := int(document.get("revision", 0))
	if new_revision <= 0:
		_status.text = "Upload succeeded but the service did not return a revision."
		return
	_revision = new_revision
	_revision_label.text = "Cloud revision: %d" % _revision
	_status.text = "Saved script uploaded as revision %d." % _revision


func _handle_build_start(response: Dictionary) -> void:
	var build: Dictionary = response.get("build", {})
	_build_id = str(build.get("id", ""))
	if not _valid_build_id(_build_id):
		_status.text = "The service did not return a valid build ID."
		return
	_poll_failures = 0
	_handle_build_status(build)


func _handle_build_poll(response: Dictionary) -> void:
	var build: Dictionary = response.get("build", response)
	if str(build.get("id", _build_id)) != _build_id:
		_status.text = "Build status response did not match the active build."
		return
	_handle_build_status(build)


func _handle_build_status(build: Dictionary) -> void:
	var build_status := str(build.get("status", ""))
	if build_status in ["queued", "running"]:
		_status.text = "Web build %s: %s…" % [_build_id, build_status]
		_poll_timer.start()
		return
	if build_status == "succeeded":
		_preview_path = _safe_build_path(build.get("previewUrl", ""))
		_download_path = _safe_build_path(build.get("downloadUrl", ""))
		_status.text = "Web build succeeded for revision %d." % int(build.get("revision", _revision))
		return
	if build_status == "failed":
		_status.text = "Web build failed: %s" % str(build.get("error", "see build details"))
		return
	_status.text = "The service returned an unsupported build status."


func _poll_build() -> void:
	if _build_id.is_empty():
		return
	if not _begin_request("build_poll", "/api/builds/" + _build_id, HTTPClient.METHOD_GET):
		_poll_failures += 1
		if _poll_failures < 3:
			_poll_timer.start()
		else:
			_status.text = "Could not check build status. The build may still be running."


func _valid_build_id(value: String) -> bool:
	if value.is_empty() or value.length() > 128:
		return false
	for character in value:
		if not SAFE_BUILD_ID_CHARS.contains(character):
			return false
	return true


func _safe_build_path(value: Variant) -> String:
	if not value is String or value.is_empty() or not value.begins_with("/") or value.begins_with("//"):
		return ""
	if value.contains("\\") or value.contains(":") or value.contains("#") or value.contains("\n") or value.contains("\r"):
		return ""
	for segment in value.split("/"):
		if segment == ".." or segment == ".":
			return ""
	return _origin + value


func _open_preview() -> void:
	_open_service_url(_preview_path)


func _open_download() -> void:
	_open_service_url(_download_path)


func _open_service_url(url: String) -> void:
	if url.is_empty() or not url.begins_with(_origin + "/"):
		_status.text = "The build URL is not a safe path on this PlayForge service."
		return
	var error := OK
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.open(%s, '_blank', 'noopener')" % JSON.stringify(url), true)
	else:
		error = OS.shell_open(url)
	if error != OK:
		_status.text = "Could not open the build URL (error %d)." % error


func _target_script_has_unsaved_changes() -> bool:
	if _source_path.is_empty():
		return false
	var editor := EditorInterface.get_script_editor()
	var absolute_path := ProjectSettings.globalize_path(_source_path).simplify_path()
	for unsaved_path in editor.get_unsaved_files():
		if unsaved_path == _source_path or unsaved_path.simplify_path() == absolute_path:
			return true
	return false


func _read_source_file() -> Variant:
	var file := FileAccess.open(_source_path, FileAccess.READ)
	if file == null:
		return null
	return file.get_as_text()


func _backup_and_write_source(current: String, replacement: String) -> bool:
	var stamp := Time.get_datetime_string_from_system().replace(":", "-").replace("T", "_")
	var backup_path := _source_path + ".backup." + stamp + "." + str(Time.get_ticks_usec())
	var backup := FileAccess.open(backup_path, FileAccess.WRITE)
	if backup == null:
		_status.text = "Could not create a local backup; source was not changed."
		return false
	backup.store_string(current)
	backup.flush()
	if backup.get_error() != OK:
		backup.close()
		_status.text = "Could not finish the local backup; source was not changed."
		return false
	backup.close()
	var file := FileAccess.open(_source_path, FileAccess.WRITE)
	if file == null:
		_status.text = "Backup exists, but the local source could not be opened for writing."
		return false
	file.store_string(replacement)
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		var restore := FileAccess.open(_source_path, FileAccess.WRITE)
		if restore != null:
			restore.store_string(current)
			restore.close()
		_status.text = "Writing cloud source failed. A backup is available at %s." % backup_path
		return false
	return true
