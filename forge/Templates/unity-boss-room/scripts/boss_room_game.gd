extends Node3D
const DungeonBuilder = preload("res://scripts/dungeon_builder.gd")
const HeroUnit = preload("res://scripts/hero_unit.gd")
const EnemyUnit = preload("res://scripts/enemy_unit.gd")
## Main Boss Room 3D Co-op RPG Scene Controller (Godot 4.7.2 Port of Unity Boss Room).
## Flow:
##   Phase 1 (ENTRANCE): Heroes stand on Floor Switch -> opens Boss Door -> enter Boss Arena
##   Phase 2 (BOSS_FIGHT): 4-Hero Party vs Imp Boss + Imp Minions (Server-Authoritative ActionBus)
##   Phase 3 (VICTORY): Boss defeated -> Treasure Chest opens -> PostGame Party Summary

enum GamePhase { ENTRANCE, BOSS_FIGHT, VICTORY, DEFEAT }

const AUDIO_DIR := "res://assets/audio/"

var phase: GamePhase = GamePhase.ENTRANCE
var dungeon: DungeonBuilder = null
var camera: Camera3D = null
var heroes: Array[HeroUnit] = []
var enemies: Array[EnemyUnit] = []
var boss: EnemyUnit = null
var active_hero_index: int = 0
var switch_activated: bool = false
var boss_door_open: bool = false
var chest_opened: bool = false
var elapsed_time: float = 0.0

var projectiles: Array[Dictionary] = []
var vfx_nodes: Array[Dictionary] = []
var sfx_players: Dictionary = {}
var camera_target_pos: Vector3 = Vector3(0.0, 0.0, 22.0)
var camera_offset: Vector3 = Vector3(0.0, 17.5, 19.5)
var camera_look_offset: Vector3 = Vector3(0.0, 1.4, -2.5)
var camera_override: bool = false

# HUD Controls
var hud_layer: CanvasLayer = null
var boss_panel: PanelContainer = null
var boss_hp_bar: ProgressBar = null
var boss_state_label: Label = null
var objective_label: Label = null
var netcode_badge: Label = null
var skill_bar_label: Label = null
var party_cards: Array[Dictionary] = []
var victory_panel: PanelContainer = null
var victory_stats_label: Label = null


func _ready() -> void:
	ActionBus.reset_session()
	ActionBus.action_executed.connect(_on_action_executed)

	_setup_lighting_and_env()
	_setup_audio()

	dungeon = DungeonBuilder.new()
	dungeon.name = "Dungeon"
	add_child(dungeon)
	dungeon.build_dungeon()

	_setup_camera()
	_spawn_party_at_entrance()
	_spawn_boss_and_imps()
	_build_hud()
	_select_hero(0)


func _setup_lighting_and_env() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.035, 0.04, 0.075)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.24, 0.3, 0.5)
	env.ambient_light_energy = 0.44
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.96
	env.glow_enabled = true
	env.glow_intensity = 0.32
	env.glow_strength = 0.65
	env.glow_bloom = 0.09
	env.glow_hdr_threshold = 1.35

	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	# Cool moonlight-blue dungeon directional rim light matching Unity Boss Room contrast
	var key_light := DirectionalLight3D.new()
	key_light.name = "DungeonKeyLight"
	key_light.rotation_degrees = Vector3(-52.0, -32.0, 0.0)
	key_light.light_color = Color(0.7, 0.8, 1.0)
	key_light.light_energy = 0.82
	key_light.shadow_enabled = true
	key_light.shadow_bias = 0.04
	add_child(key_light)

	# Subtle warm dramatic Boss Arena center fill
	var arena_fill := OmniLight3D.new()
	arena_fill.name = "ArenaCenterFill"
	arena_fill.position = Vector3(0.0, 11.5, -2.0)
	arena_fill.light_color = Color(1.0, 0.65, 0.45)
	arena_fill.light_energy = 1.15
	arena_fill.omni_range = 32.0
	add_child(arena_fill)


func _setup_audio() -> void:
	var clips := {
		"archer_shot": "archer_attk_a.tres",
		"power_shot": "archer_powershot.tres",
		"charge_start": "charge_attack_start.tres",
		"charge_end": "charge_attack_end.tres",
		"defeat": "defeat_a.tres",
	}
	for key in clips.keys():
		var p := AudioStreamPlayer.new()
		p.name = "SFX_" + str(key)
		var stream: AudioStream = load(AUDIO_DIR + str(clips[key])) as AudioStream
		p.stream = stream
		p.volume_db = -8.0
		add_child(p)
		sfx_players[key] = p


