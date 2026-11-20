extends RefCounted
## v14 runtime data stays separate from the public-reference provenance.

var balance: Dictionary = {}
var reference: Dictionary = {}
var definitions: Dictionary = {}
var evo_pairs: Dictionary = {}
var evo_names: Dictionary = {}
var evo_desc: Dictionary = {}
var chapters: Array = [
	{"name":"도시 시험장", "boss":"철갑 돌격대장", "mult":1.0, "subtitle":"도심 교차로 · 근거리 돌진", "color":"#89c8a7"},
	{"name":"사막 시험장", "boss":"사막 포격사령관", "mult":1.18, "subtitle":"모래 폐허 · 예고 포격", "color":"#e4be82"},
	{"name":"빙결 시험장", "boss":"프로스트 센티널", "mult":1.35, "subtitle":"극지 연구소 · 레이저 탄막", "color":"#99cbd9"}
]

const DESCRIPTIONS = {
	"kunai":"가까운 적을 자동 조준하는 수리검", "bat":"이동 방향의 부채꼴 타격 · 일반 적 밀치기",
	"katana":"이동 방향 앞뒤로 관통 검기를 발사", "shotgun":"이동 방향으로 산탄 발사 · 적을 향해 돌아서 사격",
	"revolver":"자동 조준 · 6발 사격 후 재장전", "guardian":"회전 칼날로 타격 · 일반 적 탄환 차단",
	"rocket":"가까운 적에게 발사 후 광역 폭발", "lightning":"가까운 적들에게 즉시 낙뢰",
	"molotov":"적의 진입 경로에 지속 화염 지대", "drill":"여러 발의 빠른 관통 탄환",
	"droneA":"회전 방사 사격 · A/B 레벨 5에서 합체", "droneB":"반대 방향 방사 폭격 · A/B 레벨 5에서 합체",
	"destroyer":"A/B를 소모한 고밀도 폭격 · 액티브 1칸 반환", "soccer":"적과 비행 범위 경계에서 튕기는 공",
	"brick":"화면 위로 벽돌을 투척 · 관통 공격", "boomerang":"전방 투척 후 플레이어에게 복귀",
	"forcefield":"주변의 적에게 주기적 범위 피해",
	"atk":"공격력", "speed":"이동 속도", "cooldown":"공격 간격 감소", "hp":"최대 체력",
	"magnet":"아이템 흡수 반경", "heal":"5초마다 최대 체력 회복", "range":"공격 범위",
	"duration":"공격 지속시간", "projectile":"투사체 속도", "xp":"경험치 획득량", "gold":"전투 골드 픽업", "armor":"받는 피해 감소"
}
const SHORT = {
	"kunai":"KN", "bat":"BT", "katana":"KT", "shotgun":"SG", "revolver":"RV", "guardian":"GD",
	"rocket":"RP", "lightning":"LT", "molotov":"FL", "drill":"DR", "droneA":"A", "droneB":"B",
	"destroyer":"AB", "soccer":"SC", "brick":"BK", "boomerang":"BM", "forcefield":"FF",
	"atk":"ATK", "speed":"SPD", "cooldown":"CD", "hp":"HP", "magnet":"MAG", "heal":"REG",
	"range":"AOE", "duration":"DUR", "projectile":"VEL", "xp":"XP", "gold":"G", "armor":"DEF"
}

