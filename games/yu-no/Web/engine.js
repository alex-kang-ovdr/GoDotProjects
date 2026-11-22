/* YU-NO Headless A.D.M.S. & Reflector Device Engine (Deterministic, Zero-DOM, UMD) */
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

  var SCHEMA_VERSION = '1.0.0';
  var MAX_LOG_ENTRIES = 80;

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

  /* Faithful SF-mystery narrative beats & inspection hints for all 35 A.D.M.S. nodes */
  var NODE_SCRIPT = {
    node_prologue_start: {
      speaker: '아리마 타쿠야',
      dialogue: '실종된 아버지 코다이에게서 소포가 도착했다. 정체불명의 팔각형 금속 장치 — "리플렉터 디바이스"와, 2개월 전 죽은 줄 알았던 아버지의 필체로 적힌 편지다. "오늘 밤 10시, 켄노미사키 삼각산으로 와라."',
      inspect: '책상 위 편지에는 "시간은 하나의 선이 아니라 무수히 갈라지는 병렬세계의 나무"라고 적혀 있다. 리플렉터 디바이스 중앙의 홈에는 이미 푸른 보옥이 희미하게 맥동하고 있다.',
    },
    node_day1_hub: {
      speaker: '내레이션 (A.D.M.S. 기준점)',
      dialogue: '본편 1일차 아침, 아리마 저택. 아직 아버지의 서재 짐이 그대로 남아 있는 결정적인 시간대다. 리플렉터 하단의 보옥이 강하게 점멸하며 "이곳에 보옥 세이브를 남겨 두라"고 경고한다.',
      inspect: '서재 문은 굳게 잠겨 있지만, 문틈으로 괘종시계와 코다이의 연구 자료가 고스란히 보존되어 있음이 느껴진다. 지금은 열쇠가 없지만, 미래의 다른 시간축에서 열쇠를 가져온다면 이곳을 열 수 있을 것이다!',
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
      dialogue: '학장 비서 미츠키의 다급한 전화를 받고 류조지 코조의 무가 저택을 찾았다. 수상한 기척 속에서 황금 열쇠를 손에 넣었지만, 저택 안쪽 토장(土蔵)에서 불길한 낌새가 감돈다.',
      inspect: '리플렉터가 점멸하고 있다! 토장 안에는 순서 함정이 도사리고 있으니 진입 전 반드시 이곳에 보옥 세이브를 설치해 두자.',
    },
    node_mitsuki_rope_lockout: {
      speaker: '시스템 경고 (소용돌이 — 막다른 분기)',
      dialogue: '토장 벽을 먼저 조사하는 바람에 구석에 있던 로프를 회수할 기회를 영영 놓쳐 버렸다! 로프 없이는 우물 속 은 메달을 건질 수 없어 시간축이 소용돌이(Whirlpool)에 갇혔다.',
      inspect: '이 시간축은 인과가 꼬인 막다른 길이다. A.D.M.S. 지도에서 이전 보옥 세이브(류조지 저택 방문)로 리플렉터 점프해 인과를 되돌려야 한다!',
    },
    node_mitsuki_storehouse: {
      speaker: '아리마 타쿠야',
      dialogue: '토장에 갇히자마자 벽보다 먼저 좌측의 로프를 챙겼다! 안쪽 방 수상한 기계 옆에서 광점(보옥 2)을 발견했고, 탈출 후 우물에서 로프로 "은 메달"까지 인양하는 데 성공했다.',
      inspect: '확보한 로프와 은 메달은 시간축을 초월해 유지되는 글로벌 소지품이다. 특히 은 메달은 다른 분기(미오 루트 지하 동굴)에서 결정적인 열쇠가 된다.',
    },
    node_mitsuki_end: {
      speaker: '이치죠 미츠키',
      dialogue: '류조지 저택의 끔찍한 진실과 미츠키의 고독을 마주하며 하나의 시간축이 막을 내렸다. 이 분기의 결말과 획득한 보옥·은 메달을 가슴에 품은 채, 다른 평행세계로 도약할 시간이다.',
      inspect: '미츠키 루트 클리어 글로벌 플래그가 A.D.M.S.에 영구 각인되었다. 보옥 로드로 학원 정문이나 다른 분기점으로 점프하자.',
    },
    node_ayumi_branch: {
      speaker: '아리마 아유미',
      dialogue: '지오테크닉스 사옥 앞. 해안 지질조사 프로젝트 책임자인 의붓어머니 아유미가 도요토미의 음모에 휘말려 있다. 여경비원 앞에서 손에 쥔 자기카드를 쓸지, 아니면 삼각산 쪽으로 우회할지 선택의 기로다.',
      inspect: '리플렉터 점멸 감지! 여경비원에게 자기카드를 바로 쓰지 않고 삼각산·쌍둥이 바위로 우회하면 숨겨진 광점(보옥 3)을 발견할 수 있다.',
    },
    node_ayumi_jewel3_mountain: {
      speaker: '아리마 타쿠야',
      dialogue: '자기카드를 아낀 채 사당을 지나 삼각산 쌍둥이 바위까지 류조지의 행적을 쫓았다. 바위 그늘 아래 시공의 일그러짐 속에서 세 번째 추가 보옥이 찬란하게 빛나고 있다!',
      inspect: '삼각산은 400년마다 번개가 내려치는 사카이마치 시공 왜곡의 중심지다. 보옥 3을 리플렉터에 장착했다.',
    },
    node_ayumi_blue_card: {
      speaker: '아리마 타쿠야',
      dialogue: '켄노미사키 해안 공사 현장에서 아유미를 위협하던 도요토미와 대치한 끝에, 지오테크닉스 최고 보안 등급의 "블루 카드"를 입수했다!',
      inspect: '블루 카드는 아유미 루트뿐 아니라 카오리 루트의 지오테크닉스 사옥 보안문을 여는 핵심 교차 계승 아이템이다.',
    },
    node_ayumi_end: {
      speaker: '아리마 아유미',
      dialogue: '거대한 음모 속에서 아유미와 마음을 나눈 시간축이 완결되었다. 하지만 코다이의 연구와 지오테크닉스의 비밀은 아직 끝나지 않았다 — 블루 카드를 쥔 채 카오리의 시간축으로 넘어가야 한다.',
      inspect: '아유미 루트 클리어 완료! 블루 카드는 글로벌 인벤토리에 보존되므로, 학원 정문으로 보옥 점프해 카오리 루트에 도전하자.',
    },
    node_kaori_branch: {
      speaker: '아사쿠라 카오리',
      dialogue: 'TV 인기 캐스터이자 탐사 저널리스트 카오리와 시가지에서 합류했다. 그녀는 지오테크닉스와 아리마 코다이의 실종을 쫓고 있다. 단서인 "20페이지째 서류"를 확보한 뒤 사옥으로 향한다.',
      inspect: '지오테크닉스 사옥 내부는 삼엄한 카드키 보안으로 막혀 있다. 이곳에 보옥 세이브를 심어 두고 보안문으로 접근하자.',
    },
    node_kaori_gate_blue_card: {
      speaker: '아사쿠라 카오리',
      dialogue: '지오테크닉스 사옥 코다이 연구실 앞 전자 보안문. 일반 출입증으로는 열리지 않는다. "타쿠야 군, 블루 카드가 없으면 여기서 더는 못 들어가."',
      inspect: '교차 계승 관문! 아유미 루트에서 입수한 "블루 카드"를 소지하고 있다면 여기서 보안문을 해제(또는 아이템 사용)할 수 있다.',
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
    node_mio_cave_yuki: {
      speaker: '유우키 마사카츠',
      dialogue: '유우키와 함께 사당 지하 동굴 깊숙한 격자 앞 웅덩이를 수색했다. 물속에서 다섯 번째 보옥이 솟아올랐고, 유적 장치용 흰 메달과 검은 메달도 함께 회수했다!',
      inspect: '이제 남은 것은 유적 심부의 공명 장치뿐이다. 미츠키 루트의 은 메달과 카오리 루트의 초념석이 있다면 유적을 열 수 있다.',
    },
    node_mio_cave_puzzle: {
      speaker: '시마즈 미오',
      dialogue: '지하 유적 최심부의 고대 제단. 메달 홈과 공명석 홈이 비어 있다. "타쿠야, 여기엔 은으로 된 메달과 강한 염력을 띠는 돌이 필요한 것 같아."',
      inspect: '교차 계승 이중 관문! 미츠키 루트의 "은 메달"과 카오리 루트의 "초념석"을 모두 지니고 있어야 유적 공명이 발동한다.',
    },
    node_mio_end: {
      speaker: '시마즈 미오',
      dialogue: '은 메달과 초념석이 눈부시게 공명하며 사카이마치 400년 전승의 베일이 벗겨졌다. 미오와의 뜨거운 진실 추적은 이렇게 한 매듭을 짓는다.',
      inspect: '미오 루트 클리어 완료! 이제 남은 현세편 분기를 마무리하고 1일차 거점으로 역계승할 준비를 하자.',
    },
    node_eriko_branch: {
      speaker: '다케다 에리코',
      dialogue: '사카이마치 학원 보건실. 늘 장난스럽던 양호교사 에리코가 진지한 눈빛으로 차원 계측기를 꺼내 들었다. 그녀의 정체는 멀티버스 질서를 수호하는 외부 차원 감사관 "에이릭 쿼드로"였다.',
      inspect: '에리코는 류조지 코조의 육체를 탈취한 이세계 사념체의 정체와, 현세·이세계 간 사상 충돌의 위기를 추적하고 있다.',
    },
    node_eriko_end: {
      speaker: '다케다 에리코 (에이릭 쿼드로)',
      dialogue: '"기억해 둬, 타쿠야. 네가 모든 보옥을 채우고 세상의 끝에 닿을 때, 우리는 사상의 틈새에서 다시 만나게 될 거야." 차원 감사관의 진상이 A.D.M.S.에 기록되었다.',
      inspect: '에리코 루트 클리어 완료! 현세편 수렴 조건 중 하나인 차원 진상 플래그가 확보되었다.',
    },
    node_kanna_rooftop: {
      speaker: '하타노 칸나',
      dialogue: '학원 옥상에서 칸나에게 학생수첩을 돌려주었다. 그녀의 목에는 초념석 결정으로 만든 푸른 목걸이가 걸려 있다. 칸나는 타쿠야의 리플렉터를 보며 미세하게 떨었다.',
      inspect: '리플렉터 점멸! 칸나는 데라 그란트의 혈통과 깊은 연관이 있다. 종반 위기에 대비해 이곳에 보옥 세이브를 남겨 두자.',
    },
    node_kanna_crisis_gate: {
      speaker: '하타노 칸나',
      dialogue: '사카이마치 시가지 한복판, 칸나가 격심한 발작을 일으키며 쓰러졌다! 그녀의 목걸이 결정이 빛을 잃어가고 있다. 지금 당장 초념석으로 공명시키지 않으면 칸나를 구할 수 없다!',
      inspect: '생사 교차 계승 관문! 카오리 루트에서 확보한 "초념석"을 소지(또는 사용)하면 칸나를 구명하고 아버지 서재의 열쇠를 받을 수 있다. 미보유 시 소용돌이(배드엔드)로 직행한다!',
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
      inspect: '아버지의 편지에 적혀 있던 단서 — 괘종시계 뚜껑을 열고 문자판의 [6 → 3]을 순서대로 조작해 보자! (서재의 열쇠 사용 또는 전진 선택)',
    },
    node_study_clock_puzzle: {
      speaker: '아리마 타쿠야',
      dialogue: '괘종시계의 문자판을 6에서 3으로 돌리자 숨겨진 장치가 열리며 마지막 여섯 번째 추가 보옥이 나타났다! 리플렉터 디바이스의 모든 슬롯이 눈부신 빛으로 완충되었다!',
      inspect: '전 보옥 수집 완료! 현세편 6개 히로인 루트를 모두 클리어했다면 이제 켄노미사키 삼각산 동굴의 최종 수렴 관문이 열린다.',
    },
    node_convergence_cave: {
      speaker: '내레이션 (최종 수렴 — 켄노미사키)',
      dialogue: '여섯 갈래 평행세계의 기억과 완충된 리플렉터의 보옥이 한 점으로 공명한다. 삼각산 동굴 깊숙한 곳에 거대한 시공의 문이 열리고, 타쿠야는 미지의 이세계 "데라 그란트"로 빨려 들어간다!',
      inspect: '이세계편(데라 그란트)에 돌입하면 A.D.M.S. 병렬 점프는 봉인되고 단일 시간축의 대서사가 펼쳐진다. 준비가 되었다면 돌입하자!',
    },
    node_dg_arrival: {
      speaker: '아이리아 & 세레스',
      dialogue: '시공을 넘어 도착한 이세계 데라 그란트의 국경 "보더". 괴물의 습격 속에서 목소리를 잃은 여성 세레스와 국경 여기사 아이리아를 만나 새로운 삶이 시작된다. (※ 이세계편에서는 A.D.M.S. 보옥 점프가 봉인됩니다.)',
      inspect: '리플렉터 디바이스의 빛이 잦아들고, 보옥 세이브 기능이 완전히 봉인되었다. 이제 눈앞의 현실을 한 걸음씩 헤쳐 나가야 한다.',
    },
    node_dg_frontier_yuno: {
      speaker: '유노',
      dialogue: '아이리아의 집에서 세레스와 가정을 이루고 딸 "유노"가 태어났다. 평화도 잠시, 바즈의 성석 채굴장에 끌려간 타쿠야는 "데라 그란트 성석"을 확보하고 유노·쿤쿤과 함께 제도를 향해 탈출한다.',
      inspect: '성석 채굴장의 고된 나날 속에서 확보한 성석이 희미하게 빛난다. 이제 드넓은 사막을 횡단해야 한다.',
    },
    node_dg_desert_trek: {
      speaker: '유노 & 사라',
      dialogue: '끝없는 데라 그란트 사막. 타쿠야는 유노와 끊임없이 대화를 나누며 주변을 수색해 오아시스에 닿았고, 사라와의 조우를 거쳐 제도로 향하는 지하도 입구를 찾아냈다.',
      inspect: '사막 커맨드 돌파 완료! 지하도 1(전진 → 막다른 길에서 1칸 후퇴 후 우측)과 지하도 2를 돌파해 제도로 잠입하자.',
    },
    node_dg_underground_capital: {
      speaker: '아만다 & 신제(아유미)',
      dialogue: '제도 지하도를 돌파해 레지스탕스 리더 아만다와 합류했다. 그리고 제도 최고 통치자 "신제"의 정체가 다름 아닌 아유미이며, 현세와 데라 그란트가 사상 충돌 직전이라는 충격적 진실이 밝혀진다!',
      inspect: '류조지 배후의 사념체가 무녀 의식을 이용해 두 세계를 파멸로 몰아가고 있다. 성당의 의식 제단으로 돌입하자!',
    },
    node_dg_sanctuary_climax: {
      speaker: '그란티아 & 에이릭 쿼드로',
      dialogue: '성당 결전 끝에 사상 충돌을 막기 위해 시공의 경계 "사상의 틈새"에 도달했다. 출구 없는 최종방에서 타쿠야는 누군가에게 위탁했던 "빛나는 위탁 물품"이 어둠 속에서 발광하는 것을 발견한다!',
      inspect: '빛나는 위탁 물품(item_entrusted_light)을 확인하거나 사용하면 사상의 틈새가 열리며 최종 진엔딩으로 이어진다!',
    },
    node_true_end: {
      speaker: '유노 (YU-NO)',
      dialogue: '"이 세상 끝에서, 사랑을 노래할게..." 현세와 데라 그란트, 코다이와 케이코, 그리고 딸 유노까지 — 모든 병렬세계의 인과가 하나의 기적으로 이어지며 장대한 이야기가 대단원의 막을 내린다.',
      inspect: '축하합니다! 『이 세상 끝에서 사랑을 노래하는 소녀 YU-NO』 트루 엔딩 달성! 모든 보옥과 6대 루트, 5대 교차 계승, 이세계편을 완주했습니다.',
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
      usedItemsAtNode: [],
      takenPickups: [],
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

    // Grants items (split into carried global vs local; never resurrects consumed items or already-taken pickups)
    (node.grants_items || []).forEach(function (itemId) {
      var item = this.itemMap[itemId];
      if (!item) return;
      var pickupKey = node.id + ':' + itemId;
      if (item.carries_across_timelines) {
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

    // Sets global flags (special guard: flag_global_all_jewels_collected only when all 6 light jewels collected)
    (node.sets_global_flags || []).forEach(function (gf) {
      if (gf === 'flag_global_all_jewels_collected' && this.globalState.collectedLightJewels.length < this.findableJewelIds.length) {
        return;
      }
      if (addUnique(this.globalState.globalFlags, gf)) {
        newlySetGlobalFlags.push(this.globalFlagMap[gf] || { id: gf });
      }
    }, this);

    // Auto-grant flag_global_all_jewels_collected if player gathered all 6 light jewels in any order!
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
          (xfer.target_gate_node_id === fromId || xfer.target_gate_node_id === toId) &&
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
    // - localState is restored from snapshot
    // - globalState (carriedItems, consumedItems, collectedLightJewels, globalFlags, discoveredNodes, unlockedEndings) is PRESERVED!
    this.localState = deepClone(snapshot);
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
      usedItemsAtNode: [],
      takenPickups: [],
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

    // 1. Iconic cross-timeline action: Study Key at Day 1 Hub -> Unlock Father's Study!
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

    // 2. Study Key at Study Unlock -> Clock 6 -> 3 puzzle -> Jewel #6!
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

    // 3. Blue Card at Kaori Security Gate -> Infiltrate Lab!
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

    // 4. Chounenseki at Kanna Crisis Gate -> Save Kanna!
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

    // 5. Silver Medal or Chounenseki at Mio Cave Puzzle
    if ((itemId === 'item_silver_medal' || itemId === 'item_chounenseki') && node.id === 'node_mio_cave_puzzle') {
      var mioRes = this.advanceToNode('node_mio_end');
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

    // 6. Kanna Student ID at School Gate -> Rooftop Kanna branch
    if (itemId === 'item_kanna_student_id' && node.id === 'node_school_day1_gate') {
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

    // 7. Entrusted Light at Sanctuary Climax -> True Ending!
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

    // 8. Kodai's Letter anywhere -> Clue
    if (itemId === 'item_kodai_letter') {
      this._pushLog('use_item', '코다이의 편지 재확인', node.id);
      return {
        ok: true,
        action: 'clue',
        item: item,
        message: '아버지 코다이의 편지: "리플렉터로 보옥을 남겨 평행세계를 왕래하라. 서재의 괘종시계는 [6 → 3]이다. 그리고 자실 서랍 설명서를 무심코 열지 마라..."',
      };
    }

    // Default helpful hint referencing SSOT target_route_ids
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
        targetNode: targetNode,
        mechanism_ko: xfer.mechanism_ko,
      };
    }, this);
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
    if (!Array.isArray(this.localState.usedItemsAtNode)) {
      this.localState.usedItemsAtNode = [];
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
