/**
 * EVE burst error — Pure Deterministic Multi-Sight Dual-Perspective Engine
 *
 * Zero DOM dependencies. UMD export (globalThis.EveEngine + module.exports).
 * Driven 100% by verified_data SSOT bundled in Web/data/game-data.js (EVE_DATA).
 *
 * Core Invariants:
 * 1. Dual Partitioned Protagonist State (Kojiro & Marina isolated inventories, clues, scenes, locations).
 * 2. Cross-Protagonist Sync Barrier Engine (SB_01 ~ SB_08, monotonic unlockedFlags).
 * 3. Information Asymmetry & Dynamic Alias Resolution (zero epistemic leakage pre-convergence).
 * 4. Tristan Convergence (C_D6_01) knowledge merge + multilingual culprit deduction.
 * 5. Deterministic serialize() / deserialize() with integrity checksum.
 */

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.EveEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SCHEMA_VERSION = '1.0.0';

  // Canonical per-scene focus targets, required investigative steps, and atmospheric scripts.
  // All entity names, aliases, clues, items, barriers, and endings are resolved dynamically from EVE_DATA.
  var SCENE_SPECS = {
    M_D0_01: {
      focusId: 'briefing_dossier',
      focusLabel: '코노 본부장의 극비 경호 지령서',
      focusLook1: '귀국 직후 소환된 내각조사실 브리핑 룸. 서류철에는 주일 엘디아 대사 로스=미도의 딸 "미도 마야코"의 경호 지령과 예일 외국인학교 위장 부임 계획이 적혀 있다.',
      focusLook2: '서류 구석의 내무감사관 카가와 미스미의 서명이 신경 쓰인다. 단순 경호가 아니라 엘디아 정세와 직결된 민감한 임무임이 분명하다.',
      requiredSteps: ['LOOK:briefing_dossier', 'TALK:saburo_kouno'],
      talkLines: {
        saburo_kouno: [
          '「돌아오자마자 미안하군, 마리나. 주일 엘디아 대사 로스=미도의 딸 미도 마야코를 경호해 줘야겠다. 애총과 신분증은 챙겨 둬라.」',
          '「예일 외국인학교에 전속 강사로 잠입하게. 대사 측 요청은 극비다. 내일 사전 답사부터 마무리하도록.」',
        ],
        ross_mido: [
          '「일본 정부의 협조에 감사드립니다, 호죠 씨. 제 딸 마야코는 테러리스트의 표적이 될 우려가 있습니다.」',
          '「엘디아의 미래를 위해서라도 마야코를 반드시 지켜 주십시오.」',
        ],
        misumi_kagawa: [
          '「임무 달성률 99%라던가? 내각조사실의 규율을 어기는 순간 바로 감찰 대상이라는 걸 잊지 마, 호죠 마리나.」',
          '「흥, 공안 제6과 시절 버릇이 남아 있으면 곤란해.」',
        ],
      },
      advanceNarration: '애총 "이쿠이쿠"와 내각조사실 1급 수사원 신분증을 수령했다. 이제 예일 외국인학교 사전 답사로 향한다.',
    },

    M_D0_02: {
      focusId: 'yale_campus_gate',
      focusLabel: '예일 외국인학교 교정과 보안 동선',
      focusLook1: '외국인 거류지 언덕에 자리 잡은 예일 외국인학교. 교내 경비는 느슨해 보이지만 뒤편 디렉터룸 쪽에는 외부인 출입 통제 흔적이 남아 있다.',
      focusLook2: '전속 강사 잠입 신분증을 발급받았다. 내일(12월 3일)부터 본격적인 마야코 경호가 시작된다.',
      requiredSteps: ['LOOK:yale_campus_gate', 'TALK:stollman_kou'],
      talkLines: {
        stollman_kou: [
          '「내각조사실에서 파견된 새 강사분이시군요. 저는 교장 스트르만=코우입니다. 학교 안은 조용하지만… 최근 불온한 시선이 느껴집니다.」',
          '「전속 강사 신분증을 발급해 드리겠습니다. 내일부터 미도 마야코 양을 잘 부탁드립니다.」',
        ],
        hiromi_matsuno: [
          '「안녕하세요, 미술 교육실습생 마츠노 히로미예요. 도서관 고미술 자료를 정리하고 있어요.」',
          '「새 강사 선생님이시라니 반가워요! 학교 분위기가 요 며칠 조금 어수선하더라고요.」',
        ],
      },
      advanceNarration: '12월 2일(Day 0) 사전 답사와 강사 신분증 확보를 마쳤다. 자정이 지나며 12월 3일이 밝아오고 — 도쿄 어딘가에서 또 한 명의 주인공, 사립탐정 아마기 코지로의 사건이 시작된다! [SB_01 해제]',
    },

    K_D1_01: {
      focusId: 'islamic_painting_photo',
      focusLabel: '이슬람 문양 회화 의뢰 사진과 저택 서재',
      focusLook1: '시바타 아카네가 들고 온 이슬람 문양 회화 사진. 단순한 분실 미술품이라기엔 의뢰인이 제시한 착수금과 긴박함이 지나치게 크다.',
      focusLook2: '저택 서재에는 누군가 급히 그림과 기록을 뒤진 흔적이 남아 있다. 의뢰인 "스트르만=코우"의 태도 어딘가 묘하게 어색하다.',
      requiredSteps: ['LOOK:islamic_painting_photo', 'TALK:dib'],
      talkLines: {
        akane_shibata: [
          '「코지로! 굶어 죽기 직전인 아마기 탐정사무소에 특급 의뢰를 물어왔어! "이슬람 문양 회화"를 찾는 일이야.」',
          '「의뢰인은 스트르만=코우라는 외국인이야. 보수가 두둑하니 놓치지 마!」',
        ],
        dib: [
          '「내가 스트르만=코우다. 분실된 이슬람 문양 회화를 반드시 되찾아 주게. 저택 서재 열쇠와 자료를 맡기지.」',
          '「경찰이나 외부 기관에는 알리지 마라. 오직 탐정의 방식으로 조용히 찾아내게.」',
        ],
        yayoi_katsuragi: [
          '「코지로… 너까지 이 회화 의뢰에 끼어든 거야? 카츠라기 사무소 쪽에도 같은 의뢰가 들어왔어. 조심해.」',
          '「아버지(카츠라기 겐자부로)가 사라진 뒤로 이런 기분 나쁜 의뢰는 처음이야.」',
        ],
        susumu_nikaido: [
          '「흥, 영세 사무소 주제에 우리 카츠라기 탐정사무소의 일감을 가로채려 드나, 아마기 선배?」',
          '「이 건은 내가 먼저 끝낼 테니까 항구 구석에서 잠이나 자라고!」',
        ],
      },
      advanceNarration: '회화 자료, 탐정 수첩, 저택 열쇠를 챙기고 의뢰를 수주했다. 이 저택 방문이 엘디아 측 경계 수위를 흔들기 시작한다! [SB_02 해제]',
    },

    K_D1_02: {
      focusId: 'harbor_alley',
      focusLabel: '항구 창고 거리의 어두운 골목',
      focusLook1: '안개가 깔린 항구 창고 거리. 무장한 괴한들에게 쫓기던 금발·갈색 피부·오드아이 소녀가 컨테이너 뒤에 몸을 숨기고 떨고 있다.',
      focusLook2: '소녀가 떨어뜨린 작은 표식(펜던트)에는 이국적인 왕가의 문장이 새겨져 있다. 평범한 가출 소녀가 아니다.',
      requiredSteps: ['LOOK:harbor_alley', 'TALK:prisia_rem_crime'],
      talkLines: {
        prisia_rem_crime: [
          '「……고마워요. 저 사람들은 계속 나를 쫓아와요. 이름? …기억이 잘 나지 않지만, 당신은 믿어도 될 것 같아요.」',
          '「"푸딩"이라고 불러 줄래요? 당분간 여기 사무소에 있어도 될까요…?」',
        ],
      },
      advanceNarration: '정체불명의 소녀에게 "푸딩"이라는 애칭을 붙이고 아마기 탐정사무소에 보호했다. 그녀의 정체와 회화 사건의 연결고리를 풀려면 예일 외국인학교 동향을 살펴야 하지만, 아직 실마리가 부족하다.',
    },

    M_D1_01: {
      focusId: 'yale_corridor',
      focusLabel: '예일 외국인학교 복도와 경호 배치',
      focusLook1: '전속 강사 신분증으로 잠입 부임한 예일 외국인학교. 어제보다 교내 경비 분위기가 미묘하게 날카로워졌다.',
      focusLook2: '아랍어 강사 시리아 플랫이 창밖을 주시하고 있고, 경호 대상 미도 마야코는 경호원을 극도로 경계하고 있다.',
      requiredSteps: ['LOOK:yale_corridor', 'TALK:mayako_mido'],
      talkLines: {
        mayako_mido: [
          '「당신이 아버지가 붙인 경호원인가요? 필요 없어요. 저는 혼자서도 괜찮으니까 따라다니지 마세요!」',
          '「…가끔 머리가 깨질 듯이 아프고 기억이 끊길 때가 있지만, 그건 그냥 피곤해서예요.」',
        ],
        celia_flat: [
          '「새로 오신 강사분이시군요. 아랍어를 가르치는 시리아 플랫입니다. 학교 일에 지나치게 깊이 관여하지 않는 편이 좋을 겁니다.」',
          '「이 학교엔 겉으로 보이는 것보다 훨씬 오래된 비밀이 묻혀 있으니까요.」',
        ],
      },
      advanceNarration: '마야코의 경호 거부 반응과 수상한 기억 공백을 포착했다. 다음 날(12월 4일), 학교 뒤편 디렉터룸을 은밀히 조사하기로 결심한다.',
    },

    M_D2_01: {
      focusId: 'director_room_vault',
      focusLabel: '예일 외국인학교 디렉터룸 비밀 금고',
      focusLook1: '학교 뒤편 디렉터룸을 은밀히 수색한 결과, 스트르만 교장이 남긴 엘디아 기밀 서류와 "둘로 쪼개진 국새(国璽)" 중 한쪽 절반의 단서를 발견했다!',
      focusLook2: '나머지 절반은 학교 밖에 숨겨져 있다는 메모가 남아 있다. 그 순간 복도에서 보험 외판원을 자칭하는 수수께끼의 중년 남자가 말을 걸어온다.',
      requiredSteps: ['LOOK:director_room_vault', 'TALK:genzaburo_katsuragi'],
      talkLines: {
        genzaburo_katsuragi: [
          '「실례합니다, 보험회사 세일즈맨 스즈키 겐자부로라고 합니다. 아가씨, 내각조사실 소속이시죠? 디렉터룸의 물건은 함부로 건드리면 목숨이 위태롭습니다.」',
          '「국새는 둘로 나뉘어 숨겨졌소. 그리고 이 사건의 뿌리에는 오래전 끝났어야 할 "C 프로젝트"가 있소…」',
        ],
        mayako_mido: [
          '「선생님, 방금 그 보험 아저씨랑 무슨 얘기를 하신 거예요? 어쩐지… 어딘가에서 본 적이 있는 얼굴 같은데.」',
          '「제발 아버지께는 제가 두통을 앓는다는 말은 하지 말아 주세요.」',
        ],
        kyoko_himuro: [
          '「역시 내각조사실 요원이었군요. 저는 교육감시기구의 히무로 쿄코. 이 학교의 비리를 추적하고 있었습니다.」',
          '「교장 스트르만 씨의 행방이 어제부터 묘연합니다. 경계를 늦추지 마세요.」',
        ],
      },
      advanceNarration: '디렉터룸에서 학교 측 국새 조각을 확보하고 "스즈키 겐자부로"의 경고를 들었다. 학교 내부 조사 여파가 외부로 번지며 코지로 측 도서관 수사에 실마리가 열린다! [SB_03 해제]',
    },

    K_D2_01: {
      focusId: 'library_art_archive',
      focusLabel: '예일 학교 도서관 고미술 아카이브 & 회화 분석',
      focusLook1: '예일 학교 도서관의 고미술 자료와 회화 사진을 대조했다. 이슬람 문양은 단순한 장식이 아니라 엘디아 왕위 계승의 상징인 "국새(国璽)"의 절반 위치를 가리키는 암호였다!',
      focusLook2: '스트르만 저택 측 단서와 맞물려 국새의 저택·회화 측 절반을 추적해 냈다. 하지만 나머지 절반은 학교 깊은 어딘가에 있다는 소문이 돈다.',
      requiredSteps: ['LOOK:library_art_archive', 'TALK:hiromi_matsuno', 'TALK:celia_flat'],
      talkLines: {
        hiromi_matsuno: [
          '「이 이슬람 문양 회화요? 엘디아 왕가의 국새 문양과 일치해요! 저택 서재의 암호를 풀면 절반의 위치를 알 수 있을 거예요.」',
          '「참, 어제 학교 뒤편 디렉터룸 쪽이 한바탕 소란스러웠대요. 누군가 조사하고 간 것 같아요.」',
        ],
        celia_flat: [
          '「아마기 코지로… 카츠라기 겐자부로의 양자 맞지요? 저는 시리아 플랫. 엘디아의 음모를 내부에서 막으려 하고 있어요.」',
          '「당신이 의뢰받은 회화는 단순한 그림이 아닙니다. 진짜 표적은 엘디아의 국새와 왕위 계승자예요.」',
        ],
        yayoi_katsuragi: [
          '「니카이도가 요즘 밤마다 이상한 외국인과 몰래 거래하는 것 같아… 코지로, 이 사건은 우리 손에 벅찬 국제 음모일지도 몰라.」',
          '「아버지가 살아 계셨다면 절대 건드리지 말라고 하셨을 텐데…」',
        ],
        susumu_nikaido: [
          '「날 감시하지 마! 회화의 행방은 내가 거의 다 잡았다고. 방해하면 가만 안 둬!」',
          '「…젠장, 저쪽 놈들이 생각보다 훨씬 위험한 놈들이었어…」',
        ],
      },
      advanceNarration: '저택·회화 측 국새 조각 단서를 확보하고 시리아 플랫의 수상한 배후를 감지했다. 다음 날 아침(12월 5일), 충격적인 신문 보도가 도착한다.',
    },

    K_D3_01: {
      focusId: 'morning_newspaper',
      focusLabel: '12월 5일 조간 신문 1면 (스트르만 교장 피살 보도)',
      focusLook1: '조간 신문 1면에 실린 충격적인 사진 — "예일 외국인학교 교장 스트르만=코우 피살, 용의자 니카이도 스스무 전국 지명수배"!',
      focusLook2: '사진 속 진본 스트르만 교장의 얼굴은 12월 3일 나에게 회화 수색을 의뢰한 남자와 완전히 다른 인물이다! 내가 만난 의뢰인은 가짜(사칭범)였다!',
      requiredSteps: ['LOOK:morning_newspaper', 'TALK:glen', 'TALK:aqua_still_lloyd'],
      talkLines: {
        akane_shibata: [
          '「코지로, 신문 봤어?! 내가 중개해 준 의뢰인이 가짜 스트르만이었다니! 니카이도까지 수배범이 됐잖아!」',
          '「미안해, 나도 완전히 속았어. 샷 바의 정보상 구렌이라면 엘디아 쪽 암살자 정보를 알지도 몰라!」',
        ],
        glen: [
          '「오랜만이군, 아마기. 스트르만을 고문 살해하고 사칭한 놈은 엘디아 정보부 간부 "디브"다.」',
          '「그리고 하나 더 — 엘디아 구 정보부엔 전설의 암살자 "테러"가 있었다. 디브와는 또 다른 그림자가 움직이고 있어.」',
        ],
        aqua_still_lloyd: [
          '「혼자 마시는 술은 쓰네요… 저는 아쿠아. 사립탐정이라니 흥미롭군요. 진실은 때로 겉모습과 정반대인 법이에요.」',
          '「누군가는 평화를 원하지만, 망령 같은 과거가 그걸 허락하지 않죠. 조심하세요, 탐정님.」',
        ],
        stollman_kou: [
          '[신문 기사 기록] 진본 스트르만=코우 교장은 이미 피살된 상태로 발견되었다. 디브의 사칭이 명백히 드러났다.',
        ],
      },
      advanceNarration: '의뢰인의 정체가 사칭범 "디브"였음이 폭로되었고, 샷 바에서 수수께끼의 미녀 "아쿠아"와 조우했다. 이 파장이 대사관과 마리나 측 수사에 직격한다! [SB_04 해제]',
    },

    M_D3_01: {
      focusId: 'embassy_security_log',
      focusLabel: '주일 엘디아 대사관 경비 변동 기록',
      focusLook1: '스트르만 교장 피살 보도 직후 엘디아 대사관의 경비가 극도로 강화되었다. 엘디아 정보부 공작원 디브가 대사관을 드나든 흔적이 포착된다.',
      focusLook2: '내각조사실 내부 데이터베이스(DBMS)에 엘디아 극비 프로젝트 기록이 봉인되어 있다는 단서를 히무로 쿄코가 건네준다.',
      requiredSteps: ['LOOK:embassy_security_log', 'TALK:kyoko_himuro'],
      talkLines: {
        kyoko_himuro: [
          '「호죠 씨, 이제 공조합시다. 스트르만 교장을 죽인 건 엘디아 정보부의 디브예요. 그리고 내각조사실 본부 DBMS에 "C 프로젝트" 기밀이 숨겨져 있습니다.」',
          '「내일(12월 6일) 본부 터미널로 침입해 보죠. 단, Level-7 보안 프로텍트가 걸려 있어 만만치 않을 겁니다.」',
        ],
        ross_mido: [
          '「스트르만 교장의 비보는 참으로 유감입니다. 아쿠아 수상님도 방일 중이시니 마야코 경호를 더욱 철저히 해 주십시오.」',
          '「대사관 내부 사정은 외교 기밀입니다. 경호 본분에만 충실해 주시길.」',
        ],
        aqua_still_lloyd: [
          '「호죠 마리나 수사원, 수고가 많군요. 저는 엘디아 공화국 수상 아쿠아=스틸=로이드. 개혁을 가로막는 구 세력의 음모를 반드시 막아야 합니다.」',
          '「…어젯밤 시내 샷 바에서 흥미로운 탐정을 만났던 건 비밀로 해 두죠.」',
        ],
        dib: [
          '「내각조사실 개가 대사관 주변을 어슬렁거리는군. 엘디아의 일에 코를 박으면 살아서 돌아가지 못할 거다.」',
        ],
      },
      advanceNarration: '히무로 쿄코와 정식 공조를 맺고 내각조사실 본부 DBMS 침입을 결의했다. 이제 12월 6일(Day 4), 본부 터미널로 향한다.',
    },

    M_D4_01: {
      focusId: 'dbms_level7_terminal',
      focusLabel: '내각조사실 본부 DBMS Level-7 보안 터미널',
      focusLook1: '내각조사실 본부 빌딩 심야 터미널. C 프로젝트 파일에 접근하는 순간 화면이 붉게 점멸한다 — [ACCESS DENIED: LEVEL-7 SECURITY LOCK].',
      focusLook2: '패스워드 우회와 브루트포스를 수차례 시도했지만 교착(DEADLOCK) 상태다! 마리나 단독 침입으로는 절대 Level-7 프로텍트를 돌파할 수 없다!',
      requiredSteps: ['LOOK:dbms_level7_terminal', 'TALK:kyoko_himuro'],
      talkLines: {
        kyoko_himuro: [
          '「안 돼요, Level-7 실시간 락이 걸렸어요! 단독 해킹으로는 절대 뚫리지 않아요!」',
          '「이 DBMS의 유일한 약점은… 정확히 같은 시각에 외부에서 "정규 프로토콜"로 동시 접속이 들어와 교착(Deadlock) 타임래그가 발생하는 순간뿐이에요!」',
        ],
      },
      advanceNarration: 'Level-7 보안 장벽에 완전히 봉쇄되었다! [SB_05 점화] — 마리나 단독으로는 돌파 불가능하다. 지금 즉시 SIGHT CHANGE로 코지로 시점으로 전환해 동시 접속 타임래그를 열어야 한다! [SB_06 대기]',
    },

    K_D4_01: {
      focusId: 'agency_modem_terminal',
      focusLabel: '아마기 사무소 원격 모뎀 & 본부 DBMS 정규 접속 프로토콜',
      focusLook1: '히무로 쿄코가 가져온 본부 DBMS 정규 접속 단말. 지금 정확히 이 시각, 내각조사실 본부 서버 어딘가에서 치열한 보안 경합이 벌어지고 있다!',
      focusLook2: '정규 접속 계정(ITEM: 히무로 제공 DBMS 정규 접속 단말·계정)을 지금 실행하면 서버에 동시 접근 데드락 타임래그가 발생할 것이다!',
      requiredSteps: ['TALK:kyoko_himuro', 'ITEM:item_dbms_access_credential'],
      talkLines: {
        kyoko_himuro: [
          '「아마기 씨, 지금이에요! 내각조사실 DBMS에 정규 접속 단말을 연결해 동시에 조회 요청을 보내 주세요!」',
          '「누군가(마리나)가 지금 막 Level-7 장벽과 씨름하고 있을 타이밍이에요. 소지품(ITEM)에서 DBMS 접속 단말을 사용하세요!」',
        ],
      },
      advanceNarration: '동시 정규 접속 실행 성공! [DBMS DEADLOCK TIME-LAG OPEN] — 본부 서버의 보안 락에 0.8초의 치명적인 균열이 열렸다! 마리나 시점의 Level-7 봉쇄가 즉시 해제된다! [SB_06 돌파]',
    },

    M_D4_02: {
      focusId: 'c_project_screen',
      focusLabel: 'C 프로젝트 극비 데이터 화면 (코드명 μ-101)',
      focusLook1: '정체불명의 외부 동시 접속으로 생긴 타임래그 틈새로 Level-7 프로텍트를 돌파했다! 화면에 떠오른 극비 파일: "C 프로젝트 — 유기 휴머노이드 클론 μ-101 및 기억 이식 실험".',
      focusLook2: '데이터를 백업한 직후 비상 경보가 울린다! 도청기 발각과 함께 카가와 미스미 감찰관이 무장 병력을 이끌고 사문실로 들이닥쳤다! 애총 "이쿠이쿠"(ITEM)로 돌파할지 선택해야 한다!',
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
          '「…알겠다. 네가 진실을 밝힐 수 있다면 이번 한 번만 눈감아 주지. 어서 도망쳐!」',
        ],
        misumi_kagawa: [
          '「멈춰, 호죠 마리나! 불법 DBMS 침입에 본부장 협박까지! 당장 무기를 버려!」',
          '「칫… 놓치다니! 전 구역에 마리나 수배령을 내려라!」',
        ],
        genzaburo_katsuragi: [
          '「잘 빠져나왔군, 아가씨. C 프로젝트의 진실은 곧 트리스탄호에서 결판날 거요. 프린세스 호텔 쪽을 주시하게.」',
        ],
      },
      advanceNarration: 'C 프로젝트 기밀(μ-101 기록)을 확보하고 코노 본부장 인질극으로 사문 포위를 극적으로 탈출했다! 이 기밀 유출에 경악한 엘디아 정보부가 즉각 코지로와 푸딩을 향해 움직이기 시작한다! [SB_07 해제]',
    },

    K_D4_02: {
      focusId: 'princess_hotel_ambush',
      focusLabel: '창고 거리·프린세스 호텔 대치 현장',
      focusLook1: '행방불명됐던 푸딩과 재회했다! 그녀의 표식(ITEM: 푸딩의 소지품)과 시리아의 증언이 하나로 맞아떨어진다 — 푸딩은 엘디아 공화국의 정통 왕위 계승자 "프리시아 렘 크라임" 공주다!',
      focusLook2: '그 순간 가짜 스트르만 "디브"가 무장 부하들을 이끌고 습격해 왔다! 프리시아를 지키며 돌파해야 한다!',
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
          '「코지로… 내 진짜 이름은 "프리시아 렘 크라임". 엘디아의 왕위 계승자예요. 끝까지 지켜줘서 고마워요!」',
          '「내일 엘디아로 출항하는 호화 여객선 트리스탄호에 모든 음모가 모여 있어요.」',
        ],
        dib: [
          '「아마기 코지로! 국새 회화 찾기에 써먹고 버릴 탐정 따위가 프리시아 공주를 숨기고 있었군! 여기서 끝장내 주마!」',
        ],
        celia_flat: [
          '「코지로, 어서 프리시아 공주를 데리고 빠져나가! 난 야요이의 이복자매이자 카츠라기 겐자부로의 딸이야. 아버지의 뜻을 이어 여길 막아낼게!」',
        ],
      },
      advanceNarration: '푸딩의 정체가 프리시아 공주임을 확인하고 디브의 습격을 돌파했다! 이제 12월 7일(Day 5), 모든 인연이 집결하는 호화 여객선 트리스탄호로 잠입한다.',
    },

    K_D5_01: {
      focusId: 'tristan_crime_scene',
      focusLabel: '트리스탄호 갑판·연쇄 살인 현장',
      focusLook1: '호화 여객선 트리스탄호에 잠입했다. 하지만 선내에서는 이미 니카이도 스스무, 디브, 그리고 아쿠아(엘디아 수상!)가 잇달아 피살되는 끔찍한 연쇄 살인이 벌어졌다!',
      focusLook2: '스트르만을 죽인 건 디브였지만, 니카이도·디브·아쿠아를 차례로 살해한 진범 "테러"는 전혀 다른 인물이다! 소란 중 부상을 입은 코지로는 마야코와 함께 선창에 고립된다.',
      requiredSteps: ['LOOK:tristan_crime_scene', 'TALK:mayako_mido'],
      talkLines: {
        mayako_mido: [
          '「코지로 씨, 괜찮으세요?! 선내에 총소리가 울리고 사람들이 쓰러졌어요… 어서 이 선창 안으로 피하세요!」',
          '「…이상해요. 아쿠아 언니가 쓰러질 때, 제 기억이 또 잠깐 끊겼어요…」',
        ],
        susumu_nikaido: [
          '[현장 기록] 니카이도 스스무는 국새 뒷거래의 끝에서 암살자 "테러"의 손에 이미 목숨을 잃었다.',
        ],
        aqua_still_lloyd: [
          '[현장 기록] 샷 바에서 만났던 미녀 아쿠아의 정체는 엘디아 수상 아쿠아=스틸=로이드였다. 그녀 역시 프리시아 즉위를 인정하려다 "테러"에게 피살되었다.',
        ],
        dib: [
          '[현장 기록] 스트르만을 사칭했던 디브마저 선내에서 "테러"에게 냉혹하게 제거되었다.',
        ],
      },
      advanceNarration: '코지로는 마야코와 함께 트리스탄호 선창에 고립되었다. 이제 마리나(+프리시아)가 선창에 합류할 때 최종 수렴편이 열린다! [SB_08 코지로 측 완료]',
    },

    M_D5_01: {
      focusId: 'tristan_boarding_manifest',
      focusLabel: '트리스탄호 승선 수색 및 프리시아 호위 루트',
      focusLook1: '프리시아 공주를 안전하게 인계받아 트리스탄호에 승선했다! 로스=미도 대사의 쿠데타 음모가 선상에서 최후의 단계로 치닫고 있다.',
      focusLook2: '선창 쪽에서 총성과 함께 누군가 고립되었다는 교신이 들어온다. 프리시아와 함께 서둘러 선창으로 내려간다!',
      requiredSteps: ['LOOK:tristan_boarding_manifest', 'TALK:prisia_rem_crime'],
      talkLines: {
        prisia_rem_crime: [
          '「호죠 마리나 씨… 아까까지 저를 지켜주던 코지로라는 탐정이 아직 이 배 어딘가에 있을 거예요. 어서 선창으로 가요!」',
          '「그리고… 어쩐지 이 배 안에 나랑 똑같은 존재가 있는 것 같은 불길한 예감이 들어요.」',
        ],
        ross_mido: [
          '「호죠 마리나! 사문에서 탈출해 여기까지 쫓아오다니… 하지만 이미 늦었다. 전 국왕의 부활과 C 프로젝트는 오늘 밤 완성된다!」',
        ],
        genzaburo_katsuragi: [
          '「마리나, 선창으로 가라. 거기엔 내가 평생 짊어져야 했던 죄의 실체와, 네가 아직 만나지 못한 또 한 명의 수사자가 기다리고 있다.」',
        ],
        kyoko_himuro: [
          '「선내 통신을 확보했어요! 선창 격벽이 폭발 직전이에요. 서둘러 합류하세요!」',
        ],
      },
      advanceNarration: '마리나와 프리시아가 트리스탄호 선창에 도달했다! [SB_08 마리나 측 완료]',
    },

    C_D6_01: {
      focusId: 'submerged_hold_truth',
      focusLabel: '침몰한 트리스탄호 해저 선창 — 양측 기억·단서의 완전한 합류',
      focusLook1: '거대한 폭발과 함께 트리스탄호가 해저로 침몰했다! 밀폐된 선창에 마침내 모인 4인 — [코지로 + 마야코]와 [마리나 + 프리시아]! 비상 산소통을 확보하고 두 주인공의 5일간 기억과 증거가 하나로 합쳐진다!',
      focusLook2: '모든 비대칭의 퍼즐이 소름 끼치도록 맞아떨어진다: 스즈키 = 카츠라기 겐자부로, 푸딩 = 프리시아 공주, 쪼개진 국새의 두 절반, C 프로젝트의 유전자 클론 μ-101, 그리고 프리시아와 거울처럼 닮은 얼굴… 연쇄살인범 "테러"의 진범을 지목하라!',
      requiredSteps: ['LOOK:submerged_hold_truth', 'TALK:marina_hojo'],
      talkLines: {
        marina_hojo: [
          '「당신이 바로… DBMS 동시 접속으로 날 구해 준 사립탐정 아마기 코지로군요! 내 C 프로젝트 자료(μ-101)와 당신의 연쇄 살인 추리를 합치면 진범은 단 한 명뿐이에요!」',
        ],
        kojiro_amagi: [
          '「당신이 예일 학교와 본부를 뒤흔든 내각조사실 요원 호죠 마리나로군! 스즈키가 양부 카츠라기 겐자부로였고, 푸딩이 프리시아 공주라면… 모든 거짓말의 중심에 있는 자는 명백해!」',
        ],
        mayako_mido: [
          '「…왜 다들 나를 그런 눈으로 보는 거죠? 머리가… 아파요… 내 안의 또 다른 목소리가… "엘디아의 왕좌를 되찾아라"라고 속삭이고 있어요…!」',
        ],
        prisia_rem_crime: [
          '「마야코… 당신과 나는 같은 유전자를 가진 거울 같은 존재였군요. 하지만 전 국왕의 망령이 당신을 조종하게 둘 수는 없어요!」',
        ],
        ross_mido: [
          '「하하하! 이제야 깨달았나! 전 국왕 폐하의 인격을 클론에 이식한 궁극의 걸작 C 프로젝트가 바로 눈앞에 있다!」',
        ],
        genzaburo_katsuragi: [
          '「코지로, 마리나… 그리고 야요이, 시리아. 내 과거의 과오를 이제 너희 손으로 끝내 다오. 진범의 이름을 밝혀라!」',
        ],
        celia_flat: [
          '「아버지… 그리고 코지로. 모든 진실이 밝혀졌어요. 이제 마지막 이름을 선언할 시간이에요.」',
        ],
        yayoi_katsuragi: [
          '「아버지가 살아 계셨다니… 코지로, 반드시 살아서 돌아와야 해!」',
        ],
      },
      advanceNarration: '모든 진실이 완성되었다. 이제 최후의 선택 — 연쇄살인범 "테러"의 진범 이름을 입력하라!',
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
      .replace(/[\s=＝・･·\-_.,'"「」『』()（）]/g, '');
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
        converged: false,
        endingId: null,
        crisisCleared: {},
      },
      stats: {
        totalCommands: 0,
        sightChanges: 0,
        barriersUnlocked: 0,
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
      if (state.narrativeLog.length > 80) {
        state.narrativeLog = state.narrativeLog.slice(state.narrativeLog.length - 80);
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

      // If current scene isn't completed yet, that's the scene we're on (unless blocked before entering, e.g., Kojiro SB_01).
      if (pState.completedScenes.indexOf(currId) === -1) {
        return currId;
      }

      // Find next scene on this protagonist's track whose prev_scene_ids contains currId
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

      // Otherwise check final convergence scene C_D6_01
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

      var pState = state.protagonists[who];
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

      // Also check intra-track prev_scene_ids for convergence
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

      // Not blocked
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

    function mergeKnowledgeAtConvergence() {
      state.sharedWorld.converged = true;
      var conv = idx.scenesById['C_D6_01'];
      state.sharedWorld.worldDay = Math.max(state.sharedWorld.worldDay, conv.day_index);
      state.sharedWorld.calendarDate = conv.calendar_date;

      // Sync both protagonists into C_D6_01
      state.protagonists.kojiro.currentSceneId = 'C_D6_01';
      state.protagonists.marina.currentSceneId = 'C_D6_01';
      state.protagonists.kojiro.locationId = conv.location_ids[0];
      state.protagonists.marina.locationId = conv.location_ids[0];
      state.protagonists.kojiro.blockedByBarrierId = null;
      state.protagonists.marina.blockedByBarrierId = null;

      // Merge all clues discovered across both tracks + C_D6_01 clue
      var unionClues = state.protagonists.kojiro.knownClues.slice();
      for (var i = 0; i < state.protagonists.marina.knownClues.length; i++) {
        uniquePush(unionClues, state.protagonists.marina.knownClues[i]);
      }
      uniquePush(unionClues, 'clue_tristan_target_swap');
      state.protagonists.kojiro.knownClues = unionClues.slice();
      state.protagonists.marina.knownClues = unionClues.slice();

      // Grant shared oxygen cylinders
      grantSceneItems('kojiro', 'C_D6_01');
      grantSceneItems('marina', 'C_D6_01');

      // Reveal all characters whose truth reveals at C_D6_01
      revealCharactersForScene('kojiro', 'C_D6_01');
      revealCharactersForScene('marina', 'C_D6_01');

      // Emit convergence flag
      uniquePush(state.sharedWorld.unlockedFlags, 'evt_tristan_dual_convergence');

      // Save automatic checkpoint before finale deduction
      saveCheckpoint();

      pushLog({
        protagonist: state.activeProtagonist,
        sceneId: 'C_D6_01',
        speaker: 'CONVERGENCE // 12-08 (트리스탄호 해저 선창)',
        kind: 'convergence',
        text: '【단일 시점 수렴】 코지로(+마야코)와 마리나(+프리시아)가 트리스탄호 선창에서 마침내 합류했다! 5일간 격리되어 있던 양측의 단서와 기억이 하나로 통합된다.',
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

          // If a protagonist was stalled waiting specifically for this barrier, unblock & move them into the newly unlocked scene!
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
                  // Pre-grant entry items if entering K_D4_01 so Kojiro has DBMS credential ready to use!
                  if (targetScene.id === 'K_D4_01') {
                    grantSceneItems('kojiro', 'K_D4_01');
                  }
                }
              }
            }
          }
        }
      }

      // Check SB_08 final convergence trigger
      if (
        !state.sharedWorld.converged &&
        state.sharedWorld.unlockedBarriers.indexOf('SB_08') !== -1 &&
        isSceneCompleted('K_D5_01') &&
        isSceneCompleted('M_D5_01')
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

    function getSceneProgress(protagonist) {
      var who = protagonist || state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var spec = SCENE_SPECS[sceneId];
      var done = pState.sceneStepsDone[sceneId] || [];
      var required = spec ? spec.requiredSteps.slice() : [];
      var remaining = [];
      for (var i = 0; i < required.length; i++) {
        if (done.indexOf(required[i]) === -1) {
          remaining.push(required[i]);
        }
      }
      return {
        sceneId: sceneId,
        completed: pState.completedScenes.indexOf(sceneId) !== -1,
        requiredSteps: required,
        completedSteps: done.slice(),
        remainingSteps: remaining,
        readyToAdvance: remaining.length === 0 && pState.blockedByBarrierId === null,
      };
    }

    function markStepDone(protagonist, sceneId, stepKey) {
      var pState = state.protagonists[protagonist];
      if (!pState.sceneStepsDone[sceneId]) {
        pState.sceneStepsDone[sceneId] = [];
      }
      return uniquePush(pState.sceneStepsDone[sceneId], stepKey);
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

      // Day 0 prologue lock: until SB_01 is unlocked (M_D0_02 completed), Kojiro is not available
      if (state.sharedWorld.unlockedBarriers.indexOf('SB_01') === -1) {
        return {
          allowed: false,
          reason: 'SIGHT_CHANGE_LOCKED_DAY0',
          targetProtagonist: target,
        };
      }

      // If current scene disallows sight change AND has not yet been completed
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

    function getAvailableCommands() {
      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var scene = idx.scenesById[pState.currentSceneId];
      var spec = SCENE_SPECS[pState.currentSceneId] || {};
      var selfCharId = who === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
      var barrierInfo = checkSyncBarrier(who);
      var sightInfo = canSightChange();

      var lookTargets = [
        { id: 'surroundings', label: '주변 현장 관찰 (' + idx.locationsById[pState.locationId].name_kr + ')' },
      ];
      if (spec.focusId) {
        lookTargets.push({
          id: spec.focusId,
          label: spec.focusLabel,
          isKeyObjective: (spec.requiredSteps || []).indexOf('LOOK:' + spec.focusId) !== -1,
        });
      }

      var talkTargets = [];
      if (scene) {
        for (var i = 0; i < scene.character_ids.length; i++) {
          var cid = scene.character_ids[i];
          if (cid === selfCharId && !state.sharedWorld.converged) continue;
          if (cid === selfCharId) continue;
          var cv = getCharacterView(cid, who);
          if (!cv) continue;
          talkTargets.push({
            id: cid,
            label: cv.displayName,
            role: cv.role,
            trustLevel: cv.trustLevel,
            isKeyObjective: (spec.requiredSteps || []).indexOf('TALK:' + cid) !== -1,
          });
          lookTargets.push({
            id: cid,
            label: '인물 관찰: ' + cv.displayName,
          });
        }
      }

      var thinkTargets = [
        { id: 'situation', label: '현재 단서와 상황 정리' },
        { id: 'suspects', label: '접촉 인물 재평가' },
        { id: 'barrier', label: '진행 정체 / 교차 시점 추론' },
      ];

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
        itemTargets.push({
          id: item.id,
          label: item.name_kr,
          isKeyObjective: (spec.requiredSteps || []).indexOf('ITEM:' + item.id) !== -1,
          usedHere: item.used_scene === pState.currentSceneId,
        });
      }

      var crisisTargets = [];
      if (spec.crisis && !state.sharedWorld.crisisCleared[pState.currentSceneId] && !state.sharedWorld.endingId) {
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
        sceneId: pState.currentSceneId,
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
        crisisPrompt: spec.crisis && !state.sharedWorld.crisisCleared[pState.currentSceneId] ? spec.crisis.prompt : null,
        canDeduceCulprit: state.sharedWorld.converged && !state.sharedWorld.endingId,
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
              ? '두 주인공은 이미 트리스탄호 선창에서 합류했습니다. 더 이상 시점을 전환할 수 없습니다.'
              : 'Day 0 프롤로그 완료(예일 외국인학교 사전 답사) 전까지는 호죠 마리나 시점으로 고정됩니다.';
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
          // Pre-grant DBMS credential on entering K_D4_01 so Kojiro can use ITEM directly
          if (newScene.id === 'K_D4_01' && newP.blockedByBarrierId === null) {
            grantSceneItems('kojiro', 'K_D4_01');
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
      var scene = idx.scenesById[pState.currentSceneId];
      var spec = SCENE_SPECS[pState.currentSceneId] || {};
      var countKey = pState.currentSceneId + ':' + normalizedVerb + ':' + (targetId || 'default');
      pState.commandCounts[countKey] = (pState.commandCounts[countKey] || 0) + 1;
      var repeatCount = pState.commandCounts[countKey];
      state.stats.totalCommands += 1;

      // LOOK command
      if (normalizedVerb === 'LOOK') {
        var target = targetId || (spec.focusId || 'surroundings');
        var loc = idx.locationsById[pState.locationId];
        var text = '';
        var speaker = who === 'kojiro' ? '코지로의 관찰' : '마리나의 관찰';

        if (target === 'surroundings') {
          text =
            repeatCount === 1
              ? '[' + loc.name_kr + ' (' + loc.district + ')] ' + loc.summary
              : '[' + loc.name_kr + ' 재조사] ' + (scene ? scene.summary : loc.summary);
          if (pState.blockedByBarrierId) {
            var stallB = idx.barriersById[pState.blockedByBarrierId];
            text += ' [정체 중: ' + stallB.name_kr + ']';
          }
        } else if (target === spec.focusId) {
          text = repeatCount === 1 ? spec.focusLook1 : spec.focusLook2 || spec.focusLook1;
          markStepDone(who, pState.currentSceneId, 'LOOK:' + target);
          // Award clues/items naturally linked to key scene look
          if (pState.currentSceneId === 'M_D2_01') {
            grantSceneItems('marina', 'M_D2_01');
            grantSceneClues('marina', 'M_D2_01');
          } else if (pState.currentSceneId === 'K_D2_01') {
            grantSceneItems('kojiro', 'K_D2_01');
            grantSceneClues('kojiro', 'K_D2_01');
          } else if (pState.currentSceneId === 'K_D3_01') {
            grantSceneClues('kojiro', 'K_D3_01');
            revealCharactersForScene('kojiro', 'K_D3_01');
          } else if (pState.currentSceneId === 'M_D4_01') {
            grantSceneClues('marina', 'M_D4_01');
          } else if (pState.currentSceneId === 'M_D4_02') {
            grantSceneItems('marina', 'M_D4_02');
            grantSceneClues('marina', 'M_D4_02');
          } else if (pState.currentSceneId === 'K_D5_01') {
            grantSceneClues('kojiro', 'K_D5_01');
            revealCharactersForScene('kojiro', 'K_D5_01');
          }
        } else if (idx.charactersById[target]) {
          var cv = getCharacterView(target, who);
          speaker = cv.displayName + ' 관찰';
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
          return { ok: false, reason: 'INVALID_TARGET', message: '조사할 대상을 찾을 수 없습니다.' };
        }

        pushLog({ speaker: speaker, kind: 'look', text: text });
        return {
          ok: true,
          verb: 'LOOK',
          targetId: target,
          repeatCount: repeatCount,
          text: text,
          progress: getSceneProgress(who),
        };
      }

      // TALK command
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
        var line = lines[Math.min(repeatCount - 1, lines.length - 1)];

        markStepDone(who, pState.currentSceneId, 'TALK:' + targetId);

        // Award scene items/clues/reveals tied to talking to key NPCs
        if (pState.currentSceneId === 'M_D0_01' && targetId === 'saburo_kouno') {
          grantSceneItems('marina', 'M_D0_01');
        } else if (pState.currentSceneId === 'M_D0_02' && targetId === 'stollman_kou') {
          grantSceneItems('marina', 'M_D0_02');
        } else if (pState.currentSceneId === 'K_D1_01' && targetId === 'dib') {
          grantSceneItems('kojiro', 'K_D1_01');
        } else if (pState.currentSceneId === 'K_D1_02' && targetId === 'prisia_rem_crime') {
          grantSceneItems('kojiro', 'K_D1_02');
          grantSceneClues('kojiro', 'K_D1_02');
        } else if (pState.currentSceneId === 'M_D1_01' && targetId === 'mayako_mido') {
          grantSceneClues('marina', 'M_D1_01');
        } else if (pState.currentSceneId === 'M_D2_01' && targetId === 'genzaburo_katsuragi') {
          grantSceneClues('marina', 'M_D2_01');
        } else if (pState.currentSceneId === 'M_D3_01' && targetId === 'kyoko_himuro') {
          revealCharactersForScene('marina', 'M_D3_01');
        } else if (pState.currentSceneId === 'K_D4_01' && targetId === 'kyoko_himuro') {
          grantSceneItems('kojiro', 'K_D4_01');
          revealCharactersForScene('kojiro', 'K_D4_01');
        } else if (pState.currentSceneId === 'M_D5_01' && targetId === 'prisia_rem_crime') {
          revealCharactersForScene('marina', 'M_D5_01');
        }

        pushLog({ speaker: charView.displayName, kind: 'talk', text: line });
        return {
          ok: true,
          verb: 'TALK',
          targetId: targetId,
          speaker: charView.displayName,
          repeatCount: repeatCount,
          text: line,
          progress: getSceneProgress(who),
        };
      }

      // THINK command — STRICT EPISTEMIC ISOLATION (uses ONLY activeProtagonist's knownClues & character views!)
      if (normalizedVerb === 'THINK') {
        var topic = targetId || 'situation';
        var whoName = who === 'kojiro' ? '아마기 코지로의 독백' : '호죠 마리나의 독백';
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
                  ? '「지금 내 선에서는 더 이상 진전시킬 수가 없다… 도쿄의 다른 어딘가에서 상황이 움직이길 기다려야 할 것 같군.」'
                  : '「여기서 내가 아무리 굴려 봐야 벽에 막혔어… 다른 쪽에서 사건이 움직여야 돌파구가 열리겠군.」';
            }
          } else {
            var prog = getSceneProgress(who);
            thought = prog.readyToAdvance
              ? '「이 장소에서 확보할 핵심 단서는 모두 챙겼다. 이제 다음 국면으로 나아갈 때다.」'
              : '「아직 현장 조사와 대화가 남아 있다. 주변을 살피고 핵심 인물과 이야기를 나눠 보자.」';
          }
        } else if (topic === 'suspects') {
          var seenParts = [];
          if (scene) {
            for (var s = 0; s < scene.character_ids.length; s++) {
              var id = scene.character_ids[s];
              if ((who === 'kojiro' && id === 'kojiro_amagi') || (who === 'marina' && id === 'marina_hojo')) continue;
              var v = getCharacterView(id, who);
              seenParts.push(v.displayName + '(' + v.role + ')');
            }
          }
          thought =
            '「지금 눈에 밟히는 인물들: ' +
            (seenParts.length > 0 ? seenParts.join(' / ') : '주변에 확인할 인물이 없다') +
            '.」';
        } else {
          // 'situation': strictly summarize ONLY pState.knownClues!
          if (pState.knownClues.length === 0) {
            thought =
              who === 'marina'
                ? '「내각조사실 에이전트로서 임무에 착수했다. 먼저 브리핑과 현장 조사를 철저히 마치자.」'
                : '「아마기 탐정사무소 소장으로서 의뢰를 파헤쳐 보자. 현장을 직접 두 눈으로 확인해야지.」';
          } else {
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
          }
        }

        pushLog({ speaker: whoName, kind: 'think', text: thought });
        return {
          ok: true,
          verb: 'THINK',
          targetId: topic,
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

        // Special interactive breakthroughs when using canonical items in their used_scene
        if (pState.currentSceneId === 'K_D4_01' && targetId === 'item_dbms_access_credential') {
          markStepDone('kojiro', 'K_D4_01', 'ITEM:item_dbms_access_credential');
          itemMsg =
            '【동시 정규 접속 프로토콜 가동】 히무로의 DBMS 단말로 본부 서버에 정규 조회 요청을 전송했다! 서버 보안 모듈에 동시 접근 경합(Deadlock) 타임래그가 발생하기 시작한다!';
        } else if (pState.currentSceneId === 'M_D4_02' && targetId === 'item_ikuiku_handgun') {
          markStepDone('marina', 'M_D4_02', 'ITEM:item_ikuiku_handgun');
          state.sharedWorld.crisisCleared['M_D4_02'] = true;
          itemMsg =
            '【사문 위기 돌파】 애총 "이쿠이쿠"를 뽑아 코노 본부장을 방패 삼아 카가와 미스미의 포위망을 돌파했다! C 프로젝트 데이터도 무사히 사수했다!';
        } else if (pState.currentSceneId === 'K_D4_02' && targetId === 'item_purin_pendant') {
          markStepDone('kojiro', 'K_D4_02', 'ITEM:item_purin_pendant');
          state.sharedWorld.crisisCleared['K_D4_02'] = true;
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

      // CRISIS command — handles safe vs fatal crisis choices in M_D4_02 / K_D4_02
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

      // Save checkpoint right before crisis resolution
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

    function advanceScene() {
      if (state.sharedWorld.endingId) {
        return { ok: false, reason: 'GAME_ENDED', endingId: state.sharedWorld.endingId };
      }

      var who = state.activeProtagonist;
      var pState = state.protagonists[who];
      var sceneId = pState.currentSceneId;
      var scene = idx.scenesById[sceneId];
      var spec = SCENE_SPECS[sceneId] || {};

      // If already at C_D6_01, advancing prompts Culprit Deduction
      if (sceneId === 'C_D6_01') {
        var cProg = getSceneProgress(who);
        if (!cProg.readyToAdvance) {
          return {
            ok: false,
            reason: 'OBJECTIVES_INCOMPLETE',
            remainingSteps: cProg.remainingSteps,
            message: '선창 합류 단서와 대화를 먼저 확인한 뒤 진범 지목에 들어가세요.',
          };
        }
        return {
          ok: true,
          readyForCulpritDeduction: true,
          message: '모든 단서가 하나로 모였습니다! 이제 최후의 범인 이름을 입력하세요.',
        };
      }

      // Check if protagonist is currently stalled on a Sync Barrier
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

      // Ensure current scene objectives are completed before concluding scene
      var prog = getSceneProgress(who);
      if (!prog.completed && prog.remainingSteps.length > 0) {
        return {
          ok: false,
          reason: 'OBJECTIVES_INCOMPLETE',
          remainingSteps: prog.remainingSteps,
          message: '이 장면의 핵심 조사/대화를 먼저 완료해야 다음 국면으로 진행할 수 있습니다.',
        };
      }

      // Complete current scene if not yet completed
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

      // Evaluate all Sync Barriers after emitting events!
      var unlockedBarriers = evaluateAllBarriers();

      // If convergence just happened, we're done advancing!
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

      // Determine next scene on this protagonist's track & check whether a Sync Barrier blocks it
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

      // Advance smoothly into next scene on this track
      if (nextBarrierCheck.nextSceneId && idx.scenesById[nextBarrierCheck.nextSceneId]) {
        var nextScene = idx.scenesById[nextBarrierCheck.nextSceneId];
        pState.currentSceneId = nextScene.id;
        pState.locationId = nextScene.location_ids[0];
        pState.blockedByBarrierId = null;
        if (nextScene.day_index > state.sharedWorld.worldDay) {
          state.sharedWorld.worldDay = nextScene.day_index;
          state.sharedWorld.calendarDate = nextScene.calendar_date;
        }
        // Pre-grant DBMS credential on entering K_D4_01
        if (nextScene.id === 'K_D4_01') {
          grantSceneItems('kojiro', 'K_D4_01');
        }

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

    function submitCulprit(rawInput) {
      if (!state.sharedWorld.converged) {
        return {
          ok: false,
          reason: 'NOT_CONVERGED',
          message: '최종 합류편(C_D6_01)에 도달하기 전에는 진범을 지목할 수 없습니다.',
        };
      }

      saveCheckpoint();

      var trueEnding = idx.endingsById['END_TRUE_RESCUE'];
      var wrongEnding = idx.endingsById['END_BAD_WRONG_CULPRIT'];
      var normalized = normalizeCulpritInput(rawInput);

      var acceptedSet = [];
      for (var i = 0; i < trueEnding.accepted_culprit_inputs.length; i++) {
        acceptedSet.push(normalizeCulpritInput(trueEnding.accepted_culprit_inputs[i]));
      }

      var isCorrect = normalized.length > 0 && acceptedSet.indexOf(normalized) !== -1;

      if (isCorrect) {
        uniquePush(state.protagonists.kojiro.completedScenes, 'C_D6_01');
        uniquePush(state.protagonists.marina.completedScenes, 'C_D6_01');
        uniquePush(state.sharedWorld.unlockedFlags, 'evt_true_culprit_identified');
        state.sharedWorld.endingId = trueEnding.id;
        pushLog({
          speaker: 'TRUE ENDING // ' + trueEnding.title_kr,
          kind: 'true_ending',
          text: '【진범 특정 성공: 미도 마야코 / 御堂真弥子 (μ-101)】 ' + trueEnding.summary,
        });
        return {
          ok: true,
          correct: true,
          normalizedInput: normalized,
          endingId: trueEnding.id,
          ending: deepClone(trueEnding),
        };
      }

      state.sharedWorld.endingId = wrongEnding.id;
      pushLog({
        speaker: 'BAD ENDING // ' + wrongEnding.title_kr,
        kind: 'bad_ending',
        text: '【오답: "' + String(rawInput || '') + '"】 ' + wrongEnding.summary,
      });
      return {
        ok: true,
        correct: false,
        normalizedInput: normalized,
        endingId: wrongEnding.id,
        ending: deepClone(wrongEnding),
      };
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
          // Check if explicitly blocked by a barrier right now
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
        gameId: data.gameId || 'eve-burst-error',
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

      // Verify scene IDs exist in verified data
      if (!idx.scenesById[s.protagonists.kojiro.currentSceneId] || !idx.scenesById[s.protagonists.marina.currentSceneId]) {
        return { ok: false, reason: 'UNKNOWN_SCENE_ID' };
      }

      state = deepClone(s);
      // Restore monotonic log counter
      var maxId = 1;
      for (var i = 0; i < state.narrativeLog.length; i++) {
        if (state.narrativeLog[i].id > maxId) maxId = state.narrativeLog[i].id;
      }
      nextLogId = maxId + 1;

      // Re-validate barrier states deterministically against unlockedFlags
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
      getAsymmetryMatrix: getAsymmetryMatrix,
      getTimelineGraph: getTimelineGraph,
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
    SCENE_SPECS: SCENE_SPECS,
  };
});
