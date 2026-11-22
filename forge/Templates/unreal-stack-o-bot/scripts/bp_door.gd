extends Node3D
## Auto-generated from Unreal Blueprint: /Game/StackOBot/Blueprints/Interactions/BP_Door
## Graph: bp_door (event_graph)

@export var actor_id: String = "door_main"

var _timeline_alpha: float = 0.0
var _timeline_target: float = 0.0
var _timeline_base_pos: Vector3 = Vector3.ZERO
var _timeline_is_open: bool = false

func _ready() -> void:
	UnrealCompat.register_actor(actor_id, self)
	_timeline_base_pos = position

func bpi_on_interact(is_active: bool) -> void:
	if is_active:
		_timeline_target = 1.0
	else:
		_timeline_target = 0.0

func _physics_process(delta: float) -> void:
	var step_amt := delta / 0.5
	_timeline_alpha = move_toward(_timeline_alpha, _timeline_target, step_amt)
	position = _timeline_base_pos + Vector3(0, 3.4, 0) * _timeline_alpha
	if _timeline_alpha >= 0.99 and not _timeline_is_open:
		_timeline_is_open = true
		UnrealCompat.record_event("DoorOpened", {"actor": actor_id})
	elif _timeline_alpha <= 0.01 and _timeline_is_open:
		_timeline_is_open = false
		UnrealCompat.record_event("DoorClosed", {"actor": actor_id})

