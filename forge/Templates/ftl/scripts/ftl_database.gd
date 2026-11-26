class_name FTLDatabase
extends RefCounted

## Data-driven FTL 1.6 XML/TXT database powered by FTLPkg (C:\Temp\FTL\ftl.dat.vanilla).
## Falls back cleanly to built-in Kestrel/Rebel/Flagship data when ftl.dat is absent.

var pkg: FTLPkg
var from_archive: bool = false

var texts: Dictionary = {}            # id -> localized string
var ships: Dictionary = {}            # name -> Dictionary
var player_ship_ids: Array[String] = []
var weapons: Dictionary = {}          # name -> Dictionary
var drones: Dictionary = {}           # name -> Dictionary
var systems: Dictionary = {}          # name -> Dictionary
var crew_species: Dictionary = {}     # name -> Dictionary
var augments: Dictionary = {}         # name -> Dictionary
var blueprint_lists: Dictionary = {}  # name -> Array[String]
var sector_types: Dictionary = {}     # CIVILIAN/HOSTILE/NEBULA -> Array[String]
var sectors: Dictionary = {}          # sector_id -> Dictionary
var events: Dictionary = {}           # event_id -> Dictionary
var event_lists: Dictionary = {}      # list_id -> Array[Dictionary]
var ship_events: Dictionary = {}      # ship_event_id -> Dictionary
var anim_sheets: Dictionary = {}      # name -> {w,h,fw,fh,path}
var weapon_anims: Dictionary = {}     # name -> {sheet,length,chargedFrame,fireFrame,firePoint,mountPoint}
var anims: Dictionary = {}            # name -> {sheet,length,x,y,time}
var music_tracks: Dictionary = {}     # name -> {explore,combat}
var sound_effects: Dictionary = {}    # name -> {file,volume,loop}
var _layout_cache: Dictionary = {}

const CREW_BASE_STATS := {
	"human":     {"max_hp": 100, "move": 1.0,  "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": false, "bonus_power": 0, "skill_rate": 1.1, "color": Color("7bb2ff")},
	"engi":      {"max_hp": 100, "move": 1.0,  "repair": 2.0, "combat": 0.5, "fire_immune": false, "no_o2": false, "bonus_power": 0, "skill_rate": 1.0, "color": Color("9ad4c4")},
	"mantis":    {"max_hp": 100, "move": 1.2,  "repair": 0.5, "combat": 1.5, "fire_immune": false, "no_o2": false, "bonus_power": 0, "skill_rate": 1.0, "color": Color("6ce07c")},
	"rock":      {"max_hp": 150, "move": 0.5,  "repair": 1.0, "combat": 1.0, "fire_immune": true,  "no_o2": false, "bonus_power": 0, "skill_rate": 1.0, "color": Color("c98456")},
	"energy":    {"max_hp": 70,  "move": 1.0,  "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": false, "bonus_power": 1, "skill_rate": 1.0, "color": Color("7eff8b")},
	"slug":      {"max_hp": 100, "move": 1.0,  "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": false, "bonus_power": 0, "skill_rate": 1.0, "color": Color("e2c95a")},
	"crystal":   {"max_hp": 125, "move": 0.8,  "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": false, "bonus_power": 0, "skill_rate": 1.0, "color": Color("9ad9ff")},
	"anaerobic": {"max_hp": 100, "move": 0.85, "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": true,  "bonus_power": 0, "skill_rate": 1.0, "color": Color("b5c4d6")},
	"ghost":     {"max_hp": 50,  "move": 1.0,  "repair": 1.0, "combat": 1.0, "fire_immune": false, "no_o2": true,  "bonus_power": 0, "skill_rate": 1.0, "color": Color("d5e4ff")},
}

const ORDERED_PLAYER_SHIPS := [
	"PLAYER_SHIP_HARD", "PLAYER_SHIP_HARD_2", "PLAYER_SHIP_HARD_3",
	"PLAYER_SHIP_CIRCLE", "PLAYER_SHIP_CIRCLE_2", "PLAYER_SHIP_CIRCLE_3",
	"PLAYER_SHIP_FED", "PLAYER_SHIP_FED_2", "PLAYER_SHIP_FED_3",
	"PLAYER_SHIP_ENERGY", "PLAYER_SHIP_ENERGY_2", "PLAYER_SHIP_ENERGY_3",
	"PLAYER_SHIP_MANTIS", "PLAYER_SHIP_MANTIS_2", "PLAYER_SHIP_MANTIS_3",
	"PLAYER_SHIP_JELLY", "PLAYER_SHIP_JELLY_2", "PLAYER_SHIP_JELLY_3",
	"PLAYER_SHIP_ROCK", "PLAYER_SHIP_ROCK_2", "PLAYER_SHIP_ROCK_3",
	"PLAYER_SHIP_STEALTH", "PLAYER_SHIP_STEALTH_2", "PLAYER_SHIP_STEALTH_3",
	"PLAYER_SHIP_CRYSTAL", "PLAYER_SHIP_CRYSTAL_2",
	"PLAYER_SHIP_ANAEROBIC", "PLAYER_SHIP_ANAEROBIC_2",
]


func load_all(p_pkg: FTLPkg) -> void:
	pkg = p_pkg
	_clear_all()
	_install_builtin_fallback()
	if pkg == null or not pkg.is_loaded:
		from_archive = false
		_finalize_player_ships()
		return

	from_archive = true
	for tf in ["data/text_blueprints.xml", "data/text_misc.xml", "data/text_events.xml", "data/text_sectorname.xml", "data/text_tooltips.xml"]:
		if pkg.has_file(tf):
			_parse_texts_xml(pkg.read_text(tf))

	for bf in ["data/blueprints.xml", "data/autoBlueprints.xml", "data/dlcBlueprints.xml", "data/dlcBlueprintsOverwrite.xml", "data/dlcPirateBlueprints.xml"]:
		if pkg.has_file(bf):
			_parse_blueprints_xml(pkg.read_text(bf))

	for af in ["data/animations.xml", "data/dlcAnimations.xml"]:
		if pkg.has_file(af):
			_parse_animations_xml(pkg.read_text(af))

	if pkg.has_file("data/sounds.xml"):
		_parse_sounds_xml(pkg.read_text("data/sounds.xml"))

	if pkg.has_file("data/sector_data.xml"):
		_parse_sectors_xml(pkg.read_text("data/sector_data.xml"))

	for ef in [
		"data/events.xml", "data/newEvents.xml", "data/events_ships.xml",
		"data/events_rebel.xml", "data/events_pirate.xml", "data/events_engi.xml",
		"data/events_mantis.xml", "data/events_rock.xml", "data/events_zoltan.xml",
		"data/events_slug.xml", "data/events_nebula.xml", "data/events_boss.xml",
		"data/dlcEvents.xml", "data/dlcEvents_anaerobic.xml"
	]:
		if pkg.has_file(ef):
			_parse_events_xml(pkg.read_text(ef))

	_finalize_player_ships()


