extends SceneTree
## Natural-stat automated controller. No HP, damage, clock, or RNG manipulation.
## Choices and movement are bot decisions, not a human usability assessment.
var Sim = preload("res://scripts/arena_sim.gd")
var runs: Array = []
var started = Time.get_ticks_msec()

func pick(sim) -> String:
 var best = str(sim.draft[0])
 var best_score = -10000.0
 for value in sim.draft:
  var token = str(value)
  var score = 0.0
  if token.begins_with("E:"): score = 200.0
  elif token == "GOLD": score = 0.0
  elif token == sim.config.weapon: score = 100.0 + int(sim.player.levels.get(token,0)) * 2
  else:
   var level = int(sim.player.levels.get(token,0))
   var preferences = {"guardian":64,"rocket":62,"lightning":66,"forcefield":45,"droneA":58,"droneB":57,"molotov":51,"drill":54,"soccer":40,"brick":30,"boomerang":25,"atk":63,"cooldown":68,"xp":61,"hp":38,"heal":36,"magnet":42,"range":35,"duration":34,"projectile":20,"gold":10,"speed":25,"armor":32}
   score = float(preferences.get(token,0)) + (9.0 if level > 0 else 0.0)
   for weapon in sim.catalog.evo_pairs:
    if sim.catalog.evo_pairs[weapon] == token and int(sim.player.levels.get(weapon,0)) == 5 and level == 0:
     score += 80.0
   if float(sim.player.hp) < float(sim.player.max_hp)*0.35 and token == "hp": score += 70.0
  if score > best_score:
   best_score=score
   best=token
 return best

func direction(sim) -> Vector2:
 var pos: Vector2 = sim.player.pos
 var target = pos + Vector2.from_angle(sim.elapsed * 0.04) * 200.0
 var score_best = INF
 for gem in sim.gems:
  var distance = pos.distance_to(gem.pos)
  var score = distance
  if gem.type == "chest": score -= 140.0
  elif gem.type == "heal" and sim.player.hp < sim.player.max_hp * .8: score -= 100.0
  elif gem.type == "magnet": score -= 80.0
  elif gem.type != "xp": score += 150.0
  if score < score_best:
   score_best=score
   target=gem.pos
 for enemy in sim.enemies:
  if enemy.type=="boss" and enemy.role=="final" and float(enemy.hp)>0:
   var away=(pos-Vector2(enemy.pos)).normalized()
   if away.length_squared()<.1: away=Vector2.RIGHT
   target=enemy.pos+away*150.0
   break
 var wanted=(target-pos).normalized()
 var best_direction=wanted
 var best_cost=INF
 var near_enemies=[]
 for enemy in sim.enemies:
  if float(enemy.hp)>0 and pos.distance_squared_to(enemy.pos)<500.0*500.0:
   near_enemies.append(enemy)
 var speed = float(sim.catalog.balance.baseMoveSpeed)*(1+sim.passive_value("speed"))
 for i in 24:
  var candidate = Vector2.from_angle(i*TAU/24.0)
  var proposed = pos+candidate*speed*.45
  var cost = proposed.distance_to(target)*.4 - candidate.dot(wanted)*7.0
  for enemy in near_enemies:
   var predicted: Vector2 = enemy.pos + (pos-Vector2(enemy.pos)).normalized()*float(enemy.speed)*.3
   var distance=proposed.distance_to(predicted)-float(enemy.r)-16.0
   if distance<0: cost+=1800.0-distance*15.0
   elif distance<70.0: cost+=pow(70.0-distance,2.0)*.025
  for bullet in sim.enemy_shots:
   var future: Vector2=bullet.pos+bullet.velocity*.3
   var distance=sim.segment_distance(proposed,bullet.pos,future)
   if distance<40: cost+=(40-distance)*20.0
  for threat in sim.threats:
   if float(threat.delay)>.9: continue
   var distance=proposed.distance_to(threat.pos)-float(threat.r)
   if threat.shape=="line": distance=sim.segment_distance(proposed,threat.pos,threat.pos2)-float(threat.width)/2
   if distance<35: cost+=(35-distance)*35.0
  if cost<best_cost:
   best_cost=cost
   best_direction=candidate
 return best_direction

