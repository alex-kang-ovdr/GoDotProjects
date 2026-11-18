# v20 검증 보고서

모든 아래 검사는 v20 최종 소스에서 다시 실행했다. v19 보고서의 통과 수를 그대로 복사하거나 원작 정확도 검증 수로 세지 않았다. 이전 회귀 테스트의 저장 버전/다운로드 파일명 기대값만 스키마20에 맞췄고, 실제 신규 동작은 별도의 전술 테스트로 검사했다.

## 요약

| 검사 | 통과 | 실패 | 결과 파일 |
|---|---:|---:|---|
| 기존 엔진 회귀 | 73 | 0 | `tests/engine-results.json` |
| 관측 데이터·게임 통합 회귀 | 54 | 0 | `tests/integration-results.json` |
| 신규 전술·편성 검사 | 47 | 0 | `tests/tactics-results.json` |
| 기존 브라우저 조작 회귀 | 33 | 0 | `tests/browser-results.json` |
| 관측 통합 브라우저 회귀 | 31 | 0 | `tests/browser-integration-results.json` |
| 신규 전술·UI 브라우저 검사 | 30 | 0 | `tests/browser-tactics-results.json` |
| **합계** | **268** | **0** | |

JavaScript 4개 모듈의 node --check, 단일 HTML 빌드, 원시 데이터 바이트 비교 및 3개 신규 예제 저장의 재가져오기도 통과했다. 이 사전 검사들은 268개에 추가 집계하지 않는다. ZIP CRC와 배포 HTML 동일성은 패키징 시 확인한다.

## 브라우저와 검증 경계

- Chromium `144.0.7559.96` headless. 1480/1536px 데스크톱, 390×844 세로, 891×411 가로 뷰포트 검사를 포함한다.
- 세 브라우저 검사 모두 pageerror 0, console error 0, 외부 네트워크 요청 0건이다.
- WebGL 컨텍스트 생성은 실패했다. 화면·좌표 입력은 CPU 3D 호환과 2D에서 검증했으며 GPU 실행·실기기 성능을 검증했다고 주장하지 않는다.
- file:// 직접 탐색은 ERR_BLOCKED_BY_ADMINISTRATOR로 차단됐다. 따라서 같은 독립 HTML을 set_content로 주입했다. 실패 탐색을 통과 검사로 세지 않는다. `tests/file-url-probe-v20.json` 참조.
- 브라우저의 파일 입력과 다운로드는 실제 기능을 사용했다. file://의 영구 localStorage, Android/iOS 멀티터치·GPU, 장시간 성능은 미검증이다.
- 신규 검사는 일부 상태를 명시적 테스트 훅으로 배치하고 실제 클릭·키보드·파일 입력을 수행한다. 모든 검사가 사람의 수동 플레이로만 진행됐다는 의미는 아니다.
- 원작 실행파일·이벤트·한국어 인물·성장 및 전투 공식의 사실성을 새로 검증한 횟수는 0이다. 소프트웨어 동작 검사를 원작 복원율로 표시하지 않는다.

## 실제 검증한 수정

- 첫 유닛 도착만으로 전체 move가 hold로 바뀌지 않음. 전체 도착 후 다음 예약/방어로 전환.
- 실제 고정 틱 이동으로 두 경유점 완료, 막힌 성문 너머 목적지 무단 통과/생략 없음.
- 부대별 예약 상한 8개, 전군 명령 상한 실패 시 원자적 취소, 지원군 예약 독립성.
- 치료 타격·회복 스킬·전술 회복의 사선과 치료사의 이동/방어 명령 준수.
- 개별 철수의 실제 이동, 자동 철수의 HP 경계, 직접 조작 제외, 귀속/장비/출처 보존.
- 편성 다중 선택·필터·정렬·정원 부족·유효하지 않은 병사 입력의 원자성.
- 장비 교체 미리보기의 비변경성, 동일 장비 재선택 시 보정 중복 없음.
- v19 실제 예제 저장의 이행, v20 명령/예약/철수 저장·복원과 같은 입력 미래 상태 일치.
- 잘못된 저장을 받아도 기존 상태 보호. 체크박스 포커스 뒤 F5/F9·C/V 입력 처리.
- 미니맵 클릭/우클릭, Shift 우클릭, 터치 호환 목적지 모드, 집중 모드 종횡비 유지.
- 일시정지 중 전장 시뮬레이션 정지·명령 입력 허용, 2D/3D 전환, JSON 파일 왕복.

