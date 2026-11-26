class_name NetGameMode
extends Node
## Unreal GameMode 대응: 서버에만 존재하는 규칙 권한자.
## - 입장: SceneMultiplayer 인증 단계에서 JoinTicket을 검증하고 슬롯을 예약한다.
## - 스폰: 인증 완료(peer_connected) 시 PlayerSpawner로 PlayerState/Controller/Pawn을 만든다.
## - 규칙: 고정 tick에서 owner 입력을 Pawn에 적용하고 위험 지역 피해를 계산한다.
## - 수명: waiting → play → settle → draining → 종료. drain 중에는 새 입장을 거부하고
##   기존 플레이어가 모두 나가면(또는 시한 초과 시) 종료한다.
## 서버(peer 1)는 플레이어 슬롯을 차지하지 않는다.

const NetWorldScript := preload("net_world.gd")
const NetGameStateScript := preload("net_game_state.gd")
const NetPlayerControllerScript := preload("net_player_controller.gd")
const NetPlayerStateScript := preload("net_player_state.gd")
const NetPawnScript := preload("net_pawn.gd")
const NetRpcGuardScript := preload("net_rpc_guard.gd")
const NetJoinTicketScript := preload("join_ticket.gd")
const NetEventLogScript := preload("net_event_log.gd")
const NetIdsScript := preload("net_ids.gd")

signal finished(exit_code: int)

# 설정
var max_players: int = 3
var min_players_to_start: int = 2
var play_ticks: int = 150
var settle_max_seconds: float = 10.0
var drain_timeout_seconds: float = 10.0
var idle_shutdown_seconds: float = 90.0
var reconnect_grace_seconds: float = 0.0
var ticket_dir: String = ""
var drain_request_file: String = ""
var settle_request_file: String = ""
var hazard: Rect2 = Rect2(300, 0, 120, 800)
var hazard_damage_per_tick: int = 1
var ack_every_ticks: int = 5

var world: NetWorldScript
var event_log: NetEventLogScript
var tickets: NetJoinTicketScript
var guard: NetRpcGuardScript
var smp: SceneMultiplayer
var object_ids := NetIdsScript.ObjectIdAllocator.new()

var _pending: Dictionary = {}        # peer_id -> claims (인증 통과, 연결 완료 대기)
var _pending_resume: Dictionary = {} # peer_id -> slot (재접속 인증 통과, 연결 완료 대기)
var _disconnected: Dictionary = {}   # slot -> {root, userId, slot, disconnectedAtMs, oldPeer, oldEpoch}
var _slot_owner: Dictionary = {}     # slot -> peer_id (예약 포함; -1이면 유예 중인 슬롯)
var _player_roots: Dictionary = {}   # peer_id -> Node
var _join_rejections: Dictionary = {}
var _phase_started_ms: int = 0
var _drain_reason: String = ""
var _empty_seconds: float = 0.0
var _peak_players: int = 0
var _tick_us: PackedInt32Array = PackedInt32Array()
var _next_external_drain_check_ms: int = 0
var _done: bool = false


func setup(p_world: NetWorldScript, p_log: NetEventLogScript, p_tickets: NetJoinTicketScript, p_smp: SceneMultiplayer) -> void:
	world = p_world
	event_log = p_log
	tickets = p_tickets
	smp = p_smp
	guard = NetRpcGuardScript.new(event_log)
	if tickets != null:
		smp.auth_callback = _on_auth
		smp.peer_authentication_failed.connect(_on_auth_failed)
		smp.peer_connected.connect(_on_peer_connected)
		smp.peer_disconnected.connect(_on_peer_disconnected)
	world.game_state.max_players = max_players
	_phase_started_ms = Time.get_ticks_msec()


func state() -> NetGameStateScript:
	return world.game_state


# ---------------------------------------------------------------- 입장(JoinTicket)

