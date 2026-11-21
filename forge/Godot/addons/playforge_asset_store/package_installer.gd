@tool
extends RefCounted

const STORE_STATES := [
	"catalog_listed",
	"saved_to_library",
	"license_verified",
	"artifact_downloaded",
	"plan_reviewed",
	"applied_to_project",
	"update_available",
]
const RELEASE_KINDS := ["package", "editorial"]
const PLATFORMS := ["web", "windows", "linux", "macos"]
const INSTALLATION_STATUSES := ["applied", "superseded", "removed"]
const INSTALLATION_RECORD_FILENAME := ".playforge-store-installations.json"


static func sha256_bytes(bytes: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	if not bytes.is_empty():
		ctx.update(bytes)
	return ctx.finish().hex_encode()


static func format_digest(bytes: PackedByteArray) -> String:
	return "sha256:" + sha256_bytes(bytes)


static func resolve_abs_path(raw_path: String) -> String:
	if raw_path.begins_with("res://") or raw_path.begins_with("user://"):
		return ProjectSettings.globalize_path(raw_path).simplify_path()
	return raw_path.simplify_path()


static func _matches_regex(pattern: String, value: String) -> bool:
	var regex := RegEx.create_from_string(pattern)
	if regex == null:
		return false
	var m := regex.search(value)
	return m != null and m.get_string() == value


static func is_safe_package_path(rel_path: Variant) -> bool:
	if not (rel_path is String):
		return false
	var text := String(rel_path)
	if text.is_empty() or text.contains("\\") or text.contains(":") or text.begins_with("/") or text.ends_with("/"):
		return false
	if text.ends_with(".import") or text.ends_with(".remap"):
		return false
	for part in text.split("/"):
		if part.is_empty() or part == "." or part == "..":
			return false
	return text.begins_with("addons/") or text.begins_with("assets/")


static func infer_target_root(file_manifest: Array) -> String:
	if file_manifest.is_empty():
		return "assets/"
	var first_path := str(file_manifest[0].get("path", ""))
	var parts := first_path.split("/")
	var root_kind := "addons" if parts.size() > 0 and parts[0] == "addons" else "assets"
	if parts.size() >= 2:
		var candidate := "%s/%s/" % [root_kind, parts[1]]
		var all_share := true
		for item in file_manifest:
			if not str(item.get("path", "")).begins_with(candidate):
				all_share = false
				break
		if all_share:
			return candidate
	return root_kind + "/"


static func compare_semver(left: String, right: String) -> int:
	var re := RegEx.create_from_string("^(\\d+)\\.(\\d+)(?:\\.(\\d+))?(?:-([a-zA-Z0-9.-]+))?$")
	var ma := re.search(left.strip_edges())
	var mb := re.search(right.strip_edges())
	if ma == null or mb == null:
		return 0
	for idx in [1, 2, 3]:
		var va := int(ma.get_string(idx)) if not ma.get_string(idx).is_empty() else 0
		var vb := int(mb.get_string(idx)) if not mb.get_string(idx).is_empty() else 0
		if va != vb:
			return 1 if va > vb else -1
	var pa := ma.get_string(4)
	var pb := mb.get_string(4)
	if pa == pb:
		return 0
	if pa.is_empty():
		return 1
	if pb.is_empty():
		return -1
	return 1 if pa > pb else -1


static func current_engine_version() -> String:
	var info := Engine.get_version_info()
	return "%d.%d.%d" % [int(info.get("major", 4)), int(info.get("minor", 7)), int(info.get("patch", 0))]


static func is_supported_forge_platform(platform_name: String) -> bool:
	return platform_name.to_lower() in PLATFORMS


static func current_platform_name() -> String:
	if OS.has_feature("web"):
		return "web"
	var os_name := OS.get_name().to_lower()
	if OS.has_feature("android") or os_name.contains("android"):
		return "android"
	if OS.has_feature("ios") or os_name == "ios":
		return "ios"
	if os_name.contains("windows"):
		return "windows"
	if os_name.contains("macos") or os_name.contains("osx"):
		return "macos"
	return "linux"


static func is_editorial(entry: Dictionary) -> bool:
	return str(entry.get("release_kind", "")) == "editorial"


static func reject_editorial_install(entry: Dictionary) -> Dictionary:
	if entry.is_empty():
		return {
			"ok": false,
			"rejected": true,
			"code": "INVALID_ENTRY",
			"error": "유효하지 않은 스토어 항목입니다.",
		}
	var kind := str(entry.get("release_kind", ""))
	if kind == "editorial":
		return {
			"ok": false,
			"rejected": true,
			"code": "EDITORIAL_NOT_INSTALLABLE",
			"error": "일반 콘텐츠(editorial)는 패키지 설치 대상이 아니며 프로젝트에 설치할 수 없습니다.",
		}
	if kind != "package":
		return {
			"ok": false,
			"rejected": true,
			"code": "UNSUPPORTED_RELEASE_KIND",
			"error": "지원하지 않는 릴리스 유형입니다: " + kind,
		}
	return {"ok": true, "rejected": false}


static func validate_installation_record(record: Variant) -> Array[String]:
	var errors: Array[String] = []
	if not (record is Dictionary):
		errors.append("installation_record must be a Dictionary or null")
		return errors
	var rec: Dictionary = record
	var allowed := ["project_id", "installed_release_id", "installed_digest", "target_root", "applied_at", "status"]
	for k in rec.keys():
		if not str(k) in allowed:
			errors.append("installation_record has unexpected key: " + str(k))
	if str(rec.get("project_id", "")).is_empty():
		errors.append("installation_record requires project_id")
	if not _matches_regex("^rel-[a-z0-9-]{4,64}$", str(rec.get("installed_release_id", ""))):
		errors.append("Invalid installation_record.installed_release_id")
	if not _matches_regex("^sha256:[a-f0-9]{64}$", str(rec.get("installed_digest", ""))):
		errors.append("Invalid installation_record.installed_digest")
	var target_root := str(rec.get("target_root", ""))
	if not (target_root.begins_with("addons/") or target_root.begins_with("assets/")):
		errors.append("Invalid installation_record.target_root")
	if str(rec.get("applied_at", "")).length() < 10:
		errors.append("Invalid installation_record.applied_at")
	if not str(rec.get("status", "")) in INSTALLATION_STATUSES:
		errors.append("Invalid installation_record.status")
	return errors


static func validate_contract(entry: Dictionary) -> Dictionary:
	var errors: Array[String] = []
	if entry.is_empty():
		return {"valid": false, "errors": ["Entry must be a non-empty Dictionary"]}
	if int(entry.get("schema_version", 0)) != 1:
		errors.append("schema_version must be 1")
	if not _matches_regex("^[a-z][a-z0-9-]{1,63}$", str(entry.get("asset_id", ""))):
		errors.append("Invalid asset_id")
	if not _matches_regex("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$", str(entry.get("asset_version_id", ""))):
		errors.append("Invalid asset_version_id")
	if not _matches_regex("^rel-[a-z0-9-]{4,64}$", str(entry.get("release_id", ""))):
		errors.append("Invalid release_id")
	var release_kind := str(entry.get("release_kind", ""))
	if not release_kind in RELEASE_KINDS:
		errors.append("Invalid release_kind")
	var title := str(entry.get("title", ""))
	if title.is_empty() or title.length() > 120:
		errors.append("Invalid title")
	var pub_id := str(entry.get("publisher_id", ""))
	if pub_id.length() < 2 or pub_id.length() > 64:
		errors.append("Invalid publisher_id")
	if not str(entry.get("store_state", "")) in STORE_STATES:
		errors.append("Invalid store_state")

	if release_kind == "package":
		if not _matches_regex("^art-[a-z0-9-]{4,64}$", str(entry.get("artifact_id", ""))):
			errors.append("package requires artifact_id")
		if not _matches_regex("^sha256:[a-f0-9]{64}$", str(entry.get("artifact_digest", ""))):
			errors.append("package requires immutable sha256 artifact_digest")
		if not _matches_regex("^sha256:[a-f0-9]{64}$", str(entry.get("dependency_manifest_hash", ""))):
			errors.append("package requires dependency_manifest_hash")
		var compat: Variant = entry.get("engine_compatibility")
		if not (compat is Dictionary):
			errors.append("package requires engine_compatibility")
		else:
			if not _matches_regex("^[0-9]+\\.[0-9]+(\\.[0-9]+)?$", str(compat.get("godot_min", ""))):
				errors.append("Invalid engine_compatibility.godot_min")
			if not _matches_regex("^[0-9]+\\.[0-9]+(\\.[0-9]+)?$", str(compat.get("godot_tested", ""))):
				errors.append("Invalid engine_compatibility.godot_tested")
			var platforms: Variant = compat.get("platforms")
			if not (platforms is Array) or platforms.is_empty():
				errors.append("package requires non-empty platforms")
			else:
				for plat in platforms:
					if not str(plat) in PLATFORMS:
						errors.append("Invalid platform: " + str(plat))
		var manifest: Variant = entry.get("file_manifest")
		if not (manifest is Array) or manifest.is_empty():
			errors.append("package requires non-empty file_manifest")
		else:
			var seen := {}
			for item in manifest:
				if not (item is Dictionary):
					errors.append("file_manifest item must be Dictionary")
					continue
				var item_path := str(item.get("path", ""))
				if not is_safe_package_path(item_path) or seen.has(item_path):
					errors.append("Unsafe or duplicate file_manifest path: " + item_path)
				seen[item_path] = true
				if int(item.get("bytes", 0)) < 1:
					errors.append("Invalid bytes for " + item_path)
				if not _matches_regex("^[a-f0-9]{64}$", str(item.get("sha256", ""))):
					errors.append("Invalid sha256 for " + item_path)
				if not (item.get("executable_addon") is bool):
					errors.append("executable_addon must be bool for " + item_path)
		var lic := str(entry.get("license_snapshot_ref", ""))
		if lic.length() < 4 or lic.length() > 128:
			errors.append("package requires valid license_snapshot_ref")
	elif release_kind == "editorial":
		if entry.has("artifact_id") or entry.has("artifact_digest") or entry.has("file_manifest"):
			errors.append("editorial entry must not carry installable package artifact fields")
		if entry.get("installation_record", null) != null:
			errors.append("editorial entry must keep installation_record null")

	if entry.get("installation_record", null) != null:
		errors.append_array(validate_installation_record(entry.get("installation_record")))

	return {"valid": errors.is_empty(), "errors": errors}


static func compute_dependency_manifest_hash(dependencies: Array) -> String:
	var normalized: Array = []
	for dep in dependencies:
		if dep is Dictionary:
			normalized.append({
				"asset_id": str(dep.get("asset_id", "")),
				"asset_version_id": str(dep.get("asset_version_id", "")),
				"release_id": str(dep.get("release_id", "")),
			})
	normalized.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a.asset_id != b.asset_id:
			return a.asset_id < b.asset_id
		return a.release_id < b.release_id
	)
	var items_json: Array[String] = []
	for item in normalized:
		items_json.append("{\"asset_id\":%s,\"asset_version_id\":%s,\"release_id\":%s}" % [
			JSON.stringify(item.asset_id),
			JSON.stringify(item.asset_version_id),
			JSON.stringify(item.release_id),
		])
	var raw := "[" + ",".join(items_json) + "]"
	return format_digest(raw.to_utf8_buffer())


