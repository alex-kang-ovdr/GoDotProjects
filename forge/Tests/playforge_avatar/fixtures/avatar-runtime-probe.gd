extends SceneTree

const AvatarCatalogScript = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const AvatarControllerScript = preload("res://addons/playforge_avatar/avatar_controller.gd")
const AvatarSpawnScript = preload("res://addons/playforge_avatar/avatar_spawn.gd")
const AvatarRigScript = preload("res://addons/playforge_avatar/avatar_rig.gd")
const AvatarRagdollScript = preload("res://addons/playforge_avatar/avatar_ragdoll.gd")

var _failures: Array[String] = []


func _assert(cond: bool, msg: String) -> void:
	if not cond:
		_failures.append(msg)
		push_error("ASSERT FAILED: " + msg)


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var report := {
		"catalogOk": false,
		"checksumOk": false,
		"skinsTested": [],
		"attachmentsTested": {},
		"cameraModesTested": [],
		"fpsHeadHidden": false,
		"tpsMovedDistance": 0.0,
		"topDownMovedDistance": 0.0,
		"jumpHeightDelta": 0.0,
		"ragdollActive": false,
		"ragdollPhysicalBones": 0,
		"ragdollRecovered": false,
		"emoteStarted": false,
		"emoteStoppedOnMove": false,
		"creatorClampOk": false,
		"creatorHasNoCosmeticSetter": false,
		"failures": [],
	}

	# 1. Catalog + SHA-256 verification
	var catalog: AvatarCatalogScript = AvatarCatalogScript.new()
	report.catalogOk = catalog.load_catalog()
	_assert(report.catalogOk, "Catalog failed to load")
	var verify: Dictionary = catalog.verify_seal_manifest()
	report.checksumOk = bool(verify.get("ok", false))
	_assert(report.checksumOk, "Asset SHA-256 verification failed: " + JSON.stringify(verify))

	# 2. Build minimal 3D floor + AvatarSpawn
	var world := Node3D.new()
	world.name = "ProbeWorld"
	root.add_child(world)

	var floor_body := StaticBody3D.new()
	var floor_col := CollisionShape3D.new()
	var floor_shape := BoxShape3D.new()
	floor_shape.size = Vector3(80.0, 1.0, 80.0)
	floor_col.shape = floor_shape
	floor_col.position = Vector3(0.0, -0.5, 0.0)
	floor_body.add_child(floor_col)
	world.add_child(floor_body)

	var spawn: AvatarSpawnScript = AvatarSpawnScript.new()
	spawn.position = Vector3(0.0, 0.1, 0.0)
	spawn.camera_mode = AvatarControllerScript.CameraMode.TPS
	world.add_child(spawn)

	await process_frame
	await process_frame
	var controller: AvatarControllerScript = spawn.get_avatar()
	_assert(controller != null, "PlayForgeAvatarSpawn did not spawn controller")
	if controller == null:
		_finish(report)
		return

	# Check creator-safe clamping & absence of cosmetic override methods
	controller.walk_speed_multiplier = 99.0
	controller.jump_height_multiplier = 0.01
	report.creatorClampOk = is_equal_approx(controller.walk_speed_multiplier, 2.0) and is_equal_approx(controller.jump_height_multiplier, 0.5)
	_assert(report.creatorClampOk, "Creator multipliers were not safely clamped")
	controller.walk_speed_multiplier = 1.0
	controller.jump_height_multiplier = 1.0

	report.creatorHasNoCosmeticSetter = (
		not controller.has_method("set_skin")
		and not controller.has_method("set_attachment")
		and not controller.has_method("override_material")
		and not controller.has_method("set_loadout")
	)
	_assert(report.creatorHasNoCosmeticSetter, "Controller must NOT expose cosmetic override setters to Forge creators")

	# 3. Verify all 5 external GLB skins + attachments via internal rig loader (probe-only verification)
	var rig: AvatarRigScript = controller.get_node("SealedAvatarRig") as AvatarRigScript
	var ragdoll: AvatarRagdollScript = controller.get_node("SealedAvatarRagdoll") as AvatarRagdollScript
	for skin_item in catalog.list_items("skin"):
		var skin_id := str(skin_item.id)
		var test_loadout := {
			"skinId": skin_id,
			"attachments": {
				"head": "acc_crown_gold",
				"back": "acc_shield_badge",
				"hand_r": "acc_sword_1h",
				"hand_l": "acc_spellbook",
			},
			"emoteWheel": ["emote_cheer", "emote_dance", "emote_wave", "emote_punch"],
		}
		var summary := rig.apply_sealed_loadout(test_loadout)
		var pb_count := ragdoll.setup_for_skeleton(rig.get_skeleton(), rig.get_rig_profile())
		report.skinsTested.append({
			"skinId": skin_id,
			"ok": bool(summary.get("ok", false)),
			"bones": int(summary.get("boneCount", 0)),
			"animations": int(summary.get("animationCount", 0)),
			"mountedCount": (summary.get("mountedAttachments", {}) as Dictionary).size(),
			"ragdollBones": pb_count,
		})
		_assert(bool(summary.get("ok", false)), "Skin failed to load: " + skin_id)
		_assert(int(summary.get("boneCount", 0)) >= 20, "Skin missing humanoid skeleton: " + skin_id)
		_assert(int(summary.get("animationCount", 0)) >= 10, "Skin missing animations: " + skin_id)
		_assert((summary.get("mountedAttachments", {}) as Dictionary).size() == 4, "Not all 4 attachment sockets mounted on: " + skin_id)
		_assert(pb_count >= 10, "Ragdoll physical bones missing on: " + skin_id)
		report.attachmentsTested = summary.get("mountedAttachments", {})

	# Switch back to default Knight loadout for physics tests
	rig.apply_sealed_loadout({
		"skinId": "skin_knight",
		"attachments": {"head": "acc_visor_cyber", "back": "acc_quiver", "hand_r": "acc_staff", "hand_l": "acc_dagger"},
		"emoteWheel": ["emote_cheer", "emote_wave", "emote_dance", "emote_sit"],
	})
	ragdoll.setup_for_skeleton(rig.get_skeleton(), rig.get_rig_profile())
	await physics_frame
	await physics_frame

	# 4. TPS locomotion + sprint + jump
	controller.set_camera_mode(AvatarControllerScript.CameraMode.TPS)
	report.cameraModesTested.append(controller.get_camera_mode_name())
	var start_pos := controller.global_position
	controller.set_virtual_input(Vector2(0.0, -1.0), true, false, false)
	for _i in range(25):
		await physics_frame
	report.tpsMovedDistance = start_pos.distance_to(controller.global_position)
	_assert(report.tpsMovedDistance > 0.8, "TPS locomotion did not move avatar")

	# Jump check
	controller.set_virtual_input(Vector2.ZERO, false, false, true)
	var max_y := controller.global_position.y
	for _i in range(18):
		await physics_frame
		max_y = maxf(max_y, controller.global_position.y)
	report.jumpHeightDelta = max_y - start_pos.y
	_assert(report.jumpHeightDelta > 0.35, "Avatar jump height too low")
	for _i in range(30):
		await physics_frame

	# 5. FPS mode + head mesh hidden
	controller.set_camera_mode(AvatarControllerScript.CameraMode.FPS)
	report.cameraModesTested.append(controller.get_camera_mode_name())
	await process_frame
	report.fpsHeadHidden = bool(rig.get_rig_summary().get("firstPersonHeadHidden", false))
	_assert(report.fpsHeadHidden, "FPS mode must hide local head mesh (SHADOWS_ONLY)")

	# 6. TopDown mode + movement
	controller.set_camera_mode(AvatarControllerScript.CameraMode.TOP_DOWN)
	report.cameraModesTested.append(controller.get_camera_mode_name())
	var td_start := controller.global_position
	controller.set_virtual_input(Vector2(1.0, 0.0), false, false, false)
	for _i in range(20):
		await physics_frame
	report.topDownMovedDistance = td_start.distance_to(controller.global_position)
	_assert(report.topDownMovedDistance > 0.4, "TopDown locomotion did not move avatar")
	controller.set_virtual_input(Vector2.ZERO)

	# 7. Emote playback & cancellation on move
	report.emoteStarted = controller.play_emote_slot(0)
	_assert(report.emoteStarted and rig.is_emote_playing(), "Emote slot 0 did not start")
	await process_frame
	controller.set_virtual_input(Vector2(0.0, -1.0))
	await physics_frame
	await physics_frame
	report.emoteStoppedOnMove = not rig.is_emote_playing()
	_assert(report.emoteStoppedOnMove, "Moving did not cancel active emote")
	controller.set_virtual_input(Vector2.ZERO)

	# 8. Ragdoll trigger, physics frames, and recovery
	var entered := controller.trigger_ragdoll(Vector3(0.0, 2.0, -6.0), "chest")
	_assert(entered and controller.is_ragdoll_active(), "Ragdoll failed to activate")
	report.ragdollActive = controller.is_ragdoll_active()
	report.ragdollPhysicalBones = ragdoll.get_physical_bone_count()
	for _i in range(15):
		await physics_frame
	var recovered := controller.recover_from_ragdoll()
	await physics_frame
	report.ragdollRecovered = recovered and not controller.is_ragdoll_active()
	_assert(report.ragdollRecovered, "Ragdoll failed to recover back to kinematic locomotion")

	_finish(report)


func _finish(report: Dictionary) -> void:
	report.failures = _failures
	print("AVATAR_PROBE_JSON=" + JSON.stringify(report))
	quit(0 if _failures.is_empty() else 1)
