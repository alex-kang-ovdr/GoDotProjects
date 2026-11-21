class_name NarrativeData
extends RefCounted

# 내러티브/퀘스트 데이터 SSOT. 밸런스 수치나 시각 효과 수치와 분리해 모든 빌드가 공유한다.
const TUTORIAL_MOVE_SPEED := 12.0
const STATION_EVENT_RANGE := 620.0

const ENTRIES := {
	"tutorial_intro": {
		"id": "tutorial_intro",
		"speaker": "CONTROL TOWER",
		"icon": "CTRL",
		"title": "잔해 항로 연결",
		"body": "항로에는 관성이 있습니다. 먼저 실제 추진으로 기동한 뒤, 부유 부품을 회수해 빈 연결 소켓에 장착하십시오.",
		"choices": [
			{"label": "비행 절차 시작", "action": "begin_tutorial"},
			{"label": "안내 건너뛰기", "action": "skip_tutorial"}
		]
	},
	"tutorial_move": {
		"id": "tutorial_move",
		"speaker": "CONTROL TOWER",
		"icon": "MOVE",
		"title": "1 / 3 · 실제 기동",
		"body": "W로 전진 추력을 만드십시오. 함선은 즉시 멈추지 않으며, 감쇠와 RCS가 속도를 줄입니다.",
		"choices": []
	},
	"tutorial_salvage": {
		"id": "tutorial_salvage",
		"speaker": "SALVAGE LINK",
		"icon": "PICK",
		"title": "2 / 3 · 중립 부품 회수",
		"body": "표시된 중립 부품을 좌클릭해 운반하십시오. 커서에 붙은 부품은 유효한 연결 소켓 위에서 녹색으로 표시됩니다.",
		"choices": []
	},
	"tutorial_place": {
		"id": "tutorial_place",
		"speaker": "SALVAGE LINK",
		"icon": "DOCK",
		"title": "3 / 3 · 연결 소켓 장착",
		"body": "빈 소켓 위에서 좌클릭을 놓아 부품을 장착하십시오. 연결된 부품만 CONTROL TOWER의 유효 함선으로 계산됩니다.",
		"choices": []
	},
	"tutorial_complete": {
		"id": "tutorial_complete",
		"speaker": "CONTROL TOWER",
		"icon": "OK",
		"title": "비행 절차 완료",
		"body": "회수 부품은 질량과 무게중심을 바꿉니다. 전진 시 자동 보정이 작동하지만, RCS와 후진 추진으로 자세를 안정화할 수 있습니다.",
		"choices": []
	},
	"first_hostile": {
		"id": "first_hostile",
		"speaker": "THREAT SENSOR",
		"icon": "WARN",
		"title": "적대 신호 포착",
		"body": "근거리 적대 함선이 탐지되었습니다. SPACE는 주무기, 우클릭 짧은 클릭은 표적 미사일입니다. 대화 중에는 물리와 전투가 일시정지됩니다. ENTER로 계속하십시오.",
		"choices": []
	},
	"first_victory": {
		"id": "first_victory",
		"speaker": "SALVAGE LINK",
		"icon": "LOOT",
		"title": "전투 잔해 확보",
		"body": "적 함선에서 분리된 파트는 중립 회수 부품이 됩니다. 필요한 부품을 골라 함선 구조에 연결하십시오.",
		"choices": []
	}
}

static func entry(id: String) -> Dictionary:
	return ENTRIES.get(id, {}).duplicate(true)

static func station_approach(station: Dictionary) -> Dictionary:
	return {
		"id": "station_approach_%s" % station.id,
		"speaker": str(station.name).to_upper(),
		"icon": "STN",
		"title": "%s 관제 호출" % station.name,
		"body": "%s. 220px 안에서 E를 누르면 %s와 전면 수리를 받을 수 있습니다." % [station.description, station.upgrade],
		"choices": []
	}

static func station_serviced(station: Dictionary, first_visit: bool) -> Dictionary:
	return {
		"id": "station_serviced_%s_%s" % [station.id, "first" if first_visit else "repair"],
		"speaker": str(station.name).to_upper(),
		"icon": "UP",
		"title": "정거장 작업 완료",
		"body": "%s" % ("%s 업그레이드와 전면 수리가 완료되었습니다." % station.upgrade if first_visit else "재방문 수리가 완료되었습니다. 다음 항로로 이동하십시오."),
		"choices": []
	}

static func boss_encounter(boss_name: String, final_boss: bool = false) -> Dictionary:
	return {
		"id": "boss_%s" % boss_name.to_snake_case(),
		"speaker": "THREAT SENSOR",
		"icon": "BOSS",
		"title": "%s %s" % ["최종 관문 활성화" if final_boss else "중간 보스 조우", boss_name],
		"body": "고위험 신호가 항로를 봉쇄했습니다. 대화는 비차단이며, 우선 연결 구조와 방어막 레이어를 확인한 뒤 교전하십시오.",
		"choices": []
	}

static func npc_contact(npc_name: String, npc_id: int, contact_type: String) -> Dictionary:
	if contact_type == "quest":
		return {
			"id": "npc_quest_%d" % npc_id,
			"speaker": npc_name,
			"icon": "QUEST",
			"title": "회수 의뢰",
			"body": "근처 표류 부품의 회수 신호를 확보했습니다. 의뢰를 수락하면 표식 부품을 장착해 전달 기록을 완성하십시오.",
			"choices": [
				{"label": "의뢰 수락", "action": "accept_npc_quest_%d" % npc_id},
				{"label": "거절", "action": "decline_npc_quest_%d" % npc_id}
			]
		}
	return {
		"id": "npc_warning_%d" % npc_id,
		"speaker": npc_name,
		"icon": "ZONE",
		"title": "사격 통제 구역",
		"body": "이 구역은 순찰 중입니다. 무기 사거리 밖으로 물러나십시오. 5초 뒤에도 남아 있으면 적대 행위로 간주합니다.",
		"choices": [{"label": "명령 수신", "action": "acknowledge_npc_warning_%d" % npc_id}]
	}

static func npc_quest_complete(npc_name: String) -> Dictionary:
	return {
		"id": "npc_quest_complete_%s" % npc_name.to_snake_case(),
		"speaker": npc_name,
		"icon": "OK",
		"title": "회수 의뢰 완료",
		"body": "표식 부품의 전달 기록이 확인되었습니다. 항로 신뢰도가 갱신되었습니다.",
		"choices": []
	}
