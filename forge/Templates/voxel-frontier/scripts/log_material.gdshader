shader_type spatial;

uniform sampler2D bark : source_color, filter_nearest, repeat_enable;
uniform sampler2D end_grain : source_color, filter_nearest, repeat_enable;

void fragment() {
	// A face stays in its own UV range, including after greedy rectangle merge.
	ALBEDO = UV.x > 32.0 ? texture(end_grain, UV - vec2(64.0, 0.0)).rgb : texture(bark, UV).rgb;
	ROUGHNESS = 0.95;
}
