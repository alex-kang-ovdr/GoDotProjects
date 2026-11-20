extends Node2D
## Draw the complete effects layer into a transparent SubViewport. Its compositing
## TextureRect MUST use visibility_mask.gdshader. Do not center-cull world effects:
## beams and circles can cross from a hidden center into a visible grid cell.

const BLUE = Color("62d7e5")
const RED = Color("f08086")
const GOLD = Color("ddc18b")
var world
var camera_pos: Vector2 = Vector2.ZERO
var zoom: float = 1.0
var view_size: Vector2 = Vector2(1280, 720)
var font: Font

func _draw():
 if world == null or world.abilities == null or zoom <= 0.0:
  return
 draw_set_transform(view_size * 0.5 - camera_pos * zoom, 0.0, Vector2.ONE * zoom)
 for effect in world.abilities.effects:
  _draw_ability_effect(effect)
 for shot in world.abilities.projectiles:
  _draw_projectile(shot)
 for visual in world.visuals:
  _draw_visual(visual)
 draw_set_transform(Vector2.ZERO)

func _color(value, fallback: Color = BLUE) -> Color:
 return value if value is Color else fallback

func _alpha(color: Color, alpha: float) -> Color:
 return Color(color.r, color.g, color.b, clampf(alpha, 0.0, 1.0))

