"""Validate evidence, numerical integrity, version boundaries, and local links.

This does not run Clash Royale or claim fidelity to the private game client.
"""
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote
from dataset_config import ROOT, AS_OF
from rebuild import json_bytes, latest_patch_fields, csv_bytes, reference_level_status

STATUS = {'official_confirmed', 'community_snapshot', 'derived', 'reproduction_design', 'unverified', 'custom_only'}
REQUIRED = {'record_id', 'system', 'key', 'value', 'unit', 'evidence_status', 'source_ids',
            'effective_from', 'effective_to', 'version_note', 'notes'}

def load(path):
    return json.loads(path.read_text(encoding='utf-8'), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))

def validate():
    errors, warnings, checks = [], [], []
    def need(condition, message):
        if not condition:
            errors.append(message)
    sources = {}
    for path in sorted((ROOT / 'data/sources').glob('*.json')):
        for source in load(path):
            sid = source['source_id']
            need(sid not in sources, f'Duplicate source ID: {sid}')
            sources[sid] = source
            need(bool(source.get('url')), f'Missing source URL: {sid}')
    tables, by_id = {}, {}
    for path in sorted((ROOT / 'data/tables').glob('*.json')):
        rows = load(path)
        need(isinstance(rows, list), f'Table must be an array: {path.name}')
        tables[path.stem] = rows
        for row in rows:
            rid = row.get('record_id')
            need(not (REQUIRED - row.keys()), f'Missing common fields: {path.name}/{rid}: {REQUIRED - row.keys()}')
            need(isinstance(rid, str) and bool(rid), f'Invalid ID: {path.name}')
            need(rid not in by_id, f'Duplicate record ID: {rid}')
            by_id[rid] = row
            need(row.get('evidence_status') in STATUS, f'Unknown evidence status: {rid}')
            need(row.get('unit') is None or isinstance(row['unit'], str), f'Invalid unit: {rid}')
            need(isinstance(row.get('source_ids'), list), f'Invalid source list: {rid}')
            for sid in row.get('source_ids', []):
                need(sid in sources, f'Unknown source {sid} in {rid}')
            if row.get('evidence_status') in {'official_confirmed', 'community_snapshot'}:
                need(bool(row.get('source_ids')), f'Confirmed claim without a source: {rid}')
            for field in ('effective_from', 'effective_to'):
                date = row.get(field)
                need(date is None or bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', date)), f'Invalid date: {rid}/{field}')
            if row.get('effective_from') and row.get('effective_to'):
                need(row['effective_from'] <= row['effective_to'], f'Invalid date order: {rid}')
        csv_path = path.with_suffix('.csv')
        need(csv_path.exists() and csv_path.read_bytes() == csv_bytes(rows), f'Stale/missing CSV: {csv_path.name}')
    checks.append('all_table_records_schema_ids_sources_dates_and_csv')

    manifest = load(ROOT / 'data/snapshot_manifest.json')
    for entry in manifest['inputs']:
        p = ROOT / entry['local_path']
        need(hashlib.sha256(p.read_bytes()).hexdigest() == entry['selected_sha256'], f'Snapshot altered: {p.name}')
    need(manifest['is_current_live_client'] is False, 'Archive incorrectly marked current')
    checks.append('pinned_factual_snapshot_hashes')

    catalog = tables['card_catalog_2023']
    need(len(catalog) == 120, 'Archive catalog row loss')
    need(len({r['card_id'] for r in catalog}) == len(catalog), 'Duplicate original card ID')
    entities = {r['entity_id']: r for r in tables['entity_definitions_2023']}
    need(len(entities) == 532, 'Archive entity row loss')
    need(sum(r['quarantined'] for r in entities.values()) == 6, 'Unnamed entity quarantine changed')
    for row in tables['entity_links_2023'] + tables['archive_reference_extensions_2023']:
        need(row['source_entity_id'] in entities, f'Missing graph source: {row["record_id"]}')
        for target in row['target_entity_ids']:
            need(target in entities and not entities[target]['quarantined'], f'Invalid graph target: {target}')
    for row in tables['archive_behavior_extensions_2023']:
        need(row['entity_id'] in entities, f'Missing behavior parent: {row["record_id"]}')
        need(row['evidence_status'] == 'community_snapshot' and row.get('is_current_live_client') is False,
             f'Historical behavior promoted to current: {row["record_id"]}')
    extension_manifest = load(ROOT / 'data/archive_extension_manifest.json')
    extension_input = ROOT / extension_manifest['local_path']
    need(hashlib.sha256(extension_input.read_bytes()).hexdigest() == extension_manifest['selected_sha256'],
         'Archive behavior facts altered without manifest update')
    for row in tables['level_stats_2023']:
        entity = entities.get(row['entity_id'])
        need(entity is not None, f'Missing level parent: {row["record_id"]}')
        if not entity:
            continue
        field = row['key'] + '_per_level'
        need(entity['value'][field][row['provider_array_index']] == row['value'], f'Array value changed: {row["record_id"]}')
        need(isinstance(row['value'], (int, float)) and not isinstance(row['value'], bool) and math.isfinite(row['value']), f'Invalid numeric stat: {row["record_id"]}')
    # Sentinel cases catch rarity offsets and zero-damage projectile users.
    def level(entity, stat, number):
        return next(r['value'] for r in tables['level_stats_2023']
                    if r['entity_id'] == entity and r['key'] == stat and r['display_level'] == number)
    need(level('characters:Knight', 'hitpoints', 11) == 1766, 'Common level indexing regression')
    need(level('characters:Giant', 'hitpoints', 11) == 4091, 'Rare level indexing regression')
    need(level('projectile:FireballSpell', 'damage', 11) == 689, 'Projectile rarity level indexing regression')
    need(entities['characters:Archer']['value']['damage'] == 0, 'Raw projectile-user damage zero was overwritten')
    checks.append('archive_card_entity_graph_and_provider_level_arrays')

    patches = tables['balance_patch_ledger_2026'] + tables['official_patch_expansion_2026']
    latest = tables['verified_patch_fields_2026']
    need(latest == latest_patch_fields(patches), 'Latest patch view is stale or mixes archive data')
    for row in latest:
        need(row['evidence_status'] == 'official_confirmed', 'Nonofficial latest patch field')
        need(row['lineage_patch_id'] in by_id, 'Patch lineage missing')
        need('snapshot_id' not in row, 'Archive contamination in verified patch fields')
        need(row['full_current_card_profile'] is False, 'False complete-current-profile assertion')
        status = reference_level_status(row)
        need((status == 'specified') == (row['reference_level'] is not None), f'Invalid level semantics: {row["record_id"]}')
        for rid in row['later_unspecified_level_patch_ids']:
            need(rid in by_id and by_id[rid].get('reference_level_status') == 'not_stated', f'Invalid later unknown-level change: {rid}')
    check_153 = [r for r in latest if r['card_key'] == 'minion-giant' and r['key'] == 'damage']
    need(len(check_153) == 1 and check_153[0]['value'] == 153, 'Patch sequence did not supersede September damage')
    need(not any(r['card_key'] == 'knight' and r['form'] == 'base' and r['key'] == 'hitpoints' for r in latest), 'Unverified Knight HP filled into latest table')
    checks.append('2026_patch_lineage_chronology_and_no_historical_fallback')

    for row in by_id.values():
        if 'research_kind' in row:
            need(row['research_kind'] in {'new_fact', 'rechecked_claim', 'unresolved_gap', 'conflict'}, f'Invalid research kind: {row["record_id"]}')
            for rid in row.get('related_record_ids', []):
                need(rid in by_id, f'Missing related claim: {row["record_id"]}/{rid}')
            if row['research_kind'] == 'unresolved_gap':
                def contains_unknown(value):
                    if value is None:
                        return True
                    if isinstance(value, dict):
                        return any(contains_unknown(v) for v in value.values())
                    if isinstance(value, list):
                        return any(contains_unknown(v) for v in value)
                    return False
                need(contains_unknown(row['value']) and row['evidence_status'] == 'unverified', f'Unknown value filled: {row["record_id"]}')
            need(row.get('original_client_observed') is False, f'Research mistaken for observation: {row["record_id"]}')
    checks.append('research_new_rechecked_unknown_conflict_and_record_links')

    probability_groups = defaultdict(list)
    for row in by_id.values():
        if 'probability' not in row:
            if row.get('probability_group') and row.get('exhaustive_group') and row.get('unit') == 'probability' and isinstance(row['value'], dict):
                for outcome, p in row['value'].items():
                    need(isinstance(p, (int, float)) and not isinstance(p, bool) and 0 <= p <= 1, f'Invalid nested probability: {row["record_id"]}/{outcome}')
                    probability_groups[row['probability_group']].append({
                        'probability':p, 'exhaustive_group':True, 'probability_sum_tolerance':1e-9})
            continue
        p = row['probability']
        if p is None:
            need(row['evidence_status'] == 'unverified', f'Null probability without uncertainty: {row["record_id"]}')
            continue
        need(isinstance(p, (int, float)) and not isinstance(p, bool) and 0 <= p <= 1, f'Probability outside [0,1]: {row["record_id"]}')
        if row.get('probability_group'):
            probability_groups[row['probability_group']].append(row)
    probability_results = []
    for group, rows in sorted(probability_groups.items()):
        exhaustive = all(r.get('exhaustive_group') is True for r in rows)
        total = sum(r['probability'] for r in rows)
        tolerance = max(float(r.get('probability_sum_tolerance', 1e-9)) for r in rows)
        if exhaustive:
            need(abs(total - 1) <= tolerance + 1e-12, f'Probability sum: {group} = {total}')
        probability_results.append({'group':group, 'rows':len(rows), 'sum':round(total, 10),
                                    'exhaustive':exhaustive, 'tolerance':tolerance})
    checks.append('conditional_probability_groups_without_renormalization')

    cases = tables['interaction_cases']
    need(all(r.get('observed') is False and r.get('test_status') == 'not_run' for r in cases), 'Unexecuted game cases mislabeled as tested')
    need(len(tables['implementation_card_mapping']) == 19, 'Runtime reference card row loss')
    phalanx = next(r for r in tables['implementation_card_mapping'] if r['key'] == 'phalanx')
    need(phalanx['evidence_status'] == 'custom_only' and phalanx['original_archive_card_id'] is None, 'Phalanx incorrectly presented as original card')
    checks.append('custom_cards_and_unexecuted_observation_boundary')

    broken_links = []
    generated_here = {ROOT/'data/dataset_manifest.json', ROOT/'reports/validation_report.json',
                      ROOT/'reports/validation_report.md'}
    for path in ROOT.glob('*.md'):
        content = path.read_text(encoding='utf-8')
        for target in re.findall(r'\]\(([^)\s]+)(?:\s+[^)]*)?\)', content):
            if target.startswith(('https:', 'http:', '#', 'mailto:')):
                continue
            target = unquote(target.split('#', 1)[0])
            resolved = (path.parent / target).resolve()
            if target and not resolved.exists() and resolved not in generated_here:
                broken_links.append({'file':path.name, 'target':target})
    need(not broken_links, f'Broken relative Markdown links: {broken_links[:12]}')
    checks.append('markdown_relative_file_links')
    unbound = [r['key'] for r in tables['card_bindings_2023'] if r['resolution'] == 'missing_public_key']
    warnings.append({'kind':'archive_card_bindings_missing', 'card_keys':unbound,
                     'meaning':'공개 병합 데이터에 동일 key가 없음. 수동 이름 추정으로 채우지 않음.'})
    warnings.append({'kind':'unnamed_archive_rows_quarantined', 'count':6})
    warnings.append({'kind':'original_client_observations_not_executed', 'count':len(cases)})
    report = {'package_version':'4.0.0', 'as_of':AS_OF,
              'status':'passed' if not errors else 'failed',
              'check_groups':checks, 'errors':errors, 'known_limitations':warnings,
              'tables':{name:len(rows) for name,rows in tables.items()},
              'total_records':len(by_id), 'source_records':len(sources),
              'distinct_source_urls':len({s['url'] for s in sources.values()}),
              'evidence_counts':dict(sorted(Counter(r['evidence_status'] for r in by_id.values()).items())),
              'probability_groups':probability_results,
              'original_game_test_cases':{'defined':len(cases), 'executed':0}}
    out = ROOT / 'reports/validation_report.json'
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(json_bytes(report))
    lines = ['# 재구축 데이터 검증 결과', '', f'- 기준: {AS_OF} / 패키지 4.0.0',
             f'- 결과: **{report["status"].upper()}**', f'- 표: {len(tables)}종 / 레코드: {len(by_id):,}개',
             f'- 출처 레코드: {len(sources)}개 / 고유 URL: {report["distinct_source_urls"]}개',
             f'- 원작 전투 실험: {len(cases)}개 명세, **실행 0개**', '',
             '이 결과는 데이터 정합성 검사다. 비공개 클라이언트 수치·실제 게임 동작의 일치 검증이 아니다.', '',
             '## 데이터별 행 수', '', '| 표 | 행 |', '|---|---:|']
    lines += [f'| {name} | {len(rows):,} |' for name, rows in tables.items()]
    lines += ['', '## 검사', ''] + [f'- {x}' for x in checks]
    lines += ['', '## 보존한 결측', '', '- 2023 카드↔정의 연결 없음: ' + ', '.join(unbound),
              '- 이름 없는 공개 원시 행 6개는 격리 플래그로 보존.',
              '- 공식 확률의 반올림은 원값과 그룹별 허용 오차로 보존; 임의 정규화하지 않음.',
              '- 현행 전체 카드값과 숨은 전투·매칭 로직은 이 검사로 확정할 수 없음.']
    if errors:
        lines += ['', '## 오류', ''] + [f'- {x}' for x in errors]
    (ROOT / 'reports/validation_report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    package_manifest = {
        'package_name':'Clash Royale Reverse Design and Reconstructed Data',
        'package_version':'4.0.0', 'analysis_as_of':AS_OF,
        'system_document_count':len(list(ROOT.glob('[0-9][0-9]_*.md'))),
        'table_count':len(tables), 'total_records_including_views_and_references':len(by_id),
        'original_client_test_cases_executed':0,
        'scope':'public_evidence_reconstruction_not_private_original_database',
        'tables':[{'path':str(p.relative_to(ROOT)), 'rows':len(tables[p.stem]),
                   'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                   'csv_path':str(p.with_suffix('.csv').relative_to(ROOT)),
                   'csv_sha256':hashlib.sha256(p.with_suffix('.csv').read_bytes()).hexdigest()}
                  for p in sorted((ROOT/'data/tables').glob('*.json'))],
        'source_registry':[{'path':str(p.relative_to(ROOT)),
                            'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                           for p in sorted((ROOT/'data/sources').glob('*.json'))]
    }
    (ROOT/'data/dataset_manifest.json').write_bytes(json_bytes(package_manifest))
    print(json.dumps({'status':report['status'],'tables':len(tables),'records':len(by_id),
                      'sources':len(sources),'probability_groups':len(probability_groups),'errors':errors}, ensure_ascii=False))
    return 1 if errors else 0

if __name__ == '__main__':
    raise SystemExit(validate())