func _on_auth(peer_id: int, data: PackedByteArray) -> void:
	if _pending.has(peer_id) or _player_roots.has(peer_id):
		return
	var reason := ""
	var claims: Dictionary = {}
	var is_resume := false
	if state().phase == NetGameStateScript.PHASE_DRAINING:
		reason = "draining"
	else:
		var res := tickets.verify_and_consume(data.get_string_from_utf8())
		if not res.ok:
			reason = String(res.reason)
		else:
			claims = res.claims
			var slot := int(claims.slot)
			if slot < 0 or slot >= max_players:
				reason = "slot_out_of_range"
			elif _slot_owner.has(slot):
				if _disconnected.has(slot) and int(_slot_owner[slot]) == -1 and String(_disconnected[slot].userId) == String(claims.userId):
					is_resume = true
				else:
					reason = "slot_taken"
	if reason != "":
		_join_rejections[reason] = int(_join_rejections.get(reason, 0)) + 1
		event_log.emit("join_rejected", {"peer": peer_id, "reason": reason, "claims": NetJoinTicketScript.public_claims(claims)})
		smp.send_auth(peer_id, ("rej:" + reason).to_utf8_buffer())
		# 거부 응답이 전달될 시간을 준 뒤 끊는다.
		get_tree().create_timer(0.25).timeout.connect(func() -> void:
			if smp.get_authenticating_peers().has(peer_id):
				smp.disconnect_peer(peer_id))
		return
	_pending[peer_id] = claims
	if is_resume:
		_pending_resume[peer_id] = int(claims.slot)
	_slot_owner[int(claims.slot)] = peer_id
	event_log.emit("join_accepted", {"peer": peer_id, "resume": is_resume, "claims": NetJoinTicketScript.public_claims(claims)})
	smp.send_auth(peer_id, "ok".to_utf8_buffer())
	smp.complete_auth(peer_id)


func _on_auth_failed(peer_id: int) -> void:
	_release_reservation(peer_id)
	event_log.emit("auth_failed", {"peer": peer_id})


func _on_peer_connected(peer_id: int) -> void:
	if not _pending.has(peer_id):
		# 인증 없이 연결되는 경로는 없어야 한다. 방어적으로 끊는다.
		event_log.emit("join_rejected", {"peer": peer_id, "reason": "no_auth"})
		smp.disconnect_peer(peer_id)
		return
	var claims: Dictionary = _pending[peer_id]
	_pending.erase(peer_id)
	if _pending_resume.has(peer_id):
		var slot := int(_pending_resume[peer_id])
		_pending_resume.erase(peer_id)
		if _disconnected.has(slot):
			_reattach_player(peer_id, slot)
			return
	_spawn_player(peer_id, claims)


## Standalone demo path: registers one local player without opening a network peer or JoinTicket.
func add_standalone_player(user_id: String, slot: int) -> Node:
	var peer_id := multiplayer.get_unique_id()
	if not multiplayer.is_server() or not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer) or _player_roots.has(peer_id) or _pending.has(peer_id) or _slot_owner.has(slot) or slot < 0 or slot >= max_players:
		return null
	var root := _spawn_player(peer_id, {"slot": slot, "userId": user_id})
	_slot_owner[slot] = peer_id
	return root


## Ends the standalone-only local peer without waiting for a network disconnect callback.
func stop_standalone(reason: String) -> void:
	if not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer) or _done:
		return
	request_drain(reason)
	_on_peer_disconnected(multiplayer.get_unique_id())


func _spawn_player(peer_id: int, claims: Dictionary) -> Node:
	var slot := int(claims.slot)
	var nid := object_ids.allocate()
	var spawn_pos := Vector2(100, 200 + 200 * slot)
	var root := world.spawner.spawn({
		"slot": slot,
		"user": String(claims.userId),
		"peer": peer_id,
		"x": spawn_pos.x,
		"y": spawn_pos.y,
		"net_index": int(nid.index),
		"net_gen": int(nid.generation),
		"health": 100,
	})
	var ctrl: NetPlayerControllerScript = root.get_node("Controller")
	ctrl.guard = guard
	var pawn: NetPawnScript = root.get_node("Pawn")
	pawn.arena = Rect2(0, 0, 800, 800)
	_player_roots[peer_id] = root
	_refresh_player_peers()
	_peak_players = maxi(_peak_players, _player_roots.size())
	event_log.emit("player_joined", {
		"peer": peer_id, "slot": slot, "user": String(claims.userId),
		"netId": [int(nid.index), int(nid.generation)], "phase": state().phase,
		"players": _player_roots.size(), "playTick": state().play_tick,
	})
	return root


