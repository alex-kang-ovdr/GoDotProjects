import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COSMOTEER_ROOT = Path(os.environ.get("COSMOTEER_ROOT", r"C:\Temp\Cosmoteer"))
LOGIC_TRACE_PATH = ROOT / "data" / "logic_trace.json"
MECHANICS_PATH = ROOT / "data" / "dll_mechanics.json"


class DllLogicExtractionTests(unittest.TestCase):
    def test_checked_in_logic_trace_and_dll_mechanics_cover_core_systems(self) -> None:
        self.assertTrue(LOGIC_TRACE_PATH.is_file(), "data/logic_trace.json must exist")
        self.assertTrue(MECHANICS_PATH.is_file(), "data/dll_mechanics.json must exist")

        trace = json.loads(LOGIC_TRACE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(trace["assembly"], "Cosmoteer")
        self.assertGreaterEqual(len(trace["methods"]), 56)
        method_keys = {(m["type"], m["name"]) for m in trace["methods"]}
        for required in [
            ("Cosmoteer.Ships.Parts.Weapons.BulletEmitter", "Emit"),
            ("Cosmoteer.Ships.Parts.Weapons.BeamEmitter", "Emit"),
            ("Cosmoteer.Bullets.Hits.BulletPenetratingHit", "HandlePenetrationDamage"),
            ("Cosmoteer.Bullets.Physics.BulletTargetHoming", ".cctor"),
            ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "ValidateShieldHit"),
            ("Cosmoteer.Ships.Parts.Defenses.ArcShield", "RecalculateArcRadius"),
            ("Cosmoteer.Ships.ShipPhysics", "ProcessUpdatedParts"),
            ("Cosmoteer.Ships.AI.TargetingModules.AIValueTargeterModule", "GetPartTargetValue"),
            ("Cosmoteer.Ships.Parts.StructureContiguityManager", "SplitIntoNewShips"),
            ("Cosmoteer.Ships.Buffs.BuffManager", "CalculateReceiverValue"),
            ("Cosmoteer.Ships.Parts.DirectionalCrewSpeeds", "GetSpeed"),
            ("Cosmoteer.Ships.Parts.Thrusters.ThrusterManager", "CalculateDesiredSRF"),
            ("Cosmoteer.Ships.Crew.Jobs.JobManager", "GetCrewForJob"),
            ("Cosmoteer.Ships.Parts.Resources.ResourceDistributor", "Distribute"),
            ("Cosmoteer.Ships.Parts.Weapons.FixedWeapon", "GetEnemyPartInSights"),
            ("Cosmoteer.Ships.Parts.Weapons.TurretWeapon", "AcquireTarget"),
            ("Cosmoteer.Ships.Crew.Jobs.RepairPartJob", "OnCrewArrived"),
        ]:
            self.assertIn(required, method_keys, f"missing traced DLL method: {required}")

        mech = json.loads(MECHANICS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(mech["penetration"]["projectiles"]["cannon"], 5.0)
        self.assertEqual(mech["penetration"]["projectiles"]["cannon_large"], 7.0)
        self.assertEqual(mech["penetration"]["projectiles"]["cannon_deck"], 9.0)
        self.assertEqual(mech["penetration"]["projectiles"]["railgun"], 15.0)
        self.assertEqual(mech["penetration"]["resistance"]["armor"], 7.0)
        self.assertEqual(mech["penetration"]["resistance"]["shield"], 25.0)
        self.assertEqual(mech["penetration"]["resistance"]["ion_beam_prism"], 100.0)
        self.assertAlmostEqual(mech["ion_prism"]["factor_per_beam"], 0.75, places=4)
        self.assertIn(45.0, mech["homing"]["raycast_angles_deg"])
        self.assertIn(-45.0, mech["homing"]["raycast_angles_deg"])
        self.assertEqual(mech["reactor_meltdown"]["cosmoteer.reactor_small"]["raw_radius"], 6.0)
        self.assertEqual(mech["reactor_meltdown"]["cosmoteer.reactor_med"]["raw_radius"], 10.0)
        self.assertEqual(mech["reactor_meltdown"]["cosmoteer.reactor_large"]["raw_radius"], 18.0)
        self.assertEqual(mech["directional_crew_speeds"]["conveyor_forward"], 2.0)
        self.assertEqual(mech["directional_crew_speeds"]["conveyor_sideways"], 0.75)
        self.assertEqual(mech["directional_crew_speeds"]["conveyor_backward"], 0.25)
        self.assertAlmostEqual(mech["directional_crew_speeds"]["fire_speed_min"], 0.2, places=4)
        self.assertAlmostEqual(mech["engine_room_buff"]["thrust_bonus"], 0.5, places=4)
        self.assertTrue(mech["structure_contiguity"]["sever_disconnected_from_bridge"])
        self.assertEqual(mech["weapon_recoil"]["cannon"], 20.0)
        self.assertEqual(mech["weapon_recoil"]["cannon_large"], 80.0)
        self.assertEqual(mech["weapon_recoil"]["cannon_deck"], 240.0)
        self.assertEqual(mech["weapon_recoil"]["chaingun"], 10.0)
        self.assertAlmostEqual(mech["shield_overclock"]["arc_radius_factor"], 1.5, places=4)
        self.assertEqual(mech["sensor_array"]["radar_radius"], 2400.0)
        self.assertAlmostEqual(mech["hyperdrive_ftl"]["jump_efficiency"], 0.5, places=4)

    @unittest.skipUnless(
        (COSMOTEER_ROOT / "Bin" / "Cosmoteer.dll").is_file(),
        "Installed Cosmoteer.dll required for live binary parity check",
    )
    def test_live_dll_sha256_and_regeneration_parity(self) -> None:
        import extract_dll_logic

        dll_path = COSMOTEER_ROOT / "Bin" / "Cosmoteer.dll"
        live_sha = extract_dll_logic.sha256_file(dll_path)
        trace = json.loads(LOGIC_TRACE_PATH.read_text(encoding="utf-8"))
        mech = json.loads(MECHANICS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(trace["sha256"], live_sha)
        self.assertEqual(mech["assembly_sha256"], live_sha)


if __name__ == "__main__":
    unittest.main()
