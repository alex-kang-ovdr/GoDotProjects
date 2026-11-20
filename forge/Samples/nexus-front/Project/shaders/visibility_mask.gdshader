shader_type canvas_item;
render_mode unshaded;

// Exact current visibility, red channel 0 or 1. Nearest filtering is deliberate:
// interpolation would disclose half-visible pixels across cell boundaries.
uniform sampler2D visibility_mask : filter_nearest, repeat_disable;
uniform vec2 view_size = vec2(1280.0, 720.0);
uniform vec2 camera_pos = vec2(800.0, 800.0);
uniform float zoom = 1.0;
uniform float world_size = 1600.0;

void fragment() {
    vec4 rendered = texture(TEXTURE, UV);
    vec2 world_position = (UV * view_size - view_size * 0.5) / max(zoom, 0.0001) + camera_pos;
    vec2 world_uv = world_position / max(world_size, 0.0001);
    float in_world = step(0.0, world_uv.x) * step(0.0, world_uv.y)
                   * (1.0 - step(1.0, world_uv.x)) * (1.0 - step(1.0, world_uv.y));
    float visible = step(0.5, texture(visibility_mask, clamp(world_uv, vec2(0.0), vec2(1.0))).r);
    COLOR = vec4(rendered.rgb, rendered.a * visible * in_world);
}
