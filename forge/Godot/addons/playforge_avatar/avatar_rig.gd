class_name PlayForgeAvatarRig
extends Node3D

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")

signal rig_loaded(summary: Dictionary)
signal emote_started(emote_id: String, emoji: String)
signal emote_finished(emote_id: String)

var _catalog: AvatarCatalog
var _model_pivot: Node3D
var _model_root: Node3D
var _skeleton: Skeleton3D
var _anim_player: AnimationPlayer
var _rig_profile: Dictionary = {}
var _active_loadout: Dictionary = {}
var _attachments_by_slot: Dictionary = {}
var _head_meshes: Array[MeshInstance3D] = []
var _fp_head_hidden := false
var _current_anim_key := ""
var _active_emote_id := ""
var _emote_timer := 0.0
var _emote_loop := false
var _emoji_badge: Label3D
var _emoji_base_height := 2.25
var _emoji_bob_time := 0.0


func _ready() -> void:
	set_meta("_playforge_avatar_sealed", true)
	_model_pivot = Node3D.new()
	_model_pivot.name = "ModelPivot"
	_model_pivot.set_meta("_playforge_avatar_sealed", true)
	add_child(_model_pivot)

	_emoji_badge = Label3D.new()
	_emoji_badge.name = "EmojiBadge"
	_emoji_badge.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_emoji_badge.no_depth_test = true
	_emoji_badge.font_size = 72
	_emoji_badge.outline_size = 12
	_emoji_badge.pixel_size = 0.0045
	_emoji_badge.position = Vector3(0.0, _emoji_base_height, 0.0)
	_emoji_badge.visible = false
	_emoji_badge.set_meta("_playforge_avatar_sealed", true)
	add_child(_emoji_badge)


func _process(delta: float) -> void:
	if not _active_emote_id.is_empty():
		_emoji_bob_time += delta
		if _emoji_badge != null and _emoji_badge.visible:
			_emoji_badge.position.y = _emoji_base_height + sin(_emoji_bob_time * 4.5) * 0.08
		if not _emote_loop:
			_emote_timer -= delta
			if _emote_timer <= 0.0:
				stop_emote()


func set_catalog(catalog: AvatarCatalog) -> void:
	_catalog = catalog


func apply_sealed_loadout(loadout: Dictionary) -> Dictionary:
	if _catalog == null:
		_catalog = AvatarCatalog.new()
		_catalog.load_catalog()
	var normalized := _catalog.normalize_loadout(loadout)
	_active_loadout = normalized
	_clear_model()

	var skin_id := str(normalized.get("skinId", "skin_knight"))
	var skin_item := _catalog.get_item(skin_id)
	var profile_id := str(skin_item.get("rigProfile", "kaykit_v1"))
	_rig_profile = _catalog.get_rig_profile(profile_id)
	var skin_res_path := _catalog.resolve_asset_res_path(skin_id)

	var instance := _load_glb_scene(skin_res_path)
	if instance == null:
		push_error("PlayForgeAvatarRig: failed to load GLB skin '%s' from %s" % [skin_id, skin_res_path])
		return {"ok": false, "error": "GLB_LOAD_FAILED", "skinId": skin_id}

	_model_root = instance
	_model_root.name = "SealedSkinModel"
	_mark_tree_sealed(_model_root)
	var model_scale := float(_rig_profile.get("modelScale", 1.0))
	_model_root.scale = Vector3.ONE * model_scale
	_model_pivot.rotation_degrees = Vector3(0.0, float(_rig_profile.get("facingYawDegrees", 180.0)), 0.0)
	_model_pivot.add_child(_model_root)

	_skeleton = _find_first_typed(_model_root, Skeleton3D) as Skeleton3D
	_anim_player = _find_first_typed(_model_root, AnimationPlayer) as AnimationPlayer
	_hide_bundled_kaykit_props(normalized.get("attachments", {}))
	_collect_head_meshes()
	_configure_looping_animations()
	_mount_attachments(normalized.get("attachments", {}))
	set_first_person_head_hidden(_fp_head_hidden)

	var eye_height := float(_rig_profile.get("eyeHeight", 1.62))
	_emoji_base_height = eye_height + 0.62
	if _emoji_badge != null:
		_emoji_badge.position = Vector3(0.0, _emoji_base_height, 0.0)

	_current_anim_key = ""
	play_locomotion_state("idle")

	var summary := get_rig_summary()
	rig_loaded.emit(summary)
	return summary


func get_skeleton() -> Skeleton3D:
	return _skeleton


func get_animation_player() -> AnimationPlayer:
	return _anim_player


func get_rig_profile() -> Dictionary:
	return _rig_profile.duplicate(true)


func get_active_loadout() -> Dictionary:
	return _active_loadout.duplicate(true)


func get_eye_height() -> float:
	return float(_rig_profile.get("eyeHeight", 1.62))


func is_emote_playing() -> bool:
	return not _active_emote_id.is_empty()


func get_active_emote_id() -> String:
	return _active_emote_id


