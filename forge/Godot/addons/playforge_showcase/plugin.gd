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
var _template_root: WeakRef
var _template_undo_context: Resource
var _template_time := 0.0
var _template_history_time := 0.0
var _drag_changed_scene := false
var _follow_key: Array = []
var _focus_state := {}
var _main_screen := ""
var _canonical_script: Script
var _canonical_source := ""
var _script_presentation: CodeEdit
var _paste_count := 0


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
	if is_instance_valid(_script_presentation):
		_script_presentation.queue_free()
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
	_hide_script_presentation()
	_follow_key.clear()
	_focus_state.clear()
	_paste_count = 0
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
	if _timeline.schema_version == 3 and _replay.owns_scene(root):
		_template_root = weakref(root)
	_panel.show_replay_status("")
	_follow_key.clear()
	_focus_state.clear()
	_paste_count = 0
	_discard_script_presentation()
	if _timeline.schema_version == 3:
		_cache_original_script()
	if not _opened_initial_screen:
		_opened_initial_screen = true
		EditorInterface.set_main_screen_editor("3D" if root is Node3D else "2D")
	return true


func replay_diagnostics() -> Dictionary:
	return _replay.diagnostics() if _replay != null else {}


func focus_diagnostics() -> Dictionary:
	var state := _focus_state.duplicate()
	state.activeRole = _panel.active_role if is_instance_valid(_panel) else ""
	state.pasteCount = _paste_count
	if not _main_screen.is_empty():
		state.screen = _main_screen
	return state


func _cache_original_script() -> void:
	if _canonical_script != null:
		return
	var original := ResourceLoader.load(SceneReplay.SOURCE_PATH, "PackedScene") as PackedScene
	if original == null:
		return
	var state := original.get_state()
	for index in range(state.get_node_property_count(0)):
		if state.get_node_property_name(0, index) != &"script":
			continue
		var script := state.get_node_property_value(0, index) as Script
		if script is GDScript and script.resource_path.begins_with("res://"):
			_canonical_source = FileAccess.get_file_as_string(script.resource_path).replace("\r\n", "\n")
			_canonical_script = script
		return


func _follow_active_role(snapshot: Dictionary) -> void:
	var role_id: String = _panel.active_role
	var root := EditorInterface.get_edited_scene_root()
	if role_id.is_empty() or not _panel.has_active_run() or not _replay.owns_scene(root):
		_follow_key.clear()
		_focus_state.clear()
		_hide_script_presentation()
		return
	var role: Dictionary = snapshot.roles.get(role_id, {})
	var cue: Dictionary = role.get("cue", {})
	var edit: Dictionary = role.get("edit", {})
	var phase: String = role.get("scriptPhase", "")
	var key := [role_id, cue.get("order", -1), edit.get("order", -1), phase]
	if key == _follow_key:
		return
	_follow_key = key
	if _timeline.schema_version == 3 and role_id == "script" and not phase.is_empty() and _show_script_presentation(phase):
		return
	_hide_script_presentation()
	var screen := "3D" if root is Node3D else "2D"
	EditorInterface.set_main_screen_editor(screen)
	var node_path: String = edit.get("object", edit.get("path", ""))
	var property: String = edit.get("property", "")
	_focus_state = {"screen": screen, "selectedNode": "", "property": "", "resourcePath": "", "scriptPath": "", "scriptPhase": ""}
	if node_path.is_empty():
		return
	var node := root.get_node_or_null(NodePath(node_path))
	if node == null:
		return
	var selection := EditorInterface.get_selection()
	var selected := selection.get_selected_nodes()
	if selected.size() != 1 or selected[0] != node:
		selection.clear()
		selection.add_node(node)
	_focus_state.selectedNode = node_path
	var inspector := EditorInterface.get_inspector()
	if _is_visible_editor_region(inspector) and (role_id == "gui" or not property.is_empty()):
		EditorInterface.inspect_object(node, property, true)
		_focus_state.property = property
	if role_id == "assets" and _is_visible_editor_region(EditorInterface.get_file_system_dock()):
		_focus_state.resourcePath = _select_role_resource(node, property)


func _select_role_resource(node: Node, property: String) -> String:
	for resource_property in [property, "texture", "mesh", "material_override", "label_settings"]:
		if resource_property.is_empty():
			continue
		var resource: Variant = node.get(resource_property)
		if resource is Resource and resource.resource_path.begins_with("res://") and not resource.resource_path.contains("::"):
			EditorInterface.select_file(resource.resource_path)
			return resource.resource_path
	return ""


