extends Node3D
## Small native construction-and-driving sandbox. All dimensions are metres.

const WOOD: Material = preload("res://materials/wood.tres")
const METAL: Material = preload("res://materials/metal.tres")
const DRIVE_FORCE := 185.0
const STEER_TORQUE := 90.0

var build_mode := true
var added_blocks: Array[Vector3] = []
var cart: RigidBody3D
var wheel_nodes: Array[MeshInstance3D] = []
var camera: Camera3D
var status_label: Label
var mode_button: Button
var block_counter := 0
var turret: Node3D
var target_remaining := 0
var fire_was_pressed := false
var fire_cooldown := 0.0
var victory_label: Label

func _ready() -> void:
	_ready_input_map()
	$Preview.visible = false
	_build_world()
	_build_ui()
	_rebuild_cart()
	_update_hud()

func _build_world() -> void:
	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = Sky.new()
	environment.sky.sky_material = ProceduralSkyMaterial.new()
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.58, 0.66, 0.76)
	environment.ambient_light_energy = 0.7
	env.environment = environment
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, -28, 0)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	add_child(sun)

	var floor_body := StaticBody3D.new()
	floor_body.name = "Track"
	add_child(floor_body)
	var floor_shape := CollisionShape3D.new()
	var floor_box := BoxShape3D.new()
	floor_box.size = Vector3(28, 0.5, 34)
	floor_shape.shape = floor_box
	floor_shape.position = Vector3(0, -0.25, -3)
	floor_body.add_child(floor_shape)
	var track_physics := PhysicsMaterial.new()
	track_physics.friction = 0.32
	track_physics.bounce = 0.0
	floor_body.physics_material_override = track_physics
	var floor_mesh := MeshInstance3D.new()
	var slab := BoxMesh.new()
	slab.size = floor_box.size
	floor_mesh.mesh = slab
	floor_mesh.position = floor_shape.position
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color(0.19, 0.29, 0.24)
	ground_mat.roughness = 1.0
	floor_mesh.material_override = ground_mat
	floor_body.add_child(floor_mesh)

	# Colored lane strips make the route and the driving objective easy to read.
	for side in [-1.0, 1.0]:
		_add_box(self, Vector3(side * 5.3, 0.012, -3), Vector3(0.15, 0.02, 31), Color(0.83, 0.69, 0.38), false)
	for z in [-1.0, -3.5, -6.0, -8.5, -11.0]:
		_add_box(self, Vector3(0, 0.016, z), Vector3(0.16, 0.02, 1.0), Color(0.83, 0.69, 0.38), false)

	# Low stone hurdle, timber slalom posts, breakable target wall, beacon.
	_add_box(self, Vector3(0, 0.38, -5.5), Vector3(3.6, 0.76, 0.75), Color(0.40, 0.43, 0.43), true)
	_add_box(self, Vector3(-3.25, 0.65, -10), Vector3(0.65, 1.3, 0.65), Color(0.52, 0.31, 0.13), true)
	_add_box(self, Vector3(3.25, 0.65, -10), Vector3(0.65, 1.3, 0.65), Color(0.52, 0.31, 0.13), true)
	_build_targets()
	_add_box(self, Vector3(0, 0.05, -14), Vector3(7.1, 0.1, 0.18), Color(0.25, 0.91, 0.65), false)
	_add_box(self, Vector3(-3.55, 1.35, -14), Vector3(0.18, 2.7, 0.18), Color(0.25, 0.91, 0.65), false)
	_add_box(self, Vector3(3.55, 1.35, -14), Vector3(0.18, 2.7, 0.18), Color(0.25, 0.91, 0.65), false)
	_add_box(self, Vector3(0, 2.7, -14), Vector3(7.1, 0.18, 0.18), Color(0.25, 0.91, 0.65), false)

	camera = Camera3D.new()
	camera.name = "BuildCamera"
	camera.position = Vector3(10, 9, 14)
	camera.current = true
	camera.fov = 53
	add_child(camera)
	camera.look_at(Vector3(0, 0.2, -2), Vector3.UP)

