extends Node
## R1 라이브 통합 검증 씬 (로드맵 26 Iris 복제 + 27 이동 예측/보간 + 30 서버 Validator).
## - Godot 기본 MultiplayerSynchronizer를 전혀 사용하지 않고 FgReplicationBridge(SceneMultiplayer.send_bytes)만 사용한다.
## - 서버 1 + 클라이언트 2가 실제 ENet/UDP 프록시(RTT/손실 주입) 위에서:
##   1) Iris 양자화/delta/ACK + owner 전용 필드 격리(비권한 클라이언트 0바이트 누출)
##   2) 클라이언트 A 로컬 예측 + AuthoritySnapshot ACK reconcile/replay + 화면 smoothing
##   3) 클라이언트 A의 원격 클라이언트 B 스냅샷 링 보간
##   4) 서버 FgServerValidator 입력 검증(정상 지연 오탐 0건)
##   을 실측 검증한다.

const NetEventLogScript := preload("res://addons/playforge_netframework/runtime/net_event_log.gd")
const NetModeScript := preload("res://addons/playforge_netframework/runtime/net_mode.gd")
const FgNetSchemaScript := preload("res://addons/playforge_netframework/replication/fg_net_schema.gd")
const FgReplicationBridgeScript := preload("res://addons/playforge_netframework/replication/fg_replication_bridge.gd")
const FgMovementSimScript := preload("res://addons/playforge_netframework/prediction/fg_movement_sim.gd")
const FgPredictedCharacterScript := preload("res://addons/playforge_netframework/prediction/fg_predicted_character.gd")
const FgRemoteInterpolatorScript := preload("res://addons/playforge_netframework/prediction/fg_remote_interpolator.gd")
const FgServerValidatorScript := preload("res://addons/playforge_netframework/validation/fg_server_validator.gd")

const TICK_HZ := 30
const SNAPSHOT_EVERY_TICKS := 3 # 10Hz snapshot
const INPUT_CHANNEL := 3
const AUTH_CHANNEL := 4

var args: Dictionary = {}
var role: String = ""
var bot: String = "ds"
var event_log: NetEventLogScript
var smp: SceneMultiplayer
var sim: FgMovementSimScript
var schema: FgNetSchemaScript
var bridge: FgReplicationBridgeScript
var validator: FgServerValidatorScript

var server_tick: int = 0
var play_ticks_target: int = 120
var settle_ticks: int = 45
var playing: bool = false
var play_tick: int = 0
var _done: bool = false
var _deadline_ms: int = 0

# 서버 상태: peer_id -> {slot, user, net_id, key, sim_state, last_seq, last_move, last_dash_seq}
var srv_players: Dictionary = {}

# 클라이언트 상태
var connected: bool = false
var my_peer_id: int = 0
var my_key: String = ""
var predictor: FgPredictedCharacterScript
var remote_interp: FgRemoteInterpolatorScript
var client_tick: int = 0
var leak_detected: bool = false
var owner_secret_verified: bool = false
var auth_snapshots_received: int = 0
var stop_file: String = ""


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	role = NetModeScript.resolve(args, OS.has_feature("dedicated_server"), DisplayServer.get_name() == "headless")
	if role.is_empty():
		get_tree().quit(2)
		return
	bot = String(args.get("bot", "ds"))
	play_ticks_target = int(args.get("play-ticks", "120"))
	settle_ticks = int(args.get("settle-ticks", "45"))
	stop_file = String(args.get("stop-file", ""))
	Engine.physics_ticks_per_second = TICK_HZ
	Engine.max_fps = 60
	_deadline_ms = Time.get_ticks_msec() + int(float(args.get("max-seconds", "35")) * 1000.0)

	event_log = NetEventLogScript.new("%s:%s" % [role, bot])
	sim = FgMovementSimScript.make_default_static_world()
	schema = FgNetSchemaScript.create_default_character_schema()
	smp = multiplayer as SceneMultiplayer
	smp.server_relay = false
	bridge = FgReplicationBridgeScript.new()
	bridge.name = "IrisBridge"
	add_child(bridge)

	if NetModeScript.accepts_clients(role):
		_start_server()
	else:
		_start_client()


func _start_server() -> void:
	var port := int(args.get("port", "24665"))
	var peer := ENetMultiplayerPeer.new()
	peer.set_bind_ip("127.0.0.1")
	var err := peer.create_server(port, 8)
	if err != OK:
		event_log.emit("fatal", {"error": "create_server", "code": err})
		get_tree().quit(2)
		return
	smp.multiplayer_peer = peer
	validator = FgServerValidatorScript.new("r1-live", "forge-r1", "4.7.2")
	bridge.setup_server(smp, schema, 1)
	smp.peer_connected.connect(_on_server_peer_connected)
	smp.peer_disconnected.connect(_on_server_peer_disconnected)
	smp.peer_packet.connect(_on_server_packet)
	event_log.emit("r1_server_ready", {"port": port, "protocolHash": schema.compute_protocol_hash()})


