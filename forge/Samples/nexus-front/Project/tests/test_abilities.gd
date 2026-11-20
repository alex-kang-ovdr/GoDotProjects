extends RefCounted
const WORLD = preload("res://scripts/sim_world.gd")
var passed: int = 0
var failed: int = 0
var failures: Array[String] = []
var worlds: Array = []

func check(value: bool, label: String):
 if value: passed += 1
 else:
  failed += 1
  failures.append(label)
  push_error(label)

func fixture(id: String = "lol_ahri"):
 var w = WORLD.new()
 w.setup({"hero_id":id,"difficulty":"training","seed":19})
 worlds.append(w)
 w.entities.clear()
 w._by_id.clear()
 w.map.obstacles.clear()
 w.map.brushes.clear()
 w.map.highGrounds.clear()
 var h = w.add_hero(id,0,Vector2(700,700),true)
 h.level = 6
 h.skills = {"q":1,"w":1,"e":1,"r":1}
 h.max_hp = 4000.0
 h.hp = 4000.0
 h.max_mp = 10000.0
 h.mp = 10000.0
 var t = w.add_hero("lol_garen",1,Vector2(850,700))
 t.hp = 10000.0
 t.max_hp = 10000.0
 t.armor = 0.0
 t.mr = 0.0
 var a = w.add_hero("lol_ashe",0,Vector2(730,730))
 a.hp = 200.0
 a.max_hp = 1000.0
 w.vision.force_refresh()
 return {"w":w,"h":h,"t":t,"a":a}

func advance(w, duration: float):
 var remaining = duration
 while remaining>0.00001:
  var dt = minf(1.0/60.0,remaining)
  w.time += dt
  for h in w.entities:
   if h.kind=="hero":
    for slot in ["q","w","e","r"]: h.cds[slot] = maxf(0,h.cds[slot]-dt)
  w.abilities.step(dt)
  remaining -= dt

func basic(w,h,t):
 var payload = w.abilities.basic_attack(h,t)
 var amount = w.damage(t,payload.damage,h,payload.kind)
 w.abilities.on_basic_hit(h,t,amount)

