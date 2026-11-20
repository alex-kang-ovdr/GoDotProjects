extends RefCounted
const WORLD = preload("res://scripts/sim_world.gd")
var passed: int = 0
var failed: int = 0
var failures: Array[String] = []

func check(condition: bool, label: String) -> void:
	if condition: passed += 1
	else: failed += 1; failures.append(label); push_error(label)

func make(hero_id: String="lol_ahri", scale: float=1.0):
	var w=WORLD.new()
	w.setup({"hero_id":hero_id,"map_scale":scale,"seed":12345})
	return w

func run() -> Dictionary:
	passed=0; failed=0; failures.clear()
	_test_setup()
	_test_combat()
	_test_progression()
	_test_shop()
	_test_structure_chain()
	_test_respawn_and_orders()
	_test_summoners_and_wards()
	_test_save()
	_test_match_simulation()
	return {"passed":passed,"failed":failed,"failures":failures}

func _test_setup() -> void:
	for scale in [1.0,1.5,2.0]:
		var w=make("lol_soraka",scale)
		check(w.size==1600.0*scale,"world size %s" % scale)
		check(w.entities.filter(func(e):return e.kind=="hero").size()==10,"10 heroes %s" % scale)
		check(w.entities.filter(func(e):return e.kind=="minion").size()==30,"first wave 30 minions %s" % scale)
		check(w.entities.filter(func(e):return e.kind=="tower").size()==16,"16 towers %s" % scale)
		check(w.hero().role=="support" and w.hero().lane=="bot","selected hero role %s" % scale)
		check(w.hero().max_hp==605 and w.hero().level==1,"official Soraka stats %s" % scale)
		check(w.bases[0]==Vector2(165,1435)*scale,"base coordinate scaling %s" % scale)
		w.dispose()
	var training=WORLD.new()
	training.setup({"hero_id":"lol_ezreal","difficulty":"training"})
	check(training.hero().level==6 and training.hero().gold==2500 and training.hero().skills.r==1,"training explicit early ultimate")
	training.dispose()

func _test_combat() -> void:
	var w=make("lol_garen")
	var h=w.hero()
	var dummy=w.spawn_unit("minion",1,h.pos+Vector2(55,0),{"hp":1000.0,"max_hp":1000.0,"armor":100.0,"mr":50.0})
	check(is_equal_approx(w.damage(dummy,100,h,"physical"),50),"armor mitigation")
	check(is_equal_approx(w.damage(dummy,90,h,"magic"),60),"magic resistance mitigation")
	check(is_equal_approx(w.damage(dummy,30,h,"true"),30),"true damage")
	w.give_shield(dummy,40,3)
	check(w.damage(dummy,50,h,"true")==10 and dummy.shield==0,"shield absorbs before health")
	var before=dummy.hp
	w._attack(h,dummy,0.1)
	check(h.windup>0 and dummy.hp==before,"basic attack windup does not deal immediate damage")
	w.command_move(h.pos+Vector2(0,80))
	check(h.windup==0 and dummy.hp==before,"movement cancels unlaunched basic attack")
	h.attack_cd=0
	w.stop_player()
	w._attack(h,dummy,0.1)
	for i in 5: w._attack(h,dummy,0.1)
	check(dummy.hp<before,"attack lands after windup")
	w.apply_cc(h,2)
	var position=h.pos
	w.move_unit(h,position+Vector2(100,0),0.1)
	check(h.pos==position,"stun prevents movement")
	h.cc_until=0
	h.pos=Vector2(1000,1400)
	dummy.pos=h.pos+Vector2(h.attack_range+dummy.r+18,0)
	w.command_move(h.pos+Vector2(300,0),true)
	position=h.pos
	w._tick_hero(h,0.1)
	check(h.pos.x>position.x,"attack-move closes small gap outside basic attack range")
	w.dispose()

