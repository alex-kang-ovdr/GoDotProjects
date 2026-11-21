extends CanvasLayer

@onready var status_label: Label = $StatusLabel


func _process(_delta: float) -> void:
	var player := get_parent().get_node_or_null("BP_ThirdPersonCharacter")
	if player == null:
		return
	var pos: Vector3 = player.global_position
	var anim_val: Variant = player.get("anim_state")
	var yaw_val: Variant = player.get("controller_yaw_deg")
	var anim: String = str(anim_val) if anim_val != null else "Unknown"
	var yaw: float = float(yaw_val) if yaw_val != null else 0.0
	status_label.text = "UE->Godot Third Person PoC | Pos: (%.2f, %.2f, %.2f)m | Yaw: %.1f deg | Anim: %s" % [
		pos.x, pos.y, pos.z, yaw, anim
	]
