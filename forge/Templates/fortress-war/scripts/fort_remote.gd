extends RefCounted
## The room server advances the match. This model only projects received state and local aim.

const EngineModel = preload("res://scripts/fort_engine.gd")
const INPUT_INTERVAL = 0.1
const COMMAND_WAIT = 1.0

var connected := false
var room_phase := "waiting"
var player_id := ""
var player_team := -1
var _model: RefCounted
var _send_action: Callable
var _on_event: Callable
var _room_key := ""
var _server_time := -INF
var _client_sequence := 0
var _input_clock := 0.0
var _aim_dirty := false
var _local_aim := {}
var _move_direction := 0
var _move_seconds := 0.0
var _terminal_wait := 0.0
var _item_wait := 0.0
var _event_cursor := -1
var _terrain_version := -1

var state: Dictionary:
	get:
		return _model.state if _model != null else {}
var terrain: Dictionary:
	get:
		return _model.terrain if _model != null else {}
var config: Dictionary:
	get:
		return _model.config if _model != null else {}


func _init(send_action: Callable, on_event: Callable = Callable()) -> void:
	_send_action = send_action
	_on_event = on_event


func receive_snapshot(payload: Dictionary) -> bool:
	var room = payload.get("state")
	if not room is Dictionary or not room.get("players") is Array:
		return false
	var room_key := str(room.get("id", room.get("roomId", room.get("key", ""))))
	var server_time := float(room.get("serverTime", -INF))
	var remote_game = room.get("game")
	var has_game: bool = remote_game is Dictionary and not remote_game.is_empty()
	var same_room := room_key == _room_key
	if same_room:
		if room.has("serverTime") and server_time < _server_time:
			return false
		if _model != null and (not has_game or float(remote_game.get("simTime", 0)) < float(state.get("simTime", 0))):
			return false

	var old_player_id := player_id
	var old_team := player_team
	var old_connected := connected
	var old_phase := room_phase
	player_id = str(payload.get("playerId", ""))
	room_phase = str(room.get("phase", "waiting"))
	player_team = -1
	connected = true
	if not player_id.is_empty():
		for player in room.players:
			if player.get("id") == player_id and not player.get("spectator", false) and player.get("connected", true):
				player_team = int(player.get("team", -1))
				break
	if not has_game:
		_clear_local_input()
		_model = null
		_terrain_version = -1
		_record_snapshot(room_key, server_time)
		return false
	if not remote_game.get("tanks") is Array or not room.get("config") is Dictionary:
		return false

	var next_config: Dictionary = room.config
	var new_match := _model == null or not same_room
	if new_match:
		var options := next_config.duplicate()
		options.control = "hotseat"
		_model = EngineModel.new(options)
		_terrain_version = -1
		_event_cursor = -1
		_clear_local_input()

	var specs := {}
	for definition in _model.catalog:
		specs[definition.id] = definition
	var next_state: Dictionary = remote_game.duplicate(true)
	for tank in next_state.tanks:
		var definition = specs.get(tank.get("typeId"))
		if definition == null:
			return false
		tank.def = definition

	var same_turn: bool = (
		state.get("turnNumber") == next_state.get("turnNumber")
		and state.get("activeId") == next_state.get("activeId")
		and state.get("phase") == next_state.get("phase")
		and old_connected and old_player_id == player_id and old_team == player_team
		and old_phase == room_phase and not new_match
	)
	if not same_turn:
		_clear_local_input()
	elif next_state.get("itemUsed", false):
		_item_wait = 0.0

	if not _update_terrain(room.get("terrain")):
		return false
	_record_snapshot(room_key, server_time)
	_model.state = next_state
	var preview = remote_game.get("actionPreview")
	var actor = active()
	_model._teleport_armed = bool(preview.get("teleportArmed", false)) if preview is Dictionary else (
		actor != null and actor.status.get("teleport", false))
	if same_turn and _owns_turn():
		_apply_local_aim()
	_apply_events(room.get("logs", []))
	return true


func _record_snapshot(room_key: String, server_time: float) -> void:
	_server_time = maxf(_server_time, server_time) if room_key == _room_key else server_time
	_room_key = room_key


func _update_terrain(snapshot) -> bool:
	if not snapshot is Dictionary:
		return _terrain_version >= 0
	var version := int(snapshot.get("version", -1))
	if version == _terrain_version:
		return _terrain_version >= 0
	var runs = snapshot.get("runs")
	if not runs is Array or version < 0:
		return false
	var width := int(snapshot.get("width", EngineModel.WIDTH))
	var height := int(snapshot.get("height", EngineModel.HEIGHT))
	if width != EngineModel.WIDTH or height != EngineModel.HEIGHT:
		return false
	var mask := PackedByteArray()
	mask.resize(width * height)
	var cursor := 0
	var count := 0
	for run in runs:
		if not run is Array or run.size() != 2:
			return false
		var start := int(run[0])
		var length := int(run[1])
		if start < cursor or length <= 0 or start >= mask.size() or length > mask.size() - start:
			return false
		cursor = start + length
		count += length
		for index in range(start, cursor):
			mask[index] = 1
	_model.terrain.mask = mask
	_model.terrain.version = version
	_model.terrain.solidCount = count
	_terrain_version = version
	return true


func _apply_events(events) -> void:
	if not _on_event.is_valid() or not events is Array:
		return
	for event in events:
		if not event is Dictionary:
			continue
		var event_id := int(event.get("seq", -1))
		if event_id > _event_cursor:
			_event_cursor = event_id
			var rendered_event = event.duplicate()
			rendered_event.type = event.get("event", "")
			_on_event.call(rendered_event)


