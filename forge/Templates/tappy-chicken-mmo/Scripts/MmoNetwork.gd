extends Node
## Spatial-interest MMO RPC relay for Tappy Chicken MMO.
##
## Clients publish their own gameplay events (join, flap, phase, sync, leave) to
## the server via RPC. The server tracks each peer's course progress (run_distance)
## and multicasts events ONLY to peers currently within PROXIMITY_RADIUS.

signal welcome_received(info: Dictionary)
signal peer_event_received(peer_id: String, event: Dictionary)
signal peer_removed(peer_id: String)
signal status_changed(status: Dictionary)
signal observer_state_received(snapshot: Dictionary)

const DEFAULT_HOST := "127.0.0.1"
const DEFAULT_PORT := 7788
const DEFAULT_COURSE_SEED := 42071
const DEFAULT_PROXIMITY_RADIUS := 520.0
const LEAVE_HYSTERESIS := 60.0
const SYNC_INTERVAL := 0.25
const MAX_CLIENTS := 64
const VALID_EVENTS := ["join", "flap", "phase", "sync", "leave"]
const VALID_PHASES := ["menu", "ready", "playing", "paused", "crashing", "over"]

@export var auto_start := true
@export var proximity_radius := DEFAULT_PROXIMITY_RADIUS
@export var leave_hysteresis := LEAVE_HYSTERESIS

var transport_mode := "offline"
var role := "offline"
var connected := false
var observer_only := false
var course_seed := DEFAULT_COURSE_SEED
var local_peer_id := ""
var player_name := ""
var online_count := 1
var nearby_count := 0

# Telemetry counters (useful for HUD diagnostics and automated RPC tests)
var events_sent := 0
var events_received_client := 0
var server_events_received := 0
var server_multicasts_sent := 0
var server_filtered_out := 0

var _enet_peer: ENetMultiplayerPeer
var _server_also_plays := true
var _server_peers: Dictionary = {}
var _client_seq := 0
var _sync_clock := 0.0
var _last_snapshot: Dictionary = {}
var _web_callback: JavaScriptObject
var _known_nearby: Dictionary = {}


func _ready() -> void:
	if Engine.is_editor_hint() or not auto_start:
		return
	start_auto()


func _exit_tree() -> void:
	shutdown()


func start_auto() -> void:
	if OS.has_feature("web"):
		var is_mp := bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('multiplayer') === '1'", true))
		if is_mp:
			start_web_bridge()
		else:
			transport_mode = "offline"
			role = "offline"
			connected = false
			_emit_status()
		return

	var args := OS.get_cmdline_user_args()
	var port := DEFAULT_PORT
	var host := DEFAULT_HOST
	var run_server := false
	var connect_explicit := false
	var run_offline := false
	var seed_override := DEFAULT_COURSE_SEED

	for raw_arg in args:
		var arg := str(raw_arg)
		if arg == "--offline":
			run_offline = true
		elif arg == "--server":
			run_server = true
		elif arg.begins_with("--port="):
			port = clampi(int(arg.substr(7)), 1024, 65535)
		elif arg.begins_with("--seed="):
			seed_override = clampi(int(arg.substr(7)), 1, 999999)
		elif arg.begins_with("--proximity="):
			proximity_radius = clampf(float(arg.substr(12)), 120.0, 4000.0)
		elif arg.begins_with("--name="):
			player_name = arg.substr(7).strip_edges().left(24)
		elif arg.begins_with("--connect="):
			connect_explicit = true
			var target := arg.substr(10).strip_edges()
			if ":" in target:
				var parts := target.split(":", false, 1)
				host = parts[0]
				port = clampi(int(parts[1]), 1024, 65535)
			elif not target.is_empty():
				host = target

	if run_offline:
		transport_mode = "offline"
		role = "offline"
		connected = false
		_emit_status()
		return

	if run_server:
		start_enet_server(port, seed_override, false)
		return

	if connect_explicit:
		start_enet_client(host, port, player_name)
		return

	# Default desktop experience: host if port is free, otherwise drop in immediately as a client.
	if start_enet_server(port, seed_override, true) != OK:
		start_enet_client(host, port, player_name)


