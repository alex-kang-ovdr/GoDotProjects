/**
 * Stage 2: Deterministic Resource, Material, Shader, Audit & JPG Compilers
 * for Unity -> Godot 4.7.2 (mirrors UnrealConverter/src/deterministic-compilers.mjs).
 *
 * Pure, reproducible, idempotent compiler passes (identical extracted JSON -> byte-identical output):
 *   1. Static PBR Material & Shader Compiler (.tres StandardMaterial3D with EMISSION_OP_MULTIPLY + .gdshader)
 *   2. Residual / Partial Asset Audit Markdown Generator (FAILED_ASSETS_TODO.md)
 *   3. Visual Evidence JPG Compressor (default progressive JPEG quality=84, maxWidth=1400)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeIfChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const isBuf = Buffer.isBuffer(content);
  const normalized = isBuf ? content : Buffer.from(String(content).replace(/\r\n/g, '\n'), 'utf8');
  if (fs.existsSync(filePath)) {
    const prevRaw = fs.readFileSync(filePath);
    if (isBuf) {
      if (prevRaw.equals(normalized)) return false;
    } else {
      const prevNorm = Buffer.from(prevRaw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      if (prevNorm.equals(normalized)) return false;
    }
  }
  fs.writeFileSync(filePath, normalized);
  return true;
}

/**
 * Pass 1: Compile extracted Unity Materials & URP MetalSmoothEmissive specs into static Godot 4 .tres & .gdshader.
 * Returns { compiledMaterials, compiledShaders, filesWritten } so idempotency (filesWritten === 0 on 2nd run) is provable.
 */
