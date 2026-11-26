class_name FgIrisNativeLoader
extends RefCounted
## C++ GDExtension(FgIrisNativeServer) 런타임 로더.
## project.godot을 수정하지 않고 필요 시 동적 로드하며, 네이티브 바이너리가 없는 플랫폼에서는
## 안전하게 null을 반환해 순수 GDScript FgReplicationServer로 폴백할 수 있다.

const EXTENSION_PATH := "res://addons/playforge_netframework/bin/playforge_iris_native.gdextension"
const CLASS_NAME := &"FgIrisNativeServer"


static func ensure_loaded() -> bool:
	if ClassDB.class_exists(CLASS_NAME):
		return true
	if not FileAccess.file_exists(EXTENSION_PATH):
		return false
	var status := GDExtensionManager.load_extension(EXTENSION_PATH)
	if status != GDExtensionManager.LOAD_STATUS_OK and status != GDExtensionManager.LOAD_STATUS_ALREADY_LOADED:
		return false
	return ClassDB.class_exists(CLASS_NAME)


static func create_server() -> RefCounted:
	if not ensure_loaded():
		return null
	return ClassDB.instantiate(CLASS_NAME) as RefCounted