func _play_sfx(key: String) -> void:
	if sfx_players.has(key):
		var p: AudioStreamPlayer = sfx_players[key] as AudioStreamPlayer
		if p != null and p.stream != null:
			p.play()


func _setup_camera() -> void:
	camera = Camera3D.new()
	camera.name = "MainCamera"
	camera.fov = 44.0
	camera.near = 0.2
	camera.far = 160.0
	add_child(camera)
	camera.position = camera_target_pos + camera_offset
	camera.look_at(camera_target_pos + camera_look_offset, Vector3.UP)
	camera.make_current()


func _spawn_party_at_entrance() -> void:
	var starts: Array[Array] = [
		["tank", Vector3(-1.8, 0.0, 29.2)],
		["archer", Vector3(2.2, 0.0, 30.2)],
		["mage", Vector3(-3.0, 0.0, 31.2)],
		["rogue", Vector3(3.2, 0.0, 28.6)],
	]
	for entry in starts:
		var h := HeroUnit.new()
		add_child(h)
		h.setup(str(entry[0]), entry[1] as Vector3)
		heroes.append(h)


func _spawn_boss_and_imps() -> void:
	boss = EnemyUnit.new()
	add_child(boss)
	boss.setup(true, Vector3(0.0, 0.0, -6.0), 0)
	boss.died.connect(_on_boss_died)
	boss.stunned_by_shield.connect(_on_boss_stunned)
	boss.telegraph_triggered.connect(_on_boss_telegraph)
	enemies.append(boss)

	var imp_positions: Array[Vector3] = [
		Vector3(-8.5, 0.0, -3.0),
		Vector3(8.5, 0.0, -2.5),
	]
	for i in imp_positions.size():
		var imp := EnemyUnit.new()
		add_child(imp)
		imp.setup(false, imp_positions[i], i + 1)
		enemies.append(imp)


func _select_hero(index: int) -> void:
	active_hero_index = clampi(index, 0, heroes.size() - 1)
	for i in heroes.size():
		heroes[i].set_controlled(i == active_hero_index)
	_update_skill_bar()


func get_active_hero() -> HeroUnit:
	return heroes[active_hero_index]


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var kev: InputEventKey = event
		match kev.keycode:
			KEY_1:
				_select_hero(0)
			KEY_2:
				_select_hero(1)
			KEY_3:
				_select_hero(2)
			KEY_4:
				_select_hero(3)
			KEY_SPACE:
				trigger_hero_basic_attack(get_active_hero())
			KEY_Q:
				trigger_hero_skill_q(get_active_hero())
			KEY_E:
				trigger_hero_skill_e(get_active_hero())
			KEY_R:
				trigger_revive_nearest(get_active_hero())


func _process(delta: float) -> void:
	elapsed_time += delta
	_step_vfx(delta)
	_step_projectiles(delta)

	var active := get_active_hero()
	var input_vec := Vector3.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		input_vec.z -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		input_vec.z += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		input_vec.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		input_vec.x += 1.0

	var bounds := Rect2(-14.5, -14.5, 29.0, 48.0) if boss_door_open else Rect2(-7.0, 19.0, 14.0, 15.0)
	if phase == GamePhase.BOSS_FIGHT or phase == GamePhase.VICTORY:
		bounds = Rect2(-14.5, -14.5, 29.0, 30.0)

	# Step active hero + cooperative AI party
	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		if i == active_hero_index:
			h.step_hero(delta, input_vec, bounds)
		else:
			var ai_move := _compute_party_ai(h, delta)
			h.step_hero(delta, ai_move, bounds)

	# Phase 1: Floor Switch puzzle check
	if phase == GamePhase.ENTRANCE:
		if not switch_activated:
			for h in heroes:
				if h.position.distance_to(Vector3(0.0, 0.0, 25.0)) <= 2.6:
					activate_floor_switch()
					break
		elif boss_door_open:
			for h in heroes:
				if h.position.z < 14.5:
					enter_boss_arena()
					break

	# Phase 2: Boss & Imp combat
	if phase == GamePhase.BOSS_FIGHT:
		for e in enemies:
			if not e.is_dead:
				e.step_enemy(delta, heroes, Rect2(-14.2, -14.0, 28.4, 28.5), _on_boss_aoe_burst)
		var all_down := true
		for h in heroes:
			if not h.is_downed:
				all_down = false
				break
		if all_down:
			phase = GamePhase.DEFEAT
			_play_sfx("defeat")

	# Smooth camera follow
	if not camera_override and camera != null:
		var desired_focus: Vector3 = active.position
		if phase == GamePhase.BOSS_FIGHT and boss != null and not boss.is_dead:
			desired_focus = active.position.lerp(boss.position, 0.42)
		camera_target_pos = camera_target_pos.lerp(desired_focus, minf(1.0, delta * 5.0))
		camera.position = camera_target_pos + camera_offset
		camera.look_at(camera_target_pos + camera_look_offset, Vector3.UP)

	_update_hud()


