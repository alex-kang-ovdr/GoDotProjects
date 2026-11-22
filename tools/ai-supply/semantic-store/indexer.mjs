// N4 — 11,826 Open Asset Bilingual Hybrid Search Indexer
// Pure Node 24 ESM (zero external dependencies)
// Combines:
//   1. Bidirectional KO<->EN domain lexicon expansion (with Hangul compound splitting)
//   2. Field-weighted BM25 inverted index (title, summary, tags, category, formats, source_provider)
//   3. Deterministic hashed n-gram + concept dense vector similarity (Float32Array, Int8-serializable)
//   4. Reciprocal Rank Fusion (RRF) + strict faceted filters (licenseTiers, noAiOnly, excludeExternalOnly, categories)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG_PATH = resolve(__dirname, '../../../store/data/collected-catalog.json');

export const NO_AI_DISCLOSURE = 'No generative AI used';
export const VECTOR_DIM = 64;

// Bidirectional concept groups: every term in a group maps to all sibling terms
// and shares a canonical concept ID for dense semantic alignment.
export const BILINGUAL_CONCEPT_GROUPS = Object.freeze([
  { id: 'cyberpunk', ko: ['사이버펑크', '네온', '미래', '공상과학', '사이버', '레이저', '홀로그램'], en: ['cyberpunk', 'neon', 'scifi', 'futuristic', 'cyber', 'laser', 'glow', 'synthwave', 'hologram'] },
  { id: 'stone', ko: ['돌', '석재', '조약돌', '바위', '자갈', '대리석', '콘크리트', '화강암'], en: ['stone', 'cobblestone', 'rock', 'pebble', 'marble', 'concrete', 'granite', 'slate', 'gravel'] },
  { id: 'floor', ko: ['바닥', '포장', '타일', '보도', '길', '도로', '아스팔트'], en: ['floor', 'pavement', 'tile', 'tiles', 'ground', 'road', 'asphalt', 'paving', 'cobblestone'] },
  { id: 'medieval', ko: ['중세', '성', '성채', '던전', '판타지', '왕국', '고대', '유적'], en: ['medieval', 'castle', 'fortress', 'dungeon', 'fantasy', 'kingdom', 'ancient', 'ruins'] },
  { id: 'wood', ko: ['나무', '숲', '목재', '판자', '통나무', '껍질', '식물', '자연'], en: ['wood', 'tree', 'forest', 'planks', 'timber', 'bark', 'log', 'foliage', 'nature'] },
  { id: 'sky', ko: ['하늘', '밤', '야경', '스카이박스', '조명', '일몰', '노을', '구름', '별'], en: ['sky', 'night', 'hdri', 'skybox', 'lighting', 'sunset', 'evening', 'clouds', 'stars', 'dusk'] },
  { id: 'ui', ko: ['아이콘', '인터페이스', '버튼', '메뉴', '테마', '패널', '배지', '심볼'], en: ['icon', 'icons', 'ui', 'interface', 'button', 'menu', 'hud', 'theme', 'badge', 'gui'] },
  { id: 'audio', ko: ['소리', '효과음', '오디오', '사운드', '음악', '배경음', '타격음', '발소리'], en: ['audio', 'sfx', 'sound', 'sounds', 'music', 'bgm', 'impact', 'footstep', 'foley'] },
  { id: 'character', ko: ['캐릭터', '기사', '모험가', '영웅', '전사', '마법사', '도적', '해골', '몬스터'], en: ['character', 'knight', 'adventurer', 'hero', 'warrior', 'mage', 'rogue', 'skeleton', 'monster', 'npc'] },
  { id: 'water', ko: ['물', '바다', '강', '호수', '비', '빗물', '젖은', '웅덩이', '액체'], en: ['water', 'ocean', 'sea', 'river', 'lake', 'rain', 'wet', 'puddle', 'liquid'] },
  { id: 'metal', ko: ['금속', '강철', '철', '녹', '구리', '청동', '황금', '은', '알루미늄'], en: ['metal', 'steel', 'iron', 'rust', 'copper', 'bronze', 'gold', 'silver', 'chrome', 'aluminum'] },
  { id: 'wall', ko: ['벽', '벽돌', '담장', '기둥', '아치', '건축', '건물', '도시', '골목', '거리'], en: ['wall', 'brick', 'bricks', 'pillar', 'arch', 'building', 'architecture', 'city', 'alley', 'street'] },
  { id: 'weapon', ko: ['무기', '검', '칼', '방패', '도끼', '활', '지팡이', '총', '장비'], en: ['weapon', 'sword', 'blade', 'shield', 'axe', 'bow', 'staff', 'gun', 'equipment', 'armor'] },
  { id: 'terrain', ko: ['풀', '잔디', '땅', '흙', '진흙', '모래', '사막', '눈', '얼음', '겨울'], en: ['grass', 'turf', 'dirt', 'soil', 'mud', 'sand', 'desert', 'snow', 'ice', 'winter', 'terrain'] },
  { id: 'magic', ko: ['불', '화염', '용암', '마법', '주문', '번개', '에너지', '빛', '이펙트', '셰이더'], en: ['fire', 'flame', 'lava', 'magic', 'spell', 'lightning', 'energy', 'light', 'vfx', 'shader'] },
  { id: 'arena', ko: ['아레나', '경기장', '전투', '전장', '스테이지', '맵', '환경', '소품', '프롭'], en: ['arena', 'stadium', 'battle', 'combat', 'stage', 'environment', 'prop', 'props', 'modular'] },
  { id: 'robot', ko: ['로봇', '기계', '메카', '드론', '우주', '공장', '엔진'], en: ['robot', 'mech', 'machine', 'drone', 'space', 'factory', 'industrial', 'tech'] },
  { id: 'fabric', ko: ['천', '직물', '가죽', '카펫', '옷', '망토', '깃발'], en: ['fabric', 'cloth', 'leather', 'carpet', 'textile', 'wool', 'linen'] },
  { id: 'horror', ko: ['공포', '어둠', '어두운', '유령', '음산한', '좀비', '피'], en: ['horror', 'dark', 'spooky', 'ghost', 'creepy', 'zombie', 'scary'] },
  { id: 'godot', ko: ['고도', '애드온', '플러그인', '도구', '스크립트', '에디터', '카메라', '물리'], en: ['godot', 'addon', 'plugin', 'tool', 'tools', 'script', 'editor', 'camera', 'physics'] },
]);

