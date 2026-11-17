#!/usr/bin/env python3
"""Browser tests. Requires Python Playwright + Chromium. Linux: xvfb-run -a python tests/browser_regression.py
Uses page.set_content: does not depend on a web server or network. Local storage may be denied for an opaque origin.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests'; OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1080},device_scale_factor=1)
    errors=[]; requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.evaluate('window.__DD_TEST__=true;window.__DD_CONTROLLED__=true;')
    page.set_content((ROOT/'index.html').read_text(encoding='utf-8'),wait_until='load')
    page.wait_for_timeout(150)
    report=page.evaluate((OUT/'cases.js').read_text(encoding='utf-8'))
    report['environment']={'browser':browser.version,'headless':True,'webgl':page.evaluate('!!document.createElement("canvas").getContext("webgl")'),'execution':'single HTML via page.set_content; opaque origin','requests':requests}
    # Real DOM interactions, responsive layout and skill-upgrade button wiring.
    page.evaluate('DarkDescentQA.newGame("knight",222); DarkDescentQA.S.p.points=3; DarkDescentQA.refresh();')
    page.locator('[data-tab="skillsTab"]').click()
    page.locator('[data-passive="power"]').click()
    report['ui']={'passive_button':page.evaluate('DarkDescentQA.S.p.passives.power===1'), 'canvas_bounds':page.locator('#hud').bounding_box()}
    page.locator('[data-hotbar="2"]').click()
    report['ui']['hotbar_consumes_mana']=page.evaluate('DarkDescentQA.S.p.mp<DarkDescentQA.S.p.maxMp')
    page.locator('#mode').click(); report['ui']['mode_switch_2d']=page.evaluate('DarkDescentQA.mode==="2d"');page.locator('#mode').click()
    page.locator('[data-tab="journalTab"]').click();page.locator('#dungeonTest').click()
    report['ui']['verify_button']=page.locator('#modal').is_visible() and '오류 0개' in page.locator('#dialogBody').inner_text()
    page.locator('#dialogClose').click()
    page.locator('[data-tab="gearTab"]').click()
    # Desktop screenshot uses a genuine explored area; no external concept art.
    page.evaluate('DarkDescentQA.newGame("mage",24896);DarkDescentQA.render();')
    page.screenshot(path=str(OUT/'desktop.png'))
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
    report['ui']['mobile_no_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report['ui']['mobile_controls_visible']=page.locator('.mobile').is_visible()
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    report['pageerrors']=errors;report['ui_pass']=all(v for v in report['ui'].values() if isinstance(v,bool))
    (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'total':report['total'],'passed':report['passed'],'failed':report['failed'],'failed_tests':[r for r in report['tests'] if not r['pass']],'ui':report['ui'],'pageerrors':errors,'webgl':report['environment']['webgl']},ensure_ascii=False,indent=2))
    browser.close()
    if report['failed'] or errors or not report['ui_pass']: raise SystemExit(1)
