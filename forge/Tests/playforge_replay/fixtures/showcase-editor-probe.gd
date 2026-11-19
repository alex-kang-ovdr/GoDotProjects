@tool
extends EditorPlugin

const SHOWCASE := "res://addons/playforge_replay/plugin.gd"
const SCENE_PATH := "res://scenes/main.tscn"
const SOURCE_PATH := "res://playforge_replay_source.tscn"
const OTHER_SCENE_PATH := "res://showcase_probe_other.tscn"
const CursorCanvas := preload("res://addons/playforge_replay/showcase_canvas.gd")

var _original_instance: Node


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var scene_tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning():
		await scene_tree.process_frame
	var editor := EditorInterface.get_base_control()
	var cursors := editor.get_node_or_null("PlayForgeShowcaseCursors") as Control
	var showcase := _find_showcase(scene_tree.root)
	if showcase == null:
		_fail("The prepared project did not enable its showcase editor addon.")
		return
	if cursors == null:
		_fail("The installed editor did not add a global showcase cursor overlay.")
		return
	if cursors.mouse_filter != Control.MOUSE_FILTER_IGNORE:
		_fail("Showcase cursors must leave native editor input available.")
		return
	var inspector := EditorInterface.get_inspector()
	var inspector_dock := _native_dock("InspectorDock")
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-showcase.json"))
	for path: String in manifest.get("bootstrapFiles", []):
		if FileAccess.file_exists("res://" + path):
			_fail("The blank editor already exposes a staged dependency: " + path)
			return
	var import_cue: Dictionary = {}
	for cue: Dictionary in manifest.cues:
		if cue.action == "import":
			import_cue = cue
			if not _verify_staged_sync(cue):
				return
	showcase.call("_open_session_scene")
	var panel: Control = showcase.get("_panel")
	for frame in range(120):
		if panel.call("is_playing"):
			break
		await scene_tree.process_frame
	var edited := EditorInterface.get_edited_scene_root()
	if edited == null or edited.name != &"ForgeReplay" or edited.scene_file_path != SCENE_PATH or not panel.call("is_playing"):
		_fail("Playback must claim the prepared, real Godot scene.")
		return
	panel.call("seek", 0.0)
	if edited.get_child_count() != 0 or edited.get_script() != null:
		_fail("The authored scene should be empty at the beginning of replay.")
		return
	if not import_cue.is_empty() and not await _verify_import(showcase, panel, import_cue, true):
		return
	if DisplayServer.get_name() != "headless" and OS.get_environment("PLAYFORGE_SHOWCASE_FLOATING") == "1":
		if panel.call("is_playing"):
			panel.call("_toggle_playback")
		for cue: Dictionary in manifest.cues:
			if cue.role == "gui" and cue.get("property") == "text":
				panel.call("set_active_role", "gui")
				panel.call("seek", float(cue.at))
				await _settle_editor()
				if await _verify_floating_inspector(showcase, inspector_dock, inspector, edited.get_node(cue.object)):
					scene_tree.quit(0)
				return
		_fail("The native floating dock probe requires a GUI text property cue.")
		return
	var original_scene := load(SOURCE_PATH) as PackedScene
	if original_scene == null:
		_fail("The source scene could not load after import.")
		return
	_original_instance = original_scene.instantiate()
	var original := _original_instance
	if not _verify_staged_add(edited, original, panel, manifest) or not _verify_staged_property(edited, original, panel, manifest):
		return
	var user_node := Node.new()
	user_node.name = "UserUnsavedWork"
	user_node.set_meta(&"value", Vector2(-724, 113))
	edited.add_child(user_node)
	user_node.owner = edited
	if not _verify_template_undo(showcase, panel, edited, user_node):
		return
	inspector_dock.close()
	panel.call("seek", 3.5)
	# A restart can reach the requested time only once the real import has completed.
	var seek_deadline := Time.get_ticks_msec() + 20000
	while panel.current_time < 3.5 and Time.get_ticks_msec() < seek_deadline:
		await scene_tree.process_frame
	await scene_tree.process_frame
	var active: Array = cursors.call("active_cursors")
	var roles := {}
	var locations: Array[Vector2] = []
	for cursor in active:
		var point := Vector2(cursor.x, cursor.y)
		if point.x < 0.0 or point.x > 1.0 or point.y < 0.0 or point.y > 1.0 or locations.has(point):
			_fail("Each native cursor must have a distinct position inside the real editor.")
			return
		if str(cursor.caption).strip_edges().is_empty():
			_fail("Each native role must show its current action below its cursor.")
			return
		if cursor.opacity != 1.0 or cursor.main or cursor.scale != 1.0:
			_fail("Free mode should display all four role cursors at normal size and full opacity.")
			return
		if cursor.has("target"):
			_fail("Free mode advertised a followed control.")
			return
		roles[cursor.id] = point
		locations.append(point)
	if active.size() != 4 or not roles.has_all(["gui", "assets", "level", "script"]) or not cursors.is_visible_in_tree():
		_fail("Four distinct role cursors must be visible on the installed editor.")
		return
	if not _verify_idle_clocks(showcase) or not _verify_narrow_cursor_badges():
		return
	var editor_bounds := editor.get_global_rect()
	var filesystem := EditorInterface.get_file_system_dock()
	var asset_location: Vector2 = editor_bounds.position + editor_bounds.size * roles.assets
	if not filesystem.is_visible_in_tree() or not filesystem.get_global_rect().has_point(asset_location):
		_fail("The asset cursor tip must land in the visible native FileSystem dock.")
		return
	if inspector.is_visible_in_tree():
		_fail("Free view must preserve the closed Inspector.")
		return
	panel.call("_toggle_playback")
	if not await _verify_prepared_asset(showcase, panel, original, edited, manifest, inspector):
		return
	if not await _verify_add_target(showcase, panel, manifest, edited):
		return
	if not await _verify_scene_drag(panel, manifest):
		return
	if not await _verify_editor_follow(showcase, panel, edited, inspector, inspector_dock, manifest, original.get_script()):
		return
	print("PLAYFORGE_SHOWCASE_DOCK_FOLLOW_OK")
	panel.call("_toggle_playback")
	panel.call("advance", 100.0)
	await scene_tree.process_frame
	var completed: Array = cursors.call("active_cursors")
	if not completed.is_empty():
		_fail("Native role cursors were left behind after playback ended.")
		return
	if not _verify_failed_cursor_idle(showcase, cursors):
		return
	var final: Dictionary = showcase.call("replay_diagnostics")
	if not final.finished or final.scenePath != SCENE_PATH or not final.error.is_empty():
		_fail("The real Godot scene must report a completed reconstruction.")
		return
	if not _verify_exact_scene(edited, original, original_scene.get_state(), user_node):
		return
	var edited_asset := ""
	var asset_source := ""
	if not import_cue.is_empty():
		edited_asset = "res://" + str(import_cue.staged[0])
		asset_source = FileAccess.get_file_as_string(edited_asset)
		var write := FileAccess.open(edited_asset, FileAccess.WRITE)
		write.store_string(asset_source + "\n<!-- User texture edit -->\n")
		write.close()
	showcase.call("_start_showcase")
	panel.call("seek", 0.0)
	if edited.get_child_count() != 1 or edited.get_script() != null or edited.name != &"ForgeReplay":
		_fail("Restart must remove generated nodes before beginning again.")
		return
	if not is_instance_valid(user_node) or user_node.get_parent() != edited or user_node.owner != edited or user_node.get_meta(&"value") != Vector2(-724, 113):
		_fail("Restart touched a user's unsaved node.")
		return
	if not import_cue.is_empty():
		if not await _verify_import(showcase, panel, import_cue, false):
			return
		if FileAccess.get_file_as_string(edited_asset) != asset_source + "\n<!-- User texture edit -->\n":
			_fail("Restarting the import replaced a user's existing texture source.")
			return
		var restore := FileAccess.open(edited_asset, FileAccess.WRITE)
		restore.store_string(asset_source)
		restore.close()
	panel.call("advance", 100.0)
	await scene_tree.process_frame
	if showcase.call("replay_diagnostics") != final or not is_instance_valid(user_node):
		_fail("Restart must reproduce the same real scene while retaining user edits.")
		return
	if not _verify_exact_scene(edited, original, original_scene.get_state(), user_node):
		return
	original.free()
	print("PLAYFORGE_SHOWCASE_EDITOR_OVERLAY_OK ", JSON.stringify(active))
	scene_tree.quit(0)


