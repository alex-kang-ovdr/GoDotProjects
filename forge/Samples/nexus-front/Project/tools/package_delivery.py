#!/usr/bin/env python3
"""Package, CRC-test and byte-verify the three Godot v11 deliverables."""
from __future__ import annotations
import hashlib, json, os, sys, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT.parent/'deliverables'
OUT.mkdir(parents=True,exist_ok=True)
DATE='20261120'
PREFIX='Nexus_Front_Godot_v11'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def package(name: str, folder: str, files: list[tuple[str,Path|bytes]]) -> dict:
    entries=[]
    unique=set()
    for relative,source in sorted(files):
        if relative in unique: raise ValueError('Duplicate archive path: '+relative)
        unique.add(relative)
        if isinstance(source,Path):
            if source.is_symlink(): raise ValueError('Refusing unexpected symbolic link: '+str(source))
            body=source.read_bytes();mode=source.stat().st_mode
        else:
            body=source;mode=0o100644
        entries.append((relative,body,mode))
    manifest={'package':name,'version':'v11-godot','engine':'4.6.3.stable','date_kst':'2026-11-20','baseline':'web-v10-d53d9e1df6525719f0d791010235090119451d45','files':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b,_ in entries]}
    manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    entries.append(('FILE_MANIFEST.json',manifest_bytes,0o100644))
    archive=OUT/name
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for relative,body,mode in entries:
            info=zipfile.ZipInfo(folder+'/'+relative,date_time=(2026,11,20,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(mode & 0xFFFF)<<16
            z.writestr(info,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(archive) as z:
        bad=z.testzip()
        if bad: raise RuntimeError('CRC failed: '+bad)
        for relative,body,_ in entries:
            extracted=z.read(folder+'/'+relative)
            if len(extracted)!=len(body) or sha(extracted)!=sha(body):
                raise RuntimeError('Archive identity failed: '+relative)
        result={'file':archive.name,'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'entries':len(entries),'crc':'all entries passed','byte_identity':'all entries match packaged originals','version':'Godot v11, source web v10, dataset16.22.1, engine4.6.3'}
    return result

source=[]
for p in ROOT.rglob('*'):
    if not p.is_file(): continue
    relative=p.relative_to(ROOT)
    if '.godot' in relative.parts or '__pycache__' in relative.parts or '.git' in relative.parts: continue
    if p.suffix in ('.tmp','.pyc'): continue
    if relative.as_posix()=='docs/PORT_CONTRACT.md': continue
    if relative.parts[0]=='exports' and (len(relative.parts)>1 and relative.parts[1] in ('windows','linux')): continue
    if relative.as_posix()=='exports/.gitkeep': continue
    source.append((relative.as_posix(),p))

results=[package(f'{PREFIX}_{DATE}_source.zip',PREFIX,source)]
for platform,ext in [('Windows','exe'),('Linux','x86_64')]:
    sub=platform.lower()
    binary=ROOT/'exports'/sub/f'{PREFIX}.{ext}'
    pck=ROOT/'exports'/sub/f'{PREFIX}.pck'
    instruction=(f'# Nexus Front Godot v11 — {platform}\n\n'
                 'Godot 엔진을 따로 설치할 필요가 없는 네이티브 실행 패키지입니다.\n\n'
                 f'1. ZIP을 폴더에 압축 해제합니다.\n2. `{binary.name}`를 실행합니다.\n3. 같은 폴더의 `.pck` 파일을 함께 유지하세요.\n\n'
                 + ('Linux에서는 실행 권한이 없다면 `chmod +x Nexus_Front_Godot_v11.x86_64` 후 실행하세요.\n\n' if platform=='Linux' else 'Windows x86_64용입니다. 이 패키지는 Linux에서 교차 내보내기했으며 Windows OS 실제 실행은 미검증입니다.\n\n')
                 + '맵1/1.5/2배는 시작 전에 선택하고 속도0.5/0.75/1/1.5배는 경기 중 조절할 수 있습니다.\n\n'
                 '우클릭 이동·공격 / QWER 시전 / Shift+QWER 조준 / Ctrl+QWER 학습 / D 점멸 / F 회복 / B 귀환 / 4 와드 / P 상점 / Space 추적 / F5 저장 / F9 불러오기 / F10 정지.\n\n'
                 '자세한 조작·시스템·차이는 README.md와 docs/를 참조하세요. 네이티브 저장은 `.nfs`이며 브라우저 v10 저장의 자동 가져오기는 지원하지 않습니다.\n')
    files=[(binary.name,binary),(pck.name,pck),('START_HERE_KO.md',instruction.encode()),('README.md',ROOT/'README.md'),('CHANGELOG.md',ROOT/'CHANGELOG.md'),('THIRD_PARTY_NOTICES.txt',ROOT/'THIRD_PARTY_NOTICES.txt')]
    for name in ['EXPORT.md','WORLD.md','ABILITIES.md','FOG.md','DATA.md','QA.md','PERFORMANCE.md','validation_results.json','gui_validation.json','data_identity.json']:
        files.append(('docs/'+name,ROOT/'docs'/name))
    files.append(('BUILD_MANIFEST.json',ROOT/'exports/native-export-manifest.json'))
    results.append(package(f'{PREFIX}_{DATE}_{sub}_x64.zip',PREFIX+'_'+platform,files))

output={'date_kst':'2026-11-20','packages':results,'source_semantics':json.loads((ROOT/'docs/data_identity.json').read_text()),'tests':json.loads((ROOT/'docs/validation_results.json').read_text())}
(OUT/f'{PREFIX}_{DATE}_delivery_manifest.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(output,ensure_ascii=False,indent=2))
