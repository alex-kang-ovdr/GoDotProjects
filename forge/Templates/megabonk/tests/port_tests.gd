# Native Godot tests; the original JavaScript is a frozen oracle only.
# Run: godot --headless --path . --script tests/port_tests.gd
extends SceneTree

const Simulation = preload("res://scripts/simulation.gd")
const Terrain = preload("res://scripts/terrain.gd")
const RandomSource = preload("res://scripts/deterministic_random.gd")
const DataSource = preload("res://scripts/data.gd")
const Meta = preload("res://scripts/meta.gd")
var results: Array = []
var diagnostics: Array = []
var compared_values := 0
var data: Dictionary
var reference: Dictionary
var start_ms := 0

func _init():
	call_deferred("run")

func _check(ok: bool, name: String, details = null):
	var r = {"name":name,"passed":ok}
	if details != null: r["details"] = details
	results.append(r)
	print(("PASS " if ok else "FAIL ") + name)
	if not ok and details != null: print(JSON.stringify(details))
	return ok

func _compare(expected, actual, path: String, differences: Array):
	compared_values += 1
	if differences.size() >= 12: return
	if typeof(expected) == TYPE_DICTIONARY:
		if typeof(actual) != TYPE_DICTIONARY:
			differences.append({"path":path,"expected_type":"Dictionary","actual_type":type_string(typeof(actual))}); return
		for key in expected:
			if not actual.has(key): differences.append({"path":path+"."+str(key),"missing":true})
			else: _compare(expected[key],actual[key],path+"."+str(key),differences)
	elif typeof(expected) == TYPE_ARRAY:
		if typeof(actual) != TYPE_ARRAY:
			differences.append({"path":path,"expected_type":"Array","actual_type":type_string(typeof(actual))}); return
		if expected.size() != actual.size(): differences.append({"path":path,"expected_length":expected.size(),"actual_length":actual.size()})
		for i in range(min(expected.size(),actual.size())): _compare(expected[i],actual[i],path+"["+str(i)+"]",differences)
	elif typeof(expected) in [TYPE_INT,TYPE_FLOAT]:
		if not typeof(actual) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(actual)) or abs(float(expected)-float(actual)) > 0.000001+abs(float(expected))*0.0000001:
			differences.append({"path":path,"expected":expected,"actual":actual})
	elif expected != actual:
		differences.append({"path":path,"expected":expected,"actual":actual})

func _match(expected, actual, name: String):
	var differences: Array = []
	_compare(expected,actual,name,differences)
	return _check(differences.is_empty(),name,differences if not differences.is_empty() else null)

func _new(options = {}):
	var opts = {"seed":7031,"mode":"expedition","tier":3}
	opts.merge(options,true)
	return Simulation.new(opts)

func _advance(s, seconds: float, input = {}):
	for i in range(int(ceil(seconds*60.0))): s.step(1.0/60.0,input)

func _place(s, x: float, z: float):
	s.player.merge({"x":x,"z":z,"y":s._ground(x,z),"groundHeight":s._ground(x,z),"grounded":true,"heightAboveGround":0,"vy":0,"vx":0,"vz":0},true)

func _enemy(s,x:float,z:float,hp:float=1000.0):
	var e=s._spawnEnemy("Goblin",{"x":x,"z":z})
	e.merge({"x":x,"z":z,"y":s._ground(x,z),"hp":hp,"maxHp":hp,"speed":0},true)
	s._hash.rebuild(s.enemies)
	return e

func _snapshot(s, expected: Dictionary):
	var out: Dictionary = {}
	for k in expected: out[k] = s.get(k)
	return out

func _test_data_rng_terrain():
	var original=JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-data.json"))
	_check(data.size()==original.size(),"data export count is unchanged",{"count":data.size()})
	_match(original,data,"all original exported game data")
	for row in reference.rng:
		var r=RandomSource.new(row.seed)
		var values=[]
		for i in range(row.values.size()): values.append(r.next())
		_match(row.values,values,"RNG vector "+str(row.seed))
		_check(r.state==row.state,"RNG final state "+str(row.seed))
	for row in reference.terrain:
		var values=[]
		for p in row.points:
			values.append({"x":p.x,"z":p.z,"height":Terrain.terrainHeight(p.x,p.z,row.options),"normal":Terrain.terrainNormal(p.x,p.z,row.options),"slope":Terrain.terrainSlope(p.x,p.z,row.options),"pathWeight":Terrain.terrainPathWeight(p.x,p.z,row.options)})
		var name="terrain %s seed=%s stage=%s" % [row.options.mapId,row.options.seed,row.options.stageIndex]
		_match(row.points,values,name+" samples")
		_match(row.landmarks,Terrain.terrainLandmarks(row.options),name+" landmarks")
		_match(row.structures,Terrain.terrainStructures(row.options),name+" collision structures")