// Build fast lookup maps for bilingual expansion and concept alignment.
const TERM_TO_GROUPS = new Map();
const KO_LEXICON_KEYS = [];

for (const group of BILINGUAL_CONCEPT_GROUPS) {
  for (const k of group.ko) {
    if (!TERM_TO_GROUPS.has(k)) TERM_TO_GROUPS.set(k, []);
    TERM_TO_GROUPS.get(k).push(group);
    KO_LEXICON_KEYS.push(k);
  }
  for (const e of group.en) {
    if (!TERM_TO_GROUPS.has(e)) TERM_TO_GROUPS.set(e, []);
    TERM_TO_GROUPS.get(e).push(group);
  }
}
// Sort Hangul keys longest-first for greedy compound matching (e.g. 사이버펑크 before 사이버)
KO_LEXICON_KEYS.sort((a, b) => b.length - a.length);
const UNIQUE_KO_KEYS = [...new Set(KO_LEXICON_KEYS)];

export const BILINGUAL_LEXICON = Object.freeze(
  Object.fromEntries(
    [...TERM_TO_GROUPS.entries()].map(([term, groups]) => {
      const siblings = new Set();
      for (const g of groups) {
        for (const t of g.ko) if (t !== term) siblings.add(t);
        for (const t of g.en) if (t !== term) siblings.add(t);
      }
      return [term, [...siblings]];
    })
  )
);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'are', 'was',
  'were', 'have', 'has', 'use', 'used', 'using', 'can', 'all', 'its', 'our', 'via',
  'of', 'in', 'to', 'on', 'at', 'by', 'as', 'or', 'an', 'is', 'be', 'it', 'a',
  '및', '의', '을', '를', '이', '가', '은', '는', '에', '로', '으로', '와', '과', '도', '수', '있는', '위한', '만들어줘', '만들어', '찾아줘',
]);

