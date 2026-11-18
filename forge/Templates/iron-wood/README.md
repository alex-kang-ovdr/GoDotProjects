# Iron Wood

Iron Wood is a small, native Godot 4.7.2 construction and physics starter. Open this folder as a Godot project and run `scenes/main.tscn`.

## Build, test, reset

In build mode, use **Add block** or **Remove** (B and Delete also work) to change the wooden cart's frame. **Test cart** starts a fresh physical run. Use W/S to drive, A/D to steer, Q/E to turn the cannon, F to fire, and B to brake. Destroy the nine timber targets or drive across the green finish line. **Return to build** discards the test state; **Reset** also clears added blocks and restores the starter cart. R is a keyboard reset.

The cart is one rigid body with fixed wheel visuals, a controllable cannon, contact-driven cannonballs, and collision-based target blocks. Added blocks affect the cart's collision shape and mass. The test scene includes a hurdle and slalom posts. This is a playable prototype of the build → simulate → reset loop, not a full machine-construction simulator.

## Reference and scope

The starter's shape and interaction loop take cues from the original Scout Siege Cart preset in the project's Ironwood 4.0 reference at `../../References/Besiege/Playable/Current/`. The reference is an independently authored Besiege-inspired project, not Besiege's source. This template is a separate native Godot implementation. It does not claim full IRONWOOD or Besiege parity: there is no snap-grid editor, independent wheel joints, block-by-block constraints or damage, mission campaign, save slots, naval or aircraft systems, or engineering-grade physics.

All included materials are original flat-color text resources; meshes are procedural Godot primitives. No Besiege commercial artwork, models, or audio are included. The template's own code, materials, and documentation are provided for use within the PlayForge project; no third-party asset license is bundled or implied. See the adjacent reference's README and licenses before redistributing any reference files; none are copied here.

## Controls

| Mode | Controls |
| --- | --- |
| Build | Add block / Remove buttons, B / Delete |
| Test | W/S drive, A/D steer, Q/E aim, F fire, B brake |
| Reset | R |

## Godot 3D 제작 시연

PlayForge 웹에서 **Iron Wood → 만드는 과정 보기**를 선택합니다. 설치형 Godot용 시연은 Forge 폴더에서 `node Tools/prepare-template-showcase.cjs iron-wood D:/Demos/IronWoodShowcase`로 생성합니다. 생성한 프로젝트에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다.

빈 3D 씬에 원본 트랙, 수레의 차체와 포탑 블록, 네 바퀴, 장애물, 표적, 카메라와 조명을 순서대로 배치합니다. 목재 재질과 수레 위치, 카메라 각도는 실제 씬 트리와 3D 뷰포트에 반영됩니다. 씬이 갖춰진 뒤 원본 게임 스크립트를 연결합니다.
