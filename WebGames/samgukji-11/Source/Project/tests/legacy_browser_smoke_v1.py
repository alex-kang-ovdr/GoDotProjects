"""Optional browser QA. Requires Python Playwright + a local Chromium.
This uses set_content on the bundled HTML, so no network or navigation is needed.
The environment may block file:// / localhost navigation; that is NOT counted
as direct-file or local-server launch verification.
"""
from pathlib import Path
import json, os, shutil, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests'/'artifacts'; OUT.mkdir(exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="css/style.css">','<style>'+(ROOT/'css/style.css').read_text(encoding='utf-8')+'</style>')
for name in ['data','engine','renderer','ui']:
 html=html.replace(f'<script src="js/{name}.js"></script>','<script>'+(ROOT/f'js/{name}.js').read_text(encoding='utf-8')+'</script>')
results=[]
def record(name,ok=True,detail=''):
 results.append({'name':name,'passed':bool(ok),'detail':detail})
 assert ok, name+': '+detail
with sync_playwright() as p:
 exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
 b=p.chromium.launch(headless=True,**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1000},accept_downloads=True)
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content(html,wait_until='load')
 record('start screen',page.locator('#start-screen').is_visible())
 page.screenshot(path=str(OUT/'start.png'))
 page.click('#start-game');page.wait_for_timeout(400)
 record('campaign started',page.evaluate('RTK_APP.running && RTK_APP.engine.ownCities().length===4'))
 record('no external scripts',page.locator('script[src]').count()==0)
 # Real UI path: build -> recruit -> deploy.
 home=page.evaluate('RTK_APP.selected.id')
 page.click('[data-action="build-modal"]');page.click('[data-action="build"][data-type="market"]')
 record('construction via dialog',page.evaluate('(id)=>RTK_APP.engine.city(id).buildings.some(b=>b.slot===6&&b.type==="market")',home))
 page.click('#modal-close');page.click('[data-action="recruit"]')
 record('recruit via city button',page.evaluate('RTK_APP.engine.s.missions.recruit'))
 page.click('[data-action="deploy-modal"]');page.select_option('#deploy-type','cavalry')
 page.locator('#deploy-count').evaluate("el=>{el.value='4000';el.dispatchEvent(new Event('input',{bubbles:true}));}")
 page.fill('#deploy-food','8000');page.click('[data-action="deploy-confirm"]')
 record('deployment via controls',page.evaluate('RTK_APP.engine.ownUnits().length===2 && RTK_APP.engine.ownUnits().some(u=>u.type==="cavalry"&&u.troops===4000)'))
 page.click('[data-action="select"][data-kind="unit"][data-id="u1"]')
 # Click a real canvas coordinate; no direct state mutation.
 target=page.evaluate('''()=>{const a=RTK_APP,e=a.engine,u=e.unit('u1'),v=e.ownUnits('bandit')[0];
 const p=[...e.reachable(u).costs].map(([k,cost])=>({q:+k.split(',')[0],r:+k.split(',')[1],cost})).filter(p=>p.cost>0&&RTK.distance(p,v)===1).sort((a,b)=>a.cost-b.cost)[0];
 return p?{...p,screen:a.renderer.toScreen(p)}:null;}''')
 record('enemy approachable in one turn',target is not None)
 bb=page.locator('#world').bounding_box();page.mouse.click(bb['x']+target['screen']['x'],bb['y']+target['screen']['y'])
 record('canvas movement',page.evaluate('(p)=>{const u=RTK_APP.engine.unit("u1");return u.q===p.q&&u.r===p.r;}',target))
 page.click('#actionbar [data-action="mode-tactic"]');page.select_option('#tactic-select','spiral')
 enemy=page.evaluate('RTK_APP.renderer.toScreen(RTK_APP.engine.ownUnits("bandit")[0])')
 page.mouse.move(bb['x']+enemy['x'],bb['y']+enemy['y']);page.wait_for_timeout(500)
 record('damage preview tooltip',page.locator('#map-tooltip').is_visible())
 page.screenshot(path=str(OUT/'combat-preview.png'))
 page.mouse.click(bb['x']+enemy['x'],bb['y']+enemy['y'])
 record('tactic execution from canvas',page.evaluate('RTK_APP.engine.unit("u1").acted && RTK_APP.engine.unit("u1").energy===65'))
 for _ in range(3):page.click('#end-turn');page.wait_for_function('!document.getElementById("busy").hidden===false');page.wait_for_timeout(80)
 record('story event queued',page.locator('[data-action="event-choice"]').count()>0)
 page.click('[data-action="event-choice"][data-index="2"]')
 record('event choice resolution',page.evaluate('RTK_APP.engine.s.eventDone.includes("relief")'))
 page.click('#research-btn');page.click('[data-action="research"][data-type="infantry"]')
 record('research started via dialog',page.evaluate('RTK_APP.engine.s.factions.cao.research?.type==="infantry"'))
 page.click('#modal-close');page.click('#diplomacy-btn');page.click('[data-action="truce"][data-id="dong"]')
 record('truce via diplomacy',page.evaluate('!RTK_APP.engine.enemy("cao","dong")'))
 page.click('#modal-close');page.click('#codex-btn');page.fill('#officer-search','조운')
 record('officer catalogue search',page.locator('#officer-rows tr').count()==1)
 record('sourced officer in catalogue','96' in page.locator('#officer-rows').inner_text())
 page.click('#modal-close')
 with page.expect_download() as dl:page.click('#export-btn')
 save=OUT/'browser-save.json';dl.value.save_as(str(save))
 record('JSON export',json.loads(save.read_text())['magic']=='RTK11_WEB_SAVE')
 before=page.evaluate('RTK_APP.engine.s.turn');page.click('#end-turn');page.wait_for_timeout(400)
 page.locator('#save-file-input').set_input_files(str(save));page.wait_for_timeout(250)
 record('JSON import restores turn',page.evaluate('RTK_APP.engine.s.turn')==before)
 record('save invariants after import',page.evaluate('RTK_APP.engine.validate()'))
 page.evaluate('RTK_APP.choose("city",RTK_DATA.factions[0].capital,true)');page.wait_for_timeout(250)
 page.screenshot(path=str(OUT/'gameplay.png'))
 record('no browser JS errors',not errors,'; '.join(errors))
 # Layout regressions / independent starts. These do not assert device-native testing.
 for width,height,which in [(1280,800,'liu'),(1920,1080,'sun'),(390,844,'cao')]:
  pg=b.new_page(viewport={'width':width,'height':height},has_touch=width<500)
  errs=[];pg.on('pageerror',lambda err:errs.append(str(err)))
  pg.set_content(html);pg.click(f'[data-action="start-faction"][data-id="{which}"]');pg.click('#start-game');pg.wait_for_timeout(250)
  record(f'layout {width} start',pg.evaluate('RTK_APP.running'))
  record(f'layout {width} no page overflow',pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width<500:
   pg.click('#menu-btn');pg.click('[data-action="menu-research"]')
   record('mobile research accessible',pg.locator('[data-action="research"]').count()==5)
   pg.click('#modal-close')
   pg.evaluate('RTK_APP.choose("unit",RTK_APP.engine.ownUnits()[0].id,true)')
   pg.click('[data-action="unit-info"]')
   record('mobile unit inspector accessible',pg.locator('#inspector').evaluate('el=>el.classList.contains("mobile-open")'))
   pg.wait_for_timeout(300)
   record('mobile inspector inside viewport',pg.locator('#inspector').evaluate('el=>el.getBoundingClientRect().right<=innerWidth+1'))
  pg.screenshot(path=str(OUT/f'viewport-{width}.png'))
  record(f'layout {width} no JS errors',not errs,'; '.join(errs));pg.close()
 b.close()
report={'method':'Chromium headless; bundled HTML via set_content; no external requests; direct file/localhost navigation blocked by environment policy, not verified','results':results,'passed':sum(x['passed'] for x in results),'total':len(results)}
(OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
