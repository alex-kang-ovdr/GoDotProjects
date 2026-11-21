(function () {
  'use strict';

  // Zero-dependency WebGL glTF 2.0 (.glb) 3D Avatar Viewer for PlayHub Avatar Shop & Locker.
  // Supports binary GLB chunks, node transforms, embedded PNG textures, PBR baseColor,
  // multi-mesh skins + socket-mounted GLB attachments, drag orbit, and camera presets.

  const GL_FLOAT = 5126;
  const GL_UNSIGNED_SHORT = 5123;
  const GL_UNSIGNED_INT = 5125;
  const GL_UNSIGNED_BYTE = 5121;
  const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function mat4FromTRS(t, q, s) {
    const [tx, ty, tz] = t || [0, 0, 0];
    const [x, y, z, w] = q || [0, 0, 0, 1];
    const [sx, sy, sz] = s || [1, 1, 1];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return new Float32Array([
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      tx, ty, tz, 1,
    ]);
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

  function readAccessor(doc, binBytes, accIndex) {
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
      const out = new Uint16Array(count * comps);
      const step = stride || comps * 2;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getUint16(offset + i * step + c * 2, true);
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
      const out = new Uint16Array(count * comps);
      const step = stride || comps;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          out[i * comps + c] = view.getUint8(offset + i * step + c);
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
    const worldMatrices = new Array(nodes.length);
    const nodesByName = new Map();

    function localMat(node) {
      if (Array.isArray(node.matrix) && node.matrix.length === 16) return new Float32Array(node.matrix);
      return mat4FromTRS(node.translation, node.rotation, node.scale);
    }
    function visit(idx, parentMat) {
      const node = nodes[idx];
      if (!node) return;
      const world = mat4Mul(parentMat, localMat(node));
      worldMatrices[idx] = world;
      if (node.name) {
        nodesByName.set(node.name, world);
        nodesByName.set(node.name.toLowerCase(), world);
      }
      for (const child of node.children || []) visit(child, world);
    }
    const scene = (doc.scenes || [])[doc.scene || 0] || { nodes: [] };
    for (const rootIdx of scene.nodes || []) visit(rootIdx, mat4Identity());

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
          nodeName: node.name || '',
          parentName,
          isBundledHandProp,
          isRemovableHeadgear,
          world,
          positions: pos,
          normals: norm,
          uvs: uv,
          indices,
          color,
          emissive,
          imageIndex,
        });
      }
    }
    if (!Number.isFinite(minY)) { minY = 0; maxY = 2; }
    return { drawables, images, nodesByName, bounds: { minY, maxY, height: Math.max(0.1, maxY - minY), maxRadius } };
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
  const FS_SRC = `
    precision mediump float;
    varying vec3 vNorm;
    varying vec2 vUv;
    uniform vec4 uColor;
    uniform vec3 uEmissive;
    uniform float uHasTex;
    uniform sampler2D uTex;
    void main() {
      vec4 base = uColor;
      if (uHasTex > 0.5) base *= texture2D(uTex, vUv);
      vec3 n = normalize(vNorm);
      vec3 keyDir = normalize(vec3(0.55, 0.85, 0.65));
      vec3 rimDir = normalize(vec3(-0.6, 0.35, -0.75));
      float keyDiff = max(dot(n, keyDir), 0.0);
      float rimDiff = max(dot(n, rimDir), 0.0) * 0.32;
      float hemi = n.y * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.18, 0.24, 0.28), vec3(0.42, 0.48, 0.52), hemi);
      vec3 lit = base.rgb * (ambient + keyDiff * 0.78 + rimDiff) + uEmissive;
      gl_FragColor = vec4(lit, base.a);
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
        setLoadout: async () => {},
        setCameraPreset: () => {},
        triggerEmotePreview: () => {},
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
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, d.positions, gl.STATIC_DRAW);
        const normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, d.normals, gl.STATIC_DRAW);
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
          nodeName: d.nodeName,
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
      const entry = { meshes, nodesByName: parsed.nodesByName, bounds: parsed.bounds };
      gpuCache.set(url, entry);
      return entry;
    }

    // Pedestal ring mesh
    const pedPos = [], pedNorm = [], pedUv = [];
    const segs = 36;
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

    let skinGpu = null;
    let skinMeta = null;
    let attachmentGpus = [];
    let yaw = 0.42;
    let pitch = 0.14;
    let distance = 4.95;
    let targetY = 1.25;
    let cameraPreset = 'TPS';
    let dragging = false;
    let lastX = 0, lastY = 0;
    let autoSpin = true;
    let emoteAnimTime = 0;
    let emoteAnimKind = '';
    let destroyed = false;
    let rafId = 0;
    let loadSerial = 0;

    function applyCameraPreset(preset) {
      cameraPreset = preset;
      if (preset === 'FPS') {
        yaw = 0.0; pitch = 0.05; distance = 1.75; targetY = 1.68; autoSpin = false;
      } else if (preset === 'TopDown') {
        yaw = 0.35; pitch = 0.92; distance = 6.2; targetY = 1.0; autoSpin = true;
      } else {
        yaw = 0.42; pitch = 0.14; distance = 4.95; targetY = 1.25; autoSpin = true;
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; autoSpin = false; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.012;
      pitch = Math.max(-0.4, Math.min(1.2, pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX; lastY = e.clientY;
    });
    const endDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

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

    function computeRootTransform(tSec) {
      const scale = skinMeta?.modelScale || 0.88;
      let bobY = Math.sin(tSec * 2.1) * 0.025;
      let extraYaw = 0;
      if (emoteAnimTime > 0) {
        if (emoteAnimKind === 'emote_spin' || emoteAnimKind === 'emote_dance') {
          extraYaw = emoteAnimTime * 5.2;
          bobY += Math.abs(Math.sin(emoteAnimTime * 8.0)) * 0.14;
        } else if (emoteAnimKind === 'emote_sit') {
          bobY -= 0.32;
        } else {
          bobY += Math.abs(Math.sin(emoteAnimTime * 7.5)) * 0.18;
        }
      }
      const minY = skinGpu?.bounds?.minY ?? 0;
      const offsetY = Math.max(0, -minY * scale) + bobY;
      const rot = mat4FromEulerDeg(0, extraYaw * (180 / Math.PI), 0);
      const trs = mat4FromTRS([0, offsetY, 0], [0, 0, 0, 1], [scale, scale, scale]);
      return mat4Mul(rot, trs);
    }

    function resolveSocketMatrix(slot, rigProfile) {
      const sock = rigProfile?.sockets?.[slot];
      if (!sock || !skinGpu) return mat4Identity();
      const boneName = sock.bone || '';
      const boneWorld = skinGpu.nodesByName.get(boneName) || skinGpu.nodesByName.get(boneName.toLowerCase());
      const p = sock.position || [0, 0, 0];
      const r = sock.rotationDegrees || [0, 0, 0];
      const s = sock.scale || [1, 1, 1];
      const localOffset = mat4Mul(
        mat4Mul(mat4FromTRS(p, [0, 0, 0, 1], [1, 1, 1]), mat4FromEulerDeg(r[0], r[1], r[2])),
        mat4FromTRS([0, 0, 0], [0, 0, 0, 1], s)
      );
      if (boneWorld) return mat4Mul(boneWorld, localOffset);
      // Fallback approximate body socket if bone isn't a mesh parent
      const fallbackPos = { head: [0, 1.85, 0], back: [0, 1.25, -0.35], hand_r: [-0.65, 1.05, 0.15], hand_l: [0.65, 1.05, 0.15] }[slot] || [0, 1, 0];
      return mat4FromTRS(fallbackPos, [0, 0, 0, 1], [0.85, 0.85, 0.85]);
    }

    let prevNow = performance.now();
    function frame(nowMs) {
      if (destroyed) return;
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (nowMs - prevNow) / 1000);
      prevNow = nowMs;
      if (autoSpin && !dragging) yaw += dt * 0.42;
      if (emoteAnimTime > 0) emoteAnimTime = Math.max(0, emoteAnimTime - dt);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(200, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      const proj = mat4Perspective((cameraPreset === 'FPS' ? 62 : 42) * Math.PI / 180, w / h, 0.05, 60);
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
        count: segs * 3, color: [0.13, 0.27, 0.23, 0.72], emissive: [0.02, 0.06, 0.05], tex: null,
      }, mat4Identity());

      if (skinGpu) {
        const rootMat = computeRootTransform(nowMs / 1000);
        const hasCustomHead = attachmentGpus.some((a) => a.slot === 'head');
        for (const m of skinGpu.meshes) {
          if (m.isBundledHandProp) continue;
          if (hasCustomHead && m.isRemovableHeadgear) continue;
          drawMesh(m, mat4Mul(rootMat, m.world));
        }
        for (const att of attachmentGpus) {
          const sockMat = mat4Mul(rootMat, resolveSocketMatrix(att.slot, skinMeta?.rigProfile));
          for (const m of att.gpu.meshes) {
            drawMesh(m, mat4Mul(sockMat, m.world));
          }
        }
      }
    }
    rafId = requestAnimationFrame(frame);

    return {
      supported: true,
      async setLoadout({ skinUrl, rigProfile, attachments = [] }) {
        const serial = ++loadSerial;
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
        } catch (err) {
          if (serial === loadSerial) options.onStatus?.('3D 모델을 불러오지 못했습니다.');
        }
      },
      setCameraPreset(preset) {
        applyCameraPreset(preset);
      },
      triggerEmotePreview(emoteId, durationSec = 2.2) {
        emoteAnimKind = emoteId || '';
        emoteAnimTime = Math.max(1.2, Number(durationSec) || 2.2);
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
      },
    };
  }

  window.PlayHubAvatarGlbViewer = { create: createAvatarGlbViewer };
})();
