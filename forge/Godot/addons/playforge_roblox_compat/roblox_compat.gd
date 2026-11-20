extends Node

const STUD_TO_METER := 0.28

signal heartbeat(dt: float)
signal player_added(player: Object)

class RobloxValueObject extends Node:
	var value: Variant = ""

class RobloxRandom extends RefCounted:
	var _rng := RandomNumberGenerator.new()

	func _init(seed_val: int = -1) -> void:
		if seed_val >= 0:
			_rng.seed = seed_val
		else:
			_rng.randomize()

	func next_integer(min_val: int, max_val: int) -> int:
		return _rng.randi_range(min_val, max_val)

class RobloxDataStoreStub extends RefCounted:
	var store_name: String
	var _records: Dictionary = {}
	var access_log: Array[Dictionary] = []

	func _init(p_name: String) -> void:
		store_name = p_name
		push_warning("[RobloxCompat][X-Grade Stub] DataStoreService:GetDataStore('%s') mapped to local in-memory stub; external backend required for production." % store_name)

	func get_async(key: String) -> Variant:
		var val: Variant = _records.get(key, null)
		access_log.append({"op": "GetAsync", "key": key, "value": val})
		return val

	func set_async(key: String, val: Variant) -> void:
		_records[key] = val
		access_log.append({"op": "SetAsync", "key": key, "value": val})

class RobloxPlayer extends Node:
	var user_id: int = 1
	var respawn_location: Node = null
	var character: Node3D = null
	signal character_added(character_node: Node3D)

var time_scale: float = 1.0
var _services: Dictionary = {}
var _datastores: Dictionary = {}
var _players: Array = []
var _local_player: RobloxPlayer = null
var _attr_listeners: Dictionary = {}
var _fog_start_studs: float = 100.0
var _fog_end_studs: float = 500.0
var _fog_color: Color = Color8(200, 200, 200)
var _heartbeat_callbacks: Array[Callable] = []
var _diagnostics_log: Array[String] = []

const _CLASS_PARENTS := {
	"SpawnLocation": "Part",
	"Part": "BasePart",
	"MeshPart": "BasePart",
	"BasePart": "PVInstance",
	"Model": "PVInstance",
	"PVInstance": "Instance",
	"Folder": "Instance",
	"Script": "Instance",
	"LocalScript": "Instance",
	"ModuleScript": "Instance",
	"StringValue": "Instance",
	"Humanoid": "Instance",
	"Player": "Instance",
	"ScreenGui": "Instance",
	"TextLabel": "Instance",
	"Workspace": "Instance",
	"Lighting": "Instance",
	"ReplicatedStorage": "Instance",
	"ServerScriptService": "Instance",
	"StarterGui": "Instance"
}

func _ready() -> void:
	set_physics_process(true)

func _physics_process(delta: float) -> void:
	var scaled_dt := delta * time_scale
	heartbeat.emit(scaled_dt)
	for cb in _heartbeat_callbacks:
		if cb.is_valid():
			cb.call(scaled_dt)

# --- Coordinate & Unit Transforms (Roblox LH Y-up studs -> Godot RH Y-up meters) ---

func vec3(x: float, y: float, z: float) -> Vector3:
	return Vector3(x * STUD_TO_METER, y * STUD_TO_METER, -z * STUD_TO_METER)

func roblox_angular_vel_to_godot(rx: float, ry: float, rz: float) -> Vector3:
	# Axial vector (pseudovector) under mirror M = diag(1, 1, -1): det(M) = -1 -> (-rx, -ry, rz)
	return Vector3(-rx, -ry, rz)

func cframe_new(x: float, y: float, z: float) -> Transform3D:
	return Transform3D(Basis.IDENTITY, vec3(x, y, z))

func cframe_angles(rx: float, ry: float, rz: float) -> Transform3D:
	# Roblox CFrame.Angles applies Rx * Ry * Rz in LH; convert via M * R * M^-1
	var bx := Basis(Vector3.RIGHT, -rx)
	var by := Basis(Vector3.UP, -ry)
	var bz := Basis(Vector3.BACK, rz)
	return Transform3D(bx * by * bz, Vector3.ZERO)

