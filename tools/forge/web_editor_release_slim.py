# PlayForge Slim Custom Release Web Editor WASM SCons Profile (WEB EDITOR ONLY)
# Includes custom PlayForge Avatar / CoreHUD engine module (modules/playforge_core)
# while stripping modules unsupported or unused in browser/WebGL2 Web Editor.
# NOTE: Installed/Native desktop builds use tools/desktop/custom.py, which retains
# desktop-needed modules (jolt_physics, enet, fbx, lightmapper_rd, raycast,
# theora, astcenc/etcpak/ktx, etc.) while keeping XR/VR & CameraServer disabled across all targets.
#
# Usage (from godot-engine / Forge-GodotEngine with emsdk 4.0.11+ activated):
#   scons platform=web target=editor profile=<path>/web_editor_release_slim.py -j28

platform = "web"
target = "editor"
arch = "wasm32"
production = "yes"
optimize = "size_extra"
lto = "thin"
debug_symbols = "no"
use_assertions = "no"
deprecated = "yes"
wasm_simd = "yes"
dlink_enabled = "no"
use_closure_compiler = "no"
openxr = "no"

# Keep PlayForge custom Avatar / CoreHUD engine module + FBX (ufbx) + Jolt Physics enabled
module_playforge_core_enabled = "yes"
module_fbx_enabled = "yes"
module_jolt_physics_enabled = "yes"

# Disable modules unused or unsupported in WebGL2 / browser PlayForge Web Editor
module_astcenc_enabled = "no"
module_betsy_enabled = "no"
module_bcdec_enabled = "no"
module_bmp_enabled = "no"
module_camera_enabled = "no"
module_cvtt_enabled = "no"
module_dds_enabled = "no"
module_enet_enabled = "no"
module_etcpak_enabled = "no"
module_hdr_enabled = "no"
module_interactive_music_enabled = "no"
module_ktx_enabled = "no"
module_lightmapper_rd_enabled = "no"
module_mobile_vr_enabled = "no"
module_mono_enabled = "no"
module_openxr_enabled = "no"
module_raycast_enabled = "no"
module_tga_enabled = "no"
module_theora_enabled = "no"
module_tinyexr_enabled = "no"
module_upnp_enabled = "no"
module_vhacd_enabled = "no"
module_webrtc_enabled = "no"
module_webxr_enabled = "no"
module_xatlas_unwrap_enabled = "no"
