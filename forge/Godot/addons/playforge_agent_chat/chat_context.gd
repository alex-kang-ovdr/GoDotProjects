@tool
extends VBoxContainer

var _scene: WeakRef
var _nodes: Array[WeakRef] = []
var _busy := false
var _scene_label: Label
var _add_button: Button
var _chips: HFlowContainer


func _ready() -> void:
	var header := HBoxContainer.new()
	add_child(header)
	_scene_label = Label.new()
	_scene_label.name = "ChatContextScene"
	_scene_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scene_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(_scene_label)

	_add_button = Button.new()
	_add_button.name = "ChatAddSelection"
	_add_button.text = "선택 노드 추가"
	_add_button.tooltip_text = "선택한 노드를 다음 메시지의 문맥에 추가합니다."
	_add_button.pressed.connect(stage_selection)
	header.add_child(_add_button)

	_chips = HFlowContainer.new()
	_chips.name = "ChatContextNodes"
	add_child(_chips)
	refresh()


func refresh() -> void:
	var root := _sync_scene()
	if not is_instance_valid(_scene_label):
		return
	_scene_label.text = "열린 씬 없음" if root == null else (
		root.scene_file_path.get_file() if not root.scene_file_path.is_empty() else str(root.name))
	_scene_label.tooltip_text = root.scene_file_path if root != null else ""
	_add_button.disabled = _busy or _available_selection(root).is_empty()
	_render_chips(root)


func stage_selection() -> int:
	if _busy:
		return 0
	var root := _sync_scene()
	var selected := _available_selection(root)
	for node in selected:
		_nodes.append(weakref(node))
	refresh()
	return selected.size()


const PROTECTED_DIRS := [".godot", ".git", "addons", ".playforge-store", ".playforge-import"]
const PROTECTED_FILES := ["project.godot", "playforge_replay_source.tscn", ".gdignore", ".gitignore", ".gitattributes", ".editorconfig"]


func request_context() -> Dictionary:
	var root := _sync_scene()
	var selection: Array[Dictionary] = []
	var nodes: Array[Dictionary] = []
	var assets: Array[String] = []
	var store_packs: Array[Dictionary] = _collect_store_packs()
	var recent_logs: Array = _collect_recent_logs()
	_collect_assets("res://", assets, 0, 5, 80, root.scene_file_path if root != null else "")
	if root == null:
		var empty_ctx := {"scene": "", "selection": selection, "nodes": nodes, "assets": assets}
		if not store_packs.is_empty():
			empty_ctx["storePacks"] = store_packs
		if not recent_logs.is_empty():
			empty_ctx["recentLogs"] = recent_logs
		return empty_ctx
	for reference in _nodes:
		var node := reference.get_ref() as Node
		if node != null:
			selection.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
	_walk_nodes(root, root, nodes, 0, 6, 80)
	var ctx := {"scene": root.scene_file_path, "rootType": root.get_class(), "selection": selection, "nodes": nodes, "assets": assets}
	if not store_packs.is_empty():
		ctx["storePacks"] = store_packs
	if not recent_logs.is_empty():
		ctx["recentLogs"] = recent_logs
	return ctx


func _collect_recent_logs() -> Array:
	if not OS.has_feature("web"):
		return []
	var raw: Variant = JavaScriptBridge.eval("typeof window.__playforgeGetRecentLogs === 'function' ? JSON.stringify(window.__playforgeGetRecentLogs(20)) : '[]'", true)
	if not raw is String or (raw as String).is_empty():
		return []
	var parsed: Variant = JSON.parse_string(raw)
	return parsed if parsed is Array else []


