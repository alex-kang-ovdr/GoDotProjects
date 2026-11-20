# Chaos Obby PoC Fixture (`SBdevz/Chaos-Obby`)

- **출처**: https://github.com/SBdevz/Chaos-Obby (실제 Roblox 공개 게임: https://www.roblox.com/games/121137161104139/Chaos-Obby)
- **라이선스**: MIT (`LICENSE` 포함)
- **원본 그대로 포함한 파일 (Verbatim Upstream MIT)**:
  - `Scripts/ServerScripts/Motion.legacy.luau` — `RunService.Heartbeat`, `CFrame * CFrame.Angles`, `AssemblyAngularVelocity`, `VectorToWorldSpace`
  - `Scripts/ServerScripts/Disapearing.legacy.luau` — `script.Parent`, `Touched`, `Transparency` 페이드, `CanCollide`, `task.wait`, `task.spawn`, `ChildAdded`
  - `Scripts/ServerScripts/Lava Obstacles.legacy.luau` — `Touched`, `Players:GetPlayerFromCharacter`, `Humanoid.Health = 0`
  - `Scripts/ServerScripts/Checkpoints.legacy.luau` — `DataStoreService`, `Players.PlayerAdded`, `Instance.new("StringValue")`, `pcall`, `RespawnLocation`, `SpawnLocation`
  - `Scripts/ServerScripts/Teleport.legacy.luau` — `DataStore`, `GetPivot`, `PivotTo`, `AssemblyLinearVelocity`, `Humanoid:ChangeState`, `SetAttribute`, `DescendantAdded`
  - `Scripts/ServerScripts/Chaos Features.legacy.luau` — `Lighting.FogStart/FogEnd/FogColor`, `Humanoid.WalkSpeed`, `Random.new()`, 함수 키 테이블, `GetAttributeChangedSignal`
  - `Scripts/LocalScripts/Timer.local.luau` — `Players.LocalPlayer`, `TextLabel.Visible/Text`, `string.format`, `GetAttributeChangedSignal`
- **재구성한 파일 (Reconstructed Place Fixture)**:
  - `ChaosObby.rbxlx` (`build-place.mjs`로 생성): 업스트림 저장소에 `.rbxlx` 씬 파일이 포함되지 않았으므로, 위 7개 원본 스크립트가 `WaitForChild` / `script.Parent`로 참조하는 정확한 Roblox Instance 계층(`Rotation/{Right/Right60, Left/Left60, Right/Right480, Left/Left480, CylRight/CylRight30, CylLeft/CylLeft30}`, `Disappearing`, `Lava`, `Checkpoints/{Red 0, Red 1, Red 2}`, `Spawnpoints/LobbySpawn`, `Teleports/Lobby`, `StarterGui/ChaosHUD/TimerLabel`, `Lighting`, `ReplicatedStorage`, `ServerScriptService`)을 공식 `baseplate-413/xml.rbxlx` 스키마(Roblox XML v4)에 맞춰 조합하고 원본 7개 스크립트를 무수정 삽입했다.
