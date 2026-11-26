import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOT = Path(os.environ.get("COSMOTEER_ROOT", r"C:\Temp\Cosmoteer"))
EXTRACTED_ROOT = ROOT / "extracted_assets"
INDEX_PATH = ROOT / "data" / "asset_index.json"


class AssetIndexTests(unittest.TestCase):
    def test_checked_in_asset_index_covers_all_96_terran_parts_and_14_sfx(self) -> None:
        self.assertTrue(INDEX_PATH.is_file(), "data/asset_index.json must exist")
        idx = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        summary = idx["summary"]
        self.assertEqual(summary["missing_files"], 0)
        self.assertEqual(summary["mismatched_files"], 0)
        self.assertGreaterEqual(summary["extracted_files"], 12080)
        self.assertEqual(summary["source_files"], summary["extracted_files"])

        catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(len(idx["part_sprites"]), len(catalog["parts"]))
        for entry in catalog["parts"]:
            pid = entry["id"]
            self.assertIn(pid, idx["part_sprites"], f"missing sprite record for {pid}")
            rec = idx["part_sprites"][pid]
            self.assertTrue(
                any(k in rec for k in ("floor", "roof", "blueprint")),
                f"no sprite image mapped for {pid}",
            )

        self.assertGreaterEqual(len(idx["audio_sfx"]), 14)

    @unittest.skipUnless(
        SOURCE_ROOT.is_dir() and (EXTRACTED_ROOT / "full_manifest.json").is_file(),
        "Local Cosmoteer source and extracted_assets required for full disk parity check",
    )
    def test_extracted_assets_zero_omissions_against_source(self) -> None:
        manifest = json.loads((EXTRACTED_ROOT / "full_manifest.json").read_text(encoding="utf-8"))
        s = manifest["summary"]
        self.assertEqual(s["missing_files"], 0)
        self.assertEqual(s["mismatched_files"], 0)
        self.assertEqual(s["source_files"], s["extracted_files"])
        self.assertEqual(len(manifest["files"]), s["extracted_files"])

        # Verify web atlas exists and covers all 96 parts
        atlas_png = EXTRACTED_ROOT / "web_atlas.png"
        atlas_json = EXTRACTED_ROOT / "web_atlas.json"
        self.assertTrue(atlas_png.is_file() and atlas_png.stat().st_size > 10000)
        atlas = json.loads(atlas_json.read_text(encoding="utf-8"))
        self.assertEqual(atlas["part_count"], 96)

        # Verify every mapped sprite & audio path in asset_index.json exists in extracted_assets/Data
        idx = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        data_dir = EXTRACTED_ROOT / "Data"
        for pid, rec in idx["part_sprites"].items():
            for k in ("floor", "roof", "walls", "turret", "blueprint"):
                if k in rec:
                    self.assertTrue((data_dir / rec[k]).is_file(), f"missing {k} for {pid}: {rec[k]}")
        for key, rel in idx["audio_sfx"].items():
            self.assertTrue((data_dir / rel).is_file(), f"missing wav for {key}: {rel}")


if __name__ == "__main__":
    unittest.main()