func _collect_store_packs() -> Array[Dictionary]:
	var packs: Array[Dictionary] = []
	if not FileAccess.file_exists("res://.playforge-store.json"):
		return packs
	var catalog: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-store.json"))
	if not catalog is Dictionary or not catalog.get("packs") is Array:
		return packs
	for pack: Variant in catalog.packs:
		if pack is Dictionary and pack.get("id") is String and not (pack.id as String).is_empty():
			var files: Array = pack.get("files", []) if pack.get("files") is Array else []
			packs.append({
				"id": str(pack.id),
				"title": "PlayForge Built-in Template Pack (" + str(pack.id) + ")",
				"fileCount": files.size(),
				"files": files,
			})
	return packs


func _collect_assets(dir_path: String, out: Array[String], depth: int, max_depth: int, max_files: int, active_scene: String) -> void:
	if depth > max_depth or out.size() >= max_files:
		return
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty() and out.size() < max_files:
		if entry == "." or entry == "..":
			entry = dir.get_next()
			continue
		var full := dir_path.path_join(entry) if dir_path != "res://" else "res://" + entry
		if dir.current_is_dir():
			if depth == 0 and (entry in PROTECTED_DIRS or entry.begins_with(".")):
				entry = dir.get_next()
				continue
			_collect_assets(full, out, depth + 1, max_depth, max_files, active_scene)
		else:
			if entry.ends_with(".import") or entry.ends_with(".uid"):
				entry = dir.get_next()
				continue
			if depth == 0 and entry in PROTECTED_FILES:
				entry = dir.get_next()
				continue
			if not active_scene.is_empty() and full == active_scene:
				entry = dir.get_next()
				continue
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()


func _walk_nodes(node: Node, root: Node, out: Array[Dictionary], depth: int, max_depth: int, max_nodes: int) -> void:
	if out.size() >= max_nodes:
		return
	var rel := str(root.get_path_to(node))
	if rel.is_empty():
		rel = "."
	var entry := {"path": rel, "type": node.get_class()}
	var script: Script = node.get_script() as Script
	if script != null and not script.resource_path.is_empty():
		entry["script"] = script.resource_path
	out.append(entry)
	if depth >= max_depth:
		return
	if node != root and not node.scene_file_path.is_empty():
		return
	for child in node.get_children():
		if out.size() >= max_nodes:
			break
		_walk_nodes(child, root, out, depth + 1, max_depth, max_nodes)


func set_busy(busy: bool) -> void:
	_busy = busy
	refresh()


func clear_staged() -> void:
	_nodes.clear()
	refresh()


func _sync_scene() -> Node:
	var root := EditorInterface.get_edited_scene_root()
	if _scene == null or _scene.get_ref() != root:
		_scene = weakref(root) if root != null else null
		_nodes.clear()
		return root
	for index in range(_nodes.size() - 1, -1, -1):
		if not _belongs_to(root, _nodes[index].get_ref() as Node):
			_nodes.remove_at(index)
	return root


func _available_selection(root: Node) -> Array[Node]:
	var available: Array[Node] = []
	if root == null:
		return available
	var staged := {}
	for reference in _nodes:
		var node := reference.get_ref() as Node
		staged[node] = true
	for node in EditorInterface.get_selection().get_selected_nodes():
		if _belongs_to(root, node) and not staged.has(node):
			available.append(node)
	return available


func _belongs_to(root: Node, node: Node) -> bool:
	return root != null and node != null and (node == root or root.is_ancestor_of(node))


func _render_chips(root: Node) -> void:
	for chip in _chips.get_children():
		_chips.remove_child(chip)
		chip.queue_free()
	for reference in _nodes:
		var node := reference.get_ref() as Node
		var chip := Button.new()
		chip.text = "%s  ×" % node.name
		chip.tooltip_text = "문맥에서 제거 · %s" % root.get_path_to(node)
		chip.disabled = _busy
		chip.pressed.connect(_remove_node.bind(reference))
		_chips.add_child(chip)
	_chips.visible = not _nodes.is_empty()


func _remove_node(reference: WeakRef) -> void:
	if _busy:
		return
	_nodes.erase(reference)
	refresh()
