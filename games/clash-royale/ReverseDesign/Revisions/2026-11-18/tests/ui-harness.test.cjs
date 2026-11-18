'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {boot} = require('./dom-harness.cjs');
const ROOT = path.resolve(__dirname, '..');
const parsed = spawnSync(process.env.PYTHON || 'python', [path.join(__dirname, 'html_tree.py')],
  {cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
assert.equal(parsed.status, 0, parsed.stderr);
const fixture = JSON.parse(parsed.stdout);
const start = () => boot(ROOT, fixture);
const boxes = (app, id) => app.get(id).querySelectorAll('.result-box').map(el => ({
  label: el.querySelector('span').textContent, value: el.querySelector('strong').textContent
}));
const box = (app, id, label) => boxes(app, id).find(b => b.label === label)?.value;

test('static template IDs are unique and actual app startup resolves every literal binding', () => {
  const app = start();
  const nodes = app.document.querySelectorAll('[id]');
  assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length);
  const source = fs.readFileSync(path.join(ROOT, 'lab/app.js'), 'utf8');
  for (const match of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(app.get(match[1]));
  assert.equal(app.get('metric-records').textContent, Object.values(fixture.data.tables).reduce((sum,rows)=>sum+rows.length,0).toLocaleString('ko-KR'));
  assert.equal(app.get('metric-fields').textContent, String(fixture.data.tables.verified_patch_fields_2026.length));
  assert.equal(app.get('metric-tables').textContent, String(Object.keys(fixture.data.tables).length));
  assert.equal(app.get('metric-cases').textContent, '44');
  assert.equal(app.get('card-level').value, '11');
  assert.equal(app.get('rule-table').options.length, Object.keys(fixture.data.tables).length);
  assert.equal(app.get('probability-group').options.length, 24);
  assert.equal(app.get('observation-case').options.length, 44);
  assert.match(app.get('card-detail').textContent, /마법사|wizard/);
});

test('all five navigation buttons update hidden states and aria-current', () => {
  const app = start();
  for (const view of ['cards', 'rules', 'economy', 'combat', 'quality']) {
    app.view(view);
    for (const section of app.document.querySelectorAll('.view')) assert.equal(section.hidden, section.id !== 'view-' + view);
    const active = app.document.querySelectorAll('[data-view]').filter(b => b.getAttribute('aria-current') === 'page');
    assert.equal(active.length, 1); assert.equal(active[0].dataset.view, view);
    assert.ok(app.get('page-title').textContent.length > 0);
  }
});

test('card search keeps Knight Hero shield and historical base HP in separate scopes', async () => {
  const app = start();
  app.input('card-search', 'knight'); app.card('knight');
  assert.match(app.get('card-detail').textContent, /512/);
  assert.doesNotMatch(app.get('card-detail').textContent, /1,766/);
  app.click('export-card');
  let result = JSON.parse((await app.lastDownload()).text);
  assert.equal(result.key, 'knight'); assert.equal(result.scope, 'verified-2026');
  assert.ok(result.records.some(r=>r.form==='hero'&&r.value===512));
  assert.ok(!result.records.some(r=>r.key==='hitpoints'&&r.form==='base')); assert.equal(result.fullCurrentProfile, false);
  app.scope('archive-2023');
  assert.match(app.get('card-detail').textContent, /1,766/);
  assert.match(app.get('card-detail').textContent, /2023-10-18/);
  app.click('export-card'); result = JSON.parse((await app.lastDownload()).text);
  assert.equal(result.scope, 'archive-2023');
  assert.ok(result.records.some(r => r.key === 'hitpoints' && r.value === 1766));
  assert.ok(result.records.every(r => r.evidence_status === 'community_snapshot'));
  app.scope('verified-2026');
  assert.match(app.get('card-detail').textContent, /512/);
  assert.doesNotMatch(app.get('card-detail').textContent, /1,766/);
});

test('unknown reference level has its own visible section and exported array', async () => {
  const app=start(); app.input('card-search','tombstone'); app.card('tombstone');
  assert.match(app.get('card-detail').textContent,/기준 레벨 미기재 · 선택 레벨에 적용하지 않음/);
  assert.match(app.get('card-detail').textContent,/이후 변경의 레벨 미확정/);
  assert.match(app.get('card-detail').textContent,/4,044/);
  assert.match(app.get('card-detail').textContent,/4,224/);
  app.click('export-card');
  const result=JSON.parse((await app.lastDownload()).text);
  assert.ok(result.records.some(r=>r.value===4044&&r.has_later_unspecified_level_change));
  assert.ok(!result.records.some(r=>r.value===4224));
  assert.ok(result.unspecifiedLevelRecords.some(r=>r.value===4224&&r.reference_level_status==='not_stated'));
});

test('recovered historical target buffs are visible without claiming current behavior', () => {
  const app=start(); app.scope('archive-2023');app.input('card-search','ice-wizard');app.card('ice-wizard');
  assert.match(app.get('card-detail').textContent,/추가 복원한 역사 행동 필드/);
  assert.match(app.get('card-detail').textContent,/IceWizardSlowDown/);
  assert.match(app.get('card-detail').textContent,/target_buff/);
  assert.match(app.get('card-detail').textContent,/2023-10-18/);
});

test('custom Phalanx stays a custom export and disables level control', async () => {
  const app = start();
  app.scope('custom'); app.input('card-search', 'phalanx'); app.card('phalanx');
  assert.equal(app.get('card-level').disabled, true);
  app.click('export-card');
  const data = JSON.parse((await app.lastDownload()).text);
  assert.equal(data.scope, 'custom'); assert.equal(data.records.length, 1);
  assert.equal(data.records[0].original_archive_card_id, null);
  assert.equal(data.records[0].evidence_status, 'custom_only');
  app.scope('verified-2026');
  assert.equal(app.get('card-level').disabled, false);
  assert.match(app.get('card-detail').textContent, /확인된 수치가 없습니다/);
});

test('rule filters, pagination, record dialog and filtered CSV use actual handlers', async () => {
  const app = start(); app.view('rules');
  assert.equal(app.get('rule-page').textContent, '1 / 4');
  app.click('rule-next'); assert.equal(app.get('rule-page').textContent, '2 / 4');
  app.change('rule-status', 'unverified'); app.input('rule-search', 'elixir');
  assert.equal(app.get('rule-count').textContent, '3개 결과');
  assert.equal(app.get('rule-next').disabled, true);
  app.get('rule-table-view').querySelector('button').click();
  assert.equal(app.get('detail-dialog').open, true);
  assert.match(app.get('dialog-title').textContent, /COMBAT_ELIXIR_/);
  assert.match(app.get('dialog-body').textContent, /"value": null/);
  app.click('close-dialog'); assert.equal(app.get('detail-dialog').open, false);
  app.click('export-rules');
  const downloaded = await app.lastDownload();
  assert.equal(downloaded.filename, 'combat_rules_filtered.csv');
  assert.match(downloaded.text, /COMBAT_ELIXIR_INITIAL_AMOUNT/);
  assert.match(downloaded.text, /"null"/);
  assert.doesNotMatch(downloaded.text, /COMBAT_BATTLE_REGULAR_DURATION/);
});

test('upgrade submit renders complete known totals and blocks Epic 6→7 unknown Gold', () => {
  const app = start(); app.view('economy');
  assert.equal(box(app, 'upgrade-result', '필요 복제본'), '20,500');
  assert.equal(box(app, 'upgrade-result', '필요 골드'), '335,000');
  app.change('upgrade-rarity', 'epic');
  app.get('upgrade-from').value = '6'; app.get('upgrade-to').value = '7';
  app.get('owned-copies').value = '999999'; app.get('owned-gold').value = '999999';
  assert.equal(app.submit('upgrade-form').defaultPrevented, true);
  assert.equal(box(app, 'upgrade-result', '필요 골드'), '미확인');
  assert.match(app.get('upgrade-result').textContent, /판단 보류/);
  assert.match(app.get('upgrade-result').textContent, /부분합은 최종 비용이 아닙니다/);
  app.get('upgrade-result').querySelectorAll('button').at(-1).click();
  const raw = JSON.parse(app.get('dialog-body').querySelector('pre').textContent);
  assert.equal(raw.totals.gold, null); assert.equal(raw.blocked, true);
  assert.equal(raw.affordable, null);
});

test('all 24 conditional groups render only their own outcomes and retain unknowns', () => {
  const app = start(); app.view('economy');
  const groups = app.get('probability-group').options.map(o => o.value);
  assert.equal(new Set(groups).size, 24);
  for (const group of groups) {
    app.change('probability-group', group);
    const expected = fixture.data.tables.reward_probability_tables.filter(r => r.probability_group === group);
    assert.equal(app.get('probability-result').querySelectorAll('.bar-label').length, expected.length, group);
    assert.match(app.get('probability-result').textContent, /조건:/);
    if (expected.some(r => r.probability === null)) assert.match(app.get('probability-result').textContent, /미확인|미확정/);
  }
});

test('independent-repeat UI uses probability inputs and labels the assumption', () => {
  const app = start();
  app.get('repeat-p').value = '0'; app.get('repeat-n').value = '10'; app.submit('repeat-form');
  assert.match(app.get('repeat-result').textContent, /1회 이상: 0%/);
  assert.match(app.get('repeat-result').textContent, /독립·동일 확률 가정/);
  app.get('repeat-p').value = '1'; app.submit('repeat-form');
  assert.match(app.get('repeat-result').textContent, /1회 이상: 100%/);
  app.get('repeat-p').value = '2'; app.submit('repeat-form');
  assert.match(app.get('repeat-result').textContent, /확인하세요/);
});

test('interactive hand plays return A after four other plays and reset state', () => {
  const app = start(); app.view('combat');
  const hand = () => app.get('cycle-hand').querySelectorAll('strong').map(n => n.textContent);
  assert.deepEqual(hand(), ['A', 'B', 'C', 'D']);
  for (let i = 0; i < 5; i++) app.get('cycle-hand').querySelector('button').click();
  assert.deepEqual(hand(), ['A', 'B', 'C', 'D']);
  assert.equal(app.get('cycle-count').textContent, '5회 사용');
  assert.match(app.get('cycle-log').textContent, /H 사용 → A 드로우/);
  app.click('cycle-reset');
  assert.equal(app.get('cycle-count').textContent, '0회 사용');
  assert.deepEqual(hand(), ['A', 'B', 'C', 'D']);
});

test('phase slider handlers cover 120/180/240/300-second boundaries', () => {
  const app = start();
  for (const [seconds, phase, multiplier] of [[119, '정규 시간', 1], [120, '정규 시간', 2], [180, '연장 시간', 2], [240, '연장 시간', 3], [300, '타이브레이커 판단 대기', 0]]) {
    app.input('phase-slider', seconds);
    assert.equal(app.get('phase-time').textContent, seconds + '초');
    const result = app.get('phase-result').querySelector('.result-note').textContent;
    assert.ok(result.includes(phase), result);
    assert.ok(result.includes('×' + multiplier), result);
  }
});

test('elixir form reports missing assumptions, then computes a boundary-crossing profile', () => {
  const app = start();
  app.submit('elixir-form');
  assert.match(app.get('elixir-result').textContent, /확인하세요/);
  app.get('elixir-initial').value = '5'; app.get('elixir-cap').value = '10';
  app.get('elixir-interval').value = '2'; app.submit('elixir-form');
  assert.equal(box(app, 'elixir-result', '끝 보유량'), '10');
  assert.equal(box(app, 'elixir-result', '최대치 초과 손실'), '2.5');
  assert.match(app.get('elixir-result').textContent, /직접 입력한 가정/);
});

test('shield form blocks unknown policy and compares discard versus spill explicitly', () => {
  const app = start();
  assert.match(app.get('shield-result').textContent, /정책이 미확인/);
  assert.equal(app.get('shield-result').querySelectorAll('.result-box').length, 0);
  app.change('shield-policy', 'spill'); app.submit('shield-form');
  assert.equal(box(app, 'shield-result', '남은 본체 HP'), '850');
  assert.equal(box(app, 'shield-result', '남은 보호막 HP'), '0');
  app.change('shield-policy', 'discard'); app.submit('shield-form');
  assert.equal(box(app, 'shield-result', '남은 본체 HP'), '1,000');
  app.change('shield-policy', 'unknown'); app.submit('shield-form');
  assert.match(app.get('shield-result').textContent, /결과를 확정하지 않습니다/);
});

test('Phalanx form distinguishes guard, insufficient group, forming and charge', () => {
  const app = start();
  assert.equal(box(app, 'phalanx-result', '받는 피해'), '30');
  assert.equal(box(app, 'phalanx-result', '분대 전체 공격 준비'), '공격 안 함');
  app.get('phalanx-count').value = '2'; app.submit('phalanx-form');
  assert.equal(box(app, 'phalanx-result', '받는 피해'), '100');
  app.get('phalanx-count').value = '6'; app.change('phalanx-state', 'forming'); app.submit('phalanx-form');
  assert.equal(box(app, 'phalanx-result', '분대 전체 공격 준비'), '공격 안 함');
  app.change('phalanx-state', 'charge'); app.submit('phalanx-form');
  assert.equal(box(app, 'phalanx-result', '분대 전체 공격 준비'), '전원 준비');
  app.get('phalanx-stunned').checked = true; app.submit('phalanx-form');
  assert.equal(box(app, 'phalanx-result', '분대 전체 공격 준비'), '조건 미충족');
});

test('coverage and observation selectors keep case export unobserved and separate from reference tests', async () => {
  const app = start(); app.view('quality');
  assert.equal(app.get('backlog-list').querySelectorAll('details').length, fixture.data.analysis.reconstruction_backlog.length);
  app.input('coverage-search', 'phalanx');
  assert.match(app.get('coverage-view').textContent, /독자 카드/);
  assert.match(app.get('coverage-view').textContent, /1개 키/);
  app.change('observation-case', 'CASE_SHIELD_OVERFLOW');
  assert.match(app.get('observation-detail').textContent, /방패 잔량 초과 단타/);
  app.click('export-observation');
  const downloaded = await app.lastDownload();
  assert.equal(downloaded.filename, 'CASE_SHIELD_OVERFLOW_not_run.json');
  const result = JSON.parse(downloaded.text);
  assert.equal(result.case_id, 'CASE_SHIELD_OVERFLOW');
  assert.equal(result.observed, false); assert.equal(result.test_status, 'not_run');
  assert.equal(result.executor, 'original_client'); assert.equal(result.expected_from_spec, null);
  assert.deepEqual(result.measurements, []); assert.deepEqual(result.evidence, []);
  assert.equal(result.client_context.version, null);
});

test('help dialog explains scope and closes through the wired button', () => {
  const app = start();
  app.click('help-button');
  assert.equal(app.get('detail-dialog').open, true);
  assert.match(app.get('dialog-title').textContent, /읽는 순서/);
  assert.match(app.get('dialog-body').textContent, /서버·계정·네트워크 요청 없이/);
  app.click('close-dialog'); assert.equal(app.get('detail-dialog').open, false);
});

test('research summary exposes unresolved records and the patch-chain audit', async () => {
  const app=start();app.view('quality');
  assert.equal(box(app,'research-v4-summary','미해결 결측'),'14');
  assert.equal(box(app,'research-v4-summary','문서 충돌'),'5');
  assert.match(app.get('research-v4-summary').textContent,/기준 레벨 미기재 40행/);
  const buttons=app.get('research-v4-summary').querySelectorAll('button');
  buttons.find(b=>b.textContent.includes('연속성 감사')).click();
  assert.match(app.get('dialog-body').textContent,/numeric_patch_chain_discontinuity/);
  assert.match(app.get('dialog-body').textContent,/294/);
  assert.match(app.get('dialog-body').textContent,/296/);
  app.click('close-dialog');
  buttons.find(b=>b.textContent.includes('집계 JSON')).click();
  const data=JSON.parse((await app.lastDownload()).text);
  assert.equal(data.research_kind_counts.new_fact,93);
  assert.equal(data.scope.current_gameplay_verified,false);
});
