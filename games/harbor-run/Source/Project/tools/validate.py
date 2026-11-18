"""Run deterministic rule and actual-source VM checks. Does not launch a browser."""
from pathlib import Path
import json
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
SUITES = [
    ('기본 판정', 'logic.test.cjs', 'logic-results.json', []),
    ('이동·리그', 'motion.test.cjs', 'motion-unit-results.json', []),
    ('모션 보정·보간', 'polish.test.cjs', 'polish-unit-results.json', []),
    ('전투·능력 규칙', 'gameplay_rules.test.cjs', 'gameplay_rules_report.json', ['--report']),
    ('미션 규칙', 'mission_v4.test.cjs', 'mission-v4-results.json', []),
    ('인지·신고 규칙', 'perception.test.cjs', 'perception-unit-results.json', []),
    ('실제 게임 코드 통합 — VM', 'gameplay_v4_runtime.cjs', 'gameplay-v4-runtime.json', []),
    ('실제 전투 코드 통합 — VM', 'combat_v4_runtime.cjs', 'combat-v4-runtime.json', []),
    ('실제 신고 코드 통합 — VM', 'perception_v4_runtime.cjs', 'perception-v4-runtime.json', []),
]

def main():
    REPORTS.mkdir(exist_ok=True)
    suites = []
    for label, filename, report_name, args in SUITES:
        result = subprocess.run(['node', str(ROOT / 'tests' / filename), *args], cwd=ROOT,
                                capture_output=True, text=True, timeout=60)
        if filename == 'perception.test.cjs':
            (REPORTS / report_name).write_text(result.stdout, encoding='utf-8')
        if result.returncode:
            print(result.stdout + result.stderr)
            raise SystemExit(result.returncode)
        data = json.loads((REPORTS / report_name).read_text(encoding='utf-8'))
        total = data.get('total', data.get('tests'))
        passed = data['passed']
        if passed != total:
            raise SystemExit('Failed checks: ' + label)
        suites.append({'label': label, 'passed': passed, 'total': total, 'report': report_name})
        print(f'{label}: {passed}/{total}')
    passed = sum(s['passed'] for s in suites)
    total = sum(s['total'] for s in suites)
    stamp = datetime.now(ZoneInfo('Asia/Seoul')).isoformat()
    result = {'build':'4.0.0','executedAtKST':stamp,'passed':passed,'total':total,'suites':suites,
              'scope':'Rules and actual-source Node VM fixtures; DOM/drawing/audio/RAF/persistent storage substituted',
              'browserAssertionsExecutedInThisRun':0,
              'notVerified':['WebGL visuals','browser pointer lock','physical mobile devices','persistent-origin storage','uninterrupted no-cheat playthrough']}
    (REPORTS / 'validation-v4.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    rows = '\n'.join(f"| {s['label']} | {s['passed']} / {s['total']} | `{s['report']}` |" for s in suites)
    summary = f'''# v4 검증 결과

실행: {stamp} / build 4.0.0.

**규칙·실제 코드 VM 검사 {passed}/{total} 통과. 브라우저 검사 실행 수는 0입니다.**

| 검사 | 통과 | 원본 보고서 |
|---|---:|---|
{rows}

## 무엇을 실행했는가

VM에서는 실제 main.js, gameplay-integration.js, 월드 충돌, 모션, 모델 총구 계산, 임무·인지·저장 코드를 실행했습니다. DOM·그리기/WebGL 출력·오디오·RAF 예약은 대체했고 영구 저장소는 사용할 수 없는 상태로 처리했습니다. 입력은 실제 핸들러에 합성 이벤트를 전달했습니다. 전체 게임 루프의 소스 연결 검사이며 실제 브라우저나 물리 입력 장치 검사는 아닙니다.

연사율 검사는 무한 탄약 개발 플래그를, 정확한 피해 검사는 지정된 표적·거리·탄 퍼짐 fixture를 사용합니다. 미션 완료 검사는 차량을 지정 상태·위치에 놓고 진행 조건을 확인합니다. 두 접근 방식의 조건·보상 완료와 차고에서 출발해 돌아오는 연속 무치트 완주는 서로 다른 검증입니다.

## 브라우저 실행 제한

이번 제작 환경에서 Chromium은 로컬 소켓 생성의 Operation not permitted 오류로 시작되지 않았습니다. 확장 실행 권한 요청은 granular sandbox_approval=false 정책에 의해 자동 거부됐습니다. 연결 브라우저는 사용할 수 없었고 클라우드 대체 브라우저도 로컬 file URL을 정책으로 거부했습니다. 제한을 우회하지 않았습니다. tests/gameplay_v4_browser.py는 작성했으나 이번 제작에서 실행된 게임 assertion은 0입니다.

이전 버전의 화면 캡처나 브라우저 검사 결과를 현재 버전의 통과 증거로 재사용하지 않았습니다. 물리 기기·GPU·포인터 잠금·시각적 애니메이션·브라우저 재시작 후 저장·연속 운전 성공률은 추가 플레이 확인 대상입니다.

## 재실행

`node tools/export_data.cjs`, `python build.py`, `python tools/validate.py` 순서로 데이터를 내보내고 빌드·규칙/VM 검사를 다시 실행할 수 있습니다. 게임 실행 자체는 Python이나 Node를 요구하지 않습니다.
'''
    (REPORTS / 'VALIDATION_SUMMARY.md').write_text(summary, encoding='utf-8')
    print(f'TOTAL {passed}/{total}; browser not run')

if __name__ == '__main__':
    main()
