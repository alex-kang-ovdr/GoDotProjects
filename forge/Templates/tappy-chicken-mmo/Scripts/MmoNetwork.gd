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
const DEFAULT_MAX_NEARBY_GHOSTS := 12
const DEFAULT_PLAYER_SPEED := 170.0
const SYNC_INTERVAL := 2.0 # Event-driven sync: fallback drift-reconcile only if no flap/phase event for 2s.
const MAX_CLIENTS := 64
const VALID_EVENTS := ["join", "flap", "phase", "sync", "leave"]
const VALID_PHASES := ["menu", "ready", "playing", "paused", "crashing", "over"]

@export var auto_start := true
@export var proximity_radius := DEFAULT_PROXIMITY_RADIUS
@export var leave_hysteresis := LEAVE_HYSTERESIS
@export var max_nearby_ghosts := DEFAULT_MAX_NEARBY_GHOSTS

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
var _ws_peer: WebSocketPeer
var _ws_join_sent := false
var _ws_protocol := "legacy" # "playhub.relay.v1" (Type 1 generic) or "legacy"
var _ws_ticket := ""
var _ws_game_id := "tappy-chicken-mmo"
var _ws_room_id := ""
var _ws_platform := "desktop"
var _ws_compact_peers: Dictionary = {}
var _server_also_plays := true
var _server_peers: Dictionary = {}
var _client_seq := 0
var _sync_clock := 0.0
var _last_snapshot: Dictionary = {}
var _web_callback: JavaScriptObject
var _known_nearby: Dictionary = {}

const _EVENT_TO_CODE := {"join": 0, "flap": 1, "phase": 2, "sync": 3, "leave": 4}
const _CODE_TO_EVENT := ["join", "flap", "phase", "sync", "leave"]
const _PHASE_TO_CODE := {"menu": 0, "ready": 1, "playing": 2, "paused": 3, "crashing": 4, "over": 5}
const _CODE_TO_PHASE := ["menu", "ready", "playing", "paused", "crashing", "over"]


func _ready() -> void:
	set_process(false)
	if Engine.is_editor_hint() or not auto_start:
		return
	start_auto()


func _exit_tree() -> void:
	shutdown()


func _process(_delta: float) -> void:
	if transport_mode != "ws" or _ws_peer == null:
		return
	_ws_peer.poll()
	var ws_state := _ws_peer.get_ready_state()
	if ws_state == WebSocketPeer.STATE_OPEN:
		if not _ws_join_sent:
			_ws_join_sent = true
			if _ws_protocol == "playhub.relay.v1":
				var relay_join := {
					"t": "join",
					"gameId": _ws_game_id,
					"name": player_name if not player_name.is_empty() else ("Player-" + _ws_platform.to_upper()),
					"platform": _ws_platform,
					"p": [0],
					"v": [int(DEFAULT_PLAYER_SPEED)],
					"m": 0,
					"config": {
						"dimensions": 1,
						"aoiRadius": proximity_radius,
						"aoiHysteresis": leave_hysteresis,
						"maxVisiblePeers": max_nearby_ghosts,
						"extrapolateVelocity": true,
						"sharedRoomSeed": true,
					},
				}
				if not _ws_room_id.is_empty():
					relay_join["roomId"] = _ws_room_id
				if not _ws_ticket.is_empty():
					relay_join["ticket"] = _ws_ticket
				_ws_peer.send_text(JSON.stringify(relay_join))
			else:
				var join_msg := {
					"type": "join",
					"gameId": _ws_game_id,
					"name": player_name if not player_name.is_empty() else ("Player-" + _ws_platform.to_upper()),
					"platform": _ws_platform,
					"compact": true,
				}
				if not _ws_room_id.is_empty():
					join_msg["roomId"] = _ws_room_id
				if not _ws_ticket.is_empty():
					join_msg["ticket"] = _ws_ticket
				_ws_peer.send_text(JSON.stringify(join_msg))
		while _ws_peer.get_available_packet_count() > 0:
			var pkt := _ws_peer.get_packet()
			if _ws_peer.was_string_packet():
				_handle_ws_text(pkt.get_string_from_utf8())
	elif ws_state == WebSocketPeer.STATE_CLOSED:
		var was_connected := connected
		connected = false
		_ws_peer = null
		_ws_join_sent = false
		set_process(false)
		if was_connected:
			for peer_id in _known_nearby.keys():
				peer_removed.emit(str(peer_id))
			_known_nearby.clear()
			_ws_compact_peers.clear()
			nearby_count = 0
			online_count = 1
			_emit_status()