func _reattach_player(peer_id: int, slot: int) -> Node:
	var rec: Dictionary = _disconnected[slot]
	_disconnected.erase(slot)
	var root: Node = rec.root
	var ps: NetPlayerStateScript = root.get_node("PlayerState")
	var ctrl: NetPlayerControllerScript = root.get_node("Controller")
	var pawn: NetPawnScript = root.get_node("Pawn")
	ps.peer_id = peer_id
	ps.owner_epoch += 1
	ctrl.owner_peer_id = peer_id
	ctrl.owner_epoch = ps.owner_epoch
	ctrl.last_seq = 0
	ctrl.last_move = Vector2.ZERO
	_slot_owner[slot] = peer_id
	_player_roots[peer_id] = root
	_refresh_player_peers()
	_peak_players = maxi(_peak_players, _player_roots.size())
	event_log.emit("player_reconnected", {
		"peer": peer_id,
		"oldPeer": int(rec.oldPeer),
		"slot": slot,
		"user": ps.user_id,
		"netId": [pawn.net_index, pawn.net_generation],
		"ownerEpoch": ps.owner_epoch,
		"pos": [snappedf(pawn.position.x, 0.001), snappedf(pawn.position.y, 0.001)],
		"health": pawn.health,
		"phase": state().phase,
		"players": _player_roots.size(),
	})
	return root


func _on_peer_disconnected(peer_id: int) -> void:
	_release_reservation(peer_id)
	if not _player_roots.has(peer_id):
		return
	var root: Node = _player_roots[peer_id]
	var ps: NetPlayerStateScript = root.get_node("PlayerState")
	var ctrl: NetPlayerControllerScript = root.get_node("Controller")
	var pawn: NetPawnScript = root.get_node("Pawn")
	var can_grace := reconnect_grace_seconds > 0.0 \
		and state().phase in [NetGameStateScript.PHASE_WAITING, NetGameStateScript.PHASE_PLAY] \
		and tickets != null \
		and not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer)
	if can_grace:
		ctrl.last_move = Vector2.ZERO
		ctrl.owner_peer_id = 0
		ps.peer_id = 0
		_player_roots.erase(peer_id)
		_slot_owner[ps.slot] = -1
		_disconnected[ps.slot] = {
			"root": root,
			"userId": ps.user_id,
			"slot": ps.slot,
			"disconnectedAtMs": Time.get_ticks_msec(),
			"oldPeer": peer_id,
			"oldEpoch": ps.owner_epoch,
		}
		_refresh_player_peers()
		event_log.emit("player_disconnected_grace", {
			"peer": peer_id,
			"slot": ps.slot,
			"user": ps.user_id,
			"ownerEpoch": ps.owner_epoch,
			"graceSec": reconnect_grace_seconds,
			"pos": [snappedf(pawn.position.x, 0.001), snappedf(pawn.position.y, 0.001)],
			"health": pawn.health,
		})
		if not ticket_dir.is_empty():
			var resume_ticket := tickets.issue(ps.user_id, ps.slot)
			var ticket_path := ticket_dir.path_join("%s-resume.ticket" % ps.user_id)
			var f := FileAccess.open(ticket_path, FileAccess.WRITE)
			if f != null:
				f.store_string(resume_ticket)
				f.close()
				event_log.emit("resume_ticket_issued", {"user": ps.user_id, "slot": ps.slot, "ticketPath": ticket_path})
		return
	object_ids.release(pawn.net_object_id())
	_slot_owner.erase(ps.slot)
	_player_roots.erase(peer_id)
	root.queue_free()
	_refresh_player_peers()
	event_log.emit("player_left", {"peer": peer_id, "slot": ps.slot, "phase": state().phase, "remaining": _player_roots.size()})


