class_name PlayForgeAvatarBridge
extends Node

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")

signal loadout_resolved(loadout: Dictionary)

static var _next_web_request_seq := 0

var _catalog: AvatarCatalog
var _http: HTTPRequest
var _js_callback: JavaScriptObject
var _pending_web_request_id := ""
var _exiting := false
var _resolved := false
var _last_loadout: Dictionary = {}


func _enter_tree() -> void:
	_exiting = false


func _exit_tree() -> void:
	_exiting = true
	_cleanup_web_callback()
	if _http != null and is_instance_valid(_http):
		_http.cancel_request()


func initialize(catalog: AvatarCatalog) -> void:
	_catalog = catalog
	if _catalog != null:
		_catalog.load_catalog()


func request_player_loadout() -> void:
	if _catalog == null:
		_catalog = AvatarCatalog.new()
		_catalog.load_catalog()
	_resolved = false

	# 1. PlayHub embedded web runtime via PlayHubBridge MessageChannel
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		if _try_request_web_bridge():
			return

	# 2. Explicit Hub origin (Desktop PIE or dev harness via env / cmdline)
	var hub_origin := _resolve_hub_origin()
	if not hub_origin.is_empty():
		_request_http_loadout(hub_origin + "/api/avatar/loadout")
		return

	# 3. Offline / headless / standalone default (with optional sealed CLI preview args)
	var fallback := _catalog.get_default_loadout()
	fallback = _apply_cmdline_preview_if_allowed(fallback)
	_emit_loadout(fallback)


func get_last_loadout() -> Dictionary:
	return _last_loadout.duplicate(true)


func _try_request_web_bridge() -> bool:
	var has_bridge := bool(JavaScriptBridge.eval(
		"typeof window !== 'undefined' && window.PlayHubBridge && typeof window.PlayHubBridge.getAvatarLoadout === 'function'",
		true
	))
	if not has_bridge:
		return false
	_cleanup_web_callback()
	_next_web_request_seq += 1
	var req_id := "pf_avatar_%d_%d" % [get_instance_id(), _next_web_request_seq]
	_pending_web_request_id = req_id
	_js_callback = JavaScriptBridge.create_callback(_on_web_loadout_callback)
	JavaScriptBridge.eval("window.__playforgeAvatarLoadoutCbs = window.__playforgeAvatarLoadoutCbs || {};", true)
	var cb_map: JavaScriptObject = JavaScriptBridge.get_interface("window")["__playforgeAvatarLoadoutCbs"]
	cb_map[req_id] = _js_callback
	JavaScriptBridge.eval("""
		((reqId) => {
			const deliver = (payload) => {
				const map = window.__playforgeAvatarLoadoutCbs;
				const cb = map && map[reqId];
				if (map) { delete map[reqId]; }
				if (typeof cb === 'function') { cb(payload); }
			};
			Promise.resolve(window.PlayHubBridge.getAvatarLoadout())
				.then((res) => deliver(JSON.stringify(res || {})))
				.catch(() => deliver('{}'));
		})(%s);
	""" % JSON.stringify(req_id), true)
	return true


func _cleanup_web_callback() -> void:
	if not _pending_web_request_id.is_empty():
		if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
			JavaScriptBridge.eval(
				"if (window.__playforgeAvatarLoadoutCbs) { delete window.__playforgeAvatarLoadoutCbs[%s]; }" % JSON.stringify(_pending_web_request_id),
				true
			)
		_pending_web_request_id = ""
	_js_callback = null


func _extract_loadout_dict(parsed: Variant) -> Dictionary:
	if not parsed is Dictionary:
		return {}
	var parsed_dict: Dictionary = parsed
	if parsed_dict.has("loadout"):
		var candidate: Variant = parsed_dict.get("loadout", null)
		if candidate is Dictionary:
			return candidate as Dictionary
		return {}
	return parsed_dict


func _on_web_loadout_callback(args: Array) -> void:
	_cleanup_web_callback()
	if _exiting:
		return
	if _catalog == null:
		_catalog = AvatarCatalog.new()
		_catalog.load_catalog()
	var raw: Dictionary = {}
	if not args.is_empty() and args[0] is String:
		var parsed: Variant = JSON.parse_string(str(args[0]))
		raw = _extract_loadout_dict(parsed)
	var normalized := _catalog.normalize_loadout(raw) if not raw.is_empty() else _catalog.get_default_loadout()
	_emit_loadout(normalized)


func _request_http_loadout(url: String) -> void:
	if _http == null:
		_http = HTTPRequest.new()
		_http.timeout = 4.0
		add_child(_http)
		_http.request_completed.connect(_on_http_completed)
	var err := _http.request(url)
	if err != OK:
		_emit_loadout(_catalog.get_default_loadout())


func _on_http_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _exiting:
		return
	if _catalog == null:
		_catalog = AvatarCatalog.new()
		_catalog.load_catalog()
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		_emit_loadout(_catalog.get_default_loadout())
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	var raw := _extract_loadout_dict(parsed)
	var normalized := _catalog.normalize_loadout(raw) if not raw.is_empty() else _catalog.get_default_loadout()
	_emit_loadout(normalized)


func _resolve_hub_origin() -> String:
	var env_origin := OS.get_environment("PLAYHUB_AVATAR_ORIGIN").strip_edges().trim_suffix("/")
	if not env_origin.is_empty() and (env_origin.begins_with("http://") or env_origin.begins_with("https://")):
		return env_origin
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--playhub-origin="):
			var value := arg.substr("--playhub-origin=".length()).strip_edges().trim_suffix("/")
			if value.begins_with("http://") or value.begins_with("https://"):
				return value
	return ""


func _apply_cmdline_preview_if_allowed(loadout: Dictionary) -> Dictionary:
	# Preview override via engine CLI args (debug/dev/test builds only; disabled in release builds).
	if not OS.is_debug_build():
		return _catalog.normalize_loadout(loadout)
	var updated := loadout.duplicate(true)
	var attachments: Dictionary = updated.get("attachments", {})
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--avatar-skin="):
			updated["skinId"] = arg.substr("--avatar-skin=".length()).strip_edges()
		elif arg.begins_with("--avatar-head="):
			attachments["head"] = arg.substr("--avatar-head=".length()).strip_edges()
		elif arg.begins_with("--avatar-back="):
			attachments["back"] = arg.substr("--avatar-back=".length()).strip_edges()
		elif arg.begins_with("--avatar-hand-r="):
			attachments["hand_r"] = arg.substr("--avatar-hand-r=".length()).strip_edges()
		elif arg.begins_with("--avatar-hand-l="):
			attachments["hand_l"] = arg.substr("--avatar-hand-l=".length()).strip_edges()
	updated["attachments"] = attachments
	return _catalog.normalize_loadout(updated)


func _emit_loadout(loadout: Dictionary) -> void:
	if _resolved:
		return
	_resolved = true
	_last_loadout = loadout.duplicate(true)
	loadout_resolved.emit(_last_loadout)