func _verify_idle_clocks(showcase: EditorPlugin) -> bool:
	var start := 10000
	if showcase.call("_role_is_idle", "_test_first", [7, -1], start) or showcase.call("_role_is_idle", "_test_second", [8, -1], start + 200) or showcase.call("_role_is_idle", "_test_first", [7, -1], start + 4999):
		_fail("Active role captions must last through 4,999 ms.")
		return false
	if not showcase.call("_role_is_idle", "_test_first", [7, -1], start + 5000) or showcase.call("_role_is_idle", "_test_second", [8, -1], start + 5000):
		_fail("Roles become idle independently at 5,000 ms of inactivity.")
		return false
	if showcase.call("_role_is_idle", "_test_first", [9, -1], start + 5001) or showcase.call("_role_is_idle", "_test_first", [9, 10], start + 9999) or not showcase.call("_role_is_idle", "_test_first", [9, 10], start + 14999):
		_fail("A new action or target preview must wake a parked cursor and age normally.")
		return false
	return true


func _verify_narrow_cursor_badges() -> bool:
	var overlay := CursorCanvas.EditorCursorOverlay.new()
	var passed := true
	for left in [true, false]:
		for width in [90, 500]:
			overlay.size = Vector2(width, 100)
			var anchor := Vector2(8 if left else width - 8, 30)
			if width == 500:
				anchor.x = 400 if left else 100
			var role := overlay._badge_bounds("SCRIPT", anchor, left, 1.5)
			var state_x := role.position.x - 4 if left else role.end.x + 4
			var status := overlay._badge_bounds("Completing action", Vector2(state_x, role.position.y), left, 1.1, role)
			passed = passed and role.has_area() and not role.intersects(status) and status.has_area() == (width == 500)
	overlay.free()
	if not passed:
		_fail("The enlarged native role badge must remain visible without a colliding state badge at either window edge.")
	return passed


