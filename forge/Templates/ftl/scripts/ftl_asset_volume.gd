class_name FTLAssetVolume
extends Resource

## Binary container holding an embedded FTL PKG\n asset volume inside Godot .pck
## without triggering text-based PlayForge template size limits or PNG import overhead.

@export var volume_name: String = ""
@export var blob: PackedByteArray = PackedByteArray()
