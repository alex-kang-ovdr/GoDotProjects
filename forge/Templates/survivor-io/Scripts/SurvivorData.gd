extends RefCounted
## Data definitions for TangTang Commando (Survivor.io) Godot 4.7 port.

const CHAPTERS := [
	{
		"id": 0,
		"name": "도시 외곽",
		"boss": "철갑 돌격대장",
		"mult": 1.0,
		"desc": "돌진 경로를 벗어나고 충격파를 대시로 통과하세요.",
		"ground": [Color("284d4b"), Color("233f4b"), Color("1c3544")],
		"accent": Color("426c58"),
	},
	{
		"id": 1,
		"name": "사막 폐허",
		"boss": "사막 포격사령관",
		"mult": 1.18,
		"desc": "포격 표식을 피하고 소환된 호위대를 정리하세요.",
		"ground": [Color("79664b"), Color("6e5a43"), Color("62503c")],
		"accent": Color("a28b61"),
	},
	{
		"id": 2,
		"name": "빙결 연구소",
		"boss": "프로스트 센티널",
		"mult": 1.35,
		"desc": "고정된 레이저 경로와 빙결 탄막을 회피하세요.",
		"ground": [Color("35586c"), Color("31516b"), Color("263f58")],
		"accent": Color("75b2c5"),
	},
]

const HEROES := {
	"assault": {
		"id": "assault",
		"name": "선봉대원",
		"tag": "ATK",
		"skill": "충격파",
		"cooldown": 18.0,
		"color": Color("37bea1"),
		"accent": Color("294e72"),
		"desc": "반경 180 충격파 · 탄환 제거 · 0.8초 무적",
	},
	"engineer": {
		"id": "engineer",
		"name": "공병",
		"tag": "ENG",
		"skill": "자동 포탑",
		"cooldown": 24.0,
		"color": Color("f2b65e"),
		"accent": Color("a16e3b"),
		"desc": "10초간 포탑 설치 · 사거리 420 자동 사격",
	},
	"medic": {
		"id": "medic",
		"name": "구조대원",
		"tag": "MED",
		"skill": "회복장",
		"cooldown": 22.0,
		"color": Color("69c3e1"),
		"accent": Color("dce8df"),
		"desc": "반경 135 회복장 6초 · 초당 최대 체력 5% 회복",
	},
}

const HERO_ORDER := ["assault", "engineer", "medic"]

const DEFINITIONS := {
	"kunai": {"name": "쿠나이", "short": "KN", "desc": "가까운 적을 추적하는 수리검", "kind": "weapon", "max": 5, "hidden": false},
	"guardian": {"name": "수호자", "short": "GD", "desc": "주위를 회전하는 방어 칼날", "kind": "weapon", "max": 5, "hidden": false},
	"rocket": {"name": "로켓", "short": "RK", "desc": "직격 후 광역 폭발", "kind": "weapon", "max": 5, "hidden": false},
	"lightning": {"name": "번개", "short": "LT", "desc": "가까운 적에게 즉시 낙뢰", "kind": "weapon", "max": 5, "hidden": false},
	"molotov": {"name": "화염병", "short": "ML", "desc": "적 위치에 지속 화염 장판", "kind": "weapon", "max": 5, "hidden": false},
	"drill": {"name": "드릴", "short": "DR", "desc": "일직선으로 적을 관통", "kind": "weapon", "max": 5, "hidden": false},
	"droneA": {"name": "A형 드론", "short": "DA", "desc": "추적 조준 탄환 · B형과 합체 가능", "kind": "weapon", "max": 5, "hidden": false},
	"droneB": {"name": "B형 드론", "short": "DB", "desc": "확산 포격 · A형과 합체 가능", "kind": "weapon", "max": 5, "hidden": false},
	"destroyer": {"name": "파괴자 드론", "short": "DS", "desc": "쌍발 유도 폭격 · 슬롯 1칸 회수", "kind": "weapon", "max": 5, "hidden": true},
	"atk": {"name": "고화력 탄약", "short": "AT", "desc": "공격력 레벨당 +12%", "kind": "passive", "max": 5, "hidden": false},
	"speed": {"name": "운동화", "short": "SP", "desc": "이동 속도 레벨당 +9%", "kind": "passive", "max": 5, "hidden": false},
	"cooldown": {"name": "에너지 큐브", "short": "CD", "desc": "공격 간격 레벨당 -7%", "kind": "passive", "max": 5, "hidden": false},
	"hp": {"name": "피트니스 가이드", "short": "HP", "desc": "최대 HP 레벨당 +15%", "kind": "passive", "max": 5, "hidden": false},
	"magnet": {"name": "자석", "short": "MG", "desc": "흡수 범위 +35 · 경험치 +8%", "kind": "passive", "max": 5, "hidden": false},
	"heal": {"name": "에너지 드링크", "short": "HL", "desc": "초당 최대 HP의 0.4% 회복", "kind": "passive", "max": 5, "hidden": false},
	"range": {"name": "고성능 렌즈", "short": "RN", "desc": "범위·사거리 레벨당 +8%", "kind": "passive", "max": 5, "hidden": false},
	"armor": {"name": "방탄 섬유", "short": "AR", "desc": "받는 피해 레벨당 -8%", "kind": "passive", "max": 5, "hidden": false},
}

