# Reflection / Prefab / Editor — DESIGN + v16 mock

Native class defaults (CDO) -> project class defaults -> prefab -> variant -> instance explicit overrides. Stable property GUID and component GUID needed; v16 currently uses type-name identity and has limitations for duplicate components. Override is tracked by property path/ID, not display label. Apply/Revert must be transactional, preserve unrelated overrides, support structural changes and detect cycles.

Generic editor exposes reflection-driven Inspector, Scene/Hierarchy, Assets, Lua, PIE, Console, validation, Prefab Diff/Structure Diff, camera and sorting properties. No Tappy Chicken-specific platform controls. Project-defined extensions are optional, isolated and permissioned.
