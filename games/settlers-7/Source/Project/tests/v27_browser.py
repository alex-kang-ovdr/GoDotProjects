"""Real Chromium DOM checks for the exact v27 standalone document.

Run with Python + Playwright and a permitted Chromium installation. Optional:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium python tests/v27_browser.py

Fixtures explicitly arrange rosters through the shipping engine. They do not
replace DOM event handlers or the simulation with mocks. A blocked browser launch
is recorded as blocked with zero executed checks, never as a passing browser run.
This suite uses page.set_content; it makes no file:// or physical-device claim.
"""
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports'
REPORT.mkdir(exist_ok=True)
RESULT_PATH = REPORT / 'v27_browser_tests.json'
results, errors, requests = [], [], []
METHOD = 'Chromium exact v27 standalone via page.set_content; actual DOM input/click/download/import; viewport emulation only'


def require(value, message='assertion failed'):
    if not value:
        raise AssertionError(message)


def report_blocked(reason):
    report = {
        'suite': 'v27 formation and redeployment browser interaction',
        'method': METHOD,
        'status': 'blocked',
        'count': 0, 'passed': 0, 'failed': 0,
        'blockReason': str(reason)[:2500],
        'results': [], 'pageErrors': [], 'networkRequests': [],
        'limits': 'No DOM, visual, file://, browser-storage persistence or mobile-device result was verified by this run.'
    }
    RESULT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('BLOCKED: browser could not start; 0 checks executed', flush=True)


def check(name, fn):
    start = time.perf_counter()
    try:
        fn()
        results.append({'name': name, 'passed': True, 'ms': round((time.perf_counter() - start) * 1000)})
        print('PASS', name, flush=True)
    except Exception as exc:
        results.append({'name': name, 'passed': False, 'error': str(exc)})
        print('FAIL', name, str(exc)[:400], flush=True)