func _show_script_presentation(phase: String) -> bool:
	if _canonical_script == null or _canonical_source.is_empty():
		return false
	var scripts := EditorInterface.get_script_editor()
	if scripts.get_current_script() != _canonical_script:
		if EditorInterface.get_editor_settings().get_setting("text_editor/external/use_external_editor"):
			return false
		EditorInterface.edit_script(_canonical_script, 1, 1, true)
	if scripts.get_current_script() != _canonical_script:
		return false
	EditorInterface.set_main_screen_editor("Script")
	var current := scripts.get_current_editor()
	var original := current.get_base_editor() as CodeEdit if current != null else null
	if original == null:
		return false
	if not is_instance_valid(_script_presentation) or _script_presentation.get_parent() != original or (phase == "open" and not _script_presentation.text.is_empty()):
		_install_script_presentation(original)
	if phase == "paste" and _script_presentation.text.is_empty():
		_script_presentation.insert_text_at_caret(_canonical_source)
		_script_presentation.set_caret_line(0)
		_script_presentation.set_caret_column(0)
		_script_presentation.scroll_vertical = 0.0
		_paste_count += 1
	_script_presentation.show()
	# Undo belongs to the scene while the code surface is a read-only presentation.
	original.release_focus()
	_focus_state = {"screen": "Script", "selectedNode": "", "property": "", "resourcePath": "", "scriptPath": _canonical_script.resource_path, "scriptPhase": phase}
	return true


func _install_script_presentation(original: CodeEdit) -> void:
	_discard_script_presentation()
	var presentation := CodeEdit.new()
	presentation.name = "PlayForgeScriptPresentation"
	presentation.editable = false
	presentation.focus_mode = Control.FOCUS_NONE
	presentation.mouse_filter = Control.MOUSE_FILTER_STOP
	presentation.z_index = 2
	presentation.gutters_draw_line_numbers = original.gutters_draw_line_numbers
	presentation.add_theme_font_override("font", original.get_theme_font("font"))
	presentation.add_theme_font_size_override("font_size", original.get_theme_font_size("font_size"))
	presentation.add_theme_color_override("font_readonly_color", original.get_theme_color("font_color"))
	var background := original.get_theme_stylebox("normal").duplicate() as StyleBoxFlat
	if background == null:
		background = StyleBoxFlat.new()
		background.bg_color = EditorInterface.get_editor_settings().get_setting("text_editor/theme/highlighting/background_color")
	background.bg_color.a = 1.0
	presentation.add_theme_stylebox_override("read_only", background)
	if original.syntax_highlighter != null:
		presentation.syntax_highlighter = original.syntax_highlighter.duplicate() as SyntaxHighlighter
	original.add_child(presentation)
	presentation.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_script_presentation = presentation


func _hide_script_presentation() -> void:
	if is_instance_valid(_script_presentation):
		_script_presentation.hide()


func _discard_script_presentation() -> void:
	if is_instance_valid(_script_presentation):
		var parent := _script_presentation.get_parent()
		if parent != null:
			parent.remove_child(_script_presentation)
		_script_presentation.queue_free()
	_script_presentation = null


func _on_editor_scene_changed(_scene_root: Node) -> void:
	if _awaiting_auto_start:
		_start_auto_when_ready.call_deferred()
	_on_editor_geometry_changed()
	_mark_replay_scene_unsaved.call_deferred()


func _on_editor_scene_closed(scene_path: String) -> void:
	if scene_path == SceneReplay.SCENE_PATH and _template_replay != null:
		_template_replay.close_scene()
		_marked_scene_versions.erase(_template_replay)
		_template_root = null
		_template_time = 0.0
		_template_history_time = 0.0
		_drag_changed_scene = false
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
	var lead := {}
	if not _panel.has_active_run():
		return cursors
	var base_bounds := _editor_base.get_global_rect()
	if not base_bounds.has_area():
		return cursors
	var roles: Dictionary = _panel.role_states()
	var active_role: String = _panel.active_role
	for role: Dictionary in _timeline.roles:
		var state: Dictionary = roles.get(role.id, {})
		var authored_position: Variant = state.get("position")
		if authored_position is Vector2:
			var region := str(role.get("editorRegion", DEFAULT_REGIONS.get(role.id, "viewport")))
			var point := _editor_cursor_position(region, authored_position, base_bounds)
			var cursor := {
				"id": role.id,
				"label": role.label,
				"color": str(role.get("color", "#90d5ff")),
				"caption": state.text,
				"x": point.x,
				"y": point.y,
				"opacity": 1.0 if active_role.is_empty() or active_role == role.id else 0.30,
			}
			if role.id == active_role:
				lead = cursor
			else:
				cursors.append(cursor)
	if not lead.is_empty():
		cursors.append(lead)
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


