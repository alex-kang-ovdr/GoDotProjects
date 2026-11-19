@tool
extends RefCounted

const TYPES := ["Node2D", "Node3D", "Control", "Label", "Button", "ColorRect", "CanvasLayer", "Sprite2D", "Marker2D", "Marker3D"]
const PROPERTIES := [
	"position", "size", "scale", "rotation", "rotation_degrees",
	"text", "visible", "color", "modulate", "self_modulate", "z_index", "custom_minimum_size",
	"offset_left", "offset_top", "offset_right", "offset_bottom",
	"anchor_left", "anchor_top", "anchor_right", "anchor_bottom",
	"mouse_filter", "horizontal_alignment", "vertical_alignment", "autowrap_mode",
	"texture_filter", "texture_repeat", "centered", "flip_h", "flip_v", "offset",
	"region_enabled", "region_rect", "texture", "icon", "expand_icon", "flat", "icon_alignment",
	"alignment", "clip_text", "focus_mode", "disabled", "toggle_mode", "button_pressed",
	"texture_normal", "texture_pressed", "texture_hover", "ignore_texture_size", "stretch_mode", "expand_mode",
	"pivot_offset", "layout_mode", "anchors_preset", "grow_horizontal", "grow_vertical",
	"script", "collision_layer", "collision_mask", "gravity_scale", "monitoring", "monitorable",
	"one_shot", "wait_time", "autostart", " autoplay", "autoplay", "volume_db", "pitch_scale",
]
const ROLES := {
	"gui": ["GUI", "#dd8ef1", "inspector"], "level": ["레벨", "#69dbc0", "viewport"],
	"script": ["스크립트", "#f6c970", "script"], "assets": ["에셋", "#78b8ff", "filesystem"],
}
const MAX_OPERATIONS := 256
var error_message := ""
var scene_edit_version := 0
var role_results := {}
var _root: Node
var _steps: Array = []
var _applied: Array[Dictionary] = []
var _detached_nodes: Array[WeakRef] = []
var _cursor := 0
signal history_step(root: Node, call_record: Dictionary, cues: Array, reverted: bool)

static func valid_path(id: String) -> bool:
	if id == ".":
		return true
	if id.is_empty() or id.length() > 256:
		return false
	for part in id.split("/"):
		if part.is_empty() or part.validate_node_name() != part or part in [".", ".."]:
			return false
	return true

static func valid_node_type(type_name: Variant) -> bool:
	if not type_name is String or type_name.is_empty() or type_name.length() > 128:
		return false
	return ClassDB.class_exists(type_name) and ClassDB.is_parent_class(type_name, "Node") and ClassDB.can_instantiate(type_name)

static func decode_value(example: Variant, raw: Variant) -> Variant:
	match typeof(example):
		TYPE_VECTOR2, TYPE_VECTOR3:
			var dimensions := 2 if example is Vector2 else 3
			if not raw is Array or raw.size() != dimensions:
				return null
			for n: Variant in raw:
				if not (n is float or n is int) or not is_finite(n):
					return null
			return Vector2(raw[0], raw[1]) if dimensions == 2 else Vector3(raw[0], raw[1], raw[2])
		TYPE_RECT2:
			if not raw is Array or raw.size() != 4:
				return null
			for n: Variant in raw:
				if not (n is float or n is int) or not is_finite(n):
					return null
			return Rect2(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]))
		TYPE_COLOR:
			if raw is String and Color.html_is_valid(raw):
				return Color(raw)
			if raw is Array and (raw.size() == 3 or raw.size() == 4):
				for n: Variant in raw:
					if not (n is float or n is int) or not is_finite(n):
						return null
				return Color(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]) if raw.size() == 4 else 1.0)
			return null
		TYPE_FLOAT:
			return float(raw) if (raw is float or raw is int) and is_finite(raw) else null
		TYPE_INT:
			return int(raw) if (raw is int or (raw is float and is_finite(raw) and floor(raw) == raw)) else null
		TYPE_BOOL:
			return raw if raw is bool else null
		TYPE_STRING:
			return raw if raw is String and raw.length() <= 4096 else null
	return null

static func _normalize_res_path(raw: Variant) -> String:
	if not raw is String:
		return ""
	var text := (raw as String).strip_edges().replace("\\", "/")
	if text.is_empty() or text.length() > 512:
		return ""
	if not text.begins_with("res://"):
		text = "res://" + text.trim_prefix("/")
	text = text.simplify_path()
	if not text.begins_with("res://") or text == "res://" or text.contains(".."):
		return ""
	return text

