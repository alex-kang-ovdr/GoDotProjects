# Crownfall 4.5 검증 기록

2026-11-17 · 프로그램 4.5.0 · 전투 규칙 5

## 최종 결과

최종 기능 소스에서 다음 명령을 실행했다.

```bash
node --test --test-reporter=tap tests/*.test.mjs
```

| 항목 | 결과 |
|---|---:|
| 테스트 | 251 |
| 통과 | 251 |
| 실패 | 0 |
| 건너뜀 | 0 |
| 취소 | 0 |

190개 기존 회귀에 이번 버전의 61개 검사를 추가했다. 카드 수·기본 규칙·프로필 수치가 변경된 기존 fixture는 새 기본 계약에 맞춰 갱신했다. 과거 동작 보존은 실제 이전 버전에서 생성한 별도 기대 결과로 검증한다.

## 새 검사 61개

| 검사 파일 | 개수 | 확인한 위험 |
|---|---:|---|
| [reconstruction.test.mjs](../tests/reconstruction.test.mjs) | 15 | 레벨·형상·구성요소·단위·후속 변경 조건, 허용 필드, 독 합계 변환, 수동 값 일치, 불변 근거 데이터 |
| [reconstruction_combat.test.mjs](../tests/reconstruction_combat.test.mjs) | 14 | 새 프로필·기존 규칙 경계, 실제 대상 3개 선택, 시전 시 재선정, 접지 피격·만료, 비행·건물 공격·넉백 면역, 예약 공격 동결, 상한 원자성, AI, 타워 우회 교착 |
| [reconstruction_renderer.test.mjs](../tests/reconstruction_renderer.test.mjs) | 6 | 새 카드 SVG·2D·3D 모델, 실제 선정 대상만 표시, 접지와 비행 복원, 3D HUD·삼각형 선택 판정, 입력 상태 불변 |
| [reconstruction_ui.test.mjs](../tests/reconstruction_ui.test.mjs) | 6 | 첫 로딩, 다음 전투 프로필, 규칙 4·5 저장 이어하기, legacy 옵션·전체 초기화, 선택 진영만 근거 적용, 중앙 전장 외부 UI 배치 |
| [reconstruction_session.test.mjs](../tests/reconstruction_session.test.mjs) | 4 | 두 프로필의 신규 카드·분대 능력 포함 실제 전투 리플레이, 파일 변환·탐색, 프로필 누락 거절, 캠페인 정체성, 훈련 저장 |
| [reconstruction_tools.test.mjs](../tests/reconstruction_tools.test.mjs) | 2 | 대상 수 정수·범위의 원자 검증, 접지 상태 조회·해제 치트 및 legacy 모양 유지 |
| [legacy_reconstruction.test.mjs](../tests/legacy_reconstruction.test.mjs) | 14 | 실제 v4.4 기준 규칙 2·3·4 전체 전투·저장·리플레이·AI 재현 |

## 실제 이전 버전과의 비교

이전 배포 소스 커밋:

```text
9b99bdcd0eae0929dbb84711e8d5072d0b6ebd14
```

해당 소스의 엔진·밸런스·AI에서 고정 시드 기대 결과를 생성했다. 각 fixture에는 원본 커밋과 모듈 SHA-256을 기록했다. 현재 엔진으로 정답을 다시 만들어 맞춘 비교가 아니다.

- 규칙 2·3·4 각각 100초, 6,000틱 전투를 새 엔진에서 재생한다.
- 양 팀의 폭탄병·화염구·화살비·독·창 고블린·감전을 포함한다.
- 주문 대기, 투사체와 지속 영역, 규칙 3·4 밀집보병 돌격 중의 구형 저장을 이어간다.
- `rulesVersion`이 없는 최초 저장·리플레이는 규칙 2로 해석한다.
- 기존 AI의 100초 `hard/control` 판단과 구형 AI 저장 복원도 대조한다.
- 설정·상태·HP·명령·투사체·주문 대기·RNG·ID·리플레이 결과를 생략 없이 비교한다.

사용한 파일:

- [규칙 2 원본 fixture](../tests/fixtures/legacy-v44-rules2.json)
- [규칙 3 원본 fixture](../tests/fixtures/legacy-v44-rules3.json)
- [규칙 4 원본 fixture](../tests/fixtures/legacy-v44-rules4.json)
- [규칙 4 AI 원본 fixture](../tests/fixtures/legacy-v44-ai-rules4.json)

## 자동 대전과 이동

[core_stress.test.mjs](../tests/core_stress.test.mjs)는 3상대 × 3난이도 × 2 seed의 18경기를 완주한다. AI 관찰 래퍼는 현재 규칙·프로필·진영별 실제 카드·자기 분대 능력을 전달하며 상대 손패와 엘릭서는 읽을 수 없게 한다.

기존 정지 기준을 완화하지 않았다. 최종 실행의 범위 밖 최대 정지는 3초였으며, 기존 허용 기준 12초 미만을 충족했다. 만엘릭서 최대 유휴는 0초였다. 대표 완료 전투는 리플레이 후 전체 스냅샷까지 일치한다. 이 수치는 해당 시드 표본의 결과이며 모든 군집 배치나 실제 사용자 난이도를 보장하지 않는다.

## 재생성과 산출물 검사

```bash
python scripts/build-reconstruction-data.py --check
node scripts/build-offline.mjs
python scripts/package-source.py
node scripts/check.mjs
git diff --check
```

근거 생성기는 입력 SHA와 허용 계약을 확인하고 생성 JavaScript가 동일한지 검사한다. 오프라인 빌드는 모듈 조합을 실행하여 새 Game·개발자 조절·캠페인·훈련·치트 연결을 확인한다. 정적 검사는 모든 JavaScript 구문·HTML ID 중복·앱 바인딩·필수 파일을 검사한다. ZIP 생성은 CRC와 각 구성 파일의 바이트 일치를 확인한다.

## 검증하지 않은 범위

브라우저 접근 제한에 따라 실제 브라우저, CDP, Playwright로 페이지를 열지 않았다. UI 검사는 실제 앱 함수와 Game을 실행하는 Node VM 및 제한된 DOM 모델이다. 렌더러는 Canvas/WebGL 호출 기록기와 좌표·메시 검사를 사용한다.

따라서 실제 모바일 터치·포커스·폰트·다운로드 동작, GPU 픽셀 결과, 드라이버별 셰이더 동작, 기기별 FPS·입력 지연은 직접 확인하지 못했다. 원작 클라이언트와의 화면·행동 대조도 이번 구현 검사에 포함되지 않는다.
