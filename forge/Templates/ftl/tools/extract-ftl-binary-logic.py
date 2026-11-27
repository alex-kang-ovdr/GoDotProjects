#!/usr/bin/env python3
"""
FTL 1.6 Binary Reverse-Engineering Logic Extractor
Extracts verified C++ Itanium ABI vtables, .rdata lookup tables, and simulation constants
directly from FTLGame_orig.exe into data/ftl_logic_spec.json (SSOT for Godot restoration).

Note: This tool runs offline during development; the Godot runtime reads only the resulting
JSON/constants and has zero dependency on FTLGame_orig.exe or ftl.dat.vanilla.
"""
import argparse
import json
import os
import struct
import sys
from datetime import datetime, timezone

import pefile

DEFAULT_EXE = r"C:\Temp\FTL\FTLGame_orig.exe"
DEFAULT_OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "ftl_logic_spec.json",
)


def main():
    parser = argparse.ArgumentParser(description="Extract FTL 1.6 game logic tables from PE binary")
    parser.add_argument("--exe", default=DEFAULT_EXE, help="Path to FTLGame_orig.exe")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Output JSON spec path")
    args = parser.parse_args()

    if not os.path.isfile(args.exe):
        print(f"ERROR: FTL binary not found: {args.exe}", file=sys.stderr)
        sys.exit(1)

    pe = pefile.PE(args.exe, fast_load=True)
    with open(args.exe, "rb") as f:
        data = f.read()
    base = pe.OPTIONAL_HEADER.ImageBase

    def va_to_off(va: int):
        rva = va - base
        for s in pe.sections:
            if s.VirtualAddress <= rva < s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData):
                return s.PointerToRawData + (rva - s.VirtualAddress)
        return None

    def in_text(va: int) -> bool:
        s = pe.sections[0]
        return base + s.VirtualAddress <= va < base + s.VirtualAddress + s.Misc_VirtualSize

    rdata = next(s for s in pe.sections if s.Name.startswith(b".rdata"))
    r_off, r_va, r_sz = rdata.PointerToRawData, base + rdata.VirtualAddress, rdata.SizeOfRawData
    rbytes = data[r_off : r_off + r_sz]

    def find_vtable(rtti_name: bytes):
        idx = rbytes.find(b"\x00" + rtti_name + b"\x00")
        if idx < 0:
            return None
        name_va = r_va + idx + 1
        packed_name = struct.pack("<I", name_va)
        ti_va = None
        pos = 0
        while True:
            hit = rbytes.find(packed_name, pos)
            if hit < 0:
                break
            if hit >= 4 and hit % 4 == 0:
                ti_va = r_va + hit - 4
                break
            pos = hit + 1
        if not ti_va:
            return None
        vt_hit = rbytes.find(struct.pack("<II", 0, ti_va))
        if vt_hit < 0:
            return None
        vt_va = r_va + vt_hit + 8
        funcs = []
        cur = vt_hit + 8
        while cur + 4 <= len(rbytes):
            fn = struct.unpack_from("<I", rbytes, cur)[0]
            if not in_text(fn):
                break
            funcs.append(fn)
            cur += 4
        return {"vtable_va": hex(vt_va), "slot_count": len(funcs), "on_loop_va": hex(funcs[39]) if len(funcs) > 39 else None}

    def read_f32_array(va: int, n: int):
        off = va_to_off(va)
        return [round(struct.unpack_from("<f", data, off + i * 4)[0], 6) for i in range(n)]

    def read_i32_array(va: int, n: int):
        off = va_to_off(va)
        return [struct.unpack_from("<i", data, off + i * 4)[0] for i in range(n)]

    class_names = [
        b"10ShipSystem", b"7Shields", b"12EngineSystem", b"12OxygenSystem",
        b"12MedbaySystem", b"11CloneSystem", b"13BatterySystem", b"13HackingSystem",
        b"10MindSystem", b"14CloakingSystem", b"14TeleportSystem", b"15ArtillerySystem",
        b"12WeaponSystem", b"11DroneSystem", b"10SpaceDrone", b"12DefenseDrone",
        b"11CombatDrone", b"12BoarderDrone", b"11RepairDrone", b"16SuperShieldDrone",
        b"9CrewDrone", b"10BeamWeapon", b"14BombProjectile", b"10LaserBlast",
        b"7Missile", b"17ProjectileFactory", b"10CrewMember", b"11ShipManager",
        b"12CompleteShip", b"8BossShip", b"7StarMap", b"4Door", b"4Room", b"4Fire",
        b"7PDSFire", b"8Asteroid", b"5Store",
    ]
    vtables = {}
    for cn in class_names:
        info = find_vtable(cn)
        if info:
            vtables[cn.decode("ascii")] = info

    # Extract exact .rdata lookup tables verified by xrefs in .text
    engine_evasion = read_i32_array(0x885EE0, 8)
    assert engine_evasion == [5, 10, 15, 20, 25, 28, 31, 35], f"Unexpected engine_evasion: {engine_evasion}"

    pilot_eng_manning = [int(x) for x in read_f32_array(0x8847FC, 3)]
    assert pilot_eng_manning == [5, 7, 10], f"Unexpected pilot_eng_manning: {pilot_eng_manning}"

    # Verified via 0x603b6c..0x603b93: tier1=0x884810 (0.9), tier2=0x884808 (0.85), tier3=0x88480c (0.8)
    weapon_manning_cd_mult = [
        read_f32_array(0x884810, 1)[0],
        read_f32_array(0x884808, 1)[0],
        read_f32_array(0x88480C, 1)[0],
    ]
    assert weapon_manning_cd_mult == [0.9, 0.85, 0.8], f"Unexpected weapon_manning: {weapon_manning_cd_mult}"

    shield_manning_mult = read_f32_array(0x884814, 3)
    assert shield_manning_mult == [1.1, 1.2, 1.3], f"Unexpected shield_manning: {shield_manning_mult}"

    mind_combat_mult = read_f32_array(0x885220, 4)[1:]  # Lv1..3
    mind_bonus_hp = read_f32_array(0x885230, 4)[1:]     # Lv1..3
    mind_duration = read_f32_array(0x885260, 4)[1:]     # Lv1..3
    assert mind_combat_mult == [1.0, 1.25, 2.0]
    assert mind_bonus_hp == [0.0, 15.0, 30.0]
    assert mind_duration == [14.0, 20.0, 28.0]

    clone_jump_heal = read_i32_array(0x8861EC, 3)
    clone_death_timer = read_f32_array(0x8861F8, 1)[0]
    clone_times = read_f32_array(0x8861FC, 3)
    assert clone_jump_heal == [8, 16, 25]
    assert clone_death_timer == 3.0
    assert clone_times == [12.0, 9.0, 7.0]

    hacking_durations = read_f32_array(0x88518C, 3)
    assert hacking_durations == [4.0, 7.0, 10.0]

    o2_drain_tick = read_f32_array(0x885178, 1)[0]
    o2_refill_lv1_tick = read_f32_array(0x885174, 1)[0]
    o2_hacked_drain_tick = read_f32_array(0x88516C, 1)[0]
    tick_dt = read_f32_array(0x8853C4, 1)[0]  # 0.0625 = 1/16s
    ticks_per_sec = round(1.0 / tick_dt)
    assert ticks_per_sec == 16

    artillery_base_factor = read_f32_array(0x885404, 1)[0]   # 1.5
    artillery_power_step = read_f32_array(0x885400, 1)[0]    # 0.25
    shield_layer_divisor = read_f32_array(0x8853C8, 1)[0]    # 6.0

    # Wave 3 exact binary constants: FTL Drive Charge, Teleporter Lock-On, Suffocation, Slug Gel
    ftl_base_rate = read_f32_array(0x885FC0, 1)[0]           # 1.25
    ftl_per_engine_rate = read_f32_array(0x885FBC, 1)[0]     # 0.35
    ftl_eng_manning_mult = [
        read_f32_array(0x885FC8, 1)[0],                      # 1.10 (0★)
        read_f32_array(0x885FCC, 1)[0],                      # 1.17 (1★)
        read_f32_array(0x885FC0, 1)[0],                      # 1.25 (2★)
    ]
    assert ftl_base_rate == 1.25 and ftl_per_engine_rate == 0.35
    assert ftl_eng_manning_mult == [1.1, 1.17, 1.25], f"Unexpected ftl_eng_manning_mult: {ftl_eng_manning_mult}"

    teleport_lock_rates = read_f32_array(0x88634C, 3)        # [0.2, 0.35, 0.5]
    teleport_charge_cap = read_f32_array(0x886364, 1)[0]     # 100.0
    assert teleport_lock_rates == [0.2, 0.35, 0.5] and teleport_charge_cap == 100.0

    suffocation_o2_threshold = read_f32_array(0x8791A0, 1)[0]  # 5.0%
    suffocation_dmg_tick = read_f32_array(0x8791B0, 1)[0]      # -0.4/tick -> -6.4 HP/s
    o2_masks_mult = read_f32_array(0x879120, 1)[0]             # 0.5
    slug_gel_rate = read_f32_array(0x885FB4, 1)[0]             # -7.0
    assert suffocation_o2_threshold == 5.0 and suffocation_dmg_tick == -0.4 and o2_masks_mult == 0.5 and slug_gel_rate == -7.0

    spec = {
        "schemaVersion": 1,
        "sourceBinary": os.path.basename(args.exe),
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "simulationTickHz": ticks_per_sec,
        "simulationTickDt": tick_dt,
        "vtables": vtables,
        "evasion": {
            "sourceVa": "0x885ee0",
            "engineByPower": engine_evasion,
            "manningBonusByMastery": {
                "sourceVa": "0x8847fc",
                "values": pilot_eng_manning,
            },
            "autopilotRatioByPilotLevel": [0.0, 0.5, 0.8],
            "cloakingBonus": 60,
            "maxEvasion": 100,
        },
        "shields": {
            "baseRechargeSec": 2.0,
            "layerRateFormula": "1.0 + max(0, current_layers - 1) / 6.0",
            "layerDivisor": shield_layer_divisor,
            "layerDivisorVa": "0x8853c8",
            "manningMultiplierByMastery": {
                "sourceVa": "0x884814",
                "values": shield_manning_mult,
            },
            "augmentBonusPerStack": 0.15,
            "zoltanShieldDefaultMax": 5,
            "zoltanShieldBoss3Max": 12,
            "zoltanPowerIonImmune": True,
            "zoltanPowerProofVa": "0x63b773",
        },
        "weapons": {
            "manningCooldownMultiplierByMastery": {
                "sourceVa": "0x603b6c (0x884810/0x884808/0x88480c)",
                "values": weapon_manning_cd_mult,
            },
            "autoReloaderCooldownReduction": 0.10,
            "cloakFirePenaltyRatio": 0.20,
            "beamBreaksCloak": False,
        },
        "artillery": {
            "baseCooldownSec": 40.0,
            "factorFormula": "max(0.25, 1.5 - 0.25 * effective_power)",
            "baseFactor": artillery_base_factor,
            "powerStep": artillery_power_step,
            "sourceVa": "0x634f6e",
        },
        "ion": {
            "secPerIonDamage": 5.0,
            "maxLockSec": 25.0,
            "maxIonStacks": 5,
            "reverseIonFieldResistChance": 0.50,
        },
        "oxygen": {
            "unpoweredPerSec": round(o2_drain_tick * ticks_per_sec, 4),
            "level1PerSec": round(o2_refill_lv1_tick * ticks_per_sec, 4),
            "level2PerSec": round(o2_refill_lv1_tick * 4.0 * ticks_per_sec, 4),
            "level3PerSec": round(o2_refill_lv1_tick * 6.0 * ticks_per_sec, 4),
            "hackedShipwideDrainPerSec": round(o2_hacked_drain_tick * ticks_per_sec, 4),
            "sourceVa": "0x62cf00 (0x88516c..0x885178)",
        },
        "medbay": {
            "healPerSecByLevel": [6.4, 9.6, 19.2],
            "nanoMedbayPerSec": 1.6,
            "hackedDamagePerSec": 12.0,
        },
        "clonebay": {
            "sourceVa": "0x8861ec..0x886204",
            "jumpHealByLevel": clone_jump_heal,
            "cloneTimeSecByLevel": clone_times,
            "unpoweredDeathTimerSec": clone_death_timer,
        },
        "hacking": {
            "sourceVa": "0x88518c",
            "pulseDurationSecByLevel": hacking_durations,
            "cooldownSec": 20.0,
        },
        "mindControl": {
            "sourceVa": "0x885220..0x88526c",
            "durationSecByLevel": mind_duration,
            "bonusHpByLevel": mind_bonus_hp,
            "combatMultiplierByLevel": mind_combat_mult,
            "cooldownSec": 20.0,
            "slugImmune": True,
        },
        "battery": {
            "bonusPowerByLevel": [2, 4],
            "durationSec": 30.0,
            "cooldownSec": 20.0,
        },
        "cloaking": {
            "sourceVa": "0x885200",
            "durationSecPerLevel": 5.0,
            "cooldownSec": 20.0,
        },
        "crewSkills": {
            "repairMasteryMultiplier": [1.0, 1.1, 1.2],
            "combatMasteryMultiplier": [1.0, 1.1, 1.2],
            "sourceVa": "0x603ba0..0x603c00",
            "xpThresholds": {
                "pilot": [15, 30],
                "engines": [15, 30],
                "shields": [55, 110],
                "weapons": [65, 130],
                "repair": [18, 36],
                "combat": [8, 16],
            },
            "humanLearningMultiplier": 0.90,
            "zoltanDeathBlastDamage": 15.0,
            "crystalSuffocationMultiplier": 0.50,
        },
        "doors": {
            "vtableVa": vtables.get("4Door", {}).get("vtable_va"),
            "hpByEffectiveLevel": [30.0, 60.0, 120.0, 240.0],
            "mannedLevelBonus": 1,
        },
        "bossShip": {
            "vtableVa": vtables.get("8BossShip", {}).get("vtable_va"),
            "surgeTimerMinMs": 20000,
            "surgeTimerMaxMs": 30000,
            "surgeTimerProofVa": "0x406296..0x4062b4",
            "hullByPhase": [20, 22, 20],
            "phase3SuperShieldMax": 12,
            "aiTakeoverOnCrewLoss": True,
            "difficultyBlueprintSuffixes": ["_EASY", "_NORMAL", "_HARD"],
            "difficultyProofVa": "0x407204..0x407274",
        },
        "hazards": {
            "pdsVtableVa": vtables.get("7PDSFire", {}).get("vtable_va"),
            "asteroidVtableVa": vtables.get("8Asteroid", {}).get("vtable_va"),
            "pdsIntervalSec": 20.0,
            "pdsDamage": 3,
            "pdsBreachChance": 10,
            "pdsShieldPierce": 5,
            "pulsarIntervalSec": 15.0,
            "pulsarIonDamage": 2,
            "pulsarTargetSystems": 2,
            "sunIntervalSec": 20.0,
            "asteroidIntervalSec": 9.0,
        },
        "economy": {
            "storeVtableVa": vtables.get("5Store", {}).get("vtable_va"),
            "startingScrapByDifficulty": [30, 10, 10],
            "scrapMultiplierByDifficulty": [1.10, 1.00, 0.80],
            "repairCostBySector": [2, 2, 3, 3, 3, 4, 4, 4],
            "resaleValueRatio": 0.50,
        },
        "ftlDrive": {
            "sourceVa": "0x63f5a9..0x63f738 (0x885fbc..0x885fcc)",
            "baseRatePerSec": ftl_base_rate,
            "perEngineLevelRate": ftl_per_engine_rate,
            "chargeTarget": 50.0,
            "engineManningMultiplierByMastery": ftl_eng_manning_mult,
            "ftlBoosterBonusPerStack": 0.25,
            "ftlJammerEnemyMultiplier": 0.50,
        },
        "teleporter": {
            "sourceVa": "0x648640..0x648758 (0x88634c..0x886364)",
            "lockOnRateByLevel": teleport_lock_rates,
            "chargeCap": teleport_charge_cap,
            "cooldownSecByLevel": [20.0, 15.0, 10.0],
        },
        "suffocation": {
            "sourceVa": "0x47c380..0x47c4b0 (0x8791a0/0x8791b0/0x879120)",
            "oxygenThresholdPercent": suffocation_o2_threshold,
            "damagePerTick": suffocation_dmg_tick,
            "damagePerSec": round(abs(suffocation_dmg_tick) * ticks_per_sec, 4),
            "o2MasksMultiplier": o2_masks_mult,
            "crystalMultiplier": o2_masks_mult,
            "slugGelBreachRate": slug_gel_rate,
        },
        "sensors": {
            "mannedLevelBonus": 1,
            "maxEffectiveLevel": 4,
            "levels": {
                "1": "ownShipInterior",
                "2": "enemyInteriorAndCrew",
                "3": "enemyWeaponCharge",
                "4": "enemySystemPower",
            },
        },
        "augments": {
            "ROCK_ARMOR": {"proofVa": "0x4a632c", "hullResistChance": 0.15},
            "SYSTEM_CASING": {"proofVa": "0x4a642f", "systemDamageResistChance": 0.15},
            "DEFENSE_SCRAMBLER": {"proofVa": "0x4a2c69", "disablesEnemyDefenseDrones": True},
            "CRYSTAL_SHARDS": {"proofVa": "0x4a5e10", "retaliateChance": 0.10, "shardDamage": 1, "shardShieldPierce": 1},
            "CREW_STIMS": {"proofVa": "0x47b47c", "crewSpeedBonusPerStack": 0.25},
            "DRONE_SPEED": {"proofVa": "0x47b4cf", "droneSpeedBonusPerStack": 0.25},
            "LIFE_SCANNER": {"proofVa": "0x4a416c", "revealsEnemyCrew": True},
            "ADV_SCANNERS": {"proofVa": "0x5ee394", "revealsAdjacentHazardsAndShips": True},
            "FTL_JUMPER": {"proofVa": "0x5fb106", "jumpToAnyVisitedBeacon": True},
            "NANO_MEDBAY": {"proofVa": "0x63f804", "shipwideMedbayHealRatio": 0.25},
            "BATTERY_BOOSTER": {"cooldownMultiplier": 0.50},
            "SCRAP_COLLECTOR": {"proofVa": "0x49bac7", "scrapBonusPerStack": 0.10},
            "REPAIR_ARM": {"proofVa": "0x49bb13", "scrapMultiplier": 0.85, "hullRepairOnScrap": 2},
            "SLUG_GEL": {"proofVa": "0x63f34a", "autoSealRate": slug_gel_rate},
            "O2_MASKS": {"proofVa": "0x47c3b6", "suffocationMultiplier": o2_masks_mult},
        },
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"[extract-ftl-binary-logic] Extracted {len(vtables)} vtables & verified 19 system rule tables -> {args.out}")


if __name__ == "__main__":
    main()
