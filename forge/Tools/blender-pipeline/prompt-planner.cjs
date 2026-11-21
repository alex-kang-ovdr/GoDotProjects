'use strict';

const crypto = require('node:crypto');
const {
  validateMeshRecipe,
  validatePlacement,
  sanitizeAssetName,
  clampNumber,
} = require('./engine-adapter.cjs');

const ARCHETYPE_DEFAULTS = {
  chest: {
    label: '보물상자',
    namePrefix: 'TreasureChest',
    dimensions: { width: 1.2, depth: 0.8, height: 0.9 },
    palette: { primary: '#7a4a24', secondary: '#d8a832', accent: '#4fc3f7' },
    materialProfile: {
      primary: { metallic: 0.05, roughness: 0.68, emissionStrength: 0 },
      secondary: { metallic: 0.88, roughness: 0.25, emissionStrength: 0 },
      accent: { metallic: 0.15, roughness: 0.16, emissionStrength: 1.1 },
    },
    patterns: [/보물\s*상자/, /보물함/, /트레저/, /chest/i],
  },
  crate: {
    label: '상자',
    namePrefix: 'SupplyCrate',
    dimensions: { width: 1.0, depth: 1.0, height: 1.0 },
    palette: { primary: '#9c6b3b', secondary: '#5e3d1e', accent: '#d8a832' },
    materialProfile: {
      primary: { metallic: 0.04, roughness: 0.74, emissionStrength: 0 },
      secondary: { metallic: 0.12, roughness: 0.65, emissionStrength: 0 },
      accent: { metallic: 0.75, roughness: 0.3, emissionStrength: 0 },
    },
    patterns: [/나무\s*상자/, /상자/, /박스/, /crate/i, /\bbox\b/i],
  },
  tree: {
    label: '나무',
    namePrefix: 'StylizedTree',
    dimensions: { width: 2.2, depth: 2.2, height: 3.6 },
    palette: { primary: '#2f7d44', secondary: '#6b4423', accent: '#7ce38b' },
    materialProfile: {
      primary: { metallic: 0.0, roughness: 0.82, emissionStrength: 0 },
      secondary: { metallic: 0.0, roughness: 0.88, emissionStrength: 0 },
      accent: { metallic: 0.05, roughness: 0.4, emissionStrength: 0.9 },
    },
    patterns: [/소나무/, /전나무/, /참나무/, /나무/, /숲/, /tree/i, /pine/i, /oak/i],
  },
  sword: {
    label: '검',
    namePrefix: 'FantasySword',
    dimensions: { width: 0.38, depth: 0.12, height: 1.45 },
    palette: { primary: '#c5d2e0', secondary: '#d8a832', accent: '#38bdf8' },
    materialProfile: {
      primary: { metallic: 0.92, roughness: 0.22, emissionStrength: 0 },
      secondary: { metallic: 0.88, roughness: 0.26, emissionStrength: 0 },
      accent: { metallic: 0.25, roughness: 0.15, emissionStrength: 1.6 },
    },
    patterns: [/장검/, /대검/, /마검/, /검/, /칼/, /sword/i, /blade/i],
  },
  staff: {
    label: '마법 지팡이',
    namePrefix: 'ArcaneStaff',
    dimensions: { width: 0.36, depth: 0.36, height: 1.9 },
    palette: { primary: '#634025', secondary: '#d8a832', accent: '#a855f7' },
    materialProfile: {
      primary: { metallic: 0.05, roughness: 0.68, emissionStrength: 0 },
      secondary: { metallic: 0.88, roughness: 0.26, emissionStrength: 0 },
      accent: { metallic: 0.1, roughness: 0.14, emissionStrength: 2.0 },
    },
    patterns: [/지팡이/, /완드/, /스태프/, /staff/i, /wand/i],
  },
  tower: {
    label: '감시탑',
    namePrefix: 'WatchTower',
    dimensions: { width: 2.6, depth: 2.6, height: 5.5 },
    palette: { primary: '#838b96', secondary: '#7c2d2d', accent: '#fbbf24' },
    materialProfile: {
      primary: { metallic: 0.04, roughness: 0.84, emissionStrength: 0 },
      secondary: { metallic: 0.12, roughness: 0.62, emissionStrength: 0 },
      accent: { metallic: 0.05, roughness: 0.2, emissionStrength: 1.8 },
    },
    patterns: [/감시탑/, /성탑/, /마법탑/, /망루/, /타워/, /탑/, /tower/i, /turret/i],
  },
  house: {
    label: '집',
    namePrefix: 'VillageHouse',
    dimensions: { width: 3.4, depth: 2.8, height: 3.0 },
    palette: { primary: '#dfd3be', secondary: '#9e3a2b', accent: '#fcd34d' },
    materialProfile: {
      primary: { metallic: 0.02, roughness: 0.82, emissionStrength: 0 },
      secondary: { metallic: 0.08, roughness: 0.68, emissionStrength: 0 },
      accent: { metallic: 0.05, roughness: 0.2, emissionStrength: 1.6 },
    },
    patterns: [/오두막/, /주택/, /건물/, /집/, /house/i, /cabin/i, /cottage/i],
  },
  pillar: {
    label: '기둥',
    namePrefix: 'StonePillar',
    dimensions: { width: 1.0, depth: 1.0, height: 3.4 },
    palette: { primary: '#cbd1d9', secondary: '#9ba4b0', accent: '#38bdf8' },
    materialProfile: {
      primary: { metallic: 0.03, roughness: 0.78, emissionStrength: 0 },
      secondary: { metallic: 0.06, roughness: 0.72, emissionStrength: 0 },
      accent: { metallic: 0.1, roughness: 0.2, emissionStrength: 1.0 },
    },
    patterns: [/기둥/, /석주/, /컬럼/, /pillar/i, /column/i],
  },
  rock: {
    label: '바위',
    namePrefix: 'BoulderRock',
    dimensions: { width: 1.8, depth: 1.5, height: 1.2 },
    palette: { primary: '#767d87', secondary: '#596069', accent: '#60a5fa' },
    materialProfile: {
      primary: { metallic: 0.02, roughness: 0.9, emissionStrength: 0 },
      secondary: { metallic: 0.02, roughness: 0.92, emissionStrength: 0 },
      accent: { metallic: 0.1, roughness: 0.25, emissionStrength: 0.6 },
    },
    patterns: [/바위/, /돌덩이/, /암석/, /돌/, /rock/i, /boulder/i, /stone/i],
  },
  crystal: {
    label: '크리스탈',
    namePrefix: 'MagicCrystal',
    dimensions: { width: 1.2, depth: 1.2, height: 1.8 },
    palette: { primary: '#38bdf8', secondary: '#4d5666', accent: '#38bdf8' },
    materialProfile: {
      primary: { metallic: 0.12, roughness: 0.14, emissionStrength: 1.2 },
      secondary: { metallic: 0.05, roughness: 0.85, emissionStrength: 0 },
      accent: { metallic: 0.18, roughness: 0.12, emissionStrength: 1.8 },
    },
    patterns: [/크리스탈/, /수정/, /보석/, /광석/, /crystal/i, /gem/i, /shard/i],
  },
  barrel: {
    label: '드럼통/술통',
    namePrefix: 'GameBarrel',
    dimensions: { width: 0.85, depth: 0.85, height: 1.15 },
    palette: { primary: '#8c552b', secondary: '#4b5563', accent: '#ef4444' },
    materialProfile: {
      primary: { metallic: 0.06, roughness: 0.72, emissionStrength: 0 },
      secondary: { metallic: 0.85, roughness: 0.34, emissionStrength: 0 },
      accent: { metallic: 0.15, roughness: 0.3, emissionStrength: 0.5 },
    },
    patterns: [/드럼통/, /술통/, /배럴/, /오크통/, /통/, /barrel/i, /drum/i],
  },
  lantern: {
    label: '랜턴',
    namePrefix: 'GlowLantern',
    dimensions: { width: 0.48, depth: 0.48, height: 0.78 },
    palette: { primary: '#363d49', secondary: '#2f3540', accent: '#ffb74d' },
    materialProfile: {
      primary: { metallic: 0.82, roughness: 0.35, emissionStrength: 0 },
      secondary: { metallic: 0.85, roughness: 0.32, emissionStrength: 0 },
      accent: { metallic: 0.05, roughness: 0.15, emissionStrength: 2.6 },
    },
    patterns: [/랜턴/, /등불/, /가로등/, /횃불/, /lantern/i, /lamp/i, /torch/i],
  },
  table: {
    label: '탁자',
    namePrefix: 'WoodTable',
    dimensions: { width: 1.8, depth: 1.0, height: 0.82 },
    palette: { primary: '#966338', secondary: '#694221', accent: '#d8a832' },
    materialProfile: {
      primary: { metallic: 0.04, roughness: 0.65, emissionStrength: 0 },
      secondary: { metallic: 0.06, roughness: 0.7, emissionStrength: 0 },
      accent: { metallic: 0.8, roughness: 0.25, emissionStrength: 0 },
    },
    patterns: [/탁자/, /테이블/, /책상/, /table/i, /desk/i],
  },
  robot: {
    label: '로봇/슈트',
    namePrefix: 'CyberRobot',
    dimensions: { width: 1.1, depth: 0.75, height: 1.85 },
    palette: { primary: '#56789c', secondary: '#344152', accent: '#22d3ee' },
    materialProfile: {
      primary: { metallic: 0.76, roughness: 0.28, emissionStrength: 0 },
      secondary: { metallic: 0.84, roughness: 0.35, emissionStrength: 0 },
      accent: { metallic: 0.12, roughness: 0.14, emissionStrength: 2.4 },
    },
    patterns: [/아이언\s*맨/, /iron\s*man/i, /슈퍼\s*히어로/, /히어로/, /슈트/, /아머/, /갑옷/, /건담/, /로봇/, /메카/, /안드로이드/, /캐릭터/, /인간/, /봇/, /robot/i, /mech/i, /droid/i, /hero/i, /armor/i, /character/i],
  },
  car: {
    label: '차량',
    namePrefix: 'LowpolyCar',
    dimensions: { width: 1.9, depth: 3.8, height: 1.45 },
    palette: { primary: '#e04f47', secondary: '#d7e3f0', accent: '#fef08a' },
    materialProfile: {
      primary: { metallic: 0.55, roughness: 0.25, emissionStrength: 0 },
      secondary: { metallic: 0.2, roughness: 0.16, emissionStrength: 0 },
      accent: { metallic: 0.1, roughness: 0.15, emissionStrength: 2.2 },
    },
    patterns: [/자동차/, /스포츠카/, /차량/, /트럭/, /차\b/, /\bcar\b/i, /vehicle/i, /truck/i],
  },
};

