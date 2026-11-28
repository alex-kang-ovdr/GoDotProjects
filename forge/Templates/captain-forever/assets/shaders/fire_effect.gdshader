shader_type canvas_item;
render_mode blend_add, unshaded;

// Restored from Cosmoteer: statuses/fire/particles/fire.shader
uniform float fire_size : hint_range(0.0, 1.0) = 0.75;
uniform float seed_offset = 0.0;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 19.19);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
		mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

void fragment() {
	// Cosmoteer fire.shader opposing dual-scroll noise UVs
	vec2 uv_a = UV * 3.2 + vec2(-TIME * 0.55, TIME * 2.1) + vec2(seed_offset, seed_offset * 1.7);
	vec2 uv_b = UV * 4.4 + vec2(TIME * 0.55, -TIME * 2.1) + vec2(seed_offset * 1.3, seed_offset);
	float n1 = vnoise(uv_a);
	float n_unpacked = n1 * 2.0 - 1.0;
	vec2 warped_b = mix(uv_b, uv_b + vec2(n_unpacked), 0.14);
	float n2 = vnoise(warped_b);

	float exp_pow = (fire_size + 0.15) * 6.5;
	float base_mask = 1.0 - clamp(n1 * n2, 0.0, 1.0);
	base_mask = 1.0 - clamp(pow(base_mask, exp_pow), 0.0, 1.0);

	float square_mask = clamp((1.0 - abs(UV.x * 2.0 - 1.0)) * (1.0 - abs(UV.y * 2.0 - 1.0)), 0.0, 1.0);
	float radial_mask = smoothstep(1.0, 0.18, length((UV - vec2(0.5)) * 2.0));
	float mask = base_mask * clamp(exp_pow * n1, 0.0, 1.0) * mix(square_mask, radial_mask, 0.55);
	if (mask <= 0.01) {
		discard;
	}

	// Exact Cosmoteer fire.shader thermal color ramp
	float base_fire = pow(clamp(fire_size * n2 * 1.35, 0.0, 1.0), 1.0 + fire_size * 2.2);
	float r = 0.25 + 0.75 * base_fire;
	float g = 0.08 + pow(base_fire, 1.5) * 0.92;
	float b = pow(base_fire, 3.8) * 0.85;
	float alpha = clamp(mask * (0.55 + 0.45 * fire_size), 0.0, 0.92);
	COLOR = vec4(vec3(r, g, b) * alpha * 1.25, alpha);
}
