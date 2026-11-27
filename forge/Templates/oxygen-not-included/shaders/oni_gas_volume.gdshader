shader_type canvas_item;

// Ported from ONI Klei/GasTest, Klei/Sim/Thermal & Klei/PostFX/GridCompositor.
// Samples a 48x32 Sprite2D TEXTURE with hardware linear filtering and 2-octave swirl noise
// so gases (O2, CO2, H2, Steam) and thermal overlays flow smoothly without hard square edges,
// plus subtle GridCompositor cell lines when an analytical overlay is active.

uniform float time_sec = 0.0;
uniform int mode = 0; // 0=normal gas wisps, 1=gas overlay, 2=temp overlay, 3=blueprint dim

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 34.5);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
		mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
		f.y
	);
}

void fragment() {
	vec2 uv = UV;
	float n1 = vnoise(uv * vec2(44.0, 30.0) + vec2(time_sec * 0.24, -time_sec * 0.17));
	float n2 = vnoise(uv * vec2(88.0, 60.0) - vec2(time_sec * 0.15, time_sec * 0.21));
	float swirl = (n1 * 0.65 + n2 * 0.35);

	vec2 warped_uv = clamp(uv + (vec2(n1, n2) - 0.5) * vec2(0.0042, 0.0060), vec2(0.002), vec2(0.998));
	vec4 sample_c = texture(TEXTURE, warped_uv);

	// Klei/PostFX/GridCompositor crisp subtle cell wireframe for analytical overlays
	vec2 cell_f = fract(uv * vec2(48.0, 32.0));
	float grid_edge = max(step(cell_f.x, 0.032), step(cell_f.y, 0.032));

	if (mode == 0) {
		float density = smoothstep(0.04, 0.95, sample_c.a);
		float cloud = density * (0.45 + 0.55 * swirl);
		vec3 col = mix(sample_c.rgb * 0.86, sample_c.rgb * 1.20, swirl);
		COLOR = vec4(col, clamp(cloud * 0.56, 0.0, 0.64));
	} else if (mode == 1) {
		float density = smoothstep(0.02, 0.95, sample_c.a);
		vec3 col = sample_c.rgb * (0.80 + 0.34 * swirl) + vec3(0.16, 0.28, 0.34) * grid_edge * 0.35;
		COLOR = vec4(col, clamp(density * 0.90 + grid_edge * 0.06, 0.0, 0.94));
	} else if (mode == 2) {
		float band = smoothstep(0.45, 0.50, fract(swirl * 0.12 + (sample_c.r + sample_c.g * 0.5) * 4.5)) * 0.07;
		vec3 col = sample_c.rgb + vec3(band) + vec3(0.12, 0.14, 0.18) * grid_edge * 0.32;
		COLOR = vec4(col, 0.74);
	} else {
		vec3 col = vec3(0.04, 0.08, 0.14) + vec3(0.12, 0.24, 0.36) * grid_edge * 0.40;
		COLOR = vec4(col, 0.28 + grid_edge * 0.08);
	}
}
