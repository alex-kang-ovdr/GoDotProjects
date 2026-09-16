## 전 플랫폼 공통 물리 튜닝 SSOT.
## 단위: 위치 px, 속도 px/s, 힘은 Godot RigidBody2D force 단위, 각속도 rad/s.
class_name PhysicsTuning
extends RefCounted

# 웹 기준본(game.js)의 dt 독립 감쇠 비율을 Godot 물리 스텝에 그대로 적용한다.
const REFERENCE_TICK_RATE := 60.0
const PLAYER_LINEAR_RETAIN_PER_SECOND := 0.16
const PLAYER_ANGULAR_RETAIN_PER_SECOND := 0.02
const NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND := 0.58

# 엔진 감쇠는 끄고 _integrate_forces에서 위의 지수 감쇠를 한 번만 적용한다.
const ENGINE_LINEAR_DAMP := 0.0
const ENGINE_ANGULAR_DAMP := 0.0
const FORWARD_THROTTLE_MIN := 0.35
const FORWARD_THROTTLE_MAX := 1.65
const NEUTRAL_BRAKE_SPEED := 180.0
const NEUTRAL_ANGULAR_BRAKE_GAIN := 60.0
const MAX_LINEAR_SPEED_BASE := 900.0
const MAX_SPEED_REFERENCE_THRUST_PER_MASS := 400.0
const MAX_LINEAR_SPEED_MIN := 120.0
const MAX_ANGULAR_SPEED := 3.2

# 충돌 형상과 재질은 렌더·밸런스 수치와 분리된 물리 전용 값이다.
const SHIP_COLLIDER_SIZE := Vector2(260.0, 220.0)
const NEUTRAL_PART_COLLIDER_SCALE := 0.82
const ASTEROID_COLLIDER_RADIUS := 23.0
const DYNAMIC_FRICTION := 0.0
const SHIP_ASTEROID_BOUNCE := 0.76
const NEUTRAL_PART_BOUNCE := 0.64

static func retain_factor(per_second: float, delta: float) -> float:
	return pow(clampf(per_second, 0.0, 1.0), maxf(delta, 0.0))

static func apply_reference_damping(state: PhysicsDirectBodyState2D, linear_retain_per_second: float, angular_retain_per_second: float) -> void:
	state.linear_velocity *= retain_factor(linear_retain_per_second, state.step)
	state.angular_velocity *= retain_factor(angular_retain_per_second, state.step)

static func dynamic_material(bounce: float) -> PhysicsMaterial:
	var material := PhysicsMaterial.new()
	material.friction = DYNAMIC_FRICTION
	material.bounce = bounce
	return material
