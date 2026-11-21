package com.playhub.aos.config

import java.net.HttpURLConnection
import java.net.URL

enum class FarmHealthStatus(
    val shortTag: String,
    val labelKo: String,
    val colorHex: String,
    val badgeBgHex: String,
    val badgeTextHex: String
) {
    CHECKING(
        shortTag = "...",
        labelKo = "측정 중",
        colorHex = "#64748B",
        badgeBgHex = "#1E293B",
        badgeTextHex = "#CBD5E1"
    ),
    GREEN(
        shortTag = "GREEN",
        labelKo = "원활",
        colorHex = "#22C55E",
        badgeBgHex = "#14532D",
        badgeTextHex = "#86EFAC"
    ),
    YELLOW(
        shortTag = "YELLOW",
        labelKo = "보통",
        colorHex = "#EAB308",
        badgeBgHex = "#422006",
        badgeTextHex = "#FDE047"
    ),
    ORANGE(
        shortTag = "ORANGE",
        labelKo = "지연",
        colorHex = "#F97316",
        badgeBgHex = "#431407",
        badgeTextHex = "#FDBA74"
    ),
    RED(
        shortTag = "RED",
        labelKo = "접속 불가",
        colorHex = "#EF4444",
        badgeBgHex = "#450A0A",
        badgeTextHex = "#FCA5A5"
    )
}

data class FarmHealthResult(
    val status: FarmHealthStatus,
    val latencyMs: Long? = null,
    val httpCode: Int? = null,
    val errorMessage: String? = null
) {
    fun badgeLabel(): String = when (status) {
        FarmHealthStatus.CHECKING -> "측정 중..."
        FarmHealthStatus.RED -> if (httpCode != null) "RED · HTTP $httpCode" else "RED · 접속 불가"
        FarmHealthStatus.GREEN,
        FarmHealthStatus.YELLOW,
        FarmHealthStatus.ORANGE -> "${status.shortTag} · ${latencyMs ?: 0}ms"
    }

    fun compactPillText(): String = when (status) {
        FarmHealthStatus.CHECKING -> "..."
        FarmHealthStatus.RED -> "접속불가"
        FarmHealthStatus.GREEN,
        FarmHealthStatus.YELLOW,
        FarmHealthStatus.ORANGE -> "${latencyMs ?: 0}ms"
    }

    fun summaryLine(): String = when (status) {
        FarmHealthStatus.CHECKING -> "측정 중..."
        FarmHealthStatus.RED -> if (httpCode != null) "RED · 접속 불가 (HTTP $httpCode)" else "RED · 접속 불가"
        FarmHealthStatus.GREEN,
        FarmHealthStatus.YELLOW,
        FarmHealthStatus.ORANGE -> "${status.shortTag} · ${latencyMs ?: 0}ms (${status.labelKo})"
    }
}

/**
 * Probes Farm server cluster reachability & RTT latency via GET /api/health.
 * Classification:
 * - RED: unreachable / timeout / network error / non-2xx HTTP status
 * - GREEN: reachable and latency < 200ms
 * - YELLOW: reachable and latency 200ms..599ms
 * - ORANGE: reachable and latency >= 600ms
 */
object FarmHealthChecker {
    const val GREEN_THRESHOLD_MS = 200L
    const val YELLOW_THRESHOLD_MS = 600L
    const val DEFAULT_TIMEOUT_MS = 2500

    fun classify(reachable: Boolean, latencyMs: Long?): FarmHealthStatus {
        if (!reachable || latencyMs == null || latencyMs < 0L) {
            return FarmHealthStatus.RED
        }
        return when {
            latencyMs < GREEN_THRESHOLD_MS -> FarmHealthStatus.GREEN
            latencyMs < YELLOW_THRESHOLD_MS -> FarmHealthStatus.YELLOW
            else -> FarmHealthStatus.ORANGE
        }
    }

    fun probe(baseUrl: String, timeoutMs: Int = DEFAULT_TIMEOUT_MS): FarmHealthResult {
        val cleanBase = baseUrl.trim().trimEnd('/')
        if (cleanBase.isEmpty()) {
            return FarmHealthResult(FarmHealthStatus.RED, errorMessage = "Empty URL")
        }
        val healthUrl = "$cleanBase/api/health"
        var conn: HttpURLConnection? = null
        val startNs = System.nanoTime()
        return try {
            conn = (URL(healthUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                useCaches = false
                instanceFollowRedirects = true
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Cache-Control", "no-cache")
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            if (stream != null) {
                stream.use { it.readBytes() }
            }
            val elapsedMs = ((System.nanoTime() - startNs) / 1_000_000L).coerceAtLeast(0L)
            if (code in 200..299) {
                FarmHealthResult(
                    status = classify(reachable = true, latencyMs = elapsedMs),
                    latencyMs = elapsedMs,
                    httpCode = code
                )
            } else {
                FarmHealthResult(
                    status = FarmHealthStatus.RED,
                    latencyMs = null,
                    httpCode = code,
                    errorMessage = "HTTP $code"
                )
            }
        } catch (t: Throwable) {
            FarmHealthResult(
                status = FarmHealthStatus.RED,
                latencyMs = null,
                httpCode = null,
                errorMessage = t.message ?: t.javaClass.simpleName
            )
        } finally {
            conn?.disconnect()
        }
    }
}
