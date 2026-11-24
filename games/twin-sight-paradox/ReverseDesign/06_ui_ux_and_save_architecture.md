# 06. UI/UX 및 이중 상태 세이브 아키텍처

## 1. 커맨드형 ADV 화면 레이아웃 (SS / R 기준 + PlayHub 현대화) `[확인]` `[재구성안]`

원작(PC-98 / 세가 새턴 / R)의 클래식 커맨드 어드벤처 감각을 유지하면서, 복수 주인공 전환 시 플레이어가 현재 시점·날짜·정보 격차를 직관적으로 인지할 수 있도록 화면을 5개 영역으로 설계한다.

```text
+------------------------------------------------------------------------+
| [TOP BAR]  SIGHT: [코지로 (Kojiro) | 12/06 Day 4]   LOCATION: 아마기 사무소 |
|            SYNC STATUS: 마리나 시점 대기 중 (SB_05 활성)  [SWITCH ⇄] [MENU] |
+---------------------------------------------------+--------------------+
|                                                   | [COMMAND PANEL]    |
|                                                   |  > LOOK   (見る)   |
|           SCENE VIEWPORT (16:9 / 4:3)             |  > TALK   (話す)   |
|       배경 CG + 캐릭터 스탠딩 + 연출 레이어           |  > THINK  (考える) |
|                                                   |  > MOVE   (移動)   |
|                                                   |  > ITEM   (持ち物) |
|                                                   |  ----------------- |
|                                                   |  ★ SIGHT CHANGE    |
|                                                   |  [CLUE LOG] [MAP]  |
+---------------------------------------------------+--------------------+
| [SPEAKER: 푸딩 (→ 정체 판명 후: 프리시아)]                                 |
| "코지로… 저 사람들은 왜 계속 나를 쫓아오는 거야?"                           |
|                                               [SKIP] [AUTO] [LOG] [▼]  |
+------------------------------------------------------------------------+
```

### 1.1 시각적 관점 분리 (Visual Sight Coding) `[재구성안]`
두 주인공 간 전환 시 혼동을 원천 차단하기 위해 UI 테마와 오디오 단서를 분리한다.
- **아마기 코지로 시점**: 앰버/하드보일드 네이비 톤 테두리, 탐정 수첩 아이콘, 재즈/누아르 계열 BGM 테마.
- **호죠 마리나 시점**: 쿨 시안/스틸 블루 톤 테두리, 내각조사실 터미널 아이콘, 첩보/서스펜스 전자음 계열 BGM 테마.
- **트리스탄호 합류 (`CONVERGENCE_LOCK`)**: 듀얼 톤이 골드/크림슨 긴급 조명으로 통합되며 `SIGHT CHANGE` 버튼이 `[CONVERGED]` 배지로 잠금 표시된다.

## 2. 6대 커맨드 인터랙션 명세 `[확인]` `[재구성안]`

| 커맨드 | 원작 일본어 | 동작 규칙 | 비대칭/동기화 연계 |
| --- | --- | --- | --- |
| `LOOK` | 見る (조사) | 현재 장소 배경·인물·세부 오브젝트 목록 표시. 반복 선택 시 2~3단계 심화 텍스트 출력 `[확인]` | 주인공별 관찰 어휘와 발견 단서(`clueId`) 분리 |
| `TALK` | 話す (대화) | 현장 NPC에게 대화. 동일 인물 반복 대화로 숨김 화제 해금 `[확인]` | `known_to_<protagonist>`에 따라 화자명·호칭·화제 필터링 |
| `THINK` | 考える (추리) | 현재 주인공의 지식 집합만 사용해 상황 요약 및 다음 행동 암시 `[확인]` | 장벽(`SYNC_BARRIER_WAIT`) 도달 시 상대 시점 전환 간접 힌트 제공 |
| `MOVE` | 移動 (이동) | 현재 주인공에게 해금된 로케이션 목록 출력 (`locations.json`의 `accessible_by` + 플래그 조건) `[확인]` | 교차 이벤트 발생 시 신규 이동지 해금 |
| `ITEM` | アイテム | 현재 주인공 전용 인벤토리 열람·조사·사용 `[확인]` | 코지로/마리나 인벤토리 완전 격리 (합류 전 공유 불가) |
| `SIGHT CHANGE` | サイトチェンジ | 활성 주인공을 즉시 전환. 떠나온 쪽의 위치·씬·대화 카운터를 무손실 동결 `[확인]` | Day 0·컷신·합류 이후 잠금, 장벽 도달 시 강조 표시 |

## 3. 현대적 QoL (Twin Sight Paradox R 참고) vs Classic 모드 토글 `[확인]` `[재구성안]`

