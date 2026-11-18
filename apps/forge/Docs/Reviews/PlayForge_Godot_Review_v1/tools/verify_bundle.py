#!/usr/bin/env python3
"""Validate this documentation package; does not build or execute Godot."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--structural-only', action='store_true', help='Skip final MANIFEST hashes while packaging.')
    parser.add_argument('--report', type=Path, help='Optional output JSON report. Do not overwrite a signed/hashed report.')
    args = parser.parse_args()
    checks: list[dict] = []
    def check(name: str, passed: bool, detail: str = '') -> None:
        checks.append({'name': name, 'status': 'pass' if passed else 'fail', 'detail': detail})
    def load(path: str):
        return json.loads((ROOT / path).read_text(encoding='utf-8'))
    required = ['README.md','INDEX.html','PlayForge_Godot_Review_Complete.md','NOTICE.md',
                'data/product-constraints.json','data/feature-matrix.json','data/risk-register.json',
                'data/acceptance-tests.json','references/sources.json','references/Verified_Sources.md',
                'schemas/runtime-profile.schema.json','examples/runtime-profile.example.json']
    for path in required:
        check('required:'+path, (ROOT / path).is_file())
    for path in sorted(ROOT.rglob('*.json')):
        try:
            json.loads(path.read_text(encoding='utf-8'))
            check('json:'+str(path.relative_to(ROOT)), True)
        except (ValueError, OSError) as exc:
            check('json:'+str(path.relative_to(ROOT)), False, str(exc))
    if any(c['status']=='fail' for c in checks):
        report = {'status':'failed','scope':'documentation_only','checks':checks}
        print(json.dumps(report,ensure_ascii=False,indent=2)); return 1
    sources = load('references/sources.json')
    source_ids = {s['id'] for s in sources}
    check('source_ids_unique', len(source_ids)==len(sources))
    for source in sources:
        check('source_https:'+source['id'], source['url'].startswith('https://'))
        check('source_not_runtime_test:'+source['id'], source['runtime_tested'] is False)
    features_data = load('data/feature-matrix.json')
    features = features_data['features'] if isinstance(features_data,dict) else features_data
    feature_ids = {f['id'] for f in features}
    check('feature_ids_unique', len(feature_ids)==len(features))
    for feature in features:
        check('feature_source_refs:'+feature['id'],set(feature['source_ids'])<=source_ids)
        check('feature_evidence:'+feature['id'],feature['implementation_status']=='not_implemented_or_not_verified_in_this_review')
    tests_data = load('data/acceptance-tests.json')
    tests = tests_data['tests']
    check('runtime_tests_declared_not_run',tests_data['execution_status']=='not_run')
    check('test_ids_unique',len({t['id'] for t in tests})==len(tests))
    for test in tests:
        check('runtime_test_not_run:'+test['id'],test['status']=='not_run' and test['evidence_path'] is None)
        check('test_feature_refs:'+test['id'],set(test['feature_ids'])<=feature_ids)
        check('test_gate:'+test['id'],test['gate'] in {'GATE-'+str(n) for n in range(8)})
    risks = load('data/risk-register.json')['risks']
    check('risk_ids_unique',len({r['id'] for r in risks})==len(risks))
    check('all_risks_open',all(r['status']=='open' for r in risks))
    constraints = load('data/product-constraints.json')
    check('gameplay_lua54',constraints['languages']['gameplay']=='Lua 5.4')
    check('runtime_cpp20',constraints['languages']['runtime_and_backend']=='C++20')
    check('no_host_client_world',constraints['hosting']['local_client_world'] is False)
    check('no_host_loopback',constraints['hosting']['loopback_replication_for_host'] is False)
    check('no_actor_asset_streaming',constraints['streaming']['actor_asset_streaming'] is False)
    check('no_runtime_cdn',constraints['streaming']['runtime_cdn_asset_downloads'] is False)
    check('cloud_snapshot_default',constraints['storage']['cloud_snapshots'] is True and constraints['storage']['github']=='optional')
    check('free_quotas',constraints['commerce']['free']=={'workspace':'100 MB','owned_projects':3,'active_deployment':'50 MB'})
    check('pro_quotas',constraints['commerce']['pro']=={'workspace':'1 GB','owned_projects':None,'active_deployment':'100 MB'})
    check('unknown_tokens_not_zero',constraints['ai']['unknown_tokens'] is None)
    check('migration_not_completed',load('examples/migration-map.example.json')['converted_artifact'] is False)
    check('benchmarks_not_measured',load('examples/benchmark-plan.example.json')['results'] is None)
    # Check Markdown file links and explicit source anchors. External URLs are not fetched here.
    for path in sorted(ROOT.rglob('*.md')):
        text = path.read_text(encoding='utf-8')
        text_no_code = re.sub(r'```.*?```','',text,flags=re.S)
        for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',text_no_code):
            u=urlsplit(link)
            if u.scheme or u.netloc: continue
            dest=(path.parent/unquote(u.path)).resolve() if u.path else path.resolve()
            safe=dest==ROOT or ROOT in dest.parents
            check('local_link:'+str(path.relative_to(ROOT))+':'+link,safe and dest.is_file())
            if dest.is_file() and re.fullmatch(r'g\d\d',u.fragment):
                check('source_anchor:'+str(path.relative_to(ROOT))+':'+u.fragment,
                      'id="'+u.fragment+'"' in dest.read_text(encoding='utf-8'))
    all_doc_text='\n'.join(p.read_text(encoding='utf-8') for p in (ROOT/'docs').glob('*.md'))
    cited=set(re.findall(r'\[(G\d{2})\]',all_doc_text))
    check('all_citation_ids_known',cited<=source_ids)
    html=(ROOT/'INDEX.html').read_text(encoding='utf-8')
    check('html_no_external_script',re.search(r'<script[^>]+src\s*=',html,re.I) is None)
    check('html_no_external_stylesheet',re.search(r'<link[^>]+rel=["\x27]stylesheet',html,re.I) is None)
    forbidden={'.exe','.dll','.so','.dylib','.wasm','.ttf','.otf','.woff','.woff2','.pck'}
    check('no_engine_binary_sdk_or_font',not any(p.suffix.lower() in forbidden for p in ROOT.rglob('*') if p.is_file()))
    schema_status='skipped_missing_jsonschema'
    schema_cases=0
    try:
        import jsonschema
        schema=load('schemas/runtime-profile.schema.json')
        example=load('examples/runtime-profile.example.json')
        jsonschema.Draft202012Validator.check_schema(schema)
        validator=jsonschema.Draft202012Validator(schema)
        check('schema_example_valid',validator.is_valid(example)); schema_cases+=1
        mutations=[('streaming','actor_asset_streaming',True),('streaming','runtime_cdn_downloads',True),
                   ('network','listen_host_client_world',True),('network','host_loopback_replication',True),
                   ('evidence','runtime_executed',True),('languages','gameplay','GDScript'),
                   ('integration','internal_patches_allowed',True)]
        for obj,key,value in mutations:
            mutated=json.loads(json.dumps(example)); mutated[obj][key]=value
            check('schema_rejects:'+obj+'.'+key,not validator.is_valid(mutated)); schema_cases+=1
        schema_status='executed'
    except ImportError:
        checks.append({'name':'jsonschema','status':'skip','detail':'Install jsonschema to run formal schema cases.'})
    except Exception as exc:
        check('jsonschema_execution',False,str(exc))
    if not args.structural_only:
        manifest_path=ROOT/'MANIFEST.json'
        check('manifest_present',manifest_path.is_file())
        if manifest_path.is_file():
            manifest=load('MANIFEST.json')
            entries=manifest['files']
            check('manifest_unique_paths',len({e['path'] for e in entries})==len(entries))
            for entry in entries:
                path=(ROOT/entry['path']).resolve()
                safe=ROOT in path.parents and path.is_file()
                check('manifest_file:'+entry['path'],safe)
                if safe:
                    data=path.read_bytes()
                    check('sha256:'+entry['path'],hashlib.sha256(data).hexdigest()==entry['sha256'])
                    check('bytes:'+entry['path'],len(data)==entry['size_bytes'])
            actual={str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p.name!='MANIFEST.json' and '__pycache__' not in p.parts}
            check('manifest_complete',actual=={e['path'] for e in entries})
    report={'status':'passed' if not any(c['status']=='fail' for c in checks) else 'failed',
            'scope':'documentation_and_contracts_only','godot_runtime_executed':False,'benchmarks_measured':False,
            'summary':{'pass':sum(c['status']=='pass' for c in checks),'fail':sum(c['status']=='fail' for c in checks),
                       'skip':sum(c['status']=='skip' for c in checks),'documents':len(list((ROOT/'docs').glob('*.md'))),
                       'features':len(features),'risks':len(risks),'planned_runtime_tests':len(tests),
                       'planned_runtime_tests_executed':0,'sources':len(sources),'schema_cases':schema_cases,
                       'schema_status':schema_status,'manifest_checked':not args.structural_only},'checks':checks}
    if args.report:
        dest=args.report if args.report.is_absolute() else ROOT/args.report
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False,indent=2))
    for c in checks:
        if c['status']=='fail':print('FAIL:',c['name'],c['detail'],file=sys.stderr)
    return 0 if report['status']=='passed' else 1

if __name__=='__main__':
    sys.exit(main())
