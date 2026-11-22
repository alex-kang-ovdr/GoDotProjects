shader_type spatial;
// Deterministic Godot 4 Shader compiled from Unity URP MetalSmoothEmissive ShaderGraph (env_deco_boss_arena)

uniform sampler2D tex_albedo : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D tex_normal : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D tex_emissive : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 rune_tint : source_color = vec4(1.0, 0.25, 0.08, 1.0);
uniform float pulse_speed = 2.2;
uniform float base_energy = 3.40;

void fragment() {
	vec3 base_col = texture(tex_albedo, UV).rgb;
	vec3 em_mask = texture(tex_emissive, UV).rgb;
	float pulse = 0.85 + 0.25 * sin(TIME * pulse_speed);
	ALBEDO = base_col * vec3(0.86, 0.88, 0.96);
	NORMAL_MAP = texture(tex_normal, UV).rgb;
	ROUGHNESS = 0.86;
	METALLIC = 0.05;
	EMISSION = em_mask * rune_tint.rgb * base_energy * pulse;
}
