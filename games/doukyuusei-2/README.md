# 동급생 2 (同級生2 / Doukyuusei 2)

PlayHub 웹 게임 복원·재구현 프로젝트를 위한 **《동급생 2》(elf, 1995 PC-98 원작 / 2024 FG REMAKE 기준)** 역기획서 및 원작 데이터 복원 패키지입니다.

## 핵심 설계 기둥

> **"동급생 2: NPC 일정·동선, 시간 진행, 관계 이벤트를 데이터 기반으로 구성"**

- **시간·캘린더 엔진**: 12월 22일 ~ 1월 7일(17일간, 자유행동 16일 + 1/7 3학기 시업식 엔딩 판정), 5분 양자 시계, 시설 진입 15분 / 실내 이동 10분 / 전철 30분(역 진입 포함 45분) 소비 모델.
- **NPC 일정·동선 엔진**: 원작 15인 히로인의 3대 출현 유형(`고정 출현`, `아치코치 순회`, `복합 전환`)을 선언적 스케줄 테이블(`npc_schedules.json`)과 우선순위 리졸버로 데이터화.
- **관계 이벤트 DAG 및 마크로 분기**: 12월 28일 아키라의 동지온천 당첨 전화(참가 여부 + 파트너 3택)와 12월 29~30일 온천/마을 배타 분기, 요코 엔딩 우선권 덮어쓰기 규칙까지 비순환 이벤트 그래프(`events_and_flags.json`)로 구조화.
- **콘텐츠 정책**: 성인용 씬 묘사를 완전히 배제하고 순수 관계 단계 마일스톤(`milestone_abstracted`)과 플래그 전이로만 추상화.

## 디렉터리 구조

- [`ReverseDesign/README.md`](./ReverseDesign/README.md) — 역기획서 전체 색인 및 읽기 순서
- [`ReverseDesign/verified_data/`](./ReverseDesign/verified_data/) — 검증 완료된 원작 데이터(JSON/CSV) 및 자동 정합성 검증기(`validate_data.mjs`)

## 복원 데이터 현황 (검증 완료)

| 항목 | 수량 | 파일 |
|---|---:|---|
| 등장인물 (15인 히로인 + 주인공 + 조연/라이벌 6인) | 22명 | `verified_data/characters.json`, `characters.csv` |
| 지역(Zone) / 세부 장소(Location) | 4존 / 41장소 | `verified_data/locations.json`, `locations.csv` |
| 캘린더 일자 (12/22 ~ 1/7) | 17일 | `verified_data/calendar_days.json` |
| 상태 플래그 / 관계 이벤트 / 상호 배타 규칙 | 60 / 51 / 3 | `verified_data/events_and_flags.json` |
| 데이터 기반 NPC 일정 슬롯 | 57개 (히로인 15/15) | `verified_data/npc_schedules.json` |
| 엔딩 (히로인 16종 + 실패 2종 + 솔로 1종) | 19종 (히로인 15/15) | `verified_data/endings.json` |

## 데이터 검증 실행

```bash
node games/doukyuusei-2/ReverseDesign/verified_data/validate_data.mjs
```
