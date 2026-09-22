extends SceneTree

## 종족 3 × 등급 5 × 파트 타입 21의 고유 64px 알베도/RGB 마스크 세트를 생성한다.
## 실행: Godot 콘솔에서 --headless --path Godot --script res://tools/generate_part_texture_sets.gd

const VisualData = preload("res://scripts/visual_tuning.gd")
const SIZE := 64
const THEME_BASE := {
	"terran_human": Color("35485f"),
	"zerg_biological": Color("6b3a55"),
	"protoss_hitec": Color("263d79"),
}
const THEME_ACCENT := {
	"terran_human": Color("ef8b3a"),
	"zerg_biological": Color("6eea92"),
	"protoss_hitec": Color("55e8ff"),
}
const GRADE_ACCENT := {
	"common": Color("9aa5b1"),
	"uncommon": Color("6ee7a4"),
	"rare": Color("6fb8ff"),
	"epic": Color("c993ff"),
	"legendary": Color("ffd36e"),
}

func _init() -> void:
	call_deferred("generate_all")

func generate_all() -> void:
	var generated := 0
	for theme_index in VisualData.PART_TEXTURE_THEMES.size():
		var theme: String = VisualData.PART_TEXTURE_THEMES[theme_index]
		for grade_index in VisualData.PART_TEXTURE_GRADES.size():
			var grade: String = VisualData.PART_TEXTURE_GRADES[grade_index]
			for part_index in VisualData.PART_TEXTURE_PART_TYPES.size():
				var part_kind: String = VisualData.PART_TEXTURE_PART_TYPES[part_index]
				var spec := {"design_theme": theme, "grade": grade}
				write_image(VisualData.part_texture_path(part_kind, spec), make_albedo(theme, grade, part_kind, theme_index, grade_index, part_index))
				write_image(VisualData.part_texture_path(part_kind, spec, true), make_masks(theme, grade, part_kind, theme_index, grade_index, part_index))
				generated += 2
	print("[PASS] generated-part-textures ", generated, " PNG files")
	quit(0)

func write_image(resource_path: String, image: Image) -> void:
	var absolute_path := ProjectSettings.globalize_path(resource_path)
	DirAccess.make_dir_recursive_absolute(absolute_path.get_base_dir())
	var error := image.save_png(absolute_path)
	if error != OK:
		push_error("텍스처 저장 실패: %s" % resource_path)

func make_albedo(theme: String, grade: String, part_kind: String, theme_index: int, grade_index: int, part_index: int) -> Image:
	var image := Image.create(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	var base: Color = THEME_BASE[theme]
	var accent: Color = THEME_ACCENT[theme].lerp(GRADE_ACCENT[grade], 0.34)
	var seed := 101 + theme_index * 4001 + grade_index * 503 + part_index * 67
	for y in SIZE:
		for x in SIZE:
			var noise := float(hash_pixel(seed, x, y) % 13) / 170.0
			var color := base.lightened(noise)
			var panel_line := x % 16 == 0 or y % 16 == 0
			if panel_line:
				color = base.darkened(0.42)
			if (x + y + seed) % 29 == 0:
				color = base.lightened(0.22)
			if is_function_mark(part_kind, x, y, seed):
				color = accent
			if is_bolt(x, y, seed):
				color = Color("d4dce6").lerp(accent, 0.25)
			image.set_pixel(x, y, color)
	return image

func make_masks(theme: String, grade: String, part_kind: String, theme_index: int, grade_index: int, part_index: int) -> Image:
	var image := Image.create(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	var seed := 401 + theme_index * 311 + grade_index * 79 + part_index * 17
	for y in SIZE:
		for x in SIZE:
			var emission := 0.0
			if is_function_mark(part_kind, x, y, seed) and is_energy_part(part_kind):
				emission = 0.82 + float(grade_index) * 0.035
			var tint := 0.18 + float(hash_pixel(seed, x / 8, y / 8) % 4) * 0.13
			if is_function_mark(part_kind, x, y, seed):
				tint = 0.78
			var roughness := 0.40 if theme == "protoss_hitec" else 0.62
			if theme == "zerg_biological":
				roughness = 0.78
			roughness = clampf(roughness + float(hash_pixel(seed, x, y) % 7) * 0.025, 0.0, 1.0)
			image.set_pixel(x, y, Color(emission, tint, roughness, 1.0))
	return image

func is_energy_part(part_kind: String) -> bool:
	return part_kind.contains("thruster") or part_kind in ["battery", "laser", "railgun", "shield_generator", "missile_launcher", "mini_missile_launcher"]

func is_function_mark(part_kind: String, x: int, y: int, seed: int) -> bool:
	var shifted_x := posmod(x + seed, 16)
	var shifted_y := posmod(y + seed / 7, 16)
	if part_kind.contains("thruster"):
		return y > 43 and abs(x - 32) < 9
	if part_kind in ["laser", "railgun", "machine_gun"]:
		return abs(y - 32) < 3 or (x > 42 and abs(y - 32) < 9)
	if part_kind.contains("missile"):
		return (x - 21) * (x - 21) + (y - 32) * (y - 32) < 45 or (x - 43) * (x - 43) + (y - 32) * (y - 32) < 45
	if part_kind in ["battery", "shield_generator", "core"]:
		return abs(x - 32) < 3 or abs(y - 32) < 3
	if part_kind.contains("wedge"):
		return x > y + 8 and x < y + 16
	return shifted_x == 5 or shifted_y == 10

func is_bolt(x: int, y: int, seed: int) -> bool:
	return (x % 16 == 4 and y % 16 == 4) or (x % 16 == posmod(seed, 11) and y % 16 == posmod(seed / 3, 11))

func hash_pixel(seed: int, x: int, y: int) -> int:
	var value := seed + x * 374761393 + y * 668265263
	value = (value ^ (value >> 13)) * 1274126177
	return abs(value ^ (value >> 16))
