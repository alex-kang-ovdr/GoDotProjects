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

    @Test
    fun parsesSocialFriendsPartyMessagesAndLeaderboardOverHttp() {
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
                    val body = when {
                        path.startsWith("/api/mobile/social/friends") ->
                            """{"friends":[{"principalId":"u-2","displayName":"민준","handle":"minjun#1024","avatarColor":"#2563EB","presence":{"status":"in_game","online":true,"gameId":"survivor-arena-g2","gameTitle":"Survivor Arena G2","roomCode":"PLAY99","joinable":true},"lastMessage":"같이 가자!","lastMessageAt":"2026-11-21T06:00:00Z","lastMessageFromMe":false}],"incomingRequests":[{"principalId":"u-3","displayName":"서연","handle":"seoyeon#2048","avatarColor":"#7C3AED"}],"outgoingRequests":[]}"""
                        path.startsWith("/api/mobile/social/parties") ->
                            """{"party":{"id":"p-1","leaderId":"u-1","title":"주말 파티","targetGameId":"survivor-arena-g2","roomCode":"ABCD23","maxMembers":8,"inviteUrl":"https://dev.playhub.example.com/join/survivor-arena-g2?room=ABCD23","deepLinkUrl":"playhub://join/survivor-arena-g2?room=ABCD23","members":[{"principalId":"u-1","displayName":"민지","handle":"minji#1001","avatarColor":"#00B06F","role":"leader","ready":true,"presence":{"status":"online","online":true,"joinable":true}}]}}"""
                        path.startsWith("/api/mobile/social/messages") ->
                            """{"messages":[{"id":"m-1","senderId":"u-2","senderName":"민준","senderHandle":"minjun#1024","senderMe":false,"body":"안녕!","isQuickMessage":true,"createdAt":"2026-11-21T06:00:00Z"}]}"""
                        path.startsWith("/api/mobile/social/leaderboards/") ->
                            """{"entries":[{"rank":1,"principalId":"u-2","displayName":"민준","handle":"minjun#1024","avatarColor":"#2563EB","score":2850,"isMe":false}]}"""
                        else -> """{"ok":true}"""
                    }
                    val bytes = body.toByteArray(Charsets.UTF_8)
                    val header = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    s.getOutputStream().write(header.toByteArray(Charsets.UTF_8))
                    s.getOutputStream().write(bytes)
                    s.getOutputStream().flush()
                }
            }
        }
        try {
            val client = PlayHubApiClient("http://127.0.0.1:${server.localPort}")
            val social = client.fetchSocialFriends("tok-1")
            assertEquals(1, social.friends.size)
            assertEquals("minjun#1024", social.friends[0].handle)
            assertEquals("PLAY99", social.friends[0].presence.roomCode)
            assertEquals(1, social.incomingRequests.size)

            val party = client.createParty("tok-1", "주말 파티", "survivor-arena-g2")
            assertEquals("ABCD23", party.roomCode)
            assertEquals(1, party.members.size)
            assertTrue(party.members[0].ready)

            val msgs = client.fetchSocialMessages("tok-1", "dm", "u-2")
            assertEquals(1, msgs.size)
            assertTrue(msgs[0].isQuickMessage)

            val lb = client.fetchLeaderboard("tok-1", "survivor-arena-g2", "high_score", "global")
            assertEquals(1, lb.size)
            assertEquals(2850L, lb[0].score)
        } finally {
            server.close()
            worker.join(1000)
        }
    }
}
