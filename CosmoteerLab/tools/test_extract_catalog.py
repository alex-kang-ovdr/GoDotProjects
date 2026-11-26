"""Run with python -B -m unittest discover -s tools -p test_extract_catalog.py."""

import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from extract_catalog import Reader, Unsupported, convert, extract, extract_fields


class SubsetReaderTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.reader = Reader(self.root)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_precedence_local_override_and_nested_pointer(self):
        self.write("base.rules", 'A { HP=5; Size=[1, 2] }\nB { HP=9; Density=3 }')
        self.write("sub/item.rules", """
            Part : <../base.rules>/A, <./Data/base.rules>/B {
                Size = [2, 3] // HP=777
                Alias = &Size
                Nested { HP=100; RealHP=&../HP }
                FromSecond = &^/1/HP
                Fraction = 2 / 3
                Quoted = "semi;colon,//brackets[]{ }"
                /* multi-line comment
                   HP = 333 */
            }
        """)
        root = self.reader.load("sub/item.rules")
        part = self.reader.lookup(root, "Part")
        for key, expected in [("HP", 5), ("Density", 3), ("Nested/RealHP", 5),
                              ("FromSecond", 9), ("Fraction", 2 / 3)]:
            with self.subTest(key=key):
                self.assertEqual(convert(self.reader, self.reader.lookup(part, key), "number"), expected)
        size = self.reader.lookup(part, "Alias")
        self.assertEqual(convert(self.reader, size, "numbers"), [2, 3])
        self.assertEqual(self.reader.lookup(part, "HP").location, "base.rules:1")
        self.assertEqual(self.reader.lookup(part, "Quoted").raw, '"semi;colon,//brackets[]{ }"')

    def test_unsupported_data_retains_field_and_origin(self):
        self.write("item.rules", "Part { MissingRef=&Gone; Speed=runtime * 2; Virtual=&:/X }")
        part = self.reader.lookup(self.reader.load("item.rules"), "Part")
        diagnostics = []
        fields = {name: (name, "number") for name in ("MissingRef", "Speed", "Virtual", "Mass")}
        values, provenance = extract_fields(self.reader, part, fields, diagnostics)
        self.assertTrue(all(value is None for value in values.values()))
        self.assertEqual(provenance, {})
        self.assertEqual({row["field"] for row in diagnostics}, {"MissingRef", "Speed", "Virtual"})
        self.assertTrue(all(row["source"] == "item.rules:1" for row in diagnostics))

    def test_cycles_broken_bases_and_duplicate_fields_do_not_fall_back(self):
        self.write("cycles.rules", """
            A : B {}
            B : A {}
            Good { HP=50 }
            Bad : NoSuch, Good {}
            Duplicate { HP=100; HP=120 }
            Refs { HP=&Other; Other=&HP }
        """)
        root = self.reader.load("cycles.rules")
        for path in ("A/HP", "Bad/HP", "Duplicate/HP", "Refs/HP"):
            with self.subTest(path=path), self.assertRaises(Unsupported):
                self.reader.lookup(root, path)

    def test_registry_cannot_read_outside_data(self):
        self.write("item.rules", "Part=&<../out.rules>/Part")
        with self.assertRaisesRegex(Unsupported, "leaves the Data"):
            self.reader.lookup(self.reader.load("item.rules"), "Part")


DATA = Path(os.environ.get("COSMOTEER_DATA", "C:/Temp/Cosmoteer/Data"))
SAVED = Path(__file__).resolve().parents[1] / "data/catalog.json"


