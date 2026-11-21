class_name CombatFxLayer
extends Node2D

## 경량 프로시저럴 전투 이펙트 레이어:
## - 포구 섬광(Muzzle Flash), 피격 스파크(Hit Burst), 방어막 파문(Shield Ripple), 플로팅 데미지/회수 텍스트.

var flashes: Array[Dictionary] = []
var sparks: Array[Dictionary] = []
var ripples: Array[Dictionary] = []
var popups: Array[Dictionary] = []


func spawn_muzzle(pos: Vector2, dir: Vector2, color: Color, scale_mult: float = 1.0) -> void:
	if flashes.size() >= 64:
		flashes.pop_front()
	flashes.append({
		"pos": pos,
		"dir": dir.normalized() if dir.length_squared() > 0.001 else Vector2.RIGHT,
		"color": color,
		"scale": scale_mult,
		"t": 0.0,
		"dur": 0.11,
	})


func spawn_hit(pos: Vector2, normal_vel: Vector2, color: Color, shield_hit: bool = false, damage: float = 0.0) -> void:
	var base_ang := (-normal_vel).angle() if normal_vel.length_squared() > 1.0 else 0.0
	var count := 7 if not shield_hit else 10
	for i in count:
		if sparks.size() >= 160:
			sparks.pop_front()
		var spread := (float(i) / float(maxi(1, count - 1)) - 0.5) * 1.9
		var spd := 95.0 + float((i * 37) % 130)
		sparks.append({
			"pos": pos,
			"vel": Vector2.from_angle(base_ang + spread) * spd,
			"color": Color("66eeff") if shield_hit else color,
			"t": 0.0,
			"dur": 0.24 + float(i % 3) * 0.06,
		})
	if ripples.size() >= 32:
		ripples.pop_front()
	ripples.append({
		"pos": pos,
		"color": Color("56ecff") if shield_hit else color,
		"max_r": 32.0 if shield_hit else 22.0,
		"t": 0.0,
		"dur": 0.26 if shield_hit else 0.18,
	})
	if damage >= 1.0:
		spawn_popup(pos + Vector2(0.0, -14.0), "-%.0f" % damage, Color("7ef9ff") if shield_hit else Color("ff9e7d"))


func spawn_popup(pos: Vector2, text: String, color: Color) -> void:
	if popups.size() >= 36:
		popups.pop_front()
	popups.append({
		"pos": pos,
		"text": text,
		"color": color,
		"t": 0.0,
		"dur": 0.78,
	})


func _process(delta: float) -> void:
	var dirty := not (flashes.is_empty() and sparks.is_empty() and ripples.is_empty() and popups.is_empty())
	for i in range(flashes.size() - 1, -1, -1):
		flashes[i].t += delta
		if flashes[i].t >= flashes[i].dur:
			flashes.remove_at(i)
	for i in range(sparks.size() - 1, -1, -1):
		sparks[i].t += delta
		sparks[i].pos += sparks[i].vel * delta
		sparks[i].vel *= exp(-6.0 * delta)
		if sparks[i].t >= sparks[i].dur:
			sparks.remove_at(i)
	for i in range(ripples.size() - 1, -1, -1):
		ripples[i].t += delta
		if ripples[i].t >= ripples[i].dur:
			ripples.remove_at(i)
	for i in range(popups.size() - 1, -1, -1):
		popups[i].t += delta
		popups[i].pos.y -= 26.0 * delta
		if popups[i].t >= popups[i].dur:
			popups.remove_at(i)
	if dirty:
		queue_redraw()


func _draw() -> void:
	for f in flashes:
		var k := 1.0 - float(f.t) / float(f.dur)
		var r := 13.0 * float(f.scale) * k
		var d: Vector2 = f.dir
		draw_circle(f.pos, r, Color(f.color, 0.45 * k))
		draw_line(f.pos, f.pos + d * (r * 1.9), Color.WHITE, 2.4 * k, true)
	for r in ripples:
		var p := float(r.t) / float(r.dur)
		var rad := lerpf(6.0, float(r.max_r), p)
		draw_arc(r.pos, rad, 0.0, TAU, 24, Color(r.color, (1.0 - p) * 0.75), 2.0, true)
	for s in sparks:
		var k := 1.0 - float(s.t) / float(s.dur)
		var tail: Vector2 = s.pos - (s.vel as Vector2) * 0.035
		draw_line(tail, s.pos, Color(s.color, k), 2.0, true)
	var font := ThemeDB.fallback_font
	if font != null:
		for pop in popups:
			var k := clampf(1.0 - float(pop.t) / float(pop.dur), 0.0, 1.0)
			var pos: Vector2 = pop.pos
			draw_string(font, pos + Vector2(-44.0, 1.0), str(pop.text), HORIZONTAL_ALIGNMENT_CENTER, 88.0, 13, Color(0.0, 0.0, 0.0, 0.72 * k))
			draw_string(font, pos + Vector2(-45.0, 0.0), str(pop.text), HORIZONTAL_ALIGNMENT_CENTER, 88.0, 13, Color(pop.color.r, pop.color.g, pop.color.b, k))