func _verify_failed_cursor_idle(showcase: EditorPlugin, overlay: Control) -> bool:
	var failed: Array = showcase.get("_failed_cursors")
	var start := 10000
	failed.append({"id": "_test_failed", "label": "Failed role", "color": "#ff0000", "x": 0.5, "y": 0.5,
		"caption": "Failure", "target": {}, "effect": {"phase": "failure", "eventId": "test-failure"}})
	overlay.call("present", showcase.call("_active_role_cursors", start))
	var pending: Array = showcase.call("_active_role_cursors", start + 4999)
	if pending[0].caption != "Failure":
		_fail("An interrupted cursor must keep its failure message through 4,999 ms.")
		return false
	overlay.call("present", showcase.call("_active_role_cursors", start + 5000))
	var idle: Dictionary = overlay.call("active_cursors")[0]
	failed.clear()
	overlay.call("present", failed)
	if idle.effect.phase != "idle" or not idle.caption.is_empty() or idle.has("target"):
		_fail("An interrupted native cursor must park with no caption or target at 5,000 ms.")
		return false
	return true


func _verify_template_undo(showcase: EditorPlugin, panel: Control, edited: Node, user_node: Node) -> bool:
	var manager := EditorInterface.get_editor_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(edited))
	panel.call("seek", 0.0)
	panel.call("seek", 3.5)
	var before: Dictionary = showcase.call("replay_diagnostics")
	if not history.has_undo() or before.nodes.is_empty():
		_fail("A template seek that adds scene nodes must be entered in Godot's scene history.")
		return false
	history.undo()
	if not is_zero_approx(float(panel.get("current_time"))) or panel.call("is_playing") or edited.get_children() != [user_node]:
		_fail("Godot Undo must pause replay and restore the real scene and timeline before the seek.")
		return false
	history.redo()
	if not is_equal_approx(float(panel.get("current_time")), 3.5) or panel.call("is_playing") or showcase.call("replay_diagnostics") != before:
		_fail("Godot Redo must restore the scene and time of the original replay seek.")
		return false
	panel.call("play_from_start")
	return true


