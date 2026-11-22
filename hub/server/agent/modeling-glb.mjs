// Hub-Agent 3D Modeling MeshRecipe v1 Planner & Pure Node.js Binary glTF 2.0 (.glb) Compiler.
// Produces spec-valid .glb buffers directly on the server for WebGL preview & Godot 4.7.2 import.

import { ApiError } from '../security.mjs';

export const MODELING_SYSTEM_PROMPT = `You are a Senior 3D Technical Artist for PlayHub & PlayForge (Godot 4.7.2 + glTF 2.0).
Translate the user's natural language 3D modeling request into a rich, well-proportioned declarative JSON 3D blueprint ("MeshRecipe v1") with 14 to 40 connected 3D parts.

STRICT RULES:
- Respond with ONLY one valid JSON object. No markdown fences or prose outside JSON.
- Coordinate system (meters): +X right, -X left, -Y front, +Y back, +Z up (ground at Z = 0; convert to glTF Y-up on export).
- Allowed shapes: "box", "cylinder", "cone", "sphere", "icosphere", "torus", "capsule", "wedge".
- Every part must overlap/connect naturally and include realistic PBR materials:
  {
    "name": "TorsoCore",
    "shape": "box",
    "position": [x, y, z],
    "rotationDeg": [rx, ry, rz],
    "scale": [sx, sy, sz],
    "topRadiusRatio": 1.0,
    "color": "#3b82f6",
    "metallic": 0.65,
    "roughness": 0.3,
    "emissionStrength": 0.0
  }
- Required top-level schema:
  {
    "name": "AsciiPascalAssetName",
    "summary": "한 줄 한국어 3D 모델 설계 요약",
    "archetype": "custom",
    "style": "stylized",
    "dimensions": { "width": 1.0, "depth": 0.8, "height": 1.8 },
    "palette": { "primary": "#3b82f6", "secondary": "#f59e0b", "accent": "#38bdf8" },
    "parts": [ ... ]
  }`;

const ALLOWED_SHAPES = new Set(['box', 'cylinder', 'cone', 'sphere', 'icosphere', 'torus', 'capsule', 'wedge']);

