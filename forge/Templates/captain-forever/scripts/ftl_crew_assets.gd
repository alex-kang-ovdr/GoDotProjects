class_name FtlCrewAssets
extends RefCounted

## FTL: Faster Than Light 원본 승조원 스프라이트(people/*_base.png) 로더 및 애니메이션 렌더러.
## 종족별 원작 스탯(Human / Engi / Mantis / Rock / Zoltan / Slug / Crystal / Lanius)과
## 보행(4방향)·건설/수리/소화(Row 4)·백병전/사보타주(Row 5) 프레임을 렌더링한다.

const SPRITES_JSON_PATH := "res://assets/ftl/crew_sprites.json"
const FRAME_W := 35.0
const FRAME_H := 35.0

const SPECIES_ORDER := ["human", "engi", "mantis", "rock", "zoltan"]
const SPECIES_STATS := {
	"human": {
		"label": "인간 (Human)",
		"role": "균형 · 숙련도 성장",
		"max_hp": 100.0,
		"move": 1.0,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("cfe8ff"),
	},
	"engi": {
		"label": "엔지 (Engi)",
		"role": "건설·수리 2.0× · 전투 0.5×",
		"max_hp": 100.0,
		"move": 1.0,
		"repair": 2.0,
		"combat": 0.5,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("86e8d4"),
	},
	"mantis": {
		"label": "맨티스 (Mantis)",
		"role": "백병전 1.5× · 이동 1.2×",
		"max_hp": 100.0,
		"move": 1.2,
		"repair": 0.5,
		"combat": 1.5,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("9dff78"),
	},
	"rock": {
		"label": "락맨 (Rock)",
		"role": "체력 150 · 화재 면역",
		"max_hp": 150.0,
		"move": 0.65,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": true,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("e0a978"),
	},
	"zoltan": {
		"label": "졸탄 (Zoltan)",
		"role": "주둔 구획 +300W 발전 · 자폭 15",
		"max_hp": 70.0,
		"move": 1.0,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 300.0,
		"tint": Color("8cff66"),
	},
	"crystal": {
		"label": "크리스탈",
		"role": "체력 125 · 저산소 저항",
		"max_hp": 125.0,
		"move": 0.85,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("84e6ff"),
	},
	"lanius": {
		"label": "라니우스",
		"role": "무산소 생존 · 금속 체질",
		"max_hp": 100.0,
		"move": 0.85,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": false,
		"no_o2": true,
		"zoltan_watts": 0.0,
		"tint": Color("b8c6d8"),
	},
	"slug": {
		"label": "슬러그",
		"role": "텔레파시 감지",
		"max_hp": 100.0,
		"move": 1.0,
		"repair": 1.0,
		"combat": 1.0,
		"fire_immune": false,
		"no_o2": false,
		"zoltan_watts": 0.0,
		"tint": Color("d8a4ff"),
	},
}

static var _loaded := false
static var _textures: Dictionary = {}

static func ensure_loaded() -> bool:
	if _loaded:
		return not _textures.is_empty()
	_loaded = true
	if not FileAccess.file_exists(SPRITES_JSON_PATH):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SPRITES_JSON_PATH))
	if not (parsed is Dictionary) or not (parsed as Dictionary).has("sheets"):
		return false
	var sheets: Dictionary = (parsed as Dictionary).get("sheets", {})
	for key in sheets.keys():
		var rec: Dictionary = sheets[key]
		var b64 := str(rec.get("png_b64", ""))
		if b64.is_empty():
			continue
		var raw := Marshalls.base64_to_raw(b64)
		if raw.is_empty():
			continue
		var img := Image.new()
		if img.load_png_from_buffer(raw) == OK:
			_textures[str(key)] = ImageTexture.create_from_image(img)
	return not _textures.is_empty()

static func loaded_sheet_count() -> int:
	ensure_loaded()
	return _textures.size()

static func get_sheet(species: String) -> Texture2D:
	ensure_loaded()
	if _textures.has(species):
		return _textures[species]
	return _textures.get("human", null)

static func species_spec(species: String) -> Dictionary:
	return SPECIES_STATS.get(species, SPECIES_STATS["human"])

