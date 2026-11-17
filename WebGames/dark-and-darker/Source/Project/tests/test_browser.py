"""Chromium/WebGL integration tests. Uses set_content because navigation is policy-blocked in the build sandbox."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, json, time
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('DISPLAY',':99')
results=[]
def record(name,condition,detail=''):
    results.append({'name':name,'passed':bool(condition),'detail':detail})
    print(time.strftime('%H:%M:%S'),('PASS' if condition else 'FAIL'),name,detail,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[];requests=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.set_content((ROOT/'index.html').read_text(),wait_until='load')
    page.wait_for_function('window.cryptDebug && cryptDebug.getV13().rendererFrames > 1')
    page.evaluate('cryptDebug.setAuto(false); cryptDebug.setRenderAuto(false); cryptDebug.renderer.scale=.65')
    record('WebGL starts before play without undefined-world crash',page.evaluate('cryptDebug.getV13().rendererFrames>1 && !document.getElementById("fatal").hidden===false'))
    page.screenshot(path=str(ROOT/'docs/menu.png'))
    page.click('#start');page.wait_for_timeout(200)
    record('Start button initializes full v13 gameplay including boss',page.evaluate('cryptDebug.game.running && !!cryptDebug.game.boss && cryptDebug.game.containers.length>0'))
    record('Exactly one inventory overlay / one game canvas',page.locator('#inventoryPanel').count()==1 and page.locator('#gl').count()==1)
    # Real key event path, then controlled simulation time for deterministic geometry tests.
    before=page.evaluate('({x:cryptDebug.game.player.x,z:cryptDebug.game.player.z,yaw:cryptDebug.game.player.yaw})')
    page.evaluate('cryptDebug.setAuto(true)');page.keyboard.down('w');page.wait_for_timeout(500);page.keyboard.up('w');page.evaluate('cryptDebug.setAuto(false)')
    after=page.evaluate('({x:cryptDebug.game.player.x,z:cryptDebug.game.player.z})')
    import math
    forward=(after['x']-before['x'])*math.sin(before['yaw'])-(after['z']-before['z'])*math.cos(before['yaw'])
    record('W keyboard input moves forward in camera space',forward>0.05,f'distance={forward:.3f}')
    page.evaluate('cryptDebug.renderer.scale=1;cryptDebug.render()')
    page.screenshot(path=str(ROOT/'docs/gameplay.png'))
    page.evaluate('cryptDebug.renderer.scale=.65')
    # Position the player at the actual entrance chest; search is started by the E key.
    page.evaluate('''(()=>{const g=cryptDebug.game,c=g.containers[0];g.player.x=c.x;g.player.z=c.z+1.55;g.player.yaw=0;g.player.pitch=0;g.paused=false;})()''')
    page.keyboard.down('e')
    record('E starts a timed search',page.evaluate('cryptDebug.game.action?.kind==="container"'))
    page.evaluate('cryptDebug.step(1.1,{interact:true})');page.keyboard.up('e')
    record('Completed search opens one live loot panel',page.is_visible('#inventoryPanel') and page.locator('.lootItem').count()==4)
    page.click('#takeAll');page.wait_for_timeout(100)
    record('Loot UI transfers all four items without overlap',page.evaluate('cryptDebug.game.inventory.items.length===4&&cryptDebug.game.inventory.validate()&&cryptDebug.game.openContainer.items.length===0'))
    uid=page.evaluate('cryptDebug.game.inventory.items.find(x=>x.id==="axe").uid')
    page.locator(f'.bagItem[data-uid="{uid}"]').click();page.click('#equipItem')
    record('Equipment button changes real weapon profile and returns old sword',page.evaluate('cryptDebug.game.profileId==="axe"&&cryptDebug.game.inventory.items.some(x=>x.id==="rustSword")'))
    # Drag potion to bottom-right cell through real pointer capture events.
    puid=page.evaluate('cryptDebug.game.inventory.items.find(x=>x.id==="potion").uid')
    source=page.locator(f'.bagItem[data-uid="{puid}"]').bounding_box();grid=page.locator('#bagGrid').bounding_box()
    page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);page.mouse.down()
    page.mouse.move(grid['x']+grid['width']*(5.5/6),grid['y']+grid['height']*(3.5/4),steps=8);page.mouse.up();page.wait_for_timeout(100)
    record('Pointer drag moves potion to cell 5,3',page.evaluate(f'(()=>{{const i=cryptDebug.game.inventory.get("{puid}");return i.x===5&&i.y===3&&cryptDebug.game.inventory.validate()}})()'))
    # Drag the dagger to a free 1x2 area, rotate using real R key.
    duid=page.evaluate('cryptDebug.game.inventory.items.find(x=>x.id==="dagger").uid')
    source=page.locator(f'.bagItem[data-uid="{duid}"]').bounding_box()
    page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);page.mouse.down()
    page.mouse.move(grid['x']+grid['width']*(3.5/6),grid['y']+grid['height']*(3/4),steps=8);page.mouse.up();page.wait_for_timeout(100)
    page.keyboard.press('r')
    record('R rotates selected item with validated occupancy',page.evaluate(f'cryptDebug.game.inventory.get("{duid}").rotated && cryptDebug.game.inventory.validate()'))
    page.evaluate('cryptDebug.renderer.scale=1;cryptDebug.render()')
    page.screenshot(path=str(ROOT/'docs/inventory.png'))
    page.evaluate('cryptDebug.renderer.scale=.65')
    page.locator(f'.bagItem[data-uid="{puid}"]').click();page.click('#dropItem')
    record('Drop UI creates a recoverable world item',page.evaluate(f'!cryptDebug.game.inventory.get("{puid}")&&cryptDebug.game.containers.some(c=>c.items.some(i=>i.uid==="{puid}"))'))
    # Inventory is not a pause. Run only a known controlled tick; no arbitrary timing dependence.
    time0=page.evaluate('cryptDebug.game.time');page.evaluate('cryptDebug.step(.2)')
    record('Inventory stays live, not paused',page.evaluate('cryptDebug.game.time')>time0)
    page.click('#closeInventory');page.keyboard.press('F1');page.wait_for_timeout(100)
    time0=page.evaluate('cryptDebug.game.time');page.evaluate('cryptDebug.step(.5)')
    record('F1 pauses and freezes simulation',page.is_visible('#pause') and page.evaluate('cryptDebug.game.paused') and page.evaluate('cryptDebug.game.time')==time0)
    page.click('#resume');record('Resume returns to same run',page.evaluate('cryptDebug.game.running&&!cryptDebug.game.paused'))
    # Capture an actual rendered combat pose and verify no WebGL errors.
    page.evaluate('cryptDebug.start(true);cryptDebug.setAuto(false);cryptDebug.game.paused=false;')
    page.evaluate('''(()=>{const g=cryptDebug.game;g.player.z-=2.2;g.player.yaw=0;const e=g.enemies[0];e.z=g.player.z-1.9;e.yaw=Math.PI;e.cooldown=0;g.tick(.016,{});cryptDebug.step(.22);})()''')
    page.evaluate('cryptDebug.renderer.scale=1;cryptDebug.render()');page.screenshot(path=str(ROOT/'docs/combat.png'))
    record('Enemy animated windup renders with no WebGL error',page.evaluate('cryptDebug.renderer.gl.getError()===0 && cryptDebug.game.enemies[0].attack!==null'))
    # Win via real extraction action from a controlled location.
    page.evaluate('''(()=>{const g=cryptDebug.game;g.aiFrozen=true;g.training=false;g.player.gold=50;g.inventory.add(CryptCore.makeItem('gem'));g.player.x=g.map.exit.x;g.player.z=g.map.exit.z+1.5;g.player.yaw=0;g.player.attack=null;g.action=null;g.player.stagger=0;g.paused=false;})()''')
    page.keyboard.down('e');page.evaluate('cryptDebug.step(2.3,{interact:true})');page.keyboard.up('e')
    record('Extraction reaches result UI and awards expected value',page.is_visible('#result') and page.evaluate('cryptDebug.game.result?.success&&cryptDebug.game.result.reward===115'))
    bank0=page.evaluate('cryptDebug.bank().gold');page.evaluate('cryptDebug.game.finish(true,"duplicate")')
    record('Duplicate finish cannot pay reward twice',page.evaluate('cryptDebug.bank().gold')==bank0)
    page.click('#start');record('Restart resets all old run data',page.evaluate('cryptDebug.game.running&&cryptDebug.game.player.hp===100&&cryptDebug.game.inventory.items.length===0&&cryptDebug.game.stats.kills===0'))
    # Smaller viewport checks layout; not a mobile gameplay certification.
    page.keyboard.press('i');page.set_viewport_size({'width':1024,'height':700});page.wait_for_timeout(150)
    record('Inventory fits 1024x700 without horizontal overflow',page.evaluate('(()=>{let r=document.getElementById("inventoryPanel").querySelector(".inventoryWindow").getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&document.body.scrollWidth<=innerWidth})()'))
    record('No runtime JavaScript / WebGL console errors',len(errors)==0,str(errors))
    record('No external runtime resource requests',len(requests)==0,str(requests))
    out={'suite':'Chromium WebGL + UI integration','browser':browser.version,'method':'set_content, Xvfb, SwiftShader; controlled stepping for repeatable scenarios','navigation_note':'file:// and localhost navigation blocked by sandbox policy; actual file navigation was not certified','total':len(results),'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results),'errors':errors,'externalRequests':requests,'results':results}
    (ROOT/'tests/browser_results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    browser.close()
print(json.dumps({k:out[k] for k in['total','passed','failed']}))
raise SystemExit(1 if out['failed'] else 0)