func start_auto() -> void:
	if OS.has_feature("web"):
		var ws_url := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('ws') || ''", true)).strip_edges()
		if not ws_url.is_empty():
			var game_id := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('gameId') || 'tappy-chicken-mmo'", true)).strip_edges()
			var room_id := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('room') || ''", true)).strip_edges()
			var web_name := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('name') || 'WebPlayer'", true)).strip_edges()
			var web_ticket := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('ticket') || ''", true)).strip_edges()
			var web_proto := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('protocol') || ''", true)).strip_edges()
			start_ws_client(ws_url, game_id, room_id, web_name, "web", web_ticket, web_proto)
			return
		var is_mp := bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('multiplayer') === '1'", true))
		if is_mp:
			start_web_bridge()
		else:
			transport_mode = "offline"
			role = "offline"
			connected = false
			_emit_status()
		return

	# Check PlayHub Android/Native Bridge or user://playhub_mp.json for cross-play WebSocket config.
	var bridge_mp := _read_playhub_multiplayer_config()
	if not bridge_mp.is_empty():
		var b_ws := str(bridge_mp.get("wsUrl", "")).strip_edges()
		if not b_ws.is_empty():
			var default_plat := "android" if OS.has_feature("android") else "desktop"
			start_ws_client(
				b_ws,
				str(bridge_mp.get("gameId", "tappy-chicken-mmo")),
				str(bridge_mp.get("roomId", "")),
				str(bridge_mp.get("displayName", player_name)),
				str(bridge_mp.get("platform", default_plat)),
				str(bridge_mp.get("joinTicket", "")),
				str(bridge_mp.get("protocol", ""))
			)
			return

	var args := OS.get_cmdline_user_args()
	var port := DEFAULT_PORT
	var host := DEFAULT_HOST
	var run_server := false
	var connect_explicit := false
	var run_offline := false
	var seed_override := DEFAULT_COURSE_SEED
	var cli_ws_url := ""
	var cli_game_id := "tappy-chicken-mmo"
	var cli_room_id := ""
	var cli_platform := "android" if OS.has_feature("android") else "desktop"

	for raw_arg in args:
		var arg := str(raw_arg)
		if arg == "--offline":
			run_offline = true
		elif arg == "--server":
			run_server = true
		elif arg.begins_with("--ws="):
			cli_ws_url = arg.substr(5).strip_edges()
		elif arg.begins_with("--game-id="):
			cli_game_id = arg.substr(10).strip_edges()
		elif arg.begins_with("--room="):
			cli_room_id = arg.substr(7).strip_edges()
		elif arg.begins_with("--platform="):
			cli_platform = arg.substr(11).strip_edges().to_lower()
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

	if not cli_ws_url.is_empty():
		start_ws_client(cli_ws_url, cli_game_id, cli_room_id, player_name, cli_platform)
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


func _read_playhub_multiplayer_config() -> Dictionary:
	if Engine.has_singleton("PlayHubBridge"):
		var bridge := Engine.get_singleton("PlayHubBridge")
		if bridge != null and bridge.has_method("get_multiplayer_config"):
			var raw := str(bridge.call("get_multiplayer_config")).strip_edges()
			if not raw.is_empty():
				var parsed = JSON.parse_string(raw)
				if parsed is Dictionary and not parsed.is_empty():
					return parsed
	if FileAccess.file_exists("user://playhub_mp.json"):
		var f := FileAccess.open("user://playhub_mp.json", FileAccess.READ)
		if f != null:
			var raw := f.get_as_text().strip_edges()
			f.close()
			if not raw.is_empty():
				var parsed = JSON.parse_string(raw)
				if parsed is Dictionary and not parsed.is_empty():
					return parsed
	return {}


