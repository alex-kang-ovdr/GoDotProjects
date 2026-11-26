extends RefCounted
class_name OniElements

# 원작 ONI 설치본 YAML(gas/liquid/solid.yaml) 및 Assembly-CSharp.dll 대조 수치 정본
# (games/oxygen-not-included/References/OxygenNotIncluded/ANALYSIS.md 기준)

const CYCLE_SECONDS := 600.0
const GAS_TICK_DT := 0.2
const DUPE_O2_KG_PER_S := 0.1
const DUPE_CO2_KG_PER_S := 0.002
const DUPE_KCAL_MAX := 4000.0
const DUPE_KCAL_PER_CYCLE := 1000.0

const DIFFUSER_ALGAE_KG_PER_S := 0.55
const DIFFUSER_O2_KG_PER_S := 0.5
const DIFFUSER_OUT_TEMP_C := 30.0
const DIFFUSER_MAX_PRESSURE_KG := 1.8
const DIFFUSER_POWER_W := 120.0

const MANUAL_GEN_POWER_W := 400.0
const BATTERY_CAPACITY_J := 10000.0
const BATTERY_LEAK_J_PER_S := 1.6666666

const DIG_RETURN_RATIO := 0.5

const ELEMENTS := {
	"Vacuum": {
		"name_ko": "진공",
		"state": "gas",
		"shc": 0.0,
		"tc": 0.0,
		"molar_mass": 0.0,
		"default_mass": 0.0,
		"low_c": null,
		"high_c": null,
		"color": Color(0.06, 0.07, 0.10, 1.0),
	},
	"Oxygen": {
		"name_ko": "산소",
		"state": "gas",
		"shc": 1.005,
		"tc": 0.024,
		"molar_mass": 15.9994,
		"default_mass": 1.0,
		"low_c": -182.96,
		"high_c": null,
		"color": Color(0.32, 0.78, 0.96, 1.0),
	},
	"CarbonDioxide": {
		"name_ko": "이산화탄소",
		"state": "gas",
		"shc": 0.846,
		"tc": 0.0146,
		"molar_mass": 44.01,
		"default_mass": 0.5,
		"low_c": -48.15,
		"high_c": null,
		"color": Color(0.86, 0.34, 0.28, 1.0),
	},
	"Hydrogen": {
		"name_ko": "수소",
		"state": "gas",
		"shc": 2.4,
		"tc": 0.168,
		"molar_mass": 1.00794,
		"default_mass": 0.5,
		"low_c": -252.15,
		"high_c": null,
		"color": Color(0.86, 0.44, 0.88, 1.0),
	},
	"Steam": {
		"name_ko": "증기",
		"state": "gas",
		"shc": 4.179,
		"tc": 0.184,
		"molar_mass": 18.01528,
		"default_mass": 1.0,
		"low_c": 99.35,
		"high_c": null,
		"color": Color(0.84, 0.90, 0.96, 1.0),
	},
	"Water": {
		"name_ko": "물",
		"state": "liquid",
		"shc": 4.179,
		"tc": 0.609,
		"molar_mass": 18.01528,
		"default_mass": 1000.0,
		"low_c": -0.65,
		"high_c": 99.35,
		"color": Color(0.18, 0.54, 0.86, 0.88),
	},
	"Ice": {
		"name_ko": "얼음",
		"state": "solid",
		"shc": 2.05,
		"tc": 2.18,
		"molar_mass": 18.01528,
		"default_mass": 1000.0,
		"low_c": null,
		"high_c": -0.65,
		"dig_time": 2.4,
		"color": Color(0.62, 0.86, 0.98, 1.0),
	},
	"Dirt": {
		"name_ko": "흙",
		"state": "solid",
		"shc": 1.48,
		"tc": 2.0,
		"molar_mass": 50.0,
		"default_mass": 1840.0,
		"low_c": null,
		"high_c": 326.85,
		"dig_time": 1.6,
		"color": Color(0.45, 0.31, 0.21, 1.0),
	},
	"SandStone": {
		"name_ko": "사암",
		"state": "solid",
		"shc": 0.8,
		"tc": 2.9,
		"molar_mass": 50.0,
		"default_mass": 1840.0,
		"low_c": null,
		"high_c": 926.85,
		"dig_time": 2.0,
		"color": Color(0.68, 0.56, 0.40, 1.0),
	},
	"IgneousRock": {
		"name_ko": "화성암",
		"state": "solid",
		"shc": 1.0,
		"tc": 2.0,
		"molar_mass": 50.0,
		"default_mass": 1840.0,
		"low_c": null,
		"high_c": 1409.85,
		"dig_time": 3.0,
		"color": Color(0.42, 0.37, 0.39, 1.0),
	},
	"Algae": {
		"name_ko": "조류",
		"state": "solid",
		"shc": 0.2,
		"tc": 2.0,
		"molar_mass": 4.0,
		"default_mass": 200.0,
		"low_c": null,
		"high_c": 125.0,
		"dig_time": 1.4,
		"color": Color(0.24, 0.56, 0.31, 1.0),
	},
	"Cuprite": {
		"name_ko": "구리 광석",
		"state": "solid",
		"shc": 0.386,
		"tc": 4.5,
		"molar_mass": 143.09,
		"default_mass": 800.0,
		"low_c": null,
		"high_c": 1083.85,
		"dig_time": 2.5,
		"color": Color(0.76, 0.44, 0.24, 1.0),
	},
	"Carbon": {
		"name_ko": "석탄",
		"state": "solid",
		"shc": 0.71,
		"tc": 1.25,
		"molar_mass": 12.0107,
		"default_mass": 600.0,
		"low_c": null,
		"high_c": 276.85,
		"dig_time": 2.2,
		"color": Color(0.20, 0.20, 0.22, 1.0),
	},
	"Granite": {
		"name_ko": "화강암(기반암)",
		"state": "solid",
		"shc": 0.79,
		"tc": 3.39,
		"molar_mass": 50.0,
		"default_mass": 1840.0,
		"low_c": null,
		"high_c": 668.85,
		"dig_time": 999.0,
		"undiggable": true,
		"color": Color(0.26, 0.26, 0.30, 1.0),
	},
	"Katairite": {
		"name_ko": "심연석",
		"state": "solid",
		"shc": 4.0,
		"tc": 0.00001,
		"molar_mass": 341.76,
		"default_mass": 500.0,
		"low_c": null,
		"high_c": 3421.85,
		"dig_time": 999.0,
		"undiggable": true,
		"color": Color(0.32, 0.22, 0.42, 1.0),
	},
	"Obsidian": {
		"name_ko": "흑요석",
		"state": "solid",
		"shc": 0.2,
		"tc": 2.0,
		"molar_mass": 50.0,
		"default_mass": 1000.0,
		"low_c": null,
		"high_c": 2726.85,
		"dig_time": 4.0,
		"color": Color(0.16, 0.14, 0.20, 1.0),
	},
}