func start_enet_server(port: int = DEFAULT_PORT, seed_value: int = DEFAULT_COURSE_SEED, also_plays: bool = true) -> Error:
	shutdown()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_CLIENTS)
	if err != OK:
		return err
	_enet_peer = peer
	multiplayer.multiplayer_peer = peer
	_connect_multiplayer_signals()
	transport_mode = "enet"
	_server_also_plays = also_plays
	observer_only = not also_plays
	role = "host" if also_plays else "server"
	connected = true
	course_seed = clampi(seed_value, 1, 999999)
	local_peer_id = "1"
	if player_name.is_empty():
		player_name = "Host" if also_plays else "Server"
	_server_peers.clear()
	if also_plays:
		_server_peers[1] = _make_server_peer(1, player_name)
	online_count = _server_peers.size()
	nearby_count = 0
	welcome_received.emit({
		"course_seed": course_seed,
		"proximity_radius": proximity_radius,
		"peer_id": local_peer_id,
		"role": role,
		"observer_only": observer_only,
	})
	_emit_status()
	return OK


func start_enet_client(host: String = DEFAULT_HOST, port: int = DEFAULT_PORT, nickname: String = "") -> Error:
	shutdown()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(host, port)
	if err != OK:
		transport_mode = "offline"
		role = "offline"
		connected = false
		_emit_status()
		return err
	_enet_peer = peer
	multiplayer.multiplayer_peer = peer
	_connect_multiplayer_signals()
	transport_mode = "enet"
	role = "client"
	observer_only = false
	connected = false
	if not nickname.is_empty():
		player_name = nickname.strip_edges().left(24)
	_emit_status()
	return OK


func start_web_bridge() -> void:
	shutdown()
	transport_mode = "web_bridge"
	role = "client"
	connected = false
	_web_callback = JavaScriptBridge.create_callback(_on_web_message)
	JavaScriptBridge.get_interface("window")["__playforgeTappyMmoCallback"] = _web_callback
	JavaScriptBridge.eval("""
		window.__playforgeTappyMmoListener = event => {
			if (event.source !== window.parent || event.origin !== location.origin || event.data?.source !== 'playforge-tappy-mmo-lobby') return;
			window.__playforgeTappyMmoCallback(JSON.stringify(event.data));
		};
		window.addEventListener('message', window.__playforgeTappyMmoListener);
		window.parent.postMessage({source:'playforge-tappy-mmo-game',type:'ready'},location.origin);
	""", true)
	_emit_status()


func shutdown() -> void:
	if transport_mode == "web_bridge" and OS.has_feature("web"):
		JavaScriptBridge.eval("if (window.__playforgeTappyMmoListener) window.removeEventListener('message', window.__playforgeTappyMmoListener); window.__playforgeTappyMmoCallback = null;", true)
		_web_callback = null
	_disconnect_multiplayer_signals()
	if _enet_peer != null:
		_enet_peer.close()
		_enet_peer = null
	if multiplayer != null and multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer = null
	_server_peers.clear()
	_known_nearby.clear()
	connected = false
	observer_only = false
	online_count = 1
	nearby_count = 0
	transport_mode = "offline"
	role = "offline"


func tick_sync(delta: float, game_snapshot: Dictionary) -> void:
	_last_snapshot = game_snapshot
	if not connected or observer_only:
		return
	var phase := str(game_snapshot.get("state", "menu"))
	if phase not in ["playing", "crashing"]:
		_sync_clock = 0.0
		return
	_sync_clock += delta
	if _sync_clock >= SYNC_INTERVAL:
		_sync_clock = 0.0
		publish_local_event("sync", game_snapshot)


