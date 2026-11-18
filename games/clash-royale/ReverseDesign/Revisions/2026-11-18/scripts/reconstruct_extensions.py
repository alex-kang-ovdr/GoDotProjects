"""Recover selected behavior fields and explicit references from the pinned archive.

Default mode rebuilds the supplied filtered facts offline. With --source, first
verify the original publisher file's SHA-256 and extract a small factual subset.
No assets, descriptions, nested copied definitions, or private client data.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from dataset_config import ROOT, ARCHIVE_DATE, ARCHIVE_COMMIT, INPUTS

FIELDS = {
    'target_buff', 'spawn_projectile', 'override_projectile', 'spawn_area_object',
    'death_spawn_character3', 'death_spawn', 'spell_as_deploy', 'maximum_targets',
    'hit_biggest_targets', 'projectile_range', 'projectile_radius',
    'apply_buff_before_damage', 'deflect_behaviour', 'deflect_radius',
    'instant_damage', 'affects_hidden', 'ignore_buildings', 'can_be_targeted',
    'stay_after_parent_dies', 'damage_on_hit', 'allowed_over_heal_perc',
    'shield', 'hitpoint_multiplier', 'dont_stop_move_anim', 'hide_time_ms',
    'attack_push_back', 'fly_direct_paths', 'elixir_production_stop_time',
    'mana_cost_from_summoner_mana', 'spawn_limit', 'death_spawn_is_same_unit',
}
REFERENCES = {
    'target_buff': ['character_buff'],
    'spawn_projectile': ['projectile'],
    'override_projectile': ['projectile'],
    'spawn_area_object': ['spell'],
    'death_spawn_character3': ['characters', 'building'],
    'death_spawn': ['characters', 'building'],
}

def encode(value):
    return (json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')

def emit(relative,value,check=False):
    content=encode(value);path=ROOT/relative
    if check:
        if not path.exists() or path.read_bytes()!=content:raise ValueError('Stale generated file: '+relative)
    else:
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content)

def extract(source):
    content=source.read_bytes()
    original_hash=hashlib.sha256(content).hexdigest()
    if original_hash!=INPUTS['card_stats'][1]:raise ValueError('Source is not the pinned 2023 public archive.')
    facts=[]
    for category,rows in json.loads(content).items():
        for row_index,row in enumerate(rows):
            if not row.get('name'):continue
            fields={key:row[key] for key in sorted(FIELDS) if key in row}
            # Select entities with at least one substantive additional value.
            # Within selected entities, retain every present field including 0/false/null.
            if not any(value is not None and value is not False and value!=0 and value!='' for value in fields.values()):continue
            facts.append({'entity_id':category+':'+row['name'],'category':category,
                          'source_row_index':row_index,'name':row['name'],'fields':fields})
    emit('data/raw/archive_behavior_2023_facts.json',facts)
    emit('data/archive_extension_manifest.json',{
        'snapshot_date':ARCHIVE_DATE,'upstream_commit':ARCHIVE_COMMIT,
        'upstream_url':f'https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{ARCHIVE_COMMIT}/docs/json/cards_stats.json',
        'original_sha256':original_hash,'original_bytes':len(content),
        'local_path':'data/raw/archive_behavior_2023_facts.json',
        'selected_sha256':hashlib.sha256(encode(facts)).hexdigest(),
        'selected_entities':len(facts),'field_whitelist':sorted(FIELDS),
        'selection':'named entities with a non-null/nonzero/nonfalse extension; all present selected fields retained',
        'is_current_live_client':False,'full_original_file_redistributed':False,
    })

def reconstruct(facts,entities):
    lookup=defaultdict(list)
    by_id={row['entity_id']:row for row in entities}
    for entity in entities:
        if not entity.get('quarantined'):lookup[(entity['category'],entity['value']['name'])].append(entity['entity_id'])
    behavior=[];links=[]
    def record(record_id,system,key,value,unit,**more):
        return {'record_id':record_id,'system':system,'key':key,'value':value,'unit':unit,
                'evidence_status':'community_snapshot','source_ids':['ARCHIVE_STATS'],
                'effective_from':None,'effective_to':None,'version_note':'2023-10-18 고정 공개 자료의 추가 필드 복구; 현행값 아님',
                'notes':'원래 공개 필드의 이름·값 보존. 단위 변환과 현재 동작 추정 없음.',
                'snapshot_date':ARCHIVE_DATE,'is_current_live_client':False,**more}
    for fact in facts:
        eid=fact['entity_id']
        if eid not in by_id or by_id[eid]['source_row_index']!=fact['source_row_index']:
            raise ValueError('Extension entity identity mismatch: '+eid)
        if set(fact['fields'])-FIELDS:raise ValueError('Unapproved extension fields')
        behavior.append(record('BEHAVIOR_EXT_'+eid,'archive_behavior_extensions',eid,fact['fields'],'provider_raw_units',
                               entity_id=eid,category=fact['category'],source_row_index=fact['source_row_index'],
                               base_entity_record_id=by_id[eid]['record_id']))
        for field,categories in REFERENCES.items():
            target=fact['fields'].get(field)
            if not isinstance(target,str) or not target:continue
            candidates=[candidate for category in categories for candidate in lookup[(category,target)]]
            links.append(record('LINK_EXT_'+eid+':'+field,'archive_entity_links',field,target,'identifier',
                                source_entity_id=eid,target_name=target,target_entity_ids=candidates,
                                resolution='resolved' if len(candidates)==1 else 'ambiguous' if candidates else 'missing',
                                field_origin='explicit_publisher_reference',extension_record_id='BEHAVIOR_EXT_'+eid))
    return behavior,links

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,help='Exact pinned publisher cards_stats.json, optional')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if args.source and args.check:parser.error('--source cannot be used with --check')
    if args.source:extract(args.source)
    manifest=json.loads((ROOT/'data/archive_extension_manifest.json').read_text(encoding='utf-8'))
    path=ROOT/manifest['local_path']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=manifest['selected_sha256']:raise ValueError('Filtered archive extension hash mismatch')
    facts=json.loads(path.read_text(encoding='utf-8'))
    entities=json.loads((ROOT/'data/tables/entity_definitions_2023.json').read_text(encoding='utf-8'))
    behavior,links=reconstruct(facts,entities)
    emit('data/tables/archive_behavior_extensions_2023.json',behavior,args.check)
    emit('data/tables/archive_reference_extensions_2023.json',links,args.check)
    print(json.dumps({'mode':'check' if args.check else 'build','behavior_entities':len(behavior),
                      'explicit_references':len(links),'unresolved':[r['record_id'] for r in links if r['resolution']!='resolved']},ensure_ascii=False))

if __name__=='__main__':main()
