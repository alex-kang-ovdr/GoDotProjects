// N2 — Pure-Node Binary glTF 2.0 / GLB Parser & Hard Asset Budget Gate
// Pure Node 24 ESM (zero external dependencies)

import { readFileSync } from 'node:fs';

export const GLB_MAGIC = 0x46546c67; // "glTF"
export const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
export const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

const MIB = 1024 * 1024;

// Core required bones aligned with forge/Godot/addons/playforge_avatar/catalog.json
export const RIG_REQUIRED_CORE_BONES = Object.freeze({
  kaykit_v1: Object.freeze([
    'hips', 'spine', 'chest', 'head',
    'upperarm.l', 'lowerarm.l', 'hand.l',
    'upperarm.r', 'lowerarm.r', 'hand.r',
    'upperleg.l', 'lowerleg.l', 'foot.l',
    'upperleg.r', 'lowerleg.r', 'foot.r',
  ]),
  robot_expressive_v1: Object.freeze([
    'Hips', 'Abdomen', 'Torso', 'Head',
    'UpperArm.L', 'LowerArm.L', 'Palm2.L',
    'UpperArm.R', 'LowerArm.R', 'Palm2.R',
    'UpperLeg.L', 'LowerLeg.L', 'Foot.L',
    'UpperLeg.R', 'LowerLeg.R', 'Foot.R',
  ]),
});

export const ASSET_BUDGET_LIMITS = Object.freeze({
  ugc_attachment: Object.freeze({
    maxTriangles: 4000,
    maxBytes: Math.round(1.5 * MIB), // 1.5 MiB
    maxMaterials: 2,
    maxBoundingExtentMeters: 1.2,
    requireRigBones: false,
  }),
  ugc_avatar_skin: Object.freeze({
    maxTriangles: 15000,
    maxBytes: 5 * MIB, // 5.0 MiB
    maxMaterials: 4,
    maxBoundingExtentMeters: null,
    requireRigBones: true,
  }),
  scene_prop: Object.freeze({
    maxTriangles: 25000,
    maxBytes: 8 * MIB, // 8.0 MiB
    maxMaterials: null,
    maxBoundingExtentMeters: null,
    requireRigBones: false,
  }),
});

function estimateDataUriBytes(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:')) return 0;
  const comma = uri.indexOf(',');
  if (comma < 0) return 0;
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return Buffer.byteLength(decodeURIComponent(payload), 'utf8');
}

/**
 * Pure-Node binary glTF 2.0 / GLB parser.
 * Parses header, JSON chunk (0x4E4F534A), and computes exact geometry, material,
 * texture, bounding box, skin bone, and extension metrics.
 */
