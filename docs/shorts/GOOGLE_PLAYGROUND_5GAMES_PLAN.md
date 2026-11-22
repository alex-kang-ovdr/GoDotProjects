# PlayHub 5대 게임 · 구글 Playground 스타일 쇼츠 기획 및 Google Flow (Veo 3.1) 프롬프트 북

> 대상 게임: **아이언 타이드 (`world-of-warships`)** · **비 시즈 / 아이언우드 (`besiege`)** · **넥서스 전선 (`league-of-legends`)** · **클래시 로얄 / 크라운폴 (`clash-royale`)** · **탕탕특공대 / 서바이버 아레나 (`survivor-io`)**

---

## 1. 구글 Playground 스타일 쇼츠 공통 아트 & 연출 디렉션

| 항목 | 디렉션 기준 |
|---|---|
| **포맷 / 규격** | `9:16` 세로 쇼츠 · `8초` (Beat 1 Hook `0–2.2s` → Beat 2 Action `2.2–5.8s` → Beat 3 Payoff & CTA `5.8–8.0s`) |
| **핵심 비주얼 톤** | **Tactile Miniature Diorama 3D** — 햇살이 감도는 밝은 스튜디오 테이블탑 위에서 매트 클레이·원목·무광 메탈·반투명 아크릴 미니어처 게임 월드가 살아 움직이는 촉각적 연출 |
| **컬러 팔레트** | 깨끗한 오프화이트/스튜디오 라이트 베이스 + Google 포인트 컬러(Cobalt `#4285F4` / `#004AC6`, Coral `#EA4335`, Amber `#FBBC04`, Mint `#34A853`) |
| **카메라 & 모션** | Tilt-Shift 매크로 드롭인 → 경쾌한 물리 스냅/바운스 → 저각 다이내믹 오빗/트래킹 → 상·하단 UI Safe Zone 확보한 히어로 풀업 |
| **사운드 (Veo 네이티브 오디오)** | 찰칵·톡·펑 촉각 ASMR SFX + 경쾌한 마림바/신스 비트 싱크 + 엔딩 승리 코드 스팅 |
| **공통 Google Flow 권장 설정** | `Model: Veo 3.1 Fast / Quality`, `Aspect Ratio: 9:16`, `Duration: 8s`, `Frames to Video: 각 게임 platform-cover.png/jpg 첨부`, `Audio: ON` |
| **공통 Negative Prompt** | `dark muddy lighting, cluttered tiny UI text, blurry unreadable letters, realistic gore, low-poly artifacts, shaky handheld camera, watermarks, letterboxing, horizontal black bars` |

---

## 2. 게임별 쇼츠 기획안 & Google Flow 프롬프트

### 1) 아이언 타이드 (`world-of-warships` · IRON TIDE · 해전 전술)
- **쇼츠 컨셉**: 투명한 딥-틸 아크릴 바다 보드 위에서 순양함 `청해` 미니어처가 항로 화살표를 따라 미끄러지며 포탑을 회전하고, 빛나는 3연장 일제사격으로 적함을 제압하는 해상 디오라마 쇼츠.
- **3-Beat 타임라인**:
  - **Beat 1 (0.0s–2.2s · Hook)**: `"바다를 읽고, 한 방에 제압하라!"` — 틸트시프트 매크로 드롭인, 투명 아크릴 바다 위 형광 시안 항로 화살표가 착착 표시되며 `청해` 순양함 출격.
  - **Beat 2 (2.2s–5.8s · Action)**: `"항로 설계 · 포탑 회전 · 일제사격!"` — 저각 오빗 카메라, 포탑 자석 록온 클릭 후 따뜻한 앰버 포탄 궤적이 군도를 넘어 적함에 화이트·시안 물보라 폭발.
  - **Beat 3 (5.8s–8.0s · CTA)**: `"PLAY HUB에서 아이언 타이드 즉시 출격 ▶"` — 상공 히어로 풀업, 코발트 블루 거점 점령 링 발광 + 하단 CTA 여백 확보.
