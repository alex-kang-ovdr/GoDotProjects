extends Node3D
## Deterministic ISMProfile Voxel Explosion Benchmark — Havok Physics vs Jolt Physics
##
## Uses the exact deterministic voxel terrain layouts, cube/atlas shader, ortho camera,
## and MultiMeshInstance3D rendering from Forge-ISM-profile, adding a deterministic
## multi-wave physics explosion (60 Hz fixed step) through Godot's standard PhysicsServer3D API.
##
## Run:
##   Godot --path HavokProfile/godot -- --sizes=24,48,96 --repeats=2 --ticks=300 --seed=1337 --out=<dir> [--shots]

const SUN_YAW_PITCH := Vector2(-30.0, -55.0)
const TICK_SETTLE := 30
const TICK_BLAST_1 := 30
const TICK_BLAST_2 := 150

var opt := {
	"sizes": [24, 48, 96],
	"repeats": 2,
	"ticks": 300,
	"seed": 1337,
	"out": "",
	"shots": false,
	"no_quit": false,
	"sun": 0.9,
	"ambient": 0.0,
	"plane": 0.30,
	"tag": "default",
	"batch_sync": false,
}

var cases: Array = []
var case_index := 0
var cur_case := {}

var world_node: Node3D = null
var cam: Camera3D
var sun: DirectionalLight3D
var env: WorldEnvironment
var box_mesh: BoxMesh
var mat_ism: ShaderMaterial

var mm: MultiMesh = null
var mm_buf := PackedFloat32Array()
var space_rid: RID
var floor_shape_rid: RID
var floor_body_rid: RID
var box_shape_rid: RID
var body_rids: Array[RID] = []
var body_rid_ints := PackedInt64Array()
var body_init_pos := PackedVector3Array()
var block_types := PackedFloat32Array()

var layout_blocks := 0
var layout_hash := 0
var engine_name := ""
var server_class := ""
var has_havok_stats := false
var has_engine_batch := false
var is_headless := false

# Per-case state
var running_case := false
var phys_tick := 0
var last_frame_us := 0
var build_ms := 0.0
var mem_baseline_mb := 0.0
var mem_after_build_mb := 0.0
var mem_peak_mb := 0.0
var static_mem_peak_mb := 0.0
var explosion_spike_ms := 0.0
var state_hash_t60 := 0
var state_hash_t180 := 0
var state_hash_end := 0

var s_frame := PackedFloat64Array()
var s_phys := PackedFloat64Array()
var s_sync := PackedFloat64Array()
var s_hk_step := PackedFloat64Array()
var s_hk_collide := PackedFloat64Array()
var s_hk_solve := PackedFloat64Array()
var s_mem := PackedFloat64Array()

var summary_csv := ""
var ticks_lines := PackedStringArray()
var passed := true
var size_hashes := {} # size -> Array of end hashes across repeats


func _ready() -> void:
	_parse_args()
	is_headless = DisplayServer.get_name() == "headless"
	engine_name = str(ProjectSettings.get_setting("physics/3d/physics_engine"))
	server_class = PhysicsServer3D.get_class()
	has_havok_stats = ClassDB.class_exists(&"HavokPhysicsStats")
	has_engine_batch = ClassDB.class_exists(&"PlayForgePhysicsBatch")

	if not is_headless:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
		Engine.max_fps = 0
		get_window().size = Vector2i(1440, 900)
		get_window().mode = Window.MODE_WINDOWED

	_setup_static_scene()

	if opt.out == "":
		opt.out = ProjectSettings.globalize_path("res://").path_join("../results/%s" % opt.tag)
	DirAccess.make_dir_recursive_absolute(opt.out)

	_build_cases()
	summary_csv = "case,repeat,engine,server_class,seed,size,blocks,layout_hash,ticks,build_ms,frame_mean_ms,frame_p50_ms,frame_p95_ms,frame_p99_ms,frame_max_ms,frame_jitter_p99_p50_ms,phys_mean_ms,phys_p50_ms,phys_p95_ms,phys_p99_ms,phys_max_ms,explosion_spike_ms,sync_p50_ms,hk_step_p50_ms,hk_collide_p50_ms,hk_solve_p50_ms,hitch_frame_gt16,hitch_frame_gt33,hitch_frame_gt50,hitch_phys_gt16,mem_baseline_mb,mem_after_build_mb,mem_peak_mb,mem_after_cleanup_mb,mem_delta_build_mb,mem_delta_peak_mb,static_mem_peak_mb,state_hash_t60,state_hash_t180,state_hash_end\n"
	ticks_lines.clear()
	ticks_lines.append("case,engine,size,repeat,tick,phys_ms,sync_ms,hk_step_ms,hk_collide_ms,hk_solve_ms,mem_private_mb")

	_write_environment()
	await get_tree().process_frame
	_run_suite()


