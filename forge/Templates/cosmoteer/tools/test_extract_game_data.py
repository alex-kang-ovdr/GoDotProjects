import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES_PATH = ROOT / "data" / "extracted_rules.json"
CATALOG_PATH = ROOT / "data" / "catalog.json"


class ExtractedGameDataTests(unittest.TestCase):
    def test_extracted_rules_covers_all_parts_shots_factions_buffs_and_backgrounds(self) -> None:
        self.assertTrue(RULES_PATH.is_file(), "data/extracted_rules.json must exist")
        self.assertLess(RULES_PATH.stat().st_size, 1024 * 1024, "extracted_rules.json must stay under PlayForge 1 MB limit")
        data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

        self.assertEqual(len(data["part_specs"]), len(catalog["parts"]))
        self.assertEqual(len(data["shots"]), 20)
        self.assertEqual(len(data["factions"]), 5)
        self.assertGreaterEqual(len(data["buffs"]), 10)
        self.assertGreaterEqual(len(data["backgrounds"]), 8)
        self.assertGreaterEqual(len(data["nebulas"]), 3)
        self.assertGreaterEqual(len(data["planets"]), 7)
        self.assertGreaterEqual(len(data["sectors"]), 3)
        self.assertGreaterEqual(len(data["ai_profiles"]), 8)
        self.assertGreaterEqual(len(data["resources"]), 20)
        self.assertGreaterEqual(len(data["asteroids"]), 8)
        self.assertGreaterEqual(len(data["statuses"]), 6)
        self.assertGreaterEqual(len(data["commands"]), 6)
        self.assertGreaterEqual(len(data["formations"]), 3)
        self.assertGreaterEqual(len(data["mission_categories"]), 6)

        # Spot-check authentic extracted Cosmoteer values
        self.assertEqual(data["shots"]["bullet_deck"]["range"], 190.0)
        self.assertEqual(data["shots"]["bullet_deck"]["damage"], 7500.0)
        self.assertEqual(data["shots"]["bullet_railgun"]["range"], 300.0)
        self.assertEqual(data["shots"]["bullet_railgun"]["damage"], 10000.0)
        self.assertEqual(data["shots"]["missile_he"]["range"], 450.0)
        self.assertEqual(data["shots"]["disruptor_bolt"]["range"], 180.0)
        self.assertTrue(data["shots"]["disruptor_bolt"]["resource_drain"])
        self.assertEqual(data["shots"]["ion_beam"]["range"], 350.0)
        self.assertEqual(data["shots"]["ion_beam"]["damage"], 2500.0)

        faction_ids = {f["id"] for f in data["factions"]}
        self.assertEqual(faction_ids, {"monolith", "cabal", "imperium", "fringe", "io"})
        self.assertEqual(data["part_specs"]["cosmoteer.cannon_deck"]["firing_arc_deg"], 270.0)


if __name__ == "__main__":
    unittest.main()