func start_ws_client(ws_url: String, game_id: String = "tappy-chicken-mmo", room_id: String = "", nickname: String = "", platform_tag: String = "web", ticket: String = "", protocol_hint: String = "") -> Error:
	shutdown()
	var use_generic := (protocol_hint == "playhub.relay.v1") or ws_url.contains("/ws/relay-spatial")
	var peer := WebSocketPeer.new()
	if use_generic:
		var protos := PackedStringArray(["playhub.v1"])
		if not ticket.is_empty():
			protos.append("ticket." + ticket)
		peer.supported_protocols = protos
	var connect_url := ws_url
	if not ticket.is_empty() and not connect_url.contains("ticket="):
		connect_url += ("&" if connect_url.contains("?") else "?") + "ticket=" + ticket.uri_encode()
	var err := peer.connect_to_url(connect_url)
	if err != OK:
		transport_mode = "offline"
		role = "offline"
		connected = false
		_emit_status()
		return err
	_ws_peer = peer
	_ws_join_sent = false
	_ws_protocol = "playhub.relay.v1" if use_generic else "legacy"
	_ws_ticket = ticket
	_ws_game_id = game_id if not game_id.is_empty() else "tappy-chicken-mmo"
	_ws_room_id = room_id
	_ws_platform = platform_tag if not platform_tag.is_empty() else "web"
	_ws_compact_peers.clear()
	if not nickname.is_empty():
		player_name = nickname.strip_edges().left(24)
	transport_mode = "ws"
	role = "client"
	observer_only = false
	connected = false
	set_process(true)
	_emit_status()
	return OK


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
	set_process(false)
	if _ws_peer != null:
		_ws_peer.close()
		_ws_peer = null
	_ws_join_sent = false
	_ws_compact_peers.clear()
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
	_sync_clock = 0.0 # Active gameplay events reset idle drift timer (0 Hz redundant sync).
	_client_seq += 1
	var bird: Dictionary = game_snapshot.get("bird", {})
	var settings: Dictionary = game_snapshot.get("settings", {})
	var payload := {
		"event_type": event_type,
		"name": player_name if not player_name.is_empty() else ("P-" + local_peer_id),
		"run_distance": float(game_snapshot.get("run_distance", 0.0)),
		"speed": float(settings.get("speed", DEFAULT_PLAYER_SPEED)),
		"y": float(bird.get("y", 290.0)),
		"vy": float(bird.get("vy", 0.0)),
		"angle": float(bird.get("angle", 0.0)),
		"flap_time": 0.0 if event_type == "flap" else float(game_snapshot.get("flap_time", 0.0)),
		"phase": str(game_snapshot.get("state", "menu")),
		"score": int(game_snapshot.get("score", 0)),
		"seq": _client_seq,
	}
	events_sent += 1

	if transport_mode == "ws":
		if _ws_peer != null and _ws_peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
			var ev_code: int = int(_EVENT_TO_CODE.get(event_type, 3))
			var ph_code: int = int(_PHASE_TO_CODE.get(str(payload["phase"]), 2))
			var dist_i: int = int(roundf(float(payload["run_distance"])))
			var y_i: int = int(roundf(float(payload["y"])))
			var sc_i: int = int(payload["score"])
			var spd_i: int = int(roundf(float(payload["speed"])))
			if _ws_protocol == "playhub.relay.v1":
				# Type 1 Generic Spatial Relay: game encodes its own opaque payload `d`, platform sees only 1D pos/vel.
				var opaque: Array
				if ev_code == 1 and ph_code == 2:
					opaque = [1, y_i, sc_i]
				else:
					var flap100: int = int(roundf(float(payload["flap_time"]) * 100.0))
					var vy_i: int = int(roundf(float(payload["vy"])))
					opaque = [ev_code, y_i, sc_i, ph_code, flap100, vy_i]
				var frame := {
					"t": "pub",
					"seq": _client_seq,
					"p": [dist_i],
					"v": [spd_i],
					"m": 1 if ph_code == 2 else 0,
					"k": 0 if ev_code in [0, 2, 3] else 1,
					"d": opaque,
				}
				_ws_peer.send_text(JSON.stringify(frame))
				return
			var tuple: Array
			if ev_code == 1 and ph_code == 2:
				tuple = [1, dist_i, y_i, sc_i, 2, _client_seq]
			else:
				var flap100: int = int(roundf(float(payload["flap_time"]) * 100.0))
				var vy_i: int = int(roundf(float(payload["vy"])))
				tuple = [ev_code, dist_i, y_i, sc_i, ph_code, _client_seq, flap100, vy_i, spd_i]
			_ws_peer.send_text(JSON.stringify({"e": tuple}))
		return

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


