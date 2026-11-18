# v21 검증 보고서

최종 v21 소스에서 기존 검사와 신규 검사를 실제 재실행한 결과다. 이전 버전 보고서의 통과 숫자를 복사해 합산하지 않았으며 원작 정확도를 검사한 횟수도 아니다.

## 결과 요약

| 검사 | 통과 | 실패 | 결과 |
|---|---:|---:|---|
| 기존 엔진 회귀 | 73 | 0 | `tests/engine-results.json` |
| 관측 데이터·게임 통합 | 54 | 0 | `tests/integration-results.json` |
| 기존 전술·편성 회귀 | 47 | 0 | `tests/tactics-results.json` |
| 신규 교전·표적·기여도 | 43 | 0 | `tests/command-results.json` |
| 브라우저 기본 조작 | 33 | 0 | `tests/browser-results.json` |
| 브라우저 관측 통합 | 31 | 0 | `tests/browser-integration-results.json` |
| 브라우저 전술 회귀 | 30 | 0 | `tests/browser-tactics-results.json` |
| 브라우저 신규 명령·전과 | 26 | 0 | `tests/browser-command-results.json` |
| **합계** | **337** | **0** | 엔진217 / 브라우저120 |

네 브라우저 스위트의 pageerror/console error/런타임 외부 네트워크 요청은 모두 0건이다. Chromium 144.0.7559.96 headless에서 수행했다. 390×844 세로, 891×411 가로, 1480×1040 데스크톱을 포함한다.

## 환경과 검증 한계

- WebGL 컨텍스트가 생성되지 않았다. 실제 화면/좌표/입력 검사는 CPU 3D 호환 모드 및2D다. GPU 셰이더 실행과 실기기 성능은 검증하지 않았다.
- file:// 직접 탐색은 ERR_BLOCKED_BY_ADMINISTRATOR로 차단되었다. 동일 HTML을 set_content로 주입했다. 실패 탐색은 통과 수에 포함하지 않았다. tests/file-url-probe-v21.json 참조.
- 실제 파일 선택과 JSON 다운로드를 사용했다. 영구 localStorage의 file:// 브라우저별 동작은 검증하지 않았다.
- Chromium has_touch 컨텍스트에서 touchscreen.tap으로 목적지를 지정했지만 Android/iOS 실기기를 사용한 것은 아니다.
- 일부 검사는 상태를 명시적으로 배치한 뒤 실제 입력을 수행한다. 모든 검사가 사람의 수동 플레이거나 완전한 자연 캠페인이라는 의미는 아니다.
- 보이는 전체 테스트 결과 파일의 suite 명칭에는 최초 도입 버전 이름이 일부 남아 있다. 실행 대상은 모두 현재 v21이다. 버전 기대값은21로 조정했고 구형 입력 예제는 그대로 유지했다.
- 신규 브라우저 테스트 첫 시도에서 UI 갱신 전 즉시 검사하던 타이밍 문제를 발견해 실제 프레임 갱신을 기다리는 assertion으로 수정했다. 최종 기록은 재실행 통과 결과다.
- 묶음 회귀 실행의 도구 제한시간으로 마지막 브라우저 스위트가 중단되어 해당 스위트를 별도로 다시 완주했다. 미완주 실행을 테스트 통과로 세지 않았다.

## 실제 검사한 주요 동작

교전 이동의 조건 검증과8개 예약상한, 접촉점 유지, 닫힌 성문 시야 차단, 표적 제거 후 경로 재개, 타격 전 표적 변경의 쿨다운 보존, 부대별/전군 집중, 후퇴 우선순위, 직접조작 우선순위, 치료사 지원 유지, 명중/회피/과잉피해/초과회복/성문 실피해, 전체 누적과120개 로그의 분리, 저장복원과 동일입력480틱, 손상된 저장 거부를 확인했다.

신규 엔진의 실제 경유점 완료 시나리오는 적을 고정한 통제 실험이다. 자연 승패·지원군·원래군단 귀속·성문 파괴·기존 전투 저장 연속성은 함께 재실행한 기존 회귀 테스트가 검사한다. 이 범위가 모든 배치·명령·병목의 완벽한 동작을 보장하지는 않는다.

