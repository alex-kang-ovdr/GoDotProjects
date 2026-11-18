"""Capture actual production rig; fixed-tick test fixture and close-up observer camera."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
import io,os,json
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=gl-egl','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':640,'height':400},device_scale_factor=1)
 page.set_content((ROOT/'index.html').read_text(),wait_until='load')
 page.evaluate("""()=>{const g=HARBOR;g.manualTesting=true;g.hadLock=false;g.reset('free',false);g.started=true;g.running=true;g.mode='play';g.npcs=[];g.cars=g.cars.filter(c=>c.id==='target');g.cheats.god=true;g.cheats.noPolice=true;g.render.quality='medium';HARBOR_TEST.position([-128,.22,104],Math.PI/2);g.player.grounded=true;HarborMotion.reset(g.player);document.getElementById('startScreen').hidden=true;document.getElementById('hud').hidden=true;const d=document.createElement('div');d.id='captureLabel';d.style.cssText='position:absolute;left:22px;top:20px;color:#f5f8f1;background:#10232bdd;padding:12px 17px;font:600 12px Segoe UI,sans-serif;letter-spacing:1px;border-left:3px solid #d6f36a';document.body.appendChild(d);const old=g.renderWorld.bind(g);g.renderWorld=()=>{g.cam.pos=[g.player.pos[0]+.55,g.player.pos[1]+2.05,g.player.pos[2]+5.25];g.cam.target=[g.player.pos[0],g.player.pos[1]+1.08,g.player.pos[2]];g.cam.fov=39;old();};} """)
 frames=[];states=[]
 for frame in range(92):
  state=page.evaluate("""frame=>{const g=HARBOR;g.keys.clear();g.input.y=frame<8?0:frame<22?.39:frame<61?1:0;g.input.aim=frame>=68&&frame<86;if(frame>=39&&frame<61)g.keys.add('ShiftLeft');if(frame===44)g.jump();for(let i=0;i<4;i++){if(frame>=68&&frame<86)g.cam.yaw+=.029;g.step(1/60);}g.renderWorld();document.getElementById('captureLabel').textContent='HARBOR RUN  /  MOTION v3  ·  '+g.player.anim.state.toUpperCase();return {frame,state:g.player.anim.state,y:g.player.pos[1],speed:g.player.moveSpeed};}""",frame)
  data=page.screenshot();frames.append(Image.open(io.BytesIO(data)).convert('RGB'));states.append(state)
  if frame in [17,32,42,48,52,56,65,75]:
   (ROOT/'reports'/f'v3-motion-{frame:02d}.png').write_bytes(data)
 frames[0].save(ROOT/'reports/motion-preview-v3.gif',save_all=True,append_images=frames[1:],duration=67,loop=0,optimize=True)
 (ROOT/'reports/motion-capture-v3.json').write_text(json.dumps({'capture':'Actual WebGL; 60Hz fixed-tick physics sampled at 15 fps with observer camera; isolated motion fixture, not a performance benchmark','samples':states},indent=2))
 browser.close();print('Captured',len(frames),'frames', (ROOT/'reports/motion-preview-v3.gif').stat().st_size,'bytes')
