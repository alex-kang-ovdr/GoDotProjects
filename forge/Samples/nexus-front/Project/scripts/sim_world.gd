extends RefCounted
## Native deterministic Nexus Front simulation. Source: v10 web rules; Godot port v11.
## All positions use project units (official LoL ranges were scaled by 0.5).

const ABILITIES = preload("res://scripts/ability_system.gd")
const VISION = preload("res://scripts/vision_system.gd")
const SLOTS = ["q", "w", "e", "r"]
const STRUCTURES = ["tower", "inhibitor", "nexus"]
const SAVE_VERSION = 11
const MAX_SAVE_BYTES = 8 * 1024 * 1024

var data: Dictionary = {}
var hero_defs: Dictionary = {}
var item_defs: Dictionary = {}
var map: Dictionary = {}
var size: float = 1600.0
var map_scale: float = 1.0
var bases: Array[Vector2] = []
var lanes: Dictionary = {}
var entities: Array[Dictionary] = []
var time: float = 0.0
var tick: int = 0
var player_id: int = -1
var winner: int = -1
var wave: int = 0
var team_kills: Array[int] = [0, 0]
var team_buffs: Array = [{"dragon":0,"boss_until":0.0}, {"dragon":0,"boss_until":0.0}]
var rng = RandomNumberGenerator.new()
var events: Array[Dictionary] = []
var visuals: Array[Dictionary] = []
var abilities: RefCounted
var vision: RefCounted
var difficulty: String = "standard"
var started: bool = false
var _next_id: int = 1
var _by_id: Dictionary = {}
var _next_wave: float = 0.0
var _next_gold: float = 1.0
var _next_cleanup: float = 3.0
var _seed: int = 73217
var _damage_depth: int = 0
var _in_step: bool = false
var _visibility_cache: Dictionary = {}

func setup(options: Dictionary = {}) -> void:
	_load_definitions()
	map_scale = float(options.get("map_scale", 1.0))
	if not map_scale in [1.0, 1.5, 2.0]: map_scale = 1.0
	difficulty = str(options.get("difficulty", "standard"))
	if not difficulty in ["standard", "training"]: difficulty = "standard"
	_seed = int(options.get("seed", 73217))
	rng.seed = _seed
	time = 0.0
	tick = 0
	winner = -1
	wave = 0
	team_kills = [0, 0]
	team_buffs = [{"dragon":0,"boss_until":0.0}, {"dragon":0,"boss_until":0.0}]
	_next_id = 1
	_next_wave = 18.0
	_next_gold = 1.0
	_next_cleanup = 3.0
	entities.clear()
	_by_id.clear()
	events.clear()
	visuals.clear()
	_build_map()
	abilities = ABILITIES.new(self)
	vision = VISION.new(self)
	_build_structures()
	_build_camps()
	var selected = str(options.get("hero_id", "lol_ahri"))
	if not hero_defs.has(selected): selected = "lol_ahri"
	var selected_role = str(hero_defs[selected].get("preferredRole", "mid"))
	var pools = {"mid":["lol_ahri","lol_lux"], "top":["lol_garen","lol_darius"], "jungle":["lol_leesin"], "bot":["lol_ashe","lol_jhin","lol_ezreal"], "support":["lol_leona","lol_soraka"]}
	for team in [0, 1]:
		for role in ["mid", "top", "jungle", "bot", "support"]:
			var is_player = team == 0 and role == selected_role
			var roster: Array = pools[role]
			var chosen = selected if is_player else str(roster[rng.randi_range(0, roster.size()-1)])
			var lane = "bot" if role == "support" else ("mid" if role == "jungle" else role)
			var p = lane_point(lane, 0.30 if team == 0 else 0.70)
			if role == "support": p += Vector2(28, 12)
			if role == "jungle": p = Vector2(440,1120) * map_scale if team == 0 else Vector2(1160,480) * map_scale
			var h = add_hero(chosen, team, p, is_player)
			h.role = role
			h.lane = lane
			if is_player:
				player_id = h.id
				if difficulty == "training":
					h.level = 6
					h.skills = {"q":3,"w":1,"e":1,"r":1}
					h.gold = 2500
					recalculate(h)
					h.hp = h.max_hp
					h.mp = h.max_mp
	_spawn_wave()
	_update_protection()
	vision.force_refresh()
	started = true
	notify("전투 시작 · 세 라인을 밀고 적 넥서스를 파괴하세요.")

func _load_definitions() -> void:
	if not hero_defs.is_empty() and not item_defs.is_empty(): return
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data/restored_data.json"))
	for d in data.playableHeroes: hero_defs[d.id]=d
	for d in data.shopItems: item_defs[d.id]=d

func _build_map() -> void:
	map = JSON.parse_string(FileAccess.get_file_as_string("res://data/map.json"))
	size = 1600.0 * map_scale
	map.width = size
	map.height = size
	bases.clear()
	lanes.clear()
	for b in map.bases:
		b.x *= map_scale
		b.y *= map_scale
		bases.append(Vector2(b.x,b.y))
	for lane in map.lanes:
		var points: Array[Vector2] = []
		for a in map.lanes[lane]:
			a[0] *= map_scale
			a[1] *= map_scale
			points.append(Vector2(a[0],a[1]))
		lanes[lane] = points
	for category in ["obstacles", "brushes", "highGrounds", "camps"]:
		for item in map[category]:
			item.x *= map_scale
			item.y *= map_scale
			if item.has("r"): item.r *= map_scale

func spawn_unit(kind: String, team: int, pos: Vector2, extras: Dictionary = {}) -> Dictionary:
	var e = {"id":_next_id,"kind":kind,"team":team,"pos":pos,"r":12.0,"hp":100.0,"max_hp":100.0,"mp":0.0,"max_mp":0.0,"alive":true,"damage":10.0,"ap":0.0,"armor":0.0,"mr":0.0,"speed":175.0,"attack_range":60.0,"attack_speed":1.0,"attack_cd":0.0,"windup":0.0,"attack_target":-1,"target_id":-1,"move_target":pos,"has_move_target":false,"cc_until":0.0,"root_until":0.0,"silence_until":0.0,"slow_until":0.0,"slow_factor":1.0,"shield":0.0,"shield_until":0.0,"last_damage_at":-100.0,"respawn_at":0.0,"protected":false,"name":kind,"lane":"mid","state":{},"contributors":{},"facing":-PI/4.0 if team == 0 else 3.0*PI/4.0,"think_at":0.0,"born_at":time,"vision_range":250.0,"gold_value":20,"xp_value":30.0,"home":pos}
	e.merge(extras, true)
	_next_id += 1
	entities.append(e)
	_by_id[e.id] = e
	return e

func add_hero(id: String, team: int, pos: Vector2, is_player: bool = false) -> Dictionary:
	if not hero_defs.has(id): return {}
	var d: Dictionary = hero_defs[id]
	var role = str(d.get("preferredRole", "mid"))
	var h = spawn_unit("hero", team, pos, {"hero_id":id,"key":d.sourceKey,"name":d.name,"role":role,"lane":"bot" if role == "support" else ("mid" if role == "jungle" else role),"level":1,"xp":0.0,"next_xp":110.0,"gold":600,"skills":{"q":1,"w":0,"e":0,"r":0},"cds":{"q":0.0,"w":0.0,"e":0.0,"r":0.0,"d":0.0,"f":0.0},"skill_points":0,"inventory":[],"kills":0,"deaths":0,"assists":0,"cs":0,"recall_until":0.0,"is_player":is_player,"r":19.0,"ward_cd":0.0,"summoner_haste_until":0.0,"auto_attack":true,"attack_move":false,"retreating":false,"build_index":0,"damage_dealt":0.0,"vision_range":420.0,"resource_type":d.resourceType,"crit_chance":0.0,"crit_damage_bonus":0.0,"life_steal":0.0,"ability_haste":0.0})
	recalculate(h)
	h.hp = h.max_hp
	h.mp = h.max_mp
	if abilities: abilities.init_hero(h)
	if is_player: player_id = h.id
	return h

