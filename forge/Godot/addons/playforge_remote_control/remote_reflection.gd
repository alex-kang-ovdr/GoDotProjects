@tool
extends RefCounted

const RemoteWorkspace := preload("remote_workspace.gd")
const MAX_CODE_BYTES := 64 * 1024
const MAX_ENCODE_DEPTH := 4
const MAX_DESCRIBE_ITEMS := 120


func resolve_object(object_path: String, owner_plugin: EditorPlugin) -> Object:
	var path := object_path.strip_edges()
	var root := EditorInterface.get_edited_scene_root()
	if path.is_empty() or path == ".":
		return root
	match path:
		"@editor":
			return EditorInterface
		"@project":
			return ProjectSettings
		"@tree":
			return owner_plugin.get_tree() if owner_plugin != null else null
	if path.begins_with("/root/") and owner_plugin != null:
		return owner_plugin.get_tree().root.get_node_or_null(NodePath(path))
	if root != null:
		return root.get_node_or_null(NodePath(path))
	return null


func encode_value(value: Variant, depth: int = 0) -> Variant:
	if depth >= MAX_ENCODE_DEPTH:
		return str(value)
	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(value)
		TYPE_VECTOR2:
			var v: Vector2 = value
			return [v.x, v.y]
		TYPE_VECTOR2I:
			var v: Vector2i = value
			return [v.x, v.y]
		TYPE_VECTOR3:
			var v: Vector3 = value
			return [v.x, v.y, v.z]
		TYPE_VECTOR3I:
			var v: Vector3i = value
			return [v.x, v.y, v.z]
		TYPE_RECT2:
			var r: Rect2 = value
			return [r.position.x, r.position.y, r.size.x, r.size.y]
		TYPE_COLOR:
			var c: Color = value
			return [c.r, c.g, c.b, c.a]
		TYPE_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_FLOAT32_ARRAY:
			var out: Array = []
			for item: Variant in value:
				out.append(encode_value(item, depth + 1))
				if out.size() >= 128:
					break
			return out
		TYPE_DICTIONARY:
			var out := {}
			var count := 0
			for k: Variant in (value as Dictionary).keys():
				out[str(k)] = encode_value((value as Dictionary)[k], depth + 1)
				count += 1
				if count >= 128:
					break
			return out
		TYPE_OBJECT:
			if value == null or not is_instance_valid(value):
				return null
			if value is Resource:
				var res: Resource = value
				return res.resource_path if not res.resource_path.is_empty() else res.get_class()
			if value is Node:
				var node: Node = value
				return str(node.get_path()) if node.is_inside_tree() else str(node.name)
			return (value as Object).get_class()
	return str(value)


func describe_object(args: Dictionary, owner_plugin: EditorPlugin) -> Dictionary:
	var object_path := str(args.get("objectPath", "."))
	var target := resolve_object(object_path, owner_plugin)
	if target == null:
		return {"ok": false, "message": "객체를 찾을 수 없습니다: " + object_path}
	var prop_filter := str(args.get("filter", "")).strip_edges().to_lower()
	var include_methods: bool = args.get("includeMethods", true) != false
	var properties: Array[Dictionary] = []
	for info: Dictionary in target.get_property_list():
		var usage := int(info.get("usage", 0))
		if (usage & PROPERTY_USAGE_EDITOR) == 0 and (usage & PROPERTY_USAGE_SCRIPT_VARIABLE) == 0:
			continue
		var prop_name := str(info.get("name", ""))
		if prop_name.is_empty():
			continue
		if not prop_filter.is_empty() and not prop_name.to_lower().contains(prop_filter):
			continue
		properties.append({
			"name": prop_name,
			"type": type_string(int(info.get("type", TYPE_NIL))),
			"value": encode_value(target.get(prop_name)),
		})
		if properties.size() >= MAX_DESCRIBE_ITEMS:
			break
	var methods: Array[Dictionary] = []
	if include_methods:
		for m: Dictionary in target.get_method_list():
			var m_name := str(m.get("name", ""))
			if m_name.is_empty() or m_name.begins_with("_"):
				continue
			if not prop_filter.is_empty() and not m_name.to_lower().contains(prop_filter):
				continue
			var m_args: Array[String] = []
			for a: Variant in m.get("args", []):
				if a is Dictionary:
					m_args.append(str(a.get("name", "")))
			methods.append({"name": m_name, "args": m_args})
			if methods.size() >= MAX_DESCRIBE_ITEMS:
				break
	var script_path := ""
	var scr: Variant = target.get_script()
	if scr is Script and not (scr as Script).resource_path.is_empty():
		script_path = (scr as Script).resource_path
	return {
		"ok": true,
		"message": "객체 메타데이터를 조회했습니다: " + object_path,
		"data": {
			"objectPath": object_path,
			"class": target.get_class(),
			"script": script_path,
			"properties": properties,
			"methods": methods,
		},
	}


func get_object_property(args: Dictionary, owner_plugin: EditorPlugin) -> Dictionary:
	var object_path := str(args.get("objectPath", "."))
	var prop_name := str(args.get("propertyName", args.get("property", "")))
	if prop_name.is_empty():
		return {"ok": false, "message": "propertyName을 지정해 주세요."}
	var target := resolve_object(object_path, owner_plugin)
	if target == null:
		return {"ok": false, "message": "객체를 찾을 수 없습니다: " + object_path}
	var exists := false
	for info: Dictionary in target.get_property_list():
		if str(info.get("name", "")) == prop_name:
			exists = true
			break
	if not exists:
		return {"ok": false, "message": "속성을 찾을 수 없습니다: %s.%s" % [object_path, prop_name]}
	return {
		"ok": true,
		"message": "속성 값을 조회했습니다.",
		"data": {
			"objectPath": object_path,
			"propertyName": prop_name,
			"value": encode_value(target.get(prop_name)),
		},
	}


