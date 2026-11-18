#!/usr/bin/env python3
"""Validate this research package without running Besiege or the web game.

Core checks use Python's standard library. Full JSON Schema Draft 2020-12
validation is explicitly optional and runs only when jsonschema is installed.
No source repository, remote website, or network request is used.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

REPORT_VERSION = 1
LIST_IDS = {
    'original_parts': 'record_id',
    'original_parameters': 'parameter_id',
    'campaign_facts': 'fact_id',
    'conflicts': 'conflict_id',
    'experiments': 'experiment_id',
    'system_gaps': 'gap_id',
    'backlog': 'task_id',
    'public_geometry_candidates': 'candidate_id',
    'release_timeline': 'release_id',
    'sources': 'source_id',
}
SHA256 = re.compile(r'^[0-9a-f]{64}$')
SHA1 = re.compile(r'^[0-9a-f]{40}$')
CONTROL_POLICIES = {'legacy_assisted', 'assisted', 'physical'}
BINDING_MODES = {'hold', 'press', 'toggle', 'axis'}
LINK_KINDS = {'fixed', 'hinge', 'wheel', 'piston', 'brace', 'slider', 'suspension'}


class CheckFailure(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise CheckFailure(message)


def reject_constant(value):
    raise CheckFailure(f'Non-standard JSON constant: {value}')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON object key: {key!r}')
        result[key] = value
    return result


def finite_tree(value, at='$'):
    if isinstance(value, float):
        require(math.isfinite(value), f'Non-finite number at {at}')
    elif isinstance(value, dict):
        for key, item in value.items():
            finite_tree(item, f'{at}.{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            finite_tree(item, f'{at}[{index}]')


def loads_strict(text):
    value = json.loads(text, parse_constant=reject_constant,
                       object_pairs_hook=unique_object)
    finite_tree(value)
    return value


def load_strict(path):
    return loads_strict(path.read_text(encoding='utf-8-sig'))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) \
        and math.isfinite(value)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def vector(value, length, label):
    require(isinstance(value, list) and len(value) == length,
            f'{label}: expected {length} entries')
    require(all(number(item) for item in value), f'{label}: finite numeric entries required')


def index_rows(rows, key, label):
    require(isinstance(rows, list), f'{label}: expected array')
    result = {}
    for index, row in enumerate(rows):
        require(isinstance(row, dict), f'{label}[{index}]: expected object')
        identity = row.get(key)
        require(nonempty(identity), f'{label}[{index}]: missing {key}')
        require(identity not in result, f'{label}: duplicate {key} {identity!r}')
        result[identity] = row
    return result


def walk(value, path='$'):
    yield path, value
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk(item, f'{path}.{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, f'{path}[{index}]')


def within(root, path):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def historical(path):
    return any(part.startswith('baseline_') for part in path.parts)


class Validator:
    def __init__(self, root, report_path=None):
        self.root = root
        self.report_path = report_path
        self.results = []
        self.documents = {}
        self.tables = {}
        self.indices = {}
        self.counts = {}
        self.manifest_details = None
        self.schema_details = {'executed': False, 'status': 'not_checked'}
        self.inspector_details = {}
        self.started = datetime.now(timezone.utc).isoformat()

    def check(self, name, function):
        try:
            detail = function()
            self.results.append({'name': name, 'status': 'passed', 'details': detail})
        except Exception as exc:
            self.results.append({
                'name': name, 'status': 'failed',
                'error': f'{type(exc).__name__}: {exc}',
            })

    def skip(self, name, reason):
        self.results.append({'name': name, 'status': 'skipped', 'reason': reason})

    def strict_json(self):
        files = sorted(path for path in self.root.rglob('*.json')
                       if not historical(path.relative_to(self.root))
                       and path.resolve() != self.report_path)
        failures = []
        for path in files:
            rel = path.relative_to(self.root).as_posix()
            try:
                self.documents[rel] = load_strict(path)
            except Exception as exc:
                failures.append(f'{rel}: {exc}')
        self.counts['json_files'] = len(files)
        require(not failures, '; '.join(failures))
        required = [f'data/{name}.json' for name in LIST_IDS]
        required += ['data/ironwood_v4_snapshot.json',
                     'data/design_v2_proposal.schema.json',
                     'examples/design_v2_proposal.json']
        missing = [name for name in required if name not in self.documents]
        require(not missing, f'Missing required JSON: {missing}')
        return {'files': len(files), 'duplicate_keys_rejected': True,
                'nan_infinity_overflow_rejected': True}

    def table_ids(self):
        for name, key in LIST_IDS.items():
            filename = f'data/{name}.json'
            require(filename in self.documents, f'{filename}: not loaded')
            rows = self.documents[filename]
            self.tables[name] = rows
            self.indices[name] = index_rows(rows, key, filename)
            self.counts[name] = len(rows)
        # Research fragments may repeat IDs in the merged registry, but may
        # not duplicate an ID within one fragment or contradict its full row.
        merged = self.indices['sources']
        fragments = 0
        for filename, rows in self.documents.items():
            if filename.startswith('research/') and filename.endswith('_sources.json'):
                fragment = index_rows(rows, 'source_id', filename)
                fragments += 1
                for identity, row in fragment.items():
                    require(identity in merged, f'{filename}: source missing from merged registry: {identity}')
                    require(row == merged[identity],
                            f'{filename}: source row differs from merged registry: {identity}')
        return {'table_rows': {name: len(rows) for name, rows in self.tables.items()},
                'source_fragments': fragments}

    def source_references(self):
        require('sources' in self.indices, 'Source registry not indexed')
        source_ids = set(self.indices['sources'])
        part_ids = set(self.indices['original_parts'])
        parameter_ids = set(self.indices['original_parameters'])
        conflict_ids = set(self.indices['conflicts'])
        counts = {'source_refs': 0, 'part_refs': 0, 'parameter_refs': 0, 'conflict_refs': 0}
        for filename, document in self.documents.items():
            for at, item in walk(document):
                if not isinstance(item, dict):
                    continue
                if 'source_ids' in item:
                    refs = item['source_ids']
                    require(isinstance(refs, list) and all(nonempty(ref) for ref in refs),
                            f'{filename}{at}: source_ids must be string array')
                    require(len(refs) == len(set(refs)), f'{filename}{at}: duplicate source_ids')
                    for ref in refs:
                        require(ref in source_ids, f'{filename}{at}: unresolved source {ref}')
                    counts['source_refs'] += len(refs)
                if 'part_record_id' in item:
                    ref = item['part_record_id']
                    require(ref is None or ref in part_ids,
                            f'{filename}{at}: unresolved part_record_id {ref}')
                    counts['part_refs'] += int(ref is not None)
                if 'claim_parameter_ids' in item:
                    refs = item['claim_parameter_ids']
                    require(isinstance(refs, list), f'{filename}{at}: claim_parameter_ids must be array')
                    require(len(refs) == len(set(refs)), f'{filename}{at}: duplicate parameter refs')
                    for ref in refs:
                        require(ref in parameter_ids, f'{filename}{at}: unresolved parameter {ref}')
                    counts['parameter_refs'] += len(refs)
                if item.get('conflict_group') is not None:
                    ref = item['conflict_group']
                    require(ref in conflict_ids, f'{filename}{at}: unresolved conflict {ref}')
                    counts['conflict_refs'] += 1
        for source_id, source in self.indices['sources'].items():
            require(nonempty(source.get('title')), f'{source_id}: title missing')
            require(urlsplit(source.get('url', '')).scheme in {'https', 'http'},
                    f'{source_id}: expected source URL')
            for key in ['published_date', 'accessed_date']:
                value = source.get(key)
                if value is not None:
                    require(isinstance(value, str), f'{source_id}: {key} must be ISO date')
                    date.fromisoformat(value)
            require(source.get('accessed_date') is not None, f'{source_id}: accessed_date missing')
        return counts

    def evidence_boundaries(self):
        for row in self.tables['original_parts']:
            identity = row['record_id']
            require('original_block_id' in row and row['original_block_id'] is None,
                    f'{identity}: original_block_id must remain null')
            values = row.get('current_numeric_parameters')
            require(isinstance(values, dict) and values,
                    f'{identity}: current_numeric_parameters must be explicit null-valued object')
            require(all(value is None for value in values.values()),
                    f'{identity}: current original numeric parameter was filled without measurement')
            require(isinstance(row.get('unknown_parameters'), list),
                    f'{identity}: unknown_parameters missing')
        for row in self.tables['original_parameters']:
            require('current_applicable_value' in row and row['current_applicable_value'] is None,
                    f"{row['parameter_id']}: current_applicable_value must remain null")
            require(nonempty(row.get('version_scope')) and nonempty(row.get('unit')),
                    f"{row['parameter_id']}: version_scope/unit missing")
        for row in self.tables['experiments']:
            require(row.get('status') == 'not_run' and 'result' in row and row['result'] is None,
                    f"{row['experiment_id']}: planned experiment must be not_run with null result")
            require(row.get('measurements') and nonempty(row.get('acceptance_rule')),
                    f"{row['experiment_id']}: measurable acceptance criteria missing")
        for name, id_key in [('backlog', 'task_id'), ('system_gaps', 'gap_id')]:
            for row in self.tables[name]:
                require(row.get('status') == 'planned', f'{row[id_key]}: status must be planned')
                require(row.get('priority') in {'P0', 'P1', 'P2'}, f'{row[id_key]}: invalid priority')
                require(isinstance(row.get('acceptance_criteria'), list)
                        and all(nonempty(text) for text in row['acceptance_criteria'])
                        and row['acceptance_criteria'],
                        f'{row[id_key]}: acceptance criteria missing')
        for row in self.tables['conflicts']:
            identity = row['conflict_id']
            require('adopted_current_value' in row and row['adopted_current_value'] is None,
                    f'{identity}: unresolved adopted value must remain null')
            require(row.get('blocks_runtime_auto_import') is True,
                    f'{identity}: runtime auto-import must stay blocked')
            require(row.get('status') in {'unresolved', 'scope_unresolved'},
                    f'{identity}: unsupported conflict status')
        for row in self.tables['public_geometry_candidates']:
            identity = row['candidate_id']
            require('original_block_id' in row and row['original_block_id'] is None,
                    f'{identity}: research key must not become original ID')
            require(row.get('verified_in_game') is False, f'{identity}: game measurement not performed')
            require(row.get('evidence_status') == 'research_tool_proxy',
                    f'{identity}: expected research_tool_proxy evidence')
            require(row.get('allowed_use') == 'measurement_fixture_candidate_only',
                    f'{identity}: candidate use must not become production geometry')
            vector(row.get('bbox_size'), 3, f'{identity}.bbox_size')
            require(all(value > 0 for value in row['bbox_size']), f'{identity}: nonpositive bbox')
        return {'original_numeric_adoption': 'blocked',
                'experiments': 'not_run', 'new_implementation': 'planned',
                'geometry': 'proxy_only'}

    def dependency_graphs(self):
        summaries = {}
        for table in ['system_gaps', 'backlog']:
            index = self.indices[table]
            edges = 0
            for identity, row in index.items():
                deps = row.get('dependencies')
                require(isinstance(deps, list) and all(nonempty(dep) for dep in deps),
                        f'{identity}: dependencies must be string array')
                require(len(deps) == len(set(deps)), f'{identity}: duplicate dependency')
                require(all(dep in index for dep in deps), f'{identity}: unresolved dependency')
                require(identity not in deps, f'{identity}: self dependency')
                edges += len(deps)
            visiting, done = set(), set()

            def visit(identity):
                require(identity not in visiting, f'{table}: cycle at {identity}')
                if identity in done:
                    return
                visiting.add(identity)
                for dependency in index[identity]['dependencies']:
                    visit(dependency)
                visiting.remove(identity)
                done.add(identity)

            for identity in index:
                visit(identity)
            summaries[table] = {'nodes': len(index), 'edges': edges, 'acyclic': True}
        gap_index = self.indices['system_gaps']
        for identity, task in self.indices['backlog'].items():
            refs = task.get('gap_ids')
            require(isinstance(refs, list) and refs, f'{identity}: gap_ids missing')
            require(len(refs) == len(set(refs)), f'{identity}: duplicate gap_ids')
            require(all(ref in gap_index for ref in refs), f'{identity}: unresolved gap_ids')
        return summaries

    def timeline(self):
        rows = self.tables['release_timeline']
        require(rows, 'Release timeline empty')
        orders, dates = [], []
        for row in rows:
            order = row.get('release_order')
            require(isinstance(order, int) and not isinstance(order, bool) and order > 0,
                    f"{row['release_id']}: positive release_order required")
            orders.append(order)
            dates.append(date.fromisoformat(row['published_date']))
            require(nonempty(row.get('version_label')), f"{row['release_id']}: version label missing")
            require(row.get('ordering_policy') ==
                    'official_publication_date_and_verified_changeset_not_semver',
                    f"{row['release_id']}: explicit chronological policy required")
        require(len(orders) == len(set(orders)), 'Duplicate release_order')
        require(orders == sorted(orders), 'Timeline rows must follow explicit release_order')
        require(dates == sorted(dates), 'Timeline dates must be chronological')
        return {'entries': len(rows), 'ordering': 'explicit_order_and_publication_date',
                'semver_parsing_used': False}

    def snapshot(self):
        snapshot = self.documents['data/ironwood_v4_snapshot.json']
        require(isinstance(snapshot, dict), 'Snapshot must be object')
        require(snapshot.get('project') == 'IRONWOOD'
                and snapshot.get('version') == '4.0.0'
                and snapshot.get('source_kind') == 'local_implementation',
                'Snapshot identity is not IRONWOOD 4.0.0 local_implementation')
        require(bool(SHA1.fullmatch(snapshot.get('commit_sha', ''))), 'Snapshot commit must be full SHA-1')
        part_index = index_rows(snapshot.get('parts'), 'id', 'snapshot.parts')
        expected_parts = {'core', 'wood', 'wheel', 'cannon', 'brace',
                          'hinge', 'float', 'propeller', 'wing', 'piston'}
        require(set(part_index) == expected_parts, 'V4 part catalogue does not match audited set')
        for identity, part in part_index.items():
            for key in ['mass', 'cost', 'maxHp']:
                require(number(part.get(key)) and part[key] > 0, f'{identity}: invalid {key}')
        presets = index_rows(snapshot.get('presets'), 'id', 'snapshot.presets')
        require(set(presets) == {'rover', 'ram', 'boat', 'plane', 'lift', 'blank'},
                'V4 preset set mismatch')
        for identity, preset in presets.items():
            parts = index_rows(preset.get('parts'), 'id', f'{identity}.parts')
            require(preset.get('part_count') == len(parts), f'{identity}: part_count mismatch')
            require(all(part.get('type') in part_index for part in parts.values()),
                    f'{identity}: unknown part type')
            require(preset.get('validation', {}).get('valid') is True,
                    f'{identity}: source validation not valid')
            stats = preset.get('stats', {})
            expected_mass = round(sum(part_index[part['type']]['mass'] for part in parts.values()), 1)
            expected_cost = sum(part_index[part['type']]['cost'] for part in parts.values())
            require(stats.get('count') == len(parts) and stats.get('cost') == expected_cost
                    and stats.get('mass') == expected_mass, f'{identity}: stats mismatch')
            pairs = set()
            for link in preset.get('connections', []):
                require(link.get('a') in parts and link.get('b') in parts
                        and link['a'] != link['b'], f'{identity}: invalid connection endpoints')
                pair = tuple(sorted([link['a'], link['b']]))
                require(pair not in pairs, f'{identity}: duplicate connection')
                pairs.add(pair)
        missions = index_rows(snapshot.get('missions'), 'id', 'snapshot.missions')
        require(set(missions) == {'outpost', 'gate', 'citadel', 'harbor',
                                 'skyway', 'switchback', 'sandbox'}, 'V4 mission set mismatch')
        require(sum(mission.get('campaign') is True for mission in missions.values()) == 6,
                'Expected 6 V4 campaign missions')
        for identity, mission in missions.items():
            layout = mission.get('layout', {})
            require(mission.get('targetCount') == len(layout.get('targets', [])),
                    f'{identity}: target count mismatch')
            require(mission.get('checkpointCount') == len(layout.get('checkpoints', [])),
                    f'{identity}: checkpoint count mismatch')
            require(mission.get('recommendedPreset') in presets, f'{identity}: bad recommended preset')
        constants = index_rows(snapshot.get('constants'), 'key', 'snapshot.constants')
        fingerprints = index_rows(snapshot.get('source_fingerprints'), 'file', 'snapshot.source_fingerprints')
        expected_files = {
            'package.json', 'dist/parts.js', 'dist/editor.js', 'dist/physics.js',
            'dist/linear-actuator.js', 'dist/input.js', 'dist/report.js',
            'dist/designs.js', 'dist/campaign.js', 'dist/main.js',
            'dist/scene.js', 'dist/vendor/cannon-es.js',
        }
        require(expected_files <= set(fingerprints), 'Snapshot source fingerprint set incomplete')
        for filename, row in fingerprints.items():
            require(not PurePosixPath(filename).is_absolute() and '..' not in PurePosixPath(filename).parts,
                    f'Unsafe source path {filename}')
            require(bool(SHA256.fullmatch(row.get('sha256', ''))), f'{filename}: invalid SHA-256')
            require(isinstance(row.get('size_bytes'), int) and row['size_bytes'] > 0,
                    f'{filename}: invalid byte count')
        for key, row in constants.items():
            require(row.get('source_file') in fingerprints, f'{key}: source_file not fingerprinted')
            require(nonempty(row.get('unit')) and nonempty(row.get('source_symbol')),
                    f'{key}: unit/source symbol missing')
        self.counts['snapshot_source_fingerprints'] = len(fingerprints)
        return {'parts': len(part_index), 'presets': len(presets),
                'campaign_missions': 6, 'total_missions': len(missions),
                'constants': len(constants), 'source_fingerprints': len(fingerprints),
                'actual_repository_hash_comparison_executed': False,
                'note': 'Only snapshot metadata/shape checked; original repository comparison belongs to the audit.'}

    def sample_semantics(self):
        schema = self.documents['data/design_v2_proposal.schema.json']
        sample = self.documents['examples/design_v2_proposal.json']
        require(isinstance(schema, dict)
                and schema.get('$schema') == 'https://json-schema.org/draft/2020-12/schema',
                'Expected Draft 2020-12 proposal schema')
        require(isinstance(sample, dict), 'Sample must be object')
        require(sample.get('format') == 'ironwood-design'
                and sample.get('version') == 2 and sample.get('status') == 'proposal',
                'Sample identity/status mismatch')
        require(sample.get('kind') in {'assembly', 'module'}, 'Invalid sample kind')
        require(sample.get('coordinateFrame') == 'ironwood_build_y_up_forward_minus_z',
                'Sample coordinate frame mismatch')
        require(set(schema.get('required', [])) <= set(sample), 'Sample missing required top-level fields')
        require(set(sample) <= set(schema.get('properties', {})), 'Sample has unknown top-level fields')
        profile = sample.get('profile', {})
        require(profile.get('controlPolicy') in CONTROL_POLICIES, 'Invalid control policy')
        for key in ['catalogRevision', 'physicsRevision']:
            value = profile.get(key)
            require(isinstance(value, int) and not isinstance(value, bool) and value >= 1,
                    f'Invalid {key}')
        parts = index_rows(sample.get('parts'), 'id', 'sample.parts')
        require(1 <= len(parts) <= 100, 'Sample part count outside proposal limits')
        for identity, part in parts.items():
            require(len(identity) <= 128, f'{identity}: instance ID too long')
            vector(part.get('position'), 3, f'{identity}.position')
            vector(part.get('orientation'), 4, f'{identity}.orientation')
            norm = math.sqrt(sum(value * value for value in part['orientation']))
            require(abs(norm - 1) <= 1e-6, f'{identity}: quaternion is not normalized')
            require(isinstance(part.get('parameters'), dict), f'{identity}: parameters missing')
        if profile.get('catalogId') == 'legacy_v4':
            types = {part['id'] for part in self.documents['data/ironwood_v4_snapshot.json']['parts']}
            require(all(part.get('typeId') in types for part in parts.values()),
                    'Unknown type in legacy_v4 sample catalogue')
        if sample['kind'] == 'assembly' and profile.get('objectivePolicy') == 'legacy_core_campaign':
            require(sum(part.get('typeId') == 'core' for part in parts.values()) == 1,
                    'Legacy core assembly must have exactly one core')
        actions = index_rows(sample.get('actions'), 'id', 'sample.actions')
        for identity, action in actions.items():
            require(action.get('valueType') in {'boolean', 'axis'}, f'{identity}: action type invalid')

        def endpoint(value, label):
            require(isinstance(value, dict) and value.get('partId') in parts,
                    f'{label}: dangling part reference')
            require(nonempty(value.get('portId')), f'{label}: portId missing')
            vector(value.get('localAnchor'), 3, f'{label}.localAnchor')

        links = index_rows(sample.get('connections'), 'id', 'sample.connections')
        pairs = set()
        for identity, link in links.items():
            require(link.get('kind') in LINK_KINDS, f'{identity}: invalid link kind')
            endpoint(link.get('a'), f'{identity}.a')
            endpoint(link.get('b'), f'{identity}.b')
            require(link['a']['partId'] != link['b']['partId'], f'{identity}: self connection')
            ends = sorted([
                (link['a']['partId'], link['a']['portId'], tuple(link['a']['localAnchor'])),
                (link['b']['partId'], link['b']['portId'], tuple(link['b']['localAnchor'])),
            ])
            pair = (link['kind'], tuple(ends))
            require(pair not in pairs, f'{identity}: duplicate link')
            pairs.add(pair)
        bindings = index_rows(sample.get('bindings'), 'id', 'sample.bindings')
        for identity, binding in bindings.items():
            require(binding.get('partId') in parts, f'{identity}: dangling bound part')
            require(binding.get('actionId') in actions, f'{identity}: dangling action')
            require(binding.get('mode') in BINDING_MODES, f'{identity}: invalid binding mode')
            require(nonempty(binding.get('portId')), f'{identity}: bound port missing')
            require(number(binding.get('scale')) and -1 <= binding['scale'] <= 1,
                    f'{identity}: invalid binding scale')
            expected_type = 'axis' if binding['mode'] == 'axis' else 'boolean'
            require(actions[binding['actionId']]['valueType'] == expected_type,
                    f'{identity}: action value type conflicts with binding mode')
        interfaces = sample.get('moduleInterfaces')
        require(isinstance(interfaces, dict), 'moduleInterfaces missing')
        structural = index_rows(interfaces.get('structural'), 'id', 'sample.moduleInterfaces.structural')
        exposed_actions = index_rows(interfaces.get('actions'), 'id', 'sample.moduleInterfaces.actions')
        require(not (set(structural) & set(exposed_actions)), 'Duplicate exposed interface ID')
        for identity, interface in structural.items():
            endpoint(interface.get('target'), f'{identity}.target')
            allowed = interface.get('allowedLinks')
            require(isinstance(allowed, list) and allowed and len(allowed) == len(set(allowed))
                    and set(allowed) <= LINK_KINDS, f'{identity}: invalid allowedLinks')
        for identity, interface in exposed_actions.items():
            require(interface.get('actionId') in actions, f'{identity}: dangling exposed action')
        if sample['kind'] == 'assembly':
            require(not structural and not exposed_actions, 'Assembly must not expose module interfaces')
        return {'parts': len(parts), 'connections': len(links), 'actions': len(actions),
                'bindings': len(bindings), 'normalized_quaternions': True,
                'reference_integrity': True,
                'actual_port_catalog_compatibility_executed': False,
                'note': 'Port names are proposals; no runtime port catalogue or gameplay execution is present.'}

    def full_schema(self):
        if importlib.util.find_spec('jsonschema') is None:
            self.schema_details = {
                'executed': False, 'status': 'skipped',
                'reason': 'Optional jsonschema package is not installed. Semantic checks are not full JSON Schema validation.',
            }
            self.skip('json_schema_draft_2020_12', self.schema_details['reason'])
            return

        def perform():
            from jsonschema import Draft202012Validator
            schema = self.documents['data/design_v2_proposal.schema.json']
            sample = self.documents['examples/design_v2_proposal.json']
            for at, node in walk(schema):
                if isinstance(node, dict):
                    for keyword in ('$ref', '$dynamicRef'):
                        if keyword in node:
                            require(isinstance(node[keyword], str) and node[keyword].startswith('#'),
                                    f'{at}: remote schema references are disabled by this offline validator')
            Draft202012Validator.check_schema(schema)
            errors = sorted(Draft202012Validator(schema).iter_errors(sample),
                            key=lambda error: str(list(error.path)))
            require(not errors, '; '.join(
                f'{list(error.path)}: {error.message}' for error in errors[:20]))
            self.schema_details = {
                'executed': True, 'status': 'passed',
                'implementation': 'jsonschema.Draft202012Validator',
                'schema_checked': True, 'sample_validated': True,
                'network_requests': False,
            }
            return self.schema_details

        previous = len(self.results)
        self.check('json_schema_draft_2020_12', perform)
        if self.results[previous]['status'] == 'failed':
            self.schema_details = {'executed': True, 'status': 'failed',
                                   'error': self.results[previous]['error']}

    def markdown(self):
        tick = chr(96)
        opener_re = re.compile(r'^ {0,3}(' + tick + r'{3,}|~{3,})(.*)$')
        inline_re = re.compile(r'(' + tick + r'+).*?\1')
        links_re = re.compile(r'!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^()\s])+(?:\([^()\n]*\)[^()\s]*)*)'
                              r'(?:\s+["\'][^"\']*["\'])?\s*\)')
        reference_re = re.compile(r'!?\[([^\]\n]+)\]\[([^\]\n]*)\]')
        definition_re = re.compile(r'^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)')
        files = sorted(path for path in self.root.rglob('*.md')
                       if not historical(path.relative_to(self.root)))
        failures, targets = [], []
        fences = 0
        for path in files:
            rel = path.relative_to(self.root).as_posix()
            fence = None
            visible = []
            definitions = {}
            refs = []
            for line_number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                match = opener_re.match(line)
                if fence:
                    if match and match.group(1)[0] == fence[0] \
                            and len(match.group(1)) >= fence[1] and not match.group(2).strip():
                        fence = None
                    continue
                if match:
                    fence = (match.group(1)[0], len(match.group(1)), line_number)
                    fences += 1
                    continue
                clean = inline_re.sub('', line)
                visible.append(clean)
                definition = definition_re.match(clean)
                if definition:
                    label = ' '.join(definition.group(1).split()).casefold()
                    destination = definition.group(2)
                    definitions[label] = destination
                    targets.append((path, line_number, destination))
                    continue
                for match in links_re.finditer(clean):
                    targets.append((path, line_number, match.group(1)))
                for match in reference_re.finditer(clean):
                    label = ' '.join((match.group(2) or match.group(1)).split()).casefold()
                    refs.append((line_number, label))
            if fence:
                failures.append(f'{rel}:{fence[2]}: unclosed fenced code block')
            for line_number, label in refs:
                if label not in definitions:
                    failures.append(f'{rel}:{line_number}: unresolved reference link {label!r}')
        relative_count = 0
        for path, line_number, raw in targets:
            destination = raw[1:-1] if raw.startswith('<') and raw.endswith('>') else raw
            destination = re.sub(r'\\([\\() ])', r'\1', destination)
            parsed = urlsplit(destination)
            if parsed.scheme or parsed.netloc:
                continue
            relative_count += 1
            rel = path.relative_to(self.root).as_posix()
            target_path = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            if not within(self.root, target_path):
                failures.append(f'{rel}:{line_number}: link leaves package root: {destination}')
            elif not target_path.exists():
                failures.append(f'{rel}:{line_number}: missing link target: {destination}')
            # Anchors are renderer-dependent (especially Korean punctuation).
            # File existence is checked; the report explicitly states the limit.
        self.counts['markdown_files_checked'] = len(files)
        self.counts['markdown_files_historical_excluded'] = sum(
            historical(path.relative_to(self.root)) for path in self.root.rglob('*.md'))
        self.counts['relative_links_checked'] = relative_count
        require(not failures, '; '.join(failures))
        return {'files': len(files), 'fenced_blocks': fences, 'relative_links': relative_count,
                'historical_baseline_excluded': True, 'fragment_anchor_validation': 'not_run',
                'note': 'Checks local link targets and balanced fences; no external URL or renderer check.'}

    def csv_matches(self):
        paths = sorted(self.root.rglob('*.csv'))
        summaries = []
        for path in paths:
            if historical(path.relative_to(self.root)):
                continue
            stem = path.stem
            derived = {f'ironwood_v4_{key}': key for key in ('parts', 'missions', 'constants')}
            if stem in derived:
                rel_json = 'data/ironwood_v4_snapshot.json'
                require(rel_json in self.documents, f'{path.name}: snapshot JSON not loaded')
                rows = self.documents[rel_json].get(derived[stem])
                json_origin = rel_json + '#/' + derived[stem]
            else:
                candidates = [path.with_suffix('.json'), self.root / 'data' / f'{stem}.json']
                json_path = next((candidate for candidate in candidates if candidate.is_file()), None)
                if json_path is None:
                    matches = [name for name, value in self.documents.items()
                               if Path(name).stem == stem and isinstance(value, list)]
                    require(len(matches) == 1, f'{path.name}: no unique corresponding JSON')
                    json_path = self.root / matches[0]
                rel_json = json_path.relative_to(self.root).as_posix()
                require(rel_json in self.documents, f'{path.name}: corresponding JSON not loaded')
                rows = self.documents[rel_json]
                json_origin = rel_json
            require(isinstance(rows, list) and all(isinstance(row, dict) for row in rows),
                    f'{path.name}: corresponding JSON must be record array')
            expected_fields = set().union(*(set(row) for row in rows)) if rows else set()
            with path.open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                fields = reader.fieldnames or []
                require(len(fields) == len(set(fields)), f'{path.name}: duplicate header')
                require(set(fields) == expected_fields, f'{path.name}: JSON/CSV field mismatch')
                actual_rows = list(reader)
            require(len(actual_rows) == len(rows), f'{path.name}: row count mismatch')
            for row_index, (expected, actual) in enumerate(zip(rows, actual_rows), 1):
                require(None not in actual and all(cell is not None for cell in actual.values()),
                        f'{path.name}:{row_index}: malformed column count')
                for key in fields:
                    cell = actual[key]
                    if key not in expected:
                        require(cell in {'', 'null'},
                                f'{path.name}:{row_index}:{key}: value for absent optional JSON field')
                        continue
                    value = expected[key]
                    if isinstance(value, str) and cell == value:
                        continue
                    if value is None:
                        require(cell == 'null', f'{path.name}:{row_index}:{key}: explicit null must be null text')
                        continue
                    try:
                        parsed = loads_strict(cell)
                    except Exception as exc:
                        raise CheckFailure(f'{path.name}:{row_index}:{key}: invalid JSON cell: {exc}') from exc
                    require(type(parsed) is type(value) or
                            (number(parsed) and number(value)),
                            f'{path.name}:{row_index}:{key}: JSON/CSV value type mismatch')
                    require(parsed == value, f'{path.name}:{row_index}:{key}: JSON/CSV cell mismatch')
            summaries.append({'file': path.relative_to(self.root).as_posix(),
                              'json': json_origin, 'rows': len(rows), 'fields': len(fields)})
        self.counts['csv_files_checked'] = len(summaries)
        return {'files': summaries,
                'status': 'checked' if summaries else 'none_present',
                'missing_optional_field_policy': 'blank or null only when JSON key is absent'}

    def inspector(self):
        script = self.root / 'scripts' / 'inspect_bsg.py'
        fixture = self.root / 'examples' / 'xml_inspection_fixture.xml'
        require(script.is_file() and fixture.is_file(), 'Inspector or synthetic fixture missing')
        original_hash = sha256(fixture)
        original_bytes = fixture.read_bytes()
        cases = []

        def invoke(path, output=None):
            command = [sys.executable, str(script), str(path)]
            if output is not None:
                command += ['--out', str(output)]
            return subprocess.run(command, capture_output=True, text=True,
                                  encoding='utf-8', timeout=15, check=False)

        success = invoke(fixture)
        require(success.returncode == 0, f'Inspector fixture failed: {success.stderr}')
        report = loads_strict(success.stdout)
        require(report.get('format') == 'generic_xml_inspection'
                and report.get('verified_besiege_importer') is False,
                'Inspector must identify generic/unverified result')
        require(report.get('block_like_elements') == 2, 'Synthetic fixture must contain 2 Block-like elements')
        require(report.get('sha256') == original_hash
                and report.get('size_bytes') == len(original_bytes),
                'Inspector input hash/byte count mismatch')
        labels = [row.get('text') for row in report.get('leaf_parameters', [])]
        require('한글 검사 예제' in labels and '두 번째 예제' in labels, 'Korean text not preserved')
        require(sha256(fixture) == original_hash, 'Fixture changed during inspection')
        cases.append('synthetic_utf8_two_blocks_korean_hash_unchanged')

        with tempfile.TemporaryDirectory(prefix='besiege-validation-') as temp_name:
            temp = Path(temp_name)
            converted = original_bytes.decode('utf-8').replace('encoding="UTF-8"', 'encoding="UTF-16"')
            utf16 = temp / 'synthetic_utf16.xml'
            utf16.write_bytes(converted.encode('utf-16'))
            utf16_hash = sha256(utf16)
            response = invoke(utf16)
            require(response.returncode == 0, f'UTF-16 fixture failed: {response.stderr}')
            result = loads_strict(response.stdout)
            require(result.get('block_like_elements') == 2 and result.get('sha256') == utf16_hash,
                    'UTF-16 block/hash mismatch')
            require('한글 검사 예제' in [row.get('text') for row in result.get('leaf_parameters', [])],
                    'UTF-16 Korean text not preserved')
            require(sha256(utf16) == utf16_hash, 'UTF-16 input changed')
            cases.append('synthetic_utf16_two_blocks_korean_hash_unchanged')

            dtd = '<?xml version="1.0"?><!DOCTYPE Fixture [<!ENTITY x "blocked">]><Fixture>&x;</Fixture>'
            invalid_cases = [
                ('dtd_utf8', dtd.encode('utf-8'), 'DTD/entity'),
                ('dtd_utf16', dtd.replace('version="1.0"', 'version="1.0" encoding="UTF-16"').encode('utf-16'), 'DTD/entity'),
                ('malformed_xml', b'<Fixture><Block></Fixture>', None),
            ]
            for name, raw, expected_error in invalid_cases:
                source = temp / f'{name}.xml'
                output = temp / f'{name}.json'
                source.write_bytes(raw)
                before = sha256(source)
                response = invoke(source, output)
                require(response.returncode != 0, f'{name}: invalid input was accepted')
                require(not output.exists(), f'{name}: output created despite rejection')
                require(sha256(source) == before, f'{name}: input changed')
                if expected_error:
                    require(expected_error in response.stderr, f'{name}: wrong rejection path')
                cases.append(name + '_rejected')

            output = temp / 'existing-report.json'
            sentinel = b'{"preserve":"existing output"}\n'
            output.write_bytes(sentinel)
            response = invoke(fixture, output)
            require(response.returncode != 0 and output.read_bytes() == sentinel,
                    'Existing output must not be overwritten')
            require(sha256(fixture) == original_hash, 'Input changed on overwrite rejection')
            cases.append('existing_output_preserved')

            same = temp / 'same-input-output.xml'
            same.write_bytes(original_bytes)
            before = sha256(same)
            response = invoke(same, same)
            require(response.returncode != 0 and sha256(same) == before,
                    'Output must not replace input')
            cases.append('same_input_output_rejected')
        require(sha256(fixture) == original_hash, 'Synthetic fixture hash changed')
        self.inspector_details = {'cases': cases, 'count': len(cases),
                                  'real_bsg_fixture_used': False,
                                  'network_requests': False,
                                  'source_modified': False}
        return self.inspector_details

    def manifest(self, explicit=None, skip=False):
        if skip:
            self.manifest_details = {'status': 'skipped', 'reason': '--skip-manifest'}
            self.skip('manifest_sha256', '--skip-manifest')
            return
        if explicit:
            path = explicit.resolve()
            require(path.is_file(), f'Manifest not found: {path}')
        else:
            candidates = [self.root / name for name in
                          ['manifest.json', 'MANIFEST.json', 'SHA256SUMS', 'manifest.sha256']]
            path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if path is None:
            self.manifest_details = {'status': 'skipped', 'reason': 'No manifest present'}
            self.skip('manifest_sha256', 'No manifest present')
            return

        def perform():
            rows = []
            if path.suffix.lower() == '.json':
                data = load_strict(path)
                if isinstance(data, dict) and isinstance(data.get('files'), list):
                    rows = data['files']
                elif isinstance(data, list):
                    rows = data
                elif isinstance(data, dict) and all(isinstance(value, str) for value in data.values()):
                    rows = [{'path': name, 'sha256': digest} for name, digest in data.items()]
                else:
                    raise CheckFailure('Unsupported JSON manifest; use {files:[{path,sha256,size_bytes?}]}')
            else:
                for line in path.read_text(encoding='utf-8').splitlines():
                    if not line.strip() or line.lstrip().startswith('#'):
                        continue
                    match = re.fullmatch(r'([0-9a-fA-F]{64})\s+\*?(.+)', line)
                    require(match is not None, f'Invalid SHA256SUMS line: {line[:100]}')
                    rows.append({'path': match.group(2), 'sha256': match.group(1).lower()})
            seen = set()
            require(rows, 'Manifest empty')
            for row in rows:
                require(isinstance(row, dict), 'Manifest entry must be object')
                filename = row.get('path', row.get('file'))
                require(nonempty(filename), 'Manifest entry path missing')
                require(filename not in seen, f'Duplicate manifest path: {filename}')
                seen.add(filename)
                target = (self.root / filename).resolve()
                require(within(self.root, target), f'Manifest path leaves root: {filename}')
                require(target != path.resolve(), 'Manifest cannot include its own digest')
                require(target != self.report_path,
                        'Manifest includes the report being rewritten. Exclude that report from the manifest, '
                        'or verify the manifest without --json-report after the report is finalized.')
                require(target.is_file(), f'Manifest target missing: {filename}')
                digest = row.get('sha256', '')
                require(isinstance(digest, str) and bool(SHA256.fullmatch(digest.lower())),
                        f'Malformed manifest digest: {filename}')
                require(sha256(target) == digest.lower(), f'Manifest SHA mismatch: {filename}')
                if 'size_bytes' in row:
                    require(row['size_bytes'] == target.stat().st_size, f'Manifest size mismatch: {filename}')
            self.manifest_details = {
                'status': 'passed', 'manifest': str(path.relative_to(self.root)) if within(self.root, path) else str(path),
                'files_checked': len(rows),
                'coverage': 'listed_files_only; no implicit completeness claim',
            }
            return self.manifest_details

        previous = len(self.results)
        self.check('manifest_sha256', perform)
        if self.results[previous]['status'] == 'failed':
            self.manifest_details = {'status': 'failed', 'error': self.results[previous]['error']}

    def run(self, manifest_path=None, skip_manifest=False):
        self.check('strict_json', self.strict_json)
        self.check('table_ids_and_source_fragments', self.table_ids)
        self.check('source_and_record_references', self.source_references)
        self.check('evidence_and_completion_boundaries', self.evidence_boundaries)
        self.check('task_and_gap_dependency_graphs', self.dependency_graphs)
        self.check('chronological_release_timeline', self.timeline)
        self.check('ironwood_v4_snapshot_shape', self.snapshot)
        self.check('proposal_sample_semantics', self.sample_semantics)
        self.full_schema()
        self.check('markdown_links_and_fences', self.markdown)
        self.check('csv_json_equality', self.csv_matches)
        self.check('xml_inspector_behavior', self.inspector)
        try:
            self.manifest(manifest_path, skip_manifest)
        except Exception as exc:
            self.results.append({'name': 'manifest_sha256', 'status': 'failed',
                                 'error': f'{type(exc).__name__}: {exc}'})
        failed = [result for result in self.results if result['status'] == 'failed']
        return {
            'validation_report_version': REPORT_VERSION,
            'generated_at_utc': self.started,
            'package_root': str(self.root),
            'passed': not failed,
            'check_groups': {
                status: sum(result['status'] == status for result in self.results)
                for status in ['passed', 'failed', 'skipped']
            },
            'counts': self.counts,
            'json_schema_2020_12': self.schema_details,
            'xml_inspector': self.inspector_details,
            'manifest': self.manifest_details,
            'checks': self.results,
            'limitations': [
                'No Besiege installation, gameplay, browser GPU, or real-device input test was run.',
                'No original numeric value was measured or adopted by this validator.',
                'Snapshot fingerprints are checked for structure, not against the live source repository.',
                'Local Markdown link targets are checked; external URLs and fragment anchors are not fetched/validated.',
                'Proposal semantics do not validate missing runtime port catalogues or guarantee executable gameplay.',
                'Historical baseline Markdown files are excluded from current-document checks.',
                'Optional full JSON Schema execution and manifest execution are reported separately.',
            ],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent,
                        help='Package root (default: parent of scripts directory)')
    parser.add_argument('--json-report', type=Path, help='Write a new report, or replace this tool own report')
    parser.add_argument('--manifest', type=Path, help='Explicit manifest; defaults to common filenames at root')
    parser.add_argument('--skip-manifest', action='store_true', help='Skip optional manifest verification')
    args = parser.parse_args()
    if args.manifest and args.skip_manifest:
        parser.error('--manifest and --skip-manifest are mutually exclusive')
    root = args.root.resolve()
    if not root.is_dir():
        parser.error(f'Package root not found: {root}')
    report_path = args.json_report.resolve() if args.json_report else None
    if report_path and report_path.exists():
        try:
            old_report = load_strict(report_path)
            if not isinstance(old_report, dict) or old_report.get('validation_report_version') != REPORT_VERSION:
                parser.error('--json-report will not overwrite a non-validation file')
        except (OSError, ValueError) as exc:
            parser.error(f'Existing report is not an owned validation report: {exc}')
    report = Validator(root, report_path).run(args.manifest, args.skip_manifest)
    if report_path:
        try:
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n',
                                   encoding='utf-8')
        except OSError as exc:
            print(f'Could not write JSON report: {exc}', file=sys.stderr)
            return 1
    label = 'PASS' if report['passed'] else 'FAIL'
    groups = report['check_groups']
    print(f'{label}: {groups["passed"]} check groups passed, {groups["failed"]} failed, {groups["skipped"]} skipped.')
    print('Counts: ' + json.dumps(report['counts'], ensure_ascii=False, sort_keys=True))
    print('JSON Schema Draft 2020-12: ' + report['json_schema_2020_12']['status'])
    print('Manifest: ' + (report['manifest'] or {}).get('status', 'not_checked'))
    for result in report['checks']:
        if result['status'] == 'failed':
            print(f'  FAIL {result["name"]}: {result["error"]}', file=sys.stderr)
        elif result['status'] == 'skipped':
            print(f'  SKIP {result["name"]}: {result["reason"]}')
    if report_path:
        print(f'Report: {report_path}')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
