# 넥서스 전선 — v7 구현 계약

이 문서는 현재 저장소의 독자적인 JavaScript·Canvas 5대5 MOBA 구현을 설명합니다. 원작 게임의 공식 규칙이나 내부 구현을 설명하는 문서가 아닙니다. 플레이 방법은 [GAMEPLAY.md](GAMEPLAY.md), 실행·배포 방법은 [README.md](README.md), 검증 결과는 [QA.md](QA.md)를 참고합니다.

## 1. 모듈 경계와 로드 순서

배포 루트는 `dist/`이며 외부 라이브러리, CDN, 원작 자산, 서버 접속 없이 동작합니다. 브라우저 스크립트 순서는 **navigation → game → renderer → history → checkpoint → coach → controls → app**입니다.

| 파일 | 책임과 내보내기 |
|---|---|
| `dist/navigation.js` | 고정 벽, 통행 판정, A* 경로, 충돌·슬라이드. `NexusNavigation={WALLS,Navigation}`. |
| `dist/game.js` | 규칙·AI·시간·상태의 소유자. `NexusGame={Game,MAP,MAP_SCALES,normalizeMapScale,createMap,HEROES,ITEMS}`. |
| `dist/renderer.js` | Canvas 월드·카메라·시야·미니맵·전투 표식. `NexusRenderer={Renderer}`. 게임 상태를 읽기만 합니다. |
| `dist/history.js` | 완료 경기 기록 생성·정규화·보관. `NexusHistory={KEY,LIMIT,read,makeRecord,append}`. |
| `dist/checkpoint.js` | 진행 중 경기 1개의 브라우저 저장·검증·복원. `NexusCheckpoint={KEY,SCHEMA,MAX_BYTES,SPEEDS,normalizeSpeed,read,write,remove,restore}`. |
| `dist/coach.js` | 실제 경기 관측으로 만드는 여섯 진행 목표·상황 안내·아이템 추천. `NexusCoach={starter,recommend,read,updateJourney}`. |
| `dist/controls.js` | 포인터 소유권·드래그 임계값·범위 조준·취소를 계산하는 순수 입력 상태기계. `NexusControls={AimGesture}`. |
| `dist/app.js` | DOM, 입력, 맵·속도 선택, 고정 시간 루프, 모달·상점·결과·기록 화면, 음향. 진단용 `NexusFront={version,snapshot,settings}`만 공개합니다. |
| `dist/index.html`, `dist/style.css` | 접근 가능한 화면 구조와 반응형 표현. |
| `scripts/build-offline.cjs` | 동일 소스를 단일 오프라인 HTML로 묶는 배포 빌더. |
| `tests/*.test.cjs` | 엔진·이동·성장·거래·전투·기록·체크포인트·진행 안내 회귀 검사. |

Navigation, Game, History, Checkpoint, Coach, Controls는 DOM 없이 Node에서 실행되며 CommonJS `module.exports`도 제공합니다. Game은 Node에서 같은 폴더의 `navigation.js`를 불러옵니다. Renderer는 CommonJS 내보내기도 제공하지만 실제 렌더링에는 Canvas 문맥이 필요합니다. 새 UI는 명령 API를 호출하고, Renderer는 게임 규칙이나 피해를 변경하지 않습니다.

## 2. 좌표·시간·기본 데이터

- `MAP`은 기본 `1600×1600` 배치이고 `Game`마다 `mapScale`과 독립된 `map`을 가집니다. 팀 `0`은 청록, 팀 `1`은 산호, 팀 `2`는 중립입니다. 기지는 기본 `(165,1435)`, `(1435,165)`에 해당 경기의 배율을 곱한 좌표입니다.
- 좌표·반경·사거리는 월드 단위, 시간·쿨다운·`expiresAt`·`at`은 시뮬레이션 초입니다. History의 `at`과 Checkpoint의 `savedAt`은 현실 시각의 Unix 밀리초입니다.
- `MAP.lanes`는 `top/mid/bot`의 `[x,y]` 경유점 배열입니다. `MAP.brushes`는 `{x,y,r}[]`, `MAP.obstacles`는 12개 `WALLS`, `MAP.camps`는 `{id,name,x,y,kind}[]`입니다. 현재 경기에서는 이 기본 데이터를 확장한 `game.map.lanes/brushes/obstacles/camps/bases`를 사용합니다.
- `HEROES`는 `mage/warrior/ranger`의 기본 능력치와 QWER 메타데이터 배열입니다. 각 스킬은 `name,description,icon,cooldown,cost,range,radius,target`을 제공합니다. 실제 학습 상태와 쿨다운은 `getSkillInfo()`로 읽습니다.
- `ITEMS`는 `id,name,description,cost,icon,color,stats,components?` 배열입니다. `cost`는 완성 아이템의 총가격이며 현재 결제액은 `getPurchaseInfo()`로 읽습니다. `stats.attackSpeed=0.4`는 기본 공격 속도에 대한 가산 보너스 40%입니다.

```js
const game = new NexusGame.Game({
  hero: 'mage', difficulty: 'normal', mapScale: 1.5, seed: 123
});
game.prepareItem('focus'); // 선택 사항: 600G에서 500G를 사용해 출전 장비 구매
game.start();
game.step(1 / 60);
```

난이도 엔진 값은 `easy/normal/hard`이며 현재 선택 UI는 훈련·표준을 제공합니다. 같은 맵·시드와 같은 입력·스텝으로 재현 검증합니다. 재시작은 새 `Game` 인스턴스를 만들어 처리합니다.

### 경기별 맵과 배율

`MAP_SCALES=Object.freeze([1,1.5,2])`이며 `normalizeMapScale(value)`는 지원하는 숫자 또는 숫자 문자열을 숫자로 반환하고 그 외는 1로 처리합니다. `createMap(value)`는 기본 `MAP`을 변경하지 않고 새 `scale,width,height,bases,lanes,brushes,obstacles,camps`를 만듭니다. 이 입력 정규화와 별개로 **저장 복원은 숫자형 배율만 엄격히 검증**합니다.

| `mapScale` | `map.width × map.height` | 면적 배율 | Navigation 셀 간격 | 안개 격자 |
|---|---|---:|---:|---|
| 1 | 1600 × 1600 | 1 | 40 | 80 × 80 |
| 1.5 | 2400 × 2400 | 2.25 | 60 | 120 × 120 |
| 2 | 3200 × 3200 | 4 | 80 | 160 × 160 |

기지·공격로·캠프·벽·수풀의 좌표와 벽·수풀 반경을 확장하고 구조물·영웅 초기 위치도 해당 맵에 배치합니다. 영웅·미니언·구조물 몸체 크기, 능력치, 이동 속도와 전투·시야 사거리, 게임 시간 규칙은 배율에 곱하지 않습니다. 플레이어 초기 위치는 `(560×mapScale,1040×mapScale)`입니다. 로비에서 크기를 바꾸면 시작 전 Game을 새로 만들며 진행 중 경기의 크기 변경은 차단합니다. `MAP`은 기존 기본 배치 API로 유지하되 현재 경기의 위치·경계는 `game.map`을 읽어야 합니다.

### 공개 상태

| 대상 | 주요 필드 |
|---|---|
| Game | `time,started,paused,over,winner,endReason,difficulty,mapScale,map,paths,waveNumber,nextWaveAt,teamKills,teamBuffs,order`와 `player,entities,projectiles,effects,floaters,events`. |
| 영웅 | `id,type:'hero',hero,team,name,lane,role,x,y,r,hp,maxHp,mana,maxMana,level,xp,nextXp,gold,damage,abilityPower,armor,range,speed,attackSpeed,attackPeriod,attackCooldown,attackWindup,shield,alive,respawnIn,recallLeft,kills,deaths,assists,cs,damageDealt,inventory,cd,autoAttack,skillRanks,skillPoints,navPath`. |
| 일반 개체 | `id,type,team,x,y,r,hp,maxHp,alive,name,lane,kind`와 종류별 필드. `type`은 `hero/minion/tower/inhibitor/nexus/monster/ward`. |
| 포탑 | `structureTier:outer/inner/base`, `targetId,aggroTargetId,rampStacks`. |
| 미니언·몬스터 | 미니언 `kind:melee/ranged/siege/super`; 몬스터 `kind:camp/dragon/boss`, `homeX,homeY,respawnIn`. |
| 시각 효과 | 투사체 `x,y,vx,vy,team,color,r,kind`; 효과 `kind,x,y,x2?,y2?,r,color,life,maxLife`; 숫자 `x,y,text,color,life`. |

