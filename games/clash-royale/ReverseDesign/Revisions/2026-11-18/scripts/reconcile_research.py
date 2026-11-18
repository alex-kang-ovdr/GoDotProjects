"""Reconcile v4 research, source references and patch lineage offline.

Only bundled JSON inputs are read. The original rows, source registries and
observation records are never edited. Run after rebuild.py, then use --check
to verify deterministic generated reports without writing anything.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-11-17"
DATASET_VERSION = "4.0.0"
SCHEMA_VERSION = "1.0.0"
PATCH_TABLES = ("balance_patch_ledger_2026", "official_patch_expansion_2026")
RESEARCH_TABLES = ("economy_research_v4", "mode_research_v4", "card_behavior_research_v4")
RESEARCH_KINDS = ("new_fact", "rechecked_claim", "unresolved_gap", "conflict")
LEVEL_STATUSES = ("specified", "not_applicable", "not_stated")
FIELD_KEYS = ("card_key", "form", "component", "key", "unit")
SCALING_UNITS = {"damage", "hitpoints", "healing", "damage_per_second"}


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def read_inputs(root=ROOT):
    """Load every JSON table and source registry; arrays of objects are required."""
    def rows(path):
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
            raise ValueError(f"Expected an array of objects: {path}")
        return value

    root = Path(root)
    tables = {path.stem: rows(path) for path in sorted((root / "data/tables").glob("*.json"))}
    sources = [row for path in sorted((root / "data/sources").glob("*.json")) for row in rows(path)]
    return tables, sources


def reference_level_status(row):
    """Mirror the rebuild contract without inferring an unstated numerical level.

    The original v3 ledger used null only for level-independent fields. Missing
    status is tolerated for those legacy rows; the audit separately rejects a
    missing status in the new expansion ledger.
    """
    status = row.get("reference_level_status")
    level = row.get("reference_level")
    if status is None:
        status = "specified" if level is not None else "not_applicable"
    if status not in LEVEL_STATUSES:
        raise ValueError("invalid reference_level_status")
    if (status == "specified") != (level is not None):
        raise ValueError("reference level/status mismatch")
    if level is not None and (isinstance(level, bool) or not isinstance(level, int) or level < 1):
        raise ValueError("reference level must be a positive integer")
    return status


def field_identity(row):
    return tuple(row.get(key) for key in FIELD_KEYS)


def _field(identity):
    return dict(zip(FIELD_KEYS, identity))


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _numbers_equal(left, right):
    return _is_number(left) and _is_number(right) and Decimal(str(left)) == Decimal(str(right))


def _event(row):
    return {
        "record_id": row["record_id"], "effective_from": row["effective_from"],
        "before": row["before"], "after": row["after"],
        "reference_level_status": reference_level_status(row),
        "reference_level": row.get("reference_level"),
        "status_origin": "explicit" if row.get("reference_level_status") is not None else "legacy_contract",
        "source_ids": row.get("source_ids", []),
    }


def _expected_latest(patches):
    ordered = sorted(patches, key=lambda row: (row["effective_from"], row["record_id"]))
    latest = {}
    for row in ordered:
        identity = (*field_identity(row), reference_level_status(row), row.get("reference_level"))
        latest[identity] = row
    result = []
    for identity, row in sorted(latest.items(), key=lambda item: repr(item[0])):
        status = reference_level_status(row)
        later = [candidate["record_id"] for candidate in ordered
                 if field_identity(candidate) == field_identity(row)
                 and reference_level_status(candidate) == "not_stated"
                 and candidate["effective_from"] > row["effective_from"]]
        result.append({
            **_field(identity[:5]), "reference_level_status": status,
            "reference_level": row.get("reference_level"), "value": row["after"],
            "lineage_patch_id": row["record_id"], "effective_from": row["effective_from"],
            "source_ids": row.get("source_ids", []),
            "has_later_unspecified_level_change": bool(later),
            "later_unspecified_level_patch_ids": later,
            "claim_scope": ("value_without_reference_level" if status == "not_stated"
                            else "earlier_level_value_with_later_unspecified_change" if later
                            else "last_record_for_identity_in_supplied_ledger"),
            "verification_scope": "latest_in_supplied_patch_ledger_only",
            "full_current_card_profile": False,
        })
    return result


def _compare_latest(expected, actual):
    def identity(row):
        return (*field_identity(row), reference_level_status(row), row.get("reference_level"))

    expected_map = {identity(row): row for row in expected}
    actual_map = {}
    invalid = []
    duplicates = []
    for row in actual:
        try:
            key = identity(row)
        except ValueError as error:
            invalid.append({"record_id": row.get("record_id"), "reason": str(error)})
            continue
        if key in actual_map:
            duplicates.append({"field": _field(key[:5]), "record_ids": [actual_map[key]["record_id"], row["record_id"]]})
        actual_map[key] = row
    missing = [expected_map[key] for key in sorted(expected_map.keys() - actual_map.keys(), key=repr)]
    extra = [actual_map[key].get("record_id") for key in sorted(actual_map.keys() - expected_map.keys(), key=repr)]
    mismatches = []
    compare_keys = ("value", "lineage_patch_id", "effective_from", "source_ids", "reference_level_status",
                    "has_later_unspecified_level_change", "later_unspecified_level_patch_ids", "claim_scope",
                    "verification_scope", "full_current_card_profile")
    for key in sorted(expected_map.keys() & actual_map.keys(), key=repr):
        wanted, found = expected_map[key], actual_map[key]
        differences = {name: {"expected": wanted[name], "actual": found.get(name)}
                       for name in compare_keys if found.get(name) != wanted[name]}
        if differences:
            mismatches.append({"record_id": found.get("record_id"), "field": _field(key[:5]),
                               "reference_level_status": key[5], "reference_level": key[6],
                               "differences": differences})
    return {"matches": not (missing or extra or mismatches or invalid or duplicates),
            "actual_count": len(actual), "expected_count": len(expected),
            "missing_identities": missing, "unexpected_record_ids": extra,
            "field_mismatches": mismatches, "invalid_rows": invalid,
            "duplicate_identities": duplicates}


def analyze_patch_lineage(tables):
    """Audit adjacent published events, keeping unknown-level edges provisional."""
    patches = [row for table in PATCH_TABLES for row in tables.get(table, [])]
    errors, warnings = [], []
    valid = []
    legacy_ids = []
    for table in PATCH_TABLES:
        for row in tables.get(table, []):
            record_id = row.get("record_id")
            try:
                status = reference_level_status(row)
            except ValueError as error:
                errors.append({"code": "invalid_level_contract", "record_id": record_id, "reason": str(error)})
                continue
            if row.get("reference_level_status") is None:
                if table == "balance_patch_ledger_2026":
                    legacy_ids.append(record_id)
                else:
                    errors.append({"code": "missing_explicit_level_status", "record_id": record_id})
            if status == "not_applicable" and row.get("unit") in SCALING_UNITS:
                warnings.append({"code": "scaling_unit_marked_level_independent", "record_id": record_id,
                                 "unit": row.get("unit")})
            if (not all(isinstance(row.get(key), str) and row[key] for key in FIELD_KEYS)
                    or not isinstance(row.get("effective_from"), str)):
                errors.append({"code": "invalid_patch_identity_or_date", "record_id": record_id})
                continue
            # Two legacy entries publish only the new value. Null before is
            # an evidence gap, not zero, and does not invalidate the new value.
            if ("before" not in row
                    or not all(_is_number(row.get(key)) for key in ("after", "value"))
                    or (row.get("before") is not None and not _is_number(row["before"]))):
                errors.append({"code": "nonnumeric_patch_value", "record_id": record_id})
                continue
            if not _numbers_equal(row["value"], row["after"]):
                errors.append({"code": "patch_value_after_mismatch", "record_id": record_id})
            valid.append(row)

    semantic_groups, field_groups, event_groups = defaultdict(list), defaultdict(list), defaultdict(list)
    for row in valid:
        identity = field_identity(row)
        semantic_groups[identity[:4]].append(row)
        field_groups[identity].append(row)
        event_groups[(*identity, reference_level_status(row), row.get("reference_level"), row["effective_from"])].append(row)
    duplicate_events = []
    for identity, rows in sorted(event_groups.items(), key=lambda item: repr(item[0])):
        if len(rows) > 1:
            duplicate_events.append({"field": _field(identity[:5]), "reference_level_status": identity[5],
                                     "reference_level": identity[6], "effective_from": identity[7],
                                     "record_ids": sorted(row["record_id"] for row in rows),
                                     "same_values": len({(row["before"], row["after"]) for row in rows}) == 1})
    unit_conflicts = []
    for identity, rows in sorted(semantic_groups.items(), key=lambda item: repr(item[0])):
        units = sorted({row["unit"] for row in rows})
        if len(units) > 1:
            unit_conflicts.append({"field": dict(zip(FIELD_KEYS[:4], identity)), "units": units,
                                   "record_ids": sorted(row["record_id"] for row in rows)})

    chains, edges = [], []
    for identity, rows in sorted(field_groups.items(), key=lambda item: repr(item[0])):
        rows = sorted(rows, key=lambda row: (row["effective_from"], row["record_id"]))
        if len(rows) < 2:
            continue
        chain_edges = []
        for earlier, later in zip(rows, rows[1:]):
            earlier_status, later_status = reference_level_status(earlier), reference_level_status(later)
            if later.get("before") is None:
                scope = "missing_endpoint_value"
            elif earlier["effective_from"] == later["effective_from"]:
                scope = "same_date_order_unresolved"
            elif "not_stated" in (earlier_status, later_status):
                scope = "unspecified_level_candidate"
            elif earlier_status == later_status and earlier.get("reference_level") == later.get("reference_level"):
                scope = "same_known_level_or_level_independent"
            elif earlier_status == later_status == "specified":
                scope = "different_specified_levels"
            else:
                scope = "incompatible_level_status"
            numeric_match = None if later.get("before") is None else _numbers_equal(earlier["after"], later["before"])
            edge = {"field": _field(identity), "earlier": _event(earlier), "later": _event(later),
                    "scope": scope, "numeric_values_match": numeric_match,
                    "continuity_verified_within_supplied_ledger": scope == "same_known_level_or_level_independent" and numeric_match,
                    "difference_later_before_minus_earlier_after": (None if later.get("before") is None
                        else float(Decimal(str(later["before"])) - Decimal(str(earlier["after"])))),
                    "level_inferred": False}
            chain_edges.append(edge)
            edges.append(edge)
        chains.append({"field": _field(identity), "events": [_event(row) for row in rows], "edges": chain_edges})

    mismatches = [edge for edge in edges if edge["numeric_values_match"] is False]
    known_scope_mismatches = [edge for edge in mismatches if edge["scope"] == "same_known_level_or_level_independent"]
    expected = _expected_latest(valid)
    later_unknown = [row for row in expected if row["has_later_unspecified_level_change"]]
    all_unknown_followups = [edge for edge in edges
                            if edge["earlier"]["reference_level_status"] != "not_stated"
                            and edge["later"]["reference_level_status"] == "not_stated"]
    for code, values in (("duplicate_patch_event", duplicate_events), ("unit_change_needs_review", unit_conflicts),
                         ("numeric_patch_chain_discontinuity", mismatches),
                         ("later_unspecified_level_change", later_unknown)):
        if values:
            warnings.append({"code": code, "count": len(values)})
    warnings.extend({"code": "incomparable_patch_edge", "earlier_record_id": edge["earlier"]["record_id"],
                     "later_record_id": edge["later"]["record_id"], "scope": edge["scope"]}
                    for edge in edges if edge["scope"] in {"same_date_order_unresolved", "incompatible_level_status"})
    status_counts = Counter(reference_level_status(row) for row in valid)
    latest_counts = Counter(row["reference_level_status"] for row in expected)
    return {
        "schema_version": SCHEMA_VERSION, "dataset_version": DATASET_VERSION, "as_of": AS_OF,
        "scope": {"original_client_observed": False, "full_current_card_profiles": False,
                  "missing_reference_levels_inferred": False, "unit_conversion_performed": False,
                  "continuity_meaning": "Adjacent supplied patch statements only; no missing update or runtime behavior is inferred."},
        "input_tables": {name: len(tables.get(name, [])) for name in PATCH_TABLES},
        "counts": {"patch_records": len(patches), "valid_patch_records": len(valid),
                   "numeric_before_after_pairs": sum(row.get("before") is not None for row in valid),
                   "after_only_records": sum(row.get("before") is None for row in valid),
                   "card_keys": len({row["card_key"] for row in valid}), "multi_event_field_chains": len(chains),
                   "adjacent_edges": len(edges), "numeric_mismatch_edges": len(mismatches),
                   "same_known_scope_mismatch_edges": len(known_scope_mismatches),
                   "unspecified_level_followup_edges": len(all_unknown_followups),
                   "latest_fields_with_later_unspecified_change": len(later_unknown),
                   "duplicate_events": len(duplicate_events), "unit_conflicts": len(unit_conflicts)},
        "by_reference_level_status": {status: status_counts[status] for status in LEVEL_STATUSES},
        "by_patch_date": dict(sorted(Counter(row["effective_from"] for row in valid).items())),
        "edge_scope_counts": dict(sorted(Counter(edge["scope"] for edge in edges).items())),
        "legacy_status_handling": {"record_count": len(legacy_ids), "record_ids": sorted(legacy_ids),
                                   "rule": "Only the original v3 ledger permits absent status: non-null level is specified, null is not_applicable."},
        "expected_latest_counts": {"total": len(expected), "card_keys": len({row["card_key"] for row in expected}),
                                   "by_reference_level_status": {status: latest_counts[status] for status in LEVEL_STATUSES},
                                   "by_specified_reference_level": dict(sorted(Counter(str(row["reference_level"]) for row in expected if row["reference_level_status"] == "specified").items())),
                                   "with_later_unspecified_change": len(later_unknown)},
        "latest_view_comparison": _compare_latest(expected, tables.get("verified_patch_fields_2026", [])),
        "expected_latest_fields": expected, "chains": chains, "numeric_mismatch_edges": mismatches,
        "unspecified_level_followups": all_unknown_followups,
        "latest_fields_with_later_unspecified_change": later_unknown,
        "duplicate_events": duplicate_events, "unit_conflicts": unit_conflicts,
        "before_not_stated_record_ids": sorted(row["record_id"] for row in valid if row.get("before") is None),
        "source_unit_records": [{**_field(field_identity(row)), "record_id": row["record_id"],
                                 "before": row["before"], "after": row["after"], "source_ids": row.get("source_ids", [])}
                                for row in sorted(valid, key=lambda row: row["record_id"]) if row["unit"].startswith("source_")],
        "errors": errors, "warnings": warnings,
    }


def audit_references(tables, sources):
    errors, warnings = [], []
    source_counts = Counter(row.get("source_id") for row in sources)
    record_locations = defaultdict(list)
    for table, rows in sorted(tables.items()):
        for row in rows:
            record_locations[row.get("record_id")].append(table)
    for source_id, count in sorted(source_counts.items(), key=lambda item: str(item[0])):
        if not isinstance(source_id, str) or not source_id or count > 1:
            errors.append({"code": "invalid_or_duplicate_source_id", "source_id": source_id, "count": count})
    for record_id, locations in sorted(record_locations.items(), key=lambda item: str(item[0])):
        if not isinstance(record_id, str) or not record_id or len(locations) > 1:
            errors.append({"code": "invalid_or_duplicate_record_id", "record_id": record_id, "tables": locations})
    references = Counter()
    related_count = related_rows = empty_related_rows = 0
    for table, rows in sorted(tables.items()):
        for row in rows:
            location = {"table": table, "record_id": row.get("record_id")}
            source_ids = row.get("source_ids")
            if not isinstance(source_ids, list) or not all(isinstance(value, str) for value in source_ids):
                errors.append({"code": "invalid_source_ids", **location})
            else:
                for source_id in source_ids:
                    references[source_id] += 1
                    if source_id not in source_counts:
                        errors.append({"code": "unknown_source_id", **location, "source_id": source_id})
            if "related_record_ids" not in row:
                continue
            related_rows += 1
            related = row["related_record_ids"]
            if not isinstance(related, list) or not all(isinstance(value, str) for value in related):
                errors.append({"code": "invalid_related_record_ids", **location})
                continue
            if not related:
                empty_related_rows += 1
            related_count += len(related)
            for record_id in related:
                if record_id not in record_locations:
                    errors.append({"code": "unknown_related_record_id", **location, "related_record_id": record_id})
            if len(related) != len(set(related)):
                warnings.append({"code": "duplicate_related_record_reference", **location})
    urls = defaultdict(list)
    for source in sources:
        if isinstance(source.get("url"), str):
            urls[source["url"]].append(source.get("source_id"))
    return {"source_record_count": len(sources), "unique_source_id_count": len(source_counts),
            "distinct_url_count": len(urls), "url_count_semantics": "Exact source URL strings; no redirects or online health checks.",
            "source_reference_count": sum(references.values()), "referenced_source_id_count": len(references),
            "references_by_source_id": dict(sorted(references.items())),
            "unused_source_ids": sorted(source_id for source_id in source_counts if isinstance(source_id, str) and source_id not in references),
            "same_url_aliases": [{"url": url, "source_ids": sorted(ids)} for url, ids in sorted(urls.items()) if len(ids) > 1],
            "source_domains": dict(sorted(Counter(urlsplit(source.get("url", "")).netloc or "local_reference" for source in sources).items())),
            "related_record_reference_count": related_count, "rows_with_related_record_ids": related_rows,
            "rows_with_empty_related_record_ids": empty_related_rows, "empty_related_record_ids_allowed": True,
            "errors": errors, "warnings": warnings, "valid": not errors}


def analyze(tables, sources):
    patch = analyze_patch_lineage(tables)
    references = audit_references(tables, sources)
    errors = list(references["errors"]) + list(patch["errors"])
    warnings = list(references["warnings"]) + list(patch["warnings"])
    errors.extend({"code": "missing_required_table", "table": name}
                  for name in (*PATCH_TABLES, "verified_patch_fields_2026") if name not in tables)
    if not patch["latest_view_comparison"]["matches"]:
        errors.append({"code": "latest_patch_view_stale", "expected_count": patch["expected_latest_counts"]["total"],
                       "actual_count": patch["latest_view_comparison"]["actual_count"]})
    research_names = sorted(set(RESEARCH_TABLES) | {name for name, rows in tables.items() if any("research_kind" in row for row in rows)})
    research, aggregate = {}, Counter()
    for name in research_names:
        rows = tables.get(name, [])
        kinds = Counter(row.get("research_kind", "missing") for row in rows)
        aggregate.update(kinds)
        for row in rows:
            if row.get("research_kind") not in RESEARCH_KINDS:
                errors.append({"code": "unknown_research_kind", "table": name, "record_id": row.get("record_id"),
                               "research_kind": row.get("research_kind")})
        research[name] = {"present": name in tables, "record_count": len(rows),
                          "by_research_kind": {kind: kinds[kind] for kind in RESEARCH_KINDS},
                          "by_evidence_status": dict(sorted(Counter(row.get("evidence_status", "missing") for row in rows).items())),
                          "source_ids": sorted({source_id for row in rows for source_id in row.get("source_ids", [])}),
                          "related_record_reference_count": sum(len(row.get("related_record_ids", [])) for row in rows if isinstance(row.get("related_record_ids", []), list))}
    records = [row for rows in tables.values() for row in rows]
    interactions = tables.get("interaction_cases", [])
    input_digest = hashlib.sha256(json_bytes({"tables": {name: tables[name] for name in sorted(tables)}, "sources": sources})).hexdigest()
    summary = {
        "schema_version": SCHEMA_VERSION, "dataset_version": DATASET_VERSION, "as_of": AS_OF,
        "scope": {"research_scope": "Bundled documentary evidence, historical data recovery and offline reconciliation.",
                  "full_current_game_reconstruction": False, "current_gameplay_verified": False,
                  "reconstruction_percentage": None, "research_kind_counts_are_distinct_claim_rows_not_complete_game_coverage": True},
        "input_fingerprint_sha256": input_digest,
        "counts": {"tables": len(tables), "records": len(records), "source_records": len(sources),
                   "distinct_source_urls": references["distinct_url_count"], "patch_records": patch["counts"]["patch_records"],
                   "expected_latest_patch_fields": patch["expected_latest_counts"]["total"],
                   "research_records": sum(item["record_count"] for item in research.values())},
        "table_counts": {name: len(rows) for name, rows in sorted(tables.items())},
        "evidence_status_counts": dict(sorted(Counter(row.get("evidence_status", "missing") for row in records).items())),
        "research_kind_counts": {kind: aggregate[kind] for kind in RESEARCH_KINDS},
        "research_tables": research,
        "additional_recovery_counts": {"numeric_patch_expansion": len(tables.get("official_patch_expansion_2026", [])),
                                       "archive_behavior_extensions": len(tables.get("archive_behavior_extensions_2023", [])),
                                       "archive_reference_extensions": len(tables.get("archive_reference_extensions_2023", []))},
        "patch_lineage_counts": patch["counts"], "expected_latest_counts": patch["expected_latest_counts"],
        "source_reference_audit": references,
        "original_interaction_observation": {"case_count": len(interactions),
                                             "observed_true_count": sum(row.get("observed") is True for row in interactions),
                                             "test_status_counts": dict(sorted(Counter(row.get("test_status", "missing") for row in interactions).items())),
                                             "documentary_or_offline_checks_do_not_run_original_client": True},
        "validation": {"passed": not errors, "error_count": len(errors), "warning_count": len(warnings),
                       "errors": errors, "warnings": warnings,
                       "warnings_are_preserved_evidence_limits_not_autofixed_values": True},
    }
    return {"patch_lineage_audit": patch, "research_v4_summary": summary}


def _md_cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def render_report(result, sources):
    summary, patch = result["research_v4_summary"], result["patch_lineage_audit"]
    counts, reference = summary["counts"], summary["source_reference_audit"]
    kinds = summary["research_kind_counts"]
    lines = [
        "# 조사·분석·데이터 복원 재구축 보고서 v4.0.0", "", f"기준일: {AS_OF}. 이 문서는 `scripts/reconcile_research.py`가 저장된 JSON에서 생성한다.", "",
        "## 1. 조사 범위와 결과", "",
        "공식 공지의 숫자 변경, 경제·모드·카드 동작에 관한 조사 행, 고정 역사 자료와 출처 연결을 함께 감사했다. 완전한 현행 클라이언트 데이터나 실제 전투 검증을 뜻하지 않는다. 행 수를 원작 복원율로 환산하지 않는다.", "",
        "| 항목 | 수량 |", "|---|---:|",
        f"| JSON 데이터 테이블 | {counts['tables']} |", f"| 전체 데이터 행 | {counts['records']} |",
        f"| 등록 출처 / 정확히 같은 문자열을 합친 URL | {counts['source_records']} / {counts['distinct_source_urls']} |",
        f"| 공식 숫자 패치 이력 | {counts['patch_records']} |", f"| before·after 모두 명시 / after만 명시 | {patch['counts']['numeric_before_after_pairs']} / {patch['counts']['after_only_records']} |", f"| 레벨 상태까지 구분한 최신 부분 필드 | {counts['expected_latest_patch_fields']} |",
        f"| 조사 분류가 있는 행 | {counts['research_records']} |", "",
        "최신 부분 필드는 공급된 이력 안에서의 마지막 주장이다. 카드의 모든 능력치가 복원되었다는 의미가 없으며, 기준일의 실게임 값을 모두 보증하지도 않는다.", "",
        "## 2. 새 사실·재확인·공백·충돌", "",
        "| 조사표 | 존재 | 새 사실 | 재확인 | 미해결 공백 | 충돌 |", "|---|---|---:|---:|---:|---:|",
    ]
    for name, item in summary["research_tables"].items():
        row = item["by_research_kind"]
        lines.append(f"| `{name}` | {'있음' if item['present'] else '없음'} | {row['new_fact']} | {row['rechecked_claim']} | {row['unresolved_gap']} | {row['conflict']} |")
    lines += [f"| 합계 | — | {kinds['new_fact']} | {kinds['rechecked_claim']} | {kinds['unresolved_gap']} | {kinds['conflict']} |", "",
              "`new_fact`는 이번 조사에서 추가한 주장 행이고, 완전히 새로운 게임 기능이라는 뜻은 아니다. `rechecked_claim`은 기존 주장을 재조사한 결과다. `unresolved_gap`과 `conflict`는 발견한 한계를 보존한 행으로 성공적인 수치 복구에 합산하지 않는다. 아직 없는 조사표는 0행으로 표시하며, 그 표가 생기면 다음 재생성에서 자동 집계한다.", "",
              "## 3. 패치 연속성과 레벨 경계", "",
              "| 레벨 상태 | 패치 이력 | 최신 부분 필드 | 의미 |", "|---|---:|---:|---|",]
    meanings = {"specified": "문서에 특정 레벨이 명시됨", "not_applicable": "시간·거리 등 레벨에 적용되지 않는 필드", "not_stated": "수치는 있지만 문서가 기준 레벨을 밝히지 않음"}
    for status in LEVEL_STATUSES:
        lines.append(f"| `{status}` | {patch['by_reference_level_status'][status]} | {patch['expected_latest_counts']['by_reference_level_status'][status]} | {meanings[status]} |")
    lines += ["", "미기재 레벨은 null로 보존한다. 레벨 11의 숫자와 우연히 같거나 앞뒤 패치와 연결되더라도 자동 승격하지 않는다. 기본형·진화형·히어로형과 소환물·능력의 component도 독립적으로 비교한다.", "",
              f"여러 날짜의 변경이 있는 필드는 {patch['counts']['multi_event_field_chains']}개, 인접 연결은 {patch['counts']['adjacent_edges']}개다. 숫자 불일치는 {patch['counts']['numeric_mismatch_edges']}개이며, 이 중 같은 명시 레벨 또는 레벨 비적용 범위에서의 불일치는 {patch['counts']['same_known_scope_mismatch_edges']}개다.", "",
              "### 숫자가 이어지지 않는 연결", ""]
    if patch["numeric_mismatch_edges"]:
        for edge in patch["numeric_mismatch_edges"]:
            field, earlier, later = edge["field"], edge["earlier"], edge["later"]
            label = " / ".join(str(field[key]) for key in FIELD_KEYS)
            lines += [f"- **{label}**: {earlier['effective_from']}의 after `{earlier['after']}` → {later['effective_from']}의 before `{later['before']}`. 분류 `{edge['scope']}`. 레벨·중간 패치·정밀도·원문 오류 가운데 무엇이 원인인지는 결정하지 않았다. 두 원값을 유지한다.",
                      f"  근거 레코드: `{earlier['record_id']}`, `{later['record_id']}`."]
    else:
        lines.append("공급된 인접 연결에서 발견된 수치 불일치가 없다. 누락된 패치까지 완전하다는 뜻은 아니다.")
    lines += ["", "### 명시 레벨 값 뒤의 미기재 레벨 변경", ""]
    for row in patch["latest_fields_with_later_unspecified_change"]:
        lines += [f"- **{row['card_key']} / {row['form']} / {row['component']} / {row['key']}**: 레벨 `{row['reference_level']}` 값 `{row['value']}`는 {row['effective_from']}의 주장으로 남는다. 이후 `{', '.join(row['later_unspecified_level_patch_ids'])}`가 있으므로 현재 같은 레벨의 값이라고 단정하지 않는다."]
    if not patch["latest_fields_with_later_unspecified_change"]:
        lines.append("현재 입력에서 최신 명시 레벨 필드 뒤의 미기재 레벨 변경은 없다.")
    lines += ["", "### 단위와 중복", "",
              f"동일 의미 필드의 단위 차이 {patch['counts']['unit_conflicts']}건, 동일 날짜·범위 중복 이벤트 {patch['counts']['duplicate_events']}건을 발견했다. 원문 단위를 보존한 행은 아래와 같다. 출처가 환산 관계를 제공하지 않으므로 타일·초 등의 단위로 변환하지 않는다.", "",
              "| 레코드 | 단위 | before → after |", "|---|---|---:|"]
    for row in patch["source_unit_records"]:
        lines.append(f"| `{row['record_id']}` | `{row['unit']}` | {row['before']} → {row['after']} |")
    lines += ["", "## 4. 출처·참조 무결성", "",
              f"출처 참조 {reference['source_reference_count']}개와 관련 레코드 참조 {reference['related_record_reference_count']}개를 저장된 ID 집합에 대조했다. `related_record_ids`가 있는 {reference['rows_with_related_record_ids']}행 중 {reference['rows_with_empty_related_record_ids']}행의 빈 배열은 허용한다. 직접 연결할 기존 행이 없는 독립 주장도 유효하기 때문이다.", "",
              f"출처·레코드 참조 검사 결과: **{'통과' if reference['valid'] else '오류 있음'}**. URL 수는 문자열 기준이며, 동일 URL의 여러 source ID는 문맥별 별칭으로 보존한다. 이 오프라인 스크립트는 URL의 온라인 접근 가능 여부를 확인하지 않는다.", "",
              "패치 확장 원문:", ""]
    for source in sources:
        if source.get("source_id", "").startswith("V4_PATCH_"):
            lines.append(f"- [{_md_cell(source.get('title', source['source_id']))}]({source['url']}) — `{source['source_id']}`; 문서 날짜 {source.get('published_at')}; [출처 등록부](../data/sources/patch_expansion_sources.json).")
    lines += ["", "## 5. 원작 관측과 검증의 경계", ""]
    observation = summary["original_interaction_observation"]
    lines += [f"원작 상호작용 사례 {observation['case_count']}개 중 `observed=true`는 {observation['observed_true_count']}개다. 상태 집계는 `{json.dumps(observation['test_status_counts'], ensure_ascii=False, sort_keys=True)}`다. 문서 조사, JSON 참조 검사와 오프라인 회귀 검사는 실제 원작 클라이언트에서의 실행 검증으로 바꾸지 않는다.", "",
              f"전체 정합성 검사: **{'통과' if summary['validation']['passed'] else '오류 있음'}**; 오류 {summary['validation']['error_count']}건, 근거 한계 경고 {summary['validation']['warning_count']}건. 알려진 레벨 경계와 원문 숫자 차이는 수정 없이 경고로 유지한다.", "",
              "## 6. 재생성", "", "```bash", "python scripts/rebuild.py", "python scripts/reconcile_research.py", "python scripts/reconcile_research.py --check", "python -m unittest discover -s tests -p test_reconciliation.py", "```", "",
              "`--check`는 출력 파일을 고치지 않는다. JSON 입력에서 다시 계산한 결과가 저장된 산출물과 다르거나, 출처 참조·레벨 계약·최신 부분뷰에 오류가 있으면 실패한다. 실행 시간이나 네트워크 응답을 입력으로 사용하지 않아 같은 JSON 입력에서는 같은 바이트가 생성된다.", "",
              f"입력 지문 SHA-256: `{summary['input_fingerprint_sha256']}`.", "",
              "상세 결과: [패치 연속성 감사](../data/analysis/patch_lineage_audit.json), [조사 요약](../data/analysis/research_v4_summary.json), [해석·재현 설명](../44_sources_and_level_reconciliation.md).", ""]
    return "\n".join(lines).encode("utf-8")


def build_outputs(tables, sources):
    result = analyze(tables, sources)
    outputs = {
        "data/analysis/patch_lineage_audit.json": json_bytes(result["patch_lineage_audit"]),
        "data/analysis/research_v4_summary.json": json_bytes(result["research_v4_summary"]),
        "reports/research_reconstruction_v4.md": render_report(result, sources),
    }
    return outputs, result


def write_outputs(outputs, root=ROOT, check=False):
    """Return stale/missing paths in check mode; never repair them in that mode."""
    stale = []
    for relative, contents in outputs.items():
        path = Path(root) / relative
        if check:
            if not path.is_file() or path.read_bytes() != contents:
                stale.append(relative)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
    return stale


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check deterministic outputs without writing files")
    parser.add_argument("--root", type=Path, default=ROOT, help="Project root (defaults to this script's parent project)")
    args = parser.parse_args(argv)
    try:
        tables, sources = read_inputs(args.root)
        outputs, result = build_outputs(tables, sources)
        stale = write_outputs(outputs, args.root, args.check)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Research reconciliation failed: {error}")
        return 1
    validation = result["research_v4_summary"]["validation"]
    counts = result["patch_lineage_audit"]["counts"]
    for path in stale:
        print(f"STALE: {path}")
    for error in validation["errors"]:
        print("ERROR: " + json.dumps(error, ensure_ascii=False, sort_keys=True))
    print(f"Research v{DATASET_VERSION}: patches={counts['patch_records']}, "
          f"latest={result['patch_lineage_audit']['expected_latest_counts']['total']}, "
          f"numeric_discontinuities={counts['numeric_mismatch_edges']}, "
          f"errors={validation['error_count']}, warnings={validation['warning_count']}, "
          f"outputs={'checked' if args.check else 'written'}")
    return 1 if stale or not validation["passed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
