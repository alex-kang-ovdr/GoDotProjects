extends SceneTree

const PackageInstaller := preload("res://addons/playforge_asset_store/package_installer.gd")
const StoreDock := preload("res://addons/playforge_asset_store/store_dock.gd")
const StorePluginScript := preload("res://addons/playforge_asset_store/plugin.gd")

var _api_url := ""
var _web_url := ""
var _proj_a := ""
var _proj_b := ""
var _staging := ""
var _pkg_v1 := {}
var _pkg_v2 := {}
var _editorial := {}


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--api-url="):
			_api_url = arg.trim_prefix("--api-url=")
		elif arg.begins_with("--web-url="):
			_web_url = arg.trim_prefix("--web-url=")
		elif arg.begins_with("--proj-a="):
			_proj_a = arg.trim_prefix("--proj-a=")
		elif arg.begins_with("--proj-b="):
			_proj_b = arg.trim_prefix("--proj-b=")
		elif arg.begins_with("--staging="):
			_staging = arg.trim_prefix("--staging=")
		elif arg.begins_with("--manifest="):
			var raw := FileAccess.get_file_as_string(arg.trim_prefix("--manifest="))
			var parsed: Variant = JSON.parse_string(raw)
			if parsed is Dictionary:
				_pkg_v1 = parsed.get("pkg_v1", {})
				_pkg_v2 = parsed.get("pkg_v2", {})
				_editorial = parsed.get("editorial", {})
	call_deferred("_run")


