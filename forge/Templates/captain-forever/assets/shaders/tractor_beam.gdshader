shader_type canvas_item;
render_mode blend_add, unshaded;

// Restored from Cosmoteer: shots/tractor_beam/tractor_beam.shader & crew/salvage_beam.shader
uniform vec4 color1 : source_color = vec4(0.32, 0.78, 1.0, 1.0);
uniform vec4 color2 : source_color = vec4(0.84, 0.96, 1.0, 1.0);
uniform float beam_length = 120.0;
uniform float scroll_speed = 4.2;
uniform float pull_direction = -1.0;

void fragment() {
	float base_grad = clamp(1.0 - abs((UV.y - 0.5) * 2.0), 0.0, 1.0);
	base_grad = pow(base_grad, 1.5);
	float end_fade = min(clamp(UV.x * beam_length / 8.0, 0.0, 1.0), clamp((1.0 - UV.x) * beam_length / 10.0, 0.0, 1.0));
	base_grad *= end_fade;
	if (base_grad <= 0.005) {
		discard;
	}

	// Travelling harmonic rings from tractor_beam.shader
	float wave_phase = UV.x * max(4.0, beam_length * 0.14) + TIME * scroll_speed * pull_direction;
	float rings = pow(0.5 + 0.5 * sin(wave_phase * 6.2831853), 3.0);
	float helix = 0.5 + 0.5 * sin(UV.x * max(3.0, beam_length * 0.08) * 6.2831853 + (UV.y - 0.5) * 9.0 + TIME * 3.0 * pull_direction);
	float lines = clamp(rings * base_grad + helix * 0.35 * base_grad, 0.0, 1.0);

	vec3 col = mix(color1.rgb, color2.rgb, clamp(lines * 1.1, 0.0, 1.0));
	float alpha = clamp(base_grad * (0.32 + 0.62 * rings + 0.22 * helix), 0.0, 0.92);
	COLOR = vec4(col * alpha * 1.15, alpha);
}
