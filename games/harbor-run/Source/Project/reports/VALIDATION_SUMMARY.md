# v4 검증 결과

실행: 2026-11-18T10:34:10.090343+09:00 / build 4.0.0.

**규칙·실제 코드 VM 검사 301/301 통과. 브라우저 검사 실행 수는 0입니다.**

| 검사 | 통과 | 원본 보고서 |
|---|---:|---|
| 기본 판정 | 55 / 55 | `logic-results.json` |
| 이동·리그 | 35 / 35 | `motion-unit-results.json` |
| 모션 보정·보간 | 10 / 10 | `polish-unit-results.json` |
| 전투·능력 규칙 | 31 / 31 | `gameplay_rules_report.json` |
| 미션 규칙 | 62 / 62 | `mission-v4-results.json` |
| 인지·신고 규칙 | 48 / 48 | `perception-unit-results.json` |
| 실제 게임 코드 통합 — VM | 43 / 43 | `gameplay-v4-runtime.json` |
| 실제 전투 코드 통합 — VM | 12 / 12 | `combat-v4-runtime.json` |
| 실제 신고 코드 통합 — VM | 5 / 5 | `perception-v4-runtime.json` |

## 무엇을 실행했는가

VM에서는 실제 main.js, gameplay-integration.js, 월드 충돌, 모션, 모델 총구 계산, 임무·인지·저장 코드를 실행했습니다. DOM·그리기/WebGL 출력·오디오·RAF 예약은 대체했고 영구 저장소는 사용할 수 없는 상태로 처리했습니다. 입력은 실제 핸들러에 합성 이벤트를 전달했습니다. 전체 게임 루프의 소스 연결 검사이며 실제 브라우저나 물리 입력 장치 검사는 아닙니다.

연사율 검사는 무한 탄약 개발 플래그를, 정확한 피해 검사는 지정된 표적·거리·탄 퍼짐 fixture를 사용합니다. 미션 완료 검사는 차량을 지정 상태·위치에 놓고 진행 조건을 확인합니다. 두 접근 방식의 조건·보상 완료와 차고에서 출발해 돌아오는 연속 무치트 완주는 서로 다른 검증입니다.

## 브라우저 실행 제한

이번 제작 환경에서 Chromium은 로컬 소켓 생성의 Operation not permitted 오류로 시작되지 않았습니다. 확장 실행 권한 요청은 granular sandbox_approval=false 정책에 의해 자동 거부됐습니다. 연결 브라우저는 사용할 수 없었고 클라우드 대체 브라우저도 로컬 file URL을 정책으로 거부했습니다. 제한을 우회하지 않았습니다. tests/gameplay_v4_browser.py는 작성했으나 이번 제작에서 실행된 게임 assertion은 0입니다.

이전 버전의 화면 캡처나 브라우저 검사 결과를 현재 버전의 통과 증거로 재사용하지 않았습니다. 물리 기기·GPU·포인터 잠금·시각적 애니메이션·브라우저 재시작 후 저장·연속 운전 성공률은 추가 플레이 확인 대상입니다.

## 재실행

`node tools/export_data.cjs`, `python build.py`, `python tools/validate.py` 순서로 데이터를 내보내고 빌드·규칙/VM 검사를 다시 실행할 수 있습니다. 게임 실행 자체는 Python이나 Node를 요구하지 않습니다.
