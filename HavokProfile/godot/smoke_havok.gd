extends SceneTree

func _initialize() -> void:
	var engine_name: String = ProjectSettings.get_setting("physics/3d/physics_engine")
	print("SMOKE_ENGINE=", engine_name)
	print("SMOKE_SERVER_CLASS=", PhysicsServer3D.get_class())
	if ClassDB.class_exists(&"HavokPhysicsStats"):
		print("SMOKE_HAVOK_THREADS=", ClassDB.class_call_static(&"HavokPhysicsStats", &"get_worker_thread_count"))

	var space := PhysicsServer3D.space_create()
	PhysicsServer3D.space_set_active(space, true)

	# Floor box at y = -1.0 (top face at y = 0.0)
	var floor_shape := PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(floor_shape, Vector3(50.0, 1.0, 50.0))
	var floor_body := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(floor_body, PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_add_shape(floor_body, floor_shape)
	PhysicsServer3D.body_set_state(floor_body, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis.IDENTITY, Vector3(0, -1.0, 0)))
	PhysicsServer3D.body_set_space(floor_body, space)

	# Dynamic box at y = 5.0
	var box_shape := PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(box_shape, Vector3(0.5, 0.5, 0.5))
	var box_body := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(box_body, PhysicsServer3D.BODY_MODE_RIGID)
	PhysicsServer3D.body_add_shape(box_body, box_shape)
	PhysicsServer3D.body_set_param(box_body, PhysicsServer3D.BODY_PARAM_MASS, 1.0)
	PhysicsServer3D.body_set_param(box_body, PhysicsServer3D.BODY_PARAM_FRICTION, 0.6)
	PhysicsServer3D.body_set_param(box_body, PhysicsServer3D.BODY_PARAM_BOUNCE, 0.2)
	PhysicsServer3D.body_set_state(box_body, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis.IDENTITY, Vector3(0, 5.0, 0)))
	PhysicsServer3D.body_set_space(box_body, space)

	# Apply explosion impulse
	PhysicsServer3D.body_apply_central_impulse(box_body, Vector3(4.0, 6.0, -3.0))
	PhysicsServer3D.body_apply_torque_impulse(box_body, Vector3(1.5, 0.8, -1.2))

	_space = space
	_box = box_body
	_floor = floor_body
	_box_shape = box_shape
	_floor_shape = floor_shape

var _space: RID
var _box: RID
var _floor: RID
var _box_shape: RID
var _floor_shape: RID
var _ticks := 0

func _physics_process(_delta: float) -> bool:
	_ticks += 1
	if _ticks == 1 or _ticks == 30 or _ticks == 60 or _ticks == 120:
		var xf: Transform3D = PhysicsServer3D.body_get_state(_box, PhysicsServer3D.BODY_STATE_TRANSFORM)
		var lv: Vector3 = PhysicsServer3D.body_get_state(_box, PhysicsServer3D.BODY_STATE_LINEAR_VELOCITY)
		print("TICK=%d pos=(%.4f, %.4f, %.4f) vel=(%.3f, %.3f, %.3f)" % [_ticks, xf.origin.x, xf.origin.y, xf.origin.z, lv.x, lv.y, lv.z])
	if _ticks >= 120:
		if ClassDB.class_exists(&"HavokPhysicsStats"):
			print("SMOKE_STEP_US=", ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_step_us"),
				" COLLIDE_US=", ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_collide_us"),
				" SOLVE_US=", ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_solve_us"),
				" STEPS=", ClassDB.class_call_static(&"HavokPhysicsStats", &"get_step_count"))
		PhysicsServer3D.free_rid(_box)
		PhysicsServer3D.free_rid(_floor)
		PhysicsServer3D.free_rid(_box_shape)
		PhysicsServer3D.free_rid(_floor_shape)
		PhysicsServer3D.free_rid(_space)
		print("SMOKE_OK")
		return true
	return false
