'use strict';

const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_GLB_BYTES = 16 * 1024 * 1024;
const MAX_PARTS = 96;
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

const POLICY_REQUIREMENTS = Object.freeze({
  unmodifiedOfficialBinary: true,
  directDllLink: false,
  isolatedProcess: true,
  ipcMode: 'json-file',
});

const SUPPORTED_ARCHETYPES = Object.freeze([
  'chest',
  'crate',
  'tree',
  'sword',
  'staff',
  'tower',
  'house',
  'pillar',
  'rock',
  'crystal',
  'barrel',
  'lantern',
  'table',
  'robot',
  'car',
  'custom',
]);

const SUPPORTED_STYLES = Object.freeze(['stylized', 'lowpoly', 'fantasy', 'scifi', 'medieval', 'realistic']);
const SUPPORTED_DETAIL_LEVELS = Object.freeze(['low', 'medium', 'high']);
const SUPPORTED_PART_SHAPES = Object.freeze(['box', 'cylinder', 'cone', 'sphere', 'icosphere', 'torus', 'capsule', 'wedge']);
const SUPPORTED_MATERIAL_SLOTS = Object.freeze(['primary', 'secondary', 'accent', 'dark', 'snow']);

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return (
      '#' +
      trimmed[1] + trimmed[1] +
      trimmed[2] + trimmed[2] +
      trimmed[3] + trimmed[3]
    ).toLowerCase();
  }
  return fallback;
}

function sanitizeAssetName(value, fallback = 'GeneratedProp') {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function sanitizeVec3(value, min, max, fallback) {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  return [
    clampNumber(value[0], min, max, fallback[0]),
    clampNumber(value[1], min, max, fallback[1]),
    clampNumber(value[2], min, max, fallback[2]),
  ];
}

function validateMaterialSlot(raw, defaults) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    metallic: clampNumber(input.metallic, 0, 1, defaults.metallic),
    roughness: clampNumber(input.roughness, 0.04, 1, defaults.roughness),
    emissionStrength: clampNumber(input.emissionStrength, 0, 8, defaults.emissionStrength),
  };
}

function validatePart(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`recipe.parts[${index}] must be an object`);
  }
  const shape = String(raw.shape || 'box').trim().toLowerCase();
  if (!SUPPORTED_PART_SHAPES.includes(shape)) {
    throw new Error(`Unsupported part shape "${shape}" at recipe.parts[${index}]`);
  }
  const materialSlot = String(raw.materialSlot || 'primary').trim().toLowerCase();
  const safeSlot = SUPPORTED_MATERIAL_SLOTS.includes(materialSlot) ? materialSlot : 'primary';
  const part = {
    name: sanitizeAssetName(raw.name || `Part_${index + 1}`, `Part_${index + 1}`),
    shape,
    position: sanitizeVec3(raw.position, -25, 25, [0, 0, 0]),
    rotationDeg: sanitizeVec3(raw.rotationDeg, -360, 360, [0, 0, 0]),
    scale: sanitizeVec3(raw.scale, 0.015, 25, [1, 1, 1]),
    materialSlot: safeSlot,
    bevel: clampNumber(raw.bevel, 0, 0.25, 0),
    smooth: Boolean(raw.smooth),
    segments: Math.round(clampNumber(raw.segments, 4, 32, 16)),
  };
  if (raw.topRadiusRatio !== undefined) {
    part.topRadiusRatio = clampNumber(raw.topRadiusRatio, 0, 2.5, 1.0);
  }
  if (typeof raw.color === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.color.trim())) {
    part.color = sanitizeHexColor(raw.color, '#888888');
  }
  if (raw.metallic !== undefined) {
    part.metallic = clampNumber(raw.metallic, 0, 1, 0.1);
  }
  if (raw.roughness !== undefined) {
    part.roughness = clampNumber(raw.roughness, 0.04, 1, 0.5);
  }
  if (raw.emissionStrength !== undefined) {
    part.emissionStrength = clampNumber(raw.emissionStrength, 0, 8, 0);
  }
  return part;
}

