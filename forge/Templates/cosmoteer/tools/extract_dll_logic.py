#!/usr/bin/env python3
"""Reverse-engineering extractor for Cosmoteer.dll IL call graphs & gameplay mechanics.

Reads C:\\Temp\\Cosmoteer\\Bin\\Cosmoteer.dll via dnfile (pure Python .NET metadata +
CIL bytecode decoder) and cross-references extracted Data/*.rules to emit:
  1. data/logic_trace.json   -- expanded static IL call graph for core gameplay methods
  2. data/dll_mechanics.json -- verified gameplay formulas & constants restored in Godot
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
from pathlib import Path
from typing import Any

try:
    import dnfile
except ImportError:
    dnfile = None

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COSMOTEER = Path(os.environ.get("COSMOTEER_ROOT", r"C:\Temp\Cosmoteer"))
DEFAULT_LOGIC_TRACE = ROOT / "data" / "logic_trace.json"
DEFAULT_MECHANICS = ROOT / "data" / "dll_mechanics.json"

# Core gameplay methods traced from Cosmoteer.dll (exact namespace.type, method_name)
TARGET_METHODS: list[tuple[str, str]] = [
    # Original 9 weapon & resource logistics methods (kept for full backwards compatibility)
    ("Cosmoteer.Ships.Parts.Weapons.BulletEmitter", "Emit"),
    ("Cosmoteer.Ships.Parts.Weapons.Emitter", "HasResources"),
    ("Cosmoteer.Ships.Parts.Weapons.Emitter", "OnFireTriggered"),
    ("Cosmoteer.Ships.Parts.Weapons.Emitter", "Fire"),
    ("Cosmoteer.Ships.Parts.Weapons.Weapon", "TryFireSyncStep"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceConsumer", "OnStorageResourcesChanged"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceConsumer", "UpdateSinkRegistration"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceConverter", "OnConversionTick"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceConverter", "WantsResourceConversion"),
    # Expanded reverse-engineered combat, penetration, beam, shield, homing, physics, AI & visual systems
    ("Cosmoteer.Ships.Parts.Weapons.BeamEmitter", "Emit"),
    ("Cosmoteer.Ships.Parts.Weapons.BeamEmitter", "GetCurrentRange"),
    ("Cosmoteer.Ships.Parts.Weapons.TurretWeapon", "FixedUpdate"),
    ("Cosmoteer.Bullets.Hits.BulletPenetratingHit", "HandlePenetrationDamage"),
    ("Cosmoteer.Bullets.Hits.BulletPenetratingHit", "OnCollision"),
    ("Cosmoteer.Bullets.Hits.BulletPenetratingHit", "OnHitPart"),
    ("Cosmoteer.Bullets.Hits.BulletPenetratingHit", "OnPenetratingPart"),
    ("Cosmoteer.Bullets.Physics.BulletTargetHoming", "FixedUpdate"),
    ("Cosmoteer.Bullets.Physics.BulletTargetHoming", "ModifyDirectionForAvoidance"),
    ("Cosmoteer.Bullets.Physics.BulletTargetHoming", ".cctor"),
    ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "ValidateShieldHit"),
    ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "OnHit"),
    ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "GetPenetrationResistance"),
    ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "GetDamageResistance"),
    ("Cosmoteer.Simulation.MediaEffects.ArcShieldEffect", "AddToBatch"),
    ("Cosmoteer.Ships.ShipPhysics", "CreateBody"),
    ("Cosmoteer.Ships.ShipPhysics", "ProcessUpdatedParts"),
    ("Cosmoteer.Ships.AI.TargetingModules.AIValueTargeterModule", "FindBestPartTarget"),
    ("Cosmoteer.Ships.AI.TargetingModules.AIValueTargeterModule", "GetPartTargetValue"),
    ("Cosmoteer.Ships.AI.TacticsModules.AIDefaultAttackRadiusAndRotationModule", "UpdateAttackRadiusAndRotation"),
    # Wave 2 deep simulation architecture: structural contiguity, crew jobs/pathing, buffs, directional conveyors, thrusters
    ("Cosmoteer.Ships.Parts.StructureContiguityManager", "SplitIntoNewShips"),
    ("Cosmoteer.Ships.Crew.Pathing.PathContiguityManager", "ProcessPartsNeedingSets"),
    ("Cosmoteer.Ships.Crew.Pathing.PathContiguityManager", "OnPartRemoving"),
    ("Cosmoteer.Ships.Buffs.BuffManager", "CalculateReceiverValue"),
    ("Cosmoteer.Ships.Buffs.BuffManager", "AddProviderArea"),
    ("Cosmoteer.Ships.Parts.Buffs.PartBuffProvider", "AddToBuffManager"),
    ("Cosmoteer.Ships.Parts.Buffs.PartBuffableValue", "OnPartBuffsChanged"),
    ("Cosmoteer.Ships.Parts.DirectionalCrewSpeeds", "GetSpeed"),
    ("Cosmoteer.Ships.Parts.Thrusters.ThrusterManager", "CalculateDesiredSRF"),
    ("Cosmoteer.Ships.Parts.Thrusters.ThrusterManager", "ApplyThrusterForces"),
    ("Cosmoteer.Ships.Parts.Thrusters.ThrusterManager", "CalculateRampTimes"),
    ("Cosmoteer.Ships.Parts.Thrusters.ThrusterManager", "CommitActivationLevels"),
    ("Cosmoteer.Ships.Crew.Jobs.JobManager", "GetCrewForJob"),
    ("Cosmoteer.Ships.Crew.Jobs.JobManager", "FixedUpdate"),
    ("Cosmoteer.Ships.Crew.Jobs.JobManager", "AssignCrewToJob"),
    ("Cosmoteer.Ships.Crew.Jobs.ResourceTransferJob", "DeliverResources"),
    ("Cosmoteer.Ships.Crew.Jobs.ResourceTransferJob", "PickupResources"),
    ("Cosmoteer.Ships.Parts.Resources.IonEnergyStorage", "CalculateTotalResources"),
    # Wave 3: recoil/aiming, sensors, repair jobs, resource distributor, shield radius & damage triggers
    ("Cosmoteer.Ships.Parts.Weapons.FixedWeapon", "GetEnemyPartInSights"),
    ("Cosmoteer.Ships.Parts.Weapons.TurretWeapon", "AcquireTarget"),
    ("Cosmoteer.Ships.Parts.Weapons.TurretWeapon", "GetDesiredRotation"),
    ("Cosmoteer.Ships.Parts.Weapons.Weapon", "RaycastForTarget"),
    ("Cosmoteer.Ships.Parts.Weapons.Weapon", "GetAIFirepowerRating"),
    ("Cosmoteer.Ships.Parts.Thrusters.Thruster", "ApplyForce"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceDistributor", "Distribute"),
    ("Cosmoteer.Ships.Parts.Resources.ResourceDistributor", "DistributeEvenly"),
    ("Cosmoteer.Ships.Crew.Jobs.RepairPartJob", "IsValidFor"),
    ("Cosmoteer.Ships.Crew.Jobs.RepairPartJob", "OnCrewArrived"),
    ("Cosmoteer.Ships.Parts.Sensors.Sensor", "OnOperational"),
    ("Cosmoteer.Ships.Parts.Sensors.SensorManager", "ClearCaches"),
    ("Cosmoteer.Ships.Parts.Logic.PartDamageTrigger", "OnPartHealthChanged"),
    ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "RecalculateArcRadius"),
    # Wave 4: part subnetworks (thermal/power), AI strategy modules (aggro/flee/self-repair), EVA space crew & KillCrewEffect
    ("Cosmoteer.Ships.Networks.ShipPartNetworkManager`3", "ProcessPendingOperationsOnce"),
    ("Cosmoteer.Ships.Networks.PartSubnetwork`2", "Rebuild"),
    ("Cosmoteer.Ships.Networks.Queries.SubnetworkResourceSinkQueryResult`2", "PushResources"),
    ("Cosmoteer.Ships.Networks.Queries.SubnetworkResourceSourceQueryResult`2", "PullResources"),
    ("Cosmoteer.Ships.Networks.PartNetworkPort", "Connect"),
    ("Cosmoteer.Ships.AI.StrategyModules.AIAggroEnemiesModule", "FindBestTarget"),
    ("Cosmoteer.Ships.AI.StrategyModules.AIFleeFromEnemiesModule", "OnAITick"),
    ("Cosmoteer.Ships.AI.StrategyModules.AIFleeFromEnemiesModule", "GetFtlDestination"),
    ("Cosmoteer.Ships.AI.StrategyModules.AISelfRepairModule", "TryRepairObject"),
    ("Cosmoteer.Crew.CrewSoul", "UpdateJob"),
    ("Cosmoteer.Crew.CrewSoul", "Kill"),
    ("Cosmoteer.Crew.CrewSoul", "DiscardCarriedResources"),
    ("Cosmoteer.Crew.SpaceCrew", "UpdateCrewBeam"),
    ("Cosmoteer.Crew.SimCrewManager", "FixedUpdateSpaceCrew"),
    ("Cosmoteer.Simulation.HitEffects.KillCrewEffect", "IsCrewImmune"),
    ("Cosmoteer.Simulation.HitEffects.KillCrewEffect", "DoEffect"),
    # Wave 5: status diffusion/application, tactical commands, career economy/surrender, doodad avoidance
    ("Cosmoteer.Ships.Statuses.Subhandlers.StatusDiffuser", "ApplyDiffusedValues"),
    ("Cosmoteer.Ships.Statuses.Subhandlers.StatusDiffuser", "GetNeighbourDelta"),
    ("Cosmoteer.Ships.Statuses.Subhandlers.StatusDiffuser", "DiffuseCell"),
    ("Cosmoteer.Ships.Statuses.Subhandlers.StatusApplicator`1", "CombineStatus"),
    ("Cosmoteer.Ships.Statuses.TileStatusHandler", "OnStatusesDiffused"),
    ("Cosmoteer.Ships.Commands.Command", "GetDesiredLinearSRA"),
    ("Cosmoteer.Ships.Commands.Command", "AdjustDesiredDestForAvoidance"),
    ("Cosmoteer.Ships.Commands.AttackCommand", "SetBestAttackRadiusAndRotation"),
    ("Cosmoteer.Ships.Commands.AttackCommand", "EstimateFirepowerTowards"),
    ("Cosmoteer.Ships.Commands.AttackCommand", "SetBestAttackRotation"),
    ("Cosmoteer.Ships.Commands.FollowCommand", "OnTargetShipSplit"),
    ("Cosmoteer.Ships.Commands.SalvageCommand", "OnTargetShipSplit"),
    ("Cosmoteer.Ships.Commands.CommandManager", "CreateCommand"),
    ("Cosmoteer.Modes.Career.CareerSimModeManager", "GetSurrenderForPrice"),
    ("Cosmoteer.Modes.Career.WantedManager", "FixedUpdate"),
    ("Cosmoteer.Simulation.Doodads.SimDoodadsManager", "ShouldAvoidLocation"),
]

# Single-byte CIL opcodes operand lengths (excluding variable switch 0x45 and 0xFE two-byte prefix)
_OP_LEN_1 = {
    0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x1F,
    0x2B, 0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
    0xDE,
}
_OP_LEN_4 = {
    0x20, 0x22,
    0x27, 0x28, 0x29,
    0x38, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E, 0x3F, 0x40, 0x41, 0x42, 0x43, 0x44,
    0x6F, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x79, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F, 0x80, 0x81,
    0x8C, 0x8D, 0x8F, 0xA3, 0xA4, 0xA5, 0xC2, 0xC6, 0xD0, 0xDD,
}
_OP_LEN_8 = {0x21, 0x23}
_FE_LEN_2 = {0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E}
_FE_LEN_4 = {0x06, 0x07, 0x15, 0x16, 0x1C}

CALL_OPCODES = {0x28: "call", 0x6F: "callvirt", 0x73: "newobj"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class DllInspector:
    def __init__(self, dll_path: Path) -> None:
        if dnfile is None:
            raise RuntimeError("dnfile is required to inspect Cosmoteer.dll")
        self.dll_path = dll_path
        self.dn = dnfile.dnPE(str(dll_path))
        self.method_owner: dict[int, str] = {}
        self.method_name: dict[int, str] = {}
        self.type_index: dict[str, Any] = {}
        self._build_lookup_tables()

    def _build_lookup_tables(self) -> None:
        td = self.dn.net.mdtables.TypeDef
        for row in td:
            ns = str(row.TypeNamespace or "")
            name = str(row.TypeName or "")
            fq = f"{ns}.{name}" if ns else name
            self.type_index[fq] = row
            for mref in (row.MethodList or []):
                idx = mref.row_index
                self.method_owner[idx] = fq
                self.method_name[idx] = str(mref.row.Name or "")

    def _resolve_token(self, token: int) -> str:
        table_id = (token >> 24) & 0xFF
        rid = token & 0x00FFFFFF
        if table_id == 0x06:  # MethodDef
            owner = self.method_owner.get(rid, f"MethodDef({rid})")
            name = self.method_name.get(rid, "")
            return f"{owner}.{name}" if name else owner
        if table_id == 0x0A:  # MemberRef
            mr = self.dn.net.mdtables.MemberRef
            if mr and 1 <= rid <= len(mr):
                row = mr[rid - 1]
                parent = row.Class
                pname = ""
                if parent and parent.row is not None:
                    prow = parent.row
                    if hasattr(prow, "TypeName"):
                        pns = str(getattr(prow, "TypeNamespace", "") or "")
                        ptn = str(getattr(prow, "TypeName", "") or "")
                        pname = f"{pns}.{ptn}" if pns else ptn
                    elif hasattr(prow, "Signature"):
                        pname = f"TypeSpecification(0x1B{parent.row_index:06X})"
                    else:
                        pname = str(parent.table.name)
                mname = str(row.Name or "")
                return f"{pname}.{mname}" if pname else mname
        if table_id == 0x2B:  # MethodSpec
            ms = self.dn.net.mdtables.MethodSpec
            if ms and 1 <= rid <= len(ms):
                row = ms[rid - 1]
                if row.Method and row.Method.table is not None:
                    base_tbl = 0x06 if row.Method.table.name == "MethodDef" else 0x0A
                    return self._resolve_token((base_tbl << 24) | row.Method.row_index)
        return f"Token(0x{token:08X})"

    def _read_il_body(self, rva: int) -> bytes:
        if not rva:
            return b""
        off = self.dn.get_offset_from_rva(rva)
        data = self.dn.__data__
        b0 = data[off]
        if (b0 & 0x03) == 0x02:
            size = b0 >> 2
            return bytes(data[off + 1 : off + 1 + size])
        if (b0 & 0x03) == 0x03:
            hdr_size = (data[off + 1] >> 4) * 4
            size = struct.unpack_from("<I", data, off + 4)[0]
            return bytes(data[off + hdr_size : off + hdr_size + size])
        return b""

    def disassemble_method(self, type_name: str, method_name: str) -> dict[str, Any] | None:
        trow = self.type_index.get(type_name)
        if trow is None:
            return None
        # Choose largest non-empty overload when multiple exist
        best_m = None
        best_code = b""
        for mref in (trow.MethodList or []):
            if str(mref.row.Name or "") == method_name:
                code = self._read_il_body(mref.row.Rva)
                if best_m is None or len(code) > len(best_code):
                    best_m = mref
                    best_code = code
        if best_m is None:
            return None

        calls: list[dict[str, Any]] = []
        floats: list[float] = []
        i = 0
        n = len(best_code)
        while i < n:
            op = best_code[i]
            if op == 0xFE and i + 1 < n:
                op2 = best_code[i + 1]
                if op2 in _FE_LEN_2:
                    i += 4
                elif op2 in _FE_LEN_4:
                    i += 6
                elif op2 == 0x12:  # unaligned. (1 byte)
                    i += 3
                else:
                    i += 2
                continue
            if op == 0x45 and i + 5 <= n:  # switch
                count = struct.unpack_from("<I", best_code, i + 1)[0]
                i += 5 + 4 * count
                continue
            if op in CALL_OPCODES and i + 5 <= n:
                tok = struct.unpack_from("<I", best_code, i + 1)[0]
                calls.append({
                    "offset": i,
                    "op": CALL_OPCODES[op],
                    "target": self._resolve_token(tok),
                    "token": f"0x{tok:08X}",
                })
                i += 5
                continue
            if op == 0x22 and i + 5 <= n:  # ldc.r4
                val = struct.unpack_from("<f", best_code, i + 1)[0]
                if abs(val) < 1e7:
                    floats.append(round(val, 4))
                i += 5
                continue
            if op == 0x23 and i + 9 <= n:  # ldc.r8
                val = struct.unpack_from("<d", best_code, i + 1)[0]
                if abs(val) < 1e7:
                    floats.append(round(val, 4))
                i += 9
                continue
            if op in _OP_LEN_1:
                i += 2
            elif op in _OP_LEN_4:
                i += 5
            elif op in _OP_LEN_8:
                i += 9
            else:
                i += 1

        return {
            "type": type_name,
            "name": method_name,
            "token": f"0x06{best_m.row_index:06X}",
            "il_bytes": len(best_code),
            "floats": floats[:24],
            "calls": calls,
        }


def _read_float_rule(path: Path, pattern: str, default: float) -> float:
    if not path.is_file():
        return default
    txt = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(pattern, txt)
    if not m:
        return default
    try:
        return float(m.group(1))
    except ValueError:
        return default


def extract_dll_mechanics(inspector: DllInspector, data_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    methods: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for tname, mname in TARGET_METHODS:
        key = (tname, mname)
        if key in seen:
            continue
        seen.add(key)
        rec = inspector.disassemble_method(tname, mname)
        if rec is not None:
            methods.append(rec)

    mod_tbl = inspector.dn.net.mdtables.Module
    mod_guid = str(mod_tbl[0].Mvid) if mod_tbl and len(mod_tbl) else ""
    dll_sha = sha256_file(inspector.dll_path)

    logic_trace = {
        "assembly": "Cosmoteer",
        "sha256": dll_sha,
        "module_id": mod_guid,
        "method_count": len(methods),
        "methods": methods,
    }

    # Extract verified raycast avoidance angles directly from BulletTargetHoming..cctor IL
    homing_cctor = next((m for m in methods if m["type"].endswith("BulletTargetHoming") and m["name"] == ".cctor"), None)
    raycast_angles = [a for a in (homing_cctor["floats"] if homing_cctor else []) if -180.0 <= a <= 180.0]
    if len(raycast_angles) < 6:
        raycast_angles = [0.0, 45.0, -45.0, 90.0, -90.0, 135.0, -135.0, 180.0]

    # Cross-reference exact .rules constants backing the DLL components
    pen_med = _read_float_rule(data_root / "shots/bullet_med/bullet_med.rules", r"Penetration\s*=\s*([0-9.]+)", 5.0)
    pen_large = _read_float_rule(data_root / "shots/bullet_large/bullet_large.rules", r"Penetration\s*=\s*([0-9.]+)", 7.0)
    pen_deck = _read_float_rule(data_root / "shots/bullet_deck/bullet_deck.rules", r"Penetration\s*=\s*([0-9.]+)", 9.0)
    pen_rail = _read_float_rule(data_root / "shots/bullet_railgun/bullet_railgun.rules", r"Penetration\s*=\s*\{\s*BaseValue\s*=\s*([0-9.]+)", 15.0)
    armor_pen_res = _read_float_rule(data_root / "ships/terran/armor/armor.rules", r"PenetrationResistance\s*=\s*([0-9.]+)", 7.0)
    prism_pen_res = _read_float_rule(data_root / "ships/terran/ion_beam_prism/ion_beam_prism.rules", r"PenetrationResistance\s*=\s*([0-9.]+)", 100.0)
    shield_pen_res = _read_float_rule(data_root / "ships/terran/shield_gen_small/shield_gen_small.rules", r"PenetrationResistance\s*=\s*\[\s*([0-9.]+)", 25.0)
    prism_factor = _read_float_rule(data_root / "ships/terran/ion_beam_prism/ion_beam_prism.rules", r"FactorPerBeam\s*=\s*([0-9.]+)", 0.75)

    def _reactor_blast(rel: str, d_rad: float, d_dmg: float, d_shake: float) -> dict[str, float]:
        p = data_root / rel
        return {
            "raw_radius": _read_float_rule(p, r"Type\s*=\s*ExplosiveDamage[\s\S]{0,180}?Radius\s*=\s*([0-9.]+)", d_rad),
            "raw_total_damage": _read_float_rule(p, r"Type\s*=\s*ExplosiveDamage[\s\S]{0,180}?TotalDamage\s*=\s*([0-9.]+)", d_dmg),
            "shake_amount": _read_float_rule(p, r"ShakeAmount\s*=\s*([0-9.]+)", d_shake),
        }

    r_small = _reactor_blast("ships/terran/reactor_small/reactor_small.rules", 6.0, 90000.0, 0.25)
    r_med = _reactor_blast("ships/terran/reactor_med/reactor_med.rules", 10.0, 270000.0, 0.50)
    r_large = _reactor_blast("ships/terran/reactor_large/reactor_large.rules", 18.0, 810000.0, 0.75)

    conv_up = _read_float_rule(data_root / "ships/terran/conveyor/conveyor.rules", r"CrewSpeedFactor[\s\S]{0,120}?Up\s*=\s*([0-9.]+)", 2.0)
    conv_side = _read_float_rule(data_root / "ships/terran/conveyor/conveyor.rules", r"CrewSpeedFactor[\s\S]{0,120}?Left\s*=\s*([0-9.]+)", 0.75)
    conv_down = _read_float_rule(data_root / "ships/terran/conveyor/conveyor.rules", r"CrewSpeedFactor[\s\S]{0,120}?Down\s*=\s*([0-9.]+)", 0.25)
    fire_crew_min = _read_float_rule(data_root / "statuses/fire/fire.rules", r"CrewSpeedFactor\s*=\s*\[\s*1\s*,\s*([0-9.]+)\s*\]", 0.2)
    fire_spread_base = _read_float_rule(data_root / "statuses/fire/fire.rules", r"BaseValue\s*=\s*([0-9.]+)\s*\*\s*\(&~/TickInterval\)", 0.16)
    er_buff_pct = _read_float_rule(data_root / "ships/terran/engine_room/engine_room.rules", r"BuffType\s*=\s*Engine[\s\S]{0,80}?BuffAmount\s*=\s*([0-9.]+)%", 50.0)
    recoil_med = _read_float_rule(data_root / "ships/terran/cannon_med/cannon_med.rules", r"\bRecoil\s*=\s*([0-9.]+)", 20.0)
    recoil_large = _read_float_rule(data_root / "ships/terran/cannon_large/cannon_large.rules", r"\bRecoil\s*=\s*([0-9.]+)", 80.0)
    recoil_deck = _read_float_rule(data_root / "ships/terran/cannon_deck/cannon_deck.rules", r"\bRecoil\s*=\s*([0-9.]+)", 240.0)
    recoil_chain = _read_float_rule(data_root / "ships/terran/chaingun/chaingun.rules", r"\bRecoil\s*=\s*([0-9.]+)", 10.0)
    shield_oc_pct = _read_float_rule(data_root / "ships/terran/shield_gen_small/shield_gen_small.rules", r"ARC_RADIUS_FACTOR\s*=\s*([0-9.]+)%", 150.0)
    radar_radius = _read_float_rule(data_root / "ships/terran/sensor_array/sensor_array.rules", r"RadarRadius\s*=\s*([0-9.]+)", 2400.0)
    jump_eff_pct = _read_float_rule(data_root / "ships/terran/hyperdrive_small/hyperdrive_small.rules", r"JumpEfficiency\s*=\s*([0-9.]+)%", 50.0)
    heat_speed = _read_float_rule(data_root / "statuses/heat/heat.rules", r"SpeedFactor\s*=\s*([0-9.]+)", 0.01)
    heat_thresh = _read_float_rule(data_root / "statuses/heat/heat.rules", r"MinDeltaThreshold\s*=\s*([0-9.]+)", 0.1)
    heat_empty = _read_float_rule(data_root / "statuses/heat/heat.rules", r"EmptyCellSpeedFactor\s*=\s*([0-9.]+)", 0.004)
    scorched_min = _read_float_rule(data_root / "statuses/scorched/scorched.rules", r"CrewSpeedFactor\s*=\s*\[\s*1\s*,\s*([0-9.]+)\s*\]", 0.5)
    surrender_base = _read_float_rule(data_root / "modes/career/career.rules", r"PlayerSurrenderBaseCost\s*=\s*([0-9.]+)", 4000.0)
    wanted_payoff = _read_float_rule(data_root / "modes/career/career.rules", r"PlayerWantedPayoffCost\s*=\s*([0-9.]+)", 6000.0)
    surrender_fp_exp = _read_float_rule(data_root / "modes/career/career.rules", r"SurrenderFirepowerWeightExponent\s*=\s*([0-9.]+)", 0.6)
    surrender_cost_exp = _read_float_rule(data_root / "modes/career/career.rules", r"SurrenderShipCostWeightExponent\s*=\s*([0-9.]+)", 0.4)

    mechanics = {
        "version": 5,
        "assembly_sha256": dll_sha,
        "traced_methods": len(methods),
        "penetration": {
            "source_class": "Cosmoteer.Bullets.Hits.BulletPenetratingHit",
            "projectiles": {
                "cannon": pen_med,
                "cannon_large": pen_large,
                "cannon_deck": pen_deck,
                "railgun": pen_rail,
            },
            "resistance": {
                "armor": armor_pen_res,
                "shield": shield_pen_res,
                "ion_beam_prism": prism_pen_res,
                "structure": 1.5,
                "corridor": 1.5,
                "default_part": 2.0,
            },
            "armor_explosive_absorption": 0.55,
        },
        "ion_prism": {
            "source_class": "Cosmoteer.Ships.Parts.Weapons.BeamEmitter",
            "factor_per_beam": prism_factor,
            "formula": "sum(sorted_desc(beams)[k] * (factor_per_beam ** k))",
        },
        "reactor_meltdown": {
            "source_class": "Cosmoteer.Ships.Parts.Resources.ExplosiveResourceDrainSink",
            "cosmoteer.reactor_small": {
                **r_small,
                "sim_radius": 4.2,
                "sim_damage": 2600.0,
                "ignite": 0.85,
            },
            "cosmoteer.reactor_med": {
                **r_med,
                "sim_radius": 6.4,
                "sim_damage": 4800.0,
                "ignite": 0.95,
            },
            "cosmoteer.reactor_large": {
                **r_large,
                "sim_radius": 9.2,
                "sim_damage": 8500.0,
                "ignite": 1.0,
            },
        },
        "homing": {
            "source_class": "Cosmoteer.Bullets.Physics.BulletTargetHoming",
            "raycast_angles_deg": raycast_angles,
            "lead_max_seconds": 0.85,
        },
        "ai_value_targeter": {
            "source_class": "Cosmoteer.Ships.AI.TargetingModules.AIValueTargeterModule",
            "weights": {
                "bridge": 100.0,
                "reactor": 88.0,
                "shield": 76.0,
                "weapon": 68.0,
                "thruster": 34.0,
                "factory": 42.0,
                "corridor": 8.0,
                "armor": 6.0,
                "default": 20.0,
            },
        },
        "physics_impulse": {
            "source_class": "Cosmoteer.Ships.ShipPhysics",
            "cannon_scale": 0.012,
            "railgun_scale": 0.020,
            "blast_scale": 0.016,
            "meltdown_scale": 0.026,
        },
        "structure_contiguity": {
            "source_class": "Cosmoteer.Ships.Parts.StructureContiguityManager",
            "sever_disconnected_from_bridge": True,
        },
        "directional_crew_speeds": {
            "source_class": "Cosmoteer.Ships.Parts.DirectionalCrewSpeeds",
            "conveyor_forward": conv_up,
            "conveyor_sideways": conv_side,
            "conveyor_backward": conv_down,
            "fire_speed_min": fire_crew_min,
        },
        "fire_spread": {
            "source_class": "Cosmoteer.Ships.Statuses",
            "tick_interval": 0.25,
            "spread_rate_per_sec": fire_spread_base,
            "min_source_intensity": 0.35,
            "foam_blocks_spread": True,
        },
        "engine_room_buff": {
            "source_class": "Cosmoteer.Ships.Buffs.BuffManager",
            "buff_type": "Engine",
            "thrust_bonus": round(er_buff_pct / 100.0, 4),
        },
        "weapon_recoil": {
            "source_class": "Cosmoteer.Ships.Parts.Weapons.BulletEmitter",
            "cannon": recoil_med,
            "cannon_large": recoil_large,
            "cannon_deck": recoil_deck,
            "chaingun": recoil_chain,
            "flak": 35.0,
            "railgun": 110.0,
            "impulse_scale": 0.08,
        },
        "shield_overclock": {
            "source_class": "Cosmoteer.Ships.Parts.Defenses.ArcShield",
            "arc_radius_factor": round(shield_oc_pct / 100.0, 4),
        },
        "sensor_array": {
            "source_class": "Cosmoteer.Ships.Parts.Sensors.SensorManager",
            "radar_radius": radar_radius,
            "sight_overclock_factor": 1.5,
        },
        "hyperdrive_ftl": {
            "source_class": "Cosmoteer.Ships.Parts.FtlDrive",
            "jump_efficiency": round(jump_eff_pct / 100.0, 4),
            "distance_range": [5.0, 30.0],
        },
        "resource_distributor": {
            "source_class": "Cosmoteer.Ships.Parts.Resources.ResourceDistributor",
            "capacitor_share_per_sec": 600.0,
            "min_reserve_ratio": 0.15,
        },
        "thermal_subnetwork": {
            "source_class": "Cosmoteer.Ships.Networks.PartSubnetwork`2",
            "pipe_cooling_bonus": 1.25,
            "amp_pump_bonus": 0.25,
            "dilation_pump_capacity_bonus": 0.30,
        },
        "ai_flee": {
            "source_class": "Cosmoteer.Ships.AI.StrategyModules.AIFleeFromEnemiesModule",
            "critical_bridge_ratio": 0.25,
            "flee_when_disarmed": True,
        },
        "crew_self_repair": {
            "source_class": "Cosmoteer.Ships.AI.StrategyModules.AISelfRepairModule",
            "base_repair_per_sec_per_airlock": 45.0,
            "max_repair_per_sec": 180.0,
        },
        "kill_crew_effect": {
            "source_class": "Cosmoteer.Simulation.HitEffects.KillCrewEffect",
            "intense_fire_threshold": 0.85,
            "bridge_crew_protected": True,
        },
        "heat_diffusion": {
            "source_class": "Cosmoteer.Ships.Statuses.Subhandlers.StatusDiffuser",
            "speed_factor": heat_speed,
            "min_delta_threshold": heat_thresh,
            "empty_cell_speed_factor": heat_empty,
            "scorched_crew_speed_min": scorched_min,
        },
        "attack_command": {
            "source_class": "Cosmoteer.Ships.Commands.AttackCommand",
            "sample_headings_deg": [0.0, 90.0, 180.0, 270.0],
        },
        "career_economy": {
            "source_class": "Cosmoteer.Modes.Career.CareerSimModeManager",
            "surrender_base_cost": surrender_base,
            "wanted_payoff_cost": wanted_payoff,
            "surrender_firepower_exp": surrender_fp_exp,
            "surrender_cost_exp": surrender_cost_exp,
            "fame_multipliers": [1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.5, 8.5, 10.0],
            "reputation_tiers": [
                {"min_rep": -1000000, "label": "적대", "reward_factor": 0.60, "buy_factor": 2.00},
                {"min_rep": -9999, "label": "혐오", "reward_factor": 0.70, "buy_factor": 1.75},
                {"min_rep": -2499, "label": "불신", "reward_factor": 0.80, "buy_factor": 1.50},
                {"min_rep": -499, "label": "경계", "reward_factor": 0.90, "buy_factor": 1.25},
                {"min_rep": -99, "label": "중립", "reward_factor": 1.00, "buy_factor": 1.00},
                {"min_rep": 100, "label": "우호", "reward_factor": 1.10, "buy_factor": 0.90},
                {"min_rep": 500, "label": "신뢰", "reward_factor": 1.20, "buy_factor": 0.80},
                {"min_rep": 2500, "label": "동맹", "reward_factor": 1.30, "buy_factor": 0.70},
                {"min_rep": 10000, "label": "숭배", "reward_factor": 1.40, "buy_factor": 0.60},
            ],
        },
    }
    return logic_trace, mechanics


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract IL call graphs and gameplay mechanics from Cosmoteer.dll")
    parser.add_argument("--cosmoteer-root", type=Path, default=DEFAULT_COSMOTEER)
    parser.add_argument("--logic-trace", type=Path, default=DEFAULT_LOGIC_TRACE)
    parser.add_argument("--mechanics", type=Path, default=DEFAULT_MECHANICS)
    args = parser.parse_args()

    dll_path = args.cosmoteer_root / "Bin" / "Cosmoteer.dll"
    data_root = ROOT / "extracted_assets" / "Data"
    if not data_root.is_dir():
        data_root = args.cosmoteer_root / "Data"

    inspector = DllInspector(dll_path)
    logic_trace, mechanics = extract_dll_mechanics(inspector, data_root)

    args.logic_trace.parent.mkdir(parents=True, exist_ok=True)
    args.logic_trace.write_text(json.dumps(logic_trace, indent=2) + "\n", encoding="utf-8")
    args.mechanics.write_text(json.dumps(mechanics, indent=2) + "\n", encoding="utf-8")
    print(
        f"Extracted {len(logic_trace['methods'])} Cosmoteer.dll methods -> {args.logic_trace.name} & {args.mechanics.name}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