function lightStemEn(word) {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && !word.endsWith('ses') && word.length > 5) {
    if (/(ch|sh|x|z|s)es$/.test(word)) return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

function splitCamelAndSeparators(text) {
  return String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
}

export function tokenizeText(text) {
  if (!text) return [];
  const prepared = splitCamelAndSeparators(text).toLowerCase();
  const rawTokens = prepared.match(/[가-힣]{1,}|[a-z0-9]{2,}/g);
  if (!rawTokens) return [];
  const out = [];
  for (const tok of rawTokens) {
    if (STOPWORDS.has(tok)) continue;
    if (/^[a-z]/.test(tok)) {
      const stemmed = lightStemEn(tok);
      out.push(stemmed);
      if (stemmed !== tok) out.push(tok);
    } else if (/^[가-힣]+$/.test(tok)) {
      out.push(tok);
      // Decompose Hangul compound nouns against domain lexicon keys (e.g. "돌바닥" -> "돌", "바닥")
      if (tok.length >= 2 && !TERM_TO_GROUPS.has(tok)) {
        for (const key of UNIQUE_KO_KEYS) {
          if (key.length < tok.length && tok.includes(key)) {
            out.push(key);
          }
        }
      }
    } else {
      out.push(tok);
    }
  }
  return out;
}

export function expandBilingualTerms(tokens) {
  const original = new Set();
  const expanded = new Set();
  const concepts = new Set();

  for (const tok of tokens) {
    if (!tok) continue;
    original.add(tok);
    const groups = TERM_TO_GROUPS.get(tok);
    if (groups) {
      for (const g of groups) {
        concepts.add(g.id);
        for (const e of g.en) {
          if (!original.has(e)) expanded.add(e);
        }
        for (const k of g.ko) {
          if (!original.has(k)) expanded.add(k);
        }
      }
    }
  }

  return {
    original: [...original],
    expanded: [...expanded],
    concepts: [...concepts],
  };
}

// Fast 32-bit FNV-1a hash
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function accumulateHashFeature(vec, offset, dim, key, weight) {
  const h = fnv1a32(key);
  const bucket = h & (dim - 1); // dim is power of 2 (64)
  const sign = (h & 0x10000) ? 1 : -1;
  vec[offset + bucket] += sign * weight;
}

function normalizeVectorSlice(vec, offset, dim) {
  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    const v = vec[offset + i];
    normSq += v * v;
  }
  if (normSq > 1e-12) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < dim; i++) {
      vec[offset + i] *= inv;
    }
  }
}

export function encodeDenseVector(tokens, concepts = [], target = null, offset = 0, dim = VECTOR_DIM) {
  const vec = target || new Float32Array(dim);
  // 1. Concept bucket projection (strong cross-lingual alignment)
  for (const c of concepts) {
    accumulateHashFeature(vec, offset, dim, `c:${c}`, 2.6);
    accumulateHashFeature(vec, offset, dim, `c2:${c}`, 1.8);
  }
  // 2. Token + character 3-gram projection
  for (const tok of tokens) {
    if (!tok) continue;
    accumulateHashFeature(vec, offset, dim, `t:${tok}`, 1.4);
    if (tok.length >= 3 && tok.length <= 24) {
      const padded = `^${tok}$`;
      for (let i = 0; i <= padded.length - 3; i++) {
        accumulateHashFeature(vec, offset, dim, `g:${padded.slice(i, i + 3)}`, 0.45);
      }
    }
  }
  normalizeVectorSlice(vec, offset, dim);
  return vec;
}

