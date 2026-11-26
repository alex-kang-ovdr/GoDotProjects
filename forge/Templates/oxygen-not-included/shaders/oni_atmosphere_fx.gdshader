shader_type canvas_item;

// Ported from ONI Klei/PostFX/LightBufferCompositor screen-space framing pass.
// Provides a clean subterranean edge vignette without washing out world-space rock textures
// (cavity-confined gas clouds and dynamic lighting are handled in world space by
// oni_gas_volume.gdshader and oni_light_compositor.gdshader).

uniform float time_sec : hint_range(0.0, 10000.0) = 0.0;
uniform int overlay_mode = 0; // 0=normal, 1=gas, 2=temp, 3=pipe
uniform float avg_oxygen : hint_range(0.0, 3.0) = 1.0;

void fragment() {
	vec2 uv = UV;
	vec2 centered = uv - vec2(0.5);
	float dist = length(centered);
	float vig = smoothstep(0.46, 0.92, dist);

	vec3 tint = vec3(0.03, 0.05, 0.09);
	float alpha = 0.0;

	if (overlay_mode == 0) {
		// Clean cinematic subterranean frame vignette only
		tint = vec3(0.03, 0.05, 0.09);
		alpha = vig * 0.22;
	} else if (overlay_mode == 1) {
		// Gas overlay: subtle teal edge vignette
		tint = vec3(0.04, 0.14, 0.22);
		alpha = vig * 0.18;
	} else if (overlay_mode == 2) {
		// Thermal overlay: subtle warm scanline sheen + edge vignette
		float wave = sin(uv.y * 110.0 - time_sec * 2.8) * 0.5 + 0.5;
		tint = mix(vec3(0.18, 0.08, 0.05), vec3(0.95, 0.58, 0.22), wave * 0.25);
		alpha = vig * 0.15 + wave * 0.018;
	} else {
		// Conduit overlay: clean blueprint border vignette
		tint = vec3(0.04, 0.10, 0.18);
		alpha = vig * 0.22;
	}

	COLOR = vec4(tint, clamp(alpha, 0.0, 0.30));
}