func set_first_person_head_hidden(hidden: bool) -> void:
	_fp_head_hidden = hidden
	var mode := GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if hidden else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for mesh in _head_meshes:
		if is_instance_valid(mesh):
			mesh.cast_shadow = mode
	var head_attachment: Node3D = _attachments_by_slot.get("head", null)
	if head_attachment != null and is_instance_valid(head_attachment):
		_set_tree_shadow_only(head_attachment, hidden)


func play_locomotion_state(state_key: String, blend_time := 0.14) -> String:
	if not _active_emote_id.is_empty():
		return ""
	if state_key == _current_anim_key and _anim_player != null and _anim_player.is_playing():
		return _anim_player.current_animation
	var clip := _resolve_animation_clip(state_key)
	if clip.is_empty() or _anim_player == null:
		return ""
	_current_anim_key = state_key
	_anim_player.play(clip, blend_time)
	return clip


func pause_animations_for_ragdoll() -> void:
	stop_emote()
	if _anim_player != null:
		_anim_player.stop()
	_current_anim_key = ""


func play_emote(emote_id: String) -> bool:
	if _catalog == null or emote_id.is_empty():
		return false
	var item := _catalog.get_item(emote_id)
	if item.is_empty() or str(item.get("category", "")) != "emote":
		return false
	var anim_key := str(item.get("animationKey", emote_id))
	var clip := _resolve_animation_clip(anim_key)
	_active_emote_id = emote_id
	_emote_loop = bool(item.get("loop", false))
	_emote_timer = maxf(float(item.get("durationSec", 2.0)), 0.4)
	_emoji_bob_time = 0.0
	if not clip.is_empty() and _anim_player != null:
		var anim := _anim_player.get_animation(clip)
		if anim != null:
			anim.loop_mode = Animation.LOOP_LINEAR if _emote_loop else Animation.LOOP_NONE
		_anim_player.play(clip, 0.12)
	var emoji := str(item.get("emoji", "✨"))
	var label := str(item.get("name", emote_id))
	if _emoji_badge != null:
		_emoji_badge.text = "%s\n%s" % [emoji, label]
		_emoji_badge.visible = true
	emote_started.emit(emote_id, emoji)
	return true


func stop_emote() -> void:
	if _active_emote_id.is_empty():
		return
	var finished_id := _active_emote_id
	_active_emote_id = ""
	_emote_timer = 0.0
	_emote_loop = false
	_current_anim_key = ""
	if _emoji_badge != null:
		_emoji_badge.visible = false
	emote_finished.emit(finished_id)


func get_rig_summary() -> Dictionary:
	var anim_names: Array[String] = []
	if _anim_player != null:
		for name in _anim_player.get_animation_list():
			anim_names.append(str(name))
	var mounted: Dictionary = {}
	for slot in _attachments_by_slot.keys():
		var node: Node = _attachments_by_slot[slot]
		mounted[slot] = str(node.get_meta("_item_id", "")) if is_instance_valid(node) else ""
	return {
		"ok": _model_root != null and _skeleton != null,
		"skinId": str(_active_loadout.get("skinId", "")),
		"rigProfile": str(_catalog.get_item(str(_active_loadout.get("skinId", ""))).get("rigProfile", "")) if _catalog != null else "",
		"boneCount": _skeleton.get_bone_count() if _skeleton != null else 0,
		"animationCount": anim_names.size(),
		"mountedAttachments": mounted,
		"emoteWheel": _active_loadout.get("emoteWheel", []).duplicate(),
		"eyeHeight": get_eye_height(),
		"firstPersonHeadHidden": _fp_head_hidden,
	}


func _mount_attachments(attachments: Variant) -> void:
	_attachments_by_slot.clear()
	if not attachments is Dictionary or _skeleton == null:
		return
	var sockets: Dictionary = _rig_profile.get("sockets", {})
	for slot in AvatarCatalog.ATTACHMENT_SLOTS:
		var item_id: Variant = attachments.get(slot, null)
		if not item_id is String or item_id.is_empty():
			continue
		var socket_cfg: Variant = sockets.get(slot, null)
		if not socket_cfg is Dictionary:
			continue
		var bone_name := _resolve_skeleton_bone(_skeleton, str(socket_cfg.get("bone", "")))
		if bone_name.is_empty():
			continue
		var asset_path := _catalog.resolve_asset_res_path(item_id)
		var prop_scene := _load_glb_scene(asset_path)
		if prop_scene == null:
			continue
		var bone_att := BoneAttachment3D.new()
		bone_att.name = "Socket_" + slot
		bone_att.bone_name = bone_name
		bone_att.set_meta("_playforge_avatar_sealed", true)
		bone_att.set_meta("_item_id", item_id)

		var holder := Node3D.new()
		holder.name = "Offset"
		holder.position = _vec3_from_array(socket_cfg.get("position", [0.0, 0.0, 0.0]), Vector3.ZERO)
		holder.rotation_degrees = _vec3_from_array(socket_cfg.get("rotationDegrees", [0.0, 0.0, 0.0]), Vector3.ZERO)
		holder.scale = _vec3_from_array(socket_cfg.get("scale", [1.0, 1.0, 1.0]), Vector3.ONE)
		holder.add_child(prop_scene)
		_mark_tree_sealed(holder)

		bone_att.add_child(holder)
		_skeleton.add_child(bone_att)
		_attachments_by_slot[slot] = bone_att


