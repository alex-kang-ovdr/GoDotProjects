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

# 마인크래프트식 규격 복셀 박스의 상단 텍스처 아틀라스. 물리 형상과 분리된 시각 자산이다.
const VOXEL_PART_TEXTURE_ATLAS := "res://assets/parts/voxel_module_atlas_v1.png"
const VOXEL_PART_TEXTURE_GRID := Vector2i(4, 4)
const VOXEL_PART_SIDE_DEPTH := 5.0
const USE_VOXEL_MESH_RENDERER := true
const VOXEL_PART_TEXTURE_TILES := {
	"core": Vector2i(2, 1), "armor": Vector2i(0, 0), "thruster": Vector2i(1, 3),
	"reverse_thruster": Vector2i(3, 1), "rcs_thruster": Vector2i(1, 0), "laser": Vector2i(3, 1),
	"machine_gun": Vector2i(0, 3), "railgun": Vector2i(1, 2), "shield_generator": Vector2i(2, 1),
	"battery": Vector2i(2, 0), "ammo_bay": Vector2i(1, 1), "bullet_bay": Vector2i(1, 1),
	"missile_launcher": Vector2i(1, 1), "mini_missile_launcher": Vector2i(1, 1),
	"beam3": Vector2i(1, 2), "beam4": Vector2i(3, 3), "block": Vector2i(0, 2),
	"wedge": Vector2i(2, 2), "wedge_long": Vector2i(2, 2), "scrap": Vector2i(3, 2),
}

## CSV `grade_color`의 화면용 팔레트. 전투 수치와 독립된 시각 SSOT다.
const PART_GRADE_COLORS := {
	"gray": Color("9aa5b1"),
	"green": Color("6ee7a4"),
	"blue": Color("6fb8ff"),
	"purple": Color("c993ff"),
	"gold": Color("ffd36e"),
}

## 테마별 아틀라스 공통 틴트. 후속 전용 아틀라스가 추가돼도 CSV 분류값은 유지한다.
const PART_THEME_TINTS := {
	"terran_human": Color.WHITE,
	"zerg_biological": Color("d18a9e"),
	"protoss_hitec": Color("a8caff"),
}

## 종족·등급·파트 타입의 텍스처 세트 경로 규약. 알베도와 RGB 마스크는 항상 1:1 쌍이다.
const PART_TEXTURE_ROOT := "res://assets/parts/generated"
const PART_TEXTURE_THEMES := ["terran_human", "zerg_biological", "protoss_hitec"]
const PART_TEXTURE_GRADES := ["common", "uncommon", "rare", "epic", "legendary"]
const PART_TEXTURE_PART_TYPES := [
	"scrap", "core", "armor", "thruster", "reverse_thruster", "rcs_thruster", "battery", "laser",
	"missile_launcher", "mini_missile_launcher", "machine_gun", "railgun", "ammo_bay",
	"bullet_bay", "shield_generator", "block", "beam2", "beam3", "beam4", "plate4",
	"wedge", "wedge_long",
]

static func grade_color(grade_color_id: String) -> Color:
	return PART_GRADE_COLORS.get(grade_color_id, PART_GRADE_COLORS.gray)

static func theme_tint(theme_id: String) -> Color:
	return PART_THEME_TINTS.get(theme_id, Color.WHITE)

static func part_texture_path(part_kind: String, spec: Dictionary, is_mask: bool = false) -> String:
	var theme := str(spec.get("design_theme", "terran_human"))
	var grade := str(spec.get("grade", "common"))
	if not theme in PART_TEXTURE_THEMES:
		theme = "terran_human"
	if not grade in PART_TEXTURE_GRADES:
		grade = "common"
	var suffix := "_masks.png" if is_mask else "_albedo.png"
	return "%s/%s/%s/%s%s" % [PART_TEXTURE_ROOT, theme, grade, part_kind, suffix]

# 함선 격침 후 남는 선체 위치에서 순차적으로 터지는 2차 폭발 연출.
const SHIP_DESTRUCTION_BURST_DURATION := 3.6
const SHIP_DESTRUCTION_BURST_INITIAL_DELAY := 0.18
const SHIP_DESTRUCTION_BURST_INTERVAL := 0.24
const SHIP_DESTRUCTION_BURST_LIFETIME := 0.52
const SHIP_DESTRUCTION_BURST_RADIUS := 34.0
