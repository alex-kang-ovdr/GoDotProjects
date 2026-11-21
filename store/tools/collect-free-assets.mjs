#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCollectedPackageFiles,
  buildPlayforgePackage
} from '../server/package-builder.mjs';
import { SAMPLE_CATALOG, validateReleaseContract } from '../web/store-catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(STORE_ROOT, '..');
const OUT_FILE = path.join(STORE_ROOT, 'data', 'collected-catalog.json');
const UA = { 'User-Agent': 'PlayForge-AssetStore-Collector/1.0 (+https://playhub.local)' };

// Strictly permissive, commercial-safe, zero-copyleft licenses only
const ALLOWED_GODOT_LICENSES = new Map([
  ['CC0', { spdx: 'CC0-1.0', ref: 'lic-cc0-1.0-universal' }],
  ['MIT', { spdx: 'MIT', ref: 'lic-mit-permissive' }],
  ['Unlicense', { spdx: 'Unlicense', ref: 'lic-unlicense-public-domain' }],
  ['BSD 3-clause', { spdx: 'BSD-3-Clause', ref: 'lic-bsd-3-clause' }],
  ['BSD-3-Clause', { spdx: 'BSD-3-Clause', ref: 'lic-bsd-3-clause' }],
  ['Zlib', { spdx: 'Zlib', ref: 'lic-zlib-permissive' }],
  ['Apache-2.0', { spdx: 'Apache-2.0', ref: 'lic-apache-2.0' }],
]);

// English -> Korean bilingual tag mapping for clean Korean search & discovery
const TAG_KO_MAP = {
  wood: '목재', stone: '석재', metal: '금속', brick: '벽돌', concrete: '콘크리트',
  fabric: '패브릭', cloth: '천', leather: '가죽', ground: '지형', dirt: '흙',
  grass: '잔디', sand: '모래', snow: '눈', rock: '바위', water: '물',
  nature: '자연', forest: '숲', tree: '나무', plant: '식물', foliage: '식생',
  furniture: '가구', chair: '의자', table: '테이블', props: '소품', indoor: '실내',
  outdoor: '실외', studio: '스튜디오', night: '야간', sunset: '노을', sunrise: '일출',
  sky: '하늘', urban: '도시', city: '도시', architecture: '건축', building: '건물',
  industrial: '산업', sci_fi: 'SF', scifi: 'SF', fantasy: '판타지', medieval: '중세',
  rpg: 'RPG', dungeon: '던전', character: '캐릭터', weapon: '무기', shield: '방패',
  skeleton: '스켈레톤', robot: '로봇', food: '음식', lighting: '조명', lamp: '조명',
  tile: '타일', floor: '바닥', wall: '벽면', roof: '지붕', plaster: '석고',
  rust: '녹', moss: '이끼', road: '도로', asphalt: '아스팔트', terrain: '터레인',
  shader: '셰이더', vfx: '이펙트', particle: '파티클', ui: 'UI', hud: 'HUD',
  audio: '오디오', sfx: '효과음', sound: '사운드', music: '음악', animation: '애니메이션',
  camera: '카메라', physics: '물리', multiplayer: '멀티플레이', networking: '네트워크',
  ai: 'AI', dialogue: '다이얼로그', inventory: '인벤토리', save: '세이브',
  tilemap: '타일맵', sprite: '스프라이트', pixel: '픽셀아트', voxel: '복셀',
  plugin: '플러그인', editor: '에디터', tool: '도구', script: '스크립트',
  '2d': '2D', '3d': '3D', pbr: 'PBR', hdri: 'HDRI', gltf: 'GLTF', glb: 'GLB',
};

