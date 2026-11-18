"""Render the exact offline HTML and save unedited screenshots. No network server."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True,
        args=['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl',
              '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
    )
    page = browser.new_page(viewport={'width':1440, 'height':900}, device_scale_factor=1)
    errors, logs = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: logs.append({'type':m.type, 'text':m.text}))
    page.set_content((ROOT / 'index.html').read_text(encoding='utf-8'), wait_until='load')
    page.wait_for_function('!!window.HARBOR && HARBOR.render.frames > 0')
    page.screenshot(path=str(ROOT / 'reports/title.png'))
    page.locator('#startMission').click()
    page.wait_for_timeout(500)
    page.screenshot(path=str(ROOT / 'reports/gameplay.png'))
    page.evaluate('HARBOR.manualTesting=true;HARBOR.hadLock=false')
    page.keyboard.press('e')
    page.evaluate('HARBOR_TEST.step(55);HARBOR_TEST.render()')
    page.screenshot(path=str(ROOT / 'reports/driving.png'))
    report = {'errors':errors, 'logs':logs,
              'transport':'set_content, exact index.html',
              'screenshots':['title.png', 'gameplay.png', 'driving.png']}
    (ROOT / 'reports/smoke.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    browser.close()
    print('SMOKE', 'PASS' if not errors else 'FAIL', errors)
    if errors:
        raise SystemExit(1)