- **Google Flow 마스터 원샷 프롬프트 (복사용)**:
```text
Vertical 9:16 game trailer short (8s) in Google Playground 3D tactile miniature diorama style introducing "Iron Tide: Naval Tactics". (0-2.2s) Tilt-shift macro drop-in over a sunlit translucent deep-teal acrylic ocean tabletop with sculpted rocky archipelago islands; a sleek matte-steel cruiser glides smoothly as glowing cyan tactical route paths snap onto the water. (2.2-5.8s) Dynamic low-angle orbit as stylized turrets click into place and fire luminous warm-amber salvo arcs across the sea, landing with vibrant stylized splash plumes and mint radar rings. (5.8-8s) Smooth pull-up as a bright cobalt capture zone illuminates beneath the ship with clean uncluttered lower framing for CTA. Tactile matte-plastic and glass shaders, vibrant studio bounce light, zero dark muddiness, no watermarks. Audio: crisp sonar ping, tactile turret clicks, upbeat playful synth percussion, punchy stylized splash pops.
```
- **Google Flow SceneBuilder 확장 프롬프트**:
  - **Scene 1 (0–2.2s)**: `Vertical 9:16 Google Playground style 3D miniature diorama. A stylized matte-metal naval cruiser glides across a sunlit translucent deep-teal acrylic ocean table dotted with sculpted minimalist archipelago islands. Glowing cyan holographic route arrows snap smoothly onto the water ahead of the bow. Crisp studio bounce lighting, tilt-shift macro lens, playful clean geometry, bubbly sonar ping audio.`
  - **Scene 2 (2.2–5.8s)**: `Continue seamlessly in 9:16 Google Playground miniature style. Camera swoops low around the cruiser deck as chunky stylized turrets click into alignment with bright mint-teal targeting rings. All cannons fire in a rhythmic salvo, launching glowing warm-amber shells across the archipelago in graceful luminous arcs that erupt into crisp stylized white-and-cyan foam plumes on an enemy battleship. Rhythmic synth beat synced with cannon pops.`
  - **Scene 3 (5.8–8.0s)**: `Pull camera smoothly upward into a crisp heroic 9:16 overhead diorama view. A glowing electric cobalt-blue capture ring lights up around the victorious cruiser as gentle concentric ripples expand across the glossy teal sea. Clean uncluttered lower third for end-card typography, triumphant bright synth chord sting.`
- **PlayHub 등록 메타**: 제목 `아이언 타이드 · 8초 해상 디오라마 일제사격` / 해시태그 `#아이언타이드 #해전전술 #PlayHub #PlayForge #GoogleFlow #게임쇼츠`

---

### 2) 비 시즈 (`besiege` · IRONWOOD · 공성 공방)
- **쇼츠 컨셉**: 파스텔 세이지 공방 테이블 위에서 원목 블록·강철 보강·바퀴·대포가 자석처럼 경쾌하게 조립(Snap)되고, 즉시 출격해 한 방의 대포알로 돌초소 3개 탑을 도미노처럼 무너뜨리는 초만족 물리 샌드박스 쇼츠.
- **3-Beat 타임라인**:
  - **Beat 1 (0.0s–2.2s · Hook)**: `"직접 조립하고, 탑을 와르르!"` — 스톱모션 리듬의 원목 블록·바퀴·대포 자석 조립 ASMR.
  - **Beat 2 (2.2s–5.8s · Action)**: `"시뮬레이션 시작 · 물리 연쇄 붕괴!"` — 로우 트래킹 주행 → 대포알 발사 → 슬로우모션 임팩트로 크림색 돌초소 탑 연쇄 붕괴.
  - **Beat 3 (5.8s–8.0s · CTA)**: `"PLAY HUB에서 나만의 공성차 만들기 ▶"` — 공성차 바운스 세리머니 + 하늘에 황금 별 3개 팝업.
