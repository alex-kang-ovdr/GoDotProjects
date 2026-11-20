extends SceneTree
func _initialize():
	var file = FileAccess.open("res://THIRD_PARTY_NOTICES.txt", FileAccess.WRITE)
	file.store_string("NEXUS FRONT GODOT v11 — THIRD PARTY NOTICES\n\n")
	file.store_string("Godot Engine 4.6.3\n\n" + Engine.get_license_text() + "\n\n")
	file.store_string("Engine components and attribution\n" + JSON.stringify(Engine.get_copyright_info(), "  ") + "\n\n")
	var licenses = Engine.get_license_info()
	for name in licenses:
		file.store_string("\n===== " + str(name) + " =====\n" + str(licenses[name]) + "\n")
	file.store_string("\n===== Noto Sans CJK Korean font subset =====\n")
	file.store_string(FileAccess.get_file_as_string("res://assets/FONT_LICENSE.txt"))
	file.store_string("\n===== League of Legends data and portraits =====\nLeague of Legends names, champion and item portraits, and official Data Dragon data belong to Riot Games and their respective rights holders. This is an unofficial fan analysis and implementation project, not a Riot Games product. The pinned dataset is Data Dragon 16.22.1. See data/provenance.json and docs/DATA.md for original sources and reconstruction boundaries.\n")
	file.close()
	print("Wrote THIRD_PARTY_NOTICES.txt from actual engine license information.")
	quit()
