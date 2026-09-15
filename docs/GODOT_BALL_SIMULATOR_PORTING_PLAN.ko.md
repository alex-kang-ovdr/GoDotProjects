# Godot Ball Simulator 포팅 개발 계획

> 아키텍처·기능 요구·데이터 흐름·클래스 구조는 `GODOT_BALL_SIMULATOR_GDD.ko.md`를 기준으로 한다. 이 문서는 구현 순서와 검증 게이트를 관리한다.

## 1. 목적과 기준

Unreal `BallSimulator` C++ 플러그인의 **공 궤적 계산 결과와 충돌 이벤트 의미**를 Godot 4용 네이티브 플러그인으로 이식한다. 결과물은 Godot 씬에서 사용하는 API, 에디터 데모, 자동 검증을 함께 제공한다.

이번 이식은 UE 컴포넌트나 `LuaSimulationBall`의 타입을 그대로 옮기는 작업이 아니다. UE 의존성(`UObject`, `UFUNCTION`, 복제 프로퍼티, cm 단위, UE 충돌 쿼리)을 제거하고, 동등한 시뮬레이션 계약을 Godot API로 재정의한다.

현재 작업 기준은 다음과 같다.

- 작업 브랜치: `codex/godot-ball-simulator-plugin`
- 작업 트리: `D:\Github\GoDotProjects-worktrees\godot-ball-simulator-plugin`
- 현재 Godot 트리에는 `project.godot`와 `.gdextension`이 없다.
- 원본 기준은 `origin/codex/ball-simulator-example`의 `9667ffa334bce4b828dcf45f26e894e6317ece7a`로 고정했다. 원본 소스는 `E:\EpicGamesSamples\UnrealSamples\.worktrees\ball-simulator-example`에서 읽기 전용으로 확인한다.
- 구현 전에 원본의 라이선스/재사용 범위를 확인한다. 생성된 UE 바이너리·Intermediate 파일은 포팅 근거로 사용하지 않는다.

## 2. 범위

### 2.1 초기 릴리스에 포함

- 3D 구체의 중력, 발사 속도, 반발 계수, 마찰, 질량, 반지름, 회전축·각속도, 구름 전환 계산
- 고정 시간 간격 기반의 연속 충돌 처리와 다중 바운스 이벤트
- 벽·바닥·홀 충돌을 포함한 Godot 물리 공간 질의 어댑터
- GDExtension C++ 코어와 GDScript에서 쓰는 얇은 `BallSimulator3D` API
- 실행 가능한 데모 씬, CLI/헤드리스 자동 테스트, 결과 JSON·Markdown 보고서
- 서버 권한 기반의 최소 2인 동기화 검증과 지연/손실을 주입하는 테스트 전송 계층

### 2.2 후속 릴리스로 분리

- 6인 순차 난입, 최대 3인 소유권 경합, 드리블·연속 킥 시나리오
- Godot 에디터용 파라미터 프리셋·시각화·프로파일 패널
- 복잡한 메시 콜라이더, 움직이는 장애물, 플랫폼 간 bit-exact 결정성
- AssetLib 배포와 플랫폼별 사전 빌드 바이너리

이 분리는 기본 궤적의 정합성 문제와 멀티플레이 정책 문제를 섞지 않기 위한 것이다. 첫 릴리스에서 서버가 권위를 가지며, 클라이언트는 검증 가능한 동일 입력/스냅샷을 재생한다.

## 3. 포팅 전 사양 고정

### 3.1 원본 인벤토리

고정한 원본 소스 커밋을 읽기 전용 checkout으로 사용하고 다음을 표로 매핑한다. 실제 파일과 분류는 `UNREAL_SOURCE_PORTING_INVENTORY.ko.md`에 기록한다.

- 공개 입력: 위치, 선형 속도, 스핀, 질량, 반지름, 마찰, 탄성, 중력, 시작 시각
- 상태: 위치, 선형/각속도, 정지·구름 상태, 누적 시간, 스냅샷 인덱스
- 이벤트: 충돌, 바운스, 홀 진입, 정지. 각 이벤트의 시간·위치·법선·속도·순서를 기록한다.
- 해법: 적분식, substep 정책, 충돌 시간 계산, 반사/마찰/회전 처리, epsilon과 최대 반복 횟수
- 엔진 의존부: 충돌 질의, 디버그 표시, 에디터 UI, 복제/RPC, 테스트 코드