- **Google Flow 마스터 원샷 프롬프트 (복사용)**:
```text
Vertical 9:16 game trailer short (8s) in Google Playground tactile 3D toy-box physics style introducing "Ironwood: Siege Workshop" (Besiege-inspired). (0-2.2s) Sunlit pastel sage-green workshop tabletop; warm wooden blocks, iron braces, chunky wheels, and a top-mounted miniature cannon snap magnetically together in rhythmic stop-motion-like pops to form a siege cart. (2.2-5.8s) Low playful tracking shot as the cart accelerates forward and fires a glossy cannonball with a bright coral-amber puff; brief heroic slow-motion impact shatters three cream-stone outpost towers into joyful cascading physics blocks. (5.8-8s) Celebratory camera pull-back with three glossy golden stars popping in the clean bright sky and spacious lower framing for CTA. Tactile wood and matte clay shaders, soft Google studio daylight, zero clutter, no watermarks. Audio: crisp wooden snap ASMR, gear roll, punchy toy cannon pop, cascading block tumble, cheerful upbeat synth chime.
```
- **Google Flow SceneBuilder 확장 프롬프트**:
  - **Scene 1 (0–2.2s)**: `Vertical 9:16 Google Playground tactile 3D diorama on a sunlit pastel sage-green drafting mat. Warm maple-wood blocks, iron cross-braces, four chunky spoked wheels, and a gleaming charcoal miniature cannon fly in and snap magnetically together in crisp playful rhythm to build a charming siege rover. Soft global illumination, tactile wood-grain and matte-iron toy shaders, snappy wooden clack ASMR audio.`
  - **Scene 2 (2.2–5.8s)**: `Continue seamlessly in 9:16 Google Playground style. The wooden siege cart springs to life, rolling energetically across the bright minimalist meadow with tiny dust puffs. Its top cannon pops with a colorful orange-gold burst, launching a glossy iron sphere in dramatic brief slow-motion right into three stacked cream-stone outpost towers, scattering blocks like joyful physics dominoes in every direction. Satisfying impact pop and tumbling block clatter.`
  - **Scene 3 (5.8–8.0s)**: `Smooth upbeat zoom-out in 9:16 framing showing the cute wooden siege cart doing a celebratory bounce while three glossy golden stars pop gently into the sunlit pastel sky above the collapsed stone tower. Clean bright lower area reserved for PlayHub CTA button, cheerful playful marimba finale.`
- **PlayHub 등록 메타**: 제목 `비 시즈(아이언우드) · 블록 조립 3초 만에 돌탑 붕괴!` / 해시태그 `#비시즈 #아이언우드 #물리샌드박스 #PlayHub #PlayForge #GoogleFlow`

---

### 3) 넥서스 전선 (`league-of-legends` · NEXUS FRONT)
- **쇼츠 컨셉**: 에메랄드 숲과 유리 같은 강이 흐르는 보드게임형 미니어처 미드 레인에서 궁수 영웅 `키라`가 적 투사체를 구르기로 회피한 뒤 청록색 크리스탈 화살비 궁극기로 적 포탑을 산산조각 내는 스피디 MOBA 쇼츠.
- **3-Beat 타임라인**:
  - **Beat 1 (0.0s–2.2s · Hook)**: `"궁극기 화살비로 전선을 뒤집어라!"` — 미드 레인 3/4 디오라마 활강, 시안 크리스탈 포탑과 `키라`의 청록 바람 궤적.
  - **Beat 2 (2.2s–5.8s · Action)**: `"회피 구르기 → R 화살비 일점사!"` — 붉은 적 탄막을 아슬아슬 대시 회피 후 시안·골드 크리스탈 화살비 궁극기 폭발.
  - **Beat 3 (5.8s–8.0s · CTA)**: `"PLAY HUB에서 넥서스 전선 즉시 참전 ▶"` — 적 포탑 프리즘 붕괴 & 넥서스 진격 피날레.
