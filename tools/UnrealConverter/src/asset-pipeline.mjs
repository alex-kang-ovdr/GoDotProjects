import fs from "node:fs";
import path from "node:path";
import { uePositionToGodot, ueVectorToGodot } from "./coordinate-transform.mjs";
import { compileUeMaterialGraphToGdShader, buildShaderMaterialTres } from "./material-shader-compiler.mjs";

/**
 * Parse a Wavefront .obj file authored in Unreal Engine coordinates (cm, LH Z-Up)
 * and convert it into a Godot 4 ArrayMesh .tres (m, RH Y-Up, flipped LH->RH winding).
 */
export function convertUeObjToGodotArrayMeshTres(objText, materialResPath = null) {
  const rawPos = [];
  const rawNorm = [];
  const rawUv = [];
  const outPos = [];
  const outNorm = [];
  const outUv = [];

  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v") {
      rawPos.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (parts[0] === "vn") {
      rawNorm.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (parts[0] === "vt") {
      rawUv.push([Number(parts[1]), Number(parts[2])]);
    } else if (parts[0] === "f") {
      const verts = parts.slice(1).map((tok) => {
        const [vi, ti, ni] = tok.split("/").map((s) => (s ? parseInt(s, 10) - 1 : -1));
        return { vi, ti, ni };
      });
      // Fan-triangulate polygon, flipping winding [0, i, i+1] -> [0, i+1, i] for LH->RH
      for (let i = 1; i + 1 < verts.length; i++) {
        const tri = [verts[0], verts[i + 1], verts[i]];
        const gPts = tri.map((v) => uePositionToGodot(rawPos[v.vi] || [0, 0, 0]));

        // Compute flat face normal if vn missing
        const ax = gPts[1][0] - gPts[0][0], ay = gPts[1][1] - gPts[0][1], az = gPts[1][2] - gPts[0][2];
        const bx = gPts[2][0] - gPts[0][0], by = gPts[2][1] - gPts[0][1], bz = gPts[2][2] - gPts[0][2];
        // Godot front-face winding is CW from outside -> outward normal is cross(e2, e1)
        let nx = by * az - bz * ay;
        let ny = bz * ax - bx * az;
        let nz = bx * ay - by * ax;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        for (let k = 0; k < 3; k++) {
          const v = tri[k];
          outPos.push(gPts[k][0], gPts[k][1], gPts[k][2]);
          if (v.ni >= 0 && rawNorm[v.ni]) {
            const gn = ueVectorToGodot(rawNorm[v.ni], 1.0);
            const nlen = Math.hypot(gn[0], gn[1], gn[2]) || 1;
            outNorm.push(
              Number((gn[0] / nlen).toFixed(5)),
              Number((gn[1] / nlen).toFixed(5)),
              Number((gn[2] / nlen).toFixed(5))
            );
          } else {
            outNorm.push(Number(nx.toFixed(5)), Number(ny.toFixed(5)), Number(nz.toFixed(5)));
          }
          if (v.ti >= 0 && rawUv[v.ti]) {
            // Flip V for Godot UV convention
            outUv.push(Number(rawUv[v.ti][0].toFixed(5)), Number((1.0 - rawUv[v.ti][1]).toFixed(5)));
          } else {
            outUv.push(0, 0);
          }
        }
      }
    }
  }

  // Compute AABB
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < outPos.length; i += 3) {
    minX = Math.min(minX, outPos[i]); maxX = Math.max(maxX, outPos[i]);
    minY = Math.min(minY, outPos[i + 1]); maxY = Math.max(maxY, outPos[i + 1]);
    minZ = Math.min(minZ, outPos[i + 2]); maxZ = Math.max(maxZ, outPos[i + 2]);
  }
  if (!Number.isFinite(minX)) {
    minX = minY = minZ = -0.5;
    maxX = maxY = maxZ = 0.5;
  }
  const sizeX = Math.max(0.01, Number((maxX - minX).toFixed(5)));
  const sizeY = Math.max(0.01, Number((maxY - minY).toFixed(5)));
  const sizeZ = Math.max(0.01, Number((maxZ - minZ).toFixed(5)));

  // Pack Godot 4.7 native ArrayMesh surface (non-interleaved streams in vertex_data):
  // ARRAY_FLAG_FORMAT_CURRENT_VERSION (34359738368) | VERTEX (1) | NORMAL (2) | TEX_UV (16) = 34359738387
  // vertex_data layout: [0 .. N*12): float32[3] positions, [N*12 .. N*16): uint16[2] octahedral normals
  // attribute_data layout: [0 .. N*8): float32[2] uv
  const vertexCount = outPos.length / 3;
  const normBase = vertexCount * 12;
  const vertexBuf = Buffer.alloc(vertexCount * 16);
  const attrBuf = Buffer.alloc(vertexCount * 8);
  for (let i = 0; i < vertexCount; i++) {
    const pOff = i * 12;
    vertexBuf.writeFloatLE(outPos[i * 3 + 0], pOff + 0);
    vertexBuf.writeFloatLE(outPos[i * 3 + 1], pOff + 4);
    vertexBuf.writeFloatLE(outPos[i * 3 + 2], pOff + 8);

    const nx = outNorm[i * 3 + 0];
    const ny = outNorm[i * 3 + 1];
    const nz = outNorm[i * 3 + 2];
    const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
    let ox = nx / l1;
    let oy = ny / l1;
    if (nz < 0) {
      const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
      const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
      ox = tx;
      oy = ty;
    }
    const ux = Math.max(0, Math.min(65535, Math.round((ox * 0.5 + 0.5) * 65535)));
    const uy = Math.max(0, Math.min(65535, Math.round((oy * 0.5 + 0.5) * 65535)));
    const nOff = normBase + i * 4;
    vertexBuf.writeUInt16LE(ux, nOff + 0);
    vertexBuf.writeUInt16LE(uy, nOff + 2);

    const aOff = i * 8;
    attrBuf.writeFloatLE(outUv[i * 2 + 0], aOff + 0);
    attrBuf.writeFloatLE(outUv[i * 2 + 1], aOff + 4);
  }

  const meshLines = [];
  if (materialResPath) {
    meshLines.push('[gd_resource type="ArrayMesh" load_steps=2 format=4]');
    meshLines.push("");
    meshLines.push(`[ext_resource type="Material" path="${materialResPath}" id="1"]`);
  } else {
    meshLines.push('[gd_resource type="ArrayMesh" format=4]');
  }
  meshLines.push("");
  meshLines.push("[resource]");
  meshLines.push("_surfaces = [{");
  meshLines.push(`"aabb": AABB(${minX}, ${minY}, ${minZ}, ${sizeX}, ${sizeY}, ${sizeZ}),`);
  meshLines.push(`"attribute_data": PackedByteArray("${attrBuf.toString("base64")}"),`);
  meshLines.push(`"format": 34359738387,`);
  if (materialResPath) {
    meshLines.push(`"material": ExtResource("1"),`);
  }
  meshLines.push(`"name": "UE_Ported_Surface",`);
  meshLines.push(`"primitive": 3,`);
  meshLines.push(`"uv_scale": Vector4(0, 0, 0, 0),`);
  meshLines.push(`"vertex_count": ${vertexCount},`);
  meshLines.push(`"vertex_data": PackedByteArray("${vertexBuf.toString("base64")}")`);
  meshLines.push("}]");

  return {
    tres: meshLines.join("\n") + "\n",
    vertexCount,
    triangleCount: vertexCount / 3
  };
}

