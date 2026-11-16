# 삼국지 11 PC/PK 역기획 프로젝트

시스템별 30개 Markdown 문서와 CSV 데이터 스키마, 재현 실험 계획을 포함합니다. **원작의 완전 복원 데이터나 검증 완료 전투 수식은 아직 포함되지 않습니다.**

## 범위
- 원작 PC 및 PK 구분
- 헥스 월드맵, 턴, 경제, 인재, 부대, 전법, 계략, 공성, 기교, 외교, AI, 이벤트, UI
- 구현 가능한 데이터 모델과 테스트 시나리오

## 정확도 정책
1. 확인되지 않은 수치는 비워 둡니다.
2. 원작 내부 알고리즘과 재구현 제안을 혼동하지 않습니다.
3. 후속 실측 데이터는 `data/verification_log.csv`에 추가합니다.
4. 저작권 보호를 위해 게임 리소스/원본 바이너리는 포함하지 않습니다.

## 참고 자료
- 공식 PC PK 매뉴얼: https://cdn.akamai.steamstatic.com/steam/apps/628070/manuals/32sangokushi11wpk_manual.pdf
- 일본 공략 위키: https://w.atwiki.jp/sangokushi11/
- 일본 공략 사이트: https://sangokushi11.shiyo.info/

## 문서 목록
- [docs/00_overview.md](docs/00_overview.md) — 게임 개요와 원작 재현 범위
- [docs/01_turns.md](docs/01_turns.md) — 턴과 날짜·행동력
- [docs/02_worldmap.md](docs/02_worldmap.md) — 월드맵과 헥스 좌표
- [docs/03_factions.md](docs/03_factions.md) — 세력과 군단
- [docs/04_settlements.md](docs/04_settlements.md) — 도시·관문·항구
- [docs/05_economy.md](docs/05_economy.md) — 자원·경제·수송
- [docs/06_development.md](docs/06_development.md) — 개발지·내정 시설·PK 합병
- [docs/07_domestic_commands.md](docs/07_domestic_commands.md) — 내정 명령
- [docs/08_officers.md](docs/08_officers.md) — 무장 데이터와 능력치
- [docs/09_personnel.md](docs/09_personnel.md) — 인재 탐색·등용·포상·임명
- [docs/10_relationships.md](docs/10_relationships.md) — 인간관계·혈연·충성
- [docs/11_units.md](docs/11_units.md) — 부대 편성·출진·보급
- [docs/12_movement.md](docs/12_movement.md) — 이동·경로·ZOC
- [docs/13_combat.md](docs/13_combat.md) — 통상 공격·피해·반격
- [docs/14_troop_types.md](docs/14_troop_types.md) — 병과·상성·지형 제한
- [docs/15_tactics.md](docs/15_tactics.md) — 병과별 전법
- [docs/16_plots.md](docs/16_plots.md) — 부대 계략·상태이상
- [docs/17_siege_naval.md](docs/17_siege_naval.md) — 공성병기·함선·수전
- [docs/18_military_buildings.md](docs/18_military_buildings.md) — 군사 시설·화공
- [docs/19_duel.md](docs/19_duel.md) — 일기토
- [docs/20_debate.md](docs/20_debate.md) — 설전
- [docs/21_skills.md](docs/21_skills.md) — 무장 특기
- [docs/22_techniques.md](docs/22_techniques.md) — 기교 연구
- [docs/23_diplomacy.md](docs/23_diplomacy.md) — 외교
- [docs/24_strategy_plots.md](docs/24_strategy_plots.md) — 전략 계략
- [docs/25_ai.md](docs/25_ai.md) — AI 계층·평가·행동
- [docs/26_scenarios.md](docs/26_scenarios.md) — 시나리오·초기 배치
- [docs/27_events.md](docs/27_events.md) — 역사 이벤트·조건 분기
- [docs/28_ui.md](docs/28_ui.md) — UI·UX·카메라
- [docs/29_pk.md](docs/29_pk.md) — 파워업키트 차이
