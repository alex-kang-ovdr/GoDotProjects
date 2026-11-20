@tool
extends EditorPlugin

signal store_import_changed(receipt: Dictionary)

const Timeline := preload("showcase_timeline.gd")
const ShowcasePanel := preload("showcase_panel.gd")
const PreviewCanvas := preload("showcase_canvas.gd")
const SceneReplay := preload("showcase_scene_replay.gd")
const EditorTargets := preload("showcase_targets.gd")
const Feedback := preload("showcase_feedback.gd")
const Gestures := preload("showcase_gestures.gd")
const AssetImporter := preload("showcase_import.gd")
const AssetStore := preload("showcase_store.gd")
const GameLaunch := preload("showcase_game_launch.gd")
const CURSOR_IDLE_MS := 5000
const TARGET_LEAD_SECONDS := 0.18
const START_MENU_ITEM := "AgentReplay 재생"
const AGENT_MENU_ITEM := "AgentReplay AI 기록 재생"
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
var _imports := AssetImporter.new()
var _store := AssetStore.new()
var _game := GameLaunch.new()
var _game_status := {}
var _source_ready := false
var _awaited_pack := ""
var _role_activity := {}
var _agent_timeline: RefCounted
var _agent_replay: RefCounted
var _agent_scene_path := ""
var _panel: Control
var _dock: EditorDock
var _editor_base: Control
var _cursor_overlay: Control
var _floating_cursor_overlays := {}
var _editor_regions: Dictionary = {}
var _region_trees: Dictionary = {}
var _targets := EditorTargets.new()
var _feedback := Feedback.new()
var _gestures := Gestures.new()
var _failed_cursors: Array[Dictionary] = []
var _last_published_cursors: Array[Dictionary] = []
var _geometry_elapsed := 0.0
var _web_window: JavaScriptObject
var _start_callback: JavaScriptObject
var _open_store_callback: JavaScriptObject
var _web_last_publish := 0
var _web_last_playing := false
var _awaiting_auto_start := false
var _reselect_scene_queued := false
var _opened_initial_screen := false
var _marked_scene_versions := {}
var _template_root: WeakRef
var _template_undo_context: Resource
var _template_time := 0.0
var _template_history_time := 0.0
var _drag_changed_scene := false
var _follow_key: Array = []
var _focus_state := {}
var _follow_window_id := 0
var _main_screen := ""
var _canonical_script: Script
var _canonical_source := ""
var _script_presentation: CodeEdit
var _paste_count := 0


func _enter_tree() -> void:
	add_to_group(&"playforge_replay_player")
	add_to_group(&"playforge_showcase_player")
	_editor_base = EditorInterface.get_base_control()
	_targets.configure(_editor_base)
	_feedback.configure()
	add_child(_imports)
	_store.configure(_imports)
	_editor_base.add_child(_store)
	add_tool_menu_item(AssetStore.TITLE, open_asset_store)
	_store.view_changed.connect(_on_store_view_changed)
	_imports.changed.connect(_forward_store_receipt)
	_imports.changed.connect(_on_import_changed, CONNECT_DEFERRED)
	set_process(false)
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
				_template_replay.configure(template.original_steps(), not template.bootstrap_files.is_empty())
				_template_replay.import_requested.connect(_request_replay_import)
			_activate_session(template, _template_replay, SceneReplay.SCENE_PATH)
			add_tool_menu_item(START_MENU_ITEM, _start_template_showcase)
		else:
			push_warning("PlayForge Showcase: " + template.error_message)
	if OS.has_feature("web"):
		_install_web_bridge()


func _exit_tree() -> void:
	_game.stop()
	if is_instance_valid(_script_presentation):
		_script_presentation.queue_free()
	if _web_window != null:
		_web_window["__playforgeStartShowcase"] = null
		_web_window["__playforgeOpenAssetStore"] = null
		_web_window["__playforgeAssetStoreState"] = null
		JavaScriptBridge.eval("window.__playforgeShowcaseState = null; window.__playforgeShowcaseChanged?.(null);", true)
		_start_callback = null
		_open_store_callback = null
		_web_window = null
	if is_instance_valid(_editor_base):
		_editor_base.resized.disconnect(_on_editor_geometry_changed)
	main_screen_changed.disconnect(_on_editor_screen_changed)
	scene_changed.disconnect(_on_editor_scene_changed)
	scene_closed.disconnect(_on_editor_scene_closed)
	remove_tool_menu_item(AssetStore.TITLE)
	if is_instance_valid(_store):
		_store.hide()
		_store.queue_free()
	if _template_timeline != null:
		remove_tool_menu_item(START_MENU_ITEM)
	if _agent_timeline != null:
		remove_tool_menu_item(AGENT_MENU_ITEM)
	if _agent_replay != null and _agent_replay.has_method(&"close_scene"):
		_agent_replay.close_scene()
	if is_instance_valid(_cursor_overlay):
		_cursor_overlay.hide()
		_cursor_overlay.queue_free()
		_cursor_overlay = null
	for window_id in _floating_cursor_overlays.keys():
		_remove_floating_cursor_overlay(window_id)
	if _dock != null:
		_panel.visibility_changed.disconnect(_on_editor_geometry_changed)
		_panel.playback_changed.disconnect(_on_playback_changed)
		remove_dock(_dock)
		_dock.queue_free()
		_dock = null
		_panel = null


