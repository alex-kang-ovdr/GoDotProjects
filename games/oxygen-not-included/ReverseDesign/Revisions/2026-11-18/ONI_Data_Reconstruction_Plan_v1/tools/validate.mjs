#!/usr/bin/env node
/**
 * Offline validation of this research pack. Node built-ins only.
 * Usage: node tools/validate.mjs [pack-directory]
 * Writes reports/validation.json and exits nonzero for data/link errors.
 * This does not fetch sources, execute a game, or run the existing 71 runtime tests.
 */
import {readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, dirname, relative, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const reportPath = resolve(root, 'reports/validation.json');
const errors = [], warnings = [], policies = new Map(), parsed = new Map();
const metrics = {json_files: 0, numeric_values: 0, markdown_files: 0, relative_links: 0,
  citation_links: 0, csv_files: 0, csv_rows: 0, raw_facts: 0, raw_source_url_links: 0,
  normalized_source_url_links: 0, plant_ranges: 0, room_ranges: 0,
  audit_rows: 0, audit_provenance_links: 0, audit_diagnostic_results: 0,
  implementation_backlog_items: 0, implementation_backlog_edges: 0};
const limitations = [
  '출처 문장의 진실성·현재 게임 빌드와의 일치 여부는 오프라인 구조 검사로 확인하지 않는다.',
  'null은 복원 완료가 아니다. unresolved와 not_applicable을 분리하여 집계한다.',
  '조건부 레시피는 수지 통과 17개와 별도로 남긴다. 원작의 의도적 소멸을 물리 보존으로 바꾸지 않는다.',
  'audit 6개는 저장된 진단의 구조·산술을 검사한다. 이 도구가 게임을 재실행한 결과가 아니다.',
  '기존 런타임 71개 테스트를 이번 검증기에서 실행하지 않았다.',
  '감사 원본 코드의 SHA-256은 매니페스트와 데이터 행 사이의 일치만 검사한다. 외부 프로젝트 파일을 다시 읽지 않는다.',
  'Markdown 인라인/참조 링크의 파일 존재와 인용 ID–URL을 검사한다. 원격 URL 접속 및 Markdown 앵커의 렌더러별 해석은 검사하지 않는다.',
];
function policy(id, description) {
  if (!policies.has(id)) policies.set(id, {id, description, assertions: 0, passed: 0, failed: 0, warnings: 0});
}
function check(id, condition, path, message, details) {
  const p = policies.get(id);
  if (!p) throw new Error(`Undeclared validation policy: ${id}`);
  p.assertions++;
  if (condition) p.passed++;
  else {p.failed++; errors.push({policy: id, path, message, ...(details === undefined ? {} : {details})});}
  return Boolean(condition);
}
function warn(id, path, message, details) {
  const p = policies.get(id); if (p) p.warnings++;
  warnings.push({policy: id, path, message, ...(details === undefined ? {} : {details})});
}
function nonempty(x) { return typeof x === 'string' && x.trim().length > 0; }
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function close(a, b, tolerance = 1e-8) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance; }
function canonUrl(input) {
  try {const u = new URL(input); if (!['https:', 'http:'].includes(u.protocol)) return null;
    u.hash = ''; u.pathname = u.pathname.replace(/\/+$/, '') || '/'; return u.toString();
  } catch { return null; }
}
function listFiles(dir, prefix = '') {
  return readdirSync(dir, {withFileTypes: true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(d => {
    if (d.isSymbolicLink()) return [];
    const name = prefix ? `${prefix}/${d.name}` : d.name;
    return d.isDirectory() ? listFiles(resolve(dir, d.name), name) : [name];
  });
}
function get(name) { return parsed.get(name); }
function records(name) { return get(name)?.records || []; }
function unique(id, rows, key, path) {
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i]?.[key];
    check(id, nonempty(v) && !seen.has(v), `${path}[${i}].${key}`, 'ID must be a nonempty unique string', v);
    seen.add(v);
  }
}
function* fields(value, path = '') {
  if (object(value)) {
    if (Object.hasOwn(value, 'value') && Object.hasOwn(value, 'unit')) yield [path.replace(/^fields\./, ''), value];
    else for (const [k,v] of Object.entries(value)) yield* fields(v, path ? `${path}.${k}` : k);
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* fields(value[i], `${path}[${i}]`);
  }
}
function canonicalStatus(raw, value) {
  if (value === null) return ['not_applicable', 'not_a_fixed_value'].includes(raw) ? 'not_applicable' : 'unresolved';
  if (raw.includes('derived')) return 'derived';
  if (raw.includes('official')) return 'official_patch';
  if (raw.includes('rounded')) return 'community_display_rounded';
  if (raw.includes('uncertain') || raw.includes('conflict')) return 'community_reference_uncertain';
  if (raw.includes('legacy')) return 'legacy_reference';
  if (['unverified','not_verified','unresolved'].includes(raw)) return 'unresolved';
  return 'community_reference';
}
function countBy(rows, key) {
  return rows.reduce((o,r) => {const k = r[key]; o[k] = (o[k] || 0) + 1; return o;}, {});
}
function csvRead(name) {
  const file = resolve(root, name);
  if (!check('csv_parity', existsSync(file), name, 'CSV file is missing')) return [];
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i+1] === '"') {value += '"'; i++;}
      else if (quoted || value.length === 0) quoted = !quoted;
      else value += c;
    } else if (c === ',' && !quoted) {row.push(value); value = '';}
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += c;
  }
  if (row.length || value.length) {row.push(value); rows.push(row);}
  check('csv_parity', !quoted, name, 'Unterminated quoted CSV field');
  const header = rows.shift() || [];
  check('csv_parity', header.length > 0 && new Set(header).size === header.length, name, 'CSV headers are empty or duplicated');
  metrics.csv_files++; metrics.csv_rows += rows.length;
  const result=rows.map((cells,i) => {
    check('csv_parity', cells.length === header.length, `${name}:${i+2}`, 'CSV column count mismatch');
    return Object.fromEntries(header.map((k,j)=>[k,cells[j]]));
  });
  Object.defineProperty(result,'columns',{value:header});
  return result;
}
function jsonCell(value, path) {
  try {return JSON.parse(value);} catch {check('csv_parity', false, path, 'CSV JSON cell is not valid JSON'); return undefined;}
}
function textCell(value) {return value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value);}
function dag(items, id, path, metricsPrefix) {
  unique(id, items, 'id', path);
  const ids = new Set(items.map(x=>x.id)), byId = new Map(items.map(x=>[x.id,x]));
  let edges = 0;
  for (const item of items) {
    const deps = item.dependencies;
    check(id, Array.isArray(deps), `${path}.${item.id}.dependencies`, 'Dependencies must be an array');
    if (!Array.isArray(deps)) continue;
    check(id, new Set(deps).size === deps.length, `${path}.${item.id}`, 'Duplicate dependency');
    for (const dep of deps) {edges++; check(id, ids.has(dep) && dep !== item.id, `${path}.${item.id}`, 'Dependency is unknown or self-referential', dep);}
    check(id, Array.isArray(item.acceptance_criteria) && item.acceptance_criteria.length > 0 && item.acceptance_criteria.every(x=>nonempty(x) || (object(x) && Object.values(x).some(nonempty))),
      `${path}.${item.id}.acceptance_criteria`, 'Explicit acceptance criteria are required');
  }
  const active = new Set(), done = new Set(), order = [], cycles = [];
  function visit(key, trail) {
    if (done.has(key) || !byId.has(key)) return;
    if (active.has(key)) {cycles.push([...trail,key]); return;}
    active.add(key);
    for (const dep of byId.get(key).dependencies || []) visit(dep,[...trail,key]);
    active.delete(key); done.add(key); order.push(key);
  }
  for (const key of ids) visit(key,[]);
  check(id, cycles.length === 0, path, 'Dependency graph contains a cycle', cycles);
  if (metricsPrefix) {metrics[`${metricsPrefix}_items`] = items.length; metrics[`${metricsPrefix}_edges`] = edges;}
  return {items:items.length, edges, is_dag:cycles.length === 0, topological_order:order};
}

