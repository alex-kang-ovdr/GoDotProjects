'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const MAX_GLB_BYTES = 64 * 1024 * 1024; // Tripo high-poly PBR GLBs can be 10-40 MB
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

function pad4(buf, padByte = 0x00) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, padByte)]);
}

function validateGlbBuffer(buffer, options = {}) {
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_GLB_BYTES;
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('GLB artifact must be a Buffer');
  }
  if (buffer.length < 20) {
    throw new Error(`GLB artifact is too small (${buffer.length} bytes)`);
  }
  if (buffer.length > maxBytes) {
    throw new Error(`GLB artifact exceeds ${maxBytes} byte limit (actual=${buffer.length})`);
  }

  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (magic !== GLB_MAGIC) {
    throw new Error('Invalid GLB header magic (expected "glTF")');
  }
  if (version !== 2) {
    throw new Error(`Unsupported glTF binary version: ${version} (expected 2)`);
  }
  if (declaredLength !== buffer.length) {
    throw new Error(`GLB length mismatch (header=${declaredLength}, actual=${buffer.length})`);
  }

  let offset = 12;
  let gltfJson = null;
  let hasBinChunk = false;
  let binBytes = 0;

  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLength > buffer.length) {
      throw new Error('Truncated GLB chunk');
    }
    const chunkData = buffer.subarray(offset, offset + chunkLength);
    if (chunkType === GLB_CHUNK_JSON) {
      try {
        gltfJson = JSON.parse(chunkData.toString('utf8'));
      } catch (err) {
        throw new Error(`Invalid glTF JSON chunk: ${err.message}`);
      }
    } else if (chunkType === GLB_CHUNK_BIN) {
      hasBinChunk = true;
      binBytes = chunkLength;
    }
    offset += chunkLength;
  }

  if (!gltfJson || typeof gltfJson !== 'object') {
    throw new Error('GLB missing JSON chunk');
  }
  if (!gltfJson.asset || !String(gltfJson.asset.version || '').startsWith('2')) {
    throw new Error(`Unsupported glTF asset version: ${gltfJson.asset?.version || 'missing'}`);
  }

  const meshes = Array.isArray(gltfJson.meshes) ? gltfJson.meshes : [];
  const nodes = Array.isArray(gltfJson.nodes) ? gltfJson.nodes : [];
  const accessors = Array.isArray(gltfJson.accessors) ? gltfJson.accessors : [];
  const materials = Array.isArray(gltfJson.materials) ? gltfJson.materials : [];
  const textures = Array.isArray(gltfJson.textures) ? gltfJson.textures : [];
  const images = Array.isArray(gltfJson.images) ? gltfJson.images : [];
  const skins = Array.isArray(gltfJson.skins) ? gltfJson.skins : [];
  const animations = Array.isArray(gltfJson.animations) ? gltfJson.animations : [];
  const extensionsUsed = Array.isArray(gltfJson.extensionsUsed) ? gltfJson.extensionsUsed : [];

  if (meshes.length === 0) {
    throw new Error('GLB contains no meshes');
  }
  if (nodes.length === 0) {
    throw new Error('GLB contains no nodes');
  }

  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  const minB = [Infinity, Infinity, Infinity];
  const maxB = [-Infinity, -Infinity, -Infinity];

  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      primitiveCount += 1;
      const posAccIdx = prim.attributes?.POSITION;
      if (typeof posAccIdx === 'number' && accessors[posAccIdx]) {
        const posAcc = accessors[posAccIdx];
        vertexCount += Number(posAcc.count) || 0;
        if (Array.isArray(posAcc.min) && posAcc.min.length === 3 && Array.isArray(posAcc.max) && posAcc.max.length === 3) {
          for (let a = 0; a < 3; a++) {
            minB[a] = Math.min(minB[a], Number(posAcc.min[a]));
            maxB[a] = Math.max(maxB[a], Number(posAcc.max[a]));
          }
        }
      }
      if (typeof prim.indices === 'number' && accessors[prim.indices]) {
        const idxCount = Number(accessors[prim.indices].count) || 0;
        triangleCount += Math.floor(idxCount / 3);
      } else if (typeof posAccIdx === 'number' && accessors[posAccIdx]) {
        triangleCount += Math.floor((Number(accessors[posAccIdx].count) || 0) / 3);
      }
    }
  }

  let boneCount = 0;
  for (const skin of skins) {
    if (Array.isArray(skin.joints)) {
      boneCount = Math.max(boneCount, skin.joints.length);
    }
  }
  const animationNames = animations.map((anim, i) => String(anim.name || `anim_${i}`));
  const hasPbr = materials.some(m => Boolean(m && m.pbrMetallicRoughness));

  const boundingBox = Number.isFinite(minB[0])
    ? {
      min: minB.map(v => Number(v.toFixed(4))),
      max: maxB.map(v => Number(v.toFixed(4))),
      size: [0, 1, 2].map(i => Number((maxB[i] - minB[i]).toFixed(4))),
    }
    : null;

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const recommendations = [];
  if (triangleCount > 50000) {
    recommendations.push('폴리곤이 50,000 삼각형을 초과합니다. 웹/모바일 게임 배치 전 [최적화/변환]으로 10,000~20,000 수준으로 감축하세요.');
  } else if (triangleCount > 25000) {
    recommendations.push('모바일 환경에서 더 부드러운 성능을 위해 15,000 이하로 리토폴로지(Convert)를 권장합니다.');
  }
  if (!hasPbr) {
    recommendations.push('PBR 머티리얼이 감지되지 않았습니다. Tripo 생성 시 PBR 옵션을 활성화해 보세요.');
  }
  if (buffer.length > 12 * 1024 * 1024) {
    recommendations.push(`파일 크기(${(buffer.length / (1024 * 1024)).toFixed(1)} MB)가 큽니다. 웹 배포 전 텍스처/폴리곤 최적화를 권장합니다.`);
  }

  const grade = triangleCount <= 25000 && buffer.length <= 12 * 1024 * 1024 && hasPbr
    ? 'A'
    : (triangleCount <= 65000 && buffer.length <= 32 * 1024 * 1024 ? 'B' : 'C');

  return {
    valid: true,
    format: 'GLB',
    gltfVersion: String(gltfJson.asset.version),
    generator: String(gltfJson.asset.generator || ''),
    bytes: buffer.length,
    binBytes,
    hasBinChunk,
    sha256,
    meshCount: meshes.length,
    primitiveCount,
    nodeCount: nodes.length,
    vertexCount,
    triangleCount,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    skinCount: skins.length,
    boneCount,
    animationCount: animations.length,
    animationNames,
    extensionsUsed,
    boundingBox,
    gameReadiness: {
      grade,
      webReady: triangleCount <= 50000 && buffer.length <= 24 * 1024 * 1024,
      mobileReady: triangleCount <= 20000 && buffer.length <= 8 * 1024 * 1024,
      hasPbr,
      hasTextures: textures.length > 0,
      hasRig: skins.length > 0,
      hasAnimation: animations.length > 0,
      recommendations,
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (zero external dependencies) for procedural PBR textures
// ---------------------------------------------------------------------------
const CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowStride = width * 4;
  const raw = Buffer.alloc((rowStride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowStride + 1)] = 0; // filter None
    rgba.copy(raw, y * (rowStride + 1) + 1, y * rowStride, (y + 1) * rowStride);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgbBytes(hex) {
  const clean = String(hex || '#7c8aa5').replace('#', '');
  const full = clean.length === 3
    ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
    : clean.padEnd(6, '8').slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [124, 138, 165];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function createStylizedPbrTexturePng(primaryHex, accentHex, seed = 42) {
  const size = 32;
  const [r1, g1, b1] = hexToRgbBytes(primaryHex);
  const [r2, g2, b2] = hexToRgbBytes(accentHex);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const border = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      const stripe = ((x + y + (seed % 7)) % 16) < 2;
      const grad = 0.86 + 0.22 * (y / size);
      const mix = border ? 0.65 : (stripe ? 0.3 : 0.0);
      rgba[idx] = Math.max(0, Math.min(255, Math.round((r1 * (1 - mix) + r2 * mix) * grad)));
      rgba[idx + 1] = Math.max(0, Math.min(255, Math.round((g1 * (1 - mix) + g2 * mix) * grad)));
      rgba[idx + 2] = Math.max(0, Math.min(255, Math.round((b1 * (1 - mix) + b2 * mix) * grad)));
      rgba[idx + 3] = 255;
    }
  }
  return encodeRgbaPng(size, size, rgba);
}

// ---------------------------------------------------------------------------
// Geometry primitives with positions, normals, UVs, and optional bone index
// ---------------------------------------------------------------------------
function makeBoxGeometry(cx, cy, cz, sx, sy, sz, boneIndex = 0) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
  ];
  const positions = [];
  const normals = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const indices = [];
  let vBase = 0;

  for (const f of faces) {
    const faceUv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      positions.push(f.v[i][0] + cx, f.v[i][1] + cy, f.v[i][2] + cz);
      normals.push(f.n[0], f.n[1], f.n[2]);
      uvs.push(faceUv[i][0], faceUv[i][1]);
      joints.push(boneIndex, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    vBase += 4;
  }
  return { positions, normals, uvs, joints, weights, indices };
}