`inventory`는 아이템 ID 배열, `cd`는 `q/w/e/r/d/f/ward`의 남은 초입니다. `events`는 `{id,text,tone,at}`이며 `tone=info/good/bad`, 최대 20개, 최신 항목이 뒤에 옵니다. 파괴된 구조물과 부활을 기다리는 영웅·몬스터는 `alive=false`로 배열에 남습니다. 배열은 엔진이 교체할 수 있으므로 오래된 배열 참조를 영구 보관하지 않습니다.

## 3. Navigation 계약

```js
const nav = new NexusNavigation.Navigation({
  width: game.map.width, height: game.map.height,
  cellSize: 40 * game.mapScale, obstacles: game.map.obstacles
});
```

| 메서드 | 반환·의미 |
|---|---|
| `isWalkable(x,y,r=19)` | 해당 반경의 개체가 설 수 있으면 `true`. |
| `nearestWalkable(x,y,r=19)` | 벽·경계 내부 입력을 안전한 `{x,y}`로 보정. 완전히 막힌 사용자 지정 맵에는 유한 좌표만 보장될 수 있으므로 통행 여부를 재확인합니다. |
| `segmentClear(ax,ay,bx,by,r=19)` | 시작·끝과 연결 선분 전체의 통행 가능 여부. |
| `findPath(ax,ay,bx,by,r=19)` | 안전 경유점 배열. 통상 시작점을 제외하고 목표를 포함하며, 시작점을 보정했다면 보정 시작점이 포함될 수 있습니다. 경로가 없으면 `[]`. |
| `resolveMove(ax,ay,bx,by,r=19)` | 이동 선분의 충돌과 접선 슬라이드를 반영한 `{x,y}`. |

`40×mapScale` 단위 격자 A*, 대각선 모서리 통과 방지, 경로 단순화와 반경별 캐시를 사용합니다. 폭과 셀을 함께 확대하여 기본 탐색 격자 수가 맵 면적에 따라 증가하지 않게 합니다. 공개 `game.navigation`과 `game.map.obstacles`는 현재 경기의 지형 벽을 나타냅니다. Game은 살아 있는 모든 구조물을 벽과 결합한 별도 이동 경로를 같은 셀 간격으로 캐시하고, 구조물 파괴 시 제약을 갱신합니다. 직접 입력의 충돌·슬라이드와 클릭·AI 이동의 A*가 같은 구조물 제약을 사용하므로 겹친 기지 포탑·억제기에 서로 밀려 정체하지 않습니다. 공격 접근점은 구조물 중심 대신 공격 거리 앞에 잡고, 막힌 짧은 경로는 매 프레임 재계산하지 않습니다.

`hero.navPath`는 이미 지난 점을 제거한 남은 경유점 배열이며 직선 이동에서는 비어 있을 수 있습니다. 돌진은 지형 벽에 막히고 점멸은 안전한 최종 지점으로 이동하며, 최종 위치도 구조물 내부가 되지 않게 보정합니다.

미니언 소환점이 구조물 사이의 닫힌 공간에 있으면 같은 라인의 전방 출구와 연결되는 안전한 위치를 40단위 간격으로 최대 12회 탐색합니다. 두 팀은 반대 진행 방향에 같은 조건을 적용합니다. 비전투 미니언의 짧은 전방 목표도 구조물 안이나 근처에 놓이면 같은 라인을 따라 최대 5회 더 앞의 지점을 확인합니다. 구조물 공격의 선행 파괴 조건은 `isProtected()`가 계속 판정합니다.

`nearestWalkable()`은 단일 충돌원의 방사 투영점이 모든 장애물·경계 조건을 만족할 때 즉시 반환합니다. 원이 겹치거나 투영점이 막힌 경우에는 기존 전체 탐색을 사용합니다. 안전 판정과 연결 가능한 경로 판정은 별개이므로 소환점 검사에서 두 조건을 함께 확인합니다.

## 4. Game 명령 API

실패 가능한 명령은 기본적으로 `{ok:false,reason}`을 반환합니다. `reason`은 표시용 문장이므로 프로그램 분기에 문자열 자체를 사용하지 않습니다. 반환값이 명시된 조회·설정 메서드는 아래 계약을 따릅니다.

### 수명주기·이동·전투

| 메서드 | 동작 |
|---|---|
| `prepareItem(itemId)` | 경기 시작 전 출전 장비 구매. 일반 구매와 같은 가격·조합·6슬롯·능력치 계산을 사용하며, 시작 전 기지 거리만 면제합니다. 시작 뒤에는 실패합니다. |
| `start()` | 최초 웨이브를 생성하고 `this` 반환. 중복 시작으로 경기를 초기화하지 않습니다. |
| `exportState()` | 진행 중 경기의 분리된 JSON 상태 반환. 시작 전·종료 경기는 `Error`. 상세 계약은 8절 참고. |
| `Game.fromState(state,options?)` | 유효한 체크포인트로 새 Game을 복원하는 정적 메서드. 기본 일시정지, 키·조이스틱 입력 해제. 실패하면 `Error`. |
| `step(dt)` | 시작 전·일시정지·종료 상태 또는 유효하지 않은 `dt`에서는 진행하지 않음. 호출당 최대 30초, 내부 스텝 최대 1/30초. 앱은 1/60초로 호출합니다. |
| `setInputVector(x,y)` | 벡터 길이를 최대 1로 제한. 0 입력은 클릭 목적지를 유지하며, 0이 아닌 입력은 기존 이동·추적·귀환·미발사 기본 공격을 취소합니다. |
| `commandMove(x,y)` | 안전한 목적지로 이동하고 명시적 공격·공격 이동·귀환·미발사 기본 공격을 취소합니다. 도착 전 자동 공격을 시작하지 않습니다. |
| `commandAttackMove(x,y)` | 현재 미발사 공격을 취소하고 새 목적지로 설정. 보이는 적 영웅·미니언·공격 가능한 구조물과 교전하며 이동하고, 사거리 안에서는 준비를 위해 멈춥니다. 중립 캠프 자동 포착 제외. 적 처치·이탈 뒤 목적지로 재개하며 `autoAttack=false`에도 유효합니다. |
| `attackTarget(id)` | 진행 중·미정지 상태에서 보이는 유효 적을 추적하고 사거리 안에서 공격. 잠긴 구조물은 거절합니다. 적 영웅은 고정 조건을 만족하면 함께 고정하고 다른 유형의 적을 직접 지정하면 기존 고정을 해제합니다. |
| `stop()` | 입력 벡터·이동·추적·공격 이동·타깃 고정·귀환·경로·미발사 기본 공격 취소. 자동 공격 설정은 보존하므로 다음 스텝에 새 자동 공격을 시작할 수 있습니다. |
| `setAutoAttack(bool)` | 플레이어의 사거리 내 자동 공격 설정. 끌 때 명시적 공격·공격 이동이 없다면 현재 준비도 취소하며, 해당 명령으로 시작한 공격은 유지합니다. |
| `cast(slot,x?,y?)` | QWER, `d` 점멸, `f` 회복, `ward`. 학습·마나·쿨다운·상태 검사 후 적용. 성공한 QWER/D만 미발사 기본 공격을 취소하고 F/와드는 유지합니다. 실패한 시전은 준비를 취소하지 않습니다. 좌표를 주면 해당 지점을 조준하고, 생략하면 스킬 사거리 안의 고정 대상·명시적 공격 대상·가까운 적·전방 순으로 조준합니다. |
| `getAttackState(hero=player)` | 읽기 전용 기본 공격 단계 조회. 새 `{phase,progress,remaining,duration,targetId}` 반환. 상세 의미는 5절 참고. |
| `setFocusTarget(id\|null)` | 보이는 적 영웅의 우선 조준을 설정하며 `{ok,targetId?,reason?}` 반환. `null`은 고정 해제. 새 영웅을 선택하면 다른 영웅의 기존 직접 추적만 취소하고 이동·공격 이동 명령은 유지합니다. |
| `getFocusTarget()` | 유효한 고정 영웅의 현재 엔진 객체 또는 `null`. 숨음·사망·거리 이탈 시 고정을 정리합니다. 객체를 수정하는 용도로 사용하지 않습니다. |
| `cycleFocusTarget()` | 고정 가능한 적 영웅을 현재 거리·ID 순으로 순환하고 `{ok,targetId?,reason?}` 반환. 후보가 없으면 실패 이유를 반환합니다. |
| `recall()` | 4초 귀환 시작/취소. 이동·피해·다른 스킬 사용으로 취소. 기지에서 회복과 거래가 가능합니다. |
| `surrender()` | 시작된 미종료 경기에서만 승인하며 일시정지 중에도 허용. `over=true,winner=1,endReason='surrender'`; 이동·추적·팀 지시·예고를 정리. 중복 호출 거절. |

