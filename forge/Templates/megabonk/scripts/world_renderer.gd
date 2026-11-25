class_name WorldRenderer
extends Node3D
## Native port of web v2 dist/render.js. Mesh arrays and 397 model parts are
## extracted unchanged by tools/export_models.mjs; no external runtime exists.

const Terrain = preload("res://scripts/terrain.gd")
var cameraYaw = 0.0
var cameraPitch = 0.48
var cameraDistance = 14.0
var zoomFactor = 1.0
var elapsed = 0.0
var quality = "high"
var kind = "godot-native"
var camera: Camera3D
var sun: DirectionalLight3D
var hero_light: OmniLight3D
var world_environment: WorldEnvironment
var mapId = "Forest"
var characterId = "SirOofie"
var palette = {}
var models = {}
var geometries = {}
var catalogs = {}
var terrainOptions = {}
var landmarks = []
var _terrain_key = ""
var _static_signature = ""
var _obstacle_bounds = []
var _placement_base_y = 0.0
var _batches = {}
var _materials = {}
var _camera_target = Vector3(-3, 1.2, 0)
var _camera_initialized = false
var _camera_collision_distance = 14.0
var _player_previous = Vector3.ZERO
var _player_initialized = false
var _player_speed = 0.0
var _hero_walk = 0.0
var _environment_root: Node3D
var _ground_mesh: MeshInstance3D
var _text_slots = []
var _asset = {}
var _color_cache = {}
var _linear_color_cache = {}
var _initialized = false
var capture_transforms = false # Explicit CPU diagnostic capture; off during gameplay.
var _stats = {"models":0,"parts":0,"drawn_instances":0,"frames":0,"terrain_rebuilds":0}

func setup(sim):
	if not _initialized:
		_initialize()
	_sync_terrain(sim)
	sync(sim, 0.0)

func _initialize():
	_asset = JSON.parse_string(FileAccess.get_file_as_string("res://assets/existing_models.json"))
	models = _asset.models
	catalogs = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
	_stats.models = models.size()
	for m in models.values(): _stats.parts += m.parts.size()
	_build_geometries(_asset.geometries)
	_build_materials()
	camera = Camera3D.new()
	camera.name = "OrbitCamera"
	camera.fov = 60.0
	camera.near = 0.09
	camera.far = 270.0
	camera.current = true
	add_child(camera)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_energy = 0.9 # Native calibration: Godot light energy is not Three irradiance.
	sun.shadow_enabled = quality != "low"
	sun.directional_shadow_max_distance = 65.0
	add_child(sun)
	hero_light = OmniLight3D.new()
	hero_light.light_color = Color("e8f6dc")
	hero_light.light_energy = 0.35 # Preserve fill role without saturating native LDR output.
	hero_light.omni_range = 8.0
	hero_light.omni_attenuation = 2.0
	add_child(hero_light)
	world_environment = WorldEnvironment.new()
	world_environment.environment = Environment.new()
	world_environment.environment.background_mode = Environment.BG_SKY
	world_environment.environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	world_environment.environment.tonemap_exposure = 1.08
	world_environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	world_environment.environment.ambient_light_energy = 0.35
	add_child(world_environment)
	_environment_root = Node3D.new()
	_environment_root.name = "ExistingScenery"
	add_child(_environment_root)
	get_viewport().msaa_3d = Viewport.MSAA_DISABLED if quality == "low" else Viewport.MSAA_4X
	_initialized = true

func _build_geometries(defs):
	for id in defs:
		var d = defs[id]
		var a = []
		a.resize(Mesh.ARRAY_MAX)
		var v = PackedVector3Array()
		var normals = PackedVector3Array()
		var uv = PackedVector2Array()
		for i in range(0,d.position.size(),3): v.append(Vector3(d.position[i],d.position[i+1],d.position[i+2]))
		for i in range(0,d.normal.size(),3): normals.append(Vector3(d.normal[i],d.normal[i+1],d.normal[i+2]))
		for i in range(0,d.uv.size(),2): uv.append(Vector2(d.uv[i],d.uv[i+1]))
		var ind = PackedInt32Array()
		var source_indices = d.index if d.index != null else range(v.size())
		# Three front faces are CCW; Godot's front faces are clockwise.
		for i in range(0,source_indices.size(),3):
			ind.append(int(source_indices[i]))
			ind.append(int(source_indices[i+2]))
			ind.append(int(source_indices[i+1]))
		a[Mesh.ARRAY_VERTEX] = v
		a[Mesh.ARRAY_NORMAL] = normals
		if uv.size() == v.size(): a[Mesh.ARRAY_TEX_UV] = uv
		a[Mesh.ARRAY_INDEX] = ind
		var mesh = ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,a)
		geometries[id] = mesh

func _build_materials():
	for id in ["dynamic","static","environment","clouds","skyprops","glows","overlays","shadows"]:
		var m = StandardMaterial3D.new()
		m.vertex_color_use_as_albedo = true
		m.vertex_color_is_srgb = false # Source vertex/instance colors are explicitly linear.
		m.roughness = 0.86
		m.metallic = 0.06
		m.metallic_specular = 0.25
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		if id in ["glows","overlays","shadows","clouds","skyprops"]:
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.no_depth_test = id == "overlays"
		if id in ["glows","shadows","clouds"]:
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.albedo_color.a = 0.72 if id == "glows" else (0.75 if id == "clouds" else 0.7)
			m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if id == "glows" else BaseMaterial3D.BLEND_MODE_MIX
		if id == "skyprops": m.disable_fog = true
		if id == "shadows":
			# Port of the web canvas's radial blob, generated by the same stops.
			var img = Image.create(96,96,false,Image.FORMAT_RGBA8)
			for y in range(96):
				for x in range(96):
					var q = clampf((Vector2(x+0.5,y+0.5)-Vector2(48,48)).length()/47.04,0,1)
					var alpha = lerpf(0.55,0.3,q/0.45) if q<0.45 else lerpf(0.3,0.0,(q-0.45)/0.55)
					img.set_pixel(x,y,Color(1,1,1,alpha))
			m.albedo_texture = ImageTexture.create_from_image(img)
		_materials[id] = m

func _color(value):
	if value is Color: return value
	var key = str(value)
	if not _color_cache.has(key): _color_cache[key] = Color(key)
	return _color_cache[key]

func _source_color(value):
	# Three.Color(CSS hex) converts to linear before setColorAt/vertex buffers.
	# Color arguments already hold a source-space interpolation result.
	if value is Color: return value
	var key = str(value)
	if not _linear_color_cache.has(key): _linear_color_cache[key] = Color(key).srgb_to_linear()
	return _linear_color_cache[key]

func _finite(v, fallback = 0.0):
	if (v is float or v is int) and is_finite(float(v)): return float(v)
	return fallback

func _source_string(value):
	if (value is float or value is int) and is_finite(float(value)) and floor(float(value))==float(value): return str(int(value))
	return str(value)

func _hash(value):
	var h = 2166136261
	for byte in _source_string(value).to_utf8_buffer(): h = ((h ^ byte) * 16777619) & 0xffffffff
	return h

func _random(state):
	state[0] = (int(state[0]) + 0x6d2b79f5) & 0xffffffff
	var t = int(state[0])
	t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
	t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff)) & 0xffffffff
	return float((t ^ (t >> 14)) & 0xffffffff) / 4294967296.0

func _begin(batch):
	for key in _batches:
		if key.begins_with(batch+":"):
			_batches[key].used = 0
			if capture_transforms:
				_batches[key].transforms.clear()
				_batches[key].colors.clear()

