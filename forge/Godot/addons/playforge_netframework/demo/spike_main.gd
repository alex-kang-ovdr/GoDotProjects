extends Node
## R0 스파이크 진입점: 같은 씬을 역할별 별도 프로세스로 실행한다.
##   서버:   godot --headless --path <proj> res://addons/playforge_netframework/demo/spike.tscn -- --netmode=dedicated-server --port=N --run-dir=DIR
##   listen: godot --path <proj> res://addons/playforge_netframework/demo/spike.tscn -- --netmode=listen-server --port=N
##   로컬:   godot --path <proj> res://addons/playforge_netframework/demo/spike.tscn -- --netmode=standalone
##   클라:   ... --netmode=client --bot=a --ticket=DIR/tickets/bot-a.ticket
## 기본 모드는 dedicated-server feature/headless이면 서버, 그 외 standalone.
## 봇: a/b/c(늦은 입장)는 스크립트 이동, probe는 입장 거부를 기대하는 공격 클라이언트.

const NetWorldScript := preload("res://addons/playforge_netframework/runtime/net_world.gd")
const NetGameModeScript := preload("res://addons/playforge_netframework/runtime/net_game_mode.gd")
const NetGameStateScript := preload("res://addons/playforge_netframework/runtime/net_game_state.gd")
const NetJoinTicketScript := preload("res://addons/playforge_netframework/runtime/join_ticket.gd")
const NetEventLogScript := preload("res://addons/playforge_netframework/runtime/net_event_log.gd")
const NetProfilerScript := preload("res://addons/playforge_netframework/runtime/net_profiler.gd")
const NetIdsScript := preload("res://addons/playforge_netframework/runtime/net_ids.gd")
const NetPlayerControllerScript := preload("res://addons/playforge_netframework/runtime/net_player_controller.gd")
const NetPlayerStateScript := preload("res://addons/playforge_netframework/runtime/net_player_state.gd")
const NetPawnScript := preload("res://addons/playforge_netframework/runtime/net_pawn.gd")
const NetModeScript := preload("res://addons/playforge_netframework/runtime/net_mode.gd")
const NetTransportScript := preload("res://addons/playforge_netframework/runtime/net_transport.gd")

const TICK_HZ := 30
const CLI_OPTIONS := [
	"netmode", "transport", "host", "port", "run-dir", "bot", "log", "ticket", "ticket-ttl",
	"tls-cert", "tls-key", "tls-ca", "tls-hostname",
	"reconnect-grace", "disconnect-after-ticks", "stale-epoch-probe",
	"max-players", "play-ticks", "settle-max", "max-seconds", "tamper-slot", "wait-file", "linger",
	"settle-file", "leave-file",
	"net-profile", "net-profile-interval", "net-profile-output", "net-debug", "net-debug-proxy", "net-debug-reply",
]

var args: Dictionary = {}
var role: String = ""
var transport: String = NetTransportScript.ENET
var event_log: NetEventLogScript
var net_profiler: NetProfilerScript
var world: NetWorldScript
var smp: SceneMultiplayer
var game_mode: NetGameModeScript

# 클라이언트 상태
var bot: String = ""
var is_probe: bool = false
var ticket: String = ""
var connected: bool = false
var connect_start_us: int = 0
var my_root: Node = null
var first_play_tick: int = -1
var illegal_sent: int = 0
var stale_epoch_sent: int = 0
var disconnect_after_ticks: int = 0
var stale_epoch_probe: bool = false
var snapshot_done: bool = false
var leave_at_ms: int = -1
var leaving: bool = false
var inputs_sent: int = 0
var wait_file: String = ""
var leave_file: String = ""
var _deadline_ms: int = 0
var _quitting: bool = false
var _local_root: Node
var _bot_client := false
var _standalone_inputs := 0
var _standalone_progress_reported := false
var _net_debug_enabled := false
var _net_debug_reply_path := ""
var _net_debug_reply_seq := 0
var _next_net_debug_reply_poll_ms := 0
var _debug_canvas: CanvasLayer
var _debug_panel: PanelContainer
var _debug_input: LineEdit
var _debug_output: Label
var _debug_lines: PackedStringArray = PackedStringArray()