const POLYHAVEN_CAT_KO = {
  furniture: '가구', props: '소품', nature: '자연', architecture: '건축',
  food: '음식', electronics: '전자기기', lighting: '조명', industrial: '산업',
  decor: '장식', tools: '도구', containers: '컨테이너', seating: '좌석',
  tables: '테이블', vegetation: '식생', rocks: '암석', wood: '목재',
  metal: '금속', stone: '석재', brick: '벽돌', concrete: '콘크리트',
  fabric: '패브릭', terrain: '지형', ground: '지면', plaster: '석고',
  roofing: '지붕', tiles: '타일', floor: '바닥', wall: '벽면',
  outdoor: '실외', indoor: '실내', studio: '스튜디오', night: '야간',
  skies: '하늘', urban: '도시', sunrise: '일출', sunset: '노을',
  'clear': '맑음', overcast: '흐림', 'partly cloudy': '구름 조금',
};

const usedSlugs = new Set(SAMPLE_CATALOG.map((item) => item.asset_id));

function slugify(raw, prefix = '') {
  let base = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base || !/^[a-z]/.test(base)) base = `a-${base || 'asset'}`;
  if (prefix) {
    base = `${prefix}-${base}`;
  }
  base = base.slice(0, 56).replace(/-+$/g, '');
  if (base.length < 3) base = `${base}-pack`;
  let candidate = base;
  let n = 2;
  while (usedSlugs.has(candidate)) {
    const suffix = `-${n++}`;
    candidate = `${base.slice(0, 62 - suffix.length).replace(/-+$/g, '')}${suffix}`;
  }
  usedSlugs.add(candidate);
  return candidate;
}

function normalizeSemver(raw) {
  const cleaned = String(raw || '').trim().replace(/^v/i, '');
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(cleaned);
  if (!m) return '1.0.0';
  return `${Number(m[1])}.${Number(m[2] || 0)}.${Number(m[3] || 0)}`;
}

