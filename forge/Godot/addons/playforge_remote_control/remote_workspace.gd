@tool
extends RefCounted

const MAX_OPERATIONS := 256
const MAX_FILE_BYTES := 512 * 1024
const WRITABLE_EXTS := ["svg", "tres", "gdshader", "json", "txt", "cfg", "gd", "tscn"]
const PROTECTED_DIRS := [".godot", ".git", "addons", ".playforge-store", ".playforge-import"]
const PROTECTED_FILES := ["project.godot", "playforge_replay_source.tscn", ".gdignore", ".gitignore", ".gitattributes", ".editorconfig"]
const FILE_OP_KINDS := ["asset.write", "asset.delete", "assets.clear", "script.write"]
const SCENE_OP_KINDS := ["node.add", "property.set", "node.delete", "node.rename", "scene.clear", "script.attach"]
const COMMON_PROPERTIES := [
	"position", "size", "scale", "rotation", "rotation_degrees",
	"text", "visible", "color", "modulate", "self_modulate", "z_index", "custom_minimum_size",
	"offset_left", "offset_top", "offset_right", "offset_bottom",
	"anchor_left", "anchor_top", "anchor_right", "anchor_bottom",
	"texture", "icon", "region_enabled", "region_rect", "centered", "flip_h", "flip_v",
	"script", "collision_layer", "collision_mask", "gravity_scale", "monitoring", "monitorable",
	"one_shot", "wait_time", "autostart", "autoplay", "volume_db", "pitch_scale",
]


static func valid_node_path(id: String) -> bool:
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


static func normalize_res_path(raw: Variant) -> String:
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


static func is_protected_path(res_path: String, current_scene_path: String = "") -> bool:
	var rel := res_path.trim_prefix("res://")
	if rel.is_empty() or rel in PROTECTED_FILES:
		return true
	if not current_scene_path.is_empty() and res_path == current_scene_path:
		return true
	var top := rel.split("/")[0]
	return top in PROTECTED_DIRS or top.begins_with(".")


static func decode_value(example: Variant, raw: Variant) -> Variant:
	match typeof(example):
		TYPE_VECTOR2, TYPE_VECTOR3:
			var dims := 2 if example is Vector2 else 3
			if not raw is Array or raw.size() != dims:
				return null
			for n: Variant in raw:
				if not (n is float or n is int) or not is_finite(n):
					return null
			return Vector2(raw[0], raw[1]) if dims == 2 else Vector3(raw[0], raw[1], raw[2])
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
			return raw if raw is String and (raw as String).length() <= 4096 else null
	return null


static func decode_property(node: Node, property: String, raw: Variant) -> Dictionary:
	if property in ["texture", "icon", "texture_normal", "texture_pressed", "texture_hover"]:
		if raw == null or (raw is String and (raw as String).strip_edges().is_empty()):
			return {"ok": true, "value": null}
		var path := normalize_res_path(raw)
		if path.is_empty():
			return {"ok": false}
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
		var path := normalize_res_path(raw)
		if path.is_empty() or not path.ends_with(".gd") or not FileAccess.file_exists(path):
			return {"ok": false}
		var script := ResourceLoader.load(path, "Script", ResourceLoader.CACHE_MODE_IGNORE) as Script
		if script != null:
			return {"ok": true, "value": script}
		return {"ok": false}
	var current: Variant = node.get(property)
	if current == null and not _node_has_property(node, property):
		return {"ok": false}
	var decoded: Variant = decode_value(current, raw)
	if decoded == null:
		return {"ok": false}
	return {"ok": true, "value": decoded}


static func _node_has_property(node: Node, property: String) -> bool:
	for info in node.get_property_list():
		if str(info.get("name", "")) == property:
			return true
	return false