func _activate_session(timeline: RefCounted, replay: RefCounted, scene_path: String) -> void:
	_stop_showcase_game()
	_role_activity.clear()
	_failed_cursors.clear()
	_gestures.clear()
	_store.present_pack("")
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
		_dock.name = "AgentReplay"
		_dock.title = "AgentReplay"
		_dock.layout_key = "agent_replay"
		_dock.default_slot = EditorDock.DOCK_SLOT_RIGHT_UR
		_dock.available_layouts = EditorDock.DOCK_LAYOUT_VERTICAL | EditorDock.DOCK_LAYOUT_HORIZONTAL | EditorDock.DOCK_LAYOUT_FLOATING
		_dock.icon_name = &"AnimationPlayer"
		if not OS.has_feature("web") or int(JavaScriptBridge.eval("window.parent === window ? 1 : 0", true)) == 1:
			_install_cursor_overlay()
	_panel = ShowcasePanel.new()
	_panel.configure(_timeline, _prepare_scene_replay if _replay != null else Callable(), _limit_to_import if not timeline.bootstrap_files.is_empty() else Callable())
	_panel.store_requested.connect(open_asset_store)
	_dock.add_child(_panel)
	if new_dock:
		add_dock(_dock)
	_panel.playback_changed.connect(_on_playback_changed)
	_panel.visibility_changed.connect(_on_editor_geometry_changed)
	_on_playback_changed(true)


func play_agent_recording(recording: Dictionary, replay: RefCounted, scene_path: String) -> bool:
	var root := EditorInterface.get_edited_scene_root()
	if replay == null or root == null or scene_path.is_empty() or scene_path == SceneReplay.SCENE_PATH or root.scene_file_path != scene_path:
		return false
	var timeline := Timeline.new()
	if not timeline.load_data(recording) or timeline.schema_version != 4:
		return false
	if _agent_timeline == null:
		add_tool_menu_item(AGENT_MENU_ITEM, _start_last_agent_recording)
	if _agent_replay != null:
		if _agent_replay.has_method(&"close_scene"):
			_agent_replay.close_scene()
		_marked_scene_versions.erase(_agent_replay)
	_agent_timeline = timeline
	_agent_replay = replay
	_agent_scene_path = scene_path
	_activate_session(_agent_timeline, _agent_replay, _agent_scene_path)
	_start_showcase()
	return _panel.has_started()


func _start_template_showcase() -> void:
	if _should_delegate_authored_showcase() and _delegate_authored_showcase():
		return
	if _timeline != _template_timeline:
		_activate_session(_template_timeline, _template_replay, SceneReplay.SCENE_PATH)
	_open_session_scene()


func _has_custom_authored_scene() -> bool:
	var dir := DirAccess.open("res://scenes")
	if dir == null:
		return false
	for file_name in dir.get_files():
		if file_name.ends_with(".tscn") and file_name != "main.tscn":
			return true
	return false


func _should_delegate_authored_showcase() -> bool:
	if _has_custom_authored_scene():
		return true
	if _template_replay != null and _template_replay.has_scene():
		return false
	var root := EditorInterface.get_edited_scene_root()
	if root != null and root.scene_file_path == SceneReplay.SCENE_PATH:
		if root.name != SceneReplay.ROOT_NAME or root.get_child_count() != 0 or root.get_script() != null:
			return true
	return false


func _delegate_authored_showcase() -> bool:
	var chat := get_tree().get_first_node_in_group(&"playforge_agent_chat")
	if chat != null and chat.has_method(&"play_recording"):
		chat.call(&"play_recording")
		return _timeline == _agent_timeline and is_instance_valid(_panel) and _panel.has_started()
	return false


func _start_last_agent_recording() -> void:
	if _timeline != _agent_timeline:
		_activate_session(_agent_timeline, _agent_replay, _agent_scene_path)
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
	_stop_showcase_game()
	_role_activity.clear()
	_failed_cursors.clear()
	_gestures.clear()
	_feedback.restart()
	var root := EditorInterface.get_edited_scene_root()
	if not _replay.claim(root) or (_timeline.schema_version != 3 and not _replay.reset()):
		_panel.interrupt_replay(_replay.error_message)
		return false
	if _timeline.schema_version == 3 and _replay.owns_scene(root):
		_template_root = weakref(root)
		_source_ready = _timeline.bootstrap_files.is_empty()
		_awaited_pack = ""
		_imports.begin_run()
		_store.refresh_receipt()
	_panel.show_replay_status("")
	_follow_key.clear()
	_focus_state.clear()
	_paste_count = 0
	_discard_script_presentation()
	if _timeline.schema_version == 4:
		_canonical_script = null
		_canonical_source = ""
	if _timeline.schema_version == 3 and _source_ready:
		_cache_original_script()
	if not _opened_initial_screen:
		_opened_initial_screen = true
		EditorInterface.set_main_screen_editor("3D" if root is Node3D else "2D")
	return true


