"""v4 state-fixture integration checks against the actual bundled WebGL game.

This harness uses real keyboard events for wheel, ability, and vehicle entry,
then fixed real-time ticks for repeatable assertions. Mission positions, actor
counts, and incident evidence are deliberately arranged as state fixtures; the
results are not a claim of an uninterrupted human playthrough. HTML is loaded
with Playwright set_content. Persistent-origin storage and physical devices are
not covered, and no browser storage API is mocked.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
import traceback

ROOT = Path(__file__).resolve().parents[1]
RESULTS = []
ERRORS = []
CONSOLE_ERRORS = []


def check(name, ok, detail=None):
    RESULTS.append({"name": name, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name,
          str(detail)[:300] if detail is not None else "", flush=True)


HELPERS = r"""() => {
  const g = HARBOR;
  g.manualTesting = true;
  g.hadLock = false;
  window.V4FIX = {
    reset(mode = 'free', approach = 'quiet', role = 'focus') {
      document.getElementById('approachSelect').value = approach;
      document.getElementById('abilitySelect').value = role;
      g.manualTesting = true; g.hadLock = false;
      g.reset(mode, false);
      g.started = true; g.running = true; g.mode = 'play';
      g.closeOverlays(); g.clearInput();
      document.getElementById('startScreen').hidden = true;
      document.getElementById('hud').hidden = false;
      document.activeElement?.blur();
      g.cheats.god = true; g.cheats.noPolice = false;
      g.render.quality = 'low'; g.spawnTimer = 999;
      g.npcs = [];
      g.cars = g.cars.filter(c => c.id === 'starter' || c.id === 'target');
      g.updateCamera(1, true);
      return this.state();
    },
    tick(seconds) {
      const full = Math.floor(seconds * 60 + 1e-8);
      for (let i = 0; i < full; i++) g.advanceReal(1 / 60);
      const rest = seconds - full / 60;
      if (rest > 1e-8) g.advanceReal(rest);
      return this.state();
    },
    driver(id = 'target', position = null) {
      const car = g.cars.find(c => c.id === id);
      for (const c of g.cars) if (c.seat.occupant === 'player') c.seat.occupant = null;
      if (position) { car.x = position[0]; car.z = position[2]; }
      car.y = g.world.supportHeight(car.x, car.z, .35);
      car.speed = car.vx = car.vz = 0; car.traffic = false;
      car.seat.occupant = 'player'; car.seat.lease = null;
      g.player.carId = id; g.player.transition = null;
      g.player.pos = [car.x, car.y + .25, car.z]; g.player.vel = [0, 0, 0];
      g.player.grounded = true; g.player.hp = 100;
      g.clearInput();
      return car;
    },
    exit() {
      for (const c of g.cars) if (c.seat.occupant === 'player') c.seat.occupant = null;
      g.player.carId = null; g.player.transition = null;
    },
    acquire() { this.driver(); this.tick(1 / 60); return this.state(); },
    deliverReady(approach = 'quiet') {
      this.reset('mission', approach);
      this.acquire(); this.tick(3.1);
      this.driver('target', [-108, 0, 104]);
      return this.state();
    },
    pending(id = 'fixture-report') {
      const n = g.spawnNPC('civilian', [0, 0, 166]);
      n.idle = 999; n.panic = 0; n.shotCD = 999;
      g.reportQueue.enqueue({
        incidentId: id, witnessId: n.id, witnessType: 'civilian',
        level: 1, pos: g.player.pos.slice(), observedAt: g.time
      });
      return n.id;
    },
    state() {
      return {
        time: g.time, phase: g.phase, running: g.running, mode: g.mode,
        wallet: g.ledger.wallet, player: {
          hp: g.player.hp, armor: g.player.armor, weapon: g.player.weapon,
          carId: g.player.carId, pos: g.player.pos.slice(),
          transitioning: !!g.player.transition, jumpWindup: g.player.jumpWindup || 0
        },
        wheel: { open: g.wheel.open, selected: g.wheel.selected },
        ability: g.ability.serialize(),
        contract: g.contract ? g.contract.snapshot() : null,
        pending: g.reportQueue.pendingCount, wanted: g.wanted.level,
        carCount: g.cars.filter(c => c.id === 'target').length,
        ammo: g.mags[g.player.weapon].ammo,
        reloading: !!g.mags[g.player.weapon].reload
      };
    }
  };
  return true;
}"""


with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
        headless=True,
        args=["--no-sandbox", "--use-gl=angle", "--use-angle=gl-egl",
              "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
    page.on("pageerror", lambda error: ERRORS.append(str(error)))
    page.on("console", lambda message: CONSOLE_ERRORS.append(message.text) if message.type == "error" else None)

    def scenario(name, function):
        try:
            value = function()
            if isinstance(value, dict) and "ok" in value:
                check(name, value.pop("ok"), value)
            else:
                check(name, bool(value))
        except Exception as error:
            check(name, False, str(error))
            traceback.print_exc()

    def js_scenario(name, script):
        scenario(name, lambda: page.evaluate(script))

    try:
        page.set_content((ROOT / "index.html").read_text(), wait_until="load")
        page.wait_for_timeout(250)
        ready = page.evaluate("!!window.HARBOR && typeof HARBOR.advanceReal === 'function' && !!HARBOR.ability && !!window.HarborMission")
        check("Bundled v4 WebGL runtime initializes", ready)
        if not ready:
            raise RuntimeError("v4 integration has not been built into index.html")
        page.evaluate(HELPERS)

        def visible_start():
            page.locator("#approachSelect").select_option("direct")
            page.locator("#abilitySelect").select_option("driving")
            page.locator("#startMission").click()
            page.evaluate("HARBOR.manualTesting=true;HARBOR.hadLock=false")
            return page.evaluate("({ok:HARBOR.contract.approach==='direct' && HARBOR.ability.role==='driving' && HARBOR.phase==='reach', approach:HARBOR.contract.approach, role:HARBOR.ability.role, phase:HARBOR.phase})")

        scenario("Visible start selections create the chosen mission route and role", visible_start)

        def wheel_keys():
            page.evaluate("V4FIX.reset();HARBOR.switchWeapon(0)")
            page.keyboard.down("Tab")
            page.keyboard.press("3")
            held = page.evaluate("V4FIX.state()")
            before = held["time"]
            during = page.evaluate("V4FIX.tick(2)")
            page.keyboard.up("Tab")
            after = page.evaluate("V4FIX.state()")
            delta = during["time"] - before
            return {
                "ok": held["wheel"]["open"] and held["wheel"]["selected"] == 2
                and held["player"]["weapon"] == 0 and not after["wheel"]["open"]
                and after["player"]["weapon"] == 2 and abs(delta - .3) < .04,
                "held": held["wheel"], "equippedBeforeRelease": held["player"]["weapon"],
                "equippedAfterRelease": after["player"]["weapon"], "worldSecondsOverTwoRealSeconds": delta,
            }

        scenario("Tab hold selects with Digit3, slows world time, and equips on release", wheel_keys)

        js_scenario("Wheel masks firing, reload, jump and vehicle interaction", """() => {
          V4FIX.reset(); const g=HARBOR, mag=g.mags[g.player.weapon];
          mag.ammo-=1; const before=mag.ammo;
          g.openWeaponWheel(); const fired=g.shoot(); g.reload();g.jump();g.interact();
          const result={ok:fired===false && mag.ammo===before && !mag.reload && !g.player.transition && !g.player.jumpBuffer,
            fired,ammo:mag.ammo,reloading:!!mag.reload,transition:!!g.player.transition,jumpBuffer:g.player.jumpBuffer};
          g.closeWeaponWheel(false); return result;
        }""")

        def ability_key():
            page.evaluate("V4FIX.reset('free','quiet','focus')")
            page.keyboard.press("f")
            state = page.evaluate("V4FIX.tick(2)")
            return {"ok": state["ability"]["active"]
                    and abs(state["ability"]["energy"] - 75) < .01
                    and abs(state["time"] - .7) < .04,
                    "energyAfterTwoRealSeconds": state["ability"]["energy"],
                    "gameSeconds": state["time"], "active": state["ability"]["active"]}

        scenario("F activates focus and drains energy by real time while slowing game time", ability_key)

        js_scenario("Pause freezes both game time and real-time ability consumption", """() => {
          V4FIX.reset();const g=HARBOR;g.toggleAbility();V4FIX.tick(.5);g.pause();
          const before=V4FIX.state();V4FIX.tick(2);const after=V4FIX.state();
          return {ok:before.time===after.time && before.ability.energy===after.ability.energy && !after.running,
            gameTimeBefore:before.time,gameTimeAfter:after.time,energyBefore:before.ability.energy,energyAfter:after.ability.energy};
        }""")

        js_scenario("Wheel plus focus keeps real-time drain and uses the slower world scale", """() => {
          V4FIX.reset();const g=HARBOR;g.toggleAbility();g.openWeaponWheel();
          const s=V4FIX.tick(2);g.closeWeaponWheel(false);
          return {ok:Math.abs(s.ability.energy-75)<.01 && Math.abs(s.time-.3)<.04,
            energy:s.ability.energy,gameSeconds:s.time,expectedScale:.15};
        }""")

        js_scenario("Driving ability rejects on-foot activation and activates in the driver seat", """() => {
          V4FIX.reset('free','quiet','driving');const g=HARBOR;
          g.toggleAbility();const onFoot=g.ability.active;
          V4FIX.driver('starter');g.toggleAbility();const driving=g.ability.active;
          V4FIX.tick(1);const s=V4FIX.state();
          return {ok:!onFoot && driving && Math.abs(s.ability.energy-87.5)<.01 && Math.abs(s.time-.35)<.04,
            onFoot,driving,energy:s.ability.energy,gameSeconds:s.time};
        }""")

        js_scenario("Leaving the driver seat automatically ends the driving ability", """() => {
          V4FIX.reset('free','quiet','driving');V4FIX.driver('starter');HARBOR.toggleAbility();
          V4FIX.exit();V4FIX.tick(1/60);
          return {ok:!HARBOR.ability.active && HARBOR.ability.cooldownRemaining>0,
            active:HARBOR.ability.active,stopReason:HARBOR.ability.lastStopReason,cooldown:HARBOR.ability.cooldownRemaining};
        }""")

        js_scenario("On-foot ability refuses a vehicle seat and an active seat transition", """() => {
          V4FIX.reset();V4FIX.driver('starter');HARBOR.toggleAbility();const seated=HARBOR.ability.active;
          V4FIX.exit();HARBOR.player.transition={type:'enter'};HARBOR.toggleAbility();const transition=HARBOR.ability.active;
          HARBOR.player.transition=null;
          return {ok:!seated && !transition,seated,transition};
        }""")

        js_scenario("Live weapon definitions use v4 tuning and preserve compatible magazine sizes", """() => {
          const expected={pistol:28,smg:15,rifle:24,shotgun:9,marksman:90};
          const weapons=GAME_DATA.weapons.map(w=>({id:w.id,damage:w.damage,cap:w.cap,revision:w.dataRevision}));
          return {ok:weapons.every((w,i)=>w.damage===expected[w.id] && w.cap===[12,30,30,6,8][i] && w.revision==='4.0.0'),weapons};
        }""")

        js_scenario("Live health recovery waits eight game seconds and preserves armor", """() => {
          V4FIX.reset();const g=HARBOR;g.player.hp=20;g.player.armor=13;g.lastDamage=g.time;
          V4FIX.tick(8);const delayed=g.player.hp;V4FIX.tick(1);const healed=g.player.hp;
          return {ok:Math.abs(delayed-20)<.001 && Math.abs(healed-24)<.1 && g.player.armor===13,
            atEightSeconds:delayed,atNineSeconds:healed,armor:g.player.armor};
        }""")

        for approach in ["quiet", "direct"]:
            js_scenario(f"{approach} route uses its configured objective and optional beacon", f"""() => {{
              V4FIX.reset('mission','{approach}');const c=HARBOR.contract,d=HarborContracts.harbor_recovery;
              const objective=c.objective();
              return {{ok:c.approach==='{approach}' && JSON.stringify(objective.goal)===JSON.stringify(d.approaches['{approach}'].beacon),
                approach:c.approach,goal:objective.goal,routeCue:objective.routeCue}};
            }}""")

        def checkpoint_entry():
            page.evaluate("V4FIX.reset('mission');HARBOR_TEST.position([102.3,0,-120])")
            page.keyboard.press("e")
            acquired = page.evaluate("V4FIX.tick(.95)")
            saved = page.evaluate("HARBOR.checkpoint")
            restored = page.evaluate("""() => {
              HARBOR.fail('state-fixture retry');HARBOR.hadLock=false;HARBOR.retry();HARBOR.hadLock=false;
              return V4FIX.state();
            }""")
            return {
                "ok": acquired["player"]["carId"] == "target" and acquired["contract"]["acquired"]
                and saved["gameplayV4"]["contract"]["acquired"]
                and saved["player"]["carId"] == "target"
                and restored["player"]["carId"] == "target" and restored["carCount"] == 1
                and restored["contract"]["acquired"],
                "acquiredPhase": acquired["phase"], "checkpointPhase": saved["phase"],
                "restoredPhase": restored["phase"], "targetCount": restored["carCount"],
            }

        scenario("Actual E seat transaction captures and restores the acquisition checkpoint", checkpoint_entry)

        js_scenario("Unresolved witness report blocks live depot delivery even at wanted zero", """() => {
          V4FIX.deliverReady();const g=HARBOR,before=g.ledger.wallet;
          V4FIX.pending();const s=V4FIX.tick(.5);
          return {ok:s.wanted===0 && s.pending===1 && s.phase==='escape' && s.contract.hold===0 && s.wallet===before,
            wanted:s.wanted,pending:s.pending,phase:s.phase,hold:s.contract.hold,walletDelta:s.wallet-before};
        }""")

        js_scenario("Re-wanted interrupts a partial depot hold and prevents early reward", """() => {
          V4FIX.deliverReady();const g=HARBOR,before=g.ledger.wallet;
          V4FIX.tick(1);const holdBefore=g.contract.hold;
          g.wanted.report('fixture-rewanted',1,g.player.pos);V4FIX.tick(.1);
          return {ok:holdBefore>.9 && g.phase==='escape' && g.contract.hold===0 && g.ledger.wallet===before,
            holdBefore,holdAfter:g.contract.hold,phase:g.phase,walletDelta:g.ledger.wallet-before};
        }""")

        js_scenario("Exiting the target returns to recover while preserving acquired state", """() => {
          V4FIX.deliverReady();V4FIX.tick(.5);const before=HARBOR.contract.acquiredAt;
          V4FIX.exit();const s=V4FIX.tick(.1);
          return {ok:s.phase==='recover' && s.contract.acquired && s.contract.acquiredAt===before && s.contract.hold===0,
            phase:s.phase,acquired:s.contract.acquired,hold:s.contract.hold};
        }""")

        js_scenario("Death on the delivery frame preempts completion in the actual mission adapter", """() => {
          V4FIX.deliverReady();V4FIX.tick(1.2);const g=HARBOR,before=g.ledger.wallet;
          g.player.hp=0;V4FIX.tick(.1);
          return {ok:g.contract.phase==='failed' && g.ledger.wallet===before && !g.running,
            phase:g.phase,contractPhase:g.contract.phase,mode:g.mode,walletDelta:g.ledger.wallet-before};
        }""")

        for approach in ["quiet", "direct"]:
            js_scenario(f"{approach} contract completes once with three medals and fixed 750 reward", f"""() => {{
              V4FIX.deliverReady('{approach}');const g=HARBOR,before=g.ledger.wallet;
              V4FIX.tick(1.35);const phase=g.phase,medals=g.contract.medals(),reward=g.ledger.wallet-before;
              g.updateMission(1);g.updateMission(1);g.updateMission(1);
              return {{ok:phase==='complete' && reward===750 && g.ledger.wallet-before===750 && medals.filter(m=>m.earned).length===3,
                phase,reward,afterRepeatedUpdates:g.ledger.wallet-before,medals:medals.map(m=>({{id:m.id,earned:m.earned}}))}};
            }}""")

        js_scenario("v4 roundtrip restores role, route, energy and pending evidence", """() => {
          V4FIX.reset('mission','direct','driving');V4FIX.acquire();HARBOR.toggleAbility();V4FIX.tick(.5);
          V4FIX.pending('roundtrip-evidence');const g=HARBOR,saved=g.capture(),oldEpoch=g.reportQueue.epoch;
          g.player.hp=15;g.ability.energy=5;g.events=[];
          g.restore(saved);const next=g.capture(),a=saved.gameplayV4,b=next.gameplayV4;
          return {ok:g.player.hp===saved.player.hp && g.player.carId==='target' && b.approach==='direct' &&
            b.ability.role==='driving' && Math.abs(b.ability.energy-a.ability.energy)<1e-9 && !b.ability.active &&
            b.ability.cooldownRemaining>=3 && JSON.stringify(b.contract)===JSON.stringify(a.contract) &&
            b.reportQueue.pending.length===1 && JSON.stringify(b.reportQueue.pending[0].pos)===JSON.stringify(a.reportQueue.pending[0].pos),
            role:b.ability.role,approach:b.approach,energy:b.ability.energy,activeAfterRestore:b.ability.active,
            pending:b.reportQueue.pending.length,oldEpoch,newEpoch:g.reportQueue.epoch};
        }""")

        js_scenario("Legacy v3 snapshot without gameplayV4 migrates the actual target driver", """() => {
          V4FIX.reset('mission');V4FIX.acquire();V4FIX.tick(3.1);const g=HARBOR,saved=g.capture();
          delete saved.gameplayV4;saved.build='3.0.0';g.restore(saved);
          const current=g.capture();
          return {ok:g.player.carId==='target' && g.targetCar().seat.occupant==='player' &&
            g.contract.acquired && !!current.gameplayV4 && current.gameplayV4.version===4 && g.ledger.wallet===saved.wallet,
            phase:g.phase,acquired:g.contract.acquired,extensionVersion:current.gameplayV4?.version,wallet:g.ledger.wallet};
        }""")

        for kind in ["ability", "contract", "reportQueue", "civilianCasualties"]:
            mutations = {
                "ability": "bad.gameplayV4.ability.energy=999",
                "contract": "bad.gameplayV4.contract.hold=999",
                "reportQueue": "bad.gameplayV4.reportQueue.epoch=-1",
                "civilianCasualties": "bad.gameplayV4.civilianCasualties=-1",
            }
            js_scenario(f"Invalid {kind} extension is rejected before any runtime mutation", f"""() => {{
              V4FIX.reset('mission');V4FIX.acquire();const g=HARBOR,before=JSON.stringify(g.capture());
              const bad=JSON.parse(before);{mutations[kind]};let caught=false,message='';
              try{{g.restore(bad);}}catch(error){{caught=true;message=error.message;}}
              return {{ok:caught && JSON.stringify(g.capture())===before,caught,message,unchanged:JSON.stringify(g.capture())===before}};
            }}""")

        js_scenario("Restoring a completed save does not regrant the reward", """() => {
          V4FIX.deliverReady();V4FIX.tick(1.35);const g=HARBOR,saved=g.capture(),wallet=g.ledger.wallet;
          g.restore(saved);g.running=true;g.mode='play';g.closeOverlays();V4FIX.tick(2);
          return {ok:g.ledger.wallet===wallet && g.contract.phase==='complete',walletBefore:wallet,walletAfter:g.ledger.wallet,phase:g.phase};
        }""")

        js_scenario("v3 forward movement and jump floor support remain functional", """() => {
          V4FIX.reset();const g=HARBOR,p0=g.player.pos.slice();g.keys.add('KeyW');V4FIX.tick(1);g.keys.clear();
          const moved=g.player.pos[2]<p0[2]-3;const floor=g.player.pos[1];g.jump();V4FIX.tick(.2);const high=g.player.pos[1];
          V4FIX.tick(1.5);return {ok:moved && high>floor+.3 && Math.abs(g.player.pos[1]-floor)<.001,
            moved,baseFloor:floor,jumpHeight:high,landed:g.player.pos[1]};
        }""")

        js_scenario("Final WebGL frame renders without GL error", """() => {
          HARBOR_TEST.render();const error=HARBOR.render.gl.getError();return {ok:error===0,glError:error};
        }""")
    except Exception as error:
        check("Harness initialization completes", False, str(error))
        traceback.print_exc()
    finally:
        check("No uncaught browser JavaScript errors", not ERRORS, ERRORS)
        check("No runtime console errors", not CONSOLE_ERRORS, CONSOLE_ERRORS)
        report = {
            "suite": "v4 live gameplay state-fixture integration",
            "transport": "Playwright set_content; actual bundled index.html",
            "renderer": "Chromium ANGLE gl-egl software environment",
            "scope": "Real input and fixed real-time ticks with explicit world/actor fixtures; not an uninterrupted human playthrough",
            "persistent_origin_storage": "NOT TESTED; no storage mocks",
            "physical_devices": "NOT TESTED",
            "passed": sum(r["pass"] for r in RESULTS),
            "total": len(RESULTS),
            "results": RESULTS,
            "errors": ERRORS,
            "consoleErrors": CONSOLE_ERRORS,
        }
        (ROOT / "reports").mkdir(exist_ok=True)
        (ROOT / "reports/gameplay-v4-browser.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
        browser.close()
        print("TOTAL", report["passed"], "/", report["total"], flush=True)
        if report["passed"] != report["total"]:
            raise SystemExit(1)
