# Roblox → Godot 게임 로직 자동 포팅: API 매핑의 가능성과 한계

작성일: 2026-11-20  
대상: Roblox Studio / Luau → Godot 4.x / GDScript  
문서 유형: 기술 리서치·아키텍처·PoC 계획

## 1. 요약

**결론:** API 매핑 테이블은 자동 포팅의 필수 구성요소이지만 충분조건은 아니다. `Vector3`, 수학 함수, 일부 Tween 및 입력 처리처럼 의미가 유사한 API는 기계적 변환이 가능하다. 그러나 Roblox의 `Instance` 객체 모델, Luau 실행 의미, 이벤트 스케줄러, 캐릭터 컨트롤러, 물리, 네트워크 복제, 플랫폼 서비스는 Godot와 구조적으로 다르다. 이들은 **정적 분석 + 중간 표현(IR) + 의미 보존 어댑터 + 호환 런타임 + 검증**으로 다뤄야 한다.

권장 방식은 **하이브리드 변환기**다. 안전한 부분은 GDScript로 생성하고, 의미 차이가 있는 API는 호환 계층으로 호출하며, 동적 Luau 언어 기능이 많은 코드는 VM 실행을 선택한다. VM 경로는 Godot와의 브리지 및 배포 플랫폼별 구현 비용이 높다.

### 평가 기준

- **D(직접):** 동일한 의미에 가까운 네이티브 API로 변환 가능. 좌표계·타입 보정은 별도 적용.
- **A(어댑터):** 명시적인 호환 함수/객체로 동작을 재현 가능.
- **R(런타임):** 객체 모델, 스케줄러, 상태 머신 또는 네트워크 계층이 필요.
- **X(외부/수동):** Roblox 플랫폼 종속 기능으로 별도 서비스 설계·권한·제품 결정이 필요.
- **V(VM 권장):** GDScript로 의미 보존이 어려운 Luau 동적 실행 패턴.

이 분류는 보장된 성공률이 아니라 개발 우선순위다.

## 2. 엔진의 구조적 차이

| 구분 | Roblox | Godot 4.x | 포팅 시 핵심 문제 | 대응 |
|---|---|---|---|---|
| 객체 모델 | DataModel / Instance / Service | SceneTree / Node / Resource | ClassName, Parent, 생명주기, 참조 | RobloxInstance 래퍼와 ID 레지스트리 |
| 스크립트 | Luau Script / LocalScript / ModuleScript | GDScript Node script | 실행 위치, 모듈 캐시, 스케줄링 | ScriptContext IR + 실행 호스트 |
| 좌표 | Y-up, 왼손 좌표계 | Y-up, 오른손 좌표계 | 회전·벡터·메시 winding | 변환 행렬을 일관 적용 |
| 길이 | stud | 엔진 단위(관례상 m) | 속도·중력·힘 스케일 | 프로젝트 단위 정책; 기본 0.28 m/stud 후보 검증 |
| 물리 | Roblox solver / Assembly | GodotPhysics / Jolt | 접촉, joint, ownership, sleep | 물리 호환 레이어 + 허용오차 테스트 |
| 캐릭터 | Humanoid / Character | CharacterBody3D / AnimationTree | 상태 전이, 이동·점프·네트워크 | HumanoidCompat 상태 머신 |
| 이벤트 | RBXScriptSignal | Signal | 연결 해제, 대기, 발생 순서 | SignalCompat 및 scheduler |
| 네트워크 | 자동 객체 복제·RemoteEvent | MultiplayerAPI / RPC | 권한·복제 범위·오브젝트 수명 | ReplicaRegistry + RPC 게이트웨이 |
| 데이터 | DataStoreService | 기본 대응 없음 | 계정·영속 저장·제한 | 외부 백엔드 어댑터 |
| UI | ScreenGui / UDim2 | CanvasLayer / Control | 레이아웃·앵커·ZIndex | UI 변환기 및 viewport 테스트 |

**좌표계 규칙 예시:** 위치 벡터 `p=(x,y,z)`를 `p'=(s*x,s*y,-s*z)`로 변환하는 기준을 채택할 수 있다. 회전은 `R' = M R M^-1`, 변환 행렬은 기저 변환을 사용한다. 단, 단순히 Z 부호만 바꾸면 quaternion, cross product, mesh winding, normal, tangent, joint axis 및 카메라 방향에 오류가 발생한다. 실측 fixture로 검증해야 한다.

