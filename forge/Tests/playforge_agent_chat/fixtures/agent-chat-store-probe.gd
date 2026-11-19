@tool
extends EditorPlugin

const PACK_ID := "tappy-original"
const PACK_SIZE := 29
const OPERATION := "mcp-test-import-1"
const NEW_SOURCE := "res://Assets/chicken-wing-up.svg"
const NEW_AUDIO := "res://Assets/Audio/SFX_Click_01.tres"
const EXISTING_SOURCE := "res://Assets/chicken.svg"


func _enter_tree() -> void:
	_check_store_mcp.call_deferred()


func _check_store_mcp() -> void:
	var tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning() or EditorInterface.get_edited_scene_root() == null:
		await tree.process_frame
	var root := EditorInterface.get_edited_scene_root()
	var chat := tree.get_first_node_in_group(&"playforge_agent_chat") as EditorPlugin
	var store := tree.get_first_node_in_group(&"playforge_showcase_player") as EditorPlugin
	if chat == null or store == null:
		_fail("Both production plugins must be loaded for the MCP pack test.")
		return
	var recording: Dictionary = chat.call("recording_manifest")
	var manager := chat.get_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(root))
	var version := history.get_version()
	var preview := _import(chat, PACK_ID, OPERATION, true)
	if not preview.get("ok") or preview.get("state") != "preview" or preview.get("count") != PACK_SIZE or _status(chat, OPERATION).get("ok"):
		_fail("Dry run must return the pack plan without creating an operation: %s" % preview)
		return
	var invalid := _import(chat, "unregistered-pack", "invalid-pack")
	if invalid.get("ok") or invalid.get("state") != "error" or _import(chat, PACK_ID, "bad/id").get("ok"):
		_fail("Unknown packs and invalid operation IDs must be rejected: %s" % invalid)
		return
	if FileAccess.file_exists(NEW_SOURCE) or history.get_version() != version or chat.call("recording_manifest") != recording:
		_fail("Dry run and rejected pack commands must leave files, scene history and recording unchanged.")
		return
	var queued := _import(chat, PACK_ID, OPERATION)
	if not queued.get("ok") or queued.get("state") not in ["queued", "importing"] or queued.get("operationId") != OPERATION:
		_fail("Import call must acknowledge queuing without claiming completion: %s" % queued)
		return
	if _import(chat, PACK_ID, OPERATION) != queued or _status(chat, OPERATION) != queued:
		_fail("Retry and status must read the already-accepted operation without starting another import.")
		return
	if _import(chat, "unregistered-pack", OPERATION).get("ok") or _import(chat, PACK_ID, "mcp-concurrent").get("state") != "busy":
		_fail("Conflicting and concurrent operation IDs must be distinguished.")
		return
	var result := queued
	for frame in range(600):
		result = _status(chat, OPERATION)
		if result.get("state") in ["done", "error"]:
			break
		await tree.process_frame
	if not result.get("ok") or result.get("state") != "done" or result.get("first") != PACK_SIZE - 1 or result.get("count") != PACK_SIZE:
		_fail("MCP must return real completion for all 29 assets, with 28 first imports: %s" % result)
		return
	var receipt: Dictionary = store.call("store_diagnostics").get("receipt", {})
	if receipt.get("state") != "done" or receipt.get("files") != result.get("files") or not ResourceLoader.exists(NEW_SOURCE, "Texture2D"):
		_fail("MCP status must reflect the store receipt and an actual Godot Texture2D: %s" % receipt)
		return
	if not ResourceLoader.load(NEW_AUDIO) is AudioStreamWAV:
		_fail("The MCP pack must include usable original audio.")
		return
	var completed_version := history.get_version()
	if completed_version == version or _import(chat, PACK_ID, OPERATION) != result or history.get_version() != completed_version:
		_fail("The first import must register scene Undo while its retry leaves the undo history unchanged.")
		return
	var existing_bytes := FileAccess.get_file_as_bytes(EXISTING_SOURCE)
	var imported_bytes := FileAccess.get_file_as_bytes(NEW_SOURCE)
	history.undo()
	if FileAccess.file_exists(NEW_SOURCE) or FileAccess.file_exists(NEW_SOURCE + ".import") or FileAccess.file_exists(NEW_AUDIO) or FileAccess.get_file_as_bytes(EXISTING_SOURCE) != existing_bytes:
		_fail("Godot Undo must remove only the paths created by the MCP pack command.")
		return
	history.redo()
	if FileAccess.get_file_as_bytes(NEW_SOURCE) != imported_bytes or not FileAccess.file_exists(NEW_SOURCE + ".import") or not FileAccess.file_exists(NEW_AUDIO) or _status(chat, OPERATION) != result:
		_fail("Godot Redo must restore the import without replacing its original MCP completion receipt.")
		return
	if chat.call("recording_manifest") != recording or root.get_child_count() != 0:
		_fail("The project-wide file import must leave the scratch scene recording and scene nodes unchanged.")
		return
	print("PLAYFORGE_ASSET_PACK_MCP_OK")
	tree.quit(0)


func _import(chat: EditorPlugin, pack: String, operation: String, dry_run := false) -> Dictionary:
	return _call_tool(chat, "pf_asset_pack_import", {"packId":pack, "operationId":operation, "dryRun":dry_run})


func _status(chat: EditorPlugin, operation: String) -> Dictionary:
	return _call_tool(chat, "pf_asset_pack_status", {"operationId":operation})


func _call_tool(chat: EditorPlugin, tool: String, arguments: Dictionary) -> Dictionary:
	return chat.call("apply_call", {"jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{
		"name":tool, "arguments":arguments,
	}})


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
