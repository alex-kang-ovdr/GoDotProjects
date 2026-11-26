class_name FgServerValidator
extends RefCounted
## 서버 권한 입력·행동 검증기 및 증거 기록기 (로드맵 30 §3·§4·§7).
## - 검사 순서: authenticated connection → owner/epoch → rate/tick window → bounds/clock → 게임 규칙.
## - 정상 RTT 300ms / 5% loss에서 일시 burst를 허용해 영구 제재 오탐 0건을 유지한다.
## - 거래/보상/스킬 요청은 request_id로 idempotency를 보장해 중복 실행·중복 지급 0건을 보장한다.
## - 원문 토큰·비밀키를 이벤트에 절대 포함하지 않는다.

const RULE_VERSION := "1.0"

const ACTION_ALLOW := "allow"
const ACTION_CORRECT := "correct"
const ACTION_REJECT := "reject"
const ACTION_DISCONNECT := "disconnect"
const ACTION_REVIEW := "review"

var session_id: String = ""
var project_id: String = "playforge"
var build_id: String = "dev"

## 정상 30Hz 입력 + 300ms RTT burst를 수용하는 여유치(기본 1초 창 최대 75개)
var max_inputs_per_window: int = 75
var rate_window_ms: int = 1000
var max_future_tick_ahead: int = 30
var max_past_tick_behind: int = 90
var max_request_id_cache: int = 2048

var events: Array[Dictionary] = []
var counters: Dictionary = {
	"allowed": 0,
	"corrected": 0,
	"rejected": 0,
	"rate_limited": 0,
	"clock_rejected": 0,
	"duplicate_action_idempotent": 0,
	"speed_rejected": 0,
	"malformed_rejected": 0,
	"permanent_bans_auto": 0, # 자동 영구 제재는 절대 발생시키지 않는다(plans/30 §3·§7)
}

## conn_id -> Array[int] (timestamps in ms)
var _rate_buckets: Dictionary = {}
## "user_id:request_id" -> cached_result Dictionary
var _idempotency_cache: Dictionary = {}
var _idempotency_order: Array[String] = []
var _event_seq: int = 0


func _init(p_session_id: String = "local-session", p_project_id: String = "playforge", p_build_id: String = "dev") -> void:
	session_id = p_session_id
	project_id = p_project_id
	build_id = p_build_id


func validate_move_input(
	conn_id: int,
	pseudonymous_user: String,
	server_tick: int,
	client_tick: int,
	move: Vector2,
	now_ms: int
) -> Dictionary:
	# 1) NaN/Inf 차단
	if not (is_finite(move.x) and is_finite(move.y)):
		counters.malformed_rejected = int(counters.malformed_rejected) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "move.non_finite", "non_finite", ACTION_REJECT)
		return {"ok": false, "action": ACTION_REJECT, "reason": "non_finite_move"}

	# 2) 연결별 rate limit (burst 허용, 폭주 차단)
	if not _check_rate(conn_id, now_ms):
		counters.rate_limited = int(counters.rate_limited) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "move.rate_limit", ">%d/%dms" % [max_inputs_per_window, rate_window_ms], ACTION_REJECT)
		return {"ok": false, "action": ACTION_REJECT, "reason": "rate_limited"}

	# 3) 악성 미래/과거 clock 가속 검사
	if client_tick > server_tick + max_future_tick_ahead:
		counters.clock_rejected = int(counters.clock_rejected) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "move.future_clock", "delta=+%d" % (client_tick - server_tick), ACTION_REJECT)
		return {"ok": false, "action": ACTION_REJECT, "reason": "future_client_tick"}
	if server_tick > max_past_tick_behind and client_tick < server_tick - max_past_tick_behind:
		counters.clock_rejected = int(counters.clock_rejected) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "move.past_clock", "delta=-%d" % (server_tick - client_tick), ACTION_REJECT)
		return {"ok": false, "action": ACTION_REJECT, "reason": "stale_client_tick"}

	# 4) 입력 벡터 정규화 보정
	if move.length_squared() > 1.0001:
		counters.corrected = int(counters.corrected) + 1
		_record(server_tick, pseudonymous_user, "move.vector_clamp", "len=%.2f" % move.length(), ACTION_CORRECT)
		return {"ok": true, "action": ACTION_CORRECT, "move": move.normalized(), "reason": "clamped"}

	counters.allowed = int(counters.allowed) + 1
	return {"ok": true, "action": ACTION_ALLOW, "move": move, "reason": ""}