func _ready() -> void:
	if not _parse_args():
		get_tree().quit(2)
		return
	role = _resolve_role()
	if role.is_empty():
		get_tree().quit(2)
		return
	transport = String(args.get("transport", NetTransportScript.ENET)).to_lower()
	if not NetTransportScript.is_valid(transport):
		push_error("Unknown --transport: %s (expected enet, ws, or wss)" % transport)
		get_tree().quit(2)
		return
	disconnect_after_ticks = int(args.get("disconnect-after-ticks", "0"))
	stale_epoch_probe = args.has("stale-epoch-probe")
	Engine.physics_ticks_per_second = TICK_HZ
	Engine.max_fps = 60
	get_tree().auto_accept_quit = false
	bot = String(args.get("bot", "ds"))
	is_probe = bot.begins_with("probe")
	_bot_client = args.has("bot")
	event_log = NetEventLogScript.new("%s:%s" % [role, bot], String(args.get("log", "")))
	net_profiler = NetProfilerScript.new()
	net_profiler.name = "NetProfiler"
	net_profiler.configure(event_log, event_log.role, float(args.get("net-profile-interval", "1")), String(args.get("net-profile-output", "")), role)
	add_child(net_profiler)
	if args.has("net-profile"):
		net_profiler.start_periodic()
	_net_debug_enabled = args.has("net-debug")
	_net_debug_reply_path = String(args.get("net-debug-reply", ""))
	if _net_debug_enabled and DisplayServer.get_name() != "headless":
		_setup_net_debug_console()
	var default_deadline := "0" if role == "standalone" else "45"
	var max_seconds := float(args.get("max-seconds", default_deadline))
	_deadline_ms = Time.get_ticks_msec() + int(max_seconds * 1000.0) if max_seconds > 0.0 else 0
	world = NetWorldScript.new()
	world.name = "World"
	world.configure_net_mode(role)
	world.configure_profiler(net_profiler)
	add_child(world)
	smp = multiplayer as SceneMultiplayer
	smp.server_relay = false
	net_profiler.attach_peer(smp.multiplayer_peer)
	net_profiler.attach_multiplayer_api(smp, args.has("net-profile") or args.has("net-debug") or args.has("net-profile-output"))
	if NetModeScript.accepts_clients(role):
		_start_server()
	elif role == "standalone":
		_start_standalone()
	else:
		wait_file = String(args.get("wait-file", ""))
		leave_file = String(args.get("leave-file", ""))
		event_log.emit("client_boot", {"bot": bot, "probe": is_probe, "waitFile": not wait_file.is_empty(), "headless": DisplayServer.get_name() == "headless", "netMode": role})
		if wait_file.is_empty():
			_start_client()


func _parse_args() -> bool:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			if kv[0] not in CLI_OPTIONS:
				push_error("Unknown argument --%s. Select the network mode with --netmode=<mode>." % kv[0])
				return false
			args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	return true


func _resolve_role() -> String:
	return NetModeScript.resolve(args, OS.has_feature("dedicated_server"), DisplayServer.get_name() == "headless")


func _notification(what: int) -> void:
	# 창 닫기 요청(그리고 이를 매핑하는 플랫폼의 SIGTERM)은 즉시 종료하지 않고 drain으로 보낸다.
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if role == "standalone" and game_mode != null:
			game_mode.stop_standalone("close_request")
		elif NetModeScript.accepts_clients(role) and game_mode != null:
			game_mode.request_drain("close_request")
		else:
			_leave("close_request")


# ================================================================ server

