# 05. 정규 등장인물, 로케이션 및 콘텐츠 구조

본 문서는 [characters.json](verified_data/characters.json), [locations.json](verified_data/locations.json), [routes_and_endings.json](verified_data/routes_and_endings.json)의 SSOT 데이터를 기준으로 전체 콘텐츠 구성을 정리한다.

## 1. 정규 등장인물 20명 (`characters.json` / `characters.csv`) `[확인]`

### 1.1 현세편 및 양 세계 교차 인물 (12명)
| ID | 한국어 | 일본어 | 영문 | 등장 편 | 분류 | 핵심 역할 및 정체 |
|---|---|---|---|---|---|---|
| `char_takuya` | 아리마 타쿠야 | 有馬たくや | Takuya Arima | 양쪽 | 주인공 | 사카이마치 학원 3학년 · 코다이와 케이티아(무녀)의 아들 |
| `char_ayumi` | 아리마 아유미 | 有馬亜由美 | Ayumi Arima | 양쪽 | 히로인 | 계모 · 지오테크닉스 PM · 이세계편 **신제(神帝)** |
| `char_kanna` | 하타노 칸나 | 波多乃神奈 | Kanna Hatano | 현세 | 히로인 | 헤드폰 전학생 · 초념석 목걸이 · **서재의 열쇠** 보관자 |
| `char_mitsuki` | 이치죠 미츠키 | 一条美月 | Mitsuki Ichijo | 현세 | 히로인 | 학장 비서 · 타쿠야 전 연인 · 류조지 토장 경로 개방 |
| `char_mio` | 시마즈 미오 | 島津澪 | Mio Shimazu | 현세 | 히로인 | 동급생 · 검도부 주장 · 시장 영애 · 향토사/삼각산 연구 |
| `char_eriko` | 다케다 에리코 | 武田絵里子 | Eriko Takeda | 양쪽 | 히로인 | 학원 보건의 · 정체는 차원 감사관 **에이릭 쿼드로** |
| `char_kaori` | 아사쿠라 카오리 | 朝倉香織 | Kaori Asakura | 현세 | 히로인 | 인기 TV 앵커 · 지오테크닉스 사옥 잠입 및 초념석 루트 |
| `char_ryuzoji` | 류조지 코조 | 龍蔵寺幸三 | Kozo Ryuzoji | 양쪽 | 적대자 | 사카이마치 학원장 · 이세계 정신 기생체(차원 범죄자) |
| `char_toyotomi` | 도요토미 히데오 | 豊富秀夫 | Hideo Toyotomi | 현세 | 조연 | 지오테크닉스 해안 공사 현장감독 · 아유미 직속 부하 |
| `char_yuki` | 유우키 마사카츠 | 結城正勝 | Masakatsu Yuki | 현세 | 조연 | 학원 후배 · 미오 짝사랑 · 동굴 보옥 5 분기 파트너 |
| `char_kodai` | 아리마 코다이 | 有馬広大 | Kodai Arima | 양쪽 | 핵심 NPC | 친아버지 · 역사학자 · 리플렉터 디바이스 전달자 |
| `char_keiko` | 아리마 케이코 (케이티아) | 有馬恵子（ケイティア） | Keiko Arima (Keitia) | 양쪽 | 핵심 NPC | 친어머니 · 데라 그란트 전대 무녀 |

> **표기 교정 `[확인]`**: `島津澪`의 일본어 발음은 `しまず みお`이므로 정식 한국어 표기는 **시마즈 미오**이다. 일부 비공식 문서의 '시마자키 미오'는 오기이다. 또한 **도요토미 히데오**는 동급생이 아니라 **지오테크닉스 사원(아유미 부하)**이며, **아리마 아유미**는 의붓누나가 아니라 **의붓어머니(계모)**이다.

