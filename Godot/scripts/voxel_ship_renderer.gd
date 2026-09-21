class_name VoxelShipRenderer
extends Node2D

## 2D 물리 선체 위에 올리는 경량 3D 복셀 메시 렌더러.
## 각 함선은 하나의 SubViewport만 사용하며, 파트는 규격 BoxMesh와 아틀라스 텍스처로 구성한다.

const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var viewport: SubViewport
var mesh_root: Node3D
var camera_3d: Camera3D
var surface: Sprite2D
var atlas_texture: Texture2D

func rebuild(model: ShipModel) -> void:
	ensure_nodes()
	for child in mesh_root.get_children():
		child.queue_free()
	var bounds := model.collision_box_rect()
	var visual_center := bounds.get_center() / BalanceData.CELL
	for part in model.parts:
		for occupied_cell in part.cells():
			mesh_root.add_child(make_voxel(part, Vector2(occupied_cell) - visual_center))
	var size_in_cells := maxf(bounds.size.x, bounds.size.y) / BalanceData.CELL
	camera_3d.size = maxf(4.0, size_in_cells + 1.4)
	surface.position = bounds.get_center()
	var world_pixels := camera_3d.size * BalanceData.CELL
	surface.scale = Vector2.ONE * world_pixels / float(viewport.size.y)

func ensure_nodes() -> void:
	if viewport != null:
		return
	atlas_texture = load(VisualData.VOXEL_PART_TEXTURE_ATLAS) as Texture2D
	viewport = SubViewport.new()
	viewport.name = "VoxelPartViewport"
	viewport.size = Vector2i(512, 512)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_2X
	add_child(viewport)
	mesh_root = Node3D.new()
	viewport.add_child(mesh_root)
	camera_3d = Camera3D.new()
	camera_3d.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera_3d.position = Vector3(0.0, 8.0, 0.0)
	camera_3d.rotation_degrees = Vector3(-90.0, 0.0, 0.0)
	mesh_root.add_child(camera_3d)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	light.light_energy = 1.2
	mesh_root.add_child(light)
	surface = Sprite2D.new()
	surface.name = "VoxelPartSurface"
	surface.texture = viewport.get_texture()
	surface.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	surface.z_index = 1
	add_child(surface)

func make_voxel(part: PartData, grid_position: Vector2) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(1.0, 0.28, 1.0)
	mesh_instance.mesh = box
	mesh_instance.position = Vector3(grid_position.x, 0.14, grid_position.y)
	mesh_instance.material_override = voxel_material(part)
	return mesh_instance

func voxel_material(part: PartData) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.roughness = 0.78
	material.metallic = 0.18
	if atlas_texture != null:
		var atlas_region := AtlasTexture.new()
		atlas_region.atlas = atlas_texture
		atlas_region.region = texture_region(part)
		material.albedo_texture = atlas_region
	else:
		material.albedo_color = Color(str(part.spec().fill))
	return material

func texture_region(part: PartData) -> Rect2:
	var tile: Vector2i = VisualData.VOXEL_PART_TEXTURE_TILES.get(part.kind, Vector2i.ZERO)
	var tile_size := Vector2(atlas_texture.get_size()) / Vector2(VisualData.VOXEL_PART_TEXTURE_GRID)
	return Rect2(Vector2(tile) * tile_size, tile_size)
