"""Drive a continuous road route using actual throttle/steering, no teleportation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=gl-egl','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':960,'height':600});page.set_content((ROOT/'index.html').read_text());page.locator('#startMission').click();page.evaluate("HARBOR.manualTesting=true;HARBOR.render.quality='low';HARBOR.hadLock=false")
 result=page.evaluate('''()=>{const g=HARBOR;g.interact();for(let i=0;i<55;i++)g.step(1/60);const start=g.snapshot();const points=[[-100,72],[-72,72],[-72,-144],[104,-144],[104,-134],[100.5,-122]];let ix=0,steps=0;const trail=[];
 while(ix<points.length&&steps<12000&&g.running){const c=g.activeCar();if(!c)break;const t=points[ix],dist=Math.hypot(t[0]-c.x,t[1]-c.z);if(dist<3.5&&ix<points.length-1){ix++;continue;}let err=HM.angle(c.yaw,Math.atan2(t[0]-c.x,-(t[1]-c.z)));let desired=Math.abs(err)>.5?5:Math.min(19,4+dist*.65);if(ix===points.length-1&&dist<3){desired=0;if(Math.abs(c.speed)<.3){ix++;break;}}
 g.input.x=HM.clamp(err*1.6,-1,1);g.input.y=HM.clamp((desired-c.speed)*.4,-1,1);g.step(1/60);steps++;if(steps%180===0)trail.push({t:g.time,x:c.x,z:c.z,speed:c.speed,hp:c.hp,index:ix});}
 g.input.x=0;g.input.y=0;g.renderWorld();g.updateHUD();return{start:start.player,end:g.snapshot(),route:points,waypointsCompleted:ix,steps,seconds:steps/60,trail};}''')
 # Continue the same session: exit, walk to the target, take it, and drive home.
 continuation=page.evaluate('''()=>{const g=HARBOR;g.input.x=0;g.input.y=0;g.interact();for(let i=0;i<32;i++)g.step(1/60);const exit=g.snapshot().player;let walkSteps=0;while(!g.player.carId&&walkSteps<240){const p=g.player.pos,dx=102.3-p[0],dz=-120-p[2],d=Math.hypot(dx,dz);if(d<.5)break;const f=g.forward(),r=[Math.cos(g.cam.yaw),0,Math.sin(g.cam.yaw)];g.input.x=(dx*r[0]+dz*r[2])/d;g.input.y=(dx*f[0]+dz*f[2])/d;g.step(1/60);walkSteps++;}g.input.x=0;g.input.y=0;g.interact();for(let i=0;i<55;i++)g.step(1/60);const acquired=g.snapshot();
 const points=[[104,-147],[-3,-147],[-3,-3],[-75,-3],[-75,69],[-108,69],[-108,104]];let ix=0,steps=0;const trail=[];
 while(g.player.carId==='target'&&ix<points.length&&steps<15000&&g.running){const c=g.activeCar(),t=points[ix],dist=Math.hypot(t[0]-c.x,t[1]-c.z);if(dist<3.5&&ix<points.length-1){ix++;continue;}const err=HM.angle(c.yaw,Math.atan2(t[0]-c.x,-(t[1]-c.z)));let desired=Math.abs(err)>.5?5:Math.min(26,4+dist*.7);if(ix===points.length-1&&dist<3){desired=0;if(Math.abs(c.speed)<.3){ix++;break;}}g.input.x=HM.clamp(err*1.6,-1,1);g.input.y=HM.clamp((desired-c.speed)*.4,-1,1);g.step(1/60);steps++;if(steps%180===0)trail.push({t:g.time,x:c.x,z:c.z,hp:c.hp,wanted:g.wanted.level,state:g.wanted.state,index:ix});}
 g.input.x=0;g.input.y=0;for(let i=0;i<2100&&g.running;i++)g.step(1/60);g.renderWorld();g.updateHUD();return{exit,walkSteps,acquired:acquired.player,phaseOnAcquisition:acquired.phase,waypointsCompleted:ix,route:points,seconds:steps/60,end:g.snapshot(),trail};}''')
 result['continuation']=continuation
 result['passed'] = (result['waypointsCompleted']==len(result['route']) and continuation['waypointsCompleted']==len(continuation['route']) and continuation['end']['phase']=='complete' and continuation['end']['wallet']==750)
 result['scenario']='One continuous mission, no teleportation, invulnerability or police-disable cheats'

 page.screenshot(path=str(ROOT/'reports/full-route-finish.png'))
 print('CONTINUATION',continuation['waypointsCompleted'],'/',len(continuation['route']),continuation['end']['phase'],continuation['end']['mode'],'wallet',continuation['end']['wallet'])
 print('RETURN TRAIL',continuation['trail'][-4:])
 (ROOT/'reports/drive-route.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
 print('WAYPOINTS',result['waypointsCompleted'],'/',len(result['route']),'seconds',result['seconds'])
 print('CAR',[c for c in result['end']['cars'] if c['id']=='starter']);print('STATE',result['end']['phase'],result['end']['mode']);print('TRAIL',result['trail'][-4:])
 b.close()
 if not result['passed']:raise SystemExit(1)