func recalculate(h: Dictionary) -> void:
	var d: Dictionary = hero_defs[h.hero_id]
	var s: Dictionary = d.originalStats
	var level_delta = float(h.level - 1)
	var growth = level_delta * (0.7025 + 0.0175 * level_delta)
	var previous_max: float = float(h.max_hp)
	var previous_mp: float = float(h.max_mp)
	h.max_hp = float(d.hp) + float(s.get("hpperlevel",90))*growth
	h.max_mp = float(d.mana) + (float(s.get("mpperlevel",0))*growth if d.resourceType == "mana" else 0.0)
	h.base_damage = float(d.damage) + float(s.get("attackdamageperlevel",0))*growth
	h.damage = h.base_damage
	h.armor = float(d.armor) + float(s.get("armorperlevel",3))*growth
	h.mr = float(d.magicResist) + float(s.get("spellblockperlevel",1.3))*growth
	h.speed = float(d.speed)
	h.attack_range = float(d.range)
	h.attack_speed = float(d.attackSpeed)
	h.hp_regen = (float(s.get("hpregen",0))+float(s.get("hpregenperlevel",0))*growth)/5.0
	h.mp_regen = (float(s.get("mpregen",0))+float(s.get("mpregenperlevel",0))*growth)/5.0 if d.resourceType=="mana" else 0.0
	h.ap = 0.0
	h.crit_chance = 0.0
	h.crit_damage_bonus = 0.0
	h.life_steal = 0.0
	h.ability_haste = 0.0
	var as_bonus = float(s.get("attackspeedperlevel",0))*growth/100.0
	var speed_mult = 0.0
	var ap_mult = 0.0
	var fields = {"maxHp":"max_hp","maxMana":"max_mp","damage":"damage","armor":"armor","magicResist":"mr","abilityPower":"ap","speed":"speed","critChance":"crit_chance","critDamageBonus":"crit_damage_bonus","lifeSteal":"life_steal","abilityHaste":"ability_haste"}
	for item_id in h.inventory:
		if not item_defs.has(item_id): continue
		var stats: Dictionary = item_defs[item_id].stats
		for key in fields:
			if key=="maxMana" and d.resourceType!="mana": continue
			if stats.has(key): h[fields[key]] += float(stats[key])
		as_bonus += float(stats.get("attackSpeed",0))
		speed_mult += float(stats.get("percentSpeed",0))
		ap_mult = maxf(ap_mult,float(stats.get("abilityPowerMultiplier",0)))
	h.attack_speed = minf(h.attack_speed*(1.0+as_bonus),3.1)
	h.speed = minf(h.speed*(1.0+speed_mult),325.0)
	h.crit_chance = clampf(h.crit_chance,0,1)
	h.life_steal = clampf(h.life_steal,0,1)
	h.ap *= 1.0 + ap_mult
	h.hp = clampf(float(h.hp) + maxf(0.0,h.max_hp-previous_max), 0.0,h.max_hp)
	h.mp = clampf(float(h.mp) + maxf(0.0,h.max_mp-previous_mp),0.0,h.max_mp)
	h.next_xp = 110.0 + level_delta * 55.0

func _build_structures() -> void:
	for team in [0,1]:
		for lane in ["top","mid","bot"]:
			for tier in ["outer","inner"]:
				var progress = 0.34 if tier == "outer" else 0.19
				if team == 1: progress = 1.0-progress
				var hp = 2200.0 if tier == "outer" else 3000.0
				spawn_unit("tower",team,lane_point(lane,progress),{"lane":lane,"tier":tier,"name":("외곽 포탑" if tier == "outer" else "안쪽 포탑"),"r":34.0,"hp":hp,"max_hp":hp,"armor":24.0,"mr":15.0,"damage":94.0 if tier == "outer" else 108.0,"attack_range":340.0,"attack_speed":0.82,"speed":0.0,"vision_range":420.0,"ramp":0,"ramp_target":-1})
			spawn_unit("inhibitor",team,lane_point(lane,0.08 if team == 0 else 0.92),{"lane":lane,"name":"억제기","r":29.0,"hp":1500.0,"max_hp":1500.0,"armor":8.0,"damage":0.0,"speed":0.0,"vision_range":270.0})
		var direction = 1.0 if team == 0 else -1.0
		for offset in [Vector2(95,-25),Vector2(25,-95)]:
			spawn_unit("tower",team,bases[team]+offset*direction*map_scale,{"lane":"base","tier":"base","name":"기지 수호 포탑","r":34.0,"hp":3200.0,"max_hp":3200.0,"armor":20.0,"damage":116.0,"attack_range":345.0,"attack_speed":0.86,"speed":0.0,"vision_range":420.0,"ramp":0,"ramp_target":-1})
		spawn_unit("nexus",team,bases[team],{"lane":"base","name":"아군 넥서스" if team == 0 else "적 넥서스","r":57.0,"hp":5500.0,"max_hp":5500.0,"armor":10.0,"damage":0.0,"speed":0.0,"vision_range":450.0})

func _build_camps() -> void:
	for c in map.camps:
		var boss = c.kind == "boss"
		var dragon = c.kind == "dragon"
		var hp = 2450.0 if boss else (1550.0 if dragon else 390.0)
		var spawn_at = 120.0 if boss else (45.0 if dragon else 0.0)
		spawn_unit(c.kind,2,Vector2(c.x,c.y),{"name":c.name,"camp_id":c.id,"hp":hp,"max_hp":hp,"alive":spawn_at==0.0,"respawn_at":spawn_at,"r":53.0 if boss else (44.0 if dragon else 27.0),"damage":100.0 if boss else (67.0 if dragon else 30.0),"armor":22.0 if boss else (16.0 if dragon else 8.0),"attack_range":200.0 if boss else (155.0 if dragon else 70.0),"speed":85.0 if boss or dragon else 115.0,"attack_speed":0.85,"gold_value":220 if boss else (140 if dragon else 65),"xp_value":220.0 if boss else (160.0 if dragon else 90.0),"leash":330.0 if boss or dragon else 260.0})

func lane_point(lane: String, progress: float) -> Vector2:
	var points: Array = lanes.get(lane, lanes.get("mid",[]))
	if points.is_empty(): return Vector2.ZERO
	var total = 0.0
	for i in range(points.size()-1): total += points[i].distance_to(points[i+1])
	var distance = clampf(progress,0,1)*total
	for i in range(points.size()-1):
		var segment: float = points[i].distance_to(points[i+1])
		if distance <= segment: return points[i].lerp(points[i+1],distance/maxf(1,segment))
		distance -= segment
	return points[-1]

func lane_progress(lane: String, pos: Vector2) -> float:
	var points: Array = lanes[lane]
	var total = 0.0
	for i in range(points.size()-1): total += points[i].distance_to(points[i+1])
	var best = INF
	var best_progress = 0.0
	var done = 0.0
	for i in range(points.size()-1):
		var a: Vector2 = points[i]
		var b: Vector2 = points[i+1]
		var delta = b-a
		var u = clampf((pos-a).dot(delta)/maxf(1,delta.length_squared()),0,1)
		var dist = pos.distance_squared_to(a+delta*u)
		if dist < best:
			best = dist
			best_progress = (done+delta.length()*u)/total
		done += delta.length()
	return best_progress

