extends "res://addons/playforge_unreal_compat/ue_character_movement.gd"
## Auto-generated from Unreal Blueprint: /Game/StackOBot/Characters/Bot/BP_Bot
## Graph: bp_bot (event_graph)

@export var actor_id: String = "player_bot"
@export var look_sensitivity: float = 0.25
@export var max_inactive_bots: int = 3

var _scripted_move_input: Vector2 = Vector2.ZERO
var _scripted_look_input: Vector2 = Vector2.ZERO
var _scripted_jetpack: bool = false
var _scripted_mode: bool = false

func _ready() -> void:
	super._ready()
	UnrealCompat.register_actor(actor_id, self)
	UnrealCompat.print_string("BP_Bot Ready")
	# [AI-Repair Applied] Replaced UE SpawnNiagaraSystemAtLocation with lightweight Godot GPUParticles3D-compatible spawn marker
	UnrealCompat.record_event("VFXFallbackBurst", {"source": "NiagaraFallback"})

func _on_ia_move(move_input: Vector2) -> void:
	ue_add_movement_input(ue_get_control_forward_vector(), move_input.y)
	ue_add_movement_input(ue_get_control_right_vector(), move_input.x)

func _on_ia_look(look_input: Vector2) -> void:
	ue_add_controller_yaw_input(look_input.x * look_sensitivity)
	ue_add_controller_pitch_input(look_input.y * look_sensitivity)

func _on_ia_jump_started() -> void:
	ue_jump()

func _on_ia_jump_completed() -> void:
	ue_stop_jumping()

func _on_ia_jetpack_started() -> void:
	ue_set_jetpack_active(true)

func _on_ia_jetpack_completed() -> void:
	ue_set_jetpack_active(false)

func _on_ia_spawn_bot() -> void:
	UnrealCompat.spawn_inactive_bot(get_parent(), global_position, max_inactive_bots, self)

func _unhandled_input(event: InputEvent) -> void:
	if _scripted_mode:
		return
	if event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		_on_ia_look(Vector2(event.relative.x, -event.relative.y))
	if event.is_action_pressed("ue_jump"):
		_on_ia_jump_started()
	if event.is_action_released("ue_jump"):
		_on_ia_jump_completed()
	if event.is_action_pressed("ue_jetpack"):
		_on_ia_jetpack_started()
	if event.is_action_released("ue_jetpack"):
		_on_ia_jetpack_completed()
	if event.is_action_pressed("ue_spawn_bot"):
		_on_ia_spawn_bot()

func _physics_process(delta: float) -> void:
	var move_vec := _scripted_move_input
	if not _scripted_mode:
		move_vec = Vector2(
			Input.get_action_strength("ue_move_right_pos") - Input.get_action_strength("ue_move_right_neg"),
			Input.get_action_strength("ue_move_forward_pos") - Input.get_action_strength("ue_move_forward_neg")
		)
	if move_vec.length_squared() > 1e-6:
		_on_ia_move(move_vec)
	if _scripted_mode and _scripted_look_input.length_squared() > 1e-6:
		_on_ia_look(_scripted_look_input)
		_scripted_look_input = Vector2.ZERO
	step_ue_movement(delta)

func set_scripted_inputs(move_vec: Vector2, look_delta: Vector2 = Vector2.ZERO, jump_pressed: bool = false, jetpack_active: bool = false, spawn_bot_pressed: bool = false) -> void:
	_scripted_mode = true
	_scripted_move_input = move_vec
	_scripted_look_input = look_delta
	if jump_pressed:
		_on_ia_jump_started()
	if jetpack_active and not _scripted_jetpack:
		_scripted_jetpack = true
		_on_ia_jetpack_started()
	elif not jetpack_active and _scripted_jetpack:
		_scripted_jetpack = false
		_on_ia_jetpack_completed()
	if spawn_bot_pressed:
		_on_ia_spawn_bot()
