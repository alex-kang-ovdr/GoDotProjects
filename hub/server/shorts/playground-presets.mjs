// Google Playground Style Game Intro Shorts Creative Plans & Google Flow (Veo 3.1) Prompts
// Featured 5 PlayHub Games: Iron Tide, Besiege (Ironwood), Nexus Front, Clash Royale (Crownfall), Survivor.io (탕탕특공대)
import { GOOGLE_FLOW_WEB_URL } from './engines.mjs';

export const GOOGLE_PLAYGROUND_STYLE_GUIDE = Object.freeze({
  id: 'google-playground',
  name: 'Google Playground · 3D Tactile Diorama Shorts',
  aspectRatio: '9:16',
  durationSec: 8,
  recommendedModel: 'Google Flow · Veo 3.1 (Fast / Quality) + Frames-to-Video',
  corePillars: [
    'Tactile Miniature Diorama: 매트 클레이·원목·무광 메탈·반투명 아크릴 질감의 손에 잡힐 듯한 미니어처 테이블탑 월드',
    'Sunlit Studio Bounce + Google Accent Pop: 밝은 스튜디오 바운스 라이팅 위에 코발트 블루(#4285F4)·코랄(#EA4335)·앰버(#FBBC04)·민트(#34A853) 포인트 컬러 강조',
    'Playful Physics & Magnetic Snap: 블록이 자석처럼 착착 조립되고, 미니어처 유닛이 튀어오르며, 3컷 비트 싱크로 경쾌하게 전개',
    'Clean 9:16 Vertical Framing: 상단 타이틀·하단 PlayHub CTA 안전 여백(Safe Zone)을 비워 UI 가독성과 플레이 전환 극대화',
    'ASMR + Playful Pop Synth Audio: 찰칵·톡·펑 하는 촉각적 SFX와 경쾌한 신스 리듬을 Veo 네이티브 오디오로 동기화'
  ],
  negativePrompt: 'dark muddy lighting, cluttered tiny UI text, blurry unreadable letters, realistic gore, low-poly artifacts, shaky handheld camera, watermarks, letterboxing, horizontal black bars'
});

