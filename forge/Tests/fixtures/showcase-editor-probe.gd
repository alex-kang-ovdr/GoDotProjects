@tool
extends EditorPlugin

const SHOWCASE := "res://addons/playforge_showcase/plugin.gd"
const SCENE_PATH := "res://scenes/main.tscn"
const SOURCE_PATH := "res://playforge_replay_source.tscn"

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
	inspector.hide()
	var original_scene := load(SOURCE_PATH) as PackedScene
	_original_instance = original_scene.instantiate()
	var original := _original_instance
	showcase.call("_start_showcase")
	var panel: Control = showcase.get("_panel")
	for frame in range(8):
		if panel.call("is_playing"):
			break
		await scene_tree.process_frame
	var edited := EditorInterface.get_edited_scene_root()
	if edited == null or edited.name != &"ForgeReplay" or edited.get_class() != original.get_class() or edited.scene_file_path != SCENE_PATH or not panel.call("is_playing"):
		_fail("Playback must claim the prepared, real Godot scene.")
		return
	panel.call("seek", 0.0)
	if edited.get_child_count() != 0 or edited.get_script() != null:
		_fail("The authored scene should be empty at the beginning of replay.")
		return
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-showcase.json"))
	if not _verify_staged_add(edited, original, panel, manifest) or not _verify_staged_property(edited, original, panel, manifest):
		return
	var user_node := Node.new()
	user_node.name = "UserUnsavedWork"
	user_node.set_meta(&"value", Vector2(-724, 113))
	edited.add_child(user_node)
	user_node.owner = edited
	if not _verify_template_undo(showcase, panel, edited, user_node):
		return
	panel.call("seek", 3.5)
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
		if not is_equal_approx(float(cursor.get("opacity", 0.0)), 1.0):
			_fail("Free mode should display all four role cursors without dimming.")
			return
		roles[cursor.id] = point
		locations.append(point)
	if active.size() != 4 or not roles.has_all(["gui", "assets", "level", "script"]) or not cursors.is_visible_in_tree():
		_fail("Four distinct role cursors must be visible on the installed editor.")
		return
	var editor_bounds := editor.get_global_rect()
	var filesystem := EditorInterface.get_file_system_dock()
	var asset_location: Vector2 = editor_bounds.position + editor_bounds.size * roles.assets
	if not filesystem.is_visible_in_tree() or not filesystem.get_global_rect().has_point(asset_location):
		_fail("The asset cursor tip must land in the visible native FileSystem dock.")
		return
	if inspector.is_visible_in_tree():
		_fail("Playback must leave the hidden Inspector closed.")
		return
	if not await _verify_editor_follow(showcase, panel, edited, inspector, manifest, original.get_script()):
		return
	panel.call("advance", 100.0)
	await scene_tree.process_frame
	var completed: Array = cursors.call("active_cursors")
	if not completed.is_empty():
		_fail("Native role cursors were left behind after playback ended.")
		return
	var final: Dictionary = showcase.call("replay_diagnostics")
	if not final.finished or final.scenePath != SCENE_PATH or not final.error.is_empty():
		_fail("The real Godot scene must report a completed reconstruction.")
		return
	if not _verify_exact_scene(edited, original, original_scene.get_state(), user_node):
		return
	showcase.call("_start_showcase")
	panel.call("seek", 0.0)
	if edited.get_child_count() != 1 or edited.get_script() != null or edited.name != &"ForgeReplay":
		_fail("Restart must remove generated nodes before beginning again.")
		return
	if not is_instance_valid(user_node) or user_node.get_parent() != edited or user_node.owner != edited or user_node.get_meta(&"value") != Vector2(-724, 113):
		_fail("Restart touched a user's unsaved node.")
		return
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


func _verify_editor_follow(showcase: EditorPlugin, panel: Control, edited: Node, inspector: EditorInspector, manifest: Dictionary, script: Script) -> bool:
	var level_edits: Array = manifest.cues.filter(func(cue: Dictionary) -> bool:
		return cue.role == "level" and cue.action == "set"
	)
	if level_edits.is_empty():
		_fail("The template needs a native property action to verify role follow.")
		return false
	var edit: Dictionary = level_edits[0]
	var selection := EditorInterface.get_selection()
	selection.clear()
	panel.call("set_active_role", "level")
	panel.call("seek", float(edit.at))
	await get_tree().process_frame
	var selected := edited.get_node_or_null(NodePath(edit.object))
	var focus: Dictionary = showcase.call("focus_diagnostics")
	if selected == null or selection.get_selected_nodes() != [selected] or focus.get("activeRole") != "level" or focus.get("selectedNode") != edit.object:
		_fail("Following the level role did not select the original live node in Godot.")
		return false
	if inspector.is_visible_in_tree():
		_fail("Following a live node must leave a closed Inspector closed.")
		return false
	inspector.show()
	panel.call("set_active_role", "")
	panel.call("set_active_role", "level")
	await get_tree().process_frame
	focus = showcase.call("focus_diagnostics")
	if not inspector.is_visible_in_tree() or inspector.get_edited_object() != selected or focus.get("property") != edit.property:
		_fail("Godot's visible Inspector is not showing the selected role's actual property target.")
		return false
	inspector.hide()

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
		var expected_opacity := 1.0 if role.id == "script" else 0.3
		if not is_equal_approx(float(role.get("opacity", 0.0)), expected_opacity):
			_fail("Native cursor opacity should distinguish the followed role from collaborators.")
			return false
		if role.id == "script" and role.caption != script_cues.paste.text:
			_fail("The script cursor and paste action log must show the same caption.")
			return false
	panel.call("set_active_role", "")
	return true


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
