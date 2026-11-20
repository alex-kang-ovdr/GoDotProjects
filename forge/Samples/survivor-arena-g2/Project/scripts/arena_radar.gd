extends Control
## Player-centered tactical radar. Receives immutable point snapshots at HUD frequency.

const RANGE = 620.0
var dots: Array = []
var facing = 0.0
var boss_count = 0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(98,98)
	resized.connect(queue_redraw)

func sync(sim) -> void:
	dots.clear()
	boss_count = 0
	if sim.player.is_empty():
		queue_redraw()
		return
	var player_pos: Vector2 = sim.player.pos
	facing = float(sim.player.get("facing",0.0))
	var stride = maxi(1,int(ceil(sim.enemies.size()/190.0)))
	for i in range(sim.enemies.size()):
		var enemy: Dictionary = sim.enemies[i]
		if float(enemy.get("hp",0)) <= 0:
			continue
		var boss = enemy.get("type","") == "boss"
		if not boss and i % stride != 0:
			continue
		if boss:
			boss_count += 1
		var point: Vector2 = (enemy.pos-player_pos)/RANGE
		dots.append({"point":point.limit_length(0.96),"kind":"boss" if boss else "enemy","edge":point.length()>0.96})
	var gem_count = 0
	for gem in sim.gems:
		var kind = str(gem.get("type","xp"))
		if kind == "xp":
			continue
		var point: Vector2 = (gem.pos-player_pos)/RANGE
		if point.length() <= 0.96:
			dots.append({"point":point,"kind":kind,"edge":false})
			gem_count += 1
		if gem_count >= 40:
			break
	queue_redraw()

func _draw() -> void:
	var center = size*0.5
	var radius = minf(size.x,size.y)*0.5-3.0
	if radius < 8:
		return
	draw_circle(center,radius,Color("203c3d"))
	draw_arc(center,radius,0,TAU,64,Color("6c9382"),1.3,true)
	draw_arc(center,radius*0.50,0,TAU,48,Color("375854"),1,true)
	draw_line(center+Vector2(-radius,0),center+Vector2(radius,0),Color("375854"),1,true)
	draw_line(center+Vector2(0,-radius),center+Vector2(0,radius),Color("375854"),1,true)
	for dot in dots:
		var pos: Vector2 = center+dot.point*radius
		match str(dot.kind):
			"boss":
				draw_colored_polygon(PackedVector2Array([pos+Vector2(0,-4),pos+Vector2(4,0),pos+Vector2(0,4),pos+Vector2(-4,0)]),Color("f4c86f"))
			"enemy":
				draw_circle(pos,1.4 if dot.edge else 1.9,Color("e99079"))
			"chest":
				draw_rect(Rect2(pos-Vector2(2.5,2.5),Vector2(5,5)),Color("f1d185"))
			"heal":
				draw_line(pos-Vector2(3,0),pos+Vector2(3,0),Color("a3e8c2"),2,true)
				draw_line(pos-Vector2(0,3),pos+Vector2(0,3),Color("a3e8c2"),2,true)
			_:
				draw_circle(pos,2.4,Color("9ac8dd"))
	draw_circle(center,5.4,Color("203c3d"))
	var dir = Vector2.from_angle(facing)
	draw_colored_polygon(PackedVector2Array([center+dir*6,center-dir*3+dir.orthogonal()*3.6,center-dir*3-dir.orthogonal()*3.6]),Color("e7f4d7"))
