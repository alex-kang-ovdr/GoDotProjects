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

function resolveLicenseTier(spdx) {
  const lic = String(spdx || '').trim();
  if (lic === 'CC0-1.0' || lic === 'Unlicense') return 'tier1_cc0';
  if (lic === 'OFL-1.1') return 'tier2b_ofl_font';
  if (lic === 'Custom-No-Redist') return 'tier4_external_only';
  return 'tier2_attribution';
}

function buildAttributionText({ title, author, license, source_url, ai_disclosure }) {
  const ai = ai_disclosure || 'No generative AI used';
  return `Asset uses ${title} by ${author} under ${license} (${source_url}); see Third-Party Notices.txt file in package for details. (AI Disclosure: ${ai})`;
}

function finalizePackageEntry(draft) {
  const aiDisclosure = draft.ai_disclosure || 'No generative AI used';
  const licenseTier = draft.license_tier || resolveLicenseTier(draft.license);
  const externalDownloadUrl = draft.external_download_url || draft.download_url || draft.source_url || '';
  const attributionText = draft.attribution_text || buildAttributionText({
    title: draft.title.slice(0, 120),
    author: draft.author || draft.publisher_id || 'Community',
    license: draft.license || 'CC0-1.0',
    source_url: draft.source_url || externalDownloadUrl,
    ai_disclosure: aiDisclosure
  });
  const prepared = {
    ...draft,
    title: draft.title.slice(0, 120),
    summary: draft.summary.slice(0, 500),
    publisher_id: draft.publisher_id.slice(0, 64),
    license_tier: licenseTier,
    hosting_policy: draft.hosting_policy || 'direct_or_external',
    ai_disclosure: aiDisclosure,
    attribution_text: attributionText,
    external_download_url: externalDownloadUrl,
    formats: Array.isArray(draft.formats) ? draft.formats : [],
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
    formats: prepared.formats,
    title: prepared.title,
    summary: prepared.summary,
    publisher_id: prepared.publisher_id,
    author: prepared.author,
    license: prepared.license,
    license_tier: prepared.license_tier,
    hosting_policy: prepared.hosting_policy,
    ai_disclosure: prepared.ai_disclosure,
    attribution_text: prepared.attribution_text,
    source_provider: prepared.source_provider,
    source_url: prepared.source_url,
    download_url: prepared.download_url,
    external_download_url: prepared.external_download_url,
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

function finalizeExternalDirectoryEntry(draft) {
  const version = draft.asset_version_id || '1.0.0';
  const entry = {
    schema_version: 1,
    asset_id: draft.asset_id,
    asset_version_id: version,
    release_id: makeShortId('rel', draft.asset_id, version),
    release_kind: 'editorial',
    category: draft.category || '외부 추천 리소스 (직접 호스팅 금지)',
    tags: draft.tags || ['외부링크', 'Tier4'],
    formats: Array.isArray(draft.formats) ? draft.formats : [],
    title: draft.title.slice(0, 120),
    summary: draft.summary.slice(0, 500),
    publisher_id: draft.publisher_id || 'pub-external-directory',
    author: draft.author || 'External Publisher',
    license: draft.license || 'Custom-No-Redist',
    license_tier: 'tier4_external_only',
    hosting_policy: 'external_link_only',
    ai_disclosure: draft.ai_disclosure || 'See official license page',
    attribution_text: `External resource: ${draft.title} by ${draft.author} — direct redistribution prohibited; download from official source (${draft.source_url}).`,
    source_provider: draft.source_provider || 'External Resource Directory',
    source_url: draft.source_url,
    external_download_url: draft.source_url,
    thumbnail_url: '',
    store_state: 'catalog_listed',
    license_snapshot_ref: 'lic-tier4-external-link-only',
    installation_record: null,
    article_body: draft.article_body || [
      `1. 라이선스 정책: 본 리소스는 게임 개발 내 활용은 무료이나 원파일 재배포·재패키징이 금지된 커스텀 라이선스(Tier 4)입니다.`,
      `2. PlayForge Store 서버에는 파일을 직접 호스팅하지 않으며, 공식 배포처(${draft.source_url})로 직접 이동하여 약관 확인 후 다운로드해야 합니다.`,
      `3. 내려받은 파일은 로컬 Godot 프로젝트에 직접 배치해 사용하세요.`
    ]
  };
  const errors = validateReleaseContract(entry);
  if (errors.length > 0) {
    throw new Error(`External directory contract validation failed for ${entry.asset_id}: ${errors.join(', ')}`);
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

async function collectAmbientCGAssets() {
  console.log('Fetching ambientCG CC0 v2 API...');
  const LIMIT = 250;
  const firstRes = await fetch(`https://ambientcg.com/api/v2/full_json?limit=${LIMIT}&offset=0&include=tagData,imageData,downloadData`, { headers: UA });
  if (!firstRes.ok) throw new Error(`ambientCG HTTP ${firstRes.status}`);
  const firstJson = await firstRes.json();
  const total = Number(firstJson.numberOfResults || 0);
  const allRaw = [...(firstJson.foundAssets || [])];
  const offsets = [];
  for (let off = LIMIT; off < total; off += LIMIT) offsets.push(off);

  for (let i = 0; i < offsets.length; i += 4) {
    const batch = offsets.slice(i, i + 4);
    const pages = await Promise.all(batch.map(async (off) => {
      const r = await fetch(`https://ambientcg.com/api/v2/full_json?limit=${LIMIT}&offset=${off}&include=tagData,imageData,downloadData`, { headers: UA });
      if (!r.ok) return [];
      const j = await r.json();
      return j.foundAssets || [];
    }));
    for (const p of pages) allRaw.push(...p);
  }
  console.log(` -> ${allRaw.length} CC0 ambientCG assets fetched (API total ${total})`);

  const collected = [];
  const seenIds = new Set();
  for (const item of allRaw) {
    const rawId = String(item?.assetId || '').trim();
    if (!rawId || seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const dataType = String(item.dataType || 'Material');
    let category = 'PBR 텍스처 · 머티리얼';
    let extraTags = ['PBR', '텍스처', '머티리얼', 'CC0', 'ambientCG', 'no-ai'];
    let formats = ['PNG', 'JPG'];
    if (dataType === 'HDRI') {
      category = 'HDRI · 스카이박스/조명';
      extraTags = ['HDRI', '스카이박스', '조명', '3D', 'CC0', 'ambientCG', 'no-ai'];
      formats = ['EXR', 'HDR'];
    } else if (dataType === '3DModel') {
      category = '3D 모델 · 환경/소품';
      extraTags = ['3D', 'PBR', 'GLTF', 'OBJ', 'CC0', 'ambientCG', 'no-ai'];
      formats = ['OBJ', 'FBX', 'USD', 'PNG'];
    } else if (dataType === 'Terrain') {
      category = '3D 모델 · 환경/소품';
      extraTags = ['터레인', '지형', '3D', 'PBR', 'CC0', 'ambientCG', 'no-ai'];
      formats = ['PNG', 'EXR'];
    } else if (dataType === 'Decal' || dataType === 'Atlas') {
      category = 'PBR 텍스처 · 머티리얼';
      extraTags = ['데칼', 'PBR', '텍스처', 'CC0', 'ambientCG', 'no-ai'];
      formats = ['PNG', 'JPG'];
    }

    const downloads = item.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads || [];
    const preferredDl = downloads.find((d) => /2K-JPG|1K-JPG|2K-PNG|1K-PNG/i.test(String(d.attribute || '')))
      || downloads[0]
      || null;
    const sourceUrl = String(item.shortLink || `https://ambientcg.com/view?id=${encodeURIComponent(rawId)}`);
    const externalDownloadUrl = String(preferredDl?.fullDownloadPath || sourceUrl);
    const thumb = item.previewImage?.['256-JPG-242424']
      || item.previewImage?.['256-WEBP']
      || item.previewImage?.['256-PNG']
      || '';
    const title = String(item.displayName || rawId).trim();
    const rawTags = Array.isArray(item.tags) ? item.tags.filter((t) => !/^\d+$/.test(String(t))) : [];
    const tags = enrichTags([...rawTags, item.displayCategory || ''], extraTags);
    const slug = slugify(rawId, 'acg');
    const descPart = item.description ? `${String(item.description).trim().slice(0, 140)} ` : '';
    const summary = `${descPart}ambientCG 공식 CC0 1.0 ${dataType}(${item.displayCategory || 'PBR'}) 에셋입니다. 외부 CDN ZIP 직접 다운로드(${preferredDl?.attribute || '표준'})를 지원하며 Godot 4.7.2 상업 프로젝트에 자유롭게 적용할 수 있습니다. (Powered by ambientCG)`;

    collected.push(finalizePackageEntry({
      asset_id: slug,
      asset_version_id: '1.0.0',
      release_id: makeShortId('rel', slug, '1.0.0'),
      artifact_id: makeShortId('art', slug, '1.0.0'),
      release_kind: 'package',
      category,
      tags,
      formats,
      title,
      summary,
      publisher_id: 'pub-ambientcg-cc0',
      author: 'Lennart Demes (ambientCG)',
      license: 'CC0-1.0',
      license_tier: 'tier1_cc0',
      ai_disclosure: 'No generative AI used',
      license_snapshot_ref: 'lic-cc0-1.0-universal',
      source_provider: 'ambientCG (CC0)',
      source_url: sourceUrl,
      download_url: externalDownloadUrl,
      external_download_url: externalDownloadUrl,
      thumbnail_url: thumb,
    }));
  }
  console.log(` -> ${collected.length} ambientCG CC0 packages collected`);
  return collected;
}

async function collectGameIconsAssets() {
  console.log('Fetching Game-Icons.net official GitHub SVG repository (CC-BY-3.0)...');
  const res = await fetch('https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1', { headers: UA });
  if (!res.ok) throw new Error(`Game-Icons GitHub HTTP ${res.status}`);
  const data = await res.json();
  const svgs = (data.tree || []).filter((node) => node.type === 'blob' && node.path.endsWith('.svg') && node.path.includes('/'));
  console.log(` -> ${svgs.length} Game-Icons.net CC-BY-3.0 vector SVG icons found`);

  const collected = [];
  for (const node of svgs) {
    const [authorSlug, fileName] = node.path.split('/');
    const baseName = fileName.replace(/\.svg$/i, '');
    const titleWords = baseName.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const title = `${titleWords} Icon (SVG)`;
    const slug = slugify(`${authorSlug}-${baseName}`, 'gi');
    const rawSvgUrl = `https://raw.githubusercontent.com/game-icons/icons/master/${node.path}`;
    const pageUrl = `https://game-icons.net/1x1/${encodeURIComponent(authorSlug)}/${encodeURIComponent(baseName)}.html`;
    const tags = enrichTags([...baseName.split(/[-_]+/), authorSlug, 'CC-BY-3.0'], ['2D', '아이콘', 'UI', 'SVG', 'RPG', '인벤토리', '스킬', 'GameIcons', 'no-ai']);
    const summary = `Game-Icons.net 공식 벡터 SVG 게임 아이콘(${titleWords}, 제작: ${authorSlug})입니다. RPG 인벤토리·스킬·장비·HUD UI에 해상도 손실 없이 적용할 수 있으며 CC-BY-3.0에 따라 저작자(${authorSlug}) 표기가 필요합니다.`;

    collected.push(finalizePackageEntry({
      asset_id: slug,
      asset_version_id: '1.0.0',
      release_id: makeShortId('rel', slug, '1.0.0'),
      artifact_id: makeShortId('art', slug, '1.0.0'),
      release_kind: 'package',
      category: '2D · UI/아이콘',
      tags,
      formats: ['SVG'],
      title,
      summary,
      publisher_id: `pub-gi-${authorSlug.replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'comm'}`,
      author: `${authorSlug} (Game-Icons.net)`,
      license: 'CC-BY-3.0',
      license_tier: 'tier2_attribution',
      ai_disclosure: 'No generative AI used',
      license_snapshot_ref: 'lic-cc-by-3.0-attribution',
      source_provider: 'Game-Icons.net (CC-BY-3.0)',
      source_url: pageUrl,
      download_url: rawSvgUrl,
      external_download_url: rawSvgUrl,
      thumbnail_url: rawSvgUrl,
    }));
  }
  console.log(` -> ${collected.length} Game-Icons.net CC-BY-3.0 icon packages collected`);
  return collected;
}

function collectGeminiReportCuratedExternalPacks() {
  const curated = [
    // --- KayKit Official GitHub CC0 ZIPs (Direct External Linkage) ---
    { id: 'kaykit-restaurant-bits', title: 'KayKit Restaurant Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '로우폴리', '소품', '음식', '레스토랑', 'KayKit', 'CC0', 'no-ai'], summary: '레스토랑·주방·음식 소품으로 구성된 KayKit CC0 1.0 스타일라이즈드 3D 프랍 팩입니다. 공식 GitHub 릴리스 ZIP 외부 직접 다운로드를 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0/zip/153c8a7535b48237854cb54ff6890679f8c574d1' },
    { id: 'kaykit-furniture-bits', title: 'KayKit Furniture Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '로우폴리', '가구', '실내', '인테리어', 'KayKit', 'CC0', 'no-ai'], summary: '실내 인테리어용 가구와 생활 소품을 모은 KayKit CC0 1.0 3D 프랍 팩입니다. 공식 GitHub ZIP 직접 연동을 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/zip/96d5930a8dbdb363409bbc2d3341718b00e17c9c' },
    { id: 'kaykit-city-builder-bits', title: 'KayKit City Builder Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '로우폴리', '도시', '건물', '모듈러', 'KayKit', 'CC0', 'no-ai'], summary: '도시 건설 시뮬레이션용 건물·도로·조경 모듈 3D 키트입니다. 공식 GitHub 릴리스 ZIP 직접 연동을 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/zip/63976910ca04d16f0fc531b9c614244be8128713' },
    { id: 'kaykit-space-base-bits', title: 'KayKit Space Base Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '로우폴리', 'SF', '우주', '환경', 'KayKit', 'CC0', 'no-ai'], summary: '행성 우주 기지 건설과 SF 스테이지용 모듈·프랍 3D 키트입니다. 공식 GitHub 릴리스 ZIP 직접 연동을 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0/zip/6dfbcac9927d06283752c4defd4882cfe0d29666' },
    { id: 'kaykit-halloween-bits', title: 'KayKit Halloween Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '로우폴리', '할로윈', '소품', '시즌', 'KayKit', 'CC0', 'no-ai'], summary: '할로윈 테마 호박·묘비·장식 소품으로 구성된 시즌 3D 프랍 팩입니다. 공식 GitHub ZIP 직접 연동을 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0/zip/6dc69bf6b2fa766a985754f35ec6a0324090e6c6' },
    { id: 'kaykit-prototype-bits', title: 'KayKit Prototype Bits (CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (GitHub CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '프로토타입', '그레이박스', '레벨디자인', 'KayKit', 'CC0', 'no-ai'], summary: '게임 레벨 프로토타이핑과 기믹 테스트용 블록·스위치 3D 팩입니다. 공식 GitHub ZIP 직접 연동을 지원합니다.', source: 'https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0', download: 'https://codeload.github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0/zip/bb159596f4f5106b663741d002c8eb45c80c0f41' },
    { id: 'kaykit-dungeon-pack-ext', title: 'KayKit Dungeon Remastered Pack (200+ CC0 3D)', category: '3D 모델 · 환경/소품', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (itch.io CC0)', formats: ['FBX', 'GLTF', 'OBJ'], tags: ['3D', '던전', '모듈러', 'RPG', 'KayKit', 'CC0', 'no-ai'], summary: '던전 레벨 구성에 필요한 200종 이상의 스타일라이즈드 던전 건축 파츠 및 프랍 모음(CC0 1.0, No AI)입니다.', source: 'https://kaylousberg.itch.io/kaykit-dungeon-remastered', download: 'https://kaylousberg.itch.io/kaykit-dungeon-remastered' },
    { id: 'kaykit-character-animations', title: 'KayKit Character Animations (150+ 클립 CC0)', category: '3D 모델 · 캐릭터/장비', author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0', provider: 'KayKit (itch.io CC0)', formats: ['FBX', 'GLTF'], tags: ['3D', '애니메이션', '휴머노이드', '전투', 'KayKit', 'CC0', 'no-ai'], summary: 'KayKit 및 범용 휴머노이드 캐릭터에 적용 가능한 이동·전투·도구 사용 등 150개 이상의 CC0 1.0 애니메이션 모션 번들입니다.', source: 'https://kaylousberg.itch.io/kaykit-character-animations', download: 'https://kaylousberg.itch.io/kaykit-character-animations' },

    // --- Kenney Official OpenGameArt CC0 ZIPs (3D) ---
    { id: 'kenney-modular-cave-kit', title: 'Kenney Modular Cave Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '로우폴리', '동굴', '환경', '모듈러', 'Kenney', 'CC0', 'no-ai'], summary: '동굴 레벨을 모듈 방식으로 조립할 수 있는 Kenney 공식 로우폴리 3D 동굴 환경 키트입니다.', source: 'https://opengameart.org/content/modular-cave-kit', download: 'https://opengameart.org/sites/default/files/kenney_modular-cave-kit_1.0.zip' },
    { id: 'kenney-tower-defense-kit', title: 'Kenney Tower Defense Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '중세', '타워디펜스', '환경', 'Kenney', 'CC0', 'no-ai'], summary: '타워 디펜스 게임용 방어 타워·지형·적 유닛 로우폴리 3D 모듈 세트입니다.', source: 'https://opengameart.org/content/tower-defense-kit', download: 'https://opengameart.org/sites/default/files/kenney_tower-defense-kit_1.zip' },
    { id: 'kenney-mini-skate', title: 'Kenney Mini Skate Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '로우폴리', '스포츠', '소품', 'Kenney', 'CC0', 'no-ai'], summary: '스케이트보드와 파크 기물로 구성된 경량 로우폴리 3D 프랍 키트입니다.', source: 'https://opengameart.org/content/mini-skate', download: 'https://opengameart.org/sites/default/files/kenney_mini-skate_2.0.zip' },
    { id: 'kenney-train-kit', title: 'Kenney Train Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '로우폴리', '차량', '기차', '모듈러', 'Kenney', 'CC0', 'no-ai'], summary: '기관차·객차·선로 모듈을 포함한 로우폴리 기차 3D 키트입니다.', source: 'https://opengameart.org/content/train-kit', download: 'https://opengameart.org/sites/default/files/kenney_train-kit_0.zip' },
    { id: 'kenney-blocky-characters', title: 'Kenney Blocky Characters (3D CC0)', category: '3D 모델 · 캐릭터/장비', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '캐릭터', '복셀', '로우폴리', 'Kenney', 'CC0', 'no-ai'], summary: '다양한 스킨이 포함된 블록형 로우폴리 3D 캐릭터 팩입니다.', source: 'https://opengameart.org/content/blocky-characters', download: 'https://opengameart.org/sites/default/files/kenney_blocky-characters_2.0.zip' },
    { id: 'kenney-space-station-kit', title: 'Kenney Space Station Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', 'SF', '우주', '환경', '모듈러', 'Kenney', 'CC0', 'no-ai'], summary: 'SF 우주 정거장 내부 복도·방·소품을 구성하는 모듈형 3D 키트입니다.', source: 'https://opengameart.org/content/space-station-kit', download: 'https://opengameart.org/sites/default/files/kenney_space-station-kit.zip' },
    { id: 'kenney-platformer-kit-3d', title: 'Kenney 3D Platformer Kit (CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '플랫포머', '환경', '모듈러', 'Kenney', 'CC0', 'no-ai'], summary: '3D 플랫포머 스테이지 제작용 지형·함정·코인·아이템 모듈 키트입니다.', source: 'https://opengameart.org/content/platformer-kit', download: 'https://opengameart.org/sites/default/files/kenney_platformer-kit_4.1.zip' },
    { id: 'kenney-pirate-kit-3d', title: 'Kenney Pirate Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '해적', '선박', '환경', 'Kenney', 'CC0', 'no-ai'], summary: '해적선·항구·보물상자 등 해양 어드벤처용 로우폴리 3D 세트입니다.', source: 'https://opengameart.org/content/pirate-kit', download: 'https://opengameart.org/sites/default/files/kenney_pirate-kit_2.1.zip' },
    { id: 'kenney-city-kit-suburban', title: 'Kenney City Kit Suburban (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '도시', '건물', '환경', 'Kenney', 'CC0', 'no-ai'], summary: '교외 주택가·도로·나무·울타리로 구성된 로우폴리 도시 3D 키트입니다.', source: 'https://opengameart.org/content/city-kit-suburban', download: 'https://opengameart.org/sites/default/files/kenney_city-kit-suburban_2.0.zip' },
    { id: 'kenney-mini-shop', title: 'Kenney Mini Shop Kit (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '소품', '상점', '인테리어', 'Kenney', 'CC0', 'no-ai'], summary: '상점 인테리어와 진열대·상품 소품을 담은 경량 3D 프랍 팩입니다.', source: 'https://opengameart.org/content/mini-shop', download: 'https://opengameart.org/sites/default/files/kenney_mini-shop_2.1.zip' },
    { id: 'kenney-city-kit-industrial', title: 'Kenney City Kit Industrial (3D CC0)', category: '3D 모델 · 환경/소품', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['FBX', 'GLTF', 'OBJ', 'PNG'], tags: ['3D', '도시', '산업', '공장', '환경', 'Kenney', 'CC0', 'no-ai'], summary: '공장·창고·산업 시설 배치용 로우폴리 산업 도시 3D 키트입니다.', source: 'https://opengameart.org/content/city-kit-industrial', download: 'https://opengameart.org/sites/default/files/kenney_city-kit-industrial_2.0.zip' },

    // --- Kenney Official OpenGameArt CC0 ZIPs (2D / UI / VFX / Audio) ---
    { id: 'kenney-tiny-farm-2d', title: 'Kenney Tiny Farm Tileset (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '타일셋', '농장', '탑다운', 'Kenney', 'CC0', 'no-ai'], summary: '농장 경영·생활 시뮬레이션용 탑다운 픽셀 아트 타일셋입니다.', source: 'https://opengameart.org/content/tiny-farm', download: 'https://opengameart.org/sites/default/files/kenney_tiny-farm.zip' },
    { id: 'kenney-background-elements', title: 'Kenney Background Elements Redux (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG', 'SVG'], tags: ['2D', '배경', '패럴랙스', '벡터', '플랫포머', 'Kenney', 'CC0', 'no-ai'], summary: '횡스크롤 및 캐주얼 게임용 다층 패럴랙스 배경 요소 모음입니다.', source: 'https://opengameart.org/content/background-elements-redux', download: 'https://opengameart.org/sites/default/files/Background%20Elements%20Redux.zip' },
    { id: 'kenney-pixel-platformer', title: 'Kenney Pixel Platformer Pack (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '플랫포머', '타일셋', '스프라이트', 'Kenney', 'CC0', 'no-ai'], summary: '캐릭터·적·타일·아이템이 포함된 레트로 픽셀 플랫포머 팩입니다.', source: 'https://opengameart.org/content/pixel-platformer', download: 'https://opengameart.org/sites/default/files/kenney_pixel-platformer.zip' },
    { id: 'kenney-retro-textures-fantasy', title: 'Kenney Retro Textures Fantasy (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '텍스처', '판타지', '레트로', 'Kenney', 'CC0', 'no-ai'], summary: '고전 RPG·던전 크롤러 스타일의 판타지 벽·바닥 텍스처 팩입니다.', source: 'https://opengameart.org/content/retro-textures-fantasy', download: 'https://opengameart.org/sites/default/files/kenney_retro-textures-fantasy.zip' },
    { id: 'kenney-mobile-controls-ui', title: 'Kenney Mobile Controls UI Pack (CC0)', category: '2D · UI/아이콘', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG', 'SVG'], tags: ['2D', 'UI', 'GUI', '버튼', '터치', 'Kenney', 'CC0', 'no-ai'], summary: '터치스크린·웹 게임용 가상 조이스틱·버튼 UI 아이콘 팩입니다.', source: 'https://opengameart.org/content/mobile-controls', download: 'https://opengameart.org/sites/default/files/mobile-controls-1.0.zip' },
    { id: 'kenney-ui-pack-adventure', title: 'Kenney UI Pack Adventure (CC0)', category: '2D · UI/아이콘', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG', 'SVG', 'XML'], tags: ['2D', 'UI', 'GUI', 'RPG', '어드벤처', '버튼', 'Kenney', 'CC0', 'no-ai'], summary: '어드벤처·판타지 RPG 인터페이스용 패널·버튼·아이콘 130+ UI 팩입니다.', source: 'https://opengameart.org/content/ui-pack-adventure', download: 'https://opengameart.org/sites/default/files/kenney_ui-pack-adventure.zip' },
    { id: 'kenney-tiny-city-2d', title: 'Kenney Tiny City Tileset (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '타일셋', '도시', '탑다운', 'Kenney', 'CC0', 'no-ai'], summary: '탑다운 도시·마을 맵 제작용 초경량 픽셀 타일 및 차량·인물 팩입니다.', source: 'https://opengameart.org/content/tiny-city', download: 'https://opengameart.org/sites/default/files/kenney_tiny-city.zip' },
    { id: 'kenney-monochrome-pirates', title: 'Kenney Monochrome Pirates 1-Bit (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '1-bit', '해적', '로그라이크', 'Kenney', 'CC0', 'no-ai'], summary: '1비트 흑백 스타일의 해적·선박·섬 탐험 로그라이크 타일셋입니다.', source: 'https://opengameart.org/content/monochrome-pirates', download: 'https://opengameart.org/sites/default/files/kenney_monochrome-pirates.zip' },
    { id: 'kenney-tiny-battle-2d', title: 'Kenney Tiny Battle Tactics Pack (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '전략', '타일셋', '유닛', 'Kenney', 'CC0', 'no-ai'], summary: '턴제 전략·워게임용 병종 유닛과 전장 지형 픽셀 타일 팩입니다.', source: 'https://opengameart.org/content/tiny-battle', download: 'https://opengameart.org/sites/default/files/kenney_tiny-battle.zip' },
    { id: 'kenney-light-masks-2d', title: 'Kenney 2D Light Masks Pack (VFX CC0)', category: 'Godot 애드온 · 셰이더/VFX', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '조명', '마스크', 'VFX', 'Kenney', 'CC0', 'no-ai'], summary: '2D PointLight2D 조명 효과와 시야 마스킹 구현을 위한 그라데이션 마스크 팩입니다.', source: 'https://opengameart.org/content/light-masks', download: 'https://opengameart.org/sites/default/files/kenney_light-masks-1.0.zip' },
    { id: 'kenney-fish-pack-2d', title: 'Kenney Fish & Underwater Pack (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG', 'SVG'], tags: ['2D', '스프라이트', '수중', '벡터', 'Kenney', 'CC0', 'no-ai'], summary: '낚시·수중 탐험 게임용 어류 및 해초·바닥 스프라이트 팩입니다.', source: 'https://opengameart.org/content/fish-pack', download: 'https://opengameart.org/sites/default/files/kenney_fish-pack_2.0.zip' },
    { id: 'kenney-crosshair-pack', title: 'Kenney Crosshair Pack (200+ 레티클 CC0)', category: '2D · UI/아이콘', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG', 'SVG'], tags: ['2D', 'UI', '아이콘', 'FPS', '조준선', 'Kenney', 'CC0', 'no-ai'], summary: 'FPS·TPS·아케이드 슈팅 게임용 조준선 레티클 200여 종 세트입니다.', source: 'https://opengameart.org/content/crosshair-pack', download: 'https://opengameart.org/sites/default/files/kenney_crosshair-pack.zip' },
    { id: 'kenney-roguelike-rpg-tiles', title: 'Kenney Roguelike RPG Tiles 16x16 (2D CC0)', category: '2D · 스프라이트/타일셋', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '로그라이크', 'RPG', '16x16', '타일셋', 'Kenney', 'CC0', 'no-ai'], summary: '16x16 규격의 던전·필드·마을·인테리어 통합 로그라이크 타일 팩입니다.', source: 'https://opengameart.org/content/roguelike-rpg-pack', download: 'https://opengameart.org/sites/default/files/Roguelike%20pack.zip' },
    { id: 'kenney-particle-pack-vfx', title: 'Kenney Particle Pack (VFX 파티클 CC0)', category: 'Godot 애드온 · 셰이더/VFX', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['PNG'], tags: ['VFX', '파티클', '2D', '불꽃', '연기', '마법', 'Kenney', 'CC0', 'no-ai'], summary: '불꽃·연기·마법·광원 GPUParticles2D/3D용 파티클 스프라이트 CC0 이펙트 팩입니다.', source: 'https://opengameart.org/content/particle-pack', download: 'https://opengameart.org/sites/default/files/kenney_particlePack.zip' },
    { id: 'kenney-godot-starter-kits', title: 'KenneyNL Godot 4 Starter Kits (3D Platformer · FPS · City Builder)', category: 'Godot 애드온 · 3D 도구', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (GitHub CC0)', formats: ['Godot Project', 'GLB', 'GDScript'], tags: ['Godot4', '템플릿', '스타터키트', '플랫포머', 'FPS', 'Kenney', 'CC0', 'no-ai'], summary: '3D 플랫포머·FPS·도시 건설 기본 Godot 4 프로젝트 템플릿과 30종 이상의 커스텀 스플래시 스크린 CC0 스타터 키트입니다.', source: 'https://github.com/KenneyNL', download: 'https://github.com/KenneyNL' },

    // --- Curated Indie 2D / UI / Fonts (Tier 1 CC0, Tier 2 CC-BY-4.0, Tier 2-B OFL-1.1) ---
    { id: 'pixelfrog-platformer-cc0', title: 'Pixel Adventure 1 · Pirate Bomb · Kings and Pigs (CC0 2D)', category: '2D · 스프라이트/타일셋', author: 'Pixel Frog', license: 'CC0-1.0', provider: 'Pixel Frog (itch.io CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '플랫포머', '캐릭터', '애니메이션', 'CC0', 'no-ai'], summary: '20 FPS 애니메이션 셀을 갖춘 횡스크롤 플랫포머·해적·중세 액션 캐릭터 및 함정 CC0 스프라이트 팩 3종입니다(재배포 금지 Tiny Swords 최신판 제외).', source: 'https://pixelfrog-assets.itch.io/pixel-adventure-1', download: 'https://pixelfrog-assets.itch.io/pixel-adventure-1' },
    { id: '0x72-dungeon-tileset-ii', title: '0x72 16x16 DungeonTileset II & 테마 시리즈 (CC0 2D)', category: '2D · 스프라이트/타일셋', author: '0x72', license: 'CC0-1.0', provider: '0x72 (itch.io CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '16x16', '타일셋', '던전', '로그라이크', 'CC0', 'no-ai'], summary: '16x16 던전 타일셋 II(애니메이션 캐릭터·몬스터 포함) 및 공장·해적·로봇·메트로이드배니아 테마 CC0 타일셋 시리즈입니다.', source: 'https://0x72.itch.io/dungeontileset-ii', download: 'https://0x72.itch.io/dungeontileset-ii' },
    { id: 'ansimuz-sunny-land-cc0', title: 'Sunny Land 16-Bit Action Platformer Pack (CC0 2D)', category: '2D · 스프라이트/타일셋', author: 'ansimuz', license: 'CC0-1.0', provider: 'ansimuz (itch.io CC0)', formats: ['PNG'], tags: ['2D', '픽셀아트', '16-bit', '플랫포머', '애니메이션', 'CC0', 'no-ai'], summary: '8프레임 이상 달리기와 공격 예비동작을 갖춘 액션 플랫포머·메트로이드배니아 스타일 CC0 캐릭터 및 배경 세트입니다.', source: 'https://ansimuz.itch.io/sunny-land-pixel-game-art', download: 'https://ansimuz.itch.io/sunny-land-pixel-game-art' },
    { id: 'pixelboy-ninja-adventure-cc0', title: 'Ninja Adventure Top-Down 16x16 RPG Pack (CC0 2D+Audio)', category: '2D · 스프라이트/타일셋', author: 'pixel-boy & AAA', license: 'CC0-1.0', provider: 'pixel-boy (itch.io CC0)', formats: ['PNG', 'OGG'], tags: ['2D', '픽셀아트', '탑다운', '16x16', 'RPG', '닌자', 'CC0', 'no-ai'], summary: '닌자 테마의 16x16 탑다운 RPG용 캐릭터·타일·소품 및 사운드를 하나로 묶은 CC0 종합 픽셀 아트 팩입니다.', source: 'https://pixel-boy.itch.io/ninja-adventure-asset-pack', download: 'https://pixel-boy.itch.io/ninja-adventure-asset-pack' },
    { id: 'crusenho-complete-ui-essential', title: 'Complete UI Essential Pack - Flat (CC-BY-4.0)', category: '2D · UI/아이콘', author: 'Crusenho', license: 'CC-BY-4.0', provider: 'Crusenho (itch.io CC-BY)', formats: ['PNG'], tags: ['2D', 'UI', '픽셀아트', 'HUD', 'CC-BY-4.0', '저작자표기', 'no-ai'], summary: '플랫 스타일의 깔끔한 픽셀 아트 게임 메뉴 및 HUD 필수 UI 에셋 팩입니다(Tier 2: CC-BY-4.0 저작자 Crusenho 표기 필수).', source: 'https://crusenho.itch.io/complete-ui-essential-pack', download: 'https://crusenho.itch.io/complete-ui-essential-pack' },
    { id: 'font-pretendard-ofl', title: 'Pretendard 한글·영문 UI 폰트 패밀리 (SIL OFL-1.1)', category: '폰트 · 타이포그래피 (OFL)', author: '길형진 (orioncactus)', license: 'OFL-1.1', provider: 'GitHub (SIL OFL-1.1)', formats: ['TTF', 'OTF', 'WOFF2'], tags: ['폰트', 'UI', '한글', '타이포그래피', 'OFL-1.1', '무료전용', 'no-ai'], summary: '한글·영문 게임 UI/HUD에 최적화된 산세리프 폰트 Pretendard(SIL OFL-1.1)입니다. 상업 게임 임베딩 및 무료 배포 가능(단독 유료 판매 금지).', source: 'https://github.com/orioncactus/pretendard', download: 'https://github.com/orioncactus/pretendard/releases/latest' },
    { id: 'font-noto-serif-kr-ofl', title: 'Noto Serif KR 명조 UI 폰트 (SIL OFL-1.1)', category: '폰트 · 타이포그래피 (OFL)', author: 'Google Fonts', license: 'OFL-1.1', provider: 'Google Fonts (SIL OFL-1.1)', formats: ['TTF', 'OTF'], tags: ['폰트', 'UI', '한글', '명조', 'RPG', 'OFL-1.1', '무료전용', 'no-ai'], summary: '판타지 RPG·스토리 게임 대사창과 타이틀에 어울리는 구글 Noto Serif KR(SIL OFL-1.1) 폰트입니다. 무료 배포 및 게임 임베딩 허용.', source: 'https://fonts.google.com/noto/specimen/Noto+Serif+KR', download: 'https://fonts.google.com/noto/specimen/Noto+Serif+KR' },

    // --- Curated Audio (Tier 1 CC0 & Tier 2 CC-BY-4.0) ---
    { id: 'tallbeard-free-music-loops', title: 'Tallbeard FREE Music Loop Bundle (200+ BGM 트랙 CC0)', category: '오디오 · 효과음', author: 'Tallbeard Studios (Abstraction)', license: 'CC0-1.0', provider: 'Tallbeard Studios (itch.io CC0)', formats: ['WAV', 'OGG', 'MP3'], tags: ['오디오', 'BGM', '음악', '루프', 'CC0', 'no-ai'], summary: '다양한 게임 장르에 끊김 없이 반복 재생할 수 있는 200곡 이상의 CC0 1.0 배경음악 루프 번들입니다.', source: 'https://tallbeard.itch.io/music-loop-bundle', download: 'https://tallbeard.itch.io/music-loop-bundle' },
    { id: 'kenney-audio-collection-cc0', title: 'Kenney Audio Collection (UI · RPG · Sci-Fi · Impact OGG CC0)', category: '오디오 · 효과음', author: 'Kenney', license: 'CC0-1.0', provider: 'Kenney (OpenGameArt CC0)', formats: ['OGG'], tags: ['오디오', 'SFX', '효과음', 'UI', 'RPG', 'SF', 'Kenney', 'CC0', 'no-ai'], summary: 'UI 클릭음(100종), RPG 폴리·무기·발소리(50종), SF·디지털 효과음(60종), 타격음·징글을 모은 Kenney 공식 CC0 OGG 오디오 세트입니다.', source: 'https://opengameart.org/content/interface-sounds-starter-pack', download: 'https://opengameart.org/content/interface-sounds-starter-pack' },
    { id: 'voice-clips-rpg-cc0', title: 'RPG Character & Dialogue Voice Clips Pack (72+ CC0)', category: '오디오 · 효과음', author: 'Cici Fyre / Tom Vian (SFB Games)', license: 'CC0-1.0', provider: 'OpenGameArt / itch.io (CC0)', formats: ['WAV', 'OGG'], tags: ['오디오', '보이스', '대사', 'RPG', 'CC0', 'no-ai'], summary: '밝은 톤의 여성 RPG 캐릭터 보이스 클립 72종(Cici Fyre)과 대화창 효과용 간결한 보이스 팩(Tom Vian) CC0 묶음입니다.', source: 'https://cicifyre.itch.io/free-voice-clips-pack-bright-female', download: 'https://cicifyre.itch.io/free-voice-clips-pack-bright-female' },
    { id: 'incompetech-kevin-macleod-bgm', title: 'Incompetech Game & Cinematic Score Library (CC-BY-4.0)', category: '오디오 · 효과음', author: 'Kevin MacLeod (incompetech.com)', license: 'CC-BY-4.0', provider: 'Incompetech (CC-BY-4.0)', formats: ['MP3', 'OGG'], tags: ['오디오', 'BGM', '오케스트라', '시네마틱', 'CC-BY-4.0', '저작자표기', 'no-ai'], summary: '오케스트라·호러·일렉트로닉·RPG 등 방대한 게임 BGM 라이브러리입니다(Tier 2: CC-BY-4.0 저작자 Kevin MacLeod (incompetech.com) 표기 필수).', source: 'https://incompetech.com/music/royalty-free/music.html', download: 'https://incompetech.com/music/royalty-free/music.html' },
    { id: 'freesound-cc0-ccby-sfx', title: 'Freesound.org CC0 / CC-BY 환경음·폴리 SFX 라이브러리', category: '오디오 · 효과음', author: 'Freesound Community', license: 'CC0-1.0', provider: 'Freesound (CC0/CC-BY Filter)', formats: ['WAV', 'OGG', 'FLAC'], tags: ['오디오', 'SFX', '환경음', '폴리', 'CC0', 'no-ai'], summary: 'Freesound 커뮤니티 DB에서 상업적 사용이 가능한 CC0·CC-BY 필터 기준 환경음·효과음(CC-BY-NC 제외)을 외부 공식 검색 API로 연결합니다.', source: 'https://freesound.org/search/?f=license%3A%22Creative+Commons+0%22', download: 'https://freesound.org/search/?f=license%3A%22Creative+Commons+0%22' },
    { id: 'musopen-classical-pd', title: 'Musopen Classical Orchestra Archive (CC0 / Public Domain)', category: '오디오 · 효과음', author: 'Musopen', license: 'CC0-1.0', provider: 'Musopen (Public Domain)', formats: ['MP3', 'OGG'], tags: ['오디오', 'BGM', '클래식', '오케스트라', 'CC0', 'no-ai'], summary: '퍼블릭 도메인 클래식 악곡의 녹음물 중 CC0·PD 조건이 확인된 고전 오케스트라 BGM 외부 아카이브입니다.', source: 'https://musopen.org/music/', download: 'https://musopen.org/music/' },

    // --- Curated 3D / VFX / Shaders / Audio Synth Tools ---
    { id: 'the-base-mesh-cc0', title: 'The Base Mesh Collection (1,250+ 클린 토폴로지 3D CC0)', category: '3D 모델 · 환경/소품', author: 'The Base Mesh', license: 'CC0-1.0', provider: 'The Base Mesh (CC0)', formats: ['OBJ', 'FBX', 'BLEND'], tags: ['3D', '베이스메시', '소품', '모델링', 'CC0', 'no-ai'], summary: '깔끔한 토폴로지로 제작되어 스컬프팅·리토폴로지·프랍 제작의 출발점으로 쓰기 좋은 1,250종 이상의 CC0 기본 3D 메쉬 외부 컬렉션입니다.', source: 'https://thebasemesh.com/', download: 'https://thebasemesh.com/' },
    { id: 'smithsonian-open-access-3d', title: 'Smithsonian Open Access 3D Scans (3,451+ 유물 CC0 GLB)', category: '3D 모델 · 환경/소품', author: 'Smithsonian Institution', license: 'CC0-1.0', provider: 'Smithsonian Open Access (CC0)', formats: ['GLB', 'GLTF', 'OBJ'], tags: ['3D', '포토그래메트리', '박물관', '유물', 'GLB', 'CC0', 'no-ai'], summary: '아폴로 11호 사령선·라이트 플라이어·고대 유물 등 3,451점의 스미소니언 CC0 3D 스캔(게임 투입 시 데시메이션 권장) 외부 아카이브입니다.', source: 'https://3d.si.edu/', download: 'https://3d.si.edu/' },
    { id: '100-avatars-rigged-cc0', title: '100 Avatars Rigged 3D Collection (200+ CC0 캐릭터)', category: '3D 모델 · 캐릭터/장비', author: '100 Avatars', license: 'CC0-1.0', provider: '100 Avatars (CC0)', formats: ['GLTF', 'FBX'], tags: ['3D', '아바타', '캐릭터', '리깅', '멀티플레이', 'CC0', 'no-ai'], summary: '멀티플레이·소셜 환경에 즉시 투입할 수 있는 200종 이상의 리깅 완료 CC0 3D 아바타 모음입니다.', source: 'https://100avatars.com/', download: 'https://100avatars.com/' },
    { id: 'godot-shaders-cc0-pack', title: 'Godot Shaders CC0 Collection (Dissolve · Sky · 2D SDF · Water)', category: 'Godot 애드온 · 셰이더/VFX', author: 'Godot Shaders Community', license: 'CC0-1.0', provider: 'Godot Shaders (CC0 Code)', formats: ['GDShader'], tags: ['VFX', '셰이더', 'Godot4', 'GDShader', '디졸브', 'CC0', 'no-ai'], summary: '고스트 잔상·절차적 밤하늘·디졸브·2D SDF 라이팅 등 40페이지 이상 축적된 CC0 GDShader 코드 외부 아카이브입니다(코드 한정, 데모 이미지 제외).', source: 'https://godotshaders.com/shader-license/cc0/', download: 'https://godotshaders.com/shader-license/cc0/' },
    { id: 'jsfxr-retro-sfx-synth', title: 'jsfxr Retro 8-Bit SFX Synthesizer (Unlicense)', category: '오디오 · 효과음', author: 'Eric Fredricksen & Contributors', license: 'Unlicense', provider: 'GitHub (Unlicense)', formats: ['Web', 'WAV', 'JS'], tags: ['도구', '오디오', '효과음', '레트로', '8-bit', 'Unlicense', 'no-ai'], summary: '레트로 8비트 스타일 효과음을 웹·스크립트 환경에서 즉시 합성해 WAV/OGG로 내보내는 퍼블릭 도메인(Unlicense) 오디오 합성 툴입니다.', source: 'https://github.com/chr15m/jsfxr', download: 'https://github.com/chr15m/jsfxr' },
  ];

  const entries = [];
  for (const item of curated) {
    const slug = slugify(item.id);
    const licRefMap = {
      'CC0-1.0': 'lic-cc0-1.0-universal',
      'Unlicense': 'lic-unlicense-public-domain',
      'CC-BY-4.0': 'lic-cc-by-4.0-attribution',
      'CC-BY-3.0': 'lic-cc-by-3.0-attribution',
      'OFL-1.1': 'lic-sil-ofl-1.1-font-free-only',
    };
    entries.push(finalizePackageEntry({
      asset_id: slug,
      asset_version_id: '1.0.0',
      release_id: makeShortId('rel', slug, '1.0.0'),
      artifact_id: makeShortId('art', slug, '1.0.0'),
      release_kind: 'package',
      category: item.category,
      tags: item.tags,
      formats: item.formats,
      title: item.title,
      summary: item.summary,
      publisher_id: `pub-${slug.split('-')[0] || 'curated'}`,
      author: item.author,
      license: item.license,
      license_tier: resolveLicenseTier(item.license),
      ai_disclosure: 'No generative AI used',
      license_snapshot_ref: licRefMap[item.license] || 'lic-cc0-1.0-universal',
      source_provider: item.provider,
      source_url: item.source,
      download_url: item.download,
      external_download_url: item.download,
      thumbnail_url: '',
    }));
  }
  console.log(` -> ${entries.length} Gemini-report curated external packages added`);
  return entries;
}

function collectTier4ExternalDirectory() {
  const dirs = [
    {
      id: 'ext-sonniss-gdc-audio',
      title: '[외부 링크] Sonniss GDC Game Audio Bundles (2015–2026)',
      author: 'Sonniss',
      source_url: 'https://sonniss.com/gameaudiogdc',
      formats: ['WAV'],
      tags: ['외부링크', 'Tier4', '오디오', 'SFX', 'GDC', '재배포금지'],
      summary: 'GDC 2026 번들(7.47 GB+) 포함 로열티 프리 프로 게임 효과음 번들입니다. 게임 내 사용은 무료이나 원파일 재배포·에셋스토어 호스팅이 금지(Tier 4)되어 공식 사이트로만 안내합니다.'
    },
    {
      id: 'ext-cainos-pixel-topdown',
      title: '[외부 링크] Cainos Pixel Art Top Down - Basic',
      author: 'Cainos',
      source_url: 'https://cainos.itch.io/pixel-art-top-down-basic',
      formats: ['PNG'],
      tags: ['외부링크', 'Tier4', '2D', '픽셀아트', '타일셋', '재배포금지'],
      summary: '상업 게임 사용은 무료이나 수정본 포함 파일 재배포·재패키징이 금지된 커스텀 라이선스(Tier 4) 2D 탑다운 타일셋입니다. 공식 itch.io 페이지에서 직접 다운로드하세요.'
    },
    {
      id: 'ext-pixelfrog-tiny-swords',
      title: '[외부 링크] Pixel Frog Tiny Swords (최신 커스텀 라이선스)',
      author: 'Pixel Frog',
      source_url: 'https://pixelfrog-assets.itch.io/tiny-swords',
      formats: ['PNG'],
      tags: ['외부링크', 'Tier4', '2D', '픽셀아트', '전략', '재배포금지'],
      summary: '최신 버전부터 원파일 재배포·재패키징 금지 커스텀 약관으로 전환된 인기 2D 전략 에셋 팩(Tier 4)입니다. 약관 준수를 위해 공식 itch.io 링크로만 연결합니다.'
    },
    {
      id: 'ext-quaternius-custom-packs',
      title: '[외부 링크] Quaternius 3D 라이브러리 (커스텀 라이선스 팩 안내)',
      author: 'Quaternius',
      source_url: 'https://quaternius.com/',
      formats: ['FBX', 'GLTF', 'OBJ', 'BLEND'],
      tags: ['외부링크', 'Tier4', '3D', '로우폴리', '재배포금지'],
      summary: '완성된 게임 내 포함은 무료이나 공식 사이트 통합 약관(quaternius.com/license.html)상 단독 재배포가 금지된 팩은 Tier 4로 분류해 공식 페이지 링크로 안내합니다.'
    },
    {
      id: 'ext-pixabay-sfx',
      title: '[외부 링크] Pixabay Sound Effects',
      author: 'Pixabay Community',
      source_url: 'https://pixabay.com/sound-effects/',
      formats: ['MP3', 'WAV'],
      tags: ['외부링크', 'Tier4', '오디오', 'SFX', '재배포금지'],
      summary: 'Pixabay 독자 라이선스는 독립 파일 재배포 및 에셋 팩 번들링을 금지하므로(Tier 4) 자체 호스팅을 배제하고 공식 사이트 링크로만 제공합니다.'
    },
    {
      id: 'ext-99sounds-free-sfx',
      title: '[외부 링크] 99Sounds Free Sound Effects',
      author: '99Sounds',
      source_url: 'https://99sounds.org/free-sound-effects/',
      formats: ['WAV'],
      tags: ['외부링크', 'Tier4', '오디오', 'SFX', '재배포금지'],
      summary: '99Sounds 무료 효과음 팩은 제3자 스토어 재배포·번들링 금지(Tier 4) 정책에 따라 공식 사이트 아웃바운드 링크로만 안내합니다.'
    },
    {
      id: 'ext-zapsplat-sfx',
      title: '[외부 링크] ZapSplat Sound Effects & Music',
      author: 'ZapSplat',
      source_url: 'https://www.zapsplat.com/',
      formats: ['MP3', 'WAV'],
      tags: ['외부링크', 'Tier4', '오디오', 'SFX', 'BGM', '재배포금지'],
      summary: 'ZapSplat 독자 라이선스상 제3자 스토어 호스팅이 불가하므로(Tier 4) 공식 웹사이트에서 직접 약관 확인 후 이용하세요.'
    },
    {
      id: 'ext-mixkit-free-audio',
      title: '[외부 링크] Mixkit Free Sound Effects',
      author: 'Mixkit (Envato)',
      source_url: 'https://mixkit.co/free-sound-effects/',
      formats: ['WAV', 'MP3'],
      tags: ['외부링크', 'Tier4', '오디오', 'SFX', '재배포금지'],
      summary: 'Mixkit 독자 라이선스상 원파일 재배포 금지(Tier 4)에 해당하므로 서버에 호스팅하지 않고 공식 사이트 링크로만 안내합니다.'
    }
  ];

  const entries = dirs.map((d) => {
    const slug = slugify(d.id);
    return finalizeExternalDirectoryEntry({ ...d, asset_id: slug });
  });
  console.log(` -> ${entries.length} Tier 4 external-link-only directory entries added (zero raw hosting)`);
  return entries;
}

async function main() {
  const started = Date.now();
  const localPacks = collectLocalVerifiedGlbPacks();
  const curatedPacks = collectGeminiReportCuratedExternalPacks();
  const [polyHaven, ambientCG, godotLib, gameIcons] = await Promise.all([
    collectPolyHavenAssets(),
    collectAmbientCGAssets(),
    collectGodotAssetLibrary(),
    collectGameIconsAssets(),
  ]);

  const ALLOWED_COMMERCIAL_LICENSES = new Set([
    'CC0-1.0', 'Unlicense', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'Zlib', 'CC-BY-3.0', 'CC-BY-4.0', 'OFL-1.1'
  ]);
  const items = [
    ...localPacks,
    ...curatedPacks,
    ...polyHaven,
    ...ambientCG,
    ...godotLib,
    ...gameIcons,
  ].filter((item) =>
    item.hosting_policy !== 'external_link_only'
    && item.license_tier !== 'tier4_external_only'
    && ALLOWED_COMMERCIAL_LICENSES.has(item.license)
  );

  const byCategory = {};
  const byLicense = {};
  const bySource = {};
  const byTier = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byLicense[item.license] = (byLicense[item.license] || 0) + 1;
    bySource[item.source_provider] = (bySource[item.source_provider] || 0) + 1;
    const tier = item.license_tier || 'tier1_cc0';
    byTier[tier] = (byTier[tier] || 0) + 1;
  }

  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    total: items.length,
    license_policy: 'PlayForge Commercial Game & PlayHub Distribution Policy: ONLY licenses cleared for commercial games created in PlayForge and distributed on PlayHub (CC0-1.0, Unlicense, MIT, Apache-2.0, BSD-3-Clause, Zlib, CC-BY-3.0/4.0 with Third-Party Notices.txt, SIL OFL-1.1 fonts). Excludes Custom-No-Redist, external-link-only, GPL/LGPL/AGPL/MPL, CC-BY-SA, CC-BY-NC, and CC-BY-ND.',
    external_attributions: [
      'Powered by Poly Haven (https://polyhaven.com/)',
      'Powered by ambientCG (https://ambientcg.com/)',
      'Godot Official Asset Library (https://godotengine.org/asset-library/asset)',
      'Game-Icons.net (https://game-icons.net/ — CC-BY-3.0)'
    ],
    stats: { byCategory, byLicense, bySource, byTier },
    items,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  // Compact JSON keeps 11,800+ catalog fast to load (~12 MB)
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  const mb = (fs.statSync(OUT_FILE).size / (1024 * 1024)).toFixed(2);
  console.log(`\n=== COLLECTION COMPLETE in ${((Date.now() - started) / 1000).toFixed(1)}s ===`);
  console.log(`Saved ${items.length} license-verified items to ${OUT_FILE} (${mb} MB)`);
  console.log('By Tier:', byTier);
  console.log('By Source:', bySource);
  console.log('By License:', byLicense);
  console.log('By Category:', byCategory);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
