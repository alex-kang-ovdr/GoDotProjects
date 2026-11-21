extends Node
## PlayHub Runtime SDK (Android Godot 4.7.2 + Web HTML5 unified bridge)
## Runtime-only autoload: zero Forge / editor dependencies.

signal bridge_response(req_id: String, ok: bool, payload: Dictionary)
signal host_paused()
signal host_resumed()
signal host_snapshot_requested()
signal iap_updated(payload: Dictionary)
signal social_invite_received(payload: Dictionary)

const ANDROID_SINGLETON := "PlayHubBridge"

var _android_bridge: Object = null
var _is_ready: bool = false

func _ready() -> void:
	if Engine.has_singleton(ANDROID_SINGLETON):
		_android_bridge = Engine.get_singleton(ANDROID_SINGLETON)
		if _android_bridge.has_signal("bridge_response"):
			_android_bridge.connect("bridge_response", Callable(self, "_on_android_response"))
		if _android_bridge.has_signal("bridge_event"):
			_android_bridge.connect("bridge_event", Callable(self, "_on_android_event"))

func is_android_host() -> bool:
	return _android_bridge != null

func get_profile() -> Dictionary:
	if _android_bridge != null and _android_bridge.has_method("get_profile"):
		var raw: String = str(_android_bridge.call("get_profile"))
		var parsed: Variant = JSON.parse_string(raw)
		if parsed is Dictionary:
			return parsed
	return {
		"displayName": "Local Player",
		"handle": "@local",
		"isGuest": true,
		"ageTier": "UNKNOWN",
		"runtime": OS.get_name().to_lower()
	}

func notify_ready() -> String:
	_is_ready = true
	if _android_bridge != null and _android_bridge.has_method("ready"):
		return str(_android_bridge.call("ready"))
	return ""

func load_save(slot: String = "main") -> String:
	if _android_bridge != null and _android_bridge.has_method("save_load"):
		return str(_android_bridge.call("save_load", slot))
	return ""

func write_save(payload: Dictionary, slot: String = "main") -> String:
	if _android_bridge != null and _android_bridge.has_method("save_write"):
		return str(_android_bridge.call("save_write", slot, JSON.stringify(payload)))
	return ""

func request_purchase(sku: String, idempotency_key: String) -> String:
	if _android_bridge != null and _android_bridge.has_method("iap_purchase"):
		return str(_android_bridge.call("iap_purchase", sku, idempotency_key))
	return ""

func open_hub_overlay(tab: String = "people") -> String:
	if _android_bridge != null and _android_bridge.has_method("social_open_overlay"):
		return str(_android_bridge.call("social_open_overlay", tab))
	return ""

func _on_android_response(req_id: String, ok: bool, payload_json: String) -> void:
	var parsed: Variant = JSON.parse_string(payload_json)
	var dict: Dictionary = parsed if parsed is Dictionary else {"raw": payload_json}
	emit_signal("bridge_response", req_id, ok, dict)

func _on_android_event(event_type: String, payload_json: String) -> void:
	var parsed: Variant = JSON.parse_string(payload_json)
	var dict: Dictionary = parsed if parsed is Dictionary else {}
	match event_type:
		"host_pause":
			emit_signal("host_paused")
		"host_resume":
			emit_signal("host_resumed")
		"host_snapshot":
			emit_signal("host_snapshot_requested")
		"iap_updated":
			emit_signal("iap_updated", dict)
		"social_invite_received":
			emit_signal("social_invite_received", dict)
