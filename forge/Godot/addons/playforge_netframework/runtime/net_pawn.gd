class_name NetPawn
extends Node2D
## Unreal Pawn 대응: 서버 권한 이동·체력. 클라이언트는 MultiplayerSynchronizer로 받은 값만 표시한다.
## 서버 외 peer에서 server_* 함수를 호출하면 아무 일도 하지 않는다.

@export var move_speed: float = 120.0
@export var max_health: int = 100

## 복제 대상(Sync: Pawn:position, Pawn:health)
var health: int = 100

var net_index: int = -1
var net_generation: int = 0
var arena: Rect2 = Rect2(0, 0, 800, 800)


func net_object_id() -> Dictionary:
	return {"index": net_index, "generation": net_generation}


func server_apply_move(move: Vector2, dt: float) -> void:
	if not multiplayer.is_server():
		return
	position = (position + move * move_speed * dt).clamp(arena.position, arena.end)


func server_apply_damage(amount: int) -> int:
	if not multiplayer.is_server() or amount <= 0:
		return health
	health = maxi(0, health - amount)
	return health