/**
 * Generate a 64x64 procedural RGB8 ImageTexture .tres (Godot 4 format=4)
 * from a UE texture pattern descriptor or raw RGB buffer.
 */
export function buildImageTextureTres({ width = 64, height = 64, pattern = "grid", primary = [90, 100, 112], secondary = [130, 142, 156] }) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = primary;
      if (pattern === "grid") {
        const border = x < 2 || y < 2 || x === width / 2 || y === height / 2;
        const checker = ((x >> 4) + (y >> 4)) % 2 === 0;
        c = border ? [210, 220, 232] : checker ? primary : secondary;
      } else if (pattern === "grass") {
        // Deterministic spatial hash noise (eliminates periodic diagonal moire artifacts)
        const h = ((x * 374761393 + y * 668265263) ^ (x * y * 1274126177)) >>> 0;
        const n = (h & 255) / 255.0;
        const blend = 0.78 + n * 0.32;
        c = [
          Math.min(255, Math.round(primary[0] * blend)),
          Math.min(255, Math.round(primary[1] * blend)),
          Math.min(255, Math.round(primary[2] * blend))
        ];
      } else if (pattern === "stripes") {
        c = ((x + y) >> 3) % 2 === 0 ? primary : secondary;
      } else if (pattern === "metal") {
        const seam = x % 32 < 2 || y % 32 < 2;
        const grain = ((x * 3 + y) % 11) < 3;
        c = seam ? [40, 48, 58] : grain ? secondary : primary;
      } else if (pattern === "normal_bevel") {
        // Tangent-space normal map (neutral = [128, 128, 255]) with panel bevels
        const bx = x % 32;
        const by = y % 32;
        let nx = 128, ny = 128, nz = 255;
        if (bx < 2) { nx = 76; nz = 232; }
        else if (bx >= 30) { nx = 180; nz = 232; }
        if (by < 2) { ny = 76; nz = 232; }
        else if (by >= 30) { ny = 180; nz = 232; }
        c = [nx, ny, nz];
      }
      const idx = (y * width + x) * 3;
      buf[idx] = c[0];
      buf[idx + 1] = c[1];
      buf[idx + 2] = c[2];
    }
  }
  const b64 = buf.toString("base64");
  return (
    `[gd_resource type="ImageTexture" format=4]\n\n` +
    `[sub_resource type="Image" id="Image_1"]\n` +
    `data = {\n` +
    `"data": PackedByteArray("${b64}"),\n` +
    `"format": "RGB8",\n` +
    `"height": ${height},\n` +
    `"mipmaps": false,\n` +
    `"width": ${width}\n` +
    `}\n\n` +
    `[resource]\n` +
    `image = SubResource("Image_1")\n`
  );
}