func _clear_all() -> void:
	texts.clear()
	ships.clear()
	player_ship_ids.clear()
	weapons.clear()
	drones.clear()
	systems.clear()
	crew_species.clear()
	augments.clear()
	blueprint_lists.clear()
	sector_types.clear()
	sectors.clear()
	events.clear()
	event_lists.clear()
	ship_events.clear()
	anim_sheets.clear()
	weapon_anims.clear()
	anims.clear()
	music_tracks.clear()
	sound_effects.clear()
	_layout_cache.clear()


func _finalize_player_ships() -> void:
	player_ship_ids.clear()
	for id in ORDERED_PLAYER_SHIPS:
		if ships.has(id):
			player_ship_ids.append(id)
	for id in ships.keys():
		var s := str(id)
		if s.begins_with("PLAYER_SHIP_") and s != "PLAYER_SHIP_EASY" and not player_ship_ids.has(s):
			player_ship_ids.append(s)


func resolve_text(node: Dictionary, fallback: String = "") -> String:
	if node.is_empty():
		return fallback
	var attrs: Dictionary = node.get("attrs", {})
	if attrs.has("id") and texts.has(str(attrs.id)):
		return str(texts[str(attrs.id)])
	var raw := str(node.get("text", "")).strip_edges()
	if not raw.is_empty():
		return raw
	return fallback


func get_text(key: String, fallback: String = "") -> String:
	return str(texts.get(key, fallback))


# ==================== XML TREE PARSER ====================
static func parse_xml_nodes(xml_text: String) -> Array:
	var cleaned := xml_text
	# Strip XML declaration(s)
	var decl_idx := cleaned.find("<?xml")
	while decl_idx != -1:
		var end_idx := cleaned.find("?>", decl_idx)
		if end_idx == -1:
			break
		cleaned = cleaned.substr(0, decl_idx) + cleaned.substr(end_idx + 2)
		decl_idx = cleaned.find("<?xml")
	# FTL XML sometimes contains bare & in text; escape stray & before XMLParser
	cleaned = _sanitize_ampersands(cleaned)
	var wrapped := "<__FTL_ROOT__>" + cleaned + "</__FTL_ROOT__>"

	var parser := XMLParser.new()
	if parser.open_buffer(wrapped.to_utf8_buffer()) != OK:
		return []

	var stack: Array = []
	var root_children: Array = []

	while parser.read() == OK:
		var ntype := parser.get_node_type()
		if ntype == XMLParser.NODE_ELEMENT:
			var tag := parser.get_node_name()
			if tag == "__FTL_ROOT__":
				continue
			var attrs: Dictionary = {}
			for i in range(parser.get_attribute_count()):
				attrs[parser.get_attribute_name(i)] = parser.get_attribute_value(i)
			var node := {"tag": tag, "attrs": attrs, "text": "", "children": []}
			if stack.is_empty():
				root_children.append(node)
			else:
				stack[-1].children.append(node)
			if not parser.is_empty():
				stack.append(node)
		elif ntype == XMLParser.NODE_TEXT:
			if not stack.is_empty():
				var t := parser.get_node_data()
				if not t.strip_edges().is_empty():
					var cur: String = stack[-1].text
					stack[-1].text = t.strip_edges() if cur.is_empty() else (cur + " " + t.strip_edges())
		elif ntype == XMLParser.NODE_ELEMENT_END:
			var end_tag := parser.get_node_name()
			if end_tag == "__FTL_ROOT__":
				continue
			if not stack.is_empty():
				# Pop matching tag (tolerant of minor XML tag typos in vanilla FTL)
				var popped := false
				for idx in range(stack.size() - 1, maxi(-1, stack.size() - 5), -1):
					if stack[idx].tag == end_tag:
						stack.resize(idx)
						popped = true
						break
				if not popped:
					stack.pop_back()
	# Unwrap <FTL> wrapper if present
	var flattened: Array = []
	for c in root_children:
		if c.tag == "FTL":
			for sub in c.children:
				flattened.append(sub)
		else:
			flattened.append(c)
	return flattened


static func _sanitize_ampersands(s: String) -> String:
	if not s.contains("&"):
		return s
	var out := PackedStringArray()
	var i := 0
	var n := s.length()
	while i < n:
		var amp := s.find("&", i)
		if amp == -1:
			out.append(s.substr(i))
			break
		out.append(s.substr(i, amp - i))
		var semi := s.find(";", amp + 1)
		if semi != -1 and semi - amp <= 8:
			var ent := s.substr(amp + 1, semi - amp - 1)
			if ent in ["amp", "lt", "gt", "quot", "apos"] or ent.begins_with("#"):
				out.append(s.substr(amp, semi - amp + 1))
				i = semi + 1
				continue
		out.append("&amp;")
		i = amp + 1
	return "".join(out)


static func _child(node: Dictionary, tag: String) -> Dictionary:
	for c in node.get("children", []):
		if c.tag == tag:
			return c
	return {}


static func _children(node: Dictionary, tag: String) -> Array:
	var out: Array = []
	for c in node.get("children", []):
		if c.tag == tag:
			out.append(c)
	return out


# ==================== XML PARSERS ====================
func _parse_texts_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		if n.tag == "text":
			var name := str(n.attrs.get("name", ""))
			if not name.is_empty():
				texts[name] = str(n.text)