## 렌더링 간소화 관측

동일한 정지 전투 상태에서 상세 `662`개, 간소화 `468`개의 박스 메시를 구성했다. 감소율은 29.3%다. 시뮬레이션 스냅샷은 동일했다. 이 값은 한 장면의 구성 메시 수이며 FPS 향상률이나 GPU 벤치마크가 아니다.

## 데이터 보존

`data/*`와 `src/source-data.js` 총 9개 파일을 제공된 v19 원본과 바이트 단위 비교했다. 모두 동일하다. 경로와 SHA-256은 `tests/provenance-v20.json`에 있다. 기존 배포 ZIP과 HTML은 수정하지 않았다.

## 상세 결과

### 기존 엔진 회귀

| 항목 | 결과 |
|---|---|
| 새 캠페인 참조·ID·정원 무결성 | PASS |
| 군단 분할 병력 보존 | PASS |
| 군단별 독립 위치 및 전환 | PASS |
| 같은 거점 합류·정원 보존 | PASS |
| 주력군 ↔ 예비군 편성 | PASS |
| 비인접 지역 출전 차단 | PASS |
| 출전 중 재출전·전략 변경 차단 | PASS |
| 일반 전투 자연 승패와 결과 무결성 | PASS |
| 공성 AI가 실제 타격으로 성문 파괴 | PASS |
| 연습은 캠페인·ID를 수정하지 않음 | PASS |
| 독립 부대 명령: 주력 공성 / 지원 방어 | PASS |
| 전군 명령은 아군에만 적용 | PASS |
| 진형 설정은 선택 부대에만 적용 | PASS |
| 일시정지 중 전투 시간 불변 | PASS |
| 예비군 지연 도착·중복 투입 차단 | PASS |
| 지원군 사망·성장·귀속 보존 | PASS |
| 미도착 지원군 전투 결과 제외 | PASS |
| 전투 결과 중복 적용 방지 | PASS |
| 방어전 진입 시 소유권 변경 없음 | PASS |
| 방어전 승리 후 적 군단 제거 | PASS |
| 방어전 철수·함락·생존자 안전거점 복귀 | PASS |
| 공격 실패 후 적 잔존 병력 보존 | PASS |
| 성문 닫힘/열림과 A* 경로 동기화 | PASS |
| 직접 이동도 지형 충돌 적용 | PASS |
| 부상 유닛 회복·스킬 재사용 대기 | PASS |
| 보병 방패 결속은 소속 부대에 적용 | PASS |
| JSON 저장·복원 완전 왕복 | PASS |
| 중복 ID 가져오기 거절·현재 상태 보호 | PASS |
| 비정상 HP·정원·활성 군단 검증 | PASS |
| v13 저장 마이그레이션·활성 군단 복구 | PASS |
| 적 군단 실이동 및 무주둔 거점 점령 | PASS |
| 동일 입력·초기 상태의 전투 재현 | PASS |
| 전투 중 저장 허용 | PASS |
| 새 게임은 이전 전투 상태 완전 초기화 | PASS |
| v15 전투 복원은 일시정지로 시작 | PASS |
| 복원 후 900틱 동일 입력 · 난수와 전체 전투 상태 일치 | PASS |
| 공격 준비·투사체 비행 중 저장과 재개 일치 | PASS |
| 미도착 지원군의 도착 틱·부대 명령 유지 | PASS |
| 성문 파괴·내비게이션 버전·경로 복원 | PASS |
| 중간 피해·병사 스킬·부대 방패·회복 대기 보존 | PASS |
| 철수한 생존 병사와 손실을 체크포인트에 보존 | PASS |
| 전투 중 불러오기 · 현재 전투 전체 교체 | PASS |
| 수비대 없는 거점 직전 상태 저장 가능 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 중복 전투 병사 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 잘못된 공격 타깃 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 성문 위치 변조 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 이미 적용된 전투 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 없는 소속 부대 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 미도착 부대에 런타임 유닛 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 없는 선택 캐릭터 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 잘못된 내비게이션 버전 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 잘못된 전투 시간 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 비정상 투사체 수치 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 잘못된 RNG | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 전투 일련번호 불일치 | PASS |
| 잘못된 스냅샷 거부·현재 전투 보호: 손실 병사 명부 누락 | PASS |
| 원래 군단·예비군·지원군 귀속 복원 뒤 한 번만 결과 반영 | PASS |
| 연습 전투 복원 후에도 캠페인 보상·손실 없음 | PASS |
| v14 저장 마이그레이션 · 기존 점령 보상 소급 없음 | PASS |
| 새 거점 보상 대기 · 숲 구호단 2명 Lv.2 | PASS |
| 동일 보상 중복 지급·다른 선택지 재수령 차단 | PASS |
| 재점령 시 보상 재생성 없음 | PASS |
| 예비군 정원 부족 시 보상·ID·상태 변경 없음 | PASS |
| 꽉 찬 예비군으로 편성 이동 차단 | PASS |
| 전투 중 캠페인 보상 변경 차단 | PASS |
| 강변 교역 보너스는 소유한 동안에만 적용 | PASS |
| 미결 보상·선택 기록 저장 왕복 | PASS |
| 캠페인 완료: 여섯 거점 + 적군 전멸 필요 | PASS |
| 이미 받은 미결 보상 저장은 거절 | PASS |
| 다섯 전장 모두 경로 존재 및 연습·복원 무결성 | PASS |
| 강변 두 다리 경로 · 강물 통과 금지 | PASS |
| 강물 위 사선 허용·숲 나무는 차단 | PASS |
| 수도 강화 성문 내구도 920 | PASS |

