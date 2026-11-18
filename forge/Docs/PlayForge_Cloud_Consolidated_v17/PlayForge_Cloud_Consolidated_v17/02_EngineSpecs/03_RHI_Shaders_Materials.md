# RHI / Material — DESIGN

P0: DX12 Windows, Vulkan Android (Windows optional); Metal iOS required before iOS shipping. Dedicated servers use Null. Backend-neutral resource handles, queues, descriptors, fences, PSO cache, Render Graph, GPU timestamps, texture mip streaming from local cooked packages. No runtime CDN or actor asset streaming.

Shading models: Unlit, PBR, Toon. PBR quality Mobile/Desktop is a shader quality profile, NOT separate material semantics. Toon has shadow ramp, shadow steps, rim, outline; outline may use inverted hull initially. PBR uses metallic/roughness, GGX, normal, ORM, IBL; advanced clearcoat and subsurface later.

Material assets store shading model, parameters, textures and stable IDs. Compile HLSL to DXIL/SPIR-V using DXC; validate permutation/PSO availability per device. ASTC Android, BCn Windows where supported. Parameter edits should not force texture recook; shader model changes may require PSO rebuild.