export function hasLocalBundle(item) {
  return Array.isArray(item?.local_bundle_files) && item.local_bundle_files.length > 0;
}

export function needsExternalHydration(item) {
  if (hasLocalBundle(item)) return false;
  if (item?.license_tier === 'tier4_external_only') return false;
  if (item?.hosting_policy === 'external_only') return false;
  return Boolean(item?.download_url || item?.external_download_url || item?.source_url);
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || raw.entries || []);
  return {
    meta: Array.isArray(raw)
      ? { total: items.length, schema_version: 1 }
      : {
          schema_version: raw.schema_version ?? 1,
          generated_at: raw.generated_at ?? null,
          total: raw.total ?? items.length,
          license_policy: raw.license_policy ?? null,
        },
    items,
  };
}

function extractItemFieldTokens(item) {
  const manifestNames = Array.isArray(item.file_manifest)
    ? item.file_manifest.slice(0, 12).map((f) => {
        const p = String(f?.path || '');
        const idx = p.lastIndexOf('/');
        return idx >= 0 ? p.slice(idx + 1) : p;
      }).join(' ')
    : '';

  return [
    { weight: 3.2, tokens: tokenizeText(item.title) },
    { weight: 2.6, tokens: tokenizeText(Array.isArray(item.tags) ? item.tags.join(' ') : '') },
    { weight: 1.8, tokens: tokenizeText(item.category) },
    { weight: 1.2, tokens: tokenizeText(item.summary) },
    { weight: 1.0, tokens: tokenizeText(Array.isArray(item.formats) ? item.formats.join(' ') : '') },
    { weight: 1.0, tokens: tokenizeText(item.source_provider) },
    { weight: 0.6, tokens: tokenizeText(manifestNames) },
  ];
}

export function buildHybridIndex(items, options = {}) {
  const startedAt = performance.now();
  const dim = options.vectorDim || VECTOR_DIM;
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const n = items.length;

  const docLengths = new Float32Array(n);
  const denseMatrix = new Float32Array(n * dim);
  const postingsBuilder = new Map(); // term -> Array<number> [docIdx, weightedTf, ...]

  // Compact metadata table for ultra-fast faceted filtering
  const meta = new Array(n);
  let totalDocLen = 0;

  for (let docIdx = 0; docIdx < n; docIdx++) {
    const item = items[docIdx];
    const fields = extractItemFieldTokens(item);
    const termWeights = new Map();
    const docConcepts = new Set();
    let docLen = 0;

    for (const { weight, tokens } of fields) {
      for (const tok of tokens) {
        docLen += weight;
        termWeights.set(tok, (termWeights.get(tok) || 0) + weight);
        const groups = TERM_TO_GROUPS.get(tok);
        if (groups) {
          for (const g of groups) docConcepts.add(g.id);
        }
      }
    }

    docLengths[docIdx] = docLen;
    totalDocLen += docLen;

    const uniqueTerms = [...termWeights.keys()];
    for (const [term, tf] of termWeights.entries()) {
      let arr = postingsBuilder.get(term);
      if (!arr) {
        arr = [];
        postingsBuilder.set(term, arr);
      }
      arr.push(docIdx, tf);
    }

    encodeDenseVector(uniqueTerms, [...docConcepts], denseMatrix, docIdx * dim, dim);

    meta[docIdx] = {
      asset_id: item.asset_id,
      category: String(item.category || ''),
      categoryLower: String(item.category || '').toLowerCase(),
      license_tier: String(item.license_tier || ''),
      hosting_policy: String(item.hosting_policy || ''),
      ai_disclosure: String(item.ai_disclosure || ''),
      source_provider: String(item.source_provider || ''),
      hasLocalBundle: hasLocalBundle(item),
      needsExternalHydration: needsExternalHydration(item),
    };
  }

  const avgDocLen = n > 0 ? totalDocLen / n : 1;

  // Pack postings into typed arrays (docIds: Uint32Array, tfs: Float32Array) + precomputed IDF
  const postings = new Map();
  for (const [term, pairs] of postingsBuilder.entries()) {
    const df = pairs.length / 2;
    const docIds = new Uint32Array(df);
    const tfs = new Float32Array(df);
    for (let i = 0; i < df; i++) {
      docIds[i] = pairs[i * 2];
      tfs[i] = pairs[i * 2 + 1];
    }
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    postings.set(term, { df, idf, docIds, tfs });
  }

  return {
    version: 1,
    dim,
    k1,
    b,
    n,
    avgDocLen,
    buildMs: +(performance.now() - startedAt).toFixed(2),
    vocabularySize: postings.size,
    items,
    meta,
    docLengths,
    denseMatrix,
    postings,
  };
}