const COLOR_MAP = [
  { hex: '#dc3d3d', patterns: [/빨간/, /붉은/, /레드/, /적색/, /\bred\b/i, /crimson/i] },
  { hex: '#2f7df6', patterns: [/파란/, /푸른/, /블루/, /청색/, /\bblue\b/i, /azure/i] },
  { hex: '#2ea85a', patterns: [/초록/, /녹색/, /그린/, /에메랄드/, /\bgreen\b/i, /emerald/i] },
  { hex: '#e5b82e', patterns: [/황금/, /금색/, /골드/, /노란/, /\bgold\b/i, /golden/i, /\byellow\b/i] },
  { hex: '#9333ea', patterns: [/보라/, /자주/, /퍼플/, /\bpurple\b/i, /violet/i] },
  { hex: '#f97316', patterns: [/주황/, /오렌지/, /\borange\b/i] },
  { hex: '#ec4899', patterns: [/분홍/, /핑크/, /\bpink\b/i, /magenta/i] },
  { hex: '#22d3ee', patterns: [/시안/, /하늘색/, /청록/, /민트/, /네온/, /\bcyan\b/i, /\bneon\b/i] },
  { hex: '#edf2f7', patterns: [/하얀/, /흰색/, /화이트/, /백색/, /\bwhite\b/i] },
  { hex: '#222730', patterns: [/검은/, /까만/, /블랙/, /흑색/, /다크/, /\bblack\b/i, /\bdark\b/i] },
  { hex: '#c0cad6', patterns: [/은색/, /실버/, /회색/, /\bsilver\b/i, /\bgray\b/i, /\bgrey\b/i] },
  { hex: '#8b5a2b', patterns: [/갈색/, /브라운/, /\bbrown\b/i] },
];

