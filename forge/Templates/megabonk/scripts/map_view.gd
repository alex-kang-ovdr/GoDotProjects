class_name GameMapView
extends Control

var sim
var full = false
var camera_yaw = 0.0
var height_texture: ImageTexture
var terrain_key = ""

func _ready():
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func refresh(value, is_full = false, yaw = 0.0):
	sim = value
	full = is_full
	camera_yaw = yaw
	if full:
		var key = "%s:%s:%s" % [sim.mapId,sim.seed,sim.stageIndex]
		if key != terrain_key:
			terrain_key = key
			var image = Image.create(88,88,false,Image.FORMAT_RGBA8)
			for iz in 88:
				for ix in 88:
					var x = (ix/87.0*2.0-1.0)*sim.worldRadius
					var z = (iz/87.0*2.0-1.0)*sim.worldRadius
					var col = Color("122b22")
					if Vector2(x,z).length()<sim.worldRadius:
						var h = GameTerrain.terrainHeight(x,z,sim.terrainOptions)
						var light = clampf(0.35+h*0.03,0.2,0.6)
						var hue = 42.0/360.0 if sim.mapId=="Desert" else (210.0/360.0 if sim.mapId=="Graveyard" else 126.0/360.0)
						# HSL colors in source converted to HSV without new map artwork.
						var v = light+0.24*minf(light,1-light)
						col = Color.from_hsv(hue,2*(1-light/v) if v else 0,v)
					image.set_pixel(ix,iz,col)
			height_texture = ImageTexture.create_from_image(image)
	queue_redraw()

func point(entity):
	var mid = size*0.5
	if full:
		return mid+Vector2(entity.x,entity.z)*(minf(size.x,size.y)-30)/(sim.worldRadius*2.0)
	var dx = entity.x-sim.player.x
	var dz = entity.z-sim.player.z
	return mid+Vector2(dx*cos(camera_yaw)-dz*sin(camera_yaw),dx*sin(camera_yaw)+dz*cos(camera_yaw))*minf(size.x,size.y)*0.46/35.0

func _draw():
	if sim == null:
		return
	var mid = size*0.5
	var radius = minf(size.x,size.y)*0.46
	draw_style_box(_box(),Rect2(Vector2.ZERO,size))
	if full and height_texture:
		draw_texture_rect(height_texture,Rect2(Vector2(15,15),size-Vector2(30,30)),false)
	else:
		for i in range(-3,4):
			var offset = i*radius/3.0
			draw_line(Vector2(mid.x+offset,8),Vector2(mid.x+offset,size.y-8),Color("31483a"),1)
			draw_line(Vector2(8,mid.y+offset),Vector2(size.x-8,mid.y+offset),Color("31483a"),1)
		for e in sim.enemies:
			var pt = point(e)
			if pt.distance_to(mid)<radius:
				draw_circle(pt,5 if e.get("boss",false) else 2.3,Color("ffcc75") if e.get("boss",false) else Color("d57969"))
	for chest in sim.chests:
		if not chest.opened:
			var pt = point(chest)
			if full or pt.distance_to(mid)<radius:
				draw_rect(Rect2(pt-Vector2(3,3),Vector2(6,6)),Color("efd473"))
	for shrine in sim.shrines:
		if shrine.get("used",false) and not full:
			continue
		var pt = point(shrine)
		if full or pt.distance_to(mid)<radius:
			var col = Color("718b7b") if shrine.get("used",false) else (Color("ffd078") if shrine.kind=="greed" else (Color("ef8b7a") if shrine.kind=="combat" else Color("91d8e8")))
			draw_colored_polygon(PackedVector2Array([pt+Vector2(0,-4),pt+Vector2(4,0),pt+Vector2(0,4),pt+Vector2(-4,0)]),col)
	if sim.portal and (sim.portal.get("discovered",false) or sim.portal.get("active",false)):
		var pt = point(sim.portal)
		if full or pt.distance_to(mid)<radius:
			draw_arc(pt,7,0,TAU,24,Color("84ecd4") if sim.portal.active else Color("ed8e80"),3)
	var player_point = point(sim.player)
	draw_colored_polygon(PackedVector2Array([player_point+Vector2(0,-6),player_point+Vector2(4,4),player_point+Vector2(-4,4)]),Color("f1ffbe"))
	if full:
		draw_arc(player_point,12,0,TAU,32,Color("f3ffd9"),2)

func _box():
	var style = StyleBoxFlat.new()
	style.bg_color = Color("142d23")
	style.set_corner_radius_all(12)
	return style
