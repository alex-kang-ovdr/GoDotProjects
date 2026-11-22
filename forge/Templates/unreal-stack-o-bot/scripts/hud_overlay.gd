extends CanvasLayer

@onready var status_label: Label = $StatusLabel


func _process(_delta: float) -> void:
	var player := get_parent().get_node_or_null("BP_Bot")
	if player == null:
		return
	var pos: Vector3 = player.global_position
	var anim_val: Variant = player.get("anim_state")
	var fuel_val: Variant = player.get("jetpack_fuel")
	var anim: String = str(anim_val) if anim_val != null else "Unknown"
	var fuel: float = float(fuel_val) if fuel_val != null else 0.0
	var compat := get_node_or_null("/root/UnrealCompat")
	var bots: int = int(compat.call("get_spawned_bot_count")) if compat != null else 0
	var orbs: int = int(compat.get("orbs_collected")) if compat != null else 0
	var done: bool = bool(compat.get("level_completed")) if compat != null else false
	status_label.text = "Stack O Bot (UE->Godot) | Pos:(%.1f,%.1f,%.1f)m | Anim:%s | Fuel:%.0f%% | Bots:%d | Orbs:%d | Goal:%s" % [
		pos.x, pos.y, pos.z, anim, fuel * 100.0, bots, orbs, "CLEAR" if done else "..."
	]