func publish_local_event(event_type: String, game_snapshot: Dictionary) -> void:
	_last_snapshot = game_snapshot
	if not connected or observer_only:
		return
	if event_type not in VALID_EVENTS:
		return
	_client_seq += 1
	var bird: Dictionary = game_snapshot.get("bird", {})
	var payload := {
		"event_type": event_type,
		"name": player_name if not player_name.is_empty() else ("P-" + local_peer_id),
		"run_distance": float(game_snapshot.get("run_distance", 0.0)),
		"y": float(bird.get("y", 290.0)),
		"vy": float(bird.get("vy", 0.0)),
		"angle": float(bird.get("angle", 0.0)),
		"flap_time": float(game_snapshot.get("flap_time", 0.0)),
		"phase": str(game_snapshot.get("state", "menu")),
		"score": int(game_snapshot.get("score", 0)),
		"seq": _client_seq,
	}
	events_sent += 1

	if transport_mode == "web_bridge":
		var message := {
			"source": "playforge-tappy-mmo-game",
			"type": "rpc",
			"method": "server_player_event",
			"params": payload,
		}
		JavaScriptBridge.eval("window.parent.postMessage(JSON.parse(%s),location.origin);" % JSON.stringify(JSON.stringify(message)), true)
		return

	if transport_mode == "enet":
		if multiplayer.is_server():
			_server_handle_player_event(1, payload)
		else:
			rpc_server_player_event.rpc_id(1, payload)


func get_nearby_peer_ids() -> Array[String]:
	var result: Array[String] = []
	for key in _known_nearby.keys():
		result.append(str(key))
	result.sort()
	return result


func get_stats() -> Dictionary:
	return {
		"mode": transport_mode,
		"role": role,
		"connected": connected,
		"observer_only": observer_only,
		"peer_id": local_peer_id,
		"course_seed": course_seed,
		"proximity_radius": proximity_radius,
		"online_count": online_count,
		"nearby_count": nearby_count,
		"events_sent": events_sent,
		"events_received_client": events_received_client,
		"server_events_received": server_events_received,
		"server_multicasts_sent": server_multicasts_sent,
		"server_filtered_out": server_filtered_out,
	}


# --- Native Godot @rpc Endpoints ---

@rpc("any_peer", "call_remote", "reliable")
func rpc_server_player_event(payload: Dictionary) -> void:
	if not multiplayer.is_server():
		return
	var sender_id := multiplayer.get_remote_sender_id()
	if sender_id <= 0:
		return
	_server_handle_player_event(sender_id, payload)


@rpc("authority", "call_remote", "reliable")
func rpc_client_welcome(info: Dictionary) -> void:
	if multiplayer.get_remote_sender_id() != 1:
		return
	_apply_welcome(info)


@rpc("authority", "call_remote", "reliable")
func rpc_client_multicast_event(sender_peer_id: int, payload: Dictionary) -> void:
	if multiplayer.get_remote_sender_id() != 1:
		return
	_deliver_local_peer_event(str(sender_peer_id), payload)


@rpc("authority", "call_remote", "reliable")
func rpc_client_peer_removed(sender_peer_id: int) -> void:
	if multiplayer.get_remote_sender_id() != 1:
		return
	_deliver_local_peer_removed(str(sender_peer_id))


@rpc("authority", "call_remote", "unreliable_ordered")
func rpc_client_presence(next_online: int, next_nearby: int) -> void:
	if multiplayer.get_remote_sender_id() != 1:
		return
	online_count = maxi(1, next_online)
	nearby_count = maxi(0, next_nearby)
	_emit_status()


# --- Server Spatial Interest Management (AOI) ---

func _make_server_peer(peer_id: int, nickname: String) -> Dictionary:
	return {
		"id": peer_id,
		"name": nickname if not nickname.is_empty() else ("Player %d" % peer_id),
		"run_distance": 0.0,
		"y": 290.0,
		"vy": 0.0,
		"angle": 0.0,
		"flap_time": 0.0,
		"phase": "menu",
		"score": 0,
		"seq": 0,
		"nearby": {},
	}