func _add_box(parent: Node, position: Vector3, size: Vector3, color: Color, collidable: bool) -> Node3D:
	var holder: Node3D
	if collidable:
		var body := StaticBody3D.new()
		body.position = position
		parent.add_child(body)
		holder = body
		var shape_node := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		shape_node.shape = shape
		body.add_child(shape_node)
	else:
		holder = Node3D.new()
		holder.position = position
		parent.add_child(holder)
	var mesh_node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_node.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	mesh_node.material_override = material
	holder.add_child(mesh_node)
	return holder

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(20, 20)
	panel.custom_minimum_size = Vector2(355, 0)
	layer.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	panel.add_child(stack)
	var title := Label.new()
	title.text = "IRON WOOD  /  CART WORKSHOP"
	title.add_theme_font_size_override("font_size", 20)
	stack.add_child(title)
	status_label = Label.new()
	status_label.custom_minimum_size.y = 38
	stack.add_child(status_label)
	var buttons := HBoxContainer.new()
	stack.add_child(buttons)
	var add_button := Button.new()
	add_button.text = "+ Add block"
	add_button.pressed.connect(add_block)
	buttons.add_child(add_button)
	var remove_button := Button.new()
	remove_button.text = "− Remove"
	remove_button.pressed.connect(remove_block)
	buttons.add_child(remove_button)
	mode_button = Button.new()
	mode_button.text = "▶ Test cart"
	mode_button.pressed.connect(toggle_simulation)
	buttons.add_child(mode_button)
	var reset_button := Button.new()
	reset_button.text = "↺ Reset"
	reset_button.pressed.connect(reset_build)
	buttons.add_child(reset_button)
	var controls := Label.new()
	controls.text = "BUILD: add/remove blocks  •  TEST: W/S drive, A/D steer, Q/E aim, F fire, B brake\nDestroy all nine targets or drive through the glowing finish gate."
	controls.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(controls)
	victory_label = Label.new()
	victory_label.text = "TARGET CLEARED — press R to rebuild"
	victory_label.add_theme_font_size_override("font_size", 26)
	victory_label.add_theme_color_override("font_color", Color(0.24, 1.0, 0.68))
	victory_label.position = Vector2(410, 120)
	victory_label.visible = false
	layer.add_child(victory_label)

func _build_targets() -> void:
	target_remaining = 9
	for row in range(3):
		for column in range(3):
			var x := (column - 1) * 0.92
			var y := 0.48 + row * 0.94
			var target := RigidBody3D.new()
			target.name = "Target_%d_%d" % [row, column]
			target.position = Vector3(x, y, -12)
			target.mass = 4.0
			target.linear_damp = 0.12
			target.angular_damp = 0.45
			target.add_to_group("targets")
			add_child(target)
			var shape_node := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			shape.size = Vector3(0.88, 0.88, 0.7)
			shape_node.shape = shape
			target.add_child(shape_node)
			var target_mesh := MeshInstance3D.new()
			var block_mesh := BoxMesh.new()
			block_mesh.size = shape.size
			target_mesh.mesh = block_mesh
			var paint := StandardMaterial3D.new()
			paint.albedo_color = Color(0.58, 0.33, 0.16) if (row + column) % 2 == 0 else Color(0.67, 0.4, 0.2)
			paint.roughness = 0.92
			target_mesh.material_override = paint
			target.add_child(target_mesh)

func _reset_targets() -> void:
	for target in get_tree().get_nodes_in_group("targets"):
		target.queue_free()
	_build_targets()
	if is_instance_valid(victory_label):
		victory_label.visible = false