func _spawn_wave() -> void:
	wave += 1
	for team in [0,1]:
		for lane in ["top","mid","bot"]:
			var count = 0
			for e in entities:
				if e.alive and e.kind=="minion" and e.team==team and e.lane==lane: count += 1
			if count > 24: continue
			var kinds = ["melee","melee","melee","ranged","ranged"]
			if wave%3 == 0 or time > 270: kinds.append("siege")
			for e in entities:
				if e.kind == "inhibitor" and e.team != team and e.lane == lane and not e.alive: kinds.append("super")
			for i in kinds.size():
				var k: String = kinds[i]
				var s = [270.0,23.0,48.0,1.04,23,34.0] if k=="melee" else ([170.0,26.0,205.0,0.95,21,30.0] if k=="ranged" else ([530.0,56.0,240.0,0.7,48,54.0] if k=="siege" else [770.0,68.0,65.0,0.85,38,45.0]))
				var p = lane_point(lane,0.025 + i*0.003 if team==0 else 0.975-i*0.003) + Vector2((i%3-1)*20.0,(i%2)*15.0)
				var hp = s[0]*(1.0+time/200.0)
				spawn_unit("minion",team,p,{"lane":lane,"minion_kind":k,"name":{"melee":"근접 미니언","ranged":"원거리 미니언","siege":"공성 미니언","super":"강화 미니언"}[k],"hp":hp,"max_hp":hp,"damage":s[1]*(1.0+time/125.0),"attack_range":s[2],"attack_speed":s[3],"gold_value":s[4],"xp_value":s[5],"armor":15.0 if k=="super" else 3.0,"r":20.0 if k=="super" else (18.0 if k=="siege" else 12.0),"expires_at":time+180.0,"think_at":time+rng.randf()*0.25})

func hero() -> Dictionary:
	return unit(player_id)

func unit(id: int) -> Dictionary:
	return _by_id.get(id,{})

func step(dt: float) -> void:
	if not started or winner >= 0 or not is_finite(dt) or dt <= 0: return
	dt = minf(dt,0.1)
	_in_step=true
	_visibility_cache.clear()
	time += dt
	tick += 1
	if time >= _next_wave:
		_spawn_wave()
		_next_wave = time + 18.0
	if time >= _next_gold:
		_next_gold = time+1.0
		for e in entities:
			if e.kind=="hero": e.gold += 3
	for e in entities.duplicate():
		if not e.alive:
			if e.kind in ["hero","camp","dragon","boss"] and e.respawn_at>0 and time>=e.respawn_at: _respawn(e)
			continue
		e.attack_cd = maxf(0,float(e.attack_cd)-dt)
		if e.shield_until <= time: e.shield=0.0
		if e.kind=="ward":
			if time >= e.expires_at: e.alive=false
			continue
		if e.kind == "hero":
			_tick_hero(e,dt)
		elif e.kind == "minion":
			if time >= e.expires_at: e.alive=false
			else: _tick_lane_unit(e,dt)
		elif e.kind == "tower": _tick_tower(e,dt)
		elif e.kind in ["camp","dragon","boss"]: _tick_monster(e,dt)
	abilities.step(dt)
	vision.step(dt)
	_in_step=false
	_visibility_cache.clear()
	visuals = visuals.filter(func(v): return float(v.get("until",0))>time)
	if time >= _next_cleanup:
		_next_cleanup=time+3.0
		entities = entities.filter(func(e): return e.alive or e.kind in ["hero","tower","inhibitor","nexus","camp","dragon","boss"])
		_by_id.clear()
		for e in entities: _by_id[e.id]=e

func _tick_hero(h: Dictionary, dt: float) -> void:
	for slot in h.cds: h.cds[slot] = maxf(0.0,float(h.cds[slot])-dt)
	h.ward_cd = maxf(0,float(h.ward_cd)-dt)
	var d: Dictionary = hero_defs[h.hero_id]
	var regen = float(h.hp_regen)
	heal(h,regen*dt)
	h.mp = minf(h.max_mp,h.mp + (10.0 if h.resource_type=="energy" else float(h.mp_regen))*dt)
	if h.pos.distance_to(bases[h.team]) < 145.0:
		heal(h,h.max_hp*0.18*dt)
		h.mp = minf(h.max_mp,h.mp+h.max_mp*0.24*dt)
		if not h.is_player: _ai_buy(h)
	if not h.is_player and h.hp/h.max_hp<0.38 and float(h.cds.get("f",0))<=0: _summoner_cast(h,"f",h.pos)
	if h.recall_until > 0:
		if time >= h.recall_until:
			h.recall_until=0.0
			teleport(h,bases[h.team]+Vector2(35,-35),true)
			h.has_move_target=false
			h.target_id=-1
			add_visual("recall",h.pos,70,Color("71d4ed"),0.7)
		return
	if h.cc_until > time: h.windup=0.0; return
	if not h.is_player:
		_tick_ai(h,dt)
		return
	var target = unit(h.target_id)
	if not target.is_empty() and (not target.alive or not visible_to(target,h.team) or target.team==h.team or target.protected):
		h.target_id=-1
		target={}
	if h.has_move_target and not h.attack_move:
		move_unit(h,h.move_target,dt)
		if h.pos.distance_to(h.move_target)<5.0: h.has_move_target=false
		return
	if target.is_empty() and h.auto_attack:
		target=_nearest_target(h,h.attack_range+30)
	if not target.is_empty():
		if _in_attack_range(h,target): _attack(h,target,dt)
		elif h.target_id>=0 or (h.has_move_target and h.attack_move): move_unit(h,target.pos,dt)
	elif h.has_move_target:
		move_unit(h,h.move_target,dt)
		if h.pos.distance_to(h.move_target)<5.0: h.has_move_target=false

func _tick_ai(h: Dictionary, dt: float) -> void:
	if h.skill_points>0: _auto_upgrade(h)
	if h.hp/h.max_hp<0.25 or (h.resource_type=="mana" and h.max_mp>0 and h.mp/h.max_mp<0.1 and time-h.last_damage_at>3.0): h.retreating=true
	if h.retreating:
		if h.pos.distance_to(bases[h.team]) < 130:
			if h.hp/h.max_hp>0.9 and (h.max_mp==0 or h.mp/h.max_mp>0.7): h.retreating=false
		elif time-h.last_damage_at>3.0 and _nearest_target(h,360).is_empty():
			h.recall_until=time+4.0
			h.windup=0.0
		else: move_unit(h,bases[h.team],dt)
		return
	var target = unit(h.target_id)
	if time>=float(h.think_at):
		h.think_at=time+0.22+rng.randf()*0.08
		target = _nearest_target(h,520.0 if h.role=="jungle" else 440.0)
		if h.role=="jungle" and target.is_empty():
			var nearest_dist=INF
			for e in entities:
				if e.kind=="camp" and e.alive:
					var dist=h.pos.distance_to(e.pos)
					if dist<nearest_dist and visible_to(e,h.team): nearest_dist=dist; target=e
		h.target_id=int(target.get("id",-1))
		# The support spell system can choose wounded allies even without an enemy.
		abilities.auto_cast(h,target)
	if not target.is_empty() and target.alive and visible_to(target,h.team) and not target.protected:
		if _in_attack_range(h,target): _attack(h,target,dt)
		elif h.pos.distance_to(target.pos)<650: move_unit(h,target.pos,dt)
		else: h.target_id=-1
	else:
		h.target_id=-1
		if time>=float(h.get("route_at",0)) or h.pos.distance_to(h.get("route_target",h.pos))<16:
			h.route_at=time+0.4
			var progress = lane_progress(h.lane,h.pos)
			var advance = 0.045 if h.team==0 else -0.045
			h.route_target=lane_point(h.lane,progress+advance)
		move_unit(h,h.route_target,dt)