static func read_installation_records(project_root: String) -> Dictionary:
	var abs_root := resolve_abs_path(project_root)
	var receipt_path := abs_root.path_join(INSTALLATION_RECORD_FILENAME)
	if not FileAccess.file_exists(receipt_path):
		return {}
	var text := FileAccess.get_file_as_string(receipt_path)
	if text.is_empty():
		return {}
	var parsed: Variant = JSON.parse_string(text)
	return parsed if parsed is Dictionary else {}


static func _write_installation_records(project_root: String, records: Dictionary) -> bool:
	var abs_root := resolve_abs_path(project_root)
	if DirAccess.make_dir_recursive_absolute(abs_root) != OK:
		return false
	var receipt_path := abs_root.path_join(INSTALLATION_RECORD_FILENAME)
	var file := FileAccess.open(receipt_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(records, "  ") + "\n")
	file.close()
	return file.get_error() == OK


static func compute_project_fingerprint(project_root: String, file_manifest: Array) -> String:
	var abs_root := resolve_abs_path(project_root)
	var rows: Array[Dictionary] = []
	for item in file_manifest:
		var rel_path := str(item.get("path", ""))
		var target := abs_root.path_join(rel_path)
		if DirAccess.dir_exists_absolute(target):
			rows.append({"path": rel_path, "state": "directory"})
		elif not FileAccess.file_exists(target):
			rows.append({"path": rel_path, "state": "missing"})
		else:
			rows.append({"path": rel_path, "state": "file", "sha256": FileAccess.get_sha256(target)})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.path < b.path)
	return format_digest(JSON.stringify(rows).to_utf8_buffer())


