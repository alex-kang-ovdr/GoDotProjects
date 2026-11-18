"""Browser integration QA, Chromium + Playwright. Use xvfb-run on headless Linux.
Loads the exact offline bundle using set_content; file:// navigation may be
blocked by enterprise policy and is NOT counted as verified by this suite.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, traceback, time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/artifacts';OUT.mkdir(parents=True,exist_ok=True)
RESULT=ROOT/'tests/results';RESULT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'PLAY.html').read_text();results=[];errors=[]
def check(name,value,detail=''):
 results.append({'name':name,'passed':bool(value),'detail':detail})
 print(('PASS ' if value else 'FAIL ')+name+(' '+str(detail) if detail else ''),flush=True)
 if not value:raise AssertionError(name+str(detail))
def load(page):
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load',timeout=60000)
 page.wait_for_function('window.RTK_APP && RTK_APP.renderer.is3D && RTK_APP.renderer.stats.tiles===6020',timeout=60000)
 page.evaluate('RTK_APP.renderer.setQuality("low");document.getElementById("quality-select").value="low"')
 page.wait_for_timeout(400)
def pick(page,obj):
 p=page.evaluate('(p)=>RTK_APP.renderer.toScreen(p)',obj);box=page.locator('#world').bounding_box();page.mouse.click(box['x']+p['x'],box['y']+p['y']);return p
def snap(page,name,time_=None):
 page.evaluate('(t)=>{const r=RTK_APP.renderer;r.last=1e20;r.draw(t??performance.now());}',time_)
 page.screenshot(path=str(OUT/name),timeout=120000)
 page.evaluate('RTK_APP.renderer.last=0')
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
  context=b.new_context(viewport={'width':1440,'height':950},device_scale_factor=1,accept_downloads=True,offline=True)
  page=context.new_page();load(page)
  check('3D WebGL2 context and first frame',page.evaluate('RTK_APP.renderer.is3D && RTK_APP.renderer.gpu.gl instanceof WebGL2RenderingContext'))
  check('bundle has no external runtime scripts',page.locator('script[src]').count()==0)
  check('expanded map count 6020',page.evaluate('RTK.MAP.tiles.length===6020'))
  check('start screen displayed',page.locator('#start-screen').is_visible());snap(page,'start-3d.png')
  page.click('#start-game');page.wait_for_timeout(500)
  check('campaign started with four cities',page.evaluate('RTK_APP.running && RTK_APP.engine.ownCities().length===4'))
  page.click('[data-action="build-modal"]');page.click('[data-action="build"][data-type="market"]');page.click('#modal-close')
  check('construction works with 3D renderer',page.evaluate('RTK_APP.engine.s.missions.build'))
  page.click('[data-action="recruit"]');check('recruitment preserved',page.evaluate('RTK_APP.engine.s.missions.recruit'))
  page.click('[data-action="deploy-modal"]');page.select_option('#deploy-type','cavalry');page.locator('#deploy-count').evaluate("el=>{el.value='4000';el.dispatchEvent(new Event('input',{bubbles:true}));}");page.fill('#deploy-food','8000');page.click('[data-action="deploy-confirm"]')
  check('new cavalry deployment',page.evaluate('RTK_APP.engine.ownUnits().some(u=>u.type==="cavalry"&&u.troops===4000)'))
  page.evaluate('RTK_APP.choose("unit",RTK_APP.engine.ownUnits()[0].id,true)')
  target=page.evaluate('''()=>{const a=RTK_APP,u=a.engine.ownUnits()[0];return [...a.engine.reachable(u).costs].map(([k,c])=>({q:+k.split(',')[0],r:+k.split(',')[1],c})).filter(t=>t.c>0&&!a.engine.cityAt(t)).find(t=>{const p=a.renderer.toScreen(t);return p.x>100&&p.x<a.renderer.width-80&&p.y>190&&p.y<a.renderer.height-140;})}''')
  check('visible reachable destination found',target is not None)
  pick(page,target);page.wait_for_timeout(1500)
  check('3D raycast movement click',page.evaluate('(p)=>{const u=RTK_APP.engine.ownUnits()[0];return u.q===p.q&&u.r===p.r}',target))
  check('game state valid after build/recruit/deploy/move',page.evaluate('RTK_APP.engine.validate()'))
  page.evaluate('RTK_APP.renderer.setQuality("medium")');page.click('#new-btn');page.click('#skirmish-game');page.wait_for_timeout(500)
  check('training mode 4 friendly / 3 enemy units',page.evaluate('RTK_APP.engine.ownUnits().length===4 && RTK_APP.engine.s.units.length===7'))
  snap(page,'gameplay-3d.png')
  page.evaluate('RTK_APP.renderer.setQuality("low")')
  targets=page.evaluate('''()=>{const e=RTK_APP.engine,u=e.ownUnits()[0],v=e.s.units.find(v=>e.legalTarget(u,v,'attack'));return {u:u.id,v:v.id,q:v.q,r:v.r,troops:v.troops}}''')
  page.click('#actionbar [data-action="mode-attack"]');pick(page,targets);page.evaluate('RTK_APP.renderer.last=1e20')
  check('attack by actual 3D canvas click',page.evaluate('(x)=>RTK_APP.engine.unit(x.u).acted&&RTK_APP.engine.unit(x.v).troops<x.troops',targets))
  check('battle animation record consumed',page.evaluate('RTK_APP.renderer.fx.some(f=>f.type==="battle")'))
  page.click('#view-battle');page.click('#cinema-toggle')
  check('cinema expands map and preserves controls',page.evaluate('document.body.classList.contains("cinema")') and page.locator('#view-battle').is_visible())
  # Keep the real combat effect but sample a deterministic time for the screenshot.
  combat_t=page.evaluate('RTK_APP.renderer.fx.find(f=>f.type==="battle")?.time+1000')
  if combat_t is None or not isinstance(combat_t,(int,float)) or combat_t!=combat_t:
   page.evaluate('''()=>{const a=RTK_APP;a.activate(RTK.Engine.skirmish());const u=a.engine.ownUnits()[0],v=a.engine.s.units.find(v=>a.engine.legalTarget(u,v,'attack'));a.choose('unit',u.id,true);a.act(()=>a.engine.attack(u.id,v.id));a.renderer.preset('battle');}''')
   combat_t=page.evaluate('RTK_APP.renderer.fx.find(f=>f.type==="battle").time+1000')
  snap(page,'combat-3d.png',combat_t)
  yaw=page.evaluate('RTK_APP.renderer.camera.yaw');page.click('#rotate-right');check('camera rotation button',page.evaluate('RTK_APP.renderer.camera.yaw')!=yaw)
  zoom=page.evaluate('RTK_APP.renderer.camera.zoom');page.click('#zoom-out');check('camera zoom button',page.evaluate('RTK_APP.renderer.camera.zoom')<zoom)
  page.click('#grid-btn');check('grid toggle',page.evaluate('RTK_APP.renderer.grid'))
  page.click('#grid-btn');page.click('#view-tactical');page.click('#cinema-toggle')
  check('camera returns to tactical mode',page.evaluate('Math.abs(RTK_APP.renderer.camera.pitch-.94)<.001'))
  # Terrain pick round-trip at unobstructed tiles in the current viewport.
  check('terrain ray picking round trip',page.evaluate('''()=>{const a=RTK_APP,e=a.engine,u=e.ownUnits()[0];let n=0;for(const t of RTK.MAP.tiles){if(RTK.distance(t,u)>3||e.occupant(t)||e.cityAt(t))continue;const s=a.renderer.toScreen(t);if(!s.visible||s.x<10||s.x>a.renderer.width-10||s.y<10||s.y>a.renderer.height-10)continue;const hit=a.renderer.toHex(s.x,s.y);if(hit&&hit.q===t.q&&hit.r===t.r)n++;}return n>=10;}'''))
  page.click('#fit-map');page.wait_for_timeout(300);check('full expanded atlas renders all city centers',page.evaluate('RTK_APP.engine.s.cities.every(c=>RTK_APP.renderer.toScreen(c).visible)'));snap(page,'atlas-3d.png');page.evaluate('RTK_APP.renderer.focus(RTK_APP.engine.ownUnits()[0],.98)')
  raw=page.evaluate('RTK_APP.engine.serialize()');page.locator('#save-file-input').set_input_files({'name':'roundtrip.json','mimeType':'application/json','buffer':raw.encode()});page.wait_for_timeout(400)
  check('JSON file import restores identical state',page.evaluate('RTK_APP.engine.serialize()')==raw)
  old=(ROOT/'reference/v1-example-save.json').read_bytes();page.locator('#save-file-input').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':old});page.wait_for_timeout(400)
  check('v1 JSON import migrates to schema 2',page.evaluate('RTK_APP.engine.s.schema===2 && RTK_APP.engine.validate()'))
  # Resolve any old pending event before ending a turn.
  page.evaluate('''()=>{const a=RTK_APP;while(a.engine.s.eventQueue.length)a.engine.resolveEvent(0);a.activate(a.engine)}''')
  turn=page.evaluate('RTK_APP.engine.s.turn');page.click('#end-turn');page.wait_for_function('(t)=>RTK_APP.engine.s.turn>t',arg=turn,timeout=20000)
  check('AI completes turn on 4x map',page.evaluate('RTK_APP.engine.validate()'))
  check('WebGL has no outstanding errors',page.evaluate('RTK_APP.renderer.gpu.gl.getError()===0'))
  check('renderer reports no JS error',page.evaluate('!RTK_APP.renderer.drawError'))
  # Separate mobile layout / software WebGL browser, no physical-device claim.
  mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844});load(mobile);mobile.click('#skirmish-game');mobile.wait_for_timeout(400)
  check('mobile viewport has no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('mobile camera and action controls visible',mobile.locator('#view-battle').is_visible() and mobile.locator('#actionbar').is_visible())
  snap(mobile,'mobile-3d.png');mobile.close()
  # Simulate unsupported GPU, verifying the explicitly labelled 2D fallback.
  fallback=context.new_page();fallback.evaluate('''()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args)}}''');fallback.set_content(html,wait_until='load');fallback.click('#start-game')
  check('WebGL-unavailable fallback remains playable',fallback.evaluate('RTK_APP.running && RTK_APP.renderer.is3D===false && RTK_APP.engine.validate()'))
  check('fallback is explicitly labelled', '2D' in fallback.locator('#render-status').inner_text())
  fallback.close();check('no uncaught browser errors',len(errors)==0,errors)
  b.close()
except Exception as e:
 print(traceback.format_exc(),flush=True)
 results.append({'name':'suite completed','passed':False,'detail':str(e)})
finally:
 report={'method':'Playwright set_content of exact PLAY.html; offline; Chromium WebGL2 SwiftShader with Xvfb; no direct file navigation verification','results':results,'passed':sum(x['passed'] for x in results),'total':len(results),'uncaughtErrors':errors}
 (RESULT/'browser-3d-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('RESULT',report['passed'],report['total'],flush=True)
