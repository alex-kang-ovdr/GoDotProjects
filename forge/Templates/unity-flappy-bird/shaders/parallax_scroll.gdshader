shader_type canvas_item;

// Port of Assets/Scripts/Parallax.cs (material.mainTextureOffset += Vector2(speed * dt, 0))
uniform float scroll_offset = 0.0;

void fragment() {
	vec2 uv = vec2(fract(UV.x + scroll_offset), UV.y);
	COLOR = texture(TEXTURE, uv);
}
