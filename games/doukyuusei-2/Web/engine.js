/**
 * Doukyuusei 2 (동급생 2) Pure Deterministic Headless Simulation Engine (Phase 2)
 * 100% data-driven by ReverseDesign/verified_data/*.json (via Web/data/game-data.js)
 * Zero DOM / network / Date.now() / Math.random() dependency for gameplay determinism.
 *
 * Phase 2 additions:
 * - Telephone System (callHeroine / getCallableHeroines / canUsePhone / incoming phone triggers)
 * - Playable 12/29 Misa Tennis Rally Minigame (startTennisMinigame / playTennisTurn)
 * - Daily 24h NPC Timeline Helper (getDayTimelineForHeroine)
 * - Mood + Affection Meter (0..100 mood & affection with choice-level delta feedback)
 * - Quick Route Guide recommendations (getQuickRouteRecommendations)
 */
(function (root) {
  'use strict';

  const WEEKDAYS_KO = ['금', '토', '일', '월', '화', '수', '목'];
  const HOME_INTERIOR_IDS = new Set([
    'loc_home_room',
    'loc_home_living',
    'loc_home_yui_room',
    'loc_home_bath',
    'loc_home_cafe'
  ]);
  const HOME_RETURN_TRAP_LOCATIONS = new Set(['loc_home_room', 'loc_home_living']);
  const ONSEN_JAN6_GUARD_FLAGS = [
    'flg_izumi_route_complete',
    'flg_misato_onsen_bus',
    'flg_misato_route_complete',
    'flg_sachiko_ryokan_met',
    'flg_sachiko_route_complete',
    'flg_kumiko_ryokan_met',
    'flg_kumiko_tokyo_visit',
    'flg_kumiko_route_complete',
    'flg_youko_arcade_bike',
    'flg_youko_route_complete'
  ];

  const TENNIS_STANCE_SEQUENCE = [
    'net_rush',
    'baseline',
    'deep_defend',
    'baseline',
    'net_rush',
    'deep_defend',
    'net_rush',
    'baseline',
    'deep_defend'
  ];

  const TENNIS_STANCES = {
    net_rush: {
      id: 'net_rush',
      label_ko: '네트 대시',
      hint_ko: '미사가 네트 앞으로 바짝 다가온다! 머리 위를 넘기는 로브 샷이 유효하다.',
      counter: 'lob'
    },
    baseline: {
      id: 'baseline',
      label_ko: '베이스라인 강타',
      hint_ko: '미사가 뒤쪽 베이스라인에서 힘을 모으고 있다! 네트 앞 기습 드롭 샷이 유효하다.',
      counter: 'drop'
    },
    deep_defend: {
      id: 'deep_defend',
      label_ko: '깊은 수비 대기',
      hint_ko: '미사가 좌우 수비 자세로 깊숙이 물러섰다! 빈 코스를 찌르는 강스매시가 유효하다.',
      counter: 'power'
    }
  };

  const TENNIS_SHOTS = {
    power: { id: 'power', label_ko: '강스매시', icon: '💥', desc_ko: '빈 코스를 꿰뚫는 강력한 포핸드 강타' },
    lob:   { id: 'lob',   label_ko: '로브 샷', icon: '🌈', desc_ko: '네트 앞 상대를 넘기는 높은 포물선 샷' },
    drop:  { id: 'drop',  label_ko: '드롭 샷', icon: '🪶', desc_ko: '네트 바로 앞에 떨어뜨리는 기습 스핀 샷' }
  };

  // Tasteful all-ages Korean narrative scripts keyed by event ID (all 78 events)
  const EVENT_SCRIPTS = {
    evt_prologue_start: {
      narration: '2학기 종업식이 끝나고 드디어 17일간의 겨울방학이 시작되었다. 차가운 겨울 아침 햇살이 자실 창가로 스며든다.',
      lines: [
        { speaker: '류노스케', text: '12월 22일부터 1월 7일 3학기 시업식까지… 이번 겨울방학엔 분명 잊지 못할 추억을 만들고 싶어.' }
      ]
    },
    evt_onsen_pre_akira_youko: {
      narration: '체육관 뒤에서 아키라와 요코가 실랑이를 벌이고 있다. 중간에 나서서 어색해진 분위기를 부드럽게 풀어 주었다.',
      lines: [
        { speaker: '카와지리 아키라', text: '고마워, 류노스케! 네가 아니었으면 진짜 큰일 날 뻔했어.' },
        { speaker: '카와지리 아키라', text: '답례로 말인데… 혹시 12월 28일에 집에 있을 때 전화 받으면 꼭 받아 줘! 좋은 소식이 있을지도 몰라.' }
      ]
    },
    evt_onsen_phone_invite: {
      narration: '전화기가 경쾌하게 울린다. 수화기 너머로 들뜬 아키라의 목소리가 들려온다.',
      lines: [
        { speaker: '카와지리 아키라', text: '여보세요, 류노스케! 대박이야! 동지온천 1박 2일 여행권에 당첨됐어! 내일(12/29) 출발이야!' },
        { speaker: '카와지리 아키라', text: '네 파트너도 한 명 데려갈 수 있어. 어떻게 할래? 동지온천에 같이 갈 거야, 아니면 마을에 남을 거야?' }
      ]
    },
    evt_onsen_ski_memories: {
      narration: '동지온천 스키 슬로프에 새하얀 파우더 스노우가 펼쳐졌다. 아키라가 신나게 스키 폴을 흔들며 슬로프 대결을 제안한다.',
      lines: [
        { speaker: '카와지리 아키라', text: '우오오! 눈 상태 최고야! 류노스케, 아래까지 누가 먼저 내려가나 시합할래, 아니면 천천히 설경을 즐길래?' }
      ]
    },
    evt_opening_ceremony_jan7: {
      narration: '어느덧 1월 7일 3학기 시업식 아침이 밝았다. 겨울방학 17일간의 기억이 교문 앞 차가운 공기 속에 생생히 되살아난다.',
      lines: [
        { speaker: '류노스케', text: '이제 졸업까지 얼마 남지 않았어. 이번 방학에 맺은 소중한 인연이 기다리고 있을 거야.' }
      ]
    },
    evt_yui_dec22_morning: {
      narration: '겨울방학 첫날 아침, 거실에서 따뜻한 아침 식사를 정리하던 유이가 환하게 웃으며 말을 건넸다.',
      lines: [
        { speaker: '나루사와 유이', text: '좋은 아침이야, 오빠! 드디어 겨울방학이네. 오늘 뭐 할 계획이야?' }
      ]
    },
    evt_yui_eve_coat: {
      narration: '크리스마스 이브 밤, 조용한 거실 소파에서 유이가 담요도 없이 웅크린 채 잠들어 있다. 조심스레 외투를 덮어 주었다.',
      lines: [
        { speaker: '나루사와 유이', text: '으응… 오빠…? 고마워, 따뜻해…' },
        { speaker: '류노스케', text: '감기 걸리면 안 되니까. 설날엔 같이 신사에도 가자, 유이.' }
      ]
    },
    evt_yui_xmas_cake: {
      narration: '크리스마스 저녁, 거실 식탁 위에 유이가 정성껏 고른 딸기 크리스마스 케이크가 놓였다. 작은 촛불이 겨울밤을 포근하게 비춘다.',
      lines: [
        { speaker: '나루사와 유이', text: '메리 크리스마스, 오빠! 엄마랑 같이 고른 케이크야. 마음에 들었으면 좋겠다!' }
      ]
    },
    evt_yui_jan1_shrine: {
      narration: '새해 첫 아침, 화사한 기모노 차림의 유이와 함께 키사라기 신사로 첫참배를 다녀왔다. 맑은 겨울 하늘 아래 새해 소원을 빌었다.',
      lines: [
        { speaker: '나루사와 유이', text: '오빠랑 이렇게 둘이서 새해를 맞으니까 정말 기쁘다… 올해도 곁에 있어 줄 거지?' }
      ]
    },
    evt_yui_jan2_witness: {
      narration: '시라헤가이케 공원 산책로 너머에서 사이온지 아리토모와 요시키가 수상한 이야기를 나누는 모습을 우연히 목격했다. 유이를 노린 불온한 기운이 감돈다.',
      lines: [
        { speaker: '류노스케', text: '저 녀석들, 유이를 곤란하게 만들려는 건가? 내일은 더 신경 써서 유이를 지켜봐야겠어.' }
      ]
    },
    evt_yui_jan3_hotel_call: {
      narration: '1월 3일 저녁, 낯선 호출 전화가 걸려 왔다! 키사라기 스테이션 호텔 로비로 달려가자 유이가 사이온지와 불편한 대화를 나누는 모습이 보였다.',
      lines: [
        { speaker: '류노스케', text: '유이가 혼자 곤란해하고 있어. 끝까지 여기서 기다려서 유이를 데려가야 해!' }
      ]
    },
    evt_yui_jan3_park_rescue: {
      narration: '1월 3일 늦은 밤, 야소하치 공원 가로등 아래서 낯선 취객에게 붙잡혀 당황하던 유이를 재빨리 구해 냈다.',
      lines: [
        { speaker: '나루사와 유이', text: '오빠…! 진짜 와 줄 줄 알았어… 무서웠는데 이제야 안심이 돼.' }
      ]
    },
    evt_yui_jan6_climax: {
      narration: '겨울방학 마지막 밤, 유이의 방 창밖으로 잔잔한 눈발이 흩날린다. 오랜 세월 가족처럼 지내온 두 사람 사이에 새로운 약속이 피어났다.',
      lines: [
        { speaker: '나루사와 유이', text: '앞으로는 여동생이 아니라, 오빠 옆에서 같은 미래를 걸어가는 사람이 되고 싶어.' },
        { speaker: '류노스케', text: '나도 같은 마음이야, 유이. 시업식이 와도, 봄이 와도 계속 함께하자.' }
      ]
    },
    evt_misako_cafe_help: {
      narration: '1층 찻집의 향긋한 원두 향 속에서 미사코 씨가 분주히 손님 맞이를 준비하고 있다.',
      lines: [
        { speaker: '나루사와 미사코', text: '어머, 류노스케가 도와주겠다고? 방학 동안 자주 얼굴 보여 주면 정말 든든하겠는걸.' }
      ]
    },
    evt_misako_cafe_frog: {
      narration: '1층 찻집에서 낯선 단골손님(개구리 아저씨)이 미사코에게 짓궂게 말을 걸고 있었다. 재치 있게 상황을 정리하자 미사코가 안도의 미소를 지었다.',
      lines: [
        { speaker: '나루사와 미사코', text: '후후, 이제 류노스케도 제법 어른스러워졌네. 도와줘서 고마워.' }
      ]
    },
    evt_misako_eve_living: {
      narration: '크리스마스 이브 밤 11시, 모두 잠든 거실에서 미사코와 따뜻한 코코아를 나누며 오랜 추억을 이야기했다.',
      lines: [
        { speaker: '나루사와 미사코', text: '네가 우리 집에 처음 왔을 때가 엊그제 같은데… 요즘은 문득 네가 참 든든하게 느껴져.' }
      ]
    },
    evt_misako_jan1_bath: {
      narration: '설날 밤, 하루 종일 마음이 무거웠던 류노스케를 미사코가 따뜻하게 다독여 주며 곁을 지켜 주었다.',
      lines: [
        { speaker: '나루사와 미사코', text: '혼자 끙끙 앓지 마. 힘들 땐 언제든 내게 기대도 괜찮아.' }
      ]
    },
    evt_misako_jan4_talk: {
      narration: '1월 4일 저녁, 조용한 거실에서 미사코 씨와 졸업 후의 미래와 가족에 대한 진솔한 이야기를 나누었다.',
      lines: [
        { speaker: '나루사와 미사코', text: '네가 어떤 길을 선택하든 난 늘 응원할 거야. …그래도 이 집이 너무 조용해지면 조금 쓸쓸할지도 몰라.' }
      ]
    },
    evt_misako_jan6_climax: {
      narration: '1월 6일 새벽 2시, 고요한 거실의 스탠드 불빛 아래 미사코가 조용히 속마음을 건넸다.',
      lines: [
        { speaker: '나루사와 미사코', text: '보호자라는 이름 뒤에 숨겨 두었던 마음… 이제는 솔직하게 말하고 싶어, 류노스케.' },
        { speaker: '류노스케', text: '저도 오래전부터 미사코 씨를 한 사람으로서 소중하게 생각해 왔어요.' }
      ]
    },
    evt_tomomi_blackmail_intro: {
      narration: '토모미의 집 앞에서 평소답지 않게 풀이 죽은 토모미를 만났다. 사진부 요시키 때문에 곤란한 오해가 생겼다는 사실을 알게 되었다.',
      lines: [
        { speaker: '미즈노 토모미', text: '류노스케… 미안해. 지금은 말하기 어렵지만, 새해가 되면 꼭 진실을 밝히고 싶어.' }
      ]
    },
    evt_tomomi_dec27_phone: {
      narration: '12월 27일 밤, 조용한 방에 전화벨이 울렸다. 수화기 너머로 망설이는 토모미의 목소리가 들려온다.',
      lines: [
        { speaker: '미즈노 토모미', text: '여보세요, 류노스케…? 늦은 시간에 미안해. 네 목소리만 들으면 조금 용기가 날 것 같아서 걸었어.' }
      ]
    },
    evt_tomomi_jan1_kimono: {
      narration: '새해 첫날 아침, 자택 앞에서 단아한 기모노 차림으로 신년 인사를 건네러 온 토모미와 마주쳤다.',
      lines: [
        { speaker: '미즈노 토모미', text: '새해 복 많이 받아, 류노스케! 올해는 꼭 모든 오해를 풀고 활짝 웃고 싶어.' }
      ]
    },
    evt_tomomi_photo_club_resolve: {
      narration: '1월 4일 이후 사진부 부실을 조사해 요시키가 조작해 둔 필름 증거를 확보했다. 토모미를 둘러싼 오해가 말끔히 풀렸다.',
      lines: [
        { speaker: '미즈노 토모미', text: '정말로 끝까지 날 믿어 줬구나… 고마워, 류노스케. 이제야 숨이 트이는 것 같아!' }
      ]
    },
    evt_tomomi_jan5_phone: {
      narration: '오해가 말끔히 풀린 뒤 토모미에게서 밝고 경쾌한 목소리의 전화가 걸려 왔다.',
      lines: [
        { speaker: '미즈노 토모미', text: '류노스케! 정말 고마웠어. 오늘 저녁에 우리 집 앞에서 잠깐 만날 수 있을까? 꼭 전하고 싶은 말이 있어!' }
      ]
    },
    evt_tomomi_climax: {
      narration: '겨울 저녁 노을이 지는 토모미의 집 앞, 반장으로서의 짐을 잠시 내려놓은 토모미가 환하게 웃으며 손을 맞잡았다.',
      lines: [
        { speaker: '미즈노 토모미', text: '어릴 때부터 옆집에서 늘 지켜봐 줬잖아. 앞으로는 연인으로서 내 옆에 있어 줄래?' }
      ]
    },
    evt_izumi_parfait_intro: {
      narration: '자택 앞에서 마주친 이즈미와 1층 찻집에 들러 달콤한 파르페를 함께 먹었다. 보이시한 말투 너머 의외의 귀여운 면모가 엿보였다.',
      lines: [
        { speaker: '시노하라 이즈미', text: '흥, 파르페 좋아한다고 놀리면 가만 안 둔다! …그래도 너랑 먹으니까 꽤 맛있네.' }
      ]
    },
    evt_izumi_kyudo_practice: {
      narration: '겨울 찬바람이 감도는 궁도장. 시노하라 이즈미가 흐트러짐 없는 자세로 시위를 당기자 화살이 과녁 한가운데 꽂혔다.',
      lines: [
        { speaker: '시노하라 이즈미', text: '어, 왔냐! 멍하니 구경만 하지 말고 어땠는지 감상이라도 말해 봐!' }
      ]
    },
    evt_izumi_xmas_phone: {
      narration: '크리스마스 늦은 밤, 평소 전화 잘 안 하던 이즈미에게서 의외의 안부 전화가 걸려 왔다.',
      lines: [
        { speaker: '시노하라 이즈미', text: '여보세요? 별, 별일 있어서 건 건 아니고! 12월 28일 영화 약속 까먹었을까 봐 확인한 것뿐이야!' }
      ]
    },
    evt_izumi_pre_onsen_date: {
      narration: '12월 28일, 스튜디오 ATARU에서 이즈미와 영화를 보고 거리를 걸었다. 어느새 두 사람 사이의 거리가 한층 가까워졌다.',
      lines: [
        { speaker: '시노하라 이즈미', text: '오늘 꽤 즐거웠어. 만약 내일 어디 놀러 갈 일 생기면… 제일 먼저 날 불러 줘!' }
      ]
    },
    evt_izumi_onsen_climax: {
      narration: '동지온천 나가시마 료칸의 밤, 눈 덮인 산자락을 바라보며 이즈미와 진솔한 마음을 나누었다.',
      lines: [
        { speaker: '시노하라 이즈미', text: '같이 온천까지 와 줘서 정말 기뻤어. 솔직하게 말할게… 나, 네가 좋아.' }
      ]
    },
    evt_karen_house_intro: {
      narration: '인기 아이돌 카렌의 집을 찾아갔다. 현관문을 연 카렌이 약간 경계 섞인 눈빛으로 찾아온 이유를 묻는다.',
      lines: [
        { speaker: '마이지마 카렌', text: '어라, 같은 반 류노스케? …우리 집엔 무슨 일로 온 거야?' }
      ]
    },
    evt_karen_uniform_cover: {
      narration: '12월 26일 오후, 텅 빈 3학년 B반 교실에서 고된 스케줄에 지쳐 잠든 카렌에게 조용히 교복 상의를 덮어 주었다.',
      lines: [
        { speaker: '마이지마 카렌', text: '어라, 류노스케…? 네 재킷 냄새가 나네. 덕분에 오랜만에 푹 잤어. 내일 방송국 공개 녹화 초대권 줄게!' }
      ]
    },
    evt_karen_tv_recording: {
      narration: '12월 27일 방송국 스튜디오. 무대 위에서 반짝이는 카렌이 객석의 류노스케를 발견하고 살짝 윙크하며 미소 지었다.',
      lines: [
        { speaker: '마이지마 카렌', text: '진짜 와 줬구나! 객석에 네가 있으니까 오늘따라 긴장이 하나도 안 됐어.' }
      ]
    },
    evt_karen_negative_seize: {
      narration: '자택 앞에서 요시키가 카렌의 도촬 사진을 거래하려 했지만 단호히 거절하고 네거티브 필름을 회수해 카렌을 지켜 냈다.',
      lines: [
        { speaker: '류노스케', text: '친구 사진으로 장난치지 마, 요시키. 이 필름은 내가 가져간다.' }
      ]
    },
    evt_karen_coast_shoot: {
      narration: '12월 29일 오후 야소하치 해안. 겨울 바닷바람 속 촬영에 지친 카렌에게 따뜻한 캔커피를 건네며 잠깐의 휴식을 선물했다.',
      lines: [
        { speaker: '마이지마 카렌', text: '후우, 살았다… 내일모레 하와이 로케 갔다가 1월 4일에 돌아오면 꼭 다시 만나 줘.' }
      ]
    },
    evt_karen_hawaii_souvenir: {
      narration: '연말연시 하와이 촬영을 마치고 1월 4일 귀국한 카렌이 자택 앞에서 예쁜 열쇠고리 기념품을 건네 주었다.',
      lines: [
        { speaker: '마이지마 카렌', text: '다녀왔어, 류노스케! 하와이 바다가 아무리 예뻐도 네 생각이 자꾸 나더라.' }
      ]
    },
    evt_karen_climax: {
      narration: '연말연시 방송 일정을 마친 카렌이 자택 앞 겨울 밤하늘 아래서 환한 미소로 마음을 고백했다.',
      lines: [
        { speaker: '마이지마 카렌', text: '무대 위 조명보다 네가 건네준 교복이 훨씬 따뜻했어. 평범한 나로서, 네 곁에 있고 싶어.' }
      ]
    },
    evt_sakurako_window_intro: {
      narration: '시민병원 정원 나무 위로 올라가 창가의 소녀 사쿠라코와 첫인사를 나누었다. 창문 너머로 수줍은 웃음이 번졌다.',
      lines: [
        { speaker: '스기모토 사쿠라코', text: '어머, 진짜 나무를 타고 올라오다니! 후후, 또 놀러 와 줄 거지?' }
      ]
    },
    evt_sakurako_eve_answer: {
      narration: '크리스마스 이브 오후, 병실 창가에서 사쿠라코가 조심스레 여자친구가 있는지 물었다.',
      lines: [
        { speaker: '스기모토 사쿠라코', text: '저기… 류노스케는 지금 사귀는 여자친구 있어?' }
      ]
    },
    evt_sakurako_hospital_visit_mid: {
      narration: '겨울 햇살이 비치는 병실 창가에서 사쿠라코와 따뜻한 이야기를 나누며 봄이 오면 함께 벚꽃을 보기로 약속했다.',
      lines: [
        { speaker: '스기모토 사쿠라코', text: '네가 매일 와 주니까 병실도 더 이상 외롭지 않아. 섣달그믐 밤 10시 약속 잊지 마!' }
      ]
    },
    evt_sakurako_nye_date: {
      narration: '12월 31일 밤 10시, 사쿠라코와 함께 겨울밤 거리를 산책하며 제야의 종소리를 기다렸다.',
      lines: [
        { speaker: '스기모토 사쿠라코', text: '올해 마지막 밤을 너와 함께 보낼 수 있어서 정말 행복해… 잊지 않을게.' }
      ]
    },
    evt_sakurako_jan1_misunderstanding: {
      narration: '1월 1일 오후 시민병원을 찾았지만 사쿠라코의 병실이 비어 있었다. 큰 오해로 가슴이 철렁 내려앉았지만, 곧 퇴원 준비 소식의 실마리를 남긴 채 무겁게 발걸음을 돌렸다.',
      lines: [
        { speaker: '류노스케', text: '설마… 아니야, 분명 어딘가에서 다시 만날 수 있을 거야.' }
      ]
    },
    evt_sakurako_jan6_climax: {
      narration: '1월 6일 오후 야소하치역에서 건강한 모습으로 돌아온 사쿠라코와 극적으로 재회했다! 두 사람은 겨울 바다가 펼쳐진 야소하치 해안으로 달려갔다.',
      lines: [
        { speaker: '스기모토 사쿠라코', text: '놀라게 해서 미안해! 수술이 잘 끝나서 퇴원했어. 이제는 병실 창문이 아니라, 네 옆에서 바다를 볼 수 있어!' }
      ]
    },
    evt_kozue_library_bump: {
      narration: '도서실 책장 모퉁이에서 1학년 후배 코즈에와 부딪혀 책을 함께 주웠다. 답례로 12월 25일 테니스 코트에서 만나기로 약속했다.',
      lines: [
        { speaker: '츠즈키 코즈에', text: '선배 죄송해요! 대신 크리스마스 오전 10시에 테니스 코트로 꼭 와 주세요!' }
      ]
    },
    evt_kozue_xmas_date: {
      narration: '12월 25일, 코즈에와 테니스를 치고 즐거운 크리스마스 데이트를 보냈다. 이후 키사라기 마을에서도 만나기로 약속했다.',
      lines: [
        { speaker: '츠즈키 코즈에', text: '선배랑 보내는 크리스마스가 제일 즐거워요! 12월 27일엔 스튜디오 ATARU에서 영화도 같이 봐요!' }
      ]
    },
    evt_kozue_dec27_date: {
      narration: '12월 27일 오후 스튜디오 ATARU. 두근거리는 표정으로 영화 포스터를 바라보는 코즈에와 즐거운 연말 데이트를 보냈다.',
      lines: [
        { speaker: '츠즈키 코즈에', text: '선배랑 같이 보는 영화라면 뭐든 좋아요! 어떤 작품 볼까요?' }
      ]
    },
    evt_kozue_climax: {
      narration: '키사라기 마을 언덕 전망대에서 야경이 반짝이는 도시를 바라보며 코즈에가 용기 내어 마음을 전했다.',
      lines: [
        { speaker: '츠즈키 코즈에', text: '선배, 졸업하셔도 저 잊으시면 안 돼요! 저… 선배를 정말 많이 좋아해요!' }
      ]
    },
    evt_mirei_staffroom_intro: {
      narration: '조용한 교무실에서 담임 카타기리 미레이 선생님의 채점을 도우며 따뜻한 차를 나누었다.',
      lines: [
        { speaker: '카타기리 미레이', text: '방학인데도 도와줘서 고마워, 류노스케. 섣달그믐엔 조금 복잡한 일이 있을 것 같아…' }
      ]
    },
    evt_mirei_dec29_hotel_sight: {
      narration: '12월 29일 오전 스테이션 호텔 로비. 미레이 선생님이 어두운 표정으로 누군가와 말다툼을 벌이는 장면을 우연히 목격했다.',
      lines: [
        { speaker: '류노스케', text: '선생님 표정이 많이 안 좋으셨는데… 12월 31일엔 꼭 신경 써 드려야겠어.' }
      ]
    },
    evt_mirei_nye_hotel: {
      narration: '12월 31일, 사이온지의 정보를 듣고 달려간 스테이션 호텔 로비에서 외롭게 앉아 있던 미레이 선생님을 발견했다.',
      lines: [
        { speaker: '카타기리 미레이', text: '네가 여기까지 와 줄 줄은 몰랐어… 조금 지쳐 있었는데, 네 얼굴을 보니 마음이 놓이네.' }
      ]
    },
    evt_mirei_climax: {
      narration: '새해의 잔잔한 오후, 스테이션 호텔 라운지에서 마주 앉은 미레이 선생님이 담임과 제자를 넘어선 진심을 전했다.',
      lines: [
        { speaker: '카타기리 미레이', text: '졸업하면, 그땐 선생님이 아니라 한 사람으로서 네 손을 잡고 걸어도 될까?' }
      ]
    },
    evt_minori_vase_broken: {
      narration: '이른 아침 3-B 교실에서 깨진 화병을 대신해 새 꽃을 꽂아 두는 미노리의 다정한 모습을 우연히 목격했다.',
      lines: [
        { speaker: '카토 미노리', text: '앗, 들켜 버렸네요… 교실이 조금이라도 따뜻해 보였으면 해서요.' }
      ]
    },
    evt_minori_dec29_rescue: {
      narration: '12월 29일, 교정에서의 소동 뒤 시라헤가이케 공원에서 요시키에게 곤란을 겪던 미노리를 구해 내고 그녀의 진짜 모습을 마주했다.',
      lines: [
        { speaker: '카토 미노리', text: '류노스케 군이 구해 줘서… 이제 숨지 않아도 괜찮다는 용기가 생겼어요.' }
      ]
    },
    evt_minori_jan1_sevenmart: {
      narration: '새해 연휴, 편의점 세븐마트에서 아르바이트 중인 "스즈키 히로코"가 이전과 달리 한결 부드러운 미소로 말을 건넸다.',
      lines: [
        { speaker: '카토 미노리', text: '새해 복 많이 받으세요, 류노스케 군. 혹시 1월 5일 키사라기역 약속… 잊지 않으셨죠?' }
      ]
    },
    evt_minori_jan4_movie_trap: {
      narration: '1월 4일 자택 앞에서 만난 "스즈키 히로코"가 일부러 시험하듯 내일 같이 영화를 보러 가자고 권유한다!',
      lines: [
        { speaker: '카토 미노리', text: '저기, 류노스케 군… 내일 혹시 시간 있으면 나랑 영화 보러 가지 않을래요?' }
      ]
    },
    evt_minori_jan5_climax: {
      narration: '1월 5일 키사라기역에서 안경을 벗고 환하게 웃는 미노리와 데이트를 즐기며 서로의 진심을 확인했다.',
      lines: [
        { speaker: '카토 미노리', text: '가면 뒤에 있던 저까지 알아봐 준 건 류노스케 군이 처음이에요. 고마워요.' }
      ]
    },
    evt_youko_arcade_intro: {
      narration: '키사라기 게임센터에서 호쾌하게 게임을 즐기는 요코와 합류해 바이크와 마을 이야기를 나누며 의기투합했다.',
      lines: [
        { speaker: '미나미카와 요코', text: '오, 꽤 하는데? 너 생각보다 재밌는 녀석이구나! 나중에 우리 모터스에도 들러.' }
      ]
    },
    evt_youko_dec27_akira_ask: {
      narration: '아키라의 집에서 마주친 아키라가 요즘 요코가 왜 기분이 안 좋은지 아느냐며 다급히 물어온다.',
      lines: [
        { speaker: '카와지리 아키라', text: '야 류노스케, 너 요코가 요즘 왜 화나 있는지 알지? 제발 나한테만 알려 줘!' }
      ]
    },
    evt_youko_jan1_sunrise: {
      narration: '1월 1일 이른 새벽, 요코의 바이크 뒷자리에 올라타 야소하치 해안에서 붉게 떠오르는 새해 첫 해돋이를 바라보았다.',
      lines: [
        { speaker: '미나미카와 요코', text: '크으, 역시 새해 첫바람은 바이크로 맞아야 제맛이지! 올해도 잘 부탁한다, 류노스케!' }
      ]
    },
    evt_youko_climax: {
      narration: '미나미카와 모터스 차고 앞, 바이크에 기댄 요코가 특유의 당당한 눈빛으로 마음을 고백했다.',
      lines: [
        { speaker: '미나미카와 요코', text: '야, 다른 녀석들 눈치 볼 거 없어. 시업식 날 내 옆자리는 어쩔 거야? 확실하게 대답해!' }
      ]
    },
    evt_azumi_nursery_intro: {
      narration: '성 하나조노 보육원에서 아이들과 어울리며 아즈미 선생님의 일손을 도왔다. 아이들의 웃음소리가 겨울 공기를 녹였다.',
      lines: [
        { speaker: '야스다 아즈미', text: '류노스케 군은 아이들이 참 잘 따르네요! 또 놀러 와 주실 거죠?' }
      ]
    },
    evt_azumi_dec28_consult: {
      narration: '12월 28일 자택 앞, 아즈미 선생님이 텐도 선생님의 지나친 구애 때문에 곤란하다며 조심스레 고민을 털어놓았다.',
      lines: [
        { speaker: '야스다 아즈미', text: '류노스케 군, 내일 보육원에 텐도 선생님이 또 오신대요… 옆에 있어 주시면 큰 힘이 될 것 같아요.' }
      ]
    },
    evt_azumi_tendo_duel: {
      narration: '보육원 앞에 텐도 신칸센 선생님이 나타나 아즈미 선생님에게 열렬히 구애하고 있다! 어떻게 대응할까?',
      lines: [
        { speaker: '텐도 신칸센', text: '크하하! 사랑은 정면 승부다! 류노스케, 네 각오를 보여 봐라!' },
        { speaker: '야스다 아즈미', text: '어, 어떡하죠… 류노스케 군?' }
      ]
    },
    evt_azumi_climax: {
      narration: '새해 보육원 마당에서 아이들이 만든 눈사람 옆에 나란히 서서 아즈미 선생님과 미래를 약속했다.',
      lines: [
        { speaker: '야스다 아즈미', text: '류노스케 군이 곁에 있으면 매일이 봄날 같아요. 앞으로도 함께 걸어가요.' }
      ]
    },
    evt_misato_travel_intro: {
      narration: '야소하치역 옆 뉴바이 흥업 여행사에서 밝은 미소로 일하는 버스 가이드 미사토 씨와 친해졌다.',
      lines: [
        { speaker: '노노무라 미사토', text: '어머, 동지온천에 관심이 있구나? 연말에 혹시 여행 가게 되면 내가 안내할지도 몰라!' }
      ]
    },
    evt_misato_onsen_bus: {
      narration: '동지온천행 투어 버스의 가이드로 재회한 미사토 씨! 나가시마 료칸에서 눈 내리는 풍경을 함께 감상했다.',
      lines: [
        { speaker: '노노무라 미사토', text: '정말로 동지온천에서 다시 만났네! 이 인연, 마을에 돌아가서도 이어 가고 싶어.' }
      ]
    },
    evt_misato_climax: {
      narration: '여행사 업무를 마친 미사토 씨와 겨울 저녁 거리를 걸으며 다음 여행은 두 사람만의 추억으로 만들기로 약속했다.',
      lines: [
        { speaker: '노노무라 미사토', text: '다음 여행은 가이드가 아니라, 네 파트너로 함께 떠나고 싶어, 류노스케.' }
      ]
    },
    evt_sachiko_ryokan_met: {
      narration: '동지온천 나가시마 료칸의 단아한 여주인 사치코 씨가 따뜻한 말차와 함께 정성껏 환대해 주었다.',
      lines: [
        { speaker: '나가시마 사치코', text: '멀리서 와 주셔서 감사해요. 눈 오는 밤엔 료칸 마루가 참 고요하답니다.' }
      ]
    },
    evt_sachiko_jan3_phone: {
      narration: '1월 3일 저녁, 전화벨 소리에 수화기를 들자 동지온천 나가시마 사치코 여주인의 우아한 목소리가 들려왔다.',
      lines: [
        { speaker: '나가시마 사치코', text: '여보세요, 류노스케 씨? 쿠미코 일로 키사라기 스테이션 호텔에 잠시 올라와 있어요. 시간 되실 때 뵐 수 있을까요?' }
      ]
    },
    evt_sachiko_climax: {
      narration: '새해 볼일로 키사라기에 들른 사치코 씨와 스테이션 호텔에서 재회해 깊은 신뢰와 마음을 확인했다.',
      lines: [
        { speaker: '나가시마 사치코', text: '당신 덕분에 오래 잊고 지냈던 설렘을 되찾았어요. 다시 동지온천에도 와 주실 거죠?' }
      ]
    },
    evt_kumiko_ryokan_met: {
      narration: '동지온천 노천온천 인근 회랑에서 료칸의 외동딸 쿠미코와 만나 눈싸움을 하며 금세 친해졌다.',
      lines: [
        { speaker: '나가시마 쿠미코', text: '와, 도회지 오빠다! 새해 되면 나도 꼭 야소하치 마을에 놀러 갈게!' }
      ]
    },
    evt_kumiko_jan1_arrival: {
      narration: '1월 1일 저녁, 큰 보스턴백을 들고 자택 앞에 불쑥 찾아온 쿠미코를 발견했다! 미사코 씨를 설득해 따뜻하게 맞이했다.',
      lines: [
        { speaker: '나가시마 쿠미코', text: '짜잔! 진짜로 야소하치 마을에 놀러 왔어, 오빠! 내일 역에서부터 마을 구경 시켜 줘!' }
      ]
    },
    evt_kumiko_tokyo_visit: {
      narration: '약속대로 신년에 상경한 쿠미코를 야소하치역에서 반갑게 맞이해 마을 구경을 시켜 주었다.',
      lines: [
        { speaker: '나가시마 쿠미코', text: '진짜 마중 나와 줬네! 오늘은 키사라기 마을까지 실컷 구경시켜 줘!' }
      ]
    },
    evt_kumiko_climax: {
      narration: '키사라기역 플랫폼, 돌아가는 열차를 앞두고 쿠미코가 수줍게 머플러를 고쳐 매며 진심을 전했다.',
      lines: [
        { speaker: '나가시마 쿠미코', text: '오빠랑 보낸 겨울방학이 제일 소중해. 봄이 오면 꼭 다시 만나러 올게!' }
      ]
    },
    evt_misa_station_bump: {
      narration: '야소하치역 개찰구 앞에서 활기찬 체육대생 타나카 미사와 두 번이나 부딪혔다! 유쾌한 설전 끝에 12월 29일 오전 9시 테니스 승부를 약속했다.',
      lines: [
        { speaker: '타나카 미사', text: '하하, 꽤 배짱 있네! 좋아, 12월 29일 아침 9시 학원 테니스 코트에서 한 판 붙자!' }
      ]
    },
    evt_misa_tennis_match: {
      narration: '12월 29일 오전 9시, 학원 테니스 코트! 라켓을 힘차게 휘두르며 몸을 푼 타나카 미사가 도전적인 미소로 공을 튕긴다. (5포인트 선승 랠리 승부 — 승패 무관하게 1층 찻집과 12/30 데이트로 진행!)',
      lines: [
        { speaker: '타나카 미사', text: '와, 생각보다 엄청 잘 치잖아! 내일 12시 45분 키사라기역, 늦으면 반칙이야!' }
      ],
      winLines: [
        { speaker: '타나카 미사', text: '헉, 내가 체육대생인데 완패하다니?! 대단한데, 류노스케! 졌으니까 1층 찻집 커피는 내가 쏠게. 내일 12시 45분 키사라기역 데이트, 꼭 나와!' }
      ],
      lossLines: [
        { speaker: '타나카 미사', text: '하하, 역시 아직 내 실력을 따라오려면 멀었지! 그래도 끝까지 포기 안 한 건 멋졌어. 자, 1층 찻집에서 한 잔 하면서 내일 12시 45분 키사라기역 데이트 계획 세우자!' }
      ]
    },
    evt_misa_kisaragi_date: {
      narration: '12월 30일 12시 45분, 약속 시각에 맞춰 키사라기역에서 만난 미사와 스튜디오 ATARU와 번화가를 누비며 최고의 데이트를 즐겼다.',
      lines: [
        { speaker: '타나카 미사', text: '시간 딱 맞춰 왔구나! 오늘 하루 정말 최고였어, 류노스케!' }
      ]
    },
    evt_misa_climax: {
      narration: '새해의 스테이션 호텔 라운지에서 미사가 환한 웃음과 함께 겨울방학 너머의 약속을 건넸다.',
      lines: [
        { speaker: '타나카 미사', text: '방학이 끝나도 연락 끊기 없기! 대학 캠퍼스에도 꼭 놀러 와, 내 파트너!' }
      ]
    }
  };

  const ENDING_EPILOGUES = {
    end_youko_main: {
      mood: 'bold',
      epilogue: '1월 7일 3학기 시업식 아침. 교문 앞에서 바이크 엔진을 울리며 기다리던 미나미카와 요코가 환하게 웃는다. 다른 모든 인연을 제치고 당당히 옆자리를 차지한 요코와 함께, 찬 겨울바람을 가르며 새로운 계절로 달려 나갔다.'
    },
    end_youko_alt: {
      mood: 'warm',
      epilogue: '1월 7일 시업식 이후, 바이크 정비소 한편에서 요코와 나란히 미래의 꿈을 나누며 유쾌한 겨울의 후일담을 써 내려갔다.'
    },
    end_yui: {
      mood: 'romantic',
      epilogue: '1월 7일 3학기 시업식. 등굣길 하얀 입김 속에서 나루사와 유이가 조심스레 손을 잡아 왔다. 10년간 가족처럼 지내온 시간이 따뜻한 사랑으로 피어나, 두 사람은 같은 미래를 향해 발걸음을 맞추었다.'
    },
    end_misako: {
      mood: 'warm',
      epilogue: '1월 7일, 1층 찻집의 은은한 커피 향과 함께 새로운 하루가 열렸다. 나루사와 미사코는 다정한 미소로 등교하는 류노스케를 배웅하며, 방과 후 다시 이어질 두 사람만의 이야기를 약속했다.'
    },
    end_sakurako: {
      mood: 'poetic',
      epilogue: '1월 7일 맑은 겨울 아침, 건강을 되찾은 스기모토 사쿠라코가 교문 앞 벚나무 아래에서 환하게 손을 흔든다. 봄이 오면 만개할 벚꽃을 함께 보자는 약속이 마침내 현실이 되었다.'
    },
    end_tomomi: {
      mood: 'warm',
      epilogue: '1월 7일 3학기 시업식. 모든 오해를 딛고 밝은 미소를 되찾은 반장 미즈노 토모미와 나란히 3학년 B반 교실로 들어섰다. 소꿉친구의 다정함이 든든한 사랑으로 이어졌다.'
    },
    end_izumi: {
      mood: 'bright',
      epilogue: '1월 7일, 동지온천의 설경을 함께 추억하며 시노하라 이즈미가 쑥스러운 듯 미소 짓는다. 궁도부의 늠름한 모습 뒤에 숨겨 둔 솔직한 마음을 이제는 언제든 마주할 수 있다.'
    },
    end_karen: {
      mood: 'sparkle',
      epilogue: '1월 7일, 화려한 무대 뒤 평범한 여고생으로 돌아온 마이지마 카렌이 조용히 옆자리에 앉았다. 수많은 팬들의 환호 속에서도 변치 않을 단 하나의 진심을 서로 지켜 나가기로 했다.'
    },
    end_kozue: {
      mood: 'bright',
      epilogue: '1월 7일, 테니스 라켓을 든 츠즈키 코즈에가 반짝이는 눈빛으로 달려온다. 언덕 전망대에서 나눈 약속처럼, 졸업 이후에도 이어질 풋풋한 계절이 시작되었다.'
    },
    end_mirei: {
      mood: 'warm',
      epilogue: '1월 7일 시업식, 교단에 선 카타기리 미레이 선생님이 잠시 눈을 맞추며 부드럽게 미소 짓는다. 섣달그믐의 위로가 남긴 깊은 신뢰는 졸업 후 새로운 인연으로 이어질 것이다.'
    },
    end_minori: {
      mood: 'poetic',
      epilogue: '1월 7일 3-B 교실 창가에 새 꽃이 놓여 있다. 두꺼운 안경 너머의 수줍음을 벗어 던진 카토 미노리가 환하게 미소 지으며 아침 인사를 건넸다.'
    },
    end_azumi: {
      mood: 'warm',
      epilogue: '1월 7일 방과 후, 성 하나조노 보육원의 밝은 웃음소리 속에서 야스다 아즈미 선생님이 반갑게 맞이해 준다. 겨울방학의 다정한 시간이 따뜻한 일상으로 이어졌다.'
    },
    end_misato: {
      mood: 'bright',
      epilogue: '1월 7일, 뉴바이 흥업 여행사 앞을 지나자 노노무라 미사토 씨가 밝게 손을 흔든다. 동지온천에서 시작된 우연한 동행이 다음 여행을 기약하는 특별한 인연이 되었다.'
    },
    end_sachiko: {
      mood: 'poetic',
      epilogue: '1월 7일, 동지온천 나가시마 료칸에서 도착한 정갈한 연하장이 손에 들려 있다. 나가시마 사치코 여주인과의 고요하고 깊은 약속을 품은 채 새 학기를 맞이했다.'
    },
    end_kumiko: {
      mood: 'bright',
      epilogue: '1월 7일, 동지온천의 맑은 눈송이처럼 순수했던 나가시마 쿠미코와의 추억이 가슴을 채운다. 다음 방학에 다시 만나자는 약속을 손꼽아 기다린다.'
    },
    end_misa: {
      mood: 'sparkle',
      epilogue: '1월 7일, 활기찬 타나카 미사에게서 도착한 엽서에는 테니스 라켓 그림과 함께 "다음 승부도 기대해!"라는 힘찬 메시지가 적혀 있었다.'
    },
    end_azumi_rival_fail: {
      mood: 'melancholy',
      epilogue: '1월 7일 3학기 시업식. 보육원에서의 결정적 순간에 물러서면서 아즈미 선생님과의 인연은 텐도 신칸센 선생님에게 넘어가 버렸다. 아쉬움을 남긴 채 새 학기가 시작된다.'
    },
    end_onsen_jan6_home_fail: {
      mood: 'melancholy',
      epilogue: '1월 6일 자택 귀가 제약을 어기는 바람에 동지온천에서 이어온 소중한 약속의 실이 엇갈리고 말았다. 1월 7일 시업식의 종소리가 유난히 차갑게 울린다.'
    },
    end_solo_normal: {
      mood: 'neutral',
      epilogue: '1월 7일 3학기 시업식. 17일간의 겨울방학이 눈 깜짝할 사이에 지나갔다. 누군가와 특별한 약속을 맺지는 못했지만, 야소하치 마을에서 보낸 시간표를 되짚으며 다음 회차를 기약해 본다.'
    }
  };

  function formatMinutes(minuteOfDay) {
    const clamped = Math.max(0, Math.min(1440, Math.floor(minuteOfDay)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatDateLabel(dayMeta, dayIndex) {
    if (!dayMeta) return `Day ${dayIndex + 1}`;
    const weekday = WEEKDAYS_KO[dayIndex % 7];
    const base = dayMeta.label_ko.split(' (')[0];
    return `${base} (${weekday})`;
  }

  function cloneSimple(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  class Doukyuusei2Engine {
    constructor(data, options = {}) {
      this.data = data || (typeof globalThis !== 'undefined' ? globalThis.DOUKYUUSEI2_DATA : null);
      if (!this.data) {
        throw new Error('Doukyuusei2Engine requires game data bundle (DOUKYUUSEI2_DATA).');
      }

      this.charMap = new Map(this.data.characters.map((c) => [c.id, c]));
      this.zoneMap = new Map(this.data.zones.map((z) => [z.id, z]));
      this.locMap = new Map(this.data.locations.map((l) => [l.id, l]));
      this.eventMap = new Map(this.data.events.map((e) => [e.id, e]));
      this.flagMap = new Map(this.data.flags.map((f) => [f.id, f]));
      this.endingMap = new Map(this.data.endings.map((e) => [e.id, e]));
      this.callableLocMap = new Map((this.data.callable_locations || []).map((c) => [c.location_id, c]));
      this.phoneDirMap = new Map((this.data.phone_directory || []).map((d) => [d.character_id, d]));
      this.dailyHintMap = new Map((this.data.daily_rumor_hints || []).map((h) => [h.day_index, h]));
      this.heroines = this.data.characters.filter((c) => c.romanceable === true);

      this.state = this.createInitialState(options);
    }

    createInitialState(options = {}) {
      const moodRules = this.data.mood_affection_rules || {};
      const baseMood = Number.isFinite(moodRules.base_mood) ? moodRules.base_mood : 50;
      const baseAff = Number.isFinite(moodRules.base_affection) ? moodRules.base_affection : 0;

      const affection = {};
      const mood = {};
      for (const h of this.heroines) {
        affection[h.id] = baseAff;
        mood[h.id] = baseMood;
      }

      const startLoc = 'loc_home_room';
      const startLocDef = this.locMap.get(startLoc);
      const startMinute = this.data.clock_spec ? this.data.clock_spec.default_wake_minute : 480;

      return {
        schema_version: '2.0.0',
        dayIndex: 0,
        minuteOfDay: startMinute,
        zoneId: startLocDef ? startLocDef.zone_id : 'yasohachi_town',
        locationId: startLoc,
        flags: {
          flg_prologue_done: true
        },
        completedEvents: ['evt_prologue_start'],
        affection,
        mood,
        talkedToday: [],
        calledToday: [],
        discoveredSchedules: ['chr_yui', 'chr_misako'],
        visitedLocations: {
          [startLoc]: 1
        },
        leftHomeOnJan6: false,
        activeTennisMatch: null,
        tennisLastResult: null,
        lastImpact: null,
        mode: options.mode === 'classic' ? 'classic' : 'easy_remake',
        ended: false,
        endingId: null,
        historyLog: [
          {
            dayIndex: 0,
            date: this.data.days[0].date,
            minute: startMinute,
            type: 'story',
            text: '12월 22일 08:00 — 2학기 종업식을 마치고 17일간의 겨울방학 자유행동이 시작되었습니다.'
          }
        ]
      };
    }

    reset(options = {}) {
      const keepMode = options.mode || this.state.mode;
      this.state = this.createInitialState({ mode: keepMode });
      return this.getSnapshot();
    }

    setMode(mode) {
      if (mode !== 'classic' && mode !== 'easy_remake') {
        throw new Error(`Invalid mode: ${mode}`);
      }
      this.state.mode = mode;
      return this.state.mode;
    }

    getDayNumber(dayIndex = this.state.dayIndex) {
      return dayIndex + 1;
    }

    getCurrentDayMeta(dayIndex = this.state.dayIndex) {
      return this.data.days[dayIndex] || this.data.days[this.data.days.length - 1];
    }

    getDailyRumorHint(dayIndex = this.state.dayIndex) {
      return this.dailyHintMap.get(dayIndex + 1) || null;
    }

    getTimeSlotMeta(minuteOfDay = this.state.minuteOfDay) {
      const m = Math.min(1439, Math.max(0, minuteOfDay));
      for (const slot of this.data.time_slots || []) {
        if (m >= slot.start_minute && m < slot.end_minute) return slot;
      }
      return { id: 'night', label_ko: '밤', start_minute: 1200, end_minute: 1440 };
    }

    getMoodMeta(moodValue) {
      const val = Number.isFinite(moodValue) ? moodValue : 50;
      const tiers =
        (this.data.mood_affection_rules && this.data.mood_affection_rules.mood_tiers) || [
          { id: 'ecstatic', min: 80, label_ko: '최상', icon: '✨' },
          { id: 'happy', min: 60, label_ko: '좋음', icon: '😊' },
          { id: 'neutral', min: 40, label_ko: '보통', icon: '🙂' },
          { id: 'gloomy', min: 20, label_ko: '흐림', icon: '😐' },
          { id: 'upset', min: 0, label_ko: '삐짐', icon: '😣' }
        ];
      for (const t of tiers) {
        if (val >= t.min) return t;
      }
      return tiers[tiers.length - 1];
    }

    _discoverSchedule(charId) {
      if (!charId) return;
      if (!this.state.discoveredSchedules.includes(charId)) {
        this.state.discoveredSchedules.push(charId);
      }
    }

    _adjustHeroineStats(charId, affectionDelta = 0, moodDelta = 0, source = '') {
      const ch = this.charMap.get(charId);
      if (!ch || !ch.romanceable) return { affectionDelta: 0, moodDelta: 0 };
      const prevAff = this.state.affection[charId] ?? 0;
      const prevMood = this.state.mood[charId] ?? 50;
      const nextAff = Math.max(0, Math.min(100, prevAff + affectionDelta));
      const nextMood = Math.max(0, Math.min(100, prevMood + moodDelta));
      this.state.affection[charId] = nextAff;
      this.state.mood[charId] = nextMood;

      const actualAff = nextAff - prevAff;
      const actualMood = nextMood - prevMood;
      if (actualAff !== 0 || actualMood !== 0) {
        this.state.lastImpact = {
          characterId: charId,
          characterName: ch.name_ko,
          affectionDelta: actualAff,
          moodDelta: actualMood,
          affection: nextAff,
          mood: nextMood,
          source
        };
      }
      return { affectionDelta: actualAff, moodDelta: actualMood };
    }

    hasFlag(flagId) {
      return Boolean(this.state.flags && this.state.flags[flagId]);
    }

    getActiveFlags() {
      return Object.keys(this.state.flags).filter((k) => this.state.flags[k]).sort();
    }

    hasCompletedEvent(eventId) {
      return this.state.completedEvents.includes(eventId);
    }

    getActiveZones(dayIndex = this.state.dayIndex) {
      const dayMeta = this.getCurrentDayMeta(dayIndex);
      if (
        dayMeta &&
        dayMeta.active_zones_if_onsen &&
        this.hasFlag('flg_onsen_trip_joined')
      ) {
        return [...dayMeta.active_zones_if_onsen];
      }
      return dayMeta ? [...dayMeta.active_zones_default] : ['yasohachi_town'];
    }

    isOnsenHomeReturnWarningActive() {
      if (this.state.dayIndex !== 15) return false;
      if (!this.hasFlag('flg_onsen_trip_joined')) return false;
      if (this.hasFlag('flg_onsen_jan6_home_broken')) return false;
      return ONSEN_JAN6_GUARD_FLAGS.some((f) => this.hasFlag(f));
    }

    _pushLog(type, text) {
      const dayMeta = this.getCurrentDayMeta();
      this.state.historyLog.unshift({
        dayIndex: this.state.dayIndex,
        date: dayMeta ? dayMeta.date : '??-??',
        minute: this.state.minuteOfDay,
        type,
        text
      });
      if (this.state.historyLog.length > 250) {
        this.state.historyLog.length = 250;
      }
    }

    checkMutualExclusion(candidateFlags) {
      const toSet = new Set(candidateFlags || []);
      for (const mx of this.data.mutually_exclusive_groups) {
        const overlappingInCandidate = mx.exclusive_flags.filter((f) => toSet.has(f));
        if (overlappingInCandidate.length > 1) {
          return {
            blocked: true,
            group: mx,
            conflictingFlags: overlappingInCandidate
          };
        }
        if (overlappingInCandidate.length === 1) {
          const chosen = overlappingInCandidate[0];
          const existing = mx.exclusive_flags.find((f) => f !== chosen && this.hasFlag(f));
          if (existing) {
            return {
              blocked: true,
              group: mx,
              conflictingFlag: existing,
              attemptedFlag: chosen
            };
          }
        }
      }
      return { blocked: false, group: null };
    }

    /**
     * Dijkstra shortest path across active zones using locations.json edges.
     */
    computeShortestTravel(fromId, toId) {
      const startId = fromId || this.state.locationId;
      const startLoc = this.locMap.get(startId);
      const targetLoc = this.locMap.get(toId);
      if (!startLoc || !targetLoc) {
        return {
          reachable: false,
          reason: 'UNKNOWN_LOCATION',
          message: '존재하지 않는 장소입니다.',
          travelMinutes: Infinity,
          path: [],
          modes: [],
          arrivalMinute: this.state.minuteOfDay,
          openOk: false
        };
      }

      const activeZones = new Set(this.getActiveZones());
      if (!activeZones.has(targetLoc.zone_id)) {
        const zone = this.zoneMap.get(targetLoc.zone_id);
        return {
          reachable: false,
          reason: 'ZONE_LOCKED',
          message: `${zone ? zone.name_ko : targetLoc.zone_id} 지역은 현재 일정에서 이동할 수 없습니다.`,
          travelMinutes: Infinity,
          path: [],
          modes: [],
          arrivalMinute: this.state.minuteOfDay,
          openOk: false
        };
      }

      if (startId === toId) {
        return {
          reachable: true,
          reason: 'SAME_LOCATION',
          travelMinutes: 0,
          path: [startId],
          modes: [],
          arrivalMinute: this.state.minuteOfDay,
          openOk: true
        };
      }

      const dist = new Map();
      const prev = new Map();
      const prevMode = new Map();
      const visited = new Set();

      for (const loc of this.data.locations) {
        if (activeZones.has(loc.zone_id)) {
          dist.set(loc.id, Infinity);
        }
      }
      dist.set(startId, 0);

      while (true) {
        let u = null;
        let best = Infinity;
        for (const [id, d] of dist.entries()) {
          if (!visited.has(id) && d < best) {
            best = d;
            u = id;
          }
        }
        if (u === null || u === toId) break;
        visited.add(u);

        const uLoc = this.locMap.get(u);
        for (const edge of uLoc.connected_to) {
          if (!dist.has(edge.target_id) || visited.has(edge.target_id)) continue;
          const alt = best + edge.travel_minutes;
          if (alt < dist.get(edge.target_id)) {
            dist.set(edge.target_id, alt);
            prev.set(edge.target_id, u);
            prevMode.set(edge.target_id, edge.mode);
          }
        }
      }

      const total = dist.get(toId);
      if (!Number.isFinite(total)) {
        return {
          reachable: false,
          reason: 'DISCONNECTED',
          message: '현재 위치에서 연결된 경로가 없습니다.',
          travelMinutes: Infinity,
          path: [],
          modes: [],
          arrivalMinute: this.state.minuteOfDay,
          openOk: false
        };
      }

      const path = [];
      const modes = [];
      let cur = toId;
      while (cur) {
        path.unshift(cur);
        if (prevMode.has(cur)) modes.unshift(prevMode.get(cur));
        cur = prev.get(cur);
      }

      const arrivalMinute = this.state.minuteOfDay + total;
      const withinDay = arrivalMinute <= 1440;
      const inHours =
        arrivalMinute >= targetLoc.open_minute &&
        (targetLoc.close_minute === 1440
          ? arrivalMinute <= 1440
          : arrivalMinute < targetLoc.close_minute);

      const hasEventAtArrival = withinDay && this._hasEligibleEventAt(this.state.dayIndex, arrivalMinute, toId);
      const openOk = withinDay && (inHours || hasEventAtArrival);

      return {
        reachable: true,
        reason: openOk ? 'OK' : !withinDay ? 'TOO_LATE' : 'CLOSED',
        message: openOk
          ? ''
          : !withinDay
            ? '오늘 하루 마감(24:00)을 넘기게 됩니다.'
            : `${targetLoc.name_ko} 영업시간(${formatMinutes(targetLoc.open_minute)}~${formatMinutes(targetLoc.close_minute)})이 아닙니다.`,
        travelMinutes: total,
        path,
        modes,
        arrivalMinute,
        openOk
      };
    }

    _hasEligibleEventAt(dayIndex, minute, locationId) {
      const dayNum = this.getDayNumber(dayIndex);
      for (const ev of this.data.events) {
        if (ev.location_id !== locationId) continue;
        if (this.hasCompletedEvent(ev.id)) continue;
        if (dayNum < ev.day_start || dayNum > ev.day_end) continue;
        if (minute < ev.start_minute || minute >= ev.end_minute) continue;
        if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) continue;
        if (!ev.required_flags.every((f) => this.hasFlag(f))) continue;
        if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;
        return true;
      }
      return false;
    }

    /**
     * Resolve active NPCs from npc_schedules.json for (dayIndex, minuteOfDay, optional locationId).
     */
    getPresentNpcs(dayIndex = this.state.dayIndex, minuteOfDay = this.state.minuteOfDay, locationId = null) {
      const dayNum = this.getDayNumber(dayIndex);
      const activeZones = new Set(this.getActiveZones(dayIndex));
      const candidatesByChar = new Map();

      for (const slot of this.data.schedules) {
        if (dayNum < slot.day_start || dayNum > slot.day_end) continue;
        if (minuteOfDay < slot.start_minute || minuteOfDay >= slot.end_minute) continue;

        const loc = this.locMap.get(slot.location_id);
        if (!loc || !activeZones.has(loc.zone_id)) continue;

        if (!slot.required_flags.every((f) => this.hasFlag(f))) continue;
        if (slot.blocked_by_flags.some((f) => this.hasFlag(f))) continue;

        if (slot.event_id) {
          if (this.hasCompletedEvent(slot.event_id)) continue;
          const ev = this.eventMap.get(slot.event_id);
          if (ev) {
            if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) continue;
            if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;
          }
        }

        if (!candidatesByChar.has(slot.character_id)) {
          candidatesByChar.set(slot.character_id, []);
        }
        candidatesByChar.get(slot.character_id).push(slot);
      }

      const resolved = [];
      for (const [charId, slots] of candidatesByChar.entries()) {
        slots.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          const aEvt = a.event_id ? 1 : 0;
          const bEvt = b.event_id ? 1 : 0;
          if (bEvt !== aEvt) return bEvt - aEvt;
          return a.id.localeCompare(b.id);
        });
        const top = slots[0];
        if (locationId && top.location_id !== locationId) continue;

        const character = this.charMap.get(charId);
        const location = this.locMap.get(top.location_id);
        const event = top.event_id ? this.eventMap.get(top.event_id) : null;
        resolved.push({
          characterId: charId,
          character,
          slot: top,
          locationId: top.location_id,
          location,
          zoneId: location.zone_id,
          eventId: top.event_id,
          event,
          hasEvent: Boolean(top.event_id)
        });
      }

      resolved.sort((a, b) => {
        if ((b.hasEvent ? 1 : 0) !== (a.hasEvent ? 1 : 0)) {
          return (b.hasEvent ? 1 : 0) - (a.hasEvent ? 1 : 0);
        }
        return b.slot.priority - a.slot.priority;
      });

      return resolved;
    }

    getWorldNpcRadar() {
      const entries = this.getPresentNpcs(this.state.dayIndex, this.state.minuteOfDay, null);
      const byLocation = {};
      const byZone = {};
      for (const item of entries) {
        if (!byLocation[item.locationId]) byLocation[item.locationId] = [];
        byLocation[item.locationId].push(item);
        if (!byZone[item.zoneId]) byZone[item.zoneId] = [];
        byZone[item.zoneId].push(item);
      }
      return {
        dayIndex: this.state.dayIndex,
        dayNumber: this.getDayNumber(),
        minuteOfDay: this.state.minuteOfDay,
        totalActive: entries.length,
        entries,
        byLocation,
        byZone
      };
    }

    /**
     * Daily 24h NPC Timeline Helper (00:00..24:00 priority-resolved contiguous blocks).
     */
    getDayTimelineForHeroine(charId, dayIndex = this.state.dayIndex) {
      const character = this.charMap.get(charId);
      const dayMeta = this.getCurrentDayMeta(dayIndex);
      const dayNum = this.getDayNumber(dayIndex);
      const activeZones = new Set(this.getActiveZones(dayIndex));

      const candidateSlots = this.data.schedules.filter((slot) => {
        if (slot.character_id !== charId) return false;
        if (dayNum < slot.day_start || dayNum > slot.day_end) return false;
        const loc = this.locMap.get(slot.location_id);
        if (!loc || !activeZones.has(loc.zone_id)) return false;
        if (!slot.required_flags.every((f) => this.hasFlag(f))) return false;
        if (slot.blocked_by_flags.some((f) => this.hasFlag(f))) return false;
        if (slot.event_id) {
          if (this.hasCompletedEvent(slot.event_id)) return false;
          const ev = this.eventMap.get(slot.event_id);
          if (ev) {
            if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) return false;
            if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) return false;
          }
        }
        return true;
      });

      const segments = [];
      let currentSeg = null;
      for (let m = 0; m < 1440; m += 5) {
        let best = null;
        for (const slot of candidateSlots) {
          if (m < slot.start_minute || m >= slot.end_minute) continue;
          if (!best) {
            best = slot;
          } else if (slot.priority > best.priority) {
            best = slot;
          } else if (slot.priority === best.priority) {
            const sEvt = slot.event_id ? 1 : 0;
            const bEvt = best.event_id ? 1 : 0;
            if (sEvt > bEvt || (sEvt === bEvt && slot.id.localeCompare(best.id) < 0)) {
              best = slot;
            }
          }
        }

        if (best) {
          if (currentSeg && currentSeg.slotId === best.id) {
            currentSeg.endMinute = m + 5;
          } else {
            if (currentSeg) segments.push(currentSeg);
            const loc = this.locMap.get(best.location_id);
            const ev = best.event_id ? this.eventMap.get(best.event_id) : null;
            currentSeg = {
              slotId: best.id,
              startMinute: m,
              endMinute: m + 5,
              locationId: best.location_id,
              locationName: loc ? loc.name_ko : best.location_id,
              zoneId: loc ? loc.zone_id : 'yasohachi_town',
              eventId: best.event_id,
              eventTitle: ev ? ev.title_ko : null,
              hasEvent: Boolean(best.event_id),
              priority: best.priority,
              evidenceLevel: best.evidence_level,
              evidenceTier: best.evidence_tier || null
            };
          }
        } else if (currentSeg) {
          segments.push(currentSeg);
          currentSeg = null;
        }
      }
      if (currentSeg) segments.push(currentSeg);

      const isToday = dayIndex === this.state.dayIndex;
      const nowMin = this.state.minuteOfDay;
      for (const seg of segments) {
        seg.startLabel = formatMinutes(seg.startMinute);
        seg.endLabel = formatMinutes(seg.endMinute);
        seg.activeNow = isToday && nowMin >= seg.startMinute && nowMin < seg.endMinute;
      }

      const discovered = this.state.discoveredSchedules.includes(charId);
      return {
        characterId: charId,
        character,
        dayIndex,
        date: dayMeta ? dayMeta.date : '??-??',
        currentMinute: isToday ? nowMin : null,
        discovered,
        visibleInCurrentMode: this.state.mode === 'easy_remake' || discovered,
        segments,
        activeSegment: segments.find((s) => s.activeNow) || null
      };
    }

    /**
     * Quick Route Guide: finds the closest active or soonest upcoming uncompleted events today with travel ETA.
     */
    getQuickRouteRecommendations(limit = 3) {
      if (this.state.ended) return [];
      const dayNum = this.getDayNumber();
      const now = this.state.minuteOfDay;
      const activeZones = new Set(this.getActiveZones());
      const recs = [];

      for (const ev of this.data.events) {
        if (this.hasCompletedEvent(ev.id)) continue;
        if (dayNum < ev.day_start || dayNum > ev.day_end) continue;
        if (now >= ev.end_minute) continue;

        const loc = this.locMap.get(ev.location_id);
        if (!loc || !activeZones.has(loc.zone_id)) continue;
        if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) continue;
        if (!ev.required_flags.every((f) => this.hasFlag(f))) continue;
        if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;

        if (!ev.branch_flag_options) {
          if (this.checkMutualExclusion(ev.sets_flags).blocked) continue;
        } else {
          if (this.getEventBranchOptions(ev.id).filter((o) => o.available).length === 0) continue;
        }

        const route = this.computeShortestTravel(this.state.locationId, ev.location_id);
        if (!route.reachable) continue;
        const activeNow = now >= ev.start_minute && now < ev.end_minute;
        const canReachInTime = route.arrivalMinute < ev.end_minute;
        const minutesUntilStart = Math.max(0, ev.start_minute - now);

        recs.push({
          eventId: ev.id,
          title_ko: ev.title_ko,
          scene_type: ev.scene_type,
          characterId: ev.character_id,
          character: this.charMap.get(ev.character_id),
          locationId: ev.location_id,
          locationName: loc.name_ko,
          zoneId: loc.zone_id,
          startMinute: ev.start_minute,
          endMinute: ev.end_minute,
          windowLabel: `${formatMinutes(ev.start_minute)}~${formatMinutes(ev.end_minute)}`,
          travelMinutes: route.travelMinutes,
          arrivalMinute: route.arrivalMinute,
          activeNow,
          canReachInTime,
          minutesUntilStart,
          isPhoneEvent: ev.scene_type === 'phone_macro_branch' || ev.scene_type === 'phone_event'
        });
      }

      recs.sort((a, b) => {
        // Urgent active & reachable now first, then phone macro branches, then shortest travel / soonest start
        const aScore = (a.activeNow && a.canReachInTime ? 0 : 10000) + (a.scene_type === 'phone_macro_branch' ? -500 : 0);
        const bScore = (b.activeNow && b.canReachInTime ? 0 : 10000) + (b.scene_type === 'phone_macro_branch' ? -500 : 0);
        if (aScore !== bScore) return aScore - bScore;
        if (a.activeNow && b.activeNow) {
          if (a.travelMinutes !== b.travelMinutes) return a.travelMinutes - b.travelMinutes;
          return a.endMinute - b.endMinute;
        }
        if (a.minutesUntilStart !== b.minutesUntilStart) return a.minutesUntilStart - b.minutesUntilStart;
        return a.travelMinutes - b.travelMinutes;
      });

      return recs.slice(0, limit);
    }

    /**
     * Telephone System: check if current location has a home phone or public payphone.
     */
    canUsePhone(locationId = this.state.locationId) {
      const def = this.callableLocMap.get(locationId);
      const loc = this.locMap.get(locationId);
      if (!def) {
        return {
          canCall: false,
          phoneType: null,
          label_ko: '전화기 없음',
          locationId,
          locationName: loc ? loc.name_ko : locationId
        };
      }
      return {
        canCall: true,
        phoneType: def.phone_type,
        label_ko: def.label_ko,
        locationId,
        locationName: loc ? loc.name_ko : locationId
      };
    }

    _getEligiblePhoneEventForChar(charId) {
      if (this.state.ended) return null;
      const dayNum = this.getDayNumber();
      const minute = this.state.minuteOfDay;
      for (const pe of this.data.phone_events || []) {
        if (pe.character_id !== charId) continue;
        if (dayNum < pe.day_start || dayNum > pe.day_end) continue;
        if (minute < pe.start_minute || minute >= pe.end_minute) continue;
        const ev = this.eventMap.get(pe.event_id);
        if (!ev) continue;
        if (this.hasCompletedEvent(ev.id)) continue;
        if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) continue;
        if (!ev.required_flags.every((f) => this.hasFlag(f))) continue;
        if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;
        if (ev.branch_flag_options) {
          if (this.getEventBranchOptions(ev.id).filter((o) => o.available).length === 0) continue;
        } else if (this.checkMutualExclusion(ev.sets_flags).blocked) {
          continue;
        }
        return {
          ...ev,
          phoneEventMeta: pe,
          character: this.charMap.get(ev.character_id),
          script: this.getEventScript(ev.id),
          options: ev.branch_flag_options ? this.getEventBranchOptions(ev.id) : null
        };
      }
      return null;
    }

    getActiveIncomingPhoneEvents() {
      const list = [];
      for (const entry of this.data.phone_directory || []) {
        const ev = this._getEligiblePhoneEventForChar(entry.character_id);
        if (ev) list.push(ev);
      }
      return list;
    }

    /**
     * List all directory contacts with live phone status, incoming phone event flags, and mood/affection.
     */
    getCallableHeroines() {
      const dayNum = this.getDayNumber();
      const minute = this.state.minuteOfDay;
      const radar = this.getWorldNpcRadar();
      const presenceMap = new Map(radar.entries.map((e) => [e.characterId, e]));

      return (this.data.phone_directory || []).map((entry) => {
        const ch = this.charMap.get(entry.character_id);
        const pendingPhoneEvent = this._getEligiblePhoneEventForChar(entry.character_id);
        const hasRequiredFlags = (entry.required_flags || []).every((f) => this.hasFlag(f));
        const isUnavailableDay = (entry.unavailable_days || []).includes(dayNum);
        const inHours = minute >= entry.call_hours.start_minute && minute < entry.call_hours.end_minute;
        const canDial = Boolean(pendingPhoneEvent) || (hasRequiredFlags && !isUnavailableDay && inHours);

        let unavailableReason = '';
        if (!pendingPhoneEvent) {
          if (!hasRequiredFlags) {
            unavailableReason = entry.unavailable_reason_ko || '아직 연락처를 교환하지 않았습니다.';
          } else if (isUnavailableDay) {
            unavailableReason = entry.unavailable_reason_ko || '오늘은 통화가 불가능한 일정입니다.';
          } else if (!inHours) {
            unavailableReason = `통화 가능 시간: ${formatMinutes(entry.call_hours.start_minute)}~${formatMinutes(entry.call_hours.end_minute)}`;
          }
        }

        const aff = ch && ch.romanceable ? this.state.affection[ch.id] ?? 0 : null;
        const md = ch && ch.romanceable ? this.state.mood[ch.id] ?? 50 : null;

        return {
          characterId: entry.character_id,
          character: ch,
          phone_label_ko: entry.phone_label_ko,
          call_hours: entry.call_hours,
          inHours,
          hasRequiredFlags,
          isUnavailableDay,
          canDial,
          unavailableReason,
          calledToday: this.state.calledToday.includes(entry.character_id),
          hasIncomingPhoneEvent: Boolean(pendingPhoneEvent),
          pendingPhoneEvent,
          currentPresence: presenceMap.get(entry.character_id) || null,
          affection: aff,
          mood: md,
          moodMeta: md !== null ? this.getMoodMeta(md) : null,
          evidence_level: entry.evidence_level
        };
      });
    }

    /**
     * Place a telephone call from Home Phone or Public Payphone (costs 5 mins).
     * Learns live whereabouts, checks mood/affection, or triggers active phone-only events!
     */
    callHeroine(charId) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const phoneCheck = this.canUsePhone(this.state.locationId);
      if (!phoneCheck.canCall) {
        return {
          ok: false,
          reason: 'NO_PHONE_HERE',
          message: '현재 위치에는 전화기가 없습니다. 자택(방·거실·찻집)이나 역·세븐마트·교문 앞 공중전화를 이용해 주세요.'
        };
      }

      const entry = this.phoneDirMap.get(charId);
      const ch = this.charMap.get(charId);
      if (!entry || !ch) {
        return { ok: false, reason: 'UNKNOWN_CONTACT', message: '전화번호부에 등록되지 않은 인물입니다.' };
      }

      const dayNum = this.getDayNumber();
      const timeCost = this.data.call_time_cost_minutes || 5;

      // Check incoming phone event BEFORE spending 5 minutes so boundary calls catch the window
      const pendingPhoneEvent = this._getEligiblePhoneEventForChar(charId);
      if (pendingPhoneEvent) {
        this._discoverSchedule(charId);
        this.state.minuteOfDay = Math.min(1440, this.state.minuteOfDay + timeCost);
        this._pushLog(
          'phone',
          `☎ ${phoneCheck.label_ko} → ${ch.name_ko} 연결 (+${timeCost}분) · 특별 전화 이벤트 [${pendingPhoneEvent.title_ko}] 수신!`
        );
        return {
          ok: true,
          status: 'INCOMING_EVENT',
          character: ch,
          phoneLocation: phoneCheck,
          phoneLabel: entry.phone_label_ko,
          triggeredPhoneEvent: pendingPhoneEvent,
          responseLine: `수화기를 들자마자 ${ch.name_ko}의 다급하고 반가운 목소리가 들려왔다!`,
          timeCost,
          moodDelta: 0,
          affectionDelta: 0,
          rolledOver: false,
          rolloverResult: null
        };
      }

      // Check contact unlock & day/hours
      const hasRequiredFlags = (entry.required_flags || []).every((f) => this.hasFlag(f));
      if (!hasRequiredFlags) {
        return {
          ok: false,
          reason: 'CONTACT_LOCKED',
          message: entry.unavailable_reason_ko || `${ch.name_ko}의 연락처를 아직 알지 못합니다.`
        };
      }

      // Spend 5 minutes dialing
      this.state.minuteOfDay = Math.min(1440, this.state.minuteOfDay + timeCost);
      this._discoverSchedule(charId);

      const isUnavailableDay = (entry.unavailable_days || []).includes(dayNum);
      const inHours =
        this.state.minuteOfDay - timeCost >= entry.call_hours.start_minute &&
        this.state.minuteOfDay - timeCost < entry.call_hours.end_minute;

      let status = 'ANSWERED';
      let responseLine = entry.default_greeting_ko;
      let affectionDelta = 0;
      let moodDelta = 0;

      const timeline = this.getDayTimelineForHeroine(charId, this.state.dayIndex);
      const currentSeg = timeline.activeSegment;
      const upcomingSeg = timeline.segments.find((s) => s.startMinute > this.state.minuteOfDay) || null;
      const nextEventHint = this.getNextHintForCharacter(charId);

      let whereaboutsHint = '';
      if (isUnavailableDay) {
        status = 'UNAVAILABLE_DAY';
        responseLine = entry.unavailable_reason_ko || entry.away_message_ko;
        whereaboutsHint = responseLine;
      } else if (!inHours) {
        status = 'OUTSIDE_HOURS';
        responseLine = `지금 시각(${formatMinutes(this.state.minuteOfDay)})에는 통화가 어려운 듯 신호음만 길게 이어진다. (${formatMinutes(entry.call_hours.start_minute)}~${formatMinutes(entry.call_hours.end_minute)} 통화 가능)`;
        whereaboutsHint = upcomingSeg
          ? `오늘 예정: ${upcomingSeg.startLabel}~${upcomingSeg.endLabel} ${upcomingSeg.locationName}`
          : nextEventHint || '오늘은 뚜렷한 외출 단서가 잡히지 않았다.';
      } else {
        const moodRules = this.data.mood_affection_rules || {};
        if (ch.romanceable && !this.state.calledToday.includes(charId)) {
          this.state.calledToday.push(charId);
          const adj = this._adjustHeroineStats(
            charId,
            moodRules.daily_phone_affection_delta ?? 3,
            moodRules.daily_phone_mood_delta ?? 5,
            'phone'
          );
          affectionDelta = adj.affectionDelta;
          moodDelta = adj.moodDelta;
        }

        if (currentSeg) {
          status = currentSeg.locationId === entry.home_location_id ? 'ANSWERED_HOME' : 'ANSWERED_RELAY';
          if (status === 'ANSWERED_RELAY') {
            responseLine = `${entry.away_message_ko} (현재 위치 단서 확보!)`;
          }
          whereaboutsHint = `현재 소재: ${currentSeg.locationName} (${currentSeg.startLabel}~${currentSeg.endLabel})${currentSeg.hasEvent ? ' ★이벤트 창!' : ''}`;
        } else if (upcomingSeg) {
          status = 'ANSWERED_UPCOMING';
          whereaboutsHint = `오늘 다음 동선: ${upcomingSeg.startLabel}~${upcomingSeg.endLabel} · ${upcomingSeg.locationName}${upcomingSeg.hasEvent ? ' ★이벤트' : ''}`;
        } else {
          status = 'ANSWERED_IDLE';
          whereaboutsHint = nextEventHint || '오늘은 조용히 지내는 듯하다. 다른 날짜의 단서를 확인해 보자.';
        }
      }

      const deltaText =
        affectionDelta || moodDelta ? ` (친밀도 +${affectionDelta}, 기분 +${moodDelta})` : '';
      this._pushLog('phone', `📞 ${ch.name_ko}에게 전화 (+${timeCost}분) — ${whereaboutsHint}${deltaText}`);

      let rolledOver = false;
      let rolloverResult = null;
      if (this.state.minuteOfDay >= 1440) {
        rolledOver = true;
        rolloverResult = this.sleepToNextDay({ reason: 'midnight' });
      }

      const currentMood = ch.romanceable ? this.state.mood[charId] ?? 50 : null;
      const currentAff = ch.romanceable ? this.state.affection[charId] ?? 0 : null;

      return {
        ok: true,
        status,
        character: ch,
        phoneLocation: phoneCheck,
        phoneLabel: entry.phone_label_ko,
        responseLine,
        whereaboutsHint,
        nextEventHint,
        currentSegment: currentSeg,
        upcomingSegment: upcomingSeg,
        affection: currentAff,
        affectionDelta,
        mood: currentMood,
        moodMeta: currentMood !== null ? this.getMoodMeta(currentMood) : null,
        moodDelta,
        timeCost,
        triggeredPhoneEvent: null,
        rolledOver,
        rolloverResult
      };
    }

    /**
     * Playable 12/29 Misa Tennis Rally Minigame (5-point rally match).
     * Winning grants bonus affection/mood & flg_misa_tennis_won; losing STILL advances cleanly per original rule!
     */
    startTennisMinigame() {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }
      const ev = this.eventMap.get('evt_misa_tennis_match');
      const spec = (ev && ev.minigame_spec) || { points_to_win: 5 };
      const available = this.getAvailableEvents(this.state.locationId).some(
        (e) => e.id === 'evt_misa_tennis_match'
      );

      const firstStanceKey = TENNIS_STANCE_SEQUENCE[0];
      const match = {
        active: true,
        finished: false,
        winner: null,
        pointsToWin: spec.points_to_win || 5,
        playerScore: 0,
        misaScore: 0,
        rallyNumber: 1,
        misaStance: TENNIS_STANCES[firstStanceKey],
        boundToEvent: available,
        turnHistory: [],
        lastRally: null
      };

      this.state.activeTennisMatch = match;
      return {
        ok: true,
        match: cloneSimple(match),
        shots: Object.values(TENNIS_SHOTS)
      };
    }

    playTennisTurn(shotType) {
      const match = this.state.activeTennisMatch;
      if (!match || !match.active || match.finished) {
        return { ok: false, reason: 'NO_ACTIVE_MATCH', message: '진행 중인 테니스 매치가 없습니다.' };
      }
      const shot = TENNIS_SHOTS[shotType];
      if (!shot) {
        return { ok: false, reason: 'INVALID_SHOT', message: '유효하지 않은 구질입니다. (power / lob / drop)' };
      }

      const stance = match.misaStance;
      const playerWonRally = stance.counter === shotType;

      let commentary = '';
      if (playerWonRally) {
        match.playerScore += 1;
        if (shotType === 'lob') {
          commentary = '완벽한 로브 샷! 네트 앞으로 달려든 미사의 머리 위를 가볍게 넘어 베이스라인 안쪽에 꽂혔다!';
        } else if (shotType === 'drop') {
          commentary = '절묘한 드롭 샷! 뒤쪽에서 힘을 모으던 미사가 미처 쫓아오지 못했다!';
        } else {
          commentary = '강력한 포핸드 스매시! 깊은 수비 틈새 사이드라인을 정확히 꿰뚫었다!';
        }
      } else {
        match.misaScore += 1;
        if (stance.id === 'net_rush') {
          commentary = `미사의 날카로운 발리 반격! ${shot.label_ko}을(를) 네트 앞에서 완벽히 차단당했다.`;
        } else if (stance.id === 'baseline') {
          commentary = `미사의 호쾌한 크로스 강타! ${shot.label_ko}이(가) 힘 싸움에서 밀리고 말았다.`;
        } else {
          commentary = `미사의 끈질긴 수비 리턴! ${shot.label_ko}을(를) 받아 넘긴 역습에 점수를 내주었다.`;
        }
      }

      const rallyRecord = {
        rallyNumber: match.rallyNumber,
        shotType,
        shotLabel: shot.label_ko,
        misaStanceId: stance.id,
        misaStanceLabel: stance.label_ko,
        outcome: playerWonRally ? 'player_point' : 'misa_point',
        playerScore: match.playerScore,
        misaScore: match.misaScore,
        commentary
      };
      match.turnHistory.push(rallyRecord);
      match.lastRally = rallyRecord;

      let eventResult = null;
      if (match.playerScore >= match.pointsToWin || match.misaScore >= match.pointsToWin) {
        match.finished = true;
        match.active = false;
        match.winner = match.playerScore >= match.pointsToWin ? 'player' : 'misa';

        this.state.tennisLastResult = {
          winner: match.winner,
          playerScore: match.playerScore,
          misaScore: match.misaScore,
          rallies: match.turnHistory.length
        };

        // If bound to evt_misa_tennis_match (and eligible), complete the event cleanly!
        const isEligibleNow = this.getAvailableEvents(this.state.locationId).some(
          (e) => e.id === 'evt_misa_tennis_match'
        );
        if (isEligibleNow) {
          eventResult = this.triggerEvent('evt_misa_tennis_match', 0, {
            minigameResult: {
              won: match.winner === 'player',
              playerScore: match.playerScore,
              misaScore: match.misaScore
            }
          });
        }
      } else {
        match.rallyNumber += 1;
        const nextIdx = (match.rallyNumber - 1) % TENNIS_STANCE_SEQUENCE.length;
        match.misaStance = TENNIS_STANCES[TENNIS_STANCE_SEQUENCE[nextIdx]];
      }

      return {
        ok: true,
        rally: rallyRecord,
        match: cloneSimple(match),
        eventResult
      };
    }

    /**
     * Get all triggerable events at locationId (defaults to current location).
     */
    getAvailableEvents(locationId = this.state.locationId) {
      if (this.state.ended) return [];
      const dayNum = this.getDayNumber();
      const minute = this.state.minuteOfDay;
      const activeZones = new Set(this.getActiveZones());
      const loc = this.locMap.get(locationId);
      if (!loc || !activeZones.has(loc.zone_id)) return [];

      const available = [];
      for (const ev of this.data.events) {
        if (ev.location_id !== locationId) continue;
        if (this.hasCompletedEvent(ev.id)) continue;
        if (dayNum < ev.day_start || dayNum > ev.day_end) continue;
        if (minute < ev.start_minute || minute >= ev.end_minute) continue;
        if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) continue;
        if (!ev.required_flags.every((f) => this.hasFlag(f))) continue;
        if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;

        if (!ev.branch_flag_options) {
          const mxCheck = this.checkMutualExclusion(ev.sets_flags);
          if (mxCheck.blocked) continue;
        } else {
          const legalOptions = this.getEventBranchOptions(ev.id).filter((o) => o.available);
          if (legalOptions.length === 0) continue;
        }

        available.push({
          ...ev,
          character: this.charMap.get(ev.character_id),
          script: this.getEventScript(ev.id),
          options: ev.branch_flag_options ? this.getEventBranchOptions(ev.id) : null
        });
      }

      return available;
    }

    getEventBranchOptions(eventId) {
      const ev = this.eventMap.get(eventId);
      if (!ev || !ev.branch_flag_options) return [];
      const allBranchFlags = new Set(
        ev.branch_flag_options.flatMap((o) => o.sets_flags || [])
      );
      const baseFlags = (ev.sets_flags || []).filter((f) => !allBranchFlags.has(f));

      return ev.branch_flag_options.map((opt, index) => {
        const reqs = opt.requires_flags || [];
        const missingFlags = reqs.filter((f) => !this.hasFlag(f));
        const candidateFlags = [...baseFlags, ...(opt.sets_flags || [])];
        const mxCheck = this.checkMutualExclusion(candidateFlags);
        return {
          index,
          choice_ko: opt.choice_ko,
          requires_flags: reqs,
          sets_flags: opt.sets_flags || [],
          mood_delta: Number.isFinite(opt.mood_delta) ? opt.mood_delta : null,
          affection_delta: Number.isFinite(opt.affection_delta) ? opt.affection_delta : null,
          available: missingFlags.length === 0 && !mxCheck.blocked,
          missingFlags,
          blockedByMutualExclusion: mxCheck.blocked ? mxCheck.group : null
        };
      });
    }

    getEventScript(eventId) {
      if (EVENT_SCRIPTS[eventId]) return EVENT_SCRIPTS[eventId];
      const ev = this.eventMap.get(eventId);
      const ch = ev ? this.charMap.get(ev.character_id) : null;
      return {
        narration: ev ? `${ev.title_ko} 이벤트가 진행되었습니다.` : '새로운 이야기가 펼쳐졌습니다.',
        lines: [
          {
            speaker: ch ? ch.name_ko : '류노스케',
            text: ev ? `${ev.title_ko}의 순간이 겨울방학의 소중한 기억으로 남았다.` : '잊지 못할 겨울방학의 한 장면이었다.'
          }
        ]
      };
    }

    /**
     * Travel from current location to target location using Dijkstra shortest path.
     */
    travelTo(locationId) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const route = this.computeShortestTravel(this.state.locationId, locationId);
      if (!route.reachable || !route.openOk) {
        return {
          ok: false,
          reason: route.reason,
          message: route.message,
          route
        };
      }

      const prevLoc = this.locMap.get(this.state.locationId);
      const targetLoc = this.locMap.get(locationId);

      if (route.travelMinutes > 0) {
        this.state.minuteOfDay += route.travelMinutes;
      }
      this.state.locationId = locationId;
      this.state.zoneId = targetLoc.zone_id;
      this.state.visitedLocations[locationId] = (this.state.visitedLocations[locationId] || 0) + 1;

      if (route.travelMinutes > 0) {
        const modeTag = route.modes.includes('train')
          ? '전철 이동'
          : route.modes.includes('town_map')
            ? '마을 이동'
            : '실내/교내 이동';
        this._pushLog(
          'travel',
          `${prevLoc.name_ko} → ${targetLoc.name_ko} (${modeTag}, +${route.travelMinutes}분)`
        );
      }

      let jan6HomeTrapTriggered = false;
      if (this.state.dayIndex === 15) {
        if (!HOME_INTERIOR_IDS.has(locationId)) {
          this.state.leftHomeOnJan6 = true;
        } else if (
          this.state.leftHomeOnJan6 &&
          HOME_RETURN_TRAP_LOCATIONS.has(locationId) &&
          this.isOnsenHomeReturnWarningActive()
        ) {
          this.state.flags.flg_onsen_jan6_home_broken = true;
          jan6HomeTrapTriggered = true;
          this._pushLog(
            'warning',
            '⚠️ 1월 6일 자택 귀가 제약 위반! 온천 연계 히로인 플래그가 파손되었습니다(flg_onsen_jan6_home_broken).'
          );
        }
      }

      let rolledOver = false;
      let rolloverResult = null;
      if (this.state.minuteOfDay >= 1440) {
        rolledOver = true;
        rolloverResult = this.sleepToNextDay({ reason: 'midnight' });
      }

      const presentNpcs = this.getPresentNpcs(this.state.dayIndex, this.state.minuteOfDay, this.state.locationId);
      const availableEvents = this.getAvailableEvents(this.state.locationId);
      const promptEvent =
        availableEvents.find((e) => e.scene_type === 'phone_macro_branch') ||
        availableEvents[0] ||
        null;

      return {
        ok: true,
        travelMinutes: route.travelMinutes,
        path: route.path,
        modes: route.modes,
        arrivalMinute: this.state.minuteOfDay,
        location: this.locMap.get(this.state.locationId),
        jan6HomeTrapTriggered,
        rolledOver,
        rolloverResult,
        presentNpcs,
        availableEvents,
        promptEvent
      };
    }

    /**
     * Trigger an eligible event at the current location (or via phone for phone events).
     */
    triggerEvent(eventId, choiceIndex = 0, options = {}) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const ev = this.eventMap.get(eventId);
      if (!ev) {
        return { ok: false, reason: 'UNKNOWN_EVENT', message: '존재하지 않는 이벤트입니다.' };
      }
      if (this.hasCompletedEvent(eventId)) {
        return { ok: false, reason: 'ALREADY_COMPLETED', message: '이미 완료한 이벤트입니다.' };
      }

      const isPhoneType = ev.scene_type === 'phone_macro_branch' || ev.scene_type === 'phone_event';
      const phoneLocationOk = Boolean(options.viaPhone) && isPhoneType && this.canUsePhone().canCall;
      if (ev.location_id !== this.state.locationId && !phoneLocationOk) {
        return { ok: false, reason: 'WRONG_LOCATION', message: '해당 이벤트 장소에 있지 않습니다.' };
      }

      const dayNum = this.getDayNumber();
      if (dayNum < ev.day_start || dayNum > ev.day_end) {
        return { ok: false, reason: 'WRONG_DAY', message: '이벤트 발생 날짜가 아닙니다.' };
      }
      if (!phoneLocationOk && (this.state.minuteOfDay < ev.start_minute || this.state.minuteOfDay >= ev.end_minute)) {
        return { ok: false, reason: 'WRONG_TIME', message: '이벤트 발생 시간 창이 아닙니다.' };
      }
      if (!ev.prerequisite_events.every((pre) => this.hasCompletedEvent(pre))) {
        return { ok: false, reason: 'MISSING_PREREQ_EVENT', message: '선행 이벤트가 완료되지 않았습니다.' };
      }
      if (!ev.required_flags.every((f) => this.hasFlag(f))) {
        return { ok: false, reason: 'MISSING_REQUIRED_FLAG', message: '필수 플래그 조건이 충족되지 않았습니다.' };
      }
      if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) {
        return { ok: false, reason: 'BLOCKED_BY_FLAG', message: '상호 배타 또는 차단 플래그로 인해 진행할 수 없습니다.' };
      }

      let flagsToSet = [...(ev.sets_flags || [])];
      let selectedChoice = null;

      if (ev.branch_flag_options && ev.branch_flag_options.length > 0) {
        const branchOptions = this.getEventBranchOptions(eventId);
        const chosen = branchOptions[choiceIndex];
        if (!chosen) {
          return { ok: false, reason: 'INVALID_CHOICE', message: '유효하지 않은 선택지입니다.' };
        }
        if (!chosen.available) {
          return {
            ok: false,
            reason: chosen.blockedByMutualExclusion ? 'MUTUAL_EXCLUSION' : 'CHOICE_LOCKED',
            message: chosen.blockedByMutualExclusion
              ? `상호 배타 규칙(${chosen.blockedByMutualExclusion.id})에 의해 선택할 수 없습니다.`
              : `선행 조건 플래그(${chosen.missingFlags.join(', ')})가 필요합니다.`
          };
        }
        const allBranchFlags = new Set(ev.branch_flag_options.flatMap((o) => o.sets_flags || []));
        const baseFlags = (ev.sets_flags || []).filter((f) => !allBranchFlags.has(f));
        flagsToSet = [...baseFlags, ...chosen.sets_flags];
        selectedChoice = chosen;
      }

      // Minigame victory bonus flag (e.g. flg_misa_tennis_won)
      const mgResult = options.minigameResult || null;
      if (ev.minigame_spec && mgResult && mgResult.won && ev.minigame_spec.win_flag) {
        if (!flagsToSet.includes(ev.minigame_spec.win_flag)) {
          flagsToSet.push(ev.minigame_spec.win_flag);
        }
      }

      const mxCheck = this.checkMutualExclusion(flagsToSet);
      if (mxCheck.blocked) {
        return {
          ok: false,
          reason: 'MUTUAL_EXCLUSION',
          message: `상호 배타 그룹(${mxCheck.group.id}) 충돌로 이벤트를 실행할 수 없습니다.`,
          conflict: mxCheck
        };
      }

      // Apply event atomically
      this.state.completedEvents.push(ev.id);
      for (const flg of flagsToSet) {
        this.state.flags[flg] = true;
      }
      this._discoverSchedule(ev.character_id);

      // Compute & apply affection + mood deltas
      let affectionDelta = 0;
      let moodDelta = 0;
      const charDef = this.charMap.get(ev.character_id);

      // Partner bonus for Akira's Onsen phone/ski events
      let targetHeroineId = charDef && charDef.romanceable ? charDef.id : null;
      if (!targetHeroineId && ev.id === 'evt_onsen_phone_invite' && selectedChoice) {
        if (flagsToSet.includes('flg_onsen_partner_yui')) targetHeroineId = 'chr_yui';
        else if (flagsToSet.includes('flg_onsen_partner_tomomi')) targetHeroineId = 'chr_tomomi';
        else if (flagsToSet.includes('flg_onsen_partner_izumi')) targetHeroineId = 'chr_izumi';
      } else if (!targetHeroineId && ev.id === 'evt_onsen_ski_memories') {
        if (this.hasFlag('flg_onsen_partner_yui')) targetHeroineId = 'chr_yui';
        else if (this.hasFlag('flg_onsen_partner_tomomi')) targetHeroineId = 'chr_tomomi';
        else if (this.hasFlag('flg_onsen_partner_izumi')) targetHeroineId = 'chr_izumi';
      }

      if (targetHeroineId) {
        const isFailChoice = flagsToSet.some((f) => {
          const def = this.flagMap.get(f);
          return def && def.scope === 'fail';
        });

        let rawAff = 0;
        let rawMood = 0;
        if (ev.minigame_spec && mgResult) {
          rawAff = 20 + (mgResult.won ? (ev.minigame_spec.win_bonus_affection ?? 15) : (ev.minigame_spec.loss_bonus_affection ?? 5));
          rawMood = mgResult.won ? (ev.minigame_spec.win_bonus_mood ?? 20) : (ev.minigame_spec.loss_bonus_mood ?? 5);
        } else if (selectedChoice && (selectedChoice.affection_delta !== null || selectedChoice.mood_delta !== null)) {
          rawAff = selectedChoice.affection_delta !== null ? selectedChoice.affection_delta : (isFailChoice ? -15 : 20);
          rawMood = selectedChoice.mood_delta !== null ? selectedChoice.mood_delta : (isFailChoice ? -20 : 10);
        } else {
          rawAff = isFailChoice ? -15 : ev.scene_type === 'milestone_abstracted' ? 35 : 25;
          rawMood = isFailChoice ? -20 : ev.scene_type === 'milestone_abstracted' ? 18 : 10;
        }

        const applied = this._adjustHeroineStats(targetHeroineId, rawAff, rawMood, ev.id);
        affectionDelta = applied.affectionDelta;
        moodDelta = applied.moodDelta;
      }

      const timeCost = ev.time_cost_minutes || 0;
      this.state.minuteOfDay = Math.min(1440, this.state.minuteOfDay + timeCost);

      // Select appropriate script (custom win/loss lines for Misa Tennis!)
      let script = this.getEventScript(ev.id);
      if (ev.id === 'evt_misa_tennis_match' && mgResult) {
        script = {
          narration: mgResult.won
            ? `12월 29일 테니스 승부에서 ${mgResult.playerScore}:${mgResult.misaScore}로 승리했다! 땀을 식히며 1층 찻집으로 이동해 12/30 키사라기 데이트를 약속했다.`
            : `12월 29일 테니스 승부에서 ${mgResult.playerScore}:${mgResult.misaScore}로 아쉽게 패배했지만, 원작 규칙대로 유쾌하게 웃으며 1층 찻집으로 이동해 12/30 키사라기 데이트를 약속했다.`,
          lines: mgResult.won ? script.winLines || script.lines : script.lossLines || script.lines
        };
      }

      const choiceSuffix = selectedChoice
        ? ` [선택: ${selectedChoice.choice_ko}]`
        : mgResult
          ? ` [테니스 ${mgResult.won ? '승리' : '패배'} ${mgResult.playerScore}:${mgResult.misaScore}]`
          : '';
      const statSuffix =
        affectionDelta || moodDelta
          ? ` · ♥${affectionDelta >= 0 ? '+' : ''}${affectionDelta} / 기분${moodDelta >= 0 ? '+' : ''}${moodDelta}`
          : '';

      this._pushLog(
        'event',
        `★ ${ev.title_ko}${choiceSuffix} (+${timeCost}분, 플래그: ${flagsToSet.join(', ')})${statSuffix}`
      );

      let rolledOver = false;
      let rolloverResult = null;
      if (this.state.minuteOfDay >= 1440) {
        rolledOver = true;
        rolloverResult = this.sleepToNextDay({ reason: 'midnight' });
      }

      return {
        ok: true,
        event: ev,
        character: charDef,
        selectedChoice,
        flagsSet: flagsToSet,
        affectionDelta,
        moodDelta,
        timeCost,
        script,
        minigameResult: mgResult,
        rolledOver,
        rolloverResult
      };
    }

    /**
     * Casual talk with a present NPC at current location (0 minutes per verified_data).
     */
    talkToNpc(characterId) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const present = this.getPresentNpcs(this.state.dayIndex, this.state.minuteOfDay, this.state.locationId);
      const match = present.find((p) => p.characterId === characterId);
      if (!match) {
        return { ok: false, reason: 'NPC_NOT_PRESENT', message: '현재 장소에 해당 인물이 없습니다.' };
      }

      const ch = match.character;
      this._discoverSchedule(characterId);
      let affectionDelta = 0;
      let moodDelta = 0;
      if (ch.romanceable && !this.state.talkedToday.includes(characterId)) {
        this.state.talkedToday.push(characterId);
        const moodRules = this.data.mood_affection_rules || {};
        const adj = this._adjustHeroineStats(
          characterId,
          moodRules.daily_talk_affection_delta ?? 5,
          moodRules.daily_talk_mood_delta ?? 5,
          'talk'
        );
        affectionDelta = adj.affectionDelta;
        moodDelta = adj.moodDelta;
      }

      const hint = this.getNextHintForCharacter(characterId);
      let line = '';
      if (characterId === 'chr_aritomo' && this.state.dayIndex === 9) {
        line = '흥, 특별히 알려 주지. 오늘 오후 5시에 카타기리 선생님이 키사라기 스테이션 호텔 로비에 가실 거라고 하더군.';
      } else if (match.event) {
        line = `지금 여기서 "${match.event.title_ko}" 이야기를 나눌 수 있을 것 같아.`;
      } else if (hint) {
        line = `겨울방학 일정 잘 보내고 있어? (${hint})`;
      } else if (ch.romanceable && this.hasFlag(`flg_${ch.id.replace('chr_', '')}_route_complete`)) {
        line = '이번 겨울방학은 정말 잊지 못할 거야. 1월 7일 시업식이 기다려져!';
      } else {
        line = '추운 날씨네. 감기 조심하고 즐거운 방학 보내!';
      }

      this._pushLog(
        'talk',
        `${ch.name_ko}와(과) 대화 (0분)${affectionDelta ? ` · ♥+${affectionDelta} / 기분+${moodDelta}` : ''}`
      );

      return {
        ok: true,
        character: ch,
        line,
        hint,
        affectionDelta,
        moodDelta,
        availableEventId: match.eventId || null
      };
    }

    getNextHintForCharacter(characterId) {
      const dayNum = this.getDayNumber();
      const upcoming = this.data.events
        .filter((ev) => ev.character_id === characterId && !this.hasCompletedEvent(ev.id))
        .sort((a, b) => a.day_start - b.day_start || a.start_minute - b.start_minute);

      for (const ev of upcoming) {
        if (ev.day_end < dayNum) continue;
        if (ev.blocked_by_flags.some((f) => this.hasFlag(f))) continue;
        const loc = this.locMap.get(ev.location_id);
        const startDay = this.data.days[ev.day_start - 1];
        const endDay = this.data.days[ev.day_end - 1];
        const dayRange =
          ev.day_start === ev.day_end
            ? startDay.date
            : `${startDay.date}~${endDay.date}`;
        return `다음 단서: ${dayRange} ${formatMinutes(ev.start_minute)}~${formatMinutes(ev.end_minute)} · ${loc ? loc.name_ko : ev.location_id}`;
      }
      return null;
    }

    waitMinutes(minutes) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const raw = Number(minutes);
      if (!Number.isFinite(raw) || raw <= 0) {
        return { ok: false, reason: 'INVALID_DURATION', message: '대기 시간은 양수여야 합니다.' };
      }
      const quantum = this.data.clock_spec ? this.data.clock_spec.base_quantum_minutes : 5;
      const quantized = Math.max(quantum, Math.round(raw / quantum) * quantum);

      this.state.minuteOfDay += quantized;
      this._pushLog('wait', `시간 대기 (+${quantized}분)`);

      let rolledOver = false;
      let rolloverResult = null;
      if (this.state.minuteOfDay >= 1440) {
        rolledOver = true;
        rolloverResult = this.sleepToNextDay({ reason: 'midnight' });
      }

      return {
        ok: true,
        waitedMinutes: quantized,
        dayIndex: this.state.dayIndex,
        minuteOfDay: this.state.minuteOfDay,
        rolledOver,
        rolloverResult,
        presentNpcs: this.getPresentNpcs(this.state.dayIndex, this.state.minuteOfDay, this.state.locationId),
        availableEvents: this.getAvailableEvents(this.state.locationId)
      };
    }

    getNextScheduledMinuteToday() {
      if (this.state.ended) return null;
      const dayNum = this.getDayNumber();
      const activeZones = new Set(this.getActiveZones());
      let earliest = null;

      for (const slot of this.data.schedules) {
        if (dayNum < slot.day_start || dayNum > slot.day_end) continue;
        if (slot.start_minute <= this.state.minuteOfDay) continue;
        const loc = this.locMap.get(slot.location_id);
        if (!loc || !activeZones.has(loc.zone_id)) continue;
        if (!slot.required_flags.every((f) => this.hasFlag(f))) continue;
        if (slot.blocked_by_flags.some((f) => this.hasFlag(f))) continue;
        if (slot.event_id && this.hasCompletedEvent(slot.event_id)) continue;

        if (earliest === null || slot.start_minute < earliest) {
          earliest = slot.start_minute;
        }
      }
      return earliest;
    }

    sleepToNextDay(options = {}) {
      if (this.state.ended) {
        return { ok: false, reason: 'GAME_ENDED', message: '이미 엔딩에 도달했습니다.' };
      }

      const prevDayMeta = this.getCurrentDayMeta();
      const nextDayIndex = this.state.dayIndex + 1;
      const defaultWake = this.data.clock_spec ? this.data.clock_spec.default_wake_minute : 480;

      if (nextDayIndex === 7) {
        if (!this.hasFlag('flg_onsen_trip_joined') && !this.hasFlag('flg_onsen_trip_declined')) {
          this.state.flags.flg_onsen_trip_declined = true;
          this._pushLog('branch', '동지온천 여행 불참으로 확정되어 12/29~30 마을 잔류 루트가 열렸습니다.');
        }
      }

      this.state.talkedToday = [];
      this.state.calledToday = [];
      this.state.activeTennisMatch = null;

      if (nextDayIndex >= this.data.days.length - 1) {
        this.state.dayIndex = this.data.days.length - 1;
        this.state.minuteOfDay = defaultWake;
        this.state.locationId = 'loc_school_gate';
        this.state.zoneId = 'yasohachi_gakuen';
        this.state.flags.flg_opening_ceremony_reached = true;
        this.state.ended = true;

        const ending = this.evaluateEnding();
        this.state.endingId = ending.id;
        this._pushLog('ending', `1월 7일 3학기 시업식 — [${ending.title_ko}] 달성!`);
        return {
          ok: true,
          ended: true,
          ending,
          dayIndex: this.state.dayIndex,
          minuteOfDay: this.state.minuteOfDay
        };
      }

      this.state.dayIndex = nextDayIndex;
      const nextDayMeta = this.getCurrentDayMeta(nextDayIndex);

      if ((nextDayIndex === 7 || nextDayIndex === 8) && this.hasFlag('flg_onsen_trip_joined')) {
        this.state.locationId = 'loc_nagashima_ryokan';
        this.state.zoneId = 'touji_onsen';
        this.state.minuteOfDay = defaultWake;
        this.state.visitedLocations.loc_nagashima_ryokan =
          (this.state.visitedLocations.loc_nagashima_ryokan || 0) + 1;
        this._pushLog(
          'day',
          nextDayIndex === 7
            ? '12월 29일 — 동지온천 나가시마 료칸 도착! (2일간 온천 리조트 체류)'
            : '12월 30일 — 동지온천 2일차 아침이 밝았습니다.'
        );
      } else if (nextDayIndex === 9 && this.hasFlag('flg_onsen_trip_joined')) {
        this.state.locationId = 'loc_home_room';
        this.state.zoneId = 'yasohachi_town';
        this.state.minuteOfDay = defaultWake;
        this._pushLog('day', '12월 31일 — 동지온천 여행을 마치고 야소하치 마을로 귀환했습니다.');
      } else if (
        nextDayIndex === 15 &&
        this.hasFlag('flg_misako_bath_jan1') &&
        !this.hasFlag('flg_misako_route_complete')
      ) {
        this.state.locationId = 'loc_home_room';
        this.state.zoneId = 'yasohachi_town';
        this.state.minuteOfDay = 120;
        this.state.leftHomeOnJan6 = false;
        this._pushLog('day', '1월 6일 02:00 — 잠에서 깨어 거실 쪽의 은은한 불빛을 느꼈습니다.');
      } else {
        this.state.locationId = 'loc_home_room';
        this.state.zoneId = 'yasohachi_town';
        this.state.minuteOfDay = defaultWake;
        if (nextDayIndex === 15) {
          this.state.leftHomeOnJan6 = false;
        }
        const reasonTag = options.reason === 'midnight' ? ' (자정 경과)' : '';
        this._pushLog(
          'day',
          `${formatDateLabel(nextDayMeta, nextDayIndex)} ${formatMinutes(this.state.minuteOfDay)} — 새로운 아침이 밝았습니다.${reasonTag}`
        );
      }

      return {
        ok: true,
        ended: false,
        previousDate: prevDayMeta ? prevDayMeta.date : null,
        dayIndex: this.state.dayIndex,
        date: nextDayMeta.date,
        minuteOfDay: this.state.minuteOfDay,
        locationId: this.state.locationId,
        zoneId: this.state.zoneId
      };
    }

    evaluateEnding() {
      const sorted = [...this.data.endings].sort(
        (a, b) => b.evaluation_priority - a.evaluation_priority
      );

      for (const end of sorted) {
        const reqOk = end.required_flags.every((f) => this.hasFlag(f));
        const blocked = end.blocked_by_flags.some((f) => this.hasFlag(f));
        if (reqOk && !blocked) {
          const character = end.character_id ? this.charMap.get(end.character_id) : null;
          const extra = ENDING_EPILOGUES[end.id] || {
            mood: 'neutral',
            epilogue: `${end.title_ko}에 도달했습니다.`
          };
          return {
            ...end,
            character,
            ...extra
          };
        }
      }

      const fallback = this.endingMap.get('end_solo_normal') || sorted[sorted.length - 1];
      return {
        ...fallback,
        character: fallback.character_id ? this.charMap.get(fallback.character_id) : null,
        ...(ENDING_EPILOGUES[fallback.id] || { mood: 'neutral', epilogue: fallback.title_ko })
      };
    }

    getHeroineProgressList() {
      const radar = this.getWorldNpcRadar();
      const activeByChar = new Map(radar.entries.map((e) => [e.characterId, e]));

      return this.heroines.map((h) => {
        const events = this.data.events.filter((e) => e.character_id === h.id);
        const completed = events.filter((e) => this.hasCompletedEvent(e.id));
        const routeCompleteFlag = `flg_${h.id.replace('chr_', '')}_route_complete`;
        const isComplete = this.hasFlag(routeCompleteFlag);
        const isLocked =
          !isComplete &&
          events.length > 0 &&
          events.some((e) => !this.hasCompletedEvent(e.id) && e.blocked_by_flags.some((f) => this.hasFlag(f)));

        const currentPresence = activeByChar.get(h.id) || null;
        const moodVal = this.state.mood[h.id] ?? 50;
        return {
          character: h,
          affection: this.state.affection[h.id] ?? 0,
          mood: moodVal,
          moodMeta: this.getMoodMeta(moodVal),
          totalMilestones: events.length,
          completedMilestones: completed.length,
          isComplete,
          isLocked,
          currentPresence,
          nextHint: this.getNextHintForCharacter(h.id),
          timeline: this.getDayTimelineForHeroine(h.id, this.state.dayIndex),
          events: events.map((ev) => ({
            id: ev.id,
            title_ko: ev.title_ko,
            day_start: ev.day_start,
            day_end: ev.day_end,
            start_minute: ev.start_minute,
            end_minute: ev.end_minute,
            location_id: ev.location_id,
            locationName: this.locMap.get(ev.location_id)?.name_ko || ev.location_id,
            completed: this.hasCompletedEvent(ev.id),
            blocked: ev.blocked_by_flags.some((f) => this.hasFlag(f))
          }))
        };
      });
    }

    getMutualExclusionStatus() {
      return this.data.mutually_exclusive_groups.map((mx) => {
        const activeFlags = mx.exclusive_flags.filter((f) => this.hasFlag(f));
        const lockedFlags =
          activeFlags.length > 0
            ? mx.exclusive_flags.filter((f) => !activeFlags.includes(f))
            : [];
        return {
          ...mx,
          resolved: activeFlags.length > 0,
          activeFlags,
          lockedFlags
        };
      });
    }

    getSnapshot() {
      return cloneSimple(this.state);
    }

    serialize() {
      const payload = {
        schema_version: '2.0.0',
        game_id: this.data.game_id,
        dayIndex: this.state.dayIndex,
        minuteOfDay: this.state.minuteOfDay,
        zoneId: this.state.zoneId,
        locationId: this.state.locationId,
        flags: this.getActiveFlags(),
        completedEvents: [...this.state.completedEvents],
        affection: { ...this.state.affection },
        mood: { ...this.state.mood },
        talkedToday: [...this.state.talkedToday],
        calledToday: [...this.state.calledToday],
        discoveredSchedules: [...this.state.discoveredSchedules],
        visitedLocations: { ...this.state.visitedLocations },
        leftHomeOnJan6: Boolean(this.state.leftHomeOnJan6),
        tennisLastResult: this.state.tennisLastResult ? { ...this.state.tennisLastResult } : null,
        mode: this.state.mode,
        ended: Boolean(this.state.ended),
        endingId: this.state.endingId,
        historyLog: cloneSimple(this.state.historyLog)
      };
      return JSON.stringify(payload);
    }

    deserialize(jsonInput) {
      const parsed = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid save data: expected JSON object.');
      }
      if (
        !Number.isInteger(parsed.dayIndex) ||
        parsed.dayIndex < 0 ||
        parsed.dayIndex >= this.data.days.length
      ) {
        throw new Error(`Invalid dayIndex in save data: ${parsed.dayIndex}`);
      }
      if (
        !Number.isInteger(parsed.minuteOfDay) ||
        parsed.minuteOfDay < 0 ||
        parsed.minuteOfDay > 1440 ||
        parsed.minuteOfDay % 5 !== 0
      ) {
        throw new Error(`Invalid minuteOfDay in save data: ${parsed.minuteOfDay}`);
      }
      if (!this.locMap.has(parsed.locationId)) {
        throw new Error(`Unknown locationId in save data: ${parsed.locationId}`);
      }

      const flagsObj = {};
      const flagList = Array.isArray(parsed.flags)
        ? parsed.flags
        : Object.keys(parsed.flags || {}).filter((k) => parsed.flags[k]);

      for (const flg of flagList) {
        if (!this.flagMap.has(flg)) {
          throw new Error(`Unknown flag in save data: ${flg}`);
        }
        flagsObj[flg] = true;
      }

      for (const mx of this.data.mutually_exclusive_groups) {
        const active = mx.exclusive_flags.filter((f) => flagsObj[f]);
        if (active.length > 1) {
          throw new Error(
            `Save data violates mutual exclusion group ${mx.id}: ${active.join(', ')}`
          );
        }
      }

      const affection = {};
      const mood = {};
      for (const h of this.heroines) {
        const av = parsed.affection && Number.isFinite(parsed.affection[h.id]) ? parsed.affection[h.id] : 0;
        const mv = parsed.mood && Number.isFinite(parsed.mood[h.id]) ? parsed.mood[h.id] : 50;
        affection[h.id] = Math.max(0, Math.min(100, av));
        mood[h.id] = Math.max(0, Math.min(100, mv));
      }

      const loc = this.locMap.get(parsed.locationId);
      this.state = {
        schema_version: '2.0.0',
        dayIndex: parsed.dayIndex,
        minuteOfDay: parsed.minuteOfDay,
        zoneId: loc.zone_id,
        locationId: parsed.locationId,
        flags: flagsObj,
        completedEvents: Array.isArray(parsed.completedEvents)
          ? [...new Set(parsed.completedEvents.filter((id) => this.eventMap.has(id)))]
          : ['evt_prologue_start'],
        affection,
        mood,
        talkedToday: Array.isArray(parsed.talkedToday) ? [...parsed.talkedToday] : [],
        calledToday: Array.isArray(parsed.calledToday) ? [...parsed.calledToday] : [],
        discoveredSchedules: Array.isArray(parsed.discoveredSchedules)
          ? [...new Set(parsed.discoveredSchedules)]
          : ['chr_yui', 'chr_misako'],
        visitedLocations: parsed.visitedLocations ? { ...parsed.visitedLocations } : { [parsed.locationId]: 1 },
        leftHomeOnJan6: Boolean(parsed.leftHomeOnJan6),
        activeTennisMatch: null,
        tennisLastResult: parsed.tennisLastResult ? { ...parsed.tennisLastResult } : null,
        lastImpact: null,
        mode: parsed.mode === 'classic' ? 'classic' : 'easy_remake',
        ended: Boolean(parsed.ended),
        endingId: parsed.endingId || null,
        historyLog: Array.isArray(parsed.historyLog) ? cloneSimple(parsed.historyLog) : []
      };

      return this.getSnapshot();
    }
  }

  const exportsObj = {
    Doukyuusei2Engine,
    formatMinutes,
    formatDateLabel,
    WEEKDAYS_KO,
    TENNIS_STANCES,
    TENNIS_SHOTS,
    createEngine: (data, options) => new Doukyuusei2Engine(data, options)
  };

  root.Doukyuusei2Engine = exportsObj;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
