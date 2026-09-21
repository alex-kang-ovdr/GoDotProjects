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
const SOCKET_COLOR := Color("ffe082", 0.82)
const SOCKET_VALID_COLOR := Color("8cf0cd", 0.98)
