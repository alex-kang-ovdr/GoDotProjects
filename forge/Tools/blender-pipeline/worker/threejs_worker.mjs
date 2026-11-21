#!/usr/bin/env node
/**
 * PlayForge Headless Three.js Worker (Isolated Process, JSON/File IPC Only).
 *
 * Consumes the exact same declarative MeshRecipe v1 JSON (Blender Z-up spec)
 * as blender_worker.py, constructs Three.js BufferGeometries + MeshStandardMaterials,
 * normalizes pivot to Bottom-Center (Y=0) in glTF Y-up space, and exports standard
 * binary glTF 2.0 (.glb).
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

const SCHEMA_VERSION = 1;

function parseArgs(argv) {
  let reqPath = null;
  let resPath = null;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--request' && argv[i + 1]) {
      reqPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--response' && argv[i + 1]) {
      resPath = path.resolve(argv[++i]);
    }
  }
  if (!reqPath || !resPath) {
    throw new Error('Missing required arguments: --request <path> --response <path>');
  }
  return { reqPath, resPath };
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToLinearRgb(hexStr) {
  const clean = String(hexStr || '#888888').trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '8').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function makeMaterialSpec(name, hexColor, profile = {}) {
  const rgb = hexToLinearRgb(hexColor);
  const emissionStrength = Math.max(0, Number(profile.emissionStrength) || 0);
  const scale = emissionStrength > 0 ? Math.min(1.0, 0.35 + emissionStrength * 0.25) : 0;
  return {
    name,
    baseColorFactor: [rgb[0], rgb[1], rgb[2], 1.0],
    metallicFactor: Math.max(0, Math.min(1, Number(profile.metallic ?? 0.12))),
    roughnessFactor: Math.max(0.04, Math.min(1, Number(profile.roughness ?? 0.55))),
    emissiveFactor: emissionStrength > 0 ? [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale] : [0, 0, 0],
  };
}

function createMaterialSlots(recipe) {
  const palette = recipe.palette || {};
  const mp = recipe.materialProfile || {};
  const variants = recipe.variants || {};
  const accentProf = { ...(mp.accent || {}) };
  if (variants.glowing) {
    accentProf.emissionStrength = Math.max(Number(accentProf.emissionStrength || 0), 2.2);
  }
  return {
    primary: makeMaterialSpec('Mat_Primary', palette.primary || '#8b5a2b', mp.primary),
    secondary: makeMaterialSpec('Mat_Secondary', palette.secondary || '#d4af37', mp.secondary),
    accent: makeMaterialSpec('Mat_Accent', palette.accent || '#4fc3f7', accentProf),
    snow: makeMaterialSpec('Mat_Snow', '#f0f6ff', { metallic: 0, roughness: 0.72, emissionStrength: 0.05 }),
    dark: makeMaterialSpec('Mat_Dark', '#20252e', { metallic: 0.25, roughness: 0.5, emissionStrength: 0 }),
  };
}

// Convert Blender Z-up geometry/transform into glTF Y-up:
// (x, y, z)_blender -> (x, z, -y)_gltf
const BLENDER_TO_GLTF = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

function makeWedgeGeometry(sx, sy, sz) {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  // Built in Blender Z-up local space (matching blender_worker.py make_wedge)
  const v = [
    [-hx, -hy, -hz], // 0
    [hx, -hy, -hz],  // 1
    [hx, hy, -hz],   // 2
    [-hx, hy, -hz],  // 3
    [-hx, hy, hz],   // 4
    [hx, hy, hz],    // 5
  ];
  const tris = [
    [0, 3, 2], [0, 2, 1], // bottom
    [3, 4, 5], [3, 5, 2], // back
    [0, 1, 5], [0, 5, 4], // slope
    [0, 4, 3],            // left
    [1, 2, 5],            // right
  ];
  const pos = [];
  for (const [a, b, c] of tris) {
    pos.push(...v[a], ...v[b], ...v[c]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildPartGeometry(part) {
  const shape = String(part.shape || 'box').toLowerCase();
  const [sx, sy, sz] = part.scale || [1, 1, 1];
  const segs = Math.max(4, Math.min(32, Math.round(Number(part.segments) || 16)));
  const topRatio = part.topRadiusRatio !== undefined ? Math.max(0, Number(part.topRadiusRatio)) : 1.0;

  let geo;
  if (shape === 'box') {
    geo = new THREE.BoxGeometry(sx, sy, sz);
  } else if (shape === 'cylinder') {
    // THREE.CylinderGeometry is Y-axis aligned -> rotate +90deg around X so it is Z-axis aligned like Blender!
    const rBot = Math.max(0.001, sx * 0.5);
    const rTop = Math.max(0.0, rBot * topRatio);
    geo = new THREE.CylinderGeometry(rTop, rBot, Math.max(0.002, sz), segs);
    geo.rotateX(Math.PI / 2);
  } else if (shape === 'cone') {
    geo = new THREE.ConeGeometry(Math.max(0.001, sx * 0.5), Math.max(0.002, sz), segs);
    geo.rotateX(Math.PI / 2);
  } else if (shape === 'sphere') {
    geo = new THREE.SphereGeometry(0.5, segs, Math.max(6, Math.round(segs * 0.65)));
    geo.scale(sx, sy, sz);
  } else if (shape === 'icosphere') {
    geo = new THREE.IcosahedronGeometry(0.5, 2);
    geo.scale(sx, sy, sz);
  } else if (shape === 'torus') {
    geo = new THREE.TorusGeometry(Math.max(0.01, sx * 0.5), Math.max(0.01, sz * 0.18), 10, segs);
  } else if (shape === 'capsule') {
    const r = Math.max(0.008, Math.min(sx, sy) * 0.5);
    const cylLen = Math.max(0.004, sz - r * 2);
    geo = new THREE.CapsuleGeometry(r, cylLen, 6, segs);
    geo.rotateX(Math.PI / 2);
  } else if (shape === 'wedge') {
    geo = makeWedgeGeometry(sx, sy, sz);
  } else {
    geo = new THREE.BoxGeometry(sx, sy, sz);
  }

  // Apply Blender-space local rotation & translation, then map Z-up -> glTF Y-up
  const [rx, ry, rz] = (part.rotationDeg || [0, 0, 0]).map(THREE.MathUtils.degToRad);
  const [px, py, pz] = part.position || [0, 0, 0];
  const localMat = new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')),
    new THREE.Vector3(1, 1, 1)
  );
  const finalMat = new THREE.Matrix4().multiplyMatrices(BLENDER_TO_GLTF, localMat);
  geo.applyMatrix4(finalMat);

  if (!part.smooth) {
    // Flat normals for crisp stylized facets
    const nonIdx = geo.index ? geo.toNonIndexed() : geo;
    nonIdx.computeVertexNormals();
    if (nonIdx !== geo) geo.dispose();
    geo = nonIdx;
  } else if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  return geo;
}

function buildArchetypeParts(recipe) {
  const arch = String(recipe.archetype || 'crate').toLowerCase();
  const d = recipe.dimensions || { width: 1, depth: 1, height: 1 };
  const w = d.width, dep = d.depth, h = d.height;
  const v = recipe.variants || {};

  if (arch === 'chest') {
    const bh = h * 0.6;
    return [
      { name: 'Chest_Body', shape: 'box', position: [0, 0, bh * 0.5], scale: [w, dep, bh], materialSlot: 'primary' },
      { name: 'Chest_Lid', shape: 'cylinder', position: [0, 0, bh + h * 0.16], rotationDeg: [0, 90, 0], scale: [dep * 0.96, dep * 0.96, w * 1.01], materialSlot: 'primary', smooth: true },
      { name: 'Chest_Rim', shape: 'box', position: [0, 0, bh], scale: [w * 1.05, dep * 1.05, h * 0.08], materialSlot: 'secondary' },
      { name: 'Chest_BandL', shape: 'box', position: [-w * 0.36, 0, bh * 0.5], scale: [w * 0.09, dep * 1.06, bh], materialSlot: 'secondary' },
      { name: 'Chest_BandR', shape: 'box', position: [w * 0.36, 0, bh * 0.5], scale: [w * 0.09, dep * 1.06, bh], materialSlot: 'secondary' },
      { name: 'Chest_Lock', shape: 'box', position: [0, -dep * 0.53, bh * 0.9], scale: [w * 0.18, dep * 0.08, h * 0.22], materialSlot: 'secondary' },
      { name: 'Chest_Gem', shape: 'icosphere', position: [0, -dep * 0.57, bh * 0.9], scale: [w * 0.14, w * 0.14, w * 0.14], materialSlot: 'accent' },
    ];
  }
  if (arch === 'tree') {
    const th = h * 0.42;
    const tr = Math.min(w, dep) * 0.28;
    const parts = [
      { name: 'Tree_Trunk', shape: 'cylinder', position: [0, 0, th * 0.5], scale: [tr, tr, th], topRadiusRatio: 0.58, materialSlot: 'secondary' },
    ];
    if (v.pine || v.snowy) {
      for (let i = 0; i < 3; i++) {
        const cr = Math.min(w, dep) * (1.0 - i * 0.24);
        const ch = h * (0.34 - i * 0.04);
        const zc = th * 0.85 + i * (h * 0.18) + ch * 0.35;
        parts.push({ name: `Tree_Pine_${i}`, shape: 'cone', position: [0, 0, zc], scale: [cr, cr, ch], materialSlot: 'primary', segments: 10 });
        if (v.snowy) {
          parts.push({ name: `Tree_Snow_${i}`, shape: 'cone', position: [0, 0, zc + ch * 0.3], scale: [cr * 0.78, cr * 0.78, ch * 0.45], materialSlot: 'snow', segments: 10 });
        }
      }
    } else {
      const cr = Math.min(w, dep) * 0.72;
      parts.push({ name: 'Tree_Canopy_0', shape: 'icosphere', position: [0, 0, th + cr * 0.42], scale: [cr, cr, cr * 0.92], materialSlot: 'primary' });
      parts.push({ name: 'Tree_Canopy_1', shape: 'icosphere', position: [cr * 0.3, 0, th + cr * 0.2], scale: [cr * 0.7, cr * 0.7, cr * 0.65], materialSlot: 'primary' });
      parts.push({ name: 'Tree_Canopy_2', shape: 'icosphere', position: [-cr * 0.3, 0.1, th + cr * 0.25], scale: [cr * 0.72, cr * 0.72, cr * 0.68], materialSlot: 'primary' });
    }
    return parts;
  }
  if (arch === 'sword') {
    const bw = Math.max(0.08, Math.min(w, h * 0.14));
    return [
      { name: 'Sword_Pommel', shape: 'sphere', position: [0, 0, bw * 0.45], scale: [bw * 0.8, bw * 0.8, bw * 0.8], materialSlot: 'secondary', smooth: true },
      { name: 'Sword_Grip', shape: 'cylinder', position: [0, 0, h * 0.16], scale: [bw * 0.45, bw * 0.45, h * 0.22], materialSlot: 'dark', smooth: true },
      { name: 'Sword_Guard', shape: 'box', position: [0, 0, h * 0.28], scale: [bw * 3.1, bw * 0.6, bw * 0.45], materialSlot: 'secondary' },
      { name: 'Sword_Gem', shape: 'icosphere', position: [0, 0, h * 0.28], scale: [bw * 0.5, bw * 0.5, bw * 0.5], materialSlot: 'accent' },
      { name: 'Sword_Blade', shape: 'box', position: [0, 0, h * 0.62], scale: [bw * 0.9, bw * 0.24, h * 0.64], materialSlot: v.glowing ? 'accent' : 'primary' },
      { name: 'Sword_Tip', shape: 'cone', position: [0, 0, h * 0.97], scale: [bw * 0.9, bw * 0.24, h * 0.14], materialSlot: v.glowing ? 'accent' : 'primary', segments: 4 },
    ];
  }
  if (arch === 'tower') {
    const r = Math.min(w, dep) * 0.9;
    return [
      { name: 'Tower_Base', shape: 'cylinder', position: [0, 0, h * 0.07], scale: [r * 1.15, r * 1.15, h * 0.14], topRadiusRatio: 0.84, materialSlot: 'secondary', segments: 12 },
      { name: 'Tower_Shaft', shape: 'cylinder', position: [0, 0, h * 0.46], scale: [r * 0.95, r * 0.95, h * 0.68], topRadiusRatio: 0.9, materialSlot: 'primary', segments: 12 },
      { name: 'Tower_Crown', shape: 'cylinder', position: [0, 0, h * 0.80], scale: [r * 1.06, r * 1.06, h * 0.08], materialSlot: 'secondary', segments: 12 },
      { name: 'Tower_Roof', shape: 'cone', position: [0, 0, h * 0.95], scale: [r * 1.12, r * 1.12, h * 0.28], materialSlot: 'secondary', segments: 12 },
      { name: 'Tower_Window', shape: 'box', position: [0, -r * 0.45, h * 0.56], scale: [r * 0.18, r * 0.18, h * 0.14], materialSlot: 'accent' },
    ];
  }
  if (arch === 'crystal') {
    return [
      { name: 'Crystal_Base', shape: 'icosphere', position: [0, 0, h * 0.12], scale: [w, dep, h * 0.26], materialSlot: 'secondary' },
      { name: 'Crystal_Main', shape: 'cone', position: [0, 0, h * 0.52], scale: [w * 0.42, dep * 0.42, h * 0.86], materialSlot: 'accent', segments: 6 },
      { name: 'Crystal_SideA', shape: 'cone', position: [w * 0.2, 0.08, h * 0.36], rotationDeg: [-16, 22, 20], scale: [w * 0.28, dep * 0.28, h * 0.58], materialSlot: 'accent', segments: 6 },
      { name: 'Crystal_SideB', shape: 'cone', position: [-w * 0.18, -0.08, h * 0.32], rotationDeg: [18, -22, -15], scale: [w * 0.26, dep * 0.26, h * 0.52], materialSlot: 'accent', segments: 6 },
    ];
  }
  if (arch === 'robot') {
    return [
      { name: 'Robot_LegL', shape: 'box', position: [-w * 0.18, 0, h * 0.17], scale: [w * 0.22, dep * 0.28, h * 0.34], materialSlot: 'secondary' },
      { name: 'Robot_LegR', shape: 'box', position: [w * 0.18, 0, h * 0.17], scale: [w * 0.22, dep * 0.28, h * 0.34], materialSlot: 'secondary' },
      { name: 'Robot_Torso', shape: 'box', position: [0, 0, h * 0.54], scale: [w * 0.58, dep * 0.42, h * 0.36], materialSlot: 'primary' },
      { name: 'Robot_Core', shape: 'cylinder', position: [0, -dep * 0.22, h * 0.56], rotationDeg: [90, 0, 0], scale: [w * 0.16, w * 0.16, dep * 0.08], materialSlot: 'accent', smooth: true },
      { name: 'Robot_ArmL', shape: 'box', position: [-w * 0.44, 0, h * 0.54], scale: [w * 0.18, dep * 0.22, h * 0.34], materialSlot: 'secondary' },
      { name: 'Robot_ArmR', shape: 'box', position: [w * 0.44, 0, h * 0.54], scale: [w * 0.18, dep * 0.22, h * 0.34], materialSlot: 'secondary' },
      { name: 'Robot_Head', shape: 'box', position: [0, 0, h * 0.85], scale: [w * 0.38, dep * 0.36, h * 0.22], materialSlot: 'primary' },
      { name: 'Robot_Visor', shape: 'box', position: [0, -dep * 0.19, h * 0.86], scale: [w * 0.30, dep * 0.06, h * 0.08], materialSlot: 'accent' },
    ];
  }
  if (arch === 'car') {
    const wr = h * 0.24;
    return [
      { name: 'Car_Body', shape: 'box', position: [0, 0, wr + h * 0.18], scale: [w * 0.92, dep, h * 0.38], materialSlot: 'primary' },
      { name: 'Car_Cabin', shape: 'box', position: [0, dep * 0.05, wr + h * 0.50], scale: [w * 0.78, dep * 0.52, h * 0.34], materialSlot: 'secondary' },
      { name: 'Wheel_FL', shape: 'cylinder', position: [-w * 0.45, -dep * 0.3, wr], rotationDeg: [0, 90, 0], scale: [wr * 2, wr * 2, w * 0.18], materialSlot: 'dark', smooth: true },
      { name: 'Wheel_FR', shape: 'cylinder', position: [w * 0.45, -dep * 0.3, wr], rotationDeg: [0, 90, 0], scale: [wr * 2, wr * 2, w * 0.18], materialSlot: 'dark', smooth: true },
      { name: 'Wheel_RL', shape: 'cylinder', position: [-w * 0.45, dep * 0.3, wr], rotationDeg: [0, 90, 0], scale: [wr * 2, wr * 2, w * 0.18], materialSlot: 'dark', smooth: true },
      { name: 'Wheel_RR', shape: 'cylinder', position: [w * 0.45, dep * 0.3, wr], rotationDeg: [0, 90, 0], scale: [wr * 2, wr * 2, w * 0.18], materialSlot: 'dark', smooth: true },
      { name: 'Headlight_L', shape: 'box', position: [-w * 0.28, -dep * 0.51, wr + h * 0.2], scale: [w * 0.16, dep * 0.04, h * 0.1], materialSlot: 'accent' },
      { name: 'Headlight_R', shape: 'box', position: [w * 0.28, -dep * 0.51, wr + h * 0.2], scale: [w * 0.16, dep * 0.04, h * 0.1], materialSlot: 'accent' },
    ];
  }

  // Generic crate/prop fallback
  return [
    { name: 'Prop_Core', shape: 'box', position: [0, 0, h * 0.5], scale: [w * 0.92, dep * 0.92, h * 0.92], materialSlot: 'primary' },
    { name: 'Prop_FrameTop', shape: 'box', position: [0, 0, h * 0.94], scale: [w, dep, h * 0.1], materialSlot: 'secondary' },
    { name: 'Prop_FrameBot', shape: 'box', position: [0, 0, h * 0.06], scale: [w, dep, h * 0.1], materialSlot: 'secondary' },
  ];
}

function packGlb(rootName, meshEntries, materials) {
  const binChunks = [];
  let binOffset = 0;

  function pushBuffer(typedArray) {
    const raw = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    const offset = binOffset;
    binChunks.push(raw);
    if (pad > 0) binChunks.push(Buffer.alloc(pad, 0));
    binOffset += raw.length + pad;
    return { byteOffset: offset, byteLength: raw.length };
  }

  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const childNodeIndices = [];

  for (const entry of meshEntries) {
    const geo = entry.geometry;
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const posArr = posAttr.array instanceof Float32Array ? posAttr.array : new Float32Array(posAttr.array);
    const normArr = normAttr.array instanceof Float32Array ? normAttr.array : new Float32Array(normAttr.array);

    const minP = [Infinity, Infinity, Infinity];
    const maxP = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posArr.length; i += 3) {
      minP[0] = Math.min(minP[0], posArr[i]);
      minP[1] = Math.min(minP[1], posArr[i + 1]);
      minP[2] = Math.min(minP[2], posArr[i + 2]);
      maxP[0] = Math.max(maxP[0], posArr[i]);
      maxP[1] = Math.max(maxP[1], posArr[i + 1]);
      maxP[2] = Math.max(maxP[2], posArr[i + 2]);
    }

    const posView = pushBuffer(posArr);
    const posViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: posView.byteOffset, byteLength: posView.byteLength, target: 34962 });
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      componentType: 5126,
      count: posArr.length / 3,
      type: 'VEC3',
      min: minP,
      max: maxP,
    });

    const normView = pushBuffer(normArr);
    const normViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: normView.byteOffset, byteLength: normView.byteLength, target: 34962 });
    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      componentType: 5126,
      count: normArr.length / 3,
      type: 'VEC3',
    });

    const primitive = {
      attributes: { POSITION: posAccIdx, NORMAL: normAccIdx },
      material: entry.materialIndex,
      mode: 4,
    };

    if (geo.index) {
      const idxSrc = geo.index.array;
      const needsUint32 = posArr.length / 3 > 65535;
      const idxArr = needsUint32 ? new Uint32Array(idxSrc) : new Uint16Array(idxSrc);
      const idxView = pushBuffer(idxArr);
      const idxViewIdx = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: idxView.byteOffset, byteLength: idxView.byteLength, target: 34963 });
      const idxAccIdx = accessors.length;
      accessors.push({
        bufferView: idxViewIdx,
        componentType: needsUint32 ? 5125 : 5123,
        count: idxArr.length,
        type: 'SCALAR',
      });
      primitive.indices = idxAccIdx;
    }

    const meshIdx = meshes.length;
    meshes.push({ name: entry.name, primitives: [primitive] });
    const nodeIdx = nodes.length;
    nodes.push({ name: entry.name, mesh: meshIdx });
    childNodeIndices.push(nodeIdx);
  }

  const rootNodeIdx = nodes.length;
  nodes.push({ name: rootName, children: childNodeIndices });

  const gltfMaterials = materials.map(m => ({
    name: m.name,
    pbrMetallicRoughness: {
      baseColorFactor: m.baseColorFactor,
      metallicFactor: m.metallicFactor,
      roughnessFactor: m.roughnessFactor,
    },
    ...(m.emissiveFactor.some(v => v > 0) ? { emissiveFactor: m.emissiveFactor } : {}),
  }));

  const binBuf = Buffer.concat(binChunks);
  const gltfJson = {
    asset: { version: '2.0', generator: `PlayForge Three.js Headless Worker (three@${THREE.REVISION})` },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [rootNodeIdx] }],
    nodes,
    meshes,
    materials: gltfMaterials,
    buffers: [{ byteLength: binBuf.length }],
    bufferViews,
    accessors,
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonBuf = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]);
}

function main() {
  let resPath = null;
  try {
    const parsed = parseArgs(process.argv);
    const reqPath = parsed.reqPath;
    resPath = parsed.resPath;

    const started = performance.now();
    const request = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
    if (Number(request.schemaVersion) !== SCHEMA_VERSION) {
      throw new Error(`Unsupported request schemaVersion: ${request.schemaVersion}`);
    }
    const recipe = request.recipe;
    if (!recipe || typeof recipe !== 'object') throw new Error('Missing recipe in request.json');

    const reqDir = path.dirname(reqPath);
    const relGlb = String(request.output?.glbPath || 'output.glb');
    const outGlb = path.resolve(reqDir, relGlb);
    if (path.relative(reqDir, outGlb).startsWith('..')) {
      throw new Error('Output glbPath escapes job directory');
    }

    const slotMaterials = createMaterialSlots(recipe);
    const materials = [];
    const matIndexByKey = new Map();
    function getMatIndex(part) {
      let spec;
      if (part.color !== undefined || part.metallic !== undefined || part.roughness !== undefined || part.emissionStrength !== undefined) {
        spec = makeMaterialSpec(`Mat_Part_${materials.length + 1}`, part.color || '#888888', {
          metallic: part.metallic ?? 0.2,
          roughness: part.roughness ?? 0.45,
          emissionStrength: part.emissionStrength ?? 0,
        });
      } else {
        spec = slotMaterials[part.materialSlot || 'primary'] || slotMaterials.primary;
      }
      const key = JSON.stringify([spec.baseColorFactor, spec.metallicFactor, spec.roughnessFactor, spec.emissiveFactor]);
      if (!matIndexByKey.has(key)) {
        matIndexByKey.set(key, materials.length);
        materials.push(spec);
      }
      return matIndexByKey.get(key);
    }

    const allParts = [];
    if (recipe.archetype && recipe.archetype !== 'custom') {
      allParts.push(...buildArchetypeParts(recipe));
    }
    if (Array.isArray(recipe.parts) && recipe.parts.length) {
      allParts.push(...recipe.parts);
    }
    if (!allParts.length) {
      throw new Error('Recipe produced zero parts');
    }

    const meshEntries = allParts.map((part, idx) => ({
      name: part.name || `Part_${idx + 1}`,
      geometry: buildPartGeometry(part),
      materialIndex: getMatIndex(part),
    }));

    // Compute world bounding box and normalize pivot to bottom-center (Y=0)
    const box = new THREE.Box3();
    for (const entry of meshEntries) {
      entry.geometry.computeBoundingBox();
      box.union(entry.geometry.boundingBox);
    }
    if (request.output?.normalizePivot !== 'none' && !box.isEmpty()) {
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;
      const minY = box.min.y;
      for (const entry of meshEntries) {
        entry.geometry.translate(-cx, -minY, -cz);
        entry.geometry.computeBoundingBox();
      }
      box.translate(new THREE.Vector3(-cx, -minY, -cz));
    }

    let vertexCount = 0;
    let triangleCount = 0;
    for (const entry of meshEntries) {
      const pCount = entry.geometry.attributes.position.count;
      vertexCount += pCount;
      triangleCount += entry.geometry.index ? Math.floor(entry.geometry.index.count / 3) : Math.floor(pCount / 3);
    }

    const glbBuffer = packGlb(recipe.name || 'GeneratedProp', meshEntries, materials);
    fs.writeFileSync(outGlb, glbBuffer);

    const durationMs = Math.round(performance.now() - started);
    const gltfMin = [Number(box.min.x.toFixed(4)), Number(box.min.y.toFixed(4)), Number(box.min.z.toFixed(4))];
    const gltfMax = [Number(box.max.x.toFixed(4)), Number(box.max.y.toFixed(4)), Number(box.max.z.toFixed(4))];
    const gltfSize = gltfMax.map((v, i) => Number((v - gltfMin[i]).toFixed(4)));

    const response = {
      schemaVersion: SCHEMA_VERSION,
      jobId: String(request.jobId || 'unknown'),
      ok: true,
      engine: {
        id: 'threejs-cli',
        version: `three@r${THREE.REVISION}`,
      },
      artifact: {
        glbPath: relGlb,
        format: 'GLB',
        bytes: glbBuffer.length,
      },
      metrics: {
        objectCount: meshEntries.length,
        meshCount: meshEntries.length,
        vertexCount,
        triangleCount,
        materialCount: materials.length,
        boundingBox: { min: gltfMin, max: gltfMax, size: gltfSize },
        durationMs,
      },
      warnings: [],
    };
    fs.writeFileSync(resPath, JSON.stringify(response, null, 2), 'utf8');
  } catch (err) {
    const errPayload = {
      schemaVersion: SCHEMA_VERSION,
      ok: false,
      error: err?.message || String(err),
    };
    if (resPath) {
      try { fs.writeFileSync(resPath, JSON.stringify(errPayload, null, 2), 'utf8'); } catch { /* ignore */ }
    }
    process.stderr.write(`[PlayForge Three.js Worker Error] ${errPayload.error}\n`);
    process.exit(1);
  }
}

main();