func _push_transform(batch, geo, transform_value, tint, brightness = 1.0):
	var key = batch+":"+geo
	if not _batches.has(key):
		var mi = MultiMeshInstance3D.new()
		mi.name = batch+"_"+geo
		var mm = MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = geometries.get(geo,geometries.ico)
		mm.instance_count = 5000 if batch in ["static","environment"] else 4096
		mm.visible_instance_count = 0
		mi.multimesh = mm
		mi.material_override = _materials[batch]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if batch in ["dynamic","static","environment"] else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		_batches[key] = {"node":mi,"mm":mm,"used":0,"transforms":[],"colors":[]}
	var b = _batches[key]
	if b.used >= b.mm.instance_count: return
	b.mm.set_instance_transform(b.used,transform_value)
	if capture_transforms: b.transforms.append(transform_value)
	var c = _source_color(tint)
	var output_color = Color(c.r*brightness,c.g*brightness,c.b*brightness,c.a)
	b.mm.set_instance_color(b.used,output_color)
	if capture_transforms: b.colors.append(output_color)
	b.used += 1

func _end(batch):
	for key in _batches:
		if key.begins_with(batch+":"):
			var b = _batches[key]
			b.mm.visible_instance_count = b.used
			b.node.visible = b.used>0
			_stats.drawn_instances += b.used

func _basis(rx,ry,rz,order = EULER_ORDER_YXZ):
	return Basis.from_euler(Vector3(rx,ry,rz),order)

func _push(batch,geo,c,x,y,z,sx=1.0,sy=1.0,sz=1.0,rx=0.0,ry=0.0,rz=0.0,brightness=1.0):
	var base_y = _placement_base_y if batch=="static" else 0.0
	_push_transform(batch,geo,Transform3D(_basis(rx,ry,rz).scaled_local(Vector3(sx,sy,sz)),Vector3(x,y+base_y,z)),c,brightness)

func _ground(x,z):
	return Terrain.terrainHeight(x,z,terrainOptions)

func _ground_shape(batch,geo,tint,x,z,radius,brightness=1.0,offset=0.055,spin=0.0,aspect=1.0):
	var n = Terrain.terrainNormal(x,z,terrainOptions)
	var q = Quaternion(Vector3(0,0,1),Vector3(n.x,n.y,n.z)) * Quaternion(Vector3(0,0,1),spin)
	_push_transform(batch,geo,Transform3D(Basis(q).scaled_local(Vector3(radius,radius*aspect,1)),Vector3(x,_ground(x,z)+offset,z)),tint,brightness)

func _ground_ring(x,z,radius,tint,brightness=1.0,thickness=0.045):
	if radius<=1.8:
		_ground_shape("glows","ring",tint,x,z,radius,brightness)
		return
	var segments = 32 if radius>6 else 24
	var a = Vector3(x+radius,_ground(x+radius,z)+0.07,z)
	for i in range(1,segments+1):
		var angle = float(i)/segments*TAU
		var b = Vector3(x+cos(angle)*radius,0,z+sin(angle)*radius)
		b.y = _ground(b.x,b.z)+0.07
		_line(a.x,a.y,a.z,b.x,b.y,b.z,thickness,tint,brightness)
		a=b

func _line(x1,y1,z1,x2,y2,z2,thickness,tint,brightness=1.0,batch="glows"):
	var a = Vector3(x1,y1,z1)
	var b = Vector3(x2,y2,z2)
	var direction = b-a
	var length = direction.length()
	if length<0.001: return
	var q = Quaternion(Vector3.UP,direction/length)
	_push_transform(batch,"cylinder",Transform3D(Basis(q).scaled_local(Vector3(thickness,length,thickness)),(a+b)*0.5),tint,brightness)

func _blob(x,z,radius,strength=1.0):
	_ground_shape("shadows","plane",palette.shadow,x,z,radius*2.3,strength,0.035)

func rotate_camera(delta_yaw,delta_pitch=0.0):
	cameraYaw = fmod(cameraYaw+_finite(delta_yaw),TAU)
	cameraPitch = clampf(cameraPitch+_finite(delta_pitch),0.16,1.12)

func zoom_camera(delta):
	var amount = _finite(delta)
	if abs(amount)>8: amount*=0.01
	zoomFactor = clampf(zoomFactor*exp(amount*0.095),0.62,1.65)

func set_quality(value):
	var next_quality = "low" if value == "low" else "high"
	if next_quality == quality: return
	quality = next_quality
	_terrain_key = ""
	if is_instance_valid(sun): sun.shadow_enabled = quality != "low"
	if is_inside_tree(): get_viewport().msaa_3d = Viewport.MSAA_DISABLED if quality == "low" else Viewport.MSAA_4X

func reset_camera():
	cameraYaw=0.0
	cameraPitch=0.48
	zoomFactor=1.0
	_camera_initialized=false
	_camera_collision_distance=cameraDistance

func screen_to_world_direction(x,z):
	return {"x":x*cos(cameraYaw)+z*sin(cameraYaw),"z":-x*sin(cameraYaw)+z*cos(cameraYaw)}

func _sync_terrain(sim):
	var options = {"mapId":sim.mapId,"seed":sim.seed,"stageIndex":sim.stageIndex,"worldRadius":sim.worldRadius}
	var key = "%s:%s:%s:%s" % [options.mapId,_source_string(options.seed),_source_string(options.stageIndex),_source_string(options.worldRadius)]
	if key == _terrain_key: return
	mapId = options.mapId
	palette = _asset.palettes.get(mapId,_asset.palettes.Forest)
	terrainOptions=options
	landmarks=Terrain.terrainLandmarks(options)
	_terrain_key=key
	_static_signature=""
	_camera_initialized=false
	_player_initialized=false
	_configure_environment()
	_rebuild_ground()

func _configure_environment():
	var e = world_environment.environment
	var sky_mat = ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = _color(palette.sky)
	sky_mat.sky_horizon_color = _color(palette.fog)
	sky_mat.ground_bottom_color = _color(palette.fog)
	sky_mat.ground_horizon_color = _color(palette.fog)
	sky_mat.sky_curve = 0.5
	var sk = Sky.new()
	sk.sky_material=sky_mat
	e.sky=sk
	e.ambient_light_color = Color("d2dcf2") if mapId=="Graveyard" else Color("dcefe3")
	e.fog_enabled=true
	e.fog_light_color=_color(palette.fog)
	e.fog_mode=Environment.FOG_MODE_DEPTH
	e.fog_depth_begin=25.0 if mapId=="Graveyard" else 38.0
	e.fog_depth_end=145.0 if mapId=="Desert" else 115.0
	e.fog_depth_curve=1.0
	e.fog_density=1.0
	e.fog_sky_affect=0.0
	sun.light_color=_color(palette.sun)

func _rebuild_ground():
	_stats.terrain_rebuilds+=1
	if is_instance_valid(_ground_mesh): _ground_mesh.queue_free()
	for child in _environment_root.get_children(): child.queue_free()
	_begin("environment")
	_begin("clouds")
	_begin("skyprops")
	var radius = terrainOptions.worldRadius
	var extent = radius*3.5
	var segments = 100 if quality=="low" else 160
	var stride = segments+1
	var step = extent/segments
	var vertices = PackedVector3Array()
	var colors = PackedColorArray()
	var normals = PackedVector3Array()
	var indices = PackedInt32Array()
	var heights = PackedFloat32Array()
	for iz in range(segments+1):
		for ix in range(segments+1):
			var x=ix*step-extent*0.5
			var z=iz*step-extent*0.5
			var h=_ground(x,z)
			vertices.append(Vector3(x,h,z))
			heights.append(h)
			if ix<segments and iz<segments:
				var i=iz*stride+ix
				indices.append_array(PackedInt32Array([i,i+1,i+stride,i+1,i+stride+1,i+stride]))
	for iz in range(segments+1):
		for ix in range(segments+1):
			var i=iz*stride+ix
			var x=vertices[i].x
			var z=vertices[i].z
			var y=heights[i]
			var sx=(heights[iz*stride+mini(segments,ix+1)]-heights[iz*stride+maxi(0,ix-1)])/(step*2)
			var sz=(heights[mini(segments,iz+1)*stride+ix]-heights[maxi(0,iz-1)*stride+ix])/(step*2)
			var slope=Vector2(sx,sz).length()
			var patch=palette.patch[int(abs(floor(x/7)*3+floor(z/8)))%palette.patch.size()]
			var c=_source_color(palette.ground).lerp(_source_color(patch),0.15+sin(x*0.17+z*0.13)*0.09)
			c=c.lerp(_source_color(palette.rockDark),clampf((slope-0.52)*0.55,0,0.65))
			c=c.lerp(_source_color(palette.path),Terrain.terrainPathWeight(x,z,terrainOptions)*0.92)
			for lm in landmarks:
				if not lm.kind in ["temple","portal","ruins"]: continue
				var d=Vector2(x-lm.x,z-lm.z).length()
				if d<lm.radius: c=c.lerp(_source_color(palette.rock),clampf((lm.radius-d)*0.3,0,0.6))
			var brightness=1+sin(x*1.13+z*0.73)*0.025+clampf(y,-5,8)*0.008
			colors.append(Color(c.r*brightness,c.g*brightness,c.b*brightness,1))
			normals.append(Vector3(-sx,1,-sz).normalized())
	var a=[]
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX]=vertices
	a[Mesh.ARRAY_COLOR]=colors
	a[Mesh.ARRAY_NORMAL]=normals
	a[Mesh.ARRAY_INDEX]=indices
	var mesh=ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,a)
	_ground_mesh=MeshInstance3D.new()
	_ground_mesh.name="SourceHeightfield"
	_ground_mesh.mesh=mesh
	_ground_mesh.material_override=_materials.environment
	add_child(_ground_mesh)
	_build_scenery()
	_end("environment")
	_end("clouds")
	_end("skyprops")

