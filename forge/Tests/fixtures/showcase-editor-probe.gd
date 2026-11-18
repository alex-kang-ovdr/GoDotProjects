@tool
extends EditorPlugin

const SHOWCASE := "res://addons/playforge_showcase/plugin.gd"


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
	showcase.call("_start_showcase")
	var panel: Control = showcase.get("_panel")
	panel.call("seek", 3.5)
	await scene_tree.process_frame
	var preview: Control = panel.get("_preview_body")
	if preview.is_visible_in_tree():
		_fail("The optional mock preview must stay closed when the role cursors start.")
		return
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
	print("PLAYFORGE_SHOWCASE_EDITOR_OVERLAY_OK ", JSON.stringify(active))
	scene_tree.quit(0)


func _find_showcase(node: Node) -> EditorPlugin:
	if node is EditorPlugin and node.get_script() != null and node.get_script().resource_path == SHOWCASE:
		return node
	for child in node.get_children(true):
		var result := _find_showcase(child)
		if result != null:
			return result
	return null


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