- **Sight Status 인디케이터 (`R` 스타일 현대 옵션)** `[재구성안]`:
  - **Modern 모드(기본)**: 현재 주인공이 `SYNC_BARRIER_WAIT`에 도달하면 상단 HUD의 `SIGHT CHANGE` 버튼이 은은하게 맥동하며 "다른 시점에서 선행 사건이 필요합니다" 안내를 표시.
  - **Classic 모드(PC-98/SS 원형)**: 인디케이터를 숨기고 오직 커맨드 고갈과 `THINK` 대사만으로 플레이어가 전환 시점을 추론하게 한다.
- **범인 입력 모드 (`Classic/SS/R` vs `PLUS`)** `[확인]` `[재구성안]`:
  - **Classic 모드(기본)**: 트리스탄호 종반에 텍스트 입력창(또는 한국어/일본어/영문 별칭 정규화 입력기)으로 진범(`미도 마야코` / `御堂真弥子` / `Mayako Mido`)을 직접 입력.
  - **Streamlined(PLUS) 모드**: 객관식 용의자 선택 UI 또는 자동 추리 연출로 전환 가능.
- **기독 스킵·백로그·플로차트** `[확인]`: `Twin Sight Paradox R`에서 도입된 고속 로드, 기독 텍스트 스킵, 병렬 타임라인 플로차트(방문 완료 씬과 장벽 연결선 시각화)를 지원한다.

## 4. 이중 상태 세이브 직렬화 아키텍처 (Dual-State Save Schema) `[재구성안]`

단일 주인공 ADV와 달리, 세이브 슬롯은 **두 주인공의 동결 스냅샷 + 공유 세계 상태 + 동기화 장벽 상태**를 원자적(Atomic)으로 직렬화해야 한다.

```json
{
  "schemaVersion": "1.0.0",
  "slotId": 1,
  "savedAt": "2026-11-22T14:30:00Z",
  "mode": {
    "sightHintMode": "modern",
    "culpritInputMode": "classic"
  },
  "globalPhase": "ACTIVE_INVESTIGATION",
  "activeProtagonist": "marina",
  "worldClock": {
    "currentDayIndex": 4,
    "calendarDate": "12-06"
  },
  "protagonists": {
    "kojiro": {
      "currentSceneId": "K_D4_01",
      "currentLocationId": "loc_amagi_agency",
      "completedSceneIds": ["K_D1_01", "K_D1_02", "K_D2_01", "K_D3_01"],
      "inventoryItemIds": ["item_painting_photo", "item_amagi_memo", "item_purin_pendant"],
      "knownClueIds": ["clue_fake_stollman", "clue_purin_warehouse", "clue_painting_seal_half"],
      "revealedAliasIds": ["dib"],
      "commandExhaustion": { "K_D4_01:LOOK:terminal": 1 }
    },
    "marina": {
      "currentSceneId": "M_D4_01",
      "currentLocationId": "loc_jcia_hq",
      "completedSceneIds": ["M_D0_01", "M_D0_02", "M_D1_01", "M_D2_01", "M_D3_01"],
      "inventoryItemIds": ["item_ikuiku_handgun", "item_jcia_badge", "item_yale_faculty_id"],
      "knownClueIds": ["clue_mayako_guard", "clue_suzuki_alias", "clue_director_room_seal_half", "clue_dbms_level7_lock"],
      "revealedAliasIds": [],
      "commandExhaustion": { "M_D4_01:TALK:terminal": 2 }
    }
  },
  "sharedWorld": {
    "triggeredEventIds": [
      "evt_marina_day0_setup",
      "evt_kojiro_fake_stollman_commission",
      "evt_marina_director_room_seal_clue",
      "evt_kojiro_fake_kou_exposed",
      "evt_marina_dbms_lock_triggered"
    ],
    "unlockedBarrierIds": ["SB_01", "SB_02", "SB_03", "SB_04", "SB_05"],
    "worldMutations": {
      "stollmanAlive": false,
      "nikaidoWanted": true,
      "dbmsDeadlockWindowOpen": false
    }
  },
  "checksum": "sha256:..."
}
```

### 4.1 세이브 무결성 불변식 `[재구성안]`
1. **원자적 커밋**: `SIGHT CHANGE`는 세이브 파일 덮어쓰기 없이 메모리 내 양측 스냅샷만 스왑하며, 디스크/스토리지 저장 시에만 `protagonists.kojiro` + `protagonists.marina` + `sharedWorld` 전체를 단일 JSON 트랜잭션으로 기록한다.
2. **로드 시 교착 재검증**: 세이브 로드 직후 엔진은 `unlockedBarrierIds`와 `completedSceneIds`를 정적 데이터(`sync_barriers.json`)와 재대조하여 손상된 세이브를 조기 감지한다.
3. **자동 체크포인트 슬롯(Auto-Slot 0)**: 즉사 분기 진입 직전 및 매 `SYNC_BARRIER` 해제 직후 자동 백업하여 불합리한 진행 손실을 방지한다.