const BUILDINGS := {
	"tile": {
		"name_ko": "바닥 타일",
		"desc": "통행 가능 · 기체 차단",
		"cost_element": "SandStone",
		"cost_kg": 100.0,
		"build_time": 1.6,
		"solid": true,
		"climbable": false,
		"power_w": 0.0,
		"color": Color(0.60, 0.64, 0.70, 1.0),
	},
	"ladder": {
		"name_ko": "사다리",
		"desc": "상하 이동 · 기체 통과",
		"cost_element": "SandStone",
		"cost_kg": 50.0,
		"build_time": 1.2,
		"solid": false,
		"climbable": true,
		"power_w": 0.0,
		"color": Color(0.74, 0.58, 0.34, 1.0),
	},
	"diffuser": {
		"name_ko": "산소 확산기",
		"desc": "조류 550g/s -> 산소 500g/s (120W)",
		"cost_element": "Cuprite",
		"cost_kg": 200.0,
		"build_time": 3.0,
		"solid": false,
		"climbable": false,
		"power_w": 120.0,
		"needs_floor": true,
		"color": Color(0.30, 0.76, 0.62, 1.0),
	},
	"generator": {
		"name_ko": "수동 발전기",
		"desc": "대원 작동 시 400W 전력 생산",
		"cost_element": "Cuprite",
		"cost_kg": 200.0,
		"build_time": 2.8,
		"solid": false,
		"climbable": false,
		"power_w": -400.0,
		"needs_floor": true,
		"color": Color(0.88, 0.68, 0.24, 1.0),
	},
	"battery": {
		"name_ko": "소형 배터리",
		"desc": "10 kJ 저장 · 누전 1.67 J/s",
		"cost_element": "Cuprite",
		"cost_kg": 200.0,
		"build_time": 2.4,
		"solid": false,
		"climbable": false,
		"power_w": 0.0,
		"needs_floor": true,
		"color": Color(0.36, 0.80, 0.42, 1.0),
	},
	"wire": {
		"name_ko": "전선",
		"desc": "전력 설비 연결",
		"cost_element": "Cuprite",
		"cost_kg": 25.0,
		"build_time": 0.8,
		"solid": false,
		"climbable": false,
		"power_w": 0.0,
		"layer": "wire",
		"color": Color(0.95, 0.56, 0.22, 1.0),
	},
	"cot": {
		"name_ko": "간이 침대",
		"desc": "대원 휴식 · 스태미나 회복",
		"cost_element": "SandStone",
		"cost_kg": 100.0,
		"build_time": 2.0,
		"solid": false,
		"climbable": false,
		"power_w": 0.0,
		"needs_floor": true,
		"color": Color(0.46, 0.62, 0.88, 1.0),
	},
	"storage": {
		"name_ko": "보관함",
		"desc": "채굴 자원 정리 및 보관",
		"cost_element": "SandStone",
		"cost_kg": 200.0,
		"build_time": 2.0,
		"solid": false,
		"climbable": false,
		"power_w": 0.0,
		"needs_floor": true,
		"color": Color(0.54, 0.58, 0.64, 1.0),
	},
}

static func get_element(id: String) -> Dictionary:
	return ELEMENTS.get(id, ELEMENTS["Vacuum"])

static func get_element_name(id: String) -> String:
	var e: Dictionary = ELEMENTS.get(id, {})
	return String(e.get("name_ko", id))

static func is_diggable(id: String) -> bool:
	var e: Dictionary = ELEMENTS.get(id, {})
	if e.is_empty():
		return false
	return String(e.get("state", "")) == "solid" and not bool(e.get("undiggable", false))

static func get_building(id: String) -> Dictionary:
	return BUILDINGS.get(id, {})
