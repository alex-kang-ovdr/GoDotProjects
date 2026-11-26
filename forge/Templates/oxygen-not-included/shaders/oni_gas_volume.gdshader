shader_type canvas_item;

// Ported from ONI Klei/GasTest & Klei/Sim/Thermal smooth bilinear volume shader.
// Samples a 48x32 Sprite2D TEXTURE with hardware linear filtering and organic swirl noise
// so gases (O2, CO2, H2, Steam) and thermal overlays flow smoothly without hard square edges.

uniform float time_sec = 0.0;
uniform int mode = 0; // 0=normal gas wisps, 1=gas overlay, 2=temp overlay, 3=pipe dim

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
	// Subtle organic distortion in world space (smooth full-res noise over 48x32 bilinear field)
	float n1 = vnoise(uv * vec2(44.0, 30.0) + vec2(time_sec * 0.24, -time_sec * 0.17));
	float n2 = vnoise(uv * vec2(88.0, 60.0) - vec2(time_sec * 0.15, time_sec * 0.21));
	float swirl = (n1 * 0.65 + n2 * 0.35);

	vec2 warped_uv = clamp(uv + (vec2(n1, n2) - 0.5) * vec2(0.0042, 0.0060), vec2(0.002), vec2(0.998));
	vec4 sample_c = texture(TEXTURE, warped_uv);

	if (mode == 0) {
		// Normal gameplay: soft drifting translucent gas clouds confined to open caverns
		float density = smoothstep(0.04, 0.95, sample_c.a);
		float cloud = density * (0.45 + 0.55 * swirl);
		vec3 col = mix(sample_c.rgb * 0.86, sample_c.rgb * 1.20, swirl);
		COLOR = vec4(col, clamp(cloud * 0.56, 0.0, 0.64));
	} else if (mode == 1) {
		// Gas overlay (G): vivid smooth cloud density map with drifting wisps
		float density = smoothstep(0.02, 0.95, sample_c.a);
		vec3 col = sample_c.rgb * (0.80 + 0.34 * swirl);
		COLOR = vec4(col, clamp(density * 0.90, 0.0, 0.92));
	} else if (mode == 2) {
		// Thermal overlay (T): smooth bilinear heat map with subtle isotherm contour sheen
		float band = smoothstep(0.45, 0.50, fract(swirl * 0.12 + (sample_c.r + sample_c.g * 0.5) * 4.5)) * 0.06;
		COLOR = vec4(sample_c.rgb + vec3(band), 0.74);
	} else {
		// Conduit overlay (P): subtle dark blueprint tint
		COLOR = vec4(0.04, 0.08, 0.14, 0.26);
	}
}