func _rebuild_cart() -> void:
	if is_instance_valid(cart):
		cart.queue_free()
	wheel_nodes.clear()
	cart = RigidBody3D.new()
	cart.name = "WoodCart"
	cart.position = Vector3(0, 0.86, 4)
	cart.mass = 18.0 + added_blocks.size() * 2.0
	cart.linear_damp = 0.18
	cart.angular_damp = 1.8
	var cart_physics := PhysicsMaterial.new()
	cart_physics.friction = 0.42
	cart_physics.bounce = 0.0
	cart.physics_material_override = cart_physics
	cart.continuous_cd = true
	add_child(cart)
	var chassis := CollisionShape3D.new()
	var chassis_shape := BoxShape3D.new()
	chassis_shape.size = Vector3(2.25, 0.42, 1.45)
	chassis.shape = chassis_shape
	cart.add_child(chassis)
	_add_cart_box(Vector3(0, 0, 0), Vector3(2.25, 0.42, 1.45), WOOD)
	_add_cart_box(Vector3(0, 0.42, 0), Vector3(0.18, 0.1, 1.5), METAL)
	for block_position in added_blocks:
		_add_cart_box(block_position, Vector3(0.42, 0.42, 0.42), WOOD)
		var block_shape_node := CollisionShape3D.new()
		var block_shape := BoxShape3D.new()
		block_shape.size = Vector3(0.42, 0.42, 0.42)
		block_shape_node.shape = block_shape
		block_shape_node.position = block_position
		cart.add_child(block_shape_node)
	turret = Node3D.new()
	turret.name = "Turret"
	turret.position = Vector3(0, 0.38, -0.52)
	cart.add_child(turret)
	var barrel := MeshInstance3D.new()
	var barrel_mesh := CylinderMesh.new()
	barrel_mesh.top_radius = 0.12
	barrel_mesh.bottom_radius = 0.17
	barrel_mesh.height = 1.2
	barrel.mesh = barrel_mesh
	barrel.rotation.x = PI / 2.0
	barrel.position = Vector3(0, 0, -0.56)
	barrel.material_override = METAL
	turret.add_child(barrel)
	for x in [-0.78, 0.78]:
		for z in [-0.91, 0.91]:
			var wheel := MeshInstance3D.new()
			var wheel_mesh := CylinderMesh.new()
			wheel_mesh.top_radius = 0.38
			wheel_mesh.bottom_radius = 0.38
			wheel_mesh.height = 0.2
			wheel_mesh.radial_segments = 16
			wheel.mesh = wheel_mesh
			wheel.material_override = METAL
			wheel.position = Vector3(x, -0.24, z)
			wheel.rotation.x = PI / 2.0
			cart.add_child(wheel)
			wheel_nodes.append(wheel)
	var hub_body := MeshInstance3D.new()
	var hub_mesh := BoxMesh.new()
	hub_mesh.size = Vector3(2.0, 0.13, 0.13)
	hub_body.mesh = hub_mesh
	hub_body.material_override = METAL
	hub_body.position = Vector3(0, -0.22, 0)
	cart.add_child(hub_body)

func _add_cart_box(position: Vector3, size: Vector3, material: Material) -> void:
	var mesh_node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_node.mesh = mesh
	mesh_node.position = position
	mesh_node.material_override = material
	cart.add_child(mesh_node)

func add_block() -> void:
	if not build_mode or added_blocks.size() >= 8:
		return
	# Fill a simple rising rack: three blocks per row remain inside the wheelbase.
	var index := added_blocks.size()
	var column := index % 3
	var row := int(index / 3)
	added_blocks.append(Vector3((column - 1) * 0.48, 0.38 + row * 0.46, -0.35))
	_rebuild_cart()
	_update_hud()

func remove_block() -> void:
	if not build_mode or added_blocks.is_empty():
		return
	added_blocks.pop_back()
	_rebuild_cart()
	_update_hud()

func toggle_simulation() -> void:
	if build_mode:
		build_mode = false
		cart.sleeping = false
		mode_button.text = "■ Return to build"
	else:
		build_mode = true
		_rebuild_cart()
		_reset_targets()
		mode_button.text = "▶ Test cart"
	_update_hud()

func reset_build() -> void:
	build_mode = true
	added_blocks.clear()
	_rebuild_cart()
	_reset_targets()
	mode_button.text = "▶ Test cart"
	_update_hud()

func _update_hud() -> void:
	if not is_instance_valid(status_label):
		return
	var mode := "BUILD MODE" if build_mode else "TEST MODE"
	var speed := 0.0
	if is_instance_valid(cart):
		speed = cart.linear_velocity.length() * 3.6
	status_label.text = "%s  •  %d added blocks  •  %d targets  •  %.1f km/h" % [mode, added_blocks.size(), target_remaining, speed]