## 3. API 매핑 테이블 — 핵심 게임 로직

### 3.1 Luau 기본형·연산

| Roblox / Luau | Godot 후보 | 등급 | 의미 차이 및 대응 |
|---|---|---|---|
| `Vector3.new(x,y,z)` | `Vector3(x,y,z)` | A | 좌표계·단위 변환을 경계에서 적용 |
| `v.Magnitude` | `v.length()` | D | 단위 스케일 |
| `v.Unit` | `v.normalized()` | A | 0 벡터 처리 테스트 |
| `v:Dot(w)` | `v.dot(w)` | D | 동일 기저 적용 |
| `v:Cross(w)` | `v.cross(w)` | A | handedness 부호/기저 변환 |
| `CFrame.new`, `CFrame.Angles` | `Transform3D`, `Basis` | A | 회전 순서·축·행렬 방향 검증 |
| `CFrame.lookAt` | `looking_at` 기반 래퍼 | A | Roblox의 forward/up 및 Godot -Z 규약 |
| `Color3.new` | `Color` | D | 색 공간·채널 의미 확인 |
| `UDim2.new` | anchors/offsets | A | 부모 크기 의존 및 레이아웃 순서 |
| `math.clamp` | `clamp` | D | 수치 타입 검사 |
| `math.random` | `RandomNumberGenerator` | A | 범위·seed·재현성 |
| `table.insert/remove` | `Array` 메서드 | A | 1-based vs 0-based 인덱스 |
| `pairs/ipairs` | 반복문 | A | 키 순서·nil·table 혼합 키 |
| `nil` | `null` | A | Luau nil은 table 키 제거 의미 포함 |
| 다중 반환 | Array/튜플형 래퍼 | A/V | 값 개수 및 vararg 의미 보존 |
| metatable | 별도 동적 객체 또는 Luau VM | V | `__index`, `__newindex`, `__call` |
| coroutine/task | async scheduler 또는 VM | R/V | resume/yield 순서, 오류 전파 |

### 3.2 Instance / Scene

| Roblox API | Godot 후보 | 등급 | 차이 및 대응 |
|---|---|---|---|
| `Instance.new(class)` | 노드 팩토리 | R | Roblox ClassName별 복합 노드 생성 |
| `Parent` | `add_child/remove_child/reparent` | A/R | 부모 변경 시 초기화·이벤트 순서 |
| `Name`, `ClassName` | `name`, metadata | A | Godot 노드 이름 제약, 중복 이름; 별도 원본명 저장 |
| `FindFirstChild` | 직접 자식 이름 검색 | A | 재귀 옵션·동명 자식·타입 보존 |
| `WaitForChild` | await + registry | R | timeout, 생성 이벤트, 삭제·재부모화 |
| `GetChildren/Descendants` | 트리 순회 | A | 반환 순서 및 숨겨진 호환 자식 제외 |
| `IsA` | class hierarchy registry | R | Roblox 상속 트리 재현 |
| `Clone` | `duplicate` + postprocess | R | 참조 remap, 스크립트 상태, Archivable |
| `Destroy` | `queue_free` 래퍼 | R | 지연 해제·이벤트 disconnect·참조 무효화 |
| `Get/SetAttribute` | metadata + signal | A | 허용 타입·변경 이벤트 |
| `GetPropertyChangedSignal` | property observer | R | 속성 변경 알림 및 시점 |
| `CollectionService` tags | SceneTree groups | A | 태그 이벤트·복제 범위 |

### 3.3 월드·물리·캐릭터