func import_diagnostics() -> Dictionary:
	return _imports.receipt.duplicate() if _timeline == _template_timeline else {}


func open_asset_store() -> void:
	_store.open_manual()


func import_store_pack(pack_id: String, dry_run := false) -> Dictionary:
	if dry_run:
		return _store.preview_pack(pack_id)
	return _store.import_pack(pack_id, true)


func _forward_store_receipt() -> void:
	store_import_changed.emit(_store.current_receipt())


func store_diagnostics() -> Dictionary:
	var state := _store.diagnostics()
	if is_instance_valid(_panel):
		state.openRect = _store.normalized_rect(_panel.store_button())
	return state


func _request_replay_import(files: Array, staged: Array, pack_id: String) -> void:
	_awaited_pack = pack_id
	if pack_id.is_empty():
		_imports.request(files, staged)
	else:
		var receipt := _store.import_pack(pack_id, false, files, staged)
		if receipt.get("state") == "busy" and _store.current_receipt().get("packId") != pack_id:
			_replay.error_message = receipt.message
			_panel.interrupt_replay(receipt.message)
		elif _imports.receipt.get("state") in ["done", "error"]:
			_on_import_changed.call_deferred()


func _sync_store(snapshot: Dictionary) -> void:
	var pack := ""
	if _timeline == _template_timeline and _timeline.schema_version == 3 and _panel.has_active_run() and _panel.active_role in ["", "assets"] and snapshot.createdOrder.is_empty():
		var assets: Dictionary = snapshot.roles.get("assets", {})
		pack = str(assets.get("cue", {}).get("storePack", ""))
	_store.present_pack(pack)


func _on_store_view_changed() -> void:
	if _web_window != null:
		_publish_store.call_deferred()
	_refresh_visuals.call_deferred(true)


func _publish_store() -> void:
	if _web_window != null and is_instance_valid(_store):
		JavaScriptBridge.eval("window.__playforgeAssetStoreState = " + JSON.stringify(store_diagnostics()), true)


func _on_import_changed() -> void:
	_publish_store()
	if not is_instance_valid(_panel) or _timeline != _template_timeline or _imports.receipt.is_empty():
		return
	if not _source_ready and not _awaited_pack.is_empty() and _panel.has_started() and _store.current_receipt().get("packId") == _awaited_pack:
		if _imports.receipt.state == "error":
			_panel.interrupt_replay(_imports.receipt.message)
			_refresh_visuals(true)
			return
		if _imports.receipt.state == "done":
			if not _imports.materialize_bootstrap(_timeline.bootstrap_files) or not _replay.prepare_original():
				_panel.interrupt_replay(_replay.error_message if not _replay.error_message.is_empty() else "시연 원본 파일을 준비하지 못했습니다.")
				_refresh_visuals(true)
				return
			_source_ready = true
			_cache_original_script()
			_panel.resume_deferred_seek()
	if _replay.error_message.is_empty():
		_panel.show_replay_status(_imports.receipt.message)
	var snapshot: Dictionary = _panel.current_snapshot()
	if not _panel.active_role.is_empty() and snapshot.roles[_panel.active_role].cue.get("action") == "import":
		_follow_active_role(snapshot)
	_refresh_visuals(true)


func _limit_to_import(requested: float) -> float:
	return requested if _source_ready else minf(requested, _timeline.import_at)


func _stop_showcase_game() -> void:
	_game.stop()
	_game_status.clear()


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
	if not role_id.is_empty() and _panel.has_active_run() and not _replay.owns_scene(root):
		if not _reselect_scene_queued and _scene_path in EditorInterface.get_open_scenes():
			var last: Dictionary = _role_activity.get(role_id, {})
			var order: int = snapshot.roles[role_id].cue.get("order", -1)
			if last.is_empty() or last.activity[0] != order or Time.get_ticks_msec() - int(last.at) < CURSOR_IDLE_MS:
				_reselect_scene_queued = true
				_reselect_followed_scene.call_deferred()
	if role_id.is_empty() or not _panel.has_started() or not _replay.owns_scene(root):
		_follow_window_id = 0
		_follow_key.clear()
		_focus_state.clear()
		_hide_script_presentation()
		_panel.show_action_result("", "")
		return
	var role: Dictionary = snapshot.roles[role_id]
	var cue: Dictionary = role.cue
	var edit: Dictionary = role.edit
	var upcoming := _upcoming_target(role_id, snapshot, cue)
	var key := [role_id, cue.get("order", -1), upcoming.get("order", -1), _panel.has_active_run()]
	if cue.get("action") == "import":
		key.append(_imports.receipt.get("state"))
	if key == _follow_key:
		if _panel.has_active_run() and not _focus_state.is_empty():
			_restore_follow_view(root)
		return
	_follow_key = key
	_focus_state = {}
	if _panel.has_active_run():
		_focus_editor(root, role_id, role, upcoming)
		_focus_state.previewing = not upcoming.is_empty()
	else:
		_hide_script_presentation()
	_present_action_result(root, cue, edit)


