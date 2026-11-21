# PlayForge 크리에이터 서버 최적화 제작 가이드 (Godot 4.7.2)

- 대상: PlayForge 웹/데스크톱 에디터로 멀티플레이 게임을 제작·배포하는 크리에이터
- 목표: **같은 서버 티어(`Free-Nano` / `Nano` / `Micro`)에 동접을 2~4배 더 수용하고, 허브 포인트 소모를 최대 80%까지 절감**하는 실전 제작 규칙
- 관련 문서: [game-server-cost-optimization-plan.md](game-server-cost-optimization-plan.md)

---

## 1. 배포 모드 선택만으로 비용 80% 줄이기

| 게임 형태 | 추천 배포 모드 | 추천 티어 | 비용 절감 핵심 |
| :--- | :--- | :--- | :--- |
| 싱글플레이 · 점수/랭킹/세이브만 필요 | **`singleplay`** | 서버 없음 (**0 P/hr**) | 멀티플레이 서버를 띄우지 말고 PlayHub 저장 API만 사용 |
| 친구 초대 · 3~15분 단판 매칭 · 턴제 | **`mo`** (방 기반) | `free-nano` → `nano` / `micro` | 플레이어가 없으면 1~2분 내 자동 종료 → 실제 플레이 시간만 과금 |
| 상시 월드 · 하우징 · 길드 | **`mmo`** | `small` 이상 *(유휴 슬립 권장)* | **`alwaysOn` 24시간 상시 유지는 꼭 필요할 때만 켜기** (접속자 없는 새벽 시간대 절전만으로 월 포인트 50~80% 절감) |

---

## 2. 서버 Tick Rate(초당 갱신 횟수) 낮추기 — *CPU · 트래픽 50~75% 즉시 절감*

클라이언트 화면은 60fps로 그려야 하지만, **서버 시뮬레이션까지 60Hz로 돌릴 필요는 거의 없습니다.** 서버는 낮은 주기로 상태를 보내고, 클라이언트가 보간(`lerp`)으로 부드럽게 그립니다.

| 장르 | 권장 서버 물리/네트워크 틱 | 비고 |
| :--- | :---: | :--- |
| 턴제 · 보드 · 카드 · 퀴즈 | **이벤트 기반 (0 Hz 유휴)** ~ 5 Hz | 상태 변경 시에만 패킷 전송 |
| 소셜 · 농장 · MMO 필드 · 코옵 RPG | **10 ~ 15 Hz** | 클라이언트 보간(100ms)으로 60fps 체감 |
| 탑다운 아레나 · 캐주얼 액션 (BrawlLabs류) | **20 ~ 30 Hz** | 현재 BrawlLabs 권위 서버 기준 20 Hz(50ms) |
| 정밀 슈터 · 고속 격투 | **30 ~ 60 Hz** | 꼭 필요한 매치 룸에만 제한 적용 |

```gdscript
# res://scripts/server_boot.gd
func _ready() -> void:
	if OS.has_feature("dedicated_server"):
		Engine.physics_ticks_per_second = 20
		Engine.max_fps = 20  # 유휴 CPU 100% 점유 방지
```

---

## 3. 네트워크 트래픽(Egress) 10배 줄이기 — 5대 핵심 규칙

동접 $N$명이 서로의 상태를 매 틱 브로드캐스트하면 패킷 수가 $N^2$으로 폭발합니다(예: 50명이 60Hz × 200B 전송 시 **초당 30 MB**!). 아래 5가지를 반드시 적용하세요.

1. **관심 영역 필터링 (AOI · Spatial Grid)**
   - 플레이어 시야 반경(예: 40m) 밖의 캐릭터·몬스터 상태는 전송하지 마세요.
   - Godot 4 `MultiplayerSynchronizer`의 `set_visibility_for(peer_id, visible)` 또는 2D/3D 그리드 셀 구독으로 $O(N^2)$ → $O(N \cdot k)$로 축소합니다.
2. **변경된 값만 전송 (Delta & Dead-Zone)**
   - 정지해 있는 유닛은 패킷을 보내지 마세요.
   - 위치 변화 `< 0.02m`, 회전 변화 `< 1°` 이하는 무시하고, `MultiplayerSynchronizer`의 `delta_interval` / `replication_interval`을 `0.05`~`0.1`초(10~20Hz)로 설정하세요.
3. **데이터 양자화 & 바이너리 패킹 (JSON 금지)**
   - 반복되는 위치·상태 패킷에 `JSON.stringify`를 쓰지 마세요 (`{"x":12.3456789,"y":...}`는 60~120바이트).
   - `PackedByteArray` / `StreamPeerBuffer`로 좌표를 `int16`(cm 단위, 2바이트) 또는 반정밀도로 압축하면 패킷 크기가 **60~80% 감소**합니다.
4. **전송 채널 분리 (`unreliable_ordered` vs `reliable`)**
   - 매 틱 덮어쓰이는 위치·회전·속도: **`@rpc("unreliable_ordered")`** (패킷 손실 시 재전송 폭주 방지)
   - 피격 판정 · 아이템 획득 · 상점 · 채팅 · 라운드 종료: **`@rpc("reliable")`**
5. **상태 기반 동기화 (이펙트는 클라이언트에서 재생)**
   - 총알 궤적·파티클·사운드 프레임을 매 틱 보내지 말고, **"발사 시각·시작 위치·방향" 이벤트 1회**만 보내고 시각 효과는 클라이언트가 자체 재생하게 만드세요.

