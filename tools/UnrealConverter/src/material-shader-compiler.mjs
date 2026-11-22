/**
 * Unreal Engine Material Graph IR -> Godot 4.7 Spatial Shader (.gdshader) & ShaderMaterial (.tres) Compiler
 * Supports UE Material Expressions:
 *   - Time, Sine, Panner (UV scrolling), Fresnel, Lerp, Multiply, Constant3Vector, ScalarParameter
 *   - Outputs: BaseColor (ALBEDO), Metallic (METALLIC), Roughness (ROUGHNESS), EmissiveColor (EMISSION), Opacity (ALPHA)
 */

export function compileUeMaterialGraphToGdShader(materialGraph = {}) {
  const blendMode = materialGraph.blend_mode || "opaque"; // opaque | translucent | additive
  const renderModes = ["depth_draw_opaque", "cull_back"];
  if (blendMode === "additive") {
    renderModes.push("blend_add");
  }

  const uniforms = [];
  const baseColor = materialGraph.base_color || [1.0, 0.85, 0.2];
  const emissiveColor = materialGraph.emissive_color || [1.0, 0.72, 0.1];
  const roughness = materialGraph.roughness ?? 0.25;
  const metallic = materialGraph.metallic ?? 0.2;
  const pulseSpeed = materialGraph.pulse_speed ?? 3.5;
  const fresnelPower = materialGraph.fresnel_power ?? 2.4;
  const panSpeed = materialGraph.pan_speed || [0.0, 0.0];

  uniforms.push(`uniform vec3 base_color : source_color = vec3(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]});`);
  uniforms.push(`uniform vec3 emissive_color : source_color = vec3(${emissiveColor[0]}, ${emissiveColor[1]}, ${emissiveColor[2]});`);
  uniforms.push(`uniform float metallic_val : hint_range(0.0, 1.0) = ${metallic};`);
  uniforms.push(`uniform float roughness_val : hint_range(0.0, 1.0) = ${roughness};`);
  uniforms.push(`uniform float pulse_speed = ${pulseSpeed};`);
  uniforms.push(`uniform float fresnel_power = ${fresnelPower};`);
  uniforms.push(`uniform vec2 pan_speed = vec2(${panSpeed[0]}, ${panSpeed[1]});`);
  uniforms.push(`uniform float active_strength = 1.0;`);

  const hasFresnel = Boolean(materialGraph.use_fresnel);
  const hasPulse = Boolean(materialGraph.use_pulse);
  const hasPanner = Boolean(materialGraph.use_panner);

  const fragLines = [
    "\tvec2 uv_panned = UV + pan_speed * TIME;",
    hasPanner
      ? "\tfloat scan_band = 0.5 + 0.5 * sin((uv_panned.x + uv_panned.y) * 18.0);"
      : "\tfloat scan_band = 1.0;",
    hasPulse
      ? "\tfloat pulse = 0.65 + 0.35 * sin(TIME * pulse_speed);"
      : "\tfloat pulse = 1.0;",
    hasFresnel
      ? "\tfloat fresnel = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), fresnel_power);"
      : "\tfloat fresnel = 0.0;",
    "\tALBEDO = mix(base_color, emissive_color, clamp(fresnel * 0.6 + scan_band * 0.2, 0.0, 1.0));",
    "\tMETALLIC = metallic_val;",
    "\tROUGHNESS = roughness_val;",
    "\tEMISSION = emissive_color * (0.45 + fresnel * 1.4) * pulse * scan_band * active_strength;"
  ];

  const shaderCode = [
    `shader_type spatial;`,
    `render_mode ${renderModes.join(", ")};`,
    `// Auto-compiled from UE Material Graph: ${materialGraph.name || "M_UnrealGraph"}`,
    "",
    ...uniforms,
    "",
    "void fragment() {",
    ...fragLines,
    "}",
    ""
  ].join("\n");

  return {
    shaderCode,
    features: {
      fresnel: hasFresnel,
      pulse: hasPulse,
      panner: hasPanner,
      blendMode
    }
  };
}

export function buildShaderMaterialTres(shaderResPath, params = {}) {
  const lines = [
    '[gd_resource type="ShaderMaterial" load_steps=2 format=3]',
    "",
    `[ext_resource type="Shader" path="${shaderResPath}" id="1"]`,
    "",
    "[resource]",
    'shader = ExtResource("1")'
  ];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v) && v.length === 3) {
      lines.push(`shader_parameter/${k} = Color(${v[0]}, ${v[1]}, ${v[2]}, 1)`);
    } else if (Array.isArray(v) && v.length === 2) {
      lines.push(`shader_parameter/${k} = Vector2(${v[0]}, ${v[1]})`);
    } else if (typeof v === "number") {
      lines.push(`shader_parameter/${k} = ${v}`);
    }
  }
  return lines.join("\n") + "\n";
}