func _load_glb_scene(res_path: String) -> Node3D:
	if res_path.is_empty():
		return null
	# Primary: direct GLB binary parse (works identically in Desktop, Headless, Web Export & HTTP bytes without .import cache)
	if FileAccess.file_exists(res_path):
		var bytes := FileAccess.get_file_as_bytes(res_path)
		if not bytes.is_empty():
			var gltf := GLTFDocument.new()
			var state := GLTFState.new()
			var err := gltf.append_from_buffer(bytes, res_path.get_base_dir(), state)
			if err == OK:
				var generated := gltf.generate_scene(state)
				if generated is Node3D:
					return generated as Node3D
	# Secondary fallback: Godot imported PackedScene resource
	if ResourceLoader.exists(res_path):
		var packed := ResourceLoader.load(res_path) as PackedScene
		if packed != null:
			var inst := packed.instantiate()
			if inst is Node3D:
				return inst as Node3D
	return null


func _resolve_animation_clip(state_key: String) -> String:
	if _anim_player == null:
		return ""
	var anim_map: Dictionary = _rig_profile.get("animations", {})
	var candidates: Variant = anim_map.get(state_key, [])
	if candidates is Array:
		for candidate in candidates:
			var clip_name := str(candidate)
			if _anim_player.has_animation(clip_name):
				return clip_name
	if _anim_player.has_animation(state_key):
		return state_key
	return ""


func _configure_looping_animations() -> void:
	if _anim_player == null:
		return
	for key in ["idle", "walk", "walk_back", "run", "strafe_left", "strafe_right", "jump_air", "crouch"]:
		var clip := _resolve_animation_clip(key)
		if not clip.is_empty():
			var anim := _anim_player.get_animation(clip)
			if anim != null:
				anim.loop_mode = Animation.LOOP_LINEAR


func _hide_bundled_kaykit_props(attachments: Variant) -> void:
	if _model_root == null:
		return
	var has_custom_head := attachments is Dictionary and attachments.get("head", null) is String and not str(attachments.get("head", "")).is_empty()
	var stack: Array[Node] = [_model_root]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		if current is BoneAttachment3D:
			var bname := (current as BoneAttachment3D).bone_name.to_lower()
			if bname == "handslot.l" or bname == "handslot.r":
				(current as Node3D).visible = false
			elif has_custom_head and bname == "head":
				for child in current.get_children():
					var cname := child.name.to_lower()
					if child is Node3D and (cname.contains("helmet") or cname.contains("hat")):
						(child as Node3D).visible = false
		for child in current.get_children():
			stack.append(child)


func _collect_head_meshes() -> void:
	_head_meshes.clear()
	if _model_root == null:
		return
	var keywords: Array = _rig_profile.get("headMeshKeywords", ["head"])
	var stack: Array[Node] = [_model_root]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		if current is MeshInstance3D:
			var lowered := current.name.to_lower()
			for kw in keywords:
				if lowered.contains(str(kw).to_lower()):
					_head_meshes.append(current as MeshInstance3D)
					break
		for child in current.get_children():
			stack.append(child)


func _set_tree_shadow_only(root: Node, shadow_only: bool) -> void:
	var mode := GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if shadow_only else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		if current is GeometryInstance3D:
			(current as GeometryInstance3D).cast_shadow = mode
		for child in current.get_children():
			stack.append(child)


func _clear_model() -> void:
	stop_emote()
	_attachments_by_slot.clear()
	_head_meshes.clear()
	_skeleton = null
	_anim_player = null
	if _model_root != null and is_instance_valid(_model_root):
		_model_root.queue_free()
	_model_root = null


func _find_first_typed(root: Node, type_class: Variant) -> Node:
	if root == null:
		return null
	if is_instance_of(root, type_class):
		return root
	for child in root.get_children():
		var found := _find_first_typed(child, type_class)
		if found != null:
			return found
	return null


func _mark_tree_sealed(root: Node) -> void:
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var current: Node = stack.pop_back()
		current.set_meta("_playforge_avatar_sealed", true)
		for child in current.get_children():
			stack.append(child)


static func _resolve_skeleton_bone(skeleton: Skeleton3D, wanted: String) -> String:
	if skeleton == null or wanted.is_empty():
		return ""
	if skeleton.find_bone(wanted) >= 0:
		return wanted
	var underscore := wanted.replace(".", "_")
	if skeleton.find_bone(underscore) >= 0:
		return underscore
	var norm_wanted := wanted.to_lower().replace(".", "").replace("_", "").replace("-", "")
	for i in range(skeleton.get_bone_count()):
		var bname := skeleton.get_bone_name(i)
		var norm := bname.to_lower().replace(".", "").replace("_", "").replace("-", "")
		if norm == norm_wanted or norm.begins_with(norm_wanted):
			return bname
	return ""


static func _vec3_from_array(value: Variant, fallback: Vector3) -> Vector3:
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	return fallback
