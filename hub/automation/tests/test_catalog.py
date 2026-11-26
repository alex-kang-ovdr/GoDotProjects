"""Regression cases mutate temporary fixture copies, never production games."""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

AUTOMATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMATION))
from platform_check.catalog import validate_catalog  # noqa: E402

SPECS = AUTOMATION.parent / "specs"
FIXTURE = AUTOMATION / "fixtures" / "catalog_valid"


class CatalogChecksTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "project"
        shutil.copytree(FIXTURE, self.root)
        self.catalog = self.root / "catalog" / "games.json"
        self.game = self.root / "games" / "fixture-demo"
        self.manifest_path = self.game / "game.manifest.json"

    def tearDown(self):
        self.temporary.cleanup()

    def read(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def write(self, path, value):
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def run_checks(self, **kwargs):
        return validate_catalog(kwargs.get("root", self.root),
                                kwargs.get("catalog", Path("catalog/games.json")),
                                kwargs.get("specs", SPECS))

    def assert_fails(self, suffix=None, results=None):
        results = self.run_checks() if results is None else results
        failures = [row for row in results if row["status"] == "fail"]
        self.assertTrue(failures, results)
        if suffix:
            self.assertTrue(any(row["id"].endswith(suffix) for row in failures), failures)

    def test_valid_fixture_and_result_contract(self):
        results = self.run_checks()
        self.assertFalse([row for row in results if row["status"] == "fail"], results)
        self.assertEqual(len({row["id"] for row in results}), len(results))
        for row in results:
            self.assertTrue(row["id"].startswith("CAT-"))
            self.assertIn(row["status"], ("pass", "fail", "warning", "skip"))
            self.assertTrue(all(key in row for key in ("id", "title", "status", "message")))
        self.assertEqual(next(r for r in results if r["id"] == "CAT-RUNTIME")["status"], "skip")

    def test_absolute_catalog_inside_project(self):
        self.assertFalse([r for r in self.run_checks(catalog=self.catalog) if r["status"] == "fail"])

    def test_missing_project(self):
        self.assert_fails("ROOT", self.run_checks(root=self.root / "missing"))

    def test_catalog_outside_project(self):
        outside = self.root.parent / "outside.json"
        shutil.copyfile(self.catalog, outside)
        self.assert_fails("READ", self.run_checks(catalog=outside))

    def test_catalog_duplicate_json_keys(self):
        self.catalog.write_text('{"schemaVersion":1,"schemaVersion":1,"entries":[]}', encoding="utf-8")
        self.assert_fails("READ")

    def test_invalid_json(self):
        self.catalog.write_text("{bad", encoding="utf-8")
        self.assert_fails("READ")

    def test_nonstandard_nan_json_rejected(self):
        self.catalog.write_text('{"schemaVersion":NaN,"entries":[]}', encoding="utf-8")
        self.assert_fails("READ")

    def test_duplicate_id_with_different_enabled_flag(self):
        catalog = self.read(self.catalog)
        second = dict(catalog["entries"][0], enabled=False)
        catalog["entries"].append(second)
        self.write(self.catalog, catalog)
        self.assert_fails("UNIQUE-ID")

    def test_duplicate_path(self):
        catalog = self.read(self.catalog)
        catalog["entries"].append(dict(catalog["entries"][0], id="another-game"))
        self.write(self.catalog, catalog)
        self.assert_fails("UNIQUE-PATH")

    def test_path_must_match_id(self):
        catalog = self.read(self.catalog)
        catalog["entries"][0]["path"] = "games/another-game"
        self.write(self.catalog, catalog)
        self.assert_fails("READ")

    def test_path_traversal(self):
        catalog = self.read(self.catalog)
        catalog["entries"][0]["path"] = "../outside"
        self.write(self.catalog, catalog)
        self.assert_fails("CONTRACT")

    def test_missing_game_folder(self):
        shutil.rmtree(self.game)
        self.assert_fails("READ")

    def test_missing_manifest(self):
        self.manifest_path.unlink()
        self.assert_fails("READ")

    def test_manifest_id_and_slug_must_match(self):
        manifest = self.read(self.manifest_path)
        manifest.update(id="wrong-id", slug="wrong-slug")
        self.write(self.manifest_path, manifest)
        self.assert_fails("IDENTITY")

    def test_slug_collision(self):
        other = self.root / "games" / "second-fixture"
        shutil.copytree(self.game, other)
        manifest = self.read(other / "game.manifest.json")
        manifest["id"] = "second-fixture"
        self.write(other / "game.manifest.json", manifest)
        catalog = self.read(self.catalog)
        catalog["entries"].append({"id": "second-fixture", "path": "games/second-fixture", "enabled": True})
        self.write(self.catalog, catalog)
        self.assert_fails("UNIQUE-SLUG")

    def test_disabled_entry_excluded_from_index_intent(self):
        catalog = self.read(self.catalog)
        catalog["entries"][0]["enabled"] = False
        self.write(self.catalog, catalog)
        results = self.run_checks()
        self.assertFalse([r for r in results if r["status"] == "fail"])
        intent = next(r for r in results if r["id"] == "CAT-PUBLISH-INTENT")["evidence"]
        self.assertEqual(intent, {"enabled": [], "disabled": ["fixture-demo"], "indexable": []})

    def test_disabled_does_not_bypass_file_validation(self):
        catalog = self.read(self.catalog)
        catalog["entries"][0]["enabled"] = False
        self.write(self.catalog, catalog)
        (self.game / "index.html").unlink()
        self.assert_fails("ENTRY")

    def test_missing_entry(self):
        (self.game / "index.html").unlink()
        self.assert_fails("ENTRY")

    def test_empty_entry(self):
        (self.game / "index.html").write_text("", encoding="utf-8")
        self.assert_fails("ENTRY")

    def test_missing_cover(self):
        (self.game / "assets" / "cover.png").unlink()
        self.assert_fails("MEDIA")

    def test_false_image_header(self):
        (self.game / "assets" / "cover.png").write_bytes(b"not a PNG")
        self.assert_fails("MEDIA")

    def use_svg(self, source):
        (self.game / "assets" / "cover.svg").write_text(source, encoding="utf-8")
        manifest = self.read(self.manifest_path)
        manifest["media"]["cover"] = "assets/cover.svg"
        self.write(self.manifest_path, manifest)

    def test_safe_svg_profile(self):
        self.use_svg('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><title>Fixture</title><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#102a24"/><stop offset="100%" stop-color="#1f5747"/></linearGradient></defs><rect width="640" height="360" fill="url(#bg)"/><circle cx="40" cy="40" r="10"/><text x="20" y="100" font-family="sans-serif">Fixture</text></svg>')
        self.assertFalse([r for r in self.run_checks() if r["status"] == "fail"])

    def test_svg_unresolved_local_gradient_fragment_rejected(self):
        self.use_svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#missing)"/></svg>')
        self.assert_fails("MEDIA")

    def test_inline_svg_favicon_allowed_and_active_svg_rejected(self):
        safe_icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23102a24'/%3E%3C/svg%3E"
        (self.game / "index.html").write_text(f'<link rel="icon" href="{safe_icon}"><script src="main.js"></script>', encoding="utf-8")
        self.assertFalse([r for r in self.run_checks() if r["status"] == "fail"])

        evil_icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/svg%3E"
        (self.game / "index.html").write_text(f'<link rel="icon" href="{evil_icon}"><script src="main.js"></script>', encoding="utf-8")
        self.assert_fails("ASSETS")

        (self.game / "index.html").write_text(f'<link rel="stylesheet" href="{safe_icon}"><script src="main.js"></script>', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_extended_l10n_manifest_and_cjk_rules_length(self):
        manifest = self.read(self.manifest_path)
        manifest["referenceGame"] = "PlayForge Template (demo)"
        manifest["deployMode"] = "singleplay"
        manifest["supportedLocales"] = ["ko", "en", "ja", "zh-CN", "fr", "es", "pt-BR", "hi"]
        manifest["rules"] = {
            "ko": "규칙 본문은 한국어로 최소 스무 글자 이상 작성합니다.",
            "en": "Game rules in English must be at least twenty characters.",
            "zh-CN": "指挥舰船，规划炮击与航线。",
        }
        self.write(self.manifest_path, manifest)
        self.assertFalse([r for r in self.run_checks() if r["status"] == "fail"])

    def test_svg_active_content_and_external_references(self):
        for content in ['<script>alert(1)</script>', '<foreignObject/>', '<rect onclick="alert(1)"/>',
                        '<rect href="https://example.invalid/a.svg"/>',
                        '<rect fill="url(https://example.invalid/paint)"/>',
                        '<rect fill="\\75rl(https://example.invalid/paint)"/>',
                        '<rect style="fill:red"/>', '<image href="data:image/png;base64,abc"/>']:
            with self.subTest(content=content):
                self.use_svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' + content + '</svg>')
                self.assert_fails("MEDIA")

    def test_svg_doctype_entity_and_stylesheet(self):
        for prefix in ['<!DOCTYPE svg [<!ENTITY x "expanded">]>',
                       '<!DOCTYPE svg SYSTEM "https://example.invalid/evil.dtd">',
                       '<?xml-stylesheet href="https://example.invalid/a.css"?>']:
            with self.subTest(prefix=prefix):
                self.use_svg(prefix + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')
                self.assert_fails("MEDIA")

    def test_svg_namespace_size_and_xml_errors(self):
        for source in ['<svg viewBox="0 0 10 10"/>',
                       '<svg xmlns="http://www.w3.org/2000/svg"/>',
                       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"/>',
                       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 NaN 10"/>',
                       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">']:
            with self.subTest(source=source):
                self.use_svg(source)
                self.assert_fails("MEDIA")

    def test_svg_read_budget(self):
        self.use_svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')
        with patch("platform_check.catalog.MAX_SVG_BYTES", 8):
            self.assert_fails("MEDIA")

    def test_missing_html_asset(self):
        (self.game / "main.js").unlink()
        self.assert_fails("ASSETS")

    def test_external_html_resource(self):
        (self.game / "index.html").write_text('<script src="https://example.invalid/a.js"></script>', encoding="utf-8")
        with patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")):
            self.assert_fails("ASSETS")

    def test_protocol_relative_resource(self):
        (self.game / "index.html").write_text('<img src="//example.invalid/x.png">', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_encoded_html_asset_escape(self):
        (self.game / "index.html").write_text('<script src="%2e%2e/outside.js"></script>', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_base_tag_changes_asset_resolution(self):
        (self.game / "index.html").write_text('<base href="/games/other/"><script src="main.js"></script>', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_static_srcset_missing_second_asset(self):
        (self.game / "index.html").write_text('<img srcset="assets/cover.png 1x, assets/missing.png 2x">', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_nested_html_can_use_parent_asset_within_game(self):
        nested = self.game / "help"
        nested.mkdir()
        (nested / "index.html").write_text('<img src="../assets/cover.png">', encoding="utf-8")
        self.assertFalse([r for r in self.run_checks() if r["status"] == "fail"])

    def test_malformed_optional_html_attribute_does_not_crash(self):
        (self.game / "index.html").write_text('<meta http-equiv><link rel><img src>', encoding="utf-8")
        self.assert_fails("ASSETS")

    def test_symlink_asset_outside_project(self):
        outside = self.root.parent / "outside.js"
        outside.write_text("secret", encoding="utf-8")
        (self.game / "main.js").unlink()
        try:
            (self.game / "main.js").symlink_to(outside)
        except OSError as error:
            self.skipTest(f"symlink not supported: {error}")
        self.assert_fails("FILES")
        self.assert_fails("ASSETS")

    def test_symlink_directory_inside_project_is_rejected(self):
        moved = self.root / "real-game"
        self.game.rename(moved)
        try:
            self.game.symlink_to(moved, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"symlink not supported: {error}")
        self.assert_fails("READ")

    def test_casefold_asset_collision(self):
        (self.game / "MAIN.js").write_text("fixture", encoding="utf-8")
        if (self.game / "MAIN.js").samefile(self.game / "main.js"):
            self.skipTest("case-insensitive filesystem")
        self.assert_fails("FILES")

    def test_whitespace_only_seo_description(self):
        manifest = self.read(self.manifest_path)
        manifest["seo"]["description"]["ko"] = " " * 20
        self.write(self.manifest_path, manifest)
        self.assert_fails("SEO")

    def test_instructions_required_in_both_languages(self):
        manifest = self.read(self.manifest_path)
        del manifest["instructions"]["en"]
        self.write(self.manifest_path, manifest)
        self.assert_fails("MANIFEST")

    def test_active_markdown_content_rejected(self):
        manifest = self.read(self.manifest_path)
        manifest["instructions"]["en"] = "Read this script: <script>alert(1)</script>"
        self.write(self.manifest_path, manifest)
        self.assert_fails("SEO")

    def test_missing_schemas_are_reported(self):
        self.assert_fails(results=self.run_checks(specs=self.root / "missing-specs"))

    def test_external_schema_ref_never_fetches(self):
        local_specs = self.root / "specs"
        shutil.copytree(SPECS, local_specs)
        schema = self.read(local_specs / "catalog.schema.json")
        schema["$ref"] = "https://example.invalid/remote-schema"
        self.write(local_specs / "catalog.schema.json", schema)
        with patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")):
            self.assert_fails(results=self.run_checks(specs=local_specs))

    def test_json_read_budget(self):
        with patch("platform_check.catalog.MAX_JSON_BYTES", 100):
            self.assert_fails()

    def test_html_read_budget(self):
        with patch("platform_check.catalog.MAX_HTML_BYTES", 10):
            self.assert_fails("ASSETS")

    def test_tree_entry_budget(self):
        with patch("platform_check.catalog.MAX_TREE_ENTRIES", 1):
            self.assert_fails("FILES")


if __name__ == "__main__":
    unittest.main()