func apply_operations(ops_variant: Variant, undo_redo: EditorUndoRedoManager, dry_run: bool = false) -> Dictionary:
	if not ops_variant is Array or (ops_variant as Array).is_empty() or (ops_variant as Array).size() > MAX_OPERATIONS:
		return {"ok": false, "message": "operations는 1~%d개의 배열이어야 합니다." % MAX_OPERATIONS}
	var ops: Array = ops_variant
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return {"ok": false, "message": "편집 중인 씬이 없습니다. 먼저 scene.open으로 씬을 여세요."}

	var file_ops: Array[Dictionary] = []
	var scene_ops: Array[Dictionary] = []
	var undo_ops: Array[Dictionary] = []
	for item: Variant in ops:
		if not item is Dictionary:
			return {"ok": false, "message": "모든 operation은 Dictionary여야 합니다."}
		var op: Dictionary = item
		var kind := str(op.get("kind", ""))
		if kind in FILE_OP_KINDS:
			file_ops.append(op)
		elif kind in SCENE_OP_KINDS:
			scene_ops.append(op)
		elif kind in ["editor.undo", "editor.redo"]:
			undo_ops.append(op)
		else:
			return {"ok": false, "message": "지원하지 않는 operation kind입니다: " + kind}

	if not undo_ops.is_empty():
		if undo_ops.size() != ops.size():
			return {"ok": false, "message": "editor.undo / editor.redo는 단독 작업으로 요청해 주세요."}
		var is_redo := str(undo_ops[0].get("kind", "")) == "editor.redo"
		var steps := clampi(int(undo_ops[0].get("value", 1)), 1, 50)
		return execute_history(undo_redo, is_redo, steps, dry_run)

	var current_scene := root.scene_file_path
	var file_check := _validate_file_ops(file_ops, current_scene)
	if not file_check.ok:
		return file_check

	if dry_run:
		return {"ok": true, "message": "원격 편집 명령 검증 완료 (%d개)" % ops.size()}

	var messages := PackedStringArray()
	var written_files := 0
	var imported_paths := PackedStringArray()
	if not file_ops.is_empty():
		var file_res := _apply_file_ops(file_ops, current_scene)
		if not file_res.ok:
			return file_res
		written_files = int(file_res.get("count", 0))
		imported_paths = file_res.get("imported", PackedStringArray())
		messages.append(str(file_res.message))

	var applied_scene_ops := 0
	if not scene_ops.is_empty():
		var scene_res := _apply_scene_ops(root, scene_ops, undo_redo)
		if not scene_res.ok:
			return scene_res
		applied_scene_ops = int(scene_res.get("count", 0))
		messages.append(str(scene_res.message))

	return {
		"ok": true,
		"message": "\n".join(messages),
		"data": {
			"writtenFiles": written_files,
			"importedPaths": Array(imported_paths),
			"appliedSceneOps": applied_scene_ops,
		},
	}


func execute_history(undo_redo: EditorUndoRedoManager, is_redo: bool, steps: int = 1, dry_run: bool = false) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return {"ok": false, "message": "편집 중인 씬이 없습니다."}
	var history := undo_redo.get_history_undo_redo(undo_redo.get_object_history_id(root))
	if history == null:
		return {"ok": false, "message": "Undo/Redo 히스토리를 찾을 수 없습니다."}
	var can_run := history.has_redo() if is_redo else history.has_undo()
	if not can_run:
		return {"ok": false, "message": "다시 실행할 기록이 없습니다." if is_redo else "되돌릴 편집 기록이 없습니다."}
	if dry_run:
		return {"ok": true, "message": "히스토리 명령 검증 완료"}
	var done := 0
	while done < steps:
		var ok := history.redo() if is_redo else history.undo()
		if not ok:
			break
		done += 1
	return {
		"ok": done > 0,
		"message": ("편집 %d단계를 다시 실행했습니다." if is_redo else "편집 %d단계를 되돌렸습니다.") % done,
		"data": {"steps": done, "action": "redo" if is_redo else "undo"},
	}


func _extract_path(op: Dictionary) -> String:
	var direct: Variant = op.get("path", "")
	if direct is String and not (direct as String).strip_edges().is_empty():
		return normalize_res_path(direct)
	var val: Variant = op.get("value")
	if val is Dictionary:
		return normalize_res_path(val.get("path", val.get("file", "")))
	if str(op.get("kind", "")) in ["asset.delete", "script.attach"] and val is String:
		return normalize_res_path(val)
	return ""


