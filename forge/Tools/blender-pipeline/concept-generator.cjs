'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sanitizeHexColor, sanitizeAssetName, clampNumber } = require('./engine-adapter.cjs');
const { invokeAgentChatProvider, extractJsonObject, listAiModels } = require('./llm-planner.cjs');

const CONCEPT_SYSTEM_PROMPT = `You are a Senior 3D Concept Artist for PlayForge.
Given a user's natural language game asset request, design a structured 3D Concept Art Sheet in strict JSON.

STRICT OUTPUT RULES:
- Respond with ONLY ONE valid JSON object (no commentary outside JSON).
- Include a clean, recognizable vector illustration in "artworkSvg" using ONLY simple SVG elements (<g>, <path>, <rect>, <circle>, <ellipse>, <polygon>, <line>, <defs>, <linearGradient>, <radialGradient>, <stop>) inside viewBox="0 0 420 420" (NO <script>, NO event handlers, NO external links, NO <image>).
- Draw a crisp front-3/4 stylized concept illustration centered in the 420x420 canvas with shading, highlights, glowing accents, and accurate silhouette for the requested subject!

Required JSON schema:
{
  "title": "Short Korean/English Title",
  "assetName": "AsciiPascalName",
  "style": "stylized",
  "visualBrief": "2-3 sentence Korean description of overall silhouette, mood, and form.",
  "keyFeatures": ["핵심 시각 특징 1", "핵심 시각 특징 2", "핵심 시각 특징 3", "핵심 시각 특징 4"],
  "proportions": { "widthM": 1.0, "depthM": 0.6, "heightM": 1.85 },
  "palette": [
    { "name": "주 재질명", "hex": "#181a20", "material": "광택 블랙 메탈 (metallic 0.85, roughness 0.2)" },
    { "name": "보조 재질명", "hex": "#4a5260", "material": "브러시드 스틸" },
    { "name": "포인트 발광", "hex": "#ff2a2a", "material": "네온 발광 (emission 3.5)" }
  ],
  "artworkSvg": "<svg viewBox=\\"0 0 420 420\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>"
}`;

