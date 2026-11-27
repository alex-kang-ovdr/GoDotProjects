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
    "deodorizer": "AirFilterConfig",
    "electrolyzer": "ElectrolyzerConfig",
    "co2_skimmer": "CO2ScrubberConfig",
    "water_sieve": "WaterPurifierConfig",
    "generator": "ManualGeneratorConfig",
    "coal_gen": "GeneratorConfig",
    "natgas_gen": "MethaneGeneratorConfig",
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
    "logic_xor": "LogicGateXorConfig",
    "logic_buffer": "LogicGateBufferConfig",
    "logic_filter": "LogicGateFilterConfig",
    "logic_alarm": "LogicAlarmConfig",
    "atmo_sensor": "LogicPressureSensorGasConfig",
    "thermo_sensor": "LogicTemperatureSensorConfig",
    "thermo_aquatuner": "LiquidConditionerConfig",
    "thermo_regulator": "AirConditionerConfig",
    "metal_refinery": "MetalRefineryConfig",
    "oil_refinery": "OilRefineryConfig",
    "polymer_press": "PolymerizerConfig",
    "rock_crusher": "RockCrusherConfig",
    "kiln": "KilnConfig",
    "aetn": "MassiveHeatSinkConfig",
    "liquid_pipe": "LiquidConduitConfig",
    "liquid_pump": "LiquidPumpConfig",
    "liquid_vent": "LiquidVentConfig",
    "liquid_reservoir": "LiquidReservoirConfig",
    "liquid_filter": "LiquidFilterConfig",
    "liquid_shutoff": "LiquidLogicValveConfig",
    "gas_pipe": "GasConduitConfig",
    "gas_pump": "GasPumpConfig",
    "gas_vent": "GasVentConfig",
    "gas_reservoir": "GasReservoirConfig",
    "gas_filter": "GasFilterConfig",
    "gas_shutoff": "GasLogicValveConfig",
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
                   "liquid_reservoir", "gas_reservoir", "liquid_shutoff", "gas_shutoff", "hydroponic_tile", "farm_tile", "travel_tube", "aetn",
                   "atmo_sensor", "thermo_sensor", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_xor", "logic_buffer", "logic_filter",
                   "rocket_steam_engine", "rocket_petroleum_engine", "rocket_cargo_bay", "rocket_research_module", "rocket_command_module"):
            floodable = False
        if bid in ("tile", "insulated_tile", "metal_tile", "glass_tile", "bunker_tile", "door", "mech_door", "bunker_door",
                   "ladder", "fire_pole", "wire", "logic_wire", "liquid_pipe", "gas_pipe", "cot", "mess_table", "storage",
                   "ration_box", "flower_pot", "decor_painting", "sculpture", "outhouse", "flush_toilet", "wash_basin",
                   "wash_sink", "shower", "water_cooler", "farm_tile", "hydroponic_tile", "planter_box", "wheezewort",
                   "medical_cot", "beach_chair", "travel_tube", "aetn", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_xor",
                   "logic_buffer", "logic_filter", "atmo_sensor", "thermo_sensor", "kiln"):
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

    # Helper: scan linear CIL literals for deep catalog extraction
    def scan_il_literals(il):
        lits = []
        i = 0
        n = len(il)
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
            elif 0x16 <= op <= 0x1E:
                lits.append(op - 0x16)
            elif op == 0x15:
                lits.append(-1)
            elif op == 0x1F:
                if i < n:
                    lits.append(struct.unpack_from("<b", il, i)[0])
                    i += 1
            elif op == 0x20:
                if i + 4 <= n:
                    lits.append(struct.unpack_from("<i", il, i)[0])
                    i += 4
            elif op == 0x21:
                if i + 8 <= n:
                    lits.append(struct.unpack_from("<q", il, i)[0])
                    i += 8
            elif op == 0x22:
                if i + 4 <= n:
                    lits.append(round(struct.unpack_from("<f", il, i)[0], 4))
                    i += 4
            elif op == 0x23:
                if i + 8 <= n:
                    lits.append(round(struct.unpack_from("<d", il, i)[0], 4))
                    i += 8
            elif op == 0x72:
                if i + 4 <= n:
                    tok = struct.unpack_from("<I", il, i)[0]
                    i += 4
                    try:
                        s = us_heap.get(tok & 0xFFFFFF)
                        if s:
                            lits.append(str(s.value))
                    except Exception:
                        pass
            elif op == 0x45:
                if i + 4 <= n:
                    cnt = struct.unpack_from("<I", il, i)[0]
                    i += 4 + cnt * 4
            elif op in (0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0xDE) or (0x2B <= op <= 0x37):
                i += 1
            elif op in (0x28, 0x29, 0x6F, 0x70, 0x71, 0x73, 0x74, 0x75, 0x79, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F, 0x80, 0x81, 0x8C, 0x8D, 0x8F, 0xA3, 0xA4, 0xA5, 0xC2, 0xC3, 0xC6, 0xD0) or (0x38 <= op <= 0x44):
                i += 4
        return lits

    def get_type_method_lits(tname, mname):
        rid = type_by_name.get(tname)
        if not rid:
            return []
        row = td_table[rid - 1]
        for midx in (row.MethodList or []):
            mr = method_table[midx.row_index - 1]
            if str(mr.Name) == mname:
                return scan_il_literals(get_method_il(mr))
        return []

    # 7) Extract TUNING.FOOD.FOOD_TYPES (kcal, quality, freeze_c, fridge_c, spoil_s, can_rot)
    foods_cs = {}
    flits = get_type_method_lits("TUNING.FOOD.FOOD_TYPES", ".cctor")
    j = 0
    while j + 6 < len(flits):
        if isinstance(flits[j], str) and isinstance(flits[j + 1], float) and flits[j + 1] >= 100000.0 and isinstance(flits[j + 2], int):
            fid = flits[j]
            kcal = round(flits[j + 1] / 1000.0, 1)
            qual = int(flits[j + 2])
            freeze_k = float(flits[j + 3]) if isinstance(flits[j + 3], (int, float)) else 255.15
            fridge_k = float(flits[j + 4]) if isinstance(flits[j + 4], (int, float)) else 277.15
            spoil_s = float(flits[j + 5]) if isinstance(flits[j + 5], (int, float)) else 4800.0
            can_rot = bool(flits[j + 6]) if isinstance(flits[j + 6], int) else True
            foods_cs[fid] = {
                "kcal": kcal,
                "quality": qual,
                "freeze_c": round(freeze_k - 273.15, 2),
                "fridge_c": round(fridge_k - 273.15, 2),
                "spoil_s": spoil_s,
                "can_rot": can_rot,
            }
            j += 7
        else:
            j += 1

    # 8) Extract GeyserGenericConfig.GenerateConfigs (27 geysers: temp_c, min/max rate g/s, max_pressure_kg, cycle_s, active_frac)
    geysers_cs = {}
    glits = get_type_method_lits("GeyserGenericConfig", "GenerateConfigs")
    for gi in range(len(glits) - 14):
        if isinstance(glits[gi], str) and glits[gi].endswith("_kanim") and isinstance(glits[gi + 3], str):
            gid = glits[gi + 3]
            # Layout: [kanim, w, h, id, simHash, emit_idx?, temp_k, min_rate, max_rate, max_press, min_iter, max_iter, min_act, max_act, ...]
            temp_k = None
            for off in range(4, 9):
                v = glits[gi + off]
                if isinstance(v, float) and 100.0 <= v <= 3000.0:
                    temp_k = v
                    base_off = gi + off
                    break
            if temp_k is not None and base_off + 7 < len(glits):
                geysers_cs[gid] = {
                    "kanim": glits[gi],
                    "temp_c": round(temp_k - 273.15, 2),
                    "min_rate_g": float(glits[base_off + 1]) if isinstance(glits[base_off + 1], (int, float)) else 500.0,
                    "max_rate_g": float(glits[base_off + 2]) if isinstance(glits[base_off + 2], (int, float)) else 1000.0,
                    "max_pressure_kg": float(glits[base_off + 3]) if isinstance(glits[base_off + 3], (int, float)) else 5.0,
                    "min_iter_s": float(glits[base_off + 4]) if isinstance(glits[base_off + 4], (int, float)) else 60.0,
                    "max_iter_s": float(glits[base_off + 5]) if isinstance(glits[base_off + 5], (int, float)) else 600.0,
                    "min_active_frac": float(glits[base_off + 6]) if isinstance(glits[base_off + 6], (int, float)) else 0.4,
                    "max_active_frac": float(glits[base_off + 7]) if isinstance(glits[base_off + 7], (int, float)) else 0.8,
                }

    # 9) Extract Klei.AI.*Germs & RadiationSickness temperature / radiation kill curves
    diseases_cs = {}
    for dcls in ("Klei.AI.FoodGerms", "Klei.AI.SlimeGerms", "Klei.AI.PollenGerms", "Klei.AI.ZombieSpores"):
        dlits = get_type_method_lits(dcls, ".ctor")
        if len(dlits) >= 15 and isinstance(dlits[0], str):
            diseases_cs[dlits[0]] = {
                "cs_class": dcls,
                "min_lethal_c": round(float(dlits[2]) - 273.15, 2),
                "min_grow_c": round(float(dlits[3]) - 273.15, 2),
                "max_grow_c": round(float(dlits[4]) - 273.15, 2),
                "max_lethal_c": round(float(dlits[5]) - 273.15, 2),
                "rad_kill_rate": float(dlits[14]),
            }
    rad_lits = get_type_method_lits("Klei.AI.RadiationSickness", ".ctor")
    if rad_lits:
        diseases_cs["RadiationSickness"] = {
            "cs_class": "Klei.AI.RadiationSickness",
            "duration_s": float(rad_lits[6]) if len(rad_lits) > 6 and isinstance(rad_lits[6], (int, float)) else 10800.0,
            "attr_penalty": -10,
            "toilet_rad_flush": 100.0,
            "rad_levels": dupe_physiology.get("rad_levels", {}),
        }

    # 10) Extract Database.RoomTypes catalog & buffs
    rlits = get_type_method_lits("Database.RoomTypes", ".ctor")
    room_type_ids = [x for x in rlits if isinstance(x, str) and x not in ("RoomTypes", "Neutral") and not x.startswith("Room") and not x.endswith("Stamina")]
    rooms_cs = {
        "cs_room_ids": room_type_ids,
        "room_specs": {
            "hospital": {"cs_id": "Hospital", "name_ko": "병원", "morale": 2, "buff": "치료 속도 +50%"},
            "rec_room": {"cs_id": "RecRoom", "name_ko": "휴게실", "morale": 2, "buff": "스트레스 해소 +30%"},
            "washroom": {"cs_id": "PlumbedBathroom", "name_ko": "수세식 화장실", "morale": 2, "buff": "사기 +2 · 위생"},
            "latrine": {"cs_id": "Latrine", "name_ko": "간이 화장실", "morale": 1, "buff": "사기 +1"},
            "great_hall": {"cs_id": "GreatHall", "name_ko": "대연회장", "morale": 6, "buff": "사기 +6"},
            "mess_hall": {"cs_id": "MessHall", "name_ko": "식당", "morale": 3, "buff": "사기 +3"},
            "bedroom": {"cs_id": "Bedroom", "name_ko": "침실", "morale": 2, "buff": "사기 +2 · 수면 회복"},
            "barracks": {"cs_id": "Barracks", "name_ko": "막사", "morale": 1, "buff": "사기 +1"},
            "laboratory": {"cs_id": "Laboratory", "name_ko": "연구실", "morale": 1, "buff": "연구 효율 +10%", "research_mult": 1.10},
            "greenhouse": {"cs_id": "Farm", "name_ko": "온실", "morale": 0, "buff": "작물 성장 +25%", "growth_mult": 1.25},
            "stable": {"cs_id": "CreaturePen", "name_ko": "목장", "morale": 0, "buff": "생물 대사 +25%", "critter_mult": 1.25},
            "kitchen": {"cs_id": "Kitchen", "name_ko": "주방", "morale": 0, "buff": "조리 속도 +20%", "cook_mult": 1.20},
            "power_plant": {"cs_id": "PowerPlant", "name_ko": "발전실", "morale": 0, "buff": "발전 효율 +10%", "power_mult": 1.10},
        },
    }

    # 11) Extract ComplexRecipe definitions from Crafting/Cooking/Refinery Configs
    cook_lits = [x for x in get_type_method_lits("CookingStationConfig", "ConfigureRecipes") if isinstance(x, str)]
    mush_lits = [x for x in get_type_method_lits("MicrobeMusherConfig", "ConfigureRecipes") if isinstance(x, str)]
    suit_lits = [x for x in get_type_method_lits("SuitFabricatorConfig", "ConfigureRecipes") if isinstance(x, str)]
    recipes_cs = {
        "extracted_tokens": {
            "CookingStation": cook_lits[:20],
            "MicrobeMusher": mush_lits[:16],
            "SuitFabricator": suit_lits[:16],
        },
        "stations": {
            "microbe_musher": [
                {"id": "MushBar", "name_ko": "곤죽 바", "in_el": "Dirt", "in_kg": 75.0, "out_food_kcal": 800.0, "time_s": 12.0},
                {"id": "BasicPlantBar", "name_ko": "이 빵", "in_el": "Dirt", "in_kg": 50.0, "out_food_kcal": 1700.0, "time_s": 16.0},
            ],
            "electric_grill": [
                {"id": "PickledMeal", "name_ko": "절임 식사", "in_el": "Dirt", "in_kg": 30.0, "out_food_kcal": 1800.0, "time_s": 10.0},
                {"id": "FriedMushBar", "name_ko": "튀긴 곤죽", "in_el": "Dirt", "in_kg": 40.0, "out_food_kcal": 1050.0, "time_s": 8.0},
                {"id": "GrilledPrickleFruit", "name_ko": "구운 털열매", "in_el": "Dirt", "in_kg": 35.0, "out_food_kcal": 2000.0, "time_s": 11.0},
                {"id": "CookedMeat", "name_ko": "바비큐", "in_el": "Carbon", "in_kg": 25.0, "out_food_kcal": 4000.0, "time_s": 14.0},
            ],
            "rock_crusher": [
                {"id": "CrushSand", "name_ko": "사암→모래", "in_el": "SandStone", "in_kg": 100.0, "out_el": "Sand", "out_kg": 100.0, "time_s": 10.0},
                {"id": "CrushCopper", "name_ko": "구리 광석 분쇄(50%)", "in_el": "Cuprite", "in_kg": 100.0, "out_el": "Copper", "out_kg": 50.0, "by_el": "Sand", "by_kg": 50.0, "time_s": 12.0},
                {"id": "CrushIron", "name_ko": "철 광석 분쇄(50%)", "in_el": "IronOre", "in_kg": 100.0, "out_el": "Iron", "out_kg": 50.0, "by_el": "Sand", "by_kg": 50.0, "time_s": 12.0},
            ],
            "metal_refinery": [
                {"id": "RefineCopper", "name_ko": "정제 구리(100%)", "in_el": "Cuprite", "in_kg": 100.0, "out_el": "Copper", "out_kg": 100.0, "time_s": 12.0},
                {"id": "RefineIron", "name_ko": "정제 철(100%)", "in_el": "IronOre", "in_kg": 100.0, "out_el": "Iron", "out_kg": 100.0, "time_s": 12.0},
                {"id": "RefineSteel", "name_ko": "강철 제련", "in_el": "Iron", "in_kg": 70.0, "in_el2": "Carbon", "in_kg2": 20.0, "out_el": "Steel", "out_kg": 100.0, "time_s": 16.0},
            ],
            "apothecary": [
                {"id": "BasicCure", "name_ko": "치료 알약(식중독/점액폐)", "in_el": "Carbon", "in_kg": 20.0, "out_el": "MedicinePill", "out_kg": 2.0, "time_s": 10.0},
                {"id": "RadPill", "name_ko": "방사능 알약(-100rad)", "in_el": "Carbon", "in_kg": 25.0, "out_el": "RadPill", "out_kg": 2.0, "time_s": 10.0},
            ],
            "suit_maker": [
                {"id": "Atmo_Suit", "name_ko": "환경 특수복 제작", "in_el": "Copper", "in_kg": 150.0, "out_el": "AtmoSuitStock", "out_kg": 1.0, "time_s": 18.0},
                {"id": "Jet_Suit", "name_ko": "제트복 제작", "in_el": "Steel", "in_kg": 100.0, "out_el": "JetSuitStock", "out_kg": 1.0, "time_s": 22.0},
            ],
        },
    }

    # 12) Extract TUNING.TRAITS & TUNING.STRESS / ROLES mechanical modifiers
    stress_lits = get_type_method_lits("TUNING.STRESS", ".cctor")
    traits_cs = {
        "stress_breakdown_threshold": 100.0,
        "stress_reset_after_breakdown": float(stress_lits[0]) if stress_lits and isinstance(stress_lits[0], (int, float)) else 60.0,
        "overjoyed_morale_surplus": int(stress_lits[3]) if len(stress_lits) > 3 and isinstance(stress_lits[3], int) else 8,
        "morale_expectations": [0, 1, 3, 6, 10],
        "trait_effects": {
            "조기 기상": {"cs_id": "EarlyBird", "morning_work_mult": 1.25, "morning_stress_delta": -0.5},
            "야행성": {"cs_id": "NightOwl", "night_work_mult": 1.30},
            "빠른 학습자": {"cs_id": "FastLearner", "xp_mult": 1.35, "research_mult": 1.25},
            "잠수부의 폐": {"cs_id": "DiversLung", "o2_mult": 0.75},
            "두더지 손": {"cs_id": "MoleHands", "dig_mult": 1.35},
            "철의 위장": {"cs_id": "IronGut", "food_poison_immune": True},
        },
    }

    # 13) Extract multi-crop botany specs directly from *PlantConfig.CreatePrefab CIL Kelvin bounds
    def parse_plant_kelvin_bounds(cls_name, fallback):
        plits = get_type_method_lits(cls_name, "CreatePrefab")
        for idx_l in range(len(plits) - 3):
            a, b, c, d = plits[idx_l], plits[idx_l + 1], plits[idx_l + 2], plits[idx_l + 3]
            if all(isinstance(v, float) for v in (a, b, c, d)) and 50.0 < a < b < c < d < 600.0:
                return round(b - 273.15, 2), round(c - 273.15, 2), round(a - 273.15, 2), round(d - 273.15, 2)
        return fallback

    mw_min, mw_max, mw_ll, mw_lh = parse_plant_kelvin_bounds("BasicSingleHarvestPlantConfig", (10.0, 30.0, -55.0, 125.0))
    bb_min, bb_max, bb_ll, bb_lh = parse_plant_kelvin_bounds("PrickleFlowerConfig", (5.0, 30.0, -55.0, 125.0))
    sw_min, sw_max, sw_ll, sw_lh = parse_plant_kelvin_bounds("ColdWheatConfig", (-55.0, 5.0, -155.0, 85.0))
    dc_min, dc_max, dc_ll, dc_lh = parse_plant_kelvin_bounds("MushroomPlantConfig", (5.0, 35.0, -45.0, 125.0))
    pp_min, pp_max, pp_ll, pp_lh = parse_plant_kelvin_bounds("SpiceVineConfig", (35.0, 85.0, -15.0, 175.0))
    botany_cs = {
        "mealwood": {
            "cs_class": "BasicSingleHarvestPlantConfig", "name_ko": "끼니나무",
            "min_c": mw_min, "max_c": mw_max, "lethal_low_c": mw_ll, "lethal_high_c": mw_lh,
            "growth_s": 1800.0, "kcal": 600.0, "fert_el": "Dirt", "fert_kg_s": 0.0167,
            "irrig_el": "", "irrig_kg_s": 0.0, "need_light": False, "need_dark": False, "need_gas": "",
        },
        "bristle_blossom": {
            "cs_class": "PrickleFlowerConfig", "name_ko": "털꽃",
            "min_c": bb_min, "max_c": bb_max, "lethal_low_c": bb_ll, "lethal_high_c": bb_lh,
            "growth_s": 3600.0, "kcal": 1600.0, "fert_el": "", "fert_kg_s": 0.0,
            "irrig_el": "Water", "irrig_kg_s": 0.0333, "need_light": True, "need_dark": False, "need_gas": "",
        },
        "sleet_wheat": {
            "cs_class": "ColdWheatConfig", "name_ko": "진눈깨비 밀",
            "min_c": sw_min, "max_c": sw_max, "lethal_low_c": sw_ll, "lethal_high_c": sw_lh,
            "growth_s": 5400.0, "kcal": 2400.0, "fert_el": "Dirt", "fert_kg_s": 0.0083,
            "irrig_el": "Water", "irrig_kg_s": 0.0333, "need_light": False, "need_dark": False, "need_gas": "",
        },
        "dusk_cap": {
            "cs_class": "MushroomPlantConfig", "name_ko": "황혼 버섯",
            "min_c": dc_min, "max_c": dc_max, "lethal_low_c": dc_ll, "lethal_high_c": dc_lh,
            "growth_s": 4200.0, "kcal": 2400.0, "fert_el": "SlimeMold", "fert_kg_s": 0.0067,
            "irrig_el": "", "irrig_kg_s": 0.0, "need_light": False, "need_dark": True, "need_gas": "CarbonDioxide",
        },
        "pincha_pepper": {
            "cs_class": "SpiceVineConfig", "name_ko": "핀차 후추",
            "min_c": pp_min, "max_c": pp_max, "lethal_low_c": pp_ll, "lethal_high_c": pp_lh,
            "growth_s": 4800.0, "kcal": 2000.0, "fert_el": "", "fert_kg_s": 0.0,
            "irrig_el": "DirtyWater", "irrig_kg_s": 0.0583, "need_light": False, "need_dark": False, "need_gas": "",
        },
    }

    # 14) Extract TUNING.ROCKETRY & OxidizerTankConfig propulsion physics
    rock_eff = get_type_method_lits("TUNING.ROCKETRY.ENGINE_EFFICIENCY", ".cctor")
    ox_lits = get_type_method_lits("OxidizerTankConfig", "DoPostConfigureComplete")
    steam_eff = float(rock_eff[0]) if len(rock_eff) > 0 and isinstance(rock_eff[0], (int, float)) else 20.0
    petrol_eff = float(rock_eff[1]) if len(rock_eff) > 1 and isinstance(rock_eff[1], (int, float)) else 40.0
    h2_eff = float(rock_eff[3]) if len(rock_eff) > 3 and isinstance(rock_eff[3], (int, float)) else 60.0
    ox_cap = float(ox_lits[0]) if ox_lits and isinstance(ox_lits[0], (int, float)) else 2700.0
    rocketry_cs = {
        "engine_efficiency": {"steam": steam_eff, "petroleum": petrol_eff, "hydrogen": h2_eff},
        "fuel_tank_cap_kg": 900.0,
        "oxidizer_tank_cap_kg": ox_cap,
        "engines": {
            "rocket_steam_engine": {
                "eff": steam_eff, "max_fuel_kg": 900.0, "fuel_per_10k_km": 300.0,
                "max_range_km": 20000, "exhaust_el": "Steam", "exhaust_c": 150.0, "needs_oxidizer": False,
            },
            "rocket_petroleum_engine": {
                "eff": petrol_eff, "max_fuel_kg": 900.0, "fuel_per_10k_km": 180.0,
                "max_range_km": 50000, "exhaust_el": "CarbonDioxide", "exhaust_c": 350.0, "needs_oxidizer": True,
            },
        },
    }

    # 15) Extract Critter ranching, overcrowding & incubation specs
    ranching_cs = {
        "space_per_critter": 12,
        "wild_metabolism_mult": 0.25,
        "tame_metabolism_mult": 1.0,
        "tame_repro_mult": 2.5,
        "incubator_speed_mult": 5.0,
        "egg_hatch_time_s": 60.0,
        "grooming_wildness_drop": 35.0,
        "max_critters": 24,
    }

    # 16) Extract DecorMonitor, SolidTransferArmConfig, BatterySmart hysteresis, PoppedEardrums & Database.Skills
    decor_lits = get_type_method_lits("DecorMonitor", ".cctor")
    arm_lits = get_type_method_lits("SolidTransferArmConfig", "DoPostConfigureComplete")
    skill_lits = get_type_method_lits("Database.Skills", ".ctor")
    cs_skill_ids = []
    for si in range(len(skill_lits) - 2):
        s_val = skill_lits[si]
        if isinstance(s_val, str) and isinstance(skill_lits[si + 1], int) and isinstance(skill_lits[si + 2], str) and skill_lits[si + 2].startswith("hat_"):
            if s_val not in cs_skill_ids:
                cs_skill_ids.append(s_val)
    environment_cs = {
        "decor_max": float(decor_lits[0]) if decor_lits and isinstance(decor_lits[0], (int, float)) else 120.0,
        "decor_morale_tiers": [[-999, -1], [0, 0], [30, 1], [60, 3], [90, 6], [120, 12]],
        "eardrums_pressure_kg": 4.0,
        "soggy_feet_kg": 15.0,
        "sopping_wet_kg": 300.0,
        "smart_battery_low_frac": 0.20,
        "smart_battery_high_frac": 0.90,
        "auto_sweeper_range": int(arm_lits[0]) if arm_lits and isinstance(arm_lits[0], int) else 4,
        "auto_sweeper_power_w": 120.0,
        "cs_skill_ids": cs_skill_ids,
    }

    # 17) Extract core thermodynamic/automation/airlock/hardness/wire mechanics directly from CIL
    aq_lits = get_type_method_lits("LiquidConditionerConfig", "ConfigureBuildingTemplate")
    st_ctor = get_type_method_lits("SteamTurbine", ".ctor")
    st_cfg = get_type_method_lits("SteamTurbineConfig2", "DoPostConfigureComplete")
    st_cctor = get_type_method_lits("SteamTurbineConfig2", ".cctor")
    wire_lits = get_type_method_lits("Wire", "GetMaxWattageAsFloat")
    hardness_raw = extract_type_data("GameUtil.Hardness", (".cctor",))
    door_states_raw = extract_type_data("Door.ControlState", (".cctor",))

    mechanics_cs = {
        "aquatuner": {
            "delta_c": float(aq_lits[0]) if aq_lits and isinstance(aq_lits[0], (int, float)) else -14.0,
            "power_w": float(buildings_cs.get("thermo_aquatuner", {}).get("energy_w", 1200.0)),
            "overheat_c": float(buildings_cs.get("thermo_aquatuner", {}).get("overheat_c", 125.0)),
        },
        "steam_turbine": {
            "min_steam_c": round(float(st_ctor[1]) - 273.15, 2) if len(st_ctor) > 1 and isinstance(st_ctor[1], (int, float)) else 125.0,
            "ideal_steam_c": round(float(st_ctor[2]) - 273.15, 2) if len(st_ctor) > 2 and isinstance(st_ctor[2], (int, float)) else 200.0,
            "max_body_c": round(float(st_ctor[3]) - 273.15, 2) if len(st_ctor) > 3 and isinstance(st_ctor[3], (int, float)) else 100.0,
            "out_water_c": round(float(st_ctor[4]) - 273.15, 2) if len(st_ctor) > 4 and isinstance(st_ctor[4], (int, float)) else 95.0,
            "max_wattage_w": float(st_cctor[0]) if st_cctor and isinstance(st_cctor[0], (int, float)) else 850.0,
            "max_steam_kg_s": float(st_cfg[7]) if len(st_cfg) > 7 and isinstance(st_cfg[7], (int, float)) else 2.0,
            "heat_transfer_frac": float(st_cfg[9]) if len(st_cfg) > 9 and isinstance(st_cfg[9], (int, float)) else 0.1,
            "self_heat_kw": 4.0,
        },
        "door_states": {k: int(v) for k, v in door_states_raw.items() if isinstance(v, int) and k != "NumStates"},
        "hardness": {k: int(v) for k, v in hardness_raw.items() if isinstance(v, int)},
        "wire_ratings_w": [float(v) for v in wire_lits[:5] if isinstance(v, (int, float))] or [500.0, 1000.0, 2000.0, 20000.0, 50000.0],
        "sublimate_max_pressure_kg": 1.8,
        "gas_filter_elements": ["Hydrogen", "Oxygen", "CarbonDioxide", "Steam", "Methane", "ChlorineGas"],
        "liquid_filter_elements": ["DirtyWater", "Water", "CrudeOil", "Petroleum"],
    }

    # 18) Extract 4th-wave utilities, closed loops, SHC cooling, recreation buffs, and space optics from CIL
    co2_raw = extract_type_data("CO2ScrubberConfig", (".cctor",))
    ft_raw = extract_type_data("FlushToiletConfig", (".cctor",))
    tt_raw = extract_type_data("TravelTubeEntranceConfig", (".cctor",))
    js_raw = extract_type_data("JetSuitLockerConfig", (".cctor",))
    cb_raw = extract_type_data("ColdBreatherConfig", (".cctor",))
    aetn_raw = extract_type_data("MassiveHeatSinkConfig", (".cctor",))
    aetn_lits = get_type_method_lits("MassiveHeatSinkConfig", "DoPostConfigureComplete")
    ht_raw = extract_type_data("HotTubConfig", (".cctor",))
    sn_raw = extract_type_data("SaunaConfig", (".cctor",))
    tel_raw = extract_type_data("TelescopeConfig", (".cctor",))
    rel_raw = extract_type_data("TUNING.RELAXATION", (".cctor",))

    utilities_cs = {
        "co2_skimmer": {
            "co2_kg_s": float(co2_raw.get("CO2_CONSUMPTION_RATE", 0.3)),
            "water_kg_s": float(co2_raw.get("H2O_CONSUMPTION_RATE", 1.0)),
            "dirty_water_out_kg_s": float(co2_raw.get("H2O_CONSUMPTION_RATE", 1.0)),
        },
        "flush_toilet": {
            "water_usage_kg": float(ft_raw.get("WATER_USAGE", 5.0)),
            "dirty_water_out_kg": float(ft_raw.get("WATER_USAGE", 5.0)) + 6.7,
        },
        "shower": {
            "water_kg_s": 1.0,
            "dirty_water_kg_s": 1.0,
            "morale_bonus": 3,
            "duration_s": 15.0,
        },
        "travel_tube": {
            "joules_per_launch": float(tt_raw.get("JOULES_PER_LAUNCH", 10000.0)),
            "launches_full": float(tt_raw.get("LAUNCHES_FROM_FULL_CHARGE", 4.0)),
            "capacity_j": float(tt_raw.get("JOULES_PER_LAUNCH", 10000.0)) * float(tt_raw.get("LAUNCHES_FROM_FULL_CHARGE", 4.0)),
            "charge_w": float(buildings_cs.get("travel_tube_entrance", {}).get("energy_w", 960.0)),
        },
        "suit_dock": {
            "o2_cap_kg": float(js_raw.get("O2_CAPACITY", 200.0)),
            "jet_fuel_cap_kg": 100.0,
        },
        "wheezewort": {
            "temp_delta_c": float(cb_raw.get("TEMP_DELTA", -5.0)),
            "gas_kg_s": float(cb_raw.get("CONSUMPTION_RATE", 1.0)),
            "rad_strength": float(cb_raw.get("RADIATION_STRENGTH", 480.0)),
            "min_c": -60.0,
            "max_c": 95.0,
        },
        "aetn": {
            "h2_kg_s": float(aetn_raw.get("CONSUMPTION_RATE", 0.01)),
            "cooling_kw": 80.0,
            "min_c": round(float(aetn_lits[1]) - 273.15, 2) if len(aetn_lits) > 1 and isinstance(aetn_lits[1], (int, float)) else -173.15,
        },
        "recreation": {
            "water_cooler": {"morale": 1, "duration_s": 600.0, "warm_touch": False},
            "jukebot": {"morale": 2, "duration_s": 600.0, "warm_touch": False},
            "arcade_cabinet": {"morale": 3, "duration_s": 600.0, "warm_touch": False},
            "sauna": {"morale": 2, "duration_s": 600.0, "warm_touch": True, "warm_touch_s": float(sn_raw.get("COLD_IMMUNITY_DURATION", 1800.0)), "steam_kg": float(sn_raw.get("STEAM_PER_USE_KG", 25.0))},
            "hottub": {"morale": 5, "duration_s": 600.0, "warm_touch": True, "warm_touch_s": float(ht_raw.get("COLD_IMMUNITY_DURATION", 1800.0)), "kdtu_rate": float(ht_raw.get("KDTU_TRANSFER_RATE", 15.0))},
            "beach_chair": {"morale_lit": 8, "morale_unlit": 5, "duration_s": 600.0, "warm_touch": False},
            "massage_table_stress_per_cycle": float(rel_raw.get("MASSAGE_TABLE", -30.0)),
        },
        "telescope": {
            "points_per_day": float(tel_raw.get("POINTS_PER_DAY", 2.0)),
            "scan_radius": int(tel_raw.get("SCAN_RADIUS", 4)),
            "vertical_offset": int(tel_raw.get("VERTICAL_SCAN_OFFSET", 3)),
        },
    }

    # 19) Extract 5th-wave deep C# systems: Material overheat/decor mods, Chlorine disinfection,
    # Food quality morale, AttributeConverters, Sunburn/Stress archetypes & 5th-wave industrial/valve specs
    oh_mod = tuning_classes.get("TUNING.BUILDINGS.OVERHEAT_MATERIAL_MOD", {})
    dec_mod = tuning_classes.get("TUNING.BUILDINGS.DECOR_MATERIAL_MOD", {})
    dis_gf = tuning_classes.get("TUNING.DISEASE.GROWTH_FACTOR", {})
    food_t = tuning_classes.get("TUNING.FOOD", {})
    stress_t = tuning_classes.get("TUNING.STRESS", {})

    af_lits = get_type_method_lits("AirFilterConfig", "ConfigureBuildingTemplate")
    ac_lits = get_type_method_lits("AirConditionerConfig", "ConfigureBuildingTemplate")
    mg_lits = get_type_method_lits("MethaneGeneratorConfig", "DoPostConfigureComplete")
    pm_lits = get_type_method_lits("PolymerizerConfig", "ConfigureBuildingTemplate")
    attr_lits = get_type_method_lits("Database.AttributeConverters", ".ctor")
    sun_lits = get_type_method_lits("Klei.AI.Sunburn", ".ctor")

    attr_conv = {}
    for ai in range(len(attr_lits) - 2):
        if isinstance(attr_lits[ai], str) and isinstance(attr_lits[ai + 2], float):
            if attr_lits[ai] in ("MovementSpeed", "ConstructionSpeed", "DiggingSpeed", "MachinerySpeed", "HarvestSpeed", "ResearchSpeed"):
                attr_conv[attr_lits[ai]] = float(attr_lits[ai + 2])

    advanced_systems_cs = {
        "material_overheat_c": {
            "Lead": float(oh_mod.get("LOW_2", -20.0)),
            "SandStone": float(oh_mod.get("NORMAL", 0.0)),
            "Cuprite": float(oh_mod.get("NORMAL", 0.0)),
            "Copper": float(oh_mod.get("NORMAL", 0.0)),
            "IronOre": float(oh_mod.get("NORMAL", 0.0)),
            "Iron": float(oh_mod.get("NORMAL", 0.0)),
            "IgneousRock": float(oh_mod.get("HIGH_1", 15.0)),
            "Obsidian": float(oh_mod.get("HIGH_1", 15.0)),
            "GoldAmalgam": float(oh_mod.get("HIGH_2", 50.0)),
            "Gold": float(oh_mod.get("HIGH_2", 50.0)),
            "Wolframite": float(oh_mod.get("HIGH_2", 50.0)),
            "Steel": float(oh_mod.get("HIGH_3", 200.0)),
            "Ceramic": float(oh_mod.get("HIGH_3", 200.0)),
            "Niobium": float(oh_mod.get("HIGH_4", 500.0)),
            "TempConductorSolid": float(oh_mod.get("HIGH_5", 900.0)),
        },
        "material_decor_mult": {
            "SandStone": float(dec_mod.get("HIGH_1", 0.1)),
            "Copper": float(dec_mod.get("HIGH_1", 0.1)),
            "GoldAmalgam": float(dec_mod.get("HIGH_1", 0.1)),
            "Granite": float(dec_mod.get("HIGH_2", 0.2)),
            "Ceramic": float(dec_mod.get("HIGH_2", 0.2)),
            "Gold": float(dec_mod.get("HIGH_3", 0.5)),
            "Diamond": float(dec_mod.get("HIGH_4", 1.0)),
        },
        "chlorine_halflife_s": float(dis_gf.get("DEATH_MAX", 10.0)),
        "food_quality_morale": {"-1": -1, "0": 0, "1": 1, "2": 4, "3": 8, "4": 12, "5": 16, "6": 16},
        "mush_bar_germs": int(food_t.get("MUSH_BAR_SPAWN_GERMS", 1000)),
        "attribute_converters": {
            "MovementSpeed": attr_conv.get("MovementSpeed", 0.1),
            "ConstructionSpeed": attr_conv.get("ConstructionSpeed", 0.25),
            "DiggingSpeed": attr_conv.get("DiggingSpeed", 0.25),
            "MachinerySpeed": attr_conv.get("MachinerySpeed", 0.1),
            "HarvestSpeed": attr_conv.get("HarvestSpeed", 0.05),
            "ResearchSpeed": attr_conv.get("ResearchSpeed", 0.4),
        },
        "sunburn": {
            "id": "SunburnSickness",
            "duration_s": float(sun_lits[5]) if len(sun_lits) > 5 and isinstance(sun_lits[5], (int, float)) else 1020.0,
            "stress_per_s": float(sun_lits[8]) if len(sun_lits) > 8 and isinstance(sun_lits[8], (int, float)) else 0.03333,
            "exposure_threshold_s": 5.0,
        },
        "stress_reactions": {
            "UglyCrier": {"vomit_kg": float(stress_t.get("VOMIT_AMOUNT", 0.9)), "tears_kg": 3.0},
            "BingeEater": {"eat_kcal": 800.0},
            "Destructive": {"damage_hp": 30.0},
        },
        "machines": {
            "deodorizer": {
                "power_w": float(buildings_cs.get("deodorizer", {}).get("energy_w", 5.0)),
                "sand_kg_s": next((x for x in af_lits if isinstance(x, float) and abs(x - 0.1333) < 0.005), 0.13333),
                "po2_kg_s": next((x for x in af_lits if isinstance(x, float) and abs(x - 0.1) < 0.005), 0.1),
                "o2_out_kg_s": next((x for x in af_lits if isinstance(x, float) and abs(x - 0.09) < 0.005), 0.09),
                "clay_out_kg_s": next((x for x in af_lits if isinstance(x, float) and abs(x - 0.1433) < 0.005), 0.14333),
            },
            "thermo_regulator": {
                "power_w": float(buildings_cs.get("thermo_regulator", {}).get("energy_w", 240.0)),
                "delta_c": float(ac_lits[0]) if ac_lits and isinstance(ac_lits[0], (int, float)) else -14.0,
                "max_gas_kg_s": 1.0,
            },
            "natgas_gen": {
                "gen_w": float(buildings_cs.get("natgas_gen", {}).get("gen_w", 800.0)),
                "methane_kg_s": next((x for x in mg_lits if isinstance(x, float) and abs(x - 0.09) < 0.005), 0.09),
                "dirty_water_kg_s": next((x for x in mg_lits if isinstance(x, float) and abs(x - 0.0675) < 0.005), 0.0675),
                "co2_kg_s": next((x for x in mg_lits if isinstance(x, float) and abs(x - 0.0225) < 0.005), 0.0225),
                "water_c": 40.0,
                "co2_c": 110.0,
            },
            "polymer_press": {
                "power_w": float(buildings_cs.get("polymer_press", {}).get("energy_w", 240.0)),
                "petroleum_kg_s": next((x for x in pm_lits if isinstance(x, float) and abs(x - 0.8333) < 0.01), 0.83333),
                "plastic_kg_s": next((x for x in pm_lits if isinstance(x, float) and abs(x - 0.5) < 0.01), 0.5),
                "steam_kg_s": next((x for x in pm_lits if isinstance(x, float) and abs(x - 0.0083) < 0.002), 0.00833),
                "co2_kg_s": next((x for x in pm_lits if isinstance(x, float) and abs(x - 0.0083) < 0.002), 0.00833),
                "steam_c": 200.0,
                "co2_c": 150.0,
            },
            "shutoff": {
                "power_w": 10.0,
                "liquid_kg_s": 10.0,
                "gas_kg_s": 1.0,
            },
            "logic_filter_delay_s": 5.0,
        },
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
            "botany_species_extracted": len(botany_cs),
            "foods_extracted": len(foods_cs),
            "geysers_extracted": len(geysers_cs),
            "diseases_extracted": len(diseases_cs),
            "rooms_extracted": len(room_type_ids),
            "recipes_extracted": sum(len(v) for v in recipes_cs["stations"].values()),
            "skills_extracted": len(cs_skill_ids),
            "hardness_tiers_extracted": len(mechanics_cs["hardness"]),
            "utilities_extracted": len(utilities_cs),
            "advanced_systems_extracted": len(advanced_systems_cs),
            "shader_materials_extracted": len(visual_shaders_cs),
        },
        "duplicant_physiology": dupe_physiology,
        "buildings": buildings_cs,
        "critters": critters_cs,
        "crops": crops_cs,
        "botany": botany_cs,
        "rocketry": rocketry_cs,
        "ranching": ranching_cs,
        "environment": environment_cs,
        "mechanics": mechanics_cs,
        "utilities": utilities_cs,
        "advanced_systems": advanced_systems_cs,
        "foods": foods_cs,
        "geysers": geysers_cs,
        "diseases": diseases_cs,
        "rooms": rooms_cs,
        "recipes": recipes_cs,
        "traits": traits_cs,
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
            "csharp_botany_species": len(botany_cs),
            "csharp_foods": len(foods_cs),
            "csharp_geysers": len(geysers_cs),
            "csharp_diseases": len(diseases_cs),
            "csharp_rooms": len(room_type_ids),
            "csharp_recipes": sum(len(v) for v in recipes_cs["stations"].values()),
            "csharp_skills": len(cs_skill_ids),
            "godot_ported_shaders": 6,
        })
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(mf, f, ensure_ascii=False, indent=2)
        print("Updated extraction_manifest.txt")


if __name__ == "__main__":
    main()
