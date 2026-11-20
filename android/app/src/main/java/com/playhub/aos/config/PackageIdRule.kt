package com.playhub.aos.config

import java.util.Locale

/**
 * Deterministic 4-segment Android Package ID rule:
 *   com.playhub.<branchSegment>.<buildConfig>
 * where buildConfig is one of: debug | dev | test | release | live.
 */
object PackageIdRule {
    val VALID_CONFIGS = setOf("debug", "dev", "test", "release", "live")
    private val TRUNK_BRANCHES = setOf("PlayHub-Platform", "main", "master", "HEAD")

    fun sanitizeBranch(rawBranch: String?): String {
        val trimmed = rawBranch?.trim().orEmpty()
        if (trimmed.isEmpty() || trimmed in TRUNK_BRANCHES) return "gamedev"
        var clean = trimmed
            .lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]+"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')
        if (clean.isEmpty()) return "gamedev"
        if (clean.first().isDigit()) clean = "b_$clean"
        if (clean.length > 32) clean = clean.substring(0, 32).trimEnd('_')
        return clean.ifEmpty { "gamedev" }
    }

    fun format(rawBranch: String?, buildConfig: String): String {
        val cfg = buildConfig.trim().lowercase(Locale.ROOT)
        require(cfg in VALID_CONFIGS) { "Unsupported buildConfig '$buildConfig'. Expected one of $VALID_CONFIGS." }
        val branchSegment = sanitizeBranch(rawBranch)
        require(!(cfg == "live" && branchSegment != "gamedev")) {
            "Live build is restricted to trunk (gamedev), cannot use branch '$branchSegment'."
        }
        return "com.playhub.$branchSegment.$cfg"
    }
}