func _reselect_followed_scene() -> void:
	_reselect_scene_queued = false
	if not is_instance_valid(_panel) or _panel.active_role.is_empty() or not _panel.has_active_run():
		return
	if _replay != null and not _replay.owns_scene(EditorInterface.get_edited_scene_root()) and _scene_path in EditorInterface.get_open_scenes():
		EditorInterface.open_scene_from_path(_scene_path)


func _upcoming_target(role_id: String, snapshot: Dictionary, current: Dictionary) -> Dictionary:
	# A short part of the existing interval previews the control. The edit clock never waits for it.
	var now: float = snapshot.time
	var count: int = _timeline.cue_count_at(now + TARGET_LEAD_SECONDS)
	for index in range(int(snapshot.revision), count):
		var next: Dictionary = _timeline.cue_at(index)
		if next.role != role_id:
			continue
		var gap: float = next.at - float(current.get("at", 0.0))
		if next.at - now <= gap * 0.45 and (next.action in ["add", "set"] or next.get("scriptPhase") == "open"):
			return next
		break
	return {}


func _focus_editor(root: Node, role_id: String, role: Dictionary, upcoming: Dictionary) -> void:
	_targets.request_reveal()
	var phase: String = role.scriptPhase
	if upcoming.is_empty() and _timeline.schema_version in [3, 4] and role_id == "script" and not phase.is_empty() and _show_script_presentation(phase, str(role.cue.get("scriptPath", ""))):
		return
	_hide_script_presentation()
	var screen := "3D" if root is Node3D else "2D"
	if screen != _main_screen:
		EditorInterface.set_main_screen_editor(screen)
	_focus_state = {"screen": screen, "selectedNode": "", "property": "", "resourcePath": "", "scriptPath": "", "scriptPhase": ""}
	var step: Dictionary = role.edit if upcoming.is_empty() else upcoming
	if upcoming.is_empty() and role.cue.get("action") == "point" and role.cue.has("storePack"):
		_focus_state.storePack = role.cue.storePack
		return
	if upcoming.is_empty() and role.cue.get("action") == "import":
		if _imports.receipt.get("state") == "done":
			var texture := ResourceLoader.load("res://" + str(role.cue.files[0]), "Texture2D")
			if texture != null:
				_edit_asset(texture, "texture")
		return
	if upcoming.is_empty() and role.cue.has("assetNode") and _timeline.schema_version == 3:
		var asset: Resource = _replay.source_asset(role.cue.assetNode, role.cue.assetProperty)
		if asset != null:
			_edit_asset(asset, role.cue.assetProperty)
			return
	if not upcoming.is_empty():
		if step.action == "add":
			_focus_state.targetButton = "add_node"
			_follow_dock("scene")
			return
		if step.get("scriptPhase") == "open":
			_focus_state.targetButton = "Script"
			return
	var node_path: String = step.get("object", "")
	if node_path.is_empty():
		var region: String = DEFAULT_REGIONS.get(role_id, "")
		if region in ["inspector", "scene", "filesystem"]:
			_follow_dock(region)
		elif region == "viewport":
			_focus_state.dock = region
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
	var property: String = step.get("property", "")
	_focus_state.property = property
	if role_id == "assets" and upcoming.is_empty() and _open_asset(node, property):
		return
	_follow_dock("inspector" if not property.is_empty() else "scene")
	if EditorInterface.get_inspector().is_visible_in_tree():
		EditorInterface.inspect_object(node, property, true)


func _follow_dock(region: String) -> void:
	_focus_state.dock = region
	var control := _editor_regions.get(region) as Control
	if not is_instance_valid(control) or not control.is_inside_tree():
		return
	var dock: Node = control
	while dock != null and not dock is EditorDock:
		dock = dock.get_parent()
	if dock is EditorDock and not control.is_visible_in_tree():
		if EditorInterface.distraction_free_mode and dock.get_window() == _editor_base.get_window():
			EditorInterface.distraction_free_mode = false
		dock.make_visible()
		# An inner inspector can also be hidden separately from its dock.
		if control != dock and dock.is_visible_in_tree() and not control.visible:
			control.show()
		_targets.request_reveal()
	_follow_window(control)


func _follow_window(control: Control) -> void:
	var window := control.get_window()
	if window == null:
		return
	if window != _editor_base.get_window():
		var minimized := window.mode == Window.MODE_MINIMIZED
		if minimized:
			window.mode = Window.MODE_WINDOWED
		if not window.visible:
			window.show()
		if minimized or window.get_instance_id() != _follow_window_id:
			window.grab_focus()
	_follow_window_id = window.get_instance_id()


