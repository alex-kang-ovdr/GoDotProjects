// PlayHub / PlayForge Shorts Video Generation Engine Catalog & Pricing (PlayCoin).
import { execFileSync } from 'node:child_process';

export const GOOGLE_FLOW_WEB_URL = 'https://labs.google/fx/tools/flow';

export const SHORTS_ENGINES = Object.freeze([
  {
    id: 'google-flow-veo-fast',
    name: 'Google Flow · Veo Fast',
    shortName: 'Flow · Veo Fast',
    provider: 'google-veo',
    model: 'veo-3.1-fast-generate-001',
    costCoins: 60,
    resolution: '720p',
    width: 720,
    height: 1280,
    aspectRatio: '9:16',
    durationSec: 8,
    hasAudio: true,
    supportsKeyframes: true,
    supportsLastFrame: false,
    badge: 'Google Flow 엔진',
    description: 'Google Flow의 핵심 Veo Fast 모델로 게임 키프레임과 프롬프트 기반 9:16 8초 사운드 포함 쇼츠를 생성합니다. API 키 미설정 시 PlayForge Motion 엔진으로 자동 폴백(실제 비용 20 PC만 정산)할 수 있습니다.'
  },
  {
    id: 'google-flow-veo-pro',
    name: 'Google Flow · Veo 3.1 Cinematic',
    shortName: 'Flow · Veo 3.1',
    provider: 'google-veo',
    model: 'veo-3.1-generate-001',
    costCoins: 120,
    resolution: '1080p',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    durationSec: 8,
    hasAudio: true,
    supportsKeyframes: true,
    supportsLastFrame: true,
    badge: '시네마틱 최고화질',
    description: '시작·종료 키프레임 보간(First/Last Frame)과 시네마틱 1080p 오디오 생성을 지원하는 Veo 3.1 프로 파이프라인입니다.'
  },
  {
    id: 'forge-motion-ffmpeg',
    name: 'PlayForge Motion Director',
    shortName: 'Forge Motion',
    provider: 'ffmpeg-motion',
    model: 'ffmpeg-9x16-director-v1',
    costCoins: 20,
    resolution: '720p',
    width: 720,
    height: 1280,
    aspectRatio: '9:16',
    durationSec: 8,
    hasAudio: true,
    supportsKeyframes: true,
    supportsLastFrame: true,
    badge: '즉시 생성 · 로컬 지원',
    description: '게임 캡처 키프레임과 커버 아트에 Ken Burns 줌·패닝, 3컷 타이틀 모션, 신스 BGM을 입혀 9:16 H.264 MP4 쇼츠를 즉시 렌더링합니다.'
  },
  {
    id: 'flow-import',
    name: 'Google Flow 결과물 가져오기',
    shortName: 'Flow Import',
    provider: 'direct-import',
    model: 'google-flow-web-upload',
    costCoins: 0,
    resolution: '원본 유지',
    width: 720,
    height: 1280,
    aspectRatio: '9:16',
    durationSec: 8,
    hasAudio: true,
    supportsKeyframes: false,
    supportsLastFrame: false,
    badge: '무료 등록',
    description: '자동 생성된 Google Flow 프롬프트·키프레임 팩으로 labs.google/flow에서 제작한 MP4/WebM 영상을 그대로 업로드해 내 게임에 등록합니다.'
  }
]);

export const SHORTS_ENGINE_MAP = Object.freeze(
  Object.fromEntries(SHORTS_ENGINES.map(e => [e.id, e]))
);

export const STYLE_PRESETS = Object.freeze([
  {
    id: 'google-playground',
    label: '구글 Playground (3D 디오라마)',
    accent: '#4285F4',
    bgHex: '0x0E1B36',
    glowHex: '0x4285F4',
    promptCue: 'Google Playground 3D tactile miniature diorama style, sunlit studio bounce lighting, matte vinyl and frosted glass toy shaders, vibrant Google cobalt blue, coral, amber, and mint accents, playful physics transitions'
  },
  {
    id: 'cinematic',
    label: '시네마틱 트레일러',
    accent: '#2563EB',
    bgHex: '0x0B1530',
    glowHex: '0x2563EB',
    promptCue: 'high-budget cinematic game trailer, dramatic volumetric lighting, crisp depth of field, dynamic particles'
  },
  {
    id: 'neon-arcade',
    label: '네온 아케이드',
    accent: '#EC4899',
    bgHex: '0x140826',
    glowHex: '0xEC4899',
    promptCue: 'electric cyberpunk neon arcade aesthetic, vibrant magenta and cyan rim lights, high-energy motion trails'
  },
  {
    id: 'pixel-retro',
    label: '픽셀 레트로',
    accent: '#F59E0B',
    bgHex: '0x1A102B',
    glowHex: '0xF59E0B',
    promptCue: 'crisp modern indie pixel-art showcase, nostalgic arcade cabinet glow, punchy color contrast'
  },
  {
    id: 'cozy-pastel',
    label: '코지 파스텔',
    accent: '#10B981',
    bgHex: '0x0D2422',
    glowHex: '0x10B981',
    promptCue: 'warm sunlit cozy indie game vibe, soft pastel bounce lighting, inviting playful atmosphere'
  },
  {
    id: 'dark-fantasy',
    label: '다크 판타지',
    accent: '#8B5CF6',
    bgHex: '0x120B1F',
    glowHex: '0x7C3AED',
    promptCue: 'epic dark fantasy boss reveal, glowing arcane embers, moody atmospheric fog, heroic camera sweep'
  },
  {
    id: 'gameplay-highlight',
    label: '실제 플레이 하이라이트',
    accent: '#004AC6',
    bgHex: '0x0D1321',
    glowHex: '0x004AC6',
    promptCue: 'authentic fast-paced vertical gameplay highlight reel, crisp UI readability, energetic esports montage'
  }
]);

