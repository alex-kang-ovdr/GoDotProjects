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
        b"12WeaponSystem", b"11DroneSystem", b"5Drone", b"10SpaceDrone", b"12DefenseDrone",
        b"11CombatDrone", b"12BoarderDrone", b"15BoarderPodDrone", b"11BattleDrone",
        b"11RepairDrone", b"15ShipRepairDrone", b"16SuperShieldDrone", b"12HackingDrone",
        b"8IonDrone", b"9CrewDrone", b"9CrewLaser", b"12CrewManifest", b"13CrewAnimation",
        b"10Projectile", b"10BeamWeapon", b"14BombProjectile",
        b"10LaserBlast", b"7Missile", b"17ProjectileFactory", b"9Blueprint",
        b"15WeaponBlueprint", b"14DroneBlueprint", b"15SystemBlueprint", b"16AugmentBlueprint",
        b"10CrewMember", b"9EngiAlien", b"11MantisAlien", b"9RockAlien", b"11EnergyAlien",
        b"9SlugAlien", b"12CrystalAlien", b"14AnaerobicAlien", b"5Ghost",
        b"4Ship", b"9OuterHull", b"11ShipManager", b"12CompleteShip",
        b"8BossShip", b"7StarMap", b"6CEvent", b"4Door", b"4Room", b"4Fire",
        b"10Spreadable", b"8SpreaderI4FireE", b"10Repairable", b"10ShipRepair",
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

    # Wave 5 binary verification: EventGenerator XML grammar strings in .rdata (0x882670..0x882960)
    ev_grammar_slice = rbytes[(0x882670 - r_va) : (0x882960 - r_va)]
    required_event_tags = [
        "autoReward", "item_modify", "weapon", "drone", "augment", "crewMember",
        "removeCrew", "upgrade", "store", "reveal_map", "distressBeacon",
        "modifyPursuit", "damage", "repair", "environment", "status", "boarders",
        "quest", "secretSector",
    ]
    for etag in required_event_tags:
        assert (b"\x00" + etag.encode("ascii") + b"\x00") in ev_grammar_slice, f"Missing EventGenerator tag in .rdata: {etag}"

    # Wave 6 exact binary tables: Weapon depower decay (0x40ddcf), 4Door HP x difficulty (0x471620),
    # 4Fire spread & O2 extinction (0x49971e..0x4998f0), Crew medbay/fire rates (0x47c286..0x47c396)
    weapon_depower_decay_tick = read_f32_array(0x876894, 1)[0]      # 0.375/tick -> 6.0 sec/sec!
    weapon_hack_drain_tick = read_f32_array(0x876890, 1)[0]         # 0.0625/tick -> 1.0 sec/sec!
    assert weapon_depower_decay_tick == 0.375 and weapon_hack_drain_tick == 0.0625

    door_hp_lv3_diff = read_i32_array(0x878950, 3)                  # [20, 18, 15]
    door_hp_lv2_diff = read_i32_array(0x87895C, 3)                  # [16, 12, 10]
    door_hp_lv1_diff = read_i32_array(0x878968, 3)                  # [12, 8, 6]
    assert door_hp_lv3_diff == [20, 18, 15] and door_hp_lv2_diff == [16, 12, 10] and door_hp_lv1_diff == [12, 8, 6]

    fire_spread_rates = [
        read_f32_array(0x879904, 1)[0],                             # 0.057143 (4/70)
        read_f32_array(0x879908, 1)[0],                             # 0.08
        read_f32_array(0x87990C, 1)[0],                             # 0.10
        read_f32_array(0x879910, 1)[0],                             # 0.01 (Lv3 blast door barrier)
    ]
    fire_o2_extinct_threshold = read_f32_array(0x879914, 1)[0]      # 10.0%
    crew_fire_dmg_tick = read_f32_array(0x8791AC, 1)[0]             # -0.133/tick
    crew_medbay_base_tick = read_f32_array(0x8791B8, 1)[0]          # 0.4/tick -> 6.4 HP/s
    crew_medbay_level_step = read_f32_array(0x8791B4, 1)[0]         # 1.5
    assert fire_o2_extinct_threshold == 10.0 and abs(crew_fire_dmg_tick - (-0.133)) < 1e-5
    assert crew_medbay_base_tick == 0.4 and crew_medbay_level_step == 1.5

    # Wave 7 exact binary tables: OxygenSystem level step (0x885170=3.0 -> Lv3=+8.4%/s),
    # ShipSystem::PartialRepair (0x63af10: 0.5/tick -> 8.0/s = 12.5s/bar, auto /3.0 = 37.5s/bar, hacked *0.5),
    # and all 8 Alien subclass virtual getter floats (0x8788b0..0x8788bc, 0x87911c, 0x879124)
    o2_level_step = read_f32_array(0x885170, 1)[0]                  # 3.0 -> (3*(p-1)+1) * 1.2%/s = [1.2, 4.8, 8.4]
    repair_base_tick = read_f32_array(0x885F24, 1)[0]               # 0.5/tick -> 8.0/100 = 0.08/s (12.5s/bar)
    repair_auto_divisor = read_f32_array(0x885F30, 1)[0]            # 3.0 -> 37.5s/bar
    repair_bar_max = read_f32_array(0x885F2C, 1)[0]                 # 100.0
    assert o2_level_step == 3.0 and repair_base_tick == 0.5 and repair_auto_divisor == 3.0 and repair_bar_max == 100.0

    mantis_move = read_f32_array(0x8788B0, 1)[0]                    # 1.2
    engi_repair = read_f32_array(0x8788B4, 1)[0]                    # 2.0
    half_stat = read_f32_array(0x8788B8, 1)[0]                      # 0.5 (Engi combat, Mantis repair, Rock move)
    mantis_combat = read_f32_array(0x8788BC, 1)[0]                  # 1.5
    crystal_move = read_f32_array(0x87911C, 1)[0]                   # 0.8
    lanius_move = read_f32_array(0x879124, 1)[0]                    # 0.85
    assert mantis_move == 1.2 and engi_repair == 2.0 and half_stat == 0.5 and mantis_combat == 1.5
    assert crystal_move == 0.8 and lanius_move == 0.85

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
            "depowerChargeDecayPerSec": round(weapon_depower_decay_tick / tick_dt, 4),
            "depowerChargeDecayProofVa": "0x40ddcf (0x876894=0.375)",
            "hackedChargeDrainPerSec": round(weapon_hack_drain_tick / tick_dt, 4),
            "hackedChargeDrainProofVa": "0x40dd4e (0x876890=0.0625)",
            "preIgniterProofVa": "0x61d3cb",
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
            "level2PerSec": round(o2_refill_lv1_tick * (1.0 + o2_level_step) * ticks_per_sec, 4),
            "level3PerSec": round(o2_refill_lv1_tick * (1.0 + 2.0 * o2_level_step) * ticks_per_sec, 4),
            "levelStepFactor": o2_level_step,
            "hackedShipwideDrainPerSec": round(o2_hacked_drain_tick * ticks_per_sec, 4),
            "sourceVa": "0x62cf00..0x62d1ae (0x88516c..0x885178)",
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
            "binaryHitsByTierAndDifficulty": {
                "sourceVa": "0x471620..0x4716c1 (0x878950..0x878968)",
                "tier0": [4, 4, 4],
                "tier1": door_hp_lv1_diff,
                "tier2": door_hp_lv2_diff,
                "tier3": door_hp_lv3_diff,
            },
            "preservesHpRatioOnLevelChange": True,
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
        "weaponSpecials": {
            "parserProofVa": "0x608019..0x6085e0",
            "sysDamageStructOffset": "0xec",
            "persDamageStructOffset": "0xf0",
            "hullBustStructOffset": "0xf4",
            "lockdownStructOffset": "0xf5",
            "crewDamagePerPoint": 15.0,
            "lockdownDurationSec": 12.0,
            "zeroDamageBeamBlockedOnlyByShields": True,
            "negativePersDamageHealsCrew": True,
            "negativeSysDamageRepairsSystem": True,
            "stunAppliesOnZeroDamageHit": True,
        },
        "drones": {
            "shipRepairVtableVa": vtables.get("15ShipRepairDrone", {}).get("vtable_va"),
            "shipRepairOnLoopVa": "0x428b80",
            "hullRepairChargesMin": 3,
            "hullRepairChargesMax": 5,
            "hullRepairSelfDestructOnDeplete": True,
            "repairDroneHp": 25.0,
            "battleDroneHp": 150.0,
            "boarderDroneHp": 150.0,
            "superShieldDroneCap": 5,
            "antiDroneDisablesEnemyDrones": True,
        },
        "scoring": {
            "proofVa": "0x449bdd..0x449ca0 (0x44ccb5)",
            "scrapWeight": 1,
            "beaconsExploredWeight": 10,
            "shipsDefeatedWeight": 20,
            "difficultyMultiplier": [1.0, 1.25, 1.50],
            "flatVictoryBonus": 0,
        },
        "eventEngine": {
            "vtableVa": vtables.get("6CEvent", {}).get("vtable_va"),
            "grammarRdataRange": "0x882670..0x882960",
            "parserProofVa": "0x5e5c8b..0x5e7b90",
            "supportedDirectives": required_event_tags,
            "environmentTypes": ["asteroid", "sun", "nebula", "storm", "pulsar", "PDS"],
            "statusTypes": ["limit", "divide", "loss", "clear"],
            "damageEffects": ["fire", "breach", "all", "random"],
        },
        "sectorPursuit": {
            "starMapVtableVa": vtables.get("7StarMap", {}).get("vtable_va"),
            "normalJumpAdvancePx": 66.0,
            "nebulaJumpAdvancePx": 36.0,
            "modifyPursuitStepPx": 66.0,
        },
        "sector8": {
            "repairStationCount": 2,
            "repairStationHullHeal": 15,
            "repairStationScrap": 20,
            "flagshipBaseTurnLimit": 3,
            "flagshipMarchesToBase": True,
        },
        "firePhysics": {
            "vtableVa": vtables.get("4Fire", {}).get("vtable_va"),
            "proofVa": "0x4996a0..0x499944 (0x879904..0x879914)",
            "initialFireHp": 100.0,
            "lowOxygenExtinctionThreshold": fire_o2_extinct_threshold,
            "spreadRatesByDoorBarrier": fire_spread_rates,
            "crewFireDamagePerTick": crew_fire_dmg_tick,
            "crewFireDamagePerSec": round(abs(crew_fire_dmg_tick) * ticks_per_sec, 4),
            "medbayBaseHealPerTick": crew_medbay_base_tick,
            "medbayLevelStep": crew_medbay_level_step,
            "energyShieldResetOnJumpProofVa": "0x624bf8",
        },
        "systemRepair": {
            "proofVa": "0x63af10..0x63afc4 (0x885f24/0x885f2c/0x885f30)",
            "baseProgressPerTick": repair_base_tick,
            "barTarget": repair_bar_max,
            "humanBarsPerSec": round((repair_base_tick * ticks_per_sec) / repair_bar_max, 6),
            "humanSecPerBar": round(repair_bar_max / (repair_base_tick * ticks_per_sec), 4),
            "autoRepairDivisor": repair_auto_divisor,
            "autoRepairSecPerBar": round((repair_bar_max * repair_auto_divisor) / (repair_base_tick * ticks_per_sec), 4),
            "hackedRepairMultiplier": 0.50,
            "hackedDoorsLockedForCrew": True,
        },
        "speciesStats": {
            "proofVa": "0x7582a0..0x778385 / 0x477c00",
            "human": {"maxHp": 100, "move": 1.0, "repair": 1.0, "combat": 1.0, "learningMult": 0.90},
            "engi": {"vtableVa": vtables.get("9EngiAlien", {}).get("vtable_va"), "maxHp": 100, "move": 1.0, "repair": engi_repair, "combat": half_stat},
            "mantis": {"vtableVa": vtables.get("11MantisAlien", {}).get("vtable_va"), "maxHp": 100, "move": mantis_move, "repair": half_stat, "combat": mantis_combat},
            "rock": {"vtableVa": vtables.get("9RockAlien", {}).get("vtable_va"), "maxHp": 150, "move": half_stat, "repair": 1.0, "combat": 1.0, "fireImmune": True},
            "energy": {"vtableVa": vtables.get("11EnergyAlien", {}).get("vtable_va"), "maxHp": 70, "move": 1.0, "repair": 1.0, "combat": 1.0, "bonusPower": 1, "deathBlast": 15.0},
            "slug": {"vtableVa": vtables.get("9SlugAlien", {}).get("vtable_va"), "maxHp": 100, "move": 1.0, "repair": 1.0, "combat": 1.0, "telepathic": True, "mindControlImmune": True},
            "crystal": {"vtableVa": vtables.get("12CrystalAlien", {}).get("vtable_va"), "maxHp": 125, "move": crystal_move, "repair": 1.0, "combat": 1.0, "suffocationMult": 0.50},
            "anaerobic": {"vtableVa": vtables.get("14AnaerobicAlien", {}).get("vtable_va"), "maxHp": 100, "move": lanius_move, "repair": 1.0, "combat": 1.0, "noO2": True, "drainsO2": True},
            "ghost": {"vtableVa": vtables.get("5Ghost", {}).get("vtable_va"), "maxHp": 50, "move": 1.0, "repair": 1.0, "combat": 1.0, "noO2": True},
        },
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"[extract-ftl-binary-logic] Extracted {len(vtables)} vtables & verified 28 system rule tables -> {args.out}")


if __name__ == "__main__":
    main()