policy('json_syntax', 'All packaged JSON parses; validation output is excluded from its own input set.');
policy('finite_numbers', 'All numeric leaves in packaged JSON are finite, including values nested in maps and arrays.');
policy('source_registry', 'Unique source IDs; HTTP(S) URLs; dates, provenance classification and unpinned-build metadata.');
policy('source_registry_parity', 'Merged source ID–URL and raw registry membership match all three specialist registries.');
policy('raw_record_ids', 'Raw entity IDs are unique within each source dataset.');
policy('fact_contract', 'Required keys and types, allowed evidence states, unique fact/entity IDs, and entity membership.');
policy('fact_provenance', 'Sources join by ID and URL; scope/date are explicit; unpinned facts are not runtime approved.');
policy('null_contract', 'Nulls retain an unresolved or not-applicable state, an explanation and runtime_approved=false.');
policy('raw_fact_parity', 'Every raw value/unit object maps exactly to one normalized fact, preserving value and provenance.');
policy('units', 'Declared units use supported types and ranges; signed W and temperature values remain allowed.');
policy('csv_parity', 'CSV parsing and row/field equality against corresponding JSON, including null versus zero.');
policy('reaction_balance', 'Continuous and batch units; building relations; explicit sinks; conditional cases never counted as balanced passes.');
policy('plant_room_ranges', 'Known plant temperature and room cell bounds are ordered; unknown limits stay unresolved.');
policy('audit_snapshot', '220 current-web audit rows, provenance joins and persisted validation envelope.');
policy('audit_diagnostics', 'Six saved diagnostic results have consistent booleans, hashes and edge-case arithmetic; no runtime execution.');
policy('audit_backlog', 'Audit proposal IDs, dependency DAG, evidence row references and acceptance criteria.');
policy('implementation_backlog', 'Implementation proposals have unique IDs, resolvable dependency DAG and acceptance criteria.');
policy('derived_arithmetic', 'Recompute the 13 stored balance-math cases from packaged data; this is arithmetic, not gameplay testing.');
policy('coverage_totals', 'Coverage report totals equal recomputed dataset, evidence-status and audit counts.');
policy('markdown_links', 'Relative Markdown targets exist inside this pack; remote links are not fetched.');
policy('markdown_citations', 'Inline/reference C/R/F source labels and source-register table rows point to the registered URL.');

// Both reports are generated outputs. Including either creates self/cross-hash recursion.
const fileNames = listFiles(root).filter(n => !['reports/validation.json','reports/manifest.json'].includes(n));
for (const name of fileNames.filter(n=>extname(n)==='.json')) {
  try {const d = JSON.parse(readFileSync(resolve(root,name),'utf8').replace(/^\uFEFF/,'')); parsed.set(name,d); metrics.json_files++; check('json_syntax',true,name,'JSON parsed');}
  catch(e) {check('json_syntax',false,name,'JSON parse failed',e.message);}
}
function finiteWalk(v,path) {
  if (typeof v === 'number') {metrics.numeric_values++; check('finite_numbers',Number.isFinite(v),path,'Non-finite number');}
  else if (Array.isArray(v)) v.forEach((x,i)=>finiteWalk(x,`${path}[${i}]`));
  else if (object(v)) for (const [k,x] of Object.entries(v)) finiteWalk(x,`${path}.${k}`);
}
for (const [name,d] of parsed) finiteWalk(d,name);

const sources = get('data/sources.json')?.sources || [];
const sourceMap = new Map(sources.map(s=>[s.id,s]));
check('source_registry', sources.length > 0, 'data/sources.json', 'Source registry is empty or unavailable');
unique('source_registry', sources, 'id', 'data/sources.json.sources');
for (const s of sources) {
  check('source_registry', /^[RFC]\d+$/.test(s.id), s.id, 'Invalid original-reference source ID');
  check('source_registry', Boolean(canonUrl(s.url)), s.id, 'Invalid HTTP(S) source URL',s.url);
  check('source_registry', nonempty(s.title) && nonempty(s.evidence_kind) && nonempty(s.raw_registry), s.id, 'Source title/class/registry are required');
  check('source_registry', /^\d{4}-\d{2}-\d{2}$/.test(s.retrieved_at), s.id, 'Source retrieval date must be YYYY-MM-DD');
  check('source_registry', s.source_game_build === null || nonempty(s.source_game_build), s.id, 'Build must be explicit null or nonempty string');
}
let rawSourceCount = 0;
for (const name of ['root-sources.json','sources-facilities.json','colony-sources.json']) {
  const d = get(`data/${name}`), rows = Array.isArray(d) ? d : d?.sources || [];
  rawSourceCount += rows.length;
  for (const s of rows) {
    const id = s.id || s.source_id, url = s.url || s.source_url, merged = sourceMap.get(id);
    check('source_registry_parity', Boolean(merged), `${name}.${id}`, 'Raw source missing from merged registry');
    if (merged) {
      check('source_registry_parity', canonUrl(url) === canonUrl(merged.url), `${name}.${id}`, 'Merged source URL differs from raw registry');
      check('source_registry_parity', merged.raw_registry === name, `${name}.${id}`, 'Incorrect raw source registry');
    }
  }
}
check('source_registry_parity', rawSourceCount === sources.length, 'data/sources.json', 'Merged source count differs from raw registries');

