#!/usr/bin/env python3
"""Run the actual Godot suites; no package installation required."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--godot', default=shutil.which('godot') or shutil.which('godot4'))
parser.add_argument('--balance', action='store_true', help='Also run the longer natural-stat bot probe')
args = parser.parse_args()
if not args.godot:
    sys.exit('Godot 4.6.3 executable not found. Use --godot PATH.')
suites = ['sim_regression', 'integration_regression', 'ui_regression', 'render_smoke',
          'g2_combat_regression', 'g2_integration_regression', 'g2_ui_regression', 'g2_render_regression']
if args.balance:
    suites.append('balance_probe')
def run(command, timeout=90):
    try:
        result = subprocess.run(command, cwd=ROOT, text=True, encoding='utf-8', errors='replace', stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        print('TIMEOUT:', command, flush=True)
        print(exc.stdout.decode(errors='replace') if isinstance(exc.stdout, bytes) else exc.stdout or '')
        return False
    print(result.stdout, end='', flush=True)
    # Godot can exit 0 after a script error during editor import. Treat it as a failure.
    return result.returncode == 0 and not any(marker in result.stdout for marker in ['SCRIPT ERROR:', 'ERROR:', 'Parse Error:'])

if not run([args.godot, '--headless', '--editor', '--path', str(ROOT), '--import', '--quit']):
    sys.exit(1)
failed = []
reports = {
    'sim_regression':'sim_regression_report.json',
    'integration_regression':'integration_report.json',
    'ui_regression':'ui_regression_report.json',
    'render_smoke':'render_report.json',
    'g2_combat_regression':'g2_combat_regression_report.json',
    'g2_integration_regression':'g2_integration_report.json',
    'g2_ui_regression':'g2_ui_regression_report.json',
    'g2_render_regression':'g2_render_report.json',
    'balance_probe':'balance_probe_report.json',
}
for name in suites:
    print('\nRUN', name, flush=True)
    report_path = ROOT/'tests'/reports[name]
    report_path.unlink(missing_ok=True)
    ok = run([args.godot, '--headless', '--path', str(ROOT), '--script', f'res://tests/{name}.gd', '--', '--qa'],
             timeout=240 if name == 'balance_probe' else 90)
    if not report_path.is_file():
        print('Missing fresh report:', report_path.name, flush=True)
        ok = False
    elif json.loads(report_path.read_text(encoding="utf-8")).get('failed', 0):
        ok = False
    if not ok:
        failed.append(name)
print('\nFAILED:', ', '.join(failed) if failed else 'none')
sys.exit(bool(failed))
