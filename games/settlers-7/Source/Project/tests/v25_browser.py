"""Inspect the exact standalone with page.set_content in Chromium.
Environment prevents navigable origins and file://. No real-browser persistence claim.
Storage rotation is exercised by shared-helper Node tests using MemoryStorage.
"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];REPORT=ROOT/'reports';results=[];errors=[];requests=[]
def require(v,msg='assertion failed'):
    if not v:raise AssertionError(msg)
def check(name,fn):
    t=time.perf_counter()
    try:fn();results.append({'name':name,'passed':True,'ms':round((time.perf_counter()-t)*1000)});print('PASS',name,flush=True)
    except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e),flush=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':950},device_scale_factor=1);page.set_default_timeout(4000)
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
    page.set_content((ROOT/'Settlers7_Play_v27.html').read_text(),wait_until='load');page.wait_for_function('window.S7App')
    ev=page.evaluate
    def reset():
        ev("S7App.load(new S7.Game({ai:false}).serialize());S7App.paused=true;S7App.focusSector(0);S7App.tab('build');document.body.classList.remove('map-focus');document.querySelector('#welcome').hidden=true;")
    def tab(t):page.locator(f'[data-tab="{t}"]').click()
    def move(x,y):
        v=ev(f'S7App.tileScreen({x},{y})');b=page.locator('#world').bounding_box();page.mouse.move(b['x']+v[0],b['y']+v[1])
    def click(x,y):move(x,y);page.mouse.down();page.mouse.up()
    def start():
        page.locator('#enableAI').uncheck();page.locator('#startGame').click();ev('S7App.paused=true;S7App.render()')
    check('Exact release document starts through set_content',start)
    check('Overview tab and actionable tutorial appear',lambda:(tab('overview'),require('다음 할 일' in page.locator('#panel').inner_text()),require(page.locator('.guide-step').count()==5)))
    def tutorial():page.locator('[data-goto="build"]').first.click();require(page.locator('[data-build="residence"]').is_visible())
    check('Tutorial action navigates to real construction controls',tutorial)
    def good_preview():page.locator('[data-build="residence"]').click();move(3,8);require(ev('S7App.preview.ok'));require('건설 가능' in page.locator('#placement').inner_text())
    check('Hovering valid site shows shared construction preview',good_preview)
    def bad_preview():move(9,9);require(not ev('S7App.preview.ok'));before=ev('S7App.game.s.buildings.length');click(9,9);require(ev('S7App.game.s.buildings.length')==before)
    check('Occupied-site preview blocks spending and placement',bad_preview)
    check('Escape clears construction mode',lambda:(page.keyboard.press('Escape'),require(ev('S7App.tool') is None)))
    def road():
        page.locator('[data-tool="roadPlan"]').click();click(1,9);move(3,5);require(ev('S7App.preview.ok'));require('끝점 클릭' in page.locator('#placement').inner_text());click(3,5);require(ev("S7App.game.s.roads['3,5']")=='street');require(ev('S7App.game.audit().ok'))
    check('Two actual canvas clicks commit connected road plan',road)
    def cancel_road():
        click(1,9);before=ev('JSON.stringify(S7App.game.s.roads)');page.keyboard.press('Escape');require(before==ev('JSON.stringify(S7App.game.s.roads)'))
    check('Escape cancels unfinished road plan without edits',cancel_road)
    def preserve_details():
        tab('economy');page.locator('details').first.locator('summary').click();page.wait_for_timeout(700);require(page.locator('details').first.get_attribute('open') is not None)
    check('Inventory disclosure stays open during periodic UI refresh',preserve_details)
    def preserve_form():
        ev('S7App.focusSector(1)');tab('strategy');page.locator('#armyCount').fill('3');page.locator('#panel h3').click();page.wait_for_timeout(700);require(page.locator('#armyCount').input_value()=='3');reset()
    check('Army count remains entered after blur and periodic refresh',preserve_form)
    def rates():
        ev('S7App.game.advance(75);S7App.render()');tab('overview');require(page.locator('.rates tbody tr').count()>5);require('최근 60초' in page.locator('#panel').inner_text())
    check('Overview shows measured 60-second production and reservations',rates)
    def diagnose():
        reset();ev("const w=S7App.game.s.workshops.find(w=>w.owner===0&&w.type==='blacksmith');w.food='none';S7App.render()");tab('overview');require('식량 정책' in page.locator('#panel').inner_text());page.locator('[data-focus]').first.click();require(page.locator('.workshop-card').count()>0)
    check('Diagnostic locate button focuses real parent building',diagnose)
    def pause_group():
        reset();tab('economy');page.locator('[data-act="pauseGroup"]').first.click();require(ev('S7App.game.s.workshops.filter(w=>w.owner===0&&w.sector===0).every(w=>w.paused)'));page.locator('[data-act="pauseGroup"]').nth(1).click();require(ev('S7App.game.s.workshops.filter(w=>w.owner===0&&w.sector===0).every(w=>!w.paused)'))
    check('Production group pause and resume use real engine commands',pause_group)
    def recruit():
        reset();tab('strategy');page.locator('#recruitCount').select_option('3');page.locator('[data-act="recruitBatch"][data-args*="pikeman"]').click();require(ev('S7App.game.s.training.length')==3)
    check('Select three recruits then enqueue them through UI',recruit)
    def rejected_bulk():
        before=ev('S7App.game.s.training.length');page.locator('#recruitCount').select_option('5');page.locator('[data-act="recruitBatch"][data-args*="pikeman"]').click();require(ev('S7App.game.s.training.length')==before);require('인구' in page.locator('#toast').inner_text())
    check('Bulk order failure leaves existing queue unchanged',rejected_bulk)
    check('Blocked browser storage displays explicit export fallback',lambda:(page.locator('#save').click(),require('차단' in page.locator('#toast').inner_text())))
    def backup_unavailable():
        tab('overview');before=ev('S7App.game.serialize()');page.locator('[data-backup="S7_V27_BACKUP_1"]').click();require(ev('S7App.game.serialize()')==before)
    check('Unavailable storage backup does not overwrite live state',backup_unavailable)
    # Persistent reload is not tested: environment blocks navigable origins.
    def legacy_import():
        page.locator('#saveFile').set_input_files(str(ROOT/'tests/fixtures/v24_in_transit.json'));page.wait_for_timeout(150);require(ev('S7App.game.s.version')==27);require(ev('S7App.game.s.tick')==45);require(ev('S7App.game.audit().ok'))
    check('File picker imports actual v24 transport snapshot',legacy_import)
    def broken():
        before=ev('S7App.game.serialize()');doc=json.loads(before);doc['state']['sectors'][0]['hub']=[1000,2];page.locator('#saveFile').set_input_files({'name':'corrupt.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});page.wait_for_timeout(150);require(ev('S7App.game.serialize()')==before);require('실패' in page.locator('#toast').inner_text())
    check('Invalid save import leaves active state intact',broken)
    def help_flow():
        page.locator('#help').click();require(page.locator('#welcome').is_visible());page.locator('#continueGame').click();require(not page.locator('#welcome').is_visible());ev('S7App.paused=true')
    check('Help returns to current session without replacing Continue permanently',help_flow)
    def wider():
        before=page.locator('#world').bounding_box()['width'];page.locator('#panelToggle').click();require(not page.locator('aside').is_visible());require(page.locator('#world').bounding_box()['width']>before);page.locator('#panelToggle').click();require(page.locator('aside').is_visible())
    check('Wide-map control hides and restores panel',wider)
    def outpost_text():
        reset();ev('S7App.game.capture(S7App.game.s.sectors[1],1);S7App.focusSector(1);S7App.render()');require('점령지' in page.locator('#sectorHint').inner_text());require('수도' not in page.locator('#sectorHint').inner_text())
    check('Enemy outpost is not mislabeled as a capital',outpost_text)
    reset();ev('S7App.game.advance(95);S7App.focusSector(0);S7App.tab("overview");S7App.paused=true');page.mouse.move(0,0);page.wait_for_timeout(120);page.screenshot(path=str(REPORT/'v25_desktop.png'))
    def landscape():
        page.set_viewport_size({'width':891,'height':411});page.wait_for_timeout(120);require(ev('document.documentElement.scrollWidth<=innerWidth'));require(page.locator('#panel').bounding_box()['height']>160);tab('overview');page.locator('#panelToggle').click();require(page.locator('#world').bounding_box()['width']>800);page.locator('#panelToggle').click()
    check('891x411 landscape works with overview and wide map',landscape)
    tab('build');page.screenshot(path=str(REPORT/'v25_landscape.png'))
    def portrait():
        page.set_viewport_size({'width':412,'height':891});page.wait_for_timeout(120);tab('overview');require(ev('document.documentElement.scrollWidth<=innerWidth'));require(page.locator('#world').bounding_box()['height']>250);page.locator('#panelToggle').click();require(page.locator('#world').bounding_box()['height']>700);page.locator('#panelToggle').click()
    check('412x891 portrait panel and expanded map remain in bounds',portrait)
    tab('overview');page.screenshot(path=str(REPORT/'v25_portrait.png'))
    # file:// navigation has the same environment restriction; not claimed as passed.
    check('No uncaught JavaScript page errors',lambda:require(not errors,str(errors)))
    check('Release makes no network requests',lambda:require(not requests,str(requests)))
    browser.close()
out={'method':'Chromium exact standalone via page.set_content; localhost navigation blocked by environment ERR_BLOCKED_BY_ADMINISTRATOR; file:// and origin-based persistence not tested; viewport emulation not physical devices','count':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'errors':errors,'results':results}
(REPORT/'v25_browser_tests.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print({k:out[k] for k in ['count','passed','failed']});raise SystemExit(bool(out['failed']))