func _tick_lane_unit(e: Dictionary,dt: float) -> void:
	e.empowered=false
	if team_buffs[e.team].boss_until>time:
		for ally in entities:
			if ally.kind=="hero" and ally.team==e.team and ally.alive and ally.pos.distance_to(e.pos)<650.0: e.empowered=true; break
	if e.cc_until > time: e.windup=0.0; return
	var target = unit(e.target_id)
	if not target.is_empty() and (not target.alive or target.protected or e.pos.distance_to(target.pos)>420.0 or not visible_to(target,e.team)):
		target={}
		e.target_id=-1
	if time>=float(e.think_at) or (not target.is_empty() and not target.alive):
		e.think_at=time+0.25
		target=_nearest_target(e,350.0,false)
		e.target_id=int(target.get("id",-1))
	if not target.is_empty() and target.alive and visible_to(target,e.team):
		if _in_attack_range(e,target): _attack(e,target,dt)
		else: move_unit(e,target.pos,dt)
	else:
		if time>=float(e.get("route_at",0)) or e.pos.distance_to(e.get("route_target",e.pos))<16:
			e.route_at=time+0.4
			var progress=lane_progress(e.lane,e.pos)
			e.route_target=lane_point(e.lane,progress+(0.04 if e.team==0 else -0.04))
		move_unit(e,e.route_target,dt)

func _tick_tower(e: Dictionary,dt: float) -> void:
	var target = unit(e.target_id)
	if not target.is_empty() and (not target.alive or not _in_attack_range(e,target) or not visible_to(target,e.team)):
		target={}
		e.target_id=-1
	if target.is_empty() and time>=float(e.think_at):
		e.think_at=time+0.2
		target=_nearest_target(e,e.attack_range+25,false,true)
		e.target_id=int(target.get("id",-1))
	if not target.is_empty(): _attack(e,target,dt)

func _tick_monster(e: Dictionary,dt: float) -> void:
	if e.cc_until>time: return
	var target = unit(e.target_id)
	if e.pos.distance_to(e.home)>e.leash:
		e.target_id=-1
		move_unit(e,e.home,dt)
		heal(e,e.max_hp*0.2*dt)
		return
	if target.is_empty() or not target.alive or target.pos.distance_to(e.home)>e.leash+100:
		e.target_id=-1
		if e.pos.distance_to(e.home)>3: move_unit(e,e.home,dt)
		if time-e.last_damage_at>4: heal(e,e.max_hp*0.15*dt)
		return
	if _in_attack_range(e,target): _attack(e,target,dt)
	else: move_unit(e,target.pos,dt)

func _nearest_target(source: Dictionary,radius: float,heroes_first: bool=true,minions_first: bool=false) -> Dictionary:
	var best: Dictionary = {}
	var best_score = INF
	for e in entities:
		if not e.alive or e.team==source.team or e.kind=="ward" or e.protected: continue
		if e.team==2 and source.get("role","")!="jungle": continue
		var distance: float = source.pos.distance_to(e.pos)
		if distance>radius+e.r: continue
		if source.team<2 and not visible_to(e,source.team): continue
		var score=distance
		if heroes_first and e.kind=="hero": score-=90
		if minions_first and e.kind=="minion": score-=500
		if STRUCTURES.has(e.kind): score+=100
		if score<best_score: best_score=score; best=e
	return best

func nearby_enemies(h: Dictionary,radius: float,center: Vector2=Vector2.INF) -> Array:
	if not center.is_finite(): center=h.pos
	var found: Array = []
	for e in entities:
		if e.alive and e.team!=h.team and e.kind!="ward" and center.distance_to(e.pos)<=radius+e.r: found.append(e)
	return found

func visible_to(e: Dictionary,team: int=0) -> bool:
	if e.is_empty(): return false
	if e.team==team and e.alive: return true
	if not _in_step: return vision.is_entity_visible(e,team) if vision else true
	# Only one physics step owns this cache. Moving targets invalidate their entry;
	# emitter movement is committed on the next step, never persisted or used by UI.
	var key=int(e.id)*3+team
	var old: Array=_visibility_cache.get(key,[])
	var reveal=float(e.get("revealed_until",0))
	var reveal_team=int(e.get("reveal_team",-1))
	if old.size()==5 and old[0]==e.pos and old[1]==e.alive and old[2]==reveal and old[3]==reveal_team: return old[4]
	var result=vision.is_entity_visible(e,team) if vision else true
	_visibility_cache[key]=[e.pos,e.alive,reveal,reveal_team,result]
	return result

func _in_attack_range(a: Dictionary,b: Dictionary) -> bool:
	return a.pos.distance_to(b.pos)<=float(a.attack_range)+float(b.r)+3.0

func _attack(a: Dictionary,b: Dictionary,dt: float) -> void:
	if not b.alive or b.protected or a.cc_until>time: a.windup=0.0; return
	if a.get("recall_until",0.0)>0: return
	if a.kind=="hero" and not abilities.can_attack(a): a.windup=0.0; return
	a.facing=(b.pos-a.pos).angle()
	if a.windup>0:
		if int(a.attack_target)!=int(b.id): a.windup=0.0; return
		a.windup=maxf(0.0,a.windup-dt)
		if a.windup>0: return
		if not _in_attack_range(a,b) or (a.team<2 and not visible_to(b,a.team)): return
		var packet = abilities.basic_attack(a,b) if a.kind=="hero" else {"damage":float(a.damage),"kind":"physical"}
		if packet.get("cancel",false): return
		var amount=float(packet.get("damage",a.damage))
		if a.get("empowered",false): amount*=1.4
		if a.kind=="minion" and a.get("minion_kind","") in ["siege","super"] and STRUCTURES.has(b.kind): amount*=1.6
		if a.kind=="tower":
			if b.kind=="hero":
				a.ramp = mini(4,int(a.ramp)+1) if a.ramp_target==b.id else 0
				a.ramp_target=b.id
				amount *= 1.0+0.22*int(a.ramp)
			else: a.ramp=0
		var hit=damage(b,amount,a,str(packet.get("kind","physical")),a.pos,false)
		if a.kind=="hero":
			abilities.on_basic_hit(a,b,hit)
		add_visual("attack",b.pos,6.0,Color("80d7f3") if a.team==0 else Color("f48e91"),0.16,{"from":a.pos,"team":a.team})
		return
	if a.attack_cd>0: return
	var attack_speed=float(a.attack_speed)
	if a.kind=="hero": attack_speed*=abilities.attack_speed_multiplier(a)
	var period=1.0/maxf(0.1,attack_speed)
	a.attack_cd=period
	a.windup=clampf(period*0.25,0.1,0.32)
	a.attack_target=b.id