static func decode_property(node: Node, property: String, raw: Variant, staged_files: Dictionary = {}) -> Dictionary:
	if property in ["texture", "icon", "texture_normal", "texture_pressed", "texture_hover"]:
		if raw == null or (raw is String and (raw as String).strip_edges().is_empty()):
			return {"ok": true, "value": null}
		var path := _normalize_res_path(raw)
		if path.is_empty():
			return {"ok": false}
		if staged_files.has(path):
			return {"ok": true, "value": null}
		if ResourceLoader.exists(path, "Texture2D"):
			var tex := ResourceLoader.load(path, "Texture2D") as Texture2D
			if tex != null:
				return {"ok": true, "value": tex}
		if FileAccess.file_exists(path) and path.ends_with(".svg"):
			var img := Image.new()
			if img.load_svg_from_buffer(FileAccess.get_file_as_bytes(path)) == OK:
				return {"ok": true, "value": ImageTexture.create_from_image(img)}
		return {"ok": false}
	if property == "script":
		if raw == null or (raw is String and (raw as String).strip_edges().is_empty()):
			return {"ok": true, "value": null}
		var path := _normalize_res_path(raw)
		if path.is_empty() or not path.ends_with(".gd"):
			return {"ok": false}
		if staged_files.has(path):
			return {"ok": true, "value": null}
		if FileAccess.file_exists(path):
			var loaded := ResourceLoader.load(path, "Script", ResourceLoader.CACHE_MODE_REPLACE) as Script
			if loaded != null:
				return {"ok": true, "value": loaded}
			var gd := GDScript.new()
			gd.source_code = FileAccess.get_file_as_string(path)
			if gd.reload(true) == OK:
				gd.take_over_path(path)
				return {"ok": true, "value": gd}
		return {"ok": false}
	var decoded: Variant = decode_value(node.get(property), raw)
	if decoded == null:
		return {"ok": false}
	return {"ok": true, "value": decoded}

static func restore_owners(node: Node, owner: Node, is_top: bool = true) -> void:
	node.owner = owner
	if not is_top and not node.scene_file_path.is_empty():
		return
	for child in node.get_children():
		restore_owners(child, owner, false)

static func attach(parent: Node, node: Node, owner: Node) -> void:
	parent.add_child(node)
	restore_owners(node, owner)

func _is_removed(node: Node, removed: Dictionary) -> bool:
	var cursor: Node = node
	while cursor != null:
		if removed.has(cursor):
			return true
		cursor = cursor.get_parent()
	return false

static func normalize_node_id(raw_id: String, root: Node = null, kind: String = "") -> String:
	var id := raw_id.strip_edges().replace("\\", "/")
	if id.begins_with("./"):
		id = id.substr(2)
	elif id.begins_with("/root/"):
		id = id.substr(6)
	elif id.begins_with("/"):
		id = id.substr(1)
	if kind == "scene.clear" or id.is_empty() or id in [".", "root", "current_scene"]:
		return "."
	if root != null:
		var root_name := String(root.name)
		if id == root_name and root.get_node_or_null(NodePath(id)) == null:
			return "."
		if id.begins_with(root_name + "/"):
			var stripped := id.substr(root_name.length() + 1)
			if not stripped.is_empty():
				return stripped
	return id

