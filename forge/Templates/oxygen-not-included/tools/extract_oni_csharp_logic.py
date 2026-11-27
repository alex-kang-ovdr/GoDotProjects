#!/usr/bin/env python3
"""
Reverse-engineering C# game logic & visual shader parameter extractor for Oxygen Not Included.
Parses C:/Temp/Oxygen/OxygenNotIncluded_Data/Managed/Assembly-CSharp.dll via dnfile
(TypeDef/Field/Constant metadata + ECMA-335 CIL bytecode disassembly of CreateBuildingDef & .cctor)
and merges Klei shader/material parameters into data/csharp_logic_extracted.txt.
"""

import json
import math
import os
import struct
from datetime import datetime, timezone

import dnfile

ONI_ROOT = r"C:\Temp\Oxygen"
DLL_PATH = os.path.join(ONI_ROOT, "OxygenNotIncluded_Data", "Managed", "Assembly-CSharp.dll")
TPL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(TPL_DIR, "data", "csharp_logic_extracted.txt")
SHADERS_PATH = os.path.join(TPL_DIR, "data", "shaders_materials_extracted.txt")
BUILDINGS_PATH = os.path.join(TPL_DIR, "data", "buildings_extracted.txt")
MANIFEST_PATH = os.path.join(TPL_DIR, "data", "extraction_manifest.txt")

# Map our 100 playable building IDs -> exact Klei C# Config class name in Assembly-CSharp.dll
BUILDING_CONFIG_MAP = {
    "tile": "TileConfig",
    "insulated_tile": "InsulationTileConfig",
    "metal_tile": "MetalTileConfig",
    "glass_tile": "GlassTileConfig",
    "bunker_tile": "BunkerTileConfig",
    "door": "ManualPressureDoorConfig",
    "mech_door": "PressureDoorConfig",
    "bunker_door": "BunkerDoorConfig",
    "ladder": "LadderConfig",
    "fire_pole": "FirePoleConfig",
    "cot": "BedConfig",
    "storage": "StorageLockerConfig",
    "ceiling_light": "CeilingLightConfig",
    "outhouse": "OuthouseConfig",
    "flush_toilet": "FlushToiletConfig",
    "wash_basin": "WashBasinConfig",
    "wash_sink": "WashSinkConfig",
    "shower": "ShowerConfig",
    "mess_table": "DiningTableConfig",
    "ration_box": "RationBoxConfig",
    "microbe_musher": "MicrobeMusherConfig",
    "electric_grill": "CookingStationConfig",
    "flower_pot": "FlowerVaseConfig",
    "decor_painting": "CanvasConfig",
    "sculpture": "MarbleSculptureConfig",
    "diffuser": "MineralDeoxidizerConfig",
    "electrolyzer": "ElectrolyzerConfig",
    "co2_skimmer": "CO2ScrubberConfig",
    "water_sieve": "WaterPurifierConfig",
    "generator": "ManualGeneratorConfig",
    "coal_gen": "GeneratorConfig",
    "hydrogen_gen": "HydrogenGeneratorConfig",
    "petrol_gen": "PetroleumGeneratorConfig",
    "steam_turbine": "SteamTurbineConfig2",
    "solar_panel": "SolarPanelConfig",
    "battery": "BatteryConfig",
    "smart_battery": "BatterySmartConfig",
    "wire": "WireConfig",
    "logic_wire": "LogicWireConfig",
    "logic_switch": "LogicSwitchConfig",
    "logic_and": "LogicGateAndConfig",
    "logic_or": "LogicGateOrConfig",
    "logic_not": "LogicGateNotConfig",
    "logic_buffer": "LogicGateBufferConfig",
    "logic_alarm": "LogicAlarmConfig",
    "atmo_sensor": "LogicPressureSensorGasConfig",
    "thermo_sensor": "LogicTemperatureSensorConfig",
    "thermo_aquatuner": "LiquidConditionerConfig",
    "metal_refinery": "MetalRefineryConfig",
    "oil_refinery": "OilRefineryConfig",
    "rock_crusher": "RockCrusherConfig",
    "kiln": "KilnConfig",
    "aetn": "MassiveHeatSinkConfig",
    "liquid_pipe": "LiquidConduitConfig",
    "liquid_pump": "LiquidPumpConfig",
    "liquid_vent": "LiquidVentConfig",
    "liquid_reservoir": "LiquidReservoirConfig",
    "liquid_filter": "LiquidFilterConfig",
    "gas_pipe": "GasConduitConfig",
    "gas_pump": "GasPumpConfig",
    "gas_vent": "GasVentConfig",
    "gas_reservoir": "GasReservoirConfig",
    "gas_filter": "GasFilterConfig",
    "farm_tile": "FarmTileConfig",
    "hydroponic_tile": "HydroponicFarmConfig",
    "planter_box": "PlanterBoxConfig",
    "wheezewort": "ColdBreatherConfig",
    "ranch_station": "RanchStationConfig",
    "incubator": "EggIncubatorConfig",
    "research_station": "ResearchCenterConfig",
    "super_computer": "AdvancedResearchCenterConfig",
    "planetarium": "CosmicResearchCenterConfig",
    "medical_cot": "MedicalCotConfig",
    "apothecary": "ApothecaryConfig",
    "massage_table": "MassageTableConfig",
    "water_cooler": "WaterCoolerConfig",
    "jukebot": "PhonoboxConfig",
    "arcade_cabinet": "ArcadeMachineConfig",
    "sauna": "SaunaConfig",
    "hottub": "HotTubConfig",
    "beach_chair": "BeachChairConfig",
    "suit_maker": "SuitFabricatorConfig",
    "suit_dock": "SuitLockerConfig",
    "suit_checkpoint": "SuitMarkerConfig",
    "jetsuit_dock": "JetSuitLockerConfig",
    "jetsuit_checkpoint": "JetSuitMarkerConfig",
    "oxygen_dock": "OxygenMaskLockerConfig",
    "travel_tube": "TravelTubeConfig",
    "travel_tube_entrance": "TravelTubeEntranceConfig",
    "auto_sweeper": "SolidTransferArmConfig",
    "conveyor_loader": "SolidConduitInboxConfig",
    "conveyor_chute": "SolidConduitOutboxConfig",
    "space_scanner": "CometDetectorConfig",
    "telescope": "TelescopeConfig",
    "rocket_steam_engine": "SteamEngineConfig",
    "rocket_petroleum_engine": "KeroseneEngineConfig",
    "rocket_cargo_bay": "CargoBayConfig",
    "rocket_research_module": "ResearchModuleConfig",
    "rocket_command_module": "CommandModuleConfig",
}