func _test_initial_traces():
	for row in reference.initial:
		var s=Simulation.new(row.options)
		_match(row.state,_snapshot(s,row.state),"initial "+str(row.options))
	for row in reference.traces:
		var s=Simulation.new(row.options)
		var si=0
		for i in range(int(row.frames)):
			var input={"x":0.6 if i<120 else (0 if i<180 else -0.4),"z":-0.35 if i<180 else 0.2,"jump":i<18 or (i>=180 and i<198),"slide":i>=120 and i<180,"dash":i>=240 and i<245}
			if s.phase in ["loot","levelup"]: s.choose(0)
			s.step(1.0/60.0,input)
			if si<row.samples.size() and i+1==row.samples[si].frame:
				_match(row.samples[si].state,_snapshot(s,row.samples[si].state),"trace "+row.name+" frame="+str(i+1))
				si+=1

func _test_weapons():
	for row in reference.weapons:
		var s=_new()
		s.enemies=[];s.obstacles=[];s.projectiles=[];s.effects=[];s._zones=[];s.weapons=[]
		for point in [[1,0],[3,0],[6,0],[4,3]]: _enemy(s,point[0],point[1],10000)
		s._hash.rebuild(s.enemies);s._addWeapon(row.id);s.weapons[0].cooldown=0
		for i in range(120):
			s.time+=1.0/60.0;s._updateWeapons(1.0/60.0);s._updateProjectiles(1.0/60.0);s._updateZones(1.0/60.0);s._hash.rebuild(s.enemies)
		var enemies=[]
		for e in s.enemies: enemies.append({"x":e.x,"y":e.y,"z":e.z,"hp":e.hp,"frozen":e.frozen,"poison":e.poison,"slow":e.slow})
		var projectile_kinds=[]
		for q in s.projectiles: projectile_kinds.append(q.kind)
		var zone_kinds=[]
		for q in s._zones: zone_kinds.append(q.kind)
		_match(row,{"id":row.id,"enemies":enemies,"damageDealt":s.damageDealt,"projectileKinds":projectile_kinds,"zoneKinds":zone_kinds,"rngState":s.rng.state},"weapon parity "+row.id)

func _test_progression():
	var s=_new()
	_match([600,540,480],s.stageDurations,"expedition original stage clocks")
	var grave=_new({"mapId":"Graveyard"})
	_check(grave.stageCount==1 and grave.stageDuration==960,"Graveyard one 960-second stage")
	var quick=_new({"mode":"quick","duration":360})
	_check(abs(quick.duration-360)<0.000001 and quick.stageCount==3,"quick requested duration across three stages")
	var source_chests=s.chests.size()
	s.items.GymSauce=2;s.tomes.Damage=3;s._tomeBonuses.damageTome=0.3;s._addWeapon("Aegis")
	s.weapons[0].level=4;s.player.gold=123;s.openedChests=5;s.player.level=8;s.player.xp=3;s._recalculate()
	s.time=57;s.stageTime=57
	var build={"weapons":s.weapons.map(func(w): return {"id":w.id,"level":w.level}),"items":s.items.duplicate(true),"tomes":s.tomes.duplicate(true)}
	var boss=s._spawnBoss();s._damageEnemy(boss,1e9,{"noCrit":true,"noProc":true})
	var old_portal=s.portal.id
	_check(s.portal.state=="ready","boss defeat enables portal")
	_check(s._transitionStage(old_portal) and not s._transitionStage(old_portal),"stage transition commits once")
	_check(s.stageIndex==1 and s.stageTime==0 and s.time==57 and s.stageDuration==540,"stage-local clock resets; total time preserved")
	_check(s.player.gold==123 and s.player.level==8 and s.player.xp==3 and s.openedChests==5,"stage transition preserves run economy and XP")
	_match(build,{"weapons":s.weapons.map(func(w): return {"id":w.id,"level":w.level}),"items":s.items,"tomes":s.tomes},"stage transition preserves build")
	_check(s.portal.state=="dormant" and s.portal.id!=old_portal and s.chests.size()==source_chests,"stage transition generates fresh world")
	for stage in [1,2]:
		boss=s._spawnBoss()
		if stage==2: _check(boss.type=="Ent3" and boss.final,"tier3 final guardian variant")
		s._damageEnemy(boss,1e12,{"noCrit":true,"noProc":true})
		_check(s._transitionStage(s.portal.id),"portal advances stage "+str(stage+1))
	_check(s.phase=="won" and s.result.stageNumber==3 and not s._finish(true,"duplicate"),"third portal wins exactly once")
	var victories=0
	for e in s.drainEvents():
		if e.type=="victory": victories+=1
	_check(victories==1,"single terminal victory event")
	var swarm=_new();swarm.enemies=[];swarm.stageTime=swarm.stageDuration;swarm.time=swarm.stageDuration
	swarm._updateDirector(1)
	_check(swarm.finalSwarm and swarm.stageState=="swarm" and not swarm.bossSpawned and swarm.phase=="playing","expedition timeout starts final swarm without automatic victory")

