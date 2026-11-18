"""v26 real DOM and touch tests on exact standalone bytes via set_content.
Rare situations are explicitly arranged through the shared engine, not a UI mock.
file:// is blocked by this environment; physical devices are not tested.
"""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];REPORT=ROOT/'reports';results=[];errors=[];requests=[]
def require(value,msg='assertion failed'):
 if not value:raise AssertionError(msg)
def check(name,fn):
 start=time.perf_counter()
 try:fn();results.append({'name':name,'passed':True,'ms':round((time.perf_counter()-start)*1000)});print('PASS',name,flush=True)
 except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e)[:300],flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':950},has_touch=True);page.set_default_timeout(4000)
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.set_content((ROOT/'Settlers7_Play_v27.html').read_text(),wait_until='load');page.wait_for_function('window.S7App');ev=page.evaluate
 def reset(outpost=False):
  ev("S7App.load(new S7.Game({ai:false}).serialize());S7App.paused=true;S7App.focusSector(0);S7App.tab('build');document.body.classList.remove('map-focus');document.querySelector('#welcome').hidden=true;")
  if outpost:ev("S7App.game.capture(S7App.game.s.sectors[1],0);S7App.render()")
 def tab(name):page.locator(f'[data-tab="{name}"]').click()
 def resource(name):
  tab('operations');page.locator('#opResource').select_option(name)
 def tick(sec):ev(f'S7App.game.advance({sec});S7App.render()')
 def start():
  page.locator('#enableAI').uncheck();page.locator('#startGame').click();ev('S7App.paused=true;S7App.render()')
 check('New release starts through actual start button',start)
 check('Eight tabs including operations fit one navigation row',lambda:(require(page.locator('[data-tab]').count()==8),require(len(set(round(page.locator('[data-tab]').nth(i).bounding_box()['y']) for i in range(8)))==1)))
 def top_chip():page.locator('[data-resource="bread"]').click();require(page.locator('#opResource').input_value()=='bread');require('공급 예정' in page.locator('#panel').inner_text())
 check('Top resource chip opens corresponding production chain and stock target',top_chip)
 def target():
  page.locator('#productionHigh').fill('10');page.locator('#productionLow').fill('3');page.locator('[data-operation="production"]').click();require(ev('S7App.game.s.operations.productionTargets[0].high')==10);require(ev('S7App.game.s.operations.productionTargets[0].holding'))
 check('Production target is created using real inputs and engine command',target)
 def target_hold():tick(1);require(ev("S7App.game.s.workshops.find(w=>w.owner===0&&w.type==='bakery').state").startswith('재고 목표'));require(ev('S7App.game.audit().ok'))
 check('Target takes effect in the running workshop rather than UI alone',target_hold)
 def invalid_target():
  before=ev('S7App.game.serialize()');page.locator('#productionHigh').fill('2');page.locator('#productionLow').fill('5');page.locator('[data-operation="production"]').click();require(ev('S7App.game.serialize()')==before);require('미만' in page.locator('#toast').inner_text())
 check('Invalid target range displays failure without changing state',invalid_target)
 def remove():page.locator('[data-act="productionTarget"]').click();require(ev('S7App.game.s.operations.productionTargets.length')==0)
 check('Target removal returns resource to unlimited production policy',remove)
 def chain():
  resource('bread');page.locator('.chain-card [data-op-resource="flour"]').click();require(page.locator('#opResource').input_value()=='flour');page.locator('.chain-card [data-op-resource="grain"]').click();require(page.locator('#opResource').input_value()=='grain')
 check('Bread to flour to grain chain navigation follows actual recipe links',chain)
 def locate():page.locator('.chain-card [data-focus]').first.click();require(page.locator('.workshop-card').count()>0)
 check('Production chain locate focuses the live workyard on the map',locate)
 def scope():
  reset(True);resource('grain');page.locator('#productionHigh').fill('30');page.locator('#productionLow').fill('5');page.locator('[data-operation="production"]').click();page.locator('#sectorSelect').select_option('1');require(page.locator('#productionHigh').input_value()=='20');page.locator('#sectorSelect').select_option('0');require(page.locator('#productionHigh').input_value()=='30')
 check('Switching region resets form defaults without leaking previous region values',scope)
 def supply():
  resource('plank');ids=ev('S7App.game.warehouses(0).map(h=>h.id)');page.locator('#supplyFrom').select_option(ids[0]);page.locator('#supplyTo').select_option(ids[1]);page.locator('#supplyTarget').fill('10');page.locator('#supplyReserve').fill('6');page.locator('[data-operation="supply"]').click();require(ev('S7App.game.s.operations.supplyRules.length')==1);require(page.locator('.supply-card').count()==1)
 check('Supply rule form creates directed target with source reserve',supply)
 def deliver():tick(120);require(ev("S7App.game.warehouses(0,1)[0].stock.plank")>=10);require(ev('S7App.game.audit().ok'))
 check('Supply policy actually moves goods through warehouse carrier jobs',deliver)
 def disable():page.locator('.supply-card [data-act="supplyToggle"]').click();require(not ev('S7App.game.s.operations.supplyRules[0].enabled'));page.locator('.supply-card [data-act="supplyToggle"]').click();require(ev('S7App.game.s.operations.supplyRules[0].enabled'))
 check('Supply disable and resume buttons use the persisted rule',disable)
 def cycle():
  ids=ev('S7App.game.warehouses(0).map(h=>h.id)');page.locator('#supplyFrom').select_option(ids[1]);page.locator('#supplyTo').select_option(ids[0]);before=ev('S7App.game.serialize()');page.locator('[data-operation="supply"]').click();require(before==ev('S7App.game.serialize()'));require('순환' in page.locator('#toast').inner_text())
 check('Reverse supply cycle is rejected with visible reason',cycle)
 def bulk():
  reset(True);tab('trade');page.locator('#transferQty').fill('10');page.locator('[data-transfer]').click();require(ev("S7App.game.s.jobs.filter(j=>j.kind==='relay').reduce((n,j)=>n+j.qty,0)")==10);tick(100);require(ev('S7App.game.warehouses(0,1)[0].stock.plank')==10);require(ev('S7App.game.audit().ok'))
 check('Manual quantity ten creates multiple trips and actual deliveries',bulk)
 def large_fail():
  page.locator('#transferQty').fill('100');before=ev('S7App.game.serialize()');page.locator('[data-transfer]').click();require(ev('S7App.game.serialize()')==before);require('부족' in page.locator('#toast').inner_text())
 check('Insufficient full quantity does not create partial shipment order',large_fail)
 def help_pause():
  ev('S7App.paused=true');page.locator('#help').click();page.locator('#continueGame').click();require(ev('S7App.paused'));ev('S7App.paused=false');page.locator('#help').click();page.locator('#continueGame').click();require(not ev('S7App.paused'));ev('S7App.paused=true')
 check('Help preserves both paused and running state on return',help_pause)
 def new_cancel():
  before=ev('S7App.game.serialize()');page.locator('#help').click();page.once('dialog',lambda d:d.dismiss());page.locator('#startGame').click();require(ev('S7App.game.serialize()')==before);page.locator('#continueGame').click()
 check('Cancelled new-game confirmation preserves current kingdom',new_cancel)
 def keys():
  reset();page.locator('#pause').focus();before=ev('S7App.camera.x');ticks=ev('S7App.game.s.tick');page.keyboard.down('KeyD');page.wait_for_timeout(220);page.keyboard.up('KeyD');require(ev('S7App.camera.x')>before);require(ev('S7App.game.s.tick')==ticks)
 check('Keyboard pan moves camera without advancing paused simulation',keys)
 def editing():
  resource('bread');page.locator('#productionHigh').focus();before=ev('S7App.camera');page.keyboard.press('ArrowUp');page.wait_for_timeout(120);require(ev('S7App.camera')==before)
 check('Keyboard input inside numeric field does not pan map',editing)
 def right_click():
  reset();page.locator('[data-build="residence"]').click();count=ev('S7App.game.s.buildings.length');box=page.locator('#world').bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2,button='right');require(ev('S7App.tool') is None);require(ev('S7App.game.s.buildings.length')==count)
 check('Right-click cancels building mode instead of constructing accidentally',right_click)
 def middle_drag():
  page.locator('[data-build="residence"]').click();box=page.locator('#world').bounding_box();x=box['x']+box['width']*.6;y=box['y']+box['height']*.6;before=ev('S7App.game.s.buildings.length');camera=ev('S7App.camera.x');page.mouse.move(x,y);page.mouse.down(button='middle');page.mouse.move(x+80,y+25,steps=5);page.mouse.up(button='middle');require(ev('S7App.game.s.buildings.length')==before);require(ev('S7App.camera.x')!=camera);page.keyboard.press('Escape')
 check('Middle-button drag pans without triggering placement',middle_drag)
 def pinch():
  reset();page.locator('[data-build="residence"]').click();box=page.locator('#world').bounding_box();cx=box['x']+box['width']*.55;cy=box['y']+box['height']*.55;old=ev('S7App.camera.zoom');before=ev('S7App.game.s.buildings.length');cdp=page.context.new_cdp_session(page)
  pts=lambda d:[{'x':cx-d,'y':cy,'id':1},{'x':cx+d,'y':cy,'id':2}]
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':pts(35)});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':pts(95)});page.wait_for_timeout(80);require(ev('S7App.camera.zoom')>old);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':pts(95)[:1]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(80);require(ev('S7App.game.s.buildings.length')==before);page.keyboard.press('Escape');cdp.detach()
 check('Two-finger zoom suppresses accidental build when fingers lift separately',pinch)
 def smooth():
  reset();ev('S7App.paused=false');found=False
  for _ in range(25):
   page.wait_for_timeout(25)
   if ev("S7App.game.s.agents.some(a=>{const p=S7App.renderPosition(a.id),q=S7App.game.pos(a);return p&&Math.hypot(p[0]-q[0],p[1]-q[1])>0.001})"):found=True;break
  require(found,'no interpolated frame observed');ev('S7App.paused=true');require(ev('S7App.game.s.agents.every(a=>JSON.stringify(S7App.renderPosition(a.id))===JSON.stringify(S7App.game.pos(a)))'))
 check('Renderer interpolates moving agents and snaps to exact state when paused',smooth)
 def legacy():
  page.locator('#saveFile').set_input_files(str(ROOT/'tests/fixtures/v25_in_transit.json'));page.wait_for_timeout(100);require(ev('S7App.game.s.version')==27);require(ev('S7App.game.s.tick')==180);require(ev('S7App.game.audit().ok'))
 check('File picker migrates actual v25 in-flight save to v27',legacy)
 def export_restore():
  reset(True);resource('grain');page.locator('[data-operation="production"]').click();
  with page.expect_download() as info:page.locator('#exportSave').click()
  info.value.save_as(str(REPORT/'v26_browser_save.json'));doc=json.loads((REPORT/'v26_browser_save.json').read_text());require(doc['format']=='S7-PLAYABLE-27');require(len(doc['state']['operations']['productionTargets'])==1);page.locator('#saveFile').set_input_files(str(REPORT/'v26_browser_save.json'));page.wait_for_timeout(100);require(ev('S7App.game.s.operations.productionTargets.length')==1)
 check('Downloaded save retains policies and is accepted by real file picker',export_restore)
 def corrupt():
  before=ev('S7App.game.serialize()');doc=json.loads(before);doc['state']['operations']['productionTargets'][0]['high']=-2;page.locator('#saveFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});page.wait_for_timeout(100);require(before==ev('S7App.game.serialize()'));require('실패' in page.locator('#toast').inner_text())
 check('Malformed policy save is rejected without overwriting current game',corrupt)
 # screenshots reflect the shipping interface, not a generated illustration
 reset(True);resource('bread');page.locator('[data-operation="production"]').click();ev('S7App.game.advance(70);S7App.paused=true;S7App.focusSector(0);S7App.tab("operations")');page.mouse.move(0,0);page.wait_for_timeout(120);page.screenshot(path=str(REPORT/'v26_desktop.png'))
 def landscape():
  page.set_viewport_size({'width':891,'height':411});page.wait_for_timeout(120);tab('operations');require(ev('document.documentElement.scrollWidth<=innerWidth'));require(ev("document.querySelector('#panel').scrollWidth<=document.querySelector('#panel').clientWidth"));require(page.locator('#productionHigh').is_visible());page.locator('#panelToggle').click();require(page.locator('#world').bounding_box()['width']>800);page.locator('#panelToggle').click()
 check('891x411 landscape operations controls fit and map can expand',landscape)
 page.locator('#panel').evaluate('(e)=>e.scrollTop=0');page.screenshot(path=str(REPORT/'v26_landscape.png'))
 def portrait():
  page.set_viewport_size({'width':412,'height':891});page.wait_for_timeout(120);tab('operations');require(ev('document.documentElement.scrollWidth<=innerWidth'));require(ev("document.querySelector('#panel').scrollWidth<=document.querySelector('#panel').clientWidth"));require(page.locator('#world').bounding_box()['height']>250);require(len(set(round(page.locator('[data-tab]').nth(i).bounding_box()['y']) for i in range(8)))==1)
 check('412x891 portrait operations controls and eight tabs stay within width',portrait)
 page.locator('#panel').evaluate('(e)=>e.scrollTop=0');page.screenshot(path=str(REPORT/'v26_portrait.png'))
 check('No uncaught JavaScript errors across operations and gesture tests',lambda:require(not errors,str(errors)))
 check('Standalone has no external network dependency',lambda:require(not requests,str(requests)))
 browser.close()
out={'method':'Chromium exact standalone loaded with page.set_content; CDP touch gestures, no physical devices; file:// blocked by administrator policy; no persistent browser-origin storage claim','count':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'errors':errors,'results':results}
(REPORT/'v26_browser_tests.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print({k:out[k] for k in ['count','passed','failed']});raise SystemExit(bool(out['failed']))
