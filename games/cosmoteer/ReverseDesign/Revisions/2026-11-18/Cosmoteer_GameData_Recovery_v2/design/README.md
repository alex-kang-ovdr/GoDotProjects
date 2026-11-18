# 시스템별 개선 기획

2026-11-18 개정. **원작 문헌 관측 / 현재 v4 구현 / 연구자 계산 / 다음 구현 제안**을 구분한다. 수치 변경 요약은 [복구 변경](../docs/REVISION_V2.md)을 먼저 읽는다.

| 문서 | 다루는 결정 |
| --- | --- |
| [00_Scope_and_Decisions.md](00_Scope_and_Decisions.md) | 개선 범위와 결정 사항 |
| [01_Ship_Geometry_and_Connectivity.md](01_Ship_Geometry_and_Connectivity.md) | 함선 기하·문·연결 개선 |
| [02_Crew_Logistics_and_Power.md](02_Crew_Logistics_and_Power.md) | 승무원·물류·전지 운용 개선 |
| [03_Weapons_Shields_and_Destruction.md](03_Weapons_Shields_and_Destruction.md) | 무장·방향성 실드·관통·폭발 개선 |
| [04_Heat_Cooling_and_Overclocking.md](04_Heat_Cooling_and_Overclocking.md) | 선체 열·열 배관·냉각·오버클럭 개선 |
| [05_Resources_Production_and_Trade.md](05_Resources_Production_and_Trade.md) | 자원·생산·건조·거래 경제 개선 |
| [06_Career_Fame_and_Roadmap.md](06_Career_Fame_and_Roadmap.md) | 임무·명성·진영·개발 예정 기능 |
| [07_Architecture_and_Save_Migration.md](07_Architecture_and_Save_Migration.md) | 상태 구조·틱·저장 전환 개선 |
| [08_Implementation_and_Acceptance.md](08_Implementation_and_Acceptance.md) | 구현 순서와 수용 명세 |
| [09_Original_Data_Extraction.md](09_Original_Data_Extraction.md) | 원작 데이터 복원의 후속 추출 명세 |
| [10_Balance_and_UX.md](10_Balance_and_UX.md) | 플레이 밸런스·설명 가능한 상태·검증 지표 |

기존 시스템별 25개 MD는 [이전 역기획](../reverse_design_v1/README.md)에 보존했다. 이번 개선은 공간·물류·방어·열·경제·성장·저장 계약에 집중한다. 함대 명령·센서·초공간·도장·멀티플레이의 상세 배경은 이전 문서를 참고하되, 현행 구현 여부는 v4 추출과 새 기획을 기준으로 확인한다.

권장 읽기 순서: **00 → 01 → 02 → 03/04 → 05/06 → 07 → 08 → 10**. 정확한 원본 데이터 확보 절차는 09다.
