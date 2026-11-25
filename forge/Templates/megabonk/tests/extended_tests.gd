# Sustained ordinary-play and passive/item regressions against unchanged web v2.
extends "res://tests/port_tests.gd"

class FixedRandom:
	extends RefCounted
	var value=0.0
	func _init(v=0.0): value=v
	func next(): return value
	func range(a,b): return a+(b-a)*value
	func pick(array): return array[mini(array.size()-1,int(floor(value*array.size())))]

func _offer_score(s,offer):
	if offer.kind=="weapon":
		var fresh=true
		for w in s.weapons:
			if w.id==offer.targetId: fresh=false
		return {"LightningStaff":12,"Aura":11,"FireStaff":10,"Aegis":9,"Sword":8,"Frostwalker":7}.get(offer.targetId,4)+(3 if fresh else 0)
	return {"Damage":15,"Cooldown":13,"Health":11,"Regeneration":10,"Armor":9,"Precision":8}.get(offer.targetId,5)

func _hypot(x,z): return sqrt(x*x+z*z)

func _ordinary(row):
	var s=_new({"seed":row.seed,"characterId":"SirOofie","meta":{"weaponSlots":2,"tomeSlots":2,"rerolls":0}})
	var first_level=null
	var min_health=s.player.hp
	var max_enemies=s.enemies.size()
	var steps=0
	var samples=[]
	while s.time<50 and s.phase!="dead" and steps<2000:
		if s.phase in ["levelup","loot"]:
			var best=0
			var score=-INF
			for i in range(s.offers.size()):
				var candidate=_offer_score(s,s.offers[i])
				if candidate>score: score=candidate;best=i
			s.choose(best)
			continue
		var p=s.player
		var live=[]
		var nearest=null
		var nearest_d=INF
		for e in s.enemies:
			if e.dead: continue
			live.append(e)
			var distance=_hypot(e.x-p.x,e.z-p.z)
			if distance<nearest_d: nearest=e;nearest_d=distance
		var gem=null
		var gem_d=INF
		for g in s.xpGems:
			var distance=_hypot(g.x-p.x,g.z-p.z)
			if distance<gem_d: gem=g;gem_d=distance
		var dx=0.0
		var dz=0.0
		if gem!=null and gem_d<16: dx=gem.x-p.x;dz=gem.z-p.z
		elif nearest!=null and nearest_d>3.2: dx=nearest.x-p.x;dz=nearest.z-p.z
		var norm=_hypot(dx,dz)
		if norm>1: dx/=norm;dz/=norm
		for e in live:
			var x=p.x-e.x
			var z=p.z-e.z
			var distance=_hypot(x,z)
			if distance>0.01 and distance<2.2:
				var strength=(2.2-distance)*1.7
				dx+=x/distance*strength;dz+=z/distance*strength
		s.step(1.0/30.0,{"x":dx,"z":dz,"jump":nearest!=null and nearest_d<1.6 and steps%45<8,"dash":nearest!=null and nearest_d<1.2 and p.hp<p.maxHp*0.4 and steps%100==0})
		steps+=1
		if p.level>1 and first_level==null: first_level=s.time
		min_health=min(min_health,p.hp);max_enemies=max(max_enemies,s.enemies.size())
		if steps%300==0: samples.append({"steps":steps,"time":s.time,"phase":s.phase,"level":p.level,"kills":s.kills,"health":p.hp,"damageDealt":s.damageDealt,"rngState":s.rng.state})
	var actual={"seed":row.seed,"steps":steps,"time":s.time,"phase":s.phase,"level":s.player.level,"kills":s.kills,"firstLevelAt":first_level,"health":s.player.hp,"maxHealth":s.player.maxHp,"minHealth":min_health,"maxEnemies":max_enemies,"weaponSlots":s.maxWeaponSlots,"tomeSlots":s.maxTomeSlots,"rerolls":s.rerolls,"weapons":s.weapons.map(func(w): return {"id":w.id,"level":w.level}),"tomes":s.tomes,"samples":samples,"invariant":"No test-only invulnerability or combat/economy overrides"}
	_match(row,actual,"ordinary 50-second parity seed="+str(row.seed))
	_check(s.time>=50 and s.phase!="dead" and s.player.level>=3 and s.weapons.size()<=2 and s.tomes.size()<=2 and s.rerolls==0,"ordinary survival and slot constraints seed="+str(row.seed))
	return actual

func _passive_snapshot(s):
	var enemies=[]
	for e in s.enemies:
		var selected={}
		for key in ["type","x","y","z","hp","markedUntil","frozen","poison","poisonStacks"]:
			if e.has(key): selected[key]=e[key]
		enemies.append(selected)
	return {"player":s.player.duplicate(true),"passiveState":s._passiveState.duplicate(true),"enemies":enemies}

