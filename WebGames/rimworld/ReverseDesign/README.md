---
doc_id: INDEX
title: 림월드 시스템별 역기획서
layer: meta
target_version: RimWorld PC 1.6 계열
research_date: 2026-11-13
status: 공개자료 기반 역기획
---

# 림월드 시스템별 역기획서

**기본 시스템 18개 + DLC 5개 + 개요·공통 문서 7개, 총 30개 Markdown 파일**로 구성한 역기획서다. 게임의 기능 목록을 넘어 플레이어의 판단, 핵심 규칙, 상태 변화, 실패 조건, 시스템 간 영향을 정리한다.

## 문서 범위와 읽기 기준

| 항목 | 범위 |
| --- | --- |
| 분석 대상 | PC RimWorld 1.6 계열, 기본 게임과 공식 DLC 5종 |
| 조사 기준일 | 2026-11-13 |
| DLC | Royalty, Ideology, Biotech, Anomaly, Odyssey |
| 제외 | 모드별 변경 규칙, 콘솔판, 원작 전체 데이터 덤프, 실제 엔진 소스 복원 |
| 검증 방식 | 공개된 공식 자료·커뮤니티 Wiki를 확인한 문헌 기반 분석 |
| 실행 여부 | 게임 실행·코드 열람·원작 수치 재현 실험은 수행하지 않음 |
| 버전 참고 | 2026-10-12 공식 1.7/Waylith 시험 버전 발표는 별도 기록; 본문 분석 범위는 1.6 유지 |

