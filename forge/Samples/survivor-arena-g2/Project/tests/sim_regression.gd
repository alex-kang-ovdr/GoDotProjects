extends SceneTree
var passed=0
var failed=0
var checks=[]
var Sim=load("res://scripts/arena_sim.gd")
func check(value,label):
 checks.append({"name":label,"passed":bool(value)})
 if value: passed+=1
 else:
  failed+=1
  print("FAIL ",label)
func roundtrip(s,label):
 var t=Sim.new()
 var ok=t.restore(JSON.parse_string(JSON.stringify(s.snapshot())))
 check(ok,label+" restore "+t.last_restore_error)
 return t
func _init():
 var base=Sim.new()
 for key in base.catalog.balance.weapons:
  var s=Sim.new()
  var main=key if base.catalog.balance.mainWeapons.has(key) else "kunai"
  s.start({"weapon":main},1234)
  s.director_enabled=false
  if key != main: s.apply_upgrade(key)
  if key=="destroyer":
   for input in ["droneA","droneB"]:
    for i in 5: s.apply_upgrade(input)
   check(s.apply_upgrade("E:destroyer"),"fusion")
  s.spawn_enemy("tank",Vector2(80,0))
  s.player.facing=0.0
  if key not in ["guardian","forcefield"]:
   check(s.fire(key),"fire "+key)
  for i in 20: s.step(1.0/60,Vector2.ZERO)
  roundtrip(s,key)
 for main in base.catalog.balance.mainWeapons:
  var s=Sim.new()
  s.start({"weapon":main},11)
  for i in 4: s.apply_upgrade(main)
  var passive=s.catalog.evo_pairs[main]
  check(s.apply_upgrade(passive),"passive "+main)
  check(s.eligible_evolutions().has(main),"eligible "+main)
  check(s.apply_upgrade("E:"+main),"evolve "+main)
  roundtrip(s,"evo "+main)
 for c in 3:
  var s=Sim.new()
  s.start({"chapter":c},10)
  s.director_enabled=false
  var boss=s.spawn_boss(false)
  for pattern in ["charge","shockwave","mortar","summon","laser","ice"]:
   s.boss_pattern(boss,pattern)
   for i in 20:
    s.player.invuln=99.0
    s.step(1.0/60,Vector2.ZERO)
   roundtrip(s,"boss "+pattern)
 var p=Sim.new()
 p.start({},4)
 p.gain_xp(100.0)
 check(p.state=="choice","choice")
 var q=roundtrip(p,"choice")
 check(q.draft==p.draft,"draft unchanged")
 check(q.choose(q.draft[0]),"choice apply")
 check(q.state=="choice","pending levels")
 check(not q.choose("NOPE"),"invalid token")
 p.start({},4)
 p.open_chest()
 roundtrip(p,"chest")
 check(p.choose(p.draft[0]),"chest apply")
 check(not p.choose("GOLD"),"chest duplicate")
 for i in 3:
  var s=Sim.new()
  s.start({"chapter":i,"precision":true},404+i)
  for j in 8*60:
   s.player.invuln=99
   s.step(1.0/60,Vector2.from_angle(float(j)*.002))
   if s.state in ["choice","chest"]: s.choose(s.draft[0])
  var clone=roundtrip(s,"runtime "+str(i))
  for j in 60:
   s.step(1.0/60,Vector2.RIGHT)
   clone.step(1.0/60,Vector2.RIGHT)
  check(is_equal_approx(s.elapsed,clone.elapsed),"elapsed deterministic")
  check(s.rng.state==clone.rng.state,"rng deterministic")
 # Source-driven magnitude checks: original v14 JSON is the expected baseline.
 var original=JSON.parse_string(FileAccess.get_file_as_string("res://data/runtime_balance.json"))
 for weapon in original.weapons:
  var s=Sim.new()
  s.start({},9)
  for level in 5:
   s.player.levels={weapon:level+1}
   check(is_equal_approx(s.weapon_damage(weapon),float(original.weapons[weapon].damage[level])),"source damage %s level%d"%[weapon,level+1])
  check(is_equal_approx(s.weapon_interval(weapon),float(original.weapons[weapon].cooldown)),"source cooldown "+weapon)
 var reference=JSON.parse_string(FileAccess.get_file_as_string("res://data/reference_subset.json"))
 for key in reference.maps.passives:
  for row in reference.tables.passive_levels:
   if row.passive_id==reference.maps.passives[key]:
    var s=Sim.new()
    s.player.levels={key:int(row.level)}
    check(is_equal_approx(s.passive_value(key),float(row.total_value)),"source passive %s level%d"%[key,row.level])
 var limits=Sim.new()
 limits.start({},9)
 for key in ["guardian","rocket","lightning","molotov","drill"]: limits.apply_upgrade(key)
 check(limits.owned("weapon").size()==6,"six weapon slots includes main")
 check(not limits.apply_upgrade("soccer"),"seventh active rejected")
 check(not limits.apply_upgrade("shotgun"),"unselected main rejected")
 for key in ["atk","hp","speed","cooldown","xp","magnet"]: limits.apply_upgrade(key)
 check(limits.owned("passive").size()==6,"six passive slots")
 check(not limits.apply_upgrade("armor"),"seventh passive rejected")
 var inv=Sim.new()
 inv.start({},2)
 inv.director_enabled=false
 inv.player.invuln=0.0
 check(inv.hurt(10),"first incoming hit")
 check(not inv.hurt(10),"invulnerability prevents same-frame hit")
 check(inv.stats.taken==10,"incoming actual damage stats")
 var dead=inv.spawn_enemy("grunt",Vector2(70,0))
 check(inv.damage(dead,999)==30,"overkill uses actual HP damage")
 check(inv.damage(dead,999)==0,"dead enemy not counted twice")
 check(inv.stats.kills==1,"one kill per enemy")
 var blocker=Sim.new()
 blocker.start({},8)
 blocker.director_enabled=false
 blocker.apply_upgrade("guardian")
 blocker.player.invuln=0.0
 blocker.enemy_shots.append({"id":blocker._id(),"kind":"ranged","pos":Vector2(100,0),"velocity":Vector2(-1500,0),"r":6.0,"damage":25.0,"life":2.0,"color":"#ff0000"})
 blocker.step(.1,Vector2.ZERO)
 check(blocker.stats.blocked==1 and blocker.player.hp==160,"base guardian swept bullet interception before player damage")
 var recover=Sim.new()
 recover.start({},7)
 recover.director_enabled=false
 recover.player.hp=100.0
 recover.apply_upgrade("heal")
 for i in 299: recover.step(1.0/60,Vector2.ZERO)
 check(recover.player.hp==100.0,"energy drink does not heal continuously")
 for i in 2: recover.step(1.0/60,Vector2.ZERO)
 check(is_equal_approx(recover.player.hp,101.6),"energy drink 1 percent maxHP per5s")
 var move=Sim.new()
 move.start({},7)
 move.director_enabled=false
 for i in 60: move.step(1.0/60,Vector2.UP)
 check(is_equal_approx(move.player.pos.y,-190.0),"W logical up speed190")
 for i in 60: move.step(1.0/60,Vector2.DOWN)
 check(absf(move.player.pos.y)<.001,"S logical down cancels W")
 move.pause()
 var frozen=JSON.stringify(move.snapshot())
 move.step(.1,Vector2.DOWN)
 check(JSON.stringify(move.snapshot())==frozen,"paused freezes entire simulation")
 move.resume()
 check(move.state=="playing","resume play")
 var magazine=Sim.new()
 magazine.start({"weapon":"revolver"},1)
 magazine.director_enabled=false
 magazine.spawn_enemy("boss",Vector2(200,0))
 for i in 6: check(magazine.fire("revolver"),"revolver magazine shot%d"%i)
 check(magazine.player.ammo==0 and is_equal_approx(magazine.player.reload,1.65),"six shots enter1.65s reload")
 check(not magazine.fire("revolver"),"cannot fire while reloading")
 var victory=Sim.new()
 victory.start({},6)
 var last=victory.spawn_boss(true)
 victory.damage(last,1e9)
 check(victory.state=="won","final boss kill wins")
 var reward=JSON.stringify(victory.snapshot())
 victory.finish(true)
 check(JSON.stringify(victory.snapshot())==reward,"settlement idempotent")
 var corrupt=Sim.new()
 corrupt.start({},9)
 var corrupt_state=corrupt.snapshot()
 corrupt_state.player.levels.kunai=99
 var previous=JSON.stringify(corrupt.snapshot())
 check(not corrupt.restore(corrupt_state),"reject invalid level")
 check(JSON.stringify(corrupt.snapshot())==previous,"invalid restore leaves instance unchanged")
 for duration in [300,900]:
  var schedule=Sim.new()
  schedule.start({"duration":duration},99)
  schedule.elapsed=duration*(.5 if duration==300 else 1.0/3)-.01
  schedule.step(1.0/60,Vector2.ZERO)
  check(schedule.stage_events.has("mid1"),"timeline first mid %d"%duration)
  # G2 has one active boss encounter: defeat it and finish recovery before
  # testing the next scheduled deadline. Deferred overlap is covered separately.
  schedule.damage(schedule.active_boss(),1e9)
  for i in 126: schedule.step(1.0/60,Vector2.ZERO)
  if duration==900:
   schedule.elapsed=600-.01
   schedule.step(1.0/60,Vector2.ZERO)
   check(schedule.stage_events.has("mid2"),"15min second mid600")
   schedule.damage(schedule.active_boss(),1e9)
   for i in 126: schedule.step(1.0/60,Vector2.ZERO)
  schedule.elapsed=duration-.01
  schedule.step(1.0/60,Vector2.ZERO)
  check(schedule.stage_events.has("final"),"timeline final %d"%duration)
  check(schedule.state=="playing","clock alone cannot win %d"%duration)
  check(schedule.enemies.size()==1 and schedule.enemies[0].role=="final","final clears ordinary enemies %d"%duration)
 var missions=Sim.new()
 missions.start({},44)
 missions.stats.kills=150
 missions.stats.chests=2
 missions.stats.evolutions=1
 missions._check_missions()
 check(missions.player.gold==185,"v14 mission rewards45+50+90")
 missions._check_missions()
 check(missions.player.gold==185,"mission rewards once")
 roundtrip(missions,"mission ledger")
 var sup=Sim.new()
 sup.start({},15)
 sup.elapsed=90
 sup.player.hp=80
 sup.open_chest()
 sup.choose(sup.draft[0])
 check(sup.player.hp==105 and sup.player.gold==26 and sup.player.levels.kunai==2,"v14 chest26gold25HP+upgrade at90s")
 var ordered=Sim.new()
 ordered.start({},18)
 ordered.director_enabled=false
 for key in ["rocket","guardian","droneB","droneA","molotov"]: ordered.apply_upgrade(key)
 for i in 12: ordered.spawn_enemy("tank",Vector2.from_angle(i*TAU/12)*200)
 for i in 20: ordered.step(1.0/60,Vector2.ZERO)
 var replay=roundtrip(ordered,"multiple weapon order")
 check(replay.owned("weapon")==ordered.owned("weapon"),"JSON preserves weapon acquisition/fire order")
 for i in 240:
  ordered.step(1.0/60,Vector2.RIGHT)
  replay.step(1.0/60,Vector2.RIGHT)
 check(ordered.rng.state==replay.rng.state,"multiweapon continuation RNG stable")
 check(ordered.stats.kills==replay.stats.kills and is_equal_approx(ordered.stats.damage,replay.stats.damage),"multiweapon continuation damage/kills stable")
 var report={"engine":Engine.get_version_info().string,"suite":"Godot pure simulation regression","passed":passed,"failed":failed,"checks":checks,"note":"Temporary invulnerability is used only in weapon/boss construction checks to isolate their behavior; this is not a natural gameplay balance test."}
 var file=FileAccess.open("res://tests/sim_regression_report.json",FileAccess.WRITE)
 if file: file.store_string(JSON.stringify(report,"  "))
 print("COMBAT CHECKS ",passed," passed ",failed," failed")
 quit(1 if failed else 0)