func stage_1_verify_library_entry(entry: Dictionary, library_entries: Array = []) -> Dictionary:
	var validation := validate_contract(entry)
	if not validation.valid:
		return {"ok": false, "code": "INVALID_CONTRACT", "errors": validation.errors, "error": "; ".join(validation.errors), "project_modified": false}
	if not library_entries.is_empty():
		var found := false
		for item in library_entries:
			if item is Dictionary and str(item.get("asset_id", "")) == str(entry.get("asset_id", "")):
				found = true
				break
		if not found:
			return {"ok": false, "code": "NOT_IN_LIBRARY", "error": "내 라이브러리에서 해당 에셋을 찾을 수 없습니다.", "project_modified": false}
	return {
		"ok": true,
		"store_state": "saved_to_library",
		"asset_id": str(entry.get("asset_id", "")),
		"release_id": str(entry.get("release_id", "")),
		"release_kind": str(entry.get("release_kind", "")),
		"project_modified": false,
	}


func stage_2_verify_license(entry: Dictionary, target_engine: String = "", target_platform: String = "", usage_grants: Dictionary = {}) -> Dictionary:
	var editorial := reject_editorial_install(entry)
	if editorial.rejected:
		return editorial
	var validation := validate_contract(entry)
	if not validation.valid:
		return {"ok": false, "code": "INVALID_CONTRACT", "errors": validation.errors, "error": "; ".join(validation.errors), "project_modified": false}
	var asset_id := str(entry.get("asset_id", ""))
	if not usage_grants.is_empty() and not bool(usage_grants.get(asset_id, false)):
		return {"ok": false, "code": "LICENSE_GRANT_DENIED", "error": "사용 권한(UsageGrant)을 확인할 수 없습니다: " + asset_id, "project_modified": false}
	var engine_ver := target_engine if not target_engine.is_empty() else current_engine_version()
	var platform_name := (target_platform if not target_platform.is_empty() else current_platform_name()).to_lower()
	if not is_supported_forge_platform(platform_name):
		return {
			"ok": false,
			"code": "PLATFORM_INCOMPATIBLE",
			"error": "PlayForge Asset Store는 Forge 플랫폼(web, windows, linux, macos)만 지원하며 '%s'는 미지원입니다." % platform_name,
			"project_modified": false,
		}
	var compat: Dictionary = entry.get("engine_compatibility", {})
	var godot_min := str(compat.get("godot_min", "4.3"))
	if compare_semver(engine_ver, godot_min) < 0:
		return {"ok": false, "code": "ENGINE_INCOMPATIBLE", "error": "Godot %s 버전은 최소 요구 버전(%s)보다 낮습니다." % [engine_ver, godot_min], "project_modified": false}
	var platforms: Array = compat.get("platforms", [])
	if not platform_name in platforms:
		return {"ok": false, "code": "PLATFORM_INCOMPATIBLE", "error": "현재 플랫폼(%s)은 지원 대상(%s)이 아닙니다." % [platform_name, ", ".join(platforms)], "project_modified": false}
	return {
		"ok": true,
		"store_state": "license_verified",
		"asset_id": asset_id,
		"release_id": str(entry.get("release_id", "")),
		"license_snapshot_ref": str(entry.get("license_snapshot_ref", "")),
		"engine_version": engine_ver,
		"platform": platform_name,
		"project_modified": false,
	}