func _test_choices_chests():
	var s=_new({"mode":"quick","tier":1})
	s.grantXP(s.player.xpNext);s.step(1.0/60.0)
	_check(s.phase=="levelup" and s.player.level==2 and s.offers.size()==3,"XP opens three-choice level transaction")
	var before=s.time
	var enemy_before=s.enemies.duplicate(true)
	s.step(1,{"x":1,"jump":true})
	_check(s.time==before and s.enemies==enemy_before,"choice screen freezes combat")
	for i in range(3): _check(s.reroll(),"reroll charge "+str(i+1))
	_check(s.rerolls==0 and not s.reroll(),"reroll exhaustion enforced")
	_check(s.choose(0) and not s.choose(0),"upgrade choice commits exactly once")
	var chest=s.chests[0];_place(s,chest.x,chest.z);s.player.gold=29
	_check(not s.openChest(chest.id) and s.player.gold==29 and not chest.opened,"unaffordable chest transaction unchanged")
	s.player.gold=100
	_check(s.openChest(chest.id) and s.player.gold==70 and chest.opened and s.phase=="loot","chest charges original first price")
	_check(not s.openChest(chest.id) and s.player.gold==70,"duplicate chest input cannot charge twice")
	_check(s.choose(0) and not s.choose(0),"chest item granted once")
	var items_count=0
	for v in s.items.values(): items_count+=v
	_check(items_count==1,"chest offers grant one item")
	for pair in [[0,30],[1,72],[3,159],[5,256],[10,569],[11,952]]:
		s.openedChests=pair[0];_check(s._chestCost()==pair[1],"restored chest price at count "+str(pair[0]))
	var slots=_new({"meta":{"weaponSlots":2,"tomeSlots":2,"rerolls":0}})
	for id in data.WEAPONS: slots._addWeapon(id)
	_check(slots.weapons.size()==2 and slots.rerolls==0,"meta capacity constrains actual inventory")
	slots.tomes={"Damage":1,"Health":1}
	var constrained=true
	for i in range(20):
		for offer in slots._levelOffers():
			if offer.kind=="weapon":
				var found=false
				for w in slots.weapons:
					if w.id==offer.targetId: found=true
				constrained=constrained and found
			else: constrained=constrained and slots.tomes.has(offer.targetId)
	_check(constrained,"full slots restrict upgrade offer pool")

