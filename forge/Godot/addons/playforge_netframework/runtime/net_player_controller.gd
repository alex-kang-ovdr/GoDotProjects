class_name NetPlayerController
extends Node
## Unreal PlayerController 대응: owner 전용 RPC 채널.
## - client→server: server_submit_input(seq, move) — 서버가 발신자 == owner_peer_id 검증
## - server→owner: client_input_ack(seq) — rpc_id(owner)로 해당 클라이언트에만 전송
## 서버 쪽 검증·적용 상태(guard, last_seq, last_move)는 서버에서만 채워진다.

const NetRpcGuardScript := preload("net_rpc_guard.gd")
const NetProfilerScript := preload("net_profiler.gd")

var owner_peer_id: int = 0
var owner_epoch: int = 1
var net_profiler: NetProfilerScript

# 서버 전용
var guard: NetRpcGuardScript = null
var last_seq: int = 0
var last_move: Vector2 = Vector2.ZERO
var inputs_applied: int = 0

# owner 클라이언트 전용
var next_seq: int = 0
var acked_seq: int = 0
var acks_received: int = 0


func client_send_input(move: Vector2, epoch_override: int = -1) -> int:
	next_seq += 1
	send_server_submit_input(next_seq, move, owner_epoch if epoch_override < 0 else epoch_override)
	return next_seq


func set_net_profiler(profiler: NetProfilerScript) -> void:
	net_profiler = profiler


## 공통 송신기를 사용해 일반 입력과 부정 요청 시험을 모두 한 번만 계수한다.
func send_server_submit_input(seq: int, move: Vector2, epoch: int = -1) -> Error:
	var sent_epoch := owner_epoch if epoch < 0 else epoch
	var result: Error = multiplayer.rpc(1, self, &"server_submit_input", [seq, move, sent_epoch])
	if result == OK and net_profiler != null:
		net_profiler.record_rpc_sent(&"server_submit_input")
	return result


func send_client_input_ack(seq: int) -> Error:
	var result: Error = multiplayer.rpc(owner_peer_id, self, &"client_input_ack", [seq])
	if result == OK and net_profiler != null:
		net_profiler.record_rpc_sent(&"client_input_ack")
	return result


@rpc("any_peer", "call_remote", "unreliable_ordered")
func server_submit_input(seq: int, move: Vector2, epoch: int = 1) -> void:
	if net_profiler != null:
		net_profiler.record_rpc_received(&"server_submit_input")
	if guard == null:
		return
	if not guard.check_owner(multiplayer, owner_peer_id, "server_submit_input", String(get_path())):
		return
	if not guard.check_owner_epoch(owner_epoch, epoch, "server_submit_input"):
		return
	if not guard.check_seq(last_seq, seq, "server_submit_input"):
		return
	var clean := guard.sanitize_move(move, "server_submit_input")
	if clean == Vector2.INF:
		return
	guard.accept()
	last_seq = seq
	last_move = clean
	inputs_applied += 1


@rpc("authority", "call_remote", "unreliable_ordered")
func client_input_ack(seq: int) -> void:
	if net_profiler != null:
		net_profiler.record_rpc_received(&"client_input_ack")
	acked_seq = maxi(acked_seq, seq)
	acks_received += 1
