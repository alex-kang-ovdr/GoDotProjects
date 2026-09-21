# Gameplay Tag 활용 계획

## 결론

Captain Salvage의 현재 단일 플레이어 범위에는 **Godot 내장 기능과 소형 공용 GDScript 태그 레이어만으로 충분**하다. 지금은 외부 Gameplay Ability System(GAS) 플러그인을 도입하지 않는다.

도입 대상은 상태·능력·이동·UI·데이터·네트워크 경계이며, 태그는 숫자 값이나 물리 연산을 대체하지 않는다. 예를 들어 `state.shield.active`는 방어막이 켜져 있다는 분류이고, 방어막 레이어 수·재충전 시간·추력·질량은 기존 밸런스 데이터의 숫자로 유지한다.

현재 확인된 기반은 다음과 같다.

- `enemy_ship.gd`는 로밍·공격·대화·퀘스트·이탈 요구 상태를 문자열 상수로 관리한다.
- `main.gd`는 튜토리얼 단계, 자동 항법, 표적, HUD 갱신을 개별 변수와 조건문으로 관리한다.
- `balance.gd`와 `part_tuning.csv`는 공유 게임 데이터의 단일 원본이다.
- `project.godot` 및 런타임 스크립트에는 멀티플레이어 피어·RPC·동기화 노드가 아직 없다.

## 목표와 비목표

### 목표

- 한 함선의 현재 규칙 상태를 일관된 계층형 이름으로 조회한다.
- 능력 활성화·차단·취소·쿨다운 조건을 데이터로 선언한다.
- HUD·대화·VFX가 전투 계산을 직접 읽지 않고 태그 변화 이벤트를 구독한다.
- PC·Android·Web의 GDScript SSOT를 유지한다.
- 미래 협동 플레이에 필요한 서버 권한·복제 경계를 지금부터 분리한다.

### 비목표

- Unreal GAS 전체를 복제하지 않는다.
- 태그를 매 프레임 문자열 조합하거나 전역 노드 검색의 기본 수단으로 쓰지 않는다.
- `ui.*`, `debug.*`, 연출 태그를 네트워크 권한 판정에 쓰지 않는다.
- 태그만으로 HP·탄약·쿨다운·질량·좌표를 저장하거나 동기화하지 않는다.

## 권장 구조

새 공통 레이어는 다음 다섯 구성으로 제한한다.

- `GameplayTags`: 허용 태그 상수와 접두사 규칙. `StringName` 상수만 제공한다.
- `GameplayTagSet`: 개별 함선·투사체·정거장에 붙는 작은 런타임 집합. `add`, `remove`, `has`, `has_prefix`, `matches_all`, `matches_any`와 `changed` 시그널을 제공한다.
- `GameplayTagRules`: 능력의 필요·차단·부여·제거 태그를 보관하는 데이터 전용 규칙이다.
- `GameplayEvent`: 발생자, 대상, 이벤트 태그, 수치 payload, 프레임/틱을 담는 짧은 수명 이벤트다.
- `GameplayTagReplicator`: 멀티플레이어 도입 전에는 비활성 어댑터다. 추후 서버가 승인한 태그 델타만 직렬화한다.

`ShipBody`는 게임 규칙의 소유자이고 `GameplayTagSet`은 그 자식 데이터 객체다. HUD, 내러티브, 파티클은 `changed` 또는 `GameplayEvent`를 구독할 뿐 `ShipBody`의 내부 쿨다운·체력 값을 변경하지 않는다.

