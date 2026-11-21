@tool
extends EditorPlugin

const META_PATH := "res://.playforge-platform.json"
const DockScript = preload("res://addons/playforge_blender/blender_dock.gd")

var _dock: Control
var _js_place_callback: JavaScriptObject
var _js_status_callback: JavaScriptObject


func _enter_tree() -> void:
	var origin := "http://127.0.0.1:4173"
	var project_id := ""
	if FileAccess.file_exists(META_PATH):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(META_PATH))
		if parsed is Dictionary:
			project_id = str(parsed.get("id", ""))
	if OS.has_feature("web"):
		origin = str(JavaScriptBridge.eval("window.location.origin + (window.__playforgeBasePath || '')", true)).trim_suffix("/")

	_dock = DockScript.new()
	_dock.configure(self, origin, project_id)
	_dock.asset_placed.connect(_on_asset_placed)
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

	if OS.has_feature("web"):
		_install_web_bridge()


func _exit_tree() -> void:
	if OS.has_feature("web"):
		_remove_web_bridge()
	if is_instance_valid(_dock):
		remove_control_from_docks(_dock)
		_dock.queue_free()
	_dock = null


func _install_web_bridge() -> void:
	var win := JavaScriptBridge.get_interface("window")
	if win == null:
		return
	_js_place_callback = JavaScriptBridge.create_callback(_on_web_place_command)
	_js_status_callback = JavaScriptBridge.create_callback(_on_web_status_query)
	win.__playforgeBlenderPlaceAsset = _js_place_callback
	win.__playforgeBlenderEditorStatus = _js_status_callback
	JavaScriptBridge.eval("window.__playforgeBlenderAddonReady = true; window.dispatchEvent(new CustomEvent('playforge-blender-ready'));", true)


func _remove_web_bridge() -> void:
	JavaScriptBridge.eval("window.__playforgeBlenderAddonReady = false; delete window.__playforgeBlenderPlaceAsset; delete window.__playforgeBlenderEditorStatus;", true)
	_js_place_callback = null
	_js_status_callback = null


func _on_web_place_command(args: Array) -> void:
	if args.is_empty() or not is_instance_valid(_dock):
		return
	var parsed = JSON.parse_string(str(args[0]))
	if parsed is Dictionary:
		_dock.import_asset_from_manifest(parsed)


func _on_web_status_query(_args: Array) -> String:
	var root := EditorInterface.get_edited_scene_root()
	return JSON.stringify({
		"ready": true,
		"hasScene": root != null,
		"sceneName": String(root.name) if root != null else "",
	})


func _on_asset_placed(result: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	var safe := {
		"ok": bool(result.get("ok", false)),
		"placed": bool(result.get("placed", false)),
		"nodeName": str(result.get("nodeName", "")),
		"nodePath": str(result.get("nodePath", "")),
		"resGlbPath": str(result.get("resGlbPath", "")),
		"meshCount": int(result.get("meshCount", 0)),
		"error": str(result.get("error", "")),
	}
	JavaScriptBridge.eval(
		"window.dispatchEvent(new CustomEvent('playforge-blender-placed', { detail: %s }));" % JSON.stringify(safe),
		true
	)
