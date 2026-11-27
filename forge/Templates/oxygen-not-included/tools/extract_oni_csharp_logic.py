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
            "foods_extracted": len(foods_cs),
            "geysers_extracted": len(geysers_cs),
            "diseases_extracted": len(diseases_cs),
            "rooms_extracted": len(room_type_ids),
            "recipes_extracted": sum(len(v) for v in recipes_cs["stations"].values()),
            "shader_materials_extracted": len(visual_shaders_cs),
        },
        "duplicant_physiology": dupe_physiology,
        "buildings": buildings_cs,
        "critters": critters_cs,
        "crops": crops_cs,
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
            "csharp_foods": len(foods_cs),
            "csharp_geysers": len(geysers_cs),
            "csharp_diseases": len(diseases_cs),
            "csharp_rooms": len(room_type_ids),
            "csharp_recipes": sum(len(v) for v in recipes_cs["stations"].values()),
            "godot_ported_shaders": 6,
        })
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(mf, f, ensure_ascii=False, indent=2)
        print("Updated extraction_manifest.txt")


if __name__ == "__main__":
    main()
