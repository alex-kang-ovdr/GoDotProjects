extends SceneTree

const CombatSystems := preload("res://sim/combat_systems.gd")
const SfxBank := preload("res://sim/sfx.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	test.call_deferred()


func verify(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func test() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame

	# Verify procedural SFX bank synthesizes all 8 Web-safe WAV waveforms
	var bank = lab.shipyard.duel.sfx
	verify(bank != null and bank.streams.size() == SfxBank.KINDS.size(), "procedural SFX bank synthesizes all 8 combat streams")
	for k in SfxBank.KINDS:
		var wav: AudioStreamWAV = bank.streams.get(k)
		verify(wav != null and wav.data.size() > 500, "SFX stream %s has valid PCM payload" % k)

	# Load cruiser preset in Shipyard and launch against vanguard opponent
	var yard = lab.shipyard
	yard._cruiser_preset()
	await process_frame
	verify(not yard.depart_button.disabled, "cruiser preset is launch-ready in shipyard UI")
	var duel = yard.duel
	var ok: bool = duel.launch(yard.design, {"id": "vanguard", "title": "방어막 돌파", "objective": "duel", "opponent": "vanguard", "distance": 150, "ai": "balanced"})
	yard.editor.hide()
	duel.show()
	await process_frame
	verify(ok and duel.battle.result == "active", "cruiser vs vanguard launches cleanly in engagement UI")
	verify(duel.shield_target_button.visible, "shield focus-fire button appears when enemy has shields")
	verify("방어막" in duel.readiness.text and "PD 요격" in duel.readiness.text, "flight HUD displays shield HP and point defense intercepts")
	verify(duel.get_global_rect().end.y <= root.get_visible_rect().end.y + 1, "expanded combat HUD fits within 1240x800 viewport")

	# Focus fire enemy shield generator via button handler
	duel.shield_target_button.pressed.emit()
	var targeted: Dictionary = duel.battle.enemy.parts.get(duel.battle.target_uid, {})
	verify(targeted.get("id") == CombatSystems.SHIELD_SMALL, "shield focus button targets enemy shield generator")

	# Toggle SFX mute button
	duel.sfx_button.pressed.emit()
	verify(not bank.enabled and duel.sfx_button.text == "음향 끔", "SFX toggle mutes audio cleanly")
	duel.sfx_button.pressed.emit()
	verify(bank.enabled and duel.sfx_button.text == "음향 켬", "SFX toggle unmutes audio cleanly")

	# Step live combat frames and verify cutaway view also renders without errors
	for _i in 60:
		duel._physics_process(0.1)
	duel._switch_view()
	await process_frame
	verify(duel.cutaway.visible and "방어막" in duel.supply_metrics[0].text, "cutaway logistics shows shield power telemetry")

	print("Combat expansion UI checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
