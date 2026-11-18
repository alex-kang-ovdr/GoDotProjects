@tool
extends EditorPlugin

const Timeline := preload("showcase_timeline.gd")
const ShowcasePanel := preload("showcase_panel.gd")
const PreviewCanvas := preload("showcase_canvas.gd")
const SceneReplay := preload("showcase_scene_replay.gd")
const START_MENU_ITEM := "PlayForge Showcase 재생"
const DEFAULT_REGIONS := {"gui": "inspector", "level": "viewport", "script": "scene", "assets": "filesystem"}
const FALLBACK_REGIONS := {
	"scene": Rect2(0.04, 0.12, 0.15, 0.34),
	"viewport": Rect2(0.25, 0.16, 0.52, 0.54),
	"inspector": Rect2(0.78, 0.14, 0.19, 0.43),
	"filesystem": Rect2(0.04, 0.56, 0.15, 0.33),
}

var _timeline: RefCounted
var _replay: RefCounted
var _scene_path := ""
var _template_timeline: RefCounted
var _template_replay: RefCounted
var _panel: Control
var _dock: EditorDock
var _editor_base: Control
var _cursor_overlay: Control
var _editor_regions: Dictionary = {}
var _region_trees: Dictionary = {}
var _web_window: JavaScriptObject
var _start_callback: JavaScriptObject
var _web_last_publish := 0
var _web_last_playing := false
var _awaiting_auto_start := false
var _opened_initial_screen := false
var _marked_scene_versions := {}


func _enter_tree() -> void:
	_editor_base = EditorInterface.get_base_control()
	_cache_editor_regions()
	_editor_base.resized.connect(_on_editor_geometry_changed)
	main_screen_changed.connect(_on_editor_screen_changed)
	scene_changed.connect(_on_editor_scene_changed)
	scene_closed.connect(_on_editor_scene_closed)
	if FileAccess.file_exists(Timeline.MANIFEST_PATH):
		var template := Timeline.new()
		if template.load_manifest():
			_template_timeline = template
			if template.schema_version == 3:
				_template_replay = SceneReplay.new()
				_template_replay.configure(template.original_steps())
			_activate_session(template, _template_replay, SceneReplay.SCENE_PATH)
			add_tool_menu_item(START_MENU_ITEM, _start_template_showcase)
		else:
			push_warning("PlayForge Showcase: " + template.error_message)
	if OS.has_feature("web"):
		_install_web_bridge()


func _exit_tree() -> void:
	if _web_window != null:
		_web_window["__playforgeStartShowcase"] = null
		JavaScriptBridge.eval("window.__playforgeShowcaseState = null; window.__playforgeShowcaseChanged?.(null);", true)
		_start_callback = null
		_web_window = null
	if is_instance_valid(_editor_base):
		_editor_base.resized.disconnect(_on_editor_geometry_changed)
	main_screen_changed.disconnect(_on_editor_screen_changed)
	scene_changed.disconnect(_on_editor_scene_changed)
	scene_closed.disconnect(_on_editor_scene_closed)
	if _template_timeline != null:
		remove_tool_menu_item(START_MENU_ITEM)
	if is_instance_valid(_cursor_overlay):
		_cursor_overlay.hide()
		_cursor_overlay.queue_free()
		_cursor_overlay = null
	if _dock != null:
		_panel.visibility_changed.disconnect(_on_editor_geometry_changed)
		_panel.playback_changed.disconnect(_on_playback_changed)
		remove_dock(_dock)
		_dock.queue_free()
		_dock = null
		_panel = null


func _activate_session(timeline: RefCounted, replay: RefCounted, scene_path: String) -> void:
	_awaiting_auto_start = false
	_opened_initial_screen = false
	_timeline = timeline
	_replay = replay
	_scene_path = scene_path
	if is_instance_valid(_panel):
		_panel.visibility_changed.disconnect(_on_editor_geometry_changed)
		_panel.playback_changed.disconnect(_on_playback_changed)
		_dock.remove_child(_panel)
		_panel.queue_free()
	var new_dock := _dock == null
	if new_dock:
		_dock = EditorDock.new()
		_dock.name = "PlayForgeShowcase"
		_dock.title = "PlayForge Showcase"
		_dock.layout_key = "playforge_showcase"
		_dock.default_slot = EditorDock.DOCK_SLOT_BOTTOM
		_dock.available_layouts = EditorDock.DOCK_LAYOUT_HORIZONTAL
		_dock.icon_name = &"AnimationPlayer"
		if not OS.has_feature("web") or int(JavaScriptBridge.eval("window.parent === window ? 1 : 0", true)) == 1:
			_install_cursor_overlay()
	_panel = ShowcasePanel.new()
	_panel.configure(_timeline, _prepare_scene_replay if _replay != null else Callable())
	_dock.add_child(_panel)
	if new_dock:
		add_dock(_dock)
	_panel.playback_changed.connect(_on_playback_changed)
	_panel.visibility_changed.connect(_on_editor_geometry_changed)
	_on_playback_changed(true)


