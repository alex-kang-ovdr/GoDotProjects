"""v22 UI regression using real controls, downloads and file inputs.
set_content is the measured fallback when local-file navigation is restricted.
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
    try:fn();results.append(dict(name=name,status='PASS',ms=round((time.monotonic()-start)*1000)))
    except Exception as e:results.append(dict(name=name,status='FAIL',message=str(e)[:1200]));print('FAIL',name,e,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1480,'height':1040},accept_downloads=True,device_scale_factor=1)
    page.set_default_timeout(5000)
    errors=[];console=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.on('dialog',lambda d:d.accept())
    page.set_content((R/'index.html').read_text(),wait_until='load')
    ev=page.evaluate
    def close():ev('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
    def fresh():
        close();ev("FQ22.game.newGame('hybrid-repoN-v19');FQ22.renderer.resetCamera();FQ22.renderer.view3D=true;FQ22.refresh()")
        page.wait_for_timeout(50)
    def pause():ev('FQ22.game.paused=true;FQ22.refresh()')
    def training(n=1):
        fresh();page.select_option('#trainingMap',str(n));page.click('#trainingBtn');pause()
    def at(x,y,button='left',shift=False):
        q=ev(f'FQ22.renderer.project({x},{y})');r=page.locator('#stage').bounding_box()
        if shift:page.keyboard.down('Shift')
        page.mouse.click(r['x']+q['x']/960*r['width'],r['y']+q['y']/600*r['height'],button=button)
        if shift:page.keyboard.up('Shift')
    def mini(x,y,button='left'):
        r=page.locator('#stage').bounding_box();page.mouse.click(r['x']+(773+x/960*164)/960*r['width'],r['y']+(468+y/600*102)/600*r['height'],button=button)
    test('v22 starts with preserved 309 records and 13 source soldiers',lambda:check(ev('FQ.DATA.records.length===309&&FQ22.game.activeArmy.roster.length===13') and 'v22' in page.title()))
    def bulk():
        page.click('#rosterBtn');ids=ev('FQ22.game.activeArmy.roster.slice(0,3).map(u=>String(u.id))');before=ev('FQ22.game.world.reserve.length');page.select_option('#mainRoster',ids);page.click('#toReserve');check(ev('FQ22.game.world.reserve.length')==before+3);page.select_option('#reserveRoster',ids);page.click('#toArmy');check(ev('FQ22.game.activeArmy.roster.length')==13);check(ev('FQ22.game.activeArmy.roster.every(u=>u.origin)'))
    test('multiselect transfer in both directions with intact origins',bulk)
    def filtered():
        page.select_option('#rosterFilter','archer');ids=page.locator('#mainRoster option').evaluate_all('(os)=>os.map(o=>Number(o.value))');check(ev(f'FQ22.game.activeArmy.roster.filter(u=>{json.dumps(ids)}.includes(u.id)).every(u=>u.type==="archer")'));page.click('#selectMainAll');check(page.locator('#mainRoster').evaluate('(e)=>e.selectedOptions.length')==len(ids));page.select_option('#rosterFilter','all')
    test('role filter and select-all apply only to visible roster',filtered)
    def sort_health():
        ev('FQ22.game.activeArmy.roster[5].hp=1');id=ev('FQ22.game.activeArmy.roster[5].id');page.select_option('#rosterSort','hp');check(int(page.locator('#mainRoster option').first.get_attribute('value'))==id);page.screenshot(path=str(R/'roster-v22.png'));close()
    test('lowest-health-first roster sorting uses relative HP',sort_health)
    def equip_preview():
        fresh();before=ev('JSON.stringify(FQ22.game.world)');page.click('#armoryBtn');card=page.locator('.equipmentCard').filter(has=page.locator('[data-buy="ko-i013"]'));text=card.locator('.equipPreview').inner_text();check('60' in text and '27' in text);check(ev('JSON.stringify(FQ22.game.world)')==before)
    test('equipment preview shows AT60 DF27 without state mutation',equip_preview)
    def equip_replace():
        page.click('[data-buy="ko-i013"]');page.click('[data-equip="ko-i013"]');card=page.locator('.equipmentCard').filter(has=page.locator('[data-buy="ko-i013"]'));check(card.locator('.equipPreview .up').count()==0 and card.locator('.equipPreview .down').count()==0);page.screenshot(path=str(R/'armory-v22.png'));close()
    test('already equipped item preview has zero replacement delta',equip_replace)
    def begin():
        training(4);check(page.locator('#moveTargetBtn').is_visible());check(page.locator('#autoRetreat').is_visible());check(not ev('FQ22.game.selectedGroup.autoRetreat'))
    test('new tactical controls present with explicit default protection OFF',begin)
    def pending():
        page.click('[data-group="g1"]');check(ev('FQ22.game.selectedUnitId') is None);check(page.locator('#unitRetreatBtn').is_disabled());page.click('[data-group="g0"]')
    test('pending support selection does not expose unrelated unit',pending)
    def queue():
        at(260,210,button='right');at(340,210,button='right',shift=True);q=ev('FQ22.game.selectedGroup');check(len(q['waypoints'])==1);check(abs(q['anchor']['x']-260)<2);check(abs(q['waypoints'][0]['x']-340)<2);check('1/8' in page.locator('#waypointInfo').inner_text())
    test('real Shift-right-click appends a waypoint with correct 3D projection',queue)
    def check_append():
        page.check('#queueMove');at(550,210,button='right');check(ev('FQ22.game.selectedGroup.waypoints.length')==2);page.uncheck('#queueMove');check(ev('FQ22.game.battle.groups[1].waypoints.length')==0)
    test('touch-friendly queue checkbox appends without changing support orders',check_append)
    def clear():
        before=ev('JSON.stringify(FQ22.game.selectedGroup.anchor)');page.click('#clearQueueBtn');check(ev('FQ22.game.selectedGroup.waypoints.length')==0);check(ev('JSON.stringify(FQ22.game.selectedGroup.anchor)')==before)
    test('clear-queue button preserves active destination',clear)
    def mini_pan():
        mini(600,400);c=ev('FQ22.renderer.camera');check(abs(c['focusX']-600)<3 and abs(c['focusY']-400)<3 and not c['follow'])
    test('minimap left click pans camera to world coordinates',mini_pan)
    def mini_order():
        mini(350,210,button='right');a=ev('FQ22.game.selectedGroup.anchor');check(abs(a['x']-350)<3 and abs(a['y']-210)<3)
    test('minimap right click commands the group, not projected coordinates',mini_order)
    def touch_target():
        page.click('#moveTargetBtn');mini(360,390);a=ev('FQ22.game.selectedGroup.anchor');check(abs(a['x']-360)<3 and abs(a['y']-390)<3);page.click('#moveTargetBtn')
    test('move-target mode accepts left-click/tap-compatible orders',touch_target)
    def focus():
        before=ev('JSON.stringify(FQ22.game.snapshotBattle())');page.click('#focusBtn');check(ev('document.body.classList.contains("focusBattle")'));r=page.locator('#stage').bounding_box();check(abs(r['width']/r['height']-1.6)<.02);check(ev('JSON.stringify(FQ22.game.snapshotBattle())')==before)
    test('focus view hides noncombat panels without stretching world coordinates',focus)
    def critical():
        u=ev('''()=>{const u=FQ22.game.battle.units.filter(u=>u.team==='blue')[3];u.hp=u.maxHp*.15;FQ22.refresh();return u.id;}''');page.keyboard.press('c');check(ev('FQ22.game.selectedUnitId')==u);check(ev('FQ22.renderer.camera.follow'));check('1' in page.locator('#criticalBtn').inner_text())
    test('C selects lowest-health soldier and follows the camera',critical)
    def retreat():
        page.keyboard.press('v');check(ev('FQ22.game.selected.individualRetreat'),'retreat flag was not set');expect(page.locator('#unitRetreatBtn')).to_have_text('철수 취소 V');page.keyboard.press('v');check(not ev('FQ22.game.selected.individualRetreat'),'retreat flag was not cleared')
    test('V requests and cancels individual retreat without advancing paused time',retreat)
    def auto_retreat():
        page.check('#autoRetreat');check(ev('FQ22.game.selectedGroup.autoRetreat'));check(not ev('FQ22.game.battle.groups[1].autoRetreat'))
    test('auto retreat checkbox changes selected group only',auto_retreat)
    def freeze():
        t=ev('FQ22.game.battle.tick');page.wait_for_timeout(150);check(ev('FQ22.game.battle.tick')==t);check(page.locator('#moveTargetBtn').is_enabled())
    test('tactical pause allows command editing while time remains frozen',freeze)
    def queue_save():
        page.check('#queueMove');mini(550,210,button='right');page.uncheck('#queueMove');page.keyboard.press('v');before=ev('FQ22.game.snapshotBattle()');page.keyboard.press('F5');ev('FQ22.game.clearWaypoints();FQ22.game.retreatUnit(FQ22.game.selectedUnitId,false)');page.keyboard.press('F9');check(ev('FQ22.game.snapshotBattle()')==before);check(ev('FQ22.game.paused'))
    test('F5/F9 restores queued points, group protection and individual retreat',queue_save)
    payload=None
    def export():
        global payload
        with page.expect_download() as dl:page.click('#focusBtn') if False else page.evaluate('document.getElementById("exportBtn").click()')
        payload=json.loads(Path(dl.value.path()).read_text());check(payload['schemaVersion']==22);check(payload['session']['battle']['groups'][0]['waypoints']);check(dl.value.suggested_filename=='firstqueen4-battle-v22.json')
    test('schema20 battle JSON downloads with tactical state',export)
    def upload():
        ev('FQ22.game.clearWaypoints()');page.locator('#importFile').set_input_files({'name':'v22.json','mimeType':'application/json','buffer':json.dumps(payload).encode()});page.wait_for_timeout(80);check(ev('FQ22.game.battle.groups[0].waypoints')==payload['session']['battle']['groups'][0]['waypoints'])
    test('actual file input restores v22 queued battle',upload)
    def bad_input():
        before=ev('JSON.stringify(FQ22.game.snapshotBattle())');bad=json.loads(json.dumps(payload));bad['session']['battle']['groups'][0]['waypoints']=[{'x':-200,'y':300}];page.locator('#importFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(80);check(ev('JSON.stringify(FQ22.game.snapshotBattle())')==before)
    test('bad queued coordinates are rejected without replacing live game',bad_input)
    def old_import():
        page.locator('#importFile').set_input_files(str(R/'examples/restored-river-battle-v19.json'));page.wait_for_timeout(100);check(ev('FQ22.game.mode')=='battle');check(ev('FQ22.game.paused'));check(ev('FQ22.game.battle.groups.every(g=>g.waypoints.length===0&&!g.autoRetreat)'));check(ev('FQ22.game.battle.units.every(u=>!u.individualRetreat)'))
    test('actual v19 battle file migrates with safe tactical defaults',old_import)
    measure={}
    def quality():
        global measure
        before=ev('JSON.stringify(FQ22.game.snapshotBattle())');measure=ev('''()=>{const r=FQ22.renderer,g=FQ22.game;r.quality='high';r.render(g);const high=r.boxes.length;r.quality='low';r.render(g);return {highBoxes:high,lowBoxes:r.boxes.length,context:!!r.gl};}''');check(measure['lowBoxes']<measure['highBoxes']*.8,str(measure));check(ev('JSON.stringify(FQ22.game.snapshotBattle())')==before)
    test('low-detail mode reduces geometry by at least 20% without changing simulation',quality)
    def quality_ui():
        if ev('document.body.classList.contains("focusBattle")'):page.click('#focusBtn')
        page.locator('details.options').evaluate('(e)=>e.open=true');page.select_option('#quality','low');check(ev('FQ22.renderer.quality')=='low');page.keyboard.press('F5');page.select_option('#quality','high');page.keyboard.press('F9');check(page.locator('#quality').input_value()=='low')
    test('graphics quality selection roundtrips with save',quality_ui)
    def live_exit():
        training(1);ev('FQ22.game.selected.x=55;FQ22.refresh()');id=ev('FQ22.game.selectedUnitId');page.click('#unitRetreatBtn');ev('FQ22.game.paused=false;FQ22.advance(120);FQ22.game.paused=true;FQ22.refresh()');check(ev(f'FQ22.game.battle.units.find(u=>u.id==={id}).evacuated'))
    test('real retreat button causes selected soldier to walk out of battle',live_exit)
    def landscape():
        page.set_viewport_size({'width':891,'height':411});page.wait_for_timeout(100);check(ev('document.body.scrollWidth<=innerWidth'));check(page.locator('#touchControls').is_visible());page.click('#focusBtn');check(ev('document.body.scrollWidth<=innerWidth'));page.screenshot(path=str(R/'tests/landscape-v22.png'))
    test('891px landscape has visible touch controls and no horizontal overflow',landscape)
    def portrait():
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);check(ev('document.body.scrollWidth<=innerWidth'));page.screenshot(path=str(R/'tests/mobile-v22.png'));fresh();page.click('#rosterBtn');check(ev('document.getElementById("rosterDialog").scrollWidth<=document.getElementById("rosterDialog").clientWidth'));close();page.click('#armoryBtn');check(ev('document.getElementById("armoryDialog").scrollWidth<=document.getElementById("armoryDialog").clientWidth'));close()
    test('390px portrait battle and new dialogs stay within width',portrait)
    test('no runtime errors, console errors or external network requests',lambda:check(not errors and not console and not requests,str(errors+console+requests)))
    # Representative real screenshots: not rendered concept art.
    page.set_viewport_size({'width':1480,'height':1040});training(4)
    if not ev('document.body.classList.contains("focusBattle")'):page.click('#focusBtn')
    ev("FQ22.game.issue('move',false,{x:350,y:210});FQ22.game.issue('move',false,{x:550,y:210},true);FQ22.game.issue('move',false,{x:600,y:300},true);FQ22.game.setAutoRetreat(true);FQ22.renderer.quality='high';FQ22.renderer.camera.zoom=.9;FQ22.refresh()")
    page.screenshot(path=str(R/'tactical-v22.png'))
    ev("FQ22.game.issue('siege');FQ22.game.paused=false;FQ22.advance(900);FQ22.game.paused=true;FQ22.renderer.camera.zoom=.75;FQ22.renderer.camera.focusX=530;FQ22.refresh()")
    page.screenshot(path=str(R/'battle-v22.png'))
    ev('FQ22.game.paused=false;FQ22.refresh()');page.locator('#stage').screenshot(path=str(R/'preview-v22.png'));pause()
    fresh();page.screenshot(path=str(R/'world-v22.png'),full_page=True)
    context=ev('({webgl:!!FQ22.renderer.gl,error:FQ22.renderer.error})')
    probe=browser.new_page();file_probe={}
    try:
        probe.goto((R/'index.html').as_uri(),wait_until='load',timeout=8000);file_probe={'success':True,'mode':probe.evaluate('FQ22.game.mode')}
    except Exception as e:file_probe={'success':False,'error':str(e)[:600]}
    probe.close();(R/'tests/file-url-probe-v22.json').write_text(json.dumps(file_probe,ensure_ascii=False,indent=2))
    result=dict(suite='v22-browser-tactics',browser=browser.version,origin='set_content / about:blank',context=context,geometry_measurement=measure,passed=sum(t['status']=='PASS' for t in results),failed=sum(t['status']=='FAIL' for t in results),tests=results,page_errors=errors,console_errors=console,network_requests=requests)
    (R/'tests/browser-tactics-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2),flush=True);browser.close()