func damage(target: Dictionary,amount: float,source: Dictionary={},kind: String="physical",origin: Vector2=Vector2.INF,is_spell: bool=false) -> float:
	if target.is_empty() or not target.alive or target.protected or not is_finite(amount) or amount<=0: return 0.0
	if not source.is_empty() and target.team==source.team: return 0.0
	if _damage_depth>8: return 0.0
	var resistance: float = float(target.armor if kind=="physical" else target.mr)
	if target.kind=="hero": resistance+=abilities.defense_bonus(target)
	if kind=="physical" and resistance>0 and not source.is_empty(): resistance*=1.0-abilities.armor_penetration(source)
	var reduction=1.0 if kind=="true" else (100.0/(100.0+resistance) if resistance>=0 else 2.0-100.0/(100.0-resistance))
	var actual = amount*reduction
	if target.kind=="hero" and kind!="true": actual*=abilities.damage_multiplier(target)
	if not source.is_empty() and source.team<2: actual*=1.0+int(team_buffs[source.team].dragon)*0.065
	if STRUCTURES.has(target.kind) and time<360.0 and not source.is_empty() and source.team<2:
		var has_wave=false
		for minion in entities:
			if minion.alive and minion.kind=="minion" and minion.team==source.team and minion.pos.distance_to(target.pos)<430.0: has_wave=true; break
		if not has_wave: actual*=0.2
	if difficulty=="training" and target.get("is_player",false): actual*=0.7
	var absorbed=minf(float(target.shield),actual)
	target.shield-=absorbed
	actual-=absorbed
	actual=minf(float(target.hp),actual)
	target.hp-=actual
	target.last_damage_at=time
	if target.has("recall_until"): target.recall_until=0.0
	if not source.is_empty():
		if source.kind=="hero":
			source.damage_dealt+=actual
			target.contributors[source.id]=time
			if target.kind=="hero":
				for tower in entities:
					if tower.kind=="tower" and tower.alive and tower.team==target.team and _in_attack_range(tower,source) and visible_to(source,tower.team):
						tower.target_id=source.id
						tower.windup=0.0
		if target.team==2: target.target_id=source.id
		if target.team<2 and source.team!=target.team and vision:
			var attack_origin=source.pos if not origin.is_finite() else origin
			if not vision.is_point_visible(attack_origin,target.team): vision.reveal_attack(source.team,attack_origin,target.team)
	_damage_depth+=1
	abilities.on_damage(source,target,actual,kind,is_spell)
	_damage_depth-=1
	if target.hp<=0 and target.alive: _kill(target,source)
	return actual

func _kill(target: Dictionary,source: Dictionary) -> void:
	target.alive=false
	target.hp=0.0
	target.windup=0.0
	target.target_id=-1
	target.has_move_target=false
	var killer_team=int(source.get("team",-1))
	if target.kind=="hero":
		target.deaths+=1
		target.recall_until=0.0
		target.respawn_at=time+clampf(7.0+target.level*0.65+time/80.0,7,22)
		if killer_team in [0,1]: team_kills[killer_team]+=1
		if source.get("kind","")=="hero":
			source.kills+=1
			source.gold+=300
			gain_xp(source,150.0+target.level*18.0)
		for id in target.contributors:
			var assistant=unit(int(id))
			if not assistant.is_empty() and assistant.alive and assistant.kind=="hero" and assistant.id!=source.get("id",-1) and time-float(target.contributors[id])<10:
				assistant.assists+=1
				assistant.gold+=100
				if abilities.has_method("on_takedown"): abilities.on_takedown(assistant,target)
		if target.team==0 or vision.is_point_visible(target.pos,0): notify(str(source.get("name","포탑"))+" → "+str(target.name)+" 처치")
	elif target.kind in ["minion","camp","dragon","boss"]:
		if source.get("kind","")=="hero":
			source.gold+=int(target.gold_value)
			source.cs+=1
		for h in entities:
			if h.kind=="hero" and h.alive and h.team==killer_team and h.pos.distance_to(target.pos)<650: gain_xp(h,float(target.xp_value))
		if target.team==2:
			target.respawn_at=time+(150.0 if target.kind=="boss" else (85.0 if target.kind=="dragon" else 38.0))
			vision.record_objective_death(target,killer_team)
			if killer_team in [0,1] and target.kind in ["dragon","boss"]:
				if target.kind=="dragon": team_buffs[killer_team].dragon=mini(4,int(team_buffs[killer_team].dragon)+1)
				else: team_buffs[killer_team].boss_until=time+70.0
				for h in entities:
					if h.kind=="hero" and h.team==killer_team: h.gold+=75; recalculate(h)
				if vision.is_point_visible(target.pos,0) or killer_team==0: notify(str(target.name)+" 확보 · 팀 강화")
	elif STRUCTURES.has(target.kind):
		if killer_team in [0,1]:
			for h in entities:
				if h.kind=="hero" and h.team==killer_team: h.gold+=65 if target.kind=="inhibitor" else 50; gain_xp(h,65)
		if target.team==0 or visible_to(target,0): notify(("적 " if target.team==1 else "아군 ")+str(target.name)+" 파괴")
		if target.kind=="nexus": winner=1-target.team; notify("승리!" if winner==0 else "패배 · 다시 도전하세요")
		_update_protection()
	abilities.on_kill(source,target)

func _respawn(e: Dictionary) -> void:
	e.alive=true
	e.hp=e.max_hp
	e.mp=e.max_mp
	e.shield=0.0
	e.respawn_at=0.0
	e.cc_until=0.0
	e.root_until=0.0
	e.silence_until=0.0
	e.slow_until=0.0
	e.windup=0.0
	e.attack_cd=0.0
	e.target_id=-1
	e.contributors={}
	e.last_damage_at=-100.0
	if e.kind=="hero":
		e.pos=bases[e.team]+Vector2(25,-25)
		e.recall_until=0.0
		e.retreating=false
		abilities.init_hero(e)
		if e.is_player: notify("부활했습니다 · 기지에서 아이템을 구매하세요.")
	else: e.pos=e.home

func gain_xp(h: Dictionary,amount: float) -> void:
	if h.kind!="hero" or h.level>=18: return
	h.xp+=amount
	while h.level<18 and h.xp>=h.next_xp:
		h.xp-=h.next_xp
		h.level+=1
		h.skill_points+=1
		recalculate(h)
		if h.is_player: notify("레벨 %d · 스킬 강화 가능 (Ctrl+Q/W/E/R)" % h.level)

func _auto_upgrade(h: Dictionary) -> void:
	if _upgrade(h,"r"): return
	# Bots learn their complete basic kit before maximizing their main spell.
	for s in ["q","w","e"]:
		if h.skills[s]==0 and _upgrade(h,s): return
	for s in ["q","w","e"]:
		if _upgrade(h,s): return

func _upgrade(h: Dictionary,slot: String) -> bool:
	if h.skill_points<=0 or not SLOTS.has(slot): return false
	var rank=int(h.skills[slot])
	if slot=="r":
		if rank>=3 or h.level<[6,11,16][rank]: return false
	else:
		if rank>=5 or (rank+1)*2-1>h.level: return false
	h.skills[slot]+=1
	h.skill_points-=1
	return true

func upgrade_skill(slot: String) -> bool:
	return _upgrade(hero(),slot)

func heal(target: Dictionary,amount: float) -> float:
	if target.is_empty() or not target.alive or amount<=0: return 0.0
	var actual=minf(amount,float(target.max_hp)-float(target.hp))
	target.hp+=actual
	return actual

func give_shield(target: Dictionary,amount: float,duration: float) -> void:
	if target.is_empty() or not target.alive: return
	target.shield=maxf(target.shield,amount)
	target.shield_until=maxf(target.shield_until,time+duration)

func apply_cc(target: Dictionary,duration: float,kind: String="stun") -> void:
	if target.is_empty() or STRUCTURES.has(target.kind): return
	if kind=="root": target.root_until=maxf(target.root_until,time+duration)
	elif kind=="silence": target.silence_until=maxf(target.silence_until,time+duration)
	else: target.cc_until=maxf(target.cc_until,time+duration)
	target.windup=0.0
	if kind!="root" and target.kind=="hero": abilities.cancel_channel(target)
	if target.has("recall_until"): target.recall_until=0.0

func apply_slow(target: Dictionary,factor: float,duration: float) -> void:
	if target.is_empty() or STRUCTURES.has(target.kind): return
	target.slow_factor=minf(float(target.slow_factor),factor) if target.slow_until>time else factor
	target.slow_until=maxf(target.slow_until,time+duration)

