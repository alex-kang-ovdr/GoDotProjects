#!/usr/bin/env python3
"""Run the actual Godot engine suite; script errors are failures even with exit 0."""
from pathlib import Path
import os, re, subprocess, sys
root = Path(__file__).resolve().parents[1]
engine = os.environ.get('GODOT_BINARY', 'godot')
result = subprocess.run([engine, '--headless', '--path', str(root), '--script', 'tools/run_tests.gd'], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
log = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout)
(root / 'docs' / 'validation.log').write_text(log, encoding='utf-8')
print(log, end='')
if result.returncode or 'SCRIPT ERROR:' in log or '\nERROR:' in log or 'NEXUS_FRONT_TEST_RESULT' not in log:
    sys.exit(result.returncode or 1)