func _is_within_proximity(dist_a: float, dist_b: float, was_nearby: bool) -> bool:
	var limit := proximity_radius + (leave_hysteresis if was_nearby else 0.0)
	return absf(dist_a - dist_b) <= limit


func _server_handle_player_event(sender_id: int, raw: Dictionary) -> void:
	if not _server_peers.has(sender_id):
		_server_peers[sender_id] = _make_server_peer(sender_id, str(raw.get("name", "")))
	var peer: Dictionary = _server_peers[sender_id]
	var event_type := str(raw.get("event_type", "sync"))
	if event_type not in VALID_EVENTS:
		return
	var seq := int(raw.get("seq", 0))
	if event_type != "join" and seq > 0 and seq <= int(peer["seq"]):
		return
	if seq > 0:
		peer["seq"] = seq

	var incoming_name := str(raw.get("name", "")).strip_edges().left(24)
	if not incoming_name.is_empty():
		peer["name"] = incoming_name
	var phase := str(raw.get("phase", peer["phase"]))
	if phase not in VALID_PHASES:
		phase = "menu"
	peer["run_distance"] = clampf(float(raw.get("run_distance", peer["run_distance"])), 0.0, 10000000.0)
	peer["y"] = clampf(float(raw.get("y", peer["y"])), 0.0, 640.0)
	peer["vy"] = clampf(float(raw.get("vy", peer["vy"])), -2000.0, 2000.0)
	peer["angle"] = clampf(float(raw.get("angle", peer["angle"])), -PI, PI)
	peer["flap_time"] = clampf(float(raw.get("flap_time", peer["flap_time"])), 0.0, 10.0)
	peer["phase"] = phase
	peer["score"] = maxi(0, int(raw.get("score", peer["score"])))

	server_events_received += 1
	var clean_event := _peer_to_event_payload(peer, event_type)
	var sender_nearby: Dictionary = peer["nearby"]

	for other_id_variant in _server_peers.keys():
		var other_id := int(other_id_variant)
		if other_id == sender_id:
			continue
		var other: Dictionary = _server_peers[other_id]
		var other_nearby: Dictionary = other["nearby"]
		var was_nearby := sender_nearby.has(other_id)
		var now_nearby := _is_within_proximity(float(peer["run_distance"]), float(other["run_distance"]), was_nearby)

		if now_nearby:
			_server_send_event_to(other_id, sender_id, clean_event)
			server_multicasts_sent += 1
			if not was_nearby:
				sender_nearby[other_id] = true
				other_nearby[sender_id] = true
				# Symmetric AOI entry: also deliver the existing nearby peer's state back to sender.
				_server_send_event_to(sender_id, other_id, _peer_to_event_payload(other, "sync"))
				server_multicasts_sent += 1
		else:
			server_filtered_out += 1
			if was_nearby:
				sender_nearby.erase(other_id)
				other_nearby.erase(sender_id)
				_server_send_removed_to(other_id, sender_id)
				_server_send_removed_to(sender_id, other_id)

	_server_broadcast_presence()


func _peer_to_event_payload(peer: Dictionary, event_type: String) -> Dictionary:
	return {
		"event_type": event_type,
		"name": str(peer["name"]),
		"run_distance": float(peer["run_distance"]),
		"y": float(peer["y"]),
		"vy": float(peer["vy"]),
		"angle": float(peer["angle"]),
		"flap_time": float(peer["flap_time"]),
		"phase": str(peer["phase"]),
		"score": int(peer["score"]),
		"seq": int(peer["seq"]),
	}


func _server_send_event_to(target_id: int, sender_id: int, payload: Dictionary) -> void:
	if target_id == 1:
		if _server_also_plays:
			_deliver_local_peer_event(str(sender_id), payload)
	else:
		rpc_client_multicast_event.rpc_id(target_id, sender_id, payload)