- **Google Flow 마스터 원샷 프롬프트 (복사용)**:
```text
Vertical 9:16 game trailer short (8s) in Google Playground stylized 3D tabletop MOBA diorama style introducing "Nexus Front". (0-2.2s) Smooth 3/4 diorama glide down a sunlit sandstone mid-lane bordered by stylized emerald forest, sparkling translucent river, and glowing cyan crystal turrets; agile miniature archer hero Kira darts forward with crisp turquoise motion trails. (2.2-5.8s) Dynamic zoom-in as Kira executes a nimble dash-roll dodging bright coral-red enemy bolts, then launches a breathtaking volley of glowing cyan-and-gold crystal arrows raining onto the enemy squad and crimson turret in colorful geometric particle bursts. (5.8-8s) Enemy turret shatters into playful glowing crystal prisms as the blue wave pushes toward the Nexus, resolving with bright cobalt highlights and clean lower framing for CTA. Polished vinyl-and-glass toy shaders, vivid studio lighting, no text clutter, no watermarks. Audio: sleek dash whoosh, crystalline arrow shimmer, punchy electro beat drop.
```
- **Google Flow SceneBuilder 확장 프롬프트**:
  - **Scene 1 (0–2.2s)**: `Vertical 9:16 Google Playground stylized 3D miniature MOBA diorama. Camera glides rapidly down a warm sandstone diagonal mid-lane flanked by lush deep-emerald stylized forest and a shimmering glass-like river. Tiny glossy cyan crystal turrets glow brightly as geometric miniature archer hero Kira dashes forward with crisp turquoise wind ribbons. Clean volumetric studio rim light, vibrant polished game-piece aesthetic.`
  - **Scene 2 (2.2–5.8s)**: `Continue seamlessly in 9:16 Google Playground style. Miniature archer Kira performs an agile luminous dash dodge around bright coral-red enemy energy projectiles, leaps smoothly, and unleashes a dazzling fan of crystalline cyan-and-gold light arrows arcing high and raining down onto the enemy frontline and crimson crystal turret in vivid bursts of sparkling geometric particles. Snappy beat-synced electro percussion and shimmering bow chime.`
  - **Scene 3 (5.8–8.0s)**: `Sweeping heroic 9:16 finish as the crimson crystal turret pops into clean sparkling translucent prism shards and allied miniature minions cheer and surge toward the glowing Nexus core. Vibrant cobalt and cyan victory glow, clean uncluttered lower third for CTA overlay, crisp uplifting synth drop.`
- **PlayHub 등록 메타**: 제목 `넥서스 전선 · 3초 화살비 궁극기 포탑 돌파!` / 해시태그 `#넥서스전선 #MOBA #PlayHub #PlayForge #GoogleFlow #게임쇼츠`

---

### 4) 클래시 로얄 (`clash-royale` · CROWNFALL · 크라운폴 아레나)
- **쇼츠 컨셉**: 아이보리·골드 카드가 에메랄드 2레인 보드 아레나에 착! 내려꽂히는 순간 보라색 엘릭서 파동과 함께 3D 미니어처 기사가 팝업 북처럼 튀어나와 양쪽 다리 동시 역전을 완성하는 Google Playground 팝업 카드 쇼츠.
- **3-Beat 타임라인**:
  - **Beat 1 (0.0s–2.2s · Hook)**: `"카드 한 장으로 전장을 뒤집어라!"` — 골드 기사 카드 드롭 → 보라색 엘릭서 파동 → 3D 기사 피규어 팝업 소환.
  - **Beat 2 (2.2s–5.8s · Action)**: `"기사 돌격 + 화살비 완벽 카운터!"` — 좌측 레인 기사·대포 진격 & 우측 레인 황금 화살비 고블린 정리 동시 스윕.
  - **Beat 3 (5.8s–8.0s · CTA)**: `"PLAY HUB에서 크라운폴 아레나 대전 ▶"` — 적 크라운 타워 폭죽 붕괴 & 3D 황금 왕관 바운스 등장.
