#!/usr/bin/env python3
"""Build release presets and verify their real files. Runtime scopes are explicit."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
P = argparse.ArgumentParser()
P.add_argument('--godot', default=shutil.which('godot') or shutil.which('godot4'))
A = P.parse_args()
if not A.godot:
    sys.exit('Godot 4.6.3 and matching release export templates are required.')
LOGS = ROOT/'build'/'logs'
LOGS.mkdir(parents=True, exist_ok=True)
(ROOT/'build'/'.gdignore').touch()

def save_text(path, value):
    path.write_text(value, encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def source_hashes():
    return {str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'scripts').glob('*.gd'))}

initial = source_hashes()
results = []
failed = False
common = ('# Survivor Arena · Godot G2\n\n'
          'WASD/방향키 또는 화면 드래그로 이동합니다. 자동 공격하며, 성장 카드는 1/2/3으로 선택합니다.\n'
          'P/Esc 정지, B 빌드, M 효과음, N 레이더, F11 전체 화면. 로비/정지 화면의 설정에서 음량과 표시를 조절합니다.\n'
          'G1의 같은 기기 네이티브 저장을 이어받습니다. 최근 기록은 새로 완료한 12개 전투를 보관합니다.\n\n')
for target in ['linux','windows','web','pack']:
    began = time.monotonic()
    command = [sys.executable,str(ROOT/'tools/export_game.py'),target,'--godot',A.godot]
    run = subprocess.run(command,cwd=ROOT,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
    save_text(LOGS/(target+'_export.log'),run.stdout)
    warnings = [line for line in run.stdout.splitlines() if 'ERROR' in line or 'WARNING' in line]
    print(target,'export',run.returncode,'messages',len(warnings),flush=True)
    entry = {'platform':target,'export_returncode':run.returncode,'errors_warnings':warnings,'seconds':round(time.monotonic()-began,2)}
    failed |= run.returncode != 0 or bool(warnings)
    out = ROOT/'build'/target
    if run.returncode:
        results.append(entry)
        continue
    for name,src in [('GODOT_LICENSE.txt',ROOT/'licenses/GODOT_LICENSE.txt'),('GODOT_THIRD_PARTY_NOTICES.txt',ROOT/'licenses/GODOT_THIRD_PARTY_NOTICES.txt'),('FONT_LICENSE.txt',ROOT/'assets/FONT_LICENSE.txt'),('LICENSE',ROOT/'LICENSE')]:
        shutil.copy2(src,out/name)
    if target=='windows':
        save_text(out/'README.md',common+'## 실행\n\n압축을 풀고 SurvivorArena.exe를 실행하세요. x86_64 릴리스이며 게임 리소스가 실행 파일에 포함되어 있습니다.\n\n검증: 내보내기 및 PE AMD64/PCK 구조 확인. Windows에서 직접 실행한 결과는 포함하지 않습니다.\n')
        data=(out/'SurvivorArena.exe').read_bytes()
        offset=struct.unpack_from('<I',data,60)[0]
        entry['structure']={'MZ':data[:2]==b'MZ','PE':data[offset:offset+4]==b'PE\x00\x00','AMD64':struct.unpack_from('<H',data,offset+4)[0]==0x8664,'embedded_GDPC':b'GDPC' in data[-4096:]}
        entry['runtime_status']='NOT_EXECUTED_ON_WINDOWS'
    elif target=='linux':
        exe=out/'SurvivorArena.x86_64'
        save_text(out/'README.md',common+'## 실행\n\n터미널에서 아래 명령으로 실행합니다.\n\n```bash\nchmod +x SurvivorArena.x86_64\n./SurvivorArena.x86_64\n```\n\n게임 리소스가 실행 파일에 포함되어 있습니다. 소스 프로젝트나 Godot 에디터가 없어도 실행합니다.\n\n검증: 소스 폴더 밖 headless 기동과 별도 네이티브 OpenGL 실행. 사용한 그래픽 장치는 Mesa llvmpipe이며 실제 GPU/모바일 성능 벤치마크는 아닙니다.\n')
        data=exe.read_bytes()
        entry['structure']={'ELF64':data[:5]==b'\x7fELF\x02','embedded_GDPC':b'GDPC' in data[-4096:]}
        if sys.platform.startswith('linux'):
            with tempfile.TemporaryDirectory(prefix='arena-g2-release-') as outside:
                boot=subprocess.run([str(exe),'--headless','--quit-after','10','--','--qa'],cwd=outside,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
            entry['runtime']={'returncode':boot.returncode,'scope':'Headless embedded release startup outside source tree','stdout':boot.stdout}
            failed |= boot.returncode != 0 or 'ERROR' in boot.stdout
    elif target=='web':
        save_text(out/'README.md',common+'## 실행\n\n이 폴더에서 HTTP 서버를 실행하고 브라우저로 접속합니다.\n\n```bash\npython -m http.server 8060\n```\n\n주소: http://localhost:8060\n\nindex.html을 더블클릭하는 file:// 방식은 사용하지 않습니다. HTML/JS/WASM/PCK를 같은 폴더에 유지하세요. Compatibility/WebGL 2.0, 단일 스레드 빌드입니다.\n\n검증: 내보내기 및 파일 구조 확인. 브라우저 게임 실기동은 검증 환경 제약으로 미확인입니다. Android/iOS/Safari 실기기 검증은 포함하지 않습니다.\n')
        entry['structure']={'wasm_magic':(out/'index.wasm').read_bytes()[:4]==b'\x00asm','html':(out/'index.html').exists(),'js':(out/'index.js').exists(),'pck':(out/'index.pck').exists()}
        entry['runtime_status']='UNVERIFIED_BROWSER_RUNTIME'
    else:
        with tempfile.TemporaryDirectory(prefix='arena-g2-pack-') as outside:
            boot=subprocess.run([A.godot,'--headless','--main-pack',str(out/'SurvivorArena.pck'),'--quit-after','10','--','--qa'],cwd=outside,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
        entry['runtime']={'returncode':boot.returncode,'scope':'External PCK boots with Godot outside source tree','stdout':boot.stdout}
        failed |= boot.returncode != 0 or 'ERROR' in boot.stdout
    if 'structure' in entry:
        failed |= not all(entry['structure'].values())
    entry['files']=[{'name':p.name,'size_bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.iterdir()) if p.is_file()]
    results.append(entry)

changed=[name for name,digest in initial.items() if source_hashes().get(name)!=digest]
report={'release':'G2','engine':subprocess.check_output([A.godot,'--version'],text=True).strip(),'source_script_sha256':initial,'source_changed_during_export':changed,'exports':results,'passed':not failed and not changed,'limitations':['Windows runtime not executed.','Browser gameplay not executed. Native GL capture is reported separately.']}
save_text(ROOT/'tests/export_report.json',json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print('EXPORT_VERIFICATION',report['passed'],'source_changes',changed,flush=True)
sys.exit(0 if report['passed'] else 1)
