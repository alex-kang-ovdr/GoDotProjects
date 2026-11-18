#!/usr/bin/env python3
"""Create or verify this deliverable's SHA-256 manifest using only the stdlib."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'reports' / 'manifest.json'

def inventory():
    rows = []
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or path == TARGET or '__pycache__' in path.parts:
            continue
        rows.append({'path': path.relative_to(ROOT).as_posix(),
                     'bytes': path.stat().st_size,
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return rows

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    rows = inventory()
    if args.verify:
        expected = json.loads(TARGET.read_text(encoding='utf-8'))['files']
        old = {r['path']: r for r in expected}
        new = {r['path']: r for r in rows}
        missing = sorted(set(old) - set(new))
        added = sorted(set(new) - set(old))
        changed = sorted(k for k in old.keys() & new.keys() if old[k] != new[k])
        result = {'passed': not (missing or added or changed), 'checked_files': len(rows),
                  'missing': missing, 'added': added, 'changed': changed}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result['passed'] else 1
    report = {'format_version': 1, 'dataset_version': '2026.11.18-r1',
              'hash': 'SHA-256', 'excludes': ['reports/manifest.json', '__pycache__'],
              'meaning': 'Package integrity only; not proof of original game data accuracy.',
              'file_count': len(rows), 'files': rows}
    TARGET.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'manifest': 'reports/manifest.json', 'files': len(rows)}))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
