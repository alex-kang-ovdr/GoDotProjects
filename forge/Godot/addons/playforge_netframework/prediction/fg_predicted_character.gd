class_name FgPredictedCharacter
extends RefCounted
## Unreal CMC 원칙 대응 로컬 캐릭터 이동 예측·ACK·보정·화면 smoothing (로드맵 27 §3–§5).
## - 충돌·시뮬레이션 위치(sim_state.position)와 화면 보정 오프셋(visual_offset)을 엄격히 분리한다.
## - 서버 AuthoritySnapshot 수신 시 acked_input_seq 대응 예측 상태와 비교해 오차 초과 시 replay한다.
## - world_epoch 또는 teleport_revision 변경 시 이전 history와 smoothing을 즉시 리셋한다.

const FgMovementSimScript := preload("fg_movement_sim.gd")

var sim: FgMovementSimScript
var fixed_dt: float = 1.0 / 30.0
var world_epoch: int = 1
var max_replay_ticks: int = 32
var max_history_entries: int = 64
var position_error_threshold: float = 0.02 # 2 cm (1 unit = 1 m 또는 게임 스케일 기준 설정 가능)
var visual_smoothing_ms: float = 100.0

var sim_state: Dictionary
var visual_offset: Vector2 = Vector2.ZERO
var next_input_seq: int = 0
var last_acked_seq: int = 0
var last_server_tick: int = 0
var _last_acked_predicted_pos: Vector2 = Vector2.INF
var _last_acked_predicted_mode: int = FgMovementSimScript.MODE_WALK

## [{cmd, predicted_state}] — 오름차순 input_seq
var input_history: Array[Dictionary] = []

## 정량 측정 지표
var stats: Dictionary = {
	"inputs_predicted": 0,
	"snapshots_processed": 0,
	"stale_snapshots_ignored": 0,
	"corrections": 0,
	"hard_corrections": 0,
	"replayed_ticks_total": 0,
	"epoch_or_teleport_resets": 0,
	"sim_errors": [],
	"max_sim_error": 0.0,
	"max_visual_error": 0.0,
}


func _init(p_sim: FgMovementSimScript, initial_pos: Vector2, p_fixed_dt: float = 1.0 / 30.0, p_world_epoch: int = 1) -> void:
	sim = p_sim
	fixed_dt = p_fixed_dt
	world_epoch = p_world_epoch
	sim_state = FgMovementSimScript.make_state(initial_pos)


func visual_position() -> Vector2:
	return (sim_state.position as Vector2) + visual_offset


## 매 프레임 화면 보정 오프셋만 감쇠시킨다(sim_state.position은 절대 바꾸지 않는다).
func tick_visual_smoothing(dt: float) -> void:
	if visual_offset.length_squared() < 0.000001:
		visual_offset = Vector2.ZERO
		return
	var tau := maxf(0.001, visual_smoothing_ms / 1000.0)
	var factor := exp(-dt / tau)
	visual_offset *= factor
	if visual_offset.length() < 0.001:
		visual_offset = Vector2.ZERO


## 로컬 입력을 즉시 예측 시뮬레이션하고 history에 기록한다.
func predict_local_input(client_tick: int, move: Vector2, button_edges: int = 0) -> Dictionary:
	next_input_seq += 1
	var cmd := FgMovementSimScript.make_input(next_input_seq, client_tick, move, button_edges)
	sim_state = sim.step(sim_state, cmd, fixed_dt)
	input_history.append({
		"cmd": cmd,
		"predicted_state": sim_state.duplicate(true),
	})
	while input_history.size() > max_history_entries:
		input_history.pop_front()
	stats.inputs_predicted = int(stats.inputs_predicted) + 1
	return cmd


