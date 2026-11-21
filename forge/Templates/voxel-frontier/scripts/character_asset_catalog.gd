class_name CharacterAssetCatalog

## Pure-GDScript procedural cuboid creature builder for PlayForge 3D Web/Native.
## Replaces external binary GLB assets with shared BoxMesh + StandardMaterial3D rigs.

const CREATURE_SPECS: Dictionary = {
	"slime": {
		"name": "Moss Slime",
		"style": "quad",
		"body_color": Color("#55b848"),
		"accent_color": Color("#8ce36f"),
		"eye_color": Color("#142414"),
		"scale": 0.95,
		"parts": [
			{"name": "Body", "size": Vector3(0.76, 0.64, 0.76), "pos": Vector3(0.0, 0.34, 0.0), "role": "body"},
			{"name": "Core", "size": Vector3(0.46, 0.38, 0.46), "pos": Vector3(0.0, 0.34, 0.0), "role": "accent"},
			{"name": "EyeL", "size": Vector3(0.11, 0.11, 0.06), "pos": Vector3(-0.17, 0.44, 0.38), "role": "eye"},
			{"name": "EyeR", "size": Vector3(0.11, 0.11, 0.06), "pos": Vector3(0.17, 0.44, 0.38), "role": "eye"},
		],
	},
	"golem": {
		"name": "Stone Golem",
		"style": "biped",
		"body_color": Color("#8b949e"),
		"accent_color": Color("#56616e"),
		"eye_color": Color("#f5a623"),
		"scale": 1.05,
		"parts": [
			{"name": "LegL", "size": Vector3(0.24, 0.48, 0.24), "pos": Vector3(-0.18, 0.24, 0.0), "role": "accent", "pivot": Vector3(-0.18, 0.48, 0.0)},
			{"name": "LegR", "size": Vector3(0.24, 0.48, 0.24), "pos": Vector3(0.18, 0.24, 0.0), "role": "accent", "pivot": Vector3(0.18, 0.48, 0.0)},
			{"name": "Body", "size": Vector3(0.68, 0.58, 0.38), "pos": Vector3(0.0, 0.77, 0.0), "role": "body"},
			{"name": "Head", "size": Vector3(0.38, 0.36, 0.36), "pos": Vector3(0.0, 1.24, 0.02), "role": "body"},
			{"name": "ArmL", "size": Vector3(0.20, 0.62, 0.22), "pos": Vector3(-0.46, 0.72, 0.0), "role": "accent", "pivot": Vector3(-0.46, 1.00, 0.0)},
			{"name": "ArmR", "size": Vector3(0.20, 0.62, 0.22), "pos": Vector3(0.46, 0.72, 0.0), "role": "accent", "pivot": Vector3(0.46, 1.00, 0.0)},
			{"name": "EyeL", "size": Vector3(0.09, 0.07, 0.05), "pos": Vector3(-0.09, 1.26, 0.20), "role": "eye"},
			{"name": "EyeR", "size": Vector3(0.09, 0.07, 0.05), "pos": Vector3(0.09, 1.26, 0.20), "role": "eye"},
		],
	},
	"skeleton": {
		"name": "Bone Scout",
		"style": "biped",
		"body_color": Color("#d9d6cc"),
		"accent_color": Color("#9d988c"),
		"eye_color": Color("#212126"),
		"scale": 0.96,
		"parts": [
			{"name": "LegL", "size": Vector3(0.14, 0.54, 0.14), "pos": Vector3(-0.13, 0.27, 0.0), "role": "accent", "pivot": Vector3(-0.13, 0.54, 0.0)},
			{"name": "LegR", "size": Vector3(0.14, 0.54, 0.14), "pos": Vector3(0.13, 0.27, 0.0), "role": "accent", "pivot": Vector3(0.13, 0.54, 0.0)},
			{"name": "Body", "size": Vector3(0.42, 0.52, 0.24), "pos": Vector3(0.0, 0.80, 0.0), "role": "body"},
			{"name": "Head", "size": Vector3(0.36, 0.36, 0.36), "pos": Vector3(0.0, 1.24, 0.0), "role": "body"},
			{"name": "ArmL", "size": Vector3(0.12, 0.52, 0.12), "pos": Vector3(-0.29, 0.78, 0.0), "role": "accent", "pivot": Vector3(-0.29, 1.02, 0.0)},
			{"name": "ArmR", "size": Vector3(0.12, 0.52, 0.12), "pos": Vector3(0.29, 0.78, 0.0), "role": "accent", "pivot": Vector3(0.29, 1.02, 0.0)},
			{"name": "EyeL", "size": Vector3(0.08, 0.08, 0.05), "pos": Vector3(-0.08, 1.26, 0.18), "role": "eye"},
			{"name": "EyeR", "size": Vector3(0.08, 0.08, 0.05), "pos": Vector3(0.08, 1.26, 0.18), "role": "eye"},
		],
	},
	"pig": {
		"name": "Meadow Pig",
		"style": "quad",
		"body_color": Color("#e89aa9"),
		"accent_color": Color("#cc7387"),
		"eye_color": Color("#231c1f"),
		"scale": 0.92,
		"parts": [
			{"name": "LegL", "size": Vector3(0.16, 0.30, 0.16), "pos": Vector3(-0.18, 0.15, 0.22), "role": "accent", "pivot": Vector3(-0.18, 0.30, 0.22)},
			{"name": "LegR", "size": Vector3(0.16, 0.30, 0.16), "pos": Vector3(0.18, 0.15, 0.22), "role": "accent", "pivot": Vector3(0.18, 0.30, 0.22)},
			{"name": "ArmL", "size": Vector3(0.16, 0.30, 0.16), "pos": Vector3(-0.18, 0.15, -0.22), "role": "accent", "pivot": Vector3(-0.18, 0.30, -0.22)},
			{"name": "ArmR", "size": Vector3(0.16, 0.30, 0.16), "pos": Vector3(0.18, 0.15, -0.22), "role": "accent", "pivot": Vector3(0.18, 0.30, -0.22)},
			{"name": "Body", "size": Vector3(0.56, 0.42, 0.78), "pos": Vector3(0.0, 0.48, 0.0), "role": "body"},
			{"name": "Head", "size": Vector3(0.42, 0.38, 0.40), "pos": Vector3(0.0, 0.62, 0.46), "role": "body"},
			{"name": "Snout", "size": Vector3(0.22, 0.14, 0.10), "pos": Vector3(0.0, 0.56, 0.69), "role": "accent"},
			{"name": "EyeL", "size": Vector3(0.07, 0.07, 0.05), "pos": Vector3(-0.11, 0.68, 0.66), "role": "eye"},
			{"name": "EyeR", "size": Vector3(0.07, 0.07, 0.05), "pos": Vector3(0.11, 0.68, 0.66), "role": "eye"},
		],
	},
	"fox": {
		"name": "Timber Fox",
		"style": "quad",
		"body_color": Color("#d96b27"),
		"accent_color": Color("#f3ece1"),
		"eye_color": Color("#1d1917"),
		"scale": 0.90,
		"parts": [
			{"name": "LegL", "size": Vector3(0.13, 0.32, 0.13), "pos": Vector3(-0.15, 0.16, 0.24), "role": "eye", "pivot": Vector3(-0.15, 0.32, 0.24)},
			{"name": "LegR", "size": Vector3(0.13, 0.32, 0.13), "pos": Vector3(0.15, 0.16, 0.24), "role": "eye", "pivot": Vector3(0.15, 0.32, 0.24)},
			{"name": "ArmL", "size": Vector3(0.13, 0.32, 0.13), "pos": Vector3(-0.15, 0.16, -0.24), "role": "eye", "pivot": Vector3(-0.15, 0.32, -0.24)},
			{"name": "ArmR", "size": Vector3(0.13, 0.32, 0.13), "pos": Vector3(0.15, 0.16, -0.24), "role": "eye", "pivot": Vector3(0.15, 0.32, -0.24)},
			{"name": "Body", "size": Vector3(0.44, 0.34, 0.76), "pos": Vector3(0.0, 0.44, 0.0), "role": "body"},
			{"name": "Tail", "size": Vector3(0.20, 0.20, 0.46), "pos": Vector3(0.0, 0.44, -0.54), "role": "accent"},
			{"name": "Head", "size": Vector3(0.36, 0.30, 0.36), "pos": Vector3(0.0, 0.56, 0.44), "role": "body"},
			{"name": "EarL", "size": Vector3(0.09, 0.14, 0.08), "pos": Vector3(-0.12, 0.76, 0.38), "role": "accent"},
			{"name": "EarR", "size": Vector3(0.09, 0.14, 0.08), "pos": Vector3(0.12, 0.76, 0.38), "role": "accent"},
			{"name": "EyeL", "size": Vector3(0.06, 0.06, 0.05), "pos": Vector3(-0.09, 0.60, 0.62), "role": "eye"},
			{"name": "EyeR", "size": Vector3(0.06, 0.06, 0.05), "pos": Vector3(0.09, 0.60, 0.62), "role": "eye"},
		],
	},
	"sentinel": {
		"name": "Copper Sentinel",
		"style": "biped",
		"body_color": Color("#3b8ea5"),
		"accent_color": Color("#c87d4b"),
		"eye_color": Color("#7ef9ff"),
		"scale": 0.98,
		"parts": [
			{"name": "LegL", "size": Vector3(0.18, 0.48, 0.18), "pos": Vector3(-0.15, 0.24, 0.0), "role": "accent", "pivot": Vector3(-0.15, 0.48, 0.0)},
			{"name": "LegR", "size": Vector3(0.18, 0.48, 0.18), "pos": Vector3(0.15, 0.24, 0.0), "role": "accent", "pivot": Vector3(0.15, 0.48, 0.0)},
			{"name": "Body", "size": Vector3(0.50, 0.54, 0.30), "pos": Vector3(0.0, 0.75, 0.0), "role": "body"},
			{"name": "Head", "size": Vector3(0.36, 0.34, 0.34), "pos": Vector3(0.0, 1.20, 0.0), "role": "accent"},
			{"name": "ArmL", "size": Vector3(0.16, 0.50, 0.16), "pos": Vector3(-0.35, 0.74, 0.0), "role": "body", "pivot": Vector3(-0.35, 0.98, 0.0)},
			{"name": "ArmR", "size": Vector3(0.16, 0.50, 0.16), "pos": Vector3(0.35, 0.74, 0.0), "role": "body", "pivot": Vector3(0.35, 0.98, 0.0)},
			{"name": "EyeL", "size": Vector3(0.22, 0.08, 0.05), "pos": Vector3(0.0, 1.21, 0.18), "role": "eye"},
		],
	},
}

