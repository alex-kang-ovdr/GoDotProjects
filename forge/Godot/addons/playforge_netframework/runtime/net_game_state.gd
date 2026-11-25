class_name NetGameState
extends Node
## Unreal GameState 대응: 모든 peer에 복제되는 매치 공용 상태.
## 서버(GameMode)만 값을 쓴다. 자식 MultiplayerSynchronizer가 서버 → 전체로 복제한다.

const PHASE_WAITING := "waiting"
const PHASE_PLAY := "play"
const PHASE_SETTLE := "settle"
const PHASE_DRAINING := "draining"

var phase: String = PHASE_WAITING
var server_tick: int = 0
var play_tick: int = 0
var world_key: String = ""
var max_players: int = 0
## 플레이어 슬롯을 가진 peer 목록. 서버(peer 1)는 절대 들어가지 않는다.
var player_peers: PackedInt32Array = PackedInt32Array()

var sync: MultiplayerSynchronizer


func _ready() -> void:
	sync = MultiplayerSynchronizer.new()
	sync.name = "Sync"
	sync.root_path = NodePath("..")
	sync.replication_interval = 1.0 / 30.0
	var cfg := SceneReplicationConfig.new()
	for prop in ["phase", "world_key", "max_players", "player_peers"]:
		_add(cfg, ".:" + prop, SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	for prop in ["server_tick", "play_tick"]:
		_add(cfg, ".:" + prop, SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
	sync.replication_config = cfg
	add_child(sync)


static func _add(cfg: SceneReplicationConfig, path: String, mode: int) -> void:
	var np := NodePath(path)
	cfg.add_property(np)
	cfg.property_set_spawn(np, true)
	cfg.property_set_replication_mode(np, mode)
