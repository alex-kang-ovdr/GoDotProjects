"""Deterministically normalize the supplied factual archive and export CSV.

No network, third-party package, game installation, or current-client fallback.
Run: python scripts/rebuild.py
"""
import argparse
import csv
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from dataset_config import ROOT, AS_OF, ARCHIVE_DATE, SNAPSHOT_ID

def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')

def emit(path, content, check=False):
    path = ROOT / path
    if not isinstance(content, bytes):
        content = json_bytes(content)
    if check:
        if not path.exists() or path.read_bytes() != content:
            raise ValueError(f'Generated output is stale: {path.relative_to(ROOT)}')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

def archive_record(record_id, system, key, value, unit, source='ARCHIVE_STATS', **extra):
    return {'record_id': record_id, 'system': system, 'key': key, 'value': value,
            'unit': unit, 'evidence_status': 'community_snapshot',
            'source_ids': [source], 'effective_from': None, 'effective_to': None,
            'version_note': '2023-10-18 공개 저장소 스냅샷; 실제 적용일과 현행 일치 여부는 미확인',
            'notes': '', 'snapshot_id': SNAPSHOT_ID, 'snapshot_date': ARCHIVE_DATE, **extra}

REFERENCE_CATEGORIES = {
    'summon_character': ['characters', 'building'],
    'summon_character_second': ['characters', 'building'],
    'spawn_character': ['characters', 'building'],
    'spawn_character2': ['characters', 'building'],
    'spawn_character3': ['characters', 'building'],
    'death_spawn_character': ['characters', 'building'],
    'death_spawn_character2': ['characters', 'building'],
    'morph_character': ['characters', 'building'],
    'projectile': ['projectile'], 'projectile_special': ['projectile'],
    'custom_first_projectile': ['projectile'], 'death_spawn_projectile': ['projectile'],
    'area_effect_object': ['spell'], 'spawn_area_effect_object': ['spell'],
    'buff': ['character_buff'], 'buff_on_damage': ['character_buff'],
    'starting_buff': ['character_buff'], 'chained_buff': ['character_buff'],
    'hero_ability': ['spell', 'character_buff'], 'passive_ability': ['spell', 'character_buff'],
}