export function serializeIndex(index) {
  // Quantize Float32Array denseMatrix [-1, 1] -> Int8Array [-127, 127] for compact storage
  const quantized = new Int8Array(index.denseMatrix.length);
  for (let i = 0; i < index.denseMatrix.length; i++) {
    const clamped = Math.max(-1, Math.min(1, index.denseMatrix[i]));
    quantized[i] = Math.round(clamped * 127);
  }
  const postingsObj = {};
  for (const [term, p] of index.postings.entries()) {
    const flat = new Array(p.df * 2);
    for (let i = 0; i < p.df; i++) {
      flat[i * 2] = p.docIds[i];
      flat[i * 2 + 1] = Math.round(p.tfs[i] * 100) / 100;
    }
    postingsObj[term] = flat;
  }
  return {
    version: index.version,
    dim: index.dim,
    k1: index.k1,
    b: index.b,
    n: index.n,
    avgDocLen: index.avgDocLen,
    docLengths: Array.from(index.docLengths, (v) => Math.round(v * 100) / 100),
    denseInt8Base64: Buffer.from(quantized.buffer).toString('base64'),
    postings: postingsObj,
  };
}

export function deserializeIndex(serialized, items) {
  if (!serialized || serialized.n !== items.length) {
    throw new Error(`Serialized index mismatch: expected ${serialized?.n} items, got ${items.length}`);
  }
  const { version, dim, k1, b, n, avgDocLen } = serialized;
  const docLengths = Float32Array.from(serialized.docLengths);
  const rawBuf = Buffer.from(serialized.denseInt8Base64, 'base64');
  const int8 = new Int8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const denseMatrix = new Float32Array(int8.length);
  for (let i = 0; i < int8.length; i++) {
    denseMatrix[i] = int8[i] / 127;
  }
  const postings = new Map();
  for (const [term, flat] of Object.entries(serialized.postings)) {
    const df = flat.length / 2;
    const docIds = new Uint32Array(df);
    const tfs = new Float32Array(df);
    for (let i = 0; i < df; i++) {
      docIds[i] = flat[i * 2];
      tfs[i] = flat[i * 2 + 1];
    }
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    postings.set(term, { df, idf, docIds, tfs });
  }
  const meta = items.map((item) => ({
    asset_id: item.asset_id,
    category: String(item.category || ''),
    categoryLower: String(item.category || '').toLowerCase(),
    license_tier: String(item.license_tier || ''),
    hosting_policy: String(item.hosting_policy || ''),
    ai_disclosure: String(item.ai_disclosure || ''),
    source_provider: String(item.source_provider || ''),
    hasLocalBundle: hasLocalBundle(item),
    needsExternalHydration: needsExternalHydration(item),
  }));
  return {
    version,
    dim,
    k1,
    b,
    n,
    avgDocLen,
    buildMs: 0,
    vocabularySize: postings.size,
    items,
    meta,
    docLengths,
    denseMatrix,
    postings,
  };
}