원본의 각 공개 기능은 `유지`, `Godot 방식으로 대체`, `제외` 중 하나로 명시한다. 이 문서와 테스트 케이스는 코드 생성 전에 리뷰한다.

### 3.2 좌표와 단위 계약

- Godot 공개 API는 미터(m), 초(s), kg, rad/s를 사용한다.
- UE 레퍼런스 데이터는 cm에서 m로 변환한다. 좌표축은 UE의 Z-up과 Godot의 Y-up 차이를 명시적 변환 함수 한 곳에서만 처리한다.
- 시뮬레이터 내부는 `double`을 우선 사용하고, Godot `Vector3` 경계에서만 변환한다.
- 모든 비교는 절대/상대 오차와 시간 오차를 분리해 기록한다. 시간 오차 0.20~0.50초는 경고, 0.50초 초과는 실패라는 기존 기준을 기본값으로 두되, 실제 물리 이벤트 순서·방향·위치가 다르면 시간 오차가 작아도 실패로 판정한다.

## 4. 목표 구조

```text
addons/ball_simulator/
  ball_simulator.gdextension       # 플랫폼별 GDExtension 로더
  bin/                             # 빌드 산출물(배포 시 포함)
  src/
    core/                          # Godot 비의존: 수치 적분, 충돌 반응, 이벤트 생성
    godot/                         # GDExtension 바인딩, PhysicsDirectSpaceState3D 어댑터
    tests/                         # 코어 단위/회귀 테스트
  scripts/
    ball_simulator_3d.gd           # 사용 편의용 GDScript façade
  plugin.cfg / plugin.gd           # 선택적 에디터 도구 등록
demos/ball_simulator_lab/          # 파라미터·이벤트·궤적을 눈으로 확인하는 Godot 프로젝트
tests/                             # 헤드리스 통합·멀티플레이·성능 테스트
docs/                              # API, 포팅 매핑, 테스트 결과
```

핵심 원칙은 **수치 코어가 Godot 물리/네트워크 클래스에 직접 의존하지 않는 것**이다. `CollisionWorld` 인터페이스를 통해 Ray/Shape sweep, 표면 법선, 재질 계수만 받는다. Godot 구현과 테스트용 고정 월드 구현이 같은 인터페이스를 사용하므로, 엔진 물리의 변동과 계산식 회귀를 분리할 수 있다.

공개 API의 최소 형태는 다음과 같다.

- `BallSimulationParameters`: 초기 transform, 선형·각속도, 질량, 반지름, 마찰, 탄성, 시간 간격
- `BallSimulator3D.simulate(parameters) -> BallTrajectory`
- `BallSimulator3D.resimulate(from_snapshot, parameters) -> BallTrajectory`
- `BallTrajectory.get_state_at(time) -> BallState`
- `BallTrajectory.get_events() -> Array[BallEvent]`
- `ball_bounced`, `ball_entered_hole`, `ball_stopped` 신호. 각 이벤트에는 `snapshot_index`, `simulation_time`, `position`, `normal`을 포함한다.

`simulate`, `resimulate`, `play`, `pause`, `stop`은 프레임마다 보내는 상태가 아니라 순서가 보장돼야 하는 명령이다. 멀티플레이 계층은 이 명령을 reliable RPC로 전달하고, 물리 결과의 최종 권한은 서버에 둔다.

## 5. 단계별 실행 계획

### 단계 A — 기반과 사양 승인

1. Godot 4.x 고정 버전, 지원 OS/CPU, GDExtension 빌드 도구, 배포 방식(CMake 또는 SCons)을 결정한다.
2. 현재 워크트리를 독립 Godot 플러그인/데모 프로젝트로 초기화한다. 기존 Captain Salvage 웹 프로토타입 파일은 포팅 산출물과 섞지 않는다.
3. 원본 소스 커밋·라이선스·레퍼런스 테스트 데이터를 고정하고, API/수식/이벤트 매핑 문서를 작성한다.
4. 단위·좌표 변환과 허용 오차를 테스트 데이터와 함께 승인한다.

