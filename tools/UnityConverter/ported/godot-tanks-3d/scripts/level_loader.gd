class_name TanksLevelLoader
extends Node3D

## Reconstructs the Unity binary LevelArt.prefab (103 FBX mesh nodes + 41 BoxColliders + 21 binary .mat colors)

var material_cache: Dictionary = {}
var model_cache: Dictionary = {}
var loaded_mesh_count: int = 0
var loaded_collider_count: int = 0

func build_from_manifest(json_path: String = "res://assets/level_art.json") -> void:
	var f := FileAccess.open(json_path, FileAccess.READ)
	if f == null:
		push_error("Missing level manifest: " + json_path)
		return
	var data: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()

	# Build StandardMaterial3D cache from extracted binary .mat RGBA colors
	# Convert Unity Gamma-space serialized colors to richer PBR albedo matching original desert lighting
	var mat_colors: Dictionary = data.get("materialColors", {})
	for mat_name in mat_colors.keys():
		var rgba: Array = mat_colors[mat_name]
		var m := StandardMaterial3D.new()
		var c := Color(rgba[0], rgba[1], rgba[2], rgba[3]).srgb_to_linear()
		m.albedo_color = Color(c.r, c.g, c.b, rgba[3])
		m.roughness = 0.88
		if mat_name == "BuildingMetal.mat" or mat_name == "OilDrums.mat":
			m.metallic = 0.35
			m.roughness = 0.55
		elif mat_name == "BuildingGlass.mat":
			m.metallic = 0.15
			m.roughness = 0.25
		material_cache[mat_name] = m

	# Preload FBX scenes
	var mesh_nodes: Array = data.get("meshNodes", [])
	var art_root := Node3D.new()
	art_root.name = "LevelArt"
	add_child(art_root)

	for entry in mesh_nodes:
		var model_file: String = entry.model
		var res_path := "res://assets/models/%s" % model_file
		if not model_cache.has(res_path):
			if ResourceLoader.exists(res_path):
				model_cache[res_path] = load(res_path)
			else:
				model_cache[res_path] = null
		var packed: PackedScene = model_cache[res_path]
		if packed == null:
			continue

		var inst := packed.instantiate() as Node3D
		inst.name = entry.name
		var p: Array = entry.pos
		var q: Array = entry.quat
		var s: Array = entry.scale
		var quat := Quaternion(q[0], q[1], q[2], q[3]).normalized()
		inst.transform = Transform3D(Basis(quat).scaled(Vector3(s[0], s[1], s[2])), Vector3(p[0], p[1], p[2]))

		# Apply Unity MeshRenderer submesh materials from extracted .mat list
		var mats: Array = entry.materials
		if not mats.is_empty():
			_apply_materials_recursive(inst, mats)

		art_root.add_child(inst)
		loaded_mesh_count += 1

	# Add desert ground plane collider & extracted obstacle BoxColliders
	var ground_body := StaticBody3D.new()
	ground_body.name = "GroundCollider"
	ground_body.collision_layer = 1
	var g_col := CollisionShape3D.new()
	var g_box := BoxShape3D.new()
	g_box.size = Vector3(220.0, 2.0, 220.0)
	g_col.shape = g_box
	g_col.position = Vector3(0.0, -1.0, 0.0)
	ground_body.add_child(g_col)
	add_child(ground_body)

	var col_root := Node3D.new()
	col_root.name = "ObstacleColliders"
	add_child(col_root)
	for c_entry in data.get("colliderNodes", []):
		var body := StaticBody3D.new()
		body.name = "Col_%s" % c_entry.name
		body.collision_layer = 1
		var cp: Array = c_entry.pos
		var cq: Array = c_entry.quat
		var cs: Array = c_entry.scale
		var sz: Array = c_entry.size
		var ctr: Array = c_entry.center
		var quat := Quaternion(cq[0], cq[1], cq[2], cq[3]).normalized()
		body.transform = Transform3D(Basis(quat), Vector3(cp[0], cp[1], cp[2]))
		var shape := CollisionShape3D.new()
		var b := BoxShape3D.new()
		b.size = Vector3(abs(sz[0] * cs[0]), max(abs(sz[1] * cs[1]), 1.0), abs(sz[2] * cs[2]))
		shape.shape = b
		shape.position = Vector3(ctr[0] * cs[0], ctr[1] * cs[1], ctr[2] * cs[2])
		body.add_child(shape)
		col_root.add_child(body)
		loaded_collider_count += 1

func _apply_materials_recursive(node: Node, mats: Array) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var surf_count := mi.get_surface_override_material_count()
		for i in range(surf_count):
			var mname: String = mats[min(i, mats.size() - 1)]
			if material_cache.has(mname):
				mi.set_surface_override_material(i, material_cache[mname])
	for child in node.get_children():
		_apply_materials_recursive(child, mats)
