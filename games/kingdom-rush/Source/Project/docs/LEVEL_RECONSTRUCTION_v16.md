# Kingdom Rush v16 — 원작 레벨 지형 데이터 재구축

## 복원 결과

본편 12개 맵을 대상으로 **27개 이동 경로와 155개 건설물 위치**를 재구축했다. 건설물 위치는 Scott Louvau가 자신의 Kingdom Rush 분석 도구에 기록한 숫자 좌표를 사용했고, 도로 중심선은 같은 저장소의 원작 플레이 스크린샷을 직접 읽어 작성했다. **원본 엔진 경로 데이터의 추출본은 아니다.** 원본 수치로 확인된 것과 시각적으로 추정한 것을 데이터에서 구분한다.

대응 파일: `data/geometry_reconstruction_v16.json`. v15의 창작 지형은 별도 플레이 프로필로 유지할 수 있으며 이 파일은 그 지형을 삭제하지 않는다. 원작 그래픽, 스크린샷, 음원 또는 원본 게임 코드는 결과물에 포함하지 않는다.

| 구분 | 수량 | 근거와 처리 |
|---|---:|---|
| 본편 맵 | 12 | 원작 단계 번호 L1–L12 및 기존 v14 단계 ID 연결 |
| 주요 이동 경로 | 27 | 원본 이미지의 가시 도로를 수동 추적한 시각 추정 |
| 일반 전략 지점 | 152 | 작성자의 `positions.json` 기록 좌표 |
| 기존 궁수탑 지점 | 1 | Silveroak E7; 캠페인 화면에서 관측 |
| 특수 시설 지점 | 2 | Silveroak B8 엘프 훈련소, Stormcloud A1 태양광선 탑 |
| 원본 엔진 경로/서브패스 추출 | 0 | 원작 내부 좌표·충돌 마스크·프레임 타이밍 미복원 |

## 출처와 버전 고정