function makeOctaPrismGeometry(cx, cy, cz, rBottom, rTop, height, segments = 10, boneIndex = 0) {
  const seg = Math.max(4, Math.min(32, Math.round(segments)));
  const hy = height / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const indices = [];

  const pushVert = (x, y, z, nx, ny, nz, u, v) => {
    const idx = positions.length / 3;
    positions.push(x + cx, y + cy, z + cz);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(u, v);
    joints.push(boneIndex, 0, 0, 0);
    weights.push(1, 0, 0, 0);
    return idx;
  };

  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const slope = (rBottom - rTop) / Math.max(0.001, height);

    const i0 = pushVert(c0 * rBottom, -hy, s0 * rBottom, c0, slope, s0, i / seg, 0);
    const i1 = pushVert(c1 * rBottom, -hy, s1 * rBottom, c1, slope, s1, (i + 1) / seg, 0);
    const i2 = pushVert(c1 * rTop, hy, s1 * rTop, c1, slope, s1, (i + 1) / seg, 1);
    const i3 = pushVert(c0 * rTop, hy, s0 * rTop, c0, slope, s0, i / seg, 1);
    indices.push(i0, i2, i1, i0, i3, i2);
  }

  // Top cap
  if (rTop > 0.001) {
    const topCenter = pushVert(0, hy, 0, 0, 1, 0, 0.5, 0.5);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = pushVert(Math.cos(a0) * rTop, hy, Math.sin(a0) * rTop, 0, 1, 0, 0.5 + 0.5 * Math.cos(a0), 0.5 + 0.5 * Math.sin(a0));
      const p1 = pushVert(Math.cos(a1) * rTop, hy, Math.sin(a1) * rTop, 0, 1, 0, 0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1));
      indices.push(topCenter, p1, p0);
    }
  }

  // Bottom cap
  if (rBottom > 0.001) {
    const botCenter = pushVert(0, -hy, 0, 0, -1, 0, 0.5, 0.5);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = pushVert(Math.cos(a0) * rBottom, -hy, Math.sin(a0) * rBottom, 0, -1, 0, 0.5 + 0.5 * Math.cos(a0), 0.5 + 0.5 * Math.sin(a0));
      const p1 = pushVert(Math.cos(a1) * rBottom, -hy, Math.sin(a1) * rBottom, 0, -1, 0, 0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1));
      indices.push(botCenter, p0, p1);
    }
  }
  return { positions, normals, uvs, joints, weights, indices };
}

