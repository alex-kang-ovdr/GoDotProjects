extends RefCounted
## Native reconstruction of the ten v10 champion kits. Official rank arrays are
## loaded from the pinned data; damage formulas and geometry remain authored.

const COLORS = {"Ahri": Color("e7a4e8"), "Ashe": Color("83d5f8"), "Garen": Color("e8cd84"), "Lux": Color("fff2a6"), "LeeSin": Color("ffc59e"), "Jhin": Color("d7abef"), "Darius": Color("cf7772"), "Ezreal": Color("80d4f2"), "Leona": Color("edc76c"), "Soraka": Color("a7dca4")}
const TUNING = {
 "Ahri": {"q": [40,65,90,115,140], "w": [50,75,100,125,150], "e": [80,110,140,170,200], "r": [60,90,120]},
 "Ashe": {"w": [20,35,50,65,80], "r": [200,400,600], "recharge": [90,80,70,60,50]},
 "Garen": {"q": [30,60,90,120,150], "e": [4,8,12,16,20], "r": [150,300,450]},
 "Lux": {"q": [80,120,160,200,240], "w": [40,55,70,85,100], "e": [65,115,165,215,265], "r": [300,400,500]},
 "LeeSin": {"q": [55,80,105,130,155], "w": [50,100,150,200,250], "e": [35,65,95,125,155], "r": [175,400,625]},
 "Jhin": {"q": [45,70,95,120,145], "w": [60,95,130,165,200], "e": [20,80,140,200,260], "r": [64,154,244], "recharge": [28,27,26,25,24]},
 "Darius": {"q": [50,80,110,140,170], "w": [0.4,0.45,0.5,0.55,0.6], "r": [125,250,375]},
 "Ezreal": {"q": [20,45,70,95,120], "w": [80,135,190,245,300], "e": [80,130,180,230,280], "r": [350,525,700]},
 "Leona": {"q": [10,35,60,85,110], "w": [45,80,115,150,185], "defense": [20,25,30,35,40], "e": [50,90,130,170,210], "r": [100,175,250]},
 "Soraka": {"q": [85,120,155,190,225], "w": [90,130,170,210,250], "e": [70,95,120,145,170], "r": [150,250,350], "rejuvenation": [50,65,80,95,110]}
}
var world
var projectiles: Array = []
var effects: Array = []
var next_id: int = 1

func _init(sim = null):
 world = sim

func init_hero(h: Dictionary):
 h.state = {"casts": 0, "recasts": {}, "stacks": 0, "stack_until": 0.0, "essence": 0, "ammo": 4, "reload_until": 0.0, "buff_until": 0.0, "empowered_until": 0.0, "guard_until": 0.0, "guard_factor": 1.0, "defense_bonus": 0.0, "spin_until": 0.0, "spin_next": 0.0, "spin_ticks": 0, "lifesteal_until": 0.0, "flurry_until": 0.0, "flurry_hits": 0, "charges": 2, "recharge_at": 0.0, "channel_until": 0.0, "channel_angle": 0.0, "rejuvenation_until": 0.0, "haste_until": 0.0, "last_slot": "", "last_basic": {}}

func _rank_value(values: Array, rank: int) -> float:
 if values.is_empty(): return 0.0
 return float(values[clampi(rank - 1, 0, values.size() - 1)])

func _base(h: Dictionary, slot: String) -> float:
 return _rank_value(TUNING.get(h.key, {}).get(slot, [0]), int(h.skills.get("w" if slot == "defense" else slot, 1)))

func _color(h: Dictionary) -> Color:
 return COLORS.get(h.get("key", ""), Color.CYAN)

func _recast(h: Dictionary, slot: String) -> Dictionary:
 var r: Dictionary = h.get("state", {}).get("recasts", {}).get(slot, {})
 return r if float(r.get("until", 0)) > world.time and int(r.get("remaining", 0)) > 0 else {}

func _open(h: Dictionary, slot: String, duration: float, remaining: int, extra: Dictionary = {}):
 var r = {"until": world.time + duration, "remaining": remaining, "next_at": world.time + 0.2}
 r.merge(extra, true)
 h.state.recasts[slot] = r

func _close(h: Dictionary, slot: String):
 h.state.recasts.erase(slot)

func describe(h: Dictionary, slot: String) -> Dictionary:
 if h.is_empty() or not world.hero_defs.has(h.get("hero_id", "")): return {}
 var raw: Dictionary = world.hero_defs[h.hero_id].skills.get(slot, {})
 if raw.is_empty(): return {}
 var out: Dictionary = raw.duplicate(true)
 var rank = int(h.skills.get(slot, 0))
 var r = _recast(h, slot)
 out.rank = rank
 out.cost = _rank_value(raw.get("costByRank", [raw.get("cost",0)]), maxi(1,rank))
 out.cooldown = _rank_value(raw.get("cooldownByRank", [raw.get("cooldown",0)]), maxi(1,rank)) / (1.0 + float(h.get("ability_haste",0)) / 100.0)
 out.range = float(raw.get("runtimeRangeOverride", _rank_value(raw.get("rangeByRank", [raw.get("range",200)*2]), maxi(1,rank)) * 0.5))
 # Data carries explicit runtime geometry for self AoEs / cross-map abilities.
 if raw.has("runtimeRangeOverride"): out.range = float(raw.runtimeRangeOverride)
 if h.key == "Darius" and slot == "q": out.range = 230.0
 if h.key == "Ezreal" and slot == "r": out.range = 4800.0
 out.phase = "recast" if not r.is_empty() else ("cooldown" if float(h.cds.get(slot,0)) > 0.001 else "ready")
 out.remaining = maxf(0, float(h.cds.get(slot,0)))
 out.charges = -1
 out.disabled_reason = ""
 if not r.is_empty():
  out.cost = 30.0 if h.key == "LeeSin" else 0.0
  out.remaining = maxf(0,r.until-world.time)
  out.charges = r.remaining
 if h.key in ["Ashe","Jhin"] and slot == "e":
  out.charges = h.state.charges
  if h.state.charges <= 0: out.remaining = maxf(0,h.state.recharge_at-world.time)
 if h.key == "Garen" and slot == "e" and h.state.spin_until > world.time:
  out.phase = "recast"
  out.cost = 0.0
  out.remaining = h.state.spin_until-world.time
 if h.key == "Soraka" and slot == "w": out.health_cost = h.max_hp * (0.02 if h.state.rejuvenation_until > world.time else 0.1)
 if rank <= 0: out.disabled_reason = "스킬을 먼저 배우세요"
 elif not h.alive: out.disabled_reason = "부활 대기 중"
 elif h.cc_until > world.time: out.disabled_reason = "행동 불가"
 elif h.silence_until > world.time: out.disabled_reason = "침묵 상태"
 elif h.state.channel_until > world.time and slot != "r": out.disabled_reason = "커튼 콜 시전 중"
 elif h.root_until > world.time and ((h.key == "Ahri" and slot == "r") or (h.key in ["Ezreal","Leona"] and slot == "e") or (h.key == "LeeSin" and ((slot == "q" and not r.is_empty()) or (slot == "w" and r.is_empty())))): out.disabled_reason = "속박 상태"
 elif h.mp + 0.0001 < out.cost: out.disabled_reason = "자원 부족"
 elif h.hp <= float(out.get("health_cost",0)): out.disabled_reason = "체력 부족"
 elif not r.is_empty() and world.time < r.next_at: out.disabled_reason = "재시전 준비 중"
 elif h.key in ["Ashe","Jhin"] and slot == "e" and h.state.charges <= 0: out.disabled_reason = "충전 중"
 elif h.key == "Ashe" and slot == "q" and (h.state.stacks < 4 or h.state.buff_until > world.time): out.disabled_reason = "집중 4중첩 필요"
 elif r.is_empty() and not (h.key == "Garen" and slot == "e" and h.state.spin_until > world.time) and h.cds.get(slot,0) > 0.001: out.disabled_reason = "재사용 대기 중"
 out.ready = out.disabled_reason.is_empty()
 return out

