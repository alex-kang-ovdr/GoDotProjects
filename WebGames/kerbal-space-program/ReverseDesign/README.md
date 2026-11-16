# Kerbal Space Program 1 — 시스템별 역기획서

## 범위와 주의사항
KSP 1의 공개적으로 관찰 가능한 동작과 일반 물리 모델을 토대로 만든 **재구현 지향 역기획**이다. 내부 소스의 정확한 복원이 아니며, 엔진별 성능·부품 수치·UI 제한은 별도 게임 실측 및 버전 확인이 필요하다. KSP 2와 혼합하지 않는다.

## 핵심 게임 루프
```mermaid
flowchart LR
 A[임무/목표 선택] --> B[기체 조립]
 B --> C[발사 및 조종]
 C --> D[궤도/탐사]
 D --> E[착륙/회수]
 E --> F[과학/자금/기술]
 F --> B
```

## 문서 목록
- [전체 구조와 구현 로드맵](00_INDEX.md) — 게임 루프, 시스템 의존성, 설계 범위
- [게임 모드와 진행](01_GAME_MODES.md) — Sandbox, Science, Career, 난이도 설정
- [VAB·SPH 조립 편집기](02_VEHICLE_EDITOR.md) — 부품 카탈로그, 루트, 노드·표면 부착, 대칭, 정렬, 실행취소
- [부품 및 모듈 데이터](03_PARTS_AND_MODULES.md) — 질량, 비용, 열, 충돌, 부착 노드, PartModule
- [스테이징과 분리](04_STAGING.md) — 스테이지 순서, 디커플러, 엔진 점화, 액션 그룹
- [연료·전력·자원 흐름](05_RESOURCE_FLOW.md) — LiquidFuel, Oxidizer, MonoPropellant, ElectricCharge, Crossfeed
- [강체·관절·충돌 물리](06_RIGID_BODY_PHYSICS.md) — 질량·관성·힘·토크·조인트·접촉·파손
- [추진·엔진·추력](07_PROPULSION.md) — 추력 곡선, ISP, 연료 소모, 짐벌, 고체/액체 엔진
- [공기역학과 대기권](08_AERODYNAMICS.md) — 항력, 양력, AoA, 동압, 실속, 페어링
- [중력과 궤도역학](09_ORBITAL_MECHANICS.md) — 케플러 요소, Vis-viva, 궤도 상태벡터, 시간 전파
- [SOI·Patched Conics](10_PATCHED_CONICS.md) — 천체 계층, 영향권, 궤도 패치, 전이 예측
- [기동 노드와 Δv](11_MANEUVER_NODES.md) — Prograde, Normal, Radial, Burn Time, 전이 계획
- [비행 조종·SAS·RCS](12_FLIGHT_CONTROL.md) — 입력 축, PID, 반작용 휠, RCS, 짐벌, 자동 조향
- [Navball·HUD·지도 UI](13_NAVBALL_UI.md) — 속도 기준계, 자세 표시, 마커, 고도계, 궤도 지도
- [착륙·지상 이동](14_LANDING_AND_GROUND.md) — 랜딩기어, 바퀴, 마찰, 서스펜션, 착륙 판정
- [열·파손·폭발](15_THERMAL_AND_DAMAGE.md) — 전도, 대류, 복사, 재진입 가열, 충격 허용치
- [승무원·EVA·생존](16_CREW_AND_EVA.md) — Kerbal 역할, 탑승, EVA, 제트팩, 경험
- [과학·연구·기술 트리](17_SCIENCE_TECH.md) — 실험, 상황·생물군계, 전송, 회수, 기술 해금
- [계약·자금·평판](18_CAREER_ECONOMY.md) — 계약 생성, 목표 검증, 보상, 비용, 시설 업그레이드
- [천체·행성·환경](19_CELESTIAL_BODIES.md) — 천체 계층, 반경, μ, 자전, 대기, 지형, 생물군계
- [시간 가속과 시뮬레이션 LOD](20_TIME_WARP.md) — 물리 가속, 레일 워프, 워프 제한, 복귀
- [세이브·로드·기체 지속성](21_PERSISTENCE.md) — Craft 파일, 세이브 상태, 퀵세이브, 복구
- [카메라·씬·UX](22_CAMERA_AND_SCENES.md) — 에디터, 발사장, 추적소, 우주센터, 지도 전환
- [튜토리얼·실패 피드백](23_TUTORIAL_AND_FAILURE.md) — 발사 실패, 구조 붕괴, 재시도, 학습 루프
- [재구현 기술 아키텍처](24_TECHNICAL_ARCHITECTURE.md) — ECS/객체모델, 틱, 결정론, 좌표계, 부동소수점
- [테스트·밸런싱·검증](25_TEST_PLAN.md) — 단위 테스트, 회귀, 시나리오, 성능, 수치 오차
- [JavaScript 웹 프로토타입 계획](26_WEB_PROTOTYPE_PLAN.md) — Canvas/WebGL, 상태 관리, 시뮬레이션 단계, MVP


## 우선순위
P0: 조립·부품·연료·엔진·스테이징·중력·강체·비행 UI.
P1: 공력·궤도 예측·SOI·기동 노드·워프·착륙.
P2: 과학·커리어·승무원·고급 열·시설·튜토리얼.

## 기술 검증 체크포인트
- 연료 감소에 따른 총질량·관성·Δv 변화가 일치하는가?
- 분리 후 각 기체의 질량·속도·자원 소유권이 유지되는가?
- 중력만 작용하는 2체 궤도에서 에너지·각운동량 오차가 허용 범위인가?
- SOI 전환 시 절대 위치와 속도에 불연속이 없는가?
- 시간 워프 후 정상 속도로 돌아왔을 때 기체 상태가 일관되는가?
