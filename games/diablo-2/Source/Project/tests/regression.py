"""Real-browser system test runner. NOT executed in the restricted delivery environment."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, shutil, time

root = Path(__file__).resolve().parents[1]
cases = ['cases_v27.js','cases_combat_v28.js','cases_encounters_v28.js','cases_persistence_v28.js','cases_feedback_v28.js']
with sync_playwright() as pw:
    options = {'headless': os.environ.get('DD_HEADED') != '1'}
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    if executable:
        options['executable_path'] = executable
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width':1440,'height':1050})
    errors, requests, reports = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda e: requests.append(e.url))
    page.evaluate('window.__DD_TEST__=true; window.__DD_CONTROLLED__=true; window.__DD_MANUAL_RENDER__=true;')
    page.set_content((root/'index.html').read_text(encoding='utf-8'))
    for name, key in [('v27_fixture.json','__DD_V27_FIXTURE__'),('v27_minion_fixture.json','__DD_V27_MINION_FIXTURE__')]:
        page.evaluate('([key,value])=>{window[key]=value}',[key,(root/'tests'/name).read_text(encoding='utf-8')])
    for name in cases:
        started = time.time()
        report = page.evaluate((root/'tests'/name).read_text(encoding='utf-8'))
        report.update(caseFile=name, seconds=round(time.time()-started,3))
        reports.append(report)
    result = {'execution':'Chromium Playwright set_content; system cases, no file:// or user-input proof','browser':browser.version,'reports':reports,'pageErrors':errors,'networkRequests':requests}
    (root/'tests/browser_results_v28_1.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':sum(r['passed'] for r in reports),'failed':sum(r['failed'] for r in reports),'pageErrors':errors},ensure_ascii=False))
    browser.close()
    if errors or any(r['failed'] for r in reports):
        raise SystemExit(1)
