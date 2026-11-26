extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const RocketNetwork := preload("res://sim/rocket_network.gd")
const NOZZLE := "cosmoteer.thruster_rocket_nozzle"
const EXTENDER := "cosmoteer.thruster_rocket_extender"
const BATTERY := "cosmoteer.thruster_rocket_battery"
const EPS := 0.0001

var failures: Array[String] = []
var checks := 0


func _initialize() -> void:
	_test_rotated_two_stage_with_battery()
	_test_misaligned_rotation_disconnects()
	_test_damage_removes_modules()
	_test_energy_gate()
	_test_single_stage()
	_test_direct_and_dual_battery_ports()
	_test_catalog_driven_scaling()
	for failure in failures:
		printerr("FAIL ", failure)
	print("Rocket network checks: %d; failures: %d" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)


func _rotated_design(include_battery: bool = true, battery_rotation: int = 1) -> Dictionary:
	var design := ShipDesign.new()
	var placed := design.place(NOZZLE, Vector2i(1, 5), 1)
	placed = placed and design.place(EXTENDER, Vector2i(6, 5), 1)
	if include_battery:
		placed = placed and design.place(BATTERY, Vector2i(6, 8), battery_rotation)
	return {"design": design, "valid": placed}


func _test_rotated_two_stage_with_battery() -> void:
	var setup := _rotated_design()
	var design: ShipDesign = setup.design
	_check(setup.valid, "Quarter-turn nozzle, extender and battery fit")
	var analysis := RocketNetwork.analyze(design)
	_check(analysis.nozzles.size() == 1, "Rotated nozzle profile exists")
	if analysis.nozzles.is_empty():
		return
	var uid := int(design.parts[0].uid)
	var profile: Dictionary = analysis.nozzles[uid]
	_check(profile.chain_uids.size() == 2, "Rotated full-edge extender connects as upstream stage")
	_check(profile.storage_uids.size() == 3 and profile.capacity == 8000.0, "Unique physical stores count battery once")
	_check(profile.usable_capacity == 4000.0 and profile.stages.size() == 2, "Each stage exposes at most 2000 storage")
	_check(profile.thrust_force == 20000.0 and profile.fuel_per_second == 600.0, "Two stages scale thrust and full-power burn")
	_check(absf(profile.ramp_up - 4.0 * sqrt(2.0)) < EPS, "Two-stage normalized ramp-up wall time")
	_check(absf(profile.ramp_down - 2.0) < EPS and absf(profile.recovery_time - 2.0 * sqrt(2.0)) < EPS, "Two-stage normalized ramp-down and recovery")
	var nozzle_uid: int = int(design.parts[0].uid)
	var extender_uid: int = int(design.parts[1].uid)
	var battery_uid: int = int(design.parts[2].uid)
	_check(analysis.consumers[nozzle_uid].storage_uids == [nozzle_uid], "Nozzle outlet uses its local extendable pool")
	_check(analysis.consumers[extender_uid].storage_uids == [extender_uid, battery_uid], "Extender outlet uses its local side-battery pool")
	_check(analysis.consumers[battery_uid].storage_uids == [extender_uid, battery_uid], "Battery outlet includes its own store and adjacent stage pool")


func _test_misaligned_rotation_disconnects() -> void:
	var setup := _rotated_design(true, 0)
	_check(setup.valid, "Mismatched battery placement fits")
	var design: ShipDesign = setup.design
	var profile: Dictionary = RocketNetwork.analyze(design).nozzles[int(design.parts[0].uid)]
	_check(profile.chain_uids.size() == 2, "Matching rocket stack remains connected")
	_check(profile.storage_uids.size() == 2 and profile.capacity == 4000.0, "Mismatched battery frame does not attach")
	var nonfull := ShipDesign.new()
	_check(nonfull.place(NOZZLE, Vector2i(1, 5), 1), "Nozzle placement")
	_check(nonfull.place(EXTENDER, Vector2i(6, 4), 1), "Partial-edge extender placement")
	var isolated: Dictionary = RocketNetwork.analyze(nonfull).nozzles[int(nonfull.parts[0].uid)]
	_check(isolated.chain_uids.size() == 1, "Partial edge overlap is not a socket connection")


func _test_damage_removes_modules() -> void:
	var setup := _rotated_design()
	var design: ShipDesign = setup.design
	var nozzle_uid := int(design.parts[0].uid)
	var extender_uid := int(design.parts[1].uid)
	var battery_uid := int(design.parts[2].uid)
	var battery_broken: Dictionary = RocketNetwork.analyze(design, {battery_uid: 0.0}).nozzles[nozzle_uid]
	_check(battery_broken.storage_uids.size() == 2 and battery_broken.capacity == 4000.0, "Destroyed battery leaves chain and stage quotas intact")
	var extender_broken: Dictionary = RocketNetwork.analyze(design, {extender_uid: 0.0}).nozzles[nozzle_uid]
	_check(extender_broken.chain_uids.size() == 1 and extender_broken.thrust_force == 10000.0, "Destroyed extender severs stack contribution")
	_check(not extender_broken.storage_uids.has(battery_uid), "Battery attached only to severed stage is disconnected")
	var nozzle_broken := RocketNetwork.analyze(design, {nozzle_uid: 0.0})
	_check(nozzle_broken.nozzles.is_empty(), "Destroyed nozzle has no propulsion profile")