func _extract_content(op: Dictionary) -> Variant:
	var val: Variant = op.get("value")
	if val is Dictionary:
		return val.get("content", val.get("code", val.get("source", "")))
	if op.has("content") and op.get("content") is String:
		return op.get("content")
	return val


func _validate_file_ops(file_ops: Array[Dictionary], current_scene: String) -> Dictionary:
	for op in file_ops:
		var kind := str(op.get("kind", ""))
		if kind == "assets.clear":
			continue
		var res_path := _extract_path(op)
		if res_path.is_empty() or is_protected_path(res_path, current_scene):
			return {"ok": false, "message": "보호되거나 잘못된 파일 경로입니다: " + str(op.get("path", op.get("value", "")))}
		if kind in ["asset.write", "script.write"]:
			var ext := res_path.get_extension().to_lower()
			if kind == "script.write" and ext != "gd":
				return {"ok": false, "message": "script.write는 .gd 파일만 허용합니다: " + res_path}
			if ext not in WRITABLE_EXTS:
				return {"ok": false, "message": "지원하지 않는 파일 확장자입니다: " + res_path}
			var content: Variant = _extract_content(op)
			if not content is String or (content as String).to_utf8_buffer().size() > MAX_FILE_BYTES:
				return {"ok": false, "message": "파일 내용이 비어있거나 용량 제한(512KB)을 초과했습니다: " + res_path}
	return {"ok": true}


func _apply_file_ops(file_ops: Array[Dictionary], current_scene: String) -> Dictionary:
	var written := 0
	var imported := PackedStringArray()
	for op in file_ops:
		var kind := str(op.get("kind", ""))
		if kind in ["asset.write", "script.write"]:
			var res_path := _extract_path(op)
			var abs_path := ProjectSettings.globalize_path(res_path)
			DirAccess.make_dir_recursive_absolute(abs_path.get_base_dir())
			var file := FileAccess.open(res_path, FileAccess.WRITE)
			if file == null:
				return {"ok": false, "message": "파일을 쓰지 못했습니다: " + res_path}
			file.store_string(str(_extract_content(op)))
			file.close()
			written += 1
			if res_path.get_extension().to_lower() in ["svg", "png", "jpg", "webp", "wav", "ogg"]:
				imported.append(res_path)
		elif kind == "asset.delete":
			var res_path := _extract_path(op)
			var abs_path := ProjectSettings.globalize_path(res_path)
			if FileAccess.file_exists(res_path):
				DirAccess.remove_absolute(abs_path)
				written += 1
		elif kind == "assets.clear":
			_clear_user_assets("res://", current_scene)
			written += 1
	var fs := EditorInterface.get_resource_filesystem()
	if fs != null:
		fs.scan()
		if not imported.is_empty():
			fs.reimport_files(imported)
	return {"ok": true, "count": written, "imported": imported, "message": "스크립트·에셋 파일 %d개를 처리했습니다." % written}


func _clear_user_assets(dir_path: String, current_scene: String) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		var full := dir_path.path_join(name)
		if not is_protected_path(full, current_scene):
			if dir.current_is_dir():
				_clear_user_assets(full, current_scene)
				DirAccess.remove_absolute(ProjectSettings.globalize_path(full))
			else:
				DirAccess.remove_absolute(ProjectSettings.globalize_path(full))
		name = dir.get_next()
	dir.list_dir_end()


func _resolve_node(root: Node, object_id: String) -> Node:
	if object_id == ".":
		return root
	return root.get_node_or_null(NodePath(object_id))