## 서버 AuthoritySnapshot 수신 시 보정·replay를 수행한다.
## authority_snapshot: {server_tick, acked_input_seq, world_epoch, position, velocity, movement_mode, dash_ticks_left, dash_cd_ticks, teleport_revision}
func reconcile(auth: Dictionary) -> Dictionary:
	var snap_epoch := int(auth.get("world_epoch", world_epoch))
	var snap_tick := int(auth.get("server_tick", 0))
	var acked_seq := int(auth.get("acked_input_seq", 0))
	var auth_pos: Vector2 = auth.get("position", sim_state.position)
	var auth_t_rev := int(auth.get("teleport_revision", 0))

	# 구 epoch 패킷 무시, 신규 epoch 전환 시 전체 리셋
	if snap_epoch < world_epoch:
		stats.stale_snapshots_ignored = int(stats.stale_snapshots_ignored) + 1
		return {"action": "ignored_old_epoch"}
	if snap_epoch > world_epoch:
		world_epoch = snap_epoch
		_hard_reset(auth, "world_epoch_changed")
		return {"action": "reset_epoch", "error": 0.0}

	# 과거 server_tick 또는 과거 acked_seq 역순 패킷 무시
	if snap_tick < last_server_tick or acked_seq < last_acked_seq:
		stats.stale_snapshots_ignored = int(stats.stale_snapshots_ignored) + 1
		return {"action": "ignored_stale"}

	stats.snapshots_processed = int(stats.snapshots_processed) + 1
	last_server_tick = snap_tick
	last_acked_seq = acked_seq

	# teleport/respawn revision 변경 시 이전 history와 smoothing을 즉시 폐기(plans/27 §5·§10)
	if auth_t_rev != int(sim_state.get("teleport_revision", 0)):
		_hard_reset(auth, "teleport_revision_changed")
		return {"action": "reset_teleport", "error": 0.0}

	# acked_input_seq에 대응하는 예측 기록 찾기
	var match_idx := -1
	for i in input_history.size():
		var entry: Dictionary = input_history[i]
		if int(entry.cmd.input_seq) == acked_seq:
			match_idx = i
			break

	var prev_visual_pos := visual_position()
	var pos_err := 0.0
	var mode_mismatch := false

	if match_idx >= 0:
		var predicted_at_ack: Dictionary = input_history[match_idx].predicted_state
		pos_err = (predicted_at_ack.position as Vector2).distance_to(auth_pos)
		mode_mismatch = int(predicted_at_ack.get("movement_mode", 0)) != int(auth.get("movement_mode", 0))
		_last_acked_predicted_pos = predicted_at_ack.position
		_last_acked_predicted_mode = int(predicted_at_ack.get("movement_mode", 0))
		_record_error(pos_err)
		# ACK 이전 기록 제거(match_idx 포함)
		var remaining: Array[Dictionary] = []
		for j in range(match_idx + 1, input_history.size()):
			remaining.append(input_history[j])
		input_history = remaining
	elif acked_seq == 0 or (not input_history.is_empty() and acked_seq < int(input_history[0].cmd.input_seq)):
		# 아직 첫 입력이 서버에 도달하지 않았거나(acked_seq==0), 직전 스냅샷과 같은 acked_seq가
		# 반복 도착한 경우: 미확인 history를 지우지 않고 기준 상태와 비교한 뒤 필요 시 replay한다.
		var ref_pos: Vector2 = _last_acked_predicted_pos if _last_acked_predicted_pos != Vector2.INF else sim_state.position
		pos_err = ref_pos.distance_to(auth_pos)
		mode_mismatch = _last_acked_predicted_mode != int(auth.get("movement_mode", 0))
		_record_error(pos_err)
	else:
		# 대응 history가 완전히 유실된 경우 → 안전한 hard correction + history 초기화
		var err_miss := (sim_state.position as Vector2).distance_to(auth_pos)
		_record_error(err_miss)
		_apply_authority_state(auth)
		_last_acked_predicted_pos = auth_pos
		_last_acked_predicted_mode = int(auth.get("movement_mode", 0))
		input_history.clear()
		visual_offset = prev_visual_pos - (sim_state.position as Vector2)
		stats.hard_corrections = int(stats.hard_corrections) + 1
		stats.corrections = int(stats.corrections) + 1
		stats.max_visual_error = maxf(float(stats.max_visual_error), visual_offset.length())
		return {"action": "hard_correction_missing_history", "error": err_miss}

	if pos_err <= position_error_threshold and not mode_mismatch:
		return {"action": "ok", "error": pos_err}

	# 최대 replay 예산 초과 시 안전 hard correction + history 초기화(무한 replay 방지)
	if input_history.size() > max_replay_ticks:
		_apply_authority_state(auth)
		_last_acked_predicted_pos = auth_pos
		_last_acked_predicted_mode = int(auth.get("movement_mode", 0))
		input_history.clear()
		visual_offset = prev_visual_pos - (sim_state.position as Vector2)
		stats.hard_corrections = int(stats.hard_corrections) + 1
		stats.corrections = int(stats.corrections) + 1
		stats.max_visual_error = maxf(float(stats.max_visual_error), visual_offset.length())
		return {"action": "hard_correction_replay_budget", "error": pos_err}

	# 권위 상태로 되돌린 뒤 미확인 입력을 고정 dt로 재생
	_apply_authority_state(auth)
	_last_acked_predicted_pos = auth_pos
	_last_acked_predicted_mode = int(auth.get("movement_mode", 0))
	var replayed := 0
	for entry in input_history:
		sim_state = sim.step(sim_state, entry.cmd, fixed_dt)
		entry.predicted_state = sim_state.duplicate(true)
		replayed += 1
	stats.replayed_ticks_total = int(stats.replayed_ticks_total) + replayed
	stats.corrections = int(stats.corrections) + 1
	# 충돌용 sim_state.position은 그대로 두고 화면 표시 오프셋만 부드럽게 보정
	visual_offset = prev_visual_pos - (sim_state.position as Vector2)
	stats.max_visual_error = maxf(float(stats.max_visual_error), visual_offset.length())
	return {"action": "replayed", "error": pos_err, "replayedTicks": replayed}


func error_p95() -> float:
	var errs: Array = stats.sim_errors
	if errs.is_empty():
		return 0.0
	var s := errs.duplicate()
	s.sort()
	return float(s[clampi(int(ceil(0.95 * s.size())) - 1, 0, s.size() - 1)])


func _apply_authority_state(auth: Dictionary) -> void:
	sim_state = FgMovementSimScript.make_state(
		auth.get("position", Vector2.ZERO),
		auth.get("velocity", Vector2.ZERO),
		int(auth.get("movement_mode", FgMovementSimScript.MODE_WALK)),
		int(auth.get("dash_ticks_left", 0)),
		int(auth.get("dash_cd_ticks", 0)),
		int(auth.get("teleport_revision", 0))
	)


func _hard_reset(auth: Dictionary, _reason: String) -> void:
	_apply_authority_state(auth)
	_last_acked_predicted_pos = auth.get("position", Vector2.ZERO)
	_last_acked_predicted_mode = int(auth.get("movement_mode", FgMovementSimScript.MODE_WALK))
	input_history.clear()
	visual_offset = Vector2.ZERO
	last_server_tick = int(auth.get("server_tick", 0))
	last_acked_seq = int(auth.get("acked_input_seq", 0))
	stats.epoch_or_teleport_resets = int(stats.epoch_or_teleport_resets) + 1


func _record_error(err: float) -> void:
	(stats.sim_errors as Array).append(err)
	if err > float(stats.max_sim_error):
		stats.max_sim_error = err
