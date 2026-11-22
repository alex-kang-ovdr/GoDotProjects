@tool
class_name PlayForgeTripoGlbImporter
extends RefCounted

const TRIPO_ASSETS_DIR := "res://assets/tripo"


static func is_valid_glb_bytes(bytes: PackedByteArray) -> bool:
	if bytes.size() < 20:
		return false
	return bytes[0] == 0x67 and bytes[1] == 0x6C and bytes[2] == 0x54 and bytes[3] == 0x46


static func sanitize_slug(raw: String, fallback: String = "tripo_model") -> String:
	var re := RegEx.create_from_string("[^A-Za-z0-9_-]+")
	var cleaned := re.sub(raw.strip_edges(), "_", true)
	while cleaned.begins_with("_"):
		cleaned = cleaned.substr(1)
	while cleaned.ends_with("_"):
		cleaned = cleaned.substr(0, cleaned.length() - 1)
	if cleaned.is_empty():
		return fallback
	return cleaned.left(64)


static func _vec3_from_array(raw: Variant, fallback: Vector3) -> Vector3:
	if raw is Array and raw.size() == 3:
		return Vector3(float(raw[0]), float(raw[1]), float(raw[2]))
	return fallback


static func _set_owner_recursive(node: Node, owner_node: Node) -> void:
	if node == null or owner_node == null:
		return
	node.owner = owner_node
	for child in node.get_children():
		_set_owner_recursive(child, owner_node)


static func _inspect_hierarchy(root: Node) -> Dictionary:
	var stats := {
		"nodes": 0,
		"meshes": 0,
		"skeletons": 0,
		"bones": 0,
		"animationPlayers": 0,
		"animationNames": [] as Array[String],
	}
	if root == null:
		return stats
	var anim_names: Array[String] = []
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		stats["nodes"] = int(stats["nodes"]) + 1
		if current is MeshInstance3D:
			stats["meshes"] = int(stats["meshes"]) + 1
		if current is Skeleton3D:
			stats["skeletons"] = int(stats["skeletons"]) + 1
			stats["bones"] = int(stats["bones"]) + (current as Skeleton3D).get_bone_count()
		if current is AnimationPlayer:
			stats["animationPlayers"] = int(stats["animationPlayers"]) + 1
			for anim_name in (current as AnimationPlayer).get_animation_list():
				if not anim_names.has(String(anim_name)):
					anim_names.append(String(anim_name))
		for child in current.get_children():
			stack.append(child)
	stats["animationNames"] = anim_names
	return stats


static func _unique_child_name(parent: Node, base_name: String) -> String:
	var clean := base_name.validate_node_name()
	if clean.is_empty():
		clean = "TripoModel"
	if parent == null or parent.get_node_or_null(NodePath(clean)) == null:
		return clean
	var idx := 2
	while parent.get_node_or_null(NodePath("%s_%d" % [clean, idx])) != null:
		idx += 1
	return "%s_%d" % [clean, idx]


static func _resolve_target_parent(scene_root: Node, parent_path: String) -> Node:
	if scene_root == null:
		return null
	var trimmed := parent_path.strip_edges()
	if trimmed.is_empty() or trimmed == ".":
		return scene_root
	var found := scene_root.get_node_or_null(NodePath(trimmed))
	return found if found != null else scene_root


static func save_asset_files(glb_bytes: PackedByteArray, manifest: Dictionary) -> Dictionary:
	if not is_valid_glb_bytes(glb_bytes):
		return {"ok": false, "error": "INVALID_GLB_HEADER"}

	var slug := sanitize_slug(str(manifest.get("slug", manifest.get("name", "tripo_model"))))
	var abs_dir := ProjectSettings.globalize_path(TRIPO_ASSETS_DIR)
	var mk_err := DirAccess.make_dir_recursive_absolute(abs_dir)
	if mk_err != OK and mk_err != ERR_ALREADY_EXISTS:
		return {"ok": false, "error": "MKDIR_FAILED:%d" % mk_err}

	var res_glb_path := "%s/%s.glb" % [TRIPO_ASSETS_DIR, slug]
	var res_manifest_path := "%s/%s.tripo-asset.json" % [TRIPO_ASSETS_DIR, slug]

	var glb_file := FileAccess.open(res_glb_path, FileAccess.WRITE)
	if glb_file == null:
		return {"ok": false, "error": "GLB_WRITE_FAILED"}
	glb_file.store_buffer(glb_bytes)
	glb_file.close()

	var sidecar := {
		"schemaVersion": 1,
		"assetId": str(manifest.get("assetId", "")),
		"jobId": str(manifest.get("jobId", "")),
		"name": str(manifest.get("name", slug)),
		"slug": slug,
		"prompt": str(manifest.get("prompt", "")),
		"tripo": manifest.get("tripo", {}),
		"artifact": manifest.get("artifact", {}),
		"metrics": manifest.get("metrics", {}),
		"placement": manifest.get("placement", {}),
		"resGlbPath": res_glb_path,
	}
	var json_file := FileAccess.open(res_manifest_path, FileAccess.WRITE)
	if json_file != null:
		json_file.store_string(JSON.stringify(sidecar, "\t"))
		json_file.close()

	return {
		"ok": true,
		"slug": slug,
		"resGlbPath": res_glb_path,
		"resManifestPath": res_manifest_path,
	}