func _start_server() -> void:
	var port := int(args.get("port", "24565"))
	var run_dir := String(args.get("run-dir", "user://ds-spike"))
	var session_id := NetIdsScript.random_id(8)
	var instance_id := "local-" + str(OS.get_process_id())
	var world_key := NetIdsScript.make_world_key("local", "forge-ds-spike", "dev-%d.%d.%d" % [Engine.get_version_info().major, Engine.get_version_info().minor, Engine.get_version_info().patch], session_id, 1)
	var tickets := NetJoinTicketScript.new(session_id, instance_id, 1, int(args.get("ticket-ttl", "60")))

	var tls_options: TLSOptions = null
	var tls_cert_path := ""
	if transport == NetTransportScript.WSS:
		if args.has("tls-cert") and args.has("tls-key"):
			var loaded := NetTransportScript.load_server_tls(String(args["tls-cert"]), String(args["tls-key"]))
			if not loaded.ok:
				event_log.emit("fatal", {"error": "tls_load", "reason": loaded.get("reason", ""), "code": loaded.get("error", -1)})
				get_tree().quit(2)
				return
			tls_options = loaded.tlsOptions
			tls_cert_path = String(loaded.certPath)
		else:
			var gen := NetTransportScript.generate_loopback_tls(run_dir.path_join("tls"), String(args.get("tls-hostname", "localhost")))
			if not gen.ok:
				event_log.emit("fatal", {"error": "tls_generate", "reason": gen.get("reason", ""), "code": gen.get("error", -1)})
				get_tree().quit(2)
				return
			tls_options = TLSOptions.server(gen.key, gen.cert)
			tls_cert_path = String(gen.certPath)

	var srv := NetTransportScript.create_server(transport, "127.0.0.1", port, 16, tls_options)
	if not srv.ok:
		event_log.emit("fatal", {"error": "create_server", "transport": transport, "reason": srv.get("reason", ""), "code": srv.get("error", -1), "port": port})
		get_tree().quit(2)
		return
	var peer: MultiplayerPeer = srv.peer
	game_mode = NetGameModeScript.new()
	game_mode.name = "GameMode"
	game_mode.max_players = int(args.get("max-players", "3"))
	game_mode.play_ticks = int(args.get("play-ticks", "150"))
	game_mode.settle_request_file = String(args.get("settle-file", ""))
	game_mode.settle_max_seconds = float(args.get("settle-max", "10"))
	game_mode.reconnect_grace_seconds = float(args.get("reconnect-grace", "0"))
	game_mode.ticket_dir = run_dir.path_join("tickets")
	game_mode.drain_request_file = run_dir.path_join("control/drain")
	add_child(game_mode)
	game_mode.setup(world, event_log, tickets, smp)
	game_mode.finished.connect(_on_server_finished)
	smp.multiplayer_peer = peer
	net_profiler.attach_peer(peer, transport)
	world.game_state.world_key = NetIdsScript.world_key_string(world_key)

	# 로컬 가짜 제공자: 사용자별 1회용 티켓 발급. 파일에는 서명된 티켓만 있고 비밀키는 없다.
	DirAccess.make_dir_recursive_absolute(run_dir.path_join("tickets"))
	var issued: Array = []
	for spec in [["bot-a", 0], ["bot-b", 1], ["bot-c", 2], ["bot-x", 0]]:
		var t := tickets.issue(String(spec[0]), int(spec[1]))
		var f := FileAccess.open(run_dir.path_join("tickets/%s.ticket" % spec[0]), FileAccess.WRITE)
		f.store_string(t)
		f.close()
		issued.append({"userId": spec[0], "slot": spec[1]})
	event_log.emit("server_listening", {
		"port": port, "transport": transport, "transportCaps": srv.capabilities, "tlsCertPath": tls_cert_path,
		"worldKey": world_key, "maxPlayers": game_mode.max_players,
		"tickHz": TICK_HZ, "engine": Engine.get_version_info().string,
		"dedicatedServerFeature": OS.has_feature("dedicated_server"), "displayServer": DisplayServer.get_name(),
		"serverIsPlayer": false, "netMode": role, "rendered": DisplayServer.get_name() != "headless",
	})
	event_log.emit("tickets_issued", {"tickets": issued, "ttlSec": tickets.ttl_sec})
	if role == "listen-server":
		event_log.emit("listen_server_ready", {"localPlayer": false})


