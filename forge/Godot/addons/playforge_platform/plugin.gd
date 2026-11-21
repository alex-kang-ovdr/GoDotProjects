@tool
extends EditorPlugin

const META_PATH := "res://.playforge-platform.json"
const MAX_FILES := 512
const MAX_PROJECT_BYTES := 8 * 1024 * 1024
const MAX_FILE_BYTES := 1024 * 1024
const POLL_SECONDS := 1.5
const GUIDE_QUEUE_LIMIT := 8
const GUIDE_TIMEOUT_SECONDS := 20.0
const GUIDE_SCENE_PATH := "res://scenes/main.tscn"
const IGNORED_DIRS := [".godot", ".git", ".playforge-import", ".playforge-store", "addons/playforge_platform", "addons/playforge_replay", "addons/playforge_showcase", "addons/playforge_agent_chat", "addons/playforge_remote_control", "addons/playforge_avatar", "addons/playforge_blender"]
const MANAGED_PLUGINS := ["res://addons/playforge_platform/plugin.cfg", "res://addons/playforge_replay/plugin.cfg", "res://addons/playforge_agent_chat/plugin.cfg", "res://addons/playforge_remote_control/plugin.cfg", "res://addons/playforge_avatar/plugin.cfg", "res://addons/playforge_blender/plugin.cfg"]
const TEXT_EXTENSIONS := ["gd", "tscn", "tres", "godot", "cfg", "json", "txt", "md", "shader", "gdshader", "svg"]

var _request: HTTPRequest
var _timer: Timer
var _status: Label
var _conflict_window: Window
var _last_web_status := ""
var _last_conflict_signature := ""
var _keep_local_button: Button
var _use_remote_button: Button
var _revision := 0
var _marker_revision := -1
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
var _guide_callback: JavaScriptObject
var _conflict_callback: JavaScriptObject
var _guide_commands: Array[Dictionary] = []
var _guide_active: Dictionary = {}
class RuntimeSnapshot extends RefCounted:
	var snapshot: Dictionary = {}
	func _get_property_list() -> Array[Dictionary]:
		return [{"name":"runtime/state", "type":TYPE_DICTIONARY, "usage":PROPERTY_USAGE_EDITOR | PROPERTY_USAGE_READ_ONLY}]
	func _get(property: StringName) -> Variant:
		return snapshot if property == "runtime/state" else null

var _session_bar: HBoxContainer
var _session_tabs: TabBar
var _session_menu: MenuButton
var _runtime_snapshot := RuntimeSnapshot.new()
var _session_ids: Array[String] = []
var _last_session_logs := ""
var _main_play_button: Button
var _add_client_button: Button
var _native_game_active := false
var _native_game_geometry_ticks := 0
var _last_native_game_rect := Rect2(-1.0, -1.0, -1.0, -1.0)


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
	# Seed from files copied into this editor, never from a newer first HTTP response.
	var bootstrap := _parse_remote({"ok": true, "revision": _revision, "files": parsed.get("baseFiles", [])})
	if not bootstrap.is_empty():
		_base_files = bootstrap.files
	if not _valid_project_id(_project_id):
		return
	if OS.has_feature("web"):
		_origin = str(JavaScriptBridge.eval("window.location.origin + (window.__playforgeBasePath || '')", true)).trim_suffix("/")
		_install_guide_bridge()
	else:
		_origin = "http://127.0.0.1:4173"
	_client_id = "godot-" + Crypto.new().generate_random_bytes(16).hex_encode()
	_build_dock()
	if OS.has_feature("web"):
		call_deferred("_install_session_bar")
	_request = HTTPRequest.new()
	_request.timeout = 15.0
	_request.max_redirects = 3
	add_child(_request)
	_request.request_completed.connect(_on_request_completed)
	_timer = Timer.new()
	_timer.wait_time = POLL_SECONDS
	add_child(_timer)
	_timer.timeout.connect(_poll_remote)
	main_screen_changed.connect(_on_main_screen_changed)
	_status.text = "Connecting · project %s" % _project_id
	_fetch_remote("initial")
	_timer.start()
	resource_saved.connect(_on_resource_saved)
	scene_saved.connect(_on_scene_saved)