function mergeGeometries(list) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const indices = [];
  let vertexOffset = 0;

  for (const g of list) {
    for (let i = 0; i < g.positions.length; i++) positions.push(g.positions[i]);
    for (let i = 0; i < g.normals.length; i++) normals.push(g.normals[i]);
    for (let i = 0; i < g.uvs.length; i++) uvs.push(g.uvs[i]);
    for (let i = 0; i < g.joints.length; i++) joints.push(g.joints[i]);
    for (let i = 0; i < g.weights.length; i++) weights.push(g.weights[i]);
    for (let i = 0; i < g.indices.length; i++) indices.push(g.indices[i] + vertexOffset);
    vertexOffset += g.positions.length / 3;
  }
  return { positions, normals, uvs, joints, weights, indices };
}

function classifyPromptForSimulation(promptText = '') {
  const lower = String(promptText || '').toLowerCase();
  const palette = {
    primary: '#3f6ad8',
    secondary: '#d9a441',
    accent: '#42e3ff',
  };
  if (/빨간|레드|red|crimson|아이언맨|화염|fire|용암/.test(lower)) {
    palette.primary = '#c82d2d';
    palette.secondary = '#e0b03b';
    palette.accent = '#59e8ff';
  } else if (/파랑|블루|blue|paladin|사파이어|sapphire/.test(lower)) {
    palette.primary = '#2b5cd9';
    palette.secondary = '#e3b23c';
    palette.accent = '#42e8ff';
  } else if (/초록|녹색|그린|green|슬라임|숲|forest|emerald|goblin/.test(lower)) {
    palette.primary = '#2e9e5b';
    palette.secondary = '#96e6b3';
    palette.accent = '#e8ff66';
  } else if (/보라|퍼플|purple|마법|크리스탈|crystal|void|arcane/.test(lower)) {
    palette.primary = '#6d47d9';
    palette.secondary = '#c8b6ff';
    palette.accent = '#38f9d7';
  } else if (/검정|다크|블랙|dark|black|사이버|cyber|다스베이더|mech|드론/.test(lower)) {
    palette.primary = '#2a3242';
    palette.secondary = '#8d99ae';
    palette.accent = '#ff3b6b';
  } else if (/황금|골드|gold|보물|treasure|chest|중세/.test(lower)) {
    palette.primary = '#7c4d25';
    palette.secondary = '#e3b23c';
    palette.accent = '#4fc3f7';
  }

  let archetype = 'character';
  if (/보물|상자|chest|crate|box/.test(lower)) archetype = 'chest';
  else if (/검|소드|sword|blade|무기|weapon|지팡이|staff/.test(lower)) archetype = 'weapon';
  else if (/드론|로봇|메카|mech|robot|drone|아이언맨/.test(lower)) archetype = 'mech';
  else if (/탑|성|건물|tower|castle|house|집/.test(lower)) archetype = 'tower';
  else if (/차|자동차|레이싱|car|vehicle|탱크|tank|우주선|ship/.test(lower)) archetype = 'vehicle';
  else if (/크리스탈|보석|crystal|포션|potion/.test(lower)) archetype = 'crystal';
  else if (/기사|캐릭터|영웅|히어로|몬스터|슬라임|knight|hero|character|humanoid|slime|panda|dragon/.test(lower)) archetype = 'character';

  return { archetype, palette };
}