- **Google Flow 마스터 원샷 프롬프트 (복사용)**:
```text
Vertical 9:16 game trailer short (8s) in Google Playground 3D pop-up board-game diorama style introducing "Crownfall Arena" (Clash Royale-inspired). (0-2.2s) A glossy ivory-and-gold strategy card drops smoothly onto a sunlit emerald dual-lane tabletop arena, triggering a translucent purple elixir ripple as a chunky stylized miniature Knight figurine springs up like a pop-up toy with shield and sword. (2.2-5.8s) Fast rhythmic swoop across both bridges as the Knight and a miniature wheeled Cannon push the left tower while a gleaming golden arrow volley sweeps tiny purple goblins on the right lane into joyful confetti sparkles. (5.8-8s) The enemy tower pops into gold sparkles and a shiny 3D Golden Crown bounces victoriously in upper-center frame with clean uncluttered lower framing for CTA. Tactile matte-vinyl toy shaders, crisp daylight bounce, zero messy UI text, no watermarks. Audio: crisp card snap, bubbly elixir pop, playful brass fanfare, sparkling crown victory chime.
```
- **Google Flow SceneBuilder 확장 프롬프트**:
  - **Scene 1 (0–2.2s)**: `Vertical 9:16 Google Playground 3D tactile board-game diorama. A sleek rounded ivory-and-gold strategy card hovers above a sunlit dual-bridge emerald arena, snaps smoothly down onto the tile with a glossy purple elixir ripple, and transforms instantly like a luxury pop-up toy into a charming chunky miniature Knight figurine raising a cobalt shield and gleaming sword. Crisp studio lighting, vinyl figurine texture, crisp card-snap and elixir pop audio.`
  - **Scene 2 (2.2–5.8s)**: `Continue seamlessly in 9:16 Google Playground miniature style. Camera sweeps swiftly across both symmetrical bridges of the emerald tabletop arena: the miniature Knight charges boldly beside a rolling toy Cannon on the left lane while a bright volley of golden-tipped arrows arcs cleanly across the right lane, popping mischievous purple goblin figurines into harmless confetti sparkles. Snappy upbeat horn-and-synth groove.`
  - **Scene 3 (5.8–8.0s)**: `Joyful 9:16 climax as the opposing stone crown tower pops open into golden confetti and a gleaming oversized 3D golden Crown bounces playfully into the center-upper frame above the bright emerald arena. Clean royal-slate gradient fade along the bottom third for CTA button, triumphant brass-and-chime victory sting.`
- **PlayHub 등록 메타**: 제목 `클래시 로얄(크라운폴) · 팝업 카드 한 장으로 왕관 역전!` / 해시태그 `#클래시로얄 #크라운폴 #카드전략 #PlayHub #PlayForge #GoogleFlow`

---

### 5) 탕탕특공대 (`survivor-io` · 서바이버 아레나)
- **쇼츠 컨셉**: 앰버 네온 그리드가 빛나는 미드나잇 토이 아레나에서 100마리 미니 몬스터에 포위된 특공대 히어로가 아슬아슬 대시로 보석을 자석 흡수한 뒤, 쿠나이 진화 각성으로 360도 화면을 싹쓸이하는 극강의 도파민 쇼츠.
- **3-Beat 타임라인**:
  - **Beat 1 (0.0s–2.2s · Hook)**: `"100마리 포위?! 한 끗 차이 대시!"` — 사방 포위 위기에서 반짝이는 시안 대시 탈출 + 에메랄드 경험치 보석 연쇄 흡수.
  - **Beat 2 (2.2s–5.8s · Action)**: `"쿠나이 진화 각성 · 화면 싹쓸이 쾌감!"` — 황금 레벨업 링 폭발 → 쌍 쿠나이 블래스터 & 회전 드론 360도 연사로 적 웨이브 일소.
  - **Beat 3 (5.8s–8.0s · CTA)**: `"PLAY HUB에서 탕탕특공대 5분 생존 도전 ▶"` — 거대 토이 메카 보스 등장 티저 + 히어로 프리즈 프레임.