func _parse_blueprints_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		var tag: String = n.tag
		var name: String = str(n.attrs.get("name", ""))
		if name.is_empty():
			continue
		match tag:
			"blueprintList":
				var arr: Array[String] = []
				for c in _children(n, "name"):
					if not c.text.is_empty():
						arr.append(c.text)
				blueprint_lists[name] = arr
			"systemBlueprint":
				var upg: Array[int] = []
				var upg_node := _child(n, "upgradeCost")
				for lv in _children(upg_node, "level"):
					upg.append(int(lv.text))
				systems[name] = {
					"id": name,
					"type": resolve_text(_child(n, "type"), name),
					"title": resolve_text(_child(n, "title"), name.capitalize()),
					"desc": resolve_text(_child(n, "desc"), ""),
					"startPower": int(resolve_text(_child(n, "startPower"), "1")),
					"maxPower": int(resolve_text(_child(n, "maxPower"), "3")),
					"cost": int(resolve_text(_child(n, "cost"), "50")),
					"rarity": int(resolve_text(_child(n, "rarity"), "1")),
					"upgradeCost": upg,
				}
			"weaponBlueprint":
				var launch_snds: Array[String] = []
				for s in _children(_child(n, "launchSounds"), "sound"):
					launch_snds.append(s.text)
				var hit_shield_snds: Array[String] = []
				for s in _children(_child(n, "hitShieldSounds"), "sound"):
					hit_shield_snds.append(s.text)
				var hit_ship_snds: Array[String] = []
				for s in _children(_child(n, "hitShipSounds"), "sound"):
					hit_ship_snds.append(s.text)
				var miss_snds: Array[String] = []
				for s in _children(_child(n, "missSounds"), "sound"):
					miss_snds.append(s.text)
				var color_node := _child(n, "color")
				var beam_color := Color(1.0, 0.25, 0.15, 1.0)
				if not color_node.is_empty():
					beam_color = Color(
						float(resolve_text(_child(color_node, "r"), "255")) / 255.0,
						float(resolve_text(_child(color_node, "g"), "60")) / 255.0,
						float(resolve_text(_child(color_node, "b"), "40")) / 255.0,
						1.0
					)
				var shots_val := maxi(1, int(resolve_text(_child(n, "shots"), "1")))
				var proj_node := _child(n, "projectiles")
				if not proj_node.is_empty():
					var real_proj := 0
					for pn in _children(proj_node, "projectile"):
						if str(pn.attrs.get("fake", "false")) != "true":
							real_proj += maxi(1, int(pn.attrs.get("count", "1")))
					if real_proj > 0:
						shots_val = real_proj
				var boost_node := _child(n, "boost")
				var boost_type := ""
				var boost_amount := 0.0
				var boost_count := 0
				if not boost_node.is_empty():
					boost_type = resolve_text(_child(boost_node, "type"), "")
					boost_amount = float(resolve_text(_child(boost_node, "amount"), "0"))
					boost_count = int(resolve_text(_child(boost_node, "count"), "0"))
				var charge_levels := maxi(1, int(resolve_text(_child(n, "chargeLevels"), "1")))
				weapons[name] = {
					"id": name,
					"type": resolve_text(_child(n, "type"), "LASER"),
					"title": resolve_text(_child(n, "title"), name),
					"short": resolve_text(_child(n, "short"), resolve_text(_child(n, "title"), name)),
					"desc": resolve_text(_child(n, "desc"), ""),
					"damage": int(resolve_text(_child(n, "damage"), "1")),
					"sysDamage": int(resolve_text(_child(n, "sysDamage"), "0")),
					"persDamage": int(resolve_text(_child(n, "persDamage"), "0")),
					"ion": int(resolve_text(_child(n, "ion"), "0")),
					"shots": shots_val,
					"sp": int(resolve_text(_child(n, "sp"), "0")),
					"fireChance": int(resolve_text(_child(n, "fireChance"), "0")),
					"breachChance": int(resolve_text(_child(n, "breachChance"), "0")),
					"stunChance": int(resolve_text(_child(n, "stunChance"), "0")),
					"missiles": int(resolve_text(_child(n, "missiles"), "0")),
					"cooldown": maxf(1.0, float(resolve_text(_child(n, "cooldown"), "10"))),
					"power": maxi(1, int(resolve_text(_child(n, "power"), "1"))),
					"cost": int(resolve_text(_child(n, "cost"), "40")),
					"rarity": int(resolve_text(_child(n, "rarity"), "1")),
					"speed": float(resolve_text(_child(n, "speed"), "60")),
					"length": float(resolve_text(_child(n, "length"), "80")),
					"radius": float(resolve_text(_child(n, "radius"), "0")),
					"boostType": boost_type,
					"boostAmount": boost_amount,
					"boostCount": boost_count,
					"chargeLevels": charge_levels,
					"image": resolve_text(_child(n, "image"), "laser_light1"),
					"weaponArt": resolve_text(_child(n, "weaponArt"), "laser_burst_1"),
					"color": beam_color,
					"launchSounds": launch_snds,
					"hitShieldSounds": hit_shield_snds,
					"hitShipSounds": hit_ship_snds,
					"missSounds": miss_snds,
				}
			"droneBlueprint":
				drones[name] = {
					"id": name,
					"type": resolve_text(_child(n, "type"), "COMBAT"),
					"title": resolve_text(_child(n, "title"), name),
					"short": resolve_text(_child(n, "short"), name),
					"desc": resolve_text(_child(n, "desc"), ""),
					"power": maxi(1, int(resolve_text(_child(n, "power"), "2"))),
					"cooldown": float(resolve_text(_child(n, "cooldown"), "1000")),
					"speed": float(resolve_text(_child(n, "speed"), "15")),
					"cost": int(resolve_text(_child(n, "cost"), "50")),
					"rarity": int(resolve_text(_child(n, "rarity"), "2")),
					"droneImage": resolve_text(_child(n, "droneImage"), "drone_combat"),
					"weaponBlueprint": resolve_text(_child(n, "weaponBlueprint"), ""),
				}
			"crewBlueprint":
				var base_stats: Dictionary = CREW_BASE_STATS.get(name, CREW_BASE_STATS["human"])
				var powers: Array[String] = []
				for pw in _children(_child(n, "powerList"), "power"):
					powers.append(resolve_text(pw, ""))
				crew_species[name] = {
					"id": name,
					"title": resolve_text(_child(n, "title"), name.capitalize()),
					"short": resolve_text(_child(n, "short"), name.capitalize()),
					"desc": resolve_text(_child(n, "desc"), ""),
					"cost": int(resolve_text(_child(n, "cost"), "45")),
					"rarity": int(resolve_text(_child(n, "rarity"), "1")),
					"powers": powers,
					"max_hp": int(base_stats.max_hp),
					"move": float(base_stats.move),
					"repair": float(base_stats.repair),
					"combat": float(base_stats.combat),
					"fire_immune": bool(base_stats.fire_immune),
					"no_o2": bool(base_stats.no_o2),
					"bonus_power": int(base_stats.bonus_power),
					"skill_rate": float(base_stats.skill_rate),
					"color": base_stats.color,
				}
			"augBlueprint":
				augments[name] = {
					"id": name,
					"title": resolve_text(_child(n, "title"), name),
					"desc": resolve_text(_child(n, "desc"), ""),
					"cost": int(resolve_text(_child(n, "cost"), "50")),
					"rarity": int(resolve_text(_child(n, "rarity"), "2")),
					"value": float(resolve_text(_child(n, "value"), "0")),
					"stackable": resolve_text(_child(n, "stackable"), "false") == "true",
				}
			"shipBlueprint":
				var sys_map: Dictionary = {}
				var sys_list := _child(n, "systemList")
				for sc in sys_list.get("children", []):
					var sname: String = sc.tag
					var slot_node := _child(sc, "slot")
					var slot_dir := resolve_text(_child(slot_node, "direction"), "up")
					var slot_num := int(resolve_text(_child(slot_node, "number"), "0"))
					sys_map[sname] = {
						"power": int(sc.attrs.get("power", "1")),
						"max": int(sc.attrs.get("max", "8")),
						"room": int(sc.attrs.get("room", "0")),
						"start": str(sc.attrs.get("start", "true")) != "false",
						"img": str(sc.attrs.get("img", "")),
						"slot_dir": slot_dir,
						"slot_num": slot_num,
					}
				var wlist_node := _child(n, "weaponList")
				var w_arr: Array[String] = []
				for wc in _children(wlist_node, "weapon"):
					var wn := str(wc.attrs.get("name", ""))
					if not wn.is_empty():
						w_arr.append(wn)
				var dlist_node := _child(n, "droneList")
				var d_arr: Array[String] = []
				for dc in _children(dlist_node, "drone"):
					var dn := str(dc.attrs.get("name", ""))
					if not dn.is_empty():
						d_arr.append(dn)
				var crew_arr: Array[String] = []
				for cc in _children(n, "crewCount"):
					var amt := int(cc.attrs.get("amount", "1"))
					var cls := str(cc.attrs.get("class", "human"))
					for _k in range(amt):
						crew_arr.append(cls)
				var aug_arr: Array[String] = []
				for ac in _children(n, "aug"):
					var an := str(ac.attrs.get("name", ""))
					if not an.is_empty():
						aug_arr.append(an)
				var health_node := _child(n, "health")
				var max_power_node := _child(n, "maxPower")
				var min_sec := int(resolve_text(_child(n, "minSector"), "0"))
				var max_sec := int(resolve_text(_child(n, "maxSector"), "8"))
				var wlist_attrs: Dictionary = wlist_node.get("attrs", {})
				var dlist_attrs: Dictionary = dlist_node.get("attrs", {})
				ships[name] = {
					"id": name,
					"layout": str(n.attrs.get("layout", "kestral")),
					"img": str(n.attrs.get("img", "kestral")),
					"class_name": resolve_text(_child(n, "class"), name),
					"name": resolve_text(_child(n, "name"), resolve_text(_child(n, "class"), name)),
					"desc": resolve_text(_child(n, "desc"), ""),
					"systems": sys_map,
					"weaponSlots": int(resolve_text(_child(n, "weaponSlots"), "4")),
					"droneSlots": int(resolve_text(_child(n, "droneSlots"), "2")),
					"weapons": w_arr,
					"weaponListLoad": str(wlist_attrs.get("load", "")),
					"weaponListCount": int(wlist_attrs.get("count", str(w_arr.size()))),
					"missiles": int(wlist_attrs.get("missiles", "8")),
					"drones": d_arr,
					"droneListLoad": str(dlist_attrs.get("load", "")),
					"droneParts": int(dlist_attrs.get("drones", "2")),
					"health": int(health_node.attrs.get("amount", "30")) if not health_node.is_empty() else 30,
					"maxPower": int(max_power_node.attrs.get("amount", "8")) if not max_power_node.is_empty() else 8,
					"crew": crew_arr,
					"augments": aug_arr,
					"minSector": min_sec,
					"maxSector": max_sec,
					"boardingAI": resolve_text(_child(n, "boardingAI"), "sabotage"),
				}