완료 기준: 빈 Godot 프로젝트가 헤드리스로 실행되고, Windows Debug 빌드에서 GDExtension을 로드하며, 원본 기능 매핑에 미결 항목이 없다.

### 단계 B — 결정론적 C++ 코어

1. `BallState`, `BallParameters`, `BallEvent`, `BallTrajectory` 값 타입과 JSON 직렬화를 구현한다.
2. 중력·공기 저항(원본에 있을 때만)·선형 적분·회전 감쇠·구름 전환을 구현한다.
3. swept-sphere 충돌 시간 계산, 접촉 법선 반사, 반발·마찰·스핀 결합, 잔여 시간 재적분을 구현한다.
4. 최대 substep/충돌 반복 수와 epsilon을 파라미터화하고, 상한 도달 시 진단 이벤트를 남긴다.
5. 고정 평면·상자·홀로 이루어진 테스트 월드에서 원본 골든 데이터와 비교한다.

완료 기준: 충돌 없는 포물선, 단일 벽 반사, 구름, 홀 진입, 반복 바운스가 단위 테스트를 통과한다. 충돌 루프는 동일 시각에서 무한 반복하지 않으며, 위치 관통/경계 이탈을 검출한다.

### 단계 C — Godot GDExtension과 데모

1. `godot-cpp` 바인딩, `BallSimulator3D` Node, Resource 기반 파라미터와 신호를 등록한다.
2. Godot 물리 공간에 대한 `CollisionWorld` 어댑터를 구현한다. 레이어·마스크·재질별 마찰/탄성·홀 collider 규약을 문서화한다.
3. `ball_simulator_lab` 데모에 발사기, 벽, 울퉁불퉁한 바닥, 홀, 이벤트 타임라인, 서버/클라이언트 색상 구분 디버그 라인을 넣는다.
4. 30/60 FPS 렌더링과 독립적인 고정 물리 tick을 검증한다.

완료 기준: 에디터와 헤드리스에서 같은 입력으로 궤적과 이벤트 수가 일치한다. 데모에서 마찰, 탄성, 속도, 스핀, 축, 반지름, 질량을 조절할 수 있다.

### 단계 D — 물리 회귀·침투·성능

1. 야구·축구·골프·배구·핸드볼 파라미터 조합을 데이터 파일로 정의한다.
2. 벽 두께 0.01/0.05/0.10m, 30/60Hz, 10초 시뮬레이션, 30/100/200km/h 발사 시나리오를 자동화한다.
3. 당구형 다중 벽·홀 반복 충돌에서 각 `snapshot_index/time/position`과 관통 깊이·경계 이탈을 검사한다.
4. 128개 공의 배치 계산을 warm-up 후 중앙값/p95로 측정한다. 성능 목표는 같은 운영체제·CPU·빌드 모드에서 원본 측정 조건과 맞춘 뒤 확정한다.

완료 기준: 모든 테스트가 JSON으로 재현 가능하고, 실패는 입력값·이벤트 인덱스·시간·위치·침투 깊이를 남긴다. 원본의 수치를 Godot에서 그대로 목표치로 선언하지 않고 동일 측정 환경의 기준선을 먼저 만든다.

### 단계 E — 멀티플레이 동기화

1. 서버 권위 `BallSimulationReplicator`를 만들고, 명령에 단조 증가 `revision`과 입력 hash를 부여한다.
2. reliable 명령 RPC와 최신 상태 스냅샷을 분리한다. 클라이언트는 누락/순서 역전 revision을 감지해 full snapshot을 요청하고, 오래된 명령은 멱등적으로 무시한다.
3. 먼저 2인 서버/클라이언트에서 각 바운스의 snapshot index·time·position을 비교하고, RHI/렌더링 여부와 무관하게 헤드리스로도 검사한다.
4. 테스트 전송 계층으로 정상, 100ms/5%, 250ms/15% 지연·손실을 주입한다. Godot의 일반 로컬 실행만으로 네트워크 손실을 가정하지 않는다.
5. 2인 기준이 안정된 뒤 6인 순차 난입, 최대 3인 경합, 드리블·연속 킥을 확장한다.