### 관측 데이터·게임 통합 회귀

| 항목 | 결과 |
|---|---|
| 309 관측 기록과 원본 파일 지문 일치 | PASS |
| 관측 데이터와 원시 필드 불변 | PASS |
| 용도 미확정 선행220 슬롯을 런타임 목록에서 제외 | PASS |
| roleId313 기록 두 개를 위치키로 따로 유지 | PASS |
| 원시 레벨0 관측 18개 보존 | PASS |
| 초기 주력군은 team0x10의13 기록 | PASS |
| 전체 아군·적군 편성에 출처 존재 | PASS |
| 표본 HP255 AT35 AR36 DF32 DR35 적용 | PASS |
| 원시 Lv0과 플레이 훈련단계 분리 | PASS |
| 14 수치장비만 적용·DE 미확인 제외 | PASS |
| 용검 관측 보고 +25AT -5DF 적용 및 해제 가역성 | PASS |
| 엑스칼리버 숫자만 적용·특수 피로효과 미적용 | PASS |
| 장비 교환 시 기존 장비 재고로 복귀 | PASS |
| 미소유 장비·잘못된 장비 장착 거부 | PASS |
| 금화 부족 구매 원자성 | PASS |
| 재고 상한 해제 보호 | PASS |
| 전투 중 장착과 구매 금지 | PASS |
| 관측 기록 모집 비용·명시 역할 | PASS |
| 동일 관측 기록 모집도 서로 다른 런타임ID | PASS |
| 정원·금화 부족 모집 원자성 | PASS |
| 지원하지 않는 출처·역할 모집 거부 | PASS |
| 커스텀 프로필에 복원 기록 자동 혼입 금지 | PASS |
| 원시 장비코드와 새 장비ID 분리 | PASS |
| AR 장비가 명중 확률에 실제 영향 | PASS |
| AD와 MD가 공격 종류에 따라 피해에 적용 | PASS |
| 명중 확률은 유효한 범위 | PASS |
| 복원 병사 피해·회피·판정 로그 실제 생성 | PASS |
| 판정 로그 최근120개 제한 | PASS |
| HR 안전거리 회복 적용 | PASS |
| 마법사 기본 공격·마법 투사체 | PASS |
| 마법사 고유스킬 사용·쿨다운 적용 | PASS |
| 마법사를 포함한 회복/공격 연습 자연 종료 | PASS |
| 지원군 사용 평원 전투 자연 승리·전사·귀속 | PASS |
| 출처·장비 전투 종료 후 보존 | PASS |
| 성장 훈련분만 증가·원시 숫자 보존 | PASS |
| 분할·편성·이동 후 출처 보존 | PASS |
| 보상 병력과 적군 보충에도 관측 기록 적용 | PASS |
| 장비 상태·원시 참조 캠페인 완전 왕복 | PASS |
| 전투 스냅샷·판정로그·출처·장비 완전 왕복 | PASS |
| 손상된 저장 거부/현재 상태 보호: 데이터 버전 지문 변조 | PASS |
| 손상된 저장 거부/현재 상태 보호: 누락된 v19 프로필 | PASS |
| 손상된 저장 거부/현재 상태 보호: 알 수 없는 출처 기록 | PASS |
| 손상된 저장 거부/현재 상태 보호: 원본 기록해시 변조 | PASS |
| 손상된 저장 거부/현재 상태 보호: 출처에 원시 수치 덮어쓰기 필드 | PASS |
| 손상된 저장 거부/현재 상태 보호: 복원 캠페인 병사 출처 누락 | PASS |
| 손상된 저장 거부/현재 상태 보호: 장비 보유수 음수 | PASS |
| 손상된 저장 거부/현재 상태 보호: 장비ID 변조 | PASS |
| 손상된 저장 거부/현재 상태 보호: 구형버전으로 원작 프로필 위장 | PASS |
| 런타임 출처를 다른 기록으로 바꿔도 거부 | PASS |
| 출전명부 출처 변경 거부 | PASS |
| 전투 장비 임의 변경 거부 | PASS |
| 실제 v15 JSON 예제 전투 저장 마이그레이션 | PASS |
| 구형13/14/15 경로와 복원모드 교체 분리 | PASS |
| 보존된 원본 데이터의 해시가 플레이 후에도 같음 | PASS |