func move_unit(e: Dictionary,destination: Vector2,dt: float,ignore_walls: bool=false) -> void:
	if e.root_until>time or e.cc_until>time: return
	e.windup=0.0
	var speed: float=e.speed
	if e.get("empowered",false): speed*=1.1
	if e.slow_until>time: speed*=e.slow_factor
	if e.kind=="hero":
		speed*=abilities.move_speed_multiplier(e)
		if float(e.get("summoner_haste_until",0))>time: speed*=1.25
	if not ignore_walls and vision:
		if not _in_step or time>=float(e.get("nav_until",0)) or destination.distance_to(e.get("nav_goal",Vector2.INF))>40 or e.pos.distance_to(e.get("nav_point",e.pos))<5:
			e.nav_until=time+0.18
			e.nav_goal=destination
			e.nav_point=vision.navigation_target(e.pos,destination,e.r)
		destination=e.nav_point
	var delta: Vector2=destination-e.pos
	if delta.length()<0.1: return
	e.facing=delta.angle()
	var proposed: Vector2=e.pos.move_toward(destination,speed*dt)
	if ignore_walls:
		e.pos=Vector2(clampf(proposed.x,e.r,size-e.r),clampf(proposed.y,e.r,size-e.r))
		return
	var safe: Vector2=vision.safe_move(e.pos,proposed,e.r) if vision else proposed
	if safe.distance_squared_to(e.pos)<0.05 and delta.length()>8:
		# Tangent steering around static circles. A direct lane route is retained.
		var tangent=delta.normalized().orthogonal()
		for sign_value in [1.0,-1.0]:
			var around: Vector2=e.pos+(delta.normalized()*0.25+tangent*sign_value).normalized()*speed*dt
			var attempt: Vector2=vision.safe_move(e.pos,around,e.r)
			if attempt.distance_squared_to(e.pos)>safe.distance_squared_to(e.pos): safe=attempt
	e.pos=safe

func teleport(e: Dictionary,destination: Vector2,allow_wall_cross: bool=false) -> void:
	var dest=Vector2(clampf(destination.x,e.r,size-e.r),clampf(destination.y,e.r,size-e.r))
	if not vision: e.pos=dest; return
	if allow_wall_cross:
		if not vision.is_walkable(dest,e.r):
			for i in range(1,25):
				var candidate: Vector2=dest+Vector2.RIGHT.rotated(i*2.39996)*float(12+i*5)
				if vision.is_walkable(candidate,e.r): dest=candidate; break
		if vision.is_walkable(dest,e.r): e.pos=dest
	else: e.pos=vision.safe_move(e.pos,dest,e.r)
	e.windup=0.0
	if e.has("recall_until"): e.recall_until=0.0

func command_move(pos: Vector2,attack_move: bool=false) -> void:
	var h=hero()
	if h.is_empty() or not h.alive: return
	abilities.cancel_channel(h)
	h.nav_until=0.0
	h.move_target=Vector2(clampf(pos.x,20,size-20),clampf(pos.y,20,size-20))
	h.has_move_target=true
	h.attack_move=attack_move
	h.target_id=-1
	h.windup=0.0
	h.recall_until=0.0

func command_attack(id: int) -> void:
	var h=hero()
	var e=unit(id)
	if h.is_empty() or e.is_empty() or not h.alive or not e.alive or e.team==h.team or e.protected or not visible_to(e,h.team): return
	abilities.cancel_channel(h)
	h.target_id=id
	h.has_move_target=false
	h.recall_until=0.0

func stop_player() -> void:
	var h=hero()
	if h.is_empty(): return
	abilities.cancel_channel(h)
	h.has_move_target=false
	h.target_id=-1
	h.windup=0.0
	h.recall_until=0.0

func cast(slot: String,aim: Vector2,target_id: int=-1) -> bool:
	if winner>=0 or not started: return false
	if slot in ["d","f"]: return _summoner_cast(hero(),slot,aim)
	if slot=="ward": return place_ward(aim)
	return abilities.cast(hero(),slot,aim,target_id)

func _summoner_cast(h: Dictionary,slot: String,aim: Vector2) -> bool:
	if h.is_empty() or not h.alive or winner>=0 or slot not in ["d","f"] or float(h.cds.get(slot,0))>0.001: return false
	if slot=="d":
		if h.cc_until>time or h.root_until>time or float(h.get("charm_until",0))>time or not aim.is_finite(): return false
		var origin: Vector2=h.pos
		var destination=_blink_endpoint(h,aim,300.0,float(h.r))
		if destination.distance_to(origin)<1.0: return false
		abilities.cancel_channel(h)
		h.pos=destination
		h.nav_until=0.0
		h.has_move_target=false
		h.target_id=-1
		h.cds.d=32.0
		add_visual("burst",origin,45,Color("ffe9ac"),0.35)
		add_visual("burst",h.pos,65,Color("ffe9ac"),0.45)
	else:
		heal(h,220.0+h.max_hp*0.08)
		for ally in entities:
			if ally.kind=="hero" and ally.team==h.team and ally.id!=h.id and ally.alive and ally.pos.distance_to(h.pos)<=240.0: heal(ally,150.0+h.level*10.0)
		h.summoner_haste_until=time+1.6
		h.cds.f=28.0
		add_visual("burst",h.pos,190,Color("85efbb"),0.7)
	h.recall_until=0.0
	h.windup=0.0
	return true

func _blink_endpoint(h: Dictionary,aim: Vector2,range_limit: float,radius: float) -> Vector2:
	var delta: Vector2=aim-h.pos
	if delta.length()<0.01: return h.pos
	var direction=delta.normalized()
	var travel=minf(delta.length(),range_limit)
	while travel>0:
		var point: Vector2=h.pos+direction*travel
		point=Vector2(clampf(point.x,radius,size-radius),clampf(point.y,radius,size-radius))
		if vision.is_walkable(point,radius): return point
		travel-=8.0
	return h.pos

func recall() -> bool:
	var h=hero()
	if not h.alive or h.cc_until>time: return false
	h.recall_until=time+4.0
	h.windup=0.0
	h.has_move_target=false
	h.target_id=-1
	notify("귀환 중 · 4초 / 이동 또는 피해를 받으면 취소")
	return true

func place_ward(pos: Vector2) -> bool:
	var h=hero()
	if not started or winner>=0 or not h.alive or h.ward_cd>0 or h.cc_until>time or float(h.get("charm_until",0))>time or not pos.is_finite(): return false
	var destination=_blink_endpoint(h,pos,450.0,12.0)
	if not vision.is_walkable(destination,12.0): return false
	var own: Array=[]
	for e in entities:
		if e.kind=="ward" and e.alive and e.get("owner_id",-1)==h.id: own.append(e)
	own.sort_custom(func(a,b):return a.id<b.id if a.born_at==b.born_at else a.born_at<b.born_at)
	while own.size()>=2:
		own.pop_front().alive=false
	spawn_unit("ward",h.team,destination,{"name":"빛의 와드","r":12.0,"hp":60.0,"max_hp":60.0,"speed":0.0,"damage":0.0,"vision_range":480.0,"expires_at":time+50.0,"owner_id":h.id})
	h.ward_cd=22.0
	h.recall_until=0.0
	add_visual("ring",destination,85,Color("79d9ed"),0.45)
	vision.force_refresh()
	return true