func activate_floor_switch() -> void:
	if switch_activated:
		return
	switch_activated = true
	boss_door_open = true
	dungeon.set_switch_pressed(true)
	dungeon.open_boss_door()
	ActionBus.request_action("Party", "FloorSwitchOpenDoor", {"origin": Vector3(0, 0, 25)})
	_spawn_ring_vfx(Vector3(0.0, 0.25, 25.0), 3.4, Color(0.25, 1.0, 0.55), 0.7)
	_play_sfx("charge_end")


func enter_boss_arena() -> void:
	if phase == GamePhase.BOSS_FIGHT:
		return
	phase = GamePhase.BOSS_FIGHT
	# Rally party inside arena if any member is still in corridor
	var rally_offsets: Array[Vector3] = [
		Vector3(-2.5, 0.0, 9.5), Vector3(3.5, 0.0, 10.5),
		Vector3(-4.5, 0.0, 11.2), Vector3(1.8, 0.0, 8.8),
	]
	for i in heroes.size():
		if heroes[i].position.z > 14.0:
			heroes[i].position = rally_offsets[i]
	boss_panel.visible = true
	ActionBus.sync_world_state({"phase": "BOSS_FIGHT", "boss_hp": boss.hp})


func _compute_party_ai(h: HeroUnit, delta: float) -> Vector3:
	if h.is_downed:
		return Vector3.ZERO
	h.ai_think_timer = maxf(0.0, h.ai_think_timer - delta)

	if phase == GamePhase.ENTRANCE:
		var leader := get_active_hero()
		var idx := heroes.find(h)
		var slot := leader.position + Vector3((float(idx) - 1.5) * 2.2, 0.0, 1.8)
		var diff := slot - h.position
		return diff.normalized() if diff.length() > 1.4 else Vector3.ZERO

	if phase == GamePhase.VICTORY:
		var chest_spot := Vector3((float(heroes.find(h)) - 1.5) * 2.6, 0.0, -8.5)
		var diff := chest_spot - h.position
		return diff.normalized() if diff.length() > 0.7 else Vector3.ZERO

	# Boss Fight Co-op AI: revive downed allies, Mage heals low HP allies, Tank blocks Trample!
	for ally in heroes:
		if ally.is_downed and h != ally:
			var d_ally := h.position.distance_to(ally.position)
			if d_ally > 2.0:
				return (ally.position - h.position).normalized()
			else:
				trigger_revive_nearest(h)
				return Vector3.ZERO

	var target: EnemyUnit = _find_nearest_enemy(h.position)
	if target == null:
		return Vector3.ZERO

	var dist := h.position.distance_to(target.position)
	var desired_range := h.attack_range * 0.85

	if h.ai_think_timer <= 0.0:
		h.ai_think_timer = 0.35
		if h.hero_class == "tank" and boss != null and boss.pattern == EnemyUnit.BossPattern.TRAMPLE_WINDUP:
			trigger_hero_skill_q(h)
		elif h.hero_class == "mage":
			var needs_heal := false
			for ally in heroes:
				if not ally.is_downed and ally.hp < ally.max_hp * 0.78:
					needs_heal = true
					break
			if needs_heal:
				trigger_hero_skill_q(h)
			elif dist <= h.attack_range:
				trigger_hero_basic_attack(h)
		elif dist <= h.attack_range:
			if not ActionBus.is_on_cooldown(h.name, "skill_q"):
				trigger_hero_skill_q(h)
			else:
				trigger_hero_basic_attack(h)

	if dist > desired_range:
		return (target.position - h.position).normalized()
	elif dist < desired_range * 0.45 and (h.hero_class == "archer" or h.hero_class == "mage"):
		return (h.position - target.position).normalized()
	return Vector3.ZERO