func _exit_tree() -> void:
	if is_instance_valid(_session_bar):
		_session_bar.queue_free()
	if is_instance_valid(_add_client_button):
		_add_client_button.queue_free()
	if _native_game_active:
		_send_native_game_screen("Stopped", {})
	_native_game_active = false
	_remove_guide_bridge()
	if main_screen_changed.is_connected(_on_main_screen_changed):
		main_screen_changed.disconnect(_on_main_screen_changed)
	for command in _guide_commands:
		_respond_to_guide(command, false, "Editor plugin stopped before the request completed.")
	_guide_commands.clear()
	if not _guide_active.is_empty():
		_respond_to_guide(_guide_active, false, "Editor plugin stopped before the request completed.")
		_guide_active.clear()
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
	if _conflict_window != null and is_instance_valid(_conflict_window):
		_conflict_window.queue_free()
	if not OS.has_feature("web") and _status != null and is_instance_valid(_status):
		remove_control_from_bottom_panel(_status.get_parent())


func _process(_delta: float) -> void:
	if not OS.has_feature("web"):
		return
	_publish_web_sync_status()
	if _native_game_active:
		_native_game_geometry_ticks += 1
		if _native_game_geometry_ticks >= 10:
			_native_game_geometry_ticks = 0
			_report_native_game_viewport()
			_sync_native_sessions()
	if _guide_active.is_empty():
		if _guide_commands.is_empty():
			return
		_guide_active = _guide_commands.pop_front()
	if Time.get_ticks_msec() >= int(_guide_active.deadline):
		_finish_guide(false, "Timed out waiting for the requested revision or editor scene.")
		return
	if _revision < int(_guide_active.revision) or _busy:
		_guide_active.settled_frames = 0
		return
	var filesystem := EditorInterface.get_resource_filesystem()
	if filesystem.is_scanning() or filesystem.is_importing():
		_guide_active.settled_frames = 0
		return
	_guide_active.settled_frames = int(_guide_active.settled_frames) + 1
	if int(_guide_active.settled_frames) < 2:
		return
	if not bool(_guide_active.scene_opened):
		var edited_root := EditorInterface.get_edited_scene_root()
		if edited_root == null or edited_root.scene_file_path != GUIDE_SCENE_PATH:
			EditorInterface.open_scene_from_path(GUIDE_SCENE_PATH)
		_guide_active.scene_opened = true
		_guide_active.settled_frames = 0
		return
	var root := EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path != GUIDE_SCENE_PATH:
		_guide_active.settled_frames = 0
		return
	var node := _resolve_guide_node(root, str(_guide_active.get("nodePath", "")))
	if node == null:
		_finish_guide(false, "Node was not found in scenes/main.tscn: %s" % str(_guide_active.get("nodePath", "")))
		return
	EditorInterface.set_main_screen_editor("3D" if str(_guide_active.dimension) == "3d" else "2D")
	var selection := EditorInterface.get_selection()
	selection.clear()
	selection.add_node(node)
	EditorInterface.edit_node(node)
	_finish_guide(true)


func _on_main_screen_changed(screen_name: String) -> void:
	_native_game_active = OS.has_feature("web") and screen_name == "Game"
	_native_game_geometry_ticks = 0
	if is_instance_valid(_session_bar):
		_session_bar.visible = _native_game_active
	if _native_game_active:
		_last_native_game_rect = Rect2(-1.0, -1.0, -1.0, -1.0)
		_report_native_game_viewport()
	else:
		_last_native_game_rect = Rect2(-1.0, -1.0, -1.0, -1.0)
		_send_native_game_screen(screen_name, {})


func _report_native_game_viewport() -> void:
	if not _native_game_active:
		return
	var editor_screen := EditorInterface.get_editor_main_screen()
	var viewport_size := get_viewport().get_visible_rect().size
	if editor_screen == null or viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	var bounds := editor_screen.get_global_rect()
	if is_instance_valid(_session_bar):
		_session_bar.global_position = bounds.position
		_session_bar.size.x = bounds.size.x
		bounds.position.y += 36
		bounds.size.y -= 36
	var normalized := Rect2(bounds.position / viewport_size, bounds.size / viewport_size)
	if normalized.position.x < 0.0 or normalized.position.y < 0.0 or normalized.size.x <= 0.0 or normalized.size.y <= 0.0:
		return
	if absf(normalized.position.x - _last_native_game_rect.position.x) < 0.002 and absf(normalized.position.y - _last_native_game_rect.position.y) < 0.002 and absf(normalized.size.x - _last_native_game_rect.size.x) < 0.002 and absf(normalized.size.y - _last_native_game_rect.size.y) < 0.002:
		return
	_last_native_game_rect = normalized
	_send_native_game_screen("Game", {"x": normalized.position.x, "y": normalized.position.y,
		"width": normalized.size.x, "height": normalized.size.y})