export const PLAYGROUND_GAME_PLANS = Object.freeze([
  {
    order: 1,
    gameId: 'world-of-warships',
    koreanAlias: '아이언 타이드',
    titleKo: 'IRON TIDE · 해전 전술',
    titleEn: 'Iron Tide: Naval Tactics',
    genreLabel: '해전 전술 · 전략',
    coverUrl: '/games/world-of-warships/assets/platform-cover.png',
    stylePreset: 'google-playground',
    cameraMotion: 'orbit-pan',
    recommendedEngine: 'google-flow-veo-fast',
    playgroundConcept: '투명한 아크릴 바다 보드 위에서 정교한 미니어처 순양함(청해)이 항로를 그리며 포탑을 회전하고, 무지갯빛 물보라와 함께 3연장 일제사격을 터뜨리는 Google Playground 해상 디오라마 쇼츠',
    hookText: '바다를 읽고, 한 방에 제압하라!',
    highlightText: '항로 설계부터 3연장 포격까지 · 8초 해전 쾌감',
    ctaText: 'PLAY HUB에서 아이언 타이드 즉시 출격 ▶',
    suggestedTitle: '아이언 타이드 · 8초 해상 디오라마 일제사격',
    suggestedCaption: '투명한 북쪽 군도 바다 위, 순양함 청해로 완벽한 항로와 일제사격을 지휘하세요! 설치 없이 브라우저 즉시 플레이.',
    hashtags: ['#아이언타이드', '#해전전술', '#PlayHub', '#PlayForge', '#GoogleFlow', '#게임쇼츠'],
    audioCue: 'Crisp sonar ping at 0.2s, magnetic turret lock clicks, upbeat rhythmic marimba-synth pulse, punchy stylized cannon salvo pop with sparkling water splash chime.',
    scenes: [
      {
        index: 1,
        role: 'hook',
        label: 'Beat 1 · 미니어처 함대 출격 (0.0s–2.2s)',
        startSec: 0,
        endSec: 2.2,
        headline: '바다를 읽고, 한 방에 제압하라!',
        camera: 'Top-down macro tilt-shift drop-in onto a sleek matte-slate cruiser gliding across translucent teal resin water',
        flowScenePrompt: 'Vertical 9:16 Google Playground style 3D miniature diorama. A stylized matte-metal naval cruiser glides across a sunlit translucent deep-teal acrylic ocean table dotted with sculpted minimalist archipelago islands. Glowing cyan holographic route arrows snap smoothly onto the water ahead of the bow. Crisp studio bounce lighting, tilt-shift macro lens, playful clean geometry, bubbly sonar ping audio.'
      },
      {
        index: 2,
        role: 'gameplay',
        label: 'Beat 2 · 포탑 조준 & 3연장 일제사격 (2.2s–5.8s)',
        startSec: 2.2,
        endSec: 5.8,
        headline: '항로 설계 · 포탑 회전 · 일제사격!',
        camera: 'Dynamic sweeping low-angle orbit around rotating twin turrets firing bright amber-coral tracer arcs',
        flowScenePrompt: 'Continue seamlessly in 9:16 Google Playground miniature style. Camera swoops low around the cruiser deck as chunky stylized turrets click into alignment with bright mint-teal targeting rings. All cannons fire in a rhythmic salvo, launching glowing warm-amber shells across the archipelago in graceful luminous arcs that erupt into crisp stylized white-and-cyan foam plumes on an enemy battleship. Rhythmic synth beat synced with cannon pops.'
      },
      {
        index: 3,
        role: 'cta',
        label: 'Beat 3 · 거점 점령 피날레 & CTA (5.8s–8.0s)',
        startSec: 5.8,
        endSec: 8.0,
        headline: 'PLAY HUB에서 아이언 타이드 즉시 출격 ▶',
        camera: 'Hero pull-up into clean cobalt-blue victory ring around the captured sea zone with open safe space for CTA',
        flowScenePrompt: 'Pull camera smoothly upward into a crisp heroic 9:16 overhead diorama view. A glowing electric cobalt-blue capture ring lights up around the victorious cruiser as gentle concentric ripples expand across the glossy teal sea. Clean uncluttered lower third for end-card typography, triumphant bright synth chord sting.'
      }
    ],
    masterFlowPrompt: 'Vertical 9:16 game trailer short (8s) in Google Playground 3D tactile miniature diorama style introducing "Iron Tide: Naval Tactics". (0-2.2s) Tilt-shift macro drop-in over a sunlit translucent deep-teal acrylic ocean tabletop with sculpted rocky archipelago islands; a sleek matte-steel cruiser glides smoothly as glowing cyan tactical route paths snap onto the water. (2.2-5.8s) Dynamic low-angle orbit as stylized turrets click into place and fire luminous warm-amber salvo arcs across the sea, landing with vibrant stylized splash plumes and mint radar rings. (5.8-8s) Smooth pull-up as a bright cobalt capture zone illuminates beneath the ship with clean uncluttered lower framing for CTA. Tactile matte-plastic and glass shaders, vibrant studio bounce light, zero dark muddiness, no watermarks. Audio: crisp sonar ping, tactile turret clicks, upbeat playful synth percussion, punchy stylized splash pops.'
  },
  {
    order: 2,
    gameId: 'besiege',
    koreanAlias: '비 시즈 (아이언우드)',
    titleKo: 'IRONWOOD · 공성 공방',
    titleEn: 'Ironwood: Siege Workshop (Besiege)',
    genreLabel: '물리 공성 · 샌드박스',
    coverUrl: '/games/besiege/assets/platform-cover.png',
    stylePreset: 'google-playground',
    cameraMotion: 'fast-cuts',
    recommendedEngine: 'google-flow-veo-pro',
    playgroundConcept: '밝은 파스텔 세이지 워크숍 테이블 위에서 원목 블록·바퀴·대포가 레고처럼 자석 결합(Snap)되어 나만의 공성차가 완성되고, 한 방의 물리 폭발로 돌초소 탑을 와르르 무너뜨리는 초만족 물리 플레이그라운드 쇼츠',
    hookText: '직접 조립하고, 탑을 와르르 무너뜨려라!',
    highlightText: '목재 블록·바퀴·대포 조립 → 3D 물리 붕괴 쾌감',
    ctaText: 'PLAY HUB에서 나만의 공성차 만들기 ▶',
    suggestedTitle: '비 시즈(아이언우드) · 블록 조립 3초 만에 돌탑 붕괴!',
    suggestedCaption: '원목 블록과 바퀴, 대포를 마음대로 조립하고 시뮬레이션 시작! 물리 엔진으로 목표 탑을 무너뜨리는 공성 공방.',
    hashtags: ['#비시즈', '#아이언우드', '#물리샌드박스', '#PlayHub', '#PlayForge', '#GoogleFlow'],
    audioCue: 'Satisfying wooden block clacks and magnetic snap sounds in rapid rhythm, playful gear wind-up, bouncy cannon thump, cascading wooden/stone domino tumble chime.',
    scenes: [
      {
        index: 1,
        role: 'hook',
        label: 'Beat 1 · 자석 블록 초고속 조립 (0.0s–2.2s)',
        startSec: 0,
        endSec: 2.2,
        headline: '직접 조립하고, 탑을 와르르!',
        camera: 'Snappy stop-motion-inspired studio macro shot on bright sage-cream drafting mat as wooden blocks snap together',
        flowScenePrompt: 'Vertical 9:16 Google Playground tactile 3D diorama on a sunlit pastel sage-green drafting mat. Warm maple-wood blocks, iron cross-braces, four chunky spoked wheels, and a gleaming charcoal miniature cannon fly in and snap magnetically together in crisp playful rhythm to build a charming siege rover. Soft global illumination, tactile wood-grain and matte-iron toy shaders, snappy wooden clack ASMR audio.'
      },
      {
        index: 2,
        role: 'gameplay',
        label: 'Beat 2 · 출격 주행 & 돌초소 연쇄 붕괴 (2.2s–5.8s)',
        startSec: 2.2,
        endSec: 5.8,
        headline: '시뮬레이션 시작 · 물리 연쇄 붕괴!',
        camera: 'Low playful tracking shot beside rolling wheels, whipping forward to follow the cannonball smashing three cream stone towers',
        flowScenePrompt: 'Continue seamlessly in 9:16 Google Playground style. The wooden siege cart springs to life, rolling energetically across the bright minimalist meadow with tiny dust puffs. Its top cannon pops with a colorful orange-gold burst, launching a glossy iron sphere in dramatic brief slow-motion right into three stacked cream-stone outpost towers, scattering blocks like joyful physics dominoes in every direction. Satisfying impact pop and tumbling block clatter.'
      },
      {
        index: 3,
        role: 'cta',
        label: 'Beat 3 · 별 3개 클리어 팝 & CTA (5.8s–8.0s)',
        startSec: 5.8,
        endSec: 8.0,
        headline: 'PLAY HUB에서 나만의 공성차 만들기 ▶',
        camera: 'Bouncy hero reveal of the triumphant wooden cart amid tidy tumbling blocks with bright sunlit sky space',
        flowScenePrompt: 'Smooth upbeat zoom-out in 9:16 framing showing the cute wooden siege cart doing a celebratory bounce while three glossy golden stars pop gently into the sunlit pastel sky above the collapsed stone tower. Clean bright lower area reserved for PlayHub CTA button, cheerful playful marimba finale.'
      }
    ],
    masterFlowPrompt: 'Vertical 9:16 game trailer short (8s) in Google Playground tactile 3D toy-box physics style introducing "Ironwood: Siege Workshop" (Besiege-inspired). (0-2.2s) Sunlit pastel sage-green workshop tabletop; warm wooden blocks, iron braces, chunky wheels, and a top-mounted miniature cannon snap magnetically together in rhythmic stop-motion-like pops to form a siege cart. (2.2-5.8s) Low playful tracking shot as the cart accelerates forward and fires a glossy cannonball with a bright coral-amber puff; brief heroic slow-motion impact shatters three cream-stone outpost towers into joyful cascading physics blocks. (5.8-8s) Celebratory camera pull-back with three glossy golden stars popping in the clean bright sky and spacious lower framing for CTA. Tactile wood and matte clay shaders, soft Google studio daylight, zero clutter, no watermarks. Audio: crisp wooden snap ASMR, gear roll, punchy toy cannon pop, cascading block tumble, cheerful upbeat synth chime.'
  },
  {
    order: 3,
    gameId: 'league-of-legends',
    koreanAlias: '넥서스전선',
    titleKo: 'NEXUS FRONT · 넥서스 전선',
    titleEn: 'Nexus Front',
    genreLabel: 'MOBA · 팀 대전 액션',
    coverUrl: '/games/league-of-legends/assets/platform-cover.jpg',
    stylePreset: 'google-playground',
    cameraMotion: 'dynamic-zoom',
    recommendedEngine: 'google-flow-veo-fast',
    playgroundConcept: '에메랄드 숲과 강이 흐르는 보드게임형 미니어처 소환사 협곡 위에서 원거리 궁수 영웅(키라)이 구르기로 스킬을 피하고 빛나는 청록색 화살비 궁극기로 포탑과 넥서스 전선을 돌파하는 Google Playground 스타일 MOBA 쇼츠',
    hookText: '궁극기 화살비로 전선을 뒤집어라!',
    highlightText: '스킬 콤보 · 포탑 돌파 · 넥서스 진격 한타',
    ctaText: 'PLAY HUB에서 넥서스 전선 즉시 참전 ▶',
    suggestedTitle: '넥서스 전선 · 3초 화살비 궁극기 포탑 돌파!',
    suggestedCaption: 'Q·W·E·R 스킬 콤보와 미니언 웨이브 운영으로 상대 넥서스를 파괴하세요! 가볍고 쾌적한 웹 MOBA 액션.',
    hashtags: ['#넥서스전선', '#MOBA', '#PlayHub', '#PlayForge', '#GoogleFlow', '#게임쇼츠'],
    audioCue: 'Crisp bowstring shimmer, kinetic dash whoosh, sparkling crystalline arrow-rain cascade, deep resonant turret crystal shatter, heroic electronic drop.',
    scenes: [
      {
        index: 1,
        role: 'hook',
        label: 'Beat 1 · 미드 레인 미니어처 전장 오픈 (0.0s–2.2s)',
        startSec: 0,
        endSec: 2.2,
        headline: '궁극기 화살비로 전선을 뒤집어라!',
        camera: 'Elevated 3/4 diorama glide down the sandstone mid lane between glowing cyan crystal turrets and lush emerald trees',
        flowScenePrompt: 'Vertical 9:16 Google Playground stylized 3D miniature MOBA diorama. Camera glides rapidly down a warm sandstone diagonal mid-lane flanked by lush deep-emerald stylized forest and a shimmering glass-like river. Tiny glossy cyan crystal turrets glow brightly as geometric miniature archer hero Kira dashes forward with crisp turquoise wind ribbons. Clean volumetric studio rim light, vibrant polished game-piece aesthetic.'
      },
      {
        index: 2,
        role: 'gameplay',
        label: 'Beat 2 · 바람 구르기 회피 → R 화살비 폭발 (2.2s–5.8s)',
        startSec: 2.2,
        endSec: 5.8,
        headline: '회피 구르기 → R 화살비 일점사!',
        camera: 'Tight dynamic action zoom into hero tumbling past crimson enemy bolts, then tilting upward as luminous cyan arrows rain down',
        flowScenePrompt: 'Continue seamlessly in 9:16 Google Playground style. Miniature archer Kira performs an agile luminous dash dodge around bright coral-red enemy energy projectiles, leaps smoothly, and unleashes a dazzling fan of crystalline cyan-and-gold light arrows arcing high and raining down onto the enemy frontline and crimson crystal turret in vivid bursts of sparkling geometric particles. Snappy beat-synced electro percussion and shimmering bow chime.'
      },
      {
        index: 3,
        role: 'cta',
        label: 'Beat 3 · 포탑 붕괴 & 넥서스 진격 CTA (5.8s–8.0s)',
        startSec: 5.8,
        endSec: 8.0,
        headline: 'PLAY HUB에서 넥서스 전선 즉시 참전 ▶',
        camera: 'Triumphant sweep past shattering crimson crystal shards toward the glowing enemy Nexus with clean lower CTA framing',
        flowScenePrompt: 'Sweeping heroic 9:16 finish as the crimson crystal turret pops into clean sparkling translucent prism shards and allied miniature minions cheer and surge toward the glowing Nexus core. Vibrant cobalt and cyan victory glow, clean uncluttered lower third for CTA overlay, crisp uplifting synth drop.'
      }
    ],
    masterFlowPrompt: 'Vertical 9:16 game trailer short (8s) in Google Playground stylized 3D tabletop MOBA diorama style introducing "Nexus Front". (0-2.2s) Smooth 3/4 diorama glide down a sunlit sandstone mid-lane bordered by stylized emerald forest, sparkling translucent river, and glowing cyan crystal turrets; agile miniature archer hero Kira darts forward with crisp turquoise motion trails. (2.2-5.8s) Dynamic zoom-in as Kira executes a nimble dash-roll dodging bright coral-red enemy bolts, then launches a breathtaking volley of glowing cyan-and-gold crystal arrows raining onto the enemy squad and crimson turret in colorful geometric particle bursts. (5.8-8s) Enemy turret shatters into playful glowing crystal prisms as the blue wave pushes toward the Nexus, resolving with bright cobalt highlights and clean lower framing for CTA. Polished vinyl-and-glass toy shaders, vivid studio lighting, no text clutter, no watermarks. Audio: sleek dash whoosh, crystalline arrow shimmer, punchy electro beat drop.'
  },
  {
    order: 4,
    gameId: 'clash-royale',
    koreanAlias: '클래시 로얄 (크라운폴)',
    titleKo: 'CROWNFALL · 크라운폴 아레나',
    titleEn: 'Crownfall Arena (Clash Royale)',
    genreLabel: '실시간 카드 전략',
    coverUrl: '/games/clash-royale/assets/platform-cover.png',
    stylePreset: 'google-playground',
    cameraMotion: 'fast-cuts',
    recommendedEngine: 'google-flow-veo-pro',
    playgroundConcept: '다크 슬레이트와 크림-골드 컬러의 럭셔리 보드게임 아레나에 3D 입체 카드가 착! 내려꽂히면, 그 자리에서 귀여운 미니어처 기사·거인·화살비가 팝업 북처럼 튀어나와 두 개의 다리를 넘어 왕관을 차지하는 Google Playground 팝업 카드 쇼츠',
    hookText: '카드 한 장으로 전장을 뒤집어라!',
    highlightText: '엘릭서 타이밍 · 2레인 카드 배치 · 왕관 탈환',
    ctaText: 'PLAY HUB에서 크라운폴 아레나 대전 ▶',
    suggestedTitle: '클래시 로얄(크라운폴) · 팝업 카드 한 장으로 왕관 역전!',
    suggestedCaption: '8장의 카드 덱과 엘릭서 타이밍으로 두 개의 레인을 지배하세요! 기사·대포·화살비 실시간 전략 아레나.',
    hashtags: ['#클래시로얄', '#크라운폴', '#카드전략', '#PlayHub', '#PlayForge', '#GoogleFlow'],
    audioCue: 'Crisp playing-card snap and purple elixir bubble pop, playful horn fanfare, rhythmic miniature march taps, sparkling golden crown chime.',
    scenes: [
      {
        index: 1,
        role: 'hook',
        label: 'Beat 1 · 엘릭서 카드 팝업 소환 (0.0s–2.2s)',
        startSec: 0,
        endSec: 2.2,
        headline: '카드 한 장으로 전장을 뒤집어라!',
        camera: 'Close-up of a glowing royal-gold Knight card flipping down onto a lush emerald board-game bridge, popping into a 3D toy figurine',
        flowScenePrompt: 'Vertical 9:16 Google Playground 3D tactile board-game diorama. A sleek rounded ivory-and-gold strategy card hovers above a sunlit dual-bridge emerald arena, snaps smoothly down onto the tile with a glossy purple elixir ripple, and transforms instantly like a luxury pop-up toy into a charming chunky miniature Knight figurine raising a cobalt shield and gleaming sword. Crisp studio lighting, vinyl figurine texture, crisp card-snap and elixir pop audio.'
      },
      {
        index: 2,
        role: 'gameplay',
        label: 'Beat 2 · 양쪽 레인 동시 교전 & 화살비 카운터 (2.2s–5.8s)',
        startSec: 2.2,
        endSec: 5.8,
        headline: '기사 돌격 + 화살비 완벽 카운터!',
        camera: 'Energetic overhead-to-bridge swoop showing Knight charging the left bridge while glowing gold arrows sweep minions off the right lane',
        flowScenePrompt: 'Continue seamlessly in 9:16 Google Playground miniature style. Camera sweeps swiftly across both symmetrical bridges of the emerald tabletop arena: the miniature Knight charges boldly beside a rolling toy Cannon on the left lane while a bright volley of golden-tipped arrows arcs cleanly across the right lane, popping mischievous purple goblin figurines into harmless confetti sparkles. Snappy upbeat horn-and-synth groove.'
      },
      {
        index: 3,
        role: 'cta',
        label: 'Beat 3 · 골든 크라운 승리 팝 & CTA (5.8s–8.0s)',
        startSec: 5.8,
        endSec: 8.0,
        headline: 'PLAY HUB에서 크라운폴 아레나 대전 ▶',
        camera: 'Heroic bounce reveal of a gleaming golden crown landing atop the conquered ivory tower with clean lower safe area',
        flowScenePrompt: 'Joyful 9:16 climax as the opposing stone crown tower pops open into golden confetti and a gleaming oversized 3D golden Crown bounces playfully into the center-upper frame above the bright emerald arena. Clean royal-slate gradient fade along the bottom third for CTA button, triumphant brass-and-chime victory sting.'
      }
    ],
    masterFlowPrompt: 'Vertical 9:16 game trailer short (8s) in Google Playground 3D pop-up board-game diorama style introducing "Crownfall Arena" (Clash Royale-inspired). (0-2.2s) A glossy ivory-and-gold strategy card drops smoothly onto a sunlit emerald dual-lane tabletop arena, triggering a translucent purple elixir ripple as a chunky stylized miniature Knight figurine springs up like a pop-up toy with shield and sword. (2.2-5.8s) Fast rhythmic swoop across both bridges as the Knight and a miniature wheeled Cannon push the left tower while a gleaming golden arrow volley sweeps tiny purple goblins on the right lane into joyful confetti sparkles. (5.8-8s) The enemy tower pops into gold sparkles and a shiny 3D Golden Crown bounces victoriously in upper-center frame with clean uncluttered lower framing for CTA. Tactile matte-vinyl toy shaders, crisp daylight bounce, zero messy UI text, no watermarks. Audio: crisp card snap, bubbly elixir pop, playful brass fanfare, sparkling crown victory chime.'
  },
  {
    order: 5,
    gameId: 'survivor-io',
    koreanAlias: '탕탕특공대 (서바이버 아레나)',
    titleKo: '서바이버 아레나 · 탕탕특공대',
    titleEn: 'Survivor Arena (Survivor.io)',
    genreLabel: '뱀서라이크 · 생존 액션',
    coverUrl: '/games/survivor-io/assets/platform-cover.png',
    stylePreset: 'google-playground',
    cameraMotion: 'slowmo-hero',
    recommendedEngine: 'google-flow-veo-fast',
    playgroundConcept: '네온 앰버·코발트 조명의 3D 장난감 아레나 한가운데서 꼬마 특공대 히어로가 사방에서 몰려드는 100마리 미니 몬스터 무리를 대시로 아슬아슬 피하다가, 경험치 보석을 싹쓸이하며 쿠나이를 초고속 연사 진화 무기로 각성시켜 단숨에 쓸어버리는 초강렬 도파민 쇼츠',
    hookText: '100마리 포위?! 무기 진화로 싹쓸이!',
    highlightText: '자동 공격 · 회피 대시 · 무기 진화 보스전',
    ctaText: 'PLAY HUB에서 탕탕특공대 5분 생존 도전 ▶',
    suggestedTitle: '탕탕특공대(서바이버 아레나) · 100마리 포위 쿠나이 진화 싹쓸이!',
    suggestedCaption: '몰려오는 적 웨이브를 대시로 피하고 보석을 모아 무기를 진화시키세요! 5분 생존 & 2페이즈 보스전 즉시 플레이.',
    hashtags: ['#탕탕특공대', '#서바이버아레나', '#뱀서라이크', '#PlayHub', '#PlayForge', '#GoogleFlow'],
    audioCue: 'Rapid playful bouncy footsteps, magnet gem-pickup ascending xylophone arpeggio, electric power-up level-up chime, hyper-satisfying rapid-fire laser-kunai pop cascade.',
    scenes: [
      {
        index: 1,
        role: 'hook',
        label: 'Beat 1 · 사방 100마리 포위 & 아슬아슬 대시 (0.0s–2.2s)',
        startSec: 0,
        endSec: 2.2,
        headline: '100마리 포위?! 한 끗 차이 대시!',
        camera: 'High-angle 9:16 arena shot zooming tightly onto a plucky toy-like survivor surrounded by a colorful ring of bouncy geometric critters',
        flowScenePrompt: 'Vertical 9:16 Google Playground vibrant 3D miniature arcade arena. In a sleek midnight-indigo studio arena accented with glowing warm-amber grid lines, a plucky chunky stylized survivor hero with a cobalt scarf is encircled by dozens of cute colorful round geometric monster toys bouncing inward. In crisp brief slow-motion, the hero executes a sparkling cyan dash right through a tiny gap, collecting a sweeping trail of glowing emerald XP gems. Ascending xylophone chime audio.'
      },
      {
        index: 2,
        role: 'gameplay',
        label: 'Beat 2 · 무기 진화 각성 & 360도 싹쓸이 (2.2s–5.8s)',
        startSec: 2.2,
        endSec: 5.8,
        headline: '쿠나이 진화 각성 · 화면 싹쓸이 쾌감!',
        camera: 'Dynamic heroic spiral zoom-out as golden level-up ring expands and rapid-fire glowing kunai streams sweep the entire swarm',
        flowScenePrompt: 'Continue seamlessly in 9:16 Google Playground neon-toy style. A brilliant golden-amber level-up halo bursts beneath the survivor hero, evolving their weapon into twin floating luminous golden kunai blasters and orbiting electric blue drones. Hyper-satisfying rapid streams of glowing amber-and-cyan darts fan out 360 degrees, popping the entire wave of geometric monsters into vibrant showers of sparkling green gems and gold coins that magnetize into the hero. High-energy arcade pop synth drop.'
      },
      {
        index: 3,
        role: 'cta',
        label: 'Beat 3 · 거대 보스 등장 티저 & CTA (5.8s–8.0s)',
        startSec: 5.8,
        endSec: 8.0,
        headline: 'PLAY HUB에서 탕탕특공대 5분 생존 도전 ▶',
        camera: 'Dramatic playful freeze-frame as a towering toy-mech boss shadow lands behind the charged-up hero, leaving clean bottom CTA space',
        flowScenePrompt: 'Punchy 9:16 finale: the powered-up miniature hero strikes a confident pose glowing with golden aura as a playful oversized crimson-and-gold toy boss stomps into the upper background with a rhythmic bounce shockwave. Clean dark-cobalt lower third ready for PlayHub CTA button, energetic arcade victory sting.'
      }
    ],
    masterFlowPrompt: 'Vertical 9:16 game trailer short (8s) in Google Playground vibrant 3D toy-arcade diorama style introducing "Survivor Arena" (Survivor.io / 탕탕특공대-inspired). (0-2.2s) Sleek midnight-navy tabletop arena with glowing amber grid lines; a plucky chunky miniature hero in a cobalt scarf is surrounded by dozens of colorful geometric toy monsters closing in, then pulls off a snappy cyan dash through a razor-thin gap while magnetizing sparkling emerald XP gems. (2.2-5.8s) A radiant golden level-up burst evolves the hero’s kunai into twin rapid-fire glowing energy blasters and orbiting blue drones, unleashing a hyper-satisfying 360-degree stream that pops the entire wave into showers of bouncing neon gems and gold coins. (5.8-8s) Energetic hero pose in the foreground as a giant playful crimson-and-gold toy boss drops into the upper background, leaving clean lower framing for CTA. Glossy vinyl toy shaders, crisp studio rim light, zero cluttered UI text, no watermarks. Audio: ascending gem-pickup chimes, punchy level-up chord, rapid arcade pop-synth groove.'
  }
]);

export function getPlaygroundPlansPayload() {
  return {
    ok: true,
    styleGuide: GOOGLE_PLAYGROUND_STYLE_GUIDE,
    googleFlowWebUrl: GOOGLE_FLOW_WEB_URL,
    plans: PLAYGROUND_GAME_PLANS
  };
}