export function compileUnityResourcesDeterministic(portedDir) {
  const extDir = path.join(portedDir, 'extracted');
  const materials = readJsonSafe(path.join(extDir, 'materials.json'));
  const outMatDir = path.join(portedDir, 'assets', 'materials');
  const outShaderDir = path.join(portedDir, 'assets', 'shaders');

  let compiledMaterials = 0;
  let compiledShaders = 0;
  let filesWritten = 0;

  const matEntries = Object.entries(materials).sort((a, b) => a[0].localeCompare(b[0]));
  if (matEntries.length > 0) {
    fs.mkdirSync(outMatDir, { recursive: true });
  }

  for (const [matName, spec] of matEntries) {
    const safeName = matName.replace(/[^A-Za-z0-9_-]/g, '_');
    const extLines = [];
    const propLines = [`resource_name = "${safeName}"`];
    let nextId = 1;

    const addTex = (resPath) => {
      if (!resPath) return null;
      const relLocal = resPath.replace(/^res:\/\//, '');
      if (!fs.existsSync(path.join(portedDir, relLocal))) return null;
      const id = `${nextId}_tex`;
      nextId++;
      extLines.push(`[ext_resource type="Texture2D" path="${resPath}" id="${id}"]`);
      return id;
    };

    const col = Array.isArray(spec.color_linear) && spec.color_linear.length >= 4
      ? spec.color_linear
      : [0.9, 0.9, 0.9, 1.0];
    propLines.push(`albedo_color = Color(${col[0]}, ${col[1]}, ${col[2]}, ${col[3]})`);

    const albedoId = addTex(spec.albedo_texture);
    if (albedoId) propLines.push(`albedo_texture = ExtResource("${albedoId}")`);

    propLines.push(`metallic = ${Number(spec.metallic ?? 0.1)}`);
    const metId = addTex(spec.metallic_texture);
    if (metId) propLines.push(`metallic_texture = ExtResource("${metId}")`);

    propLines.push(`roughness = ${Number(spec.roughness ?? 0.72)}`);
    const roughId = addTex(spec.roughness_texture);
    if (roughId) propLines.push(`roughness_texture = ExtResource("${roughId}")`);

    const normId = addTex(spec.normal_texture);
    if (normId) {
      propLines.push('normal_enabled = true');
      propLines.push(`normal_texture = ExtResource("${normId}")`);
      propLines.push('normal_scale = 1.1');
    }

    const emId = addTex(spec.emissive_texture);
    const emEnergy = Number(spec.emissive_energy ?? 0);
    if (emId && emEnergy > 0) {
      const ec = Array.isArray(spec.emissive_color) ? spec.emissive_color : [1.0, 0.25, 0.08];
      propLines.push('emission_enabled = true');
      // emission_operator = 1 (EMISSION_OP_MULTIPLY) prevents full-surface white blowout on black mask areas!
      propLines.push('emission_operator = 1');
      propLines.push(`emission = Color(${ec[0]}, ${ec[1]}, ${ec[2]}, 1)`);
      propLines.push(`emission_energy_multiplier = ${emEnergy}`);
      propLines.push(`emission_texture = ExtResource("${emId}")`);
    }

    const loadSteps = extLines.length + 1;
    const header = `[gd_resource type="StandardMaterial3D" load_steps=${loadSteps} format=3]\n`;
    const extBlock = extLines.length > 0 ? `\n${extLines.join('\n')}\n` : '';
    const tres = `${header}${extBlock}\n[resource]\n${propLines.join('\n')}\n`;

    if (writeIfChanged(path.join(outMatDir, `${safeName}.tres`), tres)) {
      filesWritten++;
    }
    compiledMaterials++;

    // If this is a URP packed emissive arena material, also emit a deterministic pulsing rune shader
    if (spec.serialization === 'urp_packed_mse' && emEnergy > 0) {
      const runeShader = `shader_type spatial;
// Deterministic Godot 4 Shader compiled from Unity URP MetalSmoothEmissive ShaderGraph (${safeName})

uniform sampler2D tex_albedo : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D tex_normal : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D tex_emissive : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 rune_tint : source_color = vec4(1.0, 0.25, 0.08, 1.0);
uniform float pulse_speed = 2.2;
uniform float base_energy = ${emEnergy.toFixed(2)};

void fragment() {
	vec3 base_col = texture(tex_albedo, UV).rgb;
	vec3 em_mask = texture(tex_emissive, UV).rgb;
	float pulse = 0.85 + 0.25 * sin(TIME * pulse_speed);
	ALBEDO = base_col * vec3(0.86, 0.88, 0.96);
	NORMAL_MAP = texture(tex_normal, UV).rgb;
	ROUGHNESS = 0.86;
	METALLIC = 0.05;
	EMISSION = em_mask * rune_tint.rgb * base_energy * pulse;
}
`;
      if (writeIfChanged(path.join(outShaderDir, `${safeName}_rune_pulse.gdshader`), runeShader)) {
        filesWritten++;
      }
      compiledShaders++;
    }
  }

  return { compiledMaterials, compiledShaders, filesWritten };
}

/**
 * Pass 2: Generate deterministic FAILED_ASSETS_TODO.md across all audited Unity samples.
 */
export function generateUnityAuditTodoMarkdown(sampleAudits, todoMdPath) {
  let totalAssets = 0;
  let totalFull = 0;
  let totalPartial = 0;
  let totalFailed = 0;
  const failedRows = [];
  const partialRows = [];

  for (const audit of sampleAudits) {
    totalAssets += audit.totals.total_assets_audited;
    totalFull += audit.totals.ported_full;
    totalPartial += audit.totals.ported_partial;
    totalFailed += audit.totals.failed_unsupported;

    for (const item of audit.items || []) {
      if (item.status === 'failed') {
        failedRows.push(`| ${audit.sample_id} | ${item.category} | \`${item.source_path}\` | ${item.note} |`);
      } else if (item.status === 'partial' && partialRows.length < 40) {
        partialRows.push(`| ${audit.sample_id} | ${item.category} | \`${item.source_path}\` | ${item.note} |`);
      }
    }
  }

  const usablePct = (((totalFull + totalPartial) / Math.max(1, totalAssets)) * 100).toFixed(2);
  const weightedPct = (((totalFull + totalPartial * 0.75) / Math.max(1, totalAssets)) * 100).toFixed(2);

  const lines = [
    '# Unity -> Godot 4.7.2 Deterministic Asset Audit & Residual TODO',
    '',
    `- **Samples Audited**: ${sampleAudits.length}`,
    `- **Total Unity Assets Audited**: ${totalAssets}`,
    `- **Ported Full**: ${totalFull}`,
    `- **Ported Partial (Script/Shader/Anim Mapped)**: ${totalPartial}`,
    `- **Failed / Unsupported**: ${totalFailed}`,
    `- **Usable in Godot**: **${usablePct}%** (Weighted Completeness: **${weightedPct}%**)`,
    '',
    '## 1. Per-Sample Completeness Scorecard',
    '',
    '| Sample | Total Assets | Full | Partial | Failed | Usable % | Weighted % |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];

  for (const audit of sampleAudits) {
    const t = audit.totals;
    lines.push(
      `| ${audit.sample_id} | ${t.total_assets_audited} | ${t.ported_full} | ${t.ported_partial} | ${t.failed_unsupported} | ${t.usable_in_godot_pct}% | ${t.weighted_completeness_pct}% |`,
    );
  }

  lines.push('', '## 2. Failed / Unsupported Assets', '');
  if (failedRows.length === 0) {
    lines.push('None! All audited Unity assets across all samples are usable in Godot 4.7.2 (0 failed).');
  } else {
    lines.push('| Sample | Category | Source Path | Reason |', '|---|---|---|---|', ...failedRows);
  }

  lines.push('', '## 3. Partial / Behaviorally Ported Assets (Sample)', '');
  if (partialRows.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Sample | Category | Source Path | Deterministic Mapping |', '|---|---|---|---|', ...partialRows);
  }

  writeIfChanged(todoMdPath, lines.join('\n') + '\n');
  return { totalAssets, totalFull, totalPartial, totalFailed, usablePct: Number(usablePct), weightedPct: Number(weightedPct) };
}

/**
 * Pass 3: Compress PNG screenshot / comparison board into progressive JPG (default visual evidence policy).
 */
export function compressPngToJpg(pngPath, jpgPath, { quality = 84, maxWidth = 1400 } = {}) {
  fs.mkdirSync(path.dirname(jpgPath), { recursive: true });
  const py = [
    'import sys, json, os',
    'from PIL import Image',
    'src, dst, q, mw = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])',
    'im = Image.open(src).convert("RGB")',
    'if mw > 0 and im.width > mw:',
    '    nh = int(round(im.height * (mw / im.width)))',
    '    im = im.resize((mw, nh), Image.Resampling.LANCZOS)',
    'im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)',
    'print(json.dumps({"width": im.width, "height": im.height, "bytes": os.path.getsize(dst)}))',
  ].join('\n');
  const out = execFileSync('python', ['-c', py, pngPath, jpgPath, String(quality), String(maxWidth)], { encoding: 'utf8' });
  return JSON.parse(out.trim());
}
