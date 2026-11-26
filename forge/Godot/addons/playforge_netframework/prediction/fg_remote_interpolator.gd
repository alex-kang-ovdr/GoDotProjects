class_name FgRemoteInterpolator
extends RefCounted
## 원격 객체용 server_tick 정렬 snapshot ring 보간기 (로드맵 27 §5).
## - 위치와 회전을 동일한 기준 시각·동일한 interpolation alpha로 평가한다.
## - Jitter에 따라 보간 지연을 상한 안에서 완만하게 조정한다.
## - max_extrapolation_ms 초과 시 추가 외삽을 중단하고 다음 갱신을 기다린다.
## - teleport_revision 또는 world_epoch 변경 시 ring을 리셋해 순간이동 시 벽 관통 보간을 방지한다.

var tick_hz: float = 30.0
var base_interp_delay_ms: float = 100.0
var max_interp_delay_ms: float = 250.0
var max_extrapolation_ms: float = 100.0
var max_ring_size: int = 32

var world_epoch: int = 1
var current_teleport_revision: int = 0
var adaptive_delay_ms: float = 100.0

## 오름차순 server_tick 정렬 ring: [{server_tick, server_time_s, recv_ms, position, rotation, velocity, teleport_revision}]
var ring: Array[Dictionary] = []
var _last_recv_ms: int = -1
var _last_tick_seen: int = -1
var _jitter_ewma_ms: float = 0.0

var stats: Dictionary = {
	"snapshots_pushed": 0,
	"out_of_order_dropped": 0,
	"resets": 0,
	"extrapolation_clamped": 0,
}


func _init(p_tick_hz: float = 30.0, p_base_delay_ms: float = 100.0, p_max_extrap_ms: float = 100.0) -> void:
	tick_hz = maxf(1.0, p_tick_hz)
	base_interp_delay_ms = p_base_delay_ms
	adaptive_delay_ms = p_base_delay_ms
	max_extrapolation_ms = p_max_extrap_ms


func push_snapshot(snap: Dictionary, recv_ms: int) -> bool:
	var epoch := int(snap.get("world_epoch", world_epoch))
	if epoch < world_epoch:
		stats.out_of_order_dropped = int(stats.out_of_order_dropped) + 1
		return false
	if epoch > world_epoch:
		world_epoch = epoch
		ring.clear()
		_last_tick_seen = -1
		stats.resets = int(stats.resets) + 1

	var t_rev := int(snap.get("teleport_revision", 0))
	if t_rev != current_teleport_revision:
		current_teleport_revision = t_rev
		ring.clear()
		_last_tick_seen = -1
		stats.resets = int(stats.resets) + 1

	var stick := int(snap.get("server_tick", 0))
	if _last_tick_seen >= 0 and stick < _last_tick_seen:
		# 과거 스냅샷은 ring에 삽입하되 가장 최신 tick을 되돌리지 않는다; 너무 오래된 것은 버린다.
		if not ring.is_empty() and stick < int(ring[0].server_tick):
			stats.out_of_order_dropped = int(stats.out_of_order_dropped) + 1
			return false

	# jitter 추정(도착 간격 vs 서버 tick 간격 편차)
	if _last_recv_ms >= 0 and _last_tick_seen >= 0 and stick > _last_tick_seen:
		var expected_dt_ms := float(stick - _last_tick_seen) * (1000.0 / tick_hz)
		var actual_dt_ms := float(recv_ms - _last_recv_ms)
		var jitter := absf(actual_dt_ms - expected_dt_ms)
		_jitter_ewma_ms = lerpf(_jitter_ewma_ms, jitter, 0.2)
		adaptive_delay_ms = clampf(base_interp_delay_ms + _jitter_ewma_ms * 1.5, base_interp_delay_ms, max_interp_delay_ms)

	if stick > _last_tick_seen:
		_last_tick_seen = stick
		_last_recv_ms = recv_ms

	var entry := {
		"server_tick": stick,
		"server_time_s": float(stick) / tick_hz,
		"recv_ms": recv_ms,
		"position": snap.get("position", Vector2.ZERO),
		"rotation": float(snap.get("rotation", 0.0)),
		"velocity": snap.get("velocity", Vector2.ZERO),
		"teleport_revision": t_rev,
	}

	# server_tick 순 삽입(중복 tick 교체)
	var inserted := false
	for i in ring.size():
		if int(ring[i].server_tick) == stick:
			ring[i] = entry
			inserted = true
			break
		if int(ring[i].server_tick) > stick:
			ring.insert(i, entry)
			inserted = true
			break
	if not inserted:
		ring.append(entry)
	while ring.size() > max_ring_size:
		ring.pop_front()
	stats.snapshots_pushed = int(stats.snapshots_pushed) + 1
	return true


## estimated_server_time_s 기준으로 보간 지연(adaptive_delay_ms)을 뺀 render_time에서 위치·회전을 평가한다.
func sample(estimated_server_time_s: float) -> Dictionary:
	if ring.is_empty():
		return {"valid": false, "position": Vector2.ZERO, "rotation": 0.0, "mode": "empty"}
	if ring.size() == 1:
		return {
			"valid": true,
			"position": ring[0].position,
			"rotation": float(ring[0].rotation),
			"mode": "single",
		}

	var render_t := estimated_server_time_s - (adaptive_delay_ms / 1000.0)

	# 가장 오래된 스냅샷 이전이면 첫 스냅샷 고정
	if render_t <= float(ring[0].server_time_s):
		return {
			"valid": true,
			"position": ring[0].position,
			"rotation": float(ring[0].rotation),
			"mode": "clamped_past",
		}

	# 두 스냅샷 사이 보간(위치·회전 동일 alpha)
	for i in range(ring.size() - 1):
		var a: Dictionary = ring[i]
		var b: Dictionary = ring[i + 1]
		var ta := float(a.server_time_s)
		var tb := float(b.server_time_s)
		if render_t >= ta and render_t <= tb:
			var span := maxf(0.0001, tb - ta)
			var alpha := clampf((render_t - ta) / span, 0.0, 1.0)
			return {
				"valid": true,
				"position": (a.position as Vector2).lerp(b.position as Vector2, alpha),
				"rotation": lerp_angle(float(a.rotation), float(b.rotation), alpha),
				"alpha": alpha,
				"mode": "interpolated",
			}

	# 최신 스냅샷 이후: 제한 외삽(max_extrapolation_ms 상한 후 정지)
	var latest: Dictionary = ring[ring.size() - 1]
	var overrun_s := render_t - float(latest.server_time_s)
	var max_extrap_s := max_extrapolation_ms / 1000.0
	var clamped := overrun_s > max_extrap_s
	if clamped:
		stats.extrapolation_clamped = int(stats.extrapolation_clamped) + 1
	var extrap_s := minf(overrun_s, max_extrap_s)
	return {
		"valid": true,
		"position": (latest.position as Vector2) + (latest.velocity as Vector2) * extrap_s,
		"rotation": float(latest.rotation),
		"extrapolatedMs": extrap_s * 1000.0,
		"clamped": clamped,
		"mode": "extrapolated_clamped" if clamped else "extrapolated",
	}
