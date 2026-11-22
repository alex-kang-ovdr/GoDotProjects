# 08. 검증 및 테스트 계획

## 1. 자동화 데이터·그래프 검증 (`validate_data.mjs`) `[재구성안]`
`games/yu-no/ReverseDesign/verified_data/validate_data.mjs`는 CI 및 로컬 개발 시 아래 6개 불변식을 자동 검증한다.

| 검증 계층 | 검사 항목 | 합격 기준 |
|---|---|---|
| **L1. 스키마/고유성** | 전 JSON 파일 파싱 및 모든 엔티티 ID 중복 검사 | 중복 ID 0건 |
| **L2. JSON ↔ CSV 동기화** | `characters.json`↔`.csv` (20행), `locations.json`↔`.csv` (27행) 주요 컬럼 일치 | 불일치 0건 |
| **L3. 참조 무결성** | 캐릭터·로케이션·루트·엔딩·보옥·아이템·플래그·노드·엣지 간 교차 참조 | Dangling ID 0건 |
| **L4. 보옥 수량 불변식** | PC-98 초기 2 + 발견 6 = 8 / SS·리메이크 초기 4 + 발견 6 = 10 | 정확 일치 |
| **L5. 고정점 도달성** | 루트 노드(`node_prologue_start`)에서 A.D.M.S. 글로벌 역계승을 모사한 고정점 탐색 | 35/35 노드 도달, 6개 발견 보옥 전량 수집, `node_true_end` 도달 |
| **L6. 탐색 순서 독립성** | 분기 엣지 순서를 역순(최악 순서: 칸나→에리코→미오→카오리→아유미→미츠키)으로 뒤집어 고정점 탐색 재실행 | 순서와 무관하게 35/35 노드 및 `node_true_end` 도달 보장 |

## 2. 엔진 구현 단계 단위·통합 테스트 시나리오 `[재구성안]`

### 2.1 보옥 경제학 테스트 (`adms-jewel.test.mjs`)
1. **초기 슬롯 테스트**: `pc98_8_jewels` 모드에서 초기 `availableJewels === 2`, `ss_remake_10_jewels` 모드에서 `4` 확인.
2. **배치·회수 순환 테스트**: 보옥 세이브 시 `availableJewels` 1 감소, 보옥 로드 시 1 증가 및 해당 노드 앵커 삭제 확인.
3. **고갈 방지 테스트**: `availableJewels === 0` 상태에서 신규 노드에 보옥 세이브 시도 시 예외 반환 확인.
4. **이세계편 봉인 테스트**: `route_isekai` 노드에서 `placeJewel` / `loadJewel` 호출 시 차단 확인.

### 2.2 비대칭 역계승 및 패러독스 테스트 (`inheritance.test.mjs`)
1. **블루 카드 역계승**: 아유미 루트에서 `item_blue_card` 획득 → 카오리 루트 직전 앵커로 보옥 로드 → `node_kaori_gate_blue_card` 해금 확인.
2. **초념석 → 칸나 구명**: `item_chounenseki` 미보유 시 `node_kanna_bad_no_stone` 도달 확인 → 카오리 루트에서 확보 후 역계승 시 `node_kanna_end` 및 `item_study_key` 획득 확인.
3. **서재 열쇠 → 1일차 귀환**: `item_study_key` 보유 상태로 `node_day1_hub` 보옥 로드 → `flag_local_study_early_luggage_intact` 유지 + `node_study_unlock` → 괘종시계 `6 → 3` → `jewel_found_6` 획득 확인.
4. **소비 비복구 검증**: `item_silver_medal` 소비 후 과거 스냅샷(획득 이후 시점)으로 로드했을 때 인벤토리에도 맵에도 중복 생성되지 않음 확인.
5. **토장 로프 순서 함정 검증**: `flag_local_storehouse_wall_first` 설정 시 `node_mitsuki_storehouse`→`node_mitsuki_end` 경로 차단(`forbids_local_flags`) 확인.

### 2.3 이세계편 선형 퍼즐 테스트 (`isekai-linear.test.mjs`)
1. **사막 커맨드 총공격**: 유노 대화·주변 조사 카운터 충족 전에는 지하도 진입 차단, 충족 후 해금 확인.
2. **지하도 1 방향 퍼즐**: `전진 → 막다른 길 → 1칸 후퇴 → 우측` 입력 시 통과, 오답 방향 시 루프 복귀 확인.
3. **최종방 발광 위탁물**: `item_entrusted_light` 확인 플래그(`flag_local_dg_final_room_light_checked`) 미충족 시 탈출 불가, 확인 시 `node_true_end` 도달 확인.

## 3. 브랜치 소유권 및 스킬 게이트 검증
- `node games/yu-no/ReverseDesign/verified_data/validate_data.mjs` → `0 errors`
- `npm run check:ownership` → `fail 0` (`games/yu-no/**` 단독 소유, `tools/worktree-ownership/owners.json` 공유 핫스팟)
- `npm run check:skills` → `fail 0`
