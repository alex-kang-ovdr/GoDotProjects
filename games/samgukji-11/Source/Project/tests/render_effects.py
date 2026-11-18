"""Targeted 3D render checks. Uses real engine commands and sampled animation times."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,traceback
R=Path(__file__).resolve().parents[1];out=R/'tests/artifacts';results=[];errors=[]
def check(name,value):
 results.append({'name':name,'passed':bool(value)});print(('PASS ' if value else 'FAIL ')+name,flush=True)
 if not value:raise AssertionError(name)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':1500,'height':960},device_scale_factor=1);page.context.set_offline(True);page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content((R/'PLAY.html').read_text(),wait_until='load',timeout=90000);page.wait_for_function('window.RTK_APP && RTK_APP.renderer.is3D',timeout=90000)
  page.evaluate('RTK_APP.renderer.last=1e20');page.click('#skirmish-game');page.click('#cinema-toggle');page.click('#view-battle')
  page.evaluate('''()=>{const a=RTK_APP,r=a.renderer;r.last=1e20;r.setQuality('high');const u=a.engine.ownUnits()[0],v=a.engine.s.units.find(t=>a.engine.legalTarget(u,t,'attack'));a.act(()=>a.engine.attack(u.id,v.id));const f=r.fx.find(f=>f.type==='battle');r.draw(f.time+1000);}''')
  check('high-quality 3D battle renders with shadow framebuffer',page.evaluate('RTK_APP.renderer.gpu.shadows&&!RTK_APP.renderer.drawError&&RTK_APP.renderer.gpu.gl.getError()===0'))
  page.screenshot(path=str(out/'battle-high-3d.png'),timeout=120000)
  # A legal one-hex move puts the crossbow inside range. Nothing is teleported.
  page.evaluate('''()=>{const a=RTK_APP;a.activate(RTK.Engine.skirmish());const u=a.engine.ownUnits().find(u=>u.type==='crossbow');a.choose('unit',u.id,true);a.act(()=>a.engine.move(u.id,{q:45,r:34}));const v=a.engine.s.units.find(t=>a.engine.legalTarget(u,t,'attack'));a.act(()=>a.engine.attack(u.id,v.id));a.renderer.preset('battle');a.renderer.camera.zoom=1.90;a.renderer.last=1e20;}''')
  check('crossbow moves then resolves ranged attack',page.evaluate('RTK_APP.engine.ownUnits().find(u=>u.type==="crossbow").acted && RTK_APP.engine.validate()'))
  raw=page.evaluate('RTK_APP.engine.serialize()')
  page.evaluate('''()=>{const r=RTK_APP.renderer,f=r.fx.find(f=>f.type==='battle'&&f.troop==='crossbow');r.draw(f.time+480);}''')
  check('volley contains actual 3D projectile instances',page.evaluate('(RTK_APP.renderer.dataBuffers.get("box:3")?.length??0)>=20*12'))
  check('rendering does not mutate authoritative state or RNG',page.evaluate('RTK_APP.engine.serialize()')==raw)
  page.screenshot(path=str(out/'volley-3d.png'),timeout=120000)
  # Quality switches exercise both shadow-enabled and reduced rendering paths.
  for q in ['low','medium','high']:
   page.evaluate('(q)=>{const r=RTK_APP.renderer;r.setQuality(q);r.draw(performance.now());}',q)
   check('quality '+q+' renders without WebGL error',page.evaluate('RTK_APP.renderer.gpu.gl.getError()===0 && !RTK_APP.renderer.drawError'))
  check('no uncaught render errors',not errors);b.close()
except Exception as e:
 print(traceback.format_exc(),flush=True);results.append({'name':'suite completed','passed':False,'detail':str(e)})
finally:
 report={'method':'Chromium SwiftShader; exact offline bundle; real engine commands; animation sampled at stated times','results':results,'passed':sum(x['passed'] for x in results),'total':len(results),'uncaughtErrors':errors}
 (R/'tests/results/render-effects-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('RESULT',report['passed'],report['total'],flush=True)