function makeShortId(prefix, slug, version) {
  const verCompact = version.replace(/[^0-9]/g, '').slice(0, 6) || '100';
  const body = `${slug.slice(0, 50)}-${verCompact}`.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}-${body}`.slice(0, 64).replace(/-+$/g, '');
}

function enrichTags(rawTags = [], extra = []) {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const val = String(t || '').trim();
    if (!val || val.length > 32) return;
    const key = val.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(val);
  };
  for (const t of [...extra, ...rawTags]) {
    const normalized = String(t || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!normalized) continue;
    add(t);
    const ko = TAG_KO_MAP[normalized] || TAG_KO_MAP[normalized.replace(/-/g, '_')];
    if (ko) add(ko);
  }
  return out.slice(0, 12);
}

function finalizePackageEntry(draft) {
  const prepared = {
    ...draft,
    title: draft.title.slice(0, 120),
    summary: draft.summary.slice(0, 500),
    publisher_id: draft.publisher_id.slice(0, 64),
    engine_compatibility: draft.engine_compatibility || {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux', 'macos'],
    },
  };
  const builtFiles = buildCollectedPackageFiles(prepared, REPO_ROOT);
  const built = buildPlayforgePackage(prepared, builtFiles);
  const entry = {
    schema_version: 1,
    asset_id: prepared.asset_id,
    asset_version_id: prepared.asset_version_id,
    release_id: prepared.release_id,
    release_kind: 'package',
    category: prepared.category,
    tags: prepared.tags,
    title: prepared.title,
    summary: prepared.summary,
    publisher_id: prepared.publisher_id,
    author: prepared.author,
    license: prepared.license,
    source_provider: prepared.source_provider,
    source_url: prepared.source_url,
    download_url: prepared.download_url,
    thumbnail_url: prepared.thumbnail_url || '',
    store_state: 'catalog_listed',
    artifact_id: prepared.artifact_id,
    artifact_digest: built.artifactDigest,
    dependency_manifest_hash: built.dependencyManifestHash,
    engine_compatibility: prepared.engine_compatibility,
    file_manifest: built.fileManifest,
    license_snapshot_ref: prepared.license_snapshot_ref,
    installation_record: null,
    ...(prepared.local_bundle_files ? { local_bundle_files: prepared.local_bundle_files } : {}),
  };
  const errors = validateReleaseContract(entry);
  if (errors.length > 0) {
    throw new Error(`Contract validation failed for ${entry.asset_id}: ${errors.join(', ')}`);
  }
  return entry;
}

function collectLocalVerifiedGlbPacks() {
  const avatarBase = 'forge/Godot/addons/playforge_avatar/assets';
  const defs = [
    {
      asset_id: 'kaykit-adventurers-cc0',
      title: 'KayKit Adventurers 3D 캐릭터 팩 (CC0 GLB 5종)',
      category: '3D 모델 · 캐릭터/장비',
      tags: ['3D', 'GLB', '캐릭터', '모험가', '판타지', 'RPG', 'CC0', 'KayKit', '로우폴리'],
      summary: 'Kay Lousberg의 CC0 1.0 퍼블릭 도메인 모험가 3D 캐릭터 GLB 5종(기사·마법사·도적·후드 도적·야만전사) 실제 바이너리 번들입니다. Godot 4.7.2 프로젝트에 즉시 가져와 캐릭터·NPC로 사용할 수 있습니다.',
      author: 'Kay Lousberg (KayKit)',
      publisher_id: 'pub-kaykit-cc0',
      source_provider: 'KayKit (PlayForge Local CC0)',
      source_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
      download_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
      files: ['skins/Knight.glb', 'skins/Mage.glb', 'skins/Rogue.glb', 'skins/Rogue_Hooded.glb', 'skins/Barbarian.glb'],
    },
    {
      asset_id: 'kaykit-skeletons-cc0',
      title: 'KayKit Skeletons 3D 몬스터 팩 (CC0 GLB 4종)',
      category: '3D 모델 · 캐릭터/장비',
      tags: ['3D', 'GLB', '몬스터', '스켈레톤', '던전', '판타지', 'RPG', 'CC0', 'KayKit'],
      summary: 'KayKit CC0 1.0 스켈레톤 3D 몬스터 GLB 4종(전사·마법사·도적·미니언) 실제 바이너리 패키지입니다. 던전 크롤러·디펜스·RPG 적 캐릭터로 상업적 제약 없이 바로 적용 가능합니다.',
      author: 'Kay Lousberg (KayKit)',
      publisher_id: 'pub-kaykit-cc0',
      source_provider: 'KayKit (PlayForge Local CC0)',
      source_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
      download_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
      files: ['skins/Skeleton_Warrior.glb', 'skins/Skeleton_Mage.glb', 'skins/Skeleton_Rogue.glb', 'skins/Skeleton_Minion.glb'],
    },
    {
      asset_id: 'kaykit-rpg-weapons-cc0',
      title: 'KayKit RPG 무기·방패·장비 3D 팩 (CC0 GLB 17종)',
      category: '3D 모델 · 캐릭터/장비',
      tags: ['3D', 'GLB', '무기', '방패', '장비', '판타지', 'RPG', 'CC0', 'KayKit'],
      summary: '검, 도끼, 단검, 석궁, 지팡이, 완드, 마법서, 화살통, 방패 4종, 연막탄 등 KayKit CC0 1.0 RPG 장비 3D GLB 17종 실제 번들입니다. 캐릭터 본 소켓 부착 및 아이템 드롭 소품으로 바로 활용하세요.',
      author: 'Kay Lousberg (KayKit)',
      publisher_id: 'pub-kaykit-cc0',
      source_provider: 'KayKit (PlayForge Local CC0)',
      source_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
      download_url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
      files: [
        'accessories/sword_1handed.glb', 'accessories/sword_2handed_color.glb',
        'accessories/axe_1handed.glb', 'accessories/axe_2handed.glb',
        'accessories/dagger.glb', 'accessories/crossbow_1handed.glb',
        'accessories/staff.glb', 'accessories/wand.glb',
        'accessories/spellbook_open.glb', 'accessories/quiver.glb',
        'accessories/arrow_bundle.glb', 'accessories/shield_badge_color.glb',
        'accessories/shield_round_color.glb', 'accessories/shield_spikes_color.glb',
        'accessories/shield_square_color.glb', 'accessories/smokebomb.glb',
        'accessories/mug_full.glb',
      ],
    },
    {
      asset_id: 'quaternius-robot-cc0',
      title: 'Quaternius RobotExpressive SF 3D 캐릭터 (CC0 GLB)',
      category: '3D 모델 · 캐릭터/장비',
      tags: ['3D', 'GLB', '로봇', 'SF', '애니메이션', '캐릭터', 'CC0', 'Quaternius'],
      summary: 'Tomás Laulhé(Quaternius) 제작 CC0 1.0 애니메이션 내장 SF 로봇 3D 캐릭터(RobotExpressive.glb) 실제 바이너리 패키지입니다. 대기·걷기·달리기·점프·감정 표현 애니메이션 테스트 및 SF 게임 주인공으로 적합합니다.',
      author: 'Tomás Laulhé (Quaternius)',
      publisher_id: 'pub-quaternius-cc0',
      source_provider: 'Quaternius (PlayForge Local CC0)',
      source_url: 'https://github.com/mrdoob/three.js/tree/master/examples/models/gltf/RobotExpressive',
      download_url: 'https://github.com/mrdoob/three.js/tree/master/examples/models/gltf/RobotExpressive',
      files: ['skins/RobotExpressive.glb'],
    },
    {
      asset_id: 'playforge-starter-headgear-cc0',
      title: 'PlayForge 스타터 투구·코스메틱 3D 팩 (CC0 GLB 3종)',
      category: '3D 모델 · 캐릭터/장비',
      tags: ['3D', 'GLB', '장신구', '코스메틱', '왕관', '바이저', '헤일로', 'CC0'],
      summary: '황금 왕관(crown_gold.glb), 사이버 바이저(visor_cyber.glb), 스타 헤일로(halo_star.glb)로 구성된 PlayForge CC0 1.0 스타터 코스메틱 3D GLB 번들입니다.',
      author: 'PlayForge Core',
      publisher_id: 'pub-playforge-core',
      source_provider: 'PlayForge Local CC0',
      source_url: 'https://playhub.local/store',
      download_url: 'https://playhub.local/store',
      files: ['accessories/crown_gold.glb', 'accessories/visor_cyber.glb', 'accessories/halo_star.glb'],
    },
  ];

  const entries = [];
  for (const d of defs) {
    const existingFiles = d.files.filter((rel) => fs.existsSync(path.join(REPO_ROOT, avatarBase, rel)));
    if (existingFiles.length === 0) continue;
    usedSlugs.add(d.asset_id);
    const local_bundle_files = existingFiles.map((rel) => ({
      path: `assets/${d.asset_id}/${path.basename(rel)}`,
      repo_rel_path: `${avatarBase}/${rel}`,
      executable_addon: false,
    }));
    entries.push(finalizePackageEntry({
      asset_id: d.asset_id,
      asset_version_id: '1.0.0',
      release_id: makeShortId('rel', d.asset_id, '1.0.0'),
      artifact_id: makeShortId('art', d.asset_id, '1.0.0'),
      release_kind: 'package',
      category: d.category,
      tags: d.tags,
      title: d.title,
      summary: d.summary,
      publisher_id: d.publisher_id,
      author: d.author,
      license: 'CC0-1.0',
      license_snapshot_ref: 'lic-cc0-1.0-universal',
      source_provider: d.source_provider,
      source_url: d.source_url,
      download_url: d.download_url,
      thumbnail_url: '',
      local_bundle_files,
    }));
  }
  return entries;
}

async function collectPolyHavenAssets() {
  const configs = [
    {
      type: 'models',
      prefix: 'ph-model',
      category: '3D 모델 · 환경/소품',
      extraTags: ['3D', 'PBR', 'GLTF', 'CC0', 'PolyHaven'],
      formatSummary: (id, item, catsKo) => {
        const poly = item.polycount ? `약 ${Number(item.polycount).toLocaleString()} 폴리곤` : '고품질 PBR 메시';
        const author = Object.keys(item.authors || {}).slice(0, 2).join(', ') || 'Poly Haven';
        const theme = catsKo.length ? `[${catsKo.join(' · ')}] ` : '';
        return `${theme}Poly Haven 공식 CC0 1.0 3D PBR 모델(${poly}, 제작: ${author})입니다. GLTF/GLB 및 PBR 텍스처를 상업적 게임 환경·소품으로 자유롭게 활용할 수 있습니다.`;
      },
    },
    {
      type: 'textures',
      prefix: 'ph-tex',
      category: 'PBR 텍스처 · 머티리얼',
      extraTags: ['PBR', '텍스처', '머티리얼', 'CC0', 'PolyHaven'],
      formatSummary: (id, item, catsKo) => {
        const res = Array.isArray(item.max_resolution) ? `최대 ${item.max_resolution[0]}×${item.max_resolution[1]}` : '고해상도';
        const author = Object.keys(item.authors || {}).slice(0, 2).join(', ') || 'Poly Haven';
        const theme = catsKo.length ? `[${catsKo.join(' · ')}] ` : '';
        return `${theme}Poly Haven 공식 CC0 1.0 심리스 PBR 텍스처(${res}, Albedo·Normal·Roughness·AO, 제작: ${author})입니다. Godot StandardMaterial3D에 바로 적용할 수 있습니다.`;
      },
    },
    {
      type: 'hdris',
      prefix: 'ph-hdri',
      category: 'HDRI · 스카이박스/조명',
      extraTags: ['HDRI', '스카이박스', '조명', '3D', 'CC0', 'PolyHaven'],
      formatSummary: (id, item, catsKo) => {
        const res = Array.isArray(item.max_resolution) ? `최대 ${item.max_resolution[0]}×${item.max_resolution[1]}` : '360° 파노라마';
        const author = Object.keys(item.authors || {}).slice(0, 2).join(', ') || 'Poly Haven';
        const theme = catsKo.length ? `[${catsKo.join(' · ')}] ` : '';
        return `${theme}Poly Haven 공식 CC0 1.0 360° HDRI 환경광·스카이박스(${res}, 제작: ${author})입니다. Godot WorldEnvironment PanoramaSkyMaterial에 즉시 연결해 사실적 조명을 구현할 수 있습니다.`;
      },
    },
  ];

  const collected = [];
  for (const cfg of configs) {
    console.log(`Fetching Poly Haven CC0 ${cfg.type}...`);
    const res = await fetch(`https://api.polyhaven.com/assets?t=${cfg.type}`, { headers: UA });
    if (!res.ok) throw new Error(`Poly Haven ${cfg.type} HTTP ${res.status}`);
    const data = await res.json();
    const sorted = Object.entries(data).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0));
    console.log(` -> ${sorted.length} CC0 ${cfg.type} found`);

    for (const [rawId, item] of sorted) {
      const slug = slugify(rawId, cfg.prefix);
      const cats = Array.isArray(item.categories) ? item.categories : [];
      const catsKo = [...new Set(cats.map((c) => POLYHAVEN_CAT_KO[String(c).toLowerCase()]).filter(Boolean))];
      const tags = enrichTags([...(item.tags || []), ...cats], cfg.extraTags);
      const author = Object.keys(item.authors || {}).join(', ') || 'Poly Haven';
      const title = String(item.name || rawId).trim();
      const sourceUrl = `https://polyhaven.com/a/${encodeURIComponent(rawId)}`;
      const downloadUrl = `https://api.polyhaven.com/files/${encodeURIComponent(rawId)}`;
      const version = '1.0.0';

      collected.push(finalizePackageEntry({
        asset_id: slug,
        asset_version_id: version,
        release_id: makeShortId('rel', slug, version),
        artifact_id: makeShortId('art', slug, version),
        release_kind: 'package',
        category: cfg.category,
        tags,
        title,
        summary: cfg.formatSummary(rawId, item, catsKo),
        publisher_id: 'pub-polyhaven-cc0',
        author,
        license: 'CC0-1.0',
        license_snapshot_ref: 'lic-cc0-1.0-universal',
        source_provider: 'Poly Haven (CC0)',
        source_url: sourceUrl,
        download_url: downloadUrl,
        thumbnail_url: item.thumbnail_url || '',
      }));
    }
  }
  return collected;
}

