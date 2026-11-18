# PlayForge Frontend v16 — Generic Component Structure Diff

Standalone HTML prototype based on v15. Open `index.html` in a browser.

## New
- **Structure Diff** tab for Prefab instance component additions and removals.
- Per-component Apply/Revert with Undo/Redo.
- Parent Prefab updates preserve independently added/removed instance components.
- Duplicate component types are prevented in the simple prototype.

## Test
1. Select Empty Sandbox; create Prefab from Cube and instantiate it.
2. Select instance, add `AudioSource` or remove `MeshRenderer` in Inspector.
3. Open Structure Diff and Revert/Apply individual component changes.
4. Change the source Prefab and verify unrelated instance structural overrides remain.

## Limits
- Browser mock, not C++ Reflection or actual Lua VM.
- Component identities are currently unique type names, not stable component GUIDs. Multiple components of the same type and nested structural changes are future work.
- 3D scene uses Canvas projection rather than WebGL.
