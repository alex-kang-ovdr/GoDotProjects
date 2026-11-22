(function () {
  'use strict';

  // Zero-dependency WebGL glTF 2.0 (.glb) 3D Avatar Viewer for PlayHub Web Avatar Shop & Locker.
  // Supports binary GLB chunks, skeletal skinning (JOINTS_0/WEIGHTS_0 + inverseBindMatrices),
  // real glTF keyframe animations (Idle + Emotes), live bone-socket attachments,
  // avatar-render-profile.v1 3-point studio lighting + ACES filmic tone mapping,
  // drag orbit, and camera presets.

  const GL_FLOAT = 5126;
  const GL_UNSIGNED_SHORT = 5123;
  const GL_UNSIGNED_INT = 5125;
  const GL_UNSIGNED_BYTE = 5121;
  const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  const DEFAULT_RENDER_PROFILE = {
    profileId: 'playhub_studio_v1',
    tonemapping: 'aces',
    exposure: 1.05,
    backgroundHex: '#10231e',
    lights: {
      key: { direction: [-0.55, -0.82, -0.62], colorHex: '#fff8ec', intensity: 1.25 },
      fill: { direction: [0.65, -0.25, -0.55], colorHex: '#bfe3ff', intensity: 0.55 },
      rim: { direction: [0.45, -0.35, 0.82], colorHex: '#deeca6', intensity: 0.85 },
    },
  };

  function hexToRgb(hex, fallback = [1, 1, 1]) {
    if (typeof hex !== 'string') return fallback;
    const m = hex.trim().match(/^#?([0-9a-f]{6})/i);
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function normVec3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mat4MulInto(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }
  function mat4Mul(a, b) {
    return mat4MulInto(new Float32Array(16), a, b);
  }
  function mat4FromTRSInto(out, t, q, s) {
    const tx = t ? t[0] : 0, ty = t ? t[1] : 0, tz = t ? t[2] : 0;
    const x = q ? q[0] : 0, y = q ? q[1] : 0, z = q ? q[2] : 0, w = q ? q[3] : 1;
    const sx = s ? s[0] : 1, sy = s ? s[1] : 1, sz = s ? s[2] : 1;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx; out[2] = (xz - wy) * sx; out[3] = 0;
    out[4] = (xy - wz) * sy; out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy; out[7] = 0;
    out[8] = (xz + wy) * sz; out[9] = (yz - wx) * sz; out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
    out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
    return out;
  }
  function mat4FromTRS(t, q, s) {
    return mat4FromTRSInto(new Float32Array(16), t, q, s);
  }
  function mat4FromEulerDeg(rx, ry, rz) {
    const d = Math.PI / 180;
    const cx = Math.cos(rx * d), sx = Math.sin(rx * d);
    const cy = Math.cos(ry * d), sy = Math.sin(ry * d);
    const cz = Math.cos(rz * d), sz = Math.sin(rz * d);
    const my = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
    const mx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
    const mz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return mat4Mul(mat4Mul(my, mx), mz);
  }
  function mat4Perspective(fovRad, aspect, near, far) {
    const f = 1 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function mat4LookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1,
    ]);
  }
  function transformPoint(m, x, y, z) {
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
  }
  function quatSlerpInto(out, ax, ay, az, aw, bx, by, bz, bw, t) {
    let dot = ax * bx + ay * by + az * bz + aw * bw;
    if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (1 - dot > 1e-4) {
      const omega = Math.acos(Math.min(1, dot));
      const sinO = Math.sin(omega);
      s0 = Math.sin((1 - t) * omega) / sinO;
      s1 = Math.sin(t * omega) / sinO;
    } else {
      s0 = 1 - t;
      s1 = t;
    }
    const rx = s0 * ax + s1 * bx;
    const ry = s0 * ay + s1 * by;
    const rz = s0 * az + s1 * bz;
    const rw = s0 * aw + s1 * bw;
    const inv = 1 / (Math.hypot(rx, ry, rz, rw) || 1);
    out[0] = rx * inv; out[1] = ry * inv; out[2] = rz * inv; out[3] = rw * inv;
  }

  function readAccessor(doc, binBytes, accIndex, { forceFloatNormalized = false } = {}) {
    const acc = doc.accessors[accIndex];
    const bv = doc.bufferViews[acc.bufferView];
    const count = acc.count;
    const comps = TYPE_COUNT[acc.type] || 1;
    const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 0;
    const view = new DataView(binBytes.buffer, binBytes.byteOffset, binBytes.byteLength);

    if (acc.componentType === GL_FLOAT) {
      const out = new Float32Array(count * comps);
      const step = stride || comps * 4;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getFloat32(offset + i * step + c * 4, true);
        }
      }
      return out;
    }
    if (acc.componentType === GL_UNSIGNED_SHORT) {
      const out = forceFloatNormalized || acc.normalized ? new Float32Array(count * comps) : new Uint16Array(count * comps);
      const scale = (forceFloatNormalized || acc.normalized) ? (1 / 65535) : 1;
      const step = stride || comps * 2;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getUint16(offset + i * step + c * 2, true) * scale;
        }
      }
      return out;
    }
    if (acc.componentType === GL_UNSIGNED_INT) {
      const out = new Uint32Array(count * comps);
      const step = stride || comps * 4;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getUint32(offset + i * step + c * 4, true);
        }
      }
      return out;
    }
    if (acc.componentType === GL_UNSIGNED_BYTE) {
      const out = forceFloatNormalized || acc.normalized ? new Float32Array(count * comps) : new Uint16Array(count * comps);
      const scale = (forceFloatNormalized || acc.normalized) ? (1 / 255) : 1;
      const step = stride || comps;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getUint8(offset + i * step + c) * scale;
        }
      }
      return out;
    }
    return new Float32Array(0);
  }

  function computeFlatNormals(positions, indices) {
    const normals = new Float32Array(positions.length);
    const len = indices ? indices.length : positions.length / 3;
    for (let i = 0; i < len; i += 3) {
      const i0 = (indices ? indices[i] : i) * 3;
      const i1 = (indices ? indices[i + 1] : i + 1) * 3;
      const i2 = (indices ? indices[i + 2] : i + 2) * 3;
      const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
      const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (const idx of [i0, i1, i2]) {
        normals[idx] += nx; normals[idx + 1] += ny; normals[idx + 2] += nz;
      }
    }
    for (let i = 0; i < normals.length; i += 3) {
      const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
    }
    return normals;
  }

  function parseGlb(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB magic');
    let offset = 12;
    let doc = null;
    let binBytes = new Uint8Array(0);
    while (offset + 8 <= arrayBuffer.byteLength) {
      const chunkLen = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x4e4f534a) {
        doc = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer, offset, chunkLen)));
      } else if (chunkType === 0x004e4942) {
        binBytes = new Uint8Array(arrayBuffer, offset, chunkLen);
      }
      offset += chunkLen;
    }
    if (!doc) throw new Error('GLB missing JSON chunk');

    const nodes = doc.nodes || [];
    const scene = (doc.scenes || [])[doc.scene || 0] || { nodes: [] };
    const rootNodes = [...(scene.nodes || [])];
    const nodeDefs = nodes.map((n) => ({
      name: n.name || '',
      children: [...(n.children || [])],
      hasMatrix: Array.isArray(n.matrix) && n.matrix.length === 16,
      matrix: Array.isArray(n.matrix) && n.matrix.length === 16 ? new Float32Array(n.matrix) : null,
      t: n.translation ? [n.translation[0], n.translation[1], n.translation[2]] : [0, 0, 0],
      q: n.rotation ? [n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]] : [0, 0, 0, 1],
      s: n.scale ? [n.scale[0], n.scale[1], n.scale[2]] : [1, 1, 1],
    }));

    const worldMatrices = nodes.map(() => mat4Identity());
    const nodeIndexByName = new Map();
    const nodesByName = new Map();

    function visitBind(idx, parentMat) {
      const def = nodeDefs[idx];
      if (!def) return;
      const local = def.hasMatrix ? def.matrix : mat4FromTRS(def.t, def.q, def.s);
      mat4MulInto(worldMatrices[idx], parentMat, local);
      if (def.name) {
        nodeIndexByName.set(def.name, idx);
        nodeIndexByName.set(def.name.toLowerCase(), idx);
        nodesByName.set(def.name, worldMatrices[idx]);
        nodesByName.set(def.name.toLowerCase(), worldMatrices[idx]);
      }
      for (const child of def.children) visitBind(child, worldMatrices[idx]);
    }
    const idMat = mat4Identity();
    for (const rootIdx of rootNodes) visitBind(rootIdx, idMat);

    // Parse skins (joints + inverseBindMatrices)
    const skins = (doc.skins || []).map((sk) => {
      const joints = [...(sk.joints || [])];
      const ibmFlat = sk.inverseBindMatrices !== undefined
        ? readAccessor(doc, binBytes, sk.inverseBindMatrices)
        : null;
      const ibms = joints.map((_, j) => {
        if (ibmFlat && (j + 1) * 16 <= ibmFlat.length) {
          return ibmFlat.subarray(j * 16, (j + 1) * 16);
        }
        return mat4Identity();
      });
      return { joints, ibms };
    });

    // Parse keyframe animations
    const animations = new Map();
    for (const anim of doc.animations || []) {
      const name = anim.name || `anim_${animations.size}`;
      const channels = [];
      let duration = 0;
      for (const ch of anim.channels || []) {
        const nodeIdx = ch.target?.node;
        const pathName = ch.target?.path;
        if (nodeIdx === undefined || !['translation', 'rotation', 'scale'].includes(pathName)) continue;
        const sampler = anim.samplers?.[ch.sampler];
        if (!sampler || sampler.input === undefined || sampler.output === undefined) continue;
        const times = readAccessor(doc, binBytes, sampler.input);
        const values = readAccessor(doc, binBytes, sampler.output);
        if (!times.length || !values.length) continue;
        const lastT = times[times.length - 1];
        if (lastT > duration) duration = lastT;
        channels.push({
          node: nodeIdx,
          path: pathName,
          times,
          values,
          interpolation: sampler.interpolation || 'LINEAR',
        });
      }
      if (channels.length > 0) {
        animations.set(name, { name, duration: Math.max(0.05, duration), channels });
      }
    }

    const images = (doc.images || []).map((img) => {
      if (img.bufferView === undefined) return null;
      const bv = doc.bufferViews[img.bufferView];
      const slice = binBytes.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      return new Blob([slice], { type: img.mimeType || 'image/png' });
    });

    const parentNames = new Array(nodes.length).fill('');
    for (let i = 0; i < nodes.length; i++) {
      for (const c of nodes[i].children || []) parentNames[c] = nodes[i].name || '';
    }

    const drawables = [];
    let minY = Infinity, maxY = -Infinity, maxRadius = 0.2;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.mesh === undefined) continue;
      const parentName = parentNames[i] || '';
      const mesh = doc.meshes[node.mesh];
      const world = worldMatrices[i] || mat4Identity();
      const skinIndex = node.skin !== undefined && skins[node.skin] ? node.skin : -1;
      const isBundledHandProp = parentName === 'handslot.l' || parentName === 'handslot.r';
      const isRemovableHeadgear = parentName === 'head' && /(helmet|hat)/i.test(node.name || '');
      for (const prim of mesh.primitives || []) {
        if (prim.attributes?.POSITION === undefined) continue;
        const pos = readAccessor(doc, binBytes, prim.attributes.POSITION);
        const indices = prim.indices !== undefined ? readAccessor(doc, binBytes, prim.indices) : null;
        const norm = prim.attributes.NORMAL !== undefined
          ? readAccessor(doc, binBytes, prim.attributes.NORMAL)
          : computeFlatNormals(pos, indices);
        const uv = prim.attributes.TEXCOORD_0 !== undefined
          ? readAccessor(doc, binBytes, prim.attributes.TEXCOORD_0)
          : new Float32Array((pos.length / 3) * 2);
        let joints0 = null;
        let weights0 = null;
        if (skinIndex >= 0 && prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined) {
          joints0 = readAccessor(doc, binBytes, prim.attributes.JOINTS_0);
          weights0 = readAccessor(doc, binBytes, prim.attributes.WEIGHTS_0, { forceFloatNormalized: true });
        }
        const matDef = prim.material !== undefined ? doc.materials?.[prim.material] : null;
        const pbr = matDef?.pbrMetallicRoughness || {};
        const color = pbr.baseColorFactor || [0.85, 0.87, 0.9, 1.0];
        const emissive = matDef?.emissiveFactor || [0, 0, 0];
        let imageIndex = -1;
        if (pbr.baseColorTexture?.index !== undefined) {
          const tex = doc.textures?.[pbr.baseColorTexture.index];
          if (tex && tex.source !== undefined) imageIndex = tex.source;
        }
        if (!isBundledHandProp) {
          const step = Math.max(1, Math.floor((pos.length / 3) / 120));
          for (let v = 0; v < pos.length / 3; v += step) {
            const pt = transformPoint(world, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
            const r = Math.hypot(pt[0], pt[2]);
            if (r > maxRadius) maxRadius = r;
          }
        }
        drawables.push({
          nodeIndex: i,
          nodeName: node.name || '',
          parentName,
          skinIndex,
          isBundledHandProp,
          isRemovableHeadgear,
          world,
          positions: pos,
          normals: norm,
          uvs: uv,
          joints0,
          weights0,
          indices,
          color,
          emissive,
          imageIndex,
        });
      }
    }
    if (!Number.isFinite(minY)) { minY = 0; maxY = 2; }
    return {
      drawables,
      images,
      nodeDefs,
      rootNodes,
      nodeIndexByName,
      nodesByName,
      skins,
      animations,
      bounds: { minY, maxY, height: Math.max(0.1, maxY - minY), maxRadius },
    };
  }

  function sampleChannel(ch, timeSec, outArr) {
    const times = ch.times;
    const n = times.length;
    const stride = ch.path === 'rotation' ? 4 : 3;
    const vals = ch.values;
    const isCubic = ch.interpolation === 'CUBICSPLINE';
    const keyStride = isCubic ? stride * 3 : stride;
    const valOffset = isCubic ? stride : 0;

    if (n === 1 || timeSec <= times[0]) {
      for (let c = 0; c < stride; c++) outArr[c] = vals[valOffset + c];
      return;
    }
    if (timeSec >= times[n - 1]) {
      const base = (n - 1) * keyStride + valOffset;
      for (let c = 0; c < stride; c++) outArr[c] = vals[base + c];
      return;
    }
    // Binary search keyframe interval
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= timeSec) lo = mid; else hi = mid;
    }
    const t0 = times[lo], t1 = times[hi];
    const alpha = t1 > t0 ? (timeSec - t0) / (t1 - t0) : 0;
    const b0 = lo * keyStride + valOffset;
    if (ch.interpolation === 'STEP') {
      for (let c = 0; c < stride; c++) outArr[c] = vals[b0 + c];
      return;
    }
    const b1 = hi * keyStride + valOffset;
    if (ch.path === 'rotation') {
      quatSlerpInto(outArr, vals[b0], vals[b0 + 1], vals[b0 + 2], vals[b0 + 3], vals[b1], vals[b1 + 1], vals[b1 + 2], vals[b1 + 3], alpha);
    } else {
      for (let c = 0; c < 3; c++) outArr[c] = vals[b0 + c] + (vals[b1 + c] - vals[b0 + c]) * alpha;
    }
  }

  const VS_SRC = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUv;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vNorm;
    varying vec2 vUv;
    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vNorm = normalize(mat3(uModel) * aNorm);
      vUv = aUv;
      gl_Position = uProj * uView * wp;
    }
  `;

  // ACES Filmic tone mapping + 3-point avatar-render-profile.v1 studio lighting
  const FS_SRC = `
    precision mediump float;
    varying vec3 vNorm;
    varying vec2 vUv;
    uniform vec4 uColor;
    uniform vec3 uEmissive;
    uniform float uHasTex;
    uniform sampler2D uTex;
    uniform vec3 uKeyDir;
    uniform vec3 uKeyCol;
    uniform vec3 uFillDir;
    uniform vec3 uFillCol;
    uniform vec3 uRimDir;
    uniform vec3 uRimCol;
    uniform float uExposure;

    vec3 acesToneMap(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec4 base = uColor;
      if (uHasTex > 0.5) base *= texture2D(uTex, vUv);
      vec3 albedo = pow(max(base.rgb, vec3(0.0)), vec3(2.2));
      vec3 n = normalize(vNorm);
      float keyDiff = max(dot(n, uKeyDir), 0.0);
      float fillDiff = max(dot(n, uFillDir), 0.0);
      float rimDiff = max(dot(n, uRimDir), 0.0);
      float hemi = n.y * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.22, 0.28, 0.30), vec3(0.42, 0.48, 0.52), hemi);
      vec3 linearLit = albedo * (ambient + keyDiff * uKeyCol + fillDiff * uFillCol + rimDiff * uRimCol * 0.55) + uEmissive;
      vec3 mapped = acesToneMap(linearLit * uExposure);
      gl_FragColor = vec4(pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.2)), base.a);
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function createAvatarGlbViewer(canvas, options = {}) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true });
    if (!gl) {
      return {
        supported: false,
        renderer: 'web-js',
        setRenderProfile: () => {},
        setLoadout: async () => {},
        setCameraPreset: () => {},
        triggerEmotePreview: () => {},
        getDiagnostics: () => ({ renderer: 'web-js', supported: false }),
        destroy: () => {},
      };
    }

    const uintExt = gl.getExtension('OES_element_index_uint');
    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS_SRC));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNorm: gl.getAttribLocation(prog, 'aNorm'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uProj: gl.getUniformLocation(prog, 'uProj'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
      uHasTex: gl.getUniformLocation(prog, 'uHasTex'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uKeyDir: gl.getUniformLocation(prog, 'uKeyDir'),
      uKeyCol: gl.getUniformLocation(prog, 'uKeyCol'),
      uFillDir: gl.getUniformLocation(prog, 'uFillDir'),
      uFillCol: gl.getUniformLocation(prog, 'uFillCol'),
      uRimDir: gl.getUniformLocation(prog, 'uRimDir'),
      uRimCol: gl.getUniformLocation(prog, 'uRimCol'),
      uExposure: gl.getUniformLocation(prog, 'uExposure'),
    };

    const whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    const cache = new Map();
    const gpuCache = new Map();

    async function fetchParsedGlb(url) {
      if (cache.has(url)) return cache.get(url);
      const promise = (async () => {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Failed to fetch GLB: ${res.status}`);
        const buf = await res.arrayBuffer();
        return parseGlb(buf);
      })();
      cache.set(url, promise);
      try {
        return await promise;
      } catch (err) {
        cache.delete(url);
        throw err;
      }
    }

    async function uploadGlbToGpu(url) {
      if (gpuCache.has(url)) return gpuCache.get(url);
      const parsed = await fetchParsedGlb(url);
      const textures = [];
      for (const blob of parsed.images) {
        if (!blob) { textures.push(null); continue; }
        try {
          const bmp = await createImageBitmap(blob);
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
          bmp.close?.();
          textures.push(tex);
        } catch {
          textures.push(null);
        }
      }
      const meshes = parsed.drawables.map((d) => {
        const isSkinned = d.skinIndex >= 0 && d.joints0 && d.weights0;
        const usage = isSkinned ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, d.positions, usage);
        const normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, d.normals, usage);
        const uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, d.uvs, gl.STATIC_DRAW);
        let idxBuf = null, idxType = GL_UNSIGNED_SHORT, count = d.positions.length / 3;
        if (d.indices) {
          idxBuf = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
          let arr = d.indices;
          if (arr instanceof Uint32Array && !uintExt) arr = new Uint16Array(arr);
          idxType = arr instanceof Uint32Array ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
          count = arr.length;
        }
        return {
          nodeIndex: d.nodeIndex,
          nodeName: d.nodeName,
          skinIndex: d.skinIndex,
          isSkinned,
          basePositions: isSkinned ? d.positions : null,
          baseNormals: isSkinned ? d.normals : null,
          skinnedPositions: isSkinned ? new Float32Array(d.positions.length) : null,
          skinnedNormals: isSkinned ? new Float32Array(d.normals.length) : null,
          joints0: d.joints0,
          weights0: d.weights0,
          isBundledHandProp: d.isBundledHandProp,
          isRemovableHeadgear: d.isRemovableHeadgear,
          world: d.world,
          posBuf,
          normBuf,
          uvBuf,
          idxBuf,
          idxType,
          count,
          color: d.color,
          emissive: d.emissive,
          tex: d.imageIndex >= 0 ? textures[d.imageIndex] : null,
        };
      });

      // Preallocate runtime animation pose state per GLB asset
      const nodeCount = parsed.nodeDefs.length;
      const animState = {
        localsT: parsed.nodeDefs.map((d) => [d.t[0], d.t[1], d.t[2]]),
        localsQ: parsed.nodeDefs.map((d) => [d.q[0], d.q[1], d.q[2], d.q[3]]),
        localsS: parsed.nodeDefs.map((d) => [d.s[0], d.s[1], d.s[2]]),
        localMats: new Array(nodeCount).fill(null).map(() => mat4Identity()),
        worldMats: new Array(nodeCount).fill(null).map(() => mat4Identity()),
        skinJointMats: parsed.skins.map((sk) => sk.joints.map(() => mat4Identity())),
      };

      const entry = {
        meshes,
        nodeDefs: parsed.nodeDefs,
        rootNodes: parsed.rootNodes,
        nodeIndexByName: parsed.nodeIndexByName,
        nodesByName: parsed.nodesByName,
        skins: parsed.skins,
        animations: parsed.animations,
        animState,
        bounds: parsed.bounds,
      };
      gpuCache.set(url, entry);
      return entry;
    }

    // Studio floor pedestal
    const pedPos = [], pedNorm = [], pedUv = [];
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      pedPos.push(0, 0, 0, Math.cos(a0) * 1.15, 0, Math.sin(a0) * 1.15, Math.cos(a1) * 1.15, 0, Math.sin(a1) * 1.15);
      pedNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      pedUv.push(0.5, 0.5, 0, 0, 1, 1);
    }
    const pedPosBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pedPosBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pedPos), gl.STATIC_DRAW);
    const pedNormBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pedNormBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pedNorm), gl.STATIC_DRAW);
    const pedUvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pedUvBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pedUv), gl.STATIC_DRAW);

    let renderProfile = options.renderProfile || DEFAULT_RENDER_PROFILE;
    let skinGpu = null;
    let skinMeta = null;
    let attachmentGpus = [];
    let yaw = 0.42;
    let pitch = 0.14;
    let distance = 4.45;
    let targetY = 1.15;
    let fovDeg = 42;
    let cameraPreset = 'TPS';
    let dragging = false;
    let dragMoved = false;
    let activePointerId = null;
    let lastX = 0, lastY = 0;
    let autoSpin = true;
    let animClockSec = 0;
    let frameCount = 0;
    let activeClipName = '';
    let emoteAnimRemaining = 0;
    let emoteClipName = '';
    let emoteAnimKind = '';
    let destroyed = false;
    let rafId = 0;
    let loadSerial = 0;
    const listenerCtrl = new AbortController();
    const { signal } = listenerCtrl;

    function applyCameraPreset(preset) {
      cameraPreset = preset || 'TPS';
      if (cameraPreset === 'FPS' || cameraPreset === 'face') {
        yaw = 0.08; pitch = 0.04; distance = 1.65; targetY = 1.60; fovDeg = 42; autoSpin = false;
      } else if (cameraPreset === 'TopDown') {
        yaw = 0.35; pitch = 0.88; distance = 5.6; targetY = 1.00; fovDeg = 42; autoSpin = true;
      } else if (cameraPreset === 'PortraitUpper' || cameraPreset === 'bust') {
        yaw = 0.22; pitch = 0.06; distance = 2.05; targetY = 1.48; fovDeg = 36; autoSpin = false;
      } else if (cameraPreset === 'PortraitFull' || cameraPreset === 'full_body') {
        yaw = 0.26; pitch = 0.10; distance = 4.25; targetY = 1.05; fovDeg = 38; autoSpin = false;
      } else {
        yaw = 0.42; pitch = 0.14; distance = 4.45; targetY = 1.15; fovDeg = 42; autoSpin = true;
      }
    }

    function resolveClipForKey(stateKey) {
      if (!skinGpu || !skinGpu.animations || skinGpu.animations.size === 0) return '';
      const candidates = skinMeta?.rigProfile?.animations?.[stateKey] || [];
      for (const name of candidates) {
        if (skinGpu.animations.has(name)) return name;
      }
      if (skinGpu.animations.has(stateKey)) return stateKey;
      if (stateKey === 'idle') {
        for (const fallback of ['Idle', 'Unarmed_Idle', '2H_Melee_Idle']) {
          if (skinGpu.animations.has(fallback)) return fallback;
        }
        return skinGpu.animations.keys().next().value || '';
      }
      return '';
    }

    function evaluateSkinPose(entry, clipName, timeSec) {
      const st = entry.animState;
      const defs = entry.nodeDefs;
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        st.localsT[i][0] = d.t[0]; st.localsT[i][1] = d.t[1]; st.localsT[i][2] = d.t[2];
        st.localsQ[i][0] = d.q[0]; st.localsQ[i][1] = d.q[1]; st.localsQ[i][2] = d.q[2]; st.localsQ[i][3] = d.q[3];
        st.localsS[i][0] = d.s[0]; st.localsS[i][1] = d.s[1]; st.localsS[i][2] = d.s[2];
      }
      const clip = clipName ? entry.animations.get(clipName) : null;
      if (clip) {
        const t = clip.duration > 0 ? (timeSec % clip.duration) : 0;
        for (const ch of clip.channels) {
          if (ch.path === 'translation') sampleChannel(ch, t, st.localsT[ch.node]);
          else if (ch.path === 'rotation') sampleChannel(ch, t, st.localsQ[ch.node]);
          else if (ch.path === 'scale') sampleChannel(ch, t, st.localsS[ch.node]);
        }
      }
      const visitAnim = (idx, parentMat) => {
        const d = defs[idx];
        if (!d) return;
        const local = d.hasMatrix ? d.matrix : mat4FromTRSInto(st.localMats[idx], st.localsT[idx], st.localsQ[idx], st.localsS[idx]);
        mat4MulInto(st.worldMats[idx], parentMat, local);
        for (const child of d.children) visitAnim(child, st.worldMats[idx]);
      };
      const id = mat4Identity();
      for (const r of entry.rootNodes) visitAnim(r, id);

      for (let sIdx = 0; sIdx < entry.skins.length; sIdx++) {
        const sk = entry.skins[sIdx];
        const jMats = st.skinJointMats[sIdx];
        for (let j = 0; j < sk.joints.length; j++) {
          mat4MulInto(jMats[j], st.worldMats[sk.joints[j]], sk.ibms[j]);
        }
      }

      // Skin vertices & upload dynamic vertex buffers
      for (const m of entry.meshes) {
        if (!m.isSkinned || m.isBundledHandProp) continue;
        const jMats = st.skinJointMats[m.skinIndex];
        const bp = m.basePositions;
        const bn = m.baseNormals;
        const sp = m.skinnedPositions;
        const sn = m.skinnedNormals;
        const j0 = m.joints0;
        const w0 = m.weights0;
        const vCount = bp.length / 3;
        for (let v = 0; v < vCount; v++) {
          const v3 = v * 3;
          const v4 = v * 4;
          const px = bp[v3], py = bp[v3 + 1], pz = bp[v3 + 2];
          const nx = bn[v3], ny = bn[v3 + 1], nz = bn[v3 + 2];
          let ox = 0, oy = 0, oz = 0, onx = 0, ony = 0, onz = 0;
          for (let k = 0; k < 4; k++) {
            const w = w0[v4 + k];
            if (w === 0) continue;
            const jm = jMats[j0[v4 + k]];
            if (!jm) continue;
            ox  += (jm[0] * px + jm[4] * py + jm[8] * pz + jm[12]) * w;
            oy  += (jm[1] * px + jm[5] * py + jm[9] * pz + jm[13]) * w;
            oz  += (jm[2] * px + jm[6] * py + jm[10] * pz + jm[14]) * w;
            onx += (jm[0] * nx + jm[4] * ny + jm[8] * nz) * w;
            ony += (jm[1] * nx + jm[5] * ny + jm[9] * nz) * w;
            onz += (jm[2] * nx + jm[6] * ny + jm[10] * nz) * w;
          }
          sp[v3] = ox; sp[v3 + 1] = oy; sp[v3 + 2] = oz;
          const nl = Math.hypot(onx, ony, onz) || 1;
          sn[v3] = onx / nl; sn[v3 + 1] = ony / nl; sn[v3 + 2] = onz / nl;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, m.posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.normBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sn);
      }
    }

    const interactionEl = canvas.parentElement || canvas;
    if (canvas.style) canvas.style.touchAction = 'none';
    if (interactionEl && interactionEl !== canvas && interactionEl.style) interactionEl.style.touchAction = 'none';

    interactionEl.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, a, select, input')) return;
      e.preventDefault();
      dragging = true;
      dragMoved = false;
      activePointerId = e.pointerId ?? null;
      lastX = e.clientX;
      lastY = e.clientY;
      try { interactionEl.setPointerCapture?.(e.pointerId); } catch {}
    }, { signal });

    interactionEl.addEventListener('touchmove', (e) => {
      if (dragging) e.preventDefault();
    }, { signal, passive: false });

    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (!dragMoved && Math.hypot(dx, dy) >= 2) {
        dragMoved = true;
        autoSpin = false;
      }
      if (dragMoved) {
        e.preventDefault();
        yaw -= dx * 0.012;
        pitch = Math.max(-0.4, Math.min(1.2, pitch + dy * 0.008));
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }, { signal, passive: false });

    const endDrag = (e) => {
      if (!dragging) return;
      if (e && activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
      const pid = activePointerId;
      dragging = false;
      activePointerId = null;
      if (pid !== null) {
        try { interactionEl.releasePointerCapture?.(pid); } catch {}
      }
    };
    window.addEventListener('pointerup', endDrag, { signal });
    window.addEventListener('pointercancel', endDrag, { signal });
    window.addEventListener('blur', () => { dragging = false; activePointerId = null; }, { signal });
    interactionEl.addEventListener('dragstart', (e) => e.preventDefault(), { signal });
    interactionEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      distance = Math.max(1.3, Math.min(7.5, distance + Math.sign(e.deltaY) * 0.25));
    }, { signal, passive: false });

    function applyLightUniforms() {
      const rp = renderProfile || DEFAULT_RENDER_PROFILE;
      const key = rp.lights?.key || DEFAULT_RENDER_PROFILE.lights.key;
      const fill = rp.lights?.fill || DEFAULT_RENDER_PROFILE.lights.fill;
      const rim = rp.lights?.rim || DEFAULT_RENDER_PROFILE.lights.rim;
      const kDir = normVec3([-key.direction[0], -key.direction[1], -key.direction[2]]);
      const fDir = normVec3([-fill.direction[0], -fill.direction[1], -fill.direction[2]]);
      const rDir = normVec3([-rim.direction[0], -rim.direction[1], -rim.direction[2]]);
      const kRgb = hexToRgb(key.colorHex, [1, 0.97, 0.92]);
      const fRgb = hexToRgb(fill.colorHex, [0.75, 0.89, 1]);
      const rRgb = hexToRgb(rim.colorHex, [0.87, 0.93, 0.65]);
      gl.uniform3fv(loc.uKeyDir, kDir);
      gl.uniform3f(loc.uKeyCol, kRgb[0] * key.intensity * 0.72, kRgb[1] * key.intensity * 0.72, kRgb[2] * key.intensity * 0.72);
      gl.uniform3fv(loc.uFillDir, fDir);
      gl.uniform3f(loc.uFillCol, fRgb[0] * fill.intensity * 0.65, fRgb[1] * fill.intensity * 0.65, fRgb[2] * fill.intensity * 0.65);
      gl.uniform3fv(loc.uRimDir, rDir);
      gl.uniform3f(loc.uRimCol, rRgb[0] * rim.intensity * 0.75, rRgb[1] * rim.intensity * 0.75, rRgb[2] * rim.intensity * 0.75);
      gl.uniform1f(loc.uExposure, Number(rp.exposure) || 1.05);
    }

    function drawMesh(m, modelMat) {
      gl.uniformMatrix4fv(loc.uModel, false, modelMat);
      gl.uniform4fv(loc.uColor, m.color);
      gl.uniform3fv(loc.uEmissive, m.emissive);
      gl.uniform1f(loc.uHasTex, m.tex ? 1.0 : 0.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, m.tex || whiteTex);
      gl.uniform1i(loc.uTex, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.posBuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, GL_FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.normBuf);
      gl.enableVertexAttribArray(loc.aNorm);
      gl.vertexAttribPointer(loc.aNorm, 3, GL_FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.uvBuf);
      gl.enableVertexAttribArray(loc.aUv);
      gl.vertexAttribPointer(loc.aUv, 2, GL_FLOAT, false, 0, 0);

      if (m.idxBuf) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idxBuf);
        gl.drawElements(gl.TRIANGLES, m.count, m.idxType, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
    }

    function computeRootTransform() {
      const scale = skinMeta?.modelScale || 0.88;
      let extraYaw = 0;
      if (emoteAnimRemaining > 0 && !emoteClipName) {
        if (emoteAnimKind === 'emote_spin' || emoteAnimKind === 'emote_dance') {
          extraYaw = emoteAnimRemaining * 5.2;
        }
      }
      const rot = mat4FromEulerDeg(0, extraYaw * (180 / Math.PI), 0);
      const trs = mat4FromTRS([0, 0, 0], [0, 0, 0, 1], [scale, scale, scale]);
      return mat4Mul(rot, trs);
    }

    function resolveAnimatedSocketMatrix(slot, rigProfile) {
      const sock = rigProfile?.sockets?.[slot];
      if (!sock || !skinGpu) return mat4Identity();
      const boneName = sock.bone || '';
      const nodeIdx = skinGpu.nodeIndexByName.get(boneName) ?? skinGpu.nodeIndexByName.get(boneName.toLowerCase());
      const boneWorld = nodeIdx !== undefined
        ? skinGpu.animState.worldMats[nodeIdx]
        : (skinGpu.nodesByName.get(boneName) || skinGpu.nodesByName.get(boneName.toLowerCase()));
      const p = sock.position || [0, 0, 0];
      const r = sock.rotationDegrees || [0, 0, 0];
      const s = sock.scale || [1, 1, 1];
      const localOffset = mat4Mul(
        mat4Mul(mat4FromTRS(p, [0, 0, 0, 1], [1, 1, 1]), mat4FromEulerDeg(r[0], r[1], r[2])),
        mat4FromTRS([0, 0, 0], [0, 0, 0, 1], s)
      );
      if (boneWorld) return mat4Mul(boneWorld, localOffset);
      const fallbackPos = { head: [0, 1.85, 0], back: [0, 1.25, -0.35], hand_r: [-0.65, 1.05, 0.15], hand_l: [0.65, 1.05, 0.15] }[slot] || [0, 1, 0];
      return mat4FromTRS(fallbackPos, [0, 0, 0, 1], [0.85, 0.85, 0.85]);
    }

    let prevNow = performance.now();
    function frame(nowMs) {
      if (destroyed) return;
      rafId = requestAnimationFrame(frame);
      if (typeof document !== 'undefined' && document.hidden) {
        prevNow = nowMs;
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (nowMs - prevNow) / 1000));
      prevNow = nowMs;
      frameCount += 1;
      animClockSec += dt;
      if (autoSpin && !dragging) yaw += dt * 0.42;
      if (emoteAnimRemaining > 0) {
        emoteAnimRemaining = Math.max(0, emoteAnimRemaining - dt);
        if (emoteAnimRemaining === 0) {
          emoteClipName = '';
          emoteAnimKind = '';
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(200, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      gl.viewport(0, 0, w, h);
      const bg = hexToRgb((renderProfile || DEFAULT_RENDER_PROFILE).backgroundHex, [0.063, 0.137, 0.118]);
      gl.clearColor(bg[0], bg[1], bg[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      applyLightUniforms();
      const proj = mat4Perspective(fovDeg * Math.PI / 180, w / h, 0.05, 60);
      const eye = [
        Math.sin(yaw) * Math.cos(pitch) * distance,
        targetY + Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      ];
      const view = mat4LookAt(eye, [0, targetY, 0], [0, 1, 0]);
      gl.uniformMatrix4fv(loc.uProj, false, proj);
      gl.uniformMatrix4fv(loc.uView, false, view);

      // Floor pedestal
      drawMesh({
        posBuf: pedPosBuf, normBuf: pedNormBuf, uvBuf: pedUvBuf, idxBuf: null,
        count: segs * 3, color: [0.11, 0.25, 0.21, 1.0], emissive: [0.03, 0.08, 0.07], tex: null,
      }, mat4Identity());

      if (skinGpu) {
        const wantClip = emoteAnimRemaining > 0 && emoteClipName ? emoteClipName : resolveClipForKey('idle');
        activeClipName = wantClip;
        evaluateSkinPose(skinGpu, wantClip, animClockSec);

        const rootMat = computeRootTransform();
        const hasCustomHead = attachmentGpus.some((a) => a.slot === 'head');
        for (const m of skinGpu.meshes) {
          if (m.isBundledHandProp) continue;
          if (hasCustomHead && m.isRemovableHeadgear) continue;
          const drawMat = m.isSkinned ? rootMat : mat4Mul(rootMat, skinGpu.animState.worldMats[m.nodeIndex] || m.world);
          drawMesh(m, drawMat);
        }
        for (const att of attachmentGpus) {
          const sockMat = mat4Mul(rootMat, resolveAnimatedSocketMatrix(att.slot, skinMeta?.rigProfile));
          for (const m of att.gpu.meshes) {
            drawMesh(m, mat4Mul(sockMat, m.world));
          }
        }
      }
    }
    rafId = requestAnimationFrame(frame);

    return {
      supported: true,
      renderer: 'web-js',
      setRenderProfile(profile) {
        if (profile && typeof profile === 'object') renderProfile = profile;
      },
      async setLoadout({ skinUrl, rigProfile, attachments = [], renderProfile: nextProfile }) {
        const serial = ++loadSerial;
        if (nextProfile) renderProfile = nextProfile;
        skinMeta = {
          modelScale: rigProfile?.modelScale || 0.88,
          rigProfile,
        };
        try {
          const loadedSkin = await uploadGlbToGpu(skinUrl);
          const loadedAttachments = [];
          for (const entry of attachments) {
            if (!entry?.url) continue;
            try {
              const gpu = await uploadGlbToGpu(entry.url);
              loadedAttachments.push({ slot: entry.slot, gpu });
            } catch {}
          }
          if (serial !== loadSerial || destroyed) return;
          skinGpu = loadedSkin;
          attachmentGpus = loadedAttachments;
          options.onStatus?.('');
        } catch {
          if (serial === loadSerial) options.onStatus?.('3D 모델을 불러오지 못했습니다.');
        }
      },
      setCameraPreset(preset) {
        applyCameraPreset(preset);
      },
      triggerEmotePreview(emoteId, durationSec = 2.2) {
        emoteAnimKind = emoteId || '';
        emoteClipName = resolveClipForKey(emoteAnimKind);
        animClockSec = 0;
        emoteAnimRemaining = Math.max(1.2, Number(durationSec) || 2.2);
      },
      getDiagnostics() {
        return {
          renderer: 'web-js',
          supported: true,
          skinned: Boolean(skinGpu?.skins?.length),
          jointCount: skinGpu?.skins?.[0]?.joints?.length || 0,
          animationCount: skinGpu?.animations?.size || 0,
          activeClip: activeClipName,
          cameraPreset,
          yaw: Number(yaw.toFixed(4)),
          pitch: Number(pitch.toFixed(4)),
          distance: Number(distance.toFixed(4)),
          dragging,
          autoSpin,
          frameCount,
          renderProfileId: (renderProfile || DEFAULT_RENDER_PROFILE).profileId,
        };
      },
      destroy() {
        destroyed = true;
        dragging = false;
        activePointerId = null;
        listenerCtrl.abort();
        cancelAnimationFrame(rafId);
      },
    };
  }

  window.PlayHubAvatarGlbViewer = { create: createAvatarGlbViewer };
})();
