from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
 errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.evaluate('window.__DD_TEST__=true;window.__DD_CONTROLLED__=true;')
 page.set_content((root/'index.html').read_text())
 # Deterministic real controls: keyboard and pointer, not QA direct movement.
 keyboard=page.evaluate('''()=>{const q=DarkDescentQA;q.newGame('knight',151);const s=q.S,p=s.p;const dirs=[['d',32,0],['a',-32,0],['s',0,32],['w',0,-32]];return {dir:dirs.find(d=>q.walk(p.x+d[1],p.y+d[2],10))[0],x:p.x,y:p.y};}''')
 page.locator('#hud').focus();page.keyboard.down(keyboard['dir']);page.evaluate('DarkDescentQA.step(10)');page.keyboard.up(keyboard['dir'])
 moved=page.evaluate(f'Math.hypot(DarkDescentQA.S.p.x-{keyboard["x"]},DarkDescentQA.S.p.y-{keyboard["y"]})')
 click=page.evaluate('''()=>{const q=DarkDescentQA,s=q.S,p=s.p;const target=[{x:p.x+25,y:p.y},{x:p.x-25,y:p.y},{x:p.x,y:p.y+25},{x:p.x,y:p.y-25}].find(t=>q.walk(t.x,t.y,10)&&q.lineClear(p,t,10));const screen=q.project(target.x,target.y,0);return {target,screen};}''')
 box=page.locator('#hud').bounding_box();page.mouse.click(box['x']+click['screen']['x']*box['width']/960,box['y']+click['screen']['y']*box['height']/624)
 page.evaluate('DarkDescentQA.step(30)');cd=page.evaluate(f'Math.hypot(DarkDescentQA.S.p.x-{click["target"]["x"]},DarkDescentQA.S.p.y-{click["target"]["y"]})')
 # Continuous natural combat update smoke. No claim that a bot can beat the campaign.
 stress=page.evaluate('''()=>{const q=DarkDescentQA,out=[];for(const hero of ['knight','ranger','mage']){q.newGame(hero,381);let s=q.S;const e=s.enemies.find(e=>e.type!=='boss');if(e){let path=q.route(s.p,e,10);for(const pt of path.slice(0,-2)){s.p.x=pt.x;s.p.y=pt.y;q.reveal();}}let ticks=0;for(let i=0;i<1200;i++){const enemy=s.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-s.p.x,a.y-s.p.y)-Math.hypot(b.x-s.p.x,b.y-s.p.y))[0];if(enemy){q.cast(1,enemy);if(i%60===0)q.cast(2,enemy);if(i%120===0)q.cast(3,enemy);if(s.p.hp<s.p.maxHp*.55)q.cast(4,enemy);}q.step();ticks++;if(s.p.dead)break;}const finite=Number.isFinite(s.p.hp)&&s.enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.hp));q.render();out.push({hero,ticks,kills:s.kills,hp:s.p.hp,dead:s.p.dead,finite});}return out;}''')
 # In-engine staged validation scene (normal renderer, original assets only).
 page.evaluate('''()=>{const q=DarkDescentQA;q.newGame('mage',511);const s=q.S;const walk=(goal)=>{for(const n of q.route(s.p,goal,10)){s.p.x=n.x;s.p.y=n.y;q.reveal();}};const key=s.director.objects.find(o=>o.kind==='key');walk(key);q.interact();const boss=s.enemies.find(e=>e.type==='boss');const path=q.route(s.p,boss,10);for(const pt of path.slice(0,-2)){s.p.x=pt.x;s.p.y=pt.y;q.reveal();}s.p.level=3;s.p.points=2;q.hurtEnemy(boss,boss.maxHp*.36,0);q.ai(boss,1/60);q.cast(3,boss);q.cast(2,boss);q.step(15);q.camera.x=s.p.x;q.camera.y=s.p.y;q.camera.zoom=1.5;q.refresh();q.render();}''')
 page.screenshot(path=str(root/'preview.png'))
 report={'keyboard_distance':moved,'keyboard_pass':moved>5,'pointer_target_distance':cd,'pointer_pass':cd<8,'combat_smoke':stress,'pageerrors':errs,'preview':'In-engine staged validation scene; not external concept art; not a normal campaign completion.'}
 (root/'tests/input_combat_smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