export const STYLE_PRESET_MAP = Object.freeze(
  Object.fromEntries(STYLE_PRESETS.map(s => [s.id, s]))
);

export const CAMERA_MOTIONS = Object.freeze([
  { id: 'dynamic-zoom', label: '다이나믹 줌인', promptCue: 'smooth accelerating push-in zoom toward the focal hero action' },
  { id: 'orbit-pan', label: '오빗 패닝', promptCue: 'sweeping lateral tracking pan across the game arena' },
  { id: 'fast-cuts', label: '빠른 컷 편집', promptCue: 'punchy beat-synced montage cuts with energetic micro-shakes' },
  { id: 'slowmo-hero', label: '슬로우모션 하이라이트', promptCue: 'dramatic slow-motion hero moment ramping back into full speed' }
]);

export const CAMERA_MOTION_MAP = Object.freeze(
  Object.fromEntries(CAMERA_MOTIONS.map(c => [c.id, c]))
);

let cachedFfmpegProbe = null;

export function detectFfmpegBinary(env = process.env, { force = false } = {}) {
  if (!force && cachedFfmpegProbe && env === process.env) return cachedFfmpegProbe;
  const bin = env.PLAYHUB_FFMPEG_BIN || env.FFMPEG_BIN || 'ffmpeg';
  const ffprobeBin = env.PLAYHUB_FFPROBE_BIN || env.FFPROBE_BIN || 'ffprobe';
  let available = false;
  let version = null;
  try {
    const out = execFileSync(bin, ['-version'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const first = String(out || '').split(/\r?\n/)[0] || '';
    available = /ffmpeg version/i.test(first);
    version = first.slice(0, 80);
  } catch {
    available = false;
  }
  const result = { available, bin, ffprobeBin, version };
  if (env === process.env) cachedFfmpegProbe = result;
  return result;
}

export function detectVeoConfig(env = process.env, config = {}) {
  const shortsCfg = config?.shorts || {};
  const geminiApiKey = String(shortsCfg.geminiApiKey || env.PLAYHUB_GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();
  const vertexProject = String(shortsCfg.vertexProject || env.PLAYHUB_VERTEX_PROJECT || env.GOOGLE_CLOUD_PROJECT || '').trim();
  const vertexLocation = String(shortsCfg.vertexLocation || env.PLAYHUB_VERTEX_LOCATION || 'us-central1').trim();
  const vertexAccessToken = String(shortsCfg.vertexAccessToken || env.PLAYHUB_VERTEX_ACCESS_TOKEN || '').trim();
  const fastModel = String(shortsCfg.veoFastModel || env.PLAYHUB_VEO_FAST_MODEL || 'veo-3.1-fast-generate-001').trim();
  const proModel = String(shortsCfg.veoProModel || env.PLAYHUB_VEO_PRO_MODEL || 'veo-3.1-generate-001').trim();
  const apiBaseUrl = String(shortsCfg.geminiApiBaseUrl || env.PLAYHUB_GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').trim().replace(/\/+$/, '');

  const mode = geminiApiKey
    ? 'gemini-api'
    : (vertexProject && vertexAccessToken ? 'vertex-ai' : 'unconfigured');

  return {
    configured: mode !== 'unconfigured',
    mode,
    geminiApiKey,
    vertexProject,
    vertexLocation,
    vertexAccessToken,
    fastModel,
    proModel,
    apiBaseUrl
  };
}

export function buildPublicEngineCatalog({ env = process.env, config = {} } = {}) {
  const ffmpeg = detectFfmpegBinary(env);
  const veo = detectVeoConfig(env, config);
  return {
    googleFlowWebUrl: GOOGLE_FLOW_WEB_URL,
    ffmpegAvailable: ffmpeg.available,
    veoConfigured: veo.configured,
    veoMode: veo.mode,
    engines: SHORTS_ENGINES.map(engine => {
      let available = true;
      let statusLabel = '즉시 사용 가능';
      let fallbackEngineId = null;
      let model = engine.model;
      if (engine.provider === 'google-veo') {
        model = engine.id === 'google-flow-veo-pro' ? veo.proModel : veo.fastModel;
        available = veo.configured;
        fallbackEngineId = ffmpeg.available ? 'forge-motion-ffmpeg' : null;
        statusLabel = veo.configured
          ? (veo.mode === 'vertex-ai' ? 'Vertex AI Veo 연동됨' : 'Gemini API Veo 연동됨')
          : (ffmpeg.available
            ? 'API 키 미설정 · 자동 폴백(20 PC) 또는 Flow Export'
            : 'API 키 필요 · Flow 프롬프트 내보내기 지원');
      } else if (engine.provider === 'ffmpeg-motion') {
        available = ffmpeg.available;
        statusLabel = ffmpeg.available ? '즉시 렌더링 준비됨' : 'FFmpeg 미설치';
      } else if (engine.provider === 'direct-import') {
        available = true;
        statusLabel = 'MP4/WebM 무료 등록';
      }
      return {
        ...engine,
        model,
        available,
        statusLabel,
        fallbackEngineId
      };
    }),
    styles: STYLE_PRESETS.map(({ id, label, accent }) => ({ id, label, accent })),
    cameras: CAMERA_MOTIONS.map(({ id, label }) => ({ id, label }))
  };
}
