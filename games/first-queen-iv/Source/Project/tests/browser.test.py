"""Browser integration test. Uses inline set_content when local navigation is disallowed.
Requires Playwright and Chromium. GPU/context availability is reported, never assumed.
"""
from pathlib import Path
import json, time, base64, sys, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
RESULTS=[]
def record(name,fn):
    start=time.monotonic()
    try:
        fn(); RESULTS.append({'name':name,'status':'PASS','ms':round((time.monotonic()-start)*1000)})
    except Exception as e:
        RESULTS.append({'name':name,'status':'FAIL','message':str(e)[:1000]});print('FAIL',name,str(e)[:350])
def check(value,message='assertion failed'):
    if not value:raise AssertionError(message)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1480,'height':1040},device_scale_factor=1,accept_downloads=True)
    page.set_default_timeout(4000)
    errors=[];console_errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.on('dialog',lambda d:d.accept())
    page.set_content((ROOT/'index.html').read_text(),wait_until='load')
    page.wait_for_timeout(250)
    ev=page.evaluate
    ev("FQ15.game.newGame('custom-v15');document.getElementById('profileSelect').value='custom-v15';FQ15.refresh()")
    def click_map(region):
        point=ev(f'FQ.REGIONS[{region}]');r=page.locator('#stage').bounding_box()
        page.mouse.click(r['x']+point['x']/960*r['width'],r['y']+point['y']/600*r['height'])
    record('브라우저 시작·외부 의존성 없음',lambda:check(ev('FQ15.game.mode')=='world' and not errors and not requests))
    def split_switch():
        page.click('#splitBtn');page.click('[data-army="1"]');click_map(3);page.click('#goBtn')
        check(ev('FQ15.game.activeArmy.region')==3)
        page.click('[data-army="0"]');check(ev('FQ15.game.activeArmy.region')==0)
    record('실제 클릭으로 군단 분할·독립 이동',split_switch)
    def roster():
        old=ev('FQ15.game.activeArmy.roster.length');page.click('#rosterBtn');page.click('#toReserve')
        check(ev('FQ15.game.activeArmy.roster.length')==old-1)
        page.click('[data-close="rosterDialog"]')
    record('편성 대화창에서 병력 이동',roster)
    payload=ev('FQ15.game.export()')
    def export_json():
        with page.expect_download(timeout=4000) as dl: page.click('#exportBtn')
        path=dl.value.path();data=json.loads(Path(path).read_text());check(data['schemaVersion']==22)
    record('JSON 내보내기 다운로드',export_json)
    def import_json():
        ev('FQ15.game.newGame()')
        page.locator('#importFile').set_input_files({'name':'campaign.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
        page.wait_for_timeout(120)
        check(ev('FQ15.game.world.armies.length')==2)
        check(ev('FQ15.game.world.armies[1].region')==3)
    record('파일 입력으로 JSON 저장 복원',import_json)
    def bad_import():
        old=ev('JSON.stringify(FQ15.game.world)');bad=json.loads(json.dumps(payload));bad['world']['reserve'][0]['id']=bad['world']['armies'][0]['roster'][0]['id']
        page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(120)
        check(ev('JSON.stringify(FQ15.game.world)')==old)
        check('실패' in page.locator('#toast').inner_text())
    record('잘못된 저장 파일 거부·상태 보호',bad_import)
    page.click('#resetBtn');page.click('#trainingBtn');page.wait_for_timeout(120);ev('FQ15.game.paused=true;FQ15.refresh()')
    context=ev('({webgl:!!FQ15.renderer.gl,error:FQ15.renderer.error,renderer:FQ15.renderer.gl?"WebGL":"Canvas software 3D"})')
    def orders():
        page.click('[data-order="siege"]');page.click('[data-group="g1"]');page.click('[data-order="hold"]')
        check(ev('FQ15.game.battle.groups[0].order')=='siege');check(ev('FQ15.game.battle.groups[1].order')=='hold')
    record('부대 카드·독립 공성/방어 명령',orders)
    def paused_time():
        tick=ev('FQ15.game.battle.tick');page.wait_for_timeout(200);check(ev('FQ15.game.paused') is True and ev('FQ15.game.battle.tick')==tick)
    record('일시정지 시 시간 정지',paused_time)
    def right_click():
        page.click('[data-group="g0"]');pnt=ev('FQ15.renderer.project(270,420)');r=page.locator('#stage').bounding_box()
        page.mouse.click(r['x']+pnt['x']/960*r['width'],r['y']+pnt['y']/600*r['height'],button='right')
        anchor=ev('FQ15.game.selectedGroup.anchor');check(abs(anchor['x']-270)<3 and abs(anchor['y']-420)<3,str(anchor));check(ev('FQ15.game.battle.groups[1].order')=='hold')
    record('3D 우클릭 지점 역투영·부대 이동',right_click)
    def picking():
        pnt=ev('''()=>{const g=FQ15.game,u=g.battle.units.find(u=>u.team==='blue'&&u.type==='infantry');u.x=180;u.y=440;FQ15.renderer.render(g);return {...FQ15.renderer.project(u.x,u.y,15),id:u.id};}''')
        r=page.locator('#stage').bounding_box();page.mouse.click(r['x']+pnt['x']/960*r['width'],r['y']+pnt['y']/600*r['height'])
        check(ev('FQ15.game.selectedUnitId')==pnt['id'])
    record('3D 병사 클릭 선택',picking)
    def controls():
        for yaw in [0,1.5707963,3.1415926,4.7123889]:
            before=ev(f'''()=>{{const g=FQ15.game,u=g.selected;g.paused=true;u.x=250;u.y=300;u.action=null;u.cool=0;FQ15.renderer.camera.yaw={yaw};FQ15.renderer.render(g);return FQ15.renderer.project(u.x,u.y);}}''')
            ev('FQ15.game.paused=false');page.keyboard.down('w');page.wait_for_timeout(190);page.keyboard.up('w');ev('FQ15.game.paused=true')
            after=ev('FQ15.renderer.project(FQ15.game.selected.x,FQ15.game.selected.y)')
            check(after['y']<before['y']-2,f'yaw={yaw}: {before} -> {after}')
        ev('FQ15.renderer.resetCamera();FQ15.refresh()')
    record('카메라 4방향에서 실제 W 입력은 화면 위로',controls)
    def rotate_zoom():
        r=page.locator('#stage').bounding_box();old=ev('FQ15.renderer.camera.yaw');page.mouse.move(r['x']+400,r['y']+300);page.mouse.down();page.mouse.move(r['x']+490,r['y']+315,steps=5);page.mouse.up();check(ev('FQ15.renderer.camera.yaw')!=old)
        old=ev('FQ15.renderer.camera.zoom');page.mouse.wheel(0,120);page.wait_for_timeout(100);check(ev('FQ15.renderer.camera.zoom')>old)
    record('카메라 드래그·휠 줌',rotate_zoom)
    def view_switch():
        tick=ev('FQ15.game.battle.tick');page.click('#viewBtn');check(ev('FQ15.renderer.view3D') is False);page.click('#viewBtn');check(ev('FQ15.renderer.view3D') is True);check(ev('FQ15.game.battle.tick')==tick)
    record('2D / 3D 전환 시 전투 상태 유지',view_switch)
    def skill():
        ev('FQ15.game.paused=false');page.keyboard.press('f');ev('FQ15.game.paused=true')
        check(ev('FQ15.game.selected.skillCooldown')>0)
    record('F 키 병종 고유 스킬 발동',skill)
    def options():
        page.click('details.options summary');page.uncheck('#health');check(ev('FQ15.renderer.health') is False);page.check('#health');page.check('#paths');check(ev('FQ15.renderer.paths') is True);page.check('#dev')
    record('화면 옵션·디버그 표시 토글',options)
    before_training=ev('JSON.stringify(FQ15.game.world)')
    def report():
        page.click('#winBtn');page.wait_for_timeout(150);check(page.locator('#reportDialog').is_visible());check(ev('JSON.stringify(FQ15.game.world)')==before_training);page.locator('#reportDialog .primary').click()
    record('전투 결과 대화창·연습 상태 복귀',report)
    def auto_turn():
        turn=ev('FQ15.game.world.turn');page.check('#enemyAuto');ev('FQ15.game.autoClock=17.95');page.wait_for_timeout(200);check(ev('FQ15.game.world.turn')==turn+1);page.uncheck('#enemyAuto')
    record('자동 전략 턴 타이머 실행',auto_turn)
    def mobile():
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(120);check(ev('document.body.scrollWidth<=innerWidth'))
        page.screenshot(path=str(ROOT/'tests/mobile.png'));page.set_viewport_size({'width':1480,'height':1040})
    record('390px 모바일 화면 가로 넘침 없음',mobile)
    record('런타임·콘솔 오류 없음',lambda:check(not errors and not console_errors,str(errors+console_errors)))
    # v15 scenarios use real buttons, file downloads, file inputs and key events.
    def reset_ui():
        ev('document.querySelectorAll("dialog[open]").forEach(d=>d.close());FQ15.game.newGame();FQ15.refresh()')
    def campaign_reward():
        reset_ui();click_map(3);page.click('#goBtn');check(ev('FQ15.game.world.campaign.pending.includes(3)'))
        page.click('#rewardsBtn');check(page.locator('#rewardDialog').is_visible());before=ev('FQ15.game.world.reserve.length')
        page.click('[data-choice="healers"]');check(ev('FQ15.game.world.reserve.length')==before+2)
        check(ev('FQ15.game.world.campaign.choices[3]')=='healers');check(not page.locator('#rewardDialog').is_visible())
    record('숲 거점 실제 이동·선택 보상 수령',campaign_reward)
    def campaign_journal():
        page.click('#journalBtn');check(page.locator('.journalRow').count()==6);check('구호단 합류 수령' in page.locator('#journalBody').inner_text());page.screenshot(path=str(ROOT/'tests/journal-v15.png'));page.click('[data-close="journalDialog"]')
    record('작전 일지·보상 선택 기록 표시',campaign_journal)
    def five_maps():
        for region,kind in [(1,'field'),(2,'fort'),(3,'forest'),(4,'river'),(5,'capital')]:
            reset_ui();page.select_option('#trainingMap',str(region));page.click('#trainingBtn');ev('FQ15.game.paused=true;FQ15.refresh()')
            check(ev('FQ15.game.battle.map.kind')==kind);check(not errors,str(errors))
    record('5종 연습 전장 실제 UI·3D 렌더링',five_maps)
    def quicksave_battle():
        ev('FQ15.game.paused=true;FQ15.renderer.camera.yaw=1.2;FQ15.refresh()');before=ev('FQ15.game.battle.tick')
        page.keyboard.press('F5');check('저장' in page.locator('#toast').inner_text())
        ev('FQ15.game.paused=false;FQ15.advance(60);FQ15.game.paused=true')
        check(ev('FQ15.game.battle.tick')>before);page.keyboard.press('F9')
        check(ev('FQ15.game.battle.tick')==before);check(ev('FQ15.game.paused'));check(abs(ev('FQ15.renderer.camera.yaw')-1.2)<1e-6)
    record('실제 F5/F9 전투 복원·카메라·일시정지',quicksave_battle)
    battle_payload={}
    def battle_download():
        global battle_payload
        ev('''()=>{const g=FQ15.game,u=g.battle.units.find(u=>u.type==='archer'&&u.team==='blue'),v=g.battle.units.find(u=>u.team==='red');g.shoot(u,v,12);g.paused=true;FQ15.refresh();}''')
        with page.expect_download(timeout=4000) as dl:page.click('#exportBtn')
        battle_payload=json.loads(Path(dl.value.path()).read_text());check(battle_payload['session']['mode']=='battle');check(len(battle_payload['session']['battle']['projectiles'])>0)
        check(dl.value.suggested_filename=='firstqueen4-battle-v22.json')
    record('전투 JSON 실제 다운로드·투사체 포함',battle_download)
    def battle_upload():
        ev('FQ15.game.paused=false;FQ15.advance(45);FQ15.game.paused=true')
        page.locator('#importFile').set_input_files({'name':'battle-v15.json','mimeType':'application/json','buffer':json.dumps(battle_payload).encode()});page.wait_for_timeout(100)
        check(ev('FQ15.game.mode')=='battle');check(ev('FQ15.game.battle.tick')==battle_payload['session']['battle']['tick']);check(ev('FQ15.game.paused'));check(ev('FQ15.game.battle.projectiles.length')==len(battle_payload['session']['battle']['projectiles']))
    record('전투 JSON 실제 업로드·진행 중 전투 교체',battle_upload)
    def bad_battle_upload():
        old=ev('JSON.stringify(FQ15.game.snapshotBattle())');bad=json.loads(json.dumps(battle_payload));bad['session']['battle']['units'][0]['groupId']='absent'
        page.locator('#importFile').set_input_files({'name':'bad-battle.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(100)
        check(ev('JSON.stringify(FQ15.game.snapshotBattle())')==old);check('실패' in page.locator('#toast').inner_text())
    record('손상된 전투 파일 거부·기존 전투 유지',bad_battle_upload)
    def before_checkpoint():
        reset_ui();click_map(1);before=ev('JSON.stringify(FQ15.game.world)');page.click('#goBtn');ev('FQ15.game.paused=true;FQ15.refresh()');page.click('#checkpointBtn')
        check(ev('FQ15.game.mode')=='world');check(ev('JSON.stringify(FQ15.game.world)')==before)
    record('출전 직전 자동 체크포인트·전투 중 되돌리기',before_checkpoint)
    def after_checkpoint():
        page.click('#goBtn');ev('FQ15.game.debugWin();FQ15.refresh()');check(page.locator('#reportDialog').is_visible());check('새 거점 보상' in page.locator('#resultBody').inner_text())
        page.click('#reportDialog .primary');wins=ev('FQ15.game.world.wins');ev('FQ15.game.newGame();FQ15.refresh()');page.click('#checkpointBtn');check(ev('FQ15.game.world.wins')==wins);check(ev('FQ15.game.world.campaign.pending.includes(1)'))
    record('전투 종료 자동 체크포인트·결과·보상 대기 복구',after_checkpoint)
    def modal_timer():
        reset_ui();page.check('#enemyAuto');page.click('#journalBtn');turn=ev('FQ15.game.world.turn');ev('FQ15.game.autoClock=17.98');page.wait_for_timeout(150);check(ev('FQ15.game.world.turn')==turn);page.click('[data-close="journalDialog"]');page.wait_for_timeout(150);check(ev('FQ15.game.world.turn')==turn+1);page.uncheck('#enemyAuto')
    record('작전 일지 중 자동 전략 턴 정지',modal_timer)
    def world_quicksave():
        reset_ui();page.keyboard.press('F5');turn=ev('FQ15.game.world.turn');page.click('#turnBtn');page.keyboard.press('F9');check(ev('FQ15.game.world.turn')==turn)
    record('전략 단계 실제 F5/F9 복원',world_quicksave)
    def narrow_reward():
        reset_ui();click_map(3);page.click('#goBtn');page.click('#rewardsBtn');page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);check(ev('document.body.scrollWidth<=innerWidth'));page.screenshot(path=str(ROOT/'tests/mobile-reward.png'));page.click('[data-close="rewardDialog"]');page.set_viewport_size({'width':1480,'height':1040})
    record('390px 보상 선택 대화창 넘침 없음',narrow_reward)
    def landscape_battle():
        reset_ui();page.select_option('#trainingMap','4');page.click('#trainingBtn');ev('FQ15.game.paused=true;FQ15.refresh()');page.set_viewport_size({'width':891,'height':411});page.wait_for_timeout(100);check(ev('document.body.scrollWidth<=innerWidth'));check(page.locator('#saveBtn').is_enabled());page.screenshot(path=str(ROOT/'tests/landscape-v15.png'));page.set_viewport_size({'width':1480,'height':1040})
    record('891px 가로 화면·전투 저장 버튼 사용 가능',landscape_battle)
    # Strategy preview is captured from the real game, with no altered artwork.
    reset_ui();click_map(3);page.click('#goBtn');page.wait_for_timeout(100);page.screenshot(path=str(ROOT/'world-v15.png'))
    record('v15 신규 흐름 런타임·콘솔·네트워크 오류 없음',lambda:check(not errors and not console_errors and not requests,str(errors+console_errors)))

    # Deterministic preview: suspend only the test's requestAnimationFrame scheduling,
    # then render the real game frame without the pause overlay.
    ev('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
    ev('FQ15.game.newGame();FQ15.game.startBattle(4,true);FQ15.game.issue("siege",true);FQ15.game.paused=false;FQ15.advance(650);FQ15.renderer.resetCamera();FQ15.renderer.camera.zoom=.78;FQ15.renderer.camera.focusX=560;FQ15.renderer.camera.focusY=300;FQ15.renderer.paths=false;FQ15.refresh()')
    page.screenshot(path=str(ROOT/'tests/desktop.png'))
    page.locator('#stage').screenshot(path=str(ROOT/'preview-v15.png'))
    results={'suite':'browser','browser':browser.version,'origin':'about:blank + set_content (local navigation blocked by environment)','context':context,'storage_note':'JSON UI export/import verified. Persistent localStorage unavailable at opaque origin; handled by user-facing fallback.','passed':sum(t['status']=='PASS' for t in RESULTS),'failed':sum(t['status']=='FAIL' for t in RESULTS),'tests':RESULTS,'page_errors':errors,'console_errors':console_errors,'network_requests':requests}
    (ROOT/'tests/browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2));browser.close()
if any(t['status']=='FAIL' for t in RESULTS):sys.exit(1)