export function inspectGlbBuffer(buf) {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (buffer.length < 20) {
    throw new Error(`Invalid GLB: buffer too small (${buffer.length} bytes, minimum 20)`);
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic: 0x${magic.toString(16)} (expected 0x46546c67 "glTF")`);
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version} (expected 2)`);
  }

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length || declaredLength < 20) {
    throw new Error(`Invalid GLB declared length: ${declaredLength} (buffer has ${buffer.length} bytes)`);
  }

  // Walk chunks
  let offset = 12;
  let gltfJson = null;
  let jsonChunkBytes = 0;
  let binChunkBytes = 0;

  while (offset + 8 <= declaredLength) {
    const chunkLen = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLen;
    if (dataEnd > declaredLength) {
      throw new Error(`Truncated GLB chunk at offset ${offset}: needs ${chunkLen} bytes`);
    }

    if (chunkType === GLB_CHUNK_JSON && gltfJson === null) {
      jsonChunkBytes = chunkLen;
      const jsonText = buffer.subarray(dataStart, dataEnd).toString('utf8').replace(/\0+$/, '').trim();
      try {
        gltfJson = JSON.parse(jsonText);
      } catch (err) {
        throw new Error(`Invalid GLB JSON chunk: ${err.message}`);
      }
    } else if (chunkType === GLB_CHUNK_BIN) {
      binChunkBytes += chunkLen;
    }

    offset = dataEnd;
  }

  if (!gltfJson || typeof gltfJson !== 'object') {
    throw new Error('Invalid GLB: missing JSON chunk (0x4E4F534A)');
  }

  const accessors = Array.isArray(gltfJson.accessors) ? gltfJson.accessors : [];
  const bufferViews = Array.isArray(gltfJson.bufferViews) ? gltfJson.bufferViews : [];
  const meshes = Array.isArray(gltfJson.meshes) ? gltfJson.meshes : [];
  const materials = Array.isArray(gltfJson.materials) ? gltfJson.materials : [];
  const textures = Array.isArray(gltfJson.textures) ? gltfJson.textures : [];
  const images = Array.isArray(gltfJson.images) ? gltfJson.images : [];
  const nodes = Array.isArray(gltfJson.nodes) ? gltfJson.nodes : [];
  const skins = Array.isArray(gltfJson.skins) ? gltfJson.skins : [];
  const animations = Array.isArray(gltfJson.animations) ? gltfJson.animations : [];

  let triangleCount = 0;
  let vertexCount = 0;
  let primitiveCount = 0;

  let hasBounds = false;
  const bboxMin = [Infinity, Infinity, Infinity];
  const bboxMax = [-Infinity, -Infinity, -Infinity];

  for (const mesh of meshes) {
    const primitives = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    for (const prim of primitives) {
      primitiveCount++;
      const mode = prim.mode === undefined ? 4 : prim.mode;
      const posAccessorIdx = prim.attributes?.POSITION;
      const posAccessor = Number.isInteger(posAccessorIdx) ? accessors[posAccessorIdx] : null;
      const posCount = Number(posAccessor?.count || 0);
      vertexCount += posCount;

      if (Array.isArray(posAccessor?.min) && posAccessor.min.length >= 3 &&
          Array.isArray(posAccessor?.max) && posAccessor.max.length >= 3) {
        hasBounds = true;
        for (let axis = 0; axis < 3; axis++) {
          const mn = Number(posAccessor.min[axis]);
          const mx = Number(posAccessor.max[axis]);
          if (Number.isFinite(mn)) bboxMin[axis] = Math.min(bboxMin[axis], mn);
          if (Number.isFinite(mx)) bboxMax[axis] = Math.max(bboxMax[axis], mx);
        }
      }

      const idxAccessor = Number.isInteger(prim.indices) ? accessors[prim.indices] : null;
      const elementCount = idxAccessor ? Number(idxAccessor.count || 0) : posCount;

      if (mode === 4) {
        // TRIANGLES
        triangleCount += Math.floor(elementCount / 3);
      } else if (mode === 5 || mode === 6) {
        // TRIANGLE_STRIP or TRIANGLE_FAN
        triangleCount += Math.max(0, elementCount - 2);
      }
    }
  }

  let maxTextureBytes = 0;
  let totalTextureBytes = 0;
  for (const img of images) {
    let imgBytes = 0;
    if (Number.isInteger(img?.bufferView) && bufferViews[img.bufferView]) {
      imgBytes = Number(bufferViews[img.bufferView].byteLength || 0);
    } else if (typeof img?.uri === 'string') {
      imgBytes = estimateDataUriBytes(img.uri);
    }
    if (imgBytes > maxTextureBytes) maxTextureBytes = imgBytes;
    totalTextureBytes += imgBytes;
  }

  const boneSet = new Set();
  for (const skin of skins) {
    const joints = Array.isArray(skin?.joints) ? skin.joints : [];
    for (const jointIdx of joints) {
      const nodeName = nodes[jointIdx]?.name;
      if (typeof nodeName === 'string' && nodeName.length > 0) {
        boneSet.add(nodeName);
      }
    }
  }
  const skinBoneNames = [...boneSet];

  let boundingBox = null;
  if (hasBounds) {
    const size = [
      Number((bboxMax[0] - bboxMin[0]).toFixed(6)),
      Number((bboxMax[1] - bboxMin[1]).toFixed(6)),
      Number((bboxMax[2] - bboxMin[2]).toFixed(6)),
    ];
    const center = [
      Number(((bboxMin[0] + bboxMax[0]) / 2).toFixed(6)),
      Number(((bboxMin[1] + bboxMax[1]) / 2).toFixed(6)),
      Number(((bboxMin[2] + bboxMax[2]) / 2).toFixed(6)),
    ];
    boundingBox = {
      min: bboxMin.map((v) => Number(v.toFixed(6))),
      max: bboxMax.map((v) => Number(v.toFixed(6))),
      size,
      center,
      maxExtent: Number(Math.max(size[0], size[1], size[2]).toFixed(6)),
    };
  }

  return {
    gltfVersion: version,
    byteLength: buffer.length,
    declaredLength,
    jsonChunkBytes,
    binChunkBytes,
    triangleCount,
    vertexCount,
    meshCount: meshes.length,
    primitiveCount,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    maxTextureBytes,
    totalTextureBytes,
    boundingBox,
    skinCount: skins.length,
    skinBoneNames,
    animationCount: animations.length,
    extensionsRequired: Array.isArray(gltfJson.extensionsRequired) ? [...gltfJson.extensionsRequired] : [],
    extensionsUsed: Array.isArray(gltfJson.extensionsUsed) ? [...gltfJson.extensionsUsed] : [],
  };
}