func trigger_hero_basic_attack(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else (h.position + Vector3(0.0, 0.0, -5.0))
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"basic_attack",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["attack_cd"]),
		h.attack_range + 4.0
	)


func trigger_hero_skill_q(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else h.position
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"skill_q",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["q_cd"])
	)


func trigger_hero_skill_e(h: HeroUnit) -> bool:
	if h.is_downed:
		return false
	var target: EnemyUnit = _find_nearest_enemy(h.position)
	var target_pos: Vector3 = target.position if target != null else h.position
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	return ActionBus.request_action(
		h.name,
		"skill_e",
		{"hero_index": heroes.find(h), "origin": h.position, "target_pos": target_pos},
		float(cfg["e_cd"])
	)


func trigger_revive_nearest(caster: HeroUnit) -> bool:
	if caster.is_downed:
		return false
	for ally in heroes:
		if ally.is_downed and caster.position.distance_to(ally.position) <= 4.0:
			return ActionBus.request_action(
				caster.name,
				"revive",
				{"caster_index": heroes.find(caster), "target_index": heroes.find(ally), "origin": caster.position, "target_pos": ally.position},
				1.5,
				4.5
			)
	return false


func _on_action_executed(_actor_id: String, action_id: String, payload: Dictionary) -> void:
	if action_id == "revive":
		var ti: int = int(payload.get("target_index", -1))
		if ti >= 0 and ti < heroes.size():
			heroes[ti].revive(0.75)
			_spawn_ring_vfx(heroes[ti].position + Vector3(0.0, 0.2, 0.0), 2.8, Color(0.4, 1.0, 0.75), 0.75)
		return

	if not payload.has("hero_index"):
		return
	var hi: int = int(payload["hero_index"])
	if hi < 0 or hi >= heroes.size():
		return
	var h: HeroUnit = heroes[hi]
	var target_pos: Vector3 = payload.get("target_pos", h.position + Vector3(0.0, 0.0, -4.0)) as Vector3
	h.look_at_flat(target_pos)

	match action_id:
		"basic_attack":
			h.visual.trigger_attack(0.32)
			if h.hero_class == "archer":
				_spawn_projectile(h, target_pos, h.attack_damage, Color(0.55, 1.0, 0.3), true)
				_play_sfx("archer_shot")
			elif h.hero_class == "mage":
				_spawn_projectile(h, target_pos, h.attack_damage, Color(0.45, 0.85, 1.0), false)
			else:
				_deal_melee_arc(h, h.attack_range + 0.9, h.attack_damage)
				_spawn_ring_vfx(h.position + (target_pos - h.position).normalized() * 1.4, 1.7, h.accent_color, 0.25)

		"skill_q":
			match h.hero_class:
				"tank":
					h.activate_charged_shield(3.6)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 2.5, Color(0.3, 0.85, 1.0), 0.5)
					_play_sfx("charge_start")
				"archer":
					h.visual.trigger_attack(0.38)
					_spawn_projectile(h, target_pos, 62.0, Color(0.95, 1.0, 0.35), true, 1.55)
					_play_sfx("power_shot")
				"mage":
					h.visual.trigger_attack(0.42)
					# Healing Ring AOEAction centered on party
					var heal_pos := h.position
					_spawn_ring_vfx(heal_pos + Vector3(0.0, 0.16, 0.0), 6.2, Color(0.32, 1.0, 0.48), 1.45)
					for ally in heroes:
						if not ally.is_downed and ally.position.distance_to(heal_pos) <= 9.5:
							h.total_healing_done += ally.heal(55.0)
				"rogue":
					var dir := (target_pos - h.position).normalized()
					h.trigger_dash(dir, 23.0, 0.28)
					_deal_melee_arc(h, 4.4, 58.0)
					_spawn_ring_vfx(target_pos + Vector3(0.0, 0.2, 0.0), 2.4, Color(0.85, 0.45, 1.0), 0.45)

		"skill_e":
			h.visual.trigger_attack(0.42)
			match h.hero_class:
				"tank":
					_deal_melee_arc(h, 5.2, 54.0)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 4.8, Color(0.3, 0.72, 1.0), 0.55)
				"archer":
					for ang in [-0.22, 0.0, 0.22]:
						var d := (target_pos - h.position).normalized().rotated(Vector3.UP, float(ang))
						_spawn_projectile(h, h.position + d * 12.0, 34.0, Color(0.45, 1.0, 0.35), true)
					_play_sfx("power_shot")
				"mage":
					_spawn_ring_vfx(target_pos + Vector3(0.0, 0.2, 0.0), 5.6, Color(1.0, 0.4, 0.92), 0.8)
					for e in enemies:
						if not e.is_dead and e.position.distance_to(target_pos) <= 6.2:
							h.total_damage_dealt += e.take_damage(68.0)
				"rogue":
					_deal_melee_arc(h, 4.2, 74.0)
					_spawn_ring_vfx(h.position + Vector3(0.0, 0.2, 0.0), 3.0, Color(0.9, 0.4, 1.0), 0.45)