def normalize_archive(cards, raw_stats, rarities, localizations=None):
    rarity_map = {r['name']: r for r in rarities}
    names_ko = {row['id']: row['name_ko'] for row in (localizations or [])}
    entities, levels, links, catalog, bindings = [], [], [], [], []
    named = defaultdict(list)
    keyed = defaultdict(list)
    for category, rows in raw_stats.items():
        for index, raw in enumerate(rows):
            name = raw.get('name')
            entity_id = f'{category}:{name if name else "__unnamed_" + str(index)}'
            rec = archive_record('ENTITY_' + entity_id, 'archive_entities', entity_id,
                                 raw, 'provider_raw_units', entity_id=entity_id,
                                 category=category, source_row_index=index,
                                 quarantined=not bool(name))
            entities.append(rec)
            if name:
                named[(category, name)].append(entity_id)
            if raw.get('key'):
                keyed[raw['key']].append(rec)
            # Arrays are publisher-provided calculations, not measured game values.
            # They may extend beyond the archive's normal upgrade range.
            rarity = rarity_map.get(raw.get('rarity'))
            for field in ('hitpoints_per_level', 'damage_per_level'):
                values = raw.get(field)
                if not isinstance(values, list):
                    continue
                for array_index, value in enumerate(values):
                    display_level = array_index + rarity['relative_level'] + 1 if rarity else None
                    levels.append(archive_record(
                        f'LEVEL_{entity_id}:{field}:{array_index}', 'archive_level_stats',
                        field.removesuffix('_per_level'), value, 'hitpoints' if field.startswith('hitpoints') else 'damage',
                        entity_id=entity_id, category=category, rarity=raw.get('rarity'),
                        provider_array_index=array_index, display_level=display_level,
                        within_archive_upgrade_range=(array_index < rarity['level_count']) if rarity else None,
                        level_mapping_status='derived_from_relative_level' if rarity else 'unverified',
                        value_origin='provider_precomputed_array', source_ids=['ARCHIVE_STATS', 'ARCHIVE_RARITIES']))
    for entity in entities:
        if entity['quarantined']:
            continue
        for field, target_categories in REFERENCE_CATEGORIES.items():
            target = entity['value'].get(field)
            if not isinstance(target, str) or not target:
                continue
            candidates = [x for category in target_categories for x in named[(category, target)]]
            links.append(archive_record(
                f'LINK_{entity["entity_id"]}:{field}', 'archive_entity_links', field, target,
                'identifier', source_entity_id=entity['entity_id'], target_name=target,
                target_entity_ids=candidates,
                resolution='resolved' if len(candidates) == 1 else 'ambiguous' if candidates else 'missing',
                notes='원시 참조 이름 보존. 미확인 대상을 유사 이름으로 자동 연결하지 않음.'))
    for raw in cards:
        matching = keyed[raw['key']]
        flags = [(r['value'].get('not_visible'), r['value'].get('not_in_use')) for r in matching
                 if 'not_visible' in r['value'] or 'not_in_use' in r['value']]
        visibility = 'unverified'
        if any(inactive is True for hidden, inactive in flags):
            visibility = 'inactive_in_archive'
        elif any(hidden is True for hidden, inactive in flags):
            visibility = 'hidden_or_event_in_archive'
        elif any(hidden is False for hidden, inactive in flags):
            visibility = 'visible_in_archive'
        catalog.append(archive_record(
            f'CARD_{raw["id"]}', 'archive_card_catalog', raw['key'], raw, 'card_metadata',
            source='ARCHIVE_CATALOG', card_id=raw['id'], card_key=raw['key'],
            name_en=raw['name'], card_type=raw['type'], rarity=raw['rarity'],
            name_ko=names_ko.get(raw['id']), source_ids=['ARCHIVE_CATALOG', 'ARCHIVE_I18N'],
            elixir=raw['elixir'], archive_visibility=visibility,
            notes='120행은 이벤트·숨김 카드가 섞인 카탈로그다. 현재 정규 카드 수를 뜻하지 않음.'))
        bindings.append(archive_record(
            f'BINDING_{raw["id"]}', 'archive_card_bindings', raw['key'],
            [r['entity_id'] for r in matching], 'entity_id_list',
            source_ids=['ARCHIVE_CATALOG', 'ARCHIVE_STATS'], card_id=raw['id'],
            resolution='matched_public_key' if matching else 'missing_public_key',
            notes='동일 key로 연결된 공개 레코드만 포함. 이름 유사도·접미사로 참조를 발명하지 않음.'))
    return {'card_catalog_2023': catalog, 'entity_definitions_2023': entities,
            'level_stats_2023': levels, 'entity_links_2023': links, 'card_bindings_2023': bindings}

def reference_level_status(row):
    """Legacy rows explicitly used null for level-independent fields only."""
    status = row.get('reference_level_status')
    if status is None:
        return 'specified' if row.get('reference_level') is not None else 'not_applicable'
    if status not in {'specified', 'not_applicable', 'not_stated'}:
        raise ValueError(f'Invalid reference level status: {row.get("record_id")}')
    if (status == 'specified') != (row.get('reference_level') is not None):
        raise ValueError(f'Reference level/status mismatch: {row.get("record_id")}')
    return status

def patch_field_identity(row):
    return (row['card_key'], row['form'], row['component'], row['key'], row['unit'])