func _on_server_peer_connected(peer_id: int) -> void:
	var slot := srv_players.size()
	var start_pos := Vector2(100.0, 200.0 + 180.0 * slot)
	var secret := "SECRET_OWNER_PEER_%d" % peer_id
	var reg := bridge.store.register_object({
		"position": start_pos,
		"rotation": 0.0,
		"health": 100,
		"owner_secret": secret,
	}, peer_id, 1.0, "relevant", server_tick)
	bridge.store.apply_inventory_change(reg.net_id, "medkit_slot_%d" % slot, 2 + slot, false)
	srv_players[peer_id] = {
		"slot": slot,
		"user": "p%d" % slot,
		"net_id": reg.net_id,
		"key": String(reg.key),
		"secret": secret,
		"sim_state": FgMovementSimScript.make_state(start_pos),
		"last_seq": 0,
		"last_move": Vector2.ZERO,
		"pending_edges": 0,
	}
	event_log.emit("r1_player_joined", {"peer": peer_id, "slot": slot, "key": String(reg.key), "players": srv_players.size()})
	if srv_players.size() >= 2 and not playing:
		playing = true
		bridge.flush_server_tick(server_tick)
		_broadcast_authority_snapshots()
		event_log.emit("r1_match_started", {"serverTick": server_tick})


func _on_server_peer_disconnected(peer_id: int) -> void:
	if srv_players.has(peer_id):
		var rec: Dictionary = srv_players[peer_id]
		bridge.store.destroy_object(rec.net_id, server_tick)
		srv_players.erase(peer_id)


func _on_server_packet(peer_id: int, raw: PackedByteArray) -> void:
	if raw.size() < 2 or raw[0] != 0x49 or raw[1] != 0x4E: # "IN" input command
		return
	if not srv_players.has(peer_id):
		return
	var buf := StreamPeerBuffer.new()
	buf.data_array = raw
	buf.seek(2)
	if buf.get_size() - buf.get_position() < 17:
		return
	var seq := buf.get_u32()
	var ctick := buf.get_u32()
	var mx := buf.get_float()
	var my := buf.get_float()
	var edges := buf.get_u8()
	var rec: Dictionary = srv_players[peer_id]
	var move := Vector2(mx, my)
	var vres := validator.validate_move_input(peer_id, String(rec.user), server_tick, ctick, move, Time.get_ticks_msec())
	if not vres.ok:
		return
	if seq <= int(rec.last_seq):
		return
	rec.last_seq = seq
	rec.last_move = vres.move
	rec.pending_edges = int(rec.pending_edges) | edges


func _start_client() -> void:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(String(args.get("host", "127.0.0.1")), int(args.get("port", "24665")))
	if err != OK:
		event_log.emit("fatal", {"error": "create_client", "code": err})
		get_tree().quit(2)
		return
	smp.multiplayer_peer = peer
	smp.connected_to_server.connect(_on_client_connected)
	smp.server_disconnected.connect(func() -> void: _finish_client("server_disconnected"))
	smp.peer_packet.connect(_on_client_packet)


func _on_client_connected() -> void:
	connected = true
	my_peer_id = multiplayer.get_unique_id()
	bridge.setup_client(smp, schema, 1, my_peer_id)
	bridge.client_engine.on_state_applied = _on_iris_state_applied
	remote_interp = FgRemoteInterpolatorScript.new(float(TICK_HZ), 100.0, 100.0)
	event_log.emit("r1_client_connected", {"peer": my_peer_id, "bot": bot})


func _on_iris_state_applied(key: String, _mask: int, _rev: int, state: Dictionary) -> void:
	var obj: Dictionary = bridge.client_engine.objects.get(key, {})
	if obj.is_empty():
		return
	var owner_id := int(obj.get("owner_peer_id", 0))
	if owner_id == my_peer_id:
		my_key = key
		if predictor == null and state.has("position"):
			predictor = FgPredictedCharacterScript.new(sim, state.position, 1.0 / float(TICK_HZ), 1)
		if String(state.get("owner_secret", "")) == ("SECRET_OWNER_PEER_%d" % my_peer_id) and state.has("inventory"):
			owner_secret_verified = true
	else:
		# 비권한 객체에 owner 전용 필드가 절대로 들어오면 안 된다
		if state.has("owner_secret") or state.has("inventory"):
			leak_detected = true
		if state.has("position"):
			remote_interp.push_snapshot({
				"server_tick": server_tick,
				"world_epoch": 1,
				"position": state.position,
				"rotation": float(state.get("rotation", 0.0)),
				"velocity": Vector2.ZERO,
				"teleport_revision": 0,
			}, Time.get_ticks_msec())