func stage_3_verify_and_stage_artifact(entry: Dictionary, artifact_bytes: PackedByteArray, staging_root: String, provided_files: Dictionary = {}) -> Dictionary:
	var editorial := reject_editorial_install(entry)
	if editorial.rejected:
		return editorial
	var validation := validate_contract(entry)
	if not validation.valid:
		return {"ok": false, "code": "INVALID_CONTRACT", "errors": validation.errors, "error": "; ".join(validation.errors), "project_modified": false}
	if artifact_bytes.is_empty():
		return {"ok": false, "code": "MISSING_ARTIFACT_BYTES", "error": "아티팩트 바이트가 비어 있습니다.", "project_modified": false}

	var expected_digest := str(entry.get("artifact_digest", ""))
	var actual_digest := format_digest(artifact_bytes)
	if actual_digest != expected_digest:
		return {
			"ok": false,
			"code": "ARTIFACT_DIGEST_MISMATCH",
			"expected": expected_digest,
			"actual": actual_digest,
			"error": "SHA-256 artifact_digest 불일치로 스테이징이 거부되었습니다.",
			"project_modified": false,
		}

	var abs_staging_root := resolve_abs_path(staging_root)
	if DirAccess.make_dir_recursive_absolute(abs_staging_root) != OK:
		return {"ok": false, "code": "STAGING_DIR_ERROR", "error": "스테이징 디렉터리를 생성할 수 없습니다.", "project_modified": false}

	var unpacked := {}
	if not provided_files.is_empty():
		unpacked = provided_files.duplicate()
	else:
		var temp_zip := abs_staging_root.path_join("tmp-%s-%d.zip" % [str(entry.get("release_id", "pkg")), Time.get_ticks_usec()])
		var writer := FileAccess.open(temp_zip, FileAccess.WRITE)
		if writer == null:
			return {"ok": false, "code": "STAGING_WRITE_ERROR", "error": "임시 아카이브를 기록할 수 없습니다.", "project_modified": false}
		writer.store_buffer(artifact_bytes)
		writer.close()
		var reader := ZIPReader.new()
		var open_err := reader.open(temp_zip)
		if open_err != OK:
			DirAccess.remove_absolute(temp_zip)
			return {"ok": false, "code": "INVALID_ARCHIVE", "error": "ZIP 아카이브를 열 수 없습니다: " + error_string(open_err), "project_modified": false}
		for zip_entry in reader.get_files():
			if not zip_entry.ends_with("/"):
				unpacked[zip_entry] = reader.read_file(zip_entry)
		reader.close()
		DirAccess.remove_absolute(temp_zip)

	var manifest: Array = entry.get("file_manifest", [])
	var strip_prefix := _detect_strip_prefix(manifest, unpacked)
	var release_id := str(entry.get("release_id", ""))
	var staged_dir := abs_staging_root.path_join(release_id)
	_remove_dir_recursive(staged_dir)
	if DirAccess.make_dir_recursive_absolute(staged_dir) != OK:
		return {"ok": false, "code": "STAGING_DIR_ERROR", "error": "릴리스 스테이징 폴더를 생성할 수 없습니다.", "project_modified": false}

	var staged_files: Array[String] = []
	for item in manifest:
		var rel_path := str(item.get("path", ""))
		if not is_safe_package_path(rel_path):
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "UNSAFE_PACKAGE_PATH", "path": rel_path, "error": "허용되지 않은 패키지 경로입니다: " + rel_path, "project_modified": false}
		var lookup_key := strip_prefix + rel_path
		if not unpacked.has(lookup_key):
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "FILE_MANIFEST_MISSING", "path": rel_path, "error": "매니페스트 파일이 아카이브에 없습니다: " + rel_path, "project_modified": false}
		var raw_data: Variant = unpacked[lookup_key]
		var file_bytes: PackedByteArray = raw_data if raw_data is PackedByteArray else str(raw_data).to_utf8_buffer()
		if file_bytes.size() != int(item.get("bytes", -1)):
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "FILE_SIZE_MISMATCH", "path": rel_path, "error": "파일 크기가 매니페스트와 다릅니다: " + rel_path, "project_modified": false}
		if sha256_bytes(file_bytes) != str(item.get("sha256", "")):
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "FILE_HASH_MISMATCH", "path": rel_path, "error": "개별 파일 SHA-256이 매니페스트와 다릅니다: " + rel_path, "project_modified": false}
		var staged_file_path := staged_dir.path_join(rel_path)
		if DirAccess.make_dir_recursive_absolute(staged_file_path.get_base_dir()) != OK:
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "STAGING_WRITE_ERROR", "path": rel_path, "error": "스테이징 하위 폴더 생성 실패: " + rel_path, "project_modified": false}
		var fh := FileAccess.open(staged_file_path, FileAccess.WRITE)
		if fh == null:
			_remove_dir_recursive(staged_dir)
			return {"ok": false, "code": "STAGING_WRITE_ERROR", "path": rel_path, "error": "스테이징 파일 기록 실패: " + rel_path, "project_modified": false}
		fh.store_buffer(file_bytes)
		fh.close()
		staged_files.append(rel_path)

	return {
		"ok": true,
		"store_state": "artifact_downloaded",
		"release_id": release_id,
		"artifact_digest": actual_digest,
		"staged_dir": staged_dir,
		"staged_files": staged_files,
		"project_modified": false,
	}