const catalog = get('data/reference-facts.json') || {};
const facts = catalog.facts || [], entities = catalog.entities || [];
const factMap = new Map(facts.map(f=>[f.fact_id,f])), entityMap = new Map(entities.map(e=>[e.id,e]));
const schema = get('data/reference-facts.schema.json');
check('fact_contract', Boolean(schema?.$defs?.fact), 'data/reference-facts.schema.json', 'Reference fact schema is unavailable');
check('fact_contract', catalog.schema_version === schema?.properties?.schema_version?.const, 'data/reference-facts.json.schema_version', 'Schema version mismatch');
for (const k of schema?.required || []) check('fact_contract', Object.hasOwn(catalog,k), `reference-facts.${k}`, 'Missing top-level key');
const required = schema?.$defs?.fact?.required || [];
const allowedStatuses = schema?.$defs?.fact?.properties?.evidence_status?.enum || [];
unique('fact_contract', facts,'fact_id','reference-facts.facts');
unique('fact_contract', entities,'id','reference-facts.entities');
for (const e of entities) {
  check('fact_contract', ['id','domain','label','raw_file','raw_id'].every(k=>nonempty(e[k])),e.id,'Entity requires nonempty string fields');
}
const stringFields = ['fact_id','entity_id','domain','field','unit','evidence_status','raw_evidence_status','scope','observed_at','raw_file','raw_path'];
for (const f of facts) {
  const p = f.fact_id;
  check('fact_contract', required.every(k=>Object.hasOwn(f,k)),p,'Required fact keys missing',required.filter(k=>!Object.hasOwn(f,k)));
  check('fact_contract', Object.keys(f).every(k=>required.includes(k)),p,'Unexpected fact keys');
  check('fact_contract', stringFields.every(k=>nonempty(f[k])) && typeof f.notes === 'string',p,'Fact string type or empty metadata error');
  check('fact_contract', allowedStatuses.includes(f.evidence_status),p,'Unknown normalized evidence status',f.evidence_status);
  check('fact_contract', entityMap.has(f.entity_id),p,'Unknown entity reference');
  check('fact_contract', f.fact_id === `${f.entity_id}.${f.field}` && f.raw_path === f.field,p,'Fact ID/path does not match entity and field');
  if (entityMap.has(f.entity_id)) check('fact_contract', f.domain === entityMap.get(f.entity_id).domain && f.raw_file === entityMap.get(f.entity_id).raw_file,p,'Fact domain/raw file differs from entity');
  check('fact_provenance', Array.isArray(f.source_ids) && Array.isArray(f.source_urls) && f.source_ids.length === f.source_urls.length,p,'Source ID and URL arrays must have equal lengths');
  const ids = Array.isArray(f.source_ids) ? f.source_ids : [], urls = Array.isArray(f.source_urls) ? f.source_urls : [];
  check('fact_provenance', new Set(ids).size === ids.length,p,'Duplicate source ID');
  for (let i=0;i<ids.length;i++) {
    metrics.normalized_source_url_links++;
    const s = sourceMap.get(ids[i]);
    check('fact_provenance', Boolean(s) && canonUrl(s.url) !== null && canonUrl(s.url) === canonUrl(urls[i]),p,'Source ID–URL mismatch',{source_id:ids[i],url:urls[i]});
  }
  check('fact_provenance', ['unresolved','not_applicable'].includes(f.evidence_status) || ids.length > 0,p,'Known/derived reference fact requires a source');
  check('fact_provenance', /^\d{4}-\d{2}-\d{2}$/.test(f.observed_at) && nonempty(f.scope),p,'Explicit observation date and scope required');
  check('fact_provenance', f.source_game_build === null,p,'This unpinned reconstruction pack must not claim a validated executable build');
  check('fact_provenance', f.runtime_approved === false,p,'This reference pack has no runtime-approved facts');
  if (f.value === null) {
    check('null_contract', ['unresolved','not_applicable'].includes(f.evidence_status),p,'Null has been promoted to a verified status');
    check('null_contract', nonempty(f.notes),p,'Null must retain a concrete unresolved/not-applicable reason');
    check('null_contract', f.runtime_approved === false,p,'Null cannot be runtime approved');
  }
}

const rawSpecs = [['elements.json','','element'],['transport-and-world.json','','transport'],['facilities.json','building.','building'],['reactions.json','reaction.','reaction'],['colony-records.json','','colony']];
const rawFactIds = new Set(), rawEntityIds = new Set(), recordCounts = {};
for (const [name,prefix,defaultDomain] of rawSpecs) {
  const rows = records(`data/${name}`); recordCounts[name] = rows.length;
  check('raw_record_ids',rows.length > 0,name,'Raw dataset is missing or empty');
  unique('raw_record_ids',rows,'id',name);
  for (const r of rows) {
    const eid = prefix+r.id; rawEntityIds.add(eid);
    const entity = entityMap.get(eid);
    check('raw_fact_parity', Boolean(entity) && entity.raw_id === r.id && entity.raw_file === name && entity.domain === (r.domain || defaultDomain),eid,'Raw entity is missing or incorrectly normalized');
    for (const [path,v] of fields(r)) {
      metrics.raw_facts++;
      const id = `${eid}.${path}`, f = factMap.get(id); rawFactIds.add(id);
      if (!check('raw_fact_parity',Boolean(f),id,'Raw field missing from normalized facts')) continue;
      const ids = v.source_ids?.length ? v.source_ids : v.source_id ? [v.source_id] : [];
      const rawStatus = v.evidence_status || 'unresolved';
      const notes = v.notes ?? v.note_ko ?? '';
      check('raw_fact_parity',isDeepStrictEqual(v.value,f.value) && v.unit === f.unit,id,'Raw and normalized values/units differ');
      check('raw_fact_parity',isDeepStrictEqual(ids,f.source_ids) && f.raw_evidence_status === rawStatus && f.evidence_status === canonicalStatus(rawStatus,v.value),id,'Raw provenance/status has been altered');
      check('raw_fact_parity',f.notes === notes && f.scope === (v.scope || r.scope || 'build_unpinned'),id,'Raw notes/scope have been altered');
      const urls = Array.isArray(v.source_urls) ? v.source_urls : v.source_url ? [v.source_url] : null;
      if (urls) {
        check('raw_fact_parity',urls.length === ids.length,id,'Raw source arrays have unequal lengths');
        ids.forEach((sid,i)=>{metrics.raw_source_url_links++; check('raw_fact_parity',Boolean(sourceMap.get(sid)) && canonUrl(urls[i]) === canonUrl(sourceMap.get(sid)?.url),id,'Raw field source ID–URL mismatch',{sid,url:urls[i]});});
      }
    }
  }
}
check('raw_fact_parity',rawFactIds.size === facts.length && facts.every(f=>rawFactIds.has(f.fact_id)),'reference-facts','Normalized/raw field coverage is not one-to-one');
check('raw_fact_parity',rawEntityIds.size === entities.length && entities.every(e=>rawEntityIds.has(e.id)),'reference-facts.entities','Normalized/raw entity coverage is not one-to-one');

