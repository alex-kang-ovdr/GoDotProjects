# 03 · Runtime Bridge·Lua·객체 모델

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 책임을 나누되 중복 엔진을 만들지 않는다

```text
Workspace / Project IR     ← 편집 데이터의 유일한 기준
           │ 승인된 Snapshot / Delta
           ▼
PlayForge Runtime Bridge   ← ID·권한·API·수명·명령 변환
           │ 공개 API
           ▼
Godot Runtime              ← 실행 트리·렌더·오디오·입력
           │
승인된 미들웨어 확장       ← 필요 시 Havok / Box2D / EOS
```

Bridge는 또 다른 범용 엔진 전체가 아니라 공개 기능의 좁은 계약이다. 게임에는 PlayForge Lua API를 노출하고, 구현은 가능한 한 Godot 기능을 사용한다. 문서의 API 이름은 제안 계약이며 Godot가 제공하는 PlayForge API가 아니다.

## 객체 식별자

| 식별자 | 소유 범위 | 영구 저장 |
|---|---|---|
| Actor GUID / Component GUID / Property ID | PlayForge 소스 | 가능 |
| Asset GUID + Version + Hash | 콘텐츠 버전 | 가능 |
| Godot ResourceUID | 생성된 Godot 프로젝트 | 해당 생성물과 매핑 관리 |
| Godot ObjectID / RID | 실행 프로세스 | 금지 |
| Network ID + Generation | 게임 세션 | 세션 프로토콜 전용 |

ResourceUID는 프로젝트 리소스 참조를 유지하는 기능이지 플랫폼 전역 ID가 아니다. PackedScene은 소유 노드 저장 기능이므로 `owner` 누락에 따른 저장 누락도 시험해야 한다. [G26](../references/Verified_Sources.md#g26)[G27](../references/Verified_Sources.md#g27)

## CDO / Prefab / Instance

PlayForge 편집 원본은 Native/Schema 기본값 → Class Defaults → Prefab/Variant → Instance Override 순서로 해석한다. Godot 실행 객체에는 해석한 값과 origin metadata를 적용한다. 런타임은 필요 없이 상속 체인 전체를 매 Tick 재해석하지 않는다.

값이 기본값과 같더라도 명시적인 Override는 남긴다. Component ID는 타입명과 분리해 같은 타입 여러 개를 구분한다. 클래스 이름·파일 경로를 바꿨다고 영구 Property ID를 다시 생성하지 않는다.

ClassDB는 엔진/GDExtension 메타데이터를 활용하는 출발점이지만 모든 script-defined class를 포괄하지 않는다. 따라서 Lua Schema와 PlayForge의 허용 속성 목록을 별도로 결합한다. 공개 가능한 최소 Schema만 생성하고 엔진 메타데이터 전체를 UGC 권한으로 간주하지 않는다. [G25](../references/Verified_Sources.md#g25)

## Lua 경로

Godot 공식 언어에 Lua는 없으므로 E1 바인딩이 필요하다. 커뮤니티 `lua-gdextension`은 Lua 5.4·별도 State·라이브러리 선택의 검증 후보일 뿐 제품 채택 확정이 아니다. [G23](../references/Verified_Sources.md#g23)[G38](../references/Verified_Sources.md#g38)

권장 P0는 일반 Godot 객체를 무제한 조작하는 Lua보다 **LuaBehaviour + 제한 API + 안정 핸들**이다. 완전한 Lua ScriptLanguage 통합, Godot 모든 타입 자동 바인딩, 범용 디버거를 동시에 1차 요구로 잡지 않는다.

```text
Lua Move 요청
→ World/Actor 핸들 확인
→ 게임플레이 실행 권한 확인
→ 허용된 Component 명령 생성
→ Simulation 안전 시점 적용
→ 결과/오류 코드 반환
```

게임 Lua가 임의 OS·파일·동적 Native 모듈·JavaScript eval·네트워크 자격증명에 접근하지 못하게 한다. 승인된 서버 게임 로직도 Workspace 소스나 플랫폼 관리 DB에 접근하지 않는다. JavaScriptBridge는 웹 연결 수단이지만 그대로 Lua에 노출할 API는 아니다. [G37](../references/Verified_Sources.md#g37)

## 상태 소유와 스레딩

| 상태 | 쓰기 주체 |
|---|---|
| 편집 Source Property | Workspace Authority |
| 실행 중 Dynamic Body | 선택된 물리 백엔드 |
| Kinematic 목표 | 권위 게임 로직 |
| 화면 보간 | 렌더 표현 상태, Gameplay에 역쓰기 금지 |
| 네트워크 Proxy | 승인된 Replication Apply |

Lua VM은 동시에 여러 스레드에서 호출하지 않는다. 순수 배열 계산은 Job으로 분리하고 SceneTree 변경은 정해진 실행 지점에 모은다. Godot의 활성 SceneTree는 일반적인 멀티스레드 수정 대상이 아니다. [G20](../references/Verified_Sources.md#g20)

## Hot Reload

함수 본문 교체도 closure·coroutine·이벤트 구독이 호환될 때만 허용한다. 구조·RPC Schema·Native 타입 변경은 PIE 재시작을 기본으로 한다. 중단된 기존 coroutine을 자동으로 새 코드의 같은 줄로 이동시키지 않는다. 실패 시 이전 Snapshot으로 재시작할 수 있어야 한다.

## 타입 연결

`FName`은 필요 시 StringName에 매핑하되 내부 index를 파일·네트워크에 저장하지 않는다. `FGameplayTag`의 계층 검증은 PlayForge의 작은 레지스트리로 유지한다. `FLocText`는 key·source·format args를 보존하며 포맷 의미가 다른 경우 명시적으로 변환한다. 이름이 비슷하다는 이유로 Godot 번역 API와 ICU 메시지 문법을 동일시하지 않는다. [G33](../references/Verified_Sources.md#g33)

Math는 공개 경계에서만 변환한다. 매 벡터 덧셈마다 Lua→PlayForge→Godot→Havok 왕복을 만들지 않는다. 대량 Body/Transform 요청은 일괄 처리하되 결과 동일성은 별도 시험한다.
