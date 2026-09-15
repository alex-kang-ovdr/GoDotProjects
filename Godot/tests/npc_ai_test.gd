extends SceneTree

const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const NarrativeData = preload("res://scripts/narrative_data.gd")
const BalanceData = preload("res://scripts/balance.gd")

var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func _init() -> void:
	expect(is_equal_approx(float(BalanceData.NPC_AI.state_tick_seconds), 0.066), "NPC 상태 머신 66ms 틱")
	var roamer = EnemyShipScript.new()
	roamer.setup(1, "", "roamer")
	expect(roamer.ai_state == roamer.STATE_ROAMING and roamer.contact_type.is_empty(), "기본 NPC는 로밍 상태")
	roamer.notify_attacked_by_player()
	expect(roamer.is_attacking_player(), "플레이어 피격 뒤 공격 상태 전환")
	var aggressive = EnemyShipScript.new()
	aggressive.setup(2, "", "aggressive")
	expect(aggressive.radar_range > 0.0 and aggressive.ai_state == aggressive.STATE_ROAMING, "선제 공격 NPC는 레이더 진입 전 로밍")
	var quest_npc = EnemyShipScript.new()
	quest_npc.setup(1, "", "contact_quest")
	expect(quest_npc.contact_type == "quest", "퀘스트 대화 NPC 프로필")
	quest_npc.ai_state = quest_npc.STATE_DIALOGUE_REQUEST
	quest_npc.accept_contact()
	expect(quest_npc.ai_state == quest_npc.STATE_QUEST, "퀘스트 수락 뒤 비적대 로밍")
	var warning_npc = EnemyShipScript.new()
	warning_npc.setup(1, "", "contact_warning")
	warning_npc.ai_state = warning_npc.STATE_DIALOGUE_REQUEST
	warning_npc.accept_contact()
	expect(warning_npc.ai_state == warning_npc.STATE_EXCLUSION, "경고 대화 뒤 이탈 유예 상태")
	var contact_entry := NarrativeData.npc_contact("PATROL-7", 42, "quest")
	expect(contact_entry.get("choices", []).size() == 2 and str(contact_entry.choices[0].action) == "accept_npc_quest_42", "NPC 퀘스트 선택형 대화 액션")
	roamer.free()
	aggressive.free()
	quest_npc.free()
	warning_npc.free()
	if failures.is_empty():
		print("[PASS] npc-ai")
		quit(0)
	else:
		print("[FAIL] npc-ai: ", ", ".join(failures))
		quit(1)
