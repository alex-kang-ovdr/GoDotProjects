class_name TargetIndicator
extends Node3D

var world: VoxelWorld
var player: VoxelPlayer
var outline: MeshInstance3D
var debug_geometry: MeshInstance3D
var target: Dictionary = {}


func setup(target_world: VoxelWorld, target_player: VoxelPlayer) -> void:
	world = target_world
	player = target_player
	# Sample the camera after CharacterBody3D movement, regardless of tree order.
	process_physics_priority = player.process_physics_priority + 1
	outline = MeshInstance3D.new()
	outline.mesh = _geometry(false)
	add_child(outline)
	debug_geometry = MeshInstance3D.new()
	debug_geometry.mesh = _geometry(true)
	add_child(debug_geometry)
	for part in [outline, debug_geometry]:
		part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	visible = false


func _physics_process(_delta: float) -> void:
	if world == null or player == null: return
	if player.controls_open or world.gameplay_locked():
		target = {}
		visible = false
		return
	target = world.get_target(player.camera.global_position, -player.camera.global_transform.basis.z)
	visible = not target.is_empty()
	if not visible: return
	position = world.map_to_local(target.hit)
	outline.visible = not player.voxel_debug_visible
	debug_geometry.visible = player.voxel_debug_visible


static func _geometry(debug: bool) -> ImmediateMesh:
	var result := ImmediateMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.vertex_color_use_as_albedo = true
	material.no_depth_test = true
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	result.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
	var radius := 0.52 if debug else 0.505
	var color := Color("#42edff") if debug else Color.WHITE
	var width := 0.018 if debug else 0.008
	for axis in 3:
		for a in [-1, 1]:
			for b in [-1, 1]:
				var start := Vector3.ZERO
				start[axis] = -radius
				start[(axis + 1) % 3] = a * radius
				start[(axis + 2) % 3] = b * radius
				var finish := start
				finish[axis] = radius
				_segment(result, start, finish, width, color)
	if debug:
		for axis in 3:
			var end := Vector3.ZERO
			end[axis] = 0.8
			_segment(result, Vector3.ZERO, end, 0.025, [Color("#ff4242"), Color("#55f073"), Color("#518dff")][axis])
	result.surface_end()
	return result


static func _segment(mesh: ImmediateMesh, start: Vector3, finish: Vector3, width: float, color: Color) -> void:
	var axis := (finish - start).normalized()
	var side := axis.cross(Vector3.UP if absf(axis.y) < 0.9 else Vector3.RIGHT).normalized() * width * 0.5
	var up := axis.cross(side).normalized() * width * 0.5
	var corners := [start - side - up, start + side - up, start + side + up, start - side + up,
		finish - side - up, finish + side - up, finish + side + up, finish - side + up]
	mesh.surface_set_color(color)
	for index in [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]:
		mesh.surface_add_vertex(corners[index])
