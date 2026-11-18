"""Query reconstructed data without merging historical and current evidence.

python scripts/query_data.py card fireball
python scripts/query_data.py card knight --scope archive-2023 --level 11
python scripts/query_data.py compare phalanx
"""
import argparse
import json
from collections import defaultdict, deque
from dataset_config import ROOT
from rebuild import reference_level_status

def load(name):
    return json.loads((ROOT / 'data/tables' / (name + '.json')).read_text(encoding='utf-8'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['card', 'compare'])
    parser.add_argument('card_key')
    parser.add_argument('--scope', choices=['verified-2026', 'archive-2023'], default='verified-2026')
    parser.add_argument('--level', type=int, default=11)
    args = parser.parse_args()
    if args.level < 1 or args.level > 99:
        parser.error('level must be 1..99')
    key = args.card_key
    if args.command == 'compare':
        matches = [r for r in load('implementation_card_mapping') if r['key'] == key]
        output = {'scope':'custom_only', 'records':matches}
    elif args.scope == 'verified-2026':
        available = [r for r in load('verified_patch_fields_2026') if r['card_key'] == key]
        fields = [r for r in available if reference_level_status(r) == 'not_applicable'
                  or (reference_level_status(r) == 'specified' and r.get('reference_level') == args.level)]
        output = {'scope': args.scope, 'card_key':key, 'level':args.level,
                  'complete_card_profile':False, 'historical_fallback_used':False,
                  'records':fields,
                  'unspecified_level_records':[r for r in available if reference_level_status(r) == 'not_stated'],
                  'dated_behavior_facts':[r for r in load('card_behavior_research_v4') if r.get('card_key') == key],
                  'notice':'선택 레벨 명시값과 레벨 비적용 필드만 records에 포함합니다. 기준 레벨 미기재는 별도 목록이며 선택 레벨에 대입하지 않습니다. 후속 미기재 변경 플래그와 적용일을 함께 확인하세요.'}
    else:
        card = next((r for r in load('card_catalog_2023') if r['key'] == key), None)
        binding = next((r for r in load('card_bindings_2023') if r['key'] == key), None)
        roots = set(binding['value']) if binding else set()
        edges = load('entity_links_2023') + load('archive_reference_extensions_2023')
        # Follow only unambiguous public references. The visited set bounds
        # traversal by the finite graph, while retaining deeper death-spawn chains.
        visited = set(roots)
        adjacency = defaultdict(list)
        for row in edges:
            if row['resolution'] == 'resolved':
                adjacency[row['source_entity_id']].extend(row['target_entity_ids'])
        queue = deque(sorted(roots))
        while queue:
            for target in adjacency[queue.popleft()]:
                if target not in visited:
                    visited.add(target)
                    queue.append(target)
        stats = [r for r in load('level_stats_2023') if r['entity_id'] in visited and r['display_level'] == args.level]
        output = {'scope': args.scope, 'is_current_live_client':False, 'catalog':card,
                  'binding':binding, 'requested_level':args.level, 'level_stats':stats,
                  'behavior_extensions':[r for r in load('archive_behavior_extensions_2023') if r['entity_id'] in visited],
                  'reference_edges':[r for r in edges if r['source_entity_id'] in visited],
                  'notice':'2023 공개 배열의 수치입니다. 연결이 누락된 카드는 임의로 복구하지 않습니다.'}
    print(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False))

if __name__ == '__main__':
    main()