func _parse_args() -> void:
	for a in OS.get_cmdline_user_args():
		if not a.begins_with("--"):
			continue
		var kv := a.substr(2).split("=", true, 1)
		var k := kv[0]
		var v := kv[1] if kv.size() > 1 else "true"
		match k:
			"sizes": opt.sizes = Array(v.split(",")).map(func(s): return int(s))
			"repeats": opt.repeats = int(v)
			"ticks": opt.ticks = int(v)
			"seed": opt.seed = int(v)
			"out": opt.out = v
			"shots": opt.shots = true
			"no-quit": opt.no_quit = true
			"tag": opt.tag = v
			"batch-sync": opt.batch_sync = true


func _ue_to_godot(v: Vector3) -> Vector3:
	return Vector3(v.y, v.z, -v.x)


func _setup_static_scene() -> void:
	cam = Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	cam.near = 0.05
	cam.far = 4000.0
	add_child(cam)
	cam.current = true

	sun = DirectionalLight3D.new()
	sun.light_energy = opt.sun
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 800.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	add_child(sun)
	var pitch := deg_to_rad(SUN_YAW_PITCH.y)
	var yaw := deg_to_rad(SUN_YAW_PITCH.x)
	var fwd_ue := Vector3(cos(pitch) * cos(yaw), cos(pitch) * sin(yaw), sin(pitch))
	var dir := _ue_to_godot(fwd_ue)
	sun.transform = Transform3D(Basis.looking_at(dir, Vector3.UP), Vector3.ZERO)

	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.04, 0.05, 0.07)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(1, 1, 1)
	e.ambient_light_energy = opt.ambient
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	env = WorldEnvironment.new()
	env.environment = e
	add_child(env)

	box_mesh = BoxMesh.new()
	box_mesh.size = Vector3.ONE
	var side := _load_png_texture("res://assets/atlas_side.png")
	var top := _load_png_texture("res://assets/atlas_top.png")
	mat_ism = _make_material(side, top)


func _load_png_texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		var res := load(path)
		if res is Texture2D:
			return res
	var img := Image.load_from_file(ProjectSettings.globalize_path(path))
	if img != null:
		return ImageTexture.create_from_image(img)
	return null


func _make_material(side: Texture2D, top: Texture2D) -> ShaderMaterial:
	var code := """shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
uniform sampler2D atlas_side : source_color, filter_nearest, repeat_disable;
uniform sampler2D atlas_top : source_color, filter_nearest, repeat_disable;
varying flat float v_type;
varying float v_top;
void vertex() {
	v_type = INSTANCE_CUSTOM.r;
	v_top = clamp((MODEL_MATRIX * vec4(NORMAL, 0.0)).y, 0.0, 1.0);
}
void fragment() {
	float sel = clamp(floor(v_type + 0.5), 0.0, 11.0);
	vec2 tile = vec2(mod(sel, 4.0), floor(sel / 4.0));
	vec2 pix = clamp(UV * 16.0, vec2(0.5), vec2(15.5));
	vec2 uv = (tile * 16.0 + pix) / 64.0;
	vec3 base = mix(texture(atlas_side, uv).rgb, texture(atlas_top, uv).rgb, v_top);
	ALBEDO = base;
	EMISSION = base * 0.14;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
"""
	var sh := Shader.new()
	sh.code = code
	var m := ShaderMaterial.new()
	m.shader = sh
	if side:
		m.set_shader_parameter("atlas_side", side)
	if top:
		m.set_shader_parameter("atlas_top", top)
	return m


func _build_cases() -> void:
	cases.clear()
	for size in opt.sizes:
		for r in range(opt.repeats):
			cases.append({"size": size, "repeat": r})