func cframe_add_vec3(cf: Transform3D, offset_godot: Vector3) -> Transform3D:
	return Transform3D(cf.basis, cf.origin + offset_godot)

func vector_to_world_space(cf: Transform3D, local_v: Vector3) -> Vector3:
	return cf.basis * local_v

# --- Scene & Service Registry ---

func bind_place_root(place_root: Node) -> void:
	_services.clear()
	_heartbeat_callbacks.clear()
	for child in place_root.get_children():
		var rbx_class := get_roblox_class(child)
		var rbx_name := get_roblox_name(child)
		if rbx_class != "":
			_services[rbx_class] = child
		if rbx_name != "":
			_services[rbx_name] = child
	if not _services.has("Players"):
		var players_node := Node.new()
		players_node.name = "Players"
		players_node.set_meta("roblox_class", "Players")
		players_node.set_meta("roblox_name", "Players")
		place_root.add_child(players_node)
		_services["Players"] = players_node
	if _local_player == null or not is_instance_valid(_local_player):
		_local_player = RobloxPlayer.new()
		_local_player.name = "LocalPlayer"
		_local_player.user_id = 1001
		_local_player.set_meta("roblox_class", "Player")
		_local_player.set_meta("roblox_name", "Player1")
		_services["Players"].add_child(_local_player)
		_players = [_local_player]

func register_player_character(char_node: Node3D) -> RobloxPlayer:
	if _local_player == null:
		return null
	_local_player.character = char_node
	_local_player.character_added.emit(char_node)
	return _local_player

func notify_initial_players() -> void:
	for p in _players:
		player_added.emit(p)
		if p.character != null:
			p.character_added.emit(p.character)

func get_service(service_name: String) -> Variant:
	if service_name == "DataStoreService":
		return self
	if service_name == "RunService":
		return self
	if service_name == "Players":
		return _services.get("Players", self)
	return _services.get(service_name, null)

func get_workspace() -> Node:
	return _services.get("Workspace", null)

func get_local_player() -> RobloxPlayer:
	return _local_player

func get_players() -> Array:
	return _players.duplicate()

func get_player_from_character(character: Node) -> RobloxPlayer:
	if character == null:
		return null
	for p in _players:
		if p.character == character:
			return p
	return null

func players_on_added(cb: Callable) -> void:
	player_added.connect(cb)

# --- Instance Hierarchy & Metadata ---

func get_roblox_name(node: Node) -> String:
	if node == null:
		return ""
	if node.has_meta("roblox_name"):
		return str(node.get_meta("roblox_name"))
	return String(node.name)

func get_roblox_class(node: Node) -> String:
	if node == null:
		return ""
	if node.has_meta("roblox_class"):
		return str(node.get_meta("roblox_class"))
	return node.get_class()

func is_internal_helper(node: Node) -> bool:
	return node != null and node.has_meta("roblox_internal") and bool(node.get_meta("roblox_internal"))

func is_a(node: Variant, target_class: String) -> bool:
	if not (node is Node):
		return false
	var cur := get_roblox_class(node)
	var guard := 0
	while cur != "" and guard < 16:
		if cur == target_class:
			return true
		cur = _CLASS_PARENTS.get(cur, "")
		guard += 1
	return false

func get_rbx_children(parent: Node) -> Array[Node]:
	var out: Array[Node] = []
	if parent == null:
		return out
	for child in parent.get_children():
		if not is_internal_helper(child):
			out.append(child)
	return out

func get_descendants(parent: Node) -> Array[Node]:
	var out: Array[Node] = []
	if parent == null:
		return out
	for child in get_rbx_children(parent):
		out.append(child)
		out.append_array(get_descendants(child))
	return out

func find_first_child(parent: Node, target_name: String) -> Node:
	if parent == null:
		return null
	for child in get_rbx_children(parent):
		if get_roblox_name(child) == target_name or String(child.name) == target_name:
			return child
	return null