const numberUnits = new Set(['DTU/(g*degC)','DTU/(m*s*degC)','degC','°C','kg','kg/s','element/cell','s','W','kDTU/s','kg/cell','ratio','J','J/cycle','kg/batch','DTU/batch','block/cycle','s/block','kcal/cycle','percent','XP','percent/cycle','morale/skill','kcal/food_unit','quality','cycle','kg/food_unit','lux','seed','unit','cell','percentage_points/cycle','decor','kg/use','fraction','s/point','research_point','food_unit','kcal/batch']);
const textUnits = new Set(['enum','element_id','id','event','name','food_id']);
const listUnits = new Set(['element_id[]','predicate[]','tag[]','tech_id[]']);
const mapUnits = new Set(['kg/cycle','kg/point','point_by_research_type','food_unit_unless_key_kg']);
const signedUnits = new Set(['degC','°C','W','quality','decor','percentage_points/cycle','percent/cycle']);
function numericMap(v) {return object(v) && Object.values(v).every(x=>typeof x==='number' && Number.isFinite(x));}
for (const f of facts) {
  const {unit:u,value:v,fact_id:id} = f;
  check('units',numberUnits.has(u) || textUnits.has(u) || listUnits.has(u) || mapUnits.has(u) || ['tiles','morale','boolean'].includes(u),id,'Unrecognized declared unit',u);
  if (v === null) continue;
  if (numberUnits.has(u)) {
    check('units',typeof v === 'number' && Number.isFinite(v),id,'Numeric unit requires a finite numeric value');
    if (!signedUnits.has(u)) check('units',typeof v === 'number' && v >= 0,id,'Negative magnitude for a nonnegative unit');
    // A ratio can be a multiplier greater than one; only fractions have an upper bound of one.
    if (u === 'fraction') check('units',v >= 0 && v <= 1,id,'Fraction outside 0–1');
    if (u === 'percent') check('units',v >= 0 && v <= 100,id,'Percent outside 0–100');
  } else if (textUnits.has(u)) check('units',nonempty(v),id,'Text/enum unit requires a nonempty string');
  else if (listUnits.has(u)) check('units',Array.isArray(v) && v.every(nonempty),id,'List unit requires an array of strings');
  else if (mapUnits.has(u)) check('units',(typeof v === 'number' && Number.isFinite(v) && v >= 0) || (numericMap(v) && Object.values(v).every(n=>n>=0)),id,'Quantity map must contain nonnegative numeric amounts');
  else if (u === 'tiles') check('units',Array.isArray(v) && v.length === 2 && v.every(n=>Number.isInteger(n) && n>0),id,'Footprint must contain two positive integer dimensions');
  else if (u === 'boolean') check('units',typeof v==='boolean',id,'Boolean unit requires boolean data');
  else if (u === 'morale') check('units',(typeof v==='number' && Number.isFinite(v)) || numericMap(v),id,'Morale requires a signed number or quality mapping');
}

const csvFacts = csvRead('data/reference-facts.csv');
check('csv_parity',isDeepStrictEqual(csvFacts.columns,['fact_id','entity_id','domain','field','value','unit','evidence_status','raw_evidence_status','source_ids','source_urls','scope','observed_at','source_game_build','runtime_approved','notes']),'data/reference-facts.csv','Reference CSV columns differ from the export contract');
check('csv_parity',csvFacts.length === facts.length,'data/reference-facts.csv','CSV fact count differs from JSON');
unique('csv_parity',csvFacts,'fact_id','data/reference-facts.csv');
for (const row of csvFacts) {
  const f=factMap.get(row.fact_id);
  if (!check('csv_parity',Boolean(f),row.fact_id,'CSV references an unknown fact')) continue;
  for (const k of Object.keys(row)) {
    if (['value','source_ids','source_urls'].includes(k)) check('csv_parity',isDeepStrictEqual(jsonCell(row[k],`${row.fact_id}.${k}`),f[k]),`${row.fact_id}.${k}`,'CSV JSON value differs');
    else check('csv_parity',row[k]===textCell(f[k]),`${row.fact_id}.${k}`,'CSV scalar differs from JSON');
  }
}
const colony = records('data/colony-records.json');
const colonyFieldMap = new Map(colony.flatMap(r=>Object.entries(r.fields).map(([k,v])=>[`${r.id}.${k}`,{r,k,v}])));
const csvColony = csvRead('data/colony-fields.csv');
check('csv_parity',isDeepStrictEqual(csvColony.columns,['record_id','domain','field','value_json','unit','evidence_status','scope','source_ids','source_urls','notes']),'data/colony-fields.csv','Colony CSV columns differ from the export contract');
check('csv_parity',csvColony.length===colonyFieldMap.size,'data/colony-fields.csv','CSV colony field count differs');
const colonyCsvIds = new Set();
for (const row of csvColony) {
  const id=`${row.record_id}.${row.field}`, entry=colonyFieldMap.get(id);
  check('csv_parity',!colonyCsvIds.has(id),id,'Duplicate colony CSV field'); colonyCsvIds.add(id);
  if (!check('csv_parity',Boolean(entry),id,'Unknown colony CSV field')) continue;
  const {r,v}=entry;
  check('csv_parity',isDeepStrictEqual(jsonCell(row.value_json,id),v.value),id,'Colony CSV value differs');
  const expected={domain:r.domain,unit:v.unit,evidence_status:v.evidence_status,scope:v.scope,source_ids:v.source_ids.join('|'),source_urls:v.source_urls.join('|'),notes:v.notes||''};
  check('csv_parity',Object.entries(expected).every(([k,v])=>row[k]===v),id,'Colony CSV metadata/provenance differs');
}
const facilities = records('data/facilities.json'), buildingMap = new Map(facilities.map(r=>[r.id,r]));
const csvFacilities = csvRead('data/facilities.csv');
check('csv_parity',isDeepStrictEqual(csvFacilities.columns,['id','name_en','name_ko','width_tiles','height_tiles','electricity_w_positive_consumes','base_heat_kdtu_s','base_overheat_c','source_id','source_url','evidence_status','build']),'data/facilities.csv','Facility CSV columns differ from the export contract');
check('csv_parity',csvFacilities.length===facilities.length,'data/facilities.csv','CSV facility count differs');
unique('csv_parity',csvFacilities,'id','data/facilities.csv');
for (const row of csvFacilities) {
  const r=buildingMap.get(row.id); if (!check('csv_parity',Boolean(r),row.id,'Unknown facility CSV row')) continue;
  const f=r.fields, expected={name_en:r.name_en,name_ko:r.name_ko,width_tiles:f.dimensions_tiles.value[0],height_tiles:f.dimensions_tiles.value[1],electricity_w_positive_consumes:f.electricity_w.value,base_heat_kdtu_s:f.base_heat_kdtu_s.value,base_overheat_c:f.base_overheat_temperature_c.value,source_id:f.dimensions_tiles.source_id,source_url:f.dimensions_tiles.source_url,evidence_status:f.dimensions_tiles.evidence_status,build:r.game_build};
  for (const [k,v] of Object.entries(expected)) check('csv_parity',typeof v==='number' ? row[k]!=='' && close(Number(row[k]),v) : row[k]===textCell(v),`${row.id}.${k}`,'Facility CSV field differs from JSON');
}