func stage_4_review_install_plan(entry: Dictionary, project_id: String, project_root: String, dependencies: Array = [], installed_records: Dictionary = {}) -> Dictionary:
	var editorial := reject_editorial_install(entry)
	if editorial.rejected:
		return editorial
	var validation := validate_contract(entry)
	if not validation.valid:
		return {"ok": false, "code": "INVALID_CONTRACT", "errors": validation.errors, "error": "; ".join(validation.errors), "project_modified": false}
	if project_id.strip_edges().is_empty():
		return {"ok": false, "code": "MISSING_PROJECT_ID", "error": "대상 project_id가 필요합니다.", "project_modified": false}
	var abs_root := resolve_abs_path(project_root)
	if not DirAccess.dir_exists_absolute(abs_root):
		return {"ok": false, "code": "PROJECT_NOT_FOUND", "error": "선택한 프로젝트 폴더를 찾을 수 없습니다: " + abs_root, "project_modified": false}

	var disk_records := read_installation_records(abs_root)
	var effective_records := disk_records.duplicate(true)
	for k in installed_records.keys():
		effective_records[k] = installed_records[k]

	if not dependencies.is_empty():
		var dep_hash := compute_dependency_manifest_hash(dependencies)
		if dep_hash != str(entry.get("dependency_manifest_hash", "")):
			return {
				"ok": false,
				"code": "DEPENDENCY_MANIFEST_MISMATCH",
				"expected": str(entry.get("dependency_manifest_hash", "")),
				"actual": dep_hash,
				"error": "의존성 매니페스트 해시가 일치하지 않습니다.",
				"project_modified": false,
			}

	var missing_dependencies: Array[Dictionary] = []
	for dep in dependencies:
		if not (dep is Dictionary):
			continue
		var dep_id := str(dep.get("asset_id", ""))
		if dep_id.is_empty():
			continue
		var rec: Variant = effective_records.get(dep_id, null)
		var dep_rel := str(dep.get("release_id", ""))
		if not (rec is Dictionary) or str(rec.get("status", "")) != "applied" or (not dep_rel.is_empty() and str(rec.get("installed_release_id", "")) != dep_rel):
			missing_dependencies.append(dep)

	var manifest: Array = entry.get("file_manifest", [])
	var additions: Array[Dictionary] = []
	var unchanged: Array[Dictionary] = []
	var conflicts: Array[Dictionary] = []
	var executable_addons: Array[String] = []

	for item in manifest:
		var rel_path := str(item.get("path", ""))
		if not is_safe_package_path(rel_path):
			return {"ok": false, "code": "UNSAFE_TARGET_PATH", "path": rel_path, "error": "안전하지 않은 대상 경로: " + rel_path, "project_modified": false}
		if bool(item.get("executable_addon", false)) or rel_path.begins_with("addons/"):
			executable_addons.append(rel_path)
		var target := abs_root.path_join(rel_path)
		if DirAccess.dir_exists_absolute(target):
			conflicts.append({"path": rel_path, "reason": "path_is_directory", "existing_sha256": "", "incoming_sha256": str(item.get("sha256", ""))})
		elif not FileAccess.file_exists(target):
			additions.append({"path": rel_path, "bytes": int(item.get("bytes", 0)), "executable_addon": bool(item.get("executable_addon", false))})
		else:
			var existing_sha := FileAccess.get_sha256(target)
			var incoming_sha := str(item.get("sha256", ""))
			if existing_sha == incoming_sha:
				unchanged.append({"path": rel_path, "bytes": int(item.get("bytes", 0))})
			else:
				conflicts.append({"path": rel_path, "reason": "file_modified_or_exists", "existing_sha256": existing_sha, "incoming_sha256": incoming_sha})

	var target_root := infer_target_root(manifest)
	var fingerprint := compute_project_fingerprint(abs_root, manifest)
	return {
		"ok": true,
		"store_state": "plan_reviewed",
		"project_id": project_id,
		"project_root": abs_root,
		"asset_id": str(entry.get("asset_id", "")),
		"release_id": str(entry.get("release_id", "")),
		"artifact_digest": str(entry.get("artifact_digest", "")),
		"target_root": target_root,
		"additions": additions,
		"unchanged": unchanged,
		"conflicts": conflicts,
		"executable_addons": executable_addons,
		"missing_dependencies": missing_dependencies,
		"project_fingerprint": fingerprint,
		"can_apply": missing_dependencies.is_empty(),
		"requires_conflict_resolution": not conflicts.is_empty(),
		"project_modified": false,
	}


