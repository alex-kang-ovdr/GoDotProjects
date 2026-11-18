"""Standard-library release checks. Does not claim original-client verification.
Optional --source-master compares the selected rows against an accessible R3 master.
"""
from pathlib import Path
import argparse, hashlib, json, math, re, subprocess, sys
R = Path(__file__).resolve().parents[1]
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads((R / p).read_text(encoding='utf-8'))
checks = []
def check(name, value):
    checks.append({'name': name, 'passed': bool(value)})
    if not value: print('FAIL:', name)
def run(source_master=None):
    ref, bal, provenance = map(read, ['data/reference_subset.json','data/runtime_balance.json','data/BUILD_PROVENANCE.json'])
    tables = ref['tables']
    expected = {'passives':12,'passive_levels':60,'skills':31,'evolution_recipes':15,'tech_effects':3,'sources':34}
    for table, count in expected.items():
        rows = tables[table]
        check(f'{table} count and unique IDs',len(rows)==count and len({x['id'] for x in rows})==count)
    sources = {x['id'] for x in tables['sources']}
    skills = {x['id'] for x in tables['skills']}
    passives = {x['id'] for x in tables['passives']}
    check('Source references resolve',all(set(x.get('source_ids',[]))<=sources for k,rows in tables.items() for x in rows))
    check('No selected row claims direct-client verification',all(x.get('client_verified') is not True for rows in tables.values() for x in rows))
    check('Source subset checksum',digest(R/'data/reference_subset.json')==provenance['reference_subset_sha256'])
    check('Local passive ID map resolves',len(ref['maps']['passives'])==12 and set(ref['maps']['passives'].values())==passives)
    check('Local weapon ID map resolves',len(ref['maps']['weapons'])==17 and set(ref['maps']['weapons'].values())<=skills)
    check('Passive level sets 1 through 5',all(sorted(x['level'] for x in tables['passive_levels'] if x['passive_id']==p)==[1,2,3,4,5] for p in passives))
    check('Passive reference values finite',all(isinstance(x['total_value'],(int,float)) and math.isfinite(x['total_value']) for x in tables['passive_levels']))
    check('Evolution skill references resolve',all(x['base_skill_id'] in skills and x['result_skill_id'] in skills and (x.get('secondary_skill_id') is None or x['secondary_skill_id'] in skills) for x in tables['evolution_recipes']))
    check('Evolution passive references resolve',all(x.get('required_passive_id') is None or x['required_passive_id'] in passives for x in tables['evolution_recipes']))
    check('Design balance explicitly not original-client values',bal['evidence_status']=='DESIGN' and bal['client_verified'] is False)
    check('Five supported main weapons',bal['mainWeapons']==['kunai','bat','katana','shotgun','revolver'])
    check('Positive five-level runtime weapon damage arrays',all(len(x['damage'])==5 and all(isinstance(y,(int,float)) and y>0 for y in x['damage']) and x['cooldown']>0 for x in bal['weapons'].values()))
    check('All previous custom files byte-for-byte preserved',all((R/'custom'/name).is_file() and digest(R/'custom'/name)==sha for name,sha in provenance['custom_files_sha256'].items()))
    before=digest(R/'index.html')
    subprocess.run([sys.executable,str(R/'build.py')],check=True,cwd=R)
    check('Rebuild reproduces current HTML',before==digest(R/'index.html'))
    html=(R/'index.html').read_text(encoding='utf-8')
    check('No unresolved build placeholders','/*__' not in html)
    check('No external script or stylesheet resource requests',not re.search(r'<script\b[^>]*\bsrc=|<link\b[^>]*\brel=[\"\']stylesheet',html,re.I))
    report=read('tests/report.json')
    check('Browser report matches exact build',report['build_sha256']==digest(R/'index.html'))
    check('Browser feature checks all passed',report['passed']==report['total']==237 and not report['failed'] and not report['page_errors'])
    bots=read('tests/balance_probe.json')
    check('Six bot probes recorded, no JS errors',len(bots['runs'])==6 and not bots['errors'])
    samples=[s for b in bots['runs'] for s in b['samples']]
    check('All sampled checkpoints valid',len(samples)==73 and all(s['checkpointError'] is None for s in samples))
    check('File-origin policy block documented honestly',read('tests/file_origin_probe.json')['passed'] is False)
    for p in ['README.md','docs/IMPLEMENTATION_SCOPE.md','docs/SAVE_AND_MIGRATION.md','docs/ARCHITECTURE.md','docs/TEST_REPORT.md','previews/natural_combat.png']:
        check('Included: '+p,(R/p).is_file())
    if source_master:
        master_path=Path(source_master)
        master=json.loads(master_path.read_text(encoding='utf-8'))['tables']
        check('Original R3 master hash matches pinned source',digest(master_path)==ref['metadata']['source_master_sha256'])
        check('Selected rows exactly equal original R3',all({x['id']:x for x in master[k]}.get(row['id'])==row for k,rows in tables.items() for row in rows))
    result={'suite':'v14 package and reference provenance','passed':sum(x['passed'] for x in checks),'total':len(checks),'checks':checks,'source_master_compared':bool(source_master),'build_sha256':digest(R/'index.html'),'scope':'Checks build, selected data, source preservation and test consistency; does not verify original game behavior.'}
    (R/'tests/integrity_report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False,indent=2))
    return 0 if result['passed']==result['total'] else 1
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-master');args=p.parse_args()
    raise SystemExit(run(args.source_master))