초기 `endReason=null`; 넥서스 파괴 종료는 `'nexus'`입니다. `winner`는 승리 팀 ID입니다. 경기 종료 후 시간은 더 진행하지 않습니다.

### 타깃 고정과 수동 조준

고정 대상은 살아 있는 적 영웅이며, 플레이어가 살아 있고 경기 진행 중이고 중심 간 거리가 900 이하이며 팀 시야로 보여야 합니다. 새 고정·순환 명령은 일시정지 중에 거절합니다. 고정은 방향키·조이스틱·클릭 이동과 별도이고, 고정만으로 추적 이동이 생기지 않습니다. 기본 공격은 자동 공격이 켜져 있고 실제 공격 사거리 안에 있을 때만 고정 대상을 우선합니다. 다른 영웅으로 고정을 바꾸면 앞서 클릭한 영웅의 직접 추적과 그 추적 경로를 해제하고, 다른 영웅을 향해 준비 중이던 기본 공격도 취소합니다. 동일한 영웅을 다시 고정할 때는 의도한 직접 추적과 발사 준비를 유지합니다. 방향 입력·클릭 이동·공격 이동 목적지와 경로는 고정 변경으로 지우지 않습니다. 공격 이동이 얻은 현재 교전 대상은 해당 명령의 판단을 따르며, 고정 해제 자체는 기존 공격 명령이나 준비를 취소하지 않습니다.

좌표가 있는 스킬 시전은 고정보다 우선합니다. 자동 조준 때 고정 대상이 해당 스킬의 중심 기준 사거리 밖이면 현재 공격 대상이나 가까운 유효 대상으로 대체하지만, 900 이내의 고정 자체는 유지합니다. 방향 투사체는 자동 조준해도 평소의 충돌·관통 규칙을 사용하므로 고정 대상에게 반드시 적중하는 유도탄으로 바뀌지 않습니다.

정지·귀환 시작·영웅 이외의 적 직접 공격은 고정을 해제합니다. 대상이나 플레이어 사망, 대상의 수풀 은폐·팀 시야 상실·900 거리 이탈도 해제 조건입니다. 조회·시뮬레이션 스텝·내보내기·복원 때 유효성을 확인하므로 저장이나 표시에서 숨은 대상의 좌표를 계속 제공하지 않습니다.

### 스킬 성장

- 초기 `skillRanks={q:1,w:0,e:0,r:0}`, `skillPoints=0`; 레벨마다 포인트 1개, 최대 레벨 18입니다.
- QWE는 최대 5랭크, 다음 랭크 `n`에 레벨 `2n-1` 이상 필요. R은 최대 3랭크, 각각 레벨 6·11·16이 필요합니다.
- 추가 랭크당 피해 배율은 `1+0.12×(rank-1)`, 쿨다운 배율은 `1-0.04×(rank-1)`입니다. 자기 강화 스킬도 쿨다운 혜택을 받습니다. 기본 메타데이터를 직접 고쳐 랭크를 표현하지 않습니다.
- `getSkillInfo(slot,hero=player)` → 메타데이터에 `slot,rank,maxRank,nextUnlock,learned,damageMultiplier`와 실제 `cooldown,cost`를 더한 객체. 없는 슬롯은 `null`, 최대 랭크의 `nextUnlock`은 `null`.
- `canUpgradeSkill(slot)` → `boolean`. `upgradeSkill(slot)` → `{ok,rank?,reason?}`. 실패 시 포인트를 소모하지 않습니다.
- `autoAllocateSkills()` → `{ok,allocated,remaining}`. 현재 남은 포인트를 한 번 추천 배분하며, 미래 포인트의 자동 배분 설정이 아닙니다. AI는 레벨업마다 추천 배분합니다.

### 상점·조합

- 같은 아이템 중복 보유 가능, 최대 6슬롯. 살아 있으면 자기 기지 반경 180 이내, 또는 사망 중 거래할 수 있습니다.
- `edge.components=['blade']`, `crown.components=['focus']`. 소유 재료는 정확히 한 개씩 소모하고 총가격에서 해당 재료 가격을 차감합니다. 미보유 재료는 총가격에 포함해 바로 완성품을 살 수 있습니다.
- `crown`은 재료의 최대 마나 100을 유지합니다. 6슬롯이 차도 재료 소모로 공간이 나면 조합할 수 있습니다.
- `getPurchaseInfo(itemId)` → `{cost,ownedComponents,missingComponents,consumedIndices,canBuy,reason?}`. 두 component 배열은 아이템 ID 배열, `consumedIndices`는 현재 인벤토리 인덱스입니다.
- `buy(itemId)` → `{ok,itemId?,cost?,consumedIndices?,reason?}`. 모든 조건을 검사한 뒤 골드·재료·결과 아이템·능력치를 함께 변경합니다. 실패는 거래 상태를 바꾸지 않습니다.
- `sell(index)` → `{ok,itemId?,refund?,reason?}`. 총가격의 70%를 내림 정수로 환급하고 능력치를 다시 계산합니다. 현재 HP·마나는 감소한 최대치를 넘지 않게 제한합니다.
- AI는 슬롯 수와 별개인 구매 계획 인덱스를 진행시켜 조합 후 이전 단계로 되돌아가지 않습니다.

### 팀 지시·목표 협동

`setTeamOrder(type,x?,y?)`는 `rally/push/defend/dragon/boss/clear`를 받습니다. `order`는 `null` 또는 `{type,x,y,expiresAt,objectiveId?}`이며 지시는 25초간 유효합니다. 집결은 지정점, 압박은 중앙 전선, 방어는 아군 기지에 반응합니다.

`dragon/boss`는 해당 목표가 살아 있을 때만 승인합니다. 주문 좌표는 알려진 캠프 위치로 고정하며, 아군은 그 위치로 이동해 시야를 확보한 뒤 공격합니다. 목표 처치·소멸 시 지시를 해제합니다. 낮은 체력의 후퇴는 지시보다 우선합니다.

자동 정글 AI는 드래곤 레벨 4·보스 레벨 9, 체력 55% 이상과 지원 가능한 건강한 아군을 확인합니다. 실제 목표 공격에는 반경 550 안에서 공략에 합류한 건강한 아군 2명 이상, 자신의 체력 48% 이상, 보이는 적 수 이상의 아군 수가 필요합니다. 지원 부족 시 대기하며 단순히 지나가는 라인 AI를 공략 인원으로 세지 않습니다. 플레이어의 목표 지시는 자동 계획의 레벨 제한을 적용하지 않지만 체력·협동 조건은 유지합니다.