func _server_send_removed_to(target_id: int, removed_id: int) -> void:
	if target_id == 1:
		if _server_also_plays:
			_deliver_local_peer_removed(str(removed_id))
	else:
		rpc_client_peer_removed.rpc_id(target_id, removed_id)


func _server_broadcast_presence() -> void:
	var total := _server_peers.size()
	online_count = maxi(1, total)
	if _server_also_plays and _server_peers.has(1):
		nearby_count = (_server_peers[1]["nearby"] as Dictionary).size()
	else:
		nearby_count = 0
	for peer_id_variant in _server_peers.keys():
		var peer_id := int(peer_id_variant)
		if peer_id == 1:
			continue
		var peer: Dictionary = _server_peers[peer_id]
		rpc_client_presence.rpc_id(peer_id, total, (peer["nearby"] as Dictionary).size())
	_emit_status()


# --- Native Multiplayer Signals ---

func _connect_multiplayer_signals() -> void:
	if multiplayer == null:
		return
	if not multiplayer.peer_connected.is_connected(_on_peer_connected):
		multiplayer.peer_connected.connect(_on_peer_connected)
	if not multiplayer.peer_disconnected.is_connected(_on_peer_disconnected):
		multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	if not multiplayer.connected_to_server.is_connected(_on_connected_to_server):
		multiplayer.connected_to_server.connect(_on_connected_to_server)
	if not multiplayer.connection_failed.is_connected(_on_connection_failed):
		multiplayer.connection_failed.connect(_on_connection_failed)
	if not multiplayer.server_disconnected.is_connected(_on_server_disconnected):
		multiplayer.server_disconnected.connect(_on_server_disconnected)


func _disconnect_multiplayer_signals() -> void:
	if multiplayer == null:
		return
	if multiplayer.peer_connected.is_connected(_on_peer_connected):
		multiplayer.peer_connected.disconnect(_on_peer_connected)
	if multiplayer.peer_disconnected.is_connected(_on_peer_disconnected):
		multiplayer.peer_disconnected.disconnect(_on_peer_disconnected)
	if multiplayer.connected_to_server.is_connected(_on_connected_to_server):
		multiplayer.connected_to_server.disconnect(_on_connected_to_server)
	if multiplayer.connection_failed.is_connected(_on_connection_failed):
		multiplayer.connection_failed.disconnect(_on_connection_failed)
	if multiplayer.server_disconnected.is_connected(_on_server_disconnected):
		multiplayer.server_disconnected.disconnect(_on_server_disconnected)


