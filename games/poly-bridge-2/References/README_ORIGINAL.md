# Bridge Lab v0.6 — Poly Bridge 2 inspired reconstruction

Offline HTML prototype, not an original game asset/data extraction.

## Added since v0.5
- Hydraulic member with adjustable target length (50–150%)
- Drawbridge construction sample (split joint and automatic hydraulic phases NOT implemented)
- Simulation speed 0.5x/1x/2x and pause
- Stress coloring and peak strain readout
- PNG screenshot export and keyboard shortcuts
- Preserved 16 synthetic/estimated maps, design JSON and CSV

## Known limitations
- Approximate Verlet physics; vehicle modeled as moving point load, not rigid body
- No collision-accurate vehicle/wheels, no hydraulic phase timeline, no real split joint
- Map coordinates are NOT original game measurements
- v0.6 does not claim parity with Poly Bridge 2

Open play.html locally. No server or external dependencies required.


## v0.7 변경 사항
- 중앙 분리 조인트 간이 개폐(도로 충돌/접지의 중앙 갭) 토글
- 유압 단계 전환 및 자동 유압 타임라인(1~3초)
- 차량 앞/뒤 바퀴 도로 샘플 기반 접지와 차체 기울기 표시
- JSON 저장에 분리 조인트/유압 단계 포함
- 주의: 차량은 여전히 완전한 강체가 아니며 분리 조인트는 물리 제약 해제가 아닌 충돌 갭 근사입니다. 원작 맵 좌표 미복원.