func _start_template_showcase() -> void:
	if _timeline != _template_timeline:
		_activate_session(_template_timeline, _template_replay, SceneReplay.SCENE_PATH)
	_open_session_scene()


func _open_session_scene() -> void:
	var root := EditorInterface.get_edited_scene_root()
	if _replay == null or (root != null and root.scene_file_path == _scene_path):
		_start_showcase()
	elif ResourceLoader.exists(_scene_path, "PackedScene"):
		_awaiting_auto_start = true
		EditorInterface.open_scene_from_path(_scene_path)
		_start_auto_when_ready.call_deferred()
	else:
		_panel.show_replay_status("시연 장면을 열 수 없습니다.")


func _start_showcase() -> void:
	if is_instance_valid(_dock):
		_dock.make_visible()
		_panel.play_from_start()
		_on_playback_changed(true)


func _prepare_scene_replay() -> bool:
	var root := EditorInterface.get_edited_scene_root()
	if not _replay.claim(root):
		_panel.interrupt_replay(_replay.error_message)
		return false
	_panel.show_replay_status("")
	if not _opened_initial_screen:
		_opened_initial_screen = true
		EditorInterface.set_main_screen_editor("3D" if root is Node3D else "2D")
	return true


func replay_diagnostics() -> Dictionary:
	return _replay.diagnostics() if _replay != null else {}


func _on_editor_scene_changed(_scene_root: Node) -> void:
	if _awaiting_auto_start:
		_start_auto_when_ready.call_deferred()
	_on_editor_geometry_changed()
	_mark_replay_scene_unsaved.call_deferred()


func _on_editor_scene_closed(scene_path: String) -> void:
	if scene_path == SceneReplay.SCENE_PATH and _template_replay != null:
		_template_replay.close_scene()
		_marked_scene_versions.erase(_template_replay)
	if scene_path == _scene_path and _replay != null:
		_panel.interrupt_replay("시연 장면이 닫혔습니다.")
		_on_playback_changed(true)


func _start_auto_when_ready() -> void:
	if not _awaiting_auto_start or not is_instance_valid(_panel):
		return
	var scene := EditorInterface.get_edited_scene_root()
	if _replay != null and (scene == null or scene.scene_file_path != _scene_path):
		return
	_awaiting_auto_start = false
	_start_showcase()


func _install_cursor_overlay() -> void:
	_cursor_overlay = PreviewCanvas.EditorCursorOverlay.new()
	_cursor_overlay.name = "PlayForgeShowcaseCursors"
	_cursor_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cursor_overlay.z_index = 100
	_cursor_overlay.hide()
	_editor_base.add_child(_cursor_overlay)
	_cursor_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_cursor_overlay.resized.connect(_cursor_overlay.queue_redraw)


func _cache_editor_regions() -> void:
	var scene_docks := _editor_base.find_children("*", "SceneTreeDock", true, false)
	var scene_dock: Control = scene_docks[0] if not scene_docks.is_empty() else null
	_editor_regions = {
		"scene": scene_dock,
		"inspector": EditorInterface.get_inspector(),
		"filesystem": EditorInterface.get_file_system_dock(),
		"viewport": EditorInterface.get_editor_main_screen(),
		"script": EditorInterface.get_script_editor(),
	}
	for region in ["scene", "filesystem"]:
		var dock: Control = _editor_regions[region]
		if dock != null:
			_region_trees[region] = dock.find_children("*", "Tree", true, false)


func _active_role_cursors() -> Array[Dictionary]:
	var cursors: Array[Dictionary] = []
	if not _panel.has_active_run():
		return cursors
	var base_bounds := _editor_base.get_global_rect()
	if not base_bounds.has_area():
		return cursors
	var roles: Dictionary = _panel.role_states()
	for role: Dictionary in _timeline.roles:
		var state: Dictionary = roles.get(role.id, {})
		var authored_position: Variant = state.get("position")
		if authored_position is Vector2:
			var region := str(role.get("editorRegion", DEFAULT_REGIONS.get(role.id, "viewport")))
			var point := _editor_cursor_position(region, authored_position, base_bounds)
			cursors.append({
				"id": role.id,
				"label": role.label,
				"color": str(role.get("color", "#90d5ff")),
				"caption": state.text,
				"x": point.x,
				"y": point.y,
			})
	return cursors