func _parse_animations_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		var name := str(n.attrs.get("name", ""))
		if name.is_empty():
			continue
		if n.tag == "animSheet":
			anim_sheets[name] = {
				"w": int(n.attrs.get("w", "35")),
				"h": int(n.attrs.get("h", "35")),
				"fw": int(n.attrs.get("fw", "35")),
				"fh": int(n.attrs.get("fh", "35")),
				"path": str(n.text).strip_edges(),
			}
		elif n.tag == "anim":
			var desc := _child(n, "desc")
			anims[name] = {
				"sheet": resolve_text(_child(n, "sheet"), ""),
				"length": int(desc.attrs.get("length", "1")) if not desc.is_empty() else 1,
				"x": int(desc.attrs.get("x", "0")) if not desc.is_empty() else 0,
				"y": int(desc.attrs.get("y", "0")) if not desc.is_empty() else 0,
				"time": float(resolve_text(_child(n, "time"), "1.0")),
			}
		elif n.tag == "weaponAnim":
			var desc := _child(n, "desc")
			var fp := _child(n, "firePoint")
			var mp := _child(n, "mountPoint")
			weapon_anims[name] = {
				"sheet": resolve_text(_child(n, "sheet"), ""),
				"length": int(desc.attrs.get("length", "1")) if not desc.is_empty() else 1,
				"x": int(desc.attrs.get("x", "0")) if not desc.is_empty() else 0,
				"y": int(desc.attrs.get("y", "0")) if not desc.is_empty() else 0,
				"chargedFrame": int(resolve_text(_child(n, "chargedFrame"), "1")),
				"fireFrame": int(resolve_text(_child(n, "fireFrame"), "2")),
				"firePoint": Vector2(float(fp.attrs.get("x", "0")), float(fp.attrs.get("y", "0"))) if not fp.is_empty() else Vector2.ZERO,
				"mountPoint": Vector2(float(mp.attrs.get("x", "0")), float(mp.attrs.get("y", "0"))) if not mp.is_empty() else Vector2.ZERO,
			}


func _parse_sounds_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		if n.tag == "music":
			for tr in _children(n, "track"):
				var tname := resolve_text(_child(tr, "name"), "")
				if not tname.is_empty():
					music_tracks[tname] = {
						"explore": resolve_text(_child(tr, "explore"), ""),
						"combat": resolve_text(_child(tr, "combat"), ""),
					}
		else:
			var file_path := str(n.text).strip_edges()
			if not file_path.is_empty():
				sound_effects[n.tag] = {
					"file": file_path,
					"volume": int(n.attrs.get("volume", "7")),
					"loop": str(n.attrs.get("loop", "false")) == "true",
				}


func _parse_sectors_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		if n.tag == "sectorType":
			var stype := str(n.attrs.get("name", ""))
			var list: Array[String] = []
			for s in _children(n, "sector"):
				list.append(s.text)
			if not stype.is_empty():
				sector_types[stype] = list
		elif n.tag == "sectorDescription":
			var sid := str(n.attrs.get("name", ""))
			if sid.is_empty():
				continue
			var names_arr: Array[String] = []
			for nm in _children(_child(n, "nameList"), "name"):
				names_arr.append(resolve_text(nm, sid))
			var tracks_arr: Array[String] = []
			for tr in _children(_child(n, "trackList"), "track"):
				tracks_arr.append(tr.text)
			var ev_arr: Array = []
			for ev in _children(n, "event"):
				ev_arr.append({
					"name": str(ev.attrs.get("name", "")),
					"min": int(ev.attrs.get("min", "0")),
					"max": int(ev.attrs.get("max", "1")),
				})
			sectors[sid] = {
				"id": sid,
				"minSector": int(n.attrs.get("minSector", "0")),
				"unique": str(n.attrs.get("unique", "false")) == "true",
				"names": names_arr,
				"tracks": tracks_arr,
				"events": ev_arr,
				"startEvent": resolve_text(_child(n, "startEvent"), "START_BEACON"),
			}


func _parse_events_xml(xml_text: String) -> void:
	for n in parse_xml_nodes(xml_text):
		var name := str(n.attrs.get("name", ""))
		if n.tag == "event" and not name.is_empty():
			events[name] = _convert_event_node(n)
		elif n.tag == "eventList" and not name.is_empty():
			var list: Array = []
			for c in _children(n, "event"):
				list.append(_convert_event_node(c))
			event_lists[name] = list
		elif n.tag == "ship" and not name.is_empty():
			ship_events[name] = {
				"id": name,
				"auto_blueprint": str(n.attrs.get("auto_blueprint", "REBEL_SKINNY")),
				"surrender": not _child(n, "surrender").is_empty(),
				"destroyed_text": resolve_text(_child(_child(n, "destroyed"), "text"), "Enemy ship destroyed! You salvage scrap from the wreckage."),
				"dead_crew_text": resolve_text(_child(_child(n, "deadCrew"), "text"), "No life signs remain aboard the enemy ship. You salvage everything intact!"),
			}


