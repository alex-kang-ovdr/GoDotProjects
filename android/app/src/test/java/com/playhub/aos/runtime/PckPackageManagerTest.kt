package com.playhub.aos.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files

class PckPackageManagerTest {
    private fun fakePckBytes(formatVer: Int, major: Int, minor: Int, patch: Int): ByteArray {
        val buf = ByteBuffer.allocate(32).order(ByteOrder.LITTLE_ENDIAN)
        buf.put('G'.code.toByte()).put('D'.code.toByte()).put('P'.code.toByte()).put('C'.code.toByte())
        buf.putInt(formatVer).putInt(major).putInt(minor).putInt(patch)
        return buf.array()
    }

    @Test
    fun acceptsValidGodot47PckAndSha256() {
        val tmp = Files.createTempFile("playhub-test-", ".pck").toFile()
        try {
            tmp.writeBytes(fakePckBytes(2, 4, 7, 2))
            val sha = PckPackageManager.sha256Hex(tmp)
            val info = PckPackageManager.verifyPckFile(tmp, sha)
            assertEquals(2, info.formatVersion)
            assertEquals(4, info.engineMajor)
            assertEquals(7, info.engineMinor)
        } finally {
            tmp.delete()
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsFutureEngineMinorVersion() {
        PckPackageManager.verifyHeaderBytes(fakePckBytes(2, 4, 8, 0))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidMagic() {
        PckPackageManager.verifyHeaderBytes(ByteArray(24) { 0x41 })
    }

    @Test
    fun evictsOldestPcksOverLimitWhileKeepingProtected() {
        val dir = Files.createTempDirectory("playhub-lru-").toFile()
        try {
            val f1 = File(dir, "a.pck").apply { writeBytes(ByteArray(100)); setLastModified(1000L) }
            val f2 = File(dir, "b.pck").apply { writeBytes(ByteArray(100)); setLastModified(2000L) }
            val f3 = File(dir, "c.pck").apply { writeBytes(ByteArray(100)); setLastModified(3000L) }
            PckPackageManager.evictLruCache(dir, limitBytes = 200L, protectedFile = f1)
            assertTrue(f1.exists())
            assertFalse(f2.exists())
            assertTrue(f3.exists())
        } finally {
            dir.deleteRecursively()
        }
    }
}