func _on_peer_connected(peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	_server_peers[peer_id] = _make_server_peer(peer_id, "Player %d" % peer_id)
	rpc_client_welcome.rpc_id(peer_id, {
		"course_seed": course_seed,
		"proximity_radius": proximity_radius,
		"peer_id": str(peer_id),
		"role": "client",
		"observer_only": false,
		"online_count": _server_peers.size(),
	})
	_server_handle_player_event(peer_id, _peer_to_event_payload(_server_peers[peer_id], "join"))


func _on_peer_disconnected(peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	if not _server_peers.has(peer_id):
		return
	var peer: Dictionary = _server_peers[peer_id]
	var previous_nearby: Dictionary = peer["nearby"]
	_server_peers.erase(peer_id)
	for other_id_variant in previous_nearby.keys():
		var other_id := int(other_id_variant)
		if _server_peers.has(other_id):
			(_server_peers[other_id]["nearby"] as Dictionary).erase(peer_id)
			_server_send_removed_to(other_id, peer_id)
	_server_broadcast_presence()


func _on_connected_to_server() -> void:
	local_peer_id = str(multiplayer.get_unique_id())
	if player_name.is_empty():
		player_name = "P-%s" % local_peer_id
	connected = true
	_emit_status()
	if not _last_snapshot.is_empty():
		publish_local_event("join", _last_snapshot)


func _on_connection_failed() -> void:
	connected = false
	role = "offline"
	transport_mode = "offline"
	_emit_status()


func _on_server_disconnected() -> void:
	connected = false
	for peer_id in _known_nearby.keys():
		peer_removed.emit(str(peer_id))
	_known_nearby.clear()
	nearby_count = 0
	online_count = 1
	_emit_status()


# --- Local Client Delivery & Web Bridge ---

func _apply_welcome(info: Dictionary) -> void:
	course_seed = clampi(int(info.get("course_seed", DEFAULT_COURSE_SEED)), 1, 999999)
	proximity_radius = clampf(float(info.get("proximity_radius", DEFAULT_PROXIMITY_RADIUS)), 120.0, 4000.0)
	var incoming_peer := str(info.get("peer_id", local_peer_id))
	if not incoming_peer.is_empty():
		local_peer_id = incoming_peer
	observer_only = bool(info.get("observer_only", false))
	role = "observer" if observer_only else str(info.get("role", role))
	online_count = maxi(1, int(info.get("online_count", online_count)))
	connected = true
	welcome_received.emit(info)
	_emit_status()
	if not observer_only and not _last_snapshot.is_empty():
		publish_local_event("join", _last_snapshot)


func _deliver_local_peer_event(peer_id: String, payload: Dictionary) -> void:
	if peer_id.is_empty() or peer_id == local_peer_id:
		return
	events_received_client += 1
	_known_nearby[peer_id] = true
	nearby_count = _known_nearby.size()
	peer_event_received.emit(peer_id, payload)
	_emit_status()


func _deliver_local_peer_removed(peer_id: String) -> void:
	if peer_id.is_empty():
		return
	_known_nearby.erase(peer_id)
	nearby_count = _known_nearby.size()
	peer_removed.emit(peer_id)
	_emit_status()


func _on_web_message(arguments: Array) -> void:
	if arguments.is_empty() or not arguments[0] is String:
		return
	var message = JSON.parse_string(arguments[0])
	if not message is Dictionary:
		return
	var msg_type := str(message.get("type", ""))
	match msg_type:
		"welcome":
			var incoming_name := str(message.get("playerName", "")).strip_edges().left(24)
			if not incoming_name.is_empty():
				player_name = incoming_name
			_apply_welcome({
				"course_seed": int(message.get("courseSeed", DEFAULT_COURSE_SEED)),
				"proximity_radius": float(message.get("proximityRadius", DEFAULT_PROXIMITY_RADIUS)),
				"peer_id": str(message.get("playerId", "")),
				"role": "observer" if message.get("playerId") == null else "client",
				"observer_only": message.get("playerId") == null,
				"online_count": int(message.get("onlineCount", 1)),
			})
		"rpc":
			var method := str(message.get("method", ""))
			var params = message.get("params", {})
			if not params is Dictionary:
				return
			if method == "client_multicast_event":
				_deliver_local_peer_event(str(params.get("peerId", "")), params)
			elif method == "client_peer_removed":
				_deliver_local_peer_removed(str(params.get("peerId", "")))
			elif method == "client_presence":
				online_count = maxi(1, int(params.get("onlineCount", online_count)))
				nearby_count = maxi(0, int(params.get("nearbyCount", _known_nearby.size())))
				_emit_status()
		"state":
			# Server Observer tab receives full authoritative world state without playing.
			var raw_state = message.get("state")
			if raw_state is Dictionary:
				if message.get("playerId") == null:
					observer_only = true
					role = "observer"
					connected = true
					online_count = int(raw_state.get("onlineCount", 0))
					var next_seed := int(raw_state.get("courseSeed", course_seed))
					if next_seed > 0 and next_seed != course_seed:
						course_seed = next_seed
						welcome_received.emit({
							"course_seed": course_seed,
							"proximity_radius": float(raw_state.get("proximityRadius", proximity_radius)),
							"peer_id": "",
							"role": "observer",
							"observer_only": true,
							"online_count": online_count,
						})
					observer_state_received.emit(raw_state)
					_emit_status()


func _emit_status() -> void:
	status_changed.emit(get_stats())
