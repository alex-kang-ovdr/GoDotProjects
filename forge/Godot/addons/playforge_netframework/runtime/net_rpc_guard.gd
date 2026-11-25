class_name NetRpcGuard
extends RefCounted
## 서버 측 RPC 검증 헬퍼.
## - owner RPC: 발신자 peer id가 대상 객체의 owner와 같아야 한다. 아니면 거부·계수·기록.
## - 입력 순번: seq는 단조 증가해야 한다(재전송·재정렬·재생 공격 차단).
## - 입력 값: NaN/Inf 거부, 크기 1 초과는 정규화(clamp) 후 계수.

const NetEventLogScript := preload("net_event_log.gd")

var counters: Dictionary = {
	"accepted": 0,
	"not_owner": 0,
	"not_server": 0,
	"stale_seq": 0,
	"malformed": 0,
	"clamped": 0,
}
var event_log: NetEventLogScript = null
## 같은 원인의 로그 폭주를 막기 위한 기록 상한.
var max_logged_per_reason: int = 20


func _init(p_log: NetEventLogScript = null) -> void:
	event_log = p_log


## owner 전용 RPC 진입점에서 호출한다. true면 처리 계속.
func check_owner(mp: MultiplayerAPI, owner_peer_id: int, rpc_name: String, target: String) -> bool:
	if not mp.is_server():
		_reject("not_server", {"rpc": rpc_name, "target": target})
		return false
	var sender := mp.get_remote_sender_id()
	if sender != owner_peer_id or sender <= 1:
		_reject("not_owner", {"rpc": rpc_name, "target": target, "sender": sender, "owner": owner_peer_id})
		return false
	return true


func check_seq(last_seq: int, seq: int, rpc_name: String) -> bool:
	if seq <= last_seq:
		_reject("stale_seq", {"rpc": rpc_name, "seq": seq, "last": last_seq})
		return false
	return true


## 유효하지 않으면 Vector2.INF를 돌려준다.
func sanitize_move(move: Vector2, rpc_name: String) -> Vector2:
	if not (is_finite(move.x) and is_finite(move.y)):
		_reject("malformed", {"rpc": rpc_name})
		return Vector2.INF
	if move.length_squared() > 1.0001:
		counters.clamped += 1
		return move.normalized()
	return move


func accept() -> void:
	counters.accepted += 1


func total_rejected() -> int:
	return int(counters.not_owner) + int(counters.not_server) + int(counters.stale_seq) + int(counters.malformed)


func _reject(reason: String, data: Dictionary) -> void:
	counters[reason] = int(counters.get(reason, 0)) + 1
	if event_log != null and int(counters[reason]) <= max_logged_per_reason:
		var rec := {"reason": reason, "count": counters[reason]}
		rec.merge(data, true)
		event_log.emit("rpc_rejected", rec)
