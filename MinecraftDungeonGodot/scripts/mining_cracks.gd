class_name MiningCracks
extends MeshInstance3D

const STAGES := 10
const SEGMENTS := [
	Vector4(-0.42, 0.34, -0.12, 0.18), Vector4(-0.12, 0.18, 0.08, -0.02),
	Vector4(0.08, -0.02, 0.02, -0.24), Vector4(0.02, -0.24, 0.22, -0.44),
	Vector4(-0.12, 0.18, -0.31, -0.02), Vector4(-0.31, -0.02, -0.43, -0.21),
	Vector4(0.08, -0.02, 0.3, 0.1), Vector4(0.3, 0.1, 0.44, 0.33),
	Vector4(0.02, -0.24, -0.2, -0.32), Vector4(-0.12, 0.18, -0.02, 0.43),
]
var player: VoxelPlayer
var world: VoxelWorld
var stage := 0
var stages: Array[ImmediateMesh] = []


func setup(target_world: VoxelWorld, target_player: VoxelPlayer) -> void:
	world = target_world
	player = target_player
	process_priority = player.process_priority + 1
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for level in range(1, STAGES + 1): stages.append(build_stage(level))
	visible = false


func _process(_delta: float) -> void:
	visible = player != null and player.mining_held and player.mining_material >= 0 and player.mining_elapsed > 0 and not player.controls_open and not world.gameplay_locked()
	if visible:
		visible = world.get_cell_item(player.mining_cell) == player.mining_material and player.mining_serial == world.chunk_store.change_serial
	if not visible:
		stage = 0
		return
	position = world.map_to_local(player.mining_cell)
	var next := clampi(1 + floori(player.mining_elapsed / player.mining_duration * STAGES), 1, STAGES)
	if stage != next:
		stage = next
		mesh = stages[stage - 1]


static func build_stage(level: int) -> ImmediateMesh:
	var result := ImmediateMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = Color("#231d15")
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	# Keep depth testing: cracks must never show through a nearer voxel.
	result.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
	for face in 6:
		var center: Vector3 = Vector3(VoxelChunkMesher.DIRECTIONS[face]) * 0.503
		var u: Vector3 = VoxelChunkMesher.U_AXES[face]
		var v: Vector3 = VoxelChunkMesher.V_AXES[face]
		for index in clampi(level, 1, STAGES):
			var line: Vector4 = SEGMENTS[index]
			var start := Vector2(line.x, line.y)
			var finish := Vector2(line.z, line.w)
			var direction := (finish - start).normalized()
			var side := Vector2(-direction.y, direction.x) * (0.003 + level * 0.0006)
			var points := [start - side, finish - side, finish + side, start + side]
			for corner in [0, 2, 1, 0, 3, 2]:
				var point: Vector2 = points[corner]
				result.surface_add_vertex(center + u * point.x + v * point.y)
	result.surface_end()
	return result
