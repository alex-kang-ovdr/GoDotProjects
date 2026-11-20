package com.playhub.aos.compliance

import java.util.Locale

enum class AgeTier {
    UNKNOWN,
    CHILD_PROTECTED, // KR < 14, Global/US < 13, EU < 13..16
    TEEN_MINOR,      // 14..18 (KR) or 13..17 (Global)
    ADULT            // 19+ (KR) or 18+ (Global)
}

enum class GameAgeRating(val minAge: Int, val code: String) {
    ALL(0, "ALL"),
    AGE_12(12, "12+"),
    AGE_15(15, "15+"),
    AGE_18(18, "18+");

    companion object {
        fun fromCode(code: String?): GameAgeRating = when (code?.uppercase(Locale.ROOT)) {
            "12+" -> AGE_12
            "15+" -> AGE_15
            "18+" -> AGE_18
            else -> ALL
        }
    }
}

data class UserCapabilities(
    val canPlayGame: Boolean,
    val canUseFreeChat: Boolean,
    val canUseQuickChatOnly: Boolean,
    val canPurchaseIap: Boolean,
    val requiresGoogleLoginForIap: Boolean,
    val requiresParentalConsent: Boolean,
    val disablePersonalizedAds: Boolean
)

/**
 * Neutral Age Gate & youth protection policy (KR PIPA/Game Industry Act, US COPPA, EU GDPR-K, Google Play Families).
 */
object AgeGatePolicy {
    private val EU_CHILD_AGE_16 = setOf("DE", "NL", "PL", "IE", "SK", "HR", "HU", "LT", "LU")

    fun childThresholdForRegion(regionCode: String): Int {
        return when (regionCode.uppercase(Locale.ROOT)) {
            "KR" -> 14
            in EU_CHILD_AGE_16 -> 16
            else -> 13
        }
    }

    fun adultThresholdForRegion(regionCode: String): Int {
        return if (regionCode.equals("KR", ignoreCase = true)) 19 else 18
    }

    fun computeAgeYears(birthYear: Int, birthMonth: Int, nowYear: Int, nowMonth: Int): Int {
        require(birthMonth in 1..12 && nowMonth in 1..12) { "Month must be 1..12" }
        val diff = nowYear - birthYear
        return if (nowMonth < birthMonth) diff - 1 else diff
    }

    fun classify(birthYear: Int, birthMonth: Int, nowYear: Int, nowMonth: Int, regionCode: String): AgeTier {
        val age = computeAgeYears(birthYear, birthMonth, nowYear, nowMonth)
        if (age < 0 || age > 120) return AgeTier.UNKNOWN
        val childLimit = childThresholdForRegion(regionCode)
        val adultLimit = adultThresholdForRegion(regionCode)
        return when {
            age < childLimit -> AgeTier.CHILD_PROTECTED
            age < adultLimit -> AgeTier.TEEN_MINOR
            else -> AgeTier.ADULT
        }
    }

    fun canPlayRating(tier: AgeTier, rating: GameAgeRating, parentalConsentVerified: Boolean): Boolean {
        return when (tier) {
            AgeTier.UNKNOWN -> rating == GameAgeRating.ALL
            AgeTier.CHILD_PROTECTED -> rating == GameAgeRating.ALL || (parentalConsentVerified && rating == GameAgeRating.AGE_12)
            AgeTier.TEEN_MINOR -> rating != GameAgeRating.AGE_18
            AgeTier.ADULT -> true
        }
    }

    fun evaluateCapabilities(
        tier: AgeTier,
        isGuest: Boolean,
        parentalConsentVerified: Boolean,
        gameRating: GameAgeRating = GameAgeRating.ALL
    ): UserCapabilities {
        val isChild = tier == AgeTier.CHILD_PROTECTED || tier == AgeTier.UNKNOWN
        return UserCapabilities(
            canPlayGame = canPlayRating(tier, gameRating, parentalConsentVerified),
            canUseFreeChat = !isChild && !isGuest,
            canUseQuickChatOnly = isChild && parentalConsentVerified && !isGuest,
            canPurchaseIap = !isGuest && (!isChild || parentalConsentVerified),
            requiresGoogleLoginForIap = isGuest,
            requiresParentalConsent = isChild && !parentalConsentVerified,
            disablePersonalizedAds = isChild
        )
    }
}
