# Shadow over Mystara 역기획서 — 문서 목차

원작 기반 분석과 구현 제안을 구분한 15개 시스템별 MD 파일입니다. 정확한 프레임·수치는 추가 실측이 필요합니다.

- [게임 개요 및 분석 기준](00_Overview.md)
- [입력 및 2.5D 이동](01_Input_Movement.md)
- [전투·콤보·피격](02_Combat.md)
- [6개 캐릭터 클래스](03_Classes.md)
- [주문·마법 자원](04_Magic.md)
- [아이템·장비·루팅](05_Items_Equipment.md)
- [일반 적 AI](06_Enemies_AI.md)
- [보스 전투](07_Bosses.md)
- [스테이지·분기·이벤트](08_Stages_Branches.md)
- [경험치·상점·경제](09_RPG_Economy.md)
- [4인 협동·카메라](10_Coop.md)
- [HUD·인벤토리 링·피드백](11_UI_UX.md)
- [구현 아키텍처·데이터·테스트](12_Technical_Architecture.md)
- [JSON 데이터 스키마·의사코드](13_Data_Schemas.md)
- [원작 검증·분석 체크리스트](14_Validation.md)

## 참고 자료
- 사용자 제공: https://namu.wiki/w/던전%20앤%20드래곤%20섀도%20오버%20미스타라 (자동 열람 제한으로 직접 본문 검증하지 못함)
- https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489
- https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/1255
- https://steamcommunity.com/sharedfiles/filedetails/?id=154984901
- https://www.mobygames.com/game/63847/dungeons-dragons-shadow-over-mystara/


## v2 상세 확장
기존 15개 시스템 문서를 세부 동작 규칙, 데이터 필드, 테스트 시나리오로 확장했습니다. 추가 문서: 15_Command_And_Cancel_Spec, 16_Enemy_Boss_Behavior_Trees, 17_Spell_And_Item_Tables, 18_Stage_Graph_And_Events, 19_Implementation_Roadmap. 수치는 원작 검증 전까지 예시로 취급합니다.


## v3 추가 심화 문서
- 20_Class_Command_Matrix.md — 6클래스 커맨드 차이
- 21_Combat_Frame_Research.md — 프레임 검증 절차
- 22_Spell_Resource_Design.md — 주문 및 공유 슬롯
- 23_Boss_Pattern_Catalog.md — 보스별 패턴 분석
- 24_Stage_Branch_Atlas.md — 분기 및 이벤트 구조
- 25_Implementation_Acceptance.md — 구현 완료 기준
