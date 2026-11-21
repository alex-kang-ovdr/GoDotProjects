@tool
extends EditorPlugin

const AUTOLOAD_NAME := "RobloxCompat"
const AUTOLOAD_PATH := "res://addons/playforge_roblox_compat/roblox_compat.gd"

func _enter_tree() -> void:
	if not ProjectSettings.has_setting("autoload/" + AUTOLOAD_NAME):
		add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)

func _exit_tree() -> void:
	if ProjectSettings.has_setting("autoload/" + AUTOLOAD_NAME):
		remove_autoload_singleton(AUTOLOAD_NAME)