func _test_progression() -> void:
	var w=make()
	var h=w.hero()
	h.skill_points=10
	check(not w.upgrade_skill("r"),"ultimate locked before level6")
	check(not w.upgrade_skill("q"),"Q rank2 requires level3")
	w.gain_xp(h,110)
	check(h.level==2 and h.skill_points==11 and h.max_hp>w.hero_defs[h.hero_id].hp,"XP level and stat growth")
	check(w.upgrade_skill("w"),"level2 unlocks W")
	h.level=6
	check(w.upgrade_skill("r"),"level6 R rank1")
	check(not w.upgrade_skill("r"),"R rank2 locked before11")
	h.level=11
	check(w.upgrade_skill("r"),"level11 R rank2")
	h.level=16
	check(w.upgrade_skill("r"),"level16 R rank3")
	check(not w.upgrade_skill("r"),"R rank cap")
	h.level=3
	h.skills={"q":1,"w":0,"e":0,"r":0}
	h.skill_points=2
	w._auto_upgrade(h); w._auto_upgrade(h)
	check(h.skills.w==1 and h.skills.e==1,"AI learns W and E by level3 before maximizing Q")
	w.dispose()

func _test_shop() -> void:
	var w=make("lol_ashe")
	var h=w.hero()
	h.gold=10000
	check(not w.buy_item("lol_1036"),"shop blocked outside base")
	h.pos=w.bases[0]
	check(w.buy_item("lol_1001"),"buy basic boots")
	check(w.buy_item("lol_1042") and w.buy_item("lol_1042"),"buy duplicate recipe daggers")
	var quote=w.shop_quote("lol_3006")
	check(quote.cost==300 and quote.consumed.size()==3,"recipe discounts duplicate components exactly once")
	var gold=h.gold
	check(w.buy_item("lol_3006") and h.gold==gold-300 and h.inventory==["lol_3006"],"recipe consumes inputs and charges only remainder")
	check(not w.buy_item("lol_1001"),"boots unique group")
	check(h.speed>w.hero_defs[h.hero_id].speed and h.attack_speed>w.hero_defs[h.hero_id].attackSpeed,"items affect movement and attacks")
	gold=h.gold
	check(w.sell_item(0) and h.inventory.is_empty() and h.gold==gold+770,"sell restores inventory and awards official sell price")
	h.inventory=["lol_1036","lol_1036","lol_1036","lol_1036","lol_1036","lol_1036"]
	check(not w.buy_item("lol_1052"),"six-slot inventory limit")
	check(w.buy_item("lol_1053") and h.inventory.size()==6,"combine at six slots")
	w.dispose()

func _test_structure_chain() -> void:
	var w=make()
	var h=w.hero()
	var outer: Dictionary={}
	var inner: Dictionary={}
	var inhibitor: Dictionary={}
	var nexus: Dictionary={}
	var base_towers: Array=[]
	for e in w.entities:
		if e.team!=1: continue
		if e.kind=="tower" and e.lane=="mid" and e.tier=="outer": outer=e
		if e.kind=="tower" and e.lane=="mid" and e.tier=="inner": inner=e
		if e.kind=="inhibitor" and e.lane=="mid": inhibitor=e
		if e.kind=="nexus": nexus=e
		if e.kind=="tower" and e.tier=="base": base_towers.append(e)
	check(not outer.protected and inner.protected and inhibitor.protected and nexus.protected,"structure initial dependency chain")
	check(w.damage(nexus,100000,h,"true")==0 and nexus.alive,"protected Nexus immune")
	w.damage(outer,100000,h,"true")
	check(not outer.alive and not inner.protected and inhibitor.protected,"outer destruction unlocks only same-lane inner")
	w.damage(inner,100000,h,"true")
	check(not inhibitor.protected,"inner destruction unlocks inhibitor")
	w.damage(inhibitor,100000,h,"true")
	check(not base_towers[0].protected and nexus.protected,"inhibitor opens base towers")
	w._spawn_wave()
	check(w.entities.any(func(e):return e.kind=="minion" and e.team==0 and e.lane=="mid" and e.minion_kind=="super"),"destroyed inhibitor spawns super minion")
	for tower in base_towers: w.damage(tower,100000,h,"true")
	check(not nexus.protected,"both base towers unlock Nexus")
	w.damage(nexus,100000,h,"true")
	check(w.winner==0 and not nexus.alive,"Nexus destruction wins match")
	var at=w.time
	w.step(0.1)
	check(w.time==at,"finished match stops simulation")
	w.dispose()