func stage_5_apply_install_plan(entry: Dictionary, plan: Dictionary, staged_dir: String, project_id: String, project_root: String, allow_overwrite_conflicts: bool = false, applied_at: String = "") -> Dictionary:
	var editorial := reject_editorial_install(entry)
	if editorial.rejected:
		return editorial
	var validation := validate_contract(entry)
	if not validation.valid:
		return {"ok": false, "code": "INVALID_CONTRACT", "errors": validation.errors, "error": "; ".join(validation.errors), "project_modified": false}
	if str(plan.get("store_state", "")) != "plan_reviewed":
		return {"ok": false, "code": "PLAN_NOT_REVIEWED", "error": "설치 계획 검토(plan_reviewed)를 먼저 완료해야 합니다.", "project_modified": false}
	var abs_root := resolve_abs_path(project_root)
	if str(plan.get("project_id", "")) != project_id or resolve_abs_path(str(plan.get("project_root", ""))) != abs_root:
		return {"ok": false, "code": "PROJECT_MISMATCH", "error": "검토한 대상 프로젝트와 적용하려는 프로젝트가 다릅니다.", "project_modified": false}
	if str(plan.get("release_id", "")) != str(entry.get("release_id", "")) or str(plan.get("artifact_digest", "")) != str(entry.get("artifact_digest", "")):
		return {"ok": false, "code": "RELEASE_MISMATCH", "error": "검토한 계획과 릴리스 다이제스트가 일치하지 않습니다.", "project_modified": false}
	var missing_deps: Array = plan.get("missing_dependencies", [])
	if not missing_deps.is_empty():
		return {"ok": false, "code": "MISSING_DEPENDENCIES", "missing_dependencies": missing_deps, "error": "필수 의존성 패키지가 누락되었습니다.", "project_modified": false}
	var conflicts: Array = plan.get("conflicts", [])
	if not conflicts.is_empty() and not allow_overwrite_conflicts:
		return {"ok": false, "code": "CONFLICT_DETECTED", "conflicts": conflicts, "error": "충돌 파일이 감지되어 적용을 중단했습니다. 덮어쓰기 허용 여부를 확인하세요.", "project_modified": false}
	if not DirAccess.dir_exists_absolute(abs_root):
		return {"ok": false, "code": "PROJECT_NOT_FOUND", "error": "선택한 프로젝트 폴더가 존재하지 않습니다.", "project_modified": false}

	var manifest: Array = entry.get("file_manifest", [])
	var current_fingerprint := compute_project_fingerprint(abs_root, manifest)
	if current_fingerprint != str(plan.get("project_fingerprint", "")):
		return {"ok": false, "code": "STALE_INSTALL_PLAN", "error": "설치 계획 검토 이후 프로젝트 파일이 변경되었습니다. 다시 검토하세요.", "project_modified": false}

	var abs_staged := resolve_abs_path(staged_dir)
	var file_buffers := {}
	for item in manifest:
		var rel_path := str(item.get("path", ""))
		var staged_file := abs_staged.path_join(rel_path)
		if not FileAccess.file_exists(staged_file):
			return {"ok": false, "code": "STAGED_FILE_MISSING", "path": rel_path, "error": "스테이징 파일을 찾을 수 없습니다: " + rel_path, "project_modified": false}
		var reader := FileAccess.open(staged_file, FileAccess.READ)
		if reader == null:
			return {"ok": false, "code": "STAGED_FILE_UNREADABLE", "path": rel_path, "error": "스테이징 파일을 읽을 수 없습니다: " + rel_path, "project_modified": false}
		var buf := reader.get_buffer(reader.get_length())
		reader.close()
		if buf.size() != int(item.get("bytes", -1)) or sha256_bytes(buf) != str(item.get("sha256", "")):
			return {"ok": false, "code": "STAGED_FILE_CORRUPTED", "path": rel_path, "error": "스테이징 파일 무결성 검증 실패: " + rel_path, "project_modified": false}
		file_buffers[rel_path] = buf

	var backups: Array[Dictionary] = []
	var written_files: Array[String] = []
	var write_error := ""
	for item in manifest:
		var rel_path := str(item.get("path", ""))
		var target := abs_root.path_join(rel_path)
		if DirAccess.dir_exists_absolute(target):
			write_error = "Target path is a directory: " + rel_path
			break
		if FileAccess.file_exists(target):
			var prev_reader := FileAccess.open(target, FileAccess.READ)
			if prev_reader == null:
				write_error = "Cannot backup existing file: " + rel_path
				break
			backups.append({"target": target, "existed": true, "bytes": prev_reader.get_buffer(prev_reader.get_length())})
			prev_reader.close()
		else:
			backups.append({"target": target, "existed": false, "bytes": PackedByteArray()})
		if DirAccess.make_dir_recursive_absolute(target.get_base_dir()) != OK:
			write_error = "Cannot create target directory: " + rel_path
			break
		var writer := FileAccess.open(target, FileAccess.WRITE)
		if writer == null:
			write_error = "Cannot write target file: " + rel_path
			break
		writer.store_buffer(file_buffers[rel_path])
		writer.close()
		if writer.get_error() != OK:
			write_error = "Write error on target file: " + rel_path
			break
		written_files.append(rel_path)

	if not write_error.is_empty():
		backups.reverse()
		for b in backups:
			if b.existed:
				var restore := FileAccess.open(b.target, FileAccess.WRITE)
				if restore != null:
					restore.store_buffer(b.bytes)
					restore.close()
			elif FileAccess.file_exists(b.target):
				DirAccess.remove_absolute(b.target)
		return {"ok": false, "code": "APPLY_FAILED", "error": write_error, "project_modified": false}

	var stamp := applied_at if not applied_at.is_empty() else (Time.get_datetime_string_from_system(true) + "Z")
	var installation_record := {
		"project_id": project_id,
		"installed_release_id": str(entry.get("release_id", "")),
		"installed_digest": str(entry.get("artifact_digest", "")),
		"target_root": str(plan.get("target_root", infer_target_root(manifest))),
		"applied_at": stamp,
		"status": "applied",
	}
	var all_records := read_installation_records(abs_root)
	all_records[str(entry.get("asset_id", ""))] = installation_record
	if not _write_installation_records(abs_root, all_records):
		return {"ok": false, "code": "RECORD_WRITE_FAILED", "error": "설치 기록(.playforge-store-installations.json)을 저장할 수 없습니다.", "project_modified": true}

	return {
		"ok": true,
		"store_state": "applied_to_project",
		"project_id": project_id,
		"asset_id": str(entry.get("asset_id", "")),
		"release_id": str(entry.get("release_id", "")),
		"written_files": written_files,
		"installation_record": installation_record,
		"project_modified": true,
	}


