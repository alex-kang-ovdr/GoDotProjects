shader_type canvas_item;

// Ported from ONI Klei/Sim/Liquid water shimmer & surface refraction shader.

uniform float time_sec = 0.0;
uniform vec4 shallow_color : source_color = vec4(0.32, 0.76, 0.98, 0.85);
uniform vec4 deep_color : source_color = vec4(0.10, 0.36, 0.68, 0.92);

void fragment() {
	vec2 uv = UV;
	float ripple = sin(uv.x * 22.0 + time_sec * 3.2) * 0.018 + cos(uv.y * 16.0 - time_sec * 2.4) * 0.014;
	float crest = smoothstep(0.06, 0.0, uv.y + ripple);
	vec4 base_c = mix(shallow_color, deep_color, clamp(uv.y * 1.15, 0.0, 1.0));
	vec3 col = base_c.rgb + vec3(0.38, 0.52, 0.60) * crest;
	COLOR = vec4(col, base_c.a);
}
