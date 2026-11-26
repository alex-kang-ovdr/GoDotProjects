# 11. 멀티플레이어, 네트워크 복제(Replica), RPC와 틱 루프 아키텍처

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/update.lua`, `scripts/entityscript.lua`, `scripts/entityreplica.lua`, `scripts/networkclientrpc.lua`, `scripts/shardnetworking.lua`, `scripts/networking.lua`, `scripts/gamelogic.lua`

---

## 1. 서버 권위(Server-Authoritative) 모델 (`[코드 확인]`)

DST의 모든 시뮬레이션 진실은 **마스터 시뮬레이션(`TheWorld.ismastersim == true`)**에 있다.
- **전용 서버 바이너리 (`bin64/dontstarve_dedicated_server_nullrenderer_x64.exe`, 6.23 MB)**: 그래픽·포스트프로세스·렌더링 없이(`TheNet:IsDedicated() == true`, `postprocesseffects.lua:3–29` no-op 처리) Lua 시뮬레이션과 네트워크만 구동한다.
- **클라이언트 (`bin64/dontstarve_steam_x64.exe`, 6.85 MB)**: 호스트(Listen Server)일 때는 로컬 서버 프로세스(지상+동굴 최대 2개)를 백그라운드로 띄우고 자신도 클라이언트로 접속한다.

---

## 2. 컴포넌트 복제(`EntityReplica`)와 비공개 데이터(`Classified`) (`[코드 확인]`)

`scripts/entityreplica.lua` (L1–100)에서 확인한 DST 고유의 대역폭 최적화 패턴이다.

### 2.1 복제 허용 19종 컴포넌트 (`REPLICATABLE_COMPONENTS`)
```lua
builder, combat, container, constructionsite, equippable, fishingrod,
follower, health, hunger, inventory, inventoryitem, moisture, named,
oceanfishingrod, rider, sanity, sheltered, stackable, writeable
```
- 서버에서 `AddComponent("health")`가 호출되면 자동으로 `_health` 태그를 붙여 클라이언트에 전파하고, 클라이언트는 `EntityScript:ReplicateEntity()`에서 `components/health_replica.lua`만 생성한다.
- **835개 전체 컴포넌트 중 단 19개만 복제**함으로써 6인 멀티플레이 + 수천 개 월드 엔티티의 네트워크 부하를 극적으로 줄인다.

### 2.2 `NetVar` 타입과 `Classified` 엔티티 분리
- 공개 상태(위치, 애니메이션, 시계, 계절 등)는 `net_bool`, `net_tinybyte`, `net_smallbyte`, `net_byte`, `net_ushortint`, `net_float`, `net_string`, `net_entity`로 변경 시에만(dirty event) 전송한다 (`clock.lua:85–95`, `seasons.lua:67–75`).
- 플레이어 개인의 민감한 HUD 데이터(정확한 체력/허기/정신력, 인벤토리 슬롯, 학습한 레시피, 컨테이너 내부)는 `player_classified` / `container_classified`라는 **별도 비공개 네트워크 엔티티**에 붙여 **소유 클라이언트(또는 열람 중인 클라이언트)에게만** 선별 복제한다(`TryAttachClassifiedToReplicaComponent`).

---

## 3. RPC 시스템: 110종 Client RPC + Shard RPC (`[데이터 확인]`)

`scripts/networkclientrpc.lua` (2,008행)에는 **110개의 RPC 핸들러**가 등록되어 있다.

| RPC 범주 | 대표 RPC 함수 (`networkclientrpc.lua`) |
|---|---|
| **이동·예측·조작** | `LeftClick`, `RightClick`, `ActionButton`, `AttackButton`, `InspectButton`, `DirectWalking`, `DragWalking`, `PredictWalking`, `PredictOverrideLocomote`, `StrafeFacing`, `StartHop`, `SteerBoat`, `StopWalking`, `StopControl`, `SetMovementPredictionEnabled` |
| **인벤토리·장비** | `ReturnActiveItem`, `PutOneOfActiveItemInSlot`, `PutAllOfActiveItemInSlot`, `TakeActiveItemFromHalfOfSlot`, `SwapActiveItemWithSlot`, `EquipActiveItem`, `DropItemFromInvTile`, `MoveInvItemFromAllOfSlot`, `UseItemFromInvTile` |
| **제작·건설** | `MakeRecipeFromMenu`, `MakeRecipeAtPoint`, `BufferBuild`, `CannotBuild`, `OpenGift` |
| **스킬·지식·UI** | `SetSkillActivatedState`, `AddSkillXP`, `LearnRecipe`, `LearnFoodStats`, `LearnPlantStage`, `LearnFertilizerStage`, `TakeOversizedPicture`, `TryToTeachScrapbookData`, `ShowPopup`, `RecievePopupMessage`, `GetChatHistory` |
| **캐릭터·특수** | `CastSpellBookFromInv`, `WobyCommand`, `UnplugModule`, `StopUsingDrone`, `AOECharging`, `DoubleTapAction`, `DoActionOnMap`, `exitgym` |
| **샤드 동기화** | `ShardTransactionSteps`, `PruneShardTransactionSteps`, `SyncWorldSettings`, `ResyncWorldSettings`, `SyncWorldStateTag`, `SyncBossDefeated`, `SyncMermKingExists`, `SyncCharlieDefeated`, `ReskinWorldMigrator` |

---

## 4. 이동 예측(Lag Compensation)과 틱 루프 (`[코드 확인]`)

### 4.1 클라이언트 이동 예측 (`SetMovementPredictionEnabled`)
- DST 클라이언트는 기본적으로 **지연 보상(Lag Compensation / Movement Prediction)**을 켜서 로컬 캐릭터를 즉시 이동시키고 서버에 `PredictWalking`을 보낸다.
- 고난도 보스전(카이팅 프레임 정밀도가 중요한 경우)에서 플레이어가 지연 보상을 끄면(`false`), 클라이언트는 서버 확정 위치만 렌더해 실제 피격 판정과 시각 위치를 100% 일치시킨다.

### 4.2 `WallUpdate` vs `SimUpdate` 이중 틱 루프 (`scripts/update.lua`)
- **`WallUpdate(dt)`** (`update.lua:33–70`): 서버 일시정지(`TheNet:IsServerPaused()`) 여부와 무관하게 실제 벽시계 시간으로 실행.
  1. `HandleRPCQueue()` (네트워크 RPC 큐 처리)
  2. `HandleUserCmdQueue()` (채팅/투표/롤백 명령 처리)
  3. `TheSim:SetActiveAreaCenterpoint(TheFocalPoint...)` (활성 시뮬레이션 중심점 갱신)
  4. `WallUpdatingEnts` 컴포넌트(`OnWallUpdate` — 카메라, UI, 입력 등) 갱신
- **`Update(dt)` (SimUpdate)**: 서버 일시정지 시 중단. 고정 시뮬레이션 프레임(`30 FPS` 기준 `FRAMES = 1/30`, `[코드 확인]` `plant_defs` 등 프레임 상수 참조)으로 `Scheduler`, `StateGraph`, `Brain`, `UpdatingEnts`, 물리·전투·생존 컴포넌트를 갱신한다.

### 4.3 엔티티 슬립(Entity Sleep)과 `LongUpdate` (`[코드 확인]`)
- 플레이어 반경 밖으로 멀어진 엔티티는 `OnEntitySleep`으로 AI/틱 업데이트를 중지해 CPU를 절약한다.
- 플레이어가 다시 접근하거나 시간이 크게 점프(수면·스킵)하면 `OnEntityWake`와 `LongUpdate(dt)`로 경과 시간만큼 부패·성장·재생·타이머를 일괄 정산한다 (`moisture.lua:340`, `perishable.lua`).

---

## 5. 저장, 자동 롤백과 스냅샷 (`[코드 확인]`)

- **일일 자동 저장**: `TUNING.AUTOSAVE_INTERVAL = total_day_time (480초)`마다 `Master`/`Caves` 각 샤드가 스냅샷을 저장한다.
- **롤백(Rollback)**: 서버 관리자 또는 투표(`voteutil.lua`)로 최근 수일치 저장 스냅샷으로 되돌릴 수 있다.
- **컴포넌트 직렬화 규약**: 모든 상태 보유 컴포넌트는 `OnSave()` / `OnLoad(data)` / `OnLoadPostPass(newents, data)`(엔티티 간 GUID 참조 복원) 3단계 계약을 구현한다 (`sanity.lua:258`, `farmplantstress.lua:120`).
