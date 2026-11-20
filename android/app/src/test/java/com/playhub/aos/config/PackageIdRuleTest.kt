package com.playhub.aos.config

import org.junit.Assert.assertEquals
import org.junit.Test

class PackageIdRuleTest {
    @Test
    fun trunkBranchesMapToGamedevAllFiveConfigs() {
        assertEquals("com.playhub.gamedev.debug", PackageIdRule.format("PlayHub-Platform", "debug"))
        assertEquals("com.playhub.gamedev.dev", PackageIdRule.format("PlayHub-Platform", "dev"))
        assertEquals("com.playhub.gamedev.test", PackageIdRule.format("main", "test"))
        assertEquals("com.playhub.gamedev.release", PackageIdRule.format("PlayHub-Platform", "release"))
        assertEquals("com.playhub.gamedev.live", PackageIdRule.format("PlayHub-Platform", "live"))
    }

    @Test
    fun featureBranchSanitizesIntoThirdSegment() {
        assertEquals("com.playhub.hub_aos.debug", PackageIdRule.format("Hub-AOS", "debug"))
        assertEquals("com.playhub.hub_aos.dev", PackageIdRule.format("Hub-AOS", "dev"))
        assertEquals("com.playhub.hub_aos.test", PackageIdRule.format("Hub-AOS", "test"))
        assertEquals("com.playhub.hub_aos.release", PackageIdRule.format("Hub-AOS", "release"))
        assertEquals("com.playhub.b_123_feat_x.dev", PackageIdRule.format("123/feat-X", "dev"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun featureBranchCannotBuildLive() {
        PackageIdRule.format("Hub-AOS", "live")
    }

    @Test(expected = IllegalArgumentException::class)
    fun unknownBuildConfigThrows() {
        PackageIdRule.format("Hub-AOS", "staging")
    }
}
