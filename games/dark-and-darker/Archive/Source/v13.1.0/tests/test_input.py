"""Real browser input smoke tests; geometry and rules are covered by test_core.cjs."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('DISPLAY',':99')
results=[]
def check(name,ok):
    results.append({'name':name,'passed':bool(ok)})
    print(('PASS' if ok else 'FAIL'),name,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=b.new_page(viewport={'width':1024,'height':700})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/'index.html').read_text(),wait_until='load')
    page.evaluate('cryptDebug.setAuto(false);cryptDebug.setRenderAuto(false)')
    page.click('#training');page.wait_for_timeout(150)
    page.evaluate('cryptDebug.game.aiFrozen=true')
    check('Training button initializes practice enemies without boss',page.evaluate('cryptDebug.game.training&&cryptDebug.game.enemies.length===3&&!cryptDebug.game.boss'))
    check('User gesture captures the mouse',page.evaluate('document.pointerLockElement===document.getElementById("gl")'))
    page.mouse.click(512,350)
    check('One left click produces exactly one melee attack',page.evaluate('cryptDebug.game.stats.swings===1&&cryptDebug.game.player.attack!==null'))
    page.evaluate('cryptDebug.step(1.0)')
    page.mouse.down(button='right')
    check('Right button activates shield guard',page.evaluate('cryptDebug.game.player.guard&&cryptDebug.game.shieldBox(cryptDebug.game.player)!==null'))
    page.mouse.up(button='right')
    check('Right button release clears guard',page.evaluate('!cryptDebug.game.player.guard'))
    page.keyboard.press('2');page.mouse.click(512,350)
    check('Number 2 switches to bow and click spends one arrow',page.evaluate('cryptDebug.game.mode==="bow"&&cryptDebug.game.player.arrows===15&&cryptDebug.game.projectiles.length===1'))
    page.evaluate('cryptDebug.step(1.2)')
    page.keyboard.press('3');page.mouse.click(512,350)
    check('Number 3 casts a moving fireball and spends mana',page.evaluate('cryptDebug.game.mode==="magic"&&cryptDebug.game.player.mana===76&&cryptDebug.game.projectiles.some(p=>p.magic)'))
    page.evaluate('cryptDebug.step(1.5)');page.keyboard.press('2');page.keyboard.press('r')
    check('R starts reload without instant refill',page.evaluate('cryptDebug.game.action?.kind==="reload"&&cryptDebug.game.player.arrows===15'))
    page.evaluate('cryptDebug.step(1.2)')
    check('Reload consumes only the available reserve amount',page.evaluate('cryptDebug.game.player.arrows===16&&cryptDebug.game.player.reserve===23'))
    check('No input-test JavaScript exceptions',not errors)
    out={'suite':'real mouse and keyboard integration','browser':b.version,'total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'errors':errors,'results':results}
    (ROOT/'tests/input_results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    b.close()
print(json.dumps({k:out[k] for k in ['total','passed','failed']}))
raise SystemExit(1 if out['failed'] else 0)
