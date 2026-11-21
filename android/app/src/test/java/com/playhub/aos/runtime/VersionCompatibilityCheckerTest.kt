package com.playhub.aos.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionCompatibilityCheckerTest {
    @Test
    fun allowsMatchingOrOlderGodot47Game() {
        val exact = VersionCompatibilityChecker.evaluate("godot-pck", "4.7.2", 1, "4.7.2", 1)
        assertTrue(exact.compatible)
        assertEquals(CompatibilityReason.OK, exact.reason)

        val older = VersionCompatibilityChecker.evaluate("godot-pck", "4.6.3", 1, "4.7.2", 1)
        assertTrue(older.compatible)
    }

    @Test
    fun blocksNewerGodotMinorOrPatchBeforeEntry() {
        val newerMinor = VersionCompatibilityChecker.evaluate("godot-pck", "4.8.0", 1, "4.7.2", 1)
        assertFalse(newerMinor.compatible)
        assertEquals(CompatibilityReason.ENGINE_UPDATE_REQUIRED, newerMinor.reason)
        assertTrue(newerMinor.badgeText!!.contains("4.8.0"))
        assertTrue(newerMinor.detailMessage!!.contains("4.7.2"))

        val newerPatch = VersionCompatibilityChecker.evaluate("godot-pck", "4.7.5", 1, "4.7.2", 1)
        assertFalse(newerPatch.compatible)
        assertEquals(CompatibilityReason.ENGINE_UPDATE_REQUIRED, newerPatch.reason)
    }

    @Test
    fun blocksMajorMismatchAndAppVersionBeforeEntry() {
        val major = VersionCompatibilityChecker.evaluate("godot-pck", "5.0.0", 1, "4.7.2", 1)
        assertFalse(major.compatible)
        assertEquals(CompatibilityReason.ENGINE_MAJOR_MISMATCH, major.reason)

        val appOld = VersionCompatibilityChecker.evaluate("web", null, 5, "4.7.2", 1)
        assertFalse(appOld.compatible)
        assertEquals(CompatibilityReason.APP_UPDATE_REQUIRED, appOld.reason)
        assertTrue(appOld.detailMessage!!.contains("5"))
    }
}