func _draw_ability_effect(effect: Dictionary):
 if float(effect.get("until", 0.0)) <= world.time:
  return
 var kind: String = effect.get("kind", "")
 var p: Vector2 = effect.get("pos", Vector2.ZERO)
 var color = _color(effect.get("color"), BLUE if effect.get("team", 0) == 0 else RED)
 var radius = float(effect.get("radius", 0.0))
 var age = maxf(0.0, world.time - float(effect.get("at", world.time)))
 var pulse = 0.5 + 0.5 * sin(world.time * 6.0)
 # A target mark is semantic actor information. The grid compositor alone is
 # insufficient for brush-hidden enemies, so require entity visibility as well.
 if kind in ["darius_bleed", "ezreal_mark", "leona_sunlight", "lux_mark", "rejuvenation"]:
  var target = world.unit(int(effect.get("target_id", -1)))
  if target.is_empty() or not target.get("alive", false) or not world.visible_to(target, 0):
   return
  p = target.pos
  var ring = float(target.get("r", 19.0)) + 7.0
  match kind:
   "darius_bleed":
    var stacks = clampi(int(effect.get("stacks", 1)), 1, 5)
    for i in stacks:
     var a = -PI * 0.5 + (i - (stacks - 1) * 0.5) * 0.27
     var marker = p + Vector2.from_angle(a) * (ring + 12.0)
     draw_circle(marker, 3.4, _alpha(color, 0.96))
     draw_line(marker, marker + Vector2(0, 5), _alpha(color, 0.6), 1.7, true)
   "ezreal_mark":
    draw_arc(p, ring, 0, TAU, 32, _alpha(color, 0.85), 2.4, true)
    draw_arc(p, ring + 4, age * 2, age * 2 + PI * 0.65, 18, _alpha(GOLD, 0.95), 2.0, true)
   "leona_sunlight":
    for i in 8:
     var d = Vector2.from_angle(i * TAU / 8 + age)
     draw_line(p + d * ring, p + d * (ring + 7), _alpha(color, 0.88), 2.0, true)
   "lux_mark":
    _diamond(p + Vector2(0, -ring - 5), 5.0, _alpha(color, 0.95))
   "rejuvenation":
    draw_arc(p, ring, 0, TAU, 36, _alpha(color, 0.40 + pulse * 0.30), 2.4, true)
    var at = p + Vector2(0, -ring - 9)
    draw_line(at - Vector2(5, 0), at + Vector2(5, 0), color, 2.2, true)
    draw_line(at - Vector2(0, 5), at + Vector2(0, 5), color, 2.2, true)
  return
 # Targeted homing bolt trajectories have a moving endpoint; do not reveal a
 # hidden actor by drawing a line toward its live position.
 if kind in ["ezreal_bolt", "bounce"]:
  var target = world.unit(int(effect.get("target_id", -1)))
  if target.is_empty() or not target.get("alive", false) or not world.visible_to(target, 0):
   return
  if kind == "ezreal_bolt":
   draw_circle(p, 5.0 + pulse * 2.0, _alpha(color, 0.8))
  else:
   draw_circle(p, 6.0, _alpha(color, 0.9))
  return
 if kind == "lux_laser":
  var direction: Vector2 = effect.get("dir", Vector2.RIGHT)
  var endpoint: Vector2 = p + direction * float(effect.get("range", 0.0))
  var fired: bool = effect.get("fired", false)
  var progress = _progress(effect, "fire_at")
  if fired:
   draw_line(p, endpoint, _alpha(color, 0.14), radius * 2.0, true)
   draw_line(p, endpoint, _alpha(color, 0.75), 9.0, true)
   draw_line(p, endpoint, _alpha(Color.WHITE, 0.92), 3.0, true)
  else:
   draw_line(p, endpoint, _alpha(color, 0.06 + progress * 0.09), radius * 2.0, true)
   draw_line(p, endpoint, _alpha(color, 0.45 + progress * 0.35), 1.6, true)
   var perpendicular = direction.orthogonal() * radius
   draw_line(p + perpendicular, endpoint + perpendicular, _alpha(color, 0.18), 1.0, true)
   draw_line(p - perpendicular, endpoint - perpendicular, _alpha(color, 0.18), 1.0, true)
  return
 if kind == "foxfire":
  var owner = world.unit(int(effect.get("source_id", -1)))
  if owner.is_empty() or not world.visible_to(owner, 0):
   return
  for i in int(effect.get("remaining", 0)):
   var orb = owner.pos + Vector2.from_angle(age * 3 + i * TAU / 3) * 35.0
   draw_circle(orb, 8.5, _alpha(color, 0.18))
   draw_circle(orb, 4.0, _alpha(color, 0.95))
  return
 if kind in ["scout", "scout_hold"]:
  # Scout shares its actual position through the special vision emitter.
  draw_circle(p, 5.0, _alpha(color, 0.9))
  draw_arc(p, radius, 0, TAU, 64, _alpha(color, 0.18 + pulse * 0.10), 1.1, true)
  var wings = 11.0 + pulse * 3.0
  draw_line(p, p + Vector2(-wings, -6), _alpha(color, 0.85), 1.8, true)
  draw_line(p, p + Vector2(wings, -6), _alpha(color, 0.85), 1.8, true)
  return
 if kind == "jhin_trap":
  var armed: bool = float(effect.get("arm_at", 0.0)) <= world.time
  var triggered: bool = float(effect.get("trigger_at", 0.0)) > 0.0
  _diamond(p, 8.0, _alpha(color, 0.8 if armed else 0.4))
  draw_arc(p, 15.0, 0, TAU, 24, _alpha(color, 0.6), 1.2, true)
  if triggered:
   var fuse = clampf(1.0 - (float(effect.trigger_at) - world.time) / 2.0, 0.0, 1.0)
   draw_circle(p, radius, _alpha(color, 0.07 + fuse * 0.12))
   draw_arc(p, radius, -PI * 0.5, -PI * 0.5 + TAU * fuse, 60, _alpha(color, 0.95), 2.5, true)
  return
 if radius <= 0.0:
  return
 var delayed: bool = effect.has("fire_at")
 var progress = _progress(effect, "fire_at") if delayed else 0.0
 var fill_alpha = 0.06 + (progress * 0.12 if delayed else pulse * 0.03)
 draw_circle(p, radius, _alpha(color, fill_alpha))
 draw_arc(p, radius, 0, TAU, 64, _alpha(color, 0.5 + progress * 0.35), 1.7, true)
 if delayed:
  draw_arc(p, radius - 3.0, -PI * 0.5, -PI * 0.5 + TAU * maxf(progress, 0.001), 56, _alpha(color, 0.9), 2.8, true)
 if effect.has("inner_radius"):
  var inner = float(effect.inner_radius)
  draw_arc(p, inner, 0, TAU, 48, _alpha(color, 0.55), 1.2, true)
  if kind == "leona_flare": draw_circle(p, inner, _alpha(color, 0.10 + progress * 0.10))
 if kind == "soraka_star":
  var height = (1.0 - progress) * 65.0
  draw_line(p - Vector2(0, height + 15), p, _alpha(color, 0.3 + progress * 0.4), 2.5, true)
  _diamond(p - Vector2(0, height), 6.0, _alpha(Color.WHITE, 0.9))
 elif kind == "soraka_zone":
  for i in 6:
   var rune = p + Vector2.from_angle(i * TAU / 6 + age * 0.2) * (radius * 0.72)
   _diamond(rune, 3.5, _alpha(color, 0.6))