func _build_scenery():
	var p=palette
	var rng=[_hash(_terrain_key+":scenery")]
	var radius=terrainOptions.worldRadius
	var grass_count=1100 if quality=="low" else 3200
	var used=0
	var flower_count=0
	for i in range(grass_count*3):
		if used>=grass_count: break
		var x=(_random(rng)-0.5)*radius*2.5
		var z=(_random(rng)-0.5)*radius*2.5
		if Terrain.terrainPathWeight(x,z,terrainOptions)>0.35: continue
		var blocked=false
		for lm in landmarks:
			if Vector2(x-lm.x,z-lm.z).length()<lm.radius*0.85: blocked=true; break
		if blocked: continue
		var size=0.7+_random(rng)*1.05
		var y=_ground(x,z)
		var rx=_random(rng)*0.15
		var ry=_random(rng)*TAU
		var rz=_random(rng)*0.15
		var c=p.grass[int(floor(_random(rng)*p.grass.size()))]
		_push("environment","grass",c,x,y+0.15*size,z,size,size*0.9,size,rx,ry,rz)
		used+=1
		if i%18==0 and flower_count<200:
			_push("environment","octa","#e5c56b" if mapId=="Forest" and i%36!=0 else p.flower,x+0.18,y+0.32,z,0.09,0.075,0.09)
			flower_count+=1
	for i in range(90):
		var a=float(i)/90*TAU+_random(rng)*0.07
		var d=radius+8+_random(rng)*24
		var x=sin(a)*d
		var z=cos(a)*d
		var base=_ground(x,z)
		var h=7+_random(rng)*7
		_push("environment","tapered",p.barkDark,x,base+h*0.35,z,0.65,h*0.7,0.65)
		for j in range(3):
			var off=0 if j==0 else (-1.2 if j==1 else 1.2)
			var stone=mapId=="Desert"
			_push("environment","ico",p.rock if stone else p.leaf[(i+j)%3],x+cos(a)*off,base+h*(0.7+j*0.07),z+sin(a)*off,2.5 if stone else 2.3-j*0.2,h*0.45 if stone else h*0.26,2 if stone else 2.2-j*0.2,0,a)
	for i in range(22):
		var a=float(i)/22*TAU
		var d=radius+44+_random(rng)*16
		var h=18+_random(rng)*25
		var x=sin(a)*d
		var z=cos(a)*d
		var sx=14+_random(rng)*14
		var sz=14+_random(rng)*10
		_push("environment","cone",p.rockDark,x,_ground(x,z)+h*0.35,z,sx,h,sz,0,a)
	for i in range(14):
		var a=_random(rng)*TAU
		var d=45+_random(rng)*85
		var x=sin(a)*d
		var z=cos(a)*d
		var y=30+_random(rng)*16
		for j in range(3):
			var sx=4+_random(rng)*3
			var sy=1.3+_random(rng)
			_push("clouds","ico","#b1bad0" if mapId=="Graveyard" else "#e6ece0",x+j*3.5,y+(j%2)*0.7,z,sx,sy,2.6)
	var sun_size=5.0 if mapId=="Graveyard" else 6.5
	_push("skyprops","ico","#e1e5ed" if mapId=="Graveyard" else "#fff1c3",-75,82,-123,sun_size,sun_size,sun_size)

func _rebuild_obstacles(obstacles):
	# Simulation changes obstacle layout only when a stage changes.
	var signature=_terrain_key+":"+str(obstacles.hash())
	if signature==_static_signature: return
	_static_signature=signature
	_begin("static")
	_obstacle_bounds=[]
	var p=palette
	for o in obstacles:
		var x=_finite(o.get("x"))
		var z=_finite(o.get("z"))
		var r=_finite(o.get("radius"),0.7)
		var h=_finite(o.get("height"),2)
		_placement_base_y=_finite(o.get("y"),_ground(x,z))
		_obstacle_bounds.append({"x":x,"z":z,"y":_placement_base_y,"radius":r,"height":h,"type":o.type})
		var rng=[_hash(_source_string(o.id)+":"+mapId)]
		var angle=_random(rng)*TAU
		if o.type=="tree":
			if mapId=="Desert":
				_push("static","tapered",p.leaf[0],x,h*0.4,z,r*0.62,h*0.8,r*0.62,0,angle)
				_push("static","ico",p.leaf[1],x,h*0.79,z,r*0.64,r*0.63,r*0.64)
				for side in [-1,1]:
					var ax=x+cos(angle)*r*1.1*side
					var az=z-sin(angle)*r*1.1*side
					_push("static","cylinder",p.leaf[0],ax,h*0.45,az,r*0.32,h*0.38,r*0.32)
					_push("static","ico",p.leaf[1],ax,h*0.64,az,r*0.34,r*0.34,r*0.34)
			else:
				_push("static","tapered",p.bark,x,h*0.31,z,r*0.68,h*0.62,r*0.66,0,angle)
				_push("static","cone",p.barkDark,x,0.25,z,r,0.6,r,0,angle)
				if mapId=="Graveyard":
					for i in range(3):
						var a=angle+i*2.1
						_push("static","tapered",p.bark,x+cos(a)*0.6,h*0.63,z+sin(a)*0.6,r*0.2,h*0.51,r*0.2,0.35*sin(a),a,0.45*cos(a))
					_push("static","ico",p.leaf[1],x,h*0.79,z,r*1.55,h*0.17,r*1.3)
				else:
					for i in range(4):
						var a=angle+i*2.4
						var off=0 if i==3 else r*0.8
						_push("static","ico",p.leaf[i%3],x+sin(a)*off,h*(0.67+i*0.065),z+cos(a)*off,r*(1.75-i*0.13),h*0.22,r*(1.55-i*0.1),0,a)
		elif o.type=="tombstone":
			_push("static","box",p.rockDark,x,0.13,z,r*1.85,0.26,r*1.4,0,angle)
			_push("static","box",p.rock,x,h*0.48,z,r*1.35,h*0.78,r*0.52,0,angle,0.04)
			_push("static","ico",p.rock,x,h*0.89,z,r*0.68,h*0.19,r*0.28,0,angle)
			var dx=sin(angle)*r*0.285
			var dz=cos(angle)*r*0.285
			_push("static","box",p.rockDark,x+dx,h*0.56,z+dz,r*0.12,h*0.32,0.025,0,angle)
			_push("static","box",p.rockDark,x+dx,h*0.64,z+dz,r*0.64,h*0.065,0.025,0,angle)
		elif o.type=="pillar":
			_push("static","box",p.rockDark,x,0.18,z,r*1.9,0.36,r*1.9,0,angle)
			_push("static","cylinder",p.rock,x,h*0.48,z,r*0.65,h*0.88,r*0.65,0,angle)
			_push("static","box",p.rock,x,h*0.94,z,r*1.7,h*0.12,r*1.7,0,angle)
		else:
			_push("static","ico",p.rock,x,h*0.38,z,r,h*0.63,r*0.87,0.12,angle,0.13)
			_push("static","ico",p.rockDark,x+r*0.48,h*0.18,z+r*0.32,r*0.55,h*0.32,r*0.55,0,angle+1)
			if mapId=="Forest": _push("static","ico",p.leaf[1],x-r*0.15,h*0.92,z,r*0.49,0.08,r*0.38)
	_render_landmark_decor()
	_placement_base_y=0.0
	_end("static")

