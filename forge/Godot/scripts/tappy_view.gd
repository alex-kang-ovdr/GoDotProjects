extends Node2D
## Native Godot view. No browser rendering or game-rule execution is used here.

var state: Dictionary = {}
var textures: Dictionary = {}
var bird: Sprite2D
var ground: Sprite2D
var hud: Node2D
var pipe_nodes: Array[Node2D] = []
var message := "Loading project…"
var font: Font = ThemeDB.fallback_font

func configure(project_dir: String, manifest: Dictionary) -> Error:
	for asset in manifest.get("assets", []):
		var relative: String = asset.get("path", "")
		if relative.is_absolute_path() or ".." in relative.split("/") or "\\" in relative:
			return ERR_INVALID_DATA
		var file := FileAccess.open(project_dir.path_join(relative), FileAccess.READ)
		if file == null:
			return ERR_FILE_NOT_FOUND
		var image := Image.new()
		if image.load_svg_from_string(file.get_as_text()) != OK:
			return ERR_FILE_CORRUPT
		textures[asset.id] = ImageTexture.create_from_image(image)
	for id in ["tappy.chicken", "tappy.ground", "tappy.pipe"]:
		if not textures.has(id):
			return ERR_INVALID_DATA
	ground = Sprite2D.new()
	ground.texture = textures["tappy.ground"]
	ground.position = Vector2(240, 605)
	ground.scale = Vector2(480, 70) / ground.texture.get_size()
	add_child(ground)
	bird = Sprite2D.new()
	bird.texture = textures["tappy.chicken"]
	bird.scale = Vector2(40, 34) / bird.texture.get_size()
	bird.z_index = 3
	add_child(bird)
	hud = Node2D.new()
	hud.z_index = 10
	hud.draw.connect(_draw_hud)
	add_child(hud)
	return OK

func show_state(next: Dictionary) -> void:
	state = next
	if is_instance_valid(bird):
		bird.visible = state.has("bird")
		if bird.visible:
			bird.position = Vector2(state.bird.x, state.bird.y)
			bird.rotation = state.bird.angle
	var pipes: Array = state.get("pipes", [])
	while pipe_nodes.size() > pipes.size():
		var removed = pipe_nodes.pop_back()
		remove_child(removed)
		removed.queue_free()
	while pipe_nodes.size() < pipes.size():
		var pair := Node2D.new()
		for index in range(2):
			var sprite := Sprite2D.new()
			sprite.texture = textures.get("tappy.pipe")
			sprite.centered = false
			sprite.flip_v = index == 1
			pair.add_child(sprite)
		add_child(pair)
		pipe_nodes.append(pair)
	for index in range(pipes.size()):
		var pipe: Dictionary = pipes[index]
		var pair: Node2D = pipe_nodes[index]
		var width: float = state.get("settings", {}).get("pipeWidth", 78)
		pair.position.x = pipe.x
		pair.get_child(0).scale = Vector2(width / 88.0, maxf(0, pipe.top) / 600.0)
		pair.get_child(1).position.y = pipe.bottom
		pair.get_child(1).scale = Vector2(width / 88.0, maxf(0, 570 - pipe.bottom) / 600.0)
	queue_redraw()
	if is_instance_valid(hud):
		hud.queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(0, 0, 480, 570), Color("a6dbe0"))
	for x in [50, 230, 410]:
		draw_circle(Vector2(x, 145), 35, Color("d9eef0"))
		draw_circle(Vector2(x + 35, 153), 25, Color("d9eef0"))
	draw_rect(Rect2(0, 510, 480, 60), Color("7fb9ad"))

func _draw_hud() -> void:
	if state.is_empty():
		hud.draw_string(font, Vector2(32, 290), message, HORIZONTAL_ALIGNMENT_LEFT, 416, 22, Color("183a43"))
		return
	hud.draw_rect(Rect2(0, 0, 480, 58), Color("a6dbe0dd"))
	hud.draw_string(font, Vector2(24, 42), "SCORE  %s" % state.get("score", 0), HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color("183a43"))
	hud.draw_string(font, Vector2(336, 40), "BEST  %s" % state.get("best", 0), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("183a43"))
	var mode: String = state.get("state", "")
	if mode in ["ready", "paused", "over"]:
		hud.draw_style_box(_panel(), Rect2(60, 355, 360, 95))
		var titles := {"ready": "TAPPY CHICKEN", "paused": "PAUSED", "over": "TRY AGAIN"}
		hud.draw_string(font, Vector2(60, 391), titles[mode], HORIZONTAL_ALIGNMENT_CENTER, 360, 26, Color.WHITE)
		var hint := "Space / click to flap" if mode != "paused" else "P to resume"
		hud.draw_string(font, Vector2(60, 424), hint, HORIZONTAL_ALIGNMENT_CENTER, 360, 17, Color("b8d2da"))

func _panel() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17323ee8")
	style.set_corner_radius_all(12)
	return style
