# 원작 검증 출처 대장 (SOURCE REGISTER)

본 문서는 『귀축왕 란스 (鬼畜王ランス / Kichikuou Rance, AliceSoft, 1996)』 역기획서 작성 및 `verified_data/` 복원 과정에서 교차 참조한 공개 문헌 출처를 기록한다.

> **주의**: 웹 검색으로 확보한 공개 위키·공략 아카이브 기반 2차 문헌이며, 원작 Windows 95 실행 바이너리(`*.ALD` / `*.AIN` 스크립트 덤프) 직접 역어셈블리는 수행하지 않았다. 이로 인해 확인되지 않은 내부 상수·전수 스탯표는 [DATA_GAPS.md](./DATA_GAPS.md)에 분리 기록한다.

---

## 출처 목록

| ID | 출처명 / URL | 언어 | 활용 범위 | 신뢰도 |
|---|---|---|---|---|
| `SRC-01` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance` / `Kichikuou Rance:Gameplay` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance`) | EN | 1턴=1주 달력, 유형별 주간 액션 슬롯(도시·하렘·대화·증원/보충·건설·탐색·침공·닌자 5회), 4부대 전열/후열 전투, 지휘관 HP 0=영구사망 규칙 | 높음 (1차 영문 전문 위키) |
| `SRC-02` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Walkthrough` 및 권역별 하위 가이드 (`City States`, `Helman`, `Zeth`, `Monster Realm`, `Creator`) (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Walkthrough`) | EN | 5단계 캠페인 페이즈, 볼고 Z 구출 기한(`3/08/3` 소울, `4/01/3` 시일), 헬만 프레이야 독살/닌자 접착제, 제스 4탑 자동 붕괴 및 5주 시즈카 결투, 마계 통일(`LP 3/9/4`), 69~73주 마인 침공 타이머, 샹그릴라 제외 창조신 페이즈 해금 | 높음 |
| `SRC-03` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Endings` & `Kichikuou Rance:Destiny` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Endings`) | EN | 14개 메인 스토리 엔딩 체계(Bliss, World King, Servant, God, Unification, To Outer Space, Demon King 1/2, Bandit King, Assassinated, Death, Defeat 등), 66명×2=132개 캐릭터 운명(Fortune/Misfortune) 결산 구조 | 높음 |
| `SRC-04` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Subordinates` & `Kichikuou Rance:Locations` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Subordinates`, `https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Locations`) | EN | 총 52개 플레이어블 유닛, 병종 분류(Leazas/Helman Knights, Mages, Archers, Ninjas, Maria's Pupils, Freak Robots, Kalars, Hannies, Kaiju, Demons 등), Snipe 공식(`0..floor(Strikes/5)`, 상한 6), 닌자 전투 추격(+1 고정, 마인 면역), 수도 건설(병원·마법연구소·마리아연구소), 미궁 목록 | 높음 |
| `SRC-05` | 일본 공략 아카이브 (`sakura.ne.jp`, `nnn.ac`, `atwiki.jp`, `seesaawiki.jp`, `fctv.ne.jp` — 鬼畜王ランス 공략) | JP | 최소 병수 우선 행동순(동률 시 아군 1~4 → 적군 1~4), 전투역(`戦闘域`) 전선 상한 규칙, 물리/마법 손괴율 및 작전 보정(10%·50%), 대기/방어/필살기 사양, 무패널티 강제 징세, 도서관→바운드 연계, 커스텀 병합 일괄 영입, 닌자 파괴공작 ~50% 포획 위험 | 높음 |
| `SRC-06` | 나무위키 (`namu.wiki` — 귀축왕 란스 및 캐릭터/지역 항목) & 일본 위키백과 (`ja.wikipedia.org`) | KR / JP | 한국어 공식 통용 표기(리자스, 헬만, 제스, 자유도시, 마인군, 창조신 루드라사움, 와그 아카 등), 행복/불행 전원 양립 불가 규칙, 나기 결투 시 란스 행동 상태 플래그, 아담 요새/테이프 순서 시즈카 분기, 사사호 알루미늄 도끼→B66F 하니와 킹 영입 절차 | 중간~높음 (교차 검증 용도) |
| `SRC-07` | 일본 커뮤니티/영상 공략 아카이브 (`nicovideo.jp`, `bilibili.com` 鬼畜王ランス 공략 기록) | JP / ZH | 마인 1체 격파 시 해당 지역 마군 반감 / 연속 2체 격파 시 2/3 감소 규칙, 사사호 하니와 킹 영입 세부 조건(괴수왕자 미영입 + 알루미늄 도끼 + B66F 2회 방문 + 줄리아 양도) | 중간 (교차 확인 완료) |
