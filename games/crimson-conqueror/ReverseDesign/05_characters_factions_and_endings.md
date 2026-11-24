# 05. 세력, 핵심 인물 로스터 및 멀티 엔딩 매트릭스

## 1. 10대 정규화 세력 카탈로그 (`verified_data/factions.json`)

| 세력 ID | 세력명 (한/일/영) | 대표 인물 | 수도 거점 | 외교 성향 | 활동 페이즈 | 등급 |
|---|---|---|---|---|---|---|
| `fac_leazas` | 리자스 왕국 / リーザス王国 / Kingdom of Leazas | `chr_rance` | `ter_leazas_castle` | `PLAYER` | 전 페이즈 | `[확인]` |
| `fac_ex_rebellion` | 리자스 백군 반란군 / リーザス白軍反乱軍 / Ex Rebellion | `chr_ex` | `ter_leazas_white_fort` | `HOSTILE_EARLY` | `LEAZAS_REBELLION` | `[확인]` |
| `fac_free_cities` | 자유도시연합 / 自由都市地帯 / Free Cities Alliance | `chr_maria` (대표) | `ter_custom` | `NEUTRAL_EXPANDABLE` | `HUMAN_REALM` | `[해석]` |
| `fac_helman` | 헬만 제국 / ヘルマン帝国 / Helman Empire | `chr_patton` | `ter_lang_bau` | `HOSTILE_MAJOR` | `HUMAN_REALM` | `[확인]` |
| `fac_zeth` | 제스 왕국 / ゼス王国 / Magic Kingdom of Zeth | `chr_gandhi` | `ter_old_zeth` | `HOSTILE_MAJOR` | `HUMAN_REALM` | `[확인]` |
| `fac_al_church` | AL교 / AL教 / AL Church | `chr_mulala` | `ter_al_hq` | `NEUTRAL_RELIGIOUS` | `HUMAN_REALM` | `[확인]` |
| `fac_japan` | JAPAN / JAPAN / JAPAN | `chr_isoroku` | `ter_japan_main` | `NEUTRAL_ISLAND` | `HUMAN_REALM` | `[확인]` |
| `fac_demon_kayblis` | 마인군(케이브리스파) / ケイブリス派 / Kayblis Faction | `chr_kayblis` | `ter_sulphur_forest` | `CRISIS_ENDGAME` | `MONSTER_REALM` | `[확인]` |
| `fac_demon_hornet` | 마인군(호넷파) / ホーネット派 / Hornet Faction | `chr_hornet` | `ter_hornet_castle` | `NEUTRAL_FACTIONAL` | `MONSTER_REALM` | `[확인]` |
| `fac_independent_ancient` | 독립·고대·신계 세력 / 独立・迷宮・創造神 / Independent & Creator | `chr_rudrasaum` | `ter_rudrasaum_ruins` | `SPECIAL_ENDGAME` | `CREATOR_PHASE` | `[재구성안]` |

---

## 2. 핵심 인물 33인 로스터 요약 (`verified_data/characters.json`)

원작의 플레이어블 부하(Subordinates) 총수는 **52명** `[확인]`이며, 본 데이터셋에서는 10대 세력 지도자·주요 보스·핵심 시나리오/타이머/엔딩 연계 인물 **33명**(플레이어블 27명 + 비전투/보스 지도자 6명)을 우선 복원했다. (나머지 25명 일반/보조 부하의 전체 스탯 테이블은 `DATA_GAPS.md`에 기록 `[검증 필요]`.)