| Roblox API / 속성 | Godot 후보 | 등급 | 차이 및 대응 |
|---|---|---|---|
| `Part.Position/CFrame` | `Node3D.transform` | A/R | Anchored / 물리 동적 객체를 분기 |
| `Part.Size` | Mesh + CollisionShape | A | shape 재생성, pivot, nonuniform scale |
| `Anchored` | StaticBody3D 또는 freeze | R | 런타임 변경과 충돌 동작 |
| `CanCollide/CanTouch/CanQuery` | collision layer/mask + area | R | 세 속성의 독립성 유지 |
| `Touched/TouchEnded` | Area3D / contact monitor | R | 물리 step·접촉 중복·필터 차이 |
| `AssemblyLinearVelocity` | RigidBody3D.linear_velocity | A | 질량·좌표 단위·서버 권한 |
| `ApplyImpulse` | `apply_impulse` | A | 기준점·질량·단위 변환 |
| `Workspace:Raycast` | PhysicsDirectSpaceState3D | A | 필터, exclude, material, 결과 |
| `OverlapParams` / spatial queries | shape query | A/R | 필터 방식·결과 순서 |
| `HingeConstraint` | HingeJoint3D | R | limits/motor/solver 오차 |
| `WeldConstraint` | 고정 joint / 계층 | R | assembly 질량·힘 전달 차이 |
| `Humanoid:MoveTo` | navigation + CharacterBody3D | R | pathfinding, 상태 전이, timeout |
| `Humanoid.Jump` | custom controller | R | 점프 높이·중력·상태 이벤트 |
| `Humanoid.Health` | health component | R | 사망·respawn·이벤트 연계 |
| `PathfindingService` | NavigationServer3D | R | agent size, navmesh, dynamic obstacle |
| `RunService.Heartbeat` | process/physics callback | A/R | 시간 기준·이벤트 순서 다름 |
| `RunService.RenderStepped` | `_process` + ordering | A/R | 클라이언트 렌더 전 시점 보장 어려움 |

### 3.4 이벤트·입력·UI·애니메이션

| Roblox API | Godot 후보 | 등급 | 차이 및 대응 |
|---|---|---|---|
| `RBXScriptSignal:Connect` | `Signal.connect` | A | connection 객체, disconnect, lifetime |
| `RBXScriptSignal:Wait` | `await signal` | A/R | 스케줄러 및 반환값 차이 |
| `task.wait` | `SceneTreeTimer` | A/R | 프레임 경계, duration, yield semantics |
| `task.spawn/defer/delay` | custom task queue | R | 실행 우선순위·오류·취소 |
| `TweenService:Create` | `create_tween` | A | easing enum, 반복·취소·동시 변경 |
| `UserInputService` | InputEvent | A/R | 터치·키보드·게임패드, focus |
| `ContextActionService` | InputMap + action router | R | 우선순위·consume/sink |
| `ScreenGui` | CanvasLayer | A | ResetOnSpawn, display order |
| `Frame/TextLabel/ImageLabel` | Control 계열 | A | 자동 레이아웃·텍스트 측정 |
| `AnimationTrack` | AnimationPlayer/Tree | R | rig/bone mapping, priority, blending |
| `Motor6D` | Skeleton3D/BoneAttachment3D | R | 리깅·joint transform 의미 |

### 3.5 네트워크·플랫폼

| Roblox API | Godot / 외부 구현 | 등급 | 차이 및 대응 |
|---|---|---|---|
| `Players.PlayerAdded` | PlayerManager signal | R | 접속·캐릭터·소유권 생명주기 |
| `ReplicatedStorage` | shared asset registry | R | 원본의 자동 복제와 동일하지 않음 |
| `RemoteEvent:FireServer` | client→server RPC | R | 인증·인자 직렬화·권한 검증 |
| `RemoteEvent:FireClient` | server→client RPC | R | 대상 선택·전송 보장/순서 |
| `RemoteFunction:InvokeServer` | request/response RPC | R | yield, timeout, 오류 전달 |
| `SetNetworkOwner` | authority assignment | R | 물리 예측·서버 reconciliation |
| `StreamingEnabled` | custom streaming | R | 동적 로딩·참조·범위 관리 |
| `DataStoreService` | DB/backend | X | 키·쿼터·트랜잭션·계정 모델 |
| `MemoryStoreService` | Redis 등 | X | TTL·정렬·분산 동기화 |
| `MessagingService` | message broker | X | cross-server pub/sub |
| `TeleportService` | session/matchmaker | X | 장소 전환·사용자 세션 |
| `MarketplaceService` | 플랫폼별 결제 | X | 상품 ID·구매·영수증·규정 |
| `HttpService` | HTTPRequest + JSON | A | 보안·권한·비동기 차이 |
| `AssetService` / asset ID | asset resolver | X | 소유권·접근권한·라이선스 |