function validateMeshRecipe(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Mesh recipe must be a JSON object');
  }
  const archetype = String(raw.archetype || 'crate').trim().toLowerCase();
  if (!SUPPORTED_ARCHETYPES.includes(archetype)) {
    throw new Error(`Unsupported archetype "${archetype}". Allowed: ${SUPPORTED_ARCHETYPES.join(', ')}`);
  }
  const style = SUPPORTED_STYLES.includes(String(raw.style || '').toLowerCase())
    ? String(raw.style).toLowerCase()
    : 'stylized';
  const detailLevel = SUPPORTED_DETAIL_LEVELS.includes(String(raw.detailLevel || '').toLowerCase())
    ? String(raw.detailLevel).toLowerCase()
    : 'medium';

  const dims = raw.dimensions && typeof raw.dimensions === 'object' ? raw.dimensions : {};
  const dimensions = {
    width: clampNumber(dims.width, 0.05, 50, 1.0),
    depth: clampNumber(dims.depth, 0.05, 50, 1.0),
    height: clampNumber(dims.height, 0.05, 50, 1.0),
  };

  const paletteRaw = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const palette = {
    primary: sanitizeHexColor(paletteRaw.primary, '#8b5a2b'),
    secondary: sanitizeHexColor(paletteRaw.secondary, '#d4af37'),
    accent: sanitizeHexColor(paletteRaw.accent, '#4fc3f7'),
  };

  const matRaw = raw.materialProfile && typeof raw.materialProfile === 'object' ? raw.materialProfile : {};
  const materialProfile = {
    primary: validateMaterialSlot(matRaw.primary, { metallic: 0.08, roughness: 0.65, emissionStrength: 0 }),
    secondary: validateMaterialSlot(matRaw.secondary, { metallic: 0.75, roughness: 0.3, emissionStrength: 0 }),
    accent: validateMaterialSlot(matRaw.accent, { metallic: 0.15, roughness: 0.2, emissionStrength: 0.8 }),
  };

  const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
  if (rawParts.length > MAX_PARTS) {
    throw new Error(`recipe.parts exceeds maximum allowed count (${MAX_PARTS})`);
  }
  const parts = rawParts.map((part, idx) => validatePart(part, idx));
  if (archetype === 'custom' && parts.length === 0) {
    throw new Error('Custom archetype requires at least one part in recipe.parts');
  }

  const variantsRaw = raw.variants && typeof raw.variants === 'object' && !Array.isArray(raw.variants) ? raw.variants : {};
  const variants = {
    snowy: Boolean(variantsRaw.snowy),
    glowing: Boolean(variantsRaw.glowing),
    pine: Boolean(variantsRaw.pine),
    spiky: Boolean(variantsRaw.spiky),
    openLid: Boolean(variantsRaw.openLid),
  };

  const seed = Number.isInteger(raw.seed) ? Math.abs(raw.seed) % 1000000 : 42;

  return {
    schemaVersion: SCHEMA_VERSION,
    name: sanitizeAssetName(raw.name, 'GeneratedProp'),
    archetype,
    style,
    dimensions,
    palette,
    materialProfile,
    detailLevel,
    seed,
    variants,
    parts,
  };
}

function validatePlacement(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    position: sanitizeVec3(input.position, -1000, 1000, [0, 0, 0]),
    rotationDeg: sanitizeVec3(input.rotationDeg, -360, 360, [0, 0, 0]),
    scale: sanitizeVec3(input.scale, 0.05, 100, [1, 1, 1]),
    parentPath: typeof input.parentPath === 'string' && /^[A-Za-z0-9_./-]{1,120}$/.test(input.parentPath) && !input.parentPath.includes('..')
      ? input.parentPath
      : '.',
  };
}

function validateGlbBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('GLB artifact must be a Buffer');
  }
  if (buffer.length < 20) {
    throw new Error(`GLB artifact is too small (${buffer.length} bytes)`);
  }
  if (buffer.length > MAX_GLB_BYTES) {
    throw new Error(`GLB artifact exceeds ${MAX_GLB_BYTES} byte limit`);
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
        throw new Error(`Invalid JSON chunk in GLB: ${err.message}`);
      }
    } else if (chunkType === GLB_CHUNK_BIN) {
      hasBinChunk = true;
      binBytes = chunkLength;
    }
    offset += chunkLength;
  }

  if (!gltfJson || typeof gltfJson !== 'object') {
    throw new Error('GLB is missing JSON chunk');
  }
  if (String(gltfJson.asset?.version || '') !== '2.0') {
    throw new Error(`Unexpected glTF asset version: ${gltfJson.asset?.version}`);
  }
  const meshes = Array.isArray(gltfJson.meshes) ? gltfJson.meshes : [];
  const nodes = Array.isArray(gltfJson.nodes) ? gltfJson.nodes : [];
  const materials = Array.isArray(gltfJson.materials) ? gltfJson.materials : [];
  if (meshes.length === 0) {
    throw new Error('GLB contains zero meshes');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    valid: true,
    bytes: buffer.length,
    sha256,
    gltfVersion: gltfJson.asset.version,
    generator: String(gltfJson.asset?.generator || ''),
    meshCount: meshes.length,
    nodeCount: nodes.length,
    materialCount: materials.length,
    hasBinChunk,
    binBytes,
  };
}

function assertAdapterPolicy(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('Engine adapter must be an object');
  }
  if (typeof adapter.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(adapter.id)) {
    throw new TypeError('Engine adapter must define a lowercase kebab-case id');
  }
  if (typeof adapter.probe !== 'function' || typeof adapter.execute !== 'function') {
    throw new TypeError(`Engine adapter "${adapter.id}" must implement probe() and execute()`);
  }
  const policy = adapter.policy || {};
  if (policy.directDllLink !== false) {
    throw new Error(`Policy violation in adapter "${adapter.id}": directDllLink must be false`);
  }
  if (policy.isolatedProcess !== true) {
    throw new Error(`Policy violation in adapter "${adapter.id}": isolatedProcess must be true`);
  }
  if (policy.ipcMode !== 'json-file') {
    throw new Error(`Policy violation in adapter "${adapter.id}": ipcMode must be "json-file"`);
  }
}

class MeshEngineRegistry {
  constructor() {
    this.adapters = new Map();
    this.defaultEngineId = null;
  }

  register(adapter, { isDefault = false } = {}) {
    assertAdapterPolicy(adapter);
    this.adapters.set(adapter.id, adapter);
    if (isDefault || !this.defaultEngineId) {
      this.defaultEngineId = adapter.id;
    }
    return this;
  }

  get(engineId) {
    const id = engineId || this.defaultEngineId;
    const adapter = this.adapters.get(id);
    if (!adapter) {
      const err = new Error(`Unknown 3D engine adapter: ${id || '(none)'}`);
      err.status = 400;
      throw err;
    }
    return adapter;
  }

  list() {
    return [...this.adapters.values()].map(adapter => ({
      id: adapter.id,
      displayName: adapter.displayName || adapter.id,
      isDefault: adapter.id === this.defaultEngineId,
      policy: { ...adapter.policy },
    }));
  }

  async probeAll() {
    const entries = [...this.adapters.values()];
    const results = await Promise.all(entries.map(async adapter => {
      const status = await adapter.probe();
      return {
        id: adapter.id,
        displayName: adapter.displayName || adapter.id,
        isDefault: adapter.id === this.defaultEngineId,
        policy: { ...adapter.policy },
        ...status,
      };
    }));
    return results;
  }
}

module.exports = {
  SCHEMA_VERSION,
  MAX_GLB_BYTES,
  MAX_PARTS,
  POLICY_REQUIREMENTS,
  SUPPORTED_ARCHETYPES,
  SUPPORTED_STYLES,
  SUPPORTED_DETAIL_LEVELS,
  SUPPORTED_PART_SHAPES,
  SUPPORTED_MATERIAL_SLOTS,
  clampNumber,
  sanitizeHexColor,
  sanitizeAssetName,
  validateMeshRecipe,
  validatePlacement,
  validateGlbBuffer,
  assertAdapterPolicy,
  MeshEngineRegistry,
};
