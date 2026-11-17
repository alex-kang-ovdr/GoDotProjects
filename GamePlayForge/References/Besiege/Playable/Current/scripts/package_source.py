"""Create a portable, self-contained source ZIP without hosting identity or Git state."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
destination = root / 'dist' / 'ironwood-source.zip'
paths = [root / 'README.md', root / 'IMPLEMENTATION.md', root / 'CHANGELOG.md', root / 'VALIDATION.md', root / 'package.json', root / 'package-lock.json']
for directory in ['dist', 'tests', 'scripts', 'docs']:
    paths.extend((root / directory).rglob('*'))
entries = sorted({path for path in paths if path.is_file() and path != destination and '__pycache__' not in path.parts})
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    for path in entries:
        archive.write(path, 'ironwood/' + path.relative_to(root).as_posix())
with ZipFile(destination) as archive:
    assert archive.testzip() is None
print(f'{destination}: {len(entries)} files, {destination.stat().st_size:,} bytes')