## 4. 왜 API 이름 매핑만으로 부족한가

### 4.1 의미 보존의 최소 단위는 함수가 아니라 실행 컨텍스트

다음 코드는 `Position`의 이름을 바꾸는 것만으로는 정확히 변환되지 않는다.

```lua
local part = script.Parent
local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function(dt)
    part.Position += Vector3.new(5 * dt, 0, 0)
end)
```

변환기는 (1) `script.Parent`가 `Part`인지, (2) Anchored인지, (3) 서버/클라이언트 중 어디서 실행되는지, (4) Heartbeat 타이밍을 어디에 연결할지, (5) 좌표 및 단위를 어떻게 변환할지, (6) 다른 코드가 동일한 객체를 쓰는지 판단해야 한다. 특히 동적 RigidBody3D를 매 프레임 transform으로 움직이면 물리 시뮬레이션 결과가 달라진다.

### 4.2 Luau 언어 의미 차이

- **테이블:** 배열+해시 혼합, 1-based 인덱스, nil 제거, 참조 동일성, metatable.
- **함수:** 다중 반환, varargs, closure capture, dynamic method lookup, colon-call의 `self`.
- **모듈:** `require` 결과 캐싱과 실행 컨텍스트별 상태 공유.
- **스케줄링:** `task.spawn`, `task.defer`, `task.wait`, signal callbacks, coroutine의 실행 순서.
- **타입:** 정적 Luau 타입은 실행 시점에 제거될 수 있으므로 타입 추론 실패 시 동적 fallback 필요.

대응: Luau AST를 typed IR로 낮추고 각 노드를 `native / adapter / VM / unsupported`로 분류한다. 동적 호출·metatable 의존이 높은 모듈은 Luau VM 유지가 현실적이다. VM 경로에도 Roblox API 객체를 Godot 객체에 바인딩하는 별도 bridge가 필요하다.

### 4.3 객체 생명주기 및 이벤트

Godot `queue_free()`는 지연 해제이고 Roblox `Destroy()`는 연결 해제와 부모 관계 등 별도의 의미가 있다. `Clone()`은 내부 참조 remap이 필요하다. Godot의 Node 이름과 Roblox의 `Name`은 동명 자식·이름 제약에서 다르다. **원본 Instance ID와 Name을 별도 레지스트리에 저장**하고 Node는 구현 세부사항으로 취급한다.

### 4.4 물리와 네트워크

동일 API를 구현해도 엔진 solver, substep, collision filtering, sleep/wake, constraint motor 및 network ownership이 다르면 동작이 달라진다. 목표를 '수치 동일성'보다 **게임플레이 관측 동등성**으로 정의해야 한다. 단, 정밀 물리 퍼즐은 엔진 차이 자체가 게임성을 바꿀 수 있어 별도 물리 엔진 이식 또는 수동 튜닝이 필요하다.

## 5. 권장 아키텍처

```text
Roblox Place / Model / Rojo
    ↓
File Importer (rbx-dom / XML / Rojo)
    ↓
Reflection + Asset Resolver + Luau AST Parser
    ↓
Typed Roblox IR
  - Instance graph / property types / references
  - scripts / source spans / execution contexts
  - services / events / dependency graph
  - asset manifest / diagnostics
    ↓
Semantic Analyzer + Capability Registry
    ├── Native GDScript Generator
    ├── Compatibility API Generator
    ├── Luau VM Bridge (optional)
    └── Unsupported/External Service Stubs
    ↓
Godot Scene/Resource/Script Export
    ↓
Headless Import + Static Tests + Runtime Tests
    ↓
Conversion Report / Diff / Remediation Plan
```

**매핑 테이블은 단순 `old_name → new_name`이 아니라 다음 필드를 가져야 한다.**

```yaml
source:
  class: BasePart
  member: Position
  kind: property
  type: Vector3
context:
  requires_parent_type: true
  requires_physics_state: true
  server_client_sensitive: true
target:
  strategy: adapter
  getter: RobloxPartCompat.get_position
  setter: RobloxPartCompat.set_position
transforms:
  coordinate_basis: roblox_to_godot
  unit_policy: project_scale
validation:
  fixtures: [anchored_move, dynamic_body_move, parent_transform]
  tolerance_position_m: 0.01
fallback: runtime_warning
```