func _release_disconnected_slot(slot: int, reason: String) -> void:
	if not _disconnected.has(slot):
		return
	var rec: Dictionary = _disconnected[slot]
	_disconnected.erase(slot)
	var root: Node = rec.root
	var pawn: NetPawnScript = root.get_node("Pawn")
	object_ids.release(pawn.net_object_id())
	if int(_slot_owner.get(slot, -2)) == -1:
		_slot_owner.erase(slot)
	root.queue_free()
	event_log.emit("player_grace_expired", {
		"slot": slot, "user": String(rec.userId), "reason": reason,
		"phase": state().phase, "remaining": _player_roots.size(),
	})


func _release_reservation(peer_id: int) -> void:
	if _pending_resume.has(peer_id):
		var resume_slot := int(_pending_resume[peer_id])
		_pending_resume.erase(peer_id)
		if _disconnected.has(resume_slot) and int(_slot_owner.get(resume_slot, -2)) == peer_id:
			_slot_owner[resume_slot] = -1
	if _pending.has(peer_id):
		var claims: Dictionary = _pending[peer_id]
		_pending.erase(peer_id)
		if int(_slot_owner.get(int(claims.slot), -1)) == peer_id:
			_slot_owner.erase(int(claims.slot))


func _refresh_player_peers() -> void:
	var peers := PackedInt32Array()
	for pid in _player_roots.keys():
		peers.append(int(pid))
	peers.sort()
	state().player_peers = peers


# ---------------------------------------------------------------- tick

func _physics_process(dt: float) -> void:
	if _done:
		return
	var t0 := Time.get_ticks_usec()
	var gs := state()
	gs.server_tick += 1
	match gs.phase:
		NetGameStateScript.PHASE_WAITING:
			if _player_roots.size() >= min_players_to_start:
				_set_phase(NetGameStateScript.PHASE_PLAY)
		NetGameStateScript.PHASE_PLAY:
			_tick_play(dt)
			gs.play_tick += 1
			if play_ticks > 0 and gs.play_tick >= play_ticks:
				if settle_request_file.is_empty() or FileAccess.file_exists(settle_request_file):
					_set_phase(NetGameStateScript.PHASE_SETTLE)
				elif gs.play_tick == play_ticks:
					event_log.emit("play_ticks_elapsed", {"playTick": gs.play_tick})
			elif play_ticks == 0 and tickets != null and Time.get_ticks_msec() >= _next_external_drain_check_ms:
				_next_external_drain_check_ms = Time.get_ticks_msec() + 1000
				if _drain_requested_by_file():
					request_drain("external_signal")
		NetGameStateScript.PHASE_SETTLE:
			if _drain_requested_by_file() or _phase_age_s() >= settle_max_seconds:
				request_drain("match_end" if _drain_reason == "" else _drain_reason)
		NetGameStateScript.PHASE_DRAINING:
			if _player_roots.is_empty() and _pending.is_empty():
				_finish(false)
			elif _phase_age_s() >= drain_timeout_seconds:
				_finish(true)
	if not _disconnected.is_empty():
		var now_ms := Time.get_ticks_msec()
		var expired_slots: Array = []
		for s in _disconnected.keys():
			var rec: Dictionary = _disconnected[s]
			if float(now_ms - int(rec.disconnectedAtMs)) / 1000.0 >= reconnect_grace_seconds:
				expired_slots.append(s)
		for s in expired_slots:
			_release_disconnected_slot(int(s), "grace_timeout")
	if gs.phase == NetGameStateScript.PHASE_WAITING and _player_roots.is_empty() and _pending.is_empty() and _disconnected.is_empty():
		_empty_seconds += dt
		if _empty_seconds >= idle_shutdown_seconds:
			request_drain("idle_empty")
	else:
		_empty_seconds = 0.0
	_tick_us.append(Time.get_ticks_usec() - t0)