func _init() -> void:
	balance = _read("res://data/runtime_balance.json")
	reference = _read("res://data/reference_subset.json")
	var tables: Dictionary = reference.get("tables", {})
	var maps: Dictionary = reference.get("maps", {})
	var skills: Dictionary = {}
	for row in tables.get("skills", []):
		skills[row.id] = row
	var reverse_w: Dictionary = {}
	var reverse_p: Dictionary = {}
	for id in maps.get("weapons", {}):
		var ref_id: String = maps.weapons[id]
		reverse_w[ref_id] = id
		definitions[id] = {"name":skills[ref_id].label_ko, "desc":DESCRIPTIONS.get(id,""), "kind":"weapon", "max":5, "main":id in balance.get("mainWeapons",[]), "hidden":id == "destroyer", "color":balance.weapons[id].color, "reference_id":ref_id, "short":SHORT.get(id,id)}
	for id in maps.get("passives", {}):
		var ref_id: String = maps.passives[id]
		reverse_p[ref_id] = id
		var name_text: String = id
		for row in tables.get("passives", []):
			if row.id == ref_id:
				name_text = row.label_ko
		var levels: Array = []
		for row in tables.get("passive_levels", []):
			if row.passive_id == ref_id:
				levels.append(row)
		levels.sort_custom(func(a,b): return a.level < b.level)
		var values: Array = []
		for row in levels:
			values.append(float(row.total_value))
		var desc_text: String = DESCRIPTIONS.get(id, "") + " · 레벨당 %d%%" % roundi(values[0] * 100.0)
		definitions[id] = {"name":name_text, "desc":desc_text, "kind":"passive", "max":5, "main":false, "hidden":false, "values":values, "color":"#a1d5b7", "reference_id":ref_id, "short":SHORT.get(id,id)}
	for recipe in tables.get("evolution_recipes", []):
		var id: String = "destroyer" if recipe.get("secondary_skill_id") else reverse_w.get(recipe.base_skill_id, "")
		if id.is_empty():
			continue
		if recipe.get("required_passive_id"):
			evo_pairs[id] = reverse_p[recipe.required_passive_id]
		evo_names[id] = skills[recipe.result_skill_id].label_ko
	evo_desc = {"kunai":"고속 자동 추적 연사", "bat":"전방 타격 범위 확대", "katana":"강화된 양방향 검기", "shotgun":"촘촘한 전방 연사", "revolver":"쌍발 사격 · 10발 탄창", "guardian":"대기시간 없이 지속 회전", "rocket":"대형 미사일 · 넓은 폭발", "lightning":"추가 낙뢰 · 연쇄 전격", "molotov":"넓은 지속 화염 지대", "drill":"자동 추적 관통 화살", "soccer":"고속 양자 공 · 반사 증가", "brick":"사방으로 발사되는 아령", "boomerang":"두 개의 회전 다트", "forcefield":"확장 방어막 · 적 둔화", "destroyer":"A/B 드론 합체 · 액티브 1칸 반환"}

func _read(path: String) -> Dictionary:
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Missing data: " + path)
		return {}
	var value = JSON.parse_string(file.get_as_text())
	return value if value is Dictionary else {}

func label(id: String) -> String:
	if id.begins_with("E:"):
		return evo_names.get(id.substr(2), id)
	return definitions.get(id, {}).get("name", id)

func description(id: String) -> String:
	if id.begins_with("E:"):
		return evo_desc.get(id.substr(2), "진화")
	return definitions.get(id, {}).get("desc", "")

func color(id: String) -> Color:
	return Color(definitions.get(id.trim_prefix("E:"), {}).get("color", "#9bd6bb"))

func short_label(id: String) -> String:
	return SHORT.get(id.trim_prefix("E:"), id.left(3).to_upper())