func _landmark_place(lm,geo,tint,lx,y,lz,sx,sy,sz):
	var yaw=lm.angle
	_push("static",geo,tint,lm.x+lx*cos(yaw)+lz*sin(yaw),y,lm.z-lx*sin(yaw)+lz*cos(yaw),sx,sy,sz,0,yaw)

func _render_landmark_decor():
	var p=palette
	for lm in landmarks:
		_placement_base_y=lm.y
		if lm.kind=="temple":
			_landmark_place(lm,"box",p.rock,0,-0.035,0,11.5,0.08,9.5)
			for i in range(-3,4):
				for j in range(-2,3):
					if (i+j)%2==0: _landmark_place(lm,"box",p.rockDark,i*1.5,0.012,j*1.6,1.3,0.018,1.4)
			_landmark_place(lm,"box",p.rock,0,5.38,-4.8,12.5,0.64,1.25)
			_landmark_place(lm,"box",p.rockDark,0,5.86,-4.8,11.7,0.32,1.45)
			_landmark_place(lm,"ico","#b5a2d4" if mapId=="Graveyard" else "#c7be78",0,6.3,-4.8,0.62,0.65,0.45)
			for side in [-1,1]: _landmark_place(lm,"box",p.rockDark,side*5.5,5.31,0,0.9,0.4,10.5)
		elif lm.kind=="obelisk":
			_landmark_place(lm,"cone","#e1c78a" if mapId=="Desert" else p.rock,0,10.15,0,0.85,1.9,0.85)
			for i in range(3): _landmark_place(lm,"box",p.flower,0,3.8+i*1.25,0.67,0.28,0.55,0.025)
		elif lm.kind=="ruins":
			_landmark_place(lm,"box",p.rock,0,-0.03,0,8.5,0.08,5.5)
			_landmark_place(lm,"box",p.rockDark,-1,0.025,-1.6,3.8,0.05,0.4)
			_landmark_place(lm,"box",p.rockDark,1.4,0.025,1.3,3.2,0.05,0.4)

func _model(model_id,x,y,z,yaw,scale_value,body_color,phase=0.0,flash=0.0,walk=1.0,horizontal_scale=-1.0):
	var model=models.get(model_id,models.goblin)
	if horizontal_scale<0: horizontal_scale=scale_value
	var root_transform=Transform3D(Basis(Vector3.UP,yaw).scaled_local(Vector3(horizontal_scale,scale_value,horizontal_scale)),Vector3(x,y,z))
	for part in model.parts:
		var rx=part.r[0]
		var ry=part.r[1]
		var rz=part.r[2]
		var sy=part.s[1]
		var sx=part.s[0]
		var swing=sin(phase)*0.38*walk
		match part.anim:
			"legL": rx+=swing
			"legR": rx-=swing
			"armL": rx-=swing*0.65
			"armR": rx+=swing*0.65
			"wingL": rz+=sin(phase*2.9)*0.34
			"wingR": rz-=sin(phase*2.9)*0.34
			"tail": ry+=sin(phase*0.7)*0.2
			"squash":
				sy*=1+sin(phase*1.4)*0.1
				sx*=1-sin(phase*1.4)*0.06
		var t=Transform3D(_basis(rx,ry,rz,EULER_ORDER_XYZ).scaled_local(Vector3(sx,sy,part.s[2])),Vector3(part.p[0],part.p[1],part.p[2]))
		var c=_source_color(body_color if part.c=="body" else part.c)
		if flash>0: c=c.lerp(_source_color("#fff4ce"),clampf(flash,0,0.9))
		_push_transform("dynamic",part.geo,root_transform*t,c)

func _update_camera(sim,dt):
	var p=sim.player
	var menu=sim.phase=="menu"
	var ground=_finite(p.get("groundHeight"),_ground(p.x,p.z))
	var player_y=_finite(p.get("y"),ground)
	var jump=maxf(0,player_y-ground)
	var width=get_viewport().get_visible_rect().size.x
	var shift=(3.4 if width>900 else (2.0 if width>620 else 0.25)) if menu else 0.0
	var pitch=0.39 if menu else cameraPitch
	var ahead=0.0 if menu else 1.75
	var distance=(12.8 if menu else cameraDistance)*zoomFactor
	var desired=Vector3(p.x-cos(cameraYaw)*shift-sin(cameraYaw)*ahead,ground+1.15+jump*0.72,p.z+sin(cameraYaw)*shift-cos(cameraYaw)*ahead)
	var smooth=1-exp(-minf(dt,0.06)*(3 if menu else 7))
	if not _camera_initialized:
		_camera_target=desired
		_camera_initialized=true
	else: _camera_target=_camera_target.lerp(desired,smooth)
	var end=_camera_target+Vector3(sin(cameraYaw)*cos(pitch)*distance,sin(pitch)*distance,cos(cameraYaw)*cos(pitch)*distance)
	end.y=maxf(end.y,_ground(end.x,end.z)+1.05)
	var pivot=Vector3(p.x,player_y+1.35,p.z)
	var allowed=1.0
	var ray_length=pivot.distance_to(end)
	var steps=ceili(ray_length/0.55)
	for i in range(3,steps+1):
		var point=pivot.lerp(end,float(i)/steps)
		var blocked=point.y<_ground(point.x,point.z)+0.58
		if not blocked:
			for o in _obstacle_bounds:
				if point.y<o.y-0.2 or point.y>o.y+o.height+0.35: continue
				var r=o.radius*(1.9 if o.type=="tree" and point.y>o.y+o.height*0.52 else 1.0)+0.32
				if Vector2(point.x-o.x,point.z-o.z).length_squared()<r*r: blocked=true; break
		if blocked:
			allowed=maxf(1.8/maxf(2,ray_length),(i-1.6)/steps)
			break
	var desired_distance=ray_length*allowed
	_camera_collision_distance=desired_distance if desired_distance<_camera_collision_distance else lerpf(_camera_collision_distance,desired_distance,1-exp(-dt*4))
	var ratio=clampf(_camera_collision_distance/maxf(0.01,ray_length),0.1,1)
	camera.position=pivot.lerp(end,ratio)
	camera.position.y=maxf(camera.position.y,_ground(camera.position.x,camera.position.z)+0.65)
	camera.look_at(_camera_target,Vector3.UP)
	sun.position=Vector3(p.x-18,ground+31,p.z+16)
	sun.look_at(Vector3(p.x,ground,p.z),Vector3.UP)
	hero_light.position=Vector3(p.x,player_y+3.5,p.z+1.8)