func _convert_event_node(n: Dictionary) -> Dictionary:
	var ev := {
		"load": str(n.attrs.get("load", "")),
		"text": resolve_text(_child(n, "text"), ""),
		"store": not _child(n, "store").is_empty(),
		"distress": not _child(n, "distressBeacon").is_empty(),
		"ship": "",
		"hostile": false,
		"autoReward": "",
		"autoRewardLevel": "MED",
		"damage": 0,
		"weapon": "",
		"crew": "",
		"augment": "",
		"quest": "",
		"choices": [],
	}
	var q_node := _child(n, "quest")
	if not q_node.is_empty():
		ev.quest = str(q_node.attrs.get("event", ""))
	var ship_node := _child(n, "ship")
	if not ship_node.is_empty():
		ev.ship = str(ship_node.attrs.get("load", ""))
		ev.hostile = str(ship_node.attrs.get("hostile", "false")) == "true"
	var ar := _child(n, "autoReward")
	if not ar.is_empty():
		ev.autoReward = str(ar.text).strip_edges()
		ev.autoRewardLevel = str(ar.attrs.get("level", "MED"))
	var dmg := _child(n, "damage")
	if not dmg.is_empty():
		ev.damage = int(dmg.attrs.get("amount", "0"))
	var wpn := _child(n, "weapon")
	if not wpn.is_empty():
		ev.weapon = str(wpn.attrs.get("name", ""))
	var cm := _child(n, "crewMember")
	if not cm.is_empty():
		ev.crew = str(cm.attrs.get("class", "human"))
	var ag := _child(n, "augment")
	if not ag.is_empty():
		ev.augment = str(ag.attrs.get("name", ""))

	for ch in _children(n, "choice"):
		var sub_ev := _child(ch, "event")
		ev.choices.append({
			"text": resolve_text(_child(ch, "text"), "Continue..."),
			"req": str(ch.attrs.get("req", "")),
			"lvl": int(ch.attrs.get("lvl", "1")),
			"event": _convert_event_node(sub_ev) if not sub_ev.is_empty() else {},
		})
	return ev


func resolve_event(event_id_or_dict) -> Dictionary:
	var ev: Dictionary = {}
	if event_id_or_dict is String:
		var id := str(event_id_or_dict)
		if events.has(id):
			ev = events[id].duplicate(true)
		elif event_lists.has(id) and not event_lists[id].is_empty():
			var list: Array = event_lists[id]
			ev = list[randi() % list.size()].duplicate(true)
	elif event_id_or_dict is Dictionary:
		ev = event_id_or_dict.duplicate(true)
	var depth := 0
	while not str(ev.get("load", "")).is_empty() and depth < 6:
		var target := str(ev.load)
		ev.erase("load")
		if events.has(target):
			ev = events[target].duplicate(true)
		elif event_lists.has(target) and not event_lists[target].is_empty():
			var list: Array = event_lists[target]
			ev = list[randi() % list.size()].duplicate(true)
		else:
			break
		depth += 1
	return ev


# ==================== SHIP LAYOUT PARSER (.txt + .xml) ====================
func get_ship_layout(layout_name: String) -> Dictionary:
	if _layout_cache.has(layout_name):
		return _layout_cache[layout_name]
	var layout := {
		"name": layout_name,
		"x_offset": 0,
		"y_offset": 0,
		"vertical": 0,
		"horizontal": 0,
		"ellipse": {"rx": 320, "ry": 210, "ox": 0, "oy": 0},
		"rooms": [],        # {id, x, y, w, h}
		"doors": [],        # {x, y, room_a, room_b, vertical}
		"img_rect": Rect2(-59, -103, 652, 418),
		"floor_offset": Vector2(45, 93),
		"cloak_offset": Vector2(19, 19),
		"weapon_mounts": [], # {x, y, rotate, mirror, slide}
	}

	var txt_path := "data/%s.txt" % layout_name
	if pkg != null and pkg.is_loaded and pkg.has_file(txt_path):
		var raw_lines := pkg.read_text(txt_path).replace("\r", "").split("\n")
		var lines: Array[String] = []
		for l in raw_lines:
			var s := l.strip_edges()
			if not s.is_empty():
				lines.append(s)
		var i := 0
		while i < lines.size():
			var tok := lines[i]
			if tok == "X_OFFSET" and i + 1 < lines.size():
				layout.x_offset = int(lines[i + 1]); i += 2
			elif tok == "Y_OFFSET" and i + 1 < lines.size():
				layout.y_offset = int(lines[i + 1]); i += 2
			elif tok == "VERTICAL" and i + 1 < lines.size():
				layout.vertical = int(lines[i + 1]); i += 2
			elif tok == "HORIZONTAL" and i + 1 < lines.size():
				layout.horizontal = int(lines[i + 1]); i += 2
			elif tok == "ELLIPSE" and i + 4 < lines.size():
				layout.ellipse = {"rx": int(lines[i + 1]), "ry": int(lines[i + 2]), "ox": int(lines[i + 3]), "oy": int(lines[i + 4])}
				i += 5
			elif tok == "ROOM" and i + 5 < lines.size():
				layout.rooms.append({
					"id": int(lines[i + 1]),
					"x": int(lines[i + 2]),
					"y": int(lines[i + 3]),
					"w": int(lines[i + 4]),
					"h": int(lines[i + 5]),
				})
				i += 6
			elif tok == "DOOR" and i + 5 < lines.size():
				layout.doors.append({
					"x": int(lines[i + 1]),
					"y": int(lines[i + 2]),
					"room_a": int(lines[i + 3]),
					"room_b": int(lines[i + 4]),
					"vertical": int(lines[i + 5]) == 1,
				})
				i += 6
			else:
				i += 1
	else:
		layout = _fallback_layout(layout_name)

	var xml_path := "data/%s.xml" % layout_name
	if pkg != null and pkg.is_loaded and pkg.has_file(xml_path):
		for n in parse_xml_nodes(pkg.read_text(xml_path)):
			if n.tag == "img":
				layout.img_rect = Rect2(
					float(n.attrs.get("x", "0")),
					float(n.attrs.get("y", "0")),
					float(n.attrs.get("w", "500")),
					float(n.attrs.get("h", "340"))
				)
			elif n.tag == "offsets":
				var fl := _child(n, "floor")
				if not fl.is_empty():
					layout.floor_offset = Vector2(float(fl.attrs.get("x", "0")), float(fl.attrs.get("y", "0")))
				var cl := _child(n, "cloak")
				if not cl.is_empty():
					layout.cloak_offset = Vector2(float(cl.attrs.get("x", "0")), float(cl.attrs.get("y", "0")))
			elif n.tag == "weaponMounts":
				layout.weapon_mounts.clear()
				for m in _children(n, "mount"):
					layout.weapon_mounts.append({
						"x": float(m.attrs.get("x", "0")),
						"y": float(m.attrs.get("y", "0")),
						"rotate": str(m.attrs.get("rotate", "true")) == "true",
						"mirror": str(m.attrs.get("mirror", "false")) == "true",
						"slide": str(m.attrs.get("slide", "up")),
					})

	_layout_cache[layout_name] = layout
	return layout


