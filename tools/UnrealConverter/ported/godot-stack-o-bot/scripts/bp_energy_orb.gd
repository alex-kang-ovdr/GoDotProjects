extends Area3D
## Auto-generated from Unreal Blueprint: /Game/StackOBot/Blueprints/Collectibles/BP_EnergyOrb
## Graph: bp_energy_orb (event_graph)

@export var actor_id: String = "orb_01"

var _overlapping_bodies: Array[Node] = []
var _triggered_once: bool = false

func _ready() -> void:
	UnrealCompat.register_actor(actor_id, self)
	body_entered.connect(_on_body_entered)

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
	if not _triggered_once:
		_triggered_once = true
		visible = false
		UnrealCompat.collect_orb(actor_id)

