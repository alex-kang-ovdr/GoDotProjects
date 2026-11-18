# Tappy Chicken

A self-contained Godot 4.7 starter project for a one-button arcade game. Open this folder with Godot or run `project.godot` directly. The editor scene shows the bundled chicken and ground SVGs; the pipe SVG is included as a scene resource and used for gameplay pipes.

## Controls

- Space, Up, W, left click, or tap: flap; the first flap starts a round.
- P or Escape: pause and resume.
- R: restart.
- After a crash, flap/click/tap starts a fresh round.

## Provenance

`Scripts/Game.gd` is a standalone copy of `Projects/TappyChicken/Scripts/Game.gd` and retains the original rules API (`reset`, `input`, `update`, `snapshot`). The three SVGs are copies of the original bundled assets in `Projects/TappyChicken/Assets/`. Everything needed to run the template is included here; it makes no network requests.