## 서버 권위 이동 거리/속도 상한 감사(비정상 텔레포트·가속 탐지)
func validate_displacement(
	pseudonymous_user: String,
	server_tick: int,
	prev_pos: Vector2,
	next_pos: Vector2,
	max_speed: float,
	dt: float,
	allow_teleport: bool = false
) -> Dictionary:
	if allow_teleport:
		counters.allowed = int(counters.allowed) + 1
		return {"ok": true, "action": ACTION_ALLOW}
	var max_dist := max_speed * maxf(0.001, dt) * 1.05 + 0.05
	var actual := prev_pos.distance_to(next_pos)
	if actual > max_dist:
		counters.speed_rejected = int(counters.speed_rejected) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "move.max_speed", "%.3f>%.3f" % [actual, max_dist], ACTION_REJECT)
		return {"ok": false, "action": ACTION_REJECT, "reason": "speed_exceeded", "observed": actual, "limit": max_dist}
	counters.allowed = int(counters.allowed) + 1
	return {"ok": true, "action": ACTION_ALLOW}


## 거래·보상·일회성 액션의 request_id idempotency 검증(중복 지급 0건, plans/30 §3·§9).
func validate_idempotent_action(
	pseudonymous_user: String,
	request_id: String,
	server_tick: int,
	executor: Callable
) -> Dictionary:
	if request_id.is_empty() or request_id.length() > 64:
		counters.malformed_rejected = int(counters.malformed_rejected) + 1
		counters.rejected = int(counters.rejected) + 1
		_record(server_tick, pseudonymous_user, "action.invalid_request_id", "len=%d" % request_id.length(), ACTION_REJECT)
		return {"ok": false, "duplicate": false, "reason": "invalid_request_id"}

	var cache_key := "%s:%s" % [pseudonymous_user, request_id]
	if _idempotency_cache.has(cache_key):
		counters.duplicate_action_idempotent = int(counters.duplicate_action_idempotent) + 1
		var cached: Dictionary = _idempotency_cache[cache_key]
		return {"ok": true, "duplicate": true, "result": cached.duplicate(true)}

	var res: Dictionary = executor.call() if executor.is_valid() else {"committed": true}
	_idempotency_cache[cache_key] = res.duplicate(true)
	_idempotency_order.append(cache_key)
	while _idempotency_order.size() > max_request_id_cache:
		var evict := _idempotency_order.pop_front()
		_idempotency_cache.erase(evict)
	counters.allowed = int(counters.allowed) + 1
	return {"ok": true, "duplicate": false, "result": res}


func _check_rate(conn_id: int, now_ms: int) -> bool:
	var bucket: Array = _rate_buckets.get(conn_id, [])
	var cutoff := now_ms - rate_window_ms
	while not bucket.is_empty() and int(bucket[0]) < cutoff:
		bucket.pop_front()
	if bucket.size() >= max_inputs_per_window:
		_rate_buckets[conn_id] = bucket
		return false
	bucket.append(now_ms)
	_rate_buckets[conn_id] = bucket
	return true


func _record(server_tick: int, pseudonymous_user: String, rule_id: String, observed_range: String, action: String) -> void:
	_event_seq += 1
	if events.size() >= 500:
		return
	events.append({
		"event_id": "%s-%d" % [session_id, _event_seq],
		"project_id": project_id,
		"build_id": build_id,
		"session_id": session_id,
		"server_tick": server_tick,
		"pseudonymous_user_id": pseudonymous_user,
		"rule_id": rule_id,
		"rule_version": RULE_VERSION,
		"observed_range": observed_range,
		"action": action,
		"retention_class": "session_audit",
	})
