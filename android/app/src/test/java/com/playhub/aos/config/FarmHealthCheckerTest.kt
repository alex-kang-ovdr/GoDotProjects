package com.playhub.aos.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import kotlin.concurrent.thread

class FarmHealthCheckerTest {

    @Test
    fun classifiesLatencyBoundariesAccurately() {
        // Unreachable / invalid -> RED
        assertEquals(FarmHealthStatus.RED, FarmHealthChecker.classify(reachable = false, latencyMs = 10L))
        assertEquals(FarmHealthStatus.RED, FarmHealthChecker.classify(reachable = true, latencyMs = null))
        assertEquals(FarmHealthStatus.RED, FarmHealthChecker.classify(reachable = true, latencyMs = -1L))

        // < 200ms -> GREEN
        assertEquals(FarmHealthStatus.GREEN, FarmHealthChecker.classify(reachable = true, latencyMs = 0L))
        assertEquals(FarmHealthStatus.GREEN, FarmHealthChecker.classify(reachable = true, latencyMs = 45L))
        assertEquals(FarmHealthStatus.GREEN, FarmHealthChecker.classify(reachable = true, latencyMs = 199L))

        // 200ms..599ms -> YELLOW
        assertEquals(FarmHealthStatus.YELLOW, FarmHealthChecker.classify(reachable = true, latencyMs = 200L))
        assertEquals(FarmHealthStatus.YELLOW, FarmHealthChecker.classify(reachable = true, latencyMs = 350L))
        assertEquals(FarmHealthStatus.YELLOW, FarmHealthChecker.classify(reachable = true, latencyMs = 599L))

        // >= 600ms -> ORANGE
        assertEquals(FarmHealthStatus.ORANGE, FarmHealthChecker.classify(reachable = true, latencyMs = 600L))
        assertEquals(FarmHealthStatus.ORANGE, FarmHealthChecker.classify(reachable = true, latencyMs = 1250L))
    }

    @Test
    fun formatsLabelsConsistently() {
        val green = FarmHealthResult(FarmHealthStatus.GREEN, latencyMs = 42L, httpCode = 200)
        assertEquals("GREEN · 42ms", green.badgeLabel())
        assertEquals("42ms", green.compactPillText())

        val yellow = FarmHealthResult(FarmHealthStatus.YELLOW, latencyMs = 310L, httpCode = 200)
        assertEquals("YELLOW · 310ms", yellow.badgeLabel())
        assertEquals("310ms", yellow.compactPillText())

        val orange = FarmHealthResult(FarmHealthStatus.ORANGE, latencyMs = 820L, httpCode = 200)
        assertEquals("ORANGE · 820ms", orange.badgeLabel())
        assertEquals("820ms", orange.compactPillText())

        val redNet = FarmHealthResult(FarmHealthStatus.RED, latencyMs = null, httpCode = null)
        assertEquals("RED · 접속 불가", redNet.badgeLabel())
        assertEquals("접속불가", redNet.compactPillText())

        val redHttp = FarmHealthResult(FarmHealthStatus.RED, latencyMs = null, httpCode = 503)
        assertEquals("RED · HTTP 503", redHttp.badgeLabel())
    }

    private fun withMockHealthServer(
        statusLine: String,
        delayMs: Long = 0L,
        body: String = """{"ok":true}""",
        block: (baseUrl: String) -> Unit
    ) {
        ServerSocket(0).use { server ->
            val port = server.localPort
            val worker = thread(start = true) {
                runCatching {
                    server.accept().use { sock ->
                        val reader = BufferedReader(InputStreamReader(sock.getInputStream()))
                        var line = reader.readLine()
                        while (!line.isNullOrEmpty()) {
                            line = reader.readLine()
                        }
                        if (delayMs > 0L) Thread.sleep(delayMs)
                        val bodyBytes = body.toByteArray(Charsets.UTF_8)
                        val resp = buildString {
                            append("HTTP/1.1 ").append(statusLine).append("\r\n")
                            append("Content-Type: application/json\r\n")
                            append("Content-Length: ").append(bodyBytes.size).append("\r\n")
                            append("Connection: close\r\n\r\n")
                        }
                        sock.getOutputStream().write(resp.toByteArray(Charsets.US_ASCII))
                        sock.getOutputStream().write(bodyBytes)
                        sock.getOutputStream().flush()
                    }
                }
            }
            block("http://127.0.0.1:$port")
            worker.join(3000)
        }
    }

    @Test
    fun probesFastServerAsGreen() {
        withMockHealthServer("200 OK", delayMs = 0L) { baseUrl ->
            val res = FarmHealthChecker.probe(baseUrl, timeoutMs = 2000)
            assertEquals(FarmHealthStatus.GREEN, res.status)
            assertEquals(200, res.httpCode)
            assertNotNull(res.latencyMs)
            assertTrue((res.latencyMs ?: 999L) < FarmHealthChecker.GREEN_THRESHOLD_MS)
        }
    }

    @Test
    fun probesModerateDelayServerAsYellow() {
        withMockHealthServer("200 OK", delayMs = 260L) { baseUrl ->
            val res = FarmHealthChecker.probe(baseUrl, timeoutMs = 2000)
            assertEquals(FarmHealthStatus.YELLOW, res.status)
            assertEquals(200, res.httpCode)
            assertNotNull(res.latencyMs)
            assertTrue((res.latencyMs ?: 0L) >= FarmHealthChecker.GREEN_THRESHOLD_MS)
        }
    }

    @Test
    fun probesSlowDelayServerAsOrange() {
        withMockHealthServer("200 OK", delayMs = 660L) { baseUrl ->
            val res = FarmHealthChecker.probe(baseUrl, timeoutMs = 2500)
            assertEquals(FarmHealthStatus.ORANGE, res.status)
            assertEquals(200, res.httpCode)
            assertNotNull(res.latencyMs)
            assertTrue((res.latencyMs ?: 0L) >= FarmHealthChecker.YELLOW_THRESHOLD_MS)
        }
    }

    @Test
    fun probesHttpErrorAndUnreachableAsRed() {
        withMockHealthServer("503 Service Unavailable", body = """{"ok":false}""") { baseUrl ->
            val res = FarmHealthChecker.probe(baseUrl, timeoutMs = 1500)
            assertEquals(FarmHealthStatus.RED, res.status)
            assertEquals(503, res.httpCode)
            assertNull(res.latencyMs)
        }

        // Closed ephemeral port -> RED
        val closedPort = ServerSocket(0).use { it.localPort }
        val unreachable = FarmHealthChecker.probe("http://127.0.0.1:$closedPort", timeoutMs = 800)
        assertEquals(FarmHealthStatus.RED, unreachable.status)
        assertNull(unreachable.httpCode)
        assertNull(unreachable.latencyMs)
    }
}
