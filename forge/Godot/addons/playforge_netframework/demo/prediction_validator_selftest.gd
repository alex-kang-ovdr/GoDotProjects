extends SceneTree
## 이동 예측·보정·원격 보간(로드맵 27) 및 서버 입력/행동 Validator(로드맵 30) 자가 시험.
## godot --headless --path forge/Godot --script res://addons/playforge_netframework/demo/prediction_validator_selftest.gd

const FgMovementSimScript := preload("res://addons/playforge_netframework/prediction/fg_movement_sim.gd")
const FgPredictedCharacterScript := preload("res://addons/playforge_netframework/prediction/fg_predicted_character.gd")
const FgRemoteInterpolatorScript := preload("res://addons/playforge_netframework/prediction/fg_remote_interpolator.gd")
const FgServerValidatorScript := preload("res://addons/playforge_netframework/validation/fg_server_validator.gd")

var _failures: Array[String] = []
var _metrics: Dictionary = {}


func _initialize() -> void:
	_test_lan_prediction_accuracy()
	_test_rtt_loss_reconcile_and_smoothing()
	_test_teleport_epoch_and_dash_edge()
	_test_remote_interpolator()
	_test_server_validator()

	var result := {
		"ok": _failures.is_empty(),
		"failures": _failures,
		"metrics": _metrics,
	}
	print("PRED_VALIDATOR_SELFTEST_JSON " + JSON.stringify(result))
	if _failures.is_empty():
		print("PRED_VALIDATOR_SELFTEST_OK")
		quit(0)
	else:
		for f in _failures:
			printerr("PRED_VALIDATOR_SELFTEST_FAIL: " + f)
		quit(1)


func _check(cond: bool, label: String) -> void:
	if not cond:
		_failures.append(label)


func _test_lan_prediction_accuracy() -> void:
	var sim: FgMovementSimScript = FgMovementSimScript.make_default_static_world()
	var dt := 1.0 / 30.0
	var start_pos := Vector2(100, 200)
	var srv_state := FgMovementSimScript.make_state(start_pos)
	var cli := FgPredictedCharacterScript.new(sim, start_pos, dt, 1)

	# 300 ticks(10초) 정적 장애물 충돌 포함 이동 + 대시
	for t in range(1, 301):
		var move := Vector2.RIGHT
		if t > 80 and t <= 160:
			move = Vector2.DOWN
		elif t > 160 and t <= 240:
			move = Vector2(1.0, 0.5).normalized()
		elif t > 240:
			move = Vector2.LEFT
		var edges := FgMovementSimScript.BTN_DASH if (t == 20 or t == 120) else 0
		var cmd := cli.predict_local_input(t, move, edges)
		srv_state = sim.step(srv_state, cmd, dt)
		if t % 3 == 0: # 10Hz snapshot
			var snap := {
				"server_tick": t,
				"acked_input_seq": int(cmd.input_seq),
				"world_epoch": 1,
				"position": srv_state.position,
				"velocity": srv_state.velocity,
				"movement_mode": srv_state.movement_mode,
				"dash_ticks_left": srv_state.dash_ticks_left,
				"dash_cd_ticks": srv_state.dash_cd_ticks,
				"teleport_revision": srv_state.teleport_revision,
			}
			cli.reconcile(snap)
			cli.tick_visual_smoothing(dt)

	var p95 := cli.error_p95()
	_check(p95 <= 0.02 and float(cli.stats.max_sim_error) <= 0.02, "LAN static world error p95 <= 0.02 (got %.5f)" % p95)
	_check(int(cli.stats.corrections) == 0, "LAN zero corrections needed")
	_check((cli.sim_state.position as Vector2).distance_to(srv_state.position) <= 0.001, "LAN final state exact match")
	_metrics["lanErrorP95"] = snappedf(p95, 0.0001)


