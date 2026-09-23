extends SceneTree

const MainScript = preload("res://scripts/main.gd")
const ModelScript = preload("res://scripts/ship_model.gd")
var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	print("[PASS] " if condition else "[FAIL] ", label)
	if not condition:
		failures.append(label)

func _init() -> void:
	call_deferred("run_tests")

func run_tests() -> void:
	var model := ModelScript.new()
	model.add("core", Vector2i.ZERO)
	var beam := model.add("beam4", Vector2i(1, 0))
	var expected_x := 2.5 * Balance.CELL * float(beam.spec().mass) / model.total_mass()
	expect(is_equal_approx(model.center_of_mass().x, expected_x), "다칸 파트 질량중심은 모든 셀의 중심")
	var foreign := PartData.new(1, "block", Vector2i.ZERO)
	expect(model.attach(foreign, Vector2i(0, 1)), "다른 함선의 파트 장착")
	expect(foreign.uid != model.core_part().uid, "회수 파트 UID는 함선 안에서 유일")
	var game = MainScript.new()
	root.add_child(game)
	await process_frame
	await process_frame
	expect(paused and not game.hud.input_enabled, "대화 중 월드 물리와 무기 입력 정지")
	expect(ThemeDB.fallback_font.has_char("한".unicode_at(0)), "배포 글꼴 한글 글리프 포함")
	var paused_ammo: int = game.player.model.ammo_total("missile")
	game.handle_hud_weapon("missile")
	expect(game.player.model.ammo_total("missile") == paused_ammo, "대화 뒤 HUD 클릭 발사 차단")
	expect(is_instance_valid(game.player.voxel_renderer.camera_3d), "메시 재구축 후 직교 카메라 생존")
	var drive: PartData = game.player.parts_with_actuator("forward")[0]
	expect(game.player.module_force_offset(drive).is_equal_approx(game.player.module_local_center(drive)), "apply_force 위치는 CoM 아닌 바디 원점 기준")
	game.dialogue.current.clear()
	game.dialogue.dialogue_queue.clear()
	game.sync_pause_state()
	game.player.rotation = 0.0
	game.set_navigation_destination(game.player.position + Vector2(0, 800))
	game.apply_auto_navigation()
	for index in 12:
		await physics_frame
	expect(game.player.angular_velocity > 0.0, "화면 아래 목적지로 양의 회전 항법")
	game.spawn_enemy(1)
	var npc: EnemyShip = game.enemies.back()
	npc.archetype = "roamer"
	npc.radar_range = 0.0
	npc.ai_state = EnemyShip.STATE_ROAMING
	npc.global_position = game.player.global_position + Vector2(400, 0)
	game.selected_target = null
	game.player.mini_missile_cooldown = 0.0
	var ammo_before: int = game.player.model.ammo_total("missile")
	game.update_enemy_combat()
	expect(game.player.model.ammo_total("missile") == ammo_before, "자동 어뢰가 평화 NPC를 선제 공격하지 않음")
	game.set_physics_process(false)
	clear_dialogue(game)
	game.player.rebuild_voxel_renderer()
	game.player.rebuild_voxel_renderer()
	await process_frame
	expect(is_instance_valid(game.player.voxel_renderer.camera_3d), "같은 프레임 연속 메시 재구축 카메라 유지")
	var renderer: VoxelShipRenderer = game.player.voxel_renderer
	expect(renderer.viewport.own_world_3d, "함선별 독립 3D 월드")
	var initial_mass: float = game.player.mass
	var initial_hp: float = game.player.model.core_part().hp
	var initial_count: int = game.player.model.parts.size()
	expect(renderer.mesh_root.get_child(0).material_override is StandardMaterial3D, "기본 모듈 치트는 무텍스처 재질")
	for kind in Balance.MODULES:
		expect(VisualTuning.MODULE_DEBUG_LABELS.has(str(kind)) and not VisualTuning.module_debug_label(str(kind)).is_empty(), "치트 모듈 이름: " + str(kind))
	expect(not game.camera.ignore_rotation, "우클릭 시점 회전이 실제 카메라에 적용")
	game.camera.rotation = 0.7
	game.camera.force_update_scroll()
	var label_angle: float = game.player.get_global_transform_with_canvas().get_rotation() + VisualTuning.module_label_rotation(game.player)
	expect(is_zero_approx(label_angle), "회전한 함선·카메라에서도 모듈 글자는 화면 수평")
	game.camera.rotation = 0.0
	game.camera.force_update_scroll()
	game.update_module_inspector(game.player.global_position)
	expect(game.hud.module_title.contains("[core]") and game.hud.module_detail.contains("Hull"), "장착 모듈 전체 이름·스펙 검사")
	var neutral: NeutralPart = game.world_layer.get_children().filter(func(node): return node is NeutralPart and node.part.kind == "beam3")[0]
	var neutral_tip := neutral.to_global(Vector2(2, 0) * Balance.CELL)
	expect(neutral.contains_world_point(neutral_tip), "다칸 중립 부품 끝 셀 검사")
	game.update_module_inspector(neutral_tip)
	expect(game.hud.module_title.contains("중립 부품") and game.hud.module_title.contains("[beam3]"), "중립 부품 이름·스펙 검사")
	game.toggle_module_display()
	game.update_module_inspector(game.player.global_position)
	expect(game.hud.module_title.is_empty(), "디자인 모드 검사 카드 숨김")
	expect(renderer.mesh_root.get_child(0).material_override is ShaderMaterial, "HUD 디자인 전환은 마스크 텍스처 재질")
	expect(npc.voxel_renderer.mesh_root.get_child(0).material_override is ShaderMaterial, "기존 NPC도 디자인 모드 전환")
	game.spawn_enemy(1)
	var new_npc: EnemyShip = game.enemies.back()
	expect(new_npc.voxel_renderer.mesh_root.get_child(0).material_override is ShaderMaterial, "새 NPC가 현재 디자인 모드를 상속")
	game.toggle_module_display()
	expect(renderer.mesh_root.get_child(0).material_override is StandardMaterial3D, "무텍스처 모드 재전환")
	expect(game.player.mass == initial_mass and game.player.model.core_part().hp == initial_hp and game.player.model.parts.size() == initial_count, "표시 치트가 질량·HP·파트 수를 바꾸지 않음")
	var background: SpaceBackground = game.world_layer.get_children().filter(func(node): return node is SpaceBackground)[0]
	expect(background.z_index < game.z_index, "배경이 장착 후보·항법 표식을 가리지 않음")
	var empty_cell := Vector2(3, 2) * Balance.CELL
	var hit: Dictionary = game.player.projectile_hit(game.player.to_global(empty_cell), game.player.to_global(empty_cell))
	expect(hit.is_empty(), "외곽 박스 안 빈 공간에 코어 피해 없음")
	hit = game.player.projectile_hit(game.player.to_global(Vector2(-1000, 0)), game.player.to_global(Vector2(1000, 0)))
	expect(not hit.is_empty() and hit.part.kind == "battery", "고속 탄환 궤적의 첫 실제 파트 명중")
	game.held_part = game.player.model.make_part("beam3", Vector2i.ZERO)
	game.update_module_inspector(Vector2(10000, 10000))
	expect(game.hud.module_title.contains("배치 중") and game.hud.module_title.contains("[beam3]"), "배치 중 부품 이름·스펙 유지")
	game.end_left_action(game.player.global_position)
	expect(game.held_part != null, "잘못된 배치에 파트 보존")
	var candidates: Array = game.player.model.attachment_candidates(game.held_part)
	game.end_left_action(game.player.to_global(Vector2(candidates[0]) * Balance.CELL))
	expect(game.held_part == null, "다칸 파트 유효 배치와 렌더 동기화")
	game.held_part = game.player.model.make_part("ammo_bay", Vector2i.ZERO)
	var ammo_sum: int = game.held_part.ammo
	for index in 2:
		var extra: PartData = game.player.model.make_part("ammo_bay", Vector2i.ZERO)
		ammo_sum += extra.ammo
		var merge_point: Vector2 = game.player.global_position + Vector2(250, 0)
		game.spawn_salvage_data(extra, merge_point)
		game.end_left_action(merge_point)
	expect(game.held_part != null and game.held_part.ammo == ammo_sum, "탄약고 3개 연속 병합 후 계속 들기")
	game.cancel_held_part()
	expect(game.held_part == null, "안전한 회수 취소")
	var missile := Projectile.new()
	game.world_layer.add_child(missile)
	missile.setup({"position":Vector2(-500, 0), "velocity":Vector2(250, 0), "color":Color.WHITE, "guided":true, "target":Vector2.ZERO, "kind":"mini_missile"})
	missile.life = 10.0
	missile.advance(1.0)
	expect(is_equal_approx(missile.velocity.length(), 250.0), "유도 어뢰 2초 이전 속력 유지")
	missile.advance(1.1)
	expect(missile.velocity.length() > 250.0, "유도 어뢰 2초 이후 급가속")
	missile.queue_free()
	for step in 6:
		clear_dialogue(game)
		game.player.global_position = game.current_waypoint().position
		if step % 2 == 0:
			game.use_station()
		else:
			game.update_route()
			expect(is_instance_valid(game.active_boss), "보스 관문 %d 스폰" % step)
			var boss_count: int = game.enemies.size()
			game.update_route()
			expect(game.enemies.size() == boss_count, "보스 중복 스폰 방지")
			game.destroy_enemy(game.active_boss)
		expect(game.route_step == step + 1, "항로 관문 %d 완료" % (step + 1))
	expect(game.player.weapon_damage_bonus == 2.0 and game.player.cooling_bonus == 12.0, "정거장 업그레이드 실제 무기·냉각 반영")
	expect(not game.campaign_complete and is_instance_valid(game.victory_ship), "최종 보스 붕괴 연출 완료 전 정지하지 않음")
	game.finish_ship_destruction(game.victory_ship)
	expect(game.campaign_complete and game.dialogue.is_showing(), "최종 보스 붕괴 이후 완료 화면")
	game.queue_free()
	await process_frame
	print("[PASS] core-gameplay" if failures.is_empty() else "[FAIL] core-gameplay: " + ", ".join(failures))
	quit(0 if failures.is_empty() else 1)

func clear_dialogue(game) -> void:
	game.dialogue.current.clear()
	game.dialogue.dialogue_queue.clear()
	game.sync_pause_state()