const reactions=records('data/reactions.json'), reactionReport=get('data/reaction-checks.json')||{};
const reactionChecks=new Map((reactionReport.checks||[]).map(x=>[x.id,x]));
const reactionSummary={recipes:reactions.length,arithmetic_pass:0,conditional_unresolved:0,results:[]};
unique('reaction_balance',reactionReport.checks||[],'id','data/reaction-checks.json.checks');
check('reaction_balance',reactionChecks.size===reactions.length,'data/reaction-checks.json','Stored reaction-check count differs');
for (const r of reactions) {
  check('reaction_balance',buildingMap.has(r.building_id),r.id,'Unknown recipe building');
  check('reaction_balance',['active_second','batch'].includes(r.basis),r.id,'Unknown recipe basis');
  check('reaction_balance',['balanced','intentional_sink','conditional_rounding'].includes(r.mass_policy),r.id,'Unknown mass policy');
  const unit=r.basis==='batch'?'kg/batch':'kg/s';
  for (const side of ['inputs','outputs','optional_inputs']) {
    const rows=r[side]||[];
    check('reaction_balance',Array.isArray(rows),`${r.id}.${side}`,'Reaction stream must be an array');
    for (const item of rows) check('reaction_balance',nonempty(item.element_id) && item.amount?.unit===unit && Number.isFinite(item.amount?.value) && item.amount.value>=0,`${r.id}.${side}`,'Reaction amount/unit error');
  }
  const input=r.inputs.reduce((n,x)=>n+x.amount.value,0), output=r.outputs.reduce((n,x)=>n+x.amount.value,0), saved=reactionChecks.get(r.id);
  check('reaction_balance',Boolean(saved),r.id,'Missing stored reaction result');
  if (saved) check('reaction_balance',close(saved.input,input) && close(saved.output,output),r.id,'Stored input/output totals differ');
  if (r.mass_policy==='conditional_rounding') {
    reactionSummary.conditional_unresolved++;
    check('reaction_balance',r.intentional_sink?.value===null && nonempty(r.intentional_sink?.note_ko),r.id,'Conditional recipe must keep its unresolved sink reason');
    check('reaction_balance',saved?.status==='explicitly_exempt_conditional' && nonempty(saved?.reason),r.id,'Conditional recipe was incorrectly promoted to pass');
    reactionSummary.results.push({id:r.id,status:'conditional_unresolved',required_input:input,output,unresolved_difference:input-output,unit,optional_inputs_excluded_from_required_total:true});
  } else {
    const sink=r.intentional_sink?.value, residual=input-output-sink;
    check('reaction_balance',r.intentional_sink?.unit===unit && Number.isFinite(sink) && sink>=0,r.id,'Explicit sink is missing or has wrong units');
    check('reaction_balance',r.mass_policy==='balanced'?sink===0:sink>0,r.id,'Mass policy and explicit sink disagree');
    const pass=close(residual,0,1e-9);
    check('reaction_balance',pass,r.id,'Mass ledger does not balance',{input,output,sink,residual,unit});
    check('reaction_balance',saved?.status==='pass' && close(saved?.residual,residual,1e-9) && close(saved?.intentional_sink,sink) && saved?.unit===unit,r.id,'Stored reaction result disagrees with recomputation');
    if(pass)reactionSummary.arithmetic_pass++;
    reactionSummary.results.push({id:r.id,status:pass?'pass':'fail',input,output,intentional_sink:sink,residual,unit});
  }
}
for (const b of facilities) for (const id of b.recipe_ids||[]) check('reaction_balance',reactions.some(r=>r.id===id && r.building_id===b.id),`${b.id}.recipe_ids`,'Building points to an absent/different recipe',id);
check('reaction_balance',reactionReport.checked===reactions.length && reactionReport.passed===reactionSummary.arithmetic_pass && reactionReport.conditional===reactionSummary.conditional_unresolved,'data/reaction-checks.json','Stored summary differs from recomputation');

for (const r of colony) {
  if (r.domain==='plant') {
    const a=r.fields.min_temperature_c,b=r.fields.max_temperature_c;
    check('plant_room_ranges',Boolean(a&&b),r.id,'Plant temperature bounds missing');
    if (a?.value!==null && b?.value!==null && a && b) {metrics.plant_ranges++; check('plant_room_ranges',a.unit===b.unit && ['degC','°C'].includes(a.unit) && Number.isFinite(a.value) && Number.isFinite(b.value) && a.value<=b.value,r.id,'Invalid plant temperature range');}
    else warn('plant_room_ranges',r.id,'Plant temperature range remains unresolved; no ordered comparison performed');
  }
  if (r.domain==='room') {
    const a=r.fields.min_cells,b=r.fields.max_cells;
    check('plant_room_ranges',Boolean(a&&b),r.id,'Room cell bounds missing');
    if (a?.value!==null && b?.value!==null && a && b) {metrics.room_ranges++; check('plant_room_ranges',a.unit==='cell' && b.unit==='cell' && Number.isInteger(a.value) && Number.isInteger(b.value) && a.value>0 && a.value<=b.value,r.id,'Invalid room cell range');}
    else warn('plant_room_ranges',r.id,'Room size range remains unresolved; no ordered comparison performed');
  }
}

