// Dependency-free structural/provenance verifier for the current implementation audit.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(process.argv[2]||'/workspace/sites/breath-colony-30b984');
const out=resolve(process.argv[3]||dirname(fileURLToPath(import.meta.url)));
const read=name=>readFile(join(out,name),'utf8').then(JSON.parse);
const manifest=await read('source_manifest.json');
const errors=[],warnings=[],ids=new Set();
const sourceMap=new Map(manifest.sources.map(s=>[s.id,s]));
for(const s of manifest.sources){
  const bytes=await readFile(join(project,s.file));
  if(createHash('sha256').update(bytes).digest('hex')!==s.sha256)errors.push(`Changed source hash: ${s.file}`);
}
const names=['current_rules','current_buildings','current_materials','current_objectives'];
const counts={};
for(const name of names){
  const d=await read(name+'.json');
  if(d.schema_version!=='1.0'||d.dataset!==name||d.scope!=='breath-colony-4.0.0-current-implementation'||d.source_commit!==manifest.source_commit)errors.push(`Invalid envelope: ${name}`);
  if(d.source_tree_dirty)warnings.push(`Extracted from dirty source: ${name}`);
  if(!Array.isArray(d.records))throw new Error(`Missing records: ${name}`);
  counts[name]=d.records.length;
  for(const r of d.records){
    if(!r.id||ids.has(r.id))errors.push(`Missing/duplicate id: ${r.id}`);ids.add(r.id);
    if(r.evidence_status!=='observed_code')errors.push(`Wrong evidence class: ${r.id}`);
    if(name==='current_rules'&&(!r.unit||!r.system||!r.entity||!r.field||!Object.hasOwn(r,'value')||!r.meaning_ko))errors.push(`Missing rule fields: ${r.id}`);
    if(!r.provenance?.length)errors.push(`Missing provenance: ${r.id}`);
    for(const p of r.provenance||[]){
      const s=sourceMap.get(p.source_id);
      if(!s||s.file!==p.file||s.sha256!==p.sha256||p.line_start<1||p.line_end<p.line_start||p.line_end>s.line_count)errors.push(`Invalid provenance: ${r.id}`);
    }
  }
}
const backlog=await read('upgrade_backlog.json');
const backlogIds=new Set(backlog.records.map(r=>r.id));
for(const item of backlog.records){
  if(!['P0','P1','P2'].includes(item.priority)||item.status!=='proposed_not_implemented')errors.push(`Invalid proposal state: ${item.id}`);
  for(const rid of item.evidence_rule_ids)if(!ids.has(rid))errors.push(`Unknown audit rule ${rid} in ${item.id}`);
  for(const dep of item.dependencies)if(!backlogIds.has(dep))errors.push(`Unknown dependency ${dep} in ${item.id}`);
  if(!item.acceptance_criteria?.length)errors.push(`Missing acceptance criteria: ${item.id}`);
}
const probes=await read('audit_probe_results.json');
if(!probes.same_tick_replay.exactStateEqual||!probes.save_resume.exactStateEqual)errors.push('Same-tick replay or save/resume probe did not match the reported baseline.');
if(probes.caller_partitioning.exactStateEqual)warnings.push('Caller partitioning no longer shows the documented difference; review source/audit.');
const report={schema_version:'1.0',source_commit:manifest.source_commit,counts,total_current_data_rows:Object.values(counts).reduce((s,n)=>s+n,0),source_files:manifest.sources.length,backlog_items:backlog.records.length,errors,warnings,passed:errors.length===0,scope:'Structure, source hashes, code line references, unique IDs, backlog reference integrity, diagnostic summary. This does not verify ONI original values or constitute a full runtime test suite.'};
await writeFile(join(out,'audit_validation_report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
