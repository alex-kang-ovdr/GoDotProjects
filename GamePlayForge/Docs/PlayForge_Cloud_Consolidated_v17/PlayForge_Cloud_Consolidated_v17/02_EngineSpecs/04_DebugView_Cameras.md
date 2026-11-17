# Debug View Modes / Camera — DESIGN

Viewport-scoped modes: Lit, Unlit, Wireframe, LightingOnly, DetailLighting, BaseColor, WorldNormal, Roughness, Metallic, AO, Emissive, LinearDepth, ShaderComplexity, QuadOverdraw, LightComplexity, LODColoration, TextureMip, Collision, Bounds, NaN/Inf.

Estimated shader complexity is NOT measured GPU time. Mobile wireframe may need barycentric/edge geometry fallback. Debug passes excluded or restricted in shipping builds. `viewmode <name>` affects selected viewport; different Scene/Game viewports can differ.

Camera projection: Perspective (vertical FOV) and Orthographic (vertical world height), Near/Far planes, aspect ratio, optional reverse-Z, scene camera independent of CameraComponent. Top/Front/Right/Isometric views; projection switch without modifying Actor transforms. 2D/3D scene mode and camera projection are orthogonal.