### 리자스 & 반란군 (10명)
- **`chr_rance` (란스)**: 리자스 국왕, `cls_leazas_knights`, 필살기 `Rance Attack`(Snipe). HP 0 시 즉시 `end_death`. `[확인]`
- **`chr_sill` (시일 플라인)**: `cls_clerics_support`, 볼고 Z 수감(`4/01/3` 기한). `end_bliss` 및 시즈카/나기 체인의 핵심 열쇠. `[확인]`
- **`chr_lia` (리아 파라파라 리자스)**: 리자스 여왕(비전투 국왕). 리자스 궁정 시나리오 및 시일 부재 분기 축. `[확인]`
- **`chr_maris` (마리스 아마릴리스)**: 재상, `cls_mages`. 초기 측근·내정 보좌. `[확인]`
- **`chr_barres` (바레스 프로방스)**: 흑군 장군, `cls_leazas_knights`. 초기 전열 핵심. `[확인]`
- **`chr_cordoba` (코르도바 번)**: 청군 장군, `cls_royal_guards`. 초기 병력 1,000, 대표 방벽 탱커. `[확인]`
- **`chr_rick` (릭 애디슨)**: 적군 장군(검성), `cls_leazas_knights`. `By La Way`(Snipe) 보유 최상위 물리 어태커. `[확인]`
- **`chr_kanami` (켄토 카나미)**: 초기 닌자, `cls_ninjas`. 첩보 5회/턴; 지속 혹사 시 코드 암살(`end_assassinated`). `[확인]`
- **`chr_leila` (레이라 그렉니)**: 친위대장, `cls_royal_guards`. `[확인]`
- **`chr_ex` (엑스 뱅큇)**: 백군 반란군 수장, `cls_leazas_knights`. 진압 후 합류, 고전략치 지휘관. `[확인]`

### 자유도시연합 (6명)
- **`chr_maria` (마리아 커스터드)**: `cls_artillery_tech`, 커스텀 병합 합류, 튤립 100호 → `end_to_outer_space`. `[확인]`
- **`chr_shizuka` (마소 시즈카)**: `cls_mages`, 커스텀 병합 합류, 제스 5주 결투 및 아담/테이프 순서 연동. `[확인]`
- **`chr_soul` (소울)**: `cls_brawlers`, 볼고 Z 구출(`3/08/3` 기한), 바운드 영입 선행. `[확인]`
- **`chr_miru` (미르 요크스)**: `cls_kaiju_beasts`, 커스텀 병합 합류, 고방어 괴수 부대. `[확인]`
- **`chr_kentarou` (오가와 켄타로)**: `cls_brawlers`, 성검 닛코 보유, 미키 동반 마인전 시너지. `[확인]`
- **`chr_miki` (쿠루스 미키 / 리틀 프린세스)**: `cls_demons`, 금기 시 `end_demon_king_2`, Pi-R 피랍 시 케이브리스 무적화. `[확인]`

### 헬만 제국 (5명) & 제스 왕국 (4명)
- **헬만**: `chr_patton`(패튼, `cls_helman_knights`), `chr_sheila`(실라, `cls_helman_knights`), `chr_hunty`(헌티, `cls_kalars`), `chr_freak`(프리크, `cls_artillery_tech`), `chr_freya`(프레이야, `cls_ninjas` — 개전 후 식량 독살·자금 유출 공작). `[확인]`
- **제스**: `chr_gandhi`(간지 국왕, `cls_mages`), `chr_magic`(매직 공주, `cls_mages` — 백색 파괴광선), `chr_nagi`(나기, `cls_mages` — 시즈카 숙적/결투 분기), `chr_chizuko`(야마다 치즈코, `cls_mages` — 사천왕 필두). `[확인]`

### AL교 · JAPAN · 마계 · 고대/신계 (8명)
- **AL교 / JAPAN**: `chr_mulala`(교황 무라라, 비전투 지도자 `[해석]`), `chr_isoroku`(야마모토 이소로쿠, `cls_archers` — 후열 궁술/저격 특기 `[확인]`).
- **마계 / 신계**: `chr_kayblis`(케이브리스, 유황의 숲 최종 보스), `chr_hornet`(호넷, 호넷파 수장), `chr_warg`(와그 아카, 전향 가능·루드라사움 최면 핵심), `chr_satella`(사테라, 제안 수락=`end_demon_king_1` / 합류=미키 호위), `chr_haniwa_king`(하니와 킹, 사사호 B66F 비밀 영입), `chr_rudrasaum`(창조신 루드라사움, 창조신 페이즈 최종 존재). `[확인]`