function stableSeed(text) {
  const digest = crypto.createHash('sha256').update(String(text || '')).digest();
  return digest.readUInt32BE(0) % 1000000;
}

function detectArchetype(prompt) {
  // Check more specific archetypes first (e.g., chest before crate, crystal before sword if crystal+sword check)
  const order = [
    'chest', 'tree', 'sword', 'staff', 'tower', 'house', 'pillar',
    'barrel', 'lantern', 'table', 'robot', 'car', 'crystal', 'rock', 'crate',
  ];
  for (const key of order) {
    if (ARCHETYPE_DEFAULTS[key].patterns.some(re => re.test(prompt))) {
      return key;
    }
  }
  return 'crate';
}

function extractColors(prompt) {
  const found = [];
  for (const entry of COLOR_MAP) {
    if (entry.patterns.some(re => re.test(prompt))) {
      found.push(entry.hex);
    }
  }
  return found;
}

function extractDimensions(prompt, baseDims) {
  const dims = { ...baseDims };
  // Explicit height in meters: e.g. "높이 4m", "4.5m", "height 3m"
  const heightMatch = prompt.match(/(?:높이|키|height)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?/i) ||
    prompt.match(/(\d+(?:\.\d+)?)\s*(?:m|미터)\b/i);
  if (heightMatch) {
    const targetH = clampNumber(parseFloat(heightMatch[1]), 0.2, 25, dims.height);
    const ratio = targetH / Math.max(0.1, dims.height);
    dims.height = Number(targetH.toFixed(3));
    dims.width = Number(clampNumber(dims.width * ratio, 0.1, 25, dims.width).toFixed(3));
    dims.depth = Number(clampNumber(dims.depth * ratio, 0.1, 25, dims.depth).toFixed(3));
  }

  // Relative scale keywords
  let scaleFactor = 1.0;
  const multMatch = prompt.match(/(\d+(?:\.\d+)?)\s*배/);
  if (multMatch) {
    scaleFactor = clampNumber(parseFloat(multMatch[1]), 0.2, 5.0, 1.0);
  } else if (/거대한|초대형|giant|huge/i.test(prompt)) {
    scaleFactor = 1.8;
  } else if (/큰|대형|large|big/i.test(prompt)) {
    scaleFactor = 1.35;
  } else if (/작은|미니|소형|small|mini|tiny/i.test(prompt)) {
    scaleFactor = 0.65;
  }
  if (scaleFactor !== 1.0) {
    dims.width = Number(clampNumber(dims.width * scaleFactor, 0.1, 30, dims.width).toFixed(3));
    dims.depth = Number(clampNumber(dims.depth * scaleFactor, 0.1, 30, dims.depth).toFixed(3));
    dims.height = Number(clampNumber(dims.height * scaleFactor, 0.1, 30, dims.height).toFixed(3));
  }
  return dims;
}

