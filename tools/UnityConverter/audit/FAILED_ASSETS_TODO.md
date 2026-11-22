# Unity -> Godot 4.7.2 Deterministic Asset Audit & Residual TODO

- **Samples Audited**: 6
- **Total Unity Assets Audited**: 328
- **Ported Full**: 249
- **Ported Partial (Script/Shader/Anim Mapped)**: 79
- **Failed / Unsupported**: 0
- **Usable in Godot**: **100.00%** (Weighted Completeness: **93.98%**)

## 1. Per-Sample Completeness Scorecard

| Sample | Total Assets | Full | Partial | Failed | Usable % | Weighted % |
|---|---:|---:|---:|---:|---:|---:|
| 2d-roguelike | 72 | 47 | 25 | 0 | 100% | 91.32% |
| roll-a-ball | 5 | 2 | 3 | 0 | 100% | 85% |
| flappy-bird | 19 | 14 | 5 | 0 | 100% | 93.42% |
| space-shooter | 74 | 65 | 9 | 0 | 100% | 96.96% |
| tanks-3d | 104 | 76 | 28 | 0 | 100% | 93.27% |
| boss-room | 54 | 45 | 9 | 0 | 100% | 95.83% |

## 2. Failed / Unsupported Assets

None! All audited Unity assets across all samples are usable in Godot 4.7.2 (0 failed).

## 3. Partial / Behaviorally Ported Assets (Sample)

| Sample | Category | Source Path | Deterministic Mapping |
|---|---|---|---|
| 2d-roguelike | Other | `Assets/2D Roguelike Upgrade Guide 5x.pdf` | Auxiliary Unity file (.pdf) |
| 2d-roguelike | Animation | `Assets/Animations/AnimationControllers/Enemy1.controller` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Other | `Assets/Animations/AnimationControllers/Enemy2.overrideController` | Auxiliary Unity file (.overridecontroller) |
| 2d-roguelike | Animation | `Assets/Animations/AnimationControllers/Player.controller` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/Enemy1Attack.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/Enemy1Idle.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/Enemy2Attack.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/Enemy2Idle.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/PlayerChop.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/PlayerHit.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | Animation | `Assets/Animations/Animations/PlayerIdle.anim` | Mapped to Godot AnimationPlayer / SpriteFrames |
| 2d-roguelike | DataAsset | `Assets/Readme.asset` | ScriptableObject parameters mapped to Godot Resource/const config |
| 2d-roguelike | Script | `Assets/Scripts/BoardManager.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/Enemy.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/GameManager.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/Loader.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/MovingObject.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/Player.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/SoundManager.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/Scripts/Wall.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Other | `Assets/TutorialInfo/Layout.wlt` | Auxiliary Unity file (.wlt) |
| 2d-roguelike | Script | `Assets/TutorialInfo/Scripts/Editor/ReadmeEditor.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/TutorialInfo/Scripts/Editor/TutorialInfoEditor.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/TutorialInfo/Scripts/Readme.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| 2d-roguelike | Script | `Assets/TutorialInfo/Scripts/TutorialInfo.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| roll-a-ball | Script | `Assets/Scripts/CameraController.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| roll-a-ball | Script | `Assets/Scripts/PlayerController.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| roll-a-ball | Script | `Assets/Scripts/Rotator.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| flappy-bird | Script | `Assets/Scripts/GameManager.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| flappy-bird | Script | `Assets/Scripts/Parallax.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| flappy-bird | Script | `Assets/Scripts/Pipes.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| flappy-bird | Script | `Assets/Scripts/Player.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| flappy-bird | Script | `Assets/Scripts/Spawner.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/DestroyByBoundary.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/DestroyByContact.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/DestroyByTime.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/GameController.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/Mover.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/PlayerController.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
| space-shooter | Script | `Assets/Scripts/RandomRotator.cs` | C# API audited against unity-core-api.v0.json and ported to typed GDScript 2.0 |