func _on_editor_screen_changed(screen: String) -> void:
	_main_screen = screen
	_on_editor_geometry_changed()


func _on_playback_changed(force := false) -> void:
	if not is_instance_valid(_panel):
		return
	if _replay != null and _panel.has_started() and not _apply_replay_frame(_panel.current_snapshot()):
		_panel.interrupt_replay(_replay.error_message)
	if _replay != null:
		_follow_active_role(_panel.current_snapshot())
	if _panel.transition_kind not in ["history", "drag"]:
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
		"activeRole": _panel.active_role,
		"logFilter": _panel.log_filter,
		"visibleLogCount": _panel.visible_log_count(),
		"focus": focus_diagnostics(),
		"replay": replay_diagnostics(),
	}
	JavaScriptBridge.eval("window.__playforgeShowcaseState = " + JSON.stringify(state) + "; window.__playforgeShowcaseChanged?.(window.__playforgeShowcaseState);", true)


func _apply_replay_frame(snapshot: Dictionary) -> bool:
	var target: float = snapshot.time
	var kind: String = _panel.transition_kind
	if kind == "clock" and not _record_crossed_edit_groups(snapshot):
		return false
	var previous_version: int = _replay.scene_edit_version
	if not _replay.apply_snapshot(snapshot):
		return false
	var changed_scene: bool = _replay.scene_edit_version != previous_version
	match kind:
		"restart", "seek":
			var previous: float = _template_time if kind == "restart" else _panel.transition_start
			if not is_equal_approx(previous, target):
				_record_template_action("제작 시연 위치 이동", previous, target, changed_scene or _drag_changed_scene)
				_template_history_time = target
			elif _drag_changed_scene and not changed_scene:
				_marked_scene_versions[_replay] = _replay.scene_edit_version
			_drag_changed_scene = false
		"drag":
			_drag_changed_scene = _drag_changed_scene or changed_scene
		"history":
			_template_history_time = target
			_marked_scene_versions[_replay] = _replay.scene_edit_version
	_template_time = target
	return true


func _record_crossed_edit_groups(snapshot: Dictionary) -> bool:
	var index: int = _timeline.cue_count_at(_template_time)
	while index < int(snapshot.revision):
		var boundary: float = _timeline.cue_at(index).at
		var end: int = _timeline.cue_count_at(boundary)
		var edited := false
		for cursor in range(index, end):
			if _timeline.cue_at(cursor).action != "point":
				edited = true
				break
		if edited:
			if not _replay.apply_snapshot(_timeline.evaluate(boundary)):
				return false
			_record_template_action("제작 시연 %.2f초" % boundary, _template_history_time, boundary, true)
			_template_history_time = boundary
			_template_time = boundary
		index = end
	return true


func _record_template_action(label: String, before: float, after: float, changed_scene: bool) -> void:
	var root: Node = _template_root.get_ref() if _template_root != null else null
	if root == null:
		return
	var history := EditorInterface.get_editor_undo_redo()
	var context: Object = root
	if EditorInterface.get_edited_scene_root() != root:
		if _template_undo_context == null:
			_template_undo_context = Resource.new()
			_template_undo_context.resource_path = SceneReplay.SCENE_PATH + "::PlayForge_Showcase_History"
		context = _template_undo_context
	if history.get_object_history_id(context) <= 0 or history.is_committing_action():
		return
	history.create_action(label, UndoRedo.MERGE_DISABLE, context, false, changed_scene)
	history.add_do_method(self, &"_restore_template_history", _template_root, after)
	history.add_undo_method(self, &"_restore_template_history", _template_root, before)
	history.commit_action(false)
	_marked_scene_versions[_replay] = _replay.scene_edit_version


func _restore_template_history(root_reference: WeakRef, time: float) -> void:
	var root: Node = root_reference.get_ref()
	if _template_replay == null or not _template_replay.owns_scene(root):
		return
	if _timeline == _template_timeline:
		_panel.apply_editor_history_time(time)
	elif _template_replay.apply_snapshot(_template_timeline.evaluate(time)):
		_template_time = time
		_template_history_time = time
		_marked_scene_versions[_template_replay] = _template_replay.scene_edit_version


func _mark_replay_scene_unsaved() -> void:
	if _replay != null and _replay.scene_edit_version != _marked_scene_versions.get(_replay, 0) and _replay.owns_scene(EditorInterface.get_edited_scene_root()):
		_marked_scene_versions[_replay] = _replay.scene_edit_version
		EditorInterface.mark_scene_as_unsaved()
