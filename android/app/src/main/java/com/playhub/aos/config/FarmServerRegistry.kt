package com.playhub.aos.config

import android.content.Context
import java.net.URI
import java.util.Locale

data class FarmCluster(
    val id: String,
    val label: String,
    val baseUrl: String
)

/**
 * Farm server cluster selector.
 * - Enabled ONLY on non-production stages: debug | dev | test.
 * - Strictly disabled (compile-time & runtime fail-closed) on release | live.
 */
object FarmServerRegistry {
    private val LOCKED_STAGES = setOf("release", "live")
    private val LIVE_HOST_PATTERNS = listOf(
        Regex("(^|\\.)live\\.playhub\\..*", RegexOption.IGNORE_CASE),
        Regex("(^|\\.)playhub-live-[a-z0-9-]+\\..*", RegexOption.IGNORE_CASE),
        Regex("^playhub\\.example\\.com$", RegexOption.IGNORE_CASE)
    )
    const val CUSTOM_FARM_ID = "custom"

    val PRESET_FARMS: List<FarmCluster> = listOf(
        FarmCluster("local", "Local / Emulator (10.0.2.2:18130)", "http://10.0.2.2:18130"),
        FarmCluster("dev-farm-1", "Dev Farm 1", "https://dev-farm1.playhub.example.com"),
        FarmCluster("dev-farm-2", "Dev Farm 2", "https://dev-farm2.playhub.example.com"),
        FarmCluster("qa-farm", "QA Farm", "https://qa-farm.playhub.example.com"),
        FarmCluster("staging-farm", "Staging Farm", "https://staging-farm.playhub.example.com")
    )

    fun isSelectorAllowed(buildStage: String, allowFlag: Boolean): Boolean {
        val stage = buildStage.trim().lowercase(Locale.ROOT)
        return allowFlag && stage !in LOCKED_STAGES
    }

    fun isBlockedLiveHost(host: String): Boolean {
        val normalized = host.trim().lowercase(Locale.ROOT)
        if (normalized.isEmpty()) return false
        return LIVE_HOST_PATTERNS.any { it.matches(normalized) }
    }

    fun normalizeCustomUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim().trimEnd('/')
        require(trimmed.isNotEmpty()) { "서버 URL을 입력해 주세요." }
        val uri = URI(trimmed)
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        require(scheme == "https" || scheme == "http") { "http:// 또는 https:// 주소만 허용됩니다." }
        val host = uri.host
        require(!host.isNullOrBlank()) { "올바른 호스트 주소가 필요합니다." }
        require(!isBlockedLiveHost(host)) { "개발 빌드에서는 Live 서버에 직접 연결할 수 없습니다. Dev Farm을 선택해 주세요." }
        return trimmed
    }

    fun resolveActiveCluster(
        buildStage: String,
        allowFlag: Boolean,
        defaultBaseUrl: String,
        selectedFarmId: String?,
        customUrl: String?
    ): FarmCluster {
        val fallback = FarmCluster(
            id = buildStage.lowercase(Locale.ROOT),
            label = buildStage.uppercase(Locale.ROOT),
            baseUrl = defaultBaseUrl.trimEnd('/')
        )
        if (!isSelectorAllowed(buildStage, allowFlag)) {
            return fallback
        }
        if (selectedFarmId == CUSTOM_FARM_ID && !customUrl.isNullOrBlank()) {
            val valid = runCatching { normalizeCustomUrl(customUrl) }.getOrNull()
            if (valid != null) {
                return FarmCluster(CUSTOM_FARM_ID, "Custom Farm", valid)
            }
        }
        val preset = PRESET_FARMS.find { it.id == selectedFarmId }
        return preset ?: fallback
    }

    /**
     * Returns all Farm clusters to display in the Farm selector UI:
     * active/custom cluster and build default cluster (if distinct) followed by presets,
     * deduplicated by normalized baseUrl.
     */
    fun selectableClusters(
        buildStage: String,
        defaultBaseUrl: String,
        activeFarm: FarmCluster
    ): List<FarmCluster> {
        val result = mutableListOf<FarmCluster>()
        val seenUrls = mutableSetOf<String>()

        fun addUnique(cluster: FarmCluster) {
            val key = cluster.baseUrl.trim().trimEnd('/').lowercase(Locale.ROOT)
            if (key.isNotEmpty() && seenUrls.add(key)) {
                result.add(cluster)
            }
        }

        addUnique(activeFarm)
        val defaultCluster = FarmCluster(
            id = buildStage.trim().lowercase(Locale.ROOT),
            label = "Default (${buildStage.trim().uppercase(Locale.ROOT)})",
            baseUrl = defaultBaseUrl.trim().trimEnd('/')
        )
        addUnique(defaultCluster)
        for (preset in PRESET_FARMS) {
            addUnique(preset)
        }
        return result
    }

    fun loadActive(context: Context, buildStage: String, allowFlag: Boolean, defaultBaseUrl: String): FarmCluster {
        if (!isSelectorAllowed(buildStage, allowFlag)) {
            return resolveActiveCluster(buildStage, allowFlag, defaultBaseUrl, null, null)
        }
        val prefs = context.getSharedPreferences("playhub_farm_v1", Context.MODE_PRIVATE)
        return resolveActiveCluster(
            buildStage = buildStage,
            allowFlag = allowFlag,
            defaultBaseUrl = defaultBaseUrl,
            selectedFarmId = prefs.getString("selected_farm_id", null),
            customUrl = prefs.getString("custom_farm_url", null)
        )
    }

    fun saveSelection(context: Context, buildStage: String, allowFlag: Boolean, farmId: String, customUrl: String? = null) {
        check(isSelectorAllowed(buildStage, allowFlag)) {
            "Farm selection is locked in '$buildStage' build."
        }
        val normalizedCustom = if (farmId == CUSTOM_FARM_ID) normalizeCustomUrl(customUrl.orEmpty()) else null
        context.getSharedPreferences("playhub_farm_v1", Context.MODE_PRIVATE).edit()
            .putString("selected_farm_id", farmId)
            .apply {
                if (normalizedCustom != null) putString("custom_farm_url", normalizedCustom)
            }
            .apply()
    }
}
