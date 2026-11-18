"""v22 interaction tests. Controlled fixtures + real pointer/keyboard/file IO.
Chromium software rendering is reported separately from GPU verification.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, time, os
R=Path(__file__).resolve().parent.parent
results=[]
def check(v,msg='assertion failed'):
    if not v:raise AssertionError(msg)
def test(name,fn):
    start=time.monotonic()
    try:fn();results.append(dict(name=name,status='PASS',ms=round((time.monotonic()-start)*1000)));print('PASS',name,flush=True)
    except Exception as e:results.append(dict(name=name,status='FAIL',message=str(e)[:1400]));print('FAIL',name,str(e)[:500],flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1480,'height':1040},accept_downloads=True,device_scale_factor=1)
    page.set_default_timeout(5000)
    errors=[];console=[];requests=[]
    def hook(pg):
        pg.on('pageerror',lambda e:errors.append(str(e)))
        pg.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
        pg.on('request',lambda r:requests.append(r.url))
        pg.on('dialog',lambda d:d.accept())
    hook(page);page.set_content((R/'index.html').read_text(),wait_until='load');ev=page.evaluate
    def close():ev('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
    def fresh(map=1):
        close();ev("FQ22.game.newGame('hybrid-repoN-v19');FQ22.renderer.resetCamera();FQ22.renderer.view3D=true;FQ22.refresh()")
        page.select_option('#trainingMap',str(map));page.click('#trainingBtn')
        ev('FQ22.game.paused=true;FQ22.refresh()');page.locator('#stage').scroll_into_view_if_needed()
    def coords(x,y,z=0):
        page.locator('#stage').scroll_into_view_if_needed();q=ev(f'FQ22.renderer.project({x},{y},{z})');r=page.locator('#stage').bounding_box()
        return r['x']+q['x']/960*r['width'],r['y']+q['y']/600*r['height']
    def ground(x,y,button='left',shift=False):
        px,py=coords(x,y)
        if shift:page.keyboard.down('Shift')
        page.mouse.click(px,py,button=button)
        if shift:page.keyboard.up('Shift')
        ev('FQ22.refresh()')
    def enemy():
        return ev("()=>{const es=FQ22.game.battle.units.filter(u=>u.team==='red');es.forEach((u,i)=>{u.x=830+(i%3)*20;u.y=460+Math.floor(i/3)*20});const e=es[0];e.x=365;e.y=300;FQ22.refresh();return {id:e.id,x:e.x,y:e.y};}")
    def enemyClick(e,button='right'):
        x,y=coords(e['x'],e['y'],15);page.mouse.click(x,y,button=button);ev('FQ22.refresh()')
    def metrics():
        ev("""()=>{const g=FQ22.game,a=g.battle.units.filter(u=>u.team==='blue'),t=g.battle.units.find(u=>u.team==='red');for(let i=0;i<6;i++){t.hp=t.maxHp;g.hurt(t,24,a[0]);}a[1].hp-=20;g.heal(a[1],80,a[2]);g.refreshTactics();FQ22.refresh();}""")
    test('v22 initial render and new command controls',lambda:(fresh(),check(page.title().endswith('v22')),check(page.locator('#attackMoveBtn').is_visible()),check(page.locator('#focusTargetBtn').is_visible())))
    def attackMove():
        page.keyboard.press('t');expect(page.locator('#targetModeHint')).to_be_visible();ground(410,300);check(ev("FQ22.game.selectedGroup.order==='attackmove'"),'order after click: '+str(ev('FQ22.game.selectedGroup.order')));check(abs(ev('FQ22.game.selectedGroup.anchor.x')-410)<2)
    test('T + actual field click issues attack-move',attackMove)
    def queued():
        ground(630,300,shift=True);check(ev('FQ22.game.selectedGroup.waypoints.length')==1);check('1/8' in page.locator('#waypointInfo').inner_text());page.keyboard.press('Escape');expect(page.locator('#targetModeHint')).not_to_be_visible()
    test('Shift click queues attack-move and Escape exits target mode',queued)
    def focused():
        e=enemy();enemyClick(e);check(ev('FQ22.game.selectedGroup.focusTargetId')==e['id']);check(ev('FQ22.game.selectedGroup.order')=='attackmove');check(ev('FQ22.game.selectedGroup.waypoints.length')==1);check('HP' in page.locator('#focusTargetInfo').inner_text());check(not page.locator('#clearFocusBtn').is_disabled())
    test('right click enemy sets focus without deleting route',focused)
    def isolated():
        check(ev('FQ22.game.battle.groups.find(g=>g.team==="blue"&&g.id!==FQ22.game.selectedGroupId).focusTargetId===null'))
    test('focus command does not change other friendly groups',isolated)
    def clearFocus():
        page.click('#clearFocusBtn');check(ev('FQ22.game.selectedGroup.focusTargetId') is None);check(ev('FQ22.game.selectedGroup.waypoints.length')==1)
    test('clear target resumes existing command and route',clearFocus)
    def xmode():
        page.click('#focusTargetBtn');ground(460,340);check(page.locator('#targetModeHint').is_visible());e=enemy();enemyClick(e,'left');check(ev('FQ22.game.selectedGroup.focusTargetId')==e['id']);check(not page.locator('#targetModeHint').is_visible())
    test('X targeting ignores empty ground and accepts enemy click',xmode)
    def renderOnly():
        before=ev('JSON.stringify(FQ22.game.snapshotBattle())');ev('FQ22.renderer.render(FQ22.game)');check(ev('JSON.stringify(FQ22.game.snapshotBattle())')==before)
    test('focus markers and contact rendering are simulation read-only',renderOnly)
    def twoD():
        page.click('#viewBtn');check(not ev('FQ22.renderer.view3D'));e=enemy();enemyClick(e);check(ev('FQ22.game.selectedGroup.focusTargetId')==e['id']);page.click('#viewBtn')
    test('same enemy targeting works in 2D and CPU 3D',twoD)
    def allFocus():
        page.check('#allOrders');e=enemy();enemyClick(e);check(ev('FQ22.game.battle.groups.filter(g=>g.team==="blue").every(g=>g.focusTargetId!==null)'));page.uncheck('#allOrders')
    test('all-armies checkbox explicitly applies focus to pending supports',allFocus)
    def deathReturn():
        ev("()=>{const g=FQ22.game,t=g.battle.units.find(u=>u.id===g.selectedGroup.focusTargetId);t.hp=0;t.alive=false;t.deadAt=g.battle.tick;g.refreshTactics();FQ22.refresh();}");check(ev('FQ22.game.selectedGroup.focusTargetId') is None);check(ev('FQ22.game.selectedGroup.order')=='attackmove');check(page.locator('#clearFocusBtn').is_disabled())
    test('target death clears target UI and preserves base order',deathReturn)
    def paused():
        t=ev('FQ22.game.battle.tick');page.wait_for_timeout(150);check(ev('FQ22.game.battle.tick')==t);page.click('#attackMoveBtn');ground(520,300);check(ev('FQ22.game.battle.tick')==t);page.keyboard.press('Escape')
    test('targeting and new orders work without advancing paused battle',paused)
    def miniRoute():
        page.click('#attackMoveBtn');page.locator('#stage').scroll_into_view_if_needed();r=page.locator('#stage').bounding_box();x=r['x']+(773+650/960*164)/960*r['width'];y=r['y']+(468+320/600*102)/600*r['height'];page.mouse.click(x,y);ev('FQ22.refresh()');check(ev('FQ22.game.selectedGroup.order')=='attackmove');check(abs(ev('FQ22.game.selectedGroup.anchor.x')-650)<3);page.keyboard.press('Escape')
    test('minimap destination uses attack-move mode and world coordinates',miniRoute)
    def liveTable():
        fresh();metrics();page.click('#performanceBtn');check(page.locator('#performanceDialog').is_visible());check(page.locator('#performanceRows tr').count()==13);check('치유 20' in page.locator('#performanceSummary').inner_text())
    test('live performance table shows actual clipped damage and healing',liveTable)
    def sortSupport():
        page.select_option('#performanceSort','healing');check('#3' in page.locator('#performanceRows tr').first.inner_text());page.screenshot(path=str(R/'performance-v22.png'));close()
    test('healing sort exposes support unit contribution',sortSupport)
    def modalPause():
        ev('FQ22.game.paused=false');page.click('#performanceBtn');t=ev('FQ22.game.battle.tick');page.wait_for_timeout(150);check(ev('FQ22.game.battle.tick')==t);close();ev('FQ22.game.paused=true;FQ22.refresh()')
    test('statistics dialog freezes battle while reading',modalPause)
    perf=None
    def exportPerf():
        global perf
        page.click('#performanceBtn')
        with page.expect_download() as dl:page.click('#exportPerformance')
        perf=json.loads(Path(dl.value.path()).read_text());check(dl.value.suggested_filename=='fq4-performance-v22.json');check(perf['format']=='fq4-performance-v22');check(len(perf['rows'])==13);check(sum(u['healing'] for u in perf['rows'])==20);close()
    test('performance JSON downloads real aggregate counters',exportPerf)
    def saveRestore():
        e=enemy();enemyClick(e);ev('FQ22.game.issue("attackmove",false,{x:600,y:300});FQ22.game.issue("attackmove",false,{x:700,y:300},true)');enemyClick(e);before=ev('FQ22.game.snapshotBattle()');page.keyboard.press('F5');ev('FQ22.game.clearFocus();FQ22.game.clearWaypoints()');page.keyboard.press('F9');check(ev('FQ22.game.snapshotBattle()')==before);check(ev('FQ22.game.paused'))
    test('F5/F9 preserves target, queued attack-move and performance',saveRestore)
    payload=None
    def fileRoundtrip():
        global payload
        with page.expect_download() as dl:page.click('#exportBtn')
        payload=json.loads(Path(dl.value.path()).read_text());check(payload['schemaVersion']==22);check(payload['session']['battle']['groups'][0]['focusTargetId'] is not None)
        ev('FQ22.game.clearFocus()');page.locator('#importFile').set_input_files({'name':'roundtrip-v22.json','mimeType':'application/json','buffer':json.dumps(payload).encode()});page.wait_for_timeout(80);check(ev('FQ22.game.snapshotBattle()')==payload['session']['battle'])
    test('actual JSON download/upload restores complete tactical state',fileRoundtrip)
    def reject():
        before=ev('JSON.stringify(FQ22.game.snapshotBattle())');bad=json.loads(json.dumps(payload));bad['session']['battle']['units'][0]['performance']['damage']=-1
        page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(80);check(ev('JSON.stringify(FQ22.game.snapshotBattle())')==before);check('실패' in page.locator('#toast').inner_text())
    test('invalid performance input is rejected without state loss',reject)
    def legacy():
        page.locator('#importFile').set_input_files(str(R/'examples/tactical-river-planning-v20.json'));page.wait_for_timeout(80);check(ev('FQ22.game.paused'));check(ev('FQ22.game.battle.units.every(u=>u.performance.damage===0)'));page.click('#performanceBtn');tick=ev('FQ22.game.battle.metricsSinceTick');check(tick==ev('FQ22.game.battle.tick'));check('복원' in page.locator('#performanceScope').inner_text() or tick==0);close()
    test('actual v20 input migrates and explains partial performance coverage',legacy)
    def report():
        fresh();metrics();ev('FQ22.game.debugWin();FQ22.refresh()');check(page.locator('#reportDialog').is_visible());check('상위' in page.locator('#resultBody').inner_text());page.click('#resultPerformanceBtn');check(page.locator('#performanceDialog').is_visible());check(page.locator('#performanceRows tr').count()==13);close()
    test('end-of-battle report retains unit statistics after runtime is cleared',report)
    def keyboard():
        fresh();page.check('#allOrders');page.keyboard.press('t');expect(page.locator('#targetModeHint')).to_be_visible();page.keyboard.press('Escape');page.click('#inspectBtn');t=ev('FQ22.game.battle.tick');page.keyboard.press('t');check(not page.locator('#targetModeHint').is_visible());check(ev('FQ22.game.battle.tick')==t);close();page.uncheck('#allOrders')
    test('checkbox focus keeps shortcuts; open dialogs protect them',keyboard)
    def mobile():
        context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,accept_downloads=True)
        m=context.new_page();hook(m);m.set_content((R/'index.html').read_text());m.select_option('#trainingMap','1');m.locator('#trainingBtn').tap();m.evaluate('FQ22.game.paused=true;FQ22.refresh()');m.locator('#attackMoveBtn').tap();m.locator('#stage').scroll_into_view_if_needed();q=m.evaluate('FQ22.renderer.project(410,300)');r=m.locator('#stage').bounding_box();m.touchscreen.tap(r['x']+q['x']/960*r['width'],r['y']+q['y']/600*r['height']);check(m.evaluate("FQ22.game.selectedGroup.order==='attackmove'"));check(m.evaluate('document.body.scrollWidth<=innerWidth'))
        m.locator('#performanceBtn').tap();check(m.evaluate('document.getElementById("performanceDialog").scrollWidth<=document.getElementById("performanceDialog").clientWidth'));m.screenshot(path=str(R/'tests/mobile-command-v22.png'));context.close()
    test('touch events at 390px issue attack-move and table stays within dialog',mobile)
    def landscape():
        page.set_viewport_size({'width':891,'height':411});fresh();page.click('#focusBtn');check(ev('document.body.scrollWidth<=innerWidth'));page.screenshot(path=str(R/'tests/landscape-command-v22.png'));page.set_viewport_size({'width':1480,'height':1040})
    test('891px landscape with focus mode has no horizontal overflow',landscape)
    def noErrors():check(not errors,str(errors));check(not console,str(console));check(not requests,str(requests))
    test('no page/console errors or runtime network requests',noErrors)
    # Render a real running simulation with route + target overlays for release screenshots.
    fresh(1);ev("FQ22.game.issue('attackmove',false,{x:620,y:300});FQ22.game.issue('attackmove',false,{x:780,y:300},true);FQ22.game.paused=false;FQ22.advance(230);FQ22.game.paused=true;const t=FQ22.game.battle.units.find(u=>u.team==='red'&&u.alive);FQ22.game.focusEnemy(t.id);FQ22.renderer.camera.zoom=.82;FQ22.refresh()")
    page.locator('#stage').screenshot(path=str(R/'preview-v22.png'));page.screenshot(path=str(R/'tactical-v22.png'),full_page=True)
    context=ev('({webgl:!!FQ22.renderer.gl,error:FQ22.renderer.error})')
    result=dict(suite='v22-browser-command-performance',browser=browser.version,origin='set_content',context=context,passed=sum(t['status']=='PASS' for t in results),failed=sum(t['status']=='FAIL' for t in results),tests=results,page_errors=errors,console_errors=console,network_requests=requests)
    (R/'tests/browser-command-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2),flush=True);browser.close()