func _apply_scene_ops(root: Node, scene_ops: Array[Dictionary], undo_redo: EditorUndoRedoManager) -> Dictionary:
	undo_redo.create_action("PlayForge Remote Control")
	var count := 0
	var created_nodes: Dictionary = {}
	for op in scene_ops:
		var kind := str(op.get("kind", ""))
		var object_id := str(op.get("objectId", "."))
		if not valid_node_path(object_id):
			return {"ok": false, "message": "잘못된 노드 경로입니다: " + object_id}
		match kind:
			"scene.clear":
				for child in root.get_children():
					undo_redo.add_do_method(root, &"remove_child", child)
					undo_redo.add_undo_method(root, &"add_child", child)
					undo_redo.add_undo_property(child, &"owner", root)
					undo_redo.add_undo_reference(child)
				count += 1
			"node.add":
				var type_name: Variant = op.get("type", "")
				if not valid_node_type(type_name) or object_id == ".":
					return {"ok": false, "message": "node.add의 노드 경로 또는 타입이 잘못되었습니다: %s (%s)" % [object_id, str(type_name)]}
				var slash := object_id.rfind("/")
				var parent_id := "." if slash < 0 else object_id.substr(0, slash)
				var node_name := object_id if slash < 0 else object_id.substr(slash + 1)
				var parent: Node = created_nodes.get(parent_id, _resolve_node(root, parent_id))
				if parent == null:
					return {"ok": false, "message": "부모 노드를 찾을 수 없습니다: " + parent_id}
				var node: Node = ClassDB.instantiate(str(type_name)) as Node
				node.name = node_name
				created_nodes[object_id] = node
				undo_redo.add_do_method(parent, &"add_child", node)
				undo_redo.add_do_property(node, &"owner", root)
				undo_redo.add_do_reference(node)
				undo_redo.add_undo_method(parent, &"remove_child", node)
				count += 1
			"property.set":
				var prop := str(op.get("propertyId", ""))
				var target: Node = created_nodes.get(object_id, _resolve_node(root, object_id))
				if target == null:
					return {"ok": false, "message": "대상 노드를 찾을 수 없습니다: " + object_id}
				var decoded := decode_property(target, prop, op.get("value"))
				if not decoded.get("ok", false):
					return {"ok": false, "message": "속성 값을 적용할 수 없습니다: %s.%s" % [object_id, prop]}
				undo_redo.add_do_property(target, StringName(prop), decoded.value)
				undo_redo.add_undo_property(target, StringName(prop), target.get(prop))
				count += 1
			"script.attach":
				var target: Node = created_nodes.get(object_id, _resolve_node(root, object_id))
				if target == null:
					return {"ok": false, "message": "스크립트를 연결할 노드를 찾을 수 없습니다: " + object_id}
				var script_path := _extract_path(op)
				var decoded := decode_property(target, "script", script_path)
				if not decoded.get("ok", false):
					return {"ok": false, "message": "스크립트를 로드할 수 없습니다: " + script_path}
				undo_redo.add_do_property(target, &"script", decoded.value)
				undo_redo.add_undo_property(target, &"script", target.get("script"))
				count += 1
			"node.delete":
				if object_id == ".":
					return {"ok": false, "message": "루트 노드는 삭제할 수 없습니다."}
				var target := _resolve_node(root, object_id)
				if target == null or target.get_parent() == null:
					return {"ok": false, "message": "삭제할 노드를 찾을 수 없습니다: " + object_id}
				var parent := target.get_parent()
				undo_redo.add_do_method(parent, &"remove_child", target)
				undo_redo.add_undo_method(parent, &"add_child", target)
				undo_redo.add_undo_property(target, &"owner", root)
				undo_redo.add_undo_reference(target)
				count += 1
			"node.rename":
				var new_name := str(op.get("value", "")).strip_edges()
				var target: Node = created_nodes.get(object_id, _resolve_node(root, object_id))
				if target == null or new_name.is_empty() or new_name.validate_node_name() != new_name:
					return {"ok": false, "message": "이름 변경 대상 또는 새 이름이 잘못되었습니다: " + object_id}
				undo_redo.add_do_property(target, &"name", new_name)
				undo_redo.add_undo_property(target, &"name", target.name)
				count += 1
	undo_redo.commit_action()
	return {"ok": true, "count": count, "message": "씬 편집 %d개를 적용했습니다." % count}