func prepare(root: Node, operations: Array, staged_files: Dictionary = {}) -> Array[Dictionary]:
	error_message = ""
	var result: Array[Dictionary] = []
	var staged := {}
	var removed := {}
	for op: Variant in operations:
		if not op is Dictionary:
			error_message = "명령은 JSON 객체여야 합니다."
			break
		var kind_str := str(op.get("kind", ""))
		var id := normalize_node_id(str(op.get("objectId", "")), root, kind_str)
		var role := str(op.get("role", "level"))
		if not valid_path(id) or not ROLES.has(role) or op.has("componentId") or op.has("expectedPropertyRevision"):
			error_message = "지원하는 씬 노드 경로와 역할을 지정해 주세요. 컴포넌트 ID와 리비전 조건은 이 편집기에서 처리할 수 없습니다."
			break
		var node: Node = root if id == "." else staged.get(id)
		if node == null:
			node = root.get_node_or_null(NodePath(id))
			if node != null and _is_removed(node, removed):
				node = null
		var step := {"object": id, "role": role, "text": str(op.get("description", "")).left(240)}
		match kind_str:
			"node.add":
				var parent_id := id.get_base_dir()
				if parent_id.is_empty():
					parent_id = "."
				var parent: Node = staged.get(parent_id)
				if parent == null:
					parent = root.get_node_or_null(NodePath(parent_id))
					if parent != null and _is_removed(parent, removed):
						parent = null
				if node != null or parent == null or not valid_node_type(op.get("type")):
					error_message = "추가할 노드의 이름, 부모 또는 유형을 확인해 주세요: " + id
					break
				node = ClassDB.instantiate(op.type) as Node
				node.name = id.get_file()
				staged[id] = node
				step.merge({"action": "add", "type": op.type, "node": node, "parent": parent})
				if step.text.is_empty():
					step.text = "%s 노드를 추가합니다" % id
			"property.set":
				var property := str(op.get("propertyId", ""))
				if node == null or not property in PROPERTIES or (property != "script" and not property in node):
					error_message = "편집할 노드 또는 속성을 찾을 수 없습니다: %s · %s" % [id, property]
					break
				var check := decode_property(node, property, op.get("value"), staged_files)
				if not check.ok:
					error_message = "%s 속성의 값 형식이 올바르지 않습니다." % property
					break
				step.merge({"action": "set", "property": property, "value": op.get("value"), "node": node, "decoded": check.value})
				if step.text.is_empty():
					step.text = "%s의 %s 속성을 바꿉니다" % [id, property]
			"script.attach":
				var path_arg: Variant = op.get("path", "")
				var raw_script: Variant = path_arg if (path_arg is String and not (path_arg as String).strip_edges().is_empty()) else op.get("value", "")
				if node == null:
					error_message = "스크립트를 연결할 노드를 찾을 수 없습니다: " + id
					break
				var script_check := decode_property(node, "script", raw_script, staged_files)
				if not script_check.ok:
					error_message = "연결할 스크립트 파일을 찾을 수 없거나 문법 오류가 있습니다: " + str(raw_script)
					break
				step.merge({"action": "set", "property": "script", "value": raw_script, "node": node, "decoded": script_check.value})
				if step.text.is_empty():
					step.text = "%s 노드에 %s 스크립트를 연결합니다" % [id, str(raw_script)]
			"node.delete":
				if id == "." or node == null or node == root:
					error_message = "삭제할 자식 노드를 찾을 수 없습니다(씬 루트는 scene.clear를 사용하세요): " + id
					break
				if staged.has(id):
					error_message = "같은 작업 묶음에서 방금 추가한 노드는 삭제할 수 없습니다: " + id
					break
				var parent := node.get_parent()
				if parent == null:
					error_message = "삭제할 노드의 부모를 찾을 수 없습니다: " + id
					break
				removed[node] = true
				step.merge({"action": "delete", "node": node, "parent": parent, "index": node.get_index()})
				if step.text.is_empty():
					step.text = "%s 노드를 삭제합니다" % id
			"node.rename":
				var new_name := str(op.get("value", "")).strip_edges()
				if id == "." or node == null or node == root:
					error_message = "이름을 바꿀 자식 노드를 찾을 수 없습니다: " + id
					break
				if new_name.is_empty() or new_name.length() > 128 or new_name.validate_node_name() != new_name or new_name in [".", ".."]:
					error_message = "유효한 새 노드 이름을 지정해 주세요: " + new_name
					break
				var parent := node.get_parent()
				if parent != null and parent.get_node_or_null(NodePath(new_name)) != null and parent.get_node_or_null(NodePath(new_name)) != node:
					error_message = "같은 이름의 형제 노드가 이미 있습니다: " + new_name
					break
				step.merge({"action": "rename", "node": node, "value": new_name, "old_name": String(node.name)})
				if step.text.is_empty():
					step.text = "%s 노드 이름을 %s(으)로 바꿉니다" % [id, new_name]
			"scene.clear":
				if id != ".":
					error_message = "scene.clear의 objectId는 루트(.)여야 합니다."
					break
				var children: Array[Node] = []
				for child in root.get_children():
					if not _is_removed(child, removed):
						children.append(child)
						removed[child] = true
				step.merge({"action": "clear", "children": children})
				if step.text.is_empty():
					step.text = "씬의 모든 자식 노드(%d개)를 지워 빈 맵으로 초기화합니다" % children.size()
			_:
				error_message = "지원하지 않는 작업: " + str(op.get("kind"))
				break
		result.append(step)
	if not error_message.is_empty():
		for node: Node in staged.values():
			node.free()
		result.clear()
	return result

