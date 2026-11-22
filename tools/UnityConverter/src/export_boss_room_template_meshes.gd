extends SceneTree
## Headless Godot 4.7.2 deterministic baker for PlayForge text-only template (unity-boss-room).
## Bakes each of the 6 Boss Room roles (tank, archer, mage, rogue, imp, boss) from CharacterSet.fbx
## and key dungeon pieces from DungeonPieces/door/switch/chest FBX into compact ArrayMesh .tres files.

const ROLE_MESHES := {
	"tank": [
		"Tank_Torso_Boy", "Tank_Head_Boy", "Tank_Hair_Boy", "Tank_Eyes_Boy",
		"Tank_Mouth_Boy", "Tank_Ears_Boy", "Tank_Glove_Lt_Boy", "Tank_Glove_Rt_Boy",
		"Gear_LS_Tank_ShoulderPad_Boy", "Gear_RS_Tank_ShoulderPad_Boy",
		"Tank_Shield_Boy", "Tank_Weapon_Boy",
	],
	"archer": [
		"Archer_Torso_Boy", "Archer_Head_Boy", "Archer_Hair_Boy", "Archer_Eyes_Boy",
		"Archer_Mouth_Boy", "Archer_Ears_Boy", "Archer_Hand_Lt_Boy", "Archer_Hand_Rt_Boy",
		"Gear_LS_Archer_Quiver_Boy", "Archer_weapon_Boy",
	],
	"mage": [
		"Mage_Torso_Girl", "Mage_Head_Girl", "Mage_Hair_Girl", "Mage_Eyes_Girl",
		"Mage_Mouth_Girl", "Mage_Ears_Girl", "Mage_Hand_Lt1_Girl", "Mage_Hand_Rt_Girl",
		"Mage_Weapon_Girl",
	],
	"rogue": [
		"Rogue_Torso_Boy", "Rogue_Head_Boy", "Rogue_Hair_Boy", "Rogue_Eyes_Boy",
		"Rogue_Mouth_Boy", "Rogue_Ears_Boy", "Rogue_Hand_Lt_Boy", "Rogue_Hand_Rt_Boy",
		"Rogue_Weapon_Boy",
	],
	"imp": [
		"Imp_Torso", "Imp_Head", "Imp_Eyes", "Imp_Mouth", "Imp_Ears",
		"Imp_Glove_Lt", "Imp_Glove_Rt", "Gear_LS_Boss_ShoulderPad_Imp", "Imp_WeaponR",
	],
	"boss": [
		"Boss_Torso", "Boss_Cape", "Boss_Head", "Boss_Eyes", "Boss_Mouth", "Boss_Ears",
		"Boss_Helmet", "Boss_Glove_Lt", "Boss_Glove_Rt",
		"Gear_LS_Boss_ShoulderPad_Boss", "Gear_RS_Boss_ShoulderPad_Boss",
		"Boss_WeaponL", "Boss_WeaponR",
	],
}

const DUNGEON_KEEP := [
	"boss_floor", "boss_floor_2", "wall1_base_straight_1", "wall1_top_straight_1",
	"Pillar_LOD0", "banner_LOD0", "torch2", "pot2_LOD0", "door_crystral_base", "fx_arrrow",
]


