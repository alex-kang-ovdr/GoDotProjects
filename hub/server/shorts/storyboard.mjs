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

export function buildDefaultNarration({ gameTitle, genreLabel, hookText, highlightText, ctaText, durationSec = 8 }) {
  const d = Math.max(5, Math.min(12, Number(durationSec) || 8));
  const u = d / 5;
  const r = v => Number(v.toFixed(2));
  return [
    { startSec: 0, endSec: r(u * 1.1), text: cleanLine(hookText, 30, '지금 바로 시작하세요!'), emphasize: cleanLine(gameTitle, 14) },
    { startSec: r(u * 1.1), endSec: r(u * 2.3), text: `${gameTitle}, 설치 없이 1초 만에`, emphasize: '1초 만에' },
    { startSec: r(u * 2.3), endSec: r(u * 3.5), text: cleanLine(highlightText, 30, `${genreLabel}의 짜릿한 손맛!`), emphasize: genreLabel },
    { startSec: r(u * 3.5), endSec: r(u * 4.3), text: '지금 가장 핫한 웹 게임', emphasize: '웹 게임' },
    { startSec: r(u * 4.3), endSec: r(d), text: cleanLine(ctaText, 28, '플레이허브에서 바로 플레이!'), emphasize: '바로 플레이!' }
  ];
}

export function normalizeNarration(raw, fallback) {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  const cleaned = raw
    .slice(0, 8)
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const text = cleanLine(item.text, 44, '');
      if (!text) return null;
      const startSec = Number.isFinite(Number(item.startSec)) ? Math.max(0, Number(item.startSec)) : idx * 1.5;
      const endSec = Number.isFinite(Number(item.endSec)) ? Math.max(startSec + 0.5, Number(item.endSec)) : startSec + 1.5;
      return {
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(endSec.toFixed(2)),
        text,
        emphasize: cleanLine(item.emphasize, 18, '')
      };
    })
    .filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

export function buildDefaultCarouselSlides({ gameTitle, genreLabel, hookText, highlightText, ctaText, accent = '#4285F4' }) {
  return [
    {
      index: 1,
      badge: 'CUT 1 · 상황 발생',
      headline: cleanLine(hookText, 32, `${gameTitle}, 이게 된다고?!`),
      caption: `${genreLabel} 웹 게임, 설치 없이 1초 입장`,
      narration: cleanLine(hookText, 40, `지금 ${gameTitle}에서 벌어지는 놀라운 상황!`),
      zoomOrigin: '50% 42%',
      cropScale: 1.06,
      filterCss: 'contrast(1.06) saturate(1.12)',
      accent
    },
    {
      index: 2,
      badge: 'CUT 2 · 핵심 전개',
      headline: cleanLine(highlightText, 32, '핵심 플레이 하이라이트'),
      caption: '단 한 번의 선택으로 판도가 바뀐다',
      narration: cleanLine(highlightText, 42, '타이밍에 맞춰 스킬과 전략을 펼치는 순간!'),
      zoomOrigin: '26% 48%',
      cropScale: 1.24,
      filterCss: 'contrast(1.12) saturate(1.2)',
      accent: '#EA4335'
    },
    {
      index: 3,
      badge: 'CUT 3 · 반전 폭발',
      headline: '한 방에 전장 초토화?!',
      caption: '터치·클릭 한 번으로 터지는 짜릿한 손맛',
      narration: '결국 완벽한 카운터 한 방으로 전장을 뒤집어버립니다!',
      zoomOrigin: '76% 45%',
      cropScale: 1.28,
      filterCss: 'contrast(1.15) saturate(1.24) brightness(1.04)',
      accent: '#FBBC04'
    },
    {
      index: 4,
      badge: 'CUT 4 · 결말 & 플레이',
      headline: cleanLine(ctaText, 34, 'PlayHub에서 지금 바로 플레이 ▶'),
      caption: `${gameTitle} · 브라우저 즉시 실행 무료`,
      narration: cleanLine(ctaText, 40, '지금 플레이허브에서 직접 체험해 보세요!'),
      zoomOrigin: '50% 50%',
      cropScale: 1.0,
      filterCss: 'contrast(1.08) saturate(1.15)',
      accent: '#34A853'
    }
  ];
}