### 1.2 이세계편 데라 그란트 고유 인물 (8명)
| ID | 한국어 | 일본어 | 영문 | 분류 | 핵심 역할 및 정체 |
|---|---|---|---|---|---|
| `char_celes` | 세레스 | セーレス | Celes | 히로인 | 목소리를 잃은 도망친 무녀 · 유노의 친어머니 |
| `char_yuno` | 유노 | ユーノ | YU-NO | 히로인 | 타쿠야와 세레스의 딸 · 그란티아의 분령 · 타이틀 히로인 |
| `char_ailia` | 아이리아 | アイリア | Ailia | 조연 | 국경(보더) 경비 여기사 · 아만다의 친언니 |
| `char_amanda` | 아만다 | アマンダ | Amanda | 조연 | 반신제 레지스탕스 리더 · 아이리아의 여동생 |
| `char_kunkun` | 쿤쿤 | クンクン | Kun-Kun | 동료 | 변경에서 합류하는 이세계 동료 생물 |
| `char_sarah` | 사라 | サラ | Sarah | 조연 | 사막 오아시스 거주민 (원작과 TV 애니메이션 역할 일부 상이) |
| `char_buzz` | 바즈 (바즈크) | バズ（バズク） | Buzz | 적대자 | 성석 채굴장(강제노동소) 잔혹한 감독관 |
| `char_grantia` | 그란티아 (그랜드마더) | グランティア | Grantia | 핵심 NPC | 데라 그란트 세계 유지 의지·시스템 |

## 2. 로케이션 27개소 (`locations.json` / `locations.csv`) `[확인]`

### 2.1 현세편 사카이마치 19개소
- **아리마 저택 (5)**: 타쿠야의 방(`loc_arima_room`, ✨보옥 1), 거실(`loc_arima_living`), 아유미의 방(`loc_arima_ayumi_room`), 아버지의 서재(`loc_arima_study`, ✨보옥 6), 저택 앞(`loc_arima_exterior`)
- **사카이마치 학원 (6)**: 정문 앞(`loc_school_gate`), 홀(`loc_school_hall`), 2층 복도(`loc_school_corridor_2f`), 옥상(`loc_school_rooftop`), 보건실(`loc_school_infirmary`), 연구실(`loc_school_lab`)
- **켄노미사키 권역 (4)**: 해안·공사 현장(`loc_coast_construction`), 삼각산·쌍둥이 바위(`loc_triangle_mountain`, ✨보옥 3), 신사·사당(`loc_shrine`), 사당 지하 동굴(`loc_shrine_cave`, ✨보옥 5)
- **사카이마치 외곽·시가지 (4)**: 류조지 무가 저택(`loc_ryuzoji_mansion`), 류조지 토장·우물(`loc_ryuzoji_storehouse`, ✨보옥 2), 지오테크닉스 사옥(`loc_geo_technics`, ✨보옥 4), 시가지·상점가(`loc_town_street`)

### 2.2 이세계편 데라 그란트 8개소
- **변경 권역 (2)**: 국경 지대·보더(`loc_dg_border`), 아이리아의 집(`loc_dg_ailia_house`)
- **중부·사막 권역 (2)**: 성석 채굴장(`loc_dg_quarry`), 사막·오아시스(`loc_dg_desert_oasis`)
- **제도 권역 (3)**: 지하도(`loc_dg_underground_1`), 데라 그란트 제도(`loc_dg_imperial_city`), 성당(`loc_dg_sanctuary`)
- **차원 경계 (1)**: 사상의 틈새 · 부린더의 나무(`loc_dg_horizon_end`)

## 3. 엔딩 분류 (9종) `[확인]`
- **현세편 히로인 엔딩 6종**: 미츠키(`end_mitsuki_route`), 아유미(`end_ayumi_route`), 카오리(`end_kaori_route`), 미오(`end_mio_route`), 에리코(`end_eriko_route`), 칸나(`end_kanna_route`)
- **대표 소용돌이(배드엔드/진행 함정) 2종**: 토장 로프 미회수(`end_dead_storehouse_lockout`), 초념석 미보유 칸나 구명 실패(`end_dead_kanna_no_stone`)
- **최종 진엔딩 1종**: 데라 그란트 사상의 틈새 대단원(`end_true_yuno`)
