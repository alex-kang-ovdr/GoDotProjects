"""Mobile input regression tests, using trusted Chromium CDP touch input.

Run after ``python3 build.py``. Requires Python Playwright and Chromium.
This is browser emulation, not an Android-device or content:// launch test.
The HTML is loaded with set_content; no server, navigation, or remote assets.
A browser-launch restriction is reported as BLOCKED (zero passes), not success.
"""
from pathlib import Path
import argparse
import json
import math
import os
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
RESULTS = []
ERRORS = []
REQUESTS = []


def check(name, ok, detail=None):
    row = {"name": name, "passed": bool(ok)}
    if detail is not None:
        row["detail"] = detail
    RESULTS.append(row)
    print(("PASS" if ok else "FAIL") + " " + name, flush=True)
    return bool(ok)


def ev(page, js, arg=None):
    return page.evaluate(js, arg)


def center(page, selector):
    box = page.locator(selector).bounding_box()
    if not box or box["width"] <= 0 or box["height"] <= 0:
        raise AssertionError("Missing/hidden touch target: " + selector)
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def button(action):
    return 'button[data-touch-action="' + action + '"]'


def point(page, selector, fx=.5, fy=.5):
    box = page.locator(selector).bounding_box()
    if not box:
        raise AssertionError("Missing/hidden target: " + selector)
    return box["x"] + box["width"] * fx, box["y"] + box["height"] * fy


class Fingers:
    """CDP touch IDs are independent; touchEnd names the released point.

    Chromium's InputHandler keeps unchanged points active. Sending the point
    being released is important: an empty touchEnd releases every finger.
    Source: chromium/src content/browser/devtools/protocol/input_handler.cc,
    CreateWebTouchEvents (official Chromium implementation).
    """
    def __init__(self, context, page):
        self.cdp = context.new_cdp_session(page)
        self.points = {}

    def send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent", {
            "type": kind, "touchPoints": points,
        })

    def down(self, ident, x, y):
        assert ident not in self.points
        p = {"id": ident, "x": x, "y": y,
             "radiusX": 2, "radiusY": 2, "force": 1}
        self.points[ident] = p
        self.send("touchStart", [p])

    def move(self, ident, x, y):
        self.points[ident].update(x=x, y=y)
        self.send("touchMove", [self.points[ident]])

    def up(self, ident):
        self.send("touchEnd", [self.points.pop(ident)])

    def cancel(self):
        if self.points:
            self.send("touchCancel", [])
            self.points.clear()

    def tap(self, page, selector, ident=8):
        self.down(ident, *center(page, selector))
        self.up(ident)


def load(context):
    page = context.new_page()
    page.on("pageerror", lambda e: ERRORS.append(str(e)))
    page.on("request", lambda r: REQUESTS.append(r.url)
            if r.url.startswith(("http://", "https://")) else None)
    page.set_content((ROOT / "index.html").read_text(encoding="utf-8"),
                     wait_until="load")
    page.wait_for_function("window.cryptDebug && cryptDebug.getInput && cryptDebug.stepInput")
    ev(page, """() => {
      cryptDebug.setAuto(false); cryptDebug.setRenderAuto(false);
      window.__touchTrace=[];
      for (const type of ['pointerdown','pointerup','pointercancel','lostpointercapture']) {
        document.addEventListener(type,e=>window.__touchTrace.push({
          type, id:e.pointerId, pointerType:e.pointerType, trusted:e.isTrusted,
          target:e.target.id, action:e.target.closest('[data-touch-action]')?.dataset.touchAction
        }),true);
      }
    }""")
    return page


def isolate(page):
    ev(page, "cryptDebug.game.aiFrozen=true; cryptDebug.game.god=true")


def step(page, seconds):
    ev(page, "s=>cryptDebug.stepInput(s)", seconds)


def position(page):
    return ev(page, "({x:cryptDebug.game.player.x,z:cryptDebug.game.player.z,yaw:cryptDebug.game.player.yaw})")


def distance(a, b):
    return math.hypot(a["x"]-b["x"], a["z"]-b["z"])


def neutral(page):
    return ev(page, """() => {
      const i=cryptDebug.getInput(),s=cryptDebug.touchState();
      return !i.forward&&!i.strafe&&!i.interact&&!i.jump&&!i.sprint
        &&!s.forward&&!s.strafe&&!s.interact&&!s.jump&&!s.sprint
        &&!s.guard&&s.pointerCount===0&&!cryptDebug.game.player.guard;
    }""")


