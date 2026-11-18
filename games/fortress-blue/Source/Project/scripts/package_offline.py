from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'dist' / 'downloads' / 'Fortress_BLUE_Playable.zip'
output.parent.mkdir(parents=True, exist_ok=True)
launcher = """<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=dist/index.html"><title>Fortress BLUE</title><body><a href="dist/index.html">포트리스 BLUE 게임 시작</a></body></html>"""
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('Fortress_BLUE_Playable/index.html', launcher)
    for folder in ('dist', 'docs', 'tests', 'scripts'):
        for file in sorted((root / folder).rglob('*')):
            if file.is_file() and 'downloads' not in file.relative_to(root).parts and not file.name.startswith('qa-'):
                z.write(file, 'Fortress_BLUE_Playable/' + file.relative_to(root).as_posix())
    for name in ('README_KO.md', 'IMPLEMENTATION_CONTRACT.md'):
        z.write(root / name, 'Fortress_BLUE_Playable/' + name)
print(output)
print('bytes:', output.stat().st_size)