func _all_passives_and_items(ref):
	for row in ref.passives:
		var s=_new({"characterId":row.id});s.enemies=[];s.obstacles=[]
		var a=_enemy(s,2,0);var b=_enemy(s,4,0);a.frozen=1;b.frozen=2
		s.player.level=11;s.player.gold=250000;s._recalculate();s.player.hp=s.player.maxHp*0.4;s.player.vx=5;s.player.vz=1;s.player.grounded=false;s._updatePassives(10.25)
		_match(row.active,_passive_snapshot(s),"character passive active "+row.id)
		s.player.grounded=true;s.player.vx=0;s.player.vz=0;s.player.gold=0
		for e in s.enemies: e.frozen=0
		s._updatePassives(0.5)
		_match(row.reset,_passive_snapshot(s),"character passive reset "+row.id)
	for row in ref.items:
		var s=_new();s.items={row.id:2};s.player.level=11;s._recalculate()
		_match(row.first,s.player,"item stacked stats "+row.id)
		s._recalculate()
		_match(row.second,s.player,"item recomputation "+row.id)

func _focused_passives(ref):
	var ninja=_new({"characterId":"Ninja"});ninja.enemies=[];ninja.obstacles=[];ninja.items={"BossBuster":10,"TacticalGlasses":10};ninja._recalculate();ninja.player.evasion=100;ninja.rng=FixedRandom.new(0)
	var normal=_enemy(ninja,1,0);ninja._damagePlayer(10,{"contact":true,"enemyId":normal.id})
	var protected_enemy=ninja._spawnEnemy("GhostPurple",{"x":1,"z":0});protected_enemy.hp=1000;protected_enemy.maxHp=1000;ninja.player.invulnerable=0;ninja._damagePlayer(10,{"contact":true,"enemyId":protected_enemy.id})
	_match(ref.ninja,{"normalDead":normal.dead,"protectedHp":protected_enemy.hp,"protectedDead":protected_enemy.dead},"Ninja dodge executes normal and fixed two-percent protected counter")
	var calcium=_new({"characterId":"Calcium"});calcium.enemies=[];calcium.player.vx=5
	for i in range(10): calcium._updatePassives(1)
	_match(ref.calcium.before,{"state":calcium._passiveState,"player":calcium.player},"Calcium ten-second movement ramp")
	calcium.player.vx=0;calcium._updatePassives(5)
	_match(ref.calcium.stopped,calcium._passiveState,"Calcium stationary ramp retention")
	calcium._passiveState.speedBoost=1.5;calcium.player.evasion=0
	for i in range(4): calcium.player.invulnerable=0;calcium._damagePlayer(1)
	_match(ref.calcium.after,calcium._passiveState,"Calcium four-hit bounded ramp loss")
	var flex=_new({"characterId":"Megachad"});flex.enemies=[];flex.player.evasion=0;flex._damagePlayer(5)
	_match(ref.flex.first,{"state":flex._passiveState,"player":flex.player},"Flex first hit activation")
	flex.player.invulnerable=0;flex._damagePlayer(5)
	_match(ref.flex.second,{"state":flex._passiveState,"player":flex.player},"Flex cooldown prevents repeated stack")
	var proc=_new()
	for row in ref.procs:
		proc.rng=FixedRandom.new(row.roll)
		_check(proc._procSuccesses(data.ITEMS[row.id].proc,row.count,row.coefficient)==row.result,"proc curve "+row.id+" roll="+str(row.roll))

func run():
	start_ms=Time.get_ticks_msec()
	data=DataSource.get_data()
	var ref=JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-extended.json"))
	var samples=[]
	for row in ref.ordinary: samples.append(_ordinary(row))
	_all_passives_and_items(ref)
	_focused_passives(ref.focused)
	var failed=0
	for r in results:
		if not r.passed: failed+=1
	var report={"engine":Engine.get_version_info().string,"display":DisplayServer.get_name(),"native_gdscript":true,"command":"godot --headless --path . --script tests/extended_tests.gd","passed":results.size()-failed,"failed":failed,"checks":results.size(),"compared_values":compared_values,"elapsed_ms":Time.get_ticks_msec()-start_ms,"results":results,"ordinary_samples":samples,"scope":{"ordinary_policy_runs":3,"ordinary_seconds_each":50,"combat_economy_overrides_in_ordinary":false,"passive_characters":15,"item_stat_probes":24,"focused":"Ninja, Calcium, Flex, poison/freeze/lightning proc thresholds","input":"programmatic policy; not a human win-rate estimate","rendered_gui":false}}
	var file=FileAccess.open("res://validation/extended-results.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	print("EXTENDED_TEST_RESULT ",JSON.stringify({"checks":results.size(),"passed":results.size()-failed,"failed":failed,"elapsed_ms":report.elapsed_ms}))
	quit(0 if failed==0 else 1)
