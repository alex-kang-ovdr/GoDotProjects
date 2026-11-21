extends SceneTree

## Extracts all FBX models under res://assets/models into standalone Godot ArrayMesh .tres files.
## Multi-mesh FBX hierarchies (e.g. Tank.fbx with body/turret/tracks) are baked into a single ArrayMesh
## with local transforms applied so every template model loads cleanly as a pure text .tres resource.

func _collect_meshes(node: Node, parent_xform: Transform3D, out: Array) -> void:
	var cur_xform := parent_xform
	if node is Node3D:
		cur_xform = parent_xform * (node as Node3D).transform
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		out.append({ "mesh": (node as MeshInstance3D).mesh, "xform": cur_xform })
	for c in node.get_children():
		_collect_meshes(c, cur_xform, out)

func _merge_meshes(entries: Array) -> ArrayMesh:
	var merged := ArrayMesh.new()
	for entry in entries:
		var src: Mesh = entry.mesh
		var xf: Transform3D = entry.xform
		var normal_basis := xf.basis.inverse().transposed()
		for surf_idx in range(src.get_surface_count()):
			var arrays := src.surface_get_arrays(surf_idx)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var new_verts := PackedVector3Array()
			new_verts.resize(verts.size())
			for i in range(verts.size()):
				new_verts[i] = xf * verts[i]
			arrays[Mesh.ARRAY_VERTEX] = new_verts

			if arrays[Mesh.ARRAY_NORMAL] != null and (arrays[Mesh.ARRAY_NORMAL] as PackedVector3Array).size() > 0:
				var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
				var new_norms := PackedVector3Array()
				new_norms.resize(norms.size())
				for i in range(norms.size()):
					new_norms[i] = (normal_basis * norms[i]).normalized()
				arrays[Mesh.ARRAY_NORMAL] = new_norms

			# Strip bone/weight arrays if any (static template geometry)
			arrays[Mesh.ARRAY_BONES] = null
			arrays[Mesh.ARRAY_WEIGHTS] = null
			arrays[Mesh.ARRAY_TANGENT] = null

			var prim: Mesh.PrimitiveType = src.surface_get_primitive_type(surf_idx)
			merged.add_surface_from_arrays(prim, arrays)
	return merged

func _init() -> void:
	var out_dir_abs := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out_dir_abs = arg.substr(6)
	if out_dir_abs == "":
		push_error("Missing -- --out=<abs_dir>")
		quit(1)
		return

	DirAccess.make_dir_recursive_absolute(out_dir_abs)
	var src_dir := "res://assets/models"
	var d := DirAccess.open(src_dir)
	if d == null:
		push_error("Cannot open " + src_dir)
		quit(1)
		return

	var exported := 0
	d.list_dir_begin()
	var fn := d.get_next()
	while fn != "":
		if fn.to_lower().ends_with(".fbx"):
			var ps := load(src_dir + "/" + fn) as PackedScene
			if ps:
				var inst := ps.instantiate()
				var entries: Array = []
				_collect_meshes(inst, Transform3D.IDENTITY, entries)
				if entries.size() > 0:
					var mesh := _merge_meshes(entries)
					var stem := fn.get_basename()
					var save_path := out_dir_abs + "/" + stem + ".tres"
					var err := ResourceSaver.save(mesh, save_path)
					if err == OK:
						exported += 1
						print("EXPORTED %s -> %s.tres (surfaces=%d, parts=%d)" % [fn, stem, mesh.get_surface_count(), entries.size()])
					else:
						push_error("Failed saving %s err=%d" % [save_path, err])
				inst.free()
		fn = d.get_next()
	print("DONE exported=%d" % exported)
	quit(0)
