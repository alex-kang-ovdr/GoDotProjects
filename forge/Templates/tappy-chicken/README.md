# Tappy Chicken

Godot 4.7 port of the one-button arcade game from Epic Games’ Unreal sample. Open `project.godot` and run the main scene. The title sign, chicken, wooden obstacles, scenery, scoreboard, digits and effects come from the sample.

## Play

Press Space, Enter, Up or W, or click or tap the play button to leave the title screen. The next press, click or tap starts flight. Each press during flight restarts the flap. Fly between the wooden obstacles to score. A collision stops the scrolling scenery and sends the chicken to the ground. The scoreboard shows the round score, saved best and a common egg. Press the play button or a flight key to return to the ready screen.

P or Escape pauses and resumes a flight. R returns to the title. The best score is saved under `user://tappy_chicken_scores.cfg`.

## Source and implementation

The Unreal project starts in `Content/Maps/TappyChickenMap.umap`. Its arcade logic is in `Content/Blueprints/BP_MainGame.uasset`. The Godot port uses its title, ready, flight and results sequence, three-frame wing loop with 0.05-second frames, single-score gate crossing and seven relative parallax rates. `Scripts/Game.gd` samples the vertical movement and rotation keys from `Timeline_FlapUp`. The portrait viewport, obstacle spacing, collision bounds and crash fall are tuned for 480 × 640. The separate UnLua pawn implements a hold-duration jump experiment.

`Scripts/Main.gd` displays the ready scene, handles input and sound, and renders the rule state. The original pixel artwork was converted from the sample’s texture atlases and mesh UV regions. The scoreboard uses ten original digit glyphs. The audio resources contain the original click, four flap variations, score and obstacle and ground impact sounds. [Unreal sample archive](https://epicgames.app.box.com/s/iy2xl8zap9laobqy0xq9hoahr15e7fd6)

## Godot 제작 시연

PlayForge에서 **만드는 과정 보기**를 선택하면 빈 2D 씬 위에 자체 에셋 스토어가 열립니다. 에셋 역할이 비행 프레임 팩을 선택하고 날갯짓 두 장과 충돌 한 장을 `Assets/`로 가져옵니다. 이어 하늘, 배경 레이어, 닭, 장애물, 점수판을 조립하고 스크립트 역할이 게임 코드를 엽니다. 다른 빈 맵에서도 **프로젝트 → 도구 → PlayForge 에셋 스토어**로 같은 팩을 직접 가져올 수 있습니다. 완성된 게임은 **완성된 템플릿 열기**에서 실행할 수 있습니다.

설치형 Godot용 시연 프로젝트는 Forge 폴더에서 다음 명령으로 준비할 수 있습니다. 출력 경로에는 새 폴더 이름을 지정합니다.

```powershell
node Tools/prepare-template-showcase.cjs tappy-chicken D:\Demos\TappyChickenShowcase
```

출력한 프로젝트를 연 뒤 하단 **PlayForge Showcase**의 **재생**을 누릅니다.