func _test_rtt_loss_reconcile_and_smoothing() -> void:
	for profile in [
		{"name": "rtt150_loss1", "rttTicks": 5, "loss": 0.01, "seed": 101},
		{"name": "rtt300_loss5", "rttTicks": 9, "loss": 0.05, "seed": 202},
	]:
		var sim: FgMovementSimScript = FgMovementSimScript.make_default_static_world()
		var dt := 1.0 / 30.0
		var start_pos := Vector2(100, 200)
		var srv_state := FgMovementSimScript.make_state(start_pos)
		var cli := FgPredictedCharacterScript.new(sim, start_pos, dt, 1)
		var rng := RandomNumberGenerator.new()
		rng.seed = int(profile.seed)
		var one_way := maxi(1, int(round(float(profile.rttTicks) / 2.0)))
		var loss := float(profile.loss)
		var in_flight_up: Array = []   # [{deliverTick, cmd}]
		var in_flight_down: Array = [] # [{deliverTick, snap}]
		var srv_last_seq := 0
		var srv_last_move := Vector2.ZERO
		var wall_penetrations := 0

		for t in range(1, 361):
			var move := Vector2.RIGHT if t < 120 else (Vector2.DOWN if t < 200 else Vector2.LEFT)
			if t > 300:
				move = Vector2.ZERO # 마지막 60틱 정지 후 수렴 확인
			var cmd := cli.predict_local_input(t, move, 0)
			if rng.randf() >= loss:
				in_flight_up.append({"deliverTick": t + one_way, "cmd": cmd})

			# 서버: 도착 입력 적용(누락 시 중립/이전 입력 제한)
			var applied_cmd := FgMovementSimScript.make_input(srv_last_seq, t, srv_last_move, 0)
			var next_up: Array = []
			for item in in_flight_up:
				if int(item.deliverTick) <= t:
					var c: Dictionary = item.cmd
					if int(c.input_seq) > srv_last_seq:
						srv_last_seq = int(c.input_seq)
						srv_last_move = c.move
						applied_cmd = c
				else:
					next_up.append(item)
			in_flight_up = next_up
			srv_state = sim.step(srv_state, applied_cmd, dt)

			# 10Hz 스냅샷 송신
			if t % 3 == 0:
				var snap := {
					"server_tick": t,
					"acked_input_seq": srv_last_seq,
					"world_epoch": 1,
					"position": srv_state.position,
					"velocity": srv_state.velocity,
					"movement_mode": srv_state.movement_mode,
					"dash_ticks_left": srv_state.dash_ticks_left,
					"dash_cd_ticks": srv_state.dash_cd_ticks,
					"teleport_revision": srv_state.teleport_revision,
				}
				if rng.randf() >= loss or t > 330: # 마지막 구간 정상 스냅샷 도달 보장
					in_flight_down.append({"deliverTick": t + one_way, "snap": snap})

			# 클라이언트: 도착 스냅샷 보정 및 화면 smoothing
			var next_down: Array = []
			for item in in_flight_down:
				if int(item.deliverTick) <= t:
					cli.reconcile(item.snap)
				else:
					next_down.append(item)
			in_flight_down = next_down
			cli.tick_visual_smoothing(dt)

			# 시뮬레이션 위치가 절대 정적 장애물을 관통하지 않는지 검증(plans/27 §3)
			for obs in sim.obstacles:
				if obs.has_point(cli.sim_state.position):
					wall_penetrations += 1

		var final_err := (cli.sim_state.position as Vector2).distance_to(srv_state.position)
		_check(wall_penetrations == 0, "%s zero wall penetrations" % profile.name)
		_check(cli.input_history.size() <= cli.max_history_entries, "%s bounded input history" % profile.name)
		_check(final_err <= 5.0, "%s converged after settle (err=%.3f)" % [profile.name, final_err])
		_metrics[String(profile.name)] = {
			"corrections": int(cli.stats.corrections),
			"hardCorrections": int(cli.stats.hard_corrections),
			"replayedTicks": int(cli.stats.replayed_ticks_total),
			"errorP95": snappedf(cli.error_p95(), 0.001),
			"maxSimError": snappedf(float(cli.stats.max_sim_error), 0.001),
			"maxVisualError": snappedf(float(cli.stats.max_visual_error), 0.001),
			"finalErr": snappedf(final_err, 0.001),
		}


func _test_teleport_epoch_and_dash_edge() -> void:
	var sim: FgMovementSimScript = FgMovementSimScript.make_default_static_world()
	var dt := 1.0 / 30.0
	var cli := FgPredictedCharacterScript.new(sim, Vector2(100, 100), dt, 1)
	for t in range(1, 15):
		cli.predict_local_input(t, Vector2.RIGHT, 0)
	_check(cli.input_history.size() == 14, "history accumulated before teleport")

	# teleport_revision 변경 시 history & visual_offset 즉시 리셋(이전 history 적용 0건)
	var tp_pos := Vector2(650, 650)
	var res_tp := cli.reconcile({
		"server_tick": 15,
		"acked_input_seq": 10,
		"world_epoch": 1,
		"position": tp_pos,
		"velocity": Vector2.ZERO,
		"movement_mode": FgMovementSimScript.MODE_WALK,
		"dash_ticks_left": 0,
		"dash_cd_ticks": 0,
		"teleport_revision": 1,
	})
	_check(String(res_tp.action) == "reset_teleport", "teleport triggered hard reset")
	_check(cli.input_history.is_empty() and cli.visual_offset == Vector2.ZERO, "teleport cleared history and visual_offset")
	_check((cli.sim_state.position as Vector2).distance_to(tp_pos) < 0.001, "teleport snapped sim position")

	# world_epoch 전환 후 과거 epoch 패킷 무시
	for t in range(16, 22):
		cli.predict_local_input(t, Vector2.LEFT, 0)
	var res_ep := cli.reconcile({
		"server_tick": 1,
		"acked_input_seq": 0,
		"world_epoch": 2,
		"position": Vector2(50, 50),
		"velocity": Vector2.ZERO,
		"teleport_revision": 0,
	})
	_check(String(res_ep.action) == "reset_epoch" and cli.input_history.is_empty(), "world_epoch bump reset state")
	var old_ep := cli.reconcile({"server_tick": 999, "acked_input_seq": 999, "world_epoch": 1, "position": Vector2(700, 700)})
	_check(String(old_ep.action) == "ignored_old_epoch", "old world_epoch packet ignored")