export function inspectGlbFile(filePath) {
  const buf = readFileSync(filePath);
  return inspectGlbBuffer(buf);
}

/**
 * Helper to build a valid binary GLB 2.0 buffer from a glTF JSON object and optional BIN chunk.
 */
export function createSyntheticGlbBuffer(gltfJson, binBuffer = null) {
  const jsonRaw = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...gltfJson }), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = jsonPad > 0
    ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) // space-padded per glTF 2.0 spec
    : jsonRaw;

  let binChunk = null;
  if (binBuffer && binBuffer.length > 0) {
    const rawBin = Buffer.isBuffer(binBuffer) ? binBuffer : Buffer.from(binBuffer);
    const binPad = (4 - (rawBin.length % 4)) % 4;
    binChunk = binPad > 0 ? Buffer.concat([rawBin, Buffer.alloc(binPad, 0x00)]) : rawBin;
  }

  const totalLength = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0);
  const out = Buffer.alloc(totalLength);

  // Header
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);

  // JSON chunk
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(GLB_CHUNK_JSON, 16);
  jsonChunk.copy(out, 20);

  // BIN chunk
  if (binChunk) {
    const binOffset = 20 + jsonChunk.length;
    out.writeUInt32LE(binChunk.length, binOffset);
    out.writeUInt32LE(GLB_CHUNK_BIN, binOffset + 4);
    binChunk.copy(out, binOffset + 8);
  }

  return out;
}

/**
 * Enforces hard N2 asset budgets for:
 *   - ugc_attachment: <= 4,000 tris, <= 1.5 MiB, <= 2 materials, max bbox extent <= 1.2m
 *   - ugc_avatar_skin: <= 15,000 tris, <= 5.0 MiB, <= 4 materials, required core bones (kaykit_v1 or robot_expressive_v1)
 *   - scene_prop: <= 25,000 tris, <= 8.0 MiB
 */
