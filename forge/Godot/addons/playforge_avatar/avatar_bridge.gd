class_name PlayForgeAvatarBridge
extends Node

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")

signal loadout_resolved(loadout: Dictionary)

var _catalog: AvatarCatalog
var _http: HTTPRequest
var _js_callback: JavaScriptObject
var _resolved := false
var _last_loadout: Dictionary = {}


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
	_js_callback = JavaScriptBridge.create_callback(_on_web_loadout_callback)
	JavaScriptBridge.get_interface("window")["__playforgeAvatarLoadoutCb"] = _js_callback
	JavaScriptBridge.eval("""
		(() => {
			Promise.resolve(window.PlayHubBridge.getAvatarLoadout())
				.then((res) => {
					if (window.__playforgeAvatarLoadoutCb) {
						window.__playforgeAvatarLoadoutCb(JSON.stringify(res || {}));
					}
				})
				.catch(() => {
					if (window.__playforgeAvatarLoadoutCb) {
						window.__playforgeAvatarLoadoutCb('{}');
					}
				});
		})();
	""", true)
	return true


func _on_web_loadout_callback(args: Array) -> void:
	var raw: Dictionary = {}
	if not args.is_empty() and args[0] is String:
		var parsed: Variant = JSON.parse_string(str(args[0]))
		if parsed is Dictionary:
			raw = parsed.get("loadout", parsed) if parsed.has("loadout") else parsed
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
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		_emit_loadout(_catalog.get_default_loadout())
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if parsed is Dictionary:
		var raw: Dictionary = parsed.get("loadout", parsed) if parsed.has("loadout") else parsed
		_emit_loadout(_catalog.normalize_loadout(raw))
		return
	_emit_loadout(_catalog.get_default_loadout())


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
	# Preview override via engine CLI args (for automated tests / Forge preview launcher only).
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
