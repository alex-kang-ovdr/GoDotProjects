class_name WorldLighting
extends RefCounted

const PROFILE_ID := "soft-day-v1"
const SUN_ENERGY := 0.22
const AMBIENT_ENERGY := 0.48


static func environment_resource() -> Environment:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#75a9d6")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#c9d8e2")
	environment.ambient_light_energy = AMBIENT_ENERGY
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	return environment


static func sun_node(shadows: bool = true) -> DirectionalLight3D:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_energy = SUN_ENERGY
	sun.shadow_enabled = shadows
	return sun
