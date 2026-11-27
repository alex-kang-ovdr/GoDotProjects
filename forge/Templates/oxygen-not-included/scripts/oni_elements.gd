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
static var csharp_logic: Dictionary = {}
static var csharp_buildings: Dictionary = {}
static var csharp_critters: Dictionary = {}
static var csharp_crops: Dictionary = {}
static var csharp_botany: Dictionary = {}
static var csharp_rocketry: Dictionary = {}
static var csharp_ranching: Dictionary = {}
static var csharp_env: Dictionary = {}
static var csharp_mechanics: Dictionary = {}
static var csharp_foods: Dictionary = {}
static var csharp_geysers: Dictionary = {}
static var csharp_diseases: Dictionary = {}
static var csharp_rooms: Dictionary = {}
static var csharp_recipes: Dictionary = {}
static var csharp_traits: Dictionary = {}
static var csharp_physiology: Dictionary = {}
static var csharp_tuning: Dictionary = {}

const BUILDING_COLORS := {
	"tile": Color(0.60, 0.64, 0.70, 1.0),
	"insulated_tile": Color(0.76, 0.66, 0.52, 1.0),
	"door": Color(0.64, 0.70, 0.78, 1.0),
	"mech_door": Color(0.46, 0.64, 0.82, 1.0),
	"ladder": Color(0.74, 0.58, 0.34, 1.0),
	"cot": Color(0.46, 0.62, 0.88, 1.0),
	"storage": Color(0.54, 0.58, 0.64, 1.0),
	"ceiling_light": Color(1.0, 0.92, 0.52, 1.0),
	"outhouse": Color(0.58, 0.44, 0.30, 1.0),
	"wash_basin": Color(0.46, 0.78, 0.82, 1.0),
	"mess_table": Color(0.64, 0.52, 0.40, 1.0),
	"ration_box": Color(0.86, 0.74, 0.30, 1.0),
	"microbe_musher": Color(0.56, 0.72, 0.46, 1.0),
	"electric_grill": Color(0.82, 0.46, 0.32, 1.0),
	"flower_pot": Color(0.42, 0.82, 0.46, 1.0),
	"decor_painting": Color(0.92, 0.72, 0.38, 1.0),
	"sculpture": Color(0.86, 0.88, 0.94, 1.0),
	"diffuser": Color(0.30, 0.76, 0.62, 1.0),
	"electrolyzer": Color(0.28, 0.74, 0.94, 1.0),
	"co2_skimmer": Color(0.72, 0.62, 0.34, 1.0),
	"water_sieve": Color(0.38, 0.70, 0.86, 1.0),
	"generator": Color(0.88, 0.68, 0.24, 1.0),
	"coal_gen": Color(0.46, 0.36, 0.32, 1.0),
	"hydrogen_gen": Color(0.74, 0.42, 0.84, 1.0),
	"steam_turbine": Color(0.76, 0.82, 0.88, 1.0),
	"solar_panel": Color(0.26, 0.56, 0.92, 1.0),
	"battery": Color(0.36, 0.80, 0.42, 1.0),
	"smart_battery": Color(0.32, 0.92, 0.58, 1.0),
	"wire": Color(0.95, 0.56, 0.22, 1.0),
	"logic_wire": Color(0.28, 0.96, 0.44, 1.0),
	"atmo_sensor": Color(0.34, 0.88, 0.96, 1.0),
	"thermo_sensor": Color(0.96, 0.52, 0.30, 1.0),
	"thermo_aquatuner": Color(0.28, 0.68, 0.96, 1.0),
	"metal_refinery": Color(0.86, 0.52, 0.28, 1.0),
	"oil_refinery": Color(0.48, 0.36, 0.54, 1.0),
	"aetn": Color(0.48, 0.84, 0.98, 1.0),
	"poi_vending": Color(0.76, 0.54, 0.82, 1.0),
	"poi_desk": Color(0.68, 0.74, 0.82, 1.0),
	"liquid_pipe": Color(0.24, 0.62, 0.96, 1.0),
	"liquid_pump": Color(0.20, 0.54, 0.88, 1.0),
	"liquid_vent": Color(0.38, 0.74, 0.98, 1.0),
	"liquid_reservoir": Color(0.28, 0.66, 0.92, 1.0),
	"gas_pipe": Color(0.36, 0.88, 0.78, 1.0),
	"gas_pump": Color(0.26, 0.74, 0.68, 1.0),
	"gas_vent": Color(0.56, 0.94, 0.88, 1.0),
	"gas_reservoir": Color(0.88, 0.46, 0.32, 1.0),
	"farm_tile": Color(0.38, 0.68, 0.34, 1.0),
	"research_station": Color(0.56, 0.50, 0.88, 1.0),
	"rocket_steam_engine": Color(0.86, 0.72, 0.32, 1.0),
	"rocket_research_module": Color(0.46, 0.72, 0.94, 1.0),
	"rocket_command_module": Color(0.82, 0.86, 0.92, 1.0),
	"geyser_steam": Color(0.68, 0.80, 0.88, 1.0),
	"geyser_water": Color(0.82, 0.32, 0.28, 1.0),
	"geyser_hydrogen": Color(0.76, 0.38, 0.82, 1.0),
	"fire_pole": Color(0.92, 0.62, 0.24, 1.0),
	"auto_sweeper": Color(0.42, 0.84, 0.96, 1.0),
	"sweep_station": Color(0.54, 0.78, 0.92, 1.0),
	"conveyor_loader": Color(0.66, 0.60, 0.50, 1.0),
	"ranch_station": Color(0.76, 0.58, 0.36, 1.0),
	"incubator": Color(0.88, 0.72, 0.42, 1.0),
	"oxygen_dock": Color(0.36, 0.82, 0.94, 1.0),
	"telescope": Color(0.62, 0.74, 0.96, 1.0),
	"bunker_door": Color(0.48, 0.54, 0.62, 1.0),
	"space_scanner": Color(0.38, 0.86, 0.96, 1.0),
	"bunker_tile": Color(0.42, 0.48, 0.56, 1.0),
	"medical_cot": Color(0.86, 0.92, 0.96, 1.0),
	"apothecary": Color(0.36, 0.90, 0.58, 1.0),
	"massage_table": Color(0.46, 0.76, 0.94, 1.0),
	"wash_sink": Color(0.48, 0.84, 0.92, 1.0),
	"water_cooler": Color(0.34, 0.72, 0.96, 1.0),
	"shower": Color(0.56, 0.88, 0.98, 1.0),
	"flush_toilet": Color(0.76, 0.82, 0.88, 1.0),
	"jukebot": Color(0.76, 0.42, 0.96, 1.0),
	"arcade_cabinet": Color(0.88, 0.34, 0.68, 1.0),
	"gas_filter": Color(0.44, 0.86, 0.56, 1.0),
	"liquid_filter": Color(0.28, 0.66, 0.96, 1.0),
	"conveyor_chute": Color(0.72, 0.62, 0.48, 1.0),
	"rocket_cargo_bay": Color(0.78, 0.46, 0.36, 1.0),
	"suit_maker": Color(0.92, 0.78, 0.34, 1.0),
	"metal_tile": Color(0.84, 0.68, 0.42, 1.0),
	"suit_dock": Color(0.32, 0.74, 0.96, 1.0),
	"suit_checkpoint": Color(0.36, 0.88, 0.72, 1.0),
	"logic_switch": Color(0.30, 0.96, 0.48, 1.0),
	"logic_and": Color(0.28, 0.86, 0.68, 1.0),
	"logic_or": Color(0.34, 0.88, 0.76, 1.0),
	"logic_not": Color(0.96, 0.44, 0.36, 1.0),
	"logic_buffer": Color(0.46, 0.84, 0.96, 1.0),
	"logic_alarm": Color(0.98, 0.32, 0.28, 1.0),
	"petrol_gen": Color(0.76, 0.42, 0.24, 1.0),
	"rock_crusher": Color(0.64, 0.56, 0.48, 1.0),
	"kiln": Color(0.82, 0.46, 0.26, 1.0),
	"rocket_petroleum_engine": Color(0.86, 0.54, 0.26, 1.0),
	"rocket_fuel_tank": Color(0.90, 0.64, 0.22, 1.0),
	"rocket_oxidizer_tank": Color(0.42, 0.80, 0.96, 1.0),
	"glass_tile": Color(0.68, 0.92, 1.0, 0.85),
	"travel_tube": Color(0.38, 0.88, 0.98, 0.90),
	"travel_tube_entrance": Color(0.30, 0.78, 0.96, 1.0),
	"jetsuit_dock": Color(0.96, 0.56, 0.24, 1.0),
	"jetsuit_checkpoint": Color(0.96, 0.74, 0.28, 1.0),
	"super_computer": Color(0.34, 0.90, 0.62, 1.0),
	"planetarium": Color(0.74, 0.44, 0.98, 1.0),
	"hydroponic_tile": Color(0.34, 0.76, 0.52, 1.0),
	"planter_box": Color(0.68, 0.46, 0.34, 1.0),
	"wheezewort": Color(0.42, 0.86, 0.98, 1.0),
	"sauna": Color(0.82, 0.56, 0.36, 1.0),
	"hottub": Color(0.44, 0.78, 0.96, 1.0),
	"beach_chair": Color(0.98, 0.84, 0.42, 1.0),
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

	# 조립식 연구 로켓 3단 모듈 & 자연 간헐천 3종 런타임 등록
	var extra_buildings := {
		"rocket_steam_engine": {
			"name_ko": "증기 엔진", "cat": "space", "desc": "조립식 로켓 하단 추진 모듈 (증기 100kg)",
			"cost_element": "Cuprite", "cost_kg": 400.0, "build_time": 3.8, "needs_floor": true,
			"color": BUILDING_COLORS["rocket_steam_engine"],
		},
		"rocket_research_module": {
			"name_ko": "연구 모듈", "cat": "space", "desc": "우주 탐사 데이터뱅크 수집 모듈",
			"cost_element": "Cuprite", "cost_kg": 300.0, "build_time": 3.2,
			"color": BUILDING_COLORS["rocket_research_module"],
		},
		"rocket_command_module": {
			"name_ko": "조종 모듈", "cat": "space", "desc": "로켓 상단 조종석 모듈",
			"cost_element": "Cuprite", "cost_kg": 300.0, "build_time": 3.2,
			"color": BUILDING_COLORS["rocket_command_module"],
		},
		"rocket_cargo_bay": {
			"name_ko": "화물 베이", "cat": "space", "desc": "우주 소행성 광물 채취 화물 적재 모듈",
			"cost_element": "IronOre", "cost_kg": 400.0, "build_time": 3.4,
			"color": BUILDING_COLORS["rocket_cargo_bay"],
		},
		"geyser_steam": {
			"name_ko": "증기 분출구", "cat": "natural", "desc": "155°C 증기 주기적 분출",
			"cost_element": "Granite", "cost_kg": 0.0, "build_time": 1.0,
			"color": BUILDING_COLORS["geyser_steam"],
		},
		"geyser_water": {
			"name_ko": "열수 간헐천", "cat": "natural", "desc": "고온 청수 주기적 분출",
			"cost_element": "Granite", "cost_kg": 0.0, "build_time": 1.0,
			"color": BUILDING_COLORS["geyser_water"],
		},
		"geyser_hydrogen": {
			"name_ko": "수소 분출구", "cat": "natural", "desc": "고온 수소 기체 주기적 분출",
			"cost_element": "Granite", "cost_kg": 0.0, "build_time": 1.0,
			"color": BUILDING_COLORS["geyser_hydrogen"],
		},
	}
	for ek_v in extra_buildings.keys():
		var ek := String(ek_v)
		if not buildings.has(ek):
			buildings[ek] = extra_buildings[ek]

	var raw_wg: Variant = _load_json("res://data/biomes_worldgen_extracted.txt")
	if raw_wg is Dictionary:
		worldgen = raw_wg

	var raw_mf: Variant = _load_json("res://data/extraction_manifest.txt")
	if raw_mf is Dictionary:
		manifest = raw_mf

	var raw_cs: Variant = _load_json("res://data/csharp_logic_extracted.txt")
	if raw_cs is Dictionary and not raw_cs.is_empty():
		csharp_logic = raw_cs
		if raw_cs.get("buildings", {}) is Dictionary:
			csharp_buildings = raw_cs["buildings"]
		if raw_cs.get("critters", {}) is Dictionary:
			csharp_critters = raw_cs["critters"]
		if raw_cs.get("crops", {}) is Dictionary:
			csharp_crops = raw_cs["crops"]
		if raw_cs.get("botany", {}) is Dictionary:
			csharp_botany = raw_cs["botany"]
		if raw_cs.get("rocketry", {}) is Dictionary:
			csharp_rocketry = raw_cs["rocketry"]
		if raw_cs.get("ranching", {}) is Dictionary:
			csharp_ranching = raw_cs["ranching"]
		if raw_cs.get("environment", {}) is Dictionary:
			csharp_env = raw_cs["environment"]
		if raw_cs.get("mechanics", {}) is Dictionary:
			csharp_mechanics = raw_cs["mechanics"]
		if raw_cs.get("foods", {}) is Dictionary:
			csharp_foods = raw_cs["foods"]
		if raw_cs.get("geysers", {}) is Dictionary:
			csharp_geysers = raw_cs["geysers"]
		if raw_cs.get("diseases", {}) is Dictionary:
			csharp_diseases = raw_cs["diseases"]
		if raw_cs.get("rooms", {}) is Dictionary:
			csharp_rooms = raw_cs["rooms"]
		if raw_cs.get("recipes", {}) is Dictionary:
			csharp_recipes = raw_cs["recipes"]
		if raw_cs.get("traits", {}) is Dictionary:
			csharp_traits = raw_cs["traits"]
		if raw_cs.get("duplicant_physiology", {}) is Dictionary:
			csharp_physiology = raw_cs["duplicant_physiology"]
		if raw_cs.get("tuning", {}) is Dictionary:
			csharp_tuning = raw_cs["tuning"]

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

static func get_building_cs(id: String) -> Dictionary:
	ensure_loaded()
	return csharp_buildings.get(id, {})

static func get_building_overheat_c(id: String) -> float:
	var cs := get_building_cs(id)
	if cs.is_empty():
		return 9999.0
	return float(cs.get("overheat_c", 9999.0))

static func is_building_floodable(id: String) -> bool:
	var cs := get_building_cs(id)
	if cs.is_empty():
		return false
	return bool(cs.get("floodable", false))

static func get_building_heat_kw(id: String) -> float:
	var cs := get_building_cs(id)
	if cs.is_empty():
		return 0.0
	return float(cs.get("self_heat_kw", 0.0)) + float(cs.get("exhaust_kw", 0.0))

static func get_scalding_c() -> float:
	ensure_loaded()
	return float(csharp_physiology.get("scalding_threshold_c", 72.0))

static func get_hypothermia_c() -> float:
	ensure_loaded()
	return float(csharp_physiology.get("hypothermia_threshold_c", 0.0))

static func get_flood_threshold_kg() -> float:
	ensure_loaded()
	return float(csharp_physiology.get("flood_threshold_kg", 350.0))

static func is_falling_solid(el: String) -> bool:
	return el == "Sand" or el == "Regolith" or el == "Snow" or el == "CrushedIce"

static func get_station_recipes(b_id: String) -> Array:
	ensure_loaded()
	var stations: Dictionary = csharp_recipes.get("stations", {}) as Dictionary
	var arr: Variant = stations.get(b_id, [])
	return arr if arr is Array else []

static func get_geyser_cs(b_id: String) -> Dictionary:
	ensure_loaded()
	var key := "steam"
	if b_id == "geyser_water":
		key = "hot_water"
	elif b_id == "geyser_hydrogen":
		key = "hot_hydrogen"
	return csharp_geysers.get(key, {})

static func get_disease_cs(germ_id: String) -> Dictionary:
	ensure_loaded()
	return csharp_diseases.get(germ_id, {})

static func get_trait_effect(trait_ko: String) -> Dictionary:
	ensure_loaded()
	var effs: Dictionary = csharp_traits.get("trait_effects", {}) as Dictionary
	return effs.get(trait_ko, {})

static func get_morale_expectation(skill_lv: int) -> int:
	ensure_loaded()
	var arr: Array = csharp_traits.get("morale_expectations", [0, 1, 3, 6, 10])
	if arr.is_empty():
		return skill_lv * 2
	return int(arr[clampi(skill_lv, 0, arr.size() - 1)])

static func get_overjoyed_surplus() -> int:
	ensure_loaded()
	return int(csharp_traits.get("overjoyed_morale_surplus", 8))

static func get_lab_research_bonus() -> float:
	ensure_loaded()
	return float(csharp_physiology.get("lab_research_bonus", 0.1))

static func get_crop_ids() -> Array[String]:
	return ["mealwood", "bristle_blossom", "sleet_wheat", "dusk_cap", "pincha_pepper"]

static func get_crop_spec(crop_id: String) -> Dictionary:
	ensure_loaded()
	if csharp_botany.has(crop_id):
		return csharp_botany[crop_id]
	return csharp_botany.get("mealwood", {
		"name_ko": "끼니나무", "min_c": 10.0, "max_c": 30.0, "growth_s": 1800.0,
		"kcal": 600.0, "fert_el": "Dirt", "fert_kg_s": 0.0167, "irrig_el": "", "irrig_kg_s": 0.0,
		"need_light": false, "need_dark": false, "need_gas": "",
	})

static func get_rocket_engine_spec(b_id: String) -> Dictionary:
	ensure_loaded()
	var engs: Dictionary = csharp_rocketry.get("engines", {}) as Dictionary
	return engs.get(b_id, {})

static func get_ranching_spec() -> Dictionary:
	ensure_loaded()
	return csharp_ranching

static func get_env_spec() -> Dictionary:
	ensure_loaded()
	return csharp_env

static func get_decor_morale_bonus(avg_decor: float) -> int:
	ensure_loaded()
	var tiers: Array = csharp_env.get("decor_morale_tiers", [[-999, -1], [0, 0], [30, 1], [60, 3], [90, 6], [120, 12]])
	var res := 0
	for t_v in tiers:
		if t_v is Array and (t_v as Array).size() >= 2:
			if avg_decor >= float((t_v as Array)[0]):
				res = int((t_v as Array)[1])
	return res

static func get_aquatuner_spec() -> Dictionary:
	ensure_loaded()
	return csharp_mechanics.get("aquatuner", {"delta_c": -14.0, "power_w": 1200.0, "overheat_c": 125.0})

static func get_turbine_spec() -> Dictionary:
	ensure_loaded()
	return csharp_mechanics.get("steam_turbine", {"min_steam_c": 125.0, "ideal_steam_c": 200.0, "max_body_c": 100.0, "out_water_c": 95.0, "max_wattage_w": 850.0, "max_steam_kg_s": 2.0, "heat_transfer_frac": 0.1, "self_heat_kw": 4.0})

static func get_element_hardness(el: String) -> int:
	var e := get_element(el)
	if e.is_empty():
		return 10
	return int(e.get("hardness", 10))

static func get_required_mining_tier(el: String) -> int:
	ensure_loaded()
	var h := get_element_hardness(el)
	var hmap: Dictionary = csharp_mechanics.get("hardness", {}) as Dictionary
	var imp := int(hmap.get("IMPENETRABLE", 255))
	var sup := int(hmap.get("SUPER_DUPER_HARD", 200))
	var near := int(hmap.get("NEARLY_IMPENETRABLE", 150))
	var vfirm := int(hmap.get("VERY_FIRM", 50))
	if h >= imp:
		return 99
	if h >= sup:
		return 3
	if h >= near:
		return 2
	if h >= vfirm:
		return 1
	return 0

static func get_wire_max_w(tier: int) -> float:
	ensure_loaded()
	var ratings: Array = csharp_mechanics.get("wire_ratings_w", [500.0, 1000.0, 2000.0, 20000.0, 50000.0])
	if tier >= 3 and ratings.size() > 3:
		return float(ratings[3]) # 20000W Heavi-Watt
	if tier == 2 and ratings.size() > 2:
		return float(ratings[2]) # 2000W Conductive
	return float(ratings[1]) if ratings.size() > 1 else 1000.0

static func get_counts_summary() -> String:
	ensure_loaded()
	var biomes_d: Dictionary = worldgen.get("biomes", {})
	return "원작 추출: 원소 %d · 기술 %d · 바이옴 %d · C#건물 %d" % [elements.size(), techs.size(), biomes_d.size(), csharp_buildings.size()]