func _restore_follow_view(root: Node) -> void:
	# Geometry and tab changes do not consume a cue, reset Idle, or add undo history.
	var activity: Dictionary = _role_activity.get(_panel.active_role, {})
	if not activity.is_empty() and Time.get_ticks_msec() - int(activity.at) >= CURSOR_IDLE_MS:
		return
	var screen: String = _focus_state.get("screen", "")
	if screen == "Script":
		var scripts := EditorInterface.get_script_editor()
		if scripts.get_current_script() != _canonical_script or not is_instance_valid(_script_presentation) or not _script_presentation.is_visible_in_tree():
			_show_script_presentation(_focus_state.scriptPhase, str(_focus_state.get("scriptPath", "")))
		if is_instance_valid(_script_presentation):
			_follow_window(_script_presentation)
	elif not screen.is_empty() and screen != _main_screen:
		EditorInterface.set_main_screen_editor(screen)
	var region: String = _focus_state.get("dock", "")
	if region.is_empty():
		return
	_follow_dock(region)
	if region == "filesystem" and not str(_focus_state.get("resourcePath", "")).is_empty() and _focus_state.resourcePath not in EditorInterface.get_selected_paths():
		EditorInterface.select_file(_focus_state.resourcePath)
	if region == "inspector" and not str(_focus_state.get("property", "")).is_empty() and not _focus_state.get("inspectorResource", false):
		var node := root.get_node_or_null(NodePath(_focus_state.selectedNode))
		if node != null and EditorInterface.get_inspector().get_edited_object() != node:
			EditorInterface.inspect_object(node, _focus_state.property, true)


func _open_asset(node: Node, property: String) -> bool:
	# An asset-role transform still edits the node. Only resource edits open a resource editor.
	var properties: Array = ["texture", "mesh", "material_override", "label_settings"] if property.is_empty() else [property]
	for name: String in properties:
		if name not in node:
			continue
		var value: Variant = node.get(name)
		if not value is Resource:
			continue
		var resource: Resource = value
		_edit_asset(resource, name)
		return true
	return false


func _edit_asset(resource: Resource, property: String) -> void:
	var external := resource.resource_path.begins_with("res://") and not resource.resource_path.contains("::")
	_follow_dock("filesystem" if external else "inspector")
	if external:
		_focus_state.resourcePath = resource.resource_path
		EditorInterface.select_file(resource.resource_path)
	if EditorInterface.get_inspector().is_visible_in_tree():
		EditorInterface.edit_resource(resource)
		_focus_state.inspectorResource = true
		_focus_state.inspectorResourceId = resource.get_instance_id()
		_focus_state.resourceProperty = property


func _present_action_result(root: Node, cue: Dictionary, edit: Dictionary) -> void:
	var target: String = edit.get("object", "")
	var result := ""
	var node := root.get_node_or_null(NodePath(target)) if not target.is_empty() else null
	var property: String = edit.get("property", "")
	if cue.get("action") == "point" and cue.has("storePack"):
		target = AssetStore.TITLE
		result = _store.pack_title(cue.storePack)
	elif cue.get("action") == "import":
		target = ", ".join(cue.files)
		result = _imports.receipt.get("message", "")
	elif cue.has("assetNode") and _focus_state.get("inspectorResource", false):
		var asset := EditorInterface.get_inspector().get_edited_object() as Resource
		if asset != null and asset.get_instance_id() == _focus_state.inspectorResourceId:
			target = asset.resource_path.get_file() if not asset.resource_path.is_empty() else asset.get_class()
			result = "%s 열림" % asset.get_class()
	elif cue.has("scriptPhase"):
		if is_instance_valid(_script_presentation) and _script_presentation.is_visible_in_tree() and _canonical_script != null:
			target = _canonical_script.resource_path
			result = "파일 열림" if cue.scriptPhase == "open" else "%d줄 붙여넣기" % _script_presentation.get_line_count()
	elif not edit.is_empty():
		match edit.action:
			"add":
				if node != null:
					result = "%s 생성" % node.get_class()
			"delete":
				result = "노드 삭제"
			"rename":
				result = "%s 이름 변경" % str(edit.get("value", ""))
			"clear":
				result = "빈 맵 초기화"
			"set", "revert":
				if node != null and not property.is_empty() and property in node:
					target += " · " + property
					result = _format_result(node.get(property))
				elif edit.action == "revert" and node == null:
					result = "노드 추가 취소"
			"finish":
				var script := root.get_script() as Script
				target = str(root.name)
				if script != null:
					result = "%s 연결" % script.resource_path.get_file()
	_focus_state.resultTarget = target
	_focus_state.result = result
	_panel.show_action_result(target, result)


func _format_result(value: Variant) -> String:
	if value is Resource:
		return value.resource_path if not value.resource_path.is_empty() else value.get_class()
	if value is String:
		return '"%s"' % value
	if value is Color:
		return "#" + value.to_html()
	if value is Array or value is PackedVector2Array or value is PackedVector3Array:
		return "%d개 항목" % value.size()
	return str(value)


func _show_script_presentation(phase: String, script_path: String = "") -> bool:
	if not script_path.is_empty() and (_canonical_script == null or _canonical_script.resource_path != script_path) and FileAccess.file_exists(script_path):
		var loaded := ResourceLoader.load(script_path, "Script") as Script
		if loaded != null:
			_canonical_script = loaded
			_canonical_source = FileAccess.get_file_as_string(script_path).replace("\r\n", "\n")
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
	_follow_window(_script_presentation)
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
		_stop_showcase_game()
		_template_replay.close_scene()
		_marked_scene_versions.erase(_template_replay)
		_template_root = null
		_template_time = 0.0
		_template_history_time = 0.0
		_drag_changed_scene = false
	if scene_path == _agent_scene_path and _agent_replay != null:
		_agent_replay.close_scene()
		_marked_scene_versions.erase(_agent_replay)
	if scene_path == _scene_path and _replay != null:
		_panel.interrupt_replay("시연 장면이 닫혔습니다.")
		_on_playback_changed(true)


