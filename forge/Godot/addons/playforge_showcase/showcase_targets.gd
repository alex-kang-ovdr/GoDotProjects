@tool
extends RefCounted

# Godot has public APIs for selection, inspected objects and row geometry. Only
# the built-in docks' child controls and toolbar shortcuts need discovery.
var _base: Control
var _scene_trees: Array[Node] = []
var _file_trees: Array[Node] = []
var _file_lists: Array[Node] = []
var _resource_selector: Control
var _buttons := {}
var _property_row: EditorProperty
var _property_object_id := 0
var _property_name := ""
var _property_refresh := 0


func configure(base: Control) -> void:
	_base = base
	_scene_trees.clear()
	_file_trees.clear()
	_file_lists.clear()
	_buttons.clear()
	_resource_selector = null
	_property_row = null
	_property_object_id = 0
	if not is_instance_valid(base):
		return
	var scene_docks := base.find_children("*", "SceneTreeDock", true, false)
	for dock in scene_docks:
		for editor in dock.find_children("*", "SceneTreeEditor", true, false):
			_scene_trees.append_array(editor.find_children("*", "Tree", true, false))
		_cache_shortcut_button(dock, "add_node", "scene_tree/add_child_node")
	var files := EditorInterface.get_file_system_dock()
	if files != null:
		_file_trees = files.find_children("*", "Tree", true, false)
		_file_lists = files.find_children("*", "ItemList", true, false)
	var inspector_dock: Node = EditorInterface.get_inspector()
	while inspector_dock != null and not inspector_dock.is_class("InspectorDock"):
		inspector_dock = inspector_dock.get_parent()
	if inspector_dock != null:
		var selectors := inspector_dock.find_children("*", "EditorObjectSelector", true, false)
		if selectors.size() == 1:
			_resource_selector = selectors[0] as Control
	for name: String in ["2D", "3D", "Script"]:
		_cache_shortcut_button(base, name, "editor/editor_" + name.to_lower())


func _cache_shortcut_button(scope: Node, id: String, shortcut_path: String) -> void:
	var settings := EditorInterface.get_editor_settings()
	if not settings.has_shortcut(shortcut_path):
		return
	var shortcut := settings.get_shortcut(shortcut_path)
	for button: Button in scope.find_children("*", "Button", true, false):
		if button.shortcut == shortcut and (id == "add_node" or button.theme_type_variation == &"MainScreenButton"):
			_buttons[id] = button
			return


func resolve(focus: Dictionary, root: Node, presentation: CodeEdit = null) -> Dictionary:
	if focus.is_empty() or not is_instance_valid(_base) or not _base.is_inside_tree():
		return {}
	var path := str(focus.get("selectedNode", ""))
	var node: Node = null
	if is_instance_valid(root) and not path.is_empty():
		node = root.get_node_or_null(NodePath(path))
	var target: Dictionary
	var button_id := str(focus.get("targetButton", ""))
	if not button_id.is_empty():
		var button: Button = _buttons.get(button_id)
		if is_instance_valid(button) and not button.disabled:
			target = _control_target("toolbar_button", tr("Add Node") if button_id == "add_node" else button_id, button)
	elif not str(focus.get("scriptPhase", "")).is_empty():
		target = _script_target(focus, presentation)
	else:
		var resource_path := str(focus.get("resourcePath", ""))
		var property := str(focus.get("property", ""))
		var resource_hint: Variant = focus.get("inspectorResource", false)
		if not resource_path.is_empty() or resource_hint:
			var source_property := str(focus.get("resourceProperty", property))
			target = _resource_target(node, source_property, resource_path, resource_hint, int(focus.get("inspectorResourceId", 0)))
		elif node != null and not property.is_empty():
			target = _property_target(node, property)
	if target.is_empty() and node != null and node.is_inside_tree():
		for tree: Tree in _scene_trees:
			if not _same_view(tree):
				continue
			var item := tree.get_selected()
			if item == null or not item.is_selected(0):
				continue
			var data: Variant = item.get_metadata(0)
			if (data is NodePath and data == node.get_path()) or (data is Node and data == node):
				target = _tree_target(tree, item, "scene_row", str(node.name))
				if not target.is_empty():
					break
	return target


func _script_target(focus: Dictionary, presentation: CodeEdit) -> Dictionary:
	if not _same_view(presentation):
		return {}
	var scripts := EditorInterface.get_script_editor()
	var current := scripts.get_current_editor()
	var script := scripts.get_current_script()
	if current == null or script == null or script.resource_path != str(focus.get("scriptPath", "")):
		return {}
	var original := current.get_base_editor() as CodeEdit
	if original == null or not original.is_ancestor_of(presentation):
		return {}
	var code := presentation
	var line := code.get_caret_line()
	var rect := Rect2(code.get_rect_at_line_column(line, code.get_caret_column()))
	if code.get_line_count() == 1 and code.get_line(0).is_empty():
		# TextEdit returns an empty character rect for a completely empty buffer.
		var caret := code.get_caret_draw_pos()
		if caret.y <= 0 or code.get_first_visible_line() != 0:
			return {}
		var style := code.get_theme_stylebox(&"normal" if code.editable else &"read_only")
		rect = Rect2(caret.x, style.get_margin(SIDE_TOP), 0, code.get_line_height())
	if rect.position.x < 0 or rect.size.y <= 0:
		return {}
	rect.size.x = maxf(rect.size.x, 2.0 * EditorInterface.get_editor_scale())
	return _target("script_caret", "%s · %d" % [script.resource_path.get_file(), line + 1], code, rect)