func _start_standalone() -> void:
	var session_id := NetIdsScript.random_id(8)
	var world_key := NetIdsScript.make_world_key("local", "forge-standalone", "dev-%d.%d.%d" % [Engine.get_version_info().major, Engine.get_version_info().minor, Engine.get_version_info().patch], session_id, 1)
	game_mode = NetGameModeScript.new()
	game_mode.name = "GameMode"
	game_mode.max_players = 1
	game_mode.min_players_to_start = 1
	game_mode.play_ticks = 0
	game_mode.settle_max_seconds = 0.0
	add_child(game_mode)
	game_mode.setup(world, event_log, null, smp)
	game_mode.finished.connect(_on_server_finished)
	world.game_state.world_key = NetIdsScript.world_key_string(world_key)
	_local_root = game_mode.add_standalone_player("local-player", 0)
	event_log.emit("standalone_ready", {"worldKey": world_key, "localPlayer": _local_root != null, "network": false})


func _on_server_finished(code: int) -> void:
	await get_tree().create_timer(0.2).timeout
	smp.multiplayer_peer.close()
	smp.multiplayer_peer = null
	event_log.emit("server_exit", {"code": code})
	get_tree().quit(code)


# ================================================================ client

func _start_client() -> void:
	var path := String(args.get("ticket", ""))
	ticket = FileAccess.get_file_as_string(path).strip_edges()
	if ticket.is_empty():
		event_log.emit("fatal", {"error": "ticket_missing"})
		get_tree().quit(2)
		return
	if args.has("tamper-slot"):
		ticket = NetJoinTicketScript.debug_tamper_slot(ticket, int(args["tamper-slot"]))
	smp.auth_callback = _client_auth
	smp.peer_authenticating.connect(_on_authenticating)
	smp.peer_authentication_failed.connect(func(peer_id: int) -> void:
		if peer_id == 1 and not _quitting:
			event_log.emit("client_auth_failed", {})
			_quit(1))
	smp.connected_to_server.connect(_on_connected)
	smp.connection_failed.connect(func() -> void:
		event_log.emit("connection_failed", {})
		_quit(0 if is_probe else 1))
	smp.server_disconnected.connect(_on_server_disconnected)
	var cli := NetTransportScript.create_client(
		transport,
		String(args.get("host", "127.0.0.1")),
		int(args.get("port", "24565")),
		String(args.get("tls-ca", "")),
		String(args.get("tls-hostname", "localhost"))
	)
	if not cli.ok:
		event_log.emit("fatal", {"error": "create_client", "transport": transport, "reason": cli.get("reason", ""), "code": cli.get("error", -1)})
		get_tree().quit(2)
		return
	var peer: MultiplayerPeer = cli.peer
	connect_start_us = Time.get_ticks_usec()
	smp.multiplayer_peer = peer
	net_profiler.attach_peer(peer, transport)
	event_log.emit("client_connect_started", {"bot": bot, "transport": transport, "transportCaps": cli.capabilities})


func _on_authenticating(peer_id: int) -> void:
	if peer_id == 1:
		smp.send_auth(1, ticket.to_utf8_buffer())


func _client_auth(peer_id: int, data: PackedByteArray) -> void:
	var reply := data.get_string_from_utf8()
	if reply == "ok":
		smp.complete_auth(peer_id)
		return
	var reason := reply.trim_prefix("rej:")
	event_log.emit("join_refused", {"reason": reason, "expected": is_probe})
	_quit(0 if is_probe else 1)


func _on_connected() -> void:
	connected = true
	var ms := float(Time.get_ticks_usec() - connect_start_us) / 1000.0
	event_log.emit("connected", {"peer": multiplayer.get_unique_id(), "connectMs": snappedf(ms, 0.01), "phase": world.game_state.phase})
	if is_probe:
		event_log.emit("probe_admitted_unexpectedly", {})
		_quit(1)