func _start_auto_when_ready() -> void:
	if not _awaiting_auto_start or not is_instance_valid(_panel):
		return
	var scene := EditorInterface.get_edited_scene_root()
	if scene == null:
		return
	if _should_delegate_authored_showcase() and _delegate_authored_showcase():
		_awaiting_auto_start = false
		return
	if _replay != null and scene.scene_file_path != _scene_path:
		return
	_awaiting_auto_start = false
	_start_showcase()


func _install_cursor_overlay() -> void:
	_cursor_overlay = _new_cursor_overlay(_editor_base)


func _new_cursor_overlay(parent: Node) -> Control:
	var overlay := PreviewCanvas.EditorCursorOverlay.new()
	overlay.name = "PlayForgeShowcaseCursors"
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.z_index = 100
	overlay.hide()
	parent.add_child(overlay)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.resized.connect(overlay.queue_redraw)
	return overlay


func _remove_floating_cursor_overlay(window_id: int) -> void:
	var overlay: Variant = _floating_cursor_overlays.get(window_id)
	_floating_cursor_overlays.erase(window_id)
	if is_instance_valid(overlay):
		overlay.hide()
		overlay.get_parent().queue_free()


func _present_editor_cursors(cursors: Array[Dictionary]) -> void:
	var main: Array[Dictionary] = []
	var floating := {}
	for cursor in cursors:
		var window_id: int = cursor.get("window_id", 0)
		if window_id == 0:
			main.append(cursor)
		else:
			if not floating.has(window_id):
				var group: Array[Dictionary] = []
				floating[window_id] = group
			floating[window_id].append(cursor)
	_cursor_overlay.present(main)
	for window_id in _floating_cursor_overlays.keys():
		if not floating.has(window_id):
			_remove_floating_cursor_overlay(window_id)
	for window_id in floating:
		var window := instance_from_id(window_id) as Window
		if not is_instance_valid(window) or not window.is_inside_tree() or not window.visible:
			_remove_floating_cursor_overlay(window_id)
			continue
		var overlay: Variant = _floating_cursor_overlays.get(window_id)
		if not is_instance_valid(overlay):
			var layer := CanvasLayer.new()
			layer.layer = 100
			window.add_child(layer)
			overlay = _new_cursor_overlay(layer)
			_floating_cursor_overlays[window_id] = overlay
		overlay.present(floating[window_id])


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


func track_drag_gesture(role: String, origin: Control, destination: Control, verify_drop: Callable) -> bool:
	return is_instance_valid(_panel) and _panel.has_active_run() and _panel.role_states().has(role) and _gestures.track_drag(role, origin, destination, verify_drop)


func track_wire_gesture(role: String, graph: GraphEdit, origin: GraphNode, output: int, destination: GraphNode, input: int) -> bool:
	return is_instance_valid(_panel) and _panel.has_active_run() and _panel.role_states().has(role) and _gestures.track_wire(role, graph, origin, output, destination, input)


func cancel_role_gesture(role: String) -> void:
	_gestures.cancel(role)