### AI 교전과 포탑 안전 거리

AI는 적의 좌표에서 `영웅 사거리 + 대상 반경 - 10`만큼 물러난 기본 공격 위치를 기준으로 진입 위험을 평가합니다. 이미 그 사거리 안이면 현재 위치를 사용합니다. 이 위치가 살아 있고 공격 가능한 적 포탑의 `포탑 사거리 + 영웅 반경 + 16` 안이며, 포탑이 자신을 집중 공격 중이거나 실제 사거리 안에 살아 있는 아군 미니언이 없으면 공격 접근을 포기합니다. 따라서 원거리 영웅은 적이 포탑 근처에 있더라도 포탑 바깥에서 안전하게 공격할 수 있습니다.

포탑 엄호는 미니언의 중심이 `포탑 사거리 + 미니언 반경` 안에 있어야 성립합니다. 밖에서 다가오는 웨이브나 죽은 미니언은 엄호로 세지 않습니다. 억제기·넥서스의 공성 동행 판단은 기존 415 범위의 살아 있는 아군 미니언을 사용합니다. 일반 타깃 검색과 팀 지시의 타깃 검색도 같은 포탑 진입 검사를 거칩니다.

현재 위치가 `포탑 사거리 + 영웅 반경 + 24` 안이고 엄호가 사라지거나 포탑이 자신을 겨냥하면 현재 공격을 해제하고 포탑 바깥 `사거리 + 영웅 반경 + 90`의 지점으로 이동합니다. 미니언이 남아 있어도 자신이 포탑의 현재 공격·유효한 보복 공격 대상이면 후퇴합니다. 엄호 없는 포탑 안의 집결 목적지는 안전한 바깥 경계로 조정합니다. 이 검사는 기본 이동과 기존 지형·구조물 경로 탐색을 사용하며, 순간이동으로 탈출시키지 않습니다.

AI는 매 프레임 공격 대상을 다시 시야 검사합니다. 적 영웅이 숨으면 대상과 추적 경로를 지우며 새 숨은 좌표로 따라가지 않습니다. 중립 몬스터의 고정 소환 위치는 알려진 지도 정보이므로 안 보일 때 그 위치까지 접근할 수 있지만 숨은 현재 위치를 공격에 사용하지 않습니다. 원거리 AI의 경계 후퇴·방향 입력으로 지도 밖 목적지가 계산되어도 경로 목표를 각 축의 `28~현재 맵 크기−28`로 제한해 저장 가능한 좌표를 유지합니다.

AI도 영웅 기본 공격의 준비 시간을 거칩니다. 준비 중에는 일반 재판단·거리 벌리기·자동 스킬 사용을 중지해 같은 공격을 매 프레임 취소하지 않게 합니다. 예고 범위 회피, 포탑의 현재 위험, 후퇴 상태·체력 24% 미만, 기절은 이 준비보다 우선합니다. 이동을 실행하는 `_move()`와 돌진의 `_dash()`는 준비를 취소하며, 위 위험 조건에서는 공격을 유지하려고 제자리에 머물지 않습니다. 발사와 대기 이후에는 기존 AI 판단으로 돌아갑니다.

## 5. 전투 조회·정보 공개

### 기본 공격 단계와 취소

```js
game.getAttackState();
// {phase:'ready'|'windup'|'recovery'|'disabled',
//  progress:0..1, remaining:0, duration:0, targetId:null}
```

이 조회는 전달한 영웅의 상태를 바꾸지 않고 매번 새 객체를 반환합니다. `remaining`·`duration`은 초, `progress`는 **현재 단계의 완료 비율**입니다. 일시정지는 단계 자체를 `disabled`로 바꾸지 않고 남은 시간을 동결합니다.

| 단계 | 의미·값 |
|---|---|
| `ready` | 행동 가능한 영웅의 기본 공격 대기시간이 0. `progress=1`, 시간 값은 0. |
| `windup` | `attackWindup`의 남은 준비 시간과 전체 준비 시간. `progress=1−remaining/duration`, 대상은 준비에 묶인 `targetId`. |
| `recovery` | 실제 발사 이후. `remaining=attackCooldown`, `duration=attackPeriod−clamp(attackPeriod×0.25,0.10,0.32)`, 완료 비율은 0~1로 제한. |
| `disabled` | 시작 전·종료 후·사망·기절·귀환 중 또는 영웅이 아닌 값. `progress=0`, 시간 값은 0, 대상은 `null`. |

`ready/recovery`의 대상 ID는 현재 영웅이 선택한 살아 있고 해당 팀에 보이는 적일 때만 제공합니다. `windup`의 대상은 직전 시뮬레이션 상태이며, 다음 `_advanceAttack()`에서 다시 유효성을 검사합니다. 조회를 표시하는 쪽은 공격자와 대상의 **플레이어 팀 시야**를 별도로 적용해야 합니다. `getSnapshot()`과 이 API는 브라우저 내부 진단·표시용이며 온라인 관전자에게 보낼 정보 필터가 아닙니다.

영웅 `_attack()`은 `period=1/_attackSpeed(hero)`와 `duration=clamp(period×0.25,0.10,0.32)`를 계산하여 `attackPeriod=period`, `attackCooldown=period`, `attackWindup={targetId,remaining:duration,duration,period}`를 설정합니다. `attackCooldown`은 준비 중부터 줄어드므로 준비를 시작한 시점이 전체 공격 주기의 기준입니다. 공격 속도의 이후 변경은 그 한 주기를 소급 변경하지 않습니다. 준비가 남아 있으면 새 기본 공격을 중복 시작하지 않습니다.

`_advanceAttack()`은 살아 있는 적, 보호되지 않은 구조물, 현재 시야, `distance≤source.range+target.r+8` 조건을 검사하고 남은 준비 시간을 줄입니다. 0에 도달하는 스텝에서 `attackWindup=null`로 먼저 바꾼 뒤 `_releaseAttack()`을 한 번 호출합니다. 실제 피해·투사체 생성과 `nextAttackBonus` 소비, 기본 공격자의 1.5초 노출은 이 발사 단계에서만 발생합니다. 사거리 145 초과는 유도 투사체, 그 이하는 즉시 근접 피해입니다. 미니언·포탑·몬스터는 `_attack()`에서 같은 `_releaseAttack()`으로 즉시 진행하며 영웅 준비 상태를 만들지 않습니다.

`_cancelAttack()`은 준비가 존재할 때만 해당 객체를 버리고 `attackCooldown=0`, `attackProgress=1`로 만듭니다. 피해·강화 추가 피해는 소비하지 않습니다. 준비가 없는 재공격 대기에는 영향을 주지 않습니다. 새 이동·공격 이동·정지·귀환, 다른 직접 공격 대상, 다른 영웅으로의 고정 변경, 실제 이동·돌진, 기절·사망·대상 상실과 성공한 QWER/D가 취소 경로입니다. QWER는 자기 보호막·강화 스킬도 포함합니다. F·와드는 준비를 유지하고, 실패한 스킬은 모든 조건 검사 뒤에 놓인 취소 지점에 도달하지 않습니다. 이미 발사된 투사체는 이 취소와 별개이며 이동하거나 발사자가 사망해도 기존 수명·대상 규칙으로 처리합니다. 키라 E의 명시적인 공격 대기시간 초기화는 예외로 유지합니다.

`_updatePlayer()`는 방향 입력과 일반 클릭 이동을 우선 처리하고 이동 중 새 자동 공격을 시작하지 않습니다. 직접 공격과 공격 이동은 사거리까지 접근해 준비를 시작하고 그동안 발을 고정합니다. 발사 후에는 이동하면서 남은 대기를 보낼 수 있으며, 다음 공격에는 다시 준비 시간이 필요합니다. S는 자동 공격 토글을 보존하므로 계속 공격하지 않으려면 별도로 Space로 자동 공격을 꺼야 합니다.

