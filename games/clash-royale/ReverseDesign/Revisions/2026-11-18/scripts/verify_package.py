"""Run the package's meaningful data, contract, DOM-flow and bundle checks.

Requires Python and Node.js. No installed third-party packages, network,
browser automation, or original game client are used.
"""
import json
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def main():
    # Reports are referenced by the docs before the first verification run.
    report_path=ROOT/'reports/release_validation.json'
    md_path=ROOT/'reports/release_validation.md'
    report_path.parent.mkdir(exist_ok=True)
    if not report_path.exists():report_path.write_text('{}\n',encoding='utf-8')
    if not md_path.exists():md_path.write_text('# 릴리스 검사 진행 중\n',encoding='utf-8')
    jobs=[
        ('archive_behavior_recovery',[sys.executable,'scripts/reconstruct_extensions.py','--check']),
        ('normalized_data_rebuild',[sys.executable,'scripts/rebuild.py','--check']),
        ('research_reconciliation',[sys.executable,'scripts/reconcile_research.py','--check']),
        ('quality_views_rebuild',[sys.executable,'scripts/analyze_quality.py','--check']),
        ('data_integrity',[sys.executable,'scripts/validate.py']),
        ('offline_html_rebuild',[sys.executable,'scripts/build_lab.py','--check']),
        ('javascript_contract_and_dom_flow',['node','--test','--test-reporter=tap',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'tests').glob('*.test.cjs'))]]),
        ('python_quality_and_bundle',[sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py','-v']),
    ]
    results=[]
    for name,command in jobs:
        try:
            proc=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=60)
            text=proc.stdout+proc.stderr
            row={'check':name,'command':' '.join(command),'status':'passed' if proc.returncode==0 else 'failed','exit_code':proc.returncode}
            if name=='javascript_contract_and_dom_flow':
                for key in ('tests','pass','fail','skipped'):
                    match=re.search(r'^# '+key+r' (\d+)\s*$',text,re.M)
                    row[key]=int(match.group(1)) if match else None
            if name=='python_quality_and_bundle':
                match=re.search(r'Ran (\d+) tests?',text)
                row['tests']=int(match.group(1)) if match else None
            if proc.returncode:row['diagnostic']=text[-16000:]
        except (OSError,subprocess.TimeoutExpired) as error:
            row={'check':name,'command':' '.join(command),'status':'failed','exit_code':None,'diagnostic':str(error)}
        results.append(row)
        print(json.dumps({k:v for k,v in row.items() if k not in ('diagnostic','command')},ensure_ascii=False),flush=True)
    try:node_version=subprocess.run(['node','--version'],capture_output=True,text=True,timeout=10).stdout.strip()
    except (OSError,subprocess.TimeoutExpired):node_version=None
    passed=all(row['status']=='passed' for row in results)
    report={'package_version':'4.0.0','analysis_as_of':'2026-11-17','status':'passed' if passed else 'failed',
            'runtimes':{'python':platform.python_version(),'node':node_version},
            'checks':results,'original_client_tests_executed':0,
            'original_client_cases_defined':44,'reference_scenarios':30,
            'real_browser_rendering_tested':False,'touch_or_gpu_tested':False,
            'dom_flow_method':'Python HTMLParser + minimal DOM in Node VM; not a real browser',
            'scope':'data_integrity_and_reference_implementation_only'}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# v4 릴리스 검증 결과','','- 패키지: 4.0.0 / 조사 기준일: 2026-11-17',f'- 결과: **{report["status"].upper()}**',
           f'- 실행 환경: Python {platform.python_version()} / Node {node_version}',
           '- 원작 클라이언트 관측: **44개 명세 / 실행 0개**',
           '- 참조 계약 데이터 시나리오: 30개 (Node 검사에 포함; 별도 합산하지 않음)',
           '- 실제 브라우저 렌더·터치·GPU 시험: **미실행**','','## 실행한 검사','','| 검사 | 결과 | 테스트 수 |','|---|---|---:|']
    lines += [f'| {r["check"]} | {r["status"]} | {r.get("tests") if r.get("tests") is not None else "—"} |' for r in results]
    lines += ['','## 해석','',
              'Node 테스트는 순수 조회·계산·참조 전투 계약과 최소 DOM 환경의 실제 UI 코드 흐름을 검사한다. Python 테스트는 자료 분석과 오프라인 번들 무결성을 검사한다. DOM 검사는 실제 브라우저를 시작한 시험이 아니며 CSS 레이아웃·기기 입력·접근성 트리 적합성을 보증하지 않는다.',
              '', '30개 참조 시나리오는 Node 검사 수에 이미 포함된다. 44개 원작 관측 명세는 실행하지 않았으므로 통과 수에 더하지 않는다. 검사 통과가 최신 원작의 전체 수치나 비공개 내부 로직의 일치 검증을 의미하지 않는다.',
              '', '실행 명령과 실패 세부 정보는 [release_validation.json](release_validation.json)에 보존했다. 데이터 자체의 결과는 [validation_report.md](validation_report.md), 복원 범위는 [quality_report.md](quality_report.md)를 확인한다.']
    md_path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    return 0 if passed else 1

if __name__=='__main__':raise SystemExit(main())