func _deal_melee_arc(h: HeroUnit, range_val: float, dmg: float) -> void:
	for e in enemies:
		if e.is_dead:
			continue
		if h.position.distance_to(e.position) <= range_val + (1.6 if e.is_boss else 0.4):
			h.total_damage_dealt += e.take_damage(dmg)


func _spawn_projectile(owner_hero: HeroUnit, target_pos: Vector3, dmg: float, color: Color, use_arrow_mesh: bool, scale_mult: float = 1.0) -> void:
	var node := Node3D.new()
	node.position = owner_hero.position + Vector3(0.0, 1.35, 0.0)
	var dir := Vector3(target_pos.x - owner_hero.position.x, 0.0, target_pos.z - owner_hero.position.z).normalized()
	if dir.length_squared() < 0.01:
		dir = Vector3(0.0, 0.0, -1.0)
	node.rotation.y = atan2(dir.x, dir.z)

	var mi := MeshInstance3D.new()
	if use_arrow_mesh and dungeon.arrow_mesh_template != null:
		mi.mesh = dungeon.arrow_mesh_template
		mi.scale = Vector3.ONE * (1.35 * scale_mult)
	else:
		var sp := SphereMesh.new()
		sp.radius = 0.34 * scale_mult
		sp.height = 0.68 * scale_mult
		mi.mesh = sp
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 4.2
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	node.add_child(mi)

	var glow := OmniLight3D.new()
	glow.light_color = color
	glow.light_energy = 2.6
	glow.omni_range = 6.0
	node.add_child(glow)

	add_child(node)
	projectiles.append({
		"node": node,
		"owner": owner_hero,
		"dir": dir,
		"speed": 26.0,
		"dmg": dmg,
		"life": 1.1,
	})


func _step_projectiles(delta: float) -> void:
	var keep: Array[Dictionary] = []
	for p in projectiles:
		var n: Node3D = p["node"] as Node3D
		var dir: Vector3 = p["dir"] as Vector3
		var spd: float = float(p["speed"])
		var life: float = float(p["life"]) - delta
		n.position += dir * spd * delta

		var hit := false
		for e in enemies:
			if e.is_dead:
				continue
			var hit_r: float = 2.3 if e.is_boss else 1.25
			if Vector2(n.position.x - e.position.x, n.position.z - e.position.z).length() <= hit_r:
				var owner_h: HeroUnit = p["owner"] as HeroUnit
				owner_h.total_damage_dealt += e.take_damage(float(p["dmg"]))
				_spawn_ring_vfx(n.position, 1.5, Color(1.0, 0.92, 0.4), 0.25)
				hit = true
				break

		if hit or life <= 0.0:
			n.queue_free()
		else:
			p["life"] = life
			keep.append(p)
	projectiles = keep


func _spawn_ring_vfx(pos: Vector3, radius: float, color: Color, duration: float) -> void:
	var mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius * 0.78
	torus.outer_radius = radius
	mi.mesh = torus
	mi.position = pos
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(color.r, color.g, color.b, 0.85)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 3.8
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	add_child(mi)
	vfx_nodes.append({"node": mi, "mat": mat, "life": duration, "max_life": duration})


