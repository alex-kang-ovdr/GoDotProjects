shader_type canvas_item;
render_mode blend_add, unshaded;

// Restored from Cosmoteer: reactor_shockwave.shader, missile_emp_shockwave.shader & missile_nuke_shockwave.shader
uniform vec4 ring_color : source_color = vec4(1.0, 0.84, 0.45, 1.0);
uniform float progress : hint_range(0.0, 1.0) = 0.25;
uniform float wave_count = 3.0;
uniform float wave_speed = 14.0;
uniform int blast_mode = 0; // 0 = HE, 1 = EMP, 2 = Nuke, 3 = Reactor Meltdown

void fragment() {
	vec2 centered = (UV - vec2(0.5)) * 2.0;
	float dist = length(centered);
	if (dist > 1.0) {
		discard;
	}
	float fade = pow(clamp(1.0 - progress, 0.0, 1.0), 1.25);
	float front = clamp(0.18 + progress * 0.78, 0.0, 0.98);
	float thickness = mix(0.24, 0.08, progress);
	float ring = exp(-pow((dist - front) / max(0.02, thickness), 2.0));
	float inner_glow = pow(clamp(1.0 - dist / max(0.1, front), 0.0, 1.0), 2.2) * (1.0 - progress) * 0.48;

	vec3 col = ring_color.rgb;
	float extra = 0.0;
	if (blast_mode == 1) {
		// missile_emp_shockwave.shader: sinusoidal concentric EMP ripple waves
		float emp_wave = 0.5 + 0.5 * sin((dist * 6.2831853 * wave_count) - (TIME * wave_speed));
		float env = smoothstep(front + 0.05, front - 0.45, dist) * smoothstep(0.02, 0.22, dist);
		extra = emp_wave * env * 0.65;
		col = mix(col, vec3(0.68, 0.82, 1.0), emp_wave * 0.5);
	} else if (blast_mode == 3) {
		// reactor_shockwave.shader: bright plasma flash core + turquoise ring
		float core_flash = exp(-dist * dist * 10.0) * clamp(1.0 - progress * 1.9, 0.0, 1.0);
		extra = core_flash * 1.15;
		col = mix(col, vec3(0.92, 1.0, 0.96), clamp(ring * 0.6 + core_flash, 0.0, 1.0));
	} else if (blast_mode == 2) {
		// missile_nuke_shockwave.shader: double thermal ring
		float ring2 = exp(-pow((dist - front * 0.72) / max(0.03, thickness * 1.2), 2.0)) * 0.55;
		extra = ring2;
		col = mix(col, vec3(1.0, 0.96, 0.82), ring * 0.65);
	}

	float alpha = clamp((ring * 0.92 + inner_glow + extra) * fade, 0.0, 0.96);
	if (alpha <= 0.005) {
		discard;
	}
	COLOR = vec4(col * (1.1 + ring * 0.45) * alpha, alpha);
}