/**
 * Generate a Godot 4 StandardMaterial3D .tres referencing an optional ported ImageTexture .tres.
 */
export function buildStandardMaterialTres({
  albedoColor = [1, 1, 1],
  roughness = 0.65,
  metallic = 0.0,
  emission = null,
  albedoTextureResPath = null,
  normalTextureResPath = null,
  normalScale = 1.0,
  uvTriplanar = false,
  uvScale = [1, 1, 1]
}) {
  const extLines = [];
  let extIdx = 1;
  let albedoExtId = null;
  let normalExtId = null;
  if (albedoTextureResPath) {
    albedoExtId = String(extIdx++);
    extLines.push(`[ext_resource type="Texture2D" path="${albedoTextureResPath}" id="${albedoExtId}"]`);
  }
  if (normalTextureResPath) {
    normalExtId = String(extIdx++);
    extLines.push(`[ext_resource type="Texture2D" path="${normalTextureResPath}" id="${normalExtId}"]`);
  }

  const lines = [];
  if (extLines.length > 0) {
    lines.push(`[gd_resource type="StandardMaterial3D" load_steps=${extLines.length + 1} format=3]`);
    lines.push("");
    lines.push(...extLines);
  } else {
    lines.push('[gd_resource type="StandardMaterial3D" format=3]');
  }
  lines.push("");
  lines.push("[resource]");
  lines.push(`albedo_color = Color(${albedoColor[0]}, ${albedoColor[1]}, ${albedoColor[2]}, 1)`);
  if (albedoExtId) {
    lines.push(`albedo_texture = ExtResource("${albedoExtId}")`);
  }
  lines.push(`metallic = ${metallic}`);
  lines.push(`roughness = ${roughness}`);
  if (normalExtId) {
    lines.push("normal_enabled = true");
    lines.push(`normal_scale = ${normalScale}`);
    lines.push(`normal_texture = ExtResource("${normalExtId}")`);
  }
  if (emission) {
    lines.push("emission_enabled = true");
    lines.push(`emission = Color(${emission[0]}, ${emission[1]}, ${emission[2]}, 1)`);
    lines.push("emission_energy_multiplier = 1.4");
  }
  if (uvTriplanar) {
    lines.push("uv1_triplanar = true");
    lines.push(`uv1_scale = Vector3(${uvScale[0]}, ${uvScale[1]}, ${uvScale[2]})`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Convert a PCM RIFF WAV file (8-bit or 16-bit mono/stereo) into a compact Godot 4 format=4
 * 8-bit signed AudioStreamWAV .tres.
 */
export function convertWavBufferToGodotAudioTres(wavBuf, targetRate = 16000) {
  if (wavBuf.toString("ascii", 0, 4) !== "RIFF" || wavBuf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV header (expected RIFF/WAVE)");
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let pcmData = null;

  while (offset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      channels = wavBuf.readUInt16LE(chunkStart + 2);
      sampleRate = wavBuf.readUInt32LE(chunkStart + 4);
      bitsPerSample = wavBuf.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      pcmData = wavBuf.subarray(chunkStart, chunkStart + chunkSize);
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!pcmData || pcmData.length === 0) {
    throw new Error("WAV file missing PCM data chunk");
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = Math.floor(pcmData.length / (bytesPerSample * channels));
  const mono16 = new Int16Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const pos = (i * channels + ch) * bytesPerSample;
      if (bitsPerSample === 16) {
        sum += pcmData.readInt16LE(pos);
      } else if (bitsPerSample === 8) {
        sum += (pcmData.readUInt8(pos) - 128) << 8;
      }
    }
    mono16[i] = Math.round(sum / channels);
  }

  const outLen = Math.max(1, Math.floor((totalFrames * targetRate) / sampleRate));
  const outBytes = Buffer.alloc(outLen);
  const ratio = totalFrames / outLen;
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(totalFrames - 1, Math.floor(i * ratio));
    const s8 = Math.max(-128, Math.min(127, mono16[srcIdx] >> 8));
    outBytes[i] = s8 & 0xff;
  }

  const b64 = outBytes.toString("base64");
  return {
    tres:
      `[gd_resource type="AudioStreamWAV" format=4]\n\n` +
      `[resource]\n` +
      `format = 0\n` +
      `mix_rate = ${targetRate}\n` +
      `stereo = false\n` +
      `data = PackedByteArray("${b64}")\n`,
    sampleCount: outLen,
    sampleRate: targetRate
  };
}

/**
 * Port assets from Unified Game IR into Godot 4 .tres resources
 * inside `<outDir>/assets/{textures,materials,meshes,audio}/`.
 * In `internal_research` mode (default), ALL assets including non-redistributable ones are ported.
 */
export function portAssetsForIR(ir, sourceProjectDir, outDir, options = {}) {
  const licenseMode = options.licenseMode || ir.source?.license_mode || "internal_research";
  const portedAssets = [];
  const assetMap = new Map();
  const absSrcRoot = path.resolve(sourceProjectDir);

  // Order: textures -> base materials -> material instances & shader materials -> meshes -> audio
  const order = {
    texture: 1,
    material: 2,
    material_instance: 3,
    shader_material: 3,
    static_mesh: 4,
    skeletal_mesh: 4,
    audio: 5
  };
  const sorted = [...(ir.assets || [])].sort((a, b) => (order[a.kind] || 9) - (order[b.kind] || 9));
  const materialSpecsById = new Map();

  for (const asset of sorted) {
    if (licenseMode === "redistributable_only" && (!asset.redistributable || asset.license_status !== "allowed")) {
      continue;
    }

    if (asset.kind === "texture") {
      const relOut = `assets/textures/${asset.id}.tres`;
      const fullOut = path.join(outDir, relOut);
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      const tres = buildImageTextureTres(asset.texture_spec || {});
      fs.writeFileSync(fullOut, tres, "utf8");
      const resPath = `res://${relOut}`;
      asset.godot_path = resPath;
      assetMap.set(asset.id, { kind: "texture", relPath: relOut, resPath, bytes: Buffer.byteLength(tres) });
      portedAssets.push(assetMap.get(asset.id));
    } else if (asset.kind === "material" || asset.kind === "material_instance") {
      const relOut = `assets/materials/${asset.id}.tres`;
      const fullOut = path.join(outDir, relOut);
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      const parentSpec = asset.parent_material_ref ? (materialSpecsById.get(asset.parent_material_ref) || {}) : {};
      const spec = { ...parentSpec, ...(asset.material_spec || {}) };
      materialSpecsById.set(asset.id, spec);
      const texEntry = spec.albedo_texture_ref ? assetMap.get(spec.albedo_texture_ref) : null;
      const normEntry = spec.normal_texture_ref ? assetMap.get(spec.normal_texture_ref) : null;
      const tres = buildStandardMaterialTres({
        albedoColor: spec.albedo_color || [1, 1, 1],
        roughness: spec.roughness ?? 0.65,
        metallic: spec.metallic ?? 0.0,
        emission: spec.emission || null,
        albedoTextureResPath: texEntry ? texEntry.resPath : null,
        normalTextureResPath: normEntry ? normEntry.resPath : null,
        normalScale: spec.normal_scale ?? 1.0,
        uvTriplanar: Boolean(spec.uv_triplanar),
        uvScale: spec.uv_scale || [0.5, 0.5, 0.5]
      });
      fs.writeFileSync(fullOut, tres, "utf8");
      const resPath = `res://${relOut}`;
      asset.godot_path = resPath;
      assetMap.set(asset.id, { kind: "material", relPath: relOut, resPath, bytes: Buffer.byteLength(tres) });
      portedAssets.push(assetMap.get(asset.id));
    } else if (asset.kind === "shader_material") {
      const shaderRel = `assets/shaders/${asset.id}.gdshader`;
      const matRel = `assets/materials/${asset.id}.tres`;
      const shaderFull = path.join(outDir, shaderRel);
      const matFull = path.join(outDir, matRel);
      fs.mkdirSync(path.dirname(shaderFull), { recursive: true });
      fs.mkdirSync(path.dirname(matFull), { recursive: true });
      const { shaderCode } = compileUeMaterialGraphToGdShader(asset.material_graph || {});
      fs.writeFileSync(shaderFull, shaderCode, "utf8");
      const shaderResPath = `res://${shaderRel}`;
      const matTres = buildShaderMaterialTres(shaderResPath, asset.shader_params || {});
      fs.writeFileSync(matFull, matTres, "utf8");
      const matResPath = `res://${matRel}`;
      asset.godot_path = matResPath;
      portedAssets.push({ kind: "shader", relPath: shaderRel, resPath: shaderResPath, bytes: Buffer.byteLength(shaderCode) });
      assetMap.set(asset.id, { kind: "material", relPath: matRel, resPath: matResPath, bytes: Buffer.byteLength(matTres) });
      portedAssets.push(assetMap.get(asset.id));
    } else if ((asset.kind === "static_mesh" || asset.kind === "skeletal_mesh") && asset.file_path) {
      const srcFile = path.join(absSrcRoot, asset.file_path);
      if (!fs.existsSync(srcFile)) continue;
      const relOut = `assets/meshes/${asset.id}.tres`;
      const fullOut = path.join(outDir, relOut);
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      const matEntry = asset.material_ref ? assetMap.get(asset.material_ref) : null;
      const objText = fs.readFileSync(srcFile, "utf8");
      const { tres, vertexCount, triangleCount } = convertUeObjToGodotArrayMeshTres(
        objText,
        matEntry ? matEntry.resPath : null
      );
      fs.writeFileSync(fullOut, tres, "utf8");
      const resPath = `res://${relOut}`;
      asset.godot_path = resPath;
      assetMap.set(asset.id, {
        kind: "mesh",
        relPath: relOut,
        resPath,
        vertexCount,
        triangleCount,
        bytes: Buffer.byteLength(tres)
      });
      portedAssets.push(assetMap.get(asset.id));
    } else if (asset.kind === "audio" && asset.file_path) {
      const srcFile = path.join(absSrcRoot, asset.file_path);
      if (!fs.existsSync(srcFile)) continue;
      const relOut = `assets/audio/${asset.id}.tres`;
      const fullOut = path.join(outDir, relOut);
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      const wavBuf = fs.readFileSync(srcFile);
      const { tres, sampleCount, sampleRate } = convertWavBufferToGodotAudioTres(wavBuf);
      fs.writeFileSync(fullOut, tres, "utf8");
      const resPath = `res://${relOut}`;
      asset.godot_path = resPath;
      assetMap.set(asset.id, {
        kind: "audio",
        relPath: relOut,
        resPath,
        sampleCount,
        sampleRate,
        bytes: Buffer.byteLength(tres)
      });
      portedAssets.push(assetMap.get(asset.id));
    }
  }

  return { portedAssets, assetMap };
}
