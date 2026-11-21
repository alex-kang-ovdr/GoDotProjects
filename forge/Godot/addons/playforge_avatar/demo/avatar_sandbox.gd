extends Node3D

const AvatarSpawn = preload("res://addons/playforge_avatar/avatar_spawn.gd")
const AvatarController = preload("res://addons/playforge_avatar/avatar_controller.gd")

var _spawn: AvatarSpawn
var _avatar: AvatarController
var _hud_status: Label


func _ready() -> void:
	_build_environment()
	_build_arena()
	_spawn = AvatarSpawn.new()
	_spawn.name = "PlayerSpawn"
	_spawn.position = Vector3(0.0, 0.2, 0.0)
	_spawn.camera_mode = AvatarController.CameraMode.TPS
	_spawn.avatar_spawned.connect(_on_avatar_spawned)
	add_child(_spawn)
	_build_hud()


func _on_avatar_spawned(controller: AvatarController) -> void:
	_avatar = controller
	_avatar.loadout_applied.connect(func(_s): _refresh_hud())
	_avatar.camera_mode_changed.connect(func(_m): _refresh_hud())
	_avatar.locomotion_state_changed.connect(func(_s): _refresh_hud())
	_avatar.ragdoll_entered.connect(func(_b): _refresh_hud())
	_avatar.ragdoll_recovered.connect(func(): _refresh_hud())
	_avatar.emote_started.connect(func(_id, _em): _refresh_hud())
	_avatar.emote_finished.connect(func(_id): _refresh_hud())
	_refresh_hud()


func _build_environment() -> void:
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	light.shadow_enabled = true
	add_child(light)

	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color(0.22, 0.42, 0.72)
	mat.sky_horizon_color = Color(0.68, 0.80, 0.92)
	mat.ground_bottom_color = Color(0.18, 0.22, 0.25)
	sky.sky_material = mat
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.environment = environment
	add_child(env)


func _build_arena() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "ArenaFloor"
	var floor_col := CollisionShape3D.new()
	var floor_box := BoxShape3D.new()
	floor_box.size = Vector3(48.0, 1.0, 48.0)
	floor_col.shape = floor_box
	floor_col.position = Vector3(0.0, -0.5, 0.0)
	floor_body.add_child(floor_col)

	var floor_mesh := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = Vector3(48.0, 1.0, 48.0)
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.24, 0.30, 0.34)
	floor_mat.roughness = 0.85
	box_mesh.material = floor_mat
	floor_mesh.mesh = box_mesh
	floor_mesh.position = Vector3(0.0, -0.5, 0.0)
	floor_body.add_child(floor_mesh)
	add_child(floor_body)

	# Obstacle platforms for jump & TPS camera collision testing
	var platforms := [
		{"pos": Vector3(0.0, 0.6, -6.0), "size": Vector3(4.0, 1.2, 3.0), "color": Color(0.32, 0.56, 0.78)},
		{"pos": Vector3(5.5, 1.2, -5.5), "size": Vector3(3.5, 2.4, 3.5), "color": Color(0.84, 0.52, 0.24)},
		{"pos": Vector3(-5.5, 0.9, -4.5), "size": Vector3(3.0, 1.8, 3.0), "color": Color(0.36, 0.72, 0.48)},
	]
	for i in range(platforms.size()):
		var p: Dictionary = platforms[i]
		var body := StaticBody3D.new()
		body.name = "Platform_%d" % i
		body.position = p.pos
		var col := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = p.size
		col.shape = shape
		body.add_child(col)
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = p.size
		var sm := StandardMaterial3D.new()
		sm.albedo_color = p.color
		bm.material = sm
		mi.mesh = bm
		body.add_child(mi)
		add_child(body)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(14, 14)
	layer.add_child(panel)

	var vbox := VBoxContainer.new()
	panel.add_child(vbox)

	var title := Label.new()
	title.text = "PlayForge Avatar Sandbox (Sealed Runtime)"
	vbox.add_child(title)

	_hud_status = Label.new()
	_hud_status.text = "Loading avatar..."
	vbox.add_child(_hud_status)

	var row1 := HBoxContainer.new()
	vbox.add_child(row1)
	for mode_spec in [
		{"label": "TPS", "mode": AvatarController.CameraMode.TPS},
		{"label": "FPS", "mode": AvatarController.CameraMode.FPS},
		{"label": "TopDown", "mode": AvatarController.CameraMode.TOP_DOWN},
	]:
		var btn := Button.new()
		btn.text = mode_spec.label
		btn.pressed.connect(func():
			if _avatar != null:
				_avatar.set_camera_mode(mode_spec.mode)
		)
		row1.add_child(btn)

	var row2 := HBoxContainer.new()
	vbox.add_child(row2)
	var ragdoll_btn := Button.new()
	ragdoll_btn.text = "Ragdoll (R)"
	ragdoll_btn.pressed.connect(func():
		if _avatar != null:
			if _avatar.is_ragdoll_active():
				_avatar.recover_from_ragdoll()
			else:
				_avatar.trigger_ragdoll(Vector3(0.0, 3.0, -6.0), "chest")
	)
	row2.add_child(ragdoll_btn)

	for slot in range(4):
		var ebtn := Button.new()
		ebtn.text = "Emote %d" % (slot + 1)
		ebtn.pressed.connect(func():
			if _avatar != null:
				_avatar.play_emote_slot(slot)
		)
		row2.add_child(ebtn)


func _refresh_hud() -> void:
	if _hud_status == null or _avatar == null:
		return
	var st := _avatar.get_public_state()
	var rig: Dictionary = st.get("rig", {})
	_hud_status.text = "Mode: %s | State: %s | Skin: %s | Bones: %d | Ragdoll: %s" % [
		str(st.get("cameraMode", "")),
		str(st.get("locomotionState", "")),
		str(rig.get("skinId", "")),
		int(rig.get("boneCount", 0)),
		"ON" if bool(st.get("isRagdoll", false)) else "OFF",
	]
