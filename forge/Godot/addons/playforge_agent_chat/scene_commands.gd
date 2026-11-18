@tool
extends RefCounted

const TYPES := ["Node2D", "Node3D", "Control", "Label", "Button", "ColorRect", "CanvasLayer", "Sprite2D", "Marker2D", "Marker3D"]
const PROPERTIES := ["position", "size", "scale", "rotation", "rotation_degrees", "text", "visible", "color", "modulate"]
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
		TYPE_COLOR:
			return Color(raw) if raw is String and Color.html_is_valid(raw) else null
		TYPE_FLOAT:
			return float(raw) if (raw is float or raw is int) and is_finite(raw) else null
		TYPE_BOOL:
			return raw if raw is bool else null
		TYPE_STRING:
			return raw if raw is String and raw.length() <= 4096 else null
	return null

func prepare(root: Node, operations: Array) -> Array[Dictionary]:
	error_message = ""
	var result: Array[Dictionary] = []
	var staged := {}
	for op: Variant in operations:
		if not op is Dictionary:
			error_message = "명령은 JSON 객체여야 합니다."
			break
		var id := str(op.get("objectId", ""))
		var role := str(op.get("role", "level"))
		if not valid_path(id) or not ROLES.has(role) or op.has("componentId") or op.has("expectedPropertyRevision"):
			error_message = "지원하는 씬 노드 경로와 역할을 지정해 주세요. 컴포넌트 ID와 리비전 조건은 이 편집기에서 처리할 수 없습니다."
			break
		var node: Node = staged.get(id)
		if node == null:
			node = root.get_node_or_null(NodePath(id))
		var step := {"object": id, "role": role, "text": str(op.get("description", "")).left(240)}
		match op.get("kind"):
			"node.add":
				var parent_id := id.get_base_dir()
				if parent_id.is_empty():
					parent_id = "."
				var parent: Node = staged.get(parent_id)
				if parent == null:
					parent = root.get_node_or_null(NodePath(parent_id))
				if node != null or parent == null or not TYPES.has(op.get("type")):
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
				if node == null or not property in PROPERTIES or not property in node:
					error_message = "편집할 노드 또는 속성을 찾을 수 없습니다: %s · %s" % [id, property]
					break
				var value: Variant = decode_value(node.get(property), op.get("value"))
				if value == null:
					error_message = "%s 속성의 값 형식이 올바르지 않습니다." % property
					break
				step.merge({"action": "set", "property": property, "value": op.value, "node": node, "decoded": value})
				if step.text.is_empty():
					step.text = "%s의 %s 속성을 바꿉니다" % [id, property]
			_:
				error_message = "지원하지 않는 작업: " + str(op.get("kind"))
				break
		result.append(step)
	if not error_message.is_empty():
		for node: Node in staged.values():
			node.free()
		result.clear()
	return result

func validate_batch(root: Node, operations: Array) -> bool:
	var plans := prepare(root, operations)
	for plan in plans:
		if plan.action == "add":
			plan.node.free()
	return not plans.is_empty()

static func attach(parent: Node, node: Node, owner: Node) -> void:
	parent.add_child(node)
	node.owner = owner

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

func capture_steps(root: Node, operations: Array, undo: EditorUndoRedoManager, call_record: Dictionary) -> Array:
	var plans := prepare(root, operations)
	if plans.is_empty():
		return []
	undo.create_action("AI Agent 씬 편집", UndoRedo.MERGE_DISABLE, root, true)
	var cues: Array = []
	undo.add_undo_method(self, "_notify_history", root, call_record, cues, true)
	for plan in plans:
		var node: Node = plan.node
		if plan.action == "add":
			undo.add_do_method(plan.parent, "add_child", node)
			undo.add_do_method(node, "set_owner", root)
			undo.add_undo_method(plan.parent, "remove_child", node)
			undo.add_do_reference(node)
		else:
			var prior := {}
			undo.add_do_method(self, "_write_property", node, plan.property, plan.decoded, prior)
			undo.add_undo_method(self, "_restore_property", node, plan.property, prior)
		cues.append(recorded_cue(plan))
	undo.add_do_method(self, "_notify_history", root, call_record, cues, false)
	undo.commit_action()
	return cues

func _notify_history(root: Node, call_record: Dictionary, cues: Array, reverted: bool) -> void:
	history_step.emit(root, call_record, cues, reverted)

static func recorded_cue(plan: Dictionary) -> Dictionary:
	var cue := plan.duplicate()
	for key in ["node", "parent", "decoded"]:
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
	_root = null
	role_results.clear()
	_applied.clear()
	_cursor = 0

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
		var op := {"kind": "node.add" if step.action == "add" else "property.set", "objectId": step.object, "role": step.role, "type": step.get("type"), "propertyId": step.get("property"), "value": step.get("value")}
		var plans := prepare(_root, [op])
		if plans.is_empty():
			return false
		var plan := plans[0]
		if plan.action == "add":
			attach(plan.parent, plan.node, _root)
			if plan.node.get_parent() == plan.parent:
				role_results[step.role] = {"order": _cursor, "phase": "success"}
		else:
			var before: Variant = plan.node.get(plan.property)
			plan.prior = {}
			_write_property(plan.node, plan.property, plan.decoded, plan.prior)
			role_results[step.role] = {"order": _cursor, "phase": "change", "before": before, "after": plan.node.get(plan.property)}
		_applied.append(plan)
		_cursor += 1
		scene_edit_version += 1
	error_message = ""
	return true

func _reverse_edit(id: String) -> bool:
	if _applied.is_empty() or id != _applied.back().object:
		return _fail("녹화의 되돌리기 순서가 일치하지 않습니다.")
	var last := _applied.back() as Dictionary
	var node := _root.get_node_or_null(NodePath(id))
	if node == null or node != last.node:
		return _fail("시연 중 노드가 변경되어 되감기를 중단했습니다.")
	if last.action == "add":
		if node.get_child_count() != 0:
			return _fail("시연 중 추가한 자식 노드가 있습니다.")
		node.get_parent().remove_child(node)
		node.free()
	else:
		if node.get(last.property) != last.prior.applied:
			return _fail("시연 중 수정한 속성을 보존했습니다.")
		_restore_property(node, last.property, last.prior)
	_applied.pop_back()
	scene_edit_version += 1
	return true

func _fail(reason: String) -> bool:
	error_message = reason
	return false