func validate_batch(root: Node, operations: Array, staged_files: Dictionary = {}) -> bool:
	var plans := prepare(root, operations, staged_files)
	for plan in plans:
		if plan.action == "add":
			plan.node.free()
	return not plans.is_empty()

func _write_property(node: Node, property: String, value: Variant, prior: Dictionary) -> void:
	prior.value = node.get(property)
	if node is Control:
		prior.offsets = [node.offset_left, node.offset_top, node.offset_right, node.offset_bottom]
	node.set(property, value)
	prior.applied = node.get(property)

func _restore_property(node: Node, property: String, prior: Dictionary) -> void:
	node.set(property, prior.value)
	if prior.has("offsets"):
		for side in range(4):
			node.set_offset(side, prior.offsets[side])

func _restore_deleted_node(parent: Node, node: Node, index: int, owner: Node) -> void:
	if node.get_parent() == null:
		parent.add_child(node)
	parent.move_child(node, mini(index, parent.get_child_count() - 1))
	restore_owners(node, owner)

func capture_steps(root: Node, operations: Array, undo: EditorUndoRedoManager, call_record: Dictionary) -> Array:
	var plans := prepare(root, operations)
	if plans.is_empty():
		return []
	undo.create_action("AI Agent 씬 편집", UndoRedo.MERGE_DISABLE, root, true)
	var cues: Array = []
	undo.add_undo_method(self, "_notify_history", root, call_record, cues, true)
	for plan in plans:
		match plan.action:
			"add":
				var node: Node = plan.node
				undo.add_do_method(plan.parent, "add_child", node)
				undo.add_do_method(node, "set_owner", root)
				undo.add_undo_method(plan.parent, "remove_child", node)
				undo.add_do_reference(node)
			"set":
				var node: Node = plan.node
				var prior := {}
				undo.add_do_method(self, "_write_property", node, plan.property, plan.decoded, prior)
				undo.add_undo_method(self, "_restore_property", node, plan.property, prior)
			"delete":
				var node: Node = plan.node
				var parent: Node = plan.parent
				var idx: int = plan.index
				_detached_nodes.append(weakref(node))
				undo.add_do_method(parent, "remove_child", node)
				undo.add_undo_method(self, "_restore_deleted_node", parent, node, idx, root)
				undo.add_undo_reference(node)
			"rename":
				var node: Node = plan.node
				undo.add_do_property(node, "name", plan.value)
				undo.add_undo_property(node, "name", plan.old_name)
			"clear":
				var children: Array[Node] = plan.children
				var indices: Array[int] = []
				for child in children:
					indices.append(child.get_index())
					_detached_nodes.append(weakref(child))
				for i in range(children.size() - 1, -1, -1):
					undo.add_do_method(root, "remove_child", children[i])
				for i in range(children.size()):
					undo.add_undo_method(self, "_restore_deleted_node", root, children[i], indices[i], root)
					undo.add_undo_reference(children[i])
		cues.append(recorded_cue(plan))
	undo.add_do_method(self, "_notify_history", root, call_record, cues, false)
	undo.commit_action()
	return cues

func _notify_history(root: Node, call_record: Dictionary, cues: Array, reverted: bool) -> void:
	history_step.emit(root, call_record, cues, reverted)

static func recorded_cue(plan: Dictionary) -> Dictionary:
	var cue := plan.duplicate()
	for key in ["node", "parent", "decoded", "children", "index", "old_name"]:
		cue.erase(key)
	return cue

func configure(steps: Array) -> void:
	_steps = steps

func claim(root: Node) -> bool:
	if root == null:
		return _fail("시연 장면을 열어 주세요.")
	_root = root
	return true

func owns_scene(root: Node) -> bool:
	return is_instance_valid(_root) and root == _root

func close_scene() -> void:
	_free_detached_replay_nodes()
	_root = null
	role_results.clear()
	_applied.clear()
	_cursor = 0

func _free_detached_replay_nodes() -> void:
	for plan: Dictionary in _applied:
		if plan.action == "delete" and is_instance_valid(plan.get("node")) and plan.node.get_parent() == null:
			plan.node.free()
		elif plan.action == "clear":
			for child: Node in plan.get("children", []):
				if is_instance_valid(child) and child.get_parent() == null:
					child.free()
	for ref: WeakRef in _detached_nodes:
		var node := ref.get_ref() as Node
		if is_instance_valid(node) and node.get_parent() == null:
			node.free()
	_detached_nodes.clear()

