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
