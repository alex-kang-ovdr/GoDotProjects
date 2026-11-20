#!/usr/bin/env python3
"""Rebuild a pinned, factual LoL data snapshot using Python's standard library.

Default: normalize + validate the shipped projections, without network access.
--download: fetch the explicitly pinned official public JSON endpoints first.
Narrative/lore/tooltip prose is deliberately omitted from persisted projections.
Unsubstituted tooltip identifiers are retained as derived token annotations.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import copy
import csv
import hashlib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'raw'
DATA = ROOT / 'data'
CDN = 'https://ddragon.leagueoflegends.com'
CONSTANTS = 'https://static.developer.riotgames.com/docs/lol'
PROSE_KEYS = {'lore', 'blurb', 'allytips', 'enemytips', 'description', 'tooltip',
              'shortDesc', 'longDesc', 'plaintext', 'leveltip'}
TOKEN_RE = re.compile(r'\{\{\s*([^{}]+?)\s*\}\}')

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def sha(blob):
    return hashlib.sha256(blob).hexdigest()

def project(value, keep_short_constants=False):
    if isinstance(value, list):
        return [project(v, keep_short_constants) for v in value]
    if not isinstance(value, dict):
        return value
    out = {}
    text_annotations = {}
    for key, item in value.items():
        if key in PROSE_KEYS and not keep_short_constants:
            if isinstance(item, str):
                text_annotations[key] = {
                    'present': bool(item),
                    'template_tokens': sorted(set(TOKEN_RE.findall(item))),
                    'prose_omitted': True,
                }
            continue
        # Champion skins/illustration metadata is outside this numerical task.
        if key in {'skins', 'recommended'}:
            continue
        out[key] = project(item, keep_short_constants)
    if text_annotations:
        out['__text_annotations'] = text_annotations
    return out

def fetch(spec):
    relative, url, kind, version, locale = spec
    req = urllib.request.Request(url, headers={'User-Agent': 'LoL-Static-Data-Reconstruction/1.0'})
    with urllib.request.urlopen(req, timeout=60) as response:
        original = response.read()
        document = json.loads(original)
    if version and isinstance(document, dict) and document.get('version') not in (None, version):
        raise ValueError(f'Version mismatch: {url}: {document.get("version")} != {version}')
    selected = project(document, keep_short_constants=(kind == 'constants'))
    destination = RAW / relative
    dump(destination, selected)
    return {
        'file': str(destination.relative_to(ROOT)), 'source_url': url,
        'kind': kind, 'ddragon_version': version, 'locale': locale,
        'retrieved_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_sha256': sha(original), 'source_bytes': len(original),
        'stored_sha256': sha(destination.read_bytes()), 'stored_bytes': destination.stat().st_size,
        'projection': 'numeric_identifiers_and_structure; prose_removed; template_tokens_derived',
    }

def run_fetch(specs, workers):
    records, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {pool.submit(fetch, spec): spec for spec in specs}
        for index, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            spec = jobs[job]
            try:
                records.append(job.result())
            except Exception as exc:
                failures.append({'source_url': spec[1], 'error': str(exc)})
            if index % 25 == 0 or index == len(specs):
                print(f'Downloaded {index}/{len(specs)}; failed {len(failures)}', flush=True)
    return records, failures

def download(version, previous, workers):
    specs = [
        ('discovery/versions.json', f'{CDN}/api/versions.json', 'versions', None, None),
        ('discovery/kr_realm.json', f'{CDN}/realms/kr.json', 'realm', None, 'ko_KR'),
    ]
    records, failures = run_fetch(specs, workers)
    if failures:
        raise RuntimeError(json.dumps(failures))
    versions = read(RAW / 'discovery/versions.json')
    if version not in versions or previous not in versions:
        raise ValueError('Both explicit versions must exist in the official versions list')
    specs = []
    for v in [version, previous]:
        for locale in ['ko_KR', 'en_US']:
            for kind in ['champion', 'item']:
                relative = f'{v}/{locale}/{kind}.json'
                specs.append((relative, f'{CDN}/cdn/{v}/data/{locale}/{kind}.json', kind, v, locale))
    for locale in ['ko_KR', 'en_US']:
        for kind in ['summoner', 'runesReforged', 'map']:
            relative = f'{version}/{locale}/{kind}.json'
            specs.append((relative, f'{CDN}/cdn/{version}/data/{locale}/{kind}.json', kind, version, locale))
    for name in ['queues', 'maps', 'gameModes', 'gameTypes', 'seasons']:
        specs.append((f'constants/{name}.json', f'{CONSTANTS}/{name}.json', 'constants', None, 'en_US'))
    extra, more_failures = run_fetch(specs, workers)
    records.extend(extra); failures.extend(more_failures)
    if not (RAW / f'{version}/ko_KR/champion.json').exists():
        raise RuntimeError('Current champion roster could not be downloaded')
    champions = read(RAW / f'{version}/ko_KR/champion.json')['data']
    specs = [(f'{version}/ko_KR/champion/{cid}.json',
              f'{CDN}/cdn/{version}/data/ko_KR/champion/{cid}.json',
              'champion_detail', version, 'ko_KR') for cid in sorted(champions)]
    extra, more_failures = run_fetch(specs, workers)
    records.extend(extra); failures.extend(more_failures)
    manifest = {
        'schema_version': 1, 'ddragon_version': version, 'comparison_version': previous,
        'public_patch_label': '26.22' if version == '16.22.1' else None,
        'public_patch_label_source': 'https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/' if version == '16.22.1' else None,
        'region': 'KR', 'realm_observation': read(RAW / 'discovery/kr_realm.json'),
        'projection_notice': 'Stored JSON is a selected-field projection, NOT byte-identical upstream JSON. source_sha256 hashes the original response; stored_sha256 hashes the shipped projection. Long narrative and tooltip prose is omitted; numeric values and retained original JSON pointers are unchanged. __text_annotations is derived.',
        'constants_notice': 'Official game constants are unversioned observations; queue presence is not proof of current availability.',
        'records': sorted(records, key=lambda r: r['file']), 'failures': failures,
    }
    dump(RAW / 'source_manifest.json', manifest)
    if failures:
        raise RuntimeError(f'{len(failures)} downloads failed; manifest retained; do not claim complete coverage')

def csv_value(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if isinstance(value, bool):
        return str(value).lower()
    return value

def table(name, rows):
    dump(DATA / f'{name}.json', rows)
    keys = list(dict.fromkeys(key for row in rows for key in row))
    # UTF-8 BOM for Korean Windows Excel; quoted structured cells stay valid JSON.
    with (DATA / f'{name}.csv').open('w', encoding='utf-8-sig', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=keys)
        writer.writeheader()
        writer.writerows({k: csv_value(row.get(k)) for k in keys} for row in rows)

def reconstruct():
    manifest = read(RAW / 'source_manifest.json')
    # Fail before creating derived outputs if any input projection was modified.
    assert not manifest['failures'], 'Source acquisition has failures'
    for record in manifest['records']:
        path = ROOT / record['file']
        assert path.exists() and sha(path.read_bytes()) == record['stored_sha256'], record['file']
    version, previous = manifest['ddragon_version'], manifest['comparison_version']
    sources = {r['file']: r for r in manifest['records']}
    def source(relative, pointer):
        record = sources[f'raw/{relative}']
        return {'ddragon_version': record['ddragon_version'], 'locale': record['locale'],
                'source_url': record['source_url'], 'source_json_pointer': pointer,
                'source_sha256': record['source_sha256']}
    def doc(v, loc, kind):
        return read(RAW / f'{v}/{loc}/{kind}.json')
    ko = doc(version, 'ko_KR', 'champion')['data']
    en = doc(version, 'en_US', 'champion')['data']
    champion_rows, stat_rows, spell_rows, rank_rows, effects, tokens, passives = [], [], [], [], [], [], []
    for cid, champion in sorted(ko.items(), key=lambda p: int(p[1]['key'])):
        evidence = source(f'{version}/ko_KR/champion.json', f'/data/{cid}')
        champion_rows.append({'champion_id': int(champion['key']), 'champion_key': cid,
            'name_ko': champion['name'], 'name_en': en[cid]['name'],
            'resource_type': champion.get('partype'), 'class_tags': champion.get('tags', []),
            **champion.get('stats', {}), **evidence,
            'name_en_source_url': sources[f'raw/{version}/en_US/champion.json']['source_url']})
        for stat, value in sorted(champion.get('stats', {}).items()):
            stat_rows.append({'champion_id': int(champion['key']), 'champion_key': cid,
                'stat_key': stat, 'value': value,
                **source(f'{version}/ko_KR/champion.json', f'/data/{cid}/stats/{stat}')})
        relative = f'{version}/ko_KR/champion/{cid}.json'
        detail = read(RAW / relative)['data'][cid]
        passive = detail.get('passive', {})
        passives.append({'champion_id': int(champion['key']), 'champion_key': cid,
            'passive_name_ko': passive.get('name'), 'numeric_mechanics_status': 'not_exposed_as_complete_structured_formula',
            **source(relative, f'/data/{cid}/passive')})
        for index, spell in enumerate(detail.get('spells', [])):
            pointer = f'/data/{cid}/spells/{index}'
            slot = 'QWER'[index] if index < 4 else f'extra_{index}'
            spell_evidence = source(relative, pointer)
            annotations = spell.get('__text_annotations', {})
            identifiers = sorted(set(token for a in annotations.values() for token in a.get('template_tokens', [])))
            vars_by_key = {str(v.get('key')): v for v in spell.get('vars', [])}
            token_rows = []
            for token in identifiers:
                resolved, path, value = False, None, None
                effect_match = re.fullmatch(r'e(\d+)', token)
                if effect_match and int(effect_match.group(1)) < len(spell.get('effect', [])):
                    effect_index = int(effect_match.group(1)); value = spell['effect'][effect_index]
                    if value is not None:
                        resolved, path = True, f'{pointer}/effect/{effect_index}'
                elif token in vars_by_key and 'coeff' in vars_by_key[token]:
                    var_index = next(i for i,v in enumerate(spell['vars']) if str(v.get('key')) == token)
                    resolved, path, value = True, f'{pointer}/vars/{var_index}/coeff', vars_by_key[token]['coeff']
                elif token == 'cost' and 'cost' in spell:
                    resolved, path, value = True, f'{pointer}/cost', spell['cost']
                token_row = {'champion_key': cid, 'slot': slot, 'spell_id': spell['id'],
                    'token': token, 'status': 'direct_field_reference' if resolved else 'unresolved',
                    'numeric_value': value, 'resolved_json_pointer': path,
                    'interpretation': 'field linkage only; not a complete damage formula', **spell_evidence}
                token_rows.append(token_row)
            tokens.extend(token_rows)
            unresolved = [r['token'] for r in token_rows if r['status'] == 'unresolved']
            spell_rows.append({'champion_id': int(champion['key']), 'champion_key': cid,
                'slot': slot, 'spell_id': spell['id'], 'spell_name_ko': spell['name'],
                'max_rank': spell.get('maxrank'), 'cooldown_by_rank': spell.get('cooldown'),
                'cost_by_rank': spell.get('cost'), 'range_by_rank': spell.get('range'),
                'effect': spell.get('effect'), 'vars': spell.get('vars'),
                'resource_template': spell.get('resource'), 'maxammo_raw': spell.get('maxammo'),
                'tooltip_tokens': identifiers, 'unresolved_tokens': unresolved,
                'formula_status': 'incomplete_static_metadata',
                'range_semantics': 'raw_client_metadata; may be a sentinel or cast-metadata value',
                **spell_evidence})
            maxrank = spell.get('maxrank') or 0
            for rank in range(1, maxrank + 1):
                row = {'champion_key': cid, 'slot': slot, 'spell_id': spell['id'], 'rank': rank}
                for key in ['cooldown', 'cost', 'range']:
                    values = spell.get(key, [])
                    row[key] = values[rank - 1] if isinstance(values,list) and rank <= len(values) else None
                    row[key + '_json_pointer'] = f'{pointer}/{key}/{rank-1}' if row[key] is not None else None
                rank_rows.append({**row, **spell_evidence})
            for effect_index, values in enumerate(spell.get('effect', [])):
                if values is None:
                    continue
                effects.append({'champion_key': cid, 'slot': slot, 'effect_index': effect_index,
                    'values': values, 'semantic_binding': 'unresolved_until_correlated_with_tooltip_or_runtime',
                    **source(relative, f'{pointer}/effect/{effect_index}')})
    table('champions', champion_rows); table('champion_stats', stat_rows)
    table('champion_passives', passives); table('champion_spells', spell_rows)
    table('spell_ranks', rank_rows); table('spell_effect_arrays', effects); table('spell_template_tokens', tokens)

    items = doc(version, 'ko_KR', 'item')['data']; item_en = doc(version, 'en_US', 'item')['data']
    item_rows, item_stats, recipes, map_flags = [], [], [], []
    for iid, item in sorted(items.items(), key=lambda p: int(p[0])):
        gold = item.get('gold', {}); maps = item.get('maps', {})
        sr_candidate = bool(maps.get('11')) and gold.get('purchasable') is True and item.get('inStore', True) is not False and item.get('hideFromAll', False) is not True
        evidence = source(f'{version}/ko_KR/item.json', f'/data/{iid}')
        item_rows.append({'item_id': int(iid), 'name_ko': item.get('name'), 'name_en': item_en.get(iid, {}).get('name'),
            'gold_base': gold.get('base'), 'gold_total': gold.get('total'), 'gold_sell': gold.get('sell'),
            'purchasable': gold.get('purchasable'), 'in_store_raw': item.get('inStore'),
            'hide_from_all_raw': item.get('hideFromAll'), 'required_champion': item.get('requiredChampion'),
            'required_ally': item.get('requiredAlly'), 'special_recipe': item.get('specialRecipe'),
            'depth_raw': item.get('depth'), 'tags': item.get('tags', []),
            'stats': item.get('stats', {}), 'from_ids': item.get('from', []), 'into_ids': item.get('into', []),
            'maps': maps, 'sr_shop_candidate_derived': sr_candidate,
            'availability_status': 'candidate_filter_only; not_live_shop_verified',
            'mechanics_status': 'structured_stats_only; tooltip_only_passives_actives_not_reconstructed',
            **evidence,
            'name_en_source_url': sources[f'raw/{version}/en_US/item.json']['source_url']})
        for stat, value in sorted(item.get('stats', {}).items()):
            item_stats.append({'item_id': int(iid), 'stat_key': stat, 'value': value,
                **source(f'{version}/ko_KR/item.json', f'/data/{iid}/stats/{stat}')})
        for mapid, enabled in sorted(maps.items()):
            map_flags.append({'item_id': int(iid), 'map_id': int(mapid), 'enabled_raw': enabled,
                'sr_shop_candidate_derived': sr_candidate,
                **source(f'{version}/ko_KR/item.json', f'/data/{iid}/maps/{mapid}')})
        for component, count in sorted(Counter(item.get('from', [])).items()):
            recipes.append({'parent_item_id': int(iid), 'component_item_id': int(component),
                'quantity': count, 'component_exists': component in items,
                'component_total_gold': items.get(component, {}).get('gold', {}).get('total'),
                'parent_base_gold': gold.get('base'), 'parent_total_gold': gold.get('total'),
                'direction': 'component_to_parent', **source(f'{version}/ko_KR/item.json', f'/data/{iid}/from')})
    table('items', item_rows); table('item_stats', item_stats); table('item_recipes', recipes)
    table('item_map_flags', map_flags); table('items_sr_shop_candidates', [r for r in item_rows if r['sr_shop_candidate_derived']])

    rune_paths, runes = [], []
    rk = doc(version, 'ko_KR', 'runesReforged'); re_ = doc(version, 'en_US', 'runesReforged')
    english_runes = {r['id']: r for p in re_ for s in p['slots'] for r in s['runes']}
    for pi, path in enumerate(rk):
        rune_paths.append({'path_id': path['id'], 'path_key': path['key'], 'name_ko': path['name'],
            'slot_count': len(path['slots']), **source(f'{version}/ko_KR/runesReforged.json', f'/{pi}')})
        for si, slot in enumerate(path['slots']):
            for ri, rune in enumerate(slot['runes']):
                runes.append({'rune_id': rune['id'], 'rune_key': rune['key'], 'name_ko': rune['name'],
                    'name_en': english_runes[rune['id']]['name'], 'path_id': path['id'], 'slot_index': si,
                    'order_in_slot': ri, 'keystone_slot_derived': si == 0,
                    'numeric_mechanics_status': 'tooltip_only; not_reconstructed',
                    **source(f'{version}/ko_KR/runesReforged.json', f'/{pi}/slots/{si}/runes/{ri}'),
                    'name_en_source_url': sources[f'raw/{version}/en_US/runesReforged.json']['source_url']})
    table('rune_paths', rune_paths); table('runes', runes)
    summoners = doc(version, 'ko_KR', 'summoner')['data']; se = doc(version, 'en_US', 'summoner')['data']
    summoner_rows = []
    for sid, spell in sorted(summoners.items(), key=lambda p:int(p[1]['key'])):
        summoner_rows.append({'summoner_spell_id': int(spell['key']), 'spell_key': sid,
            'name_ko': spell['name'], 'name_en': se[sid]['name'], 'summoner_level': spell.get('summonerLevel'),
            'cooldown_raw': spell.get('cooldown'), 'cost_raw': spell.get('cost'), 'range_raw': spell.get('range'),
            'modes_raw': spell.get('modes'), 'maxrank_raw': spell.get('maxrank'),
            'effect_raw': spell.get('effect'), 'vars_raw': spell.get('vars'),
            'runtime_status': 'static_metadata_only; mode_modifiers_and_upgrades_not_proven',
            **source(f'{version}/ko_KR/summoner.json', f'/data/{sid}'),
            'name_en_source_url': sources[f'raw/{version}/en_US/summoner.json']['source_url']})
    table('summoner_spells', summoner_rows)
    for name in ['queues', 'maps', 'gameModes', 'gameTypes', 'seasons']:
        relative = f'constants/{name}.json'
        if (RAW / relative).exists():
            table('official_' + name, [{**record, **source(relative, f'/{i}'),
                'availability_scope': 'unversioned_identifier_registry; not_a_live_enabled_list'}
                for i,record in enumerate(read(RAW / relative))])
    mapdoc = doc(version, 'ko_KR', 'map')
    table('ddragon_maps', [{'map_id': int(mid), **record,
        **source(f'{version}/ko_KR/map.json', f'/data/{mid}')}
        for mid,record in sorted(mapdoc['data'].items())])

    diffs = []
    for kind in ['champion', 'item']:
        old, new = doc(previous, 'ko_KR', kind)['data'], doc(version, 'ko_KR', kind)['data']
        keys = ['stats'] if kind == 'champion' else ['gold', 'stats', 'from', 'into', 'maps', 'tags', 'inStore', 'hideFromAll', 'requiredChampion', 'requiredAlly', 'specialRecipe']
        for rid in sorted(set(old) | set(new)):
            if rid not in old or rid not in new:
                diffs.append({'entity': kind, 'entity_id': rid, 'field': '__record__',
                    'old_value': 'present' if rid in old else None, 'new_value': 'present' if rid in new else None,
                    'change_type': 'removed' if rid in old else 'added'})
                continue
            for key in keys:
                ov, nv = old[rid].get(key), new[rid].get(key)
                if isinstance(ov,dict) and isinstance(nv,dict):
                    pairs = [(f'{key}/{sub}',ov.get(sub),nv.get(sub)) for sub in sorted(set(ov)|set(nv))]
                else:
                    pairs = [(key, ov, nv)]
                for field, a, b in pairs:
                    if a != b:
                        diffs.append({'entity': kind, 'entity_id': rid, 'field': field,
                            'old_value': a, 'new_value': b, 'change_type': 'changed'})
    for row in diffs:
        row.update({'old_version': previous, 'new_version': version, 'locale': 'ko_KR',
            'old_source_url': sources[f'raw/{previous}/ko_KR/{row["entity"]}.json']['source_url'],
            'new_source_url': sources[f'raw/{version}/ko_KR/{row["entity"]}.json']['source_url'],
            'old_source_sha256': sources[f'raw/{previous}/ko_KR/{row["entity"]}.json']['source_sha256'],
            'new_source_sha256': sources[f'raw/{version}/ko_KR/{row["entity"]}.json']['source_sha256'],
            'source_json_pointer': f'/data/{row["entity_id"]}/' + row['field'],
            'comparison_scope': 'champion_base_stats_and_item_structured_fields_only'})
    table('patch_structured_diff', diffs)
    coverage = {
        'schema_version': 1, 'ddragon_version': version, 'comparison_version': previous,
        'public_patch_label': manifest.get('public_patch_label'), 'region': 'KR',
        'champions': len(champion_rows), 'champion_stat_fields': len(stat_rows),
        'champion_passives': len(passives), 'champion_qwer_records': len(spell_rows),
        'spell_rank_rows': len(rank_rows), 'effect_array_rows': len(effects),
        'effect_array_rows_all_zero': sum(isinstance(r['values'],list) and bool(r['values']) and all(v == 0 for v in r['values']) for r in effects),
        'spells_with_empty_vars': sum(not r['vars'] for r in spell_rows),
        'tooltip_token_rows': len(tokens), 'unresolved_tooltip_token_rows': sum(r['status']=='unresolved' for r in tokens),
        'spells_with_unresolved_tokens': sum(bool(r['unresolved_tokens']) for r in spell_rows),
        'common_append_token_rows': sum(r['token']=='spellmodifierdescriptionappend' for r in tokens),
        'unresolved_token_rows_excluding_common_append': sum(r['status']=='unresolved' and r['token']!='spellmodifierdescriptionappend' for r in tokens),
        'spells_with_unresolved_tokens_excluding_common_append': sum(any(t!='spellmodifierdescriptionappend' for t in r['unresolved_tokens']) for r in spell_rows),
        'items_all_modes': len(item_rows), 'items_sr_shop_candidates': sum(r['sr_shop_candidate_derived'] for r in item_rows),
        'item_stat_fields': len(item_stats), 'item_recipe_edges': len(recipes),
        'rune_paths': len(rune_paths), 'runes': len(runes), 'summoner_spells_all_modes': len(summoner_rows),
        'structured_patch_changes': len(diffs), 'source_files': len(manifest['records']),
        'source_response_bytes_total': sum(r['source_bytes'] for r in manifest['records']),
        'stored_projection_bytes_total': sum(r['stored_bytes'] for r in manifest['records']),
        'official_queue_records': len(read(RAW/'constants/queues.json')),
        'official_map_records': len(read(RAW/'constants/maps.json')),
        'explicit_limits': [
            'No exact server simulation, collision radii, projectile speeds, missile paths, attack windups, animation cancel rules or complete damage formulas are recovered from these files.',
            'QWER contains four top-level spells per champion; transformed forms, recasts, passive variants and runtime overrides are not a complete executable skill graph.',
            'Raw zero arrays remain source zeros, never evidence that an ability deals zero damage. Missing values stay null/blank.',
            'The auxiliary unresolved count excludes only the exact common spellmodifierdescriptionappend token; it is not a verified semantic classification of cosmetic versus gameplay variables.',
            'Item stats are only the structured legacy stats object; tooltip-only passive/active stats and item availability require separate verification.',
            'Modern runesReforged comes from the pinned URL, not the legacy rune=7.23.1 realm entry.',
            'Unversioned constants include historical/deprecated queues and do not prove current server availability.',
            'Structured patch comparison omits ability details and prose-only changes.',
        ],
    }
    dump(DATA / 'coverage_report.json', coverage)
    dictionary = {'schema_version':1, 'evidence_columns':{
        'ddragon_version':'Explicit Data Dragon build; null for unversioned constants.',
        'locale':'Locale of the cited primary record; English aliases cite a separate name source where present.',
        'source_url':'Official endpoint downloaded for this record.',
        'source_json_pointer':'RFC 6901-style pointer to the original retained record/field, not to derived conclusions.',
        'source_sha256':'SHA-256 of the original HTTP response before prose removal.',
        'stored_sha256':'In raw/source_manifest.json: hash of the supplied selected-field projection.',
    },'null_policy':'JSON null/absent remains null; CSV empty means unresolved/absent, never numeric zero.',
       'array_policy':'JSON arrays/dicts are quoted JSON strings in CSV; rank arrays are not interpolated or extrapolated.',
       'formula_policy':'eN/vars/cost linkage is not semantic proof of a complete damage formula.',
       'files':{p.stem:{'json':p.name,'csv':p.with_suffix('.csv').name} for p in DATA.glob('*.json') if p.stem not in {'coverage_report','data_dictionary','validation_report'}}}
    dump(DATA / 'data_dictionary.json', dictionary)
    return coverage

def validate():
    manifest = read(RAW / 'source_manifest.json')
    checks, warnings = [], []
    assert not manifest['failures'], 'Source acquisition has failures'
    for record in manifest['records']:
        p = ROOT / record['file']
        assert p.exists() and sha(p.read_bytes()) == record['stored_sha256'], record['file']
        data = read(p)
        if isinstance(data,dict) and data.get('version') and record['ddragon_version']:
            assert data['version'] == record['ddragon_version']
    checks.append('Every shipped source projection exists, hashes correctly, and uses the pinned build when versioned.')
    by_url = {r['source_url']: read(ROOT/r['file']) for r in manifest['records']}
    def pointer_value(document, pointer):
        cursor = document
        for part in pointer.split('/')[1:]:
            key = part.replace('~1','/').replace('~0','~')
            cursor = cursor[int(key)] if isinstance(cursor,list) else cursor[key]
        return cursor
    for filename in ['champion_stats','item_stats']:
        for row in read(DATA/(filename+'.json')):
            assert pointer_value(by_url[row['source_url']],row['source_json_pointer']) == row['value']
    checks.append('Every normalized champion/item scalar stat equals its retained source JSON pointer value.')
    for row in read(DATA/'spell_ranks.json'):
        for field in ['cooldown','cost','range']:
            pointer = row[field+'_json_pointer']
            if pointer is not None:
                assert pointer_value(by_url[row['source_url']],pointer) == row[field]
            else:
                assert row[field] is None
    checks.append('Every rank-level cooldown/cost/range value equals its explicit source array element; absent entries remain null.')
    champs = read(DATA / 'champions.json'); spells = read(DATA / 'champion_spells.json')
    ids = [r['champion_id'] for r in champs]
    assert len(ids) == len(set(ids))
    keys = {r['champion_key'] for r in champs}
    assert len(spells) == len(champs)*4
    assert {r['champion_key'] for r in spells} == keys
    assert all(sorted(r['slot'] for r in spells if r['champion_key']==key) == sorted('QWER') for key in keys)
    checks.append('Champion numeric IDs are unique; all roster entries have one top-level Q/W/E/R record.')
    for row in spells:
        for key in ['cooldown_by_rank', 'cost_by_rank', 'range_by_rank']:
            values = row[key]
            assert isinstance(values,list), (row['champion_key'],row['slot'],key)
            if len(values) != row['max_rank']:
                warnings.append({'kind':'rank_array_length','champion':row['champion_key'],'slot':row['slot'],'field':key,'array_length':len(values),'maxrank':row['max_rank']})
    token_rows = read(DATA / 'spell_template_tokens.json')
    assert all(r['numeric_value'] is None and r['resolved_json_pointer'] is None for r in token_rows if r['status']=='unresolved')
    checks.append('Unresolved template tokens have null numeric values; no inferred zero substitution.')
    items = read(DATA / 'items.json'); item_ids = {r['item_id'] for r in items}
    assert len(item_ids)==len(items)
    for edge in read(DATA / 'item_recipes.json'):
        assert edge['parent_item_id'] in item_ids
        assert edge['quantity'] >= 1
        if not edge['component_exists']:
            warnings.append({'kind':'missing_recipe_component','parent':edge['parent_item_id'],'component':edge['component_item_id']})
    checks.append('Item IDs are unique and all recipe parent/quantity relations are valid; missing components are reported, not invented.')
    runes = read(DATA / 'runes.json')
    assert len({r['rune_id'] for r in runes})==len(runes)
    assert all(r['path_id'] in {p['path_id'] for p in read(DATA/'rune_paths.json')} for r in runes)
    checks.append('Rune IDs are unique and their path/slot relationships exist.')
    for p in DATA.glob('*.csv'):
        paired = p.with_suffix('.json')
        with p.open(encoding='utf-8-sig',newline='') as f:
            rows = list(csv.DictReader(f))
        assert len(rows)==len(read(paired)), p.name
    checks.append('Every CSV parses with UTF-8 BOM and matches its JSON row count.')
    result = {'status':'passed','checks':checks,'warnings':warnings,'coverage':read(DATA/'coverage_report.json')}
    dump(DATA/'validation_report.json',result)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--version', default='16.22.1')
    parser.add_argument('--previous', default='16.21.1')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    if args.download:
        download(args.version, args.previous, max(1,min(args.workers,12)))
    coverage = reconstruct()
    result = validate()
    print(json.dumps({'status':result['status'],'checks':len(result['checks']),'warnings':len(result['warnings']),'coverage':coverage},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