완료 기준: 서버와 클라이언트의 사건 순서, 방향, 위치, 바운스 횟수, revision/hash가 일치한다. 경고 시차 안이라도 사건 순서나 방향이 달라지면 실패하며, 문제 발생 시 서버/클라이언트 입력 세대가 같은지 먼저 증명한다.

### 단계 F — 배포 준비

1. 설치, 지원 버전, C++/GDScript API, 단위·좌표, 콜라이더·재질 규약, 멀티플레이 권한 모델을 문서화한다.
2. Windows 우선 사전 빌드를 만들고, Linux/macOS 지원 여부와 재현 가능한 빌드 절차를 명시한다.
3. API 예제, 데모, 전체 테스트 명령, 최신 결과 보고서를 포함한 릴리스 체크리스트를 작성한다.

완료 기준: 깨끗한 Godot 프로젝트에 `addons/ball_simulator`를 추가해 데모와 헤드리스 테스트를 재현할 수 있다.

## 6. 검증 게이트와 실패 판정

- **수치 게이트:** 고정 월드 골든 데이터와 위치·속도·회전·이벤트 순서를 비교한다.
- **충돌 게이트:** 반복 충돌에서 관통, 경계 이탈, 동일 tick 재충돌 무한 루프가 없어야 한다.
- **프레임 게이트:** 30/60 FPS와 고정 physics tick에서 결과가 허용 오차 안에 있어야 한다.
- **네트워크 게이트:** 이벤트 index/time/position, revision, 명령 순서가 서버 기준과 일치해야 한다.
- **성능 게이트:** 128개 공의 중앙값/p95와 allocation 수를 기록한다. 기준선보다 악화된 변화는 원인과 측정 조건을 보고한다.
- **보고 게이트:** 성공뿐 아니라 경고, 허용치 초과, 입력 세대 불일치, 재동기화 횟수를 결과 파일에 남긴다.

## 7. 주요 위험과 대응

- **원본 소스 부재/커밋 불명확:** 생성 산출물이 아니라 승인된 소스 커밋을 확보할 때까지 수식 동등성을 주장하지 않는다.
- **UE와 Godot 물리 쿼리 차이:** 수치 코어와 물리 월드 어댑터를 분리하고, 고정 월드에서는 코어만 비교한다.
- **좌표·단위 변환 오류:** 변환을 API 경계 한 곳에 제한하고, 축별 단위 테스트를 둔다.
- **프레임 의존 결과:** 렌더 delta가 아닌 고정 step과 명시적 substep 정책을 사용한다.
- **멀티플레이 false alarm:** 물리 오차를 보기 전에 revision, 입력 hash, 명령 순서, 비교 시점이 동일한지 검증한다.
- **reliable RPC 과적재:** 매 tick 전체 상태를 보내지 않고, 명령은 compact하게 전달하며 gap/late join에만 full snapshot을 사용한다.
- **성능 왜곡:** warm-up, 빌드 모드, 하드웨어, 공 수, 충돌 월드를 결과에 기록한다.

## 8. 첫 구현 단위

첫 구현 PR/커밋은 다음만 포함한다.

1. 독립 Godot 4 프로젝트 및 GDExtension 빌드 골격
2. `BallState`/`BallParameters`와 중력만 있는 순수 궤적 코어
3. 단위·좌표 변환 테스트
4. 헤드리스 테스트 명령과 빈 결과 보고서 형식
5. 원본 API·수식 매핑 문서의 초안

이 단위가 통과한 뒤에야 충돌 반응, 스핀, Godot 물리 어댑터, 네트워크를 차례로 추가한다. 이 순서는 포팅 실패를 수식 문제, 엔진 어댑터 문제, 동기화 문제 중 하나로 바로 분류할 수 있게 한다.