func _verify_editor_follow(showcase: EditorPlugin, panel: Control, edited: Node, inspector: EditorInspector, inspector_dock: EditorDock, manifest: Dictionary, script: Script) -> bool:
	var level_edits: Array = manifest.cues.filter(func(cue: Dictionary) -> bool:
		return cue.role == "level" and cue.action == "set"
	)
	if level_edits.is_empty():
		_fail("The template needs a native property action to verify role follow.")
		return false
	var edit: Dictionary = level_edits[0]
	var selection := EditorInterface.get_selection()
	selection.clear()
	inspector_dock.close()
	panel.call("set_active_role", "level")
	panel.call("seek", float(edit.at))
	await _settle_editor()
	var selected := edited.get_node_or_null(NodePath(edit.object))
	var focus: Dictionary = showcase.call("focus_diagnostics")
	if selected == null or selection.get_selected_nodes() != [selected] or focus.get("activeRole") != "level" or focus.get("selectedNode") != edit.object:
		_fail("Following the level role did not select the original live node in Godot.")
		return false
	if not inspector.is_visible_in_tree() or inspector.get_edited_object() != selected or focus.get("property") != edit.property:
		_fail("Tracking the property cue must reopen the real Inspector on the selected node.")
		return false
	for cue: Dictionary in manifest.cues:
		if cue.role == "gui" and cue.get("property") == "text":
			panel.call("set_active_role", "gui")
			panel.call("seek", float(cue.at))
			await _settle_editor()
			if not _inspector_property_hit(inspector, edited.get_node(cue.object), "gui", &"text"):
				_fail("The selected GUI cursor must mark the real Label text property. " + str(_role_cursor("gui")))
				return false
			var result: Dictionary = showcase.call("focus_diagnostics")
			if not str(edited.get_node(cue.object).get("text")) in str(result.get("result", "")) or not "text" in str(result.get("resultTarget", "")):
				_fail("The result must report the Label's actual text after the property edit. " + str(result))
				return false
			var version: int = showcase.get("_replay").get("scene_edit_version")
			if not _switch_away_from_dock(inspector_dock):
				return false
			await _settle_editor()
			if not _inspector_property_hit(inspector, edited.get_node(cue.object), "gui", &"text"):
				_fail("Switching tabs in the same paused property cue must restore the Inspector and its real highlight.")
				return false
			inspector_dock.close()
			await _settle_editor()
			if not _inspector_property_hit(inspector, edited.get_node(cue.object), "gui", &"text"):
				_fail("Closing the Inspector in the same paused property cue must restore it and its real highlight.")
				return false
			if not await _verify_scene_tab_follow(panel, edited, inspector, cue):
				return false
			if showcase.get("_replay").get("scene_edit_version") != version or not is_equal_approx(float(panel.get("current_time")), float(cue.at)):
				_fail("Restoring the tracked Inspector changed the scene or playhead.")
				return false
			break
	for cue: Dictionary in manifest.cues:
		if cue.role == "assets" and cue.get("property") == "texture":
			var filesystem := EditorInterface.get_file_system_dock()
			if not _switch_away_from_dock(filesystem):
				return false
			panel.call("set_active_role", "assets")
			panel.call("seek", float(cue.at))
			await _settle_editor()
			var texture: Texture2D = edited.get_node(cue.object).get("texture")
			var file_hit := false
			for tree: Tree in filesystem.find_children("*", "Tree", true, false):
				var item := tree.get_selected()
				if tree.is_visible_in_tree() and item != null and item.get_metadata(0) == texture.resource_path:
					var row := tree.get_item_area_rect(item, 0)
					row.position += tree.global_position
					file_hit = _target_within("assets", "filesystem_item", row)
					if file_hit:
						break
			if not file_hit:
				_fail("The resource cursor must mark the exact texture assigned to the scene. " + str(_role_cursor("assets")))
				return false
			break

	var script_editor := EditorInterface.get_script_editor()
	var script_cues := {}
	for cue: Dictionary in manifest.cues:
		if cue.role == "script" and cue.has("scriptPhase"):
			script_cues[cue.scriptPhase] = cue
	if script == null or not script_cues.has_all(["open", "paste"]):
		_fail("The template needs canonical script open and paste actions.")
		return false
	var initial_source := script.source_code
	var source_file := FileAccess.get_file_as_string(script.resource_path)
	panel.call("set_active_role", "script")
	panel.call("seek", float(script_cues.open.at))
	await get_tree().process_frame
	var viewer := script_editor.find_child("PlayForgeScriptPresentation", true, false) as CodeEdit
	var original_editor := script_editor.get_current_editor().get_base_editor() as CodeEdit if script_editor.get_current_editor() != null else null
	var current_script := script_editor.get_current_script()
	focus = showcase.call("focus_diagnostics")
	if original_editor == null or viewer == null or viewer.get_parent() != original_editor or not viewer.is_visible_in_tree() or not viewer.text.is_empty() or viewer.editable or current_script == null or current_script.resource_path != script.resource_path or focus.get("scriptPhase") != "open":
		_fail("The script role must open the real canonical script with an empty read-only presentation before paste.")
		return false
	var initial_buffer := original_editor.text
	var before_paste := int(focus.get("pasteCount", 0))
	panel.call("seek", float(script_cues.paste.at))
	await get_tree().process_frame
	focus = showcase.call("focus_diagnostics")
	if viewer.text != source_file.replace("\r\n", "\n") or int(focus.get("pasteCount", -1)) != before_paste + 1 or focus.get("scriptPhase") != "paste":
		_fail("One paste action must show the entire original script in Godot's Script Editor.")
		return false
	await _settle_editor()
	if not _verify_caret_target(viewer):
		return false
	var paste_result: String = showcase.call("focus_diagnostics").get("result", "")
	var result_cell := panel.find_child("ResultValue", true, false) as Label
	var grid := panel.find_child("ActionResult", true, false) as GridContainer
	if not str(viewer.get_line_count()) in paste_result or result_cell == null or result_cell.text != paste_result or grid == null or not grid.visible:
		_fail("The paste result must report the displayed %d lines. Result '%s'." % [viewer.get_line_count(), paste_result])
		return false
	# Native editing tools can select a different bottom dock. Reopen it as a user would.
	var dock: EditorDock = showcase.get("_dock")
	dock.make_visible()
	await _settle_editor()
	if not result_cell.is_visible_in_tree() or result_cell.text != paste_result:
		_fail("Reopening the showcase dock must display the current action result.")
		return false
	var replay: RefCounted = showcase.get("_replay")
	var scene_version: int = replay.get("scene_edit_version")
	var previous_target: Dictionary = _role_cursor("script").get("target", {})
	viewer.set_caret_line(4)
	await _settle_editor()
	if not _verify_caret_target(viewer):
		return false
	if _role_cursor("script").get("target") == previous_target:
		_fail("The paused cursor did not follow the caret to a different displayed line.")
		return false
	if original_editor.text != initial_buffer:
		_fail("The presentation must leave the actual ScriptEditor buffer unchanged.")
		return false
	if script.source_code.replace("\r\n", "\n") != initial_source.replace("\r\n", "\n"):
		_fail("The presentation must leave the canonical script resource unchanged.")
		return false
	if FileAccess.get_file_as_string(script.resource_path) != source_file:
		_fail("The presentation must leave the on-disk script unchanged.")
		return false
	var overlay := EditorInterface.get_base_control().get_node("PlayForgeShowcaseCursors")
	var active: Array = overlay.call("active_cursors")
	var log_entries: Array = panel.call("visible_log_entries")
	var script_log := log_entries.filter(func(cue: Dictionary) -> bool: return cue.get("scriptPhase") == "paste")
	if script_log.size() != 1 or script_log[0].text != script_cues.paste.text:
		_fail("The native log must show the paste action once with the authored caption.")
		return false
	if active.size() != 4:
		_fail("Focusing a role should keep all four native cursors present.")
		return false
	for role: Dictionary in active:
		var main_role: bool = role.id == "script"
		if role.opacity != 1.0 or role.main != main_role or role.scale != (1.5 if main_role else 1.0):
			_fail("Native role cursors should stay fully opaque and enlarge only the followed role.")
			return false
		if role.id == "script" and role.caption != script_cues.paste.text:
			_fail("The script cursor and paste action log must show the same caption.")
			return false
		if role.id != "script" and role.has("target"):
			_fail("A collaborator retained the followed role's control highlight.")
			return false
	panel.call("set_active_role", "")
	await _settle_editor()
	for role: Dictionary in overlay.call("active_cursors"):
		if role.has("target"):
			_fail("Leaving role follow must clear the highlight while paused.")
			return false
	if replay.get("scene_edit_version") != scene_version or showcase.call("focus_diagnostics").pasteCount != before_paste + 1 or panel.get("current_time") != script_cues.paste.at:
		_fail("Refreshing the paused highlight changed the scene, script presentation or playhead.")
		return false
	return true