func stage_6_check_update(installation_record: Dictionary, latest_entry: Dictionary, installed_entry: Dictionary = {}) -> Dictionary:
	if installation_record.is_empty() or str(installation_record.get("status", "")) != "applied":
		return {
			"ok": true,
			"update_available": false,
			"store_state": "saved_to_library",
			"current_release_id": str(installation_record.get("installed_release_id", "")),
			"latest_release_id": str(latest_entry.get("release_id", "")),
			"latest_version": str(latest_entry.get("asset_version_id", "")),
			"project_modified": false,
		}
	if latest_entry.is_empty() or str(latest_entry.get("release_kind", "")) != "package":
		return {
			"ok": true,
			"update_available": false,
			"store_state": "applied_to_project",
			"current_release_id": str(installation_record.get("installed_release_id", "")),
			"latest_release_id": "",
			"latest_version": "",
			"project_modified": false,
		}
	var current_rel := str(installation_record.get("installed_release_id", ""))
	var current_dig := str(installation_record.get("installed_digest", ""))
	var latest_rel := str(latest_entry.get("release_id", ""))
	var latest_dig := str(latest_entry.get("artifact_digest", ""))
	var different_rel := latest_rel != current_rel
	var different_dig := latest_dig != current_dig
	var version_cmp := 1
	if not installed_entry.is_empty() and installed_entry.has("asset_version_id"):
		version_cmp = compare_semver(str(latest_entry.get("asset_version_id", "")), str(installed_entry.get("asset_version_id", "")))
	var has_update := different_rel and version_cmp >= 0 and (version_cmp > 0 or different_dig)
	return {
		"ok": true,
		"update_available": has_update,
		"store_state": "update_available" if has_update else "applied_to_project",
		"asset_id": str(latest_entry.get("asset_id", "")),
		"current_release_id": current_rel,
		"current_digest": current_dig,
		"latest_release_id": latest_rel,
		"latest_version": str(latest_entry.get("asset_version_id", "")),
		"latest_digest": latest_dig,
		"project_modified": false,
	}