- **Google Flow 마스터 원샷 프롬프트 (복사용)**:
```text
Vertical 9:16 game trailer short (8s) in Google Playground vibrant 3D toy-arcade diorama style introducing "Survivor Arena" (Survivor.io / 탕탕특공대-inspired). (0-2.2s) Sleek midnight-navy tabletop arena with glowing amber grid lines; a plucky chunky miniature hero in a cobalt scarf is surrounded by dozens of colorful geometric toy monsters closing in, then pulls off a snappy cyan dash through a razor-thin gap while magnetizing sparkling emerald XP gems. (2.2-5.8s) A radiant golden level-up burst evolves the hero’s kunai into twin rapid-fire glowing energy blasters and orbiting blue drones, unleashing a hyper-satisfying 360-degree stream that pops the entire wave into showers of bouncing neon gems and gold coins. (5.8-8s) Energetic hero pose in the foreground as a giant playful crimson-and-gold toy boss drops into the upper background, leaving clean lower framing for CTA. Glossy vinyl toy shaders, crisp studio rim light, zero cluttered UI text, no watermarks. Audio: ascending gem-pickup chimes, punchy level-up chord, rapid arcade pop-synth groove.
```
- **Google Flow SceneBuilder 확장 프롬프트**:
  - **Scene 1 (0–2.2s)**: `Vertical 9:16 Google Playground vibrant 3D miniature arcade arena. In a sleek midnight-indigo studio arena accented with glowing warm-amber grid lines, a plucky chunky stylized survivor hero with a cobalt scarf is encircled by dozens of cute colorful round geometric monster toys bouncing inward. In crisp brief slow-motion, the hero executes a sparkling cyan dash right through a tiny gap, collecting a sweeping trail of glowing emerald XP gems. Ascending xylophone chime audio.`
  - **Scene 2 (2.2–5.8s)**: `Continue seamlessly in 9:16 Google Playground neon-toy style. A brilliant golden-amber level-up halo bursts beneath the survivor hero, evolving their weapon into twin floating luminous golden kunai blasters and orbiting electric blue drones. Hyper-satisfying rapid streams of glowing amber-and-cyan darts fan out 360 degrees, popping the entire wave of geometric monsters into vibrant showers of sparkling green gems and gold coins that magnetize into the hero. High-energy arcade pop synth drop.`
  - **Scene 3 (5.8–8.0s)**: `Punchy 9:16 finale: the powered-up miniature hero strikes a confident pose glowing with golden aura as a playful oversized crimson-and-gold toy boss stomps into the upper background with a rhythmic bounce shockwave. Clean dark-cobalt lower third ready for PlayHub CTA button, energetic arcade victory sting.`
- **PlayHub 등록 메타**: 제목 `탕탕특공대(서바이버 아레나) · 100마리 포위 쿠나이 진화 싹쓸이!` / 해시태그 `#탕탕특공대 #서바이버아레나 #뱀서라이크 #PlayHub #PlayForge #GoogleFlow`

---

## 3. PoC 연동 검증 사이트 활용 방법

라이브 서버의 `/forge/OfficialGodot/shorts-poc.html`에서 위 5종 게임의 **구글 Playground 기획 · Google Flow 프롬프트 복사 · PlayCoin Hold→Generate→Settle · 허브 내 게임 소개 영상 등록 · HTTP 206 스트림 & 쇼츠 피드/게임 상세 연동** 전체 흐름을 원클릭으로 실측 검증할 수 있습니다.
