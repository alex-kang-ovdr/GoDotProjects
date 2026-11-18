const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const R=require('../lab/core.js');
const root=path.resolve(__dirname,'..');
const tables=Object.fromEntries(fs.readdirSync(path.join(root,'data/tables')).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),JSON.parse(fs.readFileSync(path.join(root,'data/tables',f)))]));
const sources=fs.readdirSync(path.join(root,'data/sources')).filter(f=>f.endsWith('.json')).flatMap(f=>JSON.parse(fs.readFileSync(path.join(root,'data/sources',f))));
const index=R.createIndex({tables,sources});
test('현재 기사 조회는 2023 HP로 보충되지 않는다',()=>{
 const latest=R.cardDetail(index,'knight',{scope:'verified-2026',level:11});
 assert.ok(latest.records.some(r=>r.form==='hero'&&r.key==='hitpoints'&&r.component==='shield'&&r.value===512));
 assert.ok(!latest.records.some(r=>r.form==='base'&&r.key==='hitpoints')); assert.equal(latest.fullCurrentProfile,false);
 const archive=R.cardDetail(index,'knight',{scope:'archive-2023',level:11});
 assert.ok(archive.records.some(r=>r.key==='hitpoints'&&r.value===1766));
});
test('기준 레벨 미기재를 레벨 비적용으로 간주하지 않는다',()=>{
 const data=R.cardDetail(index,'tombstone',{level:11});
 assert.ok(data.records.some(r=>r.key==='hitpoints'&&r.value===4044&&r.has_later_unspecified_level_change));
 assert.ok(!data.records.some(r=>r.key==='hitpoints'&&r.value===4224));
 assert.ok(data.unspecifiedLevelRecords.some(r=>r.key==='hitpoints'&&r.value===4224));
 assert.ok(!R.cardDetail(index,'tombstone',{level:12}).records.some(r=>r.key==='hitpoints'));
 assert.ok(data.records.some(r=>r.key==='cost'&&r.value===5&&r.reference_level_status==='not_applicable'));
 assert.equal(R.appliesAtLevel({reference_level:null,reference_level_status:'not_stated'},11),false);
});
test('추가 복원 참조가 기존 그래프의 buff와 배치 효과로 이어진다',()=>{
 const graph=R.archiveGraph(index,'ice-wizard');
 assert.ok(graph.entities.some(r=>r.entity_id==='character_buff:IceWizardSlowDown'));
 assert.ok(graph.edges.some(r=>r.key==='target_buff'&&r.target_name==='IceWizardSlowDown'));
 assert.ok(graph.behaviorExtensions.some(r=>Object.hasOwn(r.value,'target_buff')));
 assert.ok(graph.behaviorExtensions.every(r=>r.evidence_status==='community_snapshot'&&r.is_current_live_client===false));
});
test('추가 공식 패치와 기존 패치의 이력은 날짜순으로 보존한다',()=>{
 const history=R.patchHistory(index,'fireball');
 assert.ok(history.some(r=>r.effective_from==='2026-06-01'&&r.key==='crown_tower_damage'&&r.after===172));
 const dates=history.map(r=>r.effective_from);assert.deepEqual(dates,[...dates].sort());
 assert.equal(tables.balance_patch_ledger_2026.length+tables.official_patch_expansion_2026.length,201);
});
test('공식 패치는 레벨과 형상·구성요소를 그대로 보존한다',()=>{
 const row=R.cardDetail(index,'minion-giant').records.find(r=>r.key==='damage');
 assert.equal(row.value,153); assert.equal(row.reference_level,11);
 assert.equal(R.cardDetail(index,'minion-giant',{level:12}).records.some(r=>r.key==='damage'),false);
 assert.ok(R.patchHistory(index,'minion-giant').some(r=>r.before===168&&r.after===153));
});
test('4단계보다 깊은 개체 그래프를 끝까지 탐색한다',()=>{
 const graph=R.archiveGraph(index,'super-lava-hound');
 assert.ok(graph.entities.some(r=>r.entity_id==='projectile:LavaPupProjectile'));
 assert.equal(new Set(graph.entities.map(r=>r.entity_id)).size,graph.entities.length);
});
test('공개 연결 누락을 유사 이름으로 메우지 않는다',()=>{
 const graph=R.archiveGraph(index,'fireball'); assert.equal(graph.roots.length,0);
 assert.equal(R.cardDetail(index,'fireball',{scope:'archive-2023'}).records.length,0);
});
test('자체 밀집보병은 원작 카드 ID가 없다',()=>{
 const data=R.cardDetail(index,'phalanx',{scope:'custom'});
 assert.equal(data.records[0].original_archive_card_id,null);
 assert.equal(data.level,null);
 assert.equal(R.cardDetail(index,'phalanx').records.length,0);
});
test('스코프·레벨 오류와 중복 ID를 거부한다',()=>{
 assert.throws(()=>R.cardDetail(index,'knight',{scope:'latest'}),RangeError);
 assert.throws(()=>R.cardDetail(index,'knight',{level:NaN}),RangeError);
 assert.throws(()=>R.createIndex({tables:{a:[{record_id:'x'},{record_id:'x'}]},sources:[]}),/Duplicate/);
});
test('검색의 한국어 이름, 필드, 상태 필터가 함께 작동한다',()=>{
 assert.equal(R.listCards(index,{query:'밀집',scope:'custom'})[0].key,'phalanx');
 const rows=R.filterRows(tables.combat_rules,{query:'elixir',status:'unverified'});
 assert.ok(rows.length>0); assert.ok(rows.every(r=>r.evidence_status==='unverified'));
});
test('CSV는 null과 0을 분리하며 수식 문자열을 실행하지 않게 내보낸다',()=>{
 const csv=R.csvExport([{id:'=HYPERLINK("x")',zero:0,unknown:null,negative:-2,text:'@cmd',multi:'a\nb'}]);
 assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"null"')); assert.ok(csv.includes('"0"'));
 assert.ok(csv.includes('"\'=HYPERLINK')); assert.ok(csv.includes('"\'@cmd"')); assert.ok(csv.includes('"-2"'));
});
test('출처 링크는 http(s)만 열 수 있다',()=>{
 assert.equal(R.sourceUrl({url:'javascript:alert(1)'}),null);
 assert.equal(R.sourceUrl({url:'data:text/html,hi'}),null);
 assert.equal(R.sourceUrl({url:'implementation_reference/crownfall_4_4_cards.json'}),null);
 assert.equal(R.sourceUrl({url:'https://supercell.com/'}),'https://supercell.com/');
});
test('관측 양식은 자동 통과나 실제 관측으로 바뀌지 않는다',()=>{
 const row=tables.interaction_cases[0],template=R.observationTemplate(row);
 assert.equal(template.observed,false); assert.equal(template.test_status,'not_run');
 assert.equal(template.result,null); assert.deepEqual(template.measurements,[]);
 assert.equal(row.observed,false);
});
test('변화율 분모 0은 null, 음수 변화는 부호를 유지한다',()=>{
 assert.deepEqual(R.patchChange({before:0,after:1}),{delta:1,relativePercent:null});
 assert.equal(R.patchChange({before:168,after:153}).delta,-15);
});
test('극소/극대 확률을 불가능 또는 확실로 반올림하지 않는다',()=>{
 assert.equal(R.probabilityLabel(1e-10),'<0.000001%');
 assert.equal(R.probabilityLabel(0.9999999999),'>99.999999%');
 assert.equal(R.probabilityLabel(0),'0%'); assert.equal(R.probabilityLabel(1),'100%');
 assert.equal(R.probabilityLabel(NaN),'미확인'); assert.equal(R.probabilityLabel(.1234),'12.34%');
});