### 광역 예고

```js
game.getHazards(team = 0); // 반환 객체는 복사본
// [{id,sourceId,x,y,radius,startsAt,at,label,color,progress}]
```

드래곤·보스는 전투 시작 1.4초 뒤 첫 예고를 준비합니다. 드래곤은 반경 125·예고 1.05초·주기 7초, 보스는 반경 160·예고 1.2초·주기 6초입니다. 예고 중심은 시전 당시 공격 대상의 위치로 고정되고 따라 움직이지 않습니다. 드래곤의 마법 피해는 `150+time×0.06`, 보스의 물리 피해는 `230+time×0.08`이며 기존 피해 계산을 거칩니다.

`progress`는 0~1, `at`에 영웅·미니언만 타격하고 목록에서 제거합니다. 소스 사망·리시 초기화·유효 공격 대상 상실은 예고를 취소합니다. AI도 안전한 원 바깥으로 회피합니다. 반환 목록은 팀 시야에 걸리거나 현재 플레이어를 위협하는 예고만 포함하며 숨은 적의 현재 위치를 추가 공개하지 않습니다. Renderer가 중심점 시야만 재검사해 유효한 플레이어 위협을 제거해서는 안 됩니다. Renderer의 짧은 타격 잔상은 시각 효과일 뿐 피해 판정이 아닙니다.

### 포탑 집중 공격과 막타 표식

- `tower.rampStacks`는 **가장 최근 발사한 영웅 대상 공격**에 적용된 단계입니다. 첫 발 0, 같은 영웅에게 연속 발사 시 1·2·3, 단계당 +22%, 최대 +66%. 다음 공격의 예상 단계가 아닙니다.
- 대상 변경 또는 4초 공백에 초기화하며 미니언 대상 공격에는 이 보너스를 적용하지 않습니다. `targetId/aggroTargetId`는 기존 대상 조회 필드로 유지합니다.
- `canLastHit(targetOrId)`는 살아 있고 보이는 적 미니언이 현재 플레이어 기본 공격 사거리 `range+target.r+8` 안에 있으며 1회 공격으로 죽는지 반환합니다. 방어력·팀 드래곤 버프·다음 기본 공격 보너스·보호막을 실제 전투와 같은 계산으로 반영합니다. 공격 쿨다운 완료 여부나 투사체 도착 시점의 미래 체력까지 보장하는 조회는 아닙니다.

### 사망 분석

```js
game.getDeathRecap(); // 초기 null, 사망 후 아래 형식의 복사본
// {at,killerName,totalDamage,totalAbsorbed,windowSeconds:10,
//  sources:[{sourceId,sourceName,sourceType,sourceTeam,
//            damage,absorbed,hits,physical,magic,true}]}
```

최근 10초의 피해를 출처별로 합산합니다. `damage`와 `physical+magic+true`는 실제 감소한 HP, `absorbed`는 보호막이 흡수한 값입니다. 과잉 피해는 실제 잃은 HP까지만 기록합니다. 힐로 회복한 양을 빼는 순피해 통계는 아닙니다. 최근 히트 버퍼는 256개, 출처는 최대 12개이며 초과 시 상위 11개와 기타 합산으로 총합을 유지합니다. 부활하면 새 피해 버퍼를 시작하지만 마지막 사망 분석은 다음 사망 때까지 남습니다.

`isVisible(entity,team=0)`, `visibilityAt(x,y,team=0)`, `isProtected(entity)`는 표시·대상 선택의 공통 조회입니다. `getSnapshot()`은 복사된 상태 요약으로 `mapScale,map:{width,height},endReason,order,focusTargetId,skillRanks,skillPoints,navPath,rampStacks`와 각 영웅의 `attackState`도 포함합니다. 전체 경기 복원은 요약 조회와 별도인 `exportState()/Game.fromState()`를 사용합니다.

## 6. Renderer와 앱 연결

```js
const renderer = new NexusRenderer.Renderer(canvas, game);
renderer.render(dt, { aim: {x: 800, y: 800}, selectedAbility: null,
  aimBlocked: false, attackRangeShown: false });
```

Renderer는 `resize()`, `setGame(game)`, `render(dt,options)`, `screenToWorld(x,y)`, `worldToScreen(x,y)`, `drawMinimap(canvas)`, `panTo(x,y)`를 제공합니다. 화면 좌표는 Canvas 경계 기준 CSS 픽셀입니다. `camera={x,y,zoom}`, `follow=true`로 플레이어 추적을 제어하고 DPR은 최대 2입니다. 벽·시야·수풀·남은 경로·목표 지시·예고 원·집중 공격 단계·막타 표식·타깃 고정 표식은 엔진의 공개 조회를 사용합니다. `getFocusTarget()`의 유효한 영웅에만 황색 원·모서리·이름을 표시합니다. `aimBlocked`는 마나·쿨다운·학습·취소 등으로 사용할 수 없는 조준 표시를 붉게 그리며 자원을 바꾸지 않습니다. QWER 외에 점멸 `d` 300, 와드 450, 회복 `f` 자체 범위 240의 표시도 지원합니다.

### 큰 맵의 그리기 비용

Renderer는 현재 `game.map`을 읽어 카메라 경계·월드 변환·미니맵 축척을 계산하고 `setGame()`에서 새 지형·안개 상태를 만듭니다. 지형은 오프스크린 Canvas에 캐시하며 `cacheScale=min(1,2048/max(width,height))`로 긴 변을 제한합니다. 1배는 1600×1600, 1.5배·2배는 최대 2048×2048로 저장하고 그릴 때 실제 월드 크기로 확장합니다. 캐시 해상도를 낮춰도 유닛·스킬·시야의 월드 단위나 판정 크기는 바뀌지 않습니다.

안개는 월드 20단위당 한 셀로 유지합니다. `cols=clamp(ceil(width/20),80,160)`이며 현재 정사각형 세 맵에서는 80×80·120×120·160×160 셀이 됩니다. 현재 시야와 탐색 흔적은 이 격자에 그리고, 유닛 공개 여부는 계속 엔진의 `isVisible()`이 판정합니다. 격자 해상도와 지형 캐시 상한은 처리량을 제한하는 구현 선택이며 특정 기기의 FPS 보장은 아닙니다. 측정·브라우저 확인은 [QA.md](QA.md)에 기록합니다.

현재 웹 시야는 원형 시야·수풀 판정이며 구조물 상태는 항상 공개됩니다. 별도 언리얼 설계 문서의 벽·고지대 차폐, 시야 밖 공격 위치의 한시 공개, 마지막 관측 건물 상태와 재탐색 갱신은 이 렌더러·엔진에 구현된 기능이 아닙니다.

`_drawAttackCue()`는 현재 보이는 영웅에만 준비 상태를 표시합니다. 플레이어는 청록색 준비 완료·재공격 대기 원호와 주황색 준비 진행을, 다른 영웅은 작은 준비 원호만 사용합니다. 플레이어 준비 점선은 대상도 현재 보여야 연결합니다. 무기 동작은 준비 진행률과 `recovery.duration−recovery.remaining`으로 계산하고 발사 후 0.13초의 짧은 섬광을 더합니다. 별도 전투 타이머를 만들지 않아 일시정지 동안 발사 동작이 진행하지 않습니다.

`attackRangeShown`은 `_drawAttackRange()`에서 반경 `player.range+8`의 기본 공격 원과 라벨을 표시합니다. 실제 판정은 여기에 `target.r`를 더하므로 원은 대상 중심 거리 전체가 아니라 기본 도달 경계입니다. 스킬이 선택됐거나 플레이어가 죽었거나 경기 시작 전·종료 후이면 숨깁니다. 표시 자체는 대상 획득이나 공격을 실행하지 않습니다.