func _run() -> void:
	if StorePluginScript == null or PackageInstaller == null or StoreDock == null:
		_fail("Failed to preload playforge_asset_store scripts.")
		return

	var pkg_contract := PackageInstaller.validate_contract(_pkg_v1)
	if not bool(pkg_contract.get("valid", false)):
		_fail("Package contract validation failed in GDScript: " + str(pkg_contract.get("errors", [])))
		return
	var ed_contract := PackageInstaller.validate_contract(_editorial)
	if not bool(ed_contract.get("valid", false)):
		_fail("Editorial contract validation failed in GDScript: " + str(ed_contract.get("errors", [])))
		return

	var installer := PackageInstaller.new()
	var dock := StoreDock.new()
	dock.set_endpoints(_web_url, _api_url)
	dock.set_staging_root(_staging)
	dock.set_target_projects([
		{"id": "proj-a", "name": "Project A", "root": _proj_a},
		{"id": "proj-b", "name": "Project B", "root": _proj_b},
	])
	dock.select_project("proj-a")

	var opened_urls: Array[String] = []
	dock.set_shell_open_handler(func(url: String) -> int:
		opened_urls.append(url)
		return OK
	)
	var scan_calls := [0]
	dock.set_filesystem_scan_handler(func() -> void:
		scan_calls[0] += 1
	)
	root.add_child(dock)
	await process_frame

	# 1. Refresh library over HTTP from Node Store bridge
	var refreshed := [false]
	dock.library_refreshed.connect(func(_entries: Array) -> void:
		refreshed[0] = true
	)
	dock.refresh_library()
	var ok_refresh := await _wait_until(func() -> bool: return refreshed[0])
	if not ok_refresh:
		_fail("StoreDock failed to refresh library over HTTP.")
		return

	var diag := dock.get_diagnostics()
	if int(diag.library_count) < 2:
		_fail("Expected at least 2 library entries after refresh, got: " + str(diag))
		return

	# 2. Verify "스토어 웹 열기" (OS.shell_open handler) and version/kind/compatibility UI text
	dock.select_asset(str(_pkg_v1.get("asset_id", "")))
	var detail_meta := dock.find_child("DetailMeta", true, false) as Label
	var detail_compat := dock.find_child("DetailCompat", true, false) as Label
	if detail_meta == null or not detail_meta.text.contains("2.0.1") or not detail_meta.text.contains("package"):
		_fail("DetailMeta did not show version and release_kind: " + (detail_meta.text if detail_meta != null else "null"))
		return
	if detail_compat == null or not detail_compat.text.contains("4.7.2") or not detail_compat.text.contains("windows"):
		_fail("DetailCompat did not show compatibility metadata: " + (detail_compat.text if detail_compat != null else "null"))
		return
	var open_res := dock.open_store_web()
	if not bool(open_res.get("ok", false)) or opened_urls.is_empty():
		_fail("open_store_web failed: " + str(open_res))
		return
	if not opened_urls[0].begins_with(_web_url):
		_fail("open_store_web URL mismatch: " + opened_urls[0])
		return

	# 3. Verify editorial entry hides review/apply UI and blocks install
	dock.select_asset(str(_editorial.get("asset_id", "")))
	var ed_diag := dock.get_diagnostics()
	if ed_diag.review_visible or ed_diag.apply_visible:
		_fail("Editorial entry must hide review/apply buttons in StoreDock.")
		return
	var ed_review := dock.review_selected_package("4.7.2", "windows")
	if bool(ed_review.get("ok", true)) or str(ed_review.get("code", "")) != "EDITORIAL_NOT_INSTALLABLE":
		_fail("Editorial review was not rejected: " + str(ed_review))
		return
	var ed_apply := dock.apply_selected_package()
	if bool(ed_apply.get("ok", true)) or str(ed_apply.get("code", "")) != "EDITORIAL_NOT_INSTALLABLE":
		_fail("Editorial apply was not rejected: " + str(ed_apply))
		return

	# 4. Verify SHA-256 mismatch rejection in PackageInstaller
	var bad_bytes := PackedByteArray([80, 75, 3, 4, 0, 1, 2, 3])
	var bad_stage := installer.stage_3_verify_and_stage_artifact(_pkg_v1, bad_bytes, _staging)
	if bool(bad_stage.get("ok", true)) or str(bad_stage.get("code", "")) != "ARTIFACT_DIGEST_MISMATCH":
		_fail("Tampered artifact was not rejected by SHA-256 check: " + str(bad_stage))
		return

	# 5. Select package, review plan over HTTP artifact download + SHA-256 verification, and apply to proj-a only
	dock.select_asset(str(_pkg_v1.get("asset_id", "")))
	var reviewed_plan := [{}]
	dock.plan_reviewed.connect(func(plan: Dictionary) -> void:
		reviewed_plan[0] = plan
	)
	var rev_init := dock.review_selected_package("4.7.2", "windows")
	if not bool(rev_init.get("ok", false)):
		_fail("Package review start failed: " + str(rev_init))
		return
	var ok_plan := await _wait_until(func() -> bool: return not reviewed_plan[0].is_empty())
	if not ok_plan or str(reviewed_plan[0].get("store_state", "")) != "plan_reviewed":
		_fail("Package review plan did not reach plan_reviewed state.")
		return

	# Ensure proj-a has NOT been modified yet after Stage 4 review
	var first_file := str(_pkg_v1.file_manifest[0].path)
	if FileAccess.file_exists(_proj_a.path_join(first_file)):
		_fail("Stage 4 review must not modify target project files.")
		return

	# Apply to proj-a ONLY
	var apply_res := dock.apply_selected_package()
	if not bool(apply_res.get("ok", false)) or str(apply_res.get("store_state", "")) != "applied_to_project":
		_fail("Stage 5 apply failed: " + str(apply_res))
		return
	if not FileAccess.file_exists(_proj_a.path_join(first_file)):
		_fail("Applied file missing in selected project proj-a.")
		return
	if FileAccess.file_exists(_proj_b.path_join(first_file)) or FileAccess.file_exists(_proj_b.path_join(".playforge-store-installations.json")):
		_fail("Unselected project proj-b must remain untouched.")
		return

	var records := PackageInstaller.read_installation_records(_proj_a)
	var rec: Dictionary = records.get(str(_pkg_v1.asset_id), {})
	var rec_errors := PackageInstaller.validate_installation_record(rec)
	if not rec_errors.is_empty():
		_fail("Invalid installation_record written by Godot: " + ", ".join(rec_errors))
		return

	# 6. Verify conflict detection & stale plan detection
	var target_file := _proj_a.path_join(first_file)
	var fh := FileAccess.open(target_file, FileAccess.WRITE)
	fh.store_string("MODIFIED_BY_USER")
	fh.close()
	var conflict_plan := installer.stage_4_review_install_plan(_pkg_v1, "proj-a", _proj_a)
	if not bool(conflict_plan.get("ok", false)) or conflict_plan.conflicts.is_empty():
		_fail("Stage 4 failed to detect modified file conflict: " + str(conflict_plan))
		return
	var staged_dir := _staging.path_join(str(_pkg_v1.release_id))
	var blocked_apply := installer.stage_5_apply_install_plan(_pkg_v1, conflict_plan, staged_dir, "proj-a", _proj_a, false)
	if bool(blocked_apply.get("ok", true)) or str(blocked_apply.get("code", "")) != "CONFLICT_DETECTED":
		_fail("Stage 5 did not block unconfirmed conflict overwrite: " + str(blocked_apply))
		return

	# Mutate project after review -> stale plan rejection
	var fh2 := FileAccess.open(target_file, FileAccess.WRITE)
	fh2.store_string("CHANGED_AFTER_REVIEW")
	fh2.close()
	var stale_apply := installer.stage_5_apply_install_plan(_pkg_v1, conflict_plan, staged_dir, "proj-a", _proj_a, true)
	if bool(stale_apply.get("ok", true)) or str(stale_apply.get("code", "")) != "STALE_INSTALL_PLAN":
		_fail("Stage 5 did not reject stale plan after project change: " + str(stale_apply))
		return

	# 7. Verify Stage 6 update_available detection without mutating project files
	var s6 := installer.stage_6_check_update(rec, _pkg_v2, _pkg_v1)
	if not bool(s6.get("update_available", false)) or str(s6.get("store_state", "")) != "update_available":
		_fail("Stage 6 did not detect available update: " + str(s6))
		return
	if FileAccess.get_file_as_string(target_file) != "CHANGED_AFTER_REVIEW":
		_fail("Stage 6 must not modify project files.")
		return

	print("PLAYFORGE_ASSET_STORE_HEADLESS_OK")
	dock.queue_free()
	quit(0)


func _wait_until(predicate: Callable) -> bool:
	var deadline := Time.get_ticks_msec() + 5000
	while Time.get_ticks_msec() < deadline:
		if predicate.call():
			return true
		await create_timer(0.05).timeout
	return false


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