function classifyGodotAsset(item) {
  const rawCat = String(item.category || '').trim();
  const titleLower = String(item.title || '').toLowerCase();
  if (/(audio|sound|sfx|music|synth|fmod|wwise|mixer|voice)/.test(titleLower)) {
    return { category: '오디오 · 효과음', tags: ['오디오', '사운드', 'Godot4', '플러그인'] };
  }
  if (/(hud|ui|theme|menu|button|dialog|dialogue|gui|font|icon|minimap|tooltip)/.test(titleLower) && rawCat !== 'Shaders') {
    return { category: 'UI · 테마 · Addon', tags: ['UI', 'HUD', '테마', 'Godot4', '플러그인'] };
  }
  switch (rawCat) {
    case '2D Tools':
      return { category: 'Godot 애드온 · 2D 도구', tags: ['2D', '도구', 'Godot4', '플러그인'] };
    case '3D Tools':
      return { category: 'Godot 애드온 · 3D 도구', tags: ['3D', '도구', 'Godot4', '플러그인'] };
    case 'Shaders':
      return { category: 'Godot 애드온 · 셰이더/VFX', tags: ['셰이더', 'VFX', '렌더링', 'Godot4'] };
    case 'Materials':
      return { category: 'PBR 텍스처 · 머티리얼', tags: ['머티리얼', 'PBR', '3D', 'Godot4'] };
    case 'Scripts':
      return { category: 'Godot 애드온 · 스크립트/시스템', tags: ['스크립트', 'GDScript', '시스템', 'Godot4'] };
    case 'Tools':
    case 'Templates':
    case 'Misc':
    default:
      return { category: 'Godot 애드온 · 에디터/개발 도구', tags: ['에디터', '도구', '생산성', 'Godot4', '플러그인'] };
  }
}