앱은 RAF에서 누적량에 `dt×speed`를 더하고 엔진을 1/60초 고정 스텝으로 호출합니다. `speed`는 0.5·0.75·1·1.5이며 이동·전투·쿨다운·웨이브·게임 시계가 같은 시뮬레이션 시간을 따릅니다. 렌더러에는 현실 프레임 간격을 전달합니다. 숨겨진 탭에서는 누적 시간을 초기화하고 진행을 멈춥니다. 조작은 방향키·클릭, QWER, D/F, 4 와드, A 공격 이동, S 정지, V 공격 범위, Shift+QWER 성장, B 귀환, P 상점, T 전술, G 길잡이, Z 타깃 순환, 대상 패널 × 고정 해제, C 사망 분석, Tab 점수판, Space 자동 공격, Esc 취소·일시정지입니다. 터치 입력은 같은 엔진 명령으로 연결합니다. 항복은 일시정지 메뉴의 명시적 버튼으로 결과·기록 흐름에 진입합니다.

`setGameSpeed()`는 준비·경기·일시정지의 세 선택 UI를 동기화하고 환경설정을 보관하며 진행 중 경기의 체크포인트 저장을 시도합니다. 일시정지 여부를 바꾸지 않고 다음 현실 프레임부터 새 속도를 반영합니다. `NexusFront.settings()`는 `{mapScale,speed}`의 새 객체를 반환합니다. `nexus-front-prefs`는 `hero,difficulty,mapScale,speed,sound,starters,attackRange`를 보관합니다. 새로운 경기는 최근 선택을 사용하며 이어하기는 저장된 경기의 맵·속도로 덮어씁니다.

`updateAttackUI()`는 `getAttackState()`를 읽어 HUD의 단계·남은 초·진행률을 갱신합니다. 준비와 재공격 대기는 소수점 한 자리 초를 사용하며, `disabled`는 플레이어의 사망·귀환·기절 상태에 맞춰 표시합니다. `toggleAttackRange()`는 V와 공격 범위 버튼에 연결되고 `nexus-front-prefs.attackRange`에 불리언을 저장합니다. 저장소 접근 실패는 현재 세션의 표시 설정을 막지 않습니다. 매 렌더 호출에는 `attackRangeShown: attackRangeVisible || selectedCommand==='attackmove'`를 전달합니다. 이 설정은 경기 체크포인트의 `ui` 필드와 별도인 브라우저 환경설정입니다.

### 드래그 조준의 입력 계약

`new NexusControls.AimGesture({threshold:12,maxDistance:72,bounds?})`는 DOM·게임 엔진과 독립적으로 입력 좌표를 계산합니다. 모듈 단독 기본 경계는 각 축 28~1572이며, 앱은 경기 준비·교체·복원 시 현재 맵의 `{minX:28,minY:28,maxX:width-28,maxY:height-28}`로 맞춥니다. 큰 맵에서도 지점·돌진 조준은 해당 경기의 경계를 사용합니다. 공개 인터페이스는 다음과 같습니다.

| 호출·상태 | 의미 |
|---|---|
| `active` | 조준 포인터가 하나 잡혀 있는지 여부. |
| `begin({pointerId,slot,x,y})` | 비어 있는 제스처에 포인터·슬롯·화면 시작 좌표를 저장하고 성공 여부 반환. |
| `move({pointerId,x,y,cancel?})` | 같은 포인터의 좌표와 취소 영역 진입을 갱신. 다른 포인터는 무시. |
| `snapshot(player,meta)` | `{active,slot,pointerId,dragging,canceled,origin,pointer,direction,distance,fraction,aim}` 형태의 표시·조준 데이터. |
| `finish(event,player,meta)` | `{kind:'tap'\|'cast'\|'cancel'\|'ignore',slot,aim?}` 반환 후 해당 제스처 종료. |
| `cancel()` | 시전 없이 활성 제스처 폐기. |

버튼의 시작 화면 좌표에서 12px 이상 이동하면 드래그로 전환하며 다시 안쪽으로 움직여도 단순 탭으로 바뀌지 않습니다. 방향형 스킬은 드래그 방향의 전체 사거리를, 지점·돌진형 스킬은 `min(드래그 거리/72,1) × 스킬 사거리`를 조준합니다. 지점·돌진의 종점은 같은 광선을 따라 지도 안으로 제한합니다. 방향형의 표시 좌표는 가장자리에서 방향을 유지하기 위해 지도 밖까지 나갈 수 있으며, 실제 엔진 시전이 최종 경계를 다시 판정합니다.

단순 탭은 자동 조준 시전으로, 유효한 드래그 해제는 계산된 좌표 시전으로 연결합니다. 취소 영역에서 놓기·포인터 취소·입력 소유권 상실은 시전하지 않습니다. 이동 조이스틱과 조준 포인터는 별도로 관리하므로 이동하면서 스킬 방향을 지정할 수 있습니다. 입력 모듈은 마나나 쿨다운을 직접 변경하지 않고 앱이 성공한 해제 시점에 엔진 `cast()`를 한 번 호출합니다. 앱은 모달·화면 이탈·사망·경기 종료에도 미완료 제스처를 폐기합니다.

## 7. History 계약과 통계 의미

```js
const history = NexusHistory;
const records = history.read(); // storage 인자를 생략하면 localStorage
const record = history.makeRecord(game, '2026-11-14T00:00:00Z'); // nowIso 선택 사항
const result = history.append(undefined, record); // {records,persisted}
```

- `KEY='nexus-front-history'`, `LIMIT=5`. 저장 API는 주입한 `getItem/setItem` 객체도 받을 수 있습니다.
- `read(storage?)`는 정규화된 최신 5개 배열을 반환합니다. 저장소 접근 거절·손상 JSON·비배열은 `[]`; 유효한 경기 시간·승리 팀이 없는 행은 제거합니다.
- `makeRecord(game,nowIso?)`는 `over=true`이고 승리 팀이 유효한 완료 경기만 기록하며 그 외는 `null`입니다. 같은 Game 인스턴스는 반복 호출해도 같은 기록 ID와 완료 시각을 사용합니다.
- `append(storage,record)`는 ID 중복을 제거하고 기존 동일 ID의 최초 결과를 보존하며 현실 완료 시각 내림차순으로 5개를 유지합니다. 저장 실패를 예외로 전파하지 않고 `persisted=false`와 표시 가능한 `records`를 반환합니다. 앱은 실패한 저장을 성공으로 표시하지 않고 이번 세션의 결과·최근 기록을 메모리에 유지합니다.
- v3 상세 기록과 v2 요약 기록을 함께 읽습니다. `version===3` 외에는 v2로 정규화하고 미지의 필드는 버립니다. ID 없는 구형 기록에는 안정된 legacy ID를 붙입니다. 구형 기록의 없는 팀 세부 정보는 빈 배열이며 허위 통계를 생성하지 않습니다.
- 두 기록 형식 모두 `mapScale`을 1·1.5·2로 정규화하며, 없거나 유효하지 않으면 1입니다. 새 완료 ID의 지문에는 맵 배율을 포함합니다. 기록·보고서 화면은 이 값을 표시합니다. 속도는 경기 중 바뀔 수 있어 단일 완료 기록 필드로 보관하지 않습니다.

```js
// v3 record
{ id,version:3,at,hero,difficulty,mapScale,winner,endReason,time,
  kills,deaths,assists,cs,damage,level,structures,
  teamStats:[{team,kills,heroes:[{id,hero,name,team,level,
    kills,deaths,assists,cs,damage,gold,inventory}]}],
  objectives:[{team,dragonStacks,bossRemaining}] }
```

