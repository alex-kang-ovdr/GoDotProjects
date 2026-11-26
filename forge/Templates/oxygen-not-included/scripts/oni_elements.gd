extends RefCounted
class_name OniElements

# C:/Temp/Oxygen 역공학 추출 정본 데이터 로더 (res://data/*_extracted.json)
# 원작 YAML(196원소) · worldgen(13바이옴 + sandstoneBase) · GraphML(97기술) · Klei 공식 한국어(PO) 기반

const CYCLE_SECONDS := 600.0
const GAS_TICK_DT := 0.2
const CONDUIT_TICK_DT := 1.0
const DUPE_O2_KG_PER_S := 0.1
const DUPE_CO2_KG_PER_S := 0.002
const DUPE_KCAL_MAX := 4000.0
const DUPE_KCAL_PER_CYCLE := 1000.0

const DIFFUSER_ALGAE_KG_PER_S := 0.55
const DIFFUSER_O2_KG_PER_S := 0.5
const DIFFUSER_OUT_TEMP_C := 30.0
const DIFFUSER_MAX_PRESSURE_KG := 1.8
const DIFFUSER_POWER_W := 120.0

const ELECTROLYZER_WATER_KG_PER_S := 1.0
const ELECTROLYZER_O2_KG_PER_S := 0.888
const ELECTROLYZER_H2_KG_PER_S := 0.112
const ELECTROLYZER_OUT_TEMP_C := 70.0
const ELECTROLYZER_POWER_W := 120.0
const ELECTROLYZER_MAX_PRESSURE_KG := 1.8

const MANUAL_GEN_POWER_W := 400.0
const COAL_GEN_POWER_W := 600.0
const COAL_GEN_CARBON_KG_PER_S := 1.0
const COAL_GEN_CO2_KG_PER_S := 0.02
const COAL_GEN_OUT_TEMP_C := 110.0

const H2_GEN_POWER_W := 800.0
const H2_GEN_H2_KG_PER_S := 0.1
const H2_GEN_BUFFER_KG := 2.0

const TURBINE_POWER_W := 850.0
const TURBINE_MIN_STEAM_C := 125.0
const TURBINE_MAX_BODY_C := 100.0
const TURBINE_STEAM_KG_PER_S := 2.0

const LIQUID_PIPE_MAX_KG := 10.0
const GAS_PIPE_MAX_KG := 1.0
const LIQUID_PUMP_POWER_W := 240.0
const LIQUID_PUMP_KG_PER_S := 10.0
const GAS_PUMP_POWER_W := 240.0
const GAS_PUMP_KG_PER_S := 0.5

const BATTERY_CAPACITY_J := 10000.0
const BATTERY_LEAK_J_PER_S := 1.6666666

const RESEARCH_POWER_W := 60.0
const RESEARCH_DIRT_PER_PT := 50.0

const MEALWOOD_GROWTH_S := 1800.0
const MEALWOOD_DIRT_KG_PER_S := 0.0166667
const MEALWOOD_HARVEST_KCAL := 600.0
const MEALWOOD_MIN_C := 10.0
const MEALWOOD_MAX_C := 30.0
const MEALWOOD_MIN_GAS_KG := 0.15

const DIG_RETURN_RATIO := 0.5

static var _loaded := false
static var elements: Dictionary = {}
static var techs: Dictionary = {}
static var buildings: Dictionary = {}
static var worldgen: Dictionary = {}
static var manifest: Dictionary = {}

