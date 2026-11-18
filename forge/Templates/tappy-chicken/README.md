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

명령이 출력한 `project.godot`을 Godot에서 엽니다. 하단 **PlayForge Showcase**의 **재생**을 누르거나 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. GUI, 레벨, 스크립트, 에셋 커서가 실제 Godot의 인스펙터, 뷰포트, 씬 트리, 파일시스템 위를 이동합니다.

웹과 설치형 에디터는 `showcase.json`에 미리 작성한 12초 타임라인을 재생합니다. 네 역할의 커서 아래에 점수판 설정, 파이프 배치, 캐릭터 동작을 설명합니다. 기존 씬과 탭, 인스펙터 상태, 프로젝트 파일은 그대로 유지됩니다.

다른 템플릿에도 `showcase.json`을 추가할 수 있습니다. `roles`에서 역할과 편집 영역(`editorRegion`)을, `cues`에서 초 단위로 커서 이동과 설명을 정의합니다. `objects`는 역할별로 타임라인의 작업 결과를 정의합니다. 같은 시점에 여러 역할의 이벤트를 배치할 수 있으며, 역할의 편집 영역이 닫혀 있어도 타임라인은 진행됩니다.