func _render_player(sim,dt):
	var p=sim.player
	if not _player_initialized:
		_player_previous=Vector3(p.x,_finite(p.get("y")),p.z)
		_player_initialized=true
	var moved=Vector2(p.x-_player_previous.x,p.z-_player_previous.z).length()
	var speed=minf(16,moved/dt) if dt>0 else 0.0
	_player_speed+= (speed-_player_speed)*minf(1,dt*14)
	_hero_walk+=dt*(3+_player_speed*1.6)
	_player_previous=Vector3(p.x,_finite(p.get("y")),p.z)
	var def=catalogs.CHARACTERS[0]
	for c in catalogs.CHARACTERS:
		if c.id==sim.characterId: def=c; break
	var model_id=def.get("model","armor")
	if model_id=="skeleton": model_id="playerSkeleton"
	var model=models.get(model_id,models.armor)
	var scale_value=clampf(_finite(def.get("height"),1.85),1.85,2.4)/model.height
	var idle=sin(elapsed*2.2)*0.018
	var walk=clampf(_player_speed/5,0,1)
	var bob=abs(sin(_hero_walk))*0.035*walk
	var invuln=0.18+sin(elapsed*35)*0.17 if _finite(p.get("invulnerable"))>0 else 0.0
	var yaw=-0.15+sin(elapsed*0.45)*0.08 if sim.phase=="menu" else _finite(p.get("facing"))
	var ground=_finite(p.get("groundHeight"),_ground(p.x,p.z))
	var airborne=maxf(0,_finite(p.get("y"),ground)-ground)
	_blob(p.x,p.z,0.64+airborne*0.05,maxf(0.25,1-airborne*0.12))
	_model(model_id,p.x,_finite(p.get("y"),ground)+bob+idle,p.z,yaw,scale_value,def.get("color","#e8dfc4"),_hero_walk,invuln,walk)
	_ground_ring(p.x,p.z,0.76,"#f1d78e",0.42)
	if _finite(p.get("shield"))>0: _ground_ring(p.x,p.z,0.9,"#8adfe6",0.4)
	if _finite(p.get("dashTime"))>0:
		for i in range(1,4): _push("glows","ico","#92e9e3",p.x-sin(yaw)*i*0.45,_finite(p.get("y"))+0.8,p.z-cos(yaw)*i*0.45,0.3,0.6,0.3,0,yaw,0,0.25/i)

func _health_bar(e,height,width):
	if e.get("maxHp",0)<=0 or e.hp>=e.maxHp or e.hp<=0: return
	var pct=clampf(e.hp/e.maxHp,0,1)
	var base_y=_finite(e.get("y"))+height+0.3
	var b=camera.basis.orthonormalized()
	_push_transform("overlays","plane",Transform3D(b.scaled_local(Vector3(width,0.11,1)),Vector3(e.x,base_y,e.z)),"#263d3c")
	var off=b*Vector3((pct-1)*width*0.5,0,0.016)
	_push_transform("overlays","plane",Transform3D(b.scaled_local(Vector3(width*pct,0.065,1)),Vector3(e.x,base_y,e.z)+off),"#ecc16d" if e.get("boss",false) else ("#d7a874" if e.get("elite",false) else "#a4d5a3"))

func _render_enemies(sim):
	var p=sim.player
	var count=0
	for e in sim.enemies:
		if e.hp<=0 or Vector2(e.x-p.x,e.z-p.z).length()>62: continue
		count+=1
		if count>260: break
		var boss=e.get("boss",false)
		var elite=e.get("elite",false)
		var def=catalogs.ENEMY_TYPES.get(e.type,{})
		var model_id=def.get("model","golem" if boss else "goblin")
		var model=models.get(model_id,models.goblin)
		var scale_value=_finite(def.get("height"),4.8 if boss else 1.35)/model.height*(1.15 if elite else 1.0)
		var horizontal_scale=maxf(scale_value,_finite(e.get("radius"),_finite(def.get("radius"),model.radius))/model.radius) if model_id in ["scorpion","spider","slime"] else scale_value
		var phase=elapsed*(3.5 if boss else 8)+(_hash(e.id)%100)*0.11
		var hover=model.get("hover",0)+sin(phase*0.45)*0.09 if model.get("hover",0)>0 else 0.0
		var bounce=maxf(0,sin(phase))*0.12 if model_id=="slime" else 0.0
		var angle=_finite(e.get("angle"),atan2(p.x-e.x,p.z-e.z))
		_blob(e.x,e.z,_finite(e.get("radius"),model.radius)*1.05,0.72)
		_model(model_id,e.x,_finite(e.get("y"))+hover+bounce,e.z,angle,scale_value,def.get("color","#91a76a"),phase,0.8 if _finite(e.get("hitFlash"))>0 else 0.0,1,horizontal_scale)
		if elite or boss: _ground_ring(e.x,e.z,maxf(0.65,_finite(e.get("radius"),0.8)*1.18),"#ecae6f" if boss else "#e5c985",0.42)
		_health_bar(e,model.height*scale_value+hover,2.6 if boss else (1.05 if elite else 0.72))

func _render_gems(sim):
	var p=sim.player
	var count=0
	for gem in sim.xpGems:
		if Vector2(gem.x-p.x,gem.z-p.z).length()>38: continue
		count+=1
		if count>360: break
		var value=_finite(gem.get("value"),1)
		var size=0.14+minf(0.1,log(value+1)/log(2)*0.026)
		var shade="#c2a7f4" if value>=10 else ("#73dbe3" if value>=4 else "#9bd4c8")
		var phase=elapsed*1.8+_finite(gem.get("id"))*0.63
		var gem_floor=_ground(gem.x,gem.z)+0.23
		_push("dynamic","octa",shade,gem.x,maxf(gem_floor,_finite(gem.get("y"),gem_floor))+sin(phase)*0.045,gem.z,size*1.2,size*1.6,size*1.2,0,phase)
		if count<100 and value>=4: _ground_shape("glows","circle",shade,gem.x,gem.z,size*1.7,0.12)

func _chest(chest):
	var x=chest.x
	var z=chest.z
	var yaw=-0.15
	var y0=_finite(chest.get("y"),_ground(x,z))
	_blob(x,z,0.66,0.8)
	_push("dynamic","box","#624633",x,y0+0.26,z,0.96,0.5,0.63,0,yaw)
	_push("dynamic","box","#c28c4e",x,y0+0.31,z+0.02,0.86,0.38,0.64,0,yaw)
	_push("dynamic","box","#deb766",x-0.28,y0+0.3,z,0.075,0.51,0.68,0,yaw)
	_push("dynamic","box","#deb766",x+0.28,y0+0.3,z,0.075,0.51,0.68,0,yaw)
	var opened=chest.get("opened",false)
	_push("dynamic","box","#987142" if opened else "#d3a05b",x,y0+(0.85 if opened else 0.59),z-(0.27 if opened else 0.0),0.99,0.17,0.7,-1.1 if opened else 0.0,yaw)
	if not opened:
		_push("dynamic","box","#f2cc7b",x,y0+0.36,z+0.37,0.19,0.24,0.08,0,yaw)
		_push("dynamic","box","#70553a",x,y0+0.35,z+0.42,0.045,0.09,0.025,0,yaw)
		_ground_ring(x,z,0.82,"#e8c67f",0.35)
		_push("glows","cylinder","#e8c884",x,y0+1.6,z,0.025,2.4,0.025,0,0,0,0.14)
		for i in range(2):
			var a=elapsed*1.2+i*PI
			var y=0.75+fmod(elapsed*0.3+i*0.45,1.0)
			_push("glows","octa","#ffe5a6",x+cos(a)*0.28,y0+y,z+sin(a)*0.28,0.045,0.065,0.045,0,a,0,0.5)
	else: _push("dynamic","box","#3c3428",x,y0+0.52,z,0.73,0.03,0.43,0,yaw)

