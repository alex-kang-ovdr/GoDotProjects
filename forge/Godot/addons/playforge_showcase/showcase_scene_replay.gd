@tool
extends RefCounted

signal import_requested(files: Array, staged: Array, pack_id: String)

const SCENE_PATH := "res://scenes/main.tscn"
const SOURCE_PATH := "res://playforge_replay_source.tscn"
const ROOT_NAME := &"ForgeReplay"
const NODE_TYPES := [
	"Node2D", "Node3D", "CanvasLayer", "ColorRect", "Label", "Polygon2D",
	"Sprite2D", "MeshInstance3D", "Camera3D", "DirectionalLight3D",
]
const EDITABLE_PROPERTIES := [
	"position", "rotation", "rotation_degrees", "scale", "transform", "size",
	"offset_left", "offset_top", "offset_right", "offset_bottom",
	"anchor_left", "anchor_top", "anchor_right", "anchor_bottom",
	"color", "modulate", "self_modulate", "texture", "mesh", "material_override",
	"label_settings", "text", "horizontal_alignment", "vertical_alignment",
	"visible", "polygon", "current", "light_energy",
]

var error_message := ""
var scene_edit_version := 0
var role_results := {}

var _steps: Array[Dictionary] = []
var _entries := {}
var _original_order: Array[String] = []
var _deferred_properties := {}
var _root: Node
var _blank_properties := {}
var _blank_groups: Array[StringName] = []
var _nodes := {}
var _initial_properties := {}
var _added: Array[String] = []
var _step_index := 0
var _finished := false


func configure(commands: Array[Dictionary]) -> void:
	_steps = commands


func claim(root: Node) -> bool:
	if has_scene():
		return true
	if root == null or root.scene_file_path != SCENE_PATH or root.name != ROOT_NAME:
		return _fail("시연을 시작하려면 ForgeReplay 장면을 열어 주세요.")
	if root.get_script() != null or root.get_child_count() != 0:
		return _fail("시연을 시작하려면 새 ForgeReplay 장면이 필요합니다.")
	if _entries.is_empty() and not _read_original():
		return false
	if root.get_class() != _entries["."].kind:
		return _fail("시연 장면과 원본의 루트 유형이 다릅니다.")
	_root = root
	_blank_groups = root.get_groups()
	_blank_properties.clear()
	for property: StringName in _entries["."].properties:
		_blank_properties[property] = _root.get(property)
	error_message = ""
	return true


func has_scene() -> bool:
	return is_instance_valid(_root) and _root.scene_file_path == SCENE_PATH


func source_asset(node_path: String, property: String) -> Resource:
	var entry: Dictionary = _entries.get(node_path, {})
	var value: Variant = entry.get("properties", {}).get(property)
	return value if value is Resource else null


func owns_scene(root: Node) -> bool:
	return has_scene() and root == _root


func close_scene() -> void:
	role_results.clear()
	_root = null
	_blank_properties.clear()
	_blank_groups.clear()
	_nodes.clear()
	_initial_properties.clear()
	_added.clear()
	_step_index = 0
	_finished = false


func reset() -> bool:
	if not has_scene():
		return _fail("시연 장면이 닫혔습니다.")
	if not _check_scene_changes([], true):
		return false
	_wipe()
	error_message = ""
	return true


func apply_snapshot(snapshot: Dictionary) -> bool:
	if not has_scene():
		return _fail("시연 장면이 닫혔습니다.")
	var end: int = snapshot.revision
	if end == _step_index:
		return true
	var rewind := end < _step_index
	if not _check_scene_changes(snapshot.createdOrder, rewind):
		return false
	if rewind:
		_wipe(snapshot.createdOrder)
	var changed := false
	for index in range(_step_index, end):
		var cue := _steps[index]
		match cue.action:
			"import":
				import_requested.emit(cue.files, cue.staged, cue.get("storePack", ""))
			"add":
				_add_original_node(cue.object)
				if is_instance_valid(_nodes.get(cue.object)):
					role_results[cue.role] = {"order": index, "phase": "success"}
				changed = true
			"set":
				var node: Node = _nodes[cue.object]
				var before: Variant = node.get(cue.property)
				node.set(cue.property, _entries[cue.object].properties[cue.property])
				role_results[cue.role] = {"order": index, "phase": "change", "before": before, "after": node.get(cue.property)}
				changed = true
			"finish":
				_finish_original()
				if _finished:
					role_results[cue.role] = {"order": index, "phase": "success"}
				changed = true
	_step_index = end
	if changed:
		scene_edit_version += 1
	error_message = ""
	return true