func _draw_projectile(shot: Dictionary):
 if not shot.get("active", true):
  return
 var p: Vector2 = shot.get("pos", Vector2.ZERO)
 var previous: Vector2 = shot.get("prev", p)
 var direction: Vector2 = shot.get("dir", Vector2.RIGHT)
 var radius = float(shot.get("radius", 8.0))
 var color = _color(shot.get("color"), BLUE if shot.get("team", 0) == 0 else RED)
 var kind: String = shot.get("kind", "")
 var trail = previous if p.distance_to(previous) > 24.0 else p - direction * 24.0
 draw_line(trail, p, _alpha(color, 0.25), maxf(3.0, radius * 0.9), true)
 if kind in ["ezreal_r", "ashe_r"]:
  var perpendicular = direction.orthogonal()
  draw_line(p - perpendicular * radius, p + perpendicular * radius, _alpha(color, 0.24), 16.0, true)
  draw_line(p - perpendicular * radius, p + perpendicular * radius, _alpha(color, 0.9), 3.4, true)
  draw_circle(p, 6.0, _alpha(Color.WHITE, 0.9))
 elif kind in ["ahri_q_out", "ahri_q_return"]:
  draw_circle(p, radius * 0.75, _alpha(color, 0.14))
  draw_arc(p, radius * 0.55, 0, TAU, 24, _alpha(color, 0.9), 2.0, true)
  draw_circle(p, 5.0, _alpha(Color.WHITE, 0.88))
 elif kind.begins_with("lux_w"):
  _diamond(p, 10.0, _alpha(color, 0.95))
  draw_arc(p, 17.0, 0, TAU, 24, _alpha(color, 0.35), 1.5, true)
 else:
  draw_circle(p, maxf(3.0, radius * 0.5), _alpha(color, 0.9))
  draw_circle(p, 2.5, _alpha(Color.WHITE, 0.92))

func _draw_visual(effect: Dictionary):
 if float(effect.get("until", 0.0)) <= world.time:
  return
 var p: Vector2 = effect.get("pos", Vector2.ZERO)
 var color = _color(effect.get("color"), GOLD)
 var duration = maxf(0.01, float(effect.get("until", world.time)) - float(effect.get("at", world.time)))
 var life = clampf((float(effect.until) - world.time) / duration, 0.0, 1.0)
 var radius = maxf(1.0, float(effect.get("radius", 15.0)))
 var kind: String = effect.get("kind", "ring")
 if effect.has("from") or effect.has("end") or effect.has("to"):
  var start: Vector2 = effect.get("from", p)
  var endpoint: Vector2 = effect.get("end", effect.get("to", p))
  if kind == "beam":
   draw_line(start, endpoint, _alpha(color, life * 0.12), minf(radius * 2.0, 110.0), true)
   draw_line(start, endpoint, _alpha(color, life * 0.9), 3.2 + life * 2.0, true)
   draw_line(start, endpoint, _alpha(Color.WHITE, life * 0.65), 1.3, true)
  else:
   draw_line(start, endpoint, _alpha(color, life * 0.7), 2.0, true)
  draw_circle(endpoint, maxf(3.0, minf(radius * 0.3, 12.0)), _alpha(color, life * 0.65))
 elif kind == "cone":
  var angle = float(effect.get("angle", 0.0))
  var half = float(effect.get("half_angle", 0.65))
  var points = PackedVector2Array([p])
  for i in 25:
   points.append(p + Vector2.from_angle(angle - half + 2.0 * half * i / 24.0) * radius)
  draw_colored_polygon(points, _alpha(color, life * 0.14))
  draw_arc(p, radius, angle - half, angle + half, 30, _alpha(color, life * 0.85), 2.0, true)
 elif kind == "recall":
  draw_arc(p, radius * (1.1 - life * 0.2), 0, TAU, 48, _alpha(color, life * 0.7), 2.5, true)
  draw_arc(p, radius * 0.65, world.time * 2, world.time * 2 + PI * 1.2, 40, _alpha(color, life), 2.0, true)
 else:
  var expanded = radius * (1.4 - life * 0.4)
  if kind in ["burst", "teleport"]: draw_circle(p, expanded, _alpha(color, life * 0.09))
  draw_arc(p, expanded, 0, TAU, 40, _alpha(color, life * 0.9), 1.7 + life, true)
 if effect.has("text"):
  var active_font: Font = font if font != null else ThemeDB.fallback_font
  draw_string(active_font, p + Vector2(-12, -20 - (1.0 - life) * 22), str(effect.text), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, _alpha(color, life))

func _progress(effect: Dictionary, end_key: String) -> float:
 var start = float(effect.get("at", world.time))
 var end = float(effect.get(end_key, start + 1.0))
 return clampf((world.time - start) / maxf(0.001, end - start), 0.0, 1.0)

func _diamond(at: Vector2, radius: float, color: Color):
 draw_colored_polygon(PackedVector2Array([at + Vector2(0, -radius), at + Vector2(radius, 0), at + Vector2(0, radius), at + Vector2(-radius, 0)]), color)
