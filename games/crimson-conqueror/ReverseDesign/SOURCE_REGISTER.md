# 원작 검증 출처 대장 (SOURCE REGISTER)

본 문서는 『귀축왕 란스 (鬼畜王ランス / Kichikuou Rance, AliceSoft, 1996)』 역기획서 작성 및 `verified_data/` Phase 1~2 복원 과정에서 교차 참조한 공개 문헌 출처를 기록한다.

> **주의**: 웹 검색으로 확보한 공개 위키·공략 아카이브 기반 2차 문헌이며, 원작 Windows 95 실행 바이너리(`*.ALD` / `*.AIN` 스크립트 덤프) 직접 역어셈블리는 수행하지 않았다. 이로 인해 수치화 과정에서 균형 재구성된 스탯에는 `BALANCED_RECONSTRUCTION`, 미확인 내부 상수에는 [DATA_GAPS.md](./DATA_GAPS.md)의 구분 태그를 정직하게 명시한다.

---

## 출처 목록

| ID | 출처명 / URL | 언어 | 활용 범위 | 신뢰도 |
|---|---|---|---|---|
| `SRC-01` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance` / `Kichikuou Rance:Gameplay` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance`) | EN | 1턴=1주 달력, 유형별 주간 액션 슬롯(도시·시나리오·대화·증원/보충·건설·탐색·침공·닌자 5회), 4부대 전열/후열 전투, 지휘관 HP 0=영구사망 규칙 | 높음 (1차 영문 전문 위키) |
| `SRC-02` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Walkthrough` 및 권역별 하위 가이드 (`City States`, `Helman`, `Zeth`, `Monster Realm`, `Creator`) (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Walkthrough`) | EN | 5단계 캠페인 페이즈, 볼고 Z 구출 기한(`3/08/3` 소울, `4/01/3` 시일), 헬만 프레이야 공작/닌자 접착제, 제스 4탑 자동 붕괴 및 5주 시즈카 결투, 마계 통일(`LP 3/9/4`), 69~73주 마인 침공 타이머, 샹그릴라 제외 창조신 페이즈 해금 | 높음 |
| `SRC-03` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Endings` & `Kichikuou Rance:Destiny` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Endings`, `Kichikuou_Rance:Destiny`) | EN | **전 14개 메인 스토리 엔딩 100% 교차 검증** (Bliss, World King, Servant, God, Unification, To Outer Space, Demon King 1/2, Bandit King, Assassinated 1/2, Drugged/Poisoned, Death, Defeat), 66명×2=132개 캐릭터 운명(Fortune/Misfortune) 상호 배타 규칙 | 높음 |
| `SRC-04` | AliceSoft Wiki (Miraheze) — `Kichikuou Rance:Subordinates` & `Kichikuou Rance:Locations` (`https://alicesoft.miraheze.org/wiki/Kichikuou_Rance:Subordinates`, `Kichikuou_Rance:Locations`) | EN | 52개 원작 플레이어블 부하 체계(코르도바 1,000병력, 아리스토레스 800병력, 레류코프/롤렉스/휴버트/가르티아/루이스/세실/아르코트/라팔리아/아비아토르/소미타 등), 병종 분류 14종, Snipe 공식(`0..floor(Strikes/5)`, 상한 6), 닌자 전투 추격(+1 고정, 마인 면역) | 높음 |
| `SRC-05` | 일본 완전 공략 아카이브 (`xfu.jp` 어리스 마토메 Wiki, `penpen.ne.jp`, `sakura.ne.jp`, `nnn.ac`, `fctv.ne.jp`, `seesaawiki.jp`, `atwiki.jp`) | JP | **14종 정식 일문 엔딩 타이틀**(`幸福：ランス、再び冒険へ`, `世界王：素敵よダーリン最高！！`, `下僕：ルドラサウムのいいなり………`, `神：破壊、そして創造`, `統一：世界は俺様の物!!`, `宇宙へ：よかったね、マリア`, `魔王：リトルプリンセス`, `魔王：真鬼畜王誕生`, `盗賊王：まあよし、グッドだ！がはは！`, `暗殺：最後が子供なんて`, `暗殺：ひどいよかなみちゃん`, `薬殺：きれいな花にはトゲがある`, `死亡：ランス、あえなく戦場に散る`, `陥落：さらば俺の輝ける日々`), 52인 부하 전수 목록·가입 조건·미궁 계층(하니아 신전 B66F, 하이퍼 빌딩 201F, 루드라사움 유적 1000F), 28+ 핵심 캐릭터 행복/불행 분기 조건 | 높음 |
| `SRC-06` | 나무위키 (`namu.wiki` — 귀축왕 란스 및 캐릭터/지역/엔딩 항목) & 일본 위키백과 (`ja.wikipedia.org`) | KR / JP | 한국어 공식 통용 표기(리자스, 헬만, 제스, 자유도시, 마인군, 창조신 루드라사움, 와그 아카, 켄신, 리즈나, 셀 등), 행복/불행 전원 양립 불가 규칙, 사사호(티티호) 알루미늄 도끼→B66F 하니와 킹 영입 절차 | 중간~높음 (교차 검증 용도) |
| `SRC-07` | 일본 커뮤니티/영상 공략 아카이브 (`nicovideo.jp`, `bilibili.com` 鬼畜王ランス 공략 기록) | JP / ZH | 마인 1체 격파 시 해당 지역 마군 반감 / 연속 2체 격파 시 2/3 감소 규칙, 패튼파 vs 제국 3장군(아리스토레스·롤렉스·레류코프) 헬만 분기, 사사호 하니와 킹 vs 괴수왕자 배타 규칙 | 중간 (교차 확인 완료) |