func _step_vfx(delta: float) -> void:
	var keep: Array[Dictionary] = []
	for v in vfx_nodes:
		var n: Node3D = v["node"] as Node3D
		var mat: StandardMaterial3D = v["mat"] as StandardMaterial3D
		var life: float = float(v["life"]) - delta
		var ratio: float = clampf(life / float(v["max_life"]), 0.0, 1.0)
		if life <= 0.0:
			n.queue_free()
		else:
			v["life"] = life
			var sc: float = 0.65 + (1.0 - ratio) * 0.55
			n.scale = Vector3(sc, 1.0, sc)
			mat.albedo_color.a = ratio * 0.85
			keep.append(v)
	vfx_nodes = keep


func _on_boss_telegraph(_boss: EnemyUnit, pattern: String) -> void:
	if pattern == "trample":
		_play_sfx("charge_start")


func _on_boss_stunned(b: EnemyUnit, _blocker: HeroUnit) -> void:
	_play_sfx("charge_end")
	_spawn_ring_vfx(b.position + Vector3(0.0, 0.3, 0.0), 4.6, Color(1.0, 0.9, 0.25), 0.9)


func _on_boss_aoe_burst(pos: Vector3) -> void:
	_spawn_ring_vfx(pos + Vector3(0.0, 0.25, 0.0), 6.5, Color(1.0, 0.32, 0.12), 0.7)
	# Summon 1 extra Imp if fewer than 3 alive Imps
	var living_imps := 0
	for e in enemies:
		if not e.is_boss and not e.is_dead:
			living_imps += 1
	if living_imps < 2:
		var imp := EnemyUnit.new()
		add_child(imp)
		imp.setup(false, pos + Vector3(4.5, 0.0, 2.5), enemies.size())
		enemies.append(imp)


func _on_boss_died(_b: EnemyUnit) -> void:
	phase = GamePhase.VICTORY
	chest_opened = true
	if boss_panel != null:
		boss_panel.visible = false
	for e in enemies:
		if not e.is_dead:
			e.take_damage(9999.0)
	dungeon.open_treasure_chest()
	_spawn_ring_vfx(Vector3(0.0, 0.35, -13.2), 5.5, Color(1.0, 0.85, 0.25), 2.5)
	_play_sfx("charge_end")
	_show_victory_panel()


func _find_nearest_enemy(from_pos: Vector3) -> EnemyUnit:
	var best: EnemyUnit = null
	var best_d := 9999.0
	for e in enemies:
		if e.is_dead:
			continue
		var d := from_pos.distance_to(e.position)
		if d < best_d:
			best_d = d
			best = e
	return best