사용자가 제시한 [나무위키 림월드 문서](https://namu.wiki/w/%EB%A6%BC%EC%9B%94%EB%93%9C)는 직접 열람이 실패했다. 해당 본문을 읽고 전재한 문서가 아니며, 공식 소개·개발 공지와 RimWorld Wiki로 보완했다. 출처별 접근 상태와 상세 근거는 [출처·검증 범위](meta/04_sources_verification.md)에 정리했다.

## 먼저 읽을 문서

1. [전체 게임 구조와 핵심 루프](00_overview.md): 림월드가 어떤 의사결정을 만드는지 이해한다.
2. [시스템 의존성과 공통 데이터 계약](meta/02_system_dependencies.md): 기능 사이의 흐름과 책임을 확인한다.
3. 관심 있는 시스템의 `핵심 규칙 → 대표 사례 → 검증 시나리오`를 읽는다.
4. 구현하려면 [통합 수용 기준](meta/05_acceptance_tests.md)을 사용해 연결부를 검증한다.

## 기본 시스템 18개

| ID | 문서 | 주요 분석 대상 |
| --- | --- | --- |
| SYS-01 | [월드·맵·환경](systems/01_world_map_environment.md) | 정착지 선택, 지역 지도, 지형·기후·자연환경 |
| SYS-02 | [주민·기술·인간관계](systems/02_colonists_skills_relationships.md) | 능력, 열정, 특성, 업무 자격, 관계 |
| SYS-03 | [욕구·기분·정신 이상](systems/03_needs_mood_mental_breaks.md) | 욕구, 생각, 무드 변화와 행동 상실 |
| SYS-04 | [작업·우선순위·일감](systems/04_work_priorities_jobs.md) | 자율 행동, 작업표, 시간표, 예약·취소 |
| SYS-05 | [건설·방·구역](systems/05_building_rooms_zones.md) | 청사진, 건축 단계, 방, 지붕, 영역 |
| SYS-06 | [아이템·창고·물류](systems/06_items_storage_logistics.md) | 스택, 저장 필터, 운반, 가용 재고 |
| SYS-07 | [식량·농업·생산](systems/07_food_agriculture_production.md) | 재배, 식량 공급, 조리, 제작 주문 |
| SYS-08 | [전력·온도·화재](systems/08_power_temperature_fire.md) | 공급망, 축전, 열환경, 사고와 복구 |
| SYS-09 | [건강·신체·의료](systems/09_health_medical_body.md) | 부위 손상, 능력, 질병, 치료·수술 |
| SYS-10 | [전투·방어·장비](systems/10_combat_defense_equipment.md) | 징집, 사격·근접, 엄폐, 방어구, 손실 |
| SYS-11 | [동물·조련·목축](systems/11_animals_taming_ranching.md) | 길들이기, 훈련, 우리, 번식과 먹이 |
| SYS-12 | [스토리텔러·사건·난이도](systems/12_storyteller_incidents_difficulty.md) | 사건 종류·간격·강도와 난도 조절 |
| SYS-13 | [연구·기술 발전](systems/13_research_technology_progression.md) | 선행 기술, 연구 노동, 해금과 기회비용 |
| SYS-14 | [세력·거래·포로](systems/14_factions_trade_prisoners.md) | 외교, 물자 교환, 돌봄과 모집 |
| SYS-15 | [상단·월드 이동](systems/15_caravans_world_travel.md) | 편성, 보급, 원정, 귀환, 수송 포드 |
| SYS-16 | [임무·장기 목표·엔딩](systems/16_quests_endings.md) | 수락, 기한, 조건, 보상과 종료 경로 |
| SYS-17 | [UI·조작·피드백](systems/17_ui_controls_feedback.md) | 선택, 원인 파악, 명령, 경고·검색 |
| SYS-18 | [시뮬레이션·시간·저장·확장](systems/18_simulation_save_mods.md) | 지속 상태, 시간 통제, 호환과 구현 제안 |

## DLC 확장 5개

| ID | 문서 | 핵심 확장 축 |
| --- | --- | --- |
| DLC-01 | [Royalty](dlc/01_royalty.md) | 작위·제국·초능력·의무와 특권 |
| DLC-02 | [Ideology](dlc/02_ideology.md) | 신념·규범·역할·의식·사회적 기준 |
| DLC-03 | [Biotech](dlc/03_biotech.md) | 가족·성장·유전자·메카노이드·오염 |
| DLC-04 | [Anomaly](dlc/04_anomaly.md) | 미지의 위협·연구·수용·억제·의식 |
| DLC-05 | [Odyssey](dlc/05_odyssey.md) | 이동 기지·탐험·궤도 환경·신규 생태 |

이 표의 확장 축은 상세 문서에 있는 확인 규칙을 정리한 탐색용 요약이다. DLC 출시와 함께 추가된 무료 기본 게임 기능은 각 DLC의 유료 기능으로 묶지 않았다.

## 공통 자료

| 문서 | 용도 |
| --- | --- |
| [공통 Markdown 양식](meta/01_document_template.md) | 새 시스템 문서를 같은 형식으로 확장 |
| [시스템 의존성·공통 데이터 계약](meta/02_system_dependencies.md) | 입력·출력·이벤트·책임 연결 |
| [용어집](meta/03_glossary.md) | 한국어·영어·문서 내 의미의 대응 |
| [출처와 검증 범위](meta/04_sources_verification.md) | 근거 목록, 접근 실패, 미확인 항목 |
| [통합 수용 기준](meta/05_acceptance_tests.md) | 시스템 간 예외와 상태 보존 검증 |

## 각 시스템 문서의 공통 12절

1. 시스템 목적과 플레이 경험
2. 범위와 입출력
3. 플레이어 조작과 제공 정보
4. 핵심 규칙
5. 상태와 처리 흐름
6. 데이터 모델 및 인터페이스
7. 수치와 밸런스
8. 대표 플레이 사례와 예외
9. 다른 시스템과의 연결
10. 검증 시나리오
11. 설계 해석과 재구현 우선순위
12. 출처와 확인 필요 사항

## 근거 표시와 Markdown 형식

| 표기 | 의미 |
| --- | --- |
| `[확인]` | 공개 문헌에서 확인. 직접 플레이·코드 검증을 뜻하지 않음 |
| `[해석]` | 규칙에서 도출한 설계 분석. 개발자의 공식 의도와 구분 |
| `[제안]` | 독립적으로 재구현하기 위한 데이터·알고리즘·테스트 |
| `[미확인]` | 패치 의존 수치 또는 검증하지 못한 동작 |
| `[S1]`, `[S2]` | 해당 파일 안에서만 유효한 출처 키. 각 문서 마지막 표에 URL 제공 |

사용한 Markdown 형식은 **YAML frontmatter, 제목 계층, 표, 상대 링크, 인용 블록, Mermaid 흐름도, YAML 데이터 예시, 체크리스트와 검증 표**다. Mermaid를 지원하지 않는 뷰어에서도 전후 설명과 표로 내용을 읽을 수 있다. 정확한 원작 수치가 확인되지 않은 부분은 임의의 확정값으로 채우지 않았다.

압축 해제 후 이 `README.md`부터 열면 상대 링크로 탐색할 수 있다. 파일명은 링크 호환성을 위해 영문이며 본문은 한국어다.
