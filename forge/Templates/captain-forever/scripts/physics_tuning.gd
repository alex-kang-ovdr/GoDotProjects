## 전 플랫폼 공통 물리 튜닝 SSOT.
## 단위: 위치 px, 속도 px/s, 힘은 Godot RigidBody2D force 단위, 각속도 rad/s.
class_name PhysicsTuning
extends RefCounted

# dt 독립 지수 감쇠. 선형/NPC는 웹 기준, 플레이어 회전은 관성 요청에 맞게 완화.
const REFERENCE_TICK_RATE := 60.0
const PLAYER_LINEAR_RETAIN_PER_SECOND := 0.16
const PLAYER_ANGULAR_RETAIN_PER_SECOND := 0.55
const NPC_ANGULAR_RETAIN_PER_SECOND := 0.02
# 분리 파트는 함선의 기존 운동량을 유지하되, 과도한 반발/회전으로 장난감처럼
# 튀지 않도록 별도의 감쇠와 관성값을 사용한다.
const NEUTRAL_PART_LINEAR_RETAIN_PER_SECOND := 0.90
const NEUTRAL_PART_ANGULAR_RETAIN_PER_SECOND := 0.92
const DEBRIS_INERTIA_MULTIPLIER := 10.0
const DEBRIS_SEPARATION_SPEED := 9.0
const DEBRIS_IMPACT_TRANSFER_SPEED := 7.0
const DEBRIS_MAX_RELATIVE_SPEED := 22.0
const DEBRIS_ANGULAR_VELOCITY_TRANSFER := 0.22
const DEBRIS_MAX_ANGULAR_SPEED := 0.72
# 원본 선체가 사라진 자리에 생성된 직후에는 충돌을 보류한다. 이 유예 동안
# 운동량만 보존해 이동하므로 deep penetration 보정 임펄스가 발생하지 않는다.
const DEBRIS_COLLISION_GRACE_SECONDS := 0.30
const DEBRIS_COLLISION_LAYER := 1
const DEBRIS_COLLISION_MASK := 1
const PROJECTILE_BOX_HIT_PADDING := 12.0

# 엔진 감쇠는 끄고 _integrate_forces에서 위의 지수 감쇠를 한 번만 적용한다.
const ENGINE_LINEAR_DAMP := 0.0
const ENGINE_ANGULAR_DAMP := 0.0
const FORWARD_THROTTLE_MIN := 0.35
const FORWARD_THROTTLE_MAX := 1.65
const NEUTRAL_BRAKE_SPEED := 120.0
const NAVIGATION_ANGULAR_DAMP_GAIN := 0.6
const NAVIGATION_THRUST_ALIGNMENT_RADIANS := 0.65
# 타겟 추적: 실제 장착 추진기의 축/출력 한도 내에서 속도와 정면 자세를 함께 제어한다.
const TRACKING_VELOCITY_GAIN := 2.5
const TRACKING_POSITION_GAIN := 0.8
const TRACKING_CLEARANCE := 24.0
const TRACKING_FACING_GAIN := 9.0
const TRACKING_ANGULAR_DAMP_GAIN := 6.0
const TRACKING_TORQUE_WEIGHT := 4.0
const TRACKING_ALLOCATION_ITERATIONS := 16
const TRACKING_ALLOCATION_REGULARIZATION := 0.001
## 자동 RCS가 최대 출력에 도달하는 각속도(rad/s). 이보다 느리면 각속도에 비례해 출력이 낮아진다.
const NEUTRAL_ANGULAR_BRAKE_FULL_SPEED := 0.35
# 플레이어 자동 역추진의 목표 각감속 = -각속도 * gain. 관성에 따라 필요한 토크를 계산한다.
const NEUTRAL_ANGULAR_DECAY_GAIN := 1.8
const MAX_LINEAR_SPEED_BASE := 900.0
const MAX_SPEED_REFERENCE_THRUST_PER_MASS := 400.0
const MAX_LINEAR_SPEED_MIN := 120.0
const MAX_ANGULAR_SPEED := 3.2

# 충돌 형상과 재질은 렌더·밸런스 수치와 분리된 물리 전용 값이다.
const SHIP_COLLIDER_SIZE := Vector2(260.0, 220.0)
const NEUTRAL_PART_COLLIDER_SCALE := 0.82
const ASTEROID_COLLIDER_RADIUS := 23.0
const DYNAMIC_FRICTION := 0.0
const SHIP_ASTEROID_BOUNCE := 0.42
const NEUTRAL_PART_BOUNCE := 0.08

# Cosmoteer 스타일 물리 고도화 상수 (반동·충격량·배기 간섭·방향성 방어막·유폭·충각)
const WEAPON_RECOIL_IMPULSE := {"laser": 12.0, "machine_gun": 18.0, "railgun": 95.0, "missile": 38.0, "mini_missile": 16.0}
const PROJECTILE_IMPACT_IMPULSE := {"laser": 24.0, "machine_gun": 28.0, "railgun": 165.0, "missile": 110.0, "mini_missile": 52.0}
const EXHAUST_BLOCKED_MULTIPLIER := 0.25
const SHIELD_ARC_HALF_ANGLE := deg_to_rad(68.0) # 136도 전방/방향성 방어막 호
const SHIELD_ARC_RADIUS_OFFSET := 18.0
const RAILGUN_MAX_PENETRATIONS := 3
const VOLATILE_EXPLOSION_DAMAGE := {
	"ammo_bay": 18.0,
	"bullet_bay": 14.0,
	"battery": 16.0,
	"cosmo_power_storage": 28.0,
	"cosmo_storage": 32.0,
	"cosmo_reactor_small": 95.0,
	"cosmo_reactor_med": 160.0,
	"cosmo_reactor_large": 260.0,
}
const REACTOR_EXPLOSION_RADIUS_CELLS := {
	"cosmo_reactor_small": 2.8,
	"cosmo_reactor_med": 3.8,
	"cosmo_reactor_large": 5.2,
}
const RAM_MIN_SPEED := 115.0
const RAM_DAMAGE_PER_SPEED := 0.055
const WEDGE_SELF_DAMAGE_MULT := 0.35
const WEDGE_RAM_DAMAGE_MULT := 1.85

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