func preview_upgrade(sim, token: String) -> Dictionary:
	## Read-only values at the actual current build; no RNG/state mutation or DPS claim.
	var id: String = token.trim_prefix("E:")
	var evolution: bool = token.begins_with("E:")
	var current: int = int(sim.player.levels.get(id,0))
	var next_level: int = 5 if evolution else mini(5,current+1)
	var lines: Array[String] = []
	var kind: String = str(definitions.get(id,{}).get("kind","reward"))
	var title: String = label(token)
	if token == "GOLD":
		return {"title":"보급 보상","lines":["전투 골드 +%d" % int(sim.get("_chest_reward")),"체력 +25 · 최대 체력까지"],"synergy":"모든 성장 후보가 소진된 보급입니다.","ready":false,"kind":"reward","level":0,"next_level":0}
	if not definitions.has(id):
		return {"title":title,"lines":lines,"synergy":"","ready":false,"kind":kind,"level":current,"next_level":current}
	var already_evolved: bool = bool(sim.player.evolved.get(id,false))
	var evolved: bool = already_evolved or evolution
	if kind == "passive":
		var values: Array = definitions[id].values
		var before: float = float(values[current-1]) if current > 0 else 0.0
		var after: float = float(values[next_level-1])
		lines.append("%s  %s%% → %s%%" % [DESCRIPTIONS.get(id,"효과"),_display_number(before*100),_display_number(after*100)])
		match id:
			"atk":
				var main: String = str(sim.config.weapon)
				var damage: float = sim.weapon_damage(main)
				lines.append("%s 피해  %s → %s" % [label(main),_display_number(damage),_display_number(damage/(1+before)*(1+after))])
			"speed":
				lines.append("이동 속도  %s → %s" % [_display_number(float(balance.baseMoveSpeed)*(1+before)),_display_number(float(balance.baseMoveSpeed)*(1+after))])
			"cooldown":
				var main: String = str(sim.config.weapon)
				var interval: float = sim.weapon_interval(main)
				lines.append("%s 간격  %.2f → %.2f초" % [label(main),interval,interval/(1-before)*(1-after)])
			"hp":
				lines.append("최대 체력  %s → %s" % [_display_number(sim.player.max_hp),_display_number(float(balance.baseHP)*(1+after))])
				lines.append("늘어난 최대 체력만큼 즉시 회복")
			"magnet":
				lines.append("흡수 반경  %s → %s" % [_display_number(float(balance.pickupRadius)*(1+before)),_display_number(float(balance.pickupRadius)*(1+after))])
			"heal":
				lines.append("5초당 회복  %s → %s HP" % [_display_number(float(sim.player.max_hp)*before),_display_number(float(sim.player.max_hp)*after)])
			"armor":
				lines.append("피해 100 기준  %s → %s" % [_display_number(100*(1-before)),_display_number(100*(1-after))])
			"xp": lines.append("경험치 10 기준  %s → %s" % [_display_number(10*(1+before)),_display_number(10*(1+after))])
			"gold": lines.append("골드 픽업에 적용 · 클리어 보너스 제외")
			"duration": lines.append("화염·투사체·수호자 유지시간 증가")
			"range": lines.append("타격·폭발·오라 반경 증가")
			"projectile": lines.append("발사체 이동 속도에 적용")
	elif id == "destroyer" and evolution:
		lines.append("A형·B형 드론 Lv.5 → 파괴자")
		lines.append("1회 타격 피해 %s · 5발씩 발사" % _display_number(_damage_at(sim,id,5,true)))
		lines.append("발사 간격 %.2f초" % _interval_at(sim,id,true))
		lines.append("액티브 슬롯 2칸 → 1칸")
	else:
		var damage_before: float = _damage_at(sim,id,current,already_evolved) if current > 0 else 0.0
		var damage_after: float = _damage_at(sim,id,next_level,evolved)
		lines.append("1회 타격 피해  %s → %s" % [_display_number(damage_before),_display_number(damage_after)])
		if id == "guardian":
			lines.append("같은 적 타격 간격  %.2f초" % float(balance.guardian.retargetInterval))
		else:
			var interval: float = _interval_at(sim,id,evolved)
			if evolution:
				lines.append("공격 간격  %.2f → %.2f초" % [_interval_at(sim,id,already_evolved),interval])
			else:
				lines.append("공격 간격  %.2f초" % interval)
		var old_count: int = _attack_count(sim,id,current,already_evolved) if current > 0 else 0
		var new_count: int = _attack_count(sim,id,next_level,evolved)
		if id in ["kunai","shotgun","revolver","drill","droneA","droneB","soccer","brick","boomerang","guardian","lightning","molotov"]:
			var noun: String = "동시 투사체"
			if id == "lightning": noun = "낙뢰 대상"
			elif id == "guardian": noun = "회전 칼날"
			elif id == "molotov": noun = "화염 지대"
			lines.append("%s  %d → %d" % [noun,old_count,new_count])
		match id:
			"guardian":
				lines.append("상시 회전 · 휴지시간 제거" if evolved else "%.1f초 회전 · %.1f초 휴식" % [(float(balance.guardian.activeBase)+next_level*float(balance.guardian.activePerLevel))*sim.duration_power(),float(balance.guardian.rest)*(1-sim.passive_value("cooldown"))])
			"revolver":
				lines.append("탄창 %d발 · 재장전 %.2f초" % [10 if evolved else 6,float(balance.revolver.reloadSeconds)*(1-sim.passive_value("cooldown"))])
			"forcefield":
				var radius_before: float = (48+9*current+(24 if already_evolved else 0))*sim.range_power() if current > 0 else 0.0
				var radius_after: float = (48+9*next_level+(24 if evolved else 0))*sim.range_power()
				lines.append("오라 반경  %s → %s" % [_display_number(radius_before),_display_number(radius_after)])
				if evolved: lines.append("영역 안의 적 이동 속도 감소")
			"rocket":
				lines.append("폭발 반경 %s" % _display_number((65+13*next_level+(75 if evolved else 0))*sim.range_power()))
			"bat":
				lines.append("타격 반경 %s · 부채꼴 %d도" % [_display_number((85+10*next_level+(35 if evolved else 0))*sim.range_power()),288 if evolved else 207])
			"katana": lines.append("양방향 관통 · %.2f초 유지" % ((0.85+next_level*0.08)*sim.duration_power()))
			"molotov": lines.append("지속시간 %.1f초" % ((3+next_level*0.4)*sim.duration_power()))
			"drill": lines.append("자동 추적 · 지속 관통" if evolved else "관통 투사체")
			"boomerang": lines.append("플레이어 주변 지속 회전" if evolved else "전방 투척 후 복귀")
	var synergy: Dictionary = _preview_synergy(sim,id,next_level,evolution)
	return {"title":title,"lines":lines,"synergy":synergy.text,"ready":synergy.ready,"kind":kind,"level":current,"next_level":next_level}