func _structure(e: Dictionary) -> bool:
 return e.get("kind","") in ["tower","inhibitor","nexus"]

func _enemies(h: Dictionary, center: Vector2, radius: float) -> Array:
 var found: Array = []
 for e in world.entities:
  if e.alive and e.team != h.team and e.kind != "ward" and not _structure(e) and e.pos.distance_to(center) <= radius + e.r:
   found.append(e)
 return found

func _pick(h: Dictionary, aim: Vector2, range_value: float, target_id: int, hero_only: bool = false) -> Dictionary:
 var best: Dictionary = {}
 var best_d = INF
 for e in world.entities:
  if not e.alive or e.team == h.team or _structure(e) or e.kind == "ward" or (hero_only and e.kind != "hero") or not world.visible_to(e,h.team): continue
  if h.pos.distance_to(e.pos) > range_value + e.r: continue
  var d: float = e.pos.distance_to(aim)
  if e.id == target_id: return e
  if d < 85 + e.r and d < best_d:
   best = e
   best_d = d
 return best

func _ally(h: Dictionary, aim: Vector2, range_value: float, target_id: int, soraka: bool = false) -> Dictionary:
 var best: Dictionary = {}
 var score = INF
 var automatic = not aim.is_finite()
 for e in world.entities:
  if not e.alive or e.team != h.team or _structure(e) or e.kind not in (["hero"] if soraka else ["hero","minion","ward"]): continue
  if soraka and e.id == h.id: continue
  if h.pos.distance_to(e.pos) > range_value + e.r: continue
  if target_id == e.id: return e
  if automatic:
   if soraka and e.hp >= e.max_hp: continue
   var ratio: float = e.hp / e.max_hp
   if ratio < score:
    score = ratio
    best = e
  elif e.pos.distance_to(aim) < 60 + e.r and e.pos.distance_to(aim) < score:
   score = e.pos.distance_to(aim)
   best = e
 return best

func _bonus_ad(h: Dictionary) -> float:
 return maxf(0, h.damage-float(h.get("base_damage",world.hero_defs[h.hero_id].damage))) + _noxian(h)

func _noxian(h: Dictionary) -> float:
 return 30.0 + (h.level-1)*10.0 if h.get("key","") == "Darius" and h.state.buff_until > world.time else 0.0

func _effect(h: Dictionary, kind: String, pos: Vector2, duration: float, extra: Dictionary = {}) -> Dictionary:
 var e = {"id": next_id, "kind": kind, "source_id": h.id, "team": h.team, "pos": pos, "origin": h.pos, "radius": 0.0, "at": world.time, "until": world.time+duration, "color": _color(h)}
 next_id += 1
 e.merge(extra,true)
 if kind in ["lux_zone","jhin_trap","soraka_zone"]: e.origin = pos
 effects.append(e)
 return e

func _projectile(h: Dictionary, kind: String, dir: Vector2, range_value: float, speed: float, radius: float, damage: float, damage_type: String, hits: int, extra: Dictionary = {}) -> Dictionary:
 var p = {"id": next_id, "kind": kind, "source_id": h.id, "team": h.team, "pos": h.pos, "prev": h.pos, "origin": h.pos, "dir": dir, "speed": speed, "radius": radius, "damage": damage, "damage_type": damage_type, "remaining": range_value, "hits_left": hits, "hit_ids": [], "life": range_value/speed+4, "travelled": 0.0, "color": _color(h), "active": true}
 next_id += 1
 p.merge(extra,true)
 projectiles.append(p)
 return p