const manifest=get('current-v4/source_manifest.json')||{}, auditSources=new Map((manifest.sources||[]).map(s=>[s.id,s]));
unique('audit_snapshot',manifest.sources||[],'id','current-v4/source_manifest.json');
for (const s of manifest.sources||[]) check('audit_snapshot',/^[a-f0-9]{64}$/.test(s.sha256) && Number.isInteger(s.line_count) && s.line_count>0 && nonempty(s.file),s.id,'Invalid audit source hash/path/line count');
const auditIds=new Set(), auditCounts={};
const auditColumns={
  current_rules:['id','system','entity','field','value','unit','meaning_ko','evidence_status','provenance'],
  current_buildings:['id','code_id','label_ko','cost','power_draw_w','generation_w','research_unlock_points','footprint_cells','cost_unit','evidence_status','provenance'],
  current_materials:['id','code_id','label_ko','work_divisor_seconds','resource_id','yield_units','notes','evidence_status','provenance'],
  current_objectives:['id','code_id','stage','label_ko','target','description_ko','evidence_status','provenance'],
};
for (const name of ['current_rules','current_buildings','current_materials','current_objectives']) {
  const d=get(`current-v4/${name}.json`)||{}, rows=d.records||[]; auditCounts[name]=rows.length; metrics.audit_rows+=rows.length;
  check('audit_snapshot',d.dataset===name && d.scope==='breath-colony-4.0.0-current-implementation' && d.source_commit===manifest.source_commit && d.source_tree_dirty===false,name,'Audit envelope differs from snapshot');
  for (const r of rows) {
    check('audit_snapshot',nonempty(r.id) && !auditIds.has(r.id),r.id,'Missing/duplicate audit row ID'); auditIds.add(r.id);
    check('audit_snapshot',r.evidence_status==='observed_code' && Array.isArray(r.provenance) && r.provenance.length>0,r.id,'Audit evidence/provenance missing');
    for (const p of r.provenance||[]) {metrics.audit_provenance_links++; const s=auditSources.get(p.source_id);
      check('audit_snapshot',Boolean(s) && s.file===p.file && s.sha256===p.sha256 && Number.isInteger(p.line_start) && Number.isInteger(p.line_end) && p.line_start>=1 && p.line_end>=p.line_start && p.line_end<=s.line_count,r.id,'Audit code provenance disagrees with manifest');
    }
  }
  const csv=csvRead(`current-v4/${name}.csv`), byId=new Map(rows.map(r=>[r.id,r]));
  check('csv_parity',isDeepStrictEqual(csv.columns,auditColumns[name]),`current-v4/${name}.csv`,'Audit CSV columns differ from the export contract');
  check('csv_parity',csv.length===rows.length,`current-v4/${name}.csv`,'Audit CSV row count differs');
  unique('csv_parity',csv,'id',`current-v4/${name}.csv`);
  for (const row of csv) {const r=byId.get(row.id); if (!check('csv_parity',Boolean(r),row.id,'Unknown audit CSV row')) continue;
    for (const [k,v] of Object.entries(row)) {
      if (object(r[k]) || Array.isArray(r[k])) check('csv_parity',isDeepStrictEqual(jsonCell(v,`${row.id}.${k}`),r[k]),`${row.id}.${k}`,'Audit CSV JSON cell differs');
      else check('csv_parity',v===(r[k]===null || r[k]===undefined ? '' : String(r[k])),`${row.id}.${k}`,'Audit CSV scalar differs');
    }
  }
}
const auditStored=get('current-v4/audit_validation_report.json')||{};
check('audit_snapshot',isDeepStrictEqual(auditCounts,auditStored.counts) && metrics.audit_rows===auditStored.total_current_data_rows,'current-v4/audit_validation_report.json','Stored audit row totals differ');
check('audit_snapshot',auditStored.passed===true && auditStored.errors?.length===0 && auditStored.source_commit===manifest.source_commit && auditStored.source_files===auditSources.size,'current-v4/audit_validation_report.json','Stored audit verification envelope differs');
const probes=get('current-v4/audit_probe_results.json')||{};
const diagnosticNames=['same_tick_replay','save_resume','caller_partitioning','clipped_oxygen','tile_displacement','partial_coal_fuel'];
for (const key of diagnosticNames) {if(check('audit_diagnostics',object(probes[key]),`audit_probe_results.${key}`,'Required saved diagnostic is missing'))metrics.audit_diagnostic_results++;}
if(diagnosticNames.every(k=>object(probes[k]))) {
  check('audit_diagnostics',probes.same_tick_replay.exactStateEqual===true && /^[a-f0-9]{64}$/.test(probes.same_tick_replay.stateHash),'same_tick_replay','Saved replay outcome/hash is inconsistent');
  check('audit_diagnostics',probes.save_resume.exactStateEqual===true && probes.save_resume.uninterruptedHash===probes.save_resume.resumedHash && /^[a-f0-9]{64}$/.test(probes.save_resume.resumedHash),'save_resume','Saved resume equality/hash is inconsistent');
  check('audit_diagnostics',probes.caller_partitioning.exactStateEqual===false && !isDeepStrictEqual(probes.caller_partitioning.fine,probes.caller_partitioning.coarse),'caller_partitioning','Documented partition-sensitive diagnostic has changed');
  const o=probes.clipped_oxygen;
  check('audit_diagnostics',close(o.nominalProduced-o.cellStoredIncrease,o.difference) && close(o.observed.nominal_output,o.nominalProduced) && close(o.observed.stored_delta,o.cellStoredIncrease) && close(o.observed.unrecorded_difference,o.difference) && o.difference>0,'clipped_oxygen','Saved clipping arithmetic is inconsistent');
  const t=probes.tile_displacement;
  check('audit_diagnostics',['oxygen','co2','water'].every(k=>Number.isFinite(t.before[k]) && t.before[k]>0 && t.after[k]===0),'tile_displacement','Saved occupied tile displacement outcome differs');
  const c=probes.partial_coal_fuel,s=c.setup,expected=c.expected_under_proposed_v5_contract;
  check('audit_diagnostics',close(c.coalConsumed,s.coal_before) && close(c.nominalCoalNeed,s.rated_coal_per_s*s.simulation_dt) && close(c.energyStoredJ,s.rated_power_w*s.simulation_dt),'partial_coal_fuel','Saved current partial-fuel arithmetic is inconsistent');
  check('audit_diagnostics',close(expected.runnable_seconds,s.coal_before/s.rated_coal_per_s) && close(expected.energy_j,expected.runnable_seconds*s.rated_power_w) && close(expected.equivalent_average_power_w,expected.energy_j/s.simulation_dt) && expected.energy_j<c.energyStoredJ,'partial_coal_fuel.proposed','Proposed partial-fuel calculation is inconsistent');
}
const auditBacklog=records('current-v4/upgrade_backlog.json');
const auditDag=dag(auditBacklog,'audit_backlog','current-v4/upgrade_backlog.json');
for (const r of auditBacklog) {
  check('audit_backlog',['P0','P1','P2'].includes(r.priority) && r.status==='proposed_not_implemented',r.id,'Audit backlog proposal state is invalid');
  check('audit_backlog',Array.isArray(r.evidence_rule_ids) && r.evidence_rule_ids.every(id=>auditIds.has(id)),r.id,'Audit backlog evidence points to unknown audit rows');
}
let implementationDag=null;
const implementation=get('data/implementation-backlog.json');
if (!implementation) warn('implementation_backlog','data/implementation-backlog.json','Implementation backlog is not yet present; rerun after assembly. This check is pending, not passed.');
else {
  const rows=Array.isArray(implementation)?implementation:(implementation.tasks||implementation.records||implementation.items||implementation.backlog||[]);
  check('implementation_backlog',rows.length>0,'data/implementation-backlog.json','Implementation backlog has no recognized tasks/records/items array');
  implementationDag=dag(rows,'implementation_backlog','data/implementation-backlog.json','implementation_backlog');
  const auditBacklogIds=new Set(auditBacklog.map(r=>r.id)),taskMap=new Map(rows.map(r=>[r.id,r]));
  const order=implementation.recommended_topological_order||[],position=new Map(order.map((id,i)=>[id,i]));
  check('implementation_backlog',implementation.task_count===rows.length && isDeepStrictEqual(implementation.priority_counts,countBy(rows,'priority')),'data/implementation-backlog.json','Backlog count/priority summary differs');
  check('implementation_backlog',implementation.acceptance_criterion_count===rows.reduce((n,r)=>n+(r.acceptance_criteria?.length||0),0),'data/implementation-backlog.json','Acceptance criterion count differs');
  check('implementation_backlog',implementation.runtime_changed===false && implementation.new_ruleset_simulation_executed===false && implementation.baseline_commit===manifest.source_commit,'data/implementation-backlog.json','Backlog must distinguish plans from executed runtime changes');
  check('implementation_backlog',order.length===rows.length && new Set(order).size===rows.length && order.every(id=>taskMap.has(id)),'recommended_topological_order','Recommended order must list every task once');
  const acceptanceIds=new Set();
  for(const item of rows) {
    check('implementation_backlog',['P0','P1','P2','P3'].includes(item.priority),item.id,'Implementation priority missing/invalid');
    check('implementation_backlog',nonempty(item.title_ko||item.title),item.id,'Implementation title is missing');
    check('implementation_backlog',item.status==='planned' && item.verification?.status==='not_executed',item.id,'Planned work must not claim acceptance execution');
    check('implementation_backlog',Array.isArray(item.audit_references) && item.audit_references.every(id=>auditBacklogIds.has(id)),item.id,'Unknown audit backlog reference');
    check('implementation_backlog',Array.isArray(item.design_references) && item.design_references.length>0,item.id,'Design document references are missing');
    for(const file of item.design_references||[]) {
      const target=resolve(root,file),rel=relative(root,target);
      check('implementation_backlog',!rel.startsWith('..') && existsSync(target),item.id,'Design reference does not exist inside the pack',file);
    }
    check('implementation_backlog',item.dependencies.every(dep=>position.get(dep)<position.get(item.id)) && item.recommended_order===position.get(item.id)+1,item.id,'Recommended order violates a dependency or task order number');
    check('implementation_backlog',item.effort_estimate?.type==='relative_complexity_not_duration' && item.effort_estimate?.schedule_commitment===false && Number.isFinite(item.effort_estimate?.points) && item.effort_estimate.points>0,item.id,'Relative effort must not be represented as a delivery commitment');
    const tests=item.verification?.acceptance_test_ids||[];
    check('implementation_backlog',tests.length===item.acceptance_criteria.length,item.id,'Acceptance test IDs must match the criterion count');
    for(const id of tests) {check('implementation_backlog',nonempty(id) && !acceptanceIds.has(id),item.id,'Duplicate/empty acceptance test ID',id);acceptanceIds.add(id);}
    if (item.evidence_rule_ids) check('implementation_backlog',item.evidence_rule_ids.every(id=>auditIds.has(id)),item.id,'Unknown audit evidence ID');
    if (item.source_ids) check('implementation_backlog',item.source_ids.every(id=>sourceMap.has(id)),item.id,'Unknown source ID');
    if (item.fact_ids) check('implementation_backlog',item.fact_ids.every(id=>factMap.has(id)),item.id,'Unknown reference fact ID');
  }
  implementationDag.acceptance_criteria=implementation.acceptance_criterion_count;
  implementationDag.acceptance_test_ids=acceptanceIds.size;
  implementationDag.acceptance_tests_executed=0;
  const csv=csvRead('data/implementation-backlog.csv');
  check('csv_parity',isDeepStrictEqual(csv.columns,['id','priority','domain','title_ko','status','dependencies','recommended_order','effort_size','effort_points','estimate_note','audit_references','design_references','deliverables','acceptance_criteria','acceptance_test_ids','verification_status','reference_data_gates','notes']),'data/implementation-backlog.csv','Backlog CSV columns differ from the export contract');
  check('csv_parity',csv.length===rows.length,'data/implementation-backlog.csv','Backlog CSV row count differs');
  unique('csv_parity',csv,'id','data/implementation-backlog.csv');
  for(const row of csv) {
    const item=taskMap.get(row.id);if(!check('csv_parity',Boolean(item),row.id,'Unknown backlog CSV ID'))continue;
    for(const key of ['priority','domain','title_ko','status','notes'])check('csv_parity',row[key]===item[key],`${row.id}.${key}`,'Backlog CSV scalar differs');
    for(const key of ['dependencies','audit_references','design_references','deliverables','acceptance_criteria','reference_data_gates'])check('csv_parity',isDeepStrictEqual(jsonCell(row[key],`${row.id}.${key}`),item[key]),`${row.id}.${key}`,'Backlog CSV array differs');
    check('csv_parity',isDeepStrictEqual(jsonCell(row.acceptance_test_ids,`${row.id}.acceptance_test_ids`),item.verification.acceptance_test_ids) && row.verification_status===item.verification.status,row.id,'Backlog CSV acceptance metadata differs');
    check('csv_parity',Number(row.recommended_order)===item.recommended_order && Number(row.effort_points)===item.effort_estimate.points && row.effort_size===item.effort_estimate.size,row.id,'Backlog CSV order/effort differs');
  }
}

