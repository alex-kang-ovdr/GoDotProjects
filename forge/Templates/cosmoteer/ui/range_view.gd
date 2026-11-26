extends Control

const AssetLoader := preload("res://sim/asset_loader.gd")
const INK := Color("#0c1822")
const GRID := Color("#1c2c38")
const STEEL := Color("#57717c")
const LABEL := Color("#aac4c8")
const MINT := Color("#75e4c2")
const AMBER := Color("#ffbe76")
const RED := Color("#ff8277")

var sim
var font: Font

func _draw() -> void:
	if sim == null or font == null:
		return
	draw_rect(Rect2(Vector2.ZERO, size), INK)
	var design := Vector2(760, 370)
	var scale_factor := minf(size.x / design.x, size.y / design.y)
	draw_set_transform((size - design * scale_factor) / 2, 0, Vector2.ONE * scale_factor)
	for x in range(0, 761, 22):
		draw_line(Vector2(x, 5), Vector2(x, 365), GRID)
	for y in range(9, 365, 22):
		draw_line(Vector2(3, y), Vector2(757, y), GRID)
	# Top-down cutaway. Its geometry is a purpose-built teaching diagram.
	var hull := PackedVector2Array([Vector2(52,143),Vector2(88,118),Vector2(127,118),
		Vector2(150,95),Vector2(251,95),Vector2(278,120),Vector2(328,120),
		Vector2(369,149),Vector2(386,170),Vector2(386,201),Vector2(361,224),
		Vector2(323,249),Vector2(273,249),Vector2(246,273),Vector2(149,273),
		Vector2(124,249),Vector2(86,249),Vector2(52,225)])
	draw_colored_polygon(hull, Color("#233744"))
	hull.append(hull[0])
	draw_polyline(hull, STEEL, 2, true)
	for y in [144, 196]:
		draw_rect(Rect2(43, y, 19, 28), Color("#4c646c"))
		for k in range(4):
			draw_line(Vector2(45, y+3+k*7), Vector2(59, y+3+k*7), INK, 2)
	for y in [105, 240]:
		draw_rect(Rect2(159, y, 82, 21), Color("#344c5c"))
		for k in range(7):
			draw_line(Vector2(162+k*11,y+2),Vector2(168+k*11,y+18),STEEL,2)
	draw_rect(Rect2(83, 141, 81, 84), Color("#244946"))
	var rtex: Texture2D = AssetLoader.get_part_texture("cosmoteer.reactor_small", "cutaway")
	if rtex != null:
		draw_texture_rect(rtex, Rect2(83, 141, 81, 84), false, Color.WHITE)
	draw_rect(Rect2(83, 141, 81, 84), MINT, false, 1)
	var center := Vector2(123, 183)
	draw_arc(center, 29, 0, TAU, 48, MINT.darkened(.45), 4, true)
	draw_arc(center, 29, -PI/2, -PI/2 + TAU*float(sim.reactor_energy)/maxf(1,sim.reactor_capacity), 48, MINT, 3, true)
	if rtex == null:
		draw_circle(center, 17, Color("#42675e"), true, -1, true)
		draw_circle(center, 8, MINT, true, -1, true)
	draw_rect(Rect2(164, 170, 132, 28), Color("#17242b"))
	var ctex_cor: Texture2D = AssetLoader.get_part_texture("cosmoteer.corridor", "cutaway")
	if ctex_cor != null:
		for cx in range(164, 290, 28):
			draw_texture_rect(ctex_cor, Rect2(cx, 170, 28, 28), false, Color(0.9, 0.95, 1.0, 0.85))
	draw_dashed_line(Vector2(167,184),Vector2(294,184),STEEL,1,5)
	var gate_color := MINT if sim.route_open else RED
	draw_rect(Rect2(225, 160, 5, 12 if sim.route_open else 46), gate_color)
	draw_rect(Rect2(225, 196, 5, 10), gate_color)
	draw_rect(Rect2(297, 157, 56, 54), Color("#4e4139"))
	var ltex: Texture2D = AssetLoader.get_part_texture("cosmoteer.laser_blaster_small", "cutaway")
	if ltex != null:
		draw_set_transform(Vector2(342, 184), PI * 0.5, Vector2.ONE)
		draw_texture_rect(ltex, Rect2(-22, -46, 44, 92), false, Color.WHITE)
		draw_set_transform((size - design * scale_factor) / 2, 0, Vector2.ONE * scale_factor)
	else:
		draw_rect(Rect2(297, 157, 56, 54), AMBER, false, 1)
		draw_circle(Vector2(325,184),16,Color("#9a7b60"),true,-1,true)
		draw_rect(Rect2(325,176,60,16),STEEL)
		draw_rect(Rect2(338,180,56,8),AMBER.darkened(.18))
	draw_circle(Vector2(317,207),4,MINT if sim.gunner_active else RED)
	var carrier := Vector2(162 + float(sim.carrier_position)*135,184)
	var crtex: Texture2D = AssetLoader.get_sprite("crew_carry" if sim.cargo > 0 else "crew_walk")
	if crtex != null:
		draw_texture_rect(crtex, Rect2(carrier - Vector2(12, 12), Vector2(24, 24)), false, Color.WHITE)
		if sim.cargo > 0:
			var btex: Texture2D = AssetLoader.get_sprite("battery")
			if btex != null:
				draw_texture_rect(btex, Rect2(carrier - Vector2(7, 7), Vector2(14, 14)), false, Color.WHITE)
	else:
		draw_circle(carrier,7,Color("#eef6ef"),true,-1,true)
		if sim.cargo > 0:
			draw_rect(Rect2(carrier + Vector2(-4,-4), Vector2(8,8)), MINT.darkened(.25))
	_callout(Vector2(122,140),Vector2(122,73),"소형 반응로",MINT)
	_callout(Vector2(327,154),Vector2(327,82),"소형 레이저",AMBER)
	_callout(Vector2(224,205),Vector2(224,312),"보급 통로",LABEL)
	var tx := lerpf(522, 687, clampf(float(sim.target_distance)/300.0, 0, 1))
	var target := Vector2(tx,184)
	draw_dashed_line(Vector2(398,184), target - Vector2(25,0), STEEL,1,7)
	for projectile in sim.projectiles:
		var release_x := lerpf(522,687,clampf(float(projectile.distance)/300.0,0,1))
		var bolt := lerpf(393,release_x,clampf(projectile.progress,0,1))
		draw_line(Vector2(bolt-15,184),Vector2(bolt,184),AMBER,4,true)
	var alive: bool = sim.armor_hp > 0
	if alive:
		draw_rect(Rect2(target - Vector2(22,22),Vector2(44,44)),Color("#4f4848"))
		draw_rect(Rect2(target - Vector2(22,22),Vector2(44,44)),RED,false,2)
		for k in [-12,0,12]:
			draw_line(target + Vector2(k-6,13),target + Vector2(k+6,-13),RED.darkened(.35),3)
	else:
		for k in range(8):
			var direction := Vector2.RIGHT.rotated(k*TAU/8)
			draw_line(target+direction*16,target+direction*(24+k%3*4),RED,2)
	_callout(target+Vector2(0,-23),Vector2(tx,112),"장갑 표적" if alive else "표적 파괴",RED)
	draw_string(font, Vector2(397,219), "%d m" % sim.target_distance,HORIZONTAL_ALIGNMENT_CENTER,tx-397,15,LABEL)

func _callout(origin: Vector2, end: Vector2, caption: String, color: Color) -> void:
	draw_line(origin,end,color.darkened(.45),1)
	draw_line(end-Vector2(4,0),end+Vector2(4,0),color,2)
	var baseline := end.y-9 if end.y<origin.y else end.y+22
	draw_string(font,Vector2(end.x-68, baseline),caption,HORIZONTAL_ALIGNMENT_CENTER,136,15,color)
