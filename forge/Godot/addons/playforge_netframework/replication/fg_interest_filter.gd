class_name FgInterestFilter
extends RefCounted
## Iris 방식 관심 영역 필터링·우선순위 스케줄링 정책 (로드맵 26 §7).
## - owner/비공개 필터를 최우선으로 적용하며, 필터에서 제외된 비공개 객체는 starvation 방지로 승격하지 않는다.
## - spatial 거리 필터는 enter/exit hysteresis를 두어 경계 왕복 시 ghost/진동을 방지한다.

var spatial_enabled: bool = false
var enter_radius: float = 400.0
var exit_radius: float = 450.0
var max_wait_ticks: int = 60

## conn_id -> Vector2
var viewpoints: Dictionary = {}


func set_viewpoint(conn_id: int, pos: Vector2) -> void:
	viewpoints[conn_id] = pos


func remove_connection(conn_id: int) -> void:
	viewpoints.erase(conn_id)


func is_relevant(conn_id: int, rec: Dictionary, currently_relevant: bool) -> bool:
	var owner_id := int(rec.get("owner_peer_id", 0))
	var vis := String(rec.get("visibility", "relevant"))
	if vis == "owner_only":
		return owner_id == conn_id and conn_id > 0
	if owner_id == conn_id and conn_id > 0:
		return true
	if not spatial_enabled:
		return true
	if not viewpoints.has(conn_id):
		return false
	var vp: Vector2 = viewpoints[conn_id]
	var obj_pos: Vector2 = rec.get("position", Vector2.ZERO)
	var limit := exit_radius if currently_relevant else enter_radius
	return vp.distance_squared_to(obj_pos) <= limit * limit


## 관련성 필터를 통과한 객체에만 우선순위 점수를 계산한다.
func compute_priority(conn_id: int, rec: Dictionary, conn_obj: Dictionary, server_tick: int) -> float:
	var base := float(rec.get("priority", 1.0))
	var owner_bonus := 4.0 if int(rec.get("owner_peer_id", 0)) == conn_id else 1.0
	var last_sent := int(conn_obj.get("last_sent_tick", -1))
	var age := maxi(1, server_tick - last_sent) if last_sent >= 0 else max_wait_ticks
	var wait_factor := 1.0 + (float(age) / float(maxi(1, max_wait_ticks))) * 3.0
	if age >= max_wait_ticks:
		wait_factor += 10.0 # starvation 방지 상한
	var dist_factor := 1.0
	if spatial_enabled and viewpoints.has(conn_id):
		var d := (viewpoints[conn_id] as Vector2).distance_to(rec.get("position", Vector2.ZERO))
		dist_factor = 1.0 / (1.0 + d / maxf(1.0, enter_radius))
	var needs_spawn := 5.0 if int(conn_obj.get("acked_baseline_rev", 0)) == 0 else 1.0
	return base * owner_bonus * wait_factor * dist_factor * needs_spawn