func set_object_property(args: Dictionary, owner_plugin: EditorPlugin, undo_redo: EditorUndoRedoManager) -> Dictionary:
	var object_path := str(args.get("objectPath", "."))
	var prop_name := str(args.get("propertyName", args.get("property", "")))
	var generate_transaction: bool = args.get("generateTransaction", true) != false
	if prop_name.is_empty():
		return {"ok": false, "message": "propertyName을 지정해 주세요."}
	var target := resolve_object(object_path, owner_plugin)
	if target == null:
		return {"ok": false, "message": "객체를 찾을 수 없습니다: " + object_path}
	var raw_val: Variant = args.get("value")
	var decoded_val: Variant = null
	if target is Node:
		var decoded := RemoteWorkspace.decode_property(target as Node, prop_name, raw_val)
		if not decoded.get("ok", false):
			return {"ok": false, "message": "속성 값을 변환할 수 없습니다: %s.%s" % [object_path, prop_name]}
		decoded_val = decoded.value
	else:
		var current: Variant = target.get(prop_name)
		decoded_val = RemoteWorkspace.decode_value(current, raw_val)
		if decoded_val == null and raw_val != null:
			return {"ok": false, "message": "속성 값을 변환할 수 없습니다: %s.%s" % [object_path, prop_name]}
	var prev_val: Variant = target.get(prop_name)
	var root := EditorInterface.get_edited_scene_root()
	if generate_transaction and undo_redo != null and target is Node and root != null and (target == root or root.is_ancestor_of(target as Node)):
		undo_redo.create_action("Remote Control: %s.%s" % [object_path, prop_name])
		undo_redo.add_do_property(target, StringName(prop_name), decoded_val)
		undo_redo.add_undo_property(target, StringName(prop_name), prev_val)
		undo_redo.commit_action()
	else:
		target.set(prop_name, decoded_val)
	return {
		"ok": true,
		"message": "속성을 변경했습니다: %s.%s" % [object_path, prop_name],
		"data": {
			"objectPath": object_path,
			"propertyName": prop_name,
			"value": encode_value(target.get(prop_name)),
			"transaction": generate_transaction,
		},
	}


func call_object_method(args: Dictionary, owner_plugin: EditorPlugin) -> Dictionary:
	var object_path := str(args.get("objectPath", "."))
	var fn_name := str(args.get("functionName", args.get("method", "")))
	if fn_name.is_empty():
		return {"ok": false, "message": "functionName을 지정해 주세요."}
	var target := resolve_object(object_path, owner_plugin)
	if target == null:
		return {"ok": false, "message": "객체를 찾을 수 없습니다: " + object_path}
	if not target.has_method(StringName(fn_name)):
		return {"ok": false, "message": "메서드를 찾을 수 없습니다: %s.%s" % [object_path, fn_name]}
	var raw_args: Variant = args.get("arguments", args.get("params", []))
	var call_args: Array = raw_args if raw_args is Array else []
	var ret: Variant = target.callv(StringName(fn_name), call_args)
	return {
		"ok": true,
		"message": "메서드를 호출했습니다: %s.%s" % [object_path, fn_name],
		"data": {
			"objectPath": object_path,
			"functionName": fn_name,
			"returnValue": encode_value(ret),
		},
	}


func eval_script(args: Dictionary, owner_plugin: EditorPlugin) -> Dictionary:
	var code := str(args.get("code", ""))
	if code.strip_edges().is_empty() or code.to_utf8_buffer().size() > MAX_CODE_BYTES:
		return {"ok": false, "message": "실행할 GDScript 코드가 비어있거나 64KB를 초과했습니다."}
	var object_path := str(args.get("objectPath", "."))
	var target := resolve_object(object_path, owner_plugin)
	var root := EditorInterface.get_edited_scene_root()
	var script_args: Dictionary = args.get("args", {}) if args.get("args") is Dictionary else {}
	var source := ""
	if code.contains("func run("):
		source = code if code.begins_with("@tool") else "@tool\nextends RefCounted\n" + code
	else:
		var lines := PackedStringArray()
		lines.append("@tool")
		lines.append("extends RefCounted")
		lines.append("func run(editor: EditorInterface, root: Node, target: Object, args: Dictionary) -> Variant:")
		for raw_line in code.replace("\r\n", "\n").split("\n"):
			lines.append("\t" + raw_line)
		lines.append("\treturn null")
		source = "\n".join(lines)
	var script := GDScript.new()
	script.source_code = source
	var err := script.reload()
	if err != OK:
		return {"ok": false, "message": "원격 GDScript 컴파일에 실패했습니다 (error=%d)." % err}
	var runner: Variant = script.new()
	if runner == null or not (runner is Object) or not (runner as Object).has_method(&"run"):
		return {"ok": false, "message": "원격 GDScript 인스턴스를 생성하지 못했습니다."}
	var result: Variant = (runner as Object).call(&"run", EditorInterface, root, target, script_args)
	return {
		"ok": true,
		"message": "원격 GDScript를 실행했습니다.",
		"data": {
			"objectPath": object_path,
			"returnValue": encode_value(result),
		},
	}