static var _material_cache: Dictionary = {}
static var _mesh_cache: Dictionary = {}


static func manifest() -> Dictionary:
	var entries: Array = []
	for variant_id: String in CREATURE_SPECS.keys():
		var spec: Dictionary = CREATURE_SPECS[variant_id]
		entries.append({"id": variant_id, "name": spec.name, "style": spec.style})
	return {"format": "procedural_cuboid_v1", "assets": entries}


static func assets() -> Array:
	return manifest().get("assets", [])


static func variant_ids() -> Array[String]:
	var ids: Array[String] = []
	for key: String in CREATURE_SPECS.keys():
		ids.append(key)
	return ids


static func scene_for(_character_name: String) -> PackedScene:
	return null


static func instantiate(character_name: String) -> Node3D:
	return build_visual(character_name)


static func build_visual(character_name: String) -> Node3D:
	var spec: Dictionary = CREATURE_SPECS.get(character_name, CREATURE_SPECS["slime"])
	var root := Node3D.new()
	root.name = "ProceduralCuboidVisual"
	root.scale = Vector3.ONE * float(spec.get("scale", 1.0))
	var colors := {
		"body": spec.get("body_color", Color("#7ea653")),
		"accent": spec.get("accent_color", Color("#506b34")),
		"eye": spec.get("eye_color", Color("#191d22")),
	}
	for part: Dictionary in spec.get("parts", []):
		var part_name: String = part.name
		var part_size: Vector3 = part.size
		var part_pos: Vector3 = part.pos
		var role: String = part.get("role", "body")
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.mesh = _shared_box_mesh(part_size)
		mesh_instance.material_override = _shared_material(colors.get(role, colors.body), role == "eye")
		if part.has("pivot"):
			var pivot := Node3D.new()
			pivot.name = part_name
			pivot.position = part.pivot
			mesh_instance.name = "Mesh"
			mesh_instance.position = part_pos - part.pivot
			pivot.add_child(mesh_instance)
			root.add_child(pivot)
		else:
			mesh_instance.name = part_name
			mesh_instance.position = part_pos
			root.add_child(mesh_instance)
	return root


static func _shared_box_mesh(box_size: Vector3) -> BoxMesh:
	var key := "%d_%d_%d" % [roundi(box_size.x * 1000.0), roundi(box_size.y * 1000.0), roundi(box_size.z * 1000.0)]
	if _mesh_cache.has(key):
		return _mesh_cache[key]
	var mesh := BoxMesh.new()
	mesh.size = box_size
	_mesh_cache[key] = mesh
	return mesh


static func _shared_material(color: Color, emissive_eye: bool) -> StandardMaterial3D:
	var key := "%s_%d" % [color.to_html(false), int(emissive_eye)]
	if _material_cache.has(key):
		return _material_cache[key]
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.86 if not emissive_eye else 0.35
	if emissive_eye and color.get_luminance() > 0.35:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = 0.65
	_material_cache[key] = material
	return material