func _init() -> void:
	var out_dir: String = ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out_dir = arg.trim_prefix("--out=")
	if out_dir == "":
		push_error("Missing --out=<dir>")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(out_dir)

	# 1. Bake 6 character role ArrayMesh .tres with surface names = original mesh names
	var cs_scene: PackedScene = load("res://assets/models/CharacterSet.fbx") as PackedScene
	var cs_inst: Node3D = cs_scene.instantiate() as Node3D
	root.add_child(cs_inst)
	var skel: Skeleton3D = _find_skeleton(cs_inst)
	var all_cs_meshes: Array[MeshInstance3D] = []
	_collect_meshes(cs_inst, all_cs_meshes)

	for role in ROLE_MESHES.keys():
		var keep: Array = ROLE_MESHES[role]
		var merged := ArrayMesh.new()
		for mi in all_cs_meshes:
			if not (mi.name in keep) or mi.mesh == null:
				continue
			var xform: Transform3D = _compute_mesh_transform(mi, cs_inst, skel)
			_append_mesh_surfaces(merged, mi.mesh, xform, mi.name)
		var save_path := out_dir.path_join("char_" + str(role) + ".tres")
		ResourceSaver.save(merged, save_path)
		print("[BAKE] char_", role, ".tres surfs=", merged.get_surface_count())
	cs_inst.free()

	# 2. Bake DungeonPieces individual props (stripped of tangents/bones for compact text size)
	var dp_scene: PackedScene = load("res://assets/models/DungeonPieces.FBX") as PackedScene
	var dp_inst: Node = dp_scene.instantiate()
	var dp_meshes: Array[MeshInstance3D] = []
	_collect_meshes(dp_inst, dp_meshes)
	var saved_dp: Dictionary = {}
	for mi in dp_meshes:
		if (mi.name in DUNGEON_KEEP) and not saved_dp.has(mi.name) and mi.mesh != null:
			var compact := ArrayMesh.new()
			_append_mesh_surfaces(compact, mi.mesh, Transform3D.IDENTITY, mi.name)
			ResourceSaver.save(compact, out_dir.path_join("prop_" + mi.name + ".tres"))
			saved_dp[mi.name] = true
			print("[BAKE] prop_", mi.name, ".tres")
	dp_inst.free()

	# 3. Bake animated prop static meshes (door_boss, floor_switch, treasure_chest)
	for entry in [
		["res://assets/models/door_boss_ani.FBX", "prop_door_boss.tres"],
		["res://assets/models/floor_switch_ani.FBX", "prop_floor_switch.tres"],
		["res://assets/models/chest_ani.FBX", "prop_treasure_chest.tres"],
	]:
		var ps: PackedScene = load(str(entry[0])) as PackedScene
		var inst: Node = ps.instantiate()
		var ms: Array[MeshInstance3D] = []
		_collect_meshes(inst, ms)
		var out_mesh := ArrayMesh.new()
		for mi in ms:
			if mi.mesh != null:
				_append_mesh_surfaces(out_mesh, mi.mesh, Transform3D.IDENTITY, mi.name)
		ResourceSaver.save(out_mesh, out_dir.path_join(str(entry[1])))
		print("[BAKE] ", entry[1])
		inst.free()

	quit(0)


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var r := _find_skeleton(c)
		if r != null:
			return r
	return null


func _collect_meshes(n: Node, out: Array[MeshInstance3D]) -> void:
	if n is MeshInstance3D:
		out.append(n)
	for c in n.get_children():
		_collect_meshes(c, out)


func _compute_mesh_transform(mi: MeshInstance3D, root_n: Node3D, skel: Skeleton3D) -> Transform3D:
	if mi.skin != null:
		# Skinned mesh vertices in CharacterSet.fbx are in cm except Imp_Torso (already meter)
		var aabb: AABB = mi.mesh.get_aabb()
		if aabb.size.y > 10.0:
			return Transform3D(Basis.from_scale(Vector3(0.01, 0.01, 0.01)), Vector3.ZERO)
		return Transform3D.IDENTITY
	# Walk parent chain including BoneAttachment3D rest pose
	var acc: Transform3D = mi.transform
	var p: Node = mi.get_parent()
	while p != null and p != root_n:
		if p is BoneAttachment3D and skel != null:
			var ba: BoneAttachment3D = p
			var b_idx: int = skel.find_bone(ba.bone_name)
			if b_idx >= 0:
				acc = skel.get_bone_global_pose(b_idx) * acc
		elif p is Node3D:
			var n3: Node3D = p
			acc = n3.transform * acc
		p = p.get_parent()
	return acc


func _append_mesh_surfaces(dst: ArrayMesh, src: Mesh, xform: Transform3D, surf_name: String) -> void:
	var n_basis: Basis = xform.basis.inverse().transposed()
	for s in src.get_surface_count():
		var arrays: Array = src.surface_get_arrays(s)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		if verts.is_empty():
			continue
		var new_verts := PackedVector3Array()
		new_verts.resize(verts.size())
		for i in verts.size():
			new_verts[i] = xform * verts[i]

		var clean: Array = []
		clean.resize(Mesh.ARRAY_MAX)
		clean[Mesh.ARRAY_VERTEX] = new_verts

		if arrays[Mesh.ARRAY_NORMAL] != null:
			var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
			var new_norms := PackedVector3Array()
			new_norms.resize(norms.size())
			for i in norms.size():
				new_norms[i] = (n_basis * norms[i]).normalized()
			clean[Mesh.ARRAY_NORMAL] = new_norms

		if arrays[Mesh.ARRAY_TEX_UV] != null:
			clean[Mesh.ARRAY_TEX_UV] = arrays[Mesh.ARRAY_TEX_UV]
		if arrays[Mesh.ARRAY_INDEX] != null:
			clean[Mesh.ARRAY_INDEX] = arrays[Mesh.ARRAY_INDEX]

		var prim: Mesh.PrimitiveType = src.surface_get_primitive_type(s)
		var idx_before: int = dst.get_surface_count()
		dst.add_surface_from_arrays(prim, clean)
		dst.surface_set_name(idx_before, surf_name)