func _on_client_packet(peer_id: int, raw: PackedByteArray) -> void:
	if peer_id != 1 or raw.size() < 2:
		return
	if raw[0] != 0x41 or raw[1] != 0x55: # "AU" authority movement snapshot
		return
	var buf := StreamPeerBuffer.new()
	buf.data_array = raw
	buf.seek(2)
	if buf.get_size() - buf.get_position() < 32:
		return
	var stick := buf.get_u32()
	var ack_seq := buf.get_u32()
	var px := buf.get_float()
	var py := buf.get_float()
	var vx := buf.get_float()
	var vy := buf.get_float()
	var mode := buf.get_u8()
	var dleft := buf.get_u8()
	var dcd := buf.get_u8()
	var trev := buf.get_u8()
	var target_peer := buf.get_u32()
	server_tick = maxi(server_tick, stick)
	if target_peer == my_peer_id and predictor != null:
		auth_snapshots_received += 1
		predictor.reconcile({
			"server_tick": stick,
			"acked_input_seq": ack_seq,
			"world_epoch": 1,
			"position": Vector2(px, py),
			"velocity": Vector2(vx, vy),
			"movement_mode": mode,
			"dash_ticks_left": dleft,
			"dash_cd_ticks": dcd,
			"teleport_revision": trev,
		})
	elif target_peer != my_peer_id and remote_interp != null:
		remote_interp.push_snapshot({
			"server_tick": stick,
			"world_epoch": 1,
			"position": Vector2(px, py),
			"rotation": Vector2(vx, vy).angle() if Vector2(vx, vy).length_squared() > 0.01 else 0.0,
			"velocity": Vector2(vx, vy),
			"teleport_revision": trev,
		}, Time.get_ticks_msec())


func _physics_process(dt: float) -> void:
	if _done:
		return
	if Time.get_ticks_msec() > _deadline_ms:
		if NetModeScript.accepts_clients(role):
			_finish_server("timeout")
		else:
			_finish_client("timeout")
		return
	if NetModeScript.accepts_clients(role):
		_server_tick(dt)
	else:
		_client_tick(dt)


func _server_tick(dt: float) -> void:
	server_tick += 1
	if playing:
		play_tick += 1
		var in_settle := play_tick > play_ticks_target
		for pid in srv_players:
			var rec: Dictionary = srv_players[pid]
			var cmd := FgMovementSimScript.make_input(
				int(rec.last_seq),
				server_tick,
				Vector2.ZERO if in_settle else rec.last_move,
				0 if in_settle else int(rec.pending_edges)
			)
			rec.pending_edges = 0
			var prev_pos: Vector2 = rec.sim_state.position
			var next_state := sim.step(rec.sim_state, cmd, dt)
			validator.validate_displacement(String(rec.user), server_tick, prev_pos, next_state.position, sim.dash_speed, dt, false)
			rec.sim_state = next_state
			bridge.store.set_field(rec.net_id, "position", next_state.position)
			var vel: Vector2 = next_state.velocity
			if vel.length_squared() > 0.01:
				bridge.store.set_field(rec.net_id, "rotation", vel.angle())
		if server_tick % SNAPSHOT_EVERY_TICKS == 0:
			bridge.flush_server_tick(server_tick)
			_broadcast_authority_snapshots()
		if play_tick >= play_ticks_target + settle_ticks:
			_finish_server("complete")
	else:
		if server_tick % SNAPSHOT_EVERY_TICKS == 0 and not srv_players.is_empty():
			bridge.flush_server_tick(server_tick)


func _broadcast_authority_snapshots() -> void:
	for pid in srv_players:
		var rec: Dictionary = srv_players[pid]
		var st: Dictionary = rec.sim_state
		var buf := StreamPeerBuffer.new()
		buf.put_u8(0x41) # 'A'
		buf.put_u8(0x55) # 'U'
		buf.put_u32(server_tick)
		buf.put_u32(int(rec.last_seq))
		buf.put_float((st.position as Vector2).x)
		buf.put_float((st.position as Vector2).y)
		buf.put_float((st.velocity as Vector2).x)
		buf.put_float((st.velocity as Vector2).y)
		buf.put_u8(int(st.movement_mode))
		buf.put_u8(int(st.dash_ticks_left))
		buf.put_u8(int(st.dash_cd_ticks))
		buf.put_u8(int(st.teleport_revision))
		buf.put_u32(int(pid))
		for target_pid in srv_players:
			smp.send_bytes(buf.data_array, int(target_pid), MultiplayerPeer.TRANSFER_MODE_UNRELIABLE, AUTH_CHANNEL)