func _update_protection() -> void:
	for e in entities:
		if not STRUCTURES.has(e.kind): continue
		var protected=false
		if e.kind=="tower" and e.get("tier","")=="inner":
			for other in entities:
				if other.kind=="tower" and other.team==e.team and other.lane==e.lane and other.get("tier","")=="outer" and other.alive: protected=true
		elif e.kind=="inhibitor":
			for other in entities:
				if other.kind=="tower" and other.team==e.team and other.lane==e.lane and other.alive: protected=true
		elif e.kind=="nexus" or (e.kind=="tower" and e.get("tier","")=="base"):
			protected=true
			for other in entities:
				if other.kind=="inhibitor" and other.team==e.team and not other.alive: protected=false
			if e.kind=="nexus":
				for other in entities:
					if other.kind=="tower" and other.team==e.team and other.get("tier","")=="base" and other.alive: protected=true
		e.protected=protected

func can_shop(h: Dictionary={}) -> bool:
	if h.is_empty(): h=hero()
	return not h.alive or h.pos.distance_to(bases[h.team])<=180.0

func shop_quote(id: String) -> Dictionary:
	return _quote(hero(),id)

func _quote(h: Dictionary,id: String) -> Dictionary:
	if not item_defs.has(id): return {"ok":false,"reason":"알 수 없는 아이템"}
	var d: Dictionary=item_defs[id]
	var owned: Array=h.inventory.duplicate()
	var consumed: Array=[]
	var cost=int(d.cost)
	for component in d.components:
		var index=owned.find(component)
		if index>=0:
			owned.remove_at(index)
			consumed.append(component)
			cost-=int(item_defs[component].cost)
		else:
			# Recursive component discounts: an owned lower component also counts.
			var parts=_consume_recipe_parts(component,owned)
			for part in parts:
				consumed.append(part)
				cost-=int(item_defs[part].cost)
	cost=maxi(0,cost)
	var reason=""
	if not can_shop(h): reason="기지 또는 사망 상태에서 구매 가능"
	elif h.gold<cost: reason="골드 부족"
	elif owned.size()>=6: reason="인벤토리 공간 부족"
	if d.has("uniqueGroup"):
		for existing in owned:
			if item_defs[existing].get("uniqueGroup","")==d.uniqueGroup: reason="동일 고유 효과 아이템 보유"
	return {"ok":reason.is_empty(),"cost":cost,"consumed":consumed,"reason":reason,"id":id}

func _consume_recipe_parts(id: String,owned: Array) -> Array:
	var found: Array=[]
	if not item_defs.has(id): return found
	for component in item_defs[id].components:
		var index=owned.find(component)
		if index>=0: owned.remove_at(index); found.append(component)
		else: found.append_array(_consume_recipe_parts(component,owned))
	return found

func buy_item(id: String) -> bool:
	var ok=_buy(hero(),id)
	if not ok: notify(str(_quote(hero(),id).get("reason","구매 불가")))
	return ok

func _buy(h: Dictionary,id: String) -> bool:
	var quote=_quote(h,id)
	if not quote.get("ok",false): return false
	for component in quote.consumed: h.inventory.erase(component)
	h.inventory.append(id)
	h.gold-=int(quote.cost)
	recalculate(h)
	return true

func sell_item(index: int) -> bool:
	var h=hero()
	if not can_shop(h) or index<0 or index>=h.inventory.size(): return false
	var id=h.inventory[index]
	h.inventory.remove_at(index)
	h.gold+=int(item_defs[id].sell)
	recalculate(h)
	return true

func _ai_buy(h: Dictionary) -> void:
	var mage = h.key in ["Ahri","Lux","Soraka"]
	var tank = h.key in ["Leona","Garen","Darius"]
	var build = ["lol_1001","lol_1052","lol_3108","lol_1058","lol_3089","lol_1028"] if mage else (["lol_1001","lol_1028","lol_1011","lol_1029","lol_1031","lol_1036"] if tank else ["lol_1001","lol_1036","lol_1053","lol_1042","lol_3006","lol_1038","lol_1018","lol_3031"])
	var index=int(h.build_index)
	if index<build.size() and _buy(h,build[index]): h.build_index=index+1

func notify(message: String) -> void:
	events.append({"text":message,"time":time})
	if events.size()>12: events.pop_front()

func add_visual(kind: String,pos: Vector2,radius: float,color: Color,duration: float=0.35,extra: Dictionary={}) -> void:
	var v={"kind":kind,"pos":pos,"radius":radius,"color":color,"at":time,"until":time+duration}
	v.merge(extra,true)
	visuals.append(v)
	if visuals.size()>200: visuals.pop_front()

func save_game(path: String) -> Error:
	if not started or winner>=0: return ERR_UNAVAILABLE
	var state={"version":SAVE_VERSION,"source_data":"16.22.1","options":{"hero_id":hero().hero_id,"map_scale":map_scale,"difficulty":difficulty,"seed":_seed},"time":time,"tick":tick,"entities":entities,"player_id":player_id,"next_id":_next_id,"rng_state":rng.state,"wave":wave,"next_wave":_next_wave,"next_gold":_next_gold,"next_cleanup":_next_cleanup,"team_kills":team_kills,"team_buffs":team_buffs,"events":events,"visuals":visuals,"abilities":abilities.export_state(),"vision":vision.export_state()}
	# Variant encoding preserves Vector2/PackedByteArray without enabling object decoding.
	var bytes=var_to_bytes(state)
	if bytes.size()>MAX_SAVE_BYTES: return ERR_OUT_OF_MEMORY
	var temporary=path+".tmp"
	var file=FileAccess.open(temporary,FileAccess.WRITE)
	if file==null: return FileAccess.get_open_error()
	file.store_buffer(bytes)
	file.close()
	var result=DirAccess.rename_absolute(temporary,path)
	if result==OK: notify("전투 저장 완료")
	return result

func load_game(path: String) -> Error:
	_load_definitions()
	var file=FileAccess.open(path,FileAccess.READ)
	if file==null: return FileAccess.get_open_error()
	if file.get_length()>MAX_SAVE_BYTES or file.get_length()<16: return ERR_FILE_CORRUPT
	var state=bytes_to_var(file.get_buffer(file.get_length()))
	file.close()
	var validator=ABILITIES.new(self) if abilities==null else abilities
	if not _valid_save(state,validator): return ERR_FILE_CORRUPT
	# Validate in a detached world first; a rejected load must not mutate this match.
	var probe=get_script().new()
	probe.setup(state.options)
	probe.time=float(state.time)
	probe.player_id=int(state.player_id)
	probe.entities.assign(state.entities.duplicate(true))
	probe._by_id.clear()
	for e in probe.entities: probe._by_id[e.id]=e
	if not probe.vision.import_state(state.vision) or not probe.abilities.import_state(state.abilities):
		probe.dispose()
		return ERR_FILE_CORRUPT
	probe.dispose()
	dispose()
	setup(state.options)
	time=state.time
	tick=int(state.tick)
	entities.assign(state.entities)
	_by_id.clear()
	for e in entities: _by_id[int(e.id)]=e
	player_id=int(state.player_id)
	_next_id=int(state.next_id)
	rng.state=int(state.rng_state)
	wave=int(state.wave)
	_next_wave=float(state.next_wave)
	_next_gold=float(state.next_gold)
	_next_cleanup=float(state.next_cleanup)
	team_kills.assign(state.team_kills)
	team_buffs=state.team_buffs
	events.assign(state.events)
	visuals.assign(state.visuals)
	abilities.import_state(state.abilities)
	vision.import_state(state.vision)
	_update_protection()
	notify("저장한 전투를 불러왔습니다.")
	return OK

func _number_in(value,low: float,high: float) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value)>=low and float(value)<=high

