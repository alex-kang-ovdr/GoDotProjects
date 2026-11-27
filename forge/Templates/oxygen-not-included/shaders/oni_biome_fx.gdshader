shader_type canvas_item;

// Ported from ONI Klei/Liquid (_AirBubbles_Sample1/2), Klei/PostFX/LightBufferCompositor
// (_FrostTex, _EmberTex), and Klei/BatchedAnimationPstTemperature.
// Samples a 48x32 world-space FX field Sprite2D TEXTURE:
//   R = liquid caustic & underwater ripple mask
//   G = boiling proximity / rising steam bubbles
//   B = volcanic heat-haze & rising ember glow (>70C / Magma)
//   A = crystalline frost shimmer (<2C Frozen biome)

uniform float time_sec = 0.0;
uniform float fx_opacity : hint_range(0.0, 1.0) = 1.0;

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
	vec4 field = texture(TEXTURE, UV);
	vec2 wp = UV * vec2(48.0, 32.0);
	vec3 col = vec3(0.0);
	float alpha = 0.0;

	// 1) Klei/Liquid underwater caustics + rising micro-bubbles
	if (field.r > 0.05) {
		float c1 = sin(wp.x * 5.2 + time_sec * 2.1 + vnoise(wp * 1.4) * 3.0);
		float c2 = cos(wp.y * 4.6 - time_sec * 1.7 + vnoise(wp * 2.1 + vec2(3.1, 1.7)) * 3.0);
		float caustic = smoothstep(0.62, 0.98, (c1 * c2) * 0.5 + 0.5);
		vec2 b_uv = wp * 2.6 + vec2(0.0, time_sec * 1.45);
		float bub = smoothstep(0.84, 0.96, vnoise(b_uv));
		float ca_a = field.r * (caustic * 0.22 + bub * 0.16);
		col += vec3(0.62, 0.94, 1.0) * ca_a;
		alpha += ca_a;
	}

	// 2) Klei/Liquid boiling bubbles (_AirBubbles_Sample1/2)
	if (field.g > 0.05) {
		vec2 s1 = wp * 3.8 + vec2(sin(time_sec + wp.y) * 0.4, time_sec * 3.2);
		float boil = smoothstep(0.76, 0.94, vnoise(s1));
		float ba = field.g * boil * 0.42;
		col += vec3(0.95, 0.98, 1.0) * ba;
		alpha += ba;
	}

	// 3) Klei/PostFX/LightBufferCompositor _EmberTex (hot / magma rising embers + heat shimmer)
	if (field.b > 0.05) {
		vec2 e_uv = wp * 2.4 + vec2(sin(time_sec * 1.3 + wp.y * 2.0) * 0.35, time_sec * 2.1);
		float spark = smoothstep(0.82, 0.96, vnoise(e_uv));
		float haze = 0.5 + 0.5 * sin(wp.y * 9.0 - time_sec * 4.2 + wp.x * 2.0);
		float ea = field.b * (spark * 0.48 + haze * 0.09);
		col += mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.86, 0.32), spark) * ea;
		alpha += ea;
	}

	// 4) Klei/PostFX/LightBufferCompositor _FrostTex (Frozen biome ice crystal glint)
	if (field.a > 0.05) {
		float f1 = vnoise(wp * 4.5);
		float f2 = vnoise(wp * 9.0 + vec2(time_sec * 0.12, -time_sec * 0.08));
		float crystal = smoothstep(0.76, 0.94, f1 * 0.55 + f2 * 0.45);
		float fa = field.a * (crystal * 0.24 + 0.04);
		col += vec3(0.72, 0.94, 1.0) * fa;
		alpha += fa;
	}

	alpha = clamp(alpha * fx_opacity, 0.0, 0.65);
	COLOR = vec4(alpha > 0.001 ? col / max(alpha, 0.001) : vec3(0.0), alpha);
}
