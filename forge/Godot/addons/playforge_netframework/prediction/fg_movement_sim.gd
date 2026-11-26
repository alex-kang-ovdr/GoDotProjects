class_name FgMovementSim
extends RefCounted
## 서버·클라이언트 공용 정적 월드 고정 tick 이동 시뮬레이션 (로드맵 27 §3·§4).
## - 정적 경계(arena)와 정적 장애물(obstacles: Array[Rect2]) 충돌 해결을 결정적으로 수행한다.
## - button_edges(예: DASH)는 input_seq별로 한 번만 소비해 중복 재전송 시 이중 발동을 차단한다.
## - teleport_revision 변경 시 위치 점프를 명시적으로 구분한다.

const BTN_DASH := 1

const MODE_WALK := 0
const MODE_DASH := 1

var arena: Rect2 = Rect2(0, 0, 800, 800)
var obstacles: Array[Rect2] = []
var body_radius: float = 16.0
var move_speed: float = 120.0
var dash_speed: float = 280.0
var dash_duration_ticks: int = 6
var dash_cooldown_ticks: int = 30


static func make_default_static_world() -> RefCounted:
	var cls: GDScript = load("res://addons/playforge_netframework/prediction/fg_movement_sim.gd")
	var sim = cls.new()
	sim.arena = Rect2(0, 0, 800, 800)
	sim.obstacles.clear()
	sim.obstacles.append(Rect2(240, 160, 48, 180))
	sim.obstacles.append(Rect2(460, 260, 120, 48))
	return sim


static func make_state(pos: Vector2, vel: Vector2 = Vector2.ZERO, mode: int = MODE_WALK, dash_ticks_left: int = 0, dash_cd_ticks: int = 0, teleport_rev: int = 0) -> Dictionary:
	return {
		"position": pos,
		"velocity": vel,
		"movement_mode": mode,
		"dash_ticks_left": dash_ticks_left,
		"dash_cd_ticks": dash_cd_ticks,
		"teleport_revision": teleport_rev,
	}


static func make_input(input_seq: int, client_tick: int, move: Vector2, button_edges: int = 0) -> Dictionary:
	return {
		"input_seq": input_seq,
		"client_tick": client_tick,
		"move": move,
		"button_edges": button_edges,
	}


static func sanitize_move(raw: Vector2) -> Vector2:
	if not (is_finite(raw.x) and is_finite(raw.y)):
		return Vector2.ZERO
	if raw.length_squared() > 1.0001:
		return raw.normalized()
	return raw


## 고정 dt(예: 1/30초) 1스텝 시뮬레이션. 입력 state를 변형하지 않고 새 state Dictionary를 반환한다.
func step(state: Dictionary, cmd: Dictionary, fixed_dt: float) -> Dictionary:
	var pos: Vector2 = state.position
	var mode := int(state.get("movement_mode", MODE_WALK))
	var dash_left := int(state.get("dash_ticks_left", 0))
	var dash_cd := maxi(0, int(state.get("dash_cd_ticks", 0)) - 1)
	var teleport_rev := int(state.get("teleport_revision", 0))
	var move := sanitize_move(cmd.get("move", Vector2.ZERO))
	var edges := int(cmd.get("button_edges", 0))

	var dash_triggered := false
	if (edges & BTN_DASH) != 0 and dash_cd == 0 and dash_left == 0 and move.length_squared() > 0.0001:
		dash_left = dash_duration_ticks
		dash_cd = dash_cooldown_ticks
		mode = MODE_DASH
		dash_triggered = true

	var speed := dash_speed if dash_left > 0 else move_speed
	if dash_left > 0:
		dash_left -= 1
		if dash_left == 0:
			mode = MODE_WALK

	var vel := move * speed
	var next_pos := _move_and_resolve(pos, vel * fixed_dt)
	return {
		"position": next_pos,
		"velocity": vel,
		"movement_mode": mode,
		"dash_ticks_left": dash_left,
		"dash_cd_ticks": dash_cd,
		"teleport_revision": teleport_rev,
		"dash_triggered": dash_triggered,
	}


func _move_and_resolve(pos: Vector2, delta: Vector2) -> Vector2:
	var cur := pos
	# 축 분리 이동 + 정적 AABB 충돌 해결(벽 관통 방지)
	cur.x += delta.x
	cur = _resolve_axis(cur, true)
	cur.y += delta.y
	cur = _resolve_axis(cur, false)
	var min_p := arena.position + Vector2(body_radius, body_radius)
	var max_p := arena.end - Vector2(body_radius, body_radius)
	return cur.clamp(min_p, max_p)


func _resolve_axis(pos: Vector2, is_x: bool) -> Vector2:
	var out := pos
	for rect in obstacles:
		var expanded := rect.grow(body_radius)
		if expanded.has_point(out):
			if is_x:
				var left_pen := absf(out.x - expanded.position.x)
				var right_pen := absf(expanded.end.x - out.x)
				out.x = expanded.position.x if left_pen <= right_pen else expanded.end.x
			else:
				var top_pen := absf(out.y - expanded.position.y)
				var bottom_pen := absf(expanded.end.y - out.y)
				out.y = expanded.position.y if top_pen <= bottom_pen else expanded.end.y
	return out
