"""Tests for provenance boundaries and graph/coverage correctness.

These tests validate this data analysis tool, not original game behavior.
"""
from copy import deepcopy
from collections import Counter
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from analyze_quality import (analyze, build_outputs, make_card_coverage,
                             ARCHIVE_LINK_TABLES, PATCH_LEDGER_TABLES, combined_rows,
                             normalized_url, read_inputs, reachable_graph,
                             reference_level_status, value_null_paths)


class QualityAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.sources = read_inputs(ROOT)
        cls.result = analyze(cls.tables, cls.sources)
        cls.coverage = {r["card_key"]: r for r in cls.result["card_coverage"]}

    def test_counts_reconcile_without_claiming_reproduction_percentage(self):
        summary = self.result["quality_summary"]
        self.assertEqual(summary["counts"]["records"], sum(len(v) for v in self.tables.values()))
        self.assertEqual(summary["counts"]["records"], sum(summary["by_evidence_status"].values()))
        keys = {r["card_key"] for r in self.tables["card_catalog_2023"]}
        keys |= {r["card_key"] for r in self.tables["verified_patch_fields_2026"]}
        keys |= {r.get("original_role_reference_key") or r["key"] for r in self.tables["implementation_card_mapping"]}
        self.assertEqual(summary["counts"]["coverage_card_keys"], len(keys))
        self.assertEqual(set(self.coverage), keys)
        self.assertEqual(summary["counts"]["latest_patch_card_keys"],
                         len({r["card_key"] for r in self.tables["verified_patch_fields_2026"]}))
        self.assertEqual(summary["counts"]["tables"], len(self.tables))
        self.assertEqual(summary["package_version"], "4.0.0")
        self.assertIsNone(summary["scope"]["reconstruction_percentage"])
        self.assertFalse(summary["scope"]["current_catalog_complete"])

    def test_current_knight_does_not_inherit_archive_hitpoints(self):
        knight = self.coverage["knight"]
        self.assertTrue(knight["archive"]["present"])
        self.assertGreater(knight["archive"]["reachable_entity_count"], 0)
        tables = deepcopy(self.tables)
        archived_knight = next(r for r in tables["entity_definitions_2023"]
                              if r["entity_id"] == "characters:Knight")
        archived_knight["value"]["hitpoints"] = 987654321
        after = next(r for r in make_card_coverage(tables) if r["card_key"] == "knight")
        self.assertEqual(knight["latest_patch"], after["latest_patch"])
        self.assertFalse(knight["full_current_profile"])

    def test_pinned_archive_invariants_survive_additive_extensions(self):
        self.assertEqual(len(self.tables["card_catalog_2023"]), 120)
        self.assertEqual(len(self.tables["entity_definitions_2023"]), 532)
        self.assertEqual(len(self.tables["level_stats_2023"]), 4956)
        self.assertEqual(len(self.result["quality_summary"]["gaps"]["archive_missing_root_card_keys"]), 10)
        self.assertEqual(len(self.tables["entity_links_2023"]), 428)

    def test_reference_extensions_expand_exact_graph_without_new_roots(self):
        drill = self.coverage["goblin-drill"]["archive"]
        self.assertIn("spell:GoblinDrillDamage", drill["additional_reachable_entity_ids"])
        self.assertIn("LINK_EXT_building:GoblinDrill:spawn_area_object", drill["reference_extension_link_ids"])
        binding = next(r for r in self.tables["card_bindings_2023"] if r["key"] == "goblin-drill")
        self.assertEqual(drill["root_entity_ids"], sorted(binding["value"]))
        counts = self.result["quality_summary"]["counts"]
        self.assertEqual(counts["archive_explicit_links"], len(combined_rows(self.tables, ARCHIVE_LINK_TABLES)))
        self.assertEqual(counts["archive_extension_links"], len(self.tables["archive_reference_extensions_2023"]))

    def test_recovered_behavior_preserves_raw_zero_false_and_null(self):
        rows = {r["entity_id"]: r for r in self.coverage["tesla"]["archive"]["behavior_extensions"]}
        tesla = rows["building:Tesla"]
        self.assertEqual(tesla["fields"]["hide_time_ms"], 800)
        self.assertEqual(tesla["fields"]["attack_push_back"], 0)
        self.assertIs(tesla["fields"]["death_spawn_is_same_unit"], False)
        self.assertIsNone(tesla["fields"]["death_spawn_character3"])
        self.assertEqual(tesla["unit"], "provider_raw_units")
        self.assertIn("ARCHIVE_STATS", tesla["source_ids"])
        self.assertFalse(self.coverage["tesla"]["full_current_profile"])

    def test_unresolved_extension_stays_a_graph_barrier(self):
        tables = deepcopy(self.tables)
        row = next(r for r in tables["archive_reference_extensions_2023"]
                   if r["record_id"] == "LINK_EXT_building:GoblinDrill:spawn_area_object")
        row["resolution"] = "ambiguous"
        row["target_entity_ids"] = ["spell:GoblinDrillDamage", "spell:ElectroWizardZap"]
        coverage = {r["card_key"]: r for r in make_card_coverage(tables)}
        drill = coverage["goblin-drill"]
        self.assertNotIn("spell:GoblinDrillDamage", drill["archive"]["reachable_entity_ids"])
        self.assertIn("unresolved_entity_graph", drill["gaps"])
        self.assertIn(row["record_id"], {r["link_id"] for r in drill["archive"]["blocked_links"]})
        result = analyze(tables, self.sources)
        self.assertIn(row["record_id"], result["quality_summary"]["gaps"]["archive_unresolved_link_ids"])

    def test_extension_lineage_mismatch_is_rejected(self):
        tables = deepcopy(self.tables)
        row = tables["archive_reference_extensions_2023"][0]
        row["value"] = "NotTheRecoveredReference"
        with self.assertRaisesRegex(ValueError, "differs from recovered field"):
            analyze(tables, self.sources)

    def test_latest_patch_tuples_are_exact_not_collapsed_to_card(self):
        ids = {r["record_id"]: r for r in self.tables["verified_patch_fields_2026"]}
        reported = set()
        for card in self.coverage.values():
            for field in card["latest_patch"]["fields"]:
                raw = ids[field["record_id"]]
                self.assertEqual(card["card_key"], raw["card_key"])
                for key in ("form", "component", "key", "unit", "reference_level", "lineage_patch_id",
                            "reference_level_status", "has_later_unspecified_level_change",
                            "later_unspecified_level_patch_ids", "claim_scope"):
                    self.assertEqual(field[key], raw.get(key))
                self.assertNotIn(field["record_id"], reported)
                reported.add(field["record_id"])
        self.assertEqual(reported, set(ids))

    def test_patch_expansion_dates_and_lineages_use_both_ledgers(self):
        summary = self.result["quality_summary"]
        ledger = combined_rows(self.tables, PATCH_LEDGER_TABLES)
        ledger_ids = {r["record_id"] for r in ledger}
        expected_dates = Counter(r["effective_from"] for r in ledger)
        self.assertEqual(summary["counts"]["patch_ledger_rows"], len(ledger))
        self.assertEqual(summary["patch_evidence"]["ledger_rows_by_effective_date"], dict(expected_dates))
        self.assertEqual(summary["counts"]["latest_patch_fields"], len(self.tables["verified_patch_fields_2026"]))
        self.assertTrue({r["lineage_patch_id"] for r in self.tables["verified_patch_fields_2026"]} <= ledger_ids)
        expanded_ids = {r["record_id"] for r in self.tables["official_patch_expansion_2026"]}
        self.assertTrue(any(r["lineage_patch_id"] in expanded_ids for r in self.tables["verified_patch_fields_2026"]))

    def test_unknown_reference_levels_do_not_erase_earlier_level_uncertainty(self):
        fields = self.coverage["tombstone"]["latest_patch"]
        hp = [r for r in fields["fields"] if r["form"] == "hero" and r["component"] == "tomb_queen" and r["key"] == "hitpoints"]
        specified = next(r for r in hp if r["reference_level"] == 11)
        unknown = next(r for r in hp if r["reference_level_status"] == "not_stated")
        self.assertIsNone(unknown["reference_level"])
        self.assertTrue(specified["has_later_unspecified_level_change"])
        self.assertIn(unknown["lineage_patch_id"], specified["later_unspecified_level_patch_ids"])
        self.assertIn(specified["record_id"], fields["earlier_fields_with_later_unspecified_change_ids"])
        self.assertIn(unknown["record_id"], fields["unspecified_level_field_ids"])
        self.assertIn("later_patch_level_unspecified", self.coverage["tombstone"]["gaps"])
        self.assertFalse(self.coverage["tombstone"]["full_current_profile"])
        expected = Counter(reference_level_status(r) for r in self.tables["verified_patch_fields_2026"])
        self.assertEqual(self.result["quality_summary"]["patch_evidence"]["latest_reference_level_status_counts"], dict(expected))

    def test_inconsistent_level_metadata_is_rejected(self):
        tables = deepcopy(self.tables)
        row = tables["verified_patch_fields_2026"][0]
        row["reference_level"] = None
        row["reference_level_status"] = "specified"
        with self.assertRaisesRegex(ValueError, "Reference level/status mismatch"):
            make_card_coverage(tables)

    def test_patch_only_card_does_not_gain_archive_identity(self):
        card = self.coverage["minion-giant"]
        self.assertFalse(card["archive"]["present"])
        self.assertIsNone(card["archive"]["card_id"])
        self.assertGreater(card["latest_patch"]["field_count"], 0)
        self.assertFalse(card["full_current_profile"])

    def test_missing_fireball_root_remains_unbound(self):
        fireball = self.coverage["fireball"]
        self.assertEqual(fireball["archive"]["root_count"], 0)
        self.assertEqual(fireball["archive"]["reachable_entity_count"], 0)
        self.assertIn("missing_exact_public_key_binding", fireball["gaps"])
        # There is a Fireball entity in the archive, but a name resemblance is
        # not grounds to override the missing public-key binding.
        self.assertTrue(any("Fireball" in r["entity_id"] for r in self.tables["entity_definitions_2023"]))

    def test_deep_lava_pup_projectile_is_reachable(self):
        self.assertIn("projectile:LavaPupProjectile",
                      self.coverage["super-lava-hound"]["archive"]["reachable_entity_ids"])

    def test_graph_has_no_hop_limit_and_terminates_on_cycle(self):
        entities = {str(i): {"quarantined": False} for i in range(12)}
        links = [{"record_id": "L" + str(i), "source_entity_id": str(i),
                  "target_entity_ids": [str((i + 1) % 12)], "resolution": "resolved"}
                 for i in range(12)]
        result = reachable_graph(["0"], entities, links)
        self.assertEqual(set(result["entity_ids"]), set(entities))
        self.assertEqual(result["blocked_links"], [])

    def test_ambiguous_references_are_not_guessed(self):
        entities = {i: {"quarantined": False} for i in ("root", "a", "b")}
        link = {"record_id": "amb", "source_entity_id": "root",
                "target_entity_ids": ["a", "b"], "resolution": "ambiguous"}
        result = reachable_graph(["root"], entities, [link])
        self.assertEqual(result["entity_ids"], ["root"])
        self.assertEqual(result["blocked_links"][0]["reason"], "ambiguous")

    def test_missing_and_quarantined_targets_are_visible_barriers(self):
        entities = {"root": {"quarantined": False}, "unknown": {"quarantined": True}}
        links = [{"record_id": "L", "source_entity_id": "root",
                  "target_entity_ids": ["unknown"], "resolution": "resolved"}]
        result = reachable_graph(["root", "absent"], entities, links)
        self.assertEqual(result["entity_ids"], ["root"])
        self.assertEqual(result["missing_entity_ids"], ["absent"])
        self.assertEqual(result["blocked_links"][0]["reason"], "quarantined_entity")

    def test_custom_cards_never_claim_original_identity(self):
        for key in ("phalanx", "duelist"):
            card = self.coverage[key]
            self.assertTrue(card["implementation"]["independent_card"])
            self.assertEqual(card["implementation"]["original_archive_card_ids"], [None])
            self.assertFalse(card["archive"]["present"])
            self.assertEqual(card["latest_patch"]["field_count"], 0)

    def test_original_identity_injected_into_custom_card_is_rejected(self):
        tables = deepcopy(self.tables)
        card = next(r for r in tables["implementation_card_mapping"] if r["key"] == "phalanx")
        card["original_archive_card_id"] = 26000000
        with self.assertRaisesRegex(ValueError, "original identity"):
            make_card_coverage(tables)

    def test_partial_patch_cannot_silently_become_complete_profile(self):
        tables = deepcopy(self.tables)
        tables["verified_patch_fields_2026"][0]["full_current_card_profile"] = True
        with self.assertRaisesRegex(ValueError, "full current profile"):
            make_card_coverage(tables)

    def test_zero_false_and_unknown_have_different_counts(self):
        value = {"unknown": None, "zero": 0, "disabled": False, "slots": [None, 0, False]}
        self.assertEqual(value_null_paths(value), ["value.unknown", "value.slots[0]"])
        summary = self.result["quality_summary"]
        records = [r for rows in self.tables.values() for r in rows]
        self.assertEqual(summary["null_semantics"]["unit_is_null_records"],
                         sum(r.get("unit") is None for r in records))
        self.assertEqual(summary["null_semantics"]["unverified_evidence_records"],
                         sum(r["evidence_status"] == "unverified" for r in records))
        # Different semantics can legitimately have the same numeric count.
        self.assertIn("영구", summary["temporal"]["interpretation"])

    def test_source_aliases_and_references_are_static_counts(self):
        audit = {r["source_id"]: r for r in self.result["source_audit"]}
        self.assertEqual(set(audit), {r["source_id"] for r in self.sources})
        self.assertIn("V4_ECON_SRC_PASS", audit)
        for source in audit.values():
            self.assertEqual(source["link_check_status"], "not_checked")
            self.assertEqual(source["referenced_record_count"], sum(source["references_by_table"].values()))
        self.assertIn("COMBAT_SRC_13", audit["OFFICIAL_PATCH_2026_09"]["same_url_source_ids"])
        self.assertEqual(audit["LOCAL_CROWNFALL_44"]["resource_kind"], "local_reference")

    def test_unknown_evidence_source_and_record_references_are_rejected(self):
        tables = deepcopy(self.tables)
        row = tables["economy_research_v4"][0]
        row["source_ids"].append("NONEXISTENT_SOURCE")
        with self.assertRaisesRegex(ValueError, "Unknown source IDs"):
            analyze(tables, self.sources)
        row["source_ids"].remove("NONEXISTENT_SOURCE")
        row["related_record_ids"].append("NONEXISTENT_RECORD")
        with self.assertRaisesRegex(ValueError, "Unknown evidence record references"):
            analyze(tables, self.sources)

    def test_research_rechecks_and_unresolved_gaps_are_separate_from_new_facts(self):
        additions = self.result["quality_summary"]["research_additions"]
        economic = self.tables["economy_research_v4"]
        counts = Counter(r["research_kind"] for r in economic)
        self.assertEqual(additions["by_table"]["economy_research_v4"], dict(counts))
        gaps = [r for r in economic if r["research_kind"] == "unresolved_gap"]
        self.assertEqual(len(gaps), 5)
        self.assertTrue(all(r["value"] is None and r["evidence_status"] == "unverified" for r in gaps))
        self.assertTrue(all(r["original_client_observed"] is False for r in economic))
        self.assertGreater(counts["rechecked_claim"], 0)

    def test_url_normalization_does_not_merge_distinct_queries_or_paths(self):
        self.assertEqual(normalized_url("HTTPS://Example.COM:443/a?q=1#section"), "https://example.com/a?q=1")
        self.assertNotEqual(normalized_url("https://example.com/a?q=1"), normalized_url("https://example.com/a?q=2"))
        self.assertNotEqual(normalized_url("https://example.com/a"), normalized_url("https://example.com/a/"))
        self.assertEqual(normalized_url("implementation_reference/x.json"), "local:implementation_reference/x.json")

    def test_backlog_dependencies_are_acyclic_and_evidence_references_exist(self):
        tasks = {t["task_id"]: t for t in self.result["reconstruction_backlog"]}
        records = {r["record_id"] for rows in self.tables.values() for r in rows}
        visiting, complete = set(), set()
        def visit(task_id):
            self.assertNotIn(task_id, visiting, "Dependency cycle")
            if task_id in complete:
                return
            self.assertIn(task_id, tasks)
            visiting.add(task_id)
            for parent in tasks[task_id]["depends_on"]:
                visit(parent)
            visiting.remove(task_id)
            complete.add(task_id)
        for task in tasks.values():
            visit(task["task_id"])
            self.assertTrue(set(task["evidence_record_ids"]) <= records)
            self.assertGreater(len(task["acceptance_criteria"]), 0)
            self.assertEqual(task["original_client_observation_status"], "not_performed")
            if task["requires_original_client"]:
                self.assertIsNotNone(task["blocked_reason"])

    def test_original_interaction_cases_remain_unobserved(self):
        observations = self.result["quality_summary"]["observations"]
        cases = self.tables["interaction_cases"]
        self.assertEqual(observations["observed_true"], 0)
        self.assertEqual(observations["observed_false"], len(cases))
        self.assertEqual(observations["test_status_counts"], {"not_run": len(cases)})

    def test_generator_is_deterministic_and_has_no_timestamp_drift(self):
        self.assertEqual(build_outputs(ROOT), build_outputs(ROOT))


if __name__ == "__main__":
    unittest.main()