func cast(h: Dictionary, slot: String, aim: Vector2, target_id: int = -1) -> bool:
 var info = describe(h,slot)
 if info.is_empty() or not info.ready: return false
 var automatic = not aim.is_finite()
 var r = _recast(h,slot)
 var target: Dictionary = {}
 var ally: Dictionary = h
 if h.key == "Soraka" and slot == "w":
  ally = _ally(h,aim,info.range,target_id,true)
  if ally.is_empty(): return false
 if h.key == "LeeSin" and slot == "w" and r.is_empty() and not automatic:
  ally = _ally(h,aim,info.range,target_id)
  if ally.is_empty(): return false
 if automatic:
  var focused = world.unit(int(h.get("target_id",-1)))
  aim = focused.pos if not focused.is_empty() and focused.alive and world.visible_to(focused,h.team) else h.pos + Vector2(1,-1).normalized()*info.range
 var dir: Vector2 = (aim-h.pos).normalized()
 if dir.length_squared() < 0.1: dir = Vector2.RIGHT
 var at: Vector2 = h.pos + dir * minf(h.pos.distance_to(aim),info.range)
 var angle = dir.angle()
 if (h.key in ["Garen","Darius","LeeSin"] and slot == "r") or (h.key == "Jhin" and slot == "q"):
  target = _pick(h,aim,info.range,target_id,slot=="r")
  if target.is_empty(): return false
 if h.key == "LeeSin" and slot == "q" and not r.is_empty():
  target = world.unit(int(r.get("target_id",-1)))
  if target.is_empty() or not target.alive or target.team == h.team or target.pos.distance_to(h.pos)>650: return false
 if h.key == "Jhin" and slot == "r" and not r.is_empty():
  if absf(angle_difference(float(h.state.channel_angle),angle)) > PI*0.23: return false
 # Validate the entire action before spending anything (especially Soraka W).
 h.mp = maxf(0,h.mp-info.cost)
 if h.key == "Soraka" and slot == "w": h.hp -= info.health_cost
 h.recall_until = 0.0
 h.windup = 0.0
 h.attack_target = -1
 if r.is_empty() and not (h.key == "Garen" and slot == "e" and h.state.spin_until > world.time): h.cds[slot] = info.cooldown
 h.state.casts += 1
 h.state.last_slot = slot
 h["facing"] = angle
 var ap: float = h.ap
 var rank: int = info.rank
 var bonus = _bonus_ad(h)
 var s: Dictionary = h.state
 match h.key:
  "Ahri":
   match slot:
    "q": _projectile(h,"ahri_q_out",dir,info.range,750,28,_base(h,slot)+0.5*ap,"magic",128)
    "w":
     s.haste_until = world.time+1.5
     _effect(h,"foxfire",h.pos,3,{"remaining":3,"next_at":world.time,"hits":{},"damage":_base(h,slot)+0.3*ap})
    "e": _projectile(h,"ahri_e",dir,info.range,775,27,_base(h,slot)+0.6*ap,"magic",1,{"charm":1.1+rank*0.1})
    "r":
     if r.is_empty(): _open(h,"r",15,2,{"next_at":world.time+0.7})
     else:
      r.remaining -= 1
      r.next_at = world.time+0.7
      if r.remaining <= 0: _close(h,"r")
     world.teleport(h,at,false)
     var targets = _visible_sorted(h,300)
     for i in mini(3,targets.size()): _hit(h,targets[i],_base(h,slot)+0.35*ap,"magic")
     world.add_visual("burst",h.pos,65,_color(h),0.35)
  "Ashe":
   match slot:
    "q":
     s.stacks = 0
     s.buff_until = world.time+4
    "w":
     var volley = next_id
     for i in range(-4,5): _projectile(h,"ashe_w",dir.rotated(i*0.085),info.range,850,10,_base(h,slot)+h.damage,"physical",1,{"volley":volley})
    "e":
     _use_charge(h,rank)
     var distance = minf(h.pos.distance_to(aim),world.size*sqrt(2.0))
     _effect(h,"scout",h.pos,distance/650+5,{"radius":220.0,"dir":dir,"remaining":distance})
    "r": _projectile(h,"ashe_r",dir,world.size*sqrt(2.0),800,45,_base(h,slot)+ap,"magic",1)
  "Garen":
   match slot:
    "q":
     s.empowered_until = world.time+4.5
     s.haste_until = world.time+1+rank*0.3
     h.slow_until = 0.0
     h.attack_cd = 0.0
    "w":
     s.guard_until = world.time+2+rank*0.6
     s.guard_factor = 0.7
     world.give_shield(h,65+0.18*maxf(0,h.max_hp-world.hero_defs[h.hero_id].hp),0.75)
    "e":
     if s.spin_until > world.time:
      s.spin_until = 0.0
      s.spin_ticks = 0
     else:
      s.spin_until = world.time+3
      s.spin_next = world.time
      s.spin_ticks = 7+int(maxf(0,h.attack_speed/world.hero_defs[h.hero_id].attackSpeed-1)/0.25)
    "r":
     _hit(h,target,_base(h,slot)+(0.2+rank*0.05)*(target.max_hp-target.hp),"true")
     world.add_visual("burst",target.pos,100,_color(h),0.6)
  "Lux":
   match slot:
    "q": _projectile(h,"lux_q",dir,info.range,600,30,_base(h,slot)+0.6*ap,"magic",2)
    "w":
     var amount = _base(h,slot)+0.35*ap
     world.give_shield(h,amount,2.5)
     _projectile(h,"lux_w_out",dir,info.range,700,40,0,"magic",128,{"shield_value":amount,"hit_ids":[h.id]})
    "e":
     if not r.is_empty():
      for zone in effects:
       if zone.id == r.get("effect_id",-1):
        _explode_lux(h,zone)
        zone.until = 0.0
      _close(h,"e")
     else:
      var zone = _effect(h,"lux_zone",at,5,{"radius":155.0,"damage":_base(h,slot)+0.8*ap})
      _open(h,"e",5,1,{"effect_id":zone.id})
    "r": _effect(h,"lux_laser",h.pos,1.2,{"fire_at":world.time+0.6,"fired":false,"dir":dir,"range":info.range,"radius":55.0,"damage":_base(h,slot)+1.2*ap})
  "LeeSin":
   s.flurry_until = world.time+3
   s.flurry_hits = 2
   match slot:
    "q":
     if not r.is_empty():
      var amount = (_base(h,slot)+1.1*bonus)*(2-target.hp/target.max_hp)
      world.teleport(h,target.pos,true)
      _hit(h,target,amount,"physical")
      _close(h,"q")
     else: _projectile(h,"leesin_q",dir,info.range,900,28,_base(h,slot)+1.1*bonus,"physical",1)
    "w":
     if not r.is_empty():
      s.lifesteal_until = world.time+4
      _close(h,"w")
     else:
      if ally.id != h.id: world.teleport(h,ally.pos,true)
      world.give_shield(h,_base(h,slot)+0.8*ap,2)
      if ally.id != h.id and ally.kind == "hero": world.give_shield(ally,_base(h,slot)+0.8*ap,2)
      _open(h,"w",3,1)
    "e":
     if not r.is_empty():
      for id in r.get("target_ids",[]):
       var t = world.unit(id)
       if not t.is_empty() and t.alive and t.pos.distance_to(h.pos)<=300: world.apply_slow(t,0.8-rank*0.05,4)
      _close(h,"e")
     else:
      var ids: Array = []
      for t in _enemies(h,h.pos,225):
       _hit(h,t,_base(h,slot)+bonus,"magic")
       t["revealed_until"] = world.time+4
       t["reveal_team"] = h.team
       if t.alive: ids.append(t.id)
      _open(h,"e",3,1,{"target_ids":ids})
      world.add_visual("burst",h.pos,225,_color(h),0.4)
    "r":
     var origin: Vector2 = target.pos
     var kick: Vector2 = (target.pos-h.pos).normalized()
     var amount = _base(h,slot)+2*bonus
     _hit(h,target,amount,"physical",{"stun":1.0})
     if target.alive: world.teleport(target,target.pos+kick*350,false)
     for other in _enemies(h,(origin+target.pos)/2,400):
      if other.id != target.id and _line_distance(other.pos,origin,target.pos)<=other.r+35: _hit(h,other,amount+target.max_hp*0.1,"physical",{"stun":1.0})
     world.add_visual("beam",origin,35,_color(h),0.4,{"end":target.pos})
  "Darius":
   match slot:
    "q": _effect(h,"darius_q",h.pos,1,{"radius":230.0,"inner_radius":126.5,"fire_at":world.time+0.6,"damage":_base(h,slot)+(1+rank*0.1)*(h.damage+_noxian(h))})
    "w":
     s.empowered_until = world.time+4
     h.attack_cd = 0.0
    "e":
     for t in _enemies(h,h.pos,info.range):
      if absf(angle_difference(angle,(t.pos-h.pos).angle())) > 0.65: continue
      world.apply_cc(t,0.4)
      world.teleport(t,h.pos+(t.pos-h.pos).normalized()*65,false)
      world.apply_slow(t,0.6,1.5)
      cancel_channel(t)
     world.add_visual("cone",h.pos,info.range,_color(h),0.4,{"angle":angle,"half_angle":0.65})
    "r":
     var mark = own_effect(h,"darius_bleed",target.id)
     var stacks: int = mark.get("stacks",0)
     _hit(h,target,(_base(h,slot)+0.75*bonus)*(1+stacks*0.2),"true")
     if not target.alive:
      h.cds.r = 0.0
      s.buff_until = world.time+5
     world.add_visual("burst",target.pos,80,_color(h),0.5)
  "Ezreal":
   match slot:
    "q": _projectile(h,"ezreal_q",dir,info.range,1000,20,_base(h,slot)+1.3*h.damage+0.15*ap,"physical",1)
    "w": _projectile(h,"ezreal_w",dir,info.range,850,20,_base(h,slot)+0.6*bonus+(0.65+rank*0.05)*ap,"magic",1,{"refund":60.0})
    "e":
     var old: Vector2 = h.pos
     world.teleport(h,at,true)
     world.add_visual("burst",old,45,_color(h),0.35)
     world.add_visual("burst",h.pos,45,_color(h),0.35)
     var targets = _visible_sorted(h,350)
     targets.sort_custom(func(a,b): return (a.pos.distance_to(h.pos)-(500 if not own_effect(h,"ezreal_mark",a.id).is_empty() else 0)) < (b.pos.distance_to(h.pos)-(500 if not own_effect(h,"ezreal_mark",b.id).is_empty() else 0)))
     if not targets.is_empty(): _effect(h,"ezreal_bolt",h.pos,0.5,{"target_id":targets[0].id,"fire_at":world.time+0.12,"damage":_base(h,slot)+0.5*bonus+0.75*ap})
    "r": _projectile(h,"ezreal_r",dir,world.size*sqrt(2.0),1000,65,_base(h,slot)+bonus+0.9*ap,"magic",128)
  "Leona":
   match slot:
    "q":
     s.empowered_until = world.time+5
     h.attack_cd = 0.0
    "w":
     s.guard_until = world.time+3
     s.guard_factor = 1.0
     s.defense_bonus = _base(h,"defense")+0.2*h.armor
     _effect(h,"leona_guard",h.pos,3.2,{"radius":225.0,"fire_at":world.time+3,"damage":_base(h,slot)+0.4*ap,"defense_bonus":s.defense_bonus})
    "e": _projectile(h,"leona_e",dir,info.range,1200,22,_base(h,slot)+0.4*ap,"magic",128,{"last_hero_id":-1})
    "r": _effect(h,"leona_flare",at,1,{"radius":150.0,"inner_radius":65.0,"fire_at":world.time+0.65,"damage":_base(h,slot)+0.8*ap})
  "Soraka":
   match slot:
    "q": _effect(h,"soraka_star",at,1,{"radius":110.0,"fire_at":world.time+0.25+h.pos.distance_to(at)/1000,"damage":_base(h,slot)+0.35*ap})
    "w":
     world.heal(ally,_base(h,slot)+0.65*ap)
     if s.rejuvenation_until > world.time: _rejuvenate(h,ally,s.rejuvenation_until-world.time)
     world.add_visual("beam",h.pos,20,_color(h),0.45,{"end":ally.pos})
    "e": _effect(h,"soraka_zone",at,1.5,{"radius":130.0,"damage":_base(h,slot)+0.4*ap,"root_duration":1+rank*0.15,"hits":[]})
    "r":
     for other in world.entities:
      if other.kind == "hero" and other.team == h.team and other.alive:
       world.heal(other,(_base(h,slot)+0.5*ap)*(1.5 if other.hp/other.max_hp<0.4 else 1))
       world.add_visual("burst",other.pos,70,_color(h),0.6)
  "Jhin":
   match slot:
    "q": _effect(h,"bounce",target.pos,3,{"target_id":target.id,"hits":[],"remaining":4,"next_at":world.time,"damage":_base(h,slot)+0.44*h.damage+0.6*ap})
    "w": _projectile(h,"jhin_w",dir,info.range,1500,22,_base(h,slot)+0.5*h.damage,"physical",128)
    "e":
     _use_charge(h,rank)
     var own: Array = []
     for e in effects:
      if e.kind == "jhin_trap" and e.source_id == h.id and e.until > world.time: own.append(e)
     if own.size()>=4: own[0].until = 0.0
     _effect(h,"jhin_trap",at,120,{"radius":110.0,"arm_at":world.time+1,"trigger_at":0.0,"damage":_base(h,slot)+1.2*h.damage+ap})
    "r":
     if r.is_empty():
      s.channel_until = world.time+10
      s.channel_angle = angle
      _open(h,"r",10,4,{"next_at":world.time+0.4})
      h.has_move_target = false
      h.target_id = -1
     else:
      _projectile(h,"jhin_r",dir,info.range,1800,35,_base(h,slot)+0.25*h.damage,"physical",1,{"fourth":r.remaining==1})
      r.remaining -= 1
      r.next_at = world.time+1
      if r.remaining <= 0: cancel_channel(h)
 return true