@rpc("authority", "call_remote", "unreliable_ordered")
func rpc_client_multicast_sync(sender_peer_id: int, payload: Dictionary) -> void:
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
		"speed": DEFAULT_PLAYER_SPEED,
		"y": 290.0,
		"vy": 0.0,
		"angle": 0.0,
		"flap_time": 0.0,
		"phase": "menu",
		"score": 0,
		"seq": 0,
		"state_at_msec": Time.get_ticks_msec(),
		"nearby": {},
	}


func _estimate_peer_distance(peer: Dictionary, now_msec: int) -> float:
	if str(peer["phase"]) != "playing":
		return float(peer["run_distance"])
	var elapsed := clampf(float(now_msec - int(peer["state_at_msec"])) / 1000.0, 0.0, 10.0)
	return float(peer["run_distance"]) + float(peer["speed"]) * elapsed


func _estimate_peer_flap_time(peer: Dictionary, now_msec: int) -> float:
	if str(peer["phase"]) != "playing":
		return float(peer["flap_time"])
	var elapsed := clampf(float(now_msec - int(peer["state_at_msec"])) / 1000.0, 0.0, 10.0)
	return minf(10.0, float(peer["flap_time"]) + elapsed)


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
	var now_msec := Time.get_ticks_msec()
	peer["run_distance"] = clampf(float(raw.get("run_distance", peer["run_distance"])), 0.0, 10000000.0)
	if raw.has("speed"):
		peer["speed"] = clampf(float(raw.get("speed", DEFAULT_PLAYER_SPEED)), 60.0, 400.0)
	peer["y"] = clampf(float(raw.get("y", peer["y"])), 0.0, 640.0)
	peer["vy"] = clampf(float(raw.get("vy", peer["vy"])), -2000.0, 2000.0)
	peer["angle"] = clampf(float(raw.get("angle", peer["angle"])), -PI, PI)
	peer["flap_time"] = 0.0 if event_type == "flap" else clampf(float(raw.get("flap_time", peer["flap_time"])), 0.0, 10.0)
	peer["phase"] = phase
	peer["score"] = maxi(0, int(raw.get("score", peer["score"])))
	peer["state_at_msec"] = now_msec

	server_events_received += 1
	var clean_event := _peer_to_event_payload(peer, event_type, now_msec)
	var sender_nearby: Dictionary = peer["nearby"]
	var ghost_cap := clampi(max_nearby_ghosts, 1, MAX_CLIENTS - 1)
	var presence_changed: Dictionary = {}
	var sender_dist := float(peer["run_distance"])

	for other_id_variant in _server_peers.keys():
		var other_id := int(other_id_variant)
		if other_id == sender_id:
			continue
		var other: Dictionary = _server_peers[other_id]
		var other_nearby: Dictionary = other["nearby"]
		var was_nearby := sender_nearby.has(other_id)
		var other_dist := _estimate_peer_distance(other, now_msec)
		var in_range := _is_within_proximity(sender_dist, other_dist, was_nearby)
		var now_nearby := in_range and (was_nearby or (sender_nearby.size() < ghost_cap and other_nearby.size() < ghost_cap))

		if now_nearby:
			_server_send_event_to(other_id, sender_id, clean_event)
			server_multicasts_sent += 1
			if not was_nearby:
				sender_nearby[other_id] = true
				other_nearby[sender_id] = true
				presence_changed[sender_id] = true
				presence_changed[other_id] = true
				# Symmetric AOI entry with estimated position & flap_time for smooth drop-in.
				_server_send_event_to(sender_id, other_id, _peer_to_event_payload(other, "sync", now_msec))
				server_multicasts_sent += 1
		else:
			server_filtered_out += 1
			if was_nearby:
				sender_nearby.erase(other_id)
				other_nearby.erase(sender_id)
				presence_changed[sender_id] = true
				presence_changed[other_id] = true
				_server_send_removed_to(other_id, sender_id)
				_server_send_removed_to(sender_id, other_id)

	if event_type == "join":
		_server_broadcast_presence()
	elif not presence_changed.is_empty():
		_server_send_presence_subset(presence_changed)


