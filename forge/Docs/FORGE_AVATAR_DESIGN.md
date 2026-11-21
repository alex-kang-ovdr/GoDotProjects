# Forge-Avatar 설계서 (UEFN 스타일 불변 아바타 · 상점/락커 · 기본 로코모션/래그돌)

- **상태**: Phase 1 (M1) 확정 · 구현 진행 (2026-11-21)
- **작업 브랜치 / 워크트리**: `Forge-Avatar` (`D:\Github\GoDotProjects-worktrees\Forge-Avatar`, 기준 `PlayForge-Main` `c2888bf`)
- **핵심 요구사항**:
  1. UEFN처럼 사용자가 PlayHub에서 본인 아바타의 **스킨(Skin)·장착물(Attachment)·이모지(Emote)** 를 `PlayCoin`으로 구매하고 락커에서 장착한다.
  2. **TPS · FPS · TopDown 3종 로코모션**과 **래그돌(Ragdoll) 물리**가 플랫폼 기본 런타임에 내장된다.
  3. **포지(PlayForge)에서 아바타 외형·코스메틱·내부 로코모션/래그돌 코드를 직접 수정할 수 없다**(3중 봉인).
  4. 외부 **CC0 1.0 GLB 휴머노이드 모델·애니메이션·장착물 에셋** 기반으로 실제 `Skeleton3D` / `AnimationPlayer` / `PhysicalBoneSimulator3D` / `BoneAttachment3D` 위에서 동작한다.

---

