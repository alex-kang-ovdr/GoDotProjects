shader_type spatial;
render_mode depth_draw_opaque, cull_back;
// Auto-compiled from UE Material Graph: M_GoalPad_Graph

uniform vec3 base_color : source_color = vec3(0.14, 0.78, 0.38);
uniform vec3 emissive_color : source_color = vec3(0.22, 0.98, 0.52);
uniform float metallic_val : hint_range(0.0, 1.0) = 0.1;
uniform float roughness_val : hint_range(0.0, 1.0) = 0.3;
uniform float pulse_speed = 2.5;
uniform float fresnel_power = 1.8;
uniform vec2 pan_speed = vec2(0.3, 0);
uniform float active_strength = 1.0;

void fragment() {
	vec2 uv_panned = UV + pan_speed * TIME;
	float scan_band = 0.5 + 0.5 * sin((uv_panned.x + uv_panned.y) * 18.0);
	float pulse = 0.65 + 0.35 * sin(TIME * pulse_speed);
	float fresnel = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), fresnel_power);
	ALBEDO = mix(base_color, emissive_color, clamp(fresnel * 0.6 + scan_band * 0.2, 0.0, 1.0));
	METALLIC = metallic_val;
	ROUGHNESS = roughness_val;
	EMISSION = emissive_color * (0.45 + fresnel * 1.4) * pulse * scan_band * active_strength;
}
