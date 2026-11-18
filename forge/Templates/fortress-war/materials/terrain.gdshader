shader_type canvas_item;
uniform vec4 soil_color : source_color = vec4(0.22, 0.29, 0.25, 1.0);
uniform vec4 edge_color : source_color = vec4(0.56, 0.77, 0.46, 1.0);
void fragment() {
    float occupied = step(0.001, texture(TEXTURE, UV).r);
    float above = step(0.001, texture(TEXTURE, UV - vec2(0.0, TEXTURE_PIXEL_SIZE.y * 5.0)).r);
    float stripe = 0.94 + 0.06 * sin(UV.y * 280.0 + sin(UV.x * 53.0));
    COLOR = mix(edge_color, soil_color * vec4(vec3(stripe), 1.0), above);
    COLOR.a = occupied;
}
