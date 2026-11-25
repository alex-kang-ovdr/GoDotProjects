# PlayForge Cloud — Consolidated v17

> **참고 자료 (2026-11-25)**: Godot 채택 이전의 자체 엔진(C++/Lua) 전제 설계다. Lua는 지원하지 않으며, 현재 정본은 [docs/godot-refactoring/SSOT.md](../../../../docs/godot-refactoring/SSOT.md)를 따른다.

## Quick start
Open `01_Editor/PlayForge_Editor_v16/index.html` locally. This is the **existing v16 JavaScript/Canvas prototype**, not a native renderer. Example project in `04_Examples/TappyChicken`.

## Package map
- `01_Editor`: latest verified-available browser prototype (v16)
- `02_EngineSpecs`: consolidated technical designs for settings, rendering, cameras, sorting, reflection and networking
- `03_ConfigSamples`: sample INI configuration (illustrative; not loaded by v16 editor)
- `04_Examples`: Tappy Chicken project, separate from platform core
- `05_History`: original prior-version ZIP archives, retained unchanged
- `06_TestPlans`: manual prototype checks and native-engine implementation acceptance criteria

## Status and caveats
Designs are **specifications**, not implemented native engine features. DX12, Vulkan, PBR/Toon GPU shaders, debug view GPU passes, camera projection and render sorting remain to be implemented in C++ RHI. No real Lua runtime. No automatic browser testing performed in this packaging pass.