def layout_check(page, label):
    targets = ["#touchMove", "#touchLook"] + [button(x) for x in
        ["attack", "guard", "interact", "jump", "dodge", "sprint", "heal",
         "reload", "inventory", "pause", "map", "melee", "bow", "magic"]]
    details = ev(page, """selectors=>selectors.map(selector=>{
      const el=document.querySelector(selector),r=el?.getBoundingClientRect();
      if(!r)return {selector,ok:false,reason:'missing'};
      const x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);
      const style=getComputedStyle(el);
      return {selector,ok:r.width>=40&&r.height>=40&&r.x>=-1&&r.y>=-1
        &&r.right<=innerWidth+1&&r.bottom<=innerHeight+1
        &&style.visibility!=='hidden'&&style.display!=='none'
        &&(top===el||el.contains(top)),rect:{x:r.x,y:r.y,w:r.width,h:r.height},
        hit:top?.id||top?.dataset?.touchAction||top?.tagName};
    })""", targets)
    check(label + " controls are visible, inside viewport, and hit-testable",
          all(x["ok"] for x in details), [x for x in details if not x["ok"]])


def mobile_suite(browser):
    context = browser.new_context(viewport={"width":391,"height":844},
        is_mobile=True,has_touch=True,device_scale_factor=1)
    page = load(context)
    page.locator("#training").tap()
    isolate(page)
    fingers = Fingers(context,page)
    check("Touchscreen automatically enables controls without Pointer Lock",
          ev(page, "cryptDebug.touchState().enabled && cryptDebug.touchState().active && !document.pointerLockElement && !cryptDebug.game.paused"))
    layout_check(page, "Portrait 391 x 844")

    mx,my = center(page,"#touchMove")
    lx,ly = point(page,"#touchLook",.5,.3)
    start = position(page)
    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    check("Trusted joystick drag yields forward movement input",
          ev(page,"cryptDebug.getInput().forward > 0.5"))
    step(page,.25)
    check("Joystick moves the simulated player",distance(start,position(page))>.20)

    before = position(page)
    fingers.down(2,lx,ly)
    fingers.move(2,lx+36,ly-12)
    swings = ev(page,"cryptDebug.game.stats.swings")
    fingers.down(3,*center(page,button("attack")))
    step(page,.15)
    moved = position(page)
    check("Move, look, and attack work simultaneously with three fingers",
          distance(before,moved)>.05 and abs(moved["yaw"]-before["yaw"])>.01
          and ev(page,"cryptDebug.game.stats.swings")==swings+1)
    fingers.up(3)
    fingers.up(2)
    check("Releasing look and attack preserves the movement finger",
          ev(page,"cryptDebug.getInput().forward > 0.5"))
    fingers.up(1)
    step(page,1.0)
    check("A touch attack does not also trigger a compatibility mouse attack",
          ev(page,"cryptDebug.game.stats.swings")==swings+1)
    stopped=position(page)
    step(page,.2)
    check("Joystick release stops movement",neutral(page) and distance(stopped,position(page))<1e-7)
    check("Browser-generated touchscreen events are trusted",
          ev(page,"window.__touchTrace.filter(e=>e.type==='pointerdown'&&e.pointerType==='touch').length>=3 && window.__touchTrace.filter(e=>e.type==='pointerdown'&&e.pointerType==='touch').every(e=>e.trusted)"))

    fingers.down(4,*center(page,button("guard")))
    check("Holding the guard button raises the shield",ev(page,"cryptDebug.game.player.guard"))
    fingers.cancel()
    check("Browser touchCancel clears held guard and movement",neutral(page))

    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    ev(page,"""() => {
      const t=[...window.__touchTrace].reverse().find(e=>e.type==='pointerdown'&&e.pointerType==='touch');
      document.getElementById('touchMove').dispatchEvent(new PointerEvent('lostpointercapture',{
        bubbles:true,pointerId:t.id,pointerType:'touch'
      }));
    }""")
    check("Synthetic lostpointercapture clears a held joystick",neutral(page))
    fingers.cancel()

    # Keep the move finger active while opening a real UI control.
    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    fingers.tap(page,button("pause"))
    check("Pause button freezes the game and clears touch state",
          ev(page,"cryptDebug.game.paused") and neutral(page))
    fingers.cancel()
    page.locator("#resume").tap()
    check("Resume needs no Pointer Lock and does not restore stale movement",
          not ev(page,"cryptDebug.game.paused") and neutral(page))

    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    fingers.tap(page,button("inventory"))
    check("Inventory button opens inventory and clears movement",
          page.locator("#inventoryPanel").is_visible() and neutral(page))
    fingers.cancel()
    page.locator("#closeInventory").tap()
    check("Closing inventory restores touch controls with neutral state",
          ev(page,"cryptDebug.touchState().active") and neutral(page))

    # Reset to the starter chest, proving held interaction travels through the
    # same live input path as the normal fixed-step loop.
    ev(page,"cryptDebug.start(true)")
    isolate(page)
    target=ev(page,"cryptDebug.game.getInteraction()?.kind")
    check("Fixture has the real starter-container interaction",target=="container")
    fingers.down(5,*center(page,button("interact")))
    step(page,.35)
    check("Held search advances the container action",
          ev(page,"cryptDebug.game.action?.kind==='container' && cryptDebug.game.action.t>=.3 && cryptDebug.getInput().interact"))
    fingers.up(5)
    step(page,.1)
    check("Releasing search cancels unfinished progress",ev(page,"cryptDebug.game.action===null") and neutral(page))
    fingers.down(5,*center(page,button("interact")))
    step(page,1.1)
    check("Holding search to completion opens the loot inventory",
          page.locator("#inventoryPanel").is_visible() and neutral(page))
    fingers.up(5)
    page.locator("#closeInventory").tap()

    fingers.tap(page,button("bow"))
    arrows=ev(page,"cryptDebug.game.player.arrows")
    fingers.tap(page,button("attack"))
    check("Touch weapon selection and attack spend one arrow",
          ev(page,"cryptDebug.game.mode==='bow' && cryptDebug.game.player.arrows")==arrows-1)
    step(page,1.0)
    fingers.tap(page,button("reload"))
    check("Reload button starts the timed reload",ev(page,"cryptDebug.game.action?.kind==='reload'"))
    step(page,1.2)
    check("Reload completion consumes one reserve arrow",
          ev(page,"cryptDebug.game.player.arrows===16 && cryptDebug.game.player.reserve===23"))
    fingers.tap(page,button("magic"))
    mana=ev(page,"cryptDebug.game.player.mana")
    fingers.tap(page,button("attack"))
    check("Touch magic attack spends exactly one cast of mana",
          abs(ev(page,"cryptDebug.game.player.mana")-(mana-24))<1e-6)
    step(page,1.0)
    fingers.tap(page,button("melee"))
    ev(page,"cryptDebug.game.player.hp=60")
    fingers.tap(page,button("heal"))
    check("Heal button starts timed potion use",ev(page,"cryptDebug.game.action?.kind==='heal'"))
    step(page,1)
    check("Potion completes and consumes one charge",
          ev(page,"cryptDebug.game.player.hp>60 && cryptDebug.game.player.potions===2"))

    fingers.down(6,*center(page,button("jump")))
    step(page,.1)
    check("Jump button moves the player above the floor",ev(page,"cryptDebug.game.player.jump>.1"))
    fingers.up(6)
    step(page,1)
    check("Released jump button does not cause repeated jumps",ev(page,"cryptDebug.game.player.jump===0"))
    mx,my=center(page,"#touchMove")
    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    start=position(page)
    step(page,.2)
    walking_distance=distance(start,position(page))
    start=position(page)
    stamina=ev(page,"cryptDebug.game.player.stamina")
    fingers.down(6,*center(page,button("sprint")))
    step(page,.2)
    check("Sprint works while the movement finger is held",
          walking_distance>.05 and distance(start,position(page))>walking_distance*1.35
          and ev(page,"cryptDebug.game.player.stamina")<stamina)
    fingers.up(6)
    start=position(page)
    fingers.tap(page,button("dodge"))
    step(page,.1)
    check("Dodge follows the current joystick direction",
          distance(start,position(page))>.5 and ev(page,"cryptDebug.game.player.dodgeCooldown>0"))
    fingers.up(1)
    step(page,.3)
    was_hidden=page.locator("#map").is_hidden()
    fingers.tap(page,button("map"))
    check("Map button toggles the map",page.locator("#map").is_hidden()!=was_hidden)
    fingers.tap(page,button("map"))

    # Rotation while fingers are down must cancel inputs, not leave a phantom
    # joystick using the old orientation's coordinates.
    mx,my=center(page,"#touchMove")
    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    page.set_viewport_size({"width":844,"height":391})
    page.wait_for_function("!cryptDebug.getInput().forward && !cryptDebug.getInput().strafe")
    check("Viewport rotation clears active movement",neutral(page))
    fingers.cancel()
    layout_check(page,"Landscape 844 x 391")
    page.set_viewport_size({"width":360,"height":640})
    layout_check(page,"Small portrait 360 x 640")

    mx,my=center(page,"#touchMove")
    fingers.down(1,mx,my)
    fingers.move(1,mx,my-45)
    ev(page,"cryptDebug.start(true)")
    isolate(page)
    check("Starting a fresh run clears all old pointers",neutral(page))
    fingers.cancel()

    fingers.tap(page,button("pause"))
    page.locator("#touchControlsMode").select_option("off")
    page.locator("#resume").tap()
    check("Manual controls-off hides touchscreen UI and clears state",
          not ev(page,"cryptDebug.touchState().enabled") and neutral(page))
    page.keyboard.press("F1")
    page.locator("#touchControlsMode").select_option("on")
    page.locator("#resume").tap()
    check("Manual controls-on restores touchscreen UI",ev(page,"cryptDebug.touchState().active"))
    check("Touch gestures do not scroll the document",ev(page,"scrollX===0 && scrollY===0"))
    context.close()


