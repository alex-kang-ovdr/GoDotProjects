package com.playhub.aos.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FarmServerRegistryTest {
    @Test
    fun allowsSelectorOnDebugDevTestOnly() {
        assertTrue(FarmServerRegistry.isSelectorAllowed("debug", true))
        assertTrue(FarmServerRegistry.isSelectorAllowed("dev", true))
        assertTrue(FarmServerRegistry.isSelectorAllowed("test", true))
        assertFalse(FarmServerRegistry.isSelectorAllowed("release", true))
        assertFalse(FarmServerRegistry.isSelectorAllowed("live", true))
        assertFalse(FarmServerRegistry.isSelectorAllowed("release", false))
        assertFalse(FarmServerRegistry.isSelectorAllowed("live", false))
    }

    @Test
    fun resolvesSelectedPresetAndCustomUrlInDev() {
        val preset = FarmServerRegistry.resolveActiveCluster(
            buildStage = "dev",
            allowFlag = true,
            defaultBaseUrl = "http://10.0.2.2:18130",
            selectedFarmId = "qa-farm",
            customUrl = null
        )
        assertEquals("qa-farm", preset.id)
        assertEquals("https://qa-farm.playhub.example.com", preset.baseUrl)

        val custom = FarmServerRegistry.resolveActiveCluster(
            buildStage = "test",
            allowFlag = true,
            defaultBaseUrl = "https://test.playhub.example.com",
            selectedFarmId = FarmServerRegistry.CUSTOM_FARM_ID,
            customUrl = "https://demo.trycloudflare.com/"
        )
        assertEquals("custom", custom.id)
        assertEquals("https://demo.trycloudflare.com", custom.baseUrl)
    }

    @Test
    fun releaseAndLiveAlwaysIgnoreOverrides() {
        val rel = FarmServerRegistry.resolveActiveCluster(
            buildStage = "release",
            allowFlag = false,
            defaultBaseUrl = "https://staging.playhub.example.com",
            selectedFarmId = "dev-farm-1",
            customUrl = "https://evil.example.com"
        )
        assertEquals("https://staging.playhub.example.com", rel.baseUrl)

        val live = FarmServerRegistry.resolveActiveCluster(
            buildStage = "live",
            allowFlag = true, // even if misconfigured, LOCKED_STAGES rejects it
            defaultBaseUrl = "https://playhub.example.com",
            selectedFarmId = FarmServerRegistry.CUSTOM_FARM_ID,
            customUrl = "https://demo.trycloudflare.com"
        )
        assertEquals("https://playhub.example.com", live.baseUrl)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsNonHttpCustomUrl() {
        FarmServerRegistry.normalizeCustomUrl("file:///etc/passwd")
    }
}