func _client_tick(dt: float) -> void:
	if not connected or predictor == null:
		return
	client_tick += 1
	var move := Vector2.ZERO
	if client_tick <= play_ticks_target:
		if bot == "a":
			move = Vector2.RIGHT if client_tick < 50 else (Vector2.DOWN if client_tick < 90 else Vector2.LEFT)
		else:
			move = Vector2.DOWN if client_tick < 60 else Vector2.RIGHT
	var edges := FgMovementSimScript.BTN_DASH if (client_tick == 25 and bot == "a") else 0
	var cmd := predictor.predict_local_input(client_tick, move, edges)
	predictor.tick_visual_smoothing(dt)

	var buf := StreamPeerBuffer.new()
	buf.put_u8(0x49) # 'I'
	buf.put_u8(0x4E) # 'N'
	buf.put_u32(int(cmd.input_seq))
	buf.put_u32(server_tick)
	buf.put_float((cmd.move as Vector2).x)
	buf.put_float((cmd.move as Vector2).y)
	buf.put_u8(int(cmd.button_edges))
	smp.send_bytes(buf.data_array, 1, MultiplayerPeer.TRANSFER_MODE_UNRELIABLE, INPUT_CHANNEL)

	if not stop_file.is_empty() and FileAccess.file_exists(stop_file):
		_finish_client("stop_file")


func _finish_server(reason: String) -> void:
	if _done:
		return
	_done = true
	var final_positions := {}
	for pid in srv_players:
		var rec: Dictionary = srv_players[pid]
		var p: Vector2 = rec.sim_state.position
		final_positions[String(rec.key)] = [snappedf(p.x, 0.01), snappedf(p.y, 0.01)]
	event_log.emit("r1_server_summary", {
		"reason": reason,
		"serverTick": server_tick,
		"playTick": play_tick,
		"positions": final_positions,
		"irisStats": bridge.server_engine.stats,
		"validatorCounters": validator.counters,
	})
	await get_tree().create_timer(0.3).timeout
	smp.multiplayer_peer.close()
	get_tree().quit(0)


func _finish_client(reason: String) -> void:
	if _done:
		return
	_done = true
	var iris_positions := {}
	if bridge.client_engine != null:
		for k in bridge.client_engine.objects:
			var st: Dictionary = bridge.client_engine.objects[k].state
			if st.has("position"):
				var p: Vector2 = st.position
				iris_positions[k] = [snappedf(p.x, 0.01), snappedf(p.y, 0.01)]
	var remote_sample := remote_interp.sample(float(server_tick) / float(TICK_HZ)) if remote_interp != null else {"valid": false}
	event_log.emit("r1_client_summary", {
		"reason": reason,
		"bot": bot,
		"peer": my_peer_id,
		"myKey": my_key,
		"ownerSecretVerified": owner_secret_verified,
		"leakDetected": leak_detected,
		"authSnapshotsReceived": auth_snapshots_received,
		"predictedPos": [snappedf((predictor.sim_state.position as Vector2).x, 0.01), snappedf((predictor.sim_state.position as Vector2).y, 0.01)] if predictor != null else null,
		"irisPositions": iris_positions,
		"prediction": {
			"inputsPredicted": int(predictor.stats.inputs_predicted),
			"snapshotsProcessed": int(predictor.stats.snapshots_processed),
			"corrections": int(predictor.stats.corrections),
			"hardCorrections": int(predictor.stats.hard_corrections),
			"replayedTicks": int(predictor.stats.replayed_ticks_total),
			"errorP95": snappedf(predictor.error_p95(), 0.001),
			"maxSimError": snappedf(float(predictor.stats.max_sim_error), 0.001),
			"maxVisualError": snappedf(float(predictor.stats.max_visual_error), 0.001),
		} if predictor != null else {},
		"remoteInterp": {
			"valid": bool(remote_sample.get("valid", false)),
			"mode": String(remote_sample.get("mode", "")),
			"pushed": int(remote_interp.stats.snapshots_pushed) if remote_interp != null else 0,
			"adaptiveDelayMs": snappedf(remote_interp.adaptive_delay_ms, 0.1) if remote_interp != null else 0.0,
		},
		"irisClientStats": bridge.client_engine.stats if bridge.client_engine != null else {},
	})
	if smp.multiplayer_peer != null:
		smp.multiplayer_peer.close()
	get_tree().quit(0)