const PROMPT_GEN_SYSTEM_PROMPT = `You are a 3D Technical Director converting a Concept Sheet into a precise, actionable 3D Modeling Prompt for PlayForge's Headless Blender pipeline.
Write a clear, structured Korean 3D modeling prompt (6-10 concise bullet lines) covering:
- 대상 형태와 전체 실루엣 및 비율(미터 단위: 가로×깊이×높이)
- 상체/하체/머리/장비 등 주요 파트 분할 구조 (최소 16~40개 파트로 조립할 지침)
- 정확한 PBR 재질과 헥스 컬러(메탈릭/러프니스/발광 포인트)
- 방향 규칙(-Y 정면, +Z 위쪽, Z=0 바닥 접지) 및 Godot glTF 2.0 호환 기준

Respond with ONLY ONE JSON object:
{
  "modelingPrompt": "생성된 상세 3D 모델링 프롬프트 문자열",
  "checklist": ["체크항목 1", "체크항목 2", "체크항목 3"]
}`;

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeArtworkSvg(raw) {
  if (typeof raw !== 'string') return '';
  let svg = raw.trim();
  const match = svg.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return '';
  svg = match[0];
  // Strip any active/dangerous tags or attributes
  svg = svg
    .replace(/<\s*(script|foreignObject|iframe|object|embed|style|link|meta|use|image|audio|video)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|\/>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript:|data:|https?:)[^"]*"|'\s*(?:javascript:|data:|https?:)[^']*')/gi, '')
    .replace(/url\(\s*["']?\s*(?:https?:|javascript:|data:)[^)]*\)/gi, 'none');

  // Extract inner elements inside <svg ...> ... </svg> so we can mount cleanly in our concept sheet frame
  const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!innerMatch || innerMatch[1].trim().length < 20) return '';
  return innerMatch[1].trim();
}

function detectSubjectPalette(idea, variation = 1) {
  const text = String(idea || '');
  if (/다스\s*베이더|darth\s*vader|스타워즈|시스/i.test(text)) {
    return {
      archetypeHint: 'vader',
      title: `다스베이더 컨셉 #${variation}`,
      assetName: `DarthVader_v${variation}`,
      proportions: { widthM: 1.05, depthM: 0.72, heightM: 2.02 },
      visualBrief: '광택 블랙 헬멧과 플레어 넥가드, 삼각형 호흡기 그릴, 가슴 생명유지 제어 패널, 길게 흐르는 다크 망토와 붉게 빛나는 라이트세이버를 갖춘 시스 로드 실루엣.',
      keyFeatures: [
        '광택 블랙 돔 헬멧 + 좌우 플레어 스커트 & 삼각 호흡기 마스크',
        '흉부 제어 패널(적색/녹색/청색 LED 버튼) 및 벨트 박스',
        '어깨 갑주(폴드론)와 등 뒤로 펼쳐지는 각진 다크 망토',
        '오른손 실버 힐트와 강렬한 적색 발광 라이트세이버 블레이드',
      ],
      palette: [
        { name: '옵시디언 아머', hex: '#14171f', material: '글로시 블랙 메탈 (metallic 0.85, roughness 0.18)' },
        { name: '다크 클록', hex: '#1f232e', material: '매트 패브릭 (metallic 0.05, roughness 0.88)' },
        { name: '제어반 스틸', hex: '#8b95a5', material: '브러시드 메탈 (metallic 0.90, roughness 0.28)' },
        { name: '라이트세이버 코어', hex: '#ff2438', material: '고휘도 발광 (emission 4.2)' },
      ],
    };
  }
  if (/아이언\s*맨|iron\s*man/i.test(text)) {
    const altRed = variation % 2 === 0 ? '#8e1118' : '#b81d24';
    const altGold = variation % 2 === 0 ? '#f0c850' : '#e0b034';
    return {
      archetypeHint: 'ironman',
      title: `아이언맨 아머 컨셉 #${variation}`,
      assetName: `IronMan_v${variation}`,
      proportions: { widthM: 0.96, depthM: 0.48, heightM: 1.88 },
      visualBrief: '유선형 크림슨 레드/티타늄 골드 메탈릭 파워 슈트. 중앙 시안 발광 아크 리액터, 날카로운 발광 아이 슬릿, 손바닥 리펄서 및 등부 플라이트 스태빌라이저 구성.',
      keyFeatures: [
        '크림슨 레드 돔 헬멧 + 골드 페이스플레이트 + 시안 발광 눈',
        '흉부 원형/삼각형 아크 리액터 발광 코어 및 링 하우징',
        '골드 상완/허벅지 + 레드 전완/정강이 분할 아머 플레이트',
        '손바닥 시안 리펄서 발광 및 등부 추진기 백팩',
      ],
      palette: [
        { name: '핫로드 레드', hex: altRed, material: '카페인티드 메탈 (metallic 0.92, roughness 0.18)' },
        { name: '티타늄 골드', hex: altGold, material: '폴리시드 골드 (metallic 0.95, roughness 0.16)' },
        { name: '내부 프레임', hex: '#28303b', material: '다크 합금 (metallic 0.82, roughness 0.35)' },
        { name: '아크 리액터', hex: '#48eaff', material: '고휘도 시안 발광 (emission 3.8)' },
      ],
    };
  }
  if (/드래곤|용|dragon/i.test(text)) {
    return {
      archetypeHint: 'creature',
      title: `판타지 드래곤 컨셉 #${variation}`,
      assetName: `FantasyDragon_v${variation}`,
      proportions: { widthM: 3.2, depthM: 3.6, heightM: 2.4 },
      visualBrief: '강인한 흉부와 길게 뻗은 목, 뿔 달린 두상, 좌우로 펼쳐진 날개, 가시 돋친 꼬리를 지닌 판타지 드래곤 크리처.',
      keyFeatures: [
        '각진 주둥이·쌍뿔·발광 눈을 지닌 드래곤 헤드',
        '아치형 목과 근육질 몸통 + 복부 비늘 플레이트',
        '양측으로 펼쳐진 대형 각진 날개(뼈대 + 익막)',
        '꼬리 끝 화살촉 스파이크 및 네 발 발톱 스탠스',
      ],
      palette: [
        { name: '드래곤 스케일', hex: variation % 2 === 0 ? '#2b3a67' : '#8f1d21', material: '반광 비늘 (metallic 0.25, roughness 0.42)' },
        { name: '복부/뿔 골드', hex: '#d4a64a', material: '본/혼 재질 (metallic 0.15, roughness 0.55)' },
        { name: '익막 다크', hex: '#38242b', material: '가죽 막 (metallic 0.05, roughness 0.72)' },
        { name: '브레스 글로우', hex: '#ff6b2b', material: '용암 발광 (emission 3.4)' },
      ],
    };
  }
  if (/검|칼|sword|blade|광선검|라이트세이버/i.test(text)) {
    return {
      archetypeHint: 'weapon',
      title: `웨폰 컨셉 #${variation}`,
      assetName: `HeroWeapon_v${variation}`,
      proportions: { widthM: 0.4, depthM: 0.14, heightM: 1.5 },
      visualBrief: '균형 잡힌 그립, 장식 크로스가드, 중앙 코어 보석과 예리하게 테이퍼진 블레이드를 갖춘 게임용 3D 무기.',
      keyFeatures: [
        '다이아몬드 단면 테이퍼 블레이드 + 발광 엣지/코어',
        '날개형 메탈릭 크로스가드 & 중앙 발광 보석',
        '랩핑된 다크 그립과 폼멜 밸런스 웨이트',
        'Godot 소켓 장착에 최적화된 하단 그립 기준 원점',
      ],
      palette: [
        { name: '블레이드 스틸', hex: '#cfd9e6', material: '연마 강철 (metallic 0.94, roughness 0.18)' },
        { name: '가드 골드', hex: '#d8a832', material: '장식 금속 (metallic 0.88, roughness 0.25)' },
        { name: '그립 레더', hex: '#242934', material: '가죽 (metallic 0.05, roughness 0.78)' },
        { name: '룬 글로우', hex: '#38bdf8', material: '마법 발광 (emission 3.0)' },
      ],
    };
  }

  // Generic rich stylized game prop/character concept
  const huePalette = [
    ['#3b82f6', '#e2e8f0', '#22d3ee'],
    ['#10b981', '#d97706', '#fef08a'],
    ['#8b5cf6', '#cbd5e1', '#f472b6'],
  ][(variation - 1) % 3];
  return {
    archetypeHint: 'generic',
    title: `${text.slice(0, 24)} 컨셉 #${variation}`,
    assetName: sanitizeAssetName(`Concept_${variation}`, `Concept_${variation}`),
    proportions: { widthM: 1.4, depthM: 1.2, heightM: 1.8 },
    visualBrief: `'${text}'의 핵심 실루엣과 재질 대비를 강조한 게임용 3D 컨셉 디자인. 주요 형태 덩어리와 서브 디테일, 포인트 발광 악센트를 명확히 구분.`,
    keyFeatures: [
      `'${text}'의 대표 실루엣을 살린 1차 메인 바디 구조`,
      '베벨·테이퍼·대칭 파트로 입체감을 살린 2차 디테일',
      '주 재질·보조 금속·포인트 발광의 3톤 PBR 대비',
      'Bottom-Center(Y=0) 접지 및 Godot 4 glTF 2.0 최적화',
    ],
    palette: [
      { name: '메인 바디', hex: huePalette[0], material: '스타일라이즈드 코팅 (metallic 0.35, roughness 0.42)' },
      { name: '보조 프레임', hex: huePalette[1], material: '브러시드 메탈 (metallic 0.78, roughness 0.28)' },
      { name: '다크 파츠', hex: '#1f2633', material: '매트 합금 (metallic 0.30, roughness 0.65)' },
      { name: '포인트 발광', hex: huePalette[2], material: '네온 악센트 (emission 2.6)' },
    ],
  };
}

function buildFallbackArtworkInner(spec) {
  const p0 = spec.palette[0]?.hex || '#3b82f6';
  const p1 = spec.palette[1]?.hex || '#e0b034';
  const p2 = spec.palette[2]?.hex || '#28303b';
  const acc = spec.palette[3]?.hex || '#48eaff';
  const hint = spec.archetypeHint || 'generic';

  if (hint === 'vader') {
    return `
      <defs>
        <radialGradient id="gGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${acc}" stop-opacity="0.9"/><stop offset="100%" stop-color="${acc}" stop-opacity="0"/></radialGradient>
        <linearGradient id="gArmor" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#33394a"/><stop offset="55%" stop-color="${p0}"/><stop offset="100%" stop-color="#080a0f"/></linearGradient>
      </defs>
      <ellipse cx="210" cy="378" rx="95" ry="16" fill="#000" opacity="0.45"/>
      <!-- Flowing Sith Cape -->
      <polygon points="150,115 270,115 318,365 102,365" fill="${p1}" stroke="#0d1018" stroke-width="2"/>
      <!-- Legs & Boots -->
      <rect x="172" y="255" width="30" height="112" rx="8" fill="url(#gArmor)"/>
      <rect x="218" y="255" width="30" height="112" rx="8" fill="url(#gArmor)"/>
      <rect x="166" y="346" width="38" height="24" rx="6" fill="#0f1219" stroke="#3c4459"/>
      <rect x="216" y="346" width="38" height="24" rx="6" fill="#0f1219" stroke="#3c4459"/>
      <!-- Torso & Pauldrons -->
      <polygon points="152,126 268,126 254,248 166,248" fill="url(#gArmor)" stroke="#3a4358" stroke-width="2"/>
      <ellipse cx="144" cy="144" rx="28" ry="22" fill="url(#gArmor)" stroke="#485269"/>
      <ellipse cx="276" cy="144" rx="28" ry="22" fill="url(#gArmor)" stroke="#485269"/>
      <!-- Chest Life Support Panel -->
      <rect x="184" y="150" width="52" height="44" rx="5" fill="#1b202c" stroke="${p2}" stroke-width="2"/>
      <rect x="192" y="158" width="14" height="10" rx="2" fill="${acc}"/>
      <rect x="214" y="158" width="14" height="10" rx="2" fill="#38bdf8"/>
      <rect x="192" y="175" width="36" height="8" rx="2" fill="#22c55e"/>
      <!-- Belt -->
      <rect x="166" y="232" width="88" height="18" rx="3" fill="#181c26" stroke="${p2}"/>
      <rect x="198" y="234" width="24" height="14" rx="2" fill="${p2}"/>
      <!-- Arms -->
      <rect x="122" y="156" width="24" height="96" rx="10" transform="rotate(8 134 156)" fill="url(#gArmor)"/>
      <rect x="274" y="156" width="24" height="88" rx="10" transform="rotate(-18 286 156)" fill="url(#gArmor)"/>
      <!-- Red Lightsaber -->
      <rect x="302" y="218" width="12" height="34" rx="3" transform="rotate(-22 308 235)" fill="${p2}"/>
      <line x1="306" y1="220" x2="365" y2="62" stroke="${acc}" stroke-width="14" stroke-linecap="round" opacity="0.28"/>
      <line x1="306" y1="220" x2="365" y2="62" stroke="${acc}" stroke-width="6" stroke-linecap="round"/>
      <line x1="306" y1="220" x2="365" y2="62" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      <!-- Iconic Helmet -->
      <path d="M168,116 Q165,64 210,56 Q255,64 252,116 L264,132 L156,132 Z" fill="url(#gArmor)" stroke="#4c566e" stroke-width="2"/>
      <ellipse cx="195" cy="94" rx="11" ry="7" fill="#090b10" stroke="#5b6680"/>
      <ellipse cx="225" cy="94" rx="11" ry="7" fill="#090b10" stroke="#5b6680"/>
      <polygon points="210,98 194,126 226,126" fill="#232938" stroke="${p2}" stroke-width="1.5"/>
    `;
  }

  if (hint === 'ironman') {
    return `
      <defs>
        <radialGradient id="gArc" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="${acc}"/><stop offset="100%" stop-color="${acc}" stop-opacity="0"/></radialGradient>
        <linearGradient id="gRed" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e3363e"/><stop offset="60%" stop-color="${p0}"/><stop offset="100%" stop-color="#5e0d12"/></linearGradient>
        <linearGradient id="gGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff0a6"/><stop offset="50%" stop-color="${p1}"/><stop offset="100%" stop-color="#9e7415"/></linearGradient>
      </defs>
      <ellipse cx="210" cy="380" rx="85" ry="15" fill="#000" opacity="0.45"/>
      <!-- Legs -->
      <rect x="174" y="226" width="28" height="68" rx="9" fill="url(#gGold)"/>
      <rect x="218" y="226" width="28" height="68" rx="9" fill="url(#gGold)"/>
      <rect x="172" y="290" width="30" height="78" rx="8" fill="url(#gRed)"/>
      <rect x="218" y="290" width="30" height="78" rx="8" fill="url(#gRed)"/>
      <!-- Pelvis & Torso -->
      <polygon points="164,212 256,212 246,242 174,242" fill="url(#gRed)"/>
      <polygon points="154,124 266,124 252,216 168,216" fill="url(#gRed)" stroke="#ff7a80" stroke-opacity="0.35" stroke-width="2"/>
      <rect x="178" y="182" width="24" height="24" rx="4" fill="url(#gGold)"/>
      <rect x="218" y="182" width="24" height="24" rx="4" fill="url(#gGold)"/>
      <!-- Arc Reactor -->
      <circle cx="210" cy="158" r="24" fill="url(#gArc)"/>
      <circle cx="210" cy="158" r="14" fill="#fff" stroke="${acc}" stroke-width="3"/>
      <!-- Shoulders & Arms -->
      <circle cx="144" cy="142" r="22" fill="url(#gRed)"/>
      <circle cx="276" cy="142" r="22" fill="url(#gRed)"/>
      <rect x="128" y="156" width="24" height="54" rx="10" fill="url(#gGold)"/>
      <rect x="268" y="156" width="24" height="54" rx="10" fill="url(#gGold)"/>
      <rect x="124" y="206" width="26" height="62" rx="9" fill="url(#gRed)"/>
      <rect x="270" y="206" width="26" height="62" rx="9" fill="url(#gRed)"/>
      <circle cx="137" cy="272" r="12" fill="url(#gArc)"/>
      <circle cx="283" cy="272" r="12" fill="url(#gArc)"/>
      <!-- Helmet -->
      <ellipse cx="210" cy="88" rx="34" ry="40" fill="url(#gRed)"/>
      <polygon points="186,66 234,66 228,118 210,126 192,118" fill="url(#gGold)"/>
      <rect x="190" y="85" width="16" height="6" rx="2" fill="${acc}"/>
      <rect x="214" y="85" width="16" height="6" rx="2" fill="${acc}"/>
    `;
  }

  return `
    <defs>
      <linearGradient id="gMain" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${p0}"/><stop offset="100%" stop-color="${p2}"/></linearGradient>
      <radialGradient id="gAcc" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${acc}"/><stop offset="100%" stop-color="${acc}" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="210" cy="368" rx="95" ry="18" fill="#000" opacity="0.4"/>
    <circle cx="210" cy="200" r="118" fill="url(#gAcc)" opacity="0.24"/>
    <polygon points="210,74 316,144 294,322 126,322 104,144" fill="url(#gMain)" stroke="${p1}" stroke-width="3"/>
    <polygon points="210,94 282,152 266,296 154,296 138,152" fill="${p1}" opacity="0.22"/>
    <circle cx="210" cy="196" r="34" fill="${acc}" opacity="0.88"/>
    <circle cx="210" cy="196" r="18" fill="#ffffff" opacity="0.85"/>
  `;
}

function renderConceptSheetSvg(spec, artworkInner, { variation = 1, aiLabel = 'heuristic' } = {}) {
  const palette = Array.isArray(spec.palette) ? spec.palette.slice(0, 4) : [];
  const features = Array.isArray(spec.keyFeatures) ? spec.keyFeatures.slice(0, 4) : [];
  const props = spec.proportions || { widthM: 1.0, depthM: 1.0, heightM: 1.8 };

  const swatchRows = palette.map((sw, idx) => {
    const y = 316 + idx * 54;
    const hex = sanitizeHexColor(sw.hex, '#888888');
    return `
      <rect x="492" y="${y}" width="34" height="34" rx="7" fill="${hex}" stroke="#4b5a75" stroke-width="1.5"/>
      <text x="538" y="${y + 15}" fill="#e8eef8" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${escapeXml(sw.name || 'Material')} (${hex})</text>
      <text x="538" y="${y + 32}" fill="#93a4bf" font-size="11" font-family="system-ui,sans-serif">${escapeXml(String(sw.material || '').slice(0, 48))}</text>
    `;
  }).join('\n');

  const featureRows = features.map((feat, idx) => {
    const y = 168 + idx * 27;
    return `<text x="496" y="${y}" fill="#cbd5e1" font-size="12.5" font-family="system-ui,sans-serif">• ${escapeXml(String(feat).slice(0, 56))}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 600" width="1024" height="600">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141b28"/>
      <stop offset="100%" stop-color="#0c1018"/>
    </linearGradient>
    <pattern id="bpGrid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#22304a" stroke-width="0.8"/>
    </pattern>
  </defs>
  <rect width="1024" height="600" fill="url(#bgGrad)"/>
  <rect x="24" y="24" width="436" height="552" rx="14" fill="#101724" stroke="#2c3a54" stroke-width="1.5"/>
  <rect x="34" y="34" width="416" height="444" rx="10" fill="url(#bpGrid)"/>
  <g transform="translate(32, 46)">
    ${artworkInner}
  </g>
  <!-- Dimension Ruler Footer -->
  <line x1="48" y1="506" x2="436" y2="506" stroke="#3b4d6e" stroke-width="1.5" stroke-dasharray="4 4"/>
  <text x="48" y="534" fill="#93c5fd" font-size="12" font-weight="700" font-family="ui-monospace,Consolas,monospace">SCALE: ${Number(props.widthM || 1).toFixed(2)}m (W) × ${Number(props.depthM || 1).toFixed(2)}m (D) × ${Number(props.heightM || 1).toFixed(2)}m (H)</text>
  <text x="48" y="556" fill="#7c8da8" font-size="11" font-family="ui-monospace,Consolas,monospace">PIVOT: Bottom-Center (Z=0 / glTF Y=0) · FRONT: -Y</text>

  <!-- Right Concept Spec Panel -->
  <rect x="476" y="24" width="524" height="552" rx="14" fill="#141a26" stroke="#2c3a54" stroke-width="1.5"/>
  <rect x="492" y="42" width="136" height="24" rx="12" fill="#1b2b48" stroke="#36548a"/>
  <text x="506" y="58" fill="#93c5fd" font-size="11" font-weight="700" font-family="system-ui,sans-serif">STAGE 1 · CONCEPT #${variation}</text>
  <text x="980" y="58" text-anchor="end" fill="#6ee7b7" font-size="11" font-weight="600" font-family="ui-monospace,Consolas,monospace">${escapeXml(aiLabel)}</text>

  <text x="492" y="96" fill="#f1f5f9" font-size="22" font-weight="800" font-family="system-ui,sans-serif">${escapeXml(spec.title || '3D Concept')}</text>
  <text x="492" y="122" fill="#9fb0ca" font-size="12" font-family="system-ui,sans-serif">${escapeXml(String(spec.visualBrief || '').slice(0, 68))}</text>
  <text x="492" y="139" fill="#9fb0ca" font-size="12" font-family="system-ui,sans-serif">${escapeXml(String(spec.visualBrief || '').slice(68, 136))}</text>

  <line x1="492" y1="150" x2="984" y2="150" stroke="#273247"/>
  ${featureRows}

  <text x="492" y="298" fill="#93c5fd" font-size="12" font-weight="700" font-family="system-ui,sans-serif">PBR COLOR &amp; MATERIAL CALLOUTS</text>
  ${swatchRows}
</svg>`;
}

async function resolveProviderSelection(aiProvider, aiModel, agentChatProvider) {
  const reqProv = String(aiProvider || 'auto').trim();
  const reqModel = String(aiModel || '').trim();
  if (reqProv === 'heuristic' || !agentChatProvider) {
    return { provider: 'heuristic', model: 'offline-v1', useLlm: false };
  }
  const catalog = await listAiModels(agentChatProvider);
  if (reqProv === 'auto') {
    if (catalog.recommended?.provider && catalog.recommended.provider !== 'heuristic') {
      return {
        provider: catalog.recommended.provider,
        model: reqModel || catalog.recommended.model,
        useLlm: true,
      };
    }
    return { provider: 'heuristic', model: 'offline-v1', useLlm: false };
  }
  const found = catalog.providers.find(p => p.id === reqProv);
  if (!found || !found.configured) {
    const err = new Error(`선택한 AI 공급자(${reqProv})가 연결되어 있지 않습니다.`);
    err.status = 503;
    throw err;
  }
  return { provider: found.id, model: reqModel || found.defaultModel, useLlm: true };
}

async function generateConcept(input = {}, { conceptsDir, agentChatProvider = null } = {}) {
  const idea = String(input.prompt || input.idea || '').trim();
  if (!idea) {
    const err = new Error('컨셉 이미지를 생성할 아이디어(프롬프트)를 입력해 주세요.');
    err.status = 400;
    throw err;
  }
  const style = String(input.style || 'stylized').trim().toLowerCase();
  const variation = Math.max(1, Number(input.variation) || 1);
  const sel = await resolveProviderSelection(input.aiProvider, input.aiModel, agentChatProvider);

  const fallbackSpec = detectSubjectPalette(idea, variation);
  let spec = { ...fallbackSpec, style };
  let artworkInner = '';
  let usedLlm = false;
  let warning = null;

  if (sel.useLlm) {
    try {
      const userMsg = [
        `Design a 3D Concept Art Sheet JSON for: "${idea}"`,
        `Style: ${style}, Variation #${variation} (make each variation visually distinct in pose/trim/color nuance if variation > 1).`,
        `Include a detailed, recognizable vector illustration in "artworkSvg" (viewBox="0 0 420 420").`,
        `Return ONLY valid JSON.`,
      ].join('\n');
      const res = await invokeAgentChatProvider(agentChatProvider, 'POST', '/api/agent-chat', {
        provider: sel.provider,
        model: sel.model || undefined,
        messages: [
          { role: 'system', content: CONCEPT_SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      });
      if (res.statusCode === 200 && res.json?.message?.content) {
        const parsed = extractJsonObject(res.json.message.content);
        spec = {
          ...fallbackSpec,
          title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 80) : fallbackSpec.title,
          assetName: sanitizeAssetName(parsed.assetName || fallbackSpec.assetName, fallbackSpec.assetName),
          style: typeof parsed.style === 'string' ? parsed.style.trim().slice(0, 32) : style,
          visualBrief: typeof parsed.visualBrief === 'string' && parsed.visualBrief.trim() ? parsed.visualBrief.trim().slice(0, 320) : fallbackSpec.visualBrief,
          keyFeatures: Array.isArray(parsed.keyFeatures) && parsed.keyFeatures.length ? parsed.keyFeatures.slice(0, 6).map(x => String(x)) : fallbackSpec.keyFeatures,
          proportions: {
            widthM: clampNumber(parsed.proportions?.widthM, 0.1, 30, fallbackSpec.proportions.widthM),
            depthM: clampNumber(parsed.proportions?.depthM, 0.1, 30, fallbackSpec.proportions.depthM),
            heightM: clampNumber(parsed.proportions?.heightM, 0.1, 30, fallbackSpec.proportions.heightM),
          },
          palette: Array.isArray(parsed.palette) && parsed.palette.length
            ? parsed.palette.slice(0, 4).map(sw => ({
                name: String(sw?.name || 'Color').slice(0, 32),
                hex: sanitizeHexColor(sw?.hex, '#888888'),
                material: String(sw?.material || 'PBR').slice(0, 64),
              }))
            : fallbackSpec.palette,
        };
        artworkInner = sanitizeArtworkSvg(parsed.artworkSvg);
        usedLlm = true;
      } else {
        throw new Error(res.json?.error || `HTTP ${res.statusCode}`);
      }
    } catch (err) {
      if (input.aiProvider && input.aiProvider !== 'auto') {
        throw err;
      }
      warning = `AI 모델(${sel.provider}/${sel.model}) 응답 실패로 오프라인 컨셉 시트로 대체: ${err.message}`;
    }
  }

  if (!artworkInner) {
    artworkInner = buildFallbackArtworkInner(spec);
  }

  const conceptId = 'cnc_' + crypto.randomBytes(6).toString('hex');
  const aiLabel = usedLlm ? `${sel.provider}/${sel.model}` : 'offline-concept-v1';
  const svgContent = renderConceptSheetSvg(spec, artworkInner, { variation, aiLabel });

  const record = {
    schemaVersion: 1,
    conceptId,
    idea,
    variation,
    style: spec.style,
    title: spec.title,
    assetName: spec.assetName,
    visualBrief: spec.visualBrief,
    keyFeatures: spec.keyFeatures,
    proportions: spec.proportions,
    palette: spec.palette,
    ai: {
      provider: usedLlm ? sel.provider : 'heuristic',
      model: usedLlm ? sel.model : 'offline-concept-v1',
      usedLlm,
      ...(warning ? { warning } : {}),
    },
    imageUrl: `/api/blender/concepts/${conceptId}/image.svg`,
    createdAt: new Date().toISOString(),
  };

  if (conceptsDir) {
    const dir = path.join(conceptsDir, conceptId);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'concept.svg'), svgContent, 'utf8');
    await fs.promises.writeFile(path.join(dir, 'concept.json'), JSON.stringify(record, null, 2), 'utf8');
  }

  return { ok: true, concept: record };
}

async function generateModelingPrompt(input = {}, { concept = null, agentChatProvider = null } = {}) {
  const idea = String(input.idea || input.prompt || concept?.idea || '').trim();
  if (!idea) {
    const err = new Error('프롬프트를 생성할 주제 또는 컨셉이 필요합니다.');
    err.status = 400;
    throw err;
  }
  const style = String(input.style || concept?.style || 'stylized').trim();
  const sel = await resolveProviderSelection(input.aiProvider, input.aiModel, agentChatProvider);

  const props = concept?.proportions || { widthM: 1.1, depthM: 0.7, heightM: 1.85 };
  const paletteLines = (concept?.palette || []).map(p => `${p.name}(${p.hex}, ${p.material})`).join(', ');
  const featureLines = (concept?.keyFeatures || []).map(f => `- ${f}`).join('\n');

  const deterministicPrompt = [
    `[대상] ${idea} (${concept?.title || style} · ${style} 스타일)`,
    `[크기/비율] 가로 ${props.widthM}m × 깊이 ${props.depthM}m × 높이 ${props.heightM}m, 정면 -Y, 위쪽 +Z, 바닥 Z=0 접지`,
    concept?.visualBrief ? `[실루엣 요약] ${concept.visualBrief}` : '',
    featureLines ? `[핵심 구조 파트]\n${featureLines}` : `[핵심 구조 파트]\n- 메인 바디, 헤드/상단 디테일, 대칭 보조 파츠, 포인트 악센트를 20~40개 파트로 정교하게 분할 구성`,
    paletteLines ? `[PBR 재질 팔레트] ${paletteLines}` : `[PBR 재질 팔레트] 주/보조 메탈릭·러프니스 대비 및 발광 포인트 적용`,
    `[출력 규격] Headless Blender glTF 2.0 (.glb), Y-Up, Bottom-Center 원점 정규화, Godot 4 씬 즉시 배치`,
  ].filter(Boolean).join('\n');

  let modelingPrompt = deterministicPrompt;
  let checklist = [
    '컨셉 시트의 주요 실루엣과 대칭 구조 반영',
    '파트 간 공중 부유 없이 물리적으로 연결',
    'PBR 색상·금속성·발광 강도 적용 및 Z=0 바닥 정규화',
  ];
  let usedLlm = false;
  let warning = null;

  if (sel.useLlm) {
    try {
      const res = await invokeAgentChatProvider(agentChatProvider, 'POST', '/api/agent-chat', {
        provider: sel.provider,
        model: sel.model || undefined,
        messages: [
          { role: 'system', content: PROMPT_GEN_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `User idea: "${idea}"`,
              `Style: ${style}`,
              concept ? `Stage 1 Concept Sheet:\n${JSON.stringify({
                title: concept.title,
                visualBrief: concept.visualBrief,
                keyFeatures: concept.keyFeatures,
                proportions: concept.proportions,
                palette: concept.palette,
              }, null, 2)}` : '',
              `Return ONLY valid JSON with "modelingPrompt" and "checklist".`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      });
      if (res.statusCode === 200 && res.json?.message?.content) {
        const parsed = extractJsonObject(res.json.message.content);
        if (typeof parsed.modelingPrompt === 'string' && parsed.modelingPrompt.trim().length > 20) {
          modelingPrompt = parsed.modelingPrompt.trim().slice(0, 3000);
          if (Array.isArray(parsed.checklist) && parsed.checklist.length) {
            checklist = parsed.checklist.slice(0, 6).map(x => String(x));
          }
          usedLlm = true;
        }
      } else {
        throw new Error(res.json?.error || `HTTP ${res.statusCode}`);
      }
    } catch (err) {
      if (input.aiProvider && input.aiProvider !== 'auto') {
        throw err;
      }
      warning = `AI 모델(${sel.provider}/${sel.model}) 호출 실패로 구조화 프롬프트 생성기로 대체: ${err.message}`;
    }
  }

  return {
    ok: true,
    idea,
    conceptId: concept?.conceptId || null,
    modelingPrompt,
    checklist,
    ai: {
      provider: usedLlm ? sel.provider : 'heuristic',
      model: usedLlm ? sel.model : 'offline-prompt-v1',
      usedLlm,
      ...(warning ? { warning } : {}),
    },
  };
}

module.exports = {
  sanitizeArtworkSvg,
  generateConcept,
  generateModelingPrompt,
};