Godot의 `Node` 그룹은 `ship`, `enemy`, `projectile`, `station`처럼 씬 내 노드 집합을 찾거나 일괄 호출할 때만 병행 사용한다. Godot 그룹은 여러 그룹 소속과 `SceneTree.call_group()` 호출을 지원하지만, 이름이 같으면 전역/씬 구분 없이 동일한 그룹으로 취급된다. 따라서 게임플레이 상태의 수명·차단 규칙·권한을 표현하는 태그 저장소로는 부족하다. [Godot Groups 문서](https://docs.godotengine.org/en/stable/tutorials/scripting/groups.html)

## 이름 규칙과 초기 어휘

모든 태그는 소문자 점 표기법을 사용한다. ID가 동적으로 붙는 태그는 금지하며, 개체 ID·무기 ID·퀘스트 ID는 별도 데이터 필드에 둔다.

```text
state.ship.active
state.ship.disabled
state.ship.destroyed
state.shield.active
state.shield.recharging
state.control.manual
state.control.auto_navigation

ability.move.thrust.forward
ability.move.thrust.reverse
ability.move.turn
ability.weapon.laser
ability.weapon.missile
ability.weapon.auto_torpedo
ability.utility.grapple
ability.build.attach
ability.build.reposition

block.weapon.overheated
block.weapon.no_ammo
block.control.dialogue
block.control.destroyed
block.build.held_part

event.damage.hit
event.damage.shield_absorbed
event.part.destroyed
event.target.changed
event.quest.progressed
event.station.serviced

ui.hud.target_locked
ui.hud.missile_ready
ui.dialogue.open
ui.tutorial.active

data.part.weapon
data.part.propulsion
data.weapon.torpedo
data.faction.player
data.faction.hostile

net.authority.server
net.replication.relevant
net.replication.dormant
```

`state.*`는 현재 사실, `ability.*`는 실행 가능한 행동의 정체성, `block.*`은 행동을 막는 원인, `event.*`는 순간 통지, `ui.*`는 표현 전용, `data.*`는 정적 분류, `net.*`는 복제 정책을 뜻한다. 같은 사실을 `state`와 `block`에 중복 저장하지 않는다. 예를 들어 함선 파괴는 `state.ship.destroyed`를 부여하고, 능력 규칙이 이 상태를 차단 조건으로 읽는다.

## 영역별 적용 계획

### 상태

- AI 문자열 상태는 즉시 삭제하지 않는다. 첫 단계에서 `state.ai.roaming`, `state.ai.attack`, `state.ai.dialogue_request`, `state.ai.quest`, `state.ai.exclusion`을 병행 기록하고 기존 상태 전환 테스트와 결과가 같은지 확인한다.
- 방어막·과열·탄약·갈고리·파괴 연결성은 태그와 수치를 함께 쓴다. 예: 레이어가 1 이상이면 `state.shield.active`, 재충전 중이면 `state.shield.recharging`, 탄약이 부족하면 `block.weapon.no_ammo`를 갱신한다.
- 파트가 코어 연결에서 분리되면 기존 중립 부품 전환과 함께 `state.ship.detached`를 이벤트 payload에 기록한다. 중립 파트에는 플레이어 능력 태그를 복사하지 않는다.

### Ability

능력은 입력 또는 AI 의도를 받아 다음 순서로 처리한다.

1. `ability.*` 식별자로 규칙을 찾는다.
2. `state.*`와 `block.*`을 검사한다.
3. 성공하면 쿨다운·발열·탄약·물리 힘을 기존 SSOT에서 적용한다.
4. 결과를 `event.*`로 발행하고 UI/VFX가 읽게 한다.

초기 규칙 예시는 다음과 같다.

- `ability.weapon.auto_torpedo`: `state.ship.active`가 필요하고 `block.weapon.no_ammo`, `block.control.dialogue`, `block.control.destroyed`가 있으면 차단한다.
- `ability.utility.grapple`: `state.ship.active`가 필요하고 `state.grapple.attached`이면 토글 해제만 허용한다.
- `ability.build.attach`: `state.control.manual` 및 들고 있는 부품이 필요하며 `block.control.dialogue`에서 차단한다.

Ability 규칙은 `Resource` 기반 `.tres` 또는 현재 CSV의 참조 열로 선언한다. Godot `Resource`는 직렬화·중첩·디스크 저장이 가능한 데이터 컨테이너이므로, 런타임 상태가 아닌 능력 정의를 담기에 알맞다. [Godot Resource 문서](https://docs.godotengine.org/en/stable/classes/class_resource.html)

### 이동

- 수동 입력 중에는 `state.control.manual`을 부여하고 `state.control.auto_navigation`을 제거한다.
- 빈 공간 자동 이동 중에는 반대로 `state.control.auto_navigation`을 부여한다.
- 자동 RCS 역토크와 감속은 별도 능력이 아니라 물리 보정이다. 출력 비율·이펙트 단계는 기존 `PhysicsTuning`과 `VisualTuning`이 계속 소유한다.
- `state.ship.disabled` 또는 `ui.dialogue.open`은 이동 능력을 차단하지만, 물리 감쇠·안전 제동은 유지한다.

### UI와 내러티브

- HUD는 매 프레임 임의의 조합 조건을 재구성하지 않고 `event.target.changed`, `event.damage.hit`, `changed`를 받아 준비 상태를 갱신한다.
- HUD 표시는 `ui.hud.*`, 대화는 `ui.dialogue.open`, 튜토리얼은 `ui.tutorial.active`로 분류한다. 이 태그는 로컬 표현 전용이며 저장·복제하지 않는다.
- `event.quest.progressed`에는 퀘스트 ID와 단계 번호를 payload로 넣는다. 태그에 `quest.rift.3`처럼 가변 ID를 넣지 않는다.

### 데이터

- `part_tuning.csv`에는 파트의 정적 분류만 추가한다. 예: `tag_list`에 `data.part.weapon;data.weapon.torpedo`.
- 쿨다운, 피해, 추진력, 탄약 비용처럼 균형에 영향을 주는 수치는 계속 `balance.gd`와 CSV의 숫자 필드에 둔다.
- 태그 레지스트리는 중복·오타·허용되지 않은 접두사를 헤드리스 테스트에서 실패시킨다. 개발자 편집 모드는 허용 태그 선택 목록만 제시한다.

### 네트워크

현재는 멀티플레이어 기능이 없으므로 태그 시스템은 로컬 전용으로 시작한다. 협동 플레이를 승인한 뒤에만 아래 단계를 진행한다.

1. 서버 권한: 클라이언트는 `ability.*` 의도와 입력만 전송한다. 서버가 태그 규칙·탄약·사거리·피해를 검증하고 결과 이벤트를 확정한다.
2. 스냅샷: 위치·속도·각속도·HP·탄약·쿨다운은 숫자 스냅샷으로, 서버 승인 `state.*`와 `data.*` 태그는 정렬된 델타로 보낸다.
3. 비복제: `ui.*`, `debug.*`, 순수 VFX 태그, 로컬 카메라 상태는 전송하지 않는다.
4. 관련성: 월드 거리와 함선 바운드 반경을 이용해 `net.replication.relevant` 대상만 보낸다. 멀리 있는 AI·투사체는 dormant 상태로 전환한다.
5. 복구: 접속·재접속 시 전체 스냅샷을 먼저 적용하고 이후 태그 델타를 적용한다. 태그의 이전/이후 버전이 맞지 않으면 서버 스냅샷을 우선한다.

Godot의 고수준 멀티플레이어는 `SceneTree`, RPC, 권한 모드와 전송 채널을 제공하며, `MultiplayerSpawner`는 권한 노드의 스폰을 다른 피어에 복제할 수 있다. 그러나 HTML5에서는 WebSocket·WebRTC만 지원하고 일부 고수준 기능과 원시 TCP/UDP 접근이 제한되므로, Web 배포까지 포함한 협동 플레이는 WebRTC 또는 WebSocket 백엔드를 별도 검증해야 한다. 또한 Godot도 클라이언트 입력을 신뢰하지 말라고 명시한다. [Godot High-level multiplayer 문서](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html), [MultiplayerSpawner 문서](https://docs.godotengine.org/en/stable/classes/class_multiplayerspawner.html)

## 구현 순서와 통과 기준

### M1 — 레지스트리와 태그 집합

- `GameplayTags`, `GameplayTagSet`, 단위 테스트를 추가한다.
- 접두사 검사, 중복 추가, 존재하지 않는 태그, `matches_all/any`, 변경 시그널을 검증한다.
- 기존 게임 동작은 변경하지 않는다.

### M2 — 함선 상태와 능력 게이트

- `ShipBody`, `EnemyShip`, `Main`의 파괴·방어막·대화·자동 항법·AI 상태를 병행 태깅한다.
- 레이저, 수동 미사일, 자동 유도 어뢰, 그래플, 장착 행동에 `GameplayTagRules`를 적용한다.
- 기존 런타임·물리·NPC AI·내러티브 자동 테스트가 모두 그대로 통과해야 한다.

### M3 — HUD·대화 이벤트 구독

- HUD와 대화 UI가 태그 변화 및 이벤트를 구독하도록 옮긴다.
- `ui.*`는 저장·복제하지 않는지, HUD가 전투 값을 변경하지 않는지 검증한다.
- PC·Web 빌드와 수동 HUD 확인을 통과해야 한다.

### M4 — 데이터 편집과 마이그레이션

- 파트 CSV의 정적 태그 열, 능력 규칙 Resource, 개발자 편집 모드의 허용 태그 선택을 추가한다.
- 저장 데이터에는 태그 레지스트리 버전을 기록하고, 알 수 없는 정적 태그는 안전하게 제거·기록한다.

### M5 — 협동 플레이 결정 후 네트워크 수직 절편

- 로컬 호스트 2인에서 이동 입력, 무기 의도, 파트 장착, 분리, 어뢰, 갈고리 한 경로만 서버 권한으로 검증한다.
- RPC에는 입력/의도만 허용하고 클라이언트가 HP·탄약·태그 결과를 직접 설정할 수 없음을 자동 테스트한다.
- Windows·Android·Web의 실제 연결 경로와 패킷 예산을 측정한 뒤, 전면 도입 여부를 결정한다.

## 플러그인 검토

### 기본 권고: 플러그인 미도입

현재 프로젝트는 단일 플레이어 세로 슬라이스이고, 능력 수가 제한적이며, PC·Android·Web 공통 GDScript가 핵심 제약이다. 따라서 작은 자체 태그 레이어가 가장 낮은 의존성·용량·이식 리스크로 요구를 충족한다. 이는 **권장 및 구현 대상**이다.

### 후보: OctoD `godot-gameplay-tags`

Asset Library 항목은 노드별 태그 추가·제거·갱신과 CSV import/export를 제공한다. 다만 현재 공개 항목은 Godot 4.2용 0.3.0이며 2024년 등록이다. 태그 저장소만 필요하다면 자체 구현보다 장점이 작고, 능력·권한·복제 규칙은 별도로 만들어야 한다. **지금 도입하지 않음; M4 편집 도구 요구가 커질 때 재평가**. [Asset Library 항목](https://godotengine.org/asset-library/asset/3020)

### 후보: OctoD `godot-gameplay-systems`

Ability, AbilityContainer, 문자열 태그, 속성 맵을 제공하고, 필요·차단·쿨다운 태그 규칙도 지원한다. 요구 기능과 가장 가깝지만, 현 프로젝트의 `ShipBody` 물리와 CSV SSOT에 맞춘 통합·마이그레이션 비용이 생긴다. **M2 자체 구현이 복잡해질 때만 짧은 격리 스파이크로 평가**. [Ability System 문서](https://github.com/OctoD/godot-gameplay-systems/blob/main/docs/ability-system.md)

### 후보: `GodotGAS`

Godot 4.6+용 순수 GDScript GAS로 계층형 태그, 속성, 효과 스택, VFX 큐, 구조화 payload를 제공한다. 대규모 RPG 효과 조합·영구 협동 플레이까지 확정되면 후보가 될 수 있다. 그러나 현재 범위에는 프레임워크 규모가 과하고, 기존 `ShipBody`/`Balance`/HUD와 중복된 상태 소유권을 만들 위험이 있다. **현재 미도입; M5가 승인되고 효과 조합 수가 급증할 때 재평가**. [GodotGAS 저장소](https://github.com/yulrun/godot-gas)

### 제외: 네이티브 GDExtension 중심 Ability System

`GDAbilitySystem`은 Godot 4용 능력·속성·태그 프레임워크지만 GDExtension 바이너리를 포함한다. PC·Android·Web 동시 배포에서는 플랫폼별 바이너리와 Web 호환성 검증이 추가되므로 GDScript SSOT 제약과 맞지 않는다. **도입 제외**. [GDAbilitySystem 저장소](https://github.com/kibble-cabal/ability-system)

## 측정과 재평가 조건

- 태그 집합은 함선·AI·투사체의 능력 소유자만 생성한다. 별·배경·단순 파티클에는 붙이지 않는다.
- 활성 함선 한 대당 태그 변경은 입력·상태 전환 시에만 발생해야 하며, 매 프레임 전체 태그 배열을 복제·정렬하지 않는다.
- M2 완료 후 헤드리스 테스트에 태그 규칙 20개 이상을 추가하고 PC·Web 빌드를 측정한다.
- 플러그인 재평가는 능력 20종 이상, 중첩 상태 효과 10종 이상, 또는 M5 협동 수직 절편이 승인될 때만 진행한다.

## 상태

- 내장 기능 충분성: **검증된 설계 판단**. Godot 그룹·Resource·시그널·GDScript로 구현 가능하다.
- 외부 플러그인 호환성: **조사 완료, 미통합**. 실제 프로젝트 호환성·성능·Web/Android 패키지 검증은 아직 수행하지 않았다.
- 멀티플레이어: **미구현**. 위 계획은 향후 협동 플레이 승인 시의 경계 설계다.
