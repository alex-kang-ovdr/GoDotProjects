## 시각 SSOT. 게임 밸런스에 영향을 주는 값은 여기에 두지 않는다.
class_name VisualTuning
extends RefCounted

const BACKGROUND_PARALLAX := 0.16

# 기본값은 고도화된 SF 함선 그래픽 모드(true)이며, HUD 버튼/M 키로 모듈 디버그 라벨 모드로 전환할 수 있다.
static var use_textured_design := true
const MODULE_DEBUG_LABELS := {
	"core":"코어", "armor":"장갑", "thruster":"주추진", "reverse_thruster":"역추진",
	"rcs_thruster":"RCS", "battery":"전력", "laser":"레이저", "missile_launcher":"미사일",
	"mini_missile_launcher":"자동어뢰", "machine_gun":"기관총", "railgun":"레일건",
	"ammo_bay":"미사일고", "bullet_bay":"탄약고", "shield_generator":"방어막",
	"block":"블록", "beam2":"빔 2", "beam3":"빔 3", "beam4":"빔 4",
	"plate4":"판 4", "wedge":"삼각", "wedge_long":"긴삼각", "scrap":"잔해"
}

static func module_debug_label(kind: String) -> String:
	return str(MODULE_DEBUG_LABELS.get(kind, kind))

static func module_label_rotation(item: Node2D) -> float:
	return -item.get_global_transform_with_canvas().get_rotation()

const SHIELD_LAYER_OPACITY := [0.0, 0.28, 0.42, 0.56, 0.70, 0.84]
const BACKGROUND_STAR_DENSITY := 260
const HULL_OUTLINE_WIDTH := 2.4
const WEAPON_BREAK_SHAKE := 8.5
const STRUCTURE_BREAK_SHAKE := 4.8
const THRUSTER_COLORS := [Color("55f4ff"), Color("b7fbff"), Color("3c8fff")]
const EXHAUST_LENGTH := 28.0
const THRUSTER_FLAME_TEXTURE := "res://assets/effects/thruster_flame.svg"
const THRUSTER_SMOKE_TEXTURE := "res://assets/effects/thruster_smoke.svg"
const THRUSTER_FLAME_AMOUNT := 22
const THRUSTER_SMOKE_AMOUNT := 12
const THRUSTER_NOZZLE_OFFSET := 13.0
const THRUSTER_EFFECT_MIN_INTENSITY := 0.05
const THRUSTER_EFFECT_TIER_CUTOFFS := [0.24, 0.43, 0.62, 0.81]
const THRUSTER_EFFECT_FIRE_AMOUNT := [0, 6, 12, 18, 25, 34]
const THRUSTER_EFFECT_SMOKE_AMOUNT := [0, 3, 6, 10, 14, 18]
const THRUSTER_EFFECT_SPEED_SCALE := [0.0, 0.45, 0.65, 0.85, 1.05, 1.28]
const THRUSTER_EFFECT_SIZE_SCALE := [0.0, 0.45, 0.65, 0.84, 1.06, 1.30]
const THRUSTER_EFFECT_ALPHA := [0.0, 0.48, 0.62, 0.76, 0.90, 1.0]
const SOCKET_COLOR := Color("ffe082", 0.86)
const SOCKET_VALID_COLOR := Color("62ffd2", 0.98)

# 2.5D 고해상도 벡터 SF 모듈 렌더러를 기본으로 사용한다 (SubViewport 오버헤드 제거 및 포탑/노즐/코어 디테일 강화).
const VOXEL_PART_TEXTURE_ATLAS := ""
const VOXEL_PART_TEXTURE_GRID := Vector2i(4, 4)
const VOXEL_PART_SIDE_DEPTH := 6.0
const USE_VOXEL_MESH_RENDERER := false
const VOXEL_PART_TEXTURE_TILES := {
	"core": Vector2i(2, 1), "armor": Vector2i(0, 0), "thruster": Vector2i(1, 3),
	"reverse_thruster": Vector2i(3, 1), "rcs_thruster": Vector2i(1, 0), "laser": Vector2i(3, 1),
	"machine_gun": Vector2i(0, 3), "railgun": Vector2i(1, 2), "shield_generator": Vector2i(2, 1),
	"battery": Vector2i(2, 0), "ammo_bay": Vector2i(1, 1), "bullet_bay": Vector2i(1, 1),
	"missile_launcher": Vector2i(1, 1), "mini_missile_launcher": Vector2i(1, 1),
	"beam3": Vector2i(1, 2), "beam4": Vector2i(3, 3), "block": Vector2i(0, 2),
	"wedge": Vector2i(2, 2), "wedge_long": Vector2i(2, 2), "scrap": Vector2i(3, 2),
}

const PART_GRADE_COLORS := {
	"gray": Color("9aa5b1"),
	"green": Color("6ee7a4"),
	"blue": Color("6fb8ff"),
	"purple": Color("c993ff"),
	"gold": Color("ffd36e"),
}

const PART_THEME_TINTS := {
	"terran_human": Color.WHITE,
	"zerg_biological": Color("d18a9e"),
	"protoss_hitec": Color("a8caff"),
}

const PART_TEXTURE_ROOT := ""
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

static func part_texture_path(_part_kind: String, _spec: Dictionary, _is_mask: bool = false) -> String:
	return ""

const SHIP_DESTRUCTION_BURST_DURATION := 3.6
const SHIP_DESTRUCTION_BURST_INITIAL_DELAY := 0.16
const SHIP_DESTRUCTION_BURST_INTERVAL := 0.22
const SHIP_DESTRUCTION_BURST_LIFETIME := 0.54
const SHIP_DESTRUCTION_BURST_RADIUS := 38.0
