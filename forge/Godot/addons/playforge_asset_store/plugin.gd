@tool
extends EditorPlugin

const StoreDock := preload("store_dock.gd")
const PackageInstaller := preload("package_installer.gd")
const DOCK_SETTING_KEY := "playforge/asset_store/dock_slot"
const GROUP_NAME := &"playforge_asset_store"
const BOTTOM_PANEL_TITLE := "PlayForge Store"

var _dock: Control
var _slot_mode := "right"
var _registered_place := ""


func _enter_tree() -> void:
	add_to_group(GROUP_NAME)
	_slot_mode = _load_saved_slot_mode()
	_dock = StoreDock.new()
	_dock.name = "PlayForgeStoreDock"
	_configure_endpoints()
	_dock.set_slot_mode(_slot_mode)
	_dock.dock_slot_requested.connect(_on_dock_slot_requested)
	_register_dock(_slot_mode)


func _exit_tree() -> void:
	_unregister_dock()
	if _dock != null and is_instance_valid(_dock):
		if _dock.dock_slot_requested.is_connected(_on_dock_slot_requested):
			_dock.dock_slot_requested.disconnect(_on_dock_slot_requested)
		_dock.queue_free()
	_dock = null


func _has_main_screen() -> bool:
	return false


func get_store_dock() -> Control:
	return _dock


func get_current_slot_mode() -> String:
	return _slot_mode


func get_registered_place() -> String:
	return _registered_place


func switch_dock_slot(slot_mode: String) -> bool:
	if not slot_mode in ["right", "left", "bottom"]:
		return false
	if slot_mode == _slot_mode and _registered_place == slot_mode:
		return true
	_slot_mode = slot_mode
	if _dock != null:
		_dock.set_slot_mode(slot_mode)
		_unregister_dock()
		_register_dock(slot_mode)
	_save_slot_mode(slot_mode)
	return true


func _on_dock_slot_requested(slot_mode: String) -> void:
	switch_dock_slot(slot_mode)


func _register_dock(slot_mode: String) -> void:
	if _dock == null:
		return
	match slot_mode:
		"left":
			add_control_to_dock(DOCK_SLOT_LEFT_UL, _dock)
			_registered_place = "left"
		"bottom":
			add_control_to_bottom_panel(_dock, BOTTOM_PANEL_TITLE)
			make_bottom_panel_item_visible(_dock)
			_registered_place = "bottom"
		_:
			add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
			_registered_place = "right"


func _unregister_dock() -> void:
	if _dock == null or not is_instance_valid(_dock):
		_registered_place = ""
		return
	if _registered_place == "bottom":
		remove_control_from_bottom_panel(_dock)
	elif not _registered_place.is_empty():
		remove_control_from_docks(_dock)
	_registered_place = ""


func _configure_endpoints() -> void:
	var store_cfg: Dictionary = {}
	if FileAccess.file_exists("res://.playforge-store-config.json"):
		var raw_cfg: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-store-config.json"))
		if raw_cfg is Dictionary:
			store_cfg = raw_cfg
	var web_url := OS.get_environment("PLAYFORGE_STORE_WEB_URL")
	var api_url := OS.get_environment("PLAYFORGE_STORE_API_URL")
	var account_id := OS.get_environment("PLAYFORGE_STORE_ACCOUNT_ID")
	var legacy_lib_url := OS.get_environment("PLAYFORGE_ASSET_LIBRARY_URL")
	if web_url.is_empty() and not str(store_cfg.get("store_web_url", "")).is_empty():
		web_url = str(store_cfg.get("store_web_url", ""))
	if api_url.is_empty() and not str(store_cfg.get("store_api_url", "")).is_empty():
		api_url = str(store_cfg.get("store_api_url", ""))
	if account_id.is_empty() and not str(store_cfg.get("account_id", "")).is_empty():
		account_id = str(store_cfg.get("account_id", ""))
	if api_url.is_empty() and not legacy_lib_url.is_empty():
		api_url = legacy_lib_url.trim_suffix("/") + "/store"
	if web_url.is_empty() and OS.has_feature("web"):
		web_url = str(JavaScriptBridge.eval("window.__playforgeStoreWebUrl || (location.origin + '/store/')", true))
	if api_url.is_empty() and OS.has_feature("web"):
		api_url = str(JavaScriptBridge.eval("window.__playforgeStoreApiUrl || (['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin + (window.__playforgeBasePath || '') + '/api/asset-library/store' : '')", true))
	if account_id.is_empty() and OS.has_feature("web"):
		account_id = str(JavaScriptBridge.eval("window.__playforgeStoreAccountId || ''", true))
	_dock.set_endpoints(web_url, api_url)
	if not account_id.is_empty():
		_dock.set_account_id(account_id)
	var project_id := OS.get_environment("PLAYFORGE_PROJECT_ID")
	if project_id.is_empty() and FileAccess.file_exists("res://.playforge-platform.json"):
		var meta: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://.playforge-platform.json"))
		if meta is Dictionary and not str(meta.get("id", "")).is_empty():
			project_id = str(meta.id)
	if not project_id.is_empty():
		_dock.set_target_projects([{"id": project_id, "name": project_id + " (res://)", "root": "res://"}])


func _load_saved_slot_mode() -> String:
	var env_slot := OS.get_environment("PLAYFORGE_STORE_DOCK_SLOT").strip_edges().to_lower()
	if env_slot in ["right", "left", "bottom"]:
		return env_slot
	var settings := EditorInterface.get_editor_settings()
	if settings != null and settings.has_setting(DOCK_SETTING_KEY):
		var saved := str(settings.get_setting(DOCK_SETTING_KEY))
		if saved in ["right", "left", "bottom"]:
			return saved
	return "right"


func _save_slot_mode(slot_mode: String) -> void:
	var settings := EditorInterface.get_editor_settings()
	if settings != null:
		settings.set_setting(DOCK_SETTING_KEY, slot_mode)