## 6. 실행 모드 비교

| 방식 | 사용 대상 | 장점 | 위험 |
|---|---|---|---|
| Native GDScript | 정적 타입·단순 로직 | Godot 유지보수 용이 | Luau 언어 의미 손실 |
| Adapter GDScript | Instance / Tween / Raycast 등 | 원본 API 구조 보존 | 호환 계층 유지 비용 |
| Luau VM | metatable·동적 모듈·복잡한 coroutine | 언어 의미 보존 유리 | 엔진 브리지·웹 export·디버깅 부담 |
| External service | DataStore·결제·세션 | 플랫폼 독립 | 운영·보안·비용 |

**권장 정책:** 우선 스크립트 단위로 실행 모드를 결정한다. 함수 단위로 VM과 GDScript를 섞으면 참조 동일성, GC, callback, yield 경계가 급격히 복잡해진다.

## 7. 구조적 차이 대응의 우선순위

1. **P0 — 파싱/정적 씬:** RBXLX/RBXMX/Rojo, 기본 Instance, Part, Model, Transform, 메시·재질.
2. **P1 — 언어/객체:** Luau AST, Instance 레지스트리, CFrame, Signal, task, Tween.
3. **P2 — 게임플레이:** Humanoid, Raycast, Touched, UI, Animation, Constraint.
4. **P3 — 멀티플레이:** PlayerManager, RemoteEvent, authority, state replication, physics reconciliation.
5. **P4 — 플랫폼 서비스:** DataStore, Teleport, Marketplace 등은 독립 백엔드와 제품 정책 결정 후 구현.

게임 종류에 따라 우선순위를 조정한다. 오비(Obby)는 캐릭터·충돌·체크포인트가 중요하고, 타이쿤은 UI·저장·구매가 중요하며, 물리 샌드박스는 joint/solver가 병목이다.

## 8. 자동 검증 전략

- **구문 검증:** 변환된 GDScript 파싱 및 Godot headless import.
- **구조 검증:** Instance 수, 클래스 분포, 계층, 참조, 속성 비교.
- **동작 검증:** 동일 입력 시나리오로 위치·속도·상태·이벤트 로그 비교.
- **시각 검증:** 동일 카메라·해상도에서 스크린샷 비교(텍스처·라이팅 허용오차).
- **네트워크 검증:** 2~4 클라이언트 접속, 소유권 변경, 재접속, 지연·패킷 손실 테스트.
- **진단 완전성:** 변환되지 않은 API와 속성을 누락 없이 보고.

```json
{
  "script": "ServerScriptService/MovingPlatform",
  "strategy": "adapter",
  "mapped_calls": 12,
  "unsupported_calls": 1,
  "diagnostics": [
    {"severity": "warning", "api": "SetNetworkOwner", "reason": "requires multiplayer authority runtime"}
  ],
  "tests": {"parse": "pass", "scene_import": "pass", "behavior": "not_run"}
}
```

### 지표

`API coverage = supported distinct API usages / observed distinct API usages`  
`Script compile rate = compiling generated scripts / generated scripts`  
`Behavior pass rate = passed behavior assertions / executed assertions`  
`Unreported unsupported count = unsupported usages without diagnostic` (목표 0)

API coverage가 높아도 핵심 게임 루프가 실패할 수 있으므로 **행동 테스트 통과율을 별도 핵심 KPI**로 관리한다.

## 9. PoC 실행 계획 (4~8주 가설)

| 단계 | 산출물 | 수용 기준 |
|---|---|---|
| 1. 입력 | RBXLX/RBXMX + Rojo importer, IR JSON | 테스트 픽스처의 트리/속성 재현 |
| 2. 출력 | `.tscn`, `.gd`, `.tres`, `project.godot` | Godot headless import 통과 |
| 3. 코드 | Luau AST 변환, API registry, diagnostics | 기본 문법 테스트 통과 |
| 4. 런타임 | Instance/Signal/task/CFrame/Tween | 단순 이동·이벤트 게임 실행 |
| 5. 비교 | 구조/로그/스크린샷 diff | 지정된 행동 assertion 통과 |
| 6. 확장 | Humanoid/physics/network spike | 난점별 비용·오차 측정 |