function clamp(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHexColor(raw, fallback = '#6366f1') {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return fallback;
}

function hexToLinearRgba(hex) {
  const clean = normalizeHexColor(hex).slice(1);
  const srgb = [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ];
  const lin = srgb.map(c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return [Number(lin[0].toFixed(5)), Number(lin[1].toFixed(5)), Number(lin[2].toFixed(5)), 1];
}

export function extractJsonFromText(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) throw new ApiError(502, 'MODELING_EMPTY_RESPONSE', 'AI 모델이 빈 3D 레시피 응답을 반환했습니다.');
  try {
    const direct = JSON.parse(raw);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct;
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(raw.slice(first, last + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new ApiError(502, 'MODELING_INVALID_JSON', 'AI 응답에서 유효한 3D MeshRecipe JSON을 추출하지 못했습니다.');
}

export function normalizeMeshRecipe(rawObj, fallbackName = 'PlayHubModel3D') {
  if (!rawObj || typeof rawObj !== 'object') {
    throw new ApiError(422, 'INVALID_MESH_RECIPE');
  }
  const cleanName = String(rawObj.name || fallbackName)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48) || 'PlayHubModel3D';
  const rawParts = Array.isArray(rawObj.parts) ? rawObj.parts.slice(0, 64) : [];
  if (!rawParts.length) {
    throw new ApiError(422, 'EMPTY_MESH_PARTS', '3D 레시피에 유효한 파트가 없습니다.');
  }

  const parts = rawParts.map((p, idx) => {
    const shape = ALLOWED_SHAPES.has(String(p?.shape || '').toLowerCase())
      ? String(p.shape).toLowerCase()
      : 'box';
    const pos = Array.isArray(p?.position) ? p.position : [0, 0, 0.5];
    const rot = Array.isArray(p?.rotationDeg) ? p.rotationDeg : [0, 0, 0];
    const scl = Array.isArray(p?.scale) ? p.scale : [0.4, 0.4, 0.4];
    return {
      name: String(p?.name || `Part_${idx + 1}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `Part_${idx + 1}`,
      shape,
      position: [clamp(pos[0], -20, 20, 0), clamp(pos[1], -20, 20, 0), clamp(pos[2], -5, 25, 0.5)],
      rotationDeg: [clamp(rot[0], -360, 360, 0), clamp(rot[1], -360, 360, 0), clamp(rot[2], -360, 360, 0)],
      scale: [clamp(scl[0], 0.02, 20, 0.4), clamp(scl[1], 0.02, 20, 0.4), clamp(scl[2], 0.02, 20, 0.4)],
      topRadiusRatio: clamp(p?.topRadiusRatio, 0.0, 3.0, 1.0),
      color: normalizeHexColor(p?.color, '#6366f1'),
      metallic: clamp(p?.metallic, 0, 1, 0.35),
      roughness: clamp(p?.roughness, 0.04, 1, 0.45),
      emissionStrength: clamp(p?.emissionStrength, 0, 10, 0)
    };
  });

  return {
    schemaVersion: 1,
    name: cleanName,
    summary: String(rawObj.summary || `${cleanName} (${parts.length}개 파트 3D 모델)`).slice(0, 200),
    archetype: 'custom',
    style: String(rawObj.style || 'stylized').slice(0, 32),
    dimensions: {
      width: clamp(rawObj.dimensions?.width, 0.1, 30, 1.2),
      depth: clamp(rawObj.dimensions?.depth, 0.1, 30, 1.2),
      height: clamp(rawObj.dimensions?.height, 0.1, 30, 1.8)
    },
    palette: {
      primary: normalizeHexColor(rawObj.palette?.primary, parts[0].color),
      secondary: normalizeHexColor(rawObj.palette?.secondary, '#f59e0b'),
      accent: normalizeHexColor(rawObj.palette?.accent, '#38bdf8')
    },
    parts
  };
}

// Procedural geometry builders in glTF Y-up local unit space (centered at origin)
function buildBoxGeometry(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] }
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  let base = 0;
  for (const f of faces) {
    for (const vert of f.v) {
      positions.push(...vert);
      normals.push(...f.n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return { positions, normals, indices };
}

function buildCylinderOrConeGeometry(bottomRadius, topRadius, height, segments = 16) {
  const positions = [];
  const normals = [];
  const indices = [];
  const hy = height / 2;
  const slope = (bottomRadius - topRadius) / Math.max(height, 1e-4);

  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * Math.PI * 2;
    const c = Math.cos(u), s = Math.sin(u);
    const len = Math.hypot(1, slope);
    const nx = c / len, ny = slope / len, nz = s / len;

    positions.push(c * bottomRadius, -hy, s * bottomRadius);
    normals.push(nx, ny, nz);

    positions.push(c * topRadius, hy, s * topRadius);
    normals.push(nx, ny, nz);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  // Bottom cap
  if (bottomRadius > 1e-4) {
    const centerIdx = positions.length / 3;
    positions.push(0, -hy, 0);
    normals.push(0, -1, 0);
    for (let i = 0; i <= segments; i++) {
      const u = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(u) * bottomRadius, -hy, Math.sin(u) * bottomRadius);
      normals.push(0, -1, 0);
    }
    for (let i = 0; i < segments; i++) {
      indices.push(centerIdx, centerIdx + 1 + i, centerIdx + 2 + i);
    }
  }
  // Top cap
  if (topRadius > 1e-4) {
    const centerIdx = positions.length / 3;
    positions.push(0, hy, 0);
    normals.push(0, 1, 0);
    for (let i = 0; i <= segments; i++) {
      const u = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(u) * topRadius, hy, Math.sin(u) * topRadius);
      normals.push(0, 1, 0);
    }
    for (let i = 0; i < segments; i++) {
      indices.push(centerIdx, centerIdx + 2 + i, centerIdx + 1 + i);
    }
  }
  return { positions, normals, indices };
}

function buildSphereGeometry(rx, ry, rz, rings = 12, sectors = 16) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
    for (let s = 0; s <= sectors; s++) {
      const u = (s / sectors) * Math.PI * 2;
      const ux = Math.cos(u) * sinPhi;
      const uy = cosPhi;
      const uz = Math.sin(u) * sinPhi;
      positions.push(ux * rx, uy * ry, uz * rz);
      const nx = ux / Math.max(rx, 1e-4);
      const ny = uy / Math.max(ry, 1e-4);
      const nz = uz / Math.max(rz, 1e-4);
      const nLen = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nLen, ny / nLen, nz / nLen);
    }
  }
  const stride = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function buildTorusGeometry(majorRadius, tubeRadius, radialSegs = 12, tubularSegs = 18) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let j = 0; j <= radialSegs; j++) {
    const v = (j / radialSegs) * Math.PI * 2;
    const cv = Math.cos(v), sv = Math.sin(v);
    for (let i = 0; i <= tubularSegs; i++) {
      const u = (i / tubularSegs) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      const x = (majorRadius + tubeRadius * cv) * cu;
      const y = tubeRadius * sv;
      const z = (majorRadius + tubeRadius * cv) * su;
      positions.push(x, y, z);
      normals.push(cv * cu, sv, cv * su);
    }
  }
  const stride = tubularSegs + 1;
  for (let j = 0; j < radialSegs; j++) {
    for (let i = 0; i < tubularSegs; i++) {
      const a = j * stride + i;
      const b = (j + 1) * stride + i;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function eulerZupDegToGltfQuat([rxDeg, ryDeg, rzDeg]) {
  // Convert Z-up Euler XYZ (degrees) -> glTF Y-up quaternion (x_g = x_b, y_g = z_b, z_g = -y_b)
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (rzDeg * Math.PI) / 360;
  const rz = (-ryDeg * Math.PI) / 360;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    Number((sx * cy * cz - cx * sy * sz).toFixed(6)),
    Number((cx * sy * cz + sx * cy * sz).toFixed(6)),
    Number((cx * cy * sz - sx * sy * cz).toFixed(6)),
    Number((cx * cy * cz + sx * sy * sz).toFixed(6))
  ];
}

function buildPartGeometry(part) {
  // Z-up scale [widthX, depthY, heightZ] -> glTF Y-up [widthX, heightZ, depthY]
  const sx = part.scale[0];
  const sy = part.scale[2];
  const sz = part.scale[1];

  switch (part.shape) {
    case 'cylinder':
    case 'capsule': {
      const rBottom = sx / 2;
      const rTop = rBottom * (part.topRadiusRatio ?? 1);
      return buildCylinderOrConeGeometry(rBottom, rTop, sy, 16);
    }
    case 'cone':
      return buildCylinderOrConeGeometry(sx / 2, 0.001, sy, 16);
    case 'sphere':
    case 'icosphere':
      return buildSphereGeometry(sx / 2, sy / 2, sz / 2, part.shape === 'icosphere' ? 8 : 12, part.shape === 'icosphere' ? 12 : 16);
    case 'torus': {
      const outer = sx / 2;
      const tube = Math.max(0.015, sy * 0.18);
      return buildTorusGeometry(Math.max(tube + 0.01, outer - tube), tube, 10, 16);
    }
    case 'wedge':
    case 'box':
    default:
      return buildBoxGeometry(sx, sy, sz);
  }
}

export function compileRecipeToGlb(recipe) {
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const meshes = [];
  const nodes = [];
  const binaryChunks = [];
  let byteOffset = 0;

  let totalTriangles = 0;
  let totalVertices = 0;

  function appendAligned(buf) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    const start = byteOffset;
    binaryChunks.push(aligned);
    byteOffset += aligned.length;
    return { byteOffset: start, byteLength: buf.length };
  }

  for (let idx = 0; idx < recipe.parts.length; idx++) {
    const part = recipe.parts[idx];
    const geom = buildPartGeometry(part);
    const vertCount = geom.positions.length / 3;
    totalVertices += vertCount;
    totalTriangles += geom.indices.length / 3;

    const minPos = [Infinity, Infinity, Infinity];
    const maxPos = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < geom.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (geom.positions[i + k] < minPos[k]) minPos[k] = geom.positions[i + k];
        if (geom.positions[i + k] > maxPos[k]) maxPos[k] = geom.positions[i + k];
      }
    }

    const posFloat = new Float32Array(geom.positions);
    const normFloat = new Float32Array(geom.normals);
    const idxUint16 = new Uint16Array(geom.indices);

    const posView = appendAligned(Buffer.from(posFloat.buffer));
    const normView = appendAligned(Buffer.from(normFloat.buffer));
    const idxView = appendAligned(Buffer.from(idxUint16.buffer));

    const posBvIdx = bufferViews.push({ buffer: 0, ...posView, target: 34962 }) - 1;
    const normBvIdx = bufferViews.push({ buffer: 0, ...normView, target: 34962 }) - 1;
    const idxBvIdx = bufferViews.push({ buffer: 0, ...idxView, target: 34963 }) - 1;

    const posAccIdx = accessors.push({
      bufferView: posBvIdx,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
      min: minPos.map(n => Number(n.toFixed(6))),
      max: maxPos.map(n => Number(n.toFixed(6)))
    }) - 1;

    const normAccIdx = accessors.push({
      bufferView: normBvIdx,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3'
    }) - 1;

    const idxAccIdx = accessors.push({
      bufferView: idxBvIdx,
      componentType: 5123,
      count: geom.indices.length,
      type: 'SCALAR'
    }) - 1;

    const baseColor = hexToLinearRgba(part.color);
    const mat = {
      name: `${part.name}_Mat`,
      pbrMetallicRoughness: {
        baseColorFactor: baseColor,
        metallicFactor: part.metallic,
        roughnessFactor: part.roughness
      }
    };
    if (part.emissionStrength > 0) {
      const emScale = Math.min(1, part.emissionStrength / 4);
      mat.emissiveFactor = [
        Number((baseColor[0] * emScale).toFixed(4)),
        Number((baseColor[1] * emScale).toFixed(4)),
        Number((baseColor[2] * emScale).toFixed(4))
      ];
    }
    const matIdx = materials.push(mat) - 1;

    const meshIdx = meshes.push({
      name: `${part.name}_Mesh`,
      primitives: [{
        attributes: { POSITION: posAccIdx, NORMAL: normAccIdx },
        indices: idxAccIdx,
        material: matIdx
      }]
    }) - 1;

    // Blender Z-up [x, y, z] -> glTF Y-up [x, z, -y]
    const [bx, by, bz] = part.position;
    nodes.push({
      name: part.name,
      mesh: meshIdx,
      translation: [bx, bz, -by],
      rotation: eulerZupDegToGltfQuat(part.rotationDeg)
    });
  }

  const rootNodeIdx = nodes.push({
    name: recipe.name,
    children: recipe.parts.map((_, idx) => idx)
  }) - 1;

  const binBuffer = Buffer.concat(binaryChunks);
  const gltfJson = {
    asset: { version: '2.0', generator: 'PlayHub Hub-Agent GLB Compiler v1.0' },
    scene: 0,
    scenes: [{ name: recipe.name, nodes: [rootNodeIdx] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }]
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonAligned = jsonPad ? Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]) : jsonBytes;

  const totalLength = 12 + 8 + jsonAligned.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonAligned.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  const glbBuffer = Buffer.concat([header, jsonChunkHeader, jsonAligned, binChunkHeader, binBuffer]);
  return {
    glbBuffer,
    metrics: {
      partCount: recipe.parts.length,
      vertexCount: totalVertices,
      triangleCount: totalTriangles,
      byteLength: glbBuffer.length
    }
  };
}