func _test_energy_gate() -> void:
	var setup := _rotated_design()
	var design: ShipDesign = setup.design
	var nozzle_uid := int(design.parts[0].uid)
	var extender_uid := int(design.parts[1].uid)
	var battery_uid := int(design.parts[2].uid)
	var profile: Dictionary = RocketNetwork.analyze(design).nozzles[nozzle_uid]
	var full := RocketNetwork.powered_profile(profile, {nozzle_uid: 2000.0, extender_uid: 0.0, battery_uid: 4000.0})
	_check(full.powered_stage_count == 2 and full.thrust_force == 20000.0 and full.fuel_per_second == 600.0, "Side battery powers its stage and retains stack")
	var empty := RocketNetwork.powered_profile(profile, {nozzle_uid: 0.0, extender_uid: 0.0, battery_uid: 0.0})
	_check(empty.powered_stage_count == 0 and empty.thrust_force == 0.0 and empty.ramp_up == 0.0, "Empty physical stores gate live thrust")


func _test_single_stage() -> void:
	var design := ShipDesign.new()
	_check(design.place(NOZZLE, Vector2i(2, 2)), "Single nozzle placement")
	var profile: Dictionary = RocketNetwork.preview(design).nozzles[int(design.parts[0].uid)]
	_check(profile.chain_uids.size() == 1 and profile.capacity == 2000.0 and profile.usable_capacity == 2000.0, "Unextended stage baseline capacity")
	_check(profile.thrust_force == 10000.0 and profile.fuel_per_second == 300.0, "Unextended stage baseline force and burn")
	_check(profile.ramp_up == 4.0 and profile.ramp_down == 2.0 and profile.recovery_time == 2.0, "Unextended stage baseline times")


func _test_direct_and_dual_battery_ports() -> void:
	var direct := ShipDesign.new()
	_check(direct.place(NOZZLE, Vector2i(1, 5), 1), "Rotated nozzle placement for direct battery")
	_check(direct.place(BATTERY, Vector2i(4, 8), 1), "Rotated battery placement at nozzle socket")
	var direct_profile: Dictionary = RocketNetwork.analyze(direct).nozzles[int(direct.parts[0].uid)]
	_check(direct_profile.storage_uids.size() == 2 and direct_profile.capacity == 6000.0, "Battery connects directly to matching nozzle socket")
	_check(direct_profile.usable_capacity == 2000.0 and direct_profile.stages[0].storage_uids.size() == 2, "Direct battery contributes physical storage within capped stage quota")
	var dual := _rotated_design(false)
	var dual_design: ShipDesign = dual.design
	_check(dual_design.place(BATTERY, Vector2i(6, 4), 1), "Place one side battery")
	_check(dual_design.place(BATTERY, Vector2i(6, 8), 1), "Place second side battery")
	var result := RocketNetwork.analyze(dual_design)
	var extender_uid := int(dual_design.parts[1].uid)
	var left_uid := int(dual_design.parts[2].uid)
	var right_uid := int(dual_design.parts[3].uid)
	_check(result.consumers[extender_uid].storage_uids == [extender_uid, left_uid, right_uid], "Extender pool collects both side batteries before building outlets")
	_check(result.consumers[left_uid].storage_uids == [extender_uid, left_uid, right_uid] and result.consumers[right_uid].storage_uids == [extender_uid, left_uid, right_uid], "Each battery can draw from its own plus connected local stage pool")


func _test_catalog_driven_scaling() -> void:
	var setup := _rotated_design()
	var design: ShipDesign = setup.design
	var modified_catalog: Dictionary = design.by_id.duplicate(true)
	modified_catalog[NOZZLE].stats.special_propulsion.base_force = 12000.0
	modified_catalog[NOZZLE].stats.special_propulsion.fuel_per_second = 350.0
	modified_catalog[NOZZLE].stats.special_propulsion.stage_capacity_limit = 2500.0
	modified_catalog[EXTENDER].stats.special_propulsion.stage_stack = 2.0
	modified_catalog[EXTENDER].stats.special_propulsion.stage_capacity_limit = 2500.0
	modified_catalog[BATTERY].stats.special_propulsion.local_battery_capacity = 5000.0
	var preview_input := {"parts": design.parts, "by_id": modified_catalog}
	var profile: Dictionary = RocketNetwork.analyze(preview_input).nozzles[int(design.parts[0].uid)]
	_check(profile.thrust_force == 36000.0 and profile.fuel_per_second == 1050.0, "Buff stack and force/fuel use extracted catalog values")
	_check(profile.capacity == 9000.0 and profile.usable_capacity == 4500.0, "Battery physical capacity and per-stage quota use catalog values")
	_check(absf(profile.ramp_up - 4.0 * sqrt(3.0)) < EPS, "Ramp exponent comes from extracted catalog")
