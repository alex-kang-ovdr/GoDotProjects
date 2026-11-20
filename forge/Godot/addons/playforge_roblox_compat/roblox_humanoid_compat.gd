extends CharacterBody3D

const GRAVITY := 19.6
const JUMP_VELOCITY := 9.2

@export var walk_speed: float = 16.0
@export var health: float = 100.0
var last_state: String = "Running"
var death_count: int = 0
var anchored: bool = false

func _ready() -> void:
	set_meta("roblox_class", "Model")
	set_meta("roblox_name", "PlayerCharacter")

func set_walk_speed(studs_per_sec: float) -> void:
	walk_speed = studs_per_sec

func set_health(new_health: float) -> void:
	health = new_health
	if health <= 0.0:
		death_count += 1
		health = 100.0
		respawn()

func change_state(state_name: String) -> void:
	last_state = state_name

func set_anchored_state(val: bool) -> void:
	anchored = val
	if anchored:
		velocity = Vector3.ZERO

func respawn() -> void:
	var pl := RobloxCompat.get_local_player()
	if pl != null and pl.respawn_location != null:
		var target_cf := RobloxCompat.get_pivot(pl.respawn_location)
		global_position = target_cf.origin + Vector3(0, 1.4, 0)
		velocity = Vector3.ZERO

func _physics_process(delta: float) -> void:
	if anchored:
		return
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	var move_x := Input.get_axis("ui_left", "ui_right")
	var move_z := Input.get_axis("ui_up", "ui_down")
	var speed_m := walk_speed * RobloxCompat.STUD_TO_METER
	velocity.x = move_x * speed_m
	velocity.z = move_z * speed_m
	if is_on_floor() and Input.is_action_just_pressed("ui_accept"):
		velocity.y = JUMP_VELOCITY
	move_and_slide()
