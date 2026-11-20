package com.playhub.aos.network

import com.playhub.aos.compliance.GameAgeRating
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class MobileTokens(
    val accessToken: String,
    val refreshToken: String,
    val principalId: String,
    val displayName: String,
    val handle: String,
    val isGuest: Boolean,
    val ageTier: String
)

data class RemoteGameItem(
    val id: String,
    val title: String,
    val description: String,
    val genre: String,
    val runtime: String,
    val buildId: String,
    val ageRating: GameAgeRating,
    val allowed: Boolean,
    val entryUrl: String,
    val pckUrl: String?,
    val pckBytes: Long,
    val requiredEngineVersion: String?,
    val minAppVersionCode: Int
)

data class CloudSaveResult(
    val revision: Int,
    val etag: String?,
    val payloadJson: String
)

/**
 * Zero-dependency PlayHub Mobile HTTP client (HttpURLConnection + MiniJson).
 * Preserves minimal APK DEX footprint (~0.25 MiB total app code).
 */
class PlayHubApiClient(private val baseUrl: String) {
    private val normalizedBase = baseUrl.trimEnd('/')

    fun createGuestSession(): MobileTokens {
        val resp = request("POST", "/api/mobile/auth/guest", bodyJson = "{}")!!
        return parseTokenResponse(resp.body)
    }

    fun submitAgeGate(accessToken: String, birthYear: Int, birthMonth: Int, regionCode: String): Map<String, Any?> {
        val payload = MiniJson.stringify(
            mapOf("birthYear" to birthYear, "birthMonth" to birthMonth, "regionCode" to regionCode)
        )
        return request("POST", "/api/mobile/age-gate", token = accessToken, bodyJson = payload)!!.body
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchCatalog(
        accessToken: String?,
        engineVersion: String = "4.7.2",
        appVersionCode: Int = 1
    ): List<RemoteGameItem> {
        val resp = request(
            "GET",
            "/api/mobile/catalog",
            token = accessToken,
            headers = mapOf(
                "X-PlayHub-Engine-Version" to engineVersion,
                "X-PlayHub-App-Version-Code" to appVersionCode.toString()
            )
        )!!
        val arr = resp.body["games"] as? List<*> ?: return emptyList()
        val items = mutableListOf<RemoteGameItem>()
        for (entry in arr) {
            val g = entry as? Map<String, Any?> ?: continue
            val id = g["id"] as? String ?: continue
            val androidObj = g["android"] as? Map<String, Any?>
            val rawEntry = g["entryUrl"] as? String ?: ""
            val rawPck = (androidObj?.get("pckUrl") as? String)?.takeIf { it.isNotBlank() }
            items += RemoteGameItem(
                id = id,
                title = g["title"] as? String ?: id,
                description = g["description"] as? String ?: "",
                genre = g["genre"] as? String ?: "action",
                runtime = g["runtime"] as? String ?: "web",
                buildId = g["buildId"] as? String ?: "1.0.0",
                ageRating = GameAgeRating.fromCode(g["ageRating"] as? String),
                allowed = g["allowed"] as? Boolean ?: true,
                entryUrl = resolveUrl(rawEntry),
                pckUrl = rawPck?.let { resolveUrl(it) },
                pckBytes = (androidObj?.get("pckBytes") as? Number)?.toLong() ?: 0L,
                requiredEngineVersion = androidObj?.get("engineVersion") as? String,
                minAppVersionCode = (androidObj?.get("minAppVersionCode") as? Number)?.toInt() ?: 1
            )
        }
        return items
    }

    fun createPlaySession(accessToken: String, gameId: String): Map<String, Any?> {
        val payload = MiniJson.stringify(mapOf("gameId" to gameId))
        return request("POST", "/api/mobile/play-sessions", token = accessToken, bodyJson = payload)!!.body
    }

    fun loadCloudSave(accessToken: String, gameId: String, slot: String = "main"): CloudSaveResult? {
        val resp = request("GET", "/api/mobile/saves/$gameId?slot=$slot", token = accessToken, allowNotFound = true)
            ?: return null
        return CloudSaveResult(
            revision = (resp.body["revision"] as? Number)?.toInt() ?: 0,
            etag = resp.etag,
            payloadJson = MiniJson.stringify(resp.body["payload"] ?: emptyMap<String, Any>())
        )
    }

    fun writeCloudSave(
        accessToken: String,
        gameId: String,
        payloadJson: String,
        expectedEtag: String?,
        slot: String = "main"
    ): CloudSaveResult {
        val headers = mutableMapOf<String, String>()
        if (expectedEtag.isNullOrBlank()) headers["If-None-Match"] = "*"
        else headers["If-Match"] = expectedEtag
        val body = """{"schemaVersion":1,"payload":$payloadJson}"""
        val resp = request("PUT", "/api/mobile/saves/$gameId?slot=$slot", token = accessToken, headers = headers, bodyJson = body)!!
        return CloudSaveResult(
            revision = (resp.body["revision"] as? Number)?.toInt() ?: 1,
            etag = resp.etag,
            payloadJson = payloadJson
        )
    }

    private fun resolveUrl(pathOrUrl: String): String {
        if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
        return "$normalizedBase/${pathOrUrl.trimStart('/')}"
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseTokenResponse(obj: Map<String, Any?>): MobileTokens {
        val prof = obj["profile"] as? Map<String, Any?> ?: emptyMap()
        val comp = prof["ageCompliance"] as? Map<String, Any?> ?: emptyMap()
        return MobileTokens(
            accessToken = obj["accessToken"] as? String ?: "",
            refreshToken = obj["refreshToken"] as? String ?: "",
            principalId = prof["principalId"] as? String ?: "",
            displayName = prof["displayName"] as? String ?: "게스트 플레이어",
            handle = prof["handle"] as? String ?: "@guest",
            isGuest = prof["isGuest"] as? Boolean ?: true,
            ageTier = comp["ageTier"] as? String ?: "UNKNOWN"
        )
    }

    private data class HttpResp(val code: Int, val etag: String?, val body: Map<String, Any?>)

    @Suppress("UNCHECKED_CAST")
    private fun request(
        method: String,
        path: String,
        token: String? = null,
        headers: Map<String, String> = emptyMap(),
        bodyJson: String? = null,
        allowNotFound: Boolean = false
    ): HttpResp? {
        val conn = (URL("$normalizedBase$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 6_000
            readTimeout = 10_000
            setRequestProperty("Accept", "application/json")
            if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            for ((k, v) in headers) setRequestProperty(k, v)
            if (bodyJson != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (bodyJson != null) {
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(bodyJson) }
            }
            val code = conn.responseCode
            if (allowNotFound && code == 404) return null
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val raw = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use { r -> r.readText() } }.orEmpty()
            val parsed = if (raw.isNotBlank()) runCatching { MiniJson.parseObject(raw) }.getOrDefault(emptyMap()) else emptyMap()
            if (code !in 200..299) {
                val errObj = parsed["error"] as? Map<String, Any?>
                val errCode = errObj?.get("code") as? String ?: "HTTP_$code"
                val errMsg = errObj?.get("message") as? String ?: errCode
                throw IllegalStateException("$errCode: $errMsg")
            }
            return HttpResp(code, conn.getHeaderField("ETag"), parsed)
        } finally {
            conn.disconnect()
        }
    }
}
