# KSP 핵심 기술 상세 문서 인덱스

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 문서 목적
기존 시스템별 역기획서의 개괄 설명을 보강하는 **엔진 구현 중심** 기술 문서 모음이다. 원작 플레이 관찰로 확인 가능한 기능과 독립적인 재구현 제안을 구분한다. 수치 상수/소스 코드/실제 솔버 구조는 원작 내부 구현의 사실 주장으로 사용하지 않는다.

## 파일 목차
| 파일 | 주요 내용 |
|---|---|
| 00_ARCHITECTURE.md | loaded/packed, fixed tick, 상태 소유권, 좌표계 |
| 01_PART_GRAPH_EDITOR.md | 부착 트리, 스냅, 대칭, COM, Undo |
| 02_RIGID_BODY_JOINTS.md | 강체, 조인트, 파괴, 분리, 운동량 |
| 03_PROPULSION_RESOURCES.md | 엔진, ISP, 자원 네트워크, 스테이징 |
| 04_ORBITAL_SOLVER.md | 상태벡터, 케플러, 쌍곡선, SOI |
| 05_MANEUVER_PLANNER.md | 기동 노드, 국소 기저, Δv, burn time |
| 06_FLIGHT_CONTROL.md | SAS, 쿼터니언 PD, RCS, Reaction Wheel |
| 07_AERO_THERMAL_LANDING.md | 공력, 열, 낙하산, 착륙 |
| 08_TIMEWARP_PERSISTENCE.md | warp, pack/unpack, 저장 스키마 |
| 09_VALIDATION_PERFORMANCE.md | 수치 검증, 자동 테스트, 성능 |

## 권장 구현 모듈
`math/`, `celestial/`, `orbit/`, `vessel/`, `parts/`, `physics/`, `resources/`, `flight-control/`, `prediction/`, `editor/`, `ui/`, `save/`, `tests/`.

## 구현 시 우선 결정할 사안
- 2D MVP인가 3D 전체 구현인가
- Havok/Chaos/자체 물리 중 어느 solver인가
- 원작 KSP 유사성 우선인가 실제 물리 정확성 우선인가
- 시뮬레이션 단위, 정밀도, SOI 모델, fixed timestep
- 조립 그래프의 트리/추가 간선 처리 정책

## 라이선스/범위
게임 시스템에 대한 기술적 분석이며 원작 게임의 코드/에셋을 포함하지 않는다. 배포용 구현은 자체 코드·아트·사운드를 사용한다.