static func get_icon_atlas(species: String) -> AtlasTexture:
	var sheet := get_sheet(species)
	if sheet == null:
		return null
	var at := AtlasTexture.new()
	at.atlas = sheet
	at.region = Rect2(0.0, 0.0, FRAME_W, FRAME_H)
	return at

static func draw_crew_sprite(
	canvas: CanvasItem,
	pos: Vector2,
	species: String,
	state: String,
	facing: Vector2,
	anim_t: float,
	is_friendly: bool,
	hp_ratio: float,
	selected: bool = false,
	draw_size: float = 32.0
) -> void:
	if selected:
		canvas.draw_circle(pos, draw_size * 0.48, Color(0.28, 1.0, 0.48, 0.26))
		canvas.draw_arc(pos, draw_size * 0.48, 0.0, TAU, 18, Color(0.38, 1.0, 0.56, 0.95), 1.8)
	elif not is_friendly:
		canvas.draw_circle(pos, draw_size * 0.44, Color(1.0, 0.24, 0.24, 0.22))
		canvas.draw_arc(pos, draw_size * 0.44, 0.0, TAU, 16, Color(1.0, 0.36, 0.36, 0.85), 1.5)

	var tex := get_sheet(species)
	if tex != null:
		# Authentic FTL crew spritesheet rows: 0=Down, 1=Right, 2=Up, 3=Left, 4=Repair/Build/Fire, 5=Fight/Sabotage
		var row := 0
		var frame := 0
		if state == "walk":
			if absf(facing.x) > absf(facing.y):
				row = 1 if facing.x >= 0.0 else 3
			else:
				row = 0 if facing.y >= 0.0 else 2
			frame = int(anim_t * 8.0) & 3
		elif state == "repair" or state == "build" or state == "fire":
			row = 4
			frame = int(anim_t * 6.5) & 3
		elif state == "fight" or state == "sabotage":
			row = 5
			frame = int(anim_t * 7.5) & 3
		elif state == "man":
			row = 2
			frame = 0
		var tw := float(tex.get_width())
		var th := float(tex.get_height())
		var max_rows := maxi(1, int(th / FRAME_H))
		var sy := float(mini(row, max_rows - 1)) * FRAME_H
		var sx := fmod(float(frame) * FRAME_W, maxf(FRAME_W, tw))
		var src := Rect2(sx, sy, minf(FRAME_W, tw), minf(FRAME_H, th))
		var tint := Color.WHITE if is_friendly else Color(1.0, 0.56, 0.56)
		canvas.draw_texture_rect_region(tex, Rect2(pos - Vector2(draw_size, draw_size) * 0.5, Vector2(draw_size, draw_size)), src, tint)
	else:
		var sp := species_spec(species)
		var c: Color = sp.get("tint", Color("cfe8ff")) if is_friendly else Color("ff5c5c")
		canvas.draw_circle(pos, draw_size * 0.28, c)
		canvas.draw_arc(pos, draw_size * 0.28, 0.0, TAU, 12, Color.BLACK, 1.4)

	# State spark / combat flash
	if (state == "repair" or state == "build") and fmod(anim_t * 5.0, 1.0) < 0.45:
		canvas.draw_circle(pos + Vector2(draw_size * 0.26, -draw_size * 0.16), 2.6, Color("ffd866", 0.9))
	elif (state == "fight" or state == "sabotage") and fmod(anim_t * 6.0, 1.0) < 0.4:
		canvas.draw_circle(pos + Vector2(draw_size * 0.24, -draw_size * 0.10), 3.0, Color("ff5c5c", 0.92))

	# FTL Crew HP bar above head
	var clamped_hp := clampf(hp_ratio, 0.0, 1.0)
	if clamped_hp < 0.995 or selected or not is_friendly:
		var bw := maxf(18.0, draw_size * 0.76)
		var br := Rect2(pos + Vector2(-bw * 0.5, -draw_size * 0.56), Vector2(bw, 3.6))
		canvas.draw_rect(br, Color(0.06, 0.08, 0.11, 0.92), true)
		var hcol := (Color("56ff84") if clamped_hp > 0.45 else Color("ffae42")) if is_friendly else Color("ff5252")
		canvas.draw_rect(Rect2(br.position, Vector2(bw * clamped_hp, br.size.y)), hcol, true)