func diagnostics() -> Dictionary:
	var nodes: Array[Dictionary] = []
	for id: String in _added:
		var candidate: Variant = _nodes.get(id)
		if not is_instance_valid(candidate):
			continue
		var node: Node = candidate
		var location: Array = []
		if node is Node3D:
			location = [node.position.x, node.position.y, node.position.z]
		elif node is Node2D or node is Control:
			location = [node.position.x, node.position.y]
		nodes.append({
			"id": id, "name": str(node.name), "parent": _entries[id].parent, "kind": node.get_class(),
			"position": location, "visible": node.get("visible") != false,
			"label": node.text if node is Label else "",
		})
	var root_exists := has_scene()
	var root_script: Script = _root.get_script() if root_exists else null
	return {
		"scenePath": SCENE_PATH if root_exists else "", "rootName": str(_root.name) if root_exists else "",
		"rootClass": _root.get_class() if root_exists else "", "rootScript": root_script.resource_path if root_script != null else "",
		"nodes": nodes, "error": error_message, "finished": _finished,
	}


func _read_original() -> bool:
	var resource := ResourceLoader.load(SOURCE_PATH, "PackedScene") as PackedScene
	if resource == null:
		return _fail("시연 원본 장면을 열 수 없습니다.")
	var original := resource.get_state()
	if original.get_node_count() < 2 or original.get_node_count() > 129 or original.get_connection_count() != 0:
		return _fail("시연 원본 장면의 구조를 지원하지 않습니다.")
	var entries := {}
	var order: Array[String] = []
	for index in range(original.get_node_count()):
		var id := _scene_path(original.get_node_path(index))
		var kind := str(original.get_node_type(index))
		if not NODE_TYPES.has(kind) or original.get_node_instance(index) != null:
			return _fail("시연 원본 노드 '%s'의 유형을 지원하지 않습니다." % id)
		var properties := {}
		for property_index in range(original.get_node_property_count(index)):
			var property := original.get_node_property_name(index, property_index)
			var value: Variant = original.get_node_property_value(index, property_index)
			if property == &"script" and (id != "." or not value is Script):
				return _fail("시연 원본에는 루트 스크립트만 연결할 수 있습니다.")
			properties[property] = value
		entries[id] = {
			"name": original.get_node_name(index), "kind": kind,
			"parent": id.get_base_dir(), "owner": _scene_path(original.get_node_owner_path(index)),
			"properties": properties, "groups": original.get_node_groups(index),
		}
		if id != ".":
			order.append(id)
	if not entries.has(".") or entries["."].kind not in ["Node2D", "Node3D"]:
		return _fail("시연 원본의 루트 노드를 확인할 수 없습니다.")
	var added := {}
	var deferred := {}
	for step in _steps:
		match step.action:
			"add":
				var id: String = step.object
				if not entries.has(id):
					return _fail("시연 원본에 '%s' 노드가 없습니다." % id)
				var owner: String = entries[id].owner
				if owner != "." and not added.has(owner):
					return _fail("시연 원본의 소유 노드를 먼저 추가해야 합니다.")
				added[id] = true
			"set":
				var id: String = step.object
				if not _is_editable_property(step.property) or not entries[id].properties.has(step.property):
					return _fail("시연 원본에 '%s'의 '%s' 속성이 없습니다." % [id, step.property])
				if not deferred.has(id):
					deferred[id] = {}
				if deferred[id].has(step.property):
					return _fail("시연 속성 '%s'에 편집 단계가 중복되어 있습니다." % step.property)
				deferred[id][step.property] = true
			"finish":
				if added.size() != order.size():
					return _fail("시연이 원본의 모든 노드를 추가해야 합니다.")
	_entries = entries
	_original_order = order
	_deferred_properties = deferred
	return true


func _is_editable_property(property: String) -> bool:
	return property in EDITABLE_PROPERTIES or property.begins_with("theme_override_colors/") or property.begins_with("theme_override_font_sizes/")


func _scene_path(path: NodePath) -> String:
	return str(path).trim_prefix("./")


