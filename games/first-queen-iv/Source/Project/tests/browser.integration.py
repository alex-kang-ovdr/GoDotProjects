"""v19 source-aware UI tests. Uses actual buttons, downloads and file inputs.
Game time may be advanced with the explicit test hook for repeatability.
"""
from pathlib import Path
import json, os, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
results=[]
def check(condition,message='assertion failed'):
    if not condition:raise AssertionError(message)
def test(name,fn):
    start=time.monotonic()
    try:fn();results.append(dict(name=name,status='PASS',ms=round((time.monotonic()-start)*1000)))
    except Exception as e:results.append(dict(name=name,status='FAIL',message=str(e)[:900]));print('FAIL',name,e)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1536,'height':1080},device_scale_factor=1,accept_downloads=True)
    page.set_default_timeout(4500)
    errors=[];console=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.on('dialog',lambda d:d.accept())
    page.set_content((ROOT/'index.html').read_text(),wait_until='load');page.wait_for_timeout(100)
    ev=page.evaluate
    def close():ev('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
    def fresh():
        close();ev("FQ19.game.newGame('hybrid-repoN-v19');FQ19.refresh();document.getElementById('profileSelect').value='hybrid-repoN-v19'")
    def pause():ev('FQ19.game.paused=true;FQ19.refresh()')
    test('기본 실행은 복원 하이브리드13병사 · 커스텀규칙 고지',lambda:check(ev('FQ19.game.activeArmy.roster.length')==13 and '자체 설계' in page.locator('#profileNote').inner_text()))
    test('전체 관측309·선행슬롯 미포함',lambda:check(ev('FQ.DATA.records.length')==309 and ev('FQ.DATA.records.every(r=>r.raw.name!==0)')))
    def source_open():
        page.click('#sourceBtn');check(page.locator('#sourceRows tr').count()==24);check('309' in page.locator('#sourceCount').inner_text());check('원시' in page.locator('#sourceDetail').inner_text())
    test('관측 기록 도감 실제 열기·페이지별24행',source_open)
    def paged():
        page.click('#sourceNext');check(page.locator('#sourcePage').inner_text().startswith('2'));page.click('#sourcePrev');check(page.locator('#sourcePage').inner_text().startswith('1'))
    test('309 기록 페이지 이동',paged)
    def team_filter():
        page.select_option('#sourceFilter','team16');check(page.locator('#sourceRows tr').count()==13);page.select_option('#sourceFilter','all')
    test('관측 진영0x10 필터13개',team_filter)
    def duplicate():
        page.fill('#sourceSearch','role:313');check(page.locator('#sourceRows tr').count()==2);page.locator('#sourceRows tr').nth(0).click();a=page.locator('#sourceDetail').inner_text();page.locator('#sourceRows tr').nth(1).click();b=page.locator('#sourceDetail').inner_text();check(a!=b and '0x0035B4' in b);page.screenshot(path=str(ROOT/'tests/source-duplicates-v19.png'))
    test('역할ID 중복 두 기록 별도 선택',duplicate)
    def no_results():
        page.fill('#sourceSearch','no-such-record');check(page.locator('#sourceRows tr').count()==0);check(page.locator('#enlistBtn').count()==0);page.fill('#sourceSearch','0x2994');check(page.locator('#sourceRows tr').count()==1)
    test('빈 검색결과에서 엉뚱한 병사 모집 방지',no_results)
    def export_obs():
        with page.expect_download() as event:page.click('#sourceExport')
        data=json.loads(Path(event.value.path()).read_text());check(data['observation']['raw']['level']==0);check(data['observation']['raw']['hitPoint']==255);check(data['roleStatus']=='CUSTOM')
    test('관측 JSON 실제 다운로드·원시레벨0 보존',export_obs)
    def enlist():
        n=ev('FQ19.game.world.reserve.length');page.select_option('#sourceRole','mage');page.click('#enlistBtn');check(ev('FQ19.game.world.reserve.length')==n+1);check(ev('FQ19.game.world.reserve.at(-1).type')=='mage');check(ev('FQ19.game.world.reserve.at(-1).origin.recordId')=='repo-N:00002994');close()
    test('도감 모집 버튼→예비군에 명시역할로 합류',enlist)
    def transfer():
        unit=ev('FQ19.game.world.reserve.at(-1).id');page.click('#rosterBtn');page.select_option('#reserveRoster',str(unit));page.click('#toArmy');check(ev(f'FQ19.game.activeArmy.roster.some(u=>u.id==={unit}&&u.origin.recordId==="repo-N:00002994")'));close()
    test('모집 병사 실제 주력 편성',transfer)
    def inspector():
        page.click('#inspectBtn');check('관측 원시 Lv.0' in page.locator('#inspectBody').inner_text());check('255' in page.locator('#inspectBody').inner_text());check('자체 근사식' in page.locator('#inspectBody').inner_text());page.screenshot(path=str(ROOT/'tests/inspector-v19.png'));close()
    test('능력치 검사: 원시/런타임/훈련 분리',inspector)
    def armory():
        fresh();page.click('#armoryBtn');check(page.locator('.equipmentCard').count()==14);page.click('[data-buy="ko-i013"]');page.click('[data-equip="ko-i013"]');check(ev('FQ19.game.activeArmy.roster[0].equipmentId')=='ko-i013');check('AT 60' in page.locator('#armoryStats').inner_text());check('DF 27' in page.locator('#armoryStats').inner_text());page.screenshot(path=str(ROOT/'tests/armory-v19.png'))
    test('장비14종 구매→장착→AT60 DF27 적용',armory)
    def unequip():
        page.click('#unequipBtn');check('AT 35' in page.locator('#armoryStats').inner_text());check(ev('FQ19.game.world.equipmentStock["ko-i013"]')==1);page.click('[data-equip="ko-i013"]');close()
    test('해제 시 능력치·재고 복구',unequip)
    def world_save():
        page.keyboard.press('F5');ev('FQ19.game.equip(1,null)');page.keyboard.press('F9');check(ev('FQ19.game.activeArmy.roster[0].equipmentId')=='ko-i013');check(ev('FQ19.game.world.profile.id')=='hybrid-repoN-v19')
    test('F5/F9로 장비·프로필·출처 복원',world_save)
    def start():
        page.select_option('#trainingMap','1');page.click('#trainingBtn');pause();check(ev('FQ19.game.battle.units.filter(u=>u.team==="blue").every(u=>u.origin)'));check(page.locator('#armoryBtn').is_disabled())
    test('복원 병사 실제 전투 진입·장착 잠금',start)
    def modal_freeze():
        ev('FQ19.game.paused=false');page.click('#sourceBtn');t=ev('FQ19.game.battle.tick');page.wait_for_timeout(200);check(ev('FQ19.game.battle.tick')==t);check(page.locator('#enlistBtn').is_disabled());close();pause()
    test('전투 도감 열 때 시간 동결·모집 차단',modal_freeze)
    def combat():
        ev('FQ19.game.paused=false;FQ19.advance(750);FQ19.game.paused=true;FQ19.refresh()');check(ev('FQ19.game.battle.stats.attempts')>0);page.click('#combatLogBtn');check('시도' in page.locator('#combatSummary').inner_text());check(page.locator('#combatRows div').count()>0)
    test('실제 명중·회피·회복 판정 UI',combat)
    def export_combat():
        with page.expect_download() as dl:page.click('#exportCombat')
        d=json.loads(Path(dl.value.path()).read_text());check(d['ruleset']['ruleset']=='hybrid-combat-1');check(len(d['events'])>0);close()
    test('판정 로그 JSON 다운로드',export_combat)
    payload=None
    def export_battle():
        global payload
        with page.expect_download() as dl:page.click('#exportBtn')
        payload=json.loads(Path(dl.value.path()).read_text());check(payload['schemaVersion']==22);check(payload['session']['battle']['units'][0]['origin']['recordId']=='repo-N:00002994');check(dl.value.suggested_filename=='firstqueen4-battle-v22.json')
    test('전투 전체 JSON 내보내기',export_battle)
    def import_battle():
        ev('FQ19.game.paused=false;FQ19.advance(90);FQ19.game.paused=true')
        page.locator('#importFile').set_input_files({'name':'v19.json','mimeType':'application/json','buffer':json.dumps(payload).encode()});page.wait_for_timeout(100)
        check(ev('FQ19.game.battle.tick')==payload['session']['battle']['tick']);check(ev('FQ19.game.paused'));check(ev('FQ19.game.world.profile.datasetRevision')==payload['world']['profile']['datasetRevision'])
    test('전투 파일 실제 업로드·일시정지 복원',import_battle)
    def reject():
        before=ev('JSON.stringify(FQ19.game.world)');d=json.loads(json.dumps(payload));d['world']['armies'][0]['roster'][0]['origin']['hash']='tampered';page.locator('#importFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(d).encode()});page.wait_for_timeout(100);check(ev('JSON.stringify(FQ19.game.world)')==before);check('실패' in page.locator('#toast').inner_text())
    test('출처 지문 손상 파일 거절·현재 상태 유지',reject)
    def trace_pause():
        t=ev('FQ19.game.battle.tick');page.wait_for_timeout(130);check(ev('FQ19.game.battle.tick')==t)
    test('로드 후 자동 재개 없이 상태 보존',trace_pause)
    def mode_switch():
        before=ev('JSON.stringify(FQ19.game.snapshotBattle())');page.click('#viewBtn');check(ev('FQ19.renderer.view3D') is False);page.click('#viewBtn');check(ev('JSON.stringify(FQ19.game.snapshotBattle())')==before)
    test('2D/3D 전환에 복원 수치·전투 상태 불변',mode_switch)
    def finish():
        before=ev('JSON.stringify(FQ19.game.world)');ev('FQ19.game.debugWin();FQ19.refresh()');check(page.locator('#reportDialog').is_visible());check('회피' in page.locator('#resultBody').inner_text());check(ev('JSON.stringify(FQ19.game.world)')==before);close()
    test('연습 결과표 명중집계·캠페인 불변',finish)
    def real_battle():
        fresh();page.click('#goBtn');pause();page.evaluate('FQ19.game.paused=false;FQ19.game.reinforce();FQ19.advance(18000);FQ19.refresh()');check(ev('FQ19.game.report.outcome')=='victory');check(ev('FQ19.game.world.regions[1].owner')=='blue');check(ev('FQ19.game.activeArmy.roster.every(u=>u.origin)'));check(page.locator('#reportDialog').is_visible());page.screenshot(path=str(ROOT/'tests/results-v19.png'));close()
    test('캠페인 자연 승리·귀속·소유권·결과표',real_battle)
    def role_skill():
        fresh();page.select_option('#trainingMap','1');page.click('#trainingBtn');pause();ev('FQ19.game.paused=false;FQ19.advance(180);FQ19.game.paused=true;FQ19.refresh()')
        ev('''()=>{const g=FQ19.game,m=g.battle.units.find(u=>u.type==='mage'&&u.team==='blue'),v=g.battle.units.find(u=>u.team==='red');m.x=v.x-70;m.y=v.y;g.selectUnit(m.id);g.paused=false;FQ19.refresh();}''');page.keyboard.press('f');pause();check(ev('FQ19.game.selected.type')=='mage');check(ev('FQ19.game.selected.skillCooldown')>0)
    test('마법 역할 실제 F키 스킬 발동',role_skill)
    def switch_custom():
        close();page.select_option('#profileSelect','custom-v15');page.click('#resetBtn');check(ev('FQ19.game.world.profile.id')=='custom-v15');check(ev('FQ19.game.activeArmy.roster.length')==26);page.click('#sourceBtn');check(page.locator('#enlistBtn').is_disabled());close()
    test('커스텀 새 게임과 복원모드 분리',switch_custom)
    def legacy():
        page.locator('#importFile').set_input_files(str(ROOT/'examples/legacy-river-v15.json'));page.wait_for_timeout(100);check(ev('FQ19.game.mode')=='battle');check(ev('FQ19.game.world.profile.id')=='custom-v15');check(ev('FQ19.game.paused'));fresh()
    test('실제 v15 저장 파일 입력 호환',legacy)
    def mobile():
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);check(ev('document.body.scrollWidth<=innerWidth'));page.click('#sourceBtn');check(ev('document.getElementById("sourceDialog").scrollWidth<=document.getElementById("sourceDialog").clientWidth'));page.screenshot(path=str(ROOT/'tests/mobile-source-v19.png'));close();page.click('#armoryBtn');check(ev('document.getElementById("armoryDialog").scrollWidth<=document.getElementById("armoryDialog").clientWidth'));close();page.set_viewport_size({'width':1536,'height':1080})
    test('390px 모바일 도감·장비 가로넘침 없음',mobile)
    def landscape():
        page.set_viewport_size({'width':891,'height':411});page.click('#trainingBtn');pause();check(ev('document.body.scrollWidth<=innerWidth'));check(page.locator('#saveBtn').is_enabled());page.screenshot(path=str(ROOT/'tests/landscape-v19.png'));page.set_viewport_size({'width':1536,'height':1080})
    test('891×411 가로 화면 전투 조작 접근',landscape)
    test('브라우저 런타임·콘솔·네트워크 오류 0',lambda:check(not errors and not console and not requests,str(errors+console+requests)))
    # Captures: genuine running application, CPU/GPU path recorded below.
    fresh();page.screenshot(path=str(ROOT/'world-v19.png'),full_page=True)
    page.click('#sourceBtn');page.fill('#sourceSearch','');page.select_option('#sourceFilter','team16');page.screenshot(path=str(ROOT/'catalog-v19.png'));close()
    page.select_option('#trainingMap','4');page.click('#trainingBtn');pause();ev('FQ19.game.paused=false;FQ19.advance(900);FQ19.game.paused=true;FQ19.renderer.camera.zoom=.8;FQ19.renderer.camera.focusX=530;FQ19.refresh()')
    # Hide paused overlay only for still capture, no simulation advance.
    ev('FQ19.game.paused=false;FQ19.refresh()');page.locator('#stage').screenshot(path=str(ROOT/'preview-v19.png'));pause()
    context=ev('({webgl:!!FQ19.renderer.gl,reason:FQ19.renderer.error})')
    output=dict(suite='browser-v19-integration',browser=browser.version,context=context,origin='about:blank / set_content',passed=sum(t['status']=='PASS' for t in results),failed=sum(t['status']=='FAIL' for t in results),tests=results,page_errors=errors,console_errors=console,network_requests=requests)
    (ROOT/'tests/browser-integration-results.json').write_text(json.dumps(output,ensure_ascii=False,indent=2));print(json.dumps(output,ensure_ascii=False,indent=2));browser.close()
    if output['failed']:raise SystemExit(1)