const BUILDING_COLORS := {
	"tile": Color(0.60, 0.64, 0.70, 1.0),
	"insulated_tile": Color(0.76, 0.66, 0.52, 1.0),
	"ladder": Color(0.74, 0.58, 0.34, 1.0),
	"cot": Color(0.46, 0.62, 0.88, 1.0),
	"storage": Color(0.54, 0.58, 0.64, 1.0),
	"diffuser": Color(0.30, 0.76, 0.62, 1.0),
	"electrolyzer": Color(0.28, 0.74, 0.94, 1.0),
	"generator": Color(0.88, 0.68, 0.24, 1.0),
	"coal_gen": Color(0.46, 0.36, 0.32, 1.0),
	"hydrogen_gen": Color(0.74, 0.42, 0.84, 1.0),
	"steam_turbine": Color(0.76, 0.82, 0.88, 1.0),
	"battery": Color(0.36, 0.80, 0.42, 1.0),
	"wire": Color(0.95, 0.56, 0.22, 1.0),
	"liquid_pipe": Color(0.24, 0.62, 0.96, 1.0),
	"liquid_pump": Color(0.20, 0.54, 0.88, 1.0),
	"liquid_vent": Color(0.38, 0.74, 0.98, 1.0),
	"gas_pipe": Color(0.36, 0.88, 0.78, 1.0),
	"gas_pump": Color(0.26, 0.74, 0.68, 1.0),
	"gas_vent": Color(0.56, 0.94, 0.88, 1.0),
	"farm_tile": Color(0.38, 0.68, 0.34, 1.0),
	"research_station": Color(0.56, 0.50, 0.88, 1.0),
}

static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true

	var raw_el: Variant = _load_json("res://data/elements_extracted.txt")
	if raw_el is Dictionary and not raw_el.is_empty():
		for k_v in raw_el.keys():
			var k := String(k_v)
			var d: Dictionary = raw_el[k]
			var rgb: Array = d.get("color", [0.5, 0.5, 0.5])
			if rgb.size() >= 3:
				d["color_val"] = Color(float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0)
			else:
				d["color_val"] = Color(0.5, 0.5, 0.5, 1.0)
			elements[k] = d

	if not elements.has("Vacuum"):
		elements["Vacuum"] = {
			"name_ko": "진공",
			"state": "gas",
			"shc": 0.0,
			"tc": 0.0,
			"molar_mass": 0.0,
			"default_mass": 0.0,
			"max_mass": 0.0,
			"low_c": null,
			"high_c": null,
			"color_val": Color(0.06, 0.07, 0.10, 1.0),
		}

	var raw_tt: Variant = _load_json("res://data/tech_tree_extracted.txt")
	if raw_tt is Dictionary and raw_tt.has("techs"):
		techs = raw_tt["techs"]

	var raw_b: Variant = _load_json("res://data/buildings_extracted.txt")
	if raw_b is Dictionary and not raw_b.is_empty():
		for bk_v in raw_b.keys():
			var bk := String(bk_v)
			var bd: Dictionary = raw_b[bk]
			bd["color"] = BUILDING_COLORS.get(bk, Color(0.6, 0.7, 0.8, 1.0))
			buildings[bk] = bd

	var raw_wg: Variant = _load_json("res://data/biomes_worldgen_extracted.txt")
	if raw_wg is Dictionary:
		worldgen = raw_wg

	var raw_mf: Variant = _load_json("res://data/extraction_manifest.txt")
	if raw_mf is Dictionary:
		manifest = raw_mf

static func _load_json(res_path: String) -> Variant:
	if not FileAccess.file_exists(res_path):
		return {}
	var txt := FileAccess.get_file_as_string(res_path)
	if txt.is_empty():
		return {}
	var parsed: Variant = JSON.parse_string(txt)
	if parsed == null:
		return {}
	return parsed

static func get_element(id: String) -> Dictionary:
	ensure_loaded()
	return elements.get(id, elements["Vacuum"])

static func get_element_color(id: String) -> Color:
	var e := get_element(id)
	var c: Variant = e.get("color_val", Color(0.5, 0.5, 0.5, 1.0))
	if c is Color:
		return c
	return Color(0.5, 0.5, 0.5, 1.0)

static func get_element_name(id: String) -> String:
	var e := get_element(id)
	return String(e.get("name_ko", id))

static func is_diggable(id: String) -> bool:
	var e := get_element(id)
	if e.is_empty():
		return false
	return String(e.get("state", "")) == "solid" and not bool(e.get("undiggable", false))

static func get_building(id: String) -> Dictionary:
	ensure_loaded()
	return buildings.get(id, {})

static func get_tech(id: String) -> Dictionary:
	ensure_loaded()
	return techs.get(id, {})

static func get_counts_summary() -> String:
	ensure_loaded()
	var biomes_d: Dictionary = worldgen.get("biomes", {})
	return "원작 추출: 원소 %d · 기술 %d · 바이옴 %d" % [elements.size(), techs.size(), biomes_d.size()]
