shader_type canvas_item;
render_mode blend_add, unshaded;

// Restored from Cosmoteer: shots/ion_beam/ion_beam.shader & resonance_beam_base.shader
uniform vec4 base_color : source_color = vec4(1.0, 0.18, 0.52, 1.0);
uniform vec4 highlight_color : source_color = vec4(1.0, 0.86, 0.96, 1.0);
uniform float beam_length = 120.0;
uniform float intensity = 1.0;
uniform float end_cap_size = 6.0;
uniform float scroll_speed = 6.5;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void fragment() {
	float eff_int = clamp(pow(max(0.25, intensity), 0.75), 0.25, 4.0);
	float base_grad = abs((UV.y - 0.5) * 2.0);
	float large_n1 = mix(0.75, 1.0, vnoise(vec2(UV.x * beam_length * 0.045 - TIME * scroll_speed * 0.45, 0.3)));
	float beam_base = 1.0 - pow(pow(clamp(base_grad, 0.0, 1.0), 4.0), large_n1);

	// Dual counter-scrolling top/bottom turbulence streams from ion_beam.shader
	float dir_y = UV.y >= 0.5 ? -1.0 : 1.0;
	vec2 inner_uv = vec2(UV.x * beam_length * 0.16 - TIME * scroll_speed, (UV.y + dir_y * TIME * 1.45) * 4.5);
	float large_n2 = vnoise(vec2(UV.x * beam_length * 0.025 - TIME * 2.8, UV.y * 2.0));
	vec2 warped_uv = inner_uv + vec2(large_n2 * 0.85, (large_n2 - 0.5) * 0.6);
	float small_n = (vnoise(warped_uv) + vnoise(warped_uv * 2.1 + vec2(TIME * -3.5, 0.0))) * 0.5;
	float noise_base = small_n * 0.9;

	// Pinched end-caps & core glow
	float end_t = clamp(min(UV.x, 1.0 - UV.x) * beam_length / max(1.0, end_cap_size * eff_int), 0.02, 1.0);
	float inner_beam = pow(max(0.0, beam_base), 5.2);
	float inner_base = clamp(inner_beam + noise_base * 0.75, 0.0, 1.0);
	float inner_sharp = pow(inner_base, 3.2);
	float inner_grad = pow(max(0.0, 1.0 - base_grad), 2.22);
	float core = clamp((inner_grad * 1.25 + inner_sharp * 0.75), 0.0, 1.0);

	vec3 col = mix(base_color.rgb * (0.75 + 0.55 * noise_base), highlight_color.rgb, pow(core, 1.6));
	float beam_shape = pow(max(0.0, beam_base), 4.2 / max(0.12, end_t));
	float alpha = clamp((beam_shape * 0.85 + inner_grad * 0.55) * end_t, 0.0, 1.0);
	COLOR = vec4(col * (0.95 + 0.35 * eff_int) * alpha, alpha);
}