const EVO_PAIRS := {
	"kunai": "atk",
	"guardian": "cooldown",
	"rocket": "hp",
	"lightning": "cooldown",
	"molotov": "heal",
	"drill": "speed",
}

const EVOLUTION_NAMES := {
	"kunai": "유령 수리검",
	"guardian": "절대 수호자",
	"rocket": "심판의 미사일",
	"lightning": "천둥의 사슬",
	"molotov": "지옥 화염",
	"drill": "귀환 화살",
	"destroyer": "파괴자 드론",
}

const EVOLUTION_DESCS := {
	"kunai": "4발 추적 + 관통 + 연쇄 타격",
	"guardian": "칼날 추가 · 적 탄환 파괴",
	"rocket": "대폭발 + 잔류 화염 장판",
	"lightning": "추가 낙뢰 + 연쇄 번개",
	"molotov": "주변 3곳 추가 화염 장판",
	"drill": "관통 후 플레이어 쪽으로 귀환",
	"destroyer": "A/B 드론 합체 → 쌍발 유도 폭격",
}

const WEAPON_DATA := {
	"kunai": {"damage": [37.0, 50.0, 63.0, 76.0, 89.0], "cooldown": 0.85, "color": Color("ffe19a")},
	"guardian": {"damage": [21.0, 30.0, 39.0, 48.0, 57.0], "cooldown": 0.30, "color": Color("b1f3ef")},
	"rocket": {"damage": [69.0, 93.0, 117.0, 141.0, 165.0], "cooldown": 3.30, "color": Color("ff9964")},
	"lightning": {"damage": [75.0, 100.0, 125.0, 150.0, 175.0], "cooldown": 2.80, "color": Color("ace8ff")},
	"molotov": {"damage": [18.0, 24.0, 30.0, 36.0, 42.0], "cooldown": 3.50, "color": Color("ffb169")},
	"drill": {"damage": [32.0, 44.0, 56.0, 68.0, 80.0], "cooldown": 1.50, "color": Color("7be3f5")},
	"droneA": {"damage": [22.0, 31.0, 40.0, 49.0, 58.0], "cooldown": 0.75, "color": Color("8deaf3")},
	"droneB": {"damage": [16.0, 23.0, 30.0, 37.0, 44.0], "cooldown": 1.40, "color": Color("f5bc84")},
	"destroyer": {"damage": [90.0, 90.0, 90.0, 90.0, 90.0], "cooldown": 0.50, "color": Color("ffe89c")},
}

# [hp, speed, dmg, radius, color, xp]
const ENEMY_DATA := {
	"grunt": {"hp": 30.0, "speed": 60.0, "dmg": 10.0, "r": 12.0, "color": Color("9bdb83"), "xp": 3},
	"runner": {"hp": 24.0, "speed": 102.0, "dmg": 9.0, "r": 10.0, "color": Color("ffb86e"), "xp": 3},
	"tank": {"hp": 145.0, "speed": 34.0, "dmg": 17.0, "r": 18.0, "color": Color("a99bea"), "xp": 8},
	"ranged": {"hp": 46.0, "speed": 48.0, "dmg": 11.0, "r": 12.0, "color": Color("70c5e6"), "xp": 5},
	"elite": {"hp": 650.0, "speed": 53.0, "dmg": 24.0, "r": 24.0, "color": Color("f6c24f"), "xp": 40},
	"splitter": {"hp": 98.0, "speed": 43.0, "dmg": 13.0, "r": 17.0, "color": Color("c9a0ff"), "xp": 7},
	"sniper": {"hp": 58.0, "speed": 40.0, "dmg": 16.0, "r": 12.0, "color": Color("f48fb1"), "xp": 6},
	"mini": {"hp": 16.0, "speed": 115.0, "dmg": 7.0, "r": 8.0, "color": Color("d5baff"), "xp": 1},
	"boss": {"hp": 3600.0, "speed": 43.0, "dmg": 32.0, "r": 35.0, "color": Color("e36b9c"), "xp": 90},
	"charger": {"hp": 105.0, "speed": 62.0, "dmg": 18.0, "r": 15.0, "color": Color("f39866"), "xp": 6},
	"medic": {"hp": 90.0, "speed": 40.0, "dmg": 10.0, "r": 13.0, "color": Color("a0e7bd"), "xp": 7},
}

const MISSIONS := [
	{"id": "kills", "name": "좀비 150마리 처치", "goal": 150, "reward": 45},
	{"id": "chest", "name": "보급 상자 2개 열기", "goal": 2, "reward": 50},
	{"id": "evolve", "name": "무기 1종 진화", "goal": 1, "reward": 90},
]

const META_UPGRADES := {
	"attack": {"name": "공격력 강화", "base_cost": 60, "step_cost": 45, "desc": "영구 공격력 +8%"},
	"hp": {"name": "체력 강화", "base_cost": 55, "step_cost": 40, "desc": "영구 최대 HP +15"},
	"armor": {"name": "방어력 강화", "base_cost": 65, "step_cost": 50, "desc": "영구 피해 감소 +4.5%"},
}


static func next_xp(level: int) -> int:
	var n := float(maxi(1, level) - 1)
	return int(roundf(12.0 + 7.0 * n + 0.65 * n * n))


static func format_time(seconds: float) -> String:
	var total := maxi(0, int(floorf(seconds)))
	return "%02d:%02d" % [total / 60, total % 60]
