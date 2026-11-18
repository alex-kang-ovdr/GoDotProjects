"""Dual-view regression, exact offline HTML injected with Playwright set_content.
Run on Linux: xvfb-run -a python tests/browser_dualmode.py
Playwright and Chromium are development-only, not runtime dependencies.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, traceback, os
R=Path(__file__).resolve().parents[1]
OUT=R/'tests/artifacts';OUT.mkdir(exist_ok=True,parents=True)
RES=R/'tests/results';RES.mkdir(exist_ok=True,parents=True)
HTML=(R/'PLAY.html').read_text();results=[];errors=[]
def check(name,ok,detail=None):
 row={'name':name,'passed':bool(ok)}
 if detail is not None:row['detail']=detail
 results.append(row);print(('PASS ' if ok else 'FAIL ')+name,detail if detail is not None else '',flush=True)
 if not ok:raise AssertionError(name)
def load(page,mode=None,block=False,storage=False):
 page.on('pageerror',lambda e:errors.append(str(e)))
 if storage:
  page.evaluate('''(mode)=>{const data={};if(mode)data['rtk11-view-preferences-v3']=JSON.stringify({mode});Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k],clear:()=>Object.keys(data).forEach(k=>delete data[k])}});window.__testStorage=data;}''',mode)
 if block:
  page.evaluate('''()=>{const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')return null;return fn.call(this,type,...args);};}''')
 page.set_content(HTML,wait_until='load',timeout=60000)
 page.wait_for_function('window.RTK_APP && RTK_APP.renderer.stats.tiles===6020',timeout=60000)
 page.evaluate('RTK_APP.renderer.setQuality("low")')
def snap(page,name):
 page.evaluate('''()=>{const r=RTK_APP.renderer;document.getElementById('toast').hidden=true;r.last=1e20;r.draw(performance.now());}''')
 page.screenshot(path=str(OUT/name),timeout=60000)
 page.evaluate('RTK_APP.renderer.last=0')
def pick(page,tile):
 at=page.evaluate('(p)=>RTK_APP.renderer.toScreen(p)',tile);box=page.locator('#world').bounding_box();page.mouse.click(box['x']+at['x'],box['y']+at['y'])
def state(page):return page.evaluate('RTK_APP.engine.serialize()')
def training(page):
 page.evaluate('''()=>{const a=RTK_APP;a.activate(RTK.Engine.skirmish());a.choose('unit',a.engine.ownUnits()[0].id,true);}''')
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
  ctx=browser.new_context(viewport={'width':1440,'height':950},device_scale_factor=1,offline=True,accept_downloads=True)
  page=ctx.new_page();load(page)
  check('actual WebGL2 context initialized',page.evaluate('RTK_APP.renderer.is3D && RTK_APP.renderer.gpu.gl instanceof WebGL2RenderingContext'))
  check('no CDN or external runtime scripts in standalone',page.locator('script[src]').count()==0)
  page.click('#start-mode-2d')
  check('2D selection works before starting game',page.evaluate('RTK_APP.renderer.viewMode==="2d" && !RTK_APP.running'))
  check('only one mode button is pressed per group',page.locator('.view-panel [data-view-mode][aria-pressed="true"]').count()==1 and page.locator('.start-view-choice [aria-pressed="true"]').count()==1)
  check('actual Canvas2D context used, not flat 3D camera',page.evaluate('RTK_APP.renderer.ctx instanceof CanvasRenderingContext2D && RTK_APP.renderer.is3D===false'))
  page.click('#skirmish-game')
  check('training starts in chosen 2D mode',page.evaluate('RTK_APP.running && RTK_APP.renderer.viewMode==="2d" && RTK_APP.engine.s.units.length===7'))
  check('2D has full expanded map',page.evaluate('RTK_APP.renderer.stats.tiles===6020 && RTK_APP.engine.s.cities.length===42'))
  raw=state(page);selection=page.evaluate('RTK_APP.selected')
  page.evaluate('window.__input=RTK_APP.renderer.input;window.__two=RTK_APP.renderer.active;window.__engine=RTK_APP.engine;window.__anchor=RTK_APP.renderer.captureView()')
  page.click('#mode-3d');page.wait_for_timeout(150)
  check('2D -> 3D keeps same Engine identity and serialized state',page.evaluate('RTK_APP.engine===window.__engine') and state(page)==raw)
  check('selection survives 2D -> 3D',page.evaluate('RTK_APP.selected')==selection)
  check('camera center and scale transfer without jumping to capital',page.evaluate('''()=>{const b=__anchor,a=RTK_APP.renderer.captureView();return Math.abs(a.x-b.x)<1e-8&&Math.abs(a.y-b.y)<1e-8&&Math.abs(a.scale-b.scale)<1e-8;}'''))
  check('stable input element across renderer changes',page.evaluate('document.getElementById("world")===__input'))
  check('old 2D loop stopped',page.evaluate('!__two.active && __two.frame===0 && __two.canvas.hidden'))
  page.evaluate('window.__three=RTK_APP.renderer.active;RTK_APP.renderer.camera.yaw=.91;RTK_APP.renderer.camera.pitch=.73;RTK_APP.renderer.updateCamera();window.__anchor=RTK_APP.renderer.captureView()')
  page.click('#grid-btn');page.click('#actionbar [data-action="mode-tactic"]');page.select_option('#tactic-select',index=0)
  tactic=page.locator('#tactic-select').input_value();raw=state(page)
  page.click('#mode-2d')
  check('3D -> 2D preserves game and RNG',state(page)==raw)
  check('pending tactic, selection and grid survive switch',page.evaluate('RTK_APP.renderer.mode==="tactic" && RTK_APP.renderer.grid') and page.locator('#tactic-select').input_value()==tactic and page.evaluate('RTK_APP.selected')==selection)
  count=page.evaluate('__three.drawCount');page.wait_for_timeout(250)
  check('hidden 3D renderer makes no new draw calls',page.evaluate('__three.drawCount')==count and page.evaluate('__three.frame===0 && !__three.active'))
  page.keyboard.press('b');page.wait_for_timeout(80)
  check('B keyboard toggles to 3D',page.evaluate('RTK_APP.renderer.viewMode==="3d"'))
  check('3D camera yaw/pitch restored and GPU instance reused',page.evaluate('RTK_APP.renderer.active===__three && Math.abs(__three.camera.yaw-.91)<1e-9 && Math.abs(__three.camera.pitch-.73)<1e-9'))
  page.keyboard.press('b')
  check('B keyboard toggles back to 2D',page.evaluate('RTK_APP.renderer.viewMode==="2d" && RTK_APP.renderer.active===__two'))
  raw=state(page)
  ok=page.evaluate('''()=>{const a=RTK_APP,selected=JSON.stringify(a.selected);for(let i=0;i<40;i++)a.renderer.switchMode(i%2?'2d':'3d');return a.renderer.views['2d']===__two&&a.renderer.views['3d']===__three&&document.querySelectorAll('.world-layer').length===2&&document.querySelectorAll('#world-labels').length===1&&JSON.stringify(a.selected)===selected;}''')
  check('40 repeated switches reuse 2 renderers and 1 label canvas',ok and state(page)==raw)
  check('inactive 3D controls disabled while 2D remains playable',page.locator('#quality-select').is_disabled() and not page.locator('#mode-3d').is_disabled())
  # Real UI movement in 2D, then immediately transfer the effect timeline.
  page.click('#actionbar [data-action="mode-move"]')
  target=page.evaluate('''()=>{const a=RTK_APP,u=a.engine.unit(a.selected.id);return [...a.engine.reachable(u).costs].map(([k,c])=>({q:+k.split(',')[0],r:+k.split(',')[1],c})).filter(t=>t.c>0&&!a.engine.cityAt(t)).find(t=>{const p=a.renderer.toScreen(t);return p.x>100&&p.x<a.renderer.width-100&&p.y>200&&p.y<a.renderer.height-120;});}''')
  check('visible legal 2D move destination found',bool(target));pick(page,target)
  check('2D canvas click moves selected unit',page.evaluate('(t)=>{const u=RTK_APP.engine.unit(RTK_APP.selected.id);return u.q===t.q&&u.r===t.r;}',target))
  page.evaluate('window.__move=RTK_APP.renderer.moves.get(RTK_APP.selected.id);window.__moveTime=__move?.time')
  raw=state(page);page.click('#mode-3d')
  check('moving unit transfers without repeating move or action cost',state(page)==raw)
  check('movement animation retains its original timestamp and path',page.evaluate('''()=>{const m=RTK_APP.renderer.moves.get(RTK_APP.selected.id);return m&&m.time===__moveTime&&JSON.stringify(m.path)===JSON.stringify(__move.path);}'''))
  # Canvas2D accepts battle effects (v2 fallback could not consume this event type).
  training(page);page.click('#mode-2d');page.click('#view-tactical')
  target=page.evaluate('''()=>{const e=RTK_APP.engine,u=e.unit(RTK_APP.selected.id),v=e.s.units.find(v=>e.legalTarget(u,v,'attack'));return {...v,attacker:u.id};}''')
  page.click('#actionbar [data-action="mode-attack"]');pick(page,target)
  check('2D attack click causes damage and marks action done',page.evaluate('(v)=>RTK_APP.engine.unit(v.id).troops<v.troops&&RTK_APP.engine.unit(v.attacker).acted',target))
  check('2D battle effect record created without undefined at error',page.evaluate('RTK_APP.renderer.fx.some(f=>f.type==="battle")'))
  page.evaluate('window.__battleTime=RTK_APP.renderer.fx.find(f=>f.type==="battle").time')
  raw=state(page);page.click('#mode-3d')
  check('switch during combat does not apply damage twice',state(page)==raw)
  check('combat effect keeps timestamp across switch',page.evaluate('RTK_APP.renderer.fx.some(f=>f.type==="battle"&&f.time===__battleTime)'))
  # Same seeded command sequence in both views must give byte-identical game JSON.
  same=page.evaluate('''()=>{const a=RTK_APP,raw=RTK.Engine.skirmish().serialize(),outputs=[];for(const view of ['2d','3d']){a.activate(RTK.Engine.load(raw));a.renderer.switchMode(view);const u=a.engine.ownUnits()[0],v=a.engine.s.units.find(v=>a.engine.legalTarget(u,v,'attack'));a.choose('unit',u.id,true);a.act(()=>a.engine.attack(u.id,v.id));outputs.push(a.engine.serialize());}return outputs[0]===outputs[1];}''')
  check('same seed and command produces identical 2D and 3D save JSON',same)
  # Canvas click attack in actual 3D after many switches.
  training(page)
  target=page.evaluate('''()=>{const e=RTK_APP.engine,u=e.unit(RTK_APP.selected.id),v=e.s.units.find(v=>e.legalTarget(u,v,'attack'));return {...v,attacker:u.id};}''')
  page.click('#actionbar [data-action="mode-attack"]');pick(page,target)
  check('3D raycast attack still works after switches',page.evaluate('(v)=>RTK_APP.engine.unit(v.id).troops<v.troops&&RTK_APP.engine.unit(v.attacker).acted',target))
  # Full-map fitting was limited by the old fallback's v1 minimum zoom.
  page.click('#mode-2d');page.evaluate('RTK_APP.renderer.fit()')
  check('2D full-map fit includes all 42 cities',page.evaluate('''()=>{const a=RTK_APP,r=a.renderer;return a.engine.s.cities.every(c=>{const p=r.toScreen(c);return p.x>=0&&p.y>=0&&p.x<=r.width&&p.y<=r.height;});}'''))
  snap(page,'dual-full-map-2d.png')
  # UI import uses the same game schema in each mode.
  raw=state(page)
  page.locator('#save-file-input').set_input_files({'name':'roundtrip-v2.json','mimeType':'application/json','buffer':raw.encode()})
  check('v2 JSON import preserves game and chosen 2D mode',state(page)==raw and page.evaluate('RTK_APP.renderer.viewMode==="2d"'))
  page.click('#mode-3d')
  page.locator('#save-file-input').set_input_files({'name':'roundtrip-v2.json','mimeType':'application/json','buffer':raw.encode()})
  check('same JSON imports unchanged in 3D mode',state(page)==raw and page.evaluate('RTK_APP.renderer.viewMode==="3d"'))
  page.locator('#save-file-input').set_input_files({'name':'v1.json','mimeType':'application/json','buffer':(R/'reference/v1-example-save.json').read_bytes()})
  check('legacy v1 saves still migrate and validate',page.evaluate('RTK_APP.engine.s.schema===2 && RTK_APP.engine.validate()'))
  # Export via actual browser download event; bytes are the shared Engine state.
  raw=state(page)
  with page.expect_download() as download_info:page.click('#export-btn')
  download=download_info.value;download.save_as(RES/'export-roundtrip.json')
  check('downloaded JSON is identical to current game', (RES/'export-roundtrip.json').read_text()==raw)
  for view in ['2d','3d']:
   training(page);page.evaluate('(view)=>RTK_APP.renderer.switchMode(view)',view)
   turn=page.evaluate('RTK_APP.engine.s.turn');page.click('#end-turn');page.wait_for_function('(t)=>RTK_APP.engine.s.turn>t',arg=turn,timeout=20000)
   check('AI turn and shared game remain valid in '+view,page.evaluate('RTK_APP.engine.validate()'))
  # Comparable real render captures from the same game, no image-generation assets.
  training(page);page.evaluate('RTK_APP.renderer.preset("tactical");RTK_APP.renderer.setQuality("medium");RTK_APP.renderer.camera.yaw=.22;RTK_APP.renderer.updateCamera()')
  snap(page,'dual-gameplay-3d.png');raw=state(page);page.click('#mode-2d');snap(page,'dual-gameplay-2d.png')
  check('paired 2D/3D screenshots share identical state',state(page)==raw)
  page.click('#help-btn');before=page.evaluate('RTK_APP.renderer.viewMode');page.keyboard.press('b')
  check('mode shortcut does not interfere with open modal',page.evaluate('RTK_APP.renderer.viewMode')==before);page.click('#modal-close')
  # Mobile viewport: both choices visible and switching must not overflow layout.
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
  check('mobile 390px viewport has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('both mode buttons visible on mobile',page.locator('#mode-2d').is_visible() and page.locator('#mode-3d').is_visible())
  page.click('#mode-3d');page.wait_for_timeout(100);check('mobile toggle reaches real 3D',page.evaluate('RTK_APP.renderer.is3D'))
  page.click('#mode-2d');page.click('#view-tactical');snap(page,'dual-mobile-2d.png')
  check('mobile toggle returns to real 2D',page.evaluate('!RTK_APP.renderer.is3D && RTK_APP.renderer.ctx instanceof CanvasRenderingContext2D'))
  # GPU loss: explicitly invoke the WebGL extension, not an Engine modification.
  page.set_viewport_size({'width':1440,'height':950});page.click('#mode-3d');page.wait_for_timeout(100)
  raw=state(page)
  available=page.evaluate('''()=>{const ext=RTK_APP.renderer.gpu.gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;}''')
  check('software GPU supports context-loss test',available)
  page.wait_for_function('RTK_APP.renderer.viewMode==="2d" && !!RTK_APP.renderer.unavailable3D',timeout=10000)
  check('GPU loss auto-falls back without changing game',state(page)==raw and page.evaluate('RTK_APP.engine.validate()'))
  check('fallback labels unavailable 3D and disables only 3D choice',page.locator('#mode-3d').is_disabled() and not page.locator('#mode-2d').is_disabled() and 'GPU' in page.locator('#render-status').inner_text())
  page.close()
  # No-GPU startup, real 2D play and UI turn processing.
  fallback=ctx.new_page();load(fallback,block=True)
  check('unavailable WebGL starts usable 2D without JS errors',fallback.evaluate('RTK_APP.renderer.viewMode==="2d" && Object.keys(RTK_APP.renderer.views).length===1'))
  fallback.click('#skirmish-game');fallback.click('#end-turn');fallback.wait_for_function('RTK_APP.engine.s.turn>0')
  check('AI turn works without a WebGL context',fallback.evaluate('RTK_APP.engine.validate()'));fallback.close()
  # A memory Storage double verifies preference logic only. No claim of real disk persistence.
  pref=ctx.new_page();load(pref,mode='2d',storage=True)
  check('saved 2D preference starts without allocating GPU',pref.evaluate('RTK_APP.renderer.viewMode==="2d" && !RTK_APP.renderer.views["3d"]'))
  pref.click('#start-mode-3d');check('3D initializes lazily from 2D preference',pref.evaluate('RTK_APP.renderer.is3D && !!RTK_APP.renderer.views["3d"]'))
  check('mode preference stored independently of game state',pref.evaluate('JSON.parse(localStorage.getItem(RTKViews.PREF_KEY)).mode==="3d" && !RTK_APP.engine.s.viewMode'))
  pref.click('#start-mode-2d');pref.evaluate('RTK_APP.renderer.dispose()');pref.set_content(HTML,wait_until='load');pref.wait_for_function('window.RTK_APP && RTK_APP.renderer.stats.tiles===6020')
  check('stored preference restored on app reinitialization (Storage double)',pref.evaluate('RTK_APP.renderer.viewMode==="2d" && !RTK_APP.renderer.views["3d"]'))
  pref.evaluate('RTK_APP.renderer.dispose()');check('dispose releases canvases and render loops',pref.evaluate('document.querySelectorAll(".world-layer").length===0 && document.querySelectorAll("#world-labels").length===0'));pref.close()
  check('no uncaught JavaScript exceptions across scenarios',not errors,errors)
  browser.close()
except Exception as exc:
 print(traceback.format_exc(),flush=True);results.append({'name':'suite completed','passed':False,'detail':str(exc)})
finally:
 report={'method':'Exact PLAY.html via set_content; offline Chromium under Xvfb; SwiftShader software WebGL2. Storage preference tests use a memory Storage double. file:// navigation is blocked by environment policy.','passed':sum(x['passed'] for x in results),'total':len(results),'results':results,'uncaughtErrors':errors}
 (RES/'browser-dualmode-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('RESULT',report['passed'],'/',report['total'],flush=True)
 if report['passed']!=report['total']:raise SystemExit(1)
