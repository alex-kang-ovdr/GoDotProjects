#!/usr/bin/env python3
"""Export presets, or a portable PCK with an already installed Godot editor."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('target', choices=['pack', 'windows', 'linux', 'web'])
p.add_argument('--godot', default=shutil.which('godot') or shutil.which('godot4'))
p.add_argument('--debug', action='store_true')
a = p.parse_args()
if not a.godot:
    sys.exit('Install Godot 4.6.3 or provide --godot PATH.')
presets = {'pack':('Linux','pack/SurvivorArena.pck'), 'windows':('Windows Desktop','windows/SurvivorArena.exe'), 'linux':('Linux','linux/SurvivorArena.x86_64'), 'web':('Web','web/index.html')}
preset, relative = presets[a.target]
output = ROOT / 'build' / relative
output.parent.mkdir(parents=True, exist_ok=True)
flag = '--export-pack' if a.target == 'pack' else '--export-debug' if a.debug else '--export-release'
sys.exit(subprocess.run([a.godot,'--headless','--path',str(ROOT),flag,preset,str(output)],cwd=ROOT).returncode)