func _private_mem_mb() -> float:
	if has_havok_stats:
		var bytes: int = ClassDB.class_call_static(&"HavokPhysicsStats", &"get_havok_memory_bytes")
		if bytes > 0:
			return float(bytes) / 1048576.0
	return float(OS.get_static_memory_usage()) / 1048576.0


func _load_layout(size: int, seed_v: int) -> PackedByteArray:
	var path := "res://assets/layout_%d_%d.bin" % [size, seed_v]
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("missing layout " + path)
		return PackedByteArray()
	var magic := f.get_32()
	var sz := f.get_32()
	var _sd := f.get_32()
	var count := f.get_32()
	var hash_expected := f.get_32()
	var data := f.get_buffer(count * 4)
	layout_blocks = count
	var h := _ue_hash(data, count)
	layout_hash = h
	if magic != 0x4C4D5349 or sz != size or h != hash_expected:
		push_error("layout file corrupt (hash %d != %d)" % [h, hash_expected])
		return PackedByteArray()
	return data


func _ue_hash(data: PackedByteArray, count: int) -> int:
	var h := 2166136261
	for i in range(count):
		for j in range(4):
			var v := data[i * 4 + j]
			h = ((h ^ v) * 16777619) & 0xFFFFFFFF
			h = ((h ^ 0) * 16777619) & 0xFFFFFFFF
			h = ((h ^ 0) * 16777619) & 0xFFFFFFFF
			h = ((h ^ 0) * 16777619) & 0xFFFFFFFF
	for sh in [0, 8, 16, 24]:
		h = ((h ^ ((count >> sh) & 0xFF)) * 16777619) & 0xFFFFFFFF
	return h


func _clear_physics_world() -> void:
	for rid in body_rids:
		if rid.is_valid():
			PhysicsServer3D.free_rid(rid)
	body_rids.clear()
	if floor_body_rid.is_valid():
		PhysicsServer3D.free_rid(floor_body_rid)
		floor_body_rid = RID()
	if box_shape_rid.is_valid():
		PhysicsServer3D.free_rid(box_shape_rid)
		box_shape_rid = RID()
	if floor_shape_rid.is_valid():
		PhysicsServer3D.free_rid(floor_shape_rid)
		floor_shape_rid = RID()
	if space_rid.is_valid():
		PhysicsServer3D.free_rid(space_rid)
		space_rid = RID()
	if world_node:
		world_node.queue_free()
		world_node = null
	mm = null
	await get_tree().process_frame
	await get_tree().process_frame


func _run_suite() -> void:
	case_index = 0
	while case_index < cases.size():
		cur_case = cases[case_index]
		var ok := await _run_single_case()
		if not ok:
			passed = false
			break
		case_index += 1
	_finish_suite()