func _send_native_game_screen(screen_name: String, rect: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	var message := {"source": "playforge-godot-editor", "type": "native-screen", "screen": screen_name, "rect": rect}
	var javascript := "if (typeof window.__playforgeNativeGameScreen === 'function') window.__playforgeNativeGameScreen(JSON.parse(%s));" % JSON.stringify(JSON.stringify(message))
	JavaScriptBridge.eval(javascript, true)


func _input(event: InputEvent) -> void:
	if OS.has_feature("web") and event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_broadcast_semantic_click(event)
	if not OS.has_feature("web") or not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.ctrl_pressed or event.meta_pressed or event.alt_pressed:
		return
	if event.unicode == 0 and event.keycode not in [KEY_BACKSPACE, KEY_DELETE]:
		return
	var focus_owner := get_viewport().gui_get_focus_owner()
	if not focus_owner is LineEdit or focus_owner.secret:
		return
	call_deferred("_broadcast_guide_typing", focus_owner.get_instance_id())


func _broadcast_guide_typing(line_edit_id: int) -> void:
	if not is_instance_id_valid(line_edit_id):
		return
	var line_edit = instance_from_id(line_edit_id)
	if not line_edit is LineEdit or line_edit.secret or get_viewport().gui_get_focus_owner() != line_edit:
		return
	var message := {"source": "playforge-godot-editor", "type": "activity", "kind": "typing", "text": line_edit.text}
	var javascript := "if (window.parent !== window && window.parent.location.origin === window.location.origin) window.parent.postMessage(JSON.parse(%s), window.location.origin);" % JSON.stringify(JSON.stringify(message))
	JavaScriptBridge.eval(javascript, true)


func _broadcast_semantic_click(event: InputEventMouseButton) -> void:
	var hovered := get_viewport().gui_get_hovered_control()
	var label := _semantic_button_label(hovered)
	if label.is_empty():
		return
	var viewport_rect := get_viewport().get_visible_rect()
	if viewport_rect.size.x <= 0.0 or viewport_rect.size.y <= 0.0:
		return
	var point := event.position
	var message := {"source": "playforge-godot-editor", "type": "activity", "kind": "step",
		"clickLabel": label, "x": clampf(point.x / viewport_rect.size.x, 0.0, 1.0),
		"y": clampf(point.y / viewport_rect.size.y, 0.0, 1.0)}
	var javascript := "(() => {const m = JSON.parse(%s), r = document.getElementById('editor-canvas').getBoundingClientRect(); m.x = (r.left + m.x * r.width) / window.innerWidth; m.y = (r.top + m.y * r.height) / window.innerHeight; if (window.parent !== window && window.parent.location.origin === window.location.origin) window.parent.postMessage(m, window.location.origin);})();" % JSON.stringify(JSON.stringify(message))
	JavaScriptBridge.eval(javascript, true)


static func _semantic_button_label(control: Control) -> String:
	var current := control
	while current != null:
		if current is BaseButton:
			var button := current as BaseButton
			var label := (current as Button).text.strip_edges() if current is Button else ""
			if label.is_empty():
				label = button.tooltip_text.strip_edges()
			return label.substr(0, 60) if not label.is_empty() else ""
		current = current.get_parent() as Control
	return ""


func _install_guide_bridge() -> void:
	if not OS.has_feature("web"):
		return
	if _guide_callback == null:
		_guide_callback = JavaScriptBridge.create_callback(_on_guide_message)
		JavaScriptBridge.get_interface("window")["__playforgeGuideCallback"] = _guide_callback
	if _conflict_callback == null:
		_conflict_callback = JavaScriptBridge.create_callback(_on_show_conflicts)
		JavaScriptBridge.get_interface("window")["__playforgeShowConflictsCallback"] = _conflict_callback
	var script := """
		(() => {
			if (window.__playforgeGuideListener) return;
			window.__playforgeGuideListener = (event) => {
				if (window.parent === window || event.source !== window.parent || event.origin !== window.location.origin) return;
				const data = event.data;
			if (!data || typeof data !== 'object' || data.source !== 'playforge-platform-guide') return;
				const keys = Object.keys(data).sort().join(',');
			if (typeof data.requestId !== 'string' || data.requestId.length === 0 || data.requestId.length > 128) return;
			if (data.type === 'reveal') {
				if (keys !== 'dimension,nodePath,requestId,revision,source,type' || typeof data.nodePath !== 'string' || data.nodePath.length > 1024) return;
			} else if (data.type === 'screen') {
				if (keys !== 'requestId,screen,source,type' || !['2D', '3D', 'Script'].includes(data.screen)) return;
			} else {
				return;
			}
				const serialized = JSON.stringify(data);
				if (serialized.length <= 2048) window.__playforgeGuideCallback(serialized);
			};
			window.addEventListener('message', window.__playforgeGuideListener);
		})();
	"""
	JavaScriptBridge.eval(script, true)


func _remove_guide_bridge() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval("if (window.__playforgeGuideListener) { window.removeEventListener('message', window.__playforgeGuideListener); window.__playforgeGuideListener = null; } window.__playforgeGuideCallback = null; window.__playforgeShowConflictsCallback = null;", true)
	_guide_callback = null
	_conflict_callback = null


func _on_show_conflicts(_arguments: Array) -> void:
	_show_conflict_controls()


func _on_guide_message(arguments: Array) -> void:
	if arguments.is_empty() or not arguments[0] is String:
		return
	var message := _decode_guide_message(arguments[0])
	if message.is_empty():
		return
	if message.type == "screen":
		var error_message := _apply_guide_screen(str(message.screen))
		_respond_to_guide(message, error_message.is_empty(), error_message)
		return
	if _guide_commands.size() + (1 if not _guide_active.is_empty() else 0) >= GUIDE_QUEUE_LIMIT:
		_respond_to_guide(message, false, "The editor guide queue is full.")
		return
	message["deadline"] = Time.get_ticks_msec() + int(GUIDE_TIMEOUT_SECONDS * 1000.0)
	message["settled_frames"] = 0
	message["scene_opened"] = false
	_guide_commands.append(message)


static func _decode_guide_message(serialized: String) -> Dictionary:
	if serialized.to_utf8_buffer().size() > 2048:
		return {}
	var message = JSON.parse_string(serialized)
	if not message is Dictionary or not _valid_guide_message(message):
		return {}
	if message.type == "reveal":
		message["revision"] = int(message["revision"])
	return message


static func _valid_guide_message(message: Dictionary) -> bool:
	if not message.has("source") or not message.has("type") or not message.has("requestId"):
		return false
	if message.source != "playforge-platform-guide":
		return false
	if not message.requestId is String or str(message.requestId).is_empty() or str(message.requestId).length() > 128:
		return false
	if message.type == "screen":
		return message.size() == 4 and message.has("screen") and message.screen in ["2D", "3D", "Script"]
	if message.type != "reveal" or message.size() != 6:
		return false
	for key in ["revision", "nodePath", "dimension"]:
		if not message.has(key):
			return false
	var revision = message.revision
	if not (revision is int or revision is float) or not is_finite(revision) or floor(revision) != revision or revision < 1:
		return false
	if not message.nodePath is String or not _valid_guide_node_path(str(message.nodePath)):
		return false
	if str(message.nodePath).length() > 1024:
		return false
	return message.dimension == "2d" or message.dimension == "3d"


func _apply_guide_screen(screen: String) -> String:
	if screen == "2D" or screen == "3D":
		EditorInterface.set_main_screen_editor(screen)
		return ""
	if screen != "Script":
		return "Requested editor screen is not supported."
	var script_paths: Array[String] = []
	for file_path in _base_files.keys():
		var path := str(file_path)
		if path.ends_with(".gd") and not path.begins_with("addons/"):
			script_paths.append(path)
	script_paths.sort()
	if script_paths.is_empty():
		return "No local game script is available to open."
	var script_path := "res://" + script_paths[0]
	var game_script := ResourceLoader.load(script_path) as Script
	if game_script == null:
		return "Could not load the first local game script: %s" % script_paths[0]
	EditorInterface.edit_script(game_script)
	EditorInterface.set_main_screen_editor("Script")
	return ""


static func _valid_guide_node_path(value: String) -> bool:
	if value == ".":
		return true
	if value.is_empty() or value.begins_with("/") or value.ends_with("/") or value.contains("\\") or value.contains(":") or value.contains("//"):
		return false
	for part in value.split("/"):
		if part.is_empty() or part == "." or part == "..":
			return false
	return true


static func _resolve_guide_node(root: Node, node_path: String) -> Node:
	if root == null or not _valid_guide_node_path(node_path):
		return null
	return root if node_path == "." else root.get_node_or_null(NodePath(node_path))


func _finish_guide(ok: bool, error_message := "") -> void:
	if _guide_active.is_empty():
		return
	_respond_to_guide(_guide_active, ok, error_message)
	_guide_active.clear()


func _respond_to_guide(command: Dictionary, ok: bool, error_message := "") -> void:
	if not OS.has_feature("web"):
		return
	var response := {"source": "playforge-godot-editor", "type": "guide-result", "requestId": str(command.get("requestId", "")), "ok": ok}
	if not error_message.is_empty():
		response["error"] = error_message
	var serialized := JSON.stringify(response)
	var javascript := "if (window.parent !== window && window.parent.location.origin === window.location.origin) window.parent.postMessage(JSON.parse(%s), window.location.origin);" % JSON.stringify(serialized)
	JavaScriptBridge.eval(javascript, true)


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
	if OS.has_feature("web"):
		_conflict_window = Window.new()
		_conflict_window.title = "PlayForge file conflict"
		_conflict_window.size = Vector2i(520, 220)
		_conflict_window.visible = false
		_conflict_window.close_requested.connect(_on_conflict_window_close_requested)
		dock.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_conflict_window.add_child(dock)
		add_child(_conflict_window)
	else:
		add_control_to_bottom_panel(dock, "PlayForge")
		make_bottom_panel_item_visible(dock)


func _publish_web_sync_status() -> void:
	if _status == null:
		return
	var text := _status.text
	var conflicted := not _conflicted_paths.is_empty()
	var key := "%s|%d|%s" % [text, _revision, str(conflicted)]
	if key == _last_web_status:
		return
	_last_web_status = key
	var message := {"source": "playforge-godot-editor", "type": "sync-status", "text": text,
		"revision": _revision, "conflicted": conflicted}
	var javascript := "if (typeof window.__playforgeSyncStatus === 'function') window.__playforgeSyncStatus(JSON.parse(%s));" % JSON.stringify(JSON.stringify(message))
	JavaScriptBridge.eval(javascript, true)


func _show_conflict_controls() -> void:
	if OS.has_feature("web") and _conflict_window != null and not _conflicted_paths.is_empty():
		_conflict_window.popup_centered()


func _close_conflict_controls() -> void:
	if OS.has_feature("web") and _conflict_window != null:
		_conflict_window.hide()


func _on_conflict_window_close_requested() -> void:
	if _conflict_window != null:
		_conflict_window.hide()


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
	if OS.has_feature("web") and method != "GET":
		var csrf := str(JavaScriptBridge.eval("window.__playforgeCsrfToken || ''", true))
		if not csrf.is_empty():
			headers.append("X-CSRF-Token: " + csrf)
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
	conflicts.sort()
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
	var conflict_signature := ",".join(conflicts)
	if conflicts.is_empty():
		_last_conflict_signature = ""
		_close_conflict_controls()
	elif conflict_signature != _last_conflict_signature:
		_last_conflict_signature = conflict_signature
		_show_conflict_controls()
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
	_close_conflict_controls()
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
	_close_conflict_controls()
	EditorInterface.get_resource_filesystem().scan()
	if reload_scripts:
		EditorInterface.get_script_editor().reload_open_files()
	_status.text = "Loaded remote versions for resolved files · revision %d" % _revision


func _write_or_delete_file(file_path: String, content: Variant) -> bool:
	var resource_path := "res://" + file_path
	var pending := _pending_import_path(file_path)
	if content == null:
		for location: String in [pending, resource_path]:
			if not location.is_empty() and FileAccess.file_exists(location):
				var delete_error := DirAccess.remove_absolute(ProjectSettings.globalize_path(location))
				if delete_error != OK:
					_status.text = "Could not delete %s (error %d); remote state was kept for retry." % [file_path, delete_error]
					return false
		return true
	if not pending.is_empty() and not FileAccess.file_exists(resource_path):
		resource_path = pending
	var absolute := ProjectSettings.globalize_path(resource_path)
	var parent := absolute.get_base_dir()
	var directory_error := DirAccess.make_dir_recursive_absolute(parent)
	if directory_error != OK:
		_status.text = "Could not create the folder for %s (error %d); remote state was kept for retry." % [file_path, directory_error]
		return false
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
	if file_path == "project.godot":
		_base_project_config = str(content)
		_injected_project_config = contents
	return true


func _collect_local_files() -> Dictionary:
	var files: Dictionary = {}
	_scan_error = ""
	_collect_directory("res://", "", files)
	# Hidden replay files belong to the project before they are first visible
	# to Godot. Moving them into place does not change the sync baseline.
	for file_path: String in _base_files:
		if files.has(file_path):
			continue
		var pending := _pending_import_path(file_path)
		if not pending.is_empty():
			var file := FileAccess.open(pending, FileAccess.READ)
			if file == null or file.get_length() > MAX_FILE_BYTES:
				_scan_error = "Could not read staged file %s within the file synchronization limit." % file_path
				return files
			files[file_path] = file.get_as_text()
	var total := 0
	for file_path in files:
		total += str(files[file_path]).to_utf8_buffer().size()
	if total > MAX_PROJECT_BYTES:
		_scan_error = "Project files exceed the 8 MB synchronization limit."
	return files


func _pending_import_path(file_path: String) -> String:
	if not _valid_file_path(file_path):
		return ""
	var root := "/tmp/playforge-import/%s/" % _project_id if OS.has_feature("web") else "res://.playforge-import/"
	var path := root + file_path
	return path if FileAccess.file_exists(path) else ""


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
	if _is_ignored_directory(value) or value in [".playforge-platform.json", ".playforge-showcase.json", ".playforge-store.json"]:
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
	var normalized := source
	var section := _plugin_section(source)
	if section != null:
		var plugins := section.get_string()
		var baseline := _plugin_section(_base_project_config)
		for plugin_path: String in MANAGED_PLUGINS:
			if baseline != null and baseline.get_string().contains('"' + plugin_path + '"'):
				continue
			plugins = plugins.replace(', "' + plugin_path + '"', "")
			plugins = plugins.replace('"' + plugin_path + '", ', "")
			plugins = plugins.replace('"' + plugin_path + '"', "")
		var empty_assignment := RegEx.new()
		empty_assignment.compile("(?m)^enabled=PackedStringArray\\(\\s*\\)\\s*\\n?")
		plugins = empty_assignment.sub(plugins, "", true)
		if plugins.strip_edges() == "[editor_plugins]":
			plugins = ""
		normalized = source.left(section.get_start()) + plugins + source.substr(section.get_end())
	if _matches_project_settings(normalized):
		return _base_project_config
	return normalized


func _matches_project_settings(source: String) -> bool:
	if _base_project_config.is_empty():
		return false
	var current := ConfigFile.new()
	var baseline := ConfigFile.new()
	if current.parse(source) != OK or baseline.parse(_base_project_config) != OK:
		return false
	for section in current.get_sections():
		for key in current.get_section_keys(section):
			if not baseline.has_section_key(section, key):
				return false
			var current_value: Variant = current.get_value(section, key)
			var baseline_value: Variant = baseline.get_value(section, key)
			if current_value == baseline_value:
				continue
			# Parsing [input] constructs separate InputEvent resources for equivalent bindings.
			if section != "input" or var_to_str(current_value) != var_to_str(baseline_value):
				return false
	for section in baseline.get_sections():
		for key in baseline.get_section_keys(section):
			if current.has_section_key(section, key):
				continue
			# Godot omits settings whose effective value matches the editor default when it saves.
			var setting := section.path_join(key) if not section.is_empty() else key
			if not ProjectSettings.has_setting(setting) or ProjectSettings.get_setting(setting) != baseline.get_value(section, key):
				return false
	return true


func _trim_final_newlines(value: String) -> String:
	var result := value
	while result.ends_with("\n") or result.ends_with("\r"):
		result = result.left(result.length() - 1)
	return result


func _enable_platform_plugin(source: String) -> String:
	var injected := source
	for plugin_path: String in MANAGED_PLUGINS:
		if FileAccess.file_exists(plugin_path):
			injected = _enable_managed_plugin(injected, plugin_path)
	return injected


func _enable_managed_plugin(source: String, plugin_path: String) -> String:
	var section := _plugin_section(source)
	if section == null:
		return source + "\n[editor_plugins]\nenabled=PackedStringArray(\"%s\")\n" % plugin_path
	var plugins := section.get_string()
	if plugins.contains('"' + plugin_path + '"'):
		return source
	var enabled_regex := RegEx.new()
	enabled_regex.compile("(?m)^[ \\t]*enabled[ \\t]*=[ \\t]*PackedStringArray\\(([^)\\r\\n]*)\\)[ \\t]*(?=\\r?$)")
	var existing := enabled_regex.search(plugins)
	if existing != null:
		var values := existing.get_string(1).strip_edges()
		var assignment := "enabled=PackedStringArray(%s%s\"%s\")" % [values, ", " if not values.is_empty() else "", plugin_path]
		plugins = plugins.left(existing.get_start()) + assignment + plugins.substr(existing.get_end())
	else:
		plugins = plugins.trim_suffix("\n") + "\nenabled=PackedStringArray(\"%s\")\n" % plugin_path
	return source.left(section.get_start()) + plugins + source.substr(section.get_end())


func _plugin_section(source: String) -> RegExMatch:
	var pattern := RegEx.new()
	pattern.compile("(?ms)^\\[editor_plugins\\][ \\t]*(?:\\r?\\n|\\z).*?(?=^\\[|\\z)")
	return pattern.search(source)


func _update_marker() -> void:
	if _marker_revision == _revision:
		return
	var file := FileAccess.open(META_PATH, FileAccess.WRITE)
	if file != null:
		var baseline: Array = []
		for file_path in _base_files:
			baseline.append({"path": file_path, "content": _base_files[file_path]})
		file.store_string(JSON.stringify({"id": _project_id, "revision": _revision,
			"baseProjectConfig": _base_project_config, "editorProjectConfig": _injected_project_config, "baseFiles": baseline}))
		file.close()
		_marker_revision = _revision


func _announce_plugin_ready() -> void:
	if _ready_announced or not OS.has_feature("web"):
		return
	_ready_announced = true
	var message := JSON.stringify({"source": "playforge-godot-editor", "type": "pluginready", "projectId": _project_id, "revision": _revision})
	var javascript := "if (window.parent !== window && window.parent.location.origin === window.location.origin) window.parent.postMessage(JSON.parse(%s), window.location.origin);" % JSON.stringify(message)
	JavaScriptBridge.eval(javascript, true)


func _install_multiplayer_button() -> void:
	if is_instance_valid(_add_client_button):
		return
	var play_button := _find_main_play_button(EditorInterface.get_base_control())
	if play_button == null:
		return
	_main_play_button = play_button
	_add_client_button = Button.new()
	_add_client_button.name = "PlayForgeAddClient"
	_add_client_button.theme_type_variation = play_button.theme_type_variation
	_add_client_button.icon = EditorInterface.get_base_control().get_theme_icon("Add", "EditorIcons")
	_add_client_button.tooltip_text = "Add multiplayer client"
	_add_client_button.custom_minimum_size = play_button.get_combined_minimum_size()
	_add_client_button.focus_mode = Control.FOCUS_ALL
	play_button.get_parent().add_child(_add_client_button)
	play_button.get_parent().move_child(_add_client_button, play_button.get_index() + 1)
	call_deferred("_report_client_button", play_button)
	_add_client_button.pressed.connect(func():
		JavaScriptBridge.eval("if(typeof window.__playforgeAddMultiplayerClient==='function')window.__playforgeAddMultiplayerClient();", true))


func _find_main_play_button(node: Node) -> Button:
	if node is Button and node.theme_type_variation == "RunBarButton" and node.shortcut != null:
		for event in node.shortcut.events:
			if event is InputEventKey and event.keycode == KEY_F5:
				return node
	for child in node.get_children():
		var found := _find_main_play_button(child)
		if found != null:
			return found
	return null


func _report_client_button(play_button: Button) -> void:
	if not is_instance_valid(play_button) or not is_instance_valid(_add_client_button):
		return
	var a := _add_client_button.get_global_rect()
	var b := play_button.get_global_rect()
	var data := {"button": {"x":a.position.x,"y":a.position.y,"width":a.size.x,"height":a.size.y}, "play": {"x":b.position.x,"y":b.position.y,"width":b.size.x,"height":b.size.y}}
	JavaScriptBridge.eval("window.__playforgeClientButtonRect = JSON.parse(%s);" % JSON.stringify(JSON.stringify(data)), true)


func _install_session_bar() -> void:
	_session_bar = HBoxContainer.new()
	_session_bar.name = "PlayForgeNativeViewports"
	_session_bar.set_as_top_level(true)
	var session_background := StyleBoxFlat.new()
	session_background.bg_color = Color("#252525")
	_session_bar.draw.connect(func(): _session_bar.draw_style_box(session_background, Rect2(Vector2.ZERO, _session_bar.size)))
	_session_bar.custom_minimum_size.y = 36
	_session_bar.visible = false
	EditorInterface.get_editor_main_screen().add_child(_session_bar)
	_session_tabs = TabBar.new()
	_session_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_session_tabs.tab_close_display_policy = TabBar.CLOSE_BUTTON_SHOW_ACTIVE_ONLY
	_session_bar.add_child(_session_tabs)
	_session_tabs.tab_changed.connect(func(index):
		if index >= 0 and index < _session_ids.size():
			_native_session_command("select", _session_ids[index]))
	_session_tabs.tab_close_pressed.connect(func(index):
		if index > 0 and index < _session_ids.size():
			_native_session_command("close", _session_ids[index]))
	_session_menu = MenuButton.new()
	_session_menu.text = "+"
	_session_menu.tooltip_text = "Add viewport"
	_session_bar.add_child(_session_menu)
	_session_menu.about_to_popup.connect(func(): JavaScriptBridge.eval("document.getElementById('native-game-overlay').style.visibility='hidden';", true))
	_session_menu.get_popup().popup_hide.connect(func(): JavaScriptBridge.eval("document.getElementById('native-game-overlay').style.visibility='';", true))
	_session_menu.get_popup().add_item("Client viewport (same world)", 0)
	_session_menu.get_popup().add_item("Client viewport (new world)", 1)
	_session_menu.get_popup().add_item("Server viewport", 2)
	_session_menu.get_popup().id_pressed.connect(func(id):
		_native_session_command("add" if id == 0 else "world" if id == 1 else "select", "server"))
	var inspect := Button.new()
	inspect.text = "Inspect runtime"
	inspect.tooltip_text = "Read-only snapshot in the built-in Inspector; not remote object editing"
	_session_bar.add_child(inspect)
	inspect.pressed.connect(func():
		EditorInterface.inspect_object(_runtime_snapshot)
		JavaScriptBridge.eval("window.__playforgeRuntimeInspectorActive=true;", true))


func _native_session_command(action: String, id: String) -> void:
	JavaScriptBridge.eval("window.__playforgeMultiplayerCommand && window.__playforgeMultiplayerCommand(%s,%s);" % [JSON.stringify(action), JSON.stringify(id)], true)


func _sync_native_sessions() -> void:
	if not is_instance_valid(_session_tabs):
		return
	var raw = JavaScriptBridge.eval("window.__playforgeMultiplayerSummary ? window.__playforgeMultiplayerSummary() : '{}';", true)
	if not raw is String:
		return
	var data = JSON.parse_string(raw)
	if not data is Dictionary:
		return
	var ids: Array[String] = ["server"]
	for client in data.get("clients", []):
		ids.append(str(client.id))
	_session_tabs.set_block_signals(true)
	if ids != _session_ids:
		_session_ids = ids
		_session_tabs.clear_tabs()
		for id in ids:
			_session_tabs.add_tab("Server" if id == "server" else id.capitalize())
		_session_tabs.set_tab_tooltip(0, "Server observer; retained for the session")
	var selected := ids.find(str(data.get("active", "server")))
	if selected >= 0:
		_session_tabs.current_tab = selected
	_session_tabs.set_block_signals(false)
	_runtime_snapshot.snapshot = data.get("snapshot", {})
	_runtime_snapshot.notify_property_list_changed()
	var logs: Array = data.get("logs", [])
	if not logs.is_empty() and str(logs.back()) != _last_session_logs:
		_last_session_logs = str(logs.back())
		print("[PlayForge runtime] ", _last_session_logs)
	var r := _session_bar.get_global_rect()
	var menu := _session_menu.get_global_rect()
	JavaScriptBridge.eval("window.__playforgeSessionBarRect=JSON.parse(%s);" % JSON.stringify(JSON.stringify({"x":r.position.x,"y":r.position.y,"width":r.size.x,"height":r.size.y,"menuX":menu.position.x,"menuY":menu.position.y})), true)
