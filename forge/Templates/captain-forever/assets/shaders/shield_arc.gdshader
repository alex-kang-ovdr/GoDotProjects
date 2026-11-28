shader_type canvas_item;
render_mode blend_add, unshaded;

// Restored from Cosmoteer: ships/terran/shield_gen_small/shield.shader & shield_overload.shader
uniform vec4 full_power_color1 : source_color = vec4(0.32, 0.88, 1.0, 1.0);
uniform vec4 full_power_color2 : source_color = vec4(0.85, 0.98, 1.0, 1.0);
uniform vec4 low_power_color1 : source_color = vec4(1.0, 0.36, 0.28, 1.0);
uniform vec4 low_power_color2 : source_color = vec4(1.0, 0.78, 0.45, 1.0);
uniform float power_level : hint_range(0.0, 1.0) = 1.0;
uniform float facing_angle = 0.0;
uniform float half_arc_rad = 1.05;
uniform float hit_flash : hint_range(0.0, 1.0) = 0.0;
uniform float overclocked : hint_range(0.0, 1.0) = 0.0;
uniform float disrupted : hint_range(0.0, 1.0) = 0.0;
uniform float wave_speed = 2.4;

float hex_cell(vec2 p) {
	vec2 r = vec2(1.0, 1.7320508);
	vec2 h = r * 0.5;
	vec2 a = mod(p, r) - h;
	vec2 b = mod(p - h, r) - h;
	vec2 gv = dot(a, a) < dot(b, b) ? a : b;
	float d = max(abs(gv.x), dot(abs(gv), normalize(r)));
	return smoothstep(0.42, 0.50, d);
}

void fragment() {
	vec2 centered = (UV - vec2(0.5)) * 2.0;
	float dist = length(centered);
	if (dist > 1.0 || dist < 0.52) {
		discard;
	}
	float ang = atan(centered.y, centered.x);
	float diff = atan(sin(ang - facing_angle), cos(ang - facing_angle));
	float abs_diff = abs(diff);
	if (abs_diff > half_arc_rad) {
		discard;
	}
	float pwr = smoothstep(0.0, 1.0, power_level);
	vec4 c1 = mix(low_power_color1, full_power_color1, pwr);
	vec4 c2 = mix(low_power_color2, full_power_color2, pwr);
	if (overclocked > 0.5) {
		c1 = mix(c1, vec4(0.45, 1.0, 0.85, 1.0), 0.38);
	}
	if (disrupted > 0.05) {
		c1 = mix(c1, vec4(0.78, 0.42, 1.0, 1.0), 0.55);
	}

	// Cosmoteer shield.shader travelling wave curve + outer rim thickness
	float u_arc = (diff / max(0.05, half_arc_rad)) * 0.5 + 0.5;
	float radial = clamp((dist - 0.56) / 0.44, 0.0, 1.0);
	float wave_v = (TIME + sin(u_arc * 18.8495 + TIME * 2.2) * 0.14) * wave_speed;
	float plasma_wave = 0.5 + 0.5 * sin(u_arc * 28.0 + radial * 10.0 - wave_v * 3.2);
	float plasma_wave2 = 0.5 + 0.5 * sin(u_arc * 16.0 - radial * 14.0 + wave_v * 2.1);
	float wave_a = plasma_wave * 0.65 + plasma_wave2 * 0.35;

	// Hex damage grid mask from shield.shader
	float hex_grid = hex_cell(vec2(u_arc * 16.0, radial * 5.0));
	float hex_dmg = clamp((1.0 - pwr) * 0.75 + hit_flash * 0.9 + disrupted * 0.5, 0.0, 1.0);

	// Outer arc rim + soft inner curtain + smooth angular taper at arc ends
	float rim = pow(radial, 4.2) * smoothstep(1.0, 0.91, dist);
	float curtain = pow(radial, 1.8) * 0.38 * smoothstep(1.0, 0.88, dist);
	float arc_edge = smoothstep(half_arc_rad, max(0.0, half_arc_rad - 0.16), abs_diff);
	float base_intensity = (rim * 1.35 + curtain * (0.65 + 0.55 * wave_a) + hex_grid * hex_dmg * 0.55 * radial) * arc_edge;

	vec3 col = mix(c1.rgb, c2.rgb, clamp(wave_a * 0.55 + rim * 0.65 + hit_flash * 0.7, 0.0, 1.0));
	col += vec3(0.45, 0.85, 1.0) * hit_flash * rim * 1.4;
	float alpha = clamp(base_intensity * (0.42 + 0.58 * pwr + hit_flash * 0.45), 0.0, 0.95);
	COLOR = vec4(col * alpha, alpha);
}