func _verify_scene_tab_follow(panel: Control, edited: Node, inspector: EditorInspector, cue: Dictionary) -> bool:
	var other_scene := FileAccess.open(OTHER_SCENE_PATH, FileAccess.WRITE)
	if other_scene == null:
		_fail("The native probe could not create a second scene tab.")
		return false
	other_scene.store_string('[gd_scene format=3]\n\n[node name="DockProbeOther" type="Node2D"]\n')
	other_scene.close()
	var selected := edited.get_node(cue.object)
	panel.call("set_active_role", "")
	EditorInterface.open_scene_from_path(OTHER_SCENE_PATH)
	await _settle_editor()
	var other := EditorInterface.get_edited_scene_root()
	if other == null or other.scene_file_path != OTHER_SCENE_PATH:
		_fail("Free view must allow switching to another open scene.")
		return false
	panel.call("set_active_role", "gui")
	await _settle_editor()
	if EditorInterface.get_edited_scene_root() != edited:
		_fail("Starting role tracking must return to the original live replay scene tab.")
		return false
	var changed_to: Array[Node] = []
	var capture_change := func(root: Node) -> void: changed_to.append(root)
	scene_changed.connect(capture_change)
	EditorInterface.open_scene_from_path(OTHER_SCENE_PATH)
	await _settle_editor()
	scene_changed.disconnect(capture_change)
	if not other in changed_to or EditorInterface.get_edited_scene_root() != edited or not OTHER_SCENE_PATH in EditorInterface.get_open_scenes():
		_fail("Switching scene tabs while tracking must return to the original replay scene and keep the other tab open.")
		return false
	if edited.get_node(cue.object) != selected or not _inspector_property_hit(inspector, selected, "gui", &"text"):
		_fail("Restoring the tracked scene tab must preserve the live node and restore its Inspector highlight.")
		return false
	return true


func _native_dock(kind: String) -> EditorDock:
	return EditorInterface.get_base_control().find_children("*", kind, true, false)[0] as EditorDock


func _switch_away_from_dock(dock: Control) -> bool:
	var tabs := dock.get_parent() as TabContainer
	if tabs != null:
		var dock_index := tabs.get_tab_idx_from_control(dock)
		for index in tabs.get_tab_count():
			if index != dock_index and not tabs.is_tab_hidden(index) and not tabs.is_tab_disabled(index):
				tabs.current_tab = index
				if not dock.is_visible_in_tree():
					return true
	_fail("The native probe could not select a sibling tab for " + str(dock.name))
	return false


func _inspector_property_hit(inspector: EditorInspector, object: Object, role: String, property: StringName) -> bool:
	for field: EditorProperty in inspector.find_children("*", "EditorProperty", true, false):
		if field.get_edited_object() == object and field.get_edited_property() == property and field.is_visible_in_tree():
			if _target_within(role, "inspector_property", field.get_global_rect()):
				return true
	return false


func _settle_editor() -> void:
	await get_tree().create_timer(0.25).timeout
	await get_tree().process_frame


func _verify_staged_sync(cue: Dictionary) -> bool:
	var platform: EditorPlugin = load("res://addons/showcase_probe/sync_probe.gd").new()
	var baseline := {}
	for path: String in cue.staged:
		var pending := "res://.playforge-import/" + path
		if not FileAccess.file_exists(pending) or FileAccess.file_exists("res://" + path):
			platform.free()
			_fail("Staged SVG must remain outside the live Assets folder until its import action: " + path)
			return false
		baseline[path] = FileAccess.get_file_as_string(pending)
	platform.set("_base_files", baseline)
	var logical: Dictionary = platform.call("_collect_local_files")
	for path: String in baseline:
		if logical.get(path) != baseline[path] or logical.has(".playforge-import/" + path):
			platform.free()
			_fail("Staging changed the synchronized project file list: " + path)
			return false
	# Remote changes arriving before import must update the pending source in place.
	var probe := "Assets/sync_probe_%d.svg" % Time.get_ticks_usec()
	var staged_path := "res://.playforge-import/" + probe
	var destination := "res://" + probe
	var file := FileAccess.open(staged_path, FileAccess.WRITE)
	file.store_string("<svg/>")
	file.close()
	baseline[probe] = "<svg/>"
	platform.set("_base_files", baseline)
	var updated := "<svg><!-- remote --></svg>"
	if not platform.call("_write_or_delete_file", probe, updated) or FileAccess.file_exists(destination) or platform.call("_collect_local_files").get(probe) != updated:
		platform.free()
		_fail("Synchronizing a pending texture update must preserve its staged location.")
		return false
	if not platform.call("_write_or_delete_file", probe, null) or FileAccess.file_exists(staged_path) or platform.call("_collect_local_files").has(probe):
		platform.free()
		_fail("A deleted pending texture must disappear from the synchronization snapshot.")
		return false
	platform.free()
	return true