func _test_respawn_and_orders() -> void:
	var w=make()
	var h=w.hero()
	check(w.recall() and h.recall_until==4,"recall channel begins")
	w.command_move(h.pos+Vector2(50,0))
	check(h.recall_until==0,"move cancels recall")
	w.recall()
	var enemy=w.add_hero("lol_ashe",1,h.pos+Vector2(100,0))
	w.damage(h,10,enemy,"true")
	check(h.recall_until==0,"damage cancels recall")
	var ward_pos=h.pos+Vector2(10,0)
	check(w.place_ward(ward_pos),"ward placement succeeds")
	check(not w.place_ward(ward_pos),"ward cooldown enforced")
	w.damage(h,10000,enemy,"true")
	check(not h.alive and h.deaths==1 and w.team_kills[1]==1 and h.respawn_at>w.time,"hero death schedules respawn and score")
	w.time=h.respawn_at
	w._respawn(h)
	check(h.alive and h.hp==h.max_hp and h.pos.distance_to(w.bases[0])<100,"respawn restores at own base")
	w.dispose()

func _test_summoners_and_wards() -> void:
	var w=make("lol_garen")
	var h=w.hero()
	h.pos=Vector2(230,780)
	var resource=h.mp
	h.recall_until=5.0; h.windup=0.2
	check(not w.vision.has_line_of_sight(h.pos,Vector2(470,780)),"flash fixture crosses a wall")
	check(w.cast("d",Vector2(470,780)),"D flash crosses wall with valid landing")
	check(h.pos==Vector2(470,780) and h.cds.d==32 and h.mp==resource,"D distance cooldown and zero resource cost")
	check(h.recall_until==0 and h.windup==0,"D cancels recall and windup")
	var at=h.pos
	check(not w.cast("d",at+Vector2(100,0)) and h.pos==at,"D cooldown no-op")
	h.cds.d=0
	h.root_until=5
	h.recall_until=3
	check(not w.cast("d",at+Vector2(100,0)) and h.recall_until==3 and h.cds.d==0,"D root rejection is transactional")
	h.root_until=0; h.cc_until=5
	check(not w.cast("d",at+Vector2(100,0)),"D blocked by stun")
	h.cc_until=0; h.charm_until=5
	check(not w.cast("d",at+Vector2(100,0)),"D blocked by charm")
	h.charm_until=0
	check(not w.cast("d",Vector2(NAN,0)) and h.cds.d==0,"D invalid aim no-op")
	check(w.cast("d",at+Vector2(1000,0)) and h.pos.distance_to(at)<=300.01,"D range capped300")
	h.hp=h.max_hp-400
	h.cc_until=5
	var ally=w.add_hero("lol_soraka",0,h.pos+Vector2(100,0))
	var far_ally=w.add_hero("lol_soraka",0,h.pos+Vector2(280,0))
	ally.hp-=300;far_ally.hp-=300
	var before=h.hp
	var ally_before=ally.hp
	var far_before=far_ally.hp
	check(w.cast("f",Vector2.INF),"F healing allowed while stunned")
	check(is_equal_approx(h.hp-before,220.0+h.max_hp*0.08),"F self heal220+8percent maxHP")
	check(is_equal_approx(ally.hp-ally_before,160.0) and far_ally.hp==far_before,"F allies in240 range only")
	check(h.cds.f==28 and h.summoner_haste_until==w.time+1.6 and h.mp==resource,"F cooldown28 haste1.6 zero resource")
	check(not w.cast("f",h.pos),"F cooldown enforced")
	w.step(0.1)
	check(is_equal_approx(h.cds.d,31.9) and is_equal_approx(h.cds.f,27.9),"D/F cooldown advances in simulation time")
	h.cc_until=0;h.recall_until=0;h.charm_until=0
	check(w.place_ward(h.pos+Vector2(0,400)),"ward reaches400 within450 range")
	var wards=w.entities.filter(func(e):return e.kind=="ward" and e.alive and e.owner_id==h.id)
	check(wards.size()==1 and h.ward_cd==22 and is_equal_approx(wards[0].expires_at,w.time+50),"ward22cooldown50lifetime")
	check(wards[0].hp==60 and wards[0].vision_range==480,"ward60HP480vision")
	var first_id=wards[0].id
	h.ward_cd=0;w.place_ward(h.pos+Vector2(0,50))
	h.ward_cd=0;w.place_ward(h.pos+Vector2(50,0))
	wards=w.entities.filter(func(e):return e.kind=="ward" and e.alive and e.owner_id==h.id)
	check(wards.size()==2 and not w.unit(first_id).alive,"third ward removes oldest owner ward")
	h.alive=false;h.cds.d=0;h.cds.f=0;h.ward_cd=0
	check(not w.cast("d",at) and not w.cast("f",at) and not w.place_ward(at),"summoners and ward require living player")
	w.dispose()