function extractTitleTags(title) {
  const lower = String(title || '').toLowerCase();
  const extra = [];
  for (const [k, ko] of Object.entries(TAG_KO_MAP)) {
    if (k.length >= 3 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      extra.push(k, ko);
    }
  }
  return extra;
}

async function collectGodotAssetLibrary() {
  console.log('Fetching Godot Official Asset Library (Godot 4.3+, permissive licenses only)...');
  const first = await (await fetch('https://godotengine.org/asset-library/api/asset?godot_version=4.3&max_results=100&page=0', { headers: UA })).json();
  const totalPages = Math.min(Number(first.pages || 1), 25);
  const allRaw = [...(first.result || [])];

  // Fetch remaining pages in polite batches of 5
  const pageNums = [];
  for (let p = 1; p < totalPages; p += 1) pageNums.push(p);
  for (let i = 0; i < pageNums.length; i += 5) {
    const batch = pageNums.slice(i, i + 5);
    const pages = await Promise.all(batch.map(async (p) => {
      const r = await fetch(`https://godotengine.org/asset-library/api/asset?godot_version=4.3&max_results=100&page=${p}`, { headers: UA });
      if (!r.ok) return [];
      const j = await r.json();
      return j.result || [];
    }));
    for (const list of pages) allRaw.push(...list);
  }
  console.log(` -> ${allRaw.length} raw Godot 4.x AssetLib items fetched across ${totalPages} pages`);

  const seenAssetIds = new Set();
  const collected = [];
  let rejectedLicense = 0;

  for (const item of allRaw) {
    if (!item?.asset_id || seenAssetIds.has(item.asset_id)) continue;
    seenAssetIds.add(item.asset_id);

    const licInfo = ALLOWED_GODOT_LICENSES.get(String(item.cost || '').trim());
    if (!licInfo) {
      rejectedLicense += 1;
      continue;
    }

    const title = String(item.title || `Godot Asset ${item.asset_id}`).trim();
    const author = String(item.author || 'Godot Community').trim();
    const version = normalizeSemver(item.version_string || item.version || '1.0.0');
    const slug = slugify(`${title}-${item.asset_id}`, 'gd');
    const { category, tags: baseTags } = classifyGodotAsset(item);
    const tags = enrichTags([...extractTitleTags(title), licInfo.spdx], baseTags);
    const godotVer = String(item.godot_version || '4.3');
    const sourceUrl = `https://godotengine.org/asset-library/asset/${encodeURIComponent(item.asset_id)}`;
    const summary = `Godot 공식 Asset Library 등재 ${licInfo.spdx} 라이선스 ${category} 패키지(제작: ${author}, 대상 Godot ${godotVer}+, v${version})입니다. 상업·비상업 PlayForge 프로젝트에서 자유롭게 활용할 수 있습니다.`;

    collected.push(finalizePackageEntry({
      asset_id: slug,
      asset_version_id: version,
      release_id: makeShortId('rel', slug, version),
      artifact_id: makeShortId('art', slug, version),
      release_kind: 'package',
      category,
      tags,
      title,
      summary,
      publisher_id: `pub-gd-${String(item.author_id || 'community').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'comm'}`,
      author,
      license: licInfo.spdx,
      license_snapshot_ref: licInfo.ref,
      source_provider: 'Godot Asset Library',
      source_url: sourceUrl,
      download_url: sourceUrl,
      thumbnail_url: typeof item.icon_url === 'string' && /^https?:\/\//i.test(item.icon_url) ? item.icon_url : '',
    }));
  }
  console.log(` -> ${collected.length} permissive-licensed Godot assets accepted (${rejectedLicense} GPL/copyleft/proprietary/CC-BY rejected)`);
  return collected;
}