### 신규 전술·편성 검사

| 항목 | 결과 |
|---|---|
| move: first arrival never completes whole group order | PASS |
| move: all live members arrive before holding | PASS |
| queue: shift movement preserves current target | PASS |
| queue: advance one target on formation arrival then hold | PASS |
| queue: real fixed ticks complete two waypoints | PASS |
| queue: blocked fort target is not skipped or teleported | PASS |
| queue: eight pending points cap rejects ninth atomically | PASS |
| queue: full selected group aborts all-groups append | PASS |
| queue: normal order replaces pending route only for selected group | PASS |
| queue: clearing pending route keeps current destination | PASS |
| queue: nonfinite points and missing targets rejected | PASS |
| pending support: selecting unspawned group clears unrelated soldier | PASS |
| critical selection chooses lowest living non-evacuated ratio | PASS |
| critical selection of healthy army is no-op | PASS |
| individual retreat cancels attack but preserves cooldown and other soldiers | PASS |
| individual retreat walks to edge before evacuation | PASS |
| retreat cancellation returns unit to group without healing | PASS |
| auto retreat is selected-group-only and disabled by default | PASS |
| auto retreat threshold protects knight at 25%, not 26% | PASS |
| auto retreat does not override directly controlled unit | PASS |
| retreat survivors retain equipment and origin after campaign defeat | PASS |
| healer obeys movement order before chasing patient | PASS |
| healing hit is blocked by closed gate | PASS |
| tactical healing cannot cross a wall; opening gate permits it | PASS |
| healer skill checks line of sight and keeps cooldown on failure | PASS |
| hold healer cannot heal or chase outside assigned anchor radius | PASS |
| group destination inside solid terrain resolves to legal slots | PASS |
| batch transfer retains order, source hashes, equipment and unit IDs | PASS |
| batch capacity failure leaves roster and reserve untouched | PASS |
| batch invalid duplicate is atomic | PASS |
| batch invalid unknown is atomic | PASS |
| batch invalid empty is atomic | PASS |
| batch invalid noninteger is atomic | PASS |
| batch transfer unavailable during battle | PASS |
| equipment preview is pure and replaces existing overlay | PASS |
| schema20 roundtrip preserves queues, protective orders and individual retreat | PASS |
| save/resume with queue has identical future fixed-tick state | PASS |
| real v19 campaign imports without source or equipment mutation | PASS |
| real v19 battle migration adds safe default command fields | PASS |
| corrupt schema20 missing queue rejected without changing current state | PASS |
| corrupt schema20 nine pending rejected without changing current state | PASS |
| corrupt schema20 outside point rejected without changing current state | PASS |
| corrupt schema20 null point rejected without changing current state | PASS |
| corrupt schema20 string policy rejected without changing current state | PASS |
| corrupt schema20 string retreat rejected without changing current state | PASS |
| paused tactical commands do not advance simulation or cooldowns | PASS |
| immutable 309 source records unchanged by v20 commands | PASS |

