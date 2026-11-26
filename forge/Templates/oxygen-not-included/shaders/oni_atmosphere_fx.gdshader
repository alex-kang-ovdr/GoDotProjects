shader_type canvas_item;

// Ported from ONI Klei/GasTest & Klei/PostFX/LightBufferCompositor shader architecture.
// Renders animated gas haze wisps, thermal shimmer, and subtle subterranean vignette.

uniform float time_sec : hint_range(0.0, 10000.0) = 0.0;
uniform int overlay_mode = 0; // 0=normal, 1=gas, 2=temp, 3=pipe
uniform float avg_oxygen : hint_range(0.0, 3.0) = 1.0;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
	vec2 uv = UV;
	float n1 = noise(uv * 8.0 + vec2(time_sec * 0.14, -time_sec * 0.09));
	float n2 = noise(uv * 16.0 - vec2(time_sec * 0.11, time_sec * 0.17));
	float wisp = n1 * 0.65 + n2 * 0.35;

	// Subterranean edge vignette (stronger in normal/gas mode)
	vec2 centered = uv - vec2(0.5);
	float dist = length(centered);
	float vig = smoothstep(0.42, 0.88, dist);

	vec3 tint = vec3(0.18, 0.52, 0.72);
	float alpha = 0.0;

	if (overlay_mode == 0) {
		// Subtle breathable O2 atmospheric shimmer + soft cave vignette
		float o2_factor = clamp(avg_oxygen / 1.5, 0.2, 1.0);
		tint = mix(vec3(0.06, 0.09, 0.14), vec3(0.24, 0.68, 0.88), wisp * o2_factor);
		alpha = vig * 0.24 + wisp * 0.045;
	} else if (overlay_mode == 1) {
		// Gas overlay: flowing gas turbulence lines
		tint = vec3(0.32, 0.86, 1.0);
		alpha = wisp * 0.11 + vig * 0.14;
	} else if (overlay_mode == 2) {
		// Thermal overlay: subtle heat-wave scanlines
		float wave = sin(uv.y * 90.0 - time_sec * 3.2) * 0.5 + 0.5;
		tint = mix(vec3(0.95, 0.45, 0.18), vec3(1.0, 0.82, 0.32), wave);
		alpha = (wisp * 0.08 + wave * 0.03) + vig * 0.10;
	} else {
		// Conduit overlay: clean blueprint grid tint
		tint = vec3(0.10, 0.22, 0.36);
		alpha = vig * 0.18;
	}

	COLOR = vec4(tint, clamp(alpha, 0.0, 0.36));
}