func _visible_sorted(h: Dictionary, radius: float) -> Array:
 var result: Array = []
 for t in _enemies(h,h.pos,radius):
  if world.visible_to(t,h.team): result.append(t)
 result.sort_custom(func(a,b): return a.pos.distance_to(h.pos)-(500 if a.kind=="hero" else 0) < b.pos.distance_to(h.pos)-(500 if b.kind=="hero" else 0))
 return result

func _hit(h: Dictionary, target: Dictionary, amount: float, kind: String, flags: Dictionary = {}, origin: Vector2 = Vector2.INF) -> float:
 if target.is_empty() or not target.alive or _structure(target) or target.kind == "ward": return 0.0
 var applied: float = world.damage(target,amount,h,kind,h.pos if not origin.is_finite() else origin,true)
 if applied > 0 and target.alive:
  if flags.has("stun"): world.apply_cc(target,flags.stun)
  if flags.has("root") and flags.root > 0: world.apply_cc(target,flags.root,"root")
  if flags.has("charm"):
   world.apply_cc(target,flags.charm)
   target["charm_source"] = h.id
   target["charm_until"] = world.time+flags.charm
  if flags.has("slow"): world.apply_slow(target,flags.slow,flags.get("slow_duration",1.5))
  if flags.get("lux",false): _lux_mark(h,target)
 return applied

func own_effect(h: Dictionary, kind: String, target_id: int) -> Dictionary:
 for e in effects:
  if e.kind == kind and e.source_id == h.id and e.get("target_id",-1)==target_id and e.until > world.time: return e
 return {}

func _bleed(h: Dictionary, target: Dictionary, origin: Vector2):
 if not target.alive or _structure(target) or target.kind == "ward": return
 var e = own_effect(h,"darius_bleed",target.id)
 var amount = (12+h.level*1.2+_bonus_ad(h)*0.3)/5
 if e.is_empty(): e = _effect(h,"darius_bleed",target.pos,5,{"target_id":target.id,"stacks":0,"damage":amount,"next_at":world.time+1,"origin":origin})
 e.stacks = 5 if _noxian(h)>0 and target.kind=="hero" else mini(5,e.stacks+1)
 e.until = world.time+5
 e.damage = amount
 if target.kind=="hero" and e.stacks==5: h.state.buff_until = world.time+5

func _sunlight(h: Dictionary, target: Dictionary, origin: Vector2):
 if not target.alive or _structure(target): return
 var old = own_effect(h,"leona_sunlight",target.id)
 if not old.is_empty(): old.until = 0.0
 _effect(h,"leona_sunlight",target.pos,1.5,{"target_id":target.id,"damage":20+h.level*7,"origin":origin})

func _lux_mark(h: Dictionary, target: Dictionary):
 var old = own_effect(h,"lux_mark",target.id)
 if not old.is_empty(): old.until = 0.0
 _effect(h,"lux_mark",target.pos,6,{"target_id":target.id,"damage":10+h.level*10+h.ap*0.2})

func _consume_lux(h: Dictionary, target: Dictionary, origin: Vector2 = Vector2.INF):
 var e = own_effect(h,"lux_mark",target.id)
 if e.is_empty(): return
 e.until = 0.0
 world.damage(target,e.damage,h,"magic",h.pos if not origin.is_finite() else origin,false)

func _ez_stack(h: Dictionary):
 h.state.stacks = mini(5,h.state.stacks+1)
 h.state.stack_until = world.time+6

func _detonate_ez(h: Dictionary, target: Dictionary, slot: String, origin: Vector2) -> float:
 var e = own_effect(h,"ezreal_mark",target.id)
 if e.is_empty() or not target.alive or target.get("protected",false): return 0.0
 e.until = 0.0
 var amount: float = world.damage(target,e.damage,h,"magic",origin,false)
 if amount>0:
  _ez_stack(h)
  if not slot.is_empty(): h.mp = minf(h.max_mp,h.mp+float(e.get("refund",60))+float(describe(h,slot).get("cost",0)))
 return amount

func _rejuvenate(h: Dictionary, target: Dictionary, duration: float):
 var old = own_effect(h,"rejuvenation",target.id)
 if not old.is_empty(): old.until = 0.0
 _effect(h,"rejuvenation",target.pos,duration,{"target_id":target.id,"next_at":world.time+0.5,"heal":(_rank_value(TUNING.Soraka.rejuvenation,maxi(1,h.skills.q))+0.3*h.ap)/5})
 if target.id==h.id: h.state.rejuvenation_until = world.time+duration

func _use_charge(h: Dictionary, rank: int):
 if h.state.charges==2: h.state.recharge_at = world.time+_rank_value(TUNING[h.key].recharge,rank)/(1.0+h.get("ability_haste",0)/100.0)
 h.state.charges -= 1

func _line_distance(p: Vector2, a: Vector2, b: Vector2) -> float:
 return p.distance_to(Geometry2D.get_closest_point_to_segment(p,a,b))

func step(dt: float):
 for h in world.entities:
  if h.kind=="hero": _update_hero(h,dt)
 for p in projectiles.duplicate():
  if p.active: _update_projectile(p,dt)
 projectiles = projectiles.filter(func(p): return p.active)
 for e in effects.duplicate():
  if e.until > 0: _update_effect(e,dt)
 effects = effects.filter(func(e): return e.until > world.time)