### 기존 브라우저 조작 회귀

| 항목 | 결과 |
|---|---|
| 브라우저 시작·외부 의존성 없음 | PASS |
| 실제 클릭으로 군단 분할·독립 이동 | PASS |
| 편성 대화창에서 병력 이동 | PASS |
| JSON 내보내기 다운로드 | PASS |
| 파일 입력으로 JSON 저장 복원 | PASS |
| 잘못된 저장 파일 거부·상태 보호 | PASS |
| 부대 카드·독립 공성/방어 명령 | PASS |
| 일시정지 시 시간 정지 | PASS |
| 3D 우클릭 지점 역투영·부대 이동 | PASS |
| 3D 병사 클릭 선택 | PASS |
| 카메라 4방향에서 실제 W 입력은 화면 위로 | PASS |
| 카메라 드래그·휠 줌 | PASS |
| 2D / 3D 전환 시 전투 상태 유지 | PASS |
| F 키 병종 고유 스킬 발동 | PASS |
| 화면 옵션·디버그 표시 토글 | PASS |
| 전투 결과 대화창·연습 상태 복귀 | PASS |
| 자동 전략 턴 타이머 실행 | PASS |
| 390px 모바일 화면 가로 넘침 없음 | PASS |
| 런타임·콘솔 오류 없음 | PASS |
| 숲 거점 실제 이동·선택 보상 수령 | PASS |
| 작전 일지·보상 선택 기록 표시 | PASS |
| 5종 연습 전장 실제 UI·3D 렌더링 | PASS |
| 실제 F5/F9 전투 복원·카메라·일시정지 | PASS |
| 전투 JSON 실제 다운로드·투사체 포함 | PASS |
| 전투 JSON 실제 업로드·진행 중 전투 교체 | PASS |
| 손상된 전투 파일 거부·기존 전투 유지 | PASS |
| 출전 직전 자동 체크포인트·전투 중 되돌리기 | PASS |
| 전투 종료 자동 체크포인트·결과·보상 대기 복구 | PASS |
| 작전 일지 중 자동 전략 턴 정지 | PASS |
| 전략 단계 실제 F5/F9 복원 | PASS |
| 390px 보상 선택 대화창 넘침 없음 | PASS |
| 891px 가로 화면·전투 저장 버튼 사용 가능 | PASS |
| v15 신규 흐름 런타임·콘솔·네트워크 오류 없음 | PASS |

### 관측 통합 브라우저 회귀