func _on_server_disconnected() -> void:
	if leaving:
		_quit(0)
		return
	event_log.emit("server_disconnected", {"snapshotDone": snapshot_done})
	_quit(0 if (is_probe or snapshot_done) else 1)


func _process(_dt: float) -> void:
	_poll_net_debug_reply()
	if _deadline_ms > 0 and Time.get_ticks_msec() > _deadline_ms:
		event_log.emit("mode_timeout", {"netMode": role})
		if role == "standalone":
			event_log.emit("standalone_progress", _standalone_snapshot())
			game_mode.stop_standalone("max_seconds")
		elif NetModeScript.accepts_clients(role):
			game_mode.request_drain("max_seconds")
		else:
			_quit(4)
		_deadline_ms = 0
		return
	if role == "client" and not wait_file.is_empty() and FileAccess.file_exists(wait_file):
		wait_file = ""
		_start_client()


func _setup_net_debug_console() -> void:
	_debug_canvas = CanvasLayer.new()
	_debug_canvas.layer = 20
	add_child(_debug_canvas)
	_debug_panel = PanelContainer.new()
	_debug_panel.position = Vector2(16, 16)
	_debug_panel.custom_minimum_size = Vector2(760, 250)
	_debug_panel.visible = false
	_debug_canvas.add_child(_debug_panel)
	var column := VBoxContainer.new()
	_debug_panel.add_child(column)
	_debug_output = Label.new()
	_debug_output.custom_minimum_size = Vector2(740, 195)
	_debug_output.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_debug_output)
	_debug_input = LineEdit.new()
	_debug_input.placeholder_text = "netprofile | stat net | NetEmulation.PktLag 100 | NetEmulation.Status"
	_debug_input.text_submitted.connect(_submit_net_debug_command)
	column.add_child(_debug_input)
	_append_net_debug_line("~ opens/closes the local network console")


func _input(event: InputEvent) -> void:
	if not _net_debug_enabled or DisplayServer.get_name() == "headless":
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.physical_keycode == KEY_QUOTELEFT:
		_set_net_debug_console_visible(not _debug_panel.visible)
		get_viewport().set_input_as_handled()
	elif _debug_panel.visible and event.keycode == KEY_ESCAPE:
		_set_net_debug_console_visible(false)
		get_viewport().set_input_as_handled()


func _set_net_debug_console_visible(visible: bool) -> void:
	_debug_panel.visible = visible
	if visible:
		_debug_input.grab_focus()
	else:
		_debug_input.release_focus()


func _gameplay_input_vector() -> Vector2:
	if _debug_panel != null and _debug_panel.visible and _debug_input.has_focus():
		return Vector2.ZERO
	return Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")


func _submit_net_debug_command(command: String) -> void:
	var text := command.strip_edges()
	_debug_input.clear()
	if text.is_empty():
		return
	_append_net_debug_line("> " + text)
	if text.to_lower() == "netprofile" or text.to_lower() == "stat net":
		_append_net_debug_line(net_profiler.handle_command(text))
		return
	if text.to_lower().begins_with("netemulation."):
		if args.has("net-debug-proxy"):
			event_log.emit("net_debug_command", {"command": text})
			_append_net_debug_line("sent to local runner; waiting for reply")
		else:
			_append_net_debug_line(net_profiler.handle_command(text))
		return
	_append_net_debug_line("unknown command (try netprofile or NetEmulation.Status)")


func _append_net_debug_line(text: String) -> void:
	if _debug_output == null:
		return
	for line in text.split("\n"):
		_debug_lines.append(line)
	while _debug_lines.size() > 14:
		_debug_lines.remove_at(0)
	_debug_output.text = "\n".join(_debug_lines)