func _safe_value(value,depth: int=0) -> bool:
	if depth>20: return false
	if value==null or value is bool or value is int: return true
	if value is float: return is_finite(value)
	if value is String or value is StringName: return str(value).length()<=8192
	if value is Vector2: return value.is_finite()
	if value is Color: return is_finite(value.r) and is_finite(value.g) and is_finite(value.b) and is_finite(value.a)
	if value is PackedByteArray: return value.size()<=100000
	if value is Array:
		if value.size()>8192: return false
		for item in value:
			if not _safe_value(item,depth+1): return false
		return true
	if value is Dictionary:
		if value.size()>4096: return false
		for key in value:
			if not (key is String or key is StringName or key is int) or not _safe_value(value[key],depth+1): return false
		return true
	return false

func _valid_save(state,validator) -> bool:
	if not state is Dictionary or not _safe_value(state): return false
	for key in ["version","options","time","tick","entities","player_id","next_id","rng_state","wave","next_wave","next_gold","next_cleanup","team_kills","team_buffs","events","visuals","abilities","vision"]:
		if not state.has(key): return false
	if state.version!=SAVE_VERSION or not state.options is Dictionary or not state.entities is Array or state.entities.size()>1800: return false
	if not _number_in(state.time,0,86400): return false
	for key in ["tick","player_id","next_id","rng_state","wave"]:
		if not state[key] is int: return false
	if state.tick<0 or state.player_id<1 or state.next_id<2 or state.wave<1: return false
	for key in ["next_wave","next_gold","next_cleanup"]:
		if not _number_in(state[key],0,100000): return false
	if not state.options.get("map_scale",0) in [1.0,1.5,2.0] or not hero_defs.has(state.options.get("hero_id","")): return false
	if not state.options.get("seed") is int or not state.options.get("difficulty") in ["standard","training"]: return false
	if not state.team_kills is Array or state.team_kills.size()!=2 or not state.team_buffs is Array or state.team_buffs.size()!=2: return false
	for value in state.team_kills:
		if not value is int or value<0 or value>100000: return false
	for buff in state.team_buffs:
		if not buff is Dictionary or not buff.get("dragon") is int or not _number_in(buff.dragon,0,4) or not _number_in(buff.get("boss_until"),0,100000): return false
	if not state.abilities is Dictionary or not state.vision is Dictionary: return false
	if not state.events is Array or state.events.size()>12 or not state.visuals is Array or state.visuals.size()>200: return false
	for event in state.events:
		if not event is Dictionary or not event.get("text") is String or not _number_in(event.get("time"),0,86400): return false
	for visual in state.visuals:
		if not visual is Dictionary or not visual.get("kind") is String or not visual.get("pos") is Vector2 or not visual.get("color") is Color or not _number_in(visual.get("radius"),0,10000) or not _number_in(visual.get("at"),0,100000) or not _number_in(visual.get("until"),0,100000): return false
	var ids={}
	var has_player=false
	var limit=1600.0*float(state.options.map_scale)
	for e in state.entities:
		if not e is Dictionary: return false
		for key in ["id","kind","team","pos","hp","max_hp","mp","max_mp","r","alive","damage","ap","armor","mr","speed","attack_range","attack_speed","attack_cd","windup","attack_target","target_id","move_target","has_move_target","cc_until","root_until","silence_until","slow_until","slow_factor","shield","shield_until","last_damage_at","respawn_at","protected","state","contributors","name","lane","home","facing","think_at","born_at","vision_range","gold_value","xp_value"]:
			if not e.has(key): return false
		if not e.id is int or e.id<1 or ids.has(e.id) or not e.team is int or not e.team in [0,1,2]: return false
		if not e.kind in ["hero","minion","tower","inhibitor","nexus","camp","dragon","boss","ward"] or not e.lane in ["top","mid","bot","base"]: return false
		if not e.name is String or not e.alive is bool or not e.protected is bool or not e.has_move_target is bool: return false
		if not e.pos is Vector2 or e.pos.x<0 or e.pos.y<0 or e.pos.x>limit or e.pos.y>limit: return false
		if not e.move_target is Vector2 or not e.home is Vector2: return false
		if not e.state is Dictionary or not e.contributors is Dictionary: return false
		ids[e.id]=true
		for key in ["hp","max_hp","mp","max_mp","r","damage","ap","armor","mr","speed","attack_range","attack_speed","attack_cd","windup","cc_until","root_until","silence_until","slow_until","slow_factor","shield","shield_until","last_damage_at","respawn_at","facing","think_at","born_at","vision_range","gold_value","xp_value"]:
			if not _number_in(e[key],-100000,1000000): return false
		if e.max_hp<=0 or e.hp<0 or e.hp>e.max_hp or e.r<=0 or e.max_mp<0 or e.mp<0 or e.mp>e.max_mp or e.speed<0 or e.attack_speed<=0: return false
		for key in ["attack_target","target_id"]:
			if not e[key] is int: return false
		for contributor in e.contributors:
			if not contributor is int or not _number_in(e.contributors[contributor],0,86400): return false
		if e.kind=="hero":
			for key in ["hero_id","key","role","level","xp","gold","skills","cds","skill_points","inventory","kills","deaths","assists","cs","recall_until","is_player","ward_cd","next_xp","auto_attack","attack_move","retreating","build_index","damage_dealt","resource_type","crit_chance","crit_damage_bonus","life_steal","ability_haste","base_damage","hp_regen","mp_regen","summoner_haste_until"]:
				if not e.has(key): return false
			if not hero_defs.has(e.hero_id) or e.key!=hero_defs[e.hero_id].sourceKey or e.role not in ["mid","top","jungle","bot","support"]: return false
			if not e.level is int or e.level<1 or e.level>18 or not e.inventory is Array or e.inventory.size()>6: return false
			for key in ["gold","skill_points","kills","deaths","assists","cs","build_index"]:
				if not e[key] is int or not _number_in(e[key],0,1000000): return false
			for key in ["is_player","auto_attack","attack_move","retreating"]:
				if not e[key] is bool: return false
			for key in ["xp","recall_until","ward_cd","next_xp","damage_dealt","crit_chance","crit_damage_bonus","life_steal","ability_haste","base_damage","hp_regen","mp_regen","summoner_haste_until"]:
				if not _number_in(e[key],0,100000000): return false
			for item_id in e.inventory:
				if not item_defs.has(item_id): return false
			if not e.skills is Dictionary or not e.cds is Dictionary or not validator.validate_hero_state(e): return false
			for slot in ["d","f"]:
				if not _number_in(e.cds.get(slot),0,100000): return false
			if not _number_in(e.summoner_haste_until,0,100000): return false
			for slot in SLOTS:
				if not e.skills.has(slot) or not e.cds.has(slot) or not e.skills[slot] is int or e.skills[slot]<0 or e.skills[slot]>(3 if slot=="r" else 5) or not _number_in(e.cds[slot],0,100000): return false
			if e.id==state.player_id and e.is_player and e.team==0 and e.hero_id==state.options.hero_id: has_player=true
		elif e.kind=="minion":
			if e.get("minion_kind") not in ["melee","ranged","siege","super"] or not _number_in(e.get("expires_at"),0,100000): return false
		elif e.kind=="tower":
			if e.get("tier") not in ["outer","inner","base"] or not e.get("ramp") is int or not e.get("ramp_target") is int: return false
		elif e.kind in ["camp","dragon","boss"]:
			if not e.get("camp_id") is String or not _number_in(e.get("leash"),1,5000): return false
		elif e.kind=="ward":
			if not e.get("owner_id") is int or not _number_in(e.get("expires_at"),0,100000): return false
	return has_player and int(state.next_id)>ids.keys().max()

func dispose() -> void:
	# Break RefCounted world/system ownership cycles when leaving a match.
	abilities=null
	vision=null