`damage`는 엔진의 `damageDealt`를 정수로 정규화한 값으로 **영웅·미니언·몬스터·구조물·와드 등 모든 타격 대상에 준 실제 HP 피해의 합계**입니다. 영웅에게만 준 피해가 아니며 보호막 흡수는 포함하지 않습니다. `gold`는 종료 시 남은 골드, `structures`는 팀이 파괴한 적 구조물 수입니다. `bossRemaining`은 종료 시 버프의 남은 초이며 보스 처치 횟수가 아닙니다. `inventory`와 팀 통계는 복사·정규화해 원래 게임 객체와 분리합니다. 로컬 기록은 브라우저별이며 계정·서버 동기화 기능은 없습니다.

## 8. 진행 중 경기 저장·복원

### 엔진 체크포인트

```js
const checkpoint = game.exportState();
const json = JSON.stringify(checkpoint);
const restored = NexusGame.Game.fromState(JSON.parse(json));
// restored.paused === true; 진행할 준비가 되면 restored.paused = false;
```

형식은 `{version:1,engineVersion:7,playerId:'player',state:{mapScale,...},sources:[...]}`입니다. `state`에는 맵 배율, 난수 시드·현재 RNG, 시뮬레이션 시간, 이벤트·개체 ID 카운터, 다음 웨이브·골드·정리 시각, 팀 킬·버프·팀 지시, 모든 영웅·구조물·미니언·몬스터·와드, 진행 중 공격·시각 효과, 최근 피해와 마지막 사망 분석, 이동 명령과 별도인 `_focusTargetId`를 담습니다. 영웅에는 장비·스킬·쿨다운·귀환·부활과 AI 의사결정 타이머·남은 경로, `attackPeriod`, `attackCooldown`, `attackWindup`도 포함합니다. 준비 대상·확정 주기·남은 준비를 보관하여 저장 전 이미 발사한 공격과 아직 준비 중인 공격을 구별합니다.

v7의 `state.mapScale`은 필수 숫자이며 1·1.5·2만 허용합니다. 그 배율로 새 Game의 맵을 생성하고 개체·경로·명령·예약 영역·위험 예고를 해당 월드 크기로 검증합니다. 임의의 맵 geometry를 저장에서 가져와 실행하지 않습니다. v4·v5·v6은 `mapScale`이 없거나 숫자 1인 경우만 받아 기본 맵으로 옮깁니다. 구버전 번호에 큰 맵 데이터를 붙이거나 v7에서 배율을 누락·문자열로 바꾸면 거절합니다.

예약 영역 공격은 `kind:'area'`와 `sourceId`를 가진 데이터입니다. 투사체의 `source` 객체 참조는 `sourceId`로, 관통 공격의 `hitIds:Set`은 배열로 내보냅니다. 복원할 때 각 공격의 출처를 새 Game의 해당 개체에 연결하고 `hitIds`를 다시 Set으로 만듭니다. 이미 월드에서 정리된 미니언이 쏜 비행 중 공격은 `sources`에 원래 발사자 상태를 별도 저장해 소유 팀·피해 출처를 잃지 않습니다. 공간 인덱스와 살아 있는 구조물 기반 이동 캐시는 재생성하며 난수를 소비하지 않습니다.

기본 복원은 `paused=true`이고 키·조이스틱 방향만 `{x:0,y:0}`으로 해제합니다. 명시적으로 클릭한 이동·공격 이동·추적 목표와 유효한 타깃 고정, 남은 귀환 채널과 부활 시간은 유지합니다. 재현 검증에서만 `{paused:false,clearInput:false}` 옵션으로 저장 당시 입력까지 이어서 실행할 수 있습니다. 종료된 경기는 체크포인트 대상이 아니며 완료 기록은 History가 관리합니다.

복원은 새 객체에서 검증하고 진행 중인 다른 Game을 변경하지 않습니다. 버전 불일치, 비유한 수, 잘못된 영웅·아이템·스킬 배분, 중복 ID, 필수 월드 개체 누락, 잘못된 공격 출처, 생성 ID 카운터 충돌, 잘못된 자료형·크기·깊이를 `Error`로 거절합니다. 일반 객체의 실행 코드·프로토타입을 수용하지 않습니다. 상한은 개체 512, 투사체 1,024, 예약 영역 256, 중립 예고 64, 별도 발사자 128, 피해 기록 256개이며 기존 시각 효과·이벤트의 한도도 검사합니다.

v6·v7 영웅은 `attackPeriod`가 0.05~20초이며 `attackWindup` 필드가 반드시 있어야 합니다. 준비는 `null` 또는 유효한 적 개체 ID·준비 시간·남은 시간·주기를 가진 객체입니다. 살아 있는 공격자, `0<remaining≤duration`, `duration=clamp(period×0.25,0.10,0.32)`, `period=attackPeriod`, `attackCooldown=period−duration+remaining`을 검사합니다. 모든 영웅의 쿨다운이 확정 주기를 넘지 않는지도 확인합니다. 현재 대상의 사망·시야·거리·보호 조건은 재개 시 `_advanceAttack()`이 다시 검사하므로, 저장과 재개 사이에 불가능해진 공격을 강제로 발사하지 않습니다.

읽기는 `engineVersion:4/5/6/7`을 지원하고 새 내보내기는 `7`입니다. v4·v5는 모든 기존 필수 필드를 검증한 뒤 각 영웅의 `attackWindup=null`로 설정합니다. 기존에는 즉시 발사했으므로 이전 공격을 새로운 준비로 복제하지 않습니다. `attackCooldown`과 비행 중 투사체는 보존하고, `basePeriod=1/_attackSpeed(hero)`로부터 `attackPeriod=max(basePeriod, oldCooldown+clamp(basePeriod×0.25,0.10,0.32))`를 계산합니다. 다음 새 공격부터 현행 일반 주기를 사용합니다. v4에 없는 타깃 고정은 `null`; v5·v6·v7의 `_focusTargetId`는 필수이며 `null` 또는 실제 적 영웅 ID여야 합니다. 유효했던 영웅이 현재 숨거나 죽었거나 범위 밖이면 복원 시 고정만 해제합니다. 미래 버전·임의 과거 버전은 수용하지 않으며, 구버전 경기의 이후 진행에는 현재 v7 규칙이 적용됩니다.

### 브라우저 저장 계층

| API | 반환과 의미 |
|---|---|
| `Checkpoint.normalizeSpeed(value)` | 숫자 0.5·0.75·1·1.5는 유지, 이전 숫자 2는 1.5로 변환, 그 외는 1. `SPEEDS`는 지원하는 네 값의 동결 배열입니다. |
| `Checkpoint.read(storage?)` | `{status:'ready',checkpoint}` 또는 `empty/invalid/unavailable` 상태·이유. JSON과 엔진 복원 계약을 검증합니다. |
| `Checkpoint.write(storage,game,ui,now?)` | `{ok:true,checkpoint}` 또는 `{ok:false,reason}`. 직렬화한 새 상태를 실제 `Game.fromState()`로 검증한 뒤 진행 경기 1개를 단일 `setItem`으로 저장하며 이전 슬롯을 먼저 삭제하지 않습니다. |
| `Checkpoint.restore(checkpoint)` | `{ok:true,game,ui}` 또는 실패 이유. 활성화 직전에 데이터를 다시 분리·검증합니다. |
| `Checkpoint.remove(storage?)` | `{ok:true}` 또는 삭제 실패 이유. |

키는 `nexus-front-checkpoint`, 저장 래퍼는 `{version:1,savedAt,state:엔진체크포인트,ui:{speed,journey?}}`, UTF-8 상한은 2MiB입니다. `speed`는 `normalizeSpeed()`로 정규화하며 맵 배율은 `checkpoint.state.state.mapScale`에 있습니다. `journey`는 여섯 진행 목표와 시작 좌표만 보관합니다. 좌표 범위는 검증한 엔진의 `1600×mapScale`을 따르고 UI가 주장한 별도 맵 배율은 사용하지 않습니다. 경계 밖 길잡이 좌표는 버리되 해당 경기의 엔진 상태 검증은 별도로 수행합니다. `storage`를 생략하거나 `undefined`로 주면 localStorage를 사용하고, 테스트에서는 같은 인터페이스를 주입합니다. 저장 공간 부족·접근 거절·깨진 JSON·지원하지 않는 버전은 표시 가능한 결과로 반환하여 경기 루프를 중단하지 않습니다.

