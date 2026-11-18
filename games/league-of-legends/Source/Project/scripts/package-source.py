#!/usr/bin/env python3
"""Create a reproducible source distribution without repository credentials."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'nexus-front-source.zip'
ROOT_FILES = ['README.md', 'GAMEPLAY.md', 'IMPLEMENTATION.md', 'CHANGELOG.md', 'QA.md', 'package.json']
DIRECTORIES = ['dist', 'docs', 'data', 'scripts', 'tests']


def include(path):
    rel = path.relative_to(ROOT)
    return (path.is_file() and not path.is_symlink()
            and path != OUTPUT
            and not any(part.startswith('.') or part.startswith('__qa') or part == '__pycache__' for part in rel.parts)
            and path.suffix not in {'.pyc', '.zip', '.tar', '.gz'})


def main():
    files = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
    for name in DIRECTORIES:
        files.extend(path for path in (ROOT / name).rglob('*') if include(path))
    files = sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())
    manifest = {'format': 1, 'version': json.loads((ROOT / 'package.json').read_text())['version'], 'files': []}
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            content = path.read_bytes()
            rel = path.relative_to(ROOT).as_posix()
            entry = zipfile.ZipInfo('nexus-front/' + rel, (2026, 11, 18, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, content)
            manifest['files'].append({'path': rel, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
        entry = zipfile.ZipInfo('nexus-front/FILE_MANIFEST.json', (2026, 11, 18, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(files) + 1
    print(json.dumps({'path': str(OUTPUT), 'files': len(files) + 1, 'bytes': OUTPUT.stat().st_size,
                      'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == '__main__':
    main()