## 보존 및 산출물 검사

- `data/*`와 `src/source-data.js` 9개 파일의 SHA-256이 v20과 동일하다. tests/provenance-v21.json 참조.
- JavaScript4모듈의 구문검사와 단일 HTML 빌드를 수행했다. 배포 HTML은 index.html의 바이트 복사본이다.
- 신규 예제3개는 현재 엔진에서 다시 가져올 수 있음을 검사했다. 기존 v20 예제는 마이그레이션 입력으로 그대로 보존했다.
- ZIP CRC와 SHA256SUMS는 최종 패키징 시 검사한다. 사전 검사와 출처 해시 검사는 위337개에 추가로 세지 않았다.
- preview-v21.png는 실제 전술 화면, performance-v21.png는 실행된 시뮬레이션의 누적 전과 화면이다.

## 소스 지문

- `engine.js`: `d017355cae78efea905cf682359208bee62c159cdce6560734a0057791646827`
- `layout.html`: `87d0733226680bfe804bf0446ebdbb1cc447c8597a18834c1bd08366d2672517`
- `renderer.js`: `8a0fdb5735466e52e4fe6b65021b0500b49ba3ae9772b63373f0b9e12f331ebe`
- `source-data.js`: `674d05c17fc0a347ccf0103fc9b567764193185eb51a55ad36bdf544d140e7db`
- `style.css`: `8e695d56fd020b82a8820702c4ccc5b82d6573afce30c523fdc9ac4be41f780c`
- `ui.js`: `eb8a6bae075dcb2e167f8111dacd5b1afe4975be37608c7c87aa581dc68d6bee`

## 기존 엔진 회귀

원시 결과: `tests/engine-results.json`

| 검사 | 결과 |
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

## 관측 데이터·게임 통합

원시 결과: `tests/integration-results.json`

| 검사 | 결과 |
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

## 기존 전술·편성 회귀

원시 결과: `tests/tactics-results.json`

| 검사 | 결과 |
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

## 신규 교전·표적·기여도

원시 결과: `tests/command-results.json`

| 검사 | 결과 |
|---|---|
| 교전 이동은 유효 목적지가 있어야 하며 잘못된 명령은 비변경 | PASS |
| 교전 이동과 8개 후속 지점은 부대별로 보존 | PASS |
| 집중 명령은 아군·전사자·존재하지 않는 ID를 거절 | PASS |
| 집중 공격은 기존 이동·후속 지점을 보존 | PASS |
| 가까운 적보다 지정 표적을 우선 | PASS |
| 미타격 공격을 취소해 표적 변경, 기존 쿨다운 유지 | PASS |
| 집중 표적 제거 시 기존 교전 이동 경로 재개 | PASS |
| 집중 표적 철수 또는 지정점에서 240 초과 이탈 시 추격 종료 | PASS |
| 집중 해제는 예약 이동을 삭제하지 않음 | PASS |
| 전군 집중 요청에 철수 부대가 포함되면 전체 거절 | PASS |
| 미도착 지원군에도 독립 집중 지시 가능 | PASS |
| 새 명령은 집중 표적과 교전 상태를 해제 | PASS |
| 직접 조작은 부대 집중 AI보다 우선 | PASS |
| 자동 부상병 철수는 집중 명령보다 우선 | PASS |
| 집중 중 치료사는 적 대신 사선 내 부상 아군 치료 | PASS |
| 집중 표적이 닫힌 성문 뒤에 있어도 벽을 뚫어 피해 없음 | PASS |
| 교전 이동은 시야 안 적 발견 시 접촉 지점을 고정 | PASS |
| 닫힌 성문 뒤 적은 교전 이동 탐지에 포함하지 않음 | PASS |
| 교전 이동 중 표적을 모두 잃으면 재탐색 대기 후 경로 재개 | PASS |
| 교전 중 목적지 도착으로 전체 경로를 끝내지 않음 | PASS |
| 교전 이동 실제 틱: 적 제거 후 두 경유점을 완료 | PASS |
| 성문 너머 교전 이동은 목적지를 무단 통과하지 않음 | PASS |
| 유효 피해·받은 피해는 현재 HP까지만 누적 | PASS |
| 초과 치유를 제외하고 시전자에만 유효량 기록 | PASS |
| 자연 회복은 치료사 기여도에 가산되지 않음 | PASS |
| 실제 치료 타격에 시전자 기여도 기록 | PASS |
| 회피는 명중·피해·처치를 증가시키지 않음 | PASS |
| 성문 피해는 남은 내구도까지만 기록 | PASS |
| 누적 통계는 최근120 로그가 잘려도 보존 | PASS |
| 전과 조회는 원본을 변경하지 않고 복사본을 반환 | PASS |
| 전투 결과표에 생존·철수·전사 병사와 수치 보존 | PASS |
| 진행 중 v21 저장 왕복 후 동일 명령 480틱 결과 일치 | PASS |
| 실제 v20 저장은 큐·개별철수 보존, 통계는 복원시점부터 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 존재하지 않는 집중 표적 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 아군 집중 표적 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 집중 원점 누락 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 음수 기여도 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 분수 처치수 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 기여도 필드 누락 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 미래 집계 시작시각 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 미래 재탐색 시각 초과 | PASS |
| 손상된 저장 거절과 현재 상태 보호: 교전 아닌 명령에 교전 기준점 | PASS |
| 관측 원본은 집중·교전·전과 기능 사용 후 불변 | PASS |