func wait_for_child(parent: Node, target_name: String) -> Node:
	var found := find_first_child(parent, target_name)
	if found != null:
		return found
	_diagnostics_log.append("WaitForChild('%s') missing under '%s'" % [target_name, get_roblox_name(parent)])
	return null

func find_first_child_of_class(parent: Node, cls: String, recursive: bool = false) -> Node:
	if parent == null:
		return null
	var pool := get_descendants(parent) if recursive else get_rbx_children(parent)
	for child in pool:
		if is_a(child, cls):
			return child
	return null

func find_first_ancestor_of_class(node: Node, cls: String) -> Node:
	var cur := node.get_parent() if node != null else null
	while cur != null:
		if is_a(cur, cls):
			return cur
		cur = cur.get_parent()
	return null

func instance_new(cls: String) -> Node:
	var node: Node
	if cls == "StringValue":
		node = RobloxValueObject.new()
	else:
		node = Node.new()
	node.set_meta("roblox_class", cls)
	node.set_meta("roblox_name", cls)
	return node

func set_parent(node: Node, new_parent: Node) -> void:
	if node == null or new_parent == null:
		return
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	new_parent.add_child(node)

# --- Attributes & AttributeChangedSignal ---

func get_attribute(target: Node, attr_name: String) -> Variant:
	if target == null:
		return null
	var meta_key := "rbx_attr_" + attr_name
	return target.get_meta(meta_key) if target.has_meta(meta_key) else null

func set_attribute(target: Node, attr_name: String, val: Variant) -> void:
	if target == null:
		return
	var meta_key := "rbx_attr_" + attr_name
	var prev: Variant = target.get_meta(meta_key) if target.has_meta(meta_key) else null
	target.set_meta(meta_key, val)
	if prev != val:
		var key := "%d:%s" % [target.get_instance_id(), attr_name]
		var listeners: Array = _attr_listeners.get(key, [])
		for cb in listeners:
			if cb is Callable and cb.is_valid():
				cb.call()

func connect_attribute_changed(target: Node, attr_name: String, cb: Callable) -> void:
	if target == null:
		return
	var key := "%d:%s" % [target.get_instance_id(), attr_name]
	if not _attr_listeners.has(key):
		_attr_listeners[key] = []
	_attr_listeners[key].append(cb)

# --- BasePart / PVInstance Adapters ---

func get_cframe(node: Node) -> Transform3D:
	if node is Node3D:
		return node.global_transform if node.is_inside_tree() else node.transform
	return Transform3D.IDENTITY

func set_cframe(node: Node, cf: Transform3D) -> void:
	if node is Node3D:
		if node.is_inside_tree():
			node.global_transform = cf
		else:
			node.transform = cf

func get_pivot(node: Node) -> Transform3D:
	if node == null:
		return Transform3D.IDENTITY
	if is_a(node, "Model"):
		var spawn := find_first_child_of_class(node, "SpawnLocation", true)
		if spawn is Node3D:
			return get_cframe(spawn)
		var first_part := find_first_child_of_class(node, "BasePart", true)
		if first_part is Node3D:
			return get_cframe(first_part)
	return get_cframe(node)

func pivot_to(node: Node, cf: Transform3D) -> void:
	if node is CharacterBody3D:
		node.global_transform = Transform3D(node.global_transform.basis, cf.origin)
		node.velocity = Vector3.ZERO
	elif node is Node3D:
		set_cframe(node, cf)

func set_angular_velocity(node: Node, ang_vel: Vector3) -> void:
	if node != null:
		node.set_meta("roblox_angular_velocity", ang_vel)

func set_linear_velocity(node: Node, lin_vel: Vector3) -> void:
	if node is CharacterBody3D:
		node.velocity = lin_vel
	elif node != null:
		node.set_meta("roblox_linear_velocity", lin_vel)

func set_anchored(node: Node, anchored: bool) -> void:
	if node == null:
		return
	node.set_meta("roblox_anchored", anchored)
	if node.has_method("set_anchored_state"):
		node.call("set_anchored_state", anchored)