func _init() -> void:
 var samples=[{"chapter":0,"weapon":"kunai","seed":103},{"chapter":0,"weapon":"revolver","seed":208},{"chapter":1,"weapon":"kunai","seed":311},{"chapter":2,"weapon":"kunai","seed":417}]
 for sample in samples:
  var sim=Sim.new()
  sim.start({"chapter":sample.chapter,"weapon":sample.weapon,"duration":300},sample.seed)
  var movement=Vector2.ZERO
  var frames=0
  var peak_enemies=0
  var peak_shots=0
  var selections=[]
  var checkpoints=[]
  while sim.elapsed<420.0 and sim.state not in ["won","lost"]:
   if sim.state in ["choice","chest"]:
    var token=pick(sim)
    selections.append({"at":snapped(sim.elapsed,.1),"token":token})
    if not sim.choose(token):
     push_error("Bot selected invalid token")
     quit(1)
     return
   if frames%10==0: movement=direction(sim)
   sim.step(1.0/60.0,movement)
   frames+=1
   peak_enemies=maxi(peak_enemies,sim.enemies.size())
   peak_shots=maxi(peak_shots,sim.shots.size())
   if frames%1800==0:
    checkpoints.append({"time":snapped(sim.elapsed,.1),"hp":snapped(sim.player.hp,.1),"level":sim.player.lv,"kills":sim.stats.kills,"enemies":sim.enemies.size()})
  var report={"seed":sample.seed,"chapter":sample.chapter,"weapon":sample.weapon,"outcome":sim.state if sim.state in ["won","lost"] else "time_limit","elapsed":snapped(sim.elapsed,.01),"level":sim.player.lv,"hp":snapped(sim.player.hp,.01),"kills":sim.stats.kills,"damage":snapped(sim.stats.damage,.1),"damage_taken":snapped(sim.stats.taken,.1),"evolutions":sim.stats.evolutions,"levels":sim.player.levels,"evolved":sim.player.evolved,"peak_enemies":peak_enemies,"peak_shots":peak_shots,"choices":selections,"checkpoints":checkpoints}
  runs.append(report)
  var checkpoint_file=FileAccess.open("res://tests/balance_probe_report.json",FileAccess.WRITE)
  if checkpoint_file:
   checkpoint_file.store_string(JSON.stringify({"status":"in_progress","runs":runs},"  "))
   checkpoint_file.flush()
   checkpoint_file.close()
  print("NATURAL BOT ",JSON.stringify({"seed":sample.seed,"chapter":sample.chapter,"weapon":sample.weapon,"outcome":report.outcome,"elapsed":report.elapsed,"level":report.level,"kills":report.kills,"evolutions":report.evolutions}))
 var data={"release":"G2","source_sim_sha256":FileAccess.get_sha256("res://scripts/arena_sim.gd"),"engine":Engine.get_version_info().string,"physics_hz":60,"wall_seconds":(Time.get_ticks_msec()-started)/1000.0,"runs":runs,"limits":"Automated movement and build choices. Default HP, damage, cooldowns, drops, RNG, G2 encounter timing and difficulty; no invulnerability, extra skills or time skips. 420-second observation cap includes time after final boss spawn. Same controller and seeds as G1 for comparison. Results do not establish human balance or GPU performance."}
 var file=FileAccess.open("res://tests/balance_probe_report.json",FileAccess.WRITE)
 if file: file.store_string(JSON.stringify(data,"  "))
 print("BALANCE COMPLETE ",runs.size()," natural runs; wall seconds ",data.wall_seconds)
 quit(0)