func _verify_import(showcase: EditorPlugin, panel: Control, cue: Dictionary, first_run: bool) -> bool:
	var prior_role: String = panel.get("active_role")
	panel.call("_toggle_playback")
	panel.call("set_active_role", "assets")
	if cue.has("storePack"):
		panel.call("seek", 0.0)
		await _settle_editor()
		var preview: Dictionary = showcase.call("store_diagnostics")
		if not preview.get("visible") or preview.get("manual") or preview.get("selectedPack") != cue.storePack or not showcase.call("replay_diagnostics").nodes.is_empty():
			_fail("The guided store must show the selected pack over the empty scene before import. " + str(preview))
			return false
	panel.call("seek", float(cue.at))
	var limit := Time.get_ticks_msec() + 20000
	var receipt: Dictionary = showcase.call("import_diagnostics")
	while receipt.get("state") not in ["done", "error"] and Time.get_ticks_msec() < limit:
		await get_tree().process_frame
		receipt = showcase.call("import_diagnostics")
	var first_count: int = cue.staged.size() if first_run else 0
	if receipt.get("state") != "done" or receipt.get("first") != first_count or receipt.get("count") != cue.files.size() or PackedStringArray(receipt.get("files", [])) != PackedStringArray(cue.files):
		_fail("The import receipt must identify all real Godot imports and newly materialized files. " + str(receipt))
		return false
	var repository := OS.get_environment("PLAYFORGE_ASSET_LIBRARY_URL")
	if not repository.is_empty() and receipt.get("repository") != repository:
		_fail("The pack was not imported from the launcher's local repository.")
		return false
	await get_tree().process_frame
	await get_tree().process_frame
	var focus: Dictionary = showcase.call("focus_diagnostics")
	var result := panel.find_child("ResultValue", true, false) as Label
	if focus.get("resourcePath") != "res://" + str(cue.files[0]) or result == null or not str(receipt.message) in result.text:
		_fail("The followed import must show the actual imported texture and its completed receipt. " + str(focus))
		return false
	for asset: String in cue.staged:
		var path := "res://" + asset
		var resource := ResourceLoader.load(path)
		var usable: bool = resource is Texture2D and FileAccess.file_exists(path + ".import") if path.ends_with(".svg") else resource is AudioStreamWAV and resource.get_length() > 0.0
		if not usable or FileAccess.file_exists("res://.playforge-import/" + asset):
			_fail("The completed import must replace staging with a usable game resource at " + path)
			return false
	print("PLAYFORGE_SHOWCASE_IMPORT_OK ", JSON.stringify(receipt))
	panel.call("set_active_role", prior_role)
	panel.call("seek", 0.0)
	panel.call("_toggle_playback")
	return true


func _verify_scene_drag(panel: Control, manifest: Dictionary) -> bool:
	for cue: Dictionary in manifest.cues:
		if cue.get("gesture") != "drag":
			continue
		# Both ends must be on screen to present a drag in a portrait game.
		var window := EditorInterface.get_base_control().get_window()
		var previous_size := window.size
		window.size = Vector2i(1600, 1200)
		for frame in 4:
			await get_tree().process_frame
		panel.call("set_active_role", cue.role)
		panel.call("seek", float(cue.at) - 0.01)
		panel.call("seek", float(cue.at))
		await get_tree().process_frame
		var editor := EditorInterface.get_base_control()
		var root := EditorInterface.get_edited_scene_root()
		var node := root.get_node(NodePath(cue.object)) as Node2D
		var tip := editor.get_viewport().get_screen_transform().affine_inverse() * node.get_viewport().get_screen_transform() * node.get_global_transform_with_canvas().origin
		var effect: Dictionary = _role_cursor(cue.role).get("effect", {})
		if effect.get("phase") != "drag" or effect.get("completed") != true or effect.get("replayPath") != true:
			_fail("A visible node movement must present its verified drag. %s, tip=%s, clip=%s, view=%s, model=%s, visible=%s" % [effect, tip, EditorInterface.get_editor_main_screen().get_global_rect(), node.get_viewport().get_screen_transform(), node.get_global_transform_with_canvas(), node.is_visible_in_tree()])
			return false
		var actual := editor.global_position + editor.size * Vector2(effect.to.x, effect.to.y)
		if actual.distance_to(tip) > 1.0 or effect.from == effect.to:
			_fail("Drag endpoints must follow the actual 2D node and differ after its move.")
			return false
		print("PLAYFORGE_SCENE_DRAG_OK ", JSON.stringify(effect))
		panel.call("set_active_role", "")
		window.size = previous_size
		await get_tree().process_frame
	return true


func _verify_floating_inspector(showcase: EditorPlugin, dock: EditorDock, inspector: EditorInspector, selected: Node) -> bool:
	var primary := EditorInterface.get_base_control().get_window()
	var tabs := dock.get_parent() as TabContainer
	if tabs == null or tabs.get_popup() == null:
		_fail("The Inspector must start in its native dock tabs.")
		return false
	var menu := tabs.get_popup()
	tabs.get_tab_bar().tab_rmb_clicked.emit(tabs.get_tab_idx_from_control(dock))
	var float_button: Button
	for button: Button in menu.find_children("*", "Button", true, false):
		if button.icon != null and button.icon == button.get_theme_icon(&"MakeFloating", &"EditorIcons"):
			float_button = button
			break
	if float_button == null or float_button.disabled:
		_fail("The native Inspector context menu must support floating.")
		return false
	float_button.pressed.emit()
	await _settle_editor()
	var floating := dock.get_window()
	if floating == primary or floating.is_embedded() or not _floating_property_hit(showcase, floating, inspector, selected):
		_fail("Floating the Inspector must move its followed cursor and highlight into the actual native window. Main=%s window=%s embedded=%s size=%s overlays=%s main cursor=%s focus=%s" % [primary, floating, floating.is_embedded(), floating.get_visible_rect(), showcase.get("_floating_cursor_overlays"), _role_cursor("gui"), showcase.call("focus_diagnostics")])
		return false
	var original_size := floating.size
	floating.size += Vector2i(123, 96)
	floating.position += Vector2i(50, 55)
	await _settle_editor()
	if floating.size == original_size or not _floating_property_hit(showcase, floating, inspector, selected):
		_fail("Moving and resizing the floating Inspector must keep the cursor on the actual property.")
		return false
	var window_id := floating.get_instance_id()
	var overlay: Control = showcase.get("_floating_cursor_overlays").get(window_id)
	floating.close_requested.emit()
	await _settle_editor()
	if dock.get_window() != primary or is_instance_valid(overlay) or showcase.get("_floating_cursor_overlays").has(window_id) or not _inspector_property_hit(inspector, selected, "gui", &"text"):
		_fail("Redocking the Inspector must return its followed cursor to the main overlay and release the native overlay.")
		return false
	print("PLAYFORGE_SHOWCASE_FLOATING_DOCK_OK")
	return true