func _clear_local_input() -> void:
	_local_aim.clear()
	_aim_dirty = false
	_move_direction = 0
	_move_seconds = 0.0
	_input_clock = 0.0
	_terminal_wait = 0.0
	_item_wait = 0.0


func disconnect_from_room() -> void:
	connected = false
	room_phase = "disconnected"
	_clear_local_input()


func active():
	return _model.active() if _model != null else null


func _owns_turn() -> bool:
	if _model == null or not connected or room_phase != "playing" or player_team not in [0, 1]:
		return false
	var actor = active()
	return actor != null and int(actor.team) == player_team and _model.is_human_turn()


func is_human_turn() -> bool:
	return _terminal_wait <= 0.0 and _owns_turn()


func tick(delta: float) -> void:
	if not is_finite(delta) or delta <= 0.0:
		return
	_terminal_wait = maxf(0.0, _terminal_wait - delta)
	_item_wait = maxf(0.0, _item_wait - delta)
	if not is_human_turn():
		return
	_input_clock += delta
	if _input_clock < INPUT_INTERVAL:
		return
	_input_clock = fmod(_input_clock, INPUT_INTERVAL)
	_flush_move()
	if _aim_dirty and _send("aim", _aim_payload()):
		_aim_dirty = false


func _apply_local_aim() -> void:
	if _local_aim.has("weaponIndex"):
		_model.set_weapon(_local_aim.weaponIndex)
	if _local_aim.has("face"):
		_model.set_facing(_local_aim.face)
	if _local_aim.has("angle"):
		_model.set_angle(_local_aim.angle)
	if _local_aim.has("power"):
		_model.set_power(_local_aim.power)


func _aim_payload() -> Dictionary:
	var actor = active()
	return {"angle": actor.angle, "power": state.power, "face": int(actor.face), "weaponIndex": int(state.weaponIndex)}


func _send(action: String, details: Dictionary = {}) -> bool:
	if not is_human_turn() or not _send_action.is_valid():
		return false
	_client_sequence += 1
	var request := {"seq": _client_sequence, "turnNumber": int(state.turnNumber), "action": action}
	request.merge(details)
	var accepted = _send_action.call(request)
	return accepted != false


func set_angle(value) -> bool:
	if not is_human_turn() or not _model.set_angle(value):
		return false
	_local_aim.angle = active().angle
	_aim_dirty = true
	return true


func set_power(value) -> bool:
	if not is_human_turn() or not _model.set_power(value):
		return false
	# Charge can update every frame. Its power travels with the fire command.
	_local_aim.power = state.power
	return true


func set_facing(value) -> bool:
	if not is_human_turn() or not _model.set_facing(value):
		return false
	_local_aim.face = active().face
	_aim_dirty = true
	return true


func set_weapon(index) -> bool:
	if not is_human_turn() or not _model.set_weapon(index):
		return false
	_local_aim.weaponIndex = state.weaponIndex
	_aim_dirty = true
	return true


func set_aim_at_world(x, y) -> bool:
	if not is_human_turn() or not _model.set_aim_at_world(x, y):
		return false
	_local_aim.angle = active().angle
	_local_aim.face = active().face
	_aim_dirty = true
	return true


func move(direction, delta) -> bool:
	if not is_human_turn() or active().moveLeft <= 0:
		return false
	if not (direction is float or direction is int) or not (delta is float or delta is int):
		return false
	if not is_finite(direction) or not is_finite(delta) or delta <= 0 or direction == 0:
		return false
	var sign := 1 if direction > 0 else -1
	if _move_direction != sign:
		_move_seconds = 0.0
	_move_direction = sign
	_move_seconds = minf(INPUT_INTERVAL, _move_seconds + delta)
	set_facing(sign)
	return true


func _flush_move() -> void:
	if _move_seconds <= 0.0:
		return
	_send("move", {"direction": _move_direction, "dt": _move_seconds})
	_move_seconds = 0.0


func fire() -> bool:
	if not is_human_turn() or not get_action_preview().canFire:
		return false
	_flush_move()
	if not _send("fire", _aim_payload()):
		return false
	_terminal_wait = COMMAND_WAIT
	_aim_dirty = false
	return true


func skip() -> bool:
	if not is_human_turn():
		return false
	_flush_move()
	if not _send("skip"):
		return false
	_terminal_wait = COMMAND_WAIT
	_aim_dirty = false
	return true


func can_use_item(id: String) -> bool:
	return _item_wait <= 0.0 and is_human_turn() and _model.can_use_item(id)


func use_item(id: String) -> bool:
	if not can_use_item(id) or not _send("item", {"itemId": id}):
		return false
	_item_wait = COMMAND_WAIT
	return true


# A browser seat cannot pause the shared clock.
func set_paused(_value: bool) -> bool:
	return false


func get_trajectory() -> Array:
	return _model.get_trajectory() if is_human_turn() else []


func get_aiming_state():
	return _model.get_aiming_state() if _model != null else null


func get_charge_power(elapsed_seconds):
	return _model.get_charge_power(elapsed_seconds) if is_human_turn() else null


func get_action_preview():
	if _model == null:
		return null
	var preview = _model.get_action_preview()
	if preview != null and not is_human_turn() and preview.canFire:
		preview.canFire = false
		preview.reason = "remote_turn"
	return preview