func _peer_to_event_payload(peer: Dictionary, event_type: String, now_msec: int = -1) -> Dictionary:
	var ts := Time.get_ticks_msec() if now_msec < 0 else now_msec
	return {
		"event_type": event_type,
		"name": str(peer["name"]),
		"run_distance": _estimate_peer_distance(peer, ts),
		"y": float(peer["y"]),
		"vy": float(peer["vy"]),
		"angle": float(peer["angle"]),
		"flap_time": 0.0 if event_type == "flap" else _estimate_peer_flap_time(peer, ts),
		"phase": str(peer["phase"]),
		"score": int(peer["score"]),
		"seq": int(peer["seq"]),
	}


func _server_send_event_to(target_id: int, sender_id: int, payload: Dictionary) -> void:
	if target_id == 1:
		if _server_also_plays:
			_deliver_local_peer_event(str(sender_id), payload)
	elif str(payload.get("event_type", "sync")) == "sync":
		rpc_client_multicast_sync.rpc_id(target_id, sender_id, payload)
	else:
		rpc_client_multicast_event.rpc_id(target_id, sender_id, payload)


func _server_send_removed_to(target_id: int, removed_id: int) -> void:
	if target_id == 1:
		if _server_also_plays:
			_deliver_local_peer_removed(str(removed_id))
	else:
		rpc_client_peer_removed.rpc_id(target_id, removed_id)


func _server_send_presence_subset(peer_ids: Dictionary) -> void:
	var total := _server_peers.size()
	online_count = maxi(1, total)
	if _server_also_plays and _server_peers.has(1):
		nearby_count = (_server_peers[1]["nearby"] as Dictionary).size()
	for peer_id_variant in peer_ids.keys():
		var peer_id := int(peer_id_variant)
		if peer_id == 1 or not _server_peers.has(peer_id):
			continue
		var peer: Dictionary = _server_peers[peer_id]
		rpc_client_presence.rpc_id(peer_id, total, (peer["nearby"] as Dictionary).size())
	_emit_status()


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


