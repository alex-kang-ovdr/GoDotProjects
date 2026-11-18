"""Focused movement + jump regressions in the actual built WebGL application."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, math, os
ROOT=Path(__file__).resolve().parents[1]
results=[];errors=[]
def check(name,ok,detail=None):
 results.append({'name':name,'pass':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=gl-egl','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':720});page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'index.html').read_text(),wait_until='load');ev=page.evaluate
 ev("HARBOR.manualTesting=true;HARBOR.hadLock=false")
 def reset(yaw=0):
  ev("""yaw=>{const g=HARBOR;g.manualTesting=true;g.hadLock=false;g.reset('free',false);g.started=true;g.running=true;g.mode='play';g.closeOverlays();document.getElementById('startScreen').hidden=true;document.getElementById('hud').hidden=false;g.cheats.god=true;g.cheats.noPolice=true;g.npcs=[];g.cars=g.cars.filter(c=>c.id==='target');g.render.quality='low';g.input.aim=false;HARBOR_TEST.position([-108,.22,101],yaw);g.player.grounded=true;HarborMotion.reset(g.player);g.toastTime=0;}""",yaw)
 for i in range(8):
  reset(i*math.pi/4)
  r=ev("""()=>{const g=HARBOR,p=g.player,old=p.pos.slice();g.keys.add('KeyW');HARBOR_TEST.step(45);g.keys.clear();const f=HM.transform(HarborMotion.root([0,0,0],p.yaw),[0,0,-1]).slice(0,3),v=HM.norm([p.pos[0]-old[0],0,p.pos[2]-old[2]]);return{dot:HM.dot(f,v),speed:p.moveSpeed,state:p.anim.state};}""")
  check('W movement and visible character face agree at heading '+str(i),r['dot']>.998 and r['speed']>4,r)
 reset();r=ev("HARBOR.keys.add('KeyS');HARBOR_TEST.step(45);({yaw:HARBOR.player.yaw,z:HARBOR.player.pos[2],state:HARBOR.player.anim.state})")
 check('Un-aimed S turns the character toward travel rather than moonwalking',math.cos(r['yaw'])<-.999 and r['z']>102,r)
 reset();r=ev("HARBOR.input.aim=true;HARBOR.keys.add('KeyS');HARBOR_TEST.step(45);({yaw:HARBOR.player.yaw,z:HARBOR.player.pos[2],state:HARBOR.player.anim.state})")
 check('Aimed S is deliberate backpedaling with camera-facing torso',abs(r['yaw'])<.001 and r['state']=='aim-back',r)
 reset();r=ev("HARBOR.input.aim=true;HARBOR.keys.add('KeyD');HARBOR_TEST.step(45);({yaw:HARBOR.player.yaw,x:HARBOR.player.pos[0],state:HARBOR.player.anim.state})")
 check('Aimed D uses lateral footwork without turning away from the target',abs(r['yaw'])<.001 and r['state']=='aim-strafe' and r['x']>-107,r)
 reset();ev("HARBOR_TEST.position([-108,.22,115],Math.PI);HARBOR.keys.add('KeyW');HARBOR_TEST.step(120)")
 r=ev("const p=HARBOR.player,phase=p.anim.phase;HARBOR_TEST.step(45);({phaseDelta:p.anim.phase-phase,speed:p.moveSpeed,state:p.anim.state})")
 check('Pushing into a wall stops feet instead of playing an in-place run',abs(r['phaseDelta'])<.001 and r['speed']<.02 and r['state']=='idle',r)
 reset();page.keyboard.press('Space')
 trace=ev("""()=>{const g=HARBOR,out=[];for(let i=0;i<100;i++){g.step(1/60);const p=g.player,pose=HarborMotion.pose(p);out.push({frame:i,y:p.pos[1],vy:p.vel[1],ground:p.grounded,state:p.anim.state,phase:p.anim.phase,hip:pose.hip});}g.renderWorld();return out;}""")
 states={s['state'] for s in trace};peak=max(s['y'] for s in trace)-.22
 check('Jump has anticipation, rise, apex, fall and landing states',{'anticipation','rise','apex','fall','land'}.issubset(states),sorted(states))
 check('Jump height is bounded near the tuned 0.9m target',.80<peak<.95,{'peakAboveFloor':peak})
 check('Jump returns to its actual pavement height, never below it',all(s['y']>=.22-1e-6 for s in trace) and abs(trace[-1]['y']-.22)<1e-6)
 air=[s for s in trace if not s['ground']];check('No running cycle advances during flight',max(s['phase'] for s in air)-min(s['phase'] for s in air)<1e-9)
 check('Landing flexes knees and recovers without a permanent crouch',min(s['hip'] for s in trace if s['state']=='land')<.92 and trace[-1]['hip']>.97)
 reset();r=ev("""()=>{const g=HARBOR;g.keys.add('KeyW');for(let i=0;i<30;i++)g.step(1/60);g.jump();for(let i=0;i<5;i++)g.step(1/60);g.keys.clear();const before=g.player.pos.slice(),vx0=g.player.vel[2];for(let i=0;i<25;i++)g.step(1/60);return{distance:Math.abs(g.player.pos[2]-before[2]),vBefore:vx0,vAfter:g.player.vel[2]};}""")
 check('Releasing W in midair preserves takeoff momentum',r['distance']>1.5 and abs(r['vAfter'])>3.8,r)
 reset();r=ev("""()=>{const g=HARBOR;g.jump();let launch=0,last=true,peak=0;for(let i=0;i<110;i++){if(i===15)g.jump();g.step(1/60);if(last&&!g.player.grounded)launch++;last=g.player.grounded;peak=Math.max(peak,g.player.pos[1]-.22);}return{launch,peak};}""")
 check('A second press high in the air cannot cause a double jump',r['launch']==1 and r['peak']<.95,r)
 reset();r=ev("""()=>{const g=HARBOR;g.keys.add('Space');g.jump();let launches=0,last=true;for(let i=0;i<180;i++){document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',repeat:true}));g.step(1/60);if(last&&!g.player.grounded)launches++;last=g.player.grounded;}g.keys.clear();return launches;}""")
 check('Holding Space does not automatically bunny-hop',r==1,r)
 reset();r=ev("""()=>{const g=HARBOR;g.world.boxes.push({min:[-111,2.65,98],max:[-105,3.1,104]});g.jump();let high=0;for(let i=0;i<80;i++){g.step(1/60);high=Math.max(high,g.player.pos[1]+1.9);}g.world.boxes.pop();return{headMax:high,ground:g.player.grounded};}""")
 check('Upward jump collision prevents going through a low ceiling',r['headMax']<=2.65 and r['ground'],r)
 reset();r=ev("""()=>{const g=HARBOR;g.cars.push(g.makeCar('rotated','coupe',-105,101,Math.PI/2,0x579e96));const car=g.cars.at(-1);HARBOR_TEST.position([-105,.22,99.4],Math.PI/2);g.interact();for(let i=0;i<55;i++)g.step(1/60);const entered=g.player.carId==='rotated';g.keys.add('KeyW');for(let i=0;i<30;i++)g.step(1/60);g.keys.clear();const f=HM.transform(HM.compose([0,0,0],[0,-car.yaw,0]),[0,0,-1]).slice(0,3);return {entered,dx:car.x+105,dz:car.z-101,dot:HM.dot(f,g.forward(car.yaw))};}""")
 check('Rotated vehicle entry and visible forward drive agree',r['entered'] and r['dx']>.5 and abs(r['dz'])<.1 and r['dot']>.999,r)
 reset();ev("HARBOR.render.quality='medium';HARBOR.keys.add('KeyW');HARBOR_TEST.step(24);HARBOR.keys.clear();HARBOR.toastTime=0;HARBOR_TEST.render()")
 page.screenshot(path=str(ROOT/'reports/gameplay-v2.png'))
 check('WebGL is clean after the new articulated rig',ev('HARBOR.render.gl.getError()')==0)
 check('No uncaught JavaScript errors in focused motion tests',not errors,errors)
 # Local navigation may be blocked by this CI's admin policy. Report as NOT RUN, never a pass.
 offline=browser.new_page(viewport={'width':900,'height':600});requests=[];offline.on('request',lambda r:requests.append(r.url));offline_status={}
 try:
  offline.goto((ROOT/'index.html').as_uri(),wait_until='load')
  check('Single-file build initializes directly from file://',offline.evaluate('!!window.HARBOR && HARBOR.render.frames>0'))
  check('Offline build makes no http/https requests',not any(x.startswith(('http:','https:')) for x in requests))
  offline_status={'status':'executed'}
 except Exception as ex:
  if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(ex):raise
  offline_status={'status':'NOT RUN','reason':'CI administrator policy blocks file:// navigation; no policy bypass attempted.'}
 report={'suite':'Actual WebGL movement / jump regressions','passed':sum(x['pass'] for x in results),'total':len(results),'results':results,'jumpTrace':trace,'errors':errors,'physicalDeviceTested':False,'fileOrigin':offline_status}
 (ROOT/'reports/motion-browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close();print('TOTAL',report['passed'],'/',report['total'])
 if report['passed']!=report['total']:raise SystemExit(1)
