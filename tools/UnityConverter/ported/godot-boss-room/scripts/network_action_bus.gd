extends Node
## Port of Unity Boss Room Netcode Action System:
##   ServerActionPlayer.cs + ClientActionPlayer.cs + Action.cs + NetworkBehaviour RPCs.
## Uses Godot 4 @rpc("any_peer") / @rpc("authority") for server-authoritative action validation
## while seamlessly supporting local co-op host mode when running offline.

signal action_executed(actor_id: String, action_id: String, payload: Dictionary)
signal telegraph_started(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float)
signal state_synced(snapshot: Dictionary)

var is_server_authority: bool = true
var action_history: Array[Dictionary] = []
var total_rpc_dispatches: int = 0
var rejected_out_of_range: int = 0
var active_cooldowns: Dictionary = {}


func reset_session() -> void:
	action_history.clear()
	active_cooldowns.clear()
	total_rpc_dispatches = 0
	rejected_out_of_range = 0


func _process(delta: float) -> void:
	var expired: Array[String] = []
	for k in active_cooldowns.keys():
		var rem: float = float(active_cooldowns[k]) - delta
		if rem <= 0.0:
			expired.append(str(k))
		else:
			active_cooldowns[k] = rem
	for k in expired:
		active_cooldowns.erase(k)


func is_on_cooldown(actor_id: String, action_id: String) -> bool:
	var key := actor_id + ":" + action_id
	return active_cooldowns.has(key) and float(active_cooldowns[key]) > 0.0


func get_cooldown_remaining(actor_id: String, action_id: String) -> float:
	var key := actor_id + ":" + action_id
	return float(active_cooldowns.get(key, 0.0))


func request_action(actor_id: String, action_id: String, payload: Dictionary = {}, cooldown_sec: float = 0.0, max_range: float = -1.0) -> bool:
	if multiplayer != null and multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		_server_receive_action_rpc.rpc_id(1, actor_id, action_id, payload, cooldown_sec, max_range)
		return true
	return _server_validate_and_dispatch(actor_id, action_id, payload, cooldown_sec, max_range)


@rpc("any_peer", "call_local", "reliable")
func _server_receive_action_rpc(actor_id: String, action_id: String, payload: Dictionary, cooldown_sec: float, max_range: float) -> void:
	_server_validate_and_dispatch(actor_id, action_id, payload, cooldown_sec, max_range)


func _server_validate_and_dispatch(actor_id: String, action_id: String, payload: Dictionary, cooldown_sec: float, max_range: float) -> bool:
	if is_on_cooldown(actor_id, action_id):
		return false
	# Cheat-prevention range check ported from Unity AOEAction.cs (k_MaxDistanceDivergence = 1.0)
	if max_range > 0.0 and payload.has("origin") and payload.has("target_pos"):
		var dist: float = (payload["origin"] as Vector3).distance_to(payload["target_pos"] as Vector3)
		if dist > max_range + 1.0:
			rejected_out_of_range += 1
			return false
	if cooldown_sec > 0.0:
		active_cooldowns[actor_id + ":" + action_id] = cooldown_sec
	total_rpc_dispatches += 1
	action_history.append({
		"seq": total_rpc_dispatches,
		"actor": actor_id,
		"action": action_id,
		"time": Time.get_ticks_msec() / 1000.0,
	})
	if action_history.size() > 200:
		action_history.pop_front()
	if multiplayer != null and multiplayer.has_multiplayer_peer():
		_client_play_action_rpc.rpc(actor_id, action_id, payload)
	else:
		_client_play_action_rpc(actor_id, action_id, payload)
	return true


@rpc("authority", "call_local", "reliable")
func _client_play_action_rpc(actor_id: String, action_id: String, payload: Dictionary) -> void:
	action_executed.emit(actor_id, action_id, payload)


func broadcast_telegraph(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float) -> void:
	total_rpc_dispatches += 1
	if multiplayer != null and multiplayer.has_multiplayer_peer():
		_client_telegraph_rpc.rpc(actor_id, telegraph_type, origin, direction, radius, duration)
	else:
		_client_telegraph_rpc(actor_id, telegraph_type, origin, direction, radius, duration)


@rpc("authority", "call_local", "reliable")
func _client_telegraph_rpc(actor_id: String, telegraph_type: String, origin: Vector3, direction: Vector3, radius: float, duration: float) -> void:
	telegraph_started.emit(actor_id, telegraph_type, origin, direction, radius, duration)


func sync_world_state(snapshot: Dictionary) -> void:
	state_synced.emit(snapshot)