func _display_number(value: float) -> String:
	return str(roundi(value)) if is_equal_approx(value,roundf(value)) else "%.1f" % value

func _damage_at(sim, id: String, level: int, evolved: bool) -> float:
	return float(balance.weapons[id].damage[clampi(level,1,5)-1]) * (1+sim.passive_value("atk")) * (1.65 if evolved and id != "destroyer" else 1.0)

func _interval_at(sim, id: String, evolved: bool) -> float:
	var base: float = float(balance.weapons[id].cooldown)
	if id == "rocket" and sim.config.maintainer:
		base = maxf(0.1,base-0.5)
	if evolved:
		base *= float({"kunai":0.24,"shotgun":0.16,"revolver":0.8,"drill":0.78,"guardian":1.0,"forcefield":0.8}.get(id,0.78))
	return base * (1-sim.passive_value("cooldown"))

func _attack_count(sim, id: String, level: int, evolved: bool) -> int:
	match id:
		"kunai": return 3 if evolved else 2 if level >= 4 else 1
		"shotgun": return 3 if evolved else 5+int(level/2)
		"revolver", "boomerang": return 2 if evolved else 1
		"drill": return 1 if evolved else mini(3,1+int(level/2))
		"droneA", "droneB": return 2+int(level/2)
		"soccer": return 1+int(level/2)+(2 if evolved else 0)
		"brick": return 8 if evolved else 1+int(level/2)
		"guardian": return 2+int(level/2)+(3 if evolved else 0)
		"lightning": return 1+int(level/2)+(3 if evolved else 0)+(2 if sim.config.phase else 0)
		"molotov": return 4 if evolved else 1+int(level/3)
	return 1

func _preview_synergy(sim, id: String, next_level: int, evolution: bool) -> Dictionary:
	if evolution:
		return {"text":"진화 조건 충족 · 선택하면 즉시 진화","ready":true}
	if id in ["droneA","droneB"]:
		var other: String = "droneB" if id == "droneA" else "droneA"
		var other_level: int = int(sim.player.levels.get(other,0))
		var ready: bool = next_level == 5 and other_level == 5
		return {"text":("다음 진화 가능 · " if ready else "합체 조건 · ")+"%s %d/5 + %s %d/5" % [label(id),next_level,label(other),other_level],"ready":ready}
	if evo_pairs.has(id):
		var passive: String = str(evo_pairs[id])
		var passive_level: int = int(sim.player.levels.get(passive,0))
		var ready: bool = next_level == 5 and passive_level >= 1
		return {"text":("다음 진화 가능 · " if ready else "진화 조건 · ")+"Lv.%d/5 + %s %d/1" % [next_level,label(passive),mini(1,passive_level)],"ready":ready}
	var partners: Array[String] = []
	var ready: bool = false
	for weapon in evo_pairs:
		if evo_pairs[weapon] != id or bool(sim.player.evolved.get(weapon,false)):
			continue
		# Other equipped-weapon choices cannot be acquired during this run.
		if definitions[weapon].get("main",false) and weapon != sim.config.weapon:
			continue
		var weapon_level: int = int(sim.player.levels.get(weapon,0))
		partners.append("%s %d/5" % [label(weapon),weapon_level])
		ready = ready or (weapon_level == 5 and next_level >= 1)
	return {"text":("다음 진화 가능 · " if ready else "진화 연결 · ")+" / ".join(partners) if not partners.is_empty() else "빌드 전체에 적용되는 보조 효과","ready":ready}
