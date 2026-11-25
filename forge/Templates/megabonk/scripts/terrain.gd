extends RefCounted
class_name GameTerrain
# Direct native port of web v2 terrain.js. No new terrain design.
const RandomClass = preload("res://scripts/deterministic_random.gd")
static var cache: Dictionary = {}
static func smooth(t):
	t = clamp(float(t), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
static func hash(value): return RandomClass.seedNumber(str(value))
static func lattice(x, z, seed_value):
	var n = RandomClass.imul(int(x), 374761393) ^ RandomClass.imul(int(z), 668265263) ^ int(seed_value)
	n = RandomClass.imul(n ^ ((n & 0xffffffff) >> 13), 1274126177)
	return float((n ^ ((n & 0xffffffff) >> 16)) & 0xffffffff) / 4294967295.0 * 2.0 - 1.0
static func noise(x, z, seed_value):
	var ix = floor(x)
	var iz = floor(z)
	var sx = smooth(x - ix)
	var sz = smooth(z - iz)
	return lerp(lerp(lattice(ix,iz,seed_value), lattice(ix+1,iz,seed_value),sx), lerp(lattice(ix,iz+1,seed_value),lattice(ix+1,iz+1,seed_value),sx),sz)
static func baseHeight(x, z, c):
	var u = (x*c.cos-z*c.sin)/c.worldScale
	var v = (x*c.sin+z*c.cos)/c.worldScale
	var rolling = sin(u*0.062+c.phase)*cos(v*0.049-c.phase*0.3)*2.9 + sin(v*0.112+c.phase*0.7)*1.15 + noise(u*0.041,v*0.041,c.seed)*2.2
	var ridge = exp(-(pow(u+17,2)/170.0+pow(v+21,2)/850.0))*6.8
	var valley = exp(-(pow(u-18,2)/280.0+pow(v-13,2)/450.0))*2.4
	var detail = noise(u*0.14,v*0.14,int(c.seed)^0x6c8e9cf5)*0.35
	return (rolling+ridge-valley+detail)*c.amplitude
static func configuration(options = {}):
	var mapId = options.get("mapId", "Forest")
	var stageIndex = max(0,int(floor(float(options.get("stageIndex",0)))))
	var worldRadius = clamp(float(options.get("worldRadius",65)),35.0,180.0)
	var rawSeed = options.get("seed",20261123)
	var rawSeedText = str(int(rawSeed)) if (rawSeed is float or rawSeed is int) and floor(float(rawSeed)) == float(rawSeed) else str(rawSeed)
	var radiusText = str(int(worldRadius)) if floor(worldRadius) == worldRadius else str(worldRadius)
	var cache_key = "%s:%s:%s:%s" % [mapId, rawSeedText, str(stageIndex), radiusText]
	if cache.has(cache_key): return cache[cache_key]
	var seed_value = GameTerrain.hash(cache_key)
	var rotation = (float((int(seed_value)>>3)%1000)/1000.0-0.5)*0.6+stageIndex*0.31
	var c = {"key":cache_key,"mapId":mapId,"seed":seed_value,"stageIndex":stageIndex,"worldRadius":worldRadius,"worldScale":worldRadius/65.0,"sin":sin(rotation),"cos":cos(rotation),"phase":float(seed_value%1000)/1000.0*TAU,"amplitude":1.2 if mapId == "Desert" else 0.82 if mapId == "Graveyard" else 1.0,"landmarks":[],"paths":[]}
	var specs = [
		["temple","temple",-23,-29,7.4,2.5],["portal","portal",23,-30,5.6,1.1],
		["charge","charge",-17,15,3.5,0.25],["greed","greed",20,13,3.5,0.3],
		["combat","combat",-39,-3,4.4,0.6],["obelisk","obelisk",39,-8,3.3,1.3],["ruins","ruins",5,-49,5,1.2]]
	for spec in specs:
		var id = spec[0]
		var kind = spec[1]
		var x = (spec[2]*c.cos+spec[3]*c.sin)*c.worldScale
		var z = (-spec[2]*c.sin+spec[3]*c.cos)*c.worldScale
		var y = baseHeight(x,z,c)+spec[5]
		var lm = {"id":id,"kind":kind,"x":x,"z":z,"y":y,"radius":spec[4]*c.worldScale,"blend":(10.0 if kind == "temple" else 6.0)*c.worldScale,"angle":-rotation,"source":"browser_constructed"}
		c.landmarks.append(lm)
		if kind in ["temple","portal","charge","greed","combat"]:
			var d = sqrt(x*x+z*z)
			var bend = (-3.0 if id == "portal" else 3.0)*c.worldScale
			var mx = x*0.48-z/d*bend
			var mz = z*0.48+x/d*bend
			var l1 = sqrt(mx*mx+mz*mz)
			var l2 = sqrt(pow(x-mx,2)+pow(z-mz,2))
			var length_value = l1+l2
			c.paths.append({"x1":0.0,"z1":0.0,"x2":mx,"z2":mz,"start":0.0,"end":l1/length_value,"targetY":y,"width":1.8*c.worldScale})
			c.paths.append({"x1":mx,"z1":mz,"x2":x,"z2":z,"start":l1/length_value,"end":1.0,"targetY":y,"width":1.8*c.worldScale})
	if cache.size() >= 24: cache.erase(cache.keys()[0])
	cache[cache_key] = c
	return c
static func nearestPath(x,z,c):
	var distance = INF
	var along = 0.0
	var targetY = 0.0
	var width = 1.8
	var weightedHeight = 0.0
	var totalWeight = 0.0
	var strength = 0.0
	for p in c.paths:
		var dx = p.x2-p.x1
		var dz = p.z2-p.z1
		var t = clamp(((x-p.x1)*dx+(z-p.z1)*dz)/(dx*dx+dz*dz),0.0,1.0)
		var d = sqrt(pow(x-p.x1-dx*t,2)+pow(z-p.z1-dz*t,2))
		if d < distance:
			distance = d; along = lerp(p.start,p.end,t); targetY = p.targetY; width = p.width
		var weight = 1.0-smooth((d-p.width)/4.8)
		if weight > 0:
			weightedHeight += p.targetY*smooth(lerp(p.start,p.end,t))*weight*weight
			totalWeight += weight*weight
			strength = max(strength,weight)
	return {"distance":distance,"along":along,"targetY":targetY,"width":width,"strength":strength,"height":weightedHeight/totalWeight if totalWeight > 0 else 0.0}
static func terrainHeight(x,z,options = {}):
	x = float(x) if (x is int or x is float) and is_finite(float(x)) else 0.0
	z = float(z) if (z is int or z is float) and is_finite(float(z)) else 0.0
	if x*x+z*z <= 49: return 0.0
	var c = configuration(options)
	var h = baseHeight(x,z,c)
	for lm in c.landmarks:
		var d = sqrt(pow(x-lm.x,2)+pow(z-lm.z,2))
		if d < lm.radius+lm.blend: h = lerp(h,lm.y,1.0-smooth((d-lm.radius)/lm.blend))
	var path_value = nearestPath(x,z,c)
	if path_value.strength > 0: h = lerp(h,path_value.height,path_value.strength*0.92)
	for lm in c.landmarks:
		var d = sqrt(pow(x-lm.x,2)+pow(z-lm.z,2))
		if d < lm.radius+1.7: h = lerp(h,lm.y,1.0-smooth((d-lm.radius)/1.7))
	h *= smooth((sqrt(x*x+z*z)-7.0)/5.0)
	return h
static func terrainNormal(x,z,options = {},epsilon = 0.22):
	var dx = (terrainHeight(x+epsilon,z,options)-terrainHeight(x-epsilon,z,options))/(2.0*epsilon)
	var dz = (terrainHeight(x,z+epsilon,options)-terrainHeight(x,z-epsilon,options))/(2.0*epsilon)
	var length_value = sqrt(dx*dx+1.0+dz*dz)
	return {"x":-dx/length_value,"y":1.0/length_value,"z":-dz/length_value}
static func terrainSlope(x,z,options = {},epsilon = 0.22):
	var n = terrainNormal(x,z,options,epsilon)
	return sqrt(n.x*n.x+n.z*n.z)/max(0.001,n.y)
static func terrainPathWeight(x,z,options = {}):
	var c = configuration(options)
	var p = nearestPath(x,z,c)
	return max(1.0-smooth((sqrt(x*x+z*z)-5.2)/2.5),1.0-smooth((p.distance-p.width*0.75)/(p.width*0.6)))
static func terrainLandmarks(options = {}):
	var c = configuration(options)
	var out = []
	for lm in c.landmarks:
		var item = lm.duplicate()
		item.y = terrainHeight(lm.x,lm.z,options)
		out.append(item)
	return out
static func add_structure(structures,lm,id,localX,localZ,radius,height_value,options,type_value = "pillar"):
	var c = cos(lm.angle)
	var s = sin(lm.angle)
	var x = lm.x+localX*c+localZ*s
	var z = lm.z-localX*s+localZ*c
	structures.append({"id":lm.id+"-"+id,"x":x,"z":z,"y":terrainHeight(x,z,options),"radius":radius,"height":height_value,"type":type_value,"landmark":lm.id})
static func terrainStructures(options = {}):
	var landmarks = terrainLandmarks(options)
	var structures = []
	for lm in landmarks:
		if lm.kind == "temple":
			for x in [-5.5,5.5]:
				for z in [-4.8,4.8]: add_structure(structures,lm,str(x)+":"+str(z),x,z,0.65,5.2,options)
		if lm.kind == "obelisk": add_structure(structures,lm,"spire",0,0,0.95,9.5,options)
		if lm.kind == "ruins":
			add_structure(structures,lm,"west",-3,0,0.7,2.8,options)
			add_structure(structures,lm,"east",3,1,0.7,1.25,options)
	return structures
static func createTerrain(options = {}):
	var frozen = {"mapId":options.get("mapId","Forest"),"seed":options.get("seed",20261123),"stageIndex":max(0,int(floor(float(options.get("stageIndex",0))))),"worldRadius":float(options.get("worldRadius",65))}
	return {"key":configuration(frozen).key,"source":"browser_constructed","options":frozen,"landmarks":terrainLandmarks(frozen),"heightAt":func(x,z): return terrainHeight(x,z,frozen),"slopeAt":func(x,z): return terrainSlope(x,z,frozen),"normalAt":func(x,z): return terrainNormal(x,z,frozen),"pathWeightAt":func(x,z): return terrainPathWeight(x,z,frozen)}
