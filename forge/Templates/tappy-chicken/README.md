# Tappy Chicken

A self-contained Godot 4.7 starter project for a one-button arcade game. Open this folder with Godot or run `project.godot` directly. The editor scene shows the bundled chicken and ground SVGs; the pipe SVG is included as a scene resource and used for gameplay pipes.

## Controls

- Space, Up, W, left click, or tap: flap; the first flap starts a round.
- P or Escape: pause and resume.
- R: restart.
- After a crash, flap/click/tap starts a fresh round.

## Provenance

`Scripts/Game.gd` is a standalone copy of `Projects/TappyChicken/Scripts/Game.gd` and retains the original rules API (`reset`, `input`, `update`, `snapshot`). The three SVGs are copies of the original bundled assets in `Projects/TappyChicken/Assets/`. Everything needed to run the template is included here; it makes no network requests.

## Godot 제작 시연

PlayForge 웹에서 Tappy Chicken을 선택하고 **만드는 과정 보기**를 누릅니다. 설치형 Godot 4.7에서는 Forge 폴더에서 다음 명령으로 같은 시연을 담은 새 프로젝트를 준비합니다. 출력 폴더의 상위 폴더가 있어야 하며, 출력 폴더가 이미 있으면 명령은 파일을 변경하기 전에 종료합니다.

```powershell
node Tools/prepare-template-showcase.cjs tappy-chicken D:\Demos\TappyChickenShowcase
```

명령이 출력한 `project.godot`을 Godot에서 엽니다. 하단 **PlayForge Showcase**의 **재생**을 누르거나 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 빈 2D 씬에 원본 하늘, 지면, 닭, 파이프 그룹, HUD가 차례대로 추가됩니다. 닭과 지면 위치, 점수 텍스트가 씬 트리와 2D 편집 화면에 반영됩니다. 마지막에 원본 게임 스크립트가 연결됩니다.

웹과 설치형 에디터는 `showcase.json`에 미리 작성한 12초 타임라인을 재생합니다. 네 역할의 커서 아래에서 각 편집 작업을 설명합니다. 시연은 편집 전용 씬에서 진행되며 실제 게임은 **완성된 템플릿 열기**로 시작할 수 있습니다.

다른 템플릿에도 버전 3 `showcase.json`을 추가할 수 있습니다. `roles`에 역할과 편집 영역(`editorRegion`)을 정의하고, `cues`에서 원본 씬의 노드 경로와 속성 이름으로 편집 순서를 지정합니다. 같은 시각의 명령은 파일 순서대로 반영되므로 자식 노드보다 부모를 앞에 배치합니다. 씬이 갖춰진 뒤 `finish` 단계에서 원래 루트와 게임 스크립트를 적용합니다.
