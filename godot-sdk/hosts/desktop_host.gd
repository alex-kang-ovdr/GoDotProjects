extends RefCounted
## PlayHub Runtime SDK — Desktop Host Adapter (Hub-Desktop 소유)
## Connects playhub_runtime_sdk.gd to PlayHubDesktopBridge autoload (loopback WebSocket IPC).
## Public API matches Android/iOS/Web bridge 1:1 (contracts/desktop/bridge.v1.schema.json).

var _tree: SceneTree = null
var _bridge: Node = null

func attach(tree: SceneTree, on_response: Callable, on_event: Callable) -> bool:
	_tree = tree
	if _tree == null or _tree.root == null:
		return false
	var candidate := _tree.root.get_node_or_null("PlayHubDesktopBridge")
	if candidate == null or not candidate.has_method("is_desktop_host"):
		return false
	if not bool(candidate.call("is_desktop_host")):
		return false
	_bridge = candidate
	if _bridge.has_signal("bridge_response") and not _bridge.is_connected("bridge_response", on_response):
		_bridge.connect("bridge_response", on_response)
	if _bridge.has_signal("bridge_event") and not _bridge.is_connected("bridge_event", on_event):
		_bridge.connect("bridge_event", on_event)
	return true

func is_active() -> bool:
	return _bridge != null

func send(method: String, args: Dictionary = {}) -> String:
	if _bridge == null or not _bridge.has_method("send_request"):
		return ""
	return str(_bridge.call("send_request", method, args))

func notify_ready() -> String:
	return send("ready", {})

func load_save(slot: String = "main") -> String:
	return send("save_load", {"slot": slot})

func write_save(payload: Dictionary, slot: String = "main") -> String:
	return send("save_write", {"slot": slot, "payload": payload})

func request_purchase(sku: String, idempotency_key: String) -> String:
	return send("iap_purchase", {"sku": sku, "idempotencyKey": idempotency_key})

func open_hub_overlay(tab: String = "people") -> String:
	return send("social_open_overlay", {"tab": tab})

func get_host_info() -> String:
	return send("get_host_info", {})