def latest_patch_fields(patches):
    latest = {}
    for row in sorted(patches, key=lambda r: (r['effective_from'], r['record_id'])):
        identity = (*patch_field_identity(row), reference_level_status(row), row.get('reference_level'))
        latest[identity] = row
    result = []
    for index, (_, row) in enumerate(sorted(latest.items(), key=lambda p: repr(p[0]))):
        output = {k: v for k, v in row.items() if k not in ('before', 'after', 'record_id')}
        output.update(record_id=f'CURRENT_PATCH_{index:03d}', system='verified_patch_fields_2026',
                      value=row['after'], lineage_patch_id=row['record_id'],
                      verification_scope='latest_in_supplied_patch_ledger_only',
                      reference_level_status=reference_level_status(row),
                      full_current_card_profile=False)
        later_unknown = [r['record_id'] for r in sorted(patches, key=lambda r: (r['effective_from'], r['record_id']))
                         if patch_field_identity(r) == patch_field_identity(row)
                         and reference_level_status(r) == 'not_stated'
                         and r['effective_from'] > row['effective_from']]
        output['has_later_unspecified_level_change'] = bool(later_unknown)
        output['later_unspecified_level_patch_ids'] = later_unknown
        output['claim_scope'] = ('value_without_reference_level' if reference_level_status(row) == 'not_stated'
                                 else 'earlier_level_value_with_later_unspecified_change' if later_unknown
                                 else 'last_record_for_identity_in_supplied_ledger')
        result.append(output)
    return result

def implementation_comparison(catalog):
    reference = read('implementation_reference/crownfall_4_4_cards.json')
    original = {row['card_key']: row for row in catalog}
    results = []
    for card in reference['cards']:
        key = card['id'].replace('_', '-')
        if card['id'] in ('duelist', 'phalanx'):
            key = None
        source = original.get(key)
        results.append({'record_id': 'IMPL_CARD_' + card['id'], 'system': 'implementation_reference',
                        'key': card['id'], 'value': card, 'unit': 'prototype_units',
                        'evidence_status': 'custom_only',
                        'source_ids': ['LOCAL_CROWNFALL_44'] + (['ARCHIVE_CATALOG'] if source else []),
                        'effective_from': None, 'effective_to': None, 'version_note': 'Crownfall v4.4.0 / rulesVersion 4',
                        'notes': '역할 대조용이며 원작 수치 동등성 또는 완전 재현을 뜻하지 않음.',
                        'original_role_reference_key': key,
                        'original_archive_card_id': source['card_id'] if source else None,
                        'archive_elixir': source['elixir'] if source else None,
                        'runtime_elixir': card['cost'],
                        'mapping_kind': 'conceptual_role_reference' if source else 'independent_card',
                        'numerical_equivalence_claimed': False,
                        'latest_original_stats_imported': False})
    return results

def csv_bytes(rows):
    if not rows:
        return b'\xef\xbb\xbf'
    fields = list(dict.fromkeys(key for row in rows for key in row))
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        writer.writerow({k: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
                         if isinstance(v, (dict, list)) else 'null' if v is None else
                         'true' if v is True else 'false' if v is False else v
                         for k, v in row.items()})
    return output.getvalue().encode('utf-8-sig')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail on any stale generated JSON/CSV')
    args = parser.parse_args()
    data = normalize_archive(read('data/raw/cards_2023_facts.json'),
                             read('data/raw/card_stats_2023_facts.json'),
                             read('data/raw/rarities_2023_facts.json'),
                             read('data/raw/cards_i18n_2023_facts.json'))
    patches = read('data/tables/balance_patch_ledger_2026.json') + read('data/tables/official_patch_expansion_2026.json')
    data['verified_patch_fields_2026'] = latest_patch_fields(patches)
    data['implementation_card_mapping'] = implementation_comparison(data['card_catalog_2023'])
    for name, rows in data.items():
        emit(f'data/tables/{name}.json', rows, args.check)
    for path in sorted((ROOT / 'data/tables').glob('*.json')):
        rows = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(rows, list) and all(isinstance(row, dict) for row in rows):
            emit(str(path.with_suffix('.csv').relative_to(ROOT)), csv_bytes(rows), args.check)
    counts = {name: len(rows) for name, rows in data.items()}
    print(json.dumps({'mode': 'check' if args.check else 'build', 'generated_rows': counts}, ensure_ascii=False))

if __name__ == '__main__':
    main()