func _editor_cursor_position(region: String, authored: Vector2, base_bounds: Rect2) -> Vector2:
	var control: Control = _editor_regions.get(region)
	if region == "script" and not _is_visible_editor_region(control):
		region = "scene"
		control = _editor_regions.get(region)
	var relative: Vector2 = (authored / _timeline.viewport_size).clamp(Vector2.ZERO, Vector2.ONE)
	if not _is_visible_editor_region(control):
		var fallback: Rect2 = FALLBACK_REGIONS.get(region, FALLBACK_REGIONS.viewport)
		return fallback.position + fallback.size * relative
	var bounds := control.get_global_rect().intersection(base_bounds)
	var inset := Vector2(0.12, 0.13) + relative * Vector2(0.76, 0.74)
	var point := bounds.position + bounds.size * inset
	var row := _visible_tree_row(region)
	if row.has_area():
		point = row.position + row.size * (Vector2(0.25, 0.25) + relative * 0.5)
	return ((point - base_bounds.position) / base_bounds.size).clamp(Vector2(0.02, 0.02), Vector2(0.98, 0.98))


func _is_visible_editor_region(control: Control) -> bool:
	return is_instance_valid(control) and control.get_viewport() == _editor_base.get_viewport() and control.is_visible_in_tree() and control.get_global_rect().has_area()


func _visible_tree_row(region: String) -> Rect2:
	for tree: Tree in _region_trees.get(region, []):
		if not _is_visible_editor_region(tree):
			continue
		var item := tree.get_selected()
		if item == null:
			item = tree.get_root()
			if item != null and tree.hide_root:
				item = item.get_first_child()
		if item != null:
			var row := tree.get_item_area_rect(item, 0)
			row.position += tree.global_position
			return row.intersection(tree.get_global_rect())
	return Rect2()


func _install_web_bridge() -> void:
	_web_window = JavaScriptBridge.get_interface("window")
	if _web_window == null:
		return
	_start_callback = JavaScriptBridge.create_callback(_on_web_start)
	_web_window["__playforgeStartShowcase"] = _start_callback
	_on_playback_changed(true)
	if _web_window["__playforgeShowcaseAutoStart"] == true:
		_web_window["__playforgeShowcaseAutoStart"] = false
		_awaiting_auto_start = true
		# Open the dock once the actual edit scene is available, before starting the clock.
		get_tree().process_frame.connect(_start_auto_when_ready, CONNECT_ONE_SHOT | CONNECT_DEFERRED)


func _on_web_start(_arguments: Array) -> void:
	_open_session_scene.call_deferred()


func _on_editor_geometry_changed() -> void:
	_on_playback_changed.call_deferred(true)


func _on_editor_screen_changed(_screen: String) -> void:
	_on_editor_geometry_changed()


func _on_playback_changed(force := false) -> void:
	if not is_instance_valid(_panel):
		return
	if _replay != null and _panel.has_started() and not _replay.apply_snapshot(_panel.current_snapshot()):
		_panel.interrupt_replay(_replay.error_message)
	_mark_replay_scene_unsaved()
	var playing: bool = _panel.is_playing()
	var now := Time.get_ticks_msec()
	var publish_web := _web_window != null and (force or not playing or playing != _web_last_playing or now - _web_last_publish >= 40)
	if not publish_web and not is_instance_valid(_cursor_overlay):
		return
	var cursors := _active_role_cursors()
	if is_instance_valid(_cursor_overlay):
		_cursor_overlay.present(cursors)
	if not publish_web:
		return
	_web_last_publish = now
	_web_last_playing = playing
	var state := {
		"ready": true,
		"visible": _panel.is_visible_in_tree(),
		"playing": playing,
		"time": _panel.current_time,
		"duration": _timeline.duration,
		"roles": cursors,
		"replay": replay_diagnostics(),
	}
	JavaScriptBridge.eval("window.__playforgeShowcaseState = " + JSON.stringify(state) + "; window.__playforgeShowcaseChanged?.(window.__playforgeShowcaseState);", true)


func _mark_replay_scene_unsaved() -> void:
	if _replay != null and _replay.scene_edit_version != _marked_scene_versions.get(_replay, 0) and _replay.owns_scene(EditorInterface.get_edited_scene_root()):
		_marked_scene_versions[_replay] = _replay.scene_edit_version
		EditorInterface.mark_scene_as_unsaved()