func _poll_net_debug_reply() -> void:
	if _net_debug_reply_path.is_empty() or Time.get_ticks_msec() < _next_net_debug_reply_poll_ms:
		return
	_next_net_debug_reply_poll_ms = Time.get_ticks_msec() + 100
	if not FileAccess.file_exists(_net_debug_reply_path):
		return
	var reply: Variant = JSON.parse_string(FileAccess.get_file_as_string(_net_debug_reply_path))
	if not reply is Dictionary:
		return
	var seq := int(reply.get("seq", 0))
	if seq <= _net_debug_reply_seq:
		return
	_net_debug_reply_seq = seq
	_append_net_debug_line(String(reply.get("message", "")))


func _physics_process(_dt: float) -> void:
	if role == "standalone" and _local_root != null and not leaving:
		var ctrl: NetPlayerControllerScript = _local_root.get_node("Controller")
		ctrl.last_move = _bot_move(world.game_state.play_tick) if _bot_client else _gameplay_input_vector()
		if world.game_state.phase == NetGameStateScript.PHASE_PLAY and ctrl.last_move != Vector2.ZERO:
			_standalone_inputs += 1
		if not _standalone_progress_reported and world.game_state.play_tick >= 10:
			_standalone_progress_reported = true
			event_log.emit("standalone_progress", _standalone_snapshot())
		return
	if role != "client" or not connected or leaving:
		return
	var gs: NetGameStateScript = world.game_state
	if my_root == null:
		# Ready barrier: GameState 첫 복제(world_key)와 내 Pawn 스폰이 모두 도착해야 조작을 시작한다.
		# (스폰 패킷이 정적 GameState Sync보다 먼저 올 수 있다.)
		if gs.world_key.is_empty():
			return
		my_root = world.find_player_by_peer(multiplayer.get_unique_id())
		if my_root != null:
			var my_ps: NetPlayerStateScript = my_root.get_node("PlayerState")
			var my_ctrl: NetPlayerControllerScript = my_root.get_node("Controller")
			var my_pawn: NetPawnScript = my_root.get_node("Pawn")
			my_ctrl.owner_peer_id = my_ps.peer_id
			my_ctrl.owner_epoch = my_ps.owner_epoch
			event_log.emit("possessed", {
				"slot": my_ps.slot,
				"ownerEpoch": my_ps.owner_epoch,
				"netId": [my_pawn.net_index, my_pawn.net_generation],
				"visiblePlayers": world.players.get_child_count(),
				"phase": gs.phase, "playTick": gs.play_tick, "worldKey": gs.world_key,
			})
		return
	if gs.phase == NetGameStateScript.PHASE_PLAY:
		if first_play_tick < 0:
			first_play_tick = gs.play_tick
		var ps_cur: NetPlayerStateScript = my_root.get_node("PlayerState")
		var ctrl: NetPlayerControllerScript = my_root.get_node("Controller")
		ctrl.owner_peer_id = ps_cur.peer_id
		ctrl.owner_epoch = ps_cur.owner_epoch
		if stale_epoch_probe and ps_cur.owner_epoch > 1 and stale_epoch_sent < 2:
			ctrl.send_server_submit_input(ctrl.next_seq + 1, Vector2.LEFT, ps_cur.owner_epoch - 1)
			stale_epoch_sent += 1
			event_log.emit("stale_epoch_rpc_sent", {"sentEpoch": ps_cur.owner_epoch - 1, "currentEpoch": ps_cur.owner_epoch, "n": stale_epoch_sent})
		var move := _bot_move(gs.play_tick) if _bot_client else _gameplay_input_vector()
		ctrl.client_send_input(move)
		inputs_sent += 1
		if disconnect_after_ticks > 0 and inputs_sent >= disconnect_after_ticks:
			var my_pawn_drop: NetPawnScript = my_root.get_node("Pawn")
			event_log.emit("client_simulated_drop", {
				"inputsSent": inputs_sent,
				"ownerEpoch": ps_cur.owner_epoch,
				"pos": [snappedf(my_pawn_drop.position.x, 0.001), snappedf(my_pawn_drop.position.y, 0.001)],
				"health": my_pawn_drop.health,
			})
			_quit(0)
			return
		if bot == "b" and gs.play_tick >= 20 and illegal_sent < 3:
			_try_illegal_rpc()
	elif gs.phase == NetGameStateScript.PHASE_DRAINING and not snapshot_done:
		snapshot_done = true
		var snap := world.snapshot()
		snap["myPeer"] = multiplayer.get_unique_id()
		event_log.emit("client_snapshot", snap)
		leave_at_ms = Time.get_ticks_msec() + int(float(args.get("linger", "3")) * 1000.0)
	if leave_at_ms > 0 and Time.get_ticks_msec() >= leave_at_ms:
		if leave_file.is_empty() or FileAccess.file_exists(leave_file):
			_leave("drain")