func _test_shrines():
	var s=_new();s.enemies=[];s.obstacles=[];s._hash.rebuild([])
	var charge={};var greed={};var combat={}
	for shrine in s.shrines:
		if shrine.kind=="charge": charge=shrine
		elif shrine.kind=="greed": greed=shrine
		elif shrine.kind=="combat": combat=shrine
	if not _check(not charge.is_empty() and not greed.is_empty() and not combat.is_empty(),"all three shrine kinds generated"): return
	_place(s,charge.x,charge.z)
	_check(s._activateShrine(charge.id),"charge shrine begins")
	s._updateShrines(3);var progress=charge.progress
	_place(s,charge.x+9,charge.z);s._updateShrines(5)
	_check(charge.progress==progress,"charge shrine stops outside radius")
	_place(s,charge.x,charge.z);s._updateShrines(5)
	_check(charge.state=="ready" and s._activateShrine(charge.id),"charge shrine completes after accumulated eight seconds")
	var valid=s.phase=="loot" and s.offers.size()==3
	for o in s.offers: valid=valid and o.kind=="stat" and abs(o.value-o.amount*o.factor)<0.000001
	_check(valid,"charge shrine grants source stat choices")
	_check(not s._activateShrine(charge.id) and s.choose(0) and not s.choose(0),"shrine reward claimed once")
	_check(s.tomes.size()==0 and s.weapons.size()==1 and s._shrineBonuses.size()==1 and charge.used,"shrine bonus does not use a weapon or Tome slot")
	_place(s,greed.x,greed.z);var gold=s.player.gold
	_check(s._activateShrine(greed.id) and s.player.gold-gold==3 and abs(s.difficulty-0.05)<0.000001 and not s._activateShrine(greed.id),"greed shrine gives ten-percent chest gold and five-percent difficulty once")
	_place(s,combat.x,combat.z)
	_check(s._activateShrine(combat.id),"combat shrine begins")
	var target={}
	for e in s.enemies:
		if e.id==combat.enemyIds[0]: target=e
	if not _check(not target.is_empty(),"combat shrine spawns enemy"): return
	var ordinary=s._spawnEnemy(target.type,{"x":target.x+3,"z":target.z})
	_check(abs(target.maxHp/ordinary.maxHp-7)<0.000001,"combat shrine sevenfold HP")
	var chests=s.chests.size();s._killEnemy(target);s._updateShrines(0.1);s._updateShrines(0.1)
	_check(s.chests.size()==chests+1 and s.chests.back().free,"combat shrine creates one free reward chest")

func _test_damage_movement_passives():
	var s=_new();var e=s.enemies[0];var kills=s.kills
	s._damageEnemy(e,1e6,{"noCrit":true,"proc":0});s._damageEnemy(e,1e6,{"noCrit":true,"proc":0});s._killEnemy(e)
	_check(s.kills==kills+1,"enemy kill credit is idempotent")
	s.player.evasion=0;s.player.invulnerable=0;s._damagePlayer(1e8);s._damagePlayer(1e8)
	_check(s.phase=="dead" and s.player.hp==0 and not s._finish(true,"late"),"fatal damage commits defeat and rejects late victory")
	var motion=_new();motion.enemies=[];motion.obstacles=[];motion._hash.rebuild([])
	_advance(motion,0.3,{"x":1})
	_check(motion.player.vx>0 and motion.player.vx<motion.player.speed and motion.player.x<motion.player.speed*0.3,"movement acceleration matches source")
	var old_x=motion.player.x;_advance(motion,0.2,{"slide":true})
	_check(motion.player.sliding and motion.player.x>old_x,"slide preserves ground momentum")
	_place(motion,0,0);_advance(motion,0.3,{"jump":true})
	_check(not motion.player.grounded and motion.player.y>motion.player.groundHeight+1.25,"jump is above absolute terrain ground")
	motion.player.evasion=0;motion.player.invulnerable=0
	_check(not motion._damagePlayer(10,{"contact":true}) and motion._damagePlayer(10,{"contact":false}),"jump avoids low contact but not all damage")
	var paused=_new();var time=paused.time
	_check(paused.pause(),"pause opens")
	paused.step(1,{"x":1});_check(paused.time==time and paused.resume(),"paused time frozen and resumable")
	var bush=_new({"characterId":"Bush"});bush.enemies=[];bush.obstacles=[]
	var marked=_enemy(bush,3,0);var adjacent=_enemy(bush,4,0)
	marked.markedUntil=30;adjacent.markedUntil=30
	bush._damageEnemy(marked,10,{"noCrit":true,"proc":0})
	_check(marked.hp==980 and marked.markedUntil==0 and adjacent.hp==990 and adjacent.markedUntil==30,"Bush mark explosion does not recursively consume adjacent mark")
	var noelle=_new({"characterId":"Noelle"});noelle.enemies=[]
	var cold=_enemy(noelle,2,0);cold.frozen=1;noelle._updatePassives(0.1)
	_check(abs(noelle.player.conditionalDamage-1.015)<0.000001,"Noelle frozen target damage passive")
	cold.frozen=0;noelle._updatePassives(0.1)
	_check(noelle.player.conditionalDamage==1,"conditional passive recomputes without accumulation")
	var amog=_new({"characterId":"Amog"});amog.enemies=[];amog.obstacles=[];amog.player.level=6;amog._recalculate();amog.player.duration=2
	var dying=_enemy(amog,2,0);var near=_enemy(amog,3,0);var far=_enemy(amog,20,0)
	dying.poison=1;dying.poisonDamage=3;amog._killEnemy(dying)
	_check(near.poisonStacks==2 and near.poison==8 and far.poison==0 and not amog._killEnemy(dying),"Amog poison death spread keeps radius, duration and single commit")

