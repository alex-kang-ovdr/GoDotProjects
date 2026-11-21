class_name ParallaxScroll
extends TextureRect

## Port of Assets/Scripts/Parallax.cs

@export var animation_speed: float = 0.05
var offset_x: float = 0.0
var active: bool = true

func _process(delta: float) -> void:
	if not active:
		return
	offset_x = fmod(offset_x + animation_speed * delta, 1.0)
	var mat := material as ShaderMaterial
	if mat:
		mat.set_shader_parameter("scroll_offset", offset_x)