func _property_target(object: Object, property: String) -> Dictionary:
	var inspector := EditorInterface.get_inspector()
	if not _same_view(inspector) or inspector.get_edited_object() != object:
		return {}
	if is_instance_valid(_property_row) and _property_row.get_edited_object() == object and String(_property_row.get_edited_property()) == property:
		var cached := _control_target("inspector_property", property, _property_row)
		if not cached.is_empty():
			return cached
	# A missing or folded row can be created later by the inspector.
	var now := Time.get_ticks_msec()
	if _property_object_id == object.get_instance_id() and _property_name == property and now < _property_refresh:
		return {}
	_property_object_id = object.get_instance_id()
	_property_name = property
	_property_refresh = now + 250
	for editor: EditorProperty in inspector.find_children("*", "EditorProperty", true, false):
		if editor.get_edited_object() == object and String(editor.get_edited_property()) == property:
			var target := _control_target("inspector_property", property, editor)
			if not target.is_empty():
				_property_row = editor
				return target
	return {}


func _resource_target(node: Node, property: String, path: String, hint: Variant, object_id: int) -> Dictionary:
	if not path.is_empty() and not path.contains("::"):
		for tree: Tree in _file_trees:
			if not _same_view(tree):
				continue
			var item := tree.get_selected()
			if item != null and item.is_selected(0) and item.get_metadata(0) == path:
				var target := _tree_target(tree, item, "filesystem_item", path.get_file())
				if not target.is_empty():
					return target
		for list: ItemList in _file_lists:
			if not _same_view(list):
				continue
			for index in list.get_selected_items():
				if list.get_item_metadata(index) != path:
					continue
				var rect := list.get_item_rect(index, false)
				rect.position -= Vector2(list.get_h_scroll_bar().value, list.get_v_scroll_bar().value)
				if list.is_layout_rtl():
					rect.position.x = list.size.x - rect.end.x
				var target := _target("filesystem_item", path.get_file(), list, rect)
				if not target.is_empty() and list.get_item_at_position(_local_center(list, target), true) == index:
					return target
	var inspector := EditorInterface.get_inspector()
	if not _same_view(inspector):
		return {}
	var edited := inspector.get_edited_object() as Resource
	if edited == null:
		return {}
	if object_id != 0:
		if edited.get_instance_id() != object_id:
			return {}
	elif hint is Resource:
		if edited != hint:
			return {}
	elif not path.is_empty():
		if edited.resource_path != path:
			return {}
	elif node == null or property.is_empty() or node.get_indexed(NodePath(property)) != edited:
		return {}
	var label := edited.resource_name
	if label.is_empty():
		label = edited.resource_path.get_file() if not edited.resource_path.is_empty() else edited.get_class()
	return _control_target("inspector_resource", label, _resource_selector)


func _tree_target(tree: Tree, item: TreeItem, kind: String, label: String) -> Dictionary:
	if not item.is_visible_in_tree() or (item == tree.get_root() and tree.hide_root):
		return {}
	var parent := item.get_parent()
	while parent != null:
		if parent.collapsed:
			return {}
		parent = parent.get_parent()
	# Tree already subtracts its scroll offsets. Hit-testing also rejects a row
	# hidden behind column headers or a tree that hasn't finished laying out.
	var target := _target(kind, label, tree, tree.get_item_area_rect(item, 0))
	if not target.is_empty() and tree.get_item_at_position(_local_center(tree, target)) == item:
		return target
	return {}


func _local_center(control: Control, target: Dictionary) -> Vector2:
	var rect: Rect2 = target.rect
	return control.get_global_transform_with_canvas().affine_inverse() * rect.get_center()


func _same_view(control: Control) -> bool:
	return is_instance_valid(control) and control.is_inside_tree() and control.is_visible_in_tree() and control.get_viewport() == _base.get_viewport()


func _control_target(kind: String, label: String, control: Control) -> Dictionary:
	if not _same_view(control):
		return {}
	return _target(kind, label, control, Rect2(Vector2.ZERO, control.size))


func _target(kind: String, label: String, control: Control, local: Rect2) -> Dictionary:
	var bounds := Rect2(Vector2.ZERO, control.size)
	var rect := control.get_global_transform_with_canvas() * local.intersection(bounds)
	var parent := control.get_parent()
	while parent != null and parent != _base:
		if parent is Control and parent.clip_contents:
			var clipper := parent as Control
			rect = rect.intersection(clipper.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, clipper.size))
		parent = parent.get_parent()
	rect = rect.intersection(_base.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, _base.size))
	if not rect.has_area():
		return {}
	return {"kind": kind, "label": label, "rect": rect}