func pick_enemy_ship_id(sector_idx: int, sector_id: String = "") -> String:
	var pool: Array[String] = []
	var sec_upper := sector_id.to_upper()
	if sec_upper.contains("MANTIS"):
		pool.append_array(["MANTIS_SCOUT", "MANTIS_FIGHTER", "MANTIS_BOMBER"])
	elif sec_upper.contains("ROCK"):
		pool.append_array(["ROCK_SCOUT", "ROCK_FIGHT", "ROCK_ASSAULT"])
	elif sec_upper.contains("ENGI"):
		pool.append_array(["CIRCLE_SCOUT", "CIRCLE_BOMBER", "AUTO_BASIC", "REBEL_SKINNY"])
	elif sec_upper.contains("ZOLTAN"):
		pool.append_array(["ENERGY_FIGHTER", "ENERGY_BOMBER", "REBEL_SKINNY"])
	elif sec_upper.contains("SLUG") or sec_upper.contains("NEBULA"):
		pool.append_array(["JELLY_BUTTON", "JELLY_CROISSANT", "JELLY_TRUFFLE"])
	elif sec_upper.contains("ANAEROBIC") or sec_upper.contains("LANIUS"):
		pool.append_array(["ANAEROBIC_SCOUT", "ANAEROBIC_BOMBER"])
	else:
		pool.append_array(["REBEL_SKINNY", "REBEL_FAT", "AUTO_BASIC", "AUTO_ASSAULT", "FED_SCOUT", "MANTIS_SCOUT"])

	var valid: Array[String] = []
	for id in pool:
		if ships.has(id):
			var bp: Dictionary = ships[id]
			if int(bp.get("minSector", 0)) <= sector_idx:
				valid.append(id)
	if valid.is_empty():
		for id in ["REBEL_SKINNY", "REBEL_FAT", "AUTO_BASIC"]:
			if ships.has(id):
				valid.append(id)
	if valid.is_empty():
		return "REBEL_SKINNY"
	return valid[randi() % valid.size()]


func pick_store_weapons(count: int = 3) -> Array[String]:
	var pool: Array[String] = []
	for wid in weapons.keys():
		var w: Dictionary = weapons[wid]
		if int(w.get("rarity", 0)) > 0 and int(w.get("cost", 0)) >= 20 and not str(wid).begins_with("ARTILLERY_"):
			pool.append(str(wid))
	pool.shuffle()
	var out: Array[String] = []
	for i in range(mini(count, pool.size())):
		out.append(pool[i])
	return out


func pick_store_drones(count: int = 2) -> Array[String]:
	var pool: Array[String] = []
	for did in drones.keys():
		var d: Dictionary = drones[did]
		if int(d.get("rarity", 0)) > 0 and int(d.get("cost", 0)) >= 20:
			pool.append(str(did))
	pool.shuffle()
	var out: Array[String] = []
	for i in range(mini(count, pool.size())):
		out.append(pool[i])
	return out


func pick_store_augments(count: int = 2) -> Array[String]:
	var pool: Array[String] = []
	for aid in augments.keys():
		var a: Dictionary = augments[aid]
		if int(a.get("rarity", 0)) > 0 and int(a.get("cost", 0)) >= 20:
			pool.append(str(aid))
	pool.shuffle()
	var out: Array[String] = []
	for i in range(mini(count, pool.size())):
		out.append(pool[i])
	return out