func _handle_ws_text(raw_text: String) -> void:
	var message = JSON.parse_string(raw_text)
	if not message is Dictionary:
		return
	# Type 1 Generic Spatial Relay (`playhub.relay.v1`) frames
	if _ws_protocol == "playhub.relay.v1":
		var r_type := str(message.get("t", ""))
		if r_type == "welcome":
			var incoming_name := str(message.get("name", "")).strip_edges().left(24)
			if not incoming_name.is_empty():
				player_name = incoming_name
			var cfg: Dictionary = message.get("config", {}) if message.get("config") is Dictionary else {}
			_apply_welcome({
				"course_seed": int(message.get("roomSeed", DEFAULT_COURSE_SEED)),
				"proximity_radius": float(cfg.get("aoiRadius", DEFAULT_PROXIMITY_RADIUS)),
				"peer_id": "s-%d" % int(message.get("shortId", 0)),
				"role": "client",
				"observer_only": false,
				"online_count": int(message.get("online", 1)),
			})
			return
		if message.has("b") and message["b"] is Array:
			for entry in message["b"]:
				if not entry is Array or entry.size() < 3:
					continue
				var short_id := int(entry[0])
				var pos_arr = entry[1]
				var dist_val := float(pos_arr[0]) if (pos_arr is Array and not pos_arr.is_empty()) else 0.0
				var opaque = entry[2]
				if entry.size() >= 4 and entry[3] is String and not str(entry[3]).is_empty():
					_ws_compact_peers[short_id] = str(entry[3])
				var peer_id := "s-%d" % short_id
				if opaque is Array and opaque.size() >= 3:
					var ev_idx := int(opaque[0])
					var ev_type: String = _CODE_TO_EVENT[ev_idx] if ev_idx >= 0 and ev_idx < _CODE_TO_EVENT.size() else "sync"
					var is_flap := ev_idx == 1
					var ph_idx := int(opaque[3]) if opaque.size() >= 4 else 2
					var phase_str: String = _CODE_TO_PHASE[ph_idx] if ph_idx >= 0 and ph_idx < _CODE_TO_PHASE.size() else "playing"
					var flap_val := 0.0 if is_flap else (float(opaque[4]) / 100.0 if opaque.size() >= 5 else 0.0)
					var vy_val := -345.0 if is_flap else (float(opaque[5]) if opaque.size() >= 6 else 0.0)
					var ang_val := -0.785 if is_flap else 0.0
					_deliver_local_peer_event(peer_id, {
						"peerId": peer_id,
						"name": str(_ws_compact_peers.get(short_id, "P-%d" % short_id)),
						"eventType": ev_type,
						"event_type": ev_type,
						"runDistance": dist_val,
						"run_distance": dist_val,
						"y": float(opaque[1]),
						"score": int(opaque[2]),
						"phase": phase_str,
						"flapTime": flap_val,
						"flap_time": flap_val,
						"vy": vy_val,
						"angle": ang_val,
					})
		if message.has("r") and message["r"] is Array:
			for sid_var in message["r"]:
				var sid := int(sid_var)
				_ws_compact_peers.erase(sid)
				_deliver_local_peer_removed("s-%d" % sid)
		if message.has("o") and message["o"] is Array and (message["o"] as Array).size() >= 2:
			var o_arr: Array = message["o"]
			online_count = maxi(1, int(o_arr[0]))
			nearby_count = maxi(0, int(o_arr[1]))
			_emit_status()
		return

	if message.has("b") or message.has("r") or message.has("p"):
		if message.has("b") and message["b"] is Array:
			for t in message["b"]:
				if not t is Array or t.size() < 5:
					continue
				var short_id := int(t[0])
				var ev_idx := int(t[1])
				var ev_type: String = _CODE_TO_EVENT[ev_idx] if ev_idx >= 0 and ev_idx < _CODE_TO_EVENT.size() else "sync"
				var peer_id := "s-%d" % short_id
				if t.size() >= 9 and t[8] is String and not str(t[8]).is_empty():
					_ws_compact_peers[short_id] = str(t[8])
				var is_flap := ev_idx == 1
				var ph_idx := int(t[5]) if t.size() >= 6 else 2
				var phase_str: String = _CODE_TO_PHASE[ph_idx] if ph_idx >= 0 and ph_idx < _CODE_TO_PHASE.size() else "playing"
				var flap_val := 0.0 if is_flap else (float(t[6]) / 100.0 if t.size() >= 7 else 0.0)
				var vy_val := -345.0 if is_flap else (float(t[7]) if t.size() >= 8 else 0.0)
				var ang_val := -0.785 if is_flap else 0.0
				_deliver_local_peer_event(peer_id, {
					"peerId": peer_id,
					"name": str(_ws_compact_peers.get(short_id, "P-%d" % short_id)),
					"eventType": ev_type,
					"event_type": ev_type,
					"runDistance": float(t[2]),
					"run_distance": float(t[2]),
					"y": float(t[3]),
					"score": int(t[4]),
					"phase": phase_str,
					"flapTime": flap_val,
					"flap_time": flap_val,
					"vy": vy_val,
					"angle": ang_val,
				})
		if message.has("r") and message["r"] is Array:
			for sid_var in message["r"]:
				var sid := int(sid_var)
				_ws_compact_peers.erase(sid)
				_deliver_local_peer_removed("s-%d" % sid)
		if message.has("p") and message["p"] is Array and (message["p"] as Array).size() >= 2:
			var p_arr: Array = message["p"]
			online_count = maxi(1, int(p_arr[0]))
			nearby_count = maxi(0, int(p_arr[1]))
			_emit_status()
		return

	var msg_type := str(message.get("type", ""))
	if msg_type == "welcome":
		var incoming_name := str(message.get("playerName", "")).strip_edges().left(24)
		if not incoming_name.is_empty():
			player_name = incoming_name
		_apply_welcome({
			"course_seed": int(message.get("courseSeed", DEFAULT_COURSE_SEED)),
			"proximity_radius": float(message.get("proximityRadius", DEFAULT_PROXIMITY_RADIUS)),
			"peer_id": str(message.get("playerId", "")),
			"role": "client",
			"observer_only": false,
			"online_count": int(message.get("onlineCount", 1)),
		})
	elif msg_type == "rpc":
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


func _emit_status() -> void:
	status_changed.emit(get_stats())
