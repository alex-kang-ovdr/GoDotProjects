/**
 * Twin Sight Paradox — Pure Deterministic Multi-Sight Dual-Perspective Engine (Phase 2)
 *
 * Zero DOM dependencies. UMD export (globalThis.EveEngine + module.exports).
 * Driven 100% by verified_data SSOT bundled in Web/data/game-data.js (EVE_DATA).
 *
 * Core Invariants:
 * 1. Dual Partitioned Protagonist State (Kojiro & Marina isolated inventories, clues, scenes, locations).
 * 2. Cross-Protagonist Sync Barrier Engine (SB_01 ~ SB_12 across 27 granular scenes, monotonic unlockedFlags).
 * 3. Progressive Command Exhaustion (LOOK 1->2->3, TALK 1->2->3, THINK 1->2->3 synthesis with explicit indicators).
 * 4. Information Asymmetry & Interactive Clue Cross-Examination (correlateClues(clueA, clueB) -> 8 dramatic-irony insights).
 * 5. Tristan Convergence (C_D6_01) knowledge merge + 3-stage Finale Deduction (submitDeductionStep) + Classic submitCulprit.
 * 6. Deterministic serialize() / deserialize() with integrity checksum.
 */

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.EveEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SCHEMA_VERSION = '2.0.0';

  // Canonical per-scene focus targets, 3-layer progressive exhaustion scripts, and required investigative steps.
  // Optional "@N" suffix on requiredSteps (e.g. "LOOK:target@2") enforces authentic ADV progressive exhaustion.
  var SCENE_SPECS = {
    M_D0_01: {
      focusId: 'briefing_dossier',
      focusLabel: '코노 본부장의 극비 경호 지령서',
      focusLook: [
        '귀국 직후 소환된 내각조사실 브리핑 룸. 서류철에는 주일 엘디아 대사 로스=미도의 딸 "미도 마야코"의 경호 지령과 예일 외국인학교 위장 부임 계획이 적혀 있다.',
        '서류 구석의 내무감사관 카가와 미스미의 날인이 신경 쓰인다. 단순 경호가 아니라 엘디아 정세와 직결된 민감한 정치 임무임이 분명하다.',
        '[완전 조사] 지령서 말미에 "선 맨션 403호 안전가옥 배정 및 직통 FAX 회선 개설" 항목이 추가되어 있다. 본부 상층부조차 이번 건을 극비로 묶으려 한다.',
      ],
      requiredSteps: ['LOOK:briefing_dossier', 'TALK:saburo_kouno'],
      talkLines: {
        saburo_kouno: [
          '「돌아오자마자 미안하군, 마리나. 주일 엘디아 대사 로스=미도의 딸 미도 마야코를 경호해 줘야겠다. 애총과 신분증은 챙겨 둬라.」',
          '「예일 외국인학교에 전속 강사로 잠입하게. 대사 측 요청은 극비다. 먼저 엘디아 대사관 리셉션에서 로스 대사와 인사부터 나누도록.」',
          '「거점은 선 맨션 403호로 마련해 두었다. 카가와 감찰관 눈밖에 나지 않도록 조심해서 움직여.」',
        ],
        misumi_kagawa: [
          '「임무 달성률 99%라던가? 내각조사실의 규율을 어기는 순간 바로 감찰 대상이라는 걸 잊지 마, 호죠 마리나.」',
          '「흥, 공안 제6과 시절 독단 행동 버릇이 남아 있으면 본부장님도 널 감싸 줄 수 없을 거야.」',
          '「대사관 리셉션에서 쓸데없는 호기심은 부리지 마. 넌 그저 경호원일 뿐이니까.」',
        ],
      },
      advanceNarration: '애총 "이쿠이쿠"와 내각조사실 1급 수사원 신분증을 수령했다. 이제 주일 엘디아 대사관 리셉션으로 향한다.',
    },

    M_D0_02: {
      focusId: 'embassy_reception_hall',
      focusLabel: '주일 엘디아 대사관 리셉션 홀과 경비 라인',
      focusLook: [
        '화려한 샹들리에가 빛나는 주일 엘디아 대사관 리셉션. 외교관들이 담소를 나누지만, 집무실 구역 입구에는 중무장한 엘디아 사설 경비원들이 삼엄하게 서 있다.',
        '벽면의 엘디아 왕가 문장 곁에 오래된 국새(国璽) 도안이 걸려 있다. 외교 특권 구역 내부는 일본 공안조차 함부로 발을 들일 수 없는 철벽이다.',
        '[완전 조사] 로스=미도 대사가 경비 책임자와 눈빛을 교환하는 순간, 온화한 미소 뒤에 얼음처럼 차가운 첩보관의 기색이 스쳐 지나갔다.',
      ],
      requiredSteps: ['LOOK:embassy_reception_hall', 'TALK:ross_mido'],
      talkLines: {
        ross_mido: [
          '「일본 정부의 협조에 감사드립니다, 호죠 씨. 제 딸 마야코는 과격파 테러리스트의 표적이 될 우려가 있습니다.」',
          '「대사관 내부 업무는 외교 기밀에 해당하므로, 호죠 씨께서는 학교에서의 마야코 경호에만 집중해 주십시오.」',
          '「엘디아의 미래를 위해서라도 마야코를 반드시 지켜 주셔야 합니다. 내일 학교에서 다시 뵙죠.」',
        ],
        mayako_mido: [
          '「안녕하세요… 아버지께 말씀 들었어요. 저 때문에 멀리서 오셨다고요?」',
          '「저는 괜찮은데 아버지가 지나치게 걱정하세요… 죄송하지만 너무 가까이 따라다니지는 말아 주세요.」',
          '「가끔… 이 대사관 복도를 걸으면 알 수 없는 기시감이 들어요. 이상하죠?」',
        ],
      },
      advanceNarration: '엘디아 대사관 리셉션에서 로스=미도의 외교 특권 장벽과 마야코의 미묘한 위화감을 포착했다. 이제 예일 외국인학교 사전 답사로 이동한다.',
    },

    M_D0_03: {
      focusId: 'yale_campus_gate',
      focusLabel: '예일 외국인학교 교정과 디렉터룸 외곽 동선',
      focusLook: [
        '외국인 거류지 언덕에 자리 잡은 예일 외국인학교. 교내 경비는 평온해 보이지만 뒤편 디렉터룸 쪽에는 외부인 출입 통제 흔적이 남아 있다.',
        '도서관과 기숙사 별관이 복도로 이어져 있어 경호 동선 파악이 필수적이다. 스트르만 교장의 집무실 창문은 두꺼운 커튼으로 가려져 있다.',
        '[완전 조사] 전속 강사 잠입 신분증과 교내 도면을 완전히 숙지했다. 내일(12월 3일)부터 본격적인 잠입 경호가 시작된다.',
      ],
      requiredSteps: ['LOOK:yale_campus_gate', 'TALK:stollman_kou'],
      talkLines: {
        stollman_kou: [
          '「내각조사실에서 파견된 새 강사분이시군요. 저는 교장 스트르만=코우입니다. 학교 안은 조용하지만… 최근 불온한 시선이 느껴집니다.」',
          '「전속 강사 신분증을 발급해 드리겠습니다. 내일부터 미도 마야코 양을 잘 부탁드립니다.」',
          '「혹시 교내에서 수상한 외국인을 보시면 즉시 알려 주십시오. 지켜야 할 소중한 비밀이 이 학교에 있습니다…」',
        ],
        hiromi_matsuno: [
          '「안녕하세요, 미술 교육실습생 마츠노 히로미예요. 도서관 고미술 자료를 정리하고 있어요.」',
          '「새 강사 선생님이시라니 반가워요! 학교 분위기가 요 며칠 조금 어수선하더라고요.」',
          '「교장 선생님이 요즘 밤늦게까지 디렉터룸에 틀어박혀 무언가를 숨기시는 것 같았어요.」',
        ],
      },
      advanceNarration: '12월 2일(Day 0) 사전 답사와 강사 신분증 확보를 마쳤다. 자정이 지나며 12월 3일이 밝아오고 — 항구 창고 거리의 사립탐정 아마기 코지로의 사건이 시작된다! [SB_01 해제]',
    },

    K_D1_01: {
      focusId: 'islamic_painting_photo',
      focusLabel: '시바타 아카네의 회화 사진 & 가짜 의뢰인 관찰',
      focusLook: [
        '시바타 아카네가 들고 온 이슬람 문양 회화 사진. 단순한 분실 미술품이라기엔 의뢰인이 제시한 착수금과 긴박함이 지나치게 크다.',
        '회화 중앙의 기하학 문양은 일반 장식이 아니라 특정 도장이나 인장을 본뜬 것처럼 정교하게 그려져 있다.',
        '[완전 조사] 의뢰인 "스트르만=코우"의 손등에는 학자라기엔 너무 거친 총기·전투 굳은살이 배어 있다. 어딘가 냄새가 구리다.',
      ],
      requiredSteps: ['LOOK:islamic_painting_photo', 'TALK:dib'],
      talkLines: {
        akane_shibata: [
          '「코지로! 굶어 죽기 직전인 아마기 탐정사무소에 특급 의뢰를 물어왔어! "이슬람 문양 회화"를 찾는 일이야.」',
          '「의뢰인은 스트르만=코우라는 외국인이야. 보수가 두둑하니 놓치지 마! 나도 따로 현장 사진을 좀 찍어 둘게.」',
          '「그나저나 의뢰인 눈빛이 좀 무섭던데… 뭐, 돈만 제대로 받으면 장땡이지!」',
        ],
        dib: [
          '「내가 스트르만=코우다. 분실된 이슬람 문양 회화를 반드시 되찾아 주게. 저택 서재 열쇠와 자료를 맡기지.」',
          '「경찰이나 외부 기관에는 알리지 마라. 오직 사립탐정의 방식으로 조용히 찾아내게.」',
          '「카츠라기 사무소 쪽에도 연락해 두었다만, 먼저 찾아내는 쪽이 보수를 독차지할 거다.」',
        ],
      },
      advanceNarration: '회화 자료, 탐정 수첩, 저택 열쇠를 챙기고 의뢰를 수주했다. 이 의뢰 개시가 엘디아 측 경계 수위를 흔들며 마리나의 12월 3일 부임과 맞물린다! [SB_02 해제]',
    },

    K_D1_02: {
      focusId: 'stollman_study_painting',
      focusLabel: '스트르만 저택 서재 액자·창문 & 떨어진 전자수첩',
      focusLook: [
        '저택 서재의 벽면 액자 자리가 텅 비어 있다. 단순 절도가 아니라 누군가 칼날로 캔버스 뒷면까지 샅샅이 뒤진 흔적이 선명하다.',
        '창문 걸쇠에 외부 침입 흔적이 없고 실내에서 급히 다툰 자국이 남아 있다. 책상 밑을 더 자세히 살피자 — 카츠라기 사무소 로고가 박힌 전자수첩이 떨어져 있다!',
        '[완전 조사] 전자수첩 메모에는 "엘디아 접선 / 부두 창고 / 야간 거래"라는 짧은 암호 일정이 남아 있다. 니카이도 녀석, 위험한 불장난을 하고 있군!',
      ],
      requiredSteps: ['LOOK:stollman_study_painting@2', 'TALK:yayoi_katsuragi'],
      talkLines: {
        yayoi_katsuragi: [
          '「코지로… 너까지 이 회화 의뢰에 끼어든 거야? 카츠라기 사무소 쪽에도 같은 의뢰가 들어왔어. 조심해.」',
          '「아버지(카츠라기 겐자부로)가 사라진 뒤로 이런 기분 나쁜 의뢰는 처음이야. 니카이도가 요즘 단독으로 튀어나가는 것도 신경 쓰여.」',
          '「니카이도 전자수첩을 주웠다고? 내일 우리 사무소에 들러 직접 돌려주면서 떠봐 줘.」',
        ],
        susumu_nikaido: [
          '「흥, 영세 사무소 주제에 우리 카츠라기 탐정사무소의 일감을 가로채려 드나, 아마기 선배?」',
          '「저택 안은 이미 내가 훑었어! …잠깐, 내 주머니에 있던 전자수첩이 어디 갔지?!」',
          '「이 건은 내가 먼저 끝낼 테니까 항구 구석에서 잠이나 자라고!」',
        ],
      },
      advanceNarration: '스트르만 저택 감정을 마치고 니카이도의 전자수첩을 확보했다. 날이 저물어 항구 창고 거리의 사무소로 돌아가던 중 비명 소리가 들린다!',
    },

    K_D1_03: {
      focusId: 'harbor_alley',
      focusLabel: '항구 창고 거리의 어두운 골목과 왕가 표식',
      focusLook: [
        '안개가 깔린 항구 창고 거리. 무장한 괴한들에게 쫓기던 금발·갈색 피부·오드아이 소녀가 컨테이너 뒤에 몸을 숨기고 떨고 있다.',
        '소녀가 떨어뜨린 작은 표식(펜던트)에는 이국적인 왕가의 문장이 새겨져 있다. 평범한 가출 소녀가 아니다.',
        '[완전 조사] 괴한들이 남긴 탄피와 외국어 무전 잔향 — 저택의 이슬람 회화 사건과 같은 나라(엘디아)에서 온 추격자들일 가능성이 높다.',
      ],
      requiredSteps: ['LOOK:harbor_alley', 'TALK:prisia_rem_crime'],
      talkLines: {
        prisia_rem_crime: [
          '「……고마워요. 저 사람들은 계속 나를 쫓아와요. 이름? …기억이 잘 나지 않지만, 당신은 믿어도 될 것 같아요.」',
          '「"푸딩"이라고 불러 줄래요? 당분간 여기 사무소에 있어도 될까요…?」',
          '「이 펜던트는 아주 소중한 거라는 느낌만 남아 있어요. 무섭지만… 코지로 옆에 있으면 안심이 돼요.」',
        ],
      },
      advanceNarration: '정체불명의 소녀에게 "푸딩"이라는 애칭을 붙이고 아마기 사무소에 보호했다. 내일(12월 4일) 카츠라기 사무소를 방문하기 전, 도쿄 어딘가에서 예일 학교 쪽 상황이 먼저 움직여야 한다.',
    },

    M_D1_01: {
      focusId: 'yale_corridor',
      focusLabel: '예일 외국인학교 복도와 경호 배치',
      focusLook: [
        '전속 강사 신분증으로 잠입 부임한 예일 외국인학교. 어제보다 교내 경비 분위기가 미묘하게 날카로워졌다.',
        '아랍어 강사 시리아 플랫이 창밖을 주시하고 있고, 경호 대상 미도 마야코는 경호원을 극도로 경계하고 있다.',
        '[완전 조사] 마야코가 관자놀이를 누르며 순간적으로 눈빛이 싸늘하게 바뀌었다가 곧장 원래의 유순한 표정으로 돌아왔다. 단순 두통이 아니다.',
      ],
      requiredSteps: ['LOOK:yale_corridor', 'TALK:mayako_mido'],
      talkLines: {
        mayako_mido: [
          '「당신이 아버지가 붙인 경호원인가요? 필요 없어요. 저는 혼자서도 괜찮으니까 따라다니지 마세요!」',
          '「…가끔 머리가 깨질 듯이 아프고 기억이 끊길 때가 있지만, 그건 그냥 피곤해서예요.」',
          '「밤에는 기숙사 방에서 조용히 쉴 테니까 문 앞에 서 계시지 마세요!」',
        ],
        celia_flat: [
          '「새로 오신 강사분이시군요. 아랍어를 가르치는 시리아 플랫입니다. 학교 일에 지나치게 깊이 관여하지 않는 편이 좋을 겁니다.」',
          '「이 학교엔 겉으로 보이는 것보다 훨씬 오래된 비밀이 묻혀 있으니까요.」',
          '「마야코 양을 정말 지키고 싶다면, 대사관의 말만 믿지 말고 스스로의 눈을 믿으세요.」',
        ],
        hiromi_matsuno: [
          '「선생님, 교내 안내해 드릴게요! 도서관 고미술 서고와 기숙사 별관 통로는 밤에 잠겨요.」',
          '「그런데 어젯밤 스트르만 교장 선생님이 자택으로 급히 돌아가신 뒤 연락이 닿질 않는대요.」',
          '「기숙사 쪽 야간 순찰하실 때 정전 차단기 위치를 꼭 확인해 두세요!」',
        ],
      },
      advanceNarration: '마야코의 경호 거부 반응과 수상한 기억 공백을 포착했다. 이제 기숙사 야간 순찰과 선 맨션 403호 보고를 점검할 차례다.',
    },

    M_D1_02: {
      focusId: 'yale_dorm_night_log',
      focusLabel: '예일 기숙사 야간 정전 흔적 & 선 맨션 403호 FAX',
      focusLook: [
        '기숙사 별관 복도의 비상등이 꺼져 있다. 마야코의 방문은 잠겨 있었지만, 창문 턱에 방금 밖에서 들어온 듯한 젖은 신발 자국이 남아 있다!',
        '선 맨션 403호로 돌아오자 직통 FAX 기기에서 긴급 보고서가 출력되어 있다 — "엘디아 비공식 요원 도쿄 잠입 및 스트르만 저택 주변 민간 탐정 접촉 확인".',
        '[완전 조사] 마야코의 심야 외출 시각과 기숙사 정전 시각이 정확히 겹친다. 누군가 야간에 마야코를 조종하거나, 마야코 자신이 알지 못하는 행동이 벌어지고 있다.',
      ],
      requiredSteps: ['LOOK:yale_dorm_night_log', 'TALK:yayoi_katsuragi'],
      talkLines: {
        mayako_mido: [
          '「네? 제가 방금 밖에 나갔다 왔다고요? 말도 안 돼요… 저는 계속 침대에 누워 있었는걸요…」',
          '「머리가 멍해요… 잠깐 눈을 감았다 떴는데 벌써 자정이 넘었네요…」',
          '「제발 아버지께는 이런 일이 있었다고 보고하지 말아 주세요. 부탁이에요.」',
        ],
        yayoi_katsuragi: [
          '「마리나 씨, 선 맨션 403호까지 초대해 줘서 고마워요. 술 한잔하면서 얘기하니 좀 풀리네요.」',
          '「실은 우리 카츠라기 탐정사무소에도 어제부터 엘디아 관련 수상한 회화 의뢰가 들어와서 신경이 쓰여요.」',
          '「내일 사무소에서 니카이도와 옛 동료(코지로)가 부딪힐 것 같은데… 부디 큰 사건이 아니었으면 좋겠어요.」',
        ],
      },
      advanceNarration: '기숙사 야간 이상과 선 맨션 403호 기밀 FAX를 확보했다. 야요이와의 회동 여파가 다음 날 카츠라기 탐정사무소 국면으로 이어진다! [SB_03 해제]',
    },

    K_D2_01: {
      focusId: 'akane_secret_photos',
      focusLabel: '시바타 아카네의 잠입 사진 & 전자수첩 접선 대조',
      focusLook: [
        '시바타 아카네가 밤새 현상해 온 잠입 사진! 분실 회화와 동일한 이슬람 문양 뒷면에 미세한 엘디아 왕실 각인과 학교 도서관 색인 번호가 찍혀 있다!',
        '니카이도에게 전자수첩을 돌려주기 전 대조해 둔 메모와 일치한다 — 목표는 단순한 그림이 아니라 엘디아의 "국새(国璽)"다!',
        '[완전 조사] 아카네의 사진 구석에 예일 외국인학교 정문을 나서는 검은 코트 남자(디브)의 뒷모습까지 포착되어 있다.',
      ],
      requiredSteps: ['LOOK:akane_secret_photos', 'ITEM:item_nikaido_organizer', 'TALK:akane_shibata'],
      talkLines: {
        yayoi_katsuragi: [
          '「니카이도가 요즘 밤마다 이상한 외국인과 몰래 거래하는 것 같아… 코지로, 이 사건은 우리 손에 벅찬 국제 음모일지도 몰라.」',
          '「어젯밤엔 내각조사실 쪽 지인(마리나)과도 잠깐 만났는데, 도쿄 전체가 엘디아 문제로 술렁이는 분위기야.」',
          '「아버지가 살아 계셨다면 절대 건드리지 말라고 하셨을 텐데…」',
        ],
        susumu_nikaido: [
          '「전자수첩을 돌려주러 왔다고? 흥, 네가 몰래 들여다본 건 아니겠지, 아마기 선배?!」',
          '「날 감시하지 마! 회화의 행방은 내가 거의 다 잡았다고. 방해하면 가만 안 둬!」',
          '「…젠장, 저쪽 놈들이 생각보다 훨씬 위험한 놈들이었어…」',
        ],
        akane_shibata: [
          '「짜잔! 특종 감각 발동해서 밤새 현상한 사진이야! 이 문양, 예일 외국인학교 도서관 고미술 자료랑 똑같대!」',
          '「도서관에 있는 마츠노 히로미라는 실습생한테 보여 주면 정확한 연대와 암호를 알 수 있을 거야.」',
          '「참, 어제부터 보험 외판원처럼 생긴 중년 남자가 학교 주변을 맴돌고 있더라?」',
        ],
      },
      advanceNarration: '니카이도에게 전자수첩을 반환하고 아카네의 결정적 사진을 확보했다. 코지로가 회화 뒷면 암호에 손을 대자, 이를 감지한 그림자가 마리나 쪽에 움직이기 시작한다! [SB_04 해제]',
    },

    M_D2_01: {
      focusId: 'suzuki_business_card',
      focusLabel: '보험 외판원 "스즈키 겐자부로"의 명함과 예일 교내 감시',
      focusLook: [
        '선 맨션 로비와 예일 학교 교정에 연달아 나타난 중년 남자. 건넨 명함에는 평범한 "보험회사 세일즈맨 스즈키 겐자부로"라고 적혀 있다.',
        '하지만 그의 걸음걸이와 시선 처리는 일류 첩보원 그 자체다. 명함 뒷면에 연필로 아주 옅게 "디렉터룸 금고 — 절반의 진실"이라 적혀 있다!',
        '[완전 조사] 스즈키는 내각조사실의 내부 사정뿐 아니라 엘디아 구 정보부의 비밀까지 꿰뚫고 있다. 적이 아니라 모종의 죄책을 갚으려는 인물이다.',
      ],
      requiredSteps: ['LOOK:suzuki_business_card', 'TALK:genzaburo_katsuragi'],
      talkLines: {
        genzaburo_katsuragi: [
          '「실례합니다, 보험회사 세일즈맨 스즈키 겐자부로라고 합니다. 아가씨, 내각조사실 소속이시죠? 디렉터룸의 물건은 함부로 건드리면 목숨이 위태롭습니다.」',
          '「국새는 둘로 나뉘어 숨겨졌소. 그리고 이 사건의 뿌리에는 오래전 끝났어야 할 "C 프로젝트"가 있소…」',
          '「로스=미도 대사를 믿지 마시오. 진실은 학교 뒤편 디렉터룸에서 시작될 거요.」',
        ],
        mayako_mido: [
          '「선생님, 방금 그 보험 아저씨랑 무슨 얘기를 하신 거예요? 어쩐지… 어딘가에서 본 적이 있는 얼굴 같은데.」',
          '「그 아저씨 눈을 보는 순간 가슴이 먹먹해지고 머리가 또 지끈거렸어요…」',
          '「제발 아버지께는 제가 두통을 앓는다는 말은 하지 말아 주세요.」',
        ],
      },
      advanceNarration: '수수께끼의 남자 "스즈키 겐자부로"로부터 국새 양분과 C 프로젝트의 경고를 들었다. 이제 학교 뒤편 디렉터룸에 은밀히 침입할 차례다.',
    },

    M_D2_02: {
      focusId: 'director_room_vault',
      focusLabel: '예일 외국인학교 디렉터룸 비밀 금고 & 서류',
      focusLook: [
        '학교 뒤편 디렉터룸을 은밀히 수색했다. 책장 뒤 이중 패널을 열자 스트르만 교장의 비상 금고가 모습을 드러낸다!',
        '금고 안에는 엘디아 기밀 서류와 함께 "둘로 쪼개진 국새(国璽)" 중 학교 측 절반 조각이 보관되어 있었다!',
        '[완전 조사] 스트르만의 메모: "나머지 절반은 자택의 이슬람 문양 회화 암호 속에 두었다. 결코 로스=미도에게 넘겨서는 안 된다." — 그 순간 문이 열리며 낯선 여성이 총구를 겨누지 않고 조용히 들어온다.',
      ],
      requiredSteps: ['LOOK:director_room_vault@2', 'TALK:kyoko_himuro'],
      talkLines: {
        kyoko_himuro: [
          '「역시 내각조사실 요원이었군요. 저는 교육감시기구의 히무로 쿄코. 이 학교의 자금 비리를 추적하고 있었습니다.」',
          '「교장 스트르만 씨의 행방이 어제부터 묘연합니다. 디렉터룸에서 찾은 그 국새 조각, 절대 대사관에 들키지 마세요.」',
          '「내일쯤 결정적인 변고가 터질 예감이 듭니다. 그때 정식으로 공조합시다.」',
        ],
        genzaburo_katsuragi: [
          '「금고를 열어 보셨군요. 이제 돌이킬 수 없습니다, 호죠 마리나 씨.」',
          '「나머지 절반은 바깥의 누군가가 쫓고 있을 겁니다. 때가 되면 두 조각이 한곳으로 모이겠지요.」',
          '「히무로라는 아가씨는 믿어도 좋습니다. 지금은 흔적을 지우고 물러나시오.」',
        ],
      },
      advanceNarration: '디렉터룸에서 학교 측 국새 조각을 확보하고 히무로 쿄코와 접촉했다. 교내 보안이 흔들리며 코지로의 도서관 수사에 돌파구가 열린다! [SB_05 해제]',
    },

    K_D2_02: {
      focusId: 'library_art_archive',
      focusLabel: '예일 학교 도서관 고미술 아카이브 & 회화 암호 해독',
      focusLook: [
        '예일 학교 도서관의 고미술 자료와 아카네의 회화 사진을 대조했다. 이슬람 문양은 엘디아 왕위 계승의 상징인 "국새(国璽)"의 절반 위치를 가리키는 암호였다!',
        '스트르만 저택 서재의 좌표와 맞물려 국새의 저택·회화 측 절반을 마침내 회수했다!',
        '[완전 조사] 나머지 절반은 학교 깊은 어딘가(디렉터룸)에 숨겨졌다는 소문이 돈다. 도서관 창밖에서 아랍어 강사 시리아 플랫이 조용히 나를 부른다.',
      ],
      requiredSteps: ['LOOK:library_art_archive', 'TALK:hiromi_matsuno', 'TALK:celia_flat'],
      talkLines: {
        hiromi_matsuno: [
          '「이 이슬람 문양 회화요? 엘디아 왕가의 국새 문양과 100% 일치해요! 저택 서재의 암호를 풀면 절반의 위치를 알 수 있을 거예요.」',
          '「참, 방금 전 학교 뒤편 디렉터룸 쪽이 한바탕 소란스러웠대요. 누군가 조사하고 간 것 같아요.」',
          '「교장 선생님이 왜 이렇게까지 국새를 쪼개 숨기셨을까요… 조금 무서워졌어요.」',
        ],
        celia_flat: [
          '「아마기 코지로… 카츠라기 겐자부로의 양자 맞지요? 저는 시리아 플랫. 엘디아의 음모를 내부에서 막으려 하고 있어요.」',
          '「당신이 의뢰받은 회화는 단순한 그림이 아닙니다. 진짜 표적은 엘디아의 국새와 정통 왕위 계승자예요.」',
          '「당신과 나는… 생각보다 훨씬 가까운 혈연으로 얽혀 있어요. 내일 아침 신문을 보면 모든 의문이 폭발할 겁니다.」',
        ],
      },
      advanceNarration: '저택·회화 측 국새 조각을 손에 넣고 시리아 플랫의 수상한 암시를 들었다. 다음 날 아침(12월 5일), 충격적인 신문 보도가 도착한다.',
    },

    K_D3_01: {
      focusId: 'morning_newspaper',
      focusLabel: '12월 5일 조간 신문 1면 (스트르만 교장 피살 & 니카이도 수배)',
      focusLook: [
        '조간 신문 1면에 실린 충격적인 사진 — "예일 외국인학교 교장 스트르만=코우 피살, 용의자 니카이도 스스무 전국 지명수배"!',
        '사진 속 진본 스트르만 교장의 얼굴은 12월 3일 나에게 회화 수색을 의뢰한 남자와 완전히 다른 인물이다! 내가 만난 의뢰인은 가짜(사칭범)였다!',
        '[완전 조사] 카츠라기 탐정사무소로 항의 전화가 빗발치고 있다. 니카이도는 범인이 아니라 사칭범이 쳐 놓은 덫에 희생양으로 걸려든 것이다!',
      ],
      requiredSteps: ['LOOK:morning_newspaper', 'TALK:akane_shibata', 'TALK:yayoi_katsuragi'],
      talkLines: {
        akane_shibata: [
          '「코지로, 신문 봤어?! 내가 중개해 준 의뢰인이 가짜 스트르만이었다니! 니카이도까지 수배범이 됐잖아!」',
          '「미안해, 나도 완전히 속았어. 샷 바의 정보상 구렌이라면 엘디아 쪽 암살자 정보를 알지도 몰라!」',
          '「가짜 스트르만의 몽타주와 대사관 쪽 인물들을 대조해 볼게. 먼저 샷 바로 가 봐!」',
        ],
        yayoi_katsuragi: [
          '「아침부터 경찰과 기자들 전화가 끊이질 않아… 니카이도는 어젯밤부터 행방불명이야.」',
          '「코지로, 니카이도가 성급한 녀석이긴 해도 사람을 죽일 놈은 아니야. 진짜 범인을 꼭 잡아 줘!」',
          '「그 가짜 의뢰인이 엘디아 대사관과 연결되어 있다면, 정부 쪽에서도 분명 움직였을 거야.」',
        ],
        stollman_kou: [
          '[신문 기사 기록] 진본 스트르만=코우 교장은 이미 고문 끝에 피살된 상태로 발견되었다.',
          '[부검 보도] 사망 추정 시각은 12월 3일 밤 이전. 코지로가 저택에서 만난 남자는 명백한 사칭범이었다.',
          '[유류품 기록] 현장에서는 분실된 회화의 행방이 끝내 발견되지 않았다.',
        ],
      },
      advanceNarration: '의뢰인이 가짜(사칭범)였음이 폭로되었고 니카이도의 누명을 벗길 단서를 쫓아 샷 바로 향한다. 이 보도의 파장이 마리나 측 학교·대사관 국면에 직격한다! [SB_06 해제]',
    },

    K_D3_02: {
      focusId: 'shot_bar_counter',
      focusLabel: '샷 바 카운터의 뒷세계 첩보와 수수께끼 미녀',
      focusLook: [
        '네온 불빛이 어른거리는 샷 바. 정보상 구렌이 건넨 낡은 서류 봉투에는 엘디아 구 정보부의 극비 공작원 파일이 담겨 있다.',
        '카운터 반대편에 홀로 앉아 위스키를 기울이는 이국적인 미녀 "아쿠아". 고급 코트와 경호원이 없는 부자연스러운 여유가 시선을 끈다.',
        '[완전 조사] 아쿠아의 손목시계에는 엘디아 고위 관료 전용 문양이 희미하게 새겨져 있다. 평범한 손님이 아니다.',
      ],
      requiredSteps: ['LOOK:shot_bar_counter', 'TALK:glen', 'TALK:aqua_still_lloyd'],
      talkLines: {
        glen: [
          '「오랜만이군, 아마기. 스트르만을 고문 살해하고 사칭한 놈은 엘디아 정보부 간부 "디브"다.」',
          '「그리고 하나 더 — 엘디아 구 정보부엔 전설의 암살자 "테러"가 있었다. 디브와는 또 다른 그림자가 도쿄에서 움직이고 있어.」',
          '「엘디아 대사관에 잠입할 생각이라면 히무로 쿄코라는 여자를 만나 봐. 도청 장비와 디스크 해독에 쓸 만할 거다.」',
        ],
        aqua_still_lloyd: [
          '「혼자 마시는 술은 쓰네요… 저는 아쿠아. 사립탐정이라니 흥미롭군요. 진실은 때로 겉모습과 정반대인 법이에요.」',
          '「누군가는 평화를 원하지만, 망령 같은 과거가 그걸 허락하지 않죠. 조심하세요, 탐정님.」',
          '「만약 대사관 어딘가에서 내 이름이 적힌 암호 디스크를 보게 된다면… 그 안에 엘디아의 죄가 담겨 있을 거예요.」',
        ],
      },
      advanceNarration: '사칭범 "디브"와 암살자 "테러"의 존재를 파악하고 수수께끼의 미녀 "아쿠아"와 조우했다. 이제 엘디아 대사관에 잠입할 틈이 열리기를 기다린다.',
    },

    M_D3_01: {
      focusId: 'himuro_ministry_file',
      focusLabel: '히무로 쿄코의 교육감시기구 기밀 보고서',
      focusLook: [
        '스트르만 교장 피살 보도 직후 예일 학교가 임시 휴교에 들어갔다. 히무로 쿄코가 건넨 교육감시기구 파일에는 충격적인 자금 흐름이 기록되어 있다.',
        '예일 외국인학교의 설립 자금 전액이 엘디아 비밀 예산에서 유입되었으며, 로스=미도 대사와 아쿠아 수상 라인이 직접 연루되어 있다.',
        '[완전 조사] 선 맨션 FAX 보고서와 대조한 결과, 이 모든 기밀의 원본이 내각조사실 본부 DBMS Level-7 영역에 봉인되어 있음이 확인되었다.',
      ],
      requiredSteps: ['LOOK:himuro_ministry_file', 'TALK:kyoko_himuro'],
      talkLines: {
        kyoko_himuro: [
          '「호죠 씨, 이제 정식으로 공조합시다. 스트르만 교장을 죽인 건 엘디아 정보부의 디브예요. 그리고 내각조사실 본부 DBMS에 "C 프로젝트" 기밀이 숨겨져 있습니다.」',
          '「예일 학교는 단순한 외국인학교가 아니라 엘디아의 특수 인물을 관찰하기 위한 위장 시설이었어요.」',
          '「먼저 엘디아 대사관에 가서 아쿠아 수상과 로스=미도의 반응을 떠보세요. 저도 바깥 협력자(코지로)와 보조를 맞출게요.」',
        ],
        celia_flat: [
          '「교장 선생님이 그렇게 되시다니… 호죠 씨, 디브가 대사관에 드나들고 있어요. 각별히 조심하세요.」',
          '「마야코 양을 대사관 안쪽에 오래 두지 마세요. 로스 대사는 당신이 생각하는 아버지가 아닙니다.」',
          '「저도 제 방식대로 움직이겠습니다. 나중에 진실 앞에서 다시 만나죠.」',
        ],
      },
      advanceNarration: '히무로 쿄코와 정식 공조를 맺고 예일 학교의 배후 목적을 파악했다. 이제 주일 엘디아 대사관을 재방문해 로스=미도와 아쿠아 수상을 직접 대면한다.',
    },

    M_D3_02: {
      focusId: 'embassy_security_log',
      focusLabel: '주일 엘디아 대사관 경비 변동 기록 & 아쿠아 수상 동향',
      focusLook: [
        '스트르만 교장 피살 보도 직후 엘디아 대사관의 경비가 극도로 강화되었다. 복도 끝에서 공작원 디브가 로스=미도와 밀담을 나누다 사라진다.',
        '집무실 응접 의자 밑에 아주 미세한 금속 광택이 스친다 — 누군가 방금 전까지 이곳을 노리고 있었다! 눈치를 채지 못한 척 대화를 유도하자.',
        '[완전 조사] "대사관 경비를 전면 재점검해야 한다"고 일부러 크게 발언해 로스=미도의 심기를 흔들고 외부 수사자에게 경비 공백 신호를 보냈다!',
      ],
      requiredSteps: ['LOOK:embassy_security_log', 'TALK:aqua_still_lloyd', 'TALK:ross_mido'],
      talkLines: {
        ross_mido: [
          '「스트르만 교장의 비보는 참으로 유감입니다. 아쿠아 수상님도 방일 중이시니 마야코 경호를 더욱 철저히 해 주십시오.」',
          '「경비 강화라니요? 대사관 내부 보안은 엘디아 자체 인력으로 충분합니다. 월권행위는 삼가 주시길.」',
          '「내일 내각조사실 본부 쪽에 호죠 수사원의 태도에 대해 정식 항의를 넣겠습니다.」',
        ],
        aqua_still_lloyd: [
          '「호죠 마리나 수사원, 수고가 많군요. 저는 엘디아 공화국 수상 아쿠아=스틸=로이드. 개혁을 가로막는 구 세력의 음모를 반드시 막아야 합니다.」',
          '「…어젯밤 시내 샷 바에서 흥미로운 사립탐정을 만났던 건 둘만의 비밀로 해 두죠.」',
          '「내일 모레 트리스탄호 출항 전에 모든 진실이 밝혀져야 합니다. 부디 끝까지 포기하지 마세요.」',
        ],
        dib: [
          '「내각조사실 개가 대사관 주변을 어슬렁거리는군. 엘디아의 일에 코를 박으면 살아서 돌아가지 못할 거다.」',
          '「스트르만? 니카이도라는 일본인 탐정이 저지른 짓이잖아? 하하하…」',
          '「곧 네놈도 본부 감찰관 손에 묶이게 될 거다.」',
        ],
      },
      advanceNarration: '대사관에서 아쿠아 수상을 알현하고 경비 강화 발언으로 로스=미도를 흔들었다! 이 틈을 타 외부의 코지로가 대사관 도청과 디스크 회수에 성공한다! [SB_07 해제]',
    },

    K_D3_03: {
      focusId: 'embassy_chair_wiretap',
      focusLabel: '로스=미도 집무실 의자 밑 도청기 & 아쿠아 암호 플로피 디스크',
      focusLook: [
        '기자 신분으로 위장해 주일 엘디아 대사관 집무실에 잠입했다! 로스=미도가 잠시 자리를 비운 틈에 의자 밑에 초소형 도청기를 부착했다!',
        '책상 단말기 슬롯에서 "AQUA-OLD-INTEL" 라벨이 붙은 암호 플로피 디스크를 빼내 회수했다! 직후 수신기에서 낯선 여성 정부 요원(마리나)의 목소리가 흘러나온다!',
        '[완전 조사] 수신기 너머 여성 요원이 일부러 경비 강화를 거론하며 대사를 압박하고 있다 — 나에게 보내는 암묵적 신호이자 완벽한 교란 연기다! 대단한 실력자인걸.',
      ],
      requiredSteps: ['LOOK:embassy_chair_wiretap@2', 'ITEM:item_embassy_wiretap', 'TALK:kyoko_himuro'],
      talkLines: {
        ross_mido: [
          '「언론 취재라면 홍보관을 통하십시오. 스트르만 교장 사건과 엘디아 대사관은 아무런 관련이 없습니다.」',
          '「…잠깐, 당신은 카츠라기 겐자부로 밑에 있던 아마기 코지로 아닌가? 당장 대사관에서 나가게!」',
          '「경비원! 대사관 보안 점검을 즉시 실시하고 내각조사실에 항의 전문을 보내라!」',
        ],
        kyoko_himuro: [
          '「아마기 씨, 대단해요! 도청 녹취에 아쿠아의 암호 플로피 디스크까지 빼내 오시다니!」',
          '「디스크를 해독해 보니 로스=미도가 과거 엘디아 구 정보부 수장이었고, 내각조사실 본부 DBMS에 접근할 정규 인증 키까지 들어 있어요!」',
          '「내일(12월 6일) 내각조사실 안에서 누군가 DBMS 침입을 시도할 때, 우리가 이 키로 동시 접속하면 철벽 보안을 뚫을 수 있어요!」',
        ],
      },
      advanceNarration: '대사관 도청 녹취와 아쿠아 암호 플로피 디스크를 손에 넣었다! 외교 보안 경보가 내각조사실 본부로 날아가며 마리나의 12월 6일 사문과 DBMS 침입을 촉발한다! [SB_08 해제]',
    },

    M_D4_01: {
      focusId: 'dbms_level7_terminal',
      focusLabel: '내각조사실 본부 사문실 & DBMS Level-7 보안 터미널',
      focusLook: [
        '엘디아 대사관의 공식 항의로 카가와 미스미 감찰관의 집요한 사문이 시작되었다! 카가와가 코노 본부장과 내연 관계라는 약점이 대화 틈새마다 노골적으로 드러난다.',
        '사문 휴정 틈을 타 코노 본부장의 권한 코드로 본부 DBMS 심야 터미널에 침입했다 — 순간 화면이 붉게 점멸한다: [ACCESS DENIED: LEVEL-7 SECURITY LOCK]!',
        '[완전 조사] 브루트포스와 우회 시도가 모두 교착(DEADLOCK) 상태에 걸렸다! 마리나 단독 침입으로는 절대 Level-7 프로텍트를 돌파할 수 없다!',
      ],
      requiredSteps: ['LOOK:dbms_level7_terminal@2', 'TALK:misumi_kagawa', 'TALK:kyoko_himuro'],
      talkLines: {
        misumi_kagawa: [
          '「호죠 마리나! 엘디아 대사관에서 공식 항의가 들어왔어! 경호 임무를 망치고 월권행위를 일삼은 책임을 반드시 묻겠다!」',
          '「코노 본부장님도 이번만큼은 네 편을 들어 주지 못하실 거야. 그분은 누구보다 조직의 체면을 중시하시니까… 나처럼 말이야.」',
          '「사문실 밖으로 한 발짝도 나가지 마. 감찰 처분이 나올 때까지 대기해!」',
        ],
        saburo_kouno: [
          '「마리나… 미안하지만 지금은 카가와의 사문에 따르는 척하고 있어라. 대사관 측 압력이 장관이 직접 내려보낼 정도다.」',
          '「내 단말기 보안 레벨은 Level-7 바로 아래까지 열려 있다. 하지만 절대 C 프로젝트 파일엔 손대지 마라…」',
          '「카가와와 내 사적인 일은 임무와 별개다. 더는 묻지 마라.」',
        ],
        kyoko_himuro: [
          '「안 돼요, Level-7 실시간 락이 걸렸어요! 단독 해킹으로는 절대 뚫리지 않아요!」',
          '「이 DBMS의 유일한 약점은… 정확히 같은 시각에 외부에서 "정규 프로토콜"로 동시 접속이 들어와 교착(Deadlock) 타임래그가 발생하는 순간뿐이에요!」',
          '「제가 외부 협력자(코지로)에게 지금 즉시 동시 접속 신호를 보낼게요! 조금만 버텨 주세요!」',
        ],
      },
      advanceNarration: 'Level-7 보안 장벽에 완전히 봉쇄되었다! [SB_09 점화] — 마리나 단독으로는 돌파 불가능하다. 지금 즉시 SIGHT CHANGE로 코지로 시점으로 전환해 동시 접속 타임래그를 열어야 한다! [SB_10 대기]',
    },

    K_D4_01: {
      focusId: 'agency_modem_terminal',
      focusLabel: '아마기 사무소 원격 모뎀 & 본부 DBMS 동시 정규 접속 프로토콜',
      focusLook: [
        '히무로 쿄코가 가져온 본부 DBMS 정규 접속 단말과 아쿠아 암호 디스크 인증 키. 지금 정확히 이 시각, 내각조사실 본부 서버 어딘가에서 치열한 보안 경합이 벌어지고 있다!',
        '정규 접속 계정(ITEM: 히무로 제공 DBMS 정규 접속 단말·계정)을 지금 실행하면 서버에 동시 접근 데드락 타임래그가 발생할 것이다!',
        '[완전 조사] 대사관 도청기 너머로 들었던 그 여성 정부 요원이 지금 본부 안에서 필사적으로 벽을 두드리고 있다. 내가 여기서 문을 열어 줄 차례다!',
      ],
      requiredSteps: ['TALK:kyoko_himuro', 'ITEM:item_dbms_access_credential'],
      talkLines: {
        kyoko_himuro: [
          '「아마기 씨, 지금이에요! 아쿠아의 디스크 인증 키를 연동한 DBMS 정규 접속 단말로 동시에 조회 요청을 보내 주세요!」',
          '「내각조사실 안의 요원(마리나)이 지금 막 Level-7 장벽과 씨름하고 있을 타이밍이에요. 소지품(ITEM)에서 DBMS 접속 단말을 사용하세요!」',
          '「성공했어요! 0.8초의 데드락 타임래그가 열렸습니다! 이제 안쪽에서 기밀을 빼낼 수 있을 거예요!」',
        ],
      },
      advanceNarration: '동시 정규 접속 실행 성공! [DBMS DEADLOCK TIME-LAG OPEN] — 본부 서버의 보안 락에 0.8초의 치명적인 균열이 열렸다! 마리나 시점의 Level-7 봉쇄가 즉시 해제된다! [SB_10 돌파]',
    },

    M_D4_02: {
      focusId: 'c_project_screen',
      focusLabel: 'C 프로젝트 극비 데이터 화면 (코드명 μ-101 · 기억 이식)',
      focusLook: [
        '정체불명의 외부 동시 접속으로 생긴 타임래그 틈새로 Level-7 프로텍트를 돌파했다! 화면에 떠오른 극비 파일: "C 프로젝트 — 유기 휴머노이드 클론 μ-101 및 전 국왕 기억 이식 실험"!',
        '데이터를 백업한 직후 카가와가 터미널 전원을 강제 차단하며 무장 병력을 이끌고 사문실로 들이닥쳤다! 애총 "이쿠이쿠"(ITEM)로 코노 본부장을 인질 삼아 돌파할지 선택해야 한다!',
        '[완전 조사] C 프로젝트의 총괄 책임자 명단에 로스=미도, 스트르만=코우, 그리고 "전 테러 부대장 카츠라기 겐자부로"의 이름이 나란히 기록되어 있다!',
      ],
      requiredSteps: ['LOOK:c_project_screen', 'ITEM:item_ikuiku_handgun'],
      crisis: {
        prompt: '카가와 미스미가 무장 경비와 함께 마리나를 포위했다! 사문 위기를 어떻게 돌파할 것인가?',
        safeChoiceId: 'safe_hostage_escape',
        safeLabel: '애총 "이쿠이쿠"로 코노 본부장을 인질로 삼아 강행 돌파',
        fatalChoiceId: 'fatal_surrender_kagawa',
        fatalLabel: '[위험] 무기를 버리고 카가와의 사문에 순순히 투항한다',
        fatalNarration: '무기를 내려놓은 순간, 엘디아 음모 세력의 사주를 받은 암살 요원이 구금실로 잠입해 C 프로젝트 데이터를 탈취하고 마리나를 제거했다…',
      },
      talkLines: {
        saburo_kouno: [
          '「마리나! 네가 내 머리에 총구를 겨눌 줄이야… 크윽, C 프로젝트에 손대면 정말 돌이킬 수 없다!」',
          '「카가와, 총을 내려라! 이 녀석은 진심이다… 알겠다 마리나, 네가 진실을 밝힐 수 있다면 이번 한 번만 눈감아 주지. 어서 도망쳐!」',
          '「트리스탄호로 갈 셈이라면 살아 돌아와라. 내각조사실의 명예가 네 손에 달렸다.」',
        ],
        misumi_kagawa: [
          '「멈춰, 호죠 마리나! 불법 DBMS 침입에 본부장 협박까지! 당장 무기를 버려!」',
          '「비, 비겁하게 본부장님을 방패로 삼다니… 총을 내릴 테니 본부장님께 손대지 마!」',
          '「칫… 놓치다니! 전 구역에 마리나 수배령을 내려라!」',
        ],
        genzaburo_katsuragi: [
          '「잘 빠져나왔군, 아가씨. C 프로젝트의 진실은 곧 호화 여객선 트리스탄호에서 결판날 거요.」',
          '「프린세스 호텔 쪽에 숨겨 둔 정통 왕위 계승자 프리시아 공주를 호위 인계받아 승선하게.」',
          '「내 과거의 죄도 트리스탄호에서 함께 끝낼 때가 왔소.」',
        ],
      },
      advanceNarration: 'C 프로젝트 기밀(μ-101 기록)을 확보하고 코노 본부장 인질극으로 사문 포위를 극적으로 탈출했다! 기밀 유출에 경악한 엘디아 정보부가 즉각 코지로와 푸딩을 향해 습격 명령을 내린다! [SB_11 해제]',
    },

    K_D4_02: {
      focusId: 'princess_hotel_ambush',
      focusLabel: '항구 창고·프린세스 호텔 대치 현장 & 푸딩의 비밀',
      focusLook: [
        '행방불명됐던 푸딩과 재회했다! 그녀의 표식(ITEM: 푸딩의 소지품)과 시리아의 증언이 하나로 맞아떨어진다 — 푸딩은 암살을 피하기 위해 스트르만의 약물로 보호 인격을 만든 엘디아 정통 왕녀 "프리시아 렘 크라임"이다!',
        '그 순간 가짜 스트르만 "디브"가 무장 부하들을 이끌고 항구 창고로 들이닥쳤다! 프리시아를 지키며 돌파해야 한다!',
        '[완전 조사] 시리아 플랫이 총격 사이로 뛰어들어 퇴로를 연다 — 그녀는 카츠라기 겐자부로의 친딸이자 야요이의 이복자매였다!',
      ],
      requiredSteps: ['LOOK:princess_hotel_ambush', 'ITEM:item_purin_pendant'],
      crisis: {
        prompt: '가짜 스트르만(디브)이 총구를 겨누며 습격했다! 어떻게 대응할 것인가?',
        safeChoiceId: 'safe_evade_dib_ambush',
        safeLabel: '푸딩(프리시아)을 엄호하며 창고 지형을 이용해 디브의 습격을 돌파',
        fatalChoiceId: 'fatal_charge_dib_unarmed',
        fatalLabel: '[위험] 무방비 상태로 디브의 총구 앞에 정면 돌진한다',
        fatalNarration: '디브의 냉혹한 사격이 빗발치며 코지로가 쓰러졌고, 프리시아 공주는 엘디아 정보부에 납치되고 말았다…',
      },
      talkLines: {
        prisia_rem_crime: [
          '「코지로… 내 진짜 이름은 "프리시아 렘 크라임". 암살자들을 피하려 스트르만 박사의 약물로 "푸딩" 인격을 만들어 숨어 있었어요.」',
          '「끝까지 나를 지켜줘서 고마워요! 내일 엘디아로 출항하는 호화 여객선 트리스탄호에 모든 음모가 모여 있어요.」',
          '「정부 쪽 호위 요원에게 인계되어 배에 오를게요. 코지로, 반드시 다시 만나요!」',
        ],
        dib: [
          '「아마기 코지로! 국새 회화 찾기에 써먹고 버릴 탐정 따위가 프리시아 공주를 숨기고 있었군! 여기서 끝장내 주마!」',
          '「내각조사실 기밀까지 새어 나간 이상 너희를 살려 둘 수 없다!」',
          '「칫, 시리아 네년 배신했구나! 트리스탄호에서 모두 바다에 수장시켜 주마!」',
        ],
        celia_flat: [
          '「코지로, 어서 프리시아 공주를 데리고 빠져나가! 난 야요이의 이복자매이자 카츠라기 겐자부로의 딸이야.」',
          '「아버지가 살아 계셔서 지금도 뒤에서 우리를 돕고 있어. 프리시아는 내각조사실 요원(마리나)에게 맡겨야 안전해!」',
          '「트리스탄호로 가! 모든 사건의 흑막이 그 배 안에 있어!」',
        ],
      },
      advanceNarration: '푸딩의 정체가 이중인격으로 위장한 프리시아 공주임을 확인하고 디브의 습격을 돌파했다! 이제 12월 7일(Day 5), 호화 여객선 트리스탄호로 잠입한다.',
    },

    K_D5_01: {
      focusId: 'tristan_pier_infiltration',
      focusLabel: '도쿄만 부두 출항구 & 트리스탄호 화물 갑판 잠입로',
      focusLook: [
        '엘디아로 출항하는 초호화 여객선 트리스탄호. 부두 전역이 엘디아 사설 경비대로 봉쇄되어 있고, 로스=미도 대사와 고위 인사들이 승선하고 있다.',
        '야요이와 아카네의 교란 덕에 화물 갑판으로 잠입하는 데 성공했지만, 순찰 경비와 정면 충돌하며 어깨에 총상을 입고 말았다!',
        '[완전 조사] 피를 흘리며 하층 통로로 몸을 피했다. 멀리서 기관실 엔진 소리가 울리고 — 누군가 나를 기관실 안쪽으로 끌어당겼다.',
      ],
      requiredSteps: ['LOOK:tristan_pier_infiltration', 'TALK:yayoi_katsuragi'],
      talkLines: {
        yayoi_katsuragi: [
          '「코지로, 무리하지 마! 니카이도가 트리스탄호에 탔다는 제보가 들어왔어. 하지만 함정일 수도 있어!」',
          '「시리아가 내 이복자매라니… 아버지가 정말 살아 계시다면 반드시 직접 확인해야 해.」',
          '「화물 통로 경비 시선을 돌릴 테니까 지금 잠입해! 꼭 살아서 돌아와야 해!」',
        ],
        akane_shibata: [
          '「트리스탄호 승객 명단을 빼냈어! 로스=미도, 아쿠아 수상, 미도 마야코, 그리고 위조 여권으로 탄 디브까지 전원 탑승했어!」',
          '「게다가 내각조사실 수배령이 떨어진 여자 요원(마리나)도 몰래 배에 탔다는 소문이 돌아.」',
          '「특종은 내가 준비해 둘 테니 코지로는 목숨만 붙여 돌아와!」',
        ],
      },
      advanceNarration: '총상을 입은 채 트리스탄호 하층부로 잠입했다. 의식이 흐려지는 가운데 누군가의 부축을 받으며 기관실로 옮겨진다.',
    },

    K_D5_02: {
      focusId: 'tristan_engine_room',
      focusLabel: '트리스탄호 기관실 — 안경 벗은 마야코와 사라진 국새 조각',
      focusLook: [
        '굉음이 울리는 트리스탄호 기관실. 눈을 뜨자 총상에 붕대를 감아 주고 있는 건 — 평소와 전혀 다른 분위기의, 안경을 벗은 미도 마야코였다!',
        '안경을 벗은 마야코의 얼굴을 가까이서 본 순간 등골이 서늘해진다… 창고 거리에서 구했던 "푸딩(프리시아)"과 소름 끼치도록 닮았다!',
        '[완전 조사] 마야코가 잠시 물을 가지러 나간 뒤 코트 안주머니를 확인했다 — 텅 비어 있다!! 내가 갖고 있던 "국새(国璽) 조각"이 감쪽같이 사라졌다!',
      ],
      requiredSteps: ['LOOK:tristan_engine_room@2', 'TALK:mayako_mido'],
      talkLines: {
        mayako_mido: [
          '「다행이다, 눈을 뜨셨군요 코지로 씨! 복도에서 피를 흘리고 쓰러져 계셔서 기관실로 모셨어요.」',
          '「제 얼굴이 누군가와 닮았다고요? …안경을 벗어서 그런가 봐요. 이상하네요, 이 배에 탄 뒤로 계속 심한 두통이 와요.」',
          '「잠시만요… 아까 제가 코지로 씨 상처를 치료할 때, 잠깐 기억이 끊겼던 것 같아요… 혹시 뭔가 잃어버리신 건 없나요?」',
        ],
      },
      advanceNarration: '안경을 벗은 마야코와 프리시아의 소름 끼치는 유사성, 그리고 사라진 국새 조각! 기관실을 나와 갑판으로 올라가는 순간 선내에 연쇄 총성이 울린다!',
    },

    K_D5_03: {
      focusId: 'tristan_crime_scene',
      focusLabel: '트리스탄호 갑판·객실 연쇄 살인 현장',
      focusLook: [
        '트리스탄호 선내는 이미 아수라장이었다! 니카이도 스스무, 사칭범 디브, 그리고 아쿠아(엘디아 수상!)까지 잇달아 피살되는 연쇄 살인이 벌어졌다!',
        '스트르만 교장을 죽인 건 디브였지만, 니카이도·디브·아쿠아를 차례로 냉혹하게 제거한 진범 "테러"는 완전히 다른 존재다!',
        '[완전 조사] 폭발 경보가 울리는 가운데 부상당한 몸을 이끌고 마야코와 함께 선창 격벽 안쪽으로 피신했지만, 외부에서 철문이 닫히며 고립되고 말았다!',
      ],
      requiredSteps: ['LOOK:tristan_crime_scene', 'TALK:mayako_mido'],
      talkLines: {
        mayako_mido: [
          '「코지로 씨, 괜찮으세요?! 선내에 총소리가 울리고 사람들이 쓰러졌어요… 어서 이 선창 안으로 피하세요!」',
          '「…이상해요. 아쿠아 언니가 쓰러질 때, 제 기억이 또 잠깐 끊겼어요… 제 손에 왜 화약 냄새가 나죠?」',
          '「누군가 선창 문을 열고 내려오고 있어요… 호죠 마리나 선생님?!」',
        ],
        susumu_nikaido: [
          '[현장 기록] 니카이도 스스무는 국새 뒷거래의 끝에서 암살자 "테러"의 손에 이미 목숨을 잃었다.',
          '[현장 기록] 그의 손에는 누명을 벗기려던 마지막 메모 조각이 쥐어져 있었다.',
        ],
        aqua_still_lloyd: [
          '[현장 기록] 샷 바에서 만났던 미녀 아쿠아의 정체는 엘디아 수상 아쿠아=스틸=로이드였다.',
          '[현장 기록] 그녀 역시 프리시아 즉위를 인정하고 쿠데타를 막으려다 "테러"에게 피살되었다.',
        ],
        dib: [
          '[현장 기록] 스트르만을 사칭했던 디브마저 선내에서 "테러"에게 일격에 제거되었다.',
        ],
      },
      advanceNarration: '코지로는 마야코와 함께 트리스탄호 선창에 고립되었다. 이제 마리나(+프리시아)가 선창에 돌입할 때 최종 수렴편이 열린다! [SB_12 코지로 측 완료]',
    },

    M_D5_01: {
      focusId: 'tristan_boarding_manifest',
      focusLabel: '프리시아 왕녀 호위 인계 & 트리스탄호 강행 승선 루트',
      focusLook: [
        '엘디아 정통 왕위 계승자 프리시아 공주를 안전하게 호위 인계받았다! 히무로 쿄코가 선내 보안 카메라를 교란하는 틈에 트리스탄호에 강행 승선했다.',
        '선내 무전망이 혼란에 빠져 있다 — 객실 구역에서 연쇄 살인이 발생했고, 로스=미도 대사가 즉위식 강행을 선언했다!',
        '[완전 조사] 프리시아 공주가 "아까까지 나를 지켜 준 사립탐정 코지로가 이 배에 탔다"며 선창 쪽을 가리킨다. DBMS 동시 접속의 그 인물인가?!',
      ],
      requiredSteps: ['LOOK:tristan_boarding_manifest', 'TALK:prisia_rem_crime'],
      talkLines: {
        prisia_rem_crime: [
          '「호죠 마리나 씨… 아까까지 저를 지켜주던 코지로라는 탐정이 아직 이 배 어딘가에 있을 거예요. 어서 찾아야 해요!」',
          '「그리고… 어쩐지 이 배 안에 나랑 똑같은 존재가 숨 쉬고 있는 것 같은 불길한 예감이 들어요.」',
          '「제가 엘디아의 진짜 왕녀로서 이 비극을 끝내겠어요. 갑판으로 올라가요!」',
        ],
        kyoko_himuro: [
          '「선내 통신망을 장악했어요! 코지로 씨가 기관실 쪽에서 목격된 뒤 선창 방향으로 이동했대요!」',
          '「선체 하부에 시한폭탄 신호가 감지됐어요! 서둘러 선창으로 합류하셔야 해요!」',
          '「마리나 씨, C 프로젝트 데이터와 코지로 씨의 단서가 만나면 진범의 가면이 벗겨질 거예요!」',
        ],
      },
      advanceNarration: '프리시아 공주와 함께 트리스탄호 승선에 성공했다. 이제 갑판에서 로스=미도 대사의 음모를 정면으로 돌파해 선창으로 향한다!',
    },

    M_D5_02: {
      focusId: 'tristan_deck_confrontation',
      focusLabel: '트리스탄호 갑판 로스=미도 대치 & 선창 돌입 통로',
      focusLook: [
        '도쿄만 한복판, 밤안개 낀 트리스탄호 갑판. 로스=미도 대사가 무장 경비와 함께 앞을 가로막지만, 뒤편에서 총성과 함께 배가 크게 기울기 시작한다!',
        '스즈키(카츠라기 겐자부로)가 어둠 속에서 나타나 퇴로를 열며 외친다 — "선창 격벽이 닫히기 전에 내려가라! 모든 진실이 거기 있다!"',
        '[완전 조사] 선창 해치를 열고 뛰어내리는 순간, 로스=미도마저 갑판 위 암살자 "테러"의 그림자에 휩쓸려 무너졌다. 이제 선창 안의 네 사람만 남았다!',
      ],
      requiredSteps: ['LOOK:tristan_deck_confrontation', 'TALK:genzaburo_katsuragi'],
      talkLines: {
        ross_mido: [
          '「호죠 마리나! 사문에서 탈출해 여기까지 쫓아오다니… 하지만 이미 늦었다. 전 국왕의 부활과 C 프로젝트는 오늘 밤 완성된다!」',
          '「프리시아와 국새만 손에 넣으면… 아니, 잠깐… 마야코?! 왜 네가 여기에… 으악!!」',
        ],
        genzaburo_katsuragi: [
          '「마리나, 프리시아를 데리고 선창으로 내려가라. 거기엔 내가 평생 짊어져야 했던 죄의 실체와, 네가 아직 만나지 못한 또 한 명의 수사자가 기다리고 있다.」',
          '「아마기 코지로… 내 양아들 녀석이 거기 있을 거다. 둘의 지식을 합쳐야 "테러"를 멈출 수 있다!」',
          '「내 과거의 과오를 이제 너희 두 사람 손으로 끝내 다오!」',
        ],
        prisia_rem_crime: [
          '「저 아래 선창에서 코지로의 목소리가 들려요! 어서 내려가요, 마리나 씨!」',
          '「해치가 닫히기 전에 뛰어내려요!」',
        ],
      },
      advanceNarration: '마리나와 프리시아가 폭발 직전의 트리스탄호 선창으로 돌입했다! [SB_12 마리나 측 완료]',
    },

    C_D6_01: {
      focusId: 'submerged_hold_truth',
      focusLabel: '침몰한 트리스탄호 해저 선창 — 양측 기억·단서의 완전한 합류',
      focusLook: [
        '거대한 폭발과 함께 트리스탄호가 해저로 침몰했다! 밀폐된 선창에 마침내 모인 4인 — [코지로 + 마야코]와 [마리나 + 프리시아]! 비상 산소통을 확보하고 5일간 격리되었던 두 주인공의 기억과 증거가 하나로 합쳐진다!',
        '모든 비대칭 퍼즐이 소름 끼치도록 맞아떨어진다: 스즈키 = 카츠라기 겐자부로, 푸딩 = 프리시아 공주, 양분된 국새의 두 절반, C 프로젝트 유기 휴머노이드 클론 μ-101, 그리고 기관실에서 사라진 국새와 마야코의 기억 공백!',
        '[완전 조사] 스트르만을 살해한 자는 디브였지만, 니카이도·디브·아쿠아·로스=미도를 차례로 제거한 연쇄살인범 "테러"의 진상은 단 하나뿐이다! 3단계 최종 추리로 진실을 선언하라!',
      ],
      requiredSteps: ['LOOK:submerged_hold_truth', 'TALK:marina_hojo'],
      talkLines: {
        marina_hojo: [
          '「당신이 바로… 대사관 도청과 DBMS 동시 접속으로 날 구해 준 사립탐정 아마기 코지로군요! 내 C 프로젝트 자료(μ-101)와 당신의 연쇄 살인 추리를 합치면 진실은 단 하나뿐이에요!」',
          '「기관실에서 안경 벗은 마야코가 당신의 국새 조각을 가져갔다면… 기숙사 야간 기억 공백의 퍼즐도 완전히 풀렸어요!」',
          '「비상 산소가 떨어지기 전에 3단계 최종 추리로 모든 진실을 밝혀내요!」',
        ],
        kojiro_amagi: [
          '「당신이 예일 학교와 본부를 뒤흔든 내각조사실 요원 호죠 마리나로군! 스즈키가 양부 카츠라기 겐자부로였고, 푸딩이 프리시아 공주라면… 모든 거짓말의 중심에 있는 자는 명백해!」',
          '「양분된 국새, C 프로젝트, 그리고 연쇄살인범 "테러"… 이제 마지막 이름을 부를 시간이다!」',
        ],
        mayako_mido: [
          '「…왜 다들 나를 그런 눈으로 보는 거죠? 머리가… 아파요… 내 안의 또 다른 목소리가… "엘디아의 왕좌를 되찾아라"라고 속삭이고 있어요…!」',
          '「내가… 프리시아의 복제인간이고… 내 안의 인격이 모두를 죽였다는 건가요…? 부탁이에요, 진실을 말해 주세요!」',
        ],
        prisia_rem_crime: [
          '「마야코… 당신과 나는 같은 유전자를 가진 거울 같은 존재였군요. 하지만 전 국왕의 망령이 당신을 조종하게 둘 수는 없어요!」',
          '「코지로, 마리나 씨… 우리 둘 다 살아서 나갈 수 있게 진실을 밝혀 주세요!」',
        ],
        ross_mido: [
          '[생전 기록] 「전 국왕 폐하의 인격을 클론 μ-101에 이식한 궁극의 걸작 C 프로젝트가 완성되었다…」 — 그 자신마저 각성한 테러의 손에 최후를 맞았다.',
        ],
        genzaburo_katsuragi: [
          '[무전 교신] 「코지로, 마리나… 그리고 야요이, 시리아. 내 과거의 과오를 이제 너희 손으로 끝내 다오. 3단계 진상을 선언하고 반드시 생환해라!」',
        ],
        celia_flat: [
          '[무전 교신] 「아버지… 그리고 코지로. 구조선이 해역에 접근 중이에요! 마지막 진실을 밝혀 주세요!」',
        ],
        yayoi_katsuragi: [
          '[무전 교신] 「아버지가 살아 계셨다니… 코지로, 마리나 씨, 반드시 살아서 돌아와야 해!」',
        ],
      },
      advanceNarration: '모든 진실이 완성되었다. 이제 3단계 최종 합류 추리를 개시하라!',
    },
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniquePush(arr, item) {
    if (arr.indexOf(item) === -1) {
      arr.push(item);
      return true;
    }
    return false;
  }

  function normalizeCulpritInput(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .toLowerCase()
      .replace(/[\s=＝・･·\-_.,'"「」『』()（）/\\]/g, '');
  }

  function parseStepRequirement(stepStr) {
    var atIdx = stepStr.indexOf('@');
    var base = atIdx === -1 ? stepStr : stepStr.slice(0, atIdx);
    var reqDepth = atIdx === -1 ? 1 : Math.max(1, parseInt(stepStr.slice(atIdx + 1), 10) || 1);
    var colonIdx = base.indexOf(':');
    var verb = colonIdx === -1 ? base : base.slice(0, colonIdx);
    var targetId = colonIdx === -1 ? '' : base.slice(colonIdx + 1);
    return {
      raw: stepStr,
      baseKey: base,
      verb: verb,
      targetId: targetId,
      requiredDepth: reqDepth,
    };
  }

  function fnv1aHash(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function buildDataIndex(data) {
    var charactersById = {};
    var locationsById = {};
    var scenesById = {};
    var barriersById = {};
    var cluesById = {};
    var correlationsById = {};
    var itemsById = {};
    var endingsById = {};
    var barriersByBlockedScene = {};
    var scenesByTrack = { marina: [], kojiro: [], both: [] };

    for (var i = 0; i < data.characters.length; i++) {
      charactersById[data.characters[i].id] = data.characters[i];
    }
    for (i = 0; i < data.locations.length; i++) {
      locationsById[data.locations[i].id] = data.locations[i];
    }
    for (i = 0; i < data.scenes.length; i++) {
      var s = data.scenes[i];
      scenesById[s.id] = s;
      if (scenesByTrack[s.track]) scenesByTrack[s.track].push(s);
    }
    for (i = 0; i < data.syncBarriers.length; i++) {
      var b = data.syncBarriers[i];
      barriersById[b.id] = b;
      if (!barriersByBlockedScene[b.blocked_scene]) barriersByBlockedScene[b.blocked_scene] = [];
      barriersByBlockedScene[b.blocked_scene].push(b);
    }
    for (i = 0; i < data.clues.length; i++) {
      cluesById[data.clues[i].id] = data.clues[i];
    }
    var corrs = data.clueCorrelations || [];
    for (i = 0; i < corrs.length; i++) {
      correlationsById[corrs[i].id] = corrs[i];
    }
    for (i = 0; i < data.items.length; i++) {
      itemsById[data.items[i].id] = data.items[i];
    }
    for (i = 0; i < data.endings.length; i++) {
      endingsById[data.endings[i].id] = data.endings[i];
    }

    return {
      charactersById: charactersById,
      locationsById: locationsById,
      scenesById: scenesById,
      barriersById: barriersById,
      cluesById: cluesById,
      correlationsById: correlationsById,
      itemsById: itemsById,
      endingsById: endingsById,
      barriersByBlockedScene: barriersByBlockedScene,
      scenesByTrack: scenesByTrack,
    };
  }

  function createInitialState(data, options) {
    var opts = options || {};
    var marinaStart = 'M_D0_01';
    var kojiroStart = 'K_D1_01';
    var idx = buildDataIndex(data);
    var mScene = idx.scenesById[marinaStart];
    var kScene = idx.scenesById[kojiroStart];

    var state = {
      schemaVersion: SCHEMA_VERSION,
      activeProtagonist: 'marina',
      mode: {
        sightHintMode: opts.sightHintMode === 'classic' ? 'classic' : 'modern',
        culpritInputMode: opts.culpritInputMode === 'streamlined' ? 'streamlined' : 'classic',
      },
      protagonists: {
        kojiro: {
          currentSceneId: kojiroStart,
          locationId: kScene.location_ids[0],
          inventory: [],
          knownClues: [],
          completedScenes: [],
          commandCounts: {},
          blockedByBarrierId: 'SB_01',
          revealedCharacters: [],
          sceneStepsDone: {},
        },
        marina: {
          currentSceneId: marinaStart,
          locationId: mScene.location_ids[0],
          inventory: [],
          knownClues: [],
          completedScenes: [],
          commandCounts: {},
          blockedByBarrierId: null,
          revealedCharacters: [],
          sceneStepsDone: {},
        },
      },
      sharedWorld: {
        worldDay: 0,
        calendarDate: mScene.calendar_date,
        unlockedFlags: [],
        unlockedBarriers: [],
        crossCausalLog: [],
        discoveredCorrelations: [],
        unlockedFinaleHints: [],
        deductionProgress: 0,
        completedDeductionSteps: [],
        converged: false,
        endingId: null,
        crisisCleared: {},
      },
      stats: {
        totalCommands: 0,
        sightChanges: 0,
        barriersUnlocked: 0,
        correlationsFound: 0,
        exhaustedTargets: 0,
      },
      narrativeLog: [
        {
          id: 1,
          protagonist: 'marina',
          sceneId: marinaStart,
          speaker: 'SYSTEM // 12-02 (Day 0)',
          kind: 'scene',
          text: mScene.title_kr + ' — ' + mScene.summary,
        },
      ],
    };

    return state;
  }

  function createEngine(inputData, options) {
    var data = inputData || (typeof globalThis !== 'undefined' ? globalThis.EVE_DATA : null);
    if (!data || !Array.isArray(data.scenes) || !Array.isArray(data.syncBarriers)) {
      throw new Error('EveEngine requires valid EVE_DATA bundle');
    }

    var idx = buildDataIndex(data);
    var state = createInitialState(data, options);
    var checkpoint = null;
    var nextLogId = 2;
    var finalBarrierId = data.syncBarriers[data.syncBarriers.length - 1].id;

    function pushLog(entry) {
      var rec = {
        id: nextLogId++,
        protagonist: entry.protagonist || state.activeProtagonist,
        sceneId: entry.sceneId || state.protagonists[state.activeProtagonist].currentSceneId,
        speaker: entry.speaker || '',
        kind: entry.kind || 'narration',
        text: entry.text || '',
        meta: entry.meta || null,
      };
      state.narrativeLog.push(rec);
      if (state.narrativeLog.length > 100) {
        state.narrativeLog = state.narrativeLog.slice(state.narrativeLog.length - 100);
      }
      return rec;
    }

    function isSceneCompleted(sceneId) {
      return (
        state.protagonists.marina.completedScenes.indexOf(sceneId) !== -1 ||
        state.protagonists.kojiro.completedScenes.indexOf(sceneId) !== -1
      );
    }

    function isBarrierUnlocked(barrierId) {
      var b = idx.barriersById[barrierId];
      if (!b) return true;
      for (var i = 0; i < b.required_event_ids.length; i++) {
        if (state.sharedWorld.unlockedFlags.indexOf(b.required_event_ids[i]) === -1) {
          return false;
        }
      }
      return true;
    }

    function getNextSceneForProtagonist(protagonist) {
      var pState = state.protagonists[protagonist];
      var currId = pState.currentSceneId;
      if (state.sharedWorld.converged) return null;

      if (pState.completedScenes.indexOf(currId) === -1) {
        return currId;
      }

      var trackScenes = idx.scenesByTrack[protagonist];
      for (var i = 0; i < trackScenes.length; i++) {
        var candidate = trackScenes[i];
        if (
          pState.completedScenes.indexOf(candidate.id) === -1 &&
          candidate.prev_scene_ids.indexOf(currId) !== -1
        ) {
          return candidate.id;
        }
      }

      var conv = idx.scenesById['C_D6_01'];
      if (conv && !isSceneCompleted('C_D6_01') && conv.prev_scene_ids.indexOf(currId) !== -1) {
        return 'C_D6_01';
      }

      return null;
    }

    function checkSyncBarrier(protagonist) {
      var who = protagonist || state.activeProtagonist;
      if (state.sharedWorld.converged) {
        return {
          blocked: false,
          barrier: null,
          nextSceneId: 'C_D6_01',
          waitingOnProtagonist: null,
          requiredEvents: [],
          missingEvents: [],
        };
      }

      var targetSceneId = getNextSceneForProtagonist(who);
      if (!targetSceneId) {
        return {
          blocked: false,
          barrier: null,
          nextSceneId: null,
          waitingOnProtagonist: null,
          requiredEvents: [],
          missingEvents: [],
        };
      }

      var targetBarriers = idx.barriersByBlockedScene[targetSceneId] || [];
      for (var i = 0; i < targetBarriers.length; i++) {
        var b = targetBarriers[i];
        var missing = [];
        for (var j = 0; j < b.required_event_ids.length; j++) {
          var evt = b.required_event_ids[j];
          if (state.sharedWorld.unlockedFlags.indexOf(evt) === -1) {
            missing.push(evt);
          }
        }
        if (missing.length > 0) {
          var waitingOn = b.unlocking_protagonist;
          if (b.barrier_type === 'final_convergence') {
            waitingOn = who === 'marina' ? 'kojiro' : 'marina';
          }
          return {
            blocked: true,
            barrier: deepClone(b),
            nextSceneId: targetSceneId,
            waitingOnProtagonist: waitingOn,
            requiredEvents: b.required_event_ids.slice(),
            missingEvents: missing,
          };
        }
      }

      var targetScene = idx.scenesById[targetSceneId];
      if (targetScene && targetScene.prev_scene_ids.length > 0) {
        for (var k = 0; k < targetScene.prev_scene_ids.length; k++) {
          if (!isSceneCompleted(targetScene.prev_scene_ids[k])) {
            return {
              blocked: true,
              barrier: targetBarriers[0] ? deepClone(targetBarriers[0]) : null,
              nextSceneId: targetSceneId,
              waitingOnProtagonist: who === 'marina' ? 'kojiro' : 'marina',
              requiredEvents: targetBarriers[0] ? targetBarriers[0].required_event_ids.slice() : [],
              missingEvents: [],
            };
          }
        }
      }

      return {
        blocked: false,
        barrier: null,
        nextSceneId: targetSceneId,
        waitingOnProtagonist: null,
        requiredEvents: [],
        missingEvents: [],
      };
    }

    function grantSceneItems(protagonist, sceneId) {
      var granted = [];
      for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.acquired_scene !== sceneId) continue;
        if (it.owner === protagonist || (it.owner === 'both' && state.sharedWorld.converged)) {
          if (uniquePush(state.protagonists[protagonist].inventory, it.id)) {
            granted.push(it);
          }
          if (it.owner === 'both') {
            uniquePush(state.protagonists.kojiro.inventory, it.id);
            uniquePush(state.protagonists.marina.inventory, it.id);
          }
        }
      }
      return granted;
    }

    function grantSceneClues(protagonist, sceneId) {
      var granted = [];
      for (var i = 0; i < data.clues.length; i++) {
        var cl = data.clues[i];
        if (cl.acquired_at_scene !== sceneId) continue;
        var scene = idx.scenesById[sceneId];
        if (scene.track === protagonist) {
          if (uniquePush(state.protagonists[protagonist].knownClues, cl.id)) {
            granted.push(cl);
          }
        } else if (scene.track === 'both' && state.sharedWorld.converged) {
          var addedK = uniquePush(state.protagonists.kojiro.knownClues, cl.id);
          var addedM = uniquePush(state.protagonists.marina.knownClues, cl.id);
          if (addedK || addedM) granted.push(cl);
        }
      }
      return granted;
    }

    function revealCharactersForScene(protagonist, sceneId) {
      var sideKey = protagonist === 'kojiro' ? 'known_to_kojiro' : 'known_to_marina';
      for (var i = 0; i < data.characters.length; i++) {
        var ch = data.characters[i];
        if (ch[sideKey] && ch[sideKey].truth_revealed_at_scene === sceneId) {
          uniquePush(state.protagonists[protagonist].revealedCharacters, ch.id);
        }
      }
    }

    function preGrantEntryItems(protagonist, sceneId) {
      // Scenes where an item acquired in the same scene must be immediately usable via ITEM command
      if (protagonist === 'kojiro' && (sceneId === 'K_D3_03' || sceneId === 'K_D4_01')) {
        grantSceneItems('kojiro', sceneId);
      }
    }

    function mergeKnowledgeAtConvergence() {
      state.sharedWorld.converged = true;
      var conv = idx.scenesById['C_D6_01'];
      state.sharedWorld.worldDay = Math.max(state.sharedWorld.worldDay, conv.day_index);
      state.sharedWorld.calendarDate = conv.calendar_date;

      state.protagonists.kojiro.currentSceneId = 'C_D6_01';
      state.protagonists.marina.currentSceneId = 'C_D6_01';
      state.protagonists.kojiro.locationId = conv.location_ids[0];
      state.protagonists.marina.locationId = conv.location_ids[0];
      state.protagonists.kojiro.blockedByBarrierId = null;
      state.protagonists.marina.blockedByBarrierId = null;

      var unionClues = state.protagonists.kojiro.knownClues.slice();
      for (var i = 0; i < state.protagonists.marina.knownClues.length; i++) {
        uniquePush(unionClues, state.protagonists.marina.knownClues[i]);
      }
      uniquePush(unionClues, 'clue_tristan_target_swap');
      state.protagonists.kojiro.knownClues = unionClues.slice();
      state.protagonists.marina.knownClues = unionClues.slice();

      grantSceneItems('kojiro', 'C_D6_01');
      grantSceneItems('marina', 'C_D6_01');

      revealCharactersForScene('kojiro', 'C_D6_01');
      revealCharactersForScene('marina', 'C_D6_01');

      uniquePush(state.sharedWorld.unlockedFlags, 'evt_tristan_dual_convergence');
      saveCheckpoint();

      pushLog({
        protagonist: state.activeProtagonist,
        sceneId: 'C_D6_01',
        speaker: 'CONVERGENCE // 12-08 (트리스탄호 해저 선창)',
        kind: 'convergence',
        text: '【단일 시점 수렴】 코지로(+마야코)와 마리나(+프리시아)가 트리스탄호 해저 선창에서 마침내 합류했다! 5일간 격리되어 있던 22개의 단서와 기억이 하나로 통합된다.',
      });
    }

    function evaluateAllBarriers() {
      var newlyUnlocked = [];
      for (var i = 0; i < data.syncBarriers.length; i++) {
        var b = data.syncBarriers[i];
        if (state.sharedWorld.unlockedBarriers.indexOf(b.id) !== -1) continue;
        if (isBarrierUnlocked(b.id)) {
          state.sharedWorld.unlockedBarriers.push(b.id);
          state.stats.barriersUnlocked += 1;
          var logEntry = {
            barrierId: b.id,
            nameKr: b.name_kr,
            barrierType: b.barrier_type,
            fromProtagonist: b.unlocking_protagonist,
            toProtagonist: b.blocked_protagonist,
            eventId: b.unlocking_event_id,
            effect: b.cross_causal_effect,
            worldDay: state.sharedWorld.worldDay,
          };
          state.sharedWorld.crossCausalLog.push(logEntry);
          newlyUnlocked.push(b);

          pushLog({
            protagonist: state.activeProtagonist,
            speaker: 'SYNC BARRIER UNLOCKED // ' + b.id,
            kind: 'barrier_unlock',
            text: '🔓 [' + b.id + '] ' + b.name_kr + ' 해제! — ' + b.cross_causal_effect,
            meta: { barrierId: b.id },
          });

          var sides = ['kojiro', 'marina'];
          for (var sIdx = 0; sIdx < sides.length; sIdx++) {
            var side = sides[sIdx];
            var ps = state.protagonists[side];
            if (ps.blockedByBarrierId === b.id) {
              ps.blockedByBarrierId = null;
              if (b.blocked_scene !== 'C_D6_01') {
                var targetScene = idx.scenesById[b.blocked_scene];
                if (targetScene && ps.completedScenes.indexOf(targetScene.id) === -1) {
                  ps.currentSceneId = targetScene.id;
                  ps.locationId = targetScene.location_ids[0];
                  preGrantEntryItems(side, targetScene.id);
                }
              }
            }
          }
        }
      }

      // Check final convergence barrier (SB_12)
      var convScene = idx.scenesById['C_D6_01'];
      var convPrevsReady =
        convScene &&
        convScene.prev_scene_ids.every(function (pid) {
          return isSceneCompleted(pid);
        });
      if (
        !state.sharedWorld.converged &&
        state.sharedWorld.unlockedBarriers.indexOf(finalBarrierId) !== -1 &&
        convPrevsReady
      ) {
        mergeKnowledgeAtConvergence();
      }

      if (newlyUnlocked.length > 0) {
        saveCheckpoint();
      }

      return newlyUnlocked;
    }

    function saveCheckpoint() {
      checkpoint = deepClone(state);
    }

    function getTargetCommandCount(protagonist, sceneId, verb, targetId) {
      var pState = state.protagonists[protagonist];
      var key = sceneId + ':' + verb + ':' + targetId;
      return pState.commandCounts[key] || 0;
    }

    function getTargetMaxDepth(sceneId, verb, targetId) {
      var spec = SCENE_SPECS[sceneId] || {};
      if (verb === 'LOOK') {
        if (targetId === spec.focusId) {
          return Array.isArray(spec.focusLook) ? spec.focusLook.length : 2;
        }
        return 2;
      }
      if (verb === 'TALK') {
        var lines = spec.talkLines && spec.talkLines[targetId];
        return Array.isArray(lines) && lines.length > 0 ? lines.length : 1;
      }
      if (verb === 'THINK') {
        return 3;
      }
      return 1;
    }

    function getSceneProgress(protagonist) {
      var who = protagonist || state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var spec = SCENE_SPECS[sceneId];
      var done = pState.sceneStepsDone[sceneId] || [];
      var required = spec ? spec.requiredSteps.slice() : [];
      var remaining = [];
      var completedSteps = [];
      var stepDetails = [];

      for (var i = 0; i < required.length; i++) {
        var parsed = parseStepRequirement(required[i]);
        var count =
          parsed.verb === 'LOOK' || parsed.verb === 'TALK' || parsed.verb === 'THINK'
            ? getTargetCommandCount(who, sceneId, parsed.verb, parsed.targetId)
            : done.indexOf(parsed.baseKey) !== -1
              ? 1
              : 0;
        var isDone = done.indexOf(parsed.raw) !== -1 || (count >= parsed.requiredDepth && done.indexOf(parsed.baseKey) !== -1);
        if (parsed.requiredDepth === 1 && done.indexOf(parsed.baseKey) !== -1) {
          isDone = true;
        }
        if (isDone) {
          completedSteps.push(parsed.raw);
        } else {
          remaining.push(parsed.raw);
        }
        stepDetails.push({
          key: parsed.raw,
          baseKey: parsed.baseKey,
          verb: parsed.verb,
          targetId: parsed.targetId,
          currentDepth: Math.min(count, parsed.requiredDepth),
          requiredDepth: parsed.requiredDepth,
          done: isDone,
        });
      }

      return {
        sceneId: sceneId,
        completed: pState.completedScenes.indexOf(sceneId) !== -1,
        requiredSteps: required,
        completedSteps: completedSteps,
        remainingSteps: remaining,
        stepDetails: stepDetails,
        readyToAdvance: remaining.length === 0 && pState.blockedByBarrierId === null,
      };
    }

    function markStepDone(protagonist, sceneId, verb, targetId, repeatCount) {
      var pState = state.protagonists[protagonist];
      if (!pState.sceneStepsDone[sceneId]) {
        pState.sceneStepsDone[sceneId] = [];
      }
      var baseKey = verb + ':' + targetId;
      uniquePush(pState.sceneStepsDone[sceneId], baseKey);

      var spec = SCENE_SPECS[sceneId];
      if (spec && Array.isArray(spec.requiredSteps)) {
        for (var i = 0; i < spec.requiredSteps.length; i++) {
          var parsed = parseStepRequirement(spec.requiredSteps[i]);
          if (parsed.baseKey === baseKey && (repeatCount || 1) >= parsed.requiredDepth) {
            uniquePush(pState.sceneStepsDone[sceneId], parsed.raw);
          }
        }
      }
    }

    function getCharacterView(charId, protagonist) {
      var who = protagonist || state.activeProtagonist;
      var ch = idx.charactersById[charId];
      if (!ch) return null;
      var side = who === 'kojiro' ? ch.known_to_kojiro : ch.known_to_marina;
      var pState = state.protagonists[who];
      var isRevealed =
        state.sharedWorld.converged ||
        pState.revealedCharacters.indexOf(charId) !== -1 ||
        (side.truth_revealed_at_scene !== null &&
          pState.completedScenes.indexOf(side.truth_revealed_at_scene) !== -1);

      return {
        id: ch.id,
        displayName: isRevealed ? ch.name_kr : side.initial_alias,
        initialAlias: side.initial_alias,
        canonicalNameKr: ch.name_kr,
        canonicalNameJp: ch.name_jp,
        canonicalNameEn: ch.name_en,
        role: side.initial_role,
        trustLevel: side.trust_level,
        faction: ch.faction,
        isRevealed: isRevealed,
        trueIdentity: isRevealed ? ch.true_identity : null,
        truthRevealedAtScene: side.truth_revealed_at_scene,
      };
    }

    function getAccessibleLocations(protagonist) {
      var who = protagonist || state.activeProtagonist;
      var pState = state.protagonists[who];
      var scene = idx.scenesById[pState.currentSceneId];
      var currentDay = scene ? scene.day_index : state.sharedWorld.worldDay;
      var result = [];
      for (var i = 0; i < data.locations.length; i++) {
        var loc = data.locations[i];
        var allowedByTrack = loc.accessible_by === who || loc.accessible_by === 'both';
        var inCurrentScene = scene && scene.location_ids.indexOf(loc.id) !== -1;
        var unlockedByDay = loc.unlock_day <= currentDay || inCurrentScene;
        if (allowedByTrack && unlockedByDay) {
          result.push(deepClone(loc));
        }
      }
      return result;
    }

    function canSightChange() {
      if (state.sharedWorld.endingId) {
        return { allowed: false, reason: 'GAME_ENDED', targetProtagonist: null };
      }
      if (state.sharedWorld.converged) {
        return { allowed: false, reason: 'CONVERGENCE_LOCK', targetProtagonist: null };
      }

      var current = state.activeProtagonist;
      var target = current === 'marina' ? 'kojiro' : 'marina';
      var pState = state.protagonists[current];
      var currScene = idx.scenesById[pState.currentSceneId];

      if (state.sharedWorld.unlockedBarriers.indexOf('SB_01') === -1) {
        return {
          allowed: false,
          reason: 'SIGHT_CHANGE_LOCKED_DAY0',
          targetProtagonist: target,
        };
      }

      if (
        currScene &&
        currScene.sight_change_allowed === false &&
        pState.completedScenes.indexOf(currScene.id) === -1
      ) {
        return {
          allowed: false,
          reason: 'SCENE_DISALLOWS_SIGHT_CHANGE',
          targetProtagonist: target,
        };
      }

      return { allowed: true, reason: null, targetProtagonist: target };
    }

    function findRequiredStepInfo(spec, verb, targetId) {
      var reqs = (spec && spec.requiredSteps) || [];
      var base = verb + ':' + targetId;
      for (var i = 0; i < reqs.length; i++) {
        var p = parseStepRequirement(reqs[i]);
        if (p.baseKey === base) return p;
      }
      return null;
    }

    function getAvailableCommands() {
      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var scene = idx.scenesById[sceneId];
      var spec = SCENE_SPECS[sceneId] || {};
      var selfCharId = who === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
      var barrierInfo = checkSyncBarrier(who);
      var sightInfo = canSightChange();

      function buildDepthMeta(verb, targetId) {
        var maxDepth = getTargetMaxDepth(sceneId, verb, targetId);
        var currentDepth = Math.min(getTargetCommandCount(who, sceneId, verb, targetId), maxDepth);
        var req = findRequiredStepInfo(spec, verb, targetId);
        return {
          currentDepth: currentDepth,
          maxDepth: maxDepth,
          exhausted: currentDepth >= maxDepth,
          isKeyObjective: Boolean(req),
          requiredDepth: req ? req.requiredDepth : 0,
        };
      }

      var surrMeta = buildDepthMeta('LOOK', 'surroundings');
      var lookTargets = [
        {
          id: 'surroundings',
          label: '주변 현장 관찰 (' + idx.locationsById[pState.locationId].name_kr + ')',
          currentDepth: surrMeta.currentDepth,
          maxDepth: surrMeta.maxDepth,
          exhausted: surrMeta.exhausted,
          isKeyObjective: false,
          requiredDepth: 0,
        },
      ];
      if (spec.focusId) {
        var fMeta = buildDepthMeta('LOOK', spec.focusId);
        lookTargets.push({
          id: spec.focusId,
          label: spec.focusLabel,
          currentDepth: fMeta.currentDepth,
          maxDepth: fMeta.maxDepth,
          exhausted: fMeta.exhausted,
          isKeyObjective: fMeta.isKeyObjective,
          requiredDepth: fMeta.requiredDepth,
        });
      }

      var talkTargets = [];
      if (scene) {
        for (var i = 0; i < scene.character_ids.length; i++) {
          var cid = scene.character_ids[i];
          if (cid === selfCharId) continue;
          var cv = getCharacterView(cid, who);
          if (!cv) continue;
          var tMeta = buildDepthMeta('TALK', cid);
          talkTargets.push({
            id: cid,
            label: cv.displayName,
            role: cv.role,
            trustLevel: cv.trustLevel,
            currentDepth: tMeta.currentDepth,
            maxDepth: tMeta.maxDepth,
            exhausted: tMeta.exhausted,
            isKeyObjective: tMeta.isKeyObjective,
            requiredDepth: tMeta.requiredDepth,
          });
          var lCharMeta = buildDepthMeta('LOOK', cid);
          lookTargets.push({
            id: cid,
            label: '인물 관찰: ' + cv.displayName,
            currentDepth: lCharMeta.currentDepth,
            maxDepth: lCharMeta.maxDepth,
            exhausted: lCharMeta.exhausted,
            isKeyObjective: false,
            requiredDepth: 0,
          });
        }
      }

      var thinkDefs = [
        { id: 'situation', label: '현재 단서와 상황 정리' },
        { id: 'suspects', label: '접촉 인물 재평가' },
        { id: 'barrier', label: '진행 정체 / 교차 시점 추론' },
      ];
      var thinkTargets = [];
      for (var th = 0; th < thinkDefs.length; th++) {
        var thMeta = buildDepthMeta('THINK', thinkDefs[th].id);
        thinkTargets.push({
          id: thinkDefs[th].id,
          label: thinkDefs[th].label,
          currentDepth: thMeta.currentDepth,
          maxDepth: thMeta.maxDepth,
          exhausted: thMeta.exhausted,
          isKeyObjective: false,
          requiredDepth: 0,
        });
      }

      var moveTargets = [];
      var accessibleLocs = getAccessibleLocations(who);
      for (var l = 0; l < accessibleLocs.length; l++) {
        var loc = accessibleLocs[l];
        moveTargets.push({
          id: loc.id,
          label: loc.name_kr,
          district: loc.district,
          isCurrent: loc.id === pState.locationId,
          inScene: scene ? scene.location_ids.indexOf(loc.id) !== -1 : false,
        });
      }

      var itemTargets = [];
      for (var itIdx = 0; itIdx < pState.inventory.length; itIdx++) {
        var itId = pState.inventory[itIdx];
        var item = idx.itemsById[itId];
        if (!item) continue;
        var itemReq = findRequiredStepInfo(spec, 'ITEM', item.id);
        itemTargets.push({
          id: item.id,
          label: item.name_kr,
          isKeyObjective: Boolean(itemReq),
          usedHere: item.used_scene === sceneId,
        });
      }

      var crisisTargets = [];
      if (spec.crisis && !state.sharedWorld.crisisCleared[sceneId] && !state.sharedWorld.endingId) {
        crisisTargets.push({
          id: spec.crisis.safeChoiceId,
          label: spec.crisis.safeLabel,
          fatal: false,
        });
        crisisTargets.push({
          id: spec.crisis.fatalChoiceId,
          label: spec.crisis.fatalLabel,
          fatal: true,
        });
      }

      return {
        protagonist: who,
        sceneId: sceneId,
        blockedByBarrier: barrierInfo.blocked ? barrierInfo.barrier : null,
        canSightChange: sightInfo,
        progress: getSceneProgress(who),
        verbs: {
          LOOK: lookTargets,
          TALK: talkTargets,
          THINK: thinkTargets,
          MOVE: moveTargets,
          ITEM: itemTargets,
          CRISIS: crisisTargets,
        },
        crisisPrompt: spec.crisis && !state.sharedWorld.crisisCleared[sceneId] ? spec.crisis.prompt : null,
        canDeduceCulprit: state.sharedWorld.converged && !state.sharedWorld.endingId,
        deductionProgress: state.sharedWorld.deductionProgress,
      };
    }

    function executeCommand(verb, targetId) {
      var normalizedVerb = String(verb || '').toUpperCase();

      if (state.sharedWorld.endingId) {
        return {
          ok: false,
          reason: 'GAME_ENDED',
          endingId: state.sharedWorld.endingId,
          message: '게임이 이미 종료되었습니다. 체크포인트 재시도 또는 새 게임을 시작하세요.',
        };
      }

      // SIGHT_CHANGE command
      if (normalizedVerb === 'SIGHT_CHANGE') {
        var check = canSightChange();
        if (!check.allowed) {
          var lockMsg =
            check.reason === 'CONVERGENCE_LOCK'
              ? '두 주인공은 이미 트리스탄호 해저 선창에서 합류했습니다. 더 이상 시점을 전환할 수 없습니다.'
              : 'Day 0 프롤로그 완료(예일 외국인학교 사전 답사 M_D0_03) 전까지는 호죠 마리나 시점으로 고정됩니다.';
          pushLog({
            speaker: 'SIGHT CHANGE LOCKED',
            kind: 'warning',
            text: lockMsg,
          });
          return { ok: false, reason: check.reason, message: lockMsg };
        }

        var nextProtagonist =
          targetId === 'kojiro' || targetId === 'marina' ? targetId : check.targetProtagonist;
        if (nextProtagonist === state.activeProtagonist) {
          return {
            ok: true,
            changed: false,
            activeProtagonist: state.activeProtagonist,
            message: '이미 해당 주인공 시점입니다.',
          };
        }

        state.activeProtagonist = nextProtagonist;
        state.stats.sightChanges += 1;
        state.stats.totalCommands += 1;

        var newP = state.protagonists[nextProtagonist];
        var newScene = idx.scenesById[newP.currentSceneId];
        if (newScene) {
          if (newScene.day_index > state.sharedWorld.worldDay) {
            state.sharedWorld.worldDay = newScene.day_index;
            state.sharedWorld.calendarDate = newScene.calendar_date;
          }
          if (newP.blockedByBarrierId === null) {
            preGrantEntryItems(nextProtagonist, newScene.id);
          }
        }

        var barrierAfter = checkSyncBarrier(nextProtagonist);
        var whoLabel = nextProtagonist === 'kojiro' ? '아마기 코지로 (Kojiro)' : '호죠 마리나 (Marina)';
        var switchMsg =
          '⇄ SIGHT CHANGE → ' +
          whoLabel +
          ' | ' +
          (newScene ? newScene.calendar_date + ' ' + newScene.title_kr : '');

        pushLog({
          protagonist: nextProtagonist,
          sceneId: newP.currentSceneId,
          speaker: 'SIGHT CHANGE // 視点切替',
          kind: 'sight_change',
          text: switchMsg,
        });

        return {
          ok: true,
          changed: true,
          activeProtagonist: nextProtagonist,
          scene: newScene ? deepClone(newScene) : null,
          blockedByBarrier: barrierAfter.blocked ? barrierAfter.barrier : null,
          message: switchMsg,
        };
      }

      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var scene = idx.scenesById[sceneId];
      var spec = SCENE_SPECS[sceneId] || {};
      var effectiveTarget = targetId || (normalizedVerb === 'LOOK' ? spec.focusId || 'surroundings' : 'default');
      var countKey = sceneId + ':' + normalizedVerb + ':' + effectiveTarget;
      var prevCount = pState.commandCounts[countKey] || 0;
      pState.commandCounts[countKey] = prevCount + 1;
      var repeatCount = pState.commandCounts[countKey];
      state.stats.totalCommands += 1;

      // LOOK command with 3-stage Progressive Exhaustion
      if (normalizedVerb === 'LOOK') {
        var target = effectiveTarget;
        var loc = idx.locationsById[pState.locationId];
        var maxDepth = getTargetMaxDepth(sceneId, 'LOOK', target);
        var text = '';
        var speaker = who === 'kojiro' ? '코지로의 관찰' : '마리나의 관찰';

        if (target === 'surroundings') {
          text =
            repeatCount === 1
              ? '[' + loc.name_kr + ' (' + loc.district + ')] ' + loc.summary
              : '[' + loc.name_kr + ' 정밀 재조사] ' + (scene ? scene.summary : loc.summary);
          if (pState.blockedByBarrierId) {
            var stallB = idx.barriersById[pState.blockedByBarrierId];
            text += ' [정체 중: ' + stallB.name_kr + ']';
          }
        } else if (target === spec.focusId) {
          var layers = Array.isArray(spec.focusLook) ? spec.focusLook : [spec.focusLook || '현장을 살폈다.'];
          var layerIdx = Math.min(repeatCount - 1, layers.length - 1);
          text = layers[layerIdx];
          if (repeatCount > layers.length) {
            text = '[이미 모든 세부 단서를 확인했다 (' + layers.length + '/' + layers.length + ')] ' + layers[layers.length - 1];
          }
          markStepDone(who, sceneId, 'LOOK', target, repeatCount);

          // Award canonical clues/items linked to key scene LOOK
          if (sceneId === 'M_D0_02') {
            grantSceneClues('marina', 'M_D0_02');
          } else if (sceneId === 'K_D1_02' && repeatCount >= 2) {
            grantSceneItems('kojiro', 'K_D1_02');
            grantSceneClues('kojiro', 'K_D1_02');
          } else if (sceneId === 'M_D1_02') {
            grantSceneItems('marina', 'M_D1_02');
            grantSceneClues('marina', 'M_D1_02');
          } else if (sceneId === 'K_D2_01') {
            grantSceneClues('kojiro', 'K_D2_01');
          } else if (sceneId === 'M_D2_02' && repeatCount >= 2) {
            grantSceneItems('marina', 'M_D2_02');
            grantSceneClues('marina', 'M_D2_02');
          } else if (sceneId === 'K_D2_02') {
            grantSceneItems('kojiro', 'K_D2_02');
            grantSceneClues('kojiro', 'K_D2_02');
          } else if (sceneId === 'K_D3_01') {
            grantSceneClues('kojiro', 'K_D3_01');
            revealCharactersForScene('kojiro', 'K_D3_01');
          } else if (sceneId === 'M_D3_01') {
            grantSceneClues('marina', 'M_D3_01');
          } else if (sceneId === 'K_D3_03' && repeatCount >= 2) {
            grantSceneItems('kojiro', 'K_D3_03');
            grantSceneClues('kojiro', 'K_D3_03');
          } else if (sceneId === 'M_D4_01' && repeatCount >= 2) {
            grantSceneClues('marina', 'M_D4_01');
          } else if (sceneId === 'M_D4_02') {
            grantSceneItems('marina', 'M_D4_02');
            grantSceneClues('marina', 'M_D4_02');
          } else if (sceneId === 'K_D5_02' && repeatCount >= 2) {
            grantSceneClues('kojiro', 'K_D5_02');
          } else if (sceneId === 'K_D5_03') {
            grantSceneClues('kojiro', 'K_D5_03');
            revealCharactersForScene('kojiro', 'K_D5_03');
          }
        } else if (idx.charactersById[target]) {
          var cv = getCharacterView(target, who);
          speaker = cv.displayName + ' 관찰';
          if (repeatCount === 1) {
            text =
              '[' +
              cv.displayName +
              '] ' +
              cv.role +
              ' (신뢰도: ' +
              cv.trustLevel.toUpperCase() +
              ')' +
              (cv.isRevealed && cv.trueIdentity ? ' — 판명된 정체: ' + cv.trueIdentity : '');
          } else {
            text =
              '[' +
              cv.displayName +
              ' 심층 관찰] 표정과 미세한 행동에서 ' +
              (cv.trustLevel === 'hostile' || cv.trustLevel === 'suspect'
                ? '숨기는 의도와 경계심이 짙게 느껴진다.'
                : '진중한 내면과 사건에 얽힌 무게가 읽힌다.') +
              (cv.isRevealed && cv.trueIdentity ? ' (확정 신원: ' + cv.trueIdentity + ')' : '');
          }
        } else {
          return { ok: false, reason: 'INVALID_TARGET', message: '조사할 대상을 찾을 수 없습니다.' };
        }

        if (prevCount < maxDepth && repeatCount >= maxDepth) {
          state.stats.exhaustedTargets += 1;
        }

        pushLog({ speaker: speaker, kind: 'look', text: text, meta: { targetId: target, depth: Math.min(repeatCount, maxDepth), maxDepth: maxDepth } });
        return {
          ok: true,
          verb: 'LOOK',
          targetId: target,
          repeatCount: repeatCount,
          depth: Math.min(repeatCount, maxDepth),
          maxDepth: maxDepth,
          exhausted: repeatCount >= maxDepth,
          text: text,
          progress: getSceneProgress(who),
        };
      }

      // TALK command with 3-stage Progressive Exhaustion
      if (normalizedVerb === 'TALK') {
        if (!scene || scene.character_ids.indexOf(targetId) === -1) {
          return {
            ok: false,
            reason: 'CHARACTER_NOT_PRESENT',
            message: '현재 장면에 해당 인물이 없습니다.',
          };
        }
        var charView = getCharacterView(targetId, who);
        var lines = (spec.talkLines && spec.talkLines[targetId]) || [
          '「' + charView.displayName + '은(는) 신중하게 상황을 살피고 있다.」',
        ];
        var talkMaxDepth = lines.length;
        var line = lines[Math.min(repeatCount - 1, lines.length - 1)];
        if (repeatCount > lines.length) {
          line = '[대화 소진 (' + lines.length + '/' + lines.length + ')] ' + lines[lines.length - 1];
        }

        markStepDone(who, sceneId, 'TALK', targetId, repeatCount);

        if (prevCount < talkMaxDepth && repeatCount >= talkMaxDepth) {
          state.stats.exhaustedTargets += 1;
        }

        // Award scene items/clues/reveals tied to talking to key NPCs
        if (sceneId === 'M_D0_01' && targetId === 'saburo_kouno') {
          grantSceneItems('marina', 'M_D0_01');
        } else if (sceneId === 'M_D0_03' && targetId === 'stollman_kou') {
          grantSceneItems('marina', 'M_D0_03');
        } else if (sceneId === 'K_D1_01' && targetId === 'dib') {
          grantSceneItems('kojiro', 'K_D1_01');
        } else if (sceneId === 'K_D1_03' && targetId === 'prisia_rem_crime') {
          grantSceneItems('kojiro', 'K_D1_03');
          grantSceneClues('kojiro', 'K_D1_03');
        } else if (sceneId === 'M_D1_01' && targetId === 'mayako_mido') {
          grantSceneClues('marina', 'M_D1_01');
        } else if (sceneId === 'M_D2_01' && targetId === 'genzaburo_katsuragi') {
          grantSceneClues('marina', 'M_D2_01');
        } else if (sceneId === 'K_D3_02' && targetId === 'aqua_still_lloyd') {
          grantSceneClues('kojiro', 'K_D3_02');
        } else if (sceneId === 'M_D3_01' && targetId === 'kyoko_himuro') {
          revealCharactersForScene('marina', 'M_D3_01');
          grantSceneClues('marina', 'M_D3_01');
        } else if (sceneId === 'K_D4_01' && targetId === 'kyoko_himuro') {
          grantSceneItems('kojiro', 'K_D4_01');
          revealCharactersForScene('kojiro', 'K_D4_01');
        } else if (sceneId === 'M_D5_01' && targetId === 'prisia_rem_crime') {
          revealCharactersForScene('marina', 'M_D5_01');
        }

        pushLog({
          speaker: charView.displayName,
          kind: 'talk',
          text: line,
          meta: { speakerId: targetId, depth: Math.min(repeatCount, talkMaxDepth), maxDepth: talkMaxDepth },
        });
        return {
          ok: true,
          verb: 'TALK',
          targetId: targetId,
          speaker: charView.displayName,
          speakerId: targetId,
          repeatCount: repeatCount,
          depth: Math.min(repeatCount, talkMaxDepth),
          maxDepth: talkMaxDepth,
          exhausted: repeatCount >= talkMaxDepth,
          text: line,
          progress: getSceneProgress(who),
        };
      }

      // THINK command — STRICT EPISTEMIC ISOLATION + 3-level Progressive Synthesis
      if (normalizedVerb === 'THINK') {
        var topic = targetId || 'situation';
        var whoName = who === 'kojiro' ? '아마기 코지로의 독백' : '호죠 마리나의 독백';
        var thinkMax = 3;
        var thought = '';

        if (topic === 'barrier') {
          if (pState.blockedByBarrierId) {
            var bObj = idx.barriersById[pState.blockedByBarrierId];
            if (state.mode.sightHintMode === 'modern') {
              thought =
                '【동기화 장벽 ' +
                bObj.id +
                ' 대기 중】 ' +
                bObj.player_hint_modern +
                ' (SIGHT CHANGE로 상대 시점을 진행하세요.)';
            } else {
              thought =
                who === 'marina'
                  ? repeatCount === 1
                    ? '「지금 내 선에서는 더 이상 진전시킬 수가 없다… 도쿄의 다른 어딘가에서 상황이 움직이길 기다려야 할 것 같군.」'
                    : '「시간의 톱니바퀴가 맞물리지 않는다. 지금은 한 발 물러서 다른 쪽 흐름이 열리기를 지켜볼 수밖에 없어.」'
                  : repeatCount === 1
                    ? '「여기서 내가 아무리 굴려 봐야 벽에 막혔어… 다른 쪽에서 사건이 움직여야 돌파구가 열리겠군.」'
                    : '「탐정 혼자 발버둥쳐서 풀릴 벽이 아니야. 어딘가의 누군가가 판을 흔들어야 길이 열리겠어.」';
            }
          } else {
            var prog = getSceneProgress(who);
            thought = prog.readyToAdvance
              ? '「이 장소에서 확보할 핵심 단서는 모두 챙겼다. 이제 다음 국면으로 나아갈 때다.」'
              : '「아직 현장 조사와 대화가 남아 있다. 핵심 조사 대상이나 인물을 여러 번(1→2→3) 깊게 확인해 보자.」';
          }
        } else if (topic === 'suspects') {
          var seenParts = [];
          var unexhaustedNpcs = [];
          if (scene) {
            for (var s = 0; s < scene.character_ids.length; s++) {
              var id = scene.character_ids[s];
              if ((who === 'kojiro' && id === 'kojiro_amagi') || (who === 'marina' && id === 'marina_hojo')) continue;
              var v = getCharacterView(id, who);
              seenParts.push(v.displayName + '(' + v.role + ')');
              var npcMax = getTargetMaxDepth(sceneId, 'TALK', id);
              if (getTargetCommandCount(who, sceneId, 'TALK', id) < npcMax) {
                unexhaustedNpcs.push(v.displayName);
              }
            }
          }
          if (repeatCount === 1) {
            thought =
              '「지금 눈에 밟히는 인물들: ' +
              (seenParts.length > 0 ? seenParts.join(' / ') : '주변에 확인할 인물이 없다') +
              '.」';
          } else if (repeatCount === 2) {
            thought =
              who === 'kojiro'
                ? '「내 시선으로 본 인물들의 이해관계가 어긋나고 있다. 겉으로 보이는 직함보다 실제 행적을 끝까지 캐물어야 해.」'
                : '「내각조사실 임무 기준으로는 전원 요주의 대상이다. 대사관과 학교 인맥 사이의 균열을 놓치지 말자.」';
          } else {
            thought =
              unexhaustedNpcs.length > 0
                ? '「아직 더 깊은 대화를 끌어낼 수 있는 인물: ' + unexhaustedNpcs.join(', ') + '. 다시 TALK 해 보자.」'
                : '「이 장면에서 만날 수 있는 인물들에게서는 끌어낼 이야기를 모두 확인했다.」';
          }
        } else {
          // 'situation': strictly summarize ONLY pState.knownClues! Zero leakage!
          if (pState.knownClues.length === 0) {
            thought =
              who === 'marina'
                ? '「내각조사실 에이전트로서 임무에 착수했다. 먼저 브리핑과 현장 조사를 철저히 마치자.」'
                : '「아마기 탐정사무소 소장으로서 의뢰를 파헤쳐 보자. 현장을 직접 두 눈으로 확인해야지.」';
          } else if (repeatCount === 1) {
            var summaries = [];
            for (var c = 0; c < pState.knownClues.length; c++) {
              var cl = idx.cluesById[pState.knownClues[c]];
              if (!cl) continue;
              var belief = state.sharedWorld.converged
                ? cl.true_meaning
                : who === 'kojiro'
                  ? cl.perceived_meaning_kojiro
                  : cl.perceived_meaning_marina;
              summaries.push('• ' + belief);
            }
            thought = '「지금까지 내가 파악한 사실들:\n' + summaries.join('\n') + '」';
          } else if (repeatCount === 2) {
            thought =
              '「[심층 추론 ' +
              pState.knownClues.length +
              '건 종합] 현재 보유 소지품 ' +
              pState.inventory.length +
              '종과 내가 확보한 ' +
              pState.knownClues.length +
              '개의 단서는 모두 하나의 거대한 엘디아 음모로 수렴하고 있다. 아직 내가 모르는 반대편 퍼즐이 존재한다.」';
          } else {
            var curProg = getSceneProgress(who);
            thought = curProg.readyToAdvance
              ? '「[사고 완료 3/3] 현재 장면의 핵심 단서 정리가 끝났다. 다음 국면으로 나아가거나 정보 비대칭 보드에서 교차 분석을 시도해 보자.」'
              : '「[사고 완료 3/3] 아직 미완료 핵심 목표가 ' + curProg.remainingSteps.length + '건 남아 있다. 핵심 대상의 심층 조사를 마무리하자.」';
          }
        }

        if (prevCount < thinkMax && repeatCount >= thinkMax) {
          state.stats.exhaustedTargets += 1;
        }

        pushLog({ speaker: whoName, kind: 'think', text: thought, meta: { depth: Math.min(repeatCount, thinkMax), maxDepth: thinkMax } });
        return {
          ok: true,
          verb: 'THINK',
          targetId: topic,
          repeatCount: repeatCount,
          depth: Math.min(repeatCount, thinkMax),
          maxDepth: thinkMax,
          exhausted: repeatCount >= thinkMax,
          text: thought,
          knownClueCount: pState.knownClues.length,
        };
      }

      // MOVE command — STRICT LOCATION ACCESS CONTROL
      if (normalizedVerb === 'MOVE') {
        var dest = idx.locationsById[targetId];
        if (!dest) {
          return { ok: false, reason: 'UNKNOWN_LOCATION', message: '알 수 없는 이동 목적지입니다.' };
        }
        var accessOk = dest.accessible_by === who || dest.accessible_by === 'both';
        if (!accessOk) {
          var denyMsg =
            who === 'kojiro'
              ? '사립탐정 코지로는 정부/기밀 구역 [' + dest.name_kr + ']에 출입 권한이 없다!'
              : '내각조사실 요원 마리나는 민간/뒷세계 거점 [' + dest.name_kr + ']의 동선을 파악하지 못했다!';
          pushLog({ speaker: 'ACCESS DENIED', kind: 'warning', text: denyMsg });
          return { ok: false, reason: 'LOCATION_ACCESS_DENIED', message: denyMsg };
        }

        var currentDay = scene ? scene.day_index : state.sharedWorld.worldDay;
        var inScene = scene && scene.location_ids.indexOf(dest.id) !== -1;
        if (dest.unlock_day > currentDay && !inScene) {
          return {
            ok: false,
            reason: 'LOCATION_LOCKED_BY_DAY',
            message: dest.name_kr + '은(는) 아직 해금되지 않은 지역입니다.',
          };
        }

        pState.locationId = dest.id;
        var moveMsg = '[' + dest.name_kr + '] (' + dest.district + ')으로 이동했다. — ' + dest.summary;
        pushLog({ speaker: 'MOVE // 이동', kind: 'move', text: moveMsg });
        return {
          ok: true,
          verb: 'MOVE',
          locationId: dest.id,
          location: deepClone(dest),
          text: moveMsg,
        };
      }

      // ITEM command — STRICT INVENTORY ISOLATION
      if (normalizedVerb === 'ITEM') {
        var itemObj = idx.itemsById[targetId];
        if (!itemObj) {
          return { ok: false, reason: 'UNKNOWN_ITEM', message: '알 수 없는 아이템입니다.' };
        }
        if (pState.inventory.indexOf(targetId) === -1) {
          var isoMsg =
            (who === 'kojiro' ? '코지로' : '마리나') +
            '의 인벤토리에 [' +
            itemObj.name_kr +
            ']이(가) 존재하지 않는다. (주인공 간 소지품은 완전히 격리되어 있습니다.)';
          pushLog({ speaker: 'INVENTORY ISOLATION', kind: 'warning', text: isoMsg });
          return { ok: false, reason: 'ITEM_NOT_IN_INVENTORY', message: isoMsg };
        }

        var itemMsg = '[' + itemObj.name_kr + '] ' + itemObj.asymmetric_significance;

        if (sceneId === 'K_D2_01' && targetId === 'item_nikaido_organizer') {
          markStepDone('kojiro', 'K_D2_01', 'ITEM', 'item_nikaido_organizer', 1);
          itemMsg =
            '【전자수첩 반환】 니카이도에게 전자수첩을 돌려주며 엘디아 접선 일정을 추궁했다! 당황한 니카이도의 반응에서 뒷거래의 냄새가 확실해졌다!';
        } else if (sceneId === 'K_D3_03' && targetId === 'item_embassy_wiretap') {
          markStepDone('kojiro', 'K_D3_03', 'ITEM', 'item_embassy_wiretap', 1);
          grantSceneClues('kojiro', 'K_D3_03');
          itemMsg =
            '【대사관 도청 성공】 로스=미도 의자 밑에 설치한 초소형 도청기를 가동했다! 정체불명의 여성 정부 요원이 경비 강화를 압박하며 대사의 반응을 떠보는 대화가 선명하게 녹취되었다!';
        } else if (sceneId === 'K_D4_01' && targetId === 'item_dbms_access_credential') {
          markStepDone('kojiro', 'K_D4_01', 'ITEM', 'item_dbms_access_credential', 1);
          itemMsg =
            '【동시 정규 접속 프로토콜 가동】 아쿠아 디스크 키와 히무로의 DBMS 단말로 본부 서버에 정규 조회 요청을 전송했다! 서버 보안 모듈에 동시 접근 경합(Deadlock) 타임래그가 열린다!';
        } else if (sceneId === 'M_D4_02' && targetId === 'item_ikuiku_handgun') {
          markStepDone('marina', 'M_D4_02', 'ITEM', 'item_ikuiku_handgun', 1);
          state.sharedWorld.crisisCleared['M_D4_02'] = true;
          itemMsg =
            '【사문 위기 돌파】 애총 "이쿠이쿠"를 뽑아 내연 관계인 코노 본부장을 방패 삼아 카가와 미스미의 포위망을 돌파했다! C 프로젝트 데이터도 무사히 사수했다!';
        } else if (sceneId === 'K_D4_02' && targetId === 'item_purin_pendant') {
          markStepDone('kojiro', 'K_D4_02', 'ITEM', 'item_purin_pendant', 1);
          state.sharedWorld.crisisCleared['K_D4_02'] = true;
          grantSceneClues('kojiro', 'K_D4_02');
          revealCharactersForScene('kojiro', 'K_D4_02');
          itemMsg =
            '【정체 확인 & 습격 돌파】 푸딩의 펜던트가 엘디아 왕가 정통 계승자 "프리시아 렘 크라임"의 증표임이 확인되었다! 시리아의 엄호 속에 디브의 총격을 뚫고 탈출했다!';
        }

        pushLog({ speaker: 'ITEM // ' + itemObj.name_kr, kind: 'item', text: itemMsg });
        return {
          ok: true,
          verb: 'ITEM',
          targetId: targetId,
          item: deepClone(itemObj),
          text: itemMsg,
          progress: getSceneProgress(who),
        };
      }

      if (normalizedVerb === 'CRISIS') {
        return handleCrisisChoice(targetId);
      }

      return { ok: false, reason: 'UNKNOWN_VERB', message: '지원하지 않는 커맨드입니다: ' + normalizedVerb };
    }

    function handleCrisisChoice(choiceId) {
      if (state.sharedWorld.endingId) {
        return { ok: false, reason: 'GAME_ENDED', endingId: state.sharedWorld.endingId };
      }
      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var spec = SCENE_SPECS[pState.currentSceneId];
      if (!spec || !spec.crisis) {
        return { ok: false, reason: 'NO_ACTIVE_CRISIS', message: '현재 장면에 위기 분기가 없습니다.' };
      }

      saveCheckpoint();

      if (choiceId === spec.crisis.fatalChoiceId) {
        var gameOverEnding = idx.endingsById['END_GAMEOVER_FATAL_CHOICE'];
        state.sharedWorld.endingId = gameOverEnding.id;
        pushLog({
          speaker: 'GAME OVER // 치명적 오선택',
          kind: 'gameover',
          text: spec.crisis.fatalNarration + ' (' + gameOverEnding.title_kr + ')',
        });
        return {
          ok: true,
          fatal: true,
          endingId: gameOverEnding.id,
          ending: deepClone(gameOverEnding),
          message: spec.crisis.fatalNarration,
        };
      }

      if (choiceId === spec.crisis.safeChoiceId) {
        state.sharedWorld.crisisCleared[pState.currentSceneId] = true;
        if (pState.currentSceneId === 'M_D4_02') {
          return executeCommand('ITEM', 'item_ikuiku_handgun');
        }
        if (pState.currentSceneId === 'K_D4_02') {
          return executeCommand('ITEM', 'item_purin_pendant');
        }
      }

      return { ok: false, reason: 'INVALID_CRISIS_CHOICE', message: '유효하지 않은 위기 선택지입니다.' };
    }

    // Interactive Clue Cross-Examination Engine (correlateClues)
    function correlateClues(clueAId, clueBId) {
      if (!clueAId || !clueBId) {
        return { ok: false, reason: 'MISSING_CLUES', message: '대조할 두 개의 단서를 모두 선택하세요.' };
      }
      if (clueAId === clueBId) {
        return { ok: false, reason: 'SAME_CLUE', message: '서로 다른 두 단서를 선택해야 교차 분석할 수 있습니다.' };
      }
      if (!idx.cluesById[clueAId] || !idx.cluesById[clueBId]) {
        return { ok: false, reason: 'UNKNOWN_CLUE', message: '존재하지 않는 단서 ID입니다.' };
      }

      var kClues = state.protagonists.kojiro.knownClues;
      var mClues = state.protagonists.marina.knownClues;
      var hasA = kClues.indexOf(clueAId) !== -1 || mClues.indexOf(clueAId) !== -1;
      var hasB = kClues.indexOf(clueBId) !== -1 || mClues.indexOf(clueBId) !== -1;

      if (!hasA || !hasB) {
        return {
          ok: false,
          reason: 'CLUE_NOT_DISCOVERED',
          message: '아직 발견하지 못한 단서는 교차 분석할 수 없습니다.',
        };
      }

      var corrs = data.clueCorrelations || [];
      var found = null;
      for (var i = 0; i < corrs.length; i++) {
        var c = corrs[i];
        if (
          (c.clue_a_id === clueAId && c.clue_b_id === clueBId) ||
          (c.clue_a_id === clueBId && c.clue_b_id === clueAId)
        ) {
          found = c;
          break;
        }
      }

      if (!found) {
        pushLog({
          speaker: 'CROSS-EXAMINATION // 교차 대조 불일치',
          kind: 'warning',
          text:
            '[' +
            idx.cluesById[clueAId].title_kr +
            '] ⇄ [' +
            idx.cluesById[clueBId].title_kr +
            '] — 직접적인 비대칭 모순 연결고리가 감지되지 않았다. 인물·물증·시점이 교차하는 다른 조합을 시도해 보자.',
        });
        return {
          ok: true,
          matched: false,
          message: '직접적인 비대칭 연결고리가 감지되지 않았습니다. 코지로·마리나 단서의 공통 인물이나 사건 시점을 다시 조합해 보세요.',
        };
      }

      var isNew = uniquePush(state.sharedWorld.discoveredCorrelations, found.id);
      if (isNew) {
        state.stats.correlationsFound += 1;
        uniquePush(state.sharedWorld.unlockedFinaleHints, found.id);
        pushLog({
          speaker: 'DRAMATIC IRONY SYNTHESIS // ' + found.id,
          kind: 'correlation',
          text: '⚡ 【비대칭 진실 도출: ' + found.title_kr + '】 ' + found.synthesis_kr,
          meta: { correlationId: found.id, unlocksHintStep: found.unlocks_finale_hint_step },
        });
      }

      return {
        ok: true,
        matched: true,
        alreadyDiscovered: !isNew,
        correlation: deepClone(found),
        unlockedFinaleHintStep: found.unlocks_finale_hint_step,
        totalCorrelationsFound: state.sharedWorld.discoveredCorrelations.length,
        message: found.synthesis_kr,
      };
    }

    function getDiscoveredCorrelations() {
      var list = [];
      for (var i = 0; i < state.sharedWorld.discoveredCorrelations.length; i++) {
        var id = state.sharedWorld.discoveredCorrelations[i];
        if (idx.correlationsById[id]) {
          list.push(deepClone(idx.correlationsById[id]));
        }
      }
      return list;
    }

    function getFinaleHints(stepIndex) {
      var hints = [];
      for (var i = 0; i < state.sharedWorld.discoveredCorrelations.length; i++) {
        var corr = idx.correlationsById[state.sharedWorld.discoveredCorrelations[i]];
        if (!corr) continue;
        if (stepIndex === undefined || stepIndex === null || corr.unlocks_finale_hint_step === stepIndex) {
          hints.push(deepClone(corr));
        }
      }
      return hints;
    }

    function advanceScene() {
      if (state.sharedWorld.endingId) {
        return { ok: false, reason: 'GAME_ENDED', endingId: state.sharedWorld.endingId };
      }

      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var scene = idx.scenesById[sceneId];
      var spec = SCENE_SPECS[sceneId] || {};

      if (sceneId === 'C_D6_01') {
        var cProg = getSceneProgress(who);
        if (!cProg.readyToAdvance) {
          return {
            ok: false,
            reason: 'OBJECTIVES_INCOMPLETE',
            remainingSteps: cProg.remainingSteps,
            message: '선창 합류 단서와 대화를 먼저 확인한 뒤 3단계 최종 추리에 들어가세요.',
          };
        }
        return {
          ok: true,
          readyForCulpritDeduction: true,
          deductionProgress: state.sharedWorld.deductionProgress,
          message: '모든 단서가 하나로 모였습니다! 이제 3단계 최종 추리를 시작하세요.',
        };
      }

      if (pState.blockedByBarrierId) {
        var blockedCheck = checkSyncBarrier(who);
        if (blockedCheck.blocked) {
          var stallOutcome = idx.endingsById['STATE_SYNC_STALL'];
          var hint =
            state.mode.sightHintMode === 'modern'
              ? blockedCheck.barrier.player_hint_modern
              : '현재 시점에서는 더 이상 진행할 수 없다. 다른 시점을 확인해야 한다.';
          pushLog({
            speaker: 'SYNC BARRIER // ' + blockedCheck.barrier.id,
            kind: 'barrier_block',
            text: '🔒 [' + blockedCheck.barrier.id + '] ' + blockedCheck.barrier.name_kr + ' — ' + hint,
          });
          return {
            ok: false,
            reason: 'BLOCKED_BY_SYNC_BARRIER',
            outcomeId: stallOutcome.id,
            barrier: blockedCheck.barrier,
            suggestSightChange: true,
            message: hint,
          };
        } else {
          pState.blockedByBarrierId = null;
        }
      }

      var prog = getSceneProgress(who);
      if (!prog.completed && prog.remainingSteps.length > 0) {
        return {
          ok: false,
          reason: 'OBJECTIVES_INCOMPLETE',
          remainingSteps: prog.remainingSteps,
          message: '이 장면의 핵심 조사/대화를 먼저 완료해야 다음 국면으로 진행할 수 있습니다.',
        };
      }

      var newlyGrantedItems = [];
      var newlyGrantedClues = [];
      if (pState.completedScenes.indexOf(sceneId) === -1) {
        newlyGrantedItems = grantSceneItems(who, sceneId);
        newlyGrantedClues = grantSceneClues(who, sceneId);
        revealCharactersForScene(who, sceneId);
        pState.completedScenes.push(sceneId);

        for (var e = 0; e < scene.emits_event_ids.length; e++) {
          uniquePush(state.sharedWorld.unlockedFlags, scene.emits_event_ids[e]);
        }

        if (spec.advanceNarration) {
          pushLog({
            protagonist: who,
            sceneId: sceneId,
            speaker: 'SCENE COMPLETE // ' + scene.calendar_date,
            kind: 'scene_complete',
            text: spec.advanceNarration,
          });
        }
      }

      var unlockedBarriers = evaluateAllBarriers();

      if (state.sharedWorld.converged) {
        return {
          ok: true,
          completedSceneId: sceneId,
          nextSceneId: 'C_D6_01',
          converged: true,
          unlockedBarriers: deepClone(unlockedBarriers),
          stalled: false,
          blockedByBarrier: null,
        };
      }

      var nextBarrierCheck = checkSyncBarrier(who);
      if (nextBarrierCheck.blocked && nextBarrierCheck.barrier) {
        pState.blockedByBarrierId = nextBarrierCheck.barrier.id;
        var stallMsg =
          '🔒 [' +
          nextBarrierCheck.barrier.id +
          '] ' +
          nextBarrierCheck.barrier.name_kr +
          ' — ' +
          (state.mode.sightHintMode === 'modern'
            ? nextBarrierCheck.barrier.player_hint_modern
            : '이 시점에서는 더 이상 진행할 수 없다. SIGHT CHANGE를 고려하자.');

        pushLog({
          protagonist: who,
          sceneId: sceneId,
          speaker: 'SYNC WAIT // ' + nextBarrierCheck.barrier.id,
          kind: 'barrier_block',
          text: stallMsg,
          meta: { barrierId: nextBarrierCheck.barrier.id },
        });

        return {
          ok: true,
          completedSceneId: sceneId,
          nextSceneId: nextBarrierCheck.nextSceneId,
          stalled: true,
          outcomeId: 'STATE_SYNC_STALL',
          blockedByBarrier: nextBarrierCheck.barrier,
          unlockedBarriers: deepClone(unlockedBarriers),
          suggestSightChange: true,
          message: stallMsg,
        };
      }

      if (nextBarrierCheck.nextSceneId && idx.scenesById[nextBarrierCheck.nextSceneId]) {
        var nextScene = idx.scenesById[nextBarrierCheck.nextSceneId];
        pState.currentSceneId = nextScene.id;
        pState.locationId = nextScene.location_ids[0];
        pState.blockedByBarrierId = null;
        if (nextScene.day_index > state.sharedWorld.worldDay) {
          state.sharedWorld.worldDay = nextScene.day_index;
          state.sharedWorld.calendarDate = nextScene.calendar_date;
        }
        preGrantEntryItems(who, nextScene.id);

        pushLog({
          protagonist: who,
          sceneId: nextScene.id,
          speaker: 'NEXT SCENE // ' + nextScene.calendar_date + ' (Day ' + nextScene.day_index + ')',
          kind: 'scene',
          text: nextScene.title_kr + ' — ' + nextScene.summary,
        });

        return {
          ok: true,
          completedSceneId: sceneId,
          nextSceneId: nextScene.id,
          stalled: false,
          blockedByBarrier: null,
          unlockedBarriers: deepClone(unlockedBarriers),
          grantedItems: deepClone(newlyGrantedItems),
          grantedClues: deepClone(newlyGrantedClues),
        };
      }

      return {
        ok: true,
        completedSceneId: sceneId,
        nextSceneId: null,
        stalled: false,
        unlockedBarriers: deepClone(unlockedBarriers),
      };
    }

    // Multi-Step Finale Deduction Sequence (3 Stages at C_D6_01)
    function submitDeductionStep(stepIndex, rawAnswer) {
      if (!state.sharedWorld.converged) {
        return {
          ok: false,
          reason: 'NOT_CONVERGED',
          message: '최종 합류편(C_D6_01)에 도달하기 전에는 최종 추리를 진행할 수 없습니다.',
        };
      }
      if (state.sharedWorld.endingId) {
        return {
          ok: false,
          reason: 'GAME_ENDED',
          endingId: state.sharedWorld.endingId,
          message: '이미 결말에 도달했습니다.',
        };
      }

      var steps = data.finaleDeductionSteps || [];
      var targetStep = stepIndex === undefined || stepIndex === null ? state.sharedWorld.deductionProgress : Number(stepIndex);

      if (targetStep < 0 || targetStep >= steps.length) {
        return { ok: false, reason: 'INVALID_STEP_INDEX', message: '유효하지 않은 추리 단계입니다.' };
      }
      if (targetStep !== state.sharedWorld.deductionProgress) {
        return {
          ok: false,
          reason: 'OUT_OF_ORDER_STEP',
          expectedStepIndex: state.sharedWorld.deductionProgress,
          message: '현재 진행해야 할 추리 단계는 ' + (state.sharedWorld.deductionProgress + 1) + '단계입니다.',
        };
      }

      saveCheckpoint();

      var stepSpec = steps[targetStep];
      var normalized = normalizeCulpritInput(rawAnswer);
      var accepted = [];
      for (var i = 0; i < stepSpec.accepted_inputs.length; i++) {
        accepted.push(normalizeCulpritInput(stepSpec.accepted_inputs[i]));
      }

      var isCorrect = normalized.length > 0 && accepted.indexOf(normalized) !== -1;

      if (isCorrect) {
        state.sharedWorld.deductionProgress = targetStep + 1;
        uniquePush(state.sharedWorld.completedDeductionSteps, stepSpec.id);

        var isFinalStage = targetStep === steps.length - 1;
        if (isFinalStage) {
          var trueEnding = idx.endingsById['END_TRUE_RESCUE'];
          uniquePush(state.protagonists.kojiro.completedScenes, 'C_D6_01');
          uniquePush(state.protagonists.marina.completedScenes, 'C_D6_01');
          uniquePush(state.sharedWorld.unlockedFlags, 'evt_true_culprit_identified');
          state.sharedWorld.endingId = trueEnding.id;

          pushLog({
            speaker: 'TRUE ENDING // ' + trueEnding.title_kr,
            kind: 'true_ending',
            text: stepSpec.success_narration + ' — ' + trueEnding.summary,
          });

          return {
            ok: true,
            correct: true,
            stepIndex: targetStep,
            stepId: stepSpec.id,
            normalizedInput: normalized,
            completedAll: true,
            nextStepIndex: null,
            endingId: trueEnding.id,
            ending: deepClone(trueEnding),
            message: stepSpec.success_narration,
          };
        }

        pushLog({
          speaker: 'DEDUCTION STAGE ' + (targetStep + 1) + ' CLEARED',
          kind: 'convergence',
          text: stepSpec.success_narration,
        });

        return {
          ok: true,
          correct: true,
          stepIndex: targetStep,
          stepId: stepSpec.id,
          normalizedInput: normalized,
          completedAll: false,
          nextStepIndex: targetStep + 1,
          nextStep: deepClone(steps[targetStep + 1]),
          endingId: null,
          message: stepSpec.success_narration,
        };
      }

      var wrongEnding = idx.endingsById['END_BAD_WRONG_CULPRIT'];
      state.sharedWorld.endingId = wrongEnding.id;
      pushLog({
        speaker: 'BAD ENDING // ' + stepSpec.stage_label + ' 오답',
        kind: 'bad_ending',
        text: '【' + (targetStep + 1) + '단계 추리 오답: "' + String(rawAnswer || '') + '"】 ' + wrongEnding.summary,
      });

      return {
        ok: true,
        correct: false,
        stepIndex: targetStep,
        stepId: stepSpec.id,
        normalizedInput: normalized,
        completedAll: false,
        endingId: wrongEnding.id,
        ending: deepClone(wrongEnding),
        message: wrongEnding.summary,
      };
    }

    // Direct Stage 3 Culprit Submission (Backward-Compatible Shorthand)
    function submitCulprit(rawInput) {
      if (!state.sharedWorld.converged) {
        return {
          ok: false,
          reason: 'NOT_CONVERGED',
          message: '최종 합류편(C_D6_01)에 도달하기 전에는 진범을 지목할 수 없습니다.',
        };
      }

      var steps = data.finaleDeductionSteps || [];
      if (steps.length === 3 && state.sharedWorld.deductionProgress < 2) {
        // Allow direct final culprit check without breaking backward-compatible tests/API
        state.sharedWorld.deductionProgress = 2;
      }
      return submitDeductionStep(steps.length - 1, rawInput);
    }

    function getAsymmetryMatrix() {
      var kClues = state.protagonists.kojiro.knownClues;
      var mClues = state.protagonists.marina.knownClues;
      var rows = [];

      for (var i = 0; i < data.clues.length; i++) {
        var cl = data.clues[i];
        var knownByKojiro = kClues.indexOf(cl.id) !== -1;
        var knownByMarina = mClues.indexOf(cl.id) !== -1;
        if (!knownByKojiro && !knownByMarina) continue;

        var discoveredBy =
          knownByKojiro && knownByMarina ? 'both' : knownByKojiro ? 'kojiro' : 'marina';

        rows.push({
          id: cl.id,
          titleKr: cl.title_kr,
          category: cl.category,
          holder: cl.holder,
          dramaticIronyType: cl.dramatic_irony_type,
          acquiredAtScene: cl.acquired_at_scene,
          sharedAtScene: cl.shared_at_scene,
          discoveredBy: discoveredBy,
          knownByKojiro: knownByKojiro,
          knownByMarina: knownByMarina,
          kojiroPerception: cl.perceived_meaning_kojiro,
          marinaPerception: cl.perceived_meaning_marina,
          playerOmniscientTruth: cl.true_meaning,
          shared: state.sharedWorld.converged,
        });
      }
      return rows;
    }

    function getTimelineGraph() {
      var kState = state.protagonists.kojiro;
      var mState = state.protagonists.marina;
      var nodes = [];

      for (var i = 0; i < data.scenes.length; i++) {
        var s = data.scenes[i];
        var status = 'locked';
        if (isSceneCompleted(s.id)) {
          status = 'completed';
        } else if (
          (s.track === 'both' && state.sharedWorld.converged) ||
          (s.track === 'marina' && mState.currentSceneId === s.id && mState.blockedByBarrierId === null) ||
          (s.track === 'kojiro' && kState.currentSceneId === s.id && kState.blockedByBarrierId === null)
        ) {
          status =
            s.track === 'both' || s.track === state.activeProtagonist ? 'active' : 'waiting';
        } else {
          var blockingBarriers = idx.barriersByBlockedScene[s.id] || [];
          var hasActiveBlock = false;
          for (var b = 0; b < blockingBarriers.length; b++) {
            var bid = blockingBarriers[b].id;
            if (kState.blockedByBarrierId === bid || mState.blockedByBarrierId === bid) {
              hasActiveBlock = true;
            }
          }
          status = hasActiveBlock ? 'blocked' : 'locked';
        }

        nodes.push({
          id: s.id,
          track: s.track,
          dayIndex: s.day_index,
          calendarDate: s.calendar_date,
          titleKr: s.title_kr,
          summary: s.summary,
          status: status,
          isCurrentFocus:
            (state.sharedWorld.converged && s.id === 'C_D6_01') ||
            (!state.sharedWorld.converged &&
              state.protagonists[state.activeProtagonist].currentSceneId === s.id),
        });
      }

      var edges = [];
      for (var j = 0; j < data.syncBarriers.length; j++) {
        var bar = data.syncBarriers[j];
        var unlocked = state.sharedWorld.unlockedBarriers.indexOf(bar.id) !== -1;
        var activeBlock =
          kState.blockedByBarrierId === bar.id || mState.blockedByBarrierId === bar.id;
        edges.push({
          id: bar.id,
          nameKr: bar.name_kr,
          barrierType: bar.barrier_type,
          fromScene: bar.unlocking_scene,
          fromScenes: bar.unlocking_scenes || [bar.unlocking_scene],
          toScene: bar.blocked_scene,
          fromProtagonist: bar.unlocking_protagonist,
          toProtagonist: bar.blocked_protagonist,
          unlocked: unlocked,
          activeBlock: activeBlock,
          effect: bar.cross_causal_effect,
          hint: bar.player_hint_modern,
        });
      }

      return { nodes: nodes, barriers: edges };
    }

    function retryFromCheckpoint() {
      if (!checkpoint) {
        return { ok: false, reason: 'NO_CHECKPOINT', message: '복원할 체크포인트가 없습니다.' };
      }
      state = deepClone(checkpoint);
      state.sharedWorld.endingId = null;
      pushLog({
        speaker: 'CHECKPOINT RESTORED',
        kind: 'system',
        text: '직전 안전 체크포인트로 복귀했습니다. 다시 신중하게 판단하세요.',
      });
      return { ok: true, state: deepClone(state) };
    }

    function setMode(partialMode) {
      if (partialMode && (partialMode.sightHintMode === 'modern' || partialMode.sightHintMode === 'classic')) {
        state.mode.sightHintMode = partialMode.sightHintMode;
      }
      if (partialMode && (partialMode.culpritInputMode === 'classic' || partialMode.culpritInputMode === 'streamlined')) {
        state.mode.culpritInputMode = partialMode.culpritInputMode;
      }
      return deepClone(state.mode);
    }

    function reset(newOptions) {
      state = createInitialState(data, newOptions || state.mode);
      checkpoint = null;
      nextLogId = 2;
      return deepClone(state);
    }

    function serialize() {
      var payload = deepClone(state);
      var payloadStr = JSON.stringify(payload);
      var envelope = {
        schemaVersion: SCHEMA_VERSION,
        gameId: data.gameId || 'twin-sight-paradox',
        checksum: fnv1aHash(payloadStr),
        state: payload,
      };
      return JSON.stringify(envelope);
    }

    function deserialize(jsonString) {
      var parsed;
      try {
        parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      } catch (err) {
        return { ok: false, reason: 'INVALID_JSON', error: err.message };
      }

      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !parsed.state) {
        return { ok: false, reason: 'INVALID_SCHEMA' };
      }

      var payloadStr = JSON.stringify(parsed.state);
      var expectedChecksum = fnv1aHash(payloadStr);
      if (parsed.checksum && parsed.checksum !== expectedChecksum) {
        return { ok: false, reason: 'CHECKSUM_MISMATCH' };
      }

      var s = parsed.state;
      if (
        !s.protagonists ||
        !s.protagonists.kojiro ||
        !s.protagonists.marina ||
        !s.sharedWorld ||
        (s.activeProtagonist !== 'kojiro' && s.activeProtagonist !== 'marina')
      ) {
        return { ok: false, reason: 'CORRUPTED_STATE' };
      }

      if (!idx.scenesById[s.protagonists.kojiro.currentSceneId] || !idx.scenesById[s.protagonists.marina.currentSceneId]) {
        return { ok: false, reason: 'UNKNOWN_SCENE_ID' };
      }

      state = deepClone(s);
      var maxId = 1;
      for (var i = 0; i < state.narrativeLog.length; i++) {
        if (state.narrativeLog[i].id > maxId) maxId = state.narrativeLog[i].id;
      }
      nextLogId = maxId + 1;

      evaluateAllBarriers();

      return { ok: true, state: deepClone(state) };
    }

    function getData() {
      return data;
    }

    return {
      getState: function () {
        return deepClone(state);
      },
      getData: getData,
      getActiveProtagonist: function () {
        return state.activeProtagonist;
      },
      getCurrentScene: function (protagonist) {
        var who = protagonist || state.activeProtagonist;
        return deepClone(idx.scenesById[state.protagonists[who].currentSceneId]);
      },
      getCharacterView: getCharacterView,
      getAccessibleLocations: getAccessibleLocations,
      getSceneProgress: getSceneProgress,
      getAvailableCommands: getAvailableCommands,
      executeCommand: executeCommand,
      advanceScene: advanceScene,
      triggerFatalChoice: handleCrisisChoice,
      checkSyncBarrier: checkSyncBarrier,
      canSightChange: canSightChange,
      correlateClues: correlateClues,
      getDiscoveredCorrelations: getDiscoveredCorrelations,
      getFinaleHints: getFinaleHints,
      getAsymmetryMatrix: getAsymmetryMatrix,
      getTimelineGraph: getTimelineGraph,
      submitDeductionStep: submitDeductionStep,
      submitCulprit: submitCulprit,
      retryFromCheckpoint: retryFromCheckpoint,
      setMode: setMode,
      reset: reset,
      serialize: serialize,
      deserialize: deserialize,
    };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    createEngine: createEngine,
    createInitialState: createInitialState,
    normalizeCulpritInput: normalizeCulpritInput,
    parseStepRequirement: parseStepRequirement,
    SCENE_SPECS: SCENE_SPECS,
  };
});