## 브라우저 기본 조작

원시 결과: `tests/browser-results.json`

| 검사 | 결과 |
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

## 브라우저 관측 통합

원시 결과: `tests/browser-integration-results.json`

| 검사 | 결과 |
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

## 브라우저 전술 회귀

원시 결과: `tests/browser-tactics-results.json`

| 검사 | 결과 |
|---|---|
| v21 starts with preserved 309 records and 13 source soldiers | PASS |
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
| actual file input restores v21 queued battle | PASS |
| bad queued coordinates are rejected without replacing live game | PASS |
| actual v19 battle file migrates with safe tactical defaults | PASS |
| low-detail mode reduces geometry by at least 20% without changing simulation | PASS |
| graphics quality selection roundtrips with save | PASS |
| real retreat button causes selected soldier to walk out of battle | PASS |
| 891px landscape has visible touch controls and no horizontal overflow | PASS |
| 390px portrait battle and new dialogs stay within width | PASS |
| no runtime errors, console errors or external network requests | PASS |

## 브라우저 신규 명령·전과

원시 결과: `tests/browser-command-results.json`

| 검사 | 결과 |
|---|---|
| v21 initial render and new command controls | PASS |
| T + actual field click issues attack-move | PASS |
| Shift click queues attack-move and Escape exits target mode | PASS |
| right click enemy sets focus without deleting route | PASS |
| focus command does not change other friendly groups | PASS |
| clear target resumes existing command and route | PASS |
| X targeting ignores empty ground and accepts enemy click | PASS |
| focus markers and contact rendering are simulation read-only | PASS |
| same enemy targeting works in 2D and CPU 3D | PASS |
| all-armies checkbox explicitly applies focus to pending supports | PASS |
| target death clears target UI and preserves base order | PASS |
| targeting and new orders work without advancing paused battle | PASS |
| minimap destination uses attack-move mode and world coordinates | PASS |
| live performance table shows actual clipped damage and healing | PASS |
| healing sort exposes support unit contribution | PASS |
| statistics dialog freezes battle while reading | PASS |
| performance JSON downloads real aggregate counters | PASS |
| F5/F9 preserves target, queued attack-move and performance | PASS |
| actual JSON download/upload restores complete tactical state | PASS |
| invalid performance input is rejected without state loss | PASS |
| actual v20 input migrates and explains partial performance coverage | PASS |
| end-of-battle report retains unit statistics after runtime is cleared | PASS |
| checkbox focus keeps shortcuts; open dialogs protect them | PASS |
| touch events at 390px issue attack-move and table stays within dialog | PASS |
| 891px landscape with focus mode has no horizontal overflow | PASS |
| no page/console errors or runtime network requests | PASS |