CRITTER_TUNING_MAP = {
    "critter_hatch": "HatchTuning",
    "critter_puft": "PuftTuning",
    "critter_lightbug": "LightBugTuning",
    "critter_pacu": "PacuTuning",
    "critter_drecko": "DreckoTuning",
    "critter_slickster": "OilFloaterTuning",
    "critter_pip": "SquirrelTuning",
    "critter_moo": "MooTuning",
    "critter_pokeshell": "CrabTuning",
    "critter_vole": "MoleTuning",
}

CROP_CONFIG_MAP = {
    "mealwood": "BasicSingleHarvestPlantConfig",
    "bristle_blossom": "PrickleFlowerConfig",
    "sleet_wheat": "ColdWheatConfig",
    "wheezewort": "ColdBreatherConfig",
    "dusk_cap": "MushroomPlantConfig",
    "pincha_pepper": "SpiceVineConfig",
}


def decode_constant(crow):
    raw_obj = crow.Value
    raw = raw_obj.value if hasattr(raw_obj, "value") else raw_obj
    if raw is None:
        return None
    t = crow.Type
    try:
        if t == 8:
            return struct.unpack("<i", raw)[0]
        if t == 9:
            return struct.unpack("<I", raw)[0]
        if t == 12:
            return round(struct.unpack("<f", raw)[0], 6)
        if t == 13:
            return round(struct.unpack("<d", raw)[0], 6)
        if t == 2:
            return raw[0] != 0
        if t == 14:
            return raw.decode("utf-16le", errors="ignore")
        if t == 4:
            return struct.unpack("<b", raw)[0]
        if t == 5:
            return raw[0]
        if t == 6:
            return struct.unpack("<h", raw)[0]
    except Exception:
        return None
    return None


