class_name NetPlayerController
extends Node
## Unreal PlayerController 대응: owner 전용 RPC 채널.
## - client→server: server_submit_input(seq, move) — 서버가 발신자 == owner_peer_id 검증
## - server→owner: client_input_ack(seq) — rpc_id(owner)로 해당 클라이언트에만 전송
## 서버 쪽 검증·적용 상태(guard, last_seq, last_move)는 서버에서만 채워진다.

const NetRpcGuardScript := preload("net_rpc_guard.gd")

var owner_peer_id: int = 0

# 서버 전용
var guard: NetRpcGuardScript = null
var last_seq: int = 0
var last_move: Vector2 = Vector2.ZERO
var inputs_applied: int = 0

# owner 클라이언트 전용
var next_seq: int = 0
var acked_seq: int = 0
var acks_received: int = 0


func client_send_input(move: Vector2) -> int:
	next_seq += 1
	server_submit_input.rpc_id(1, next_seq, move)
	return next_seq


@rpc("any_peer", "call_remote", "unreliable_ordered")
func server_submit_input(seq: int, move: Vector2) -> void:
	if guard == null:
		return
	if not guard.check_owner(multiplayer, owner_peer_id, "server_submit_input", String(get_path())):
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
	acked_seq = maxi(acked_seq, seq)
	acks_received += 1