### 대표 테스트 프로젝트

1. **Moving Platform:** Part/CFrame/Heartbeat/Touched.
2. **Obby:** Spawn, Humanoid, Jump, checkpoint, GUI.
3. **Physics Playground:** RigidBody, hinge, impulse, raycast.
4. **Tycoon Minimal:** 버튼, RemoteEvent, 통화, 저장 stub.
5. **Dynamic Luau:** metatable, coroutine, ModuleScript require.

### 중단·전환 기준

- 기본 씬 import가 안정적이지 않으면 스크립트 변환 확대를 보류.
- 언어 의미 차이로 GDScript 생성 비용이 높으면 해당 모듈을 VM 경로로 전환.
- 네트워크 기능은 원본과 동등한 서버 모델을 정의하기 전 자동 변환을 '성공'으로 표시하지 않음.
- 플랫폼 서비스는 백엔드가 없는 경우 명시적으로 `unsupported` 또는 `stub` 처리.

## 10. 리스크·제약

- **에셋 접근:** Place 파일에 Asset ID가 있어도 실제 바이너리 접근 권한은 별도다. 소유·라이선스·이용 약관을 확인해야 한다.
- **Roblox 내부 동작:** 공개 API 문서만으로 엔진 내부 solver·복제 타이밍을 완벽히 복원할 수 없다. 테스트로 관측·근사해야 한다.
- **버전 관리:** Roblox API dump/Reflection 및 Godot 버전에 따라 매핑이 변한다. `source_version`, `target_version`, `mapping_version`을 저장한다.
- **보안:** 임의 Luau 실행, 외부 HTTP, asset fetch, generated scripts는 sandbox 및 권한 제한이 필요하다.
- **웹 export:** GDExtension/VM과 플랫폼별 바이너리 지원, 스레드/네트워크 제한을 별도로 검증한다.
- **AI 자동 수정:** 컴파일 오류 수정에는 도움을 주지만 동작 동등성의 증거가 아니다. 테스트 기반 승인 필수.

## 11. 최종 판단

**API 매핑 테이블만으로 가능한 영역:** 수학·벡터·기본 조건/루프·정적 씬·단순 Tween·일부 UI/입력·일부 raycast.

**API 매핑 + 의미 어댑터가 필요한 영역:** CFrame, Instance, 이벤트, task, Clone/Destroy, 물리 속성, 충돌 필터, 좌표/단위, 애니메이션.

**전용 런타임이 필요한 영역:** Humanoid, 복잡한 Luau, Script/LocalScript 실행 문맥, 자동 복제, RemoteEvent, Network Ownership, Streaming.

**외부 시스템 또는 재설계가 필요한 영역:** DataStore, Marketplace, Teleport, 플랫폼 계정·상품·권한.

따라서 **'API 매핑을 중심으로 한 자동 포팅'은 가능하되, 실용적 변환기의 실제 핵심은 의미 보존 런타임과 검증 시스템**이다. 초기 제품 범위를 단일 플레이어·기본 3D 게임으로 제한하면 빠르게 유효성을 검증할 수 있다. 멀티플레이 및 Roblox 플랫폼 서비스까지 일반화하려면 독립적인 엔진·백엔드 개발 프로젝트로 다뤄야 한다.

## 12. 참고 자료

- Roblox Creator Hub — Engine API reference: https://create.roblox.com/docs/reference/engine
- Roblox Creator Hub — Client-server runtime: https://create.roblox.com/docs/projects/client-server
- Roblox Creator Hub — Luau: https://create.roblox.com/docs/luau
- Roblox Creator Hub — Physics: https://create.roblox.com/docs/physics
- Luau official source: https://github.com/luau-lang/luau
- rbx-dom: https://github.com/rojo-rbx/rbx-dom
- Rojo: https://github.com/rojo-rbx/rojo
- Godot documentation: https://docs.godotengine.org/en/stable/
- Godot source: https://github.com/godotengine/godot

> 주의: 본 보고서의 API 대응은 설계 가설이며 각 API의 세부 동작·버전별 지원 여부는 구현 시 공식 문서와 자동 테스트로 재검증해야 한다. 원본 게임 소스·에셋에 대한 접근 권한이 있다는 전제에서 기술 가능성을 평가했다.