func _active_role_cursors(now := -1) -> Array[Dictionary]:
	var cursors: Array[Dictionary] = []
	var lead := {}
	if now < 0:
		now = Time.get_ticks_msec()
	if not _panel.has_active_run():
		for cursor in _failed_cursors:
			if cursor.effect.phase == "failure" and _role_is_idle(cursor.id, ["failure", cursor.effect.eventId], now):
				_park_idle_cursor(cursor)
		return _failed_cursors
	var base_bounds := _editor_base.get_global_rect()
	if not base_bounds.has_area():
		return cursors
	var roles: Dictionary = _panel.role_states()
	var active_role: String = _panel.active_role
	for role: Dictionary in _timeline.roles:
		var state: Dictionary = roles.get(role.id, {})
		var authored_position: Variant = state.get("position")
		if authored_position is Vector2 or role.id == active_role:
			var region := str(role.get("editorRegion", DEFAULT_REGIONS.get(role.id, "viewport")))
			var point := Vector2.ZERO
			var target := {}
			var store_target := {}
			var cursor_bounds := base_bounds
			var window_id := 0
			if role.id == "assets" and state.cue.has("storePack") and (role.id == active_role or active_role.is_empty()):
				store_target = _store.target(state.cue.storePack, state.cue.action)
			if role.id == active_role:
				if _focus_state.is_empty():
					continue
				target = store_target
				if target.is_empty():
					target = _targets.resolve(_focus_state, EditorInterface.get_edited_scene_root(), _script_presentation)
				if target.is_empty():
					# Park on the visible role selector without highlighting an unrelated editor control.
					var selector: Control = _panel.active_role_control()
					var anchor := _targets.control_geometry(selector)
					if anchor.is_empty():
						continue
					cursor_bounds = anchor.bounds
					window_id = anchor.window_id
					var rect: Rect2 = anchor.rect
					point = (rect.get_center() - cursor_bounds.position) / cursor_bounds.size
				else:
					var bounds: Rect2 = target.rect
					cursor_bounds = target.get("bounds", base_bounds)
					window_id = target.get("window_id", 0)
					point = (bounds.get_center() - cursor_bounds.position) / cursor_bounds.size
			elif not store_target.is_empty():
				var rect: Rect2 = store_target.rect
				point = (rect.get_center() - base_bounds.position) / base_bounds.size
			else:
				var geometry := _targets.control_geometry(_editor_regions.get(region))
				if not geometry.is_empty() and geometry.window_id != 0:
					cursor_bounds = geometry.bounds
					window_id = geometry.window_id
					var rect: Rect2 = geometry.rect
					var relative: Vector2 = (authored_position / _timeline.viewport_size).clamp(Vector2.ZERO, Vector2.ONE)
					var inset := Vector2(0.12, 0.13) + relative * Vector2(0.76, 0.74)
					point = (rect.position + rect.size * inset - cursor_bounds.position) / cursor_bounds.size
				else:
					point = _editor_cursor_position(region, authored_position, base_bounds)
			var tracked: bool = role.id == active_role
			var cursor := {
				"id": role.id,
				"label": role.label,
				"color": str(role.get("color", "#90d5ff")),
				"caption": state.text,
				"x": point.x,
				"y": point.y,
				"opacity": 1.0,
				"main": tracked,
				"scale": 1.5 if tracked else 1.0,
			}
			var applied: Dictionary = _replay.role_results.get(role.id, {}) if _replay != null and "role_results" in _replay else {}
			var gesture: Dictionary = _gestures.sample(role.id, _editor_base)
			if gesture.is_empty() and state.cue.get("gesture") == "drag" and applied.get("order") == state.cue.order:
				gesture = _feedback.scene_drag(state.cue, applied, EditorInterface.get_edited_scene_root(), _editor_base, _main_screen)
			var upcoming: bool = tracked and _focus_state.get("previewing", false)
			cursor.effect = _feedback.describe(role.id, state.cue, applied, _imports.receipt, not target.is_empty() or not store_target.is_empty(), tracked, upcoming, gesture)
			var activity := [state.cue.get("order", -1), _follow_key[2] if upcoming else -1]
			if state.cue.get("action") == "import":
				activity.append_array([_imports.receipt.get("state"), _imports.receipt.get("count")])
			if not gesture.is_empty():
				activity.append_array([gesture.get("eventId"), gesture.get("phase"), gesture.get("completed")])
			if _role_is_idle(role.id, activity, now):
				_park_idle_cursor(cursor)
				target = {}
			if cursor.effect.phase in ["hidden", "drag", "wire"]:
				target = {}
			if window_id != 0 and cursor.effect.phase not in ["drag", "wire"]:
				cursor.window_id = window_id
			if tracked:
				if not target.is_empty():
					var rect: Rect2 = target.rect
					var origin := (rect.position - cursor_bounds.position) / cursor_bounds.size
					var extent := rect.size / cursor_bounds.size
					cursor.target = {"kind": target.kind, "label": target.label, "x": origin.x, "y": origin.y, "w": extent.x, "h": extent.y}
				lead = cursor
			else:
				cursors.append(cursor)
	if not lead.is_empty():
		cursors.append(lead)
	return cursors


func _role_is_idle(id: String, activity: Array, now: int) -> bool:
	var last: Dictionary = _role_activity.get(id, {})
	var awaiting_first_action := activity == [-1, -1]
	if last.get("activity") != activity:
		_role_activity[id] = {"activity": activity, "at": now}
		return awaiting_first_action
	return awaiting_first_action or now - int(last.at) >= CURSOR_IDLE_MS


func _park_idle_cursor(cursor: Dictionary) -> void:
	cursor.caption = ""
	cursor.effect = {"phase": "idle"}
	cursor.erase("target")


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
	_open_store_callback = JavaScriptBridge.create_callback(func(_arguments: Array): open_asset_store())
	_web_window["__playforgeOpenAssetStore"] = _open_store_callback
	_web_window["__playforgeStartShowcase"] = _start_callback
	_publish_store()
	_on_playback_changed(true)
	if _web_window["__playforgeShowcaseAutoStart"] == true:
		_web_window["__playforgeShowcaseAutoStart"] = false
		_awaiting_auto_start = true
		# Open the dock once the actual edit scene is available, before starting the clock.
		get_tree().process_frame.connect(_start_auto_when_ready, CONNECT_ONE_SHOT | CONNECT_DEFERRED)


func _on_web_start(_arguments: Array) -> void:
	_open_session_scene.call_deferred()


func _on_editor_geometry_changed() -> void:
	if _store.visible:
		_publish_store.call_deferred()
	_refresh_visuals.call_deferred(true)


func _on_editor_screen_changed(screen: String) -> void:
	_main_screen = screen
	_on_editor_geometry_changed()