static func _detect_strip_prefix(manifest: Array, unpacked: Dictionary) -> String:
	var all_direct := true
	for item in manifest:
		if not unpacked.has(str(item.get("path", ""))):
			all_direct = false
			break
	if all_direct:
		return ""
	var prefixes := {}
	for key in unpacked.keys():
		var parts := str(key).split("/")
		if parts.size() >= 2:
			prefixes[parts[0] + "/"] = true
	if prefixes.size() == 1:
		var candidate := str(prefixes.keys()[0])
		var all_prefixed := true
		for item in manifest:
			if not unpacked.has(candidate + str(item.get("path", ""))):
				all_prefixed = false
				break
		if all_prefixed:
			return candidate
	return ""


static func _remove_dir_recursive(abs_dir: String) -> void:
	if not DirAccess.dir_exists_absolute(abs_dir):
		return
	var dir := DirAccess.open(abs_dir)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry_name := dir.get_next()
	while not entry_name.is_empty():
		if entry_name != "." and entry_name != "..":
			var child := abs_dir.path_join(entry_name)
			if dir.current_is_dir():
				_remove_dir_recursive(child)
			else:
				DirAccess.remove_absolute(child)
		entry_name = dir.get_next()
	dir.list_dir_end()
	DirAccess.remove_absolute(abs_dir)
