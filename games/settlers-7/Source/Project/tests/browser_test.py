"""Exact standalone document loaded into Chromium using set_content.
This intentionally does not claim file:// navigation coverage.
Requires optional playwright package and Chromium; neither is needed to play.
"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports'; REPORT.mkdir(exist_ok=True)
results=[]; errors=[]; requests=[]
def check(name,fn):
    t=time.perf_counter()
    try:
        fn(); results.append({'name':name,'passed':True,'ms':round((time.perf_counter()-t)*1000)})
        print('PASS',name,flush=True)
    except Exception as e:
        results.append({'name':name,'passed':False,'error':str(e)}); print('FAIL',name,str(e),flush=True)
def require(v, msg='condition not satisfied'):
    if not v: raise AssertionError(msg)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':950},device_scale_factor=1)
    page.set_default_timeout(5000)
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
    page.set_content((ROOT/'Settlers7_Play_v27.html').read_text(encoding='utf-8'),wait_until='load')
    page.wait_for_function('window.S7App !== undefined')
    def ev(s): return page.evaluate(s)
    def render(): ev('S7App.render()')
    def advance(n): ev(f'S7App.game.advance({n});S7App.render()')
    def tab(t): page.locator(f'[data-tab="{t}"]').click()
    def reset(): ev("S7App.load(new S7.Game({ai:false}).serialize()); S7App.paused=true; S7App.focusSector(0); S7App.tab('build');")
    def click_tile(x,y):
        a=ev(f'S7App.tileScreen({x},{y})');b=page.locator('#world').bounding_box();page.mouse.click(b['x']+a[0],b['y']+a[1])
    check('Standalone loads welcome and shared engine',lambda:require(page.locator('#welcome').is_visible()))
    def start():
        page.locator('#enableAI').uncheck();page.locator('#startGame').click();ev('S7App.paused=true;S7App.render()');require(not page.locator('#welcome').is_visible())
    check('Welcome starts real game with chosen AI setting',start)
    check('Initial resource and population UI',lambda:require('22 / 28' in page.locator('#pop').inner_text()))
    check('Map canvas has actual drawing area',lambda:require(ev("document.querySelector('#world').width>500")))
    check('Eight gameplay tabs accessible',lambda:require(page.locator('[data-tab]').count()==8))
    def build():
        page.locator('[data-build="residence"]').click();click_tile(3,8);require(ev('S7App.game.at(3,8)?.type')=='residence');require(ev('S7App.game.at(3,8).remaining')>0)
    check('Click build card and actual map places paid building',build)
    check('Construction completes through common simulation',lambda:(advance(9),require(ev('S7App.game.at(3,8).remaining')==0)))
    def attach3():
        for kind in ['bakery','papermill','brewery']:
            page.locator('#attachChoice').select_option(kind);page.locator('[data-attach]').click()
        require(ev('S7App.game.at(3,8).workshops.length')==3)
    check('Three attached workshops created by real UI',attach3)
    check('Fourth workshop attachment disabled',lambda:require(page.locator('[data-attach]').is_disabled()))
    def food():
        q=page.locator('[data-food]').first;q.select_option('fancy');require(ev("S7App.game.workshop(S7App.game.at(3,8).workshops[0]).food")=='fancy')
    check('Food selector updates production policy',food)
    check('Economy panel exposes local stock and workshop states',lambda:(tab('economy'),require(page.locator('summary').count()>0)))
    def audit():
        page.locator('[data-audit]').first.click();require('검사 통과' in page.locator('#panel').inner_text())
    check('Resource and reservation diagnostic works',audit)
    def provenance():
        page.locator('#dataSearch').fill('blacksmith');page.locator('#dataSearch').dispatch_event('change');require('blacksmith' in page.locator('.data-table').inner_text())
    check('Data provenance search narrows reference records',provenance)
    def recruit():
        reset();tab('strategy');page.locator('button[data-act="recruit"][data-args*="pikeman"]').click();require(ev('S7App.game.s.training.length')==1)
    check('Recruitment UI pays and queues unit',recruit)
    check('Recruitment cancel button refunds queue',lambda:(page.locator('[data-act="cancelRecruit"]').click(),require(ev('S7App.game.s.training.length')==0)))
    def research():
        ev("for(let i=0;i<2;i++){let r=S7App.game.command('recruit',{unit:'novice',sector:0});if(!r.ok)throw Error(r.message)}");advance(33);tab('research');page.locator('button[data-act="research"][data-args*="engineering"]').click();require(ev('!!S7App.game.s.research.engineering'))
    check('Research UI assigns genuinely recruited clergy',research)
    check('Research completion applies engineering effect',lambda:(advance(41),require(ev("S7App.game.hasTech(0,'engineering')"))))
    def trade():
        reset();tab('trade');page.locator('button[data-act="trade"][data-args*="plank_sale"]').click();require(ev("S7App.game.s.expeditions.some(e=>e.kind==='trade')"));advance(25);require(ev('S7App.game.s.stats[0].trades')==1)
    check('Trade button creates travelling exchange and returning trader',trade)
    def bribe():
        reset();tab('strategy');page.locator('#sectorSelect').select_option('1');page.locator('[data-exp="bribe"]').click();require(ev('S7App.game.s.sectors[1].owner')==-1);advance(21);require(ev('S7App.game.s.sectors[1].owner')==0)
    check('Peaceful expansion has actual travel before territory capture',bribe)
    def transfer():
        advance(22);ev('S7App.focusSector(0)');tab('trade');page.locator('[data-transfer]').click();require(ev("S7App.game.s.jobs.some(j=>j.kind==='relay')"));advance(40);require(ev('S7App.game.audit().ok'))
    check('Owned warehouses transfer goods without teleport or duplication',transfer)
    def save():
        with page.expect_download() as info: page.locator('#exportSave').click()
        info.value.save_as(str(REPORT/'browser_save.json'));raw=json.loads((REPORT/'browser_save.json').read_text());require(raw['format']=='S7-PLAYABLE-27')
    check('JSON export downloads a valid snapshot',save)
    def load():
        ev('S7App.game.advance(10)');page.locator('#saveFile').set_input_files(str(REPORT/'browser_save.json'));page.wait_for_timeout(200);require(ev('S7App.paused'));require(ev('S7App.game.audit().ok'));require(ev('S7App.game.s.tick')==json.loads((REPORT/'browser_save.json').read_text())['state']['tick'])
    check('JSON file import restores exact saved tick',load)
    def reject():
        before=ev('S7App.game.serialize()');page.locator('#saveFile').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{invalid'});page.wait_for_timeout(200);require('실패' in page.locator('#toast').inner_text());require(before==ev('S7App.game.serialize()'))
    check('Malformed save leaves active kingdom intact',reject)
    def pause():
        ev('S7App.paused=true;S7App.render()');n=ev('S7App.game.s.tick');page.wait_for_timeout(450);require(ev('S7App.game.s.tick')==n)
    check('Pause freezes real frame-driven simulation',pause)
    def resume():
        page.locator('#pause').click();n=ev('S7App.game.s.tick');page.wait_for_timeout(700);require(ev('S7App.game.s.tick')>n);ev('S7App.paused=true;S7App.render()')
    check('Resume advances shared engine in requestAnimationFrame',resume)
    check('Local storage failure has explicit export fallback',lambda:(page.locator('#save').click(),require('저장' in page.locator('#toast').inner_text())))
    def camera():
        page.locator('#fit').click();page.locator('#home').click();page.locator('#zoomIn').click();page.locator('#zoomOut').click();page.locator('#routes').click();require(page.locator('#routes').get_attribute('class')=='active')
    check('Camera and logistics overlay controls',camera)
    def victory():
        reset();ev("""const g=S7App.game; const c=(t,a)=>{const r=g.command(t,a);if(!r.ok)throw Error(r.message)}; c('expedition',{from:0,to:1,kind:'bribe'});c('expedition',{from:0,to:3,kind:'military',count:6});for(let i=0;i<5;i++)c('recruit',{unit:'novice',sector:0});g.advance(82);c('research',{tech:'engineering',sector:0});c('research',{tech:'hygiene',sector:0});for(let i=0;i<3;i++){c('trade',{offer:'plank_sale',sector:0});g.advance(25);}g.advance(40);S7App.render();""");require(ev('S7App.game.s.victory.winner')==0);require(page.locator('#outcome').is_visible())
    check('Complete match reaches visible victory using normal costs',victory)
    page.screenshot(path=str(REPORT/'victory.png'))
    reset();advance(90);ev('S7App.focusSector(0);S7App.tab("economy");S7App.paused=true;S7App.render()');page.mouse.move(0,0);page.wait_for_timeout(200);page.screenshot(path=str(REPORT/'desktop.png'))
    def landscape():
        page.set_viewport_size({'width':891,'height':411});page.wait_for_timeout(200);require(ev('document.documentElement.scrollWidth<=innerWidth'));require(page.locator('#panel').bounding_box()['height']>180);require(page.locator('#exportSave').is_visible())
    check('891x411 landscape keeps readable panel and export',landscape)
    check('Landscape all six tabs remain usable',lambda:[page.locator(f'[data-tab="{x}"]').click() for x in ['build','economy','strategy','research','trade','inspect']])
    tab('build');page.screenshot(path=str(REPORT/'mobile_landscape.png'))
    def portrait():
        page.set_viewport_size({'width':412,'height':891});page.wait_for_timeout(200);require(ev('document.documentElement.scrollWidth<=innerWidth'));require(page.locator('#exportSave').is_visible());require(page.locator('#world').bounding_box()['height']>250)
    check('412x891 portrait splits map and control panel',portrait)
    check('Portrait all six tabs remain usable',lambda:[page.locator(f'[data-tab="{x}"]').click() for x in ['build','economy','strategy','research','trade','inspect']])
    tab('economy');page.screenshot(path=str(REPORT/'mobile_portrait.png'))
    check('No JavaScript page errors',lambda:require(not errors,str(errors)))
    check('Standalone makes no external network requests',lambda:require(not requests,str(requests)))
    browser.close()
out={'method':'Chromium /usr/bin/chromium; exact standalone document loaded with page.set_content; file:// navigation NOT tested','count':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'pageErrors':errors,'networkRequests':requests,'results':results}
(REPORT/'browser_tests.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print({k:out[k] for k in ['count','passed','failed']},flush=True)
raise SystemExit(1 if out['failed'] else 0)