const math=get('reports/balance-math.json')||{}, mathCases=math.checks||[];
const value=id=>factMap.get(id)?.value;
const rate=(id,side,element)=>reactions.find(r=>r.id===id)?.[side]?.find(x=>x.element_id===element)?.amount?.value;
const seconds=value('colony.time.cycle_seconds'), breath=value('colony.standard_duplicant.oxygen_kg_s'), calories=value('colony.standard_duplicant.calorie_kcal_cycle');
const ox=rate('electrolysis','outputs','oxygen'),hy=rate('electrolysis','outputs','hydrogen'),water=rate('electrolysis','inputs','water'),genFuel=rate('hydrogen_generation','inputs','hydrogen');
const gen=-value('building.hydrogen_generator.electricity_w');
const pumping=ox/value('building.gas_pump.max_throughput_kg_s')*value('building.gas_pump.electricity_w')+hy/value('building.gas_pump.max_throughput_kg_s')*value('building.gas_pump.electricity_w')+water/value('building.liquid_pump.max_throughput_kg_s')*value('building.liquid_pump.electricity_w')+value('building.electrolyzer.electricity_w');
const mealwood=value('food.meal_lice.calories')*value('plant.mealwood.harvest_amount')/value('plant.mealwood.domesticated_growth_cycles');
const recomputed={three_dupes_oxygen:3*breath*seconds,eight_dupes_oxygen:8*breath*seconds,electrolyzer_oxygen_cycle:ox*seconds,electrolyzer_hydrogen_cycle:hy*seconds,electrolyzer_mass:water,ideal_full_flow_load_w:pumping,hydrogen_potential_multiple_generators_w:hy/genFuel*gen,one_generator_surplus_kg_cycle:(hy-genFuel)*seconds,mealwood_kcal_cycle:mealwood,mealwood_3_people_min:3*calories/mealwood,wheat_to_bread_kcal_cycle:value('plant.sleet_wheat.harvest_amount')/value('recipe.frost_bun.inputs')?.sleet_wheat_grain*value('recipe.frost_bun.output_calories')/value('plant.sleet_wheat.domesticated_growth_cycles'),lavatory_source_kg_use:value('sanitation.lavatory.polluted_water_output')-value('sanitation.lavatory.water_input'),aquatuner_heat_dtu:value('building.thermo_aquatuner.nominal_packet_kg')*1000*value('element.water.specific_heat')*Math.abs(value('building.thermo_aquatuner.temperature_delta_c'))};
unique('derived_arithmetic',mathCases,'id','reports/balance-math.json.checks');
check('derived_arithmetic',math.kind==='derived_math_not_gameplay_run' && math.passed===true && mathCases.length===Object.keys(recomputed).length,'reports/balance-math.json','Derived arithmetic report type/count is invalid');
for(const c of mathCases) check('derived_arithmetic',Object.hasOwn(recomputed,c.id) && Number.isFinite(c.tolerance) && c.tolerance>0 && c.passed===true && close(c.actual,c.expected,c.tolerance) && close(c.actual,recomputed[c.id],c.tolerance),c.id,'Derived arithmetic differs from packaged inputs',{reported:c.actual,recomputed:recomputed[c.id]});
check('derived_arithmetic',close(water,ox+hy),'electrolyzer_mass','Electrolysis input does not equal outputs');

