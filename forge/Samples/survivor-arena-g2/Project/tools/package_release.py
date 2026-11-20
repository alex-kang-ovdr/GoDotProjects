#!/usr/bin/env python3
"""Package source and optional exported platforms, with CRC and SHA-256 receipts."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
P = argparse.ArgumentParser()
P.add_argument('--output', type=Path, default=ROOT.parent/'releases')
A = P.parse_args()
OUT = A.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''):
            h.update(b)
    return h.hexdigest()

def source_files():
    files=[]
    for p in ROOT.rglob('*'):
        if not p.is_file():
            continue
        rel=p.relative_to(ROOT)
        if rel.parts[0] in {'.godot','build','.git','releases'}:
            continue
        if '__pycache__' in rel.parts or p.suffix in {'.tmp','.bak','.pyc'}:
            continue
        if rel.as_posix()=='MANIFEST.sha256':
            continue
        files.append(p)
    return sorted(files)

FILES=source_files()
(ROOT/'MANIFEST.sha256').write_text(''.join(digest(p)+'  '+p.relative_to(ROOT).as_posix()+'\n' for p in FILES))
FILES.append(ROOT/'MANIFEST.sha256')
receipts=[]

def archive(name, files, source_root, prefix):
    path=OUT/name
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
        for p in files:
            z.write(p, prefix+'/'+p.relative_to(source_root).as_posix())
    with zipfile.ZipFile(path) as z:
        bad=z.testzip()
        assert bad is None, (name,bad)
        assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
        count=len(z.namelist())
    receipt={'filename':name,'size_bytes':path.stat().st_size,'sha256':digest(path),'zip_crc':'PASS','entries':count}
    receipts.append(receipt)
    print(json.dumps(receipt),flush=True)

archive('SurvivorArena_Godot_G2.zip',FILES,ROOT,'SurvivorArena_Godot_G2')
for platform,title in [('windows','Windows'),('linux','Linux'),('web','Web')]:
    folder=ROOT/'build'/platform
    if not folder.is_dir():
        continue
    files=sorted(p for p in folder.rglob('*') if p.is_file() and p.suffix!='.import' and not p.name.startswith('.'))
    archive(f'SurvivorArena_Godot_G2_{title}.zip',files,folder,f'SurvivorArena_G2_{title}')
shutil.copy2(ROOT/'README.md',OUT/'SurvivorArena_Godot_G2_README.md')
shutil.copy2(ROOT/'docs/BUILD_AND_TEST.md',OUT/'SurvivorArena_Godot_G2_Test_Report.md')
shutil.copy2(ROOT/'docs/G2_CHANGES.md',OUT/'SurvivorArena_Godot_G2_Changes.md')
if (ROOT/'tests/captures/combat_city.png').exists():
    shutil.copy2(ROOT/'tests/captures/combat_city.png',OUT/'SurvivorArena_Godot_G2_preview.png')
(OUT/'SurvivorArena_Godot_G2_checksums.sha256').write_text(''.join(r['sha256']+'  '+r['filename']+'\n' for r in receipts))
(OUT/'SurvivorArena_Godot_G2_package_report.json').write_text(json.dumps({'version':'G2','archives':receipts},indent=2)+'\n')