def run():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        report_blocked(exc)
        return 0
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(
                executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', '/usr/bin/chromium'),
                headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        except Exception as exc:
            report_blocked(exc)
            return 0
        page = browser.new_page(viewport={'width': 1440, 'height': 950}, has_touch=True)
        page.set_default_timeout(4500)
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.on('request', lambda request: requests.append(request.url))
        page.set_content((ROOT / 'Settlers7_Play_v27.html').read_text(encoding='utf-8'), wait_until='load')
        page.wait_for_function('window.S7App')
        ev = page.evaluate

        def tick(seconds):
            ev('(seconds) => {S7App.game.advance(seconds); S7App.render();}', seconds)

        def reset(owned=None):
            ev("""(owned) => {
                S7App.load(new S7.Game({ai:false}).serialize());
                S7App.paused=true;
                document.querySelector('#welcome').hidden=true;
                document.body.classList.remove('map-focus');
                const g=S7App.game;
                for (const sid of owned) g.capture(g.s.sectors[sid],0);
                g.s.sectors[0].units={pikeman:5,musketeer:2,novice:2,hawker:2};
                for (const sid of owned) g.s.sectors[sid].units={};
                S7App.focusSector(0); S7App.tab('strategy');
            }""", owned or [])

        def destination(sid):
            page.locator('#sectorSelect').select_option(str(sid))

        def fill(unit, value):
            page.locator('#missionUnit_' + unit).fill(str(value))

        def start():
            page.locator('#enableAI').uncheck()
            page.locator('#startGame').click()
            ev('S7App.paused=true; S7App.render()')
            require(ev('S7.runtimeVersion') == 27)
            require('v27' in page.locator('#status').inner_text())

        check('New kingdom starts through actual start control with v27 runtime', start)

        def friendly_editor():
            reset([1]); destination(1)
            require(page.locator('[data-mission-unit]').count() == 11)
            require(page.locator('#fromSector').input_value() == '0')
            require(page.locator('[data-exp="redeploy"]').is_disabled())
            require('선택 0 / 35명' in page.locator('#missionSelection').inner_text())

        check('Friendly destination offers all eleven unit types and requires an explicit selection', friendly_editor)

        def mixed_preview():
            before = ev('S7App.game.serialize()')
            fill('pikeman', 2); fill('novice', 1); fill('hawker', 1)
            require(not page.locator('[data-exp="redeploy"]').is_disabled())
            require(page.locator('[data-roster-remaining="pikeman"]').inner_text() == '3')
            require('선택 4 / 35명' in page.locator('#missionSelection').inner_text())
            require('이동 예상' in page.locator('.mission-preview[data-kind="redeploy"]').inner_text())
            require(ev('S7App.game.serialize()') == before)

        check('Mixed party inputs update remaining troops and read-only departure estimate', mixed_preview)

        def retain():
            ev('S7App.render();S7App.render()')
            require(page.locator('#missionUnit_pikeman').input_value() == '2')
            require(page.locator('#missionUnit_novice').input_value() == '1')
            require(page.locator('#missionUnit_hawker').input_value() == '1')

        check('Periodic panel refresh preserves the current composition draft', retain)

        def send_party():
            page.locator('[data-exp="redeploy"]').click()
            require(ev('S7App.game.s.expeditions.length') == 1)
            require(ev('S7App.game.s.expeditions[0].units') == {'pikeman': 2, 'novice': 1, 'hawker': 1})
            require(ev('S7App.game.s.sectors[0].units.pikeman') == 3)
            require(ev('S7App.game.s.sectors[1].units.pikeman||0') == 0)
            require(page.locator('.expedition-card').count() == 1)
            require(page.locator('#missionUnit_pikeman').input_value() == '0')

        check('Departure button creates a travelling party and clears only the dispatched draft', send_party)

        def locate_party():
            tick(1)
            pos = ev('S7App.game.pos(S7App.game.s.expeditions[0])')
            page.locator('[data-focus-expedition]').click()
            camera = ev('S7App.camera')
            require(abs(camera['x'] - pos[0] * 32) < .01)
            require(abs(camera['y'] - pos[1] * 32) < .01)

        check('Party locate button centers map on actual current simulation position', locate_party)

        def arrival():
            tick(30)
            require(page.locator('.expedition-card').count() == 0)
            require(ev('S7App.game.s.sectors[1].units.pikeman') == 2)
            require(ev('S7App.game.s.sectors[1].units.novice') == 1)
            require(ev('S7App.game.s.sectors[1].units.hawker') == 1)
            require(ev('S7App.game.audit().ok'))

        check('Travelling party actually arrives and becomes destination garrison', arrival)

        def origin_drafts():
            reset([1, 3])
            ev('S7App.game.s.sectors[3].units={pikeman:4};S7App.render()')
            destination(1); fill('pikeman', 2)
            page.locator('#fromSector').select_option('3')
            require(page.locator('#missionUnit_pikeman').input_value() == '0')
            fill('pikeman', 1)
            page.locator('#fromSector').select_option('0')
            require(page.locator('#missionUnit_pikeman').input_value() == '2')
            destination(3)
            require(page.locator('#missionUnit_pikeman').input_value() == '0')
            destination(1)
            require(page.locator('#missionUnit_pikeman').input_value() == '2')

        check('Different source and destination pairs preserve independent party drafts', origin_drafts)

        def clamp_draft():
            reset([1]); destination(1)
            fill('pikeman', 999)
            page.locator('#missionUnit_pikeman').press('Tab')
            require(page.locator('#missionUnit_pikeman').input_value() == '5')
            require(page.locator('#missionDraftNotice').is_visible())
            require(ev('S7App.game.s.expeditions.length') == 0)

        check('Out-of-range composition is visibly clamped without dispatching any unit', clamp_draft)

        def military_roster():
            reset(); destination(1)
            require(page.locator('[data-mission-unit]').count() == 5)
            page.locator('[data-roster-fill="clear"]').click()
            require(page.locator('[data-exp="military"]').is_disabled())
            fill('pikeman', 2); fill('musketeer', 1)
            page.locator('[data-exp="military"]').click()
            require(ev('S7App.game.s.expeditions[0].units') == {'pikeman': 2, 'musketeer': 1})
            require(ev('S7App.game.s.sectors[0].units.pikeman') == 3)
            require(ev('S7App.game.s.sectors[0].units.musketeer') == 1)

        check('Military departure honors exact per-type formation instead of an automatic total', military_roster)

        def quick_fill():
            reset(); destination(1)
            page.locator('#armyCount').fill('3')
            page.locator('[data-roster-fill="military"]').click()
            require(page.locator('#missionUnit_musketeer').input_value() == '2')
            require(page.locator('#missionUnit_pikeman').input_value() == '1')
            require('선택 3 / 35명' in page.locator('#missionSelection').inner_text())

        check('Quick formation fills the requested size while retaining manual editable counts', quick_fill)

        def siege_preview():
            reset([1]); ev('S7App.game.s.sectors[1].units={pikeman:4,musketeer:2};S7App.render()')
            destination(4); page.locator('[data-roster-fill="clear"]').click()
            fill('pikeman', 2)
            require(page.locator('[data-exp="military"]').is_disabled())
            require('성벽' in page.locator('.mission-preview[data-kind="military"]').inner_text())
            fill('musketeer', 1)
            require(not page.locator('[data-exp="military"]').is_disabled())

        check('Wall preview disables melee-only order and enables it after selecting ranged troops', siege_preview)

        def route_preview():
            reset([2]); destination(2); fill('pikeman', 1)
            require(page.locator('[data-exp="redeploy"]').is_disabled())
            require(page.locator('.mission-preview[data-kind="redeploy"] .mission-ready').inner_text() == '준비 필요')
            require(ev('S7App.game.s.expeditions.length') == 0)

        check('Disconnected friendly destination explains blocked departure before any command', route_preview)

        def recall():
            reset([1]); destination(1); fill('pikeman', 2)
            page.locator('[data-exp="redeploy"]').click(); tick(1)
            pos = ev('S7App.game.pos(S7App.game.s.expeditions[0])')
            page.locator('.expedition-card [data-act="retreat"]').click()
            require(ev('S7App.game.pos(S7App.game.s.expeditions[0])') == pos)
            require(ev('S7App.game.s.expeditions[0].phase') == 'return')
            tick(20)
            require(ev('S7App.game.s.sectors[0].units.pikeman') == 5)
            require(ev('S7App.game.s.sectors[1].units.pikeman||0') == 0)

        check('Move-cancel button recalls a party without teleporting or duplicating troops', recall)

        def button_focus():
            reset([1]); destination(1); fill('pikeman', 1)
            page.locator('[data-exp="redeploy"]').focus()
            ev('S7App.render()')
            require(ev('document.activeElement.dataset.exp') == 'redeploy')
            page.keyboard.press('Space')
            require(ev('S7App.game.s.expeditions.length') == 1)
            require(ev('S7App.paused'))

        check('Refreshed departure button retains keyboard focus and Space dispatches without toggling pause', button_focus)

        def help_keyboard():
            reset(); ev('S7App.paused=false')
            page.locator('#help').click()
            page.locator('#welcome').evaluate('(el) => {el.tabIndex=-1;el.focus()}')
            before = ev('S7App.game.s.tick')
            page.keyboard.press('Space'); page.wait_for_timeout(350)
            require(ev('S7App.paused')); require(ev('S7App.game.s.tick') == before)
            page.locator('#continueGame').click()
            require(not ev('S7App.paused')); ev('S7App.paused=true')

        check('Help overlay blocks simulation hotkeys and restores the prior running state', help_keyboard)

        def export_import():
            reset([1]); destination(1); fill('pikeman', 2); fill('hawker', 1)
            page.locator('[data-exp="redeploy"]').click(); tick(2)
            snapshot = ev('S7App.game.serialize()')
            with page.expect_download() as download:
                page.locator('#exportSave').click()
            save_path = REPORT / 'v27_browser_save.json'
            download.value.save_as(str(save_path))
            require(save_path.read_text(encoding='utf-8') == snapshot)
            page.locator('[data-tab="build"]').click()
            page.locator('[data-build="residence"]').click()
            require(ev('S7App.tool') is not None)
            tick(2)
            page.locator('#saveFile').set_input_files(str(save_path))
            page.wait_for_function('S7App.tool===null && S7App.paused')
            require(ev('S7App.game.serialize()') == snapshot)
            require(ev('S7App.game.s.expeditions[0].kind') == 'redeploy')
            require(ev('S7App.game.audit().ok'))

        check('Real JSON download and import preserve moving party and clear stale placement state', export_import)

        def portrait():
            reset([1]); page.set_viewport_size({'width': 412, 'height': 891})
            destination(1); page.wait_for_timeout(150)
            require(page.locator('#missionUnit_pikeman').is_visible())
            require(ev('document.documentElement.scrollWidth <= innerWidth + 1'))
            require(ev("document.querySelector('.mission-roster').scrollWidth <= document.querySelector('.mission-roster').clientWidth + 1"))

        check('Portrait viewport keeps the full composition table within available horizontal width', portrait)

        check('Actual interactive suite has no uncaught page errors', lambda: require(not errors, str(errors)))
        check('Standalone interaction requires no network assets', lambda: require(not requests, str(requests)))
        browser.close()

    out = {
        'suite': 'v27 formation and redeployment browser interaction', 'method': METHOD,
        'status': 'passed' if all(r['passed'] for r in results) else 'failed',
        'count': len(results), 'passed': sum(r['passed'] for r in results),
        'failed': sum(not r['passed'] for r in results),
        'pageErrors': errors, 'networkRequests': requests, 'results': results,
        'limits': 'page.set_content, not file://; no persistent-origin restart or physical touch-device verification.'
    }
    RESULT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print({k: out[k] for k in ['status', 'count', 'passed', 'failed']}, flush=True)
    return int(out['failed'] > 0)


if __name__ == '__main__':
    raise SystemExit(run())
