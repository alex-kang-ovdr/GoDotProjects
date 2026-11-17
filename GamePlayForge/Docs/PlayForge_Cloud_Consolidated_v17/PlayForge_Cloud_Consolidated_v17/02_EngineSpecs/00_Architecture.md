# PlayForge Cloud — Architecture v17

Status: **DESIGN**, except existing v16 browser mock. No native DX12/Vulkan, Lua VM or C++ renderer is claimed.

## Separation
- C++20 platform-independent engine; Lua 5.4 gameplay scripts; TypeScript/JavaScript generic web editor.
- Unity-inspired generic Hierarchy, Scene, Game, Inspector, Prefab/Variant, Console, Project Settings, Material Inspector, Camera and Render Sorting panels.
- Game-specific panels and gameplay settings remain inside projects; the platform renders only reflection/schema-driven fields.
- One authoritative Server World in listen server; host runs directly in that world, remote players replicate.
- Native priorities: Windows, Android/iOS, Windows dedicated server, Linux dedicated server; headless servers have no RHI.
- 2D and 3D share scene and component model; orthographic and perspective cameras are independent of scene dimension.

## Rendering stack
Renderer -> Render Graph -> RHI -> D3D12 (Windows), Vulkan (Android and optional Windows), Metal (required for iOS), Null (server); WebGPU browser preview later.
HLSL source -> DXC DXIL/SPIR-V; Metal/WebGPU require verified shader translation and feature checks.

## Existing prototype limitations
v16 is HTML/JS Canvas-based. It does not execute Lua, use WebGL/DX12/Vulkan, run native shader compilation, or support live multiuser collaboration. v16's Prefab component identity is type-based rather than GUID-based.
