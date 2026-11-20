package com.playhub.aos.compliance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgeGatePolicyTest {
    @Test
    fun koreaUsesUnder14ChildAnd19Adult() {
        // 2026-11: born 2013-05 -> 13 yrs -> CHILD_PROTECTED in KR
        assertEquals(AgeTier.CHILD_PROTECTED, AgeGatePolicy.classify(2013, 5, 2026, 11, "KR"))
        // born 2012-05 -> 14 yrs -> TEEN_MINOR in KR
        assertEquals(AgeTier.TEEN_MINOR, AgeGatePolicy.classify(2012, 5, 2026, 11, "KR"))
        // born 2008-05 -> 18 yrs -> still TEEN_MINOR in KR (<19)
        assertEquals(AgeTier.TEEN_MINOR, AgeGatePolicy.classify(2008, 5, 2026, 11, "KR"))
        // born 2007-05 -> 19 yrs -> ADULT in KR
        assertEquals(AgeTier.ADULT, AgeGatePolicy.classify(2007, 5, 2026, 11, "KR"))
    }

    @Test
    fun usCoppaUsesUnder13ChildAnd18Adult() {
        assertEquals(AgeTier.CHILD_PROTECTED, AgeGatePolicy.classify(2014, 1, 2026, 11, "US"))
        assertEquals(AgeTier.TEEN_MINOR, AgeGatePolicy.classify(2013, 1, 2026, 11, "US"))
        assertEquals(AgeTier.ADULT, AgeGatePolicy.classify(2008, 1, 2026, 11, "US"))
    }

    @Test
    fun guestAdultCanPlayAllAnd18PlusButNeedsLoginForIapAndChat() {
        val caps = AgeGatePolicy.evaluateCapabilities(
            tier = AgeTier.ADULT,
            isGuest = true,
            parentalConsentVerified = false,
            gameRating = GameAgeRating.AGE_18
        )
        assertTrue(caps.canPlayGame)
        assertFalse(caps.canPurchaseIap)
        assertTrue(caps.requiresGoogleLoginForIap)
        assertFalse(caps.canUseFreeChat)
        assertFalse(caps.disablePersonalizedAds)
    }

    @Test
    fun childProtectedEnforcesStrictRestrictions() {
        val childNoConsent = AgeGatePolicy.evaluateCapabilities(
            tier = AgeTier.CHILD_PROTECTED,
            isGuest = true,
            parentalConsentVerified = false,
            gameRating = GameAgeRating.AGE_12
        )
        assertFalse(childNoConsent.canPlayGame)
        assertFalse(childNoConsent.canUseFreeChat)
        assertFalse(childNoConsent.canPurchaseIap)
        assertTrue(childNoConsent.requiresParentalConsent)
        assertTrue(childNoConsent.disablePersonalizedAds)

        assertTrue(AgeGatePolicy.canPlayRating(AgeTier.CHILD_PROTECTED, GameAgeRating.ALL, false))
        assertTrue(AgeGatePolicy.canPlayRating(AgeTier.CHILD_PROTECTED, GameAgeRating.AGE_12, true))
        assertFalse(AgeGatePolicy.canPlayRating(AgeTier.CHILD_PROTECTED, GameAgeRating.AGE_15, true))
    }
}