func _update_projectile(p: Dictionary, dt: float):
 var h = world.unit(p.source_id)
 if h.is_empty():
  p.active = false
  return
 p.life -= dt
 if p.life <= 0:
  _finish_projectile(p,h)
  p.active = false
  return
 var returning: bool = p.kind.ends_with("_return")
 if returning: p.dir = (h.pos-p.pos).normalized()
 p.prev = p.pos
 var travel: float = minf(p.speed*dt,p.remaining)
 p.pos += p.dir*travel
 p.remaining -= travel
 p.travelled += travel
 var shield: bool = p.kind.begins_with("lux_w")
 var hits: Array = []
 for e in world.entities:
  if not e.alive or e.id in p.hit_ids: continue
  if shield:
   if e.team != p.team or e.kind != "hero": continue
  else:
   if e.team == p.team or e.kind == "ward": continue
   if p.kind == "ezreal_w":
    if e.kind not in ["hero","tower","inhibitor","nexus","dragon","boss"]: continue
   elif _structure(e): continue
   if p.kind in ["ashe_r","jhin_r"] and e.kind != "hero": continue
  if _line_distance(e.pos,p.prev,p.pos)<=e.r+p.radius: hits.append(e)
 hits.sort_custom(func(a,b): return a.pos.distance_squared_to(p.prev)<b.pos.distance_squared_to(p.prev))
 for t in hits:
  p.hit_ids.append(t.id)
  if shield: world.give_shield(t,(t.shield if t.shield_until>world.time else 0.0)+p.shield_value,2.5)
  else:
   match p.kind:
    "ashe_w":
     if t.get("last_volley",-1) != p.volley:
      _hit(h,t,p.damage,"physical",{"slow":0.65,"slow_duration":2},p.origin)
      t["last_volley"] = p.volley
    "ashe_r":
     _hit(h,t,p.damage,"magic",{"stun":clampf(1+p.travelled/700,1,3.5)},p.origin)
     for other in _enemies(h,t.pos,125):
      if other.id!=t.id: _hit(h,other,p.damage*0.5,"magic",{"slow":0.5},p.origin)
    "leesin_q":
     _hit(h,t,p.damage,"physical",{},p.origin)
     if t.alive:
      _open(h,"q",3,1,{"target_id":t.id})
      t["revealed_until"] = world.time+3
      t["reveal_team"] = h.team
    "jhin_w":
     var root_duration = 1+h.skills.w*0.2 if t.get("jhin_mark_until",0)>world.time or t.get("last_hero_hit_team",-1)==h.team and t.get("last_hero_hit_at",-99)>world.time-4 else 0.0
     _hit(h,t,p.damage*(1 if t.kind=="hero" else 0.75),"physical",{"root":root_duration},p.origin)
     if t.kind=="hero": p.hits_left = 1
    "jhin_r": _hit(h,t,p.damage*(1+2*(1-t.hp/t.max_hp))*(2 if p.fourth else 1),"physical",{"slow":0.2,"slow_duration":0.5},p.origin)
    "ezreal_w":
     var old = own_effect(h,"ezreal_mark",t.id)
     if not old.is_empty(): old.until = 0.0
     _effect(h,"ezreal_mark",t.pos,4,{"target_id":t.id,"damage":p.damage,"refund":p.refund,"origin":p.origin})
    "ezreal_q","ezreal_r":
     var detonation = _detonate_ez(h,t,"q" if p.kind=="ezreal_q" else "r",p.origin)
     var amount = _hit(h,t,p.damage,p.damage_type,{},p.origin)+detonation
     if amount>0:
      _ez_stack(h)
      if p.kind=="ezreal_q":
       for slot in ["q","w","e","r"]: h.cds[slot] = maxf(0,h.cds[slot]-1.5)
    "leona_e":
     if _hit(h,t,p.damage,"magic",{},p.origin)>0: _sunlight(h,t,p.origin)
     if t.kind=="hero" and t.alive: p.last_hero_id = t.id
    _:
     var flags: Dictionary = {}
     if p.kind=="lux_q": flags = {"root":2.0,"lux":true}
     if p.kind=="ahri_e": flags = {"charm":p.get("charm",1.2)}
     _hit(h,t,p.damage,p.damage_type,flags,p.origin)
  world.add_visual("burst",t.pos,30,p.color,0.25)
  p.hits_left -= 1
  if p.hits_left<=0:
   _finish_projectile(p,h)
   p.active = false
   return
 if returning and (_line_distance(h.pos,p.prev,p.pos)<20 or p.pos.distance_to(h.pos)<15):
  p.active = false
  return
 if p.remaining<=0 or p.pos.x<0 or p.pos.y<0 or p.pos.x>world.size or p.pos.y>world.size:
  p.pos = p.pos.clamp(Vector2.ZERO,Vector2.ONE*world.size)
  _finish_projectile(p,h)
  if p.kind in ["ahri_q_out","lux_w_out"]:
   p.kind = "ahri_q_return" if p.kind=="ahri_q_out" else "lux_w_return"
   if p.kind=="ahri_q_return": p.damage_type = "true"
   p.hit_ids = []
   p.remaining = world.size*sqrt(2.0)
   p.hits_left = 128
   p.life = 4.0
  else: p.active = false

func _finish_projectile(p: Dictionary, h: Dictionary):
 if p.kind != "leona_e" or p.get("last_hero_id",-1)<0: return
 var target = world.unit(p.last_hero_id)
 if target.is_empty() or not target.alive: return
 world.apply_cc(target,0.5,"root")
 if not h.alive or h.cc_until>world.time or h.root_until>world.time: return
 world.teleport(h,target.pos-(target.pos-h.pos).normalized()*(target.r+h.r+4),false)

func _explode_lux(h: Dictionary, zone: Dictionary):
 for target in _enemies(h,zone.pos,zone.radius): _hit(h,target,zone.damage,"magic",{"lux":true},zone.origin)
 world.add_visual("burst",zone.pos,zone.radius,_color(h),0.4)

