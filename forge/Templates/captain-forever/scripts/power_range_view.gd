class_name PowerRangeView
extends Control

## 코스모티어 실험 조종석 함선 단면도(소형 반응로 -> 보급 통로 승무원 배터리 운반 -> 레이저 포탑 -> 장갑 표적).
## 복원된 Cosmoteer 단면/승무원/배터리/투사체/장갑 스프라이트를 사용해 실시간 시각화한다.

const INK := Color("#08131d")
const GRID := Color("#162938")
const STEEL := Color("#57717c")
const LABEL := Color("#aac4c8")
const MINT := Color("#75e4c2")
const AMBER := Color("#ffbe76")
const RED := Color("#ff8277")

var sim: PowerRangeSim
var font: Font

func _ready() -> void:
	clip_contents = true
	custom_minimum_size = Vector2(0, 210)
	CosmoteerAssets.ensure_loaded()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), INK)
	if sim == null or size.x < 20.0 or size.y < 20.0:
		return
	var use_font: Font = font if font != null else ThemeDB.fallback_font
	var design := Vector2(760, 370)
	var scale_factor := minf(size.x / design.x, size.y / design.y)
	var origin_off := (size - design * scale_factor) * 0.5
	draw_set_transform(origin_off, 0.0, Vector2.ONE * scale_factor)

	for x in range(0, 761, 22):
		draw_line(Vector2(x, 5), Vector2(x, 365), GRID)
	for y in range(9, 365, 22):
		draw_line(Vector2(3, y), Vector2(757, y), GRID)

	var hull := PackedVector2Array([
		Vector2(52, 143), Vector2(88, 118), Vector2(127, 118),
		Vector2(150, 95), Vector2(251, 95), Vector2(278, 120), Vector2(328, 120),
		Vector2(369, 149), Vector2(386, 170), Vector2(386, 201), Vector2(361, 224),
		Vector2(323, 249), Vector2(273, 249), Vector2(246, 273), Vector2(149, 273),
		Vector2(124, 249), Vector2(86, 249), Vector2(52, 225)
	])
	draw_colored_polygon(hull, Color("#203442"))
	hull.append(hull[0])
	draw_polyline(hull, STEEL, 2.0, true)

	for y in [144, 196]:
		draw_rect(Rect2(43, y, 19, 28), Color("#4c646c"))
		for k in range(4):
			draw_line(Vector2(45, y + 3 + k * 7), Vector2(59, y + 3 + k * 7), INK, 2.0)
	for y in [105, 240]:
		draw_rect(Rect2(159, y, 82, 21), Color("#344c5c"))
		for k in range(7):
			draw_line(Vector2(162 + k * 11, y + 2), Vector2(168 + k * 11, y + 18), STEEL, 2.0)

	# 소형 반응로
	draw_rect(Rect2(83, 141, 81, 84), Color("#244946"))
	var rtex: Texture2D = CosmoteerAssets.get_part_texture("cosmoteer.reactor_small", "cutaway")
	if rtex != null:
		draw_texture_rect(rtex, Rect2(83, 141, 81, 84), false, Color.WHITE)
	draw_rect(Rect2(83, 141, 81, 84), MINT, false, 1.5)
	var center := Vector2(123, 183)
	draw_arc(center, 29.0, 0.0, TAU, 48, MINT.darkened(0.45), 4.0, true)
	draw_arc(center, 29.0, -PI * 0.5, -PI * 0.5 + TAU * float(sim.reactor_energy) / maxf(1.0, float(sim.reactor_capacity)), 48, MINT, 3.0, true)

	# 보급 통로 + 격벽 게이트
	draw_rect(Rect2(164, 170, 132, 28), Color("#17242b"))
	var ctex_cor: Texture2D = CosmoteerAssets.get_part_texture("cosmoteer.corridor", "cutaway")
	if ctex_cor != null:
		for cx in range(164, 290, 28):
			draw_texture_rect(ctex_cor, Rect2(cx, 170, 28, 28), false, Color(0.9, 0.95, 1.0, 0.85))
	draw_dashed_line(Vector2(167, 184), Vector2(294, 184), STEEL, 1.0, 5.0)
	var gate_color := MINT if sim.route_open else RED
	draw_rect(Rect2(225, 160, 5, 12 if sim.route_open else 46), gate_color)
	draw_rect(Rect2(225, 196, 5, 10), gate_color)

	# 장착 무기 포탑
	draw_rect(Rect2(297, 157, 56, 54), Color("#4e4139"))
	var ltex: Texture2D = CosmoteerAssets.get_part_texture(sim.active_weapon_id, "cutaway")
	if ltex != null:
		draw_set_transform(origin_off + Vector2(334, 184) * scale_factor, PI * 0.5, Vector2.ONE * scale_factor)
		draw_texture_rect(ltex, Rect2(-26, -34, 52, 68), false, Color.WHITE)
		draw_set_transform(origin_off, 0.0, Vector2.ONE * scale_factor)
	var ttex: Texture2D = CosmoteerAssets.get_turret_texture(sim.active_weapon_id)
	if ttex != null:
		draw_set_transform(origin_off + Vector2(342, 184) * scale_factor, PI * 0.5, Vector2.ONE * scale_factor)
		draw_texture_rect(ttex, Rect2(-24, -24, 48, 48), false, Color.WHITE)
		draw_set_transform(origin_off, 0.0, Vector2.ONE * scale_factor)
	draw_circle(Vector2(317, 207), 4.5, MINT if sim.gunner_active else RED)

	# 배터리 운반 승무원 (FTL 원본 엔지/인간 스프라이트 렌더링 + 배터리 아이콘)
	var carrier := Vector2(162.0 + float(sim.carrier_position) * 135.0, 184.0)
	var fdir := Vector2.RIGHT if sim.cargo > 0 else Vector2.LEFT
	FtlCrewAssets.draw_crew_sprite(self, carrier, "engi", "walk", fdir, sim.elapsed, true, 1.0, false, 30.0)
	if sim.cargo > 0:
		var btex: Texture2D = CosmoteerAssets.get_sprite_texture("battery")
		if btex != null:
			draw_texture_rect(btex, Rect2(carrier + Vector2(6, -12), Vector2(14, 14)), false, Color.WHITE)

	if use_font != null:
		_callout(use_font, Vector2(122, 140), Vector2(122, 73), "소형 반응로", MINT)
		_callout(use_font, Vector2(327, 154), Vector2(327, 82), sim.active_weapon_name, AMBER)
		_callout(use_font, Vector2(224, 205), Vector2(224, 312), "보급 통로", LABEL)

	var tx := lerpf(510.0, 695.0, clampf(float(sim.target_distance) / 320.0, 0.0, 1.0))
	var target := Vector2(tx, 184.0)
	draw_dashed_line(Vector2(398, 184), target - Vector2(25, 0), STEEL, 1.0, 7.0)

	var preset: Dictionary = PowerRangeSim.WEAPON_PRESETS.get(sim.active_weapon_id, {})
	var shot_key := str(preset.get("shot_sprite", "shot_laser_small"))
	var stex: Texture2D = CosmoteerAssets.get_sprite_texture(shot_key)
	for projectile in sim.projectiles:
		var release_x := lerpf(510.0, 695.0, clampf(float(projectile.distance) / 320.0, 0.0, 1.0))
		var bolt_x := lerpf(390.0, release_x, clampf(float(projectile.progress), 0.0, 1.0))
		if stex != null:
			draw_texture_rect(stex, Rect2(Vector2(bolt_x - 16.0, 178.0), Vector2(24, 12)), false, Color.WHITE)
		else:
			draw_line(Vector2(bolt_x - 15.0, 184.0), Vector2(bolt_x, 184.0), AMBER, 4.0, true)

	var alive: bool = sim.armor_hp > 0.0
	if alive:
		var arm_tex: Texture2D = CosmoteerAssets.get_part_texture("cosmoteer.armor", "cutaway")
		if arm_tex != null:
			draw_texture_rect(arm_tex, Rect2(target - Vector2(22, 22), Vector2(44, 44)), false, Color.WHITE)
		else:
			draw_rect(Rect2(target - Vector2(22, 22), Vector2(44, 44)), Color("#4f4848"))
		draw_rect(Rect2(target - Vector2(22, 22), Vector2(44, 44)), RED, false, 2.0)
	else:
		var etex: Texture2D = CosmoteerAssets.get_sprite_texture("exp_big_1")
		if etex != null:
			draw_texture_rect(etex, Rect2(target - Vector2(28, 28), Vector2(56, 56)), false, Color.WHITE)
		for k in range(8):
			var dir := Vector2.RIGHT.rotated(k * TAU / 8.0)
			draw_line(target + dir * 16.0, target + dir * (24.0 + float(k % 3) * 4.0), RED, 2.0)

	if use_font != null:
		_callout(use_font, target + Vector2(0, -23), Vector2(tx, 108), "장갑 표적" if alive else "표적 파괴", RED)
		draw_string(use_font, Vector2(392, 232), "%d m (최대 %d m)" % [roundi(sim.target_distance), roundi(sim.maximum_range)], HORIZONTAL_ALIGNMENT_CENTER, tx - 392.0, 22, LABEL)
	draw_set_transform(Vector2.ZERO)

func _callout(use_font: Font, origin: Vector2, end: Vector2, caption: String, color: Color) -> void:
	draw_line(origin, end, color.darkened(0.45), 1.4)
	draw_line(end - Vector2(6, 0), end + Vector2(6, 0), color, 2.4)
	var baseline := end.y - 10.0 if end.y < origin.y else end.y + 28.0
	draw_string(use_font, Vector2(end.x - 108.0, baseline), caption, HORIZONTAL_ALIGNMENT_CENTER, 216.0, 22, color)
