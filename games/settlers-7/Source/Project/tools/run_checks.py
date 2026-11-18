"""Build and check the exact v27 shipping sources; browser checks are optional.
Blocked browser launches are recorded as blocked, never as passing tests.
Only checks run against unchanged source hashes enter the release totals.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import argparse
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--browser', action='store_true')
args = parser.parse_args()

def source_hashes():
    files = sorted([*ROOT.glob('game/*'), *ROOT.glob('tests/*.js'),
                    *ROOT.glob('tests/*.py'), *ROOT.glob('tests/fixtures/*.json'),
                    *ROOT.glob('data/*.json'), ROOT / 'reference/BASELINE_v26.json',
                    ROOT / 'tools/build_standalone.py', ROOT / 'tools/run_checks.py',
                    ROOT / 'Settlers7_Play_v27.html'])
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in files if p.is_file()}

def call(command, logname, timeout=180):
    print('RUN', ' '.join(command), flush=True)
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                timeout=timeout, check=False)
        text, code = result.stdout + result.stderr, result.returncode
    except (OSError, subprocess.TimeoutExpired) as exc:
        text, code = str(exc), 1
    (REPORTS / logname).write_text(text, encoding='utf-8')
    print(text[-1800:], flush=True)
    return code

failed = []
if call([sys.executable, 'tools/build_standalone.py'], 'build_console.txt'):
    raise SystemExit('Standalone build failed.')
before = source_hashes()
for name in ['data.js', 'engine.js', 'ui.js']:
    if call(['node', '--check', 'game/' + name], name + '_syntax.txt'):
        failed.append('syntax:' + name)

html = (ROOT / 'Settlers7_Play_v27.html').read_text(encoding='utf-8')
template = (ROOT / 'game/index.html').read_text(encoding='utf-8')
template = template.replace('<link rel="stylesheet" href="style.css">',
                            '<style>' + (ROOT / 'game/style.css').read_text(encoding='utf-8') + '</style>')
for name in ['data.js', 'engine.js', 'ui.js']:
    code = (ROOT / 'game' / name).read_text(encoding='utf-8').replace('</script', '<\\/script')
    template = template.replace('<script src="' + name + '"></script>', '<script>' + code + '</script>')
build_check = {'exactSourceEmbedding': html == template,
               'externalScriptTag': '<script src=' in html,
               'externalStylesheetTag': '<link rel="stylesheet"' in html,
               'bytes': (ROOT / 'Settlers7_Play_v27.html').stat().st_size}
if not build_check['exactSourceEmbedding'] or build_check['externalScriptTag'] or build_check['externalStylesheetTag']:
    failed.append('standalone-integrity')
(REPORTS / 'build_integrity.json').write_text(json.dumps(build_check, indent=2))

suites = []
engine_suites = [('engine.test.js', 'engine_tests.json'), ('v25.test.js', 'v25_engine_tests.json'),
                 ('v26.test.js', 'v26_engine_tests.json'), ('v27.test.js', 'v27_engine_tests.json')]
template_suites = [('v27_templates.test.js', 'v27_template_tests.json')]
browser_suites = [('v27_browser.py', 'v27_browser_tests.json'), ('browser_test.py', 'browser_tests.json'),
                  ('v25_browser.py', 'v25_browser_tests.json'), ('v26_browser.py', 'v26_browser_tests.json')]

def run_suite(kind, filename, reportname):
    report = REPORTS / reportname
    report.unlink(missing_ok=True)
    command = (['node'] if kind in ('engine', 'template') else [sys.executable]) + ['tests/' + filename]
    code = call(command, filename + '_console.txt')
    data = json.loads(report.read_text()) if report.exists() else {}
    blocked = kind == 'browser' and data.get('status') == 'blocked'
    status = 'blocked' if blocked else 'passed' if code == 0 and data and not data.get('failed') else 'failed'
    item = {'kind': kind, 'file': reportname, 'script': filename, 'status': status,
            'count': data.get('count', 0), 'passed': data.get('passed', 0),
            'failed': data.get('failed', 0), 'exitCode': code}
    if blocked:
        item['count'] = item['passed'] = item['failed'] = 0
        item['reason'] = data.get('blockReason', data.get('reason', 'Browser launch unavailable'))
    if status == 'failed':
        failed.append(filename)
    suites.append(item)
    return status

for script, report in engine_suites:
    run_suite('engine', script, report)
for script, report in template_suites:
    run_suite('template', script, report)
if args.browser:
    blocked = False
    for script, report in browser_suites:
        if blocked:
            (REPORTS / report).write_text(json.dumps({
                'status': 'blocked', 'count': 0, 'passed': 0, 'failed': 0,
                'blockReason': 'Same browser executable cannot launch in this environment.',
                'results': [], 'skippedAfterLaunchFailure': True
            }, indent=2), encoding='utf-8')
            suites.append({'kind': 'browser', 'file': report, 'script': script,
                           'status': 'blocked', 'count': 0, 'passed': 0, 'failed': 0,
                           'reason': 'Same browser executable cannot launch in this environment.'})
            continue
        blocked = run_suite('browser', script, report) == 'blocked'
else:
    for script, report in browser_suites:
        (REPORTS / report).unlink(missing_ok=True)
        suites.append({'kind': 'browser', 'file': report, 'script': script,
                       'status': 'not_run', 'count': 0, 'passed': 0, 'failed': 0})
after = source_hashes()
if before != after:
    failed.append('source-changed-during-checks')
browser_status = sorted(set(x['status'] for x in suites if x['kind'] == 'browser'))
status = 'failed' if failed else 'passed' if browser_status == ['passed'] else 'passed_without_browser_verification'
summary = {'version': 27, 'verifiedAt': datetime.now(timezone(timedelta(hours=9))).isoformat(),
           'status': status, 'failures': failed, 'suites': suites,
           'sourceHashes': after, 'sourceUnchangedDuringChecks': before == after,
           'reportHashes': {s['file']: hashlib.sha256((REPORTS / s['file']).read_bytes()).hexdigest()
                            for s in suites if (REPORTS / s['file']).exists()},
           'build': build_check, 'python': sys.version.split()[0],
           'node': subprocess.check_output(['node', '--version'], text=True).strip()}
(REPORTS / 'check_run.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': summary['status'], 'failures': failed,
                  'enginePassed': sum(x['passed'] for x in suites if x['kind'] == 'engine'),
                  'templatePassed': sum(x['passed'] for x in suites if x['kind'] == 'template'),
                  'browserStatus': browser_status}, ensure_ascii=False))
raise SystemExit(bool(failed))
