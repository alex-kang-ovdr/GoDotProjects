shader_type canvas_item;

// Ported from ONI Klei/Substance & Klei/BuildingCell shader properties
// (_MainTex, _Color, _ThermalGlow, _EdgeBevel).

uniform float bevel_strength : hint_range(0.0, 0.5) = 0.16;
uniform float heat_glow : hint_range(0.0, 1.0) = 0.0;
uniform float time_sec = 0.0;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	vec2 tile_uv = fract(UV * 1.0);
	float edge_x = min(tile_uv.x, 1.0 - tile_uv.x);
	float edge_y = min(tile_uv.y, 1.0 - tile_uv.y);
	float border = smoothstep(0.0, 0.09, min(edge_x, edge_y));
	float shade = mix(1.0 - bevel_strength, 1.0 + bevel_strength * 0.25, border);

	vec3 col = tex.rgb * COLOR.rgb * shade;
	if (heat_glow > 0.01) {
		float pulse = 0.82 + 0.18 * sin(time_sec * 3.5);
		col += vec3(0.95, 0.28, 0.08) * heat_glow * 0.45 * pulse;
	}
	COLOR = vec4(col, tex.a * COLOR.a);
}
