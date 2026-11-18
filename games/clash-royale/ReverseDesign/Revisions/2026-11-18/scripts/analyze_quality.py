"""Build deterministic evidence/coverage views without inventing current stats.

Run from any directory: python scripts/analyze_quality.py [--check]
Only the bundled tables and source registry are read. No network is used.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dataset_config import ROOT, AS_OF, ARCHIVE_DATE
from rebuild import reference_level_status


SCHEMA_VERSION = "1.1.0"
PACKAGE_VERSION = "4.0.0"
ARCHIVE_LINK_TABLES = ("entity_links_2023", "archive_reference_extensions_2023")
PATCH_LEDGER_TABLES = ("balance_patch_ledger_2026", "official_patch_expansion_2026")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def read_inputs(root=ROOT):
    tables = {p.stem: json.loads(p.read_text(encoding="utf-8"))
              for p in sorted((root / "data/tables").glob("*.json"))}
    sources = [row for p in sorted((root / "data/sources").glob("*.json"))
               for row in json.loads(p.read_text(encoding="utf-8"))]
    return tables, sources


def normalized_url(value):
    """Conservative identity normalization, never an online health check.

    Preserve path spelling, trailing slash and query order. Only scheme/host
    case, a default port and a fragment are normalized for HTTP(S) URLs.
    Local reference paths keep their spelling and get a separate namespace.
    """
    if not isinstance(value, str) or not value:
        return None
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https"):
        return "local:" + value
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    if ":" in host:
        host = "[" + host + "]"
    port = parts.port
    if port is not None and (scheme, port) not in (("http", 80), ("https", 443)):
        host += ":" + str(port)
    # None of the bundled sources contain authentication. Do not silently
    # combine credential-bearing URLs with anonymous URLs if a future input does.
    if parts.username is not None:
        host = parts.netloc.rsplit("@", 1)[0] + "@" + host
    return urlunsplit((scheme, host, parts.path, parts.query, ""))


def value_null_paths(value, path="value"):
    """Describe null locations, without assigning meaning or replacing zero."""
    if value is None:
        return [path]
    if isinstance(value, dict):
        return [item for key, child in value.items()
                for item in value_null_paths(child, path + "." + key)]
    if isinstance(value, list):
        return [item for index, child in enumerate(value)
                for item in value_null_paths(child, f"{path}[{index}]")]
    return []


def combined_rows(tables, names):
    """Keep additive ledgers separate on disk while analysing their union."""
    return [row for name in names for row in tables.get(name, [])]


def validate_evidence_references(tables):
    """Check explicit record lineage without inventing graph resolutions."""
    records = {row["record_id"]: row for rows in tables.values() for row in rows}
    for row in records.values():
        references = list(row.get("related_record_ids", []))
        references += list(row.get("later_unspecified_level_patch_ids", []))
        references += [row[key] for key in ("lineage_patch_id", "extension_record_id",
                                            "base_entity_record_id") if row.get(key)]
        unknown = sorted(set(references) - records.keys())
        if unknown:
            raise ValueError(f"Unknown evidence record references in {row['record_id']}: {unknown}")
    entities = {row["entity_id"]: row for row in tables["entity_definitions_2023"]}
    for row in tables.get("archive_behavior_extensions_2023", []):
        entity = entities.get(row["entity_id"])
        if not entity or entity["record_id"] != row["base_entity_record_id"]:
            raise ValueError(f"Behavior extension has no exact base entity: {row['record_id']}")
    for row in tables.get("archive_reference_extensions_2023", []):
        extension = records[row["extension_record_id"]]
        if extension.get("entity_id") != row["source_entity_id"]:
            raise ValueError(f"Reference extension source mismatch: {row['record_id']}")
        if extension.get("value", {}).get(row["key"]) != row["value"]:
            raise ValueError(f"Reference extension differs from recovered field: {row['record_id']}")


def reachable_graph(roots, entities, links):
    """Traverse all explicitly resolved edges, cycle safe and without hop cap.

    Multiple exact-key roots are supported; they are not 'ambiguous links'.
    Ambiguous or missing references remain barriers instead of guessed edges.
    """
    edges = defaultdict(list)
    for row in links:
        edges[row["source_entity_id"]].append(row)
    pending = deque(roots)
    seen = set()
    blocked = {}
    missing = set()
    while pending:
        entity_id = pending.popleft()
        if entity_id in seen:
            continue
        if entity_id not in entities:
            missing.add(entity_id)
            continue
        if entities[entity_id].get("quarantined"):
            blocked["quarantine:" + entity_id] = {
                "link_id": None, "entity_id": entity_id, "reason": "quarantined_entity"}
            continue
        seen.add(entity_id)
        for link in edges.get(entity_id, []):
            candidates = link.get("target_entity_ids", [])
            if link.get("resolution") != "resolved" or len(candidates) != 1:
                blocked[link["record_id"]] = {
                    "link_id": link["record_id"], "entity_id": entity_id,
                    "reason": link.get("resolution", "unspecified"),
                    "candidate_ids": candidates}
                continue
            pending.append(candidates[0])
    return {"entity_ids": sorted(seen), "blocked_links": [blocked[k] for k in sorted(blocked)],
            "missing_entity_ids": sorted(missing)}


def make_card_coverage(tables):
    catalog = {row["card_key"]: row for row in tables["card_catalog_2023"]}
    bindings = {row["key"]: row for row in tables["card_bindings_2023"]}
    entities = {row["entity_id"]: row for row in tables["entity_definitions_2023"]}
    links = combined_rows(tables, ARCHIVE_LINK_TABLES)
    reference_extensions = tables.get("archive_reference_extensions_2023", [])
    behavior_by_entity = defaultdict(list)
    for row in tables.get("archive_behavior_extensions_2023", []):
        behavior_by_entity[row["entity_id"]].append(row)
    patches = defaultdict(list)
    for row in tables["verified_patch_fields_2026"]:
        if row.get("full_current_card_profile") is not False:
            raise ValueError("Partial patch view must explicitly reject a full current profile claim")
        if row.get("verification_scope") != "latest_in_supplied_patch_ledger_only":
            raise ValueError("Unexpected patch scope; update the analysis contract before widening it")
        patches[row["card_key"]].append(row)
    implementations = defaultdict(list)
    for row in tables["implementation_card_mapping"]:
        # Role references, never approximate name matching. Independent cards
        # retain their own key and have no original card identity.
        key = row.get("original_role_reference_key") or row["key"]
        if row.get("mapping_kind") == "independent_card":
            if row.get("original_archive_card_id") is not None or row.get("original_role_reference_key") is not None:
                raise ValueError("Independent custom card cannot acquire an original identity")
            if key in catalog or key in patches:
                raise ValueError("Custom/original key collision requires an explicit namespace migration")
        implementations[key].append(row)
    result = []
    for key in sorted(set(catalog) | set(patches) | set(implementations)):
        card, binding = catalog.get(key), bindings.get(key)
        roots = list(binding["value"]) if binding else []
        graph = reachable_graph(roots, entities, links)
        baseline_graph = reachable_graph(roots, entities, tables["entity_links_2023"])
        reached = set(graph["entity_ids"])
        recovered_behavior = sorted(
            [row for entity_id in reached for row in behavior_by_entity[entity_id]],
            key=lambda row: row["record_id"])
        reached_extra_links = sorted(
            [row for row in reference_extensions if row["source_entity_id"] in reached],
            key=lambda row: row["record_id"])
        latest = sorted(patches.get(key, []), key=lambda r: (
            r["form"], r["component"], r["key"], str(r.get("unit")),
            reference_level_status(r), str(r.get("reference_level"))))
        unspecified_level_ids = [r["record_id"] for r in latest
                                 if reference_level_status(r) == "not_stated"]
        later_unspecified_ids = [r["record_id"] for r in latest
                                 if r.get("has_later_unspecified_level_change")]
        impl = implementations.get(key, [])
        independent = bool(impl) and all(row["mapping_kind"] == "independent_card" for row in impl)
        sources = set()
        for row in ([card, binding] + latest + impl):
            if row:
                sources.update(row.get("source_ids", []))
        for entity_id in graph["entity_ids"]:
            sources.update(entities[entity_id].get("source_ids", []))
        for row in recovered_behavior + [r for r in links if r["source_entity_id"] in reached]:
            sources.update(row.get("source_ids", []))
        gaps = []
        if independent:
            gaps.append("custom_card_has_no_original_identity")
        else:
            gaps.append("full_current_profile_unavailable")
            if not latest:
                gaps.append("no_fields_in_supplied_2026_patch_ledger")
        if not card and not independent:
            gaps.append("not_in_2023_catalog")
        if card and not roots:
            gaps.append("missing_exact_public_key_binding")
        if graph["blocked_links"] or graph["missing_entity_ids"]:
            gaps.append("unresolved_entity_graph")
        if unspecified_level_ids:
            gaps.append("patch_reference_level_not_stated")
        if later_unspecified_ids:
            gaps.append("later_patch_level_unspecified")
        result.append({
            "card_key": key,
            "name_ko": card.get("name_ko") if card else (impl[0]["value"].get("name") if impl else None),
            "name_en": card.get("name_en") if card else (impl[0]["value"].get("enName") if impl else None),
            "archive": {
                "present": card is not None,
                "record_id": card["record_id"] if card else None,
                "card_id": card["card_id"] if card else None,
                "snapshot_date": ARCHIVE_DATE if card else None,
                "visibility": card["archive_visibility"] if card else None,
                "binding_record_id": binding["record_id"] if binding else None,
                "root_match_state": binding["resolution"] if binding else "not_in_archive",
                "root_entity_ids": sorted(roots),
                "root_count": len(roots),
                "reachable_entity_ids": graph["entity_ids"],
                "reachable_entity_count": len(graph["entity_ids"]),
                "baseline_reachable_entity_count": len(baseline_graph["entity_ids"]),
                "additional_reachable_entity_ids": sorted(reached - set(baseline_graph["entity_ids"])),
                "reference_extension_link_ids": [r["record_id"] for r in reached_extra_links],
                "reference_extension_link_count": len(reached_extra_links),
                "behavior_extension_record_ids": [r["record_id"] for r in recovered_behavior],
                "behavior_extension_entity_count": len({r["entity_id"] for r in recovered_behavior}),
                "behavior_extension_field_count": sum(len(r["value"]) for r in recovered_behavior),
                "behavior_extensions": [{"record_id": r["record_id"], "entity_id": r["entity_id"],
                                         "fields": r["value"], "unit": r["unit"],
                                         "source_ids": r["source_ids"]} for r in recovered_behavior],
                "blocked_links": graph["blocked_links"],
                "missing_entity_ids": graph["missing_entity_ids"],
            },
            "latest_patch": {
                "field_count": len(latest),
                "scope": "latest_in_supplied_patch_ledger_only",
                "reference_level_status_counts": dict(sorted(Counter(reference_level_status(r) for r in latest).items())),
                "unspecified_level_field_ids": unspecified_level_ids,
                "earlier_fields_with_later_unspecified_change_ids": later_unspecified_ids,
                "fields": [{"form": r["form"], "component": r["component"], "key": r["key"],
                            "reference_level": r.get("reference_level"), "record_id": r["record_id"],
                            "unit": r.get("unit"),
                            "reference_level_status": reference_level_status(r),
                            "lineage_patch_id": r["lineage_patch_id"],
                            "has_later_unspecified_level_change": bool(r.get("has_later_unspecified_level_change")),
                            "later_unspecified_level_patch_ids": r.get("later_unspecified_level_patch_ids", []),
                            "claim_scope": r.get("claim_scope")} for r in latest],
            },
            "implementation": {
                "present": bool(impl), "custom_only": bool(impl),
                "independent_card": independent,
                "record_ids": [r["record_id"] for r in impl],
                "card_ids": [r["key"] for r in impl],
                "original_archive_card_ids": [r.get("original_archive_card_id") for r in impl],
                "numerical_equivalence_claimed": False,
            },
            "full_current_profile": False,
            "current_catalog_membership_verified": False,
            "gaps": gaps, "source_ids": sorted(sources),
            "evidence_status": "derived",
            "interpretation": "자료의 연결 범위이며 원작 재현율이나 현재 전체 카드 명단이 아님.",
        })
    return result


def make_source_audit(tables, sources):
    refs = defaultdict(set)
    table_refs = defaultdict(Counter)
    for name, rows in tables.items():
        for row in rows:
            for source_id in set(row.get("source_ids", [])):
                refs[source_id].add(row["record_id"])
                table_refs[source_id][name] += 1
    aliases = defaultdict(list)
    for source in sources:
        aliases[normalized_url(source.get("url"))].append(source["source_id"])
    result = []
    for source in sorted(sources, key=lambda row: row["source_id"]):
        sid, url = source["source_id"], source.get("url")
        norm = normalized_url(url)
        result.append({
            "source_id": sid, "title": source.get("title"), "url": url,
            "normalized_url": norm, "same_url_source_ids": sorted(aliases[norm]),
            "publisher": source.get("publisher"), "source_type": source.get("source_type"),
            "retrieval_ref_id": source.get("ref_id"), "retrieval_ref_url": source.get("ref_url"),
            "retrieval_method": source.get("access_method"), "source_caveats": source.get("caveats"),
            "resource_kind": "web" if norm and not norm.startswith("local:") else "local_reference",
            "published_at": source.get("published_at"), "accessed_at": source.get("accessed_at"),
            "publication_date_known": source.get("published_at") is not None,
            "access_date_known": source.get("accessed_at") is not None,
            "referenced_record_count": len(refs[sid]),
            "references_by_table": dict(sorted(table_refs[sid].items())),
            "has_direct_table_reference": bool(refs[sid]),
            "link_check_status": "not_checked",
            "evidence_status": "derived",
            "notes": "URL 식별자와 참조 개수를 정적으로 집계. 웹 접근 성공·최신성·본문 동일성을 검사한 결과가 아님.",
        })
    return result


def make_backlog(tables):
    all_rows = {row["record_id"]: row for rows in tables.values() for row in rows}
    missing_bindings = [r["record_id"] for r in tables["card_bindings_2023"] if not r["value"]]
    patch_ids = [r["record_id"] for r in tables["verified_patch_fields_2026"]]
    conflicts = [r["record_id"] for rows in tables.values() for r in rows if r.get("conflict_group")]
    tasks = []

    def add(task_id, title, priority, status, depends_on, records, criteria, deliverable,
            original_client=False, constraint=None):
        unknown = sorted(set(records) - set(all_rows))
        if unknown:
            raise ValueError(f"Backlog has unknown record references: {unknown}")
        tasks.append({"task_id": task_id, "title": title, "priority": priority, "status": status,
                      "depends_on": depends_on, "acceptance_criteria": criteria,
                      "deliverable": deliverable, "evidence_record_ids": records,
                      "source_ids": sorted({sid for rid in records for sid in all_rows[rid].get("source_ids", [])}),
                      "requires_original_client": original_client,
                      "original_client_observation_status": "not_performed",
                      "blocked_reason": "동일 원작 빌드의 관측 증거가 아직 없음" if original_client else None,
                      "constraints": constraint or [], "evidence_status": "reproduction_design"})

    add("G01_PROFILE_ISOLATION", "아카이브·공식 부분 패치·자체 카드의 분리 유지", "P0", "guarded_by_data_checks", [],
        ["IMPL_CARD_phalanx", "IMPL_CARD_duelist", "CASE_PHALANX_ISOLATION"],
        ["현재 필드 조회가 2023 수치를 보충하지 않는다.",
         "밀집보병과 강철 검사는 원작 ID가 null이고 custom_only로 유지된다.",
         "비교 화면이 수치 동등성 또는 원작 재현 완료를 표시하지 않는다."],
        "프로필 검증기 및 회귀 검사", constraint=["사용자가 정한 밀집보병 동작·자체 밸런스·저장 호환을 원작 자료로 덮어쓰지 않는다."])
    add("G02_ARCHIVE_ROOTS", "공개 카드 루트 연결 누락 보완", "P0", "requires_evidence", ["G01_PROFILE_ISOLATION"], missing_bindings,
        ["각 연결에 카드 ID·효과 식별자·같은 스냅샷의 직접 근거가 있다.",
         "미확인 이름 유사도로 자동 연결하지 않는다.", "추가 연결 후 전체 그래프 참조 검증을 통과한다."],
        "출처가 붙은 루트 연결 레지스트리")
    add("G03_CURRENT_PROFILES", "동일 빌드 대표 카드의 완전한 프로필 확보", "P0", "requires_original_client", ["G01_PROFILE_ISOLATION"], patch_ids,
        ["HP·피해·첫 타·공격 간격·대상·소환 수·거리 단위를 같은 빌드와 레벨로 묶는다.",
         "형상·개체·투사체·사망 효과를 각각 식별한다.", "미확인 필드가 있으면 완전한 프로필로 승격하지 않는다."],
        "빌드별 관측 카드 프로필과 측정 자료", original_client=True)
    add("G04_COORDINATES", "배치·거리·충돌 좌표를 관측으로 교정", "P0", "requires_original_client", ["G03_CURRENT_PROFILES"],
        ["CASE_GROUP_MIRROR", "CASE_FIRST_HIT_VS_REPEAT", "CASE_HOVER_TARGET_MASK"],
        ["타일 중심·개체 중심·충돌 가장자리 기준을 구별한다.", "양 진영 대칭·다리·강·큰 반경에서 오차를 기록한다.",
         "2D/3D 표현 변경이 논리 좌표를 바꾸지 않는 재현 검사를 한다."], "좌표 변환 규약과 교정 사례", original_client=True)
    add("G05_SHIELD_DAMAGE", "보호막 초과 피해와 다중 파동의 처리 순서 확정", "P0", "requires_original_client", ["G03_CURRENT_PROFILES"],
        ["CASE_SHIELD_OVERFLOW", "CASE_SHIELD_MULTIWAVE", "CASE_CART_TRANSITION"],
        ["한 번의 피해와 여러 피해 사건을 나누어 관측한다.", "방패 잔량 전·동일·초과 피해의 본체 HP를 기록한다.",
         "정책 미확정 상태에서 discard/spill을 원작 사실로 기본 적용하지 않는다."], "방패·본체 피해 계약", original_client=True)
    add("G06_EVENT_BOUNDARIES", "타워 파괴·사망·투사체 동시 사건의 경계 규칙 확정", "P0", "requires_original_client", ["G03_CURRENT_PROFILES"],
        ["CASE_VICTORY_SIMULTANEOUS", "CASE_PROJECTILE_DEAD_TARGET", "CASE_DEATH_SPAWN_ONCE", "COMBAT_BATTLE_EQUAL_LOWEST_HP_RESOLUTION"],
        ["동일 프레임이라는 화면 관측과 내부 처리 순서를 혼동하지 않는다.",
         "타이머 종료 전후와 동시 킹 파괴를 별도로 기록한다.", "사망 후 소환이 한 번 처리되는 재현 불변식을 유지한다."],
        "사건 우선순위 및 승패 경계 관측", original_client=True)
    add("G07_ELIXIR_PROFILE", "엘릭서 초기값·용량·기본 생성 간격의 근거 확보", "P0", "requires_original_client", [],
        ["COMBAT_ELIXIR_INITIAL_AMOUNT", "COMBAT_ELIXIR_CAPACITY", "COMBAT_ELIXIR_BASE_GENERATION_INTERVAL", "CASE_BOUNDARY_COST_ORDER"],
        ["모드와 빌드를 고정한 관측으로 세 기본값을 확보한다.", "배수 경계·최대치 손실·동시 차감 순서를 별도로 검증한다.",
         "가정한 값으로 계산할 때 사용자 프로필임을 표시한다."], "모드별 엘릭서 프로필", original_client=True)
    add("G08_OBSERVATION_LEDGER", "실측 결과를 명세와 분리한 관측 원장 도입", "P0", "ready_for_implementation", [],
        ["CASE_PHASE_SCHEDULE", "CASE_SHIELD_OVERFLOW", "CASE_CHAMPION_OWNER_DEAD"],
        ["observation_id·case_id·빌드·모드·입력·오차·결론·증거 위치를 기록한다.",
         "한 케이스에 복수 관측을 연결하며 명세의 expected를 덮어쓰지 않는다.",
         "원작 관측과 참조 JS 테스트의 실행기를 구분한다."], "관측 JSON 스키마·입력기·상충 결과 조회")
    add("G09_RUNTIME_IMPORT", "재현 엔진 데이터 가져오기 전 필수 필드 게이트", "P0", "ready_for_implementation", ["G01_PROFILE_ISOLATION", "G03_CURRENT_PROFILES", "G04_COORDINATES"],
        ["COMBAT_SIMULATION_EVENT_ORDER", "CASE_TRANSACTION_DUPLICATE"],
        ["필수 수치·단위·모드·소환 참조가 없으면 시작을 차단한다.",
         "프로필 해시와 덱 스냅샷을 리플레이에 보존한다.", "중복 명령이 재차 차감·소환을 일으키지 않는다."], "버전이 명시된 가져오기 계약")
    add("G10_ABILITY_OWNER", "능력 소유권·일회 사용·Boss Bandit 예외 검증", "P1", "requires_original_client", ["G08_OBSERVATION_LEDGER"],
        ["CASE_CHAMPION_OWNER", "CASE_CHAMPION_OWNER_DEAD", "CASE_SINGLE_USE", "CASE_BOSS_EXCEPTION"],
        ["최신 개체 사망 뒤 이전 개체의 권한을 관측한다.", "소비한 능력과 재배치 능력 예산을 분리한다.",
         "Boss Bandit 예외를 일반 쿨다운으로 임의 대체하지 않는다."], "형상별 능력 권한 상태기계", original_client=True)
    add("G11_MIRROR_CAP", "Mirror 진화·레벨 증가·모드 상한의 적용 순서 검증", "P1", "requires_original_client", ["G08_OBSERVATION_LEDGER"],
        ["CASE_MIRROR_LEVEL_CAP", "CASE_MIRROR_UNOWNED_EVO", "CASE_GIANT_REHEAL"],
        ["소유 레벨·복제 레벨·모드 상한을 각 단계로 기록한다.", "미소유 진화와 진화 없는 카드의 복제를 구별한다.",
         "Giant 회복 후 임계 재진입은 독립 사례로 검증한다."], "형상/레벨 파이프라인의 관측 규칙", original_client=True)
    add("G12_ECONOMY_GAPS", "경제표의 미기재 경계를 보완", "P1", "requires_evidence", [],
        ["PROG_COST_EPIC_07", "ECON_EVOLUTION_SHARD_19", "ECON_DUPLICATE_AT60",
         "ECON_DAILY_GOLD_WIN_LIMIT", "ECON_WILD_CAP"] +
        [r["record_id"] for r in tables.get("economy_research_v4", []) if r["research_kind"] == "unresolved_gap"],
        ["Epic 목표 7 Gold의 원문 또는 같은 빌드 관측을 확보한다.", "Arena 19~21 진화 조각 전환량을 확인한다.",
         "최대 카드 정확히 60장 경계의 규칙을 확인한다.", "일일 Gold 지급 승수와 희귀도·킹 레벨별 Wild Card 상한을 확인한다.",
         "수치가 없을 때 0 또는 과거 값을 넣지 않는다."], "조건별 근거 보완 행")
    add("G13_PROBABILITY_CHAIN", "보상 조건부 확률의 조합 조건 고정", "P1", "ready_for_implementation", ["G12_ECONOMY_GAPS"],
        [r["record_id"] for r in tables["reward_probability_tables"] if r.get("probability") is None],
        ["상자 계열·시작 등급·레벨·형상 해금 조건이 같은 분포만 연결한다.",
         "반올림된 공개 확률을 조용히 재정규화하지 않는다.", "혼합 보상의 기대 가치를 임의 화폐 환율로 환산하지 않는다."], "조건 일치 검사와 보상 흐름 계산기")
    add("G14_SOURCE_CONFLICTS", "시즌 자료와 일반 지원 문서의 상충 조건 확인", "P1", "requires_original_client", ["G08_OBSERVATION_LEDGER"], conflicts,
        ["Merge 수입·Clan/Rider 특성을 같은 시즌에서 관측한다.", "최대 레벨 기부 보상의 현재 결과를 확인한다.",
         "충돌 양쪽 출처를 보존하고 결론의 적용 기간을 제한한다."], "충돌 그룹별 조건부 해소 기록", original_client=True)
    add("G15_MODE_SETTLEMENT", "모드·클랜의 입장 스냅샷과 정산 불변식 구현", "P2", "ready_for_implementation", ["G09_RUNTIME_IMPORT"],
        ["MODE_DUEL_LOCK", "MODE_CROWN_GATE", "MODE_CROWN_RUN", "MODE_CROWN_GRAND_KING", "SOCIAL_WAR_MEDALS_UNKNOWN"],
        ["경기·듀얼·런의 종료 상태와 보상 지급을 분리한다.", "재접속·재요청에도 보상을 한 번만 지급한다.",
         "미공개 매칭 가중치·미확인 메달 수치를 임의 원작 값으로 넣지 않는다."], "모드별 트랜잭션 명세와 실패 경계 검사")
    add("G16_CLIENT_QA", "오프라인 분석 화면의 실제 브라우저·접근성 점검", "P1", "requires_runtime_validation", [],
        ["CASE_PHALANX_ISOLATION"],
        ["file://에서 네트워크 없이 열고 검색·필터·내보내기를 확인한다.",
         "키보드·좁은 화면·큰 데이터에서 선택과 포커스 상태를 확인한다.",
         "현재 미실행인 실제 브라우저·터치·GPU 검사를 실행 결과와 구별한다."], "기기별 수동 QA 기록")
    return tasks


def analyze(tables, sources):
    records = [row for rows in tables.values() for row in rows]
    record_ids = [row["record_id"] for row in records]
    source_ids = [source["source_id"] for source in sources]
    if len(record_ids) != len(set(record_ids)) or len(source_ids) != len(set(source_ids)):
        raise ValueError("Duplicate record or source identifiers")
    unknown_sources = sorted({sid for row in records for sid in row.get("source_ids", [])} - set(source_ids))
    if unknown_sources:
        raise ValueError(f"Unknown source IDs: {unknown_sources}")
    validate_evidence_references(tables)
    coverage = make_card_coverage(tables)
    audit = make_source_audit(tables, sources)
    backlog = make_backlog(tables)
    explicit_null = [row for row in records if row.get("value") is None]
    nested_null = [row for row in records if row.get("value") is not None and value_null_paths(row.get("value"))]
    source_types = Counter(source.get("source_type", "unspecified") for source in sources)
    archive_links = combined_rows(tables, ARCHIVE_LINK_TABLES)
    archive_behaviors = tables.get("archive_behavior_extensions_2023", [])
    patch_ledger = combined_rows(tables, PATCH_LEDGER_TABLES)
    latest_fields = tables["verified_patch_fields_2026"]
    research_rows = [row for row in records if row.get("research_kind")]
    cases = tables["interaction_cases"]
    missing_roots = [r["card_key"] for r in coverage if r["archive"]["present"] and not r["archive"]["root_count"]]
    conflicts = defaultdict(list)
    for row in records:
        if row.get("conflict_group"):
            conflicts[row["conflict_group"]].append(row["record_id"])
    summary = {
        "schema_version": SCHEMA_VERSION, "package_version": PACKAGE_VERSION, "analysis_as_of": AS_OF,
        "generator": "scripts/analyze_quality.py",
        "evidence_status": "derived",
        "summary": "원표의 범위·연결·결측·출처·미실행 상태를 정적으로 집계한 연구 품질 보고서.",
        "scope": {"archive_date": ARCHIVE_DATE, "current_fields_scope": "latest_in_supplied_patch_ledger_only",
                  "current_catalog_complete": False, "original_client_executed": False,
                  "network_links_checked": False, "reconstruction_percentage": None,
                  "percentage_reason": "현재 전체 대상과 필요한 상호작용 범위를 확정하지 않아 재현율의 분모가 없음."},
        "counts": {"tables": len(tables), "records": len(records), "source_records": len(sources),
                   "unique_source_urls_exact": len({s.get("url") for s in sources}),
                   "unique_source_urls_normalized": len({r["normalized_url"] for r in audit}),
                   "coverage_card_keys": len(coverage), "archive_catalog_cards": len(tables["card_catalog_2023"]),
                   "archive_entity_definitions": len(tables["entity_definitions_2023"]),
                   "archive_explicit_links": len(archive_links),
                   "archive_baseline_links": len(tables["entity_links_2023"]),
                   "archive_extension_links": len(tables.get("archive_reference_extensions_2023", [])),
                   "archive_behavior_extension_rows": len(archive_behaviors),
                   "archive_behavior_extension_field_values": sum(len(r["value"]) for r in archive_behaviors),
                   "archive_behavior_extension_unique_fields": len({k for r in archive_behaviors for k in r["value"]}),
                   "archive_level_stat_rows": len(tables["level_stats_2023"]),
                   "patch_ledger_rows": len(patch_ledger),
                   "patch_baseline_rows": len(tables["balance_patch_ledger_2026"]),
                   "patch_expansion_rows": len(tables.get("official_patch_expansion_2026", [])),
                   "latest_patch_fields": len(tables["verified_patch_fields_2026"]),
                   "latest_patch_card_keys": sum(bool(r["latest_patch"]["field_count"]) for r in coverage),
                   "implementation_cards": len(tables["implementation_card_mapping"]),
                   "independent_custom_cards": sum(r["implementation"]["independent_card"] for r in coverage),
                   "full_current_card_profiles": 0, "backlog_tasks": len(backlog)},
        "by_table": {name: {"records": len(rows),
                             "by_evidence_status": dict(sorted(Counter(r["evidence_status"] for r in rows).items()))}
                     for name, rows in sorted(tables.items())},
        "by_evidence_status": dict(sorted(Counter(r["evidence_status"] for r in records).items())),
        "archive_extensions": {
            "reference_links_by_resolution": dict(sorted(Counter(r.get("resolution", "unspecified") for r in tables.get("archive_reference_extensions_2023", [])).items())),
            "behavior_entities_by_category": dict(sorted(Counter(r["category"] for r in archive_behaviors).items())),
            "behavior_fields_by_name": dict(sorted(Counter(k for r in archive_behaviors for k in r["value"]).items())),
            "cards_with_reachable_behavior_extensions": sum(bool(r["archive"]["behavior_extension_record_ids"]) for r in coverage),
            "cards_with_additional_reachable_entities": sum(bool(r["archive"]["additional_reachable_entity_ids"]) for r in coverage),
            "interpretation": "동일 2023 스냅샷의 추가 허용 필드와 명시 참조다. 기존 532개 정의를 대체하거나 현재 수치로 승격하지 않는다.",
        },
        "patch_evidence": {
            "ledger_rows_by_table": {name: len(tables.get(name, [])) for name in PATCH_LEDGER_TABLES},
            "ledger_rows_by_effective_date": dict(sorted(Counter(r.get("effective_from") or "unspecified" for r in patch_ledger).items())),
            "latest_fields_by_effective_date": dict(sorted(Counter(r.get("effective_from") or "unspecified" for r in latest_fields).items())),
            "ledger_reference_level_status_counts": dict(sorted(Counter(reference_level_status(r) for r in patch_ledger).items())),
            "latest_reference_level_status_counts": dict(sorted(Counter(reference_level_status(r) for r in latest_fields).items())),
            "latest_level_unspecified_field_ids": sorted(r["record_id"] for r in latest_fields if reference_level_status(r) == "not_stated"),
            "earlier_fields_with_later_unspecified_change_ids": sorted(r["record_id"] for r in latest_fields if r.get("has_later_unspecified_level_change")),
            "interpretation": "레벨 명시·비적용·미기재를 구분한다. 레벨 미기재 후속 변경은 이전 레벨값을 현재값으로 확정하지 못하게 하는 별도 불확실성이다. 포함된 원장 내부의 부분 필드이며 전체 현재 프로필이 아니다.",
        },
        "research_additions": {
            "classified_records": len(research_rows),
            "by_research_kind": dict(sorted(Counter(r["research_kind"] for r in research_rows).items())),
            "by_table": {name: dict(sorted(Counter(r["research_kind"] for r in rows if r.get("research_kind")).items()))
                         for name, rows in sorted(tables.items()) if any(r.get("research_kind") for r in rows)},
            "interpretation": "재확인·미해결·충돌 행을 새 사실 수에 합치지 않는다. new_fact의 파생 검산도 공식 원문 사실과 evidence_status로 구분한다.",
        },
        "null_semantics": {
            "value_is_null_records": len(explicit_null),
            "value_is_null_record_ids": sorted(r["record_id"] for r in explicit_null),
            "nested_null_value_records": len(nested_null),
            "nested_null_value_records_in_archive_entities": sum(r["system"] == "archive_entities" for r in nested_null),
            "unit_is_null_records": sum(r.get("unit") is None for r in records),
            "unverified_evidence_records": sum(r["evidence_status"] == "unverified" for r in records),
            "interpretation": "null 출현 개수는 미복원 수치의 개수가 아니다. 단위 비적용·정책상 무상한·해금 Gold 비적용·원시 참조 부재를 필드별로 해석해야 한다. 0과 false는 null로 계산하지 않는다.",
        },
        "temporal": {
            "effective_from_unknown_records": sum(r.get("effective_from") is None for r in records),
            "effective_to_unspecified_records": sum(r.get("effective_to") is None for r in records),
            "known_start_unspecified_end_records": sum(r.get("effective_from") is not None and r.get("effective_to") is None for r in records),
            "both_effective_bounds_unspecified_records": sum(r.get("effective_from") is None and r.get("effective_to") is None for r in records),
            "interpretation": "effective_from null은 적용 시작 미확정이다. effective_to null은 종료일 미기재이며 영구 유효 또는 현재 유효 판정이 아니다. 조회일과 자료 스냅샷 날짜는 적용일과 별도다.",
        },
        "observations": {"interaction_cases": len(cases),
                         "observed_true": sum(r.get("observed") is True for r in cases),
                         "observed_false": sum(r.get("observed") is False for r in cases),
                         "test_status_counts": dict(sorted(Counter(r.get("test_status", "unspecified") for r in cases).items())),
                         "interpretation": "참조 코드의 자동 검사 통과와 원작 클라이언트 관측은 별개다."},
        "gaps": {"archive_missing_root_card_keys": missing_roots,
                 "archive_multiple_exact_root_cards": sum(r["archive"]["root_count"] > 1 for r in coverage),
                 "archive_quarantined_entity_ids": sorted(r["entity_id"] for r in tables["entity_definitions_2023"] if r.get("quarantined")),
                 "archive_unresolved_link_ids": sorted(r["record_id"] for r in archive_links if r.get("resolution") != "resolved"),
                 "conflict_groups": {key: sorted(value) for key, value in sorted(conflicts.items())},
                 "full_current_profile_unavailable_keys": [r["card_key"] for r in coverage if not r["implementation"]["independent_card"]]},
        "source_audit": {"by_source_type": dict(sorted(source_types.items())),
                         "web_source_records": sum(r["resource_kind"] == "web" for r in audit),
                         "local_source_records": sum(r["resource_kind"] == "local_reference" for r in audit),
                         "without_direct_table_reference": [r["source_id"] for r in audit if not r["has_direct_table_reference"]],
                         "without_publication_date": [r["source_id"] for r in audit if not r["publication_date_known"]],
                         "without_access_date": [r["source_id"] for r in audit if not r["access_date_known"]],
                         "link_check_status": "not_checked",
                         "interpretation": "동일 URL의 여러 source_id는 시스템별 출처 등록이며 독립 웹페이지 수가 아니다. 직접 참조가 없는 배경 출처는 삭제 대상이라는 뜻이 아니다."},
        "backlog": {"by_priority": dict(sorted(Counter(t["priority"] for t in backlog).items())),
                    "by_status": dict(sorted(Counter(t["status"] for t in backlog).items())),
                    "requires_original_client": sum(t["requires_original_client"] for t in backlog)},
        "input_content_sha256": hashlib.sha256(json_bytes({"tables": tables, "sources": sources})).hexdigest(),
    }
    return {"quality_summary": summary, "card_coverage": coverage,
            "reconstruction_backlog": backlog, "source_audit": audit}


def render_report(data):
    s = data["quality_summary"]
    c = s["counts"]
    lines = ["# 데이터 품질·커버리지 정적 분석 보고서", "",
             f"분석 기준일: {AS_OF} · 패키지: {PACKAGE_VERSION} · 생성기: `scripts/analyze_quality.py` · 스키마: {SCHEMA_VERSION}", "",
             "이 보고서는 포함된 공개 자료의 연결성과 미확인 범위를 집계한다. 원작 실측 또는 전체 게임 재현 완료 보고서가 아니다.", "",
             "## 범위", "", "| 구분 | 개수 | 의미 |", "|---|---:|---|",
             f"| 원표 / 원표 레코드 | {c['tables']} / {c['records']:,} | 조회본·정규화·자체 비교 포함 |",
             f"| 출처 레코드 / 서로 다른 URL | {c['source_records']} / {c['unique_source_urls_exact']} | 서로 다른 독립 주장 수가 아님 |",
             f"| 카드 키 합집합 | {c['coverage_card_keys']} | 역사 카탈로그·부분 패치·자체 카드의 합집합 |",
             f"| 2023 카탈로그 / 정의 / 연결 | {c['archive_catalog_cards']} / {c['archive_entity_definitions']} / {c['archive_explicit_links']} | 과거 공개 스냅샷 |",
             f"| 아카이브 기본 / 추가 명시 연결 | {c['archive_baseline_links']} / {c['archive_extension_links']} | 합친 그래프로 도달 범위를 계산 |",
             f"| 아카이브 추가 행동 행 / 필드 종류 | {c['archive_behavior_extension_rows']} / {c['archive_behavior_extension_unique_fields']} | 기존 개체에 연결한 같은 스냅샷의 추가 원시 필드 |",
             f"| 아카이브 레벨별 수치 행 | {c['archive_level_stat_rows']:,} | 추가 필드 때문에 과거 성장표를 변경하지 않음 |",
             f"| 2026 패치 원장 / 최종 필드 | {c['patch_ledger_rows']} / {c['latest_patch_fields']} | 포함한 패치 원장 내부에서만 최신 |",
             f"| 2026 기본 / 확장 패치 원장 | {c['patch_baseline_rows']} / {c['patch_expansion_rows']} | 원장 파일은 분리 보존하고 분석 시 합산 |",
             f"| 부분 패치에 등장한 카드 키 | {c['latest_patch_card_keys']} | 현행 전체 카드 수가 아님 |",
             f"| 완전한 현재 카드 프로필 | {c['full_current_card_profiles']} | 부분 필드를 완전 프로필로 승격하지 않음 |", "",
             "## 확인된 공백", "",
             f"정확한 공개 key로 루트가 연결되지 않은 역사 카드 {len(s['gaps']['archive_missing_root_card_keys'])}개:", "",
             ", ".join("`" + k + "`" for k in s["gaps"]["archive_missing_root_card_keys"]) + ".", "",
             f"이름 없는 정의 {len(s['gaps']['archive_quarantined_entity_ids'])}개는 격리 상태다. 여러 exact-key 루트가 있는 {s['gaps']['archive_multiple_exact_root_cards']}개 카드는 참조 연결의 모호성과 구별한다. "
             f"명시적 개체 연결 중 unresolved 표시는 {len(s['gaps']['archive_unresolved_link_ids'])}개이며, 이것이 카드 전체 정의 완성을 뜻하지는 않는다.", "",
             "그래프 조회는 방문 집합으로 순환을 차단하고 깊이 제한 없이 모든 명시적 resolved 연결을 따라간다. missing/ambiguous 연결은 후보 이름으로 보충하지 않는다.", "",
             f"추가 행동 필드 값은 {c['archive_behavior_extension_field_values']:,}개다. "
             f"카드별 도달 그래프에 추가 행동 행이 나타나는 키는 {s['archive_extensions']['cards_with_reachable_behavior_extensions']}개, "
             f"추가 참조 덕분에 도달 개체가 늘어난 키는 {s['archive_extensions']['cards_with_additional_reachable_entities']}개다. "
             "이 수치는 서로 다른 집계이며 새 카드 수가 아니다. 카드 커버리지 JSON에 추가 참조 ID, 기본 그래프 대비 추가 도달 개체, 행동 원시 필드와 출처를 함께 기록한다.", "",
             "## 패치 레벨과 적용일의 불확실성", "",
             "| 기준 레벨 상태 | 원장 행 | 최종 필드 |", "|---|---:|---:|"]
    for status in ("specified", "not_applicable", "not_stated"):
        lines.append(f"| {status} | {s['patch_evidence']['ledger_reference_level_status_counts'].get(status, 0)} | "
                     f"{s['patch_evidence']['latest_reference_level_status_counts'].get(status, 0)} |")
    lines += ["", s["patch_evidence"]["interpretation"], "",
              f"기준 레벨이 미기재인 최종 필드는 {len(s['patch_evidence']['latest_level_unspecified_field_ids'])}개, "
              f"그 이후 레벨 미기재 변경이 있어 현재값으로 확정할 수 없는 이전 필드는 {len(s['patch_evidence']['earlier_fields_with_later_unspecified_change_ids'])}개다. "
              "두 목록은 구분해서 보존하며 단순히 더하여 결측 카드 수로 사용하지 않는다.", "",
              "| 패치 적용일 | 통합 원장 행 | 해당 날짜의 최종 필드 |", "|---|---:|---:|"]
    for date, count in s["patch_evidence"]["ledger_rows_by_effective_date"].items():
        lines.append(f"| {date} | {count} | {s['patch_evidence']['latest_fields_by_effective_date'].get(date, 0)} |")
    lines += ["", "## 추가 조사의 분류", "", "| 원표 | 분류별 행 수 |", "|---|---|"]
    for name, kinds in s["research_additions"]["by_table"].items():
        lines.append(f"| {name} | " + ", ".join(f"{kind}: {count}" for kind, count in kinds.items()) + " |")
    lines += ["", s["research_additions"]["interpretation"], "",
             "## null과 날짜 해석", "",
             f"최상위 value가 null인 행은 {s['null_semantics']['value_is_null_records']}개, value 내부에 null이 포함된 행은 {s['null_semantics']['nested_null_value_records']}개, unit이 null인 행은 {s['null_semantics']['unit_is_null_records']}개다. "
             f"별도 근거 분류 unverified는 {s['null_semantics']['unverified_evidence_records']}개다. 서로 다른 집계이며 합산해 결측 수치를 만들지 않는다.", "",
             s["null_semantics"]["interpretation"], "",
             f"effective_from 미기재: {s['temporal']['effective_from_unknown_records']:,}행. effective_to 미기재: {s['temporal']['effective_to_unspecified_records']:,}행. " + s["temporal"]["interpretation"], "",
             "## 실측·출처 검증 범위", "",
             f"원작 상호작용 명세 {s['observations']['interaction_cases']}개 가운데 observed=true는 {s['observations']['observed_true']}개다. "
             f"현재 실험 상태 집계는 {json.dumps(s['observations']['test_status_counts'], ensure_ascii=False)}다. "
             "참조 JS 자동 검사는 원작 실험 결과로 합산하지 않는다.", "",
             "이번 생성기는 네트워크를 사용하지 않는다. source_audit의 link_check_status=not_checked는 링크 접근을 아직 검사하지 않았다는 뜻이며 정상·오류·최신 판정이 아니다. "
             "출처의 내용이 원표 주장과 일치하는지 재독해하는 작업도 별도다.", "",
             "## 출처 충돌", "", "| 충돌 그룹 | 관련 원표 ID |", "|---|---|"]
    for group, ids in s["gaps"]["conflict_groups"].items():
        lines.append(f"| {group} | " + ", ".join(f"`{rid}`" for rid in ids) + " |")
    lines += ["", "## 후속 작업과 완료 기준", "", "| 우선순위 | 과제 | 상태 |", "|---|---|---|"]
    for task in data["reconstruction_backlog"]:
        lines.append(f"| {task['priority']} | {task['task_id']} · {task['title']} | {task['status']} |")
    lines += ["", "상세 선행조건·완료 기준·원표 근거는 [reconstruction_backlog.json](../data/analysis/reconstruction_backlog.json)에 있다. "
              "현재 데이터가 지키는 분리 규칙도 후속 가져오기 경로에서 계속 검사해야 한다.", "",
              "## 재생성", "", "```bash", "python scripts/analyze_quality.py", "python scripts/analyze_quality.py --check", "python -m unittest discover -s tests -p 'test_quality.py'", "```", "",
              "`--check`는 현재 원표로 재계산한 출력과 파일의 바이트가 같은지 검사한다. 파일에 기록된 적용일·실측 여부의 사실성 자체를 증명하지 않는다.", "",
              "관련 파일: [요약 JSON](../data/analysis/quality_summary.json), [카드 커버리지](../data/analysis/card_coverage.json), "
              "[출처 감사](../data/analysis/source_audit.json), [완료 게이트 문서](../37_coverage_and_implementation_gates.md).", ""]
    return "\n".join(lines).encode("utf-8")


def build_outputs(root=ROOT):
    tables, sources = read_inputs(root)
    data = analyze(tables, sources)
    outputs = {f"data/analysis/{name}.json": json_bytes(value) for name, value in data.items()}
    outputs["reports/quality_report.md"] = render_report(data)
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated quality views are stale")
    args = parser.parse_args()
    outputs = build_outputs()
    for name, content in outputs.items():
        path = ROOT / name
        if args.check:
            if not path.is_file() or path.read_bytes() != content:
                raise SystemExit(f"Stale quality output: {name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    summary = json.loads(outputs["data/analysis/quality_summary.json"])
    print(json.dumps({"mode": "check" if args.check else "build", "status": "passed",
                      "outputs": len(outputs), "counts": summary["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