쓰기에서는 먼저 `exportState()`와 `JSON.stringify()`로 분리한 문자열을 `parse(raw,true)`에 전달합니다. 이 단계가 엔진 복원 가능성까지 확인한 뒤에만 저장소에 접근하므로, JSON 문법은 유효해도 준비 공격의 대상·시간 관계가 깨진 상태는 기존 슬롯을 덮어쓰지 않습니다. 저장량 초과·직렬화·복원 검증·저장소 쓰기 실패에서도 이전 바이트를 보존합니다. 검증용 임시 Game은 실제 진행 중 Game이나 저장된 경기 시간을 전진시키지 않습니다.

앱은 진행 중 8게임초마다 저장하고 속도 변경·탭 숨김·페이지 이탈 시점에도 저장을 시도합니다. 로비의 이어하기와 일시정지 메뉴의 저장 후 나가기가 같은 슬롯을 사용합니다. 로비 카드는 저장한 맵·속도를 표시하며 복원 후에는 그 경기의 맵과 UI 속도를 적용합니다. 자동 저장 직후부터 다음 저장 전까지의 입력은 저장본에 포함되지 않으며, 운영체제가 페이지를 강제 종료하면 마지막 이탈 저장 이벤트가 실행되지 않을 수 있습니다. 브라우저·사이트 주소가 다른 환경 사이의 계정 동기화 기능은 없습니다.

## 9. 진행 길잡이와 아이템 추천

`Coach.starter(heroId)`는 리아 `focus`, 브란 `blade`, 키라 `bow`를 추천합니다. 선택 자체는 게임 상태를 바꾸지 않으며 실제 구매는 출전 시 `prepareItem()`이 실행합니다. `Coach.recommend(game)`은 역할별 목표 장비, 보유 재료, 실제 조합 결제액, 슬롯과 거래 가능 위치를 확인해 `{itemId,title,reason,cost,canBuy,missingGold,atShop,complete,blockedBySlots}`를 반환합니다. 추천 문구가 거래 규칙을 우회하지 않으며 구매 버튼은 엔진 `buy()`를 사용합니다.

`Coach.read(game,previousJourney)`는 `{journey,milestones,advice}`를 반환합니다. 장비·100단위 위치 이동·QWER 시전·첫 CS·스킬 성장·팀의 첫 적 구조물 파괴를 실제 관측으로 누적합니다. `journey={version:1,origin:{x,y},completed:{equipment,move,skill,cs,growth,structure}}`이며 완료한 목표는 되돌리지 않습니다. CS는 엔진의 미니언·일반 캠프 막타 합계, 구조물은 팀 성과입니다. 별도 보상이나 임의 완료 조작은 없습니다.

길잡이 원점 검증, 거래 위치 확인, 기지 위협 조언은 `game.map`을 사용하고 구형 호출자에게만 기본 `MAP`을 대체값으로 사용합니다. 큰 맵의 1600 초과 좌표를 정상 유지하며 기지 반경 180의 상점·570 이내 위협 기준과 이동 목표 100단위 자체는 맵 배율로 늘리지 않습니다.

상황 안내는 사망, 발밑 위험 예고, 포탑 집중 공격, 귀환, 미사용 스킬 포인트, 낮은 체력, 기지 위협, 장비 구매, 팀 지시, 중립 목표와 공성 순서로 현재 상황에 맞게 우선합니다. 위험·적 접근 판단은 팀 시야를 사용합니다. `advice.action`은 `shop/upgrade/recall/defend/dragon/boss/push` 등 기존 UI 명령에 연결하며, 행동 실행 시점에는 엔진이 다시 유효성을 판단합니다.

## 10. 단일 오프라인 배포와 변경 검증

`npm run build:offline` 또는 `node scripts/build-offline.cjs`는 `dist/index.html`을 기준으로 CSS와 여덟 모듈을 인라인으로 넣어 `dist/nexus-front-offline.html`을 생성합니다. 다운로드 버튼용 보조 스크립트 1개가 더해져 **총 9개의 인라인 스크립트**가 들어갑니다. 다운로드 보조는 동일 문서를 Blob으로 저장하며 내려받는 이름은 `nexus-front.html`입니다. 이 HTML은 실행 프로그램이며 진행 중 경기 상태를 파일에 내장하지 않습니다. 경기 이어하기는 해당 실행 환경의 브라우저 저장소를 사용합니다.

소스 변경 뒤에는 다시 빌드해야 단일 HTML이 갱신됩니다. 모듈을 추가하거나 순서를 바꿀 때 `index.html`과 빌더의 목록을 함께 수정합니다. 인라인 스크립트 종료 태그를 안전하게 취급하기 위한 빌더 검사가 있습니다. `index.html` 직접 실행은 같은 폴더의 CSS와 여덟 JS 파일을 함께 유지해야 합니다.

개발 검증 명령은 `npm test`이며 엔진·경로·성장·거래·목표 협동·예고·막타·사망 집계·항복·기록 호환·완전 상태 복원·저장 장애·상황 안내를 검사합니다. 체크포인트 검사는 이미 적중한 관통 투사체와 예약 궁극기가 있는 상태에서 웨이브 경계를 넘어 원본과 복원본의 전체 상태를 비교하고, 귀환·부활·위험 예고와 자연 경기의 반복 저장도 확인합니다. v5 검사는 고정·이동의 독립성, 스킬 실제 발사 방향과 수동 우선, 시야 상실, 포탑 엄호·후퇴, 안전한 원거리 공격, 지도 경계 후퇴 이후 복원을 검증합니다.

v6에는 실제 준비 이후 한 번의 발사, 취소 후 피해·보너스 보존, 발사 뒤 이동과 재공격 대기, F·와드와 거절된 스킬의 준비 보존, AI의 준비·안전 판단, 준비 중 저장의 결정적 재개, 잘못된 공격 상태의 쓰기 거절을 추가했습니다. 실제 이전 Git 버전을 실행하여 생성한 v4·v5 fixture로 업그레이드를 확인하며, 단순히 새 저장의 버전 숫자를 낮춰 호환성 자료로 사용하지 않습니다. Renderer 검사는 세 영웅의 준비·발사 후 상태와 일시정지에서 렌더링이 전투 상태를 바꾸지 않는지, 숨겨진 공격자·대상 정보를 노출하지 않는지, 범위 표시와 스킬 조준의 우선순위를 확인합니다. Canvas 대역 검사는 실제 브라우저 화면 배치의 검증으로 취급하지 않습니다.

v7에는 `v7-map`, `v7-app-settings`, `v7-persistence`, `v7-renderer` 검사를 추가했습니다. 맵별 생성·이동·저장·경계, 세 설정 UI와 네 속도, 큰 맵의 길잡이·기지 판정·완료 기록, 지형 캐시·안개 해상도와 맵 교체를 다룹니다. 실제 v6 엔진으로 만든 `tests/fixtures/v6-checkpoint.json`도 호환 자료에 포함하며, v4·v5·v6을 기본 맵으로 읽고 예전 2배 속도를 1.5배로 옮기는 조건을 검사합니다. 전체 통과 수·실제 화면·기기 성능의 확인 범위는 아래 QA 기록을 기준으로 합니다.

새 상태나 명령은 실패 시 자원 보존, 시야 정보 제한, 유한 좌표·배열 크기, 정상 경기의 진행을 확인합니다. fixture의 직접 상태 조작은 테스트 범위에 한정하고 실제 UI의 종료 경로는 넥서스 파괴와 `surrender()`를 사용합니다. 최종 실행 결과와 브라우저에서 직접 확인한 범위는 [QA.md](QA.md)에 기록합니다.