func _floating_property_hit(showcase: EditorPlugin, window: Window, inspector: EditorInspector, selected: Node) -> bool:
	var overlay: Control = showcase.get("_floating_cursor_overlays").get(window.get_instance_id())
	if overlay == null or overlay.get_window() != window or overlay.mouse_filter != Control.MOUSE_FILTER_IGNORE or not _role_cursor("gui").is_empty():
		return false
	var viewport := window.get_visible_rect()
	if not overlay.size.is_equal_approx(viewport.size):
		return false
	for role: Dictionary in overlay.call("active_cursors"):
		var target: Dictionary = role.get("target", {})
		if role.id != "gui" or target.get("kind") != "inspector_property" or target.get("label") != "text":
			continue
		var tip := viewport.position + viewport.size * Vector2(role.x, role.y)
		var highlight := Rect2(viewport.position + viewport.size * Vector2(target.x, target.y), viewport.size * Vector2(target.w, target.h))
		for field: EditorProperty in inspector.find_children("*", "EditorProperty", true, false):
			if field.get_edited_object() == selected and field.get_edited_property() == &"text":
				var row := field.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, field.size)
				return highlight.has_area() and highlight.grow(1).has_point(tip) and row.grow(2).encloses(highlight)
	return false


func _role_cursor(id: String) -> Dictionary:
	var overlay := EditorInterface.get_base_control().get_node("PlayForgeShowcaseCursors")
	for role: Dictionary in overlay.call("active_cursors"):
		if role.id == id:
			return role
	return {}


func _target_within(id: String, kind: String, actual: Rect2) -> bool:
	var role := _role_cursor(id)
	var target: Dictionary = role.get("target", {})
	if target.get("kind") != kind or str(target.get("label", "")).strip_edges().is_empty():
		return false
	var base := EditorInterface.get_base_control().get_global_rect()
	var tip := base.position + base.size * Vector2(role.x, role.y)
	var highlight := Rect2(base.position + base.size * Vector2(target.x, target.y), base.size * Vector2(target.w, target.h))
	return highlight.has_area() and highlight.grow(1).has_point(tip) and actual.grow(2).encloses(highlight) and actual.grow(1).has_point(tip)


func _verify_caret_target(viewer: CodeEdit) -> bool:
	var cell := Rect2(viewer.get_rect_at_line_column(viewer.get_caret_line(), viewer.get_caret_column()))
	cell.size.x = maxf(cell.size.x, 2 * EditorInterface.get_editor_scale())
	cell.position += viewer.global_position
	if not _target_within("script", "script_caret", cell):
		_fail("The primary cursor must land on the displayed CodeEdit caret. %s %s" % [cell, _role_cursor("script")])
		return false
	return true


func _verify_prepared_asset(showcase: EditorPlugin, panel: Control, source: Node, edited: Node, manifest: Dictionary, inspector: EditorInspector) -> bool:
	var cues: Array = manifest.cues.filter(func(cue: Dictionary) -> bool: return cue.role == "assets" and cue.has("assetNode"))
	if cues.is_empty():
		_fail("An asset action must identify a source node and property.")
		return false
	var cue: Dictionary = cues[0]
	var asset: Resource = source.get_node(cue.assetNode).get(cue.assetProperty)
	panel.call("seek", float(cue.at))
	var inspector_dock := _native_dock("InspectorDock")
	if asset != null and asset.resource_path.begins_with("res://") and not asset.resource_path.contains("::"):
		inspector_dock.make_visible()
	else:
		inspector_dock.close()
	panel.call("set_active_role", "assets")
	await _settle_editor()
	var focus: Dictionary = showcase.call("focus_diagnostics")
	var actual := inspector.get_edited_object() as Resource
	if asset == null or actual != asset or not inspector.is_visible_in_tree() or (cue.at == 0.0 and edited.has_node(cue.assetNode)) or not str(asset.get_class()) in str(focus.get("result", "")):
		_fail("The asset role must open the original source resource in the Inspector. " + str(focus))
		return false
	panel.call("set_active_role", "")
	return true