function buildArchetypeParts(archetype, faceBudgetFactor = 1) {
  const seg = faceBudgetFactor < 0.5 ? 6 : (faceBudgetFactor > 1.2 ? 16 : 10);
  // Returns { primaryParts, secondaryParts, accentParts } with bone indices:
  // 0=Root/Hips, 1=Torso, 2=Head, 3=LeftArm, 4=RightArm
  if (archetype === 'chest') {
    return {
      primaryParts: [
        makeBoxGeometry(0, 0.32, 0, 1.15, 0.64, 0.78, 0),
        makeOctaPrismGeometry(0, 0.72, 0, 0.56, 0.44, 0.24, seg, 1),
      ],
      secondaryParts: [
        makeBoxGeometry(0, 0.62, 0, 1.20, 0.08, 0.82, 1),
        makeBoxGeometry(-0.42, 0.34, 0, 0.1, 0.68, 0.82, 0),
        makeBoxGeometry(0.42, 0.34, 0, 0.1, 0.68, 0.82, 0),
        makeBoxGeometry(0, 0.54, 0.41, 0.18, 0.22, 0.08, 1),
      ],
      accentParts: [
        makeOctaPrismGeometry(0, 0.55, 0.46, 0.06, 0.02, 0.12, 6, 1),
      ],
    };
  }
  if (archetype === 'weapon') {
    return {
      primaryParts: [
        makeBoxGeometry(0, 1.12, 0, 0.16, 1.28, 0.06, 1),
        makeOctaPrismGeometry(0, 1.88, 0, 0.11, 0.0, 0.26, 4, 2),
      ],
      secondaryParts: [
        makeBoxGeometry(0, 0.46, 0, 0.54, 0.09, 0.12, 0),
        makeOctaPrismGeometry(0, 0.22, 0, 0.05, 0.05, 0.40, seg, 0),
        makeOctaPrismGeometry(0, 0.04, 0, 0.09, 0.07, 0.10, seg, 0),
      ],
      accentParts: [
        makeBoxGeometry(0, 1.08, 0, 0.06, 0.96, 0.09, 1),
        makeOctaPrismGeometry(0, 0.46, 0, 0.09, 0.04, 0.14, 6, 0),
      ],
    };
  }
  if (archetype === 'tower') {
    return {
      primaryParts: [
        makeOctaPrismGeometry(0, 1.2, 0, 0.9, 0.72, 2.4, seg, 0),
        makeOctaPrismGeometry(0, 2.55, 0, 0.88, 0.88, 0.35, seg, 1),
      ],
      secondaryParts: [
        makeOctaPrismGeometry(0, 3.15, 0, 0.96, 0.04, 0.92, seg, 2),
        makeBoxGeometry(0, 0.35, 0.85, 0.42, 0.70, 0.14, 0),
      ],
      accentParts: [
        makeBoxGeometry(0, 1.75, 0.78, 0.22, 0.38, 0.08, 1),
        makeOctaPrismGeometry(0, 3.68, 0, 0.08, 0.01, 0.26, 6, 2),
      ],
    };
  }
  if (archetype === 'vehicle') {
    return {
      primaryParts: [
        makeBoxGeometry(0, 0.46, 0, 1.25, 0.36, 2.25, 0),
        makeBoxGeometry(0, 0.76, -0.1, 0.96, 0.32, 1.05, 1),
      ],
      secondaryParts: [
        makeOctaPrismGeometry(-0.66, 0.24, 0.72, 0.24, 0.24, 0.18, seg, 3),
        makeOctaPrismGeometry(0.66, 0.24, 0.72, 0.24, 0.24, 0.18, seg, 4),
        makeOctaPrismGeometry(-0.66, 0.24, -0.72, 0.24, 0.24, 0.18, seg, 0),
        makeOctaPrismGeometry(0.66, 0.24, -0.72, 0.24, 0.24, 0.18, seg, 0),
        makeBoxGeometry(0, 0.76, -1.04, 1.18, 0.08, 0.24, 1),
      ],
      accentParts: [
        makeBoxGeometry(0, 0.50, 1.13, 0.92, 0.10, 0.05, 1),
        makeBoxGeometry(0, 0.76, 0.43, 0.84, 0.22, 0.06, 2),
      ],
    };
  }
  if (archetype === 'crystal') {
    return {
      primaryParts: [
        makeOctaPrismGeometry(0, 0.85, 0, 0.42, 0.04, 1.7, 6, 1),
        makeOctaPrismGeometry(-0.36, 0.52, 0.14, 0.24, 0.03, 1.04, 6, 3),
        makeOctaPrismGeometry(0.34, 0.60, -0.12, 0.26, 0.03, 1.2, 6, 4),
      ],
      secondaryParts: [
        makeOctaPrismGeometry(0, 0.14, 0, 0.72, 0.58, 0.28, seg, 0),
      ],
      accentParts: [
        makeOctaPrismGeometry(0, 1.82, 0, 0.16, 0.01, 0.34, 6, 2),
      ],
    };
  }
  if (archetype === 'mech') {
    return {
      primaryParts: [
        makeBoxGeometry(0, 1.18, 0, 0.76, 0.74, 0.48, 1), // chest
        makeBoxGeometry(-0.22, 0.42, 0, 0.24, 0.82, 0.28, 0), // left leg
        makeBoxGeometry(0.22, 0.42, 0, 0.24, 0.82, 0.28, 0), // right leg
        makeBoxGeometry(-0.56, 1.12, 0, 0.24, 0.72, 0.26, 3), // left arm
        makeBoxGeometry(0.56, 1.12, 0, 0.24, 0.72, 0.26, 4), // right arm
        makeOctaPrismGeometry(0, 1.76, 0, 0.24, 0.20, 0.34, seg, 2), // helmet
      ],
      secondaryParts: [
        makeBoxGeometry(-0.56, 1.50, 0, 0.32, 0.22, 0.34, 3), // left pauldron
        makeBoxGeometry(0.56, 1.50, 0, 0.32, 0.22, 0.34, 4), // right pauldron
        makeBoxGeometry(0, 0.80, 0, 0.62, 0.16, 0.40, 0), // pelvis
        makeBoxGeometry(0, 1.24, -0.32, 0.52, 0.56, 0.20, 1), // jetpack
      ],
      accentParts: [
        makeOctaPrismGeometry(0, 1.22, 0.25, 0.13, 0.13, 0.06, seg, 1), // arc core
        makeBoxGeometry(0, 1.78, 0.21, 0.28, 0.09, 0.06, 2), // visor
      ],
    };
  }
  // Default: stylized humanoid character / hero / knight
  return {
    primaryParts: [
      makeBoxGeometry(0, 1.10, 0, 0.56, 0.64, 0.34, 1), // torso
      makeBoxGeometry(-0.16, 0.38, 0, 0.20, 0.76, 0.22, 0), // left leg
      makeBoxGeometry(0.16, 0.38, 0, 0.20, 0.76, 0.22, 0), // right leg
      makeBoxGeometry(-0.42, 1.06, 0, 0.18, 0.62, 0.18, 3), // left arm
      makeBoxGeometry(0.42, 1.06, 0, 0.18, 0.62, 0.18, 4), // right arm
      makeOctaPrismGeometry(0, 1.66, 0, 0.23, 0.21, 0.36, seg, 2), // head
    ],
    secondaryParts: [
      makeBoxGeometry(-0.44, 1.38, 0, 0.26, 0.16, 0.26, 3), // shoulder L
      makeBoxGeometry(0.44, 1.38, 0, 0.26, 0.16, 0.26, 4), // shoulder R
      makeBoxGeometry(0, 0.76, 0, 0.54, 0.14, 0.34, 0), // belt
      makeBoxGeometry(0, 1.06, -0.22, 0.44, 0.78, 0.06, 1), // cape
    ],
    accentParts: [
      makeBoxGeometry(0, 1.68, 0.21, 0.24, 0.08, 0.05, 2), // visor
      makeOctaPrismGeometry(0, 1.18, 0.18, 0.09, 0.04, 0.12, 6, 1), // emblem
    ],
  };
}

