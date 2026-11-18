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