func reset() -> bool:
	return apply_snapshot({"revision": 0})

func diagnostics() -> Dictionary:
	return {"scenePath": _root.scene_file_path if is_instance_valid(_root) else "", "revision": _cursor, "error": error_message}

func apply_snapshot(snapshot: Dictionary) -> bool:
	if not is_instance_valid(_root):
		return _fail("시연 장면이 닫혔습니다.")
	var target: int = snapshot.revision
	if target < _cursor:
		role_results.clear()
		while not _applied.is_empty():
			if not _reverse_edit(_applied.back().object):
				return false
		_cursor = 0
	while _cursor < target:
		var step: Dictionary = _steps[_cursor]
		if step.action == "revert":
			if not _reverse_edit(step.object):
				return false
			role_results[step.role] = {"order": _cursor, "phase": "undo"}
			_cursor += 1
			continue
		if step.action == "point":
			_cursor += 1
			continue
		var kind_map := {
			"add": "node.add",
			"set": "property.set",
			"delete": "node.delete",
			"rename": "node.rename",
			"clear": "scene.clear",
		}
		var op := {
			"kind": kind_map.get(step.action, ""),
			"objectId": step.object,
			"role": step.role,
			"type": step.get("type"),
			"propertyId": step.get("property"),
			"value": step.get("value"),
		}
		var plans := prepare(_root, [op])
		if plans.is_empty():
			return false
		var plan := plans[0]
		match plan.action:
			"add":
				attach(plan.parent, plan.node, _root)
				if plan.node.get_parent() == plan.parent:
					role_results[step.role] = {"order": _cursor, "phase": "success"}
			"set":
				var before: Variant = plan.node.get(plan.property)
				plan.prior = {}
				_write_property(plan.node, plan.property, plan.decoded, plan.prior)
				role_results[step.role] = {"order": _cursor, "phase": "change", "before": before, "after": plan.node.get(plan.property)}
			"delete":
				plan.parent.remove_child(plan.node)
				role_results[step.role] = {"order": _cursor, "phase": "delete"}
			"rename":
				plan.node.name = plan.value
				role_results[step.role] = {"order": _cursor, "phase": "change", "before": plan.old_name, "after": plan.value}
			"clear":
				plan.indices = []
				for child: Node in plan.children:
					plan.indices.append(child.get_index())
				for i in range(plan.children.size() - 1, -1, -1):
					_root.remove_child(plan.children[i])
				role_results[step.role] = {"order": _cursor, "phase": "clear"}
		_applied.append(plan)
		_cursor += 1
		scene_edit_version += 1
	error_message = ""
	return true

func _reverse_edit(id: String) -> bool:
	if _applied.is_empty() or id != _applied.back().object:
		return _fail("녹화의 되돌리기 순서가 일치하지 않습니다.")
	var last := _applied.back() as Dictionary
	match last.action:
		"add":
			var node := _root.get_node_or_null(NodePath(id))
			if node == null or node != last.node:
				return _fail("시연 중 노드가 변경되어 되감기를 중단했습니다.")
			if node.get_child_count() != 0:
				return _fail("시연 중 추가한 자식 노드가 있습니다.")
			node.get_parent().remove_child(node)
			node.free()
		"set":
			var node := _root.get_node_or_null(NodePath(id))
			if node == null or node != last.node:
				return _fail("시연 중 노드가 변경되어 되감기를 중단했습니다.")
			if node.get(last.property) != last.prior.applied:
				return _fail("시연 중 수정한 속성을 보존했습니다.")
			_restore_property(node, last.property, last.prior)
		"delete":
			if not is_instance_valid(last.node) or not is_instance_valid(last.parent):
				return _fail("삭제된 노드를 복원할 수 없습니다.")
			_restore_deleted_node(last.parent, last.node, last.index, _root)
		"rename":
			if not is_instance_valid(last.node):
				return _fail("이름이 변경된 노드를 찾을 수 없습니다.")
			last.node.name = last.old_name
		"clear":
			for i in range(last.children.size()):
				var child: Node = last.children[i]
				if is_instance_valid(child):
					_restore_deleted_node(_root, child, last.indices[i], _root)
	_applied.pop_back()
	scene_edit_version += 1
	return true

func _fail(reason: String) -> bool:
	error_message = reason
	return false
