package com.playhub.aos.auth

import android.content.Context
import com.playhub.aos.compliance.AgeTier
import com.playhub.aos.network.MobileTokens
import java.util.UUID

data class AuthProfile(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val isGuest: Boolean,
    val ageTier: AgeTier,
    val regionCode: String,
    val parentalConsentVerified: Boolean,
    val coinBalance: Long,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val authProvider: String = if (isGuest) "guest" else "registered"
)

/**
 * Lightweight local session & compliance store for Main Process only.
 * Never accessed directly by :godot_runtime or :web_runtime processes.
 */
class AuthSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("playhub_session_v1", Context.MODE_PRIVATE)

    fun loadOrCreateGuest(): AuthProfile {
        val principalId = prefs.getString("principal_id", null) ?: run {
            val id = "guest-${UUID.randomUUID().toString().replace("-", "").take(12)}"
            prefs.edit().putString("principal_id", id).apply()
            id
        }
        val isGuest = prefs.getBoolean("is_guest", true)
        val displayName = prefs.getString("display_name", null) ?: if (isGuest) "게스트 플레이어" else "PlayHub 유저"
        val handle = prefs.getString("handle", null) ?: "@guest#${principalId.takeLast(4)}"
        val tierName = prefs.getString("age_tier", AgeTier.UNKNOWN.name) ?: AgeTier.UNKNOWN.name
        val tier = runCatching { AgeTier.valueOf(tierName) }.getOrDefault(AgeTier.UNKNOWN)
        val regionCode = prefs.getString("region_code", "KR") ?: "KR"
        val consent = prefs.getBoolean("parental_consent", false)
        val coins = prefs.getLong("coin_balance", 0L)
        val access = prefs.getString("access_token", null)
        val refresh = prefs.getString("refresh_token", null)
        val authProvider = prefs.getString("auth_provider", null) ?: if (isGuest) "guest" else "registered"
        return AuthProfile(principalId, displayName, handle, isGuest, tier, regionCode, consent, coins, access, refresh, authProvider)
    }

    fun isAgeGateCompleted(): Boolean = prefs.getBoolean("age_gate_done", false)

    fun saveAgeCompliance(tier: AgeTier, regionCode: String) {
        // Minimize child PII: store only age tier & region, never raw birth date for CHILD_PROTECTED.
        prefs.edit()
            .putBoolean("age_gate_done", true)
            .putString("age_tier", tier.name)
            .putString("region_code", regionCode)
            .apply()
    }

    fun lastAuthProvider(): String? = prefs.getString("last_auth_provider", null)

    fun saveRemoteTokens(tokens: MobileTokens) {
        prefs.edit()
            .putString("principal_id", tokens.principalId)
            .putString("display_name", tokens.displayName)
            .putString("handle", tokens.handle)
            .putBoolean("is_guest", tokens.isGuest)
            .putString("auth_provider", tokens.authProvider)
            .putString("last_auth_provider", tokens.authProvider)
            .putString("access_token", tokens.accessToken)
            .putString("refresh_token", tokens.refreshToken)
            .apply()
    }

    fun clearRemoteTokensForFarmSwitch() {
        prefs.edit()
            .remove("access_token")
            .remove("refresh_token")
            .apply()
    }
}