| 항목 | 결과 |
|---|---|
| 기본 실행은 복원 하이브리드13병사 · 커스텀규칙 고지 | PASS |
| 전체 관측309·선행슬롯 미포함 | PASS |
| 관측 기록 도감 실제 열기·페이지별24행 | PASS |
| 309 기록 페이지 이동 | PASS |
| 관측 진영0x10 필터13개 | PASS |
| 역할ID 중복 두 기록 별도 선택 | PASS |
| 빈 검색결과에서 엉뚱한 병사 모집 방지 | PASS |
| 관측 JSON 실제 다운로드·원시레벨0 보존 | PASS |
| 도감 모집 버튼→예비군에 명시역할로 합류 | PASS |
| 모집 병사 실제 주력 편성 | PASS |
| 능력치 검사: 원시/런타임/훈련 분리 | PASS |
| 장비14종 구매→장착→AT60 DF27 적용 | PASS |
| 해제 시 능력치·재고 복구 | PASS |
| F5/F9로 장비·프로필·출처 복원 | PASS |
| 복원 병사 실제 전투 진입·장착 잠금 | PASS |
| 전투 도감 열 때 시간 동결·모집 차단 | PASS |
| 실제 명중·회피·회복 판정 UI | PASS |
| 판정 로그 JSON 다운로드 | PASS |
| 전투 전체 JSON 내보내기 | PASS |
| 전투 파일 실제 업로드·일시정지 복원 | PASS |
| 출처 지문 손상 파일 거절·현재 상태 유지 | PASS |
| 로드 후 자동 재개 없이 상태 보존 | PASS |
| 2D/3D 전환에 복원 수치·전투 상태 불변 | PASS |
| 연습 결과표 명중집계·캠페인 불변 | PASS |
| 캠페인 자연 승리·귀속·소유권·결과표 | PASS |
| 마법 역할 실제 F키 스킬 발동 | PASS |
| 커스텀 새 게임과 복원모드 분리 | PASS |
| 실제 v15 저장 파일 입력 호환 | PASS |
| 390px 모바일 도감·장비 가로넘침 없음 | PASS |
| 891×411 가로 화면 전투 조작 접근 | PASS |
| 브라우저 런타임·콘솔·네트워크 오류 0 | PASS |

### 신규 전술·UI 브라우저 검사

| 항목 | 결과 |
|---|---|
| v20 starts with preserved 309 records and 13 source soldiers | PASS |
| multiselect transfer in both directions with intact origins | PASS |
| role filter and select-all apply only to visible roster | PASS |
| lowest-health-first roster sorting uses relative HP | PASS |
| equipment preview shows AT60 DF27 without state mutation | PASS |
| already equipped item preview has zero replacement delta | PASS |
| new tactical controls present with explicit default protection OFF | PASS |
| pending support selection does not expose unrelated unit | PASS |
| real Shift-right-click appends a waypoint with correct 3D projection | PASS |
| touch-friendly queue checkbox appends without changing support orders | PASS |
| clear-queue button preserves active destination | PASS |
| minimap left click pans camera to world coordinates | PASS |
| minimap right click commands the group, not projected coordinates | PASS |
| move-target mode accepts left-click/tap-compatible orders | PASS |
| focus view hides noncombat panels without stretching world coordinates | PASS |
| C selects lowest-health soldier and follows the camera | PASS |
| V requests and cancels individual retreat without advancing paused time | PASS |
| auto retreat checkbox changes selected group only | PASS |
| tactical pause allows command editing while time remains frozen | PASS |
| F5/F9 restores queued points, group protection and individual retreat | PASS |
| schema20 battle JSON downloads with tactical state | PASS |
| actual file input restores v20 queued battle | PASS |
| bad queued coordinates are rejected without replacing live game | PASS |
| actual v19 battle file migrates with safe tactical defaults | PASS |
| low-detail mode reduces geometry by at least 20% without changing simulation | PASS |
| graphics quality selection roundtrips with save | PASS |
| real retreat button causes selected soldier to walk out of battle | PASS |
| 891px landscape has visible touch controls and no horizontal overflow | PASS |
| 390px portrait battle and new dialogs stay within width | PASS |
| no runtime errors, console errors or external network requests | PASS |

## 재실행

```text
python build.py
node tests/engine.test.cjs --report
node tests/integration.test.cjs
node tests/tactics.test.cjs
python tests/browser.test.py
python tests/browser.integration.py
python tests/browser.tactics.py
node tools/make_examples.cjs
```

성공한 제한된 시나리오가 모든 명령·지형·병력 조합의 무결함을 보장하지 않는다. 진형 목표가 좁은 지형에 몰리면 집결이 지연될 수 있으며 부대별 경유점·진형을 다시 지정해야 할 수 있다.