func _verify_add_target(showcase: EditorPlugin, panel: Control, manifest: Dictionary, edited: Node) -> bool:
	var dock := _native_dock("SceneTreeDock")
	if not _switch_away_from_dock(dock):
		return false
	var first: Dictionary = manifest.cues.filter(func(cue: Dictionary) -> bool: return cue.action == "add")[0]
	panel.call("set_active_role", first.role)
	panel.call("seek", float(first.at) - 0.05)
	await _settle_editor()
	var button_hit := false
	for button: Button in dock.find_children("*", "Button", true, false):
		if button.is_visible_in_tree() and button.icon != null and button.icon == button.get_theme_icon(&"Add", &"EditorIcons"):
			button_hit = _target_within(first.role, "toolbar_button", button.get_global_rect())
			if button_hit:
				break
	if not button_hit or edited.has_node(first.object):
		_fail("Add preview must mark the Scene dock's real Add Node button before creation. " + str(_role_cursor(first.role)))
		return false
	panel.call("seek", float(first.at))
	await _settle_editor()
	for tree: Tree in dock.find_children("*", "Tree", true, false):
		var item := tree.get_selected()
		if not tree.is_visible_in_tree() or item == null or item.get_text(0) != str(first.object).get_file():
			continue
		var row := tree.get_item_area_rect(item, 0)
		row.position += tree.global_position
		if _target_within(first.role, "scene_row", row):
			var focus: Dictionary = showcase.call("focus_diagnostics")
			if not edited.has_node(first.object) or not str(first.object) in str(focus.get("resultTarget", "")) or str(focus.get("result", "")).is_empty():
				_fail("The created scene row has no corresponding action result. " + str(focus))
				return false
			return true
	_fail("After creation the cursor must move onto the exact new Scene tree item. " + str(_role_cursor(first.role)))
	return false


func _verify_staged_add(edited: Node, original: Node, panel: Control, manifest: Dictionary) -> bool:
	for cue: Dictionary in manifest.cues:
		if cue.action != "add" or float(cue.at) <= 0.0:
			continue
		panel.call("seek", float(cue.at) - 0.001)
		var relative := NodePath(cue.object)
		if edited.has_node(relative):
			_fail("The native node appeared before its scheduled action.")
			return false
		panel.call("seek", float(cue.at))
		var live := edited.get_node_or_null(relative)
		var expected := original.get_node_or_null(relative)
		if live == null or expected == null or live.owner != edited or live.get_class() != expected.get_class():
			_fail("A scheduled action failed to build the original node inside the real editor scene.")
			return false
		return true
	_fail("The template must progressively construct the actual scene.")
	return false


func _verify_staged_property(edited: Node, original: Node, panel: Control, manifest: Dictionary) -> bool:
	for cue: Dictionary in manifest.cues:
		if cue.action != "set":
			continue
		var relative := NodePath(cue.object)
		var expected: Variant = original.get_node(relative).get(cue.property)
		panel.call("seek", float(cue.at) - 0.001)
		var before := edited.get_node_or_null(relative)
		if before == null or _same_value(expected, before.get(cue.property), original, edited):
			continue
		panel.call("seek", float(cue.at))
		var after := edited.get_node_or_null(relative)
		if after == null or not _same_value(expected, after.get(cue.property), original, edited):
			_fail("The property action failed to apply the original value: %s/%s" % [relative, cue.property])
			return false
		return true
	_fail("The replay needs at least one observable native property change.")
	return false


func _verify_exact_scene(edited: Node, original: Node, state: SceneState, user_node: Node) -> bool:
	var packed := PackedScene.new()
	if packed.pack(edited) != OK:
		_fail("The reconstructed native scene cannot be packed by Godot.")
		return false
	var packed_state := packed.get_state()
	var packed_groups := {}
	for index in range(packed_state.get_node_count()):
		packed_groups[packed_state.get_node_path(index)] = packed_state.get_node_groups(index)
	for index in range(state.get_node_count()):
		var relative := state.get_node_path(index)
		var expected := original.get_node_or_null(relative)
		var live := edited.get_node_or_null(relative)
		if live == null or live.name != expected.name or live.get_class() != expected.get_class():
			_fail("Missing or different original scene node: " + str(relative))
			return false
		if expected.owner != null and live.owner != edited.get_node_or_null(original.get_path_to(expected.owner)):
			_fail("Native Godot ownership differs for: " + str(relative))
			return false
		var expected_children := expected.get_children().map(func(child: Node) -> StringName: return child.name)
		var actual_children := live.get_children().filter(func(child: Node) -> bool: return child != user_node)
		if expected_children != actual_children.map(func(child: Node) -> StringName: return child.name):
			_fail("Original child nodes or their order differ for: " + str(relative))
			return false
		if state.get_node_groups(index) != packed_groups.get(relative):
			_fail("Godot groups differ for: " + str(relative))
			return false
		for property_index in range(state.get_node_property_count(index)):
			var property := state.get_node_property_name(index, property_index)
			if not _same_value(expected.get(property), live.get(property), original, edited):
				_fail("Original property differs: %s/%s" % [relative, property])
				return false
	return true


func _same_value(expected: Variant, live: Variant, original: Node, edited: Node) -> bool:
	if expected is Node and live is Node:
		return original.get_path_to(expected) == edited.get_path_to(live)
	if expected is Resource and live is Resource:
		if expected == live:
			return true
		if expected.get_class() != live.get_class() or expected.resource_path != live.resource_path:
			return false
		if not expected.resource_path.is_empty():
			return true
		for property: Dictionary in expected.get_property_list():
			if property.usage & PROPERTY_USAGE_STORAGE and not _same_value(expected.get(property.name), live.get(property.name), original, edited):
				return false
		return true
	return expected == live


func _find_showcase(node: Node) -> EditorPlugin:
	if node is EditorPlugin and node.get_script() != null and node.get_script().resource_path == SHOWCASE:
		return node
	for child in node.get_children(true):
		var result := _find_showcase(child)
		if result != null:
			return result
	return null


func _fail(message: String) -> void:
	if is_instance_valid(_original_instance):
		_original_instance.free()
	push_error(message)
	get_tree().quit(1)
