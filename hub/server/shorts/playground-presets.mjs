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
    topHeadline: {
      line1: '전함 3척에 포위당한 순양함이',
      line2: '일제사격 한 방으로 역전하는 법'
    },
    narration: [
      { startSec: 0, endSec: 1.5, text: '전함 세 척에 포위당했다?!', emphasize: '포위당했다?!' },
      { startSec: 1.5, endSec: 3.1, text: '군도 사이로 항로를 꺾고', emphasize: '항로를 꺾고' },
      { startSec: 3.1, endSec: 4.8, text: '3연장 주포 각도를 맞춘 뒤', emphasize: '3연장 주포' },
      { startSec: 4.8, endSec: 6.4, text: '일제사격 발사! 함대 격침!', emphasize: '일제사격 발사!' },
      { startSec: 6.4, endSec: 8.0, text: '지금 아이언 타이드 바로 출격!', emphasize: '바로 출격!' }
    ],
    bestComment: {
      author: '함장김(navy****)',
      text: 'ㅇㅏ 일제사격 궤적 맞고 터질 때 손맛 진짜 미쳤다ㅋㅋ'
    },
    carouselTitle: '순양함 1척으로 전함 3척 잡는 해전 고인물 플레이ㅋㅋ',
    carouselSlides: [
      {
        index: 1,
        badge: '1/4 · 절체절명',
        headline: '전함 3척 포위망에 갇힌 순양함 청해',
        caption: '정면 승부는 불가능... 군도 지형을 읽어야 산다',
        narration: '북쪽 군도 한복판, 적 전함 세 척에 포위당한 순간!',
        zoomOrigin: '25% 40%',
        cropScale: 1.18,
        filterCss: 'contrast(1.08) saturate(1.15)',
        accent: '#4285F4'
      },
      {
        index: 2,
        badge: '2/4 · 항로 설계',
        headline: '섬 뒤로 선회하며 레이더 각도 확보!',
        caption: '어뢰 사각지대를 파고드는 전술 기동',
        narration: '섬 뒤로 급선회하며 포탑 세 개를 한 곳에 조준합니다.',
        zoomOrigin: '62% 38%',
        cropScale: 1.28,
        filterCss: 'contrast(1.12) saturate(1.22)',
        accent: '#00B8D9'
      },
      {
        index: 3,
        badge: '3/4 · 일제사격',
        headline: '3연장 철갑탄 일제사격 명중!!',
        caption: '황금 탄도 궤적이 적 기함 측면을 그대로 관통',
        narration: '일제사격 발사! 탄도 세 발이 적 기함에 그대로 꽂힙니다!',
        zoomOrigin: '50% 58%',
        cropScale: 1.32,
        filterCss: 'contrast(1.18) saturate(1.3) brightness(1.05)',
        accent: '#FBBC04'
      },
      {
        index: 4,
        badge: '4/4 · 거점 점령',
        headline: '설치 없이 1초 만에 해상 전술 지휘 ▶',
        caption: 'IRON TIDE · 브라우저에서 바로 무료 플레이',
        narration: '지금 플레이허브에서 아이언 타이드 함장이 되어 보세요!',
        zoomOrigin: '50% 50%',
        cropScale: 1.0,
        filterCss: 'contrast(1.06) saturate(1.12)',
        accent: '#34A853'
      }
    ],
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
    topHeadline: {
      line1: '나무 블록 6개로 만든 공성차가',
      line2: '돌초소 3개를 가루로 만드는 법'
    },
    narration: [
      { startSec: 0, endSec: 1.5, text: '나무 블록에 바퀴만 달았는데?', emphasize: '바퀴만 달았는데?' },
      { startSec: 1.5, endSec: 3.1, text: '대포 하나 얹고 시뮬레이션 시작!', emphasize: '대포 하나 얹고' },
      { startSec: 3.1, endSec: 4.8, text: '전속력 돌진 후 정중앙 발사!', emphasize: '정중앙 발사!' },
      { startSec: 4.8, endSec: 6.4, text: '돌초소 세 채가 도미노처럼 와르르!', emphasize: '와르르 붕괴!' },
      { startSec: 6.4, endSec: 8.0, text: '비 시즈 공성 공방 지금 조립하기!', emphasize: '지금 조립하기!' }
    ],
    bestComment: {
      author: '공대생(mech****)',
      text: '대포 반동으로 내 차까지 뒤집히는 물리엔진 개웃기네ㅋㅋ'
    },
    carouselTitle: '대포 하나 잘못 달았더니 성채랑 같이 날아감ㅋㅋ',
    carouselSlides: [
      {
        index: 1,
        badge: '1/4 · 공방 조립',
        headline: '원목 프레임 + 바퀴 4개 + 대포 1문 완성',
        caption: '블록이 자석처럼 착착 붙는 샌드박스 설계',
        narration: '나무 블록과 바퀴 네 개, 그리고 대포 하나를 얹어줍니다.',
        zoomOrigin: '30% 45%',
        cropScale: 1.2,
        filterCss: 'contrast(1.06) saturate(1.16)',
        accent: '#34A853'
      },
      {
        index: 2,
        badge: '2/4 · 돌진 개시',
        headline: '시뮬레이션 ON! 돌초소 향해 풀악셀',
        caption: '무게중심 아슬아슬하게 버티며 질주 중...',
        narration: '시뮬레이션 시작! 공성차가 돌초소를 향해 질주합니다!',
        zoomOrigin: '68% 48%',
        cropScale: 1.26,
        filterCss: 'contrast(1.12) saturate(1.2)',
        accent: '#FBBC04'
      },
      {
        index: 3,
        badge: '3/4 · 물리 폭발',
        headline: '포탄 한 발에 돌탑 3개 연쇄 와르르!!',
        caption: '블록이 사방으로 튀는 초만족 3D 물리 붕괴',
        narration: '정중앙 명중! 돌탑 세 개가 도미노처럼 와르르 무너집니다!',
        zoomOrigin: '50% 40%',
        cropScale: 1.32,
        filterCss: 'contrast(1.18) saturate(1.28) brightness(1.05)',
        accent: '#EA4335'
      },
      {
        index: 4,
        badge: '4/4 · ★★★ 클리어',
        headline: '나만의 미친 공성 병기 지금 설계 ▶',
        caption: 'IRONWOOD(비 시즈) · 브라우저 즉시 플레이',
        narration: '당신만의 기발한 공성차를 지금 플레이허브에서 만들어 보세요!',
        zoomOrigin: '50% 50%',
        cropScale: 1.0,
        filterCss: 'contrast(1.06) saturate(1.12)',
        accent: '#4285F4'
      }
    ],
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
    topHeadline: {
      line1: '체력 10% 남은 원딜이 미드 한타를',
      line2: '구르기 화살비로 혼자 끝내는 법'
    },
    narration: [
      { startSec: 0, endSec: 1.5, text: '체력 10%?! 적 스킬이 쏟아진다!', emphasize: '스킬이 쏟아진다!' },
      { startSec: 1.5, endSec: 3.1, text: '바람 구르기로 아슬아슬 회피!', emphasize: '바람 구르기!' },
      { startSec: 3.1, endSec: 4.8, text: '궁극기 R 화살비 즉시 시전!', emphasize: '궁극기 화살비!' },
      { startSec: 4.8, endSec: 6.4, text: '적 포탑 붕괴! 넥서스까지 원샷 돌파!', emphasize: '포탑 붕괴!' },
      { startSec: 6.4, endSec: 8.0, text: '넥서스 전선 지금 설치 없이 참전!', emphasize: '지금 참전!' }
    ],
    bestComment: {
      author: '미드차이(midg****)',
      text: '웹게임인데 구르기 무빙이랑 궁극기 판정 진짜 쫀득하네'
    },
    carouselTitle: '딸피 원딜 잡으러 왔다가 궁극기 맞고 넥서스 밀림ㅋㅋ',
    carouselSlides: [
      {
        index: 1,
        badge: '1/4 · 미드 위기',
        headline: '체력 10% 키라 앞에 적 3인 다이브!',
        caption: '포탑 앞에서 펼쳐진 아슬아슬한 1대3 대치',
        narration: '미드 레인 포탑 앞, 체력 10% 원딜에게 적 셋이 몰려옵니다!',
        zoomOrigin: '24% 48%',
        cropScale: 1.2,
        filterCss: 'contrast(1.08) saturate(1.18)',
        accent: '#00B8D9'
      },
      {
        index: 2,
        badge: '2/4 · 슈퍼 회피',
        headline: 'E 바람 구르기로 치명타 전부 빗겨냄!',
        caption: '0.1초 반응속도로 붉은 투사체 완벽 회피',
        narration: '바람 구르기 한 번으로 적의 결정타를 전부 피해버립니다!',
        zoomOrigin: '66% 42%',
        cropScale: 1.28,
        filterCss: 'contrast(1.14) saturate(1.24)',
        accent: '#4285F4'
      },
      {
        index: 3,
        badge: '3/4 · R 화살비',
        headline: '청록색 수정 화살비 궁극기 폭발!!',
        caption: '전열 붕괴 + 적 포탑 수정 파편까지 한 번에 정리',
        narration: '곧바로 궁극기 화살비 작렬! 전선과 포탑을 동시에 밀어버립니다!',
        zoomOrigin: '50% 52%',
        cropScale: 1.32,
        filterCss: 'contrast(1.18) saturate(1.3) brightness(1.06)',
        accent: '#FBBC04'
      },
      {
        index: 4,
        badge: '4/4 · 넥서스 진격',
        headline: '설치 0초 웹 MOBA 지금 한 판 ▶',
        caption: 'NEXUS FRONT · Q·W·E·R 스킬 콤보 액션',
        narration: '플레이허브 넥서스 전선에서 지금 바로 승리를 쟁취하세요!',
        zoomOrigin: '50% 50%',
        cropScale: 1.0,
        filterCss: 'contrast(1.06) saturate(1.14)',
        accent: '#34A853'
      }
    ],
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
    topHeadline: {
      line1: '종료 5초 전 엘릭서 3코스트로',
      line2: '상대 왕관 타워를 뒤집는 카드 콤보'
    },
    narration: [
      { startSec: 0, endSec: 1.5, text: '남은 시간 5초! 타워가 밀린다!', emphasize: '남은 시간 5초!' },
      { startSec: 1.5, endSec: 3.1, text: '오른쪽 레인 화살비로 싹 정리하고', emphasize: '화살비 정리!' },
      { startSec: 3.1, endSec: 4.8, text: '왼쪽 다리에 기사+대포 동시 소환!', emphasize: '기사+대포!' },
      { startSec: 4.8, endSec: 6.4, text: '황금 왕관 탈환! 짜릿한 버저비터!', emphasize: '황금 왕관 탈환!' },
      { startSec: 6.4, endSec: 8.0, text: '크라운폴 아레나 지금 바로 대전!', emphasize: '지금 대전!' }
    ],
    bestComment: {
      author: '덱장인(crow****)',
      text: '3코스트 화살비 타이밍 딱 맞을 때 도파민 미쳤음ㅋㅋ'
    },
    carouselTitle: '상대 고블린 러시 보고 웃으면서 화살비 꽂아줌ㅋㅋ',
    carouselSlides: [
      {
        index: 1,
        badge: '1/4 · 더블 엘릭서',
        headline: '종료 5초 전, 오른쪽 다리 고블린 떼 출현!',
        caption: '지금 못 막으면 그대로 패배하는 극한 상황',
        narration: '종료 5초 전! 상대가 오른쪽 레인으로 대군을 쏟아냅니다!',
        zoomOrigin: '75% 44%',
        cropScale: 1.2,
        filterCss: 'contrast(1.08) saturate(1.18)',
        accent: '#EA4335'
      },
      {
        index: 2,
        badge: '2/4 · 신의 화살비',
        headline: '황금 화살비 카드 한 장으로 0.5초 전멸!',
        caption: '엘릭서 이득 +5 챙기는 교과서 카운터',
        narration: '바로 화살비 카드 투하! 고블린 부대가 한 방에 정리됩니다!',
        zoomOrigin: '30% 42%',
        cropScale: 1.28,
        filterCss: 'contrast(1.14) saturate(1.24)',
        accent: '#FBBC04'
      },
      {
        index: 3,
        badge: '3/4 · 역습 소환',
        headline: '빈 왼쪽 다리에 기사+대포 팝업 돌격!',
        caption: '상대 엘릭서 바닥난 틈을 찌르는 완벽한 양면 압박',
        narration: '엘릭서가 바닥난 왼쪽 다리에 기사 카드를 착! 소환합니다!',
        zoomOrigin: '50% 56%',
        cropScale: 1.3,
        filterCss: 'contrast(1.16) saturate(1.28) brightness(1.05)',
        accent: '#4285F4'
      },
      {
        index: 4,
        badge: '4/4 · 왕관 승리',
        headline: '8장 덱 전략 대전, 지금 무료 플레이 ▶',
        caption: 'CROWNFALL(클래시 로얄) · 실시간 2레인 카드 전략',
        narration: '지금 플레이허브 크라운폴 아레나에서 왕관을 차지하세요!',
        zoomOrigin: '50% 50%',
        cropScale: 1.0,
        filterCss: 'contrast(1.06) saturate(1.14)',
        accent: '#34A853'
      }
    ],
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
    topHeadline: {
      line1: '몬스터 100마리 포위망에서',
      line2: '쿠나이 진화로 화면 싹쓸이하는 법'
    },
    narration: [
      { startSec: 0, endSec: 1.5, text: '사방에서 100마리가 몰려온다?!', emphasize: '100마리 포위?!' },
      { startSec: 1.5, endSec: 3.1, text: '한 끗 차이 대시로 보석 싹쓸이!', emphasize: '보석 싹쓸이!' },
      { startSec: 3.1, endSec: 4.8, text: '레벨업! 쿠나이 초고속 무기 진화!', emphasize: '무기 진화!' },
      { startSec: 4.8, endSec: 6.4, text: '360도 연사 폭격으로 화면 초토화!', emphasize: '화면 초토화!' },
      { startSec: 6.4, endSec: 8.0, text: '탕탕특공대 5분 생존 지금 도전!', emphasize: '지금 도전!' }
    ],
    bestComment: {
      author: '탕탕장인(surv****)',
      text: '쿠나이 진화 딱 터지고 보석 자석처럼 빨려올 때 쾌감 미쳤다'
    },
    carouselTitle: '100마리 포위돼서 끝난 줄 알았는데 쿠나이 진화함ㅋㅋ',
    carouselSlides: [
      {
        index: 1,
        badge: '1/4 · 100마리 포위',
        headline: '사방이 몬스터... 피할 틈이 없다?!',
        caption: '5분 생존 모드 3분 차, 역대급 웨이브 습격',
        narration: '사방에서 몬스터 백 마리가 빈틈없이 포위해 들어옵니다!',
        zoomOrigin: '50% 42%',
        cropScale: 1.2,
        filterCss: 'contrast(1.08) saturate(1.2)',
        accent: '#EA4335'
      },
      {
        index: 2,
        badge: '2/4 · 극한 대시',
        headline: '바늘구멍 틈새 대시 → 경험치 보석 자석 흡수!',
        caption: '스치면 끝나는 타이밍에 레벨업 게이지 MAX',
        narration: '아슬아슬한 대시 한 방으로 초록 보석을 싹 끌어모읍니다!',
        zoomOrigin: '26% 52%',
        cropScale: 1.28,
        filterCss: 'contrast(1.14) saturate(1.26)',
        accent: '#34A853'
      },
      {
        index: 3,
        badge: '3/4 · 무기 진화',
        headline: '쌍쿠나이 + 드론 각성! 360도 화면 삭제!!',
        caption: '황금 탄막이 100마리를 1초 만에 보석 비로 변환',
        narration: '무기 진화 발동! 초고속 쿠나이가 화면 전체를 쓸어버립니다!',
        zoomOrigin: '72% 46%',
        cropScale: 1.32,
        filterCss: 'contrast(1.18) saturate(1.32) brightness(1.06)',
        accent: '#FBBC04'
      },
      {
        index: 4,
        badge: '4/4 · 보스전 돌입',
        headline: '5분 생존 & 2페이즈 보스 지금 도전 ▶',
        caption: '서바이버 아레나(탕탕특공대) · 한 손 조작 뱀서라이크',
        narration: '플레이허브 탕탕특공대에서 지금 5분 생존에 도전해 보세요!',
        zoomOrigin: '50% 50%',
        cropScale: 1.0,
        filterCss: 'contrast(1.06) saturate(1.16)',
        accent: '#4285F4'
      }
    ],
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

export function getPlaygroundPlanByGameId(gameId) {
  return PLAYGROUND_GAME_PLANS.find(p => p.gameId === gameId) || null;
}

export function getPlaygroundPlansPayload() {
  return {
    ok: true,
    styleGuide: GOOGLE_PLAYGROUND_STYLE_GUIDE,
    googleFlowWebUrl: GOOGLE_FLOW_WEB_URL,
    plans: PLAYGROUND_GAME_PLANS
  };
}