func _build_hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.name = "HUD"
	add_child(hud_layer)

	# Top-center Boss HP Bar + Telegraph Status
	boss_panel = PanelContainer.new()
	boss_panel.position = Vector2(340.0, 14.0)
	boss_panel.custom_minimum_size = Vector2(600.0, 74.0)
	boss_panel.visible = false
	var bp_style := StyleBoxFlat.new()
	bp_style.bg_color = Color(0.08, 0.06, 0.12, 0.84)
	bp_style.border_color = Color(0.95, 0.26, 0.18, 0.92)
	bp_style.set_border_width_all(2)
	bp_style.set_corner_radius_all(8)
	boss_panel.add_theme_stylebox_override("panel", bp_style)
	hud_layer.add_child(boss_panel)

	var bp_vbox := VBoxContainer.new()
	bp_vbox.add_theme_constant_override("separation", 4)
	boss_panel.add_child(bp_vbox)

	var boss_title := Label.new()
	boss_title.text = "IMP BOSS — DUNGEON OVERLORD"
	boss_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	boss_title.add_theme_font_size_override("font_size", 16)
	bp_vbox.add_child(boss_title)

	boss_hp_bar = ProgressBar.new()
	boss_hp_bar.min_value = 0.0
	boss_hp_bar.max_value = 1200.0
	boss_hp_bar.value = 1200.0
	boss_hp_bar.custom_minimum_size = Vector2(560.0, 20.0)
	boss_hp_bar.show_percentage = false
	var fill_sb := StyleBoxFlat.new()
	fill_sb.bg_color = Color(0.92, 0.18, 0.15)
	fill_sb.set_corner_radius_all(4)
	boss_hp_bar.add_theme_stylebox_override("fill", fill_sb)
	bp_vbox.add_child(boss_hp_bar)

	boss_state_label = Label.new()
	boss_state_label.text = "STATE: PURSUING PARTY"
	boss_state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_state_label.add_theme_color_override("font_color", Color(1.0, 0.55, 0.35))
	boss_state_label.add_theme_font_size_override("font_size", 13)
	bp_vbox.add_child(boss_state_label)

	# Top-left Objective & Netcode Authority Panel
	var top_left := PanelContainer.new()
	top_left.position = Vector2(16.0, 14.0)
	top_left.custom_minimum_size = Vector2(305.0, 68.0)
	var tl_style := StyleBoxFlat.new()
	tl_style.bg_color = Color(0.06, 0.08, 0.14, 0.82)
	tl_style.border_color = Color(0.35, 0.65, 1.0, 0.75)
	tl_style.set_border_width_all(2)
	tl_style.set_corner_radius_all(8)
	top_left.add_theme_stylebox_override("panel", tl_style)
	hud_layer.add_child(top_left)

	var tl_v := VBoxContainer.new()
	top_left.add_child(tl_v)
	objective_label = Label.new()
	objective_label.text = "QUEST: Step on Floor Switch to open Boss Door"
	objective_label.add_theme_font_size_override("font_size", 13)
	objective_label.add_theme_color_override("font_color", Color(0.95, 0.96, 1.0))
	tl_v.add_child(objective_label)

	netcode_badge = Label.new()
	netcode_badge.text = "HOST AUTHORITY (RPCs: 0)"
	netcode_badge.add_theme_font_size_override("font_size", 12)
	netcode_badge.add_theme_color_override("font_color", Color(0.45, 0.92, 0.7))
	tl_v.add_child(netcode_badge)

	# Bottom-left 4-Hero Party Status Cards
	var party_hbox := HBoxContainer.new()
	party_hbox.position = Vector2(16.0, 616.0)
	party_hbox.add_theme_constant_override("separation", 10)
	hud_layer.add_child(party_hbox)

	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(182.0, 88.0)
		var cs := StyleBoxFlat.new()
		cs.bg_color = Color(0.07, 0.08, 0.13, 0.84)
		cs.border_color = h.accent_color
		cs.set_border_width_all(2)
		cs.set_corner_radius_all(8)
		card.add_theme_stylebox_override("panel", cs)
		party_hbox.add_child(card)

		var cv := VBoxContainer.new()
		card.add_child(cv)
		var name_lbl := Label.new()
		name_lbl.text = "[" + str(i + 1) + "] " + h.display_name
		name_lbl.add_theme_color_override("font_color", h.accent_color)
		name_lbl.add_theme_font_size_override("font_size", 14)
		cv.add_child(name_lbl)

		var bar := ProgressBar.new()
		bar.max_value = h.max_hp
		bar.value = h.hp
		bar.custom_minimum_size = Vector2(160.0, 14.0)
		bar.show_percentage = false
		var bsb := StyleBoxFlat.new()
		bsb.bg_color = Color(0.24, 0.88, 0.42)
		bsb.set_corner_radius_all(3)
		bar.add_theme_stylebox_override("fill", bsb)
		cv.add_child(bar)

		var status_lbl := Label.new()
		status_lbl.text = "HP " + str(int(h.hp)) + "/" + str(int(h.max_hp))
		status_lbl.add_theme_font_size_override("font_size", 12)
		status_lbl.add_theme_color_override("font_color", Color(0.9, 0.92, 0.98))
		cv.add_child(status_lbl)

		party_cards.append({"panel": card, "style": cs, "bar": bar, "status": status_lbl})

	# Bottom-right Active Hero Skill Hotbar
	var skill_panel := PanelContainer.new()
	skill_panel.position = Vector2(780.0, 622.0)
	skill_panel.custom_minimum_size = Vector2(484.0, 80.0)
	var sp_style := StyleBoxFlat.new()
	sp_style.bg_color = Color(0.06, 0.08, 0.14, 0.86)
	sp_style.border_color = Color(0.95, 0.78, 0.25, 0.85)
	sp_style.set_border_width_all(2)
	sp_style.set_corner_radius_all(8)
	skill_panel.add_theme_stylebox_override("panel", sp_style)
	hud_layer.add_child(skill_panel)

	skill_bar_label = Label.new()
	skill_bar_label.add_theme_font_size_override("font_size", 13)
	skill_bar_label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.9))
	skill_panel.add_child(skill_bar_label)

	# Victory PostGame Summary Overlay (top-center so Treasure Chest & 4 Heroes remain clearly visible below!)
	victory_panel = PanelContainer.new()
	victory_panel.position = Vector2(360.0, 22.0)
	victory_panel.custom_minimum_size = Vector2(560.0, 270.0)
	victory_panel.visible = false
	var vp_style := StyleBoxFlat.new()
	vp_style.bg_color = Color(0.06, 0.05, 0.11, 0.9)
	vp_style.border_color = Color(1.0, 0.84, 0.25, 0.98)
	vp_style.set_border_width_all(3)
	vp_style.set_corner_radius_all(12)
	victory_panel.add_theme_stylebox_override("panel", vp_style)
	hud_layer.add_child(victory_panel)

	var vp_v := VBoxContainer.new()
	vp_v.add_theme_constant_override("separation", 10)
	victory_panel.add_child(vp_v)

	var v_title := Label.new()
	v_title.text = "BOSS DEFEATED — VICTORY!"
	v_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v_title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.28))
	v_title.add_theme_font_size_override("font_size", 26)
	vp_v.add_child(v_title)

	victory_stats_label = Label.new()
	victory_stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	victory_stats_label.add_theme_color_override("font_color", Color(0.94, 0.95, 1.0))
	victory_stats_label.add_theme_font_size_override("font_size", 15)
	vp_v.add_child(victory_stats_label)


