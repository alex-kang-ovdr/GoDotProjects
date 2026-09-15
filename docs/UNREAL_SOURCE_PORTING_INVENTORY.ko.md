# Unreal BallSimulator 원본 인벤토리

## 고정된 참조

- 저장소: `E:\EpicGamesSamples\UnrealSamples`
- 원본 worktree: `E:\EpicGamesSamples\UnrealSamples\.worktrees\ball-simulator-example`
- 검증 날짜: 2026-09-15
- 원격/로컬 기준: `origin/codex/ball-simulator-example`
- 커밋: `9667ffa334bce4b828dcf45f26e894e6317ece7a` — `[SimBall] Add RHI bounded event synchronization test`

원본 헤더에는 저작권 고지가 있다. 이 문서는 구조와 테스트 계약을 기록할 뿐, 원본 구현을 Godot 저장소로 복사하는 권한을 뜻하지 않는다. 구현을 이식하기 전에 라이선스·소유권·재배포 허용 범위를 확인한다.

## 포팅 기준 소스

### 플러그인 코어

- `Plugins/BallSimulator/BallSimulator.uplugin`
  - Unreal 플러그인 모듈 선언. Godot에서는 `.gdextension`과 선택적 `plugin.cfg`로 대체한다.
- `Plugins/BallSimulator/Source/BallSimulator/Public/BallSimulator/BallSimulatorComponent.h`
  - 입력, 스냅샷, 바운스, 재생 프레임, 동기화 데이터의 공개 계약을 정의한다.
  - Godot 대상: `BallSimulationParameters`, `BallState`, `BallBounceEvent`, `BallTrajectory`, `BallSimulationFrame` 값 타입.
- `Plugins/BallSimulator/Source/BallSimulator/Private/BallSimulator/BallSimulatorComponent.cpp`
  - 시뮬레이션, 재시뮬레이션, 스냅샷 압축·조회, replay, 충돌 조회 연결, 회전/구름 처리의 중심 구현이다.
  - Godot 대상: 수치 코어와 `PhysicsDirectSpaceState3D` 어댑터로 분리한다.
- `Plugins/BallSimulator/Source/BallSimulator/Private/BallSimulator/ParticleSolver.h/.cpp`
  - 마찰/반발 임펄스, 관통 회복, 2평면 접촉 회복을 담당한다.
  - Godot 대상: `core/collision_response.*`. 엔진 자료형·로그·월드 포인터를 제거한 뒤 단위 테스트 우선으로 이식한다.
- `Plugins/BallSimulator/Source/BallSimulator/Private/BallSimulatorModule.cpp`
  - Unreal 모듈 부트스트랩. Godot 대상에서는 GDExtension 초기화 등록으로만 대체한다.

### 예제 계층과 네트워크

- `Source/BallSimulatorExample/Public/LuaSimulationBall.h`
- `Source/BallSimulatorExample/Private/LuaSimulationBall.cpp`
- `Source/BallSimulatorExample/Public/LuaBallTypes.h`

이 계층은 플러그인 코어의 소비자이자 UE 복제 샘플이다. Godot의 최종 공개 API는 이 이름이나 UE 타입을 유지하지 않는다. 다만 `simulate`, `resimulate`, `play`, `pause`, `stop`, revision, snapshot·bounce 전달의 의미는 API와 멀티플레이 테스트 설계에 반영한다.

## 보존해야 할 데이터 계약

### 입력

- 공 질량·반지름·마찰·탄성·관성 계수
- 초기 위치·회전·방향·선속도
- 스핀 축·각속도, 중력, step 간격, step 수
- 정적/동적 충돌 사용 여부와 충돌 필터

### 매 스냅샷

- 전역 snapshot index와 playback time
- 위치·회전·방향·선속도·각속도/스핀
- 접촉 수와 resting frame 수
- 마지막 접촉 법선 및 해당 step의 모든 바운스/슬라이딩 접촉

### 매 바운스

- snapshot index, 충돌 전후 시간·속도·방향·각속도
- 충돌 후 위치·회전, 충돌 법선/접촉 정보
- bounce/slide 분류와 법선·접선 임펄스, 관통 회복 진단값

Godot의 공개 단위는 m, s, kg, rad/s다. UE 레퍼런스의 cm 값은 변환 테스트를 거쳐 사용하며, UE Z-up과 Godot Y-up 변환은 API 경계 한 곳으로 제한한다.

## 원본 기능의 이식 분류

### 1차 이식: 필수

- 고정 step 궤적과 스냅샷 생성
- 연속 구체 충돌, 반발·마찰·스핀·구름 처리
- 단일/다중 바운스 이벤트와 snapshot index 조회
- 주어진 시간의 상태, 속도, 다음/이전 바운스 조회
- 재시뮬레이션과 스냅샷 압축의 Godot 독립 표현

### 2차 이식: Godot 방식으로 대체

- `UActorComponent`/Blueprint API → GDExtension `BallSimulator3D` Node 및 GDScript façade
- `UWorld` sweep, UE collision channel → `PhysicsDirectSpaceState3D`와 Godot collision layer/mask
- UE spline 생성 → `Curve3D` 또는 소비자 제공 렌더링 코드
- UE DrawDebugString → 데모 씬의 `ImmediateMesh`/Label3D 디버그 뷰
- UE replicated property/RPC → Godot `MultiplayerAPI`의 서버 권위 명령과 상태 snapshot

### 보류 또는 제외

- Dynamic collision re-simulation: 공유 대화에서 기능 폐기 이력이 있으므로 1차 범위에서 제외한다.
- 복잡한 메시·움직이는 collider의 결정론적 동기화: 고정 월드·정적 collider 결과가 안정된 뒤 별도 범위로 검토한다.
- 원본 생성 파일, UE 빌드 산출물, UE 에디터 전용 UI: 포팅하지 않는다.

## 이식해야 할 테스트 계약

### 물리 회귀

- `SimulationBallTestScenario.cpp`: API와 기본 시뮬레이션 자동 테스트의 기준
- `SportsBallTestScenario.cpp`: 스포츠 파라미터 매트릭스, 당구형 관통 방지, 128개 공 성능 결과
- 벽 두께 1/5/10cm, 30/60Hz, 마찰·탄성·속도·스핀·반지름·질량 조합

### 이벤트·멀티플레이

- `BallTestGameMode.cpp`: 서버/클라이언트 bounce 이벤트의 순서, snapshot index, time, position 비교
- `BallPIETests.cpp`: 다중 클라이언트 실행의 자동화 진입점
- `BallTestEnvironment.cpp`: 명령행 모드, many-bounce 환경 설정
- 2인 bounded event 비교를 최소 기준으로 이식하고, 6인·순차 난입·최대 3인 경합은 후속 게이트로 확장한다.
- 지연/손실 조건은 Godot 테스트 전송 계층에서 명시적으로 주입한다. 엔진 기본 로컬 연결만으로 네트워크 손실을 가정하지 않는다.

## 자료 추출 순서

1. 위 커밋에서 공개 struct와 API 시그니처를 JSON 스키마로 옮긴다.
2. 정적 월드 단일 충돌, 구름, 다중 바운스의 입력/기대 스냅샷을 골든 데이터로 만든다.
3. 이 데이터로 Godot 이전의 순수 C++ 코어를 검증한다.
4. 동일 데이터로 Godot 충돌 어댑터의 차이를 별도 기록한다.
5. 물리 결과가 안정된 뒤에만 multiplayer revision·RPC 검증을 추가한다.