func set_can_collide(node: Node, enabled: bool) -> void:
	if node == null:
		return
	node.set_meta("roblox_can_collide", enabled)
	for child in node.get_children():
		if child is CollisionShape3D:
			child.set_deferred("disabled", not enabled)

func set_transparency(node: Node, alpha_transparency: float) -> void:
	if node == null:
		return
	var clamped := clampf(alpha_transparency, 0.0, 1.0)
	node.set_meta("roblox_transparency", clamped)
	for child in node.get_children():
		if child is MeshInstance3D:
			child.visible = clamped < 0.99
			var mat: Material = child.get_active_material(0)
			if mat is StandardMaterial3D:
				var std := mat as StandardMaterial3D
				if clamped > 0.01:
					std.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				else:
					std.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
				std.albedo_color.a = 1.0 - clamped

func connect_touched(part: Node, cb: Callable) -> void:
	if part == null:
		return
	var area := part.get_node_or_null("_TouchArea") as Area3D
	if area != null:
		area.body_entered.connect(func(body: Node3D) -> void:
			var hit_part := find_first_child(body, "HumanoidRootPart")
			cb.call(hit_part if hit_part != null else body)
		)
	if not part.has_meta("roblox_touched_callbacks"):
		part.set_meta("roblox_touched_callbacks", [])
	part.get_meta("roblox_touched_callbacks").append(cb)

func simulate_touch(part: Node, other_part: Node) -> void:
	if part == null or not part.has_meta("roblox_touched_callbacks"):
		return
	for cb in part.get_meta("roblox_touched_callbacks"):
		if cb is Callable and cb.is_valid():
			cb.call(other_part)

func connect_heartbeat(cb: Callable) -> void:
	_heartbeat_callbacks.append(cb)

func connect_child_added(parent: Node, cb: Callable) -> void:
	if parent != null:
		parent.child_entered_tree.connect(func(child: Node) -> void:
			if not is_internal_helper(child):
				cb.call(child)
		)

func connect_descendant_added(parent: Node, cb: Callable) -> void:
	connect_child_added(parent, cb)

# --- Lighting Fog Adapter ---

func set_lighting_fog(fog_start: float = -1.0, fog_end: float = -1.0, fog_color: Variant = null) -> void:
	if fog_start >= 0.0:
		_fog_start_studs = fog_start
	if fog_end >= 0.0:
		_fog_end_studs = fog_end
	if fog_color is Color:
		_fog_color = fog_color
	var ws := get_workspace()
	if ws == null:
		return
	var env_node := ws.get_parent().get_node_or_null("WorldEnvironment") as WorldEnvironment
	if env_node != null and env_node.environment != null:
		var env := env_node.environment
		env.fog_enabled = true
		env.fog_mode = Environment.FOG_MODE_DEPTH
		var is_dark := _fog_end_studs <= 40.0
		env.fog_depth_begin = 8.0 if is_dark else _fog_start_studs * STUD_TO_METER
		env.fog_depth_end = 34.0 if is_dark else _fog_end_studs * STUD_TO_METER
		env.fog_light_color = _fog_color
		env.fog_density = 0.82 if is_dark else 0.15
		env.fog_sky_affect = 0.92 if is_dark else 0.2

func get_lighting_state() -> Dictionary:
	return {
		"fog_start": _fog_start_studs,
		"fog_end": _fog_end_studs,
		"fog_color": _fog_color
	}

# --- External Service Stub (X-Grade: DataStoreService) ---

func get_datastore_stub(store_name: String) -> RobloxDataStoreStub:
	if not _datastores.has(store_name):
		_datastores[store_name] = RobloxDataStoreStub.new(store_name)
	return _datastores[store_name]

# --- Task / Random / String Helpers ---

func task_wait(seconds: float) -> void:
	var wait_s := maxf(0.001, seconds / maxf(0.01, time_scale))
	await get_tree().create_timer(wait_s).timeout

func task_spawn(cb: Callable) -> void:
	cb.call_deferred()

func random_new(seed_val: int = -1) -> RobloxRandom:
	return RobloxRandom.new(seed_val)

func string_format(fmt: String, args: Array) -> String:
	return fmt % args