const coverage=get('reports/coverage.json')||{}, statusCounts=countBy(facts,'evidence_status');
const nullFacts=facts.filter(f=>f.value===null), unresolvedFacts=facts.filter(f=>f.evidence_status==='unresolved');
const actualCoverage={source_entries:sources.length,unique_source_urls:new Set(sources.map(s=>s.url.replace(/\/+$/,''))).size,record_counts:recordCounts,entities:entities.length,facts:facts.length,null_fields:nullFacts.length,non_null_fields:facts.length-nullFacts.length,status_counts:statusCounts,source_build_pinned_facts:facts.filter(f=>f.source_game_build!==null).length,runtime_approved_facts:facts.filter(f=>f.runtime_approved===true).length,current_web_audit_rows:metrics.audit_rows};
for(const [k,v] of Object.entries(actualCoverage)) check('coverage_totals',isDeepStrictEqual(coverage[k],v),`reports/coverage.json.${k}`,'Coverage total differs from actual data',{reported:coverage[k],actual:v});

function verifyLink(name,label,target,line) {
  target=target.trim().replace(/^<|>$/g,'').replace(/\s+["'][\s\S]*["']$/,'');
  const location=`${name}:${line}`;
  if (/^(?:https?:|mailto:|data:|sandbox:)/i.test(target)) {
    for(const citation of label.matchAll(/\b([CRF]\d+)\b/g)) {
      metrics.citation_links++;const s=sourceMap.get(citation[1]);
      check('markdown_citations',Boolean(s) && canonUrl(target)===canonUrl(s.url),location,'Citation label points to a different/unregistered source',{id:citation[1],target,registered:s?.url});
    }
    return;
  }
  if (!target || target.startsWith('#')) return;
  metrics.relative_links++;
  let decoded;
  try{decoded=decodeURIComponent(target.split(/[?#]/)[0]);}catch{decoded=target.split(/[?#]/)[0];}
  const absolute=resolve(dirname(resolve(root,name)),decoded), inside=relative(root,absolute);
  check('markdown_links',inside!== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith(sep),location,'Relative link escapes this deliverable',target);
  const pendingBacklogFiles=new Set(['docs/14_Implementation_Backlog.md','data/implementation-backlog.json','data/implementation-backlog.csv']);
  if(!existsSync(absolute) && !implementation && pendingBacklogFiles.has(inside.replaceAll(sep,'/'))) {
    warn('markdown_links',location,'Backlog artifact is still pending; its relative link must be checked after assembly',target);
  } else {
    // This invocation creates its own report after all input validation completes.
    check('markdown_links',absolute===reportPath || existsSync(absolute),location,'Relative Markdown link target is missing',target);
  }
}
for(const name of fileNames.filter(n=>extname(n)==='.md')) {
  metrics.markdown_files++;
  let content=readFileSync(resolve(root,name),'utf8');
  // Replace code fences with equal newline counts so links in examples are not mistaken for navigation.
  content=content.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g,m=>m.replace(/[^\n]/g,' '));
  const refs=new Map();
  for(const m of content.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)) refs.set(m[1].toLowerCase(),m[2]);
  for(const m of content.matchAll(/\[([^\[\]\n]+)\]\(\s*(<[^>]*>|[^\n]*?)\s*\)/g)) verifyLink(name,m[1],m[2],content.slice(0,m.index).split('\n').length);
  for(const m of content.matchAll(/\[([^\[\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const key=(m[2]||m[1]).toLowerCase(),target=refs.get(key),line=content.slice(0,m.index).split('\n').length;
    if(target)verifyLink(name,m[1],target,line);
    else check('markdown_links',false,`${name}:${line}`,'Undefined Markdown link reference',key);
  }
  if(name==='docs/16_Source_Register.md') {
    const seen=new Set();
    for(const m of content.matchAll(/^\|\s*([CRF]\d+)\s*\|[^\n]*\[열기\]\(([^)]+)\)/gm)) {
      seen.add(m[1]);const s=sourceMap.get(m[1]);metrics.citation_links++;
      check('markdown_citations',Boolean(s) && canonUrl(m[2])===canonUrl(s.url),name,'Source-register table ID–URL mismatch',m[1]);
    }
    check('markdown_citations',seen.size===sources.length,name,'Source-register table does not cover all source IDs');
  }
}

const policyList=[...policies.values()];
const assertionCount=policyList.reduce((n,p)=>n+p.assertions,0),failedAssertions=policyList.reduce((n,p)=>n+p.failed,0);
const report={
  schema_version:'1.0.0',tool:'tools/validate.mjs',generated_at:new Date().toISOString(),
  dataset_version:catalog.dataset_version||null,
  validation_kind:'offline_data_and_document_validation_not_runtime_tests',
  passed:errors.length===0,
  summary:{policy_count:policyList.length,policies_with_executed_assertions:policyList.filter(p=>p.assertions>0).length,
    executed_assertions:assertionCount,passed_assertions:assertionCount-failedAssertions,failed_assertions:failedAssertions,
    errors:errors.length,warnings:warnings.length,
    runtime_test_cases_executed:0,existing_runtime_test_suite_71_rerun:false,
    stored_audit_diagnostics_checked:metrics.audit_diagnostic_results,stored_audit_diagnostics_reexecuted:0,
    arithmetic_cases_recomputed:mathCases.length,
    reference_facts:facts.length,unresolved_fields:unresolvedFacts.length,not_applicable_fields:facts.filter(f=>f.evidence_status==='not_applicable').length,null_fields:nullFacts.length,
    reaction_arithmetic_pass:reactionSummary.arithmetic_pass,reaction_conditional_unresolved:reactionSummary.conditional_unresolved},
  metrics,coverage:actualCoverage,reactions:reactionSummary,
  audit:{source_commit:manifest.source_commit||null,rows:metrics.audit_rows,counts:auditCounts,saved_diagnostic_names:diagnosticNames,code_hashes_rechecked_against_live_project:false,backlog:auditDag},
  implementation_backlog:implementationDag||{status:'pending_missing_file'},
  unresolved:{classification:'not_failed_and_not_resolved',null_fact_ids:nullFacts.map(f=>f.fact_id),unresolved_fact_ids:unresolvedFacts.map(f=>f.fact_id)},
  policies:policyList,limitations,errors,warnings,
  input_manifest:fileNames.filter(n=>/\.(json|csv|md|mjs|py)$/.test(n)).map(name=>{const bytes=readFileSync(resolve(root,name));return {file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}),
};
mkdirSync(dirname(reportPath),{recursive:true});
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,...report.summary,report:relative(root,reportPath),errors,warnings},null,2));
if(errors.length)process.exitCode=1;
