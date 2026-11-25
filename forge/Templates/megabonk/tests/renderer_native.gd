extends SceneTree
const Sim = preload("res://scripts/simulation.gd")
const Renderer = preload("res://scripts/world_renderer.gd")
const Terrain = preload("res://scripts/terrain.gd")
var checks = []
var failures = []
func check_value(name, ok, details = null):
	checks.append({"name":name,"passed":ok,"details":details})
	if not ok: failures.append(name)
func _initialize():
	call_deferred("run")
func run():
	var sim = Sim.new({"characterId":"SirOofie","mapId":"Forest","seed":20261123,"mode":"expedition","tier":3})
	var r = Renderer.new()
	r.quality="low"
	r.capture_transforms=true
	root.add_child(r)
	r.setup(sim)
	var stats=r.statistics()
	check_value("existing 29 model templates and 397 parts",stats.models==29 and stats.parts==397,stats)
	check_value("existing 14 exact geometry exports",stats.geometries==14)
	var source = JSON.parse_string(FileAccess.get_file_as_string("res://assets/existing_models.json"))
	var geometry_equal=true
	for id in source.geometries:
		var positions=source.geometries[id].position
		var native=r.geometries[id].surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		if native.size()*3!=positions.size(): geometry_equal=false
		for i in range(native.size()):
			if native[i].distance_to(Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]))>0.000001: geometry_equal=false
	check_value("all source mesh vertices preserved",geometry_equal)
	var model_fixture=JSON.parse_string(FileAccess.get_file_as_string("res://tests/source_renderer_fixture.json"))
	var matrix_count=0
	var max_matrix_error=0.0
	var max_color_error=0.0
	for fixture in model_fixture.fixtures:
		r._begin("dynamic")
		r._model(fixture.model,2,3,4,0.35,1.2,"#aabbcc",1.45,0.2,0.6,1.4)
		var per_geo={}
		for part in fixture.parts:
			var idx=per_geo.get(part.geo,0)
			per_geo[part.geo]=idx+1
			var t=r._batches["dynamic:"+part.geo].transforms[idx]
			var c=r._batches["dynamic:"+part.geo].colors[idx]
			for j in range(3): max_color_error=maxf(max_color_error,absf(c[j]-part.color[j]))
			var m=[t.basis.x.x,t.basis.x.y,t.basis.x.z,0.0,t.basis.y.x,t.basis.y.y,t.basis.y.z,0.0,t.basis.z.x,t.basis.z.y,t.basis.z.z,0.0,t.origin.x,t.origin.y,t.origin.z,1.0]
			for j in range(16): max_matrix_error=maxf(max_matrix_error,absf(m[j]-part.matrix[j]))
			matrix_count+=1
	check_value("397 animated model part transforms match web source",matrix_count==397 and max_matrix_error<0.00001,{"count":matrix_count,"maximum_absolute_error":max_matrix_error})
	check_value("397 model linear RGB values match web source",max_color_error<0.000001,{"count":matrix_count,"maximum_absolute_error":max_color_error})
	var maps=["Forest","Desert","Graveyard"]
	var actor_count=0
	for map_id in maps:
		sim.mapId=map_id
		for char_def in sim.CHARACTERS:
			sim.characterId=char_def.id
			r.sync(sim,1.0/60.0)
			actor_count+=1
	check_value("all 15 characters on all three maps",actor_count==45)
	sim.enemies=[]
	var i=0
	for id in sim.ENEMY_TYPES:
		var def=sim.ENEMY_TYPES[id]
		var x=float(i%6)*2-5
		var z=-5-float(i/6)*2
		sim.enemies.append({"id":i+1,"type":id,"x":x,"z":z,"y":Terrain.terrainHeight(x,z,r.terrainOptions),"hp":50.0,"maxHp":100.0,"radius":def.get("radius",0.5),"boss":def.get("boss",false),"elite":i%3==0,"angle":0.3,"hitFlash":0.2})
		i+=1
	var projectile_kinds=["shield","boomerang","tornado","arrow","axe","bone","rocket","poison","fireball","bullet","enemy"]
	sim.projectiles=[]
	for j in range(projectile_kinds.size()):
		sim.projectiles.append({"id":j+1,"kind":projectile_kinds[j],"x":j-5.0,"z":-2.0,"y":1.2,"vx":1.0,"vz":0.4,"radius":1.0})
	var effect_kinds=["slash","lightning","shield","sniper","blackhole","frosttrail","ice","poison","explosion","heal","ring","spark","text"]
	sim.effects=[]
	for j in range(effect_kinds.size()):
		sim.effects.append({"id":j+10,"kind":effect_kinds[j],"x":float(j%5)*3-6,"z":float(j/5)*3+4,"y":1.0,"life":0.4,"ttl":0.8,"radius":1.5,"value":123})
	sim.telegraphs=[{"id":1,"kind":"charge","x":0.0,"z":0.0,"radius":1.0,"progress":0.5,"length":14.0,"angle":0.0},{"id":2,"kind":"circle","x":4.0,"z":4.0,"radius":2.0,"progress":0.8}]
	var before=JSON.stringify({"player":sim.player,"enemies":sim.enemies,"projectiles":sim.projectiles,"effects":sim.effects,"telegraphs":sim.telegraphs})
	for j in range(10):
		r.rotate_camera(0.1,0.02)
		r.zoom_camera(-0.1)
		r.sync(sim,1.0/60.0)
	var after=JSON.stringify({"player":sim.player,"enemies":sim.enemies,"projectiles":sim.projectiles,"effects":sim.effects,"telegraphs":sim.telegraphs})
	check_value("renderer never mutates simulation",before==after)
	check_value("all enemy records rendered",i==29,i)
	check_value("projectile and FX fixture populated",sim.projectiles.size()==11 and sim.effects.size()==13)
	var transforms_finite=true
	var transform_count=0
	for batch in r._batches.values():
		for j in range(batch.used):
			var t=batch.transforms[j]
			if not t.origin.is_finite() or not t.basis.is_finite(): transforms_finite=false
			transform_count+=1
	check_value("native CPU transforms submitted to MultiMesh finite",transforms_finite,transform_count)
	stats=r.statistics()
	check_value("camera clears shared terrain",stats.camera_finite and stats.camera_y>=stats.ground_below_camera+0.64,stats)
	var old_rebuilds=stats.terrain_rebuilds
	sim.stageIndex=1
	r.sync(sim,1.0/60.0)
	check_value("stage regenerates native terrain",r.statistics().terrain_rebuilds==old_rebuilds+1)
	r.dispose()
	await process_frame
	check_value("renderer disposal clears batches",r._batches.is_empty())
	var report={"engine":Engine.get_version_info(),"headless":DisplayServer.get_name()=="headless","gpu_validated":false,"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_geometry_verification":"native vertex arrays against unchanged source extraction","scope":"Native Godot scene execution with CPU transform capture at MultiMesh submission. Headless dummy rendering server does not retain GPU MultiMesh buffers; not a GPU screenshot assertion."}
	var f=FileAccess.open("res://validation/renderer_native.json",FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(report,"\t"))
		f.close()
	print(JSON.stringify({"renderer_checks":checks.size(),"failures":failures,"transforms":transform_count}))
	quit(0 if failures.is_empty() else 1)
