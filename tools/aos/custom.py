# Godot 4.7.2 Android Minimal Runtime SCons Profile (Stage 2)
# Usage (inside godot-engine submodule):
#   scons platform=android arch=arm64 target=template_release profile=../../tools/aos/custom.py -j8
#   cd platform/android/java && ./gradlew generateGodotTemplates

target = "template_release"
debug_symbols = "no"
separate_debug_symbols = "no"
optimize = "size"
use_lto = "yes"
deprecated = "no"
minizip = "yes"

# Exclude editor / tools / unused heavy modules (PlayHub is game play runtime only, no Forge)
tools = "no"
tests = "no"
openxr = "no"
vulkan = "yes"
opengl3 = "yes"

# Strip unused modules for Play Hub minimal APK target (<= 20 MiB arm64-v8a)
module_mono_enabled = "no"
module_openxr_enabled = "no"
module_mobile_vr_enabled = "no"
module_camera_enabled = "no"
module_dds_enabled = "no"
module_hdr_enabled = "no"
module_tga_enabled = "no"
module_tinyexr_enabled = "no"
module_bmp_enabled = "no"
module_svg_enabled = "yes"
module_webp_enabled = "yes"
module_gltf_enabled = "yes"
module_fbx_enabled = "no"
module_blender_enabled = "no"
module_csg_enabled = "no"
module_gridmap_enabled = "no"
module_vhacd_enabled = "no"
module_xatlas_unwrap_enabled = "no"
module_theora_enabled = "no"
module_upnp_enabled = "no"
module_webrtc_enabled = "no"
module_enet_enabled = "yes"
module_websocket_enabled = "yes"
module_mbedtls_enabled = "yes"
module_gdscript_enabled = "yes"
module_text_server_fb_enabled = "yes"
module_text_server_adv_enabled = "no"