# ==================== BUILT-IN FALLBACK (when ftl.dat absent) ====================
func _install_builtin_fallback() -> void:
	for sname in ["shields", "engines", "oxygen", "weapons", "drones", "medbay", "clonebay", "teleporter", "cloaking", "pilot", "sensors", "doors", "artillery", "hacking", "mind", "battery"]:
		var max_p := 8 if sname in ["shields", "engines", "weapons", "drones"] else 3
		var costs: Array[int] = [20, 30, 40, 60, 80, 100, 120]
		if sname == "shields":
			costs = [20, 30, 40, 60, 80, 100, 120]
		systems[sname] = {
			"id": sname, "type": sname, "title": sname.capitalize(), "desc": "",
			"startPower": 1, "maxPower": max_p, "cost": 60, "rarity": 1, "upgradeCost": costs,
		}
	for cname in CREW_BASE_STATS.keys():
		var st: Dictionary = CREW_BASE_STATS[cname]
		crew_species[cname] = {
			"id": cname, "title": cname.capitalize(), "short": cname.capitalize(), "desc": "",
			"cost": 45, "rarity": 1, "powers": [],
			"max_hp": st.max_hp, "move": st.move, "repair": st.repair, "combat": st.combat,
			"fire_immune": st.fire_immune, "no_o2": st.no_o2, "bonus_power": st.bonus_power,
			"skill_rate": st.skill_rate, "color": st.color,
		}
	weapons["LASER_BURST_2"] = {
		"id": "LASER_BURST_2", "type": "LASER", "title": "Burst Laser Mark II", "short": "Burst Laser II",
		"desc": "Fires 3 lasers dealing 1 damage each.", "damage": 1, "sysDamage": 0, "persDamage": 0,
		"ion": 0, "shots": 3, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0,
		"missiles": 0, "cooldown": 12.0, "power": 2, "cost": 80, "rarity": 2, "speed": 60.0,
		"length": 0.0, "radius": 0.0, "image": "laser_light1", "weaponArt": "laser_burst_3",
		"color": Color(1.0, 0.25, 0.2), "launchSounds": ["lightLaser1"], "hitShieldSounds": ["hitShield1"],
		"hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
	}
	weapons["MISSILES_2_PLAYER"] = {
		"id": "MISSILES_2_PLAYER", "type": "MISSILES", "title": "Artemis Missile", "short": "Artemis",
		"desc": "Pierces all shields and deals 2 damage.", "damage": 2, "sysDamage": 0, "persDamage": 0,
		"ion": 0, "shots": 1, "sp": 5, "fireChance": 1, "breachChance": 1, "stunChance": 0,
		"missiles": 1, "cooldown": 11.0, "power": 1, "cost": 38, "rarity": 0, "speed": 35.0,
		"length": 0.0, "radius": 0.0, "image": "missile_2", "weaponArt": "missiles_2",
		"color": Color(1.0, 0.72, 0.2), "launchSounds": ["smallMissile1"], "hitShieldSounds": ["hitHull1"],
		"hitShipSounds": ["smallExplosion"], "missSounds": ["miss"],
	}
	weapons["BEAM_2"] = {
		"id": "BEAM_2", "type": "BEAM", "title": "Halberd Beam", "short": "Halberd",
		"desc": "Powerful beam dealing 2 damage per room.", "damage": 2, "sysDamage": 0, "persDamage": 0,
		"ion": 0, "shots": 1, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0,
		"missiles": 0, "cooldown": 17.0, "power": 3, "cost": 65, "rarity": 2, "speed": 5.0,
		"length": 90.0, "radius": 0.0, "image": "beam_contact", "weaponArt": "beam_2",
		"color": Color(1.0, 0.2, 0.15), "launchSounds": ["beam2"], "hitShieldSounds": [],
		"hitShipSounds": [], "missSounds": [],
	}
	weapons["ION_1"] = {
		"id": "ION_1", "type": "LASER", "title": "Ion Blast", "short": "Ion Blast",
		"desc": "Deals 1 ion damage to shields or systems.", "damage": 0, "sysDamage": 0, "persDamage": 0,
		"ion": 1, "shots": 1, "sp": 0, "fireChance": 0, "breachChance": 0, "stunChance": 1,
		"missiles": 0, "cooldown": 8.0, "power": 1, "cost": 30, "rarity": 1, "speed": 35.0,
		"length": 0.0, "radius": 0.0, "image": "ion_1_shot", "weaponArt": "ion_1",
		"color": Color(0.35, 0.85, 1.0), "launchSounds": ["ionShoot1"], "hitShieldSounds": ["ionHit1"],
		"hitShipSounds": ["ionHit1"], "missSounds": ["miss"],
	}
	drones["COMBAT_1"] = {
		"id": "COMBAT_1", "type": "COMBAT", "title": "Combat Drone Mark I", "short": "Combat I",
		"desc": "Orbits enemy ship firing lasers.", "power": 2, "cooldown": 1000.0, "speed": 15.0,
		"cost": 50, "rarity": 1, "droneImage": "drone_combat", "weaponBlueprint": "LASER_BURST_2",
	}
	drones["DEFENSE_1"] = {
		"id": "DEFENSE_1", "type": "DEFENSE", "title": "Defense Drone Mark I", "short": "Defense I",
		"desc": "Shoots down incoming missiles.", "power": 2, "cooldown": 1000.0, "speed": 5.0,
		"cost": 50, "rarity": 1, "droneImage": "drone_defense", "weaponBlueprint": "",
	}
	ships["PLAYER_SHIP_HARD"] = {
		"id": "PLAYER_SHIP_HARD", "layout": "kestral", "img": "kestral",
		"class_name": "Kestrel Cruiser", "name": "The Kestrel",
		"desc": "This class of ship was decommissioned from Federation service years ago. Reliable and well-balanced.",
		"systems": {
			"pilot": {"power": 1, "max": 3, "room": 0, "start": true, "img": "room_pilot", "slot_dir": "right", "slot_num": 0},
			"doors": {"power": 1, "max": 3, "room": 2, "start": true, "img": "room_doors", "slot_dir": "up", "slot_num": 0},
			"sensors": {"power": 1, "max": 3, "room": 3, "start": true, "img": "room_sensors", "slot_dir": "down", "slot_num": 1},
			"medbay": {"power": 1, "max": 3, "room": 4, "start": true, "img": "room_medbay", "slot_dir": "up", "slot_num": 0},
			"oxygen": {"power": 1, "max": 3, "room": 13, "start": true, "img": "room_oxygen", "slot_dir": "up", "slot_num": 0},
			"shields": {"power": 2, "max": 8, "room": 5, "start": true, "img": "room_shields", "slot_dir": "left", "slot_num": 0},
			"engines": {"power": 2, "max": 8, "room": 14, "start": true, "img": "room_engines", "slot_dir": "down", "slot_num": 2},
			"weapons": {"power": 3, "max": 8, "room": 10, "start": true, "img": "room_weapons", "slot_dir": "up", "slot_num": 1},
		},
		"weaponSlots": 4, "droneSlots": 2,
		"weapons": ["LASER_BURST_2", "MISSILES_2_PLAYER"],
		"weaponListLoad": "", "weaponListCount": 2, "missiles": 8,
		"drones": [], "droneListLoad": "", "droneParts": 2,
		"health": 30, "maxPower": 8,
		"crew": ["human", "human", "human"], "augments": [],
		"minSector": 0, "maxSector": 8, "boardingAI": "sabotage",
	}
	ships["REBEL_SKINNY"] = {
		"id": "REBEL_SKINNY", "layout": "rebel_long", "img": "rebel_long",
		"class_name": "Rebel Fighter", "name": "Rebel Fighter", "desc": "Standard Rebel patrol vessel.",
		"systems": {
			"pilot": {"power": 1, "max": 3, "room": 0, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"shields": {"power": 2, "max": 8, "room": 1, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"weapons": {"power": 2, "max": 8, "room": 2, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"engines": {"power": 2, "max": 8, "room": 3, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"oxygen": {"power": 1, "max": 3, "room": 4, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
		},
		"weaponSlots": 3, "droneSlots": 1,
		"weapons": ["LASER_BURST_2"], "weaponListLoad": "", "weaponListCount": 1, "missiles": 4,
		"drones": [], "droneListLoad": "", "droneParts": 1,
		"health": 10, "maxPower": 8, "crew": ["human", "human"], "augments": [],
		"minSector": 0, "maxSector": 8, "boardingAI": "sabotage",
	}
	ships["BOSS_1"] = {
		"id": "BOSS_1", "layout": "boss_1", "img": "boss_1",
		"class_name": "Rebel Flagship", "name": "Rebel Flagship (Phase 1)", "desc": "The massive Rebel Flagship.",
		"systems": {
			"pilot": {"power": 3, "max": 3, "room": 0, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"shields": {"power": 8, "max": 8, "room": 1, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"weapons": {"power": 6, "max": 8, "room": 2, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"engines": {"power": 4, "max": 8, "room": 3, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"oxygen": {"power": 2, "max": 3, "room": 4, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
			"cloaking": {"power": 3, "max": 3, "room": 5, "start": true, "img": "", "slot_dir": "up", "slot_num": 0},
		},
		"weaponSlots": 4, "droneSlots": 2,
		"weapons": ["LASER_BURST_2", "MISSILES_2_PLAYER", "BEAM_2", "ION_1"],
		"weaponListLoad": "", "weaponListCount": 4, "missiles": 20,
		"drones": ["COMBAT_1"], "droneListLoad": "", "droneParts": 10,
		"health": 20, "maxPower": 26, "crew": ["human", "human", "human", "human", "human"], "augments": [],
		"minSector": 7, "maxSector": 8, "boardingAI": "sabotage",
	}
	sector_types["CIVILIAN"] = ["CIVILIAN_SECTOR", "ENGI_SECTOR", "ZOLTAN_SECTOR"]
	sector_types["HOSTILE"] = ["REBEL_SECTOR", "PIRATE_SECTOR", "MANTIS_SECTOR", "ROCK_SECTOR"]
	sector_types["NEBULA"] = ["NEBULA_SECTOR", "SLUG_SECTOR"]
	for sid in ["CIVILIAN_SECTOR", "ENGI_SECTOR", "ZOLTAN_SECTOR", "REBEL_SECTOR", "PIRATE_SECTOR", "MANTIS_SECTOR", "ROCK_SECTOR", "NEBULA_SECTOR", "SLUG_SECTOR", "FINAL"]:
		sectors[sid] = {
			"id": sid, "minSector": 0, "unique": false,
			"names": [sid.replace("_", " ").capitalize()],
			"tracks": ["civilian"], "events": [], "startEvent": "START_BEACON",
		}


func _fallback_layout(layout_name: String) -> Dictionary:
	if layout_name == "kestral":
		return {
			"name": "kestral", "x_offset": 0, "y_offset": 2, "vertical": 0, "horizontal": 0,
			"ellipse": {"rx": 350, "ry": 220, "ox": -30, "oy": 0},
			"rooms": [
				{"id": 0, "x": 14, "y": 2, "w": 1, "h": 2},
				{"id": 1, "x": 12, "y": 2, "w": 2, "h": 2},
				{"id": 2, "x": 10, "y": 2, "w": 2, "h": 1},
				{"id": 3, "x": 10, "y": 3, "w": 2, "h": 1},
				{"id": 4, "x": 8, "y": 1, "w": 2, "h": 2},
				{"id": 5, "x": 8, "y": 3, "w": 2, "h": 2},
				{"id": 6, "x": 6, "y": 0, "w": 2, "h": 1},
				{"id": 7, "x": 6, "y": 1, "w": 2, "h": 2},
				{"id": 8, "x": 6, "y": 3, "w": 2, "h": 2},
				{"id": 9, "x": 6, "y": 5, "w": 2, "h": 1},
				{"id": 10, "x": 4, "y": 2, "w": 2, "h": 2},
				{"id": 11, "x": 3, "y": 1, "w": 2, "h": 1},
				{"id": 12, "x": 3, "y": 4, "w": 2, "h": 1},
				{"id": 13, "x": 1, "y": 1, "w": 2, "h": 1},
				{"id": 14, "x": 1, "y": 2, "w": 2, "h": 2},
				{"id": 15, "x": 1, "y": 4, "w": 2, "h": 1},
				{"id": 16, "x": 0, "y": 2, "w": 1, "h": 2},
			],
			"doors": [
				{"x": 14, "y": 3, "room_a": 0, "room_b": 1, "vertical": true},
				{"x": 12, "y": 2, "room_a": 1, "room_b": 2, "vertical": true},
				{"x": 12, "y": 3, "room_a": 1, "room_b": 3, "vertical": true},
				{"x": 10, "y": 2, "room_a": 2, "room_b": 4, "vertical": true},
				{"x": 10, "y": 3, "room_a": 3, "room_b": 5, "vertical": true},
				{"x": 8, "y": 3, "room_a": 4, "room_b": 5, "vertical": false},
				{"x": 8, "y": 1, "room_a": 4, "room_b": 7, "vertical": true},
				{"x": 8, "y": 4, "room_a": 5, "room_b": 8, "vertical": true},
				{"x": 7, "y": 1, "room_a": 6, "room_b": 7, "vertical": false},
				{"x": 7, "y": 5, "room_a": 8, "room_b": 9, "vertical": false},
				{"x": 6, "y": 2, "room_a": 7, "room_b": 10, "vertical": true},
				{"x": 6, "y": 3, "room_a": 8, "room_b": 10, "vertical": true},
				{"x": 4, "y": 2, "room_a": 10, "room_b": 11, "vertical": false},
				{"x": 4, "y": 4, "room_a": 10, "room_b": 12, "vertical": false},
				{"x": 3, "y": 1, "room_a": 11, "room_b": 13, "vertical": true},
				{"x": 3, "y": 4, "room_a": 12, "room_b": 15, "vertical": true},
				{"x": 2, "y": 2, "room_a": 13, "room_b": 14, "vertical": false},
				{"x": 2, "y": 4, "room_a": 14, "room_b": 15, "vertical": false},
				{"x": 1, "y": 2, "room_a": 14, "room_b": 16, "vertical": true},
				{"x": 0, "y": 2, "room_a": 16, "room_b": -1, "vertical": true},
				{"x": 0, "y": 3, "room_a": 16, "room_b": -1, "vertical": true},
			],
			"img_rect": Rect2(-59, -103, 652, 418),
			"floor_offset": Vector2(45, 93),
			"cloak_offset": Vector2(19, 19),
			"weapon_mounts": [
				{"x": 540, "y": 155, "rotate": true, "mirror": true, "slide": "up"},
				{"x": 540, "y": 262, "rotate": true, "mirror": false, "slide": "down"},
				{"x": 390, "y": 122, "rotate": true, "mirror": true, "slide": "up"},
				{"x": 390, "y": 294, "rotate": true, "mirror": false, "slide": "down"},
			],
		}
	return {
		"name": layout_name, "x_offset": 0, "y_offset": 0, "vertical": 0, "horizontal": 0,
		"ellipse": {"rx": 240, "ry": 170, "ox": 0, "oy": 0},
		"rooms": [
			{"id": 0, "x": 4, "y": 1, "w": 2, "h": 2},
			{"id": 1, "x": 2, "y": 0, "w": 2, "h": 2},
			{"id": 2, "x": 2, "y": 2, "w": 2, "h": 2},
			{"id": 3, "x": 0, "y": 1, "w": 2, "h": 2},
			{"id": 4, "x": 0, "y": 3, "w": 2, "h": 1},
			{"id": 5, "x": 4, "y": 3, "w": 2, "h": 1},
		],
		"doors": [
			{"x": 4, "y": 1, "room_a": 0, "room_b": 1, "vertical": true},
			{"x": 4, "y": 2, "room_a": 0, "room_b": 2, "vertical": true},
			{"x": 2, "y": 2, "room_a": 1, "room_b": 2, "vertical": false},
			{"x": 2, "y": 1, "room_a": 1, "room_b": 3, "vertical": true},
			{"x": 2, "y": 2, "room_a": 2, "room_b": 3, "vertical": true},
			{"x": 1, "y": 3, "room_a": 3, "room_b": 4, "vertical": false},
			{"x": 5, "y": 3, "room_a": 0, "room_b": 5, "vertical": false},
		],
		"img_rect": Rect2(-40, -60, 320, 260),
		"floor_offset": Vector2(0, 0),
		"cloak_offset": Vector2(0, 0),
		"weapon_mounts": [
			{"x": 210, "y": 70, "rotate": true, "mirror": true, "slide": "up"},
			{"x": 210, "y": 190, "rotate": true, "mirror": false, "slide": "down"},
			{"x": 140, "y": 50, "rotate": true, "mirror": true, "slide": "up"},
			{"x": 140, "y": 210, "rotate": true, "mirror": false, "slide": "down"},
		],
	}