func _update_effect(e: Dictionary, dt: float):
 var h = world.unit(e.source_id)
 if h.is_empty():
  e.until = 0.0
  return
 if e.kind in ["darius_bleed","ezreal_mark","leona_sunlight","lux_mark","rejuvenation"]:
  var target = world.unit(e.get("target_id",-1))
  if target.is_empty() or not target.alive:
   e.until = 0.0
   return
  e.pos = target.pos
  if e.kind in ["darius_bleed","rejuvenation"]:
   while e.next_at <= world.time and e.next_at <= e.until and target.alive:
    if e.kind=="darius_bleed": world.damage(target,e.damage*e.stacks,h,"physical",e.origin,false)
    else: world.heal(target,e.heal)
    e.next_at += 1.0 if e.kind=="darius_bleed" else 0.5
  return
 if e.kind=="soraka_zone" and e.until<=world.time:
  for t in _enemies(h,e.pos,e.radius): _hit(h,t,e.damage,"magic",{"root":e.root_duration},e.origin)
  world.add_visual("burst",e.pos,e.radius,_color(h),0.35)
  return
 if e.kind=="lux_zone" and e.until<=world.time:
  _explode_lux(h,e)
  _close(h,"e")
  return
 if e.until<=world.time: return
 match e.kind:
  "darius_q":
   if not h.alive:
    e.until = 0.0
    return
   e.pos = h.pos
   if e.fire_at<=world.time:
    e.origin = e.pos
    var heals = 0
    for t in _enemies(h,e.pos,e.radius):
     var blade: bool = t.pos.distance_to(e.pos)>e.inner_radius
     if _hit(h,t,e.damage*(1 if blade else 0.35),"physical",{},e.origin)>0 and blade:
      _bleed(h,t,e.origin)
      if t.kind in ["hero","camp","dragon","boss"]: heals += 1
    if heals>0: world.heal(h,(h.max_hp-h.hp)*minf(0.45,heals*0.15))
    world.add_visual("burst",e.pos,e.radius,_color(h),0.4)
    e.until = 0.0
  "ezreal_bolt":
   if e.fire_at<=world.time:
    var t = world.unit(e.target_id)
    if not t.is_empty() and t.alive:
     var detonation = _detonate_ez(h,t,"e",e.origin)
     if _hit(h,t,e.damage,"magic",{},e.origin)+detonation>0: _ez_stack(h)
     world.add_visual("beam",e.pos,12,_color(h),0.25,{"end":t.pos})
    e.until = 0.0
  "leona_guard":
   if not h.alive:
    e.until = 0.0
    return
   e.pos = h.pos
   if e.fire_at<=world.time:
    e.origin = e.pos
    var landed = false
    for t in _enemies(h,e.pos,e.radius):
     if _hit(h,t,e.damage,"magic",{},e.origin)>0:
      landed = true
      _sunlight(h,t,e.origin)
    if landed:
     h.state.guard_until = world.time+3
     h.state.defense_bonus = e.defense_bonus
    world.add_visual("burst",e.pos,e.radius,_color(h),0.45)
    e.until = 0.0
  "leona_flare","soraka_star":
   if e.fire_at<=world.time:
    var rejuvenation = false
    for t in _enemies(h,e.pos,e.radius):
     var leona: bool = e.kind=="leona_flare"
     var inner: bool = t.pos.distance_to(e.pos)<=e.get("inner_radius",0)
     var flags = ({"stun":1.5} if inner else {"slow":0.2,"slow_duration":1.5}) if leona else {"slow":0.7,"slow_duration":2.0}
     if _hit(h,t,e.damage,"magic",flags,e.origin)>0:
      if leona: _sunlight(h,t,e.origin)
      elif t.kind=="hero": rejuvenation = true
    if rejuvenation and h.alive: _rejuvenate(h,h,2.5)
    world.add_visual("burst",e.pos,e.radius,_color(h),0.4)
    e.until = 0.0
  "soraka_zone":
   for t in _enemies(h,e.pos,e.radius):
    if t.id not in e.hits:
     _hit(h,t,e.damage,"magic",{},e.origin)
     e.hits.append(t.id)
    if t.alive:
     t.silence_until = maxf(t.silence_until,world.time+0.15)
     cancel_channel(t)
  "foxfire":
   if not h.alive:
    e.until = 0.0
    return
   e.pos = h.pos
   if e.next_at<=world.time:
    var targets = _visible_sorted(h,350)
    if not targets.is_empty():
     var t: Dictionary = targets[0]
     var previous = e.hits.get(t.id,0)
     _hit(h,t,e.damage*(0.3 if previous>0 else 1),"magic")
     e.hits[t.id] = previous+1
     e.remaining -= 1
     e.next_at = world.time+0.18
     world.add_visual("beam",h.pos,12,_color(h),0.3,{"end":t.pos})
   if e.remaining<=0: e.until = 0.0
  "lux_zone":
   for t in _enemies(h,e.pos,e.radius): world.apply_slow(t,0.75-0.05*h.skills.e,0.25)
  "jhin_trap":
   if e.trigger_at==0 and e.arm_at<=world.time and not _enemies(h,e.pos,55).is_empty(): e.trigger_at = world.time+2
   if e.trigger_at>0:
    for t in _enemies(h,e.pos,e.radius):
     world.apply_slow(t,0.65,0.25)
     t["jhin_mark_until"] = world.time+4
    if e.trigger_at<=world.time:
     for t in _enemies(h,e.pos,e.radius): _hit(h,t,e.damage,"magic",{},e.origin)
     world.add_visual("burst",e.pos,e.radius,_color(h),0.5)
     e.until = 0.0
  "scout":
   var distance: float = minf(e.remaining,650*dt)
   e.pos = (e.pos+e.dir*distance).clamp(Vector2.ZERO,Vector2.ONE*world.size)
   e.remaining -= distance
   if e.remaining<=0:
    e.kind = "scout_hold"
    e.until = world.time+5
  "bounce":
   if e.next_at<=world.time:
    var t = world.unit(e.target_id)
    if t.is_empty() or not t.alive:
     e.until = 0.0
     return
    _hit(h,t,e.damage,"physical",{},e.origin)
    e.hits.append(t.id)
    e.remaining -= 1
    if not t.alive: e.damage *= 1.35
    e.pos = t.pos
    var next: Array = []
    for candidate in _enemies(h,e.pos,225):
     if candidate.id not in e.hits: next.append(candidate)
    next.sort_custom(func(a,b): return a.pos.distance_to(e.pos)<b.pos.distance_to(e.pos))
    if e.remaining<=0 or next.is_empty(): e.until = 0.0
    else:
     e.target_id = next[0].id
     e.next_at = world.time+0.15
  "lux_laser":
   if not e.fired and e.fire_at<=world.time:
    e.fired = true
    var end: Vector2 = e.pos+e.dir*e.range
    for t in _enemies(h,(e.pos+end)/2,e.range/2+70):
     if _line_distance(t.pos,e.pos,end)<=e.radius+t.r:
      _consume_lux(h,t,e.origin)
      _hit(h,t,e.damage,"magic",{"lux":true},e.origin)
    world.add_visual("beam",e.pos,e.radius,_color(h),0.5,{"end":end})

func _update_hero(h: Dictionary, dt: float):
 if not h.has("state") or h.state.is_empty(): init_hero(h)
 var s: Dictionary = h.state
 for slot in s.recasts.keys():
  if s.recasts[slot].until<=world.time: s.recasts.erase(slot)
 if s.stack_until<=world.time and s.buff_until<=world.time: s.stacks = 0
 if s.guard_until<=world.time: s.defense_bonus = 0.0
 if s.reload_until>0 and s.reload_until<=world.time:
  s.ammo = 4
  s.reload_until = 0.0
 if h.key in ["Ashe","Jhin"] and s.charges<2 and s.recharge_at<=world.time:
  s.charges += 1
  s.recharge_at = world.time+_rank_value(TUNING[h.key].recharge,maxi(1,h.skills.e))/(1+h.get("ability_haste",0)/100.0) if s.charges<2 else 0.0
 if not h.alive:
  cancel_channel(h)
  s.spin_until = 0.0
  return
 if s.channel_until>0 and (s.channel_until<=world.time or h.cc_until>world.time or h.silence_until>world.time): cancel_channel(h)
 if h.get("charm_until",0)>world.time:
  var charmer = world.unit(h.get("charm_source",-1))
  if not charmer.is_empty() and charmer.alive:
   var forced: Vector2 = h.pos.move_toward(charmer.pos,maxf(0,minf(h.speed*dt*0.45,h.pos.distance_to(charmer.pos)-30)))
   h.pos = world.vision.safe_move(h.pos,forced,h.r)
 if h.key=="Garen":
  if world.time-h.last_damage_at>8: world.heal(h,h.max_hp*(0.015+h.level*0.0008)*dt)
  if s.spin_until>world.time and s.spin_ticks>0 and s.spin_next<=world.time:
   var amount = _base(h,"e")+0.35*h.damage
   for t in _enemies(h,h.pos,165): _hit(h,t,amount,"physical")
   world.add_visual("ring",h.pos,165,_color(h),0.3)
   s.spin_ticks -= 1
   s.spin_next = world.time+maxf(0.12,(s.spin_until-world.time)/(s.spin_ticks+1))

func on_damage(source: Dictionary, target: Dictionary, amount: float, _kind: String, _is_spell: bool):
 if amount<=0 or source.is_empty(): return
 if source.get("kind","")=="hero":
  target["last_hero_hit_at"] = world.time
  target["last_hero_hit_team"] = source.team
  var marks: Array = []
  for e in effects:
   if e.kind=="leona_sunlight" and e.until>world.time and e.target_id==target.id and e.team==source.team and e.source_id!=source.id:
    marks.append(e)
    e.until = 0.0
  # Consume every eligible mark BEFORE nested damage, so marks cannot recurse.
  for e in marks:
   var owner = world.unit(e.source_id)
   if not owner.is_empty() and target.alive: world.damage(target,e.damage,owner,"magic",e.origin,false)

func on_takedown(source: Dictionary, target: Dictionary):
 if source.is_empty() or source.get("key","")!="Ahri" or not source.alive or target.get("kind","")!="hero": return
 world.heal(source,80+source.level*8+0.3*source.ap)
 var r = _recast(source,"r")
 if not r.is_empty():
  r.remaining = mini(3,r.remaining+1)
  r.until = maxf(r.until,world.time+5)

func on_kill(source: Dictionary, target: Dictionary):
 if source.is_empty() or source.get("kind","")!="hero" or not source.has("state"): return
 if source.key=="Ahri":
  if target.kind=="hero": on_takedown(source,target)
  elif target.kind in ["minion","camp","dragon","boss"]:
   source.state.essence += 1
   if source.state.essence>=9:
    source.state.essence = 0
    world.heal(source,35+source.level*5+0.2*source.ap)

func can_attack(h: Dictionary) -> bool:
 if h.get("kind","")!="hero" or not h.has("state"): return true
 var s: Dictionary = h.state
 return s.channel_until<=world.time and s.reload_until<=world.time and s.spin_until<=world.time and h.get("charm_until",0)<=world.time

