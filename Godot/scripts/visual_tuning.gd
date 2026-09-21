## 시각 SSOT. 게임 밸런스에 영향을 주는 값은 여기에 두지 않는다.
class_name VisualTuning
extends RefCounted

const SHIELD_LAYER_OPACITY := [0.0, 0.24, 0.38, 0.52, 0.66, 0.80]
const BACKGROUND_STAR_DENSITY := 180
const HULL_OUTLINE_WIDTH := 2.0
const WEAPON_BREAK_SHAKE := 8.0
const STRUCTURE_BREAK_SHAKE := 4.5
const THRUSTER_COLORS := [Color("55f4ff"), Color("b7fbff"), Color("3c8fff")]
const EXHAUST_LENGTH := 25.0
const THRUSTER_FLAME_TEXTURE := "res://assets/effects/thruster_flame.svg"
const THRUSTER_SMOKE_TEXTURE := "res://assets/effects/thruster_smoke.svg"
const THRUSTER_FLAME_AMOUNT := 18
const THRUSTER_SMOKE_AMOUNT := 10
const THRUSTER_NOZZLE_OFFSET := 12.0
## 효과 최소 출력 캡. 해당 모듈의 최대 추진력 대비 이 비율 미만은 표시하지 않는다.
const THRUSTER_EFFECT_MIN_INTENSITY := 0.05
## 최소 캡(5%)부터 최대 출력(100%)까지 5단계를 균등하게 나눈 경계값이다.
const THRUSTER_EFFECT_TIER_CUTOFFS := [0.24, 0.43, 0.62, 0.81]
const THRUSTER_EFFECT_FIRE_AMOUNT := [0, 5, 10, 16, 22, 30]
const THRUSTER_EFFECT_SMOKE_AMOUNT := [0, 3, 6, 10, 14, 18]
const THRUSTER_EFFECT_SPEED_SCALE := [0.0, 0.42, 0.62, 0.80, 1.0, 1.22]
const THRUSTER_EFFECT_SIZE_SCALE := [0.0, 0.42, 0.60, 0.78, 1.0, 1.24]
const THRUSTER_EFFECT_ALPHA := [0.0, 0.42, 0.56, 0.70, 0.86, 1.0]
const SOCKET_COLOR := Color("ffe082", 0.82)
const SOCKET_VALID_COLOR := Color("8cf0cd", 0.98)

# 함선 격침 후 남는 선체 위치에서 순차적으로 터지는 2차 폭발 연출.
const SHIP_DESTRUCTION_BURST_DURATION := 3.6
const SHIP_DESTRUCTION_BURST_INITIAL_DELAY := 0.18
const SHIP_DESTRUCTION_BURST_INTERVAL := 0.24
const SHIP_DESTRUCTION_BURST_LIFETIME := 0.52
const SHIP_DESTRUCTION_BURST_RADIUS := 34.0
