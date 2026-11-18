/* Offline research queries. No implicit fallback between evidence scopes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoyaleData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCOPES = Object.freeze(['verified-2026', 'archive-2023', 'custom']);
  const STATUS_LABELS = Object.freeze({official_confirmed:'공식 문서 확인', community_snapshot:'역사 공개 자료', derived:'파생 계산', reproduction_design:'재현 설계', unverified:'미확인', custom_only:'자체 구현'});
  const SCOPE_LABELS = Object.freeze({'verified-2026':'2026 공식 패치 필드', 'archive-2023':'2023 공개 아카이브', custom:'Crownfall 자체 구현'});
  function createIndex(data) {
    if (!data || !data.tables || !Array.isArray(data.sources)) throw new TypeError('Invalid dataset');
    const cards = new Map(), records = new Map(), sources = new Map(data.sources.map(s=>[s.source_id,s]));
    const tables = data.tables;
    function ensure(key) { if (!cards.has(key)) cards.set(key,{key,name:key,archive:null,patches:[],behaviorFacts:[],implementation:[],binding:null}); return cards.get(key); }
    Object.entries(tables).forEach(([table,rows])=>rows.forEach(row=>{
      if (records.has(row.record_id)) throw new Error('Duplicate record id: '+row.record_id);
      records.set(row.record_id,{table,row});
    }));
    (tables.card_catalog_2023||[]).forEach(row=>{
      const card=ensure(row.card_key); card.archive=row; card.name=row.name_ko||row.name_en||row.card_key;
    });
    (tables.verified_patch_fields_2026||[]).forEach(row=>ensure(row.card_key).patches.push(row));
    (tables.card_behavior_research_v4||[]).forEach(row=>{if(row.card_key)ensure(row.card_key).behaviorFacts.push(row);});
    (tables.card_bindings_2023||[]).forEach(row=>ensure(row.key).binding=row);
    (tables.implementation_card_mapping||[]).forEach(row=>{
      const key=row.original_role_reference_key||row.key;
      const card=ensure(key); card.implementation.push(row); if (!card.archive) card.name=row.value.name||key;
    });
    const entities=new Map((tables.entity_definitions_2023||[]).map(row=>[row.entity_id,row]));
    const outgoing=new Map(), levels=new Map(), behaviorExtensions=new Map();
    [...(tables.entity_links_2023||[]),...(tables.archive_reference_extensions_2023||[])].forEach(row=>{
      if (!outgoing.has(row.source_entity_id)) outgoing.set(row.source_entity_id,[]);
      outgoing.get(row.source_entity_id).push(row);
    });
    (tables.archive_behavior_extensions_2023||[]).forEach(row=>behaviorExtensions.set(row.entity_id,row));
    (tables.level_stats_2023||[]).forEach(row=>{
      if (!levels.has(row.entity_id)) levels.set(row.entity_id,[]);
      levels.get(row.entity_id).push(row);
    });
    return {data,tables,cards,records,sources,entities,outgoing,levels,behaviorExtensions};
  }
  function listCards(index, {query='',scope='verified-2026'}={}) {
    if (!SCOPES.includes(scope)) throw new RangeError('Unknown scope');
    const q=query.trim().toLocaleLowerCase();
    return [...index.cards.values()].filter(card=>{
      // Preserve cards with missing fields so absence remains visible.
      if (scope==='archive-2023' && !card.archive) return false;
      if (scope==='custom' && !card.implementation.length) return false;
      return !q || [card.key,card.name,card.archive?.name_en].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
    }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  }
  function archiveGraph(index, key) {
    const card=index.cards.get(key), roots=card?.binding?.value||[], seen=new Set(), queue=[...roots], edges=[];
    for(let head=0;head<queue.length;head++) {
      const id=queue[head];
      if(seen.has(id)) continue;
      seen.add(id);
      for(const edge of index.outgoing.get(id)||[]) {
        edges.push(edge);
        if(edge.resolution==='resolved' && edge.target_entity_ids.length===1 && index.entities.has(edge.target_entity_ids[0])) queue.push(edge.target_entity_ids[0]);
      }
    }
    return {roots:[...roots],entities:[...seen].map(id=>index.entities.get(id)).filter(Boolean),edges,
      behaviorExtensions:[...seen].map(id=>index.behaviorExtensions.get(id)).filter(Boolean)};
  }
  function referenceLevelStatus(row) {return row.reference_level_status || (row.reference_level===null?'not_applicable':'specified');}
  function appliesAtLevel(row,level) {const status=referenceLevelStatus(row);return status==='not_applicable'||(status==='specified'&&row.reference_level===level);}
  function cardDetail(index,key,{scope='verified-2026',level=11}={}) {
    if(!SCOPES.includes(scope)) throw new RangeError('Unknown scope');
    if(!Number.isInteger(level)||level<1||level>99) throw new RangeError('Level must be an integer 1–99');
    const card=index.cards.get(key);
    if(!card) return {key,scope,level,found:false,records:[],fullCurrentProfile:false};
    let records=[],graph=null;
    if(scope==='verified-2026') records=card.patches.filter(r=>appliesAtLevel(r,level));
    if(scope==='archive-2023') {
      graph=archiveGraph(index,key);
      records=graph.entities.flatMap(entity=>(index.levels.get(entity.entity_id)||[]).filter(row=>row.display_level===level));
    }
    if(scope==='custom') records=[...card.implementation];
    return {key,name:card.name,scope,level:scope==='custom'?null:level,found:true,records,graph,archive:scope==='archive-2023'?card.archive:null,
      unspecifiedLevelRecords:scope==='verified-2026'?card.patches.filter(r=>referenceLevelStatus(r)==='not_stated'):[],
      datedBehaviorFacts:scope==='verified-2026'?[...card.behaviorFacts]:[],
      availableReferenceLevels:[...new Set(card.patches.map(r=>r.reference_level).filter(x=>x!==null))],
      fullCurrentProfile:false,warning:scope==='verified-2026'?'수록 원장의 동일 조건에서 마지막으로 확인된 개별 필드입니다. 현재 전체 카드 프로필이 아닙니다. 레벨 미기재 값과 후속 변경 경고는 별도로 확인하세요.':scope==='archive-2023'?'2023-10-18 역사 자료입니다. 현재 수치로 사용하지 마세요.':'자체 프로토타입 수치입니다. 원작과 수치 동등성을 주장하지 않습니다.'};
  }
  function filterRows(rows,{query='',status='all',system='all'}={}) {
    const q=query.trim().toLocaleLowerCase();
    return rows.filter(row=>(status==='all'||row.evidence_status===status)&&(system==='all'||row.system===system)&&(!q||JSON.stringify(row).toLocaleLowerCase().includes(q)));
  }
  function patchHistory(index,key) {
    return [...(index.tables.balance_patch_ledger_2026||[]),...(index.tables.official_patch_expansion_2026||[])].filter(row=>row.card_key===key).sort((a,b)=>a.effective_from.localeCompare(b.effective_from)||a.record_id.localeCompare(b.record_id));
  }
  function patchChange(row) {
    if(typeof row.before!=='number'||typeof row.after!=='number'||!Number.isFinite(row.before)||!Number.isFinite(row.after)) return {delta:null,relativePercent:null};
    return {delta:row.after-row.before,relativePercent:row.before===0?null:(row.after-row.before)/row.before*100};
  }
  function probabilityLabel(probability) {
    if(typeof probability!=='number'||!Number.isFinite(probability)||probability<0||probability>1) return '미확인';
    if(probability===0) return '0%';
    if(probability===1) return '100%';
    const percent=probability*100;
    if(percent<0.000001) return '<0.000001%';
    if(percent>99.999999) return '>99.999999%';
    return percent.toLocaleString('ko-KR',{maximumFractionDigits:6})+'%';
  }
  function sourceUrl(source) {
    if(!source || typeof source.url!=='string') return null;
    try {const url=new URL(source.url); return ['https:','http:'].includes(url.protocol)?url.href:null;} catch (_) {return null;}
  }
  function csvExport(rows) {
    if(!Array.isArray(rows)) throw new TypeError('Rows must be an array');
    const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    const cell=value=>{
      let str=value===null?'null':value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
      // Export-only formula guard; source JSON remains unchanged.
      if(/^[\s]*[=+@-]/.test(str)&&typeof value!=='number') str="'"+str;
      return '"'+str.replace(/"/g,'""')+'"';
    };
    return '\uFEFF'+[keys.map(cell).join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
  }
  function observationTemplate(caseRow) {
    if(!caseRow || !caseRow.record_id || caseRow.system!=='combat_lab') throw new TypeError('Select an interaction case');
    return {schema_version:1,case_id:caseRow.record_id,observation_id:null,executor:'original_client',
      observed:false,test_status:'not_run',client_context:{version:null,platform:null,observed_at:null},
      mode_context:{mode:null,season:null,level_policy:null},card_context:[],initial_state:null,
      input_sequence:[],measurements:[],evidence:[],uncertainty:null,result:null,
      expected_from_spec:caseRow.value.expected,notes:'미실행 기록 양식입니다. 원작 관측 후 버전·조건·측정값·근거를 채우세요. 참조 계약 실행은 원작 관측에 해당하지 않습니다.'};
  }
  return Object.freeze({SCOPES,STATUS_LABELS,SCOPE_LABELS,createIndex,listCards,archiveGraph,cardDetail,referenceLevelStatus,appliesAtLevel,filterRows,patchHistory,patchChange,probabilityLabel,sourceUrl,csvExport,observationTemplate});
});
