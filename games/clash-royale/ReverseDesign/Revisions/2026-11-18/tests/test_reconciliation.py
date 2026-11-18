"""Regression tests for research provenance and unknown-level patch boundaries.

These tests validate the offline reconstruction tool, not the original game.
"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from reconcile_research import (RESEARCH_KINDS, analyze, analyze_patch_lineage,
                                audit_references, build_outputs, read_inputs,
                                reference_level_status, write_outputs)


class ResearchReconciliationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.sources = read_inputs(ROOT)
        cls.result = analyze(cls.tables, cls.sources)
        cls.patch = cls.result["patch_lineage_audit"]

    def test_unknown_level_numeric_values_never_become_level_eleven(self):
        rows = [row for row in self.patch["expected_latest_fields"]
                if row["reference_level_status"] == "not_stated"]
        self.assertEqual(len(rows), 40)
        self.assertTrue(all(row["reference_level"] is None for row in rows))
        self.assertTrue(all(row["claim_scope"] == "value_without_reference_level" for row in rows))
        self.assertFalse(self.patch["scope"]["missing_reference_levels_inferred"])

    def test_tombstone_keeps_earlier_level_value_and_later_unknown_separate(self):
        rows = [row for row in self.patch["expected_latest_fields"]
                if (row["card_key"], row["form"], row["component"], row["key"])
                == ("tombstone", "hero", "tomb_queen", "hitpoints")]
        self.assertEqual(len(rows), 2)
        by_status = {row["reference_level_status"]: row for row in rows}
        specified, unknown = by_status["specified"], by_status["not_stated"]
        self.assertEqual((specified["reference_level"], specified["value"]), (11, 4044))
        self.assertEqual((unknown["reference_level"], unknown["value"]), (None, 4224))
        self.assertTrue(specified["has_later_unspecified_level_change"])
        self.assertEqual(specified["later_unspecified_level_patch_ids"], [unknown["lineage_patch_id"]])
        self.assertEqual(specified["claim_scope"], "earlier_level_value_with_later_unspecified_change")

    def test_void_discontinuity_is_preserved_without_asserting_equal_levels(self):
        mismatches = self.patch["numeric_mismatch_edges"]
        self.assertEqual(len(mismatches), 1)
        edge = mismatches[0]
        self.assertEqual(edge["field"]["card_key"], "void")
        self.assertEqual(edge["field"]["component"], "two_to_four_targets")
        self.assertEqual((edge["earlier"]["after"], edge["later"]["before"]), (294, 296))
        self.assertEqual(edge["scope"], "unspecified_level_candidate")
        self.assertFalse(edge["continuity_verified_within_supplied_ledger"])
        self.assertFalse(edge["level_inferred"])
        self.assertEqual(self.patch["counts"]["same_known_scope_mismatch_edges"], 0)

    def test_matching_unknown_level_number_is_only_a_candidate(self):
        edges = [edge for chain in self.patch["chains"] for edge in chain["edges"]
                 if edge["field"]["card_key"] == "wall-breakers"]
        self.assertEqual(len(edges), 1)
        self.assertTrue(edges[0]["numeric_values_match"])
        self.assertEqual(edges[0]["scope"], "unspecified_level_candidate")
        self.assertFalse(edges[0]["continuity_verified_within_supplied_ledger"])

    def test_known_balloon_level_chain_can_be_verified_within_supplied_ledger(self):
        edges = [edge for chain in self.patch["chains"] for edge in chain["edges"]
                 if edge["field"]["card_key"] == "balloon"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["earlier"]["reference_level"], 11)
        self.assertEqual(edges[0]["later"]["reference_level"], 11)
        self.assertTrue(edges[0]["continuity_verified_within_supplied_ledger"])

    def test_intervening_unknown_level_patch_is_not_skipped(self):
        chains = [chain for chain in self.patch["chains"]
                  if (chain["field"]["card_key"], chain["field"]["component"], chain["field"]["key"])
                  == ("mega-minion", "warp", "damage")]
        self.assertEqual(len(chains), 1)
        self.assertEqual(len(chains[0]["edges"]), 2)
        self.assertEqual([event["after"] for event in chains[0]["events"]], [373, 399, 422])
        self.assertTrue(all(edge["scope"] == "unspecified_level_candidate" for edge in chains[0]["edges"]))
        self.assertTrue(all(edge["numeric_values_match"] for edge in chains[0]["edges"]))

    def test_before_null_is_not_replaced_with_zero_or_counted_as_a_mismatch(self):
        self.assertEqual(self.patch["counts"]["after_only_records"], 2)
        self.assertIn("PATCH_20261019_034", self.patch["before_not_stated_record_ids"])
        row = next(row for row in self.tables["balance_patch_ledger_2026"] if row["record_id"] == "PATCH_20261019_034")
        self.assertIsNone(row["before"])
        self.assertEqual(row["after"], 0)
        self.assertTrue(any(value["lineage_patch_id"] == row["record_id"] and value["value"] == 0
                            for value in self.patch["expected_latest_fields"]))

    def test_source_native_units_remain_native(self):
        values = {row["record_id"]: row for row in self.patch["source_unit_records"]}
        row = values["PATCH_EXP_20260804_battle_healer_base_healing_radius"]
        self.assertEqual((row["before"], row["after"], row["unit"]), (4000, 3000, "source_radius_unit"))
        self.assertFalse(self.patch["scope"]["unit_conversion_performed"])

    def test_unit_change_is_a_risk_and_prevents_direct_chaining(self):
        tables = deepcopy(self.tables)
        row = next(row for row in tables["balance_patch_ledger_2026"]
                   if row["card_key"] == "fireball" and row["key"] == "crown_tower_damage")
        row["unit"] = "source_damage_unit"
        patch = analyze_patch_lineage(tables)
        self.assertTrue(any(conflict["field"]["card_key"] == "fireball" for conflict in patch["unit_conflicts"]))
        self.assertFalse(any(chain["field"]["card_key"] == "fireball" for chain in patch["chains"]))

    def test_duplicate_same_day_event_cannot_be_declared_a_verified_chain(self):
        tables = deepcopy(self.tables)
        row = deepcopy(tables["official_patch_expansion_2026"][0])
        row["record_id"] += "_DUPLICATE"
        tables["official_patch_expansion_2026"].append(row)
        patch = analyze_patch_lineage(tables)
        self.assertEqual(patch["counts"]["duplicate_events"], 1)
        edges = [edge for chain in patch["chains"] for edge in chain["edges"]
                 if row["record_id"] in (edge["earlier"]["record_id"], edge["later"]["record_id"])]
        self.assertTrue(any(edge["scope"] == "same_date_order_unresolved" for edge in edges))
        self.assertTrue(all(not edge["continuity_verified_within_supplied_ledger"] for edge in edges))

    def test_unknown_level_with_nonnul_level_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "mismatch"):
            reference_level_status({"reference_level_status": "not_stated", "reference_level": 11})
        tables = deepcopy(self.tables)
        row = next(row for row in tables["official_patch_expansion_2026"] if row["reference_level_status"] == "not_stated")
        row["reference_level"] = 11
        patch = analyze_patch_lineage(tables)
        self.assertIn(row["record_id"], [error.get("record_id") for error in patch["errors"]])

    def test_empty_related_array_is_valid_and_dangling_target_is_not(self):
        tables = {"claims": [{"record_id": "A", "source_ids": ["S"], "related_record_ids": []}]}
        sources = [{"source_id": "S", "url": "https://example.invalid/source"}]
        result = audit_references(tables, sources)
        self.assertTrue(result["valid"])
        self.assertEqual(result["rows_with_empty_related_record_ids"], 1)
        tables["claims"][0]["related_record_ids"] = ["MISSING"]
        result = audit_references(tables, sources)
        self.assertFalse(result["valid"])
        self.assertEqual(result["errors"][0]["code"], "unknown_related_record_id")

    def test_unknown_source_and_duplicate_record_id_are_reported(self):
        tables = {"a": [{"record_id": "A", "source_ids": ["UNKNOWN"]}],
                  "b": [{"record_id": "A", "source_ids": []}]}
        audit = audit_references(tables, [])
        codes = {error["code"] for error in audit["errors"]}
        self.assertIn("unknown_source_id", codes)
        self.assertIn("invalid_or_duplicate_record_id", codes)

    def test_optional_research_tables_are_counted_only_when_present(self):
        tables = {name: rows for name, rows in self.tables.items() if name not in
                  {"economy_research_v4", "mode_research_v4", "card_behavior_research_v4"}}
        before = analyze(tables, self.sources)["research_v4_summary"]
        self.assertFalse(before["research_tables"]["card_behavior_research_v4"]["present"])
        tables["card_behavior_research_v4"] = [{"record_id": "SYNTHETIC_RESEARCH", "source_ids": [],
                                               "related_record_ids": [], "research_kind": "unresolved_gap",
                                               "evidence_status": "unverified"}]
        after = analyze(tables, self.sources)["research_v4_summary"]
        self.assertTrue(after["research_tables"]["card_behavior_research_v4"]["present"])
        self.assertEqual(after["research_kind_counts"]["unresolved_gap"], before["research_kind_counts"]["unresolved_gap"] + 1)
        self.assertEqual(after["research_kind_counts"]["new_fact"], before["research_kind_counts"]["new_fact"])

    def test_missing_patch_inputs_cannot_pass_as_an_empty_success(self):
        summary = analyze({}, [])["research_v4_summary"]
        self.assertFalse(summary["validation"]["passed"])
        missing = {error["table"] for error in summary["validation"]["errors"]
                   if error["code"] == "missing_required_table"}
        self.assertEqual(missing, {"balance_patch_ledger_2026", "official_patch_expansion_2026", "verified_patch_fields_2026"})

    def test_research_totals_reconcile_without_turning_gaps_into_new_facts(self):
        summary = self.result["research_v4_summary"]
        for kind in RESEARCH_KINDS:
            self.assertEqual(summary["research_kind_counts"][kind],
                             sum(table["by_research_kind"][kind] for table in summary["research_tables"].values()))
        self.assertEqual(sum(summary["research_kind_counts"].values()), summary["counts"]["research_records"])
        self.assertIsNone(summary["scope"]["reconstruction_percentage"])
        self.assertFalse(summary["scope"]["current_gameplay_verified"])

    def test_stale_latest_view_is_detected_without_rewriting_it(self):
        tables = deepcopy(self.tables)
        row = tables["verified_patch_fields_2026"][0]
        previous = row["value"]
        row["value"] = previous + 99
        patch = analyze_patch_lineage(tables)
        self.assertFalse(patch["latest_view_comparison"]["matches"])
        self.assertTrue(any(item["record_id"] == row["record_id"] and "value" in item["differences"]
                            for item in patch["latest_view_comparison"]["field_mismatches"]))
        self.assertEqual(row["value"], previous + 99)

    def test_analysis_and_outputs_do_not_mutate_source_rows(self):
        tables, sources = deepcopy(self.tables), deepcopy(self.sources)
        original = json.dumps([tables, sources], ensure_ascii=False, sort_keys=True)
        first, _ = build_outputs(tables, sources)
        second, _ = build_outputs(tables, sources)
        self.assertEqual(first, second)
        self.assertEqual(original, json.dumps([tables, sources], ensure_ascii=False, sort_keys=True))

    def test_check_mode_detects_stale_output_without_repairing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outputs = {"reports/example.md": b"expected\n"}
            self.assertEqual(write_outputs(outputs, root, check=True), ["reports/example.md"])
            self.assertFalse((root / "reports/example.md").exists())
            write_outputs(outputs, root)
            self.assertEqual(write_outputs(outputs, root, check=True), [])
            (root / "reports/example.md").write_bytes(b"stale\n")
            self.assertEqual(write_outputs(outputs, root, check=True), ["reports/example.md"])
            self.assertEqual((root / "reports/example.md").read_bytes(), b"stale\n")


if __name__ == "__main__":
    unittest.main()
