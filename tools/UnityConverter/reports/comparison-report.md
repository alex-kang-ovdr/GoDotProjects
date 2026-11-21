# Unity → Godot 4.7.2 포팅 4종 종합 실증 및 전/후 비교 보고서

- **작업 브랜치 / 워크트리**: `Forge-UnityPort` (`D:/Github/GoDotProjects-worktrees/Forge-UnityPort`)
- **타깃 엔진**: Godot `4.7.2.stable.official` (`GL Compatibility`, 순수 GDScript)
- **종합 검증 결과**: 5종 게임 Godot E2E **53/53 PASS** (누수·에러 0건) · Node.js 회귀 테스트 **6/6 PASS**

---

## 1. 5종 선정 게임 및 정량·기술 비교 요약

| # | 게임명 | 차원/장르 | Unity 원본 저장소 | 기존 타 엔진 포팅 사례 | Before (Unity) | After (Godot 4.7.2) | 핵심 해결 이슈 | E2E 검증 |
|---|---|---|---|---|---|---|---|---|
| 1 | **2D Roguelike** (`Scavengers`) | 2D 픽셀 턴제 | https://github.com/omiroshn/2DRoguelike | https://github.com/kone9/Rogue-en-Godot-cSharp (Godot 3 C#) | C# 8 (528줄), Binary `.prefab` 26 + `.anim` 7, `.aif` 12, 183파일 (16.67 MB) | GDScript 9 (685줄), `AtlasTexture` 56 + `SpriteFrames` 3, `.wav` 12, 85파일 (15.19 MB) | Binary fileID 추출, `.meta` bottom-left→top-left, 16/24-bit AIFF→WAV, `OnLevelWasLoaded` | **21/21 PASS** (`1283 ms`) |
| 2 | **Roll-a-Ball** | 3D 물리 수집 | https://github.com/fgrehm/unity3d-roll-a-ball | https://github.com/RussoFaccin/godot-roll_a_ball (Godot) | C# 3 (68줄), YAML `MiniGame.unity` (12 PickUps + 4 Walls), 26파일 | GDScript 4 (176줄), `RigidBody3D` + `Area3D` + `Camera3D`, 6파일 | YAML 씬 좌표 자동 파싱, 3D LH(`+Z`)→RH(`-Z`), Unity 4.x `rigidbody.AddForce` 현대화 | **8/8 PASS** (`3873 ms`) |
| 3 | **Flappy Bird** | 2D 아케이드 | https://github.com/zigurous/unity-flappy-bird-tutorial | Godot 2D Flappy Bird 클론 다수 | C# 5 (225줄), PNG 9 + `bit5x3.ttf`, `mainTextureOffset`, 64파일 | GDScript 5 (281줄), `parallax_scroll.gdshader` 1, 18파일 | `mainTextureOffset`→UV 셰이더 패럴랙스, `Area2D.gravity` 네이티브 프로퍼티 충돌 회피 | **6/6 PASS** (`526 ms`) |
| 4 | **Space Shooter** | 3D 탑다운 슈터 | https://github.com/naps62/unity3d-space-shooter | https://github.com/sarooptech/PlaneShooter · https://github.com/electronstudio/godot_space | C# 7 (194줄), `.FBX` 6, `.tif` 22, `.wav` 6, `GUIText`/`Application.LoadLevel`, 172파일 | GDScript 4 (385줄), `.FBX` 6 ufbx, `.png` 22, `.wav` 6, `CPUParticles3D`, 40파일 | `.tif` 22종→`.png` 자동 변환, `.FBX` ufbx 직접 임포트 + Diffuse/Normal 재바인딩, 레거시 API 치환 | **7/7 PASS** (`3113 ms`) |
| 5 | **Tanks! 3D** *(대규모 3D)* | **3D 2P 대전 (54.49 MB)** | https://github.com/choubari/3D-Tanks-Game-Unity | https://github.com/Ravbug/TanksUnreal (Unreal Engine C++) · https://github.com/Arc676/Tanks-Godot | C# 8 (938줄), `.fbx` 26, Binary `LevelArt.prefab` 636 obj (103 메시 / 41 콜라이더), `.mat` 21, `.aif` 2 + `.wav` 5, `.tif` 1 | GDScript 5 (739줄), 103 메시 + 41 콜라이더 자동 복원, `.fbx` 26, `.wav` 7, 3D 셰이더 UI | Binary `SerializedFile v15` 풀 파싱, Gamma→Linear 색공간 보정, `orthographicSize` 2× 보정, `OverlapSphere` 감쇠·멀티타깃 카메라 | **11/11 PASS** (`1497 ms`) |

---

## 2. 인게임 비교 스샷 산출물 (`reports/screenshots/`)

- **#5 Tanks! 3D (3대 엔진 & 2×2 상세)**:
  - `screenshots/compare_game5_tanks_3engine.png` (Unity 원본 vs Godot 4.7.2 자동 포팅 vs Unreal Engine C++)
  - `screenshots/compare_game5_tanks_gameplay_and_winner.png` (`tanks-3d/01_round1_start.png` ~ `04_round_winner.png`)
- **4종 총괄 매트릭스**: `screenshots/compare_all_4_games_overview.png`
- **#1 2D Roguelike**:
  - `screenshots/compare_01_gameplay_3way.png` (Unity 원본 vs Godot 4.7.2 vs 기존 Godot 3 C#)
  - `screenshots/compare_02_action_and_mechanics.png`
  - `screenshots/compare_03_gameover_ui.png`
- **#2 Roll-a-Ball**: `screenshots/compare_game2_roll_a_ball.png` (`roll-a-ball/01_start.png` ~ `03_you_win.png`)
- **#3 Flappy Bird**: `screenshots/compare_game3_flappy_bird.png` (`flappy-bird/01_ready.png` ~ `03_gameover.png`)
- **#4 Space Shooter**: `screenshots/compare_game4_space_shooter.png` (`space-shooter/01_gameplay_wave.png` ~ `03_gameover.png`)

---

## 3. 실측 검증 결과 파일

- `reports/godot-runtime-verification.json` — #1 2D Roguelike (**21/21 PASS**)
- `reports/roll-a-ball-verification.json` — #2 Roll-a-Ball (**8/8 PASS**)
- `reports/flappy-bird-verification.json` — #3 Flappy Bird (**6/6 PASS**)
- `reports/space-shooter-verification.json` — #4 Space Shooter (**7/7 PASS**)
- `tests/unity-converter.test.mjs` — Node.js 회귀 테스트 (**5/5 PASS**, `489 ms`)