export function validateAssetBudget(inspection, kind, options = {}) {
  const limits = ASSET_BUDGET_LIMITS[kind];
  if (!limits) {
    throw new Error(`Unknown asset budget kind "${kind}". Expected one of: ${Object.keys(ASSET_BUDGET_LIMITS).join(', ')}`);
  }

  const violations = [];
  const boneSet = new Set(inspection.skinBoneNames || []);

  if (inspection.triangleCount > limits.maxTriangles) {
    violations.push({
      code: 'TRIANGLE_BUDGET_EXCEEDED',
      message: `Triangle count ${inspection.triangleCount} exceeds ${kind} limit ${limits.maxTriangles}`,
      actual: inspection.triangleCount,
      limit: limits.maxTriangles,
    });
  }

  if (inspection.byteLength > limits.maxBytes) {
    violations.push({
      code: 'BYTE_BUDGET_EXCEEDED',
      message: `GLB size ${inspection.byteLength} bytes exceeds ${kind} limit ${limits.maxBytes} bytes`,
      actual: inspection.byteLength,
      limit: limits.maxBytes,
    });
  }

  if (limits.maxMaterials !== null && inspection.materialCount > limits.maxMaterials) {
    violations.push({
      code: 'MATERIAL_BUDGET_EXCEEDED',
      message: `Material count ${inspection.materialCount} exceeds ${kind} limit ${limits.maxMaterials}`,
      actual: inspection.materialCount,
      limit: limits.maxMaterials,
    });
  }

  if (limits.maxBoundingExtentMeters !== null) {
    if (!inspection.boundingBox) {
      violations.push({
        code: 'BOUNDING_BOX_MISSING',
        message: `POSITION accessor min/max bounds missing for ${kind}`,
        actual: null,
        limit: limits.maxBoundingExtentMeters,
      });
    } else if (inspection.boundingBox.maxExtent > limits.maxBoundingExtentMeters) {
      violations.push({
        code: 'BOUNDING_EXTENT_EXCEEDED',
        message: `Max bounding extent ${inspection.boundingBox.maxExtent}m exceeds ${kind} limit ${limits.maxBoundingExtentMeters}m`,
        actual: inspection.boundingBox.maxExtent,
        limit: limits.maxBoundingExtentMeters,
      });
    }
  }

  let matchedRigProfile = null;
  let missingBones = [];

  if (limits.requireRigBones) {
    const requestedProfile = options.rigProfile || null;
    const candidateProfiles = requestedProfile
      ? [requestedProfile]
      : Object.keys(RIG_REQUIRED_CORE_BONES);

    let bestMissing = null;
    for (const profileId of candidateProfiles) {
      const required = RIG_REQUIRED_CORE_BONES[profileId];
      if (!required) {
        violations.push({
          code: 'UNKNOWN_RIG_PROFILE',
          message: `Unknown rig profile "${profileId}"`,
          actual: profileId,
          limit: Object.keys(RIG_REQUIRED_CORE_BONES),
        });
        continue;
      }
      const missing = required.filter((b) => !boneSet.has(b));
      if (missing.length === 0) {
        matchedRigProfile = profileId;
        missingBones = [];
        break;
      }
      if (bestMissing === null || missing.length < bestMissing.missing.length) {
        bestMissing = { profileId, missing };
      }
    }

    if (!matchedRigProfile && bestMissing) {
      missingBones = bestMissing.missing;
      violations.push({
        code: 'REQUIRED_RIG_BONES_MISSING',
        message: `Skin is missing ${bestMissing.missing.length} required bones for ${bestMissing.profileId}: ${bestMissing.missing.slice(0, 6).join(', ')}`,
        actual: inspection.skinBoneNames.length,
        limit: RIG_REQUIRED_CORE_BONES[bestMissing.profileId].length,
        targetProfile: bestMissing.profileId,
        missingBones: bestMissing.missing,
      });
    }
  }

  return {
    ok: violations.length === 0,
    kind,
    limits,
    violations,
    matchedRigProfile,
    missingBones,
    summary: {
      triangleCount: inspection.triangleCount,
      byteLength: inspection.byteLength,
      materialCount: inspection.materialCount,
      maxExtent: inspection.boundingBox?.maxExtent ?? null,
      skinBoneCount: (inspection.skinBoneNames || []).length,
    },
  };
}