func _portal(portal):
	var x=_finite(portal.get("x"))
	var z=_finite(portal.get("z"))
	var base=_finite(portal.get("y"),_ground(x,z))
	var state=portal.get("state","ready" if portal.get("active",false) else "dormant")
	var ready=state=="ready"
	var guarded=state=="guarded"
	var r=clampf(_finite(portal.get("radius"),1.6),1.3,2)
	var y=base+1.95
	var tint="#71cfff" if ready else ("#efa65c" if guarded else "#ef6c68")
	var yaw=_finite(portal.get("angle"),atan2(-x,-z))
	_blob(x,z,r*1.2,0.8)
	for i in range(10):
		var a=float(i)/10*TAU
		var px=x+cos(a)*r*1.15
		var pz=z+sin(a)*r*1.15
		_push("dynamic","ico",palette.rock,px,_ground(px,pz)+0.2,pz,0.35,0.25,0.35,0,a)
	_push("dynamic","torus",palette.rockDark,x,y,z,r*1.12,r*1.12,r*1.12,0,yaw)
	_push("glows","torus",tint,x,y,z,r,r,r,0,yaw,0,0.95 if ready else 0.6)
	_push("dynamic","circle","#295c7b" if ready else "#592e38",x,y,z,r*0.91,r*0.91,r*0.91,0,yaw)
	_push("glows","circle",tint,x,y,z,r*0.91,r*0.91,r*0.91,0,yaw,0,0.08+(0.11 if ready else 0.025))
	for i in range(3): _push("glows","arc",tint,x,y,z,r*(0.38+i*0.2),r*(0.38+i*0.2),r,0,yaw,elapsed*(0.8 if ready else 0.25)+i*2,0.55 if ready else 0.2)
	_ground_ring(x,z,r*1.4,tint,0.55 if ready else 0.25)
	if portal.get("discovered",false) or ready or guarded:
		_push("glows","cylinder",tint,x,base+7,z,0.08 if ready else 0.045,13,0.08 if ready else 0.045,0,0,0,0.22 if ready else 0.09)
		for i in range(9):
			var a=elapsed*0.45+float(i)/9*TAU
			var rise=fmod(i*0.37+elapsed*(0.9 if ready else 0.35),3.6)
			_push("glows","octa",tint,x+cos(a)*r*0.75,base+0.35+rise,z+sin(a)*r*0.75,0.06,0.11,0.06,0,a,0,0.65 if ready else 0.35)

func _render_shrines(sim):
	for shrine in sim.shrines:
		var p=sim.player
		if Vector2(shrine.x-p.x,shrine.z-p.z).length()>65: continue
		var x=shrine.x
		var z=shrine.z
		var base=_finite(shrine.get("y"),_ground(x,z))
		var kind_value=shrine.kind
		var completed=shrine.state=="complete"
		var progress=clampf(_finite(shrine.get("progress")),0,1)
		var tint="#8a9f91" if completed else ("#a1c6fa" if kind_value=="charge" else ("#f2c960" if kind_value=="greed" else "#ee907b"))
		_blob(x,z,0.95,0.8)
		_push("dynamic","cylinder",palette.rockDark,x,base+0.16,z,0.85,0.32,0.85)
		_push("dynamic","tapered",palette.rock,x,base+0.65,z,0.49,0.8,0.49)
		_push("dynamic","cylinder",palette.rockDark,x,base+1.13,z,0.7,0.18,0.7)
		if kind_value=="charge":
			_push("dynamic","octa",tint,x,base+1.8+sin(elapsed*2)*0.06,z,0.4,0.68,0.4,0,elapsed*0.3)
			for i in range(3): _push("glows","torus",tint,x,base+1.8,z,0.72,0.72,0.72,PI/2+i*0.35,elapsed*0.4+i,0,0.25)
			if not completed:
				var radius=_finite(shrine.get("radius"),3.4)
				_ground_ring(x,z,radius,tint,0.32)
				for i in range(int(floor(progress*28))):
					var angle=float(i)/28*TAU
					var px=x+cos(angle)*radius
					var pz=z+sin(angle)*radius
					_push("glows","octa","#e5f3d5",px,_ground(px,pz)+0.13,pz,0.1,0.16,0.1,0,angle,0,0.7)
		elif kind_value=="greed":
			for i in range(3): _push("dynamic","cylinder",tint,x,base+1.33+i*0.2,z,0.42-i*0.05,0.15,0.42-i*0.05,0,i*0.4)
			_push("dynamic","octa","#eddb8e",x,base+2.02,z,0.36,0.43,0.25,0,elapsed*0.35)
			_push("dynamic","box","#9b783a",x,base+2,z+0.24,0.06,0.41,0.025)
		else:
			_push("dynamic","ico","#e5d6ba",x,base+1.66,z,0.42,0.42,0.32)
			_push("dynamic","box","#793f3b",x-0.15,base+1.74,z+0.29,0.14,0.16,0.05)
			_push("dynamic","box","#793f3b",x+0.15,base+1.74,z+0.29,0.14,0.16,0.05)
			for side in [-1,1]: _push("dynamic","cone",tint,x+side*0.53,base+1.62,z,0.12,1.18,0.1,0,0,side*-0.5)
		if not completed: _push("glows","ico",tint,x,base+1.8,z,0.52,0.65,0.52,0,elapsed,0,0.12)
		_ground_ring(x,z,1.17,tint,0.12 if completed else 0.4)

func _render_loot(sim):
	var p=sim.player
	for chest in sim.chests:
		if Vector2(chest.x-p.x,chest.z-p.z).length()<62: _chest(chest)
	var saw_portal=false
	for drop in sim.drops:
		if drop.get("collected",false) or Vector2(drop.x-p.x,drop.z-p.z).length()>65: continue
		var drop_kind=str(drop.get("kind",drop.get("type","gold"))).to_lower()
		if drop_kind=="portal": _portal(drop); saw_portal=true; continue
		var floor_value=_ground(drop.x,drop.z)+0.2
		var y=maxf(floor_value,_finite(drop.get("y"),floor_value))+0.25+sin(elapsed*3+_finite(drop.get("id")))*0.08
		if drop_kind in ["heal","health","borgar"]:
			_push("dynamic","box","#e0e5c8",drop.x,y,drop.z,0.4,0.35,0.3,0,elapsed*0.7)
			_push("dynamic","box","#cf7567",drop.x,y+0.19,drop.z,0.1,0.02,0.29)
			_push("dynamic","box","#cf7567",drop.x,y+0.19,drop.z,0.29,0.02,0.1)
		else: _push("dynamic","octa",drop.get("color","#ebcc83"),drop.x,y,drop.z,0.22,0.3,0.22,0,elapsed*1.5)
		_ground_ring(drop.x,drop.z,0.46,"#ecd89b",0.2)
	if sim.portal!=null and not saw_portal and Vector2(sim.portal.x-p.x,sim.portal.z-p.z).length()<75: _portal(sim.portal)