func _bot_move(t: int) -> Vector2:
	match bot:
		"a":
			if t < 45:
				return Vector2.RIGHT
			if t < 75:
				return Vector2.DOWN
		"b":
			if t < 60:
				return Vector2.RIGHT
			if t < 90:
				return Vector2.ZERO
			if t < 120:
				return Vector2.LEFT
		"c":
			if t - first_play_tick < 20:
				return Vector2.UP
	return Vector2.ZERO


func _standalone_snapshot() -> Dictionary:
	return {
		"netMode": role,
		"network": false,
		"serverTick": world.game_state.server_tick if world != null else 0,
		"playTick": world.game_state.play_tick if world != null else 0,
		"inputs": _standalone_inputs,
		"world": world.snapshot() if world != null else {},
	}


## 다른 플레이어(slot 0)의 Controller에 owner RPC를 위조 전송한다. 서버는 거부해야 한다.
func _try_illegal_rpc() -> void:
	var victim := world.find_player_by_slot(0)
	if victim == null or victim == my_root:
		return
	var ctrl: NetPlayerControllerScript = victim.get_node("Controller")
	ctrl.send_server_submit_input(1000000 + illegal_sent, Vector2.LEFT)
	illegal_sent += 1
	event_log.emit("illegal_rpc_sent", {"target": String(ctrl.get_path()), "n": illegal_sent})


func _leave(reason: String) -> void:
	if leaving:
		return
	leaving = true
	var ctrl: NetPlayerControllerScript = my_root.get_node("Controller") if my_root != null else null
	var stats := {}
	var enet := smp.multiplayer_peer as ENetMultiplayerPeer
	if net_profiler != null:
		var profile: Dictionary = net_profiler.capture_snapshot("client_leaving")
		var profile_enet: Dictionary = profile.get("enet", {})
		var sent_bytes: Dictionary = profile_enet.get("sentBytes", {})
		var received_bytes: Dictionary = profile_enet.get("receivedBytes", {})
		var sent_packets: Dictionary = profile_enet.get("sentPackets", {})
		var received_packets: Dictionary = profile_enet.get("receivedPackets", {})
		stats = {
			"sentBytes": int(sent_bytes.get("total", 0)),
			"recvBytes": int(received_bytes.get("total", 0)),
			"sentPackets": int(sent_packets.get("total", 0)),
			"recvPackets": int(received_packets.get("total", 0)),
		}
	event_log.emit("client_leaving", {
		"reason": reason, "inputsSent": inputs_sent,
		"acksReceived": ctrl.acks_received if ctrl != null else 0,
		"ackedSeq": ctrl.acked_seq if ctrl != null else 0,
		"enet": stats,
	})
	if smp.multiplayer_peer != null and not (smp.multiplayer_peer is OfflineMultiplayerPeer):
		smp.multiplayer_peer.disconnect_peer(1)
	get_tree().create_timer(1.5).timeout.connect(func() -> void: _quit(0))


func _quit(code: int) -> void:
	if _quitting:
		return
	_quitting = true
	if smp.multiplayer_peer != null:
		smp.multiplayer_peer.close()
	event_log.emit("client_exit", {"code": code})
	get_tree().quit(code)