function extractPlacement(prompt, explicitPlacement) {
  const base = validatePlacement(explicitPlacement);
  if (explicitPlacement && Array.isArray(explicitPlacement.position)) {
    return base;
  }
  const pos = [...base.position];
  const xMatch = prompt.match(/\bx\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const yMatch = prompt.match(/\by\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const zMatch = prompt.match(/\bz\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (xMatch || yMatch || zMatch) {
    if (xMatch) pos[0] = clampNumber(parseFloat(xMatch[1]), -500, 500, 0);
    if (yMatch) pos[1] = clampNumber(parseFloat(yMatch[1]), -500, 500, 0);
    if (zMatch) pos[2] = clampNumber(parseFloat(zMatch[1]), -500, 500, 0);
  } else {
    const tupleMatch = prompt.match(/(?:위치|좌표|pos|position|at)\s*[:=]?\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/i);
    if (tupleMatch) {
      pos[0] = clampNumber(parseFloat(tupleMatch[1]), -500, 500, 0);
      pos[1] = clampNumber(parseFloat(tupleMatch[2]), -500, 500, 0);
      pos[2] = clampNumber(parseFloat(tupleMatch[3]), -500, 500, 0);
    }
  }
  return { ...base, position: pos };
}

function planFromPrompt(input = {}) {
  const rawPrompt = typeof input === 'string' ? input : String(input.prompt || '').trim();
  if (!rawPrompt && !input.recipe) {
    const err = new Error('자연어 프롬프트(prompt) 또는 MeshRecipe(recipe)가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const prompt = rawPrompt || `Custom ${input.recipe?.archetype || 'prop'}`;

  // Offline Darth Vader preset so offline mode also produces a recognizable multi-part Sith Lord
  if (!input.recipe && /다스\s*베이더|darth\s*vader/i.test(prompt)) {
    const placement = extractPlacement(prompt, input.placement);
    const black = '#14171f';
    const cloak = '#1c202a';
    const steel = '#8b95a5';
    const crimson = '#ff2035';
    const vaderParts = [
      // Boots & Legs
      { name: 'Boot_L', shape: 'box', position: [-0.16, -0.04, 0.08], scale: [0.16, 0.30, 0.16], color: black, metallic: 0.85, roughness: 0.18, bevel: 0.02 },
      { name: 'Boot_R', shape: 'box', position: [0.16, -0.04, 0.08], scale: [0.16, 0.30, 0.16], color: black, metallic: 0.85, roughness: 0.18, bevel: 0.02 },
      { name: 'Shin_L', shape: 'cylinder', position: [-0.16, 0, 0.36], scale: [0.16, 0.16, 0.44], topRadiusRatio: 1.12, color: black, metallic: 0.82, roughness: 0.22, smooth: true },
      { name: 'Shin_R', shape: 'cylinder', position: [0.16, 0, 0.36], scale: [0.16, 0.16, 0.44], topRadiusRatio: 1.12, color: black, metallic: 0.82, roughness: 0.22, smooth: true },
      { name: 'Thigh_L', shape: 'cylinder', position: [-0.16, 0, 0.78], scale: [0.19, 0.19, 0.40], topRadiusRatio: 1.1, color: cloak, metallic: 0.15, roughness: 0.75, smooth: true },
      { name: 'Thigh_R', shape: 'cylinder', position: [0.16, 0, 0.78], scale: [0.19, 0.19, 0.40], topRadiusRatio: 1.1, color: cloak, metallic: 0.15, roughness: 0.75, smooth: true },
      // Belt & Control Boxes
      { name: 'Belt', shape: 'box', position: [0, 0, 1.02], scale: [0.48, 0.32, 0.11], color: black, metallic: 0.75, roughness: 0.25, bevel: 0.01 },
      { name: 'BeltBuckle', shape: 'box', position: [0, -0.17, 1.02], scale: [0.12, 0.04, 0.09], color: steel, metallic: 0.92, roughness: 0.24 },
      { name: 'BeltBox_L', shape: 'box', position: [-0.16, -0.17, 1.02], scale: [0.09, 0.05, 0.09], color: black, metallic: 0.8, roughness: 0.22 },
      { name: 'BeltBox_R', shape: 'box', position: [0.16, -0.17, 1.02], scale: [0.09, 0.05, 0.09], color: black, metallic: 0.8, roughness: 0.22 },
      // Torso & Chest Armor & Life Support Panel
      { name: 'Torso', shape: 'box', position: [0, 0, 1.32], scale: [0.52, 0.34, 0.50], color: cloak, metallic: 0.2, roughness: 0.7, bevel: 0.03 },
      { name: 'ChestArmor', shape: 'box', position: [0, -0.02, 1.48], scale: [0.58, 0.36, 0.20], color: black, metallic: 0.88, roughness: 0.18, bevel: 0.025 },
      { name: 'ChestPanel', shape: 'box', position: [0, -0.185, 1.36], scale: [0.22, 0.05, 0.20], color: '#1b202b', metallic: 0.85, roughness: 0.25, bevel: 0.008 },
      { name: 'LedRed', shape: 'box', position: [-0.05, -0.215, 1.40], scale: [0.05, 0.02, 0.035], color: crimson, emissionStrength: 3.0 },
      { name: 'LedBlue', shape: 'box', position: [0.05, -0.215, 1.40], scale: [0.05, 0.02, 0.035], color: '#38bdf8', emissionStrength: 2.8 },
      { name: 'LedGreen', shape: 'box', position: [0, -0.215, 1.32], scale: [0.13, 0.02, 0.03], color: '#22c55e', emissionStrength: 2.6 },
      // Flowing Dark Cape
      { name: 'Cape_Upper', shape: 'wedge', position: [0, 0.26, 1.24], rotationDeg: [0, 0, 0], scale: [0.76, 0.22, 0.66], color: cloak, metallic: 0.05, roughness: 0.88 },
      { name: 'Cape_Lower', shape: 'wedge', position: [0, 0.34, 0.52], rotationDeg: [0, 0, 0], scale: [1.02, 0.32, 0.96], color: cloak, metallic: 0.05, roughness: 0.9 },
      // Shoulders & Arms
      { name: 'Pauldron_L', shape: 'sphere', position: [-0.36, 0, 1.52], scale: [0.26, 0.26, 0.18], color: black, metallic: 0.88, roughness: 0.18, smooth: true },
      { name: 'Pauldron_R', shape: 'sphere', position: [0.36, 0, 1.52], scale: [0.26, 0.26, 0.18], color: black, metallic: 0.88, roughness: 0.18, smooth: true },
      { name: 'Arm_L', shape: 'capsule', position: [-0.40, -0.02, 1.22], rotationDeg: [8, 6, 0], scale: [0.15, 0.15, 0.56], color: cloak, metallic: 0.2, roughness: 0.72, smooth: true },
      { name: 'Arm_R', shape: 'capsule', position: [0.40, -0.08, 1.24], rotationDeg: [28, -10, 0], scale: [0.15, 0.15, 0.54], color: cloak, metallic: 0.2, roughness: 0.72, smooth: true },
      { name: 'Glove_L', shape: 'box', position: [-0.42, -0.07, 0.92], scale: [0.12, 0.13, 0.14], color: black, metallic: 0.8, roughness: 0.25, bevel: 0.015 },
      { name: 'Glove_R', shape: 'box', position: [0.44, -0.22, 1.02], scale: [0.12, 0.13, 0.14], color: black, metallic: 0.8, roughness: 0.25, bevel: 0.015 },
      // Red Lightsaber in Right Hand
      { name: 'SaberHilt', shape: 'cylinder', position: [0.48, -0.28, 1.06], rotationDeg: [22, -24, 0], scale: [0.055, 0.055, 0.26], color: steel, metallic: 0.94, roughness: 0.2, smooth: true },
      { name: 'SaberBlade', shape: 'cylinder', position: [0.68, -0.44, 1.54], rotationDeg: [22, -24, 0], scale: [0.042, 0.042, 0.96], topRadiusRatio: 0.75, color: crimson, metallic: 0.05, roughness: 0.1, emissionStrength: 4.5, smooth: true },
      // Iconic Helmet Dome, Flared Skirt, Visor & Triangular Respirator
      { name: 'HelmetDome', shape: 'sphere', position: [0, 0.01, 1.82], scale: [0.30, 0.33, 0.30], color: black, metallic: 0.94, roughness: 0.12, smooth: true },
      { name: 'HelmetSkirt', shape: 'cylinder', position: [0, 0.03, 1.72], scale: [0.42, 0.42, 0.18], topRadiusRatio: 0.68, color: black, metallic: 0.94, roughness: 0.14, smooth: true },
      { name: 'HelmetRidge', shape: 'box', position: [0, -0.02, 1.94], scale: [0.04, 0.30, 0.05], color: black, metallic: 0.95, roughness: 0.12 },
      { name: 'MaskFace', shape: 'box', position: [0, -0.13, 1.76], scale: [0.20, 0.12, 0.22], color: black, metallic: 0.9, roughness: 0.18, bevel: 0.02 },
      { name: 'EyeLens_L', shape: 'sphere', position: [-0.055, -0.185, 1.81], scale: [0.07, 0.03, 0.05], color: '#2b3242', metallic: 0.95, roughness: 0.08, smooth: true },
      { name: 'EyeLens_R', shape: 'sphere', position: [0.055, -0.185, 1.81], scale: [0.07, 0.03, 0.05], color: '#2b3242', metallic: 0.95, roughness: 0.08, smooth: true },
      { name: 'Respirator', shape: 'cone', position: [0, -0.20, 1.72], rotationDeg: [14, 0, 0], scale: [0.13, 0.13, 0.13], color: steel, metallic: 0.88, roughness: 0.26, segments: 6 },
    ];
    const recipe = validateMeshRecipe({
      schemaVersion: 1,
      name: sanitizeAssetName(input.name || 'DarthVader_Lord', 'DarthVader_Lord'),
      archetype: 'custom',
      style: 'scifi',
      dimensions: { width: 1.05, depth: 0.72, height: 2.02 },
      palette: { primary: black, secondary: steel, accent: crimson },
      parts: vaderParts,
      seed: stableSeed(prompt),
    });
    return {
      plan: {
        planner: 'playforge-nl-planner-v1',
        prompt,
        summary: `스타워즈 다스베이더 (${vaderParts.length}개 커스텀 3D 파트 · 광택 블랙 헬멧·망토·적색 라이트세이버)`,
        steps: [
          `1. 다스베이더 3D 블루프린트 구성 (${vaderParts.length}개 파트 MeshRecipe v1)`,
          `2. JSON IPC 요청서(request.json) 검증 및 격리 작업 디렉터리 준비`,
          `3. 선택된 3D 엔진(Blender / Three.js) 독립 프로세스로 메시 조립 및 PBR 적용`,
          `4. glTF 2.0 (.glb) 무결성·SHA-256 검증`,
          `5. WebGL 프리뷰 및 Web Godot 씬 좌표 (${placement.position.join(', ')}) 자동 배치`,
        ],
      },
      recipe,
      placement,
    };
  }

  // Offline armored superhero preset (e.g. Iron Man) so even offline heuristic mode never degrades to a crate
  if (!input.recipe && /아이언\s*맨|iron\s*man/i.test(prompt)) {
    const placement = extractPlacement(prompt, input.placement);
    const red = '#a8181f';
    const gold = '#e0b034';
    const dark = '#28303b';
    const cyan = '#48eaff';
    const ironManParts = [
      // Boots & Feet
      { name: 'Boot_L', shape: 'box', position: [-0.16, -0.04, 0.07], scale: [0.16, 0.30, 0.14], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.02 },
      { name: 'Boot_R', shape: 'box', position: [0.16, -0.04, 0.07], scale: [0.16, 0.30, 0.14], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.02 },
      // Shins
      { name: 'Shin_L', shape: 'cylinder', position: [-0.16, 0.0, 0.34], scale: [0.16, 0.16, 0.42], topRadiusRatio: 1.15, color: red, metallic: 0.9, roughness: 0.22, smooth: true },
      { name: 'Shin_R', shape: 'cylinder', position: [0.16, 0.0, 0.34], scale: [0.16, 0.16, 0.42], topRadiusRatio: 1.15, color: red, metallic: 0.9, roughness: 0.22, smooth: true },
      // Knee pads
      { name: 'Knee_L', shape: 'box', position: [-0.16, -0.09, 0.56], scale: [0.13, 0.08, 0.13], color: gold, metallic: 0.92, roughness: 0.2, bevel: 0.015 },
      { name: 'Knee_R', shape: 'box', position: [0.16, -0.09, 0.56], scale: [0.13, 0.08, 0.13], color: gold, metallic: 0.92, roughness: 0.2, bevel: 0.015 },
      // Thighs (gold armor)
      { name: 'Thigh_L', shape: 'cylinder', position: [-0.16, 0.0, 0.76], scale: [0.19, 0.19, 0.38], topRadiusRatio: 1.12, color: gold, metallic: 0.92, roughness: 0.22, smooth: true },
      { name: 'Thigh_R', shape: 'cylinder', position: [0.16, 0.0, 0.76], scale: [0.19, 0.19, 0.38], topRadiusRatio: 1.12, color: gold, metallic: 0.92, roughness: 0.22, smooth: true },
      // Pelvis & Waist
      { name: 'Pelvis', shape: 'box', position: [0, 0, 0.98], scale: [0.44, 0.28, 0.18], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.025 },
      { name: 'Abdomen', shape: 'cylinder', position: [0, 0, 1.16], scale: [0.38, 0.28, 0.24], topRadiusRatio: 1.18, color: red, metallic: 0.88, roughness: 0.24, smooth: true },
      { name: 'AbPlate_L', shape: 'box', position: [-0.12, -0.13, 1.16], scale: [0.12, 0.06, 0.18], color: gold, metallic: 0.92, roughness: 0.2, bevel: 0.01 },
      { name: 'AbPlate_R', shape: 'box', position: [0.12, -0.13, 1.16], scale: [0.12, 0.06, 0.18], color: gold, metallic: 0.92, roughness: 0.2, bevel: 0.01 },
      // Chest Armor & Arc Reactor
      { name: 'Chest', shape: 'box', position: [0, 0, 1.40], scale: [0.54, 0.34, 0.30], color: red, metallic: 0.92, roughness: 0.2, bevel: 0.035 },
      { name: 'ChestTrim', shape: 'box', position: [0, -0.16, 1.48], scale: [0.46, 0.06, 0.08], color: gold, metallic: 0.94, roughness: 0.18, bevel: 0.01 },
      { name: 'ArcReactorRing', shape: 'torus', position: [0, -0.18, 1.41], rotationDeg: [90, 0, 0], scale: [0.15, 0.15, 0.08], color: dark, metallic: 0.85, roughness: 0.3, smooth: true },
      { name: 'ArcReactorCore', shape: 'cylinder', position: [0, -0.185, 1.41], rotationDeg: [90, 0, 0], scale: [0.11, 0.11, 0.04], color: cyan, metallic: 0.1, roughness: 0.1, emissionStrength: 3.6, smooth: true },
      // Shoulders (Pauldrons)
      { name: 'Shoulder_L', shape: 'sphere', position: [-0.36, 0, 1.47], scale: [0.22, 0.24, 0.22], color: red, metallic: 0.92, roughness: 0.2, smooth: true },
      { name: 'Shoulder_R', shape: 'sphere', position: [0.36, 0, 1.47], scale: [0.22, 0.24, 0.22], color: red, metallic: 0.92, roughness: 0.2, smooth: true },
      // Upper Arms (gold) & Forearms (red) & Repulsor Hands
      { name: 'UpperArm_L', shape: 'capsule', position: [-0.39, 0, 1.26], rotationDeg: [0, 6, 0], scale: [0.15, 0.15, 0.34], color: gold, metallic: 0.92, roughness: 0.22, smooth: true },
      { name: 'UpperArm_R', shape: 'capsule', position: [0.39, 0, 1.26], rotationDeg: [0, -6, 0], scale: [0.15, 0.15, 0.34], color: gold, metallic: 0.92, roughness: 0.22, smooth: true },
      { name: 'Forearm_L', shape: 'cylinder', position: [-0.42, -0.04, 0.98], rotationDeg: [10, 4, 0], scale: [0.13, 0.13, 0.32], topRadiusRatio: 1.15, color: red, metallic: 0.92, roughness: 0.2, smooth: true },
      { name: 'Forearm_R', shape: 'cylinder', position: [0.42, -0.04, 0.98], rotationDeg: [10, -4, 0], scale: [0.13, 0.13, 0.32], topRadiusRatio: 1.15, color: red, metallic: 0.92, roughness: 0.2, smooth: true },
      { name: 'Hand_L', shape: 'box', position: [-0.43, -0.08, 0.80], scale: [0.11, 0.12, 0.13], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.015 },
      { name: 'Hand_R', shape: 'box', position: [0.43, -0.08, 0.80], scale: [0.11, 0.12, 0.13], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.015 },
      { name: 'Repulsor_L', shape: 'sphere', position: [-0.43, -0.14, 0.80], scale: [0.055, 0.03, 0.055], color: cyan, metallic: 0.1, roughness: 0.1, emissionStrength: 3.2, smooth: true },
      { name: 'Repulsor_R', shape: 'sphere', position: [0.43, -0.14, 0.80], scale: [0.055, 0.03, 0.055], color: cyan, metallic: 0.1, roughness: 0.1, emissionStrength: 3.2, smooth: true },
      // Neck & Helmet & Gold Faceplate & Glowing Eyes
      { name: 'Neck', shape: 'cylinder', position: [0, 0, 1.58], scale: [0.16, 0.16, 0.12], color: dark, metallic: 0.8, roughness: 0.35, smooth: true },
      { name: 'Helmet', shape: 'sphere', position: [0, 0.01, 1.73], scale: [0.26, 0.29, 0.31], color: red, metallic: 0.94, roughness: 0.18, smooth: true },
      { name: 'Faceplate', shape: 'box', position: [0, -0.115, 1.72], scale: [0.18, 0.09, 0.23], color: gold, metallic: 0.95, roughness: 0.16, bevel: 0.025 },
      { name: 'Eye_L', shape: 'box', position: [-0.048, -0.162, 1.755], rotationDeg: [0, 0, -10], scale: [0.052, 0.02, 0.02], color: cyan, metallic: 0.1, roughness: 0.1, emissionStrength: 3.8 },
      { name: 'Eye_R', shape: 'box', position: [0.048, -0.162, 1.755], rotationDeg: [0, 0, 10], scale: [0.052, 0.02, 0.02], color: cyan, metallic: 0.1, roughness: 0.1, emissionStrength: 3.8 },
      // Back thrusters
      { name: 'BackPack', shape: 'box', position: [0, 0.19, 1.40], scale: [0.32, 0.10, 0.26], color: red, metallic: 0.9, roughness: 0.22, bevel: 0.02 },
    ];
    const recipe = validateMeshRecipe({
      schemaVersion: 1,
      name: sanitizeAssetName(input.name || 'IronMan_Armor', 'IronMan_Armor'),
      archetype: 'custom',
      style: 'scifi',
      dimensions: { width: 0.96, depth: 0.48, height: 1.88 },
      palette: { primary: red, secondary: gold, accent: cyan },
      parts: ironManParts,
      seed: stableSeed(prompt),
    });
    return {
      plan: {
        planner: 'playforge-nl-planner-v1',
        prompt,
        summary: `아이언맨 아머 슈트 (${ironManParts.length}개 커스텀 3D 파트 · 레드/골드 메탈릭 + 시안 아크 리액터)`,
        steps: [
          `1. 오프라인 아머 슈트 블루프린트 매칭 (${ironManParts.length}개 파트 MeshRecipe v1)`,
          `2. JSON IPC 요청서(request.json) 검증 및 격리 작업 디렉터리 준비`,
          `3. 무수정 공식 Headless Blender 독립 프로세스로 3D 메시 조립 및 PBR 재질 적용`,
          `4. glTF 2.0 (.glb) 무결성·SHA-256 검증`,
          `5. Web Godot 씬 좌표 (${placement.position.join(', ')}) 자동 배치`,
        ],
      },
      recipe,
      placement,
    };
  }
  const archetype = input.recipe?.archetype
    ? String(input.recipe.archetype).toLowerCase()
    : detectArchetype(prompt);
  const preset = ARCHETYPE_DEFAULTS[archetype] || ARCHETYPE_DEFAULTS.crate;

  const palette = { ...preset.palette };
  const materialProfile = {
    primary: { ...preset.materialProfile.primary },
    secondary: { ...preset.materialProfile.secondary },
    accent: { ...preset.materialProfile.accent },
  };

  // Apply color cues
  const colors = extractColors(prompt);
  if (colors.length >= 1) {
    if (/장식|테두리|트림|trim|gold|황금/i.test(prompt) && archetype === 'chest') {
      palette.secondary = colors[0];
      if (colors[1]) palette.accent = colors[1];
    } else if (archetype === 'crystal' || archetype === 'lantern') {
      palette.accent = colors[0];
      palette.primary = colors[0];
    } else {
      palette.primary = colors[0];
      if (colors[1]) palette.secondary = colors[1];
      if (colors[2]) palette.accent = colors[2];
    }
  }

  // Apply material cues
  if (/금속|강철|철|메탈|metal|steel|iron/i.test(prompt)) {
    materialProfile.primary.metallic = 0.88;
    materialProfile.primary.roughness = 0.28;
  } else if (/나무|목재|wood/i.test(prompt)) {
    materialProfile.primary.metallic = 0.04;
    materialProfile.primary.roughness = 0.76;
  } else if (/돌|석재|stone/i.test(prompt)) {
    materialProfile.primary.metallic = 0.02;
    materialProfile.primary.roughness = 0.88;
  } else if (/크리스탈|유리|수정|crystal|glass/i.test(prompt)) {
    materialProfile.primary.metallic = 0.14;
    materialProfile.primary.roughness = 0.14;
    materialProfile.accent.emissionStrength = Math.max(materialProfile.accent.emissionStrength, 1.8);
  }

  // Style & detail cues
  let style = 'stylized';
  if (/로우폴리|low\s*poly|lowpoly/i.test(prompt)) style = 'lowpoly';
  else if (/사이버|sf|sci-?fi|미래|네온/i.test(prompt)) style = 'scifi';
  else if (/판타지|마법|fantasy|magic/i.test(prompt)) style = 'fantasy';
  else if (/중세|medieval/i.test(prompt)) style = 'medieval';

  let detailLevel = 'medium';
  if (/로우폴리|단순|심플|low\s*poly|simple/i.test(prompt)) detailLevel = 'low';
  else if (/고해상도|디테일|정교|하이폴리|high\s*detail|detailed/i.test(prompt)) detailLevel = 'high';

  const variants = {
    snowy: /눈\s*덮|눈|설원|겨울|snow/i.test(prompt),
    glowing: /빛나는|발광|네온|마법|glow|emissive|neon|magic/i.test(prompt),
    pine: /소나무|전나무|침엽|pine|spruce|fir/i.test(prompt),
    spiky: /가시|뾰족|spik/i.test(prompt),
    openLid: /열린|open/i.test(prompt),
  };

  if (variants.glowing) {
    materialProfile.accent.emissionStrength = Math.max(materialProfile.accent.emissionStrength, 2.2);
  }

  const dimensions = extractDimensions(prompt, preset.dimensions);
  const seed = Number.isInteger(input.seed) ? input.seed : stableSeed(prompt);
  const defaultName = sanitizeAssetName(
    input.name || `${preset.namePrefix}_${String(seed).slice(0, 4)}`,
    preset.namePrefix
  );

  // Merge user/LLM structured recipe overrides safely
  const merged = {
    schemaVersion: 1,
    name: defaultName,
    archetype,
    style,
    dimensions,
    palette,
    materialProfile,
    detailLevel,
    seed,
    variants,
    parts: [],
    ...(input.recipe && typeof input.recipe === 'object' ? input.recipe : {}),
  };

  if (input.recipe?.dimensions) {
    merged.dimensions = { ...dimensions, ...input.recipe.dimensions };
  }
  if (input.recipe?.palette) {
    merged.palette = { ...palette, ...input.recipe.palette };
  }
  if (input.recipe?.variants) {
    merged.variants = { ...variants, ...input.recipe.variants };
  }

  const recipe = validateMeshRecipe(merged);
  const placement = extractPlacement(prompt, input.placement);

  const plan = {
    planner: input.recipe ? 'structured-recipe+validator' : 'playforge-nl-planner-v1',
    prompt,
    summary: `${preset.label}(${recipe.archetype}) · ${recipe.style} · ${recipe.dimensions.width}×${recipe.dimensions.depth}×${recipe.dimensions.height}m`,
    steps: [
      `1. 자연어 의도 분석 → 아키타입 '${recipe.archetype}' (${preset.label}) 및 PBR 재질 팔레트 결정`,
      `2. JSON IPC 요청서(request.json) 검증 및 격리 작업 디렉터리 준비`,
      `3. 무수정 공식 Headless Blender 독립 프로세스로 절차적 메시 조립 및 원점 정규화(Bottom-Center, Y-Up)`,
      `4. glTF 2.0 (.glb) 바이너리 무결성·SHA-256 검증 및 아티팩트 등록`,
      `5. Web Godot 에디터(playforge_blender)로 즉시 GLB 임포트 및 씬 좌표 (${placement.position.join(', ')}) 자동 배치`,
    ],
  };

  return { plan, recipe, placement };
}

module.exports = {
  ARCHETYPE_DEFAULTS,
  planFromPrompt,
};