async function main() {
  const started = Date.now();
  const localPacks = collectLocalVerifiedGlbPacks();
  const [polyHaven, godotLib] = await Promise.all([
    collectPolyHavenAssets(),
    collectGodotAssetLibrary(),
  ]);

  const items = [...localPacks, ...polyHaven, ...godotLib];

  const byCategory = {};
  const byLicense = {};
  const bySource = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byLicense[item.license] = (byLicense[item.license] || 0) + 1;
    bySource[item.source_provider] = (bySource[item.source_provider] || 0) + 1;
  }

  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    total: items.length,
    license_policy: 'Permissive commercial-safe only (CC0-1.0, MIT, Unlicense, BSD-3-Clause, Zlib, Apache-2.0). Zero GPL/LGPL/MPL/CC-BY-SA/Proprietary.',
    stats: { byCategory, byLicense, bySource },
    items,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const mb = (fs.statSync(OUT_FILE).size / (1024 * 1024)).toFixed(2);
  console.log(`\n=== COLLECTION COMPLETE in ${((Date.now() - started) / 1000).toFixed(1)}s ===`);
  console.log(`Saved ${items.length} license-verified packages to ${OUT_FILE} (${mb} MB)`);
  console.log('By Source:', bySource);
  console.log('By License:', byLicense);
  console.log('By Category:', byCategory);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
