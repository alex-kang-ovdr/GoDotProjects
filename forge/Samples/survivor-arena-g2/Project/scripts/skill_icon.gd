extends Control
## Small code-drawn pictograms. No texture downloads, font glyphs, or per-frame redraw.

var skill_id = "kunai"
var ink = Color("345c54")
var accent = Color("68af8c")
var evolved = false

func configure(id: String, color: Color = Color("345c54"), is_evolved: bool = false) -> void:
	skill_id = id.trim_prefix("E:")
	ink = color
	accent = Color("ba8644") if is_evolved else color.lightened(0.22)
	evolved = is_evolved
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(28, 28)
	resized.connect(queue_redraw)
	queue_redraw()

func _draw() -> void:
	var scale_factor = minf(size.x, size.y) / 32.0
	draw_set_transform((size - Vector2.ONE * 32.0 * scale_factor) * 0.5, 0.0, Vector2.ONE * scale_factor)
	match skill_id:
		"kunai":
			_poly([Vector2(6,6),Vector2(19,9),Vector2(24,22),Vector2(12,18)], ink)
			draw_line(Vector2(10,10),Vector2(22,22),accent,2.0,true)
			draw_arc(Vector2(25,25),3,0,TAU,14,ink,2,true)
		"bat":
			draw_line(Vector2(9,25),Vector2(20,11),ink,4,true)
			draw_line(Vector2(16,16),Vector2(24,6),ink,8,true)
			draw_line(Vector2(6,23),Vector2(12,28),ink,2,true)
		"katana":
			_poly([Vector2(7,23),Vector2(20,5),Vector2(27,4),Vector2(13,25)],ink)
			draw_line(Vector2(9,23),Vector2(5,29),ink,3,true)
			draw_line(Vector2(4,20),Vector2(15,28),accent,3,true)
		"shotgun":
			draw_line(Vector2(8,20),Vector2(26,9),ink,6,true)
			draw_line(Vector2(11,23),Vector2(27,13),accent,3,true)
			_poly([Vector2(3,22),Vector2(9,18),Vector2(13,22),Vector2(6,28)],ink)
		"revolver":
			draw_rect(Rect2(8,9,20,6),ink)
			draw_circle(Vector2(12,16),6,ink)
			draw_circle(Vector2(12,16),2,accent)
			_poly([Vector2(7,18),Vector2(15,20),Vector2(11,29),Vector2(4,26)],ink)
		"guardian":
			draw_arc(Vector2(16,16),9,0,TAU,28,accent,2,true)
			for i in range(3):
				var at = Vector2(16,16) + Vector2.from_angle(i * TAU / 3.0 - PI / 2.0) * 10.0
				_poly([at+Vector2(-4,3),at+Vector2(0,-5),at+Vector2(4,3)],ink)
		"rocket":
			_poly([Vector2(24,4),Vector2(27,13),Vector2(16,24),Vector2(8,16)],ink)
			_poly([Vector2(8,16),Vector2(4,25),Vector2(14,22)],accent)
			draw_circle(Vector2(20,12),2.5,Color("f7edce"))
			draw_line(Vector2(9,24),Vector2(5,29),ink,2,true)
		"lightning":
			_poly([Vector2(19,2),Vector2(6,18),Vector2(14,18),Vector2(11,30),Vector2(27,12),Vector2(18,12)],ink)
		"molotov":
			_poly([Vector2(13,6),Vector2(20,8),Vector2(18,14),Vector2(23,24),Vector2(20,28),Vector2(10,27),Vector2(8,21),Vector2(14,13)],ink)
			_poly([Vector2(20,7),Vector2(22,1),Vector2(27,7),Vector2(24,11)],accent)
		"drill":
			_poly([Vector2(26,4),Vector2(24,21),Vector2(12,10)],ink)
			draw_line(Vector2(11,13),Vector2(22,24),accent,3,true)
			draw_line(Vector2(5,19),Vector2(16,30),ink,3,true)
			draw_line(Vector2(6,26),Vector2(18,14),ink,6,true)
		"droneA", "droneB", "destroyer":
			draw_rect(Rect2(11,11,10,10),ink)
			for at in [Vector2(6,6),Vector2(26,6),Vector2(6,26),Vector2(26,26)]:
				draw_line(Vector2(16,16),at,ink,2,true)
				draw_arc(at,4,0,TAU,14,accent,2,true)
			if skill_id == "droneB":
				draw_circle(Vector2(16,16),2,Color("e9d9ab"))
			elif skill_id == "destroyer":
				draw_line(Vector2(10,16),Vector2(22,16),Color("ead3a2"),3,true)
		"soccer":
			draw_circle(Vector2(16,16),12,ink)
			draw_arc(Vector2(16,16),9,0,TAU,24,accent,1.5,true)
			var points: Array[Vector2] = []
			for i in range(5):
				var at = Vector2(16,16)+Vector2.from_angle(i*TAU/5.0-PI/2)*5
				points.append(at)
				draw_line(at,Vector2(16,16)+(at-Vector2(16,16))*2.2,accent,2,true)
			_poly(points,accent)
		"brick":
			draw_rect(Rect2(4,7,24,18),ink)
			draw_line(Vector2(4,16),Vector2(28,16),accent,2,true)
			draw_line(Vector2(17,7),Vector2(17,16),accent,2,true)
			draw_line(Vector2(12,16),Vector2(12,25),accent,2,true)
		"boomerang":
			_poly([Vector2(4,24),Vector2(14,4),Vector2(20,4),Vector2(29,24),Vector2(24,26),Vector2(17,14),Vector2(9,27)],ink)
		"forcefield":
			draw_arc(Vector2(16,16),12,0,TAU,30,ink,2.5,true)
			draw_arc(Vector2(16,16),8,0,TAU,24,accent,2,true)
			draw_circle(Vector2(16,16),3,ink)
		"atk":
			_poly([Vector2(16,3),Vector2(29,16),Vector2(21,16),Vector2(21,28),Vector2(11,28),Vector2(11,16),Vector2(3,16)],ink)
		"speed", "projectile":
			for x in [8,18]:
				draw_polyline(PackedVector2Array([Vector2(x,7),Vector2(x+8,16),Vector2(x,25)]),ink,3,true)
			if skill_id == "projectile":
				draw_line(Vector2(1,16),Vector2(8,16),accent,2,true)
		"cooldown", "duration":
			draw_arc(Vector2(16,17),11,0,TAU,30,ink,2.5,true)
			draw_line(Vector2(16,17),Vector2(16,9),ink,2.5,true)
			draw_line(Vector2(16,17),Vector2(22,20),accent,2.5,true)
			if skill_id == "cooldown":
				draw_line(Vector2(11,2),Vector2(21,2),ink,3,true)
		"hp", "heal":
			draw_rect(Rect2(12,4,8,24),ink)
			draw_rect(Rect2(4,12,24,8),ink)
			if skill_id == "heal":
				draw_circle(Vector2(16,16),3,Color("d8e9d5"))
		"magnet":
			draw_arc(Vector2(16,18),9,0,PI,18,ink,6,true)
			draw_line(Vector2(7,18),Vector2(7,5),ink,6,true)
			draw_line(Vector2(25,18),Vector2(25,5),ink,6,true)
			draw_line(Vector2(7,5),Vector2(7,9),accent,6,true)
			draw_line(Vector2(25,5),Vector2(25,9),accent,6,true)
		"range":
			draw_arc(Vector2(16,16),7,0,TAU,20,accent,2,true)
			for dir in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
				draw_line(Vector2(16,16)+dir*10,Vector2(16,16)+dir*15,ink,2,true)
				draw_line(Vector2(16,16)+dir*15,Vector2(16,16)+dir*12+dir.orthogonal()*3,ink,2,true)
		"xp":
			_poly([Vector2(16,3),Vector2(28,14),Vector2(16,29),Vector2(4,14)],ink)
			draw_line(Vector2(10,11),Vector2(16,7),accent,2,true)
		"gold", "GOLD":
			draw_circle(Vector2(16,16),12,ink)
			draw_arc(Vector2(16,16),8,0,TAU,26,accent,2,true)
			draw_line(Vector2(16,10),Vector2(16,22),accent,3,true)
		"armor":
			_poly([Vector2(16,3),Vector2(27,7),Vector2(25,21),Vector2(16,29),Vector2(7,21),Vector2(5,7)],ink)
			draw_polyline(PackedVector2Array([Vector2(11,15),Vector2(15,20),Vector2(22,11)]),accent,2.5,true)
		_:
			draw_line(Vector2(16,7),Vector2(16,25),ink,3,true)
			draw_line(Vector2(7,16),Vector2(25,16),ink,3,true)
	if evolved:
		draw_circle(Vector2(28,4),3,Color("bc8848"))
	draw_set_transform(Vector2.ZERO)

func _poly(points: Array[Vector2], color: Color) -> void:
	draw_colored_polygon(PackedVector2Array(points),color)