function buildFilterMask(index, {
  licenseTiers = null,
  noAiOnly = true,
  excludeExternalOnly = true,
  categories = null,
  providers = null,
  hasLocalBundleOnly = false,
}) {
  const tierSet = Array.isArray(licenseTiers) && licenseTiers.length > 0 ? new Set(licenseTiers) : null;
  const catFilters = Array.isArray(categories) && categories.length > 0
    ? categories.map((c) => String(c).toLowerCase())
    : null;
  const providerSet = Array.isArray(providers) && providers.length > 0
    ? new Set(providers.map((p) => String(p).toLowerCase()))
    : null;

  const mask = new Uint8Array(index.n);
  let allowedCount = 0;

  for (let i = 0; i < index.n; i++) {
    const m = index.meta[i];
    if (noAiOnly && m.ai_disclosure !== NO_AI_DISCLOSURE) continue;
    if (excludeExternalOnly && (m.license_tier === 'tier4_external_only' || m.hosting_policy === 'external_only')) continue;
    if (tierSet && !tierSet.has(m.license_tier)) continue;
    if (hasLocalBundleOnly && !m.hasLocalBundle) continue;
    if (catFilters && !catFilters.some((cf) => m.categoryLower === cf || m.categoryLower.includes(cf))) continue;
    if (providerSet && !providerSet.has(m.source_provider.toLowerCase())) continue;
    mask[i] = 1;
    allowedCount++;
  }
  return { mask, allowedCount };
}