func _run_single_case() -> bool:
	await _clear_physics_world()
	await get_tree().physics_frame

	var size: int = cur_case.size
	var data := _load_layout(size, opt.seed)
	if data.is_empty():
		return false

	mem_baseline_mb = _private_mem_mb()
	mem_peak_mb = mem_baseline_mb
	static_mem_peak_mb = OS.get_static_memory_usage() / 1048576.0

	world_node = Node3D.new()
	add_child(world_node)

	# Visual baseplate
	var plate := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(size + 180.0, size + 180.0)
	plate.mesh = pm
	var c := (size - 1) * 0.5
	var floor_y := -2.0
	plate.position = _ue_to_godot(Vector3(c, c, floor_y))
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(opt.plane, opt.plane, opt.plane)
	pmat.roughness = 1.0
	pmat.metallic_specular = 0.0
	plate.material_override = pmat
	world_node.add_child(plate)

	# Camera positioned identically to ISMProfile (slightly wider to capture explosion scatter)
	var centre_ue := Vector3(c, c, 0.0)
	var off_ue := Vector3(-size * 0.65, -size * 0.65, size * 1.15)
	cam.position = _ue_to_godot(centre_ue + off_ue)
	cam.look_at(_ue_to_godot(centre_ue), Vector3.UP)
	cam.size = size * 2.35

	# Prepare MultiMesh
	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = box_mesh
	mm.instance_count = layout_blocks
	mm_buf.resize(layout_blocks * 16)
	body_init_pos.resize(layout_blocks)
	block_types.resize(layout_blocks)

	# Build physics world + all voxel rigid bodies
	var t_build0 := Time.get_ticks_usec()

	space_rid = PhysicsServer3D.space_create()
	PhysicsServer3D.space_set_active(space_rid, true)

	# Static floor collider (top surface at y = floor_y = -2.0)
	floor_shape_rid = PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(floor_shape_rid, Vector3(size + 200.0, 2.0, size + 200.0))
	floor_body_rid = PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(floor_body_rid, PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_add_shape(floor_body_rid, floor_shape_rid)
	PhysicsServer3D.body_set_param(floor_body_rid, PhysicsServer3D.BODY_PARAM_FRICTION, 0.7)
	PhysicsServer3D.body_set_param(floor_body_rid, PhysicsServer3D.BODY_PARAM_BOUNCE, 0.15)
	PhysicsServer3D.body_set_state(
		floor_body_rid,
		PhysicsServer3D.BODY_STATE_TRANSFORM,
		Transform3D(Basis.IDENTITY, _ue_to_godot(Vector3(c, c, floor_y - 2.0)))
	)
	PhysicsServer3D.body_set_space(floor_body_rid, space_rid)

	# Shared 1x1x1m box shape for all voxel blocks
	box_shape_rid = PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(box_shape_rid, Vector3(0.5, 0.5, 0.5))

	body_rids.resize(layout_blocks)
	body_rid_ints.resize(layout_blocks)
	for i in range(layout_blocks):
		var p := _ue_to_godot(Vector3(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))
		var btype := float(data[i * 4 + 3])
		body_init_pos[i] = p
		block_types[i] = btype

		var b := PhysicsServer3D.body_create()
		PhysicsServer3D.body_set_mode(b, PhysicsServer3D.BODY_MODE_RIGID)
		PhysicsServer3D.body_add_shape(b, box_shape_rid)
		PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_MASS, 1.0)
		PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_FRICTION, 0.6)
		PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_BOUNCE, 0.25)
		PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_LINEAR_DAMP, 0.05)
		PhysicsServer3D.body_set_param(b, PhysicsServer3D.BODY_PARAM_ANGULAR_DAMP, 0.05)
		PhysicsServer3D.body_set_state(b, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis.IDENTITY, p))
		PhysicsServer3D.body_set_space(b, space_rid)
		body_rids[i] = b
		body_rid_ints[i] = b.get_id()

		var o := i * 16
		mm_buf[o] = 1.0; mm_buf[o + 1] = 0.0; mm_buf[o + 2] = 0.0; mm_buf[o + 3] = p.x
		mm_buf[o + 4] = 0.0; mm_buf[o + 5] = 1.0; mm_buf[o + 6] = 0.0; mm_buf[o + 7] = p.y
		mm_buf[o + 8] = 0.0; mm_buf[o + 9] = 0.0; mm_buf[o + 10] = 1.0; mm_buf[o + 11] = p.z
		mm_buf[o + 12] = btype

	mm.buffer = mm_buf
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat_ism
	world_node.add_child(mmi)

	build_ms = (Time.get_ticks_usec() - t_build0) / 1000.0
	mem_after_build_mb = _private_mem_mb()
	mem_peak_mb = maxf(mem_peak_mb, mem_after_build_mb)

	# Reset per-case sample buffers
	s_frame.clear()
	s_phys.clear()
	s_sync.clear()
	s_hk_step.clear()
	s_hk_collide.clear()
	s_hk_solve.clear()
	s_mem.clear()
	phys_tick = 0
	explosion_spike_ms = 0.0
	state_hash_t60 = 0
	state_hash_t180 = 0
	state_hash_end = 0

	# Wait 1 frame so first-frame pipeline compilation does not pollute frame metrics
	if not is_headless:
		await RenderingServer.frame_post_draw
	last_frame_us = Time.get_ticks_usec()
	running_case = true

	while running_case:
		await get_tree().process_frame

	await _finish_case()
	return true