func _render_projectiles(sim):
	var p=sim.player
	var n=0
	for pr in sim.projectiles:
		if Vector2(pr.x-p.x,pr.z-p.z).length()>64: continue
		n+=1
		if n>240: break
		var x=pr.x
		var z=pr.z
		var y=_finite(pr.get("y"),0.75)
		var yaw=atan2(_finite(pr.get("vx")),_finite(pr.get("vz")))
		var sx=sin(yaw)
		var sz=cos(yaw)
		var c=pr.get("color","#f5d18b")
		var projectile_kind=pr.get("kind","bullet")
		if projectile_kind=="shield":
			var a=_finite(pr.get("angle"),elapsed*4)
			_push("dynamic","cylinder","#d6ba63",x,y,z,0.52,0.15,0.52,PI/2,a)
			_push("dynamic","cylinder","#5a93ae",x+sin(a)*0.09,y,z+cos(a)*0.09,0.42,0.09,0.42,PI/2,a)
			_push("dynamic","ico","#e8d181",x+sin(a)*0.18,y,z+cos(a)*0.18,0.17,0.17,0.17)
			_push("glows","torus","#b4e3ee",x,y,z,0.56,0.56,0.56,0,a,0,0.55)
		elif projectile_kind=="boomerang":
			var a=elapsed*14+_finite(pr.get("id"))
			var r=0.52
			for i in range(-2,3):
				var angle=a+i*0.3
				var d=r*(1-abs(i)*0.1)
				_push("dynamic","ico","#9e763a" if abs(i)==2 else "#f1d55c",x+sin(angle)*d,y,z+cos(angle)*d,0.16,0.15,0.24,0,angle)
			_push("glows","arc","#f0dc87",x,y,z,0.85,0.85,0.85,-PI/2,0,a,0.35)
		elif projectile_kind=="tornado":
			var r=maxf(0.65,_finite(pr.get("radius"),1))
			_push("glows","cone","#aacdd1",x,y+1.05,z,r,2.6,r,PI,elapsed*2,0,0.12)
			for i in range(5):
				var rr=r*(0.25+i*0.17)
				var yy=y+i*0.45
				_push("glows","arc","#e2e8ca" if i%2!=0 else "#a9d9df",x,yy,z,rr,rr,rr,-PI/2,0,elapsed*(6-i*0.3)+i,0.65)
				var a=elapsed*6+i*1.7
				_push("dynamic","octa","#b0bca2",x+sin(a)*rr,yy,z+cos(a)*rr,0.1,0.12,0.1,a,a)
		elif projectile_kind=="arrow":
			_line(x-sx*0.45,y,z-sz*0.45,x+sx*0.35,y,z+sz*0.35,0.027,"#d1bf8f",1,"dynamic")
			_push("dynamic","cone","#e2eee3",x+sx*0.39,y,z+sz*0.39,0.09,0.23,0.09,PI/2,yaw)
			_line(x-sx*0.7,y,z-sz*0.7,x,y,z,0.035,c,0.35)
		elif projectile_kind=="axe":
			var a=elapsed*17+_finite(pr.get("id"))
			_push("dynamic","box","#8c6345",x,y,z,0.09,0.8,0.1,0,a,a)
			_push("dynamic","box","#d8ded0",x+cos(a)*0.2,y+sin(a)*0.2,z,0.48,0.26,0.07,0,a,a)
		elif projectile_kind=="bone":
			var a=elapsed*12+_finite(pr.get("id"))
			var dx=cos(a)*0.31
			var dz=sin(a)*0.31
			_line(x-dx,y,z-dz,x+dx,y,z+dz,0.055,"#e6e4c5",1,"dynamic")
			_push("dynamic","ico","#e6e4c5",x-dx,y,z-dz,0.11,0.1,0.1)
			_push("dynamic","ico","#e6e4c5",x+dx,y,z+dz,0.11,0.1,0.1)
		elif projectile_kind=="rocket":
			_push("dynamic","cylinder","#d1dfd4",x,y,z,0.12,0.6,0.12,PI/2,yaw)
			_push("dynamic","cone","#d97862",x+sx*0.4,y,z+sz*0.4,0.13,0.25,0.13,PI/2,yaw)
			_push("glows","cone","#ffc772",x-sx*0.53,y,z-sz*0.53,0.14,0.48,0.14,-PI/2,yaw,0,0.8)
		elif projectile_kind=="poison":
			_push("dynamic","ico","#b5d685",x,y,z,0.19,0.24,0.19,0,elapsed*5)
			_push("dynamic","box","#71616b",x,y+0.24,z,0.16,0.1,0.16)
			_push("glows","ico","#a9d76e",x-sx*0.2,y,z-sz*0.2,0.24,0.18,0.24,0,0,0,0.22)
		elif projectile_kind=="fireball":
			var r=maxf(0.25,_finite(pr.get("radius"),0.25))
			_push("dynamic","ico","#ffd28a",x,y,z,r,r,r,0,elapsed*4)
			_push("glows","ico","#f5aa56",x,y,z,r*1.5,r*1.5,r*1.5,0,0,0,0.55)
			_line(x-sx*0.9,y,z-sz*0.9,x,y,z,r*0.65,"#ee9252",0.4)
		else:
			var hostile=pr.get("hostile",false) or projectile_kind=="enemy"
			var tint="#e99a9c" if hostile else c
			var r=maxf(0.19,_finite(pr.get("radius"),0.2)) if hostile else 0.14
			_push("dynamic","octa",tint,x,y,z,r,r,r,0,elapsed*6)
			_line(x-sx*(0.4 if hostile else 0.7),y,z-sz*(0.4 if hostile else 0.7),x,y,z,0.07 if hostile else 0.045,tint,0.8)

func _render_telegraphs(sim):
	var n=0
	for t in sim.telegraphs:
		n+=1
		if n>30: break
		var r=maxf(0.3,_finite(t.get("radius"),2))
		var progress=clampf(_finite(t.get("progress")),0,1)
		var tint=t.get("color","#ec8b70")
		if t.kind=="charge":
			var angle=_finite(t.get("angle"))
			var length=_finite(t.get("length"),14)
			var count=ceili(length/2)
			for i in range(count):
				var d=length*(i+0.5)/count
				var x=t.x+sin(angle)*d
				var z=t.z+cos(angle)*d
				_ground_shape("glows","plane",tint,x,z,r*2,0.18+progress*0.2,0.09,angle,length/count/(r*2))
			for i in range(6):
				var d=length*(i+1)/7
				var x=t.x+sin(angle)*d
				var z=t.z+cos(angle)*d
				_push("glows","cone","#ffd2a0",x,_ground(x,z)+0.15,z,r*0.45,0.85,0.055,PI/2,angle,0,0.65)
		else:
			_ground_shape("glows","circle",tint,t.x,t.z,r,0.06+progress*0.13,0.075)
			_ground_ring(t.x,t.z,r,tint,0.85,0.07)
			_ground_ring(t.x,t.z,maxf(0.08,r*progress),"#ffe0b4",0.58,0.055)

