# Bloons TD 6 역기획서 v2.0

시스템별 상세 설계 19개 문서. 원작의 비공개 수치나 코드를 복원했다고 주장하지 않으며, 구현 가능한 독립 설계 모델을 제시합니다.

## 문서 목록
- [00_Overview](00_Overview.md) — 제품 정의 및 역기획 범위
- [01_CoreLoop](01_CoreLoop.md) — 코어 루프와 상태 머신
- [02_Bloons](02_Bloons.md) — 풍선 계층·특수 속성·자식 생성
- [03_Towers](03_Towers.md) — 타워 카탈로그와 역할
- [04_Upgrades](04_Upgrades.md) — 3경로 업그레이드 규칙
- [05_Combat](05_Combat.md) — 전투 수학·타게팅·충돌
- [06_Economy](06_Economy.md) — 현금·수익·판매·농장
- [07_Heroes](07_Heroes.md) — 영웅 성장과 스킬
- [08_Maps](08_Maps.md) — 맵·경로·지형·배치
- [09_Modes](09_Modes.md) — 모드와 난이도 룰셋
- [10_UI_UX](10_UI_UX.md) — 가로모드 UI/UX
- [11_Architecture](11_Architecture.md) — JavaScript/TypeScript 아키텍처
- [12_DataSchemas](12_DataSchemas.md) — 데이터 정의·JSON 예시
- [13_Balance_QA](13_Balance_QA.md) — 밸런스·QA·자동화
- [14_Implementation_Roadmap](14_Implementation_Roadmap.md) — 구현 로드맵
- [15_Rounds](15_Rounds.md) — 라운드·웨이브 디렉터
- [16_Projectile_Collision](16_Projectile_Collision.md) — 투사체·관통 상세
- [17_DeveloperTools](17_DeveloperTools.md) — 밸런스 에디터·치트·계측
- [18_AcceptanceTests](18_AcceptanceTests.md) — 기능별 인수 테스트

## 권장 순서
Overview → Bloons → Towers → Upgrades → Combat → Rounds → Architecture → AcceptanceTests.
