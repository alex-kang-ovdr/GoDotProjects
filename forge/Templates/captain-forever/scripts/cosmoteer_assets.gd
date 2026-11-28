class_name CosmoteerAssets
extends RefCounted

const ATLAS_DIR := "res://assets/cosmoteer"
const ATLAS_JSON_PATH := "res://assets/cosmoteer/web_atlas.json"

static var _loaded := false
static var _atlas_texture: Texture2D = null
static var _part_textures: Dictionary = {}   # cosmo_id -> {"cutaway": AtlasTexture, "roof": AtlasTexture, "turret": AtlasTexture}
static var _sprite_textures: Dictionary = {} # key -> AtlasTexture

const MODULE_TO_COSMO := {
	# 무기
	"laser": "cosmoteer.laser_blaster_small",
	"cosmo_heavy_laser": "cosmoteer.laser_blaster_large",
	"cosmo_disruptor": "cosmoteer.disruptor",
	"cosmo_ion_beam": "cosmoteer.ion_beam_emitter",
	"cosmo_cannon_med": "cosmoteer.cannon_med",
	"cosmo_cannon_large": "cosmoteer.cannon_large",
	"cosmo_cannon_deck": "cosmoteer.cannon_deck",
	"cosmo_chaingun": "cosmoteer.chaingun",
	"cosmo_flak": "cosmoteer.flak_cannon_large",
	"cosmo_pd": "cosmoteer.point_defense",
	"cosmo_mining_laser": "cosmoteer.mining_laser_small",
	"cosmo_resonance_turret": "cosmoteer.resonance_beam_turret",
	"cosmo_tractor_beam": "cosmoteer.tractor_beam_emitter",
	"railgun": "cosmoteer.railgun_launcher",
	"missile_launcher": "cosmoteer.missile_launcher",
	# 장갑·구조·방어
	"cosmo_armor": "cosmoteer.armor",
	"cosmo_armor_2x1": "cosmoteer.armor_2x1",
	"cosmo_armor_wedge": "cosmoteer.armor_wedge",
	"cosmo_structure": "cosmoteer.structure",
	"cosmo_shield_small": "cosmoteer.shield_gen_small",
	"cosmo_shield_large": "cosmoteer.shield_gen_large",
	# 추진
	"cosmo_thruster_small": "cosmoteer.thruster_small",
	"cosmo_thruster_med": "cosmoteer.thruster_med",
	"cosmo_thruster_large": "cosmoteer.thruster_large",
	"cosmo_thruster_boost": "cosmoteer.thruster_boost",
	"cosmo_thruster_2way": "cosmoteer.thruster_small_2way",
	"cosmo_engine_room": "cosmoteer.engine_room",
	# 전력·열
	"cosmo_reactor_small": "cosmoteer.reactor_small",
	"cosmo_reactor_med": "cosmoteer.reactor_med",
	"cosmo_reactor_large": "cosmoteer.reactor_large",
	"cosmo_power_storage": "cosmoteer.power_storage",
	"cosmo_radiator": "cosmoteer.radiator",
	# 지원·제어·통로
	"cosmo_corridor": "cosmoteer.corridor",
	"cosmo_conveyor": "cosmoteer.conveyor",
	"cosmo_airlock": "cosmoteer.airlock",
	"cosmo_extinguisher": "cosmoteer.fire_extinguisher",
	"cosmo_control_small": "cosmoteer.control_room_small",
	"cosmo_sensor_array": "cosmoteer.sensor_array",
	"cosmo_crew_quarters": "cosmoteer.crew_quarters_small",
	"cosmo_storage": "cosmoteer.storage_2x2",
	"cosmo_hyperdrive": "cosmoteer.hyperdrive_small",
}

static func ensure_loaded() -> bool:
	if _loaded:
		return _atlas_texture != null
	_loaded = true
	if not FileAccess.file_exists(ATLAS_JSON_PATH):
		return false
	var meta: Variant = JSON.parse_string(FileAccess.get_file_as_string(ATLAS_JSON_PATH))
	if not (meta is Dictionary) or not meta.has("parts"):
		return false
	var chunks: Array = meta.get("chunks", [])
	if chunks.is_empty():
		return false
	var b64_parts := PackedStringArray()
	for cname in chunks:
		var cpath := ATLAS_DIR.path_join(str(cname))
		if not FileAccess.file_exists(cpath):
			return false
		b64_parts.append(FileAccess.get_file_as_string(cpath).strip_edges())
	var raw := Marshalls.base64_to_raw("".join(b64_parts))
	if raw.is_empty():
		return false
	var img := Image.new()
	var fmt := str(meta.get("format", "webp")).to_lower()
	var err := img.load_webp_from_buffer(raw) if fmt == "webp" else img.load_png_from_buffer(raw)
	if err != OK:
		return false
	_atlas_texture = ImageTexture.create_from_image(img)
	var parts_dict: Dictionary = meta.get("parts", {})
	for pid in parts_dict:
		var entry: Dictionary = parts_dict[pid]
		var tex_map := {}
		for variant in ["cutaway", "roof", "turret"]:
			if entry.has(variant):
				var arr: Array = entry[variant]
				if arr.size() == 4:
					var at := AtlasTexture.new()
					at.atlas = _atlas_texture
					at.region = Rect2(float(arr[0]), float(arr[1]), float(arr[2]), float(arr[3]))
					tex_map[variant] = at
		if not tex_map.is_empty():
			_part_textures[str(pid)] = tex_map
	var sprites_dict: Dictionary = meta.get("sprites", {})
	for skey in sprites_dict:
		var arr: Array = sprites_dict[skey]
		if arr.size() == 4:
			var at := AtlasTexture.new()
			at.atlas = _atlas_texture
			at.region = Rect2(float(arr[0]), float(arr[1]), float(arr[2]), float(arr[3]))
			_sprite_textures[str(skey)] = at
	return _atlas_texture != null

static func part_count() -> int:
	ensure_loaded()
	return _part_textures.size()

static func sprite_count() -> int:
	ensure_loaded()
	return _sprite_textures.size()

static func cosmo_id_for_module(kind: String) -> String:
	return str(MODULE_TO_COSMO.get(kind, ""))

static func get_part_texture(kind_or_cosmo_id: String, variant: String = "cutaway") -> Texture2D:
	ensure_loaded()
	var cid := str(MODULE_TO_COSMO.get(kind_or_cosmo_id, kind_or_cosmo_id))
	var entry: Variant = _part_textures.get(cid, null)
	if entry is Dictionary:
		var tex: Variant = (entry as Dictionary).get(variant, null)
		if tex is Texture2D:
			return tex
		for fallback in ["cutaway", "roof", "turret"]:
			var ftex: Variant = (entry as Dictionary).get(fallback, null)
			if ftex is Texture2D:
				return ftex
	return null

static func get_turret_texture(kind_or_cosmo_id: String) -> Texture2D:
	ensure_loaded()
	var cid := str(MODULE_TO_COSMO.get(kind_or_cosmo_id, kind_or_cosmo_id))
	var entry: Variant = _part_textures.get(cid, null)
	if entry is Dictionary:
		var tex: Variant = (entry as Dictionary).get("turret", null)
		if tex is Texture2D:
			return tex
	return null

static func get_sprite_texture(sprite_key: String) -> Texture2D:
	ensure_loaded()
	var tex: Variant = _sprite_textures.get(sprite_key, null)
	return tex if tex is Texture2D else null