func _test_meta():
	for row in reference.meta:
		var p=Meta.normalizeMeta(row.input.duplicate(true))
		_match(row.normalized,p,"meta normalization "+str(row.input))
		_match(row.expedition,Meta.runMeta(p,"expedition"),"meta expedition "+str(row.input))
		_match(row.quick,Meta.runMeta(p,"quick"),"meta quick "+str(row.input))
		_check(row.silverWon==Meta.calculateSilver({"phase":"won","stageCount":3,"stageIndex":2,"time":360,"kills":1000},p),"victory silver formula "+str(row.input))
		_check(row.silverDead==Meta.calculateSilver({"phase":"dead","stageCount":3,"stageIndex":1,"time":145,"kills":201},p),"defeat silver formula "+str(row.input))
	var weapon_def={}
	for d in data.META_UPGRADES:
		if d.id=="Weapons": weapon_def=d
	var p=Meta.normalizeMeta({"silver":weapon_def.costs[0]})
	_check(Meta.purchaseUpgrade(p,"Weapons").ok and p.silver==0 and Meta.runMeta(p,"expedition").weaponSlots==3,"shop purchase deducts original cost and changes slots")
	_check(not Meta.purchaseUpgrade(p,"Weapons").ok,"shop insufficient funds rejects purchase")
	p.silver=100000;p.upgrades.Weapons=weapon_def.maxLevel
	_check(not Meta.purchaseUpgrade(p,"Weapons").ok and p.silver==100000,"shop max level rejects duplicate charge")
	_check(not Meta.purchaseUpgrade(p,"not-an-id").ok and not Meta.purchaseUpgrade(p,"Banish").ok,"unsupported upgrades remain unavailable")

func run():
	start_ms=Time.get_ticks_msec()
	data=DataSource.get_data()
	reference=JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-parity.json"))
	_test_data_rng_terrain()
	_test_initial_traces()
	_test_weapons()
	_test_progression()
	_test_choices_chests()
	_test_shrines()
	_test_damage_movement_passives()
	_test_meta()
	var failed=0
	for r in results:
		if not r.passed: failed+=1
	var report={"engine":Engine.get_version_info().string,"display":DisplayServer.get_name(),"native_gdscript":true,"source":reference.source,"command":"godot --headless --path . --script tests/port_tests.gd","passed":results.size()-failed,"failed":failed,"checks":results.size(),"compared_values":compared_values,"elapsed_ms":Time.get_ticks_msec()-start_ms,"numeric_tolerance":"absolute 1e-6 + abs(expected)*1e-7; dictionary optional absent keys ignored only when absent from JS fixture","results":results,"scope":{"original_exported_data":true,"rng_vectors":reference.rng.size(),"terrain_configurations":18,"terrain_samples":162,"character_initial_states":15,"extra_map_initial_states":2,"fixed_step_traces":3,"trace_frames_each":300,"trace_snapshots":21,"weapon_probes":16,"progression":"portal traversal to stage 3 victory using controlled boss damage","gameplay":"XP choices, rerolls, chest, three shrine types, movement, jump, damage, selected passives, shop","rendered_gui":false,"human_full_run":false}}
	var file=FileAccess.open("res://validation/parity-results.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	print("PORT_TEST_RESULT ",JSON.stringify({"checks":results.size(),"passed":results.size()-failed,"failed":failed,"compared_values":compared_values,"elapsed_ms":report.elapsed_ms}))
	quit(0 if failed==0 else 1)
