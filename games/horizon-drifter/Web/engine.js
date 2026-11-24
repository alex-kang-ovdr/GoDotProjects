/* HORIZON Headless A.D.M.S. & Reflector Device Engine — Phase 2 (60 Nodes, Hotspots, Dela Grante Puzzles, Deterministic UMD) */
(function (root, factory) {
  var exported = factory(root && root.YUNO_DATA ? root.YUNO_DATA : null);
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  }
  if (root) {
    root.YunoEngine = exported;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (defaultGlobalData) {
  'use strict';

  var SCHEMA_VERSION = '2.0.0';
  var MAX_LOG_ENTRIES = 100;

  var EDITION_CONFIG = {
    pc98_8jewels: {
      id: 'pc98_8jewels',
      labelKo: 'PC-98 원작 (보옥 8슬롯: 초기 2 + 발견 6)',
      initialCount: 2,
      capacity: 8,
    },
    remake_10jewels: {
      id: 'remake_10jewels',
      labelKo: 'SS / 리메이크 (보옥 10슬롯: 초기 4 + 발견 6)',
      initialCount: 4,
      capacity: 10,
    },
  };

  function normalizeEdition(raw) {
    if (raw === 'remake_10jewels' || raw === 'ss_remake_10_jewels' || raw === 'ss_1997' || raw === 'remake_2017_mages') {
      return 'remake_10jewels';
    }
    return 'pc98_8jewels';
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function addUnique(arr, val) {
    if (val != null && arr.indexOf(val) === -1) {
      arr.push(val);
      return true;
    }
    return false;
  }

  function removeValue(arr, val) {
    var idx = arr.indexOf(val);
    if (idx !== -1) {
      arr.splice(idx, 1);
      return true;
    }
    return false;
  }

  function createInitialIsekaiState() {
    return {
      desert: {
        water: 100,
        rations: 100,
        distance: 0,
        talkCount: 0,
        lookCount: 0,
        steps: 0,
        completed: false,
        lastMessage: '라파엘로 사막 진입. 유노와 대화를 나누고 주변을 살피며 오아시스를 향해 나아가자.',
      },
      underground1: {
        depth: 0,
        corridor: 'main',
        deadEndHit: false,
        turnedRight: false,
        steps: 0,
        completed: false,
        history: [],
        lastMessage: '제도 지하도 1(거리→성) 입구. 어두운 석조 통로가 앞쪽으로 길게 뻗어 있다.',
      },
      underground2: {
        depth: 0,
        steps: 0,
        completed: false,
        history: [],
        lastMessage: '제도 지하도 2 입구. 도주한 류조지의 발자국이 앞쪽 거리·성당 방면으로 곧장 이어진다!',
      },
    };
  }

  /* Faithful SF-mystery narrative beats & inspection hints for all 60 A.D.M.S. nodes */
  var NODE_SCRIPT = {
    node_prologue_start: {
      speaker: '아리마 타쿠야',
      dialogue: '실종된 아버지 코다이에게서 소포가 도착했다. 정체불명의 팔각형 금속 장치 — "리플렉터 디바이스"와, 2개월 전 죽은 줄 알았던 아버지의 필체로 적힌 편지다. "오늘 밤 10시, 켄노미사키 삼각산으로 와라."',
      inspect: '책상 위 편지에는 "시간은 하나의 선이 아니라 무수히 갈라지는 병렬세계의 나무"라고 적혀 있다. 리플렉터 디바이스 중앙의 홈에는 이미 푸른 보옥이 희미하게 맥동하고 있다.',
    },
    node_prologue_coast_cape: {
      speaker: '아리마 타쿠야',
      dialogue: '밤 10시, 켄노미사키 해안 공사 현장. 지오테크닉스의 중장비 너머 맑은 밤하늘에서 기이한 푸른 번개가 삼각산 꼭대기를 내리쳤다!',
      inspect: '해안 설비와 낙뢰 지점이 이상한 자장을 띠고 있다. 편지대로 삼각산 쌍둥이 바위로 올라가 보자.',
    },
    node_prologue_triangle_encounter: {
      speaker: '의문의 소녀',
      dialogue: '삼각산 쌍둥이 바위 아래 서 있던 정체불명의 소녀가 타쿠야를 껴안으며 "그를 지켜야 해..."라 속삭이고 사라졌다. 직후 아유미와 류조지가 충돌하는 순간, 하늘이 갈라지며 리플렉터가 격렬히 발광했다!',
      inspect: '시공의 진동이 잦아들자 아침 햇살이 쏟아진다. 이제 본격적인 A.D.M.S. 병렬세계 탐색이 시작된다.',
    },
    node_day1_hub: {
      speaker: '내레이션 (A.D.M.S. 기준점)',
      dialogue: '본편 1일차 아침, 아리마 저택. 아직 아버지의 서재 짐이 그대로 남아 있는 결정적인 시간대다. 리플렉터 하단의 보옥이 강하게 점멸하며 "이곳에 보옥 세이브를 남겨 두라"고 경고한다.',
      inspect: '서재 문은 굳게 잠겨 있지만, 문틈으로 괘종시계와 코다이의 연구 자료가 고스란히 보존되어 있음이 느껴진다. 책상 서랍과 서재 연결문 핫스팟을 확인해 보자!',
    },
    node_day1_living_ayumi: {
      speaker: '아리마 아유미',
      dialogue: '거실에서 아침을 준비하던 의붓어머니 아유미가 피곤한 기색으로 지오테크닉스 해안 공사 일정을 점검하고 있다. "도요토미 씨가 공사 일지를 멋대로 고친 것 같아서 걱정이야..."',
      inspect: '테이블 위 일정표에 해안 공사 현장과 지오테크닉스 사옥 일정이 빼곡히 적혀 있다. 아유미 루트의 중요한 복선이다.',
    },
    node_jewel1_drawer: {
      speaker: '아리마 타쿠야',
      dialogue: '자실 서랍 속 리플렉터 설명서를 읽지 않고 안쪽을 더듬자, 서랍 틈새에서 눈부신 광점이 떠올랐다. 리플렉터의 빈 슬롯에 딱 맞는 첫 번째 추가 보옥이다!',
      inspect: '광점이 사라진 서랍 안쪽은 이제 비어 있다. 확보한 보옥 1은 시간축을 점프해도 영구히 리플렉터에 귀속된다.',
    },
    node_school_day1_gate: {
      speaker: '하타노 칸나',
      dialogue: '사카이마치 학원 홀을 거쳐 정문으로 나오자, 헤드폰을 쓴 수수께끼의 전학생 칸나와 부딪쳤다. 그녀가 떨어뜨린 학생수첩을 줍는 순간, 리플렉터 하단 보옥이 격렬하게 점멸한다 — 여기서 여섯 갈래 평행세계가 갈라진다!',
      inspect: '학원 정문 앞은 사카이마치의 모든 분기가 시작되는 교차로다. 이곳에 보옥 세이브를 설치해 두면 미츠키·아유미·카오리·미오·에리코·칸나 루트를 자유롭게 오가며 아이템을 역계승할 수 있다.',
    },
    node_mitsuki_call: {
      speaker: '이치죠 미츠키',
      dialogue: '학장 비서 미츠키의 다급한 전화를 받고 류조지 코조의 무가 저택을 찾았다. 수상한 기척 속에서 황금 열쇠를 손에 넣었지만, 저택 깊숙한 곳에서 류조지의 차가운 시선이 느껴진다.',
      inspect: '리플렉터 점멸 감지! 증거 없이 류조지를 정면 추궁하면 함정에 빠진다. 황금 열쇠로 은밀히 잠입하기 전 보옥 세이브를 설치해 두자.',
    },
    node_mitsuki_ryuzoji_ambush: {
      speaker: '시스템 경고 (소용돌이 — 류조지 구속)',
      dialogue: '아무 대비 없이 류조지 코조를 정면 추궁하다 저택 경비와 비밀 장치에 포위당했다! 류조지의 냉소와 함께 이 시간축은 어두운 소용돌이(Whirlpool)로 닫혀 버렸다.',
      inspect: '증거 없는 정면 대결은 치명적이다. A.D.M.S.에서 류조지 저택 방문 보옥으로 점프해 황금 열쇠를 이용한 잠입 경로를 택하자!',
    },
    node_mitsuki_mansion_sneak: {
      speaker: '아리마 타쿠야',
      dialogue: '황금 열쇠로 류조지 저택 안쪽 비밀 통로에 잠입했으나, 뒤이어 미츠키와 함께 어두운 토장(土蔵)에 갇히기 직전이다! 리플렉터가 강하게 점멸한다.',
      inspect: '원작의 유명한 순서 함정 경고! 토장에 들어가면 반드시 벽보다 좌측 로프를 먼저 챙겨야 한다. 직전 보옥 세이브를 강력 권장한다.',
    },
    node_mitsuki_rope_lockout: {
      speaker: '시스템 경고 (소용돌이 — 토장 로프 소실)',
      dialogue: '토장 벽을 먼저 조사하는 바람에 구석에 있던 로프를 회수할 기회를 영영 놓쳐 버렸다! 로프 없이는 우물 속 은 메달을 건질 수 없어 시간축이 소용돌이(Whirlpool)에 갇혔다.',
      inspect: '이 시간축은 인과가 꼬인 막다른 길이다. A.D.M.S. 지도에서 이전 보옥 세이브로 리플렉터 점프해 로프를 먼저 회수하자!',
    },
    node_mitsuki_storehouse: {
      speaker: '아리마 타쿠야',
      dialogue: '토장에 갇히자마자 벽보다 먼저 좌측의 로프를 챙겼다! 그리고 안쪽 방 수상한 기계 옆에서 눈부신 광점(보옥 2)까지 발견했다. 이제 뒤뜰 우물로 가 로프를 내려 보자!',
      inspect: '보옥 2와 로프 확보 완료! 뒤뜰 우물 핫스팟에 로프를 사용하거나 이동해 우물 밑의 은 메달을 인양하자.',
    },
    node_mitsuki_well_medal: {
      speaker: '아리마 타쿠야',
      dialogue: '류조지 저택 뒤뜰의 깊은 우물에 로프를 내려 수면 아래 가라앉아 있던 "은 메달"을 건져 올렸다! 떨고 있는 미츠키는 류조지가 더 이상 옛날의 그 사람이 아니라고 고백한다.',
      inspect: '확보한 은 메달은 시간축을 초월하는 글로벌 계승 아이템이다. 미오 루트의 사당 지하 동굴 제단에서 결정적인 열쇠가 된다.',
    },
    node_mitsuki_end: {
      speaker: '이치죠 미츠키',
      dialogue: '류조지 저택의 끔찍한 진실과 미츠키의 고독을 마주하며 하나의 시간축이 막을 내렸다. 이 분기의 결말과 획득한 보옥·은 메달을 가슴에 품은 채, 다른 평행세계로 도약할 시간이다.',
      inspect: '미츠키 루트 클리어 글로벌 플래그가 A.D.M.S.에 영구 각인되었다. 보옥 로드로 학원 정문이나 다른 분기점으로 점프하자.',
    },
    node_ayumi_branch: {
      speaker: '아리마 아유미',
      dialogue: '지오테크닉스 사옥 앞. 해안 지질조사 프로젝트 책임자인 의붓어머니 아유미가 도요토미의 음모에 휘말려 있다. 여경비원 앞에서 손에 쥔 자기카드를 쓸지, 아니면 아껴 두고 삼각산 쪽으로 우회할지 선택의 기로다.',
      inspect: '리플렉터 점멸 감지! 여경비원 앞에서 자기카드를 성급히 쓰면 함정에 빠진다. 자기카드를 쓰지 않고 사당·삼각산으로 우회해야 보옥 3을 발견할 수 있다!',
    },
    node_ayumi_card_trap_whirlpool: {
      speaker: '시스템 경고 (소용돌이 — 자기카드 성급 사용)',
      dialogue: '여경비원 앞에서 자기카드를 성급히 제시하자 보안 경보에 제지당해 쫓겨나 버렸다. 류조지를 뒤쫓을 기회도, 삼각산의 보옥 3도 놓친 막다른 소용돌이다!',
      inspect: '자기카드는 함정 미끼였다! A.D.M.S. 보옥 점프로 아유미 분기로 돌아가 자기카드를 쓰지 않고 삼각산으로 우회하자.',
    },
    node_ayumi_jewel3_mountain: {
      speaker: '아리마 타쿠야',
      dialogue: '자기카드를 아낀 채 사당을 지나 삼각산 쌍둥이 바위까지 류조지의 행적을 쫓았다. 바위 그늘 아래 시공의 일그러짐 속에서 세 번째 추가 보옥이 찬란하게 빛나고 있다!',
      inspect: '삼각산은 400년마다 번개가 내려치는 사카이마치 시공 왜곡의 중심지다. 보옥 3을 리플렉터에 장착했다.',
    },
    node_ayumi_desk_safe: {
      speaker: '아리마 타쿠야',
      dialogue: '아유미의 방 책상과 숨겨진 소형 금고를 조사하자, 지오테크닉스 해안 공사의 지질 데이터 위조 내역과 도요토미의 매각 사보타주 증거가 쏟아져 나왔다!',
      inspect: '책상·금고 핫스팟에서 확인한 도요토미의 음모를 막으려면 지금 즉시 켄노미사키 해안 공사 현장으로 달려가야 한다.',
    },
    node_ayumi_toyotomi_confront: {
      speaker: '도요토미 히데오',
      dialogue: '밤의 켄노미사키 해안 공사 현장. 도요토미가 아유미를 협박하며 지질 샘플과 최고 보안 카드를 가로채려 하고 있다! 리플렉터 하단 보옥이 날카롭게 점멸한다.',
      inspect: '도요토미의 거짓 거래에 넘어가면 소용돌이로 추락한다. 금고에서 확보한 증거로 도요토미의 사보타주를 폭로하자!',
    },
    node_ayumi_toyotomi_bad: {
      speaker: '시스템 경고 (소용돌이 — 도요토미 사보타주 함정)',
      dialogue: '도요토미의 협박과 회유에 말려드는 순간 배후에서 공사 인부들에게 제압당했다... 아유미는 책임을 뒤집어쓰고, 블루 카드의 행방도 묘연해졌다.',
      inspect: '도요토미의 함정에 빠졌다! A.D.M.S. 보옥 점프로 돌아가 정면으로 사보타주를 폭로하자.',
    },
    node_ayumi_blue_card: {
      speaker: '아리마 타쿠야',
      dialogue: '도요토미의 비리를 낱낱이 폭로해 아유미를 구출하고, 지오테크닉스 최상층 코다이 연구실로 통하는 "블루 카드"를 손에 넣었다!',
      inspect: '블루 카드는 카오리 루트의 지오테크닉스 사옥 보안문을 여는 핵심 교차 계승 아이템이다.',
    },
    node_ayumi_end: {
      speaker: '아리마 아유미',
      dialogue: '거대한 음모 속에서 아유미와 마음을 나눈 시간축이 완결되었다. 하지만 코다이의 연구와 지오테크닉스의 비밀은 아직 끝나지 않았다 — 블루 카드를 쥔 채 카오리의 시간축으로 넘어가야 한다.',
      inspect: '아유미 루트 클리어 완료! 블루 카드는 글로벌 인벤토리에 보존되므로, 학원 정문으로 보옥 점프해 카오리 루트에 도전하자.',
    },
    node_kaori_branch: {
      speaker: '아사쿠라 카오리',
      dialogue: 'TV 인기 캐스터이자 탐사 저널리스트 카오리와 시가지에서 합류했다. 그녀는 지오테크닉스와 아리마 코다이의 실종을 쫓고 있다. 핵심 단서인 "20페이지째 서류"를 확보했다.',
      inspect: '지오테크닉스 사옥 내부는 삼엄한 카드키 보안으로 막혀 있다. 이곳에 보옥 세이브를 심어 두고 20페이지째 서류를 해독하자.',
    },
    node_kaori_dossier_analysis: {
      speaker: '아사쿠라 카오리',
      dialogue: '학원 연구실 자료와 "20페이지째 서류"를 대조하자, 아버지 코다이의 비밀 연구실이 지오테크닉스 사옥 보안 구역 깊숙이 숨겨져 있음이 드러났다!',
      inspect: '연구실 기밀 서류 핫스팟에 20페이지째 서류를 대조하거나 사옥 보안문으로 이동해 야간 잠입을 개시하자.',
    },
    node_kaori_gate_blue_card: {
      speaker: '아사쿠라 카오리',
      dialogue: '지오테크닉스 사옥 코다이 연구실 앞 전자 보안문. 일반 출입증으로는 열리지 않는다. "타쿠야 군, 블루 카드가 없으면 여기서 더는 못 들어가."',
      inspect: '교차 계승 관문! 아유미 루트에서 입수한 "블루 카드"를 카드 리더 핫스팟에 사용(또는 전진)해 보안문을 열자. 강제 돌파 시 경보 소용돌이에 빠진다!',
    },
    node_kaori_alarm_whirlpool: {
      speaker: '시스템 경고 (소용돌이 — 사옥 보안 경보 발동)',
      dialogue: '블루 카드 없이 전자 보안문을 강제로 열려다 적외선 경보가 울려 퍼졌다! 경비대가 들이닥치며 카오리와 함께 체포되는 막다른 소용돌이다.',
      inspect: '블루 카드 없이는 돌파 불가! 아유미 루트에서 블루 카드를 확보한 뒤 보옥 점프로 돌아와 잠입하자.',
    },
    node_kaori_infiltrate_lab: {
      speaker: '아리마 타쿠야',
      dialogue: '평행세계(아유미 루트)에서 가져온 블루 카드로 보안문을 돌파했다! 아버지 코다이의 연구실 프로젝터 뒤에서 네 번째 보옥을 발견하고, 시공을 공명시키는 신비한 광석 "초념석"까지 손에 넣었다!',
      inspect: '초념석은 미오 루트의 지하 유적과 칸나 루트의 생사 위기를 돌파하는 최중요 교차 계승 아이템이다.',
    },
    node_kaori_end: {
      speaker: '아사쿠라 카오리',
      dialogue: '취재와 잠입을 마친 카오리와의 시간축이 마무리되었다. 손안의 초념석이 푸르게 빛나며 또 다른 평행세계의 관문이 열렸음을 알린다.',
      inspect: '카오리 루트 클리어 완료! 이제 보옥 4와 초념석을 계승한 채 미오 루트와 칸나 루트로 도약할 수 있다.',
    },
    node_mio_branch: {
      speaker: '시마즈 미오',
      dialogue: '검도부 주장이자 향토사 마니아 시마즈 미오와 사당 앞에 섰다. 미오의 메모장과 목도를 챙긴 뒤 지하 동굴로 내려가려는데, 후배 유우키 마사카츠가 동행을 자청한다.',
      inspect: '리플렉터 점멸! 동굴 탐사 파트너로 유우키를 선택해야 흰/검은 메달 구역 웅덩이의 광점(보옥 5)에 도달할 수 있다.',
    },
    node_mio_cave_solo: {
      speaker: '시마즈 미오',
      dialogue: '유우키 없이 미오와 단둘이 어두운 사당 지하 동굴에 내려왔다. 격자 너머 웅덩이에는 손이 닿지 않고, 오른쪽 샛길에서는 불길한 지반 울림이 들려온다.',
      inspect: '이 분기에서는 보옥 5를 얻을 수 없다. 오른쪽 무너진 샛길은 낙반 함정이므로 제단으로 신중히 진입하거나, 보옥 점프로 돌아가 유우키를 동행하자.',
    },
    node_mio_cave_collapse_whirlpool: {
      speaker: '시스템 경고 (소용돌이 — 지하 동굴 낙반 조난)',
      dialogue: '어둠 속 샛길을 강행 돌파하다 천장이 무너져 내렸다! 탈출구가 완전히 매몰되며 미오와 함께 지하에 고립되는 비극적 소용돌이다.',
      inspect: '유우키 동행 분기에서 보옥 5와 메달을 챙기는 것이 정석이다. A.D.M.S. 보옥 점프로 사당 입구로 귀환하자.',
    },
    node_mio_cave_yuki: {
      speaker: '유우키 마사카츠',
      dialogue: '유우키와 함께 사당 지하 동굴 깊숙한 격자 앞 웅덩이를 수색했다. 물속에서 다섯 번째 보옥이 솟아올랐고, 유적 장치용 흰 메달과 검은 메달도 함께 회수했다!',
      inspect: '이제 남은 것은 유적 심부의 공명 제단뿐이다. 미츠키 루트의 은 메달과 카오리 루트의 초념석이 있다면 유적을 열 수 있다.',
    },
    node_mio_cave_puzzle: {
      speaker: '시마즈 미오',
      dialogue: '지하 유적 최심부의 고대 제단. 메달 홈과 공명석 홈이 비어 있다. "타쿠야, 여기엔 은으로 된 메달과 강한 염력을 띠는 돌이 필요한 것 같아."',
      inspect: '교차 계승 이중 관문! 미츠키 루트의 "은 메달"과 카오리 루트의 "초념석"을 모두 지니고 제단 핫스팟에 사용(또는 전진)하면 봉인이 풀린다.',
    },
    node_mio_coast_revelation: {
      speaker: '시마즈 미오',
      dialogue: '은 메달과 초념석이 눈부시게 공명하며 삼각산 400년 전승과 사카이마치 시마즈 가문이 지켜 온 고대 유적의 진상이 드러났다! 등대 너머 수평선에 기묘한 오로라가 일렁인다.',
      inspect: '삼각산 고대 석비 핫스팟에 미오의 메모장을 대조하면 400년 주기 사상 충돌의 경고를 확인할 수 있다.',
    },
    node_mio_end: {
      speaker: '시마즈 미오',
      dialogue: '400년 전승의 베일이 벗겨지며 미오와의 뜨거운 진실 추적은 한 매듭을 짓는다. 이제 남은 현세편 분기를 마무리하고 수렴을 준비하자.',
      inspect: '미오 루트 클리어 완료! 보옥 점프로 다른 평행세계로 이동하자.',
    },
    node_eriko_branch: {
      speaker: '다케다 에리코',
      dialogue: '사카이마치 학원 보건실. 늘 장난스럽던 양호교사 에리코가 텅 빈 보건실에서 정체불명의 기계를 급히 감추었다. 그녀의 눈빛이 평소와 전혀 다르다.',
      inspect: '리플렉터 점멸! 보건실 캐비닛의 은닉 차원 계측기 핫스팟을 조사해 에리코를 추궁하자. 경고를 무시하고 혼자 움직이면 위험하다.',
    },
    node_eriko_dismissed_whirlpool: {
      speaker: '시스템 경고 (소용돌이 — 차원 감사 기억 간섭)',
      dialogue: '에리코의 경고를 무시하고 시공 왜곡 지점에 무방비로 다가선 순간, 새하얀 섬광과 함께 타쿠야의 기억이 감사 프로토콜에 의해 초기화되었다...',
      inspect: '외부 차원의 개입! 보옥 점프로 보건실로 돌아가 은닉 차원 계측기를 통해 에리코의 진심을 직접 확인하자.',
    },
    node_eriko_infirmary_probe: {
      speaker: '다케다 에리코 (에이릭 쿼드로)',
      dialogue: '은닉 차원 계측기를 들이밀자 에리코는 미소 지으며 정체를 밝혔다. 그녀는 멀티버스 질서를 수호하는 외부 차원 감사관 "에이릭 쿼드로"이며, 류조지 코조의 육체를 탈취한 정신 기생체를 추적 중이었다!',
      inspect: '차원 범죄 파일을 통해 현세와 이세계(데라 그란트)가 사상 충돌 위기에 놓여 있음을 알게 되었다.',
    },
    node_eriko_end: {
      speaker: '다케다 에리코 (에이릭 쿼드로)',
      dialogue: '"기억해 둬, 타쿠야. 네가 모든 보옥을 채우고 세상의 끝에 닿을 때, 우리는 사상의 틈새에서 다시 만나게 될 거야." 차원 감사관의 진상이 A.D.M.S.에 기록되었다.',
      inspect: '에리코 루트 클리어 완료! 현세편 수렴 조건 중 하나인 차원 진상 플래그가 확보되었다.',
    },
    node_town_drunk_reacquire: {
      speaker: '아리마 타쿠야',
      dialogue: '시가지 상점가 뒷골목에서 비틀거리던 취객(호죠)과 정면으로 부딪쳤다! 바닥에 굴러떨어진 물건은 다름 아닌 "칸나의 학생수첩"이었다!',
      inspect: '원작의 핵심 재입수 구제 분기! 다른 시간축에서 칸나의 학생수첩을 소비했더라도 이 충돌 이벤트를 통해 글로벌 인벤토리에 학생수첩을 다시 확보할 수 있다.',
    },
    node_kanna_rooftop: {
      speaker: '하타노 칸나',
      dialogue: '학원 옥상에서 칸나에게 학생수첩을 돌려주었다. 그녀의 목에는 초념석 결정으로 만든 푸른 목걸이가 걸려 있다. 칸나는 타쿠야의 리플렉터를 보며 미세하게 떨었다.',
      inspect: '리플렉터 점멸! 칸나는 데라 그란트의 혈통과 깊은 연관이 있다. 종반 위기에 대비해 이곳에 보옥 세이브를 남겨 두자.',
    },
    node_kanna_solitude_home: {
      speaker: '하타노 칸나',
      dialogue: '칸나가 홀로 지내는 낡은 아파트. 그녀의 푸른 목걸이는 단순한 장신구가 아니라, 이 세계에서 칸나의 존재와 생명을 지탱하는 초념석 결정이었다.',
      inspect: '칸나의 안색이 급격히 창백해지고 있다. 목걸이의 빛이 꺼져 가는 이상 징후가 감지된다!',
    },
    node_kanna_hospital_crisis: {
      speaker: '아리마 타쿠야',
      dialogue: '갑작스러운 발작으로 쓰러진 칸나를 사카이마치 병원으로 옮겼지만, 현대 의학으로는 원인을 알 수 없다! 목걸이 결정이 산산이 금 가며 생명의 빛이 사라져 간다!',
      inspect: '리플렉터 긴급 점멸! 직후 관문에서 카오리 루트의 "초념석"이 없다면 칸나를 구할 수 없다. 보옥 세이브를 확인하자!',
    },
    node_kanna_crisis_gate: {
      speaker: '하타노 칸나',
      dialogue: '사카이마치 시가지와 병원 앞, 칸나의 발작이 임계점에 달했다! 그녀의 목걸이 결정이 완전히 꺼지기 전에 지금 당장 초념석으로 공명시켜야 한다!',
      inspect: '생사 교차 계승 관문! 카오리 루트에서 확보한 "초념석"을 칸나의 목걸이 핫스팟에 사용(또는 전진)하면 구명 성공 및 아버지 서재의 열쇠를 획득한다.',
    },
    node_kanna_bad_no_stone: {
      speaker: '시스템 경고 (소용돌이 — 칸나 구명 실패)',
      dialogue: '초념석이 없어 칸나의 발작을 멈추지 못했다... 눈앞에서 소중한 진실과 함께 이 시간축이 비극적인 소용돌이(Whirlpool)로 무너져 내린다.',
      inspect: '좌절할 필요 없다! A.D.M.S. 보옥 로드로 카오리 루트(초념석 획득)를 먼저 클리어한 뒤, 칸나 분기로 다시 점프해 초념석을 역계승하자!',
    },
    node_kanna_end: {
      speaker: '하타노 칸나',
      dialogue: '타쿠야가 꺼낸 초념석이 칸나의 목걸이와 공명하며 그녀를 죽음의 문턱에서 구해냈다. 정신을 차린 칸나는 코다이에게 맡겨 두었던 "아버지 서재의 열쇠"를 타쿠야에게 건넨다.',
      inspect: '결정적 역계승 아이템 "아버지 서재의 열쇠" 획득! 이제 A.D.M.S.로 가장 처음인 [본편 1일차 거점]으로 보옥 점프해 짐이 남아 있는 서재를 개방하자!',
    },
    node_study_unlock: {
      speaker: '아리마 타쿠야',
      dialogue: '칸나 루트에서 얻은 열쇠를 들고 본편 1일차 초기 시간대로 돌아왔다! 잠겨 있던 아버지 코다이의 서재 문이 열리자, 고풍스러운 괘종시계와 병렬세계 연구 수기가 그대로 모습을 드러냈다.',
      inspect: '아버지의 편지에 적혀 있던 단서 — 서재 괘종시계 핫스팟(6 → 3)을 클릭하거나 서재의 열쇠를 사용해 숨겨진 보옥 6을 개방하자!',
    },
    node_study_clock_puzzle: {
      speaker: '아리마 타쿠야',
      dialogue: '괘종시계의 문자판을 6에서 3으로 돌리자 숨겨진 장치가 열리며 마지막 여섯 번째 추가 보옥이 나타났다! 리플렉터 디바이스의 모든 슬롯이 눈부신 빛으로 완충되었다!',
      inspect: '전 보옥 수집 완료! 이제 서재 책상 위의 코다이 연구 수기 핫스팟을 열어 켄노미사키 시공 전이 좌표를 해독하자.',
    },
    node_study_kodai_manuscript: {
      speaker: '아리마 코다이 (연구 수기)',
      dialogue: '"타쿠야, 네 친어머니 케이코(케이티아)는 이세계 데라 그란트의 무녀였다. 모든 평행세계의 기억과 완충된 리플렉터를 품고 켄노미사키 삼각산 동굴로 향하라!"',
      inspect: '현세편 6개 히로인 루트를 모두 클리어하고 전 보옥을 모았다면, 이제 삼각산 동굴의 최종 수렴 관문이 열린다!',
    },
    node_convergence_cave: {
      speaker: '내레이션 (최종 수렴 — 켄노미사키)',
      dialogue: '여섯 갈래 평행세계의 기억과 완충된 리플렉터의 보옥이 한 점으로 공명한다. 삼각산 동굴 깊숙한 곳에 거대한 시공의 문이 열리고, 타쿠야는 미지의 이세계 "데라 그란트"로 빨려 들어간다!',
      inspect: '이세계편(데라 그란트)에 돌입하면 A.D.M.S. 병렬 점프는 봉인되고 단일 시간축의 대서사가 펼쳐진다. 준비가 되었다면 돌입하자!',
    },
    node_dg_arrival: {
      speaker: '아이리아 & 세레스',
      dialogue: '시공을 넘어 도착한 이세계 데라 그란트의 국경 "보더". 괴물의 습격 속에서 목소리를 잃은 무녀 세레스와 국경 여기사 아이리아를 만나 새로운 삶이 시작된다. (※ 이세계편에서는 A.D.M.S. 보옥 점프가 봉인됩니다.)',
      inspect: '하늘에는 두 개의 달이 떠 있고, 리플렉터 디바이스의 보옥 세이브 기능은 완전히 봉인되었다. 이제 눈앞의 현실을 한 걸음씩 헤쳐 나가야 한다.',
    },
    node_dg_frontier_yuno: {
      speaker: '세레스 & 유노',
      dialogue: '아이리아의 집에서 세레스와 평화로운 가정을 이루고 사랑스러운 딸 "유노"가 태어났으며, 충직한 생물 쿤쿤도 가족이 되었다. 그러나 행복도 잠시, 비극적인 습격으로 세레스를 잃은 타쿠야는 유노를 지키기 위해 제도를 향해 떠난다.',
      inspect: '유노의 손을 꼭 잡고 끝없는 라파엘로 사막 횡단을 준비하자.',
    },
    node_dg_desert_trek: {
      speaker: '유노',
      dialogue: '작열하는 라파엘로 사막 한가운데. 타쿠야는 유노의 손을 잡은 채 끝없이 모래 언덕을 걷고 있다. 원작 그대로 — 유노에게 끊임없이 말을 걸고 주변을 살피며 생존 물자를 관리해야 오아시스를 찾을 수 있다!',
      inspect: '하단의 [데라 그란트 사막 횡단 패널]에서 사막 전진(4회)·유노와 대화(3회)·주변 조사(2회)를 완수하면 오아시스 경로가 열립니다!',
    },
    node_dg_oasis_sarah: {
      speaker: '사라',
      dialogue: '극한의 사막을 돌파해 도착한 오아시스에서 분방한 여인 사라를 만났다. 그녀의 도움으로 기력을 되찾고 제도로 가는 길을 얻었지만, 직후 들른 신전에서 제도 근위병의 습격을 받아 유노와 생이별하고 만다!',
      inspect: '유노가 제도로 끌려가고 타쿠야는 강제노동소(성석 채굴장)로 이송된다. 반드시 살아남아 유노를 되찾아야 한다!',
    },
    node_dg_quarry_escape: {
      speaker: '바즈 & 쿤쿤',
      dialogue: '잔혹한 감독관 바즈의 성석 채굴장. 고된 노역 속에서 타쿠야는 현세의 초념석과 같은 기원을 지닌 "데라 그란트 성석"을 손에 넣었고, 쿤쿤과 동료들의 도움으로 채굴장을 극적으로 탈출했다!',
      inspect: '확보한 데라 그란트 성석을 품고 제도로 통하는 비밀 지하도 1로 잠입하자.',
    },
    node_dg_underground_1: {
      speaker: '아리마 타쿠야',
      dialogue: '거리에서 제도의 성으로 이어지는 지하도 1. 칠흑 같은 어둠 속에 석조 통로가 이어져 있다. 벽면의 레지스탕스 표식이 희미하게 보인다 — "끝까지 전진해 막다른 길에서 1칸 후퇴한 뒤 우측으로!"',
      inspect: '하단의 [제도 지하도 1 미궁 패널]에서 원작 패턴(전진 3회 → 막다른 길 확인 → 1칸 후퇴 → 우측 → 전진)을 입력해 돌파하세요!',
    },
    node_dg_underground_capital: {
      speaker: '아만다 & 신제(아유미)',
      dialogue: '지하도 1을 돌파해 제도에 입성하고 아이리아의 여동생이자 레지스탕스 리더 "아만다"와 합류했다. 그리고 제도 최고 통치자 "신제"의 정체가 다름 아닌 아유미이며, 현세와 데라 그란트가 사상 충돌 직전이라는 충격적 진실이 밝혀진다!',
      inspect: '배후에서 무녀 의식을 조종하던 류조지가 지하도 2로 도주했다. 즉시 뒤쫓아가자!',
    },
    node_dg_underground_2: {
      speaker: '아리마 타쿠야',
      dialogue: '도주한 류조지를 추격해 들어선 지하도 2! 샛길의 함정에 속지 말고, 발자국이 이어지는 앞쪽(거리·성당 방면)으로 곧장 돌진하라!',
      inspect: '하단의 [제도 지하도 2 추적 패널]에서 망설임 없이 전진(3회)을 실행해 성당으로 직행하세요!',
    },
    node_dg_sanctuary_climax: {
      speaker: '그란티아 & 에이릭 쿼드로',
      dialogue: '대성당 결전 끝에 사상 충돌을 막기 위해 시공의 경계 "사상의 틈새"에 도달했다. 출구 없는 최종방에서 타쿠야는 누군가에게 위탁했던 "빛나는 위탁 물품"이 어둠 속에서 찬란히 발광하는 것을 발견한다!',
      inspect: '성당 제단·발광 위탁물 핫스팟을 클릭하거나 "빛나는 위탁 물품"을 사용하면 사상의 틈새가 열리며 최종 진엔딩으로 이어진다!',
    },
    node_true_end: {
      speaker: '유노 (YU-NO)',
      dialogue: '"이 세상 끝에서, 사랑을 노래할게..." 현세와 데라 그란트, 코다이와 케이코, 에리코, 그리고 딸 유노까지 — 모든 병렬세계의 인과가 부린더의 나무 아래 하나의 기적으로 이어지며 장대한 이야기가 대단원의 막을 내린다.',
      inspect: '축하합니다! 『경계 저편에서 사랑을 노래하는 소녀 호라이즌』 트루 엔딩 달성! 60개 A.D.M.S. 노드, 6개 광점 보옥, 5대 교차 계승, 데라 그란트 대서사를 완주했습니다.',
    },
  };

  function YunoEngine(data, options) {
    this.data = data || defaultGlobalData;
    if (!this.data || !Array.isArray(this.data.nodes)) {
      throw new Error('YunoEngine requires valid YUNO_DATA bundle.');
    }

    options = options || {};
    this._indexData();
    this.reset({ edition: options.edition || 'pc98_8jewels' });
  }

  YunoEngine.prototype._indexData = function () {
    var d = this.data;
    this.nodeMap = {};
    this.locationMap = {};
    this.characterMap = {};
    this.routeMap = {};
    this.endingMap = {};
    this.endingByNodeMap = {};
    this.itemMap = {};
    this.jewelMap = {};
    this.globalFlagMap = {};
    this.localFlagMap = {};
    this.transferMap = {};
    this.hotspotMap = {};
    this.hotspotsByLocation = {};
    this.puzzleMap = {};
    this.puzzleByNodeMap = {};

    d.nodes.forEach(function (n) { this.nodeMap[n.id] = n; }, this);
    d.locations.forEach(function (l) { this.locationMap[l.id] = l; }, this);
    d.characters.forEach(function (c) { this.characterMap[c.id] = c; }, this);
    d.routes.forEach(function (r) { this.routeMap[r.id] = r; }, this);
    d.endings.forEach(function (e) {
      this.endingMap[e.id] = e;
      this.endingByNodeMap[e.terminal_node_id] = e;
    }, this);
    d.items.forEach(function (i) { this.itemMap[i.id] = i; }, this);
    d.jewels.forEach(function (j) { this.jewelMap[j.id] = j; }, this);
    d.globalFlags.forEach(function (f) { this.globalFlagMap[f.id] = f; }, this);
    d.localFlags.forEach(function (f) { this.localFlagMap[f.id] = f; }, this);
    d.crossRouteTransfers.forEach(function (t) { this.transferMap[t.id] = t; }, this);

    (d.sceneHotspots || []).forEach(function (hs) {
      this.hotspotMap[hs.id] = hs;
      if (!this.hotspotsByLocation[hs.location_id]) {
        this.hotspotsByLocation[hs.location_id] = [];
      }
      this.hotspotsByLocation[hs.location_id].push(hs);
    }, this);

    (d.isekaiPuzzles || []).forEach(function (p) {
      this.puzzleMap[p.id] = p;
      this.puzzleByNodeMap[p.node_id] = p;
    }, this);

    this.findableJewelIds = d.jewels
      .filter(function (j) { return j.category === 'findable'; })
      .map(function (j) { return j.id; });
  };

  YunoEngine.prototype._getInitialJewelsForEdition = function (edition) {
    var norm = normalizeEdition(edition);
    return this.data.jewels
      .filter(function (j) {
        if (j.category === 'initial') return true;
        if (norm === 'remake_10jewels' && j.category === 'initial_extended') return true;
        return false;
      })
      .map(function (j) { return j.id; });
  };

  YunoEngine.prototype._recalcAvailableJewels = function () {
    var total = this.globalState.initialJewels.length + this.globalState.collectedLightJewels.length;
    var placedCount = Object.keys(this.globalState.placedJewels).length;
    this.globalState.availableJewels = total - placedCount;
    return this.globalState.availableJewels;
  };

  YunoEngine.prototype._pushLog = function (type, message, nodeId) {
    this.globalState.stepCount += 1;
    this.globalState.actionLog.push({
      step: this.globalState.stepCount,
      type: type,
      nodeId: nodeId || (this.localState ? this.localState.currentNodeId : null),
      message: message,
    });
    if (this.globalState.actionLog.length > MAX_LOG_ENTRIES) {
      this.globalState.actionLog.shift();
    }
  };

  YunoEngine.prototype.reset = function (options) {
    options = options || {};
    var edition = normalizeEdition(options.edition || (this.globalState && this.globalState.edition) || 'pc98_8jewels');
    var cfg = EDITION_CONFIG[edition];
    var initialJewels = this._getInitialJewelsForEdition(edition);
    var rootNode = this.nodeMap[this.data.rootNodeId];

    this.globalState = {
      edition: edition,
      reflectorDevice: deepClone(this.data.reflectorDevice),
      jewelCapacity: cfg.capacity,
      initialJewels: initialJewels,
      collectedLightJewels: [],
      availableJewels: initialJewels.length,
      placedJewels: {},
      carriedItems: [],
      consumedItems: [],
      globalFlags: [],
      discoveredNodes: [],
      discoveredEdges: [],
      unlockedEndings: [],
      completedTransfers: [],
      jumpCount: 0,
      stepCount: 0,
      actionLog: [],
    };

    this.localState = {
      currentNodeId: rootNode.id,
      locationId: rootNode.location_id,
      localItems: [],
      localFlags: [],
      inspectedNodes: [],
      inspectedHotspots: [],
      usedItemsAtNode: [],
      takenPickups: [],
      isekaiState: createInitialIsekaiState(),
      sceneStep: 0,
      isVortexDeadEnd: false,
      isEnding: false,
      activeEndingId: null,
    };

    this._applyNodeEntryEffects(rootNode, null);
    this._pushLog('init', 'A.D.M.S. 시뮬레이션 시작 (' + cfg.labelKo + ')', rootNode.id);
    return this.getSnapshot();
  };

  YunoEngine.prototype.setEdition = function (edition) {
    var norm = normalizeEdition(edition);
    var cfg = EDITION_CONFIG[norm];
    var nextInitial = this._getInitialJewelsForEdition(norm);
    var nextTotal = nextInitial.length + this.globalState.collectedLightJewels.length;
    var placedCount = Object.keys(this.globalState.placedJewels).length;

    if (placedCount > nextTotal) {
      return {
        ok: false,
        error: '현재 배치된 보옥(' + placedCount + '개)이 전환 대상 버전의 보유 보옥(' + nextTotal + '개)보다 많아 전환할 수 없습니다. 보옥을 먼저 회수하세요.',
      };
    }

    this.globalState.edition = norm;
    this.globalState.jewelCapacity = cfg.capacity;
    this.globalState.initialJewels = nextInitial;
    this._recalcAvailableJewels();
    this._pushLog('edition', '버전 모드 전환: ' + cfg.labelKo);
    return {
      ok: true,
      edition: norm,
      jewelCapacity: cfg.capacity,
      availableJewels: this.globalState.availableJewels,
    };
  };

  YunoEngine.prototype.getTotalCollectedJewels = function () {
    return this.globalState.initialJewels.length + this.globalState.collectedLightJewels.length;
  };

  YunoEngine.prototype.getAvailableJewels = function () {
    return this._recalcAvailableJewels();
  };

  YunoEngine.prototype.isIsekaiLocked = function () {
    var node = this.getCurrentNode();
    return Boolean(node && node.route_id === 'route_isekai');
  };

  YunoEngine.prototype.getCurrentNode = function () {
    return this.nodeMap[this.localState.currentNodeId] || null;
  };

  YunoEngine.prototype.getCurrentLocation = function () {
    return this.locationMap[this.localState.locationId] || null;
  };

  YunoEngine.prototype.getCurrentRoute = function () {
    var node = this.getCurrentNode();
    return node ? (this.routeMap[node.route_id] || null) : null;
  };

  YunoEngine.prototype.getActiveEnding = function () {
    return this.localState.activeEndingId ? (this.endingMap[this.localState.activeEndingId] || null) : null;
  };

  YunoEngine.prototype.getSceneCharacters = function () {
    var node = this.getCurrentNode();
    if (!node) return [];
    var route = this.routeMap[node.route_id];
    var chars = [];
    var seen = {};
    var addChar = function (id) {
      if (id && !seen[id] && this.characterMap[id]) {
        seen[id] = true;
        chars.push(this.characterMap[id]);
      }
    }.bind(this);

    addChar('char_takuya');
    if (route && route.primary_character_id) {
      addChar(route.primary_character_id);
    }
    this.data.characters.forEach(function (c) {
      if (c.first_location_id === node.location_id || c.primary_route_id === node.route_id) {
        addChar(c.id);
      }
    });
    return chars.slice(0, 4);
  };

  YunoEngine.prototype.getNarrativeBeat = function (nodeId) {
    var id = nodeId || this.localState.currentNodeId;
    var script = NODE_SCRIPT[id];
    var node = this.nodeMap[id];
    if (script) {
      return deepClone(script);
    }
    return {
      speaker: '아리마 타쿠야',
      dialogue: node ? node.title_ko : '',
      inspect: '주변을 주의 깊게 살펴보았다.',
    };
  };

  YunoEngine.prototype.getJewelSlots = function () {
    var placedNodeIds = Object.keys(this.globalState.placedJewels);
    var collectedIds = this.globalState.initialJewels.concat(this.globalState.collectedLightJewels);
    var slots = [];
    var remainingFindable = this.findableJewelIds.filter(function (jid) {
      return this.globalState.collectedLightJewels.indexOf(jid) === -1;
    }, this);

    for (var i = 0; i < this.globalState.jewelCapacity; i++) {
      if (i < collectedIds.length) {
        var jid = collectedIds[i];
        var placedIdx = i - (collectedIds.length - placedNodeIds.length);
        var isPlaced = placedIdx >= 0;
        slots.push({
          slotIndex: i + 1,
          jewelId: jid,
          jewel: this.jewelMap[jid] || null,
          status: isPlaced ? 'placed' : 'available',
          placedNodeId: isPlaced ? placedNodeIds[placedIdx] : null,
        });
      } else {
        var lockedIdx = i - collectedIds.length;
        var lockedJewelId = remainingFindable[lockedIdx] || null;
        slots.push({
          slotIndex: i + 1,
          jewelId: lockedJewelId,
          jewel: lockedJewelId ? (this.jewelMap[lockedJewelId] || null) : null,
          status: 'locked',
          placedNodeId: null,
        });
      }
    }
    return slots;
  };

  YunoEngine.prototype._hasItem = function (itemId) {
    return (
      this.globalState.carriedItems.indexOf(itemId) !== -1 ||
      this.localState.localItems.indexOf(itemId) !== -1
    );
  };

  YunoEngine.prototype.evaluateEdge = function (edge) {
    var self = this;
    var missingItems = (edge.requires_items || []).filter(function (id) {
      return !self._hasItem(id);
    }).map(function (id) {
      var item = self.itemMap[id];
      var srcRoute = item ? self.routeMap[item.source_route_id] : null;
      return {
        id: id,
        name_ko: item ? item.name_ko : id,
        source_route_id: item ? item.source_route_id : null,
        source_route_name: srcRoute ? srcRoute.name_ko : null,
      };
    });

    var missingGlobalFlags = (edge.requires_global_flags || []).filter(function (f) {
      return self.globalState.globalFlags.indexOf(f) === -1;
    }).map(function (f) {
      var flag = self.globalFlagMap[f];
      return { id: f, name_ko: flag ? flag.name_ko : f };
    });

    var missingLocalFlags = (edge.requires_local_flags || []).filter(function (f) {
      return self.localState.localFlags.indexOf(f) === -1;
    }).map(function (f) {
      var flag = self.localFlagMap[f];
      return { id: f, name_ko: flag ? flag.name_ko : f };
    });

    var blockedByLocalFlags = (edge.forbids_local_flags || []).filter(function (f) {
      return self.localState.localFlags.indexOf(f) !== -1;
    }).map(function (f) {
      var flag = self.localFlagMap[f];
      return { id: f, name_ko: flag ? flag.name_ko : f };
    });

    var missingJewelCount = 0;
    if (edge.edge_type === 'convergence' || edge.to === 'node_convergence_cave') {
      missingJewelCount = Math.max(0, this.findableJewelIds.length - this.globalState.collectedLightJewels.length);
    }

    var lockReasons = [];
    missingItems.forEach(function (it) {
      var hint = it.source_route_name ? ' (' + it.source_route_name + '에서 획득 후 계승)' : '';
      lockReasons.push('필요 아이템 미보유: ' + it.name_ko + hint);
    });
    if (missingJewelCount > 0) {
      lockReasons.push('추가 발견 보옥 부족: ' + this.globalState.collectedLightJewels.length + '/6 (' + missingJewelCount + '개 더 필요)');
    }
    missingGlobalFlags.forEach(function (gf) {
      lockReasons.push('필요 글로벌 플래그 미충족: ' + gf.name_ko);
    });
    missingLocalFlags.forEach(function (lf) {
      lockReasons.push('필요 로컬 시간축 조건 미충족: ' + lf.name_ko);
    });
    blockedByLocalFlags.forEach(function (bf) {
      lockReasons.push('순서 함정으로 차단됨: ' + bf.name_ko);
    });

    var unlocked =
      missingItems.length === 0 &&
      missingGlobalFlags.length === 0 &&
      missingLocalFlags.length === 0 &&
      blockedByLocalFlags.length === 0 &&
      missingJewelCount === 0;

    return {
      to: edge.to,
      targetNode: this.nodeMap[edge.to] || null,
      label_ko: edge.label_ko,
      edge_type: edge.edge_type,
      unlocked: unlocked,
      missingItems: missingItems,
      missingGlobalFlags: missingGlobalFlags,
      missingLocalFlags: missingLocalFlags,
      blockedByLocalFlags: blockedByLocalFlags,
      missingJewelCount: missingJewelCount,
      lockReasons: lockReasons,
    };
  };

  YunoEngine.prototype.getAvailableTransitions = function () {
    var node = this.getCurrentNode();
    if (!node || !Array.isArray(node.edges)) return [];
    return node.edges.map(function (edge) {
      return this.evaluateEdge(edge);
    }, this);
  };

  YunoEngine.prototype._applyNodeEntryEffects = function (node, edgeUsed) {
    var newlyGrantedItems = [];
    var newlyGrantedJewel = null;
    var newlySetGlobalFlags = [];
    var newlySetLocalFlags = [];
    var triggeredTransfers = [];
    var unlockedEnding = null;

    addUnique(this.globalState.discoveredNodes, node.id);

    // Grants items (canonical YU-NO rule: consumed items never resurrect EXCEPT Kanna's Student ID via Drunk Collision branch!)
    (node.grants_items || []).forEach(function (itemId) {
      var item = this.itemMap[itemId];
      if (!item) return;
      var pickupKey = node.id + ':' + itemId;
      if (item.carries_across_timelines) {
        var isCanonicalDrunkRecovery = node.id === 'node_town_drunk_reacquire' && itemId === 'item_kanna_student_id';
        if (isCanonicalDrunkRecovery) {
          removeValue(this.globalState.consumedItems, itemId);
          if (addUnique(this.globalState.carriedItems, itemId)) {
            newlyGrantedItems.push(item);
          }
          addUnique(this.localState.takenPickups, pickupKey);
          return;
        }
        var alreadyTakenAtSnapshot = this.localState.takenPickups.indexOf(pickupKey) !== -1;
        var alreadyConsumed = this.globalState.consumedItems.indexOf(itemId) !== -1;
        if (!alreadyTakenAtSnapshot && !alreadyConsumed && addUnique(this.globalState.carriedItems, itemId)) {
          newlyGrantedItems.push(item);
        }
        addUnique(this.localState.takenPickups, pickupKey);
      } else {
        if (addUnique(this.localState.localItems, itemId)) {
          newlyGrantedItems.push(item);
        }
        addUnique(this.localState.takenPickups, pickupKey);
      }
    }, this);

    // Grants discoverable light jewel
    if (node.grants_jewel) {
      if (addUnique(this.globalState.collectedLightJewels, node.grants_jewel)) {
        newlyGrantedJewel = this.jewelMap[node.grants_jewel] || { id: node.grants_jewel };
        this._recalcAvailableJewels();
      }
    }

    // Sets local flags
    (node.sets_local_flags || []).forEach(function (lf) {
      if (addUnique(this.localState.localFlags, lf)) {
        newlySetLocalFlags.push(this.localFlagMap[lf] || { id: lf });
      }
    }, this);

    // Sets global flags
    (node.sets_global_flags || []).forEach(function (gf) {
      if (gf === 'flag_global_all_jewels_collected' && this.globalState.collectedLightJewels.length < this.findableJewelIds.length) {
        return;
      }
      if (addUnique(this.globalState.globalFlags, gf)) {
        newlySetGlobalFlags.push(this.globalFlagMap[gf] || { id: gf });
      }
    }, this);

    // Auto-grant flag_global_all_jewels_collected if player gathered all 6 light jewels in any order
    if (this.globalState.collectedLightJewels.length === this.findableJewelIds.length) {
      if (addUnique(this.globalState.globalFlags, 'flag_global_all_jewels_collected')) {
        newlySetGlobalFlags.push(this.globalFlagMap.flag_global_all_jewels_collected);
      }
    }

    // Track cross-route transfers completed when crossing an unlocked cross_timeline_unlock edge
    if (edgeUsed && edgeUsed.edge_type === 'cross_timeline_unlock') {
      var fromId = edgeUsed.from;
      var toId = node.id;
      this.data.crossRouteTransfers.forEach(function (xfer) {
        if (
          (xfer.target_gate_node_id === fromId || xfer.target_gate_node_id === toId || xfer.unlock_node_id === toId) &&
          this._hasItem(xfer.carried_item_id)
        ) {
          if (addUnique(this.globalState.completedTransfers, xfer.id)) {
            triggeredTransfers.push(xfer);
          }
        }
      }, this);
    }

    // Vortex dead-end & ending status
    this.localState.isVortexDeadEnd = node.node_type === 'whirlpool';
    this.localState.isEnding = node.node_type === 'route_end' || node.node_type === 'true_end';

    var ending = this.endingByNodeMap[node.id] || null;
    this.localState.activeEndingId = ending ? ending.id : null;
    if (ending && addUnique(this.globalState.unlockedEndings, ending.id)) {
      unlockedEnding = ending;
    }

    return {
      newlyGrantedItems: newlyGrantedItems,
      newlyGrantedJewel: newlyGrantedJewel,
      newlySetGlobalFlags: newlySetGlobalFlags,
      newlySetLocalFlags: newlySetLocalFlags,
      triggeredTransfers: triggeredTransfers,
      unlockedEnding: unlockedEnding,
    };
  };

  YunoEngine.prototype.advanceToNode = function (targetNodeId) {
    var currentNode = this.getCurrentNode();
    if (!currentNode) {
      return { ok: false, error: '현재 노드를 찾을 수 없습니다.' };
    }
    var rawEdge = (currentNode.edges || []).find(function (e) { return e.to === targetNodeId; });
    if (!rawEdge) {
      return { ok: false, error: '현재 노드(' + currentNode.id + ')에서 ' + targetNodeId + '로 이동하는 분기가 없습니다.' };
    }

    var evalResult = this.evaluateEdge(rawEdge);
    if (!evalResult.unlocked) {
      return {
        ok: false,
        error: '관문이 잠겨 있습니다: ' + evalResult.lockReasons.join(' / '),
        evaluation: evalResult,
      };
    }

    var targetNode = this.nodeMap[targetNodeId];
    var edgeKey = currentNode.id + '->' + targetNodeId;
    addUnique(this.globalState.discoveredEdges, edgeKey);

    this.localState.currentNodeId = targetNode.id;
    this.localState.locationId = targetNode.location_id;
    this.localState.sceneStep += 1;

    var effects = this._applyNodeEntryEffects(targetNode, {
      from: currentNode.id,
      to: targetNode.id,
      edge_type: rawEdge.edge_type,
    });

    this._pushLog('advance', targetNode.title_ko, targetNode.id);

    if (effects.newlyGrantedJewel) {
      this._pushLog('jewel', '광점 보옥 획득: ' + effects.newlyGrantedJewel.name_ko, targetNode.id);
    }
    effects.triggeredTransfers.forEach(function (xfer) {
      var item = this.itemMap[xfer.carried_item_id];
      this._pushLog('transfer', '교차 계승 발동: ' + (item ? item.name_ko : xfer.carried_item_id), targetNode.id);
    }, this);
    if (effects.unlockedEnding) {
      this._pushLog('ending', '엔딩 기록: ' + effects.unlockedEnding.title_ko, targetNode.id);
    }

    return {
      ok: true,
      node: targetNode,
      location: this.getCurrentLocation(),
      route: this.getCurrentRoute(),
      newlyGrantedItems: effects.newlyGrantedItems,
      newlyGrantedJewel: effects.newlyGrantedJewel,
      newlySetGlobalFlags: effects.newlySetGlobalFlags,
      newlySetLocalFlags: effects.newlySetLocalFlags,
      triggeredTransfers: effects.triggeredTransfers,
      unlockedEnding: effects.unlockedEnding,
    };
  };

  YunoEngine.prototype.placeJewel = function (nodeId) {
    var targetId = nodeId || this.localState.currentNodeId;
    var node = this.nodeMap[targetId];
    if (!node) {
      return { ok: false, error: '알 수 없는 노드입니다: ' + targetId };
    }
    if (this.isIsekaiLocked() || node.route_id === 'route_isekai') {
      return { ok: false, error: '이세계편(데라 그란트)에서는 A.D.M.S. 보옥 세이브가 봉인되어 사용할 수 없습니다.' };
    }
    if (targetId !== this.localState.currentNodeId) {
      return { ok: false, error: '보옥 세이브는 현재 위치(' + this.localState.currentNodeId + ')에만 배치할 수 있습니다.' };
    }
    if (this.localState.isVortexDeadEnd) {
      return { ok: false, error: '소용돌이(막다른 길)에는 보옥 세이브를 배치할 수 없습니다.' };
    }

    var alreadyPlaced = Object.prototype.hasOwnProperty.call(this.globalState.placedJewels, targetId);
    if (!alreadyPlaced && this.getAvailableJewels() <= 0) {
      return { ok: false, error: '가용 보옥이 부족합니다. 기존 보옥을 회수하거나 광점에서 새 보옥을 확보하세요.' };
    }

    this.globalState.placedJewels[targetId] = deepClone(this.localState);
    this._recalcAvailableJewels();
    this._pushLog(
      'place_jewel',
      (alreadyPlaced ? '보옥 스냅샷 갱신: ' : '보옥 세이브 배치: ') + node.title_ko + ' (잔여 ' + this.globalState.availableJewels + '개)',
      targetId
    );

    return {
      ok: true,
      nodeId: targetId,
      overwritten: alreadyPlaced,
      availableJewels: this.globalState.availableJewels,
      placedCount: Object.keys(this.globalState.placedJewels).length,
    };
  };

  YunoEngine.prototype.jumpToJewel = function (nodeId, options) {
    options = options || {};
    if (this.isIsekaiLocked()) {
      return { ok: false, error: '이세계편(데라 그란트)에서는 리플렉터 점프가 봉인되어 있습니다.' };
    }
    var snapshot = this.globalState.placedJewels[nodeId];
    if (!snapshot) {
      return { ok: false, error: '노드(' + nodeId + ')에 배치된 보옥 세이브가 없습니다.' };
    }

    var fromNodeId = this.localState.currentNodeId;
    var targetNode = this.nodeMap[nodeId];
    var keepPlaced = Boolean(options.keepPlaced);

    if (!keepPlaced) {
      delete this.globalState.placedJewels[nodeId];
    }

    // Core YU-NO Asymmetric State Partition:
    // - localState restores from snapshot
    // - globalState persists across parallel worlds
    this.localState = deepClone(snapshot);
    if (!Array.isArray(this.localState.inspectedHotspots)) {
      this.localState.inspectedHotspots = [];
    }
    if (!this.localState.isekaiState) {
      this.localState.isekaiState = createInitialIsekaiState();
    }
    this.globalState.jumpCount += 1;
    this._recalcAvailableJewels();

    this._pushLog(
      'jump_jewel',
      '리플렉터 점프 -> ' + (targetNode ? targetNode.title_ko : nodeId) +
        (keepPlaced ? ' (앵커 유지)' : ' (보옥 1개 회수, 잔여 ' + this.globalState.availableJewels + '개)'),
      nodeId
    );

    var recommendRePin = !keepPlaced && (nodeId === 'node_day1_hub' || nodeId === 'node_school_day1_gate');
    return {
      ok: true,
      fromNodeId: fromNodeId,
      toNodeId: nodeId,
      node: targetNode,
      reclaimedJewel: !keepPlaced,
      availableJewels: this.globalState.availableJewels,
      recommendRePin: recommendRePin,
      preservedCarriedItems: this.globalState.carriedItems.slice(),
      preservedGlobalFlags: this.globalState.globalFlags.slice(),
    };
  };

  YunoEngine.prototype.retrieveJewel = function (nodeId) {
    if (this.isIsekaiLocked()) {
      return { ok: false, error: '이세계편(데라 그란트)에서는 보옥 회수를 사용할 수 없습니다.' };
    }
    if (!Object.prototype.hasOwnProperty.call(this.globalState.placedJewels, nodeId)) {
      return { ok: false, error: '노드(' + nodeId + ')에 회수할 보옥이 없습니다.' };
    }
    var node = this.nodeMap[nodeId];
    delete this.globalState.placedJewels[nodeId];
    this._recalcAvailableJewels();
    this._pushLog(
      'retrieve_jewel',
      '보옥 원격 회수: ' + (node ? node.title_ko : nodeId) + ' (잔여 ' + this.globalState.availableJewels + '개)',
      nodeId
    );
    return {
      ok: true,
      nodeId: nodeId,
      availableJewels: this.globalState.availableJewels,
    };
  };

  YunoEngine.prototype.emergencyRecallToHub = function () {
    if (this.isIsekaiLocked()) {
      return { ok: false, error: '이세계편에서는 비상 귀환을 사용할 수 없습니다.' };
    }
    if (Object.keys(this.globalState.placedJewels).length > 0) {
      return { ok: false, error: '배치된 보옥이 존재합니다. A.D.M.S. 맵에서 보옥 점프를 사용하세요.' };
    }
    if (!this.localState.isVortexDeadEnd && !this.localState.isEnding) {
      return { ok: false, error: '비상 귀환은 배치된 보옥 없이 막다른 길/엔딩에 도달했을 때만 사용할 수 있습니다.' };
    }
    var hub = this.nodeMap.node_day1_hub;
    this.localState = {
      currentNodeId: hub.id,
      locationId: hub.location_id,
      localItems: [],
      localFlags: ['flag_local_study_early_luggage_intact'],
      inspectedNodes: [],
      inspectedHotspots: [],
      usedItemsAtNode: [],
      takenPickups: [],
      isekaiState: createInitialIsekaiState(),
      sceneStep: 0,
      isVortexDeadEnd: false,
      isEnding: false,
      activeEndingId: null,
    };
    this._pushLog('recall', '비상 리플렉터 귀환: 1일차 거점으로 복구 (글로벌 상태 유지)', hub.id);
    return { ok: true, node: hub };
  };

  YunoEngine.prototype.inspectLocation = function () {
    var node = this.getCurrentNode();
    var loc = this.getCurrentLocation();
    var beat = this.getNarrativeBeat(node.id);
    addUnique(this.localState.inspectedNodes, node.id);
    this.localState.sceneStep += 1;

    var hints = [];
    if (node.reflector_blinks) {
      hints.push('⚡ 리플렉터 하단 보옥 점멸 중 — 중대한 분기 직전이므로 보옥 세이브 설치를 권장합니다.');
    }
    if (loc && loc.has_jewel_pickup && loc.jewel_id) {
      var collected = this.globalState.collectedLightJewels.indexOf(loc.jewel_id) !== -1;
      var jObj = this.jewelMap[loc.jewel_id];
      hints.push(
        collected
          ? '✨ 이 장소의 광점 보옥(' + (jObj ? jObj.name_ko : loc.jewel_id) + ')은 이미 회수 완료했습니다.'
          : '✨ 광점 반응 감지: ' + (jObj ? jObj.condition_ko : '숨겨진 보옥이 있습니다.')
      );
    }
    var hotspots = this.getHotspotsForCurrentScene();
    if (hotspots.length > 0) {
      hints.push('🎯 조사 가능 핫스팟: ' + hotspots.map(function (h) { return h.label_ko; }).join(', '));
    }
    var transitions = this.getAvailableTransitions();
    transitions.forEach(function (tr) {
      if (!tr.unlocked && tr.lockReasons.length > 0) {
        hints.push('🔒 [' + tr.label_ko + '] → ' + tr.lockReasons[0]);
      }
    });

    this._pushLog('inspect', '현장 조사: ' + (loc ? loc.name_ko : node.id), node.id);
    return {
      ok: true,
      nodeId: node.id,
      location: loc,
      text: beat.inspect,
      hints: hints,
    };
  };

  /* ---------- Phase 2: Interactive Spatial Hotspot Exploration ---------- */
  YunoEngine.prototype.getHotspotsForCurrentScene = function () {
    var locId = this.localState.locationId;
    var list = this.hotspotsByLocation[locId] || [];
    var transitions = this.getAvailableTransitions();
    var self = this;

    return list.map(function (hs) {
      var inspected = self.localState.inspectedHotspots.indexOf(hs.id) !== -1;
      var matchingHeldItems = (hs.item_interactions || [])
        .filter(function (inter) { return self._hasItem(inter.item_id); })
        .map(function (inter) { return inter.item_id; });
      var canClickAdvance = Boolean(
        hs.click_advances_to &&
        transitions.some(function (t) { return t.to === hs.click_advances_to && t.unlocked; })
      );
      return {
        id: hs.id,
        location_id: hs.location_id,
        label_ko: hs.label_ko,
        x: hs.x,
        y: hs.y,
        inspect_ko: hs.inspect_ko,
        click_advances_to: hs.click_advances_to || null,
        item_interactions: deepClone(hs.item_interactions || []),
        inspected: inspected,
        matchingHeldItems: matchingHeldItems,
        canClickAdvance: canClickAdvance,
      };
    });
  };

  YunoEngine.prototype.inspectHotspot = function (hotspotId, options) {
    options = options || {};
    var hs = this.hotspotMap[hotspotId];
    if (!hs) {
      return { ok: false, error: '알 수 없는 핫스팟입니다: ' + hotspotId };
    }
    if (hs.location_id !== this.localState.locationId) {
      return { ok: false, error: '현재 위치에 존재하지 않는 핫스팟입니다: ' + hs.label_ko };
    }

    addUnique(this.localState.inspectedHotspots, hs.id);
    this.localState.sceneStep += 1;

    var currentNode = this.getCurrentNode();
    var rawEdge = hs.click_advances_to
      ? (currentNode.edges || []).find(function (e) { return e.to === hs.click_advances_to; })
      : null;

    if (rawEdge && !options.inspectOnly) {
      var evalRes = this.evaluateEdge(rawEdge);
      if (evalRes.unlocked) {
        var adv = this.advanceToNode(hs.click_advances_to);
        if (adv.ok) {
          this._pushLog('hotspot', '핫스팟 발견 돌파 [' + hs.label_ko + '] → ' + adv.node.title_ko, adv.node.id);
          return {
            ok: true,
            action: 'advance',
            hotspot: deepClone(hs),
            text: hs.inspect_ko,
            message: '🎯 [' + hs.label_ko + '] 조사 완료 → ' + adv.node.title_ko,
            transition: adv,
          };
        }
      }
    }

    var matchingItems = (hs.item_interactions || [])
      .filter(function (inter) { return this._hasItem(inter.item_id); }, this)
      .map(function (inter) { return this.itemMap[inter.item_id]; }, this)
      .filter(Boolean);

    this._pushLog('hotspot', '핫스팟 조사: ' + hs.label_ko, this.localState.currentNodeId);
    return {
      ok: true,
      action: 'inspect',
      hotspot: deepClone(hs),
      text: hs.inspect_ko,
      message: '🎯 [' + hs.label_ko + '] ' + hs.inspect_ko,
      matchingHeldItems: matchingItems,
    };
  };

  YunoEngine.prototype.useItemOnHotspot = function (itemId, hotspotId) {
    var item = this.itemMap[itemId];
    if (!item) {
      return { ok: false, error: '알 수 없는 아이템입니다: ' + itemId };
    }
    if (!this._hasItem(itemId)) {
      return { ok: false, error: '소지하고 있지 않은 아이템입니다: ' + item.name_ko };
    }
    var hs = this.hotspotMap[hotspotId];
    if (!hs) {
      return { ok: false, error: '알 수 없는 핫스팟입니다: ' + hotspotId };
    }
    if (hs.location_id !== this.localState.locationId) {
      return { ok: false, error: '현재 위치에 존재하지 않는 핫스팟입니다: ' + hs.label_ko };
    }

    addUnique(this.localState.inspectedHotspots, hs.id);
    addUnique(this.localState.usedItemsAtNode, this.localState.currentNodeId + ':' + itemId + '@' + hs.id);
    this.localState.sceneStep += 1;

    var inter = (hs.item_interactions || []).find(function (entry) { return entry.item_id === itemId; });
    if (!inter) {
      this._pushLog('hotspot_item', hs.label_ko + '에 ' + item.name_ko + ' 사용 (반응 없음)', this.localState.currentNodeId);
      return {
        ok: true,
        action: 'noop',
        item: item,
        hotspot: deepClone(hs),
        message: '[' + hs.label_ko + ']에는 "' + item.name_ko + '"이(가) 맞지 않는 것 같다. (' + item.paradox_risk_note_ko + ')',
      };
    }

    if (inter.grants_local_flag) {
      addUnique(this.localState.localFlags, inter.grants_local_flag);
    }

    if (inter.unlocks_node_id) {
      var currentNode = this.getCurrentNode();
      var rawEdge = (currentNode.edges || []).find(function (e) { return e.to === inter.unlocks_node_id; });
      if (rawEdge) {
        var evalRes = this.evaluateEdge(rawEdge);
        if (evalRes.unlocked) {
          var adv = this.advanceToNode(inter.unlocks_node_id);
          if (adv.ok) {
            this._pushLog('hotspot_item', '[' + hs.label_ko + '] + ' + item.name_ko + ' → ' + adv.node.title_ko, adv.node.id);
            return {
              ok: true,
              action: 'advance',
              item: item,
              hotspot: deepClone(hs),
              message: inter.response_ko,
              transition: adv,
            };
          }
        } else {
          this._pushLog('hotspot_item', '[' + hs.label_ko + '] + ' + item.name_ko + ' (추가 조건 필요)', this.localState.currentNodeId);
          return {
            ok: true,
            action: 'hint',
            item: item,
            hotspot: deepClone(hs),
            message: '반응이 느껴지지만 아직 조건이 부족하다: ' + evalRes.lockReasons.join(' / '),
          };
        }
      }
    }

    this._pushLog('hotspot_item', '[' + hs.label_ko + '] + ' + item.name_ko + ' 단서 확인', this.localState.currentNodeId);
    return {
      ok: true,
      action: 'clue',
      item: item,
      hotspot: deepClone(hs),
      message: inter.response_ko,
    };
  };

  /* ---------- Phase 2: Playable Dela Grante Isekai Mini-Systems ---------- */
  YunoEngine.prototype.getActiveIsekaiPuzzle = function () {
    var node = this.getCurrentNode();
    if (!node || !node.puzzle_id) return null;
    var puzzle = this.puzzleMap[node.puzzle_id];
    if (!puzzle) return null;
    if (!this.localState.isekaiState) {
      this.localState.isekaiState = createInitialIsekaiState();
    }
    var stateKey = puzzle.id === 'puzzle_dg_desert_crossing'
      ? 'desert'
      : (puzzle.id === 'puzzle_dg_underground_1' ? 'underground1' : 'underground2');
    return {
      puzzle: deepClone(puzzle),
      state: deepClone(this.localState.isekaiState[stateKey]),
    };
  };

  YunoEngine.prototype.stepDesertAction = function (cmd) {
    if (this.localState.currentNodeId !== 'node_dg_desert_trek') {
      return { ok: false, error: '사막 횡단 커맨드는 라파엘로 사막 구간(node_dg_desert_trek)에서만 사용할 수 있습니다.' };
    }
    var puzzle = this.puzzleMap.puzzle_dg_desert_crossing;
    var rules = puzzle.rules;
    var act = rules.actions[cmd];
    if (!act) {
      return { ok: false, error: '알 수 없는 사막 커맨드입니다: ' + cmd };
    }

    if (!this.localState.isekaiState) this.localState.isekaiState = createInitialIsekaiState();
    var ds = this.localState.isekaiState.desert;
    if (ds.completed) {
      return {
        ok: true,
        completed: true,
        state: deepClone(ds),
        message: '이미 오아시스 방향을 포착했습니다! 오아시스 진입 분기를 선택하세요.',
      };
    }

    ds.steps += 1;
    this.localState.sceneStep += 1;

    ds.water = Math.max(0, Math.min(rules.max_water, ds.water + (act.water_delta || 0)));
    ds.rations = Math.max(0, Math.min(rules.max_rations, ds.rations + (act.rations_delta || 0)));

    var message = '';
    if (ds.water === 0 || ds.rations === 0) {
      // Dramatic survival stumble without soft-lock: Kun-Kun drags them to rock shade
      ds.water = Math.max(ds.water, 35);
      ds.rations = Math.max(ds.rations, 30);
      ds.distance = Math.max(0, ds.distance - 1);
      message = '탈진 위기! 쿤쿤이 바위 그늘로 이끌고 선인장 즙을 찾아와 기력을 겨우 회복했다. (거리 -1, 물/식량 응급 회복)';
    } else if (cmd === 'walk') {
      ds.distance = Math.min(rules.goal_distance, ds.distance + 1);
      message = '작열하는 모래 언덕을 한 구간 돌파했다! (진행 거리 ' + ds.distance + '/' + rules.goal_distance + ')';
    } else if (cmd === 'talk_yuno') {
      var revIdx = Math.min(ds.talkCount, puzzle.talk_revelations_ko.length - 1);
      ds.talkCount = Math.min(rules.goal_talk_yuno, ds.talkCount + 1);
      message = puzzle.talk_revelations_ko[revIdx] + ' (유노 대화 ' + ds.talkCount + '/' + rules.goal_talk_yuno + ')';
    } else if (cmd === 'look_around') {
      var lookIdx = Math.min(ds.lookCount, puzzle.look_revelations_ko.length - 1);
      ds.lookCount = Math.min(rules.goal_look_around, ds.lookCount + 1);
      message = puzzle.look_revelations_ko[lookIdx] + ' (주변 조사 ' + ds.lookCount + '/' + rules.goal_look_around + ')';
    } else if (cmd === 'forage') {
      message = '쿤쿤과 함께 바위 틈 이슬과 사막 열매를 채집했다! (물 ' + ds.water + '%, 식량 ' + ds.rations + '%)';
    }

    var justCompleted = false;
    if (
      ds.distance >= rules.goal_distance &&
      ds.talkCount >= rules.goal_talk_yuno &&
      ds.lookCount >= rules.goal_look_around
    ) {
      ds.completed = true;
      justCompleted = true;
      addUnique(this.localState.localFlags, puzzle.grants_local_flag);
      message = '✨ 라파엘로 사막 횡단 성공! 지평선 너머 사라가 있는 오아시스가 눈앞에 펼쳐졌다!';
      this._pushLog('isekai_puzzle', '라파엘로 사막 횡단 돌파 (오아시스 해금)', this.localState.currentNodeId);
    } else {
      this._pushLog('isekai_puzzle', '사막 [' + act.label_ko + '] — 거리 ' + ds.distance + '/' + rules.goal_distance + ', 대화 ' + ds.talkCount + '/' + rules.goal_talk_yuno + ', 조사 ' + ds.lookCount + '/' + rules.goal_look_around, this.localState.currentNodeId);
    }

    ds.lastMessage = message;
    return {
      ok: true,
      cmd: cmd,
      completed: ds.completed,
      justCompleted: justCompleted,
      state: deepClone(ds),
      message: message,
    };
  };

  YunoEngine.prototype.stepUndergroundMaze = function (dir) {
    var validDirs = ['forward', 'back', 'left', 'right'];
    if (validDirs.indexOf(dir) === -1) {
      return { ok: false, error: '유효하지 않은 이동 방향입니다: ' + dir };
    }
    if (!this.localState.isekaiState) this.localState.isekaiState = createInitialIsekaiState();

    var nodeId = this.localState.currentNodeId;
    if (nodeId === 'node_dg_underground_1') {
      var p1 = this.puzzleMap.puzzle_dg_underground_1;
      var u1 = this.localState.isekaiState.underground1;
      if (u1.completed) {
        return {
          ok: true,
          puzzleId: p1.id,
          completed: true,
          state: deepClone(u1),
          message: '이미 지하도 1의 숨겨진 우측 통로를 돌파했습니다! 데라 그란트 제도 입성을 선택하세요.',
        };
      }

      u1.steps += 1;
      u1.history.push(dir);
      if (u1.history.length > 20) u1.history.shift();
      this.localState.sceneStep += 1;

      var msg1 = '';
      var justCompleted1 = false;

      if (u1.corridor === 'main') {
        if (dir === 'forward') {
          if (u1.depth < p1.rules.max_depth) {
            u1.depth += 1;
            if (u1.depth === p1.rules.dead_end_depth) {
              u1.deadEndHit = true;
              msg1 = '막다른 길(깊이 3/3)! 거대한 석벽이 앞을 가로막고 있다. 벽면 긁힌 표식: "막다른 길에서 1칸 후퇴 후 우측으로..."';
            } else {
              msg1 = '어두운 지하 통로를 앞으로 전진했다. (현재 깊이 ' + u1.depth + '/3)';
            }
          } else {
            u1.deadEndHit = true;
            msg1 = '더 이상 앞으로 갈 수 없는 막다른 벽이다! [1칸 후퇴]를 시도해 보자.';
          }
        } else if (dir === 'back') {
          if (u1.depth > 0) {
            u1.depth -= 1;
            if (u1.depth === p1.rules.secret_right_depth && u1.deadEndHit) {
              msg1 = '막다른 길에서 정확히 1칸 후퇴했다(깊이 2/3)! 오른쪽 벽 틈새에서 제도 쪽 바람이 불어오는 [우측 비밀 통로]가 보인다!';
            } else {
              msg1 = '통로를 1칸 뒤로 물러났다. (현재 깊이 ' + u1.depth + '/3)';
            }
          } else {
            msg1 = '이미 지하도 1 입구(깊이 0)다. 앞으로 전진해야 한다.';
          }
        } else if (dir === 'right') {
          if (u1.depth === p1.rules.secret_right_depth && u1.deadEndHit) {
            u1.corridor = 'east_secret';
            u1.turnedRight = true;
            msg1 = '성공! 우측 숨겨진 통로로 진입했다! 저 앞쪽에서 데라 그란트 제도의 불빛이 새어 나온다 — [전진]하자!';
          } else {
            msg1 = '우측은 단단한 석벽이다. (먼저 끝까지 전진해 막다른 길을 확인한 뒤 1칸 후퇴해 보자!)';
          }
        } else {
          msg1 = '좌측은 붕괴된 배수로로 막혀 있다.';
        }
      } else if (u1.corridor === 'east_secret') {
        if (dir === 'forward') {
          u1.completed = true;
          justCompleted1 = true;
          addUnique(this.localState.localFlags, p1.grants_local_flag);
          msg1 = '✨ 제도 지하도 1 미궁 돌파 완료! 비밀 통로 너머 데라 그란트 제도 시가지가 열렸다!';
          this._pushLog('isekai_puzzle', '제도 지하도 1 돌파 (막다른 길→1칸 후퇴→우측→전진)', nodeId);
        } else if (dir === 'back') {
          u1.corridor = 'main';
          u1.turnedRight = false;
          msg1 = '주 통로(깊이 2/3)로 되돌아왔다.';
        } else {
          msg1 = '비밀 통로 폭이 좁아 앞쪽([전진])으로만 나아갈 수 있다!';
        }
      }

      if (!justCompleted1) {
        this._pushLog('isekai_puzzle', '지하도 1 [' + dir + '] — ' + u1.corridor + ' 깊이 ' + u1.depth, nodeId);
      }
      u1.lastMessage = msg1;
      return {
        ok: true,
        puzzleId: p1.id,
        dir: dir,
        completed: u1.completed,
        justCompleted: justCompleted1,
        state: deepClone(u1),
        message: msg1,
      };
    }

    if (nodeId === 'node_dg_underground_2') {
      var p2 = this.puzzleMap.puzzle_dg_underground_2;
      var u2 = this.localState.isekaiState.underground2;
      if (u2.completed) {
        return {
          ok: true,
          puzzleId: p2.id,
          completed: true,
          state: deepClone(u2),
          message: '이미 지하도 2를 돌파해 성당 입구에 도달했습니다! 대성당 결전으로 돌입하세요.',
        };
      }

      u2.steps += 1;
      u2.history.push(dir);
      if (u2.history.length > 20) u2.history.shift();
      this.localState.sceneStep += 1;

      var msg2 = '';
      var justCompleted2 = false;
      if (dir === 'forward') {
        u2.depth += 1;
        if (u2.depth >= p2.rules.goal_depth) {
          u2.completed = true;
          justCompleted2 = true;
          addUnique(this.localState.localFlags, p2.grants_local_flag);
          msg2 = '✨ 지하도 2 직진 추적 돌파! 도주하던 류조지를 대성당 무녀 의식 제단 앞까지 따라잡았다!';
          this._pushLog('isekai_puzzle', '제도 지하도 2 직진 추적 완료 (성당 결전 해금)', nodeId);
        } else {
          msg2 = '류조지의 발자국을 따라 앞쪽으로 전력 질주했다! (추적 구간 ' + u2.depth + '/' + p2.rules.goal_depth + ')';
        }
      } else if (dir === 'back') {
        u2.depth = Math.max(0, u2.depth - 1);
        msg2 = '잠시 1칸 물러섰다. 시간을 지체하면 의식이 시작된다! (추적 구간 ' + u2.depth + '/' + p2.rules.goal_depth + ')';
      } else {
        msg2 = '옆 갈림길에는 흔적이 없다! 류조지의 발자국은 흔들림 없이 앞쪽([전진])으로 이어진다!';
      }

      if (!justCompleted2) {
        this._pushLog('isekai_puzzle', '지하도 2 [' + dir + '] — 추적 ' + u2.depth + '/' + p2.rules.goal_depth, nodeId);
      }
      u2.lastMessage = msg2;
      return {
        ok: true,
        puzzleId: p2.id,
        dir: dir,
        completed: u2.completed,
        justCompleted: justCompleted2,
        state: deepClone(u2),
        message: msg2,
      };
    }

    return { ok: false, error: '지하도 미궁 이동은 제도 지하도 1·2 구간에서만 사용할 수 있습니다.' };
  };

  YunoEngine.prototype.useItem = function (itemId) {
    var item = this.itemMap[itemId];
    if (!item) {
      return { ok: false, error: '알 수 없는 아이템입니다: ' + itemId };
    }
    if (!this._hasItem(itemId)) {
      return { ok: false, error: '해당 아이템을 소지하고 있지 않습니다: ' + item.name_ko };
    }

    var node = this.getCurrentNode();
    var useKey = node.id + ':' + itemId;
    addUnique(this.localState.usedItemsAtNode, useKey);
    this.localState.sceneStep += 1;

    // 1. Study Key at Day 1 Hub -> Unlock Father's Study
    if (itemId === 'item_study_key' && node.id === 'node_day1_hub') {
      var unlockRes = this.advanceToNode('node_study_unlock');
      if (unlockRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '칸나 루트에서 역계승한 "아버지 서재의 열쇠"로 1일차 초기 시점의 아버지 서재를 개방했다!',
          transition: unlockRes,
        };
      }
      return { ok: false, error: unlockRes.error };
    }

    // 2. Study Key at Study Unlock -> Clock 6 -> 3 puzzle -> Jewel #6
    if (itemId === 'item_study_key' && node.id === 'node_study_unlock') {
      var clockRes = this.advanceToNode('node_study_clock_puzzle');
      if (clockRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '서재의 괘종시계 뚜껑을 열고 문자판 [6 → 3]을 조작해 여섯 번째 추가 보옥(jewel_found_6)을 획득했다!',
          transition: clockRes,
        };
      }
      return { ok: false, error: clockRes.error };
    }

    // 3. Gold Key at Mitsuki Call -> Mansion Sneak
    if (itemId === 'item_gold_key' && node.id === 'node_mitsuki_call') {
      var sneakRes = this.advanceToNode('node_mitsuki_mansion_sneak');
      if (sneakRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '황금 열쇠로 류조지 저택 안쪽 서재 통로에 은밀히 잠입했다!',
          transition: sneakRes,
        };
      }
    }

    // 4. Rope at Mitsuki Storehouse -> Well Silver Medal
    if (itemId === 'item_rope' && node.id === 'node_mitsuki_storehouse') {
      var wellRes = this.advanceToNode('node_mitsuki_well_medal');
      if (wellRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '토장에서 챙긴 로프를 저택 뒤뜰 우물에 내려 "은 메달"을 인양했다!',
          transition: wellRes,
        };
      }
    }

    // 5. Blue Card at Kaori Security Gate -> Infiltrate Lab
    if (itemId === 'item_blue_card' && node.id === 'node_kaori_gate_blue_card') {
      var labRes = this.advanceToNode('node_kaori_infiltrate_lab');
      if (labRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '아유미 루트에서 계승한 "블루 카드"로 지오테크닉스 보안문을 해제하고 코다이 연구실에 잠입했다!',
          transition: labRes,
        };
      }
      return { ok: false, error: labRes.error };
    }

    // 6. Chounenseki at Kanna Crisis Gate -> Save Kanna
    if (itemId === 'item_chounenseki' && node.id === 'node_kanna_crisis_gate') {
      var kannaRes = this.advanceToNode('node_kanna_end');
      if (kannaRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '카오리 루트에서 계승한 "초념석"이 칸나의 목걸이와 공명해 그녀를 구명하고 아버지 서재의 열쇠를 받았다!',
          transition: kannaRes,
        };
      }
      return { ok: false, error: kannaRes.error };
    }

    // 7. Silver Medal or Chounenseki at Mio Cave Puzzle
    if ((itemId === 'item_silver_medal' || itemId === 'item_chounenseki') && node.id === 'node_mio_cave_puzzle') {
      var mioRes = this.advanceToNode('node_mio_coast_revelation');
      if (mioRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '은 메달과 초념석이 지하 유적 제단에서 공명하며 고대 봉인이 해제되었다!',
          transition: mioRes,
        };
      }
      return {
        ok: true,
        action: 'hint',
        item: item,
        message: '제단이 미세하게 반응했지만 아직 짝이 맞지 않는다. (' + mioRes.error + ')',
      };
    }

    // 8. Kanna Student ID at School Gate or Drunk Reacquire -> Rooftop Kanna branch
    if (itemId === 'item_kanna_student_id' && (node.id === 'node_school_day1_gate' || node.id === 'node_town_drunk_reacquire')) {
      var roofRes = this.advanceToNode('node_kanna_rooftop');
      if (roofRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '칸나의 학생수첩을 돌려주기 위해 학원 옥상으로 향했다!',
          transition: roofRes,
        };
      }
    }

    // 9. Page 20 Document at Kaori Dossier -> Security Gate
    if (itemId === 'item_doc_page20' && node.id === 'node_kaori_dossier_analysis') {
      var gateRes = this.advanceToNode('node_kaori_gate_blue_card');
      if (gateRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '20페이지째 서류로 연구실 위치를 특정해 지오테크닉스 사옥 보안문 앞에 도달했다!',
          transition: gateRes,
        };
      }
    }

    // 10. Entrusted Light at Sanctuary Climax -> True Ending
    if (itemId === 'item_entrusted_light' && node.id === 'node_dg_sanctuary_climax') {
      var trueRes = this.advanceToNode('node_true_end');
      if (trueRes.ok) {
        return {
          ok: true,
          action: 'advance',
          item: item,
          message: '어둠 속에서 발광하는 위탁 물품이 사상의 틈새를 열었다 — 트루 엔딩으로!',
          transition: trueRes,
        };
      }
    }

    // 11. Kodai's Letter anywhere -> Clue
    if (itemId === 'item_kodai_letter') {
      this._pushLog('use_item', '코다이의 편지 재확인', node.id);
      return {
        ok: true,
        action: 'clue',
        item: item,
        message: '아버지 코다이의 편지: "리플렉터로 보옥을 남겨 평행세계를 왕래하라. 서재의 괘종시계는 [6 → 3]이다. 그리고 자실 서랍 설명서를 무심코 열지 마라..."',
      };
    }

    var targetRouteNames = (item.target_route_ids || [])
      .map(function (rid) { return this.routeMap[rid] ? this.routeMap[rid].name_ko : rid; }, this)
      .join(', ');
    this._pushLog('use_item', item.name_ko + ' 사용 시도 (효과 없음)', node.id);
    return {
      ok: true,
      action: 'noop',
      item: item,
      message: '지금 이곳에서는 "' + item.name_ko + '"을(를) 사용할 곳이 없다. 관련 루트: ' + (targetRouteNames || '현재 분기') + '. (' + item.paradox_risk_note_ko + ')',
    };
  };

  YunoEngine.prototype.consumeItem = function (itemId) {
    var item = this.itemMap[itemId];
    if (!item) {
      return { ok: false, error: '알 수 없는 아이템: ' + itemId };
    }
    if (item.carries_across_timelines) {
      if (!removeValue(this.globalState.carriedItems, itemId)) {
        return { ok: false, error: '소지 중인 글로벌 아이템이 아닙니다: ' + item.name_ko };
      }
      addUnique(this.globalState.consumedItems, itemId);
      this._pushLog('consume', '글로벌 아이템 소비: ' + item.name_ko + ' (과거 점프 시 복구 불가)', this.localState.currentNodeId);
      return { ok: true, item: item, scope: 'global' };
    }
    if (!removeValue(this.localState.localItems, itemId)) {
      return { ok: false, error: '소지 중인 로컬 아이템이 아닙니다: ' + item.name_ko };
    }
    this._pushLog('consume', '로컬 아이템 소비: ' + item.name_ko, this.localState.currentNodeId);
    return { ok: true, item: item, scope: 'local' };
  };

  YunoEngine.prototype.getInheritanceStatus = function () {
    return this.data.crossRouteTransfers.map(function (xfer) {
      var item = this.itemMap[xfer.carried_item_id];
      var fromRoute = this.routeMap[xfer.from_route_id];
      var toRoute = this.routeMap[xfer.to_route_id];
      var targetNode = this.nodeMap[xfer.target_gate_node_id];
      var completed = this.globalState.completedTransfers.indexOf(xfer.id) !== -1;
      var carried = this.globalState.carriedItems.indexOf(xfer.carried_item_id) !== -1;
      var status = completed ? 'completed' : (carried ? 'carried' : 'locked');
      return {
        id: xfer.id,
        status: status,
        item: item,
        fromRoute: fromRoute,
        toRoute: toRoute,
        sourceNodeId: xfer.source_node_id,
        jumpHubNodeId: xfer.jump_hub_node_id,
        targetNode: targetNode,
        unlockNodeId: xfer.unlock_node_id,
        mechanism_ko: xfer.mechanism_ko,
      };
    }, this);
  };

  /* ---------- Phase 2: Cross-Route Inheritance Path Resolver for Live SVG Highlighting ---------- */
  YunoEngine.prototype.getInheritanceChainVisual = function (chainId) {
    var xfer = this.transferMap[chainId];
    if (!xfer) return null;

    var completed = this.globalState.completedTransfers.indexOf(xfer.id) !== -1;
    var carried = this.globalState.carriedItems.indexOf(xfer.carried_item_id) !== -1;
    var status = completed ? 'completed' : (carried ? 'carried' : 'locked');

    var sourceId = xfer.source_node_id;
    var jumpHubId = xfer.jump_hub_node_id;
    var gateId = xfer.target_gate_node_id;
    var unlockId = xfer.unlock_node_id;

    var highlightNodeIds = [];
    addUnique(highlightNodeIds, sourceId);
    addUnique(highlightNodeIds, jumpHubId);
    addUnique(highlightNodeIds, gateId);
    addUnique(highlightNodeIds, unlockId);

    return {
      id: xfer.id,
      itemId: xfer.carried_item_id,
      item: this.itemMap[xfer.carried_item_id] || null,
      status: status,
      fromRoute: this.routeMap[xfer.from_route_id] || null,
      toRoute: this.routeMap[xfer.to_route_id] || null,
      sourceNodeId: sourceId,
      jumpHubNodeId: jumpHubId,
      gateNodeId: gateId,
      unlockNodeId: unlockId,
      highlightNodeIds: highlightNodeIds,
      segments: [
        { from: sourceId, to: jumpHubId, kind: 'reflector_jump', label_ko: '보옥 점프 귀환' },
        { from: jumpHubId, to: gateId, kind: 'branch_travel', label_ko: '타 루트 반입' },
        { from: gateId, to: unlockId, kind: 'gate_unlock', label_ko: '관문 해제' },
      ],
      mechanism_ko: xfer.mechanism_ko,
    };
  };

  /* ---------- Phase 2: 100% Map Completion Breakdown (GAP-07 Anti-98% Bug Clarity) ---------- */
  YunoEngine.prototype.getMapCompletionBreakdown = function () {
    var discoveredSet = {};
    this.globalState.discoveredNodes.forEach(function (id) { discoveredSet[id] = true; });

    var modernTotal = 0;
    var modernFound = 0;
    var isekaiTotal = 0;
    var isekaiFound = 0;
    var whirlpoolTotal = 0;
    var whirlpoolFound = 0;

    this.data.nodes.forEach(function (n) {
      var found = Boolean(discoveredSet[n.id]);
      if (n.route_id === 'route_isekai') {
        isekaiTotal += 1;
        if (found) isekaiFound += 1;
      } else {
        modernTotal += 1;
        if (found) modernFound += 1;
      }
      if (n.node_type === 'whirlpool') {
        whirlpoolTotal += 1;
        if (found) whirlpoolFound += 1;
      }
    });

    var totalAll = this.data.nodes.length;
    var foundAll = modernFound + isekaiFound;
    var pct = function (a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; };

    return {
      total: { discovered: foundAll, total: totalAll, percent: pct(foundAll, totalAll) },
      modern: { discovered: modernFound, total: modernTotal, percent: pct(modernFound, modernTotal) },
      isekai: { discovered: isekaiFound, total: isekaiTotal, percent: pct(isekaiFound, isekaiTotal) },
      whirlpools: { discovered: whirlpoolFound, total: whirlpoolTotal, percent: pct(whirlpoolFound, whirlpoolTotal) },
      note_ko: '현세편(50노드)과 이세계편(10노드) 달성률을 분리 집계하여 이세계편 미해금으로 인한 98% 맵 정체 혼란(GAP-07)을 해소합니다.',
    };
  };

  YunoEngine.prototype.getSnapshot = function () {
    this._recalcAvailableJewels();
    return {
      schemaVersion: SCHEMA_VERSION,
      globalState: deepClone(this.globalState),
      localState: deepClone(this.localState),
    };
  };

  YunoEngine.prototype.serialize = function () {
    return JSON.stringify(this.getSnapshot());
  };

  YunoEngine.prototype.deserialize = function (jsonOrObj) {
    var parsed = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : deepClone(jsonOrObj);
    if (!parsed || !parsed.globalState || !parsed.localState) {
      throw new Error('Invalid YU-NO save document: missing globalState or localState.');
    }
    if (!this.nodeMap[parsed.localState.currentNodeId]) {
      throw new Error('Invalid YU-NO save document: unknown currentNodeId ' + parsed.localState.currentNodeId);
    }

    var normEdition = normalizeEdition(parsed.globalState.edition);
    var cfg = EDITION_CONFIG[normEdition];

    this.globalState = deepClone(parsed.globalState);
    this.globalState.edition = normEdition;
    this.globalState.jewelCapacity = cfg.capacity;
    if (!Array.isArray(this.globalState.initialJewels)) {
      this.globalState.initialJewels = this._getInitialJewelsForEdition(normEdition);
    }
    if (!Array.isArray(this.globalState.consumedItems)) {
      this.globalState.consumedItems = [];
    }
    if (!Array.isArray(this.globalState.completedTransfers)) {
      this.globalState.completedTransfers = [];
    }
    if (!Array.isArray(this.globalState.actionLog)) {
      this.globalState.actionLog = [];
    }

    this.localState = deepClone(parsed.localState);
    if (!Array.isArray(this.localState.takenPickups)) {
      this.localState.takenPickups = [];
    }
    if (!Array.isArray(this.localState.inspectedNodes)) {
      this.localState.inspectedNodes = [];
    }
    if (!Array.isArray(this.localState.inspectedHotspots)) {
      this.localState.inspectedHotspots = [];
    }
    if (!Array.isArray(this.localState.usedItemsAtNode)) {
      this.localState.usedItemsAtNode = [];
    }
    if (!this.localState.isekaiState) {
      this.localState.isekaiState = createInitialIsekaiState();
    }

    this._recalcAvailableJewels();
    return this.getSnapshot();
  };

  YunoEngine.create = function (data, options) {
    return new YunoEngine(data, options);
  };

  YunoEngine.deserialize = function (jsonOrObj, data) {
    var engine = new YunoEngine(data || defaultGlobalData);
    engine.deserialize(jsonOrObj);
    return engine;
  };

  YunoEngine.EDITION_CONFIG = EDITION_CONFIG;

  return YunoEngine;
}));