func _test_save() -> void:
	var w=make("lol_lux",1.5)
	var h=w.hero()
	h.skills.e=1
	h.mp=1000
	h.max_mp=1000
	w.cast("e",h.pos+Vector2(120,-60))
	for i in 4: w.step(0.1)
	var path="user://test_world_roundtrip.nfs"
	check(w.save_game(path)==OK,"native checkpoint writes")
	var restored=WORLD.new()
	check(restored.load_game(path)==OK,"native checkpoint reads")
	check(restored.map_scale==1.5 and restored.hero().hero_id=="lol_lux" and is_equal_approx(restored.time,w.time),"checkpoint restores map hero and game time")
	check(restored.entities.size()==w.entities.size() and restored.hero().pos==h.pos,"checkpoint restores entities and positions")
	check(restored.abilities.next_id==w.abilities.next_id and restored.abilities.effects.size()==w.abilities.effects.size(),"checkpoint preserves effect IDs and active effects")
	check(restored.rng.state==w.rng.state,"checkpoint preserves RNG state")
	for i in 12: w.step(0.1); restored.step(0.1)
	check(restored.hero().pos==w.hero().pos and is_equal_approx(restored.hero().hp,w.hero().hp) and restored.rng.state==w.rng.state,"saved continuation remains deterministic")
	w.save_game(path)
	var original_state=bytes_to_var(FileAccess.get_file_as_bytes(path))
	var bad=original_state.duplicate(true)
	bad.team_buffs[0].dragon="invalid"
	var stream=FileAccess.open(path,FileAccess.WRITE)
	stream.store_buffer(var_to_bytes(bad)); stream.close()
	var preserved_time=restored.time
	check(restored.load_game(path)==ERR_FILE_CORRUPT and restored.time==preserved_time,"invalid team buff rejected transactionally")
	bad=original_state.duplicate(true)
	bad.entities.filter(func(e):return e.kind=="hero")[0].state.ammo=99
	stream=FileAccess.open(path,FileAccess.WRITE)
	stream.store_buffer(var_to_bytes(bad)); stream.close()
	check(restored.load_game(path)==ERR_FILE_CORRUPT,"invalid champion passive state rejected")
	bad=original_state.duplicate(true)
	bad.abilities.next_id=0
	stream=FileAccess.open(path,FileAccess.WRITE)
	stream.store_buffer(var_to_bytes(bad)); stream.close()
	check(restored.load_game(path)==ERR_FILE_CORRUPT,"invalid ability effect sequence rejected")
	bad=original_state.duplicate(true)
	bad.entities[0].pos=Vector2(NAN,0)
	stream=FileAccess.open(path,FileAccess.WRITE)
	stream.store_buffer(var_to_bytes(bad)); stream.close()
	check(restored.load_game(path)==ERR_FILE_CORRUPT,"nonfinite position rejected")

	var original_time=restored.time
	var file=FileAccess.open(path,FileAccess.WRITE)
	file.store_buffer(var_to_bytes({"version":10}))
	file.close()
	check(restored.load_game(path)==ERR_FILE_CORRUPT and restored.time==original_time,"invalid checkpoint rejected without mutating match")
	DirAccess.remove_absolute(path)
	w.dispose(); restored.dispose()

func _test_match_simulation() -> void:
	var w=make("lol_darius")
	var initial=w.entities.size()
	for i in 240: w.step(0.1)
	check(w.time>23.9 and w.wave==2 and w.entities.size()>initial,"24-second integrated simulation spawns next wave")
	var valid=true
	for e in w.entities:
		if not e.pos.is_finite() or not is_finite(e.hp) or e.hp<0 or e.hp>e.max_hp+0.01: valid=false
	check(valid,"integrated simulation preserves health and finite positions")
	check(w.entities.any(func(e):return e.kind=="hero" and e.damage_dealt>0),"AI engages in integrated simulation")
	w.dispose()
