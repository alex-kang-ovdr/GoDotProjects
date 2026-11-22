# Godot 4.7.2 Desktop (Windows/macOS/Linux) Custom Engine Release SCons Profile
# Retains all native/installed Desktop modules (jolt_physics, enet, fbx, lightmapper_rd,
# raycast, theora, astcenc/etcpak/ktx, upnp, playforge_core, etc.)
# while disabling XR / VR and hardware webcam (CameraServer) globally across all targets.
#
# Usage (inside godot-engine submodule):
#   scons platform=windows target=template_release profile=../tools/desktop/custom.py -j28
#   scons platform=windows target=editor           profile=../tools/desktop/custom.py -j28

production = "yes"
debug_symbols = "no"
separate_debug_symbols = "no"
optimize = "speed"
lto = "auto"
deprecated = "yes"

# PlayForge custom Avatar / CoreHUD engine module
module_playforge_core_enabled = "yes"

# XR / VR and hardware webcam (CameraServer) disabled across all targets (Web, Desktop, AOS, iOS)
# Note: Camera2D / Camera3D scene nodes are core engine features and remain enabled.
openxr = "no"
module_openxr_enabled = "no"
module_webxr_enabled = "no"
module_mobile_vr_enabled = "no"
module_camera_enabled = "no"
