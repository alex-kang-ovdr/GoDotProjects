/**
 * Generates the GDScript header used by ported projects' tests/verify_and_capture.gd
 * to locate the converter `reports/` directory without hard-coded absolute paths.
 *
 * Resolution order (evaluated at Godot runtime):
 *   1. user cmdline arg `--reports-dir=<path>` (pass after `--`)
 *   2. env `CONVERTER_ROOT` -> `<CONVERTER_ROOT>/reports`
 *   3. `res://../../reports` (ported/<game>/ -> tools/UnityConverter/reports)
 */
export function reportsPathsGd(screenshotSubdir, reportFile) {
  const shotExpr = screenshotSubdir
    ? `_reports_dir().path_join("screenshots/${screenshotSubdir}")`
    : `_reports_dir().path_join("screenshots")`;
  return `## Reports dir: --reports-dir=<path> (user args) > CONVERTER_ROOT env > res://../../reports
static func _reports_dir() -> String:
\tfor arg in OS.get_cmdline_user_args():
\t\tif arg.begins_with("--reports-dir="):
\t\t\tvar dir := arg.trim_prefix("--reports-dir=")
\t\t\tif dir != "":
\t\t\t\treturn dir
\tvar root := OS.get_environment("CONVERTER_ROOT")
\tif root != "":
\t\treturn root.path_join("reports")
\treturn ProjectSettings.globalize_path("res://").path_join("../../reports").simplify_path()

var SCREENSHOT_DIR: String = ${shotExpr}
var REPORT_PATH: String = _reports_dir().path_join("${reportFile}")`;
}