@unittest.skipUnless((DATA / "cosmoteer.rules").is_file(), "local original Data directory required")
class InstalledDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = extract(DATA)
        cls.parts = {row["id"]: row for row in cls.catalog["parts"]}

    def test_regeneration_matches_saved_snapshot(self):
        self.assertEqual(self.catalog, json.loads(SAVED.read_text(encoding="utf-8")))

    def test_registry_and_cost_coverage(self):
        self.assertEqual(len(self.parts), 96)
        resources = {row["id"]: row for row in self.catalog["resources"]}
        self.assertEqual(len(resources), 27)
        self.assertEqual(resources["steel"]["buy_price"], 25)
        for part in self.parts.values():
            self.assertTrue((DATA / part["source"]).is_file())
            self.assertGreater(part["max_health"], 0)
            self.assertEqual(len(part["size"]), 2)
            self.assertGreater(part["density"], 0)
            self.assertTrue(set(part["resources"]).issubset(resources))
        self.assertEqual(self.catalog["unresolved"], [])

    def test_baseline_stats_follow_emitter_projectile_and_inheritance(self):
        laser = self.parts["cosmoteer.laser_blaster_small"]
        reactor = self.parts["cosmoteer.reactor_small"]
        armor = self.parts["cosmoteer.armor"]
        self.assertEqual(laser["physical_rect"], [0, 1, 1, 2])
        self.assertEqual(laser["size"], [1, 3])
        self.assertEqual(laser["stats"]["battery_per_shot"], 200)
        self.assertEqual(laser["stats"]["damage"], 500)
        self.assertEqual(laser["stats"]["structural_damage"], 250)
        self.assertTrue(laser["provenance"]["stats.damage"].startswith("shots/laser_bolt_small/"))
        self.assertEqual(reactor["stats"]["production_interval"], 2 / 3)
        self.assertEqual(reactor["resources"], {"steel": 32, "coil": 82, "enriched_uranium": 8})
        self.assertTrue(reactor["provenance"]["density"].startswith("ships/base_part.rules:"))
        self.assertEqual(armor["groups"], ["Defenses", "Structure"])
        self.assertEqual(armor["health_type"], "Operational")
        self.assertEqual(self.parts["cosmoteer.structure"]["health_type"], "Structural")
        control = self.parts["cosmoteer.control_room_small"]
        self.assertEqual(control["stats"]["command_capacity"], 50)
        self.assertEqual(control["stats"]["resupply_threshold"], 500)
        self.assertEqual(control["provenance"]["stats.resupply_threshold"], control["source"] + ":87")
        self.assertEqual(self.parts["cosmoteer.crew_quarters_small"]["stats"]["crew_capacity"], 2)
        self.assertEqual(self.catalog["crew"]["base_speed"], 3.2)
        conveyor = self.parts["cosmoteer.conveyor"]
        self.assertIsNone(conveyor["crew_speed_factor"])
        self.assertEqual(conveyor["crew_speed_factor_by_direction"]["up"], 2)

    def test_standard_thrusters_resolve_actual_nozzles_and_unbuffed_rates(self):
        cases = {
            "small": (400, 0, 0, 30, 1000, 1, [90]),
            "small_2way": (400, 0, 0, 30, 1000, 2, [90, 0]),
            "small_3way": (400, 0, 0, 30, 1000, 3, [90, 0, 180]),
            "med": (1300, 1, 2, 100, 2000, 2, [90]),
            "large": (3600, 2, 2, 200, 4000, 4, [90]),
            "huge": (8000, 4, 2, 400, 8000, 8, [90]),
        }
        for name, (force, ramp, recovery, fuel, capacity, command, angles) in cases.items():
            with self.subTest(name=name):
                row = self.parts["cosmoteer.thruster_" + name]
                stats = row["stats"]
                self.assertEqual(stats["battery_capacity"], capacity)
                self.assertEqual(stats["command_required"], command)
                self.assertEqual(stats["resupply_threshold"], 1000 if name == "huge" else 500)
                self.assertEqual(stats["fuel_resource"], "battery")
                self.assertEqual([n["rotation_deg"] for n in stats["nozzles"]], angles)
                for i, nozzle in enumerate(stats["nozzles"]):
                    for key, expected in {"thrust_force": force, "ramp_up": ramp, "ramp_down": 0,
                                          "recovery_time": recovery, "fuel_per_second": fuel,
                                          "min_activation": 0, "max_activation": 1}.items():
                        self.assertEqual(nozzle[key], expected)
                    source, line = row["provenance"][f"stats.nozzles.{i}.rotation_deg"].rsplit(":", 1)
                    original_line = (DATA / source).read_text(encoding="utf-8-sig").splitlines()[int(line) - 1]
                    self.assertIn(f"Rotation = {angles[i]}d", original_line)
                if name.startswith("small"):
                    self.assertEqual([stats["production_quantity"], stats["production_interval"]], [30, 6])
                    self.assertEqual(stats["battery_toggle_on"], 30)
                    self.assertEqual(stats["self_recharge_per_second"], 5)
                else:
                    self.assertNotIn("production_interval", stats)
        vector = self.parts["cosmoteer.thruster_small_3way"]["stats"]["nozzles"]
        self.assertEqual([n["location"] for n in vector], [[1.5, 1.5], [2.5, .5], [.5, .5]])

    def test_aim_drag_and_special_propulsion(self):
        laser = self.parts["cosmoteer.laser_blaster_small"]["stats"]
        self.assertEqual(laser["turret_location"], [.5, .46])
        self.assertEqual([laser[key] for key in ("turret_rotation_deg", "firing_arc_deg", "rotate_speed_deg", "fire_threshold_deg")],
                         [-90, 200, 90, 1])
        physics = self.catalog["ship_physics"]
        self.assertEqual(physics["linear_drag_coefficient"], 7.8125e-7)
        self.assertEqual(physics["linear_drag_exponent"], 4)
        self.assertEqual(physics["angular_drag_coefficient"], .4)
        self.assertEqual(physics["provenance"]["max_linear_magic_acceleration"], "ships/terran/terran.rules:18")
        self.assertEqual(physics["provenance"]["linear_drag_coefficient"], "ships/base_ship.rules:25")
        boost = self.parts["cosmoteer.thruster_boost"]["stats"]
        self.assertNotIn("nozzles", boost)
        self.assertEqual(boost["special_propulsion"]["boost_force"], 9600)
        rocket = self.parts["cosmoteer.thruster_rocket_nozzle"]["stats"]["special_propulsion"]
        self.assertEqual([rocket["base_force"], rocket["crew_required"], rocket["fuel_storage"]], [10000, 2, "CombinedBatteryStorage"])

    def test_boost_hysteresis_shutdown_and_mode_profiles(self):
        record = self.parts["cosmoteer.thruster_boost"]
        boost = record["stats"]["special_propulsion"]
        self.assertEqual([boost[k] for k in ("battery_toggle_on", "battery_toggle_off", "full_battery_gate", "full_battery_off")],
                         [5001, 0, 6000, 5999])
        self.assertEqual(boost["boost_start_gate"], "IsOperational")
        self.assertEqual(boost["boost_stop_gate_toggles"], ["BoostToggle", "CommandConsumptionToggle"])
        self.assertTrue(boost["boost_stop_gate_falling"] and boost["boost_stop_gate_inverted"])
        self.assertFalse(boost["boost_stop_gate_rising"])
        self.assertEqual(boost["boost_stop_gate"], "FullAmmoToggle")
        self.assertEqual(boost["boost_stop_drain"], -999999)
        self.assertEqual([boost["boost_drain_quantity"], boost["boost_drain_interval"], boost["boost_drain_initial_delay"]], [-10, .1, 0])
        self.assertEqual(boost["boost_auto_off_triggers"], ["BatteryDepletedTrigger", "OverclockDisabledTrigger"])
        self.assertEqual(boost["receive_other_gate"], "IsOverclocked")
        self.assertEqual(boost["overclock"]["boost_power_ramp_time"], 2)
        self.assertEqual(boost["overclock"]["boost_force_factor"], 2.5)
        for key, expected in [("normal_nozzle", [3600, 200, 2, 0, 2]), ("boost_nozzle", [9600, 450, 0, 0, 0])]:
            nozzle = boost[key]
            self.assertEqual(nozzle["location"], [1, 4.5])
            self.assertEqual(nozzle["rotation_deg"], 90)
            self.assertEqual([nozzle[k] for k in ("thrust_force", "fuel_per_second", "ramp_up", "ramp_down", "recovery_time")], expected)
        self.assertEqual(record["provenance"]["stats.special_propulsion.battery_toggle_on"], record["source"] + ":176")

    def test_rocket_alignment_stage_quota_and_stack_sources(self):
        nozzle, extender, battery = [self.parts["cosmoteer.thruster_rocket_" + name]["stats"]["special_propulsion"]
                                     for name in ("nozzle", "extender", "battery")]
        self.assertEqual([data["resupply_threshold"] for data in (nozzle, extender, battery)], [500, 500, 1000])
        self.assertEqual([data["local_battery_capacity"] for data in (nozzle, extender, battery)], [2000, 2000, 4000])
        ids = ["cosmoteer.thruster_rocket_nozzle", "cosmoteer.thruster_rocket_extender"]
        for data in (nozzle, extender):
            self.assertEqual(data["stage_capacity_limit"], 2000)
            self.assertEqual(data["aggregate_remove_mode"], "DistributeProportionallyByCapacity")
            self.assertEqual(data["stage_stack"], 1)
            previous = data["sockets"]["previous"]
            self.assertEqual([previous[k] for k in ("offset", "rotation", "left", "right", "bottom", "ids")],
                             [[0, -1], 0, 0, 3, 0, [ids[1]]])
            for key, offset, edge, value in [("left_battery", [-1, 0], "right", 0), ("right_battery", [3, 0], "left", 3)]:
                socket = data["sockets"][key]
                self.assertEqual([socket[k] for k in ("offset", "rotation", "top", "bottom", edge)], [offset, 0, 0, 2, value])
                self.assertEqual(socket["ids"], ["cosmoteer.thruster_rocket_battery"])
        self.assertEqual(extender["sockets"]["next"]["offset"], [0, 2])
        self.assertEqual(extender["sockets"]["next"]["ids"], ids)
        self.assertEqual([battery["sockets"][side]["offset"] for side in ("left", "right")], [[-1, 0], [1, 0]])
        self.assertEqual([nozzle[k] for k in ("engine_base", "thrust_exponent", "ramp_exponent", "normal_ramp_power", "overclock_ramp_power")],
                         [1, 1, .5, 1, .6])
        self.assertEqual(nozzle["operation_multiplier_range"], [1, 2])
        self.assertEqual(nozzle["crew_locations"], [[.5, 67 / 64], [2.5, 67 / 64]])
        self.assertEqual(nozzle["blocked_travel_cells"], [[1, 1], [1, 2], [1, 3]])
        self.assertEqual(extender["blocked_travel_cells"], [[1, 1]])
        self.assertTrue(nozzle["force_manhattan_path"] and extender["force_manhattan_path"])
        sources = self.parts[ids[0]]["provenance"]
        for index, line in enumerate([87, 93]):
            self.assertEqual(sources[f"stats.special_propulsion.crew_locations.{index}"], self.parts[ids[0]]["source"] + f":{line}")
        source = self.parts[ids[0]]["provenance"]["stats.special_propulsion.ramp_exponent"]
        self.assertEqual(source, "buffs/buffs.rules:126")


if __name__ == "__main__":
    unittest.main()