func _render_effects(sim):
	var count=0
	for e in sim.effects:
		if e.kind=="text": continue
		count+=1
		if count>110: break
		var ttl=maxf(0.001,_finite(e.get("ttl"),0.4))
		var remaining=clampf(_finite(e.get("life"),ttl)/ttl,0,1)
		var age=1-remaining
		var r=maxf(0.15,_finite(e.get("radius"),1))
		var x=_finite(e.get("x"))
		var z=_finite(e.get("z"))
		var y=_finite(e.get("y"),0.4)
		var tint=e.get("color","#f5d59c")
		if e.kind=="slash":
			_push("glows","arc",tint,x,y+0.3,z,r,r,r,-PI/2,0,-_finite(e.get("angle"))+PI/2,remaining*0.85)
			_push("glows","arc","#fff0c6",x,y+0.34,z,r*0.9,r*0.9,r*0.9,-PI/2,0,-_finite(e.get("angle"))+PI/2+0.08,remaining*0.4)
		elif e.kind=="lightning":
			var tx=_finite(e.get("toX"),x+sin(_finite(e.get("angle")))*r)
			var tz=_finite(e.get("toZ"),z+cos(_finite(e.get("angle")))*r)
			var ty=_finite(e.get("toY"),_ground(tx,tz)+0.9)
			var distance=Vector2(tx-x,tz-z).length()
			var steps=clampi(ceili(distance/1.2),3,9)
			var px=x
			var py=y if y!=0 else 1.0
			var pz=z
			for i in range(1,steps+1):
				var t=float(i)/steps
				var wiggle=0 if i==steps else sin((_finite(e.get("id"))+i)*8.2)*0.28
				var nx=x+(tx-x)*t+wiggle
				var nz=z+(tz-z)*t-wiggle
				var source_y=y if y!=0 else 1.0
				var ny=source_y+(ty-source_y)*t+abs(wiggle)
				_line(px,py,pz,nx,ny,nz,0.055,"#c3ecff",remaining)
				_line(px,py,pz,nx,ny,nz,0.13,"#8abbe1",remaining*0.22)
				px=nx
				py=ny
				pz=nz
		elif e.kind=="shield":
			var base=_ground(x,z)
			var size=r*(0.55+age*0.2)
			_push("glows","ico","#aedeea",x,base+1.1,z,size,size*1.15,size,0,elapsed,0,remaining*0.12)
			_push("glows","torus",tint,x,base+1.1,z,size,size,size,0,cameraYaw,0,remaining*0.6)
			_ground_ring(x,z,r,"#b8e4ee",remaining*0.45)
		elif e.kind=="sniper":
			var tx=_finite(e.get("toX"),x+sin(_finite(e.get("angle")))*r)
			var tz=_finite(e.get("toZ"),z+cos(_finite(e.get("angle")))*r)
			var ty=_finite(e.get("toY"),_ground(tx,tz)+0.95)
			_line(x,y,z,tx,ty,tz,0.055,"#f2faff",remaining*0.95)
			_line(x,y,z,tx,ty,tz,0.16,"#94c8ef",remaining*0.3)
			_push("glows","ico","#d7efff",tx,ty,tz,0.25,0.25,0.25,0,0,0,remaining*0.7)
		elif e.kind=="blackhole":
			var base=_ground(x,z)
			var pulse=1+sin(elapsed*4)*0.05
			_push("dynamic","ico","#211b39",x,base+1.1,z,0.68*pulse,0.68*pulse,0.68*pulse,0,elapsed*0.6)
			_push("glows","torus","#b49ae9",x,base+1.1,z,0.86,0.86,0.86,0.5,elapsed*0.3,0,0.8)
			_push("glows","torus","#867bd6",x,base+1.1,z,1.1,1.1,1.1,1.2,-elapsed*0.4,0,0.45)
			_ground_ring(x,z,r,"#9d83d2",0.24)
			for i in range(7):
				var a=elapsed*2.5+i*TAU/7
				var d=0.9+fposmod(i*0.31-elapsed*0.4,1)*minf(r,3.5)
				var px=x+sin(a)*d
				var pz=z+cos(a)*d
				_push("glows","octa","#bdabeb",px,_ground(px,pz)+0.3+(4-d)*0.17,pz,0.075,0.11,0.075,a,a,0,0.45)
		elif e.kind in ["frosttrail","ice"]:
			var fade=minf(1,remaining*4)
			_ground_shape("glows","circle","#97d9ef",x,z,r,0.19*fade)
			_ground_ring(x,z,r,"#bce9ed",0.35*fade,0.045)
			for i in range(5):
				var a=i*2.4+_finite(e.get("id"))
				var d=r*(0.35+(i%2)*0.35)
				var px=x+sin(a)*d
				var pz=z+cos(a)*d
				_push("dynamic","octa","#b7e0e8",px,_ground(px,pz)+0.2,pz,0.09,0.31*fade,0.09,0,a,0.15)
		elif e.kind=="poison":
			var fade=minf(1,remaining*4)
			_ground_shape("glows","circle",tint,x,z,r,0.14*fade)
			_ground_ring(x,z,r,"#9fd68b",0.3*fade)
			for i in range(3):
				var a=float(i)/3*TAU+elapsed*0.5
				var px=x+cos(a)*r*0.55
				var pz=z+sin(a)*r*0.55
				_push("glows","ico","#b6db91",px,_ground(px,pz)+0.2+fmod(elapsed*0.4+i*0.3,0.75),pz,0.11,0.14,0.11,0,a,0,0.21*fade)
		elif e.kind=="explosion":
			var size=r*(0.3+age*0.9)
			_ground_ring(x,z,size,tint,remaining*0.75,0.075)
			_push("glows","ico","#ffcc85",x,y+0.25,z,size*0.6,size*0.5,size*0.6,0,age,0,remaining*0.18)
			for i in range(5):
				var a=float(i)/5*TAU+_finite(e.get("id"))*0.2
				var px=x+sin(a)*size
				var pz=z+cos(a)*size
				_push("glows","octa","#ffe1a3",px,_ground(px,pz)+0.3+sin(age*PI)*0.8,pz,0.06,0.17,0.06,a,a,0,remaining*0.7)
		elif e.kind=="heal":
			_ground_ring(x,z,r*(1+age*0.5),"#b3e3a1",remaining*0.6)
			var base=_ground(x,z)
			_push("glows","box","#c6edb1",x,base+1.5+age,z,0.12,0.5,0.1,0,cameraYaw,0,remaining*0.7)
			_push("glows","box","#c6edb1",x,base+1.5+age,z,0.5,0.12,0.1,0,cameraYaw,0,remaining*0.7)
		elif e.kind=="ring": _ground_ring(x,z,r*(0.65+age*0.55),tint,remaining*0.6)
		else:
			for i in range(3):
				var a=float(i)/3*TAU+_finite(e.get("id"))
				var d=0.15+age*0.6
				_push("glows","octa",tint,x+cos(a)*d,y+age*0.4,z+sin(a)*d,0.06,0.16,0.06,a,a,a,remaining*0.8)

func _render_text_effects(sim):
	var count=0
	for effect in sim.effects:
		if effect.kind!="text" or effect.life<=0: continue
		if count>=44: break
		var slot: Label3D
		if count>=_text_slots.size():
			slot=Label3D.new()
			slot.name="DamageText"+str(count)
			slot.billboard=BaseMaterial3D.BILLBOARD_ENABLED
			slot.no_depth_test=true
			slot.shaded=false
			slot.outline_size=7
			slot.outline_modulate=Color("29433d")
			if ThemeDB.fallback_font != null:
				slot.font=ThemeDB.fallback_font
			slot.font_size=53
			slot.pixel_size=0.012
			add_child(slot)
			_text_slots.append(slot)
		else: slot=_text_slots[count]
		count+=1
		var value=effect.get("value","")
		var text=str(effect.text) if effect.has("text") and effect.text!=null else (str(roundi(value)) if value is float or value is int else str(value))
		text=text.left(12)
		slot.text=text
		slot.font_size=36 if text.length()>5 else 53
		var color_value=effect.get("color","#ffe7aa" if _finite(value)>=100 else "#f4f3d9")
		var c=_color(color_value)
		var ttl=maxf(0.001,_finite(effect.get("ttl"),0.7))
		var remaining=clampf(effect.life/ttl,0,1)
		var age=1-remaining
		var drift=sin(_finite(effect.get("id"))*1.7)*0.28*age
		slot.position=Vector3(effect.x+drift,_finite(effect.get("y"),1.1)+0.35+age*0.85,effect.z)
		slot.modulate=Color(c.r,c.g,c.b,minf(1,remaining*4))
		slot.visible=true
	for i in range(count,_text_slots.size()): _text_slots[i].visible=false

func sync(sim,delta=1.0/60.0):
	if sim==null: return
	if not _initialized: _initialize()
	var dt=clampf(_finite(delta,1.0/60.0),0,0.08)
	elapsed+=dt
	characterId=sim.characterId
	_stats.drawn_instances=0
	_sync_terrain(sim)
	_rebuild_obstacles(sim.obstacles)
	_update_camera(sim,dt)
	for batch in ["dynamic","glows","overlays","shadows"]: _begin(batch)
	_render_loot(sim)
	_render_shrines(sim)
	_render_gems(sim)
	_render_player(sim,dt)
	_render_enemies(sim)
	_render_projectiles(sim)
	_render_telegraphs(sim)
	_render_effects(sim)
	for batch in ["dynamic","glows","overlays","shadows"]: _end(batch)
	_render_text_effects(sim)
	_stats.frames+=1

func statistics():
	var result=_stats.duplicate(true)
	result["batch_count"]=_batches.size()
	result["geometries"]=geometries.size()
	result["camera_finite"]=camera.position.is_finite() if is_instance_valid(camera) else false
	result["camera_y"]=camera.position.y if is_instance_valid(camera) else null
	result["ground_below_camera"]=_ground(camera.position.x,camera.position.z) if is_instance_valid(camera) else null
	return result

func dispose():
	for b in _batches.values():
		b.node.queue_free()
	_batches.clear()
	for slot in _text_slots: slot.queue_free()
	_text_slots.clear()
	if is_instance_valid(_ground_mesh): _ground_mesh.queue_free()
	if is_instance_valid(_environment_root): _environment_root.queue_free()
	if is_instance_valid(camera): camera.queue_free()
	if is_instance_valid(sun): sun.queue_free()
	if is_instance_valid(hero_light): hero_light.queue_free()
	if is_instance_valid(world_environment): world_environment.queue_free()
	_initialized=false