def desktop_suite(browser):
    context=browser.new_context(viewport={"width":1024,"height":700},has_touch=False)
    page=load(context)
    page.locator("#training").click()
    isolate(page)
    check("Desktop auto mode leaves touch controls disabled",not ev(page,"cryptDebug.touchState().enabled"))
    start=position(page)
    page.keyboard.down("w")
    step(page,.25)
    page.keyboard.up("w")
    check("Desktop WASD still moves the player",distance(start,position(page))>.5)
    stopped=position(page)
    step(page,.15)
    check("Desktop key release stops movement",distance(stopped,position(page))<1e-7)
    before=position(page)["yaw"]
    page.keyboard.down("ArrowRight")
    step(page,.2)
    page.keyboard.up("ArrowRight")
    check("Keyboard look fallback remains usable",abs(position(page)["yaw"]-before)>.1)
    locked=ev(page,"document.pointerLockElement===document.getElementById('gl')")
    check("Desktop user gesture captures Pointer Lock",locked)
    if locked:
        before=position(page)["yaw"]
        page.mouse.move(540,350)
        page.mouse.move(570,350)
        check("Locked desktop mouse rotates the camera",abs(position(page)["yaw"]-before)>.001)
    swings=ev(page,"cryptDebug.game.stats.swings")
    page.mouse.click(512,350)
    check("Desktop left click still creates one attack",ev(page,"cryptDebug.game.stats.swings")==swings+1)
    step(page,1)
    page.mouse.down(button="right")
    check("Desktop right mouse still holds guard",ev(page,"cryptDebug.game.player.guard"))
    page.mouse.up(button="right")
    check("Desktop right mouse release clears guard",not ev(page,"cryptDebug.game.player.guard"))
    context.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium",default=os.environ.get("CRYPT_TEST_CHROMIUM") or shutil.which("chromium"))
    parser.add_argument("--headed",action="store_true")
    parser.add_argument("--report",type=Path,default=ROOT/"tests/touch_browser_results.json")
    args=parser.parse_args()
    report={"suite":"trusted browser multitouch and desktop regression",
            "environment":"Chromium emulation; HTML set_content; no physical Android device",
            "status":"blocked","browser":None,"results":RESULTS,"errors":ERRORS}
    code=2
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=args.chromium,headless=not args.headed,args=[
                "--no-sandbox","--ignore-gpu-blocklist","--enable-webgl","--use-gl=angle",
                "--use-angle=swiftshader","--enable-unsafe-swiftshader"])
            report["browser"]=browser.version
            report["status"]="failed"
            try:
                mobile_suite(browser)
                desktop_suite(browser)
                check("No JavaScript exceptions during input tests",not ERRORS,ERRORS)
                check("Standalone build makes no external HTTP requests",not REQUESTS,REQUESTS)
            finally:
                browser.close()
            code=0 if all(r["passed"] for r in RESULTS) else 1
            report["status"]="passed" if code==0 else "failed"
    except Exception as e:
        report["reason"]=str(e)
        if report["browser"] is not None:
            check("Input regression suite completes without a harness/runtime exception",False,str(e))
            code=1
        print(report["status"].upper()+": "+str(e).splitlines()[0],flush=True)
    report.update(total=len(RESULTS),passed=sum(r["passed"] for r in RESULTS),
                  failed=sum(not r["passed"] for r in RESULTS),
                  external_requests=REQUESTS)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:report[k] for k in ["status","total","passed","failed"]}),flush=True)
    return code


if __name__=="__main__":
    sys.exit(main())