---

## 4. Godot 4.7.2 Headless 서버 RAM · CPU 다이어트 (목표: 방당 150 MB 이하)

서버는 화면을 그리지 않지만, 씬에 들어 있는 비주얼·오디오 노드를 그대로 두면 메모리와 CPU를 계속 소비합니다.

### ① 서버에서 비주얼 · 오디오 · UI 즉시 제거
```gdscript
# 서버에서 렌더링/사운드 전용 노드 제거 헬퍼
static func strip_client_only_nodes(root: Node) -> void:
	if not OS.has_feature("dedicated_server"):
		return
	for child in root.get_children():
		if (child is MeshInstance3D or child is Sprite2D or child is Sprite3D
			or child is GPUParticles3D or child is CPUParticles3D
			or child is AudioStreamPlayer or child is AudioStreamPlayer2D or child is AudioStreamPlayer3D
			or child is Camera2D or child is Camera3D or child is Light3D or child is CanvasLayer):
			child.queue_free()
		else:
			strip_client_only_nodes(child)
```
- **Export 프리셋 분리**: 서버 빌드 시 고해상도 텍스처(`.png`, `.webp`), 음원(`.ogg`, `.wav`, `.mp3`), UI 폰트를 `exclude_filter`로 빼면 **RAM과 콜드스타트 시간이 50~70% 줄어듭니다.**

### ② 물리 · AI 연산 경량화
- **단순 충돌체 사용**: 복잡한 `ConcavePolygonShape3D`(메시 콜라이더) 대신 `BoxShape3D` · `CapsuleShape3D` · `SphereShape3D`만 사용하세요.
- **거리 검사 우선**: 매 프레임 수백 개 `Area3D` 오버랩 검사 대신, 5~10Hz 타이머에서 `distance_squared_to()`로 먼저 걸러내세요.
- **근접 기반 AI 다운샘플링**: 주변 50m 안에 플레이어가 없는 몬스터/NPC는 AI 틱을 **1~2 Hz**로 낮추거나 수면(Idle) 상태로 두세요.

### ③ 메모리 누수 차단 (장기 가동 필수)
- 투사체·드롭 아이템은 매번 `instantiate()`/`queue_free()`하지 말고 **오브젝트 풀(Object Pool)**을 재사용하세요.
- 플레이어 연결 해제(`peer_disconnected`) 시 해당 플레이어 노드, 딕셔너리 참조, 1회성 `Timer`를 **100% 정리**하세요.

---

## 5. 유휴 자동 종료 & 무중단 업데이트(SIGTERM) 대응

PlayForge 호스팅은 접속자가 없는 방을 자동으로 절전시키고, Spot VM 선점이나 무중단 배포 시 `SIGTERM`을 보냅니다. 아래 패턴을 넣으면 **비용 낭비와 데이터 유실을 모두 막을 수 있습니다.**

```gdscript
# res://scripts/server_lifecycle.gd
var _empty_seconds: float = 0.0
const IDLE_SHUTDOWN_SEC: float = 90.0

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		_save_world_and_shutdown()

func _physics_process(delta: float) -> void:
	if not OS.has_feature("dedicated_server"):
		return
	if multiplayer.get_peers().is_empty():
		_empty_seconds += delta
		if _empty_seconds >= IDLE_SHUTDOWN_SEC:
			_save_world_and_shutdown()
	else:
		_empty_seconds = 0.0

func _save_world_and_shutdown() -> void:
	# 1) 진행 중 점수·월드 상태 저장 API 호출
	# 2) 정상 종료 코드 0 반환 → 플랫폼이 비용 차감 즉시 중단
	get_tree().quit(0)
```

---

## 6. 배포 전 크리에이터 자가 진단 체크리스트 (10항목)

PlayForge 배포 센터 제출 전, 로컬 헤드리스 테스트에서 아래 기준을 통과하면 `Nano`/`Micro` 티어에서 최대 동접과 최저 포인트 소모를 달성할 수 있습니다.

| # | 점검 항목 | 권장 합격 기준 |
| :---: | :--- | :--- |
| 1 | 서버 모드 선택 | 싱글/랭킹 전용이면 `singleplay`(0 P/hr), 방 단위면 `mo` 선택 |
| 2 | 서버 `Engine.max_fps` / 물리 틱 제한 | 장르별 **10~30 Hz** 설정 (`60 Hz` 방치 금지) |
| 3 | 빈 방(0명) 유휴 CPU 사용률 | **< 2%** |
| 4 | 빈 방(0명) 자동 종료 구현 | 마지막 유저 퇴장 후 **60~120초 내 `quit(0)`** |
| 5 | `SIGTERM` 종료 시 상태 저장 | 선점/무중단 배포 시 세이브 유실 0건 |
| 6 | 방당 초기 RAM 사용량 | **< 150 MB** (`dedicated_server` 비주얼·오디오 제거 확인) |
| 7 | 1시간 방치·입퇴장 반복 후 RAM 증가량 | **< +10 MB** (누수 없음) |
| 8 | 플레이어 1인당 서버 Egress 대역폭 | **< 10 KB/s** (바이너리 패킹 + AOI + 델타 전송) |
| 9 | 위치/회전 RPC 전송 모드 | `unreliable_ordered` 사용 (`reliable` 남용 금지) |
| 10 | 최대 정원 시 서버 틱 처리 시간 `p99` | **틱 주기의 50% 이하** (예: 20Hz=50ms 기준 `< 25ms`) |