func basic_attack(h: Dictionary, t: Dictionary) -> Dictionary:
 if h.get("kind","")!="hero": return {"damage":h.damage,"kind":"physical"}
 var s: Dictionary = h.state
 var critical: bool = h.key!="Ashe" and ((h.key=="Jhin" and s.ammo==1) or world.rng.randf()<float(h.get("crit_chance",0)))
 var amount = h.damage+_noxian(h)
 var multiplier = 2.0+float(h.get("crit_damage_bonus",0))
 if h.key=="Ashe":
  if t.get("frost_until",0)>world.time: amount *= 1.2+float(h.get("crit_chance",0))*(multiplier-1)
  if s.buff_until>world.time: amount *= 1+0.05*h.skills.q
 elif critical: amount *= multiplier*(0.86 if h.key=="Jhin" else 1)
 var empowered: bool = h.key in ["Garen","Darius","Leona"] and s.empowered_until>world.time
 if empowered and h.key=="Garen": amount += _base(h,"q")+0.5*h.damage
 if empowered and h.key=="Darius": amount += _base(h,"w")*(h.damage+_noxian(h))
 var fourth: bool = h.key=="Jhin" and s.ammo==1
 if fourth and not _structure(t): amount += (t.max_hp-t.hp)*(0.15+0.1*(h.level-1)/17)
 s.last_basic = {"empowered":empowered,"fourth":fourth,"critical":critical}
 if empowered: s.empowered_until = 0.0
 if h.key=="Jhin":
  s.ammo -= 1
  if s.ammo<=0: s.reload_until = world.time+2.5
  if critical: s.haste_until = world.time+2
 if h.key=="LeeSin" and s.flurry_hits>0 and s.flurry_until>world.time:
  h.mp = minf(h.max_mp,h.mp+(20 if s.flurry_hits==2 else 10))
  s.flurry_hits -= 1
 return {"damage":amount,"kind":"physical","critical":critical}

func on_basic_hit(h: Dictionary, t: Dictionary, amount: float):
 if h.get("kind","")!="hero" or not h.has("state") or amount<=0: return
 var payload: Dictionary = h.state.get("last_basic",{})
 h.state.last_basic = {}
 if h.key=="Ezreal": _detonate_ez(h,t,"",h.pos)
 if not _structure(t) and t.kind!="ward":
  var steal = float(h.get("life_steal",0))
  if h.key=="LeeSin" and h.state.lifesteal_until>world.time: steal += 0.05+h.skills.w*0.05
  if steal>0 and h.alive: world.heal(h,amount*steal)
  match h.key:
   "Ashe":
    t["frost_until"] = world.time+2
    world.apply_slow(t,0.8-0.15*(h.level-1)/17,2)
    if h.state.buff_until<=world.time: h.state.stacks = mini(4,h.state.stacks+1)
    h.state.stack_until = world.time+6
   "Garen":
    if payload.get("empowered",false) and t.alive:
     t.silence_until = maxf(t.silence_until,world.time+1.5)
     cancel_channel(t)
   "Darius":
    _bleed(h,t,h.pos)
    if payload.get("empowered",false): world.apply_slow(t,0.1,1)
   "Lux": _consume_lux(h,t)
   "Jhin": t["jhin_mark_until"] = world.time+4
 if h.key=="Leona" and payload.get("empowered",false) and t.alive:
  var extra = _base(h,"q")+0.3*h.ap
  if _structure(t): world.damage(t,extra,h,"magic",h.pos,false)
  else:
   _hit(h,t,extra,"magic",{"stun":1.0})
   _sunlight(h,t,h.pos)

func attack_speed_multiplier(h: Dictionary) -> float:
 if h.get("kind","")!="hero" or not h.has("state"): return 1.0
 var s: Dictionary = h.state
 if h.key=="Ashe" and s.buff_until>world.time: return 1.25+0.075*maxi(0,h.skills.q-1)
 if h.key=="LeeSin" and s.flurry_hits>0 and s.flurry_until>world.time: return 1.4
 if h.key=="Ezreal" and s.stack_until>world.time: return 1+s.stacks*0.1
 return 1.0

func move_speed_multiplier(h: Dictionary) -> float:
 if h.get("kind","")!="hero" or not h.has("state"): return 1.0
 if h.state.channel_until>world.time: return 0.0
 var multiplier = 1.25 if h.state.haste_until>world.time else 1.0
 if h.key=="Soraka" and h.has_move_target:
  var direction: Vector2 = (h.move_target-h.pos).normalized()
  for t in world.entities:
   if t.kind=="hero" and t.team==h.team and t.id!=h.id and t.alive and t.hp/t.max_hp<0.4 and t.pos.distance_to(h.pos)<=650 and direction.dot((t.pos-h.pos).normalized())>0.65: return multiplier*1.7
 return multiplier

func defense_bonus(h: Dictionary) -> float:
 return float(h.get("state",{}).get("defense_bonus",0)) if h.get("state",{}).get("guard_until",0)>world.time else 0.0

func damage_multiplier(h: Dictionary) -> float:
 return float(h.get("state",{}).get("guard_factor",1)) if h.get("state",{}).get("guard_until",0)>world.time else 1.0

func armor_penetration(h: Dictionary) -> float:
 return 0.1+0.05*int(h.skills.get("e",0)) if h.get("key","")=="Darius" and h.skills.get("e",0)>0 else 0.0

func cancel_channel(h: Dictionary):
 if h.has("state") and not h.state.is_empty():
  h.state.channel_until = 0.0
  if h.get("key","")=="Jhin": _close(h,"r")

func auto_cast(h: Dictionary, target: Dictionary = {}):
 if not h.alive or h.cc_until>world.time or h.silence_until>world.time: return
 if h.key=="Soraka":
  var injured = _ally(h,Vector2.INF,275,-1,true)
  if not injured.is_empty() and injured.hp/injured.max_hp<0.75 and h.hp>h.max_hp*0.3 and cast(h,"w",Vector2.INF): return
  for ally in world.entities:
   if ally.kind=="hero" and ally.team==h.team and ally.alive and ally.hp/ally.max_hp<0.28:
    if cast(h,"r",h.pos): return
 if target.is_empty() or not target.alive or not world.visible_to(target,h.team): return
 var d: float = h.pos.distance_to(target.pos)
 if h.state.channel_until>world.time:
  cast(h,"r",target.pos,target.id)
  return
 match h.key:
  "Garen":
   if h.hp<h.max_hp*0.7 and cast(h,"w",h.pos): return
   if d<225 and target.kind=="hero" and target.hp/target.max_hp<0.45 and cast(h,"r",target.pos,target.id): return
   if d<180 and h.state.spin_until<=world.time and cast(h,"e",target.pos): return
   if d<300: cast(h,"q",target.pos)
  "Darius":
   if d<240 and target.kind=="hero" and target.hp/target.max_hp<0.5 and cast(h,"r",target.pos,target.id): return
   if d>125 and d<255 and cast(h,"e",target.pos): return
   if d<230 and cast(h,"q",target.pos): return
   if d<140: cast(h,"w",target.pos)
  "LeeSin":
   if h.hp<h.max_hp*0.65 and cast(h,"w",h.pos,h.id): return
   if d<225 and cast(h,"e",target.pos): return
   if d<600 and cast(h,"q",target.pos,target.id): return
   if d<225 and target.kind=="hero": cast(h,"r",target.pos,target.id)
  "Leona":
   if d<275 and cast(h,"w",h.pos): return
   if d<130 and cast(h,"q",h.pos): return
   if target.kind=="hero" and d<500 and cast(h,"e",target.pos): return
   if target.kind=="hero" and d<600: cast(h,"r",target.pos)
  "Lux":
   if h.hp<h.max_hp*0.7 and cast(h,"w",h.pos+Vector2(80,0)): return
   if target.kind=="hero" and d<1200 and cast(h,"r",target.pos): return
   if d<585 and cast(h,"q",target.pos): return
   if d<550: cast(h,"e",target.pos)
  "Ahri":
   if target.kind=="hero" and d<500 and cast(h,"e",target.pos): return
   if d<485 and cast(h,"q",target.pos): return
   if d<350 and cast(h,"w",target.pos): return
   if target.kind=="hero" and d<500: cast(h,"r",target.pos)
  "Ashe":
   if d<400 and cast(h,"q",target.pos): return
   if d<600 and cast(h,"w",target.pos): return
   if target.kind=="hero" and d<1100 and cast(h,"r",target.pos): return
   if d>450: cast(h,"e",target.pos)
  "Ezreal":
   if target.kind=="hero" and d<650 and cast(h,"w",target.pos): return
   if d<650 and cast(h,"q",target.pos): return
   if h.hp<h.max_hp*0.35 and d<200 and cast(h,"e",h.pos+(h.pos-target.pos).normalized()*237.5): return
   if target.kind=="hero" and d<1600 and target.hp/target.max_hp<0.55: cast(h,"r",target.pos)
  "Jhin":
   if d<250 and cast(h,"q",target.pos,target.id): return
   if d<1000 and cast(h,"w",target.pos): return
   if d<375 and cast(h,"e",target.pos): return
   if target.kind=="hero" and d>500 and d<1500: cast(h,"r",target.pos)
  "Soraka":
   if target.kind=="hero" and d<450 and cast(h,"e",target.pos): return
   if d<400: cast(h,"q",target.pos)

