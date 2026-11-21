package com.playhub.aos.runtime

data class SemVer(val major: Int, val minor: Int, val patch: Int) : Comparable<SemVer> {
    override fun compareTo(other: SemVer): Int {
        if (major != other.major) return major.compareTo(other.major)
        if (minor != other.minor) return minor.compareTo(other.minor)
        return patch.compareTo(other.patch)
    }

    companion object {
        fun parse(raw: String?): SemVer? {
            val m = Regex("""^\s*(\d+)\.(\d+)(?:\.(\d+))?""").find(raw.orEmpty()) ?: return null
            return SemVer(
                major = m.groupValues[1].toInt(),
                minor = m.groupValues[2].toInt(),
                patch = m.groupValues[3].ifEmpty { "0" }.toInt()
            )
        }
    }
}

enum class CompatibilityReason {
    OK,
    APP_UPDATE_REQUIRED,
    ENGINE_MAJOR_MISMATCH,
    ENGINE_UPDATE_REQUIRED
}

data class VersionCompatibilityResult(
    val compatible: Boolean,
    val reason: CompatibilityReason,
    val badgeText: String?,
    val detailMessage: String?
)

/**
 * Pre-entry game version compatibility checker.
 * Evaluates app versionCode & embedded Godot 4.7.2 engine version BEFORE download or launch
 * so users see clear update guidance instead of runtime crashes.
 */
object VersionCompatibilityChecker {
    fun evaluate(
        runtime: String,
        requiredEngineVersion: String?,
        minAppVersionCode: Int,
        installedEngineVersion: String,
        installedAppVersionCode: Int
    ): VersionCompatibilityResult {
        if (minAppVersionCode > installedAppVersionCode) {
            return VersionCompatibilityResult(
                compatible = false,
                reason = CompatibilityReason.APP_UPDATE_REQUIRED,
                badgeText = "⚠️ 앱 업데이트 필요 (v$minAppVersionCode+)",
                detailMessage = "이 게임은 Play Hub 앱 버전코드 $minAppVersionCode 이상이 필요합니다.\n" +
                    "(현재 설치 버전코드: $installedAppVersionCode)\nPlay Hub 앱을 최신 버전으로 업데이트해 주세요."
            )
        }
        if (runtime == "godot-pck" && !requiredEngineVersion.isNullOrBlank()) {
            val req = SemVer.parse(requiredEngineVersion)
            val cur = SemVer.parse(installedEngineVersion)
            if (req != null && cur != null) {
                if (req.major != cur.major) {
                    return VersionCompatibilityResult(
                        compatible = false,
                        reason = CompatibilityReason.ENGINE_MAJOR_MISMATCH,
                        badgeText = "⚠️ 엔진 비호환 (Godot $requiredEngineVersion)",
                        detailMessage = "이 게임은 Godot $requiredEngineVersion 엔진용으로 빌드되어 현재 내장 엔진(Godot $installedEngineVersion)과 호환되지 않습니다.\n" +
                            "호환되는 Play Hub 앱으로 업데이트하거나 지원되는 버전을 이용해 주세요."
                    )
                }
                if (req > cur) {
                    return VersionCompatibilityResult(
                        compatible = false,
                        reason = CompatibilityReason.ENGINE_UPDATE_REQUIRED,
                        badgeText = "⚠️ 엔진 업데이트 필요 (Godot $requiredEngineVersion)",
                        detailMessage = "이 게임은 Godot $requiredEngineVersion 이상이 필요합니다.\n" +
                            "(현재 앱 내장 엔진: Godot $installedEngineVersion)\nPlay Hub 앱을 업데이트하면 플레이할 수 있습니다."
                    )
                }
            }
        }
        return VersionCompatibilityResult(
            compatible = true,
            reason = CompatibilityReason.OK,
            badgeText = null,
            detailMessage = null
        )
    }
}