---

## 3. 14개 메인 스토리 엔딩 해금 매트릭스 (`verified_data/endings.json`)

| # | 엔딩 ID | 엔딩명 (한/영) | 분류 | 발생 페이즈 | 핵심 달성 조건 | 등급 |
|---:|---|---|---|---|---|---|
| 1 | `end_bliss` | 지복 / Bliss (진 엔딩) | `TRUE_END` | `CREATOR_PHASE` | 전 영토(샹그릴라 제외) 정복 → 케이브리스 격파 → **시일 생존** + **와그 최면** | `[확인]` |
| 2 | `end_world_king` | 세계왕 / World King | `CREATOR_GOOD_ALT` | `CREATOR_PHASE` | 창조신 페이즈 + **와그 최면** + **시일 부재** | `[확인]` |
| 3 | `end_servant` | 신의 종 / Servant | `CREATOR_ALT` | `CREATOR_PHASE` | 창조신 페이즈 + **시일 보유** + 루드라사움의 혼돈 창조 제안 동의 | `[확인]` |
| 4 | `end_god` | 신 / God | `CREATOR_BAD` | `CREATOR_PHASE` | 루드라사움 패배 또는 신의 미궁(God Cave) 유폐 | `[확인]` |
| 5 | `end_unification` | 대륙 통일 / Unification | `STANDARD_CLEAR` | `MONSTER_REALM` | 샹그릴라 제외 전 영토 미달 상태에서 케이브리스 격파 | `[확인]` |
| 6 | `end_to_outer_space` | 우주로 / To Outer Space | `SPECIAL_CHARACTER_END` | `HUMAN_REALM` | 마리아의 **튤립 100호** 로켓 개발 완료 | `[확인]` |
| 7 | `end_demon_king_1` | 마왕 1 / Demon King (1) | `SPECIAL_DARK_END` | `MONSTER_REALM` | 마인 **사테라**의 제안 수락 | `[확인]` |
| 8 | `end_demon_king_2` | 마왕 2 / Demon King (2) | `SPECIAL_DARK_END` | `MONSTER_REALM` | **미키(리틀 프린세스)** 금기 이벤트 발동 | `[확인]` |
| 9 | `end_bandit_king` | 도적왕 / Bandit King | `EARLY_SPECIAL_END` | `BANDIT_PROLOGUE` | 프롤로그에서 헬만 **루베란** 토벌대 격파 | `[확인]` |
| 10 | `end_assassinated` | 암살 / Assassinated | `HAZARD_BAD_END` | `HUMAN_REALM` | 시노부 암살 패배 또는 **카나미** 지속 혹사 후 코드(Code) 암살 | `[확인]` |
| 11 | `end_death` | 전사 / Death | `GAME_OVER` | `ANY` | 전투 중 란스 지휘관 HP 0 | `[확인]` |
| 12 | `end_defeat` | 패배 / Defeat | `GAME_OVER` | `ANY` | 본거지 **리자스성** 함락 | `[확인]` |
| 13 | `end_servant_no_sill_variant` | 신의 종 (시일 부재 변형 추정) | `CREATOR_ALT` | `CREATOR_PHASE` | 14엔딩 목록 미확인 슬롯 13 (`DATA_GAPS.md` 원문 대조 필요) | `[검증 필요]` |
| 14 | `end_lia_leazas_branch` | 리아/리자스 귀속 분기 추정 | `SPECIAL_CHARACTER_END` | `CREATOR_PHASE` | 14엔딩 목록 미확인 슬롯 14 (`DATA_GAPS.md` 원문 대조 필요) | `[검증 필요]` |

> **캐릭터 운명 결산 (Destiny System)** `[확인]`:
> 위 메인 엔딩(클리어 계열) 도달 시, **66명의 여성 캐릭터 × 2종(행복/불행) = 총 132개**의 개별 운명 기록이 별도 정산된다.