func _update_skill_bar() -> void:
	if skill_bar_label == null:
		return
	var h := get_active_hero()
	var cfg: Dictionary = HeroUnit.CLASS_STATS[h.hero_class]
	skill_bar_label.text = "ACTIVE: %s (1-4 Switch) | WASD Move
[SPACE] Attack   [Q] %s   [E] %s   [R] Revive" % [
		h.display_name, str(cfg["q_name"]), str(cfg["e_name"])
	]


func _update_hud() -> void:
	match phase:
		GamePhase.ENTRANCE:
			objective_label.text = "QUEST: Boss Door OPEN! Enter the Arena!" if boss_door_open else "QUEST: Stand on Floor Switch to unlock Boss Door"
		GamePhase.BOSS_FIGHT:
			objective_label.text = "QUEST: Defeat Imp Boss! Block Trample w/ Tank [Q]"
		GamePhase.VICTORY:
			objective_label.text = "VICTORY! Treasure Chest unlocked!"
		GamePhase.DEFEAT:
			objective_label.text = "DEFEAT — Party Fallen"

	netcode_badge.text = "SERVER AUTHORITY (RPCs: %d | Stuns: %d)" % [
		ActionBus.total_rpc_dispatches, boss.stun_count if boss != null else 0
	]

	if boss != null and boss_panel.visible:
		boss_hp_bar.value = boss.hp
		boss_state_label.text = "STATE: " + boss.get_pattern_label()

	for i in heroes.size():
		var h: HeroUnit = heroes[i]
		var card: Dictionary = party_cards[i]
		var bar: ProgressBar = card["bar"] as ProgressBar
		var status: Label = card["status"] as Label
		var style: StyleBoxFlat = card["style"] as StyleBoxFlat
		bar.value = h.hp
		var tag := "DOWNED" if h.is_downed else ("SHIELD!" if h.shield_active else "HP %d/%d" % [int(h.hp), int(h.max_hp)])
		status.text = tag + (" [YOU]" if i == active_hero_index else " [AI]")
		style.set_border_width_all(3 if i == active_hero_index else 1)


func _show_victory_panel() -> void:
	var lines: PackedStringArray = PackedStringArray()
	lines.append("Treasure Chest Opened! Party Co-op Summary:")
	lines.append("")
	for h in heroes:
		lines.append("• %-6s  |  DMG: %4d  |  HEAL: %3d  |  HP: %d/%d" % [
			h.display_name, int(h.total_damage_dealt), int(h.total_healing_done), int(h.hp), int(h.max_hp)
		])
	lines.append("")
	lines.append("Boss Stuns (Tank Shield): %d   |   Server RPCs: %d" % [boss.stun_count, ActionBus.total_rpc_dispatches])
	victory_stats_label.text = "\n".join(lines)
	victory_panel.visible = true
