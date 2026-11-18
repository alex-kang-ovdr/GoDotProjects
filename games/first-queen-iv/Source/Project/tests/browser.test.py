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
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
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
    def click_map(region):
        point=ev(f'FQ.REGIONS[{region}]');r=page.locator('#stage').bounding_box()
        page.mouse.click(r['x']+point['x']/960*r['width'],r['y']+point['y']/600*r['height'])
    record('브라우저 시작·외부 의존성 없음',lambda:check(ev('FQ14.game.mode')=='world' and not errors and not requests))
    def split_switch():
        page.click('#splitBtn');page.click('[data-army="1"]');click_map(3);page.click('#goBtn')
        check(ev('FQ14.game.activeArmy.region')==3)
        page.click('[data-army="0"]');check(ev('FQ14.game.activeArmy.region')==0)
    record('실제 클릭으로 군단 분할·독립 이동',split_switch)
    def roster():
        old=ev('FQ14.game.activeArmy.roster.length');page.click('#rosterBtn');page.click('#toReserve')
        check(ev('FQ14.game.activeArmy.roster.length')==old-1)
        page.click('[data-close="rosterDialog"]')
    record('편성 대화창에서 병력 이동',roster)
    payload=ev('FQ14.game.export()')
    def export_json():
        with page.expect_download(timeout=4000) as dl: page.click('#exportBtn')
        path=dl.value.path();data=json.loads(Path(path).read_text());check(data['schemaVersion']==14)
    record('JSON 내보내기 다운로드',export_json)
    def import_json():
        ev('FQ14.game.newGame()')
        page.locator('#importFile').set_input_files({'name':'campaign.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
        page.wait_for_timeout(120)
        check(ev('FQ14.game.world.armies.length')==2)
        check(ev('FQ14.game.world.armies[1].region')==3)
    record('파일 입력으로 JSON 저장 복원',import_json)
    def bad_import():
        old=ev('JSON.stringify(FQ14.game.world)');bad=json.loads(json.dumps(payload));bad['world']['reserve'][0]['id']=bad['world']['armies'][0]['roster'][0]['id']
        page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(120)
        check(ev('JSON.stringify(FQ14.game.world)')==old)
        check('실패' in page.locator('#toast').inner_text())
    record('잘못된 저장 파일 거부·상태 보호',bad_import)
    page.click('#resetBtn');page.click('#trainingBtn');page.wait_for_timeout(120);ev('FQ14.game.paused=true;FQ14.refresh()')
    context=ev('({webgl:!!FQ14.renderer.gl,error:FQ14.renderer.error,renderer:FQ14.renderer.gl?"WebGL":"Canvas software 3D"})')
    def orders():
        page.click('[data-order="siege"]');page.click('[data-group="g1"]');page.click('[data-order="hold"]')
        check(ev('FQ14.game.battle.groups[0].order')=='siege');check(ev('FQ14.game.battle.groups[1].order')=='hold')
    record('부대 카드·독립 공성/방어 명령',orders)
    def paused_time():
        tick=ev('FQ14.game.battle.tick');page.wait_for_timeout(200);check(ev('FQ14.game.paused') is True and ev('FQ14.game.battle.tick')==tick)
    record('일시정지 시 시간 정지',paused_time)
    def right_click():
        page.click('[data-group="g0"]');pnt=ev('FQ14.renderer.project(270,420)');r=page.locator('#stage').bounding_box()
        page.mouse.click(r['x']+pnt['x']/960*r['width'],r['y']+pnt['y']/600*r['height'],button='right')
        anchor=ev('FQ14.game.selectedGroup.anchor');check(abs(anchor['x']-270)<3 and abs(anchor['y']-420)<3,str(anchor));check(ev('FQ14.game.battle.groups[1].order')=='hold')
    record('3D 우클릭 지점 역투영·부대 이동',right_click)
    def picking():
        pnt=ev('''()=>{const g=FQ14.game,u=g.battle.units.find(u=>u.team==='blue'&&u.type==='infantry');u.x=180;u.y=440;FQ14.renderer.render(g);return {...FQ14.renderer.project(u.x,u.y,15),id:u.id};}''')
        r=page.locator('#stage').bounding_box();page.mouse.click(r['x']+pnt['x']/960*r['width'],r['y']+pnt['y']/600*r['height'])
        check(ev('FQ14.game.selectedUnitId')==pnt['id'])
    record('3D 병사 클릭 선택',picking)
    def controls():
        for yaw in [0,1.5707963,3.1415926,4.7123889]:
            before=ev(f'''()=>{{const g=FQ14.game,u=g.selected;g.paused=true;u.x=250;u.y=300;u.action=null;u.cool=0;FQ14.renderer.camera.yaw={yaw};FQ14.renderer.render(g);return FQ14.renderer.project(u.x,u.y);}}''')
            ev('FQ14.game.paused=false');page.keyboard.down('w');page.wait_for_timeout(190);page.keyboard.up('w');ev('FQ14.game.paused=true')
            after=ev('FQ14.renderer.project(FQ14.game.selected.x,FQ14.game.selected.y)')
            check(after['y']<before['y']-2,f'yaw={yaw}: {before} -> {after}')
        ev('FQ14.renderer.resetCamera();FQ14.refresh()')
    record('카메라 4방향에서 실제 W 입력은 화면 위로',controls)
    def rotate_zoom():
        r=page.locator('#stage').bounding_box();old=ev('FQ14.renderer.camera.yaw');page.mouse.move(r['x']+400,r['y']+300);page.mouse.down();page.mouse.move(r['x']+490,r['y']+315,steps=5);page.mouse.up();check(ev('FQ14.renderer.camera.yaw')!=old)
        old=ev('FQ14.renderer.camera.zoom');page.mouse.wheel(0,120);page.wait_for_timeout(100);check(ev('FQ14.renderer.camera.zoom')>old)
    record('카메라 드래그·휠 줌',rotate_zoom)
    def view_switch():
        tick=ev('FQ14.game.battle.tick');page.click('#viewBtn');check(ev('FQ14.renderer.view3D') is False);page.click('#viewBtn');check(ev('FQ14.renderer.view3D') is True);check(ev('FQ14.game.battle.tick')==tick)
    record('2D / 3D 전환 시 전투 상태 유지',view_switch)
    def skill():
        ev('FQ14.game.paused=false');page.keyboard.press('f');ev('FQ14.game.paused=true')
        check(ev('FQ14.game.selected.skillCooldown')>0)
    record('F 키 병종 고유 스킬 발동',skill)
    def options():
        page.click('details.options summary');page.uncheck('#health');check(ev('FQ14.renderer.health') is False);page.check('#health');page.check('#paths');check(ev('FQ14.renderer.paths') is True);page.check('#dev')
    record('화면 옵션·디버그 표시 토글',options)
    before_training=ev('JSON.stringify(FQ14.game.world)')
    def report():
        page.click('#winBtn');page.wait_for_timeout(150);check(page.locator('#reportDialog').is_visible());check(ev('JSON.stringify(FQ14.game.world)')==before_training);page.locator('#reportDialog .primary').click()
    record('전투 결과 대화창·연습 상태 복귀',report)
    def auto_turn():
        turn=ev('FQ14.game.world.turn');page.check('#enemyAuto');ev('FQ14.game.autoClock=17.95');page.wait_for_timeout(200);check(ev('FQ14.game.world.turn')==turn+1);page.uncheck('#enemyAuto')
    record('자동 전략 턴 타이머 실행',auto_turn)
    def mobile():
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(120);check(ev('document.body.scrollWidth<=innerWidth'))
        page.screenshot(path=str(ROOT/'tests/mobile.png'));page.set_viewport_size({'width':1480,'height':1040})
    record('390px 모바일 화면 가로 넘침 없음',mobile)
    record('런타임·콘솔 오류 없음',lambda:check(not errors and not console_errors,str(errors+console_errors)))
    # Deterministic preview: suspend only the test's requestAnimationFrame scheduling,
    # then render the real game frame without the pause overlay.
    ev('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
    ev('FQ14.game.newGame();FQ14.game.startBattle(2,true);FQ14.game.issue("siege",true);FQ14.game.paused=false;FQ14.advance(670);FQ14.renderer.resetCamera();FQ14.renderer.camera.zoom=.78;FQ14.renderer.camera.focusX=560;FQ14.renderer.camera.focusY=300;FQ14.renderer.paths=false;FQ14.refresh()')
    page.screenshot(path=str(ROOT/'tests/desktop.png'))
    page.locator('#stage').screenshot(path=str(ROOT/'preview-v14.png'))
    results={'suite':'browser','browser':browser.version,'origin':'about:blank + set_content (local navigation blocked by environment)','context':context,'storage_note':'JSON UI export/import verified. Persistent localStorage unavailable at opaque origin; handled by user-facing fallback.','passed':sum(t['status']=='PASS' for t in RESULTS),'failed':sum(t['status']=='FAIL' for t in RESULTS),'tests':RESULTS,'page_errors':errors,'console_errors':console_errors,'network_requests':requests}
    (ROOT/'tests/browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2));browser.close()
if any(t['status']=='FAIL' for t in RESULTS):sys.exit(1)