func _apply_deterministic_explosion(epicenter: Vector3, radius: float, strength: float, wave_id: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = opt.seed + cur_case.size * 1000 + wave_id * 97
	var r2 := radius * radius
	for i in range(layout_blocks):
		var b := body_rids[i]
		var xf: Transform3D = PhysicsServer3D.body_get_state(b, PhysicsServer3D.BODY_STATE_TRANSFORM)
		var delta := xf.origin - epicenter
		var dist2 := delta.length_squared()
		if dist2 > r2:
			continue
		var dist := sqrt(maxf(dist2, 0.25))
		var falloff := 1.0 - (dist / radius)
		falloff = falloff * falloff
		var dir := delta / dist
		# Radial blast + strong upward lift so voxel plume arcs and rains back down
		var impulse := (dir * 0.78 + Vector3(0.0, 0.65, 0.0)).normalized() * (strength * (0.35 + 0.65 * falloff))
		var torque := Vector3(
			rng.randf_range(-1.0, 1.0),
			rng.randf_range(-1.0, 1.0),
			rng.randf_range(-1.0, 1.0)
		) * (6.0 * (0.25 + 0.75 * falloff))
		PhysicsServer3D.body_apply_central_impulse(b, impulse)
		PhysicsServer3D.body_apply_torque_impulse(b, torque)


func _compute_state_hash() -> int:
	# Deterministic FNV-1a over 1cm-quantized body positions
	var h := 2166136261
	for i in range(layout_blocks):
		var xf: Transform3D = PhysicsServer3D.body_get_state(body_rids[i], PhysicsServer3D.BODY_STATE_TRANSFORM)
		var qx := int(round(xf.origin.x * 100.0))
		var qy := int(round(xf.origin.y * 100.0))
		var qz := int(round(xf.origin.z * 100.0))
		h = ((h ^ (qx & 0xFFFF)) * 16777619) & 0xFFFFFFFF
		h = ((h ^ (qy & 0xFFFF)) * 16777619) & 0xFFFFFFFF
		h = ((h ^ (qz & 0xFFFF)) * 16777619) & 0xFFFFFFFF
	return h


func _sync_multimesh_from_physics() -> float:
	var t0 := Time.get_ticks_usec()
	if opt.batch_sync:
		if engine_name == "HavokPhysics" and has_havok_stats:
			ClassDB.class_call_static(&"HavokPhysicsStats", &"sync_multimesh_from_bodies", mm.get_rid(), body_rid_ints, block_types)
			return (Time.get_ticks_usec() - t0) / 1000.0
		if has_engine_batch:
			ClassDB.class_call_static(&"PlayForgePhysicsBatch", &"sync_multimesh_from_bodies", mm.get_rid(), body_rid_ints, block_types)
			return (Time.get_ticks_usec() - t0) / 1000.0
		if has_havok_stats:
			ClassDB.class_call_static(&"HavokPhysicsStats", &"sync_multimesh_from_bodies", mm.get_rid(), body_rid_ints, block_types)
			return (Time.get_ticks_usec() - t0) / 1000.0
	for i in range(layout_blocks):
		var xf: Transform3D = PhysicsServer3D.body_get_state(body_rids[i], PhysicsServer3D.BODY_STATE_TRANSFORM)
		var b := xf.basis
		var o := i * 16
		mm_buf[o] = b.x.x; mm_buf[o + 1] = b.y.x; mm_buf[o + 2] = b.z.x; mm_buf[o + 3] = xf.origin.x
		mm_buf[o + 4] = b.x.y; mm_buf[o + 5] = b.y.y; mm_buf[o + 6] = b.z.y; mm_buf[o + 7] = xf.origin.y
		mm_buf[o + 8] = b.x.z; mm_buf[o + 9] = b.y.z; mm_buf[o + 10] = b.z.z; mm_buf[o + 11] = xf.origin.z
		mm_buf[o + 12] = block_types[i]
	mm.buffer = mm_buf
	return (Time.get_ticks_usec() - t0) / 1000.0


func _process(_delta: float) -> void:
	if not running_case:
		return
	var now_us := Time.get_ticks_usec()
	var frame_ms := (now_us - last_frame_us) / 1000.0
	last_frame_us = now_us
	s_frame.append(frame_ms)


func _physics_process(_delta: float) -> void:
	if not running_case:
		return

	var size: int = cur_case.size
	var c := (size - 1) * 0.5

	# Trigger deterministic explosions at fixed ticks
	if phys_tick == TICK_BLAST_1:
		var epi := _ue_to_godot(Vector3(c, c, 1.5))
		_apply_deterministic_explosion(epi, size * 0.68, 28.0, 1)
	elif phys_tick == TICK_BLAST_2:
		var off := size * 0.22
		_apply_deterministic_explosion(_ue_to_godot(Vector3(c - off, c - off, 1.0)), size * 0.50, 24.0, 2)
		_apply_deterministic_explosion(_ue_to_godot(Vector3(c + off, c + off, 1.0)), size * 0.50, 24.0, 3)

	var phys_ms := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	var sync_ms := _sync_multimesh_from_physics()
	var hk_step_ms := 0.0
	var hk_collide_ms := 0.0
	var hk_solve_ms := 0.0
	if has_havok_stats and engine_name == "HavokPhysics":
		hk_step_ms = float(ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_step_us")) / 1000.0
		hk_collide_ms = float(ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_collide_us")) / 1000.0
		hk_solve_ms = float(ClassDB.class_call_static(&"HavokPhysicsStats", &"get_last_solve_us")) / 1000.0

	var cur_mem_mb := _private_mem_mb()
	mem_peak_mb = maxf(mem_peak_mb, cur_mem_mb)
	static_mem_peak_mb = maxf(static_mem_peak_mb, OS.get_static_memory_usage() / 1048576.0)

	s_phys.append(phys_ms)
	s_sync.append(sync_ms)
	s_hk_step.append(hk_step_ms)
	s_hk_collide.append(hk_collide_ms)
	s_hk_solve.append(hk_solve_ms)
	s_mem.append(cur_mem_mb)

	if phys_tick >= TICK_BLAST_1 and phys_tick < TICK_BLAST_1 + 10:
		explosion_spike_ms = maxf(explosion_spike_ms, phys_ms)

	ticks_lines.append("%d,%s,%d,%d,%d,%.4f,%.4f,%.4f,%.4f,%.4f,%.3f" % [
		case_index, engine_name, size, cur_case.repeat, phys_tick,
		phys_ms, sync_ms, hk_step_ms, hk_collide_ms, hk_solve_ms, cur_mem_mb
	])

	if opt.shots and not is_headless and cur_case.repeat == 0:
		if phys_tick == 25 or phys_tick == 55 or phys_tick == 220:
			_save_shot(opt.out.path_join("shot-%s-size%d-t%03d.png" % [opt.tag, size, phys_tick]))

	if phys_tick == 60:
		state_hash_t60 = _compute_state_hash()
	elif phys_tick == 180:
		state_hash_t180 = _compute_state_hash()

	phys_tick += 1
	if phys_tick >= opt.ticks:
		state_hash_end = _compute_state_hash()
		running_case = false


func _save_shot(path: String) -> void:
	var img := get_viewport().get_texture().get_image()
	if img != null:
		img.save_png(path)


static func _pct(values: PackedFloat64Array, q: float) -> float:
	if values.is_empty():
		return 0.0
	var v := values.duplicate()
	v.sort()
	return v[clampi(int(ceil(q * v.size())) - 1, 0, v.size() - 1)]


static func _mean(values: PackedFloat64Array) -> float:
	if values.is_empty():
		return 0.0
	var s := 0.0
	for x in values:
		s += x
	return s / float(values.size())


static func _max_v(values: PackedFloat64Array) -> float:
	var m := 0.0
	for x in values:
		if x > m:
			m = x
	return m


static func _count_gt(values: PackedFloat64Array, thresh: float) -> int:
	var c := 0
	for x in values:
		if x > thresh:
			c += 1
	return c


func _finish_case() -> void:
	var size: int = cur_case.size
	await _clear_physics_world()
	await get_tree().physics_frame
	var mem_after_cleanup_mb := _private_mem_mb()

	var f_p50 := _pct(s_frame, 0.50)
	var f_p95 := _pct(s_frame, 0.95)
	var f_p99 := _pct(s_frame, 0.99)
	var f_max := _max_v(s_frame)
	var p_p50 := _pct(s_phys, 0.50)
	var p_p95 := _pct(s_phys, 0.95)
	var p_p99 := _pct(s_phys, 0.99)
	var p_max := _max_v(s_phys)

	var h16 := _count_gt(s_frame, 16.6667)
	var h33 := _count_gt(s_frame, 33.3333)
	var h50 := _count_gt(s_frame, 50.0)
	var hp16 := _count_gt(s_phys, 16.6667)

	summary_csv += "%d,%d,%s,%s,%d,%d,%d,%d,%d,%.3f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%d,%d,%d,%d,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%d,%d,%d\n" % [
		case_index, cur_case.repeat, engine_name, server_class, opt.seed, size, layout_blocks, layout_hash, opt.ticks,
		build_ms,
		_mean(s_frame), f_p50, f_p95, f_p99, f_max, f_p99 - f_p50,
		_mean(s_phys), p_p50, p_p95, p_p99, p_max, explosion_spike_ms,
		_pct(s_sync, 0.50),
		_pct(s_hk_step, 0.50), _pct(s_hk_collide, 0.50), _pct(s_hk_solve, 0.50),
		h16, h33, h50, hp16,
		mem_baseline_mb, mem_after_build_mb, mem_peak_mb, mem_after_cleanup_mb,
		mem_after_build_mb - mem_baseline_mb, mem_peak_mb - mem_baseline_mb, static_mem_peak_mb,
		state_hash_t60, state_hash_t180, state_hash_end
	]

	if not size_hashes.has(size):
		size_hashes[size] = []
	size_hashes[size].append(state_hash_end)

	print("CASE %d/%d [%s] size=%d blocks=%d rep=%d build=%.2fms phys_p50=%.3fms phys_p95=%.3fms phys_max=%.3fms frame_p50=%.3fms frame_p95=%.3fms hitch16=%d mem_delta_peak=%.2fMB hash=%d" % [
		case_index + 1, cases.size(), engine_name, size, layout_blocks, cur_case.repeat,
		build_ms, p_p50, p_p95, p_max, f_p50, f_p95, h16, mem_peak_mb - mem_baseline_mb, state_hash_end
	])


func _write_environment() -> void:
	var hk_threads := 0
	if has_havok_stats and engine_name == "HavokPhysics":
		hk_threads = ClassDB.class_call_static(&"HavokPhysicsStats", &"get_worker_thread_count")
	var env_d := {
		"engine": "Godot " + Engine.get_version_info().string,
		"physics_engine": engine_name,
		"server_class": server_class,
		"batch_sync": opt.batch_sync,
		"has_engine_batch": has_engine_batch,
		"havok_worker_threads": hk_threads,
		"platform": OS.get_name(),
		"cpu": OS.get_processor_name(),
		"cpu_count": OS.get_processor_count(),
		"gpu": RenderingServer.get_video_adapter_name() if not is_headless else "headless",
		"renderer": RenderingServer.get_current_rendering_method(),
		"headless": is_headless,
		"timestamp_utc": Time.get_datetime_string_from_system(true),
		"sizes": opt.sizes,
		"repeats": opt.repeats,
		"ticks": opt.ticks,
		"seed": opt.seed,
		"tag": opt.tag,
	}
	var f := FileAccess.open(opt.out.path_join("environment.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify(env_d, "\t"))
	f.close()


func _finish_suite() -> void:
	var det_ok := true
	var det_summary := {}
	for sz in size_hashes.keys():
		var arr: Array = size_hashes[sz]
		var same := true
		for i in range(1, arr.size()):
			if arr[i] != arr[0]:
				same = false
		det_summary[str(sz)] = {"hashes": arr, "deterministic": same}
		if not same:
			det_ok = false

	var f := FileAccess.open(opt.out.path_join("summary.csv"), FileAccess.WRITE)
	f.store_string(summary_csv)
	f.close()
	f = FileAccess.open(opt.out.path_join("ticks.csv"), FileAccess.WRITE)
	f.store_string("\n".join(ticks_lines) + "\n")
	f.close()
	f = FileAccess.open(opt.out.path_join("result.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"passed": passed,
		"physics_engine": engine_name,
		"server_class": server_class,
		"determinism": det_summary,
		"all_deterministic": det_ok,
		"completed_cases": case_index,
		"expected_cases": cases.size(),
		"output": opt.out,
	}, "\t"))
	f.close()
	print("HAVOK_PROFILE_COMPLETE engine=%s passed=%s deterministic=%s cases=%d out=%s" % [
		engine_name, passed, det_ok, case_index, opt.out
	])
	if not opt.no_quit:
		get_tree().quit(0 if passed else 1)
