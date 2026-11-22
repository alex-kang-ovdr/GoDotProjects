extends Area3D
## Auto-generated from Unreal Blueprint: /Game/StackOBot/Blueprints/Interactions/BP_PressurePlate
## Graph: bp_pressure_plate (event_graph)

signal on_plate_state_changed(is_pressed: bool)

@export var actor_id: String = "plate_01"
@export var target_door_id: String = "door_main"
@export var press_count: int = 0

var _overlapping_bodies: Array[Node] = []
var _triggered_once: bool = false

func _ready() -> void:
	UnrealCompat.register_actor(actor_id, self)
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func get_press_count() -> int:
	return press_count

func _update_plate_visual(pressed: bool) -> void:
	var mi := get_node_or_null("MeshInstance3D") as MeshInstance3D
	if mi == null:
		return
	mi.position.y = -0.05 if pressed else 0.0
	if pressed:
		var active_mat := StandardMaterial3D.new()
		active_mat.albedo_color = Color(0.18, 0.88, 0.42, 1.0)
		active_mat.emission_enabled = true
		active_mat.emission = Color(0.18, 0.95, 0.45, 1.0)
		active_mat.emission_energy_multiplier = 1.6
		mi.material_override = active_mat
	else:
		mi.material_override = null

func _on_body_entered(body: Node) -> void:
	if not body.is_in_group("ue_bot_body"):
		return
	if not _overlapping_bodies.has(body):
		_overlapping_bodies.append(body)
	var is_pressed: bool = _overlapping_bodies.size() > 0
	_update_plate_visual(is_pressed)
	press_count = (press_count + 1)
	on_plate_state_changed.emit(is_pressed)
	UnrealCompat.record_event("Delegate:on_plate_state_changed", {"actor": actor_id, "args": [is_pressed]})
	UnrealCompat.call_interface(UnrealCompat.find_actor(target_door_id), "bpi_on_interact", [is_pressed])

func _on_body_exited(body: Node) -> void:
	_overlapping_bodies.erase(body)
	var is_pressed: bool = _overlapping_bodies.size() > 0
	_update_plate_visual(is_pressed)
	on_plate_state_changed.emit(is_pressed)
	UnrealCompat.record_event("Delegate:on_plate_state_changed", {"actor": actor_id, "args": [is_pressed]})
	UnrealCompat.call_interface(UnrealCompat.find_actor(target_door_id), "bpi_on_interact", [is_pressed])

