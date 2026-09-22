shader_type spatial;
render_mode diffuse_burley, cull_back;

// R: 발광 강도, G: 알베도 색조 적용량, B: 거칠기(검정=매끈, 흰색=거침).
uniform sampler2D albedo_map : source_color, filter_nearest;
uniform sampler2D mask_map : filter_nearest;
uniform vec4 tint_color : source_color = vec4(1.0);
uniform vec4 emission_color : source_color = vec4(1.0);
uniform float emission_energy : hint_range(0.0, 4.0) = 1.0;
uniform float metallic_value : hint_range(0.0, 1.0) = 0.18;
uniform float roughness_min : hint_range(0.0, 1.0) = 0.14;
uniform float roughness_max : hint_range(0.0, 1.0) = 0.96;

void fragment() {
	vec4 base = texture(albedo_map, UV);
	vec3 mask = texture(mask_map, UV).rgb;
	ALBEDO = mix(base.rgb, base.rgb * tint_color.rgb, mask.g);
	METALLIC = metallic_value;
	ROUGHNESS = mix(roughness_min, roughness_max, mask.b);
	EMISSION = emission_color.rgb * mask.r * emission_energy;
}