func run() -> Dictionary:
 passed=0
 failed=0
 failures.clear()
 # Every playable QWER must enter a distinct executable branch.
 for id in ["lol_ahri","lol_ashe","lol_garen","lol_lux","lol_leesin","lol_jhin","lol_darius","lol_ezreal","lol_leona","lol_soraka"]:
  var f = fixture(id)
  for slot in ["q","w","e","r"]:
   f.h.state.stacks=4 if id=="lol_ashe" else 0
   f.h.mp=10000.0
   f.h.cds[slot]=0.0
   var aim: Vector2 = f.t.pos
   var target_id: int = f.t.id
   if slot=="w" and id in ["lol_soraka","lol_leesin"]:
    aim=f.a.pos
    target_id=f.a.id
   check(f.w.abilities.cast(f.h,slot,aim,target_id),id+" "+slot+" executable")
   var info=f.w.abilities.describe(f.h,slot)
   var raw: Dictionary=f.w.hero_defs[id].skills[slot]
   check(info.cooldown==float(raw.cooldownByRank[0]),id+" "+slot+" pinned cooldown")
  check(f.w.abilities.import_state(f.w.abilities.export_state()),id+" active ability snapshot round trip")
  check(f.w.abilities.validate_hero_state(f.h),id+" active hero state valid")
 var f=fixture("lol_soraka")
 f.a.hp=f.a.max_hp
 var hp=f.h.hp
 var mana=f.h.mp
 var count=f.h.state.casts
 check(not f.w.abilities.cast(f.h,"w",Vector2.INF),"Soraka automatic W has no target at full ally HP")
 check(f.h.hp==hp and f.h.mp==mana and f.h.cds.w==0 and f.h.state.casts==count,"Soraka invalid W is full no-op")
 check(not f.w.abilities.cast(f.h,"w",f.t.pos,f.t.id),"Soraka W rejects enemy")
 f.a.hp=200.0
 check(f.w.abilities.cast(f.h,"w",Vector2.INF),"Soraka automatic W selects injured ally")
 check(f.a.hp>200 and is_equal_approx(f.h.hp,hp-f.h.max_hp*0.1),"Soraka W healing and health cost")
 f=fixture("lol_soraka")
 f.h.hp=2000.0
 check(f.w.abilities.cast(f.h,"q",f.t.pos),"Soraka Q launch")
 advance(f.w,0.6)
 check(f.h.state.rejuvenation_until>f.w.time,"Soraka Q hero hit grants rejuvenation")
 hp=f.h.hp
 f.w.abilities.cast(f.h,"w",f.a.pos,f.a.id)
 check(is_equal_approx(f.h.hp,hp-f.h.max_hp*0.02),"Soraka rejuvenation discounts W health cost")
 check(not f.w.abilities.own_effect(f.h,"rejuvenation",f.a.id).is_empty(),"Soraka transfers rejuvenation to ally")
 f.w.abilities.cast(f.h,"e",f.t.pos)
 advance(f.w,0.1)
 check(f.t.silence_until>f.w.time,"Soraka zone silences while inside")
 advance(f.w,1.5)
 check(f.t.root_until>f.w.time,"Soraka zone roots on expiration")
 f=fixture("lol_darius")
 f.t.pos=f.h.pos+Vector2(180,0)
 f.h.hp=2000.0
 f.w.abilities.cast(f.h,"q",f.t.pos)
 advance(f.w,0.65)
 check(f.t.hp<10000 and f.h.hp>2000,"Darius blade Q damages and heals")
 check(f.w.abilities.own_effect(f.h,"darius_bleed",f.t.id).get("stacks",0)==1,"Darius blade Q applies bleed")
 f=fixture("lol_darius")
 f.t.pos=f.h.pos+Vector2(60,0)
 f.h.hp=2000.0
 f.w.abilities.cast(f.h,"q",f.t.pos)
 advance(f.w,0.65)
 check(f.t.hp<10000 and f.h.hp==2000,"Darius inner Q does not heal")
 check(f.w.abilities.own_effect(f.h,"darius_bleed",f.t.id).is_empty(),"Darius inner Q does not bleed")
 for i in range(5): basic(f.w,f.h,f.t)
 check(f.w.abilities.own_effect(f.h,"darius_bleed",f.t.id).stacks==5,"Darius five independent basic hits stack bleed")
 check(f.h.state.buff_until>f.w.time,"Darius five stacks grant Noxian Might")
 f.t.hp=1.0
 f.w.vision.force_refresh()
 f.w.abilities.cast(f.h,"r",f.t.pos,f.t.id)
 check(not f.t.alive and f.h.cds.r==0,"Darius execution kill resets R")
 f=fixture("lol_darius")
 f.w.abilities.cast(f.h,"e",f.t.pos)
 check(f.t.pos.distance_to(f.h.pos)<100 and f.t.cc_until>f.w.time,"Darius E cone pulls and interrupts")
 f=fixture("lol_ezreal")
 f.h.mp=5000.0
 f.w.abilities.cast(f.h,"w",f.t.pos)
 advance(f.w,0.25)
 check(not f.w.abilities.own_effect(f.h,"ezreal_mark",f.t.id).is_empty() and f.t.hp==10000,"Ezreal W marks without impact damage")
 mana=f.h.mp
 f.h.cds.e=8.0
 f.w.abilities.cast(f.h,"q",f.t.pos)
 advance(f.w,0.25)
 check(f.w.abilities.own_effect(f.h,"ezreal_mark",f.t.id).is_empty(),"Ezreal Q detonates own W")
 check(f.h.mp>mana,"Ezreal spell detonation refunds resource")
 check(f.h.cds.e<6.5,"Ezreal actual Q hit reduces other cooldown")
 check(f.w.abilities.attack_speed_multiplier(f.h)>1,"Ezreal spell hits grant attack speed")
 f=fixture("lol_ezreal")
 f.w.abilities.cast(f.h,"w",f.t.pos)
 advance(f.w,0.25)
 mana=f.h.mp
 basic(f.w,f.h,f.t)
 check(f.h.mp==mana,"Ezreal basic W detonation has no mana refund")
 f=fixture("lol_ezreal")
 var old_pos: Vector2=f.h.pos
 f.w.abilities.cast(f.h,"e",f.h.pos+Vector2(200,0))
 check(f.h.pos.distance_to(old_pos)>150,"Ezreal E blink changes position")
 f=fixture("lol_leona")
 f.w.abilities.cast(f.h,"q",f.t.pos)
 basic(f.w,f.h,f.t)
 check(f.t.cc_until>f.w.time and not f.w.abilities.own_effect(f.h,"leona_sunlight",f.t.id).is_empty(),"Leona Q stun and sunlight")
 hp=f.t.hp
 f.w.damage(f.t,10,f.h,"physical")
 check(is_equal_approx(f.t.hp,hp-10),"Leona cannot consume her own sunlight")
 hp=f.t.hp
 f.w.damage(f.t,10,f.a,"physical")
 check(f.t.hp<hp-10 and f.w.abilities.own_effect(f.h,"leona_sunlight",f.t.id).is_empty(),"Allied hero consumes Leona sunlight exactly once")
 f=fixture("lol_leona")
 f.w.abilities.cast(f.h,"w",f.h.pos)
 check(f.w.abilities.defense_bonus(f.h)>0,"Leona W grants temporary armor/MR hook")
 advance(f.w,3.05)
 check(f.t.hp<10000 and f.h.state.guard_until>f.w.time+2.5 and f.w.abilities.defense_bonus(f.h)>0,"Leona W hit extends defense")
 f=fixture("lol_leona")
 f.w.abilities.cast(f.h,"r",f.t.pos)
 advance(f.w,0.7)
 check(f.t.cc_until>f.w.time,"Leona R center stuns")
 f=fixture("lol_ahri")
 f.w.abilities.cast(f.h,"q",f.t.pos)
 advance(f.w,0.3)
 hp=f.t.hp
 advance(f.w,1.2)
 check(f.t.hp<hp,"Ahri Q return applies second true-damage hit")
 f=fixture("lol_ahri")
 f.w.abilities.cast(f.h,"r",f.h.pos+Vector2(90,0))
 advance(f.w,0.75)
 check(f.w.abilities.cast(f.h,"r",f.h.pos+Vector2(90,0)),"Ahri R allows recast while normal cooldown active")
 f=fixture("lol_ashe")
 check(not f.w.abilities.cast(f.h,"q",f.t.pos),"Ashe Q rejects below four stacks")
 for i in range(4): basic(f.w,f.h,f.t)
 check(f.h.state.stacks==4 and f.w.abilities.cast(f.h,"q",f.t.pos),"Ashe four basics enable Q")
 check(f.w.abilities.attack_speed_multiplier(f.h)>1,"Ashe Q attack speed buff")
 f=fixture("lol_lux")
 var t2=f.w.add_hero("lol_garen",1,Vector2(930,700))
 var t3=f.w.add_hero("lol_garen",1,Vector2(1000,700))
 f.w.abilities.cast(f.h,"q",Vector2(1100,700))
 advance(f.w,0.6)
 check(f.t.root_until>f.w.time and t2.root_until>f.w.time and t3.root_until==0,"Lux Q collides with exactly first two targets")
 f=fixture("lol_lux")
 f.w.abilities.cast(f.h,"e",f.t.pos)
 advance(f.w,0.3)
 mana=f.h.mp
 check(f.w.abilities.cast(f.h,"e",f.t.pos) and f.h.mp==mana and f.t.hp<10000,"Lux E recast detonates without second resource cost")
 f=fixture("lol_leesin")
 f.w.abilities.cast(f.h,"q",f.t.pos)
 advance(f.w,0.4)
 mana=f.h.mp
 check(f.w.abilities.cast(f.h,"q",f.t.pos,f.t.id),"Lee Sin Q mark permits second cast")
 check(is_equal_approx(f.h.mp,mana-30) and f.h.pos.distance_to(f.t.pos)<50,"Lee Sin Q2 energy and dash")
 f=fixture("lol_jhin")
 for i in range(4): basic(f.w,f.h,f.t)
 check(f.h.state.ammo==0 and not f.w.abilities.can_attack(f.h),"Jhin four bullets enforce reload")
 advance(f.w,2.6)
 check(f.h.state.ammo==4 and f.w.abilities.can_attack(f.h),"Jhin reload restores magazine")
 f=fixture("lol_jhin")
 f.w.abilities.cast(f.h,"r",f.t.pos)
 check(not f.w.abilities.can_attack(f.h),"Jhin R channel blocks basics")
 advance(f.w,0.45)
 check(f.w.abilities.cast(f.h,"r",f.t.pos),"Jhin R fires recast bullet")
 f.w.abilities.cancel_channel(f.h)
 check(f.h.state.channel_until==0,"Jhin channel cancellation clears state")
 f=fixture("lol_garen")
 f.w.abilities.cast(f.h,"w",f.h.pos)
 check(is_equal_approx(f.w.abilities.damage_multiplier(f.h),0.7),"Garen W damage reduction")
 f.w.abilities.cast(f.h,"e",f.t.pos)
 advance(f.w,1)
 check(f.t.hp<10000 and not f.w.abilities.can_attack(f.h),"Garen E periodically hits and blocks basics")
 f=fixture("lol_ahri")
 f.h.skills.q=0
 check(not f.w.abilities.cast(f.h,"q",f.t.pos),"Unlearned ability cannot cast")
 f.h.skills.q=1
 f.h.mp=0
 check(not f.w.abilities.cast(f.h,"q",f.t.pos),"Insufficient resource cannot cast")
 f.h.mp=1000
 f.h.silence_until=2
 check(not f.w.abilities.cast(f.h,"q",f.t.pos),"Silence blocks ability")
 f=fixture("lol_darius")
 f.t.pos=Vector2(1500,1500)
 f.w.vision.force_refresh()
 check(not f.w.abilities.cast(f.h,"r",f.t.pos,f.t.id),"Targeted execution rejects hidden out-of-range enemy")
 f=fixture("lol_ahri")
 f.h.hp=2000.0
 f.w.abilities.cast(f.h,"r",f.h.pos+Vector2(80,0))
 var charges=f.h.state.recasts.r.remaining
 f.w.abilities.on_takedown(f.h,f.t)
 check(f.h.hp>2000 and f.h.state.recasts.r.remaining>charges,"Ahri takedown/assist heals and adds R charge")
 f=fixture("lol_lux")
 f.w.abilities.cast(f.h,"w",f.h.pos+Vector2(500,0))
 var initial_shield=f.h.shield
 advance(f.w,1.8)
 check(f.h.shield>initial_shield,"Lux returning W stacks shield")
 f=fixture("lol_ahri")
 f.w.abilities.cast(f.h,"e",f.t.pos)
 advance(f.w,0.25)
 var charmed_pos: Vector2=f.t.pos
 advance(f.w,0.2)
 check(f.t.pos.distance_to(f.h.pos)<charmed_pos.distance_to(f.h.pos),"Ahri charm forces movement toward caster")
 var saved=f.w.abilities.export_state()
 check(f.w.abilities.import_state(saved),"Valid native ability snapshot loads")
 saved={"projectiles":[{"kind":"ahri_e"}],"effects":[],"next_id":10}
 check(not f.w.abilities.import_state(saved),"Malformed projectile snapshot rejected")
 saved={"projectiles":[],"effects":[{"kind":"lux_zone"}],"next_id":10}
 check(not f.w.abilities.import_state(saved),"Malformed effect snapshot rejected")
 check(f.w.abilities.validate_hero_state(f.h),"Valid hero mechanics state accepted")
 f.h.state.ammo=-4
 check(not f.w.abilities.validate_hero_state(f.h),"Invalid hero ammo state rejected")
 for w in worlds: w.dispose()
 worlds.clear()
 return {"passed":passed,"failed":failed,"failures":failures}