- [Scott Louvau의 공개 분석 저장소](https://github.com/ScottLouvau/kingdomrush)
- [분석 도구와 직접 플레이 기록 설명](https://relentlessoptimizer.com/KR/)
- [지점 라벨 및 계획 기록 방법](https://relentlessoptimizer.com/KR/help/)
- [원작 맵 모음](https://relentlessoptimizer.com/KR/maps/)
- [Ironhide 공식 공략](https://www.kingdomrush.com/kingdom-rush-strategy-guide)
- 고정 커밋: `a3c8218c19fab8e43596309de31eeeeb4a0bc8d6`
- [숫자 좌표 원문](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/js/data/positions.json)
- [맵 번호/이름 연결 원문](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/js/maps/index.mjs)
- [MIT 라이선스 원문](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/LICENSE)

원문 이미지 L1–L12는 모두 1920×1080이다. 각 맵의 `source`에 이미지 URL, 파일 SHA-256, 원본 크기와 커밋을 저장했다. A9·B8 등 지점명은 저자가 만든 분석용 좌표 명칭이며, 원작 게임 UI에서 부여한 공식 건설지 명칭이 아니다. 맵 2의 The Outskirts/The Farmlands, 맵 4의 Twin Rivers/Twin River Pass는 같은 단계의 명칭 차이로 기록하고 기존 ID는 유지했다.

### 증거 수준

| 데이터 | 상태값 | 무엇을 의미하는가 |
|---|---|---|
| 건설물 중심 | `source_recorded_screenshot_coordinate` | 공개 분석 데이터에 기록된 이미지 좌표와 일치한다. 원본 엔진 좌표라는 뜻은 아니다. |
| 경로·목표·사건 위치 | `visual_estimate` | 고정된 참고 이미지에서 직접 읽은 근사값이다. |
| 관측 입구 연결 | `observed_label_to_visible_route` | v14 입구 라벨을 보이는 해당 도로에 연결했다. |
| 집계만 있는 입구 연결 | `routing_inferred_without_per_entry_wave_counts` | 지형상 가능한 도로를 구성했으나 적의 원작 분기 선택과 입구별 수량은 확정되지 않았다. |

Citadel, Icewind, Wastes, Forsaken의 기존 v14 웨이브 자료는 입구별 적 수를 분리하지 않는다. 이 네 맵의 `entryPathMap`은 지형을 설명하기 위한 구현 라벨이다. 이들 맵을 플레이할 수 있다는 것과 원작의 입구별 배분을 복원했다는 것은 서로 다른 검증 항목이다.

## 좌표 변환과 해석

```text
x_world = x_source × 1000 / 1920
y_world = y_source × 620 / 1080
```

좌상단이 원점이고 x는 오른쪽, y는 아래쪽으로 증가한다. 출처 좌표는 `sourcePixel`, 경로 원좌표는 `rawPaths`에 보존하며 변환값은 소수점 둘째 자리까지 저장한다.

두 축을 별도로 변환했으므로 16:9 참고 이미지의 종횡비는 유지되지 않는다. 기존 웹 게임의 1000×620 월드에 맞춘 좌표계이다. 원본 픽셀 사거리·속도를 그대로 넣어 원작과 동일한 밸런스라고 주장하면 안 된다. 웹 게임에서 사거리·속도·스폰 간격을 별도로 조정해야 한다.

경로는 화면 바깥으로 자동 연장하지 않고 보이는 파란 목표 표식에서 끝난다. The Dark Tower처럼 입구가 성 뒤에 가려진 경우 가시 도로의 시작점을 사용한다. 이는 이미지로 확인할 수 없는 오프스크린 경로를 임의의 확정값으로 만들지 않기 위한 처리다.

## 단계별 구조

| 순서 | 단계 ID | 이름 | 주요 경로 | 일반 공터 | 기존 탑 | 특수 시설 |
|---:|---|---|---:|---:|---:|---:|
| 1 | `southport` | Southport | 1 | 8 | 0 | 0 |
| 2 | `outskirts` | The Outskirts | 1 | 7 | 0 | 0 |
| 3 | `pagras` | Pagras | 2 | 12 | 0 | 0 |
| 4 | `twin_rivers` | Twin Rivers | 2 | 15 | 0 | 0 |
| 5 | `silveroak` | Silveroak Forest | 3 | 12 | 1 | 1 |
| 6 | `citadel` | The Citadel | 4 | 15 | 0 | 0 |
| 7 | `coldstep` | Coldstep Mines | 3 | 11 | 0 | 0 |
| 8 | `icewind` | Icewind Pass | 2 | 12 | 0 | 0 |
| 9 | `stormcloud` | Stormcloud Temple | 3 | 15 | 0 | 1 |
| 10 | `wastes` | The Wastes | 2 | 14 | 0 | 0 |
| 11 | `forsaken` | Forsaken Valley | 2 | 18 | 0 | 0 |
| 12 | `dark_tower` | The Dark Tower | 2 | 13 | 0 | 0 |

### 입구와 경로 인덱스

경로 번호는 JSON과 런타임의 0부터 시작하는 인덱스다. 사용자 화면에서는 1부터 시작하는 번호로 표시할 수 있다. 경로 길이는 재구축된 폴리라인에서 계산한 월드 단위이며 원작 거리나 예상 도착 시간이 아니다.

| 단계 | 인덱스 | 경로 ID | 입구 라벨 | 길이(월드) |
|---|---:|---|---|---:|
| Southport | 0 | `north_to_east` | main | 1013.86 |
| The Outskirts | 0 | `east_serpentine` | main | 1474.32 |
| Pagras | 0 | `northeast` | northeast | 1492.15 |
| Pagras | 1 | `east` | east | 1298.61 |
| Twin Rivers | 0 | `west_branch` | west | 832.12 |
| Twin Rivers | 1 | `east_branch` | east | 903.42 |
| Silveroak Forest | 0 | `south_west` | southwest | 979.57 |
| Silveroak Forest | 1 | `south_north` | southnorth | 869.47 |
| Silveroak Forest | 2 | `east_spiders` | east | 650.38 |
| The Citadel | 0 | `west_outer` | west | 930.45 |
| The Citadel | 1 | `south_west_inner` | southwest | 739.01 |
| The Citadel | 2 | `south_east_inner` | southeast | 739.01 |
| The Citadel | 3 | `east_outer` | east | 930.45 |
| Coldstep Mines | 0 | `main_north` | main | 1546.24 |
| Coldstep Mines | 1 | `east_mine` | cave_east | 818.97 |
| Coldstep Mines | 2 | `southwest_mine` | cave_southwest | 391.68 |
| Icewind Pass | 0 | `northeast_serpentine` | northeast | 1384.77 |
| Icewind Pass | 1 | `southeast_short` | southeast | 914.32 |
| Stormcloud Temple | 0 | `north` | north | 917.91 |
| Stormcloud Temple | 1 | `south` | south | 891.96 |
| Stormcloud Temple | 2 | `east_cave` | cave | 492.91 |
| The Wastes | 0 | `west_serpentine` | west | 1155.03 |
| The Wastes | 1 | `east_arc` | east | 1126.79 |
| Forsaken Valley | 0 | `southwest_ring` | southwest | 832.39 |
| Forsaken Valley | 1 | `southeast_ring` | southeast | 856.13 |
| The Dark Tower | 0 | `northwest` | northwest | 1360.89 |
| The Dark Tower | 1 | `northeast` | northeast | 1228.31 |

### 지형에서 읽은 설계 의도

아래 설명은 복원된 도로 배치로부터 도출한 분석이며 개발자가 공개한 설계 의도라고 단정하지 않는다.

#### 1. Southport

단일 입구와 큰 굴곡을 가진 튜토리얼형 경로. B5·B3·C3 주변의 길을 따라 중첩 사거리와 병영 배치의 의미를 학습한다. 이 설명은 복원 지형에서 도출한 설계 해석이다.

[근거 이미지 L1](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L1.png) · 8개 기록 위치 · 1개 경로

관측 표식: harbour (scenery).

#### 2. The Outskirts

입구는 동쪽, 목표는 남쪽이다. 위·가운데·아래의 연속 굴곡에 7개 공터가 놓여 있어 초반 사거리 투자와 최후방 안전장치 사이의 선택이 생긴다.

[근거 이미지 L2](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L2.png) · 7개 기록 위치 · 1개 경로

#### 3. Pagras

북동·동쪽의 두 입구가 중앙에서 합류한 뒤 남쪽 굴곡을 공유한다. 합류 전에는 입구별 대응, 합류 후에는 범용 화력과 저지의 가치가 커지는 구조다.

[근거 이미지 L3](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L3.png) · 12개 기록 위치 · 2개 경로

#### 4. Twin Rivers

남쪽의 공통 입구에서 서·동쪽으로 크게 나뉘고 북쪽 목표 앞에서 재결합한다. 중앙보다 두 갈래의 경로 및 다리 주변에 투자를 나누는 구조다.

[근거 이미지 L4](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L4.png) · 15개 기록 위치 · 2개 경로

관측 표식: west_bridge (bridge), east_bridge (bridge).

#### 5. Silveroak Forest

남쪽 입구의 외곽·안쪽 두 경로와 동쪽 숲의 거미 접근로가 북쪽에서 합쳐진다. B8의 엘프 훈련소 및 캠페인 E7의 기존 궁수탑은 일반 빈 공터와 구분된다.

[근거 이미지 L5](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L5.png) · 14개 기록 위치 · 3개 경로

관측 표식: spider_forest_entry (cave), elf_hall (special_building).

- 동쪽 거미 출현로의 웨이브별 개방 시점은 지형 자료로 복원하지 않았다.
- E7의 기존 궁수탑 자동 배치는 v14에 문서화된 campaign 모드에 한정한다.

#### 6. The Citadel

서·동·남쪽 입구와 좌우 원형 구간, 중앙 통로가 결합한다. 15개 공터 및 북쪽 성문을 복원했으며, 남쪽 입구의 두 분기 선택은 정지 이미지 기반의 경로 해석이다.

[근거 이미지 L6](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L6.png) · 15개 기록 위치 · 4개 경로

관측 표식: castle_gate (goal_landmark), west_guard_squad (guard_squad), east_guard_squad (guard_squad), north_guard_squad (guard_squad).

- 4개 경로는 보이는 도로 연결성을 재구성한 것이다. 남쪽 경로의 정확한 원본 분기 선택과 적별 서브패스는 검증되지 않았다.
- v14 웨이브는 입구별 수량이 없는 집계 자료이다. west/southwest/southeast/east 키는 편의를 위한 구현 라벨로, 복원된 웨이브 라벨이 아니다.
- 7명의 성문 경비병은 위치 표식으로 기록한다. 병력 수치와 모드별 배치는 지형 파일에서 구현하지 않는다.

#### 7. Coldstep Mines

북쪽의 긴 왕복 경로에 동쪽·남서쪽 광산 출구가 중간 합류한다. 후방 광산에서 출현하는 적은 전방 사거리 일부를 생략하므로 최후방만의 대응 공간이 필요하다.

[근거 이미지 L7](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L7.png) · 11개 기록 위치 · 3개 경로

관측 표식: northwest_mine (mine), east_mine (mine), southwest_mine (mine), frozen_caveman (scenery).

- 북서 광산의 그림은 기록하되, 관측 라벨이 없는 별도 출현 경로는 추가하지 않았다.
- 광산 출현/이동 이벤트의 프레임과 원본 터널 연결 규칙은 미복원이다.

#### 8. Icewind Pass

북동쪽의 긴 굴곡 경로와 남동쪽의 짧은 경로가 서쪽 목표 앞에서 합류한다. 같은 적이라도 짧은 접근로로 올 때 공격 가능 시간이 줄어드는 지형이다.

[근거 이미지 L8](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L8.png) · 12개 기록 위치 · 2개 경로

관측 표식: north_mine (mine), east_mine (mine), frozen_sasquatch (special_building).

- 두 광산은 시각 표식으로만 기록했다. 터널을 통한 이동이나 추가 출현을 일반 웨이브 경로로 임의 추가하지 않았다.
- northeast/southeast는 지형을 설명하는 구현 라벨이며 v14 집계 웨이브에 입구별 수량이 복원된 것은 아니다.

#### 9. Stormcloud Temple

북쪽·남쪽의 굴곡 경로와 동쪽 광산 경로가 서쪽 사원 다리로 모인다. A1 태양광선 탑은 일반 타워 건설 지점과 분리하며, 최종 합류부에 투자가 집중되기 쉬운 구조다.

[근거 이미지 L9](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L9.png) · 16개 기록 위치 · 3개 경로

관측 표식: temple_bridge (bridge), east_mine (mine), sunray (special_building).

#### 10. The Wastes

서쪽의 여러 굴곡과 동쪽의 긴 우회로가 북쪽에서 결합한다. 중앙의 세로 공터열은 두 길을 함께 견제할 여지가 있으며 서쪽 묘지는 별도 사건 표식으로 보존한다.

[근거 이미지 L10](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L10.png) · 14개 기록 위치 · 2개 경로

관측 표식: graveyard (graveyard).

- 묘지 소환의 시각, 수량, 출현 위치 편차는 미복원이다.
- west/east는 지형용 구현 라벨이며 집계 웨이브의 입구별 배분이 확인된 것은 아니다.

#### 11. Forsaken Valley

중앙 화산을 둘러싼 큰 고리의 좌우 두 경로가 북쪽으로 합류한다. 18개 공터가 안쪽 고리를 따라 분산되어 양쪽 방어 비용을 나누게 된다.

[근거 이미지 L11](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L11.png) · 18개 기록 위치 · 2개 경로

관측 표식: volcano_spawn (volcano).

- 중앙 화산의 보조 연결로는 지형 표식으로 기록한다. 화산 출현 이벤트와 이벤트 적의 좌우 분배는 이 파일에서 원본 확정치로 제공하지 않는다.

#### 12. The Dark Tower

북서·북동의 성 뒤 입구에서 출발한 적이 중앙 아래쪽에서 합류하고 긴 마지막 굴곡을 공유한다. 세 마법진과 묘지는 별도 사건 위치로 기록한다.

[근거 이미지 L12](https://raw.githubusercontent.com/ScottLouvau/kingdomrush/a3c8218c19fab8e43596309de31eeeeb4a0bc8d6/source-data/maps/L12.png) · 13개 기록 위치 · 2개 경로

관측 표식: dark_tower (boss_landmark), graveyard (graveyard), portal_north (portal), portal_middle (portal), portal_south (portal).

- 입구는 화면 가장자리가 아니라 성 뒤에 가려진 도로의 가시 시작점으로 잡았다.
- 마법진과 묘지의 이벤트 시점, Vez’nan의 이동·봉인·전환 과정은 지형 복원과 별개이다.

## 특수 건물과 모드 처리

### Silveroak B8 — 실반 엘프 훈련소

`siteType: special`, `buildable: false`, `specialStructure: sylvan_elf_hall`로 보존한다. 일반 타워 4종을 건설할 수 있는 빈 공터로 처리하면 원작의 위치 의미가 바뀐다. 이 지형 복원은 훈련 비용·엘프 병력 능력치·모드별 해금 상태까지 복원하지 않으므로 화면에서 별도 시설로 표시하고 미지원 기능을 명확히 안내한다.

### Silveroak E7 — 캠페인의 기존 궁수탑

참고 화면의 HUD는 WAVE 0/15, 골드 700, 생명 20이다. 이 값은 v14 캠페인 설정과 일치한다. 같은 화면에서 E7 위치에 3레벨 궁수탑이 보인다. 따라서 `observedMode: campaign`, `preplacedTowerId: archer_3`, `preplacedModes: [campaign]`로 기록했다. Heroic/Iron의 초기 타워를 이 한 화면으로 일반화하지 않는다. 다른 모드에서는 추가 출처가 없는 한 일반 건설 가능 지점으로 취급한다.

### Stormcloud A1 — 태양광선 탑

`siteType: special`, `buildable: false`, `specialStructure: sunray_tower`로 보존한다. 위치와 시설의 존재만 복원했으며 재충전·피해·자원 비용은 이 파일에 임의 수치로 추가하지 않았다. 따라서 일반 타워 건설 대상에서 제외하고 기능 미구현 표식을 사용한다.

## 런타임 연결 계약

```javascript
// 경로와 공터는 같은 프로필에서 함께 적용한다.
const geometry = dataset.stages.find(item => item.stageId === stage.id);
stage.referenceGeometry = geometry;
stage.referencePaths = geometry.paths;
stage.referenceSites = geometry.sites;

// 원작 관측 입구 라벨이 존재하면 이 매핑을 우선한다.
const pathIndex = geometry.entryPathMap[group.entryLabel];
// 라벨이 없는 집계 수량은 별도의 명시적인 웹 배분 규칙을 사용한다.
```

- `stage.paths`와 `stage.sites`를 서로 다른 프로필에서 섞지 않는다.
- 맵 ID가 같아도 지형 프로필이 바뀌면 렌더러의 지형 캐시를 무효화한다.
- 사이트 라벨은 원본 분석용 `site.label`을 사용한다. 배열 순번을 원작 지점명으로 표시하지 않는다.
- `buildable: false` 시설은 타워 건설 버튼과 `+` 공터 아이콘을 표시하지 않는다.
- 기존 타워는 `preplacedModes`가 현재 모드와 일치할 때에만 선배치한다.
- 영웅이 허용되지 않은 모드에서 숨긴 영웅을 사망 영웅 표식으로 그리지 않는다.
- 실제 정지·판정 경로와 화면에서 그리는 경로는 동일한 `paths`를 사용한다.

## 아직 복원되지 않은 데이터

도착 간격, 웨이브 내 스폰 시각, 적별 lane/subpath, 각 분기 확률, 오프스크린 도로, 비행 전용 이동선, 병사 충돌 마스크, 병영 집결 영역의 원본 다각형은 확인되지 않았다. 지형 파일에 있는 `timingRestored: false`와 `flightRouteRestored: false`를 그대로 유지해야 한다.

광산·거미 숲·묘지·화산·마법진은 가시 위치를 기록했다. 이 표식에 사건 발생 규칙을 연결할 때에는 별도의 수량·시간·모드별 출처가 필요하다. 표식이 있다는 이유만으로 매 웨이브에 적을 출현시키지 않는다. Citadel의 남쪽 분기 선택은 시각적으로 가능한 연결을 구성한 것이므로 추가 플레이 영상 검증의 우선 대상이다.

## 데이터 검증

생성 시 다음 항목을 직접 검사했다.

- 모든 지점과 경로 좌표가 1000×620 월드 범위에 속한다.
- 12개 맵의 지점 수가 고정된 `positions.json` L1–L12 항목 수와 일치한다.
- 각 맵의 site ID가 유일하며 모든 입구 매핑 인덱스가 유효하다.
- 27개 경로가 두 개 이상의 유한한 좌표를 가지며 0길이 경로가 없다.
- 경로 길이는 실제 저장된 좌표에서 재계산했다.
- 각 건설물의 최단 도로 중심선 거리를 저장했다. 전체 최솟값은 약 42.90 월드 단위다. 이는 시각 추정 경로의 공터 침범을 점검하는 값이며 원작 수치가 아니다.
- 원문 스크린샷은 로컬 연구용으로 확인했으며 전달용 저장소에 포함하지 않았다.

## 전체 건설 지점 좌표

표의 좌표는 변환 후 월드 좌표이다. 원문 정수 픽셀 좌표는 JSON의 `sourcePixel`에서 확인할 수 있다.

### L1 · Southport

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| A9 | 396.35 | 195.19 | 공터 |
| A8 | 336.46 | 218.15 | 공터 |
| B5 | 406.77 | 320.91 | 공터 |
| C3 | 473.44 | 378.89 | 공터 |
| B3 | 403.13 | 380.04 | 공터 |
| E3 | 607.29 | 392.09 | 공터 |
| G1 | 719.27 | 454.67 | 공터 |
| D1 | 533.33 | 479.93 | 공터 |

### L2 · The Outskirts

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| C9 | 581.77 | 148.69 | 공터 |
| A9 | 452.60 | 161.89 | 공터 |
| C8 | 581.25 | 212.98 | 공터 |
| A6 | 401.56 | 279.57 | 공터 |
| C3 | 529.69 | 381.19 | 공터 |
| A3 | 457.81 | 397.83 | 공터 |
| C1 | 538.02 | 497.15 | 공터 |

### L3 · Pagras

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| C9 | 491.15 | 93.00 | 공터 |
| A9 | 420.83 | 111.94 | 공터 |
| E7 | 644.79 | 186.00 | 공터 |
| D7 | 560.42 | 187.72 | 공터 |
| B7 | 481.25 | 207.81 | 공터 |
| D5 | 604.69 | 289.33 | 공터 |
| B4 | 425.00 | 341.00 | 공터 |
| C3 | 503.65 | 376.02 | 공터 |
| D2 | 578.12 | 400.13 | 공터 |
| A1 | 363.02 | 454.67 | 공터 |
| F1 | 709.38 | 475.91 | 공터 |
| B1 | 434.38 | 484.52 | 공터 |

### L4 · Twin Rivers

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| D9 | 467.71 | 135.48 | 공터 |
| E9 | 542.71 | 138.35 | 공터 |
| C9 | 397.40 | 157.87 | 공터 |
| B8 | 355.21 | 202.07 | 공터 |
| G7 | 650.52 | 226.19 | 공터 |
| B6 | 348.96 | 261.78 | 공터 |
| G6 | 682.29 | 287.04 | 공터 |
| B5 | 370.31 | 307.13 | 공터 |
| G4 | 686.98 | 354.20 | 공터 |
| A4 | 256.77 | 362.81 | 공터 |
| G3 | 635.42 | 400.70 | 공터 |
| D3 | 477.08 | 401.85 | 공터 |
| E3 | 559.90 | 408.74 | 공터 |
| H1 | 720.83 | 490.26 | 공터 |
| F1 | 611.98 | 508.06 | 공터 |

### L5 · Silveroak Forest

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| E9 | 531.77 | 102.19 | 공터 |
| B8 | 331.25 | 149.26 | 실반 엘프 훈련소 |
| A7 | 267.71 | 187.15 | 공터 |
| G7 | 669.79 | 199.78 | 공터 |
| E7 | 527.60 | 217.00 | 캠페인 기존 궁수탑 |
| G6 | 702.08 | 238.81 | 공터 |
| C6 | 401.04 | 250.87 | 공터 |
| D4 | 502.08 | 338.13 | 공터 |
| F4 | 617.71 | 342.72 | 공터 |
| B3 | 347.40 | 358.80 | 공터 |
| D3 | 495.31 | 388.65 | 공터 |
| F3 | 608.33 | 396.11 | 공터 |
| F1 | 591.15 | 456.39 | 공터 |
| B1 | 390.62 | 482.22 | 공터 |

### L6 · The Citadel

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| G9 | 652.08 | 126.87 | 공터 |
| A9 | 336.46 | 128.02 | 공터 |
| C9 | 410.94 | 128.02 | 공터 |
| E9 | 581.25 | 129.74 | 공터 |
| B7 | 345.83 | 241.69 | 공터 |
| C7 | 419.79 | 241.69 | 공터 |
| E7 | 578.12 | 241.69 | 공터 |
| F7 | 651.56 | 241.69 | 공터 |
| D4 | 498.44 | 351.33 | 공터 |
| H4 | 715.10 | 351.33 | 공터 |
| C4 | 423.44 | 353.06 | 공터 |
| E4 | 570.83 | 353.06 | 공터 |
| A4 | 277.60 | 358.22 | 공터 |
| C1 | 410.94 | 478.20 | 공터 |
| E1 | 585.42 | 478.20 | 공터 |

### L7 · Coldstep Mines

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| A9 | 399.48 | 195.19 | 공터 |
| B9 | 476.04 | 195.76 | 공터 |
| C9 | 553.12 | 198.06 | 공터 |
| C5 | 524.48 | 323.20 | 공터 |
| B5 | 452.08 | 325.50 | 공터 |
| D5 | 599.48 | 325.50 | 공터 |
| A5 | 378.65 | 327.22 | 공터 |
| B1 | 461.46 | 446.06 | 공터 |
| C1 | 533.33 | 446.06 | 공터 |
| D1 | 604.69 | 449.50 | 공터 |
| E1 | 666.15 | 479.35 | 공터 |

### L8 · Icewind Pass

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| E9 | 533.33 | 215.28 | 공터 |
| F9 | 605.21 | 217.00 | 공터 |
| G9 | 677.60 | 218.15 | 공터 |
| D5 | 487.50 | 332.96 | 공터 |
| C5 | 416.15 | 334.69 | 공터 |
| E5 | 559.90 | 336.41 | 공터 |
| A3 | 273.96 | 400.70 | 공터 |
| G2 | 650.52 | 429.98 | 공터 |
| H2 | 719.27 | 429.98 | 공터 |
| D2 | 494.79 | 450.65 | 공터 |
| C2 | 419.79 | 451.80 | 공터 |
| D1 | 517.19 | 494.28 | 공터 |

### L9 · Stormcloud Temple

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| D9 | 470.31 | 117.69 | 공터 |
| E9 | 545.31 | 120.56 | 공터 |
| F9 | 618.23 | 124.00 | 공터 |
| B7 | 354.17 | 212.98 | 공터 |
| C7 | 419.27 | 235.94 | 공터 |
| D7 | 492.19 | 235.94 | 공터 |
| E7 | 565.10 | 237.09 | 공터 |
| G5 | 695.83 | 315.17 | 공터 |
| D4 | 486.46 | 358.80 | 공터 |
| E4 | 558.85 | 358.80 | 공터 |
| F4 | 632.29 | 358.80 | 공터 |
| G4 | 706.25 | 373.15 | 공터 |
| F1 | 614.06 | 477.63 | 공터 |
| E1 | 534.90 | 479.35 | 공터 |
| C1 | 457.29 | 480.50 | 공터 |
| A1 | 269.79 | 492.56 | 태양광선 탑 |

### L10 · The Wastes

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| E8 | 569.27 | 178.54 | 공터 |
| F8 | 640.10 | 178.54 | 공터 |
| C7 | 421.88 | 190.02 | 공터 |
| F6 | 603.65 | 235.37 | 공터 |
| E5 | 561.98 | 279.57 | 공터 |
| B4 | 381.77 | 313.44 | 공터 |
| C4 | 451.56 | 313.44 | 공터 |
| G3 | 710.42 | 326.65 | 공터 |
| E3 | 552.60 | 341.00 | 공터 |
| D2 | 491.15 | 370.28 | 공터 |
| E1 | 551.04 | 412.19 | 공터 |
| H1 | 717.19 | 425.96 | 공터 |
| A1 | 279.17 | 427.69 | 공터 |
| B1 | 351.04 | 427.69 | 공터 |

### L11 · Forsaken Valley

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| B9 | 410.42 | 106.78 | 공터 |
| E9 | 584.90 | 106.78 | 공터 |
| D7 | 536.46 | 213.56 | 공터 |
| C7 | 456.77 | 214.13 | 공터 |
| F7 | 608.33 | 219.87 | 공터 |
| B7 | 386.98 | 222.17 | 공터 |
| F6 | 668.75 | 249.15 | 공터 |
| A6 | 328.12 | 249.72 | 공터 |
| A5 | 313.54 | 310.57 | 공터 |
| G5 | 686.98 | 311.15 | 공터 |
| A3 | 343.75 | 364.54 | 공터 |
| F3 | 652.60 | 369.13 | 공터 |
| B3 | 408.85 | 388.07 | 공터 |
| E3 | 581.77 | 389.80 | 공터 |
| D1 | 531.77 | 464.43 | 공터 |
| C1 | 462.50 | 466.15 | 공터 |
| A1 | 296.35 | 478.20 | 공터 |
| G1 | 689.58 | 483.94 | 공터 |

### L12 · The Dark Tower

| 지점 | x | y | 유형 |
|---|---:|---:|---|
| A9 | 331.25 | 181.98 | 공터 |
| F9 | 673.96 | 189.44 | 공터 |
| F8 | 682.29 | 245.13 | 공터 |
| F6 | 671.88 | 299.09 | 공터 |
| A6 | 367.71 | 308.85 | 공터 |
| B6 | 444.27 | 308.85 | 공터 |
| C6 | 516.67 | 308.85 | 공터 |
| B2 | 412.50 | 438.02 | 공터 |
| C2 | 484.90 | 438.02 | 공터 |
| D2 | 555.21 | 438.02 | 공터 |
| E2 | 626.56 | 438.02 | 공터 |
| F2 | 693.75 | 440.31 | 공터 |
| G1 | 726.56 | 493.13 | 공터 |

## 기록 좌표의 사용 허가 고지

숫자 위치 자료를 가져온 저장소의 저작권·MIT 허가 고지를 아래에 보존한다. 이 고지는 Ironhide 원작 그래픽의 재배포 허가를 주장하는 것이 아니다. 원작 스크린샷과 그래픽은 본 결과물에 포함하지 않았다.

```text
MIT License

Copyright (c) 2022 Scott Louvau

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
