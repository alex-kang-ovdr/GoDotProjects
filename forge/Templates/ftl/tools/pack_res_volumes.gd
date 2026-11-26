extends SceneTree

## Headless converter: wraps staged PKG\n binary volumes from Saved/embed_staging/
## into native Godot binary Resource (.res) files in res://data/ so export_filter="all_resources"
## packs them cleanly into index.pck while PlayForge text template scanners skip binary .res files.

const VolScript := preload("res://scripts/ftl_asset_volume.gd")

const VOLUMES := [
	"ftl_pack_xml",
	"ftl_pack_ships",
	"ftl_pack_sprites",
	"ftl_pack_sfx",
]


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var ok := 0
	for vname in VOLUMES:
		var src := "res://Saved/embed_staging/%s.pkg" % vname
		var dst := "res://data/%s.res" % vname
		if not FileAccess.file_exists(src):
			printerr("Missing staging volume: " + src)
			quit(1)
			return
		var bytes := FileAccess.get_file_as_bytes(src)
		if bytes.size() < 16:
			printerr("Empty staging volume: " + src)
			quit(1)
			return
		var res: Resource = VolScript.new()
		res.set("volume_name", vname)
		res.set("blob", bytes)
		var err := ResourceSaver.save(res, dst)
		if err != OK:
			printerr("Failed to save %s (err=%d)" % [dst, err])
			quit(1)
			return
		print("PACKED_RES %s (%d bytes)" % [dst, bytes.size()])
		ok += 1
	print("PACKED_RES_DONE count=%d" % ok)
	quit(0)
