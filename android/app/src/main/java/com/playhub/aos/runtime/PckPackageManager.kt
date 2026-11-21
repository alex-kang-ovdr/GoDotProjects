package com.playhub.aos.runtime

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

data class PckHeaderInfo(
    val formatVersion: Int,
    val engineMajor: Int,
    val engineMinor: Int,
    val enginePatch: Int
)

/**
 * Minimal-footprint on-demand Godot .pck downloader, verifier, and LRU cache manager.
 * Zero starter games are bundled in the APK; games are downloaded on demand and verified before mount.
 */
object PckPackageManager {
    private val GDPC_MAGIC = byteArrayOf('G'.code.toByte(), 'D'.code.toByte(), 'P'.code.toByte(), 'C'.code.toByte())
    const val REQUIRED_ENGINE_MAJOR = 4
    const val REQUIRED_ENGINE_MINOR = 7
    const val DEFAULT_CACHE_LIMIT_BYTES = 1024L * 1024L * 1024L // 1 GiB LRU cap

    fun verifyHeaderBytes(header20: ByteArray): PckHeaderInfo {
        require(header20.size >= 20) { "PCK file too small (${header20.size} bytes)." }
        for (i in 0..3) {
            require(header20[i] == GDPC_MAGIC[i]) { "Invalid PCK magic header (expected GDPC)." }
        }
        val buf = ByteBuffer.wrap(header20, 4, 16).order(ByteOrder.LITTLE_ENDIAN)
        val formatVersion = buf.int
        val major = buf.int
        val minor = buf.int
        val patch = buf.int
        require(formatVersion in 2..4) { "Unsupported PCK format_version=$formatVersion." }
        require(major == REQUIRED_ENGINE_MAJOR && minor <= REQUIRED_ENGINE_MINOR) {
            "Incompatible Godot PCK engine version $major.$minor.$patch (embedded runtime is 4.7.2)."
        }
        return PckHeaderInfo(formatVersion, major, minor, patch)
    }

    fun verifyPckFile(file: File, expectedSha256: String? = null): PckHeaderInfo {
        require(file.isFile && file.length() >= 20L) { "PCK file missing or truncated: ${file.absolutePath}" }
        val header = ByteArray(20)
        FileInputStream(file).use { input ->
            val read = input.read(header)
            require(read == 20) { "Failed to read 20-byte PCK header." }
        }
        val info = verifyHeaderBytes(header)
        if (!expectedSha256.isNullOrBlank()) {
            val actual = sha256Hex(file)
            require(actual.equals(expectedSha256.trim(), ignoreCase = true)) {
                "PCK SHA-256 mismatch: expected=$expectedSha256 actual=$actual"
            }
        }
        return info
    }

    fun sha256Hex(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buf = ByteArray(16384)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun cachedPckFile(filesDir: File, gameId: String, version: String): File {
        val safeId = gameId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val safeVer = version.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return File(File(File(filesDir, "games"), safeId), "$safeVer/game.pck")
    }

    fun downloadAndCache(
        filesDir: File,
        gameId: String,
        version: String,
        downloadUrl: String,
        expectedSha256: String? = null,
        onProgress: (percent: Int) -> Unit = {}
    ): File {
        val target = cachedPckFile(filesDir, gameId, version)
        if (target.isFile) {
            runCatching {
                verifyPckFile(target, expectedSha256)
                target.setLastModified(System.currentTimeMillis())
                onProgress(100)
                return target
            }
            target.delete()
        }

        target.parentFile?.mkdirs()
        val tmp = File(target.parentFile, "game.pck.tmp")
        val conn = (URL(downloadUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 30_000
            requestMethod = "GET"
        }
        try {
            val code = conn.responseCode
            require(code in 200..299) { "HTTP $code downloading PCK from $downloadUrl" }
            val total = conn.contentLengthLong
            var downloaded = 0L
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { output ->
                    val buf = ByteArray(16384)
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        downloaded += n
                        if (total > 0) {
                            onProgress(((downloaded * 100L) / total).toInt().coerceIn(0, 99))
                        }
                    }
                }
            }
            verifyPckFile(tmp, expectedSha256)
            if (target.exists()) target.delete()
            check(tmp.renameTo(target)) { "Failed to commit downloaded PCK to ${target.absolutePath}" }
            evictLruCache(File(filesDir, "games"), DEFAULT_CACHE_LIMIT_BYTES, protectedFile = target)
            onProgress(100)
            return target
        } finally {
            conn.disconnect()
            if (tmp.exists()) tmp.delete()
        }
    }

    fun evictLruCache(gamesRoot: File, limitBytes: Long, protectedFile: File? = null) {
        if (!gamesRoot.isDirectory) return
        val pcks = gamesRoot.walkTopDown().filter { it.isFile && it.name.endsWith(".pck") }.toMutableList()
        var total = pcks.sumOf { it.length() }
        if (total <= limitBytes) return
        pcks.sortBy { it.lastModified() }
        for (file in pcks) {
            if (total <= limitBytes) break
            if (protectedFile != null && file.canonicalPath == protectedFile.canonicalPath) continue
            val len = file.length()
            if (file.delete()) total -= len
        }
    }

    fun totalCachedBytes(filesDir: File): Long {
        val root = File(filesDir, "games")
        if (!root.isDirectory) return 0L
        return root.walkTopDown().filter { it.isFile && it.name.endsWith(".pck") }.sumOf { it.length() }
    }
}
