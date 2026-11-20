@tool
extends EditorPlugin


func _enter_tree() -> void:
	call_deferred("_probe")


func _probe() -> void:
	var store_plugin: EditorPlugin = null
	for _i in 15:
		await get_tree().process_frame
		store_plugin = get_tree().get_first_node_in_group(&"playforge_asset_store") as EditorPlugin
		if store_plugin != null:
			break
	if store_plugin == null:
		_fail("playforge_asset_store EditorPlugin did not register.")
		return
	if store_plugin._has_main_screen():
		_fail("playforge_asset_store must not expose a central main screen tab.")
		return
	var main_screen := EditorInterface.get_editor_main_screen()
	if main_screen != null and main_screen.find_child("PlayForgeStoreDock", true, false) != null:
		_fail("PlayForgeStoreDock must never be mounted inside editor main screen.")
		return
	if store_plugin.call(&"get_registered_place") != "right":
		_fail("Default dock slot must be right (DOCK_SLOT_RIGHT_UL).")
		return

	var dock: Control = store_plugin.call(&"get_store_dock")
	if dock == null or not is_instance_valid(dock):
		_fail("Store dock control is invalid.")
		return

	var search := dock.find_child("LibrarySearch", true, false) as LineEdit
	if search == null:
		_fail("LibrarySearch control missing in Store dock.")
		return
	search.text = "tactical"

	# Verify switching between right -> left -> bottom -> right preserves control & search text without iframes
	for slot_mode in ["left", "bottom", "right"]:
		var ok: bool = store_plugin.call(&"switch_dock_slot", slot_mode)
		await get_tree().process_frame
		if not ok or store_plugin.call(&"get_registered_place") != slot_mode:
			_fail("Failed to switch dock slot to " + slot_mode)
			return
		if search.text != "tactical" or store_plugin.call(&"get_store_dock") != dock:
			_fail("Dock state or identity lost during slot switch to " + slot_mode)
			return

	print("PLAYFORGE_ASSET_STORE_EDITOR_OK")
	get_tree().quit(0)


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