## 1. 아키텍처 개요 (3-Plane 분리)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. PlayHub Plane (단일 신원 · 상점 · 락커 · PlayCoin 원장 · 로드아웃 API) │
│   - /?view=avatar  (3D GLB 프리뷰 · 상점 구매 · 락커 장착 · 이모지 휠)  │
│   - /api/avatar/*  (catalog, wallet, purchase, inventory, loadout, glb) │
│   - SQLite (avatar_wallets, avatar_ledger, avatar_inventory, loadouts)  │
│   - PlayCoinWalletAdapter (Hub-Billing 3-bucket 원장 호환 어댑터)        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ MessageChannel (`avatar_loadout`)
                                │ & HTTPS/Loopback signed loadout snapshot
┌───────────────────────────────▼─────────────────────────────────────────┐
│ 2. PlayForge Seal Plane (쓰기 차단 · 서버 정규본 강제 주입 · 무결성)     │
│   - platform-store.cjs / platform-project.cjs: addons/playforge_avatar  │
│     경로 쓰기/삭제/업로드 전면 거부 (HTTP 400 Read-Only)                 │
│   - server.cjs + editor-bridge.js: 웹 에디터 로드 시 정규본 강제 마운트  │
│   - build-queue.cjs: 빌드/웹 익스포트 시 사용자 copy 제거 후 정규본 주입 │
│   - avatar-seal.cjs: SHA-256 매니페스트 검증 및 빌드 번들러              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Sealed Runtime (`addons/playforge_avatar`)
┌───────────────────────────────▼─────────────────────────────────────────┐
│ 3. Godot 4.7.2 Avatar Runtime Plane (불변 런타임 · 크리에이터 제한 API) │
│   - PlayForgeAvatarRig       : 외부 GLB 로드, Rig Profile 매핑, 소켓,    │
│                                이모지 애니메이션 + 3D 플로팅 이모지 배지  │
│   - PlayForgeAvatarController: TPS / FPS / TopDown 3종 로코모션 & 카메라  │
│   - PlayForgeAvatarRagdoll   : PhysicalBoneSimulator3D 래그돌 & 기상 복구 │
│   - PlayForgeAvatarBridge    : PlayHubBridge/HTTP 로드아웃 수신 & 검증   │
│   - PlayForgeAvatarSpawn     : 크리에이터 공개 노드 (설정/시그널만 노출) │
│   - plugin.gd (EditorGuard)  : 에디터 내 수정 감시·경고·자동 복원        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 외부 GLB 에셋 구성 (100% CC0 1.0 Public Domain)

모든 3D 아바타 스킨과 장착물은 외부 glTF 2.0 바이너리(`.glb`)로 구성되며, `forge/Godot/addons/playforge_avatar/assets/`에 정규본으로 보관하고 SHA-256 해시를 `catalog.json`에 고정한다.

### 2.1 스킨 (Rigged Animated Humanoid GLB — 5종)

| ID | 이름 | 가격 (`PlayCoin`) | GLB 파일 | Rig Profile | 본 / 애니메이션 | 라이선스 |
|---|---|---:|---|---|---|---|
| `skin_knight` | 기사 (Knight) | 0 (기본 지급) | `skins/Knight.glb` | `kaykit_v1` | 41본 / 76애니 | CC0 1.0 (KayKit) |
| `skin_robot` | 익스프레시브 봇 | 0 (기본 지급) | `skins/RobotExpressive.glb` | `robot_expressive_v1` | 43본 / 14애니 | CC0 1.0 (Quaternius) |
| `skin_mage` | 아케인 메이지 | 300 | `skins/Mage.glb` | `kaykit_v1` | 41본 / 76애니 | CC0 1.0 (KayKit) |
| `skin_rogue` | 섀도우 로그 | 350 | `skins/Rogue_Hooded.glb` | `kaykit_v1` | 41본 / 76애니 | CC0 1.0 (KayKit) |
| `skin_barbarian` | 노르딕 바바리안 | 400 | `skins/Barbarian.glb` | `kaykit_v1` | 41본 / 76애니 | CC0 1.0 (KayKit) |

### 2.2 장착물 (Attachment GLB — 4개 소켓, 15종)

- **`head`** (`head` / `Head` 본 소켓): `acc_crown_gold`(황금 왕관), `acc_visor_cyber`(사이버 바이저), `acc_halo_star`(스타 헤일로)
- **`back`** (`chest` / `Torso` 후면 소켓): `acc_quiver`(모험가 화살통), `acc_shield_badge`(기사 문장 방패), `acc_shield_round`(원형 룬 방패)
- **`hand_r`** (`handslot.r` / `Palm2.R` 소켓): `acc_sword_1h`(강철 롱소드), `acc_staff`(아케인 지팡이), `acc_axe_1h`(전투 도끼), `acc_wand`(별빛 완드), `acc_mug`(축배 머그)
- **`hand_l`** (`handslot.l` / `Palm2.L` 소켓): `acc_spellbook`(펼친 마도서), `acc_dagger`(그림자 단검), `acc_shield_square`(성벽 방패), `acc_smokebomb`(연막탄)

### 2.3 이모지 (Emote = 스켈레탈 애니메이션 + 3D 머리 위 이모지 배지 — 8종)

- **기본 지급 (2종)**: `emote_cheer` (🎉 환호), `emote_wave` (👋 인사)
- **상점 구매 (6종)**: `emote_dance` (💃 댄스), `emote_thumbs_up` (👍 최고), `emote_sit` (🪑 휴식), `emote_spell` (✨ 마법 세리머니), `emote_spin` (🌪️ 회오리 스핀), `emote_punch` (💥 파워 펀치)
- 각 이모지는 `kaykit_v1`과 `robot_expressive_v1` 각각의 실제 내장 애니메이션 클립명으로 자동 매핑되며, 재생 시 3D 아바타 머리 위에 빌보드 이모지 아이콘이 함께 표시된다.

---

## 3. 내장 로코모션 & 래그돌 사양

### 3.1 3종 기본 로코모션 (`PlayForgeAvatarController`)

| 모드 | 카메라 구조 | 이동 기준 | 캐릭터 회전 | 특화 동작 |
|---|---|---|---|---|
| **TPS** | `SpringArm3D` 3인칭 숄더/오빗 (충돌 회피 + 마우스 궤도 회전 + 줌) | 카메라 수평 전방/우측 기준 | 이동 방향으로 부드러운 yaw 보간 (`turn_speed`) | 달리기(`Shift`), 웅크리기(`C`/`Ctrl`), 점프(`Space`), 공중/착지 상태 전이 |
| **FPS** | 머리 높이 1인칭 `Camera3D` (피치 클램프 -80°~+80°) | 카메라 전방/스트레이프 | 캐릭터 yaw = 카메라 yaw 즉시 동기화 | 로컬 1인칭 시야에서 `head` 소켓 장착물 및 머리 메쉬 자동 숨김(그림자 유지) |
| **TopDown** | 고정 피치(-58°) 추적 3D 오빗/탑다운 카메라 + 휠 줌 | 월드/카메라 평면 WASD | 이동 방향 또는 마우스 레이캐스트 지점 조준 | 8방향 이동, 점프, 웅크리기, 이모지 즉시 재생 |

### 3.2 내장 래그돌 (`PlayForgeAvatarRagdoll`)

- GLB 로드 완료 시 `Skeleton3D`의 휴머노이드 핵심 본 체인(`hips`, `spine`, `chest`, `head`, `upperarm.l/r`, `lowerarm.l/r`, `upperleg.l/r`, `lowerleg.l/r`)을 자동 탐색해 Godot 4.7.2 `PhysicalBoneSimulator3D` + `PhysicalBone3D` + `CapsuleShape3D` + `JOINT_TYPE_CONE` 관절 제한을 동적으로 생성한다.
- **`enter_ragdoll(impulse, hit_bone)`**: `CharacterBody3D` 이동·충돌을 일시 정지하고 `AnimationPlayer`를 정지한 뒤 `physical_bones_start_simulation()`을 시작하며 지정 본에 충격량(`apply_central_impulse`)을 전달한다.
- **`recover_from_ragdoll(duration)`**: 래그돌 `hips`의 지면 위치를 기준으로 루트 `CharacterBody3D`를 정합하고 물리 시뮬레이션을 종료한 뒤 기상/대기 애니메이션으로 복구한다.

---

## 4. "포지에서 직접 수정 불가" 3중 봉인 정책 (UEFN 모델)

| 계층 | 적용 지점 | 강제 동작 |
|---|---|---|
| **Layer 1: 저장·동기화 거부** | `forge/Tools/platform-store.cjs` (`reservedPath`), `forge/Tools/platform-project.cjs`, `forge/Godot/addons/playforge_platform/plugin.gd` (`IGNORED_DIRS`) | `addons/playforge_avatar/**` 경로의 생성·수정·삭제·업로드를 HTTP 400 (`The PlayForge platform addon is read-only`)으로 거부하고 에디터 동기화 대상에서 제외 |
| **Layer 2: 서버 정규본 강제 주입 & 무결성** | `forge/Tools/avatar-seal.cjs`, `forge/server.cjs`, `forge/OfficialGodot/editor-bridge.js`, `forge/Tools/build-queue.cjs` | 웹 에디터 로드 및 웹 익스포트 빌드 시 프로젝트 내 `addons/playforge_avatar/**`를 무조건 삭제하고 서버 정규본 + SHA-256 매니페스트로 덮어쓴 뒤 `.pck`에 봉인 포함 |
| **Layer 3: 에디터 가드 & 제한된 공개 API** | `addons/playforge_avatar/plugin.gd` (`@tool`), `avatar_spawn.gd`, `avatar_controller.gd` | 내부 노드·메쉬·스킨·장착물·이모지 변경 API를 아예 제공하지 않음. `resource_saved`/`scene_saved` 감시로 `addons/playforge_avatar/` 파일 수정 시 즉시 경고 후 정규본 체크섬 검증. 크리에이터에게는 **카메라 모드(TPS/FPS/TopDown), 이동/점프 배율(안전 범위 클램프), 래그돌/이모지 허용 여부, 스폰/텔레포트, 이벤트 시그널**만 노출 |

### 크리에이터 허용 공개 API (`PlayForgeAvatarController` / `PlayForgeAvatarSpawn`)

- **허용 설정 (`@export`)**: `camera_mode` (`TPS`/`FPS`/`TOP_DOWN`), `walk_speed_multiplier` (`0.5~2.0`), `sprint_speed_multiplier` (`0.5~2.5`), `jump_height_multiplier` (`0.5~2.0`), `allow_crouch`, `allow_emotes`, `allow_ragdoll`, `allow_camera_toggle_hotkey`, `topdown_distance`, `topdown_pitch_degrees`
- **허용 메서드**: `set_camera_mode(mode)`, `trigger_ragdoll(impulse, bone_name)`, `recover_from_ragdoll()`, `play_emote_slot(slot_index)`, `stop_emote()`, `teleport_to(world_position, yaw_radians)`, `get_public_state()`
- **허용 시그널**: `loadout_applied(summary)`, `camera_mode_changed(mode)`, `locomotion_state_changed(state)`, `emote_started(emote_id)`, `emote_finished(emote_id)`, `ragdoll_entered(hit_bone)`, `ragdoll_recovered()`
- **금지(미제공/차단)**: `set_skin()`, `set_attachment()`, `override_material()`, `replace_skeleton()`, `set_raw_loadout_unverified()` 등 외형·권한 변조 일체 불가.

---

## 5. PlayHub 아바타 상점·락커 및 PlayCoin 원장 호환 설계

### 5.1 데이터 모델 (`hub/server/avatar/schema.mjs`, `restore-data.mjs` `OPTIONAL_TABLES` 등록)

- `avatar_wallets(principal_id PK, paid_balance, bonus_balance, promo_balance, updated_at)` — `Hub-Billing` Track A 3-Bucket(`paid`/`bonus`/`promo`) 구조와 1:1 호환
- `avatar_wallet_ledger(id PK, principal_id, delta_paid, delta_bonus, delta_promo, kind, ref_id, idempotency_key UNIQUE, created_at)` — 복식부기 멱등 거래 원장
- `avatar_inventory(principal_id, item_id, category, acquired_via, price_paid, acquired_at, PRIMARY KEY(principal_id, item_id))`
- `avatar_loadouts(principal_id PK, skin_id, attachments_json, emote_wheel_json, revision, updated_at)`
- `avatar_purchase_idempotency(principal_id, idempotency_key, request_hash, response_json, created_at, PRIMARY KEY(principal_id, idempotency_key))`

### 5.2 PlayHub API (`hub/server/avatar/service.mjs`)

| 메서드 & 경로 | 설명 | 인증/보안 |
|---|---|---|
| `GET /api/avatar/catalog` | 정규 카탈로그(스킨 5 · 장착물 15 · 이모지 8 · SHA-256 · 버전) | 공개 |
| `GET /api/avatar/assets/:kind/:file` | 정규 `.glb` 바이너리 서빙 (`nosniff`, 경로 순회 차단, immutable 캐시) | 공개 |
| `GET /api/avatar/me` | 현재 계정 지갑(`PlayCoin` 3-bucket), 보유 인벤토리, 현재 장착 로드아웃 통합 조회 | 세션 |
| `GET /api/avatar/loadout` | 게임 런타임용 서명된 정규 로드아웃(`skin`, `attachments`, `emotes`, `signature`) 반환 | 세션 |
| `POST /api/avatar/wallet/topup` | 개발/테스트용 `PlayCoin` 충전 (`paid` + 최대 25% `bonus` 규칙 적용, 운영 결제 시 `Hub-Billing` 어댑터로 교체) | 세션 + CSRF + 멱등키 |
| `POST /api/avatar/purchase` | 서버 가격 검증·중복 구매 방지·3-Bucket 차감(`promo`→`bonus`→`paid` 또는 정책순)·인벤토리 지급 원자 트랜잭션 | 세션 + CSRF + 멱등키 |
| `PUT /api/avatar/loadout` | 보유(또는 무료 기본) 아이템만 허용하는 서버 검증 로드아웃 저장 (`skinId`, `attachments`, `emoteWheel`) | 세션 + CSRF |

### 5.3 PlayHub ↔ Godot 게임 런타임 전달

- `hub/web/user/app.js`의 `MessageChannel` 브로커에 `avatar_loadout` 요청 핸들러 추가 → 현재 로그인/게스트 세션의 `GET /api/avatar/loadout` 결과를 샌드박스 iframe으로 안전 전달.
- `forge/Tools/playhub-godot-shell.js`에 `PlayHubBridge.getAvatarLoadout()` 추가 → Godot Web 런타임이 `JavaScriptBridge`로 호출해 실시간 로드아웃을 수신·적용.

---

## 6. 워크트리 소유권 권장 등록안 (`PlayHub-Platform` 통합 시 반영)

`tools/worktree-ownership/owners.json`은 `PlayHub-Platform` 소유이므로 본 브랜치에서는 직접 수정하지 않으며, 통합 시 아래 항목 등록을 권장한다.

```json
"Forge-Avatar": {
  "role": "UEFN 스타일 불변 아바타 런타임(GLB·TPS/FPS/TopDown·래그돌·이모지) 및 PlayHub 아바타 상점·락커",
  "owns": [
    "forge/Godot/addons/playforge_avatar/**",
    "forge/Tools/avatar-seal.cjs",
    "forge/Tests/playforge_avatar/**",
    "forge/Docs/FORGE_AVATAR_DESIGN.md",
    "hub/server/avatar/**",
    "hub/web/user/avatar*",
    "hub/tests/avatar*.mjs"
  ]
}
```

---

## 7. 단계별 로드맵

- **Phase 1 (M1 — 본 구현)**: CC0 GLB 스킨 5종·장착물 15종·이모지 8종 번들, PlayHub 아바타 상점·락커(`/?view=avatar`) + 3D WebGL GLB 프리뷰어 + PlayCoin 호환 원장, `addons/playforge_avatar` 불변 런타임(TPS/FPS/TopDown·래그돌·소켓·이모지·에디터 가드), Forge 3중 봉인(저장 차단·에디터/빌드 강제 주입·무결성 해시), Node + Godot 4.7.2 헤드리스 E2E 테스트.
- **Phase 2 (M2 — 멀티플레이·Hub-Billing 통합)**: `Hub-Billing` 실결제 원장 직접 연결, 멀티플레이 룸 아바타 로드아웃 복제(`AvatarNetSync`), `forge/Templates/avatar-sandbox` 공식 템플릿 등록(`Forge-AgentReplay` 협업), PlayHub Admin 코스메틱 카탈로그 관리 탭.
