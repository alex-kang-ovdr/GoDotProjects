class_name NetPlayerState
extends Node
## Unreal PlayerState 대응: 플레이어별 공개 상태. 모든 peer에 복제된다.
## slot/user_id/peer_id는 스폰 데이터로 한 번 전달되고, score·acked_input_seq는 Sync로 계속 복제된다.

var slot: int = -1
var user_id: String = ""
var peer_id: int = 0
var score: int = 0
## AuthoritySnapshot.acked_input_seq 대응: 서버가 마지막으로 적용한 입력 순번.
var acked_input_seq: int = 0