func _check_scene_changes(desired: Array, rewind: bool) -> bool:
	var expected_name: StringName = _entries["."].name if _finished else ROOT_NAME
	var expected_script: Script = _entries["."].properties.get("script") if _finished else null
	if _root.name != expected_name or _root.get_script() != expected_script:
		return _fail("시연 루트가 바뀌어 재생을 멈췄습니다.")
	var tracked := {}
	for id: String in _added:
		var candidate: Variant = _nodes.get(id)
		if not is_instance_valid(candidate):
			return _fail("시연이 만든 노드가 제거되어 재생을 멈췄습니다.")
		var node: Node = candidate
		var parent: Variant = _nodes.get(_entries[id].parent, _root)
		var owner: Variant = _root if _entries[id].owner == "." else _nodes.get(_entries[id].owner)
		if not is_instance_valid(parent) or node.get_parent() != parent or node.name != _entries[id].name or node.owner != owner:
			return _fail("시연이 만든 노드가 바뀌어 재생을 멈췄습니다.")
		tracked[node] = true
	if rewind:
		for id: String in _added:
			for child: Node in _nodes[id].get_children(true):
				if not tracked.has(child):
					return _fail("사용자가 추가한 자식 노드를 보존하기 위해 이전 위치로 이동할 수 없습니다.")
	for id: String in desired:
		if _nodes.has(id):
			continue
		var parent_path: String = _entries[id].parent
		var parent: Node = _root if parent_path.is_empty() else _nodes.get(parent_path)
		if parent != null and parent.has_node(NodePath(str(_entries[id].name))):
			return _fail("시연 노드 이름 '%s'을 이미 사용하고 있습니다." % _entries[id].name)
	return true


func _wipe(retained: Array = []) -> void:
	role_results.clear()
	# Keep surviving nodes attached so Godot can retain the Inspector and viewport references.
	var keep := {}
	var removed := {}
	for id: String in retained:
		keep[id] = true
	for id: String in _added:
		if not keep.has(id):
			removed[_nodes[id]] = true
	if Engine.is_editor_hint() and EditorInterface.get_edited_scene_root() == _root:
		var selection := EditorInterface.get_selection()
		var inspected := EditorInterface.get_inspector().get_edited_object()
		if removed.has(inspected) or (_finished and inspected == _root):
			EditorInterface.inspect_object(null, "", true)
		for selected: Node in selection.get_selected_nodes():
			if removed.has(selected):
				selection.remove_node(selected)
	if _finished:
		_root.set_script(null)
		for property: StringName in _blank_properties:
			if property != &"script":
				_root.set(property, _blank_properties[property])
		for group: StringName in _entries["."].groups:
			if group not in _blank_groups and _root.is_in_group(group):
				_root.remove_from_group(group)
		_root.name = ROOT_NAME
	if _finished or not _added.is_empty():
		scene_edit_version += 1
	for index in range(_added.size() - 1, -1, -1):
		var id := _added[index]
		if keep.has(id):
			continue
		var node: Node = _nodes[id]
		node.get_parent().remove_child(node)
		node.queue_free()
		_nodes.erase(id)
		_initial_properties.erase(id)
		_added.remove_at(index)
	if _finished:
		_restore_replay_order()
	for id: String in _added:
		var node: Node = _nodes[id]
		for property: StringName in _initial_properties[id]:
			node.set(property, _initial_properties[id][property])
	_finished = false
	_step_index = 0


func _restore_replay_order() -> void:
	var next_index := {}
	for index in range(_added.size() - 1, -1, -1):
		var node: Node = _nodes[_added[index]]
		var parent := node.get_parent()
		var target := int(next_index.get(parent, parent.get_child_count() - 1))
		if node.get_index() != target:
			parent.move_child(node, target)
		next_index[parent] = target - 1


func _add_original_node(id: String) -> void:
	if _nodes.has(id):
		return
	var original: Dictionary = _entries[id]
	var node := ClassDB.instantiate(original.kind) as Node
	node.name = original.name
	var parent: Node = _root if original.parent.is_empty() else _nodes[original.parent]
	var owner: Node = _root if original.owner == "." else _nodes[original.owner]
	parent.add_child(node)
	node.owner = owner
	var later: Dictionary = _deferred_properties.get(id, {})
	for property: StringName in original.properties:
		if not later.has(property):
			node.set(property, original.properties[property])
	for group: StringName in original.groups:
		node.add_to_group(group, true)
	var initial := {}
	for property: StringName in original.properties:
		initial[property] = node.get(property)
	_initial_properties[id] = initial
	_nodes[id] = node
	_added.append(id)


func _finish_original() -> void:
	var sibling_positions := {}
	for id: String in _original_order:
		var node: Node = _nodes[id]
		var parent := node.get_parent()
		var index := int(sibling_positions.get(parent, 0))
		parent.move_child(node, index)
		sibling_positions[parent] = index + 1
		# Reapply serialized fields in source order to match interdependent properties.
		for property: StringName in _entries[id].properties:
			node.set(property, _entries[id].properties[property])
	var original: Dictionary = _entries["."]
	_root.name = original.name
	for property: StringName in original.properties:
		if property != &"script":
			_root.set(property, original.properties[property])
	for group: StringName in original.groups:
		_root.add_to_group(group, true)
	_root.set_script(original.properties.get("script"))
	_finished = true


func _fail(message: String) -> bool:
	error_message = message
	return false
