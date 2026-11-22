// Auto-Storyboard & Google Flow / Veo 9:16 Prompt Composer.
import { STYLE_PRESET_MAP, CAMERA_MOTION_MAP, GOOGLE_FLOW_WEB_URL } from './engines.mjs';

const GENRE_LABELS_KO = {
  strategy: '전략',
  simulation: '시뮬레이션',
  action: '액션',
  arcade: '아케이드',
  puzzle: '퍼즐',
  classic: '클래식',
  logic: '두뇌',
  casual: '캐주얼',
  shooter: '슈팅',
  rpg: 'RPG',
  roguelike: '로그라이크',
  physics: '물리',
  godot: 'Godot',
  multiplayer: '멀티플레이',
  'tower-defense': '타워 디펜스'
};

function cleanLine(value, maxLen, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function normalizeHashtags(raw, fallbackTags = []) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\s,]+/)
      : [];
  const merged = [...list, ...fallbackTags, 'PlayHub', 'PlayForge', '게임쇼츠'];
  const out = [];
  const seen = new Set();
  for (const entry of merged) {
    const token = String(entry ?? '')
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 24);
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push('#' + token);
    if (out.length >= 6) break;
  }
  return out;
}

export function composeShortsStoryboard({
  game = null,
  title = '',
  prompt = '',
  stylePreset = 'cinematic',
  cameraMotion = 'dynamic-zoom',
  hookText = '',
  ctaText = '',
  durationSec = 8,
  keyframeCount = 0
} = {}) {
  const style = STYLE_PRESET_MAP[stylePreset] || STYLE_PRESET_MAP.cinematic;
  const camera = CAMERA_MOTION_MAP[cameraMotion] || CAMERA_MOTION_MAP['dynamic-zoom'];
  const gameTitle = cleanLine(
    title || game?.title?.ko || game?.title || game?.name || 'PlayForge 게임',
    60,
    'PlayForge 게임'
  );
  const gameTitleEn = cleanLine(
    game?.title?.en || game?.englishTitle || gameTitle,
    60,
    gameTitle
  );
  const gameDesc = cleanLine(
    game?.description?.ko || game?.description || game?.summary?.ko || game?.summary || '',
    160,
    '브라우저에서 설치 없이 바로 즐기는 PlayHub 웹 게임!'
  );
  const rawTags = Array.isArray(game?.tags) ? game.tags : [];
  const primaryGenreKey = rawTags[0] || 'arcade';
  const primaryGenreKo = GENRE_LABELS_KO[primaryGenreKey] || primaryGenreKey || '웹 게임';
  const controls = Array.isArray(game?.controls) ? game.controls : [];
  const touchReady = controls.includes('touch');
  const creatorBrief = cleanLine(prompt, 500, '');

  const safeDuration = Math.max(5, Math.min(12, Math.round(Number(durationSec) || 8)));
  const s1End = Number((safeDuration * 0.28).toFixed(1));
  const s2End = Number((safeDuration * 0.72).toFixed(1));

  const resolvedHook = cleanLine(
    hookText,
    48,
    touchReady ? `터치 한 번으로 바로 시작 · ${primaryGenreKo}!` : `지금 가장 핫한 ${primaryGenreKo} 웹 게임!`
  );
  const resolvedHighlight = cleanLine(
    creatorBrief || gameDesc,
    72,
    `${gameTitle}의 핵심 액션과 전략을 8초 만에 만나보세요.`
  );
  const resolvedCta = cleanLine(
    ctaText,
    48,
    'PLAY HUB에서 지금 무료 플레이 ▶'
  );

  const scenes = [
    {
      index: 1,
      role: 'hook',
      label: '오프닝 훅',
      startSec: 0,
      endSec: s1End,
      headline: resolvedHook,
      subline: gameTitle,
      visualDirection: `${style.promptCue}; bold vertical 9:16 title reveal for "${gameTitleEn}", ${camera.promptCue}`
    },
    {
      index: 2,
      role: 'gameplay',
      label: '핵심 플레이 하이라이트',
      startSec: s1End,
      endSec: s2End,
      headline: resolvedHighlight,
      subline: `${primaryGenreKo}${touchReady ? ' · 모바일 터치 지원' : ' · 설치 없이 즉시 실행'}`,
      visualDirection: `intense playable showcase moment of "${gameTitleEn}" (${primaryGenreKey} game), ${creatorBrief || gameDesc}, crisp readability in 9:16 vertical composition`
    },
    {
      index: 3,
      role: 'cta',
      label: 'PlayHub CTA 엔딩',
      startSec: s2End,
      endSec: safeDuration,
      headline: resolvedCta,
      subline: `${gameTitle} · PlayHub`,
      visualDirection: `clean vibrant cobalt-blue end card transition with glowing hero frame of "${gameTitleEn}", energetic audio sting`
    }
  ];

  const veoPromptParts = [
    `Vertical 9:16 game trailer short (${safeDuration}s) introducing "${gameTitleEn}", a ${primaryGenreKey} browser game.`,
    `Visual style: ${style.promptCue}.`,
    `Camera choreography: ${camera.promptCue}.`,
    creatorBrief ? `Creator direction: ${creatorBrief}.` : `Game premise: ${gameDesc}.`,
    keyframeCount > 0 ? 'Stay faithful to the provided game keyframe characters, color palette, and art style.' : '',
    'Beat structure: (0-2s) eye-catching hook reveal, (2-6s) peak gameplay action spectacle, (6-8s) heroic freeze-frame finale.',
    'Audio: upbeat modern game-trailer synth percussion with crisp impact sound effects. No watermarks, no distorted UI text.'
  ].filter(Boolean);

  const flowPrompt = veoPromptParts.join(' ');
  const hashtags = normalizeHashtags([], [primaryGenreKo, primaryGenreKey, gameTitle.replace(/\s+/g, '')]);
  const suggestedTitle = cleanLine(`${gameTitle} — ${resolvedHook}`, 80, `${gameTitle} 소개 쇼츠`);
  const suggestedCaption = cleanLine(
    `${gameDesc} ${resolvedCta}`,
    240,
    `${gameTitle} 지금 PlayHub에서 바로 플레이하세요!`
  );

  const flowExportMarkdown = [
    `# Google Flow · PlayForge 쇼츠 제작 팩 (${gameTitle})`,
    '',
    `- **Google Flow 바로가기**: ${GOOGLE_FLOW_WEB_URL}`,
    `- **비율 / 길이**: 9:16 세로 쇼츠 · ${safeDuration}초`,
    `- **연출 스타일**: ${style.label} / 카메라: ${camera.label}`,
    '',
    '## 1. Google Flow / Veo 메인 프롬프트 (복사해서 붙여넣기)',
    '```text',
    flowPrompt,
    '```',
    '',
    '## 2. 3단계 씬 타임라인',
    ...scenes.map(s => `- **Scene ${s.index} (${s.startSec}s–${s.endSec}s · ${s.label})**: ${s.headline} — ${s.visualDirection}`),
    '',
    '## 3. PlayHub 등록 추천 정보',
    `- **제목**: ${suggestedTitle}`,
    `- **캡션**: ${suggestedCaption}`,
    `- **해시태그**: ${hashtags.join(' ')}`
  ].join('\n');

  return {
    gameTitle,
    gameTitleEn,
    genreLabel: primaryGenreKo,
    touchReady,
    stylePreset: style.id,
    styleLabel: style.label,
    cameraMotion: camera.id,
    cameraLabel: camera.label,
    durationSec: safeDuration,
    hookText: resolvedHook,
    highlightText: resolvedHighlight,
    ctaText: resolvedCta,
    suggestedTitle,
    suggestedCaption,
    hashtags,
    scenes,
    flowPrompt,
    flowWebUrl: GOOGLE_FLOW_WEB_URL,
    flowExportMarkdown
  };
}