export function searchHybrid(index, options = {}) {
  const startedAt = performance.now();
  const {
    query = '',
    licenseTiers = null,
    noAiOnly = true,
    excludeExternalOnly = true,
    categories = null,
    providers = null,
    hasLocalBundleOnly = false,
    limit = 20,
    offset = 0,
    rrfK = 60,
    bm25Weight = 1.0,
    denseWeight = 0.85,
  } = typeof options === 'string' ? { query: options } : options;

  const { mask, allowedCount } = buildFilterMask(index, {
    licenseTiers,
    noAiOnly,
    excludeExternalOnly,
    categories,
    providers,
    hasLocalBundleOnly,
  });

  const rawTokens = tokenizeText(query);
  const { original, expanded, concepts } = expandBilingualTerms(rawTokens);

  // Pure facet browse when no query terms exist
  if (original.length === 0) {
    const results = [];
    let seen = 0;
    for (let i = 0; i < index.n && results.length < limit; i++) {
      if (!mask[i]) continue;
      if (seen++ < offset) continue;
      results.push(formatResult(index, i, 1, 1, 0, 0));
    }
    return {
      query,
      originalTerms: [],
      expandedTerms: [],
      concepts: [],
      totalMatched: allowedCount,
      tookMs: +(performance.now() - startedAt).toFixed(3),
      results,
    };
  }

  // Stage 1: BM25 scoring over posting lists of original (1.0x) and expanded (0.65x) terms
  const bm25Scores = new Float32Array(index.n);
  const bm25Touched = [];
  const k1 = index.k1;
  const b = index.b;
  const avgdl = index.avgDocLen;
  const docLengths = index.docLengths;

  const scoreTerm = (term, termBoost) => {
    const posting = index.postings.get(term);
    if (!posting) return;
    const { idf, docIds, tfs } = posting;
    const idfBoost = idf * termBoost;
    for (let i = 0; i < docIds.length; i++) {
      const docIdx = docIds[i];
      if (!mask[docIdx]) continue;
      const tf = tfs[i];
      const denom = tf + k1 * (1 - b + b * (docLengths[docIdx] / avgdl));
      const add = idfBoost * ((tf * (k1 + 1)) / denom);
      if (bm25Scores[docIdx] === 0) bm25Touched.push(docIdx);
      bm25Scores[docIdx] += add;
    }
  };

  for (const term of original) scoreTerm(term, 1.0);
  for (const term of expanded) scoreTerm(term, 0.62);

  // Sort BM25 hits descending
  bm25Touched.sort((a, c) => bm25Scores[c] - bm25Scores[a]);
  const poolSize = Math.max((limit + offset) * 6, 150);
  const topBm25 = bm25Touched.slice(0, poolSize);

  // Stage 2: Dense hashed n-gram + concept similarity over allowed docs
  const queryVec = encodeDenseVector([...original, ...expanded.slice(0, 24)], concepts, null, 0, index.dim);
  const dim = index.dim;
  const matrix = index.denseMatrix;
  const denseScores = new Float32Array(index.n);

  // Track top-poolSize dense hits via a lightweight min-threshold scan
  const denseTop = [];
  let minDenseInTop = 0.05; // ignore near-zero noise

  for (let docIdx = 0; docIdx < index.n; docIdx++) {
    if (!mask[docIdx]) continue;
    const base = docIdx * dim;
    let dot = 0;
    for (let d = 0; d < dim; d += 4) {
      dot +=
        matrix[base + d] * queryVec[d] +
        matrix[base + d + 1] * queryVec[d + 1] +
        matrix[base + d + 2] * queryVec[d + 2] +
        matrix[base + d + 3] * queryVec[d + 3];
    }
    denseScores[docIdx] = dot;
    if (dot > minDenseInTop) {
      denseTop.push(docIdx);
    }
  }

  denseTop.sort((a, c) => denseScores[c] - denseScores[a]);
  const topDense = denseTop.slice(0, poolSize);

  // Stage 3: Reciprocal Rank Fusion (RRF)
  const rrfMap = new Map();
  for (let rank = 0; rank < topBm25.length; rank++) {
    const docIdx = topBm25[rank];
    rrfMap.set(docIdx, bm25Weight / (rrfK + rank + 1));
  }
  for (let rank = 0; rank < topDense.length; rank++) {
    const docIdx = topDense[rank];
    rrfMap.set(docIdx, (rrfMap.get(docIdx) || 0) + denseWeight / (rrfK + rank + 1));
  }

  // Slight tie-breaker favoring direct BM25 matches + higher dense cosine
  const fused = [...rrfMap.entries()].map(([docIdx, rrfScore]) => {
    const bm25 = bm25Scores[docIdx];
    const dense = denseScores[docIdx];
    const score = rrfScore + (bm25 > 0 ? 0.002 : 0) + Math.max(0, dense) * 0.001;
    return { docIdx, score, rrfScore, bm25, dense };
  });

  fused.sort((a, c) => c.score - a.score || c.bm25 - a.bm25 || c.dense - a.dense);

  const page = fused.slice(offset, offset + limit);
  const results = page.map(({ docIdx, score, rrfScore, bm25, dense }) =>
    formatResult(index, docIdx, score, rrfScore, bm25, dense)
  );

  return {
    query,
    originalTerms: original,
    expandedTerms: expanded,
    concepts,
    totalMatched: Math.max(bm25Touched.length, fused.length),
    tookMs: +(performance.now() - startedAt).toFixed(3),
    results,
  };
}

function formatResult(index, docIdx, score, rrfScore, bm25Score, denseScore) {
  const item = index.items[docIdx];
  const m = index.meta[docIdx];
  return {
    asset_id: item.asset_id,
    title: item.title,
    category: item.category,
    license: item.license,
    license_tier: item.license_tier,
    ai_disclosure: item.ai_disclosure,
    source_provider: item.source_provider,
    source_url: item.source_url,
    thumbnail_url: item.thumbnail_url || '',
    hasLocalBundle: m.hasLocalBundle,
    needsExternalHydration: m.needsExternalHydration,
    score: +score.toFixed(6),
    rrfScore: +rrfScore.toFixed(6),
    bm25Score: +bm25Score.toFixed(4),
    denseScore: +denseScore.toFixed(4),
    item,
  };
}

export function loadAndBuildDefaultIndex(catalogPath = DEFAULT_CATALOG_PATH, options = {}) {
  const { meta, items } = loadCatalog(catalogPath);
  const index = buildHybridIndex(items, options);
  index.catalogMeta = meta;
  return index;
}