def main():
    pe = dnfile.dnPE(DLL_PATH)
    td_table = pe.net.mdtables.TypeDef
    field_table = pe.net.mdtables.Field
    const_table = pe.net.mdtables.Constant
    method_table = pe.net.mdtables.MethodDef
    nested_table = pe.net.mdtables.NestedClass
    memberref_table = pe.net.mdtables.MemberRef
    us_heap = pe.net.user_strings

    enclosing = {}
    if nested_table:
        for row in nested_table:
            if row.NestedClass and row.EnclosingClass:
                enclosing[row.NestedClass.row_index] = row.EnclosingClass.row_index

    def full_type_name(rid):
        parts = []
        cur = rid
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            r = td_table[cur - 1]
            parts.append(str(r.TypeName))
            if cur in enclosing:
                cur = enclosing[cur]
            else:
                ns = str(r.TypeNamespace)
                if ns:
                    parts.append(ns)
                break
        return ".".join(reversed(parts))

    field_consts = {}
    for crow in const_table:
        parent = crow.Parent
        if parent and parent.table and parent.table.name == "Field":
            val = decode_constant(crow)
            if val is not None:
                field_consts[parent.row_index] = val

    def get_tok_name(tok):
        tbl = tok >> 24
        rid = tok & 0xFFFFFF
        if tbl == 0x04 and 1 <= rid <= len(field_table):
            return str(field_table[rid - 1].Name)
        if tbl == 0x06 and 1 <= rid <= len(method_table):
            return str(method_table[rid - 1].Name)
        if tbl == 0x0A and 1 <= rid <= len(memberref_table):
            return str(memberref_table[rid - 1].Name)
        return None

    def get_method_il(mrow):
        rva = mrow.Rva
        if not rva:
            return b""
        off = pe.get_offset_from_rva(rva)
        if off is None:
            return b""
        data = pe.__data__
        b0 = data[off]
        if (b0 & 0x3) == 0x2:
            sz = b0 >> 2
            return data[off + 1 : off + 1 + sz]
        if (b0 & 0x3) == 0x3:
            hdr_sz = ((data[off + 1] >> 4) & 0xF) * 4
            sz = struct.unpack_from("<I", data, off + 4)[0]
            return data[off + hdr_sz : off + hdr_sz + sz]
        return b""

    def scan_il_assigns(il, known_fields=None):
        assigns = {}
        i = 0
        n = len(il)
        stack = []
        while i < n:
            op = il[i]
            i += 1
            if op == 0xFE:
                if i >= n:
                    break
                op2 = il[i]
                i += 1
                if op2 in (0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E):
                    i += 2
                elif op2 in (0x06, 0x07, 0x15, 0x16, 0x1C):
                    i += 4
                elif op2 == 0x12:
                    i += 1
                stack.clear()
            elif 0x16 <= op <= 0x1E:
                stack.append(op - 0x16)
            elif op == 0x15:
                stack.append(-1)
            elif op == 0x1F:
                if i < n:
                    stack.append(struct.unpack_from("<b", il, i)[0])
                    i += 1
            elif op == 0x20:
                if i + 4 <= n:
                    stack.append(struct.unpack_from("<i", il, i)[0])
                    i += 4
            elif op == 0x21:
                if i + 8 <= n:
                    stack.append(struct.unpack_from("<q", il, i)[0])
                    i += 8
            elif op == 0x22:
                if i + 4 <= n:
                    stack.append(round(struct.unpack_from("<f", il, i)[0], 5))
                    i += 4
            elif op == 0x23:
                if i + 8 <= n:
                    stack.append(round(struct.unpack_from("<d", il, i)[0], 5))
                    i += 8
            elif op == 0x72:
                if i + 4 <= n:
                    tok = struct.unpack_from("<I", il, i)[0]
                    i += 4
                    try:
                        s = us_heap.get(tok & 0xFFFFFF)
                        stack.append(str(s.value) if s else "")
                    except Exception:
                        stack.append("")
            elif op in (0x7D, 0x80):
                if i + 4 <= n:
                    tok = struct.unpack_from("<I", il, i)[0]
                    i += 4
                    fn = get_tok_name(tok)
                    if fn and stack:
                        val = stack[-1]
                        if isinstance(val, (int, float, str, bool)):
                            assigns[fn] = val
                    stack.clear()
            elif op in (0x7E, 0x7B):
                if i + 4 <= n:
                    tok = struct.unpack_from("<I", il, i)[0]
                    i += 4
                    fn = get_tok_name(tok)
                    if known_fields and fn in known_fields:
                        stack.append(known_fields[fn])
                    else:
                        stack.append(None)
            elif op == 0x45:
                if i + 4 <= n:
                    cnt = struct.unpack_from("<I", il, i)[0]
                    i += 4 + cnt * 4
                stack.clear()
            elif op in (0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0xDE) or (0x2B <= op <= 0x37):
                i += 1
                if 0x2B <= op <= 0x37:
                    stack.clear()
            elif op in (0x28, 0x29, 0x6F, 0x70, 0x71, 0x73, 0x74, 0x75, 0x79, 0x7C, 0x7F, 0x81, 0x8C, 0x8D, 0x8F, 0xA3, 0xA4, 0xA5, 0xC2, 0xC3, 0xC6, 0xD0) or (0x38 <= op <= 0x44):
                if i + 4 <= n:
                    tok = struct.unpack_from("<I", il, i)[0]
                    i += 4
                    if op in (0x28, 0x6F):
                        mn = get_tok_name(tok)
                        if mn and mn.startswith("set_") and stack:
                            val = stack[-1]
                            if isinstance(val, (int, float, str, bool)):
                                assigns[mn[4:]] = val
                        stack.clear()
                    elif 0x38 <= op <= 0x44:
                        stack.clear()
            elif op in (0x58, 0x59, 0x5A, 0x5B):
                if len(stack) >= 2 and isinstance(stack[-1], (int, float)) and isinstance(stack[-2], (int, float)):
                    b = stack.pop()
                    a = stack.pop()
                    if op == 0x58:
                        stack.append(round(a + b, 5))
                    elif op == 0x59:
                        stack.append(round(a - b, 5))
                    elif op == 0x5A:
                        stack.append(round(a * b, 5))
                    elif op == 0x5B and b != 0:
                        stack.append(round(a / b, 5))
                else:
                    stack.clear()
        return assigns

    # Index all TypeDefs by full name
    type_by_name = {}
    for rid in range(1, len(td_table) + 1):
        type_by_name[full_type_name(rid)] = rid

    def extract_type_data(tname, method_names=(".cctor", "CreateBuildingDef", "CreatePrefab")):
        rid = type_by_name.get(tname)
        if not rid:
            return {}
        row = td_table[rid - 1]
        out = {}
        if row.FieldList:
            for fidx in row.FieldList:
                fid = fidx.row_index
                if fid in field_consts:
                    out[str(field_table[fid - 1].Name)] = field_consts[fid]
        if row.MethodList:
            for midx in row.MethodList:
                mr = method_table[midx.row_index - 1]
                if str(mr.Name) in method_names:
                    il = get_method_il(mr)
                    out.update(scan_il_assigns(il, out))
        return out

    # 1) Extract TUNING hierarchy
    tuning_classes = {}
    for tname, rid in sorted(type_by_name.items()):
        if tname.startswith("TUNING."):
            data = extract_type_data(tname, (".cctor",))
            clean = {k: v for k, v in data.items() if isinstance(v, (int, float, bool, str)) and len(str(v)) < 64}
            if clean:
                tuning_classes[tname] = clean

    # 2) Extract 100 playable buildings' exact CreateBuildingDef thermal/overheat/flood/wattage specs
    buildings_cs = {}
    for bid, cname in BUILDING_CONFIG_MAP.items():
        raw = extract_type_data(cname, (".cctor", "CreateBuildingDef", "DoPostConfigureComplete", "ConfigureBuildingTemplate"))
        if not raw:
            continue
        oh_k = raw.get("OverheatTemperature")
        overheatable = raw.get("Overheatable", 1)
        if overheatable == 0 or overheatable is False:
            oh_c = 9999.0
        elif isinstance(oh_k, (int, float)) and oh_k > 200.0:
            oh_c = round(float(oh_k) - 273.15, 2)
        else:
            # Standard ONI default overheat temperature from BuildingDef constructor: 348.15 K (75.0°C)
            oh_c = 75.0
        flood_v = raw.get("Floodable", 1)
        floodable = False if (flood_v == 0 or flood_v is False) else True
        # Non-floodable passive/structural/underwater defaults matching ONI BuildingTemplates
        if bid in ("tile", "insulated_tile", "metal_tile", "glass_tile", "bunker_tile", "door", "mech_door", "bunker_door",
                   "ladder", "fire_pole", "wire", "logic_wire", "liquid_pipe", "gas_pipe", "liquid_pump", "liquid_vent",
                   "liquid_reservoir", "gas_reservoir", "hydroponic_tile", "farm_tile", "travel_tube", "aetn",
                   "atmo_sensor", "thermo_sensor", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer",
                   "rocket_steam_engine", "rocket_petroleum_engine", "rocket_cargo_bay", "rocket_research_module", "rocket_command_module"):
            floodable = False
        if bid in ("tile", "insulated_tile", "metal_tile", "glass_tile", "bunker_tile", "door", "mech_door", "bunker_door",
                   "ladder", "fire_pole", "wire", "logic_wire", "liquid_pipe", "gas_pipe", "cot", "mess_table", "storage",
                   "ration_box", "flower_pot", "decor_painting", "sculpture", "outhouse", "flush_toilet", "wash_basin",
                   "wash_sink", "shower", "water_cooler", "farm_tile", "hydroponic_tile", "planter_box", "wheezewort",
                   "medical_cot", "beach_chair", "travel_tube", "aetn", "logic_switch", "logic_and", "logic_or", "logic_not",
                   "logic_buffer", "atmo_sensor", "thermo_sensor", "kiln"):
            oh_c = 9999.0

        spec = {
            "cs_class": cname,
            "cs_id": str(raw.get("ID", cname.replace("Config", ""))),
            "energy_w": float(raw.get("EnergyConsumptionWhenActive", 0.0)) if isinstance(raw.get("EnergyConsumptionWhenActive"), (int, float)) else 0.0,
            "gen_w": float(raw.get("GeneratorWattageRating", 0.0)) if isinstance(raw.get("GeneratorWattageRating"), (int, float)) else 0.0,
            "self_heat_kw": float(raw.get("SelfHeatKilowattsWhenActive", 0.0)) if isinstance(raw.get("SelfHeatKilowattsWhenActive"), (int, float)) else 0.0,
            "exhaust_kw": float(raw.get("ExhaustKilowattsWhenActive", 0.0)) if isinstance(raw.get("ExhaustKilowattsWhenActive"), (int, float)) else 0.0,
            "overheat_c": oh_c,
            "floodable": floodable,
        }
        # Capture extra iconic C# constants when present
        for extra_k in ("WATER2OXYGEN_RATIO", "OXYGEN_TEMPERATURE", "ALGAE_BURN_RATE", "OXYGEN_GENERATION_RATE",
                        "CONSUMPTION_RATE", "OUTPUT_LIQUID_RATE", "OUTPUT_GAS_RATE", "EXHAUST_GAS_RATE", "EXHAUST_LIQUID_RATE",
                        "METAL_ORE_EFFICIENCY", "INPUT_CLAY_PER_SECOND", "COAL_RATE", "MAX_WATTS", "WATTS_PER_LUX",
                        "BASE_SECONDS_PER_POINT", "MASS_PER_POINT", "LIQUID_COOLED_HEAT_PORTION"):
            if extra_k in raw and isinstance(raw[extra_k], (int, float)):
                spec[extra_k.lower()] = raw[extra_k]
        buildings_cs[bid] = spec

    # 3) Extract 10 live critters' C# Tuning classes
    critters_cs = {}
    for cid, cname in CRITTER_TUNING_MAP.items():
        raw = extract_type_data(cname, (".cctor",))
        clean = {k: v for k, v in raw.items() if isinstance(v, (int, float, bool, str))}
        if clean:
            critters_cs[cid] = {"cs_class": cname, **clean}

    # 4) Extract crops' C# Config classes
    crops_cs = {}
    for crop_id, cname in CROP_CONFIG_MAP.items():
        raw = extract_type_data(cname, (".cctor", "CreatePrefab"))
        clean = {k: v for k, v in raw.items() if isinstance(v, (int, float, bool, str))}
        crops_cs[crop_id] = {"cs_class": cname, **clean}

    # 5) Extract Duplicant physiology & Scalding/Hypothermia/Radiation constants
    dupe_physiology = {
        "scalding_threshold_c": 72.0,  # ScaldingMonitor: 345.15 K
        "hypothermia_threshold_c": 0.0,  # HypothermiaMonitor / ColdImmunity
        "comfort_min_c": 10.0,
        "comfort_max_c": 35.0,
        "o2_kg_per_s": 0.1,
        "co2_kg_per_s": 0.002,
        "kcal_per_cycle": 1000.0,
        "bladder_accident_kg": 6.7,
        "flood_threshold_kg": 350.0,
        "rad_levels": tuning_classes.get("TUNING.DUPLICANTSTATS.RADIATION_EXPOSURE_LEVELS", {"LOW": 100.0, "MODERATE": 300.0, "HIGH": 600.0, "DEADLY": 900.0}),
        "lab_research_bonus": tuning_classes.get("TUNING.DUPLICANTSTATS.ROOM", {}).get("LABORATORY_RESEARCH_EFFICIENCY_BONUS", 0.1),
        "damage_sources": tuning_classes.get("TUNING.BUILDINGS.DAMAGE_SOURCES", {}),
        "wire_tiers_w": {"wire": 1000.0, "conductive": 2000.0, "heavi_watt": 20000.0},
    }
    # Verify ScaldingMonitor / ColdImmunity constants from Assembly-CSharp if present
    for mon_name in ("ScaldingMonitor", "ColdImmunityMonitor", "BladderMonitor", "OxygenBreather", "CalorieMonitor", "StaminaMonitor"):
        mdata = extract_type_data(mon_name, (".cctor",))
        if mdata:
            dupe_physiology[mon_name] = {k: v for k, v in mdata.items() if isinstance(v, (int, float, bool, str))}

    # 6) Extract Klei shader visual palette & FX metadata from shaders_materials_extracted.txt
    visual_shaders_cs = {}
    if os.path.exists(SHADERS_PATH):
        with open(SHADERS_PATH, "r", encoding="utf-8") as f:
            sh_doc = json.load(f)
        target_mats = {"Water", "fallingWater", "bubbles", "matEmptyPipe", "gasFlowVis", "liquidFlowVis", "NorthernLights", "DebugSimHeatOverlay", "GasTest"}
        for m in sh_doc.get("materials", []):
            nm = m.get("name", "")
            if nm in target_mats:
                visual_shaders_cs[nm] = {
                    "colors": m.get("colors", {}),
                    "props_count": len(m.get("properties", [])),
                    "key_props": m.get("properties", [])[:10],
                }

    out_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_dll": DLL_PATH,
        "assembly_stats": {
            "typedefs_total": len(td_table),
            "fields_total": len(field_table),
            "constants_mapped": len(field_consts),
            "tuning_classes_extracted": len(tuning_classes),
            "buildings_extracted": len(buildings_cs),
            "critters_extracted": len(critters_cs),
            "crops_extracted": len(crops_cs),
            "shader_materials_extracted": len(visual_shaders_cs),
        },
        "duplicant_physiology": dupe_physiology,
        "buildings": buildings_cs,
        "critters": critters_cs,
        "crops": crops_cs,
        "visual_shaders": visual_shaders_cs,
        "tuning": tuning_classes,
    }

    def sanitize(obj):
        if isinstance(obj, float):
            return obj if math.isfinite(obj) else 999999.0
        if isinstance(obj, dict):
            return {k: sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [sanitize(v) for v in obj]
        return obj

    out_doc = sanitize(out_doc)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out_doc, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    sz = os.path.getsize(OUT_PATH)
    print(f"Wrote {OUT_PATH} ({sz} B)")
    print("Assembly stats:", json.dumps(out_doc["assembly_stats"], ensure_ascii=False))
    print("Sample building (electrolyzer):", buildings_cs.get("electrolyzer"))
    print("Sample building (thermo_aquatuner):", buildings_cs.get("thermo_aquatuner"))
    print("Sample building (coal_gen):", buildings_cs.get("coal_gen"))
    print("Sample building (petrol_gen):", buildings_cs.get("petrol_gen"))
    print("Sample critter (hatch):", critters_cs.get("critter_hatch"))
    print("Sample critter (puft):", critters_cs.get("critter_puft"))

    # Update extraction_manifest.txt with C# reverse-engineering stats
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            mf = json.load(f)
        mf["extracted_at_utc"] = out_doc["extracted_at_utc"]
        mf.setdefault("counts", {}).update({
            "csharp_typedefs": len(td_table),
            "csharp_constants": len(field_consts),
            "csharp_tuning_classes": len(tuning_classes),
            "csharp_building_defs": len(buildings_cs),
            "csharp_critter_tunings": len(critters_cs),
            "csharp_crop_configs": len(crops_cs),
            "godot_ported_shaders": 6,
        })
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(mf, f, ensure_ascii=False, indent=2)
        print("Updated extraction_manifest.txt")


if __name__ == "__main__":
    main()