static func instantiate_glb_bytes(glb_bytes: PackedByteArray, base_dir: String = TRIPO_ASSETS_DIR) -> Node3D:
	if not is_valid_glb_bytes(glb_bytes):
		return null
	var gltf := GLTFDocument.new()
	var state := GLTFState.new()
	var err := gltf.append_from_buffer(glb_bytes, base_dir, state)
	if err != OK:
		return null
	var generated := gltf.generate_scene(state)
	if generated is Node3D:
		return generated as Node3D
	if generated != null:
		generated.queue_free()
	return null


static func import_glb_bytes_into_scene(
	glb_bytes: PackedByteArray,
	manifest: Dictionary,
	scene_root: Node,
	undo_redo: Object = null
) -> Dictionary:
	var saved := save_asset_files(glb_bytes, manifest)
	if not bool(saved.get("ok", false)):
		return saved

	var res_glb_path := str(saved.get("resGlbPath", ""))
	var res_manifest_path := str(saved.get("resManifestPath", ""))

	if scene_root == null:
		return {
			"ok": true,
			"placed": false,
			"warning": "NO_ACTIVE_SCENE",
			"resGlbPath": res_glb_path,
			"resManifestPath": res_manifest_path,
		}

	var instance := instantiate_glb_bytes(glb_bytes, TRIPO_ASSETS_DIR)
	if instance == null:
		return {
			"ok": false,
			"error": "GLTF_PARSE_FAILED",
			"resGlbPath": res_glb_path,
			"resManifestPath": res_manifest_path,
		}

	var placement: Dictionary = manifest.get("placement", {}) if manifest.get("placement") is Dictionary else {}
	var target_parent := _resolve_target_parent(scene_root, str(placement.get("parentPath", ".")))
	var node_name := _unique_child_name(target_parent, str(manifest.get("name", saved.get("slug", "TripoModel"))))

	instance.name = node_name
	instance.position = _vec3_from_array(placement.get("position", [0.0, 0.0, 0.0]), Vector3.ZERO)
	instance.rotation_degrees = _vec3_from_array(placement.get("rotationDeg", [0.0, 0.0, 0.0]), Vector3.ZERO)
	instance.scale = _vec3_from_array(placement.get("scale", [1.0, 1.0, 1.0]), Vector3.ONE)

	var artifact: Dictionary = manifest.get("artifact", {}) if manifest.get("artifact") is Dictionary else {}
	var tripo_meta: Dictionary = manifest.get("tripo", {}) if manifest.get("tripo") is Dictionary else {}
	instance.set_meta("_playforge_tripo_asset_id", str(manifest.get("assetId", "")))
	instance.set_meta("_playforge_tripo_task_id", str(tripo_meta.get("taskId", "")))
	instance.set_meta("_playforge_tripo_model_version", str(tripo_meta.get("modelVersion", "")))
	instance.set_meta("_playforge_tripo_prompt", str(manifest.get("prompt", "")))
	instance.set_meta("_playforge_tripo_sha256", str(artifact.get("sha256", "")))
	instance.set_meta("_playforge_tripo_res_path", res_glb_path)

	if undo_redo != null and undo_redo.has_method("create_action"):
		undo_redo.create_action("PlayForge Tripo 3D Place: %s" % node_name)
		undo_redo.add_do_method(target_parent, "add_child", instance, true)
		var stack: Array[Node] = [instance]
		while not stack.is_empty():
			var cur: Node = stack.pop_back()
			undo_redo.add_do_property(cur, "owner", scene_root)
			for child in cur.get_children():
				stack.append(child)
		undo_redo.add_do_reference(instance)
		undo_redo.add_undo_method(target_parent, "remove_child", instance)
		undo_redo.commit_action()
	else:
		target_parent.add_child(instance, true)
		_set_owner_recursive(instance, scene_root)

	var stats := _inspect_hierarchy(instance)
	return {
		"ok": true,
		"placed": true,
		"nodeName": String(instance.name),
		"nodePath": str(scene_root.get_path_to(instance)),
		"resGlbPath": res_glb_path,
		"resManifestPath": res_manifest_path,
		"nodeCount": int(stats.get("nodes", 0)),
		"meshCount": int(stats.get("meshes", 0)),
		"skeletonCount": int(stats.get("skeletons", 0)),
		"boneCount": int(stats.get("bones", 0)),
		"animationPlayerCount": int(stats.get("animationPlayers", 0)),
		"animationNames": stats.get("animationNames", []),
		"node": instance,
	}
