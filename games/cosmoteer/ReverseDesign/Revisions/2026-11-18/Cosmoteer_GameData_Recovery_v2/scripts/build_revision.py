"""Rebuild v2 from the immutable v1 baseline and reviewed field-level proposals.

No networking and no gameplay edits. Python 3.10+, standard library only.
"""
import copy, hashlib, json, shutil
from collections import Counter
from pathlib import Path
import build_exports as exports

ROOT = Path(__file__).resolve().parents[1]
REVISION = '2026-11-18'
PROPOSALS = ['support_proposals.json', 'combat_proposals.json', 'economy_proposals.json']

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, value): exports.dump(path, value)
def counts(data):
    fs=[v for r in data['records'] for v in r['fields'].values()]
    return dict(records=len(data['records']), fields=len(fs), known=sum(f['value'] is not None for f in fs),
                null=sum(f['value'] is None for f in fs), sources=len(data['sources']),
                unique_urls=len({s['url'] for s in data['sources']}),
                record_types=dict(sorted(Counter(r['record_type'] for r in data['records']).items())))

def build():
    base=read(ROOT/'authoring/original_v1.json'); data=copy.deepcopy(base)
    data.update(schema_version='1.1.0',dataset_id='cosmoteer_public_reconstruction_v2',observed_at=REVISION,
                title='Cosmoteer 공개 문헌 복구 데이터 v2',exact_game_build=None,
                recovery_method='public_documentation_with_reviewed_v2_field_deltas',
                baseline_sha256=hashlib.sha256((ROOT/'authoring/original_v1.json').read_bytes()).hexdigest())
    data['revision_policy']='Each field keeps source/version provenance. Roadmap and prototype proposals are separate datasets. Null is never zero.'
    index={r['id']:r for r in data['records']}; sources={s['id']:s for s in data['sources']}
    changes=[]; findings=[]; touched=set(); new_ids=[]; note_changes=[]
    for name in PROPOSALS:
        proposal=read(ROOT/'authoring'/name)
        for s in proposal.get('sources',[]):
            if s['id'] in sources: assert sources[s['id']]==s, 'source ID collision: '+s['id']
            else: sources[s['id']]=s; data['sources'].append(s)
        for u in proposal.get('updates',[]):
            rid,f=u['record_id'],u['field']; assert rid in index, 'unknown record '+rid
            assert (rid,f) not in touched, 'duplicate field update '+rid+'.'+f
            touched.add((rid,f)); r=index[rid]
            before=copy.deepcopy(r['fields'].get(f))
            before_status=r['field_status'].get(f); before_sources=copy.deepcopy(r['evidence'].get(f,[]))
            status=u.get('status',u.get('field_status'))
            version=u.get('version_scope') or '; '.join(dict.fromkeys(str(sources[s].get('version') or 'document snapshot') for s in u['source_ids']))
            after={'value':u['value'],'unit':u['unit'],'raw_label':u.get('raw_label',f),
                   'version_scope':version,'reviewed_at':REVISION}
            if before and before['value']==u['value'] and before['unit']==u['unit'] and before_status==status:
                operation='evidence_update'
            elif before is None: operation='new_field'
            elif before['value'] is None and u['value'] is not None: operation='restored_null'
            elif before['value'] is not None and u['value'] is None: operation='withdrawn_overstatement'
            else: operation='correction'
            r['fields'][f]=after; r['field_status'][f]=status; r['evidence'][f]=u['source_ids']
            r['source_ids']=sorted(set(r.get('source_ids',[])+u['source_ids']))
            change={'id':f'V2-CHANGE-{len(changes)+1:03d}','record_id':rid,'field':f,'operation':operation,
                    'before':before,'before_status':before_status,'before_source_ids':before_sources,
                    'after':after,'after_status':status,'after_source_ids':u['source_ids'],'rationale':u['rationale']}
            changes.append(change)
            r.setdefault('revision_changes',[]).append(change['id'])
            if operation=='withdrawn_overstatement':
                r.setdefault('deprecated_fields',[]).append({'field':f,'reason':u['rationale'],'revision':2})
            for c in data['conflicts']:
                if c.get('record_id')==rid and (c.get('field')==f or f in c.get('fields',[])):
                    c.setdefault('revision_v2',[]).append({'field':f,'value':u['value'],'status':status,'change_id':change['id']})
        for raw in proposal.get('new_records',[]):
            r=copy.deepcopy(raw); rid=r['id']; assert rid not in index,'duplicate new record '+rid
            r.setdefault('mode','not_applicable');r.setdefault('value_origin','public_documentation')
            r.setdefault('authoring_component',name.removesuffix('_proposals.json')+'_v2')
            r.setdefault('engine_id',None);r.setdefault('game_id_reported',None);r.setdefault('game_id_authority',None)
            r.setdefault('notes',[]);r.setdefault('observations',[])
            r.setdefault('source_ids',sorted({s for v in r['evidence'].values() for s in v}))
            r.setdefault('version_scope','; '.join(dict.fromkeys(str(sources[s].get('version') or 'document snapshot') for s in r['source_ids'])))
            for f,stat in r['fields'].items():
                stat.setdefault('raw_label',f);stat.setdefault('version_scope',r['version_scope']);stat.setdefault('reviewed_at',REVISION)
            index[rid]=r;data['records'].append(r);new_ids.append(rid)
        for n in proposal.get('note_updates',[]):
            r=index[n['record_id']]
            removed=[text for text in r['notes'] if n['remove_contains'] in text]
            assert len(removed)==1,'note replacement must match once'
            r['notes']=[text for text in r['notes'] if text not in removed]+[n['replacement']]
            r.setdefault('note_history',[]).append({'revision':1,'text':removed[0],'superseded_reason':n['reason']})
            note_changes.append({'record_id':r['id'],'before':removed[0],'after':n['replacement'],'reason':n['reason']})
        findings.extend({'component':name, 'finding':f} for f in proposal.get('findings',[]))
    data['records'].sort(key=lambda r:(r['record_type'],r['category'],r['id']))
    data['sources'].sort(key=lambda s:s['id'])
    for conflict in data['conflicts']:
        r=index.get(conflict.get('record_id'));field=conflict.get('field')
        if r and isinstance(field,str) and field in r['fields']:
            conflict['current_state']={'value':r['fields'][field]['value'],'status':r['field_status'][field],
                                       'source_ids':r['evidence'][field],'revision':2}
        conflict['historical_case']=True
    data['unresolved_baseline']=data.pop('unresolved',[])
    data['unresolved']=[{'record_id':r['id'],'field':f,'status':r['field_status'][f],
                         'deprecated':any(x['field']==f for x in r.get('deprecated_fields',[]))}
                        for r in data['records'] for f,v in r['fields'].items() if v['value'] is None]
    delta={'revision':2,'observed_at':REVISION,'baseline':counts(base),'current':counts(data),
           'operations':dict(Counter(c['operation'] for c in changes)),'new_record_ids':new_ids,
           'new_record_fields':sum(len(index[rid]['fields']) for rid in new_ids),
           'changes':changes,'note_changes':note_changes,'research_findings':findings}
    write(ROOT/'data/cosmoteer_original.json',data);write(ROOT/'data/sources.json',data['sources'])
    write(ROOT/'data/conflicts.json',data['conflicts']);write(ROOT/'data/revision_v2.json',delta)
    proto=read(ROOT/'data/starforge_v4.json')
    for p in (ROOT/'tables').glob('*.md'):p.unlink()
    exports.export_csv(data,proto);exports.export_markdown(data,proto);exports.export_sqlite(data);exports.export_viewer(data,proto)
    # Historical v3 export is retained as a separate immutable reference.
    rows=[]
    for r in read(ROOT/'data/starforge_v3.json')['rows']:
        for k,v in r['fields'].items():rows.append(dict(record_id=r['id'],category=r['category'],field=k,value=v,value_json=json.dumps(v,ensure_ascii=False),source_file=r['source_file'],source_lines=r['source_lines'],value_origin=r['value_origin']))
    exports.write_csv(ROOT/'csv/starforge_v3_observations.csv',rows,['record_id','category','field','value','value_json','source_file','source_lines','value_origin'])
    print(json.dumps({k:delta[k] for k in ['baseline','current','operations','new_record_fields']},ensure_ascii=False))
    return data,delta

if __name__=='__main__':build()
