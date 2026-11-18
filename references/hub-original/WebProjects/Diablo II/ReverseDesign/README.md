# Diablo II 역기획서 — 상세화판

기준: Diablo II / Lord of Destruction / Resurrected 공통 코어. 원작 관찰 및 알려진 규칙과 독립 구현 제안을 구분합니다. 정확한 수치/확률/패치 예외는 원본 데이터 검증이 필요합니다.

## 문서 목차

- [게임 루프 및 시스템 아키텍처](00_Overview.md)
- [직업·캐릭터 생성·성장](01_Character_Classes.md)
- [전투 판정 파이프라인](02_Combat.md)
- [스킬 트리·시전·효과](03_Skills.md)
- [능력치·파생 능력치·수정자](04_Stats.md)
- [아이템 생성·옵션·장비](05_Items.md)
- [드롭 테이블·TC·매직 파인드](06_Loot.md)
- [몬스터 행동·속성·엘리트](07_Monsters_AI.md)
- [액트·지역·절차적 던전](08_World_Maps.md)
- [퀘스트·액트 진행·NPC](09_Quests.md)
- [난이도·진행·엔드게임](10_Difficulty.md)
- [골드·상점·큐브·제작](11_Economy_Crafting.md)
- [인벤토리·장비·UI](12_Inventory_UI.md)
- [용병·고용·장비·AI](13_Mercenary.md)
- [파티·동기화·PvP](14_Multiplayer.md)
- [저장·로드·데이터 설계](15_Save_Architecture.md)
- [밸런스·검증·자동화](16_Balance_Test.md)

## 개발 권장 순서

1. Stats / Items / Skills 데이터 정의
2. Combat 25fps 고정 틱과 입력 처리
3. Monsters AI 및 World 생성
4. Loot TC 및 Inventory
5. Quest / Difficulty / Save
6. Mercenary / Multiplayer / Balance 테스트