function quatAxisAngle(ax, ay, az, rad) {
  const half = rad * 0.5;
  const s = Math.sin(half);
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

/**
 * Synthesizes a 100% spec-compliant glTF 2.0 binary (.glb) for PoC simulation mode.
 * Includes PBR materials, embedded PNG albedo texture, normals, UVs,
 * and optional real glTF skins (5-bone humanoid rig) + skeletal animations!
 */
function buildSimulationGlb(options = {}) {
  const prompt = String(options.prompt || 'Stylized Fantasy Knight');
  const seed = Number.isInteger(options.seed) ? Math.abs(options.seed) : 42;
  const withTexture = options.texture !== false;
  const withPbr = options.pbr !== false;
  const rigged = Boolean(options.rigged);
  const animationPreset = options.animationPreset ? String(options.animationPreset) : null;
  const faceLimit = Number(options.faceLimit) || 0;
  const faceBudgetFactor = faceLimit > 0 && faceLimit <= 6000 ? 0.4 : (faceLimit >= 20000 ? 1.4 : 1.0);

  const { archetype, palette } = classifyPromptForSimulation(prompt);
  const parts = buildArchetypeParts(archetype, faceBudgetFactor);
  const groups = [
    { name: 'PrimaryBody', geom: mergeGeometries(parts.primaryParts), matIndex: 0 },
    { name: 'SecondaryTrim', geom: mergeGeometries(parts.secondaryParts), matIndex: 1 },
    { name: 'AccentEmissive', geom: mergeGeometries(parts.accentParts), matIndex: 2 },
  ];

  const binChunks = [];
  let binOffset = 0;
  const bufferViews = [];
  const accessors = [];

  function pushBufferView(buf, target) {
    const padded = pad4(buf, 0x00);
    const bvIndex = bufferViews.length;
    const bv = { buffer: 0, byteOffset: binOffset, byteLength: buf.length };
    if (target) bv.target = target;
    bufferViews.push(bv);
    binChunks.push(padded);
    binOffset += padded.length;
    return bvIndex;
  }

  function pushAccessor(typedArray, componentType, type, target, includeMinMax = false) {
    const rawBuf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const bvIdx = pushBufferView(rawBuf, target);
    const compPerElem = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const count = typedArray.length / compPerElem;
    const acc = { bufferView: bvIdx, componentType, count, type };
    if (includeMinMax && count > 0) {
      const min = new Array(compPerElem).fill(Infinity);
      const max = new Array(compPerElem).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < compPerElem; c++) {
          const val = typedArray[i * compPerElem + c];
          if (val < min[c]) min[c] = val;
          if (val > max[c]) max[c] = val;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  }

  // Materials & optional embedded PNG texture
  const images = [];
  const textures = [];
  const samplers = [];
  let primaryTexIndex = null;

  if (withTexture) {
    const pngBuf = createStylizedPbrTexturePng(palette.primary, palette.secondary, seed);
    const imgBv = pushBufferView(pngBuf);
    images.push({ bufferView: imgBv, mimeType: 'image/png', name: 'TripoPrimaryAlbedo' });
    samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
    textures.push({ sampler: 0, source: 0, name: 'TripoAlbedoTex' });
    primaryTexIndex = 0;
  }

  const rgbNorm = hex => {
    const [r, g, b] = hexToRgbBytes(hex);
    return [Number((r / 255).toFixed(4)), Number((g / 255).toFixed(4)), Number((b / 255).toFixed(4))];
  };
  const pCol = rgbNorm(palette.primary);
  const sCol = rgbNorm(palette.secondary);
  const aCol = rgbNorm(palette.accent);

  const materials = [
    {
      name: 'TripoPrimaryPBR',
      pbrMetallicRoughness: {
        baseColorFactor: primaryTexIndex !== null ? [1, 1, 1, 1] : [...pCol, 1],
        ...(primaryTexIndex !== null ? { baseColorTexture: { index: primaryTexIndex } } : {}),
        metallicFactor: withPbr ? 0.25 : 0.0,
        roughnessFactor: withPbr ? 0.48 : 0.85,
      },
    },
    {
      name: 'TripoMetalTrimPBR',
      pbrMetallicRoughness: {
        baseColorFactor: [...sCol, 1],
        metallicFactor: withPbr ? 0.82 : 0.1,
        roughnessFactor: withPbr ? 0.26 : 0.75,
      },
    },
    {
      name: 'TripoEmissiveAccent',
      pbrMetallicRoughness: {
        baseColorFactor: [...aCol, 1],
        metallicFactor: withPbr ? 0.15 : 0.0,
        roughnessFactor: withPbr ? 0.18 : 0.5,
      },
      emissiveFactor: withPbr ? [aCol[0] * 0.65, aCol[1] * 0.65, aCol[2] * 0.65] : [0, 0, 0],
    },
  ];

  // Build primitives
  const primitives = [];
  for (const grp of groups) {
    const { geom } = grp;
    const posAcc = pushAccessor(new Float32Array(geom.positions), 5126, 'VEC3', 34962, true);
    const normAcc = pushAccessor(new Float32Array(geom.normals), 5126, 'VEC3', 34962, false);
    const uvAcc = pushAccessor(new Float32Array(geom.uvs), 5126, 'VEC2', 34962, false);
    const idxAcc = pushAccessor(new Uint16Array(geom.indices), 5123, 'SCALAR', 34963, false);
    const attributes = {
      POSITION: posAcc,
      NORMAL: normAcc,
      TEXCOORD_0: uvAcc,
    };
    if (rigged) {
      attributes.JOINTS_0 = pushAccessor(new Uint16Array(geom.joints), 5123, 'VEC4', 34962, false);
      attributes.WEIGHTS_0 = pushAccessor(new Float32Array(geom.weights), 5126, 'VEC4', 34962, false);
    }
    primitives.push({
      attributes,
      indices: idxAcc,
      material: grp.matIndex,
      mode: 4,
    });
  }

  const meshes = [{ name: `Tripo_${archetype}`, primitives }];
  const nodes = [];
  const skins = [];
  const animations = [];
  let rootChildren = [];

  if (rigged) {
    // Node 0: Root wrapper
    // Node 1: Skinned mesh node
    // Node 2: Bone_Hips (joint 0)
    // Node 3: Bone_Spine (joint 1, child of Hips)
    // Node 4: Bone_Head (joint 2, child of Spine)
    // Node 5: Bone_LeftArm (joint 3, child of Spine)
    // Node 6: Bone_RightArm (joint 4, child of Spine)
    const boneDefs = [
      { name: 'Hips', t: [0, 0.78, 0], world: [0, 0.78, 0], children: [3] },
      { name: 'Spine', t: [0, 0.34, 0], world: [0, 1.12, 0], children: [4, 5, 6] },
      { name: 'Head', t: [0, 0.54, 0], world: [0, 1.66, 0], children: [] },
      { name: 'LeftArm', t: [-0.46, 0.14, 0], world: [-0.46, 1.26, 0], children: [] },
      { name: 'RightArm', t: [0.46, 0.14, 0], world: [0.46, 1.26, 0], children: [] },
    ];

    // Column-major inverse bind matrices (translation inverse = -worldPos)
    const ibm = new Float32Array(boneDefs.length * 16);
    boneDefs.forEach((b, i) => {
      const o = i * 16;
      ibm[o + 0] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
      ibm[o + 12] = -b.world[0];
      ibm[o + 13] = -b.world[1];
      ibm[o + 14] = -b.world[2];
    });
    const ibmAcc = pushAccessor(ibm, 5126, 'MAT4', null, false);

    nodes.push({ name: 'TripoCharacterRoot', children: [1, 2] });
    nodes.push({ name: 'TripoMesh', mesh: 0, skin: 0 });
    for (const b of boneDefs) {
      const boneNode = { name: b.name, translation: b.t };
      if (b.children.length > 0) boneNode.children = b.children;
      nodes.push(boneNode);
    }
    skins.push({
      name: 'TripoBipedRig',
      inverseBindMatrices: ibmAcc,
      skeleton: 2,
      joints: [2, 3, 4, 5, 6],
    });
    rootChildren = [0];

    if (animationPreset) {
      const cleanAnimName = animationPreset.replace(/^preset:/, '');
      const times = new Float32Array([0.0, 0.35, 0.70, 1.05, 1.40]);
      const timeAcc = pushAccessor(times, 5126, 'SCALAR', null, true);

      const swing = cleanAnimName === 'run' ? 0.65 : (cleanAnimName === 'walk' ? 0.38 : (cleanAnimName === 'slash' ? 0.95 : 0.12));
      const bob = cleanAnimName === 'jump' ? 0.38 : (cleanAnimName === 'run' ? 0.08 : 0.03);

      const hipsTrans = new Float32Array([
        0, 0.78, 0,
        0, 0.78 + bob, 0,
        0, 0.78, 0,
        0, 0.78 + bob * 0.6, 0,
        0, 0.78, 0,
      ]);
      const leftArmRot = new Float32Array([
        ...quatAxisAngle(1, 0, 0, 0),
        ...quatAxisAngle(1, 0, 0, swing),
        ...quatAxisAngle(1, 0, 0, 0),
        ...quatAxisAngle(1, 0, 0, -swing),
        ...quatAxisAngle(1, 0, 0, 0),
      ]);
      const rightArmRot = new Float32Array([
        ...quatAxisAngle(1, 0, 0, 0),
        ...quatAxisAngle(1, 0, 0, -swing),
        ...quatAxisAngle(1, 0, 0, 0),
        ...quatAxisAngle(1, 0, 0, swing),
        ...quatAxisAngle(1, 0, 0, 0),
      ]);
      const headRot = new Float32Array([
        ...quatAxisAngle(0, 1, 0, 0),
        ...quatAxisAngle(0, 1, 0, 0.14),
        ...quatAxisAngle(0, 1, 0, 0),
        ...quatAxisAngle(0, 1, 0, -0.14),
        ...quatAxisAngle(0, 1, 0, 0),
      ]);

      const hipsOut = pushAccessor(hipsTrans, 5126, 'VEC3', null, false);
      const lArmOut = pushAccessor(leftArmRot, 5126, 'VEC4', null, false);
      const rArmOut = pushAccessor(rightArmRot, 5126, 'VEC4', null, false);
      const headOut = pushAccessor(headRot, 5126, 'VEC4', null, false);

      animations.push({
        name: `tripo_${cleanAnimName}`,
        samplers: [
          { input: timeAcc, interpolation: 'LINEAR', output: hipsOut },
          { input: timeAcc, interpolation: 'LINEAR', output: lArmOut },
          { input: timeAcc, interpolation: 'LINEAR', output: rArmOut },
          { input: timeAcc, interpolation: 'LINEAR', output: headOut },
        ],
        channels: [
          { sampler: 0, target: { node: 2, path: 'translation' } },
          { sampler: 1, target: { node: 5, path: 'rotation' } },
          { sampler: 2, target: { node: 6, path: 'rotation' } },
          { sampler: 3, target: { node: 4, path: 'rotation' } },
        ],
      });
    }
  } else {
    nodes.push({ name: `Tripo_${archetype}`, mesh: 0 });
    rootChildren = [0];
  }

  const binBuf = pad4(Buffer.concat(binChunks), 0x00);
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'PlayForge-Tripo3D-PoC-Simulator/3.1',
    },
    scene: 0,
    scenes: [{ name: 'TripoScene', nodes: rootChildren }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuf.length }],
  };
  if (images.length > 0) gltf.images = images;
  if (textures.length > 0) gltf.textures = textures;
  if (samplers.length > 0) gltf.samplers = samplers;
  if (skins.length > 0) gltf.skins = skins;
  if (animations.length > 0) gltf.animations = animations;

  const jsonBuf = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(GLB_CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(GLB_CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]);
}

function buildPreviewPng(promptText = '') {
  const { palette } = classifyPromptForSimulation(promptText);
  return createStylizedPbrTexturePng(palette.primary, palette.accent, 17);
}

module.exports = {
  MAX_GLB_BYTES,
  validateGlbBuffer,
  buildSimulationGlb,
  buildPreviewPng,
  classifyPromptForSimulation,
};
