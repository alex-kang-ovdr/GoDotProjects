package com.playhub.aos.network

import com.playhub.aos.compliance.GameAgeRating
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

class PlayHubApiClientTest {
    @Test
    fun parsesGuestAuthCatalogCompatibilityAndCloudSaveOverHttp() {
        val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
        val worker = thread(isDaemon = true) {
            while (!server.isClosed) {
                val sock = runCatching { server.accept() }.getOrNull() ?: break
                sock.use { s ->
                    val reader = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8))
                    val reqLine = reader.readLine() ?: return@use
                    val path = reqLine.split(" ").getOrNull(1).orEmpty()
                    var contentLength = 0
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.lowercase().startsWith("content-length:")) {
                            contentLength = line.substringAfter(":").trim().toIntOrNull() ?: 0
                        }
                    }
                    if (contentLength > 0) {
                        val buf = CharArray(contentLength)
                        reader.read(buf, 0, contentLength)
                    }
                    val (status, extraHeaders, body) = when {
                        path.startsWith("/api/mobile/auth/guest") -> Triple(
                            "201 Created",
                            "",
                            """{"accessToken":"tok-abc","refreshToken":"ref-xyz","profile":{"principalId":"u-1","displayName":"게스트 플레이어","handle":"@guest#0001","isGuest":true,"ageCompliance":{"ageTier":"UNKNOWN"}}}"""
                        )
                        path.startsWith("/api/mobile/catalog") -> Triple(
                            "200 OK",
                            "",
                            """{"forgeSupported":false,"games":[{"id":"survivor-arena-g2","title":"Survivor Arena G2","description":"3D survival","genre":"action","runtime":"godot-pck","buildId":"2.1.0-abc","ageRating":"12+","allowed":false,"entryUrl":"/games/survivor-arena-g2/index.html","compatibility":{"compatible":false,"reason":"ENGINE_UPDATE_REQUIRED","message":"업데이트 필요"},"android":{"engineVersion":"4.8.0","minAppVersionCode":1,"pckUrl":"/games/survivor-arena-g2/index.pck","pckBytes":1961420}}]}"""
                        )
                        else -> Triple(
                            "200 OK",
                            "ETag: \"r2\"\r\n",
                            """{"revision":2,"payload":{"score":777}}"""
                        )
                    }
                    val bytes = body.toByteArray(Charsets.UTF_8)
                    val header = "HTTP/1.1 $status\r\nContent-Type: application/json\r\n${extraHeaders}Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    s.getOutputStream().write(header.toByteArray(Charsets.UTF_8))
                    s.getOutputStream().write(bytes)
                    s.getOutputStream().flush()
                }
            }
        }
        try {
            val base = "http://127.0.0.1:${server.localPort}"
            val client = PlayHubApiClient(base)
            val tokens = client.createGuestSession()
            assertEquals("tok-abc", tokens.accessToken)
            assertTrue(tokens.isGuest)

            val games = client.fetchCatalog(tokens.accessToken, "4.7.2", 1)
            assertEquals(1, games.size)
            assertEquals("godot-pck", games[0].runtime)
            assertEquals(GameAgeRating.AGE_12, games[0].ageRating)
            assertFalse(games[0].allowed)
            assertEquals("4.8.0", games[0].requiredEngineVersion)
            assertEquals("$base/games/survivor-arena-g2/index.pck", games[0].pckUrl)

            val saved = client.writeCloudSave(tokens.accessToken, "survivor-arena-g2", """{"score":777}""", "\"r1\"")
            assertEquals(2, saved.revision)
            assertEquals("\"r2\"", saved.etag)
        } finally {
            server.close()
            worker.join(1000)
        }
    }
}