export function normalizeCarouselSlides(raw, fallback) {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  const cleaned = raw.slice(0, 6).map((item, idx) => {
    if (!item || typeof item !== 'object') return null;
    const fb = fallback[idx] || fallback[fallback.length - 1];
    return {
      index: idx + 1,
      badge: cleanLine(item.badge, 24, fb?.badge || `CUT ${idx + 1}`),
      headline: cleanLine(item.headline, 44, fb?.headline || ''),
      caption: cleanLine(item.caption, 64, fb?.caption || ''),
      narration: cleanLine(item.narration, 60, fb?.narration || ''),
      imageUrl: typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim().slice(0, 300) : null,
      zoomOrigin: cleanLine(item.zoomOrigin, 24, fb?.zoomOrigin || '50% 50%'),
      cropScale: Number.isFinite(Number(item.cropScale)) ? Math.max(1, Math.min(1.6, Number(item.cropScale))) : (fb?.cropScale || 1.05),
      filterCss: cleanLine(item.filterCss, 80, fb?.filterCss || 'contrast(1.06) saturate(1.12)'),
      accent: cleanLine(item.accent, 20, fb?.accent || '#4285F4')
    };
  }).filter(Boolean);
  return cleaned.length >= 2 ? cleaned : fallback;
}

export function composeShortsStoryboard({
  game = null,
  title = '',
  prompt = '',
  stylePreset = 'google-playground',
  cameraMotion = 'dynamic-zoom',
  hookText = '',
  ctaText = '',
  topHeadline = null,
  narration = null,
  bestComment = null,
  carouselTitle = '',
  carouselSlides = null,
  durationSec = 8,
  keyframeCount = 0
} = {}) {
  const style = STYLE_PRESET_MAP[stylePreset] || STYLE_PRESET_MAP['google-playground'] || STYLE_PRESET_MAP.cinematic;
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

  const resolvedTopHeadline = {
    line1: cleanLine(topHeadline?.line1, 24, `${primaryGenreKo} 판도를 뒤집는`),
    line2: cleanLine(topHeadline?.line2, 24, `${gameTitle.slice(0, 14)} 공략법`)
  };

  const defaultNarr = buildDefaultNarration({
    gameTitle,
    genreLabel: primaryGenreKo,
    hookText: resolvedHook,
    highlightText: resolvedHighlight,
    ctaText: resolvedCta,
    durationSec: safeDuration
  });
  const resolvedNarration = normalizeNarration(narration, defaultNarr);
  const resolvedBestComment = {
    author: cleanLine(bestComment?.author, 24, '플허유저(play****)'),
    text: cleanLine(bestComment?.text, 64, `와 ${gameTitle} 이거 설치 없이 바로 되는데 타격감 미쳤다`)
  };
  const defaultSlides = buildDefaultCarouselSlides({
    gameTitle,
    genreLabel: primaryGenreKo,
    hookText: resolvedHook,
    highlightText: resolvedHighlight,
    ctaText: resolvedCta,
    accent: style.accent
  });
  const resolvedCarouselSlides = normalizeCarouselSlides(carouselSlides, defaultSlides);
  const resolvedCarouselTitle = cleanLine(
    carouselTitle,
    60,
    `${gameTitle} 해봤는데 10초 만에 중독됨ㅋㅋ`
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
    `- **상단 2줄 헤드라인**: ${resolvedTopHeadline.line1} / ${resolvedTopHeadline.line2}`,
    '',
    '## 1. Google Flow / Veo 메인 프롬프트 (복사해서 붙여넣기)',
    '```text',
    flowPrompt,
    '```',
    '',
    '## 2. 나래이션 자막 대본 (TTS / 자막 싱크)',
    ...resolvedNarration.map(n => `- **${n.startSec}s–${n.endSec}s**: ${n.text}`),
    '',
    '## 3. 3단계 씬 타임라인',
    ...scenes.map(s => `- **Scene ${s.index} (${s.startSec}s–${s.endSec}s · ${s.label})**: ${s.headline} — ${s.visualDirection}`),
    '',
    '## 4. PlayHub 등록 추천 정보',
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
    accent: style.accent,
    cameraMotion: camera.id,
    cameraLabel: camera.label,
    durationSec: safeDuration,
    topHeadline: resolvedTopHeadline,
    narration: resolvedNarration,
    bestComment: resolvedBestComment,
    carouselTitle: resolvedCarouselTitle,
    carouselSlides: resolvedCarouselSlides,
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