func _tick_play(dt: float) -> void:
	var gs := state()
	for pid in _player_roots.keys():
		var root: Node = _player_roots[pid]
		var ctrl: NetPlayerControllerScript = root.get_node("Controller")
		var pawn: NetPawnScript = root.get_node("Pawn")
		var ps: NetPlayerStateScript = root.get_node("PlayerState")
		pawn.server_apply_move(ctrl.last_move, dt)
		ps.acked_input_seq = ctrl.last_seq
		if hazard.has_point(pawn.position) and pawn.health > 0:
			pawn.server_apply_damage(hazard_damage_per_tick)
		if gs.play_tick % ack_every_ticks == 0 and ctrl.last_seq > 0:
			ctrl.send_client_input_ack(ctrl.last_seq)


func _set_phase(phase: String) -> void:
	var gs := state()
	var prev := gs.phase
	gs.phase = phase
	_phase_started_ms = Time.get_ticks_msec()
	if phase != NetGameStateScript.PHASE_PLAY:
		for pid in _player_roots.keys():
			var ctrl: NetPlayerControllerScript = _player_roots[pid].get_node("Controller")
			ctrl.last_move = Vector2.ZERO
	event_log.emit("phase", {"from": prev, "to": phase, "serverTick": gs.server_tick, "playTick": gs.play_tick, "players": _player_roots.size()})


func _phase_age_s() -> float:
	return float(Time.get_ticks_msec() - _phase_started_ms) / 1000.0


func _drain_requested_by_file() -> bool:
	if drain_request_file.is_empty() or not FileAccess.file_exists(drain_request_file):
		return false
	_drain_reason = "external_signal"
	return true


# ---------------------------------------------------------------- drain/종료

## SIGTERM·창 닫기 요청·외부 신호 파일·매치 종료 모두 여기로 모인다.
func request_drain(reason: String) -> void:
	if state().phase == NetGameStateScript.PHASE_DRAINING or _done:
		return
	_drain_reason = reason
	for s in _disconnected.keys().duplicate():
		_release_disconnected_slot(int(s), "drain")
	event_log.emit("server_snapshot", world.snapshot())
	_set_phase(NetGameStateScript.PHASE_DRAINING)
	event_log.emit("drain_started", {"reason": reason, "players": _player_roots.size()})


func _finish(forced: bool) -> void:
	_done = true
	event_log.emit("drain_complete", {"forced": forced, "remaining": _player_roots.size(), "reason": _drain_reason})
	event_log.emit("server_metrics", metrics())
	finished.emit(3 if forced else 0)


func metrics() -> Dictionary:
	var sorted := _tick_us.duplicate()
	sorted.sort()
	var bytes := {}
	var profile_snapshot: Dictionary = {}
	if world != null and world.net_profiler != null:
		profile_snapshot = world.net_profiler.capture_snapshot("server_final")
		var enet_metrics: Dictionary = profile_snapshot.get("enet", {})
		var sent_bytes: Dictionary = enet_metrics.get("sentBytes", {})
		var received_bytes: Dictionary = enet_metrics.get("receivedBytes", {})
		var sent_packets: Dictionary = enet_metrics.get("sentPackets", {})
		var received_packets: Dictionary = enet_metrics.get("receivedPackets", {})
		bytes = {
			"sentBytes": int(sent_bytes.get("total", 0)),
			"recvBytes": int(received_bytes.get("total", 0)),
			"sentPackets": int(sent_packets.get("total", 0)),
			"recvPackets": int(received_packets.get("total", 0)),
		}
	return {
		"ticks": sorted.size(),
		"tickHz": Engine.physics_ticks_per_second,
		"tickUs": {
			"p50": _pct(sorted, 0.50), "p95": _pct(sorted, 0.95), "p99": _pct(sorted, 0.99),
			"max": sorted[sorted.size() - 1] if sorted.size() > 0 else 0,
		},
		"rpc": guard.counters,
		"tickets": {"issued": tickets.issued_count, "accepted": tickets.accepted_count, "rejected": tickets.rejected} if tickets != null else {},
		"joinRejected": _join_rejections,
		"peakPlayers": _peak_players,
		"enet": bytes,
		"netProfile": profile_snapshot,
	}


static func _pct(sorted: PackedInt32Array, q: float) -> int:
	if sorted.is_empty():
		return 0
	return sorted[clampi(int(ceil(q * sorted.size())) - 1, 0, sorted.size() - 1)]