func _test_remote_interpolator() -> void:
	var interp := FgRemoteInterpolatorScript.new(30.0, 100.0, 100.0)
	interp.push_snapshot({"server_tick": 30, "world_epoch": 1, "position": Vector2(0, 0), "rotation": 0.0, "velocity": Vector2(100, 0), "teleport_revision": 0}, 1000)
	interp.push_snapshot({"server_tick": 33, "world_epoch": 1, "position": Vector2(10, 0), "rotation": 1.0, "velocity": Vector2(100, 0), "teleport_revision": 0}, 1100)
	interp.push_snapshot({"server_tick": 36, "world_epoch": 1, "position": Vector2(20, 0), "rotation": 2.0, "velocity": Vector2(100, 0), "teleport_revision": 0}, 1200)

	# estimated_server_time = 1.15s, delay = 0.1s -> render_t = 1.05s (tick 30=1.0s과 tick 33=1.1s 정확히 중간, alpha=0.5)
	var mid := interp.sample(1.15)
	_check(mid.valid and String(mid.mode) == "interpolated", "interpolated mode active")
	_check(absf((mid.position as Vector2).x - 5.0) < 0.01 and absf(float(mid.rotation) - 0.5) < 0.01, "position and rotation share exact alpha")

	# 최대 외삽 시간(100ms) 상한 검증: render_t가 latest(1.2s)보다 0.5s 앞서도 0.1s(+10px)에서 정지
	var ext := interp.sample(1.8)
	_check(ext.valid and bool(ext.clamped) and absf((ext.position as Vector2).x - 30.0) < 0.01, "extrapolation clamped at max_extrapolation_ms")

	# teleport_revision 변경 시 ring 리셋 → 워프 지점으로 즉시 스냅
	interp.push_snapshot({"server_tick": 39, "world_epoch": 1, "position": Vector2(500, 500), "rotation": 0.0, "velocity": Vector2.ZERO, "teleport_revision": 1}, 1300)
	var after_tp := interp.sample(1.4)
	_check(after_tp.valid and (after_tp.position as Vector2).distance_to(Vector2(500, 500)) < 0.01 and interp.ring.size() == 1, "remote interpolator reset ring on teleport")


func _test_server_validator() -> void:
	var val := FgServerValidatorScript.new("sess-val", "proj-1", "build-1")
	# 정상 300ms RTT/5% loss burst 시뮬레이션(초당 30~45 입력 burst) → 자동 영구 제재 0건, 정상 허용
	var normal_ok := 0
	var now_ms := 1000
	for tick in range(1, 181):
		now_ms += 33
		var r := val.validate_move_input(2, "user_pseudo_a", tick, tick - 5, Vector2(0.8, 0.6), now_ms)
		if r.ok:
			normal_ok += 1
	_check(normal_ok == 180 and int(val.counters.permanent_bans_auto) == 0, "normal delayed inputs accepted with 0 auto bans")

	# 악성 미래 clock, 과거 clock, NaN, 속도 초과, rate flood 거절
	var fut := val.validate_move_input(3, "user_bad", 100, 200, Vector2.RIGHT, 2000)
	_check(not fut.ok and String(fut.reason) == "future_client_tick", "future client_tick rejected")
	var nan_res := val.validate_move_input(3, "user_bad", 100, 100, Vector2(NAN, 0.0), 2010)
	_check(not nan_res.ok and String(nan_res.reason) == "non_finite_move", "NaN move rejected")
	var spd := val.validate_displacement("user_bad", 100, Vector2(0, 0), Vector2(500, 0), 120.0, 1.0 / 30.0, false)
	_check(not spd.ok and String(spd.reason) == "speed_exceeded", "teleport speed hack rejected")
	var rate_rejected := 0
	for i in 120:
		var rf := val.validate_move_input(99, "user_flood", 100, 100, Vector2.RIGHT, 5000 + i)
		if not rf.ok and String(rf.reason) == "rate_limited":
			rate_rejected += 1
	_check(rate_rejected > 0, "rate flood rejected (%d)" % rate_rejected)

	# 10,000건 중복 거래/보상 요청 → 실제 실행 1회, 중복 지급 0건(plans/30 §9)
	var tx_state := {"committed": 0}
	var dup_count := 0
	for _i in 10000:
		var res := val.validate_idempotent_action("user_a", "trade-tx-001", 100, func() -> Dictionary:
			tx_state["committed"] = int(tx_state["committed"]) + 1
			return {"gold_delta": 50, "tx": "trade-tx-001"}
		)
		if res.ok and bool(res.duplicate):
			dup_count += 1
	var commit_count := int(tx_state["committed"])
	_check(commit_count == 1 and dup_count == 9999, "10,000 duplicate actions committed exactly once")
	_check(int(val.counters.permanent_bans_auto) == 0, "zero auto permanent bans")
	_metrics["validatorDuplicateCommitted"] = commit_count
	_metrics["validatorEvents"] = val.events.size()
	_metrics["validatorAutoBans"] = int(val.counters.permanent_bans_auto)