func set_drive_input(throttle: float, steering: float, braking: bool = false) -> void:
	# Exposed for deterministic local smoke checks and alternate input devices.
	if not is_instance_valid(cart) or build_mode:
		return
	cart.sleeping = false
	var forward := -cart.global_basis.z
	cart.apply_central_force(forward * clampf(throttle, -1.0, 1.0) * DRIVE_FORCE)
	cart.apply_torque(Vector3.UP * clampf(steering, -1.0, 1.0) * STEER_TORQUE)
	if braking:
		cart.apply_central_force(-cart.linear_velocity * 25.0)
		cart.apply_torque(-cart.angular_velocity * 14.0)

func fire_cannon() -> RigidBody3D:
	if build_mode or not is_instance_valid(turret):
		return null
	var shell := RigidBody3D.new()
	shell.name = "Cannonball"
	shell.mass = 0.55
	shell.gravity_scale = 0.75
	shell.continuous_cd = true
	shell.contact_monitor = true
	shell.max_contacts_reported = 4
	var muzzle := turret.global_position + (-turret.global_basis.z) * 0.95 + Vector3.UP * 0.08
	shell.position = muzzle
	var shell_shape_node := CollisionShape3D.new()
	var shell_shape := SphereShape3D.new()
	shell_shape.radius = 0.18
	shell_shape_node.shape = shell_shape
	shell.add_child(shell_shape_node)
	var shell_mesh := MeshInstance3D.new()
	var sphere_mesh := SphereMesh.new()
	sphere_mesh.radius = 0.18
	sphere_mesh.height = 0.36
	shell_mesh.mesh = sphere_mesh
	shell_mesh.material_override = METAL
	shell.add_child(shell_mesh)
	shell.body_entered.connect(_on_shell_hit.bind(shell))
	add_child(shell)
	shell.global_position = muzzle
	shell.linear_velocity = -turret.global_basis.z * 20.0 + cart.linear_velocity
	cart.apply_central_impulse(turret.global_basis.z * 1.6)
	return shell

func _on_shell_hit(body: Node3D, shell: RigidBody3D) -> void:
	if not is_instance_valid(shell):
		return
	if body.is_in_group("targets"):
		body.queue_free()
		target_remaining = maxi(0, target_remaining - 1)
		if target_remaining == 0:
			victory_label.visible = true
	_update_hud()
	shell.queue_free()

func _physics_process(_delta: float) -> void:
	if not build_mode:
		var throttle := Input.get_axis("move_forward", "move_back")
		var steer := Input.get_axis("steer_left", "steer_right")
		set_drive_input(throttle, steer, Input.is_key_pressed(KEY_B))
		turret.rotate_y(Input.get_axis("aim_right", "aim_left") * 0.85 * _delta)
		var fire_pressed := Input.is_key_pressed(KEY_F)
		fire_cooldown = maxf(0.0, fire_cooldown - _delta)
		if fire_pressed and not fire_was_pressed and fire_cooldown <= 0.0:
			fire_cannon()
			fire_cooldown = 0.65
		fire_was_pressed = fire_pressed
		for wheel in wheel_nodes:
			wheel.rotate_object_local(Vector3.FORWARD, cart.linear_velocity.length() * get_physics_process_delta_time() * 1.7)
		camera.position = camera.position.lerp(cart.global_position + Vector3(8, 7, 11), 0.035)
		camera.look_at(cart.global_position + Vector3(0, 0.2, -4), Vector3.UP)
	_update_hud()

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_B and build_mode:
			add_block()
		elif event.keycode == KEY_DELETE and build_mode:
			remove_block()
		elif event.keycode == KEY_R:
			reset_build()

func _ready_input_map() -> void:
	_add_key_action("move_forward", KEY_W)
	_add_key_action("move_back", KEY_S)
	_add_key_action("steer_left", KEY_A)
	_add_key_action("steer_right", KEY_D)
	_add_key_action("aim_left", KEY_Q)
	_add_key_action("aim_right", KEY_E)

func _add_key_action(action: StringName, key: Key) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var input := InputEventKey.new()
	input.physical_keycode = key
	InputMap.action_add_event(action, input)