func _on_playback_changed(force := false) -> void:
	if not is_instance_valid(_panel):
		return
	if _replay != null and _panel.has_started() and not _apply_replay_frame(_panel.current_snapshot()):
		var snapshot: Dictionary = _panel.current_snapshot()
		var index := maxi(0, int(snapshot.revision) - 1)
		var role: String = _timeline.cue_at(index).role if _timeline.cue_count_at(_timeline.duration) > 0 else ""
		_failed_cursors.clear()
		for cursor in _active_role_cursors():
			if cursor.id == role:
				var failure := cursor.duplicate()
				failure.erase("target")
				failure.caption = _replay.error_message
				failure.effect = _feedback.style("failure", "error/%d" % index, {"reason": _replay.error_message})
				_role_is_idle(role, ["failure", failure.effect.eventId], Time.get_ticks_msec())
				_failed_cursors.append(failure)
		_panel.interrupt_replay(_replay.error_message)
	_sync_store(_panel.current_snapshot())
	if _replay != null:
		_follow_active_role(_panel.current_snapshot())
	if _panel.transition_kind not in ["history", "drag"]:
		_mark_replay_scene_unsaved()
	if _timeline.play_on_completion and _panel.has_started():
		if _panel.has_active_run() and not _game_status.is_empty():
			_stop_showcase_game()
		elif not _panel.has_active_run() and _panel.transition_kind == "clock" and _game_status.is_empty() and _replay.owns_scene(EditorInterface.get_edited_scene_root()):
			var launched := _game.launch(EditorInterface.get_edited_scene_root())
			_game_status = {"state": "started" if launched else "error"}
			_panel.show_replay_status("조립한 씬으로 게임을 실행했습니다." if launched else _game.error_message)
	set_process((_panel.has_active_run() and not _panel.is_playing()) or not _failed_cursors.is_empty())
	_refresh_visuals(force)


func _process(delta: float) -> void:
	if not is_instance_valid(_panel):
		set_process(false)
		return
	# Dock splitters, Inspector scroll and caret geometry also move while playback is paused.
	_geometry_elapsed += delta
	if _geometry_elapsed >= 0.05:
		_geometry_elapsed = 0.0
		if _replay != null and _panel.has_active_run() and not _panel.active_role.is_empty():
			_follow_active_role(_panel.current_snapshot())
		_refresh_visuals(false, true)
		if not _panel.has_active_run() and _failed_cursors.all(func(cursor: Dictionary) -> bool: return cursor.effect.phase == "idle"):
			set_process(false)


func _refresh_visuals(force := false, geometry_only := false) -> void:
	if not is_instance_valid(_panel):
		return
	var playing: bool = _panel.is_playing()
	var now := Time.get_ticks_msec()
	var publish_web := _web_window != null and (force or not playing or playing != _web_last_playing or now - _web_last_publish >= 40)
	if not publish_web and not is_instance_valid(_cursor_overlay):
		return
	var cursors := _active_role_cursors()
	if is_instance_valid(_cursor_overlay):
		_present_editor_cursors(cursors)
	if not publish_web:
		return
	if geometry_only and cursors == _last_published_cursors:
		return
	_last_published_cursors = cursors.duplicate(true)
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
		"session": "agent" if _timeline == _agent_timeline else "template",
		"replay": replay_diagnostics(),
		"importReceipt": import_diagnostics(),
		"gameLaunch": _game_status,
		"store": store_diagnostics(),
	}
	JavaScriptBridge.eval("window.__playforgeShowcaseState = " + JSON.stringify(state) + "; window.__playforgeShowcaseChanged?.(window.__playforgeShowcaseState);", true)


func _apply_replay_frame(snapshot: Dictionary) -> bool:
	if _timeline.schema_version != 3:
		return _replay.apply_snapshot(snapshot)
	var target: float = snapshot.time
	var kind: String = _panel.transition_kind
	if kind == "clock" and not _record_crossed_edit_groups(snapshot):
		return false
	var previous_version: int = _replay.scene_edit_version
	if not _replay.apply_snapshot(snapshot):
		return false
	# A retry can start exactly on the import cue that the previous run already consumed.
	if not _source_ready and _awaited_pack.is_empty() and target >= _timeline.import_at:
		var cue: Dictionary = _timeline.import_cue
		_request_replay_import(cue.files, cue.staged, cue.storePack)
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
			if _timeline.cue_at(cursor).action in ["add", "set", "finish"]:
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
		_feedback.history(time < _template_time)
		_gestures.clear()
		_panel.apply_editor_history_time(time)
	elif _template_replay.apply_snapshot(_template_timeline.evaluate(time)):
		_template_time = time
		_template_history_time = time
		_marked_scene_versions[_template_replay] = _template_replay.scene_edit_version


func _mark_replay_scene_unsaved() -> void:
	if _replay != null and _replay.scene_edit_version != _marked_scene_versions.get(_replay, 0) and _replay.owns_scene(EditorInterface.get_edited_scene_root()):
		_marked_scene_versions[_replay] = _replay.scene_edit_version
		EditorInterface.mark_scene_as_unsaved()
