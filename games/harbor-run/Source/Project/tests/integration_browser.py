"""Integration regression of the actual WebGL game. Uses in-memory HTML for restricted CI.
No network access and no storage mocking. A real origin/storage/device test remains separate.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os,traceback
ROOT=Path(__file__).resolve().parents[1]
results=[];errors=[];console_errors=[]
def check(name,ok,detail=None):
 results.append({'name':name,'pass':bool(ok),'detail':detail})
 print(('PASS ' if ok else 'FAIL ')+name, str(detail)[:240] if detail is not None else '',flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=gl-egl','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
 page.set_content((ROOT/'index.html').read_text(),wait_until='load')
 page.wait_for_timeout(400)
 check('WebGL initialization and title rendered',page.evaluate('!!window.HARBOR && HARBOR.render.frames>0'))
 page.locator('#startMission').click()
 page.wait_for_timeout(120)
 page.evaluate("HARBOR.manualTesting=true;HARBOR.render.quality='low';HARBOR.hadLock=false")
 ev=page.evaluate
 def reset(mode='free'):
  ev("""mode=>{const g=HARBOR;g.manualTesting=true;g.hadLock=false;g.reset(mode,false);g.started=true;g.running=true;g.mode='play';g.closeOverlays();document.getElementById('startScreen').hidden=true;document.getElementById('hud').hidden=false;g.cheats.god=true;g.render.quality='low';g.updateCamera(1,true);}""",mode)
 def step(n=1):return ev('n=>HARBOR_TEST.step(n)',n)
 def state():return ev('HARBOR_TEST.state()')
 try:
  check('Mission starts through visible button',state()['phase']=='reach')
  reset();p0=state()['player']['pos'];page.keyboard.down('w');s=step(60);page.keyboard.up('w')
  check('W moves camera-forward (negative Z at yaw zero)',s['player']['pos'][2]<p0[2]-3 and abs(s['player']['pos'][0]-p0[0])<.05,s['player']['pos'])
  reset();page.keyboard.down('d');s=step(60);page.keyboard.up('d');check('D moves screen-right, not reversed',s['player']['pos'][0]>-103,s['player']['pos'])
  reset();floor0=state()['player']['pos'][1];page.keyboard.press('Space');s=step(10);check('Jump leaves ground',s['player']['pos'][1]>floor0+.4,s['player']['pos']);s=step(80);check('Jump returns to the visible pavement height without sinking',abs(s['player']['pos'][1]-floor0)<.001,{'floor':floor0,'landed':s['player']['pos'][1]})
  reset();ev('HARBOR_TEST.position([-108,0,114],Math.PI)');page.keyboard.down('w');s=step(90);page.keyboard.up('w');check('Character is blocked by garage wall',s['player']['pos'][2]<117.25,s['player']['pos'])
  reset();page.keyboard.press('e');s=step(52);check('E enters starter car through seat transaction',s['player']['carId']=='starter' and [c for c in s['cars'] if c['id']=='starter'][0]['occupant']=='player',s['player'])
  ammo=s['weapon']['ammo'];check('Shooting rejected while driving',ev('HARBOR_TEST.fire()') is False and state()['weapon']['ammo']==ammo)
  page.keyboard.down('w');s=step(90);page.keyboard.up('w');c=[c for c in s['cars'] if c['id']=='starter'][0];check('Throttle accelerates and drives car',c['speed']>10 and c['z']<80,c)
  ev('HARBOR.activeCar().speed=10');page.keyboard.press('e');check('Exit rejected while car is moving',state()['player']['transition'] is None)
  ev('HARBOR.activeCar().speed=0;HARBOR.activeCar().vx=0;HARBOR.activeCar().vz=0');page.keyboard.press('e');s=step(30);check('Stopped car exits and relinquishes seat',s['player']['carId'] is None and [c for c in s['cars'] if c['id']=='starter'][0]['occupant'] is None,s['player'])
  reset();ev('HARBOR_TEST.position([-55,0,65])');page.keyboard.press('q');check('Q acquires nearby low cover',state()['player']['cover']);page.keyboard.press('q');check('Q exits cover',not state()['player']['cover'])
  reset();before=state()['weapon']['ammo'];page.mouse.down();s=step(30);page.mouse.up();check('Held automatic fire consumes multiple rounds',s['weapon']['ammo']<before-2,{'before':before,'after':s['weapon']['ammo']})
  reload_total=s['weapon']['ammo']+s['weapon']['reserve'];page.keyboard.press('r');check('R starts reload',state()['weapon']['reloading']);s=step(140);check('Reload fills magazine and conserves total ammunition',s['weapon']['ammo']==30 and s['weapon']['ammo']+s['weapon']['reserve']==reload_total,s['weapon'])
  page.keyboard.press('1');check('Number key switches weapon',state()['player']['weapon']==0)
  reset();ev("HARBOR.npcs=[];const n=HARBOR.spawnNPC('guard',[-104,0,77]);n.shotCD=20;HARBOR.input.aim=true;HARBOR.player.aim=true;HARBOR.updateCamera(1,true);for(let i=0;i<8;i++){HARBOR_TEST.aimAt([-104,1.25,77]);HARBOR.updateCamera(1,true);}")
  for _ in range(6):ev('HARBOR_TEST.fire()');step(8)
  s=state();check('Camera-to-muzzle ray inflicts real NPC damage',s['npcs'][0]['hp']<100,{'hp':s['npcs'][0]['hp'],'hits':s['stats']['hits']});check('Repeated valid hits defeat NPC',s['npcs'][0]['hp']==0,s['npcs'][0])
  # Explicit occlusion fixture: camera has a line around the edge, muzzle is behind it.
  reset();occlusion=ev("""()=>{const g=HARBOR;g.npcs=[];g.player.pos=[-104,0,88];g.player.yaw=0;g.player.aim=true;g.cam.pos=[-103,1.36,92];g.cam.yaw=0;g.cam.pitch=0;const n=g.spawnNPC('guard',[-103,0,80]);n.shotCD=99;const wall={min:[-104.2,0,86.8],max:[-103.4,2.1,87.2]};g.world.boxes.push(wall);const cam=g.trace(g.cam.pos,g.viewDir(),40,true);const before=n.hp,ammo=g.mags[g.player.weapon].ammo;g.shoot();const out={cameraHit:cam.type,hpBefore:before,hpAfter:n.hp,ammoBefore:ammo,ammoAfter:g.mags[g.player.weapon].ammo};g.world.boxes.pop();return out;}""")
  check('Muzzle blocker prevents damage despite camera visibility',occlusion['cameraHit']=='npc' and occlusion['hpBefore']==occlusion['hpAfter'] and occlusion['ammoAfter']==occlusion['ammoBefore']-1,occlusion)
  reset();ev("HARBOR.npcs=[];HARBOR.cars=HARBOR.cars.filter(c=>c.id==='starter'||c.id==='target');HARBOR_TEST.position([-108,0,85]);const cop=HARBOR.spawnNPC('police',[-108,0,75]);cop.shotCD=99;HARBOR.wanted.report('observed-test',2,HARBOR.player.pos);HARBOR.spawnTimer=999;")
  s=step(15);check('Actual police line of sight maintains pursuit',s['wanted']['state']=='pursuit' and len(s['wanted']['observers'])>0,s['wanted'])
  ev('HARBOR_TEST.position([-79,0,42])');s=step(1);check('Cached perception never leaks hidden current position',s['wanted']['lastKnown']!=[-79,0,42],s['wanted']['lastKnown']);s=step(20);check('Building occlusion changes pursuit to search',s['wanted']['state']=='search',s['wanted'])
  ev('HARBOR.npcs=[];HARBOR.spawnTimer=999');s=step(1800);check('Unobserved search expires naturally',s['wanted']['level']==0,s['wanted']);check('Old report cannot reactivate cleared wanted',ev("HARBOR.wanted.report('observed-test',3,HARBOR.player.pos)") is False and state()['wanted']['level']==0)
  reset('mission');ev('HARBOR_TEST.position([102.3,0,-120])');page.keyboard.press('e');s=step(55);check('Target car acquisition advances mission',s['player']['carId']=='target' and s['phase']=='escape',{'player':s['player'],'phase':s['phase']});step(100);check('Visible theft is reported by actual guards',state()['wanted']['level']>=1,state()['wanted'])
  before_count=len(state()['cars']);ev("HARBOR.fail('자동 회귀 테스트')");page.wait_for_timeout(50);ev('HARBOR.hadLock=false;HARBOR.retry();HARBOR.hadLock=false');s=state();check('Checkpoint restores driver and target without duplication',s['player']['carId']=='target' and sum(c['id']=='target' for c in s['cars'])==1,s['player'])
  # Snapshot/restore is exercised on real runtime state; browser persistent-origin storage is not mocked.
  saved=ev('HARBOR.capture()');ev('HARBOR.player.hp=30;HARBOR.player.armor=0');ev('s=>HARBOR.restore(s)',saved);check('Save snapshot restores health, car, mission and inventory',state()['player']['hp']==saved['player']['hp'] and state()['player']['carId']==saved['player']['carId'])
  check('Produced save passes same validation as imports',ev('HarborLogic.validateSave(HARBOR.capture()).version')==1)
  unchanged=state();invalid={**saved,'cars':[]};caught=ev("s=>{try{HARBOR.restore(s);return false}catch(e){return true}}",invalid);check('Invalid save is rejected before mutating runtime',caught and state()['player']==unchanged['player'] and state()['phase']==unchanged['phase'])
  # Delivery gate is tested with intentional world-position setup, not claimed as a human full playthrough.
  ev("HARBOR.running=true;HARBOR.mode='play';HARBOR.closeOverlays();HARBOR.npcs=[];HARBOR.cars=HARBOR.cars.filter(c=>c.id==='starter'||c.id==='target');const c=HARBOR.targetCar();c.x=-108;c.z=104;c.speed=0;HARBOR.player.carId='target';c.seat.occupant='player';HARBOR.player.pos=[-108,0,104];HARBOR.phase='deliver';HARBOR.events=[];HARBOR.wanted.clear();HARBOR.wanted.report('delivery-block',1,HARBOR.player.pos);HARBOR.spawnTimer=999;")
  wallet=state()['wallet'];s=step(80);check('Wanted state blocks delivery reward',s['wallet']==wallet and s['phase']!='complete')
  ev('HARBOR.wanted.clear();HARBOR.events=[];HARBOR.phase="deliver"');s=step(80);check('Stopped target in garage completes mission and grants 750 once',s['phase']=='complete' and s['wallet']==wallet+750 and not s['running'],{'phase':s['phase'],'wallet':s['wallet']})
  page.screenshot(path=str(ROOT/'reports/mission-complete.png'))
  ev('HARBOR.hadLock=false;HARBOR.running=true;HARBOR.mode="play";HARBOR.phase="deliver";HARBOR.closeOverlays();HARBOR.deliveryHold=0');s=step(80);check('Replaying completion event cannot duplicate reward',s['wallet']==wallet+750,s['wallet'])
  reset();ev('HARBOR.pause()');time0=state()['time'];s=step(200);check('Pause freezes simulation and wanted timers',s['time']==time0);ev('HARBOR.hadLock=false;HARBOR.resume();HARBOR.hadLock=false')
  ev('HARBOR.pause("devPanel")');check('Developer panel opens with runtime controls',page.locator('#devPanel').is_visible());ev('HARBOR.dev("refill")');check('Developer refill applies to live game',state()['player']['hp']==100 and state()['weapon']['ammo']==30)
  # Capture an actual combat view (not generated concept art).
  reset('mission');ev("HARBOR_TEST.position([105,0,-138],Math.PI);HARBOR.input.aim=true;HARBOR.player.aim=true;HARBOR.cam.pitch=-.04;HARBOR.updateCamera(1,true);HARBOR.render.quality='medium';HARBOR.toastTime=0;HARBOR_TEST.render();")
  page.wait_for_timeout(100);page.screenshot(path=str(ROOT/'reports/combat.png'))
  check('WebGL reports no GL error after rendering',ev('HARBOR.render.gl.getError()')==0)
 except Exception as e:
  check('Unexpected integration exception',False,str(e));traceback.print_exc()
 # Mobile uses real touch/pointer events in Chromium emulation, not physical-device testing.
 try:
  mobile=browser.new_context(viewport={'width':891,'height':411},device_scale_factor=1,is_mobile=True,has_touch=True)
  mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append('mobile: '+str(e)));mp.set_content((ROOT/'index.html').read_text(),wait_until='load');mp.locator('#startFree').tap();mp.evaluate("HARBOR.manualTesting=true;HARBOR.render.quality='low';HARBOR.cheats.god=true;HARBOR.hadLock=false")
  check('Mobile landscape touch controls are visible',mp.locator('#touchControls').is_visible() and mp.evaluate('HARBOR.touch'))
  ammo=mp.evaluate('HARBOR_TEST.state().weapon.ammo');mp.locator('[data-action=fire]').tap();mp.evaluate('HARBOR_TEST.step(2)');check('Mobile fire button feeds same combat system',mp.evaluate('HARBOR_TEST.state().weapon.ammo')<ammo)
  cdp=mobile.new_cdp_session(mp)
  box=mp.locator('#joystick').bounding_box();jx=box['x']+box['width']/2;jy=box['y']+box['height']/2
  z0=mp.evaluate('HARBOR.player.pos[2]')
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':jx,'y':jy,'id':10}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':jx,'y':jy-32,'id':10}]})
  mp.evaluate('HARBOR_TEST.step(60)')
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  check('Mobile joystick moves player forward',mp.evaluate('HARBOR.player.pos[2]')<z0-2)
  yaw0=mp.evaluate('HARBOR.cam.yaw')
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':500,'y':185,'id':11}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':560,'y':195,'id':11}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  check('Mobile screen drag rotates TPS camera',mp.evaluate('HARBOR.cam.yaw')>yaw0+.1)
  mp.evaluate("HARBOR.reset('free',false);HARBOR.updateCamera(1,true)")
  mp.locator('[data-action=interact]').tap();mp.evaluate('HARBOR_TEST.step(55)')
  check('Mobile interaction enters actual vehicle',mp.evaluate('HARBOR.player.carId')=='starter')
  mp.evaluate("HARBOR.reset('free',false);HARBOR.updateCamera(1,true);HARBOR.input.fire=false;HARBOR.toastTime=0;HARBOR_TEST.render()");mp.screenshot(path=str(ROOT/'reports/mobile-landscape.png'))
  check('Mobile HUD stays within viewport',mp.evaluate("document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight"))
  mobile.close()
 except Exception as e:check('Mobile integration exception',False,str(e))
 check('No uncaught JavaScript errors',not errors,errors)
 check('No WebGL or runtime console errors',not console_errors,console_errors)
 report={'suite':'Actual WebGL runtime integration','transport':'Playwright set_content; navigation blocked by CI admin policy','renderer':'Chromium ANGLE gl-egl software environment','persistent_origin_storage':'NOT TESTED; no localStorage mock','mobile':'Chromium landscape touch emulation, not a physical handset','passed':sum(r['pass'] for r in results),'total':len(results),'results':results,'errors':errors,'consoleErrors':console_errors}
 (ROOT/'reports/browser-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
 browser.close()
 print('TOTAL',report['passed'],'/',report['total'])
 if report['passed']!=report['total']:raise SystemExit(1)
