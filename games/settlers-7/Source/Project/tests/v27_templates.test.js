'use strict';
/**
 * Pure UI-template checks against the shipping engine.
 * These execute extracted template functions in Node. They do not create a DOM,
 * launch a browser, check layout, or exercise actual input events.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(root, 'game', 'ui.js'), 'utf8');
const S7 = require(path.join(root, 'game', 'engine.js'));

function extract(startMarker, endMarker) {
  const start = uiSource.indexOf(startMarker);
  if (start < 0) throw new Error(`UI template start marker missing: ${startMarker}`);
  const end = uiSource.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`UI template end marker missing: ${endMarker}`);
  if (end <= start) throw new Error(`Invalid UI template range: ${startMarker}`);
  return uiSource.slice(start, end);
}

// Validate every extraction marker before running any assertions. A source
// reorganization must update these boundaries rather than silently testing less.
const templateFunctions = [
  extract('function cost(', 'function toast('),
  extract('function btn(', 'function focusSector('),
  extract('function sectorSelect(', 'const militaryOrder='),
  extract('const militaryOrder=', 'function researchPanel(')
].join('\n');

function createScenario() {
  const context = vm.createContext({ S7 });
  vm.runInContext(`
    const {Game,D,sum}=S7;
    let game=new Game({ai:false}),sector=0,recruitCount=1;
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
    const time=n=>Math.floor(n/60).toString().padStart(2,'0')+':'+Math.floor(n%60).toString().padStart(2,'0');
    ${templateFunctions}
  `, context, { filename: 'v27-ui-template-functions', timeout: 10000 });
  return code => vm.runInContext(code, context, { timeout: 10000 });
}

const results = [];
function check(name, verify) {
  try {
    verify(createScenario());
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

check('Initial owned territory explains unavailable redeployment', run => {
  const html = run('strategyPanel()');
  assert.ok(html.includes('두 번째 영토를 확보하면'));
  assert.ok(!html.includes('undefined'));
});

check('Neutral destination has five military quantity rows and three mission choices', run => {
  const html = run('sector=1;strategyPanel()');
  assert.equal((html.match(/data-mission-unit=/g) || []).length, 5);
  for (const kind of ['military', 'bribe', 'convert']) {
    assert.ok(html.includes(`data-kind="${kind}"`));
  }
  assert.ok(html.includes(S7.D.resources.coin.name + ' 9'));
});

check('Mission templates show travel ETA without changing simulation state', run => {
  run('sector=1');
  const before = run('game.serialize()');
  const html = run('strategyPanel()');
  assert.ok(html.includes('00:19'));
  assert.equal(run('game.serialize()'), before);
  assert.ok(run('missionMapPreview.route.length') > 1);
});

check('Changing destination preserves its own military draft', run => {
  run('sector=1;strategyPanel();missionContext().draft.units={pikeman:2};sector=3;strategyPanel();sector=1;');
  assert.equal(run('missionContext().draft.units.pikeman'), 2);
});

check('Reduced garrison clamps stale quantities and provides a visible notice', run => {
  run('sector=1;strategyPanel();missionContext().draft.units={pikeman:2};game.s.sectors[0].units.pikeman=1;');
  const html = run('strategyPanel()');
  assert.equal(run('missionContext().draft.units.pikeman'), 1);
  assert.ok(run('missionContext().draft.notice.length') > 0);
  assert.ok(html.includes('출발 전 수량을 확인하세요.'));
});

check('Friendly destination exposes all eleven transferable unit types', run => {
  const html = run('game.capture(game.s.sectors[1],0);sector=1;strategyPanel()');
  assert.equal((html.match(/data-mission-unit=/g) || []).length, 11);
  assert.ok(html.includes('data-exp="redeploy"'));
});

check('Mixed military and civilian draft displays exact count and travel ETA', run => {
  const html = run('game.capture(game.s.sectors[1],0);sector=1;missionContext().draft.units={pikeman:1,hawker:1};strategyPanel()');
  assert.ok(html.includes('선택 2 / 35명'));
  assert.ok(html.includes('재배치 가능'));
  assert.ok(html.includes('00:19'));
});

check('Real in-flight redeployment renders a live state and return command', run => {
  run("game.capture(game.s.sectors[1],0);sector=1;const sent=game.command('redeploy',{from:0,to:1,units:{pikeman:1,hawker:1}});if(!sent.ok)throw Error(sent.message);game.advance(1);");
  const html = run('strategyPanel()');
  assert.ok(html.includes('재배치 중'));
  assert.ok(html.includes('data-expedition='));
  assert.ok(html.includes('이동 취소·귀환'));
});

check('A battle-locked origin leaves uncomputed requirements explicitly unknown', run => {
  const html = run('sector=3;game.s.sectors[0].battle="template-locked-source";strategyPanel()');
  assert.ok(html.includes('출발 조건 확인 후 표시'));
  assert.ok(html.includes('교전 중인 출발 지역'));
});

const report = {
  kind: 'template-functions-not-browser',
  count: results.length,
  passed: results.filter(result => result.passed).length,
  failed: results.filter(result => !result.passed).length,
  results
};
const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'v27_template_tests.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
