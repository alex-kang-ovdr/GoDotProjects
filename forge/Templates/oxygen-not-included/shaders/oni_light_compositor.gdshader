shader_type canvas_item;
render_mode blend_mul;

// Ported from ONI Klei/PostFX/LightBufferCompositor.
// Multiplies the world by a smooth 48x32 dynamic light & subterranean depth Sprite2D TEXTURE
// (Printing Pod light, Shine Bug moving light, active machines, deep cave falloff).

uniform float ambient_floor : hint_range(0.2, 1.0) = 0.44;
uniform float overlay_bypass : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec4 lm = texture(TEXTURE, UV);
	vec3 light_rgb = max(lm.rgb, vec3(ambient_floor));
	vec3 final_mul = mix(light_rgb, vec3(1.0), overlay_bypass);
	COLOR = vec4(final_mul, 1.0);
}