func export_state() -> Dictionary:
 return {"projectiles":projectiles.duplicate(true),"effects":effects.duplicate(true),"next_id":next_id}

func _numeric(value) -> bool:
 return (value is int or value is float) and is_finite(float(value)) and absf(float(value)) <= 10000000.0

func _safe_variant(value, depth: int = 0) -> bool:
 if depth > 10: return false
 if value is bool or value is String or value is StringName: return true
 if value is int or value is float: return _numeric(value)
 if value is Vector2: return value.is_finite()
 if value is Color: return is_finite(value.r) and is_finite(value.g) and is_finite(value.b) and is_finite(value.a)
 if value is Array:
  if value.size()>2048: return false
  for v in value:
   if not _safe_variant(v,depth+1): return false
  return true
 if value is Dictionary:
  if value.size()>256: return false
  for key in value:
   if not (key is String or key is StringName or key is int) or not _safe_variant(value[key],depth+1): return false
  return true
 return false

func validate_hero_state(h: Dictionary) -> bool:
 if not h.get("state") is Dictionary or not _safe_variant(h.state): return false
 if h.get("key","") != world.hero_defs.get(h.get("hero_id",""),{}).get("sourceKey",""): return false
 var s: Dictionary = h.state
 for key in ["casts","stacks","stack_until","essence","ammo","reload_until","buff_until","empowered_until","guard_until","guard_factor","defense_bonus","spin_until","spin_next","spin_ticks","lifesteal_until","flurry_until","flurry_hits","charges","recharge_at","channel_until","channel_angle","rejuvenation_until","haste_until"]:
  if not s.has(key) or not _numeric(s[key]): return false
 if not s.get("last_slot") is String or not s.get("last_basic") is Dictionary or not s.get("recasts") is Dictionary: return false
 if s.stacks<0 or s.stacks>5 or s.ammo<0 or s.ammo>4 or s.charges<0 or s.charges>2 or s.essence<0 or s.essence>8 or s.flurry_hits<0 or s.flurry_hits>2: return false
 for slot in s.recasts:
  if slot not in ["q","w","e","r"] or not s.recasts[slot] is Dictionary: return false
  var r: Dictionary = s.recasts[slot]
  for key in ["until","remaining","next_at"]:
   if not r.has(key) or not _numeric(r[key]): return false
  if r.remaining<0 or r.remaining>4: return false
  if h.key=="LeeSin" and slot=="q" and not r.get("target_id") is int: return false
  if h.key=="LeeSin" and slot=="e" and not r.get("target_ids") is Array: return false
  if h.key=="Lux" and slot=="e" and not r.get("effect_id") is int: return false
 return true

func import_state(value: Dictionary) -> bool:
 if not value.get("projectiles") is Array or not value.get("effects") is Array or not value.get("next_id") is int: return false
 if value.projectiles.size()>512 or value.effects.size()>2048 or value.next_id<1: return false
 if not _safe_variant(value.projectiles) or not _safe_variant(value.effects): return false
 var projectile_kinds = ["ahri_q_out","ahri_q_return","ahri_e","ashe_w","ashe_r","lux_q","lux_w_out","lux_w_return","leesin_q","jhin_w","jhin_r","ezreal_q","ezreal_w","ezreal_r","leona_e"]
 var effect_extra = {"darius_bleed":["target_id","stacks","damage","next_at"], "ezreal_mark":["target_id","damage","refund"], "leona_sunlight":["target_id","damage"], "lux_mark":["target_id","damage"], "rejuvenation":["target_id","next_at","heal"], "darius_q":["inner_radius","fire_at","damage"], "ezreal_bolt":["target_id","fire_at","damage"], "leona_guard":["fire_at","damage","defense_bonus"], "leona_flare":["inner_radius","fire_at","damage"], "soraka_star":["fire_at","damage"], "soraka_zone":["damage","root_duration","hits"], "foxfire":["remaining","next_at","hits","damage"], "lux_zone":["damage"], "jhin_trap":["arm_at","trigger_at","damage"], "scout":["dir","remaining"], "scout_hold":["dir","remaining"], "bounce":["target_id","hits","remaining","next_at","damage"], "lux_laser":["fire_at","fired","dir","range","damage"]}
 var ids: Dictionary = {}
 for p in value.projectiles:
  if not p is Dictionary: return false
  for key in ["id","source_id","team","speed","radius","damage","remaining","hits_left","life","travelled"]:
   if not p.has(key) or not _numeric(p[key]): return false
  if not p.get("kind") in projectile_kinds or not p.get("damage_type") in ["physical","magic","true"] or not p.get("hit_ids") is Array or not p.get("active") is bool: return false
  if not p.get("color") is Color or p.team not in [0,1] or p.radius<0 or p.speed<=0 or p.damage<0: return false
  for key in ["pos","prev","dir","origin"]:
   if not p.get(key) is Vector2: return false
  if p.id<1 or ids.has(p.id) or p.id>=value.next_id or world.unit(p.source_id).is_empty(): return false
  ids[p.id] = true
  for key in {"ahri_e":["charm"],"ashe_w":["volley"],"lux_w_out":["shield_value"],"lux_w_return":["shield_value"],"ezreal_w":["refund"],"leona_e":["last_hero_id"]}.get(p.kind,[]):
   if not p.has(key) or not _numeric(p[key]): return false
  if p.kind=="jhin_r" and not p.get("fourth") is bool: return false
  for id in p.hit_ids:
   if not id is int: return false
 for e in value.effects:
  if not e is Dictionary or not effect_extra.has(e.get("kind","")): return false
  for key in ["id","source_id","team","radius","at","until"]:
   if not e.has(key) or not _numeric(e[key]): return false
  if not e.get("pos") is Vector2 or not e.get("origin") is Vector2 or not e.get("color") is Color or e.team not in [0,1] or e.radius<0: return false
  if e.id<1 or ids.has(e.id) or e.id>=value.next_id or world.unit(e.source_id).is_empty(): return false
  ids[e.id] = true
  for key in effect_extra[e.kind]:
   if not e.has(key): return false
   if key=="hits":
    if not e.hits is Dictionary and not e.hits is Array: return false
    if e.kind=="foxfire" and not e.hits is Dictionary: return false
    if e.kind in ["bounce","soraka_zone"] and not e.hits is Array: return false
    for id in e.hits:
     if not id is int: return false
     if e.hits is Dictionary and not _numeric(e.hits[id]): return false
   elif key=="dir":
    if not e.dir is Vector2: return false
   elif key=="fired":
    if not e.fired is bool: return false
   elif not _numeric(e[key]): return false
 projectiles = value.projectiles.duplicate(true)
 effects = value.effects.duplicate(true)
 next_id = int(value.next_id)
 return true
